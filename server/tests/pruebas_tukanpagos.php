<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Pago con tarjeta por TUKÁN PAGOS (src/TukanPagos.php, TukanPagosApi.php;
// server/TUKAN_PAGOS.md): base SQLite TEMPORAL, un Tukán Pagos FALSO (tests/tukanpagos_falso.php con php -S) y el juego de
// verdad (php -S + router.php + api.php + pago.php). Casos: interruptor (sin TUKAN_PAGOS_ACTIVO sigue el Plux propio),
// página de pago, crear el cobro (referencia, monto con IVA, regreso, metadatos), mismo cobro si se repite, regreso sin
// pagar, aviso firmado (bueno / mala firma / viejo / monto distinto / referencia ajena / prueba), regreso pagado, nunca dos
// entregas (aviso + regreso, en los dos órdenes), rechazo y reintento, pago directo cerrado, factura SRI, seguridad.
// Uso:  php server/tests/pruebas_tukanpagos.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$TMP = sys_get_temp_dir() . '/envivo_tkp_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
mkdir($TMP . '/tkp', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; };
$P_APP = $puerto(); $P_TKP = $puerto(); $P_SIN = $puerto();
$CLAVE = 'tkp_prueba_' . bin2hex(random_bytes(8));
$SECRETO = 'secreto_aviso_' . bin2hex(random_bytes(8));
$TKP = 'http://127.0.0.1:' . $P_TKP;
$APP = 'http://127.0.0.1:' . $P_APP;
$base = "; SOLO PRUEBAS (pruebas_tukanpagos.php)\nENVIVO_ZONA=America/Guayaquil\n"
      . "PLUX_AMBIENTE=sandbox\nPLUX_ID_ESTABLECIMIENTO=EST-1\nPLUX_ID_CLIENTE=c\nPLUX_CLAVE_SECRETA=s\nPLUX_LLAVE_PUBLICA=AAAA\n";
$tkp = "TUKAN_PAGOS_ACTIVO=1\nTUKAN_PAGOS_URL=$TKP\nTUKAN_PAGOS_CLAVE=$CLAVE\nTUKAN_PAGOS_SECRETO_AVISO=$SECRETO\n";
file_put_contents($TMP . '/config.env', $base . "ENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=$APP\n" . $tkp);
file_put_contents($TMP . '/config_sin.env', $base . "ENVIVO_DB=$TMP/datos/envivo_sin.sqlite\nENVIVO_URL=http://127.0.0.1:$P_SIN\n"
    . "TUKAN_PAGOS_URL=$TKP\nTUKAN_PAGOS_CLAVE=$CLAVE\nTUKAN_PAGOS_SECRETO_AVISO=$SECRETO\n");   // sin TUKAN_PAGOS_ACTIVO
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Compras, Config, Db, Facturacion, TukanPagos};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
Db::pdo();
Facturacion::$empujarAlTerminar = false;

titulo('Interruptor (módulo)');
check('Con TUKAN_PAGOS_ACTIVO=1, clave, secreto y dirección: encendido', true, TukanPagos::activo());
check('Referencia de la compra 15 y vuelta', ['envivo-compra-15', 15, null, null], [TukanPagos::referencia(15), TukanPagos::compraDeReferencia('envivo-compra-15'),
    TukanPagos::compraDeReferencia('otro-15'), TukanPagos::compraDeReferencia('envivo-compra-15x')]);

