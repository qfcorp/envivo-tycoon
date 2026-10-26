<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Copa de Servidores (server/src/Copas.php, contrato server/COPAS.md §2):
// base SQLite TEMPORAL, 3 servidores en un universo (uno chico con 1 solo jugador), reloj de la copa congelado:
// fases por reloj, calendario, registro de equipos, intentos (válidos, con trampa, validador caído), un sábado completo
// con el motor de prueba, tabla y desempates, premios una sola vez (aunque la tarea corra dos veces), el motor de verdad
// (server/eventos/batalla.js, si está) y todas las rutas por HTTP (php -S con una copia de api.php + la línea de
// server/INTEGRAR_COPAS.md).
// Uso:  php server/tests/pruebas_copas.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_copas_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$NODE = trim((string) shell_exec('command -v node 2>/dev/null'));
$VALIDADOR_OK = false;
if ($NODE !== '') { exec(escapeshellarg($NODE) . ' ' . escapeshellarg(dirname(__DIR__) . '/validador/validador.js') . ' --version 2>&1', $vo, $vc); $VALIDADOR_OK = $vc === 0; }
$BATALLA = dirname(__DIR__) . '/eventos/batalla.js';
$MOTOR_OK = $NODE !== '' && is_file($BATALLA);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nCOPA_SECRETO=secreto-de-prueba\n"
    . "UNIVERSO_SERVIDORES_INICIALES=3\n" . ($NODE !== '' ? "NODE_BIN=$NODE\nVALIDADOR_NODE=$NODE\n" : '') . "VALIDADOR_URL=http://127.0.0.1:1\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';
require_once __DIR__ . '/reloj_prueba.php';

use EnVivo\{Copas, Db, Fallo, Migraciones, Monedero, Social};

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
$en = fn(string $fecha) => (new DateTimeImmutable($fecha, new DateTimeZone('America/Guayaquil')))->getTimestamp();
$reloj = function (int $t) { Copas::$reloj = $t; if (class_exists(\EnVivo\Universos::class)) \EnVivo\Universos::fijarReloj($t); };

Db::pdo();
Copas::preparar();

// ------------------------------------------------------------------ 3 servidores en un universo (Universos.php si está; si no, todos en el 1)
$cols = Migraciones::columnas('servidores') ?? [];
foreach ([2 => 'Servidor 2 · Guayaquil', 3 => 'Servidor 3 · Cuenca'] as $id => $nom) {
    Db::q('INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (?, ?, 1000, 1, ?)', [$id, $nom, time()]);
}
if (isset($cols['universo_id'])) Db::q('UPDATE servidores SET universo_id = (SELECT MIN(id) FROM universos) WHERE id IN (1, 2, 3)');
// Creados con el reloj de verdad: se dejan creados antes de la simulación (lunes 2026-10-26) para que la edad del servidor
// (EdadServidor: la copa abre el día 7) no dependa del día en que se corre la prueba
Db::q('UPDATE servidores SET creado = ? WHERE id IN (1, 2, 3)', [$en('2026-09-01 00:00:00')]);
$U = Copas::universos();
check('Un universo con los servidores 1, 2 y 3' . (isset($cols['universo_id']) ? ' (tabla universos)' : ' (sin Universos.php: todos en el 1)'), [1, [1, 2, 3]], [count($U), $U[0]['servidores']]);

