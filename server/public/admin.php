<?php
declare(strict_types=1);

// Panel del dueño: /admin.php (usuario y clave de /etc/envivo/config.env: ENVIVO_ADMIN_USUARIO y ENVIVO_ADMIN_CLAVE_HASH).
// Muestra ventas (solo pagadas) de hoy / del mes / total, número de jugadores, últimas compras con los datos del
// comprador para la factura (SRI), filtro por estado, exportar a CSV (Excel) y dar créditos a mano (soporte).

require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Catalogo, Config, Db, Http, Limite, Monedero, Cuentas};

try {
    Db::pdo();
    admin_auth();
    $accion = (string) ($_GET['a'] ?? '');
    if ($accion === 'csv') admin_csv();
    $mensaje = null;
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') $mensaje = admin_dar_creditos();
    admin_pantalla($mensaje);
} catch (\Throwable $e) {
    error_log('EN VIVO admin: ' . get_class($e) . ' ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 300));
    Http::pagina(500, 'Error', 'Ocurrió un error en el panel. Revisa el registro de PHP.', '/admin.php', 'Volver al panel');
}

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

function admin_estado(): string
{
    $e = (string) ($_GET['estado'] ?? 'todas');
    return in_array($e, ['pagado', 'pendiente', 'rechazado'], true) ? $e : 'todas';
}

function admin_compras(string $estado, int $limite): array
{
    $sql = 'SELECT c.*, j.email AS jugador_email, j.nombre AS jugador_nombre FROM compras c JOIN jugadores j ON j.id = c.jugador_id';
    $p = [];
    if ($estado !== 'todas') { $sql .= ' WHERE c.estado = ?'; $p[] = $estado; }
    $sql .= ' ORDER BY c.id DESC' . ($limite > 0 ? ' LIMIT ' . $limite : '');
    return Db::todas($sql, $p);
}

function admin_fecha(?int $t): string { return $t ? date('Y-m-d H:i', $t) : ''; }

/** Evita que Excel ejecute fórmulas escritas por un comprador. */
function csv_seguro(mixed $v): string
{
    $s = (string) $v;
    return $s !== '' && strpbrk($s[0], "=+-@\t\r") !== false ? "'" . $s : $s;
}

function admin_csv(): never
{
    $estado = admin_estado();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="compras-envivo-' . $estado . '-' . date('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    $f = fopen('php://output', 'w');
    fwrite($f, "\xEF\xBB\xBF");   // para que Excel lea las tildes
    $cols = ['N°', 'Fecha', 'Pagado en', 'Estado', 'Producto', 'Subtotal', 'IVA', 'Total', 'Cédula', 'Nombre', 'Correo', 'Celular', 'Cuenta del jugador', 'Transacción Plux'];
    fputcsv($f, $cols, ';', '"', '');
    foreach (admin_compras($estado, 0) as $c) {
        $p = Catalogo::producto((string) $c['producto']);
        fputcsv($f, array_map('csv_seguro', [$c['id'], admin_fecha((int) $c['creado']), admin_fecha($c['pagado_en'] !== null ? (int) $c['pagado_en'] : null), $c['estado'],
            $p['nombre'] ?? $c['producto'], number_format((float) $c['subtotal'], 2, '.', ''), number_format((float) $c['iva'], 2, '.', ''), number_format((float) $c['total'], 2, '.', ''),
            $c['comprador_cedula'], $c['comprador_nombre'], $c['comprador_email'], $c['comprador_telefono'], $c['jugador_email'], $c['plux_transaccion']]), ';', '"', '');
    }
    fclose($f);
    exit;
}

/** Formulario "Dar créditos a mano": queda en el registro con motivo 'manual'. */
function admin_dar_creditos(): array
{
    // Protección: el formulario lleva un código atado a la clave del panel y solo se acepta desde esta misma página.
    $origen = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origen !== '' && $origen !== Http::urlBase()) return ['error', 'Petición no permitida.'];
    if (!hash_equals(admin_csrf(), (string) ($_POST['csrf'] ?? ''))) return ['error', 'La página estuvo abierta mucho tiempo. Recárgala e intenta de nuevo.'];
    $email = trim((string) ($_POST['email'] ?? ''));
    $cant = filter_var($_POST['creditos'] ?? '', FILTER_VALIDATE_INT);
    $nota = mb_substr(trim((string) ($_POST['nota'] ?? '')), 0, 150);
    $j = Cuentas::porEmail($email);
    if (!$j) return ['error', 'No hay ningún jugador con el correo ' . $email . '.'];
    if ($cant === false || $cant === 0 || abs($cant) > 100000) return ['error', 'Escribe una cantidad de créditos (entre -100000 y 100000, distinta de 0).'];
    if ($nota === '') return ['error', 'Escribe el motivo (ej. "compra N° 12 no llegó" o "devolución").'];
    try {
        $saldo = Monedero::mover((int) $j['id'], $cant, 'manual', 'admin:' . $nota);
    } catch (\RuntimeException $e) {
        return ['error', 'No se pudo: ' . $e->getMessage() . ' (saldo actual: ' . Monedero::saldo((int) $j['id']) . ').'];
    }
    return ['ok', ($cant > 0 ? 'Se dieron ' : 'Se quitaron ') . abs($cant) . ' créditos a ' . $j['email'] . '. Saldo nuevo: ' . $saldo . '.'];
}

