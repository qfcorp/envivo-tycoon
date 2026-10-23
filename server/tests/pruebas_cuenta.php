<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Cuenta (server/src/Terminos.php, TerminosApi.php, server/INTEGRAR_CUENTA.md):
// base SQLite TEMPORAL; aceptación de Términos y Privacidad (16+) al registrarse, cuentas viejas que aceptan una vez,
// el chat que no deja escribir sin aceptar, cambio de versión y de dueño, y borrar la cuenta por HTTP.
// Las rutas se prueban con php -S y el server/public/api.php DE VERDAD.
// Uso:  php server/tests/pruebas_cuenta.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_cuenta_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$CONF = "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1\n";
file_put_contents($TMP . '/config.env', $CONF);
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Cuentas, Db, Fallo, Migraciones, Terminos};

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

// =====================================================================
titulo('Migración src/migraciones/cuenta.sql');
$cols = Migraciones::columnas('cuenta_terminos');
check('Tabla cuenta_terminos con sus columnas', ['aceptado', 'edad_minima', 'email_hash', 'jugador_id', 'origen', 'version'], (function () use ($cols) { $k = array_keys($cols ?? []); sort($k); return $k; })());
check('Aplicar cuenta.sql otra vez no hace nada ni falla', [], Migraciones::aplicar('cuenta.sql'));
check('Sin columna de IP (no se guarda)', false, isset($cols['ip']));

// =====================================================================
titulo('Terminos::revisar (lo que manda el formulario)');
check('Nada -> 400 terminos_requeridos', [400, 'terminos_requeridos'], falla(fn() => Terminos::revisar([])));
check('acepta_terminos "true" (texto) -> 400 terminos_requeridos', [400, 'terminos_requeridos'], falla(fn() => Terminos::revisar(['acepta_terminos' => 'true', 'edad_16' => true])));
check('Acepta pero sin edad -> 400 edad_requerida', [400, 'edad_requerida'], falla(fn() => Terminos::revisar(['acepta_terminos' => true])));
check('Acepta y edad_16 false -> 400 edad_requerida', [400, 'edad_requerida'], falla(fn() => Terminos::revisar(['acepta_terminos' => true, 'edad_16' => false])));
check('Las dos en true -> bien', [200, null], falla(fn() => Terminos::revisar(['acepta_terminos' => true, 'edad_16' => true])));
check('Edad mínima 16 (decisión del dueño)', 16, Terminos::EDAD_MINIMA);

// =====================================================================
titulo('Aceptar directo (sin HTTP)');
$V = Cuentas::registrar('vieja.' . bin2hex(random_bytes(3)) . '@prueba.example', 'Vieja', 'ClaveSegura1');
check('Cuenta creada sin aceptar: aceptado = false', false, Terminos::aceptado($V));
check('Terminos::exigir -> 403 terminos_pendientes', [403, 'terminos_pendientes'], falla(fn() => Terminos::exigir($V)));
$t1 = Terminos::aceptar($V, 'juego');
$t2 = Terminos::aceptar($V, 'juego');
check('Aceptar dos veces: una sola fila y la misma fecha', [1, $t1], [(int) Db::valor('SELECT COUNT(*) FROM cuenta_terminos WHERE jugador_id = ?', [$V]), $t2]);
check('Fila: versión vigente, edad 16, origen juego, correo como hash (no en claro)', [Terminos::version(), 16, 'juego', 64, false],
    (function () use ($V) { $f = Db::fila('SELECT * FROM cuenta_terminos WHERE jugador_id = ?', [$V]); $e = (string) Db::valor('SELECT email FROM jugadores WHERE id = ?', [$V]);
        return [$f['version'], (int) $f['edad_minima'], $f['origen'], strlen($f['email_hash']), str_contains(implode('|', $f), $e)]; })());
