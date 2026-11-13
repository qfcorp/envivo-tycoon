<?php
// SOLO PRUEBAS (nunca en el servidor del juego). "Tus primeros 7 días" (server/src/RutaNovato.php, RutaNovatoApi.php, la oferta
// de novato en Catalogo.php / Compras.php y el bloque de la pestaña Analítica del Centro de Control, control/lib/novato.php),
// con base SQLite TEMPORAL:
//   A) la clase directa con el reloj congelado (RutaNovato::fijarReloj): cuenta nueva / vieja, días que se abren uno por día
//      real (con 1 de tolerancia), una vez por cuenta, créditos de la tabla, premio grande solo con los 7 días reclamados
//      (entrega personal_intl del camarógrafo de habilidad 4, aviso en el buzón, auditoría), ya_local (sin camarógrafo),
//      empezar (inicio hasta 3 días antes de la cuenta), la ruta termina a los 14 días, ruta apagada, la oferta de novato
//      (72 horas, una vez, no sale en la tienda, entrega fija al aprobar la compra) y el resumen para la analítica.
//   B) por HTTP con php -S + router.php: GET /api/novato (sin sesión 401, con sesión), POST reclamar (sin X-Envivo 403, bien,
//      otra vez 409), POST empezar, /api/estado sin la oferta en la tienda y el panel de Analítica con la tabla de la ruta.
// Uso:  php server/tests/pruebas_novato.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_nov_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
function puerto_libre(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; }
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre();
$USUARIO = 'jefe_nov';
$CLAVE = 'Nv-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '10.1.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Catalogo, Compras, Db, Fallo, Monedero, RutaNovato};

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
RutaNovato::preparar();
$tz = new DateTimeZone('America/Guayaquil');
$ts = fn(string $f) => (new DateTimeImmutable($f, $tz))->getTimestamp();
$num = 0;
$nuevo = function (string $nombre, int $creado) use (&$num): int {
    $num++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, ultimo_ingreso) VALUES (?, ?, ?, ?, 1, ?)',
        ['nov' . $num . '@prueba.example', $nombre, 'x', $creado, $creado]);
    return Db::ultimoId();
};
$T0 = $ts('2026-11-13 10:00:00');
$dia = fn(int $n, string $h = '12:00:00') => $ts(date('Y-m-d', $T0 + ($n - 1) * 86400 + 3600) . ' ' . $h);

// =====================================================================
titulo('A) Cuenta nueva: estado, días que se abren y premios');
RutaNovato::fijarReloj($T0);
$A = $nuevo('Ana Novata', $T0);
$e = RutaNovato::estado($A);
check('Cuenta recién creada: elegible, día 1 de 7, ventana 14, nada reclamado', [true, 1, 7, 14, []], [$e['elegible'], $e['dia'], $e['dias'], $e['ventana'], $e['reclamados']]);
check('La oferta de novato está disponible (72 horas, $0,99, 200 créditos, sin comprar)', [true, $T0 + 72 * 3600, 0.99, 200, false],
    [$e['oferta']['disponible'], $e['oferta']['hasta_t'], $e['oferta']['precio'], $e['oferta']['creditos'], $e['oferta']['comprada']]);
check('Premios fijos: la misma tabla que la clase y el premio grande es el camarógrafo de habilidad 4', [RutaNovato::PREMIOS, 'camarografo', 4],
    [$e['premios'], $e['premio_final']['personal']['rol'], $e['premio_final']['personal']['habilidad']]);
