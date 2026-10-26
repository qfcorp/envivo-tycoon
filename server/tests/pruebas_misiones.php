<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Misiones del día y de la semana (server/src/Misiones.php y MisionesApi.php):
// base SQLite TEMPORAL y reloj congelado: elección por fecha (sin azar, igual que js/misiones.js), periodos válidos
// (hoy ±1 y la semana), un reclamo por premio, créditos solo en los cofres y con tope por día, materiales como entregas,
// XP del Pase de Temporada (si existe), cuenta suspendida y las rutas por HTTP con php -S y server/public/api.php.
// Uso:  php server/tests/pruebas_misiones.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_misiones_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Db, Fallo, Misiones, Monedero, Pase};

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
$Z = new DateTimeZone('America/Guayaquil');
$t = fn(string $f) => (new DateTimeImmutable($f, $Z))->getTimestamp();
Db::pdo();
Misiones::preparar();
$nuevo = function (string $alias): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, 1, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '@prueba.example', $alias, 'x', time(), $alias, strtolower($alias)]);
    return Db::ultimoId();
};
$entregasDe = fn(int $j) => array_map(fn($e) => $e['item'] . ':' . $e['cantidad'], Db::todas("SELECT item, cantidad FROM entregas WHERE jugador_id = ? AND tipo = 'materiales' ORDER BY id", [$j]));

