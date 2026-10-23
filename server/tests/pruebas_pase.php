<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Pase de Temporada (server/src/Pase.php y PaseApi.php):
// base SQLite TEMPORAL y el reloj del pase congelado: calendario de temporadas, XP idempotente y tope diario, misiones,
// niveles, premios gratis y premium, quien compra tarde, plus (+10 niveles), compras duplicadas, reversión, saltos con
// créditos (tope 10), cambio de temporada con 3 días de gracia y el tope de créditos devueltos. Al final, las rutas por
// HTTP con php -S y una COPIA de server/public/api.php con las líneas de server/INTEGRAR_PASE.md.
// Uso:  php server/tests/pruebas_pase.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_pase_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Db, Fallo, Monedero, Pase};

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
$Z = new DateTimeZone('America/Guayaquil');
$t = fn(string $f) => (new DateTimeImmutable($f, $Z))->getTimestamp();
$reloj = fn(int $x) => Pase::fijarReloj($x);

Db::pdo();
Pase::preparar();
$nuevo = function (string $alias, int $creditos = 0): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, 1, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '@prueba.example', $alias, 'x', time(), $alias, strtolower($alias)]);
    $j = Db::ultimoId();
    if ($creditos) Monedero::mover($j, $creditos, 'manual', 'prueba:inicial');
    return $j;
};
/** Sube a un jugador hasta $nivel (fuente interna "ajuste", sin tocar el tope diario ni las misiones). */
$subir = function (int $j, int $nivel): void {
    static $k = 0;
    $tn = Pase::actual()['numero'];
    $falta = $nivel * Pase::XP_NIVEL - Pase::xpTotal($j, $tn);
    if ($falta <= 0) return;
    $k++;
    Db::q("INSERT INTO pase_xp (jugador_id, temporada, fuente, ref, xp, dia, creado) VALUES (?, ?, 'ajuste', ?, ?, ?, ?)", [$j, $tn, 'ajuste:prueba:' . $k, $falta, Pase::dia(), Pase::ahora()]);
};
$compra = 9000;
$aprobar = function (int $j, string $prod) use (&$compra): int { $compra++; Pase::alAprobarCompra(['compra_id' => $compra, 'jugador_id' => $j, 'producto' => $prod, 'monto_usd' => 4.99, 'canal' => 'plux']); return $compra; };
$estadoDe = fn(array $e, string $pista, int $nivel) => current(array_filter($e['pistas'][$pista], fn($x) => $x['nivel'] === $nivel))['estado'] ?? null;

// =====================================================================
titulo('Temporadas: 28 días desde un lunes (America/Guayaquil), con tema y nombre');
$S1 = $t('2026-10-19 00:00:00');
$t1 = Pase::temporada(1); $t2 = Pase::temporada(2); $t3 = Pase::temporada(3);
check('Temporada 1 empieza el lunes 2026-10-19 00:00 (-05:00)', [$S1, '1'], [$t1['inicio'], (new DateTimeImmutable('@' . $t1['inicio']))->setTimezone($Z)->format('N')]);
check('Dura 28 días y la siguiente empieza otro lunes', [28 * 86400, '1', $t1['fin']], [$t1['fin'] - $t1['inicio'], (new DateTimeImmutable('@' . $t2['inicio']))->setTimezone($Z)->format('N'), $t2['inicio']]);
check('Domingo 23:59:59 es de la temporada 1; lunes 00:00 de la 2', [1, 2], [Pase::numeroEn($t2['inicio'] - 1), Pase::numeroEn($t2['inicio'])]);
check('Antes de la Temporada 1 no hay temporada', null, Pase::actual($S1 - 1));
check('Nombres con el tema del calendario (Halloween, Navidad, Fin de año)', ['Temporada 1 · Noche de Calaveras', 'Temporada 2 · Luces de Navidad', 'Temporada 3 · Año Nuevo en vivo'],
    [$t1['nombre'], $t2['nombre'], $t3['nombre']]);
check('Carnaval 2027 y Semana Santa 2027 (fechas móviles con la Pascua)', ['carnaval', 'pascua'], [Pase::temaDe(4), Pase::temaDe(6)]);
check('Pascua 2026 = 5 de abril y 2027 = 28 de marzo', [Pase::diaAbs(2026, 4, 5), Pase::diaAbs(2027, 3, 28)], [Pase::pascua(2026), Pase::pascua(2027)]);
check('Sin fecha especial: tema general (sin repetir el de la anterior)', [true, true], [in_array(Pase::temaDe(7), ['estadios', 'festivales', 'estrenos', 'conciertos'], true), Pase::temaDe(7) !== Pase::temaDe(8)]);
Ajustes::set('pase_epoca', '2026-10-21');   // miércoles: no vale
check('Ajuste pase_epoca que no es lunes -> se ignora', $S1, Pase::epoca());
Ajustes::set('pase_epoca', '2026-11-02');
check('Ajuste pase_epoca lunes -> manda', $t('2026-11-02 00:00:00'), Pase::epoca());
Ajustes::set('pase_epoca', '');

