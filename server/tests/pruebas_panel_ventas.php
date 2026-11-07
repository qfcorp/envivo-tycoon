<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Las ventas del juego se FACTURAN EN EL PANEL TUKÁN, igual que todos los
// sistemas (src/PanelVentas.php). De punta a punta: el juego (base SQLite temporal) → el Panel Tukán Central DE VERDAD
// (repo qfcorp/tukan-central con php -S y su ventas_api.php) → TuFactura DE MENTIRA (tests/mock/tufactura.php del Panel).
// Casos: interruptor y facturación propia apagada, venta con cédula (factura con sus datos), consumidor final, venta de
// PRUEBA (no se factura), nunca dos veces, Panel caído y reintento, reembolso (cobro anulado y aviso de nota de crédito),
// secreto malo (rechazada y aviso), la cola en bin/tareas.php.
// Necesita el repo del Panel en PANEL_DIR (por defecto ../tukan-central junto a este repo); si no está, se salta con aviso.
// Uso:  php server/tests/pruebas_panel_ventas.php        (GUARDAR_TMP=1 para dejar los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$PANEL = getenv('PANEL_DIR') ?: dirname($RAIZ) . '/tukan-central';
if (!is_file($PANEL . '/public/ventas_api.php')) { echo "  AVISO: no está el Panel con ventas_api.php en $PANEL (PANEL_DIR): se salta\n\nPanel ventas: 0 correctas · 0 fallas\n"; exit(0); }
$TMP = sys_get_temp_dir() . '/envivo_panel_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true); mkdir($TMP . '/panel', 0777, true); mkdir($TMP . '/tf', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; };
$P_PANEL = $puerto(); $P_TF = $puerto();
$KEY = bin2hex(random_bytes(32));
$K_TF = 'tf_' . str_repeat('4', 40);
$envPanel = ['PATH' => getenv('PATH'), 'TZ' => 'America/Guayaquil', 'TUKAN_CENTRAL_DATOS' => $TMP . '/panel', 'TUKAN_CENTRAL_KEY' => $KEY, 'TUKAN_CENTRAL_ENV' => '/no/existe',
              'TUKAN_CENTRAL_URL' => 'http://127.0.0.1:' . $P_PANEL, 'TELEGRAM_BOT_TOKEN' => '', 'TUKAN_APIS_ENV' => '/no/existe', 'no_proxy' => '127.0.0.1,localhost'];

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}

