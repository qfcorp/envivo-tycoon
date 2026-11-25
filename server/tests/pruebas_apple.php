<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Compras del App Store en la app de iPhone (server/src/Apple.php,
// docs/IPHONE_APP_STORE.md): base SQLite TEMPORAL, un «Apple falso» (tests/apple_falso.php: raíz, intermedia y hoja hechas
// aquí con OpenSSL; la raíz de prueba se inyecta con APPLE_ROOT_CA) y el juego de verdad (php -S + router.php + api.php).
// Casos: migración (canal 'apple', columnas, avisos), firma del JWS (buena, alterada, otra raíz, sin las marcas de Apple,
// sin x5c, otro algoritmo, fecha futura, certificados vencidos), sesión y X-Envivo, la app de iPhone SÍ puede verificar
// (y sigue sin poder pagar con Google, Plux, PayPal ni Tukán Pagos), entrega idempotente por transactionId y por
// originalTransactionId, a la vez (4 pedidos iguales), producto que no coincide, producto que no existe u oculto, bundle
// equivocado, tipo equivocado, Sandbox (PRUEBA, sin factura) y Xcode, APPLE_SANDBOX=0, appAccountToken (apple_cuenta) de
// esta cuenta y de otra, misma compra en otra cuenta, revocada, «una sola vez» repetido (no se entrega otra vez), avisos de
// Apple (REFUND revierte, repetido, firma mala, TEST, otra app), factura SRI (forma de pago 20), lista de productos para
// App Store Connect (bin/apple_productos.php) y traducciones.
// Uso:  php server/tests/pruebas_apple.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$TMP = sys_get_temp_dir() . '/envivo_apple_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; };
$P_APP = (int) (getenv('P_APP') ?: $puerto());
$P_SIN = $puerto();
$APP = 'http://127.0.0.1:' . $P_APP;
$SIN = 'http://127.0.0.1:' . $P_SIN;

require $SRV . '/tests/apple_falso.php';
$AF = new AppleFalso($TMP . '/apple');                 // el «Apple» de esta prueba (su raíz va en APPLE_ROOT_CA)
$OTRA = new AppleFalso($TMP . '/otra');                // otra cadena completa, con otra raíz (no es «Apple»)
$SINMARCAS = new AppleFalso($TMP . '/sinmarcas', true); // cadena sin las marcas (OID) de Apple

$base = "; SOLO PRUEBAS (pruebas_apple.php)\nENVIVO_ZONA=America/Guayaquil\nAPPLE_ROOT_CA={$AF->raiz}\n";
file_put_contents($TMP . '/config.env', $base . "ENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=$APP\n");
file_put_contents($TMP . '/config_sin.env', $base . "ENVIVO_DB=$TMP/datos/envivo_sin.sqlite\nENVIVO_URL=$SIN\nAPPLE_SANDBOX=0\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Apple, Catalogo, Compras, Db, Facturacion, Fallo, Migraciones, PanelVentas};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
/** [código HTTP, codigo] de un Fallo (200 si no falló). */
function falla(callable $f): array
{
    try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; }
}

Db::pdo();
if (property_exists(Facturacion::class, 'empujarAlTerminar')) Facturacion::$empujarAlTerminar = false;

// =====================================================================
titulo('Migración: apple.sql y el canal apple en compras');
$sqlCompras = (string) Db::valor("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'compras'");
check("La regla del canal acepta 'apple' (y sigue aceptando web_plux, google_play y web_paypal)", [true, true, true, true],
    [str_contains($sqlCompras, "'apple'"), str_contains($sqlCompras, "'web_plux'"), str_contains($sqlCompras, "'google_play'"), str_contains($sqlCompras, "'web_paypal'")]);
$cols = Migraciones::columnas('compras');
check('Columnas apple_transaccion, apple_original y apple_ambiente', [true, true, true], [isset($cols['apple_transaccion']), isset($cols['apple_original']), isset($cols['apple_ambiente'])]);
$idx = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'compras' AND sql IS NOT NULL ORDER BY name"), 'name');
check('Índices de compras (los de antes y los de Apple) después de rehacer la tabla', [true, true, true, true, true],
    [in_array('compras_jugador', $idx, true), in_array('compras_google_token', $idx, true), in_array('compras_estado', $idx, true), in_array('compras_apple_transaccion', $idx, true), in_array('compras_apple_original', $idx, true)]);
check('Tabla apple_avisos', true, Migraciones::columnas('apple_avisos') !== null);
check('Aplicar apple.sql otra vez no cambia nada', [], Migraciones::aplicar('apple.sql'));
// Una base vieja (regla del canal solo web_plux / google_play, o ya con web_paypal) se amplía sin perder filas
foreach (["'web_plux', 'google_play'", "'web_plux', 'google_play', 'web_paypal'"] as $vieja) {
    $p = new PDO('sqlite::memory:');
    $p->exec("CREATE TABLE compras (id INTEGER PRIMARY KEY, canal TEXT NOT NULL DEFAULT 'web_plux' CHECK (canal IN ($vieja)), total REAL)");
    $p->exec("CREATE INDEX compras_x ON compras (canal)");
    $p->exec("INSERT INTO compras (canal, total) VALUES ('web_plux', 1.99), ('google_play', 4.99)");
    $m = new ReflectionMethod(Db::class, 'ampliarCanales');
    $m->invoke(null, $p);
    $s = (string) $p->query("SELECT sql FROM sqlite_master WHERE name = 'compras'")->fetchColumn();
    $ok = true; try { $p->exec("INSERT INTO compras (canal, total) VALUES ('apple', 0.99)"); } catch (\Throwable) { $ok = false; }
    check("Base vieja ($vieja): se amplía a los 4 canales, sin perder filas ni índices, y acepta 'apple'", [true, 3, true],
        [str_contains($s, "CHECK (canal IN ('web_plux', 'google_play', 'web_paypal', 'apple'))") && $ok, (int) $p->query('SELECT COUNT(*) FROM compras')->fetchColumn(), (bool) $p->query("SELECT 1 FROM sqlite_master WHERE name = 'compras_x'")->fetchColumn()]);
}

// =====================================================================
titulo('Configuración, productos y apple_cuenta');
check('Configurado con la raíz de la prueba; Sandbox aceptado por defecto; bundle com.tukanec.envivo', [true, true, 'com.tukanec.envivo'], [Apple::configurado(), Apple::sandbox(), Apple::bundle()]);
check('La raíz de la prueba NO es la de Apple (huella distinta)', false, Apple::raizEsDeApple());
$real = $SRV . '/config/apple/AppleRootCA-G3.cer';
check('El repositorio trae la Apple Root CA - G3 de verdad (huella SHA-256 oficial)', Apple::HUELLA_RAIZ_APPLE,
    is_file($real) ? openssl_x509_fingerprint("-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode((string) file_get_contents($real)), 64, "\n") . "-----END CERTIFICATE-----\n", 'sha256') : null);
check('Producción siempre; Sandbox sí (APPLE_SANDBOX vacío); Xcode y LocalTesting no', [true, true, false, false],
    [Apple::entornoAceptado('Production'), Apple::entornoAceptado('Sandbox'), Apple::entornoAceptado('Xcode'), Apple::entornoAceptado('LocalTesting')]);
check('Ids: envivo.creditos_250 ↔ creditos_250; sin «envivo.» o con letras raras -> null', ['creditos_250', 'envivo.inicio', null, null, null],
    [Apple::idCatalogo('envivo.creditos_250'), Apple::idApple('inicio'), Apple::idCatalogo('creditos_250'), Apple::idCatalogo('envivo.../x'), Apple::idCatalogo('com.otra.creditos_250')]);
check('Se venden: créditos, ofertas del VIP y de novato; no transferencia_cuenta ni productos que no existen', [true, true, true, null, null],
    [Apple::producto('creditos_250') !== null, Apple::producto('oferta_vip_m') !== null, Apple::producto('oferta_novato') !== null, Apple::producto('transferencia_cuenta'), Apple::producto('no_existe')]);
check('Tipo: una_vez -> NON_CONSUMABLE; lo demás CONSUMABLE', ['NON_CONSUMABLE', 'NON_CONSUMABLE', 'CONSUMABLE', 'CONSUMABLE'],
    [Apple::tipo(Apple::producto('inicio')), Apple::tipo(Apple::producto('oferta_novato')), Apple::tipo(Apple::producto('creditos_250')), Apple::tipo(Apple::producto('vip30'))]);
$u7 = Apple::cuenta(7);
check('apple_cuenta: UUID v5 (versión 5, variante RFC 4122), estable y distinto por cuenta', [1, $u7, false],
    [preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $u7), Apple::cuenta(7), Apple::cuenta(8) === $u7]);

// =====================================================================
titulo('Firma del JWS (StoreKit 2): cadena x5c hasta la raíz, marcas de Apple, ES256 y fechas');
$jwsBueno = $AF->transaccion(['transactionId' => '1000000000000001']);
check('JWS bueno: devuelve la transacción', ['1000000000000001', 'envivo.creditos_250', 'com.tukanec.envivo'],
    (function () use ($jwsBueno) { $d = Apple::verificarJws($jwsBueno); return [$d['transactionId'], $d['productId'], $d['bundleId']]; })());
[$h, $p, $f] = explode('.', $jwsBueno);
$pAlterado = rtrim(strtr(base64_encode(str_replace('creditos_250', 'creditos_3200', (string) base64_decode(strtr($p, '-_', '+/')))), '+/', '-_'), '=');
check('Contenido cambiado después de firmar (250 → 3.200 créditos) -> 402 apple_invalida', [402, 'apple_invalida'], falla(fn() => Apple::verificarJws("$h.$pAlterado.$f")));
check('Firmado con otra raíz (no la de Apple guardada en el servidor) -> 402 apple_invalida', [402, 'apple_invalida'], falla(fn() => Apple::verificarJws($OTRA->transaccion())));
// Sin las marcas de Apple: se confía un momento en la raíz de esa cadena (así lo único que falla son las marcas)
$cfg = new ReflectionProperty(\EnVivo\Config::class, 'valores');
$valores = $cfg->getValue();
$cfg->setValue(null, ['APPLE_ROOT_CA' => $SINMARCAS->raiz] + $valores);
check('Cadena sin las marcas (OID) de Apple en la intermedia y la hoja -> 402 apple_invalida (aunque confíe en su raíz)', [402, 'apple_invalida'], falla(fn() => Apple::verificarJws($SINMARCAS->transaccion())));
$cfg->setValue(null, ['APPLE_ROOT_CA' => $TMP . '/no-existe.cer'] + $valores);
check('Sin la raíz de Apple en el servidor -> 503 apple_no_disponible (no se entrega nada)', [false, [503, 'apple_no_disponible'], [503, 'apple_no_disponible']],
    [Apple::configurado(), falla(fn() => Apple::verificarJws($jwsBueno)), falla(fn() => Apple::verificar(1, 'creditos_250', $jwsBueno))]);
$cfg->setValue(null, $valores);
$cab = json_decode((string) base64_decode(strtr($h, '-_', '+/')), true);
$b64 = fn(array $x) => rtrim(strtr(base64_encode(json_encode($x)), '+/', '-_'), '=');
check('Sin x5c, con 2 certificados o con alg HS256 -> 402 apple_invalida', [[402, 'apple_invalida'], [402, 'apple_invalida'], [402, 'apple_invalida']],
    [falla(fn() => Apple::verificarJws($b64(['alg' => 'ES256']) . ".$p.$f")), falla(fn() => Apple::verificarJws($b64(['alg' => 'ES256', 'x5c' => array_slice($cab['x5c'], 0, 2)]) . ".$p.$f")),
     falla(fn() => Apple::verificarJws($b64(['alg' => 'HS256'] + $cab) . ".$p.$f"))]);
check('Texto que no es JWS -> 402; vacío -> 400 datos_invalidos', [[402, 'apple_invalida'], [400, 'datos_invalidos'], [402, 'apple_invalida']],
    [falla(fn() => Apple::verificarJws('hola.mundo')), falla(fn() => Apple::verificarJws('')), falla(fn() => Apple::verificarJws('a.b.c'))]);
check('Firmado «en el futuro» (signedDate dentro de 1 hora) -> 402', [402, 'apple_invalida'], falla(fn() => Apple::verificarJws($AF->transaccion(['signedDate' => (time() + 3600) * 1000]))));
Apple::$ahora = time() + 20 * 365 * 86400;
check('Certificados vencidos cuando Apple firmó (dentro de 20 años) -> 402', [402, 'apple_invalida'], falla(fn() => Apple::verificarJws($AF->transaccion(['_ahora' => Apple::$ahora]))));
Apple::$ahora = null;

// =====================================================================
titulo('Servidores: el juego (php -S + router.php), uno con APPLE_SANDBOX=0');
$procs = [];
$arrancar = function (int $p, string $config) use ($TMP, $RAIZ, $SRV, &$procs): void {
    $cmd = ['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $p, '-t', $RAIZ, $SRV . '/tests/router.php'];
    $procs[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/http.log', 'a'], 2 => ['file', $TMP . '/http.log', 'a']], $tub, $RAIZ,
        ['ENVIVO_CONFIG' => $config, 'PATH' => getenv('PATH'), 'TZ' => 'America/Guayaquil', 'PHP_CLI_SERVER_WORKERS' => '4', 'no_proxy' => '127.0.0.1,localhost']);
    for ($k = 0; $k < 60; $k++) { if (@fsockopen('127.0.0.1', $p)) return; usleep(100000); }
};
$arrancar($P_APP, $TMP . '/config.env');
$arrancar($P_SIN, $TMP . '/config_sin.env');

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TukanIOS/1.1.0';
const UA_IOS_CAB = 'User-Agent: ' . UA_IOS;
/** Petición HTTP (sin seguir redirecciones). Devuelve [código, json, cuerpo]. */
function pedir(string $metodo, string $url, mixed $cuerpo = null, ?string $jar = null, array $cab = [], bool $envivo = true): array
{
    $ch = curl_init($url);
    $h = array_merge(['Content-Type: application/json'], $envivo ? ['X-Envivo: 1'] : [], $cab);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30, CURLOPT_FOLLOWLOCATION => false]
        + ($jar !== null ? [CURLOPT_COOKIEFILE => $jar, CURLOPT_COOKIEJAR => $jar] : [])
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => is_string($cuerpo) ? $cuerpo : json_encode($cuerpo)] : []));
    $b = (string) curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode($b, true), $b];
}
$cod = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null];
$n = 0;
/** Un jugador nuevo con su propia galleta. Devuelve [id, jar]. */
$jugador = function (string $nombre, string $url = '') use ($TMP, $APP, &$n): array {
    $n++;
    $jar = $TMP . '/galleta_' . $n;
    [, $j] = pedir('POST', ($url ?: $APP) . '/api/registro', ['email' => 'ap' . $n . '.' . bin2hex(random_bytes(3)) . '@prueba.example', 'nombre' => $nombre, 'clave' => 'ClaveApple12', 'acepta_terminos' => true, 'edad_16' => true], $jar);
    return [(int) ($j['jugador']['id'] ?? 0), $jar];
};
$saldo = fn(int $j) => (int) Db::valor('SELECT creditos - deuda FROM jugadores WHERE id = ?', [$j]);
$verificar = fn(string $jar, string $producto, string $jws, string $url = '', array $cab = [UA_IOS_CAB]) => pedir('POST', ($url ?: $APP) . '/api/apple/verificar', ['producto' => $producto, 'jws' => $jws], $jar, $cab);
$txid = function (): string { static $k = 1000000000000100; return (string) (++$k); };
$sinLimites = fn() => Db::q("DELETE FROM intentos WHERE clave LIKE 'apple%'");

