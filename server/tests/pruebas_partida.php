<?php
// SOLO PRUEBAS (en una máquina de pruebas; nunca en el servidor del juego).
// Partida en la nube con versión y un solo dispositivo activo (src/Partidas.php, migraciones/partida_nube.sql, API.md):
//  - base y configuración TEMPORALES, el api.php DE VERDAD con "php -S" + router.php (4 procesos, como php-fpm);
//  - juego viejo (sin versión), guardar con versión (compare-and-swap), tomar la partida en otro dispositivo,
//    la pestaña vieja que no pisa nada (el caso del dueño: celular avanza, computadora con la pestaña abierta),
//    "tomar" al elegir la de aquí, datos inválidos, dos guardados a la vez, sin sesión, otra cuenta y borrar la cuenta.
// Uso:  php server/tests/pruebas_partida.php        (GUARDAR_TMP=1 para dejar los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_partida_' . getmypid();
@mkdir($TMP . '/datos', 0755, true);
$P_APP = (int) (getenv('P_APP') ?: 0);
if ($P_APP === 0) { $s = stream_socket_server('tcp://127.0.0.1:0'); $P_APP = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); }
file_put_contents("$TMP/config.env", "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:$P_APP\nENVIVO_ZONA=America/Guayaquil\nPLUX_AMBIENTE=sandbox\n");
putenv("ENVIVO_CONFIG=$TMP/config.env");

$procs = [];
register_shutdown_function(function () use (&$procs, $TMP) {
    foreach ($procs as $p) { $s = proc_get_status($p); if ($s['running']) posix_kill($s['pid'], 15); proc_close($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});

require $RAIZ . '/server/src/arranque.php';
use EnVivo\{Db, Migraciones};
Db::pdo();

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }
/** Valor de una clave (null incluido), o 'falta' si la respuesta no la trae. */
function k(array $a, string $c): mixed { return array_key_exists($c, $a) ? $a[$c] : 'falta'; }

titulo('Migración (src/migraciones/partida_nube.sql)');
$cols = Migraciones::columnas('partidas') ?? [];
si('partidas.rev y partidas.dispositivo existen', isset($cols['rev'], $cols['dispositivo']));
si('Tabla partida_activa existe', Migraciones::columnas('partida_activa') !== null);
check('Aplicar la migración otra vez no agrega nada ni falla', [], Migraciones::aplicar('partida_nube.sql'));

$procs[] = proc_open(['php', '-d', 'error_log=' . "$TMP/php_errores.log", '-d', 'log_errors=1', '-S', "127.0.0.1:$P_APP", '-t', $RAIZ, "$RAIZ/server/tests/router.php"],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/php.log", 'a'], 2 => ['file', "$TMP/php.log", 'a']], $tub, $RAIZ,
    ['ENVIVO_CONFIG' => "$TMP/config.env", 'TZ' => 'America/Guayaquil', 'PATH' => getenv('PATH'), 'PHP_CLI_SERVER_WORKERS' => '4']);
for ($i = 0; $i < 80 && @fsockopen('127.0.0.1', $P_APP) === false; $i++) usleep(100000);

/** Un navegador (o pestaña) con sus propias galletas. */
final class Nav {
    public int $http = 0; private string $jar;
    public function __construct(private string $base, string $nombre, ?Nav $copiaDe = null) {
        $this->jar = sys_get_temp_dir() . '/envivo_partida_' . getmypid() . "/jar_$nombre";
        if ($copiaDe) copy($copiaDe->jar, $this->jar); else @unlink($this->jar);   // copia = otra pestaña/celular con la misma cuenta
    }
    public function curl(string $metodo, string $ruta, ?array $d = null) {
        $c = curl_init($this->base . $ruta);
        $cab = ['Content-Type: application/json'];
        if ($metodo === 'POST') $cab[] = 'X-Envivo: 1';
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_PROXY => '', CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar,
            CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 30]);
        if ($d !== null) curl_setopt($c, CURLOPT_POSTFIELDS, json_encode($d));
        return $c;
    }
    public function pedir(string $metodo, string $ruta, ?array $d = null): array {
        $c = $this->curl($metodo, $ruta, $d);
        $b = (string) curl_exec($c); $this->http = (int) curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
        return json_decode($b, true) ?? ['crudo' => mb_substr($b, 0, 300)];
    }
    public function get(string $r): array { return $this->pedir('GET', $r); }
    public function post(string $r, array $d = []): array { return $this->pedir('POST', $r, $d); }
}
$URL = "http://127.0.0.1:$P_APP";
$n = 0;
$cuenta = function () use ($URL, &$n): array {
    $n++;
    $nav = new Nav($URL, "c$n");
    $r = $nav->post('/api/registro', ['email' => "partida$n." . bin2hex(random_bytes(3)) . '@prueba.example', 'nombre' => "Partida $n", 'clave' => "ClaveSegura$n", 'acepta_terminos' => true, 'edad_16' => true]);
    return [$nav, (int) ($r['jugador']['id'] ?? 0), "ClaveSegura$n"];
};
$partida = fn(int $dia, int $dinero) => json_encode(['day' => $dia, 'money' => $dinero, 'stats' => ['events' => $dia * 2]]);
$DA = 'dcompu0000000000000000001';   // la computadora (pestaña que quedó abierta)
$DB = 'dcelular00000000000000001';   // el celular
$enNube = fn(int $j) => Db::fila('SELECT rev, dispositivo, datos FROM partidas WHERE jugador_id = ?', [$j]);
$activo = fn(int $j) => Db::valor('SELECT dispositivo FROM partida_activa WHERE jugador_id = ?', [$j]);

