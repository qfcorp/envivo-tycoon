<?php
declare(strict_types=1);

// SOLO PRUEBAS: bin/demo_datos.php (datos de demostración) sobre una base TEMPORAL con todas las migraciones
// (también las de los módulos: liga, duelos, festival, universos, copas, fusiones... las que estén en src/migraciones).
// Uso:  php server/tests/pruebas_demo_datos.php      (sale con 0 si todo pasa)
// Revisa: --crear dos veces no duplica · --borrar deja intactos a los jugadores REALES (créditos, compras, inventario,
// libro) aunque hayan comprado a una demo o entrado a su asociación · no queda ninguna fila que apunte a lo demo ·
// foreign_key_check e integrity_check ok · /api/estado de un jugador real sigue funcionando.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$SRV = dirname(__DIR__);
$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_demo_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$sock = stream_socket_server('tcp://127.0.0.1:0');
$PUERTO = (int) substr(strrchr(stream_socket_get_name($sock, false), ':'), 1);
fclose($sock);
file_put_contents("$TMP/config.env", "ENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$PUERTO\n");
putenv("ENVIVO_CONFIG=$TMP/config.env");
require $SRV . '/src/arranque.php';

use EnVivo\{Chat, Cuentas, Db, Mercado, Monedero, Social};

$fallas = 0; $total = 0;
function check(string $que, mixed $esperado, mixed $real): void
{
    global $fallas, $total;
    $total++;
    if ($esperado === $real) { echo "  ok  $que\n"; return; }
    $fallas++;
    echo "  FALLA  $que\n        esperado: " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . "\n        real:     " . json_encode($real, JSON_UNESCAPED_UNICODE) . "\n";
}
function titulo(string $t): void { echo "\n== $t\n"; }
function demo(string $modo): array
{
    global $SRV;
    $out = [];
    exec('php ' . escapeshellarg($SRV . '/bin/demo_datos.php') . ' ' . escapeshellarg($modo) . ' 2>&1', $out, $rc);
    return [$rc, implode("\n", $out)];
}
$val = fn(string $sql, array $p = []) => Db::valor($sql, $p);
$tablas = fn() => array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"), 'name');

// =====================================================================
titulo('Base temporal con todas las migraciones');
Db::pdo();
foreach (['Liga', 'Duelos', 'Festival', 'Copas', 'Universos'] as $c) {
    $k = 'EnVivo\\' . $c;
    if (class_exists($k) && method_exists($k, 'preparar')) $k::preparar();
}
$mods = array_map(fn($f) => basename($f), glob($SRV . '/src/migraciones/*.sql') ?: []);
echo '  módulos: ' . implode(', ', $mods) . "\n";
check('Base al día (versión numerada)', Db::versionEsperada(), (int) $val('PRAGMA user_version'));

// =====================================================================
titulo('Dos jugadores REALES con compras pagadas, inventario y mercado');
$compra = function (int $j, string $producto, int $creditos, float $total): int {
    Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en, pagado_por, creditos) VALUES (?, ?, ?, ?, ?, ?, 'pagado', ?, ?, 'prueba', ?)",
        [bin2hex(random_bytes(16)), $j, $producto, $total, round($total / 1.15, 2), round($total - $total / 1.15, 2), time(), time(), $creditos]);
    $id = Db::ultimoId();
    Monedero::mover($j, $creditos, 'compra', 'compra:' . $id);
    return $id;
};
$R1 = Cuentas::registrar('ana.real@ejemplo.com', 'Ana Real', 'clave-real-uno');
$R2 = Cuentas::registrar('beto.real@ejemplo.com', 'Beto Real', 'clave-real-dos');
Db::q('UPDATE jugadores SET servidor_id = 1 WHERE id IN (?, ?)', [$R1, $R2]);
$compra($R1, 'creditos_700', 700, 4.99);
$compra($R2, 'creditos_1500', 1500, 9.99);
Social::guardarPerfil($R1, ['alias' => 'Real Uno Media']);
Social::crear($R1, ['nombre' => 'Los Reales', 'siglas' => 'REA', 'color' => '#123456', 'pagado_en_juego' => true]);
[, , $invR1] = Monedero::gastar($R1, 'generador');
$pubR1 = Mercado::publicar($R1, (int) $invR1['id'], 400);
Chat::escribir($R1, ['canal' => 'servidor', 'texto' => 'Hola, soy una productora real']);
check('Jugador real 1: compra pagada, generador publicado, 450 créditos', [1, 'activa', 450], [(int) $val("SELECT COUNT(*) FROM compras WHERE jugador_id = ? AND estado = 'pagado'", [$R1]),
    $val('SELECT estado FROM mercado_publicaciones WHERE id = ?', [$pubR1['id']]), Monedero::saldo($R1)]);

