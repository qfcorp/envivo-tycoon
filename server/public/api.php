<?php
declare(strict_types=1);

// API del juego EN VIVO Tycoon (todo lo que empieza con /api/). El contrato está en server/API.md.
// nginx manda aquí todas las direcciones /api/... (ver server/deploy/nginx-juego.conf.plantilla).

require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Catalogo, Compras, Cuentas, Db, Http, Limite, Monedero, Plux, Sesiones};

$ruta = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$ruta = '/' . trim(substr($ruta, strlen('/api')), '/');
$metodo = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    Db::pdo();   // abre la base y crea/actualiza las tablas si hace falta

    // El aviso de pago de Plux (webhook) llega desde Plux, sin la cabecera del juego: tiene su propia clave (Basic Auth).
    if ($ruta === '/plux/webhook') api_plux_webhook();
    // El regreso del banco (3DS) es una navegación normal del navegador (GET), no una petición del juego.
    if ($ruta === '/plux/3ds') api_plux_3ds();

    // Protección simple contra peticiones desde otros sitios (junto con SameSite=Lax de la galleta).
    if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.');
    if (!in_array($metodo, ['GET', 'POST'], true)) Http::error(405, 'Método no permitido.');

    $soloGet = fn() => $metodo === 'GET' || Http::error(405, 'Usa GET.');
    $soloPost = fn() => $metodo === 'POST' || Http::error(405, 'Usa POST.');

    match ($ruta) {
        '/estado' => $soloGet() && Http::json(200, Cuentas::estado(Sesiones::jugadorId())),
        '/registro' => $soloPost() && api_registro(),
        '/entrar' => $soloPost() && api_entrar(),
        '/salir' => $soloPost() && api_salir(),
        '/partida' => api_partida($metodo),
        '/gastar' => $soloPost() && api_gastar(),
        '/vip/bono' => $soloPost() && api_vip_bono(),
        '/orden' => $soloPost() && api_orden(),
        '/plux/pago' => $soloPost() && api_plux_pago(),
        default => Http::error(404, 'No encontrado.'),
    };
} catch (\Throwable $e) {
    error_log('EN VIVO api ' . $ruta . ': ' . get_class($e) . ' en ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 300));
    Http::error(500, 'Ocurrió un error en el servidor. Intenta otra vez en un momento.');
}

function requiere_sesion(): int
{
    $id = Sesiones::jugadorId();
    if ($id === null) Http::error(401, 'Entra a tu cuenta para continuar.');
    return $id;
}

function texto_de(array $in, string $k): string { return is_string($in[$k] ?? null) ? $in[$k] : ''; }

function api_registro(): never
{
    $in = Http::entrada(10000);
    if (Limite::contar('registro:' . Http::ip(), 50, 60)) Http::error(429, 'Demasiados registros desde esta conexión. Espera un rato e intenta de nuevo.');
    try {
        $id = Cuentas::registrar(texto_de($in, 'email'), texto_de($in, 'nombre'), texto_de($in, 'clave'));
    } catch (\InvalidArgumentException $e) {
        Http::error($e->getCode() ?: 400, $e->getMessage());
    }
    Sesiones::abrir($id);
    Http::json(200, Cuentas::estado($id));
}

function api_entrar(): never
{
    $in = Http::entrada(10000);
    $email = Cuentas::normalizarEmail(texto_de($in, 'email'));
    $kEmail = 'entrar:' . hash('sha256', $email);
    $kIp = 'entrarip:' . Http::ip();
    // Límite: 5 claves equivocadas por correo y 60 intentos por conexión cada 10 minutos (en Ecuador muchos celulares
    // comparten la misma IP de la operadora, por eso el límite por conexión es más alto).
    if (Limite::excedido($kEmail, 5) || Limite::contar($kIp, 60)) Http::error(429, 'Demasiados intentos. Espera 10 minutos e intenta de nuevo.');
    $id = $email === '' ? null : Cuentas::verificar($email, texto_de($in, 'clave'));
    if ($id === null) {
        Limite::sumar($kEmail);
        Http::error(401, 'Correo o clave incorrectos.');
    }
    Sesiones::abrir($id);
    Http::json(200, Cuentas::estado($id));
}

function api_salir(): never
{
    Sesiones::cerrar();
    Http::json(200, ['ok' => true]);
}

function api_partida(string $metodo): never
{
    $j = requiere_sesion();
    if ($metodo === 'GET') {
        $p = Db::fila('SELECT datos, actualizado FROM partidas WHERE jugador_id = ?', [$j]);
        Http::json(200, ['ok' => true, 'datos' => $p['datos'] ?? null, 'actualizado' => $p ? Db::iso((int) $p['actualizado']) : null]);
    }
    if ($metodo !== 'POST') Http::error(405, 'Usa GET o POST.');
    $in = Http::entrada(2 * 1024 * 1024);
    $datos = $in['datos'] ?? null;
    if (!is_string($datos) || $datos === '') Http::error(400, 'No llegó la partida.');
    if (strlen($datos) > 300 * 1024) Http::error(413, 'La partida es demasiado grande (máximo 300 KB).');
    if (!json_validate($datos)) Http::error(400, 'La partida no es un JSON válido.');
    $t = time();
    Db::q('INSERT INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado', [$j, $datos, $t]);
    Http::json(200, ['ok' => true, 'actualizado' => Db::iso($t)]);
}

function api_gastar(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    try {
        [$saldo, $entrega] = Monedero::gastar($j, texto_de($in, 'item'));
    } catch (\InvalidArgumentException | \RuntimeException $e) {
        Http::error($e->getCode() ?: 400, $e->getMessage(), ['creditos' => Monedero::saldo($j)]);
    }
    Http::json(200, ['ok' => true, 'creditos' => $saldo, 'entrega' => $entrega]);
}

function api_vip_bono(): never
{
    $j = requiere_sesion();
    try {
        [$saldo, $entrega] = Monedero::bonoVip($j);
    } catch (\RuntimeException $e) {
        Http::error($e->getCode() ?: 400, $e->getMessage());
    }
    Http::json(200, ['ok' => true, 'creditos' => $saldo, 'entrega' => $entrega]);
}

function api_orden(): never
{
    $j = requiere_sesion();
    $in = Http::entrada(10000);
    if (Limite::contar('orden:' . $j, 30)) Http::error(429, 'Demasiados intentos de compra. Espera unos minutos.');
    try {
        $c = Compras::crear($j, texto_de($in, 'producto'));
    } catch (\RuntimeException $e) {
        Http::error($e->getCode() ?: 400, $e->getMessage());
    }
    Http::json(200, ['ok' => true, 'url' => '/pago.php?o=' . $c['token'], 'compra' => ['id' => (int) $c['id'], 'producto' => $c['producto'], 'total' => (float) $c['total']]]);
}

/** Respuestas de /api/plux/pago (mismo formato que TuPass: status success|otp_required|otp_incorrecto|3ds_required|failed). */
function pago_json(int $http, array $d): never { Http::json($http, $d); }

function api_plux_pago(): never
{
    $in = Http::entrada(20000);
    $j = Sesiones::jugadorId();
    if ($j === null) pago_json(401, ['status' => 'failed', 'message' => 'Tu sesión se cerró. Entra otra vez a tu cuenta en el juego.']);
    $c = Compras::porToken(texto_de($in, 'o'));
    if (!$c || (int) $c['jugador_id'] !== $j) pago_json(404, ['status' => 'failed', 'message' => 'Compra no encontrada.']);
    if ($c['estado'] === 'pagado') pago_json(200, ['status' => 'success', 'ir' => '/?compra=ok']);
    if ($c['estado'] !== 'pendiente') pago_json(409, ['status' => 'failed', 'message' => 'Esta compra ya no está abierta. Vuelve al juego y empieza otra.']);
    if (!Plux::configurado()) pago_json(503, ['status' => 'failed', 'message' => 'El pago con tarjeta no está disponible.']);
    $p = Catalogo::producto((string) $c['producto']);
    if ($p && $p['una_vez'] && Compras::inicioComprado($j) && $c['producto'] === 'inicio') {
        pago_json(409, ['status' => 'failed', 'message' => 'Ya compraste el ' . $p['nombre'] . '. Solo se puede comprar una vez: no se hizo ningún cobro.']);
    }
    if (Limite::contar('plux:' . $c['id'], 12) || Limite::contar('pluxip:' . Http::ip(), 40)) {
        pago_json(429, ['status' => 'failed', 'message' => 'Demasiados intentos. Espera unos minutos e intenta de nuevo.']);
    }
    $clave = texto_de($in, 'simetricKeyCifrada');
    if (!preg_match('#^[A-Za-z0-9+/=]{40,1200}$#', $clave)) pago_json(422, ['status' => 'failed', 'message' => 'No se pudo preparar el pago. Recarga la página.']);
    try {
        $comprador = Plux::comprador($in, Cuentas::porId($j));
        $cuerpo = Plux::cuerpo($c, $comprador, $in);
    } catch (\RuntimeException $e) {
        pago_json(422, ['status' => 'failed', 'message' => $e->getMessage()]);
    }
    Compras::anotarComprador((int) $c['id'], $comprador);   // para la factura (sin datos de tarjeta)
    Sesiones::recordarCompra((int) $c['id']);              // para reconocerla al volver del banco (3DS)
    $conOtp = isset($cuerpo['paramsOtp']);
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
    $r = Plux::llamar(Plux::RUTA_3DS, ['pti' => $pti, 'pcc' => $pcc, 'ptk' => $ptk]);
    if (!$c) {
        // Sin sesión (otro navegador o se borraron las galletas): se intenta por el número de transacción.
        $tr = Plux::transaccion($r);
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