// =====================================================================
titulo('Sin sesión');
$v = new Nav($URL, 'visitante');
$v->get('/api/partida/meta?dispositivo=' . $DA);
check('GET /api/partida/meta sin sesión -> 401', 401, $v->http);
$v->post('/api/partida/activar', ['base' => 0, 'dispositivo' => $DA]);
check('POST /api/partida/activar sin sesión -> 401', 401, $v->http);
$v->post('/api/partida/meta');
check('POST /api/partida/meta -> 405', 405, $v->http);

// =====================================================================
titulo('Juego viejo (sin versión): sigue funcionando mientras la cuenta no use el juego nuevo');
[$viejo, $JV] = $cuenta();
$m = $viejo->get('/api/partida');
check('Partida vacía: datos null, rev 0, hay false, sin dispositivo activo', [200, null, 0, false, null, null], [$viejo->http, k($m, 'datos'), $m['rev'] ?? null, $m['hay'] ?? null, k($m, 'guardo'), k($m, 'activo')]);
$r = $viejo->post('/api/partida', ['datos' => $partida(2, 500)]);
check('Guardar sin base -> 200, rev 1', [200, true, 1], [$viejo->http, $r['ok'] ?? null, $r['rev'] ?? null]);
$r = $viejo->post('/api/partida', ['datos' => $partida(3, 600)]);
check('Otra vez sin base -> rev 2 (el juego nuevo verá que cambió)', [200, 2], [$viejo->http, $r['rev'] ?? null]);
$m = $viejo->get('/api/partida/meta?dispositivo=' . $DA);
check('meta: hay, rev 2, guardó un juego viejo (null), nadie activo, eres_activo', [true, 2, null, null, true], [$m['hay'] ?? null, $m['rev'] ?? null, k($m, 'guardo'), k($m, 'activo'), $m['eres_activo'] ?? null]);
si('meta no trae los datos de la partida (liviano)', !array_key_exists('datos', $m));

