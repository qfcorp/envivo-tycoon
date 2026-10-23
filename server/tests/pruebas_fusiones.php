<?php
// SOLO PRUEBAS (en una máquina de pruebas; nunca en el servidor del juego).
// Salud de servidores y fusión de servidores abandonados (server/INTEGRAR_FUSIONES.md, COPAS.md §3):
//  - base SQLite y configuración TEMPORALES con 3 servidores, jugadores, asociaciones con nombres y siglas que chocan,
//    mercado, chat, liga, festival, duelos, desafío y coaliciones;
//  - salud por días simulados, plan (solo lectura) con todos los choques, ejecutar (todo movido, sin huérfanos,
//    foreign_key_check, integrity_check, créditos y compras iguales), re-ejecución bloqueada;
//  - traslado voluntario y rutas HTTP con "php -S" + una COPIA de server/public/api.php con las líneas de INTEGRAR_FUSIONES.md.
// Uso:  php server/tests/pruebas_fusiones.php        (GUARDAR_TMP=1 para dejar los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_fusiones_' . getmypid();
@mkdir($TMP . '/datos', 0755, true);
$P_APP = (int) (getenv('P_APP') ?: 8471);
file_put_contents("$TMP/config.env", "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:$P_APP\nENVIVO_ZONA=America/Guayaquil\nPLUX_AMBIENTE=sandbox\n");
putenv("ENVIVO_CONFIG=$TMP/config.env");

$procs = [];
register_shutdown_function(function () use (&$procs, $TMP) {
    foreach ($procs as $p) { $s = proc_get_status($p); if ($s['running']) posix_kill($s['pid'], 15); proc_close($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});

require $RAIZ . '/server/src/arranque.php';
use EnVivo\{Ajustes, Db, Fallo, Fusiones, SaludServidores, Social};
Db::pdo();

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }
function codigo(callable $f): string { try { $f(); return 'sin_error'; } catch (Fallo $e) { return (string) ($e->extra['codigo'] ?? 'fallo'); } }
function v(string $sql, array $p = []): mixed { return Db::valor($sql, $p); }
function d(int $mas): string { return SaludServidores::dia(SaludServidores::hoy(), $mas); }

// ============================================================ base de prueba
titulo('Base de prueba: 3 servidores, jugadores, asociaciones, mercado, chat, liga, festival, duelos, desafío, coaliciones');
$t = time();
$viejo = $t - 120 * 86400;
Db::q('UPDATE servidores SET creado = ?, capacidad = 1000 WHERE id = 1', [$viejo]);
Db::q("INSERT INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (2, 'Servidor 2 · Guayaquil', 1000, 1, ?), (3, 'Servidor 3 · Cuenca', 1000, 1, ?)", [$viejo, $viejo]);
$UNI = isset((EnVivo\Migraciones::columnas('servidores') ?? [])['universo_id']);
if ($UNI) Db::q('UPDATE servidores SET universo_id = 1');                // los 3 en el mismo universo (si ya está el módulo Universos)
// actividad_diaria del módulo Universos (si todavía no existe, con el esquema de COPAS.md §1)
Db::pdo()->exec('CREATE TABLE IF NOT EXISTS actividad_diaria (dia TEXT NOT NULL, jugador_id INTEGER NOT NULL, servidor_id INTEGER NOT NULL, eventos INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, jugador_id))');
$HASH = password_hash('clave-prueba', PASSWORD_BCRYPT, ['cost' => 4]);
$n = 0;
function jugador(int $sid, ?string $alias, int $creditos = 0): int {
    global $HASH, $n, $t;
    $n++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creditos, creado, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ["j$n@prueba.example", "Jugador $n", $HASH, $creditos, $t - 100 * 86400, $sid, $alias, $alias === null ? null : Social::clave($alias)]);
    return Db::ultimoId();
}
function asociacion(int $sid, string $nombre, string $siglas, array $miembros): int {
    global $t;
    Db::q("INSERT INTO asociaciones (servidor_id, nombre, nombre_clave, siglas, color, creado) VALUES (?, ?, ?, ?, '#ff3b3b', ?)", [$sid, $nombre, Social::clave($nombre), $siglas, $t]);
    $id = Db::ultimoId();
    foreach ($miembros as $i => $j) Db::q('INSERT INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, ?, ?)', [$id, $j, $i === 0 ? 'presidente' : 'socio', $t + $i]);
    return $id;
}
function actividad(array $ids, int $sid, string $desde, string $hasta, bool $diaria = false): void {
    for ($dd = $desde; $dd <= $hasta; $dd = SaludServidores::dia($dd, 1))
        foreach ($ids as $j) Db::q($diaria ? 'INSERT OR IGNORE INTO actividad_diaria (dia, jugador_id, servidor_id, eventos) VALUES (?, ?, ?, 2)' : 'INSERT OR IGNORE INTO actividad (jugador_id, dia) VALUES (?, ?)', $diaria ? [$dd, $j, $sid] : [$j, $dd]);
}
// Servidor 1 (Quito): 50 jugadores para la prueba de salud
$s1 = [];
for ($i = 1; $i <= 50; $i++) $s1[] = jugador(1, 'Quiteña ' . chr(64 + (($i - 1) % 26) + 1) . chr(64 + intdiv($i - 1, 26) + 1), 100 + $i);
// Servidor 2 (Guayaquil): 30 activos todos los días; alias que chocan con los de Cuenca
$s2 = [];
for ($i = 1; $i <= 30; $i++) $s2[] = jugador(2, 'Porteña ' . chr(64 + (($i - 1) % 26) + 1) . chr(64 + intdiv($i - 1, 26) + 1), 50);
$s2rayo = jugador(2, 'Rayo', 10); $s2rayoC = jugador(2, 'Rayo (Cuenca)', 10); $s2nandu = jugador(2, 'nandu films', 10);
$s2[] = $s2rayo; $s2[] = $s2rayoC; $s2[] = $s2nandu;
asociacion(2, 'Los Andes', 'LAN', [$s2[0], $s2[1]]);
asociacion(2, 'Puerto Sur', 'QFP', [$s2[2]]);
// Servidor 3 (Cuenca): pocos jugadores
$c1 = jugador(3, 'Rayo', 500); $c2 = jugador(3, 'Ñandú Films', 250); $c3 = jugador(3, 'Solo Cuenca', 0); $c4 = jugador(3, null, 7); $c5 = jugador(3, 'Inactiva', 3);
$s3 = [$c1, $c2, $c3, $c4, $c5];
$aAndes = asociacion(3, 'Los Andes', 'AND', [$c1, $c2]);            // choca el nombre
$aCosta = asociacion(3, 'Costa Viva', 'qfp', [$c3]);                // choca las siglas (sin importar mayúsculas)
$aUnica = asociacion(3, 'Única', 'UNI', [$c4]);                     // no choca
Db::q('INSERT INTO asociacion_solicitudes (asociacion_id, jugador_id, creado) VALUES (?, ?, ?)', [$aAndes, $c5, $t]);
// Mercado (global) y una compra pagada (créditos y compras no se tocan)
Db::q("INSERT INTO inventario (jugador_id, item, serie, origen, estado, creado, actualizado) VALUES (?, 'camara_x', 1, 'canje', 'publicado', ?, ?)", [$c1, $t, $t]);
$inv = Db::ultimoId();
Db::q("INSERT INTO mercado_publicaciones (inventario_id, vendedor_id, item, serie, precio, estado, publicado, vence) VALUES (?, ?, 'camara_x', 1, 500, 'activa', ?, ?)", [$inv, $c1, $t, $t + 7 * 86400]);
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('tok-c1', ?, 'creditos_100', 1.99, 1.73, 0.26, 'pagado', ?, ?)", [$c1, $t, $t]);
Db::q("INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, creado) VALUES (?, 500, 500, 'compra', ?)", [$c1, $t]);
// Chat
Db::q("INSERT INTO chat_mensajes (canal, jugador_id, texto, creado) VALUES ('servidor:3', ?, 'hola Cuenca', ?), (?, ?, 'hola socios', ?)", [$c1, $t - 3600, 'asociacion:' . $aAndes, $c2, $t - 3600]);
// Liga: semana abierta y una cerrada
$semAb = date('Y-m-d', strtotime('monday this week')); $semCe = '2026-09-07';
Db::q("INSERT INTO liga_semanas (semana, inicio, fin, estado, creada) VALUES (?, ?, ?, 'abierta', ?), (?, ?, ?, 'cerrada', ?)", [$semAb, $t - 86400, $t + 6 * 86400, $t, $semCe, $t - 50 * 86400, $t - 43 * 86400, $t]);
Db::q('INSERT INTO liga_grupos (semana, liga, numero, creado) VALUES (?, 0, 1, ?), (?, 0, 1, ?)', [$semAb, $t, $semCe, $t]);
$gAb = (int) v('SELECT id FROM liga_grupos WHERE semana = ?', [$semAb]); $gCe = (int) v('SELECT id FROM liga_grupos WHERE semana = ?', [$semCe]);
Db::q("INSERT INTO liga_participantes (semana, asociacion_id, grupo_id, liga, actualizado, nombre, siglas, color, servidor_id) VALUES (?, ?, ?, 0, ?, 'Los Andes', 'AND', '#fff', 3), (?, ?, ?, 0, ?, 'Los Andes', 'AND', '#fff', 3)",
    [$semAb, $aAndes, $gAb, $t, $semCe, $aAndes, $gCe, $t]);
