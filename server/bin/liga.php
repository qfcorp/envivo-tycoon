<?php
declare(strict_types=1);

// Tarea de la Liga Semanal de EN VIVO Tycoon (ver server/INTEGRAR_LIGA.md). Sin ella la liga funciona igual (el cambio
// de semana se hace solo con la primera visita), pero así se cierra a la hora exacta y se revalidan los intentos.
//  - cierra la semana anterior (ranking, ascensos y descensos, fichas) y arma los grupos de la nueva;
//  - devuelve al tablero los encargos vencidos y vence los intentos sin usar;
//  - en modo 'repeticion', vuelve a pasar por el validador los intentos que quedaron pendientes.
// Cron sugerido (www-data):   1 0 * * 1  y  15 * * * *   ->   php /var/www/envivo/server/bin/liga.php
// Con --revisar-firmados repite también los intentos aceptados en modo 'firma' (marca sospechosos, no quita puntos).

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Liga};

try {
    Db::pdo();
    $r = Liga::tareaProgramada(in_array('--revisar-firmados', $argv, true));
    echo date('Y-m-d H:i') . ' liga OK: ' . json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en la liga: ' . $e->getMessage() . "\n");
    exit(1);
}
