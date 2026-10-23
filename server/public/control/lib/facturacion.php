<?php
declare(strict_types=1);

// Pestaña "Facturación" (SRI): facturas y notas de crédito que el ERP del dueño debe autorizar (server/src/Facturacion.php,
// docs/FACTURACION_SRI.md). Pendientes / en proceso / autorizadas / fallidas, reintentar, marcar "no aplica", reenviar el
// aviso al ERP y exportar CSV. Insignia = atrasadas (más de 1 hora sin autorizar) + fallidas.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Auditoria, Config, Control, Db, Facturacion, Fallo};

const CC_FACT_ESTADOS = ['activas' => 'Por autorizar (pendientes, en proceso y fallidas)', 'pendiente' => 'Pendientes', 'en_proceso' => 'En proceso',
    'autorizada' => 'Autorizadas', 'fallida' => 'Fallidas', 'no_aplica' => 'No aplica', 'atrasadas' => 'Atrasadas (más de 1 hora)', 'todas' => 'Todas'];

function cc_fact_lista(): bool { return class_exists(Facturacion::class) && Control::tabla('facturas'); }

function cc_facturacion_insignia(): int
{
    if (!cc_fact_lista()) return 0;
    $r = Facturacion::resumen();
    return $r['atrasadas'] + $r['fallida'];
}

function cc_fact_filtros(): array
{
    $f = ['estado' => cc_get('estado') ?: 'activas', 'tipo' => cc_get('tipo'), 'canal' => cc_get('canal'), 'desde' => cc_get('desde'), 'hasta' => cc_get('hasta'), 'q' => cc_get('q')];
    if (!isset(CC_FACT_ESTADOS[$f['estado']])) $f['estado'] = 'activas';
    if (!in_array($f['tipo'], ['factura', 'nota_credito'], true)) $f['tipo'] = '';
    if (!in_array($f['canal'], ['web_plux', 'web_paypal', 'google_play'], true)) $f['canal'] = '';
    foreach (['desde', 'hasta'] as $k) if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f[$k]) || strtotime($f[$k]) === false) $f[$k] = '';
    return $f;
}

