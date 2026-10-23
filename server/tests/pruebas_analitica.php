<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Analítica propia (server/src/Analitica.php, AnaliticaApi.php,
// bin/analitica.php y la pestaña /control/?t=analitica) con una base SQLite TEMPORAL y el reloj congelado:
//   1. recibir(): sobre válido o no, nombres y datos revisados, tope de 50 por lote, hora del celular corregida,
//      reintentos sin duplicar, país (CF-IPCountry), instalación con su primer día y la cuenta (de la sesión).
//   2. agregar() sobre datos SINTÉTICOS con resultados calculados a mano: DAU/WAU/MAU, instalaciones nuevas,
//      retención D1/D7/D30 por cohorte de instalación y de cuenta (y NULL si el día no terminó), embudo de la guía,
//      primer evento en 10 minutos, sesiones y duración (tope 4 h), pagadores, compras e ingresos de la tabla compras,
//      todo por plataforma y país ('*' = todos); idempotente (correrlo dos veces da lo mismo).
//   3. Retención de 90 días y la cuenta borrada (los eventos dejan de apuntar a ella).
//   4. HTTP (php -S + router_control.php): POST /api/eventos con X-Envivo, con sendBeacon (Sec-Fetch-Site / Origin),
//      desde otro sitio (403), GET (405), muy grande (413), límite por instalación (429), sesión -> jugador_id, país.
//   5. Centro de Control: la pestaña se ve con los números correctos, los colores de las metas, filtros, CSRF en
//      "Recalcular ahora" (y queda en la auditoría). Con Playwright: capturas a 390 px y escritorio, sin desborde.
// Uso:  php server/tests/pruebas_analitica.php        (GUARDAR_TMP=1 deja los archivos; CAPTURAS=carpeta)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$SRV = $RAIZ . '/server';
$TMP = sys_get_temp_dir() . '/envivo_analitica_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$CAPTURAS = getenv('CAPTURAS') ?: $RAIZ . '/tests/capturas';
@mkdir($CAPTURAS, 0777, true);
$USUARIO = 'jefe_analitica';
$CLAVE = 'An-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
function puerto_libre(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; }
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre();
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P\n"
    . "ENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Analitica, Db, Fallo};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
function falla(callable $f): array { try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; } }
$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) proc_terminate($p);
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});