function admin_csrf(): string { return hash_hmac('sha256', 'envivo-admin-' . date('Y-m-d'), Config::get('ENVIVO_ADMIN_CLAVE_HASH')); }

function admin_pantalla(?array $mensaje): never
{
    $e = [Http::class, 'e'];
    $hoy = strtotime('today');
    $mes = strtotime(date('Y-m-01 00:00:00'));
    $suma = fn(int $desde) => Db::fila("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t, COALESCE(SUM(subtotal), 0) AS s, COALESCE(SUM(iva), 0) AS i FROM compras WHERE estado = 'pagado' AND pagado_en >= ?", [$desde]);
    $vHoy = $suma($hoy); $vMes = $suma($mes); $vTot = $suma(0);
    $jugadores = (int) Db::valor('SELECT COUNT(*) FROM jugadores');
    $vip = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE vip_hasta > ?', [time()]);
    $estado = admin_estado();
    $compras = admin_compras($estado, 200);
    $avisos = Db::todas('SELECT * FROM avisos ORDER BY id DESC LIMIT 20');
    $manuales = Db::todas("SELECT m.*, j.email FROM movimientos_creditos m JOIN jugadores j ON j.id = m.jugador_id WHERE m.motivo = 'manual' ORDER BY m.id DESC LIMIT 10");

    Http::cabecerasPagina();
    echo Http::inicioHtml('Panel');
    echo '<main class="caja ancha"><div class="marca">EN VIVO <b>Tycoon</b> · panel</div>';
    echo '<h1>Ventas</h1>';
    if ($mensaje) echo '<div class="aviso aviso-' . ($mensaje[0] === 'ok' ? 'ok' : 'error') . '" id="mensaje">' . $e($mensaje[1]) . '</div>';
    $t = fn(string $titulo, array $v) => '<div class="tarjeta"><span class="tenue">' . $e($titulo) . '</span><b>' . $e(Http::dinero($v['t'])) . '</b><span class="tenue">' . (int) $v['n'] . ' compras · sin IVA ' . $e(Http::dinero($v['s'])) . '</span></div>';
    echo '<div class="tarjetas">' . $t('Hoy', $vHoy) . $t('Este mes', $vMes) . $t('Total', $vTot)
       . '<div class="tarjeta"><span class="tenue">Jugadores</span><b id="num-jugadores">' . $jugadores . '</b><span class="tenue">' . $vip . ' con VIP activo</span></div></div>';
    echo '<p class="tenue">Ambiente de Plux: <b>' . $e(\EnVivo\Plux::ambiente()) . '</b>' . (\EnVivo\Plux::configurado() ? '' : ' · <b>sin credenciales</b> (la tienda no puede cobrar)') . '. Solo se suman las compras pagadas.</p>';

    echo '<h2>Compras</h2><div class="filtros">';
    foreach (['todas' => 'Todas', 'pagado' => 'Pagadas', 'pendiente' => 'Pendientes', 'rechazado' => 'Rechazadas'] as $k => $n) {
        echo '<a href="/admin.php?estado=' . $k . '"' . ($k === $estado ? ' class="activo"' : '') . '>' . $n . '</a>';
    }
    echo '<a href="/admin.php?a=csv&amp;estado=' . $estado . '">⬇ Exportar CSV (Excel)</a></div>';
    echo '<div class="tabla"><table><thead><tr><th>N°</th><th>Fecha</th><th>Estado</th><th>Producto</th><th>Total</th><th>Subtotal</th><th>IVA</th><th>Cédula</th><th>Nombre</th><th>Correo</th><th>Celular</th><th>Cuenta</th><th>Transacción</th></tr></thead><tbody>';
    if (!$compras) echo '<tr><td colspan="13" class="tenue">Todavía no hay compras.</td></tr>';
    foreach ($compras as $c) {
        $p = Catalogo::producto((string) $c['producto']);
        echo '<tr><td>' . (int) $c['id'] . '</td><td>' . $e(admin_fecha((int) ($c['pagado_en'] ?? $c['creado']))) . '</td><td class="estado-' . $e($c['estado']) . '">' . $e($c['estado']) . '</td>'
           . '<td>' . $e($p['nombre'] ?? $c['producto']) . '</td><td>' . $e(Http::dinero($c['total'])) . '</td><td>' . $e(Http::dinero($c['subtotal'])) . '</td><td>' . $e(Http::dinero($c['iva'])) . '</td>'
           . '<td>' . $e($c['comprador_cedula']) . '</td><td>' . $e($c['comprador_nombre']) . '</td><td>' . $e($c['comprador_email']) . '</td><td>' . $e($c['comprador_telefono']) . '</td>'
           . '<td>' . $e($c['jugador_email']) . '</td><td>' . $e($c['plux_transaccion']) . '</td></tr>';
    }
    echo '</tbody></table></div>';

    echo '<h2>Dar créditos a mano (soporte o devolución)</h2>'
       . '<form method="post" action="/admin.php" class="form-fila"><input type="hidden" name="csrf" value="' . $e(admin_csrf()) . '">'
       . '<label>Correo del jugador<input type="email" name="email" required maxlength="120"></label>'
       . '<label>Créditos (negativo para quitar)<input type="number" name="creditos" required step="1"></label>'
       . '<label>Motivo<input name="nota" required maxlength="150" placeholder="Ej. compra N° 12 no llegó"></label>'
       . '<button class="boton" type="submit">Dar créditos</button></form>';
    if ($manuales) {
        echo '<div class="tabla separada"><table><thead><tr><th>Fecha</th><th>Jugador</th><th>Créditos</th><th>Saldo</th><th>Motivo</th></tr></thead><tbody>';
        foreach ($manuales as $m) echo '<tr><td>' . $e(admin_fecha((int) $m['creado'])) . '</td><td>' . $e($m['email']) . '</td><td>' . (int) $m['cambio'] . '</td><td>' . (int) $m['saldo'] . '</td><td>' . $e(preg_replace('/^admin:/', '', (string) $m['ref'])) . '</td></tr>';
        echo '</tbody></table></div>';
    }

    echo '<h2>Avisos para revisar</h2>';
    if (!$avisos) echo '<p class="tenue">Nada para revisar.</p>';
    else {
        echo '<div class="tabla"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Compra</th><th>Detalle</th></tr></thead><tbody>';
        foreach ($avisos as $a) echo '<tr><td>' . $e(admin_fecha((int) $a['creado'])) . '</td><td>' . $e($a['tipo']) . '</td><td>' . $e((string) $a['compra_id']) . '</td><td class="largo">' . $e(mb_substr((string) $a['detalle'], 0, 400)) . '</td></tr>';
        echo '</tbody></table></div>';
    }
    echo '<p class="pie"><a href="/">← Ir al juego</a></p></main></body></html>';
    exit;
}
