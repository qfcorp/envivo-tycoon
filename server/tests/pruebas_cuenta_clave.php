<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Cambiar la contraseña con la sesión abierta: POST /api/cuenta/clave
// (Cuentas::cambiarClave). Por HTTP (php -S + server/tests/router.php, como nginx), base y configuración temporales:
//  - método, X-Envivo, sin sesión -> 401 sesion_requerida
//  - falta la actual, actual equivocada (auditoría clave_cambio_fallido), nueva corta / larga / igual a la actual
//  - cambio bueno: la clave vieja ya no entra y la nueva sí; la sesión de este aparato sigue y las DEMÁS se cierran
//    (las de otro jugador no); enlaces de recuperación pendientes anulados; bloqueo por claves equivocadas limpio;
//    auditoría clave_cambiada; correo "Tu contraseña de EN VIVO Tycoon cambió" (CORREO_REGISTRO) en el idioma pedido
//  - límite: 10 intentos por cuenta cada 10 minutos -> 429 limite_intentos
//  - cuenta suspendida sí puede; los textos de error tienen su código en docs/traducciones/errores.json
// Uso:  php server/tests/pruebas_cuenta_clave.php        (GUARDAR_TMP=1 para dejar los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_clave_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr((string) strrchr((string) stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; };
$P_APP = (int) (getenv('P_APP') ?: $puerto());
file_put_contents("$TMP/config.env", "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:$P_APP\nCORREO_REGISTRO=$TMP/correos.log\nENVIVO_ZONA=America/Guayaquil\nSOPORTE_CORREO=soporte@prueba.example\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Cuentas, Db};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
$PROC = null;
register_shutdown_function(function () use (&$PROC, $TMP) {
    if ($PROC) { @proc_terminate($PROC); @proc_close($PROC); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});
$lineas = function (string $f, int $n = 0): array {
    $l = [];
    for ($k = 0; $k < 40; $k++) {
        $l = is_file($f) ? array_values(array_filter(explode("\n", (string) file_get_contents($f)))) : [];
        if (count($l) >= $n) break;
        usleep(100000);
    }
    return array_map(fn($x) => json_decode($x, true), $l);
};

Db::pdo();
$phpIni = ['-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1'];
$PROC = proc_open(array_merge(['php'], $phpIni, ['-S', '127.0.0.1:' . $P_APP, '-t', $RAIZ, 'server/tests/router.php']),
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/app.log", 'a'], 2 => ['file', "$TMP/app.log", 'a']], $tub, $RAIZ,
    ['ENVIVO_CONFIG' => "$TMP/config.env", 'PHP_CLI_SERVER_WORKERS' => '4', 'PATH' => getenv('PATH'), 'TZ' => 'America/Guayaquil']);
$arriba = false;
for ($k = 0; $k < 80 && !$arriba; $k++) { $s = @fsockopen('127.0.0.1', $P_APP); if ($s) { fclose($s); $arriba = true; } else usleep(100000); }

$http = function (string $metodo, string $ruta, ?array $cuerpo = null, array $extra = []) use ($P_APP): array {
    $ch = curl_init('http://127.0.0.1:' . $P_APP . $ruta);
    $cab = [];
    $h = array_merge(['Content-Type: application/json'], $extra['sin_cabecera'] ?? false ? [] : ['X-Envivo: 1'], $extra['h'] ?? []);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 20,
        CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$cab) { if (str_contains($l, ':')) { [$k, $v] = explode(':', $l, 2); $cab[strtolower(trim($k))][] = trim($v); } return strlen($l); }]
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []) + (isset($extra['galleta']) ? [CURLOPT_COOKIE => 'envivo_s=' . $extra['galleta']] : []));
    $b = (string) curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode($b, true), $cab, $b];
};
$cod = fn(array $x) => [$x[0], $x[1]['codigo'] ?? null];
$sesion = function (int $j): string { $t = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $t), $j, time(), time() + 3600]); return $t; };
$limpiar = fn() => Db::q('DELETE FROM intentos');
$C = '/api/cuenta/clave';

