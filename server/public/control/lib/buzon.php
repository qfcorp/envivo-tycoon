<?php
declare(strict_types=1);

// Pestaña "Buzón y códigos" del Centro de Control (server/INTEGRAR_BUZON.md): mensajes a todos / un servidor / un
// universo / filtros o a una lista (compensaciones) con VISTA PREVIA y confirmación, envíos recientes (retirar),
// códigos de regalo (uno o un lote de códigos únicos para influencers, con CSV) y estadísticas por etiqueta.
// Todo por POST con CSRF y auditoría (Buzon.php anota cada difusión, código y lote).
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Buzon, Catalogo, CatalogoJuego, Db, Fallo, Migraciones};

/** Filas de premios del formulario (adj_tipo[], adj_item[], adj_cant[]) -> lista de adjuntos (sin revisar). */
function cc_buzon_adjuntos_post(): array
{
    $tipos = $_POST['adj_tipo'] ?? []; $items = $_POST['adj_item'] ?? []; $cants = $_POST['adj_cant'] ?? [];
    if (!is_array($tipos) || !is_array($items) || !is_array($cants)) return [];
    $o = [];
    foreach (array_slice(array_values($tipos), 0, 10) as $i => $t) {
        $t = is_string($t) ? trim($t) : '';
        if ($t === '') continue;
        $it = is_string($items[$i] ?? null) ? trim($items[$i]) : '';
        $c = is_string($cants[$i] ?? null) ? trim($cants[$i]) : '';
        $o[] = ['tipo' => $t, 'item' => $it === '' ? '-' : $it, 'cantidad' => $c === '' ? 1 : $c];
    }
    return $o;
}

const CC_BUZON_TIPOS_ADJ = ['' => '— sin premio —', 'creditos' => 'Créditos', 'dinero' => 'Dinero del juego', 'consumible' => 'Repuestos (cable / battery)',
    'item' => 'Equipo (al inventario)', 'refuerzo' => 'Refuerzo', 'personal' => 'Personal (cantidad = habilidad)', 'reparar_todo' => 'Reparar todos los equipos'];

/** Filas de premios del formulario (con lo que ya tenían, si se edita un borrador). */
function cc_buzon_campos_adjuntos(array $actuales = [], int $filas = 4): string
{
    $h = '<fieldset class="form-producto"><legend>Premios (opcional; se entregan al tocar «Reclamar»)</legend>';
    for ($i = 0; $i < $filas; $i++) {
        $a = $actuales[$i] ?? ['tipo' => '', 'item' => '', 'cantidad' => ''];
        $h .= '<label>Premio ' . ($i + 1) . '<select name="adj_tipo[]">' . cc_opciones(CC_BUZON_TIPOS_ADJ, (string) $a['tipo']) . '</select></label>'
            . '<label>Cuál (repuesto, equipo, refuerzo o puesto)<input name="adj_item[]" list="buzon-items" maxlength="60" value="' . e($a['item'] === '-' ? '' : (string) $a['item']) . '" placeholder="vacío en créditos y dinero"></label>'
            . '<label>Cantidad<input name="adj_cant[]" inputmode="numeric" maxlength="9" value="' . e((string) $a['cantidad']) . '" placeholder="1"></label>';
    }
    return $h . '</fieldset>';
}

function cc_buzon_datalist(): string
{
    $o = [];
    foreach (Buzon::CONSUMIBLES as $k => $n) $o[$k] = 'Repuesto: ' . $n;
    foreach (Catalogo::EQUIPOS as $k => $n) $o[$k] = 'Equipo: ' . $n;
    foreach (Catalogo::PREMIUM as $k => $p) if (($p['entrega']['tipo'] ?? '') === 'refuerzo') $o[$k] = 'Refuerzo: ' . $p['nombre'];
    foreach (CatalogoJuego::ROLES as $r) $o[$r] = 'Puesto: ' . $r;
    $h = '<datalist id="buzon-items">';
    foreach ($o as $k => $n) $h .= '<option value="' . e($k) . '">' . e($n) . '</option>';
    return $h . '</datalist>';
}