/** Todo lo que es de los jugadores reales (para comparar antes y después). */
$foto = function () use ($R1, $R2): array {
    $ids = [$R1, $R2];
    $in = implode(',', $ids);
    return [
        'jugadores' => Db::todas("SELECT id, email, nombre, clave_hash, creditos, deuda, vip_hasta, servidor_id, alias, fama_publica, estado FROM jugadores WHERE id IN ($in) ORDER BY id"),
        'compras' => Db::todas("SELECT * FROM compras WHERE jugador_id IN ($in) ORDER BY id"),
        'movimientos' => Db::todas("SELECT * FROM movimientos_creditos WHERE jugador_id IN ($in) ORDER BY id"),
        'inventario' => Db::todas("SELECT * FROM inventario WHERE jugador_id IN ($in) ORDER BY id"),
        'entregas' => Db::todas("SELECT * FROM entregas WHERE jugador_id IN ($in) ORDER BY id"),
        'publicaciones' => Db::todas("SELECT * FROM mercado_publicaciones WHERE vendedor_id IN ($in) ORDER BY id"),
        'chat' => Db::todas("SELECT * FROM chat_mensajes WHERE jugador_id IN ($in) ORDER BY id"),
    ];
};
$conteos = function () use ($tablas): array {
    $o = [];
    foreach ($tablas() as $t) if (preg_match('/^\w+$/', $t)) $o[$t] = (int) Db::valor("SELECT COUNT(*) FROM \"$t\"");
    return $o;
};
$antes = $foto();

// =====================================================================
titulo('--crear (y otra vez: no duplica)');
[$rc, $out] = demo('--crear');
check('--crear sale con 0', 0, $rc);
if ($rc !== 0) echo $out . "\n";
$demoIds = array_map('intval', array_column(Db::todas("SELECT id FROM demo_marcas WHERE tabla = 'jugadores' ORDER BY id"), 'id'));
$demoAsoc = array_map('intval', array_column(Db::todas("SELECT id FROM demo_marcas WHERE tabla = 'asociaciones' ORDER BY id"), 'id'));
$D = implode(',', $demoIds ?: [0]);
check('24 productoras demo, todas con correo @demo.envivo.local', [24, 24], [count($demoIds), (int) $val("SELECT COUNT(*) FROM jugadores WHERE id IN ($D) AND email LIKE '%@demo.envivo.local'")]);
$porServidor = array_map('intval', array_column(Db::todas("SELECT COUNT(*) AS n FROM jugadores WHERE id IN ($D) GROUP BY servidor_id ORDER BY servidor_id"), 'n'));
$nServ = (int) $val('SELECT COUNT(*) FROM servidores');
check('Repartidas 12 / 8 / 4 (si hay 3 servidores)', $nServ >= 3 ? [12, 8, 4] : $porServidor, $porServidor);
check('Las cuentas demo NO pueden entrar (clave inservible)', [24, null], [(int) $val("SELECT COUNT(*) FROM jugadores WHERE id IN ($D) AND clave_hash LIKE '!%'"),
    Cuentas::verificar('productora01@demo.envivo.local', 'cualquiera')]);
check('Alias y fama pública', [24, true], [(int) $val("SELECT COUNT(*) FROM jugadores WHERE id IN ($D) AND alias IS NOT NULL AND fama_publica > 0"),
    (bool) $val("SELECT 1 FROM jugadores WHERE alias = 'Andes Live Producciones'")]);
check('7 asociaciones con presidente, vice, siglas y color', [7, 7, 7], [count($demoAsoc),
    (int) $val('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id IN (' . implode(',', $demoAsoc ?: [0]) . ") AND cargo = 'presidente'"),
    (int) $val('SELECT COUNT(*) FROM asociaciones WHERE id IN (' . implode(',', $demoAsoc ?: [0]) . ") AND length(siglas) = 3 AND color LIKE '#%'")]);