// =====================================================================
titulo('El caso del dueño: computadora con la pestaña abierta, avanza en el celular');
[$compu, $J, $CLAVE] = $cuenta();
$cel = new Nav($URL, 'cel', $compu);   // misma cuenta, otro "celular" (misma galleta: la sesión de la cuenta)
$r = $compu->post('/api/partida/activar', ['base' => 0, 'dispositivo' => $DA]);
check('La computadora abre el juego (sin partida en la nube) y la toma', [200, true, true, $DA], [$compu->http, $r['ok'] ?? null, $r['eres_activo'] ?? null, $r['activo']['dispositivo'] ?? null]);
$r = $compu->post('/api/partida', ['datos' => $partida(5, 1000), 'base' => 0, 'dispositivo' => $DA]);
check('La computadora guarda (base 0) -> rev 1', [200, 1], [$compu->http, $r['rev'] ?? null]);
$r = $compu->post('/api/partida', ['datos' => $partida(6, 1100), 'base' => 1, 'dispositivo' => $DA]);
check('…y otra vez (base 1) -> rev 2', [200, 2], [$compu->http, $r['rev'] ?? null]);
// El celular abre el juego: baja la rev 2, la toma
$g = $cel->get('/api/partida');
check('El celular lee la partida: rev 2, la guardó la computadora', [2, $DA, $partida(6, 1100)], [$g['rev'] ?? null, $g['guardo'] ?? null, $g['datos'] ?? null]);
$r = $cel->post('/api/partida/activar', ['base' => 1, 'dispositivo' => $DB]);
check('Tomar la partida con una versión vieja (base 1) -> 409 partida_desactualizada con la versión de la nube', [409, 'partida_desactualizada', 2], [$cel->http, $r['codigo'] ?? null, $r['nube']['rev'] ?? null]);
$r = $cel->post('/api/partida/activar', ['base' => 2, 'dispositivo' => $DB]);
check('El celular toma la partida (base 2) -> activo el celular', [200, true, $DB, $DB], [$cel->http, $r['eres_activo'] ?? null, $r['activo']['dispositivo'] ?? null, $activo($J)]);
// La pestaña vieja de la computadora intenta guardar (p. ej. al ocultarla): NO pisa
$r = $compu->post('/api/partida', ['datos' => $partida(6, 9), 'base' => 2, 'dispositivo' => $DA]);
check('La computadora (no activa) guarda -> 409 otro_dispositivo, con quién la tiene', [409, 'otro_dispositivo', 2, $DB, false], [$compu->http, $r['codigo'] ?? null, $r['nube']['rev'] ?? null, $r['nube']['activo']['dispositivo'] ?? null, $r['nube']['eres_activo'] ?? null]);
si('…el texto del error viene en español y sin datos de la partida', is_string($r['error'] ?? null) && !isset($r['nube']['datos']));
check('…la nube sigue igual (rev 2, lo de la computadora antes)', [2, $partida(6, 1100)], [(int) $enNube($J)['rev'], $enNube($J)['datos']]);
// El celular juega y guarda
$r = $cel->post('/api/partida', ['datos' => $partida(9, 5000), 'base' => 2, 'dispositivo' => $DB]);
check('El celular avanza (día 9) y guarda -> rev 3', [200, 3], [$cel->http, $r['rev'] ?? null]);
$r = $cel->post('/api/partida', ['datos' => $partida(10, 5500), 'base' => 3, 'dispositivo' => $DB]);
check('…y otra vez -> rev 4', [200, 4], [$cel->http, $r['rev'] ?? null]);
// La computadora con su base vieja (2): compare-and-swap
$r = $compu->post('/api/partida', ['datos' => $partida(6, 9), 'base' => 2, 'dispositivo' => $DA]);
check('La computadora guarda con base 2 -> 409 partida_desactualizada (rev 4 en la nube, del celular)', [409, 'partida_desactualizada', 4, $DB], [$compu->http, $r['codigo'] ?? null, $r['nube']['rev'] ?? null, $r['nube']['guardo'] ?? null]);
$r = $compu->post('/api/partida', ['datos' => $partida(6, 9), 'base' => 2, 'dispositivo' => $DA, 'tomar' => true]);
check('…ni con "tomar" se pisa una versión más nueva -> 409 partida_desactualizada', [409, 'partida_desactualizada'], [$compu->http, $r['codigo'] ?? null]);
$r = $compu->post('/api/partida', ['datos' => $partida(6, 9)]);
check('…ni como juego viejo (sin base) -> 409 partida_desactualizada', [409, 'partida_desactualizada'], [$compu->http, $r['codigo'] ?? null]);
check('El avance del celular sigue en la nube (día 10, rev 4)', [4, $DB, $partida(10, 5500)], [(int) $enNube($J)['rev'], $enNube($J)['dispositivo'], $enNube($J)['datos']]);
// La computadora vuelve a tener el foco: mira la nube y ve que otro la tomó
$m = $compu->get('/api/partida/meta?dispositivo=' . $DA);
check('meta para la computadora: rev 4, activo el celular, eres_activo false', [200, 4, $DB, false], [$compu->http, $m['rev'] ?? null, $m['activo']['dispositivo'] ?? null, $m['eres_activo'] ?? null]);
si('…con las fechas en ISO', (bool) preg_match('/^\d{4}-\d\d-\d\dT/', (string) ($m['actualizado'] ?? '')) && (bool) preg_match('/^\d{4}-\d\d-\d\dT/', (string) ($m['activo']['desde'] ?? '')));
// "Usar la partida más nueva": baja la rev 4, la toma y sigue jugando ahí
$g = $compu->get('/api/partida');
check('La computadora baja la partida más nueva (día 10)', [4, $partida(10, 5500)], [$g['rev'] ?? null, $g['datos'] ?? null]);
$r = $compu->post('/api/partida/activar', ['base' => 4, 'dispositivo' => $DA]);
check('…la toma (base 4) -> activa la computadora', [200, $DA], [$compu->http, $activo($J)]);
$r = $compu->post('/api/partida', ['datos' => $partida(11, 6000), 'base' => 4, 'dispositivo' => $DA]);
check('…y guarda encima (día 11) -> rev 5', [200, 5], [$compu->http, $r['rev'] ?? null]);
$r = $cel->post('/api/partida', ['datos' => $partida(10, 1), 'base' => 4, 'dispositivo' => $DB]);
check('Ahora el celular es el viejo: base 4 -> 409 partida_desactualizada', [409, 'partida_desactualizada', 5, $DA], [$cel->http, $r['codigo'] ?? null, $r['nube']['rev'] ?? null, $r['nube']['activo']['dispositivo'] ?? null]);