titulo('Servidores: Tukán Pagos falso y el juego');
$procs = [];
$arrancar = function (int $p, string $config, ?string $script = null) use ($TMP, $RAIZ, $SRV, &$procs, $CLAVE, $TKP): void {
    $cmd = ['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $p];
    $cmd = $script === null ? [...$cmd, '-t', $RAIZ, $SRV . '/tests/router.php'] : [...$cmd, $script];
    $procs[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/http.log', 'a'], 2 => ['file', $TMP . '/http.log', 'a']], $tub, $RAIZ,
        ['ENVIVO_CONFIG' => $config, 'PATH' => getenv('PATH'), 'TZ' => 'America/Guayaquil', 'PHP_CLI_SERVER_WORKERS' => '3', 'no_proxy' => '127.0.0.1,localhost',
         'FALSO_TKP_DIR' => $TMP . '/tkp', 'FALSO_TKP_CLAVE' => $CLAVE, 'FALSO_TKP_BASE' => $TKP]);
    for ($k = 0; $k < 60; $k++) { if (@fsockopen('127.0.0.1', $p)) return; usleep(100000); }
};
$arrancar($P_TKP, $TMP . '/config.env', $SRV . '/tests/tukanpagos_falso.php');
$arrancar($P_APP, $TMP . '/config.env');
$arrancar($P_SIN, $TMP . '/config_sin.env');

function pedir(string $metodo, string $url, mixed $cuerpo = null, ?string $jar = null, array $cab = [], bool $envivo = true): array
{
    $ch = curl_init($url);
    $h = array_merge(['Content-Type: application/json'], $envivo ? ['X-Envivo: 1'] : [], $cab);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_HEADER => true]
        + ($jar !== null ? [CURLOPT_COOKIEFILE => $jar, CURLOPT_COOKIEJAR => $jar] : [])
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => is_string($cuerpo) ? $cuerpo : json_encode($cuerpo)] : []));
    $r = (string) curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); $hs = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE); curl_close($ch);
    $cab = substr($r, 0, $hs); $b = substr($r, $hs);
    return [$c, json_decode($b, true), preg_match('/^location:\s*(\S+)/mi', $cab, $m) ? $m[1] : '', $b];
}
$cod = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null];
$n = 0;
$jugador = function (string $nombre, string $url = '') use ($TMP, $APP, &$n): array {
    $n++;
    $jar = $TMP . '/galleta_' . $n;
    [, $j] = pedir('POST', ($url ?: $APP) . '/api/registro', ['email' => 'tkp' . $n . '.' . bin2hex(random_bytes(3)) . '@prueba.example', 'nombre' => $nombre, 'clave' => 'ClaveTukan123', 'acepta_terminos' => true, 'edad_16' => true], $jar);
    return [(int) ($j['jugador']['id'] ?? 0), $jar];
};
$orden = function (string $jar, string $producto = 'creditos_700', string $url = '') use ($APP): array {
    [$c, $j] = pedir('POST', ($url ?: $APP) . '/api/orden', ['producto' => $producto], $jar);
    $u = (string) ($j['url'] ?? $j['pago'] ?? '');
    preg_match('/[?&]o=([a-f0-9]{32})/', $u, $m);
    $tok = $m[1] ?? '';
    return [$c, $tok, (int) (Compras::porToken($tok)['id'] ?? 0), $j];
};
$falsoLog = fn() => array_map(fn($l) => json_decode($l, true), file($TMP . '/tkp/log.jsonl', FILE_IGNORE_NEW_LINES) ?: []);
$aviso = function (array $ev, ?string $secreto = null, ?int $fecha = null) use ($APP, $SECRETO): array {
    $cuerpo = json_encode($ev);
    $fecha ??= time();
    $firma = 'sha256=' . hash_hmac('sha256', $fecha . '.' . $cuerpo, $secreto ?? $SECRETO);
    return pedir('POST', $APP . '/api/tukanpagos/aviso', $cuerpo, null, ['X-Tukan-Evento: ' . ($ev['evento'] ?? ''), 'X-Tukan-Aviso: 77', 'X-Tukan-Fecha: ' . $fecha, 'X-Tukan-Firma: ' . $firma], false);
};
$cobroFalso = fn(int $compra) => json_decode((string) @file_get_contents($TMP . '/tkp/cobro_envivo-compra-' . $compra . '.json'), true);
$estadoFalso = fn(int $compra, string $estado, ?float $monto = null) => pedir('POST', $TKP . '/_falso/estado', ['referencia' => 'envivo-compra-' . $compra, 'estado' => $estado] + ($monto !== null ? ['monto' => $monto] : []), null, [], false);
$creditos = fn(string $jar) => (int) (pedir('GET', $APP . '/api/estado', null, $jar)[1]['creditos'] ?? -1);

