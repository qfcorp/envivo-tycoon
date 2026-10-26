<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Nivel VIP 1–10, regalos de asociación, Mecenas, ofertas escalonadas,
// ganchos y techo de ventajas (server/src/Vip.php, Regalos.php, Ganchos.php, Ventajas.php; server/INTEGRAR_VIP.md):
// base SQLite TEMPORAL con TODAS las migraciones, compras de verdad por Compras::insertar/aprobar/revertir (los ganchos
// se emiten aquí con las mismas líneas que INTEGRAR_VIP.md pide en Compras.php), reloj inyectable (Vip::$reloj),
// clases de mentira para SedeOficial/Estrellas y todas las rutas por HTTP (php -S con una copia de api.php + las líneas).
// Uso:  php server/tests/pruebas_vip.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_vip_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Catalogo, Chat, Compras, Cuentas, Db, Fallo, Ganchos, Migraciones, Monedero, Regalos, Social, Ventajas, Vip, VipApi};

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
// Lo que hace arranque.php después de integrar (INTEGRAR_VIP.md §1): registrar los oyentes. Dos veces: no se duplican.
Vip::registrar();
Vip::registrar();

$nuevoJugador = function (string $alias, int $sid = 1): int {
    Db::q('INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (?, ?, 1000, 1, ?)', [$sid, 'Servidor ' . $sid, time()]);
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '.' . bin2hex(random_bytes(2)) . '@prueba.example', $alias, 'x', time(), $sid, $alias, strtolower($alias)]);
    return Db::ultimoId();
};
// Una compra de verdad: pendiente -> aprobada (Compras entrega) -> gancho compra_aprobada (la línea de INTEGRAR_VIP.md §2).
// Si Compras.php ya emite los ganchos (integrado), no se emiten aquí otra vez. "Sin gancho" = se quitan los oyentes un momento.
$fuenteCompras = (string) file_get_contents(dirname(__DIR__) . '/src/Compras.php');
$EMITE_APROBADA = str_contains($fuenteCompras, "'compra_aprobada'");
$EMITE_REVERTIDA = str_contains($fuenteCompras, "'compra_revertida'");
echo '  (Compras.php ' . ($EMITE_APROBADA ? 'ya emite' : 'todavía no emite') . " compra_aprobada; " . ($EMITE_REVERTIDA ? 'ya emite' : 'todavía no emite') . " compra_revertida)\n";
$canal = fn(array $c) => $c['canal'] === 'google_play' ? 'google' : 'plux';
$comprar = function (int $j, string $prod, bool $emitir = true) use ($canal, $EMITE_APROBADA): int {
    $p = Catalogo::productoCompra($prod) ?? Vip::producto($prod);
    if (!$emitir) Ganchos::olvidar('compra_aprobada');
    $c = Db::tx(fn() => Compras::insertar($j, $p, 'web_plux'));
    Compras::aprobar((int) $c['id'], 'prueba');
    if (!$emitir) Vip::registrar();
    $c = Compras::porId((int) $c['id']);
    if ($emitir && !$EMITE_APROBADA) Ganchos::emitir('compra_aprobada', ['compra_id' => (int) $c['id'], 'jugador_id' => (int) $c['jugador_id'], 'producto' => $c['producto'], 'monto_usd' => (float) $c['total'], 'canal' => $canal($c)]);
    return (int) $c['id'];
};
$revertir = function (int $compra, bool $emitir = true) use ($EMITE_REVERTIDA): void {
    if (!$emitir) Ganchos::olvidar('compra_revertida');
    $res = Compras::revertir($compra, 'reembolso', 'prueba', 'prueba');
    if (!$emitir) Vip::registrar();
    $c = Compras::porId($compra);
    if ($emitir && !$EMITE_REVERTIDA && $res !== null) Ganchos::emitir('compra_revertida', ['compra_id' => $compra, 'jugador_id' => (int) $c['jugador_id'], 'motivo' => 'reembolso']);
};
$activar = fn(int $j) => Db::q("UPDATE jugadores SET estado = 'activo', estado_motivo = NULL WHERE id = ?", [$j]);   // el panel levanta la suspensión
$nivelBD = fn(int $j) => Vip::nivelGuardado($j);

// =====================================================================
titulo('Migración vip.sql (con todas las demás) y otra vez sin error');
$tablas = Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'vip_%' ORDER BY name");
check('Tablas vip_jugadores, vip_mensual, vip_ofertas, vip_ofertas_compras, vip_regalos', ['vip_jugadores', 'vip_mensual', 'vip_ofertas', 'vip_ofertas_compras', 'vip_regalos'], array_column($tablas, 'name'));
check('Aplicar vip.sql otra vez no cambia nada', [], Migraciones::aplicar('vip.sql'));
check('Los oyentes se registran una sola vez (aunque registrar() corra dos veces)', true, Ganchos::hay('compra_aprobada') && Ganchos::hay('compra_revertida'));

// =====================================================================
titulo('Umbrales del nivel VIP (dólares de compras aprobadas)');
check('Umbrales por defecto', [1.0, 5.0, 15.0, 30.0, 50.0, 100.0, 200.0, 350.0, 600.0, 1000.0], Vip::umbrales());
check('nivelPara: 0 · 0,99 · 1 · 4,99 · 5 · 14,99 · 15 · 29,99 · 999,99 · 1000 · 5000', [0, 0, 1, 1, 2, 2, 3, 3, 9, 10, 10],
    array_map([Vip::class, 'nivelPara'], [0, 0.99, 1, 4.99, 5, 14.99, 15, 29.99, 999.99, 1000, 5000]));
Ajustes::set('vip_umbrales', '2, 4, 6, 8, 10, 12, 14, 16, 18, 20');
check('Ajuste vip_umbrales editado en el panel', [2, 10], [Vip::nivelPara(4.5), Vip::nivelPara(25)]);
foreach (['1,2,3', '5,4,3,2,1,6,7,8,9,10', 'a,b,c,d,e,f,g,h,i,j', '0,1,2,3,4,5,6,7,8,9'] as $malo) { Ajustes::set('vip_umbrales', $malo); $u[] = Vip::umbrales() === array_map('floatval', Vip::UMBRALES); }
check('Umbrales mal escritos (pocos, desordenados, letras, cero) -> los de por defecto', [true, true, true, true], $u);
Ajustes::set('vip_umbrales', '');
check('Tabla de ventajas: 10 niveles, puntos ($1 = 10), intentos +1 en 3/6/9, 2.º espacio de obra desde VIP 4, título y marco',
    [10, [10, 50, 150], [0, 0, 1, 1, 1, 2, 2, 2, 3, 3], [1, 1, 1, 2, 2, 2, 2, 2, 2, 2], true, true],
    [count(Vip::tabla()), array_slice(array_column(Vip::tabla(), 'puntos'), 0, 3), array_column(Vip::tabla(), 'intentos_extra'), array_column(Vip::tabla(), 'slots_obra'),
     count(array_filter(Vip::tabla(), fn($n) => $n['titulo'] !== '' && preg_match('/^#[0-9a-f]{6}$/', $n['color']))) === 10,
     count(array_unique(array_column(Vip::tabla(), 'titulo'))) === 10]);
