<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Gran Producción de Asociación (server/src/GranProduccion.php +
// GranProduccionApi.php): base SQLite TEMPORAL y reloj congelado (GranProduccion::fijarReloj, Push::fijarReloj).
// Calendario (viernes 18:00, 48 h, configurable), creación perezosa con la foto de cada asociación, metas según miembros
// activos (asociaciones chicas), turnos acumulables de personal y equipos, transmisiones automáticas desde la partida en la
// nube con tope, anti cuentas alternas (24 h), una sola asociación por producción, progreso y niveles, tabla por servidor,
// pausa (el final se corre), cancelación (sin premios), cierre con premios fijos al buzón (una sola vez), avisos push de
// inicio y "faltan 2 h" (y que respetan a quien ya aportó todo), Centro de Control (panel) y rutas por HTTP.
// Uso:  php server/tests/pruebas_gran_produccion.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_gran_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Chat, Db, Fallo, GranProduccion as GP, Push, Social};

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

Db::pdo();
$Z = new DateTimeZone('America/Guayaquil');
$ts = fn(string $f) => (new DateTimeImmutable($f, $Z))->getTimestamp();
$reloj = function (int $t) { GP::fijarReloj($t); Push::fijarReloj($t); };
$mas = function (int $s) use ($reloj) { $reloj(GP::ahora() + $s); };
$T0 = $ts('2026-11-13 10:00:00');   // viernes por la mañana
$reloj($T0);
$n = 0;
$nuevo = function (string $alias, int $srv = 1) use (&$n, $T0): int {
    $n++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, ultimo_ingreso, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['gp' . $n . '@prueba.example', $alias, 'x', $T0 - 30 * 86400, $T0 - 3600, $srv, $alias, strtolower(str_replace(' ', '', $alias)) . $n]);
    return Db::ultimoId();
};
$asocDe = fn(int $j) => (int) Db::valor('SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?', [$j]);
$antiguo = function (int ...$js) use ($T0) { foreach ($js as $j) Db::q('UPDATE asociacion_miembros SET desde = ? WHERE jugador_id = ?', [$T0 - 5 * 86400, $j]); };
$partida = function (int $j, int $eventos) { Db::q('INSERT INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado',
    [$j, json_encode(['day' => 5, 'rep' => 10, 'stats' => ['events' => $eventos]]), GP::ahora()]); };
$suscribir = function (int $j) { Db::q("INSERT INTO push_suscripciones (jugador_id, endpoint, p256dh, auth, categorias_json, creado, actualizado, visto) VALUES (?, ?, 'x', 'y', ?, 0, 0, 0)",
    [$j, 'https://fcm.googleapis.com/x/' . $j, json_encode(['obra' => true, 'copa' => true, 'premio' => true, 'buzon' => true, 'duelo' => true, 'ofertas' => false])]); };

