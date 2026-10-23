<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Universos y reparto parejo de jugadores (server/src/Universos.php,
// contrato en server/COPAS.md §1). Cada parte corre en su propio proceso con su propia base SQLite TEMPORAL:
//   fresca     base nueva: universo 1 con 3 servidores, arranque 3 veces, reparto parejo, /api/estado
//   existente  base de antes del módulo con 30 jugadores en el Servidor 1: migración, arranque 3 veces, los 3 se emparejan
//   actividad  marcarActivo (una escritura por día, eventos), activos(1/7/30 días), servidor de cada día
//   desborde   todos llenos -> universo nuevo; crear() a mano con auditoría
//   salud      servidores en 'abandono' (última foto de servidor_salud, de fusiones.sql) no reciben a nadie
//   uno        UNIVERSO_SERVIDORES_INICIALES=1 (un servidor por universo, como antes)
// Uso:  php server/tests/pruebas_universos.php        (GUARDAR_TMP=1 para dejar las bases)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$PARTES = ['fresca', 'existente', 'actividad', 'desborde', 'salud', 'uno'];
$parte = $argv[1] ?? '';
if ($parte === '') {
    $ok = 0; $fallas = 0; $codigo = 0;
    foreach ($PARTES as $p) {
        echo "\n######## $p\n";
        $salida = [];
        exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' ' . escapeshellarg($p) . ' 2>&1', $salida, $rc);
        echo implode("\n", $salida), "\n";
        $res = preg_grep('/^RESUMEN \d+ \d+$/', $salida);
        if (!$res) { $fallas++; echo "  FALLA la parte $p no terminó (código $rc)\n"; continue; }
        [, $o, $f] = explode(' ', (string) end($res));
        $ok += (int) $o; $fallas += (int) $f;
        if ($rc !== 0) $codigo = 1;
    }
    echo "\n----------------------------------------\nResumen pruebas_universos.php — correctas: $ok  ·  Fallas: $fallas\n";
    exit($fallas === 0 && $codigo === 0 ? 0 : 1);
}
if (!in_array($parte, $PARTES, true)) { fwrite(STDERR, "Parte desconocida: $parte\n"); exit(2); }

$TMP = sys_get_temp_dir() . '/envivo_universos_' . $parte . '_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$extra = $parte === 'uno' ? "UNIVERSO_SERVIDORES_INICIALES=1\n" : '';
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n$extra");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';
register_shutdown_function(function () use ($TMP) { if (getenv('GUARDAR_TMP') !== '1') exec('rm -rf ' . escapeshellarg($TMP)); else echo "Base en $TMP\n"; });

use EnVivo\{Auditoria, Cuentas, Db, Fallo, Migraciones, Social, Universos};

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
function fin(): never
{
    global $OK, $FALLAS;
    echo "RESUMEN $OK $FALLAS\n";
    exit($FALLAS === 0 ? 0 : 1);
}
$n = 0;
/** Jugador nuevo como en el registro (Social::servidorParaNuevo); $activo = entra al juego (como /api/estado). */
$registrar = function (bool $activo = true) use (&$n): array {
    $n++;
    $sid = Social::servidorParaNuevo();
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id) VALUES (?, ?, ?, ?, ?)', ["u$n@prueba.example", "Jugador $n", 'x', time(), $sid]);
    $id = Db::ultimoId();
    if ($activo) Universos::marcarActivo($id);
    return [$id, $sid];
};
$porServidor = fn() => array_map('intval', array_column(Db::todas('SELECT s.id, (SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = s.id) AS n FROM servidores s ORDER BY s.id'), 'n', 'id'));
$activosDe = fn(array $ids) => array_combine($ids, array_map(fn($s) => Universos::activos($s), $ids));
$cambios = fn() => (int) Db::valor('SELECT total_changes()');

Db::pdo();

