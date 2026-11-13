<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Black Friday: VIP 30 días gratis para las primeras 100 cuentas
// (server/src/BlackFriday.php, BlackFridayApi.php, el código en Buzon::canjear y el bloque del Centro de Control
// server/public/control/lib/promo.php), con base SQLite TEMPORAL:
//   A) la clase directa con el reloj congelado (BlackFriday::fijarReloj, el mismo que pone ENVIVO_PRUEBA_AHORA):
//      ventana (pronto / activa / terminada / apagada), una vez por cuenta, VIP nuevo = 30 días y VIP que ya tenía + 30 días
//      (lo mismo que comprar vip30, sin compra ni nivel VIP), aviso en el buzón, auditoría, por aparato, por conexión,
//      cuentas bloqueadas, la palabra BLACKFRIDAY en el buzón (mismo cupo), cupo 100 con 130 cuentas (nunca pasa de 100),
//      y procesos A LA VEZ (cupo 5 con 12 procesos: exactamente 5).
//   B) por HTTP con php -S + router.php: GET /api/promo/black_friday (sin y con sesión, caché), POST .../reclamar
//      (sin sesión 401, sin X-Envivo 403, bien, otra vez 409), /api/buzon/canjear con la palabra, y el Centro de Control
//      (bloque en Buzón y códigos, cambiar fechas y cupo, apagar, CSRF, auditoría, lista de quienes reclamaron).
// Uso:  php server/tests/pruebas_black_friday.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_bf_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
function puerto_libre(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; }
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre();
$USUARIO = 'jefe_bf';
$CLAVE = 'Bf-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '10.1.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, BlackFriday, Buzon, Db, Fallo, Monedero, Vip};

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
$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) { proc_terminate($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});

Db::pdo();
BlackFriday::preparar();
$num = 0;
$nuevo = function (string $nombre) use (&$num): int {
    $num++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, ultimo_ingreso) VALUES (?, ?, ?, ?, 1, ?)',
        ['bf' . $num . '@prueba.example', $nombre, 'x', time(), time()]);
    return Db::ultimoId();
};
$ip = function (int $n): void { $_SERVER['REMOTE_ADDR'] = '10.2.' . intdiv($n, 250) . '.' . ($n % 250 + 1); };
$inst = fn(int $n) => str_pad(dechex($n), 32, 'a', STR_PAD_LEFT);
$vip = fn(int $j) => Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$j]);
$tz = new DateTimeZone('America/Guayaquil');
$ts = fn(string $f) => (new DateTimeImmutable($f, $tz))->getTimestamp();

// =====================================================================
titulo('A) Ajustes por defecto y ventana (reloj congelado)');
$c = BlackFriday::config();
check('Por defecto: encendida, 27/11/2026 00:00 a 30/11/2026 23:59:59 (Ecuador), cupo 100, palabra BLACKFRIDAY, 3 por conexión',
    [true, $ts('2026-11-27 00:00:00'), $ts('2026-11-30 23:59:59'), 100, 'BLACKFRIDAY', 3], [$c['activa'], $c['desde'], $c['hasta'], $c['cupo'], $c['codigo'], $c['ip_max']]);
$A = $nuevo('Ana Black');
BlackFriday::fijarReloj($ts('2026-11-26 23:59:59'));
check('Un segundo antes: fase pronto y no se puede reclamar (409 promo_pronto)', ['pronto', [409, 'promo_pronto']], [BlackFriday::fase(), falla(fn() => BlackFriday::reclamar($A))]);
BlackFriday::fijarReloj($ts('2026-12-01 00:00:00'));
check('Al terminar (01/12 00:00): fase terminada (410 promo_terminada)', ['terminada', [410, 'promo_terminada']], [BlackFriday::fase(), falla(fn() => BlackFriday::reclamar($A))]);
BlackFriday::fijarReloj($ts('2026-11-30 23:59:30'));
check('El último minuto (30/11 23:59:30) todavía cuenta', 'activa', BlackFriday::fase());
Ajustes::set('bf_activa', '0');
check('Apagada desde el panel: fase apagada (409 promo_apagada)', ['apagada', [409, 'promo_apagada']], [BlackFriday::fase(), falla(fn() => BlackFriday::reclamar($A))]);
Ajustes::set('bf_activa', '1');
Db::q('DELETE FROM intentos');
$e = BlackFriday::estado();
check('GET sin sesión: activa, 100 de cupo, quedan 100, 30 días, reclamado null, sin la palabra', [true, 'activa', 100, 0, 100, 30, null, false],
    [$e['activa'], $e['fase'], $e['cupo'], $e['reclamados'], $e['quedan'], $e['dias'], $e['reclamado'], str_contains(json_encode($e), 'BLACKFRIDAY')]);

