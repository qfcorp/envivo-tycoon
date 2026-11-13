<?php
declare(strict_types=1);

// Gran Producción de Asociación (server/INTEGRAR_GRAN_PRODUCCION.md): abre la producción a la hora exacta y la cierra
// (premios al buzón) al terminar. No es obligatorio: el juego, el Centro de Control y el envío de push hacen lo mismo
// al pasar. Recomendado cada 5 minutos en el cron de www-data:
//   */5 * * * * ENVIVO_CONFIG=/etc/envivo/config.env php /ruta/server/bin/gran_produccion.php >> /var/log/envivo-gran.log 2>&1
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, GranProduccion};

try {
    Db::pdo();
    $antes = Db::valor("SELECT COUNT(*) FROM gp_producciones WHERE estado = 'cerrada'");
    $p = GranProduccion::tick();
    $despues = Db::valor("SELECT COUNT(*) FROM gp_producciones WHERE estado = 'cerrada'");
    if ($despues !== $antes) echo date('c') . " gran_produccion: se cerró una producción\n";
    if ($p && (int) $p['creado'] >= time() - 300) echo date('c') . ' gran_produccion: empezó ' . $p['id'] . ' (' . $p['tema'] . ")\n";
} catch (\Throwable $e) {
    echo date('c') . ' gran_produccion ERROR: ' . get_class($e) . ' ' . mb_substr($e->getMessage(), 0, 300) . "\n";
    exit(1);
}
