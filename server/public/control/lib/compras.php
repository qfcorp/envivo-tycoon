<?php
declare(strict_types=1);

// Pestaña "Compras": filtros, detalle, exportar CSV para la facturación del SRI y reembolso / contracargo.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Auditoria, Catalogo, Control, Db, Fallo};

const CC_ESTADOS_COMPRA = ['todas' => 'Todas', 'pagado' => 'Pagadas', 'pendiente' => 'Pendientes', 'rechazado' => 'Rechazadas', 'revertido' => 'Revertidas'];

/** Filtros de la URL ya validados. */
function cc_compras_filtros(): array
{
    $f = ['estado' => cc_get('estado') ?: 'pagado', 'desde' => cc_get('desde'), 'hasta' => cc_get('hasta'), 'producto' => cc_get('producto'), 'canal' => cc_get('canal'), 'q' => cc_get('q')];
    if (!isset(CC_ESTADOS_COMPRA[$f['estado']])) $f['estado'] = 'pagado';
    foreach (['desde', 'hasta'] as $k) if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f[$k]) || strtotime($f[$k]) === false) $f[$k] = '';
    if ($f['producto'] !== '' && !Catalogo::productoCompra($f['producto'])) $f['producto'] = '';
    if (!in_array($f['canal'], ['web_plux', 'google_play'], true) || !Control::columna('compras', 'canal')) $f['canal'] = '';
    return $f;
}

function cc_compras_consulta(array $f, int $limite): array
{
    $w = []; $p = [];
    if ($f['estado'] !== 'todas') { $w[] = 'c.estado = ?'; $p[] = $f['estado']; }
    $fecha = $f['estado'] === 'pagado' ? 'c.pagado_en' : 'COALESCE(c.pagado_en, c.creado)';
    if ($f['desde'] !== '') { $w[] = "$fecha >= ?"; $p[] = strtotime($f['desde'] . ' 00:00:00'); }
    if ($f['hasta'] !== '') { $w[] = "$fecha < ?"; $p[] = strtotime($f['hasta'] . ' 00:00:00 +1 day'); }
    if ($f['producto'] !== '') { $w[] = 'c.producto = ?'; $p[] = $f['producto']; }
    if ($f['canal'] !== '') { $w[] = 'c.canal = ?'; $p[] = $f['canal']; }
    if ($f['q'] !== '') {
        $l = '%' . addcslashes($f['q'], '%_\\') . '%';
        $w[] = "(j.email LIKE ? ESCAPE '\\' OR c.comprador_cedula LIKE ? ESCAPE '\\' OR c.comprador_nombre LIKE ? ESCAPE '\\' OR c.comprador_email LIKE ? ESCAPE '\\' OR c.plux_transaccion = ? OR c.id = ?)";
        array_push($p, $l, $l, $l, $l, $f['q'], ctype_digit($f['q']) ? (int) $f['q'] : -1);
    }
    $sql = 'SELECT c.*, j.email AS jugador_email, j.nombre AS jugador_nombre FROM compras c JOIN jugadores j ON j.id = c.jugador_id'
         . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY c.id DESC' . ($limite > 0 ? ' LIMIT ' . $limite : '');
    return Db::todas($sql, $p);
}

