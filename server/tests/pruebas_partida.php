<?php
// SOLO PRUEBAS (en una máquina de pruebas; nunca en el servidor del juego).
// Partida en la nube con versión y un solo dispositivo activo (src/Partidas.php, migraciones/partida_nube.sql, API.md):
//  - base y configuración TEMPORALES, el api.php DE VERDAD con "php -S" + router.php (4 procesos, como php-fpm);
//  - juego viejo (sin versión), guardar con versión (compare-and-swap), tomar la partida en otro dispositivo,
//    la pestaña vieja que no pisa nada (el caso del dueño: celular avanza, computadora con la pestaña abierta),
//    "tomar" al elegir la de aquí, datos inválidos, dos guardados a la vez, sin sesión, otra cuenta y borrar la cuenta;
//  - historial (migraciones/partidas_historial.sql): copia antes de pisar, tomar / retroceso, poda y restaurar (Partidas::restaurar).
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
use EnVivo\{Db, Migraciones, Partidas};
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
titulo('Un aparato nuevo (otra sesión, sin versión guardada) nunca pisa la nube con avance');
$DN = 'dnuevo' . bin2hex(random_bytes(6));
$r = $cel->post('/api/partida', ['datos' => $partida(1, 500), 'base' => 0, 'dispositivo' => $DN, 'tomar' => true]);
check('Primer guardado de un aparato nuevo con base 0 (la nube va en rev 5) -> 409 partida_desactualizada, ni con "tomar"', [409, 'partida_desactualizada', 5], [$cel->http, $r['codigo'] ?? null, $r['nube']['rev'] ?? null]);
$r = $cel->post('/api/partida/activar', ['base' => 0, 'dispositivo' => $DN]);
check('…tampoco puede tomar la partida con base 0 -> 409', [409, 'partida_desactualizada'], [$cel->http, $r['codigo'] ?? null]);
check('…la nube sigue igual (rev 5, la de la computadora)', [5, $DA], [(int) $enNube($J)['rev'], $activo($J)]);

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
titulo('Historial (migraciones/partidas_historial.sql): antes de pisar, la versión anterior se copia');
si('Tabla partidas_historial existe', Migraciones::columnas('partidas_historial') !== null);
check('Aplicar la migración otra vez no agrega nada ni falla', [], Migraciones::aplicar('partidas_historial.sql'));
$pr = fn(int $dia, int $rep, int $dinero) => json_encode(['day' => $dia, 'rep' => $rep, 'money' => $dinero, 'stats' => ['events' => $dia * 2]]);
$hist = fn(int $j) => Db::todas('SELECT rev, datos, dispositivo, motivo FROM partidas_historial WHERE jugador_id = ? ORDER BY id', [$j]);
$fin = fn(int $j) => array_slice($hist($j), -1)[0] ?? [];
[$hc, $JH] = $cuenta();
$hcel = new Nav($URL, 'hcel', $hc);
$hc->post('/api/partida/activar', ['base' => 0, 'dispositivo' => $DA]);
$r = $hc->post('/api/partida', ['datos' => $pr(30, 90, 50000), 'base' => 0, 'dispositivo' => $DA]);
check('Primer guardado (rev 1): no había nada antes -> historial vacío', [200, 1, []], [$hc->http, $r['rev'] ?? null, $hist($JH)]);
$r = $hc->post('/api/partida', ['datos' => $pr(31, 100, 60000), 'base' => 1, 'dispositivo' => $DA]);
check('Segundo guardado (rev 2) -> la rev 1 al historial, tal cual, motivo guardado', [200, 2, [['rev' => 1, 'datos' => $pr(30, 90, 50000), 'dispositivo' => $DA, 'motivo' => 'guardado']]], [$hc->http, $r['rev'] ?? null, $hist($JH)]);
$hc->post('/api/partida', ['datos' => $pr(31, 1, 1), 'base' => 1, 'dispositivo' => $DA]);
check('Un guardado rechazado (409, base vieja) no agrega nada al historial', [409, 1], [$hc->http, count($hist($JH))]);
$r = $hcel->post('/api/partida/activar', ['base' => 2, 'dispositivo' => $DB]);
$r = $hcel->post('/api/partida', ['datos' => $pr(31, 101, 61000), 'base' => 2, 'dispositivo' => $DB]);
check('El celular sigue (más fama) -> rev 2 al historial como guardado', [200, 'guardado'], [$hcel->http, $fin($JH)['motivo'] ?? null]);
// El caso del dueño: otro aparato con una partida de fama 9 pisa la de fama 101 (con "tomar")
$r = $hc->post('/api/partida', ['datos' => $pr(31, 9, 300), 'base' => 3, 'dispositivo' => $DA, 'tomar' => true]);
$u = $hist($JH)[2] ?? [];
check('Guardado con "tomar" -> la versión pisada (fama 101) queda con motivo tomar', [200, 4, 3, 'tomar', $pr(31, 101, 61000)], [$hc->http, $r['rev'] ?? null, $u['rev'] ?? null, $u['motivo'] ?? null, $u['datos'] ?? null]);
$hcel->post('/api/partida/activar', ['base' => 4, 'dispositivo' => $DB]);
$hcel->post('/api/partida', ['datos' => $pr(32, 20, 900), 'base' => 4, 'dispositivo' => $DB]);
$hcel->post('/api/partida', ['datos' => $pr(32, 15, 950), 'base' => 5, 'dispositivo' => $DB]);
$hcel->post('/api/partida', ['datos' => $pr(29, 40, 950), 'base' => 6, 'dispositivo' => $DB]);
check('Menos fama o menos días que la anterior -> motivo retroceso; más fama y más días -> guardado', [[4, 'guardado'], [5, 'retroceso'], [6, 'retroceso']],
    array_map(fn($f) => [(int) $f['rev'], $f['motivo']], array_slice($hist($JH), 3)));