check('El regalo mensual de cada nivel nunca trae créditos', true, !array_filter(array_merge(...array_values(Vip::MENSUAL)), fn($e) => !in_array($e['tipo'], ['dinero', 'consumible', 'reparar_todo'], true)));

// =====================================================================
titulo('Nivel por compras: solo aprobadas; sube, avisa y desbloquea su oferta');
$B = $nuevoJugador('Ballena Andina');
check('Sin compras: VIP 0, sin fila', [0, false], [Vip::nivel($B), (bool) Db::valor('SELECT 1 FROM vip_jugadores WHERE jugador_id = ?', [$B])]);
$pend = Db::tx(fn() => Compras::insertar($B, Catalogo::producto('creditos_3200'), 'web_plux'));
$rech = Db::tx(fn() => Compras::insertar($B, Catalogo::producto('creditos_3200'), 'web_plux'));
Compras::rechazar((int) $rech['id'], 'RECHAZADO');
check('Compras pendiente y rechazada no cuentan', [0.0, 0], [Vip::gastado($B), Vip::nivel($B)]);
$c1 = $comprar($B, 'creditos_250');   // $1,99
check('Una compra de $1,99 -> VIP 1 (y el gancho lo guarda)', [1, 1], [Vip::nivel($B), $nivelBD($B)]);
check('Al subir: oferta "vip:1" (nivel_s) y NADA en el canal del sistema (no tapa los avisos de moderación)', [false, ['vip:1']],
    [(bool) Db::valor('SELECT 1 FROM chat_mensajes WHERE canal = ?', ['sistema:' . $B]), array_column(Db::todas('SELECT hito FROM vip_ofertas WHERE jugador_id = ?', [$B]), 'hito')]);
$comprar($B, 'creditos_3200');   // +$19,99 = $21,98
check('+$19,99 = $21,98 -> VIP 3 (salta el 2; oferta solo del nivel nuevo)', [3, ['vip:1', 'vip:3']], [Vip::nivel($B), array_column(Db::todas('SELECT hito FROM vip_ofertas WHERE jugador_id = ? ORDER BY id', [$B]), 'hito')]);
check('Progreso: 219 puntos, siguiente VIP 4 a 300, faltan 81, 46 % del tramo 150→300', ['puntos' => 219, 'siguiente' => 4, 'siguiente_puntos' => 300, 'faltan' => 81, 'pct' => 46], Vip::progreso($B, 3));
check('intentosExtra VIP 3 = 1 · slotsObra VIP 3 = 1', [1, 1], [Vip::intentosExtra($B), Vip::slotsObra($B)]);
$T = $nuevoJugador('Transferida');
Db::tx(fn() => Compras::insertar($T, Catalogo::producto('transferencia_cuenta'), 'web_plux'));
Db::q("UPDATE compras SET estado = 'pagado', pagado_en = ? WHERE jugador_id = ?", [time(), $T]);
check('La transferencia de cuenta ($9,99) no cuenta para el VIP', [0.0, 0], [Vip::gastado($T), Vip::nivel($T)]);
$L = $nuevoJugador('Sin Gancho');
$comprar($L, 'creditos_1500', false);   // el gancho no llegó: igual sube al mirar el nivel
check('Sin gancho, el nivel igual se pone al día al leerlo (VIP 2)', [0, 2, 2], [$nivelBD($L), Vip::nivel($L), $nivelBD($L)]);
Ajustes::set('vip_umbrales', '10,50,150,300,500,1000,2000,3500,6000,10000');
check('Subir los umbrales en el panel NO baja el nivel de nadie', [3, 2], [Vip::nivel($B), Vip::nivel($L)]);
check('…y el avance no se rompe (0 % hacia VIP 4, con 219 de 3000 puntos)', [4, 0], [Vip::progreso($B, 3)['siguiente'], Vip::progreso($B, 3)['pct']]);
Ajustes::set('vip_umbrales', '');

