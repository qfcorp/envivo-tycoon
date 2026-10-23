<?php
// SOLO PRUEBAS (nunca en el servidor del juego). PayPal en la tienda web (server/src/PayPal.php, PayPalApi.php; docs/PAYPAL.md):
// base SQLite TEMPORAL, un PayPal FALSO (tests/paypal_falso.php con php -S en un puerto al azar, PAYPAL_API_BASE solo para
// pruebas) y el juego de verdad (php -S + router.php + api.php + pago.php). Casos: crear la orden (valor del catálogo, USD,
// custom_id), aprobar y capturar en el servidor, valor / moneda / referencia que no coinciden, captura doble y dos pestañas,
// rechazo, cancelar, captura pendiente que llega por el webhook, firma del webhook buena / mala / sin cabeceras / repetida,
// reembolso total (revierte + nota de crédito) y parcial (solo aviso), reversión y disputa (contracargo), orden aprobada
// que llega solo por el webhook, regla del precio mínimo, sin llaves = sin PayPal, anti-fraude (sesión, X-Envivo, otra
// cuenta, límites), facturación SRI (forma de pago 20), Centro de Control, migración y traducciones.
// Uso:  php server/tests/pruebas_paypal.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$TMP = sys_get_temp_dir() . '/envivo_paypal_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
mkdir($TMP . '/pp', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; };
$P_APP = (int) (getenv('P_APP') ?: $puerto());
$P_PP = (int) (getenv('P_FALSO') ?: $puerto());
$P_SIN = $puerto();
$P_MIN = $puerto();
$CLIENTE = 'cliente_pp_' . bin2hex(random_bytes(4));
$SECRETO = 'secreto_pp_' . bin2hex(random_bytes(8));
$WEBHOOK = 'WH-PRUEBA-' . strtoupper(bin2hex(random_bytes(4)));
$FIRMA = bin2hex(random_bytes(16));   // con esto "firma" el PayPal falso los avisos
$PP = 'http://127.0.0.1:' . $P_PP;
$APP = 'http://127.0.0.1:' . $P_APP;
$base = "; SOLO PRUEBAS (pruebas_paypal.php)\nENVIVO_ZONA=America/Guayaquil\n"
      . "PLUX_AMBIENTE=sandbox\nPLUX_ID_ESTABLECIMIENTO=EST-1\nPLUX_ID_CLIENTE=c\nPLUX_CLAVE_SECRETA=s\nPLUX_LLAVE_PUBLICA=AAAA\n";
$pp = "PAYPAL_AMBIENTE=sandbox\nPAYPAL_API_BASE=$PP/\nPAYPAL_CLIENT_ID=$CLIENTE\nPAYPAL_SECRET=$SECRETO\nPAYPAL_WEBHOOK_ID=$WEBHOOK\n";
file_put_contents($TMP . '/config.env', $base . "ENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=$APP\n" . $pp);
file_put_contents($TMP . '/config_sin.env', $base . "ENVIVO_DB=$TMP/datos/envivo_sin.sqlite\nENVIVO_URL=http://127.0.0.1:$P_SIN\nPAYPAL_WEBHOOK_ID=$WEBHOOK\n");
file_put_contents($TMP . '/config_min.env', $base . "ENVIVO_DB=$TMP/datos/envivo_min.sqlite\nENVIVO_URL=http://127.0.0.1:$P_MIN\n" . $pp . "PAYPAL_MINIMO=9.99\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Ajustes, Catalogo, Compras, Cuentas, Db, Facturacion, Fallo, Migraciones, PayPal};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
function falla(callable $f): array
{
    try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; }
}

Db::pdo();
Facturacion::$empujarAlTerminar = false;

// =====================================================================
titulo('Migración: paypal.sql y el canal web_paypal en compras');
$sqlCompras = (string) Db::valor("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'compras'");
check("La regla del canal acepta 'web_paypal' (y sigue aceptando web_plux y google_play)", [true, true, true],
    [str_contains($sqlCompras, "'web_paypal'"), str_contains($sqlCompras, "'web_plux'"), str_contains($sqlCompras, "'google_play'")]);
$idx = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'compras' AND sql IS NOT NULL ORDER BY name"), 'name');
check('Los índices de compras siguen ahí después de rehacer la tabla', [true, true, true, true],
    [in_array('compras_jugador', $idx, true), in_array('compras_transaccion', $idx, true), in_array('compras_google_token', $idx, true), in_array('compras_estado', $idx, true)]);
check('Tablas paypal_ordenes y paypal_eventos', [true, true], [Migraciones::columnas('paypal_ordenes') !== null, Migraciones::columnas('paypal_eventos') !== null]);
check('Aplicar paypal.sql otra vez no cambia nada', [], Migraciones::aplicar('paypal.sql'));

// =====================================================================
titulo('Configuración y regla del precio mínimo');
check('Configurado (llaves de prueba), sandbox, mínimo por defecto $4,99', [true, 'sandbox', 4.99, true], [PayPal::configurado(), PayPal::ambiente(), PayPal::minimo(), PayPal::webhookConfigurado()]);
check('Desde $4,99 sí; $4,98, $2,99 y $0,99 no', [true, true, false, false, false], [PayPal::permite(4.99), PayPal::permite(19.99), PayPal::permite(4.98), PayPal::permite(2.99), PayPal::permite(0.99)]);
check('Solo se manda al comprador a https://*.paypal.com (o al PayPal falso de esta prueba)', [true, true, false, false, false, true],
    [PayPal::urlAprobacionValida('https://www.paypal.com/checkoutnow?token=ABC123'), PayPal::urlAprobacionValida('https://www.sandbox.paypal.com/checkoutnow?token=ABC123'),
     PayPal::urlAprobacionValida('https://paypal.com.malo.example/x'), PayPal::urlAprobacionValida('http://www.paypal.com/x'), PayPal::urlAprobacionValida('https://malo.example/www.paypal.com/'),
     PayPal::urlAprobacionValida($PP . '/aprobar?token=X')]);
check('Estado para el juego: sin nada secreto', ['disponible' => true, 'ambiente' => 'sandbox', 'minimo' => 4.99], PayPal::estado());