// ===================================================================================================== fresca
if ($parte === 'fresca') {
    titulo('Base nueva: tablas y universo 1');
    check('Tablas universos y actividad_diaria creadas', [true, true], [Migraciones::columnas('universos') !== null, Migraciones::columnas('actividad_diaria') !== null]);
    check('Columna servidores.universo_id (y universos.sql NO agrega fusionado_en: es del módulo de fusión)', [true, 0],
        [isset(Migraciones::columnas('servidores')['universo_id']), preg_match('/ADD\s+COLUMN\s+fusionado_en/i', (string) file_get_contents(Migraciones::CARPETA . '/universos.sql'))]);
    check('Tras la migración: Universo Andino con el Servidor 1', [['id' => 1, 'nombre' => 'Universo Andino']], array_map(fn($u) => ['id' => (int) $u['id'], 'nombre' => $u['nombre']], Db::todas('SELECT * FROM universos')));
    check('…y el Servidor 1 ya es del universo 1', 1, (int) Db::valor('SELECT universo_id FROM servidores WHERE id = 1'));

    titulo('Arranque (3 veces): 3 servidores, nada repetido');
    $c1 = Universos::preparar(true); $c2 = Universos::preparar(true); $c3 = Universos::preparar(true);
    check('1.ª vez crea los servidores 2 y 3; 2.ª y 3.ª no crean nada', [[2, 3], [], []], [$c1, $c2, $c3]);
    $t = $cambios(); Universos::preparar(true);
    check('Ya arrancado: preparar() solo lee (0 cambios en la base)', 0, $cambios() - $t);
    check('Nombres: Quito, Guayaquil, Cuenca', ['Servidor 1 · Quito', 'Servidor 2 · Guayaquil', 'Servidor 3 · Cuenca'], array_column(Universos::servidoresDe(1), 'nombre'));
    check('Un solo universo, 3 servidores, todos abiertos y del universo 1', [1, 3, 3], [(int) Db::valor('SELECT COUNT(*) FROM universos'), (int) Db::valor('SELECT COUNT(*) FROM servidores'), (int) Db::valor('SELECT COUNT(*) FROM servidores WHERE abierto = 1 AND universo_id = 1')]);
    check('servidoresDe(1): forma {id, nombre, universo_id, capacidad, abierto, creado} (+ fusionado_en si existe la columna)', ['id', 'nombre', 'universo_id', 'capacidad', 'abierto', 'creado'], array_values(array_diff(array_keys(Universos::servidoresDe(1)[0]), ['fusionado_en'])));
    check('universoDe(3) = Universo Andino; universoDe(99) = null', [1, 'Universo Andino', true, null], [Universos::universoDe(3)['id'] ?? null, Universos::universoDe(3)['nombre'] ?? null, Universos::universoDe(3)['activo'] ?? null, Universos::universoDe(99)]);
    Universos::reiniciar();
    check('Las funciones de lectura arrancan solas (sin crear de más)', [[], 3], [Universos::preparar(), count(Universos::servidoresDe(1))]);

    titulo('Reparto parejo de jugadores nuevos');
    $sids = [];
    for ($i = 0; $i < 9; $i++) $sids[] = $registrar()[1];
    check('Los 9 primeros: 1, 2, 3, 1, 2, 3... (empate -> menos jugadores, luego id)', [1, 2, 3, 1, 2, 3, 1, 2, 3], $sids);
    check('3 por servidor', [1 => 3, 2 => 3, 3 => 3], $porServidor());
    // dos jugadores del Servidor 1 dejan de jugar (8 días sin entrar): el Servidor 1 tiene menos activos y recibe a los nuevos
    Db::q("UPDATE actividad_diaria SET dia = ? WHERE jugador_id IN (SELECT id FROM jugadores WHERE servidor_id = 1 ORDER BY id LIMIT 2)", [date('Y-m-d', strtotime('-8 days'))]);
    check('Activos 7 días: 1, 3, 3', [1 => 1, 2 => 3, 3 => 3], $activosDe([1, 2, 3]));
    check('Los 2 siguientes van al Servidor 1 (menos activos aunque tenga igual total)', [1, 1], [$registrar()[1], $registrar()[1]]);
    check('…y el siguiente vuelve al empate por total: Servidor 2', 2, $registrar()[1]);
    $sinJugar = $registrar(false);
    check('Un jugador que se registra y no entra no cuenta como activo', [1 => 3, 2 => 4, 3 => 3], $activosDe([1, 2, 3]));
    check('…pero sí cuenta en el total (desempate)', 3, $sinJugar[1]);
    check('siguiente() (solo lectura) = a quien le toca', Universos::siguiente(), Social::servidorParaNuevo());
    // Servidor cerrado a mano: no recibe a nadie
    Db::q('UPDATE servidores SET abierto = 0 WHERE id = 1');
    $van = []; for ($i = 0; $i < 4; $i++) $van[] = $registrar()[1];
    check('Servidor 1 cerrado a mano: los nuevos van a 2 y 3', [], array_values(array_filter($van, fn($s) => $s === 1)));
    Db::q('UPDATE servidores SET abierto = 1 WHERE id = 1');

    titulo('Registro de verdad (Cuentas::registrar) y /api/estado');
    $esperado = Universos::siguiente();
    $id = Cuentas::registrar('real.' . bin2hex(random_bytes(3)) . '@prueba.example', 'Real', 'ClaveSegura123');
    check('Cuentas::registrar usa el reparto (Social::servidorParaNuevo)', $esperado, (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$id]));
    check('estado(null) -> universo null', ['universo' => null], Universos::estado(null));
    check('estado(jugador) -> universo {id, nombre}', ['universo' => ['id' => 1, 'nombre' => 'Universo Andino']], Universos::estado($id));
    check('…y lo marcó activo hoy', 1, (int) Db::valor('SELECT COUNT(*) FROM actividad_diaria WHERE jugador_id = ? AND dia = ?', [$id, Universos::hoy()]));
    $est = Cuentas::estado($id) + Universos::estado($id);
    check('Junto a Cuentas::estado: servidor y universo', [true, true], [isset($est['servidor']['id']), $est['universo']['id'] === 1]);

    titulo('resumen()');
    $r = Universos::resumen();
    check('1 universo con 3 servidores, jugadores y activos', [1, 3, (int) Db::valor('SELECT COUNT(*) FROM jugadores')], [count($r['universos']), count($r['universos'][0]['servidores']), $r['universos'][0]['jugadores']]);
    check('…claves de cada servidor', ['id', 'nombre', 'universo_id', 'capacidad', 'abierto', 'creado', 'jugadores', 'activos_1', 'activos_7', 'siguiente'], array_values(array_diff(array_keys($r['universos'][0]['servidores'][0]), ['fusionado_en'])));
    check('…siguiente_servidor marcado en su servidor', [$r['siguiente_servidor']], array_column(array_filter($r['universos'][0]['servidores'], fn($s) => $s['siguiente']), 'id'));
    check('…universo abierto, servidores_iniciales 3', [true, 3, 7], [$r['universos'][0]['abierto'], $r['servidores_iniciales'], $r['dias_activo']]);
    fin();
}