// =====================================================================
titulo('Compras revertidas bajan el nivel (lo único que lo baja)');
$R = $nuevoJugador('Reembolsos');
$r1 = $comprar($R, 'creditos_700');   // 4,99 -> VIP 1
$r2 = $comprar($R, 'creditos_1500');  // +9,99 = 14,98 -> VIP 2
check('Antes: $14,98 -> VIP 2', 2, Vip::nivel($R));
$revertir($r2);
check('Revertida la de $9,99 (con gancho): queda $4,99 -> VIP 1', [1, 1, 4.99], [$nivelBD($R), Vip::nivel($R), Vip::gastado($R)]);
check('…y queda en la auditoría', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'vip_baja' AND jugador_id = ?", [$R]));
$activar($R);
$r3 = $comprar($R, 'creditos_250');
check('Otra compra la sube de nuevo según lo pagado ($6,98 -> VIP 2)', 2, Vip::nivel($R));
$revertir($r3, false);   // sin gancho: se nota al leer el nivel (compras.revertida_en más nuevo que lo revisado)
check('Revertida sin gancho: al leer el nivel baja a VIP 1', [2, 1], [$nivelBD($R), Vip::nivel($R)]);
check('Una compra revertida no se vuelve a contar ni a revertir', [null, 1], [Compras::revertir($r3, 'reembolso', 'x', 'prueba'), Vip::nivel($R)]);
$activar($R);

// =====================================================================
titulo('Regalos de asociación: todos los miembros, contenido fijo por monto, nunca créditos');
$P = $nuevoJugador('Productora Mecenas');
$M = [];
for ($k = 1; $k <= 3; $k++) $M[$k] = $nuevoJugador('Socio ' . $k);
$X = $nuevoJugador('Otra Asociación');
$asoc = Social::crear($P, ['nombre' => 'Asociación Volcán', 'siglas' => 'VOL', 'color' => '#ff3b3b', 'pagado_en_juego' => true])['asociacion']['id'];
foreach ($M as $m) Social::unirse($m, $asoc);
Social::crear($X, ['nombre' => 'Asociación Lejana', 'siglas' => 'LEJ', 'color' => '#4da3ff', 'pagado_en_juego' => true]);
$saldos = array_map(fn($j) => Monedero::saldo($j), [$M[1], $M[2], $M[3], $X]);
$g1 = $comprar($P, 'creditos_700');   // $4,99 -> cofre 2
$fil = Db::todas('SELECT * FROM vip_regalos WHERE compra_id = ? ORDER BY receptor_id', [$g1]);
check('Una compra -> un cofre para cada miembro (4, también el comprador); nada a otra asociación', [4, [$P, $M[1], $M[2], $M[3]], 0],
    [count($fil), array_map('intval', array_column($fil, 'receptor_id')), (int) Db::valor('SELECT COUNT(*) FROM vip_regalos WHERE receptor_id = ?', [$X])]);
check('Cofre "Regalo de <alias>", tamaño 2 por $4,99, vence en 7 días, pendiente', ['Productora Mecenas', 2, 7 * 86400, 'pendiente'],
    [$fil[1]['de_nombre'], (int) $fil[1]['nivel'], (int) $fil[1]['vence'] - (int) $fil[1]['creado'], $fil[1]['estado']]);
check('Contenido: solo dinero del juego y repuestos (sin créditos)', Regalos::COFRES[2]['contenido'], json_decode($fil[1]['contenido_json'], true));
check('Tamaños: $0,99 -> 1 · $1,99 -> 1 · $4,99 -> 2 · $9,99 -> 3 · $19,99 -> 4 · $50 -> 5', [1, 1, 2, 3, 4, 5], array_map([Regalos::class, 'cofrePara'], [0.99, 1.99, 4.99, 9.99, 19.99, 50]));
check('Ningún cofre trae créditos ni equipos', true, !array_filter(array_merge(...array_column(Regalos::COFRES, 'contenido')), fn($e) => !in_array($e['tipo'], Regalos::TIPOS, true)));
check('Aviso en el chat de la asociación', true, (bool) Db::valor("SELECT 1 FROM chat_mensajes WHERE canal = ? AND jugador_id IS NULL AND texto LIKE '%Productora Mecenas%cofre%'", ['asociacion:' . $asoc]));
Ganchos::emitir('compra_aprobada', ['compra_id' => $g1, 'jugador_id' => $P, 'producto' => 'creditos_700', 'monto_usd' => 4.99, 'canal' => 'plux']);
check('El gancho repetido no duplica cofres', 4, (int) Db::valor('SELECT COUNT(*) FROM vip_regalos WHERE compra_id = ?', [$g1]));
check('Un gancho con datos falsos (jugador que no es el comprador) no crea nada', [0, 0], Regalos::alAprobar(['compra_id' => $g1, 'jugador_id' => $X, 'monto_usd' => 999]));
check('/api/estado: regalos_pendientes y vip_nivel', ['vip_nivel' => 0, 'regalos_pendientes' => 1], VipApi::estado($M[1]));
check('Sin sesión: vip_nivel 0, regalos_pendientes 0', ['vip_nivel' => 0, 'regalos_pendientes' => 0], VipApi::estado(null));
Vip::guardarPreferencias($P, ['anonimo' => true]);
$g2 = $comprar($P, 'creditos_250');
check('Comprador anónimo: el cofre no lleva su nombre (de = null) y el chat dice "Una productora anónima"', [null, true],
    [Db::valor('SELECT de_nombre FROM vip_regalos WHERE compra_id = ? AND receptor_id = ?', [$g2, $M[1]]),
     (bool) Db::valor("SELECT 1 FROM chat_mensajes WHERE canal = ? AND texto LIKE 'Una productora anónima%' OR texto LIKE '%Una productora anónima%'", ['asociacion:' . $asoc])]);
Vip::guardarPreferencias($P, ['anonimo' => false]);
$g3 = $comprar($P, 'transferencia_cuenta');
check('La transferencia de cuenta no da cofres', 0, (int) Db::valor('SELECT COUNT(*) FROM vip_regalos WHERE compra_id = ?', [$g3]));

titulo('Tope diario de cofres por miembro (una ballena no inunda)');
Ajustes::set('vip_regalos_dia', '3');
$g4 = $comprar($P, 'creditos_1500');
$g5 = $comprar($P, 'creditos_3200');
check('Con tope 3: el 3.º cofre del día llega, el 4.º no (a nadie)', [4, 0], [(int) Db::valor('SELECT COUNT(*) FROM vip_regalos WHERE compra_id = ?', [$g4]), (int) Db::valor('SELECT COUNT(*) FROM vip_regalos WHERE compra_id = ?', [$g5])]);
check('Cada miembro: 3 cofres hoy', [3, 3, 3, 3], array_map(fn($j) => (int) Db::valor("SELECT COUNT(*) FROM vip_regalos WHERE receptor_id = ? AND estado <> 'cancelado'", [$j]), [$P, $M[1], $M[2], $M[3]]));
check('…pero la compra igual cuenta para el VIP del comprador ($36,96 -> VIP 4)', [36.96, 4], [Vip::gastado($P), Vip::nivel($P)]);
Vip::$reloj = time() + 86400;
$g6 = $comprar($P, 'creditos_250');
check('Al día siguiente vuelve a llegar', 4, (int) Db::valor('SELECT COUNT(*) FROM vip_regalos WHERE compra_id = ?', [$g6]));
Vip::$reloj = null;
Ajustes::set('vip_regalos_dia', '');

titulo('Reclamar: una sola vez, solo el dueño, dentro de 7 días');
$mio = Regalos::pendientes($M[1]);
check('Pendientes de un socio: 4 cofres con de, contenido, vence', [4, true], [count($mio), isset($mio[0]['de'], $mio[0]['contenido'], $mio[0]['vence'])]);
$idG1 = (int) Db::valor('SELECT id FROM vip_regalos WHERE compra_id = ? AND receptor_id = ?', [$g1, $M[1]]);
$ent0 = (int) Db::valor('SELECT COUNT(*) FROM entregas WHERE jugador_id = ?', [$M[1]]);
$r = Regalos::reclamar($M[1], $idG1);
check('Reclamar entrega el contenido como entregas (origen regalo:<id>)', [true, 2, ['dinero', 'consumible'], 'regalo:' . $idG1, 3],
    [$r['ok'], count($r['entregas']), array_column($r['entregas'], 'tipo'), $r['entregas'][0]['origen'], $r['pendientes']]);
check('…aparecen en las entregas del jugador', $ent0 + 2, (int) Db::valor('SELECT COUNT(*) FROM entregas WHERE jugador_id = ?', [$M[1]]));
check('Reclamar otra vez -> 409 ya_reclamado (y no entrega nada más)', [[409, 'ya_reclamado'], $ent0 + 2], [falla(fn() => Regalos::reclamar($M[1], $idG1)), (int) Db::valor('SELECT COUNT(*) FROM entregas WHERE jugador_id = ?', [$M[1]])]);
check('Reclamar el cofre de otro -> 404', [404, 'regalo_no_existe'], falla(fn() => Regalos::reclamar($M[2], $idG1)));
check('Los créditos de los socios no cambiaron (nunca créditos)', $saldos, array_map(fn($j) => Monedero::saldo($j), [$M[1], $M[2], $M[3], $X]));
$idV = (int) Db::valor('SELECT id FROM vip_regalos WHERE compra_id = ? AND receptor_id = ?', [$g1, $M[3]]);
Vip::$reloj = time() + 8 * 86400;
check('A los 8 días: vencido -> 410 regalo_vencido y ya no sale en pendientes', [[410, 'regalo_vencido'], false],
    [falla(fn() => Regalos::reclamar($M[3], $idV)), in_array($idV, array_column(Regalos::pendientes($M[3]), 'id'), true)]);
check('…en la base queda "vencido"', 'vencido', Db::valor('SELECT estado FROM vip_regalos WHERE id = ?', [$idV]));
Vip::$reloj = null;

titulo('Compra revertida: los cofres sin abrir se cancelan');
$idG4a = (int) Db::valor('SELECT id FROM vip_regalos WHERE compra_id = ? AND receptor_id = ?', [$g4, $M[1]]);
Regalos::reclamar($M[1], $idG4a);   // este ya lo abrió
$revertir($g4);
check('De la compra revertida: el abierto se queda, el vencido sigue vencido, los otros 2 se cancelan', ['cancelado' => 2, 'reclamado' => 1, 'vencido' => 1],
    array_count_values(array_column(Db::todas('SELECT estado FROM vip_regalos WHERE compra_id = ? ORDER BY estado', [$g4]), 'estado')));
$idG4b = (int) Db::valor('SELECT id FROM vip_regalos WHERE compra_id = ? AND receptor_id = ?', [$g4, $M[2]]);
check('Reclamar uno cancelado -> 410 regalo_cancelado', [410, 'regalo_cancelado'], falla(fn() => Regalos::reclamar($M[2], $idG4b)));
check('…y el nivel del comprador baja con lo revertido ($38,95 - $9,99 = $28,96 -> VIP 3)', [28.96, 3], [Vip::gastado($P), Vip::nivel($P)]);
$activar($P);

// =====================================================================
titulo('Regalo mensual: contenido fijo, una vez por mes');
$N = $nuevoJugador('Nunca Compró');
check('Sin nivel -> 403 vip_requerido', [403, 'vip_requerido'], falla(fn() => Vip::reclamarMensual($N)));
check('Estado mensual sin nivel: no disponible', false, Vip::mensual($N)['disponible']);
$m1 = Vip::reclamarMensual($B);   // VIP 3
check('VIP 3 reclama: las entregas de MENSUAL[3] (origen vip_mensual:<mes>)', [count(Vip::MENSUAL[3]), array_column(Vip::MENSUAL[3], 'tipo'), 'vip_mensual:' . date('Y-m'), false, true],
    [count($m1['entregas']), array_column($m1['entregas'], 'tipo'), $m1['entregas'][0]['origen'], $m1['mensual']['disponible'], $m1['mensual']['reclamado']]);
check('Otra vez el mismo mes -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => Vip::reclamarMensual($B)));
Vip::$reloj = (new DateTimeImmutable('first day of next month 10:00'))->getTimestamp();
check('El mes siguiente vuelve a estar disponible y se reclama', [true, true], [Vip::mensual($B)['disponible'], Vip::reclamarMensual($B)['ok']]);
Vip::$reloj = null;

// =====================================================================
titulo('Ofertas escalonadas: hito, contenido fijo, tope y vencimiento');
$O = $nuevoJugador('Ofertas');
check('Producto de oferta sin desbloquear -> 409 oferta_no_disponible', [409, 'oferta_no_disponible'], falla(fn() => Vip::exigirOferta($O, Vip::producto('oferta_vip_s'))));
check('Un producto normal no pasa por aquí', [200, null], falla(fn() => Vip::exigirOferta($O, Catalogo::producto('creditos_250'))));
$comprar($O, 'bienvenida');   // $0,99: no llega a VIP 1
check('$0,99 no llega a VIP 1: sin oferta', [0, []], [Vip::nivel($O), Vip::ofertas($O)]);
$comprar($O, 'creditos_250');  // $2,98 -> VIP 1 -> oferta nivel_s
$of = Vip::ofertas($O);
check('VIP 1 desbloquea "Primer impulso": precio, créditos, entregas a la vista, tope 1, vence en 72 h', ['oferta_vip_s', 1.99, 300, 2, 1, 1, true],
    [$of[0]['producto'], $of[0]['precio'], $of[0]['creditos'], count($of[0]['entregas']), $of[0]['tope'], $of[0]['quedan'], abs(strtotime($of[0]['vence']) - time() - 72 * 3600) < 5]);
check('Desbloqueada -> se puede comprar', [200, null], falla(fn() => Vip::exigirOferta($O, Vip::producto('oferta_vip_s'))));
check('El mismo hito no crea otra oferta', false, Vip::hito($O, 'nivel_s', 'vip:1'));
$co = $comprar($O, 'oferta_vip_s');
check('Comprada: cuenta 1 de 1 y ya no sale ni se puede comprar', [1, [], [409, 'oferta_no_disponible']],
    [(int) Db::valor("SELECT compradas FROM vip_ofertas WHERE jugador_id = ? AND hito = 'vip:1'", [$O]), Vip::ofertas($O), falla(fn() => Vip::exigirOferta($O, Vip::producto('oferta_vip_s')))]);
Ganchos::emitir('compra_aprobada', ['compra_id' => $co, 'jugador_id' => $O, 'producto' => 'oferta_vip_s', 'monto_usd' => 1.99, 'canal' => 'plux']);
check('El gancho repetido no la cuenta dos veces', 1, (int) Db::valor("SELECT compradas FROM vip_ofertas WHERE jugador_id = ? AND hito = 'vip:1'", [$O]));
check('La oferta también cuenta para el nivel ($4,97 -> VIP 1)', 1, Vip::nivel($O));
Ganchos::emitir('copa_ganada', ['jugador_id' => $O, 'copa_id' => 1]);
Ganchos::emitir('sede_nivel', ['jugador_id' => $O, 'nivel' => 10]);
check('Primera Copa ganada y Sede nivel 10 (ganchos): oferta del campeón, sede 5 y sede 10', ['oferta_campeon', 'oferta_sede_10', 'oferta_sede_5'],
    (function () use ($O) { $p = array_column(Vip::ofertas($O), 'producto'); sort($p); return $p; })());
Vip::$reloj = time() + 8 * 86400;
check('A los 8 días ya vencieron (no salen, no se compran)', [[], [409, 'oferta_no_disponible']], [Vip::ofertas($O), falla(fn() => Vip::exigirOferta($O, Vip::producto('oferta_campeon')))]);
Vip::$reloj = null;
$C = $nuevoJugador('Campeona');
Db::q("INSERT INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (1, '2026-W40', 'x', 'Copa', 'cerrada', 0, 1, 0)");
Db::q("INSERT INTO copa_premios (copa_id, jugador_id, clave, entregado) VALUES (?, ?, 'campeon', ?)", [Db::ultimoId(), $C, time()]);
check('Sin gancho: GET /api/vip ve la copa ganada en copa_premios y desbloquea la oferta', ['oferta_campeon'], array_column(Vip::estado($C)['ofertas'], 'producto'));
check('Todas las ofertas son variantes de paquetes de créditos que dan MÁS que el paquete del mismo precio', true,
    (bool) array_product(array_map(function ($p) { $base = ['1.99' => 250, '4.99' => 700, '9.99' => 1500][(string) $p['precio']] ?? PHP_INT_MAX; return $p['creditos'] > $base && !empty($p['entregas']) && !empty($p['oferta_vip']); }, Vip::PRODUCTOS_OFERTA)));

// =====================================================================
titulo('Mecenas del servidor: semana y siempre, solo nombres (nunca montos), con salida voluntaria');
$S2a = $nuevoJugador('Mecenas Uno', 2); $S2b = $nuevoJugador('Mecenas Dos', 2); $S2c = $nuevoJugador('Mecenas Tres', 2); $S2d = $nuevoJugador('Mecenas Oculto', 2);
$S3 = $nuevoJugador('Otro Servidor', 3);
$viejo = $comprar($S2a, 'creditos_3200');   // la más grande, pero de hace 10 días
Db::q('UPDATE compras SET pagado_en = ? WHERE id = ?', [time() - 10 * 86400, $viejo]);
$comprar($S2a, 'creditos_250');
$comprar($S2b, 'creditos_1500');
$comprar($S2c, 'creditos_700');
$comprar($S2d, 'creditos_3200');
$comprar($S3, 'creditos_3200');
Vip::guardarPreferencias($S2d, ['ocultar_mecenas' => true]);
$mec = Vip::mecenas($S2b);
check('Semana: Dos, Tres, Uno (lo de hace 10 días no cuenta); sin el oculto ni el de otro servidor', ['Mecenas Dos', 'Mecenas Tres', 'Mecenas Uno'], array_column($mec['lista_semana'], 'nombre'));
check('Siempre: Uno primero ($21,98), luego Dos y Tres', ['Mecenas Uno', 'Mecenas Dos', 'Mecenas Tres'], array_column($mec['lista_siempre'], 'nombre'));
check('Mi puesto (semana 1, siempre 2) y "yo" marcado', [['semana' => 1, 'siempre' => 2], [true, false, false]], [$mec['yo'], array_column($mec['lista_semana'], 'yo')]);
$json = json_encode($mec);
check('Ningún monto en la respuesta (solo posicion, nombre, nivel, insignia, yo)', [['posicion', 'nombre', 'nivel', 'insignia', 'yo'], false, false],
    [array_keys($mec['lista_siempre'][0]), str_contains($json, '19.99') || str_contains($json, '21.98') || str_contains($json, '"total"'), str_contains($json, 'jugador_id')]);
check('El oculto no se ve, pero sí ve su propio estado (oculto: true, sin puesto)', [true, ['semana' => null, 'siempre' => null]], [Vip::mecenas($S2d)['oculto'], Vip::mecenas($S2d)['yo']]);
Vip::guardarPreferencias($S2d, ['ocultar_mecenas' => false]);
check('Si vuelve a mostrarse, sale primero en la semana', 'Mecenas Oculto', Vip::mecenas($S2b)['lista_semana'][0]['nombre']);
Db::q("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$S2d]);
check('Una cuenta baneada no sale en Mecenas', false, in_array('Mecenas Oculto', array_column(Vip::mecenas($S2b)['lista_siempre'], 'nombre'), true));
check('Preferencias: valores no booleanos -> 400; vacío -> 400', [[400, 'datos_invalidos'], [400, 'datos_invalidos']], [falla(fn() => Vip::guardarPreferencias($S2b, ['anonimo' => 'si'])), falla(fn() => Vip::guardarPreferencias($S2b, []))]);

// =====================================================================
titulo('Ventajas: techo del bono pagado (clases de mentira para Sede oficial y Personal estrella)');
eval('namespace EnVivo\Prueba; final class SedeFalsa { public static int $v = 0; public static function bonoCompetencia(int $j): int { return self::$v; } }
      final class EstrellasFalsa { public static int $v = 0; public static ?string $modo = null; public static function bonoCompetencia(int $j, string $m): int { self::$modo = $m; return self::$v; } }
      final class Rota { public static function bonoCompetencia(int $j): int { throw new \RuntimeException("rota"); } }');
check('Sin SedeOficial ni Estrellas (aún no existen): bono 0', ['total' => 0, 'partes' => [], 'tope' => 12], Ventajas::bono($B, 'copa'));
Ventajas::$fuentes = ['sede' => 'EnVivo\\Prueba\\SedeFalsa', 'estrella' => 'EnVivo\\Prueba\\EstrellasFalsa'];
\EnVivo\Prueba\SedeFalsa::$v = 4; \EnVivo\Prueba\EstrellasFalsa::$v = 5;
check('Sede 4 + estrella 5 = 9 (copa); a Estrellas le llega el modo', [['total' => 9, 'partes' => [['clave' => 'sede', 'pts' => 4], ['clave' => 'estrella', 'pts' => 5]], 'tope' => 12], 'copa'],
    [Ventajas::bono($B, 'copa'), \EnVivo\Prueba\EstrellasFalsa::$modo]);
\EnVivo\Prueba\SedeFalsa::$v = 6; \EnVivo\Prueba\EstrellasFalsa::$v = 6;
check('6 + 6 = 12 (justo el techo)', 12, Ventajas::bono($B, 'duelo')['total']);
\EnVivo\Prueba\SedeFalsa::$v = 50; \EnVivo\Prueba\EstrellasFalsa::$v = -3;
check('Cada parte se recorta a 0..6 (50 -> 6, -3 -> 0)', ['total' => 6, 'partes' => [['clave' => 'sede', 'pts' => 6]], 'tope' => 12], Ventajas::bono($B, 'copa'));
\EnVivo\Prueba\SedeFalsa::$v = 6; \EnVivo\Prueba\EstrellasFalsa::$v = 6;
Ajustes::set('ventajas_tope', '8');
$b8 = Ventajas::bono($B, 'copa');
check('Ajuste ventajas_tope = 8: total 8 y las partes suman 8 (se recorta la última)', [8, 8, [6, 2]], [$b8['total'], array_sum(array_column($b8['partes'], 'pts')), array_column($b8['partes'], 'pts')]);
foreach (['abc' => 12, '99' => 24, '0' => 0, '-1' => 12] as $v => $esp) { Ajustes::set('ventajas_tope', (string) $v); $tp[] = [Ventajas::tope(), $esp]; }
check('Tope mal escrito -> 12; muy alto -> 24; 0 -> sin bono', true, (bool) array_product(array_map(fn($x) => $x[0] === $x[1], $tp)));
Ajustes::set('ventajas_tope', '');
check('Liga, Festival y Desafío: sin bono', [0, 0, 0], [Ventajas::bono($B, 'liga')['total'], Ventajas::bono($B, 'festival')['total'], Ventajas::bono($B, 'desafio')['total']]);
Ventajas::$fuentes = ['sede' => 'EnVivo\\Prueba\\Rota', 'estrella' => 'EnVivo\\Prueba\\EstrellasFalsa'];
check('Una parte que falla vale 0 y no rompe nada', ['total' => 6, 'partes' => [['clave' => 'estrella', 'pts' => 6]], 'tope' => 12], Ventajas::bono($B, 'copa'));
Ventajas::$fuentes = ['sede' => 'EnVivo\\Prueba\\SedeFalsa', 'estrella' => 'EnVivo\\Prueba\\EstrellasFalsa'];
\EnVivo\Prueba\SedeFalsa::$v = 3; \EnVivo\Prueba\EstrellasFalsa::$v = 0;
Db::q("INSERT INTO duelo_equipos (jugador_id, servidor_id, equipo_json, resumen_json, poder, cambios, actualizado) VALUES (?, 1, '{}', '{}', 140, 1, ?)", [$B, time()]);
check('poder(): equipo de duelo 140 + 4 × bono 3 = 152', ['total' => 152, 'equipo' => 140, 'bono' => 3], Ventajas::poder($B));
check('poder() sin equipo de duelo: solo el bono', ['total' => 12, 'equipo' => 0, 'bono' => 3], Ventajas::poder($N));

// =====================================================================
titulo('Ganchos: un oyente que falla no rompe la compra ni a los demás');
Ganchos::en('prueba', function (array $d): void { Db::q("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('gancho_a', '1', 0)"); }, 'a');
Ganchos::en('prueba', function (array $d): void { Db::q("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('gancho_b', '1', 0)"); throw new RuntimeException('se cayó'); }, 'b');
Ganchos::en('prueba', function (array $d): void { Db::q("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('gancho_c', '1', 0)"); }, 'c');
Ganchos::en('prueba', function (array $d): void {}, 'c');   // misma clave: no se duplica
check('Fuera de una transacción: 1 falla; lo de "b" se deshace, "a" y "c" quedan', [1, ['gancho_a', 'gancho_c']],
    [Ganchos::emitir('prueba', ['compra_id' => 1]), array_column(Db::todas("SELECT clave FROM ajustes WHERE clave LIKE 'gancho_%' ORDER BY clave"), 'clave')]);
Db::q("DELETE FROM ajustes WHERE clave LIKE 'gancho_%'");
$n = Db::tx(function (): int { Db::q("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('gancho_compra', '1', 0)"); return Ganchos::emitir('prueba', ['compra_id' => 1]); });
check('Dentro de una transacción (como en Compras::aprobar): SAVEPOINT por oyente; la compra y "a", "c" quedan', [1, ['gancho_a', 'gancho_c', 'gancho_compra']],
    [$n, array_column(Db::todas("SELECT clave FROM ajustes WHERE clave LIKE 'gancho_%' ORDER BY clave"), 'clave')]);
check('El fallo queda en avisos (gancho_fallo) para el Centro de Control', 2, (int) Db::valor("SELECT COUNT(*) FROM avisos WHERE tipo = 'gancho_fallo' AND detalle LIKE '%se cayó%'"));
check('Evento sin oyentes: 0', 0, Ganchos::emitir('nadie_escucha', []));
Ganchos::olvidar('prueba');

// =====================================================================
titulo('Rutas por HTTP (copia de api.php + las líneas de INTEGRAR_VIP.md)');
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$ancla = "    if (\\EnVivo\\LigaApi::esRuta(\$ruta))";
$linea = "    if (\\EnVivo\\VipApi::esRuta(\$ruta)) \\EnVivo\\VipApi::responder(\$ruta, \$metodo, requiere_sesion());\n";
$estadoAncla = "'/estado' => \$soloGet() && Http::json(200, ";
if (!str_contains($api, 'VipApi::esRuta')) {
    check('api.php tiene el punto donde va la línea de rutas (antes de LigaApi)', true, str_contains($api, $ancla));
    $api = str_replace($ancla, $linea . $ancla, $api);
}
if (!str_contains($api, 'VipApi::estado')) {
    check('api.php tiene la ruta /estado donde se suman vip_nivel y regalos_pendientes', true, str_contains($api, $estadoAncla));
    $api = str_replace($estadoAncla, $estadoAncla . '\EnVivo\VipApi::estado(Sesiones::jugadorId()) + ', $api);
}
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ";\n\\EnVivo\\Vip::registrar();", $api);
file_put_contents($TMP . '/api.php', $api);
$puerto = (int) (getenv('P_APP') ?: 9400 + random_int(0, 500));
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-S', '127.0.0.1:' . $puerto, $TMP . '/api.php'],
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
$cod = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null, $r[1]['ok'] ?? null];
$tokM = $sesion($M[2]);
$tokB = $sesion($B);
check('GET /api/vip sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida', false], $cod($http('GET', '/api/vip')));
check('GET /api/mecenas sin sesión -> 401', 401, $http('GET', '/api/mecenas')[0]);
check('POST /api/vip/mensual sin X-Envivo -> 403', [403, 'cabecera_requerida', false], $cod($http('POST', '/api/vip/mensual', [], $tokB, false)));
[$c, $j] = $http('GET', '/api/vip', null, $tokB);
check('GET /api/vip -> 200: nivel, insignia, progreso, niveles (10), mensual, regalos, ofertas, ajustes, intentos_extra, slots_obra',
    [200, 3, 10, true],
    [$c, $j['nivel'] ?? null, count($j['niveles'] ?? []), isset($j['insignia']['color'], $j['progreso']['pct'], $j['mensual']['contenido'], $j['ajustes']) && is_array($j['regalos']) && is_array($j['ofertas']) && $j['intentos_extra'] === 1 && $j['slots_obra'] === 1]);
[$c, $j] = $http('GET', '/api/vip', null, $tokM);
$pend = array_column($j['regalos'] ?? [], 'id');
check('GET /api/vip de un socio: sus cofres pendientes', [200, true], [$c, count($pend) >= 1]);
[$c, $j] = $http('POST', '/api/vip/regalo/reclamar', ['id' => $pend[0]], $tokM);
check('POST /api/vip/regalo/reclamar {id} -> 200 con entregas', [200, true, true], [$c, $j['ok'] ?? null, count($j['entregas'] ?? []) >= 1]);
check('…otra vez -> 409 ya_reclamado', [409, 'ya_reclamado', false], $cod($http('POST', '/api/vip/regalo/reclamar', ['id' => $pend[0]], $tokM)));
check('…con id como texto también vale (el siguiente cofre)', [true, 200], [count($pend) >= 2, $http('POST', '/api/vip/regalo/reclamar', ['id' => (string) ($pend[1] ?? 0)], $tokM)[0]]);
check('…sin id -> 400', [400, 'datos_invalidos', false], $cod($http('POST', '/api/vip/regalo/reclamar', [], $tokM)));
check('…el de otro -> 404', [404, 'regalo_no_existe', false], $cod($http('POST', '/api/vip/regalo/reclamar', ['id' => $idG1], $tokB)));
check('GET /api/vip/regalo/reclamar -> 405', 405, $http('GET', '/api/vip/regalo/reclamar', null, $tokM)[0]);
check('POST /api/vip/mensual sin nivel -> 403 vip_requerido', [403, 'vip_requerido', false], $cod($http('POST', '/api/vip/mensual', [], $tokM)));
$tokR = $sesion($R);
[$c, $j] = $http('POST', '/api/vip/mensual', [], $tokR);
check('POST /api/vip/mensual con VIP 1 -> 200 con entregas; otra vez 409', [200, count(Vip::MENSUAL[1]), [409, 'ya_reclamado', false]], [$c, count($j['entregas'] ?? []), $cod($http('POST', '/api/vip/mensual', [], $tokR))]);
[$c, $j] = $http('GET', '/api/mecenas', null, $sesion($S2b));
check('GET /api/mecenas -> 200 con lista_semana, lista_siempre, yo, semana; sin montos', [200, true, false], [$c, isset($j['lista_semana'], $j['lista_siempre'], $j['yo'], $j['semana']['inicio']), str_contains(json_encode($j), '"total"')]);
[$c, $j] = $http('POST', '/api/vip/ajustes', ['anonimo' => true, 'ocultar_mecenas' => true], $tokB);
check('POST /api/vip/ajustes -> 200 y se guardan', [200, ['anonimo' => true, 'ocultar_mecenas' => true]], [$c, $j['ajustes'] ?? null]);
check('POST /api/vip/ajustes con texto -> 400', [400, 'datos_invalidos', false], $cod($http('POST', '/api/vip/ajustes', ['anonimo' => 'no'], $tokB)));
check('POST /api/vip -> 405 · GET /api/vip/otra -> 404 (api.php) · POST /api/mecenas -> 405', [405, 404, 405],
    [$http('POST', '/api/vip', [], $tokB)[0], $http('GET', '/api/vip/otra', null, $tokB)[0], $http('POST', '/api/mecenas', [], $tokB)[0]]);
[$c, $j] = $http('GET', '/api/estado', null, $tokM);
check('GET /api/estado (con la línea) -> vip_nivel y regalos_pendientes', [200, 0, true], [$c, $j['vip_nivel'] ?? null, is_int($j['regalos_pendientes'] ?? null)]);
[$c, $j] = $http('GET', '/api/estado', null, $tokB);
check('GET /api/estado de la ballena -> vip_nivel 3 (y el bono del Pase VIP sigue igual: vip_activo)', [200, 3, false], [$c, $j['vip_nivel'] ?? null, $j['vip_activo'] ?? null]);
[$c, $j] = $http('GET', '/api/estado');
check('GET /api/estado sin sesión -> vip_nivel 0, regalos_pendientes 0', [200, 0, 0], [$c, $j['vip_nivel'] ?? null, $j['regalos_pendientes'] ?? null]);
check('/api/vip/bono (Pase VIP 30 días) sigue siendo de api.php: sin Pase -> 403', 403, $http('POST', '/api/vip/bono', [], $tokB)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

// =====================================================================
titulo('Pase VIP (30 días): ventajas por nivel VIP — decisión de Dimitry, oct. 2026');
check('Tabla: VIP 0/1 → 4 eventos, −30 %, obras −10 %, bono $150 + 10 créditos + 1 cable', [4, 30, 10, 150, 10, 1, 0, false],
    [Vip::pase(0)['turnos'], Vip::pase(1)['descuento'], Vip::pase(2)['obra'], Vip::pase(1)['bono']['dinero'], Vip::pase(1)['bono']['creditos'], Vip::pase(1)['bono']['cable'], Vip::pase(1)['bono']['battery'], Vip::pase(1)['bono']['reparar']]);
check('VIP 4 → 4 eventos; VIP 5 → 5 eventos; VIP 10 → −50 %, obras −30 %, bono con todo el equipo al 100 %', [4, 5, 50, 30, true, 20],
    [Vip::pase(4)['turnos'], Vip::pase(5)['turnos'], Vip::pase(10)['descuento'], Vip::pase(10)['obra'], Vip::pase(10)['bono']['reparar'], Vip::pase(9)['bono']['creditos']]);
check('El descuento nunca pasa del 50 % y los turnos de 5', [50, 5], [max(array_column(Vip::PASE, 'descuento')), max(array_column(Vip::PASE, 'turnos'))]);
$NODEV = trim((string) shell_exec('command -v node 2>/dev/null'));
if ($NODEV !== '') {
    $js = (string) shell_exec(escapeshellarg($NODEV) . ' -e ' . escapeshellarg('require(process.argv[1]); const P = require(process.argv[2]); process.stdout.write(JSON.stringify(P.PASE_VIP));')
        . ' ' . escapeshellarg(dirname(__DIR__, 2) . '/js/logic.js') . ' ' . escapeshellarg(dirname(__DIR__, 2) . '/js/premium.js'));
    check('La tabla del juego (js/premium.js PASE_VIP) es la misma del servidor (Vip::PASE)', Vip::tablaPase(), json_decode($js, true));
}
$PV = $nuevoJugador('Pase VIP');
$activar($PV);
check('Sin Pase VIP: paseDe = null y la obra dura lo mismo', [null, 3600], [Vip::paseDe($PV), Vip::segundosObra($PV, 3600)]);
Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400 * 10, $PV]);
check('Pase VIP sin nivel (cuenta como VIP 1): obras −10 % (3600 → 3240 s), mínimo 1 minuto', [1, 3240, 60], [Vip::paseDe($PV)['nivel'], Vip::segundosObra($PV, 3600), Vip::segundosObra($PV, 30)]);
[$saldo0, $en0, $todas0] = Monedero::bonoVip($PV);
check('Bono diario VIP 1: $150 (entrega) + 1 cable, +10 créditos', [['dinero', 150], [['dinero', '-', 150], ['consumible', 'cable', 1]], 10],
    [[$en0['tipo'], $en0['cantidad']], array_map(fn($e) => [$e['tipo'], $e['item'], $e['cantidad']], $todas0), $saldo0]);
