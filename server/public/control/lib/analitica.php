<?php
declare(strict_types=1);

// Pestaña "Analítica" (server/INTEGRAR_ANALITICA.md): números de la analítica propia (src/Analitica.php, sin SDK de
// terceros) que arma bin/analitica.php: retención D1/D7/D30 por cohorte (de instalación o de cuenta) con las metas
// 25 % / 8 % / 3 % en colores, el embudo de la guía del primer evento, y los números diarios de los últimos 30 días
// (DAU, instalaciones y cuentas nuevas, conversión, ARPDAU, ARPPU, ingresos, duración de la sesión) en gráficos SVG sin
// librerías. Filtros por plataforma y país (GET). "Recalcular ahora" es un POST con CSRF y queda en la auditoría.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Analitica, Auditoria, Control, Fallo};

const CC_AN_DIAS = 30;
const CC_AN_PLATAFORMAS = ['*' => 'Todas', 'web' => 'Web', 'android' => 'Android', '--' => 'Desconocida'];
const CC_AN_PASOS = ['instalaciones' => 'Abrieron el juego', 'guia_intro' => 'Guía: intro del capítulo', 'guia_clientes' => 'Guía: Clientes',
    'guia_evento' => 'Guía: elige el evento', 'guia_auto' => 'Guía: lo mejor (auto)', 'guia_aire' => 'Guía: al aire', 'guia_elegir' => 'Guía: imprevisto',
    'guia_terminar' => 'Guía: terminar', 'guia_resultado' => 'Guía: resultado', 'guia_fin' => 'Guía completa', 'primer_evento' => 'Primer evento terminado',
    'primer_evento_10m' => 'Primer evento en ≤ 10 min'];

function cc_an_listo(): bool { return class_exists(Analitica::class) && Control::tablas('eventos', 'analitica_dia', 'analitica_cohortes', 'analitica_embudo'); }

/** Filtros válidos de la dirección: plataforma, país y tipo de cohorte. */
function cc_an_filtros(array $seg): array
{
    $p = cc_get('plataforma');
    $c = strtoupper(cc_get('pais'));
    $tipo = cc_get('cohorte') === 'cuenta' ? 'cuenta' : 'instalacion';
    return [
        'plataforma' => isset(CC_AN_PLATAFORMAS[$p]) ? $p : '*',
        'pais' => $c === '--' || preg_match('/^[A-Z]{2}$/', $c) ? $c : '*',
        'cohorte' => $tipo,
    ];
}

function cc_an_pct(?float $v, int $dec = 1): string { return $v === null ? '—' : number_format($v * 100, $dec, ',', '.') . ' %'; }
function cc_an_div(float|int $a, float|int $b): ?float { return $b > 0 ? $a / $b : null; }
function cc_an_dur(?float $s): string { return $s === null ? '—' : ($s >= 60 ? floor($s / 60) . ' min ' . str_pad((string) (int) round(fmod($s, 60)), 2, '0', STR_PAD_LEFT) . ' s' : (int) round($s) . ' s'); }

/** Celda de retención: chip verde si llega a la meta, ámbar si llega a la mitad, rojo si no. */
function cc_an_celda(?int $n, int $tamano, string $k): string
{
    if ($n === null) return '<span class="tenue" title="Ese día todavía no termina">en curso</span>';
    if ($tamano <= 0) return '<span class="tenue">—</span>';
    $r = $n / $tamano;
    $meta = Analitica::METAS[$k];
    $tipo = $r >= $meta ? 'ok' : ($r >= $meta / 2 ? 'aviso' : 'mal');
    return '<span class="chip chip-' . $tipo . '" data-ret="' . $k . '" data-nivel="' . $tipo . '" title="' . e($n . ' de ' . $tamano . ' · meta ' . cc_an_pct($meta, 0)) . '">' . e(cc_an_pct($r)) . '</span>';
}

