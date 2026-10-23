<?php
declare(strict_types=1);

// Resúmenes de la analítica propia (src/Analitica.php, server/INTEGRAR_ANALITICA.md): DAU/WAU/MAU, instalaciones,
// retención D1/D7/D30 por cohorte, embudo de la guía, conversión, ARPDAU/ARPPU y sesiones, por plataforma y país.
// También borra los eventos de más de 90 días. El cron (deploy/instalar.sh) la corre cada hora con --dias 2 y a las
// 0:40 con los 35 días completos. A mano:
//   sudo -u www-data php /var/www/envivo/server/bin/analitica.php            (últimos 35 días)
//   ... analitica.php --dias 2                                               (hoy y ayer)
//   ... analitica.php --dias 90 --hoy 2026-10-20                             (rehacer con otra fecha de referencia)

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Analitica, Db};

$op = getopt('', ['dias:', 'hoy:']);
$dias = isset($op['dias']) && ctype_digit((string) $op['dias']) ? (int) $op['dias'] : Analitica::DIAS_RECALCULO;
$hoy = isset($op['hoy']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $op['hoy']) ? (string) $op['hoy'] : null;
try {
    Db::pdo();
    $r = Analitica::agregar($dias, $hoy);
    echo date('Y-m-d H:i') . " analitica OK: {$r['dias']} días ({$r['desde']} a {$r['hasta']}) en {$r['segundos']} s, {$r['borrados']} eventos viejos borrados\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en analitica: ' . $e->getMessage() . "\n");
    exit(1);
}