// =====================================================================
titulo('/api/estado: apple_cuenta (el appAccountToken para comprar)');
[$c, $est] = pedir('GET', $APP . '/api/estado');
check('Sin sesión: apple_cuenta null', [200, true, null], [$c, array_key_exists('apple_cuenta', $est ?? []), ($est ?? [])['apple_cuenta']]);
[$A, $jarA] = $jugador('Ana iPhone');
[, $est] = pedir('GET', $APP . '/api/estado', null, $jarA, [UA_IOS_CAB]);
check('Con sesión: apple_cuenta = Apple::cuenta(id del jugador)', Apple::cuenta($A), $est['apple_cuenta'] ?? null);

// =====================================================================
titulo('Sesión, cabecera y la app de iPhone');
$t1 = $txid();
$jws1 = $AF->transaccion(['transactionId' => $t1, 'appAccountToken' => Apple::cuenta($A)]);
check('Sin sesión -> 401 sesion_requerida (no entrega nada)', [401, 'sesion_requerida'], $cod($verificar($TMP . '/sin_galleta', 'creditos_250', $jws1)));
check('Sin la cabecera X-Envivo -> 403 cabecera_requerida', [403, 'cabecera_requerida'], $cod(pedir('POST', $APP . '/api/apple/verificar', ['producto' => 'creditos_250', 'jws' => $jws1], $jarA, [UA_IOS_CAB], false)));
check('GET /api/apple/verificar -> 405', 405, pedir('GET', $APP . '/api/apple/verificar', null, $jarA)[0]);
$MAL = [];
foreach (['/api/orden', '/api/plux/pago', '/api/paypal/crear', '/api/tukanpagos/crear', '/api/google/verificar'] as $r) {
    $x = pedir('POST', $APP . $r, ['producto' => 'creditos_250', 'o' => 'x', 'purchaseToken' => 'x'], $jarA, [UA_IOS_CAB]);
    if ($cod($x) !== [403, 'no_disponible_ios']) $MAL[] = $r;
}
check('App de iPhone: las 5 rutas de pago siguen en 403 no_disponible_ios (Plux, PayPal, Tukán Pagos y Google: nunca)', [], $MAL);
check('…y /api/apple/verificar NO está en la lista de rutas bloqueadas', false, (bool) preg_match("~API_RUTAS_PAGO = \\[[^\\]]*apple~", (string) file_get_contents($SRV . '/public/api.php')));