// ===================================================================================================== existente
if ($parte === 'existente') {
    titulo('Base de ANTES del módulo con 30 jugadores en el Servidor 1');
    // Se deja la base como estaba antes de universos.sql: sin sus tablas ni su columna, y con la huella vieja.
    $pdo = Db::pdo();
    $pdo->exec('DROP INDEX IF EXISTS servidores_universo');
    $pdo->exec('ALTER TABLE servidores DROP COLUMN universo_id');
    $pdo->exec('DROP TABLE actividad_diaria');
    $pdo->exec('DROP TABLE universos');
    $pdo->exec("DELETE FROM esquema_modulos WHERE clave = 'huella'");
    $hoy = date('Y-m-d');
    for ($i = 1; $i <= 30; $i++) {
        Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, 1, ?, ?)', ["viejo$i@prueba.example", "Viejo $i", 'x', time() - 86400 * 40, "Viejo $i", "viejo $i"]);
        // 24 jugaron esta semana (tabla vieja "actividad" de Sesiones), 6 hace más de 7 días
        Db::q('INSERT INTO actividad (jugador_id, dia) VALUES (?, ?)', [Db::ultimoId(), $i <= 24 ? $hoy : date('Y-m-d', strtotime('-10 days'))]);
    }
    $antes = Db::todas('SELECT id, email, servidor_id, alias FROM jugadores ORDER BY id');
    check('Sin tabla universos ni columna universo_id (como en producción hoy)', [null, false], [Migraciones::columnas('universos'), isset(Migraciones::columnas('servidores')['universo_id'])]);

    titulo('La migración se aplica sola al cambiar la huella');
    Db::migrar();
    check('Universo Andino creado; el Servidor 1 es suyo', ['Universo Andino', 1], [(string) Db::valor('SELECT nombre FROM universos WHERE id = 1'), (int) Db::valor('SELECT universo_id FROM servidores WHERE id = 1')]);
    check('Los 30 jugadores siguen igual en el Servidor 1', $antes, Db::todas('SELECT id, email, servidor_id, alias FROM jugadores ORDER BY id'));
    check('La actividad vieja pasó a actividad_diaria (30 días, con su servidor)', [30, 30], [(int) Db::valor('SELECT COUNT(*) FROM actividad_diaria'), (int) Db::valor('SELECT COUNT(*) FROM actividad_diaria WHERE servidor_id = 1')]);
    check('Activos 7 días del Servidor 1: 24', 24, Universos::activos(1));
    Db::q("DELETE FROM esquema_modulos WHERE clave = 'huella'");
    Db::migrar();
    check('La migración otra vez no duplica nada', [1, 30, 1], [(int) Db::valor('SELECT COUNT(*) FROM universos'), (int) Db::valor('SELECT COUNT(*) FROM actividad_diaria'), (int) Db::valor('SELECT COUNT(*) FROM servidores')]);

    titulo('Arranque 3 veces');
    $r = [Universos::preparar(true), Universos::preparar(true), Universos::preparar(true)];
    check('Crea Guayaquil y Cuenca una sola vez', [[2, 3], [], []], $r);
    check('Servidores del universo 1', ['Servidor 1 · Quito', 'Servidor 2 · Guayaquil', 'Servidor 3 · Cuenca'], array_column(Universos::servidoresDe(1), 'nombre'));
    check('Los 30 siguen en el Servidor 1 (nadie se mueve)', [1 => 30, 2 => 0, 3 => 0], $porServidor());

    titulo('Los nuevos llenan parejo los servidores 2 y 3');
    $primeros = []; for ($i = 0; $i < 48; $i++) $primeros[] = $registrar()[1];
    check('Los 48 primeros nuevos: ninguno al Servidor 1 (ya tiene 24 activos)', 0, count(array_filter($primeros, fn($s) => $s === 1)));
    check('…24 y 24 en los servidores 2 y 3', [1 => 30, 2 => 24, 3 => 24], $porServidor());
    check('Activos parejos: 24, 24, 24', [1 => 24, 2 => 24, 3 => 24], $activosDe([1, 2, 3]));
    for ($i = 0; $i < 30; $i++) $registrar();
    $a = $activosDe([1, 2, 3]);
    check('30 más: los activos quedan parejos (diferencia máxima 1)', true, max($a) - min($a) <= 1);
    $t = $porServidor();
    check('…10 a cada uno (con empate de activos van primero los de menos jugadores en total)', [1 => 40, 2 => 34, 3 => 34], $t);
    check('Total de jugadores', 108, (int) Db::valor('SELECT COUNT(*) FROM jugadores'));
    fin();
}