// =====================================================================
titulo('Tablas y elección por fecha (sin azar)');
check('Tabla misiones_reclamos creada (migraciones/misiones.sql)', 1, (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'misiones_reclamos'"));
check('FNV-1a de 32 bits conocido ("a" -> 0xE40C292C)', 0xE40C292C, Misiones::fnv('a'));
$d1 = Misiones::elegir('d', '2026-10-23');
check('5 misiones del día, la primera fija (eventos)', [5, 'eventos'], [count($d1), $d1[0]]);
check('Misma fecha -> mismas misiones', $d1, Misiones::elegir('d', '2026-10-23'));
check('Sin repetidas', 5, count(array_unique($d1)));
$distintas = 0; for ($k = 1; $k <= 20; $k++) if (Misiones::elegir('d', sprintf('2026-11-%02d', $k)) !== $d1) $distintas++;
check('Cambian con la fecha (20 días distintos de hoy)', true, $distintas >= 18);
$sin = 0; for ($k = 1; $k <= 28; $k++) if (in_array('en_linea', Misiones::elegir('d', sprintf('2026-12-%02d', $k), false), true)) $sin++;
check('Sin cuenta no sale "Juega un evento en línea"', 0, $sin);
$s1 = Misiones::elegir('s', '2026-10-19');
check('5 semanales, la primera fija (eventos_s)', [5, 'eventos_s'], [count($s1), $s1[0]]);
check('Lunes de una fecha', ['2026-10-19', '2026-10-19', '2026-10-26'], [Misiones::lunes('2026-10-25'), Misiones::lunes('2026-10-19'), Misiones::lunes('2026-10-26')]);
// Todas las misiones del pool salen alguna vez en 60 días
$vistas = []; for ($k = 0; $k < 60; $k++) foreach (Misiones::elegir('d', date('Y-m-d', $t('2026-10-01 12:00') + 86400 * $k)) as $id) $vistas[$id] = 1;
check('En 60 días salen todas las misiones del día', count(Misiones::MISIONES_DIA), count($vistas));
// Muestra para la prueba del juego (tests/test_misiones.js compara con el JavaScript)
if (getenv('MISIONES_MUESTRA')) { $o = []; for ($k = 0; $k < 60; $k++) { $f = date('Y-m-d', $t('2026-10-01 12:00') + 86400 * $k); $o[$f] = [Misiones::elegir('d', $f), Misiones::elegir('d', $f, false), Misiones::elegir('s', Misiones::lunes($f))]; }
    file_put_contents(getenv('MISIONES_MUESTRA'), json_encode(['picks' => $o, 'dia' => Misiones::MISIONES_DIA, 'semana' => Misiones::MISIONES_SEMANA, 'cofres' => Misiones::COFRES, 'xp' => Misiones::XP_PASE])); }

// =====================================================================
titulo('Periodos: hoy ±1 (zona del celular) y la semana');
Misiones::fijarReloj($t('2026-10-23 10:00:00'));   // viernes
check('d:hoy, d:ayer y d:mañana valen', [['d', '2026-10-23'], ['d', '2026-10-22'], ['d', '2026-10-24']],
    [Misiones::periodo('d:2026-10-23'), Misiones::periodo('d:2026-10-22'), Misiones::periodo('d:2026-10-24')]);
check('d:hace 2 días -> 409 misiones_vencidas', [409, 'misiones_vencidas'], falla(fn() => Misiones::periodo('d:2026-10-21')));
check('Formato malo -> 400 periodo_invalido', [[400, 'periodo_invalido'], [400, 'periodo_invalido'], [400, 'periodo_invalido']],
    [falla(fn() => Misiones::periodo('2026-10-23')), falla(fn() => Misiones::periodo('d:2026-02-30')), falla(fn() => Misiones::periodo('x:2026-10-23'))]);
check('s:lunes de esta semana vale', ['s', '2026-10-19'], Misiones::periodo('s:2026-10-19'));
check('s: que no es lunes -> 409', [409, 'misiones_vencidas'], falla(fn() => Misiones::periodo('s:2026-10-20')));
check('s: semana pasada (el viernes) -> 409', [409, 'misiones_vencidas'], falla(fn() => Misiones::periodo('s:2026-10-12')));
Misiones::fijarReloj($t('2026-10-26 08:00:00'));   // lunes: la semana pasada todavía vale (±1 día)
check('El lunes todavía vale la semana anterior (celular atrasado)', ['s', '2026-10-19'], Misiones::periodo('s:2026-10-19'));
Misiones::fijarReloj($t('2026-10-25 20:00:00'));   // domingo: la semana que viene ya vale (celular adelantado)
check('El domingo ya vale la semana siguiente', ['s', '2026-10-26'], Misiones::periodo('s:2026-10-26'));

// =====================================================================
titulo('Reclamar: una vez por premio, tabla fija, materiales como entregas');
Misiones::fijarReloj($t('2026-10-23 10:00:00'));
Pase::fijarReloj($t('2026-10-23 10:00:00'));
$A = $nuevo('Ana Misiones');
$hoyD = 'd:2026-10-23';
$otra = current(array_diff(array_keys(Misiones::MISIONES_DIA), Misiones::elegir('d', '2026-10-23')));
check('Misión que no es de hoy -> 404 mision_invalida', [404, 'mision_invalida'], falla(fn() => Misiones::reclamar($A, $hoyD, $otra)));
check('Clave rara -> 400 mision_invalida', [400, 'mision_invalida'], falla(fn() => Misiones::reclamar($A, $hoyD, '../x')));
$r = Misiones::reclamar($A, $hoyD, 'eventos');
check('Reclama "eventos": ok, premio fijo, sin créditos', [true, ['dinero' => 250], 0], [$r['ok'], $r['premio'], $r['creditos_dados']]);
check('Otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => Misiones::reclamar($A, $hoyD, 'eventos')));
check('Queda la hora del reclamo', $t('2026-10-23 10:00:00'), (int) Db::valor('SELECT creado FROM misiones_reclamos WHERE jugador_id = ? AND clave = ?', [$A, 'eventos']));
$r = Misiones::reclamar($A, 's:2026-10-19', 'eventos_s');
check('Semanal "eventos_s": materiales como entrega (8 cables)', [['cables' => 8], ['cables:8']], [$r['premio']['mat'], $entregasDe($A)]);
check('Las entregas salen en la respuesta (tipo materiales)', ['materiales', 'cables', 8], [$r['entregas'][0]['tipo'] ?? null, $r['entregas'][0]['item'] ?? null, $r['entregas'][0]['cantidad'] ?? null]);
check('Cofre 20: sin créditos', 0, Misiones::reclamar($A, $hoyD, 'cofre20')['creditos_dados']);
check('Cofre que no existe -> 404', [404, 'mision_invalida'], falla(fn() => Misiones::reclamar($A, $hoyD, 'cofre30')));
check('Cofres solo en el día (s:...cofre20 -> 404)', [404, 'mision_invalida'], falla(fn() => Misiones::reclamar($A, 's:2026-10-19', 'cofre20')));
$r = Misiones::reclamar($A, $hoyD, 'cofre60');
check('Cofre 60: 3 créditos al monedero + 6 cables', [3, 3, true], [$r['creditos_dados'], Monedero::saldo($A), in_array('cables:6', $entregasDe($A), true)]);
check('Movimiento con motivo "misiones"', 'misiones:d:2026-10-23:cofre60', (string) Db::valor("SELECT ref FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'misiones'", [$A]));
$r = Misiones::reclamar($A, $hoyD, 'cofre100');
check('Cofre 100: 5 créditos (total 8, debajo del tope 10)', [5, 8, false], [$r['creditos_dados'], Monedero::saldo($A), $r['tope_alcanzado']]);

// =====================================================================
titulo('Tope de créditos por día del servidor');
$r = Misiones::reclamar($A, 'd:2026-10-24', 'cofre100');   // el día del celular de mañana, pero hoy en el servidor
check('Otro periodo el mismo día del servidor: solo 2 (tope 10)', [2, 10, true], [$r['creditos_dados'], Monedero::saldo($A), $r['tope_alcanzado']]);
$r = Misiones::reclamar($A, 'd:2026-10-24', 'cofre60');
check('Ya en el tope: 0 créditos pero igual da los materiales', [0, 10, true], [$r['creditos_dados'], Monedero::saldo($A), count(array_filter($entregasDe($A), fn($x) => $x === 'cables:6')) === 2]);
Ajustes::set('misiones_creditos_dia', '0');
$B = $nuevo('Beto Misiones');
check('Ajuste misiones_creditos_dia = 0 -> sin créditos', 0, Misiones::reclamar($B, $hoyD, 'cofre60')['creditos_dados']);
Ajustes::set('misiones_creditos_dia', '');
Misiones::fijarReloj($t('2026-10-24 09:00:00'));
check('Al día siguiente del servidor vuelve a dar', 3, Misiones::reclamar($B, 'd:2026-10-24', 'cofre60')['creditos_dados']);
check('estado(): creditos_hoy y tope', [3, 10], (fn($e) => [$e['creditos_hoy'], $e['creditos_tope']])(Misiones::estado($B)));

// =====================================================================
titulo('XP del Pase de Temporada (fuente "misiones")');
Misiones::fijarReloj($t('2026-10-23 10:00:00'));
check('Pase acepta la fuente "misiones"', true, Misiones::hayXpPase());
$C = $nuevo('Cata Misiones');
$id2 = Misiones::elegir('d', '2026-10-23')[1];
$r = Misiones::reclamar($C, $hoyD, $id2);
check('Misión del día: +15 XP del pase', 15, $r['xp_pase']);
check('Semanal: +40 XP del pase', 40, Misiones::reclamar($C, 's:2026-10-19', Misiones::elegir('s', '2026-10-19')[2])['xp_pase']);
check('Los cofres no dan XP', 0, Misiones::reclamar($C, $hoyD, 'cofre20')['xp_pase']);
check('Libro del pase: 55 XP con fuente misiones', 55, (int) Db::valor("SELECT COALESCE(SUM(xp), 0) FROM pase_xp WHERE jugador_id = ? AND fuente = 'misiones'", [$C]));
check('No cuentan para la misión del pase "Juega 3 eventos en línea"', 0, (int) Db::valor("SELECT COUNT(*) FROM pase_xp WHERE jugador_id = ? AND fuente = 'mision'", [$C]));

// =====================================================================
titulo('Cuenta suspendida y estado()');
$Q = $nuevo('Quique Misiones');
Db::q("UPDATE jugadores SET estado = 'suspendido' WHERE id = ?", [$Q]);
check('Suspendida: no reclama (403 cuenta_suspendida)', [403, 'cuenta_suspendida'], falla(fn() => Misiones::reclamar($Q, $hoyD, 'eventos')));
$e = Misiones::estado($A);
check('estado(): reclamados por periodo (para otro celular)', [true, true, true], [in_array('eventos', $e['reclamados']->{'d:2026-10-23'} ?? [], true), in_array('cofre100', $e['reclamados']->{'d:2026-10-23'} ?? [], true), in_array('eventos_s', $e['reclamados']->{'s:2026-10-19'} ?? [], true)]);
check('estado(): misiones de hoy y de la semana', [Misiones::elegir('d', '2026-10-23'), Misiones::elegir('s', '2026-10-19'), '2026-10-23', '2026-10-19'], [$e['dia'], $e['semana'], $e['hoy'], $e['lunes']]);

// =====================================================================
titulo('Premios por constancia: cofre semanal (5 de 7 días) y premio de la semana');
$activar = function (int $j, string $desde, int $n) use ($t): void {
    for ($k = 0; $k < $n; $k++) { $f = date('Y-m-d', $t($desde . ' 12:00') + 86400 * $k); Misiones::fijarReloj($t($f . ' 10:00:00')); Misiones::reclamar($j, 'd:' . $f, 'cofre60'); }
};
$sec = array_map(fn($l) => Misiones::premioSemana($l), ['2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29']);
check('Premio de la semana: rota cada lunes (obra → estrella → vip → ...) y vuelve a empezar', [['estrella', 'vip', 'obra', 'estrella'], true],
    [$sec, $sec[0] === $sec[3]]);
$rot = []; foreach (['2026-06-08', '2026-06-15', '2026-06-22'] as $l) $rot[] = Misiones::premioSemana($l);
check('Las 3 semanas seguidas traen los 3 premios distintos', 3, count(array_unique($rot)));
check('Equipo exclusivo del mes: rota y todos existen en el catálogo', [true, 6], [array_reduce(Misiones::EXCLUSIVOS_MES, fn($a, $x) => $a && \EnVivo\Catalogo::esEquipo($x), true),
    count(array_unique(array_map(fn($m) => Misiones::exclusivoMes(sprintf('2026-%02d', $m)), range(1, 6))))]);
$F = $nuevo('Fede Constante');
Misiones::fijarReloj($t('2026-06-10 10:00:00'));   // miércoles; lunes 2026-06-08
check('Sin días activos: constancia -> 409 no_disponible (0 de 5)', [409, 'no_disponible'], falla(fn() => Misiones::reclamar($F, 's:2026-06-08', 'constancia')));
check('"constancia" no es del día ni "mes7" de la semana (404)', [[404, 'mision_invalida'], [404, 'mision_invalida']],
    [falla(fn() => Misiones::reclamar($F, 'd:2026-06-10', 'constancia')), falla(fn() => Misiones::reclamar($F, 's:2026-06-08', 'mes7'))]);
$activar($F, '2026-06-08', 4);
check('4 días activos: todavía no', [409, 'no_disponible'], falla(fn() => Misiones::reclamar($F, 's:2026-06-08', 'constancia')));
check('estado(): 4 de 5 días activos en la semana', [4, 5, 'estrella'], (fn($c) => [$c['semana']['activos'], $c['semana']['meta'], $c['semana']['premio']])(Misiones::estado($F)['constancia']));
Misiones::fijarReloj($t('2026-06-11 18:00:00'));
check('Abrir el cofre 20 no cuenta como día activo', [409, 'no_disponible'], (function () use ($F) { Misiones::reclamar($F, 'd:2026-06-12', 'cofre20'); return falla(fn() => Misiones::reclamar($F, 's:2026-06-08', 'constancia')); })());
$activar($F, '2026-06-12', 1);
$antes = Monedero::saldo($F);
$r = Misiones::reclamar($F, 's:2026-06-08', 'constancia');
check('5 días: cofre de constancia con 25 créditos, materiales y premio "estrella"', [25, 25, 4, 'estrella', true],
    [$r['creditos_dados'], Monedero::saldo($F) - $antes, count($r['entregas']), $r['extra']['tipo'] ?? null, $r['extra']['dado'] ?? null]);
check('Semana "estrella": contrato de regalo de 2 partidos (la estrella de la semana)', [2, 'regalo', 1],
    [(int) Db::valor('SELECT partidos FROM estrellas_contratos WHERE jugador_id = ?', [$F]), (string) Db::valor('SELECT origen FROM estrellas_contratos WHERE jugador_id = ?', [$F]), (int) Db::valor('SELECT COUNT(*) FROM estrellas_contratos WHERE jugador_id = ?', [$F])]);
check('Constancia otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => Misiones::reclamar($F, 's:2026-06-08', 'constancia')));
check('Constancia no da XP del pase', 0, $r['xp_pase']);
check('El cofre de constancia no gasta el tope del día: cofre100 de hoy da sus 5', 5, Misiones::reclamar($F, 'd:2026-06-12', 'cofre100')['creditos_dados']);
// VIP y obra
$V = $nuevo('Vale Vip');
$activar($V, '2026-06-15', 5);
$r = Misiones::reclamar($V, 's:2026-06-15', 'constancia');
$hasta = (int) Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$V]);
check('Semana "vip": prueba del Pase VIP de 1 día (vip_hasta ≈ ahora + 24 h)', ['vip', true, true], [$r['extra']['tipo'], $r['extra']['dado'], abs($hasta - (time() + 86400)) < 120]);
$O = $nuevo('Oscar Obra');
$activar($O, '2026-06-22', 5);
$r = Misiones::reclamar($O, 's:2026-06-22', 'constancia');
check('Semana "obra": equipo de obra extra 24 h (impulsos_obra_alquiler, origen premio)', ['obra', true, 1, 86400],
    array_merge([$r['extra']['tipo'], $r['extra']['dado']], (fn($f) => [$f ? 1 : 0, $f ? (int) $f['fin'] - (int) $f['inicio'] : 0])(Db::fila("SELECT * FROM impulsos_obra_alquiler WHERE jugador_id = ? AND origen = 'premio' AND ref = ?", [$O, 'misiones:s:2026-06-22:constancia']))));
// Tope semanal
Ajustes::set('misiones_creditos_semana', '20');
$W = $nuevo('Wil Tope');
$activar($W, '2026-06-08', 5);   // 5 cofres de 60 = 15 créditos
$r = Misiones::reclamar($W, 's:2026-06-08', 'constancia');
check('Tope semanal 20: la constancia da solo 5 (y avisa)', [5, true, 20, 20], [$r['creditos_dados'], $r['tope_alcanzado'], $r['creditos_semana'], $r['creditos_semana_tope']]);
check('Tope semanal: un cofre del día ya no da créditos esa semana', 0, Misiones::reclamar($W, 'd:2026-06-12', 'cofre100')['creditos_dados']);
Ajustes::set('misiones_creditos_semana', '');
check('Tope semanal por defecto 120', 120, Misiones::topeCreditosSemana());

// =====================================================================
titulo('Ruta del mes: 7, 14 y 21 días activos (el de 21 trae un exclusivo permanente)');
$M = $nuevo('Mila Mes');
$activar($M, '2026-06-01', 6);
check('6 días: mes7 -> 409 no_disponible', [409, 'no_disponible'], falla(fn() => Misiones::reclamar($M, 'm:2026-06', 'mes7')));
$activar($M, '2026-06-07', 1);
$antes = Monedero::saldo($M);
$r = Misiones::reclamar($M, 'm:2026-06', 'mes7');
check('7 días: mes7 con 20 créditos y 2 entregas de materiales', [20, 20, 2], [$r['creditos_dados'], Monedero::saldo($M) - $antes, count($r['entregas'])]);
check('mes14 todavía no; hito que no existe (mes10) -> 404', [[409, 'no_disponible'], [404, 'mision_invalida']], [falla(fn() => Misiones::reclamar($M, 'm:2026-06', 'mes14')), falla(fn() => Misiones::reclamar($M, 'm:2026-06', 'mes10'))]);
$activar($M, '2026-06-08', 7);
check('14 días: mes14 con 30 créditos', 30, Misiones::reclamar($M, 'm:2026-06', 'mes14')['creditos_dados']);
$activar($M, '2026-06-15', 6);
check('20 días: mes21 todavía no', [409, 'no_disponible'], falla(fn() => Misiones::reclamar($M, 'm:2026-06', 'mes21')));
$activar($M, '2026-06-21', 1);
$r = Misiones::reclamar($M, 'm:2026-06', 'mes21');
$ex = Misiones::exclusivoMes('2026-06');
check('21 días: el exclusivo del mes al inventario (origen misiones), sin créditos', [$ex, 'misiones', 1, 0, 'exclusivo'],
    [$r['equipos'][0]['item'] ?? null, (string) Db::valor('SELECT origen FROM inventario WHERE jugador_id = ?', [$M]), (int) Db::valor('SELECT COUNT(*) FROM inventario WHERE jugador_id = ?', [$M]), $r['creditos_dados'], $r['extra']['tipo'] ?? null]);
check('mes21 otra vez -> 409 (un solo exclusivo por mes)', [409, 'ya_reclamado'], falla(fn() => Misiones::reclamar($M, 'm:2026-06', 'mes21')));
Misiones::fijarReloj($t('2026-06-30 10:00:00'));
$e = Misiones::estado($M);
check('estado() el 30: el mes sigue con lo reclamado (más de 16 días) y 21 días activos', [true, 21, $ex, true],
    [in_array('mes7', $e['reclamados']->{'m:2026-06'} ?? [], true), $e['constancia']['mes']['activos'], $e['constancia']['mes']['exclusivo'], in_array('2026-06-21', $e['constancia']['dias'], true)]);
check('Periodos del mes: el anterior vence; el 1 todavía vale (±1 día); formato malo -> 400', [[409, 'misiones_vencidas'], ['m', '2026-06'], [400, 'periodo_invalido']],
    [falla(fn() => Misiones::periodo('m:2026-05')), (function () use ($t) { Misiones::fijarReloj($t('2026-07-01 08:00:00')); return Misiones::periodo('m:2026-06'); })(), falla(fn() => Misiones::periodo('m:2026-13'))]);
// Una semana entera de un F2P constante: créditos por debajo del tope semanal
$K = $nuevo('Kike Constante');
$c0 = Monedero::saldo($K);
for ($k = 0; $k < 7; $k++) { $f = date('Y-m-d', $t('2026-06-08 12:00') + 86400 * $k); Misiones::fijarReloj($t($f . ' 10:00:00')); Misiones::reclamar($K, 'd:' . $f, 'cofre60'); Misiones::reclamar($K, 'd:' . $f, 'cofre100'); }
Misiones::reclamar($K, 's:2026-06-08', 'constancia');
check('Semana completa de un F2P: 7 × 8 + 25 = 81 créditos (debajo del tope 120)', 81, Monedero::saldo($K) - $c0);

// =====================================================================
titulo('Rutas por HTTP (php -S con server/public/api.php)');
Misiones::fijarReloj(null); Pase::fijarReloj(null);
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$guia = (string) file_get_contents(dirname(__DIR__) . '/INTEGRAR_MISIONES.md');
preg_match('/<!-- api\.php -->\s*```php\s*(.+?)```/s', $guia, $lineaApi);
$lineaApi = trim($lineaApi[1] ?? '');
check('INTEGRAR_MISIONES.md trae la línea de api.php', true, str_contains($lineaApi, 'MisionesApi::esRuta'));
check('api.php tiene la línea', true, str_contains($api, trim($lineaApi)));
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ';', $api);
mkdir($TMP . '/public');
file_put_contents($TMP . '/public/api.php', $api);
file_put_contents($TMP . '/router.php', '<?php $r = (string) parse_url((string) $_SERVER["REQUEST_URI"], PHP_URL_PATH); if (!str_starts_with($r, "/api/")) { http_response_code(404); echo "404\n"; return true; } require __DIR__ . "/public/api.php";');
$puerto = (function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr((string) strrchr((string) stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; })();
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-S', '127.0.0.1:' . $puerto, $TMP . '/router.php'],
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
$H = $nuevo('Hugo Http');
$tok = $sesion($H);
$hoy = date('Y-m-d');
check('GET /api/estado sigue igual', [200, true], (function () use ($http) { [$c, $j] = $http('GET', '/api/estado'); return [$c, isset($j['tienda'])]; })());
check('GET /api/misiones sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], (function () use ($http) { [$c, $j] = $http('GET', '/api/misiones'); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('GET', '/api/misiones', null, $tok);
check('GET /api/misiones -> 200 con hoy, misiones y tope', [200, $hoy, 5, 5, 10], [$c, $j['hoy'] ?? null, count($j['dia'] ?? []), count($j['semana'] ?? []), $j['creditos_tope'] ?? null]);
check('GET /api/misiones trae los premios por constancia y el tope semanal', [0, 5, 120, true],
    [$j['constancia']['semana']['activos'] ?? null, $j['constancia']['semana']['meta'] ?? null, $j['creditos_semana_tope'] ?? null, isset($j['constancia']['mes']['exclusivo'])]);
check('POST constancia sin días -> 409 no_disponible', [409, 'no_disponible'], (function () use ($http, $tok, $hoy) { [$c, $j] = $http('POST', '/api/misiones/reclamar', ['periodo' => 's:' . \EnVivo\Misiones::lunes($hoy), 'clave' => 'constancia'], $tok); return [$c, $j['codigo'] ?? null]; })());
check('POST sin X-Envivo -> 403', 403, $http('POST', '/api/misiones/reclamar', ['periodo' => 'd:' . $hoy, 'clave' => 'eventos'], $tok, false)[0]);
[$c, $j] = $http('POST', '/api/misiones/reclamar', ['periodo' => 'd:' . $hoy, 'clave' => 'cofre60'], $tok);
check('POST /api/misiones/reclamar cofre60 -> 200, 3 créditos, saldo 3', [200, 3, 3], [$c, $j['creditos_dados'] ?? null, $j['creditos'] ?? null]);
[$c, $j] = $http('POST', '/api/misiones/reclamar', ['periodo' => 'd:' . $hoy, 'clave' => 'cofre60'], $tok);
check('Otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], [$c, $j['codigo'] ?? null]);
check('Sin periodo -> 400 falta_periodo', [400, 'falta_periodo'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/misiones/reclamar', ['clave' => 'eventos'], $tok); return [$c, $j['codigo'] ?? null]; })());
check('Sin clave -> 400 falta_clave', [400, 'falta_clave'], (function () use ($http, $tok, $hoy) { [$c, $j] = $http('POST', '/api/misiones/reclamar', ['periodo' => 'd:' . $hoy], $tok); return [$c, $j['codigo'] ?? null]; })());
check('Periodo vencido -> 409 misiones_vencidas', [409, 'misiones_vencidas'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/misiones/reclamar', ['periodo' => 'd:2020-01-01', 'clave' => 'eventos'], $tok); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('GET', '/api/misiones', null, $tok);
check('GET muestra lo reclamado', ['cofre60'], $j['reclamados']['d:' . $hoy] ?? null);
check('GET /api/misiones/reclamar -> 405', 405, $http('GET', '/api/misiones/reclamar', null, $tok)[0]);
check('POST /api/misiones -> 405', 405, $http('POST', '/api/misiones', [], $tok)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

// Códigos nuevos con texto en los 10 idiomas
$cod = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/docs/traducciones/errores_nuevos/misiones.json'), true);
$faltan = [];
foreach (['periodo_invalido', 'misiones_vencidas', 'mision_invalida'] as $k) foreach (['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'] as $l) if (!isset($cod[$l][$k])) $faltan[] = "$l.$k";
check('docs/traducciones/errores_nuevos/misiones.json: códigos en 10 idiomas', [], $faltan);

echo "\n----------------------------------------\nMisiones: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