$err = null; try { Monedero::bonoVip($PV); } catch (\RuntimeException $e) { $err = $e->getCode(); }
check('…otra vez el mismo día -> 409', 409, $err);
$PV5 = $nuevoJugador('Pase VIP 5');
$activar($PV5);
Db::q('INSERT INTO vip_jugadores (jugador_id, nivel, revisado, actualizado) VALUES (?, 5, 0, ?)', [$PV5, time()]);
Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400 * 10, $PV5]);
[$saldo5, , $todas5] = Monedero::bonoVip($PV5);
check('Bono diario VIP 5: $400 + 2 cables + 2 baterías, +15 créditos; obras −20 %', [[['dinero', '-', 400], ['consumible', 'cable', 2], ['consumible', 'battery', 2]], 15, 2880],
    [array_map(fn($e) => [$e['tipo'], $e['item'], $e['cantidad']], $todas5), $saldo5, Vip::segundosObra($PV5, 3600)]);
Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() - 60, $PV5]);
check('Pase vencido: sin ventajas (paseDe null, obra igual) aunque el nivel VIP 5 queda', [null, 3600, 5], [Vip::paseDe($PV5), Vip::segundosObra($PV5, 3600), Vip::nivel($PV5)]);
$err = null; try { Monedero::bonoVip($PV5); } catch (\RuntimeException $e) { $err = $e->getCode(); }
check('…y el bono diario pide el Pase (403)', 403, $err);
check('GET /api/vip trae la tabla del Pase (pase_vip_tabla) y lo que toca con su nivel', [5, 5, 40], [count(Vip::estado($PV5)['pase_vip_tabla']), Vip::estado($PV5)['pase_vip']['turnos'], Vip::estado($PV5)['pase_vip']['descuento']]);