// Festival abierto y uno cerrado
Db::q("INSERT INTO festival_instancias (ciclo, asociacion_id, servidor_id, nombre, liga, miembros, semilla, abre, cierra, estado, creado) VALUES (900, ?, 3, 'Mega Festival QFP', 0, 1, 7, ?, ?, 'abierto', ?), (800, ?, 3, 'Mega Festival QFP', 0, 1, 8, ?, ?, 'cerrado', ?)",
    [$aCosta, $t - 3600, $t + 86400, $t, $aCosta, $t - 99 * 86400, $t - 98 * 86400, $t]);
// Duelos: equipo, temporada abierta y cerrada, duelo abierto y cerrado
$temp = date('Y-m'); $tempCe = '2026-08';
Db::q('INSERT INTO duelo_temporadas_cerradas (temporada, cerrada) VALUES (?, ?)', [$tempCe, $t]);
Db::q("INSERT INTO duelo_equipos (jugador_id, servidor_id, equipo_json, resumen_json, poder, actualizado) VALUES (?, 3, '{}', '{}', 10, ?)", [$c1, $t]);
Db::q('INSERT INTO duelo_ratings (temporada, jugador_id, servidor_id, actualizado) VALUES (?, ?, 3, ?), (?, ?, 3, ?), (?, ?, 3, ?)', [$temp, $c1, $t, $temp, $c2, $t, $tempCe, $c1, $t]);
$duelo = fn(string $estado) => Db::q("INSERT INTO duelos (temporada, dia, servidor_id, retador_id, defensor_id, nivel, semilla, contrato_json, contexto_json, intento_retador_json, intento_defensor_json,
    decisiones_defensor_json, calidad_defensor, estrellas_defensor, estado, creado, vence) VALUES (?, ?, 3, ?, ?, 'facil', 1, '{}', '{}', '{}', '{}', '[]', 50, 3, ?, ?, ?)", [$temp, date('Y-m-d'), $c1, $c2, $estado, $t, $t + 86400]);
