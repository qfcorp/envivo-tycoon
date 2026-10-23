<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Personal estrella, fichas de estrella y Pase de Copa
// (server/src/Estrellas.php, contrato server/MONETIZACION.md, conexión server/INTEGRAR_ESTRELLAS.md):
// base SQLite TEMPORAL; contratar con créditos y con fichas, sin saldo, asignar, consumir (idempotente), aplicarAEquipo,
// bono con tope, vencimiento, regalos y entregas, Pase de Copa (+5 solo esa semana, tope 18 con VIP), ganchos de compra,
// rivales de poder parecido; los parches de INTEGRAR_ESTRELLAS.md aplicados sobre una COPIA de server/src (y probados de
// verdad); las rutas por HTTP (php -S con la copia de api.php + la línea A1) y la SIMULACIÓN del techo de ventaja con
// server/eventos/batalla.js (lógica real).
// Uso:  php server/tests/pruebas_estrellas.php        (GUARDAR_TMP=1 para dejar los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_estrellas_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$SRV = dirname(__DIR__);
$NODE = trim((string) shell_exec('command -v node 2>/dev/null'));
$conf = function (string $db) use ($TMP, $NODE): string {
    return "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/$db\nENVIVO_ZONA=America/Guayaquil\nCOPA_SECRETO=secreto-de-prueba\nUNIVERSO_SERVIDORES_INICIALES=3\n"
        . ($NODE !== '' ? "NODE_BIN=$NODE\nVALIDADOR_NODE=$NODE\n" : '') . "VALIDADOR_URL=http://127.0.0.1:1\n";
};
file_put_contents($TMP . '/config.env', $conf('envivo.sqlite'));
file_put_contents($TMP . '/config_parche.env', $conf('parche.sqlite'));
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Ajustes, Copas, Db, Duelos, Estrellas, Fallo, Migraciones, Monedero};

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
$en = fn(string $fecha) => (new DateTimeImmutable($fecha, new DateTimeZone('America/Guayaquil')))->getTimestamp();
$reloj = function (?int $t) { Copas::$reloj = $t; if (class_exists(\EnVivo\Universos::class)) \EnVivo\Universos::fijarReloj($t); };