// =====================================================================
titulo('Equipos VIP: funcionan siempre; todo VIP + bono máximo ≈ +30 % en la Copa (Ventajas::RECORTE_VIP_PARTE)');
$vipFull = array_map(fn($t) => ['type' => $t], ['vip_cam8k', 'vip_cam8k', 'vip_cam8k', 'vip_cam8k', 'vip_switcher', 'vip_satelital', 'cam_basic']);
check('Puntos de techo: 4 cámaras VIP + switcher + satélite = 11 (de 12); sin VIP = 0', [11, 0], [Ventajas::puntosVip($vipFull), Ventajas::puntosVip([['type' => 'cam_basic'], ['item' => 'dron4k']])]);
check('Recorte parcial (60 %): bono 12 con todo VIP -> 5 · bono 5 -> 0 · sin VIP queda igual', [5, 0, 12], [Ventajas::recorteVip(12, $vipFull), Ventajas::recorteVip(5, $vipFull), Ventajas::recorteVip(12, [['type' => 'cam_basic']])]);
if ($NODEV !== '') {
    // Simulación con la lógica real (server/eventos/batalla.js): equipo de copa gratis vs. el mismo con TODO lo VIP y el bono
    // máximo ya recortado. La ventaja pagada total queda dentro del techo (20–25 %, MONETIZACION.md §1).
    $sim = <<<'JS'
'use strict';
const B = require(process.argv[2]);
const x = JSON.parse(process.argv[3]);
let a = 0, b = 0, n = 0;
for (const t of Object.keys(B.TORNEOS)) for (let s = 1; s <= 6; s++) {
  const j = B.jugarCruce({ seed: 1000 + s * 7919, torneo: t, planA: Array(5).fill(x.libre), planB: Array(5).fill(Object.assign({}, x.vip, { bono: x.bono })) });
  if (!j.ok) { console.log(JSON.stringify({ ok: false })); process.exit(1); }
  j.partidos.forEach((p) => { if (p.casa_a || p.casa_b) { console.log(JSON.stringify({ ok: false, casa: true })); process.exit(1); } a += p.calidad_a; b += p.calidad_b; n++; });
}
console.log(JSON.stringify({ ok: true, libre: a / n, vip: b / n }));
JS;
    file_put_contents($TMP . '/sim_vip.js', $sim);
    $st = fn(array $extra) => array_map(fn($p) => $p + ['morale' => 80], array_merge([['role' => 'camarografo', 'skill' => 4, 'owner' => true, 'name' => 'Tú'], ['role' => 'camarografo', 'skill' => 4],
        ['role' => 'camarografo', 'skill' => 4], ['role' => 'camarografo', 'skill' => 4], ['role' => 'director', 'skill' => 4], ['role' => 'sonidista', 'skill' => 4], ['role' => 'tecnico_transmision', 'skill' => 4]], $extra));
    $base = ['au_mydas_m33_live', 'mic_shur_slxd25_doble', 'enc_liveyou_solo_pro', 'router4g', 'rep_trikaster_3jugadas', 'ups', 'rain_cobertor_broadcast'];
    $libre = ['staff' => $st([['role' => 'operador_repeticion', 'skill' => 4]]), 'equip' => array_map(fn($t) => ['type' => $t, 'condition' => 90], array_merge(array_fill(0, 4, 'cam_jvk_gy_hk560'), ['switch_pro'], $base))];
    $vipEq = ['staff' => $st([['role' => 'shader', 'skill' => 4]]), 'equip' => array_map(fn($t) => ['type' => $t, 'condition' => 90], array_merge(array_fill(0, 4, 'vip_cam8k'), ['vip_switcher', 'vip_satelital'], $base))];
    $bono = Ventajas::recorteVip(Ventajas::TOPE, $vipEq['equip']);
    $o = json_decode((string) shell_exec(escapeshellarg($NODEV) . ' ' . escapeshellarg($TMP . '/sim_vip.js') . ' ' . escapeshellarg(dirname(__DIR__) . '/eventos/batalla.js') . ' '
        . escapeshellarg(json_encode(['libre' => $libre, 'vip' => $vipEq, 'bono' => $bono])) . ' 2>&1'), true);
    $pct = ($o['ok'] ?? false) ? round(($o['vip'] / $o['libre'] - 1) * 100, 1) : null;
    printf("  SIM copa: libre %.1f · todo VIP + bono recortado (%d) %.1f → %+.1f %%\n", $o['libre'] ?? 0, $bono, $o['vip'] ?? 0, $pct ?? 0);
    check('Copa: todo lo VIP + el bono máximo ≈ +30 % (entre 25 y 31 %, decisión del dueño)', true, $pct !== null && $pct >= 25.0 && $pct <= 31.0);
}