check('Chat: 21 mensajes en canales de servidor y de asociación', [21, true], [(int) $val("SELECT COUNT(*) FROM chat_mensajes WHERE jugador_id IN ($D)"),
    (int) $val("SELECT COUNT(DISTINCT substr(canal, 1, 6)) FROM chat_mensajes WHERE jugador_id IN ($D)") === 2]);
check('Mercado: 8 publicaciones activas de equipos del inventario (con serie)', [8, 8], [(int) $val("SELECT COUNT(*) FROM mercado_publicaciones WHERE vendedor_id IN ($D) AND estado = 'activa'"),
    (int) $val("SELECT COUNT(*) FROM inventario WHERE jugador_id IN ($D) AND estado = 'publicado'")]);
check('Créditos demo: ajuste manual auditado por demo_datos, nada comprado', [0, true, true], [(int) $val("SELECT COUNT(*) FROM compras WHERE jugador_id IN ($D)"),
    (int) $val("SELECT COUNT(*) FROM auditoria WHERE quien = 'demo_datos' AND accion = 'creditos_dar'") > 0,
    (int) $val("SELECT COUNT(*) FROM movimientos_creditos WHERE jugador_id IN ($D) AND motivo = 'manual' AND ref LIKE 'control:demo%'") > 0]);
check('El libro de créditos de cada demo cuadra con su saldo', 0, (int) $val("SELECT COUNT(*) FROM jugadores j WHERE j.id IN ($D) AND (j.creditos - j.deuda) <> (SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos m WHERE m.jugador_id = j.id)"));
if (in_array('liga_participantes', $tablas(), true)) check('Liga: las asociaciones demo tienen puntos esta semana', true, (int) $val('SELECT COALESCE(SUM(puntos), 0) FROM liga_participantes WHERE asociacion_id IN (' . implode(',', $demoAsoc ?: [0]) . ')') > 0);
if (in_array('duelo_ratings', $tablas(), true)) check('Duelos: 24 filas de ranking (sin equipo de duelo: nadie real las puede retar)', [24, 0], [(int) $val("SELECT COUNT(*) FROM duelo_ratings WHERE jugador_id IN ($D)"), (int) $val("SELECT COUNT(*) FROM duelo_equipos WHERE jugador_id IN ($D)")]);
if (class_exists('EnVivo\\Copas') && in_array('copa_aportes', $tablas(), true)) {
    $fase = (string) $val('SELECT fase FROM copas ORDER BY id DESC LIMIT 1');
    if ($fase === 'preparacion') {
        $prep = array_map('intval', array_column(Db::todas('SELECT puntos_prep FROM copa_servidores WHERE copa_id = (SELECT MAX(id) FROM copas) ORDER BY servidor_id'), 'puntos_prep'));
        check('Copa: preparación por servidor = suma de aportes; el servidor chico no queda lejos (>= 70 % del primero)', [true, true],
            [array_sum($prep) === (int) $val("SELECT SUM(puntos) FROM copa_aportes WHERE jugador_id IN ($D)"), count($prep) > 0 && min($prep) >= 0.7 * max($prep)]);
    } else echo "  (copa en fase $fase: la demo no carga puntos)\n";
}
$c1 = $conteos();
[$rc2, $out2] = demo('--crear');
check('--crear otra vez: sale con 0 y no agrega nada (mismos conteos en todas las tablas)', [0, []], [$rc2, array_diff_assoc($conteos(), $c1)]);
check('…y no tocó nada de los jugadores reales', $antes, $foto());
[$rc, $out] = demo('--estado');
check('--estado muestra lo demo', [0, true, true], [$rc, str_contains($out, '12 productoras demo') || str_contains($out, 'productoras demo'), str_contains($out, 'publicaciones activas  8')]);