// ===================================================================================================== actividad
if ($parte === 'actividad') {
    Universos::preparar();
    [$j] = $registrar(false);
    [$k] = $registrar(false);
    titulo('marcarActivo: a lo más una escritura por jugador y día');
    $t0 = $cambios();
    check('1.ª vez del día -> escribe', true, Universos::marcarActivo($j));
    check('…una fila (servidor y 0 eventos)', [1, (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]), 0],
        array_map('intval', array_values(Db::fila('SELECT COUNT(*) AS n, MAX(servidor_id) AS s, MAX(eventos) AS e FROM actividad_diaria WHERE jugador_id = ?', [$j]))));
    check('2.ª vez en la misma petición -> no escribe (ni consulta)', false, Universos::marcarActivo($j));
    Universos::reiniciar();
    $t1 = $cambios();
    check('Otra petición el mismo día -> no escribe', false, Universos::marcarActivo($j));
    check('…cambios en la base: 1 en total por el día', [1, 0], [$t1 - $t0, $cambios() - $t1]);
    titulo('Eventos en línea ($evento = true)');
    $t2 = $cambios();
    Universos::marcarActivo($j, true); Universos::marcarActivo($j, true);
    check('2 eventos validados -> eventos = 2, una escritura cada uno', [2, 2], [(int) Db::valor('SELECT eventos FROM actividad_diaria WHERE jugador_id = ? AND dia = ?', [$j, Universos::hoy()]), $cambios() - $t2]);
    check('Evento de un jugador que no había entrado hoy -> crea la fila con eventos = 1', [true, 1], [Universos::marcarActivo($k, true), (int) Db::valor('SELECT eventos FROM actividad_diaria WHERE jugador_id = ?', [$k])]);
    check('…y después entrar no escribe otra vez', false, Universos::marcarActivo($k));
    check('Jugador inexistente o 0 -> no escribe, no falla', [false, false, 0], [Universos::marcarActivo(0), Universos::marcarActivo(999999), (int) Db::valor('SELECT COUNT(*) FROM actividad_diaria WHERE jugador_id = 999999')]);
    $sj = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
    check('Universos::eventos(servidor) suma los del día', 2 + ($sj === (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$k]) ? 1 : 0), Universos::eventos($sj));

    titulo('Días siguientes y ventanas de activos (1 / 7 / 30 días)');
    $hoy = strtotime('today 12:00');
    Universos::fijarReloj($hoy + 86400);
    check('Al día siguiente -> escribe otra fila', [true, 2], [Universos::marcarActivo($j), (int) Db::valor('SELECT COUNT(*) FROM actividad_diaria WHERE jugador_id = ?', [$j])]);
    // un tercer jugador que jugó hace 10 días en el servidor de $j
    [$v] = $registrar(false);
    Db::q('UPDATE jugadores SET servidor_id = ? WHERE id = ?', [$sj, $v]);
    Db::q('INSERT INTO actividad_diaria (dia, jugador_id, servidor_id, eventos) VALUES (?, ?, ?, 0)', [date('Y-m-d', $hoy - 9 * 86400), $v, $sj]);
    check('activos(servidor, 1): solo hoy ($j)', 1, Universos::activos($sj, 1));
    check('activos(servidor, 7): $j', 1, Universos::activos($sj, 7));
    check('activos(servidor, 30): $j y el de hace 10 días', 2, Universos::activos($sj, 30));
    Universos::fijarReloj($hoy + 8 * 86400);
    $kAqui = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$k]) === $sj;
    check('8 días después: activos(7) = 0 y activos(30) sigue contándolos', [0, 2 + ($kAqui ? 1 : 0)], [Universos::activos($sj, 7), Universos::activos($sj, 30)]);
    Universos::fijarReloj(null);
    titulo('Activos según el servidor de HOY (traslado o fusión)');
    $otro = $sj === 1 ? 2 : 1;
    $antesOtro = Universos::activos($otro);
    Db::q('UPDATE jugadores SET servidor_id = ? WHERE id = ?', [$otro, $j]);
    check('El jugador trasladado cuenta en su servidor nuevo', $antesOtro + 1, Universos::activos($otro));
    check('…y el día ya anotado conserva el servidor de ese día', $sj, (int) Db::valor('SELECT servidor_id FROM actividad_diaria WHERE jugador_id = ? AND dia = ?', [$j, Universos::hoy()]));
    titulo('Borrar la cuenta borra su actividad (ON DELETE CASCADE)');
    Db::q('DELETE FROM jugadores WHERE id = ?', [$v]);
    check('Sin filas del jugador borrado', 0, (int) Db::valor('SELECT COUNT(*) FROM actividad_diaria WHERE jugador_id = ?', [$v]));
    fin();
}