Db::pdo();
$Z = new DateTimeZone('America/Guayaquil');
$ts = fn(string $f) => (new DateTimeImmutable($f, $Z))->getTimestamp();
$hex = fn(int $n) => bin2hex(random_bytes(intdiv($n, 2)));
$INST = [];   // nombre => id de instalación
$inst = function (string $n) use (&$INST, $hex): string { return $INST[$n] ??= $hex(32); };
$SES = [];
$ses = function (string $n) use (&$SES, $hex): string { return $SES[$n] ??= $hex(16); };
/** Manda un lote "como el juego" con el reloj en $cuando. */
$lote = function (string $i, string $s, string $cuando, array $eventos, ?int $jugador = null, string $plat = 'web', string $pais = 'EC') use ($inst, $ses, $ts, $hex) {
    $t = $ts($cuando);
    $max = $t;
    foreach ($eventos as $ev) if (($ev[2] ?? null) !== null) $max = max($max, $ts($ev[2]));
    Analitica::fijarReloj($max + 5);   // el lote sale apenas pasa el último evento
    $e = [];
    foreach ($eventos as $k => $ev) $e[] = ['n' => $ev[0], 't' => (($ev[2] ?? null) !== null ? $ts($ev[2]) : $t) * 1000, 'k' => $hex(12), 'd' => $ev[1] ?? []];
    return Analitica::recibir(['i' => $inst($i), 's' => $ses($s), 'p' => $plat, 'v' => '16', 'l' => 'es', 'e' => $e], $jugador, $pais);
};
$jug = function (string $email, string $cuando) use ($ts): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id) VALUES (?, ?, ?, ?, 1)', [$email, $email, 'x', $ts($cuando)]);
    return Db::ultimoId();
};
$compra = function (int $j, float $total, string $estado, string $cuando, string $canal = 'web_plux') use ($ts): void {
    static $n = 0; $n++;
    Db::q('INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en, canal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['tok' . $n . bin2hex(random_bytes(4)), $j, 'creditos_100', $total, round($total / 1.15, 2), round($total - $total / 1.15, 2), $estado, $ts($cuando) - 60, $estado === 'pagado' ? $ts($cuando) : null, $canal]);
};

// =====================================================================
titulo('1. recibir(): revisión del lote');
$x = fn(array $in) => falla(fn() => Analitica::recibir($in, null, ''));
Analitica::fijarReloj($ts('2026-10-20 12:00'));
$bien = ['i' => $hex(32), 's' => $hex(16), 'p' => 'web', 'e' => []];
check('Sobre sin instalación -> 400 analitica_invalida', [400, 'analitica_invalida'], $x(['s' => $hex(16), 'e' => []]));
check('Instalación con letras raras -> 400', [400, 'analitica_invalida'], $x(['i' => str_repeat('Z', 32)] + $bien));
check('Sesión corta -> 400', [400, 'analitica_invalida'], $x(['s' => 'abc'] + $bien));
check('Eventos que no son lista -> 400', [400, 'analitica_invalida'], $x(['e' => ['a' => 1]] + $bien));
check('Lote vacío pero bien armado -> ok', [200, null], $x($bien));
$i0 = $hex(32);
$r = Analitica::recibir(['i' => $i0, 's' => $hex(16), 'p' => 'raro', 'v' => '1.2<script>', 'l' => 'es-EC', 'e' => [
    ['n' => 'app_abierta', 't' => $ts('2026-10-20 11:59') * 1000, 'k' => 'aaaa0001', 'd' => ['origen' => 'web', 'idioma' => 'es', "malo\x01" => 1, 'largo' => str_repeat('x', 200), 'num' => 1.123456, 'obj' => ['no' => 1]]],
    ['n' => 'evento_raro', 't' => time() * 1000, 'k' => 'aaaa0002'],                 // nombre desconocido
    ['n' => 'm_modulo_x', 'k' => 'aaaa0003'],                                         // nombre de módulo; sin hora -> la del servidor
    ['n' => 'tienda_abierta', 't' => $ts('2026-11-20 12:00') * 1000, 'k' => 'aaaa0004'],   // hora del futuro -> la del servidor
    ['n' => 'tienda_abierta', 't' => $ts('2026-10-01 12:00') * 1000, 'k' => 'aaaa0005'],   // hace más de 7 días -> la del servidor
    ['n' => 'tienda_abierta', 'k' => 'X'],                                             // clave mala
    'no-es-objeto',
]], null, 'ec');
check('Lote mezclado: 4 buenos, 3 descartados', ['ok' => true, 'aceptados' => 4, 'rechazados' => 3], $r);
$f = Db::fila('SELECT * FROM eventos WHERE instalacion = ? AND clave = ?', [$i0, 'aaaa0001']);
check('Datos revisados: sin campos raros ni objetos, textos de 80, números redondeados', ['origen' => 'web', 'idioma' => 'es', 'largo' => str_repeat('x', 80), 'num' => 1.1235], json_decode((string) $f['datos'], true));
check('Hora del celular válida se respeta (y su día)', [$ts('2026-10-20 11:59'), '2026-10-20'], [(int) $f['t'], $f['dia']]);
check('Hora del futuro / de hace más de 7 días / sin hora -> la del servidor', [$ts('2026-10-20 12:00'), $ts('2026-10-20 12:00'), $ts('2026-10-20 12:00')],
    array_map(fn($k) => (int) Db::valor('SELECT t FROM eventos WHERE instalacion = ? AND clave = ?', [$i0, $k]), ['aaaa0004', 'aaaa0005', 'aaaa0003']));
$fi = Db::fila('SELECT * FROM analitica_instalaciones WHERE instalacion = ?', [$i0]);
check('Instalación: plataforma rara -> web, país en mayúsculas, versión limpia, idioma', ['web', 'EC', '1.2script', 'es-EC', '2026-10-20'], [$fi['plataforma'], $fi['pais'], $fi['version'], $fi['idioma'], $fi['primer_dia']]);
$r = Analitica::recibir(['i' => $i0, 's' => $hex(16), 'e' => [['n' => 'app_abierta', 'k' => 'aaaa0001'], ['n' => 'app_abierta', 'k' => 'aaaa0006']]], null, 'XX');
check('Reintento con la misma clave no duplica (1 nuevo de 2)', 1, $r['aceptados']);
check('País XX (desconocido para Cloudflare) no pisa el país', 'EC', Db::valor('SELECT pais FROM analitica_instalaciones WHERE instalacion = ?', [$i0]));
$muchos = array_map(fn($n) => ['n' => 'tienda_abierta', 'k' => sprintf('b%07d', $n)], range(1, 60));
check('Más de 50 eventos en un lote: se guardan 50 y se descartan 10', ['ok' => true, 'aceptados' => 50, 'rechazados' => 10], Analitica::recibir(['i' => $hex(32), 's' => $hex(16), 'e' => $muchos], null, ''));
check('País: solo 2 letras (T1 = Tor y XX no valen)', ['EC', null, null, null], [Analitica::pais('ec'), Analitica::pais('XX'), Analitica::pais('T1'), Analitica::pais('ECU')]);
$i1 = $hex(32);
Analitica::recibir(['i' => $i1, 's' => $hex(16), 'e' => [['n' => 'app_abierta', 'k' => 'cccc0001', 't' => $ts('2026-10-19 10:00') * 1000]]], null, '');
Analitica::recibir(['i' => $i1, 's' => $hex(16), 'e' => [['n' => 'app_abierta', 'k' => 'cccc0002', 't' => $ts('2026-10-15 10:00') * 1000]]], 77, 'PE');
$fi = Db::fila('SELECT * FROM analitica_instalaciones WHERE instalacion = ?', [$i1]);
check('Un evento más viejo que llega después corrige el primer día; el país y la cuenta se completan', ['2026-10-15', '2026-10-19', 'PE', 77], [$fi['primer_dia'], $fi['ultimo_dia'], $fi['pais'], (int) $fi['jugador_id']]);
// Se limpia para los datos sintéticos
Db::q('DELETE FROM eventos'); Db::q('DELETE FROM analitica_instalaciones');

// =====================================================================
titulo('2. Datos sintéticos: cohorte del 10/09/2026 (resultados calculados a mano)');
$C = '2026-09-10';
$d = fn(int $n) => Analitica::mover($C, $n);
$J1 = $jug('j1@prueba.example', "$C 10:20");    // cuenta de la instalación A (web, EC)
$J2 = $jug('j2@prueba.example', "$C 18:00");    // cuenta de la instalación E (android, PE)
$J3 = $jug('j3@prueba.example', "$C 23:30");    // cuenta sin analítica (juego viejo)
$J4 = $jug('j4@prueba.example', $d(1) . ' 09:00');
$GUIA = ['intro', 'clientes', 'evento', 'auto', 'aire', 'elegir', 'seguir', 'terminar', 'resultado', 'fin'];
$pasos = fn(array $ps, string $hora) => array_map(fn($p) => ['tutorial_paso', ['paso' => $p], null], $ps);
// A: guía completa, primer evento a los 5 min, vuelve D1, D7 y D30. Sesión con dos sesion_fin (300 y 600 s).
$lote('A', 'A1', "$C 10:00", [['app_abierta', ['origen' => 'web', 'idioma' => 'es', 'version' => '16']], ...$pasos($GUIA, ''), ['evento_iniciado', ['tipo' => 'barrial'], "$C 10:02"], ['evento_terminado', ['tipo' => 'barrial', 'estrellas' => 4], "$C 10:05"]]);
$lote('A', 'A1', "$C 10:20", [['cuenta_creada', []], ['sesion_fin', ['duracion_s' => 300]]], $J1);
$lote('A', 'A1', "$C 10:30", [['sesion_fin', ['duracion_s' => 600]]], $J1);
foreach ([1, 7, 30] as $n) $lote('A', 'A' . $n, $d($n) . ' 12:00', [['app_abierta', []]], $J1);
// B: guía hasta Clientes, primer evento al día siguiente; vuelve D1. sesion_fin 120 s.
$lote('B', 'B1', "$C 11:00", [['app_abierta', []], ...$pasos(['intro', 'clientes'], ''), ['sesion_fin', ['duracion_s' => 120]]]);
$lote('B', 'B2', $d(1) . ' 08:00', [['app_abierta', []], ['evento_terminado', ['estrellas' => 3]]]);
// C: solo la intro; vuelve D7 (sin sesion_fin)
$lote('C', 'C1', "$C 12:00", [['app_abierta', []], ...$pasos(['intro'], '')]);
$lote('C', 'C7', $d(7) . ' 12:00', [['app_abierta', []]]);
// D: abre y no vuelve nunca
$lote('D', 'D1', "$C 13:00", [['app_abierta', []]]);
// E: android de Perú, guía hasta "al aire", primer evento a los 15 min, sesión de 99999 s (tope 4 h); vuelve D1 y D30
$lote('E', 'E1', "$C 17:50", [['app_abierta', ['origen' => 'android']], ...$pasos(['intro', 'clientes', 'evento', 'auto', 'aire'], ''), ['evento_terminado', ['estrellas' => 2], "$C 18:05"], ['sesion_fin', ['duracion_s' => 99999]]], null, 'android', 'PE');
$lote('E', 'E1', "$C 18:06", [['cuenta_creada', []]], $J2, 'android', 'PE');
$lote('E', 'E2', $d(1) . ' 18:00', [['app_abierta', []]], $J2, 'android', 'PE');
$lote('E', 'E30', $d(30) . ' 18:00', [['app_abierta', []]], $J2, 'android', 'PE');
// F: instalación del día siguiente (android sin país)
$lote('F', 'F1', $d(1) . ' 20:00', [['app_abierta', []]], $J4, 'android', '');
// Compras del día C: J1 4,99 + 1,99 (web), J2 9,99 (Google Play), J3 2,00 (Google Play, sin analítica); una rechazada y una revertida no cuentan
$compra($J1, 4.99, 'pagado', "$C 10:40");
$compra($J1, 1.99, 'pagado', "$C 15:00");
$compra($J2, 9.99, 'pagado', "$C 19:00", 'google_play');
$compra($J3, 2.00, 'pagado', "$C 23:40", 'google_play');
$compra($J1, 50.00, 'rechazado', "$C 16:00");
$compra($J2, 30.00, 'revertido', "$C 20:00", 'google_play');
$compra($J4, 3.00, 'pagado', $d(1) . ' 21:00', 'google_play');

Analitica::fijarReloj($ts('2026-10-20 00:40'));
$HOY = '2026-10-20';
$r = Analitica::agregar(45, $HOY);
check('agregar(45): días del 06/09 al 20/10', ['dias' => 45, 'desde' => '2026-09-06', 'hasta' => $HOY], ['dias' => $r['dias'], 'desde' => $r['desde'], 'hasta' => $r['hasta']]);
$dia = fn(string $dd, string $p = '*', string $c = '*') => Db::fila('SELECT * FROM analitica_dia WHERE dia = ? AND plataforma = ? AND pais = ?', [$dd, $p, $c]);
$v = fn(?array $f, array $k) => $f ? array_map(fn($x) => is_numeric($f[$x]) && str_contains((string) $f[$x], '.') ? (float) $f[$x] : (int) $f[$x], array_combine($k, $k)) : null;
$K = ['dau', 'wau', 'mau', 'nuevas', 'cuentas_nuevas', 'sesiones', 'sesiones_medidas', 'duracion_total_s', 'pagadores', 'compras', 'primer_evento_10m'];
check("Día $C (todos): DAU 5, 5 nuevas, 3 cuentas, 5 sesiones (3 medidas: 600 + 120 + 14400 s), 3 pagadores, 4 compras, 1 primer evento ≤ 10 min",
    ['dau' => 5, 'wau' => 5, 'mau' => 5, 'nuevas' => 5, 'cuentas_nuevas' => 3, 'sesiones' => 5, 'sesiones_medidas' => 3, 'duracion_total_s' => 15120, 'pagadores' => 3, 'compras' => 4, 'primer_evento_10m' => 1],
    $v($dia($C), $K));
check("Día $C: ingresos 18,97 (sin la rechazada ni la revertida)", 18.97, (float) $dia($C)['ingresos']);
check("Día $C web|EC: DAU 4, 4 nuevas, 1 cuenta, 1 pagador con 2 compras (6,98)", [4, 4, 1, 1, 2, 6.98], [(int) $dia($C, 'web', 'EC')['dau'], (int) $dia($C, 'web', 'EC')['nuevas'], (int) $dia($C, 'web', 'EC')['cuentas_nuevas'], (int) $dia($C, 'web', 'EC')['pagadores'], (int) $dia($C, 'web', 'EC')['compras'], (float) $dia($C, 'web', 'EC')['ingresos']]);
check("Día $C android (todos los países): DAU 1; J2 y J3 (por el canal) pagan 11,99; sesión con tope de 4 h", [1, 2, 11.99, 14400], [(int) $dia($C, 'android')['dau'], (int) $dia($C, 'android')['pagadores'], (float) $dia($C, 'android')['ingresos'], (int) $dia($C, 'android')['duracion_total_s']]);
check("Día $C país desconocido (--): la cuenta y la compra de J3", [1, 1, 2.0, 0], [(int) $dia($C, '*', '--')['cuentas_nuevas'], (int) $dia($C, '*', '--')['pagadores'], (float) $dia($C, '*', '--')['ingresos'], (int) $dia($C, '*', '--')['dau']]);
check('Día ' . $d(1) . ': DAU 4 (A, B, E, F), WAU 6, MAU 6, 1 nueva, 1 cuenta, 1 pagador', [4, 6, 6, 1, 1, 1], [(int) $dia($d(1))['dau'], (int) $dia($d(1))['wau'], (int) $dia($d(1))['mau'], (int) $dia($d(1))['nuevas'], (int) $dia($d(1))['cuentas_nuevas'], (int) $dia($d(1))['pagadores']]);
check('Día ' . $d(7) . ': DAU 2 (A y C), WAU 5 (A, B, C, E, F), MAU 6', [2, 5, 6], [(int) $dia($d(7))['dau'], (int) $dia($d(7))['wau'], (int) $dia($d(7))['mau']]);
check('Día ' . $d(30) . ': DAU 2 (A y E), MAU 5 (D salió de la ventana de 30 días)', [2, 5], [(int) $dia($d(30))['dau'], (int) $dia($d(30))['mau']]);
check('Día sin nada: fila del total en 0', [0, 0], [(int) $dia($d(-2))['dau'], (int) $dia($d(-2))['nuevas']]);
check('Las sumas por plataforma cuadran con el total (DAU del día C: web 4 + android 1)', 5, (int) $dia($C, 'web')['dau'] + (int) $dia($C, 'android')['dau']);

$coh = fn(string $tipo, string $cc, string $p = '*', string $pa = '*') => ($f = Db::fila('SELECT tamano, d1, d7, d30 FROM analitica_cohortes WHERE tipo = ? AND cohorte = ? AND plataforma = ? AND pais = ?', [$tipo, $cc, $p, $pa]))
    ? array_map(fn($x) => $x === null ? null : (int) $x, $f) : null;
check('Cohorte de instalación C (todos): 5, D1 3 (A, B, E), D7 2 (A, C), D30 2 (A, E)', ['tamano' => 5, 'd1' => 3, 'd7' => 2, 'd30' => 2], $coh('instalacion', $C));
check('Cohorte de instalación C web|EC: 4, D1 2, D7 2, D30 1', ['tamano' => 4, 'd1' => 2, 'd7' => 2, 'd30' => 1], $coh('instalacion', $C, 'web', 'EC'));
check('Cohorte de instalación C android|PE: 1, D1 1, D7 0, D30 1', ['tamano' => 1, 'd1' => 1, 'd7' => 0, 'd30' => 1], $coh('instalacion', $C, 'android', 'PE'));
check('Cohorte de instalación C+1 (F): 1, D1 0, D7 0, D30 0', ['tamano' => 1, 'd1' => 0, 'd7' => 0, 'd30' => 0], $coh('instalacion', $d(1)));
check('Cohorte de cuenta C (J1, J2, J3): 3, D1 2, D7 1, D30 2', ['tamano' => 3, 'd1' => 2, 'd7' => 1, 'd30' => 2], $coh('cuenta', $C));
check('Cohorte de cuenta C: J3 sin analítica va en --|--', ['tamano' => 1, 'd1' => 0, 'd7' => 0, 'd30' => 0], $coh('cuenta', $C, '--', '--'));
check('Cohorte de cuenta C web|EC (J1): D1, D7 y D30', ['tamano' => 1, 'd1' => 1, 'd7' => 1, 'd30' => 1], $coh('cuenta', $C, 'web', 'EC'));

$emb = Analitica::embudo($C, $C);
check('Embudo de C: 5 abren · intro 4 · clientes 3 · evento/auto/aire 2 · elegir/terminar/resultado/fin 1 · primer evento 3 · en ≤ 10 min 1',
    ['instalaciones' => 5, 'guia_intro' => 4, 'guia_clientes' => 3, 'guia_evento' => 2, 'guia_auto' => 2, 'guia_aire' => 2, 'guia_elegir' => 1, 'guia_terminar' => 1, 'guia_resultado' => 1, 'guia_fin' => 1, 'primer_evento' => 3, 'primer_evento_10m' => 1], $emb);
check('Embudo de C solo android|PE (E): hasta "al aire" y primer evento a los 15 min', [1, 1, 0, 1, 0], [Analitica::embudo($C, $C, 'android', 'PE')['instalaciones'], Analitica::embudo($C, $C, 'android', 'PE')['guia_aire'], Analitica::embudo($C, $C, 'android', 'PE')['guia_elegir'], Analitica::embudo($C, $C, 'android', 'PE')['primer_evento'], Analitica::embudo($C, $C, 'android', 'PE')['primer_evento_10m']]);

// Cohorte reciente: el D30 (y el D7) todavía no terminan -> NULL
$R = '2026-10-15';
$lote('G', 'G1', "$R 09:00", [['app_abierta', []]]);
$lote('G', 'G2', Analitica::mover($R, 1) . ' 09:00', [['app_abierta', []]]);
Analitica::fijarReloj($ts('2026-10-20 00:40'));
Analitica::agregar(10, $HOY);
check('Cohorte del 15/10 vista el 20/10: D1 1, D7 y D30 todavía NULL (no se cuentan como 0)', ['tamano' => 1, 'd1' => 1, 'd7' => null, 'd30' => null], $coh('instalacion', $R));
$R2 = '2026-10-19';
$lote('H', 'H1', "$R2 09:00", [['app_abierta', []]]);
Analitica::fijarReloj($ts('2026-10-20 00:40'));
Analitica::agregar(2, $HOY);
check('Cohorte de ayer: D1 NULL (hoy no termina)', ['tamano' => 1, 'd1' => null, 'd7' => null, 'd30' => null], $coh('instalacion', $R2));
$antes = Db::todas('SELECT * FROM analitica_dia WHERE dia BETWEEN ? AND ? ORDER BY dia, plataforma, pais', [$C, $d(30)]);
Analitica::agregar(45, $HOY);
$despues = Db::todas('SELECT * FROM analitica_dia WHERE dia BETWEEN ? AND ? ORDER BY dia, plataforma, pais', [$C, $d(30)]);
$sinHora = fn(array $l) => array_map(fn($f) => array_diff_key($f, ['actualizado' => 1]), $l);
check('agregar() otra vez da exactamente lo mismo (idempotente)', $sinHora($antes), $sinHora($despues));
check('Lecturas del panel: dias() rellena con 0 y trae los del segmento', [5, 4, 0], [Analitica::dias($C, $d(1))[$C]['dau'], Analitica::dias($C, $d(1), 'web', 'EC')[$C]['dau'], Analitica::dias($d(-3), $d(-3))[$d(-3)]['dau']]);
check('segmentos(): plataformas y países para los filtros', [['--', 'android', 'web'], true, true], [Analitica::segmentos()['plataformas'], in_array('EC', Analitica::segmentos()['paises'], true), in_array('PE', Analitica::segmentos()['paises'], true)]);
check('Última agregación guardada', 45, Analitica::ultima()['dias'] ?? null);

// bin/analitica.php
exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config.env') . ' php ' . escapeshellarg($SRV . '/bin/analitica.php') . ' --dias 3 2>&1', $out, $rc);
check('bin/analitica.php --dias 3 termina bien', [0, true], [$rc, str_contains(implode("\n", $out), 'analitica OK: 3 días')]);

// =====================================================================
titulo('3. Retención de 90 días y cuenta borrada');
Analitica::fijarReloj($ts('2026-12-15 12:00'));
$viejos = (int) Db::valor('SELECT COUNT(*) FROM eventos WHERE t < ?', [$ts('2026-12-15 12:00') - 90 * 86400]);
[$e, $i] = Analitica::limpiar();
check('limpiar(): borra los eventos de más de 90 días (y las 3 instalaciones sin uso en 90 días: B, D y F)', [$viejos, 0, 3], [$e, (int) Db::valor('SELECT COUNT(*) FROM eventos WHERE t < ?', [$ts('2026-12-15 12:00') - 90 * 86400]), $i]);
check('…pero los resúmenes se quedan', 5, (int) $dia($C)['dau']);
Analitica::fijarReloj($ts('2026-10-20 12:00'));
$lote('Z', 'Z1', '2026-10-20 11:00', [['app_abierta', []]], $J4);
Db::q("UPDATE jugadores SET estado = 'borrado' WHERE id = ?", [$J4]);
check('Cuenta borrada: sus eventos y su instalación ya no apuntan a la cuenta', [0, 0], [(int) Db::valor('SELECT COUNT(*) FROM eventos WHERE jugador_id = ?', [$J4]), (int) Db::valor('SELECT COUNT(*) FROM analitica_instalaciones WHERE jugador_id = ?', [$J4])]);
Analitica::fijarReloj(null);

// =====================================================================
titulo('4. HTTP: POST /api/eventos (php -S + router_control.php)');
// Datos de nuevo para el panel (con la hora de verdad): la cohorte sintética corrida a hoy
Db::q('DELETE FROM eventos'); Db::q('DELETE FROM analitica_instalaciones'); Db::q('DELETE FROM analitica_dia'); Db::q('DELETE FROM analitica_cohortes'); Db::q('DELETE FROM analitica_embudo'); Db::q('DELETE FROM analitica_meta'); Db::q('DELETE FROM intentos');
$PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $SRV . '/tests/router_control.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/srv.log", 'a'], 2 => ['file', "$TMP/srv.log", 'a']], $pipes, $RAIZ, array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PHP_CLI_SERVER_WORKERS' => '2']));
for ($k = 0; $k < 80 && !@fsockopen('127.0.0.1', $P); $k++) usleep(100000);
$B = "http://127.0.0.1:$P";
$JAR = "$TMP/galletas.txt";
$http = function (string $m, string $ruta, mixed $cuerpo = null, array $cab = [], bool $galletas = false) use ($B, $JAR): array {
    $ch = curl_init($B . $ruta);
    $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_HTTPHEADER => $cab, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30];
    if ($galletas) $o += [CURLOPT_COOKIEJAR => $JAR, CURLOPT_COOKIEFILE => $JAR];
    if ($cuerpo !== null) $o[CURLOPT_POSTFIELDS] = is_string($cuerpo) ? $cuerpo : json_encode($cuerpo);
    curl_setopt_array($ch, $o);
    $b = (string) curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode($b, true) ?? $b];
};
$JS = ['Content-Type: application/json', 'X-Envivo: 1'];
$sobre = fn(string $i, int $n = 1, string $pre = 'd') => ['i' => $i, 's' => $hex(16), 'p' => 'web', 'v' => '16', 'l' => 'es', 'e' => array_map(fn($k) => ['n' => 'app_abierta', 't' => (int) (microtime(true) * 1000), 'k' => $pre . sprintf('%07d', $k)], range(1, $n))];
$iH = $hex(32);
$r = $http('POST', '/api/eventos', $sobre($iH, 2), [...$JS, 'CF-IPCountry: CO']);
check('Con X-Envivo -> 200 {ok, aceptados 2}', [200, true, 2], [$r[0], $r[1]['ok'] ?? null, $r[1]['aceptados'] ?? null]);
check('…con el país de CF-IPCountry', 'CO', Db::valor('SELECT pais FROM analitica_instalaciones WHERE instalacion = ?', [$iH]));
check('sendBeacon (sin X-Envivo, texto plano, Sec-Fetch-Site: same-origin) -> 200', 200, $http('POST', '/api/eventos', $sobre($iH, 1, 'e'), ['Content-Type: text/plain;charset=UTF-8', 'Sec-Fetch-Site: same-origin'])[0]);
check('Sin X-Envivo con Origin del juego -> 200', 200, $http('POST', '/api/eventos', $sobre($iH, 1, 'f'), ['Content-Type: text/plain', 'Origin: ' . $B])[0]);
check('Desde otro sitio (Sec-Fetch-Site: cross-site) -> 403 cabecera_requerida', [403, 'cabecera_requerida'], (fn($r) => [$r[0], $r[1]['codigo'] ?? null])($http('POST', '/api/eventos', $sobre($iH, 1, 'c'), ['Content-Type: text/plain', 'Sec-Fetch-Site: cross-site'])));
check('Desde otro sitio (Origin ajeno) -> 403', 403, $http('POST', '/api/eventos', $sobre($iH, 1, 'c'), ['Content-Type: text/plain', 'Origin: https://malo.example'])[0]);
check('Sin X-Envivo ni cabeceras del navegador -> 403', 403, $http('POST', '/api/eventos', $sobre($iH, 1, 'c'), ['Content-Type: text/plain'])[0]);
check('GET -> 405', 405, $http('GET', '/api/eventos')[0]);
check('Más de 32 KB -> 413', 413, $http('POST', '/api/eventos', str_repeat('a', 40000), $JS)[0]);
check('JSON roto -> 400 analitica_invalida', [400, 'analitica_invalida'], (fn($r) => [$r[0], $r[1]['codigo'] ?? null])($http('POST', '/api/eventos', '{no', $JS)));
$iL = $hex(32);
$cods = [];
for ($k = 1; $k <= Analitica::LIMITE_INSTALACION + 2; $k++) $cods[] = $http('POST', '/api/eventos', $sobre($iL, 1, sprintf('%02d', $k)), $JS)[0];
check('Límite por instalación: ' . Analitica::LIMITE_INSTALACION . ' lotes en 10 min y luego 429', [Analitica::LIMITE_INSTALACION, 2], [count(array_filter($cods, fn($c) => $c === 200)), count(array_filter($cods, fn($c) => $c === 429))]);
$r = $http('POST', '/api/registro', ['email' => 'an@prueba.example', 'nombre' => 'Analítica', 'clave' => 'ClaveAnalitica1', 'acepta_terminos' => true, 'edad_16' => true], $JS, true);
$jid = (int) ($r[1]['jugador']['id'] ?? 0);
$iJ = $hex(32);
$s = $sobre($iJ, 1, 'b'); $s['e'][0]['n'] = 'cuenta_creada'; $s['j'] = 999999; $s['e'][0]['d'] = ['jugador_id' => 999999];
check('Con sesión -> 200', 200, $http('POST', '/api/eventos', $s, $JS, true)[0]);
check('jugador_id sale de la sesión (no de lo que manda el juego)', [$jid, $jid], [(int) Db::valor('SELECT jugador_id FROM eventos WHERE instalacion = ?', [$iJ]), (int) Db::valor('SELECT jugador_id FROM analitica_instalaciones WHERE instalacion = ?', [$iJ])]);
check('No se guarda IP ni navegador (columnas de eventos)', ['id', 'instalacion', 'sesion', 'clave', 'jugador_id', 'nombre', 'datos', 't', 'dia', 'recibido'], array_column(Db::todas('PRAGMA table_info(eventos)'), 'name'));
$P2 = puerto_libre();
file_put_contents($TMP . '/apagada.env', str_replace(":$P", ":$P2", (string) file_get_contents($TMP . '/config.env')) . "ENVIVO_ANALITICA=0\n");
$PIDS[] = proc_open(['php', '-S', '127.0.0.1:' . $P2, '-t', $RAIZ, $SRV . '/tests/router_control.php'], [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/srv2.log", 'a'], 2 => ['file', "$TMP/srv2.log", 'a']], $pipes, $RAIZ,
    array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/apagada.env']));
for ($k = 0; $k < 80 && !@fsockopen('127.0.0.1', $P2); $k++) usleep(100000);
$antes = (int) Db::valor('SELECT COUNT(*) FROM eventos');
$ch = curl_init("http://127.0.0.1:$P2/api/eventos");
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($sobre($hex(32), 1, 'a')), CURLOPT_HTTPHEADER => $JS, CURLOPT_PROXY => '']);
$r = json_decode((string) curl_exec($ch), true); curl_close($ch);
check('ENVIVO_ANALITICA=0: responde ok + apagada (el juego vacía su cola) y no guarda nada', [true, true, $antes], [$r['ok'] ?? null, $r['apagada'] ?? null, (int) Db::valor('SELECT COUNT(*) FROM eventos')]);

