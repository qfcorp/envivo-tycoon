<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Sede oficial (server/src/SedeOficial.php + SedeApi.php):
// base SQLite TEMPORAL, reloj congelado, reglas iguales a js/sede.js, obras con reloj real, acelerar con créditos (libro de
// Monedero), ayudas de la asociación (topes y premio), migración con tope, bonoCompetencia, entrega diaria una vez por
// día de Guayaquil, packs con contenido fijo, entregas de materiales y premioIntento. Al final, las rutas por HTTP con
// una COPIA de server/public/api.php con la línea de server/INTEGRAR_SEDE_OFICIAL.md (php -S).
// Uso:  php server/tests/pruebas_sede_oficial.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_sede_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Compras, Db, Fallo, Migraciones, Monedero, SedeOficial as SO, Social};

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
function fallo(callable $f): ?Fallo { try { $f(); return null; } catch (Fallo $e) { return $e; } }

Db::pdo();
$T0 = (new DateTimeImmutable('2026-10-23 10:00:00', new DateTimeZone('America/Guayaquil')))->getTimestamp();
SO::fijarReloj($T0);
$mas = function (int $s) { SO::fijarReloj(SO::ahora() + $s); };

$n = 0;
$nuevo = function (string $alias, int $fama = 0, int $edadDias = 30) use (&$n, $T0): int {
    $n++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        ['sede' . $n . '@prueba.example', $alias, 'x', $T0 - $edadDias * 86400, $alias, strtolower($alias) . $n, $fama]);
    return Db::ultimoId();
};
$mat = fn(int $j) => SO::vista($j)['sede']['materiales'];
$dar = function (int $j, array $bolsa) { SO::sincronizar($j); foreach ($bolsa as $k => $v) Db::q("UPDATE sede_oficial SET $k = $k + ? WHERE jugador_id = ?", [$v, $j]); };
$nivel = function (int $j, int $n) { SO::sincronizar($j); Db::q('UPDATE sede_oficial SET nivel = ? WHERE jugador_id = ?', [$n, $j]); };
$mucho = ['cables' => 5000, 'placas' => 5000, 'paneles' => 5000, 'credenciales' => 5000, 'planos' => 5000, 'chips' => 500];
$libroOk = fn(int $j) => (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ?', [$j]) === Monedero::saldo($j);

// =====================================================================
titulo('Tablas y migración');
$tablas = Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sede_%' ORDER BY name");
check('Tablas sede_* creadas solas al abrir la base', ['sede_ayudas', 'sede_fuentes', 'sede_libro', 'sede_mejoras', 'sede_obras', 'sede_oficial', 'sede_packs'], array_column($tablas, 'name'));
check('sede_oficial.sql se puede aplicar otra vez sin error', [], Migraciones::aplicar('sede_oficial.sql'));

// =====================================================================
titulo('Reglas iguales a js/sede.js (costos, edificios, días)');
$NODE = trim((string) shell_exec('command -v node 2>/dev/null'));
if ($NODE === '') echo "  AVISO: sin node: se salta la comparación con js/sede.js\n";
else {
    $js = 'const S=require(process.argv[1]);const o={};for(let L=2;L<=30;L++){o[L]={eds:S.edificiosDe(L),c:{}};S.edificiosDe(L).concat(["sede"]).forEach(e=>{const c=S.costo(L,e);o[L].c[e]={mat:c.mat,dias:c.dias};});}process.stdout.write(JSON.stringify(o));';
    $out = shell_exec(escapeshellarg($NODE) . ' -e ' . escapeshellarg($js) . ' ' . escapeshellarg(dirname(__DIR__, 2) . '/js/sede.js') . ' 2>/dev/null');
    $J = json_decode((string) $out, true);
    $dif = [];
    for ($L = 2; $L <= 30; $L++) {
        if (($J[$L]['eds'] ?? null) !== SO::edificiosDe($L)) $dif[] = "edificios $L";
        foreach (array_merge(SO::edificiosDe($L), ['sede']) as $e) {
            $c = SO::costo($L, $e);
            $jm = $J[$L]['c'][$e]['mat'] ?? []; ksort($jm); $pm = $c['mat']; ksort($pm);
            if ($jm !== $pm || ($J[$L]['c'][$e]['dias'] ?? null) !== $c['dias']) $dif[] = "$L.$e";
        }
    }
    check('Los 29 niveles: mismos edificios, materiales y días que js/sede.js', [], $dif);
}
check('Horas por día del juego: 2 h en el nivel 2, 24 h en el 30', [2.0, 24.0], [SO::horasDia(2), SO::horasDia(30)]);
check('Duración de una mejora del nivel 2 (1 día) = 2 h; sede principal del nivel 30 (6 días) = 144 h', [7200, 144 * 3600], [SO::costo(2, 'control')['segundos'], SO::costo(30, 'sede')['segundos']]);
check('Requisito de fama: nivel 3 = 6, 8 = 22, 13 = 32, 30 = 55', [6, 22, 32, 55], [SO::requisitoFama(3), SO::requisitoFama(8), SO::requisitoFama(13), SO::requisitoFama(30)]);

// =====================================================================
titulo('Obras con reloj real (mejoras, sede principal, segundo equipo de obra)');
$A = $nuevo('Obrera A', 40);
$v = SO::vista($A);
check('Sede nueva: nivel 1, 1 equipo de obra, etapa al nivel 2 con 4 mejoras', [1, 1, 2, 4], [$v['sede']['nivel'], $v['sede']['obreros'], $v['sede']['etapa']['objetivo'], count($v['sede']['etapa']['mejoras'])]);
$eds2 = SO::edificiosDe(2);
check('Mejorar sin materiales -> 409 faltan_materiales (con lo que falta)', [409, 'faltan_materiales', true], (function () use ($A, $eds2) { $e = fallo(fn() => SO::mejorar($A, $eds2[0])); return [$e?->getCode(), $e?->extra['codigo'] ?? null, !empty($e?->extra['falta'])]; })());
check('Edificio que no es del nivel -> 400 edificio_invalido', [400, 'edificio_invalido'], falla(fn() => SO::mejorar($A, 'escuela')));
$dar($A, $mucho);
$antes = $mat($A);
$v = SO::mejorar($A, $eds2[0]);
$c = SO::costo(2, $eds2[0]);
$o = $v['sede']['obras'][0];
check('Mejorar: obra de 2 h (7.200 s) con fin = ahora + duración', [7200, $T0 + 7200, 7200], [$o['duracion'], $o['fin'], $o['restante']]);
check('…y descuenta los materiales de js/sede.js', true, (function () use ($antes, $v, $c) { foreach ($c['mat'] as $m => $q) if ($v['sede']['materiales'][$m] !== $antes[$m] - $q) return false; return true; })());
check('…con libro de materiales (motivo obra)', count($c['mat']), (int) Db::valor("SELECT COUNT(*) FROM sede_libro WHERE jugador_id = ? AND motivo = 'obra'", [$A]));
check('Segunda obra con 1 equipo -> 409 sin_obrero', [409, 'sin_obrero'], falla(fn() => SO::mejorar($A, $eds2[1])));
check('La misma otra vez -> 409 en_obra', [409, 'en_obra'], falla(fn() => SO::mejorar($A, $eds2[0])));
$mas(7199);
check('A los 7.199 s sigue en obra (1 s)', [1, 1], [count(SO::vista($A)['sede']['obras']), SO::vista($A)['sede']['obras'][0]['restante']]);
$mas(1);
$v = SO::vista($A);
check('A los 7.200 s terminó sola: mejora lista, equipo libre', [0, true], [count($v['sede']['obras']), $v['sede']['etapa']['mejoras'][0]['hecha']]);
check('Subir sin todas las mejoras -> 409 faltan_mejoras', [409, 'faltan_mejoras'], falla(fn() => SO::subir($A)));
foreach (array_slice($eds2, 1) as $ed) { SO::mejorar($A, $ed); $mas(7200); }
$v = SO::subir($A);
$o = $v['sede']['obras'][0];
check('Sede principal → nivel 2: obra tipo nivel de 2 días (4 h)', ['nivel', 2, 14400], [$o['tipo'], $o['nivel'], $o['duracion']]);
$mas(14400);
check('Terminó: nivel 2', 2, SO::vista($A)['sede']['nivel']);
// Requisito de fama (nivel 3 pide fama 6)
$B = $nuevo('Sin Fama', 0);
$dar($B, $mucho);
$nivel($B, 2);
foreach (SO::edificiosDe(3) as $ed) Db::q("INSERT INTO sede_mejoras (jugador_id, nivel, ed, terminado) VALUES (?, 3, ?, 0)", [$B, $ed]);
check('Nivel 3 con fama 0 (pide 6) -> 409 requisito', [409, 'requisito'], falla(fn() => SO::subir($B)));
check('…la vista muestra el requisito sin cumplir', [['k' => 'req_fama', 'p' => ['n' => 6], 'ok' => false]], SO::vista($B)['sede']['etapa']['sede']['req']);
Db::q('UPDATE jugadores SET fama_publica = 6 WHERE id = ?', [$B]);
check('Con fama 6 sí sube', 200, falla(fn() => SO::subir($B))[0]);
// Segundo equipo de obra desde el nivel 5
Db::q('UPDATE sede_oficial SET nivel = 5 WHERE jugador_id = ?', [$A]);
Db::q('DELETE FROM sede_obras WHERE jugador_id = ?', [$A]);
$e6 = SO::edificiosDe(6);
SO::mejorar($A, $e6[0]);
$v = SO::mejorar($A, $e6[1]);
check('Nivel 5: 2 equipos de obra, 2 obras a la vez', [2, 2], [$v['sede']['obreros'], count($v['sede']['obras'])]);
check('La tercera -> 409 sin_obrero', [409, 'sin_obrero'], falla(fn() => SO::mejorar($A, $e6[2])));

// =====================================================================
titulo('Acelerar con créditos (costo antes de confirmar, libro de Monedero)');
check('Costo: 1 crédito cada 6 minutos, mínimo 5', [5, 5, 10, 20, 240, 1440], [SO::costoAcelerar(1), SO::costoAcelerar(1800), SO::costoAcelerar(3600), SO::costoAcelerar(7200), SO::costoAcelerar(86400), SO::costoAcelerar(6 * 86400)]);
$v = SO::vista($A);
$ob = $v['sede']['obras'][0];
$costo = $ob['costo_creditos'];
check('La vista trae el costo de cada obra (para mostrarlo antes)', SO::costoAcelerar($ob['restante']), $costo);
check('Sin confirmar_costo -> 400 confirmar_costo (con el costo)', [400, 'confirmar_costo', $costo], (function () use ($A, $ob) { $e = fallo(fn() => SO::acelerar($A, $ob['id'], null)); return [$e?->getCode(), $e?->extra['codigo'] ?? null, $e?->extra['costo'] ?? null]; })());
check('Confirmando menos de lo que cuesta -> 409 costo_cambio', [409, 'costo_cambio'], falla(fn() => SO::acelerar($A, $ob['id'], $costo - 1)));
check('Sin créditos -> 402 sin_creditos', [402, 'sin_creditos'], falla(fn() => SO::acelerar($A, $ob['id'], $costo)));
check('Obra de otro -> 404 obra_no_existe', [404, 'obra_no_existe'], falla(fn() => SO::acelerar($B, $ob['id'], 999)));
Monedero::mover($A, 1000, 'compra', 'prueba');
$mas(600);   // pasan 10 minutos: el costo baja
$costo2 = SO::costoAcelerar($ob['fin'] - SO::ahora());
$r = SO::acelerar($A, $ob['id'], $costo);   // confirmó el costo de antes (más alto): se cobra el de ahora
check('Acelerar: cobra el costo de ahora (bajó) y la obra termina ya', [$costo2, 1000 - $costo2, 1], [$r['costo'], $r['creditos'], count($r['sede']['obras'])]);
check('…la mejora quedó lista', true, (bool) Db::valor('SELECT 1 FROM sede_mejoras WHERE jugador_id = ? AND nivel = 6 AND ed = ?', [$A, $e6[0]]));
check('…movimiento sede_acelerar en el libro de créditos', [-$costo2, 'sede_obra:' . $ob['id']], (function () use ($A) { $m = Db::fila("SELECT * FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'sede_acelerar'", [$A]); return [(int) $m['cambio'], $m['ref']]; })());
check('…y la suma del libro sigue igual al saldo', true, $libroOk($A));
check('Acelerar una obra terminada -> 409 ya_terminada', [409, 'ya_terminada'], falla(fn() => SO::acelerar($A, $ob['id'], 999)));
check('Sin aceleradores guardados -> 409 sin_aceleradores', [409, 'sin_aceleradores'], falla(fn() => SO::acelerar($A, $v['sede']['obras'][1]['id'], null, 'aceleradores')));

// =====================================================================
titulo('Packs con dinero real (contenido fijo) y aceleradores');
$P = $nuevo('Compradora', 30);
check('entregarPack pack_obra_s: true y contenido fijo', true, SO::entregarPack($P, 9001, 'pack_obra_s'));
$v = SO::vista($P);
check('…materiales exactos del pack S y 600 min de aceleradores', [SO::PACKS['pack_obra_s']['mat'], 600], [$v['sede']['materiales'], $v['sede']['aceleradores_min']]);
check('La misma compra otra vez no entrega nada', false, SO::entregarPack($P, 9001, 'pack_obra_s'));
check('Producto que no es pack -> false', false, SO::entregarPack($P, 9002, 'creditos_250'));
check('detallePack muestra todo el contenido', 'Sede oficial: 10 h de aceleradores de obra + 12 cables, 12 placas, 12 paneles LED, 12 credenciales, 12 planos y 1 chip 4K. Contenido fijo.', SO::detallePack('pack_obra_s'));
// Usar aceleradores en una obra
$e2 = SO::edificiosDe(2);
$dar($P, $mucho);
$v = SO::mejorar($P, $e2[0]);
$r = SO::acelerar($P, $v['sede']['obras'][0]['id'], null, 'aceleradores');
check('Aceleradores: usa solo los minutos que faltan (120 de 600) y termina la obra', [120, 480, 0], [$r['minutos'], $r['sede']['aceleradores_min'], count($r['sede']['obras'])]);
// Compra de verdad (Compras) sin gancho: la sede la concilia
$cm = Db::tx(fn() => Compras::insertar($P, ['id' => 'pack_obra_m', 'precio' => 4.99, 'creditos' => 0, 'bono_pct' => 0], 'web_plux'));
Compras::aprobar((int) $cm['id'], 'prueba');
$antes = SO::vista($P)['sede'];
check('Compra pagada de pack_obra_m sin gancho: la vista la entrega (conciliación)', true, (bool) Db::valor('SELECT 1 FROM sede_packs WHERE compra_id = ? AND entregado IS NOT NULL', [$cm['id']]));
$antes2 = SO::vista($P)['sede'];
check('…una sola vez', $antes['materiales'], $antes2['materiales']);
Compras::revertir((int) $cm['id'], 'reembolso', 'prueba', 'prueba');
$desp = SO::vista($P)['sede'];
$esp = []; foreach ($antes['materiales'] as $k => $q) $esp[$k] = $q - SO::PACKS['pack_obra_m']['mat'][$k];
check('Reembolso: se quita lo que dio el pack', [$esp, $antes['aceleradores_min'] - 1800], [$desp['materiales'], $desp['aceleradores_min']]);
check('Oyentes del gancho: alCompraAprobada entrega y alCompraRevertida quita', [true, 12, 0], (function () use ($nuevo) {
    $q = $nuevo('Gancho');
    SO::alCompraAprobada(['compra_id' => 9100, 'jugador_id' => $q, 'producto' => 'pack_obra_s', 'monto_usd' => 1.99, 'canal' => 'plux']);
    $a = SO::vista($q)['sede']['materiales']['cables'];
    SO::alCompraRevertida(['compra_id' => 9100, 'jugador_id' => $q, 'motivo' => 'reembolso']);
    return [(bool) Db::valor('SELECT 1 FROM sede_packs WHERE compra_id = 9100'), $a, SO::vista($q)['sede']['materiales']['cables']];
})());
if (class_exists(\EnVivo\Ganchos::class) && method_exists(\EnVivo\Ganchos::class, 'emitir')) {
    SO::registrar();
    $q = $nuevo('Gancho real');
    \EnVivo\Ganchos::emitir('compra_aprobada', ['compra_id' => 9200, 'jugador_id' => $q, 'producto' => 'pack_obra_l', 'monto_usd' => 9.99, 'canal' => 'plux']);
    check('Ganchos::emitir(compra_aprobada) entrega el pack L', 70, SO::vista($q)['sede']['materiales']['planos']);
} else echo "  AVISO: Ganchos.php todavía no existe: se probaron los oyentes directo\n";

// =====================================================================
titulo('Entregas de materiales (Copa, regalos de asociación)');
$E = $nuevo('Campeona');
Monedero::entregar($E, 'materiales', 'chips', 2, 'copa:1:campeon');
Monedero::entregar($E, 'materiales', 'paneles', 4, 'copa:1:campeon');
Monedero::entregar($E, 'acelerador', 'obra', 90, 'pase:1:2');   // formato del Pase: item 'obra', cantidad = minutos
Monedero::entregar($E, 'materiales', 'oro', 99, 'copa:1:campeon');   // material desconocido: se ignora
$v = SO::vista($E)['sede'];
check('Entregas tipo materiales y acelerador entran a la sede oficial (desconocido se ignora)', [2, 4, 90, 0], [$v['materiales']['chips'], $v['materiales']['paneles'], $v['aceleradores_min'], $v['materiales']['cables']]);
check('…una sola vez', [2, 90], (function () use ($E) { $v = SO::vista($E)['sede']; return [$v['materiales']['chips'], $v['aceleradores_min']]; })());

// =====================================================================
titulo('Entrega diaria: una vez por día real de Guayaquil');
$C = $nuevo('Diaria', 10);
$nivel($C, 1);
SO::fijarReloj((new DateTimeImmutable('2026-10-23 23:59:00', new DateTimeZone('America/Guayaquil')))->getTimestamp());
$r = SO::cofre($C);
check('Entrega: floor(4 + 0,55 × nivel) = 4 materiales comunes al nivel 1', 4, array_sum($r['bolsa']));
check('…la mitad va al que más falta para el nivel', true, max($r['bolsa']) >= 2);
check('…libro motivo cofre y la vista dice que ya no está disponible', [true, false], [(bool) Db::valor("SELECT 1 FROM sede_libro WHERE jugador_id = ? AND motivo = 'cofre'", [$C]), $r['sede']['cofre']['disponible']]);
check('Otra vez el mismo día -> 409 cofre_ya', [409, 'cofre_ya'], falla(fn() => SO::cofre($C)));
check('El próximo es a la medianoche de Guayaquil (05:00 UTC)', '2026-10-24T05:00:00Z', gmdate('Y-m-d\TH:i:s\Z', $r['sede']['cofre']['proximo']));
$mas(59);   // 23:59:59
check('A las 23:59:59 todavía no', [409, 'cofre_ya'], falla(fn() => SO::cofre($C)));
$mas(1);    // 00:00:00 del 24
check('A las 00:00 del día siguiente sí', 200, falla(fn() => SO::cofre($C))[0]);
Db::q('UPDATE sede_oficial SET nivel = 20 WHERE jugador_id = ?', [$C]);
$mas(86400);
$r = SO::cofre($C);
check('Nivel 20: 15 comunes (+ quizá 1 chip)', [15, true], [array_sum(array_diff_key($r['bolsa'], ['chips' => 1])), ($r['bolsa']['chips'] ?? 0) <= 1]);
SO::fijarReloj($T0 + 10 * 86400);

// =====================================================================
titulo('Ayudas de la asociación (topes y premio para el que ayuda)');
$dueno = $nuevo('Dueña Obra', 40);
$soc = [];
Social::crear($dueno, ['nombre' => 'Asociación Sede', 'siglas' => 'SDE', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
$asoc = (int) Db::valor('SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?', [$dueno]);
for ($k = 1; $k <= 12; $k++) { $soc[$k] = $nuevo('Socia ' . $k); Social::unirse($soc[$k], $asoc); }
Db::q('UPDATE asociacion_miembros SET desde = ?', [$T0]);   // más de 24 h en la asociación (AyudaAsoc: anti cuentas alternas)
$fuera = $nuevo('De Afuera');
$otra = $nuevo('Otra Asoc');
Social::crear($otra, ['nombre' => 'Asociación Otra', 'siglas' => 'OTR', 'color' => '#00ff00', 'pagado_en_juego' => true]);
$dar($dueno, $mucho);
$nivel($dueno, 19);
$v = SO::mejorar($dueno, SO::edificiosDe(20)[0]);
$ob = $v['sede']['obras'][0];
$segA = SO::segundosAyuda($ob['duracion']);
check('Obra del nivel 20: 4 días; cada ayuda descuenta 1 % (más de 5 min)', [max(300, (int) ceil($ob['duracion'] * 0.01)), true], [$segA, $segA > 300]);
check('Ayuda chica: 5 minutos como mínimo', 300, SO::segundosAyuda(7200));
$l = SO::ayudas($soc[1]);
check('GET ayudas: la socia ve la obra de la dueña con su nombre', [1, $ob['id'], 'Dueña Obra', $segA], [count($l['obras']), $l['obras'][0]['obra_id'] ?? null, $l['obras'][0]['nombre'] ?? null, $l['obras'][0]['segundos_ayuda'] ?? null]);
check('La dueña no ve su propia obra', 0, count(SO::ayudas($dueno)['obras']));
check('Ayudarse a sí misma -> 409 misma_cuenta', [409, 'misma_cuenta'], falla(fn() => SO::ayudar($dueno, $dueno, $ob['id'])));
check('Sin asociación -> 409 sin_asociacion', [409, 'sin_asociacion'], falla(fn() => SO::ayudar($fuera, $dueno, $ob['id'])));
check('De otra asociación -> 403 otra_asociacion', [403, 'otra_asociacion'], falla(fn() => SO::ayudar($otra, $dueno, $ob['id'])));
$antes = array_sum($mat($soc[1]));
$r = SO::ayudar($soc[1], $dueno, $ob['id']);
check('Ayudar: descuenta 1 % del tiempo y la socia recibe 1 material', [$segA, 1, $antes + 1], [$r['segundos'], array_sum($r['premio'] ?? []), array_sum($mat($soc[1]))]);
check('…la obra baja su fin y suma 1 ayuda', [$ob['fin'] - $segA, 1], (function () use ($ob) { $o = Db::fila('SELECT fin, ayudas FROM sede_obras WHERE id = ?', [$ob['id']]); return [(int) $o['fin'], (int) $o['ayudas']]; })());
check('…y ya no le aparece en su lista', 0, count($r['lista']['obras']));
if (class_exists(\EnVivo\Pase::class) && Migraciones::columnas('pase_xp') !== null) {
    check('Pase de temporada: la ayuda suma XP obra_ayuda (ref obra:<id>)', [\EnVivo\Pase::XP['obra_ayuda']], array_map('intval', array_column(Db::todas("SELECT xp FROM pase_xp WHERE jugador_id = ? AND fuente = 'obra_ayuda' AND ref = ?", [$soc[1], 'obra_ayuda:obra:' . $ob['id']]), 'xp')));
} else echo "  AVISO: sin Pase.php: se salta el XP del pase\n";
check('Ayudar dos veces la misma obra -> 409 ya_ayudaste', [409, 'ya_ayudaste'], falla(fn() => SO::ayudar($soc[1], $dueno, $ob['id'])));
for ($k = 2; $k <= 10; $k++) SO::ayudar($soc[$k], $dueno, $ob['id']);
check('10 ayudas en la obra', 10, (int) Db::valor('SELECT ayudas FROM sede_obras WHERE id = ?', [$ob['id']]));
check('La ayuda 11 -> 409 ayudas_completas', [409, 'ayudas_completas'], falla(fn() => SO::ayudar($soc[11], $dueno, $ob['id'])));
check('…y la obra ya no sale en la lista de la socia 11', 0, count(SO::ayudas($soc[11])['obras']));
check('La obra terminó 10 × 1 % antes', $ob['fin'] - 10 * $segA, (int) Db::valor('SELECT fin FROM sede_obras WHERE id = ?', [$ob['id']]));
// Topes por día del que ayuda: 10 con premio y 30 en total (obras de prueba de los demás socios)
$ins = function (int $j) { Db::q("INSERT INTO sede_obras (jugador_id, tipo, ed, nivel, inicio, duracion, fin) VALUES (?, 'mejora', 'control', 2, ?, 7200, ?)", [$j, SO::ahora(), SO::ahora() + 7200]); return Db::ultimoId(); };
$ayudante = $soc[12];
$premios = 0; $ok = 0;
foreach (range(1, 31) as $i) {
    $dj = $soc[($i % 11) + 1];
    $oid = $ins($dj);
    try { $r = SO::ayudar($ayudante, $dj, $oid); $ok++; if ($r['premio']) $premios++; }
    catch (Fallo $e) { $ultimo = $e->extra['codigo'] ?? null; }
}
check('Un ayudante: 30 ayudas por día, solo las 10 primeras con premio, la 31 -> tope_ayudas_dia', [30, 10, 'tope_ayudas_dia'], [$ok, $premios, $ultimo ?? null]);
check('GET ayudas muestra los contadores del día', ['ayudas' => 30, 'max' => 30, 'premios' => 10, 'premios_max' => 10], SO::ayudas($ayudante)['hoy']);
$mas(86400);
check('Al día siguiente vuelve a poder ayudar', 200, falla(fn() => SO::ayudar($ayudante, $soc[1], $ins($soc[1])))[0]);
// Una obra corta que termina con las ayudas
$oid = $ins($soc[2]);
Db::q('UPDATE sede_obras SET fin = ? WHERE id = ?', [SO::ahora() + 200, $oid]);
$r = SO::ayudar($soc[3], $soc[2], $oid);
check('Si falta menos que la ayuda, descuenta lo que falta y la obra termina', [200, 'terminada'], [$r['segundos'], Db::valor('SELECT estado FROM sede_obras WHERE id = ?', [$oid])]);

// =====================================================================
titulo('Migración de la sede local (con tope)');
check('Tope por cuenta: nueva sin fama = 2; 3 días y fama 30 = 8; 1 día y fama 30 = 4; 30 días y fama 12 = 5', [2, 8, 4, 5],
    [SO::nivelMaxMigracion(0, 0), SO::nivelMaxMigracion(3, 30), SO::nivelMaxMigracion(1, 30), SO::nivelMaxMigracion(30, 12)]);
$M = $nuevo('Recien Llegada', 0, 0);
$v = SO::vista($M);
check('La vista ofrece migrar (sede sin usar) con su nivel máximo', ['posible' => true, 'nivel_max' => 2], $v['sede']['migracion']);
$r = SO::migrar($M, ['nivel' => 15, 'mejoras' => ['16.control' => 1], 'materiales' => ['cables' => 9999, 'chips' => 50, 'placas' => -5], 'obras' => []]);
check('Save falso de nivel 15 en una cuenta nueva: queda en nivel 2, recortado', [2, true, 2], [$r['sede']['nivel'], $r['recortado'], $r['tope']]);
check('…materiales con tope (cables ≤ 40 + 20 × nivel, chips ≤ nivel/2; negativos fuera)', ['cables' => 80, 'chips' => 1], $r['aceptado']['materiales']);
check('…las mejoras de los niveles hasta el 2 quedan hechas (origen migracion)', count(SO::edificiosDe(2)), (int) Db::valor("SELECT COUNT(*) FROM sede_mejoras WHERE jugador_id = ? AND origen = 'migracion'", [$M]));
check('…ya no ofrece migrar; segunda vez -> 409 ya_migrado', [false, 409, 'ya_migrado'], array_merge([$r['sede']['migracion']['posible']], falla(fn() => SO::migrar($M, ['nivel' => 2]))));
$M2 = $nuevo('Veterana', 30, 60);
$loc = ['nivel' => 6, 'mejoras' => ['7.control' => 1, '7.bodega' => 1, '7.comercial' => 1, '7.otra' => 1], 'materiales' => ['cables' => 50, 'placas' => 10, 'chips' => 2], 'obras' => [['tipo' => 'mejora', 'ed' => 'estudio', 'nivel' => 7, 'fin' => 99]]];
$r = SO::migrar($M2, $loc);
check('Cuenta vieja con fama: nivel 6 entero + mejoras del 7 (hechas y en obra; control no es del 7), materiales completos', [6, false, ['bodega', 'estudio', 'comercial'], ['cables' => 50, 'placas' => 10, 'chips' => 2]],
    [$r['sede']['nivel'], $r['recortado'], array_values(array_intersect(SO::edificiosDe(7), $r['aceptado']['mejoras_siguiente'])), $r['aceptado']['materiales']]);
check('…nunca más del nivel 8 aunque la cuenta sea vieja y famosa', 8, (function () use ($nuevo) { $q = $nuevo('Famosa', 55, 400); return SO::migrar($q, ['nivel' => 30])['sede']['nivel']; })());
check('Sede oficial con progreso -> 409 ya_migrado', [409, 'ya_migrado'], falla(fn() => SO::migrar($A, ['nivel' => 3])));
check('local que no es objeto -> 400 migracion_invalida', [400, 'migracion_invalida'], (function () use ($nuevo) { $q = $nuevo('Rara'); return falla(fn() => SO::migrar($q, 'nivel 30')); })());
check('local vacío: solo marca que ya decidió (nivel 1)', [1, false], (function () use ($nuevo) { $q = $nuevo('Nada'); $r = SO::migrar($q, null); return [$r['sede']['nivel'], $r['sede']['migracion']['posible']]; })());

// =====================================================================
titulo('bonoCompetencia (para Ventajas)');
$Q = $nuevo('Competidora');
$vals = [];
foreach ([1, 4, 5, 9, 10, 19, 20, 30] as $nv) { Db::q('INSERT OR IGNORE INTO sede_oficial (jugador_id, creado, actualizado) VALUES (?, 0, 0)', [$Q]); Db::q('UPDATE sede_oficial SET nivel = ? WHERE jugador_id = ?', [$nv, $Q]); $vals[] = SO::bonoCompetencia($Q); }
check('Niveles 1, 4, 5, 9, 10, 19, 20, 30 -> 0, 0, 2, 2, 4, 4, 6, 6', [0, 0, 2, 2, 4, 4, 6, 6], $vals);
check('Jugador sin sede oficial -> 0', 0, SO::bonoCompetencia($nuevo('Sin Sede')));
check('SedeOficial::nivel (lo usa Vip::revisarHitos) = nivel oficial', 30, SO::nivel($Q));
if (class_exists(\EnVivo\Ventajas::class)) check('Ventajas::bono(copa) toma la parte sede de bonoCompetencia', 6, (function () use ($Q) { foreach (\EnVivo\Ventajas::bono($Q, 'copa')['partes'] as $p) if ($p['clave'] === 'sede') return $p['pts']; return 0; })());
Db::q('UPDATE sede_oficial SET nivel = 9 WHERE jugador_id = ?', [$Q]);
Db::q("INSERT INTO sede_obras (jugador_id, tipo, ed, nivel, inicio, duracion, fin) VALUES (?, 'nivel', 'sede', 10, ?, 10, ?)", [$Q, SO::ahora() - 20, SO::ahora() - 10]);
check('Una obra de nivel ya terminada (sin abrir la sede) ya cuenta: nivel 10 -> 4', 4, SO::bonoCompetencia($Q));

// =====================================================================
titulo('premioIntento (intentos en línea validados)');
$I = $nuevo('Jugadora Online');
check('Modo desconocido o 0 estrellas -> nada', [[], []], [SO::premioIntento($I, 80, 5, 'casual'), SO::premioIntento($I, 80, 0, 'liga')]);
$b = SO::premioIntento($I, 60, 3, 'liga', 'liga:1');
check('Calidad 60, 3 estrellas, nivel 1: (4 + 1) × 1 × 1,03 = 5 materiales', 5, array_sum($b));
check('Mismo intento otra vez -> nada', [], SO::premioIntento($I, 60, 3, 'liga', 'liga:1'));
$b = SO::premioIntento($I, 100, 5, 'copa', 'copa:1');
check('5 estrellas con calidad 100: round(6 × 1,7 × 1,03) + 2 = 13 comunes (+ quizá 1 chip)', 13, array_sum(array_diff_key($b, ['chips' => 0])));
$tot = 0;
for ($k = 2; $k <= 12; $k++) $tot += array_sum(array_diff_key(SO::premioIntento($I, 100, 5, 'festival', 'festival:' . $k), ['chips' => 0]));
check('Tope del día: 60 materiales comunes por intentos', 60, (int) Db::valor("SELECT SUM(cambio) FROM sede_libro WHERE jugador_id = ? AND motivo = 'intento' AND material <> 'chips'", [$I]));
check('…y como mucho 2 chips', true, (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM sede_libro WHERE jugador_id = ? AND motivo = 'intento' AND material = 'chips'", [$I]) <= 2);
$mas(86400);
check('Al día siguiente vuelve a dar', true, array_sum(SO::premioIntento($I, 100, 4, 'duelo', 'duelo:1')) > 0);
check('Dentro de la transacción de otro módulo también funciona', true, Db::tx(fn() => array_sum(SO::premioIntento($I, 50, 4, 'desafio', 'desafio:1')) > 0));

// =====================================================================
titulo('Rutas por HTTP (copia de api.php + la línea de INTEGRAR_SEDE_OFICIAL.md)');
SO::fijarReloj(null);
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$linea = "    if (\\EnVivo\\SedeApi::esRuta(\$ruta)) \\EnVivo\\SedeApi::responder(\$ruta, \$metodo, requiere_sesion());\n";
$anc = "    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina\n";
$doc = (string) @file_get_contents(dirname(__DIR__) . '/INTEGRAR_SEDE_OFICIAL.md');
check('INTEGRAR_SEDE_OFICIAL.md trae la línea exacta de api.php', true, str_contains($doc, trim($linea)));
check('api.php tiene el lugar donde va la línea', true, str_contains($api, $anc));
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ';', $api);
$api = str_replace($anc, "    // Sede oficial (server/INTEGRAR_SEDE_OFICIAL.md): /api/sede*\n" . $linea . $anc, $api);
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
$H = $nuevo('Por HTTP', 40, 10);
$H2 = $nuevo('Ayudante HTTP', 0, 10);
Social::crear($H, ['nombre' => 'Asociación HTTP', 'siglas' => 'HTP', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
Social::unirse($H2, (int) Db::valor('SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?', [$H]));
Db::q('UPDATE asociacion_miembros SET desde = desde - 2 * 86400 WHERE jugador_id IN (?, ?)', [$H, $H2]);   // más de 24 h (AyudaAsoc)
$tok = $sesion($H); $tok2 = $sesion($H2);
check('GET /api/sede sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], (function () use ($http) { [$c, $j] = $http('GET', '/api/sede'); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('GET', '/api/sede', null, $tok);
check('GET /api/sede -> 200 con nivel, etapa, obras, cofre, migración y créditos', [200, 1, 4, [], true, true, 0], [$c, $j['sede']['nivel'] ?? null, count($j['sede']['etapa']['mejoras'] ?? []), $j['sede']['obras'] ?? null, $j['sede']['cofre']['disponible'] ?? null, $j['sede']['migracion']['posible'] ?? null, $j['creditos'] ?? null]);
check('POST /api/sede/cofre sin X-Envivo -> 403', 403, $http('POST', '/api/sede/cofre', [], $tok, false)[0]);
[$c, $j] = $http('POST', '/api/sede/migrar', ['local' => ['nivel' => 3, 'materiales' => ['cables' => 30, 'placas' => 30, 'paneles' => 30, 'credenciales' => 30, 'planos' => 30]]], $tok);
check('POST /api/sede/migrar -> 200 (nivel 3, cuenta de 10 días y fama 40)', [200, 3, false], [$c, $j['sede']['nivel'] ?? null, $j['recortado'] ?? null]);
check('POST /api/sede/migrar otra vez -> 409 ya_migrado', [409, 'ya_migrado'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/sede/migrar', ['local' => ['nivel' => 3]], $tok); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('POST', '/api/sede/cofre', [], $tok);
check('POST /api/sede/cofre -> 200 con bolsa', [200, 5], [$c, array_sum($j['bolsa'] ?? [])]);
check('POST /api/sede/cofre otra vez -> 409 cofre_ya', [409, 'cofre_ya'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/sede/cofre', [], $tok); return [$c, $j['codigo'] ?? null]; })());
check('POST /api/sede/mejorar con clave mala -> 400 edificio_invalido', [400, 'edificio_invalido'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/sede/mejorar', ['clave' => 'casino'], $tok); return [$c, $j['codigo'] ?? null]; })());
$ed4 = SO::edificiosDe(4)[0];
[$c, $j] = $http('POST', '/api/sede/mejorar', ['clave' => $ed4], $tok);
check('POST /api/sede/mejorar -> 200 con la obra', [200, 1, $ed4], [$c, count($j['sede']['obras'] ?? []), $j['sede']['obras'][0]['ed'] ?? null]);
$obra = $j['sede']['obras'][0] ?? ['id' => 0, 'costo_creditos' => 0];
check('POST /api/sede/subir sin las mejoras -> 409 faltan_mejoras', [409, 'faltan_mejoras'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/sede/subir', [], $tok); return [$c, $j['codigo'] ?? null]; })());
check('POST /api/sede/acelerar sin confirmar -> 400 confirmar_costo con el costo', [400, 'confirmar_costo', $obra['costo_creditos']], (function () use ($http, $tok, $obra) { [$c, $j] = $http('POST', '/api/sede/acelerar', ['obra_id' => $obra['id']], $tok); return [$c, $j['codigo'] ?? null, $j['costo'] ?? null]; })());
check('POST /api/sede/acelerar sin créditos -> 402 sin_creditos', [402, 'sin_creditos'], (function () use ($http, $tok, $obra) { [$c, $j] = $http('POST', '/api/sede/acelerar', ['obra_id' => $obra['id'], 'confirmar_costo' => $obra['costo_creditos']], $tok); return [$c, $j['codigo'] ?? null]; })());
check('POST /api/sede/acelerar sin obra_id -> 400 falta_obra_id', [400, 'falta_obra_id'], (function () use ($http, $tok) { [$c, $j] = $http('POST', '/api/sede/acelerar', ['confirmar_costo' => 5], $tok); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('GET', '/api/sede/ayudas', null, $tok2);
check('GET /api/sede/ayudas (socia) -> 200 con la obra', [200, $obra['id']], [$c, $j['obras'][0]['obra_id'] ?? null]);
[$c, $j] = $http('POST', '/api/sede/ayudar', ['jugador_id' => $H, 'obra_id' => $obra['id']], $tok2);
check('POST /api/sede/ayudar -> 200 con segundos y premio', [200, 300, 1], [$c, $j['segundos'] ?? null, array_sum($j['premio'] ?? [])]);
check('POST /api/sede/ayudar otra vez -> 409 ya_ayudaste', [409, 'ya_ayudaste'], (function () use ($http, $tok2, $H, $obra) { [$c, $j] = $http('POST', '/api/sede/ayudar', ['jugador_id' => $H, 'obra_id' => $obra['id']], $tok2); return [$c, $j['codigo'] ?? null]; })());
Monedero::mover($H, 500, 'compra', 'prueba');
[$c, $j] = $http('POST', '/api/sede/acelerar', ['obra_id' => $obra['id'], 'confirmar_costo' => $obra['costo_creditos']], $tok);
check('POST /api/sede/acelerar con créditos -> 200, obra terminada, saldo menor', [200, 0, true], [$c, count($j['sede']['obras'] ?? [1]), ($j['creditos'] ?? 999) < 500]);
check('…libro de créditos cuadra', true, $libroOk($H));
check('GET /api/sede/mejorar -> 405', 405, $http('GET', '/api/sede/mejorar', null, $tok)[0]);
check('POST /api/sede -> 405', 405, $http('POST', '/api/sede', [], $tok)[0]);
check('GET /api/sede/otra -> 404', 404, $http('GET', '/api/sede/otra', null, $tok)[0]);
check('Las demás rutas de api.php siguen (GET /api/estado -> 200)', 200, $http('GET', '/api/estado')[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nSede oficial: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