// ===================================================================================================== desborde
if ($parte === 'desborde') {
    Universos::preparar();
    Db::q('UPDATE servidores SET capacidad = 4');
    titulo('Todos los servidores del universo llenos -> universo nuevo');
    for ($i = 0; $i < 12; $i++) $registrar();
    check('12 jugadores: 4 por servidor (los llenos se cierran al pasar el reparto por ellos: queda abierto solo el 3)', [[1 => 4, 2 => 4, 3 => 4], [3]], [$porServidor(), array_map('intval', array_column(Db::todas('SELECT id FROM servidores WHERE abierto = 1'), 'id'))]);
    check('siguiente() = null (se abriría un universo)', null, Universos::siguiente());
    [, $s13] = $registrar();
    check('El 13.º abre el Universo Pacífico con 3 servidores (4, 5, 6) y entra al 4', [2, 'Universo Pacífico', [4, 5, 6], 4],
        [(int) Db::valor('SELECT MAX(id) FROM universos'), (string) Db::valor('SELECT nombre FROM universos WHERE id = 2'), array_column(Universos::servidoresDe(2), 'id'), $s13]);
    check('…nombres de los servidores nuevos', ['Servidor 4 · Manta', 'Servidor 5 · Loja', 'Servidor 6 · Ambato'], array_column(Universos::servidoresDe(2), 'nombre'));
    check('…el universo 1 queda cerrado a nuevos (sus 3 servidores abierto = 0), pero activo para la copa', [0, 1], [(int) Db::valor('SELECT COUNT(*) FROM servidores WHERE universo_id = 1 AND abierto = 1'), (int) Db::valor('SELECT activo FROM universos WHERE id = 1')]);
    check('…capacidad copiada (4) y universoDe(5) = 2', [4, 2], [(int) Db::valor('SELECT capacidad FROM servidores WHERE id = 6'), Universos::universoDe(5)['id'] ?? null]);
    $au = Db::fila("SELECT * FROM auditoria WHERE accion = 'universo_crear' ORDER BY id DESC LIMIT 1");
    check('…en la auditoría como "sistema"', ['sistema', true], [$au['quien'] ?? null, str_contains((string) ($au['detalle'] ?? ''), 'Universo Pacífico')]);
    $van = []; for ($i = 0; $i < 5; $i++) $van[] = $registrar()[1];
    check('Los siguientes se reparten en el universo nuevo: 5, 6, 4, 5, 6', [5, 6, 4, 5, 6], $van);
    check('resumen(): universo 1 cerrado, universo 2 abierto', [false, true], array_column(Universos::resumen()['universos'], 'abierto'));

    titulo('Universo creado a mano (Centro de Control) con auditoría');
    $r = Universos::crear('  Universo   de Prueba ', 2, 'admin_prueba');
    check('crear(): id 3, nombre limpio, 2 servidores (7 y 8)', [3, 'Universo de Prueba', [7, 8]], [$r['id'], $r['nombre'], array_column($r['servidores'], 'id')]);
    $au = Db::fila("SELECT * FROM auditoria WHERE accion = 'universo_crear' ORDER BY id DESC LIMIT 1");
    check('…auditado con quien = admin_prueba y la IP', ['admin_prueba', '127.0.0.1', true], [$au['quien'], $au['ip'], str_contains($au['detalle'], 'Servidor 7')]);
    check('Los nuevos van al universo más nuevo (3)', [7, 8], [$registrar()[1], $registrar()[1]]);
    check('Nombre repetido (sin importar mayúsculas ni tildes) -> 409', [409, 'nombre_ocupado'], falla(fn() => Universos::crear('universo pacifico', 3, 'admin')));
    check('0 servidores -> 400; 13 -> 400; nombre corto -> 400', [[400, 'servidores'], [400, 'servidores'], [400, 'nombre']],
        [falla(fn() => Universos::crear('Universo X', 0, 'admin')), falla(fn() => Universos::crear('Universo X', 13, 'admin')), falla(fn() => Universos::crear('U', 3, 'admin'))]);
    check('…ninguno creó nada', 3, (int) Db::valor('SELECT COUNT(*) FROM universos'));

    titulo('Universo más nuevo sin cupo -> se usa uno anterior con servidor abierto (antes que abrir otro)');
    Db::q('UPDATE servidores SET abierto = 0 WHERE universo_id = 3');
    check('Universo 3 cerrado: el siguiente va al universo 2', 2, Universos::universoDe($registrar()[1])['id'] ?? null);
    Db::q('UPDATE universos SET activo = 0 WHERE id = 2');
    check('Universo 2 retirado (activo = 0) y los demás llenos -> se abre el universo 4 (nombre n.º 4 de la lista)', [4, 'Universo Galápagos'],
        [Universos::universoDe($registrar()[1])['id'] ?? null, (string) Db::valor('SELECT nombre FROM universos WHERE id = 4')]);

    titulo('Arranque después de todo esto: no toca nada');
    $antes = Db::todas('SELECT * FROM servidores ORDER BY id');
    check('preparar() x3 -> nada nuevo', [[], [], []], [Universos::preparar(true), Universos::preparar(true), Universos::preparar(true)]);
    check('…servidores iguales', $antes, Db::todas('SELECT * FROM servidores ORDER BY id'));
    fin();
}