titulo('A) Reclamar: VIP 30 días (como comprar vip30), una vez por cuenta');
BlackFriday::fijarReloj($ts('2026-11-28 10:00:00'));
check('Sin VIP antes', null, $vip($A));
$t1 = time();
$r = BlackFriday::reclamar($A, 'juego', $inst(1));
check('Reclamar: nuevo, reclamado, 1 reclamado, quedan 99', [true, true, 1, 99], [$r['nuevo'], $r['reclamado'], $r['reclamados'], $r['quedan']]);
check('VIP activo por 30 días desde ahora (Monedero::sumarVip, el mismo de vip30)', true, Monedero::vipActivo($A) && abs((int) $vip($A) - ($t1 + 30 * 86400)) <= 3);
check('No es una compra: sin filas en compras ni nivel VIP', [0, 0], [(int) Db::valor('SELECT COUNT(*) FROM compras WHERE jugador_id = ?', [$A]), Vip::nivel($A)]);
check('Aviso en el buzón (sin premios) con ref de la promo', [1, '[]'], [(int) Db::valor("SELECT COUNT(*) FROM buzon WHERE jugador_id = ? AND ref = 'promo:black_friday_2026'", [$A]),
    (string) Db::valor("SELECT adjuntos_json FROM buzon WHERE jugador_id = ? AND ref = 'promo:black_friday_2026'", [$A])]);
