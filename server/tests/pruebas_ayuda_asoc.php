<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Ayudas de la asociación, Investigación y Tienda de fichas
// (server/src/AyudaAsoc.php + AyudaAsocApi.php, unificado con las ayudas de server/src/SedeOficial.php):
// base SQLite TEMPORAL, reloj congelado (SedeOficial::fijarReloj). Pedir ayuda, "Ayudar a todos", fichas con tope
// diario, anti cuentas alternas (24 h en la asociación), tope por obra de 10 a 20, donaciones (dinero del juego y
// materiales), niveles de investigación, tienda con topes, bonos, auditoría y libro. Al final las rutas por HTTP con
// una COPIA de server/public/api.php (con la línea de server/INTEGRAR_AYUDA_ASOC.md) y php -S.
// Uso:  php server/tests/pruebas_ayuda_asoc.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_ayuda_asoc_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{AyudaAsoc as AA, Db, Fallo, SedeOficial as SO, Social};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
/** [código HTTP, codigo] del Fallo (o [200, null] si no falló). */
function falla(callable $f): array
{
    try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; }
}

Db::pdo();
$T0 = (new DateTimeImmutable('2026-10-23 10:00:00', new DateTimeZone('America/Guayaquil')))->getTimestamp();
SO::fijarReloj($T0);
$mas = function (int $s) { SO::fijarReloj(SO::ahora() + $s); };
$n = 0;
$nuevo = function (string $alias, int $fama = 0) use (&$n, $T0): int {
    $n++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        ['asoc' . $n . '@prueba.example', $alias, 'x', $T0 - 30 * 86400, $alias, strtolower(str_replace(' ', '', $alias)) . $n, $fama]);
    return Db::ultimoId();
};
$antiguo = function (int ...$js) use ($T0) { foreach ($js as $j) Db::q('UPDATE asociacion_miembros SET desde = ? WHERE jugador_id = ?', [$T0 - 3 * 86400, $j]); };
// Obra de prueba directa (como en pruebas_sede_oficial.php): 2 días, termina en el futuro
$obra = function (int $j, int $dur = 172800) { SO::sincronizar($j); $t = SO::ahora();
    Db::q("INSERT INTO sede_obras (jugador_id, tipo, ed, nivel, inicio, duracion, fin) VALUES (?, 'mejora', 'control', 9, ?, ?, ?)", [$j, $t, $dur, $t + $dur]); return Db::ultimoId(); };