$duelo('abierto'); $dAb = Db::ultimoId(); $duelo('cerrado'); $dCe = Db::ultimoId();
// Desafío: día de hoy abierto y un día cerrado
$hoy = date('Y-m-d');
Db::q("INSERT INTO desafio_dias (dia, modificador, semilla_base, contrato_json, creado, cerrado) VALUES ('2026-09-01', 'x', 1, '{}', ?, ?)", [$t, $t]);
$desafio = fn(string $dia, int $j, int $sid, string $estado) => Db::q("INSERT INTO desafio_intentos (dia, servidor_id, jugador_id, numero, seleccion_json, variante, semilla, intento_json, incidentes_json, estado, creado, vence)
    VALUES (?, ?, ?, 1, '{}', 0, 1, '{}', '[]', ?, ?, ?)", [$dia, $sid, $j, $estado, $t, $t + 3600]);
$desafio($hoy, $c2, 3, 'valido'); $desafio('2026-09-01', $c2, 3, 'valido');
// Coaliciones: una vigente y una terminada
Db::q("INSERT INTO coaliciones (servidor_id, evento_id, nombre, inicio, fin, creado) VALUES (3, 'ev1', 'Vigente', ?, ?, ?), (3, 'ev0', 'Vieja', ?, ?, ?)", [$t - 3600, $t + 86400, $t, $t - 9 * 86400, $t - 8 * 86400, $t]);
$coalV = (int) v("SELECT id FROM coaliciones WHERE nombre = 'Vigente'");
Db::q('INSERT INTO coalicion_miembros (coalicion_id, asociacion_id) VALUES (?, ?)', [$coalV, $aAndes]);
check('3 servidores, ' . count($s3) . ' jugadores en Cuenca', 3, (int) v('SELECT COUNT(*) FROM servidores'));

// ============================================================ salud
titulo('Salud por días simulados (umbrales en ajustes)');
check('Umbrales sembrados en la tabla ajustes', '25', Ajustes::get('salud_bajo_activos7'));
actividad($s2, 2, d(-70), d(-1));                                    // Guayaquil: 33 activos todos los días (actividad del núcleo)
actividad(array_slice($s1, 0, 50), 1, d(-60), d(-46), true);          // Quito: 50 activos (actividad_diaria de Universos)
actividad(array_slice($s1, 0, 26), 1, d(-45), d(-39));                // luego 26 (caída de 48 %)
actividad(array_slice($s1, 0, 4), 1, d(-38), d(-25), true);           // luego 4 durante 2 semanas
actividad([$c1, $c2], 3, d(-90), d(-80));                             // Cuenca: casi nadie
actividad([$c1, $c2], 3, d(-2), d(-2));
$f = SaludServidores::foto(d(-46));
$e = fn(array $f, int $sid) => array_values(array_filter($f['servidores'], fn($x) => $x['servidor_id'] === $sid))[0] ?? null;
check('Quito día -46: sano (50 activos 7 días)', ['sano', 50], [$e($f, 1)['estado'], $e($f, 1)['activos_7']]);
check('Guayaquil: sano', 'sano', $e($f, 2)['estado']);
check('Cuenca: abandono (0 activos en 14 días)', 'abandono', $e($f, 3)['estado']);
check('Cuenca entra en abandono -> plan sugerido hacia el más activo con cupo (Quito, 50 activos)', [[3], 1], [$f['nuevos_abandono'], (int) v('SELECT destino FROM fusiones WHERE id = ?', [$f['planes'][0] ?? 0])]);
check('...y aviso en el Centro de Control', 1, (int) v("SELECT COUNT(*) FROM avisos WHERE tipo = 'servidor_abandono'"));
si('...el aviso trae el plan sugerido', str_contains((string) v("SELECT detalle FROM avisos WHERE tipo = 'servidor_abandono'"), 'Plan sugerido N° ' . ($f['planes'][0] ?? 0)));
$f = SaludServidores::foto(d(-39));
check('Quito día -39: bajo por caída (26 activos, -48 %)', ['bajo', 26, -48], [$e($f, 1)['estado'], $e($f, 1)['activos_7'], $e($f, 1)['tendencia_pct']]);
Ajustes::set('salud_abandono_activos14', '3');                         // para ver la regla "2 semanas con menos de 5"
$f = SaludServidores::foto(d(-32));
check('Quito día -32: 1 semana con 4 activos = solo bajo', ['bajo', 4], [$e($f, 1)['estado'], $e($f, 1)['activos_7']]);
$f = SaludServidores::foto(d(-25));
check('Quito día -25: 2 semanas con menos de 5 = abandono', ['abandono', 4, 4], [$e($f, 1)['estado'], $e($f, 1)['activos_7'], $e($f, 1)['activos_7_antes']]);
si('Quito -> plan sugerido (Guayaquil) y segundo aviso', in_array(1, $f['nuevos_abandono'], true) && (int) v("SELECT COUNT(*) FROM avisos WHERE tipo = 'servidor_abandono'") === 2);
Ajustes::set('salud_abandono_activos14', '10');
$f = SaludServidores::foto(d(-25));
check('Repetir el mismo día reemplaza la foto (sin duplicar filas ni avisos)', [1, 2], [(int) v('SELECT COUNT(*) FROM servidor_salud WHERE dia = ? AND servidor_id = 1', [d(-25)]), (int) v("SELECT COUNT(*) FROM avisos WHERE tipo = 'servidor_abandono'")]);
Db::q("INSERT INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (4, 'Servidor 4 · Manta', 1000, 1, ?)", [$t - 5 * 86400]);
if ($UNI) Db::q('UPDATE servidores SET universo_id = 1 WHERE id = 4');
$f = SaludServidores::foto(d(-1));
check('Servidor nuevo (5 días, 0 activos): bajo, nunca abandono (gracia de 14 días)', 'bajo', $e($f, 4)['estado']);
check('Guayaquil día -1: sano con 33 activos y mensajes/eventos medidos', ['sano', 33], [$e($f, 2)['estado'], $e($f, 2)['activos_7']]);
check('Cuenca día -1: sigue abandono (sin aviso nuevo)', ['abandono', 2], [$e($f, 3)['estado'], (int) v("SELECT COUNT(*) FROM avisos WHERE tipo = 'servidor_abandono'")]);
Db::q('UPDATE servidores SET abierto = 0 WHERE id = 4');                // fuera de las pruebas de traslado
for ($i = -30; $i <= -1; $i++) SaludServidores::foto(d($i));           // un mes de fotos para el gráfico
check('Un mes de fotos sin avisos repetidos', 2, (int) v("SELECT COUNT(*) FROM avisos WHERE tipo = 'servidor_abandono'"));
$r = SaludServidores::resumen();
check('resumen(): 4 servidores con historial de 30 días', [4, 30], [count($r['servidores']), count($r['servidores'][1]['historial'])]);
si('resumen(): umbrales, salud y planes pendientes', $r['umbrales']['salud_bajo_activos7'] === 25 && $r['servidores'][2]['salud']['estado'] === 'abandono' && count($r['fusiones']) >= 2);
$out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg("$TMP/config.env") . ' php ' . escapeshellarg("$RAIZ/server/bin/salud_servidores.php") . ' --dia=' . d(-1) . ' 2>&1');
si('bin/salud_servidores.php --dia corre y resume', str_contains((string) $out, 'salud ' . d(-1) . ': S1='));