// =====================================================================
titulo('Tablas y calendario');
$tablas = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'gp_%' ORDER BY name"), 'name');
check('Tablas gp_* creadas solas al abrir la base', ['gp_aportes', 'gp_asociaciones', 'gp_miembros', 'gp_premios', 'gp_producciones'], $tablas);
$c = GP::config();
check('Por defecto: encendida, viernes 18:00, 48 h', [true, 5, '18:00', 48, ''], [$c['activa'], $c['dia'], $c['hora'], $c['horas'], $c['tema_proximo']]);
check('Viernes 10:00 → el turno más reciente fue el viernes anterior 18:00', $ts('2026-11-06 18:00:00'), GP::slot());
check('Viernes 19:00 → hoy 18:00', $ts('2026-11-13 18:00:00'), GP::slot($ts('2026-11-13 19:00:00')));
check('Jueves → el viernes anterior', $ts('2026-11-13 18:00:00'), GP::slot($ts('2026-11-19 23:00:00')));
check('Antes de empezar no hay producción', null, GP::tick());
$px = GP::proxima();
check('La próxima es hoy viernes 18:00 y dura 48 h', ['2026-11-13', $ts('2026-11-13 18:00:00'), $ts('2026-11-15 18:00:00')], [$px['id'], $px['inicio'], $px['fin']]);
check('El tema rota y es uno de los inventados', true, isset(GP::TEMAS[$px['tema']]));
check('Temas de dos semanas seguidas son distintos', true, GP::temaPara($px['inicio']) !== GP::temaPara($px['inicio'] + 7 * 86400));
check('Guardar config: día 9 → 400 gp_config', [400, 'gp_config'], falla(fn() => GP::guardarConfig(['dia' => 9], 'control:prueba')));
check('Guardar config: hora rara → 400 gp_config', [400, 'gp_config'], falla(fn() => GP::guardarConfig(['hora' => '25:00'], 'control:prueba')));
check('Guardar config: 200 h → 400 gp_config', [400, 'gp_config'], falla(fn() => GP::guardarConfig(['horas' => 200], 'control:prueba')));
check('Guardar config: tema inexistente → 400', [400, 'gp_config'], falla(fn() => GP::guardarConfig(['tema_proximo' => 'mundial'], 'control:prueba')));
GP::guardarConfig(['tema_proximo' => 'gala_estrellas'], 'control:prueba');
check('El panel elige el tema de la próxima', 'gala_estrellas', GP::proxima()['tema']);
check('Queda en la auditoría', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'gran_produccion_config'"));

// Asociaciones: A grande (4 miembros, 1 inactivo), B de 1 sola productora, C en otro servidor
Db::q("INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (2, 'Servidor 2', 1000, 1, 0)");
$A1 = $nuevo('Ana Prod'); $A2 = $nuevo('Beto Prod'); $A3 = $nuevo('Caro Prod'); $A4 = $nuevo('Dormido Prod');
Social::crear($A1, ['nombre' => 'Asociación Grande', 'siglas' => 'GRA', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
$AG = $asocDe($A1);
foreach ([$A2, $A3, $A4] as $j) Social::unirse($j, $AG);
Db::q('UPDATE jugadores SET ultimo_ingreso = ?, creado = ? WHERE id = ?', [$T0 - 20 * 86400, $T0 - 60 * 86400, $A4]);   // inactivo hace 20 días
$B1 = $nuevo('Sola Prod');
Social::crear($B1, ['nombre' => 'Asociación Chica', 'siglas' => 'CHI', 'color' => '#00aaff', 'pagado_en_juego' => true]);
$AB = $asocDe($B1);
$B2 = $nuevo('Viajero Prod');   // socio inactivo de la Chica (no cambia su meta): aporta y después se cambia de asociación
Social::unirse($B2, $AB);
Db::q('UPDATE jugadores SET ultimo_ingreso = ?, creado = ? WHERE id = ?', [$T0 - 20 * 86400, $T0 - 60 * 86400, $B2]);
$C1 = $nuevo('Lejos Prod', 2);
Social::crear($C1, ['nombre' => 'Asociación Lejana', 'siglas' => 'LEJ', 'color' => '#00ff00', 'pagado_en_juego' => true]);
$AC = $asocDe($C1);
$antiguo($A1, $A2, $A3, $A4, $B1, $B2, $C1);
$partida($A1, 40); $partida($A2, 10); $partida($B1, 100);
$Fuera = $nuevo('Sin Asoc');
foreach ([$A1, $A2, $A3, $B1] as $j) $suscribir($j);

// =====================================================================
titulo('Empieza sola a las 18:00 (foto de cada asociación)');
$reloj($ts('2026-11-13 18:00:30'));
$p = GP::tick();
check('Producción 2026-11-13 en curso con el tema elegido', ['2026-11-13', 'en_curso', 'gala_estrellas'], [$p['id'] ?? null, $p['estado'] ?? null, $p['tema'] ?? null]);
check('El tema elegido vale para una sola producción', '', GP::config()['tema_proximo']);
$gA = Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', ['2026-11-13', $AG]);
check('Grande: 3 activos (el dormido no cuenta) → metas 12/12/18', [3, 12, 12, 18], [(int) $gA['activos'], (int) $gA['meta_personal'], (int) $gA['meta_equipos'], (int) $gA['meta_transmision']]);
$gB = Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', ['2026-11-13', $AB]);
check('Chica (1 miembro): metas 4/4/6', [1, 4, 4, 6], [(int) $gB['activos'], (int) $gB['meta_personal'], (int) $gB['meta_equipos'], (int) $gB['meta_transmision']]);
check('Foto del contador de eventos de cada miembro', [40, 10, null], [(int) Db::valor('SELECT ultimo_eventos FROM gp_miembros WHERE jugador_id = ?', [$A1]),
    (int) Db::valor('SELECT ultimo_eventos FROM gp_miembros WHERE jugador_id = ?', [$A2]), Db::valor('SELECT ultimo_eventos FROM gp_miembros WHERE jugador_id = ?', [$A3])]);
check('Aviso en el chat de cada asociación', 3, (int) Db::valor("SELECT COUNT(*) FROM chat_mensajes WHERE canal LIKE 'asociacion:%' AND jugador_id IS NULL AND texto LIKE '%Empieza la Gran Producción%'"));
$tj = json_decode((string) Db::valor("SELECT textos_json FROM chat_mensajes WHERE canal = ? AND jugador_id IS NULL ORDER BY id DESC LIMIT 1", ['asociacion:' . $AG]), true) ?: [];
check('Aviso del chat en los 10 idiomas (textos_json), con el tema traducido', [Push::IDIOMAS, true, true],
    [array_keys($tj), str_contains($tj['en'] ?? '', 'Stars of the Airwaves Gala'), str_contains($tj['es'] ?? '', 'Gala de las Estrellas del Aire')]);
$_SERVER['HTTP_ACCEPT_LANGUAGE'] = 'en-US,en;q=0.9';
$ult = fn(array $r) => (string) (end($r['mensajes'])['texto'] ?? '');
check('Chat::leer muestra el aviso en el idioma de quien lee (Accept-Language: en)', true, str_starts_with($ult(Chat::leer($A1, 'asociacion', 0)), '🎬 The Grand Production begins!'));
$_SERVER['HTTP_ACCEPT_LANGUAGE'] = 'es-EC';
check('… y en español con Accept-Language es', true, str_starts_with($ult(Chat::leer($A1, 'asociacion', 0)), '🎬 ¡Empieza la Gran Producción!'));
unset($_SERVER['HTTP_ACCEPT_LANGUAGE']);
$faltan = [];
foreach (GP::TEXTOS as $L => $x) foreach (GP::TEXTOS['es'] as $k => $v) {
    preg_match_all('/\{\w+\}/', $v, $a); preg_match_all('/\{\w+\}/', $x[$k] ?? '', $b); sort($a[0]); sort($b[0]);
    if (!isset($x[$k]) || $a[0] !== $b[0]) $faltan[] = "$L.$k";
}
foreach (array_diff(Push::IDIOMAS, ['es']) as $L) { if (array_keys(GP::TEMA_NOMBRES[$L] ?? []) !== array_keys(GP::TEMAS)) $faltan[] = "$L.temas"; if (array_keys(GP::NIVEL_NOMBRES[$L] ?? []) !== array_keys(GP::NOMBRE_NIVEL)) $faltan[] = "$L.niveles"; }
check('Textos de la Gran Producción (push y chat), temas y niveles en los 10 idiomas con los mismos marcadores', [[], Push::IDIOMAS], [$faltan, array_keys(GP::TEXTOS)]);
check('Otro tick no crea otra', 1, (int) Db::valor('SELECT COUNT(*) FROM gp_producciones'));
check('Sin próxima mientras corre', null, GP::proxima());

// =====================================================================
titulo('Aportes: personal y equipos con turnos acumulables');
check('Sin asociación → 409 sin_asociacion', [409, 'sin_asociacion'], falla(fn() => GP::aportar($Fuera, 'personal')));
check('Frente raro → 400 datos_invalidos', [400, 'datos_invalidos'], falla(fn() => GP::aportar($A1, 'transmision')));
$v = GP::aportar($A1, 'personal');
check('Primer turno al empezar: 1 de personal', [1, 1], [$v['aporte']['cantidad'], $v['yo']['aportes']['personal']]);
check('Otra vez enseguida → 409 gp_espera (con segundos)', [409, 'gp_espera'], falla(fn() => GP::aportar($A1, 'personal')));
check('Equipos tiene su propio turno', 1, GP::aportar($A1, 'equipos')['aporte']['cantidad']);
$mas(4 * 3600);
check('A las 4 h: 1 turno más', 1, GP::aportar($A1, 'personal')['aporte']['cantidad']);
$mas(12 * 3600);
$v = GP::aportar($A1, 'personal');
check('Si entra tarde no pierde nada: a las 16 h manda los 3 juntos', [3, 5], [$v['aporte']['cantidad'], $v['yo']['aportes']['personal']]);
check('Equipos también acumuló: 4 juntos', 4, GP::aportar($A1, 'equipos')['aporte']['cantidad']);
$mas(40 * 3600 - 16 * 3600 - 30);   // ~40 h de producción: ya ganó todos los turnos
check('Tope por productora: 8 de personal (no 11)', [3, 8], (function () { global $A1; $v = GP::aportar($A1, 'personal'); return [$v['aporte']['cantidad'], $v['yo']['aportes']['personal']]; })());
check('Después del tope → 409 gp_tope', [409, 'gp_tope'], falla(fn() => GP::aportar($A1, 'personal')));
check('Libro de aportes (auditoría)', 8, (int) Db::valor("SELECT SUM(cantidad) FROM gp_aportes WHERE jugador_id = ? AND frente = 'personal'", [$A1]));

// =====================================================================
titulo('Transmisiones automáticas desde la partida');
$partida($A1, 45);
$v = GP::vista($A2);   // la vista de cualquier socio cuenta las de toda la asociación
check('Ana cubrió 5 eventos → 5 transmisiones (sin tocar nada)', 5, (int) Db::valor('SELECT transmision FROM gp_miembros WHERE jugador_id = ?', [$A1]));
$partida($A1, 70);
GP::vista($A1);
check('Tope 12 transmisiones por productora', 12, (int) Db::valor('SELECT transmision FROM gp_miembros WHERE jugador_id = ?', [$A1]));
$partida($A2, 3);   // partida nueva (menos eventos): no resta, solo toma la nueva foto
GP::vista($A2);
$partida($A2, 5);
GP::vista($A2);
check('Partida nueva con menos eventos: no resta y cuenta desde ahí (+2)', [2, 5], [(int) Db::valor('SELECT transmision FROM gp_miembros WHERE jugador_id = ?', [$A2]), (int) Db::valor('SELECT ultimo_eventos FROM gp_miembros WHERE jugador_id = ?', [$A2])]);

// =====================================================================
titulo('Anti cuentas alternas y una sola asociación');
$Nuevo = $nuevo('Recién Prod');
Social::unirse($Nuevo, $AG);
Db::q('UPDATE asociacion_miembros SET desde = ? WHERE jugador_id = ?', [GP::ahora() - 3600, $Nuevo]);   // entró hace 1 h
check('Entró después de empezar y hace menos de 24 h → 409 gp_miembro_nuevo', [409, 'gp_miembro_nuevo'], falla(fn() => GP::aportar($Nuevo, 'personal')));
check('La vista le dice cuánto espera', true, GP::vista($Nuevo)['yo']['espera'] > 0);
// Viajero aporta con la Chica y luego se cambia a la Grande
GP::aportar($B2, 'personal');
Social::salir($B2);
Social::unirse($B2, $AG);
Db::q('UPDATE asociacion_miembros SET desde = ? WHERE jugador_id = ?', [GP::ahora() - 2 * 86400, $B2]);
check('Se cambió de asociación → 409 gp_otra_asociacion', [409, 'gp_otra_asociacion'], falla(fn() => GP::aportar($B2, 'equipos')));
$v = GP::vista($B2);
check('La vista lo marca y no muestra turnos', [true, 0], [$v['yo']['otra_asociacion'], $v['yo']['disponibles']['personal']]);
check('Lo que aportó sigue contando para la Chica (sus 8 turnos)', 8, (int) Db::valor("SELECT personal FROM gp_asociaciones WHERE produccion_id = '2026-11-13' AND asociacion_id = ?", [$AB]));

// =====================================================================
titulo('Progreso, niveles, tabla y vista');
$v = GP::vista($A1);
$a = $v['asociacion'];
// Grande: personal 8, equipos 1+4+... (Ana: equipos 5), transmision 12+2 = 14 → (8+5+14)/(12+12+18)= 27/42 = 64 %
check('Totales de la Grande', ['personal' => 8, 'equipos' => 5, 'transmision' => 14], $a['totales']);
check('Progreso 64 % → nivel Plata, siguiente Oro (100 %)', [64, 'plata', 'oro', 100], [$a['progreso'], $a['nivel'], $a['siguiente']['id'] ?? null, $a['siguiente']['pct'] ?? null]);
check('Miembros con lo que aportó cada uno (Ana primero)', ['Ana Prod', 25, true], [$v['miembros'][0]['nombre'], $v['miembros'][0]['total'], $v['miembros'][0]['yo']]);
check('Los 6 socios aparecen (también los que no aportaron; Viajero con 0 aquí)', 6, count($v['miembros']));
check('Tabla del servidor 1: Grande 1.ª, Chica 2.ª; la Lejana (servidor 2) no sale', [['GRA', 1], ['CHI', 2]], array_map(fn($x) => [$x['siglas'], $x['posicion']], $v['tabla']));
check('Puesto de mi asociación', 1, $a['puesto']);
check('Reglas con premios visibles antes (5 niveles, 3 puestos)', [5, 3, 'dinero'], [count($v['reglas']['niveles']), count($v['reglas']['puestos']), $v['reglas']['niveles'][0]['premios'][0]['tipo']]);
$r = GP::resumen($A3);
check('Resumen liviano: progreso y aportes listos de Caro (4 turnos de cada frente → 20?)', [64, true], [$r['progreso'], $r['disponibles'] > 0]);
check('Resumen sin asociación', [false, null], (function () use ($Fuera) { $r = GP::resumen($Fuera); return [$r['en_asociacion'], $r['progreso']]; })());
// Chica: 1 de personal (B1) → 1/14 = 7 %; luego B1 manda equipos y +12 eventos
$partida($B1, 130);
GP::vista($B1);
GP::aportar($B1, 'equipos');
$gB = Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', ['2026-11-13', $AB]);
check('Chica: una sola productora puede llegar lejos (personal ' . $gB['personal'] . ', equipos ' . $gB['equipos'] . ', transm. ' . $gB['transmision'] . ')', true, (int) $gB['progreso'] >= 100);
check('Cada frente cuenta hasta el doble de su meta (máx. 200 %)', 200, GP::progresoDe(['meta_personal' => 1, 'meta_equipos' => 1, 'meta_transmision' => 1, 'personal' => 9, 'equipos' => 9, 'transmision' => 9]));
check('nivelDe: 0 → null, 1 → participación, 150 → leyenda', [null, 'participacion', 'leyenda'], [GP::nivelDe(0), GP::nivelDe(1), GP::nivelDe(150)]);
check('premiosPara(oro, 1): suma los créditos del puesto (25 + 20)', 45, array_values(array_filter(GP::premiosPara('oro', 1), fn($x) => $x['tipo'] === 'creditos'))[0]['cantidad']);
check('premiosPara(participacion, 1): sin extra de puesto', false, (bool) array_filter(GP::premiosPara('participacion', 1), fn($x) => $x['tipo'] === 'creditos'));

// =====================================================================
titulo('Avisos push (inicio y faltan 2 h)');
$reloj($ts('2026-11-13 18:30:00'));   // volver atrás no es posible en la vida real: se simula con la marca sin poner
Db::q('UPDATE gp_producciones SET push_inicio = 0');
Db::q("UPDATE push_suscripciones SET idioma = 'en' WHERE jugador_id = ?", [$A2]);   // Beto juega en inglés
$k = GP::detectarPush();
check('Inicio en el idioma del aparato: Beto en inglés, Ana en español', ['🎬 The Grand Production begins!', true, '🎬 ¡Empieza la Gran Producción!'],
    [Db::valor("SELECT titulo FROM push_cola WHERE clave = 'gp:2026-11-13:inicio' AND jugador_id = ?", [$A2]),
     str_contains((string) Db::valor("SELECT cuerpo FROM push_cola WHERE clave = 'gp:2026-11-13:inicio' AND jugador_id = ?", [$A2]), 'Stars of the Airwaves Gala'),
     Db::valor("SELECT titulo FROM push_cola WHERE clave = 'gp:2026-11-13:inicio' AND jugador_id = ?", [$A1])]);
check('Inicio: aviso a los 4 socios suscritos', 4, (int) Db::valor("SELECT COUNT(*) FROM push_cola WHERE clave = 'gp:2026-11-13:inicio'"));
check('Categoría liga (obedece el interruptor de Duelos y Liga) y abre la pantalla', ['liga', '/?ir=gran'], array_values(Db::fila("SELECT categoria, url FROM push_cola WHERE clave = 'gp:2026-11-13:inicio' LIMIT 1")));
GP::detectarPush();
check('No se repite', 4, (int) Db::valor("SELECT COUNT(*) FROM push_cola WHERE clave LIKE 'gp:2026-11-13:inicio'"));
$reloj($ts('2026-11-15 16:30:00'));   // faltan 1,5 h
GP::aportar($A1, 'equipos');          // Ana completa sus 8 de equipos: ya no tiene nada por aportar
GP::detectarPush();
$a2h = array_map('intval', array_column(Db::todas("SELECT jugador_id FROM push_cola WHERE clave = 'gp:2026-11-13:2h' ORDER BY jugador_id"), 'jugador_id'));
check('Faltan 2 h: a quien todavía tiene aportes (Beto, Caro), no a Ana (ya mandó todo)', [$A2, $A3], array_values(array_intersect($a2h, [$A1, $A2, $A3])));
check('El de 2 h vence al terminar la producción', $ts('2026-11-15 18:00:00'), (int) Db::valor("SELECT vence FROM push_cola WHERE clave = 'gp:2026-11-13:2h' LIMIT 1"));

// =====================================================================
titulo('Pausa (el final se corre) y reanudar');
$finAntes = (int) GP::actual()['fin'];
GP::pausar('control:prueba');
check('En pausa: aportar → 409 gp_pausada', [409, 'gp_pausada'], falla(fn() => GP::aportar($A3, 'personal')));
$mas(3 * 3600);   // pasa la hora de cierre mientras está en pausa
check('En pausa no se cierra aunque pase la hora', 'pausada', GP::tick()['estado'] ?? null);
check('Pausar otra vez → 409', [409, 'gp_no_hay'], falla(fn() => GP::pausar('control:prueba')));
$p = GP::reanudar('control:prueba');
check('Reanudar: termina 3 h más tarde y vuelve a correr', ['en_curso', $finAntes + 3 * 3600], [$p['estado'], (int) $p['fin']]);
check('Caro puede aportar otra vez', true, GP::aportar($A3, 'personal')['aporte']['cantidad'] >= 1);

// =====================================================================
titulo('Cierre con premios al buzón');
$partida($A3, 7);   // eventos de último momento de Caro (antes no tenía partida): solo cuenta desde la primera foto
$reloj($finAntes + 3 * 3600 + 60);
check('Al terminar, tick la cierra', null, GP::tick());
$p = GP::produccion('2026-11-13');
check('Estado cerrada', 'cerrada', $p['estado']);
$gA = Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', ['2026-11-13', $AG]);
$gB = Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', ['2026-11-13', $AB]);
check('Puestos en el servidor 1 (Chica 1.ª por progreso, Grande 2.ª)', [1, 2], [(int) $gB['puesto'], (int) $gA['puesto']]);
check('La Lejana no aportó: sin nivel ni puesto', [null, null], array_values(Db::fila('SELECT nivel, puesto FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', ['2026-11-13', $AC])));
$premiados = array_map('intval', array_column(Db::todas("SELECT jugador_id FROM gp_premios WHERE produccion_id = '2026-11-13' ORDER BY jugador_id"), 'jugador_id'));
check('Premio solo a quienes aportaron (Ana, Beto, Caro, Sola, Viajero con la Chica); no al dormido ni al recién llegado', [$A1, $A2, $A3, $B1, $B2], $premiados);
check('El Viajero cobra con la asociación con la que aportó', $AB, (int) Db::valor('SELECT asociacion_id FROM gp_premios WHERE jugador_id = ?', [$B2]));
$buz = Db::fila("SELECT * FROM buzon WHERE jugador_id = ? AND ref = 'gp:2026-11-13'", [$A1]);
$adj = json_decode((string) $buz['adjuntos_json'], true);
check('Ana: buzón con los premios de su nivel + puesto 2 (créditos ' . $gA['nivel'] . ')', true, $buz !== null && in_array('dinero', array_column($adj, 'tipo'), true));
check('Los premios del buzón son exactamente los publicados', GP::premiosPara((string) $gA['nivel'], 2), array_map(fn($x) => array_filter($x, fn($k) => in_array($k, ['tipo', 'item', 'cantidad'], true), ARRAY_FILTER_USE_KEY) + [], json_decode((string) Db::valor("SELECT adjuntos_json FROM gp_premios WHERE jugador_id = ?", [$A1]), true)));
check('Aviso de cierre en el chat de la asociación', true, (bool) Db::valor("SELECT 1 FROM chat_mensajes WHERE canal = ? AND texto LIKE '%Terminó%'", ['asociacion:' . $AG]));
check('Cerrar otra vez no paga dos veces', [false, 5], [GP::cerrar('2026-11-13')['cerrada'], (int) Db::valor("SELECT COUNT(*) FROM buzon WHERE ref = 'gp:2026-11-13'")]);
$v = GP::vista($A1);
check('Después: fase pronto, próxima el viernes siguiente y "ultima" con mi premio', ['pronto', '2026-11-20', 2, true],
    [$v['fase'], substr((string) ($v['proxima']['inicio'] ?? ''), 0, 10), $v['ultima']['asociacion']['puesto'] ?? null, isset($v['ultima']['premio']['premios'][0])]);
check('Auditoría de inicio y cierre', 2, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion IN ('gran_produccion_inicio', 'gran_produccion_cierre')"));

// =====================================================================
titulo('Cancelar (sin premios) y apagar');
$reloj($ts('2026-11-20 19:00:00'));
$p = GP::tick();
check('La semana siguiente empieza sola con el tema de la rotación', ['2026-11-20', GP::temaPara($ts('2026-11-20 18:00:00'))], [$p['id'], $p['tema']]);
GP::aportar($A1, 'personal');
GP::cancelar('control:prueba', 'Prueba de cancelación');
check('Cancelada: estado y nota', ['cancelada', 'Prueba de cancelación'], array_values(Db::fila("SELECT estado, nota FROM gp_producciones WHERE id = '2026-11-20'")));
check('tick no la vuelve a crear', null, GP::tick());
$mas(3 * 86400);
GP::tick();
check('Ni al cerrar: cancelada no paga premios', 0, (int) Db::valor("SELECT COUNT(*) FROM gp_premios WHERE produccion_id = '2026-11-20'"));
check('Aviso de cancelación en el chat', true, (bool) Db::valor("SELECT 1 FROM chat_mensajes WHERE canal = ? AND texto LIKE '%se canceló%'", ['asociacion:' . $AG]));
check('Cancelar sin producción → 409 gp_no_hay', [409, 'gp_no_hay'], falla(fn() => GP::cancelar('control:prueba')));
GP::guardarConfig(['activa' => false], 'control:prueba');
$reloj($ts('2026-11-27 19:00:00'));
check('Apagada: no empieza y la fase es "apagada"', [null, 'apagada', null], [GP::tick(), GP::vista($A1)['fase'], GP::vista($A1)['proxima']]);
GP::guardarConfig(['activa' => true, 'dia' => 6, 'hora' => '10:00', 'horas' => 24], 'control:prueba');
$reloj($ts('2026-11-28 10:05:00'));   // sábado 10:05
$p = GP::tick();
check('Otro día y hora (sábado 10:00, 24 h)', ['2026-11-28', $ts('2026-11-29 10:00:00')], [$p['id'] ?? null, (int) ($p['fin'] ?? 0)]);
$pn = GP::panel();
check('Panel: producción actual, tablas por servidor e historial', ['2026-11-28', true, 3], [$pn['actual']['id'] ?? null, isset($pn['tablas'][1]), count($pn['historial'])]);

// =====================================================================
titulo('Centro de Control: pestaña Gran Producción');
define('ENVIVO_CONTROL', true);
require dirname(__DIR__) . '/public/control/lib/base.php';
require dirname(__DIR__) . '/public/control/lib/gran_produccion.php';
check('La pestaña está en el menú', 'Gran Producción', CC_PESTANAS['gran'] ?? null);
$idx = (string) file_get_contents(dirname(__DIR__) . '/public/control/index.php');
check('index.php carga la pestaña, la pinta y atiende sus acciones gp_', [true, true, true], [str_contains($idx, "lib/gran_produccion.php"), str_contains($idx, "'gran' => cc_t_gran()"), str_contains($idx, "'gp_') => cc_a_gran(")]);
$html = cc_t_gran();
check('Muestra la producción en curso, la tabla del servidor 1, horario, premios e historial', [true, true, true, true, true, true],
    [str_contains($html, 'EN CURSO'), str_contains($html, 'id="tabla-gp-1"'), str_contains($html, 'name="horas"'), str_contains($html, 'id="tabla-gp-premios"'), str_contains($html, 'id="tabla-gp-historial"'), str_contains($html, 'gp_cancelar')]);
check('Pausar desde el panel', true, str_contains(cc_a_gran('gp_pausar', 'control:prueba'), 'en pausa'));
check('Con pausa: botón Reanudar', true, str_contains(cc_t_gran(), 'gp_reanudar'));
check('Reanudar desde el panel', true, str_contains(cc_a_gran('gp_reanudar', 'control:prueba'), 'sigue'));
$_POST = ['activa' => '1', 'dia' => '5', 'hora' => '18:00', 'horas' => '48', 'tema_proximo' => 'maraton_nubes'];
check('Guardar horario desde el panel', true, str_contains(cc_a_gran('gp_config', 'control:prueba'), 'viernes 18:00, 48 h'));
check('Acción desconocida → Fallo', [400, null], falla(fn() => cc_a_gran('gp_otra', 'control:prueba')));
$_POST = ['motivo' => 'Prueba panel'];
check('Cancelar desde el panel', true, str_contains(cc_a_gran('gp_cancelar', 'control:prueba'), 'cancelada'));
check('Pausa, reanudar y cancelar quedan en la auditoría', 3, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion IN ('gran_produccion_pausa', 'gran_produccion_reanudar', 'gran_produccion_cancelar') AND quien = 'control:prueba' AND detalle LIKE '%2026-11-28%'"));
$_POST = [];

// =====================================================================
titulo('Rutas por HTTP (copia de api.php)');
$reloj(time());
GP::fijarReloj(null); Push::fijarReloj(null);
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$linea = "    if (class_exists(\\EnVivo\\GranProduccionApi::class) && \\EnVivo\\GranProduccionApi::esRuta(\$ruta)) \\EnVivo\\GranProduccionApi::responder(\$ruta, \$metodo, requiere_sesion());";
check('api.php trae la línea de la Gran Producción', true, str_contains($api, $linea));
check('INTEGRAR_GRAN_PRODUCCION.md trae la misma línea', true, str_contains((string) @file_get_contents(dirname(__DIR__) . '/INTEGRAR_GRAN_PRODUCCION.md'), trim($linea)));
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ';', $api);
mkdir($TMP . '/pub');
file_put_contents($TMP . '/pub/api.php', $api);
file_put_contents($TMP . '/pub/router.php', "<?php\n\$r = (string) parse_url((string) \$_SERVER['REQUEST_URI'], PHP_URL_PATH);\nif (str_starts_with(\$r, '/api/')) { require __DIR__ . '/api.php'; return true; }\nhttp_response_code(404); echo \"404\\n\"; return true;\n");
$puerto = (function () { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; })();
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-S', '127.0.0.1:' . $puerto, $TMP . '/pub/router.php'],
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
// Producción en curso con el reloj real: la de prueba se pone a correr ahora mismo
Db::q("UPDATE gp_producciones SET estado = 'cerrada' WHERE estado IN ('en_curso', 'pausada')");
Db::q("INSERT INTO gp_producciones (id, tema, inicio, fin, horas, estado, creado) VALUES ('2099-01-01', 'festival_playa', ?, ?, 48, 'en_curso', ?)", [time() - 60, time() + 47 * 3600, time()]);
$tok1 = $sesion($A2);
check('GET /api/gran sin sesión → 401', 401, $http('GET', '/api/gran')[0]);
[$c, $j] = $http('GET', '/api/gran', null, $tok1);
check('GET /api/gran → 200, en curso, tema, mi asociación y reglas', [200, 'en_curso', 'festival_playa', 'GRA', 3], [$c, $j['fase'] ?? null, $j['produccion']['tema'] ?? null, $j['asociacion']['siglas'] ?? null, count($j['reglas']['frentes'] ?? [])]);
check('POST /api/gran/aportar sin X-Envivo → 403', 403, $http('POST', '/api/gran/aportar', ['frente' => 'personal'], $tok1, false)[0]);
check('GET /api/gran/aportar → 405', 405, $http('GET', '/api/gran/aportar', null, $tok1)[0]);
[$c, $j] = $http('POST', '/api/gran/aportar', ['frente' => 'personal'], $tok1);
check('POST /api/gran/aportar → 200, 1 de personal', [200, 1, 1], [$c, $j['aporte']['cantidad'] ?? null, $j['yo']['aportes']['personal'] ?? null]);
[$c, $j] = $http('POST', '/api/gran/aportar', ['frente' => 'personal'], $tok1);
check('Otra vez → 409 gp_espera con "espera"', [409, 'gp_espera', true], [$c, $j['codigo'] ?? null, ($j['espera'] ?? 0) > 0]);
[$c, $j] = $http('POST', '/api/gran/aportar', ['frente' => 7], $tok1);
check('Frente no válido → 400 datos_invalidos', [400, 'datos_invalidos'], [$c, $j['codigo'] ?? null]);
[$c, $j] = $http('GET', '/api/gran/resumen', null, $tok1);
check('GET /api/gran/resumen → 200 con progreso', [200, true, true], [$c, $j['en_asociacion'] ?? null, is_int($j['progreso'] ?? null)]);
check('POST /api/gran → 405', 405, $http('POST', '/api/gran', [], $tok1)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nGran Producción: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
