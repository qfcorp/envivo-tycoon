<?php
declare(strict_types=1);

// Facturación SRI (server/src/Facturacion.php, docs/FACTURACION_SRI.md). Lo corre el cron de www-data cada 5 minutos:
//  - reenvía al ERP los avisos (webhook) que fallaron, con espera creciente (solo si hay FACTURACION_WEBHOOK_URL);
//  - si hay comprobantes con más de 1 hora sin autorizar o fallidos, deja la alerta en el Centro de Control (y la manda con
//    FACTURACION_ALERTA_CMD, ej. el ayudante de Telegram). Como máximo una vez al día, salvo que aparezcan atrasados nuevos.
// A mano:
//   sudo -u www-data php /var/www/envivo/server/bin/facturacion.php
//   sudo -u www-data php /var/www/envivo/server/bin/facturacion.php --rellenar=2026-01-01   crea las facturas que falten de
//        compras pagadas desde esa fecha (lo vendido antes de instalar el módulo; no duplica)
//   sudo -u www-data php /var/www/envivo/server/bin/facturacion.php --resumen

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Db, Facturacion};

try {
    Db::pdo();
    $op = getopt('', ['rellenar::', 'resumen']);
    if (array_key_exists('rellenar', $op)) {
        $desde = is_string($op['rellenar']) && $op['rellenar'] !== '' ? $op['rellenar'] : '2026-01-01';
        $t = preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde) ? strtotime($desde . ' 00:00:00') : false;
        if ($t === false) { fwrite(STDERR, "ERROR: --rellenar=AAAA-MM-DD\n"); exit(1); }
        $n = Facturacion::rellenar($t);
        echo date('Y-m-d H:i') . " facturación: $n factura(s) creadas para compras pagadas desde $desde\n";
        exit(0);
    }
    if (array_key_exists('resumen', $op)) {
        echo json_encode(Facturacion::resumen(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), "\n";
        exit(0);
    }
    [$ok, $mal] = Facturacion::empujarPendientes(100);
    $alerta = Facturacion::revisarAtrasos();
    Db::q('DELETE FROM facturacion_nonces WHERE creado < ?', [time() - Facturacion::NONCE_VIDA]);
    Ajustes::set('facturacion_cron_en', (string) time());
    $r = Facturacion::resumen();
    // Solo escribe en el registro si hubo algo (cada 5 minutos llenaría el archivo)
    if ($ok + $mal > 0 || $alerta !== null) {
        echo date('Y-m-d H:i') . " facturación: avisos al ERP $ok entregados, $mal fallidos · pendientes {$r['pendiente']}, atrasadas {$r['atrasadas']}, fallidas {$r['fallida']}"
            . ($alerta !== null ? ' · ALERTA enviada' : '') . "\n";
    }
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en facturación: ' . $e->getMessage() . "\n");
    exit(1);
}
