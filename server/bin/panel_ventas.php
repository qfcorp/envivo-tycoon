<?php
declare(strict_types=1);

// Ventas del juego al Panel Tukán (src/PanelVentas.php): se anotan y facturan allá con TuFactura, como todos los sistemas.
//   php server/bin/panel_ventas.php probar    revisa la configuración y la conexión con el Panel
//   php server/bin/panel_ventas.php enviar    manda ahora lo pendiente (lo hace solo bin/tareas.php)
//   php server/bin/panel_ventas.php estado    cuántas ventas hay mandadas, pendientes o rechazadas
// Nunca muestra el secreto. Mensajes sin tildes a propósito (se leen bien por SSH desde el celular).
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Config, Db, PanelVentas};

$accion = $argv[1] ?? 'probar';
Db::pdo();
if ($accion === 'enviar') {
    echo 'Ventas mandadas al Panel: ' . PanelVentas::enviarPendientes(500) . "\n";
    exit(0);
}
if ($accion === 'estado') {
    foreach (Db::todas('SELECT accion, estado, COUNT(*) AS n FROM panel_ventas GROUP BY accion, estado ORDER BY accion, estado') as $r) {
        echo '   ' . $r['accion'] . ' ' . $r['estado'] . ': ' . $r['n'] . "\n";
    }
    foreach (Db::todas("SELECT compra_id, accion, respuesta FROM panel_ventas WHERE estado = 'rechazado' ORDER BY id DESC LIMIT 10") as $r) {
        echo '   RECHAZADA compra ' . $r['compra_id'] . ' (' . $r['accion'] . '): ' . $r['respuesta'] . "\n";
    }
    exit(0);
}
if ($accion !== 'probar') { fwrite(STDERR, "Uso: php server/bin/panel_ventas.php probar|enviar|estado\n"); exit(2); }
$mal = 0;
$linea = function (string $txt, bool $ok) use (&$mal): void { if (!$ok) $mal++; echo ($ok ? '   OK    ' : '   FALTA ') . $txt . "\n"; };
echo "== Ventas del juego al Panel Tukan (factura con TuFactura)\n";
$linea('Modulo encendido (FACTURACION_POR_PANEL=1)', Config::get('FACTURACION_POR_PANEL', '0') === '1');
$linea('Direccion del Panel (TUKAN_CENTRAL_URL): ' . (PanelVentas::url() ?: Config::get('TUKAN_CENTRAL_URL')), PanelVentas::url() !== '');
$linea('Id del programa en el Panel (TUKAN_CENTRAL_ID)', PanelVentas::id() !== '');
$linea('Secreto del Panel (TUKAN_CENTRAL_SECRET)', strlen(PanelVentas::secreto()) >= 16);
if (PanelVentas::url() !== '' && PanelVentas::id() !== '' && PanelVentas::secreto() !== '') {
    [$http, $j, $err] = PanelVentas::probar();
    $linea('El Panel contesta y acepta la firma (HTTP ' . $http . ($err !== '' ? ', ' . $err : '') . ($http !== 200 && is_array($j) ? ', ' . ($j['error'] ?? '') : '') . ')', $http === 200 && !empty($j['ok']));
}
echo $mal === 0 ? "RESULTADO: todo bien. Cada venta del juego se anota y factura en el Panel (Cobros y facturas).\n"
                : "RESULTADO: falta lo marcado arriba (FALTA). Guia: server/TUKAN_PAGOS.md (seccion Factura)\n";
exit($mal === 0 ? 0 : 1);
