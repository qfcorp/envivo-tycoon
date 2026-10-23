<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Edad del servidor y días temáticos de la Copa
// (server/src/EdadServidor.php, server/src/CopaTemas.php; reglas en server/INTEGRAR_EDAD_SERVIDOR.md):
// base SQLite TEMPORAL; línea de tiempo de un servidor nuevo (día 1, candados, "Se abre el día 7 del servidor (en 3 días)"),
// veteranos con todo abierto, reinicio desde el Centro de Control, la Copa que no mete a un servidor nuevo hasta su día 7,
// los 5 días temáticos (solo con datos del validador), las obras de la sede oficial del lunes y viernes (una vez, con tope)
// y las rutas por HTTP (copia de api.php con sus líneas): /api/estado, /api/servidor/calendario y los 403 edad_servidor.
// Uso:  php server/tests/pruebas_edad_servidor.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_edad_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nCOPA_SECRETO=secreto-de-prueba\n"
    . "UNIVERSO_SERVIDORES_INICIALES=1\nVALIDADOR_URL=http://127.0.0.1:1\nEDAD_SERVIDOR_DIAS=festival=4,inventado=2,apertura=9\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Copas, CopaTemas, Db, EdadServidor, Fallo, Migraciones};

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
    try { $f(); return [200, null, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null, $e->getMessage()]; }
}
$Z = new DateTimeZone('America/Guayaquil');
$en = fn(string $fecha) => (new DateTimeImmutable($fecha, $Z))->getTimestamp();
$reloj = function (int $t) { Copas::$reloj = $t; EdadServidor::$reloj = $t; EdadServidor::olvidar(); if (class_exists(\EnVivo\Universos::class)) \EnVivo\Universos::fijarReloj($t); };
$abiertos = fn(array $e) => array_column(array_filter($e['desbloqueos'], fn($d) => $d['abierto']), 'clave');

Db::pdo();
Copas::preparar();
EdadServidor::preparar();
$cols = Migraciones::columnas('servidores') ?? [];

// ------------------------------------------------------------------ fechas: todo después del corte (ahora + 24 h)
$corte = EdadServidor::corte();
// Lunes W0 = el primer lunes que cae al menos 8 días después de hoy (así el servidor nuevo nace después del corte)
$lun = (new DateTimeImmutable('@' . (time() + 8 * 86400)))->setTimezone($Z)->setTime(0, 0);
$lun = $lun->modify('+' . ((8 - (int) $lun->format('N')) % 7) . ' days');
$LUN = $lun->getTimestamp();
$dia = fn(int $n, int $h = 10, int $m = 0) => $lun->modify('+' . ($n - 1) . ' days')->setTime($h, $m)->getTimestamp();   // 1 = lunes W0
$NACE = $lun->modify('-3 days')->setTime(10, 0)->getTimestamp();   // viernes antes del lunes W0, 10:00 → el lunes es su día 4

titulo('Línea de tiempo y veteranos');
check('La migración fijó el corte una sola vez (≈ ahora + 24 h)', true, $corte > time() + 86000 && $corte <= time() + 86400 + 5);
Migraciones::aplicar('edad_servidor.sql');
check('…correr la migración otra vez no lo cambia', $corte, EdadServidor::corte());
$e1 = EdadServidor::de(1);
check('Servidor 1 (ya existía): veterano, todo abierto, nada próximo', [true, ['apertura', 'duelos', 'festival', 'copa'], []],
    [$e1['veterano'], array_column($e1['desbloqueos'], 'clave') === ['apertura', 'duelos', 'festival', 'copa'] ? $abiertos($e1) : array_column($e1['desbloqueos'], 'clave'), $e1['proximos']]);