check('El día 3 no se abre el día 1 (409 novato_bloqueado)', [409, 'novato_bloqueado'], falla(fn() => RutaNovato::reclamar($A, 'd3')));
check('Clave inválida -> 400 novato_clave', [400, 'novato_clave'], falla(fn() => RutaNovato::reclamar($A, 'd9')));
check('El premio grande no se abre el día 1', [409, 'novato_bloqueado'], falla(fn() => RutaNovato::reclamar($A, 'final')));
$r = RutaNovato::reclamar($A, 'd1');
check('Día 1: ok, sin créditos (dinero y cables los suma el juego), premio en la respuesta', [true, 0, 400, ['d1']], [$r['ok'], $r['creditos_dados'], $r['premio']['dinero'], $r['estado']['reclamados']]);
check('Día 1 otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => RutaNovato::reclamar($A, 'd1')));
check('Día 2 el día 1 se acepta (1 día de tolerancia por la zona del celular)', true, RutaNovato::reclamar($A, 'd2')['ok']);
RutaNovato::fijarReloj($dia(3, '00:30:00'));
check('A las 00:30 del tercer día real: día 3', 3, RutaNovato::estado($A)['dia']);
$antes = Monedero::saldo($A);
$r = RutaNovato::reclamar($A, 'd3');
check('Día 3: 10 créditos al monedero', [10, $antes + 10], [$r['creditos_dados'], Monedero::saldo($A)]);
check('Movimiento de créditos con motivo novato y ref novato:d3', 1, (int) Db::valor("SELECT COUNT(*) FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'novato' AND ref = 'novato:d3'", [$A]));
RutaNovato::fijarReloj($dia(7));
check('Día 7 con 3 días reclamados: premio grande -> 409 novato_incompleto', [409, 'novato_incompleto'], falla(fn() => RutaNovato::reclamar($A, 'final')));
foreach (['d4', 'd5', 'd6', 'd7'] as $k) RutaNovato::reclamar($A, $k);
$antes = Monedero::saldo($A);
$r = RutaNovato::reclamar($A, 'final');
$en = $r['entregas'][0] ?? [];
check('Premio grande: 50 créditos y la entrega personal_intl del camarógrafo (habilidad 4)', [50, $antes + 50, 'personal_intl', 'camarografo', 4, 'novato:final'],
    [$r['creditos_dados'], Monedero::saldo($A), $en['tipo'] ?? null, $en['item'] ?? null, $en['cantidad'] ?? null, $en['origen'] ?? null]);
check('La entrega queda con nivel semi_senior (sin ventaja en Duelos)', 'semi_senior', (string) Db::valor("SELECT nivel FROM entregas WHERE jugador_id = ? AND origen = 'novato:final'", [$A]));
check('Aviso en el buzón y línea en la auditoría', [1, 1], [(int) Db::valor("SELECT COUNT(*) FROM buzon WHERE jugador_id = ? AND ref = 'novato:final'", [$A]), (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'novato_final' AND jugador_id = ?", [$A])]);
check('Créditos totales de la ruta: 10 + 15 + 25 + 50 = 100', 100, (int) Db::valor('SELECT SUM(creditos) FROM novato_reclamos WHERE jugador_id = ?', [$A]));
check('Premio grande otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => RutaNovato::reclamar($A, 'final')));
check('Estado: final true, 8 reclamos', [true, 8], [RutaNovato::estado($A)['final'], count(RutaNovato::estado($A)['reclamados'])]);

titulo('A2) ya_local, cuentas viejas, fin de la ruta y ruta apagada');
RutaNovato::fijarReloj($T0);
$B = $nuevo('Beto Local', $T0);
RutaNovato::fijarReloj($dia(8));
foreach (['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'] as $k) RutaNovato::reclamar($B, $k, true);
$r = RutaNovato::reclamar($B, 'final', true);
check('Premio grande con ya_local: solo los créditos, sin otra entrega del camarógrafo', [50, [], 0, 1],
    [$r['creditos_dados'], $r['entregas'], (int) Db::valor("SELECT COUNT(*) FROM entregas WHERE jugador_id = ? AND origen = 'novato:final'", [$B]), (int) Db::valor("SELECT ya_local FROM novato_reclamos WHERE jugador_id = ? AND clave = 'final'", [$B])]);
RutaNovato::fijarReloj($dia(15));
check('Día 15: la ruta terminó (no elegible, 409 novato_terminado)', [false, [409, 'novato_terminado']], [RutaNovato::elegible($B), falla(fn() => RutaNovato::reclamar($B, 'd1'))]);
$V = $nuevo('Vieja Cuenta', $T0 - 40 * 86400);
RutaNovato::fijarReloj($T0);
check('Cuenta de hace 40 días: no elegible y sin oferta', [false, false], [RutaNovato::estado($V)['elegible'], RutaNovato::estado($V)['oferta']['disponible']]);
$C = $nuevo('Caro Apagada', $T0);
Ajustes::set('novato_activa', '0');
check('Ajuste novato_activa = 0: nadie la ve ni reclama ni compra la oferta', [false, false, [409, 'novato_terminado']],
    [RutaNovato::estado($C)['elegible'], RutaNovato::estado($C)['oferta']['disponible'], falla(fn() => RutaNovato::reclamar($C, 'd1'))]);
Ajustes::set('novato_activa', '1');
check('Encendida otra vez: elegible', true, RutaNovato::elegible($C));

titulo('A3) empezar: la partida empezó antes que la cuenta');
$D = $nuevo('Dani Empieza', $T0);
$e = RutaNovato::empezar($D, $T0 - 5 * 86400);
check('Inicio pedido 5 días antes: se adelanta solo 3 días (ADELANTO_MAX)', $T0 - 3 * 86400, $e['inicio_t']);
check('El día de la ruta ya es el 4', 4, $e['dia']);
$e = RutaNovato::empezar($D, $T0 - 86400);
check('Una sola vez: un segundo empezar no cambia nada', $T0 - 3 * 86400, $e['inicio_t']);
$F = $nuevo('Fer Reclamó', $T0);
RutaNovato::reclamar($F, 'd1');
check('Con premios ya reclamados no se mueve el inicio', $T0, RutaNovato::empezar($F, $T0 - 86400)['inicio_t']);
$G = $nuevo('Gabi Futuro', $T0);
check('Un inicio después de crear la cuenta o basura no cambia nada', [$T0, $T0], [RutaNovato::empezar($G, $T0 + 500)['inicio_t'], RutaNovato::empezar($G, 'hola')['inicio_t']]);
check('Con el inicio adelantado, la oferta vence 72 h después de ese inicio', $T0 - 3 * 86400 + 72 * 3600, RutaNovato::estado($D)['oferta']['hasta_t']);

titulo('A4) Oferta de novato ($0,99, 72 horas, una vez)');
$p = Catalogo::producto('oferta_novato');
check('En el catálogo: tipo oferta, $0,99, una sola vez, activo (el módulo RutaNovato está)', ['oferta', 0.99, true, true], [$p['tipo'], $p['precio'], $p['una_vez'], $p['activo']]);
check('No sale en la lista general de la tienda (solo en la hoja de la ruta)', false, in_array('oferta_novato', array_column(Catalogo::tienda()['productos'], 'id'), true));
check('Google Play lo vende con el mismo id', 'oferta_novato', Catalogo::productoGoogle('oferta_novato')['id'] ?? null);
$H = $nuevo('Hugo Compra', $T0);
RutaNovato::fijarReloj($T0 + 71 * 3600);
check('A las 71 h se puede comprar (exigirComprable sin error)', [200, null], falla(fn() => Compras::exigirComprable($H, Catalogo::producto('oferta_novato'))));
RutaNovato::fijarReloj($T0 + 72 * 3600 + 1);
check('Pasadas las 72 h -> 409 oferta_no_disponible y ya no se muestra', [[409, 'oferta_no_disponible'], false],
    [falla(fn() => Compras::exigirComprable($H, Catalogo::producto('oferta_novato'))), RutaNovato::estado($H)['oferta']['disponible']]);
check('Una cuenta vieja tampoco la puede comprar', [409, 'oferta_no_disponible'], falla(fn() => Compras::exigirComprable($V, Catalogo::producto('oferta_novato'))));
RutaNovato::fijarReloj($T0 + 3600);
$c = Db::tx(fn() => Compras::insertar($H, Catalogo::producto('oferta_novato'), 'web_plux'));
$antes = Monedero::saldo($H);
check('Aprobar la compra la entrega una vez', true, Compras::aprobar((int) $c['id'], 'prueba'));
$ent = Db::todas("SELECT tipo, item, cantidad FROM entregas WHERE jugador_id = ? AND origen = ? ORDER BY id", [$H, 'compra:' . $c['id']]);
check('Entrega fija: $3.000, 5 cables, 3 baterías y 200 créditos', [[['tipo' => 'dinero', 'item' => '-', 'cantidad' => 3000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]], $antes + 200],
    [array_map(fn($x) => ['tipo' => $x['tipo'], 'item' => $x['item'], 'cantidad' => (int) $x['cantidad']], $ent), Monedero::saldo($H)]);
$e = RutaNovato::estado($H);
check('Después de comprarla: comprada true, ya no disponible y otra compra -> 409 ya_comprado', [true, false, [409, 'ya_comprado']],
    [$e['oferta']['comprada'], $e['oferta']['disponible'], falla(fn() => Compras::exigirComprable($H, Catalogo::producto('oferta_novato')))]);

titulo('A5) Resumen para la analítica (avance por día)');
$hoy = date('Y-m-d', $T0);
$ev = function (string $inst, array $datos) use ($hoy, $T0): void {
    static $k = 0; $k++;
    Db::q("INSERT INTO eventos (instalacion, sesion, clave, jugador_id, nombre, datos, t, dia, recibido) VALUES (?, 's', ?, NULL, 'novato_dia', ?, ?, ?, ?)",
        [$inst, 'k' . $k, json_encode($datos), $T0, $hoy, $T0]);
};
$i1 = str_repeat('a', 32); $i2 = str_repeat('b', 32);
$ev($i1, ['dia' => 1, 'accion' => 'inicio']); $ev($i2, ['dia' => 1, 'accion' => 'inicio']);
$ev($i1, ['dia' => 1, 'accion' => 'completo']); $ev($i1, ['dia' => 1, 'accion' => 'reclamado']); $ev($i2, ['dia' => 1, 'accion' => 'completo']);
$ev($i1, ['dia' => 7, 'accion' => 'final']);
$res = RutaNovato::resumen($hoy, $hoy);
check('Instalaciones: 2 empezaron, día 1 completo 2, reclamado 1, final 1', [2, 2, 1, 1], [$res['instalaciones']['inicio'], $res['instalaciones']['completo'][1], $res['instalaciones']['reclamado'][1], $res['instalaciones']['final']]);
check('Cuentas de ese día: reclamaron el día 1 y una oferta vendida', [true, 1], [$res['cuentas']['reclamado'][1] >= 3, $res['cuentas']['ofertas']]);

// =====================================================================
titulo('B) Por HTTP: /api/novato*, la tienda y el Centro de Control');
RutaNovato::fijarReloj(null);
Db::q('DELETE FROM intentos');
$env = array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PHP_CLI_SERVER_WORKERS' => '3']);
$PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $RAIZ . '/server/tests/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/srv.log', 'a'], 2 => ['file', $TMP . '/srv.log', 'a']], $pp, $RAIZ, $env);
$listo = false;
for ($i = 0; $i < 80 && !$listo; $i++) { $listo = (bool) @fsockopen('127.0.0.1', $P); if (!$listo) usleep(100000); }
check('Arranca el servidor de prueba', true, $listo);

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_nov_' . $n . '_' . getmypid(); @unlink($this->jar); }
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
    public function csrf(): string { return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $this->cuerpo, $m) ? $m[1] : ''; }
    public function entrar(string $u, string $c): int { $this->pedir('GET', '/control/'); return $this->pedir('POST', '/control/', ['accion' => 'entrar', 'csrf' => $this->csrf(), 'usuario' => $u, 'clave' => $c]); }
}
$URL = 'http://127.0.0.1:' . $P;
$j = new Cli($URL, 'jugador');
$j->api('GET', '/novato');
check('GET sin sesión -> 401', 401, $j->http);
$r = $j->api('POST', '/registro', ['email' => 'web.nov@prueba.example', 'nombre' => 'Web Novata', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
$W = (int) ($r['jugador']['id'] ?? 0);
check('Registro por HTTP', true, $W > 0);
check('/api/estado: la tienda general no trae la oferta de novato', false, in_array('oferta_novato', array_column($r['tienda']['productos'] ?? [], 'id'), true));
$r = $j->api('GET', '/novato');
check('GET con sesión: 200, elegible, día 1, oferta disponible', [200, true, 1, true], [$j->http, $r['elegible'] ?? null, $r['dia'] ?? null, $r['oferta']['disponible'] ?? null]);
$j->pedir('POST', '/api/novato/reclamar', '{"clave":"d1"}', ['Content-Type: application/json']);
check('POST sin X-Envivo -> 403', 403, $j->http);
$j->api('GET', '/novato/reclamar');
check('GET a reclamar -> 405', 405, $j->http);
$r = $j->api('POST', '/novato/reclamar', []);
check('Sin clave -> 400 falta_clave', [400, 'falta_clave'], [$j->http, $r['codigo'] ?? null]);
$r = $j->api('POST', '/novato/reclamar', ['clave' => 'd1']);
check('POST reclamar d1: 200 y queda en el estado', [200, ['d1']], [$j->http, $r['estado']['reclamados'] ?? null]);
$r = $j->api('POST', '/novato/reclamar', ['clave' => 'd1']);
check('Otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], [$j->http, $r['codigo'] ?? null]);
$r = $j->api('POST', '/novato/reclamar', ['clave' => 'd5']);
check('Día 5 el primer día -> 409 novato_bloqueado', [409, 'novato_bloqueado'], [$j->http, $r['codigo'] ?? null]);
$k = new Cli($URL, 'otro');
$k->api('POST', '/registro', ['email' => 'web.nov2@prueba.example', 'nombre' => 'Web Novato Dos', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
$r = $k->api('POST', '/novato/empezar', ['inicio' => time() - 2 * 86400]);
check('POST empezar: la partida empezó hace 2 días -> día 3', [200, 3], [$k->http, $r['dia'] ?? null]);

$cc = new Cli($URL, 'panel');
check('Entrar al Centro de Control', 303, $cc->entrar($USUARIO, $CLAVE));
$cc->pedir('GET', '/control/?t=analitica');
check('Pestaña Analítica: bloque "Tus primeros 7 días" con su tabla', [200, true, true], [$cc->http, str_contains($cc->cuerpo, 'id="panel-novato"'), str_contains($cc->cuerpo, 'id="tabla-novato"')]);

$log = (string) @file_get_contents($TMP . '/php_errores.log') . (string) @file_get_contents($TMP . '/srv.log');
check('Sin errores ni avisos de PHP en el servidor', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO (api|control)/i', $log));
if ($FALLAS) echo substr($log, 0, 3000);

echo "\n----------------------------------------\nPruebas de Tus primeros 7 días: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