// =====================================================================
titulo('Servidores: PayPal falso y el juego (php -S + router.php)');
$procs = [];
$arrancar = function (int $p, string $config, ?string $script = null) use ($TMP, $RAIZ, $SRV, &$procs, $CLIENTE, $SECRETO, $WEBHOOK, $FIRMA, $PP): void {
    $cmd = ['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $p];
    $cmd = $script === null ? [...$cmd, '-t', $RAIZ, $SRV . '/tests/router.php'] : [...$cmd, $script];
    $procs[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/http.log', 'a'], 2 => ['file', $TMP . '/http.log', 'a']], $tub, $RAIZ,
        ['ENVIVO_CONFIG' => $config, 'PATH' => getenv('PATH'), 'TZ' => 'America/Guayaquil', 'PHP_CLI_SERVER_WORKERS' => '3', 'no_proxy' => '127.0.0.1,localhost',
         'FALSO_PP_DIR' => $TMP . '/pp', 'FALSO_PP_CLIENTE' => $CLIENTE, 'FALSO_PP_SECRETO' => $SECRETO, 'FALSO_PP_WEBHOOK' => $WEBHOOK, 'FALSO_PP_FIRMA' => $FIRMA, 'FALSO_PP_BASE' => $PP]);
    for ($k = 0; $k < 60; $k++) { if (@fsockopen('127.0.0.1', $p)) return; usleep(100000); }
};
$arrancar($P_PP, $TMP . '/config.env', $SRV . '/tests/paypal_falso.php');
$arrancar($P_APP, $TMP . '/config.env');
$arrancar($P_SIN, $TMP . '/config_sin.env');
$arrancar($P_MIN, $TMP . '/config_min.env');

/** Petición HTTP (sin seguir redirecciones). Devuelve [código, json, Location, cuerpo, cabeceras]. */
function pedir(string $metodo, string $url, mixed $cuerpo = null, ?string $jar = null, array $cab = [], bool $envivo = true): array
{
    $ch = curl_init($url);
    $h = array_merge(['Content-Type: application/json'], $envivo ? ['X-Envivo: 1'] : [], $cab);
    $cabs = [];
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$cabs) { $p = explode(':', $l, 2); if (count($p) === 2) $cabs[strtolower(trim($p[0]))] = trim($p[1]); return strlen($l); }]
        + ($jar !== null ? [CURLOPT_COOKIEFILE => $jar, CURLOPT_COOKIEJAR => $jar] : [])
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => is_string($cuerpo) ? $cuerpo : json_encode($cuerpo)] : []));
    $b = (string) curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode($b, true), $cabs['location'] ?? '', $b, $cabs];
}
$cod = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null];
$ppLog = function (string $ruta, ?string $orden = null) use ($TMP): array {
    $o = [];
    foreach (file($TMP . '/pp/log.jsonl', FILE_IGNORE_NEW_LINES) ?: [] as $l) { $j = json_decode($l, true); if (($j['ruta'] ?? '') === $ruta && ($orden === null || ($j['orden'] ?? '') === $orden)) $o[] = $j; }
    return $o;
};
$ordenFalsa = fn(string $id) => json_decode((string) @file_get_contents($TMP . '/pp/orden_' . $id . '.json'), true);
$n = 0;
/** Un jugador nuevo con su propia galleta. Devuelve [id, jar]. */
$jugador = function (string $nombre, string $url = '') use ($TMP, $APP, &$n): array {
    $n++;
    $jar = $TMP . '/galleta_' . $n;
    [$c, $j] = pedir('POST', ($url ?: $APP) . '/api/registro', ['email' => 'pp' . $n . '.' . bin2hex(random_bytes(3)) . '@prueba.example', 'nombre' => $nombre, 'clave' => 'ClavePayPal1', 'acepta_terminos' => true, 'edad_16' => true], $jar);
    return [(int) ($j['jugador']['id'] ?? 0), $jar];
};
$tokenDe = fn(string $url) => preg_match('/[?&]o=([a-f0-9]{32})/', $url, $m) ? $m[1] : '';
$ordenDe = fn(string $url) => preg_match('/[?&]token=([A-Z0-9]+)/', $url, $m) ? $m[1] : '';
/** Pide la orden de PayPal para un producto y devuelve [token compra, id compra, id orden, url de PayPal]. */
$preparar = function (string $jar, string $producto, ?array $factura = null) use ($APP, $tokenDe, $ordenDe): array {
    [, $j] = pedir('POST', $APP . '/api/orden', ['producto' => $producto, 'metodo' => 'paypal', 'total' => 0.01], $jar);
    $tok = $tokenDe((string) ($j['url'] ?? ''));
    [, $k] = pedir('POST', $APP . '/api/paypal/crear', ['o' => $tok, 'factura' => $factura ?? ['modo' => 'consumidor_final'], 'valor' => '0.01'], $jar);
    $c = Compras::porToken($tok);
    return [$tok, (int) ($c['id'] ?? 0), $ordenDe((string) ($k['url'] ?? '')), (string) ($k['url'] ?? '')];
};
/** El comprador aprueba en PayPal y vuelve al juego. Devuelve [código, Location] de /api/paypal/volver. */
$aprobarYVolver = function (string $urlPayPal, string $jar): array {
    [, , $vuelta] = pedir('GET', $urlPayPal, null, null, [], false);
    [$c, , $loc] = pedir('GET', $vuelta, null, $jar, [], false);
    return [$c, $loc, $vuelta];
};
$saldo = fn(int $j) => (int) Db::valor('SELECT creditos - deuda FROM jugadores WHERE id = ?', [$j]);
$sinLimitesIp = fn() => Db::q("DELETE FROM intentos WHERE clave LIKE 'paypalip:%' OR clave LIKE 'paypalvolver:%' OR clave LIKE 'ppwebhook:%'");

// =====================================================================
titulo('Estado y tienda: PayPal visible solo con llaves');
[$c, $est] = pedir('GET', $APP . '/api/estado');
check('/api/estado trae paypal {disponible, ambiente, minimo} (sin llaves ni secretos)', [200, ['disponible' => true, 'ambiente' => 'sandbox', 'minimo' => 4.99], false, false],
    [$c, $est['paypal'] ?? null, str_contains(json_encode($est), $SECRETO), str_contains(json_encode($est), $CLIENTE)]);
[, $estSin] = pedir('GET', 'http://127.0.0.1:' . $P_SIN . '/api/estado');
check('Sin llaves: paypal.disponible false (el botón no aparece)', false, $estSin['paypal']['disponible'] ?? null);
[, $estMin] = pedir('GET', 'http://127.0.0.1:' . $P_MIN . '/api/estado');
check('PAYPAL_MINIMO=9.99 llega al juego', 9.99, $estMin['paypal']['minimo'] ?? null);

// =====================================================================
titulo('Orden: solo con sesión, valor del catálogo y desde el mínimo');
[$A, $jarA] = $jugador('Ana PayPal');
check('Sin sesión: /api/orden y /api/paypal/crear -> 401', [[401, 'sesion_requerida'], [401, 'sesion_requerida']],
    [$cod(pedir('POST', $APP . '/api/orden', ['producto' => 'creditos_700', 'metodo' => 'paypal'])), $cod(pedir('POST', $APP . '/api/paypal/crear', ['o' => str_repeat('a', 32)]))]);