titulo('Estado de la tienda y página de pago');
[$idA, $jarA] = $jugador('Ana Tukán');
$est = pedir('GET', $APP . '/api/estado', null, $jarA)[1]['plux'] ?? [];
check('/api/estado: tarjeta disponible, por Tukán Pagos, en sandbox (lo dice Tukán Pagos)', [true, 'tukanpagos', 'sandbox'], [$est['disponible'] ?? null, $est['por'] ?? null, $est['ambiente'] ?? null]);
[$c, $tokA, $idCA] = $orden($jarA);
check('Orden de 700 créditos con tarjeta: compra pendiente web_plux', [200, 'pendiente', 'web_plux'], [$c, Compras::porId($idCA)['estado'] ?? null, Compras::porId($idCA)['canal'] ?? null]);
[$c, , , $html] = pedir('GET', $APP . '/pago.php?o=' . $tokA, null, $jarA, [], false);
check('pago.php: caja de Tukán Pagos con la factura, SIN el formulario de tarjeta propio', [200, true, true, false, true],
    [$c, str_contains($html, 'id="tkp-caja"'), str_contains($html, 'id="fact-caja"'), str_contains($html, 'id="plux-numero"'), str_contains($html, '/pago-assets/tukanpagos.js')]);
check('… avisa modo de pruebas (sandbox)', true, str_contains($html, 'MODO DE PRUEBAS'));
[, $jarSin] = $jugador('Sin Modulo', 'http://127.0.0.1:' . $P_SIN);
[, $tokSin] = $orden($jarSin, 'creditos_700', 'http://127.0.0.1:' . $P_SIN);
$htmlSin = pedir('GET', 'http://127.0.0.1:' . $P_SIN . '/pago.php?o=' . $tokSin, null, $jarSin, [], false)[3];
check('Sin TUKAN_PAGOS_ACTIVO (módulo apagado): sigue el formulario de tarjeta propio (Plux)', [false, true], [str_contains($htmlSin, 'id="tkp-caja"'), str_contains($htmlSin, 'id="plux-numero"')]);

titulo('Crear el cobro');
check('Sin X-Envivo -> 403; sin sesión -> 401; compra de otro -> 404', [[403, 'cabecera_requerida'], [401, 'sesion_requerida'], [404, 'no_encontrado']],
    [$cod(pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokA], $jarA, [], false)), $cod(pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokA])),
     (function () use ($jugador, $tokA, $cod, $APP) { [, $jb] = $jugador('Otro'); return $cod(pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokA], $jb)); })()]);
check('Factura con cédula mala -> 422 (y no se crea cobro)', [422, 'factura_cedula_invalida', null],
    [...$cod(pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokA, 'factura' => ['modo' => 'otro', 'identificacion' => '1712345670', 'razon_social' => 'Ana']], $jarA)), $cobroFalso($idCA)]);
[$c, $j] = pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokA, 'factura' => ['modo' => 'otro', 'identificacion' => '1710034065', 'razon_social' => 'Ana Pérez', 'email' => 'ana@prueba.example']], $jarA);
check('Crear: 200 con la dirección de pago de Tukán Pagos', [200, true], [$c, str_starts_with((string) ($j['url'] ?? ''), $TKP . '/pagar/')]);
$pedido = array_values(array_filter($falsoLog(), fn($l) => $l['ruta'] === '/api/v1/cobros' && $l['metodo'] === 'POST'));
$cu = end($pedido)['cuerpo'] ?? [];
$compraA = Compras::porId($idCA);
check('… referencia envivo-compra-N, monto = total con IVA ($4,99), con_iva', ['envivo-compra-' . $idCA, 4.99, true], [$cu['referencia'] ?? null, $cu['monto'] ?? null, $cu['con_iva'] ?? null]);
check('… regreso al juego (/api/tukanpagos/volver?o=token) y metadatos de la compra', [$APP . '/api/tukanpagos/volver?o=' . $tokA, $idCA, $idA],
    [$cu['url_regreso'] ?? null, $cu['metadatos']['compra'] ?? null, $cu['metadatos']['jugador'] ?? null]);