// ============================================================ plan
titulo('Plan Cuenca -> Guayaquil (solo lectura, todos los choques)');
$tablasHash = function (): string {
    $h = '';
    foreach (Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as $x) $h .= $x['name'] . json_encode(Db::todas('SELECT * FROM "' . $x['name'] . '"'));
    return hash('sha256', $h);
};
$antes = $tablasHash();
$p = Fusiones::plan(3, 2);
check('plan() no escribe nada en la base', $antes, $tablasHash());
check('Jugadores a mover (activos e inactivos)', [5, 5], [$p['jugadores']['total'], count($p['jugadores']['ids'])]);
check('Choques de alias resueltos con sufijo (y letra si el sufijo ya existe)', [[$c1, 'Rayo', 'Rayo (Cuenca B)'], [$c2, 'Ñandú Films', 'Ñandú Films (Cuenca)']],
    array_map(fn($a) => [$a['jugador_id'], $a['antes'], $a['nuevo']], $p['alias']));
$as = []; foreach ($p['asociaciones'] as $a) $as[$a['id']] = $a;
check('Asociación con nombre repetido -> " (Cuenca)"', [true, 'Los Andes (Cuenca)', null], [$as[$aAndes]['choque_nombre'], $as[$aAndes]['nombre_nuevo'], $as[$aAndes]['siglas_nuevas']]);
check('Asociación con siglas repetidas (sin importar mayúsculas) -> siglas nuevas', [true, null, 'QF2'], [$as[$aCosta]['choque_siglas'], $as[$aCosta]['nombre_nuevo'], $as[$aCosta]['siglas_nuevas']]);
check('Asociación sin choque: igual', [null, null], [$as[$aUnica]['nombre_nuevo'], $as[$aUnica]['siglas_nuevas']]);
check('Límite de miembros revisado (20, ninguna pasada)', [20, []], [$p['limite_miembros']['max'], $p['limite_miembros']['sobre_limite']]);
check('Mercado: 1 publicación activa, sin cambios', 1, $p['mercado']['publicaciones_activas']);
check('Chat: canal del servidor queda como archivo (1 mensaje)', ['servidor:3', 1], [$p['chat'][0]['canal'], $p['chat'][0]['mensajes']]);
$mods = array_column($p['en_curso'], 'filas', 'modulo');
check('En curso: liga 1, festival 1, duelos 4 (equipo + 2 puntajes + 1 duelo), desafío 1, coaliciones 1, copa 0',
    ['liga' => 1, 'festival' => 1, 'duelos' => 4, 'desafio' => 1, 'coaliciones' => 1, 'copa' => 0], $mods);
