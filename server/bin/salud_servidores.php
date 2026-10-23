<?php
declare(strict_types=1);

// Vigilancia diaria de los servidores de EN VIVO Tycoon (server/COPAS.md §3, server/INTEGRAR_FUSIONES.md).
//  - saca la foto de salud de cada servidor (servidor_salud) del día anterior (el último día completo);
//  - si un servidor ENTRA en abandono, arma un plan de fusión sugerido y deja un aviso en el Centro de Control.
//  - NUNCA ejecuta una fusión: eso lo aprueba una persona en el Centro de Control > Servidores.
// Cron sugerido (www-data):   20 0 * * *   ->   php /var/www/envivo/server/bin/salud_servidores.php
// Opciones: --dia=YYYY-MM-DD (otro día; repetir un día reemplaza su foto) · --hoy (el día de hoy, parcial).

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, SaludServidores};

try {
    Db::pdo();
    $dia = null;
    foreach (array_slice($argv, 1) as $a) {
        if (preg_match('/^--dia=(\d{4}-\d{2}-\d{2})$/', $a, $m)) $dia = $m[1];
        elseif ($a === '--hoy') $dia = SaludServidores::hoy();
        else { fwrite(STDERR, "Uso: php salud_servidores.php [--dia=YYYY-MM-DD | --hoy]\n"); exit(2); }
    }
    $r = SaludServidores::foto($dia);
    $txt = [];
    foreach ($r['servidores'] as $s) $txt[] = 'S' . $s['servidor_id'] . '=' . $s['estado'] . ' (7d ' . $s['activos_7'] . ', 14d ' . $s['activos_14'] . ')';
    echo date('Y-m-d H:i') . ' salud ' . $r['dia'] . ': ' . (implode(' · ', $txt) ?: 'sin servidores')
        . ($r['nuevos_abandono'] ? ' · NUEVOS EN ABANDONO: ' . implode(', ', $r['nuevos_abandono']) . ' (planes: ' . (implode(', ', $r['planes']) ?: '-') . ')' : '') . "\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en la salud de servidores: ' . $e->getMessage() . "\n");
    exit(1);
}
