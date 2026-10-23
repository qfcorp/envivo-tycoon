<?php
declare(strict_types=1);

// CENTRO DE CONTROL de EN VIVO Tycoon: /admin.php (usuario y clave de /etc/envivo/config.env: ENVIVO_ADMIN_USUARIO y
// ENVIVO_ADMIN_CLAVE_HASH; 10 claves malas = 10 minutos bloqueado).
// Pestañas: Resumen · Jugadores · Compras · Productos y precios · Mercado · Chat · Soporte · Transferencias · Ajustes · Auditoría.
// Todos los formularios llevan un código contra falsificación (CSRF) y solo se aceptan desde esta misma página.
// TODO lo que se hace aquí queda en la tabla "auditoria" (pestaña Auditoría).

require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Auditoria, Catalogo, Chat, Compras, Config, Cuentas, Db, Fallo, Filtro, Google, Http, Limite, Mercado, Monedero, Plux, Sesiones, Social, Soporte, Transferencias};

const PESTANAS = ['resumen' => 'Resumen', 'jugadores' => 'Jugadores', 'compras' => 'Compras', 'productos' => 'Productos y precios', 'mercado' => 'Mercado',
    'chat' => 'Chat', 'soporte' => 'Soporte', 'transferencias' => 'Transferencias', 'ajustes' => 'Ajustes', 'auditoria' => 'Auditoría'];

try {
    Db::pdo();
    admin_auth();
    if ((string) ($_GET['a'] ?? '') === 'csv') admin_csv();
    $mensaje = null;
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        try { $mensaje = admin_post(); }
        catch (Fallo $e) { $mensaje = ['error', $e->getMessage()]; }
        Catalogo::olvidarAjustes();
    }
    $t = (string) ($_GET['t'] ?? 'resumen');
    admin_pantalla(isset(PESTANAS[$t]) ? $t : 'resumen', $mensaje);
} catch (\Throwable $e) {
    error_log('EN VIVO admin: ' . get_class($e) . ' ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 300));
    Http::pagina(500, 'Error', 'Ocurrió un error en el panel. Revisa el registro de PHP.', '/admin.php', 'Volver al panel');
}

// =====================================================================================================  acceso
function admin_auth(): void
{
    $usu = Config::get('ENVIVO_ADMIN_USUARIO');
    $hash = Config::get('ENVIVO_ADMIN_CLAVE_HASH');
    if ($usu === '' || $hash === '') Http::pagina(503, 'Panel sin configurar', 'Falta ENVIVO_ADMIN_USUARIO o ENVIVO_ADMIN_CLAVE_HASH en /etc/envivo/config.env (corre otra vez deploy/instalar.sh).');
    $u = (string) ($_SERVER['PHP_AUTH_USER'] ?? ''); $c = (string) ($_SERVER['PHP_AUTH_PW'] ?? '');
    $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
    if ($u === '' && preg_match('/^Basic\s+([A-Za-z0-9+\/=]+)$/i', $auth, $m)) [$u, $c] = array_pad(explode(':', (string) base64_decode($m[1]), 2), 2, '');
    $clave = 'admin:' . Http::ip();
    if (Limite::excedido($clave, 10)) Http::pagina(429, 'Demasiados intentos', 'Espera 10 minutos e intenta de nuevo.', '/admin.php', 'Reintentar');
    if ($u === '' || !hash_equals($usu, $u) || !password_verify($c, $hash)) {
        if ($u !== '') Limite::sumar($clave);
        header('WWW-Authenticate: Basic realm="EN VIVO Tycoon - panel", charset="UTF-8"');
        Http::pagina(401, 'Necesitas entrar', 'Escribe el usuario y la clave del panel.', '/admin.php', 'Intentar otra vez');
    }
}

function quien(): string { return 'admin:' . mb_substr(Config::get('ENVIVO_ADMIN_USUARIO'), 0, 40); }

/** Código CSRF: cambia cada día (se acepta el de hoy y el de ayer) y depende de la clave del panel. */
function admin_csrf(int $diasAtras = 0): string
{
    return hash_hmac('sha256', 'envivo-admin-' . date('Y-m-d', time() - $diasAtras * 86400), Config::get('ENVIVO_ADMIN_CLAVE_HASH'));
}

function admin_fecha(?int $t): string { return $t ? date('Y-m-d H:i', $t) : ''; }
function e(?string $t): string { return Http::e($t); }
function n(int|float $x, int $dec = 0): string { return number_format((float) $x, $dec, ',', '.'); }
function post_s(string $k, int $max = 300): string { return mb_substr(trim((string) ($_POST[$k] ?? '')), 0, $max); }
function post_int(string $k): int { $v = filter_var($_POST[$k] ?? '', FILTER_VALIDATE_INT); return $v === false ? 0 : (int) $v; }
function get_s(string $k): string { return is_string($_GET[$k] ?? null) ? trim($_GET[$k]) : ''; }
function url(string $t, array $p = []): string { return '/admin.php?' . http_build_query(['t' => $t] + $p); }
function enlace_jugador(?int $id, ?string $texto): string { return $id ? '<a href="' . e(url('jugadores', ['id' => $id])) . '">' . e($texto ?: ('N° ' . $id)) . '</a>' : '—'; }
function enlace_compra(?int $id): string { return $id ? '<a href="' . e(url('compras', ['id' => $id])) . '">N° ' . $id . '</a>' : '—'; }
function nombre_producto(string $id): string { return Catalogo::productoCompra($id)['nombre'] ?? $id; }

function ocultos(string $accion): string { return '<input type="hidden" name="csrf" value="' . e(admin_csrf()) . '"><input type="hidden" name="accion" value="' . e($accion) . '">'; }
/** $tab = query de la pestaña a la que vuelve (ej. "chat" o "jugadores&id=3"). */
function form_abrir(string $accion, string $tab, string $clase = 'form-fila'): string { return '<form method="post" action="/admin.php?t=' . e($tab) . '" class="' . $clase . '">' . ocultos($accion); }
/** Un formulario de un solo botón (con el código de protección). */
function boton(string $accion, array $campos, string $texto, string $clase, string $tab): string
{
    $h = form_abrir($accion, $tab, 'en-linea');
    foreach ($campos as $k => $v) $h .= '<input type="hidden" name="' . e($k) . '" value="' . e((string) $v) . '">';
    return $h . '<button class="' . $clase . ' chico" type="submit">' . e($texto) . '</button></form>';
}

// =====================================================================================================  acciones (POST)
function admin_post(): array
{
    $origen = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origen !== '' && $origen !== Http::urlBase()) return ['error', 'Petición no permitida.'];
    $tok = (string) ($_POST['csrf'] ?? '');
    if (!hash_equals(admin_csrf(), $tok) && !hash_equals(admin_csrf(1), $tok)) return ['error', 'La página estuvo abierta mucho tiempo. Recárgala e intenta de nuevo.'];
    $acc = (string) ($_POST['accion'] ?? 'creditos');
    return match ($acc) {
        'creditos' => admin_dar_creditos(),
        'ocultar', 'mostrar', 'resolver', 'descartar' => admin_mensaje($acc),
        'silenciar', 'expulsar_chat', 'levantar' => admin_sancion($acc),
        'palabra_agregar', 'palabra_quitar' => admin_palabra($acc),
        'cuenta_estado' => admin_cuenta_estado(),
        'cerrar_sesiones' => admin_cerrar_sesiones(),
        'revertir' => admin_revertir(),
        'producto_guardar', 'producto_restaurar' => admin_producto($acc),
        'oferta_crear', 'oferta_terminar' => admin_oferta($acc),
        'mercado_congelar', 'mercado_descongelar', 'mercado_quitar' => admin_mercado_moderar(substr($acc, 8)),
        'soporte_responder', 'soporte_cerrar', 'soporte_reabrir' => admin_soporte($acc),
        'respuesta_guardar', 'respuesta_borrar' => admin_respuesta($acc),
        'transferencia_cancelar' => admin_transferencia(),
        'mantenimiento', 'anuncio', 'abuso' => admin_ajustes($acc),
        default => ['error', 'Acción desconocida.'],
    };
}

/** Ocultar / volver a mostrar un mensaje del chat, o cerrar sus reportes. */
function admin_mensaje(string $acc): array
{
    $id = post_int('mensaje_id');
    $m = Db::fila('SELECT * FROM chat_mensajes WHERE id = ?', [$id]);
    if (!$m) return ['error', 'Ese mensaje ya no existe (se borra a los 30 días).'];
    $t = time();
    if ($acc === 'ocultar') { Db::q('UPDATE chat_mensajes SET oculto = 1 WHERE id = ?', [$id]); Db::q("UPDATE chat_reportes SET estado = 'resuelto', resuelto_en = ? WHERE mensaje_id = ? AND estado = 'pendiente'", [$t, $id]); }
    elseif ($acc === 'mostrar') { Db::q('UPDATE chat_mensajes SET oculto = 0 WHERE id = ?', [$id]); Db::q("UPDATE chat_reportes SET estado = 'descartado', resuelto_en = ? WHERE mensaje_id = ? AND estado = 'pendiente'", [$t, $id]); }
    else Db::q('UPDATE chat_reportes SET estado = ?, resuelto_en = ? WHERE mensaje_id = ? AND estado = ?', [$acc === 'resolver' ? 'resuelto' : 'descartado', $t, $id, 'pendiente']);
    Auditoria::anotar(quien(), 'chat_' . $acc, 'Mensaje N° ' . $id . ': ' . mb_substr((string) $m['texto'], 0, 200), $m['jugador_id'] === null ? null : (int) $m['jugador_id']);
    return ['ok', match ($acc) { 'ocultar' => 'Mensaje N° ' . $id . ' oculto.', 'mostrar' => 'Mensaje N° ' . $id . ' visible otra vez.', default => 'Reportes del mensaje N° ' . $id . ' cerrados.' }];
}