Db::pdo();
Estrellas::preparar(); Copas::preparar(); Duelos::preparar();
foreach ([2 => 'Servidor 2 · Guayaquil', 3 => 'Servidor 3 · Cuenca'] as $id => $nom) Db::q('INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (?, ?, 1000, 1, ?)', [$id, $nom, time()]);
$nuevo = function (string $alias, int $sid = 1, int $fama = 30, int $creditos = 0): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '@prueba.example', $alias, 'x', time(), $sid, $alias, strtolower($alias), $fama]);
    $j = Db::ultimoId();
    if ($creditos > 0) Monedero::mover($j, $creditos, 'compra', 'prueba:' . $j);
    return $j;
};
$libro = fn(int $j) => (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ?', [$j]);
$MIE = $en('2026-10-28 12:00:00');   // miércoles de la semana 2026-W44 (preparación)
$SAB = $en('2026-10-31 11:00:00');   // sábado (batalla)
$reloj($MIE);

// =====================================================================
titulo('Catálogo del personal estrella');
$roles = array_count_values(array_column(Estrellas::CATALOGO, 'rol'));
ksort($roles);
check('10 estrellas: 2 por cada uno de los 5 roles', ['camarografo' => 2, 'director' => 2, 'operador_repeticion' => 2, 'sonidista' => 2, 'tecnico_transmision' => 2], $roles);
check('Roles que existen en el juego', true, !array_diff(array_keys($roles), \EnVivo\CatalogoJuego::ROLES));
check('Paquetes de 1, 3 y 5 partidos (Varela: 60, 162, 255 créditos)', [60, 162, 255], [Estrellas::precio('varela', 1), Estrellas::precio('varela', 3), Estrellas::precio('varela', 5)]);
check('Bono de cada rol = 6 − aporte en el equipo (director 0, audio 0, técnico 0, cámara 3, repeticiones 4)', [0, 0, 0, 3, 4],
    [Estrellas::bonoDe('varela'), Estrellas::bonoDe('decibel'), Estrellas::bonoDe('cero_ping'), Estrellas::bonoDe('lupe'), Estrellas::bonoDe('rewind')]);

// =====================================================================
titulo('Contratar con créditos');
$A = $nuevo('Productora Andes', 1, 30, 1000);
$B = $nuevo('Productora Barrio', 1, 10, 0);
$r = Estrellas::contratar($A, ['clave' => 'varela', 'modo' => 'credito', 'partidos' => 3, 'peticion' => 'peticion-0001']);
check('Varela por 3 partidos: cobra 162, contrato de 3 partidos por créditos', [true, false, 3, 3, 'credito', 162, 838],
    [$r['ok'], $r['repetida'], $r['contrato']['partidos'], $r['contrato']['restantes'], $r['contrato']['origen'], $r['contrato']['creditos'], Monedero::saldo($A)]);
$mov = Db::fila('SELECT * FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$A]);
check('Libro de créditos: -162, motivo estrella_copa, ref con la estrella; la suma del libro = saldo', [-162, 'estrella_copa', true, true],
    [(int) $mov['cambio'], $mov['motivo'], str_contains((string) $mov['ref'], 'varela'), $libro($A) === Monedero::saldo($A)]);
check('La primera estrella entra sola en los dos equipos (copa y duelo)', ['copa' => ['varela'], 'duelo' => ['varela']], $r['estrellas']['asignadas']);
$r2 = Estrellas::contratar($A, ['clave' => 'varela', 'modo' => 'credito', 'partidos' => 3, 'peticion' => 'peticion-0001']);
check('La misma petición otra vez: no cobra dos veces (repetida)', [true, 838, 1], [$r2['repetida'], Monedero::saldo($A), (int) Db::valor('SELECT COUNT(*) FROM estrellas_contratos WHERE jugador_id = ?', [$A])]);
check('Sin créditos -> 402 sin_creditos, sin contrato ni movimiento', [[402, 'sin_creditos'], 0, 0],
    [falla(fn() => Estrellas::contratar($B, ['clave' => 'lupe', 'modo' => 'credito', 'partidos' => 1])), (int) Db::valor('SELECT COUNT(*) FROM estrellas_contratos WHERE jugador_id = ?', [$B]), (int) Db::valor('SELECT COUNT(*) FROM movimientos_creditos WHERE jugador_id = ?', [$B])]);
check('Estrella que no existe -> 404 estrella_desconocida', [404, 'estrella_desconocida'], falla(fn() => Estrellas::contratar($A, ['clave' => 'nadie'])));
check('Modo de pago raro -> 400 modo_invalido', [400, 'modo_invalido'], falla(fn() => Estrellas::contratar($A, ['clave' => 'lupe', 'modo' => 'oro'])));
check('2 partidos -> 400 partidos_invalidos', [400, 'partidos_invalidos'], falla(fn() => Estrellas::contratar($A, ['clave' => 'lupe', 'partidos' => 2])));
check('Con fichas, 3 partidos -> 400 partidos_invalidos', [400, 'partidos_invalidos'], falla(fn() => Estrellas::contratar($A, ['clave' => 'lupe', 'modo' => 'fichas', 'partidos' => 3])));
check('Petición con caracteres raros -> 400 peticion_invalida', [400, 'peticion_invalida'], falla(fn() => Estrellas::contratar($A, ['clave' => 'lupe', 'peticion' => 'x; DROP'])));

// =====================================================================
titulo('Fichas de estrella (ruta gratis)');
check('ganarFichas da 8 por la copa', 8, Estrellas::ganarFichas($B, 8, 'copa_intento:1'));
check('…el mismo motivo otra vez no da nada (idempotente)', 0, Estrellas::ganarFichas($B, 8, 'copa_intento:1'));
check('…tope de 12 por día: pide 10 y recibe 4; luego 0', [4, 0, 12], [Estrellas::ganarFichas($B, 10, 'desafio:2026-10-28'), Estrellas::ganarFichas($B, 5, 'copa_cierre:9'), Estrellas::fichas($B)]);
$r = Estrellas::contratar($B, ['clave' => 'lupe', 'modo' => 'fichas']);
check('Contrata a Lupe Zoom (8 fichas) por 1 partido sin gastar créditos', [1, 'fichas', 8, 0, 4, 0], [$r['contrato']['partidos'], $r['contrato']['origen'], $r['contrato']['fichas'], $r['contrato']['creditos'], Estrellas::fichas($B), Monedero::saldo($B)]);
check('Sin fichas suficientes (Decibel pide 12) -> 402 sin_fichas', [402, 'sin_fichas'], falla(fn() => Estrellas::contratar($B, ['clave' => 'decibel', 'modo' => 'fichas'])));
$reloj($MIE + 86400);
check('Al día siguiente vuelve el tope: 12 más', 12, Estrellas::ganarFichas($B, 20, 'copa_intento:2'));
$reloj($MIE);
check('Libro de fichas: saldo de la última fila = suma', true, (int) Db::valor('SELECT saldo FROM estrellas_fichas WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$B]) === Estrellas::fichas($B));

// =====================================================================
titulo('Asignar a los equipos');
check('Equipo que no es copa ni duelo -> 400 equipo_invalido', [400, 'equipo_invalido'], falla(fn() => Estrellas::asignar($A, ['clave' => 'varela', 'equipo' => 'liga'])));
check('Estrella sin partidos -> 409 sin_partidos', [409, 'sin_partidos'], falla(fn() => Estrellas::asignar($A, ['clave' => 'solberg', 'equipo' => 'copa'])));
$r = Estrellas::contratar($A, ['clave' => 'solberg', 'modo' => 'credito', 'partidos' => 1]);
check('Una segunda estrella no reemplaza sola a la que ya juega', ['copa' => ['varela'], 'duelo' => ['varela']], $r['estrellas']['asignadas']);
$r = Estrellas::asignar($A, ['clave' => 'solberg', 'equipo' => 'copa']);
check('Asignar Solberg a la copa: reemplaza a Varela (1 estrella por equipo); en duelos sigue Varela', ['copa' => ['solberg'], 'duelo' => ['varela']], $r['estrellas']['asignadas']);
$r = Estrellas::asignar($A, ['clave' => 'varela', 'equipo' => 'duelo', 'quitar' => true]);
check('Quitar a Varela del duelo', [], $r['estrellas']['asignadas']['duelo']);
Estrellas::asignar($A, ['clave' => 'varela', 'equipo' => 'duelo']);
check('Y volver a ponerlo', ['varela'], Estrellas::activas($A, 'duelo'));

// =====================================================================
titulo('aplicarAEquipo: la estrella cuenta como Internacional, habilidad 5');
$copaEq = ['staff' => [['role' => 'camarografo', 'skill' => 3, 'morale' => 80, 'owner' => true, 'name' => 'Tú'], ['role' => 'camarografo', 'skill' => 2, 'morale' => 80],
                       ['role' => 'director', 'skill' => 2, 'morale' => 80], ['role' => 'sonidista', 'skill' => 2, 'morale' => 80], ['role' => 'tecnico_transmision', 'skill' => 2, 'morale' => 80]],
           'equip' => [['type' => 'cam_basic', 'condition' => 90], ['type' => 'switch_basic', 'condition' => 90]]];
$x = Estrellas::aplicarAEquipo($A, $copaEq, 'copa');
check('Copa: el director flojo sale y entra Solberg (habilidad 5, internacional, su nombre); mismo tamaño', [5, 'director', 5, 'internacional', 'solberg', "Ingrid 'La Batuta' Solberg"],
    [count($x['staff']), $x['staff'][2]['role'], $x['staff'][2]['skill'], $x['staff'][2]['tier'], $x['staff'][2]['estrella'], $x['staff'][2]['name']]);
check('…el dueño y los demás no cambian, ni los equipos', [true, true], [$x['staff'][0] === $copaEq['staff'][0] && $x['staff'][1] === $copaEq['staff'][1] && $x['staff'][3] === $copaEq['staff'][3], $x['equip'] === $copaEq['equip']]);
$dos = $copaEq; $dos['staff'][] = ['role' => 'director', 'skill' => 3, 'morale' => 80];
$x = Estrellas::aplicarAEquipo($A, $dos, 'copa');
check('Con dos directores reemplaza al más flojo', [5, 3], [$x['staff'][2]['skill'], $x['staff'][5]['skill']]);
$sinDir = ['staff' => array_values(array_filter($copaEq['staff'], fn($p) => $p['role'] !== 'director')), 'equip' => $copaEq['equip']];
$x = Estrellas::aplicarAEquipo($A, $sinDir, 'copa');
check('Sin director y con lugar: se suma (5 personas)', [5, 'solberg'], [count($x['staff']), $x['staff'][4]['estrella'] ?? null]);
$lleno = ['staff' => array_merge($sinDir['staff'], [['role' => 'cablero', 'skill' => 1, 'morale' => 80], ['role' => 'runner', 'skill' => 2, 'morale' => 80], ['role' => 'productor', 'skill' => 3, 'morale' => 80], ['role' => 'microfonista', 'skill' => 2, 'morale' => 80]]), 'equip' => $copaEq['equip']];
$x = Estrellas::aplicarAEquipo($A, $lleno, 'copa');
check('Copa llena (8) sin director: reemplaza al más flojo que no es el dueño (el cablero de habilidad 1)', [8, 'solberg', true], [count($x['staff']), $x['staff'][4]['estrella'] ?? null, $x['staff'][0]['owner'] ?? false]);
$duelEq = ['personal' => [['rol' => 'camarografo', 'habilidad' => 3, 'nivel' => 'junior', 'dueno' => true], ['rol' => 'director', 'habilidad' => 3, 'nivel' => 'semi_senior', 'dueno' => false]], 'inventario' => []];
$x = Estrellas::aplicarAEquipo($A, $duelEq, 'duelo');
check('Duelo (formato guardado): el director pasa a Varela, habilidad 5, internacional, no es dueño', ['director', 5, 'internacional', false, 'varela', true],
    [$x['personal'][1]['rol'], $x['personal'][1]['habilidad'], $x['personal'][1]['nivel'], $x['personal'][1]['dueno'], $x['personal'][1]['estrella'], $x['personal'][0] === $duelEq['personal'][0]]);
$C = $nuevo('Productora Costa', 2, 20, 0);
check('Sin estrellas el equipo sale igual; en la liga también', [true, true], [Estrellas::aplicarAEquipo($C, $copaEq, 'copa') === $copaEq, Estrellas::aplicarAEquipo($A, $copaEq, 'liga') === $copaEq]);

// =====================================================================
titulo('Consumir partidos (idempotente)');
check('Cruce de copa: Solberg gasta su partido', ['solberg'], Estrellas::consumir($A, 'copa', 'copa_cruce:10'));
check('…el mismo cruce otra vez no gasta', [], Estrellas::consumir($A, 'copa', 'copa_cruce:10'));
check('Solberg sin partidos: ya no está activa ni entra al equipo', [0, [], true], [Estrellas::restantes($A, 'solberg'), Estrellas::activas($A, 'copa'), Estrellas::aplicarAEquipo($A, $copaEq, 'copa') === $copaEq]);
check('…pero si se vuelve a jugar ESE cruce, juega igual (mismo resultado)', [['solberg'], 5], [Estrellas::activas($A, 'copa', 'copa_cruce:10'), Estrellas::aplicarAEquipo($A, $copaEq, 'copa', 'copa_cruce:10')['staff'][2]['skill']]);
check('Duelo: Varela gasta 1 de 3; repetir no gasta', [['varela'], [], 2], [Estrellas::consumir($A, 'duelo', 'duelo:5'), Estrellas::consumir($A, 'duelo', 'duelo:5'), Estrellas::restantes($A, 'varela')]);
check('Modo que no existe o ref vacía: nada', [[], []], [Estrellas::consumir($A, 'liga', 'x'), Estrellas::consumir($A, 'copa', '')]);
check('Usos guardados: 2', 2, (int) Db::valor('SELECT COUNT(*) FROM estrellas_usos WHERE jugador_id = ?', [$A]));

// =====================================================================
titulo('Bono de competencia (0..6) y recorte del bono de Ventajas');
check('Director en duelos: bono 0; el recorte deja 12 − 9 = 3 del bono de Ventajas', [0, 3, 2], [Estrellas::bonoCompetencia($A, 'duelo'), Estrellas::bonoFinal($A, 'duelo', 12), Estrellas::bonoFinal($A, 'duelo', 2)]);
check('Camarógrafo (Lupe) en copa: bono 3; recorte 12 − 3 = 9', [3, 9, 6], [Estrellas::bonoCompetencia($B, 'copa'), Estrellas::bonoFinal($B, 'copa', 12), Estrellas::bonoFinal($B, 'copa', 6)]);
check('Liga, festival y desafío: 0; sin estrella: 0 y el bono pasa entero', [0, 0, 0, 12], [Estrellas::bonoCompetencia($A, 'liga'), Estrellas::bonoCompetencia($A, 'festival'), Estrellas::bonoCompetencia($C, 'copa'), Estrellas::bonoFinal($C, 'copa', 12)]);
Ajustes::set('estrellas_max_equipo', '3');
foreach (['lupe', 'tano', 'rewind'] as $k) { Estrellas::otorgar($C, $k, 2, 'control', 'tope:' . $k); Estrellas::asignar($C, ['clave' => $k, 'equipo' => 'copa']); }
$x = Estrellas::aplicarAEquipo($C, ['staff' => [['role' => 'camarografo', 'skill' => 2, 'owner' => true], ['role' => 'camarografo', 'skill' => 2], ['role' => 'camarografo', 'skill' => 2], ['role' => 'director', 'skill' => 2]], 'equip' => []], 'copa');
check('Con el ajuste en 3 estrellas por equipo: 3 juegan y el bono se topa en 6 (3 + 3 + 4 = 10)', [3, 6, 3], [count(Estrellas::activas($C, 'copa')), Estrellas::bonoCompetencia($C, 'copa'), count(array_filter($x['staff'], fn($p) => !empty($p['estrella'])))]);
Ajustes::set('estrellas_max_equipo', '');
check('Sin el ajuste vuelve a 1 estrella por equipo', 1, count(Estrellas::activas($C, 'copa')));
$tope = true;
foreach (array_keys(Estrellas::CATALOGO) as $k) $tope = $tope && Estrellas::bonoDe($k) >= 0 && Estrellas::bonoDe($k) <= 6;
check('Ninguna estrella pasa de +6', true, $tope);

// =====================================================================
titulo('Regalos, entregas y vencimiento');
$D = $nuevo('Productora Delta', 1, 15, 0);
$g = Estrellas::otorgar($D, 'tano', 2, 'pase', 'temporada:nivel10');
check('otorgar (pase de temporada): contrato de 2 partidos, origen pase', [2, 'pase', 0], [$g['partidos'], $g['origen'], $g['creditos']]);
check('…el mismo regalo otra vez: nada (idempotente)', null, Estrellas::otorgar($D, 'tano', 2, 'pase', 'temporada:nivel10'));
check('…sin clave: la estrella de la semana', Estrellas::estrellaDeLaSemana(), Estrellas::otorgar($D, null, 1, 'vip', 'vip:dia1')['clave']);
Monedero::entregar($D, 'estrella', 'decibel', 2, 'pase:temporada:nivel12');
Monedero::entregar($D, 'estrella', 'comodin', 1, 'vip:regalo:3');
$e = Estrellas::estado($D);
$porClave = array_column($e['catalogo'], 'restantes', 'clave');
check('Las entregas tipo "estrella" (pase/VIP) se vuelven contratos al pedir GET /api/estrellas', [2, true], [$porClave['decibel'], array_sum($porClave) === 2 + 2 + 1 + 1]);
Estrellas::estado($D);
check('…una sola vez', 4, (int) Db::valor('SELECT COUNT(*) FROM estrellas_contratos WHERE jugador_id = ?', [$D]));
$reloj($MIE + 31 * 86400);
check('A los 31 días los contratos vencieron', [0, []], [Estrellas::restantes($D, 'tano'), Estrellas::activas($D, 'copa')]);
$reloj($MIE);

// =====================================================================
titulo('Pase de Copa: +5 intentos por día, solo en la copa de esa semana; tope 18');
$c44 = (int) Copas::asegurarCopa(Copas::universos()[0], $MIE)['id'];
Db::q("INSERT INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (?, '2026-W45', 'el_gran_tazon', 'El Gran Tazón', 'preparacion', ?, ?, ?)",
    [Copas::universos()[0]['id'], $en('2026-11-02 00:00:00'), $en('2026-11-09 00:00:00'), time()]);
$c45 = Db::ultimoId();
check('Sin pase: 0 extra, límite 10', [0, 10], [Estrellas::intentosExtra($A, $c44), Estrellas::limiteIntentos($A, $c44)]);
$antes = Monedero::saldo($A);
$p = Estrellas::comprarPase($A, []);
check('Comprar con créditos en la preparación: cobra 300 y queda activo', [true, $antes - 300, true, 15], [$p['ok'], Monedero::saldo($A), $p['pase_copa']['activo'], $p['pase_copa']['intentos_max']]);
$mov = Db::fila('SELECT * FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$A]);
check('Libro: -300 con motivo pase_copa; suma del libro = saldo', [-300, 'pase_copa', true], [(int) $mov['cambio'], $mov['motivo'], $libro($A) === Monedero::saldo($A)]);
check('+5 en la copa de esta semana (W44), 0 en la de la próxima (W45)', [5, 15, 0, 10], [Estrellas::intentosExtra($A, $c44), Estrellas::limiteIntentos($A, $c44), Estrellas::intentosExtra($A, $c45), Estrellas::limiteIntentos($A, $c45)]);
check('Otra vez la misma semana -> 409 ya_tienes', [409, 'ya_tienes'], falla(fn() => Estrellas::comprarPase($A, [])));
check('Sin créditos -> 402 sin_creditos', [402, 'sin_creditos'], falla(fn() => Estrellas::comprarPase($B, [])));
check('Con dinero -> 400 usa_tienda (va por la tienda: producto pase_copa)', [400, 'usa_tienda'], falla(fn() => Estrellas::comprarPase($A, ['modo' => 'dinero'])));
$reloj($SAB);
check('Sábado (batalla) -> 409 fase', [409, 'fase'], falla(fn() => Estrellas::comprarPase($nuevo('Productora Sábado', 1, 10, 500), [])));
$reloj($MIE);
Estrellas::$vipExtra = fn(int $j) => 2;
check('VIP +2 y pase +5: 17', 17, Estrellas::limiteIntentos($A, $c44));
Estrellas::$vipExtra = fn(int $j) => 7;
check('VIP que pide +7: se topa en +3 → 18 (10 + 3 + 5), nunca más', [18, 13, 8], [Estrellas::limiteIntentos($A, $c44), Estrellas::limiteIntentos($C, $c44), Estrellas::intentosExtra($A, $c44)]);
Estrellas::$vipExtra = null;
$E = $nuevo('Productora Eco');
check('Gancho compra_aprobada del pase de $2.99: pase de esta semana, una sola vez', [true, false, 5], [Estrellas::alComprar(['producto' => 'pase_copa', 'jugador_id' => $E, 'compra_id' => 77]), Estrellas::alComprar(['producto' => 'pase_copa', 'jugador_id' => $E, 'compra_id' => 77]), Estrellas::intentosExtra($E, $c44)]);
check('…otros productos no hacen nada', false, Estrellas::alComprar(['producto' => 'vip30', 'jugador_id' => $E, 'compra_id' => 78]));
check('Gancho compra_revertida: se quita el pase', [1, 0], [Estrellas::alRevertir(['compra_id' => 77]), Estrellas::intentosExtra($E, $c44)]);
$reloj($SAB);
$F = $nuevo('Productora Faro');
Estrellas::alComprar(['producto' => 'pase_copa', 'jugador_id' => $F, 'compra_id' => 79]);
check('Pagado el sábado (ya no hay preparación): queda para la copa de la semana siguiente', [false, true], [Estrellas::paseActivo($F, '2026-W44'), Estrellas::paseActivo($F, '2026-W45')]);
$reloj($MIE);
$pe = Estrellas::paseEstado($A);
check('paseEstado: semana, fase, activo, precios, puede_comprar (ya lo tiene: no), intentos 10 → 15, tope 18', ['2026-W44', 'preparacion', true, 300, 2.99, false, 10, 15, 18],
    [$pe['semana'], $pe['fase'], $pe['activo'], $pe['precio_creditos'], $pe['precio_usd'], $pe['puede_comprar'], $pe['intentos_base'], $pe['intentos_max'], $pe['tope']]);

// =====================================================================
titulo('Rivales sugeridos en Duelos: poder parecido (±20 %) y luego puntaje cercano');
$t = Duelos::temporada();
$eqDuelo = function (int $n, int $hab): array {
    $p = [['rol' => 'camarografo', 'habilidad' => $hab, 'nivel' => 'junior', 'dueno' => true]];
    $roles = ['director', 'sonidista', 'tecnico_transmision', 'camarografo', 'camarografo', 'productor', 'cablero', 'operador_graficos', 'coordinador_piso', 'runner', 'microfonista'];
    for ($i = 0; $i < $n - 1; $i++) $p[] = ['rol' => $roles[$i], 'habilidad' => $hab, 'nivel' => 'junior', 'dueno' => false];
    return ['personal' => $p, 'inventario' => []];
};
$registrar = function (int $j, array $eq, int $rating) use ($t): int {
    $res = Duelos::resumenEquipo($eq, false);
    Db::q('INSERT OR REPLACE INTO duelo_equipos (jugador_id, servidor_id, equipo_json, resumen_json, poder, cambios, actualizado) VALUES (?, 3, ?, ?, ?, 1, ?)', [$j, json_encode($eq), json_encode($res), $res['poder'], time()]);
    Db::q('INSERT OR REPLACE INTO duelo_ratings (temporada, jugador_id, servidor_id, rating, mejor, actualizado) VALUES (?, ?, 3, ?, ?, ?)', [$t, $j, $rating, $rating, time()]);
    return (int) $res['poder'];
};
$YO = $nuevo('Duelista Yo', 3);
$miPoder = $registrar($YO, $eqDuelo(6, 3), 1000);
$R = [];
foreach ([['Rival Parejo Lejano', 6, 3, 1300], ['Rival Fuerte', 10, 4, 1000], ['Rival Parejo', 6, 2, 1100], ['Rival Flojo', 2, 1, 990], ['Rival Parejo Igual', 7, 3, 1000], ['Rival Otro Servidor', 6, 3, 1000]] as $i => [$al, $n, $h, $rt]) {
    $R[$i] = $nuevo($al, $i === 5 ? 1 : 3);
    $pw = $registrar($R[$i], $eqDuelo($n, $h), $rt);
    if ($i === 5) Db::q('UPDATE duelo_equipos SET servidor_id = 1 WHERE jugador_id = ?', [$R[$i]]);
    $R[$i] = [$R[$i], $pw];
}
$s = Estrellas::rivalesSugeridos($YO);
$parejos = array_values(array_map(fn($f) => $f['nombre'], array_filter($s, fn($f) => $f['parecido'])));
check('Mi poder ' . $miPoder . ': parejos (±20 %) primero, por puntaje cercano; después los demás', ['Rival Parejo Igual', 'Rival Parejo', 'Rival Parejo Lejano', 'Rival Fuerte', 'Rival Flojo'], array_column($s, 'nombre'));
check('…marca "parecido" y trae lo que usa Duelos::rivalJson (id, alias, fama, resumen, poder, rt)', [3, true], [count($parejos), isset($s[0]['id'], $s[0]['alias'], $s[0]['resumen_json'], $s[0]['poder'], $s[0]['rt']) && array_key_exists('vip_hasta', $s[0]) && array_key_exists('fama_publica', $s[0])]);
check('Nunca sugiere a alguien de otro servidor ni a mí', true, !in_array($R[5][0], array_column($s, 'id')) && !in_array($YO, array_column($s, 'id')));
Estrellas::otorgar($YO, 'varela', 3, 'control', 'duelo-yo');
$s2 = Estrellas::rivalesSugeridos($YO);
check('Con mi estrella director mi poder efectivo sube (' . Estrellas::poderDuelo($YO) . ' > ' . $miPoder . ') y cambia quién es parejo', [true, true],
    [Estrellas::poderDuelo($YO) > $miPoder, array_column(array_filter($s2, fn($f) => $f['parecido']), 'nombre') !== $parejos]);

// =====================================================================
titulo('Parches de INTEGRAR_ESTRELLAS.md (sobre una COPIA de server/src y api.php)');
$md = (string) file_get_contents($SRV . '/INTEGRAR_ESTRELLAS.md');
preg_match_all('/<!-- parche archivo="([^"]+)" id="([^"]+)" marca="([^"]+)" -->\s*```php\n(.*?)\n```\s*```php\n(.*?)\n```/s', $md, $m, PREG_SET_ORDER);
$PARCHES = array_map(fn($x) => ['archivo' => $x[1], 'id' => $x[2], 'marca' => html_entity_decode($x[3], ENT_QUOTES), 'buscar' => $x[4], 'poner' => $x[5]], $m);
check('Cada parche trae su marca y la marca está en su "Reemplazar por"', [], array_values(array_map(fn($p) => $p['id'], array_filter($PARCHES, fn($p) => !str_contains($p['poner'], $p['marca'])))));
check('El documento trae los parches A1, C1–C8, D1–D3b y F1', ['A1', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'D1', 'D2', 'D3', 'D3b', 'F1'], array_column($PARCHES, 'id'));
$COPIA = $TMP . '/srv';
mkdir($COPIA . '/server/src/migraciones', 0777, true);
mkdir($COPIA . '/server/public', 0777, true);
foreach (glob($SRV . '/src/*.php') as $f) copy($f, $COPIA . '/server/src/' . basename($f));
foreach (glob($SRV . '/src/migraciones/*.sql') as $f) copy($f, $COPIA . '/server/src/migraciones/' . basename($f));
copy($SRV . '/public/api.php', $COPIA . '/server/public/api.php');
symlink($SRV . '/eventos', $COPIA . '/server/eventos');
symlink($SRV . '/validador', $COPIA . '/server/validador');
$malos = []; $ya = []; $aplicados = [];
foreach ($PARCHES as $p) {
    $f = $COPIA . '/' . $p['archivo'];
    $txt = (string) file_get_contents($f);
    if (str_contains($txt, $p['marca'])) { $ya[] = $p['id']; continue; }   // ya integrado en el archivo de verdad: se prueba tal cual
    $veces = substr_count($txt, $p['buscar']);
    if ($veces !== 1) { $malos[] = $p['id'] . ' aparece ' . $veces . ' veces en ' . $p['archivo'] . ' (y no tiene la marca)'; continue; }
    file_put_contents($f, str_replace($p['buscar'], $p['poner'], $txt));
    $aplicados[] = $p['id'];
}
echo '  (ya integrados: ' . ($ya ? implode(' ', $ya) : 'ninguno') . ' · aplicados en la copia: ' . ($aplicados ? implode(' ', $aplicados) : 'ninguno') . ")\n";
check('Cada parche: ya integrado (tiene su marca) o su "Buscar" está UNA vez', [], $malos);
$lint = [];
foreach (array_unique(array_column($PARCHES, 'archivo')) as $a) { exec('php -l ' . escapeshellarg($COPIA . '/' . $a) . ' 2>&1', $o, $c); if ($c !== 0) $lint[] = $a; }
check('php -l de los archivos parchados', [], $lint);

$prueba = <<<'PHP'
<?php
// Corre con la COPIA parchada de server/src (la arma pruebas_estrellas.php).
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $argv[1] . '/server/src/arranque.php';
use EnVivo\{Copas, Db, Duelos, Estrellas, Fallo, Migraciones, Monedero};
$c = [];
$chk = function (string $n, $e, $g) use (&$c) { $c[] = [$n, $e, $g]; };
$en = fn(string $f) => (new DateTimeImmutable($f, new DateTimeZone('America/Guayaquil')))->getTimestamp();
$reloj = function (?int $t) { Copas::$reloj = $t; if (class_exists(\EnVivo\Universos::class)) \EnVivo\Universos::fijarReloj($t); };
Db::pdo(); Copas::preparar(); Estrellas::preparar(); Duelos::preparar();
foreach ([2 => 'Servidor 2 · Guayaquil', 3 => 'Servidor 3 · Cuenca'] as $id => $nom) Db::q('INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (?, ?, 1000, 1, ?)', [$id, $nom, time()]);
$cols = Migraciones::columnas('servidores') ?? [];
if (isset($cols['universo_id'])) Db::q('UPDATE servidores SET universo_id = (SELECT MIN(id) FROM universos) WHERE id IN (1, 2, 3)');
$nuevo = function (string $alias, int $sid, int $cred = 0): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica) VALUES (?, ?, ?, ?, ?, ?, ?, 30)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '@prueba.example', $alias, 'x', time(), $sid, $alias, strtolower($alias)]);
    $j = Db::ultimoId();
    if ($cred) Monedero::mover($j, $cred, 'compra', 'prueba:' . $j);
    return $j;
};
$equipo = ['staff' => [['role' => 'camarografo', 'skill' => 3, 'owner' => true, 'name' => 'Tú'], ['role' => 'director', 'skill' => 3], ['role' => 'sonidista', 'skill' => 2],
                       ['role' => 'tecnico_transmision', 'skill' => 2], ['role' => 'camarografo', 'skill' => 2]],
           'equip' => array_merge(array_fill(0, 4, ['type' => 'cam_basic', 'condition' => 90]), array_map(fn($t) => ['type' => $t, 'condition' => 90], ['switch_basic', 'audio_basic', 'mics', 'encoder', 'router4g', 'raincover']))];
$reloj($en('2026-10-28 10:00:00'));
Copas::asegurarCopa(Copas::universos()[0]);
$P = $nuevo('Parche Estrella', 1, 3000); $Q = $nuevo('Parche Rival', 2, 1000); $R = $nuevo('Parche Vecino', 1, 0); $V = $nuevo('Parche VIP', 3, 1000);
foreach ([$P, $Q, $R, $V] as $j) Copas::registrarEquipo($j, $equipo);
Estrellas::contratar($P, ['clave' => 'varela', 'modo' => 'credito', 'partidos' => 3]);
Copas::registrarEquipo($P, $equipo);
$cid = (int) Db::valor('SELECT copa_id FROM copa_equipos WHERE jugador_id = ?', [$P]);
$pw = fn($j) => (int) Db::valor('SELECT poder FROM copa_equipos WHERE jugador_id = ?', [$j]);
$guardado = json_decode((string) Db::valor('SELECT equipo_json FROM copa_equipos WHERE jugador_id = ?', [$P]), true);
$chk('C6: el poder del plantel cuenta la estrella (mismo equipo: más poder) y el equipo se guarda sin ella', [true, false], [$pw($P) > $pw($Q), (bool) array_filter($guardado['staff'], fn($p) => !empty($p['estrella']))]);
$chk('C3: GET copa sin pase → intentos_max 10', 10, Copas::estado($P)['yo']['intentos_max']);
Estrellas::comprarPase($P, []);
$chk('C3: con pase → 15', 15, Copas::estado($P)['yo']['intentos_max']);
$jugar = function (int $j, int $n) {
    $ok = 0; $err = null;
    for ($k = 0; $k < $n; $k++) {
        try { $i = Copas::iniciarIntento($j); Db::q("UPDATE copa_intentos SET estado = 'vencido' WHERE id = ?", [$i['id']]); $ok++; }
        catch (Fallo $e) { $err = [$e->getCode(), $e->extra['codigo'] ?? null, $e->extra['max'] ?? null]; break; }
    }
    return [$ok, $err];
};
$chk('C1: con pase juega 15 y el 16 → 429 limite_dia (max 15)', [15, [429, 'limite_dia', 15]], $jugar($P, 16));
$chk('C1: sin pase juega 10 y el 11 → 429 (max 10)', [10, [429, 'limite_dia', 10]], $jugar($Q, 11));
Estrellas::comprarPase($V, []);
Estrellas::$vipExtra = fn(int $j) => $j === $V ? 9 : 0;
$chk('C1: pase + VIP (pide 9, se topa en 3) → 18 y el 19 → 429 (max 18)', [18, [429, 'limite_dia', 18]], $jugar($V, 19));
Estrellas::$vipExtra = null;
// C7: fichas por evento validado
Copas::$validador = fn(array $i) => ['valido' => true, 'calidad' => 70, 'estrellas' => 4, 'version_logica' => 'prueba', 'detalle' => []];
$i = Copas::iniciarIntento($R);
Copas::enviarIntento($R, ['intento_id' => $i['id'], 'decisiones' => [0], 'resultado' => ['calidad' => 70, 'estrellas' => 4], 'firma' => $i['firma']]);
$chk('C7: un evento de preparación validado da 1 ficha de estrella', 1, Estrellas::fichas($R));
// C4 / C5: el cruce lleva la estrella y gasta 1 partido (rejugar no gasta)
$reloj($en('2026-10-31 10:00:00'));
Copas::asegurarCopa(Copas::universos()[0]);
$x = Db::fila('SELECT * FROM copa_cruces WHERE copa_id = ? AND ((servidor_a = 1 AND servidor_b = 2) OR (servidor_a = 2 AND servidor_b = 1))', [$cid]);
$cap = null;
Copas::$motor = function (array $pet) use (&$cap) {
    $cap = $pet;
    $p = []; for ($n = 0; $n < 5; $n++) $p[] = ['n' => $n + 1, 'tipo' => $pet['contratos'][$n]['type'], 'calidad_a' => 60 + $n, 'calidad_b' => 55, 'ganador' => 'a', 'orden_a' => $n, 'orden_b' => $n];
    return ['ok' => true, 'partidos' => $p];
};
$chk('C4/C5: el cruce se juega', true, Copas::jugarCruce((int) $x['id']));
$mio = null; $suyo = null;
foreach (array_merge($cap['planA'], $cap['planB']) as $e) { if (($e['jugador_id'] ?? null) === $P) $mio = $e; if (($e['jugador_id'] ?? null) === $Q) $suyo = $e; }
$est = $mio ? array_values(array_filter($mio['staff'], fn($p) => !empty($p['estrella']))) : [];
$chk('C4: en el plantel mi director es Varela (habilidad 5, internacional); el rival no lleva estrella', [1, 5, 'internacional', 'director', ['varela'], 0],
    [count($est), $est[0]['skill'] ?? null, $est[0]['tier'] ?? null, $est[0]['role'] ?? null, $mio['estrellas'] ?? null, count(array_filter($suyo['staff'] ?? [], fn($p) => !empty($p['estrella'])))]);
$chk('C5: Varela gastó 1 partido (quedan 2)', 2, Estrellas::restantes($P, 'varela'));
Copas::rejugarCruce((int) $x['id'], 'prueba');
$est2 = [];
foreach (array_merge($cap['planA'], $cap['planB']) as $e) if (($e['jugador_id'] ?? null) === $P) $est2 = array_values(array_filter($e['staff'], fn($p) => !empty($p['estrella'])));
$chk('C5: rejugar el cruce: la estrella juega igual y NO gasta otra vez', [1, 2], [count($est2), Estrellas::restantes($P, 'varela')]);
// D1 / D2 / D3: duelos
$reloj(null); Copas::$motor = null; Copas::$validador = null;
$pers = ['personal' => [['rol' => 'camarografo', 'habilidad' => 3, 'dueno' => true], ['rol' => 'director', 'habilidad' => 3], ['rol' => 'sonidista', 'habilidad' => 2], ['rol' => 'tecnico_transmision', 'habilidad' => 2]], 'inventario' => []];
Duelos::guardarEquipo($P, $pers); Duelos::guardarEquipo($R, $pers);
$rv = Duelos::resumen($P)['rivales'];
$chk('D3: GET duelos: rivales sugeridos con "parecido"', [true, true], [count($rv) >= 1 && $rv[0]['id'] === $R, is_bool($rv[0]['parecido'] ?? null)]);
try {
    $d = Duelos::retar($P, ['rival_id' => $R, 'nivel' => 'medio']);
    $dir = array_values(array_filter($d['intento']['equipo']['staff'], fn($p) => $p['role'] === 'director'));
    $chk('D1: el intento del retador lleva a Varela: director habilidad 5, internacional', [5, 'internacional'], [$dir[0]['skill'] ?? null, $dir[0]['tier'] ?? null]);
    $chk('D2: retar gastó 1 partido (quedan 1); el defensor no tenía estrella', 1, Estrellas::restantes($P, 'varela'));
} catch (Fallo $e) {
    $chk('D1/D2: duelo con el motor de verdad (node) — ' . $e->getMessage(), 'motor', $e->extra['codigo'] === 'mantenimiento' ? 'motor' : $e->extra['codigo']);
}
echo json_encode($c, JSON_UNESCAPED_UNICODE);
PHP;
file_put_contents($TMP . '/prueba_parches.php', $prueba);
$sal = []; exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config_parche.env') . ' php -d error_log=' . escapeshellarg($TMP . '/parche_errores.log') . ' -d log_errors=1 ' . escapeshellarg($TMP . '/prueba_parches.php') . ' ' . escapeshellarg($COPIA) . ' 2>&1', $sal, $cod);
$res = json_decode((string) end($sal), true);
check('La copia parchada corre sin errores', [0, true], [$cod, is_array($res)]);
if (!is_array($res)) echo '  ' . implode("\n  ", array_slice($sal, -15)) . "\n";
foreach ($res ?: [] as [$n, $e, $g]) check($n, $e, $g);
$errP = is_file($TMP . '/parche_errores.log') ? trim((string) file_get_contents($TMP . '/parche_errores.log')) : '';
check('Sin errores ni avisos de PHP en la copia parchada', '', $errP);

// =====================================================================
titulo('Rutas por HTTP (php -S con la copia de api.php + la línea A1)');
$puerto = (int) (getenv('P_APP') ?: 9400 + random_int(0, 500));
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-S', '127.0.0.1:' . $puerto, $COPIA . '/server/public/api.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tub, null, ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PATH' => getenv('PATH')]);
for ($k = 0; $k < 50; $k++) { if (@fsockopen('127.0.0.1', $puerto)) break; usleep(100000); }
$sesion = function (int $j): string { $tok = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $tok), $j, time(), time() + 3600]); return $tok; };
$http = function (string $metodo, string $ruta, ?array $cuerpo = null, ?string $tok = null, bool $cabecera = true) use ($puerto): array {
    $ch = curl_init('http://127.0.0.1:' . $puerto . $ruta);
    $h = ['Content-Type: application/json'];
    if ($cabecera) $h[] = 'X-Envivo: 1';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30]
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []) + ($tok ? [CURLOPT_COOKIE => 'envivo_s=' . $tok] : []));
    $b = curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode((string) $b, true)];
};
$cod = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null];
$H = $nuevo('Productora HTTP', 1, 30, 500); $tok = $sesion($H);
$H2 = $nuevo('Productora HTTP Pobre', 1, 10, 0); $tok2 = $sesion($H2);
check('GET /api/estrellas sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], $cod($http('GET', '/api/estrellas')));
[$c, $j] = $http('GET', '/api/estrellas', null, $tok);
check('GET /api/estrellas -> 200: catálogo (10), contratos, fichas, equipos, bono, pase_copa, copa, reglas', [200, 10, 0, true, true],
    [$c, count($j['catalogo'] ?? []), $j['fichas'] ?? null, isset($j['pase_copa']['intentos_max'], $j['pase_copa']['precio_creditos'], $j['asignadas']['copa'], $j['bono']['duelo'], $j['copa']['fase'], $j['reglas']['max_por_equipo']), isset($j['catalogo'][0]['precios'][2]['creditos'], $j['catalogo'][0]['asignada']['copa'])]);
check('POST /api/estrellas/contratar sin X-Envivo -> 403', 403, $http('POST', '/api/estrellas/contratar', ['clave' => 'lupe'], $tok, false)[0]);
[$c, $j] = $http('POST', '/api/estrellas/contratar', ['clave' => 'lupe', 'modo' => 'credito', 'partidos' => 1], $tok);
check('POST /api/estrellas/contratar -> 200 contrato de 1 partido, cobra 30', [200, 1, 470, ['lupe']], [$c, $j['contrato']['restantes'] ?? null, $j['estrellas']['creditos'] ?? null, $j['estrellas']['asignadas']['copa'] ?? null]);
check('…sin créditos -> 402 sin_creditos', [402, 'sin_creditos'], $cod($http('POST', '/api/estrellas/contratar', ['clave' => 'varela', 'partidos' => 5], $tok2)));
check('…estrella desconocida -> 404 estrella_desconocida', [404, 'estrella_desconocida'], $cod($http('POST', '/api/estrellas/contratar', ['clave' => 'zzz'], $tok)));
check('…con fichas que no tiene -> 402 sin_fichas', [402, 'sin_fichas'], $cod($http('POST', '/api/estrellas/contratar', ['clave' => 'lupe', 'modo' => 'fichas'], $tok)));
[$c, $j] = $http('POST', '/api/estrellas/asignar', ['clave' => 'lupe', 'equipo' => 'duelo', 'quitar' => true], $tok);
check('POST /api/estrellas/asignar quitar -> 200', [200, []], [$c, $j['estrellas']['asignadas']['duelo'] ?? null]);
check('…equipo raro -> 400 equipo_invalido', [400, 'equipo_invalido'], $cod($http('POST', '/api/estrellas/asignar', ['clave' => 'lupe', 'equipo' => 'x'], $tok)));
$prep = Copas::fase(time()) === 'preparacion';
[$c, $j] = $http('POST', '/api/pase_copa/comprar', [], $tok);
check('POST /api/pase_copa/comprar -> ' . ($prep ? '200 activo, cobra 300' : '409 fase (hoy no hay preparación)'), $prep ? [200, true, 170] : [409, 'fase'], $prep ? [$c, $j['pase_copa']['activo'] ?? null, $j['creditos'] ?? null] : [$c, $j['codigo'] ?? null]);
check('…con dinero -> 400 usa_tienda', [400, 'usa_tienda'], $cod($http('POST', '/api/pase_copa/comprar', ['modo' => 'dinero'], $tok)));
check('GET /api/estrellas/contratar -> 405 con código', [405, 'metodo_no_permitido'], $cod($http('GET', '/api/estrellas/contratar', null, $tok)));
check('POST /api/estrellas -> 405', 405, $http('POST', '/api/estrellas', [], $tok)[0]);
check('GET /api/estrellas/otra -> 404', 404, $http('GET', '/api/estrellas/otra', null, $tok)[0]);
check('Las demás rutas siguen igual: GET /api/estado -> 200', 200, $http('GET', '/api/estado', null, $tok)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

// =====================================================================
titulo('Simulación del techo de ventaja (server/eventos/batalla.js, lógica real)');
if ($NODE === '') {
    echo "  AVISO: no hay node: se salta la simulación\n";
} else {
    // Equipo de copa GRATIS bien armado: 8 personas de habilidad 4 (lo máximo con fama 15–39), 12 equipos de fama ≤ 30,
    // tal como lo deja Festival::revisarEquipo (sin nivel, ánimo 80, estado 90).
    $copaLibre = ['staff' => array_map(fn($p) => $p + ['morale' => 80], [['role' => 'camarografo', 'skill' => 4, 'owner' => true, 'name' => 'Tú'], ['role' => 'camarografo', 'skill' => 4],
        ['role' => 'camarografo', 'skill' => 4], ['role' => 'camarografo', 'skill' => 4], ['role' => 'director', 'skill' => 4], ['role' => 'sonidista', 'skill' => 4],
        ['role' => 'tecnico_transmision', 'skill' => 4], ['role' => 'operador_repeticion', 'skill' => 4]]),
        'equip' => array_map(fn($t) => ['type' => $t, 'condition' => 90], array_merge(array_fill(0, 4, 'cam_jvk_gy_hk560'),
            ['switch_pro', 'au_mydas_m33_live', 'mic_shur_slxd25_doble', 'enc_liveyou_solo_pro', 'router4g', 'rep_trikaster_3jugadas', 'ups', 'rain_cobertor_broadcast']))];
    // Duelos: el personal guardado (habilidad 4) + el kit básico que pone Duelos::armarIntento
    $dueloLibre = ['personal' => array_map(fn($r) => ['rol' => $r[0], 'habilidad' => $r[1], 'nivel' => 'junior', 'dueno' => !empty($r[2])],
        [['camarografo', 4, true], ['camarografo', 4], ['camarografo', 4], ['camarografo', 4], ['director', 4], ['sonidista', 4], ['tecnico_transmision', 4], ['operador_repeticion', 4], ['productor', 3], ['cablero', 3]]), 'inventario' => []];
    $SEDE = 6;   // Sede oficial al máximo (MONETIZACION.md §1)
    $casos = [];
    foreach (['varela', 'decibel', 'cero_ping', 'lupe', 'rewind'] as $k) {
        $S = $nuevo('Simulación ' . $k);
        Estrellas::otorgar($S, $k, 5, 'control', 'sim:' . $k);
        $bc = Estrellas::bonoCompetencia($S, 'copa');
        $bd = Estrellas::bonoCompetencia($S, 'duelo');
        $dCon = Estrellas::aplicarAEquipo($S, $dueloLibre, 'duelo');
        $duelos = [];
        foreach (Duelos::NIVELES as $nivel => $vs) foreach ($vs as $v) {
            $ct = $v + ['client' => 'Simulación', 'stream' => true, 'rival' => false];
            $duelos[] = ['contrato' => $ct, 'libre' => Duelos::armarIntento($dueloLibre, $ct, 1, false, null)['equipo'], 'con' => Duelos::armarIntento($dCon, $ct, 1, false, null)['equipo']];
        }
        $casos[] = ['clave' => $k, 'rol' => Estrellas::CATALOGO[$k]['rol'], 'copa' => Estrellas::aplicarAEquipo($S, $copaLibre, 'copa'),
            'bono_copa' => ['final' => Estrellas::bonoFinal($S, 'copa', min(12, $SEDE + $bc)), 'sin_recorte' => min(12, $SEDE + $bc), 'doce' => 12],
            'bono_duelo' => ['final' => Estrellas::bonoFinal($S, 'duelo', min(12, $SEDE + $bd)), 'sin_recorte' => min(12, $SEDE + $bd), 'doce' => 12], 'duelos' => $duelos];
    }
    $sim = <<<'JS'
'use strict';
const B = require(process.argv[2]);
const x = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8'));
const SEMILLAS = 6;
const out = [];
for (const c of x.casos) {
  const r = { clave: c.clave, rol: c.rol, copa: { libre: 0, con: 0, n: 0, b: {} }, duelo: { libre: 0, con: 0, n: 0, b: {} } };
  const sumar = (dst, p, bonos) => { dst.libre += p.calidad_a; dst.con += p.calidad_b; dst.n++; for (const k in bonos) dst.b[k] = (dst.b[k] || 0) + Math.min(100, p.calidad_b + bonos[k]); };
  for (const t of Object.keys(B.TORNEOS)) for (let s = 1; s <= SEMILLAS; s++) {
    const j = B.jugarCruce({ seed: 1000 + s * 7919, torneo: t, planA: Array(5).fill(x.copaLibre), planB: Array(5).fill(c.copa) });
    if (!j.ok) { console.log(JSON.stringify({ ok: false, j })); process.exit(1); }
    j.partidos.forEach((p) => { if (p.casa_a || p.casa_b) { console.log(JSON.stringify({ ok: false, casa: [p.motivo_casa_a, p.motivo_casa_b] })); process.exit(1); } sumar(r.copa, p, c.bono_copa); });
  }
  c.duelos.forEach((d, i) => { for (let s = 1; s <= 8; s++) {
    const j = B.jugarCruce({ seed: 77 + s * 104729 + i, torneo: 'copa_planeta_balompie', contratos: Array(5).fill(d.contrato), planA: Array(5).fill(d.libre), planB: Array(5).fill(d.con) });
    if (!j.ok) { console.log(JSON.stringify({ ok: false, j })); process.exit(1); }
    j.partidos.forEach((p) => sumar(r.duelo, p, c.bono_duelo));
  } });
  out.push(r);
}
console.log(JSON.stringify({ ok: true, casos: out }));
JS;
    file_put_contents($TMP . '/sim.js', $sim);
    file_put_contents($TMP . '/sim.json', json_encode(['copaLibre' => $copaLibre, 'casos' => $casos]));
    $t0 = microtime(true);
    $o = json_decode((string) shell_exec(escapeshellarg($NODE) . ' ' . escapeshellarg($TMP . '/sim.js') . ' ' . escapeshellarg($SRV . '/eventos/batalla.js') . ' ' . escapeshellarg($TMP . '/sim.json') . ' 2>&1'), true);
    check('La simulación corre (8 torneos × 6 semillas × 5 partidos por estrella en copa; 6 contratos × 8 × 5 en duelos)', true, ($o['ok'] ?? false) === true);
    $pct = fn(float $a, float $b) => round(($b / $a - 1) * 100, 1);
    $maxCopa = 0; $maxDuelo = 0; $todas = true;
    foreach ($o['casos'] ?? [] as $r) {
        foreach (['copa', 'duelo'] as $m) {
            $x = $r[$m]; $l = $x['libre'] / $x['n'];
            $fin = $pct($x['libre'], $x['b']['final']);
            printf("  SIM %-6s %-12s %-20s libre %5.1f · con estrella %5.1f (%+5.1f %%) · + bono recortado %+5.1f %% · sin recorte %+5.1f %% · +12 encima %+5.1f %%\n",
                $m, $r['clave'], $r['rol'], $l, $x['con'] / $x['n'], $pct($x['libre'], $x['con']), $fin, $pct($x['libre'], $x['b']['sin_recorte']), $pct($x['libre'], $x['b']['doce']));
            if ($m === 'copa') $maxCopa = max($maxCopa, $fin); else $maxDuelo = max($maxDuelo, $fin);
            $todas = $todas && $fin <= 25.0;
        }
    }
    printf("  SIM ventaja máxima pagada (estrella + sede +6 + bono, con bonoFinal): copa %.1f %% · duelos %.1f %% (%.1f s)\n", $maxCopa, $maxDuelo, microtime(true) - $t0);
    check('Copa: la ventaja pagada máxima queda entre 20 y 25 %', true, $maxCopa >= 20.0 && $maxCopa <= 25.0);
    check('Copa y duelos: ninguna estrella pasa del 25 % (con el recorte bonoFinal)', true, $todas);
}

echo "\n----------------------------------------\n";
echo "Resumen pruebas_estrellas.php — correctas: $OK  ·  Fallas: $FALLAS\n";
if (getenv('GUARDAR_TMP') !== '1') exec('rm -rf ' . escapeshellarg($TMP)); else echo "Archivos en $TMP\n";
exit($FALLAS ? 1 : 0);