titulo('1. Sin sesión y peticiones mal hechas');
check('El juego arriba (php -S + router.php)', true, $arriba);
$ANA = Cuentas::registrar('ana@prueba.example', 'Ana', 'ClaveVieja1');
$BETO = Cuentas::registrar('beto@prueba.example', 'Beto', 'ClaveBeto11');
$s1 = $sesion($ANA); $s2 = $sesion($ANA); $s3 = $sesion($ANA); $sb = $sesion($BETO);
check('GET -> 405; POST sin X-Envivo -> 403', [405, 403], [$http('GET', $C, null, ['galleta' => $s1])[0], $http('POST', $C, ['actual' => 'ClaveVieja1', 'nueva' => 'ClaveNueva22'], ['sin_cabecera' => true, 'galleta' => $s1])[0]]);
check('Sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], $cod($http('POST', $C, ['actual' => 'ClaveVieja1', 'nueva' => 'ClaveNueva22'])));
check('Galleta inventada -> 401', 401, $http('POST', $C, ['actual' => 'ClaveVieja1', 'nueva' => 'ClaveNueva22'], ['galleta' => str_repeat('a', 64)])[0]);

titulo('2. Errores de validación (nada cambia)');
check('Falta la actual -> 400 clave_actual_falta', [400, 'clave_actual_falta'], $cod($http('POST', $C, ['nueva' => 'ClaveNueva22'], ['galleta' => $s1])));
[$c, $j] = $http('POST', $C, ['actual' => 'equivocada', 'nueva' => 'ClaveNueva22'], ['galleta' => $s1]);
check('Actual equivocada -> 400 clave_incorrecta, texto en español', [400, 'clave_incorrecta', 'La contraseña actual no es correcta.'], [$c, $j['codigo'] ?? null, $j['error'] ?? null]);
check('…queda en la auditoría (clave_cambio_fallido) y la sesión sigue', [1, true],
    [(int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'clave_cambio_fallido' AND jugador_id = ?", [$ANA]), (bool) ($http('GET', '/api/estado', null, ['galleta' => $s1])[1]['logueado'] ?? false)]);
[$c, $j] = $http('POST', $C, ['actual' => 'ClaveVieja1', 'nueva' => 'corta'], ['galleta' => $s1]);
check('Nueva corta -> 400 clave_corta con min 8', [400, 'clave_corta', 8], [$c, $j['codigo'] ?? null, $j['min'] ?? null]);
check('Nueva de más de 200 -> 400 clave_larga', [400, 'clave_larga'], $cod($http('POST', $C, ['actual' => 'ClaveVieja1', 'nueva' => str_repeat('x', 201)], ['galleta' => $s1])));
check('Nueva igual a la actual -> 400 clave_igual', [400, 'clave_igual'], $cod($http('POST', $C, ['actual' => 'ClaveVieja1', 'nueva' => 'ClaveVieja1'], ['galleta' => $s1])));
check('Después de los errores: la clave vieja sigue entrando y las 3 sesiones de Ana siguen', [true, 3],
    [password_verify('ClaveVieja1', (string) Db::valor('SELECT clave_hash FROM jugadores WHERE id = ?', [$ANA])), (int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$ANA])]);

titulo('3. Cambio bueno');
$limpiar();
// Antes: un enlace de recuperación pendiente y bloqueo por claves equivocadas al entrar
Db::q('INSERT INTO recuperaciones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', 'x' . random_int(1, 1e9)), $ANA, time(), time() + 1800]);
for ($k = 0; $k < 6; $k++) $http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'equivocada']);
check('Antes: entrar con la clave buena está bloqueado (429) y hay un enlace pendiente', [429, 1],
    [$http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'ClaveVieja1'])[0], (int) Db::valor('SELECT COUNT(*) FROM recuperaciones WHERE jugador_id = ? AND usado IS NULL', [$ANA])]);
Db::q("DELETE FROM intentos WHERE clave LIKE 'entrarip:%' OR clave LIKE 'clave%'");   // solo queda el bloqueo por correo
$antesCor = count($lineas("$TMP/correos.log"));
[$c, $j, $cab] = $http('POST', $C, ['actual' => 'ClaveVieja1', 'nueva' => 'ClaveNueva22', 'idioma' => 'en'], ['galleta' => $s1]);
check('POST /api/cuenta/clave -> 200 {ok, mensaje, sesiones_cerradas: 2}', [200, true, true, 2],
    [$c, $j['ok'] ?? null, str_contains((string) ($j['mensaje'] ?? ''), 'contraseña cambió'), $j['sesiones_cerradas'] ?? null]);
check('No manda galleta nueva (la sesión de este aparato sigue igual)', false, str_contains(implode(';', $cab['set-cookie'] ?? []), 'envivo_s='));
check('Queda SOLO la sesión de este aparato; la de Beto sigue', [1, hash('sha256', $s1), 1],
    [(int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$ANA]), Db::valor('SELECT token_hash FROM sesiones WHERE jugador_id = ?', [$ANA]), (int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$BETO])]);
check('Con esta galleta sigue la sesión; con las otras dos ya no', [true, false, false],
    [(bool) ($http('GET', '/api/estado', null, ['galleta' => $s1])[1]['logueado'] ?? false), (bool) ($http('GET', '/api/estado', null, ['galleta' => $s2])[1]['logueado'] ?? true), (bool) ($http('GET', '/api/estado', null, ['galleta' => $s3])[1]['logueado'] ?? true)]);
check('El hash es bcrypt (igual que el registro) y la clave vieja ya no entra; la nueva sí (bloqueo limpio)', [true, 401, 200],
    [str_starts_with((string) Db::valor('SELECT clave_hash FROM jugadores WHERE id = ?', [$ANA]), '$2y$'),
     $http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'ClaveVieja1'])[0], $http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'ClaveNueva22'])[0]]);