check('Producto de $1,99 con PayPal -> 409 paypal_minimo (se paga con tarjeta)', [409, 'paypal_minimo'], $cod(pedir('POST', $APP . '/api/orden', ['producto' => 'creditos_250', 'metodo' => 'paypal'], $jarA)));
check('Oferta de bienvenida ($0,99) con PayPal -> 409 paypal_minimo', [409, 'paypal_minimo'], $cod(pedir('POST', $APP . '/api/orden', ['producto' => 'bienvenida', 'metodo' => 'paypal'], $jarA)));
[$c, $j] = pedir('POST', $APP . '/api/orden', ['producto' => 'creditos_700', 'metodo' => 'paypal', 'total' => 0.01, 'precio' => 0.01], $jarA);
$tok1 = $tokenDe((string) ($j['url'] ?? ''));
$c1 = Compras::porToken($tok1);
check('creditos_700 ($4,99) con PayPal -> 200, compra pendiente web_paypal con el valor del catálogo (no el del navegador)', [200, 'web_paypal', 'pendiente', 4.99, 'web_paypal'],
    [$c, $c1['canal'] ?? null, $c1['estado'] ?? null, (float) ($c1['total'] ?? 0), $j['compra']['canal'] ?? null]);
[$c, $j] = pedir('POST', $APP . '/api/orden', ['producto' => 'creditos_700'], $jarA);
check('Sin "metodo": tarjeta de siempre (web_plux)', [200, 'web_plux'], [$c, Compras::porToken($tokenDe((string) ($j['url'] ?? '')))['canal'] ?? null]);
$tokPlux = $tokenDe((string) ($j['url'] ?? ''));
check('Sin llaves: /api/orden con PayPal -> 503 paypal_no_disponible', [503, 'paypal_no_disponible'],
    (function () use ($jugador, $P_SIN, $cod) { [, $jar] = $jugador('Sin Llaves', 'http://127.0.0.1:' . $P_SIN); return $cod(pedir('POST', 'http://127.0.0.1:' . $P_SIN . '/api/orden', ['producto' => 'creditos_700', 'metodo' => 'paypal'], $jar)); })());
[, $jarM] = $jugador('Minimo Alto', 'http://127.0.0.1:' . $P_MIN);
check('Con PAYPAL_MINIMO=9.99: $4,99 -> 409 paypal_minimo; $9,99 -> 200', [[409, 'paypal_minimo'], 200],
    [$cod(pedir('POST', 'http://127.0.0.1:' . $P_MIN . '/api/orden', ['producto' => 'creditos_700', 'metodo' => 'paypal'], $jarM)), pedir('POST', 'http://127.0.0.1:' . $P_MIN . '/api/orden', ['producto' => 'creditos_1500', 'metodo' => 'paypal'], $jarM)[0]]);

// =====================================================================
titulo('pago.php con una compra de PayPal');
[$c, , , $html, $cab] = pedir('GET', $APP . '/pago.php?o=' . $tok1, null, $jarA, [], false);
check('200, botón "Pagar con PayPal", aviso de sandbox y su script; sin el formulario de tarjeta', [200, true, true, true, false],
    [$c, str_contains($html, 'id="paypal-pagar"'), str_contains($html, 'MODO DE PRUEBAS'), str_contains($html, '/pago-assets/paypal.js'), str_contains($html, 'plux-numero')]);
check('Factura: consumidor final marcado y "con mi cédula, RUC o pasaporte"; sin "titular de la tarjeta"', [true, true, false],
    [(bool) preg_match('/value="consumidor_final" checked/', $html), str_contains($html, 'value="otro"'), str_contains($html, 'value="titular"')]);
check('CSP de la página sin dominios de PayPal (redirección: no carga nada de PayPal)', [true, false],
    [str_contains($cab['content-security-policy'] ?? '', "script-src 'self'"), str_contains($cab['content-security-policy'] ?? '', 'paypal')]);
[$c, , , $html] = pedir('GET', $APP . '/pago.php?o=' . $tokPlux, null, $jarA, [], false);
check('La compra con tarjeta sigue mostrando el formulario de tarjeta', [200, true, false], [$c, str_contains($html, 'plux-numero'), str_contains($html, 'paypal-pagar')]);
[$c, , , $html] = pedir('GET', $APP . '/pago.php?o=' . $tok1 . '&r=paypal_cancelado', null, $jarA, [], false);
check('Al volver cancelado: aviso de que no se cobró nada', true, str_contains($html, 'no se cobró nada'));

// =====================================================================
titulo('Anti-fraude: cada compra con su método y su dueño');
[$B, $jarB] = $jugador('Beto Otro');
check('Otra cuenta con el token de Ana -> 404', [404, 'no_encontrado'], $cod(pedir('POST', $APP . '/api/paypal/crear', ['o' => $tok1], $jarB)));
check('Sin la cabecera X-Envivo -> 403', [403, 'cabecera_requerida'], $cod(pedir('POST', $APP . '/api/paypal/crear', ['o' => $tok1], $jarA, [], false)));
check('GET /api/paypal/crear -> 405', 405, pedir('GET', $APP . '/api/paypal/crear', null, $jarA)[0]);
check('Compra de tarjeta pagada con PayPal -> 409 paypal_metodo_distinto', [409, 'paypal_metodo_distinto'], $cod(pedir('POST', $APP . '/api/paypal/crear', ['o' => $tokPlux], $jarA)));
[$c, $j] = pedir('POST', $APP . '/api/plux/pago', ['o' => $tok1], $jarA);
check('Compra de PayPal pagada con tarjeta -> 409 pago_metodo_distinto (no llama a Plux)', [409, 'pago_metodo_distinto'], [$c, $j['codigo'] ?? null]);
check('Una compra de PayPal de menos del mínimo (hecha a mano) -> 409 paypal_minimo al crear la orden', [409, 'paypal_minimo'],
    (function () use ($A, $APP, $jarA, $cod) {
        $c = Db::tx(fn() => Compras::insertar($A, Catalogo::producto('creditos_250'), 'web_paypal'));
        return $cod(pedir('POST', $APP . '/api/paypal/crear', ['o' => $c['token'], 'factura' => ['modo' => 'consumidor_final']], $jarA));
    })());
