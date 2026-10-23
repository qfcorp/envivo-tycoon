<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Liga Semanal de Productoras (server/src/Liga.php):
// base SQLite TEMPORAL, asociaciones y jugadores de prueba, y una simulación de 3 semanas con el reloj de la liga
// congelado: encargos, intentos (modo firma y modo repetición con el validador de verdad), cambio de semana,
// ascensos/descensos, fichas y tienda. Al final, las mismas rutas por HTTP (php -S + router_liga.php).
// Uso:  php server/tests/pruebas_liga.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_liga_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$NODE = trim((string) shell_exec('command -v node 2>/dev/null'));
// El validador de verdad solo si node existe y js/logic.js carga (otro ayudante puede estar a mitad de un cambio)
$VALIDADOR_OK = false;
if ($NODE !== '') { exec(escapeshellarg($NODE) . ' ' . escapeshellarg(dirname(__DIR__) . '/validador/validador.js') . ' --version 2>&1', $vo, $vc); $VALIDADOR_OK = $vc === 0; }
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nLIGA_SECRETO=secreto-de-prueba\n"
    . ($NODE !== '' ? "VALIDADOR_NODE=$NODE\n" : '') . "VALIDADOR_URL=http://127.0.0.1:1\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Fallo, Liga, Monedero, Social};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
/** Ejecuta $f y devuelve [código HTTP, codigo] del Fallo (o [200, null] si no falló). */
function falla(callable $f): array
{
    try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; }
}
$lunes = fn(string $dia) => (new DateTimeImmutable($dia . ' 00:00:00', new DateTimeZone('America/Guayaquil')))->getTimestamp();
$reloj = function (int $t) { Liga::fijarReloj($t); };
$mas = function (int $seg) { Liga::fijarReloj(Liga::ahora() + $seg); };

Db::pdo();
Liga::preparar();

// ------------------------------------------------------------------ jugadores y asociaciones de prueba
$nuevoJugador = function (string $alias): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, 1, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '@prueba.example', $alias, 'x', time(), $alias, strtolower($alias)]);
    return Db::ultimoId();
};
$ASOC = []; $PRES = [];
$NOMBRES = ['Andes', 'Pichincha', 'Cotopaxi', 'Chimborazo', 'Tungurahua', 'Imbabura', 'Cayambe', 'Antisana', 'Pasochoa', 'Rumiñahui',
            'Ilinizas', 'Corazón', 'Atacazo', 'Sangay', 'Altar', 'Carihuairazo', 'Guagua'];