si('Cada módulo en curso trae su decisión documentada', count(array_filter($p['en_curso'], fn($x) => strlen($x['decision']) > 20)) === 6);
$tb = []; foreach ($p['tablas'] as $x) $tb[$x['tabla'] . '.' . $x['columna']] = $x;
$todas = [];
foreach (Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'servidores'") as $x)
    foreach (array_keys(EnVivo\Migraciones::columnas($x['name']) ?? []) as $c) if (in_array($c, ['servidor_id', 'servidor_a', 'servidor_b', 'servidor'], true)) $todas[] = $x['name'] . '.' . $c;
si('El plan cubre CADA tabla con columna de servidor (' . count($todas) . ')', !array_diff($todas, array_keys($tb)));
check('Reglas: jugadores mover, duelos solo abiertos, premios historial', ['mover', 'mover_abiertos', 'historial'], [$tb['jugadores.servidor_id']['regla'], $tb['duelos.servidor_id']['regla'], $tb['duelo_premios.servidor_id']['regla']]);
check('Sin bloqueos ni advertencias', [[], []], [$p['bloqueos'], $p['advertencias']]);
check('Rankings documentados', 4, count($p['rankings']));
// Copa sin cerrar: la fusión espera
$copaOk = true;
try {
    Db::pdo()->exec('CREATE TABLE IF NOT EXISTS copas (id INTEGER PRIMARY KEY AUTOINCREMENT, universo_id INTEGER, semana TEXT, torneo_key TEXT, nombre TEXT, fase TEXT, inicio INTEGER, fin INTEGER, creado INTEGER)');
    Db::pdo()->exec('CREATE TABLE IF NOT EXISTS copa_servidores (copa_id INTEGER, servidor_id INTEGER, puntos_prep INTEGER DEFAULT 0, puntos_tabla INTEGER DEFAULT 0, ganados INTEGER DEFAULT 0, empatados INTEGER DEFAULT 0, perdidos INTEGER DEFAULT 0, dif_calidad INTEGER DEFAULT 0, posicion INTEGER)');
    Db::q("INSERT INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (1, '2026-W43', 'planeta', 'Copa Planeta de Balompié', 'preparacion', ?, ?, ?)", [$t - 86400, $t + 5 * 86400, $t]);
    $copa = Db::ultimoId();
    Db::q('INSERT INTO copa_servidores (copa_id, servidor_id) VALUES (?, 3), (?, 2)', [$copa, $copa]);
    Db::q("INSERT INTO copa_equipos (copa_id, jugador_id, servidor_id, equipo_json, poder, registrado) VALUES (?, ?, 3, '{}', 10, ?)", [$copa, $c1, $t]);
} catch (\Throwable $ex) { $copaOk = false; echo "  (aviso: no se pudo simular una copa con el esquema actual: " . $ex->getMessage() . ")\n"; }
if ($copaOk) {
    $pc = Fusiones::plan(3, 2);
    check('Copa en preparación: no bloquea, el equipo de copa se migra', [[], 1], [array_column($pc['bloqueos'], 'codigo'), array_column($pc['en_curso'], 'filas', 'modulo')['copa']]);
    Db::q("UPDATE copas SET fase = 'batalla' WHERE id = ?", [$copa]);
    $pc = Fusiones::plan(3, 2);
    check('Copa en batalla -> bloqueo copa_en_curso (la fusión espera)', ['copa_en_curso'], array_column($pc['bloqueos'], 'codigo'));
    $idC = Fusiones::crearPlan(3, 2, 'dimitry');
    check('Ejecutar con copa en batalla -> copa_en_curso', 'copa_en_curso', codigo(fn() => Fusiones::ejecutar($idC, 'dimitry')));
    Db::q("UPDATE copas SET fase = 'preparacion' WHERE id = ?", [$copa]);
}

// ============================================================ ejecutar
titulo('Ejecutar la fusión (una transacción, solo una persona)');
$plan = Fusiones::crearPlan(3, 2, 'dimitry');
check('crearPlan reemplaza el plan pendiente (uno solo por origen)', 1, (int) v("SELECT COUNT(*) FROM fusiones WHERE origen = 3 AND estado IN ('plan', 'aprobada')"));
check('Un proceso automático no puede ejecutar', 'requiere_persona', codigo(fn() => Fusiones::ejecutar($plan, 'cron')));
Db::q("UPDATE jugadores SET alias = 'Solo Cuenca X', alias_clave = ? WHERE id = ?", [Social::clave('Rayo (Cuenca B)'), $c3]);
check('Si cambió algo desde el plan -> plan_desactualizado (y nada se movió)', ['plan_desactualizado', 5], [codigo(fn() => Fusiones::ejecutar($plan, 'dimitry')), (int) v('SELECT COUNT(*) FROM jugadores WHERE servidor_id = 3')]);
Db::q("UPDATE jugadores SET alias = 'Solo Cuenca', alias_clave = ? WHERE id = ?", [Social::clave('Solo Cuenca'), $c3]);
$cred = Db::todas('SELECT id, creditos, deuda FROM jugadores ORDER BY id');
$comprasH = hash('sha256', json_encode(Db::todas('SELECT * FROM compras ORDER BY id')) . json_encode(Db::todas('SELECT * FROM movimientos_creditos ORDER BY id')));
$nJug = (int) v('SELECT COUNT(*) FROM jugadores');
$r = Fusiones::ejecutar($plan, 'dimitry');
check('Ejecutada: 5 jugadores, 2 alias y 2 asociaciones renombrados', [true, 5, 2, 2], [$r['ok'], $r['jugadores'], $r['alias_renombrados'], $r['asociaciones_renombradas']]);
check('Nadie queda en Cuenca (jugadores y asociaciones)', [0, 0], [(int) v('SELECT COUNT(*) FROM jugadores WHERE servidor_id = 3'), (int) v('SELECT COUNT(*) FROM asociaciones WHERE servidor_id = 3')]);
check('Ningún jugador borrado', $nJug, (int) v('SELECT COUNT(*) FROM jugadores'));
check('Alias nuevos', ['Rayo (Cuenca B)', 'Ñandú Films (Cuenca)', 'Solo Cuenca'], [v('SELECT alias FROM jugadores WHERE id = ?', [$c1]), v('SELECT alias FROM jugadores WHERE id = ?', [$c2]), v('SELECT alias FROM jugadores WHERE id = ?', [$c3])]);
check('Asociaciones renombradas y con sus miembros', ['Los Andes (Cuenca)', 'QF2', 2], [v('SELECT nombre FROM asociaciones WHERE id = ?', [$aAndes]), v('SELECT siglas FROM asociaciones WHERE id = ?', [$aCosta]), (int) v('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$aAndes])]);
check('Solicitud de ingreso intacta', 1, (int) v('SELECT COUNT(*) FROM asociacion_solicitudes WHERE asociacion_id = ?', [$aAndes]));
check('Liga: semana abierta -> 2, cerrada sigue 3', [2, 3], [(int) v('SELECT servidor_id FROM liga_participantes WHERE semana = ?', [$semAb]), (int) v('SELECT servidor_id FROM liga_participantes WHERE semana = ?', [$semCe])]);
check('Festival: abierto -> 2 (nombre con siglas nuevas), cerrado sigue 3', [2, 'Mega Festival QF2', 3], [(int) v('SELECT servidor_id FROM festival_instancias WHERE ciclo = 900'), v('SELECT nombre FROM festival_instancias WHERE ciclo = 900'), (int) v('SELECT servidor_id FROM festival_instancias WHERE ciclo = 800')]);
check('Duelos: equipo 2, temporada abierta 2, cerrada 3, duelo abierto 2, cerrado 3', [2, 2, 3, 2, 3], [(int) v('SELECT servidor_id FROM duelo_equipos WHERE jugador_id = ?', [$c1]),
    (int) v('SELECT servidor_id FROM duelo_ratings WHERE temporada = ? AND jugador_id = ?', [$temp, $c1]), (int) v('SELECT servidor_id FROM duelo_ratings WHERE temporada = ?', [$tempCe]),
    (int) v('SELECT servidor_id FROM duelos WHERE id = ?', [$dAb]), (int) v('SELECT servidor_id FROM duelos WHERE id = ?', [$dCe])]);
check('Desafío: hoy -> 2, día cerrado sigue 3', [2, 3], [(int) v('SELECT servidor_id FROM desafio_intentos WHERE dia = ?', [$hoy]), (int) v("SELECT servidor_id FROM desafio_intentos WHERE dia = '2026-09-01'")]);
check('Coaliciones: vigente -> 2, terminada sigue 3', [2, 3], [(int) v("SELECT servidor_id FROM coaliciones WHERE nombre = 'Vigente'"), (int) v("SELECT servidor_id FROM coaliciones WHERE nombre = 'Vieja'")]);
if ($copaOk) check('Copa en preparación: equipo de copa -> 2', 2, (int) v('SELECT servidor_id FROM copa_equipos WHERE jugador_id = ?', [$c1]));
check('Mercado: la publicación sigue activa y del mismo vendedor', ['activa', $c1], [v('SELECT estado FROM mercado_publicaciones WHERE inventario_id = ?', [$inv]), (int) v('SELECT vendedor_id FROM mercado_publicaciones WHERE inventario_id = ?', [$inv])]);
$so = Db::fila('SELECT * FROM servidores WHERE id = 3');
check('Origen: fusionado_en, fusionado_a = 2, abierto = 0', [true, 2, 0], [$so['fusionado_en'] !== null, (int) $so['fusionado_a'], (int) $so['abierto']]);
check('Auditoría de la ejecución', 'dimitry', v("SELECT quien FROM auditoria WHERE accion = 'fusion_ejecutar'"));
check('Mensaje del sistema en el chat de los dos servidores', [1, 1], [(int) v("SELECT COUNT(*) FROM chat_mensajes WHERE canal = 'servidor:3' AND jugador_id IS NULL"), (int) v("SELECT COUNT(*) FROM chat_mensajes WHERE canal = 'servidor:2' AND jugador_id IS NULL")]);
check('Traslados por fusión (uno por jugador)', 5, (int) v("SELECT COUNT(*) FROM traslados WHERE fusion_id = ? AND motivo = 'fusion'", [$plan]));
check('Créditos y deuda de TODOS los jugadores iguales', $cred, Db::todas('SELECT id, creditos, deuda FROM jugadores ORDER BY id'));
check('Compras y movimientos de créditos intactos', $comprasH, hash('sha256', json_encode(Db::todas('SELECT * FROM compras ORDER BY id')) . json_encode(Db::todas('SELECT * FROM movimientos_creditos ORDER BY id'))));
check('Sin huérfanos: miembros en asociación de otro servidor', 0, (int) v('SELECT COUNT(*) FROM asociacion_miembros m JOIN asociaciones a ON a.id = m.asociacion_id JOIN jugadores j ON j.id = m.jugador_id WHERE a.servidor_id <> j.servidor_id'));
check('Sin huérfanos: jugadores en un servidor que no existe o fusionado', 0, (int) v('SELECT COUNT(*) FROM jugadores j LEFT JOIN servidores s ON s.id = j.servidor_id WHERE s.id IS NULL OR s.fusionado_en IS NOT NULL'));
check('Alias únicos por servidor', 0, (int) v('SELECT COUNT(*) FROM (SELECT servidor_id, alias_clave FROM jugadores WHERE alias_clave IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1)'));
check('PRAGMA foreign_key_check vacío', [], Db::todas('PRAGMA foreign_key_check'));
check('PRAGMA integrity_check = ok', 'ok', v('PRAGMA integrity_check'));
$av = Fusiones::estado($c1)['aviso_fusion'];
check('aviso_fusion para el movido (de, a, fecha, alias nuevo)', ['Servidor 3 · Cuenca', 'Servidor 2 · Guayaquil', date('Y-m-d'), 'Rayo (Cuenca B)'], [$av['de'] ?? null, $av['a'] ?? null, $av['fecha'] ?? null, $av['alias_nuevo'] ?? null]);
check('...y nada para quien no se movió', null, Fusiones::estado($s2[0])['aviso_fusion']);
check('Re-ejecutar el mismo plan -> ya_ejecutada', 'ya_ejecutada', codigo(fn() => Fusiones::ejecutar($plan, 'dimitry')));
$otro = Fusiones::crearPlan(3, 2, 'dimitry');
check('Un plan nuevo del origen fusionado queda bloqueado', 'origen_fusionado', codigo(fn() => Fusiones::ejecutar($otro, 'dimitry')));
Fusiones::cancelar($otro, 'dimitry', 'prueba');
check('cancelar() con auditoría', ['cancelada', 1], [v('SELECT estado FROM fusiones WHERE id = ?', [$otro]), (int) v("SELECT COUNT(*) FROM auditoria WHERE accion = 'fusion_cancelar'")]);
check('Nadie nuevo puede entrar a Cuenca (cerrado)', 0, (int) v('SELECT abierto FROM servidores WHERE id = 3'));

// ============================================================ traslado voluntario y HTTP
titulo('Traslado voluntario y rutas HTTP (php -S + copia de api.php con las líneas de INTEGRAR_FUSIONES.md)');
$api = (string) file_get_contents("$RAIZ/server/public/api.php");
$cambios = 0;
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export("$RAIZ/server/src/arranque.php", true) . ';', $api, $k); $cambios += $k;
$api = str_replace("    match (\$ruta) {\n", "    // Salud de servidores, fusión y traslado voluntario (server/INTEGRAR_FUSIONES.md): /api/servidor/*\n    if ((\$r = \\EnVivo\\Fusiones::ruta(\$ruta, \$metodo)) !== null) Http::json(200, \$r);\n\n    match (\$ruta) {\n", $api, $k); $cambios += $k;
$api = str_replace("Cuentas::estado(Sesiones::jugadorId()) + \\EnVivo\\Discord::estado(Sesiones::jugadorId())),", "Cuentas::estado(Sesiones::jugadorId()) + \\EnVivo\\Discord::estado(Sesiones::jugadorId()) + \\EnVivo\\Fusiones::estado(Sesiones::jugadorId())),", $api, $k); $cambios += $k;
check('Las 3 líneas de INTEGRAR_FUSIONES.md entran en la copia de api.php', 3, $cambios);
file_put_contents("$TMP/api.php", $api);
file_put_contents("$TMP/router.php", '<?php $r = (string) parse_url((string) $_SERVER["REQUEST_URI"], PHP_URL_PATH); if (str_starts_with($r, "/api/")) { require ' . var_export("$TMP/api.php", true) . '; return true; } http_response_code(404); return true;');
$procs[] = proc_open(['php', '-S', "127.0.0.1:$P_APP", "$TMP/router.php"], [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/php.log", 'a'], 2 => ['file', "$TMP/php.log", 'a']], $tub, null,
    ['ENVIVO_CONFIG' => "$TMP/config.env", 'TZ' => 'America/Guayaquil', 'PATH' => getenv('PATH')]);
function http(string $metodo, string $ruta, ?int $jugador = null, ?array $cuerpo = null): array {
    global $P_APP, $TOK;
    $c = curl_init("http://127.0.0.1:$P_APP$ruta");
    $cab = ['Content-Type: application/json'];
    if ($metodo === 'POST') $cab[] = 'X-Envivo: 1';
    if ($jugador !== null) $cab[] = 'Cookie: envivo_s=' . $TOK[$jugador];
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_PROXY => '', CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 20]);
    if ($cuerpo !== null) curl_setopt($c, CURLOPT_POSTFIELDS, json_encode($cuerpo));
    $b = (string) curl_exec($c); $h = curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
    return [$h, json_decode($b, true) ?? ['crudo' => mb_substr($b, 0, 300)]];
}
$TOK = [];
function sesion(int $j): void { global $TOK; $TOK[$j] = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $TOK[$j]), $j, time(), time() + 50 * 86400]); }
for ($i = 0; $i < 80 && @fsockopen('127.0.0.1', $P_APP) === false; $i++) usleep(100000);
// Quito está en abandono (foto del día -1); Guayaquil sano. Jugadores de Quito para cada regla:
[$v1, $v2, $v3, $v4, $v5, $v6, $v7, $v8] = array_slice($s1, 10, 8);
Db::q("UPDATE jugadores SET alias = 'Porteña AA', alias_clave = ? WHERE id = ?", [Social::clave('Porteña AA'), $v1]);   // choca con Guayaquil
$aV = asociacion(1, 'Sierra Norte', 'SNO', [$v2, $v1]);              // v2 presidente con miembros, v1 socio
$aSolo = asociacion(1, 'Puerto Sur', 'LAN', [$v7]);                   // v7 presidente solo; choca nombre y siglas en Guayaquil
$desafio($hoy, $v3, 1, 'abierto');                                    // v3 con un intento abierto
Db::q("INSERT INTO inventario (jugador_id, item, serie, origen, estado, creado, actualizado) VALUES (?, 'camara_x', 2, 'canje', 'publicado', ?, ?)", [$v4, $t, $t]);
Db::q("INSERT INTO mercado_publicaciones (inventario_id, vendedor_id, item, serie, precio, estado, publicado, vence) VALUES (?, ?, 'camara_x', 2, 500, 'activa', ?, ?)", [Db::ultimoId(), $v4, $t, $t + 7 * 86400]);
Db::q("INSERT INTO traslados (jugador_id, origen, destino, motivo, creado) VALUES (?, 2, 1, 'voluntario', ?), (?, 2, 1, 'voluntario', ?)", [$v5, $t - 10 * 86400, $v6, $t - 31 * 86400]);
foreach ([$v1, $v2, $v3, $v4, $v5, $v6, $v7, $v8, $s2[5], $c1] as $j) sesion($j);
$credAntes = Db::todas('SELECT id, creditos FROM jugadores ORDER BY id');