check('Factura con una cédula mal escrita -> 422 antes de ir a PayPal (sin orden)', [422, 'factura_cedula_invalida', 0],
    [...$cod(pedir('POST', $APP . '/api/paypal/crear', ['o' => $tok1, 'factura' => ['modo' => 'otro', 'identificacion' => '1712345678', 'razon_social' => 'Ana Pérez']], $jarA)),
     (int) Db::valor('SELECT COUNT(*) FROM paypal_ordenes WHERE compra_id = ?', [$c1['id']])]);

// =====================================================================
titulo('Crear la orden, aprobar y capturar (en el servidor)');
$antesA = $saldo($A);
[$c, $j] = pedir('POST', $APP . '/api/paypal/crear', ['o' => $tok1, 'factura' => ['modo' => 'consumidor_final'], 'total' => '0.01'], $jarA);
$url1 = (string) ($j['url'] ?? '');
$o1 = $ordenDe($url1);
$log = $ppLog('crear', $o1)[0] ?? [];
check('/api/paypal/crear -> 200 con la dirección de PayPal (payer-action)', [200, true, true], [$c, str_starts_with($url1, $PP . '/aprobar?token='), $o1 !== '']);
check('La orden en PayPal: CAPTURE, USD 4.99 (del catálogo), custom_id EV-<compra>, bien digital, sin envío', ['CAPTURE', '4.99', 'USD', 'EV-' . $c1['id'], 'DIGITAL_GOODS', 'NO_SHIPPING'],
    [$log['intent'] ?? null, $log['valor'] ?? null, $log['moneda'] ?? null, $log['custom_id'] ?? null, $log['categoria'] ?? null, $log['envio'] ?? null]);
check('Vuelta a /api/paypal/volver y /api/paypal/cancelado del juego; invoice_id único por compra; PayPal-Request-Id', [$APP . '/api/paypal/volver', $APP . '/api/paypal/cancelado', true, true],
    [$log['return_url'] ?? null, $log['cancel_url'] ?? null, str_starts_with((string) ($log['invoice_id'] ?? ''), 'EV-' . $c1['id'] . '-'), str_starts_with((string) ($log['request_id'] ?? ''), 'ev-orden-' . $c1['id'] . '-')]);
check('La orden queda anotada (creada) con su compra y su valor', ['creada', (int) $c1['id'], 4.99], (function () use ($o1) { $o = PayPal::orden($o1); return [$o['estado'] ?? null, (int) ($o['compra_id'] ?? 0), (float) ($o['valor'] ?? 0)]; })());
check('Volver antes de aprobar: no se entrega (pago.php con aviso)', [302, true, 'pendiente'],
    (function () use ($APP, $o1, $jarA, $c1) { [$c, , $loc] = pedir('GET', $APP . '/api/paypal/volver?token=' . $o1 . '&PayerID=X', null, $jarA, [], false); return [$c, str_contains($loc, 'r=paypal_cancelado'), Compras::porId((int) $c1['id'])['estado']]; })());
[$c, $loc] = $aprobarYVolver($url1, $jarA);
$c1 = Compras::porId((int) $c1['id']);
check('Aprobar y volver -> 302 /?compra=ok; compra pagada por PayPal con la captura', [302, '/?compra=ok', 'pagado', true, true],
    [$c, $loc, $c1['estado'], str_starts_with((string) $c1['plux_transaccion'], 'CAP'), str_contains((string) $c1['pagado_por'], 'PayPal (PRUEBAS)')]);
check('Se entregaron los 700 créditos (una vez)', 700, $saldo($A) - $antesA);
$capturas = fn(string $o) => (int) ($ordenFalsa($o)['capturas'] ?? 0);   // capturas que de verdad cobraron en el PayPal falso
check('Se capturó (cobró) una sola vez', 1, $capturas($o1));
$or1 = PayPal::orden($o1);
check('La orden quedó "capturada" con su número de captura y la comisión', ['capturada', $c1['plux_transaccion'], true], [$or1['estado'], $or1['capture_id'], str_contains((string) $or1['respuesta'], 'paypal_fee')]);
$llamadas = count($ppLog('capturar', $o1));
[$c, , $loc] = pedir('GET', $APP . '/api/paypal/volver?token=' . $o1 . '&PayerID=PAYER1', null, $jarA, [], false);
check('Volver otra vez (recargar) -> /?compra=ok sin capturar ni entregar otra vez', [302, '/?compra=ok', $llamadas, 1, 700], [$c, $loc, count($ppLog('capturar', $o1)), $capturas($o1), $saldo($A) - $antesA]);
check('Capturar otra vez desde el servidor: "pagado", sin llamar a PayPal', ['pagado', $llamadas], [PayPal::capturar($o1, 'prueba')['estado'], count($ppLog('capturar', $o1))]);
[$c, $j] = pedir('POST', $APP . '/api/paypal/crear', ['o' => $tok1], $jarA);
check('Crear otra orden para la compra ya pagada -> {ok, ir: /?compra=ok} (no se cobra otra vez)', [200, '/?compra=ok'], [$c, $j['ir'] ?? null]);
check('Ganchos: canal "paypal" (el VIP y los demás módulos lo cuentan como venta)', true, (bool) Db::valor("SELECT 1 FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'compra'", [$A]));

// Facturación SRI
$f1 = Db::fila("SELECT * FROM facturas WHERE tipo = 'factura' AND compra_id = ?", [$c1['id']]);
check('Factura pendiente: canal web_paypal, forma de pago 20 (otros con utilización del sistema financiero), consumidor final con el correo de la cuenta',
    ['web_paypal', '20', '07', '9999999999999', true, 4.99], [$f1['canal'] ?? null, $f1['forma_pago'] ?? null, $f1['comprador_tipo_id'] ?? null, $f1['comprador_identificacion'] ?? null,
     ($f1['comprador_email'] ?? '') === Db::valor('SELECT email FROM jugadores WHERE id = ?', [$A]), (float) ($f1['total'] ?? 0)]);
$jf = $f1 ? Facturacion::json($f1) : [];
check('El ERP recibe la transacción = número de la captura de PayPal y el nombre de la forma de pago', [$c1['plux_transaccion'], 'Otros con utilización del sistema financiero'],
    [$jf['compra']['transaccion'] ?? null, $jf['forma_pago']['nombre'] ?? null]);