check('Auditoría promo_black_friday_reclamo con el jugador', 1, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'promo_black_friday_reclamo' AND jugador_id = ?", [$A]));
$antes = $vip($A);
check('Otra vez la misma cuenta -> 409 promo_ya_reclamada y el VIP no cambia', [[409, 'promo_ya_reclamada'], $antes], [falla(fn() => BlackFriday::reclamar($A, 'juego', $inst(99))), $vip($A)]);
check('Estado con sesión: reclamado true y vip_hasta', [true, true], [BlackFriday::estado($A)['reclamado'], is_string(BlackFriday::estado($A)['vip_hasta'] ?? null)]);

titulo('A) Si ya tenía VIP, se suman 30 días');
$B = $nuevo('Beto VIP');
Monedero::sumarVip($B, 10);
$antes = (int) $vip($B);
$ip(2);
BlackFriday::reclamar($B, 'juego', $inst(2));
check('VIP que vencía en 10 días ahora vence 30 días después', 30 * 86400, (int) $vip($B) - $antes);
check('Se guarda el VIP de antes en la fila', $antes, (int) Db::valor('SELECT vip_antes FROM promo_reclamos WHERE jugador_id = ?', [$B]));

titulo('A) Contra el abuso: por aparato, por conexión, cuentas bloqueadas');
$C = $nuevo('Caro Mismo Aparato');
$ip(3);
check('Mismo aparato (instalación) con otra cuenta -> 409 promo_dispositivo', [409, 'promo_dispositivo'], falla(fn() => BlackFriday::reclamar($C, 'juego', $inst(2))));
check('Instalación con formato raro se ignora (no rompe)', true, BlackFriday::reclamar($C, 'juego', '../../etc')['nuevo']);
$_SERVER['REMOTE_ADDR'] = '10.9.9.9';
$X = [$nuevo('Ip Uno'), $nuevo('Ip Dos'), $nuevo('Ip Tres'), $nuevo('Ip Cuatro')];
foreach (array_slice($X, 0, 3) as $k => $j) BlackFriday::reclamar($j, 'juego', $inst(100 + $k));
check('Cuarta cuenta desde la misma conexión -> 409 promo_conexion', [409, 'promo_conexion'], falla(fn() => BlackFriday::reclamar($X[3], 'juego', $inst(200))));
Ajustes::set('bf_ip_max', '4');
check('Con 4 por conexión (panel) ya puede', true, BlackFriday::reclamar($X[3], 'juego', $inst(200))['nuevo']);
$D = $nuevo('Dani Baneado'); Db::q("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$D]);
$ip(4);
check('Cuenta baneada -> 403 cuenta_baneada', [403, 'cuenta_baneada'], falla(fn() => BlackFriday::reclamar($D)));
$_SERVER['REMOTE_ADDR'] = '10.8.8.8';
$L = $nuevo('Lucho Insistente');
$cods = [];
for ($i = 0; $i < BlackFriday::INTENTOS_CUENTA + 1; $i++) $cods[] = falla(fn() => BlackFriday::reclamar($L, 'juego', $inst(300)))[1];
check('Muchos intentos seguidos de una cuenta -> 429 limite_intentos', 'limite_intentos', end($cods));
Db::q('DELETE FROM intentos');

titulo('A) La palabra BLACKFRIDAY en el buzón saca del mismo cupo');
$E = $nuevo('Eli Código');
$ip(5);
$n0 = BlackFriday::reclamados();
$r = Buzon::canjear($E, ' black-friday ', 'juego', $inst(5));
check('Canjear "black-friday": ok, mensaje del buzón, promo nuevo, +1 en el cupo', [true, 'BLACKFRIDAY', true, true, $n0 + 1],
    [$r['ok'], $r['codigo'], is_array($r['mensaje'] ?? null), $r['promo']['nuevo'] ?? null, BlackFriday::reclamados()]);
check('Canal "codigo" y VIP activo', ['codigo', true], [(string) Db::valor('SELECT canal FROM promo_reclamos WHERE jugador_id = ?', [$E]), Monedero::vipActivo($E)]);
check('La palabra otra vez -> 409 promo_ya_reclamada', [409, 'promo_ya_reclamada'], falla(fn() => Buzon::canjear($E, 'BLACKFRIDAY')));
check('Después del botón, la palabra tampoco (una vez por cuenta)', [409, 'promo_ya_reclamada'], falla(fn() => Buzon::canjear($A, 'BLACKFRIDAY')));
check('No suma intentos fallidos de códigos del buzón', 0, (int) Db::valor("SELECT COALESCE(SUM(total), 0) FROM intentos WHERE clave LIKE 'canje:%'"));
check('No crea un código en buzon_codigos', 0, (int) Db::valor("SELECT COUNT(*) FROM buzon_codigos WHERE codigo = 'BLACKFRIDAY'"));
Ajustes::set('bf_codigo', '');
check('Sin palabra (vacía): BLACKFRIDAY es un código que no existe', [404, 'codigo_invalido'], falla(fn() => Buzon::canjear($nuevo('Fer'), 'BLACKFRIDAY')));
Ajustes::set('bf_codigo', 'BLACKFRIDAY');
Db::q('DELETE FROM intentos');

titulo('A) Cupo de 100 con 130 cuentas: nunca más de 100');
$ya = BlackFriday::reclamados();
$ok = 0; $agot = 0; $otros = [];
for ($i = 0; $i < 130; $i++) {
    $j = $nuevo('Masa ' . $i);
    $ip(1000 + $i);
    try { BlackFriday::reclamar($j, 'juego', $inst(1000 + $i)); $ok++; }
    catch (Fallo $e) { if (($e->extra['codigo'] ?? '') === 'promo_agotada') $agot++; else $otros[] = $e->extra['codigo'] ?? $e->getMessage(); }
}
check('Entraron justo las que faltaban para 100 y las demás -> promo_agotada', [100 - $ya, 130 - (100 - $ya), []], [$ok, $agot, $otros]);
check('En la tabla: exactamente 100', 100, BlackFriday::reclamados());
$e = BlackFriday::estado();
check('Fase agotada, quedan 0', ['agotada', 0, 100, false], [$e['fase'], $e['quedan'], $e['reclamados'], $e['activa']]);
check('La palabra cuando se agotó -> 410 promo_agotada', [410, 'promo_agotada'], falla(fn() => Buzon::canjear($nuevo('Tarde'), 'BLACKFRIDAY')));

titulo('A) Guardar desde el panel: revisa los datos');
check('Cupo menor a los ya reclamados -> 400 cupo_invalido', [400, 'cupo_invalido'], falla(fn() => BlackFriday::guardar(['cupo' => 50], 'prueba')));
check('Hasta antes de desde -> 400 fecha_invalida', [400, 'fecha_invalida'], falla(fn() => BlackFriday::guardar(['desde' => $ts('2026-11-30 00:00:00'), 'hasta' => $ts('2026-11-27 00:00:00')], 'prueba')));
check('Palabra con signos -> 400 codigo_formato', [400, 'codigo_formato'], falla(fn() => BlackFriday::guardar(['codigo' => 'NO!'], 'prueba')));
Buzon::crearCodigo(['codigo' => 'YAEXISTE', 'titulo' => 'x', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 1]]], 'prueba');
check('Palabra que ya es un código del buzón -> 409 codigo_repetido', [409, 'codigo_repetido'], falla(fn() => BlackFriday::guardar(['codigo' => 'yaexiste'], 'prueba')));
$c = BlackFriday::guardar(['cupo' => 120], 'control:prueba');
check('Subir el cupo a 120: vuelve a estar activa con 20 libres; auditoría promo_black_friday', [120, 'activa', 20, true],
    [$c['cupo'], BlackFriday::fase(), BlackFriday::estado()['quedan'], (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'promo_black_friday' AND detalle LIKE '%bf_cupo:%-> 120%'")]);
BlackFriday::fijarReloj(null);

titulo('A) A la vez: cupo 5 con 12 procesos (cuentas distintas) -> exactamente 5');
Db::q("DELETE FROM promo_reclamos");
Db::q('DELETE FROM intentos');
BlackFriday::guardar(['cupo' => 5, 'desde' => time() - 3600, 'hasta' => time() + 3600, 'ip_max' => 100], 'prueba');
$script = $TMP . '/reclamar.php';
file_put_contents($script, '<?php putenv("ENVIVO_CONFIG=' . $TMP . '/config.env"); $_SERVER["REMOTE_ADDR"] = "10.7.0." . $argv[2]; require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . '; '
    . 'usleep(random_int(0, 3000)); try { \EnVivo\BlackFriday::reclamar((int) $argv[1], "juego", str_repeat("b", 30) . sprintf("%02d", $argv[2])); echo "si"; } catch (\EnVivo\Fallo $e) { echo $e->extra["codigo"] ?? "?"; }');
$procs = [];
for ($i = 0; $i < 12; $i++) { $j = $nuevo('Hilo ' . $i); $pr = proc_open(['php', $script, (string) $j, (string) ($i + 10)], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pp); $procs[] = [$pr, $pp[1], $pp[2]]; }
$salidas = [];
foreach ($procs as [$pr, $o, $e2]) { $salidas[] = trim(stream_get_contents($o)) . trim(stream_get_contents($e2)); proc_close($pr); }
$cuenta = array_count_values($salidas);
check('12 procesos a la vez: 5 "si" y 7 promo_agotada', [5, 7], [$cuenta['si'] ?? 0, $cuenta['promo_agotada'] ?? 0]);
check('…y en la tabla exactamente 5', 5, BlackFriday::reclamados());
$Mx = $nuevo('Doble Toque');
Db::q("DELETE FROM promo_reclamos"); Db::q('DELETE FROM intentos');
$procs = [];
for ($i = 0; $i < 4; $i++) { $pr = proc_open(['php', $script, (string) $Mx, (string) ($i + 40)], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pp); $procs[] = [$pr, $pp[1], $pp[2]]; }
$salidas = [];
foreach ($procs as [$pr, $o, $e2]) { $salidas[] = trim(stream_get_contents($o)) . trim(stream_get_contents($e2)); proc_close($pr); }
sort($salidas);
check('La misma cuenta 4 veces a la vez: 1 "si" y 3 promo_ya_reclamada', ['promo_ya_reclamada', 'promo_ya_reclamada', 'promo_ya_reclamada', 'si'], $salidas);
check('…y un solo +30 días de VIP', true, abs((int) $vip($Mx) - (time() + 30 * 86400)) <= 10);

// =====================================================================
titulo('B) Por HTTP: /api/promo/black_friday*, el código y el Centro de Control');
Db::q("DELETE FROM promo_reclamos"); Db::q('DELETE FROM intentos');
BlackFriday::guardar(['cupo' => 100, 'ip_max' => 3, 'desde' => time() - 3600, 'hasta' => time() + 86400], 'prueba');
$env = array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PHP_CLI_SERVER_WORKERS' => '3']);
$PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $RAIZ . '/server/tests/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/srv.log', 'a'], 2 => ['file', $TMP . '/srv.log', 'a']], $pp, $RAIZ, $env);
$listo = false;
for ($i = 0; $i < 80 && !$listo; $i++) { $listo = (bool) @fsockopen('127.0.0.1', $P); if (!$listo) usleep(100000); }
check('Arranca el servidor de prueba', true, $listo);

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_bf_' . $n . '_' . getmypid(); @unlink($this->jar); }
    public function __destruct() { @unlink($this->jar); }
    public function pedir(string $m, string $ruta, mixed $datos = null, array $cab = []): int {
        $ch = curl_init($this->base . $ruta);
        $this->cab = [];
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 60,
            CURLOPT_HEADERFUNCTION => function ($c, $h) { $p = explode(':', $h, 2); if (count($p) === 2) $this->cab[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); }]);
        if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($datos) ? $datos : http_build_query($datos));
        $this->cuerpo = (string) curl_exec($ch);
        $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lugar = (string) ($this->cab['location'] ?? '');
        return $this->http;
    }
    public function api(string $m, string $ruta, ?array $j = null): array {
        $this->pedir($m, '/api' . $ruta, $j === null ? null : json_encode($j), ['Content-Type: application/json', 'X-Envivo: 1']);
        return json_decode($this->cuerpo, true) ?: [];
    }
    public function tiene(string $t): bool { return str_contains($this->cuerpo, $t); }
    public function csrf(): string { return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $this->cuerpo, $m) ? $m[1] : ''; }
    public function entrar(string $u, string $c): int { $this->pedir('GET', '/control/'); return $this->pedir('POST', '/control/', ['accion' => 'entrar', 'csrf' => $this->csrf(), 'usuario' => $u, 'clave' => $c]); }
    public function accion(array $d, string $desde = '/control/?t=buzon'): string {
        $this->pedir('GET', $desde);
        $d += ['csrf' => $this->csrf(), 'volver' => $desde];
        $this->pedir('POST', '/control/', $d);
        if ($this->http !== 303) return 'HTTP ' . $this->http;
        $this->pedir('GET', $this->lugar);
        return preg_match('/<div class="aviso aviso-(ok|error)" id="aviso"[^>]*>(.*?)<\/div>/s', $this->cuerpo, $m) ? $m[1] . ': ' . html_entity_decode($m[2], ENT_QUOTES) : 'sin aviso';
    }
}
$URL = 'http://127.0.0.1:' . $P;
$j = new Cli($URL, 'jugador');
$r = $j->api('GET', '/promo/black_friday');
check('GET sin sesión: 200, activa, quedan 100, reclamado null, caché pública 15 s', [200, true, 100, null, 'public, max-age=15'],
    [$j->http, $r['activa'] ?? null, $r['quedan'] ?? null, array_key_exists('reclamado', $r) ? $r['reclamado'] : 'falta', $j->cab['cache-control'] ?? '']);
