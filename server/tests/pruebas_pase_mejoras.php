<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Mejoras del Pase de Temporada (rama pase-mejoras, server/INTEGRAR_PASE.md
// "Mejoras"): Mini Pase Semanal (qué cubre, qué no, uno por semana, duplicadas, reversión, premium después), misiones de
// jugar con otros (asociación) con alternativa sin conexión, ponerse al día (doble XP), banco de premios después del
// nivel 40 (cofres fijos), tema visual e ícono de sede del nivel 40, producto nuevo en el catálogo.
// Base SQLite TEMPORAL y reloj del pase congelado.  Uso:  php server/tests/pruebas_pase_mejoras.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_pasem_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Catalogo, Compras, Db, Fallo, Monedero, Pase, PaseApi};

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
/** Pone al jugador en $xp de la temporada actual (fuente interna "ajuste": no toca tope ni misiones ni "ponerse al día"). */
$fijarXp = function (int $j, int $xp): void {
    static $k = 0;
    $tn = Pase::actual()['numero'];
    $falta = $xp - Pase::xpTotal($j, $tn);
    if ($falta === 0) return;
    $k++;
    Db::q("INSERT INTO pase_xp (jugador_id, temporada, fuente, ref, xp, dia, creado) VALUES (?, ?, 'ajuste', ?, ?, ?, ?)", [$j, $tn, 'ajuste:pm:' . $k, $falta, Pase::dia(), Pase::ahora()]);
};
$subir = fn(int $j, int $nivel) => $fijarXp($j, max(Pase::xpTotal($j, Pase::actual()['numero']), $nivel * Pase::XP_NIVEL));
$compra = 7000;
$aprobar = function (int $j, string $prod) use (&$compra): int { $compra++; Pase::alAprobarCompra(['compra_id' => $compra, 'jugador_id' => $j, 'producto' => $prod, 'monto_usd' => 1.49, 'canal' => 'google']); return $compra; };
$celda = fn(array $e, string $pista, int $nivel) => current(array_filter($e['pistas'][$pista], fn($x) => $x['nivel'] === $nivel)) ?: null;
$estadoDe = fn(array $e, string $pista, int $nivel) => $celda($e, $pista, $nivel)['estado'] ?? null;
$avisos = fn(string $tipo) => (int) Db::valor('SELECT COUNT(*) FROM avisos WHERE tipo = ?', [$tipo]);

// =====================================================================
titulo('Catálogo: producto nuevo pase_semanal (Mini Pase Semanal)');
$p = Catalogo::producto('pase_semanal');
check('Existe, tipo pase (pantalla propia), $1,49, no es de una sola vez', ['pase', 1.49, false, true], [$p['tipo'] ?? null, $p['precio'] ?? null, $p['una_vez'] ?? null, $p['activo'] ?? null]);
check('No sale en la lista general de la tienda', false, in_array('pase_semanal', array_column(Catalogo::tienda()['productos'] ?? Catalogo::tienda(), 'id'), true));
check('Google Play lo vende con el mismo id', true, Catalogo::productoGoogle('pase_semanal') !== null);
check('El detalle dice lo que NO da (sin sorpresas)', true, str_contains($p['detalle'], 'No da créditos, cosméticos ni personal estrella'));
check('Ruta nueva /api/pase/banco', true, PaseApi::esRuta('/pase/banco'));
check('Gancho en AyudaAsoc::donar (XP de asociación)', true, str_contains(file_get_contents(dirname(__DIR__) . '/src/AyudaAsoc.php'), "Pase::sumarXp(\$j, Pase::XP['asoc_donar'], 'asoc_donar'"));

// =====================================================================
titulo('Mini Pase Semanal: cubre hasta 8 niveles que subas esa semana, sin créditos ni cosméticos ni estrella');
$reloj($t('2026-10-27 10:00:00'));   // temporada 1, semana 2 (26 oct a 2 nov)
$M = $nuevo('Mini Mara');
$subir($M, 3);
check('Antes de la temporada no se puede (sin_temporada)', [409, 'sin_temporada'], (function () use ($M, $t, $reloj) { $reloj($t('2026-10-01 10:00:00')); $r = falla(fn() => Pase::exigirComprable($M, 'pase_semanal')); $reloj($t('2026-10-27 10:00:00')); return $r; })());
check('Se puede comprar (Compras::exigirComprable lo manda a Pase)', [200, null], falla(fn() => Pase::exigirComprable($M, 'pase_semanal')));
$e = Pase::estado($M);
check('Estado: semana 2, puede comprar, producto con precio', [2, true, false, 1.49, true], [$e['mini']['semana'], $e['mini']['puede_comprar'], $e['mini']['activo'], $e['productos']['pase_semanal']['precio'], $e['productos']['pase_semanal']['mini']]);
$c1 = $aprobar($M, 'pase_semanal');
$e = Pase::estado($M);
check('Aprobado: activo, desde el nivel 3 hasta el 11, termina el lunes 2 nov', [true, 3, 11, false, Db::iso($t('2026-11-02 00:00:00'))], [$e['mini']['activo'], $e['mini']['nivel_desde'], $e['mini']['nivel_hasta'], $e['mini']['puede_comprar'], $e['mini']['semana_fin']]);
check('No es premium (el Mini no da el pase completo)', false, $e['premium']);
check('Los niveles que ya tenías (1 a 3) NO se desbloquean', ['requiere_premium', 'requiere_premium'], [$estadoDe($e, 'premium', 1), $estadoDe($e, 'premium', 3)]);
check('Otro Mini esta semana -> 409 mini_ya_activo', [409, 'mini_ya_activo'], falla(fn() => Pase::exigirComprable($M, 'pase_semanal')));
check('El premium sigue disponible para comprar (subir al completo)', [200, null], falla(fn() => Pase::exigirComprable($M, 'pase_premium')));
$subir($M, 6);
$e = Pase::estado($M);
check('Sube al 6: premium 4 (dinero) y 6 (paneles) disponibles con el Mini; 5 (créditos) no', ['disponible', true, 'requiere_premium', true, 'disponible'],
    [$estadoDe($e, 'premium', 4), $celda($e, 'premium', 4)['mini'] ?? false, $estadoDe($e, 'premium', 5), $celda($e, 'premium', 5)['solo_premium'] ?? false, $estadoDe($e, 'premium', 6)]);
$r = Pase::reclamar($M, 4, 'premium');
check('Reclamar premium 4 con el Mini: $800 del juego', ['dinero', 800, 1], [$r['entregas'][0]['tipo'], $r['entregas'][0]['cantidad'], (int) Db::valor('SELECT COUNT(*) FROM pase_mini_usos WHERE jugador_id = ?', [$M])]);
check('Premium 5 (créditos) con el Mini -> 403 premium_requerido', [403, 'premium_requerido'], falla(fn() => Pase::reclamar($M, 5, 'premium')));
$subir($M, 20);
$e = Pase::estado($M);
check('Sube al 20: cubre solo hasta el 11 (8 niveles; en la lista solo los que el Mini da); 13 (acelerador) requiere premium', ['disponible', 'requiere_premium', [4, 6, 7, 8, 9, 11]],
    [$estadoDe($e, 'premium', 11), $estadoDe($e, 'premium', 13), $e['mini']['niveles']]);
check('Nivel 10 premium es un cosmético: solo premium', ['requiere_premium', true], [$estadoDe($e, 'premium', 10), $celda($e, 'premium', 10)['solo_premium'] ?? false]);
$c2 = $aprobar($M, 'pase_semanal');
check('Si llega otro pago del Mini la misma semana: duplicada y aviso (no se entrega)', ['duplicada', 1], [Db::valor('SELECT estado FROM pase_mini WHERE compra_id = ?', [$c2]), $avisos('pase_duplicado')]);
$aprobar($M, 'pase_semanal'); Pase::alAprobarCompra(['compra_id' => $c1, 'jugador_id' => $M, 'producto' => 'pase_semanal']);
check('El mismo compra_id dos veces no hace nada', 1, (int) Db::valor('SELECT COUNT(*) FROM pase_mini WHERE compra_id = ?', [$c1]));
$reloj($t('2026-11-03 10:00:00'));   // semana 3
$subir($M, 24);
$e = Pase::estado($M);
check('Semana siguiente: lo cubierto sigue reclamable, pero no cubre niveles nuevos sin otro Mini', [[4, 6, 7, 8, 9, 11], true, false], [$e['mini']['niveles'], $e['mini']['puede_comprar'], $e['mini']['activo']]);
$r = Pase::reclamarTodo($M);
$prem = array_column(array_filter($r['reclamados'], fn($x) => $x['pista'] === 'premium'), 'nivel');
sort($prem);
check('Reclamar todo: los premium cubiertos que el Mini permite (6, 7, 8, 9, 11), nada de créditos', [[6, 7, 8, 9, 11], 0], [$prem, array_sum(array_column($r['reclamados'], 'creditos'))]);
check('Nuevo Mini en la semana 3: desde el nivel 24', [200, null], falla(fn() => Pase::exigirComprable($M, 'pase_semanal')));
$c3 = $aprobar($M, 'pase_semanal');
$subir($M, 27);
check('…cubre 26 y 27 (el 25 da créditos) además de los de antes', [4, 6, 7, 8, 9, 11, 26, 27], Pase::estado($M)['mini']['niveles']);
check('Cuatro Mini (4 × $1,49 = $5,96) cuestan más que el premium ($4,99)', true, 4 * Pase::MINI_PRECIO > Pase::PRODUCTOS['pase_premium']['precio']);
$sinMini = array_filter(range(1, 40), fn($n) => !Pase::miniPermite($n));
check('El Mini nunca da créditos, cosméticos ni estrella (niveles 5,10,12,18,20,25,30,32,34,35,38,40 fuera)', [5, 10, 12, 18, 20, 25, 30, 32, 34, 35, 38, 40], array_values($sinMini));

titulo('Mini Pase: reversión');
Pase::alRevertirCompra(['compra_id' => $c1]);
$e = Pase::estado($M);
check('Revertido el primero: lo reclamado con él queda en revisión y ya no cubre 4 a 11', [true, 'requiere_premium', [26, 27]],
    [(bool) (int) Db::valor("SELECT revisar FROM pase_reclamos WHERE jugador_id = ? AND nivel = 4 AND pista = 'premium'", [$M]), $estadoDe($e, 'premium', 4) === 'reclamado' ? 'requiere_premium' : $estadoDe($e, 'premium', 4), $e['mini']['niveles']]);
check('…con aviso para el dueño (sin descontar créditos: el Mini no da)', 1, $avisos('pase_revertido'));
Pase::alRevertirCompra(['compra_id' => $c1]);
check('Revertir otra vez no hace nada', 1, $avisos('pase_revertido'));

titulo('Mini y después el premium');
$reloj($t('2026-10-28 09:00:00'));
$N = $nuevo('Nico Mini', 0);
$subir($N, 2);
$cm = $aprobar($N, 'pase_semanal');
$subir($N, 9);
Pase::reclamar($N, 6, 'premium');
check('Con el Mini reclamó el premium 6', 'reclamado', $estadoDe(Pase::estado($N), 'premium', 6));
$cp = $aprobar($N, 'pase_premium');
$e = Pase::estado($N);
check('Compra el premium: todo el premium disponible (también los créditos del 5) y el Mini ya no se ofrece', ['disponible', 'disponible', false, false],
    [$estadoDe($e, 'premium', 5), $estadoDe($e, 'premium', 1), $e['mini']['puede_comprar'], $e['mini']['activo']]);
check('Con premium, comprar un Mini -> 409 pase_ya_premium', [409, 'pase_ya_premium'], falla(fn() => Pase::exigirComprable($N, 'pase_semanal')));
Pase::reclamar($N, 5, 'premium');
Pase::alRevertirCompra(['compra_id' => $cp]);
check('Revertir el premium: el 5 (con premium) a revisión; el 6 (lo sostiene el Mini) no', [1, 0],
    [(int) Db::valor("SELECT revisar FROM pase_reclamos WHERE jugador_id = ? AND nivel = 5 AND pista = 'premium'", [$N]), (int) Db::valor("SELECT revisar FROM pase_reclamos WHERE jugador_id = ? AND nivel = 6 AND pista = 'premium'", [$N])]);

// =====================================================================
titulo('Misiones de jugar con otros (asociación) y alternativa sin conexión');
check('Misiones nuevas: diarias d_asoc y d_juntos, semanales s_asoc y s_juntos', [true, true, true, true],
    [isset(Pase::MISIONES_DIA['d_asoc']), isset(Pase::MISIONES_DIA['d_juntos']), isset(Pase::MISIONES_SEMANA['s_asoc']), isset(Pase::MISIONES_SEMANA['s_juntos'])]);
// un día en que rota "Dona 1 vez a la investigación de tu asociación"
$dia = null;
for ($d = 0; $d < 28 && $dia === null; $d++) { $x = $t('2026-10-19 12:00:00') + $d * 86400; if (in_array('d_asoc', Pase::misionesActivas(Pase::actual($x), $x)['dia']['ids'], true)) $dia = $x; }
check('La de asociación rota algún día de la temporada (sin azar)', true, $dia !== null);
$reloj($dia);
$Q = $nuevo('Quique Asoc');
$r = Pase::sumarXp($Q, Pase::XP['asoc_donar'], 'asoc_donar', 'donacion:1');
check('Donar a la investigación: +20 XP y cumple "Dona 1 vez" (+100)', [20, true], [$r['xp'] ?? null, in_array('d_asoc', $r['misiones'] ?? [], true)]);
$m = array_column(Pase::estado($Q)['misiones']['diarias'], null, 'id');
check('Estado de la misión: hecha en línea', [true, 'en_linea'], [$m['d_asoc']['hecha'], $m['d_asoc']['via']]);

$reloj($t('2026-11-17 10:00:00'));   // temporada 2, día 2 (empieza a tiempo: XP normal)
$S = $nuevo('Sofi Sin Red');
$act = Pase::misionesActivas(Pase::actual());
$diarias = $act['dia']['ids'];
$e = Pase::estado($S);
check('Cada misión trae su alternativa sin conexión (2 misiones del juego, la mitad de XP)', [2, intdiv(Pase::MISIONES_DIA['d_eventos']['xp'], 2), 0],
    [$e['misiones']['diarias'][0]['alt']['n'], $e['misiones']['diarias'][0]['alt']['xp'], $e['misiones']['diarias'][0]['alt']['avance']]);
Pase::sumarXp($S, 15, 'misiones', 'd:2026-11-17:eventos');
check('1 misión del juego: todavía nada', 15, Pase::xpTotal($S, 2));
$r = Pase::sumarXp($S, 15, 'misiones', 'd:2026-11-17:reparar');
$altXp = array_sum(array_map(fn($id) => intdiv(Pase::MISIONES_DIA[$id]['xp'], 2), $diarias));
check('2 misiones del juego: las 3 diarias del pase cumplidas sin conexión (mitad de XP)', [$diarias, 30 + $altXp], [$r['misiones'], Pase::xpTotal($S, 2)]);
$m = Pase::estado($S)['misiones']['diarias'][0];
check('…y se ven como hechas sin conexión', [true, 'sin_conexion'], [$m['hecha'], $m['via']]);
Pase::sumarXp($S, 15, 'misiones', 'd:2026-11-17:contratar');
check('Una tercera misión del juego no paga otra vez', 45 + $altXp, Pase::xpTotal($S, 2));
Pase::sumarXp($S, 40, 'liga', 'a:1'); Pase::sumarXp($S, 40, 'liga', 'a:2');
$antes = Pase::xpTotal($S, 2);
$r = Pase::sumarXp($S, 40, 'liga', 'a:3');
check('Después la juega en línea (3 eventos): recibe la otra mitad de "Juega 3 eventos" (+75), nunca el doble', true, in_array('d_eventos', $r['misiones'], true));
check('…XP = 40 del evento + 75 que faltaban (+ otras misiones de liga del día si rotan)', true, Pase::xpTotal($S, 2) - $antes >= 40 + 75
    && (int) Db::valor("SELECT SUM(xp) FROM pase_xp WHERE jugador_id = ? AND ref LIKE ?", [$S, 'mision:2:%:d_eventos%']) === Pase::MISIONES_DIA['d_eventos']['xp']);
check('La misión ahora figura hecha en línea', 'en_linea', Pase::estado($S)['misiones']['diarias'][0]['via']);
for ($k = 0; $k < 4; $k++) Pase::sumarXp($S, 15, 'misiones', 's:2026-11-16:k' . $k);
$sem = array_column(Pase::estado($S)['misiones']['semanales'], null, 'id');
check('Semanales: con 6 misiones del juego en la semana se cumplen sin conexión', true, $sem['s_eventos']['hecha'] && $sem['s_eventos']['via'] === 'sin_conexion');

// =====================================================================
titulo('Ponerse al día: empezar desde el día 8 da doble XP de juego por 3 días');
$reloj($t('2026-10-21 10:00:00'));   // día 3
$A = $nuevo('Ana A Tiempo');
check('Empieza a tiempo (día 3): XP normal', [60, 'no'], [Pase::sumarXp($A, 60, 'desafio', 'x:1')['xp'] ?? null, Pase::estado($A)['al_dia']['estado']]);
$reloj($t('2026-10-27 08:00:00'));   // día 9
$L = $nuevo('Leo Llega Tarde');
check('Llega tarde y todavía no juega: "disponible"', ['disponible', true, 2], [Pase::estado($L)['al_dia']['estado'], Pase::estado($L)['al_dia']['activo'], Pase::estado($L)['al_dia']['factor']]);
check('Primera partida: XP doble (60 -> 120)', 120, Pase::sumarXp($L, 60, 'desafio', 'y:1')['xp'] ?? null);
$e = Pase::estado($L);
check('Activo hasta 3 días después de su primera partida', ['activo', Db::iso($t('2026-10-30 08:00:00'))], [$e['al_dia']['estado'], $e['al_dia']['hasta']]);
$dados = 120;
for ($k = 2; $k <= 40; $k++) $dados += (Pase::sumarXp($L, 60, 'desafio', 'y:' . $k)['xp'] ?? 0);
check('El tope del día también se duplica (1.400)', 2 * Pase::XP_TOPE_DIA, $dados);
check('Los saltos/ajustes no cuentan como "empezar"', 'no', (function () use ($nuevo, $fijarXp) { $j = $nuevo('Ajuste Solo'); $fijarXp($j, 400); return Pase::estado($j)['al_dia']['estado'] === 'disponible' ? 'no' : 'si'; })());
$reloj($t('2026-10-30 08:00:01'));
check('Al cuarto día vuelve a lo normal', [60, 'terminado'], [Pase::sumarXp($L, 60, 'desafio', 'z:1')['xp'] ?? null, Pase::estado($L)['al_dia']['estado']]);
check('…y quien empezó a tiempo nunca lo tuvo', 60, Pase::sumarXp($A, 60, 'desafio', 'x:2')['xp'] ?? null);

// =====================================================================
titulo('Banco de premios: después del nivel 40, un cofre FIJO cada 2.000 XP');
$reloj($t('2026-11-05 10:00:00'));
$B = $nuevo('Bea Banco');
$fijarXp($B, 39 * 400);
check('Antes del nivel 40: banco inactivo; abrir -> 409 banco_vacio', [false, [409, 'banco_vacio']], [Pase::estado($B)['banco']['activo'], falla(fn() => Pase::abrirBanco($B))]);
$fijarXp($B, 16000 + 4100);
$e = Pase::estado($B);
check('16.000 + 4.100 XP: 2 cofres por abrir, faltan 1.900 para el siguiente; cuentan en "por reclamar"', [true, 2, 1900, 2],
    [$e['banco']['activo'], $e['banco']['por_abrir'], $e['banco']['xp_siguiente'], $e['por_reclamar']['banco']]);
check('El contenido se ve antes de abrir (fijo): $1.000, 6 cables, 6 placas, 2 baterías', ['$1.000 para tu productora', '6 × Cables y conectores', '6 × Placas electrónicas', '2 baterías'], array_column($e['banco']['contenido'], 'nombre'));
check('…y lo que suma el premium (6 paneles y 1 chip 4K)', 6, count($e['banco']['contenido_premium']));
$r = Pase::abrirBanco($B);
check('Abrir: 2 cofres con 4 entregas cada uno, exactamente lo mostrado', [2, 8, $e['banco']['contenido']], [count($r['cofres']), count($r['entregas']), $r['cofres'][0]['contenido']]);
check('Sin cofres nuevos -> 409 banco_vacio', [409, 'banco_vacio'], falla(fn() => Pase::abrirBanco($B)));
$fijarXp($B, 16000 + 99999);
check('Tope de 10 cofres por temporada', [10, 8], [Pase::estado($B)['banco']['ganados'], Pase::estado($B)['banco']['por_abrir']]);
$r = Pase::reclamarTodo($B);
check('"Reclamar todo" también abre los cofres', 8, count($r['cofres']));
$P = $nuevo('Pepe Premium');
$aprobar($P, 'pase_premium');
$fijarXp($P, 18000);
$r = Pase::abrirBanco($P);
check('Con premium el cofre trae 6 cosas (también lo fijo de más)', [true, 6], [$r['cofres'][0]['premium'], count($r['entregas'])]);
$X = $nuevo('Xavi Plus');
$cx = $aprobar($X, 'pase_premium_plus');   // +10 niveles = 4.000 XP
$fijarXp($X, 18100);
Pase::abrirBanco($X);
Pase::alRevertirCompra(['compra_id' => $cx]);
check('Revertir el plus (−4.000 XP): el cofre abierto con esa XP queda en revisión', 1, (int) Db::valor('SELECT revisar FROM pase_banco WHERE jugador_id = ? AND n = 1', [$X]));

// =====================================================================
titulo('Tema visual por temporada e ícono exclusivo de sede en el nivel 40');
$e = Pase::estado($B);
check('El estado trae colores y adornos del tema', [true, true], [count($e['temporada']['visual']['colores']) === 2, $e['temporada']['visual']['adornos'] !== '']);
$tf = null;
for ($n = 1; $n <= 14; $n++) if (Pase::temaDe($n) === 'copa_femenina') $tf = $n;
$tc = $tf ? Pase::temporada($tf) : null;
check('Una temporada de junio-julio 2027 es la "Copa Global Femenina" (nombre inventado)', ['Copa Global Femenina', '2027'], [$tc['nombre_tema'] ?? null, $tc ? date('Y', $tc['inicio']) : null]);
check('Navidad tiene sus colores y adornos', '❄️🎁⭐', Pase::temporada(2)['visual']['adornos']);
$r40 = Pase::recompensa(40, 'premium', 2);
check('Nivel 40 premium: ícono exclusivo de sede con el tema', ['cosmetico', 'sede', 'pase_sede_t2_navidad', 'Ícono exclusivo de sede «Luces de Navidad»'], [$r40['tipo'], $r40['clase'], $r40['item'], $r40['nombre']]);
check('Los créditos de la pista premium siguen sumando el tope (420)', Pase::CREDITOS_TOPE, Pase::creditosTabla());
check('Todos los temas tienen colores y adornos', [], array_keys(array_filter(Pase::TEMAS, fn($x) => empty($x['colores']) || empty($x['adornos']))));

echo "\n----------------------------------------\nMejoras del Pase: $OK correctas · $FALLAS fallas\n";
if (!getenv('GUARDAR_TMP')) { @array_map('unlink', glob($TMP . '/datos/*') ?: []); @rmdir($TMP . '/datos'); @unlink($TMP . '/config.env'); @rmdir($TMP); }
exit($FALLAS ? 1 : 0);