// =====================================================================
titulo('Jugador real 2 interactúa con lo demo (compra en su mercado, entra a su asociación, bloquea, chatea)');
$pubDemo = (int) $val("SELECT id FROM mercado_publicaciones WHERE vendedor_id IN ($D) AND estado = 'activa' AND item = 'generador' ORDER BY precio LIMIT 1");
[$saldoR2, $itemR2] = Mercado::comprar($R2, $pubDemo);
$asocAndes = (int) $val("SELECT id FROM asociaciones WHERE siglas = 'ANL' AND servidor_id = 1");
$r = Social::unirse($R2, $asocAndes);
check('R2 compró un generador demo y entró a "Liga de los Andes"', ['generador', 'miembro'], [$itemR2['item'], $r['estado']]);
Chat::bloquear($R2, $demoIds[1], false);
Chat::escribir($R2, ['canal' => 'asociacion', 'texto' => 'Gracias por recibirme']);
$antes = $foto();
$saldos = [$R1 => Monedero::saldo($R1), $R2 => Monedero::saldo($R2)];

// /api/estado de un jugador real (por HTTP, con la API de verdad)
$srv = proc_open(['php', '-S', "127.0.0.1:$PUERTO", '-t', $RAIZ, $SRV . '/tests/router.php'], [1 => ['file', "$TMP/php-s.log", 'a'], 2 => ['file', "$TMP/php-s.log", 'a']], $pipes, $RAIZ, ['ENVIVO_CONFIG' => "$TMP/config.env", 'PATH' => getenv('PATH')]);
$tok = bin2hex(random_bytes(32));
Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira, ip, navegador) VALUES (?, ?, ?, ?, ?, ?)', [hash('sha256', $tok), $R2, time(), time() + 50 * 86400, '127.0.0.1', 'pruebas']);
$estado = function () use ($PUERTO, $tok): ?array {
    for ($i = 0; $i < 50; $i++) {
        $ctx = stream_context_create(['http' => ['header' => "Cookie: envivo_s=$tok\r\n", 'ignore_errors' => true, 'timeout' => 20]]);
        $r = @file_get_contents("http://127.0.0.1:$PUERTO/api/estado", false, $ctx);
        if ($r !== false) return json_decode($r, true);
        usleep(100000);
    }
    return null;
};
$e = $estado();
check('/api/estado de R2 con datos demo: logueado, saldo, asociación demo', [true, $R2, $saldos[$R2], 'ANL'], [$e['logueado'] ?? null, $e['jugador']['id'] ?? null, $e['creditos'] ?? null, $e['asociacion']['siglas'] ?? null]);

// =====================================================================
titulo('--borrar');
[$rc, $out] = demo('--borrar');
check('--borrar sale con 0 y revisa llaves e integridad', [0, true, true], [$rc, str_contains($out, 'foreign_key_check): ok'), str_contains($out, 'integrity_check): ok')]);
if ($rc !== 0) echo $out . "\n";
$despues = $foto();
// La publicación demo que compró R2 queda en el historial de R2 sin vendedor: no está en "publicaciones de R1/R2" de todos modos
check('Jugadores reales intactos: cuentas, créditos, compras, libro, inventario, entregas, publicaciones y chat', $antes, $despues);
check('Saldos reales iguales y el libro cuadra', [$saldos, 0], [[$R1 => Monedero::saldo($R1), $R2 => Monedero::saldo($R2)],
    (int) $val("SELECT COUNT(*) FROM jugadores j WHERE j.id IN ($R1, $R2) AND (j.creditos - j.deuda) <> (SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos m WHERE m.jugador_id = j.id)")]);
check('R2 conserva el generador que compró; la venta queda en el historial sin vendedor', [$R2, 'vendida', null, $R2],
    [(int) $val('SELECT jugador_id FROM inventario WHERE id = ?', [$itemR2['id']]), $val('SELECT estado FROM mercado_publicaciones WHERE id = ?', [$pubDemo]),
     $val('SELECT vendedor_id FROM mercado_publicaciones WHERE id = ?', [$pubDemo]), (int) $val('SELECT comprador_id FROM mercado_publicaciones WHERE id = ?', [$pubDemo])]);
