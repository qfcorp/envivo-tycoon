<?php
declare(strict_types=1);

// API del juego EN VIVO Tycoon (todo lo que empieza con /api/). El contrato está en server/API.md.
// nginx manda aquí todas las direcciones /api/... (ver server/deploy/nginx-juego.conf.plantilla).

require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Catalogo, Chat, Compras, Cuentas, Db, Desafio, Duelos, Fallo, Google, Http, Inventario, Limite, Mercado, Monedero, Plux, Sesiones, Social, Soporte, Transferencias};

$ruta = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$ruta = '/' . trim(substr($ruta, strlen('/api')), '/');
$metodo = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    Db::pdo();   // abre la base y crea/actualiza las tablas si hace falta

    // El aviso de pago de Plux (webhook) llega desde Plux, sin la cabecera del juego: tiene su propia clave (Basic Auth).
    if ($ruta === '/plux/webhook') api_plux_webhook();
    // El regreso del banco (3DS) es una navegación normal del navegador (GET), no una petición del juego.
    if ($ruta === '/plux/3ds') api_plux_3ds();
    // Facturación SRI para el ERP del dueño (server/INTEGRAR_FACTURACION.md): firmada con HMAC, sin sesión ni X-Envivo
    if (class_exists(\EnVivo\FacturacionApi::class) && \EnVivo\FacturacionApi::esRuta($ruta)) \EnVivo\FacturacionApi::responder($ruta, $metodo);

    // Protección simple contra peticiones desde otros sitios (junto con SameSite=Lax de la galleta).
    if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
    if (!in_array($metodo, ['GET', 'POST'], true)) Http::error(405, 'Método no permitido.');

    $soloGet = fn() => $metodo === 'GET' || Http::error(405, 'Usa GET.');
    $soloPost = fn() => $metodo === 'POST' || Http::error(405, 'Usa POST.');

    // Módulos de monetización (server/MONETIZACION.md): cada línea solo responde si su módulo está instalado (class_exists)
    // Aceptación de Términos y Privacidad (server/INTEGRAR_CUENTA.md): /api/cuenta/terminos
    if (class_exists(\EnVivo\TerminosApi::class) && \EnVivo\TerminosApi::esRuta($ruta)) \EnVivo\TerminosApi::responder($ruta, $metodo, requiere_sesion());
    // Pase de Temporada (server/INTEGRAR_PASE.md): /api/pase*
    if (class_exists(\EnVivo\PaseApi::class) && \EnVivo\PaseApi::esRuta($ruta)) \EnVivo\PaseApi::responder($ruta, $metodo, requiere_sesion());
    // VIP 1–10, regalos de asociación y Mecenas (server/INTEGRAR_VIP.md): /api/vip* y /api/mecenas
    if (class_exists(\EnVivo\VipApi::class) && \EnVivo\VipApi::esRuta($ruta)) \EnVivo\VipApi::responder($ruta, $metodo, requiere_sesion());
    // Copa de Servidores (server/INTEGRAR_COPAS.md): /api/copa*
    if (\EnVivo\CopasApi::esRuta($ruta)) \EnVivo\CopasApi::responder($ruta, $metodo, requiere_sesion());
    // Personal estrella y Pase de Copa (server/INTEGRAR_ESTRELLAS.md): /api/estrellas* y /api/pase_copa/comprar
    if (class_exists(\EnVivo\EstrellasApi::class) && \EnVivo\EstrellasApi::esRuta($ruta)) \EnVivo\EstrellasApi::responder($ruta, $metodo, requiere_sesion());
    // Sede oficial (server/INTEGRAR_SEDE_OFICIAL.md): /api/sede*
    if (class_exists(\EnVivo\SedeApi::class) && \EnVivo\SedeApi::esRuta($ruta)) \EnVivo\SedeApi::responder($ruta, $metodo, requiere_sesion());
    // Impulsos: equipo de obra extra, Fondo de crecimiento y Tarjeta semanal (server/INTEGRAR_MONETIZACION2.md): /api/impulsos*
    if (class_exists(\EnVivo\ImpulsosApi::class) && \EnVivo\ImpulsosApi::esRuta($ruta)) \EnVivo\ImpulsosApi::responder($ruta, $metodo, requiere_sesion());
    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina
    if (\EnVivo\LigaApi::esRuta($ruta)) \EnVivo\LigaApi::responder($ruta, $metodo, requiere_sesion());
    // Duelo de Productoras y Desafío Técnico del Día (server/INTEGRAR_DUELOS_DESAFIO.md): /api/duelos* y /api/desafio*
    if (($r = Duelos::ruta($ruta, $metodo) ?? Desafio::ruta($ruta, $metodo)) !== null) Http::json(200, $r);

    // Salud de servidores, fusión y traslado voluntario (server/INTEGRAR_FUSIONES.md): /api/servidor/*
    if (($r = \EnVivo\Fusiones::ruta($ruta, $metodo)) !== null) Http::json(200, $r);

    match ($ruta) {
        '/estado' => $soloGet() && Http::json(200, \EnVivo\Universos::estado(Sesiones::jugadorId()) + \EnVivo\Fusiones::estado(Sesiones::jugadorId()) + Cuentas::estado(Sesiones::jugadorId()) + \EnVivo\Discord::estado(Sesiones::jugadorId())),
        '/registro' => $soloPost() && api_registro(),
        '/entrar' => $soloPost() && api_entrar(),
        '/salir' => $soloPost() && api_salir(),
        '/partida' => api_partida($metodo),
        // Versión de la partida y dispositivo activo, sin los datos (el juego la mira al volver a la pestaña y cada minuto)
        '/partida/meta' => $soloGet() && Http::json(200, ['ok' => true] + \EnVivo\Partidas::meta(requiere_sesion(), \EnVivo\Partidas::dispositivo($_GET['dispositivo'] ?? null))),
        '/partida/activar' => $soloPost() && Http::json(200, \EnVivo\Partidas::activar(requiere_sesion(), Http::entrada(10000))),
        '/gastar' => $soloPost() && api_gastar(),
        '/vip/bono' => $soloPost() && api_vip_bono(),
        '/orden' => $soloPost() && api_orden(),
        '/plux/pago' => $soloPost() && api_plux_pago(),
        // Mercado entre jugadores (server/MERCADO.md)
        '/mercado' => $soloGet() && api_mercado(),
        '/mercado/publicar' => $soloPost() && api_mercado_publicar(),
        '/mercado/retirar' => $soloPost() && api_mercado_retirar(),
        '/mercado/comprar' => $soloPost() && api_mercado_comprar(),
        // Servidores, perfil, asociaciones y chat (server/SOCIAL.md)
        '/perfil' => $soloPost() && Http::json(200, Social::guardarPerfil(requiere_sesion(), Http::entrada(10000))),
        '/asociaciones' => $soloGet() && Http::json(200, Social::listar(requiere_sesion(), is_string($_GET['buscar'] ?? null) ? $_GET['buscar'] : '')),
        '/asociaciones/crear' => $soloPost() && Http::json(200, Social::crear(requiere_sesion(), Http::entrada(10000))),
        '/asociaciones/unirse' => $soloPost() && Http::json(200, Social::unirse(requiere_sesion(), entero_de(Http::entrada(10000), 'id'))),
        '/asociaciones/salir' => $soloPost() && Http::json(200, Social::salir(requiere_sesion())),
        '/asociaciones/cargo' => $soloPost() && api_asoc_cargo(),
        '/asociaciones/expulsar' => $soloPost() && Http::json(200, Social::expulsar(requiere_sesion(), entero_de(Http::entrada(10000), 'jugador_id'))),
        '/asociaciones/solicitud' => $soloPost() && api_asoc_solicitud(),
        '/chat' => $metodo === 'GET' ? api_chat_leer() : api_chat_escribir(),
        '/chat/reportar' => $soloPost() && api_chat_reportar(),
        '/chat/bloquear' => $soloPost() && api_chat_bloquear(),
        '/chat/rapidos' => $soloGet() && Http::json(200, ['ok' => true, 'rapidos' => array_map(fn($k, $v) => ['id' => $k, 'texto' => $v], array_keys(Chat::RAPIDOS), Chat::RAPIDOS),
            'motivos_reporte' => array_map(fn($k, $v) => ['id' => $k, 'texto' => $v], array_keys(Chat::MOTIVOS_REPORTE), Chat::MOTIVOS_REPORTE)]),
        // Tarjeta mensual (20 créditos por día)
        '/tarjeta/reclamar' => $soloPost() && api_tarjeta_reclamar(),
        // Transferencia oficial de cuenta (src/Transferencias.php)
        '/cuenta/borrar' => $soloPost() && api_cuenta_borrar(),
        '/cuenta/transferir/iniciar' => $soloPost() && api_transferir_iniciar(),
        '/cuenta/transferir/confirmar' => $soloPost() && api_transferir_confirmar(),
        '/cuenta/transferir/cancelar' => $soloPost() && api_transferir_cancelar(),
        // Google Play (src/Google.php y GOOGLE_PLAY.md)
        '/google/verificar' => $soloPost() && api_google_verificar(),
        // Soporte dentro del juego (SOPORTE.md)
        '/soporte' => $metodo === 'GET' ? Http::json(200, Soporte::listar(requiere_sesion())) : Http::json(200, Soporte::crear(requiere_sesion(), Http::entrada(20000))),
        '/soporte/responder' => $soloPost() && api_soporte_responder(),
        '/soporte/leido' => $soloPost() && Http::json(200, Soporte::leido(requiere_sesion(), entero_de(Http::entrada(10000), 'caso_id'))),
        '/soporte/contacto' => $soloGet() && Http::json(200, Soporte::contacto()),
        // Bot de Discord (server/INTEGRAR_DISCORD.md)
        '/discord/codigo' => $soloPost() && Http::json(200, \EnVivo\Discord::codigoParaJugador(requiere_sesion())),
        '/discord/desvincular' => $soloPost() && Http::json(200, \EnVivo\Discord::desvincularJugador(requiere_sesion())),
        // Mega Festival (server/INTEGRAR_FESTIVAL.md)
        '/festival' => $soloGet() && Http::json(200, \EnVivo\Festival::resumen(requiere_sesion())),
        '/festival/intento/iniciar' => $soloPost() && Http::json(200, \EnVivo\Festival::iniciar(requiere_sesion(), Http::entrada(20000))),
        '/festival/intento/enviar' => $soloPost() && Http::json(200, \EnVivo\Festival::enviar(requiere_sesion(), Http::entrada(20000))),
        '/festival/pases/comprar' => $soloPost() && Http::json(200, \EnVivo\Festival::comprarPases(requiere_sesion(), Http::entrada(10000))),
        default => Http::error(404, 'No encontrado.'),
    };
} catch (Fallo $e) {
    Http::error($e->getCode() ?: 400, $e->getMessage(), $e->extra);
} catch (\Throwable $e) {
    error_log('EN VIVO api ' . $ruta . ': ' . get_class($e) . ' en ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 300));
    Http::error(500, 'Ocurrió un error en el servidor. Intenta otra vez en un momento.');
}

function requiere_sesion(): int
{
    $id = Sesiones::jugadorId();
    if ($id === null) Http::error(401, 'Entra a tu cuenta para continuar.', [], 'sesion_requerida');
    return $id;
}

function texto_de(array $in, string $k): string { return is_string($in[$k] ?? null) ? $in[$k] : ''; }

/** Número entero positivo del JSON (acepta 12 o "12"); si no viene bien, 400. */
function entero_de(array $in, string $k): int
{
    $v = $in[$k] ?? null;
    if (is_int($v) && $v > 0) return $v;
    if (is_string($v) && preg_match('/^[1-9]\d{0,12}$/', $v)) return (int) $v;
    throw new Fallo('Falta "' . $k . '".', 400, ['codigo' => 'falta_' . $k]);
}

function api_registro(): never
{
    $in = Http::entrada(10000);
    if (Limite::contar('registro:' . Http::ip(), 50, 60)) Http::error(429, 'Demasiados registros desde esta conexión. Espera un rato e intenta de nuevo.', [], 'limite_intentos');
    \EnVivo\Terminos::revisar($in);   // acepta_terminos y edad_16 (server/INTEGRAR_CUENTA.md)
    $id = Cuentas::registrar(texto_de($in, 'email'), texto_de($in, 'nombre'), texto_de($in, 'clave'));
    \EnVivo\Terminos::aceptar($id, 'registro');
    Sesiones::abrir($id);
    Http::json(200, \EnVivo\Universos::estado($id) + \EnVivo\Fusiones::estado($id) + Cuentas::estado($id) + \EnVivo\Discord::estado($id));
}

function api_entrar(): never
{
    $in = Http::entrada(10000);
    $email = Cuentas::normalizarEmail(texto_de($in, 'email'));
    $kEmail = 'entrar:' . hash('sha256', $email);
    $kIp = 'entrarip:' . Http::ip();
    // Límite: 5 claves equivocadas por correo y 60 intentos por conexión cada 10 minutos (en Ecuador muchos celulares
    // comparten la misma IP de la operadora, por eso el límite por conexión es más alto).
    if (Limite::excedido($kEmail, 5) || Limite::contar($kIp, 60)) Http::error(429, 'Demasiados intentos. Espera 10 minutos e intenta de nuevo.', [], 'limite_intentos');
    $id = $email === '' ? null : Cuentas::verificar($email, texto_de($in, 'clave'));
    if ($id === null) {
        Limite::sumar($kEmail);
        Http::error(401, 'Correo o clave incorrectos.', [], 'credenciales_invalidas');
    }
    Sesiones::abrir($id);
    Http::json(200, \EnVivo\Universos::estado($id) + \EnVivo\Fusiones::estado($id) + Cuentas::estado($id) + \EnVivo\Discord::estado($id));
}

function api_salir(): never
{
    Sesiones::cerrar();
    Http::json(200, ['ok' => true]);
}

function api_partida(string $metodo): never
{
    $j = requiere_sesion();
    if ($metodo === 'GET') Http::json(200, \EnVivo\Partidas::leer($j));
    if ($metodo !== 'POST') Http::error(405, 'Usa GET o POST.');
    // Con versión (base) y dispositivo: no pisa una partida más nueva de otro dispositivo (src/Partidas.php)
    Http::json(200, \EnVivo\Partidas::guardar($j, Http::entrada(2 * 1024 * 1024)));
}

function api_gastar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    Cuentas::exigirActiva($j);
    try {
        [$saldo, $entrega, $equipo] = Monedero::gastar($j, texto_de($in, 'item'));
    } catch (Fallo $e) {
        throw $e;
    } catch (\InvalidArgumentException | \RuntimeException $e) {
        $extra = ['creditos' => Monedero::saldo($j)];
        $cod = match ((int) $e->getCode()) { 402 => 'sin_creditos', 403 => 'vip_requerido', 404 => 'no_existe', default => 'error' };
        if ($cod === 'vip_requerido') $extra['motivo'] = 'vip_requerido';
        Http::error($e->getCode() ?: 400, $e->getMessage(), $extra, $cod);
    }
    // Equipos: "entrega" es null y llega "item" (la fila del inventario) + el inventario completo para reconciliar la bodega
    $r = ['ok' => true, 'creditos' => $saldo, 'entrega' => $entrega];
    if ($equipo !== null) $r += ['item' => $equipo, 'inventario' => Inventario::deJugador($j)];
    Http::json(200, $r);
}

