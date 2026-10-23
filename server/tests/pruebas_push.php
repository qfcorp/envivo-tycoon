<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Notificaciones push (server/src/Push.php, PushTextos.php, PushApi.php,
// bin/push_*.php, Centro de Control ?t=push). Base SQLite y config TEMPORALES, reloj congelado:
//   1. Cifrado RFC 8291 con el vector de prueba del RFC (§5, byte por byte) e ida y vuelta con llaves al azar.
//   2. VAPID (RFC 8292): JWT ES256 verificado con openssl y con node (crypto, ieee-p1363), DER <-> r||s.
//   3. Endpoints permitidos (sin SSRF), suscripción por cuenta y por aparato, interruptores, textos en 10 idiomas.
//   4. Reglas de la cola: silencio 22–08 Guayaquil, tope diario, ofertas, nunca el mismo texto, inactividad 3/30 días,
//      404/410 borran, 5xx reintenta, vencidos, idioma por aparato, cuenta borrada.
//   5. Detectores: obra de la sede, fase de la Copa, duelos, buzón de soporte, premio diario, recordatorios.
//   6. Por HTTP (php -S con router.php + un servicio de push FALSO): /api/push/*, envío real por curl y descifrado de lo
//      que llegó, JWT con la audiencia del servicio, bin/push_enviar.php, bin/push_claves.php, Centro de Control.
// Uso:  php server/tests/pruebas_push.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$RAIZ = dirname(__DIR__, 2);
$SRV = $RAIZ . '/server';
$TMP = sys_get_temp_dir() . '/envivo_push_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
mkdir($TMP . '/falso', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; };
$P_APP = (int) (getenv('P_APP') ?: $puerto());
$P_FALSO = (int) (getenv('P_FALSO') ?: $puerto());
$USUARIO = 'jefe_push';
$CLAVE = 'Push-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);

require $SRV . '/src/Config.php';
require $SRV . '/src/Push.php';
$VAPID = \EnVivo\Push::generarPar();
$CONF = "$TMP/config.env";
file_put_contents($CONF, "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:$P_APP\nENVIVO_ZONA=America/Guayaquil\n"
    . "ENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\n"
    . 'PUSH_VAPID_PUBLICA=' . \EnVivo\Push::b64u($VAPID['publica']) . "\nPUSH_VAPID_PRIVADA=" . \EnVivo\Push::b64u($VAPID['d']) . "\nPUSH_VAPID_SUJETO=mailto:soporte@tukanec.com\n"
    . "PUSH_HOSTS_EXTRA=127.0.0.1:$P_FALSO\n");
putenv('ENVIVO_CONFIG=' . $CONF);
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Db, Fallo, Migraciones, Push as P, PushTextos as PT};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
function si(string $n, bool $c): void { check($n, true, $c); }
function falla(callable $f): array { try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; } }

$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) { @proc_terminate($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});

// =====================================================================
titulo('Tablas');
Db::pdo();
$tablas = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'push_%' ORDER BY name"), 'name');
check('Tablas push_* creadas solas al abrir la base', ['push_cola', 'push_envios', 'push_jugador', 'push_marcas', 'push_suscripciones'], $tablas);
check('push.sql se puede aplicar otra vez sin error', [], Migraciones::aplicar('push.sql'));