/** Silenciar 1 h / 24 h / 7 días, expulsar del chat o levantar las sanciones de un jugador. */
function admin_sancion(string $acc): array
{
    $j = Cuentas::porId(post_int('jugador_id'));
    if (!$j) return ['error', 'Ese jugador no existe.'];
    $quien = Social::nombrePublico($j['alias'], $j['nombre']) . ' (' . $j['email'] . ')';
    if ($acc === 'levantar') {
        $n = Chat::levantar((int) $j['id']);
        Auditoria::anotar(quien(), 'chat_levantar', "$n sanciones levantadas", (int) $j['id']);
        return ['ok', 'Se levantaron ' . $n . ' sanciones de ' . $quien . '.'];
    }
    $motivo = post_s('motivo', 200) ?: 'Incumplir las reglas del chat';
    if ($acc === 'expulsar_chat') {
        Chat::sancionar((int) $j['id'], 'expulsion', null, $motivo);
        Auditoria::anotar(quien(), 'chat_expulsar', $motivo, (int) $j['id']);
        return ['ok', $quien . ' fue expulsado del chat.'];
    }
    $dur = ['1h' => 3600, '24h' => 86400, '7d' => 7 * 86400][(string) ($_POST['duracion'] ?? '')] ?? null;
    if ($dur === null) return ['error', 'Elige 1 h, 24 h o 7 días.'];
    Chat::sancionar((int) $j['id'], 'silencio', $dur, $motivo);
    Auditoria::anotar(quien(), 'chat_silenciar', ($_POST['duracion'] ?? '') . ': ' . $motivo, (int) $j['id']);
    return ['ok', $quien . ' no podrá escribir en el chat por ' . ($dur >= 86400 ? intdiv($dur, 86400) . ' día(s)' : '1 hora') . '.'];
}

function admin_palabra(string $acc): array
{
    $w = Filtro::limpiarPalabra((string) ($_POST['palabra'] ?? ''));
    if ($w === '' || mb_strlen($w) < 2 || mb_strlen($w) > 40) return ['error', 'Escribe una palabra (2 a 40 letras; sin números).'];
    if ($acc === 'palabra_agregar') {
        Db::q('INSERT OR IGNORE INTO chat_palabras (palabra, creado) VALUES (?, ?)', [$w, time()]);
        Filtro::olvidarLista();
        Auditoria::anotar(quien(), 'palabra_agregar', $w);
        return ['ok', '"' . $w . '" agregada a la lista de palabras prohibidas.'];
    }
    $n = Db::q('DELETE FROM chat_palabras WHERE palabra = ?', [$w])->rowCount();
    Filtro::olvidarLista();
    if ($n) Auditoria::anotar(quien(), 'palabra_quitar', $w);
    return $n ? ['ok', '"' . $w . '" quitada de la lista.'] : ['error', '"' . $w . '" no estaba en la lista.'];
}

/** Dar o quitar créditos a mano: queda en el libro con motivo 'manual' y en la auditoría. */
function admin_dar_creditos(): array
{
    $email = trim((string) ($_POST['email'] ?? ''));
    $cant = filter_var($_POST['creditos'] ?? '', FILTER_VALIDATE_INT);
    $nota = post_s('nota', 150);
    $j = Cuentas::porEmail($email);
    if (!$j) return ['error', 'No hay ningún jugador con el correo ' . $email . '.'];
    if ($cant === false || $cant === 0 || abs($cant) > 100000) return ['error', 'Escribe una cantidad de créditos (entre -100000 y 100000, distinta de 0).'];
    if ($nota === '') return ['error', 'Escribe el motivo (ej. "compra N° 12 no llegó" o "devolución").'];
    try {
        $saldo = Monedero::mover((int) $j['id'], $cant, 'manual', 'admin:' . $nota);
    } catch (\RuntimeException $e) {
        return ['error', 'No se pudo: ' . $e->getMessage() . ' (saldo actual: ' . Monedero::saldo((int) $j['id']) . ').'];
    }
    Auditoria::anotar(quien(), $cant > 0 ? 'creditos_dar' : 'creditos_quitar', abs($cant) . ' créditos: ' . $nota . ' (saldo nuevo ' . $saldo . ')', (int) $j['id']);
    return ['ok', ($cant > 0 ? 'Se dieron ' : 'Se quitaron ') . abs($cant) . ' créditos a ' . $j['email'] . '. Saldo nuevo: ' . $saldo . '.'];
}

function admin_cuenta_estado(): array
{
    $j = Cuentas::porId(post_int('jugador_id'));
    if (!$j) return ['error', 'Ese jugador no existe.'];
    $estado = post_s('estado', 20);
    $motivo = post_s('motivo', 300);
    if ($estado !== 'activo' && $motivo === '') return ['error', 'Escribe el motivo.'];
    Cuentas::cambiarEstado((int) $j['id'], $estado, $motivo, quien());
    return ['ok', 'La cuenta ' . $j['email'] . ' ahora está: ' . $estado . '.'];
}

function admin_cerrar_sesiones(): array
{
    $j = Cuentas::porId(post_int('jugador_id'));
    if (!$j) return ['error', 'Ese jugador no existe.'];
    $n = Sesiones::revocarTodas((int) $j['id']);
    Auditoria::anotar(quien(), 'sesiones_cerrar', "$n sesiones cerradas", (int) $j['id']);
    return ['ok', "Se cerraron $n sesiones de " . $j['email'] . '.'];
}

/** Reembolso o contracargo de una compra pagada (D). */
function admin_revertir(): array
{
    $id = post_int('compra_id');
    $tipo = post_s('tipo', 20);
    if (!in_array($tipo, ['reembolso', 'contracargo'], true)) return ['error', 'Elige reembolso o contracargo.'];
    $motivo = post_s('motivo', 300);
    if ($motivo === '') return ['error', 'Escribe el motivo (ej. "contracargo del banco 23/10").'];
    $r = Compras::revertir($id, $tipo, $motivo, quien());
    if ($r === null) return ['error', 'La compra N° ' . $id . ' no está pagada (o ya se revirtió).'];
    return ['ok', 'Compra N° ' . $id . ' revertida (' . $tipo . '): ' . $r['creditos'] . ' créditos descontados, ' . $r['equipos_quitados'] . ' equipos quitados'
        . ($r['equipos_ya_vendidos'] ? ', ' . $r['equipos_ya_vendidos'] . ' ya vendidos a otros (no se quitan)' : '') . ($r['vip'] ? ', VIP descontado' : '') . ($r['tarjeta'] ? ', tarjeta descontada' : '') . '. La cuenta quedó suspendida.'];
}

function admin_producto(string $acc): array
{
    $id = post_s('producto', 40);
    $base = Catalogo::PRODUCTOS[$id] ?? null;
    if (!$base) return ['error', 'Ese producto no existe.'];
    if ($acc === 'producto_restaurar') {
        Db::q('DELETE FROM productos_ajustes WHERE producto = ?', [$id]);
        Auditoria::anotar(quien(), 'producto_restaurar', $id . ' vuelve a los valores de Catalogo.php');
        return ['ok', $base['nombre'] . ': valores originales restaurados.'];
    }
    $precio = str_replace(',', '.', post_s('precio', 12));
    if (!preg_match('/^\d{1,3}(\.\d{1,2})?$/', $precio) || (float) $precio < 0.5) return ['error', 'El precio debe ser de $0,50 a $999,99 (con IVA incluido), ej. 4.99'];
    $cred = filter_var($_POST['creditos'] ?? '', FILTER_VALIDATE_INT);
    if ($cred === false || $cred < 0 || $cred > 1000000) return ['error', 'Los créditos deben ser un número entero de 0 a 1.000.000.'];
    $activo = isset($_POST['activo']) ? 1 : 0;
    $antes = Catalogo::producto($id);
    Db::q('INSERT INTO productos_ajustes (producto, precio, creditos, activo, actualizado) VALUES (?, ?, ?, ?, ?) ON CONFLICT (producto) DO UPDATE SET precio = excluded.precio, creditos = excluded.creditos, activo = excluded.activo, actualizado = excluded.actualizado',
        [$id, round((float) $precio, 2), (int) $cred, $activo, time()]);
    Auditoria::anotar(quien(), 'producto_editar', $id . ': precio ' . $antes['precio'] . ' -> ' . round((float) $precio, 2) . ', créditos ' . $antes['creditos_base'] . ' -> ' . $cred . ', activo ' . (int) $antes['activo'] . ' -> ' . $activo);
    return ['ok', $base['nombre'] . ' guardado: $' . n((float) $precio, 2) . ', ' . n($cred) . ' créditos, ' . ($activo ? 'activo' : 'apagado') . '.'];
}

function admin_oferta(string $acc): array
{
    if ($acc === 'oferta_terminar') {
        $id = post_int('oferta_id');
        $n = Db::q('UPDATE ofertas SET activa = 0 WHERE id = ?', [$id])->rowCount();
        if ($n) Auditoria::anotar(quien(), 'oferta_terminar', 'Oferta N° ' . $id);
        return $n ? ['ok', 'Oferta N° ' . $id . ' terminada.'] : ['error', 'Esa oferta no existe.'];
    }
    $p = post_s('producto', 40);
    $prod = Catalogo::producto($p);
    if (!$prod || (int) $prod['creditos_base'] <= 0) return ['error', 'Las ofertas de % extra son para productos que dan créditos.'];
    $pct = post_int('bono_pct');
    if ($pct < 1 || $pct > 300) return ['error', 'El bono debe ser de 1 % a 300 %.'];
    $ini = strtotime(post_s('inicio', 20) ?: 'now');
    $fin = strtotime(post_s('fin', 20));
    if ($ini === false || $fin === false || $fin <= $ini || $fin <= time()) return ['error', 'Revisa las fechas: el fin debe ser después del inicio y en el futuro.'];
    Db::q('INSERT INTO ofertas (producto, bono_pct, inicio, fin, activa, creado) VALUES (?, ?, ?, ?, 1, ?)', [$p, $pct, $ini, $fin, time()]);
    Auditoria::anotar(quien(), 'oferta_crear', 'Oferta N° ' . Db::ultimoId() . ": $p +$pct % créditos del " . admin_fecha($ini) . ' al ' . admin_fecha($fin));
    return ['ok', 'Oferta creada: ' . $prod['nombre'] . " +$pct % de créditos hasta el " . admin_fecha($fin) . '.'];
}

function admin_mercado_moderar(string $acc): array
{
    $estado = Mercado::moderar(post_int('publicacion_id'), $acc, quien());
    return ['ok', 'Publicación N° ' . post_int('publicacion_id') . ': ahora está ' . $estado . '.'];
}