Db::q('INSERT INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (4, ?, 1000, 1, ?)', ['Servidor 4 · Loja', $NACE]);
if (isset($cols['universo_id'])) Db::q('UPDATE servidores SET universo_id = 1 WHERE id = 4');
$reloj($NACE);
$e4 = EdadServidor::de(4);
$porClave = fn(array $e) => array_column($e['desbloqueos'], null, 'clave');
$d4 = $porClave($e4);
check('Servidor nuevo el día que nace: día 1, edad 0, no veterano, solo la apertura', [1, 0, false, ['apertura']], [$e4['dia'], $e4['edad_dias'], $e4['veterano'], $abiertos($e4)]);
check('EDAD_SERVIDOR_DIAS: festival se mueve al día 4; claves inventadas y la apertura no cambian', [1, 3, 4, 7], [$d4['apertura']['dia'], $d4['duelos']['dia'], $d4['festival']['dia'], $d4['copa']['dia']]);
check('Cada desbloqueo se abre a las 00:00 (Ecuador) de su día', [$lun->modify('-1 day')->getTimestamp(), $lun->getTimestamp() + 3 * 86400], [$d4['duelos']['abre'], $d4['copa']['abre']]);
check('Faltan 2 / 3 / 6 días; próximos en orden (duelos, festival, copa)', [[2, 3, 6], ['duelos', 'festival', 'copa']],
    [[$d4['duelos']['faltan_dias'], $d4['festival']['faltan_dias'], $d4['copa']['faltan_dias']], array_column($e4['proximos'], 'clave')]);
$reloj($lun->modify('-1 day')->getTimestamp() - 1);   // domingo 23:59:59 = día 2
check('Día 2 a las 23:59:59: duelos todavía cerrado y el texto dice "mañana"', [2, false, 'Se abre el día 3 del servidor (mañana).'],
    [EdadServidor::de(4)['dia'], EdadServidor::abierto(4, 'duelos'), EdadServidor::mensaje($porClave(EdadServidor::de(4))['duelos'])]);
$reloj($lun->modify('-1 day')->getTimestamp());
check('…a las 00:00 del día 3 se abre', [3, true], [EdadServidor::de(4)['dia'], EdadServidor::abierto(4, 'duelos')]);
$reloj($dia(1, 9));
check('Lunes = día 4: festival abierto; la copa dice "Se abre el día 7 del servidor (en 3 días)."', [4, true, 'Se abre el día 7 del servidor (en 3 días).'],
    [EdadServidor::de(4)['dia'], EdadServidor::abierto(4, 'festival'), EdadServidor::mensaje($porClave(EdadServidor::de(4))['copa'])]);
check('filtrarAbiertos([1, 4], copa) el día 4 → solo el veterano', [1], EdadServidor::filtrarAbiertos([1, 4], 'copa'));
check('Clave o servidor desconocidos: abierto (no rompe nada)', [true, true], [EdadServidor::abierto(4, 'no_existe'), EdadServidor::abierto(999, 'copa')]);
EdadServidor::fijarInicio(1, $dia(1, 9), 'prueba');
$r1 = EdadServidor::de(1);
check('Centro de Control: reiniciar la línea de tiempo del servidor 1 → deja de ser veterano (día 1), auditado', [false, 1, true],
    [$r1['veterano'], $r1['dia'], (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'edad_servidor_inicio'")]);
EdadServidor::fijarInicio(1, null, 'prueba');
check('…y volver a lo normal: veterano otra vez', true, EdadServidor::de(1)['veterano']);
check('fijarInicio de un servidor que no existe → 404', [404, 'no_existe'], array_slice(falla(fn() => EdadServidor::fijarInicio(999, time(), 'prueba')), 0, 2));

// =====================================================================
titulo('Copa de Servidores: un servidor nuevo entra el día 7');
$nuevoJugador = function (string $alias, int $sid, int $fama = 10): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '@prueba.example', $alias, 'x', time(), $sid, $alias, strtolower($alias), $fama]);
    return Db::ultimoId();
};
$equipo = fn(int $hab = 3) => ['staff' => [['role' => 'camarografo', 'skill' => $hab, 'owner' => true, 'name' => 'Tú'], ['role' => 'director', 'skill' => $hab], ['role' => 'sonidista', 'skill' => 2], ['role' => 'tecnico_transmision', 'skill' => 2]],
    'equip' => array_merge(array_fill(0, 3, ['type' => 'cam_basic', 'condition' => 90]), array_map(fn($t) => ['type' => $t, 'condition' => 90], ['switch_basic', 'audio_basic', 'mics', 'encoder']))];
