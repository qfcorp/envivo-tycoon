<?php
declare(strict_types=1);

// Centro de Control: "Tus primeros 7 días" (src/RutaNovato.php) dentro de la pestaña Analítica (lib/analitica.php la llama).
// Muestra, para las instalaciones que empezaron la ruta en los últimos 30 días (eventos novato_dia de la analítica), cuántas
// completaron y reclamaron cada día y el premio grande; y lo mismo con los reclamos guardados de las cuentas nuevas.
// Solo lee: no tiene acciones.

use EnVivo\RutaNovato;

function cc_novato_panel(string $desde, string $hasta): string
{
    if (!class_exists(RutaNovato::class)) return '';
    try { $r = RutaNovato::resumen($desde, $hasta); } catch (\Throwable) { return ''; }
    $ins = $r['instalaciones'];
    $cue = $r['cuentas'];
    $base = max(1, (int) $ins['inicio']);
    $baseC = max(1, (int) ($cue['nuevas'] ?? 0));
    $pct = fn(int $v, int $b) => number_format(100 * $v / max(1, $b), 0, ',', '.') . ' %';
    $filas = [];
    for ($d = 1; $d <= RutaNovato::DIAS; $d++) {
        $filas[] = ['Día ' . $d, cc_num($ins['completo'][$d]) . ' · ' . e($pct($ins['completo'][$d], $base)), cc_num($ins['reclamado'][$d]) . ' · ' . e($pct($ins['reclamado'][$d], $base)),
            cc_num($cue['reclamado'][$d]) . ' · ' . e($pct($cue['reclamado'][$d], $baseC))];
    }
    $filas[] = ['<b>Premio grande</b>', '—', cc_num($ins['final']) . ' · ' . e($pct($ins['final'], $base)), cc_num($cue['final']) . ' · ' . e($pct($cue['final'], $baseC))];
    return '<section class="panel" id="panel-novato"><h2>Tus primeros 7 días (ruta de novato, últimos 30 días)</h2>'
        . '<p class="tenue">Empezaron la ruta: <b>' . cc_num($ins['inicio']) . '</b> instalaciones · cuentas nuevas: <b>' . cc_num($cue['nuevas'] ?? 0) . '</b>'
        . ' · ofertas de novato vendidas: <b>' . cc_num($cue['ofertas']) . '</b></p>'
        . cc_tabla(['Día', 'Completaron (instalaciones)', 'Reclamaron (instalaciones)', 'Reclamaron (cuentas)'], $filas, 'Todavía nadie empezó la ruta.', 'tabla-novato')
        . '<p class="tenue">Un día se abre por cada día real desde que empezó. Si el día 7 retiene más que el D7 normal (meta 8 %), la ruta funciona.</p></section>';
}