function cc_t_analitica(): string
{
    $h = '<h1>Analítica</h1>';
    if (!cc_an_listo()) return $h . cc_no_disponible('Analítica', 'Faltan las tablas de la analítica (server/src/migraciones/analitica.sql): corre php server/bin/migrar.php.');
    $seg = Analitica::segmentos();
    $f = cc_an_filtros($seg);
    $hoy = date('Y-m-d');
    $ayer = Analitica::mover($hoy, -1);
    $desde = Analitica::mover($hoy, -(CC_AN_DIAS - 1));
    $ult = Analitica::ultima();

    // Filtros (GET) y recalcular (POST)
    $paises = ['*' => 'Todos'];
    foreach ($seg['paises'] as $p) if ($p !== '--') $paises[$p] = $p;
    $paises['--'] = 'Desconocido';
    if (!isset($paises[$f['pais']])) $paises[$f['pais']] = $f['pais'];
    $h .= '<p class="tenue">Analítica propia del juego (sin servicios de terceros): una instalación es un número al azar guardado en el navegador; '
        . 'no se guarda IP ni navegador y los eventos se borran a los ' . Analitica::RETENCION_DIAS . ' días. Plataforma y país son los de la primera vez que se vio la instalación.</p>';
    $h .= '<form method="get" action="' . CC_RUTA . '" class="filtros-form" id="filtros-analitica"><input type="hidden" name="t" value="analitica">'
        . '<label>Plataforma<select name="plataforma">' . cc_opciones(CC_AN_PLATAFORMAS, $f['plataforma']) . '</select></label>'
        . '<label>País<select name="pais">' . cc_opciones($paises, $f['pais']) . '</select></label>'
        . '<label>Cohortes por<select name="cohorte">' . cc_opciones(['instalacion' => 'Instalación', 'cuenta' => 'Creación de cuenta'], $f['cohorte']) . '</select></label>'
        . '<div class="botones"><button class="btn" type="submit">Filtrar</button></div></form>';
    $h .= '<p class="tenue" id="analitica-ultima">' . ($ult ? 'Resúmenes calculados el ' . e(cc_fecha($ult['en'] ?? null)) . ' (' . (int) ($ult['dias'] ?? 0) . ' días, ' . e((string) ($ult['segundos'] ?? 0)) . ' s).' : '<b>Todavía no se calculan los resúmenes</b> (el cron corre server/bin/analitica.php cada hora).')
        . ' ' . cc_boton('analitica_recalcular', [], 'Recalcular ahora', 'btn btn-chico btn-sec') . '</p>';

    $dias = Analitica::dias($desde, $hoy, $f['plataforma'], $f['pais']);
    $a = $dias[$ayer] ?? array_fill_keys(['dau', 'wau', 'mau', 'nuevas', 'cuentas_nuevas', 'pagadores', 'ingresos', 'sesiones_medidas', 'duracion_total_s', 'primer_evento_10m'], 0);
    $tot = ['ingresos' => 0.0, 'pagadores_dia' => 0, 'dau' => 0, 'nuevas' => 0, 'rapidos' => 0];
    foreach ($dias as $d) { $tot['ingresos'] += $d['ingresos']; $tot['dau'] += $d['dau']; $tot['nuevas'] += $d['nuevas']; $tot['rapidos'] += $d['primer_evento_10m']; $tot['pagadores_dia'] += $d['pagadores']; }

    // Tarjetas: ayer (el último día completo) y los 30 días
    $h .= '<h2>Ayer (' . e(date('d/m', strtotime($ayer))) . ')</h2><div class="kpis" id="kpis-analitica">'
        . cc_tarjeta('Activos del día (DAU)', cc_num($a['dau']), 'WAU ' . cc_num($a['wau']) . ' · MAU ' . cc_num($a['mau']), 'kpi-dau')
        . cc_tarjeta('Instalaciones nuevas', cc_num($a['nuevas']), 'cuentas nuevas: ' . cc_num($a['cuentas_nuevas']), 'kpi-nuevas')
        . cc_tarjeta('Conversión (pagadores / DAU)', cc_an_pct(cc_an_div($a['pagadores'], $a['dau']), 2), cc_num($a['pagadores']) . ' pagador(es)', 'kpi-conversion')
        . cc_tarjeta('ARPDAU', $a['dau'] > 0 ? cc_dinero($a['ingresos'] / $a['dau']) : '—', 'ingresos ' . cc_dinero($a['ingresos']), 'kpi-arpdau')
        . cc_tarjeta('ARPPU', $a['pagadores'] > 0 ? cc_dinero($a['ingresos'] / $a['pagadores']) : '—', 'por pagador', 'kpi-arppu')
        . cc_tarjeta('Sesión media', cc_an_dur(cc_an_div($a['duracion_total_s'], $a['sesiones_medidas'])), cc_num($a['sesiones_medidas']) . ' sesión(es) medidas', 'kpi-sesion')
        . cc_tarjeta('Primer evento en ≤ 10 min', cc_an_pct(cc_an_div($a['primer_evento_10m'], $a['nuevas'])), 'de las instalaciones nuevas', 'kpi-rapido')
        . cc_tarjeta('Ingresos 30 días', cc_dinero($tot['ingresos']), 'ARPDAU 30 d: ' . ($tot['dau'] > 0 ? cc_dinero($tot['ingresos'] / $tot['dau']) : '—'), 'kpi-ingresos30')
        . '</div>';

    // Retención por cohorte
    $coh = Analitica::cohortes($f['cohorte'], Analitica::mover($hoy, -CC_AN_DIAS), $ayer, $f['plataforma'], $f['pais']);   // 30 cohortes completas
    $sum = ['d1' => [0, 0], 'd7' => [0, 0], 'd30' => [0, 0]];
    $cohLargo = Analitica::cohortes($f['cohorte'], Analitica::mover($hoy, -60), $ayer, $f['plataforma'], $f['pais']);
    foreach ($cohLargo as $c) foreach (['d1', 'd7', 'd30'] as $k) if ($c[$k] !== null) { $sum[$k][0] += (int) $c[$k]; $sum[$k][1] += (int) $c['tamano']; }
    $h .= '<section class="panel" id="panel-retencion"><h2>Retención por cohorte (' . ($f['cohorte'] === 'cuenta' ? 'creación de cuenta' : 'instalación') . ')</h2>'
        . '<p class="tenue">D1 / D7 / D30 = de los que llegaron ese día, cuántos volvieron a abrir el juego exactamente 1, 7 y 30 días después. Metas: '
        . cc_chip('D1 ' . cc_an_pct(Analitica::METAS['d1'], 0), 'ok') . ' ' . cc_chip('D7 ' . cc_an_pct(Analitica::METAS['d7'], 0), 'ok') . ' ' . cc_chip('D30 ' . cc_an_pct(Analitica::METAS['d30'], 0), 'ok')
        . ' (ámbar: llega a la mitad; rojo: menos).</p><div class="kpis kpis-chicos" id="retencion-promedio">';
    foreach (['d1' => 'D1', 'd7' => 'D7', 'd30' => 'D30'] as $k => $n) {
        $h .= '<div class="kpi"><span class="kpi-t">' . $n . ' promedio (60 días)</span><b class="kpi-v">' . ($sum[$k][1] > 0 ? cc_an_celda($sum[$k][0], $sum[$k][1], $k) : '—') . '</b><span class="kpi-p">' . cc_num($sum[$k][0]) . ' de ' . cc_num($sum[$k][1]) . ' volvieron (cohortes con el día completo)</span></div>';
    }
    $h .= '</div>' . cc_tabla(['Cohorte', 'Tamaño', 'D1', 'D7', 'D30'], array_map(fn($c) => [
            e(date('d/m/Y', strtotime($c['cohorte']))), cc_num($c['tamano']),
            cc_an_celda($c['d1'] === null ? null : (int) $c['d1'], (int) $c['tamano'], 'd1'),
            cc_an_celda($c['d7'] === null ? null : (int) $c['d7'], (int) $c['tamano'], 'd7'),
            cc_an_celda($c['d30'] === null ? null : (int) $c['d30'], (int) $c['tamano'], 'd30')], array_values(array_filter($coh, fn($c) => (int) $c['tamano'] > 0))),
            'Sin cohortes en los últimos 30 días con estos filtros.', 'tabla-cohortes') . '</section>';

    // Embudo de la guía (cohortes de instalación de los 30 días)
    $emb = Analitica::embudo($desde, $hoy, $f['plataforma'], $f['pais']);
    $base = max(1, $emb['instalaciones']);
    $h .= '<section class="panel" id="panel-embudo"><h2>Embudo del primer evento (instalaciones de los últimos 30 días)</h2>';
    if ($emb['instalaciones'] === 0) $h .= '<p class="vacio tenue">Sin instalaciones nuevas en este período.</p>';
    else {
        $h .= '<ul class="barras" id="embudo">';
        $prev = null;
        foreach (CC_AN_PASOS as $k => $n) {
            $v = $emb[$k] ?? 0;
            $caida = $prev !== null && $prev > 0 && $v < $prev && str_starts_with($k, 'guia_') ? ' · se pierde ' . cc_an_pct(1 - $v / $prev, 0) : '';
            $h .= '<li data-paso="' . e($k) . '" data-n="' . (int) $v . '"><div class="barras-et"><span>' . e($n) . '</span><span class="tenue">' . cc_num($v) . ' · ' . e(cc_an_pct($v / $base, 0)) . e($caida) . '</span></div>'
                . '<svg class="barras-pista" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="pista" width="100" height="6" rx="3"/>'
                . ($v > 0 ? '<rect class="s-a" width="' . max(1, round(100 * $v / $base, 1)) . '" height="6" rx="3"/>' : '') . '</svg></li>';
            if ($k !== 'primer_evento_10m') $prev = $v;
        }
        $h .= '</ul><p class="tenue">La guía solo sale en una partida nueva; quien ya tenía partida no pasa por ella.</p>';
    }
    $h .= '</section>';

    // Gráficos diarios
    $et = array_map(fn($d) => date('d/m', strtotime($d)), array_keys($dias));
    $col = fn(string $c) => array_map(fn($d) => $d[$c], array_values($dias));
    $num = fn(float $v, bool $eje) => cc_num($v);
    $pct = fn(float $v, bool $eje) => number_format($v, $eje ? 1 : 2, ',', '.') . ' %';
    $usd = fn(float $v, bool $eje) => $eje ? '$' . number_format($v, $v < 10 && $v > 0 ? 2 : 0, ',', '.') : cc_dinero($v);
    $min = fn(float $v, bool $eje) => number_format($v, 1, ',', '.') . ' min';
    $conv = array_map(fn($d) => $d['dau'] > 0 ? 100 * $d['pagadores'] / $d['dau'] : 0, array_values($dias));
    $arpdau = array_map(fn($d) => $d['dau'] > 0 ? $d['ingresos'] / $d['dau'] : 0, array_values($dias));
    $arppu = array_map(fn($d) => $d['pagadores'] > 0 ? $d['ingresos'] / $d['pagadores'] : 0, array_values($dias));
    $ses = array_map(fn($d) => $d['sesiones_medidas'] > 0 ? $d['duracion_total_s'] / $d['sesiones_medidas'] / 60 : 0, array_values($dias));
    $h .= '<section class="panel" id="panel-diario"><h2>Últimos 30 días</h2><div class="dos">'
        . cc_grafico_linea('Activos por día (DAU)', $et, ['nombre' => 'DAU', 'clase' => 's-a', 'valores' => $col('dau')], $num, 'g-dau')
        . cc_grafico_linea('Activos en 30 días (MAU)', $et, ['nombre' => 'MAU', 'clase' => 's-a', 'valores' => $col('mau')], $num, 'g-mau')
        . cc_grafico_barras('Instalaciones y cuentas nuevas', $et, [['nombre' => 'Instalaciones', 'clase' => 's-a', 'valores' => $col('nuevas')], ['nombre' => 'Cuentas', 'clase' => 's-b', 'valores' => $col('cuentas_nuevas')]], $num, 'g-nuevas')
        . cc_grafico_linea('Conversión (pagadores / DAU)', $et, ['nombre' => 'Conversión', 'clase' => 's-a', 'valores' => $conv], $pct, 'g-conversion')
        . cc_grafico_barras('Ingresos por día', $et, [['nombre' => 'Ingresos', 'clase' => 's-a', 'valores' => $col('ingresos')]], $usd, 'g-ingresos')
        . cc_grafico_linea('ARPDAU', $et, ['nombre' => 'ARPDAU', 'clase' => 's-a', 'valores' => $arpdau], $usd, 'g-arpdau')
        . cc_grafico_linea('ARPPU', $et, ['nombre' => 'ARPPU', 'clase' => 's-a', 'valores' => $arppu], $usd, 'g-arppu')
        . cc_grafico_linea('Duración media de la sesión', $et, ['nombre' => 'Sesión', 'clase' => 's-a', 'valores' => $ses], $min, 'g-sesion')
        . '</div><p class="tenue">Ingresos = total cobrado (con IVA) de las compras pagadas ese día (tabla compras; las revertidas no cuentan). '
        . 'Conversión = jugadores que pagaron ese día / instalaciones activas ese día.</p></section>';
    return $h;
}

function cc_a_analitica(string $accion, string $quien): string
{
    if ($accion !== 'analitica_recalcular') throw new Fallo('Acción desconocida.', 400);
    if (!cc_an_listo()) throw new Fallo('La analítica no está instalada (faltan sus tablas).', 400);
    $r = Analitica::agregar();
    Auditoria::anotar($quien, 'analitica_recalcular', 'Resúmenes de analítica: ' . $r['dias'] . ' días (' . $r['desde'] . ' a ' . $r['hasta'] . ') en ' . $r['segundos'] . ' s');
    return 'Resúmenes recalculados: ' . $r['dias'] . ' días en ' . $r['segundos'] . ' s.';
}