$A = $nuevoJugador('Quito Ana', 1); $B = $nuevoJugador('Quito Beto', 1); $C = $nuevoJugador('Quito Caro', 1); $SIN = $nuevoJugador('Quito Sin Equipo', 1);
$L = $nuevoJugador('Loja Luis', 4);
$reloj($dia(1, 9));
Copas::tareaProgramada();
$CID = (int) Db::valor('SELECT id FROM copas WHERE inicio = ?', [$LUN]);
$servs = fn() => array_map('intval', array_column(Db::todas('SELECT servidor_id FROM copa_servidores WHERE copa_id = ? ORDER BY servidor_id', [$CID]), 'servidor_id'));
check('Lunes (servidor 4 en su día 4): la copa de la semana se arma solo con el servidor 1', [true, [1], 0], [$CID > 0, $servs(), (int) Db::valor('SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ?', [$CID])]);
[$cod, $codigo, $msg] = falla(fn() => Copas::registrarEquipo($L, $equipo()));
check('…un jugador del servidor 4 no puede registrar equipo: 403 edad_servidor con el texto amable', [403, 'edad_servidor', 'Se abre el día 7 del servidor (en 3 días).'], [$cod, $codigo, $msg]);
check('…ni pedir un evento de copa', [403, 'edad_servidor'], array_slice(falla(fn() => Copas::iniciarIntento($L)), 0, 2));
check('…pero sí puede mirar la copa (GET): su servidor no aparece en la tabla', [true, false], (function () use ($L) { $e = Copas::estado($L); return [isset($e['copa']['id']), in_array(4, array_column($e['servidores'], 'id'), true)]; })());
$reloj($dia(4, 10));
Copas::tareaProgramada();
check('Jueves (día 7 del servidor 4, la preparación sigue): entra a la copa y se arma su cruce', [[1, 4], 1], [$servs(), (int) Db::valor('SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ?', [$CID])]);
check('…y ya puede registrar su equipo', true, Copas::registrarEquipo($L, $equipo())['ok']);

// =====================================================================
titulo('Días temáticos: el factor sale solo del validador');
$P_BIEN = [['Base', 25, 'parte.base'], ['Cámaras 3/3', 25, 'parte.camaras'], ['Calidad de cámaras', 9, 'parte.calidad_camaras'], ['Director y switcher', 12, 'parte.director_switcher'], ['Experiencia', 8, 'parte.experiencia']];
$conParte = fn(array $extra) => array_merge($P_BIEN, [$extra]);
$R = fn(?array $partes) => ['valido' => true, 'calidad' => 70, 'estrellas' => 4, 'detalle' => $partes === null ? [] : ['partes' => $partes]];
$f = fn(int $t, array $r, bool $ok = true) => CopaTemas::factor($t, $r, $ok)['x'];
check('Lunes (construcción): eventos ×1', 1.0, $f($dia(1), $R($P_BIEN)));
check('Martes (personal): personal ideal completo ×1,5; falta un rol ×1; "justo" ×1; sin partes ×1', [1.5, 1.0, 1.0, 1.0],
    [$f($dia(2), $R($P_BIEN)), $f($dia(2), $R($conParte(['Falta productor', -4, 'parte.falta_rol']))), $f($dia(2), $R($conParte(['Justo', -1, 'parte.justo_rol']))), $f($dia(2), $R(null))]);
check('Miércoles (equipos): completos ×1,5; sin switcher ×1; cámara bloqueada ×1; cámaras flojas (15 de 25) ×1', [1.5, 1.0, 1.0, 1.0],
    [$f($dia(3), $R($P_BIEN)), $f($dia(3), $R($conParte(['Sin switcher', -8, 'parte.sin_switcher']))), $f($dia(3), $R($conParte(['Bloqueada', 0, 'bloq.lente']))),
     $f($dia(3), $R(array_map(fn($p) => $p[2] === 'parte.camaras' ? [$p[0], 15, $p[2]] : $p, $P_BIEN)))]);
check('Jueves (en línea): todo evento validado ×1,5, aunque no traiga partes', [1.5, 1.5], [$f($dia(4), $R(null)), $f($dia(4), $R($P_BIEN))]);
check('Viernes (total): personal + equipos ×1,5; solo personal ×1,25; nada ×1', [1.5, 1.25, 1.0],
    [$f($dia(5), $R($P_BIEN)), $f($dia(5), $R($conParte(['Sin consola', -6, 'parte.sin_consola']))), $f($dia(5), $R(array_merge($P_BIEN, [['Sin consola', -6, 'parte.sin_consola'], ['Falta', -3, 'parte.falta_rol']])))]);