// =====================================================================
titulo('Dos pestañas: dos órdenes para la misma compra, solo se cobra una');
[$C, $jarC] = $jugador('Caro Dos Pestañas');
[$tokC, $idC, $oA, $urlA] = $preparar($jarC, 'creditos_1500');
[, $k] = pedir('POST', $APP . '/api/paypal/crear', ['o' => $tokC, 'factura' => ['modo' => 'consumidor_final']], $jarC);
$urlB = (string) ($k['url'] ?? ''); $oB = $ordenDe($urlB);
check('Dos órdenes distintas para la compra', [true, 2], [$oA !== $oB && $oB !== '', (int) Db::valor('SELECT COUNT(*) FROM paypal_ordenes WHERE compra_id = ?', [$idC])]);
pedir('GET', $urlB, null, null, [], false);   // aprueba la B en otra pestaña (sin volver todavía)
[$c, $loc] = $aprobarYVolver($urlA, $jarC);
check('Paga con la A -> pagada', [302, '/?compra=ok', 'pagado'], [$c, $loc, Compras::porId($idC)['estado']]);
[$c, , $loc] = pedir('GET', $APP . '/api/paypal/volver?token=' . $oB . '&PayerID=PAYER1', null, $jarC, [], false);
check('Vuelve con la B -> /?compra=ok y la B NUNCA se captura (no hay doble cobro)', [302, '/?compra=ok', 0, 'sin_capturar', 1500],
    [$c, $loc, count($ppLog('capturar', $oB)), PayPal::orden($oB)['estado'], $saldo($C)]);

// =====================================================================
titulo('La captura ya estaba hecha (ORDER_ALREADY_CAPTURED) y otra referencia de captura');
[$tokD, $idD, $oD, $urlD] = $preparar($jarC, 'creditos_700');
pedir('GET', $urlD, null, null, [], false);
// Alguien (o una respuesta perdida) ya capturó en PayPal con otro PayPal-Request-Id
pedir('POST', $PP . '/v2/checkout/orders/' . $oD . '/capture', '{}', null, ['Authorization: Bearer A21AA-falso-' . substr(hash('sha256', $CLIENTE), 0, 16), 'PayPal-Request-Id: otro-1'], false);
[$c, , $loc] = pedir('GET', $APP . '/api/paypal/volver?token=' . $oD . '&PayerID=PAYER1', null, $jarC, [], false);
check('Se consulta la orden ya capturada, se revisa y se entrega una vez', [302, '/?compra=ok', 'pagado', 2200, 1], [$c, $loc, Compras::porId($idD)['estado'], $saldo($C), count($ppLog('ver', $oD))]);