titulo('Panel de verdad con el programa EN VIVO Tycoon y TuFactura de mentira');
$procs = [];
$arrancar = function (array $cmd, array $env, string $log) use (&$procs, $TMP): void {
    $procs[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/$log", 'a'], 2 => ['file', "$TMP/$log", 'a']], $t, null, $env);
};
$arrancar(['php', '-S', '127.0.0.1:' . $P_TF, $PANEL . '/tests/mock/tufactura.php'], ['PATH' => getenv('PATH'), 'MOCK_DIR' => $TMP . '/tf', 'TF_CLAVES' => "$K_TF:004-100:Tukan:produccion", 'TZ' => 'America/Guayaquil'], 'tf.log');
$esperar = function (int $p): void { for ($k = 0; $k < 60; $k++) { if (@fsockopen('127.0.0.1', $p)) return; usleep(100000); } };
$esperar($P_TF);
// El programa en el Panel (como «Programas → Agregar») y TuFactura activo
$prep = $TMP . '/prep_panel.php';
file_put_contents($prep, '<?php define("TUKAN_SIN_SESION", true); require getenv("PANEL") . "/app/bootstrap.php";
$sec = instancias()->crear(["id" => "envivo", "producto" => "envivo", "url" => "https://juego.tukanec.com", "nombre" => "EN VIVO Tycoon", "activo" => 1]);
$tf = new Tukan\TuFactura(db()); $id = $tf->agregar("Tukan 004-100", getenv("TF_URL"), getenv("TF_K")); $tf->activar($id); ajustes()->guardar("tufactura_activo", "1");
echo $sec;');
$secreto = trim((string) shell_exec(implode(' ', array_map(fn($k, $v) => $k . '=' . escapeshellarg($v), array_keys($envPanel), $envPanel))
    . ' PANEL=' . escapeshellarg($PANEL) . ' TF_URL=' . escapeshellarg('http://127.0.0.1:' . $P_TF) . ' TF_K=' . $K_TF . ' php ' . escapeshellarg($prep) . ' 2>&1'));
check('Programa «envivo» creado en el Panel (secreto de 16+ letras) con TuFactura activo', true, strlen($secreto) >= 16 && !str_contains($secreto, ' '));
$panelUp = function () use ($arrancar, $P_PANEL, $PANEL, $envPanel, $esperar): void {
    $arrancar(['php', '-d', 'error_log=' . $envPanel['TUKAN_CENTRAL_DATOS'] . '/php_errores.log', '-d', 'log_errors=1', '-S', '127.0.0.1:' . $P_PANEL, '-t', $PANEL . '/public'], $envPanel, 'panel.log');
    $esperar($P_PANEL);
};
$panelUp();

// El juego (en este proceso): Plux propio en PRODUCCIÓN (ventas de verdad) y PayPal en sandbox (ventas de prueba)
$conf = "; SOLO PRUEBAS (pruebas_panel_ventas.php)\nENVIVO_ZONA=America/Guayaquil\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=https://juego.prueba\n"
      . "PLUX_AMBIENTE=produccion\nPLUX_ID_ESTABLECIMIENTO=EST-1\nPLUX_ID_CLIENTE=c\nPLUX_CLAVE_SECRETA=s\nPLUX_LLAVE_PUBLICA=AAAA\n"
      . "PAYPAL_AMBIENTE=sandbox\nPAYPAL_CLIENT_ID=x\nPAYPAL_SECRET=y\n"
      . "FACTURACION_POR_PANEL=1\nTUKAN_CENTRAL_URL=http://127.0.0.1:$P_PANEL\nTUKAN_CENTRAL_ID=envivo\nTUKAN_CENTRAL_SECRET=$secreto\n";
file_put_contents($TMP . '/config.env', $conf);
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Catalogo, Compras, Config, Db, Facturacion, PanelVentas};

Db::pdo();
PanelVentas::$enviarAlTerminar = false;
Facturacion::$empujarAlTerminar = false;
$panelDb = new PDO('sqlite:' . $TMP . '/panel/central.sqlite');
$panelDb->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$cobro = fn(int $compra) => $panelDb->query("SELECT * FROM cobros WHERE operacion_id = 'venta:envivo:envivo-compra-$compra'")->fetch() ?: null;
$tfFacturas = fn() => (json_decode((string) @file_get_contents($TMP . '/tf/tf.json'), true) ?: ['facturas' => []])['facturas'];
$cola = fn(int $compra, string $accion = 'registrar') => Db::fila('SELECT * FROM panel_ventas WHERE compra_id = ? AND accion = ?', [$compra, $accion]);
$jugadorN = 0;
$jugador = function (string $nombre) use (&$jugadorN): int {
    $jugadorN++;
    Db::q("INSERT INTO jugadores (email, nombre, clave_hash, creado) VALUES (?, ?, 'x', ?)", ['panel' . $jugadorN . '@prueba.example', $nombre, time()]);
    return Db::ultimoId();
};
$comprar = function (int $jug, string $producto, string $canal, ?array $factura = null): int {
    $c = Db::tx(fn() => Compras::insertar($jug, Catalogo::producto($producto), $canal));
    if ($factura !== null) Facturacion::anotarDatos((int) $c['id'], $factura);
    Compras::aprobar((int) $c['id'], 'prueba', 'tx-' . $c['id']);
    return (int) $c['id'];
};

titulo('Interruptor');
check('Conectado al Panel: módulo encendido', true, PanelVentas::activo());
check('… y la facturación propia del juego se apaga (una sola factura por venta)', false, Facturacion::activa());
[$http, $j] = PanelVentas::probar();
check('probar: el Panel contesta y acepta la firma', [200, true], [$http, $j['ok'] ?? null]);

titulo('Venta con tarjeta y cédula: factura con sus datos');
$ana = $jugador('Ana Pérez');
$c1 = $comprar($ana, 'creditos_700', 'web_plux', ['modo' => 'otro', 'tipo_id' => '05', 'identificacion' => '1710034065', 'razon_social' => 'ANA PEREZ', 'email' => 'ana@prueba.example', 'telefono' => '', 'direccion' => 'Quito']);
check('Al aprobar, la venta queda en la cola (pendiente, no es de prueba)', ['pendiente', 0], [$cola($c1)['estado'] ?? null, (int) ($cola($c1)['prueba'] ?? -1)]);
check('… y el juego NO crea su propia factura', 0, (int) Db::valor('SELECT COUNT(*) FROM facturas WHERE compra_id = ?', [$c1]));
check('Mandar: 1 venta recibida por el Panel', 1, PanelVentas::enviarPendientes());
$x = $cobro($c1);
check('Panel: cobro de EN VIVO Tycoon, $4,34 sin IVA, por tarjeta (plux), a nombre de Ana', ['envivo', 4.34, 'plux', 'Ana Pérez', '700 créditos · EN VIVO Tycoon'],
    [$x['instancia_id'] ?? null, (float) ($x['monto'] ?? 0), $x['metodo'] ?? null, $x['cliente_nombre'] ?? null, $x['concepto'] ?? null]);
check('… factura AUTORIZADA en TuFactura (004-100)', ['factura', 'autorizado', true], [$x['factura'] ?? null, $x['tf_estado'] ?? null, str_starts_with((string) ($x['tf_numero'] ?? ''), '004-100-')]);
$todasF = $tfFacturas(); $f1 = end($todasF) ?: [];
$ped = $f1['pedido'] ?? $f1;
check('… a TuFactura: cédula 1710034065, ANA PEREZ, precio 4,34 + IVA 15 %, forma de pago 19 (tarjeta), código TUKAN-ENVIVO',
    ['1710034065', 'ANA PEREZ', 4.34, 15, '19', 'TUKAN-ENVIVO'],
    [$ped['cliente']['identificacion'] ?? null, $ped['cliente']['razon_social'] ?? null, $ped['items'][0]['precio'] ?? null, $ped['items'][0]['iva'] ?? null, $ped['forma_pago'] ?? null, $ped['items'][0]['codigo'] ?? null]);
check('… la cola guarda el cobro y lo que pasó con la factura', ['enviado', (int) $x['id'], true], [$cola($c1)['estado'], (int) $cola($c1)['cobro_id'], str_contains((string) $cola($c1)['factura'], 'autorizada')]);

titulo('Nunca dos veces');
Db::q("UPDATE panel_ventas SET estado = 'pendiente' WHERE compra_id = ?", [$c1]);
PanelVentas::enviarPendientes();
check('Mandar la misma venta otra vez: el Panel no la anota dos veces ni hace otra factura', [1, 1],
    [(int) $panelDb->query("SELECT COUNT(*) FROM cobros WHERE operacion_id = 'venta:envivo:envivo-compra-$c1'")->fetchColumn(), count(array_filter($tfFacturas(), fn($f) => str_contains(json_encode($f), '1710034065')))]);
check('… y la cola dice «Ya estaba anotada»', 'Ya estaba anotada.', $cola($c1)['factura']);

titulo('Consumidor final y venta de PRUEBA');
$beto = $jugador('Beto');
$c2 = $comprar($beto, 'creditos_250', 'web_plux', ['modo' => 'consumidor_final', 'tipo_id' => '07', 'identificacion' => '9999999999999', 'razon_social' => 'CONSUMIDOR FINAL', 'email' => 'beto@prueba.example', 'telefono' => '', 'direccion' => '']);
$c3 = $comprar($beto, 'creditos_700', 'web_paypal');   // PayPal en sandbox = venta de prueba
check('PayPal en sandbox: la venta va marcada de PRUEBA', 1, (int) $cola($c3)['prueba']);
PanelVentas::enviarPendientes();
$x2 = $cobro($c2); $x3 = $cobro($c3);
check('Consumidor final ($1,99): factura autorizada a 9999999999999', ['autorizado', '9999999999999'],
    [$x2['tf_estado'] ?? null, (function () use ($tfFacturas) { $t = $tfFacturas(); $u = end($t) ?: []; return ($u['pedido'] ?? $u)['cliente']['identificacion'] ?? null; })()]);
check('Venta de PRUEBA: en el Panel queda anulada, sin factura y marcada PRUEBA (no suma en Finanzas)', [1, 'sin_factura', true],
    [(int) ($x3['anulado'] ?? 0), $x3['factura'] ?? null, str_starts_with((string) ($x3['concepto'] ?? ''), 'PRUEBA')]);

titulo('Panel caído y reintento (bin/tareas.php)');
exec('pkill -f ' . escapeshellarg('127.0.0.1:' . $P_PANEL));
for ($k = 0; $k < 30 && @fsockopen('127.0.0.1', $P_PANEL); $k++) usleep(100000);
$c4 = $comprar($ana, 'creditos_250', 'web_plux', ['modo' => 'consumidor_final', 'tipo_id' => '07', 'identificacion' => '9999999999999', 'razon_social' => 'CONSUMIDOR FINAL', 'email' => 'ana@prueba.example', 'telefono' => '', 'direccion' => '']);
check('Con el Panel apagado: 0 mandadas, la venta queda «error» para reintentar', [0, 'error', 1], [PanelVentas::enviarPendientes(), $cola($c4)['estado'], (int) $cola($c4)['intentos']]);
$panelUp();
$salida = shell_exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config.env') . ' php ' . escapeshellarg($SRV . '/bin/tareas.php') . ' 2>&1');
check('bin/tareas.php la manda cuando el Panel vuelve', [true, 'enviado', 'autorizado'], [str_contains((string) $salida, '1 ventas al Panel Tukan'), $cola($c4)['estado'], $cobro($c4)['tf_estado'] ?? null]);

titulo('Reembolso');
Compras::revertir($c1, 'reembolso', 'Pedido del jugador', 'prueba');
check('Reembolso: el reverso queda en la cola', 'pendiente', $cola($c1, 'revertir')['estado'] ?? null);
PanelVentas::enviarPendientes();
check('Panel: el cobro queda anulado y avisa que falta la nota de crédito en TuFactura', [1, 'enviado', true],
    [(int) ($cobro($c1)['anulado'] ?? 0), $cola($c1, 'revertir')['estado'], str_contains((string) $cola($c1, 'revertir')['factura'], 'nota de crédito')]);

titulo('Seguridad');
file_put_contents($TMP . '/config.env', str_replace("TUKAN_CENTRAL_SECRET=$secreto", 'TUKAN_CENTRAL_SECRET=' . str_repeat('x', 32), $conf));
$salida = shell_exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config.env') . ' php -r ' . escapeshellarg('require "' . $SRV . '/src/arranque.php"; \EnVivo\Db::pdo(); [$h] = \EnVivo\PanelVentas::probar(); echo $h;') . ' 2>&1');
check('Con un secreto que no es el del Panel: 401 (el Panel no acepta ventas falsas)', '401', trim((string) $salida));
$cuentaAntes = (int) $panelDb->query('SELECT COUNT(*) FROM cobros')->fetchColumn();
$cMal = Db::tx(fn() => Compras::insertar($beto, Catalogo::producto('creditos_250'), 'web_plux'));
Db::q("INSERT INTO panel_ventas (compra_id, accion, prueba, estado, creado) VALUES (?, 'registrar', 0, 'pendiente', ?)", [$cMal['id'], time()]);
shell_exec('ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config.env') . ' php ' . escapeshellarg($SRV . '/bin/panel_ventas.php') . ' enviar 2>&1');
check('… la venta queda «rechazada» con aviso en el Centro de Control, y el Panel no anotó nada', ['rechazado', $cuentaAntes, 1],
    [$cola((int) $cMal['id'])['estado'], (int) $panelDb->query('SELECT COUNT(*) FROM cobros')->fetchColumn(), (int) Db::valor("SELECT COUNT(*) FROM avisos WHERE tipo = 'panel_ventas'")]);
$audit = (string) $panelDb->query("SELECT GROUP_CONCAT(accion) FROM auditoria WHERE accion LIKE 'venta%'")->fetchColumn();
check('Auditoría del Panel: ventas recibidas y la rechazada por token', [true, true], [str_contains($audit, 'venta'), str_contains($audit, 'venta_rechazada')]);

foreach ($procs as $p) { proc_terminate($p); proc_close($p); }
$errPanel = trim((string) @file_get_contents($TMP . '/panel/php_errores.log'));
check('Sin errores de PHP en el Panel', '', $errPanel);
$todo = (string) @file_get_contents($TMP . '/panel.log') . $errPanel . (string) @file_get_contents($TMP . '/tf.log');
check('El secreto no aparece en ningún registro', false, str_contains($todo, $secreto));
echo "\n----------------------------------------\nPanel ventas: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