// ===================================================================================================== salud
if ($parte === 'salud') {
    if (Migraciones::columnas('servidor_salud') === null) { echo "  (sin servidor_salud: falta fusiones.sql; se salta)\n"; fin(); }
    Universos::preparar();
    $foto = fn(int $s, string $dia, string $estado) => Db::q('INSERT OR REPLACE INTO servidor_salud (dia, servidor_id, estado, creado) VALUES (?, ?, ?, ?)', [$dia, $s, $estado, time()]);
    $ayer = date('Y-m-d', strtotime('-1 day')); $hoy = date('Y-m-d');
    titulo("Servidor en 'abandono' (última foto de salud): no recibe jugadores nuevos");
    $foto(2, $ayer, 'sano'); $foto(2, $hoy, 'abandono'); $foto(1, $hoy, 'bajo');
    $van = []; for ($i = 0; $i < 6; $i++) $van[] = $registrar()[1];
    check('6 nuevos: ninguno al Servidor 2; 3 al 1 (bajo sí recibe) y 3 al 3', [0, 3, 3], [count(array_keys($van, 2)), count(array_keys($van, 1)), count(array_keys($van, 3))]);
    check('…el Servidor 2 sigue abierto (solo se salta, no se cierra)', 1, (int) Db::valor('SELECT abierto FROM servidores WHERE id = 2'));
    $foto(2, date('Y-m-d', strtotime('+1 day')), 'sano');
    check('Foto más nueva "sano": el 2 vuelve a recibir (la foto vieja de abandono ya no cuenta)', 2, $registrar()[1]);
    titulo('Todos los servidores del universo en abandono -> universo nuevo');
    foreach ([1, 2, 3] as $s) $foto($s, date('Y-m-d', strtotime('+2 days')), 'abandono');
    check('siguiente() = null', null, Universos::siguiente());
    [, $s] = $registrar();
    check('El nuevo abre el universo 2 y entra a su primer servidor (4)', [2, 4], [Universos::universoDe($s)['id'] ?? null, $s]);
    check('…los servidores en abandono no se cierran ni se tocan', 3, (int) Db::valor('SELECT COUNT(*) FROM servidores WHERE universo_id = 1 AND abierto = 1'));
    fin();
}