check('Bloque terminos del estado', ['version' => Terminos::version(), 'aceptados' => true, 'edad_minima' => 16], array_diff_key(Terminos::estado($V)['terminos'], ['aceptado_en' => 1]));
check('Cuentas::estado trae el bloque terminos (aceptados)', true, Cuentas::estado($V)['terminos']['aceptados'] ?? null);
Db::q('UPDATE jugadores SET email = ? WHERE id = ?', ['nuevo.dueno.' . bin2hex(random_bytes(3)) . '@prueba.example', $V]);
check('Cambió el correo (transferencia de cuenta): el nuevo dueño debe aceptar otra vez', false, Terminos::aceptado($V));
check('Origen desconocido se guarda como "juego"', 'juego', (function () use ($V) { Terminos::aceptar($V, 'otra-cosa'); return Db::valor('SELECT origen FROM cuenta_terminos WHERE jugador_id = ? ORDER BY aceptado DESC, rowid DESC LIMIT 1', [$V]); })());
check('Jugador que no existe -> 404', [404, null], falla(fn() => Terminos::aceptar(999999, 'juego')));

// =====================================================================
titulo('Por HTTP (php -S con el api.php de verdad)');
file_put_contents($TMP . '/router.php', '<?php $r = (string) parse_url((string) $_SERVER["REQUEST_URI"], PHP_URL_PATH); if (!str_starts_with($r, "/api/")) { http_response_code(404); echo "404\n"; return true; } require '
    . var_export(dirname(__DIR__) . '/public/api.php', true) . ';');