// =====================================================================
titulo('Combo con créditos: lo que necesita un equipo canjeado con créditos (POST /api/gastar "juego:" / "personal:")');
$CB = $nuevoJugador('Combo AR');
$activar($CB);
Db::q('UPDATE jugadores SET fama_publica = 33 WHERE id = ?', [$CB]);
Monedero::mover($CB, 5000, 'ajuste', 'prueba:combo');
$gasta = function (int $j, string $item): array { try { [$s, $e] = Monedero::gastar($j, $item); return [200, $s, $e]; } catch (\Throwable $e) { return [$e->getCode(), null, null]; } };
check('Sin el Vizart AR en la bodega: la cámara de sistema con créditos -> 403 (solo para completar un combo)', 403, $gasta($CB, 'juego:cam_zony_hdk_3200')[0]);
\EnVivo\Inventario::crear($CB, 'ex_graficos', 'canje', 'creditos:ex_graficos');
\EnVivo\Inventario::crear($CB, 'dron4k', 'canje', 'creditos:dron4k');
$precio = \EnVivo\CatalogoJuego::EQUIPOS['cam_zony_hdk_3200']['creditos'];
[$c1, $s1, $e1] = $gasta($CB, 'juego:cam_zony_hdk_3200');
check('Con el Vizart AR (fama 33; con dinero pide 45): la Zony HDK-3200 por ' . $precio . ' 💎 llega como entrega "equipo"', [200, 5000 - $precio, 'equipo', 'cam_zony_hdk_3200', 460],
    [$c1, $s1, $e1['tipo'] ?? null, $e1['item'] ?? null, $precio]);