// =====================================================================
titulo('RFC 8291 §5: vector de prueba (byte por byte)');
$b = fn(string $s) => P::b64ud($s);
$AS = ['d' => $b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), 'publica' => $b('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8')];
$UA_D = $b('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94');
$UA_PUB = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
$AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
$SALT = $b('DGv6ra1nlYgDCS1FRnbzlw');
$TEXTO = 'When I grow up, I want to be a watermelon';
$ESPERADO = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
$ecdh = openssl_pkey_derive(P::pemPublica($b($UA_PUB)), P::pemPrivada($AS['d'], $AS['publica']), 32);
check('ecdh_secret', 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs', P::b64u($ecdh));
$k = P::derivar($ecdh, $b($AUTH), $b($UA_PUB), $AS['publica'], $SALT);
check('PRK_key', 'Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k', P::b64u($k['prk_key']));
check('IKM', 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg', P::b64u($k['ikm']));
check('PRK', '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc', P::b64u($k['prk']));
check('CEK', 'oIhVW04MRdy2XN9CiKLxTg', P::b64u($k['cek']));
check('NONCE', '4h_95klXJ5E_qnoN', P::b64u($k['nonce']));
check('Mensaje cifrado completo = el del RFC', $ESPERADO, P::b64u(P::cifrar($TEXTO, $UA_PUB, $AUTH, $AS, $SALT)));
check('Descifrar el mensaje del RFC con la llave del aparato', $TEXTO, P::descifrar($b($ESPERADO), $UA_D, $b($UA_PUB), $b($AUTH)));
$ua = P::generarPar(); $au = random_bytes(16);
$c1 = P::cifrar('{"t":"Hola","b":"ñandú 漢字"}', P::b64u($ua['publica']), P::b64u($au));
$c2 = P::cifrar('{"t":"Hola","b":"ñandú 漢字"}', P::b64u($ua['publica']), P::b64u($au));
check('Ida y vuelta con llaves al azar (UTF-8)', '{"t":"Hola","b":"ñandú 漢字"}', P::descifrar($c1, $ua['d'], $ua['publica'], $au));
si('Cada envío usa sal y llave efímera nuevas (dos cifrados distintos)', $c1 !== $c2 && substr($c1, 0, 16) !== substr($c2, 0, 16) && substr($c1, 21, 65) !== substr($c2, 21, 65));
check('Cabecera: rs = 4096 y keyid de 65 bytes', [4096, 65], [unpack('N', substr($c1, 16, 4))[1], ord($c1[20])]);
$mal = $c1; $mal[strlen($mal) - 5] = chr(ord($mal[strlen($mal) - 5]) ^ 1);
check('Un byte cambiado: no se descifra (GCM)', null, P::descifrar($mal, $ua['d'], $ua['publica'], $au));
check('Con otro auth: no se descifra', null, P::descifrar($c1, $ua['d'], $ua['publica'], random_bytes(16)));
check('Con relleno: se descifra igual', 'x', P::descifrar(P::cifrar('x', P::b64u($ua['publica']), P::b64u($au), null, null, 100), $ua['d'], $ua['publica'], $au));
check('p256dh malo -> error', 'InvalidArgumentException', (function () use ($au) { try { P::cifrar('x', 'abc', P::b64u($au)); return 'nada'; } catch (\Throwable $e) { return get_class($e); } })());
check('Mensaje demasiado largo -> error', 'InvalidArgumentException', (function () use ($ua, $au) { try { P::cifrar(str_repeat('a', 4090), P::b64u($ua['publica']), P::b64u($au)); return 'nada'; } catch (\Throwable $e) { return get_class($e); } })());

// =====================================================================
titulo('VAPID (RFC 8292): JWT ES256');
$jwt = P::jwt('https://fcm.googleapis.com', 1800000000, 'mailto:soporte@tukanec.com', $VAPID['d'], $VAPID['publica']);
[$jh, $jc, $js] = explode('.', $jwt);
check('Cabecera del JWT', ['typ' => 'JWT', 'alg' => 'ES256'], json_decode($b($jh), true));
check('Datos del JWT (aud, exp, sub)', ['aud' => 'https://fcm.googleapis.com', 'exp' => 1800000000, 'sub' => 'mailto:soporte@tukanec.com'], json_decode($b($jc), true));
check('Firma de 64 bytes (r||s)', 64, strlen($b($js)));
check('openssl_verify con la llave pública', 1, openssl_verify("$jh.$jc", P::rawADer($b($js)), P::pemPublica($VAPID['publica']), OPENSSL_ALGO_SHA256));
$otro = P::generarPar();
check('Con otra llave pública: no verifica', 0, openssl_verify("$jh.$jc", P::rawADer($b($js)), P::pemPublica($otro['publica']), OPENSSL_ALGO_SHA256));
$node = trim((string) shell_exec('command -v node'));
if ($node !== '') {
    $jsCheck = "const c=require('crypto');const [h,p,s]=process.argv[1].split('.');const k=c.createPublicKey({key:Buffer.from(process.argv[2],'base64url'),format:'der',type:'spki'});"
        . "process.stdout.write(String(c.verify('sha256',Buffer.from(h+'.'+p),{key:k,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url'))))";
    $spki = base64_encode(hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $VAPID['publica']);
    check('node (crypto.verify, ieee-p1363) también acepta la firma', 'true', trim((string) shell_exec(escapeshellarg($node) . ' -e ' . escapeshellarg($jsCheck) . ' ' . escapeshellarg($jwt) . ' ' . escapeshellarg(strtr($spki, '+/', '-_')))));
} else {
    echo "  AVISO sin node: se salta la verificación cruzada del JWT\n";
}
$todosBien = true;
for ($i = 0; $i < 40; $i++) {   // firmas con r o s que empiezan con bit alto o cero: DER <-> raw sin perder nada
    openssl_sign("m$i", $der, P::pemPrivada($VAPID['d'], $VAPID['publica']), OPENSSL_ALGO_SHA256);
    $raw = P::derARaw($der);
    $todosBien = $todosBien && strlen($raw) === 64 && openssl_verify("m$i", P::rawADer($raw), P::pemPublica($VAPID['publica']), OPENSSL_ALGO_SHA256) === 1;
}
si('40 firmas: DER -> r||s -> DER siguen verificando', $todosBien);
check('Audiencia = origen del endpoint', ['https://fcm.googleapis.com', 'http://127.0.0.1:' . $P_FALSO], [P::origen('https://fcm.googleapis.com/fcm/send/abc'), P::origen("http://127.0.0.1:$P_FALSO/ok/1")]);
si('Authorization: "vapid t=<jwt>, k=<publica>"', (bool) preg_match('/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=' . preg_quote(P::b64u($VAPID['publica']), '/') . '$/', P::autorizacion('https://fcm.googleapis.com/fcm/send/x')));
check('Llaves del config cargadas', P::b64u($VAPID['publica']), P::claves()['publica_b64'] ?? null);

// =====================================================================
titulo('Endpoints permitidos (el servidor no llama a cualquier dirección)');
foreach ([
    ['https://fcm.googleapis.com/fcm/send/abc:APA91b', true], ['https://updates.push.services.mozilla.com/wpush/v2/gAAA', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=AQE', true], ['https://web.push.apple.com/QGx', true],
    ["http://127.0.0.1:$P_FALSO/ok/x", true],
    ['http://fcm.googleapis.com/fcm/send/abc', false], ['https://fcm.googleapis.com:8443/x', false], ['https://user@fcm.googleapis.com/x', false],
    ['https://169.254.169.254/latest/meta-data', false], ['https://evil.example/fcm.googleapis.com', false], ['https://fcm.googleapis.com.evil.example/x', false],
    ['http://127.0.0.1:22/x', false], ['file:///etc/passwd', false], ['https://notify.windows.com.evil.example/x', false],
] as [$e, $esp]) check(($esp ? 'Sí: ' : 'No: ') . $e, $esp, P::endpointValido($e));

// =====================================================================
titulo('Textos: 10 idiomas, 3 variantes, marcadores');
$plantillas = array_keys(PT::T['es']);
$faltan = [];
foreach (P::IDIOMAS as $L) foreach ($plantillas as $pl) {
    $v = PT::T[$L][$pl] ?? [];
    if (count($v) < 3 || count(array_unique(array_column($v, 1))) !== count($v)) $faltan[] = "$L.$pl";
    foreach ($v as $x) if (mb_strlen($x[0]) > 60 || mb_strlen($x[1]) > 160 || trim($x[0]) === '' || trim($x[1]) === '') $faltan[] = "$L.$pl(largo)";
    if (str_contains(implode('', array_merge(...($v ?: [[]]))), '{rival}') !== str_contains(implode('', array_merge(...PT::T['es'][$pl])), '{rival}')) $faltan[] = "$L.$pl{rival}";
}
check('Cada plantilla en los 10 idiomas con 3+ variantes distintas, cortas y con los mismos marcadores', [], $faltan);
check('Mismas plantillas en todos los idiomas', array_fill_keys(P::IDIOMAS, $plantillas), array_map(fn($x) => array_keys($x), array_intersect_key(PT::T, array_flip(P::IDIOMAS))));
check('Marcador {rival} con nombre', '¡Ganaste un duelo!|Lucía TV te retó y tu productora ganó.', implode('|', PT::variantes('duelo_ganado', 'es', ['rival' => 'Lucía TV'])[0]));
check('Sin nombre de rival: palabra de respaldo del idioma', 'a rival studio challenged you and your studio won.', PT::variantes('duelo_ganado', 'en', [])[0][1]);
check('Idioma desconocido -> español', PT::T['es']['obra'][0][0], PT::variantes('obra', 'xx')[0][0]);
$ev = PT::T['es']['obra'][0][1];
$nunca = true;
for ($i = 0; $i < 60; $i++) $nunca = $nunca && PT::elegir('obra', 'es', [], $ev)[1] !== $ev;
si('elegir() nunca repite el texto a evitar (60 veces)', $nunca);
check('Idiomas del juego normalizados', ['pt-BR', 'zh-CN', 'en', 'es', 'es', 'fr'], array_map([P::class, 'normalizarIdioma'], ['pt-PT', 'zh-TW', 'en-US', 'es-EC', '??', 'FR']));

// =====================================================================
titulo('Suscripción por cuenta y por aparato');
$ZONA = new DateTimeZone('America/Guayaquil');
$hora = fn(string $s) => (new DateTimeImmutable($s, $ZONA))->getTimestamp();
$T0 = $hora('2026-10-23 10:00:00');
P::fijarReloj($T0);
$nj = 0;
$nuevo = function (string $alias, int $ultimo = 3600) use (&$nj, $T0): int {
    $nj++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, ultimo_ingreso, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
        ["push$nj@prueba.example", $alias, 'x', $T0 - 60 * 86400, $T0 - $ultimo, $alias, strtolower($alias) . $nj]);
    return Db::ultimoId();
};
$ns = 0;
$suscribir = function (int $j, string $ruta = 'ok', string $idioma = 'es', ?array $cats = null, ?string $disp = null) use (&$ns, $P_FALSO): array {
    $ns++;
    $ua = P::generarPar(); $au = random_bytes(16);
    $e = "http://127.0.0.1:$P_FALSO/$ruta/sub$ns-" . bin2hex(random_bytes(4));
    $r = P::suscribir($j, ['suscripcion' => ['endpoint' => $e, 'keys' => ['p256dh' => P::b64u($ua['publica']), 'auth' => P::b64u($au)]], 'dispositivo' => $disp ?? ('disp' . $ns . 'xxxxxxxx'), 'idioma' => $idioma, 'categorias' => $cats]);
    return ['ua' => $ua, 'auth' => $au, 'endpoint' => $e, 'estado' => $r];
};
$ana = $nuevo('AnaTV');
$s1 = $suscribir($ana);
check('suscribir -> suscrito con las categorías por defecto (ofertas apagado)', [true, true, P::CATEGORIAS], [$s1['estado']['suscrito'], $s1['estado']['disponible'], $s1['estado']['categorias']]);
check('estado() con el endpoint de este aparato', true, P::estado($ana, $s1['endpoint'])['suscrito']);
check('estado() sin endpoint: no suscrito pero cuenta los aparatos', [false, 1], [P::estado($ana)['suscrito'], P::estado($ana)['aparatos']]);
$s1b = $suscribir($ana, 'ok', 'en');
check('Otro aparato de la misma cuenta: 2 aparatos', 2, P::estado($ana)['aparatos']);
$beto = $nuevo('BetoTV');
$fila = Db::fila('SELECT * FROM push_suscripciones WHERE endpoint = ?', [$s1b['endpoint']]);
P::suscribir($beto, ['suscripcion' => ['endpoint' => $s1b['endpoint'], 'keys' => ['p256dh' => P::b64u($s1b['ua']['publica']), 'auth' => P::b64u($s1b['auth'])]], 'idioma' => 'en']);
check('El mismo aparato con otra cuenta pasa a esa cuenta (no recibe avisos de la anterior)', [$beto, 1], [(int) Db::valor('SELECT jugador_id FROM push_suscripciones WHERE endpoint = ?', [$s1b['endpoint']]), P::estado($ana)['aparatos']]);
check('El mismo aparato (dispositivo) con un endpoint nuevo reemplaza al viejo', 1, (function () use ($suscribir, $beto) {
    $suscribir($beto, 'ok', 'es', null, 'aparato-fijo-123'); $suscribir($beto, 'ok', 'es', null, 'aparato-fijo-123');
    return (int) Db::valor("SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ? AND dispositivo = 'aparato-fijo-123'", [$beto]);
})());
$prev = Db::fila('SELECT * FROM push_suscripciones WHERE jugador_id = ? AND dispositivo = ?', [$beto, 'aparato-fijo-123']);
P::preferencias($beto, $prev['endpoint'], ['duelo' => false]);
$ua9 = P::generarPar(); $au9 = random_bytes(16);
P::suscribir($beto, ['suscripcion' => ['endpoint' => "http://127.0.0.1:$P_FALSO/ok/cambio", 'keys' => ['p256dh' => P::b64u($ua9['publica']), 'auth' => P::b64u($au9)]], 'anterior' => $prev['endpoint']]);
$nueva = Db::fila('SELECT * FROM push_suscripciones WHERE endpoint = ?', ["http://127.0.0.1:$P_FALSO/ok/cambio"]);
check('pushsubscriptionchange ("anterior"): la nueva hereda aparato, idioma e interruptores; la vieja se borra', ['aparato-fijo-123', $prev['idioma'], false, null],
    [$nueva['dispositivo'], $nueva['idioma'], json_decode($nueva['categorias_json'], true)['duelo'], Db::fila('SELECT id FROM push_suscripciones WHERE endpoint = ?', [$prev['endpoint']])]);
$cien = $nuevo('Muchos');
for ($i = 0; $i < 12; $i++) { P::fijarReloj($T0 + $i); $suscribir($cien); }
P::fijarReloj($T0);
check('Máximo ' . P::MAX_SUSCRIPCIONES . ' aparatos por cuenta (se borran los más viejos)', P::MAX_SUSCRIPCIONES, (int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ?', [$cien]));
$bad = fn(array $sub) => falla(fn() => P::suscribir($ana, ['suscripcion' => $sub]));
$kk = ['p256dh' => P::b64u($ua['publica']), 'auth' => P::b64u($au)];
check('Endpoint de otro sitio -> 400 push_endpoint_invalido', [400, 'push_endpoint_invalido'], $bad(['endpoint' => 'https://evil.example/x', 'keys' => $kk]));
check('Sin endpoint -> 400', [400, 'push_endpoint_invalido'], $bad(['keys' => $kk]));
check('p256dh que no es un punto P-256 -> 400 push_llaves_invalidas', [400, 'push_llaves_invalidas'], $bad(['endpoint' => "http://127.0.0.1:$P_FALSO/ok/z", 'keys' => ['p256dh' => P::b64u("\x04" . str_repeat("\x01", 64)), 'auth' => P::b64u($au)]]));
check('auth de 15 bytes -> 400 push_llaves_invalidas', [400, 'push_llaves_invalidas'], $bad(['endpoint' => "http://127.0.0.1:$P_FALSO/ok/z", 'keys' => ['p256dh' => $kk['p256dh'], 'auth' => P::b64u(random_bytes(15))]]));
check('preferencias: categoría desconocida -> 400', [400, 'push_categoria_invalida'], falla(fn() => P::preferencias($ana, $s1['endpoint'], ['spam' => true])));
check('preferencias: valor que no es bool -> 400', [400, 'push_categoria_invalida'], falla(fn() => P::preferencias($ana, $s1['endpoint'], ['obra' => 'si'])));
check('preferencias de un aparato ajeno -> 404 push_no_suscrito', [404, 'push_no_suscrito'], falla(fn() => P::preferencias($beto, $s1['endpoint'], ['obra' => false])));
check('preferencias: enciende ofertas y apaga copa', ['obra' => true, 'copa' => false, 'premio' => true, 'buzon' => true, 'duelo' => true, 'ofertas' => true],
    P::preferencias($ana, $s1['endpoint'], ['ofertas' => true, 'copa' => false])['categorias']);
check('baja: este aparato deja de estar suscrito', [false, 0], (function () use ($ana, $s1) { $r = P::baja($ana, $s1['endpoint']); return [P::estado($ana, $s1['endpoint'])['suscrito'], $r['aparatos']]; })());

// =====================================================================
titulo('Cola: reglas (con un transporte falso)');
$ENV = []; $RESP = [];
P::fijarTransporte(function (string $url, array $cab, string $cuerpo) use (&$ENV, &$RESP): array {
    $ENV[] = ['url' => $url, 'cab' => $cab, 'cuerpo' => $cuerpo];
    foreach ($RESP as $pre => $h) if (str_contains($url, $pre)) return ['http' => $h, 'cuerpo' => ''];
    return ['http' => 201, 'cuerpo' => ''];
});
$leer = function (array $envio, array $s): ?array { $p = P::descifrar($envio['cuerpo'], $s['ua']['d'], $s['ua']['publica'], $s['auth']); return $p === null ? null : json_decode($p, true); };
$cola = fn(?int $id) => $id === null ? null : Db::fila('SELECT * FROM push_cola WHERE id = ?', [$id]);
$procesar = function () { return P::procesar(); };
$sinDetectores = function () { Db::q("INSERT INTO push_marcas (clave, valor, actualizado) VALUES ('recordatorios:ultimo', ?, 0) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor", [(string) P::ahora()]); };

$caro = $nuevo('CaroTV');
$sc = $suscribir($caro);
$sinDetectores();
check('encolar con categoría desconocida -> null (nunca lanza)', null, P::encolar($caro, 'spam', 'x', 'y'));
check('encolar a un jugador sin aparatos -> null', null, P::encolar($nuevo('SinNada'), 'obra', 'x', 'y'));
$id = P::encolar($caro, 'buzon', 'Hola', 'Mensaje 1', '/?ir=soporte');
check('encolar -> id; misma clave otra vez -> null (sin duplicados)', [true, null], [is_int($id), P::encolar($caro, 'buzon', 'Hola', 'Mensaje 1', '/?ir=soporte')]);
$ENV = [];
$r = $procesar();
$f = $cola($id);
check('A las 10:00: enviado', ['enviado', 1], [$f['estado'], $r['enviados']]);
$m = $leer($ENV[0], $sc);
check('Lo que llegó al aparato (descifrado): título, cuerpo, ruta y categoría', ['t' => 'Hola', 'b' => 'Mensaje 1', 'u' => '/?ir=soporte', 'tag' => 'buzon', 'id' => $id], $m);
check('Cabeceras del envío', ['aes128gcm', 'application/octet-stream', '86400', 'high', 'buzon'],
    [$ENV[0]['cab']['Content-Encoding'], $ENV[0]['cab']['Content-Type'], $ENV[0]['cab']['TTL'], $ENV[0]['cab']['Urgency'], $ENV[0]['cab']['Topic']]);
si('Authorization VAPID con la audiencia del servicio', str_starts_with($ENV[0]['cab']['Authorization'], 'vapid t=') && json_decode($b(explode('.', substr($ENV[0]['cab']['Authorization'], 8))[1]), true)['aud'] === "http://127.0.0.1:$P_FALSO");
check('push_envios guarda el intento (HTTP 201, ok)', [201, 1], array_map('intval', array_values(Db::fila('SELECT http, ok FROM push_envios WHERE cola_id = ?', [$id]))));

// Nunca el mismo texto dos veces seguidas
$id2 = P::encolar($caro, 'buzon', 'Hola', 'Mensaje 1', '/', ['clave' => 'otra-clave']);
$procesar();
check('Mismo texto que el último -> descartado "repetido"', ['descartado', 'repetido'], [$cola($id2)['estado'], $cola($id2)['motivo']]);
$id3 = P::encolar($caro, 'buzon', 'Hola', 'Mensaje 2');
$procesar();
check('Texto distinto -> enviado', 'enviado', $cola($id3)['estado']);

// Tope diario (3): ya van 2 hoy
$ENV = [];
$ids = [];
foreach (['obra', 'copa', 'duelo'] as $i => $c) $ids[] = P::encolar($caro, $c, 'Aviso', "Texto $c");
$procesar();
check('Tope de 3 al día: 1 más se envía y 2 quedan para mañana', ['enviado', 'pendiente', 'pendiente'], array_map(fn($i) => $cola($i)['estado'], $ids));
$mañana = $hora('2026-10-24 08:00:00');
$pend = $cola($ids[2]);
si('…pospuestos a mañana entre 08:00 y 08:30 (motivo "tope")', $pend['motivo'] === 'tope' && (int) $pend['enviar_desde'] >= $mañana && (int) $pend['enviar_desde'] <= $mañana + 1800);
check('…y se respeta la prioridad (obra antes que copa/duelo)', 'obra', $cola($ids[0])['categoria']);
P::fijarReloj($mañana + 1801);
$sinDetectores();
$procesar();
check('Al día siguiente salen los pendientes', ['enviado', 'enviado'], [$cola($ids[1])['estado'], $cola($ids[2])['estado']]);
check('Contador del día nuevo = 2', 2, (int) Db::valor('SELECT enviados_dia FROM push_jugador WHERE jugador_id = ?', [$caro]));

// Silencio 22:00 - 08:00
$dani = $nuevo('DaniTV');
$sd = $suscribir($dani);
P::fijarReloj($hora('2026-10-24 22:30:00'));
$sinDetectores();
$idN = P::encolar($dani, 'obra', 'Obra', 'De noche');
$procesar();
$fN = $cola($idN);
$m25 = $hora('2026-10-25 08:00:00');
si('22:30: no se envía; queda para las 08:00–08:15 del día siguiente (motivo "silencio")', $fN['estado'] === 'pendiente' && $fN['motivo'] === 'silencio' && (int) $fN['enviar_desde'] >= $m25 && (int) $fN['enviar_desde'] <= $m25 + 900);
P::fijarReloj($hora('2026-10-25 07:59:00'));
$procesar();
check('07:59: todavía nada', 'pendiente', $cola($idN)['estado']);
P::fijarReloj($m25 + 901);
$sinDetectores();
$procesar();
check('08:15: enviado', 'enviado', $cola($idN)['estado']);
P::fijarReloj($hora('2026-10-25 03:00:00'));
check('enSilencio: 22:00 sí, 21:59 no, 07:59 sí, 08:00 no', [true, false, true, false],
    [P::enSilencio($hora('2026-10-25 22:00:00')), P::enSilencio($hora('2026-10-25 21:59:00')), P::enSilencio($hora('2026-10-25 07:59:00')), P::enSilencio($hora('2026-10-25 08:00:00'))]);
check('proximaManana a las 03:00 = 08:00 del mismo día; a las 23:00 = 08:00 del siguiente', [$m25, $hora('2026-10-26 08:00:00')], [P::proximaManana(), P::proximaManana($hora('2026-10-25 23:00:00'))]);
$idV = P::encolar($dani, 'copa', 'Copa', 'Vence pronto', '/', ['vence' => $hora('2026-10-25 05:00:00')]);
$procesar();
check('Si el silencio pasa del vencimiento: descartado "vencido"', ['descartado', 'vencido'], [$cola($idV)['estado'], $cola($idV)['motivo']]);

// Ofertas
$eva = $nuevo('EvaTV');
P::fijarReloj($hora('2026-10-26 10:00:00'));
$sinDetectores();
$se = $suscribir($eva);
$idO = P::encolar($eva, 'ofertas', 'Oferta', 'Promo 1');
$procesar();
check('Ofertas apagadas por defecto -> descartado "sin_suscripcion"', ['descartado', 'sin_suscripcion'], [$cola($idO)['estado'], $cola($idO)['motivo']]);
P::preferencias($eva, $se['endpoint'], ['ofertas' => true]);
$o1 = P::encolar($eva, 'ofertas', 'Oferta', 'Promo 2');
$o2 = P::encolar($eva, 'ofertas', 'Oferta', 'Promo 3');
$procesar();
check('Ofertas encendidas: 1 al día (la segunda, para mañana)', ['enviado', 'pendiente'], [$cola($o1)['estado'], $cola($o2)['estado']]);
$fran = $nuevo('FranTV');
$sf = $suscribir($fran, 'ok', 'es', ['ofertas' => true]);
P::encolar($fran, 'obra', 'a', '1'); P::encolar($fran, 'buzon', 'b', '2');
$o3 = P::encolar($fran, 'ofertas', 'c', '3');
$procesar();
check('Ofertas nunca toman el último cupo del día (ya van 2 de 3)', 'pendiente', $cola($o3)['estado']);

// Inactividad
$gabi = $nuevo('GabiTV', 31 * 86400);
$sg = $suscribir($gabi);
Db::q('UPDATE push_suscripciones SET visto = ? WHERE jugador_id = ?', [P::ahora() - 31 * 86400, $gabi]);
$idI = P::encolar($gabi, 'obra', 'x', 'Inactivo');
$procesar();
check('31 días sin jugar: no se envía nada ("inactivo")', ['descartado', 'inactivo'], [$cola($idI)['estado'], $cola($idI)['motivo']]);
Db::q('UPDATE jugadores SET ultimo_ingreso = ? WHERE id = ?', [P::ahora() - 3600, $caro]);
$idR = P::encolar($caro, 'recordatorio', 'x', 'Vuelve');
P::fijarReloj(P::ahora() + 1);
$procesar();
check('Recordatorio a quien jugó hace poco: descartado "volvio"', ['descartado', 'volvio'], [$cola($idR)['estado'], $cola($idR)['motivo']]);

// Interruptores
P::preferencias($fran, $sf['endpoint'], ['obra' => false, 'premio' => false]);
P::fijarReloj($hora('2026-10-27 10:00:00'));
$sinDetectores();
$a = P::encolar($fran, 'obra', 'x', 'Obra apagada');
Db::q('UPDATE jugadores SET ultimo_ingreso = ? WHERE id = ?', [P::ahora() - 4 * 86400, $fran]);
Db::q('UPDATE push_suscripciones SET visto = ? WHERE jugador_id = ?', [P::ahora() - 4 * 86400, $fran]);
$c = P::encolar($fran, 'recordatorio', 'x', 'Recordatorio con premio apagado');
$d = P::encolar($fran, 'liga', 'x', 'Liga sigue a duelo (encendido)');
$procesar();
check('Categoría apagada -> descartado; recordatorio sigue al interruptor "premio"; liga sigue a "duelo"', ['descartado', 'descartado', 'enviado'], [$cola($a)['estado'], $cola($c)['estado'], $cola($d)['estado']]);

// Suscripciones muertas y reintentos
$hugo = $nuevo('HugoTV');
$h410 = $suscribir($hugo, 'gone');
$h404 = $suscribir($hugo, 'nf');
$hok = $suscribir($hugo, 'ok', 'en');
$RESP = ['/gone/' => 410, '/nf/' => 404, '/err/' => 500, '/lento/' => 429];
$ENV = [];
$idM = P::encolarPlantilla($hugo, 'obra', 'obra', [], '/?ir=sede', 'obra:prueba-muertas');
$r = $procesar();
check('3 aparatos: 410 y 404 se borran, el bueno recibe', ['enviado', 2, 1], [$cola($idM)['estado'], $r['muertas'], (int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ?', [$hugo])]);
$ultimo = null; foreach ($ENV as $e) if (str_contains($e['url'], '/ok/')) $ultimo = $e;   // el envío al aparato bueno (el orden de los envíos puede variar)
$m = $ultimo ? $leer($ultimo, $hok) : null;
si('El aparato en inglés recibió el texto en inglés (variante de la plantilla)', in_array([$m['t'], $m['b']], PT::T['en']['obra'], true));
$ivan = $nuevo('IvanTV');
$suscribir($ivan, 'gone');
$idG = P::encolar($ivan, 'obra', 'x', 'Muerta');
$procesar();
check('Su único aparato respondió 410: descartado "sin_suscripcion" y sin aparatos', ['descartado', 'sin_suscripcion', 0], [$cola($idG)['estado'], $cola($idG)['motivo'], (int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ?', [$ivan])]);
$juan = $nuevo('JuanTV');
$suscribir($juan, 'err');
$idE = P::encolar($juan, 'obra', 'x', 'Servicio caído');
$procesar();
$fE = $cola($idE);
check('500: se reintenta (intentos 1, en 2 minutos)', ['pendiente', 1, P::ahora() + 120], [$fE['estado'], (int) $fE['intentos'], (int) $fE['enviar_desde']]);
for ($i = 0; $i < 6; $i++) { P::fijarReloj(P::ahora() + 3600); $sinDetectores(); $procesar(); }
check('Tras ' . P::MAX_INTENTOS . ' intentos: fallido (el aparato sigue, no está muerto)', ['fallido', 1], [$cola($idE)['estado'], (int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ?', [$juan])]);

// Plantillas: nunca el mismo texto dos veces seguidas
$kari = $nuevo('KariTV');
$sk = $suscribir($kari);
$cuerpos = [];
for ($i = 0; $i < 8; $i++) {
    P::fijarReloj($hora('2026-10-28 10:00:00') + $i * 86400);
    $sinDetectores();
    $ENV = [];
    P::encolarPlantilla($kari, 'obra', 'obra', [], '/', 'obra:k' . $i);
    $procesar();
    $cuerpos[] = $leer($ENV[0], $sk)['b'];
}
$seguidos = 0;
for ($i = 1; $i < 8; $i++) if ($cuerpos[$i] === $cuerpos[$i - 1]) $seguidos++;
check('8 obras en 8 días: ningún texto igual al anterior', 0, $seguidos);
si('…y se usan varias variantes', count(array_unique($cuerpos)) >= 2);

// Cuenta borrada
$luis = $nuevo('LuisTV');
$suscribir($luis);
$idB = P::encolar($luis, 'obra', 'x', 'Borrada');
Db::q("UPDATE jugadores SET estado = 'borrado' WHERE id = ?", [$luis]);
$procesar();
check('Cuenta borrada: descartado y se borran sus aparatos', ['descartado', 0], [$cola($idB)['estado'], (int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ?', [$luis])]);

// Sin llaves: no se toca la cola
check('Prueba forzada (Centro de Control): sale de noche y no cuenta para el tope', (function () use ($hora, $kari) {
    P::fijarReloj($hora('2026-11-10 23:30:00'));
    $antes = (int) Db::valor('SELECT enviados_dia FROM push_jugador WHERE jugador_id = ?', [$kari]);
    $r = P::enviarPrueba($kari);
    return [$r['resultado'], $r['ok'], (int) Db::valor('SELECT enviados_dia FROM push_jugador WHERE jugador_id = ?', [$kari]) === $antes];
})(), ['enviados', 1, true]);

// =====================================================================
titulo('Detectores');
$TD = $hora('2026-11-12 11:00:00');
P::fijarReloj($TD);
$ENV = []; $RESP = [];
$mila = $nuevo('MilaTV');
$sm = $suscribir($mila);
$nadie = $nuevo('NadieTV');   // sin aparatos: los detectores no le encolan nada
Db::q('UPDATE jugadores SET ultimo_ingreso = ? WHERE id IN (?, ?)', [$TD - 600, $mila, $nadie]);
$det = fn() => P::detectar();
$enCola = fn(int $j, string $pref) => array_column(Db::todas("SELECT clave FROM push_cola WHERE jugador_id = ? AND clave LIKE ? ORDER BY id", [$j, $pref . '%']), 'clave');

// Obras
$obra = function (int $j, int $fin, int $creditos = 0): int {
    Db::q("INSERT INTO sede_obras (jugador_id, tipo, ed, nivel, inicio, duracion, fin, estado, creditos) VALUES (?, 'mejora', 'set', 2, ?, ?, ?, 'activa', ?)", [$j, $fin - 3600, 3600, $fin, $creditos]);
    return Db::ultimoId();
};
$o1 = $obra($mila, $TD - 60);
$o2 = $obra($mila, $TD + 3600);
$o3 = $obra($mila, $TD - 120, 30);
$o4 = $obra($nadie, $TD - 60);
$o5 = $obra($mila, $TD - 7 * 3600);
$det();
check('Obra que terminó con su reloj -> 1 aviso (no la futura, ni la acelerada con créditos, ni la vieja, ni quien no está suscrito)', ['obra:' . $o1], $enCola($mila, 'obra:'));
check('…nada para el jugador sin aparatos', [], $enCola($nadie, 'obra:'));
$det();
check('Correr el detector otra vez no duplica', 1, count($enCola($mila, 'obra:')));
P::fijarReloj($TD + 3601);
$det();
check('Al terminar la segunda obra, su aviso', ['obra:' . $o1, 'obra:' . $o2], $enCola($mila, 'obra:'));

// Copas
P::fijarReloj($TD);
Db::q("INSERT INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (1, '2026-W46', 't1', 'Copa 1', 'preparacion', ?, ?, ?)", [$TD - 3600, $TD + 6 * 86400, $TD - 3600]);
$copa = Db::ultimoId();
Db::q('INSERT INTO copa_servidores (copa_id, servidor_id) VALUES (?, 1)', [$copa]);
Db::q("INSERT INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (2, '2026-W46', 't2', 'Copa vieja', 'batalla', ?, ?, ?)", [$TD - 5 * 86400, $TD + 86400, $TD - 5 * 86400]);
$copaVieja = Db::ultimoId();
Db::q('INSERT INTO copa_servidores (copa_id, servidor_id) VALUES (?, 1)', [$copaVieja]);
$det();
check('Copa nueva en preparación -> "empieza la Copa"; una copa ya en batalla al instalar -> nada', ["copa:$copa:preparacion"], $enCola($mila, 'copa:'));
Db::q("UPDATE copas SET fase = 'batalla' WHERE id = ?", [$copa]);
$det(); $det();
check('Pasa a batalla -> "empieza la batalla" (una sola vez)', ["copa:$copa:preparacion", "copa:$copa:batalla"], $enCola($mila, 'copa:'));
$pl = Db::valor('SELECT plantilla FROM push_cola WHERE clave = ?', ["copa:$copa:batalla"]);
check('…con la plantilla copa_batalla', 'copa_batalla', $pl);

// Duelos
$duelo = function (int $ret, int $def, string $ganador, ?string $motivo = null, int $cerrado = 0) use ($TD): int {
    Db::q("INSERT INTO duelos (temporada, dia, servidor_id, retador_id, defensor_id, nivel, semilla, contrato_json, contexto_json, intento_retador_json, intento_defensor_json,
           decisiones_defensor_json, calidad_defensor, estrellas_defensor, estado, ganador, motivo, creado, vence, cerrado) VALUES ('2026-11', '2026-11-12', 1, ?, ?, 'medio', 1, '{}', '{}', '{}', '{}', '[]', 70, 4, 'cerrado', ?, ?, ?, ?, ?)",
        [$ret, $def, $ganador, $motivo, $TD - 900, $TD + 86400, $cerrado ?: $TD - 300]);
    return Db::ultimoId();
};
$d1 = $duelo($nadie, $mila, 'defensor');
$d2 = $duelo($nadie, $mila, 'retador', 'vencido');
$d3 = $duelo($mila, $nadie, 'retador');
$det();
check('Duelo cerrado: aviso al defensor (no por vencido, ni al retador)', ["duelo:$d1"], $enCola($mila, 'duelo:'));
check('…plantilla duelo_ganado con el alias del rival', ['duelo_ganado', 'NadieTV'], [Db::valor('SELECT plantilla FROM push_cola WHERE clave = ?', ["duelo:$d1"]), json_decode((string) Db::valor('SELECT vars_json FROM push_cola WHERE clave = ?', ["duelo:$d1"]), true)['rival']]);

// Buzón (soporte)
Db::q("INSERT INTO soporte_casos (jugador_id, categoria, asunto, creado, actualizado) VALUES (?, 'pago', 'Ayuda', ?, ?)", [$mila, $TD - 900, $TD - 900]);
$caso = Db::ultimoId();
Db::q("INSERT INTO soporte_mensajes (caso_id, autor, texto, creado) VALUES (?, 'jugador', 'Hola', ?)", [$caso, $TD - 900]);
Db::q("INSERT INTO soporte_mensajes (caso_id, autor, texto, creado) VALUES (?, 'soporte', 'Ya te ayudamos', ?)", [$caso, $TD - 60]);
$msg = Db::ultimoId();
Db::q("INSERT INTO soporte_mensajes (caso_id, autor, texto, creado, leido) VALUES (?, 'soporte', 'Leído', ?, 1)", [$caso, $TD - 50]);
$det();
check('Respuesta de soporte sin leer -> aviso al buzón (no la del jugador ni la ya leída)', ["buzon:soporte:$msg"], $enCola($mila, 'buzon:'));

// Premio diario (tarjeta mensual)
Db::q('UPDATE jugadores SET tarjeta_hasta = ? WHERE id IN (?, ?)', [$TD + 20 * 86400, $mila, $nadie]);
P::fijarReloj($hora('2026-11-12 08:30:00'));
$det();
check('Antes de las 9:00: todavía no avisa el premio', [], $enCola($mila, 'premio:'));
P::fijarReloj($TD);
$det();
check('Tarjeta activa sin reclamar hoy -> "premio diario listo"', ['premio:tarjeta:2026-11-12'], $enCola($mila, 'premio:'));
Db::q('INSERT INTO tarjeta_reclamos (jugador_id, dia, creado) VALUES (?, ?, ?)', [$mila, '2026-11-13', $TD + 86400]);
P::fijarReloj($TD + 86400);
$det();
check('Al día siguiente ya reclamado -> nada nuevo', ['premio:tarjeta:2026-11-12'], $enCola($mila, 'premio:'));

// Recordatorios
$ola = $nuevo('OlaTV');
$so = $suscribir($ola);
$ponerAct = function (int $j, int $t) { Db::q('UPDATE jugadores SET ultimo_ingreso = ? WHERE id = ?', [$t, $j]); Db::q('UPDATE push_suscripciones SET visto = ? WHERE jugador_id = ?', [$t, $j]); };
$base = $hora('2026-11-20 12:00:00');
$ponerAct($ola, $base);
P::fijarReloj($base + 2 * 86400);
Db::q("DELETE FROM push_marcas WHERE clave = 'recordatorios:ultimo'");
$det();
check('2 días sin jugar: sin recordatorio', [], $enCola($ola, 'recordatorio:'));
P::fijarReloj($base + 3 * 86400 + 60);
$det();
check('3 días: recordatorio (escalón 3)', ['recordatorio:2026-11-20:3'], $enCola($ola, 'recordatorio:'));
P::fijarReloj($base + 3 * 86400 + 900);
$det();
check('…10 minutos después no se repite', 1, count($enCola($ola, 'recordatorio:')));
P::fijarReloj($hora('2026-11-27 21:00:00'));
Db::q("DELETE FROM push_marcas WHERE clave = 'recordatorios:ultimo'");
$det();
check('De noche (21:00) no se encolan recordatorios', 1, count($enCola($ola, 'recordatorio:')));
P::fijarReloj($base + 7 * 86400 + 60);
Db::q("DELETE FROM push_marcas WHERE clave = 'recordatorios:ultimo'");
$det();
check('7 días: segundo escalón', ['recordatorio:2026-11-20:3', 'recordatorio:2026-11-20:7'], $enCola($ola, 'recordatorio:'));
P::fijarReloj($base + 31 * 86400);
Db::q("DELETE FROM push_marcas WHERE clave = 'recordatorios:ultimo'");
$det();
check('31 días: ya no (se deja de molestar)', 2, count($enCola($ola, 'recordatorio:')));

// Un detector que falla no frena a los demás
Db::pdo()->exec('ALTER TABLE soporte_mensajes RENAME TO soporte_mensajes_x');
Db::pdo()->exec('CREATE TABLE soporte_mensajes (id INTEGER PRIMARY KEY)');   // sin columnas: el detector del buzón falla
P::fijarReloj($TD + 2 * 86400);
$o6 = $obra($mila, $TD + 2 * 86400 - 30);
$det();
check('Con el detector del buzón roto, el de obras sigue', true, in_array('obra:' . $o6, $enCola($mila, 'obra:'), true));
Db::pdo()->exec('DROP TABLE soporte_mensajes');
Db::pdo()->exec('ALTER TABLE soporte_mensajes_x RENAME TO soporte_mensajes');
P::fijarTransporte(null);

// =====================================================================
titulo('Por HTTP: /api/push/*, servicio de push falso, bin/ y Centro de Control');
$arrancar = function (array $cmd, int $p, array $env, string $log) use ($RAIZ, &$PIDS): bool {
    $PIDS[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes, $RAIZ, array_merge(getenv(), $env));
    for ($i = 0; $i < 80; $i++) { if (@fsockopen('127.0.0.1', $p)) return true; usleep(100000); }
    return false;
};
si('Arranca el juego (php -S + router.php) y el servicio de push falso',
    $arrancar(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-S', "127.0.0.1:$P_APP", '-t', $RAIZ, $RAIZ . '/server/tests/router_control.php'], $P_APP, ['ENVIVO_CONFIG' => $CONF, 'PHP_CLI_SERVER_WORKERS' => '3'], "$TMP/app.log")
    && $arrancar(['php', '-S', "127.0.0.1:$P_FALSO", $SRV . '/tests/push_falso.php'], $P_FALSO, ['PUSH_FALSO_DIR' => "$TMP/falso"], "$TMP/falso.log"));
$JAR = "$TMP/jar.txt";
$api = function (string $m, string $ruta, ?array $datos = null, array $cab = ['X-Envivo: 1'], ?string $jar = null) use ($P_APP, $JAR): array {
    $ch = curl_init("http://127.0.0.1:$P_APP$ruta");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_COOKIEJAR => $jar ?? $JAR, CURLOPT_COOKIEFILE => $jar ?? $JAR, CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $cab)]);
    if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($datos));
    $c = (string) curl_exec($ch);
    return [(int) curl_getinfo($ch, CURLINFO_HTTP_CODE), json_decode($c, true) ?: []];
};
check('Sin sesión -> 401', 401, $api('POST', '/api/push/estado', [], ['X-Envivo: 1'], "$TMP/jar_vacio.txt")[0]);
[$h, $reg] = $api('POST', '/api/registro', ['email' => 'http@prueba.example', 'nombre' => 'Http Push', 'clave' => 'clave-segura-123', 'acepta_terminos' => true, 'edad_16' => true]);
check('Cuenta nueva por /api/registro', 200, $h);
$jHttp = (int) Db::valor("SELECT id FROM jugadores WHERE email = 'http@prueba.example'");
[$h, $e] = $api('POST', '/api/push/estado', []);
check('/api/push/estado: disponible, llave pública del config, no suscrito, máximo 3', [200, true, P::b64u($VAPID['publica']), false, 3], [$h, $e['disponible'] ?? null, $e['publica'] ?? null, $e['suscrito'] ?? null, $e['max_dia'] ?? null]);
check('GET -> 405', 405, $api('GET', '/api/push/estado')[0]);
check('POST sin X-Envivo -> 403', 403, $api('POST', '/api/push/estado', [], [])[0]);
$uaH = P::generarPar(); $auH = random_bytes(16);
$epH = "http://127.0.0.1:$P_FALSO/ok/http-" . bin2hex(random_bytes(4));
[$h, $s] = $api('POST', '/api/push/suscribir', ['suscripcion' => ['endpoint' => $epH, 'keys' => ['p256dh' => P::b64u($uaH['publica']), 'auth' => P::b64u($auH)]], 'dispositivo' => 'navegador-prueba-1', 'idioma' => 'pt-BR']);
check('/api/push/suscribir -> suscrito', [200, true], [$h, $s['suscrito'] ?? null]);
[$h, $s] = $api('POST', '/api/push/suscribir', ['suscripcion' => ['endpoint' => 'https://169.254.169.254/x', 'keys' => ['p256dh' => P::b64u($uaH['publica']), 'auth' => P::b64u($auH)]]]);
check('Endpoint no permitido -> 400 push_endpoint_invalido', [400, 'push_endpoint_invalido'], [$h, $s['codigo'] ?? null]);
[$h, $s] = $api('POST', '/api/push/preferencias', ['endpoint' => $epH, 'categorias' => ['ofertas' => true, 'copa' => false]]);
check('/api/push/preferencias', [200, true, false], [$h, $s['categorias']['ofertas'] ?? null, $s['categorias']['copa'] ?? null]);
[$h, $s] = $api('POST', '/api/push/preferencias', ['endpoint' => $epH, 'categorias' => ['nope' => true]]);
check('Categoría desconocida -> 400 push_categoria_invalida', [400, 'push_categoria_invalida'], [$h, $s['codigo'] ?? null]);

// Envío de verdad (curl) al servicio falso
P::fijarReloj(null);
$ahora = time();
$ponerAct($jHttp, $ahora);
$idH = P::encolar($jHttp, 'buzon', 'Mensaje', 'Prueba por HTTP', '/?ir=soporte', ['forzar' => true]);
$r = P::procesarUno(Db::fila('SELECT * FROM push_cola WHERE id = ?', [$idH]));
$llego = glob("$TMP/falso/push_*.json");
check('curl envió al servicio falso y respondió 201', ['enviados', 1], [$r, count($llego)]);
$req = json_decode((string) file_get_contents(end($llego)), true);
$m = json_decode((string) P::descifrar(base64_decode($req['cuerpo']), $uaH['d'], $uaH['publica'], $auH), true);
check('El servicio recibió un cuerpo aes128gcm que el aparato descifra', ['Mensaje', 'Prueba por HTTP', '/?ir=soporte'], [$m['t'] ?? null, $m['b'] ?? null, $m['u'] ?? null]);
check('Cabeceras que llegaron (content-encoding, ttl, topic)', ['aes128gcm', '86400', 'buzon'], [$req['cabeceras']['content-encoding'] ?? null, $req['cabeceras']['ttl'] ?? null, $req['cabeceras']['topic'] ?? null]);
preg_match('/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/', (string) ($req['cabeceras']['authorization'] ?? ''), $mm);
check('JWT que llegó: firma válida con la k de la cabecera y aud del servicio', [1, "http://127.0.0.1:$P_FALSO", true],
    [$mm ? openssl_verify("$mm[1].$mm[2]", P::rawADer($b($mm[3])), P::pemPublica($b($mm[4])), OPENSSL_ALGO_SHA256) : 0, $mm ? json_decode($b($mm[2]), true)['aud'] : null,
     $mm ? json_decode($b($mm[2]), true)['exp'] > $ahora && json_decode($b($mm[2]), true)['exp'] <= $ahora + 24 * 3600 : false]);
$uaG = P::generarPar(); $auG = random_bytes(16);
$api('POST', '/api/push/suscribir', ['suscripcion' => ['endpoint' => "http://127.0.0.1:$P_FALSO/gone/x", 'keys' => ['p256dh' => P::b64u($uaG['publica']), 'auth' => P::b64u($auG)]], 'dispositivo' => 'navegador-prueba-2']);
$idH2 = P::encolar($jHttp, 'buzon', 'Mensaje', 'Dos aparatos', '/', ['forzar' => true]);
P::procesarUno(Db::fila('SELECT * FROM push_cola WHERE id = ?', [$idH2]));
check('410 de verdad por HTTP: esa suscripción se borra, la otra queda', [0, 1], [(int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE endpoint LIKE ?', ['%/gone/x']), (int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ?', [$jHttp])]);

// bin/
exec('ENVIVO_CONFIG=' . escapeshellarg($CONF) . ' php ' . escapeshellarg("$SRV/bin/push_enviar.php") . ' 2>&1', $out, $rc);
check('bin/push_enviar.php corre sin error', 0, $rc);
exec('ENVIVO_CONFIG=' . escapeshellarg($CONF) . ' php ' . escapeshellarg("$SRV/bin/push_claves.php") . ' --revisar 2>&1', $out2, $rc2);
check('bin/push_claves.php --revisar: las llaves del config cuadran', 0, $rc2);
$conf2 = "$TMP/config_sin_llaves.env";
file_put_contents($conf2, "ENVIVO_DB=$TMP/datos/otra.sqlite\n");
exec('ENVIVO_CONFIG=' . escapeshellarg($conf2) . ' php ' . escapeshellarg("$SRV/bin/push_claves.php") . ' --escribir 2>&1', $out3, $rc3);
$cfg = \EnVivo\Config::leer((string) file_get_contents($conf2));
check('bin/push_claves.php --escribir: agrega PUBLICA (65 bytes), PRIVADA (32) y SUJETO', [0, 65, 32, 'mailto:soporte@tukanec.com'], [$rc3, strlen($b($cfg['PUSH_VAPID_PUBLICA'] ?? '')), strlen($b($cfg['PUSH_VAPID_PRIVADA'] ?? '')), $cfg['PUSH_VAPID_SUJETO'] ?? null]);
$antes = (string) file_get_contents($conf2);
exec('ENVIVO_CONFIG=' . escapeshellarg($conf2) . ' php ' . escapeshellarg("$SRV/bin/push_claves.php") . ' --escribir 2>&1', $out4, $rc4);
check('…otra vez: no cambia las llaves', [0, $antes], [$rc4, (string) file_get_contents($conf2)]);
exec('ENVIVO_CONFIG=' . escapeshellarg($conf2) . ' php ' . escapeshellarg("$SRV/bin/push_claves.php") . ' --revisar 2>&1', $out5, $rc5);
check('…y esas llaves nuevas cuadran', 0, $rc5);
exec('ENVIVO_CONFIG=' . escapeshellarg($conf2) . ' php ' . escapeshellarg("$SRV/bin/push_enviar.php") . ' 2>&1', $out6, $rc6);
check('push_enviar.php con otra base sin suscripciones: sin error', 0, $rc6);

// Centro de Control
$CJ = "$TMP/jar_control.txt";
$ctl = function (string $m, string $ruta, ?array $datos = null) use ($P_APP, $CJ): array {
    $ch = curl_init("http://127.0.0.1:$P_APP$ruta");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_COOKIEJAR => $CJ, CURLOPT_COOKIEFILE => $CJ, CURLOPT_TIMEOUT => 30, CURLOPT_HEADER => true]);
    if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($datos));
    $c = (string) curl_exec($ch);
    $hs = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    return [(int) curl_getinfo($ch, CURLINFO_HTTP_CODE), substr($c, $hs), substr($c, 0, $hs)];
};
$csrf = fn(string $h) => preg_match('/name="csrf" value="([a-f0-9]{64})"/', $h, $x) ? $x[1] : '';
[, $html] = $ctl('GET', '/control/');
[$h] = $ctl('POST', '/control/', ['accion' => 'entrar', 'csrf' => $csrf($html), 'usuario' => $USUARIO, 'clave' => $CLAVE]);
check('Entrar al Centro de Control', 303, $h);
[$h, $html] = $ctl('GET', '/control/?t=push');
check('Pestaña Notificaciones: 200, en el menú y con sus tarjetas', [200, true, true, true],
    [$h, str_contains($html, '?t=push" class="activa"'), str_contains($html, 'id="kpi-push-jugadores"'), str_contains($html, 'id="panel-push-prueba"')]);
$nSus = (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM push_suscripciones');
check('Muestra los jugadores suscritos', true, (bool) preg_match('#id="kpi-push-jugadores"><span class="kpi-t">Jugadores suscritos</span><b class="kpi-v">' . $nSus . '</b>#', $html));
$antes = count(glob("$TMP/falso/push_*.json"));
[$h, , $cab] = $ctl('POST', '/control/', ['accion' => 'push_prueba', 'csrf' => $csrf($html), 'volver' => '/control/?t=push', 'jugador' => 'http@prueba.example']);
[, $html2] = $ctl('GET', '/control/?t=push');
check('Enviar prueba: 303, el servicio falso la recibe y el aviso lo dice', [303, $antes + 1, true], [$h, count(glob("$TMP/falso/push_*.json")), str_contains($html2, 'llegó a 1 de 1 aparatos')]);
check('…queda en la auditoría', 1, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'push_prueba' AND jugador_id = ?", [$jHttp]));
[$h] = $ctl('POST', '/control/', ['accion' => 'push_prueba', 'csrf' => 'malo', 'volver' => '/control/?t=push', 'jugador' => 'http@prueba.example']);
check('Sin CSRF válido -> 403 y nada enviado', [403, $antes + 1], [$h, count(glob("$TMP/falso/push_*.json"))]);
$ctl('POST', '/control/', ['accion' => 'push_prueba', 'csrf' => $csrf($html2), 'volver' => '/control/?t=push', 'jugador' => 'no-existe@prueba.example']);
[, $html3] = $ctl('GET', '/control/?t=push');
check('Jugador que no existe -> aviso de error', true, str_contains($html3, 'No encontré ese jugador'));
check('Sin errores de PHP en el servidor', '', trim((string) @file_get_contents("$TMP/php_errores.log")));

echo "\n---------------------------------------------\n";
echo "Resumen pruebas_push.php: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