// =====================================================================
titulo('Entrega e idempotencia');
$antes = $saldo($A);
[$c, $j] = $verificar($jarA, 'creditos_250', $jws1);
$comp = Db::fila('SELECT * FROM compras WHERE apple_transaccion = ?', [$t1]);
check('Compra buena desde el iPhone -> 200 nueva, estado_compra entregado, +250 créditos', [200, true, 'entregado', 250, 'apple'],
    [$c, $j['nueva'] ?? null, $j['estado_compra'] ?? null, $saldo($A) - $antes, $j['compra']['canal'] ?? null]);
check('La compra: canal apple, pagada por «App Store», con transacción, original y ambiente', ['apple', 'pagado', 'App Store', $t1, $t1, 'Production', $t1, 1.99],
    [$comp['canal'] ?? null, $comp['estado'] ?? null, $comp['pagado_por'] ?? null, $comp['apple_transaccion'] ?? null, $comp['apple_original'] ?? null, $comp['apple_ambiente'] ?? null, $comp['plux_transaccion'] ?? null, (float) ($comp['total'] ?? 0)]);
check('La respuesta trae el estado completo (como /api/google/verificar)', [true, true], [isset($j['tienda']), ($j['creditos'] ?? null) === $saldo($A)]);
[$c, $j] = $verificar($jarA, 'creditos_250', $jws1);
check('El mismo JWS otra vez (restaurar, abrir el juego) -> 200 ya_entregado, sin entregar de nuevo', [200, false, 'ya_entregado', 250, 1],
    [$c, $j['nueva'] ?? null, $j['estado_compra'] ?? null, $saldo($A) - $antes, (int) Db::valor('SELECT COUNT(*) FROM compras WHERE apple_transaccion = ?', [$t1])]);
