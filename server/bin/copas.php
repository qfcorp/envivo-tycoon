<?php
declare(strict_types=1);

// Tarea de la Copa de Servidores de EN VIVO Tycoon (ver server/INTEGRAR_COPAS.md y server/COPAS.md §2). Idempotente:
//  - abre la copa de la semana de cada universo (con su calendario) y cambia de fase a la hora (hora de Ecuador);
//  - vence intentos sin enviar y revalida los que quedaron pendientes (validador caído);
//  - el sábado juega cada cruce cuando llega su hora (node server/eventos/batalla.js);
//  - desde el sábado 20:00, con todos los cruces jugados: tabla final, premios (una sola vez) y anuncio (chat y Discord).
// Cron sugerido (www-data):   */10 * * * *   ->   php /var/www/envivo/server/bin/copas.php

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Copas, Db};

try {
    Db::pdo();
    $r = Copas::tareaProgramada();
    echo date('Y-m-d H:i') . ' copas OK: ' . json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en la copa: ' . $e->getMessage() . "\n");
    exit(1);
}