titulo('Historial: lo que se conserva (últimas 30, la más nueva de cada día por 60 días, especiales por 90 días)');
[$rc, $JR] = $cuenta();
$rc->post('/api/partida/activar', ['base' => 0, 'dispositivo' => $DA]);
$rc->post('/api/partida', ['datos' => $pr(1, 5, 100), 'base' => 0, 'dispositivo' => $DA]);
$ahora = time(); $DIA = 86400; $mediodia = strtotime('today 12:00');
$ins = function (int $actualizado, string $motivo, string $marca) use ($JR) {
    Db::q('INSERT INTO partidas_historial (jugador_id, rev, datos, actualizado, dispositivo, guardado_en, motivo) VALUES (?, 0, ?, ?, ?, ?, ?)',
        [$JR, json_encode(['marca' => $marca]), $actualizado, 'dprueba000000001', $actualizado + 60, $motivo]);
};
$ins($ahora - 95 * $DIA, 'tomar', 'tomar95');                       // especial de hace más de 90 días -> se va
$ins($ahora - 85 * $DIA, 'antes_de_restaurar', 'restaurar85');      // especial dentro de 90 días -> queda
$ins($ahora - 80 * $DIA, 'retroceso', 'retroceso80');               // especial dentro de 90 días -> queda
for ($i = 0; $i < 10; $i++) $ins($ahora - 70 * $DIA + $i, 'guardado', 'viejo70');                 // más de 60 días -> se van
for ($d = 50; $d > 40; $d--) for ($i = 0; $i < 3; $i++) $ins($mediodia - $d * $DIA + $i * 60, 'guardado', "dia$d-$i");   // 10 días x 3: queda la más nueva de cada día
for ($i = 0; $i < 40; $i++) $ins($ahora - 3600 + $i, 'guardado', "hoy$i");                           // hoy: quedan las últimas
$marcas = fn() => array_map(fn($f) => json_decode($f['datos'], true)['marca'] ?? ('rev' . $f['rev']), $hist($JR));
check('Antes de guardar: 83 versiones de prueba', 83, count($hist($JR)));
$r = $rc->post('/api/partida', ['datos' => $pr(2, 6, 200), 'base' => 1, 'dispositivo' => $DA]);
$m = $marcas();
check('Un guardado poda en la misma transacción: quedan 42 (30 últimas + 10 días + 2 especiales)', [200, 42], [$rc->http, count($m)]);
check('…las 30 últimas (la rev 1 recién copiada + hoy11…hoy39)', array_merge(array_map(fn($i) => "hoy$i", range(11, 39)), ['rev1']), array_slice($m, -30));
check('…la más nueva de cada uno de los 10 días (dia50-2 … dia41-2)', array_map(fn($d) => "dia$d-2", range(50, 41)), array_values(array_filter($m, fn($x) => str_starts_with($x, 'dia'))));
check('…las especiales de menos de 90 días; ni la de 95 días ni las de hace 70 días', [true, true, false, 0], [in_array('restaurar85', $m, true), in_array('retroceso80', $m, true), in_array('tomar95', $m, true), count(array_filter($m, fn($x) => $x === 'viejo70'))]);
// Muchas versiones seguidas (guardar cada pocos segundos): nunca más de 30 de hoy
for ($i = 0; $i < 35; $i++) $ins($ahora - 1800 + $i, 'retroceso', "esp$i");
Partidas::podar($JR);
check('Especiales: máximo ' . Partidas::HIST_MAX_ESPECIALES . ' por jugador aunque sean recientes (aquí 37 < 100: quedan todas)', 37, count(array_filter($hist($JR), fn($f) => $f['motivo'] !== 'guardado')));
for ($i = 35; $i < 120; $i++) $ins($ahora - 1800 + $i, 'retroceso', "esp$i");
Partidas::podar($JR);
check('…con 122 especiales quedan las 100 más nuevas', 100, count(array_filter($hist($JR), fn($f) => $f['motivo'] !== 'guardado')));