[$c, $j] = $verificar($jarA, '', $jws1);
check('Sin «producto» (se toma el de la transacción) -> 200 ya_entregado', [200, 'ya_entregado'], [$c, $j['estado_compra'] ?? null]);
// Otro transactionId con el MISMO originalTransactionId (Apple la vuelve a firmar): es la misma compra
[$c, $j] = $verificar($jarA, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'originalTransactionId' => $t1]));
check('Otra transacción con el mismo originalTransactionId -> 200 ya_entregado (sin entregar)', [200, 'ya_entregado', 250], [$c, $j['estado_compra'] ?? null, $saldo($A) - $antes]);
// 4 pedidos iguales a la vez: una sola entrega
$t2 = $txid();
$jws2 = $AF->transaccion(['transactionId' => $t2, 'productId' => 'envivo.creditos_700', 'appAccountToken' => Apple::cuenta($A)]);
$antes2 = $saldo($A);
$mh = curl_multi_init(); $hs = [];
for ($i = 0; $i < 4; $i++) {
    $ch = curl_init($APP . '/api/apple/verificar');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30, CURLOPT_COOKIEFILE => $jarA,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Envivo: 1', UA_IOS_CAB], CURLOPT_POSTFIELDS => json_encode(['producto' => 'creditos_700', 'jws' => $jws2])]);
    curl_multi_add_handle($mh, $ch); $hs[] = $ch;
}
do { curl_multi_exec($mh, $corriendo); curl_multi_select($mh, 0.2); } while ($corriendo);
$codigos = array_map(fn($ch) => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE), $hs);
$nuevas = array_sum(array_map(fn($ch) => (int) !empty(json_decode((string) curl_multi_getcontent($ch), true)['nueva']), $hs));
sort($codigos);
check('4 pedidos a la vez con la misma compra: los 4 en 200, UNA sola nueva, +700 una vez, una fila', [[200, 200, 200, 200], 1, 700, 1],
    [$codigos, $nuevas, $saldo($A) - $antes2, (int) Db::valor('SELECT COUNT(*) FROM compras WHERE apple_transaccion = ?', [$t2])]);