check('Sábado y domingo: sin tema (×1)', [1.0, null, 1.0], [$f($dia(6), $R($P_BIEN)), CopaTemas::de($dia(6)), $f($dia(7), $R($P_BIEN))]);
check('Intento sospechoso (el juego mintió): sin bono aunque sea jueves', 1.0, $f($dia(4), $R($P_BIEN), false));
check('Partes mal formadas (sin clave) o sin "parte.base": sin bono', [1.0, 1.0], [$f($dia(2), $R([['Base', 25]])), $f($dia(2), $R([['Cámaras', 25, 'parte.camaras']]))]);
check('Nunca más de ×1,5', true, max(array_map(fn($n) => $f($dia($n), $R($P_BIEN)), [1, 2, 3, 4, 5])) <= CopaTemas::FACTOR_MAX);

// =====================================================================
titulo('Días temáticos dentro de la copa (intentos validados y obras de la sede oficial)');
// Copa de la semana W1 (sin el servidor nuevo para no mezclar): solo el servidor 1
$LUN1 = $LUN + 7 * 86400;
$d1 = fn(int $n, int $h = 10, int $m = 0) => (new DateTimeImmutable('@' . $LUN1))->setTimezone($Z)->modify('+' . ($n - 1) . ' days')->setTime($h, $m)->getTimestamp();
$VAL = ['partes' => $P_BIEN, 'modo' => 'ok'];
Copas::$validador = function (array $it) use (&$VAL): array {
    $cli = $it['cliente_resultado'] ?? ['quality' => 50, 'stars' => 3];
    if ($VAL['modo'] === 'trampa') return ['valido' => false, 'coincide' => false, 'calidad' => 41, 'estrellas' => 2, 'detalle' => ['motivo' => 'resultado_no_coincide', 'partes' => $VAL['partes']]];
    return ['valido' => true, 'coincide' => true, 'calidad' => $cli['quality'], 'estrellas' => $cli['stars'], 'version_logica' => 'prueba', 'detalle' => $VAL['partes'] === null ? [] : ['partes' => $VAL['partes']]];
};
$jugar = function (int $j, int $q = 70, int $s = 4): int { $it = Copas::iniciarIntento($j); return (int) Copas::enviarIntento($j, ['intento_id' => $it['id'], 'decisiones' => [0], 'resultado' => ['quality' => $q, 'stars' => $s]])['resultado']['puntos']; };
$reloj($d1(1, 9));
Copas::tareaProgramada();
$W1 = (int) Db::valor('SELECT id FROM copas WHERE inicio = ?', [$LUN1]);
foreach ([$A, $B, $C] as $j) Copas::registrarEquipo($j, $equipo());
check('Lunes: evento con todo completo suma normal (70 + 10 = 80)', 80, $jugar($A));
$hayObras = (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sede_obras'");
if (!$hayObras) echo "  AVISO: no está la tabla sede_obras (sede oficial): se saltan las obras\n";
$obra = function (int $j, string $tipo, int $fin) { Db::q("INSERT INTO sede_obras (jugador_id, tipo, ed, nivel, inicio, duracion, fin, estado) VALUES (?, ?, 'control', 2, ?, 3600, ?, 'activa')", [$j, $tipo, $fin - 3600, $fin]); return Db::ultimoId(); };
$obrasDe = fn(int $j) => (int) Db::valor("SELECT COALESCE(SUM(puntos), 0) FROM copa_aportes WHERE copa_id = ? AND jugador_id = ? AND fuente = 'obra'", [$W1, $j]);
if ($hayObras) {
    $o1 = $obra($A, 'nivel', $d1(1, 11));
    $obra($SIN, 'nivel', $d1(1, 11));          // sin equipo de copa registrado: no cuenta
    $obra($A, 'mejora', $d1(1, 13));          // todavía no termina a las 12:00
    $obra($A, 'nivel', $d1(1, 0, 0) - 60);    // terminó el domingo: no cuenta
    $reloj($d1(1, 12));
    Copas::tareaProgramada();
    check('Lunes 12:00: la obra de nivel terminada a las 11:00 da 40 × 2 = 80; la de las 13:00 todavía no; la del domingo no', [80, 1], [$obrasDe($A), (int) Db::valor("SELECT COUNT(*) FROM copa_aportes WHERE fuente = 'obra' AND ref = ?", ['obra:' . $o1])]);
    check('…sin equipo de copa registrado no cuenta', 0, $obrasDe($SIN));
    Copas::tareaProgramada(); Copas::estado($A);
    check('…correr la tarea otra vez (o abrir la copa) no suma dos veces', 80, $obrasDe($A));
    for ($k = 0; $k < 7; $k++) $obra($A, 'mejora', $d1(1, 14, $k));
    $reloj($d1(1, 15));
    $e = Copas::estado($A);
    check('Tope: máximo ' . CopaTemas::OBRAS_DIA . ' obras por día (1 nivel + 5 mejoras = 80 + 5 × 30)', [80 + 5 * 30, 6, 6, 'construccion'],
        [$obrasDe($A), $e['tema']['obras']['cuantas'], $e['tema']['obras']['max'], $e['tema']['hoy']['clave']]);
    check('…el aporte de obras queda con fecha de la obra y sube la preparación del servidor', [true, true],
        [(int) Db::valor("SELECT MIN(creado) FROM copa_aportes WHERE fuente = 'obra' AND jugador_id = ?", [$A]) === $d1(1, 11),
         (int) Db::valor('SELECT puntos_prep FROM copa_servidores WHERE copa_id = ? AND servidor_id = 1', [$W1]) === (int) Db::valor('SELECT SUM(puntos) FROM copa_aportes WHERE copa_id = ? AND servidor_id = 1', [$W1])]);
    $obra($A, 'nivel', $d1(2, 9));
    $reloj($d1(2, 10));
    Copas::tareaProgramada();
    check('Martes: las obras no cuentan', 80 + 5 * 30, $obrasDe($A));
}
$reloj($d1(2, 10));
check('Martes: personal ideal completo ×1,5 (80 → 120)', 120, $jugar($A));
$VAL['partes'] = $conParte(['Falta productor', -4, 'parte.falta_rol']);
check('…con un rol faltante: normal (80)', 80, $jugar($B));
$VAL['partes'] = null;
check('…sin partes del validador: normal (80)', 80, $jugar($C));
$VAL = ['partes' => $P_BIEN, 'modo' => 'trampa'];
check('…el juego mintió: cuenta lo del validador (41) y sin bono', 41, $jugar($C, 99, 5));
$VAL = ['partes' => $P_BIEN, 'modo' => 'ok'];
$reloj($d1(3, 10));
check('Miércoles: equipos completos ×1,5 (80 → 120)', 120, $jugar($A));
$VAL['partes'] = $conParte(['Sin switcher', -8, 'parte.sin_switcher']);
check('…sin switcher: normal (80)', 80, $jugar($B));
$VAL['partes'] = null;
$reloj($d1(4, 10));
check('Jueves: todo evento validado ×1,5 (80 → 120)', 120, $jugar($B));
$VAL['partes'] = $conParte(['Sin consola', -6, 'parte.sin_consola']);
$reloj($d1(5, 10));
check('Viernes: solo personal ideal +25 % (80 → 100)', 100, $jugar($C));
$VAL['partes'] = $P_BIEN;
check('…personal y equipos: ×1,5 (80 → 120)', 120, $jugar($A));
// El día lo marca cuándo se PIDIÓ el evento (no cuándo se envió)
$reloj($d1(5, 23, 50));
$it = Copas::iniciarIntento($B);
$reloj($d1(5, 23, 59));
check('Evento pedido el viernes 23:50 y enviado 23:59 cuenta con el tema del viernes', 120, (int) Copas::enviarIntento($B, ['intento_id' => $it['id'], 'decisiones' => [0], 'resultado' => ['quality' => 70, 'stars' => 4]])['resultado']['puntos']);
if ($hayObras) {
    $obra($B, 'mejora', $d1(5, 12));
    Copas::tareaProgramada();
    check('Viernes: las obras cuentan normal (mejora 15)', 15, $obrasDe($B));
}
check('La preparación del servidor = suma de todos sus aportes (eventos + obras)', (int) Db::valor('SELECT SUM(puntos) FROM copa_aportes WHERE copa_id = ? AND servidor_id = 1', [$W1]),
    (int) Db::valor('SELECT puntos_prep FROM copa_servidores WHERE copa_id = ? AND servidor_id = 1', [$W1]));
$e = Copas::estado($A);
check('GET copa trae el tema: hoy (viernes, total), la semana (5 días, el viernes marcado, los anteriores pasados)', ['total', 5, [false, false, false, false, true], [true, true, true, true, false]],
    [$e['tema']['hoy']['clave'] ?? null, count($e['tema']['semana']), array_column($e['tema']['semana'], 'hoy'), array_column($e['tema']['semana'], 'pasado')]);
$reloj($d1(6, 9));
check('Sábado: GET copa sin tema de hoy (batalla)', null, Copas::estado($A)['tema']['hoy']);
$reloj($d1(6, 10));
if ($hayObras) { $obra($A, 'nivel', $d1(6, 9)); Copas::tareaProgramada(); check('Sábado: obras ya no suman (la preparación terminó)', 80 + 5 * 30, $obrasDe($A)); }
check('semanaJson: las claves de lunes a viernes', ['construccion', 'personal', 'equipos', 'en_linea', 'total'], array_column(CopaTemas::semanaJson($d1(3)), 'clave'));

// =====================================================================
titulo('Rutas por HTTP (copia de api.php con sus líneas)');
Copas::$reloj = null; Copas::$validador = null; EdadServidor::$reloj = null; EdadServidor::olvidar();
if (class_exists(\EnVivo\Universos::class)) \EnVivo\Universos::fijarReloj(null);
Db::q('INSERT INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (5, ?, 1000, 1, ?)', ['Servidor 5 · Manta', time()]);
if (isset($cols['universo_id'])) Db::q('UPDATE servidores SET universo_id = 1 WHERE id = 5');
EdadServidor::fijarInicio(5, time(), 'prueba');   // nace hoy: día 1
$NUEVO = $nuevoJugador('Manta Nueva', 5);
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
check('api.php tiene la línea de INTEGRAR_EDAD_SERVIDOR.md (revisarRuta, decorarEstado, calendario)', [true, true, true],
    [str_contains($api, 'EdadServidor::revisarRuta('), str_contains($api, 'EdadServidor::decorarEstado('), str_contains($api, 'EdadServidor::esRuta(')]);
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ';', $api);
file_put_contents($TMP . '/api.php', $api);
$puerto = (int) (getenv('P_APP') ?: 8900 + random_int(0, 900));
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-S', '127.0.0.1:' . $puerto, $TMP . '/api.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tub, null, ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PATH' => getenv('PATH')]);
for ($k = 0; $k < 50; $k++) { if (@fsockopen('127.0.0.1', $puerto)) break; usleep(100000); }
$sesion = function (int $j): string { $tok = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $tok), $j, time(), time() + 3600]); return $tok; };
$http = function (string $metodo, string $ruta, ?array $cuerpo = null, ?string $tok = null) use ($puerto): array {
    $ch = curl_init('http://127.0.0.1:' . $puerto . $ruta);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Envivo: 1'], CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30]
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []) + ($tok ? [CURLOPT_COOKIE => 'envivo_s=' . $tok] : []));
    $b = curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode((string) $b, true)];
};
$tokV = $sesion($A); $tokN = $sesion($NUEVO);
[$c, $j] = $http('GET', '/api/estado', null, $tokV);
check('GET /api/estado (veterano): edad_servidor {edad_dias, dia, veterano, 4 desbloqueos abiertos}; servidor queda igual {id, nombre}', [200, true, true, true, 4, 4, [], ['id', 'nombre']],
    [$c, is_int($j['edad_servidor']['edad_dias'] ?? null), is_int($j['edad_servidor']['dia'] ?? null), $j['edad_servidor']['veterano'] ?? null, count($j['edad_servidor']['desbloqueos'] ?? []),
     count(array_filter($j['edad_servidor']['desbloqueos'] ?? [], fn($d) => $d['abierto'])), $j['edad_servidor']['proximos'] ?? null, array_keys($j['servidor'] ?? [])]);
