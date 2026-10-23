<?php
declare(strict_types=1);

// Revisa en Google Play las compras ANULADAS (reembolsos y contracargos: Voided Purchases API) y las revierte en el juego
// (quita lo que dieron y suspende la cuenta, igual que "Revertir" en el panel). También reintenta los avisos a Google
// (consume / acknowledge) que hayan fallado. Lo programa deploy/instalar.sh cada hora en el cron de www-data.
// A mano:   sudo -u www-data php /var/www/envivo/server/bin/google_anulados.php

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Google};

try {
    Db::pdo();
    if (!Google::configurado()) { echo date('Y-m-d H:i') . " Google Play sin configurar (GOOGLE_PACKAGE_NAME y GOOGLE_SERVICE_ACCOUNT_JSON): nada que hacer\n"; exit(0); }
    [$revisadas, $revertidas] = Google::revisarAnuladas();
    $avisos = Google::avisosPendientes();
    echo date('Y-m-d H:i') . " google OK: $revisadas anuladas revisadas, $revertidas revertidas, $avisos avisos reintentados\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en google_anulados: ' . $e->getMessage() . "\n");
    exit(1);
}