// =====================================================================
titulo('Las dos avanzaron y el jugador eligió "la de aquí": tomar con la versión al día');
$r = $cel->post('/api/partida', ['datos' => $partida(12, 7), 'base' => 5, 'dispositivo' => $DB]);
check('El celular con base 5 pero sin ser el activo -> 409 otro_dispositivo', [409, 'otro_dispositivo'], [$cel->http, $r['codigo'] ?? null]);
$r = $cel->post('/api/partida', ['datos' => $partida(12, 7), 'base' => 5, 'dispositivo' => $DB, 'tomar' => true]);
check('…con "tomar" (eligió la suya, ya vio la versión 5) -> 200 rev 6 y queda activo el celular', [200, 6, $DB], [$cel->http, $r['rev'] ?? null, $activo($J)]);
$r = $compu->post('/api/partida', ['datos' => $partida(11, 6001), 'base' => 5, 'dispositivo' => $DA]);
check('La computadora ya no puede guardar -> 409', 409, $compu->http);
$r = $compu->post('/api/partida', ['datos' => $partida(11, 1), 'base' => 6, 'dispositivo' => $DA, 'tomar' => 'si']);
check('…"tomar" que no es true (texto) no cuenta', [409, 'otro_dispositivo'], [$compu->http, $r['codigo'] ?? null]);
$r = $compu->post('/api/partida', ['datos' => $partida(11, 1), 'base' => 6, 'dispositivo' => $DA, 'tomar' => 1]);
check('…"tomar" = 1 tampoco', [409, 'otro_dispositivo'], [$compu->http, $r['codigo'] ?? null]);