[$c, $j] = $http('GET', '/api/estado', null, $tokN);
check('GET /api/estado (servidor nuevo): edad_servidor día 1, edad 0, próximos = duelos (en 2 días), festival, copa', [200, 1, 0, false, ['duelos', 'festival', 'copa'], 2, 'Se abre el día 3 del servidor (en 2 días).'],
    [$c, $j['edad_servidor']['dia'] ?? null, $j['edad_servidor']['edad_dias'] ?? null, $j['edad_servidor']['veterano'] ?? null, array_column($j['edad_servidor']['proximos'] ?? [], 'clave'),
     $j['edad_servidor']['proximos'][0]['faltan_dias'] ?? null, $j['edad_servidor']['proximos'][0]['mensaje'] ?? null]);
check('…cada desbloqueo trae su fecha de apertura (ISO) para la cuenta regresiva', true, (bool) strtotime((string) ($j['edad_servidor']['proximos'][2]['abre'] ?? '')));
check('GET /api/estado sin sesión: sigue igual (sin edad_servidor)', [200, false], (function () use ($http) { [$c, $j] = $http('GET', '/api/estado'); return [$c, isset($j['edad_servidor'])]; })());
$edad = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null, $r[1]['desbloqueo'] ?? null, $r[1]['dia'] ?? null, $r[1]['faltan_dias'] ?? null, $r[1]['error'] ?? null];
check('POST /api/duelos/retar (servidor nuevo) → 403 edad_servidor "Se abre el día 3 del servidor (en 2 días)."', [403, 'edad_servidor', 'duelos', 3, 2, 'Se abre el día 3 del servidor (en 2 días).'], $edad($http('POST', '/api/duelos/retar', ['rival' => 1], $tokN)));
check('POST /api/festival/intento/iniciar → 403 edad_servidor (día 4 por la configuración, en 3 días)', [403, 'edad_servidor', 'festival', 4, 3, 'Se abre el día 4 del servidor (en 3 días).'], $edad($http('POST', '/api/festival/intento/iniciar', [], $tokN)));
check('POST /api/copa/equipo → 403 edad_servidor (día 7, en 6 días)', [403, 'edad_servidor', 'copa', 7, 6, 'Se abre el día 7 del servidor (en 6 días).'], $edad($http('POST', '/api/copa/equipo', $equipo(), $tokN)));
check('POST /api/pase_copa/comprar → 403 edad_servidor (no se compra un pase que todavía no sirve)', [403, 'edad_servidor'], array_slice($edad($http('POST', '/api/pase_copa/comprar', [], $tokN)), 0, 2));
check('…y trae la fecha de apertura', true, (bool) strtotime((string) ($http('POST', '/api/copa/intento/iniciar', [], $tokN)[1]['abre'] ?? '')));
check('GET /api/duelos (mirar) del servidor nuevo: no lo cierra la edad', true, ($http('GET', '/api/duelos', null, $tokN)[1]['codigo'] ?? '') !== 'edad_servidor');
check('POST /api/duelos/retar del veterano: no lo cierra la edad', true, ($http('POST', '/api/duelos/retar', ['rival' => 999999], $tokV)[1]['codigo'] ?? '') !== 'edad_servidor');
check('POST /api/duelos/retar sin sesión: responde el módulo (401), no la edad', 401, $http('POST', '/api/duelos/retar', [])[0]);
[$c, $j] = $http('GET', '/api/servidor/calendario', null, $tokN);
check('GET /api/servidor/calendario → servidor (día 1), 4 desbloqueos, 3 próximos, semana de copa (5 días), recurrentes', [200, true, 1, 4, 3, 5, true],
    [$c, $j['ok'] ?? null, $j['servidor']['dia'] ?? null, count($j['desbloqueos'] ?? []), count($j['proximos'] ?? []), count($j['copa_semana'] ?? []), count($j['recurrentes'] ?? []) >= 3]);
check('GET /api/servidor/calendario sin sesión → 401', 401, $http('GET', '/api/servidor/calendario')[0]);
check('POST /api/servidor/calendario → 405 con codigo', [405, 'metodo_no_permitido'], (function () use ($http, $tokN) { [$c, $j] = $http('POST', '/api/servidor/calendario', [], $tokN); return [$c, $j['codigo'] ?? null]; })());
check('Las otras rutas de /api/servidor siguen: GET /api/servidor/opciones no es 404', true, $http('GET', '/api/servidor/opciones', null, $tokN)[0] !== 404);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nEdad del servidor: $OK correctas · $FALLAS fallas\nResumen pruebas_edad_servidor.php — correctas: $OK  ·  Fallas: $FALLAS\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