check('El enlace de recuperación pendiente ya no sirve', 0, (int) Db::valor('SELECT COUNT(*) FROM recuperaciones WHERE jugador_id = ? AND usado IS NULL', [$ANA]));
check('Auditoría: clave_cambiada', 1, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'clave_cambiada' AND jugador_id = ?", [$ANA]));
$cor = $lineas("$TMP/correos.log", $antesCor + 1);
check('Correo de aviso en el idioma pedido (en): "Your EN VIVO Tycoon password changed" para ana', [$antesCor + 1, 'ana@prueba.example', true],
    [count($cor), end($cor)['para'] ?? null, str_contains((string) (end($cor)['asunto'] ?? ''), 'EN VIVO Tycoon')]);
check('…el asunto es el de la plantilla clave_cambiada en inglés', \EnVivo\CorreoPlantillas::armar('clave_cambiada', 'en', ['nombre' => 'Ana'])['asunto'], end($cor)['asunto'] ?? null);
check('La contraseña no sale en el correo', false, str_contains(json_encode(end($cor)), 'ClaveNueva22'));
// Sin "idioma": Accept-Language
$s4 = $sesion($BETO);
$http('POST', $C, ['actual' => 'ClaveBeto11', 'nueva' => 'ClaveBeto22'], ['galleta' => $s4, 'h' => ['Accept-Language: es-EC,es;q=0.9']]);
$cor = $lineas("$TMP/correos.log", $antesCor + 2);
check('Sin "idioma" usa Accept-Language (es): "Tu contraseña de EN VIVO Tycoon cambió"', ['Tu contraseña de EN VIVO Tycoon cambió', 'beto@prueba.example'], [end($cor)['asunto'] ?? null, end($cor)['para'] ?? null]);
check('Beto: quedó solo la sesión con la que cambió', [1, hash('sha256', $s4)], [(int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$BETO]), Db::valor('SELECT token_hash FROM sesiones WHERE jugador_id = ?', [$BETO])]);

titulo('4. Límite, cuenta suspendida y baneada');
$limpiar();
$cods = []; for ($k = 0; $k < 11; $k++) $cods[] = $http('POST', $C, ['actual' => 'mala' . $k, 'nueva' => 'ClaveOtra333'], ['galleta' => $s1])[0];
$x = $http('POST', $C, ['actual' => 'ClaveNueva22', 'nueva' => 'ClaveOtra333'], ['galleta' => $s1]);
check('10 intentos por cuenta cada 10 minutos: el 11.º -> 429 limite_intentos (aun con la clave buena)', [10, 429, 'limite_intentos', 429],
    [count(array_filter($cods, fn($c) => $c === 400)), end($cods), $x[1]['codigo'] ?? null, $x[0]]);
check('…y la clave no cambió', true, password_verify('ClaveNueva22', (string) Db::valor('SELECT clave_hash FROM jugadores WHERE id = ?', [$ANA])));
$limpiar();
Db::q("UPDATE jugadores SET estado = 'suspendido' WHERE id = ?", [$ANA]);
check('Cuenta suspendida: sí puede cambiar su contraseña', 200, $http('POST', $C, ['actual' => 'ClaveNueva22', 'nueva' => 'ClaveSusp444'], ['galleta' => $s1])[0]);
Db::q("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$ANA]);
check('Cuenta baneada (con una sesión que quedó): 403 cuenta_baneada', [403, 'cuenta_baneada'], $cod($http('POST', $C, ['actual' => 'ClaveSusp444', 'nueva' => 'ClaveBan5555'], ['galleta' => $s1])));
Db::q("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$ANA]);

titulo('5. Textos de error y registros');
$err = json_decode((string) file_get_contents("$RAIZ/docs/traducciones/errores.json"), true);
$faltan = [];
foreach (['clave_actual_falta', 'clave_incorrecta', 'clave_corta', 'clave_larga', 'clave_igual', 'limite_intentos', 'sesion_requerida'] as $k) {
    foreach (array_filter(array_keys($err), fn($i) => $i[0] !== '_') as $i) if (!isset($err[$i][$k])) $faltan[] = "$i:$k";
    if (!isset($err['_codigos'][$k])) $faltan[] = "_codigos:$k";
}
check('Los códigos de /api/cuenta/clave tienen texto en los 10 idiomas de errores.json y su _codigos', [], $faltan);
check('API.md documenta POST /api/cuenta/clave', true, str_contains((string) file_get_contents("$RAIZ/server/API.md"), '/api/cuenta/clave'));
usleep(300000);
$log = (string) @file_get_contents("$TMP/php_errores.log") . (string) @file_get_contents("$TMP/app.log");
check('Sin errores ni avisos de PHP', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO api/i', $log));
if (preg_match('/fatal|warning|deprecated|notice|EN VIVO api/i', $log)) echo substr($log, 0, 2000), "\n";
check('Ninguna contraseña en los registros del servidor', false, (bool) preg_match('/ClaveNueva22|ClaveVieja1|ClaveSusp444/', $log));

echo "\n----------------------------------------\nResumen pruebas_cuenta_clave.php — correctas: $OK  ·  fallas: $FALLAS\n";
exit($FALLAS === 0 ? 0 : 1);