// =====================================================================
titulo('5. Centro de Control: pestaña Analítica');
// Datos para ver la pestaña: cohortes de los últimos 40 días con retención variada (verde, ámbar y rojo)
Db::q('DELETE FROM eventos'); Db::q('DELETE FROM analitica_instalaciones'); Db::q('DELETE FROM intentos');
mt_srand(7);
$hoyR = date('Y-m-d');
$paisesR = ['EC' => 6, 'PE' => 2, 'CO' => 2, '' => 1];
$nInst = 0;
for ($dd = 40; $dd >= 0; $dd--) {
    $cd = Analitica::mover($hoyR, -$dd);
    $nuevasDia = 6 + ($dd % 5);
    for ($k = 0; $k < $nuevasDia; $k++) {
        $nInst++;
        $plat = $k % 3 === 0 ? 'android' : 'web';
        $r0 = mt_rand(0, 10); $pa = $r0 < 6 ? 'EC' : ($r0 < 8 ? 'PE' : ($r0 < 10 ? 'CO' : ''));
        $nom = 'R' . $nInst;
        $base = $cd . sprintf(' %02d:%02d', 8 + $k % 12, mt_rand(0, 59));
        $guia = array_slice($GUIA, 0, [10, 10, 9, 6, 3, 2, 1][$k % 7]);
        $evs = [['app_abierta', ['origen' => $plat]], ...$pasos($guia, '')];
        if (count($guia) >= 8) $evs[] = ['evento_terminado', ['estrellas' => 3], date('Y-m-d H:i', $ts($base) + ($k % 2 ? 420 : 900))];
        $evs[] = ['sesion_fin', ['duracion_s' => 180 + mt_rand(0, 900)]];
        $lote($nom, $nom . 'a', $base, $evs, null, $plat, $pa);
        foreach ([1 => [45, 18, 8], 7 => [14, 5, 2], 30 => [7, 2, 0]] as $n => $prob) {   // cohortes buenas, a medias y malas
            $vd = Analitica::mover($cd, $n);
            if ($vd <= $hoyR && mt_rand(1, 100) <= $prob[$dd % 3]) $lote($nom, $nom . 'r' . $n, $vd . ' 20:00', [['app_abierta', []], ['sesion_fin', ['duracion_s' => 120 + mt_rand(0, 600)]]], null, $plat, $pa);
        }
        if ($k % 4 === 0) { $jj = $jug("r$nInst@prueba.example", $base); Db::q('UPDATE eventos SET jugador_id = ? WHERE instalacion = ?', [$jj, $inst($nom)]); Db::q('UPDATE analitica_instalaciones SET jugador_id = ? WHERE instalacion = ?', [$jj, $inst($nom)]);
            if ($k % 8 === 0) $compra($jj, [0.99, 4.99, 9.99][$nInst % 3], 'pagado', date('Y-m-d H:i', $ts($base) + 1800), $plat === 'android' ? 'google_play' : 'web_plux'); }
    }
}
Analitica::fijarReloj(null);
Db::q('DELETE FROM intentos');
final class Cli {
    public string $cuerpo = ''; public int $http = 0; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base) { $this->jar = sys_get_temp_dir() . '/jar_analitica_' . getmypid(); @unlink($this->jar); }
    public function pedir(string $m, string $ruta, ?array $d = null, array $cab = []): int {
        $ch = curl_init($this->base . $ruta); $this->lugar = '';
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 60, CURLOPT_PROXY => '',
            CURLOPT_HEADERFUNCTION => function ($c, $h) { if (stripos($h, 'location:') === 0) $this->lugar = trim(substr($h, 9)); return strlen($h); }]);
        if ($d !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($d));
        $this->cuerpo = (string) curl_exec($ch); $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        return $this->http;
    }
    public function get(string $r): int { return $this->pedir('GET', $r); }
    public function post(array $d, array $cab = []): int { return $this->pedir('POST', '/control/', $d, $cab); }
    public function tiene(string $t): bool { return str_contains($this->cuerpo, $t); }
    public function csrf(): string { return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $this->cuerpo, $m) ? $m[1] : ''; }
    public function entrar(string $u, string $c): int { $this->get('/control/'); return $this->post(['accion' => 'entrar', 'csrf' => $this->csrf(), 'usuario' => $u, 'clave' => $c]); }
}
$c = new Cli($B);
$TAB = '/control/?t=analitica';
check('Sin sesión la pestaña muestra la entrada', [200, false], [$c->get($TAB), $c->tiene('panel-retencion')]);
check('Entrar -> 303', 303, $c->entrar($USUARIO, $CLAVE));
check('Pestaña Analítica antes de calcular: 200 y avisa que falta calcular', [200, true, true], [$c->get($TAB), $c->tiene('Todavía no se calculan'), $c->tiene('aria-current="page">Analítica')]);
$aud = fn() => (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'analitica_recalcular'");
$csrf = $c->csrf();
check('Recalcular sin CSRF -> 403 y no se calcula', [403, 0], [$c->post(['accion' => 'analitica_recalcular', 'csrf' => 'x', 'volver' => $TAB]), $aud()]);
$c->get($TAB);
check('Recalcular con Origin de otro sitio -> 403', 403, $c->post(['accion' => 'analitica_recalcular', 'csrf' => $c->csrf(), 'volver' => $TAB], ['Origin: https://malo.example']));
$c->get($TAB);
check('Recalcular ahora (CSRF bueno) -> 303 a la pestaña y queda en la auditoría', [303, $TAB, 1], [$c->post(['accion' => 'analitica_recalcular', 'csrf' => $c->csrf(), 'volver' => $TAB]), $c->lugar, $aud()]);
$c->get($TAB);
check('Aviso "Resúmenes recalculados"', true, $c->tiene('Resúmenes recalculados: 35 días'));
$ayer = Analitica::mover(date('Y-m-d'), -1);
$fa = Db::fila("SELECT * FROM analitica_dia WHERE dia = ? AND plataforma = '*' AND pais = '*'", [$ayer]);
check('Tarjeta DAU = el de ayer en analitica_dia', true, (bool) preg_match('#id="kpi-dau"><span class="kpi-t">[^<]*</span><b class="kpi-v">' . number_format((int) $fa['dau'], 0, ',', '.') . '</b>#', $c->cuerpo));
$niveles = preg_match_all('/data-nivel="(ok|aviso|mal)"/', $c->cuerpo, $m) ? array_count_values($m[1]) : [];
check('Tabla de cohortes con los tres colores de las metas (verde, ámbar, rojo)', [true, true, true], [($niveles['ok'] ?? 0) > 0, ($niveles['aviso'] ?? 0) > 0, ($niveles['mal'] ?? 0) > 0]);
check('Cohortes: 30 filas (de hace 30 días a ayer) y "en curso" en los días que no terminan', [true, true], [substr_count(explode('</table>', explode('id="tabla-cohortes"', $c->cuerpo)[1] ?? '')[0], '<tr>') === 31, $c->tiene('en curso')]);
// El color corresponde a la meta: revisa cada celda contra su número
$bienColor = true;
preg_match_all('/data-ret="(d1|d7|d30)" data-nivel="(ok|aviso|mal)" title="(\d+) de (\d+)/', $c->cuerpo, $mm, PREG_SET_ORDER);
foreach ($mm as [, $k, $niv, $n, $t]) { $r = $n / $t; $esp = $r >= Analitica::METAS[$k] ? 'ok' : ($r >= Analitica::METAS[$k] / 2 ? 'aviso' : 'mal'); if ($esp !== $niv) $bienColor = false; }
check('Cada celda tiene el color de su meta (25 % / 8 % / 3 %)', [true, true], [count($mm) > 20, $bienColor]);
$emb = Analitica::embudo(Analitica::mover(date('Y-m-d'), -29), date('Y-m-d'));
check('Embudo: 12 pasos y "Abrieron el juego" = instalaciones de los 30 días', [12, true], [substr_count($c->cuerpo, 'data-paso="'), $c->tiene('data-paso="instalaciones" data-n="' . $emb['instalaciones'] . '"')]);
check('Embudo: cada paso con su número', true, $c->tiene('data-paso="guia_fin" data-n="' . $emb['guia_fin'] . '"') && $c->tiene('data-paso="primer_evento_10m" data-n="' . $emb['primer_evento_10m'] . '"'));
check('8 gráficos SVG diarios (sin librerías)', 8, preg_match_all('/<figure class="figura" id="g-/', $c->cuerpo));
check('Sin <script> ni style= en la pestaña (CSP)', [0, 0], [substr_count(explode('<main', $c->cuerpo)[1] ?? '', '<script'), substr_count(explode('<main', $c->cuerpo)[1] ?? '', 'style=')]);
check('Filtro android: la tarjeta DAU cambia al segmento', [200, true], [$c->get($TAB . '&plataforma=android'), (bool) preg_match('#id="kpi-dau"><span class="kpi-t">[^<]*</span><b class="kpi-v">' . (int) Db::valor("SELECT dau FROM analitica_dia WHERE dia = ? AND plataforma = 'android' AND pais = '*'", [$ayer]) . '</b>#', $c->cuerpo)]);
check('Filtro país PE + cohortes por cuenta: 200 y la opción elegida', [200, true, true], [$c->get($TAB . '&pais=PE&cohorte=cuenta'), $c->tiene('<option value="PE" selected>'), $c->tiene('creación de cuenta')]);
check('Filtros con basura -> todos (sin error)', [200, true], [$c->get($TAB . '&plataforma=%3Cx%3E&pais=%22%3E&cohorte=zz'), $c->tiene('<option value="*" selected>Todas</option>')]);
check('Las demás pestañas siguen bien', [200, 200], [$c->get('/control/?t=resumen'), $c->get('/control/?t=servidores')]);

$NP = getenv('NODE_PATH') ?: '/opt/npm-tools/node_modules';
if (is_dir($NP . '/playwright')) {
    file_put_contents("$TMP/navegador_analitica.cjs", <<<'JS'
const { chromium } = require('playwright');
(async () => {
  const [base, usuario, clave, carpeta] = process.argv.slice(2);
  const r = { ok: false, paginas: {}, errores: [], tip: false };
  const nav = await chromium.launch();
  try {
    for (const [nombre, vp] of [['movil', { width: 390, height: 844 }], ['escritorio', { width: 1280, height: 900 }]]) {
      const ctx = await nav.newContext({ viewport: vp, isMobile: nombre === 'movil', hasTouch: nombre === 'movil', locale: 'es-EC', deviceScaleFactor: nombre === 'movil' ? 2 : 1 });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => r.errores.push('pagina: ' + e));
      p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') r.errores.push('consola: ' + m.text()); });
      await p.goto(base + '/control/');
      await p.fill('input[name="usuario"]', usuario);
      await p.fill('input[name="clave"]', clave);
      await Promise.all([p.waitForNavigation(), p.click('#form-entrar button[type="submit"]')]);
      const res = await p.goto(base + '/control/?t=analitica');
      r.paginas[nombre] = { http: res.status(), desborde: await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) };
      await p.screenshot({ path: carpeta + '/analitica_panel_' + nombre + '.png', fullPage: true });
      if (nombre === 'movil') {
        await p.evaluate(() => document.querySelectorAll('.barra, .pestanas').forEach((x) => { x.style.position = 'static'; }));   // que la barra fija no tape las capturas de una parte
        await p.locator('#panel-retencion').screenshot({ path: carpeta + '/analitica_cohortes.png' });
        await p.locator('#panel-embudo').screenshot({ path: carpeta + '/analitica_embudo.png' });
        const z = p.locator('#g-dau .zona').last();
        await z.scrollIntoViewIfNeeded();
        await z.tap();
        r.tip = (await p.locator('#tip').isVisible()) && /DAU/.test(await p.textContent('#tip'));
        const res2 = await p.goto(base + '/control/?t=analitica&plataforma=android&pais=EC&cohorte=cuenta');
        r.paginas.filtrada = { http: res2.status(), desborde: await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) };
      }
      await ctx.close();
    }
    r.ok = r.tip && Object.values(r.paginas).every((x) => x.http === 200 && x.desborde === 0) && r.errores.length === 0;
  } catch (e) { r.errores.push(String(e)); }
  await nav.close();
  console.log(JSON.stringify(r));
})();
JS);
    $sal = trim((string) shell_exec('NODE_PATH=' . escapeshellarg($NP) . ' node ' . escapeshellarg("$TMP/navegador_analitica.cjs") . ' ' . escapeshellarg($B) . ' ' . escapeshellarg($USUARIO) . ' ' . escapeshellarg($CLAVE) . ' ' . escapeshellarg($CAPTURAS) . ' 2>&1'));
    $ult = json_decode((string) substr($sal, (int) strrpos("\n" . $sal, "\n{")), true) ?? ['crudo' => $sal];
    foreach (($ult['paginas'] ?? []) as $n => $pg) check("Navegador: $n sin desplazamiento horizontal (HTTP 200)", [200, 0], [$pg['http'], $pg['desborde']]);
    check('Navegador: tocar el gráfico de DAU muestra el detalle', true, $ult['tip'] ?? null);
    check('Navegador: sin errores de consola ni de la página (CSP incluida)', [], $ult['errores'] ?? ['sin respuesta: ' . $sal]);
    echo "  Capturas en $CAPTURAS/analitica_*.png\n";
} else {
    echo "  (no hay Playwright en $NP: se salta)\n";
}

titulo('Registro de PHP');
$log = (@file_get_contents("$TMP/php_errores.log") ?: '') . (@file_get_contents("$TMP/srv.log") ?: '');
$malos = array_values(array_filter(preg_split('/\n/', $log), fn($l) => preg_match('/fatal|warning|deprecated|notice|EN VIVO (api|control)/i', $l)));
check('Sin errores ni avisos de PHP', [], array_slice($malos, 0, 5));

echo "\n----------------------------------------\npruebas_analitica.php: $OK correctas, $FALLAS fallas\n";
exit($FALLAS === 0 ? 0 : 1);