function admin_soporte(string $acc): array
{
    $caso = post_int('caso_id');
    if ($acc === 'soporte_responder') {
        $texto = post_s('texto', 2000);
        if ($texto === '' && post_int('rapida_id') > 0) $texto = (string) Db::valor('SELECT texto FROM soporte_respuestas WHERE id = ?', [post_int('rapida_id')]);
        Soporte::responderSoporte($caso, $texto, quien(), isset($_POST['cerrar']));
        return ['ok', 'Respuesta enviada al caso N° ' . $caso . (isset($_POST['cerrar']) ? ' (cerrado).' : '.')];
    }
    Soporte::cambiarEstado($caso, $acc === 'soporte_cerrar' ? 'cerrado' : 'abierto', quien());
    return ['ok', 'Caso N° ' . $caso . ($acc === 'soporte_cerrar' ? ' cerrado.' : ' reabierto.')];
}

function admin_respuesta(string $acc): array
{
    $id = post_int('rapida_id');
    if ($acc === 'respuesta_borrar') { Soporte::borrarRespuestaRapida($id, quien()); return ['ok', 'Respuesta rápida borrada.']; }
    $r = Soporte::guardarRespuestaRapida($id > 0 ? $id : null, post_s('titulo', 200), post_s('texto', 3000), quien());
    return ['ok', 'Respuesta rápida "' . $r['titulo'] . '" guardada.'];
}

function admin_transferencia(): array
{
    $id = post_int('transferencia_id');
    Transferencias::cancelar($id, quien());
    return ['ok', 'Transferencia N° ' . $id . ' cancelada.'];
}

function admin_ajustes(string $acc): array
{
    if ($acc === 'mantenimiento') {
        $on = isset($_POST['activo']) ? '1' : '0';
        Ajustes::set('mantenimiento', $on);
        Ajustes::set('mantenimiento_mensaje', post_s('mensaje', 300));
        Auditoria::anotar(quien(), 'mantenimiento', $on === '1' ? 'Tienda EN MANTENIMIENTO: ' . post_s('mensaje', 300) : 'Tienda abierta');
        return ['ok', $on === '1' ? 'La tienda quedó en mantenimiento: no se puede comprar.' : 'La tienda está abierta otra vez.'];
    }
    if ($acc === 'abuso') {
        $n = max(1, min(20, post_int('abuso_reembolsos'))); $d = max(1, min(3650, post_int('abuso_dias')));
        Ajustes::set('abuso_reembolsos', (string) $n);
        Ajustes::set('abuso_dias', (string) $d);
        Ajustes::set('abuso_contracargo_banea', isset($_POST['contracargo_banea']) ? '1' : '0');
        Auditoria::anotar(quien(), 'abuso_reglas', "Baneo con $n reembolsos en $d días; contracargo banea: " . (isset($_POST['contracargo_banea']) ? 'sí' : 'no'));
        return ['ok', 'Reglas de abuso de reembolsos guardadas.'];
    }
    $txt = post_s('texto', 300);
    $tipo = in_array(post_s('tipo', 10), ['info', 'aviso', 'evento'], true) ? post_s('tipo', 10) : 'info';
    $hasta = post_s('hasta', 20);
    $h = $hasta === '' ? '' : (string) (strtotime($hasta) ?: '');
    Ajustes::set('anuncio_texto', $txt);
    Ajustes::set('anuncio_tipo', $tipo);
    Ajustes::set('anuncio_hasta', $h);
    Auditoria::anotar(quien(), 'anuncio', $txt === '' ? 'Anuncio quitado' : "[$tipo] $txt" . ($h !== '' ? ' (hasta ' . admin_fecha((int) $h) . ')' : ''));
    return ['ok', $txt === '' ? 'Anuncio quitado.' : 'Anuncio publicado en el juego.'];
}

// =====================================================================================================  CSV para el SRI
/** Evita que Excel ejecute fórmulas escritas por un comprador. */
function csv_seguro(mixed $v): string
{
    $s = (string) $v;
    return $s !== '' && strpbrk($s[0], "=+-@\t\r") !== false ? "'" . $s : $s;
}

/** Filtros de la pestaña Compras (y del CSV): estado, canal, producto, búsqueda y fechas. */
function filtro_compras(): array
{
    $w = []; $p = [];
    $estado = get_s('estado');
    if (in_array($estado, ['pagado', 'pendiente', 'rechazado', 'revertido'], true)) { $w[] = 'c.estado = ?'; $p[] = $estado; }
    $canal = get_s('canal');
    if (in_array($canal, ['web_plux', 'google_play'], true)) { $w[] = 'c.canal = ?'; $p[] = $canal; }
    $prod = get_s('producto');
    if ($prod !== '' && Catalogo::productoCompra($prod) !== null) { $w[] = 'c.producto = ?'; $p[] = $prod; }
    $q = get_s('q');
    if ($q !== '') { $w[] = "(j.email LIKE ? ESCAPE '\\' OR c.comprador_cedula LIKE ? ESCAPE '\\' OR c.comprador_nombre LIKE ? ESCAPE '\\' OR c.plux_transaccion = ? OR c.google_order_id = ?)"; $l = '%' . addcslashes($q, '%_\\') . '%'; array_push($p, $l, $l, $l, $q, $q); }
    $desde = get_s('desde');
    if ($desde !== '' && strtotime($desde)) { $w[] = 'COALESCE(c.pagado_en, c.creado) >= ?'; $p[] = strtotime($desde); }
    $hasta = get_s('hasta');
    if ($hasta !== '' && strtotime($hasta)) { $w[] = 'COALESCE(c.pagado_en, c.creado) < ?'; $p[] = strtotime($hasta) + 86400; }
    return [$w ? ' WHERE ' . implode(' AND ', $w) : '', $p];
}

function admin_csv(): never
{
    [$w, $p] = filtro_compras();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="compras-envivo-' . (preg_replace('/\W/', '', get_s('estado')) ?: 'todas') . '-' . date('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    Auditoria::anotar(quien(), 'csv_compras', 'Exportó compras ' . json_encode(array_diff_key($_GET, ['a' => 1]), JSON_UNESCAPED_UNICODE));
    $f = fopen('php://output', 'w');
    fwrite($f, "\xEF\xBB\xBF");   // para que Excel lea las tildes
    fputcsv($f, ['N°', 'Fecha', 'Pagado en', 'Estado', 'Producto', 'Subtotal', 'IVA', 'Total', 'Cédula', 'Nombre', 'Correo', 'Celular', 'Cuenta del jugador', 'Transacción', 'Canal'], ';', '"', '');
    foreach (Db::todas('SELECT c.*, j.email AS jugador_email FROM compras c JOIN jugadores j ON j.id = c.jugador_id' . $w . ' ORDER BY c.id DESC', $p) as $c) {
        fputcsv($f, array_map('csv_seguro', [$c['id'], admin_fecha((int) $c['creado']), admin_fecha($c['pagado_en'] !== null ? (int) $c['pagado_en'] : null), $c['estado'],
            nombre_producto((string) $c['producto']), number_format((float) $c['subtotal'], 2, '.', ''), number_format((float) $c['iva'], 2, '.', ''), number_format((float) $c['total'], 2, '.', ''),
            $c['comprador_cedula'], $c['comprador_nombre'], $c['comprador_email'], $c['comprador_telefono'], $c['jugador_email'], $c['plux_transaccion'] ?? $c['google_order_id'], $c['canal']]), ';', '"', '');
    }
    fclose($f);
    exit;
}

// =====================================================================================================  pantalla
function admin_pantalla(string $tab, ?array $mensaje): never
{
    Http::cabecerasPagina();
    echo Http::inicioHtml('Centro de Control');
    echo '<main class="caja ancha"><div class="marca">EN VIVO <b>Tycoon</b> · Centro de Control</div><nav class="tabs" aria-label="Secciones">';
    $burbujas = ['soporte' => (int) Db::valor("SELECT COUNT(*) FROM soporte_casos WHERE estado = 'abierto'"),
                 'chat' => (int) Db::valor("SELECT COUNT(DISTINCT mensaje_id) FROM chat_reportes WHERE estado = 'pendiente'"),
                 'transferencias' => (int) Db::valor("SELECT COUNT(*) FROM transferencias WHERE estado IN ('pendiente_pago', 'pagada')")];
    foreach (PESTANAS as $k => $nom) echo '<a href="' . e(url($k)) . '"' . ($k === $tab ? ' class="activo" aria-current="page"' : '') . '>' . e($nom) . (($burbujas[$k] ?? 0) > 0 ? ' <span class="burbuja">' . $burbujas[$k] . '</span>' : '') . '</a>';
    echo '</nav>';
    if (Ajustes::mantenimiento()) echo '<div class="aviso aviso-error"><b>Tienda en mantenimiento:</b> nadie puede comprar. Cámbialo en Ajustes.</div>';
    if ($mensaje) echo '<div class="aviso aviso-' . ($mensaje[0] === 'ok' ? 'ok' : 'error') . '" id="mensaje">' . e($mensaje[1]) . '</div>';
    ('tab_' . $tab)();
    echo '<p class="pie"><a href="/">← Ir al juego</a></p></main></body></html>';
    exit;
}

function ventas(int $desde, ?string $canal = null): array
{
    $sql = "SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t, COALESCE(SUM(subtotal), 0) AS s, COUNT(DISTINCT jugador_id) AS pagadores FROM compras WHERE estado = 'pagado' AND pagado_en >= ?";
    $p = [$desde];
    if ($canal !== null) { $sql .= ' AND canal = ?'; $p[] = $canal; }
    return Db::fila($sql, $p);
}

function tabla_avisos(): void
{
    $av = Db::todas('SELECT * FROM avisos ORDER BY id DESC LIMIT 20');
    echo '<h2>Avisos del sistema</h2>';
    if (!$av) { echo '<p class="tenue">Nada para revisar.</p>'; return; }
    echo '<div class="tabla"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Compra</th><th>Detalle</th></tr></thead><tbody>';
    foreach ($av as $a) echo '<tr><td>' . e(admin_fecha((int) $a['creado'])) . '</td><td>' . e($a['tipo']) . '</td><td>' . enlace_compra($a['compra_id'] === null ? null : (int) $a['compra_id']) . '</td><td class="largo">' . e(mb_substr((string) $a['detalle'], 0, 400)) . '</td></tr>';
    echo '</tbody></table></div>';
}