check('… comprador con la cédula y el correo de la factura', ['1710034065', 'ana@prueba.example'], [$cu['comprador']['documento'] ?? null, $cu['comprador']['correo'] ?? null]);
check('… datos de la factura guardados para TuFactura', ['otro', '1710034065'], (function () use ($idCA) { $g = json_decode((string) Db::valor('SELECT datos_json FROM facturacion_datos_compra WHERE compra_id = ?', [$idCA]), true); return [$g['modo'] ?? null, $g['identificacion'] ?? null]; })());
check('… la compra anota el cobro (tkp-1) y sigue pendiente', ['tkp-1', 'pendiente'], [Compras::porId($idCA)['plux_transaccion'] ?? null, Compras::porId($idCA)['estado']]);
[$c, $j2] = pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokA, 'factura' => ['modo' => 'consumidor_final']], $jarA);
check('Repetir (otra pestaña / volver atrás): el MISMO cobro en Tukán Pagos', [200, $j['url'] ?? 'x', 1], [$c, $j2['url'] ?? null, count(glob($TMP . '/tkp/cobro_*.json'))]);

titulo('Regreso sin pagar y avisos con firma mala');
$cA0 = $creditos($jarA);
[$c, , $loc] = pedir('GET', $APP . '/api/tukanpagos/volver?o=' . $tokA, null, $jarA, [], false);
check('Volver sin pagar: a pago.php con "confirmando" (el navegador no decide nada)', [302, '/pago.php?o=' . $tokA . '&r=tkp_confirmando', 'pendiente'], [$c, $loc, Compras::porId($idCA)['estado']]);
$evA = ['evento' => 'cobro.aprobado', 'datos' => ['id' => 1, 'referencia' => 'envivo-compra-' . $idCA, 'estado' => 'aprobado', 'monto' => 4.99]];
check('Aviso con firma de otro secreto -> 401', [401, 'firma_invalida'], $cod($aviso($evA, 'otro_secreto')));
check('Aviso de hace 10 minutos -> 401', [401, 'firma_invalida'], $cod($aviso($evA, null, time() - 600)));
check('Aviso sin firma -> 401', 401, pedir('POST', $APP . '/api/tukanpagos/aviso', json_encode($evA), null, [], false)[0]);
check('… nada se entregó', ['pendiente', $cA0], [Compras::porId($idCA)['estado'], $creditos($jarA)]);
[$c, $j] = $aviso(['evento' => 'cobro.aprobado', 'datos' => ['id' => 1, 'referencia' => 'envivo-compra-' . $idCA, 'estado' => 'aprobado', 'monto' => 0.99]]);
check('Aviso firmado pero con OTRO monto ($0,99): no se entrega y queda un aviso para revisar', [200, 'ignorado', 'pendiente', 1],
    [$c, $j['resultado'] ?? null, Compras::porId($idCA)['estado'], (int) Db::valor("SELECT COUNT(*) FROM avisos WHERE tipo = 'tukanpagos_monto'")]);
check('Aviso de una referencia ajena -> ignorado', 'ignorado', $aviso(['evento' => 'cobro.aprobado', 'datos' => ['id' => 9, 'referencia' => 'tuflota-15', 'estado' => 'aprobado', 'monto' => 4.99]])[1]['resultado'] ?? null);
check('Aviso de prueba (botón de Tukán Pagos) -> 200', [200, 'prueba'], [$aviso(['evento' => 'prueba', 'datos' => ['mensaje' => 'hola']])[0], $aviso(['evento' => 'prueba'])[1]['resultado'] ?? null]);