$r = $j->api('POST', '/promo/black_friday/reclamar', []);
check('POST sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], [$j->http, $r['codigo'] ?? null]);
$r = $j->api('POST', '/registro', ['email' => 'web.bf@prueba.example', 'nombre' => 'Web BF', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
$W = (int) ($r['jugador']['id'] ?? 0);
check('Registro por HTTP', true, $W > 0);
$r = $j->api('GET', '/promo/black_friday');
check('GET con sesión: reclamado false y caché privada', [false, 'private, max-age=15'], [$r['reclamado'] ?? null, $j->cab['cache-control'] ?? '']);
$j->pedir('POST', '/api/promo/black_friday/reclamar', '{}', ['Content-Type: application/json']);
check('POST sin X-Envivo -> 403', 403, $j->http);
$j->api('GET', '/promo/black_friday/reclamar');
check('GET a reclamar -> 405', 405, $j->http);
$r = $j->api('POST', '/promo/black_friday/reclamar', ['instalacion' => str_repeat('c', 32)]);
check('POST reclamar: 200, nuevo, reclamado, quedan 99', [200, true, true, 99], [$j->http, $r['nuevo'] ?? null, $r['reclamado'] ?? null, $r['quedan'] ?? null]);
$e = $j->api('GET', '/estado');
check('/api/estado: vip_activo true', true, $e['vip_activo'] ?? null);
$r = $j->api('POST', '/promo/black_friday/reclamar', ['instalacion' => str_repeat('c', 32)]);
check('Otra vez -> 409 promo_ya_reclamada', [409, 'promo_ya_reclamada'], [$j->http, $r['codigo'] ?? null]);
$k = new Cli($URL, 'otro');
$k->api('POST', '/registro', ['email' => 'web.bf2@prueba.example', 'nombre' => 'Web BF Dos', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
$r = $k->api('POST', '/buzon/canjear', ['codigo' => 'blackfriday', 'canal' => 'web']);
check('Palabra por /api/buzon/canjear (web): ok, mensaje, quedan 98, canal web', [200, true, 98, 'web'],
    [$k->http, isset($r['mensaje']['id']), $r['promo']['quedan'] ?? null, (string) Db::valor("SELECT canal FROM promo_reclamos ORDER BY id DESC LIMIT 1")]);
$r = $k->api('POST', '/buzon/canjear', ['codigo' => 'blackfriday', 'instalacion' => str_repeat('c', 32)]);
check('Otra vez la palabra -> 409 promo_ya_reclamada', [409, 'promo_ya_reclamada'], [$k->http, $r['codigo'] ?? null]);

// Centro de Control
$cc = new Cli($URL, 'panel');
check('Entrar al Centro de Control', 303, $cc->entrar($USUARIO, $CLAVE));
$cc->pedir('GET', '/control/?t=buzon');
check('Bloque Black Friday en Buzón y códigos: EN CURSO, 2 / 100, la palabra y la lista', [200, true, true, true, true, true],
    [$cc->http, $cc->tiene('id="panel-black-friday"'), $cc->tiene('EN CURSO'), $cc->tiene('2 / 100'), $cc->tiene('BLACKFRIDAY'), $cc->tiene('web.bf2@prueba.example')]);
check('Sin CSRF -> 403', 403, $cc->pedir('POST', '/control/', ['accion' => 'promo_bf_guardar', 'csrf' => 'mal']));
$av = $cc->accion(['accion' => 'promo_bf_guardar', 'activa' => '1', 'desde' => '2026-11-27T00:00', 'hasta' => '2026-11-30T23:59', 'cupo' => '150', 'codigo' => 'bf-2026', 'ip_max' => '2']);
$releer = fn() => Ajustes::set('prueba_releer', (string) microtime(true));   // Ajustes guarda en memoria: así lee lo que cambió el panel
$releer();
$c = BlackFriday::config();
check('Guardar desde el panel: fechas, cupo 150, palabra BF2026, 2 por conexión', [true, $ts('2026-11-27 00:00:00'), $ts('2026-11-30 23:59:59'), 150, 'BF2026', 2],
    [str_starts_with($av, 'ok: Black Friday guardado'), $c['desde'], $c['hasta'], $c['cupo'], $c['codigo'], $c['ip_max']]);
$av = $cc->accion(['accion' => 'promo_bf_guardar', 'desde' => '2026-11-27T00:00', 'hasta' => '2026-11-30T23:59', 'cupo' => '150', 'codigo' => 'BF2026', 'ip_max' => '2']);
$releer();
check('Apagar (sin la casilla): apagada; el juego ve fase apagada', [true, false, 'apagada'], [str_contains($av, 'apagado'), BlackFriday::config()['activa'], $j->api('GET', '/promo/black_friday')['fase'] ?? null]);
check('Cupo inválido desde el panel -> aviso de error', true, str_starts_with($cc->accion(['accion' => 'promo_bf_guardar', 'activa' => '1', 'desde' => '2026-11-27T00:00', 'hasta' => '2026-11-30T23:59', 'cupo' => '1', 'codigo' => 'BF2026', 'ip_max' => '2']), 'error:'));
check('Auditoría: los cambios del panel (promo_black_friday) con quien control:', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'promo_black_friday' AND quien LIKE 'control:%'"));

$log = (string) @file_get_contents($TMP . '/php_errores.log') . (string) @file_get_contents($TMP . '/srv.log');
check('Sin errores ni avisos de PHP en el servidor', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO (api|control)/i', $log));
if ($FALLAS) echo substr($log, 0, 3000);

echo "\n----------------------------------------\nPruebas de Black Friday: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