function cc_t_compras(): string
{
    $id = cc_get_int('id');
    if ($id > 0) return cc_compra_detalle($id);
    $f = cc_compras_filtros();
    $canal = Control::columna('compras', 'canal');
    $prods = ['' => 'Todos los productos'];
    foreach (Catalogo::PRODUCTOS as $k => $p) $prods[$k] = $p['nombre'];
    $h = '<h1>Compras</h1><form method="get" action="' . CC_RUTA . '" class="filtros-form"><input type="hidden" name="t" value="compras">'
       . '<label>Estado<select name="estado">' . cc_opciones(CC_ESTADOS_COMPRA, $f['estado']) . '</select></label>'
       . '<label>Desde<input type="date" name="desde" value="' . e($f['desde']) . '"></label>'
       . '<label>Hasta<input type="date" name="hasta" value="' . e($f['hasta']) . '"></label>'
       . '<label>Producto<select name="producto">' . cc_opciones($prods, $f['producto']) . '</select></label>'
       . ($canal ? '<label>Canal<select name="canal">' . cc_opciones(['' => 'Todos', 'web_plux' => 'Web (Plux)', 'google_play' => 'Google Play'], $f['canal']) . '</select></label>' : '')
       . '<label class="ancho">Buscar<input type="search" name="q" value="' . e($f['q']) . '" placeholder="N°, cédula, nombre, correo, transacción"></label>'
       . '<div class="botones"><button class="btn" type="submit">Filtrar</button><a class="btn btn-sec" id="csv-sri" href="' . e(cc_url(['t' => 'compras', 'csv' => '1'] + $f)) . '">Exportar CSV para el SRI</a></div></form>';
    $filas = cc_compras_consulta($f, 300);
    $sum = ['t' => 0.0, 's' => 0.0, 'i' => 0.0];
    foreach ($filas as $c) { $sum['t'] += (float) $c['total']; $sum['s'] += (float) $c['subtotal']; $sum['i'] += (float) $c['iva']; }
    $h .= '<p class="tenue">' . count($filas) . ' compra(s)' . (count($filas) === 300 ? ' (se muestran las 300 más recientes; el CSV trae todas)' : '') . ' · total ' . cc_dinero($sum['t']) . ' · subtotal ' . cc_dinero($sum['s']) . ' · IVA ' . cc_dinero($sum['i']) . '</p>';
    $h .= cc_tabla(['N°', 'Fecha', 'Estado', 'Producto', 'Total', 'Comprador', 'Cuenta'], array_map(fn($c) => [
        '<a href="' . e(cc_url(['t' => 'compras', 'id' => $c['id']])) . '"><b>' . (int) $c['id'] . '</b></a>', e(cc_fecha($c['pagado_en'] ?? $c['creado'])), cc_estado_compra((string) $c['estado']),
        e(Catalogo::productoCompra((string) $c['producto'])['nombre'] ?? $c['producto']) . (isset($c['canal']) && $c['canal'] === 'google_play' ? ' ' . cc_chip('Google Play') : ''),
        cc_dinero($c['total']), e($c['comprador_nombre'] ?: '—') . '<br><span class="tenue">' . e($c['comprador_cedula']) . '</span>',
        '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $c['jugador_id']])) . '">' . e($c['jugador_email']) . '</a>'], $filas), 'Ninguna compra con esos filtros.', 'tabla-compras');
    return $h;
}

function cc_compra_detalle(int $id): string
{
    $c = Db::fila('SELECT c.*, j.email AS jugador_email, j.nombre AS jugador_nombre FROM compras c JOIN jugadores j ON j.id = c.jugador_id WHERE c.id = ?', [$id]);
    $h = '<p><a href="' . e(cc_url(['t' => 'compras'])) . '">← Compras</a></p>';
    if (!$c) return $h . cc_no_disponible('Compra N° ' . $id, 'No existe.');
    $p = Catalogo::productoCompra((string) $c['producto']);
    $h .= '<h1 id="detalle-compra">Compra N° ' . $id . ' ' . cc_estado_compra((string) $c['estado']) . '</h1>';
    $datos = [
        'Producto' => ($p['nombre'] ?? $c['producto']) . ' (' . $c['producto'] . ')', 'Total con IVA' => cc_dinero($c['total']), 'Subtotal' => cc_dinero($c['subtotal']), 'IVA' => cc_dinero($c['iva']),
        'Creada' => cc_fecha($c['creado']), 'Pagada' => cc_fecha($c['pagado_en']), 'Pagada por' => $c['pagado_por'] ?? '—', 'Canal' => $c['canal'] ?? 'web_plux',
        'Transacción Plux' => $c['plux_transaccion'] ?? '—', 'Paso Plux' => $c['plux_paso'] ?? '—',
        'Cédula' => $c['comprador_cedula'] ?? '—', 'Nombre' => $c['comprador_nombre'] ?? '—', 'Correo (factura)' => $c['comprador_email'] ?? '—', 'Celular' => $c['comprador_telefono'] ?? '—',
    ];
    if ($c['creditos'] !== null) $datos['Créditos de la compra'] = cc_num($c['creditos']) . ((int) $c['bono_pct'] > 0 ? ' (incluye oferta +' . (int) $c['bono_pct'] . ' %)' : '');
    if (!empty($c['google_order_id'])) $datos['Orden de Google'] = $c['google_order_id'] . (array_key_exists('google_ack', $c) ? ($c['google_ack'] ? ' · aviso a Google ' . cc_fecha($c['google_ack']) : ' · falta avisar a Google') : '');
    if (!empty($c['transferencia_id'])) $datos['Transferencia'] = 'N° ' . $c['transferencia_id'];
    $h .= '<section class="panel"><dl class="datos">';
    foreach ($datos as $k => $v) $h .= '<dt>' . e($k) . '</dt><dd>' . e((string) $v) . '</dd>';
    $h .= '<dt>Cuenta</dt><dd><a href="' . e(cc_url(['t' => 'jugadores', 'id' => $c['jugador_id']])) . '">' . e($c['jugador_nombre'] . ' · ' . $c['jugador_email']) . '</a></dd></dl></section>';

    $dado = Control::loDadoPorCompra($c);
    $h .= '<section class="panel"><h2>Lo que entregó esta compra</h2><ul class="lista">'
        . '<li>Créditos: <b>' . cc_num($dado['creditos']) . '</b></li>'
        . ($dado['vip_dias'] ? '<li>VIP: ' . $dado['vip_dias'] . ' días</li>' : '')
        . ($dado['tarjeta_dias'] ? '<li>Tarjeta mensual: ' . $dado['tarjeta_dias'] . ' días</li>' : '');
    foreach ($dado['equipos'] as $x) $h .= '<li>Equipo: ' . e(Catalogo::nombreEquipo((string) $x['item'])) . ' #' . sprintf('%04d', (int) $x['serie']) . ' — ' . e($x['estado']) . ((int) $x['jugador_id'] !== (int) $c['jugador_id'] ? ' (ahora es de otro jugador: N° ' . (int) $x['jugador_id'] . ')' : '') . '</li>';
    foreach ($dado['entregas'] as $x) $h .= '<li>Entrega: ' . e($x['tipo'] . ' ' . $x['item'] . ' × ' . $x['cantidad']) . ' <span class="tenue">(no se puede quitar desde el servidor)</span></li>';
    $h .= '</ul></section>';

    if ($c['estado'] === 'revertido') {
        $aud = Db::todas("SELECT * FROM auditoria WHERE compra_id = ? AND accion LIKE 'compra_%' ORDER BY id DESC LIMIT 5", [$id]);
        $h .= '<section class="panel" id="reembolso-hecho"><h2>' . e(ucfirst((string) $c['revertida_tipo'])) . ' aplicado</h2><ul class="lista"><li>' . e(cc_fecha($c['revertida_en'])) . ' por ' . e($c['revertida_por']) . ': ' . e($c['revertida_motivo']) . '</li>';
        foreach ($aud as $a) $h .= '<li class="largo">' . e($a['detalle']) . '</li>';
        $h .= '<li>La cuenta quedó suspendida o baneada hasta que se resuelva (se reactiva en la ficha del jugador).</li></ul></section>';
    } elseif ($c['estado'] === 'pagado') {
        $h .= '<section class="panel peligro"><h2>Reembolso o contracargo</h2><p class="tenue">Quita los créditos que dio la compra (aunque ya los haya gastado: queda como deuda), revoca los equipos de la compra que todavía tiene '
            . '(y los saca del mercado), descuenta los días de VIP/tarjeta, marca la compra como revertida y <b>suspende la cuenta</b> (un contracargo o varios reembolsos la <b>banean</b>: ver Ajustes). El dinero se devuelve aparte, en Plux o Google.</p>'
            . cc_form('compra_revertir', ['compra_id' => $id], 'form', '¿Revertir la compra N° ' . $id . ' y suspender la cuenta? No se puede deshacer.')
            . '<label>Tipo<select name="tipo">' . cc_opciones(['reembolso' => 'Reembolso (lo pedimos/aceptamos)', 'contracargo' => 'Contracargo (lo pidió el banco)'], 'reembolso') . '</select></label>'
            . '<label>Motivo (obligatorio)<input name="motivo" required maxlength="300"></label>'
            . '<button class="btn btn-peligro" type="submit">Revertir compra</button></form></section>';
    }
    return $h;
}

function cc_a_compras(string $accion, string $q): string
{
    if ($accion !== 'compra_revertir') throw new Fallo('Acción desconocida.', 400);
    $id = cc_post_int('compra_id');
    $r = Control::revertirCompra($id, cc_post('tipo'), cc_post('motivo'), $q);
    return 'Compra N° ' . $id . ' revertida: ' . cc_num($r['creditos']) . ' créditos descontados, ' . $r['equipos_quitados'] . ' equipo(s) quitado(s)'
        . ($r['equipos_ya_vendidos'] ? ', ' . $r['equipos_ya_vendidos'] . ' ya vendido(s) a otros (no se quitan)' : '') . ($r['vip'] ? ', VIP descontado' : '') . ($r['tarjeta'] ? ', tarjeta descontada' : '') . (!empty($r['baneado']) ? '. La cuenta quedó BANEADA (contracargo o reembolsos repetidos).' : '. La cuenta quedó suspendida.');
}

/** Evita que Excel ejecute fórmulas escritas por un comprador. */
function cc_csv_seguro(mixed $v): string
{
    $s = (string) $v;
    return $s !== '' && strpbrk($s[0], "=+-@\t\r") !== false ? "'" . $s : $s;
}

/** CSV (Excel) para facturar en el SRI. Columnas fijas (ver INTEGRAR_CONTROL.md). */
function cc_compras_csv(): never
{
    $f = cc_compras_filtros();
    Auditoria::anotar(cc_quien(), 'control_csv_compras', 'CSV de compras: ' . json_encode(array_filter($f), JSON_UNESCAPED_UNICODE));
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="compras-sri-' . $f['estado'] . '-' . date('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $o = fopen('php://output', 'w');
    fwrite($o, "\xEF\xBB\xBF");
    fputcsv($o, ['N° compra', 'Fecha de pago', 'Cédula/RUC comprador', 'Nombre comprador', 'Correo comprador', 'Celular', 'Producto', 'Subtotal', 'IVA', 'Total', 'Estado', 'Canal', 'Transacción', 'Cuenta del jugador'], ';', '"', '');
    foreach (cc_compras_consulta($f, 0) as $c) {
        $p = Catalogo::productoCompra((string) $c['producto']);
        fputcsv($o, array_map('cc_csv_seguro', [$c['id'], $c['pagado_en'] ? date('Y-m-d H:i', (int) $c['pagado_en']) : '', $c['comprador_cedula'], $c['comprador_nombre'], $c['comprador_email'], $c['comprador_telefono'],
            $p['nombre'] ?? $c['producto'], number_format((float) $c['subtotal'], 2, '.', ''), number_format((float) $c['iva'], 2, '.', ''), number_format((float) $c['total'], 2, '.', ''),
            $c['estado'], $c['canal'] ?? 'web_plux', ($c['canal'] ?? '') === 'google_play' ? ($c['google_order_id'] ?? '') : $c['plux_transaccion'], $c['jugador_email']]), ';', '"', '');
    }
    fclose($o);
    exit;
}
