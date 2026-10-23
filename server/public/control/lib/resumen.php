<?php
declare(strict_types=1);

// Pestaña "Resumen": ventas, jugadores, créditos (emitidos vs. quemados), soporte y reportes, con gráficos SVG.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Catalogo, Control, Db, Google, Plux};

/**
 * Jugadores activos: la tabla actividad (Sesiones anota un día por jugador que juega). $dias = 1 es hoy (DAU), 30 el MAU.
 * Sin esa tabla se usa el último ingreso (aproximado).
 */
function cc_activos(int $dias): int
{
    $desde = date('Y-m-d', strtotime('-' . ($dias - 1) . ' days', strtotime('today')));
    if (Control::tabla('actividad')) return (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM actividad WHERE dia >= ?', [$desde]);
    return (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE ultimo_ingreso >= ?', [strtotime($desde)]);
}

function cc_ventas(int $desde, ?int $hasta = null): array
{
    $f = Db::fila("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t, COALESCE(SUM(subtotal), 0) AS s, COUNT(DISTINCT jugador_id) AS pagadores
                   FROM compras WHERE estado = 'pagado' AND pagado_en >= ?" . ($hasta !== null ? ' AND pagado_en < ?' : ''), $hasta !== null ? [$desde, $hasta] : [$desde]);
    return ['n' => (int) $f['n'], 't' => (float) $f['t'], 's' => (float) $f['s'], 'pagadores' => (int) $f['pagadores']];
}

function cc_t_resumen(): string
{
    $ahora = time();
    $hoy = strtotime('today');
    $d7 = strtotime('-6 days', $hoy);
    $mes = strtotime(date('Y-m-01 00:00:00'));
    $d30 = strtotime('-29 days', $hoy);
    $vHoy = cc_ventas($hoy); $v7 = cc_ventas($d7); $vMes = cc_ventas($mes);
    $jug = (int) Db::valor('SELECT COUNT(*) FROM jugadores');
    $nuevosHoy = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE creado >= ?', [$hoy]);
    $nuevos7 = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE creado >= ?', [$d7]);
    $act24 = cc_activos(1);
    $act30 = cc_activos(30);
    $pagadoresTotal = (int) Db::valor("SELECT COUNT(DISTINCT jugador_id) FROM compras WHERE estado = 'pagado'");
    $arppu = $vMes['pagadores'] > 0 ? $vMes['t'] / $vMes['pagadores'] : 0;
    $vip = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE vip_hasta > ?', [$ahora]);

    $h = '<h1>Resumen</h1><p class="tenue">Solo se suman compras <b>pagadas</b> (las revertidas no cuentan). Hora del juego: ' . e(date('d/m/Y H:i'))
       . ' · Pago Plux: <b>' . e(Plux::ambiente()) . (Plux::configurado() ? '' : ', sin credenciales') . '</b> · Google Play: <b>' . (Google::configurado() ? 'configurado' : 'sin configurar') . '</b>.</p>';
    $h .= '<div class="kpis">'
        . cc_tarjeta('Ventas hoy', cc_dinero($vHoy['t']), $vHoy['n'] . ' compras · sin IVA ' . cc_dinero($vHoy['s']), 'kpi-hoy')
        . cc_tarjeta('Últimos 7 días', cc_dinero($v7['t']), $v7['n'] . ' compras · ' . $v7['pagadores'] . ' pagadores', 'kpi-7d')
        . cc_tarjeta('Este mes', cc_dinero($vMes['t']), $vMes['n'] . ' compras · sin IVA ' . cc_dinero($vMes['s']), 'kpi-mes')
        . cc_tarjeta('ARPPU del mes', cc_dinero($arppu), $vMes['pagadores'] . ' jugadores pagaron este mes', 'kpi-arppu')
        . cc_tarjeta('Jugadores', cc_num($jug), $pagadoresTotal . ' pagaron alguna vez · ' . $vip . ' VIP', 'kpi-jugadores')
        . cc_tarjeta('Nuevos', cc_num($nuevosHoy) . ' hoy', $nuevos7 . ' en 7 días', 'kpi-nuevos')
        . cc_tarjeta('Activos hoy (DAU)', cc_num($act24), 'MAU (30 días): ' . cc_num($act30), 'kpi-activos')
        . cc_resumen_pendientes()
        . '</div>';

    // Ventas por día (30 días)
    $dias = cc_dias(30);
    $filas = Db::todas("SELECT pagado_en AS t, total AS v FROM compras WHERE estado = 'pagado' AND pagado_en >= ?", [$d30]);
    $h .= '<section class="panel">' . cc_grafico_barras('Ventas por día (últimos 30 días, con IVA)', array_values($dias),
        [['nombre' => 'Ventas', 'clase' => 's-a', 'valores' => cc_por_dia($dias, $filas)]],
        fn(float $v, bool $eje) => $eje && $v >= 10 ? '$' . cc_num($v) : cc_dinero($v), 'graf-ventas') . '</section>';

    // Por producto y por canal (30 días)
    $porProd = Db::todas("SELECT producto, COUNT(*) AS n, SUM(total) AS t FROM compras WHERE estado = 'pagado' AND pagado_en >= ? GROUP BY producto ORDER BY t DESC", [$d30]);
    $tot30 = array_sum(array_column($porProd, 't')) ?: 1;
    $h .= '<div class="dos"><section class="panel"><h2>Más vendidos (30 días)</h2>' . cc_barras_lista(array_map(fn($f) => [
            (Catalogo::productoCompra((string) $f['producto'])['nombre'] ?? $f['producto']), (float) $f['t'], cc_dinero($f['t']) . ' · ' . (int) $f['n'] . ' compras · ' . round(100 * $f['t'] / $tot30) . ' %'], $porProd), 'Sin ventas en 30 días.', 'mas-vendidos') . '</section>';
    if (Control::columna('compras', 'canal')) {
        $porCanal = Db::todas("SELECT canal, COUNT(*) AS n, SUM(total) AS t FROM compras WHERE estado = 'pagado' AND pagado_en >= ? GROUP BY canal ORDER BY t DESC", [$d30]);
        $nom = ['web_plux' => 'Web (Plux)', 'google_play' => 'Google Play'];
        $h .= '<section class="panel"><h2>Por canal (30 días)</h2>' . cc_barras_lista(array_map(fn($f) => [$nom[$f['canal']] ?? $f['canal'], (float) $f['t'], cc_dinero($f['t']) . ' · ' . (int) $f['n'] . ' compras'], $porCanal), 'Sin ventas en 30 días.', 'por-canal') . '</section>';
    } else {
        $h .= '<section class="panel"><h2>Por canal</h2>' . cc_no_disponible('Ventas por canal', 'La tabla compras todavía no tiene la columna "canal".') . '</section>';
    }
    $h .= '</div>';

    // Créditos: emitidos vs. quemados (libro de movimientos). Lo que pasa de un jugador a otro en el mercado no se emite
    // ni se quema: solo se quema la comisión (5 %).
    $d14 = cc_dias(14);
    $comisionDe = fn(int $desde) => Control::tabla('mercado_publicaciones') ? Db::todas("SELECT cerrado AS t, comision AS v FROM mercado_publicaciones WHERE estado = 'vendida' AND cerrado >= ?", [$desde]) : [];
    $mov = Db::todas("SELECT creado AS t, cambio FROM movimientos_creditos WHERE creado >= ? AND motivo NOT LIKE 'mercado_%'", [strtotime('-13 days', $hoy)]);
    $emit = cc_por_dia($d14, array_map(fn($m) => ['t' => $m['t'], 'v' => max(0, (int) $m['cambio'])], $mov));
    $quem = array_map(fn($a, $b) => $a + $b, cc_por_dia($d14, array_map(fn($m) => ['t' => $m['t'], 'v' => max(0, -(int) $m['cambio'])], $mov)), cc_por_dia($d14, $comisionDe(strtotime('-13 days', $hoy))));
    $porMotivo = Db::todas('SELECT motivo, SUM(CASE WHEN cambio > 0 THEN cambio ELSE 0 END) AS emit, SUM(CASE WHEN cambio < 0 THEN -cambio ELSE 0 END) AS quem FROM movimientos_creditos WHERE creado >= ? GROUP BY motivo ORDER BY emit + quem DESC', [$d30]);
    $sinMercado = array_filter($porMotivo, fn($f) => !str_starts_with((string) $f['motivo'], 'mercado_'));
    $comision = (int) array_sum(array_column($comisionDe($d30), 'v'));
    $e30 = (int) array_sum(array_column($sinMercado, 'emit'));
    $q30 = (int) array_sum(array_column($sinMercado, 'quem')) + $comision;
    $circ = (int) Db::valor('SELECT COALESCE(SUM(creditos - deuda), 0) FROM jugadores');
    $deuda = (int) Db::valor('SELECT COALESCE(SUM(deuda), 0) FROM jugadores');
    $nombres = ['compra' => 'Comprados con dinero', 'manual' => 'Dados / quitados a mano', 'vip_bono' => 'Bono VIP diario', 'tarjeta_mensual' => 'Tarjeta mensual',
                'gasto' => 'Canjes de la tienda', 'mercado_compra' => 'Pagados en el mercado', 'mercado_venta' => 'Recibidos en el mercado', 'reversion' => 'Quitados por reembolso'];
    $filasMotivo = array_map(fn($f) => [e($nombres[$f['motivo']] ?? $f['motivo']), cc_num($f['emit']), cc_num($f['quem'])], $porMotivo);
    $filasMotivo[] = ['<b>Comisión del mercado (quemada)</b>', '', cc_num($comision)];
    $h .= '<section class="panel"><h2>Créditos: emitidos vs. quemados</h2><div class="kpis kpis-chicos">'
        . cc_tarjeta('Emitidos (30 días)', cc_num($e30), 'compras, bonos, tarjeta, a mano', 'kpi-emitidos')
        . cc_tarjeta('Quemados (30 días)', cc_num($q30), 'canjes, quitados y comisión del mercado', 'kpi-quemados')
        . cc_tarjeta('Comisión del mercado (30 días)', cc_num($comision), 'desaparece: no va a nadie')
        . cc_tarjeta('En circulación', cc_num($circ), 'saldo de todos (créditos − deuda)' . ($deuda > 0 ? ' · deuda ' . cc_num($deuda) : '')) . '</div>'
        . cc_grafico_barras('Créditos por día (14 días)', array_values($d14), [
            ['nombre' => 'Emitidos', 'clase' => 's-a', 'valores' => $emit],
            ['nombre' => 'Quemados', 'clase' => 's-b', 'valores' => $quem]], fn(float $v, bool $eje) => cc_num($v), 'graf-creditos')
        . cc_tabla(['Motivo', 'Emitidos (+)', 'Gastados (−)'], $filasMotivo, 'Sin movimientos en 30 días.', 'tabla-creditos')
        . '</section>';

    // Jugadores nuevos por día
    $nuevos = Db::todas('SELECT creado AS t, 1 AS v FROM jugadores WHERE creado >= ?', [$d30]);
    $h .= '<section class="panel">' . cc_grafico_linea('Jugadores nuevos por día (30 días)', array_values($dias), ['nombre' => 'Nuevos', 'clase' => 's-a', 'valores' => cc_por_dia($dias, $nuevos)],
        fn(float $v, bool $eje) => cc_num($v), 'graf-nuevos') . '</section>';

    // Avisos del sistema
    $avisos = Db::todas('SELECT * FROM avisos ORDER BY id DESC LIMIT 10');
    $h .= '<section class="panel"><h2>Avisos para revisar</h2>' . cc_tabla(['Fecha', 'Tipo', 'Compra', 'Detalle'], array_map(fn($a) => [
        e(cc_fecha($a['creado'])), e($a['tipo']), $a['compra_id'] ? '<a href="' . e(cc_url(['t' => 'compras', 'id' => $a['compra_id']])) . '">N° ' . (int) $a['compra_id'] . '</a>' : '—',
        '<span class="largo">' . e(mb_substr((string) $a['detalle'], 0, 300)) . '</span>'], $avisos), 'Nada para revisar.') . '</section>';
    return $h;
}

function cc_resumen_pendientes(): string
{
    $con = Control::tablas('soporte_casos', 'soporte_mensajes') ? cc_soporte_conteos() : null;
    $soporte = $con ? cc_num($con['esperan_respuesta']) : '—';
    $reportes = Control::tabla('chat_reportes') ? cc_num(Db::valor("SELECT COUNT(DISTINCT mensaje_id) FROM chat_reportes WHERE estado = 'pendiente'")) : '—';
    return '<a class="kpi kpi-enlace" id="kpi-soporte" href="' . e(cc_url(['t' => 'soporte'])) . '"><span class="kpi-t">Soporte abierto</span><b class="kpi-v">' . e($soporte) . '</b><span class="kpi-p">' . ($con === null ? 'aún no disponible' : 'esperan respuesta · ' . ($con['abierto'] + $con['respondido']) . ' sin cerrar') . '</span></a>'
         . '<a class="kpi kpi-enlace" id="kpi-reportes" href="' . e(cc_url(['t' => 'chat'])) . '"><span class="kpi-t">Reportes del chat</span><b class="kpi-v">' . e($reportes) . '</b><span class="kpi-p">' . ($reportes === '—' ? 'aún no disponible' : 'mensajes pendientes') . '</span></a>';
}

/** Lista con barras horizontales (HTML): [[etiqueta, valor, texto], ...] */
function cc_barras_lista(array $filas, string $vacio, string $id): string
{
    if (!$filas) return '<p class="tenue">' . e($vacio) . '</p>';
    $max = max(array_column($filas, 1)) ?: 1;
    $h = '<ul class="barras" id="' . e($id) . '">';
    foreach ($filas as [$et, $v, $txt]) {
        $h .= '<li><div class="barras-et"><span>' . e($et) . '</span><span class="tenue">' . e($txt) . '</span></div><svg class="barras-pista" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="pista" width="100" height="6" rx="3"/>'
            . '<rect class="s-a" width="' . max(1, round(100 * $v / $max, 1)) . '" height="6" rx="3"/></svg></li>';
    }
    return $h . '</ul>';
}