$puerto = (int) (getenv('P_APP') ?: (function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr((string) strrchr((string) stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; })());
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $puerto, $TMP . '/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tub, null, ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PATH' => getenv('PATH'), 'TZ' => 'America/Guayaquil']);
for ($k = 0; $k < 50; $k++) { if (@fsockopen('127.0.0.1', $puerto)) break; usleep(100000); }
/** Navegador con su propia galleta. */
$nav = function () use ($puerto, $TMP): callable {
    $jar = $TMP . '/galleta_' . bin2hex(random_bytes(4));
    return function (string $metodo, string $ruta, ?array $cuerpo = null, bool $cabecera = true) use ($puerto, $jar): array {
        $ch = curl_init('http://127.0.0.1:' . $puerto . $ruta);
        $h = ['Content-Type: application/json'];
        if ($cabecera) $h[] = 'X-Envivo: 1';
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 20,
            CURLOPT_COOKIEFILE => $jar, CURLOPT_COOKIEJAR => $jar] + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []));
        $b = curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        return [$c, json_decode((string) $b, true)];
    };
};
$cod = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null];
$cuantas = fn(string $email) => (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE email = ?', [Cuentas::normalizarEmail($email)]);

// --- Registro
$a = $nav();
$email = 'ana.' . bin2hex(random_bytes(3)) . '@prueba.example';
check('Registro sin aceptar -> 400 terminos_requeridos y NO se crea la cuenta', [400, 'terminos_requeridos', 0], [...$cod($a('POST', '/api/registro', ['email' => $email, 'nombre' => 'Ana', 'clave' => 'ClaveSegura1'])), $cuantas($email)]);
check('Registro con acepta_terminos false -> 400 terminos_requeridos', [400, 'terminos_requeridos'], $cod($a('POST', '/api/registro', ['email' => $email, 'nombre' => 'Ana', 'clave' => 'ClaveSegura1', 'acepta_terminos' => false, 'edad_16' => true])));
[$c, $j] = $a('POST', '/api/registro', ['email' => $email, 'nombre' => 'Ana', 'clave' => 'ClaveSegura1', 'acepta_terminos' => true]);
check('Registro sin "Tengo 16 años o más" -> 400 edad_requerida, edad 16, sin cuenta', [400, 'edad_requerida', 16, 0], [$c, $j['codigo'] ?? null, $j['edad'] ?? null, $cuantas($email)]);
check('El texto del error dice 16 años', true, str_contains((string) ($j['error'] ?? ''), '16 años'));
[$c, $j] = $a('POST', '/api/registro', ['email' => $email, 'nombre' => 'Ana', 'clave' => 'ClaveSegura1', 'acepta_terminos' => true, 'edad_16' => true]);
check('Registro aceptando las dos -> 200, con sesión y terminos.aceptados', [200, true, true, Terminos::version()], [$c, $j['logueado'] ?? null, $j['terminos']['aceptados'] ?? null, $j['terminos']['version'] ?? null]);
$A = (int) ($j['jugador']['id'] ?? 0);
check('Se guardó la aceptación con origen "registro"', ['registro', 16], (function () use ($A) { $f = Db::fila('SELECT origen, edad_minima FROM cuenta_terminos WHERE jugador_id = ?', [$A]); return [$f['origen'] ?? null, (int) ($f['edad_minima'] ?? 0)]; })());
check('Correo inválido con las casillas -> sigue saliendo email_invalido', [400, 'email_invalido'], $cod($nav()('POST', '/api/registro', ['email' => 'no-es-correo', 'nombre' => 'X', 'clave' => 'ClaveSegura1', 'acepta_terminos' => true, 'edad_16' => true])));
[$c, $j] = $a('POST', '/api/chat', ['canal' => 'servidor', 'texto' => 'Hola desde Ana']);
check('Quien aceptó al registrarse escribe en el chat -> 200', [200, true], [$c, $j['ok'] ?? null]);

// --- Cuenta vieja (creada antes de pedir la aceptación)
$b = $nav();
$emailB = 'beto.' . bin2hex(random_bytes(3)) . '@prueba.example';
$B = Cuentas::registrar($emailB, 'Beto', 'ClaveSegura2');
check('Cuenta vieja entra', 200, $b('POST', '/api/entrar', ['email' => $emailB, 'clave' => 'ClaveSegura2'])[0]);
[$c, $j] = $b('GET', '/api/estado');
check('/api/estado: terminos.aceptados = false, edad_minima 16', [200, false, 16], [$c, $j['terminos']['aceptados'] ?? null, $j['terminos']['edad_minima'] ?? null]);
check('Chat sin aceptar -> 403 terminos_pendientes (texto)', [403, 'terminos_pendientes'], $cod($b('POST', '/api/chat', ['canal' => 'servidor', 'texto' => 'hola'])));
check('Chat sin aceptar -> 403 terminos_pendientes (mensaje rápido)', [403, 'terminos_pendientes'], $cod($b('POST', '/api/chat', ['canal' => 'servidor', 'rapido' => 'vamos_festival'])));
check('…y el mensaje no se guardó', 0, (int) Db::valor('SELECT COUNT(*) FROM chat_mensajes WHERE jugador_id = ?', [$B]));
check('Leer el chat sí se puede (GET) -> 200', 200, $b('GET', '/api/chat?canal=servidor')[0]);
check('GET /api/cuenta/terminos -> aceptados false', [200, false], (function () use ($b) { [$c, $j] = $b('GET', '/api/cuenta/terminos'); return [$c, $j['terminos']['aceptados'] ?? null]; })());
check('POST /api/cuenta/terminos sin X-Envivo -> 403', 403, $b('POST', '/api/cuenta/terminos', ['acepta_terminos' => true, 'edad_16' => true], false)[0]);
check('POST /api/cuenta/terminos sin casillas -> 400 terminos_requeridos', [400, 'terminos_requeridos'], $cod($b('POST', '/api/cuenta/terminos', [])));
check('POST /api/cuenta/terminos sin edad -> 400 edad_requerida', [400, 'edad_requerida'], $cod($b('POST', '/api/cuenta/terminos', ['acepta_terminos' => true])));
[$c, $j] = $b('POST', '/api/cuenta/terminos', ['acepta_terminos' => true, 'edad_16' => true]);
check('POST /api/cuenta/terminos con las dos -> 200 aceptados, con fecha', [200, true, true], [$c, $j['terminos']['aceptados'] ?? null, is_string($j['terminos']['aceptado_en'] ?? null)]);
check('Origen "juego"', 'juego', Db::valor('SELECT origen FROM cuenta_terminos WHERE jugador_id = ?', [$B]));
check('Ahora el chat sí -> 200', 200, $b('POST', '/api/chat', ['canal' => 'servidor', 'texto' => 'Ya acepté'])[0]);
check('PUT /api/cuenta/terminos -> 405', 405, $b('PUT', '/api/cuenta/terminos', [])[0]);
check('Sin sesión /api/cuenta/terminos -> 401 sesion_requerida', [401, 'sesion_requerida'], $cod($nav()('GET', '/api/cuenta/terminos')));

// --- Nueva versión de los términos (config.env): todos aceptan otra vez
file_put_contents($TMP . '/config.env', $CONF . "ENVIVO_TERMINOS_VERSION=2027-01\n");
[$c, $j] = $b('GET', '/api/estado');
check('ENVIVO_TERMINOS_VERSION nueva -> aceptados false y versión 2027-01', [false, '2027-01'], [$j['terminos']['aceptados'] ?? null, $j['terminos']['version'] ?? null]);
check('…y el chat pide aceptar otra vez', [403, 'terminos_pendientes'], $cod($b('POST', '/api/chat', ['canal' => 'servidor', 'texto' => 'hola otra vez'])));
check('Aceptar la nueva -> 200 y queda la fila de cada versión', [200, 2], [$b('POST', '/api/cuenta/terminos', ['acepta_terminos' => true, 'edad_16' => true])[0], (int) Db::valor('SELECT COUNT(*) FROM cuenta_terminos WHERE jugador_id = ?', [$B])]);
file_put_contents($TMP . '/config.env', $CONF . "ENVIVO_TERMINOS_VERSION=no vale!\n");
check('Versión mal escrita en config.env -> se usa la del código', Terminos::VERSION, $b('GET', '/api/estado')[1]['terminos']['version'] ?? null);
file_put_contents($TMP . '/config.env', $CONF);

// --- Borrar la cuenta (POST /api/cuenta/borrar, lo que usa js/cuenta.js)
check('Borrar sin escribir BORRAR -> 400 confirmacion_requerida', [400, 'confirmacion_requerida'], $cod($a('POST', '/api/cuenta/borrar', ['clave' => 'ClaveSegura1', 'confirmar' => 'borrar'])));
check('Borrar con la clave mala -> 401 clave_incorrecta', [401, 'clave_incorrecta'], $cod($a('POST', '/api/cuenta/borrar', ['clave' => 'otra', 'confirmar' => 'BORRAR'])));
check('Borrar sin X-Envivo -> 403', 403, $a('POST', '/api/cuenta/borrar', ['clave' => 'ClaveSegura1', 'confirmar' => 'BORRAR'], false)[0]);
check('Sigue con sesión después de los intentos', true, $a('GET', '/api/estado')[1]['logueado'] ?? null);
[$c, $j] = $a('POST', '/api/cuenta/borrar', ['clave' => 'ClaveSegura1', 'confirmar' => 'BORRAR']);
check('Borrar con clave y BORRAR -> 200 borrada', [200, true], [$c, $j['borrada'] ?? null]);
check('Después: /api/estado sin sesión', false, $a('GET', '/api/estado')[1]['logueado'] ?? null);
check('La cuenta quedó borrada y anonimizada (sin el correo)', ['borrado', 0, 0], [Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$A]), $cuantas($email), (int) Db::valor('SELECT COUNT(*) FROM partidas WHERE jugador_id = ?', [$A])]);
check('Ya no se puede entrar con esa cuenta', 401, $nav()('POST', '/api/entrar', ['email' => $email, 'clave' => 'ClaveSegura1'])[0]);
check('El correo queda libre: registrarse otra vez (aceptando) -> 200', 200, $nav()('POST', '/api/registro', ['email' => $email, 'nombre' => 'Ana otra vez', 'clave' => 'ClaveSegura1', 'acepta_terminos' => true, 'edad_16' => true])[0]);

proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nCuenta (términos y borrar): $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