// ===================================================================================================== uno
if ($parte === 'uno') {
    titulo('UNIVERSO_SERVIDORES_INICIALES=1 (como antes: un servidor por universo)');
    check('Arranque: solo el Servidor 1', [[], [1]], [Universos::preparar(true), array_column(Universos::servidoresDe(1), 'id')]);
    $sids = []; for ($i = 0; $i < 3; $i++) $sids[] = $registrar()[1];
    check('Todos al Servidor 1', [1, 1, 1], $sids);
    Db::q('UPDATE servidores SET capacidad = 3 WHERE id = 1');
    [, $s] = $registrar();
    check('Servidor 1 lleno -> universo 2 con el Servidor 2 · Guayaquil (cerrado el 1)', [2, 'Servidor 2 · Guayaquil', 2, 0],
        [$s, (string) Db::valor('SELECT nombre FROM servidores WHERE id = 2'), Universos::universoDe(2)['id'] ?? null, (int) Db::valor('SELECT abierto FROM servidores WHERE id = 1')]);
    check('…el siguiente también al 2', 2, $registrar()[1]);
    Db::q('UPDATE servidores SET capacidad = 1000, abierto = 1 WHERE id = 1');
    Db::q('UPDATE servidores SET abierto = 0 WHERE id = 2');
    check('Servidor 2 cerrado y el 1 reabierto -> vuelven al 1', 1, $registrar()[1]);
    fin();
}