// =====================================================================
titulo('Datos que no coinciden');
[$B, $jarB] = $jugador('Beto Otro');
check('La misma compra (ya entregada a Ana) desde otra cuenta del juego -> 409 apple_otra_cuenta (y aviso)', [[409, 'apple_otra_cuenta'], true],
    [$cod($verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $t1]))), (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'apple_otra_cuenta'")]);
$sinLimites();
check('appAccountToken de otra cuenta (Ana compró, Beto la manda) -> 409 apple_cuenta_distinta (la app no la termina), sin entregar', [[409, 'apple_cuenta_distinta'], 0],
    [$cod($verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $tx = $txid(), 'appAccountToken' => Apple::cuenta($A)]))), (int) Db::valor('SELECT COUNT(*) FROM compras WHERE apple_transaccion = ?', [$tx])]);
check('appAccountToken en mayúsculas de la misma cuenta -> 200 (se compara sin mayúsculas)', 200,
    $verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'appAccountToken' => strtoupper(Apple::cuenta($B))]))[0]);
check('Sin appAccountToken (app que no lo manda) -> 200 (la cuenta es la de la sesión)', 200, $verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'appAccountToken' => null]))[0]);
check('El juego pidió creditos_700 y la compra es de creditos_250 -> 409 apple_no_coincide', [409, 'apple_no_coincide'], $cod($verificar($jarB, 'creditos_700', $AF->transaccion(['transactionId' => $txid()]))));
check('Producto que no existe (envivo.no_existe) -> 404 no_existe', [404, 'no_existe'], $cod($verificar($jarB, '', $AF->transaccion(['transactionId' => $txid(), 'productId' => 'envivo.no_existe']))));
check('Sin el prefijo «envivo.» (creditos_250) -> 404 no_existe', [404, 'no_existe'], $cod($verificar($jarB, '', $AF->transaccion(['transactionId' => $txid(), 'productId' => 'creditos_250']))));
check('Oculto (envivo.transferencia_cuenta) -> 404 no_existe', [404, 'no_existe'], $cod($verificar($jarB, '', $AF->transaccion(['transactionId' => $txid(), 'productId' => 'envivo.transferencia_cuenta']))));
$sinLimites();
check('Bundle de otra app (com.otra.app) -> 409 apple_no_coincide', [409, 'apple_no_coincide'], $cod($verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'bundleId' => 'com.otra.app']))));
check('Tipo equivocado (Non-Consumable para créditos) -> 409 apple_no_coincide', [409, 'apple_no_coincide'], $cod($verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'type' => 'Non-Consumable']))));
check('Revocada (Apple devolvió el dinero antes de entregarla) -> 409 apple_revocada, sin entregar', [409, 'apple_revocada'],
    $cod($verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'revocationDate' => time() * 1000, 'revocationReason' => 0]))));