[$h, $o] = http('GET', '/api/servidor/opciones', $v1);
check('GET /api/servidor/opciones: 200, abandono, sugiere Guayaquil, puede', [200, 'abandono', 2, true, null], [$h, $o['actual']['estado'] ?? null, $o['sugerido']['id'] ?? null, $o['puede'] ?? null, array_key_exists('proximo_traslado', $o) ? $o['proximo_traslado'] : 'x']);
si('...con universo {id, nombre} en la raíz y en actual', isset($o['universo']['id'], $o['universo']['nombre'], $o['actual']['universo']['nombre']));
[$h, $o] = http('GET', '/api/servidor/opciones');
check('Sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], [$h, $o['codigo'] ?? null]);
[$h, $o] = http('POST', '/api/servidor/opciones', $v1, []);
check('Método equivocado -> 405', 405, $h);
[$h, $o] = http('GET', '/api/servidor/opciones', $v5);
check('opciones con traslado reciente: no puede y dice desde cuándo', [false, 'traslado_reciente', date('Y-m-d', $t + 20 * 86400)], [$o['puede'] ?? null, $o['codigo'] ?? null, $o['proximo_traslado'] ?? null]);
[$h, $o] = http('GET', '/api/servidor/opciones', $s2[5]);
check('opciones en un servidor sano: no hace falta', [false, 'servidor_sano'], [$o['puede'] ?? null, $o['codigo'] ?? null]);
$err = fn(int $j, $dest) => (function () use ($j, $dest) { [$h, $o] = http('POST', '/api/servidor/trasladar', $j, ['destino' => $dest]); return [$h, $o['codigo'] ?? null]; })();
check('POST sin X-Envivo -> 403', 403, (function () use ($P_APP, $TOK, $v1) { $c = curl_init("http://127.0.0.1:$P_APP/api/servidor/trasladar"); curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_PROXY => '', CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{"destino":2}', CURLOPT_HTTPHEADER => ['Cookie: envivo_s=' . $TOK[$v1]]]); curl_exec($c); return curl_getinfo($c, CURLINFO_HTTP_CODE); })());
check('Sin destino -> falta_destino', [400, 'falta_destino'], $err($v8, null));
check('Destino que no existe -> destino_no_existe', [404, 'destino_no_existe'], $err($v8, 999));
check('Mismo servidor -> mismo_servidor', [409, 'mismo_servidor'], $err($v8, 1));
check('Servidor fusionado -> destino_cerrado', [409, 'destino_cerrado'], $err($v8, 3));
check('Desde un servidor sano a uno en abandono -> destino_no_mas_sano', [409, 'destino_no_mas_sano'], $err($s2[5], 1));
check('Presidente con miembros -> presidente_con_miembros', [409, 'presidente_con_miembros'], $err($v2, 2));
check('Con un intento en línea abierto -> intento_abierto', [409, 'intento_abierto'], $err($v3, 2));
check('Con publicaciones activas en el mercado -> publicaciones_activas', [409, 'publicaciones_activas'], $err($v4, 2));
check('Traslado hace 10 días -> traslado_reciente', [409, 'traslado_reciente'], $err($v5, 2));
[$h, $o] = http('POST', '/api/servidor/trasladar', $v6, ['destino' => 2]);
check('Traslado hace 31 días -> se puede otra vez', [200, 2], [$h, $o['servidor']['id'] ?? null]);
[$h, $o] = http('POST', '/api/servidor/trasladar', $v1, ['destino' => 2]);
check('Socio: se traslada gratis, alias con sufijo, deja la asociación', [200, 2, 'Porteña AA (Quito)', true, null], [$h, $o['servidor']['id'] ?? null, $o['alias_nuevo'] ?? null, $o['dejo_asociacion'] ?? null, array_key_exists('asociacion', $o) ? $o['asociacion'] : 'x']);
check('...la asociación sigue en Quito con su presidente', [1, 1], [(int) v('SELECT servidor_id FROM asociaciones WHERE id = ?', [$aV]), (int) v('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$aV])]);
check('...ahora v2 es presidente solo: puede irse y la asociación se va con él', [200, 2], (function () use ($v2) { [$h, $o] = http('POST', '/api/servidor/trasladar', $v2, ['destino' => 2]); return [$h, (int) v('SELECT servidor_id FROM asociaciones WHERE id = (SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?)', [$v2])]; })());
[$h, $o] = http('POST', '/api/servidor/trasladar', $v7, ['destino' => 2]);
check('Presidente solo con nombre y siglas que chocan: la asociación se renombra', [200, 'Puerto Sur (Quito) [LA2]'], [$h, $o['asociacion_renombrada'] ?? null]);
[$h, $o] = http('GET', '/api/servidor/opciones', $v1);
check('Después de trasladarse: no puede otra vez en 30 días', [false, 'traslado_reciente', date('Y-m-d', $t + 30 * 86400)], [$o['puede'] ?? null, $o['codigo'] ?? null, $o['proximo_traslado'] ?? null]);
check('Créditos sin cambios tras los traslados', $credAntes, Db::todas('SELECT id, creditos FROM jugadores ORDER BY id'));
check('Traslados voluntarios anotados (y en la auditoría)', [6, 4], [(int) v("SELECT COUNT(*) FROM traslados WHERE motivo = 'voluntario'"), (int) v("SELECT COUNT(*) FROM auditoria WHERE accion = 'servidor_traslado'")]);
check('Alias únicos por servidor después de todo', 0, (int) v('SELECT COUNT(*) FROM (SELECT servidor_id, alias_clave FROM jugadores WHERE alias_clave IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1)'));
check('foreign_key_check vacío e integrity_check ok', [[], 'ok'], [Db::todas('PRAGMA foreign_key_check'), v('PRAGMA integrity_check')]);
[$h, $o] = http('GET', '/api/estado', $c1);
check('GET /api/estado trae aviso_fusion {de, a, fecha}', [200, 'Servidor 3 · Cuenca', 'Servidor 2 · Guayaquil', date('Y-m-d')], [$h, $o['aviso_fusion']['de'] ?? null, $o['aviso_fusion']['a'] ?? null, $o['aviso_fusion']['fecha'] ?? null]);
[$h, $o] = http('GET', '/api/estado', $v1);
check('...un traslado voluntario no deja aviso_fusion', [200, null], [$h, array_key_exists('aviso_fusion', $o) ? $o['aviso_fusion'] : 'falta']);
[$h, $o] = http('POST', '/api/servidor/aviso-visto', $c1, []);
check('POST /api/servidor/aviso-visto cierra el aviso', [200, 1], [$h, $o['cerrados'] ?? null]);
[$h, $o] = http('GET', '/api/estado');
check('/api/estado sin sesión: aviso_fusion null', [200, true, null], [$h, array_key_exists('aviso_fusion', $o), $o['aviso_fusion'] ?? null]);
[$h, $o] = http('GET', '/api/estado', $c1);
check('...y ya no sale', [true, null], [array_key_exists('aviso_fusion', $o), $o['aviso_fusion'] ?? null]);
$log = (string) @file_get_contents("$TMP/php.log");
check('Sin errores de PHP en el servidor de prueba', 0, preg_match_all('/PHP (Fatal|Warning|Notice|Deprecated)|EN VIVO api/', $log));

echo "\nResumen fusiones: $ok correctas, $fallas fallas\n";
exit($fallas === 0 ? 0 : 1);