function tab_resumen(): void
{
    $hoy = strtotime('today'); $d7 = strtotime('-6 days', $hoy); $mes = strtotime(date('Y-m-01 00:00:00')); $d30 = strtotime('-29 days', $hoy);
    $tarjeta = fn(string $tit, array $v, string $id) => '<div class="tarjeta"><span class="tenue">' . e($tit) . '</span><b id="' . $id . '">' . e(Http::dinero($v['t'])) . '</b><span class="tenue">' . (int) $v['n'] . ' compras · ' . (int) $v['pagadores'] . ' pagadores · sin IVA ' . e(Http::dinero($v['s'])) . '</span></div>';
    $vMes = ventas($mes);
    $jug = (int) Db::valor('SELECT COUNT(*) FROM jugadores');
    $nuevosHoy = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE creado >= ?', [$hoy]);
    $nuevos7 = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE creado >= ?', [$d7]);
    $dau = (int) Db::valor('SELECT COUNT(*) FROM actividad WHERE dia = ?', [date('Y-m-d')]);
    $mau = (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM actividad WHERE dia >= ?', [date('Y-m-d', $d30)]);
    $vip = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE vip_hasta > ?', [time()]);
    $arppu = (int) $vMes['pagadores'] > 0 ? (float) $vMes['t'] / (int) $vMes['pagadores'] : 0.0;
    echo '<h1>Resumen</h1><div class="tarjetas">' . $tarjeta('Hoy', ventas($hoy), 'ventas-hoy') . $tarjeta('Últimos 7 días', ventas($d7), 'ventas-7d') . $tarjeta('Este mes', $vMes, 'ventas-mes') . $tarjeta('Total', ventas(0), 'ventas-total')
       . '<div class="tarjeta"><span class="tenue">Jugadores</span><b id="num-jugadores">' . $jug . '</b><span class="tenue">nuevos: <span id="nuevos-hoy">' . $nuevosHoy . '</span> hoy · ' . $nuevos7 . ' en 7 días · ' . $vip . ' con VIP</span></div>'
       . '<div class="tarjeta"><span class="tenue">Activos (DAU / MAU)</span><b id="dau-mau">' . $dau . ' / ' . $mau . '</b><span class="tenue">hoy / últimos 30 días</span></div>'
       . '<div class="tarjeta"><span class="tenue">ARPPU del mes</span><b id="arppu">' . e(Http::dinero($arppu)) . '</b><span class="tenue">' . (int) $vMes['pagadores'] . ' jugadores pagaron este mes</span></div>'
       . '<div class="tarjeta"><span class="tenue">Para atender</span><b id="casos-abiertos">' . (int) Db::valor("SELECT COUNT(*) FROM soporte_casos WHERE estado = 'abierto'") . '</b><span class="tenue">casos de soporte abiertos · ' . (int) Db::valor("SELECT COUNT(DISTINCT mensaje_id) FROM chat_reportes WHERE estado = 'pendiente'") . ' reportes del chat</span></div></div>';
    echo '<p class="tenue">Pago Plux: <b>' . e(Plux::ambiente()) . '</b>' . (Plux::configurado() ? '' : ' · <b>sin credenciales</b>') . ' · Google Play: <b>' . (Google::configurado() ? 'configurado' : 'sin configurar') . '</b>. Solo se suman las compras pagadas (las revertidas no).</p>';
    echo '<h2>Por canal</h2><div class="tabla"><table id="tabla-canales"><thead><tr><th>Canal</th><th>Hoy</th><th>7 días</th><th>Mes</th><th>Total</th></tr></thead><tbody>';
    foreach (['web_plux' => 'Web (Pago Plux)', 'google_play' => 'Google Play'] as $c => $nom) {
        echo '<tr><td>' . e($nom) . '</td>';
        foreach ([$hoy, $d7, $mes, 0] as $d) { $v = ventas($d, $c); echo '<td>' . e(Http::dinero($v['t'])) . ' <span class="tenue">(' . (int) $v['n'] . ')</span></td>'; }
        echo '</tr>';
    }
    echo '</tbody></table></div>';
    echo '<h2>Más vendidos del mes</h2><div class="tabla"><table id="tabla-mas-vendidos"><thead><tr><th>Producto</th><th>Compras</th><th>Ingreso</th></tr></thead><tbody>';
    $mv = Db::todas("SELECT producto, COUNT(*) AS n, SUM(total) AS t FROM compras WHERE estado = 'pagado' AND pagado_en >= ? GROUP BY producto ORDER BY t DESC, n DESC", [$mes]);
    if (!$mv) echo '<tr><td colspan="3" class="tenue">Sin ventas este mes.</td></tr>';
    foreach ($mv as $m) echo '<tr><td>' . e(nombre_producto((string) $m['producto'])) . '</td><td>' . (int) $m['n'] . '</td><td>' . e(Http::dinero($m['t'])) . '</td></tr>';
    echo '</tbody></table></div>';
    echo '<h2>Créditos de los últimos 30 días</h2>';
    $mov = Db::todas('SELECT motivo, SUM(CASE WHEN cambio > 0 THEN cambio ELSE 0 END) AS entra, SUM(CASE WHEN cambio < 0 THEN -cambio ELSE 0 END) AS sale FROM movimientos_creditos WHERE creado >= ? GROUP BY motivo ORDER BY motivo', [$d30]);
    $quemados = (int) Db::valor("SELECT COALESCE(SUM(comision), 0) FROM mercado_publicaciones WHERE estado = 'vendida' AND cerrado >= ?", [$d30]);
    $em = 0; $gas = 0;
    $txt = ['compra' => 'Comprados con dinero', 'manual' => 'Dados / quitados a mano', 'vip_bono' => 'Bono VIP diario', 'tarjeta_mensual' => 'Tarjeta mensual', 'gasto' => 'Canjes de la tienda',
            'mercado_compra' => 'Pagados en el mercado', 'mercado_venta' => 'Recibidos en el mercado', 'reversion' => 'Quitados por reembolso'];
    echo '<div class="tabla"><table id="tabla-creditos"><thead><tr><th>Motivo</th><th>Emitidos (+)</th><th>Gastados (−)</th></tr></thead><tbody>';
    foreach ($mov as $m) {
        if (!str_starts_with((string) $m['motivo'], 'mercado_')) { $em += (int) $m['entra']; $gas += (int) $m['sale']; }
        echo '<tr><td>' . e($txt[$m['motivo']] ?? $m['motivo']) . '</td><td>' . n((int) $m['entra']) . '</td><td>' . n((int) $m['sale']) . '</td></tr>';
    }
    echo '<tr><td><b>Comisión del mercado (quemados)</b></td><td></td><td>' . n($quemados) . '</td></tr></tbody></table></div>';
    echo '<p class="tenue">Emitidos (sin contar el mercado): <b id="creditos-emitidos">' . n($em) . '</b> · gastados en la tienda, quitados y comisión: <b id="creditos-quemados">' . n($gas + $quemados) . '</b> · saldo de todos los jugadores: ' . n((int) Db::valor('SELECT COALESCE(SUM(creditos - deuda), 0) FROM jugadores')) . '.</p>';
    tabla_avisos();
}

// ------------------------------------------------------------------------------------------------- Jugadores
function tab_jugadores(): void
{
    $id = (int) get_s('id');
    if ($id > 0) { ficha_jugador($id); return; }
    $q = get_s('q');
    echo '<h1>Jugadores</h1><form method="get" action="/admin.php" class="form-fila"><input type="hidden" name="t" value="jugadores"><label>Buscar por correo, nombre, productora o N°<input name="q" value="' . e($q) . '" maxlength="120"></label><button class="boton" type="submit">Buscar</button></form>';
    $sql = "SELECT j.*, (SELECT COALESCE(SUM(total), 0) FROM compras c WHERE c.jugador_id = j.id AND c.estado = 'pagado') AS gastado FROM jugadores j";
    $p = [];
    if ($q !== '') { $sql .= " WHERE j.email LIKE ? ESCAPE '\\' OR j.nombre LIKE ? ESCAPE '\\' OR j.alias LIKE ? ESCAPE '\\' OR j.id = ?"; $l = '%' . addcslashes($q, '%_\\') . '%'; $p = [$l, $l, $l, ctype_digit($q) ? (int) $q : -1]; }
    $f = Db::todas($sql . ' ORDER BY j.id DESC LIMIT 100', $p);
    echo '<div class="tabla separada"><table id="tabla-jugadores"><thead><tr><th>N°</th><th>Correo</th><th>Nombre / productora</th><th>Estado</th><th>Créditos</th><th>Gastado</th><th>Registro</th></tr></thead><tbody>';
    if (!$f) echo '<tr><td colspan="7" class="tenue">No se encontró nadie.</td></tr>';
    foreach ($f as $j) echo '<tr><td>' . (int) $j['id'] . '</td><td>' . enlace_jugador((int) $j['id'], $j['email']) . '</td><td>' . e($j['nombre']) . ($j['alias'] ? ' · <b>' . e($j['alias']) . '</b>' : '') . '</td><td class="estado-' . e($j['estado']) . '">' . e($j['estado']) . '</td><td>' . ((int) $j['creditos'] - (int) $j['deuda']) . '</td><td>' . e(Http::dinero($j['gastado'])) . '</td><td>' . e(admin_fecha((int) $j['creado'])) . '</td></tr>';
    echo '</tbody></table></div>';
}

function ficha_jugador(int $id): void
{
    $j = Cuentas::porId($id);
    if (!$j) { echo '<div class="aviso aviso-error">Ese jugador no existe.</div>'; return; }
    $t = 'jugadores&id=' . $id;
    $vip = $j['vip_hasta'] !== null && (int) $j['vip_hasta'] > time();
    $tar = $j['tarjeta_hasta'] !== null && (int) $j['tarjeta_hasta'] > time();
    $s = Chat::sancion($id);
    $fecha = fn($x) => $x === null ? '—' : admin_fecha((int) $x);
    echo '<p><a href="' . e(url('jugadores')) . '">← Jugadores</a></p><h1 id="ficha-jugador">' . e($j['email']) . '</h1>';
    echo '<div class="tarjetas"><div class="tarjeta"><span class="tenue">Estado de la cuenta</span><b class="estado-' . e($j['estado']) . '" id="ficha-estado">' . e($j['estado']) . '</b><span class="tenue">' . e((string) $j['estado_motivo']) . '</span></div>'
       . '<div class="tarjeta"><span class="tenue">Créditos</span><b id="ficha-creditos">' . ((int) $j['creditos'] - (int) $j['deuda']) . '</b><span class="tenue">' . ((int) $j['deuda'] > 0 ? 'debe ' . (int) $j['deuda'] . ' (reembolso)' : 'sin deuda') . '</span></div>'
       . '<div class="tarjeta"><span class="tenue">VIP / Tarjeta mensual</span><b>' . ($vip ? 'VIP' : '—') . ' / ' . ($tar ? 'Tarjeta' : '—') . '</b><span class="tenue">VIP hasta ' . e($fecha($j['vip_hasta'])) . ' · tarjeta hasta ' . e($fecha($j['tarjeta_hasta'])) . '</span></div>'
       . '<div class="tarjeta"><span class="tenue">Perfil</span><b>' . e($j['alias'] ?: $j['nombre']) . '</b><span class="tenue">' . e($j['nombre']) . ' · ' . e(Social::servidorDe($id)['nombre'] ?? '') . ' · fama ' . (int) $j['fama_publica'] . ' · chat: ' . e($s ? $s['tipo'] : 'normal') . '</span></div></div>';
    echo '<p class="tenue">Registro ' . e(admin_fecha((int) $j['creado'])) . ' · último ingreso ' . e($fecha($j['ultimo_ingreso'])) . ' · ' . (int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$id]) . ' sesiones abiertas'
       . ($j['bloqueo_hasta'] !== null && (int) $j['bloqueo_hasta'] > time() ? ' · <b>bloqueo por transferencia hasta ' . e(admin_fecha((int) $j['bloqueo_hasta'])) . '</b>' : '') . '</p>';
    echo '<h2>Acciones</h2>' . form_abrir('creditos', $t) . '<input type="hidden" name="email" value="' . e($j['email']) . '">'
       . '<label>Créditos (negativo para quitar)<input type="number" name="creditos" required step="1"></label><label>Motivo<input name="nota" required maxlength="150" placeholder="Ej. compra N° 12 no llegó"></label><button class="boton" type="submit">Dar / quitar créditos</button></form>';
    echo form_abrir('cuenta_estado', $t, 'form-fila separada') . '<input type="hidden" name="jugador_id" value="' . $id . '"><label>Estado<select name="estado"><option value="activo">Activo</option><option value="suspendido">Suspendido</option><option value="baneado">Baneado</option></select></label>'
       . '<label>Motivo<input name="motivo" maxlength="300"></label><button class="boton" type="submit">Cambiar estado</button></form>';
    echo '<div class="separada">' . boton('cerrar_sesiones', ['jugador_id' => $id], 'Cerrar todas sus sesiones', 'boton sec', $t)
       . boton('silenciar', ['jugador_id' => $id, 'duracion' => '24h', 'motivo' => 'Revisión'], 'Silenciar chat 24 h', 'boton sec', $t)
       . boton('expulsar_chat', ['jugador_id' => $id, 'motivo' => 'Decisión del administrador'], 'Expulsar del chat', 'boton sec', $t)
       . ($s ? boton('levantar', ['jugador_id' => $id], 'Levantar sanción del chat', 'boton sec', $t) : '') . '</div>';
    echo '<h2>Compras</h2><div class="tabla"><table id="ficha-compras"><thead><tr><th>N°</th><th>Fecha</th><th>Producto</th><th>Total</th><th>Estado</th><th>Canal</th></tr></thead><tbody>';
    $cs = Db::todas('SELECT * FROM compras WHERE jugador_id = ? ORDER BY id DESC LIMIT 50', [$id]);
    if (!$cs) echo '<tr><td colspan="6" class="tenue">Sin compras.</td></tr>';
    foreach ($cs as $c) echo '<tr><td>' . enlace_compra((int) $c['id']) . '</td><td>' . e(admin_fecha((int) ($c['pagado_en'] ?? $c['creado']))) . '</td><td>' . e(nombre_producto((string) $c['producto'])) . '</td><td>' . e(Http::dinero($c['total'])) . '</td><td class="estado-' . e($c['estado']) . '">' . e($c['estado']) . '</td><td>' . e($c['canal']) . '</td></tr>';
    echo '</tbody></table></div>';
    echo '<h2>Libro de créditos (últimos 50)</h2><div class="tabla"><table id="ficha-libro"><thead><tr><th>Fecha</th><th>Cambio</th><th>Saldo</th><th>Motivo</th><th>Referencia</th></tr></thead><tbody>';
    foreach (Db::todas('SELECT * FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 50', [$id]) as $m) echo '<tr><td>' . e(admin_fecha((int) $m['creado'])) . '</td><td>' . (int) $m['cambio'] . '</td><td>' . (int) $m['saldo'] . '</td><td>' . e($m['motivo']) . '</td><td>' . e($m['ref']) . '</td></tr>';
    echo '</tbody></table></div>';
    echo '<h2>Inventario del servidor</h2><div class="tabla"><table id="ficha-inventario"><thead><tr><th>N°</th><th>Equipo</th><th>Serie</th><th>Origen</th><th>Estado</th></tr></thead><tbody>';
    foreach (Db::todas('SELECT * FROM inventario WHERE jugador_id = ? ORDER BY id', [$id]) as $i) echo '<tr><td>' . (int) $i['id'] . '</td><td>' . e(Catalogo::nombreEquipo((string) $i['item'])) . '</td><td>#' . sprintf('%04d', (int) $i['serie']) . '</td><td>' . e($i['origen']) . '</td><td>' . e($i['estado']) . '</td></tr>';
    echo '</tbody></table></div>';
    echo '<h2>Entregas (últimas 50)</h2><div class="tabla"><table id="ficha-entregas"><thead><tr><th>N°</th><th>Fecha</th><th>Tipo</th><th>Qué</th><th>Cantidad</th><th>Origen</th></tr></thead><tbody>';
    foreach (Db::todas('SELECT * FROM entregas WHERE jugador_id = ? ORDER BY id DESC LIMIT 50', [$id]) as $en) echo '<tr><td>' . (int) $en['id'] . '</td><td>' . e(admin_fecha((int) $en['creado'])) . '</td><td>' . e($en['tipo']) . '</td><td>' . e($en['item']) . ($en['nivel'] ? ' (' . e($en['nivel']) . ')' : '') . '</td><td>' . (int) $en['cantidad'] . ($en['eventos'] !== null ? ' · ' . (int) $en['eventos'] . ' eventos' : '') . '</td><td>' . e($en['origen']) . '</td></tr>';
    echo '</tbody></table></div>';
    $sx = Db::todas('SELECT * FROM chat_sanciones WHERE jugador_id = ? ORDER BY id DESC LIMIT 20', [$id]);
    if ($sx) {
        echo '<h2>Sanciones del chat</h2><div class="tabla"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Hasta</th><th>Motivo</th><th>Levantada</th></tr></thead><tbody>';
        foreach ($sx as $x) echo '<tr><td>' . e(admin_fecha((int) $x['creado'])) . '</td><td>' . e($x['tipo']) . '</td><td>' . e($x['hasta'] === null ? 'para siempre' : admin_fecha((int) $x['hasta'])) . '</td><td>' . e($x['motivo']) . '</td><td>' . ((int) $x['levantada'] ? 'sí' : 'no') . '</td></tr>';
        echo '</tbody></table></div>';
    }
    $cas = Db::todas('SELECT * FROM soporte_casos WHERE jugador_id = ? ORDER BY id DESC LIMIT 20', [$id]);
    if ($cas) {
        echo '<h2>Casos de soporte</h2><ul>';
        foreach ($cas as $c) echo '<li><a href="' . e(url('soporte', ['caso' => $c['id']])) . '">N° ' . (int) $c['id'] . ' · ' . e($c['asunto']) . '</a> <span class="tenue">(' . e($c['estado']) . ')</span></li>';
        echo '</ul>';
    }
    tabla_auditoria(Auditoria::ultimas(50, $id), 'Auditoría de este jugador');
}