titulo('Pagado: aviso y regreso, sin entregar dos veces');
[$c, $j] = $aviso($evA);
check('Aviso cobro.aprobado firmado y con el monto exacto: se entrega', [200, 'pagado', 'pagado'], [$c, $j['resultado'] ?? null, Compras::porId($idCA)['estado']]);
$cA1 = $creditos($jarA);
check('… créditos entregados (700 o más con bono)', true, $cA1 - $cA0 >= 700);
check('… quién y transacción en la compra', ['tkp-1', true], [Compras::porId($idCA)['plux_transaccion'], str_contains((string) Compras::porId($idCA)['pagado_por'], 'Tukán Pagos')]);
check('El mismo aviso otra vez (Tukán Pagos reintenta): ya_pagado, sin entregar de nuevo', ['ya_pagado', $cA1], [$aviso($evA)[1]['resultado'] ?? null, $creditos($jarA)]);
$estadoFalso($idCA, 'aprobado');
check('Y el regreso después: al juego (?compra=ok) sin entregar de nuevo', ['/?compra=ok', $cA1], [pedir('GET', $APP . '/api/tukanpagos/volver?o=' . $tokA, null, $jarA, [], false)[2], $creditos($jarA)]);
check('Factura SRI pendiente creada al aprobar (canal web_plux, una sola)', [1, 'web_plux'], [(int) Db::valor("SELECT COUNT(*) FROM facturas WHERE compra_id = ? AND tipo = 'factura'", [$idCA]),
    Db::valor("SELECT canal FROM facturas WHERE compra_id = ?", [$idCA])]);
check('crear con la compra ya pagada -> ir al juego', '/?compra=ok', pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokA], $jarA)[1]['ir'] ?? null);

// Orden inverso: primero el regreso (Tukán Pagos ya aprobó), después el aviso
[, $tokB, $idCB] = $orden($jarA, 'creditos_250');
pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokB, 'factura' => ['modo' => 'consumidor_final']], $jarA);
$estadoFalso($idCB, 'aprobado');
$cB0 = $creditos($jarA);
check('Regreso primero (el servidor pregunta a Tukán Pagos): entregado', ['/?compra=ok', 'pagado'], [pedir('GET', $APP . '/api/tukanpagos/volver?o=' . $tokB, null, $jarA, [], false)[2], Compras::porId($idCB)['estado']]);
$cB1 = $creditos($jarA);
check('… y el aviso después: ya_pagado, una sola entrega', ['ya_pagado', $cB1, true], [$aviso(['evento' => 'cobro.aprobado', 'datos' => $cobroFalso($idCB)])[1]['resultado'] ?? null, $creditos($jarA), $cB1 - $cB0 >= 250]);
check('Factura a consumidor final para la compra de $1,99', '9999999999999', Db::valor("SELECT comprador_identificacion FROM facturas WHERE compra_id = ?", [$idCB]));

titulo('Rechazo y reintento');
[, $tokC, $idCC] = $orden($jarA, 'creditos_250');
pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokC, 'factura' => ['modo' => 'consumidor_final']], $jarA);
$estadoFalso($idCC, 'rechazado');
[$c, , $loc] = pedir('GET', $APP . '/api/tukanpagos/volver?o=' . $tokC, null, $jarA, [], false);
check('Tarjeta rechazada: vuelve a pago.php con "rechazado"; la compra sigue abierta', ['/pago.php?o=' . $tokC . '&r=rechazado', 'pendiente', 'fallido'], [$loc, Compras::porId($idCC)['estado'], Compras::porId($idCC)['plux_paso']]);
check('… la página de pago muestra el aviso del banco', true, str_contains(pedir('GET', $APP . '/pago.php?o=' . $tokC . '&r=rechazado', null, $jarA, [], false)[3], 'Tu banco no aprobó el pago'));
check('… intentar otra vez: el mismo cobro (Tukán Pagos deja reintentar)', true, str_starts_with((string) (pedir('POST', $APP . '/api/tukanpagos/crear', ['o' => $tokC, 'factura' => ['modo' => 'consumidor_final']], $jarA)[1]['url'] ?? ''), $TKP . '/pagar/'));
check('… aviso cobro.rechazado: anotado, sin entregar', ['rechazado', 'pendiente'], [$aviso(['evento' => 'cobro.rechazado', 'datos' => $cobroFalso($idCC)])[1]['resultado'] ?? null, Compras::porId($idCC)['estado']]);
$estadoFalso($idCC, 'aprobado');
check('… y si después paga con otra tarjeta: entregado', ['pagado', 'pagado'], [$aviso(['evento' => 'cobro.aprobado', 'datos' => $cobroFalso($idCC)])[1]['resultado'] ?? null, Compras::porId($idCC)['estado']]);