function api_vip_bono(): never
{
    $j = requiere_sesion();
    try {
        [$saldo, $entrega] = Monedero::bonoVip($j);
    } catch (Fallo $e) {
        throw $e;
    } catch (\RuntimeException $e) {
        Http::error($e->getCode() ?: 400, $e->getMessage(), [], (int) $e->getCode() === 403 ? 'vip_requerido' : 'ya_reclamado');
    }
    Http::json(200, ['ok' => true, 'creditos' => $saldo, 'entrega' => $entrega]);
}

function api_orden(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    if (Limite::contar('orden:' . $j, 30)) Http::error(429, 'Demasiados intentos de compra. Espera unos minutos.', [], 'limite_intentos');
    $c = Compras::crear($j, texto_de($in, 'producto'));
    Http::json(200, ['ok' => true, 'url' => '/pago.php?o=' . $c['token'], 'compra' => ['id' => (int) $c['id'], 'producto' => $c['producto'], 'total' => (float) $c['total']]]);
}

/** Respuestas de /api/plux/pago (mismo formato que TuPass: status success|otp_required|otp_incorrecto|3ds_required|failed). */
function pago_json(int $http, array $d): never
{
    if (($d['status'] ?? '') === 'failed') { $d += ['ok' => false, 'error' => $d['message'] ?? 'El pago no se pudo procesar.']; $d['codigo'] ??= $http >= 400 ? (Http::CODIGOS[$http] ?? 'error') : 'pago_rechazado'; }
    Http::json($http, $d);
}