/** Mensaje como se ve en el juego (vista previa). */
function cc_buzon_tarjeta(array $d): string
{
    $adj = $d['adjuntos'] ? '<ul class="lista">' . implode('', array_map(fn($a) => '<li>' . e(Buzon::nombreAdjunto($a)) . '</li>', $d['adjuntos'])) . '</ul>' : '<p class="tenue">Sin premios: solo aviso.</p>';
    return '<div class="burbuja" id="buzon-vista"><p class="tenue">De: <b>' . e($d['remitente']) . '</b> · ' . e(Buzon::TIPOS[$d['tipo']] ?? $d['tipo']) . '</p>'
        . '<h3>' . e($d['titulo']) . '</h3><p class="burbuja-txt">' . nl2br(e($d['cuerpo'])) . '</p>' . $adj . '</div>';
}

function cc_t_buzon(): string
{
    Buzon::preparar();
    if (cc_get('csv') === 'lote') cc_buzon_csv(cc_get('lote'));
    $tot = Buzon::totales();
    $h = '<h1>Buzón y códigos</h1><p class="tenue">Mensajes al buzón del juego (avisos, compensaciones, eventos) y códigos de regalo. Los premios llegan al buzón y el jugador los reclama. '
       . 'Créditos regalados: nunca se cambian por dinero. Cada envío y cada código queda en la auditoría.</p>';
    $h .= '<div class="kpis">' . cc_tarjeta('Envíos', cc_num($tot['envios']), '', 'kpi-envios') . cc_tarjeta('Regalos sin reclamar', cc_num($tot['por_reclamar']), 'en buzones', 'kpi-por-reclamar')
        . cc_tarjeta('Códigos activos', cc_num($tot['codigos_activos']), '', 'kpi-codigos') . cc_tarjeta('Canjes (7 días)', cc_num($tot['canjes_7d']), '', 'kpi-canjes')
        . cc_tarjeta('Créditos reclamados (7 días)', cc_num($tot['creditos_7d']), 'motivo buzon', 'kpi-creditos') . '</div>';
    $h .= cc_buzon_datalist();

    // ---------------------------------------------------------------- vista previa de un borrador
    $bid = cc_get_int('borrador');
    $previo = [];
    if ($bid > 0) {
        $b = Db::fila('SELECT * FROM buzon_borradores WHERE id = ?', [$bid]);
        $d = $b ? json_decode((string) $b['datos_json'], true) : null;
        if (!$b || !is_array($d)) $h .= '<div class="aviso aviso-error">Ese borrador no existe.</div>';
        elseif ($b['enviado'] !== null) $h .= '<div class="aviso aviso-ok">Ese borrador ya se envió el ' . e(cc_fecha($b['enviado'])) . '.</div>';
        else {
            $previo = $d;
            try {
                $p = Buzon::prepararDifusion($d);
                $n = Buzon::contarDestinatarios($p['filtro']);
                $cred = array_sum(array_map(fn($a) => $a['tipo'] === 'creditos' ? (int) $a['cantidad'] : 0, $p['adjuntos']));
                $h .= '<section class="panel" id="panel-previa"><h2>Vista previa · borrador N° ' . $bid . '</h2>' . cc_buzon_tarjeta($p)
                    . '<dl class="datos"><dt>Para</dt><dd>' . e(Buzon::textoFiltro($p['filtro'])) . ($p['nuevos'] ? ' (+ los que entren después, hasta que venza)' : '') . '</dd>'
                    . '<dt>Jugadores que lo reciben ahora</dt><dd><b id="previa-destinatarios">' . cc_num($n) . '</b></dd>'
                    . '<dt>Vence</dt><dd>en ' . (int) $p['dias'] . ' días (' . e(cc_fecha(time() + $p['dias'] * 86400, false)) . ')</dd>'
                    . ($cred > 0 ? '<dt>Créditos en total (si todos reclaman)</dt><dd><b>' . cc_num($cred * $n) . '</b></dd>' : '') . '</dl>'
                    . ($n === 0 ? '<div class="aviso aviso-error">Nadie cumple ese filtro: no se puede enviar.</div>'
                       : cc_form('buzon_enviar', ['borrador_id' => $bid, 'destinatarios' => $n], 'form', '¿Enviar «' . $p['titulo'] . '» a ' . cc_num($n) . ' jugador(es)? No se puede deshacer (solo retirar lo no reclamado).')
                        . '<label class="check"><input type="checkbox" name="confirmar" value="1" required> Revisé el mensaje y quiero enviarlo a ' . cc_num($n) . ' jugador(es)</label>'
                        . '<div class="botones"><button class="btn" type="submit">Enviar ahora</button> <a class="btn btn-sec" href="' . e(cc_url(['t' => 'buzon', 'editar' => $bid])) . '#form-difusion">Cambiar</a></div></form>')
                    . '</section>';
            } catch (Fallo $e) {
                $h .= '<div class="aviso aviso-error">' . e($e->getMessage()) . '</div>';
            }
        }
    }
    $eid = cc_get_int('editar');
    if ($eid > 0 && !$previo) {
        $b = Db::fila('SELECT datos_json FROM buzon_borradores WHERE id = ? AND enviado IS NULL', [$eid]);
        $previo = $b ? (json_decode((string) $b['datos_json'], true) ?: []) : [];
    }

    // ---------------------------------------------------------------- redactar
    $v = fn(string $k, string $def = '') => e((string) ($previo[$k] ?? $def));
    $f = is_array($previo['filtro'] ?? null) ? $previo['filtro'] : [];
    $fv = fn(string $k) => e(is_array($f[$k] ?? null) ? implode("\n", $f[$k]) : (string) ($f[$k] ?? ''));
    $servidores = [];
    foreach (Db::todas('SELECT id, nombre FROM servidores ORDER BY id') as $s) $servidores[(string) $s['id']] = $s['nombre'];
    $universos = [];
    if (Migraciones::columnas('universos') !== null) foreach (Db::todas('SELECT id, nombre FROM universos ORDER BY id') as $u) $universos[(string) $u['id']] = $u['nombre'];
    $tipos = Buzon::TIPOS; unset($tipos['codigo']);
    $h .= '<section class="panel" id="form-difusion"><h2>Enviar un mensaje</h2><p class="tenue">Primero se ve la vista previa con cuántos jugadores lo reciben; recién ahí se envía.</p>'
        . cc_form('buzon_previa', [], 'form')
        . '<div class="dos"><label>Tipo<select name="tipo">' . cc_opciones($tipos, (string) ($previo['tipo'] ?? 'aviso')) . '</select></label>'
        . '<label>Remitente<input name="remitente" maxlength="60" value="' . $v('remitente', Buzon::REMITENTE) . '"></label></div>'
        . '<label>Título<input name="titulo" maxlength="' . Buzon::MAX_TITULO . '" required value="' . $v('titulo') . '" placeholder="Ej.: Perdón por la caída del servidor"></label>'
        . '<label>Texto<textarea name="cuerpo" rows="4" maxlength="' . Buzon::MAX_CUERPO . '" placeholder="Corto y claro. Se ve tal cual (sin HTML).">' . $v('cuerpo') . '</textarea></label>'
        . cc_buzon_campos_adjuntos(is_array($previo['adjuntos'] ?? null) ? $previo['adjuntos'] : [])
        . '<fieldset class="form-producto"><legend>¿A quién?</legend>'
        . '<label>Alcance<select name="alcance">' . cc_opciones(Buzon::ALCANCES, (string) ($f['alcance'] ?? 'todos')) . '</select></label>'
        . '<label>Servidor (si el alcance es «Un servidor»)<select name="servidor_id">' . cc_opciones(['' => '—'] + $servidores, (string) ($f['servidor_id'] ?? '')) . '</select></label>'
        . '<label>Universo (si es «Un universo»)<select name="universo_id">' . cc_opciones(['' => '—'] + $universos, (string) ($f['universo_id'] ?? '')) . '</select></label>'
        . '<label>Registrados desde<input type="date" name="desde" value="' . e(isset($f['desde']) && is_int($f['desde']) ? date('Y-m-d', $f['desde']) : (string) ($f['desde'] ?? '')) . '"></label>'
        . '<label>Registrados hasta<input type="date" name="hasta" value="' . e(isset($f['hasta']) && is_int($f['hasta']) ? date('Y-m-d', $f['hasta'] - 86400) : (string) ($f['hasta'] ?? '')) . '"></label>'
        . '<label>Activos en los últimos N días (vacío = todos)<input name="activos_dias" inputmode="numeric" maxlength="3" value="' . $fv('activos_dias') . '"></label>'
        . '<label class="check"><input type="checkbox" name="compradores" value="1"' . (!empty($f['compradores']) ? ' checked' : '') . '> Solo quienes compraron alguna vez</label>'
        . '<label class="check"><input type="checkbox" name="vip" value="1"' . (!empty($f['vip']) ? ' checked' : '') . '> Solo con VIP activo</label>'
        . '<label class="check"><input type="checkbox" name="nuevos" value="1"' . (!empty($previo['nuevos']) ? ' checked' : '') . '> También a los que entren después (hasta que venza)</label>'
        . '</fieldset>'
        . '<label>Lista de jugadores (si el alcance es «Lista»): ids o correos, uno por línea o separados por coma<textarea name="lista" rows="3" placeholder="12, 45, ana@correo.com">' . $fv('lista') . '</textarea></label>'
        . '<label>Vence en (días)<input name="dias" inputmode="numeric" maxlength="3" value="' . $v('dias', (string) Buzon::DIAS_VENCE) . '"></label>'
        . '<div class="botones"><button class="btn" type="submit">Ver vista previa</button></div></form></section>';

    // ---------------------------------------------------------------- envíos recientes
    $env = Db::todas("SELECT e.*, (SELECT COUNT(*) FROM buzon b WHERE b.envio_id = e.id AND b.estado <> 'sin_leer') AS leidos,
                             (SELECT COUNT(*) FROM buzon b WHERE b.envio_id = e.id AND b.estado = 'reclamado') AS reclamados FROM buzon_envios e ORDER BY e.id DESC LIMIT 30");
    $h .= '<section class="panel" id="panel-envios"><h2>Envíos recientes</h2>' . cc_tabla(['N°', 'Fecha', 'Tipo', 'Título', 'Para', 'Premios', 'Recibieron', 'Leídos', 'Reclamados', 'Vence', ''],
        array_map(function ($x) {
            $f = json_decode((string) $x['filtro_json'], true) ?: [];
            $adj = json_decode((string) $x['adjuntos_json'], true) ?: [];
            return [(int) $x['id'], e(cc_fecha($x['creado'])), e(Buzon::TIPOS[$x['tipo']] ?? $x['tipo']), '<span class="largo">' . e($x['titulo']) . '</span>',
                '<span class="largo">' . e(Buzon::textoFiltro($f)) . ((int) $x['nuevos'] ? ' (+ nuevos)' : '') . '</span>', '<span class="largo">' . e(Buzon::textoAdjuntos($adj)) . '</span>',
                cc_num($x['destinatarios']), cc_num($x['leidos']), cc_num($x['reclamados']), e(cc_fecha($x['expira'], false)),
                $x['estado'] === 'retirado' ? cc_chip('retirado', 'mal') : cc_boton('buzon_retirar', ['envio_id' => $x['id']], 'Retirar', 'btn btn-chico btn-sec', '¿Retirar este envío? Desaparece de los buzones donde todavía no se reclamó.')];
        }, $env), 'Todavía no se envió nada.', 'tabla-envios') . '</section>';

    // ---------------------------------------------------------------- códigos
    $lote = cc_get('lote');
    if ($lote !== '' && preg_match('/^[0-9a-z\-]{1,40}$/', $lote)) {
        $cods = Db::todas('SELECT codigo, usos, usos_max, activo FROM buzon_codigos WHERE lote = ? ORDER BY id', [$lote]);
        $h .= '<section class="panel" id="panel-lote"><h2>Lote ' . e($lote) . ' · ' . count($cods) . ' códigos</h2>'
            . '<p><a class="btn" id="lote-csv" href="' . e(cc_url(['t' => 'buzon', 'csv' => 'lote', 'lote' => $lote])) . '">Descargar CSV</a></p>'
            . '<p class="largo" id="lote-codigos">' . implode(' · ', array_map(fn($c) => '<code>' . e($c['codigo']) . '</code>' . ((int) $c['usos'] >= max(1, (int) $c['usos_max']) && (int) $c['usos_max'] > 0 ? ' ✓' : ''), $cods)) . '</p></section>';
    }
    $campos = fn(string $etq) => '<label>Título del mensaje que llega al buzón<input name="titulo" maxlength="' . Buzon::MAX_TITULO . '" placeholder="Regalo de código"></label>'
        . '<label>Texto (opcional)<textarea name="mensaje" rows="2" maxlength="' . Buzon::MAX_CUERPO . '"></textarea></label>'
        . cc_buzon_campos_adjuntos([], 3)
        . '<div class="dos"><label>Válido desde (vacío = ya)<input type="date" name="desde"></label><label>Válido hasta (vacío = sin fin)<input type="date" name="hasta"></label></div>'
        . '<label>Etiqueta (influencer o campaña, para las estadísticas)<input name="etiqueta" maxlength="40" value="' . e($etq) . '" placeholder="ej. dimitry_tv"></label>';
    $h .= '<section class="panel" id="panel-codigos"><h2>Códigos de regalo</h2><p class="tenue">Siempre uno por cuenta. Se canjean en el juego (Tienda → Cuenta → «Canjear código», o en el buzón) y en '
        . '<code>/canjear.html</code> entrando con la misma cuenta. Cada cuenta tiene un límite de ' . Buzon::FALLOS_CUENTA . ' códigos equivocados cada 10 minutos.</p><div class="dos">'
        . cc_form('buzon_codigo_crear', [], 'form') . '<h3>Un código</h3>'
        . '<label>Código (vacío = uno al azar; sin espacios ni tildes)<input name="codigo" maxlength="32" autocapitalize="characters" placeholder="BIENVENIDO2026"></label>'
        . '<label>Usos máximos en total (0 = sin límite)<input name="usos_max" inputmode="numeric" maxlength="7" value="0"></label>'
        . $campos('') . '<div class="botones"><button class="btn" type="submit">Crear código</button></div></form>'
        . cc_form('buzon_codigo_lote', [], 'form', '¿Generar estos códigos?') . '<h3>Lote de códigos únicos (influencers)</h3>'
        . '<div class="dos"><label>Prefijo (hasta 12)<input name="prefijo" maxlength="12" autocapitalize="characters" placeholder="DIMI"></label>'
        . '<label>Cantidad (1 a 1.000)<input name="cantidad" inputmode="numeric" maxlength="4" value="50" required></label></div>'
        . '<label>Usos de cada código<input name="usos_max" inputmode="numeric" maxlength="7" value="1"></label>'
        . '<p class="tenue">Una cuenta solo puede canjear UN código del lote.</p>'
        . $campos('') . '<div class="botones"><button class="btn" type="submit">Generar lote</button></div></form></div>';

    $etq = cc_get('etiqueta');
    $params = []; $where = '';
    if ($etq !== '') { $where = 'WHERE etiqueta = ?'; $params[] = mb_strtolower($etq); }
    $cods = Db::todas("SELECT * FROM buzon_codigos $where ORDER BY id DESC LIMIT 100", $params);
    $h .= '<form method="get" action="' . CC_RUTA . '" class="filtros-form"><input type="hidden" name="t" value="buzon"><label class="ancho">Filtrar por etiqueta<input name="etiqueta" value="' . e($etq) . '"></label>'
        . '<div class="botones"><button class="btn btn-sec" type="submit">Filtrar</button></div></form>'
        . cc_tabla(['Código', 'Etiqueta', 'Lote', 'Premios', 'Usos', 'Vigencia', 'Estado', ''], array_map(function ($c) {
            $adj = json_decode((string) $c['adjuntos_json'], true) ?: [];
            $vence = $c['hasta'] !== null && (int) $c['hasta'] <= time();
            $estado = !(int) $c['activo'] ? cc_chip('desactivado', 'mal') : ($vence ? cc_chip('vencido', 'aviso') : ((int) $c['usos_max'] > 0 && (int) $c['usos'] >= (int) $c['usos_max'] ? cc_chip('agotado', 'aviso') : cc_chip('activo', 'ok')));
            $btn = cc_boton('buzon_codigo_activo', ['codigo_id' => $c['id'], 'activo' => (int) $c['activo'] ? 0 : 1], (int) $c['activo'] ? 'Desactivar' : 'Activar', 'btn btn-chico btn-sec')
                . ($c['lote'] !== null && (int) $c['activo'] ? cc_boton('buzon_codigo_activo', ['codigo_id' => $c['id'], 'activo' => 0, 'lote' => 1], 'Desactivar lote', 'btn btn-chico btn-peligro', '¿Desactivar TODOS los códigos del lote ' . $c['lote'] . '?') : '');
            return ['<code>' . e($c['codigo']) . '</code>', e($c['etiqueta'] ?: '—'), $c['lote'] !== null ? '<a href="' . e(cc_url(['t' => 'buzon', 'lote' => $c['lote']])) . '#panel-lote">' . e($c['lote']) . '</a>' : '—',
                '<span class="largo">' . e(Buzon::textoAdjuntos($adj)) . '</span>', cc_num($c['usos']) . ' / ' . ((int) $c['usos_max'] ? cc_num($c['usos_max']) : '∞'),
                e(($c['desde'] !== null ? cc_fecha($c['desde'], false) : 'ya') . ' → ' . ($c['hasta'] !== null ? cc_fecha((int) $c['hasta'] - 86400, false) : 'sin fin')), $estado, $btn];
        }, $cods), 'No hay códigos todavía.', 'tabla-codigos') . '</section>';

    // ---------------------------------------------------------------- estadísticas por etiqueta
    $est = Buzon::estadisticas();
    $h .= '<section class="panel" id="panel-estadisticas"><h2>Programa de influencers: canjes y compras</h2><p class="tenue">Por etiqueta. «Compraron después» = jugadores que pagaron algo con dinero real '
        . 'después de su primer canje de esa etiqueta (compras pagadas, con IVA).</p>'
        . cc_tabla(['Etiqueta', 'Códigos', 'Canjes', 'Jugadores', 'Desde la web', 'Compraron después', 'Compras', 'Ingresos'], array_map(fn($x) => [
            $x['etiqueta'] !== '' ? '<a href="' . e(cc_url(['t' => 'buzon', 'etiqueta' => $x['etiqueta']])) . '#panel-codigos">' . e($x['etiqueta']) . '</a>' : '<span class="tenue">(sin etiqueta)</span>',
            cc_num($x['codigos']), cc_num($x['canjes']), cc_num($x['jugadores']), cc_num($x['web']), cc_num($x['compradores']), cc_num($x['compras']), cc_dinero($x['ingresos'])], $est), 'Todavía no hay canjes.', 'tabla-estadisticas') . '</section>';

    $aud = Db::todas("SELECT * FROM auditoria WHERE accion LIKE 'buzon_%' ORDER BY id DESC LIMIT 20");
    $h .= '<section class="panel"><h2>Últimos cambios</h2>' . cc_tabla(['Fecha', 'Quién', 'Acción', 'Detalle'], array_map(fn($a) => [e(cc_fecha($a['creado'])), e($a['quien']), e($a['accion']),
        '<span class="largo">' . e($a['detalle']) . '</span>'], $aud), 'Sin cambios todavía.', 'tabla-auditoria-buzon') . '</section>';
    return $h;
}

/** CSV de un lote (código, usos, usos máximos, activo, etiqueta). */
function cc_buzon_csv(string $lote): never
{
    $f = Db::todas('SELECT codigo, usos, usos_max, activo, etiqueta FROM buzon_codigos WHERE lote = ? ORDER BY id', [$lote]);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="codigos-' . preg_replace('/[^0-9a-z\-]/', '', $lote) . '.csv"');
    header('Cache-Control: no-store');
    echo "\xEF\xBB\xBFcodigo,usos,usos_max,activo,etiqueta\n";
    foreach ($f as $c) echo $c['codigo'] . ',' . (int) $c['usos'] . ',' . (int) $c['usos_max'] . ',' . (int) $c['activo'] . ',"' . str_replace('"', '""', (string) $c['etiqueta']) . "\"\n";
    exit;
}

function cc_a_buzon(string $accion, string $q): string
{
    Buzon::preparar();
    switch ($accion) {
        case 'buzon_previa':
            $d = ['tipo' => cc_post('tipo'), 'remitente' => cc_post('remitente'), 'titulo' => cc_post('titulo'), 'cuerpo' => (string) ($_POST['cuerpo'] ?? ''),
                  'adjuntos' => cc_buzon_adjuntos_post(), 'nuevos' => cc_post('nuevos') === '1', 'dias' => cc_post('dias') === '' ? Buzon::DIAS_VENCE : cc_post_int('dias'),
                  'filtro' => ['alcance' => cc_post('alcance'), 'servidor_id' => cc_post('servidor_id'), 'universo_id' => cc_post('universo_id'), 'lista' => (string) ($_POST['lista'] ?? ''),
                               'desde' => cc_post('desde'), 'hasta' => cc_post('hasta'), 'activos_dias' => cc_post('activos_dias'), 'compradores' => cc_post('compradores'), 'vip' => cc_post('vip')]];
            // se guarda tal como se escribió (para poder cambiarlo); se revisa aquí y otra vez al enviar
            try { Buzon::prepararDifusion($d); } catch (Fallo $e) {
                Db::q('INSERT INTO buzon_borradores (datos_json, creado, creado_por) VALUES (?, ?, ?)', [json_encode($d, JSON_UNESCAPED_UNICODE), time(), $q]);
                cc_avisar('error', $e->getMessage());
                cc_redirigir(cc_url(['t' => 'buzon', 'editar' => \EnVivo\Db::ultimoId()]) . '#form-difusion');
            }
            Db::q('INSERT INTO buzon_borradores (datos_json, creado, creado_por) VALUES (?, ?, ?)', [json_encode($d, JSON_UNESCAPED_UNICODE), time(), $q]);
            cc_avisar('ok', 'Revisa la vista previa y confirma el envío.');
            cc_redirigir(cc_url(['t' => 'buzon', 'borrador' => Db::ultimoId()]) . '#panel-previa');
        case 'buzon_enviar':
            Fallo::si(cc_post('confirmar') !== '1', 'Marca la casilla de confirmación para enviar.', 400);
            $bid = cc_post_int('borrador_id');
            $msg = Db::tx(function () use ($bid, $q): string {
                $b = Db::fila('SELECT * FROM buzon_borradores WHERE id = ?', [$bid]);
                Fallo::si(!$b, 'Ese borrador no existe.', 404);
                Fallo::si($b['enviado'] !== null, 'Ese mensaje ya se envió (no se manda dos veces).', 409);
                $d = json_decode((string) $b['datos_json'], true) ?: [];
                $p = Buzon::prepararDifusion($d);
                $esperado = cc_post_int('destinatarios');
                $ahora = Buzon::contarDestinatarios($p['filtro']);
                Fallo::si($ahora === 0, 'Nadie cumple ese filtro: no se envió.', 409);
                Fallo::si($esperado > 0 && abs($ahora - $esperado) > max(5, (int) ceil($esperado * 0.05)), 'Cambió mucho la cantidad de jugadores (' . $esperado . ' → ' . $ahora . '): revisa la vista previa otra vez.', 409);
                $r = Buzon::difundir($d, $q);
                Db::q('UPDATE buzon_borradores SET enviado = ? WHERE id = ?', [time(), $bid]);
                return 'Enviado (N° ' . $r['envio_id'] . ') a ' . cc_num($r['destinatarios']) . ' jugador(es).';
            });
            cc_avisar('ok', $msg);
            cc_redirigir(cc_url(['t' => 'buzon']) . '#panel-envios');
        case 'buzon_retirar':
            $n = Buzon::retirarEnvio(cc_post_int('envio_id'), $q);
            return 'Envío retirado: se quitó de ' . cc_num($n) . ' buzón(es) donde no se había reclamado.';
        case 'buzon_codigo_crear':
            $c = Buzon::crearCodigo(['codigo' => cc_post('codigo'), 'titulo' => cc_post('titulo'), 'mensaje' => (string) ($_POST['mensaje'] ?? ''), 'adjuntos' => cc_buzon_adjuntos_post(),
                'usos_max' => cc_post_int('usos_max'), 'desde' => cc_post('desde'), 'hasta' => cc_post('hasta'), 'etiqueta' => cc_post('etiqueta')], $q);
            return 'Código creado: ' . $c['codigo'];
        case 'buzon_codigo_lote':
            $r = Buzon::generarLote(['titulo' => cc_post('titulo'), 'mensaje' => (string) ($_POST['mensaje'] ?? ''), 'adjuntos' => cc_buzon_adjuntos_post(), 'usos_max' => cc_post_int('usos_max') ?: 1,
                'desde' => cc_post('desde'), 'hasta' => cc_post('hasta'), 'etiqueta' => cc_post('etiqueta')], cc_post_int('cantidad'), cc_post('prefijo'), $q);
            cc_avisar('ok', 'Lote ' . $r['lote'] . ': ' . count($r['codigos']) . ' códigos creados.');
            cc_redirigir(cc_url(['t' => 'buzon', 'lote' => $r['lote']]) . '#panel-lote');
        case 'buzon_codigo_activo':
            $n = Buzon::activarCodigo(cc_post_int('codigo_id'), cc_post('activo') === '1', $q, cc_post('lote') === '1');
            return (cc_post('activo') === '1' ? 'Activado' : 'Desactivado') . ' (' . $n . ' código' . ($n === 1 ? '' : 's') . ').';
    }
    throw new Fallo('Acción desconocida.', 400);
}