$nuevoJugador = function (string $alias, int $sid, int $fama = 10): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '@prueba.example', $alias, 'x', time(), $sid, $alias, strtolower($alias), $fama]);
    return Db::ultimoId();
};
$equipo = function (int $hab = 3, int $cams = 4) {
    return ['staff' => [['role' => 'camarografo', 'skill' => $hab, 'owner' => true, 'name' => 'Tú'], ['role' => 'director', 'skill' => $hab], ['role' => 'sonidista', 'skill' => 2],
                        ['role' => 'tecnico_transmision', 'skill' => 2], ['role' => 'camarografo', 'skill' => 2]],
            'equip' => array_merge(array_fill(0, $cams, ['type' => 'cam_basic', 'condition' => 90]),
                array_map(fn($t) => ['type' => $t, 'condition' => 90], ['switch_basic', 'audio_basic', 'mics', 'encoder', 'router4g', 'raincover']))];
};
// Servidor 1: 6 productoras (van las 5 mejores) · Servidor 2: 3 · Servidor 3: 1 sola (servidor chico)
$S1 = []; $S2 = [];
for ($i = 1; $i <= 6; $i++) $S1[$i] = $nuevoJugador('Quito ' . $i, 1);
for ($i = 1; $i <= 3; $i++) $S2[$i] = $nuevoJugador('Guayaquil ' . $i, 2);
$SOLO = $nuevoJugador('Cuenca Sola', 3);
$NADA = $nuevoJugador('Quito Mirón', 1);   // registra equipo pero nunca aporta
$a = Social::crear($S1[1], ['nombre' => 'Asociación Pichincha', 'siglas' => 'PCH', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
Social::unirse($S1[2], $a['asociacion']['id']);

// =====================================================================
titulo('Ciclo semanal por reloj (America/Guayaquil)');
$LUN = $en('2026-10-26 00:00:00'); $SAB = $en('2026-10-31 00:00:00');
check('Semana ISO y límites', ['2026-W44', $LUN, $SAB, $en('2026-10-31 20:00:00'), $en('2026-11-02 00:00:00')], array_values(Copas::semana($LUN + 3600)));
check('Lunes 00:00 → preparacion', 'preparacion', Copas::fase($LUN));
check('Viernes 23:59:59 → preparacion', 'preparacion', Copas::fase($SAB - 1));
check('Sábado 00:00 → batalla', 'batalla', Copas::fase($SAB));
check('Sábado 19:59:59 → batalla', 'batalla', Copas::fase($en('2026-10-31 19:59:59')));
check('Sábado 20:00 → cerrada', 'cerrada', Copas::fase($en('2026-10-31 20:00:00')));
check('Domingo 23:59:59 → cerrada (misma semana)', ['cerrada', '2026-W44'], [Copas::fase($en('2026-11-01 23:59:59')), Copas::semana($en('2026-11-01 23:59:59'))['id']]);
check('Lunes siguiente 00:00 → preparacion de otra semana', ['preparacion', '2026-W45'], [Copas::fase($en('2026-11-02 00:00:00')), Copas::semana($en('2026-11-02 00:00:00'))['id']]);
$rot = []; for ($k = 0; $k < 8; $k++) $rot[] = Copas::torneoDe($LUN + $k * 604800);
check('Torneos parodia: rotan, los 8 en 8 semanas, y vuelve a empezar', [8, $rot[0]], [count(array_unique($rot)), Copas::torneoDe($LUN + 8 * 604800)]);
check('Cada torneo tiene 5 tipos de evento que existen en el juego', true, (bool) array_product(array_map(fn($t) => count($t['tipos']) === 5 && !array_diff($t['tipos'], array_keys(\EnVivo\CatalogoJuego::EVENTOS)), Copas::TORNEOS)));

// =====================================================================
titulo('Calendario del sábado');
$cal = Copas::calendario([1, 2, 3], $SAB);
$horas = array_map(fn($x) => date('H:i', $x['hora']), $cal);
$pares = array_map(function ($x) { $p = [$x['a'], $x['b']]; sort($p); return implode('-', $p); }, $cal);
sort($pares);
check('3 servidores: 3 cruces (todos contra todos) a las 10:00, 14:00 y 18:00', [3, ['10:00', '14:00', '18:00'], ['1-2', '1-3', '2-3']], [count($cal), $horas, $pares]);
$porServ = array_count_values(array_merge(array_column($cal, 'a'), array_column($cal, 'b')));
check('…cada servidor juega 2 cruces', [2, 2, 2], [$porServ[1], $porServ[2], $porServ[3]]);
$c4 = Copas::calendario([1, 2, 3, 4], $SAB);
$rondasOk = true;
foreach (array_unique(array_column($c4, 'ronda')) as $r) { $en_r = array_filter($c4, fn($x) => $x['ronda'] === $r); $ids = array_merge(array_column($en_r, 'a'), array_column($en_r, 'b')); $rondasOk = $rondasOk && count($ids) === count(array_unique($ids)); }
check('4 servidores: 6 cruces en 3 rondas (10, 14, 18 h), nadie juega dos veces en la misma ronda', [6, 3, true, ['10:00', '14:00', '18:00']], [count($c4), count(array_unique(array_column($c4, 'ronda'))), $rondasOk, array_values(array_unique(array_map(fn($x) => date('H:i', $x['hora']), $c4)))]);
$c5 = Copas::calendario([1, 2, 3, 4, 5], $SAB);
check('5 servidores: 10 cruces en 5 rondas entre 08:00 y 19:00', [10, 5, '08:00', true], [count($c5), count(array_unique(array_column($c5, 'ronda'))), date('H:i', min(array_column($c5, 'hora'))), max(array_column($c5, 'hora')) <= $SAB + 19 * 3600]);
$c8 = Copas::calendario(range(1, 8), $SAB);
$cruzados = array_filter($c8, function ($x) use ($c8) { $g = []; foreach ($c8 as $y) { $g[$y['a']] = $y['grupo']; $g[$y['b']] = $y['grupo']; } return $g[$x['a']] !== $g[$x['b']]; });
check('8 servidores: 2 grupos de 4, 12 cruces, nadie cruza de grupo', [2, 12, 0], [count(array_unique(array_column($c8, 'grupo'))), count($c8), count($cruzados)]);
check('1 servidor: sin cruces', [], Copas::calendario([1], $SAB));
check('Bono mixto: round(min(15, 15 × (½·prep/máx + ½·prom/máx_prom)))', [15, 11, 0, 0, 15, 8],
    [Copas::bono(900, 900, 30, 30), Copas::bono(450, 900, 30, 30), Copas::bono(0, 900, 0, 30), Copas::bono(10, 0, 0, 0), Copas::bono(1200, 900, 40, 30), Copas::bono(90, 900, 30, 30)]);
check('…un servidor chico muy activo (10 % de la prep, el mejor promedio) saca 8 en vez de 2 (solo por suma)', [8, 2], [Copas::bono(90, 900, 30, 30), (int) round(15 * 90 / 900)]);

// =====================================================================
titulo('Lunes: se abre la copa y el registro de equipos');
$reloj($LUN + 9 * 3600);
$r = Copas::tareaProgramada();
$C = Db::fila("SELECT * FROM copas WHERE semana = '2026-W44'");
check('La tarea abre la copa de la semana con su calendario', [1, 'preparacion', 3, 3], [$r['copas'], $C['fase'], (int) Db::valor('SELECT COUNT(*) FROM copa_servidores WHERE copa_id = ?', [$C['id']]), (int) Db::valor('SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ?', [$C['id']])]);
Copas::tareaProgramada();
check('Correrla otra vez no duplica nada', [1, 3], [(int) Db::valor('SELECT COUNT(*) FROM copas'), (int) Db::valor('SELECT COUNT(*) FROM copa_cruces')]);
$CID = (int) $C['id'];
$e = Copas::estado($S1[1]);
check('GET copa: nombre del torneo, fase, universo, 3 servidores, 3 cruces, yo', [$C['nombre'], 'preparacion', 'Universo Andino', 3, 3, false, true],
    [$e['copa']['nombre'], $e['copa']['fase'], $e['universo']['nombre'], count($e['servidores']), count($e['cruces']), $e['yo']['equipo_registrado'], $e['servidores'][array_search(1, array_column($e['servidores'], 'id'))]['yo']]);

check('Equipo sin personal -> 400 equipo', [400, 'equipo'], falla(fn() => Copas::registrarEquipo($S1[1], ['staff' => [], 'equip' => []])));
check('Habilidad 5 con 10 de fama -> 400 habilidad', [400, 'habilidad'], falla(fn() => Copas::registrarEquipo($S1[1], $equipo(5))));
check('Rol que no existe -> 400 equipo', [400, 'equipo'], falla(fn() => Copas::registrarEquipo($S1[1], ['staff' => [['role' => 'mago', 'skill' => 2]], 'equip' => [['type' => 'cam_basic']]])));
check('Equipo exclusivo que no está en su bodega -> 403 no_es_tuyo', [403, 'no_es_tuyo'], falla(fn() => Copas::registrarEquipo($S1[1], ['staff' => [['role' => 'camarografo', 'skill' => 2, 'owner' => true]], 'equip' => [['type' => 'dron4k']]])));
check('Sin cámara -> 400 sin_camara', [400, 'sin_camara'], falla(fn() => Copas::registrarEquipo($S1[1], ['staff' => [['role' => 'camarografo', 'skill' => 2, 'owner' => true]], 'equip' => [['type' => 'mics']]])));
check('Equipo de 5 personas de más de lo que permite la fama (skill 4 con fama 10) -> 400', [400, 'habilidad'], falla(fn() => Copas::registrarEquipo($S2[1], $equipo(4))));
$reg = Copas::registrarEquipo($S1[1], $equipo(3));
check('Equipo válido: registrado, ánimo y estado los fija el servidor, poder > 0', [true, true, 80, 90, true],
    [$reg['ok'], $reg['copa']['yo']['equipo_registrado'], $reg['equipo']['staff'][0]['morale'], $reg['equipo']['equip'][0]['condition'], $reg['equipo']['poder'] > 0]);
$reg2 = Copas::registrarEquipo($S1[1], $equipo(3, 2));
check('Registrar otra vez reemplaza el equipo (uno por jugador y copa)', [1, 2], [(int) Db::valor('SELECT COUNT(*) FROM copa_equipos WHERE jugador_id = ?', [$S1[1]]), count(array_filter($reg2['equipo']['equip'], fn($x) => $x['type'] === 'cam_basic'))]);
Copas::registrarEquipo($S1[1], $equipo(3));
foreach ([2, 3, 4, 5, 6] as $k) Copas::registrarEquipo($S1[$k], $equipo($k <= 3 ? 3 : 2));
foreach ($S2 as $j) Copas::registrarEquipo($j, $equipo(3));
Copas::registrarEquipo($SOLO, $equipo(3));
Copas::registrarEquipo($NADA, $equipo(1, 1));
check('Equipos registrados por servidor', [7, 3, 1], array_map(fn($s) => (int) Db::valor('SELECT COUNT(*) FROM copa_equipos WHERE copa_id = ? AND servidor_id = ?', [$CID, $s]), [1, 2, 3]));

// =====================================================================
titulo('Puntos de preparación: solo intentos validados');
$VAL = 'ok';
Copas::$validador = function (array $it) use (&$VAL): array {
    $cli = $it['cliente_resultado'] ?? ['quality' => 50, 'stars' => 3];
    return match ($VAL) {
        'ok' => ['valido' => true, 'coincide' => true, 'calidad' => $cli['quality'], 'estrellas' => $cli['stars'], 'version_logica' => 'prueba', 'detalle' => []],
        'trampa' => ['valido' => false, 'coincide' => false, 'calidad' => 41, 'estrellas' => 2, 'version_logica' => 'prueba', 'detalle' => ['motivo' => 'resultado_no_coincide']],
        'version' => ['valido' => false, 'coincide' => false, 'calidad' => 70, 'estrellas' => 4, 'version_logica' => 'otra', 'detalle' => ['version_distinta' => true]],
        'imposible' => ['valido' => false, 'calidad' => null, 'estrellas' => null, 'detalle' => ['motivo' => 'decision_imposible']],
        'caido' => ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido']],
    };
};
$enviar = fn(int $j, array $it, int $q, int $s, array $extra = []) => Copas::enviarIntento($j, ['intento_id' => $it['id'], 'decisiones' => [0, 1], 'resultado' => ['quality' => $q, 'stars' => $s]] + $extra);
check('Iniciar sin equipo registrado -> 409 sin_equipo', [409, 'sin_equipo'], falla(fn() => Copas::iniciarIntento($nuevoJugador('Sin Equipo', 1))));
$it = Copas::iniciarIntento($S1[1]);
check('Iniciar: semilla, contrato del torneo, equipo registrado, firma, vence en 30 min', [true, true, true, 64, $reg['equipo']['staff'], true],
    [is_int($it['seed']), in_array($it['contrato']['type'], Copas::TORNEOS[$C['torneo_key']]['tipos'], true), $it['contrato']['copa'] ?? false, strlen($it['firma']), $it['equipo']['staff'], strtotime($it['vence']) === Copas::ahora() + 1800]);
$it2 = Copas::iniciarIntento($S1[1]);
check('Pedir otro con uno abierto devuelve el mismo (misma semilla)', [$it['id'], $it['seed'], true], [$it2['id'], $it2['seed'], $it2['reanudado']]);
check('Firma falsa -> 403 firma (y el intento queda usado)', [[403, 'firma'], 'rechazado'], [falla(fn() => $enviar($S1[1], $it, 90, 5, ['firma' => str_repeat('0', 64)])), Db::valor('SELECT estado FROM copa_intentos WHERE id = ?', [$it['id']])]);
$it = Copas::iniciarIntento($S1[1]);
$r = $enviar($S1[1], $it, 88, 5, ['firma' => $it['firma']]);
check('Intento validado: puntos = calidad + extra por 5 estrellas (88 + 20)', [true, 88, 108, 'validado'], [$r['resultado']['valido'], $r['resultado']['calidad'], $r['resultado']['puntos'], $r['resultado']['estado']]);
check('…el aporte queda anotado (con su asociación) y suma al servidor', [108, 108, (int) $a['asociacion']['id']],
    [$r['copa']['yo']['aporte'], (int) Db::valor('SELECT puntos_prep FROM copa_servidores WHERE copa_id = ? AND servidor_id = 1', [$CID]), (int) Db::valor('SELECT asociacion_id FROM copa_aportes WHERE jugador_id = ?', [$S1[1]])]);
check('Enviar el mismo intento otra vez -> 409 ya_enviado', [409, 'ya_enviado'], falla(fn() => $enviar($S1[1], $it, 88, 5)));
$VAL = 'trampa';
$it = Copas::iniciarIntento($S1[2]);
$r = $enviar($S1[2], $it, 99, 5);
check('Con trampa (el juego dijo 99 y 5 estrellas, el validador sacó 41 y 2): cuenta solo lo del validador (41) y queda sospechoso', [false, 41, 'validado', true, 41],
    [$r['resultado']['valido'], $r['resultado']['puntos'], $r['resultado']['estado'], $r['resultado']['sospechoso'], (int) Db::valor('SELECT COALESCE(SUM(puntos), 0) FROM copa_aportes WHERE jugador_id = ?', [$S1[2]])]);
$VAL = 'imposible';
$it = Copas::iniciarIntento($S1[2]);
check('Jugada imposible: 0 puntos', [0, 'rechazado'], (function () use ($enviar, $S1, $it) { $r = $enviar($S1[2], $it, 70, 4); return [$r['resultado']['puntos'], $r['resultado']['estado']]; })());
$VAL = 'version';
$it = Copas::iniciarIntento($S1[2]);
check('Otra versión de la lógica (no es trampa): cuenta la calidad del servidor (70 + 10), sin marcar', [80, 'validado', false], (function () use ($enviar, $S1, $it) { $r = $enviar($S1[2], $it, 72, 4); return [$r['resultado']['puntos'], $r['resultado']['estado'], $r['resultado']['sospechoso']]; })());
$VAL = 'caido';
$it = Copas::iniciarIntento($S2[1]);
$r = $enviar($S2[1], $it, 75, 4);
check('Validador caído: queda pendiente y todavía no suma', ['pendiente', 0, null, 0], [$r['resultado']['estado'], $r['resultado']['puntos'], $r['resultado']['valido'], (int) Db::valor('SELECT puntos_prep FROM copa_servidores WHERE copa_id = ? AND servidor_id = 2', [$CID])]);
$VAL = 'ok';
Copas::tareaProgramada();
check('…la tarea lo revalida y entonces suma (75 + 10)', ['validado', 85], [Db::valor('SELECT estado FROM copa_intentos WHERE id = ?', [$it['id']]), (int) Db::valor('SELECT puntos_prep FROM copa_servidores WHERE copa_id = ? AND servidor_id = 2', [$CID])]);
$it = Copas::iniciarIntento($S2[2]);
Copas::$reloj += 1801;
check('Enviar después de los 30 minutos -> 409 vencido', [409, 'vencido'], falla(fn() => $enviar($S2[2], $it, 80, 4)));
check('Decisiones mal formadas -> 400', [400, 'decisiones'], falla(fn() => Copas::enviarIntento($S2[2], ['intento_id' => 1, 'decisiones' => ['x']])));
check('Intento de otro jugador -> 404', [404, 'no_existe'], falla(fn() => Copas::enviarIntento($S2[3], ['intento_id' => $it['id'], 'decisiones' => []])));
// Límite diario
$n = (int) Db::valor('SELECT COUNT(*) FROM copa_intentos WHERE jugador_id = ?', [$S2[2]]);
for ($k = $n; $k < Copas::INTENTOS_DIA; $k++) { $x = Copas::iniciarIntento($S2[2]); $enviar($S2[2], $x, 60, 3); }
check('Más de ' . Copas::INTENTOS_DIA . ' intentos en el día -> 429 limite_dia', [429, 'limite_dia'], falla(fn() => Copas::iniciarIntento($S2[2])));
// Resto de la semana: Quito aporta mucho, Guayaquil algo, la única productora de Cuenca un poco
$reloj($LUN + 2 * 86400 + 10 * 3600);
$jugar = function (int $j, int $veces, int $q, int $s) use ($enviar) { for ($k = 0; $k < $veces; $k++) { $x = Copas::iniciarIntento($j); $enviar($j, $x, $q, $s); } };
foreach ([1, 2, 3, 4] as $k) $jugar($S1[$k], 3, 80, 4);
$jugar($S1[5], 8, 40, 2);   // 8 aportes chicos
$jugar($S2[1], 2, 70, 4);
$jugar($SOLO, 3, 90, 5);
$prep = array_map(fn($s) => (int) Db::valor('SELECT puntos_prep FROM copa_servidores WHERE copa_id = ? AND servidor_id = ?', [$CID, $s]), [1, 2, 3]);
$sumaAportes = array_map(fn($s) => (int) Db::valor('SELECT COALESCE(SUM(puntos), 0) FROM copa_aportes WHERE copa_id = ? AND servidor_id = ?', [$CID, $s]), [1, 2, 3]);
check('Puntos de preparación de cada servidor = suma de sus aportes validados', $sumaAportes, $prep);
check('Los aportes salen solo de intentos validados', 0, (int) Db::valor("SELECT COUNT(*) FROM copa_aportes a JOIN copa_intentos i ON 'intento:' || i.id = a.ref WHERE i.estado <> 'validado'"));
$e = Copas::estado($S1[3]);
check('GET copa: mi aporte, mi posición en el servidor, top aportantes con siglas', [true, true, 'PCH'],
    [$e['yo']['aporte'] > 0, is_int($e['yo']['posicion_en_servidor']), $e['top_aportantes'][array_search('Quito 1', array_column($e['top_aportantes'], 'alias'))]['siglas']]);

// =====================================================================
titulo('Sábado completo con 3 servidores (motor de prueba)');
$PET = [];
$MOTOR = 'ok';
// Motor de prueba: calidad = 40 + 4 × (habilidad total del equipo) − (cámaras faltantes); la casa (los que faltan) = 45.
$motorPrueba = function (array $p) use (&$PET, &$MOTOR): ?array {
    $PET[] = $p;
    if ($MOTOR === 'caido') return null;
    $q = fn(?array $e) => $e === null ? 45 : min(100, 40 + 2 * array_sum(array_column($e['staff'], 'skill')));
    $o = []; $ta = 0; $tb = 0;
    for ($n = 0; $n < 5; $n++) {
        $A = $p['planA'][$n] ?? null; $B = $p['planB'][$n] ?? null;
        $qa = $q($A); $qb = $q($B); $ta += $qa; $tb += $qb;
        $o[] = ['n' => $n + 1, 'tipo' => $p['contratos'][$n]['type'], 'calidad_a' => $qa, 'calidad_b' => $qb, 'ganador' => $qa > $qb ? 'a' : ($qb > $qa ? 'b' : 'empate'),
                'casa_a' => $A === null, 'casa_b' => $B === null, 'orden_a' => $A === null ? null : $n, 'orden_b' => $B === null ? null : $n];
    }
    return ['ok' => true, 'partidos' => $o, 'calidad_total_a' => $ta, 'calidad_total_b' => $tb];
};
Copas::$motor = $motorPrueba;
$reloj($en('2026-10-31 09:00:00'));
$r = Copas::tareaProgramada();
check('Sábado 09:00: la copa pasa a batalla, todavía no se juega nada', ['batalla', 0], [Db::valor('SELECT fase FROM copas WHERE id = ?', [$CID]), $r['cruces']]);
check('Registrar equipo en batalla -> 409 fase', [409, 'fase'], falla(fn() => Copas::registrarEquipo($S1[1], $equipo(3))));
check('Pedir intento en batalla -> 409 fase', [409, 'fase'], falla(fn() => Copas::iniciarIntento($S1[1])));
$prepFinal = array_map(fn($s) => (int) Db::valor('SELECT puntos_prep FROM copa_servidores WHERE copa_id = ? AND servidor_id = ?', [$CID, $s]), [1, 2, 3]);
$MOTOR = 'caido';
$reloj($en('2026-10-31 10:00:00'));
$r = Copas::tareaProgramada();
check('10:00 con el motor caído: el cruce queda pendiente (se reintenta)', [0, 1, 'pendiente'], [$r['cruces'], $r['fallidos'], Db::valor('SELECT estado FROM copa_cruces WHERE copa_id = ? ORDER BY hora LIMIT 1', [$CID])]);
$MOTOR = 'ok';
$reloj($en('2026-10-31 10:10:00'));
$r = Copas::tareaProgramada();
check('10:10: se juega el primer cruce (y solo ese)', [1, 1], [$r['cruces'], (int) Db::valor("SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$CID])]);
$r = Copas::tareaProgramada();
check('La tarea otra vez no vuelve a jugarlo', 0, $r['cruces']);
$X1 = Db::fila("SELECT * FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$CID]);
$rj = Copas::rejugarCruce((int) $X1['id'], 'prueba');
check('Centro de Control: rejugar el cruce (misma semilla) da el mismo resultado y queda auditado', [(int) $X1['puntos_a'], (int) $X1['puntos_b'], 'jugado', json_decode($X1['detalle_json'], true)['semilla'], true],
    [$rj['puntos_a'], $rj['puntos_b'], $rj['estado'], json_decode((string) Db::valor('SELECT detalle_json FROM copa_cruces WHERE id = ?', [$X1['id']]), true)['semilla'], (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'copa_rejugar'")]);
check('Forzar una fase hacia atrás -> 409 fase', [409, 'fase'], falla(fn() => Copas::forzarFase($CID, 'preparacion', 'prueba')));
$ultima = end($PET);
check('Petición al motor: semilla, clave del torneo, 5 contratos iguales para los dos, planteles de hasta 5', [true, $C['torneo_key'], 5, true],
    [is_int($ultima['seed']), $ultima['torneo'], count($ultima['contratos']), count($ultima['planA']) <= 5 && count($ultima['planB']) <= 5]);
$PET = [];
$reloj($en('2026-10-31 14:00:00')); Copas::tareaProgramada();
$reloj($en('2026-10-31 18:00:00')); Copas::tareaProgramada();
check('A las 14:00 y 18:00 los otros dos cruces: 3 jugados', 3, (int) Db::valor("SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$CID]));
check('Las 3 peticiones de la tarde', 2, count($PET));
$pl1 = Copas::plantel($CID, 1);
check('Plantel de Quito: los 5 de más poder (el mirón con habilidad 1 queda fuera)', [5, false], [count($pl1), in_array($NADA, array_column($pl1, 'jugador_id'), true)]);
$cr3 = Db::fila('SELECT * FROM copa_cruces WHERE copa_id = ? AND (servidor_a = 3 OR servidor_b = 3) ORDER BY hora LIMIT 1', [$CID]);
$d3 = json_decode($cr3['detalle_json'], true);
$lado = (int) $cr3['servidor_a'] === 3 ? 'a' : 'b';
check('Servidor chico (1 productora): juega con 1 equipo + 4 "de la casa" y compite', [1, 4, 5],
    [count(array_filter($d3['planteles'][$lado], fn($x) => !$x['casa'])), count(array_filter($d3['planteles'][$lado], fn($x) => $x['casa'])), count($d3['partidos'])]);
check('…el partido de la casa sale con su nombre', 'Equipo de la casa', $d3['partidos'][4]['equipo_' . $lado]);
// Equipo de la casa = el MEDIANO por poder de los equipos de quienes aportaron (el mirón, sin aporte, no cuenta)
$poderes = array_map('intval', array_column(Db::todas('SELECT poder FROM copa_equipos e WHERE copa_id = ? AND EXISTS (SELECT 1 FROM copa_aportes a WHERE a.copa_id = e.copa_id AND a.jugador_id = e.jugador_id) ORDER BY poder', [$CID]), 'poder'));
$casa = Copas::equipoCasa($CID);
check('Casa mediana: el del medio por poder entre los que aportaron (sin el mirón)', [$poderes[intdiv(count($poderes) - 1, 2)], true, (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM copa_aportes WHERE copa_id = ?', [$CID]), 0],
    [$casa['poder'], $casa['casa'], count($poderes), (int) Db::valor('SELECT COUNT(*) FROM copa_aportes WHERE copa_id = ? AND jugador_id = ?', [$CID, $NADA])]);
$p3 = Copas::peticionCruce(Db::fila('SELECT * FROM copas WHERE id = ?', [$CID]), $cr3);
$plan3 = $p3[$lado === 'a' ? 'planA' : 'planB'];
check('…va copiada en los 4 lugares vacíos del servidor chico (equipos completos para batalla.js)', [5, 4, true, $casa['poder']],
    [count($plan3), count(array_filter($plan3, fn($e) => !empty($e['casa']))), end($plan3)['staff'] === $casa['staff'] && end($plan3)['equip'] === $casa['equip'], $d3['casa_poder']]);
// Bono mixto, congelado al jugar el primer cruce
$B = Copas::bonos($CID);
$maxPrep = max(array_column($B, 'prep')); $maxProm = max(array_column($B, 'prom'));
$okB = true;
foreach ($B as $sid => $b) $okB = $okB && $b['prep'] === $prepFinal[$sid - 1] && $b['bono'] === Copas::bono($b['prep'], $maxPrep, $b['prom'], $maxProm) && abs($b['prom'] - $b['prep'] / $b['activos']) < 0.01;
check('Bono de cada servidor = mixto con prom = prep / activos de 7 días (Cuenca: 1 activa)', [true, 1, true], [$okB, $B[3]['activos'], (bool) Db::valor("SELECT 1 FROM copa_ajustes WHERE clave = ?", ['bonos:' . $CID])]);
$okPuntos = true;
foreach (Db::todas('SELECT * FROM copa_cruces WHERE copa_id = ?', [$CID]) as $x) {
    $d = json_decode($x['detalle_json'], true);
    $bat = fn(string $l) => array_sum(array_map(fn($p) => $p['ganador'] === $l ? 10 : ($p['ganador'] === 'empate' ? 5 : 0), $d['partidos']));
    $okPuntos = $okPuntos && (int) $x['puntos_a'] === $bat('a') + $B[(int) $x['servidor_a']]['bono'] && (int) $x['puntos_b'] === $bat('b') + $B[(int) $x['servidor_b']]['bono']
        && $d['bono_a'] === $B[(int) $x['servidor_a']]['bono'];
}
check('Puntos de cada cruce = partidos (10 ganar, 5 empatar) + bono mixto', true, $okPuntos);
check('GET copa muestra el bono y los activos de cada servidor', [$B[3]['bono'], 1], (function () use ($SOLO) { $e = Copas::estado($SOLO); $s = current(array_filter($e['servidores'], fn($x) => $x['yo'])); return [$s['bono'], $s['activos']]; })());
$tabla = Db::todas('SELECT * FROM copa_servidores WHERE copa_id = ? ORDER BY posicion', [$CID]);
check('Tabla: 3 cruces → 6 resultados, puntos 3/1/0, posiciones 1..3', [6, true, [1, 2, 3]],
    [array_sum(array_map(fn($s) => $s['ganados'] + $s['empatados'] + $s['perdidos'], $tabla)),
     (bool) array_product(array_map(fn($s) => (int) $s['puntos_tabla'] === 3 * $s['ganados'] + $s['empatados'], $tabla)), array_map('intval', array_column($tabla, 'posicion'))]);
check('Diferencia de calidad: suma cero', 0, array_sum(array_map('intval', array_column($tabla, 'dif_calidad'))));
$reloj($en('2026-10-31 19:00:00'));
check('19:00: todavía no se cierra', false, Copas::cerrar($CID));

// =====================================================================
titulo('Cierre y premios (una sola vez)');
$antes = (int) Db::valor('SELECT COUNT(*) FROM entregas');
$reloj($en('2026-10-31 20:00:00'));
$r = Copas::tareaProgramada();
$CAMP = (int) Db::valor('SELECT servidor_id FROM copa_servidores WHERE copa_id = ? AND posicion = 1', [$CID]);
$SUB = (int) Db::valor('SELECT servidor_id FROM copa_servidores WHERE copa_id = ? AND posicion = 2', [$CID]);
check('20:00: la tarea cierra la copa', [1, 'cerrada'], [$r['cerradas'], Db::valor('SELECT fase FROM copas WHERE id = ?', [$CID])]);
$entregasCopa = (int) Db::valor("SELECT COUNT(*) FROM entregas WHERE origen LIKE 'copa:%'");
check('Hay entregas de la copa', true, $entregasCopa > 0 && (int) Db::valor('SELECT COUNT(*) FROM entregas') === $antes + $entregasCopa);
Copas::tareaProgramada();
$reloj($en('2026-11-01 12:00:00'));
Copas::tareaProgramada();
check('La tarea otra vez (y al otro día): ni un premio más', [$entregasCopa, false], [(int) Db::valor("SELECT COUNT(*) FROM entregas WHERE origen LIKE 'copa:%'"), Copas::cerrar($CID)]);
check('copa_premios no tiene repetidos', 0, (int) Db::valor('SELECT COUNT(*) FROM (SELECT copa_id, jugador_id, clave, COUNT(*) n FROM copa_premios GROUP BY 1, 2, 3 HAVING n > 1)'));
$aportCamp = array_map('intval', array_column(Copas::aportantes($CID, $CAMP), 'jugador_id'));
$campeones = array_map('intval', array_column(Db::todas("SELECT jugador_id FROM copa_premios WHERE copa_id = ? AND clave = 'campeon' ORDER BY jugador_id", [$CID]), 'jugador_id'));
sort($aportCamp);
check('Campeón: TODOS los que aportaron al servidor campeón reciben el premio de campeón', $aportCamp, $campeones);
check('…y los top 10 aportantes el extra', min(10, count($aportCamp)), (int) Db::valor("SELECT COUNT(*) FROM copa_premios WHERE copa_id = ? AND clave = 'top10'", [$CID]));
$j1 = $aportCamp[0];
$tipos = array_column(Db::todas("SELECT tipo FROM entregas WHERE jugador_id = ? AND origen = ?", [$j1, 'copa:' . $CID . ':campeon']), 'tipo');
sort($tipos);
check('Premio de campeón: dinero, fama, trofeo y materiales de sede (js/sede.js existe)', ['dinero', 'fama', 'materiales', 'materiales', 'materiales', 'materiales', 'trofeo'], $tipos);
$tro = Db::fila("SELECT * FROM entregas WHERE jugador_id = ? AND tipo = 'trofeo'", [$j1]);
check('Trofeo: item = clave del trofeo, cantidad 1; GET copa lo muestra con su nombre', [Copas::trofeo($C)['clave'], 1, Copas::trofeo($C)['nombre']],
    [$tro['item'], (int) $tro['cantidad'], Copas::estado($j1)['yo']['trofeos'][0]['nombre'] ?? null]);
check('Materiales: item = material de la sede, cantidad = cuánto', true, (bool) Db::valor("SELECT 1 FROM entregas WHERE jugador_id = ? AND tipo = 'materiales' AND item = 'chips' AND cantidad = 2", [$j1]));
check('El mirón (registró pero no aportó) no recibe nada', 0, (int) Db::valor('SELECT COUNT(*) FROM copa_premios WHERE jugador_id = ?', [$NADA]));
$otros = array_values(array_diff([1, 2, 3], [$CAMP]));
$okPart = true;
foreach ($otros as $s) foreach (Copas::aportantes($CID, $s) as $x) $okPart = $okPart && (bool) Db::valor("SELECT 1 FROM copa_premios WHERE copa_id = ? AND jugador_id = ? AND clave = 'participacion'", [$CID, $x['jugador_id']]);
check('Los demás servidores: premio de participación por aporte (subcampeón con extra)', [true, true, 0],
    [$okPart, count(Copas::aportantes($CID, $SUB)) === (int) Db::valor("SELECT COUNT(*) FROM copa_premios WHERE copa_id = ? AND clave = 'subcampeon'", [$CID]),
     (int) Db::valor("SELECT COUNT(*) FROM copa_premios p WHERE p.copa_id = ? AND p.clave = 'campeon' AND p.jugador_id IN (SELECT jugador_id FROM copa_aportes WHERE servidor_id <> ?)", [$CID, $CAMP])]);
check('Rejugar un cruce de una copa cerrada -> 409 copa_cerrada', [409, 'copa_cerrada'], falla(fn() => Copas::rejugarCruce((int) $X1['id'], 'prueba')));
check('Entregas visibles para el juego (Monedero::entregas) con los tipos nuevos', true, (bool) array_filter(Monedero::entregas($j1), fn($x) => $x['tipo'] === 'trofeo'));
check('Anuncio en el chat de cada servidor', 3, (int) Db::valor("SELECT COUNT(DISTINCT canal) FROM chat_mensajes WHERE canal LIKE 'servidor:%' AND texto LIKE '%' || ? || '%'", [$C['nombre']]));
check('Aviso personal a cada premiado', (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM copa_premios WHERE copa_id = ?', [$CID]), (int) Db::valor("SELECT COUNT(DISTINCT canal) FROM chat_mensajes WHERE canal LIKE 'sistema:%'"));

// =====================================================================
titulo('Tabla y desempates');
Db::q("INSERT INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (99, '2020-W01', 'el_gran_tazon', 'Prueba', 'batalla', 0, 1, 0)");
$T = Db::ultimoId();
$cruce = function (int $a, int $b, int $pa, int $pb, int $ta, int $tb) use ($T) {
    Db::q("INSERT INTO copa_cruces (copa_id, ronda, servidor_a, servidor_b, hora, estado, puntos_a, puntos_b, detalle_json) VALUES (?, 1, ?, ?, 0, 'jugado', ?, ?, ?)",
        [$T, $a, $b, $pa, $pb, json_encode(['calidad_total_a' => $ta, 'calidad_total_b' => $tb])]);
};
foreach ([[11, 100], [12, 300], [13, 200]] as [$s, $p]) Db::q('INSERT INTO copa_servidores (copa_id, servidor_id, puntos_prep) VALUES (?, ?, ?)', [$T, $s, $p]);
$cruce(11, 12, 40, 30, 300, 290); $cruce(12, 13, 45, 20, 320, 250); $cruce(13, 11, 35, 30, 280, 270);
Copas::recalcularTabla($T);
$pos = fn() => array_map('intval', array_column(Db::todas('SELECT servidor_id FROM copa_servidores WHERE copa_id = ? ORDER BY posicion', [$T]), 'servidor_id'));
check('Triple empate a 3 puntos: decide la diferencia de calidad (12: +60, 13: -60... )', [12, 11, 13], $pos());
Db::q('DELETE FROM copa_cruces WHERE copa_id = ?', [$T]);
$cruce(11, 12, 40, 30, 300, 290); $cruce(12, 13, 45, 20, 290, 280); $cruce(13, 11, 35, 30, 290, 280);
Copas::recalcularTabla($T);
check('Mismos puntos y misma diferencia: decide la preparación (12: 300 > 13: 200 > 11: 100)', [12, 13, 11], $pos());
Db::q('DELETE FROM copa_cruces WHERE copa_id = ?', [$T]);
$cruce(11, 12, 30, 30, 300, 300);
Copas::recalcularTabla($T);
check('Empate de cruce = 1 punto para cada uno', [1, 1, 0], array_map('intval', array_column(Db::todas('SELECT puntos_tabla FROM copa_servidores WHERE copa_id = ? ORDER BY servidor_id', [$T]), 'puntos_tabla')));
Copas::recalcularTabla($T);
check('Recalcular otra vez da lo mismo (idempotente)', [1, 1, 0], array_map('intval', array_column(Db::todas('SELECT puntos_tabla FROM copa_servidores WHERE copa_id = ? ORDER BY servidor_id', [$T]), 'puntos_tabla')));
Db::q('DELETE FROM copas WHERE id = ?', [$T]);
Db::q('DELETE FROM copa_servidores WHERE copa_id = ?', [$T]);
Db::q('DELETE FROM copa_cruces WHERE copa_id = ?', [$T]);

// =====================================================================
titulo('Semana siguiente: copa nueva, historial');
$reloj($en('2026-11-02 08:00:00'));
Copas::tareaProgramada();
$e = Copas::estado($S1[1]);
$W2 = Db::fila("SELECT * FROM copas WHERE semana = '2026-W45'");
check('Sin aportes en la semana: no hay casa mediana (batalla.js usa su casa por defecto) y los planteles van incompletos', [null, 0],
    [Copas::equipoCasa((int) $W2['id']), count(Copas::peticionCruce($W2, Db::fila('SELECT * FROM copa_cruces WHERE copa_id = ? LIMIT 1', [$W2['id']]))['planA'])]);
check('Lunes: copa nueva (otro torneo), registro de nuevo, historial con el campeón', ['2026-W45', 'preparacion', true, false, '2026-W44', Db::valor('SELECT nombre FROM servidores WHERE id = ?', [$CAMP])],
    [$e['copa']['semana'], $e['copa']['fase'], $e['copa']['torneo_key'] !== $C['torneo_key'], $e['yo']['equipo_registrado'], $e['historial'][0]['semana'] ?? null, $e['historial'][0]['campeon'] ?? null]);

// =====================================================================
titulo('Motor de verdad (server/eventos/batalla.js) y validador de verdad');
if (!$MOTOR_OK) echo "  AVISO: node o server/eventos/batalla.js no están: se salta\n";
if ($MOTOR_OK) {
    Copas::$motor = null;
    $tor = Copas::batallaNode(['accion' => 'torneos'], 10);
    check('Las claves de los torneos son las del motor', array_keys(Copas::TORNEOS), array_keys($tor['torneos'] ?? []));
    $okTipos = true;
    foreach (Copas::TORNEOS as $k => $t) $okTipos = $okTipos && $t['tipos'] === ($tor['torneos'][$k]['tipos'] ?? null) && $t['nombre'] === ($tor['torneos'][$k]['nombre'] ?? null);
    check('…con los mismos nombres y tipos de partido', true, $okTipos);
    $W = (int) Db::valor("SELECT id FROM copas WHERE semana = '2026-W45'");
    $reg = Copas::registrarEquipo($S1[1], $equipo(3));
    check('Poder del motor ({accion: poder}) al registrar', [true, (int) (Copas::batallaNode(['accion' => 'poder', 'equipo' => ['staff' => $reg['equipo']['staff'], 'equip' => $reg['equipo']['equip']]], 10)['poder'] ?? -1)],
        [$reg['equipo']['poder'] > 0, $reg['equipo']['poder']]);
    Copas::registrarEquipo($S1[2], $equipo(2));
    Copas::registrarEquipo($SOLO, $equipo(3));
    $x = Db::fila('SELECT * FROM copa_cruces WHERE copa_id = ? AND ((servidor_a = 1 AND servidor_b = 3) OR (servidor_a = 3 AND servidor_b = 1))', [$W]);
    $pet = Copas::peticionCruce(Db::fila('SELECT * FROM copas WHERE id = ?', [$W]), $x);
    $r1 = Copas::batallaNode($pet); $r2 = Copas::batallaNode($pet);
    if (!($r1['ok'] ?? false)) echo '  (motor: ' . json_encode($r1, JSON_UNESCAPED_UNICODE) . ")\n";
    check('batalla.js juega el cruce: ok, 5 partidos, determinista (misma entrada → misma salida)', [true, 5, true], [$r1['ok'] ?? null, count($r1['partidos'] ?? []), $r1 === $r2]);
    $reloj($en('2026-11-07 18:30:00'));
    $r = Copas::tareaProgramada();
    check('Sábado con el motor de verdad: los 3 cruces se juegan por la tarea', [3, 0], [$r['cruces'], $r['fallidos']]);
    $d = json_decode((string) Db::valor('SELECT detalle_json FROM copa_cruces WHERE id = ?', [$x['id']]), true);
    $lado = (int) $x['servidor_a'] === 3 ? 'a' : 'b';
    check('…Cuenca (1 productora) juega 1 partido con su equipo y 4 con la casa', [1, 4], [count(array_filter($d['partidos'], fn($p) => $p['equipo_' . $lado] === 'Cuenca Sola')), count(array_filter($d['partidos'], fn($p) => $p['casa_' . $lado]))]);
    $reloj($en('2026-11-07 20:00:00'));
    check('…y cierra con premios', 1, Copas::tareaProgramada()['cerradas']);
}
if (!$VALIDADOR_OK) echo "  AVISO: validador no disponible: se salta el intento con el validador de verdad\n";
if ($VALIDADOR_OK) {
    Copas::$validador = null;
    $reloj($en('2026-11-10 10:00:00'));
    Copas::tareaProgramada();
    Copas::registrarEquipo($S1[3], $equipo(3));
    $it = Copas::iniciarIntento($S1[3]);
    $jugarReal = function (array $it) use ($NODE): ?array {
        $js = 'const V=require(process.argv[1]);let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const it=JSON.parse(d);'
            . 'const p=V.play(it,(inc)=>{const c=inc.choices.find(x=>x.ok);return c?c.i:0;});const v=V.validate(Object.assign({},it,{decisiones:p.decisiones}));'
            . 'process.stdout.write(JSON.stringify({decisiones:p.decisiones,calidad:v.calidad,estrellas:v.estrellas}));});';
        $proc = proc_open([$NODE, '-e', $js, dirname(__DIR__) . '/validador/validador.js'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
        fwrite($tubos[0], json_encode(['seed' => $it['seed'], 'contrato' => $it['contrato'], 'equipo' => $it['equipo'], 'contexto' => $it['contexto'], 'vip' => $it['vip']])); fclose($tubos[0]);
        $jug = json_decode((string) stream_get_contents($tubos[1]), true); $err = stream_get_contents($tubos[2]); fclose($tubos[1]); fclose($tubos[2]); proc_close($proc);
        if (!is_array($jug)) echo "  (node: $err)\n";
        return is_array($jug) ? $jug : null;
    };
    $jug = $jugarReal($it);
    $r = Copas::enviarIntento($S1[3], ['intento_id' => $it['id'], 'decisiones' => $jug['decisiones'] ?? [], 'resultado' => ['calidad' => $jug['calidad'] ?? 0, 'estrellas' => $jug['estrellas'] ?? 1]]);
    $esperado = Copas::puntosIntento((int) ($jug['calidad'] ?? -1), (int) ($jug['estrellas'] ?? 0));
    check('Intento jugado con la lógica de verdad (resultado {calidad, estrellas}) y repetido por el validador: suma calidad + estrellas', ['validado', $esperado, true, false],
        [$r['resultado']['estado'], $r['resultado']['puntos'], $r['resultado']['valido'], $r['resultado']['sospechoso']]);
    $it = Copas::iniciarIntento($S1[3]);
    $jug = $jugarReal($it);
    $esperado = Copas::puntosIntento((int) ($jug['calidad'] ?? -1), (int) ($jug['estrellas'] ?? 0));
    $r = Copas::enviarIntento($S1[3], ['intento_id' => $it['id'], 'decisiones' => $jug['decisiones'] ?? [], 'resultado' => ['quality' => 100, 'stars' => 5]]);
    check('Jugada real pero el juego dice 100 y 5 estrellas: cuenta lo del validador y queda sospechoso', [$esperado, false, true], [$r['resultado']['puntos'], $r['resultado']['valido'], $r['resultado']['sospechoso']]);
}

// =====================================================================
titulo('Centro de Control: forzar fase');
Copas::$validador = fn(array $it) => ['valido' => true, 'calidad' => 70, 'estrellas' => 4, 'detalle' => []];
Copas::$motor = $motorPrueba;
$reloj($en('2026-11-11 10:00:00'));
Copas::tareaProgramada();
$W3 = (int) Db::valor("SELECT id FROM copas WHERE semana = '2026-W46'");
Copas::registrarEquipo($S2[3], $equipo(3));
$x = Copas::iniciarIntento($S2[3]); Copas::enviarIntento($S2[3], ['intento_id' => $x['id'], 'decisiones' => [], 'resultado' => ['calidad' => 70, 'estrellas' => 4]]);
Copas::forzarFase($W3, 'batalla', 'prueba');
check('Miércoles: forzar a batalla (registro e intentos cerrados)', ['batalla', [409, 'fase']], [Db::valor('SELECT fase FROM copas WHERE id = ?', [$W3]), falla(fn() => Copas::iniciarIntento($S2[3]))]);
check('Forzar la misma fase -> 409', [409, 'fase'], falla(fn() => Copas::forzarFase($W3, 'batalla', 'prueba')));
Copas::forzarFase($W3, 'cerrada', 'prueba');
check('Forzar a cerrada: juega los 3 cruces sin esperar la hora, cierra y premia una vez; auditado', ['cerrada', 3, true, true],
    [Db::valor('SELECT fase FROM copas WHERE id = ?', [$W3]), (int) Db::valor("SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$W3]),
     (bool) Db::valor('SELECT 1 FROM copa_premios WHERE copa_id = ? AND jugador_id = ?', [$W3, $S2[3]]), (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'copa_fase'") === 2]);
$n = (int) Db::valor("SELECT COUNT(*) FROM entregas WHERE origen LIKE ?", ['copa:' . $W3 . ':%']);
Copas::tareaProgramada();
check('…y la tarea después no entrega nada más', $n, (int) Db::valor("SELECT COUNT(*) FROM entregas WHERE origen LIKE ?", ['copa:' . $W3 . ':%']));

// =====================================================================
titulo('Tarea programada (server/bin/copas.php) y rutas por HTTP (copia de api.php + la línea de INTEGRAR_COPAS.md)');
// Reloj congelado también en la tarea y en "php -S" (server/tests/reloj_prueba.php): martes de la semana siguiente a la
// última de la simulación (con el reloj de verdad, la copa de hoy podía ser una que la simulación ya jugó y cerró)
$FIJO = $en('2026-11-17 10:00:00');
$reloj($FIJO); Copas::$motor = null; Copas::$validador = null;
$PREP = ['-d', 'auto_prepend_file=' . __DIR__ . '/reloj_prueba.php'];
$sal = []; exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config.env') . ' ENVIVO_PRUEBA_AHORA=' . $FIJO . ' php ' . implode(' ', array_map('escapeshellarg', $PREP)) . ' ' . escapeshellarg(dirname(__DIR__) . '/bin/copas.php') . ' 2>&1', $sal, $cod);
check('php server/bin/copas.php termina bien', [0, true], [$cod, str_contains(implode("\n", $sal), 'copas OK')]);
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$linea = "    if (\\EnVivo\\CopasApi::esRuta(\$ruta)) \\EnVivo\\CopasApi::responder(\$ruta, \$metodo, requiere_sesion());\n";
$ancla = "    if (\\EnVivo\\LigaApi::esRuta(\$ruta))";
if (!str_contains($api, 'CopasApi::')) {
    check('api.php tiene el punto donde va la línea (después de LigaApi)', true, str_contains($api, $ancla));
    $api = str_replace($ancla, $linea . $ancla, $api);
}
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . '; require ' . var_export(__DIR__ . '/reloj_prueba.php', true) . ';', $api);
file_put_contents($TMP . '/api.php', $api);
$puerto = (int) (getenv('P_APP') ?: 8900 + random_int(0, 500));
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-S', '127.0.0.1:' . $puerto, $TMP . '/api.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tub, null, ['ENVIVO_CONFIG' => $TMP . '/config.env', 'ENVIVO_PRUEBA_AHORA' => (string) $FIJO, 'PATH' => getenv('PATH')] + envReloj());
for ($k = 0; $k < 50; $k++) { if (@fsockopen('127.0.0.1', $puerto)) break; usleep(100000); }
$sesion = function (int $j): string { $tok = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $tok), $j, time(), time() + 3600]); return $tok; };
$http = function (string $metodo, string $ruta, ?array $cuerpo = null, ?string $tok = null, bool $cabecera = true) use ($puerto): array {
    $ch = curl_init('http://127.0.0.1:' . $puerto . $ruta);
    $h = ['Content-Type: application/json'];
    if ($cabecera) $h[] = 'X-Envivo: 1';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30]
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []) + ($tok ? [CURLOPT_COOKIE => 'envivo_s=' . $tok] : []));
    $b = curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode((string) $b, true)];
};
$J = $nuevoJugador('Productora HTTP', 2);
$tok = $sesion($J);
$prepAhora = Copas::fase($FIJO) === 'preparacion';
check('El reloj congelado de las rutas cae en preparación (martes)', true, $prepAhora);
$cod = fn(array $r) => [$r[0], is_string($r[1]['codigo'] ?? null) && $r[1]['codigo'] !== '', ($r[1]['ok'] ?? null)];
check('GET /api/copa sin sesión -> 401 con codigo', [401, true, false], $cod($http('GET', '/api/copa')));
check('POST /api/copa/intento/enviar sin sesión -> 401 con codigo', [401, true, false], $cod($http('POST', '/api/copa/intento/enviar', ['intento_id' => 1, 'decisiones' => []])));
check('POST /api/copa/equipo sin X-Envivo -> 403 con codigo', [403, true, false], $cod($http('POST', '/api/copa/equipo', $equipo(3), $tok, false)));
[$c, $j] = $http('GET', '/api/copa', null, $tok);
check('GET /api/copa -> 200 con copa, universo, servidores, cruces, yo, top_aportantes, historial', [200, true, 3, ['aporte', 'posicion_en_servidor', 'equipo_registrado', 'intento_abierto']],
    [$c, isset($j['copa']['id'], $j['copa']['nombre'], $j['copa']['torneo_key'], $j['copa']['fase'], $j['copa']['inicio'], $j['copa']['fin'], $j['copa']['ahora'], $j['universo']['id'], $j['top_aportantes'], $j['historial'], $j['cruces']),
     count($j['servidores'] ?? []), array_values(array_intersect(['aporte', 'posicion_en_servidor', 'equipo_registrado', 'intento_abierto'], array_keys($j['yo'] ?? [])))]);
check('…servidores con g, e, p, posicion, yo', true, isset($j['servidores'][0]['g'], $j['servidores'][0]['e'], $j['servidores'][0]['p'], $j['servidores'][0]['puntos_prep'], $j['servidores'][0]['puntos_tabla']) && array_key_exists('posicion', $j['servidores'][0]) && count(array_filter($j['servidores'], fn($s) => $s['yo'])) === 1);
[$c, $j] = $http('POST', '/api/copa/equipo', $equipo(3), $tok);
check('POST /api/copa/equipo -> ' . ($prepAhora ? '200 registrado' : '409 fase'), $prepAhora ? [200, true] : [409, 'fase'], $prepAhora ? [$c, $j['copa']['yo']['equipo_registrado'] ?? null] : [$c, $j['codigo'] ?? null]);
check('POST /api/copa/equipo con habilidad de más -> ' . ($prepAhora ? '400 habilidad' : '409 fase'), $prepAhora ? [400, 'habilidad'] : [409, 'fase'], (function () use ($http, $tok, $equipo) { [$c, $j] = $http('POST', '/api/copa/equipo', $equipo(5), $tok); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('POST', '/api/copa/intento/iniciar', [], $tok);
check('POST /api/copa/intento/iniciar -> ' . ($prepAhora ? '200 {id, seed, contrato, equipo, contexto, vip, firma, vence}' : '409 fase'), $prepAhora ? [200, true] : [409, 'fase'],
    $prepAhora ? [$c, isset($j['id'], $j['seed'], $j['contrato'], $j['equipo'], $j['contexto'], $j['firma'], $j['vence']) && array_key_exists('vip', $j)] : [$c, $j['codigo'] ?? null]);
if ($prepAhora) {
    [$c, $k] = $http('POST', '/api/copa/intento/enviar', ['intento_id' => $j['id'], 'decisiones' => [0], 'resultado' => ['calidad' => 99, 'estrellas' => 5]], $tok);
    check('POST /api/copa/intento/enviar -> 200/202 {resultado: {calidad, estrellas, valido, puntos}, copa}', [true, true],
        [in_array($c, [200, 202], true), array_key_exists('calidad', $k['resultado'] ?? []) && array_key_exists('valido', $k['resultado']) && is_int($k['resultado']['puntos'] ?? null) && isset($k['copa']['copa'])]);
    check('…enviar otra vez -> 409 ya_enviado', [409, 'ya_enviado'], (function () use ($http, $tok, $j) { [$c, $k] = $http('POST', '/api/copa/intento/enviar', ['intento_id' => $j['id'], 'decisiones' => [0]], $tok); return [$c, $k['codigo'] ?? null]; })());
}
check('POST /api/copa/intento/enviar sin intento_id -> 400 con codigo', [400, true, false], $cod($http('POST', '/api/copa/intento/enviar', ['decisiones' => []], $tok)));
check('POST /api/copa/intento/enviar de un intento que no existe -> 404 no_existe', [404, 'no_existe'], (function () use ($http, $tok) { [$c, $k] = $http('POST', '/api/copa/intento/enviar', ['intento_id' => 999999, 'decisiones' => [], 'resultado' => ['calidad' => 50, 'estrellas' => 3]], $tok); return [$c, $k['codigo'] ?? null]; })());
check('GET /api/copa/equipo -> 405 con codigo', [405, true, false], $cod($http('GET', '/api/copa/equipo', null, $tok)));
check('POST /api/copa -> 405 con codigo', [405, true, false], $cod($http('POST', '/api/copa', [], $tok)));
check('GET /api/copa/otra -> 404 con codigo', [404, true, false], $cod($http('GET', '/api/copa/otra', null, $tok)));
check('Las demás rutas siguen igual: GET /api/estado -> 200', 200, $http('GET', '/api/estado', null, $tok)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nCopas: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