function api_plux_pago(): never
{
    $in = Http::entrada(20000);
    $j = Sesiones::jugadorId();
    if ($j === null) pago_json(401, ['status' => 'failed', 'message' => 'Tu sesión se cerró. Entra otra vez a tu cuenta en el juego.']);
    $c = Compras::porToken(texto_de($in, 'o'));
    if (!$c || (int) $c['jugador_id'] !== $j) pago_json(404, ['status' => 'failed', 'message' => 'Compra no encontrada.']);
    if ($c['estado'] === 'pagado') pago_json(200, ['status' => 'success', 'ir' => '/?compra=ok']);
    if ($c['estado'] !== 'pendiente') pago_json(409, ['status' => 'failed', 'message' => 'Esta compra ya no está abierta. Vuelve al juego y empieza otra.']);
    if (!Plux::configurado()) pago_json(503, ['status' => 'failed', 'message' => 'El pago con tarjeta no está disponible.', 'codigo' => 'plux_no_disponible']);
    if (Ajustes::mantenimiento()) pago_json(503, ['status' => 'failed', 'message' => Ajustes::mensajeMantenimiento(), 'codigo' => 'mantenimiento']);
    if (Cuentas::estadoCuenta($j) !== 'activo') pago_json(403, ['status' => 'failed', 'message' => Cuentas::aviso(Cuentas::estadoCuenta($j)) ?? 'Tu cuenta no está activa.', 'codigo' => 'cuenta_suspendida']);
    $p = Catalogo::productoCompra((string) $c['producto']);
    if ($p && $p['una_vez'] && Compras::yaComprado($j, (string) $c['producto'])) {
        pago_json(409, ['status' => 'failed', 'message' => 'Ya compraste el ' . $p['nombre'] . '. Solo se puede comprar una vez: no se hizo ningún cobro.', 'codigo' => 'ya_comprado']);
    }
    if (Limite::contar('plux:' . $c['id'], 12) || Limite::contar('pluxip:' . Http::ip(), 40)) {
        pago_json(429, ['status' => 'failed', 'message' => 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', 'codigo' => 'limite_intentos']);
    }
    $clave = texto_de($in, 'simetricKeyCifrada');
    if (!preg_match('#^[A-Za-z0-9+/=]{40,1200}$#', $clave)) pago_json(422, ['status' => 'failed', 'message' => 'No se pudo preparar el pago. Recarga la página.']);
    try {
        $comprador = Plux::comprador($in, Cuentas::porId($j));
        // Datos de la factura SRI (titular, otro/RUC o consumidor final): se revisan ANTES de cobrar (INTEGRAR_FACTURACION.md)
        $factura = class_exists(\EnVivo\Facturacion::class) ? \EnVivo\Facturacion::datosDePago($in, $comprador, $c, Cuentas::porId($j)) : null;
        $cuerpo = Plux::cuerpo($c, $comprador, $in);
    } catch (\RuntimeException $e) {
        pago_json(422, ['status' => 'failed', 'message' => $e->getMessage()] + ($e instanceof Fallo && is_string($e->extra['codigo'] ?? null) ? ['codigo' => $e->extra['codigo']] : []));
    }
    $conOtp = isset($cuerpo['paramsOtp']);
    // Auditoría A-03: se "toma" la compra ANTES de llamar a Plux (en un solo UPDATE). Si llega otro pedido a la vez
    // (doble toque, dos pestañas), ese no llama a Plux: así nunca se cobra dos veces la misma compra.
    // El código OTP solo se acepta si la compra está esperando el OTP.
    $ahora = time();
    $tomada = Db::q("UPDATE compras SET plux_paso = 'procesando', plux_desde = ? WHERE id = ? AND estado = 'pendiente'
                     AND (plux_paso IS NULL OR plux_paso <> 'procesando' OR plux_desde < ?)" . ($conOtp ? " AND plux_paso = 'otp'" : ''),
        [$ahora, $c['id'], $ahora - 120])->rowCount();
    if ($tomada !== 1) {
        $paso = (string) Db::valor('SELECT plux_paso FROM compras WHERE id = ?', [$c['id']]);
        if ($paso === 'pagado') pago_json(200, ['status' => 'success', 'ir' => '/?compra=ok']);
        pago_json(409, $conOtp && $paso !== 'procesando'
            ? ['status' => 'failed', 'message' => 'El código ya no es válido. Vuelve a escribir los datos de tu tarjeta.', 'codigo' => 'otp_vencido']
            : ['status' => 'failed', 'message' => 'Ya estamos procesando este pago. Espera unos segundos: no lo mandes otra vez.', 'codigo' => 'pago_en_proceso']);
    }
    Compras::anotarComprador((int) $c['id'], $comprador);   // para la factura (sin datos de tarjeta)
    if ($factura !== null) \EnVivo\Facturacion::anotarDatos((int) $c['id'], $factura);   // lo que eligió para la factura SRI
    Sesiones::recordarCompra((int) $c['id']);              // para reconocerla al volver del banco (3DS)
    $r = Plux::llamar(Plux::RUTA_PAGO, $cuerpo, $clave);
    unset($cuerpo, $in);   // la tarjeta (cifrada) no se guarda en ningún lado
    $res = Plux::procesar($c, $r, $conOtp ? 'tarjeta con código OTP' : 'tarjeta');
    if ($res['status'] === 'success') $res['ir'] = '/?compra=ok';
    pago_json(200, $res);
}

/** Regreso del banco después de la validación 3DS. La dirección va SIN parámetros propios: la compra se reconoce por la sesión. */
function api_plux_3ds(): never
{
    $g = fn(string $k, int $n) => mb_substr(trim(is_string($_GET[$k] ?? null) ? $_GET[$k] : (is_string($_POST[$k] ?? null) ? $_POST[$k] : '')), 0, $n);
    $pti = $g('pti', 500); $pcc = $g('pcc', 500); $ptk = $g('ptk', 2000);
    $j = Sesiones::jugadorId();
    $cid = Sesiones::compraRecordada();
    $c = $cid ? Compras::porId($cid) : null;
    if ($c && (int) $c['jugador_id'] !== $j) $c = null;
    if (Limite::contar('plux3ds:' . Http::ip(), 30)) Http::pagina(429, 'Demasiados intentos', 'Espera unos minutos e intenta de nuevo.');
    if ($c && $c['estado'] === 'pagado') Http::redirigir('/?compra=ok');   // recargar la página no cobra ni entrega otra vez
    if ($pti === '' || $pcc === '' || $ptk === '') {
        if ($c) Http::redirigir('/pago.php?o=' . $c['token'] . '&r=incompleto');
        Http::pagina(400, 'Pago no completado', 'La respuesta del banco llegó incompleta.');
    }
    // Auditoría A-02: cada confirmación del banco (ptk) se usa UNA sola vez, para cualquier compra.
    $usada = Db::q('INSERT OR IGNORE INTO plux_3ds_usados (ptk_hash, compra_id, creado) VALUES (?, ?, ?)', [hash('sha256', $ptk), $c['id'] ?? null, time()])->rowCount() === 0;
    if ($usada) {
        if ($c) Http::redirigir('/pago.php?o=' . $c['token'] . '&r=rechazado');
        Http::pagina(409, 'Pago no completado', 'Esa confirmación del banco ya se usó.');
    }
    $r = Plux::llamar(Plux::RUTA_3DS, ['pti' => $pti, 'pcc' => $pcc, 'ptk' => $ptk]);
    $tr = Plux::transaccion($r);
    if (!$c) {
        // Sin sesión (otro navegador o se borraron las galletas): se intenta por el número de transacción.
        $c = $tr !== '' ? Db::fila('SELECT * FROM compras WHERE plux_transaccion = ?', [$tr]) : null;
    }
    if (!$c) {
        if ((int) ($r['code'] ?? -1) === 0) {
            Db::aviso('plux_sin_relacionar', 'Plux aprobó un pago con validación 3DS que no se pudo relacionar con una compra (el navegador perdió la sesión). Revisar en Plux y entregar a mano: ' . Plux::texto($r));
            Http::pagina(200, 'Pago aprobado por tu banco', 'Tu pago fue aprobado, pero no pudimos reconocer tu cuenta. Toma una captura de esta pantalla y escríbenos a soporte para entregarte tu compra.');
        }
        Http::pagina(402, 'Pago no completado', 'El banco no aprobó la transacción.');
    }
    if ($c['estado'] === 'pagado') Http::redirigir('/?compra=ok');
    if ($c['estado'] !== 'pendiente') Http::redirigir('/pago.php?o=' . $c['token']);
    // Auditoría A-02: la aprobación debe ser de ESTA compra: tiene que estar esperando 3DS, el número de transacción
    // debe ser el que Plux dio en el paso 103 (si lo dio) y el valor (si Plux lo manda) debe ser el de la compra.
    if ((int) ($r['code'] ?? -1) === 0) {
        $esperada = (string) ($c['plux_transaccion'] ?? '');
        $monto = Plux::monto($r);
        $motivo = match (true) {
            $c['plux_paso'] !== '3ds' => 'la compra no estaba esperando la validación del banco (paso ' . ($c['plux_paso'] ?? 'ninguno') . ')',
            $esperada !== '' && $tr !== $esperada => 'el número de transacción no coincide (' . $tr . ' en vez de ' . $esperada . ')',
            $esperada === '' && $tr !== '' && (bool) Db::valor('SELECT 1 FROM compras WHERE plux_transaccion = ? AND id <> ?', [$tr, $c['id']]) => 'esa transacción ya es de otra compra',
            $monto !== null && abs($monto - (float) $c['total']) > 0.009 => 'el valor no coincide (' . $monto . ' en vez de ' . $c['total'] . ')',
            default => '',
        };
        if ($motivo !== '') {
            Db::aviso('plux_3ds_no_coincide', 'Confirmación 3DS aprobada por Plux pero NO aplicada a la compra N° ' . $c['id'] . ': ' . $motivo . '. Respuesta: ' . Plux::texto($r), (int) $c['id']);
            Compras::anotarPaso((int) $c['id'], 'fallido', Plux::texto($r));
            Http::redirigir('/pago.php?o=' . $c['token'] . '&r=rechazado');
        }
    }
    $res = Plux::procesar($c, $r, 'validación 3DS');
    if ($res['status'] === 'success') Http::redirigir('/?compra=ok');
    Http::redirigir('/pago.php?o=' . $c['token'] . '&r=rechazado');
}

/** Aviso de pago de Plux (POST JSON con Basic Auth). Estado PAGADO o RECHAZADO. No es obligatorio: el juego funciona sin él. */
function api_plux_webhook(): never
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') Http::error(405, 'Use POST.');
    $usu = \EnVivo\Config::get('PLUX_WEBHOOK_USUARIO'); $cla = \EnVivo\Config::get('PLUX_WEBHOOK_CLAVE');
    if ($usu === '' || $cla === '') Http::error(503, 'Aviso de pago sin configurar.');
    if (Limite::excedido('webhook:' . Http::ip(), 30)) Http::error(429, 'Demasiados intentos.');
    $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
    $u = (string) ($_SERVER['PHP_AUTH_USER'] ?? ''); $k = (string) ($_SERVER['PHP_AUTH_PW'] ?? '');
    if ($u === '' && preg_match('/^Basic\s+([A-Za-z0-9+\/=]+)$/i', $auth, $m)) [$u, $k] = array_pad(explode(':', (string) base64_decode($m[1]), 2), 2, '');
    if (!hash_equals($usu, $u) | !hash_equals($cla, $k)) {
        Limite::sumar('webhook:' . Http::ip());
        header('WWW-Authenticate: Basic realm="EN VIVO Tycoon"');
        Http::error(401, 'No autorizado.');
    }
    $in = Http::entrada(50000);
    if ($in === []) Http::error(400, 'El aviso no es JSON.');
    $plano = [];
    array_walk_recursive($in, function ($v, $key) use (&$plano) { if (is_scalar($v)) $plano[strtolower((string) $key)][] = (string) $v; });
    $primero = function (array $claves) use ($plano): string { foreach ($claves as $x) if (!empty($plano[$x][0])) return $plano[$x][0]; return ''; };
    $estado = strtoupper($primero(['state', 'estado', 'status']));
    if (!in_array($estado, ['PAGADO', 'RECHAZADO'], true)) Http::error(422, 'Estado desconocido (se espera PAGADO o RECHAZADO).');
    // ¿De cuál compra? 1) el número de transacción de Plux  2) la referencia "EV-<id>" que va en la descripción
    $c = null;
    $tr = $primero(['id_transaccion', 'idtransaccion', 'idtransaction', 'transactionid', 'id_transaction', 'token', 'voucher']);
    if ($tr !== '') $c = Db::fila('SELECT * FROM compras WHERE plux_transaccion = ?', [$tr]);
    if (!$c) foreach ($plano as $vals) foreach ($vals as $v) if (preg_match('/\bEV-(\d{1,10})\b/', $v, $mm)) { $c = Compras::porId((int) $mm[1]); break 2; }
    $txt = Plux::texto($in);
    if (!$c) { Db::aviso('plux_aviso_sin_compra', 'Aviso de Plux (' . $estado . ') que no corresponde a ninguna compra: ' . $txt); Http::error(404, 'Compra no encontrada.'); }
    $id = (int) $c['id'];
    $monto = $primero(['amount', 'monto', 'total', 'valor']);
    if ($monto === '' || !is_numeric($monto) || abs((float) $monto - (float) $c['total']) > 0.009) {
        if ($estado === 'PAGADO') {
            Db::aviso('plux_aviso_monto', 'Aviso de Plux PAGADO para la compra N° ' . $id . ' con otro valor (' . ($monto === '' ? 'sin valor' : $monto) . ' en vez de ' . $c['total'] . '): NO se aplicó', $id);
            Http::error(409, 'El valor no coincide con la compra.');
        }
    }
    if ($estado === 'PAGADO') {
        $nuevo = Compras::aprobar($id, 'Plux (aviso de pago)', $tr !== '' ? $tr : null, $txt);
        Http::json(200, ['ok' => true, 'compra' => $id, 'resultado' => $nuevo ? 'pagado' : 'ya_estaba_pagado']);
    }
    if ($c['estado'] === 'pagado') {
        Db::aviso('plux_aviso_rechazo', 'Plux avisó RECHAZADO de la compra N° ' . $id . ' que ya estaba pagada: revisar con Plux (lo entregado NO se quitó solo).', $id);
        Http::json(200, ['ok' => true, 'compra' => $id, 'resultado' => 'revisar']);
    }
    $nuevo = Compras::rechazar($id, $txt);
    Http::json(200, ['ok' => true, 'compra' => $id, 'resultado' => $nuevo ? 'rechazado' : 'ya_estaba_' . $c['estado']]);
}

// ---------------------------------------------------------------------------------------------- mercado
function api_mercado(): never
{
    $j = requiere_sesion();
    $item = is_string($_GET['item'] ?? null) ? $_GET['item'] : '';
    $orden = is_string($_GET['orden'] ?? null) ? $_GET['orden'] : 'precio';
    $pag = is_string($_GET['pagina'] ?? null) && ctype_digit($_GET['pagina']) ? (int) $_GET['pagina'] : 1;
    Http::json(200, Mercado::listar($j, $item, $orden, $pag));
}

function api_mercado_publicar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    if (Limite::contar('mercado:' . $j, 60)) Http::error(429, 'Demasiadas operaciones en el mercado. Espera unos minutos.');
    $pub = Mercado::publicar($j, entero_de($in, 'inventario_id'), $in['precio'] ?? null);
    Http::json(200, ['ok' => true, 'publicacion' => $pub, 'inventario' => Inventario::deJugador($j)]);
}