// =====================================================================
titulo('Lo que dice PayPal no coincide: no se entrega');
$sinLimitesIp();
[$E2, $jarE] = $jugador('Eva Valores');
foreach ([['valor' => '0.99', 'n' => 'valor $0,99'], ['moneda' => 'EUR', 'n' => 'moneda EUR'], ['custom_id' => 'EV-999999', 'n' => 'otra referencia (custom_id)']] as $esc) {
    [$tk, $idX, $oX, $urlX] = $preparar($jarE, 'creditos_700');
    $nombre = $esc['n']; unset($esc['n']);
    pedir('POST', $PP . '/falso/escenario', ['orden' => $oX] + $esc, null, [], false);
    [$c, $loc] = $aprobarYVolver($urlX, $jarE);
    check('Captura con ' . $nombre . ' -> pago.php (r=paypal_error), compra pendiente, sin créditos, aviso paypal_no_coincide', [302, true, 'pendiente', 0, true, 'no_coincide'],
        [$c, str_contains($loc, '/pago.php?o=' . $tk . '&r=paypal_error'), Compras::porId($idX)['estado'], $saldo($E2),
         (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'paypal_no_coincide' AND compra_id = ?", [$idX]), PayPal::orden($oX)['estado']]);
}
[$c, , , $html] = pedir('GET', $APP . '/pago.php?o=' . $tk . '&r=paypal_error', null, $jarE, [], false);
check('pago.php dice que no pague otra vez y que escriba a soporte', true, str_contains($html, 'no pagues otra vez'));

// =====================================================================
titulo('Rechazo, cancelar y captura pendiente (llega por el webhook)');
[$tk, $idR, $oR, $urlR] = $preparar($jarE, 'creditos_700');
pedir('POST', $PP . '/falso/escenario', ['orden' => $oR, 'issue' => 'INSTRUMENT_DECLINED'], null, [], false);
[$c, $loc] = $aprobarYVolver($urlR, $jarE);
check('PayPal rechaza el medio de pago -> pago.php (r=paypal_rechazado), compra pendiente para reintentar', [302, true, 'pendiente', 'rechazada'],
    [$c, str_contains($loc, 'r=paypal_rechazado'), Compras::porId($idR)['estado'], PayPal::orden($oR)['estado']]);
[$tk, $idK, $oK, $urlK] = $preparar($jarE, 'creditos_700');
[, , $cancel] = pedir('GET', $urlK . '&cancelar=1', null, null, [], false);
[$c, , $loc] = pedir('GET', $cancel, null, $jarE, [], false);
check('Cancelar en PayPal -> pago.php (r=paypal_cancelado), orden cancelada, nada capturado', [302, true, 'cancelada', 0],
    [$c, str_contains($loc, '/pago.php?o=' . $tk . '&r=paypal_cancelado'), PayPal::orden($oK)['estado'], count($ppLog('capturar', $oK))]);
check('Volver con una orden que no existe -> 404', 404, pedir('GET', $APP . '/api/paypal/volver?token=NOEXISTE123', null, $jarE, [], false)[0]);
[$tkP, $idP, $oP, $urlP] = $preparar($jarE, 'creditos_700');
pedir('POST', $PP . '/falso/escenario', ['orden' => $oP, 'estado' => 'PENDING'], null, [], false);
[$c, , $vuelta] = $aprobarYVolver($urlP, $jarE);
[, , , $html] = pedir('GET', $vuelta, null, $jarE, [], false);
check('Captura PENDIENTE -> página "PayPal está revisando tu pago" (202), compra pendiente, sin créditos, aviso', [202, true, 'pendiente', 'paypal_pendiente', 0, true],
    [$c, str_contains($html, 'revisando tu pago'), Compras::porId($idP)['estado'], Compras::porId($idP)['plux_paso'], $saldo($E2),
     (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'paypal_pendiente' AND compra_id = ?", [$idP])]);

// =====================================================================
titulo('Webhook: firma (verify-webhook-signature)');
/** Cabeceras como las manda PayPal; el PayPal falso "firma" con HMAC + CRC32 del cuerpo TAL CUAL. */
$cabWebhook = function (string $cuerpo, array $op = []) use ($FIRMA, $WEBHOOK): array {
    $tid = $op['tid'] ?? bin2hex(random_bytes(8)); $tt = gmdate('Y-m-d\TH:i:s\Z');
    $sig = $op['sig'] ?? base64_encode(hash_hmac('sha256', $tid . '|' . $tt . '|' . ($op['wh'] ?? $WEBHOOK) . '|' . crc32($cuerpo), $FIRMA, true));
    return ['PAYPAL-AUTH-ALGO: SHA256withRSA', 'PAYPAL-CERT-URL: https://api.sandbox.paypal.com/v1/notifications/certs/CERT-PRUEBA', 'PAYPAL-TRANSMISSION-ID: ' . $tid,
        'PAYPAL-TRANSMISSION-SIG: ' . $sig, 'PAYPAL-TRANSMISSION-TIME: ' . $tt];
};
$webhook = function (array $ev, array $op = [], ?string $url = null) use ($APP, $cabWebhook): array {
    $cuerpo = json_encode($ev, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);   // con espacios: si el servidor rearmara el JSON, la firma fallaría
    return pedir('POST', ($url ?? $APP) . '/api/paypal/webhook', $cuerpo, null, $op['sin_cab'] ?? false ? [] : $cabWebhook($cuerpo, $op), false);
};
$ev = fn(string $tipo, string $rt, array $r) => ['id' => 'WH-' . strtoupper(bin2hex(random_bytes(6))), 'event_version' => '1.0', 'create_time' => gmdate('c'), 'resource_type' => $rt, 'event_type' => $tipo,
    'summary' => 'prueba', 'resource' => $r];
$capP = $ordenFalsa($oP)['captura'] ?? [];
$evCompleto = $ev('PAYMENT.CAPTURE.COMPLETED', 'capture', ['id' => $capP['id'] ?? '', 'status' => 'COMPLETED', 'amount' => ['currency_code' => 'USD', 'value' => '4.99'],
    'custom_id' => 'EV-' . $idP, 'final_capture' => true, 'supplementary_data' => ['related_ids' => ['order_id' => $oP]]]);
check('Firma mala -> 401 y no se aplica (aviso paypal_firma_mala)', [401, 'pendiente', true],
    [$webhook($evCompleto, ['sig' => base64_encode(random_bytes(32))])[0], Compras::porId($idP)['estado'], (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'paypal_firma_mala'")]);
check('Firmado para OTRO webhook (otro webhook_id) -> 401', 401, $webhook($evCompleto, ['wh' => 'WH-OTRO'])[0]);
check('Sin las cabeceras de PayPal -> 400', 400, $webhook($evCompleto, ['sin_cab' => true])[0]);
check('GET -> 405 · cuerpo que no es JSON -> 400', [405, 400], [pedir('GET', $APP . '/api/paypal/webhook', null, null, [], false)[0], pedir('POST', $APP . '/api/paypal/webhook', 'no-json', null, $cabWebhook('no-json'), false)[0]]);
check('Servidor sin llaves de PayPal -> 503', 503, $webhook($evCompleto, [], 'http://127.0.0.1:' . $P_SIN)[0]);
$sinLimitesIp();
[$c, $j] = $webhook($evCompleto);
check('Firma buena: PAYMENT.CAPTURE.COMPLETED entrega la compra pendiente (una vez)', [200, 'pagado', 'pagado', 700],
    [$c, $j['resultado'] ?? null, Compras::porId($idP)['estado'], $saldo($E2)]);
check('El MISMO aviso otra vez (PayPal reintenta) -> "repetido", sin entregar otra vez', ['repetido', 700], [$webhook($evCompleto)[1]['resultado'] ?? null, $saldo($E2)]);
$evCompleto['id'] = 'WH-OTRO-' . bin2hex(random_bytes(4));
check('Otro aviso de la misma captura -> ya_pagado', ['ya_pagado', 700], [$webhook($evCompleto)[1]['resultado'] ?? null, $saldo($E2)]);
check('Cada aviso queda anotado (paypal_eventos) con su compra', true, (int) Db::valor("SELECT COUNT(*) FROM paypal_eventos WHERE tipo = 'PAYMENT.CAPTURE.COMPLETED' AND compra_id = ?", [$idP]) >= 2);
[$c, $j] = $webhook($ev('PAYMENT.CAPTURE.COMPLETED', 'capture', ['id' => 'CAPNOEXISTE00001', 'status' => 'COMPLETED', 'amount' => ['currency_code' => 'USD', 'value' => '4.99'], 'custom_id' => 'EV-77777777']));
check('Aviso de una captura que no es del juego -> 200 sin_compra y aviso para el dueño', [200, 'sin_compra', true], [$c, $j['resultado'] ?? null, (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'paypal_aviso_sin_compra'")]);
[$c, $j] = $webhook($ev('PAYMENT.SALE.COMPLETED', 'sale', ['id' => 'X1']));
check('Evento que no se usa -> 200 ignorado', [200, 'ignorado'], [$c, $j['resultado'] ?? null]);

// Orden aprobada que llega solo por el webhook (el comprador cerró el navegador)
[$tkW, $idW, $oW, $urlW] = $preparar($jarE, 'creditos_700');
pedir('GET', $urlW, null, null, [], false);   // aprueba, pero nunca vuelve
[$c, $j] = $webhook($ev('CHECKOUT.ORDER.APPROVED', 'checkout-order', ['id' => $oW, 'status' => 'APPROVED', 'intent' => 'CAPTURE']));
check('CHECKOUT.ORDER.APPROVED: el servidor captura y entrega', [200, 'pagado', 'pagado', 1400, 1], [$c, $j['resultado'] ?? null, Compras::porId($idW)['estado'], $saldo($E2), count($ppLog('capturar', $oW))]);

// =====================================================================
titulo('Reembolsos, reversiones y disputas: se revierte como Plux y Google');
$ref = fn(string $tipo, string $capId, string $valor, string $custom, ?string $total = null) => $ev($tipo, 'refund', ['id' => 'REF' . strtoupper(bin2hex(random_bytes(5))), 'status' => 'COMPLETED',
    'amount' => ['currency_code' => 'USD', 'value' => $valor], 'custom_id' => $custom,
    'seller_payable_breakdown' => ['total_refunded_amount' => ['currency_code' => 'USD', 'value' => $total ?? $valor]],
    'links' => [['rel' => 'self', 'href' => 'https://api.sandbox.paypal.com/v2/payments/refunds/X'], ['rel' => 'up', 'href' => 'https://api.sandbox.paypal.com/v2/payments/captures/' . $capId]]]);
// Ana: factura a nombre propio (cédula) ya autorizada por el ERP -> el reembolso crea la nota de crédito
[$F, $jarF] = $jugador('Fer Factura');
[$tkF, $idF, $oF, $urlF] = $preparar($jarF, 'creditos_700', ['modo' => 'otro', 'identificacion' => '1710034065', 'razon_social' => 'Fernanda Torres', 'email' => 'fer.factura@prueba.example']);
$aprobarYVolver($urlF, $jarF);
$fF = Db::fila("SELECT * FROM facturas WHERE tipo = 'factura' AND compra_id = ?", [$idF]);
check('Factura con la cédula que escribió (05) y su correo, forma de pago 20', ['05', '1710034065', 'FERNANDA TORRES', 'fer.factura@prueba.example', '20'],
    [$fF['comprador_tipo_id'] ?? null, $fF['comprador_identificacion'] ?? null, $fF['comprador_razon_social'] ?? null, $fF['comprador_email'] ?? null, $fF['forma_pago'] ?? null]);
Facturacion::confirmar(['id' => (int) $fF['id'], 'estado' => 'autorizada', 'clave_acceso' => str_pad((string) $fF['id'], 49, '5', STR_PAD_LEFT), 'numero_comprobante' => '001-001-000000777']);
$capF = (string) Compras::porId($idF)['plux_transaccion'];
[$c, $j] = $webhook($ref('PAYMENT.CAPTURE.REFUNDED', $capF, '1.00', 'EV-' . $idF));
check('Reembolso PARCIAL ($1 de $4,99) -> no se revierte solo; aviso para decidir', [200, 'reembolso_parcial', 'pagado', 700, true],
    [$c, $j['resultado'] ?? null, Compras::porId($idF)['estado'], $saldo($F), (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'paypal_reembolso_parcial' AND compra_id = ?", [$idF])]);
[$c, $j] = $webhook($ref('PAYMENT.CAPTURE.REFUNDED', $capF, '3.99', 'EV-' . $idF, '4.99'));
$cF = Compras::porId($idF);
check('Reembolso que completa el total -> compra revertida (reembolso), créditos quitados, cuenta suspendida', [200, 'revertida', 'revertido', 'reembolso', 0, 'suspendido'],
    [$c, $j['resultado'] ?? null, $cF['estado'], $cF['revertida_tipo'], $saldo($F), Cuentas::estadoCuenta($F)]);
$nc = Db::fila("SELECT * FROM facturas WHERE tipo = 'nota_credito' AND compra_id = ?", [$idF]);
check('Facturación: nota de crédito pendiente que modifica la factura autorizada', ['pendiente', (int) $fF['id'], true], [$nc['estado'] ?? null, (int) ($nc['factura_id'] ?? 0), str_contains((string) ($nc['motivo'] ?? ''), 'Reembolso')]);
check('Auditoría y aviso del reembolso de PayPal', [true, true], [(bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'compra_reembolso' AND compra_id = ?", [$idF]),
    (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'paypal_reembolso' AND compra_id = ?", [$idF])]);
check('Otro aviso del mismo reembolso -> ya_revertida (no se revierte dos veces)', 'ya_revertida', $webhook($ref('PAYMENT.CAPTURE.REFUNDED', $capF, '4.99', 'EV-' . $idF))[1]['resultado'] ?? null);
// Reversión (contracargo del banco del comprador): banea por la regla de abuso
[$G, $jarG] = $jugador('Gabo Reversa');
[$tkG, $idG, $oG, $urlG] = $preparar($jarG, 'creditos_700');
$aprobarYVolver($urlG, $jarG);
[$c, $j] = $webhook($ref('PAYMENT.CAPTURE.REVERSED', (string) Compras::porId($idG)['plux_transaccion'], '4.99', 'EV-' . $idG));
check('PAYMENT.CAPTURE.REVERSED -> contracargo: revertida, créditos quitados y cuenta BANEADA (regla de abuso)', [200, 'revertida', 'contracargo', 0, 'baneado'],
    [$c, $j['resultado'] ?? null, Compras::porId($idG)['revertida_tipo'], $saldo($G), Cuentas::estadoCuenta($G)]);
check('Consumidor final: la nota de crédito no aplica (SRI 2026) o la factura no se emite', true,
    in_array(Db::valor("SELECT estado FROM facturas WHERE compra_id = ? ORDER BY id DESC LIMIT 1", [$idG]), ['no_aplica'], true));
// Disputa
[$H, $jarH] = $jugador('Hugo Disputa');
[$tkH, $idH, $oH, $urlH] = $preparar($jarH, 'creditos_1500');
$aprobarYVolver($urlH, $jarH);
$antesH = $saldo($H);
[$c, $j] = $webhook($ev('CUSTOMER.DISPUTE.CREATED', 'dispute', ['dispute_id' => 'PP-D-12345', 'reason' => 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', 'status' => 'OPEN',
    'dispute_amount' => ['currency_code' => 'USD', 'value' => '9.99'], 'disputed_transactions' => [['seller_transaction_id' => (string) Compras::porId($idH)['plux_transaccion'], 'custom' => 'EV-' . $idH]]]));
$cH = Compras::porId($idH);
check('CUSTOMER.DISPUTE.CREATED -> la compra se revierte (contracargo) con el número de la disputa', [200, 'revertida', 'revertido', 'contracargo', true, 1500, 0],
    [$c, $j['resultado'] ?? null, $cH['estado'], $cH['revertida_tipo'], str_contains((string) $cH['revertida_motivo'], 'PP-D-12345'), $antesH, $saldo($H)]);
check('Disputa de una transacción que no es del juego -> sin_compra', 'sin_compra',
    $webhook($ev('CUSTOMER.DISPUTE.CREATED', 'dispute', ['dispute_id' => 'PP-D-0', 'disputed_transactions' => [['seller_transaction_id' => 'NOEXISTE99999']]]))[1]['resultado'] ?? null);

// =====================================================================
titulo('Límites (como Plux)');
$sinLimitesIp();
[$tkL, $idL] = $preparar($jarB, 'creditos_700');   // 1 intento
$r = [];
for ($i = 0; $i < 12; $i++) $r[] = pedir('POST', $APP . '/api/paypal/crear', ['o' => $tkL, 'factura' => ['modo' => 'consumidor_final']], $jarB)[0];
check('Más de 12 intentos para la misma compra en 10 minutos -> 429 limite_intentos', [200, 429], [$r[10], $r[11]]);
check('…y la respuesta trae el código', 'limite_intentos', pedir('POST', $APP . '/api/paypal/crear', ['o' => $tkL], $jarB)[1]['codigo'] ?? null);

// =====================================================================
titulo('Centro de Control: compras con su canal y estado de PayPal en Ajustes');
define('ENVIVO_CONTROL', true);
require $SRV . '/public/control/lib/base.php';
foreach (['resumen', 'jugadores', 'compras', 'productos', 'mercado', 'chat', 'soporte', 'ajustes', 'servidores', 'facturacion'] as $lib) require_once $SRV . '/public/control/lib/' . $lib . '.php';
$_GET = ['t' => 'compras', 'canal' => 'web_paypal', 'estado' => 'todas'];
$h = cc_t_compras();
check('Compras: filtro "Web (PayPal)" y distintivo PayPal en la tabla', [true, true, true], [str_contains($h, 'Web (PayPal)'), str_contains($h, '>PayPal</span>'), str_contains($h, 'N° ' . $c1['id']) || str_contains($h, '<b>' . $c1['id'] . '</b>')]);
$_GET = ['t' => 'compras', 'id' => (string) $c1['id']];
$h = cc_t_compras();
check('Detalle: canal web_paypal, captura y la orden con la comisión de PayPal', [true, true, true, true],
    [str_contains($h, 'web_paypal'), str_contains($h, 'Captura de PayPal'), str_contains($h, 'Orden de PayPal ' . $o1), str_contains($h, 'comisión de PayPal')]);
$_GET = ['t' => 'ajustes'];
$h = cc_t_ajustes();
check('Ajustes: panel PayPal con sandbox, llaves y webhook puestos, mínimo, dirección del webhook y los avisos (sin mostrar las llaves)', [true, true, true, true, true, false, false],
    [str_contains($h, 'id="panel-paypal"'), str_contains($h, 'sandbox (pruebas)'), str_contains($h, '$4,99'), str_contains($h, '/api/paypal/webhook'), str_contains($h, 'id="tabla-paypal-eventos"'),
     str_contains($h, $SECRETO), str_contains($h, $CLIENTE)]);
$_GET = ['t' => 'facturacion', 'canal' => 'web_paypal'];
check('Facturación: filtro por canal PayPal', true, str_contains(cc_t_facturacion(), 'Web (PayPal)'));

// =====================================================================
titulo('Configuración, despliegue, privacidad y traducciones');
$ej = (string) file_get_contents($SRV . '/config.env.ejemplo');
check('config.env.ejemplo con las líneas de PayPal (vacías: el repositorio es público) y sandbox / 4.99 por defecto', [true, true, true, true, true],
    [str_contains($ej, "\nPAYPAL_CLIENT_ID=\n"), str_contains($ej, "\nPAYPAL_SECRET=\n"), str_contains($ej, "\nPAYPAL_WEBHOOK_ID=\n"), str_contains($ej, "\nPAYPAL_AMBIENTE=sandbox\n"), str_contains($ej, "\nPAYPAL_MINIMO=4.99\n")]);
$ins = (string) file_get_contents($SRV . '/deploy/instalar.sh');
check('instalar.sh crea las mismas líneas', [true, true], [str_contains($ins, "\nPAYPAL_CLIENT_ID=\n"), str_contains($ins, "\nPAYPAL_WEBHOOK_ID=\n")]);
$ng = (string) file_get_contents($SRV . '/deploy/nginx-sitio.sh');
check('nginx: en mantenimiento el aviso y el regreso de PayPal siguen funcionando', true, str_contains($ng, 'paypal/webhook|paypal/volver|paypal/cancelado'));
$priv = (string) file_get_contents($SRV . '/public/privacidad.html');
check('Privacidad: menciona a PayPal como procesador de pagos (y las 9 traducciones)', [true, 9],
    [str_contains($priv, 'PayPal'), count(array_filter(glob($RAIZ . '/docs/traducciones/legal/privacidad_*.html'), fn($f) => str_contains((string) file_get_contents($f), 'PayPal')))]);
check('Guía para el dueño docs/PAYPAL.md', [true, true, true], (function () use ($RAIZ) { $g = (string) @file_get_contents($RAIZ . '/docs/PAYPAL.md');
    return [str_contains($g, '/api/paypal/webhook'), str_contains($g, 'sudo nano /etc/envivo/config.env'), str_contains($g, 'CUSTOMER.DISPUTE.CREATED')]; })());
$tr = json_decode((string) file_get_contents($RAIZ . '/docs/traducciones/errores_nuevos/paypal.json'), true);
$baseTr = json_decode((string) file_get_contents($RAIZ . '/docs/traducciones/errores.json'), true);
$idiomas = array_values(array_filter(array_keys($baseTr), fn($k) => $k[0] !== '_'));
$codigos = array_keys($tr['_codigos'] ?? []);
preg_match_all("/'codigo' => '(paypal_[a-z_]+|pago_metodo_distinto)'|\\], '(paypal_[a-z_]+|pago_metodo_distinto)'\\)/", (string) file_get_contents($SRV . '/src/PayPal.php') . file_get_contents($SRV . '/src/PayPalApi.php')
    . file_get_contents($SRV . '/src/Compras.php') . file_get_contents($SRV . '/public/api.php'), $m);
$usados = array_values(array_unique(array_filter(array_merge($m[1], $m[2])))); sort($usados);
$cs = $codigos; sort($cs);
check('errores_nuevos/paypal.json: los 10 idiomas, cada uno con todos los códigos, sin vacíos', [$idiomas, true, true],
    [array_values(array_filter(array_keys($tr), fn($k) => $k[0] !== '_')), array_reduce($idiomas, fn($a, $l) => $a && array_keys($tr[$l] ?? []) === $codigos, true),
     array_reduce($idiomas, fn($a, $l) => $a && !in_array('', array_map('trim', $tr[$l] ?? ['']), true), true)]);
check('Cada código de PayPal que manda el servidor está traducido (y fusionado en errores.json)', [$usados, true],
    [array_values(array_intersect($cs, $usados)), array_reduce($idiomas, fn($a, $l) => $a && count(array_intersect_key(array_flip($codigos), $baseTr[$l])) === count($codigos), true)]);
$lang = (string) file_get_contents($RAIZ . '/js/lang/es.js');
check('…y en js/lang (error.paypal_minimo)', true, str_contains($lang, '"error.paypal_minimo"'));

// =====================================================================
check('PayPal falso: todas las llamadas con credenciales válidas', 0, count(array_filter(array_map(fn($l) => json_decode($l, true), file($TMP . '/pp/log.jsonl', FILE_IGNORE_NEW_LINES) ?: []), fn($j) => ($j['auth_ok'] ?? true) === false)));
foreach ($procs as $p) { proc_terminate($p); proc_close($p); }
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en los servidores', '', $errores);
$todo = (string) @file_get_contents($TMP . '/php_errores.log') . (string) @file_get_contents($TMP . '/http.log');
check('El secreto de PayPal no aparece en ningún registro', false, str_contains($todo, $SECRETO));
echo "\n----------------------------------------\nPayPal: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