$dar = function (int $j, array $bolsa) { SO::sincronizar($j); foreach ($bolsa as $k => $v) Db::q("UPDATE sede_oficial SET $k = $k + ? WHERE jugador_id = ?", [$v, $j]); };
$mat = fn(int $j) => SO::vista($j)['sede']['materiales'];
$fichasLibro = fn(int $j) => (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM ayuda_asoc_libro WHERE jugador_id = ?', [$j]);
$asocDe = fn(int $j) => (int) Db::valor('SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?', [$j]);

// =====================================================================
titulo('Tablas (migración sola) y tope base');
$tablas = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ayuda_asoc_%' ORDER BY name"), 'name');
check('Tablas ayuda_asoc_* creadas solas al abrir la base', ['ayuda_asoc_compras', 'ayuda_asoc_donaciones', 'ayuda_asoc_fichas', 'ayuda_asoc_insignias',
    'ayuda_asoc_investigacion', 'ayuda_asoc_libro', 'ayuda_asoc_pedidos', 'ayuda_asoc_puntos'], $tablas);
$P = $nuevo('Presi', 40);
Social::crear($P, ['nombre' => 'Asociación Ayudas', 'siglas' => 'AYU', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
$A = $asocDe($P);
$S = [];
for ($k = 1; $k <= 6; $k++) { $S[$k] = $nuevo('Socio ' . $k); Social::unirse($S[$k], $A); }
$antiguo($P, ...array_values($S));
$Nueva = $nuevo('Recién Llegada');
Social::unirse($Nueva, $A);
Db::q('UPDATE asociacion_miembros SET desde = ? WHERE jugador_id = ?', [$T0 - 3600, $Nueva]);   // entró hace 1 h
$Fuera = $nuevo('Sin Asociación');
$Otra = $nuevo('Otra Asoc');
Social::crear($Otra, ['nombre' => 'Asociación Rival', 'siglas' => 'RIV', 'color' => '#00ff00', 'pagado_en_juego' => true]);
$antiguo($Otra);
check('Tope base: 10 ayudas por obra (nivel 1, sin Refuerzos)', [10, 10, 10], [AA::topeAyudas($P), SO::topeAyudas($P), AA::topeAyudas($Fuera)]);
check('SedeOficial::vista reglas.ayudas_max sale de AyudaAsoc', 10, SO::vista($P)['reglas']['ayudas_max']);
check('Nivel 1 con 0 puntos; bonos en 0', [1, ['paga_eventos_pct' => 0, 'reparacion_pct' => 0, 'ayudas_extra' => 0]], [AA::nivelAsoc($A), AA::bonos($S[1])]);

// =====================================================================
titulo('Pedir ayuda');
$o1 = $obra($S[1]);
$o2 = $obra($S[2]);
$o2b = $obra($S[2]);
check('Sin asociación -> 409 sin_asociacion', [409, 'sin_asociacion'], falla(fn() => AA::pedir($Fuera, null)));
check('Obra ajena -> 404 obra_no_existe', [404, 'obra_no_existe'], falla(fn() => AA::pedir($S[3], $o1)));
$v = AA::pedir($S[1], $o1);
check('Pedir ayuda en una obra -> 1 pedida, mis_obras la marca', [1, true], [$v['pedidas'], $v['mis_obras'][0]['pedida'] ?? null]);
check('Pedir otra vez la misma -> 409 ya_pedida', [409, 'ya_pedida'], falla(fn() => AA::pedir($S[1], $o1)));
check('Pedir "todas" sin obras sin pedir -> 409 sin_obras', [409, 'sin_obras'], falla(fn() => AA::pedir($S[1], null)));
check('Pedir "todas" (2 obras) -> 2 pedidas', 2, AA::pedir($S[2], null)['pedidas']);
check('La Recién Llegada también puede pedir (el dueño no necesita 24 h)', 1, AA::pedir($Nueva, $obra($Nueva))['pedidas']);
$pend = AA::pendientes($S[3]);
check('Socio 3 ve 4 pedidos (los más viejos primero) con nombre y tope', [4, $o1, 'Socio 1', 10], [count($pend), $pend[0]['obra_id'], $pend[0]['nombre'], $pend[0]['ayudas_max']]);
check('El dueño no ve su propio pedido', 3, count(AA::pendientes($S[1])));
check('Otra asociación no ve nada', 0, count(AA::pendientes($Otra)));
check('Resumen (globo): 4 pendientes, 0 fichas', [4, 0], [AA::resumen($S[3])['pendientes'], AA::resumen($S[3])['fichas']]);

// =====================================================================
titulo('Anti cuentas alternas: solo cuenta con más de 24 h en la asociación');
check('Recién Llegada: Ayudar a todos -> 409 miembro_nuevo', [409, 'miembro_nuevo'], falla(fn() => AA::ayudarTodos($Nueva)));
check('Recién Llegada: ayuda suelta (SedeOficial::ayudar) -> 409 miembro_nuevo', [409, 'miembro_nuevo'], falla(fn() => SO::ayudar($Nueva, $S[1], $o1)));
check('Recién Llegada: donar -> 409 miembro_nuevo', [409, 'miembro_nuevo'], falla(fn() => AA::donar($Nueva, 'refuerzos', 'dinero', null, true)));
$e = null; try { AA::ayudarTodos($Nueva); } catch (Fallo $x) { $e = $x; }
check('…el error dice cuánto falta (espera ≈ 23 h)', [true, true], [($e->extra['espera'] ?? 0) === 23 * 3600, str_contains($e->getMessage(), '23 h')]);
check('vista: asociacion.espera > 0 para la Recién Llegada', 23 * 3600, AA::vista($Nueva)['asociacion']['espera']);
check('Sin asociación: Ayudar a todos -> 409 sin_asociacion', [409, 'sin_asociacion'], falla(fn() => AA::ayudarTodos($Fuera)));

// =====================================================================
titulo('Ayudar a todos (un toque)');
$fin1 = (int) Db::valor('SELECT fin FROM sede_obras WHERE id = ?', [$o1]);
$r = AA::ayudarTodos($S[3]);
check('Ayuda en los 4 pedidos de una vez, 4 fichas, premio de materiales', [4, 4, 4, false], [$r['ayudadas'], $r['fichas_ganadas'], array_sum($r['premio']), $r['tope_dia']]);
check('…cada obra baja 1 % (2 días = 1728 s) y suma 1 ayuda', [$fin1 - 1728, 1], [(int) Db::valor('SELECT fin FROM sede_obras WHERE id = ?', [$o1]), (int) Db::valor('SELECT ayudas FROM sede_obras WHERE id = ?', [$o1])]);
check('…total descontado = 4 × 1728 s', 4 * 1728, $r['segundos']);
check('…ya no le quedan pendientes; fichas = 4 = libro', [0, 4, 4], [count($r['pendientes']), $r['fichas'], $fichasLibro($S[3])]);
check('Otra vez -> 409 sin_pedidos', [409, 'sin_pedidos'], falla(fn() => AA::ayudarTodos($S[3])));
check('Socio 4 todavía puede ayudar en las 4', 4, AA::ayudarTodos($S[4])['ayudadas']);
check('La ayuda suelta (SedeOficial::ayudar) también da 1 ficha', [1, 1], (function () use ($S, $o1) { $o = SO::ayudar($S[5], $S[1], $o1); return [$o['fichas'], AA::fichas($S[5])]; })());
$mas(23 * 3600);
check('Recién Llegada al pasar 24 h: ya puede (ayuda en 3 pedidos, no en el suyo)', 3, AA::ayudarTodos($Nueva)['ayudadas']);
check('Auditoría: una línea asoc_ayudar_todos por toque', 3, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'asoc_ayudar_todos'"));

// =====================================================================
titulo('Topes del día: 20 fichas por ayudas, 30 ayudas');
$mas(86400);   // día nuevo
$muchas = [];
for ($k = 0; $k < 34; $k++) { $muchas[] = $id = $obra($S[1 + $k % 2]); Db::q('INSERT INTO ayuda_asoc_pedidos (obra_id, jugador_id, asociacion_id, creado) VALUES (?, ?, ?, ?)', [$id, $S[1 + $k % 2], $A, SO::ahora()]); }
$r = AA::ayudarTodos($S[6]);
check('34 pedidos: hace 30 (tope de ayudas del día), 20 fichas (tope), avisa tope_dia', [30, 20, true], [$r['ayudadas'], $r['fichas_ganadas'], $r['tope_dia']]);
check('…la siguiente -> 409 tope_ayudas_dia', [409, 'tope_ayudas_dia'], falla(fn() => AA::ayudarTodos($S[6])));
check('vista.hoy cuenta ayudas y fichas', [30, 30, 20, 20], [$r['hoy']['ayudas'], $r['hoy']['ayudas_max'], $r['hoy']['fichas_ayuda'], $r['hoy']['fichas_ayuda_max']]);
$mas(86400);
$quedan = count(AA::pendientes($S[6]));
check('Al día siguiente vuelve a poder (los que quedaban)', [true, $quedan], [$quedan > 0, AA::ayudarTodos($S[6])['ayudadas']]);

// =====================================================================
titulo('Tope por obra de 10 a 20: nivel de la asociación + Refuerzos');
check('Nivel por puntos: 0→1, 600→2, 1799→2, 14000→6', [1, 2, 2, 6], [AA::nivelPorPuntos(0), AA::nivelPorPuntos(600), AA::nivelPorPuntos(1799), AA::nivelPorPuntos(14000)]);
Db::q('INSERT INTO ayuda_asoc_puntos (asociacion_id, puntos, actualizado) VALUES (?, 600, 0)', [$A]);
check('Asociación nivel 2 -> 11 ayudas por obra', 11, AA::topeAyudas($S[1]));
Db::q("INSERT INTO ayuda_asoc_investigacion (asociacion_id, tech, nivel, progreso, actualizado) VALUES (?, 'refuerzos', 1, 0, 0)", [$A]);
check('…+ Refuerzos 1 -> 12; también en SedeOficial::topeAyudas y la vista de la sede', [12, 12, 12], [AA::topeAyudas($S[1]), SO::topeAyudas($S[1]), SO::vista($S[1])['reglas']['ayudas_max']]);
check('Otra asociación sigue en 10', 10, AA::topeAyudas($Otra));
$oT = $obra($S[1]);
Db::q('UPDATE sede_obras SET ayudas = 11 WHERE id = ?', [$oT]);
check('Obra con 11 ayudas: la 12 entra (tope 12)', 200, falla(fn() => SO::ayudar($S[2], $S[1], $oT))[0]);
check('…la 13 -> 409 ayudas_completas', [409, 'ayudas_completas'], falla(fn() => SO::ayudar($S[3], $S[1], $oT)));
Db::q('UPDATE ayuda_asoc_puntos SET puntos = 99999 WHERE asociacion_id = ?', [$A]);
Db::q("UPDATE ayuda_asoc_investigacion SET nivel = 5 WHERE asociacion_id = ? AND tech = 'refuerzos'", [$A]);
check('Máximo: nivel 6 + Refuerzos 5 = 20 (nunca más)', 20, AA::topeAyudas($S[1]));
check('bonos.ayudas_extra = 10', 10, AA::bonos($S[1])['ayudas_extra']);
Db::q('DELETE FROM ayuda_asoc_puntos'); Db::q('DELETE FROM ayuda_asoc_investigacion');

// =====================================================================
titulo('Investigación: donaciones');
$mas(86400);
$D = $S[4];
$f0 = AA::fichas($D);
check('Tecnología que no existe -> 400 tech_invalida', [400, 'tech_invalida'], falla(fn() => AA::donar($D, 'casino', 'dinero', null, true)));
check('Tipo raro -> 400 datos_invalidos', [400, 'datos_invalidos'], falla(fn() => AA::donar($D, 'refuerzos', 'creditos', null, true)));
check('Dinero sin pagar en el juego -> 402 sin_pago', [402, 'sin_pago'], falla(fn() => AA::donar($D, 'refuerzos', 'dinero', null, false)));
check('Sin asociación -> 409 sin_asociacion', [409, 'sin_asociacion'], falla(fn() => AA::donar($Fuera, 'refuerzos', 'dinero', null, true)));
$r = AA::donar($D, 'refuerzos', 'dinero', null, true);
check('Donar $2.000 del juego: 10 puntos, 2 fichas, progreso 10/300', [10, 2, 10, 300, 10], [$r['donacion']['puntos'], $r['donacion']['fichas'], $r['asociacion']['investigacion'][2]['progreso'], $r['asociacion']['investigacion'][2]['costo'], $r['asociacion']['puntos']]);
for ($k = 0; $k < 4; $k++) AA::donar($D, 'refuerzos', 'dinero', null, true);
check('La 6.ª donación de dinero del día -> 409 tope_donaciones_dinero', [409, 'tope_donaciones_dinero'], falla(fn() => AA::donar($D, 'refuerzos', 'dinero', null, true)));
check('Material que no existe -> 400 material_invalido', [400, 'material_invalido'], falla(fn() => AA::donar($D, 'refuerzos', 'material', 'oro', false)));
check('Sin materiales -> 409 faltan_materiales (y no cuenta)', [409, 'faltan_materiales', 5], [...falla(fn() => AA::donar($D, 'refuerzos', 'material', 'cables', false)), (int) Db::valor('SELECT COUNT(*) FROM ayuda_asoc_donaciones WHERE jugador_id = ?', [$D])]);
$dar($D, ['cables' => 25, 'chips' => 2]);
$m0 = $mat($D);
$r = AA::donar($D, 'refuerzos', 'material', 'cables', false);
check('Donar 10 cables: se descuentan de la sede oficial (libro donacion_asoc)', [$m0['cables'] - 10, -10], [$mat($D)['cables'], (int) Db::valor("SELECT SUM(cambio) FROM sede_libro WHERE jugador_id = ? AND motivo = 'donacion_asoc'", [$D])]);
$r = AA::donar($D, 'refuerzos', 'material', 'chips', false);
check('Donar 1 chip 4K: 15 puntos y 3 fichas', [15, 3, $m0['chips'] - 1], [$r['donacion']['puntos'], $r['donacion']['fichas'], $mat($D)['chips']]);
check('Fichas por donar: 5×2 + 2 + 3 = 15', 15, AA::fichas($D) - $f0);
// subir de nivel con lo que sobra
Db::q("UPDATE ayuda_asoc_investigacion SET progreso = 295 WHERE asociacion_id = ? AND tech = 'refuerzos'", [$A]);
$r = AA::donar($D, 'refuerzos', 'material', 'cables', false);
check('Progreso 295 + 10 -> Refuerzos nivel 1, sobran 5 para el nivel 2', [true, 1, 5, 800], [$r['donacion']['subio'], $r['asociacion']['investigacion'][2]['nivel'], $r['asociacion']['investigacion'][2]['progreso'], $r['asociacion']['investigacion'][2]['costo']]);
check('…el tope de ayudas sube a 11 (Refuerzos 1)', 11, AA::topeAyudas($S[1]));
check('Auditoría: anota la donación y la subida de nivel', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'asoc_donar' AND detalle LIKE '%refuerzos sube a nivel 1%'"));
Db::q("INSERT INTO ayuda_asoc_investigacion (asociacion_id, tech, nivel, progreso, actualizado) VALUES (?, 'reparacion', 3, 0, 0)", [$A]);
check('Tecnología al máximo -> 409 tech_max', [409, 'tech_max'], falla(fn() => AA::donar($D, 'reparacion', 'material', 'cables', false)));
Db::q("INSERT INTO ayuda_asoc_investigacion (asociacion_id, tech, nivel, progreso, actualizado) VALUES (?, 'paga_eventos', 4, 3995, 0)", [$A]);
$dar($D, ['placas' => 200]);
$r = AA::donar($D, 'paga_eventos', 'material', 'placas', false);
check('Llegar al máximo deja el progreso en 0 y sin costo', [5, 0, null], [$r['asociacion']['investigacion'][0]['nivel'], $r['asociacion']['investigacion'][0]['progreso'], $r['asociacion']['investigacion'][0]['costo']]);
check('Bonos para los socios: +10 % pago de eventos, −15 % reparación', [10, 15], [AA::bonos($S[1])['paga_eventos_pct'], AA::bonos($S[1])['reparacion_pct']]);
check('…y nada para quien no es socio', 0, AA::bonos($Fuera)['paga_eventos_pct']);
Db::q("DELETE FROM ayuda_asoc_investigacion WHERE tech IN ('reparacion', 'paga_eventos')");
for ($k = 0; $k < 6; $k++) AA::donar($D, 'refuerzos', 'material', 'placas', false);
check('15 donaciones al día -> la 16 es 409 tope_donaciones', [409, 'tope_donaciones', 15], [...falla(fn() => AA::donar($D, 'refuerzos', 'material', 'placas', false)), (int) Db::valor('SELECT COUNT(*) FROM ayuda_asoc_donaciones WHERE jugador_id = ? AND dia = ?', [$D, SO::dia()])]);
check('Fichas por donar: tope 30 por día', 30, AA::vista($D)['hoy']['fichas_donar']);
check('Puntos de la asociación = suma de donaciones', (int) Db::valor('SELECT SUM(puntos) FROM ayuda_asoc_donaciones WHERE asociacion_id = ?', [$A]), AA::puntos($A));

// =====================================================================
titulo('Tienda de fichas');
$mas(86400);
$C = $S[5];
check('Artículo que no existe -> 400 item_invalido', [400, 'item_invalido'], falla(fn() => AA::comprar($C, 'creditos')));
check('Sin fichas -> 409 sin_fichas', [409, 'sin_fichas'], falla(fn() => AA::comprar($C, 'caja_materiales')));
check('Sin asociación -> 409 sin_asociacion', [409, 'sin_asociacion'], falla(fn() => AA::comprar($Fuera, 'acel_15')));
Db::q('INSERT OR IGNORE INTO ayuda_asoc_fichas (jugador_id, saldo, ganadas, actualizado) VALUES (?, 0, 0, 0)', [$C]);
Db::q('UPDATE ayuda_asoc_fichas SET saldo = saldo + 1000 WHERE jugador_id = ?', [$C]);
Db::q("INSERT INTO ayuda_asoc_libro (jugador_id, cambio, motivo, ref, dia, creado) VALUES (?, 1000, 'ajuste', 'prueba', ?, ?)", [$C, SO::dia(), SO::ahora()]);
$m0 = $mat($C); $f0 = AA::fichas($C);
$r = AA::comprar($C, 'caja_materiales');
check('Caja de materiales: −30 fichas, +3 de cada común', [$f0 - 30, $m0['cables'] + 3, $m0['planos'] + 3], [$r['fichas'], $mat($C)['cables'], $mat($C)['planos']]);
AA::comprar($C, 'caja_materiales'); AA::comprar($C, 'caja_materiales');
check('La 4.ª caja del día -> 409 tope_tienda', [409, 'tope_tienda'], falla(fn() => AA::comprar($C, 'caja_materiales')));
$a0 = SO::vista($C)['sede']['aceleradores_min'];
AA::comprar($C, 'acel_15');
check('Acelerador 15 min: suma 15 minutos a la sede oficial', $a0 + 15, SO::vista($C)['sede']['aceleradores_min']);
AA::comprar($C, 'chip');
check('Chip 4K: 1 por día', [$m0['chips'] + 1, 409], [$mat($C)['chips'], falla(fn() => AA::comprar($C, 'chip'))[0]]);
$r = AA::comprar($C, 'insignia_solidaria');
check('Insignia cosmética: una vez en la vida', [['solidaria'], [409, 'ya_comprado']], [$r['insignias'], falla(fn() => AA::comprar($C, 'insignia_solidaria'))]);
$t = array_column($r['tienda'], null, 'id');
check('vista.tienda: usadas y agotado por artículo', [3, true, 1, true, 1, false], [$t['caja_materiales']['usadas'], $t['caja_materiales']['agotado'], $t['insignia_solidaria']['usadas'], $t['insignia_solidaria']['agotado'], $t['acel_15']['usadas'], $t['acel_15']['agotado']]);
$mas(86400);
check('Al día siguiente la caja vuelve a estar', 200, falla(fn() => AA::comprar($C, 'caja_materiales'))[0]);
check('Libro de fichas cuadra con el saldo (todas las cuentas)', [], array_values(array_filter(array_map(fn($f) => (int) $f['saldo'] === $fichasLibro((int) $f['jugador_id']) ? null : $f['jugador_id'], Db::todas('SELECT * FROM ayuda_asoc_fichas')))));
check('Auditoría: una línea por compra', 7, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'asoc_tienda'"));
check('Nada se paga con créditos: el libro de créditos no se tocó', 0, (int) Db::valor('SELECT COUNT(*) FROM movimientos_creditos'));

// =====================================================================
titulo('Salir de la asociación');
$oS = $obra($S[2]);
AA::pedir($S[2], $oS);
check('Socio 3 ve el pedido de Socio 2', true, in_array($oS, array_column(AA::pendientes($S[3]), 'obra_id'), true));
Social::salir($S[2]);
check('Socio 2 se va: su pedido ya no sale y se borra', [false, false], [in_array($oS, array_column(AA::vista($S[3])['pendientes'], 'obra_id'), true), (bool) Db::valor('SELECT 1 FROM ayuda_asoc_pedidos WHERE obra_id = ?', [$oS])]);
Social::unirse($S[2], $A);
Db::q('UPDATE asociacion_miembros SET desde = ? WHERE jugador_id = ?', [SO::ahora(), $S[2]]);   // entra "ahora" (reloj congelado)
check('Vuelve a entrar: otra vez 24 h de espera para ayudar', [409, 'miembro_nuevo'], falla(fn() => AA::ayudarTodos($S[2])));
check('Sus fichas no se pierden al salir', true, AA::fichas($S[2]) >= 0 && AA::fichas($S[2]) === $fichasLibro($S[2]));

// =====================================================================
titulo('Rutas por HTTP (copia de api.php con la línea de INTEGRAR_AYUDA_ASOC.md)');
SO::fijarReloj(null);
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$linea = "    if (class_exists(\\EnVivo\\AyudaAsocApi::class) && \\EnVivo\\AyudaAsocApi::esRuta(\$ruta)) \\EnVivo\\AyudaAsocApi::responder(\$ruta, \$metodo, requiere_sesion());\n";
$anc = "    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina\n";
$doc = (string) @file_get_contents(dirname(__DIR__) . '/INTEGRAR_AYUDA_ASOC.md');
check('INTEGRAR_AYUDA_ASOC.md trae la línea exacta de api.php', true, str_contains($doc, trim($linea)));
check('api.php tiene el lugar donde va la línea', true, str_contains($api, $anc));
if (!str_contains($api, trim($linea))) $api = str_replace($anc, $linea . $anc, $api);
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
$H1 = $nuevo('Dueña HTTP');
$H2 = $nuevo('Ayudante HTTP');
Social::crear($H1, ['nombre' => 'Asociación HTTP', 'siglas' => 'HTP', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
Social::unirse($H2, $asocDe($H1));
Db::q('UPDATE asociacion_miembros SET desde = desde - 2 * 86400 WHERE jugador_id IN (?, ?)', [$H1, $H2]);
$tok1 = $sesion($H1); $tok2 = $sesion($H2);
$oH = $obra($H1);
check('GET /api/asoc/ayuda sin sesión -> 401', 401, $http('GET', '/api/asoc/ayuda')[0]);
[$c, $j] = $http('GET', '/api/asoc/ayuda', null, $tok1);
check('GET /api/asoc/ayuda -> 200 con asociación, nivel, tope, investigación (3) y tienda (5)', [200, 1, 10, 3, 5], [$c, $j['asociacion']['nivel'] ?? null, $j['asociacion']['tope_ayudas'] ?? null, count($j['asociacion']['investigacion'] ?? []), count($j['tienda'] ?? [])]);
check('POST /api/asoc/ayuda/pedir sin X-Envivo -> 403', 403, $http('POST', '/api/asoc/ayuda/pedir', ['obra_id' => $oH], $tok1, false)[0]);
check('POST /api/asoc/ayuda/pedir con obra_id raro -> 400 datos_invalidos', [400, 'datos_invalidos'], (function () use ($http, $tok1) { [$c, $j] = $http('POST', '/api/asoc/ayuda/pedir', ['obra_id' => 'x'], $tok1); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('POST', '/api/asoc/ayuda/pedir', ['obra_id' => $oH], $tok1);
check('POST /api/asoc/ayuda/pedir -> 200, 1 pedida', [200, 1], [$c, $j['pedidas'] ?? null]);
[$c, $j] = $http('GET', '/api/asoc/ayuda/resumen', null, $tok2);
check('GET /api/asoc/ayuda/resumen (ayudante) -> 1 pendiente', [200, 1], [$c, $j['pendientes'] ?? null]);
[$c, $j] = $http('POST', '/api/asoc/ayuda/todos', [], $tok2);
check('POST /api/asoc/ayuda/todos -> 200, 1 ayudada, 1 ficha', [200, 1, 1], [$c, $j['ayudadas'] ?? null, $j['fichas_ganadas'] ?? null]);
check('POST /api/asoc/ayuda/todos otra vez -> 409 sin_pedidos', [409, 'sin_pedidos'], (function () use ($http, $tok2) { [$c, $j] = $http('POST', '/api/asoc/ayuda/todos', [], $tok2); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('POST', '/api/asoc/investigacion/donar', ['tech' => 'paga_eventos', 'tipo' => 'dinero', 'pagado_en_juego' => true], $tok2);
check('POST /api/asoc/investigacion/donar (dinero) -> 200, 10 puntos', [200, 10], [$c, $j['donacion']['puntos'] ?? null]);
check('POST donar con pagado_en_juego "true" (texto) -> 402 sin_pago', [402, 'sin_pago'], (function () use ($http, $tok2) { [$c, $j] = $http('POST', '/api/asoc/investigacion/donar', ['tech' => 'paga_eventos', 'tipo' => 'dinero', 'pagado_en_juego' => 'true'], $tok2); return [$c, $j['codigo'] ?? null]; })());
check('POST /api/asoc/tienda/comprar con 3 fichas (acel_15 cuesta 15) -> 409 sin_fichas', [409, 'sin_fichas', 3], (function () use ($http, $tok2) { [$c, $j] = $http('POST', '/api/asoc/tienda/comprar', ['item' => 'acel_15'], $tok2); return [$c, $j['codigo'] ?? null, $j['fichas'] ?? null]; })());
Db::q('UPDATE ayuda_asoc_fichas SET saldo = saldo + 12 WHERE jugador_id = ?', [$H2]);
[$c, $j] = $http('POST', '/api/asoc/tienda/comprar', ['item' => 'acel_15'], $tok2);
check('POST /api/asoc/tienda/comprar (acel_15) -> 200, quedan 0 fichas', [200, 0, 'acel_15'], [$c, $j['fichas'] ?? null, $j['compra']['item'] ?? null]);
check('GET /api/asoc/ayuda/todos -> 405', 405, $http('GET', '/api/asoc/ayuda/todos', null, $tok2)[0]);
check('POST /api/asoc/ayuda -> 405', 405, $http('POST', '/api/asoc/ayuda', [], $tok2)[0]);
check('GET /api/asoc/otra -> 404', 404, $http('GET', '/api/asoc/otra', null, $tok2)[0]);
check('Las demás rutas siguen (GET /api/sede/ayudas -> 200)', 200, $http('GET', '/api/sede/ayudas', null, $tok2)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nAyudas de asociación: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