function api_mercado_retirar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    $item = Mercado::retirar($j, entero_de($in, 'publicacion_id'));
    Http::json(200, ['ok' => true, 'item' => $item, 'inventario' => Inventario::deJugador($j)]);
}

function api_mercado_comprar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    if (Limite::contar('mercado:' . $j, 60)) Http::error(429, 'Demasiadas operaciones en el mercado. Espera unos minutos.');
    [$saldo, $item] = Mercado::comprar($j, entero_de($in, 'publicacion_id'));
    Http::json(200, ['ok' => true, 'creditos' => $saldo, 'item' => $item, 'inventario' => Inventario::deJugador($j)]);
}

// ---------------------------------------------------------------------------------------------- asociaciones
function api_asoc_cargo(): never
{
    $in = Http::entrada(10000);
    Http::json(200, Social::cargo(requiere_sesion(), entero_de($in, 'jugador_id'), texto_de($in, 'cargo')));
}

function api_asoc_solicitud(): never
{
    $in = Http::entrada(10000);
    $a = $in['aceptar'] ?? null;
    if (!is_bool($a)) throw new Fallo('Falta "aceptar" (true o false).', 400);
    Http::json(200, Social::solicitud(requiere_sesion(), entero_de($in, 'jugador_id'), $a));
}