titulo('Navegador de verdad (celular): el botón lleva a Tukán Pagos');
[, $tokN, $idN] = $orden($jarA, 'creditos_700');
$galleta = '';
foreach (file($jarA, FILE_IGNORE_NEW_LINES) ?: [] as $l) { $p = explode("\t", preg_replace('/^#HttpOnly_/', '', $l)); if (count($p) === 7) $galleta = $p[5] . '=' . $p[6]; }
file_put_contents($TMP . '/nav.cjs', <<<'JS'
const { chromium } = require('playwright');
(async () => {
  const [url, galleta, destino] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: {} });
  const [n, v] = galleta.split('=');
  await ctx.addCookies([{ name: n, value: v, url }]);
  const pg = await ctx.newPage();
  const errores = [];
  pg.on('pageerror', (e) => errores.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await pg.route(destino + '/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Tukan Pagos</h1>' }));
  await pg.goto(url, { waitUntil: 'networkidle' });
  await pg.click('#tkp-pagar');
  const sinTerminos = await pg.textContent('#tkp-mensaje');
  await pg.check('#tkp-terminos');
  await Promise.all([pg.waitForURL(destino + '/pagar/**', { timeout: 15000 }), pg.click('#tkp-pagar')]);
  console.log(JSON.stringify({ sinTerminos, final: pg.url(), errores }));
  await b.close();
})().catch((e) => { console.log(JSON.stringify({ error: String(e) })); process.exit(1); });
JS);
$salida = shell_exec('cd ' . escapeshellarg($RAIZ) . ' && NODE_PATH=$(npm root -g) node ' . escapeshellarg($TMP . '/nav.cjs') . ' ' . escapeshellarg($APP . '/pago.php?o=' . $tokN) . ' ' . escapeshellarg($galleta) . ' ' . escapeshellarg($TKP) . ' 2>&1');
$nav = json_decode((string) trim((string) $salida), true) ?? ['error' => $salida];
check('Sin aceptar los términos no avanza (mensaje)', true, str_contains((string) ($nav['sinTerminos'] ?? ''), 'términos'));
check('Con los términos: lleva a la página de pago de Tukán Pagos, sin errores de JavaScript', [true, []], [str_starts_with((string) ($nav['final'] ?? ''), $TKP . '/pagar/'), $nav['errores'] ?? ['sin respuesta: ' . json_encode($nav)]]);
check('… y el cobro quedó creado para esa compra', 'pendiente', $cobroFalso($idN)['estado'] ?? null);

titulo('Un solo camino y seguridad');
[, $tokD] = $orden($jarA, 'creditos_250');
check('Con Tukán Pagos encendido, el pago directo con Plux queda cerrado (409 usar_tukanpagos)', [409, 'usar_tukanpagos'],
    [($r = pedir('POST', $APP . '/api/plux/pago', ['o' => $tokD, 'datos' => 'x'], $jarA))[0], $r[1]['codigo'] ?? null]);
check('Tukán Pagos falso: todas las llamadas del juego con la clave correcta', 0, count(array_filter($falsoLog(), fn($l) => !str_starts_with($l['ruta'], '/_falso') && !$l['auth_ok'])));
foreach ($procs as $p) { proc_terminate($p); proc_close($p); }
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en los servidores', '', $errores);
$todo = (string) @file_get_contents($TMP . '/php_errores.log') . (string) @file_get_contents($TMP . '/http.log');
check('La clave y el secreto de Tukán Pagos no aparecen en ningún registro', [false, false], [str_contains($todo, $CLAVE), str_contains($todo, $SECRETO)]);
echo "\n----------------------------------------\nTukán Pagos: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