// =====================================================================
titulo('XP: idempotente por ref, solo fuentes de juego en línea, tope diario');
$reloj($t('2026-10-20 10:00:00'));
$A = $nuevo('Ana Live', 5000);
$r = Pase::sumarXp($A, Pase::XP['liga'], 'liga', 'intento:1');
check('Primer intento de liga validado: +40 XP', 40, $r['xp'] ?? null);
check('La misma ref otra vez no suma (null)', null, Pase::sumarXp($A, Pase::XP['liga'], 'liga', 'intento:1'));
check('XP total sigue en 40', 40, Pase::xpTotal($A, 1));
check('Fuente desconocida -> null y no anota', [null, 0], [Pase::sumarXp($A, 999, 'trampa', 'x:1'), (int) Db::valor("SELECT COUNT(*) FROM pase_xp WHERE fuente = 'trampa'")]);
check('Misma ref en otra fuente sí es otra (liga:7 y duelo:7)', [40, 40], [Pase::sumarXp($A, 40, 'duelo', '7')['xp'] ?? null, Pase::sumarXp($A, 40, 'liga', '7')['xp'] ?? null]);
// dentro de una transacción que después se deshace: no queda nada
try { Db::tx(function () use ($A) { Pase::sumarXp($A, 40, 'festival', 'tx:1'); throw new RuntimeException('falla después'); }); } catch (RuntimeException) {}
check('Dentro de una transacción que falla: se deshace con ella', 0, (int) Db::valor("SELECT COUNT(*) FROM pase_xp WHERE ref = 'festival:tx:1'"));
Db::tx(function () use ($A) { Pase::sumarXp($A, 30, 'festival', 'tx:2'); });
check('Dentro de una transacción que termina bien: queda (SAVEPOINT)', 1, (int) Db::valor("SELECT COUNT(*) FROM pase_xp WHERE ref = 'festival:tx:2'"));
$B = $nuevo('Beto Stream');
$dados = 0;
for ($k = 1; $k <= 30; $k++) $dados += (Pase::sumarXp($B, 60, 'desafio', 'tope:' . $k)['xp'] ?? 0);
check('Tope diario de XP de juego: ' . Pase::XP_TOPE_DIA, Pase::XP_TOPE_DIA, $dados);
check('Lo que pasa del tope se anota con 0 XP (cuenta para misiones)', 30, (int) Db::valor("SELECT COUNT(*) FROM pase_xp WHERE jugador_id = ? AND fuente = 'desafio'", [$B]));
$reloj($t('2026-10-21 10:00:00'));
check('Al otro día vuelve a sumar', 60, Pase::sumarXp($B, 60, 'desafio', 'tope:31')['xp'] ?? null);

// =====================================================================
titulo('Niveles y misiones');
check('400 XP por nivel: 399 -> 0, 400 -> 1, 16000 -> 40, 99999 -> 40', [0, 1, 40, 40], [Pase::nivel(399), Pase::nivel(400), Pase::nivel(16000), Pase::nivel(99999)]);
$reloj($t('2026-10-22 09:00:00'));
$C = $nuevo('Caro Producciones');
$m = Pase::estado($C)['misiones'];
check('3 misiones diarias y 3 semanales; siempre "Juega 3 eventos en línea" y "Registra tu equipo de copa"', [3, 3, 'd_eventos', 's_copa_equipo'],
    [count($m['diarias']), count($m['semanales']), $m['diarias'][0]['id'], $m['semanales'][1]['id']]);