check('Su fibra también (pieza de la cadena)', 200, $gasta($CB, 'juego:fib_cable_smpte_100m')[0]);
check('Una pieza que no es del combo (cam_basic) -> 403 · una que no existe -> 404', [403, 404], [$gasta($CB, 'juego:cam_basic')[0], $gasta($CB, 'juego:cam_nasa')[0]]);
for ($i = 0; $i < 3; $i++) $gasta($CB, 'juego:cam_zony_hdk_3200');
check('Tope de 4 por pieza: la 5.ª -> 409', 409, $gasta($CB, 'juego:cam_zony_hdk_3200')[0]);
check('Personal: con fama 33 el piloto de dron ya aparece en Personal -> 409 (se contrata con dinero)', 409, $gasta($CB, 'personal:piloto_dron')[0]);
Db::q('UPDATE jugadores SET fama_publica = 5 WHERE id = ?', [$CB]);
$saldoP = Monedero::saldo($CB);
[$c2, $s2, $e2] = $gasta($CB, 'personal:piloto_dron');
check('Con fama 5 (el piloto aparece desde 10): piloto de dron por 150 💎, habilidad 2, nivel junior', [200, $saldoP - 150, 'personal', 'piloto_dron', 2, 'junior'],
    [$c2, $s2, $e2['tipo'] ?? null, $e2['item'] ?? null, $e2['cantidad'] ?? null, Db::valor('SELECT nivel FROM entregas WHERE id = ?', [$e2['id'] ?? 0])]);
check('Un rol que el combo no pide (director, fama 0 igual) -> 409 · rol inventado -> 404', [409, 404], [$gasta($CB, 'personal:director')[0], $gasta($CB, 'personal:astronauta')[0]]);
check('Libro de créditos = saldo (todo pasó por Monedero)', Monedero::saldo($CB), (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ?', [$CB]));
check('Las entregas del combo salen en /api/estado (Monedero::entregas: tipo equipo y personal)', true,
    count(array_filter(Monedero::entregas($CB), fn($e) => in_array($e['tipo'], ['equipo', 'personal'], true))) >= 6);

echo "\n----------------------------------------\nVIP: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