function cc_fact_consulta(array $f, int $limite): array
{
    $w = []; $p = [];
    $ahora = Facturacion::ahora();
    match ($f['estado']) {
        'todas' => null,
        'activas' => $w[] = "f.estado IN ('pendiente', 'en_proceso', 'fallida')",
        'atrasadas' => (function () use (&$w, &$p, $ahora): void { $w[] = "f.estado IN ('pendiente', 'en_proceso') AND f.creado < ?"; $p[] = $ahora - Facturacion::ATRASO_SEG; })(),
        default => (function () use (&$w, &$p, $f): void { $w[] = 'f.estado = ?'; $p[] = $f['estado']; })(),
    };
    if ($f['tipo'] !== '') { $w[] = 'f.tipo = ?'; $p[] = $f['tipo']; }
    if ($f['canal'] !== '') { $w[] = 'f.canal = ?'; $p[] = $f['canal']; }
    if ($f['desde'] !== '') { $w[] = 'f.fecha_venta >= ?'; $p[] = strtotime($f['desde'] . ' 00:00:00'); }
    if ($f['hasta'] !== '') { $w[] = 'f.fecha_venta < ?'; $p[] = strtotime($f['hasta'] . ' 00:00:00 +1 day'); }
    if ($f['q'] !== '') {
        $l = '%' . addcslashes($f['q'], '%_\\') . '%';
        $w[] = "(f.comprador_identificacion LIKE ? ESCAPE '\\' OR f.comprador_razon_social LIKE ? ESCAPE '\\' OR f.comprador_email LIKE ? ESCAPE '\\' OR f.clave_acceso = ? OR f.compra_id = ? OR f.id = ?)";
        $n = ctype_digit($f['q']) ? (int) $f['q'] : -1;
        $ref = preg_match('/^EV[FN]-0*(\d+)$/i', $f['q'], $m) ? (int) $m[1] : $n;
        array_push($p, $l, $l, $l, $f['q'], $n, $ref);
    }
    return Db::todas('SELECT f.* FROM facturas f' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY f.id DESC' . ($limite > 0 ? ' LIMIT ' . $limite : ''), $p);
}

function cc_fact_chip(string $e): string
{
    return cc_chip(['pendiente' => 'pendiente', 'en_proceso' => 'en proceso', 'autorizada' => 'autorizada', 'fallida' => 'fallida', 'no_aplica' => 'no aplica'][$e] ?? $e,
        ['autorizada' => 'ok', 'pendiente' => 'aviso', 'en_proceso' => 'aviso', 'fallida' => 'mal'][$e] ?? '');
}

function cc_t_facturacion(): string
{
    if (!cc_fact_lista()) return '<h1>Facturación SRI</h1>' . cc_no_disponible('Facturación', 'Falta server/src/Facturacion.php o la tabla facturas (migraciones/facturacion.sql).');
    if (cc_get('csv') === '1') cc_facturacion_csv();
    $id = cc_get_int('id');
    if ($id > 0) return cc_fact_detalle($id);
    $r = Facturacion::resumen();
    $ahora = Facturacion::ahora();
    $h = '<h1>Facturación SRI</h1>';
    // Estado de la conexión con el ERP
    $clave = Facturacion::claveLista();
    $hook = Facturacion::webhookUrl();
    $ips = trim(Config::get('FACTURACION_IPS'));
    $h .= '<section class="panel" id="fact-config"><h2>Conexión con el ERP</h2><ul class="lista">'
        . '<li>Clave compartida (FACTURACION_CLAVE): ' . ($clave ? cc_chip('configurada', 'ok') : cc_chip('falta (32 caracteres o más)', 'mal')) . '</li>'
        . '<li>IPs permitidas (FACTURACION_IPS): ' . ($ips !== '' ? e($ips) : '<span class="tenue">cualquiera (con firma válida)</span>') . '</li>'
        . '<li>Aviso al ERP (FACTURACION_WEBHOOK_URL): ' . ($hook !== '' ? e((string) parse_url($hook, PHP_URL_SCHEME) . '://' . parse_url($hook, PHP_URL_HOST)) . '/…' : '<span class="tenue">no (el ERP consulta /api/facturacion/pendientes)</span>') . '</li>'
        . '<li>Último contacto del ERP: ' . ($r['ultimo_erp'] !== null ? e(cc_fecha($r['ultimo_erp'])) . ' <span class="tenue">(hace ' . e(cc_fact_hace($ahora - $r['ultimo_erp'])) . ')</span>' : cc_chip('nunca', 'aviso')) . '</li>'
        . (Facturacion::activa() ? '' : '<li>' . cc_chip('FACTURACION_ACTIVA=0: no se crean comprobantes nuevos', 'mal') . '</li>')
        . '</ul><p class="tenue">Contrato para el programador del ERP: docs/FACTURACION_SRI.md.</p></section>';
    if ($r['atrasadas'] > 0 || $r['fallida'] > 0) {
        $h .= '<div class="aviso aviso-error" id="fact-alerta" role="alert">El SRI exige autorizar cada comprobante de inmediato: hay <b>' . (int) $r['atrasadas']
            . '</b> con más de 1 hora sin autorizar y <b>' . (int) $r['fallida'] . '</b> fallido(s). Revisa que el ERP esté encendido y conectado.</div>';
    }
    $h .= '<div class="kpis" id="fact-kpis">' . cc_tarjeta('Pendientes', cc_num($r['pendiente']), $r['notas_esperando_factura'] > 0 ? $r['notas_esperando_factura'] . ' nota(s) esperan su factura' : '', 'kpi-fact-pendientes')
        . cc_tarjeta('En proceso', cc_num($r['en_proceso']), '', 'kpi-fact-proceso')
        . cc_tarjeta('Atrasadas (+1 h)', cc_num($r['atrasadas']), $r['mas_antigua'] !== null ? 'la más antigua hace ' . cc_fact_hace($ahora - (int) $r['mas_antigua']) : '', 'kpi-fact-atrasadas')
        . cc_tarjeta('Fallidas', cc_num($r['fallida']), '', 'kpi-fact-fallidas')
        . cc_tarjeta('Autorizadas hoy', cc_num($r['autorizadas_hoy']), cc_num($r['autorizada']) . ' en total', 'kpi-fact-autorizadas') . '</div>';
    $f = cc_fact_filtros();
    $h .= '<form method="get" action="' . CC_RUTA . '" class="filtros-form"><input type="hidden" name="t" value="facturacion">'
        . '<label>Estado<select name="estado">' . cc_opciones(CC_FACT_ESTADOS, $f['estado']) . '</select></label>'
        . '<label>Tipo<select name="tipo">' . cc_opciones(['' => 'Facturas y notas de crédito', 'factura' => 'Facturas', 'nota_credito' => 'Notas de crédito'], $f['tipo']) . '</select></label>'
        . '<label>Canal<select name="canal">' . cc_opciones(['' => 'Todos', 'web_plux' => 'Web (Plux)', 'web_paypal' => 'Web (PayPal)', 'google_play' => 'Google Play'], $f['canal']) . '</select></label>'
        . '<label>Desde<input type="date" name="desde" value="' . e($f['desde']) . '"></label>'
        . '<label>Hasta<input type="date" name="hasta" value="' . e($f['hasta']) . '"></label>'
        . '<label class="ancho">Buscar<input type="search" name="q" value="' . e($f['q']) . '" placeholder="EVF-000123, N° de compra, cédula/RUC, nombre, correo, clave de acceso"></label>'
        . '<div class="botones"><button class="btn" type="submit">Filtrar</button><a class="btn btn-sec" id="fact-csv" href="' . e(cc_url(['t' => 'facturacion', 'csv' => '1'] + $f)) . '">Exportar CSV</a></div></form>';
    $h .= '<div class="botones" id="fact-acciones">'
        . ($r['fallida'] > 0 ? cc_boton('facturacion_reintentar_fallidas', [], 'Reintentar todas las fallidas (' . $r['fallida'] . ')', 'btn', '¿Volver a pedir al ERP las ' . $r['fallida'] . ' fallidas?') : '')
        . ($hook !== '' ? cc_boton('facturacion_empujar', [], 'Reenviar avisos al ERP ahora', 'btn btn-sec') : '') . '</div>';
    $filas = [];
    foreach (cc_fact_consulta($f, 300) as $x) {
        $acc = '';
        if (in_array($x['estado'], ['fallida', 'no_aplica', 'pendiente'], true) && ($x['estado'] !== 'pendiente' || (int) $x['proximo_intento'] > $ahora || $x['webhook_estado'] === 'agotado')) {
            $acc .= cc_boton('facturacion_reintentar', ['id' => $x['id']], 'Reintentar', 'btn btn-chico', '¿Volver a pedir al ERP ' . Facturacion::referencia($x) . '?');
        }
        if (in_array($x['estado'], ['pendiente', 'en_proceso', 'fallida'], true)) {
            $acc .= cc_form('facturacion_no_aplica', ['id' => $x['id']], 'en-linea', '¿Marcar ' . Facturacion::referencia($x) . ' como «no aplica»? El ERP ya no la emitirá.')
                . '<input name="motivo" maxlength="200" placeholder="Motivo" required><button type="submit" class="btn btn-chico btn-sec">No aplica</button></form>';
        }
        $filas[] = [
            '<a href="' . e(cc_url(['t' => 'facturacion', 'id' => $x['id']])) . '">' . e(Facturacion::referencia($x)) . '</a>',
            e($x['tipo'] === 'nota_credito' ? 'Nota de crédito' : 'Factura'),
            '<a href="' . e(cc_url(['t' => 'compras', 'id' => $x['compra_id']])) . '">N° ' . (int) $x['compra_id'] . '</a>',
            e(cc_fecha($x['fecha_venta'])),
            e($x['comprador_identificacion']) . '<br><span class="tenue">' . e($x['comprador_razon_social']) . '</span>',
            e(cc_dinero($x['total'])),
            e(['google_play' => 'Google Play', 'web_paypal' => 'Web (PayPal)'][$x['canal']] ?? 'Web (Plux)'),
            cc_fact_chip((string) $x['estado']) . ($x['advertencia'] ? ' ' . cc_chip('revisar', 'aviso') : ''),
            ((int) $x['intentos'] > 0 ? (int) $x['intentos'] . ' error(es)' : '') . ($x['ultimo_error'] ? '<br><span class="tenue">' . e(mb_substr((string) $x['ultimo_error'], 0, 120)) . '</span>' : ''),
            $x['clave_acceso'] ? '<code title="' . e($x['clave_acceso']) . '">…' . e(substr((string) $x['clave_acceso'], -12)) . '</code>' : '<span class="tenue">—</span>',
            $acc,
        ];
    }
    $h .= cc_tabla(['Comprobante', 'Tipo', 'Compra', 'Fecha', 'Comprador', 'Total', 'Canal', 'Estado', 'Errores', 'Clave de acceso', 'Acciones'], $filas, 'No hay comprobantes con este filtro.', 'tabla-facturas');
    return $h;
}

function cc_fact_hace(int $s): string
{
    if ($s < 3600) return max(1, intdiv($s, 60)) . ' min';
    if ($s < 86400) return intdiv($s, 3600) . ' h';
    return intdiv($s, 86400) . ' día(s)';
}

function cc_fact_detalle(int $id): string
{
    $x = Facturacion::porId($id);
    if (!$x) return '<h1>Comprobante</h1><div class="vacio">No existe el comprobante ' . $id . '.</div>';
    $j = Facturacion::json($x);
    $h = '<p><a href="' . e(cc_url(['t' => 'facturacion'])) . '">← Facturación</a></p><h1>' . e($j['referencia']) . ' · ' . e($x['tipo'] === 'nota_credito' ? 'Nota de crédito' : 'Factura') . ' ' . cc_fact_chip((string) $x['estado']) . '</h1>';
    if ($x['advertencia']) $h .= '<div class="aviso aviso-error">' . e($x['advertencia']) . '</div>';
    $h .= '<section class="panel"><h2>Lo que recibe el ERP</h2><pre class="json" id="fact-json">' . e((string) json_encode($j, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . '</pre></section>';
    $ev = [];
    foreach (Db::todas('SELECT * FROM facturacion_eventos WHERE factura_id = ? ORDER BY id DESC LIMIT 100', [$id]) as $v) $ev[] = [e(cc_fecha($v['creado'])), e($v['evento']), e($v['quien']), e((string) $v['detalle'])];
    $h .= '<section class="panel"><h2>Historial</h2>' . cc_tabla(['Fecha', 'Evento', 'Quién', 'Detalle'], $ev, 'Sin eventos.', 'fact-historial')
        . '<p class="tenue">Aviso al ERP: ' . e((string) $x['webhook_estado']) . ((int) $x['webhook_intentos'] > 0 ? ' · ' . (int) $x['webhook_intentos'] . ' intento(s)' : '') . ($x['webhook_error'] ? ' · ' . e((string) $x['webhook_error']) : '') . '</p></section>';
    if ($x['estado'] !== 'autorizada') $h .= '<div class="botones">' . cc_boton('facturacion_reintentar', ['id' => $id], 'Reintentar', 'btn', '¿Volver a pedir al ERP ' . $j['referencia'] . '?') . '</div>';
    return $h;
}

/** POST de la pestaña. Cada acción queda en la auditoría. */
function cc_a_facturacion(string $accion, string $q): string
{
    if (!cc_fact_lista()) throw new Fallo('La facturación no está instalada.', 400);
    switch ($accion) {
        case 'facturacion_reintentar':
            $id = cc_post_int('id');
            if (!Facturacion::reintentar($id, $q)) throw new Fallo('Ese comprobante no se puede reintentar (no existe o ya está autorizado).', 400);
            Auditoria::anotar($q, 'facturacion_reintentar', 'Comprobante ' . $id . ' vuelve a pendiente', null, (int) (Facturacion::porId($id)['compra_id'] ?? 0) ?: null);
            return 'Listo: el ERP lo vuelve a recibir como pendiente.';
        case 'facturacion_reintentar_fallidas':
            $n = 0;
            foreach (Db::todas("SELECT id FROM facturas WHERE estado = 'fallida' ORDER BY id LIMIT 500") as $f) if (Facturacion::reintentar((int) $f['id'], $q)) $n++;
            Auditoria::anotar($q, 'facturacion_reintentar', $n . ' fallidas vuelven a pendiente');
            return $n . ' comprobante(s) vuelven a pendiente.';
        case 'facturacion_no_aplica':
            $id = cc_post_int('id');
            $motivo = mb_substr(cc_post('motivo'), 0, 200);
            if ($motivo === '') throw new Fallo('Escribe el motivo.', 400);
            if (!Facturacion::marcarNoAplica($id, $motivo, $q)) throw new Fallo('Ese comprobante no se puede marcar (no existe, ya está autorizado o ya no aplica).', 400);
            Auditoria::anotar($q, 'facturacion_no_aplica', 'Comprobante ' . $id . ': ' . $motivo, null, (int) (Facturacion::porId($id)['compra_id'] ?? 0) ?: null);
            return 'Marcado como «no aplica».';
        case 'facturacion_empujar':
            [$ok, $mal] = Facturacion::empujarPendientes(100);
            Auditoria::anotar($q, 'facturacion_empujar', "Avisos al ERP: $ok entregados, $mal fallidos");
            return "Avisos al ERP: $ok entregado(s), $mal sin entregar.";
    }
    throw new Fallo('Acción desconocida.', 400);
}

function cc_facturacion_csv(): never
{
    $f = cc_fact_filtros();
    Auditoria::anotar(cc_quien(), 'control_csv_facturacion', 'CSV de facturación: ' . json_encode(array_filter($f), JSON_UNESCAPED_UNICODE));
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="facturacion-sri-' . $f['estado'] . '-' . date('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $o = fopen('php://output', 'w');
    fwrite($o, "\xEF\xBB\xBF");
    fputcsv($o, ['Comprobante', 'Tipo', 'Estado', 'N° compra', 'Fecha venta', 'Canal', 'Tipo identificación', 'Identificación', 'Razón social', 'Correo', 'Teléfono', 'Dirección',
        'Producto', 'Subtotal', 'IVA', 'Total', 'N° autorización', 'Clave de acceso', 'N° comprobante SRI', 'Autorizada en', 'Factura modificada', 'Motivo', 'Errores', 'Último error', 'Advertencia'], ';', '"', '');
    foreach (cc_fact_consulta($f, 0) as $x) {
        $it = json_decode((string) $x['items_json'], true);
        $mod = $x['factura_id'] !== null ? Facturacion::referencia(['tipo' => 'factura', 'id' => $x['factura_id']]) : '';
        fputcsv($o, array_map('cc_csv_seguro', [Facturacion::referencia($x), $x['tipo'], $x['estado'], $x['compra_id'], date('Y-m-d H:i', (int) $x['fecha_venta']), $x['canal'],
            Facturacion::TIPOS_ID[$x['comprador_tipo_id']] ?? $x['comprador_tipo_id'], $x['comprador_identificacion'], $x['comprador_razon_social'], $x['comprador_email'],
            $x['comprador_telefono'], $x['comprador_direccion'], $it[0]['descripcion'] ?? '', number_format((float) $x['subtotal'], 2, '.', ''), number_format((float) $x['iva'], 2, '.', ''),
            number_format((float) $x['total'], 2, '.', ''), $x['numero_autorizacion'], $x['clave_acceso'], $x['numero_comprobante'],
            $x['autorizada_en'] ? date('Y-m-d H:i', (int) $x['autorizada_en']) : '', $mod, $x['motivo'], $x['intentos'], $x['ultimo_error'], $x['advertencia']]), ';', '"', '');
    }
    fclose($o);
    exit;
}