$reloj($t('2026-10-23 09:00:00'));
$m2 = Pase::estado($C)['misiones'];
check('Las diarias rotan por fecha (sin azar)', true, array_column($m['diarias'], 'id') !== array_column($m2['diarias'], 'id'));
Pase::sumarXp($C, 40, 'liga', 'm:1'); Pase::sumarXp($C, 30, 'festival', 'm:2');
check('2 de 3 eventos: avance 2, sin XP de misión', [2, false, 70], [Pase::estado($C)['misiones']['diarias'][0]['avance'], Pase::estado($C)['misiones']['diarias'][0]['hecha'], Pase::xpTotal($C, 1)]);
$r = Pase::sumarXp($C, 40, 'duelo', 'm:3');
check('Tercer evento: misión cumplida (+150 XP) una sola vez', [['d_eventos'], 110 + 150, true], [$r['misiones'], Pase::xpTotal($C, 1), Pase::estado($C)['misiones']['diarias'][0]['hecha']]);
Pase::sumarXp($C, 40, 'duelo', 'm:4');
check('Un cuarto evento no la paga otra vez', 110 + 150 + 40, Pase::xpTotal($C, 1));
$r = Pase::sumarXp($C, Pase::XP['copa_equipo'], 'copa_equipo', 'copa:7');
check('Registrar el equipo de copa: misión semanal (+300) y su XP (+50)', [['s_copa_equipo'], 300 + 50 + 300], [$r['misiones'], Pase::xpTotal($C, 1)]);
check('Registrar otra vez en la misma copa no suma', null, Pase::sumarXp($C, 50, 'copa_equipo', 'copa:7'));
check('La semanal de 15 eventos lleva 4', 4, Pase::estado($C)['misiones']['semanales'][0]['avance']);
check('Obras de la asociación: fuente obra_ayuda acepta XP', 25, Pase::sumarXp($C, Pase::XP['obra_ayuda'], 'obra_ayuda', 'obra:1')['xp'] ?? null);

// =====================================================================
titulo('Premios gratis y premium');
$reloj($t('2026-10-24 12:00:00'));
$D = $nuevo('Dani TV');
$subir($D, 3);
$e = Pase::estado($D);
check('Nivel 3: gratis 1 y 3 disponibles; gratis 5 bloqueado; premium requiere premium', ['disponible', 'disponible', 'bloqueado', 'requiere_premium', 2],
    [$estadoDe($e, 'gratis', 1), $estadoDe($e, 'gratis', 3), $estadoDe($e, 'gratis', 5), $estadoDe($e, 'premium', 1), $e['por_reclamar']['total']]);
