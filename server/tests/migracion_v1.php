<?php
// SOLO PRUEBAS (lo corre correr.sh): una base de la versión 1 (la que ya está en producción: entregas tipo "item")
// se actualiza sola a la versión nueva sin perder nada: cada equipo ya entregado pasa UNA vez al inventario
// (con entrega_id), los jugadores quedan en el Servidor 1, y correr la migración otra vez no duplica.
// Uso: php migracion_v1.php CARPETA_TMP
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$tmp = $argv[1];
$db = "$tmp/v1.sqlite";
@unlink($db);
file_put_contents("$tmp/v1.env", "ENVIVO_DB=$db\nENVIVO_ZONA=America/Guayaquil\n");
$ok = 0; $fallas = 0;
$check = function (string $n, $esp, $real) use (&$ok, &$fallas) {
    if ($esp === $real) { $ok++; echo "  OK    $n\n"; } else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esp, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
};

// 1. Base v1 exacta: solo la migración 1 (la de producción) con datos como los deja el servidor viejo
require dirname(__DIR__) . '/src/Config.php'; require dirname(__DIR__) . '/src/Db.php';
$v1 = (new ReflectionClassConstant('EnVivo\\Db', 'MIGRACIONES'))->getValue()[0];
$p = new PDO("sqlite:$db"); $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$p->exec($v1); $p->exec('PRAGMA user_version = 1');
$t = time() - 86400;
$p->exec("INSERT INTO jugadores (id, email, nombre, clave_hash, creditos, creado) VALUES (1, 'uno@prueba.example', 'Uno Viejo', 'x', 70, $t), (2, 'dos@prueba.example', 'Dos Viejo', 'x', 5, $t)");
$p->exec("INSERT INTO compras (id, token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES (1, '" . str_repeat('a', 32) . "', 1, 'inicio', 2.99, 2.60, 0.39, 'pagado', $t, $t)");
$p->exec("INSERT INTO entregas (jugador_id, tipo, item, cantidad, origen, creado) VALUES
  (1, 'item', 'cam_pro', 1, 'compra:1', $t), (1, 'consumible', 'cable', 5, 'compra:1', $t), (1, 'item', 'dron4k', 1, 'creditos:dron4k', $t + 1),
  (2, 'item', 'dron4k', 1, 'creditos:dron4k', $t + 2), (2, 'dinero', '-', 1000, 'creditos:caja_chica', $t + 3), (2, 'item', 'generador', 1, 'creditos:generador', $t + 4)");
$p->exec("INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (1, 70, 70, 'manual', 'x', $t), (2, 5, 5, 'manual', 'x', $t)");
// Pases de Prensa de antes de unificarlos: festival_pases con la lista vieja de motivos + el libro aparte del Desafío
preg_match('/CREATE TABLE IF NOT EXISTS festival_pases \(.*?\n\);/s', (string) file_get_contents(dirname(__DIR__) . '/src/migraciones/festival.sql'), $mm);
$p->exec(str_replace(", 'desafio', 'desafio_top', 'gasto')", ')', $mm[0]));
$p->exec("INSERT INTO festival_pases (jugador_id, cambio, saldo, motivo, ref, dia, creado) VALUES (1, 2, 2, 'diario', 'diario:2026-10-20', '2026-10-20', $t)");
$p->exec('CREATE TABLE pases_prensa (jugador_id INTEGER PRIMARY KEY, saldo INTEGER NOT NULL DEFAULT 0, actualizado INTEGER NOT NULL)');
$p->exec('CREATE TABLE pases_prensa_libro (id INTEGER PRIMARY KEY AUTOINCREMENT, jugador_id INTEGER NOT NULL, cambio INTEGER NOT NULL, saldo INTEGER NOT NULL, motivo TEXT NOT NULL, ref TEXT, creado INTEGER NOT NULL)');
$p->exec("INSERT INTO pases_prensa (jugador_id, saldo, actualizado) VALUES (1, 3, $t), (2, 1, $t)");
$p->exec("INSERT INTO pases_prensa_libro (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (1, 3, 3, 'desafio', 'desafio:2026-10-21', $t), (2, 1, 1, 'desafio_top', 'desafio_top:2026-10-21', $t)");
$p = null;

// 2. La versión nueva la actualiza sola
putenv("ENVIVO_CONFIG=$tmp/v1.env");
$out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg("$tmp/v1.env") . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/migrar.php') . ' 2>&1');
$check('migrar.php actualiza la base v1 a la versión 4', true, str_contains((string) $out, 'versión 4 de 4'));
$q = new PDO("sqlite:$db"); $q->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$inv = $q->query('SELECT jugador_id, item, serie, origen, entrega_id, estado FROM inventario ORDER BY id')->fetchAll();
$check('Cada equipo ya entregado pasa al inventario una vez, con su entrega_id, origen y serie por tipo', [
    ['jugador_id' => 1, 'item' => 'cam_pro', 'serie' => 1, 'origen' => 'inicio', 'entrega_id' => 1, 'estado' => 'bodega'],
    ['jugador_id' => 1, 'item' => 'dron4k', 'serie' => 1, 'origen' => 'canje', 'entrega_id' => 3, 'estado' => 'bodega'],
    ['jugador_id' => 2, 'item' => 'dron4k', 'serie' => 2, 'origen' => 'canje', 'entrega_id' => 4, 'estado' => 'bodega'],
    ['jugador_id' => 2, 'item' => 'generador', 'serie' => 1, 'origen' => 'canje', 'entrega_id' => 6, 'estado' => 'bodega']], $inv);
$check('No se perdió nada: 6 entregas, 2 compras... y créditos iguales', [6, 1, 70, 5], [(int) $q->query('SELECT COUNT(*) FROM entregas')->fetchColumn(), (int) $q->query('SELECT COUNT(*) FROM compras')->fetchColumn(),
    (int) $q->query('SELECT creditos FROM jugadores WHERE id = 1')->fetchColumn(), (int) $q->query('SELECT creditos FROM jugadores WHERE id = 2')->fetchColumn()]);
$check('Los jugadores que ya existían quedan en el Servidor 1', [1, 1], array_map('intval', $q->query('SELECT servidor_id FROM jugadores ORDER BY id')->fetchAll(PDO::FETCH_COLUMN)));
$check('Lista de palabras del chat cargada', true, (int) $q->query('SELECT COUNT(*) FROM chat_palabras')->fetchColumn() > 50);
$q = null;
$out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg("$tmp/v1.env") . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/migrar.php') . ' 2>&1');
$q = new PDO("sqlite:$db");
$check('Migrar otra vez no duplica el inventario', [true, 4], [str_contains((string) $out, 'versión 4 de 4'), (int) $q->query('SELECT COUNT(*) FROM inventario')->fetchColumn()]);
$check('Pases de Prensa: festival_pases acepta los motivos del Desafío y es el único saldo (2 del festival + 3 y 1 del Desafío, sin duplicar)',
    [true, 3, 5, 1, 'desafio'], [str_contains((string) $q->query("SELECT sql FROM sqlite_master WHERE name = 'festival_pases'")->fetchColumn(), "'desafio_top'"),
    (int) $q->query('SELECT COUNT(*) FROM festival_pases')->fetchColumn(), (int) $q->query('SELECT SUM(cambio) FROM festival_pases WHERE jugador_id = 1')->fetchColumn(),
    (int) $q->query('SELECT SUM(cambio) FROM festival_pases WHERE jugador_id = 2')->fetchColumn(), $q->query("SELECT motivo FROM festival_pases WHERE ref = 'pases_prensa:1'")->fetchColumn()]);

// 3. Lo que ve el juego después: entregas sin "item" y el inventario con entrega_id (para no duplicar en la partida)
require_once dirname(__DIR__) . '/src/arranque.php';
$e = EnVivo\Cuentas::estado(1);
$check('estado.entregas ya no trae los equipos (solo el cable)', [['consumible', 'cable']], array_map(fn($x) => [$x['tipo'], $x['item']], $e['entregas']));
$check('estado.inventario trae los equipos con entrega_id', [['cam_pro', 1], ['dron4k', 3]], array_map(fn($x) => [$x['item'], $x['entrega_id']], $e['inventario']));
$check('…y el mercado abierto (tiene una compra pagada)', true, $e['mercado']['puede']);
$check('Desafio::pases y Festival::pases dan el mismo saldo (5)', [5, 5], [EnVivo\Desafio::pases(1), EnVivo\Festival::pases(1)]);
$nuevo = EnVivo\Inventario::crear(2, 'dron4k', 'canje');
$check('Un dron nuevo después de migrar sigue la cuenta de series (#3)', 3, $nuevo['serie']);
echo "Resumen migracion_v1.php — correctas: $ok  ·  Fallas: $fallas\n";
exit($fallas === 0 ? 0 : 1);