// =====================================================================
titulo('Datos que no sirven');
foreach ([['base' => -1], ['base' => 'x'], ['base' => 1.5], ['base' => [6]]] as $mal) {
    $r = $cel->post('/api/partida', ['datos' => $partida(1, 1), 'dispositivo' => $DB] + $mal);
    check('base ' . json_encode($mal['base']) . ' -> 400 partida_invalida', [400, 'partida_invalida'], [$cel->http, $r['codigo'] ?? null]);
}
$r = $cel->post('/api/partida', ['datos' => $partida(1, 1), 'base' => 6]);
check('Con base pero sin dispositivo -> 400 partida_invalida', [400, 'partida_invalida'], [$cel->http, $r['codigo'] ?? null]);
foreach (['corto', str_repeat('a', 65), 'con espacio 1234', '<script>12345'] as $d) {
    $cel->post('/api/partida', ['datos' => $partida(1, 1), 'base' => 6, 'dispositivo' => $d]);
    check('Dispositivo "' . mb_substr($d, 0, 14) . '…" no válido -> 400', 400, $cel->http);
}
$r = $cel->post('/api/partida', ['datos' => '{no es json', 'base' => 6, 'dispositivo' => $DB]);
check('Partida que no es JSON -> 400 partida_invalida', [400, 'partida_invalida'], [$cel->http, $r['codigo'] ?? null]);
$r = $cel->post('/api/partida', ['datos' => json_encode(['x' => str_repeat('a', 300 * 1024)]), 'base' => 6, 'dispositivo' => $DB]);
check('Partida de más de 300 KB -> 413 partida_grande', [413, 'partida_grande'], [$cel->http, $r['codigo'] ?? null]);
$r = $cel->post('/api/partida/activar', ['dispositivo' => $DB]);
check('Tomar sin base -> 400 partida_invalida', [400, 'partida_invalida'], [$cel->http, $r['codigo'] ?? null]);
$r = $cel->post('/api/partida/activar', ['base' => 6]);
check('Tomar sin dispositivo -> 400 partida_invalida', [400, 'partida_invalida'], [$cel->http, $r['codigo'] ?? null]);
check('Nada de eso cambió la nube (rev 6, del celular)', [6, $DB], [(int) $enNube($J)['rev'], $enNube($J)['dispositivo']]);

// =====================================================================
titulo('Dos guardados a la vez con la misma base (4 procesos de PHP): solo uno pasa');
$mh = curl_multi_init(); $hs = [];
for ($i = 0; $i < 4; $i++) { $hs[$i] = $cel->curl('POST', '/api/partida', ['datos' => $partida(20 + $i, 100 * $i), 'base' => 6, 'dispositivo' => $DB]); curl_multi_add_handle($mh, $hs[$i]); }
do { $st = curl_multi_exec($mh, $vivos); if ($vivos) curl_multi_select($mh, 1.0); } while ($vivos && $st === CURLM_OK);
$codigos = array_map(fn($h) => (int) curl_getinfo($h, CURLINFO_HTTP_CODE), $hs);
sort($codigos);
check('4 a la vez con base 6 -> uno 200 y tres 409', [200, 409, 409, 409], $codigos);
check('…la nube quedó en rev 7 (no 10)', 7, (int) $enNube($J)['rev']);

// =====================================================================
titulo('Cada cuenta tiene lo suyo');
[$otra, $JO] = $cuenta();
$m = $otra->get('/api/partida/meta?dispositivo=' . $DB);
check('Otra cuenta con el mismo código de dispositivo: sin partida y sin dispositivo activo', [false, 0, null, true], [$m['hay'] ?? null, $m['rev'] ?? null, k($m, 'activo'), $m['eres_activo'] ?? null]);
$r = $otra->post('/api/partida', ['datos' => $partida(1, 50), 'base' => 0, 'dispositivo' => $DA]);
check('…guarda la suya (base 0) sin tocar la del dueño', [200, 1, 7], [$otra->http, $r['rev'] ?? null, (int) $enNube($J)['rev']]);
$r = $viejo->post('/api/partida', ['datos' => $partida(4, 700)]);
check('El juego viejo de la primera cuenta sigue guardando (nunca usó el juego nuevo)', [200, 3], [$viejo->http, $r['rev'] ?? null]);

// =====================================================================
titulo('Borrar la cuenta borra también el dispositivo activo');
$compu->post('/api/cuenta/borrar', ['clave' => $CLAVE, 'confirmar' => 'BORRAR']);
check('Cuenta borrada -> 200', 200, $compu->http);
check('…sin partida ni dispositivo activo', [false, false], [(bool) $enNube($J), (bool) $activo($J)]);

// =====================================================================
titulo('Registro de PHP');
$log = (string) @file_get_contents("$TMP/php_errores.log") . (string) @file_get_contents("$TMP/php.log");
check('Sin errores ni avisos de PHP', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO api/i', $log));
si('Se anotó el juego viejo rechazado (para saber cuándo ya no quedan)', str_contains($log, 'EN VIVO partida: juego viejo sin versión rechazado'));

echo "\n----------------------------------------\nResumen pruebas_partida.php — correctas: $ok  ·  fallas: $fallas\n";
exit($fallas ? 1 : 0);