// ------------------------------------------------------------------------------------------------- Compras
function tab_compras(): void
{
    $id = (int) get_s('id');
    if ($id > 0) ficha_compra($id);
    $estado = get_s('estado') ?: 'todas';
    echo '<h1>Compras</h1><div class="filtros">';
    foreach (['todas' => 'Todas', 'pagado' => 'Pagadas', 'pendiente' => 'Pendientes', 'rechazado' => 'Rechazadas', 'revertido' => 'Revertidas'] as $k => $nom) {
        echo '<a href="' . e(url('compras', array_filter(['estado' => $k === 'todas' ? '' : $k, 'canal' => get_s('canal'), 'q' => get_s('q')]))) . '"' . ($k === $estado ? ' class="activo"' : '') . '>' . $nom . '</a>';
    }
    echo '</div><form method="get" action="/admin.php" class="form-fila"><input type="hidden" name="t" value="compras"><input type="hidden" name="estado" value="' . e(get_s('estado')) . '">'
       . '<label>Canal<select name="canal"><option value="">Todos</option><option value="web_plux"' . (get_s('canal') === 'web_plux' ? ' selected' : '') . '>Web (Plux)</option><option value="google_play"' . (get_s('canal') === 'google_play' ? ' selected' : '') . '>Google Play</option></select></label>'
       . '<label>Buscar (correo, cédula, nombre, transacción)<input name="q" value="' . e(get_s('q')) . '" maxlength="120"></label>'
       . '<label>Desde<input type="date" name="desde" value="' . e(get_s('desde')) . '"></label><label>Hasta<input type="date" name="hasta" value="' . e(get_s('hasta')) . '"></label><button class="boton" type="submit">Filtrar</button></form>';
    $qs = array_filter(['estado' => get_s('estado'), 'canal' => get_s('canal'), 'q' => get_s('q'), 'desde' => get_s('desde'), 'hasta' => get_s('hasta'), 'producto' => get_s('producto')]);
    echo '<p class="separada"><a class="boton sec chico" href="/admin.php?' . e(http_build_query(['a' => 'csv'] + $qs)) . '">⬇ Exportar CSV (Excel) para facturar en el SRI</a></p>';
    [$w, $p] = filtro_compras();
    $cs = Db::todas('SELECT c.*, j.email AS jugador_email FROM compras c JOIN jugadores j ON j.id = c.jugador_id' . $w . ' ORDER BY c.id DESC LIMIT 200', $p);
    echo '<div class="tabla"><table id="tabla-compras"><thead><tr><th>N°</th><th>Fecha</th><th>Estado</th><th>Producto</th><th>Total</th><th>Subtotal</th><th>IVA</th><th>Cédula</th><th>Nombre</th><th>Correo</th><th>Celular</th><th>Cuenta</th><th>Canal</th><th>Transacción</th></tr></thead><tbody>';
    if (!$cs) echo '<tr><td colspan="14" class="tenue">Todavía no hay compras.</td></tr>';
    foreach ($cs as $c) {
        echo '<tr><td>' . enlace_compra((int) $c['id']) . '</td><td>' . e(admin_fecha((int) ($c['pagado_en'] ?? $c['creado']))) . '</td><td class="estado-' . e($c['estado']) . '">' . e($c['estado']) . '</td>'
           . '<td>' . e(nombre_producto((string) $c['producto'])) . '</td><td>' . e(Http::dinero($c['total'])) . '</td><td>' . e(Http::dinero($c['subtotal'])) . '</td><td>' . e(Http::dinero($c['iva'])) . '</td>'
           . '<td>' . e($c['comprador_cedula']) . '</td><td>' . e($c['comprador_nombre']) . '</td><td>' . e($c['comprador_email']) . '</td><td>' . e($c['comprador_telefono']) . '</td>'
           . '<td>' . enlace_jugador((int) $c['jugador_id'], $c['jugador_email']) . '</td><td>' . e($c['canal']) . '</td><td>' . e($c['plux_transaccion'] ?? $c['google_order_id']) . '</td></tr>';
    }
    echo '</tbody></table></div>';
}