check('Firmada con otra raíz -> 402 apple_invalida', [402, 'apple_invalida'], $cod($verificar($jarB, 'creditos_250', $OTRA->transaccion(['transactionId' => $txid()]))));
check('JWS vacío -> 400 datos_invalidos; producto con letras raras -> 404', [[400, 'datos_invalidos'], [404, 'no_existe']],
    [$cod($verificar($jarB, 'creditos_250', '')), $cod($verificar($jarB, '../x', $jws1))]);
$sinLimites();

// =====================================================================
titulo('Ambiente: Sandbox (revisión de Apple y TestFlight) y Xcode');
$tS = $txid();
$antesB = $saldo($B);
[$c, $j] = $verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $tS, 'environment' => 'Sandbox']));
$cs = Db::fila('SELECT * FROM compras WHERE apple_transaccion = ?', [$tS]);
check('Sandbox -> 200 entregada (para la revisión de Apple), pagada por «App Store (PRUEBA…)», ambiente Sandbox, aviso al dueño', [200, 250, Apple::QUIEN_PRUEBA, 'Sandbox', true, true],
    [$c, $saldo($B) - $antesB, $cs['pagado_por'] ?? null, $cs['apple_ambiente'] ?? null, PanelVentas::esPrueba($cs ?: []), (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'apple_compra_prueba' AND compra_id = ?", [$cs['id'] ?? 0])]);
check('Xcode (StoreKit local) -> 402 apple_ambiente', [402, 'apple_ambiente'], $cod($verificar($jarB, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'environment' => 'Xcode']))));
[, $jarS] = $jugador('Sin Sandbox', $SIN);
check('Servidor con APPLE_SANDBOX=0: Sandbox -> 402 apple_ambiente; Production -> 200', [[402, 'apple_ambiente'], 200],
    [$cod($verificar($jarS, 'creditos_250', $AF->transaccion(['transactionId' => $txid(), 'environment' => 'Sandbox']), $SIN)), $verificar($jarS, 'creditos_250', $AF->transaccion(['transactionId' => $txid()]), $SIN)[0]]);

// =====================================================================
titulo('Una sola vez (NON_CONSUMABLE): restaurar no entrega dos veces');
[$C, $jarC] = $jugador('Carla Inicio');
$tI = $txid();
$jwsI = $AF->transaccion(['transactionId' => $tI, 'productId' => 'envivo.inicio', 'type' => 'Non-Consumable']);
$antesC = $saldo($C);
[$c, $j] = $verificar($jarC, 'inicio', $jwsI);
check('Paquete de inicio -> 200 entregado (+200 créditos y la cámara al inventario)', [200, 'entregado', 200, true],
    [$c, $j['estado_compra'] ?? null, $saldo($C) - $antesC, (bool) Db::valor("SELECT 1 FROM inventario WHERE jugador_id = ? AND item = 'cam_pro'", [$C])]);
check('Restaurar (la misma transacción) -> 200 ya_entregado, nada nuevo', [200, 'ya_entregado', 200], [($r = $verificar($jarC, 'inicio', $jwsI))[0], $r[1]['estado_compra'] ?? null, $saldo($C) - $antesC]);
$tI2 = $txid();
[$c, $j] = $verificar($jarC, 'inicio', $AF->transaccion(['transactionId' => $tI2, 'productId' => 'envivo.inicio', 'type' => 'Non-Consumable']));
check('Otra compra NUEVA del paquete de inicio en la misma cuenta del juego (otro Apple ID) -> 409 apple_ya_comprado, no se entrega, aviso', [409, 'apple_ya_comprado', 200, 0, true],
    [$c, $j['codigo'] ?? null, $saldo($C) - $antesC, (int) Db::valor('SELECT COUNT(*) FROM compras WHERE apple_transaccion = ?', [$tI2]), (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'apple_una_vez_duplicado' AND detalle LIKE ?", ['%' . $tI2 . '%'])]);
check('Ya comprado en la web y luego en el iPhone: tampoco se entrega dos veces (Compras::yaComprado)', true, Compras::yaComprado($C, 'inicio'));
[$c, $j] = pedir('GET', $APP . '/api/estado', null, $jarC);
check('/api/estado: inicio_comprado true', true, $j['inicio_comprado'] ?? null);

// =====================================================================
titulo('Factura SRI de la compra del App Store (forma de pago 20, consumidor final)');
if (Migraciones::columnas('facturas') !== null && Facturacion::activa()) {
    $f = Db::fila("SELECT * FROM facturas WHERE tipo = 'factura' AND compra_id = ?", [(int) $comp['id']]);
    check('Compra real: factura pendiente con forma de pago 20 y consumidor final', ['20', '07', 'apple'], [$f['forma_pago'] ?? null, $f['comprador_tipo_id'] ?? null, $f['canal'] ?? null]);
    check('Compra de Sandbox: sin factura (no hubo cobro)', 0, (int) Db::valor("SELECT COUNT(*) FROM facturas WHERE compra_id = ?", [(int) $cs['id']]));
} else {
    check('Facturación apagada en esta prueba: nada que revisar', true, true);
}

// =====================================================================
titulo('Avisos de Apple (App Store Server Notifications V2)');
$aviso = fn(string $cuerpo, array $cab = []) => pedir('POST', $APP . '/api/apple/notificacion', $cuerpo, null, $cab, false);
[$c, $j] = $aviso($AF->aviso('TEST'));
check('TEST (sin cabecera X-Envivo: lo manda Apple) -> 200 «prueba de Apple»', [200, 'prueba de Apple'], [$c, $j['resultado'] ?? null]);
check('GET -> 405; sin signedPayload -> 400; firma de otra raíz -> 400', [405, 400, 400],
    [pedir('GET', $APP . '/api/apple/notificacion', null, null, [], false)[0], $aviso('{}')[0], $aviso($OTRA->aviso('REFUND', '', $OTRA->datosTransaccion(['transactionId' => $t1])))[0]]);
check('Aviso de otra app -> 200 «otra app» (no hace nada)', 'otra app', $aviso($AF->aviso('REFUND', '', $AF->datosTransaccion(['transactionId' => $t1, 'bundleId' => 'com.otra.app']), null, ['bundleId' => 'com.otra.app']))[1]['resultado'] ?? null);
$antesA = $saldo($A);
$cuerpoRef = $AF->aviso('REFUND', '', $AF->datosTransaccion(['transactionId' => $t1, 'revocationDate' => time() * 1000, 'revocationReason' => 1]));
[$c, $j] = $aviso($cuerpoRef);
$compR = Compras::porId((int) $comp['id']);
check('REFUND de la compra de Ana -> 200, compra revertida (reembolso), -250 créditos, cuenta suspendida como con Google', [200, 'revertido', 'reembolso', -250, 'suspendido'],
    [$c, $compR['estado'] ?? null, $compR['revertida_tipo'] ?? null, $saldo($A) - $antesA, (string) Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$A])]);
check('El mismo aviso otra vez (Apple repite) -> 200 «repetido», sin revertir dos veces', [200, 'repetido', -250], [($r = $aviso($cuerpoRef))[0], $r[1]['resultado'] ?? null, $saldo($A) - $antesA]);
check('Mandar después la compra devuelta -> 409 apple_revertido (no se vuelve a entregar)', [409, 'apple_revertido'], $cod($verificar($jarA, 'creditos_250', $jws1)));
check('REFUND de una compra que no está en el juego -> 200 y aviso al dueño', [200, true],
    [$aviso($AF->aviso('REFUND', '', $AF->datosTransaccion(['transactionId' => '1999999999999999'])))[0], (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'apple_devuelta_sin_compra'")]);
check('CONSUMPTION_REQUEST -> 200 y aviso al dueño (Apple decide la devolución)', [200, true],
    [$aviso($AF->aviso('CONSUMPTION_REQUEST', '', $AF->datosTransaccion(['transactionId' => $t2])))[0], (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'apple_pide_consumo'")]);
check('Cada aviso queda anotado una vez en apple_avisos', true, (int) Db::valor('SELECT COUNT(*) FROM apple_avisos') >= 4);

// =====================================================================
titulo('Lista de productos para App Store Connect (bin/apple_productos.php)');
$sal = shell_exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/no-existe.env') . ' php ' . escapeshellarg($SRV . '/bin/apple_productos.php') . ' 2>&1');
$lista = json_decode((string) $sal, true);
$esperados = array_values(array_filter(array_keys(Catalogo::PRODUCTOS), fn($id) => empty(Catalogo::productoBase($id)['oculto'])));
check('JSON con todos los productos del catálogo menos lo oculto (sin transferencia_cuenta), en orden', array_map(fn($id) => 'envivo.' . $id, $esperados), is_array($lista) ? array_column($lista, 'id') : $sal);
$mal = [];
foreach ((array) $lista as $x) {
    $p = Catalogo::productoBase(substr((string) $x['id'], 7));
    if (array_keys($x) !== ['id', 'nombre', 'detalle', 'precio_usd', 'tipo'] || mb_strlen($x['nombre']) > 30 || mb_strlen($x['detalle']) > 45 || $x['nombre'] === '' || $x['detalle'] === ''
        || $x['precio_usd'] !== round((float) $p['precio'], 2) || $x['tipo'] !== (!empty($p['una_vez']) ? 'NON_CONSUMABLE' : 'CONSUMABLE')) $mal[] = $x['id'];
}
check('Cada uno: nombre ≤ 30 y detalle ≤ 45 letras, precio del catálogo, NON_CONSUMABLE solo si es de una sola vez', [], $mal);
check('Lo de una sola vez: bienvenida, inicio, equipo_obra_2, fondo_crecimiento y oferta_novato', ['envivo.bienvenida', 'envivo.inicio', 'envivo.equipo_obra_2', 'envivo.fondo_crecimiento', 'envivo.oferta_novato'],
    array_values(array_map(fn($x) => $x['id'], array_filter((array) $lista, fn($x) => $x['tipo'] === 'NON_CONSUMABLE'))));
check('No abre la base (corre sin configuración) y sin avisos de nombre corto faltante', false, str_contains((string) $sal, 'AVISO'));

// =====================================================================
titulo('Traducciones de los códigos nuevos (español e inglés)');
$tr = json_decode((string) file_get_contents($RAIZ . '/docs/traducciones/errores.json'), true);
preg_match_all("/'(apple_[a-z_]+)'/", (string) file_get_contents($SRV . '/src/Apple.php'), $m);
$codigos = array_values(array_unique(array_filter($m[1], fn($k) => !in_array($k, ['apple_cuenta', 'apple_avisos', 'apple_transaccion', 'apple_original', 'apple_ambiente', 'apple_cantidad', 'apple_compra_prueba', 'apple_una_vez_duplicado', 'apple_entregada_con_tienda_cerrada', 'apple_devuelta_sin_compra', 'apple_devolucion_anulada', 'apple_pide_consumo'], true))));
$codigos = array_values(array_unique(array_merge($codigos, ['apple_revertido', 'apple_rechazado', 'apple_pendiente'])));   // 'apple_' . estado
$faltan = [];
$es = (string) file_get_contents($RAIZ . '/js/lang/es.js'); $en = (string) file_get_contents($RAIZ . '/js/lang/en.js');
foreach ($codigos as $k) if (empty($tr['es'][$k]) || empty($tr['en'][$k]) || !str_contains($es, '"error.' . $k . '"') || !str_contains($en, '"error.' . $k . '"')) $faltan[] = $k;
check('Cada código apple_* del servidor tiene texto en español e inglés (errores.json y js/lang)', [], $faltan);
$faltan = [];
foreach (['as_precios', 'as_ok', 'as_pendiente', 'as_error', 'as_llego', 'as_restaurar', 'as_restaurar_txt', 'as_restaurando', 'as_restauradas', 'as_nada', 'as_restaurar_error'] as $k) {
    if (!str_contains($es, '"tienda.' . $k . '"') || !str_contains($en, '"tienda.' . $k . '"')) $faltan[] = $k;
}
check('Textos de la tienda del App Store en español e inglés (compra ok, pendiente, error, restaurar, nada que restaurar)', [], $faltan);

// =====================================================================
foreach ($procs as $p) { proc_terminate($p); proc_close($p); }
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en los servidores', '', $errores);
echo "\n----------------------------------------\nApp Store: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