// ---------------------------------------------------------------------------------------------- chat
function api_chat_leer(): never
{
    $j = requiere_sesion();
    $canal = is_string($_GET['canal'] ?? null) ? $_GET['canal'] : 'servidor';
    $desde = is_string($_GET['desde'] ?? null) && ctype_digit($_GET['desde']) ? (int) $_GET['desde'] : 0;
    $coal = is_string($_GET['coalicion'] ?? null) && ctype_digit($_GET['coalicion']) ? (int) $_GET['coalicion'] : null;
    Http::json(200, Chat::leer($j, $canal, $desde, $coal));
}

function api_chat_escribir(): never
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') Http::error(405, 'Usa GET o POST.');
    $j = requiere_sesion();
    \EnVivo\Terminos::exigir($j);   // sin aceptar los términos no se escribe (server/INTEGRAR_CUENTA.md)
    Http::json(200, Chat::escribir($j, Http::entrada(10000)));
}

function api_chat_reportar(): never
{
    $in = Http::entrada(10000);
    Http::json(200, Chat::reportar(requiere_sesion(), entero_de($in, 'mensaje_id'), texto_de($in, 'motivo')));
}

function api_chat_bloquear(): never
{
    $in = Http::entrada(10000);
    Http::json(200, Chat::bloquear(requiere_sesion(), entero_de($in, 'jugador_id'), ($in['desbloquear'] ?? false) === true));
}