function ficha_compra(int $id): void
{
    $c = Db::fila('SELECT c.*, j.email AS jugador_email FROM compras c JOIN jugadores j ON j.id = c.jugador_id WHERE c.id = ?', [$id]);
    if (!$c) { echo '<div class="aviso aviso-error">Esa compra no existe.</div>'; return; }
    echo '<section class="producto" id="ficha-compra"><div class="producto-nombre">Compra N° ' . $id . ' · ' . e(nombre_producto((string) $c['producto'])) . '</div>'
       . '<div class="producto-detalle">' . e(Http::dinero($c['total'])) . ' (sin IVA ' . e(Http::dinero($c['subtotal'])) . ') · <span class="estado-' . e($c['estado']) . '">' . e($c['estado']) . '</span> · ' . e($c['canal']) . ' · jugador ' . enlace_jugador((int) $c['jugador_id'], $c['jugador_email'])
       . ' · creada ' . e(admin_fecha((int) $c['creado'])) . ($c['pagado_en'] ? ' · pagada ' . e(admin_fecha((int) $c['pagado_en'])) . ' por ' . e($c['pagado_por']) : '')
       . ($c['creditos'] !== null ? ' · ' . (int) $c['creditos'] . ' créditos' . ((int) $c['bono_pct'] ? ' (oferta +' . (int) $c['bono_pct'] . ' %)' : '') : '') . '</div>'
       . ($c['revertida_en'] ? '<div class="aviso aviso-error">Revertida (' . e($c['revertida_tipo']) . ') el ' . e(admin_fecha((int) $c['revertida_en'])) . ' por ' . e($c['revertida_por']) . ': ' . e($c['revertida_motivo']) . '</div>' : '');
    if ($c['estado'] === 'pagado') {
        echo form_abrir('revertir', 'compras&id=' . $id) . '<input type="hidden" name="compra_id" value="' . $id . '"><label>Tipo<select name="tipo"><option value="reembolso">Reembolso</option><option value="contracargo">Contracargo</option></select></label>'
           . '<label>Motivo<input name="motivo" required maxlength="300"></label><button class="boton" type="submit">Revertir y suspender la cuenta</button></form>'
           . '<p class="tenue">Quita los créditos que dio (el saldo puede quedar negativo), los equipos que todavía tenga, los días de VIP o tarjeta, y suspende la cuenta.</p>';
    }
    echo '</section>';
}

// ------------------------------------------------------------------------------------------------- Productos y precios
function tab_productos(): void
{
    echo '<h1>Productos y precios</h1><p class="tenue">Precios finales con IVA incluido. Lo que cambies aquí manda sobre Catalogo.php; "Restaurar" vuelve al valor original. Las compras ya hechas no cambian.</p>';
    echo '<div class="tabla"><table id="tabla-productos"><thead><tr><th>Producto</th><th>Precio, créditos y estado</th></tr></thead><tbody>';
    foreach (array_keys(Catalogo::PRODUCTOS) as $id) {
        $p = Catalogo::producto($id);
        $mod = isset(Catalogo::ajustes()[$id]);
        echo '<tr><td><b>' . e($p['nombre']) . '</b><br><span class="tenue">' . e($id) . (!empty($p['oculto']) ? ' · no sale en la tienda' : '') . ($mod ? ' · <b>modificado</b>' : '') . ($p['oferta'] ? ' · oferta +' . (int) $p['bono_pct'] . ' %' : '') . '</span></td>'
           . '<td class="acciones">' . form_abrir('producto_guardar', 'productos', 'form-producto') . '<input type="hidden" name="producto" value="' . e($id) . '">'
           . '<label>Precio $<input name="precio" value="' . e(number_format((float) $p['precio'], 2, '.', '')) . '" inputmode="decimal" maxlength="7"></label>'
           . '<label>Créditos<input type="number" name="creditos" value="' . (int) $p['creditos_base'] . '" min="0" step="1"></label>'
           . '<label class="casilla"><input type="checkbox" name="activo"' . ($p['activo'] ? ' checked' : '') . '> Activo</label><button class="boton chico" type="submit">Guardar</button></form>'
           . ($mod ? boton('producto_restaurar', ['producto' => $id], 'Restaurar', 'boton sec', 'productos') : '') . '</td></tr>';
    }
    echo '</tbody></table></div>';
    echo '<h2>Ofertas por tiempo limitado (% extra de créditos)</h2>' . form_abrir('oferta_crear', 'productos') . '<label>Producto<select name="producto">';
    foreach (array_keys(Catalogo::PRODUCTOS) as $id) { $p = Catalogo::producto($id); if ((int) $p['creditos_base'] > 0) echo '<option value="' . e($id) . '">' . e($p['nombre']) . '</option>'; }
    echo '</select></label><label>% extra<input type="number" name="bono_pct" min="1" max="300" value="20"></label><label>Desde<input type="datetime-local" name="inicio"></label><label>Hasta<input type="datetime-local" name="fin" required></label><button class="boton" type="submit">Crear oferta</button></form>';
    $of = Db::todas('SELECT * FROM ofertas ORDER BY id DESC LIMIT 50');
    echo '<div class="tabla separada"><table id="tabla-ofertas"><thead><tr><th>N°</th><th>Producto</th><th>Bono</th><th>Desde</th><th>Hasta</th><th>Estado</th><th></th></tr></thead><tbody>';
    if (!$of) echo '<tr><td colspan="7" class="tenue">Sin ofertas.</td></tr>';
    foreach ($of as $o) {
        $vig = (int) $o['activa'] && (int) $o['inicio'] <= time() && (int) $o['fin'] > time();
        $est = $vig ? '<b>vigente</b>' : ((int) $o['activa'] ? ((int) $o['fin'] <= time() ? 'terminó' : 'programada') : 'terminada');
        echo '<tr><td>' . (int) $o['id'] . '</td><td>' . e($o['producto']) . '</td><td>+' . (int) $o['bono_pct'] . ' %</td><td>' . e(admin_fecha((int) $o['inicio'])) . '</td><td>' . e(admin_fecha((int) $o['fin'])) . '</td><td>' . $est . '</td><td>'
           . ((int) $o['activa'] && (int) $o['fin'] > time() ? boton('oferta_terminar', ['oferta_id' => $o['id']], 'Terminar', 'boton sec', 'productos') : '') . '</td></tr>';
    }
    echo '</tbody></table></div>';
}

