<?php
declare(strict_types=1);

// Compras de PRUEBA de Google Play (cuentas de "Pruebas de licencias" de Play Console: Google no cobró) que YA tienen
// factura del SRI (tabla facturas) o que se mandaron al Panel Tukán como venta real (panel_ventas con prueba=0).
// Pasaba antes del arreglo de la auditoría A1 (nov 2026): la compra se aprobaba como venta normal y recién después se
// marcaba "PRUEBA". Desde el arreglo ya no se crean. SOLO LISTA: no anula nada (una factura autorizada por el SRI se
// anula en el portal del SRI o con una nota de crédito desde el ERP; lo decide el dueño con su contador).
//   php server/bin/google_pruebas.php            lista
//   php server/bin/google_pruebas.php --todas    también las compras de prueba sin factura (solo para ver)
// En el VPS:  sudo -u www-data env ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/google_pruebas.php
// Mensajes sin tildes a proposito (se leen bien por SSH desde el celular).
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Google};

$todas = in_array('--todas', $argv, true);
Db::pdo();
$fecha = fn($t) => $t ? date('Y-m-d H:i', (int) $t) : '-';
$tabla = fn(string $t) => (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]);
$hayFacturas = $tabla('facturas');
$hayPanel = $tabla('panel_ventas');

$compras = Db::todas("SELECT id, jugador_id, producto, total, pagado_en, estado, google_order_id FROM compras
                      WHERE canal = 'google_play' AND pagado_por LIKE '%PRUEBA%' ORDER BY id");
echo "== Compras de PRUEBA de Google Play (" . Google::QUIEN_PRUEBA . "): " . count($compras) . "\n";
$conAlgo = 0;
foreach ($compras as $c) {
    $facts = $hayFacturas ? Db::todas('SELECT id, tipo, estado, numero_comprobante, autorizada_en FROM facturas WHERE compra_id = ? ORDER BY id', [$c['id']]) : [];
    $panel = $hayPanel ? Db::todas('SELECT accion, prueba, estado, factura FROM panel_ventas WHERE compra_id = ? AND prueba = 0 ORDER BY id', [$c['id']]) : [];
    if (!$facts && !$panel && !$todas) continue;
    if ($facts || $panel) $conAlgo++;
    echo '   Compra N° ' . $c['id'] . ' · jugador ' . $c['jugador_id'] . ' · ' . $c['producto'] . ' · $' . number_format((float) $c['total'], 2)
        . ' · ' . $fecha($c['pagado_en']) . ' · ' . $c['estado'] . ' · orden ' . ($c['google_order_id'] ?: '-') . "\n";
    foreach ($facts as $f) {
        echo '      ' . ($f['tipo'] === 'factura' ? 'FACTURA' : 'NOTA DE CREDITO') . ' #' . $f['id'] . ': ' . $f['estado']
            . ($f['numero_comprobante'] ? ' ' . $f['numero_comprobante'] : '') . ($f['autorizada_en'] ? ' (autorizada ' . $fecha($f['autorizada_en']) . ')' : '') . "\n";
    }
    foreach ($panel as $p) {
        echo '      Panel Tukan: ' . $p['accion'] . ' ' . $p['estado'] . ' como venta REAL (prueba=0)' . ($p['factura'] ? ' · factura ' . $p['factura'] : '') . "\n";
    }
    if (!$facts && !$panel) echo "      sin factura ni envio al Panel (bien)\n";
}
echo "\n";
if ($conAlgo === 0) {
    echo "Ninguna compra de prueba tiene factura ni se mando al Panel como venta. Nada que revisar.\n";
} else {
    echo "$conAlgo compra(s) de prueba con factura o enviada(s) al Panel como venta real. QUE HACER (no se anula nada solo):\n";
    echo " - Factura 'pendiente' o 'fallida': aun no tiene autorizacion del SRI. Revisala en el ERP y no la emitas.\n";
    echo " - Factura 'autorizada' por el SRI: Google no cobro. Consultalo con el contador (anular en el portal del SRI o nota de credito).\n";
    echo " - Panel Tukan: anula la venta alla (TuFactura) si ya genero factura.\n";
}
exit(0);