for ($i = 0; $i < 17; $i++) {
    $p = $nuevoJugador('Productora ' . $NOMBRES[$i]);
    $r = Social::crear($p, ['nombre' => 'Asociación ' . $NOMBRES[$i], 'siglas' => sprintf('L%02d', $i), 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
    $ASOC[$i] = $r['asociacion']['id']; $PRES[$i] = $p;
}
$A = 16;   // la asociación protagonista (Barrial, 5 miembros)
$SOC = [];
for ($k = 1; $k <= 4; $k++) { $SOC[$k] = $nuevoJugador('Socio A' . $k); Social::unirse($SOC[$k], $ASOC[$A]); }
$P4b = $nuevoJugador('Socio Prov'); Social::unirse($P4b, $ASOC[4]);
$LIBRE = $nuevoJugador('Sin Asociacion');
// Ligas de arranque: 0-3 Nacional, 4-7 Provincial, 8-16 Barrial
foreach ($ASOC as $i => $a) Db::q('INSERT INTO liga_asociaciones (asociacion_id, liga, desde, mejor_liga, semanas) VALUES (?, ?, ?, ?, 0)', [$a, $i < 4 ? 2 : ($i < 8 ? 1 : 0), time(), $i < 4 ? 2 : ($i < 8 ? 1 : 0)]);

$EQUIPO = ['staff' => [['role' => 'cam', 'skill' => 3, 'owner' => true, 'name' => 'Tú'], ['role' => 'dir', 'skill' => 4, 'tier' => 'senior'], ['role' => 'audio', 'skill' => 2], ['role' => 'stream', 'skill' => 2], ['role' => 'cam', 'skill' => 2]],
           'equip' => array_merge(array_fill(0, 2, ['type' => 'cam_pro', 'condition' => 90]), array_fill(0, 4, ['type' => 'cam_basic', 'condition' => 90]),
               array_map(fn($t) => ['type' => $t, 'condition' => 90], ['switch_basic', 'audio_basic', 'mics', 'encoder', 'router4g', 'ups', 'raincover']))];
$EQUIPO_JUNIOR = ['staff' => [['role' => 'cam', 'skill' => 2, 'owner' => true]], 'equip' => [['type' => 'cam_basic', 'condition' => 80]]];
/** Resultado "perfecto" y coherente para el modo firma (5 estrellas, gana el duelo, sin cortes). */
$perfecto = fn(array $it) => ['intento_id' => $it['id'], 'firma' => $it['firma'], 'decisiones' => [0],
    'resultado' => ['calidad' => 96, 'estrellas' => 5, 'duelo' => !empty($it['contrato']['rival']) ? 'won' : null, 'incidentes' => [['clave' => 'epico', 'q' => 3]]]];
/** Toma un encargo libre y lo completa entero con intentos perfectos. Devuelve los puntos (0 si no había encargo libre). */
$cumplir = function (int $j, ?int $tareaId = null) use ($perfecto, $EQUIPO): int {
    $e = Liga::estado($j);
    if (!$e['mi_tarea']) {
        if ($tareaId === null) {
            foreach ($e['tablero'] as $t) if ($t['estado'] === 'disponible') { $tareaId = $t['id']; break; }
        }
        if ($tareaId === null) return 0;
        $e = Liga::tomar($j, $tareaId);
    }
    $t = $e['mi_tarea'];
    for ($k = $t['avance']; $k < $t['meta']; $k++) {
        $it = Liga::emitirIntento($j, ['equipo' => $EQUIPO])['intento'];
        $r = Liga::completar($j, $perfecto($it));
    }
    return $r['puntos'] ?? 0;
};
/** Un jugador usa hasta $n encargos (si no hay libres, el reloj avanza 11 minutos). */
$trabajar = function (int $j, int $n) use ($cumplir, $mas): int {
    $pts = 0;
    $e = Liga::estado($j);
    $n = min($n, $e['mis_tareas']['max'] - $e['mis_tareas']['usadas'] + ($e['mi_tarea'] ? 1 : 0));
    for ($k = 0; $k < $n; $k++) {
        $p = $cumplir($j);
        if ($p === 0) { $mas(660); $p = $cumplir($j); }
        $pts += $p;
    }
    return $pts;
};
/** Se asegura de que el jugador tenga un encargo tomado (si completó el suyo, toma otro libre). */
$conTarea = function (int $j) use ($mas): array {
    $e = Liga::estado($j);
    if ($e['mi_tarea']) return $e['mi_tarea'];
    $l = current(array_filter($e['tablero'], fn($t) => $t['estado'] === 'disponible'));
    if (!$l) { $mas(660); $e = Liga::estado($j); $l = current(array_filter($e['tablero'], fn($t) => $t['estado'] === 'disponible')); }
    return Liga::tomar($j, $l['id'])['mi_tarea'];
};
/** Juega un intento de verdad con la lógica del juego (server/validador) eligiendo la primera opción posible. */
$jugarNode = function (array $intento) use ($NODE): ?array {
    if ($NODE === '') return null;
    $js = 'const V=require(process.argv[1]);let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const it=JSON.parse(d);'
        . 'const p=V.play(it,(inc)=>{const c=inc.choices.find(x=>x.ok);return c?c.i:0;});const v=V.validate(Object.assign({},it,{decisiones:p.decisiones}));'
        . 'process.stdout.write(JSON.stringify({decisiones:p.decisiones,resultado:{calidad:v.calidad,estrellas:v.estrellas,duelo:v.detalle.duelo,'
        . 'incidentes:(v.detalle.incidentes||[]).map(x=>({clave:x.clave,q:x.q}))}}));});';
    $proc = proc_open([$NODE, '-e', $js, dirname(__DIR__) . '/validador/validador.js'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
    fwrite($tubos[0], json_encode($intento)); fclose($tubos[0]);
    $out = stream_get_contents($tubos[1]); $err = stream_get_contents($tubos[2]);
    fclose($tubos[1]); fclose($tubos[2]); proc_close($proc);
    $r = json_decode((string) $out, true);
    if (!is_array($r)) echo "  (node: $err)\n";
    return is_array($r) ? $r : null;
};

// =====================================================================
titulo('Semanas: lunes 00:00 a domingo 23:59:59 (America/Guayaquil)');
$W1 = $lunes('2026-10-26'); $W2 = $lunes('2026-11-02'); $W3 = $lunes('2026-11-09');
check('Domingo 23:59:59 pertenece a la semana del lunes anterior', '2026-10-26', Liga::semanaDe($W2 - 1)['id']);
check('Lunes 00:00 empieza otra semana', '2026-11-02', Liga::semanaDe($W2)['id']);
check('Miércoles a mediodía', ['2026-10-26', $W1, $W2], array_values(Liga::semanaDe($W1 + 2 * 86400 + 43200)));
check('La semana dura 7 días', 7 * 86400, Liga::semanaDe($W1)['fin'] - Liga::semanaDe($W1)['inicio']);

// =====================================================================
titulo('Semana 1: grupos de ~8 por liga parecida y tablero de 12 encargos');
$reloj($W1 + 10 * 3600);
$e = Liga::estado($PRES[$A]);
check('GET liga: semana, liga Barrial, 12 encargos libres, 0 fichas', ['2026-10-26', 'barrial', 12, 12, 0],
    [$e['semana']['id'], $e['liga']['id'], count($e['tablero']), count(array_filter($e['tablero'], fn($t) => $t['estado'] === 'disponible')), $e['fichas']]);
check('Tiempo restante hasta el domingo 23:59:59', $W2 - Liga::ahora(), $e['semana']['quedan_seg']);
check('17 asociaciones en 2 grupos (9 + 8)', [2, 9, 8], [(int) Db::valor("SELECT COUNT(*) FROM liga_grupos WHERE semana = '2026-10-26'"),
    (int) Db::valor("SELECT COUNT(*) FROM liga_participantes p JOIN liga_grupos g ON g.id = p.grupo_id WHERE g.semana = '2026-10-26' AND g.numero = 1"),
    (int) Db::valor("SELECT COUNT(*) FROM liga_participantes p JOIN liga_grupos g ON g.id = p.grupo_id WHERE g.semana = '2026-10-26' AND g.numero = 2")]);
check('Grupo 1 = las 4 Nacional + 4 Provincial + 1 Barrial; grupo de A = 8 Barrial', [[2, 2, 2, 2, 1, 1, 1, 1, 0], 'barrial', 8],
    [array_map('intval', array_column(Db::todas("SELECT p.liga FROM liga_participantes p JOIN liga_grupos g ON g.id = p.grupo_id WHERE g.semana = '2026-10-26' AND g.numero = 1 ORDER BY p.liga DESC, p.asociacion_id"), 'liga')),
     $e['grupo']['liga']['id'], count($e['grupo']['ranking'])]);
check('Ranking: la mía marcada, todas con 0 puntos', [true, 0], [count(array_filter($e['grupo']['ranking'], fn($r) => $r['mia'])) === 1, array_sum(array_column($e['grupo']['ranking'], 'puntos'))]);
check('Banderas de la Liga Barrial', [[1000, 15], [3000, 25], [6000, 35], [10000, 50]], array_map(fn($b) => [$b['puntos'], $b['fichas']], $e['banderas']));
check('Banderas más altas en la Liga Mundial', [3200, 9600, 19200, 32000], array_column(Liga::banderas(4), 'puntos'));
$eLibre = Liga::estado($LIBRE);
check('Sin asociación: sin_asociacion y la semana igual', [true, '2026-10-26'], [$eLibre['sin_asociacion'] ?? false, $eLibre['semana']['id']]);
check('Sin asociación: las 17 asociaciones para unirse, la más activa primero (A, 5 miembros), y lo que cuesta crear una',
    [17, $ASOC[$A], 5, 'abierto', 'barrial', false, 5000, false],
    [count($eLibre['asociaciones'] ?? []), $eLibre['asociaciones'][0]['id'] ?? null, $eLibre['asociaciones'][0]['miembros'] ?? null, $eLibre['asociaciones'][0]['ingreso'] ?? null,
     $eLibre['asociaciones'][0]['liga']['id'] ?? null, $eLibre['asociaciones'][0]['solicitud_enviada'] ?? null, $eLibre['crear']['costo'] ?? null, $eLibre['crear']['gratis'] ?? null]);

// Encargos balanceados por liga
$boards = [];
foreach ($ASOC as $i => $a) $boards[$i] = Db::todas("SELECT * FROM liga_tareas WHERE semana = '2026-10-26' AND asociacion_id = ? ORDER BY n", [$a]);
$maxIguales = max(array_map(fn($b) => max(array_count_values(array_column($b, 'plantilla'))), $boards));
check('Ningún tablero tiene más de 2 encargos iguales', true, $maxIguales <= 2);
$fueraDeLiga = 0;
foreach ($boards as $i => $b) { $l = $i < 4 ? 2 : ($i < 8 ? 1 : 0); foreach ($b as $t) if (Liga::PLANTILLAS[$t['plantilla']]['meta'][$l] === null) $fueraDeLiga++; }
check('Cada encargo es de una plantilla permitida en su liga', 0, $fueraDeLiga);
$prom = fn(array $is) => array_sum(array_map(fn($i) => array_sum(array_column($boards[$i], 'puntos')) / 12, $is)) / count($is);
check('Encargos de la Nacional valen más que los de la Barrial', true, $prom([0, 1, 2, 3]) > $prom([8, 9, 10, 11]) * 1.3);
check('La Barrial no pide conciertos, LigaPro ni finales', 0, count(array_filter(array_merge(...array_slice($boards, 8)), fn($t) => in_array($t['plantilla'], ['conciertos', 'ligapro', 'finales', 'lanzamientos'], true))));
$distintos = count(array_unique(array_map(fn($b) => implode(',', array_column($b, 'plantilla')), $boards)));
check('Cada asociación tiene su propio sorteo', true, $distintos >= 15);
// Misma semilla (asociación, semana) -> mismo tablero
$antes = array_map(fn($t) => [$t['plantilla'], $t['titulo'], $t['meta'], $t['puntos']], $boards[15]);
Db::q("DELETE FROM liga_tareas WHERE semana = '2026-10-26' AND asociacion_id = ?", [$ASOC[15]]);
Db::q("DELETE FROM liga_participantes WHERE semana = '2026-10-26' AND asociacion_id = ?", [$ASOC[15]]);
Liga::inscribir('2026-10-26', $ASOC[15]);
check('Con la misma semilla sale el mismo tablero', $antes, array_map(fn($t) => [$t['plantilla'], $t['titulo'], $t['meta'], (int) $t['puntos']],
    Db::todas("SELECT * FROM liga_tareas WHERE semana = '2026-10-26' AND asociacion_id = ? ORDER BY n", [$ASOC[15]])));
check('…y vuelve a su grupo (8 Barrial)', 8, count(Liga::estado($PRES[15])['grupo']['ranking']));

// =====================================================================
titulo('Tomar, abandonar y descartar encargos');
$t0 = $e['tablero'][0]; $t1 = $e['tablero'][1]; $t2 = $e['tablero'][2];
$e = Liga::tomar($SOC[1], $t0['id']);
check('Tomar: mi_tarea con avance 0 y vence según las horas del encargo', [$t0['id'], 0, true, 1],
    [$e['mi_tarea']['id'], $e['mi_tarea']['avance'], $e['mi_tarea']['mia'], $e['mis_tareas']['usadas']]);
check('El tablero muestra quién lo hace', 'Socio A1', current(array_filter($e['tablero'], fn($t) => $t['id'] === $t0['id']))['jugador']['nombre']);
check('Otro encargo mientras tiene uno -> 409 ya_tienes', [409, 'ya_tienes'], falla(fn() => Liga::tomar($SOC[1], $t1['id'])));
check('Otro socio, el mismo encargo -> 409 ocupada', [409, 'ocupada'], falla(fn() => Liga::tomar($SOC[2], $t0['id'])));
check('Encargo de otra asociación -> 404', [404, 'no_existe'], falla(fn() => Liga::tomar($PRES[0], $t1['id'])));
check('Sin asociación -> 409 sin_asociacion', [409, 'sin_asociacion'], falla(fn() => Liga::tomar($LIBRE, $t1['id'])));
check('Descartar sin ser presidente -> 403', [403, 'no_presidente'], falla(fn() => Liga::descartar($SOC[2], $t2['id'])));
check('Descartar un encargo tomado -> 409', [409, 'ocupada'], falla(fn() => Liga::descartar($PRES[$A], $t0['id'])));
$e = Liga::descartar($PRES[$A], $t2['id']);
$esp = array_values(array_filter($e['tablero'], fn($t) => $t['estado'] === 'espera'));
check('Presidente descarta: siguen 12 casillas, una en espera 10 minutos y sin título', [12, 1, 600, false],
    [count($e['tablero']), count($esp), $esp[0]['aparece_seg'], isset($esp[0]['titulo'])]);
check('Tomar el que está en espera -> 409 espera', [409, 'espera'], falla(fn() => Liga::tomar($SOC[2], $esp[0]['id'])));
$mas(601);
check('A los 10 minutos aparece', 'disponible', current(array_filter(Liga::estado($PRES[$A])['tablero'], fn($t) => $t['id'] === $esp[0]['id']))['estado']);

// =====================================================================
titulo('Intentos: semilla y contrato del servidor, firma, una semilla = un intento');
check('Pedir intento sin encargo -> 409 sin_tarea', [409, 'sin_tarea'], falla(fn() => Liga::emitirIntento($SOC[2], ['equipo' => $EQUIPO])));
check('Equipo vacío -> 400 equipo', [400, 'equipo'], falla(fn() => Liga::emitirIntento($SOC[1], ['equipo' => ['staff' => [], 'equip' => []]])));
check('Habilidad 9 -> 400 equipo', [400, 'equipo'], falla(fn() => Liga::emitirIntento($SOC[1], ['equipo' => ['staff' => [['role' => 'cam', 'skill' => 9]], 'equip' => [['type' => 'cam_basic', 'condition' => 50]]]])));
check('Dos dueños -> 400 equipo', [400, 'equipo'], falla(fn() => Liga::emitirIntento($SOC[1], ['equipo' => ['staff' => [['role' => 'cam', 'skill' => 2, 'owner' => true], ['role' => 'dir', 'skill' => 2, 'owner' => true]], 'equip' => [['type' => 'cam_basic', 'condition' => 50]]]])));
check('Tipo de evento que no sirve para el encargo -> 400 tipo', [400, 'tipo'], falla(fn() => Liga::emitirIntento($SOC[1], ['equipo' => $EQUIPO, 'tipo' => 'final'])));
$mt = Liga::estado($SOC[1])['mi_tarea'];
$r = Liga::emitirIntento($SOC[1], ['equipo' => $EQUIPO, 'tipo' => $mt['tipos'][0]]);
$it = $r['intento'];
check('Intento: semilla, contrato del tipo pedido, equipo guardado, firma, vence en 3 h, modo firma',
    [true, $mt['tipos'][0], 5, 64, 'firma', true], [is_int($it['seed']) && $it['seed'] > 0, $it['contrato']['type'], count($it['equipo']['staff']), strlen($it['firma']), $it['modo'],
     strtotime($it['vence']) - Liga::ahora() === 3 * 3600]);
$crit = $mt['criterio'];
check('El contrato respeta el encargo (transmisión / aire libre / duelo)', true,
    (empty($crit['stream']) && empty($crit['sin_cortes']) || $it['contrato']['stream']) && (empty($crit['outdoor']) || $it['contrato']['outdoor'])
    && (($crit['duelo'] ?? null) !== 'won' || ($it['contrato']['rival'] && $it['contrato']['rivalQuality'] >= 45 && $it['contrato']['rivalQuality'] <= 95)));
$bueno = $perfecto($it);
check('Firma cambiada -> 403 firma', [403, 'firma'], falla(fn() => Liga::completar($SOC[1], ['firma' => str_repeat('0', 64)] + $bueno)));
check('…el intento quedó usado (rechazado): mandarlo bien ahora -> 409 usado', [409, 'usado', 'rechazado'],
    [...falla(fn() => Liga::completar($SOC[1], $bueno)), Db::valor('SELECT estado FROM liga_intentos WHERE id = ?', [$it['id']])]);
$malos = [
    'estrellas que no corresponden a la calidad' => ['calidad' => 50, 'estrellas' => 5],
    'calidad fuera de rango' => ['calidad' => 140, 'estrellas' => 5],
    'imprevistos que no cuadran con las decisiones' => ['calidad' => 90, 'estrellas' => 5, 'incidentes' => []],
];
foreach ($malos as $n => $res) {
    $it2 = Liga::emitirIntento($SOC[1], ['equipo' => $EQUIPO])['intento'];
    $x = $perfecto($it2); $x['resultado'] = $res + $x['resultado'];
    check('Resultado con ' . $n . ' -> 422 y rechazado', [422, 'resultado', 'rechazado'], [...falla(fn() => Liga::completar($SOC[1], $x)), Db::valor('SELECT estado FROM liga_intentos WHERE id = ?', [$it2['id']])]);
}
$it3 = Liga::emitirIntento($SOC[1], ['equipo' => $EQUIPO])['intento'];
$it4 = Liga::emitirIntento($SOC[1], ['equipo' => $EQUIPO])['intento'];
check('Pedir otro intento vence el anterior', [409, 'usado', 'vencido'], [...falla(fn() => Liga::completar($SOC[1], $perfecto($it3))), Db::valor('SELECT estado FROM liga_intentos WHERE id = ?', [$it3['id']])]);
check('Decisiones que no son números -> 400', [400, 'decisiones'], falla(fn() => Liga::completar($SOC[1], ['decisiones' => ['a']] + $perfecto($it4))));
check('Intento de otro jugador -> 404', [404, 'no_existe'], falla(fn() => Liga::completar($SOC[2], $perfecto($it4))));
$mas(3 * 3600 + 1);
check('Pasadas 3 horas -> 409 vencido', [409, 'vencido', 'vencido'], [...falla(fn() => Liga::completar($SOC[1], $perfecto($it4))), Db::valor('SELECT estado FROM liga_intentos WHERE id = ?', [$it4['id']])]);

titulo('Avance, encargo completado, puntos y reemplazo');
$e = Liga::estado($SOC[1]);
$mt = $e['mi_tarea'];
$it = Liga::emitirIntento($SOC[1], ['equipo' => $EQUIPO])['intento'];
$r = Liga::completar($SOC[1], $perfecto($it));
check('Intento bueno: firmado, cuenta, avance +1', ['firmado', true, 1], [$r['intento']['estado'], $r['intento']['cuenta'], $mt['meta'] > 1 ? $r['liga']['mi_tarea']['avance'] : 1]);
for ($k = 1; $k < $mt['meta']; $k++) { $it = Liga::emitirIntento($SOC[1], ['equipo' => $EQUIPO])['intento']; $r = Liga::completar($SOC[1], $perfecto($it)); }
check('Al llegar a la meta: encargo completado y puntos para la asociación', [true, $mt['puntos'], $mt['puntos'], null, 1],
    [$r['tarea_completada'], $r['puntos'], $r['liga']['asociacion']['puntos'], $r['liga']['mi_tarea'], $r['liga']['mis_tareas']['completadas']]);
check('El completado sale de la lista "hechas" con quién lo hizo', ['Socio A1', $mt['titulo']], [$r['liga']['hechas'][0]['jugador']['nombre'], $r['liga']['hechas'][0]['titulo']]);
check('Llega un encargo nuevo en 10 minutos (siguen 12 casillas)', [12, 1], [count($r['liga']['tablero']), count(array_filter($r['liga']['tablero'], fn($t) => $t['estado'] === 'espera'))]);
$rk = $r['liga']['grupo']['ranking'];
check('Ranking: mi asociación primera', [1, $ASOC[$A], $mt['puntos']], [$rk[0]['posicion'], $rk[0]['asociacion_id'], $rk[0]['puntos']]);

// Un intento que NO cumple el criterio (1 estrella) no suma
$e = Liga::estado($SOC[2]);
$libre = current(array_filter($e['tablero'], fn($t) => $t['estado'] === 'disponible' && ($t['criterio']['min_estrellas'] ?? 1) >= 2));
Liga::tomar($SOC[2], $libre['id']);
$it = Liga::emitirIntento($SOC[2], ['equipo' => $EQUIPO])['intento'];
$x = $perfecto($it); $x['resultado'] = ['calidad' => 30, 'estrellas' => 1, 'duelo' => !empty($it['contrato']['rival']) ? 'lost' : null, 'incidentes' => [['clave' => 'cable', 'q' => -8]]];
$r = Liga::completar($SOC[2], $x);
check('1 estrella: firmado pero no cuenta (no_cumple), avance 0', ['firmado', false, 'no_cumple', 0], [$r['intento']['estado'], $r['intento']['cuenta'], $r['intento']['motivo'], $r['liga']['mi_tarea']['avance']]);
// Abandonar: vuelve al tablero con avance 0 y el cupo se gasta
if ($libre['meta'] > 1) { $it = Liga::emitirIntento($SOC[2], ['equipo' => $EQUIPO])['intento']; Liga::completar($SOC[2], $perfecto($it)); }
$e = Liga::abandonar($SOC[2]);
$vuelta = current(array_filter($e['tablero'], fn($t) => $t['id'] === $libre['id']));
check('Abandonar: vuelve libre con avance 0, ya no tengo encargo, el cupo cuenta', ['disponible', 0, null, 1], [$vuelta['estado'], $vuelta['avance'], $e['mi_tarea'], $e['mis_tareas']['usadas']]);
check('Abandonar sin encargo -> 409', [409, 'sin_tarea'], falla(fn() => Liga::abandonar($SOC[2])));
// Encargo vencido: vuelve solo al tablero
$e = Liga::tomar($SOC[2], $libre['id']);
$mas($e['mi_tarea']['horas'] * 3600 + 1);
$e = Liga::estado($SOC[2]);
check('Pasado el tiempo del encargo vuelve al tablero', [null, 'disponible'], [$e['mi_tarea'], current(array_filter($e['tablero'], fn($t) => $t['id'] === $libre['id']))['estado']]);
// Salir de la asociación con un encargo: se libera
$e = Liga::tomar($SOC[3], $libre['id']);
Social::salir($SOC[3]);
$e = Liga::estado($PRES[$A]);
check('Si sale de la asociación, su encargo vuelve al tablero', 'disponible', current(array_filter($e['tablero'], fn($t) => $t['id'] === $libre['id']))['estado']);
Social::unirse($SOC[3], $ASOC[$A]);
// "Contrata a un Senior": sin senior en el equipo registrado no cuenta
$sen = Db::fila("SELECT * FROM liga_tareas WHERE semana = '2026-10-26' AND plantilla = 'senior' AND estado = 'disponible' AND visible_desde <= ? LIMIT 1", [Liga::ahora()]);
if ($sen) {
    $pres = (int) Db::valor('SELECT jugador_id FROM asociacion_miembros WHERE asociacion_id = ? AND cargo = ?', [$sen['asociacion_id'], 'presidente']);
    Liga::tomar($pres, (int) $sen['id']);
    $it = Liga::emitirIntento($pres, ['equipo' => $EQUIPO_JUNIOR])['intento'];
    $r = Liga::completar($pres, $perfecto($it));
    $it = Liga::emitirIntento($pres, ['equipo' => $EQUIPO])['intento'];
    $r2 = Liga::completar($pres, $perfecto($it));
    check('Encargo "Senior": sin senior no cuenta, con un senior (habilidad 4) sí', [false, true], [$r['intento']['cuenta'], $r2['intento']['cuenta']]);
    Liga::abandonar($pres);
} else check('Encargo "Senior" (no salió en ningún tablero esta vez)', true, true);
check('Liga::cumple sin cortes: un corte de internet que salió mal lo arruina', [true, false],
    [Liga::cumple(['stream' => true, 'sin_cortes' => true], ['stream' => true], ['estrellas' => 3, 'incidentes' => [['clave' => 'internet', 'q' => 2]]], []),
     Liga::cumple(['stream' => true, 'sin_cortes' => true], ['stream' => true], ['estrellas' => 3, 'incidentes' => [['clave' => 'internet', 'q' => -4]]], [])]);

// =====================================================================
titulo('Modo repetición: el validador de verdad (server/validador) decide');
Liga::fijarModo('repeticion');
$jr = $PRES[13];
$e = Liga::estado($jr);
$tr = current(array_filter($e['tablero'], fn($t) => $t['estado'] === 'disponible'));
Liga::tomar($jr, $tr['id']);
if ($VALIDADOR_OK) {
    $it = Liga::emitirIntento($jr, ['equipo' => $EQUIPO])['intento'];
    check('El intento dice modo repeticion', 'repeticion', $it['modo']);
    $jugado = $jugarNode($it);
    $r = Liga::completar($jr, ['intento_id' => $it['id'], 'decisiones' => $jugado['decisiones'], 'resultado' => $jugado['resultado']]);
    $esperaCuenta = Liga::cumple($tr['criterio'], $it['contrato'], $jugado['resultado'], $it['equipo']);
    check('Jugada de verdad: validado con la calidad de la repetición, cuenta según el criterio', ['validado', $jugado['resultado']['calidad'], $jugado['resultado']['estrellas'], $esperaCuenta],
        [$r['intento']['estado'], $r['intento']['calidad'], $r['intento']['estrellas'], $r['intento']['cuenta']]);
    check('…guardó la versión de la lógica y no es sospechoso', [true, 0], [strlen((string) Db::valor('SELECT version_logica FROM liga_intentos WHERE id = ?', [$it['id']])) === 12, (int) Db::valor('SELECT sospechoso FROM liga_intentos WHERE id = ?', [$it['id']])]);
    // Trampa: dice 5 estrellas
    $conTarea($jr);
    $it = Liga::emitirIntento($jr, ['equipo' => $EQUIPO])['intento'];
    $jugado = $jugarNode($it);
    $trampa = $jugado['resultado']['estrellas'] === 5 ? ['calidad' => 41, 'estrellas' => 2] : ['calidad' => 99, 'estrellas' => 5];
    $r = Liga::completar($jr, ['intento_id' => $it['id'], 'decisiones' => $jugado['decisiones'], 'resultado' => $trampa + $jugado['resultado']]);
    check('Trampa (otro resultado): vale el del servidor y queda sospechoso', ['validado', $jugado['resultado']['calidad'], 1, 'resultado_no_coincide'],
        [$r['intento']['estado'], $r['intento']['calidad'], (int) Db::valor('SELECT sospechoso FROM liga_intentos WHERE id = ?', [$it['id']]), $r['intento']['motivo']]);
    // Jugada imposible
    $conTarea($jr);
    $it = Liga::emitirIntento($jr, ['equipo' => $EQUIPO])['intento'];
    $r = Liga::completar($jr, ['intento_id' => $it['id'], 'decisiones' => [9, 9, 9, 9, 9, 9, 9]]);
    check('Decisiones imposibles: rechazado, no cuenta', ['rechazado', false, true], [$r['intento']['estado'], $r['intento']['cuenta'], in_array($r['intento']['motivo'], ['opcion_invalida', 'sobran_decisiones'], true)]);
} else {
    echo "  AVISO: sin node o js/logic.js no carga en el validador: se saltan las pruebas con el validador de verdad\n";
}
// Validador caído -> pendiente -> se revalida después
Liga::usarValidador(function () { throw new RuntimeException('conexión rechazada'); });
$tr = $conTarea($jr);
$it = Liga::emitirIntento($jr, ['equipo' => $EQUIPO])['intento'];
$r = Liga::completar($jr, $perfecto($it));
check('Validador caído: el intento queda pendiente (la API responde 202)', ['pendiente', false], [$r['intento']['estado'], $r['intento']['cuenta']]);
check('…y no se puede mandar otra vez', [409, 'usado'], falla(fn() => Liga::completar($jr, $perfecto($it))));
$avAntes = (int) Db::valor('SELECT avance FROM liga_tareas WHERE id = ?', [$tr['id']]);
Liga::usarValidador(fn(array $x) => ['valido' => true, 'calidad' => 92, 'estrellas' => 5, 'coincide' => true, 'version_logica' => 'falsa0000001',
    'detalle' => ['duelo' => !empty($x['contrato']['rival']) ? 'won' : null, 'incidentes' => array_map(fn($d) => ['clave' => 'epico', 'q' => 2], $x['decisiones'])]]);
$rv = Liga::revalidar();
check('Al volver el validador, revalidar aplica el pendiente', [1, 1, 'validado'], [$rv['pendientes'], $rv['aplicados'], Db::valor('SELECT estado FROM liga_intentos WHERE id = ?', [$it['id']])]);
check('…y suma avance (o completa el encargo)', true, (int) Db::valor('SELECT avance FROM liga_tareas WHERE id = ?', [$tr['id']]) === $avAntes + 1
    || Db::valor('SELECT estado FROM liga_tareas WHERE id = ?', [$tr['id']]) === 'completada');
Liga::usarValidador(null);
Liga::fijarModo('firma');
if (Db::valor("SELECT 1 FROM liga_tareas WHERE id = ? AND estado = 'tomada'", [$tr['id']])) Liga::abandonar($jr);

// =====================================================================
titulo('La semana: cada uno juega sus encargos');
$ptsA = 0;
foreach ([1, 2, 3, 4] as $k) $ptsA += $trabajar($SOC[$k], 9);
$ptsA += $mt['puntos'];   // el primero de Socio A1
$usadas = Liga::estado($SOC[2])['mis_tareas'];
check('Máximo 9 encargos por semana', [9, 9], [$usadas['usadas'], $usadas['max']]);
$libre = current(array_filter(Liga::estado($SOC[2])['tablero'], fn($t) => $t['estado'] === 'disponible'));
check('El décimo -> 409 limite', [409, 'limite'], falla(fn() => Liga::tomar($SOC[2], $libre['id'])));
$eA = Liga::estado($PRES[$A]);
check('Puntos de la asociación = suma de sus encargos completados', [(int) Db::valor("SELECT SUM(puntos) FROM liga_tareas WHERE semana = '2026-10-26' AND asociacion_id = ? AND estado = 'completada'", [$ASOC[$A]])],
    [$eA['asociacion']['puntos']]);
$bandA = count(array_filter($eA['banderas'], fn($b) => $b['alcanzada']));
check('La asociación A ya ganó banderas', true, $bandA >= 2);
// Otras asociaciones: algo de puntos
$trabajar($PRES[15], 2);   // B: 2 encargos
$trabajar($PRES[14], 1);   // C: 1 encargo
$trabajar($PRES[4], 4); $trabajar($P4b, 3);   // Provincial con 2 miembros
$trabajar($PRES[0], 2);    // Nacional
$trabajar($PRES[5], 1);    // Provincial
$rk1 = Liga::estado($PRES[0])['grupo']['ranking'];
check('Ranking del grupo 1 ordenado por puntos', true, array_column($rk1, 'puntos') === array_values(array_reverse(array_values(array_reverse(array_column($rk1, 'puntos'))))) && array_column($rk1, 'puntos') == (function ($x) { rsort($x); return $x; })(array_column($rk1, 'puntos')));
check('Zonas en vivo: los 2 primeros suben', ['sube', 'sube'], [$rk1[0]['zona'], $rk1[1]['zona']]);
// Intento sin terminar a fin de semana
$e = Liga::estado($PRES[8]);
Liga::tomar($PRES[8], current(array_filter($e['tablero'], fn($t) => $t['estado'] === 'disponible'))['id']);
$colgado = Liga::emitirIntento($PRES[8], ['equipo' => $EQUIPO])['intento'];
$pA = Liga::estado($PRES[$A])['asociacion']['puntos'];

// =====================================================================
titulo('Cambio de semana perezoso: cierre, ascensos, descensos y fichas');
$reloj($W2 + 300);   // lunes 00:05
$e = Liga::estado($PRES[$A]);
check('La primera visita del lunes cierra la semana pasada y abre la nueva', ['cerrada', 'abierta', '2026-11-02'],
    [Db::valor("SELECT estado FROM liga_semanas WHERE semana = '2026-10-26'"), Db::valor("SELECT estado FROM liga_semanas WHERE semana = '2026-11-02'"), $e['semana']['id']]);
$fin = fn(int $i) => Db::fila("SELECT * FROM liga_participantes WHERE semana = '2026-10-26' AND asociacion_id = ?", [$ASOC[$i]]);
check('A: primera de su grupo, sube a la Liga Provincial', [1, 'sube', 1, 'provincial'], [(int) $fin($A)['posicion'], $fin($A)['resultado'], (int) $fin($A)['liga_nueva'], $e['liga']['id']]);
check('Barrial sin puntos se queda (no hay liga más abajo)', ['queda', 0], [$fin(9)['resultado'], (int) Db::valor('SELECT liga FROM liga_asociaciones WHERE asociacion_id = ?', [$ASOC[9]])]);
$g1 = Db::todas("SELECT p.* FROM liga_participantes p JOIN liga_grupos g ON g.id = p.grupo_id WHERE g.semana = '2026-10-26' AND g.numero = 1 ORDER BY posicion");
check('Grupo 1: los 2 primeros (con puntos) suben', ['sube', 'sube'], [$g1[0]['resultado'], $g1[1]['resultado']]);
check('Grupo 1: Nacional/Provincial sin puntos bajan', true, (bool) array_filter($g1, fn($p) => (int) $p['puntos'] === 0 && (int) $p['liga'] > 0)
    && !array_filter($g1, fn($p) => (int) $p['puntos'] === 0 && (int) $p['liga'] > 0 && $p['resultado'] !== 'baja'));
check('liga_asociaciones sigue el resultado', true, !array_filter($g1, fn($p) => (int) Db::valor('SELECT liga FROM liga_asociaciones WHERE asociacion_id = ?', [$p['asociacion_id']]) !== (int) $p['liga_nueva']));
$fb = array_sum(array_map(fn($b) => $pA >= $b['puntos'] ? $b['fichas'] : 0, Liga::banderas(0)));
$fp = Liga::fichasPosicion(0, 1);
check('Fichas: cada socio que completó encargos recibe banderas + posición', [$fb + $fp, $fb + $fp], [Liga::fichas($SOC[1]), Liga::fichas($SOC[4])]);
check('El presidente de A no completó ninguno: 0 fichas', 0, Liga::fichas($PRES[$A]));
check('Última semana en el estado: puesto 1, sube, fichas ganadas', [1, 'sube', $fb + $fp, 'provincial'],
    [$e['ultima_semana']['posicion'], $e['ultima_semana']['resultado'], Liga::estado($SOC[1])['ultima_semana']['fichas_ganadas'], $e['ultima_semana']['liga_nueva']['id']]);
check('Aviso por el chat del sistema a los que jugaron', true, (bool) Db::valor("SELECT 1 FROM chat_mensajes WHERE canal = ? AND texto LIKE 'Liga Semanal:%sube a la Liga Provincial%'", ['sistema:' . $SOC[1]]));
check('El intento que quedó colgado se venció', 'vencido', Db::valor('SELECT estado FROM liga_intentos WHERE id = ?', [$colgado['id']]));
check('Cerrar otra vez no hace nada ni paga dos veces', [false, $fb + $fp], [Liga::cerrarSemana('2026-10-26'), Liga::fichas($SOC[1])]);
check('Semana nueva: tablero nuevo de 12 en la Provincial y 0 puntos', [12, 0, 0], [count($e['tablero']), $e['asociacion']['puntos'], $e['mis_tareas']['usadas']]);
check('Los encargos de la semana nueva son de la Provincial', 0, count(array_filter(Db::todas("SELECT plantilla FROM liga_tareas WHERE semana = '2026-11-02' AND asociacion_id = ?", [$ASOC[$A]]),
    fn($t) => Liga::PLANTILLAS[$t['plantilla']]['meta'][1] === null)));
check('En la semana 2, A está en un grupo de liga Provincial', 'provincial', $e['grupo']['liga']['id']);
check('Un encargo de la semana pasada ya no sirve -> 404', [404, 'no_existe'], falla(fn() => Liga::tomar($SOC[1], $libre['id'])));

// =====================================================================
titulo('Semana 3: la que no jugó baja; las inactivas entran solo si alguien abre la liga');
$reloj($W3 + 3600);
Liga::asegurarSemana();
check('A no hizo nada en la semana 2: baja a la Barrial', ['baja', 0], [Db::valor("SELECT resultado FROM liga_participantes WHERE semana = '2026-11-02' AND asociacion_id = ?", [$ASOC[$A]]),
    (int) Db::valor('SELECT liga FROM liga_asociaciones WHERE asociacion_id = ?', [$ASOC[$A]])]);
check('Asociación 9 (nunca jugó y ya no es nueva) no se agrupa sola', false, (bool) Db::valor("SELECT 1 FROM liga_participantes WHERE semana = '2026-11-09' AND asociacion_id = ?", [$ASOC[9]]));
check('A sí (jugó hace 2 semanas)', true, (bool) Db::valor("SELECT 1 FROM liga_participantes WHERE semana = '2026-11-09' AND asociacion_id = ?", [$ASOC[$A]]));
$e9 = Liga::estado($PRES[9]);
check('Cuando su presidente abre la liga entra a un grupo de la Barrial con cupo', [true, 'barrial', 12],
    [(bool) Db::valor("SELECT 1 FROM liga_participantes WHERE semana = '2026-11-09' AND asociacion_id = ?", [$ASOC[9]]), $e9['grupo']['liga']['id'], count($e9['tablero'])]);
check('Ningún grupo pasa de 10', true, (int) Db::valor("SELECT MAX(n) FROM (SELECT COUNT(*) n FROM liga_participantes WHERE semana = '2026-11-09' GROUP BY grupo_id)") <= 10);

// =====================================================================
titulo('Tienda de la liga');
$j = $SOC[1];
$f0 = Liga::fichas($j);
$ti = Liga::tienda($j);
check('La tienda trae artículos con precio y disponibilidad', [true, $f0, true], [count($ti['articulos']) >= 10, $ti['fichas'], (bool) array_filter($ti['articulos'], fn($a) => $a['tipo'] === 'cosmetico')]);
$r = Liga::comprar($j, 'cables');
check('Comprar 3 cables: -25 fichas y una entrega consumible cable x3', [$f0 - 25, 'consumible', 'cable', 3, 'liga:cables'],
    [$r['fichas'], $r['entrega']['tipo'], $r['entrega']['item'], $r['entrega']['cantidad'], $r['entrega']['origen']]);
check('…la entrega le llega al juego por /api/estado (Monedero::entregas)', true, (bool) array_filter(Monedero::entregas($j), fn($x) => $x['id'] === $r['entrega']['id']));
Liga::comprar($j, 'cables'); Liga::comprar($j, 'cables');
check('Cuarto paquete de cables en la semana -> 409 (límite)', [409, 'no_disponible'], falla(fn() => Liga::comprar($j, 'cables')));
check('Bolsa de campeón desde la Nacional -> 409', [409, 'no_disponible'], falla(fn() => Liga::comprar($j, 'caja_grande')));
check('Artículo que no existe -> 404', [404, 'no_existe'], falla(fn() => Liga::comprar($j, 'creditos_gratis')));
Liga::moverFichas($j, 500, 'manual', 'prueba:regalo');
check('moverFichas con la misma referencia no paga dos veces', null, Liga::moverFichas($j, 500, 'manual', 'prueba:regalo'));
$r = Liga::comprar($j, 'ref_camarografo');
check('Refuerzo: entrega tipo refuerzo con nivel senior y 2 eventos', ['refuerzo', 'refuerzo_camarografo_senior', 'senior', 2],
    [$r['entrega']['tipo'], $r['entrega']['item'], $r['entrega']['nivel'] ?? null, $r['entrega']['eventos'] ?? null]);
$r = Liga::comprar($j, 'marco_liga');
check('Cosmético: queda en sus cosméticos (no es entrega)', ['marco_liga', null, ['marco_liga']], [$r['cosmetico'], $r['entrega'], $r['tienda']['cosmeticos']]);
check('El mismo cosmético otra vez -> 409', [409, 'no_disponible'], falla(fn() => Liga::comprar($j, 'marco_liga')));
$pobre = $PRES[$A];
check('Sin fichas suficientes -> 402', [402, 'sin_fichas'], falla(fn() => Liga::comprar($pobre, 'baterias')));
check('Los artículos que no alcanzan vienen marcados', false, current(array_filter(Liga::tienda($pobre)['articulos'], fn($a) => $a['id'] === 'baterias'))['alcanza']);
$descuadre = Db::todas('SELECT f.jugador_id, f.saldo, (SELECT SUM(cambio) FROM liga_fichas_mov m WHERE m.jugador_id = f.jugador_id) AS suma FROM liga_fichas f WHERE f.saldo <> (SELECT SUM(cambio) FROM liga_fichas_mov m WHERE m.jugador_id = f.jugador_id)');
check('Libro de fichas: el saldo de cada jugador es la suma de sus movimientos', [], $descuadre);

// =====================================================================
titulo('Revisar después los intentos aceptados en modo firma (cuando llegue el validador)');
if (!$VALIDADOR_OK) echo "  AVISO: validador no disponible: se salta\n";
if ($VALIDADOR_OK) {
    Liga::fijarModo('repeticion');
    $rv = Liga::revalidar(5, true);
    $revisados = Db::todas("SELECT calidad, sospechoso, motivo FROM liga_intentos WHERE motivo LIKE 'revisado%'");
    if ($rv['sospechosos'] < 4) echo '  (revalidar: ' . json_encode($rv) . ' ' . json_encode($revisados) . ")\n";
    check('Se repiten con el validador de verdad; los "perfectos" inventados quedan sospechosos', [5, true], [$rv['revisados'], $rv['sospechosos'] >= 4]);
    check('…sin quitar puntos (eso lo decide un humano)', $pA, (int) Db::valor("SELECT puntos FROM liga_participantes WHERE semana = '2026-10-26' AND asociacion_id = ?", [$ASOC[$A]]));
    Liga::fijarModo('firma');
}

// =====================================================================
titulo('Tarea programada (server/bin/liga.php) y rutas por HTTP');
Liga::fijarReloj(null);
$sal = []; exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config.env') . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/liga.php') . ' 2>&1', $sal, $cod);
check('php server/bin/liga.php termina bien', [0, true], [$cod, str_contains(implode("\n", $sal), 'liga OK')]);

$puerto = 8300 + random_int(0, 500);
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-S', '127.0.0.1:' . $puerto, __DIR__ . '/router_liga.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tub, null, ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PATH' => getenv('PATH')]);
for ($k = 0; $k < 50; $k++) { if (@fsockopen('127.0.0.1', $puerto)) break; usleep(100000); }
$sesion = function (int $j): string { $tok = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $tok), $j, time(), time() + 3600]); return $tok; };
$http = function (string $metodo, string $ruta, ?array $cuerpo = null, ?string $tok = null, bool $cabecera = true) use ($puerto): array {
    $ch = curl_init('http://127.0.0.1:' . $puerto . $ruta);
    $h = ['Content-Type: application/json'];
    if ($cabecera) $h[] = 'X-Envivo: 1';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 20]
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []) + ($tok ? [CURLOPT_COOKIE => 'envivo_s=' . $tok] : []));
    $b = curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode((string) $b, true)];
};
$tokA = $sesion($SOC[1]);
check('GET /api/liga sin sesión -> 401', 401, $http('GET', '/api/liga')[0]);
check('POST /api/liga/tomar sin X-Envivo -> 403', 403, $http('POST', '/api/liga/tomar', ['tarea_id' => 1], $tokA, false)[0]);
[$c, $j] = $http('GET', '/api/liga', null, $tokA);
check('GET /api/liga -> 200 con tablero de 12, ranking y fichas', [200, true, 12, true, true], [$c, $j['ok'] ?? null, count($j['tablero'] ?? []), isset($j['grupo']['ranking']), is_int($j['fichas'] ?? null)]);
$libreH = current(array_filter($j['tablero'], fn($t) => $t['estado'] === 'disponible'));
[$c, $j] = $http('POST', '/api/liga/tomar', ['tarea_id' => $libreH['id']], $tokA);
check('POST /api/liga/tomar -> 200 y liga.mi_tarea', [200, $libreH['id']], [$c, $j['liga']['mi_tarea']['id'] ?? null]);
check('POST /api/liga/tomar otra vez -> 409 con codigo', [409, 'ya_tienes'], (function () use ($http, $tokA, $libreH) { [$c, $j] = $http('POST', '/api/liga/tomar', ['tarea_id' => $libreH['id']], $tokA); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('POST', '/api/liga/intento', ['equipo' => $EQUIPO], $tokA);
check('POST /api/liga/intento -> 200 con semilla y firma', [200, true, 64], [$c, is_int($j['intento']['seed'] ?? null), strlen($j['intento']['firma'] ?? '')]);
[$c, $k] = $http('POST', '/api/liga/completar', $perfecto($j['intento']), $tokA);
check('POST /api/liga/completar -> 200 firmado y cuenta', [200, 'firmado', true], [$c, $k['intento']['estado'] ?? null, $k['intento']['cuenta'] ?? null]);
[$c, $j] = $http('POST', '/api/liga/abandonar', [], $tokA);
check('POST /api/liga/abandonar -> 200 sin encargo', [200, true, null], [$c, array_key_exists('mi_tarea', $j['liga'] ?? []), $j['liga']['mi_tarea'] ?? null]);
[$c, $j] = $http('GET', '/api/liga/tienda', null, $tokA);
check('GET /api/liga/tienda -> 200 con artículos', [200, true], [$c, count($j['articulos'] ?? []) > 5]);
[$c, $j] = $http('POST', '/api/liga/tienda', ['articulo' => 'baterias'], $tokA);
check('POST /api/liga/tienda baterias -> 200 con entrega', [200, 'battery'], [$c, $j['entrega']['item'] ?? null]);
check('POST /api/liga/tienda artículo inexistente -> 404', 404, $http('POST', '/api/liga/tienda', ['articulo' => 'nada'], $tokA)[0]);
check('GET /api/liga/tomar -> 405', 405, $http('GET', '/api/liga/tomar', null, $tokA)[0]);
check('GET /api/liga/otra -> 404', 404, $http('GET', '/api/liga/otra', null, $tokA)[0]);
[$c, $j] = $http('POST', '/api/liga/descartar', ['tarea_id' => 'abc'], $tokA);
check('POST /api/liga/descartar con id mal -> 400', 400, $c);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nLiga: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