check('La pista gratis tiene 21 premios (la mitad + el cosmético final) y la premium 40', [21, 40], [count($e['pistas']['gratis']), count($e['pistas']['premium'])]);
check('…con los 3 premium que esperan', 3, $e['por_reclamar']['premium_esperando']);
$r = Pase::reclamar($D, 1, 'gratis');
check('Reclamar gratis nivel 1: entrega de $300 del juego', ['dinero', '-', 300, 'pase:1:1:gratis'], [$r['entregas'][0]['tipo'], $r['entregas'][0]['item'], $r['entregas'][0]['cantidad'], $r['entregas'][0]['origen']]);
check('…y le llega al juego por /api/estado (Monedero::entregas)', true, (bool) array_filter(Monedero::entregas($D), fn($x) => $x['id'] === $r['entregas'][0]['id']));
check('Otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => Pase::reclamar($D, 1, 'gratis')));
check('Nivel 2 gratis no tiene premio -> 404', [404, 'sin_recompensa'], falla(fn() => Pase::reclamar($D, 2, 'gratis')));
check('Nivel 5 todavía no -> 409 nivel_bloqueado', [409, 'nivel_bloqueado'], falla(fn() => Pase::reclamar($D, 5, 'gratis')));
check('Premium sin pase -> 403 premium_requerido', [403, 'premium_requerido'], falla(fn() => Pase::reclamar($D, 1, 'premium')));
check('Pista inventada -> 400', [400, 'pista_invalida'], falla(fn() => Pase::reclamar($D, 1, 'oro')));
check('Nivel 41 -> 400', [400, 'nivel_invalido'], falla(fn() => Pase::reclamar($D, 41, 'gratis')));
$r = Pase::reclamar($D, 3, 'gratis');
check('Gratis nivel 3: entrega de materiales de sede (tipo nuevo)', ['materiales', 'cables', 6], [$r['entregas'][0]['tipo'], $r['entregas'][0]['item'], $r['entregas'][0]['cantidad']]);
check('Premios del nivel 40: insignia (gratis) y título de chat (premium) con la temporada', ['pase_insignia_t1', 'insignia', 'pase_titulo_t1', 'titulo'],
    [Pase::recompensa(40, 'gratis', 1)['item'], Pase::recompensa(40, 'gratis', 1)['clase'], Pase::recompensa(40, 'premium', 1)['item'], Pase::recompensa(40, 'premium', 1)['clase']]);
check('Cosméticos exclusivos premium: marco (10) y adorno de sede (20)', ['pase_marco_t2', 'pase_deco_t2'], [Pase::recompensa(10, 'premium', 2)['item'], Pase::recompensa(20, 'premium', 2)['item']]);
check('Nivel 35 premium: contrato de personal estrella (5 partidos) si existe Estrellas; si no, materiales', Pase::hayEstrellas() ? ['estrella', 'comodin', 5] : ['materiales', 'chips', 8],
    [Pase::recompensa(35, 'premium', 1)['tipo'], Pase::recompensa(35, 'premium', 1)['item'], Pase::recompensa(35, 'premium', 1)['cantidad']]);
check('Aceleradores de obra en minutos (como la sede oficial): nivel 13 = 8 h', ['acelerador', 480, 'Aceleradores de obra: 8 h'],
    [Pase::recompensa(13, 'premium', 1)['tipo'], Pase::recompensa(13, 'premium', 1)['cantidad'], Pase::recompensa(13, 'premium', 1)['nombre']]);
check('Nombre visible del premio', 'Marco de productora «Noche de Calaveras»', Pase::recompensa(10, 'premium', 1)['nombre']);

// =====================================================================
titulo('Compra del premium (gancho compra_aprobada): quien compra tarde recibe los premios de los niveles que ya tiene');
$E = $nuevo('Eva Eventos');
$subir($E, 12);
check('Antes de comprar: puede comprar', [200, null], falla(fn() => Pase::exigirComprable($E, 'pase_premium')));
$c1 = $aprobar($E, 'pase_premium');
$e = Pase::estado($E);
check('Premium activo; nivel 12 sin cambios; los 12 premium disponibles', [true, false, 12, 12], [$e['premium'], $e['plus'], $e['nivel'], $e['por_reclamar']['premium']]);
Pase::alAprobarCompra(['compra_id' => $c1, 'jugador_id' => $E, 'producto' => 'pase_premium']);
check('El mismo aviso de compra otra vez no hace nada', 1, (int) Db::valor('SELECT COUNT(*) FROM pase_compras WHERE jugador_id = ?', [$E]));
Pase::alAprobarCompra(['compra_id' => 1, 'jugador_id' => $E, 'producto' => 'creditos_700']);
check('Otros productos no le tocan al pase', 1, (int) Db::valor('SELECT COUNT(*) FROM pase_compras WHERE jugador_id = ?', [$E]));
check('Ya premium: comprar otra vez -> 409 pase_ya_premium', [409, 'pase_ya_premium'], falla(fn() => Pase::exigirComprable($E, 'pase_premium')));
check('…y tampoco el plus', [409, 'pase_ya_premium'], falla(fn() => Pase::exigirComprable($E, 'pase_premium_plus')));
check('Un producto que no es del pase no se revisa aquí', [200, null], falla(fn() => Pase::exigirComprable($E, 'vip30')));
$saldo0 = Monedero::saldo($E);
$r = Pase::reclamarTodo($E);
$prem = array_filter($r['reclamados'], fn($x) => $x['pista'] === 'premium');
check('Reclamar todo: 12 premium + 6 gratis', [12, 6], [count($prem), count($r['reclamados']) - count($prem)]);
check('…con los créditos de los niveles 5 y 12 (40 + 50)', [90, $saldo0 + 90], [array_sum(array_column($r['reclamados'], 'creditos')), Monedero::saldo($E)]);
check('…y nada más por reclamar', 0, $r['pase']['por_reclamar']['total']);
check('Reclamar todo otra vez: nada nuevo', [], Pase::reclamarTodo($E)['reclamados']);
$c2 = $aprobar($E, 'pase_premium');
check('Segunda compra del premium en la misma temporada: queda "duplicada" con aviso y no da nada', ['duplicada', true],
    [Db::valor('SELECT estado FROM pase_compras WHERE compra_id = ?', [$c2]), (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'pase_duplicado' AND compra_id = ?", [$c2])]);

// =====================================================================
titulo('Plus: +10 niveles ya desbloqueados');
$F = $nuevo('Fer Plus', 1000);
$subir($F, 2);
$cp = $aprobar($F, 'pase_premium_plus');
$e = Pase::estado($F);
check('Plus: premium y plus; nivel 2 -> 12', [true, true, 12], [$e['premium'], $e['plus'], $e['nivel']]);
check('Los saltos de nivel siguen libres (el plus no cuenta)', [0, 10], [$e['saltos']['usados'], $e['saltos']['max_ahora']]);
$G = $nuevo('Gus Premium');
$cg = $aprobar($G, 'pase_premium');
$cg2 = $aprobar($G, 'pase_premium_plus');
check('Premium y después plus (llegó igual): da los 10 niveles una vez', [10, true, 'aplicada'], [Pase::estado($G)['nivel'], Pase::estado($G)['plus'], Db::valor('SELECT estado FROM pase_compras WHERE compra_id = ?', [$cg2])]);
$cg3 = $aprobar($G, 'pase_premium_plus');
check('Un segundo plus: duplicado', ['duplicada', 10], [Db::valor('SELECT estado FROM pase_compras WHERE compra_id = ?', [$cg3]), Pase::estado($G)['nivel']]);

// =====================================================================
titulo('Reversión (gancho compra_revertida)');
$saldo0 = Monedero::saldo($F);
$r = Pase::reclamarTodo($F);
$cred = array_sum(array_column($r['reclamados'], 'creditos'));
check('Fer reclama los premios hasta el 12 (créditos 40 + 50)', [true, 90], [count($r['reclamados']) > 12, $cred]);
Pase::alRevertirCompra(['compra_id' => $cp, 'jugador_id' => $F, 'motivo' => 'reembolso']);
$e = Pase::estado($F);
check('Sin premium ni plus; vuelve al nivel 2', [false, false, 2], [$e['premium'], $e['plus'], $e['nivel']]);
check('Los créditos del pase se descuentan', $saldo0 + 90 - 90, Monedero::saldo($F));
$rev = (int) Db::valor('SELECT COUNT(*) FROM pase_reclamos WHERE jugador_id = ? AND revisar = 1', [$F]);
$todos = (int) Db::valor('SELECT COUNT(*) FROM pase_reclamos WHERE jugador_id = ?', [$F]);
$sanos = (int) Db::valor("SELECT COUNT(*) FROM pase_reclamos WHERE jugador_id = ? AND revisar = 0 AND pista = 'gratis' AND nivel <= 2", [$F]);
check('Lo ya reclamado que dependía de la compra queda para revisión (los gratis de los niveles que sí tiene, no)', [$todos - 1, 1], [$rev, $sanos]);
check('…con un aviso para el administrador', true, (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'pase_revertido' AND compra_id = ?", [$cp]));
check('…y en el estado salen marcados', true, (bool) array_filter($e['pistas']['premium'], fn($x) => !empty($x['revisar'])));
check('Ya no puede reclamar premium -> 403', [403, 'premium_requerido'], falla(fn() => Pase::reclamar($F, 2, 'premium')));
$antes = Monedero::saldo($F);
Pase::alRevertirCompra(['compra_id' => $cp, 'jugador_id' => $F, 'motivo' => 'reembolso']);
check('Revertir otra vez no hace nada', $antes, Monedero::saldo($F));
check('Puede volver a comprar el premium', [200, null], falla(fn() => Pase::exigirComprable($F, 'pase_premium')));
// Gus: premium (compra A) + plus (compra B). Se revierte el plus: sigue premium, pierde los 10 niveles
Pase::alRevertirCompra(['compra_id' => $cg2, 'jugador_id' => $G, 'motivo' => 'contracargo']);
check('Gus: revertir solo el plus -> sigue premium, sin plus, nivel 0', [true, false, 0], [Pase::estado($G)['premium'], Pase::estado($G)['plus'], Pase::estado($G)['nivel']]);
Pase::alRevertirCompra(['compra_id' => $cg3, 'jugador_id' => $G, 'motivo' => 'reembolso']);
check('Revertir una compra duplicada no cambia nada', [true, 'revertida'], [Pase::estado($G)['premium'], Db::valor('SELECT estado FROM pase_compras WHERE compra_id = ?', [$cg3])]);
check('Libro de créditos: el saldo de cada jugador es la suma de sus movimientos', [],
    Db::todas('SELECT j.id FROM jugadores j WHERE j.creditos - j.deuda <> COALESCE((SELECT SUM(cambio) FROM movimientos_creditos m WHERE m.jugador_id = j.id), 0)'));

// =====================================================================
titulo('Saltos de nivel con créditos (precio por nivel, máximo 10 por temporada)');
$H = $nuevo('Hugo Saltos', 2000);
$r = Pase::saltar($H, 3);
check('Saltar 3 niveles: cuesta 3 × ' . Pase::SALTO_CREDITOS . ' y sube al 3', [2000 - 3 * Pase::SALTO_CREDITOS, 3, 3], [$r['creditos'], $r['pase']['nivel'], $r['pase']['saltos']['usados']]);
Pase::saltar($H, 7);
check('7 más: nivel 10, ya usó los 10', [10, 10, 0], [Pase::estado($H)['nivel'], Pase::estado($H)['saltos']['usados'], Pase::estado($H)['saltos']['max_ahora']]);
check('Uno más -> 409 saltos_tope', [409, 'saltos_tope'], falla(fn() => Pase::saltar($H, 1)));
check('Más de 10 de una vez -> 400', [400, 'niveles_invalidos'], falla(fn() => Pase::saltar($H, 11)));
$I = $nuevo('Inés Pobre', 100);
check('Sin créditos suficientes -> 402 sin_creditos (y no se anota nada)', [[402, 'sin_creditos'], 0, 100], [falla(fn() => Pase::saltar($I, 1)), Pase::estado($I)['saltos']['usados'], Monedero::saldo($I)]);
$J = $nuevo('Juan Max', 5000);
$subir($J, 35);
check('En el nivel 35 solo se pueden saltar 5 -> 6 da 409 nivel_max', [[409, 'nivel_max'], 5], [falla(fn() => Pase::saltar($J, 6)), Pase::estado($J)['saltos']['max_ahora']]);
Ajustes::set('pase_salto_creditos', '200');
check('El precio sale del ajuste pase_salto_creditos', [200, 5000 - 200], [Pase::estado($J)['saltos']['precio'], Pase::saltar($J, 1)['creditos']]);
Ajustes::set('pase_salto_creditos', '');

// =====================================================================
titulo('Tope de créditos devueltos (~60 % del precio en créditos)');
check('La pista premium devuelve ' . Pase::CREDITOS_TOPE . ' créditos por temporada (≤ 60 % de 700, lo que dan $4,99)', [true, true], [Pase::creditosTabla() <= Pase::CREDITOS_TOPE, Pase::CREDITOS_TOPE <= (int) floor(700 * 0.6)]);
$K = $nuevo('Kari Tope');
$aprobar($K, 'pase_premium');
$subir($K, 40);
Ajustes::set('pase_creditos_tope', '100');
$r = Pase::reclamarTodo($K);
check('Con el tope en 100: los créditos reclamados suman 100 aunque la tabla dé ' . Pase::creditosTabla(), [100, 100, 100], [array_sum(array_column($r['reclamados'], 'creditos')), Monedero::saldo($K), $r['pase']['creditos_dados']]);
check('Todos los 61 premios reclamados (21 gratis + 40 premium)', 61, count($r['reclamados']));
Ajustes::set('pase_creditos_tope', '');
$L = $nuevo('Lu Completa');
$aprobar($L, 'pase_premium');
$subir($L, 40);
check('Sin ajuste: una temporada completa devuelve exactamente ' . Pase::CREDITOS_TOPE, Pase::CREDITOS_TOPE, array_sum(array_column(Pase::reclamarTodo($L)['reclamados'], 'creditos')));
if (Pase::hayEstrellas()) {
    $eid = (int) Db::valor("SELECT entrega_id FROM pase_reclamos WHERE jugador_id = ? AND nivel = 35 AND pista = 'premium'", [$L]);
    check('El nivel 35 crea el contrato estrella una vez (Estrellas::otorgar, ref de la entrega)', [1, 0],
        [(int) Db::valor('SELECT COUNT(*) FROM estrellas_contratos WHERE jugador_id = ? AND ref = ?', [$L, 'otorgar:entrega:' . $eid]), \EnVivo\Estrellas::reclamarEntregas($L)]);
}

// =====================================================================
titulo('Cambio de temporada: 3 días de gracia para reclamar lo pendiente; después se pierde');
$M = $nuevo('Mati Gracia', 1000);
$reloj($t('2026-11-14 18:00:00'));
$aprobar($M, 'pase_premium');
$subir($M, 6);
Pase::reclamar($M, 1, 'gratis');
$reloj($t('2026-11-16 00:00:00'));
$e = Pase::estado($M);
check('Lunes 2026-11-16: Temporada 2 con nivel 0 y sin premium (el premium es por temporada)', [2, 0, false], [$e['temporada']['numero'], $e['nivel'], $e['premium']]);
check('La anterior sale con lo que falta por reclamar (2 gratis + 6 premium) y la fecha de la gracia', [1, 8, $t('2026-11-19 00:00:00')],
    [$e['anterior']['temporada']['numero'] ?? null, $e['anterior']['por_reclamar']['total'] ?? null, isset($e['anterior']['gracia_hasta']) ? strtotime($e['anterior']['gracia_hasta']) : null]);
$r = Pase::reclamar($M, 3, 'gratis', 1);
check('Reclamar de la temporada 1 durante la gracia (con "temporada": 1)', [1, 3, 'pase:1:3:gratis'], [$r['reclamado']['temporada'], $r['reclamado']['nivel'], $r['entregas'][0]['origen']]);
$x = Pase::sumarXp($M, 40, 'liga', 't2');
check('XP nueva va a la temporada 2', [40, 2, 40], [$x['xp'] ?? null, (int) Db::valor('SELECT temporada FROM pase_xp WHERE ref = ?', ['liga:t2']), Pase::xpTotal($M, 2)]);
$reloj($t('2026-11-18 23:59:00'));
$r = Pase::reclamarTodo($M);
check('Reclamar todo en el último minuto de la gracia incluye la anterior (1 gratis + 6 premium)', 7, count(array_filter($r['reclamados'], fn($x) => $x['temporada'] === 1)));
$N = $nuevo('Nico Tarde');
$reloj($t('2026-11-15 20:00:00'));
$subir($N, 3);
$reloj($t('2026-11-19 00:00:00'));
check('Pasada la gracia: 410 gracia_terminada', [410, 'gracia_terminada'], falla(fn() => Pase::reclamar($N, 1, 'gratis', 1)));
check('…y la anterior ya no sale en el estado', null, Pase::estado($N)['anterior']);
check('Reclamar todo ya no toma nada de la temporada 1', [], array_values(array_filter(Pase::reclamarTodo($N)['reclamados'], fn($x) => $x['temporada'] === 1)));
check('Una temporada que no existe -> 400', [400, 'temporada_invalida'], falla(fn() => Pase::reclamar($N, 1, 'gratis', 9)));
$reloj($S1 - 3600);
$e = Pase::estado($N);
check('Antes de la Temporada 1: sin temporada y con la próxima', [null, 1], [$e['temporada'], $e['proxima']['numero']]);
check('…sumarXp no anota nada y reclamar da 409 sin_temporada', [null, [409, 'sin_temporada']], [Pase::sumarXp($N, 40, 'liga', 'antes'), falla(fn() => Pase::reclamarTodo($N))]);

// =====================================================================
titulo('Ganchos (si ya existe server/src/Ganchos.php)');
$reloj($t('2026-11-20 10:00:00'));
if (class_exists(\EnVivo\Ganchos::class)) {
    Pase::registrar();
    $O = $nuevo('Olga Ganchos');
    \EnVivo\Ganchos::emitir('compra_aprobada', ['compra_id' => 777001, 'jugador_id' => $O, 'producto' => 'pase_premium_plus', 'monto_usd' => 9.99, 'canal' => 'google']);
    check('Ganchos::emitir compra_aprobada -> premium plus (nivel 10)', [true, 10], [Pase::estado($O)['premium'], Pase::estado($O)['nivel']]);
    \EnVivo\Ganchos::emitir('compra_revertida', ['compra_id' => 777001, 'jugador_id' => $O, 'motivo' => 'prueba']);
    check('Ganchos::emitir compra_revertida -> sin premium (nivel 0)', [false, 0], [Pase::estado($O)['premium'], Pase::estado($O)['nivel']]);
} else {
    echo "  AVISO: todavía no hay Ganchos.php: se probaron los métodos del gancho directamente\n";
    Pase::registrar();
    check('Pase::registrar() sin Ganchos no falla', true, true);
}
$Q = $nuevo('Quique Suspendido');
Db::q("UPDATE jugadores SET estado = 'suspendido' WHERE id = ?", [$Q]);
check('Cuenta suspendida: no reclama ni salta', [[403, 'cuenta_suspendida'], [403, 'cuenta_suspendida']], [falla(fn() => Pase::reclamarTodo($Q)), falla(fn() => Pase::saltar($Q, 1))]);

// =====================================================================
titulo('Rutas por HTTP (php -S con una copia de api.php y las líneas de INTEGRAR_PASE.md)');
Pase::fijarReloj(null);   // el servidor usa la hora real: la Temporada 1 empieza el lunes de esta semana
Ajustes::set('pase_epoca', (new DateTimeImmutable('monday this week', $Z))->format('Y-m-d'));
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$guia = (string) file_get_contents(dirname(__DIR__) . '/INTEGRAR_PASE.md');
preg_match('/<!-- api\.php -->\s*```php\s*(.+?)```/s', $guia, $lineaApi);
$lineaApi = trim($lineaApi[1] ?? '');
check('INTEGRAR_PASE.md trae la línea de api.php', true, str_contains($lineaApi, 'PaseApi::esRuta'));
$ancla = "    // Copa de Servidores (server/INTEGRAR_COPAS.md): /api/copa*\n";
$yaIntegrado = str_contains($api, 'PaseApi::esRuta');
check('api.php ya tiene la línea, o tiene el lugar donde va', true, $yaIntegrado || str_contains($api, $ancla));
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ";\n\\EnVivo\\Pase::registrar();", $api);
if (!$yaIntegrado) $api = str_replace($ancla, '    ' . $lineaApi . "\n" . $ancla, $api);
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
$tempHoy = Pase::actual();
$P = $nuevo('Pablo Http', 1000);
if ($tempHoy) {
    for ($k = 1; $k <= 4; $k++) Db::q("INSERT INTO pase_xp (jugador_id, temporada, fuente, ref, xp, dia, creado) VALUES (?, ?, 'ajuste', ?, 400, ?, ?)", [$P, $tempHoy['numero'], 'ajuste:http' . $k, Pase::dia(), time()]);
}
$tok = $sesion($P);
check('GET /api/estado sigue igual con la línea nueva', [200, true], (function () use ($http) { [$c, $j] = $http('GET', '/api/estado'); return [$c, isset($j['tienda'])]; })());
check('GET /api/pase sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], (function () use ($http) { [$c, $j] = $http('GET', '/api/pase'); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('GET', '/api/pase', null, $tok);
check('GET /api/pase -> 200 con temporada, nivel 4, las dos pistas y misiones', [200, true, 4, 21, 40, 3, 3],
    [$c, isset($j['temporada']['nombre']), $j['nivel'] ?? null, count($j['pistas']['gratis'] ?? []), count($j['pistas']['premium'] ?? []), count($j['misiones']['diarias'] ?? []), count($j['misiones']['semanales'] ?? [])]);
check('…con productos y precios del pase', [4.99, 9.99], [$j['productos']['pase_premium']['precio'] ?? null, $j['productos']['pase_premium_plus']['precio'] ?? null]);
check('POST /api/pase/reclamar sin X-Envivo -> 403', 403, $http('POST', '/api/pase/reclamar', ['nivel' => 1, 'pista' => 'gratis'], $tok, false)[0]);
[$c, $j] = $http('POST', '/api/pase/reclamar', ['nivel' => 1, 'pista' => 'gratis'], $tok);
check('POST /api/pase/reclamar nivel 1 gratis -> 200 con la entrega', [200, 'dinero', 'reclamado'], [$c, $j['entregas'][0]['tipo'] ?? null, $j['pase']['pistas']['gratis'][0]['estado'] ?? null]);
[$c, $j] = $http('POST', '/api/pase/reclamar', ['nivel' => 1, 'pista' => 'gratis'], $tok);
check('Otra vez -> 409 con codigo ya_reclamado y texto', [409, 'ya_reclamado', false, true], [$c, $j['codigo'] ?? null, $j['ok'] ?? null, is_string($j['error'] ?? null)]);
check('Premium sin pase -> 403 premium_requerido', [403, 'premium_requerido'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/pase/reclamar', ['nivel' => 2, 'pista' => 'premium'], $tok); return [$c, $j['codigo'] ?? null]; })());
check('Sin "nivel" -> 400 falta_nivel', [400, 'falta_nivel'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/pase/reclamar', ['pista' => 'gratis'], $tok); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('POST', '/api/pase/reclamar_todo', [], $tok);
check('POST /api/pase/reclamar_todo -> 200 (nivel 3 gratis)', [200, [3]], [$c, array_column($j['reclamados'] ?? [], 'nivel')]);
[$c, $j] = $http('POST', '/api/pase/saltar', ['niveles' => 2], $tok);
check('POST /api/pase/saltar 2 -> 200, nivel 6 y créditos descontados', [200, 6, 1000 - 2 * Pase::SALTO_CREDITOS], [$c, $j['pase']['nivel'] ?? null, $j['creditos'] ?? null]);
check('POST /api/pase/saltar 50 -> 400 niveles_invalidos', [400, 'niveles_invalidos'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/pase/saltar', ['niveles' => 50], $tok); return [$c, $j['codigo'] ?? null]; })());
check('GET /api/pase/reclamar -> 405', 405, $http('GET', '/api/pase/reclamar', null, $tok)[0]);
check('POST /api/pase -> 405', 405, $http('POST', '/api/pase', [], $tok)[0]);
check('GET /api/pase/otra -> 404', 404, $http('GET', '/api/pase/otra', null, $tok)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nPase de Temporada: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