check('La asociación demo con un jugador real se queda, con R2 de presidente y solo él', [true, 'presidente', 1],
    [(bool) $val('SELECT 1 FROM asociaciones WHERE id = ?', [$asocAndes]), $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [$R2]),
     (int) $val('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$asocAndes])]);
check('La asociación real de R1 sigue igual', ['REA', 'presidente'], [$val('SELECT a.siglas FROM asociaciones a JOIN asociacion_miembros m ON m.asociacion_id = a.id WHERE m.jugador_id = ?', [$R1]),
    $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [$R1])]);

// Ninguna fila (en ninguna tabla) apunta a un jugador demo o a una asociación demo borrada
$asocBorradas = array_values(array_diff($demoAsoc, [$asocAndes]));
$A = implode(',', $asocBorradas ?: [0]);
$quedan = [];
foreach ($tablas() as $t) {
    if (!preg_match('/^\w+$/', $t)) continue;
    foreach (array_column(Db::todas("PRAGMA table_info(\"$t\")"), 'name') as $c) {
        $c = strtolower((string) $c);
        $n = 0;
        if (in_array($c, ['jugador_id', 'retador_id', 'defensor_id', 'vendedor_id', 'comprador_id', 'reportante_id', 'bloqueado_id', 'capitan_jugador_id'], true) || ($t === 'jugadores' && $c === 'id'))
            $n = (int) $val("SELECT COUNT(*) FROM \"$t\" WHERE \"$c\" IN ($D)");
        elseif ($c === 'asociacion_id' || ($t === 'asociaciones' && $c === 'id')) $n = (int) $val("SELECT COUNT(*) FROM \"$t\" WHERE \"$c\" IN ($A)");
        if ($n > 0) $quedan["$t.$c"] = $n;
    }
}
$canales = array_merge(array_map(fn($j) => "'sistema:$j'", $demoIds), array_map(fn($a) => "'asociacion:$a'", $asocBorradas));
$nCanal = (int) $val('SELECT COUNT(*) FROM chat_mensajes WHERE canal IN (' . implode(',', $canales) . ')');
check('Cero filas que apunten a ids demo (todas las tablas) y cero mensajes en sus canales', [[], 0], [$quedan, $nCanal]);
check('Sin cuentas @demo.envivo.local, sin tabla demo_marcas', [0, false], [(int) $val("SELECT COUNT(*) FROM jugadores WHERE email LIKE '%@demo.envivo.local'"), in_array('demo_marcas', $tablas(), true)]);
check('Números de serie: no quedan por encima del último equipo que existe', 0, (int) $val('SELECT COUNT(*) FROM series s WHERE s.ultima > (SELECT COALESCE(MAX(serie), 0) FROM inventario i WHERE i.item = s.item)'));
if (in_array('copa_servidores', $tablas(), true)) check('Copa: preparación = suma de los aportes que quedan', 0,
    (int) $val('SELECT COUNT(*) FROM copa_servidores cs WHERE cs.puntos_prep <> (SELECT COALESCE(SUM(a.puntos), 0) FROM copa_aportes a WHERE a.copa_id = cs.copa_id AND a.servidor_id = cs.servidor_id)'));
check('PRAGMA foreign_key_check vacío', [], Db::todas('PRAGMA foreign_key_check'));
check('PRAGMA integrity_check ok', 'ok', (string) $val('PRAGMA integrity_check'));
$e = $estado();
check('/api/estado de R2 después de borrar: funciona, mismo saldo, su generador y su asociación', [true, $saldos[$R2], true, 'ANL'],
    [$e['logueado'] ?? null, $e['creditos'] ?? null, in_array((int) $itemR2['id'], array_column($e['inventario'] ?? [], 'id'), true), $e['asociacion']['siglas'] ?? null]);
[$rc, $out] = demo('--estado');
check('--estado: ya no hay datos demo', [0, true], [$rc, str_contains($out, 'No hay datos demo')]);
[$rc, $out] = demo('--borrar');
check('--borrar otra vez: nada que borrar', [0, true], [$rc, str_contains($out, 'Nada que borrar')]);
[$rc, $out] = demo('--crear');
check('Se puede volver a crear después de borrar (y borrar otra vez)', [0, 0], [$rc, demo('--borrar')[0]]);

proc_terminate($srv);
exec('rm -rf ' . escapeshellarg($TMP));
echo "\n" . ($fallas === 0 ? "TODO OK ($total pruebas)" : "$fallas de $total pruebas FALLARON") . "\n";
exit($fallas === 0 ? 0 : 1);