// ---------------------------------------------------------------------------------------------- tarjeta mensual
function api_tarjeta_reclamar(): never
{
    $j = requiere_sesion();
    $saldo = Monedero::reclamarTarjeta($j);
    Http::json(200, ['ok' => true, 'creditos' => $saldo, 'recibidos' => (int) Catalogo::PRODUCTOS['tarjeta_mensual']['creditos_dia'], 'tarjeta_reclamada_hoy' => true]);
}

// ---------------------------------------------------------------------------------------------- transferencia de cuenta
function api_transferir_iniciar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    if (Limite::contar('transferir:' . $j, 10, 60)) Http::error(429, 'Demasiados intentos. Espera un rato.', [], 'limite_intentos');
    $r = Transferencias::iniciar($j, texto_de($in, 'email_nuevo'));
    Http::json(200, ['ok' => true] + $r);
}

function api_transferir_confirmar(): never
{
    $in = Http::entrada(10000);
    $j = Transferencias::confirmar(texto_de($in, 'email'), texto_de($in, 'codigo'), texto_de($in, 'clave'), texto_de($in, 'nombre'));
    Sesiones::abrir($j);   // el nuevo dueño queda con la sesión abierta
    Http::json(200, \EnVivo\Universos::estado($j) + \EnVivo\Fusiones::estado($j) + Cuentas::estado($j) + \EnVivo\Discord::estado($j));
}