titulo('Restaurar una versión (Centro de Control): rev + 1 con los datos viejos y todos los aparatos cargan la de la nube');
$antes = $enNube($JH);
$hid = (int) Db::valor("SELECT id FROM partidas_historial WHERE jugador_id = ? AND motivo = 'tomar'", [$JH]);   // la de fama 101
check('Antes: la nube en rev 7 (fama 40), el celular activo', [7, $DB], [(int) $antes['rev'], $activo($JH)]);
$e = null; try { Partidas::restaurar($JH, (int) Db::valor('SELECT id FROM partidas_historial WHERE jugador_id = ? LIMIT 1', [$JR]), 'prueba'); } catch (\EnVivo\Fallo $x) { $e = $x->getCode(); }
check('Restaurar una versión de OTRA cuenta -> 404 y nada cambia', [404, 7], [$e, (int) $enNube($JH)['rev']]);
$nh = count($hist($JH));
$r = Partidas::restaurar($JH, $hid, 'control:prueba');
$ahoraN = $enNube($JH);
$ult = Db::fila('SELECT rev, datos, motivo FROM partidas_historial WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$JH]);
check('Restaurar -> rev 8 (7 + 1) con los datos de la versión elegida (fama 101) y dispositivo "panel_restaurar"', [['rev' => 8, 'de_rev' => 3], 8, $pr(31, 101, 61000), Partidas::DISP_PANEL], [$r, (int) $ahoraN['rev'], $ahoraN['datos'], $ahoraN['dispositivo']]);
check('…la que estaba (rev 7) pasó antes al historial con motivo antes_de_restaurar', [$nh + 1, 7, $antes['datos'], 'antes_de_restaurar'], [count($hist($JH)), (int) $ult['rev'], $ult['datos'], $ult['motivo']]);
check('…sin dispositivo activo (partida_activa borrada)', null, $activo($JH));
$au = Db::fila("SELECT quien, detalle FROM auditoria WHERE jugador_id = ? AND accion = 'partida_restaurar' ORDER BY id DESC LIMIT 1", [$JH]);
si('…y quedó en la auditoría del panel (quién, de qué rev a cuál, fama y día)', ($au['quien'] ?? '') === 'control:prueba' && str_contains($au['detalle'] ?? '', 'rev 3') && str_contains($au['detalle'] ?? '', 'como rev 8') && str_contains($au['detalle'] ?? '', 'fama 101'));
// El celular (era el activo, base 7) intenta guardar su partida de fama 40: no pisa la restaurada
$r = $hcel->post('/api/partida', ['datos' => $pr(29, 41, 990), 'base' => 7, 'dispositivo' => $DB]);
check('El aparato que jugaba guarda con su base vieja (7) -> 409 partida_desactualizada, nube rev 8 > base, no es "suya", nadie activo',
    [409, 'partida_desactualizada', 8, Partidas::DISP_PANEL, null], [$hcel->http, $r['codigo'] ?? null, $r['nube']['rev'] ?? null, $r['nube']['guardo'] ?? null, k($r['nube'] ?? [], 'activo')]);
$m = $hcel->get('/api/partida/meta?dispositivo=' . $DB);
si('meta: rev 8 > base 7 (el juego va a "partida más nueva"), guardó el panel (no esta pestaña: nubeEsMia = false)', ($m['rev'] ?? 0) > 7 && ($m['guardo'] ?? '') !== $DB);
$r = $hcel->post('/api/partida/activar', ['base' => 7, 'dispositivo' => $DB]);
check('…tomar la partida con la base vieja -> 409', [409, 'partida_desactualizada'], [$hcel->http, $r['codigo'] ?? null]);
$hc->post('/api/partida', ['datos' => $pr(29, 1, 1)]);
check('…ni un juego viejo (sin base) puede pisarla -> 409', [409, 8], [$hc->http, (int) $enNube($JH)['rev']]);
$g = $hcel->get('/api/partida');
check('"Usar la partida más nueva": baja la restaurada (rev 8, fama 101)', [8, $pr(31, 101, 61000)], [$g['rev'] ?? null, $g['datos'] ?? null]);
$hcel->post('/api/partida/activar', ['base' => 8, 'dispositivo' => $DB]);
check('…la toma (base 8) -> activo el celular', [200, $DB], [$hcel->http, $activo($JH)]);
$r = $hcel->post('/api/partida', ['datos' => $pr(32, 102, 62000), 'base' => 8, 'dispositivo' => $DB]);
check('…y sigue jugando desde ahí -> rev 9; la restaurada (rev 8) al historial', [200, 9, 8, Partidas::DISP_PANEL], [$hcel->http, $r['rev'] ?? null, (int) $fin($JH)['rev'], $fin($JH)['dispositivo']]);
$r = $hc->post('/api/partida', ['datos' => $pr(29, 41, 990), 'base' => 8, 'dispositivo' => $DA]);
check('La otra pestaña (base 8) ya no puede pisarla -> 409', 409, $hc->http);

// =====================================================================
titulo('Borrar la cuenta borra también el dispositivo activo y el historial');
si('Antes de borrar: la cuenta tiene versiones en el historial', count($hist($J)) > 0);
$compu->post('/api/cuenta/borrar', ['clave' => $CLAVE, 'confirmar' => 'BORRAR']);
check('Cuenta borrada -> 200', 200, $compu->http);
check('…sin partida ni dispositivo activo', [false, false], [(bool) $enNube($J), (bool) $activo($J)]);
check('…ni versiones en el historial', 0, count($hist($J)));

// =====================================================================
titulo('Registro de PHP');
$log = (string) @file_get_contents("$TMP/php_errores.log") . (string) @file_get_contents("$TMP/php.log");
check('Sin errores ni avisos de PHP', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO api/i', $log));
si('Se anotó el juego viejo rechazado (para saber cuándo ya no quedan)', str_contains($log, 'EN VIVO partida: juego viejo sin versión rechazado'));

echo "\n----------------------------------------\nResumen pruebas_partida.php — correctas: $ok  ·  fallas: $fallas\n";
exit($fallas ? 1 : 0);