// ------------------------------------------------------------------------------------------------- Mercado
function tab_mercado(): void
{
    $tot = Db::fila("SELECT COUNT(*) AS n, COALESCE(SUM(precio), 0) AS mov, COALESCE(SUM(comision), 0) AS quem FROM mercado_publicaciones WHERE estado = 'vendida'");
    $mes = (int) Db::valor("SELECT COALESCE(SUM(comision), 0) FROM mercado_publicaciones WHERE estado = 'vendida' AND cerrado >= ?", [strtotime(date('Y-m-01 00:00:00'))]);
    $activas = (int) Db::valor("SELECT COUNT(*) FROM mercado_publicaciones WHERE estado = 'activa'");
    echo '<h1>Mercado entre jugadores</h1><div class="tarjetas">'
       . '<div class="tarjeta"><span class="tenue">Ventas</span><b id="mercado-ventas">' . (int) $tot['n'] . '</b><span class="tenue">' . n((int) $tot['mov']) . ' créditos movidos</span></div>'
       . '<div class="tarjeta"><span class="tenue">Créditos quemados por comisión (total)</span><b id="mercado-quemados">' . n((int) $tot['quem']) . '</b><span class="tenue">este mes: ' . n($mes) . '</span></div>'
       . '<div class="tarjeta"><span class="tenue">Publicaciones activas</span><b>' . $activas . '</b><span class="tenue">comisión ' . (Catalogo::MERCADO_COMISION * 100) . ' %</span></div></div>';
    echo '<h2>Publicaciones activas y congeladas</h2><div class="tabla"><table id="tabla-publicaciones"><thead><tr><th>N°</th><th>Equipo</th><th>Precio</th><th>Vendedor</th><th>Estado</th><th>Vence</th><th></th></tr></thead><tbody>';
    $ps = Db::todas("SELECT p.*, j.email FROM mercado_publicaciones p LEFT JOIN jugadores j ON j.id = p.vendedor_id WHERE p.estado IN ('activa', 'congelada') ORDER BY p.id DESC LIMIT 200");
    if (!$ps) echo '<tr><td colspan="7" class="tenue">Nada publicado.</td></tr>';
    foreach ($ps as $p) echo '<tr><td>' . (int) $p['id'] . '</td><td>' . e(Catalogo::nombreEquipo((string) $p['item'])) . ' #' . sprintf('%04d', (int) $p['serie']) . '</td><td>' . (int) $p['precio'] . '</td><td>' . enlace_jugador($p['vendedor_id'] === null ? null : (int) $p['vendedor_id'], $p['email']) . '</td><td>' . e($p['estado']) . '</td><td>' . e(admin_fecha((int) $p['vence'])) . '</td><td class="acciones">'
        . ($p['estado'] === 'activa' ? boton('mercado_congelar', ['publicacion_id' => $p['id']], 'Congelar', 'boton sec', 'mercado') : boton('mercado_descongelar', ['publicacion_id' => $p['id']], 'Descongelar', 'boton sec', 'mercado'))
        . boton('mercado_quitar', ['publicacion_id' => $p['id']], 'Quitar (vuelve al vendedor)', 'boton sec', 'mercado') . '</td></tr>';
    echo '</tbody></table></div>';
    $v = Db::todas("SELECT p.*, jv.email AS v_email, jv.nombre AS v_nombre, jc.email AS c_email, jc.nombre AS c_nombre FROM mercado_publicaciones p
                    LEFT JOIN jugadores jv ON jv.id = p.vendedor_id LEFT JOIN jugadores jc ON jc.id = p.comprador_id WHERE p.estado = 'vendida' ORDER BY p.cerrado DESC, p.id DESC LIMIT 100");
    echo '<h2>Ventas</h2><div class="tabla"><table id="tabla-mercado"><thead><tr><th>Fecha</th><th>Equipo</th><th>Serie</th><th>Vendedor</th><th>Comprador</th><th>Precio</th><th>Recibió</th><th>Comisión</th></tr></thead><tbody>';
    if (!$v) echo '<tr><td colspan="8" class="tenue">Todavía no hay ventas en el mercado.</td></tr>';
    foreach ($v as $x) echo '<tr><td>' . e(admin_fecha((int) $x['cerrado'])) . '</td><td>' . e(Catalogo::nombreEquipo((string) $x['item'])) . '</td><td>#' . sprintf('%04d', (int) $x['serie']) . '</td>'
        . '<td>' . e(($x['v_nombre'] ?? '—') . ' · ' . ($x['v_email'] ?? '')) . '</td><td>' . e(($x['c_nombre'] ?? '—') . ' · ' . ($x['c_email'] ?? '')) . '</td>'
        . '<td>' . (int) $x['precio'] . '</td><td>' . (int) $x['pago_vendedor'] . '</td><td>' . (int) $x['comision'] . '</td></tr>';
    echo '</tbody></table></div>';
}

// ------------------------------------------------------------------------------------------------- Chat
function tab_chat(): void
{
    echo '<h1>Chat</h1><h2>Reportes pendientes</h2>';
    $rep = Db::todas("SELECT m.id AS mensaje_id, m.texto, m.canal, m.creado, m.oculto, m.jugador_id, j.email, j.nombre, j.alias, COUNT(r.id) AS n, GROUP_CONCAT(r.motivo, ' · ') AS motivos
                      FROM chat_reportes r JOIN chat_mensajes m ON m.id = r.mensaje_id LEFT JOIN jugadores j ON j.id = m.jugador_id
                      WHERE r.estado = 'pendiente' GROUP BY m.id ORDER BY MIN(r.id) LIMIT 100");
    if (!$rep) echo '<p class="tenue" id="sin-reportes">No hay reportes pendientes.</p>';
    else {
        echo '<div class="tabla"><table id="tabla-reportes"><thead><tr><th>Mensaje</th><th>Autor</th><th>Canal</th><th>Reportes</th><th>Acciones</th></tr></thead><tbody>';
        foreach ($rep as $r) {
            echo '<tr><td class="largo">' . ((int) $r['oculto'] ? '<b>[oculto]</b> ' : '') . e($r['texto']) . '<br><span class="tenue">N° ' . (int) $r['mensaje_id'] . ' · ' . e(admin_fecha((int) $r['creado'])) . '</span></td>'
               . '<td>' . enlace_jugador((int) $r['jugador_id'], Social::nombrePublico($r['alias'], $r['nombre'])) . '<br><span class="tenue">' . e($r['email']) . '</span></td><td>' . e($r['canal']) . '</td>'
               . '<td class="largo">' . (int) $r['n'] . ': ' . e($r['motivos']) . '</td><td class="acciones">'
               . boton('ocultar', ['mensaje_id' => $r['mensaje_id']], 'Ocultar', 'boton', 'chat')
               . ((int) $r['oculto'] ? boton('mostrar', ['mensaje_id' => $r['mensaje_id']], 'Mostrar', 'boton sec', 'chat') : boton('descartar', ['mensaje_id' => $r['mensaje_id']], 'Descartar', 'boton sec', 'chat'))
               . boton('silenciar', ['jugador_id' => $r['jugador_id'], 'duracion' => '1h', 'motivo' => 'Mensaje reportado'], 'Silenciar 1 h', 'boton sec', 'chat')
               . boton('silenciar', ['jugador_id' => $r['jugador_id'], 'duracion' => '24h', 'motivo' => 'Mensaje reportado'], '24 h', 'boton sec', 'chat')
               . boton('silenciar', ['jugador_id' => $r['jugador_id'], 'duracion' => '7d', 'motivo' => 'Mensaje reportado'], '7 días', 'boton sec', 'chat')
               . boton('expulsar_chat', ['jugador_id' => $r['jugador_id'], 'motivo' => 'Reportes del chat'], 'Expulsar del chat', 'boton sec', 'chat') . '</td></tr>';
        }
        echo '</tbody></table></div>';
    }
    $san = Db::todas('SELECT s.*, j.email, j.nombre, j.alias FROM chat_sanciones s JOIN jugadores j ON j.id = s.jugador_id WHERE s.levantada = 0 AND (s.hasta IS NULL OR s.hasta > ?) ORDER BY s.id DESC LIMIT 100', [time()]);
    echo '<h2>Sanciones vigentes</h2>';
    if (!$san) echo '<p class="tenue">Nadie está sancionado.</p>';
    else {
        echo '<div class="tabla"><table id="tabla-sanciones"><thead><tr><th>Jugador</th><th>Tipo</th><th>Hasta</th><th>Motivo</th><th></th></tr></thead><tbody>';
        foreach ($san as $s) echo '<tr><td>' . enlace_jugador((int) $s['jugador_id'], Social::nombrePublico($s['alias'], $s['nombre'])) . ' · ' . e($s['email']) . '</td><td>' . e($s['tipo']) . '</td><td>' . e($s['hasta'] === null ? 'para siempre' : admin_fecha((int) $s['hasta'])) . '</td>'
            . '<td>' . e($s['motivo']) . '</td><td>' . boton('levantar', ['jugador_id' => $s['jugador_id']], 'Levantar', 'boton sec', 'chat') . '</td></tr>';
        echo '</tbody></table></div>';
    }
    echo '<h2>Mensajes recientes</h2>';
    $ult = Db::todas('SELECT m.*, j.email, j.nombre, j.alias FROM chat_mensajes m LEFT JOIN jugadores j ON j.id = m.jugador_id WHERE m.jugador_id IS NOT NULL ORDER BY m.id DESC LIMIT 30');
    if (!$ult) echo '<p class="tenue">Sin mensajes.</p>';
    else {
        echo '<div class="tabla"><table><thead><tr><th>Mensaje</th><th>Autor</th><th>Canal</th><th></th></tr></thead><tbody>';
        foreach ($ult as $m) echo '<tr><td class="largo">' . ((int) $m['oculto'] ? '<b>[oculto]</b> ' : '') . e($m['texto']) . ' <span class="tenue">' . e(admin_fecha((int) $m['creado'])) . '</span></td>'
            . '<td>' . enlace_jugador((int) $m['jugador_id'], Social::nombrePublico($m['alias'], $m['nombre'])) . '</td><td>' . e($m['canal']) . '</td><td class="acciones">'
            . ((int) $m['oculto'] ? boton('mostrar', ['mensaje_id' => $m['id']], 'Mostrar', 'boton sec', 'chat') : boton('ocultar', ['mensaje_id' => $m['id']], 'Ocultar', 'boton sec', 'chat'))
            . boton('silenciar', ['jugador_id' => $m['jugador_id'], 'duracion' => '24h', 'motivo' => 'Revisión del chat'], 'Silenciar 24 h', 'boton sec', 'chat') . '</td></tr>';
        echo '</tbody></table></div>';
    }
    $pal = array_column(Db::todas('SELECT palabra FROM chat_palabras ORDER BY palabra'), 'palabra');
    echo '<h2>Palabras prohibidas (' . count($pal) . ')</h2><p class="tenue">Se buscan sin tildes ni mayúsculas, con letras repetidas o cambiadas por números (put4, puuuta) y también en plural.</p>'
       . form_abrir('palabra_agregar', 'chat') . '<label>Agregar palabra<input name="palabra" required maxlength="40"></label><button class="boton" type="submit">Agregar</button></form><div class="palabras" id="lista-palabras">';
    foreach ($pal as $w) echo '<span class="palabra">' . e($w) . boton('palabra_quitar', ['palabra' => $w], '×', 'quitar', 'chat') . '</span>';
    echo '</div>';
}

// ------------------------------------------------------------------------------------------------- Soporte
function tab_soporte(): void
{
    $caso = (int) get_s('caso');
    if ($caso > 0) { ficha_caso($caso); return; }
    $estado = get_s('estado') ?: 'abierto';
    $cat = get_s('categoria');
    echo '<h1>Soporte</h1><div class="filtros">';
    foreach (['abierto' => 'Abiertos', 'respondido' => 'Respondidos', 'cerrado' => 'Cerrados', 'todos' => 'Todos'] as $k => $nom) echo '<a href="' . e(url('soporte', array_filter(['estado' => $k, 'categoria' => $cat]))) . '"' . ($k === $estado ? ' class="activo"' : '') . '>' . $nom . '</a>';
    echo '</div><div class="filtros"><a href="' . e(url('soporte', ['estado' => $estado])) . '"' . ($cat === '' ? ' class="activo"' : '') . '>Todas las categorías</a>';
    foreach (Soporte::CATEGORIAS as $c) echo '<a href="' . e(url('soporte', ['estado' => $estado, 'categoria' => $c])) . '"' . ($c === $cat ? ' class="activo"' : '') . '>' . e($c) . '</a>';
    echo '</div>';
    $w = []; $p = [];
    if ($estado !== 'todos') { $w[] = 'c.estado = ?'; $p[] = $estado; }
    if (in_array($cat, Soporte::CATEGORIAS, true)) { $w[] = 'c.categoria = ?'; $p[] = $cat; }
    $cs = Db::todas('SELECT c.*, j.email, (SELECT MAX(id) FROM compras x WHERE x.jugador_id = c.jugador_id) AS ultima_compra, (SELECT COUNT(*) FROM soporte_mensajes m WHERE m.caso_id = c.id) AS n
                     FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY c.actualizado DESC LIMIT 200', $p);
    echo '<div class="tabla"><table id="tabla-soporte"><thead><tr><th>N°</th><th>Asunto</th><th>Categoría</th><th>Estado</th><th>Jugador</th><th>Compra</th><th>Actualizado</th></tr></thead><tbody>';
    if (!$cs) echo '<tr><td colspan="7" class="tenue">No hay casos.</td></tr>';
    foreach ($cs as $c) echo '<tr><td>' . (int) $c['id'] . '</td><td><a href="' . e(url('soporte', ['caso' => $c['id']])) . '">' . e($c['asunto']) . '</a> <span class="tenue">(' . (int) $c['n'] . ')</span></td><td>' . e($c['categoria']) . '</td><td>' . e($c['estado']) . '</td>'
        . '<td>' . enlace_jugador((int) $c['jugador_id'], $c['email']) . '</td><td>' . enlace_compra($c['compra_id'] !== null ? (int) $c['compra_id'] : ($c['ultima_compra'] !== null ? (int) $c['ultima_compra'] : null)) . '</td><td>' . e(admin_fecha((int) $c['actualizado'])) . '</td></tr>';
    echo '</tbody></table></div>';
    echo '<h2>Respuestas rápidas</h2>';
    foreach (Db::todas('SELECT * FROM soporte_respuestas ORDER BY id') as $r) {
        echo form_abrir('respuesta_guardar', 'soporte', 'form-fila separada') . '<input type="hidden" name="rapida_id" value="' . (int) $r['id'] . '"><label>Título<input name="titulo" value="' . e($r['titulo']) . '" maxlength="60"></label>'
           . '<label>Texto<textarea name="texto" rows="2" maxlength="2000">' . e($r['texto']) . '</textarea></label><button class="boton chico" type="submit">Guardar</button></form>' . boton('respuesta_borrar', ['rapida_id' => $r['id']], 'Borrar', 'boton sec', 'soporte');
    }
    echo form_abrir('respuesta_guardar', 'soporte', 'form-fila separada') . '<label>Nueva: título<input name="titulo" maxlength="60"></label><label>Texto<textarea name="texto" rows="2" maxlength="2000"></textarea></label><button class="boton chico" type="submit">Agregar</button></form>';
}

function ficha_caso(int $id): void
{
    $c = Db::fila('SELECT c.*, j.email, j.nombre FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id WHERE c.id = ?', [$id]);
    if (!$c) { echo '<div class="aviso aviso-error">Ese caso no existe.</div>'; return; }
    $t = 'soporte&caso=' . $id;
    $ultima = Db::fila('SELECT * FROM compras WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$c['jugador_id']]);
    echo '<p><a href="' . e(url('soporte')) . '">← Soporte</a></p><h1 id="ficha-caso">Caso N° ' . $id . ': ' . e($c['asunto']) . '</h1>'
       . '<p>' . e($c['categoria']) . ' · <b>' . e($c['estado']) . '</b> · jugador ' . enlace_jugador((int) $c['jugador_id'], $c['email']) . ' · compra del caso ' . enlace_compra($c['compra_id'] !== null ? (int) $c['compra_id'] : null)
       . ' · última compra ' . ($ultima ? enlace_compra((int) $ultima['id']) . ' (' . e($ultima['producto']) . ', ' . e($ultima['estado']) . ')' : '—') . '</p>';
    if ($c['diagnostico_json']) echo '<details><summary>Diagnóstico del juego</summary><pre class="diag">' . e((string) json_encode(json_decode((string) $c['diagnostico_json'], true), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . '</pre></details>';
    echo '<div class="conversacion">';
    foreach (Db::todas('SELECT * FROM soporte_mensajes WHERE caso_id = ? ORDER BY id', [$id]) as $m) echo '<div class="msg msg-' . e($m['autor']) . '"><span class="tenue">' . ($m['autor'] === 'soporte' ? 'Soporte' : 'Jugador') . ' · ' . e(admin_fecha((int) $m['creado'])) . '</span><p>' . nl2br(e($m['texto'])) . '</p></div>';
    echo '</div>' . form_abrir('soporte_responder', $t, 'form-fila separada') . '<input type="hidden" name="caso_id" value="' . $id . '"><label>Respuesta<textarea name="texto" rows="4" maxlength="2000"></textarea></label>'
       . '<label class="casilla"><input type="checkbox" name="cerrar"> Cerrar el caso</label><button class="boton" type="submit">Responder</button></form>';
    echo '<p class="tenue separada">Respuestas rápidas (se envían tal cual):</p><div>';
    foreach (Db::todas('SELECT * FROM soporte_respuestas ORDER BY id') as $r) echo boton('soporte_responder', ['caso_id' => $id, 'rapida_id' => $r['id']], $r['titulo'], 'boton sec', $t);
    echo '</div><div class="separada">' . ($c['estado'] === 'cerrado' ? boton('soporte_reabrir', ['caso_id' => $id], 'Reabrir', 'boton sec', $t) : boton('soporte_cerrar', ['caso_id' => $id], 'Cerrar caso', 'boton sec', $t)) . '</div>';
}

// ------------------------------------------------------------------------------------------------- Transferencias
function tab_transferencias(): void
{
    echo '<h1>Transferencias de cuenta</h1><p class="tenue">La paga el dueño actual ($' . n((float) Catalogo::PRODUCTOS['transferencia_cuenta']['precio'], 2) . '). Después del pago, el nuevo dueño confirma con su correo y el código. Al completarse: sesiones del anterior cerradas, publicaciones retiradas y 7 días sin poder transferir ni vender.</p>';
    $ts = Db::todas('SELECT * FROM transferencias ORDER BY id DESC LIMIT 200');
    echo '<div class="tabla"><table id="tabla-transferencias"><thead><tr><th>N°</th><th>Fecha</th><th>Cuenta</th><th>De</th><th>A</th><th>Estado</th><th>Compra</th><th></th></tr></thead><tbody>';
    if (!$ts) echo '<tr><td colspan="8" class="tenue">Sin transferencias.</td></tr>';
    foreach ($ts as $t) echo '<tr><td>' . (int) $t['id'] . '</td><td>' . e(admin_fecha((int) $t['creado'])) . '</td><td>' . enlace_jugador((int) $t['jugador_id'], 'N° ' . $t['jugador_id']) . '</td><td>' . e($t['email_anterior']) . '</td><td>' . e($t['email_nuevo']) . '</td><td>' . e($t['estado']) . '</td><td>' . enlace_compra($t['compra_id'] === null ? null : (int) $t['compra_id']) . '</td><td>'
        . (in_array($t['estado'], ['pendiente_pago', 'pagada'], true) ? boton('transferencia_cancelar', ['transferencia_id' => $t['id']], 'Cancelar', 'boton sec', 'transferencias') : '') . '</td></tr>';
    echo '</tbody></table></div>';
}

// ------------------------------------------------------------------------------------------------- Ajustes
function tab_ajustes(): void
{
    $a = Ajustes::anuncio();
    $hasta = Ajustes::get('anuncio_hasta');
    echo '<h1>Ajustes</h1><h2>Mantenimiento de la tienda</h2>' . form_abrir('mantenimiento', 'ajustes')
       . '<label class="casilla"><input type="checkbox" name="activo"' . (Ajustes::mantenimiento() ? ' checked' : '') . '> Tienda en mantenimiento (nadie puede comprar)</label>'
       . '<label>Mensaje para los jugadores<input name="mensaje" maxlength="300" value="' . e(Ajustes::get('mantenimiento_mensaje')) . '" placeholder="' . e(Ajustes::mensajeMantenimiento()) . '"></label><button class="boton" type="submit">Guardar</button></form>';
    echo '<h2>Anuncio en el juego</h2><p class="tenue">' . ($a ? 'Ahora se muestra: <b>' . e($a['texto']) . '</b>' : 'No hay anuncio.') . '</p>' . form_abrir('anuncio', 'ajustes')
       . '<label>Texto (vacío = quitar)<input name="texto" maxlength="300" value="' . e(Ajustes::get('anuncio_texto')) . '"></label>'
       . '<label>Tipo<select name="tipo">' . implode('', array_map(fn($x) => '<option value="' . $x . '"' . (Ajustes::get('anuncio_tipo', 'info') === $x ? ' selected' : '') . '>' . $x . '</option>', ['info', 'aviso', 'evento'])) . '</select></label>'
       . '<label>Hasta (opcional)<input type="datetime-local" name="hasta" value="' . e($hasta !== '' ? date('Y-m-d\TH:i', (int) $hasta) : '') . '"></label><button class="boton" type="submit">Publicar</button></form>';
    echo '<h2>Abuso de reembolsos (baneo automático)</h2>' . form_abrir('abuso', 'ajustes')
       . '<label class="casilla"><input type="checkbox" name="contracargo_banea"' . (Ajustes::get('abuso_contracargo_banea', '1') === '1' ? ' checked' : '') . '> Un contracargo banea la cuenta</label>'
       . '<label>Reembolsos para banear<input type="number" name="abuso_reembolsos" min="1" max="20" value="' . e(Ajustes::get('abuso_reembolsos', '2')) . '"></label>'
       . '<label>En cuántos días<input type="number" name="abuso_dias" min="1" max="3650" value="' . e(Ajustes::get('abuso_dias', '180')) . '"></label><button class="boton" type="submit">Guardar</button></form>';
}

// ------------------------------------------------------------------------------------------------- Auditoría
function tab_auditoria(): void
{
    echo '<h1>Auditoría</h1>';
    tabla_auditoria(Auditoria::ultimas(300), 'Últimas 300 acciones');
}

function tabla_auditoria(array $filas, string $titulo): void
{
    echo '<h2>' . e($titulo) . '</h2><div class="tabla"><table id="tabla-auditoria"><thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Jugador</th><th>Compra</th><th>Detalle</th></tr></thead><tbody>';
    if (!$filas) echo '<tr><td colspan="6" class="tenue">Nada todavía.</td></tr>';
    foreach ($filas as $a) echo '<tr><td>' . e(admin_fecha((int) $a['creado'])) . '</td><td>' . e($a['quien']) . '</td><td>' . e($a['accion']) . '</td><td>' . enlace_jugador($a['jugador_id'] === null ? null : (int) $a['jugador_id'], null) . '</td><td>' . enlace_compra($a['compra_id'] === null ? null : (int) $a['compra_id']) . '</td><td class="largo">' . e(mb_substr((string) $a['detalle'], 0, 400)) . '</td></tr>';
    echo '</tbody></table></div>';
}