function api_transferir_cancelar(): never
{
    $j = requiere_sesion();
    $t = Transferencias::abierta($j);
    if (!$t) Http::error(404, 'No tienes una transferencia en curso.', [], 'sin_transferencia');
    Transferencias::cancelar((int) $t['id'], 'jugador', $j);
    Http::json(200, ['ok' => true]);
}

// ---------------------------------------------------------------------------------------------- Google Play
function api_google_verificar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    if (Limite::contar('google:' . $j, 30)) Http::error(429, 'Demasiados intentos. Espera unos minutos.', [], 'limite_intentos');
    $r = Google::verificar($j, texto_de($in, 'producto'), texto_de($in, 'purchaseToken'), texto_de($in, 'orderId'));
    $c = $r['compra'];
    Http::json(200, ['ok' => true, 'nueva' => $r['nueva'], 'compra' => ['id' => (int) $c['id'], 'producto' => $c['producto'], 'estado' => $c['estado'], 'canal' => $c['canal']]] + \EnVivo\Universos::estado($j) + \EnVivo\Fusiones::estado($j) + Cuentas::estado($j) + \EnVivo\Discord::estado($j));
}

// ---------------------------------------------------------------------------------------------- soporte
function api_soporte_responder(): never
{
    $in = Http::entrada(20000);
    Http::json(200, Soporte::responder(requiere_sesion(), entero_de($in, 'caso_id'), $in['mensaje'] ?? ''));
}

// ---------------------------------------------------------------------------------------------- borrar la cuenta
/** POST /api/cuenta/borrar {clave, confirmar: "BORRAR"}: borra la cuenta del jugador con sesión (ver Cuentas::borrar). */
function api_cuenta_borrar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    if (texto_de($in, 'confirmar') !== 'BORRAR') throw new Fallo('Para borrar tu cuenta escribe BORRAR en mayúsculas.', 400, ['codigo' => 'confirmacion_requerida']);
    Cuentas::borrar($j, texto_de($in, 'clave'));
    Sesiones::cerrar();
    Http::json(200, ['ok' => true, 'borrada' => true]);
}
