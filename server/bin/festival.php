<?php
declare(strict_types=1);

// Tarea del Mega Festival (cron de www-data cada 10 minutos, ver server/INTEGRAR_FESTIVAL.md):
//  - vence los turnos pedidos que nadie envió a tiempo;
//  - vuelve a validar los turnos que quedaron pendientes porque el validador estaba caído;
//  - cierra los festivales cuya ventana terminó (reparte premios, mueve la liga y avisa por el chat de sistema).
// La API hace lo mismo "perezosamente" cuando alguien abre el festival; esto lo hace a tiempo aunque nadie entre.
// Se puede correr a mano:   sudo -u www-data php /var/www/envivo/server/bin/festival.php

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Festival};

try {
    Db::pdo();
    [$revalidados, $cerrados] = Festival::tareas(200);
    echo date('Y-m-d H:i') . " festival OK: $revalidados turnos revalidados, $cerrados festivales cerrados\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en festival: ' . $e->getMessage() . "\n");
    exit(1);
}
