<?php
declare(strict_types=1);

// Limpieza diaria de los errores del juego (server/INTEGRAR_ERRORES.md): borra las ocurrencias de más de 30 días y los
// grupos que se quedan sin ninguna. Cron sugerido (www-data):   40 4 * * *   ->   php /var/www/envivo/server/bin/errores.php
// Opciones: --dias=N (otro plazo, mínimo 1) · --resumen (solo muestra los conteos, no borra nada).

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Errores};

try {
    Db::pdo();
    $dias = Errores::DIAS;
    $soloResumen = false;
    foreach (array_slice($argv, 1) as $a) {
        if (preg_match('/^--dias=(\d{1,4})$/', $a, $m) && (int) $m[1] >= 1) $dias = (int) $m[1];
        elseif ($a === '--resumen') $soloResumen = true;
        else { fwrite(STDERR, "Uso: php errores.php [--dias=N] [--resumen]\n"); exit(2); }
    }
    $c = Errores::conteos();
    $txt = '24 h: ' . $c['n24'] . ' errores en ' . $c['grupos24'] . ' grupos (' . $c['nuevos24'] . ' nuevos) · abiertos: ' . $c['abiertos'];
    if ($soloResumen) { echo date('Y-m-d H:i') . ' errores · ' . $txt . "\n"; exit(0); }
    $r = Errores::limpiar($dias);
    echo date('Y-m-d H:i') . ' errores: borradas ' . $r['ocurrencias'] . ' ocurrencias y ' . $r['grupos'] . ' grupos de más de ' . $dias . ' días · ' . $txt . "\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en la limpieza de errores: ' . $e->getMessage() . "\n");
    exit(1);
}
