<?php
declare(strict_types=1);

// Pestaña "Ajustes": mantenimiento de la tienda y anuncio del sistema (Ajustes, tabla ajustes: los lee /api/estado y
// Compras/Google), Google Play (compras anuladas), seguridad del panel y la auditoría completa (tabla auditoria).
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Ajustes, Config, Control, Db, Fallo, Google, Http, PayPal};

function cc_t_ajustes(): string
{
    $man = Ajustes::mantenimiento();
    $h = '<h1>Ajustes</h1>';
    $h .= '<section class="panel' . ($man ? ' peligro' : '') . '" id="panel-mantenimiento"><h2>Mantenimiento de la tienda ' . cc_chip($man ? 'ENCENDIDO' : 'apagado', $man ? 'mal' : 'ok') . '</h2>'
        . '<p class="tenue">Con el mantenimiento encendido nadie puede comprar con dinero real (órdenes, pagos y Google Play); el juego muestra el mensaje. Todo lo demás sigue funcionando.</p>'
        . cc_form('ajustes_mantenimiento', [], 'form', $man ? '¿Abrir la tienda otra vez?' : null)
        . '<label class="check"><input type="checkbox" name="mantenimiento" value="1"' . ($man ? ' checked' : '') . '> Tienda en mantenimiento (nadie puede comprar)</label>'
        . '<label>Mensaje para los jugadores<textarea name="mensaje" maxlength="300" rows="3" placeholder="' . e(Ajustes::mensajeMantenimiento()) . '">' . e(Ajustes::get('mantenimiento_mensaje')) . '</textarea></label>'
        . '<div class="botones"><button class="btn" type="submit">Guardar</button></div></form></section>';

    $a = Ajustes::anuncio();
    $hasta = Ajustes::get('anuncio_hasta');
    $h .= '<section class="panel" id="panel-anuncio"><h2>Anuncio en el juego</h2><p class="tenue">' . ($a ? 'Ahora se muestra: <b>' . e($a['texto']) . '</b>' . ($a['hasta'] ? ' (hasta ' . e(cc_fecha(strtotime($a['hasta']))) . ')' : '') : 'No hay anuncio visible.') . '</p>'
        . cc_form('ajustes_anuncio', [], 'form')
        . '<label>Texto (vacío = quitar)<textarea name="texto" maxlength="300" rows="3">' . e(Ajustes::get('anuncio_texto')) . '</textarea></label>'
        . '<label>Tipo<select name="tipo">' . cc_opciones(['info' => 'Información', 'aviso' => 'Aviso importante', 'evento' => 'Evento'], Ajustes::get('anuncio_tipo', 'info')) . '</select></label>'
        . '<label>Hasta (opcional)<input type="datetime-local" name="hasta" value="' . e($hasta !== '' ? date('Y-m-d\TH:i', (int) $hasta) : '') . '"></label>'
        . '<div class="botones"><button class="btn" type="submit">Publicar</button></div></form></section>';

    // Reglas contra el abuso de reembolsos (Compras::revisarAbuso)
    $h .= '<section class="panel" id="panel-abuso"><h2>Abuso de reembolsos</h2><p class="tenue">Al revertir una compra la cuenta queda suspendida. Además se <b>banea</b> sola si cumple estas reglas (se puede reactivar en la ficha).</p>'
        . cc_form('ajustes_abuso', [], 'form form-producto')
        . '<label>Banear con este número de reembolsos<input name="reembolsos" inputmode="numeric" required value="' . e(Ajustes::get('abuso_reembolsos', '2')) . '"></label>'
        . '<label>…dentro de estos días<input name="dias" inputmode="numeric" required value="' . e(Ajustes::get('abuso_dias', '180')) . '"></label>'
        . '<label class="check"><input type="checkbox" name="contracargo" value="1"' . (Ajustes::get('abuso_contracargo_banea', '1') === '1' ? ' checked' : '') . '> Un contracargo banea de inmediato</label>'
        . '<div class="botones"><button class="btn" type="submit">Guardar reglas</button></div></form></section>';

    // Google Play
    $h .= '<section class="panel" id="panel-google"><h2>Google Play</h2><p>' . (Google::configurado() ? cc_chip('configurado', 'ok') : cc_chip('sin configurar')) . ' '
        . '<span class="tenue">Las compras anuladas en Google (reembolsos y contracargos) se revierten solas con la tarea programada; aquí puedes revisarlas ahora.</span></p>';
    $avisos = Control::columna('compras', 'google_ack') ? (int) Db::valor("SELECT COUNT(*) FROM compras WHERE canal = 'google_play' AND estado = 'pagado' AND google_ack IS NULL") : 0;
    $h .= '<p class="tenue">Compras de Google sin avisar a Google: <b>' . $avisos . '</b> (Google devuelve el dinero si no se avisa en 3 días).</p>';
    if (Control::tabla('google_anuladas')) {
        $an = Db::todas('SELECT * FROM google_anuladas ORDER BY procesado IS NOT NULL, voided_ms DESC LIMIT 30');
        $h .= cc_tabla(['Orden', 'Anulada', 'Motivo', 'Compra', 'Resultado'], array_map(fn($x) => [e($x['order_id']), e(cc_fecha(intdiv((int) $x['voided_ms'], 1000))), (int) $x['motivo'] === 7 ? 'contracargo' : 'reembolso (' . (int) $x['motivo'] . ')',
            $x['compra_id'] ? '<a href="' . e(cc_url(['t' => 'compras', 'id' => $x['compra_id']])) . '">N° ' . (int) $x['compra_id'] . '</a>' : '—', e($x['resultado'] ?? 'pendiente')], $an), 'Google no ha anulado ninguna compra.', 'tabla-google-anuladas');
    }
    $h .= '<div class="acciones">' . cc_boton('ajustes_google', [], 'Revisar compras anuladas ahora', 'btn btn-sec') . cc_boton('ajustes_google_avisos', [], 'Reintentar avisos a Google', 'btn btn-sec') . '</div></section>';

    // PayPal (src/PayPal.php, docs/PAYPAL.md): estado de la configuración (nunca las llaves) y los últimos avisos
    $h .= cc_paypal_panel();

    // Seguridad del panel
    $ips = Config::get('ENVIVO_CONTROL_IPS');
    $h .= '<section class="panel" id="panel-seguridad"><h2>Seguridad del panel</h2><ul class="lista">'
        . '<li>Segundo factor (TOTP): ' . (Control::totpSecreto() !== '' ? cc_chip('activo', 'ok') : cc_chip('apagado', 'mal') . ' <span class="tenue">— créalo con <code>php server/bin/control_totp.php</code> y ponlo en ENVIVO_ADMIN_TOTP.</span>') . '</li>'
        . '<li>IPs permitidas: ' . ($ips !== '' ? '<code>' . e($ips) . '</code>' : cc_chip('todas', 'aviso') . ' <span class="tenue">— ENVIVO_CONTROL_IPS (o Cloudflare Access).</span>') . '</li>'
        . '<li>Créditos a mano hoy: ' . cc_num(Control::creditosManualesHoy()) . (Control::topeDia() > 0 ? ' de ' . cc_num(Control::topeDia()) . ' (tope diario)' : ' (sin tope)') . '; más de ' . cc_num(Control::CONFIRMAR_DESDE) . ' de una vez pide confirmar.</li>'
        . '<li>Sesiones del panel abiertas: ' . (int) Db::valor('SELECT COUNT(*) FROM control_sesiones WHERE expira > ? AND ultimo > ?', [time(), time() - CC_INACTIVIDAD]) . ' (duran 12 h como máximo y 2 h sin uso).</li></ul></section>';

    // Auditoría
    $f = cc_get('accion_aud');
    $sql = 'SELECT * FROM auditoria'; $p = [];
    if ($f !== '' && preg_match('/^[a-z_]{2,60}$/', $f)) { $sql .= ' WHERE accion = ?'; $p[] = $f; }
    $aud = Db::todas($sql . ' ORDER BY id DESC LIMIT 200', $p);
    $acciones = ['' => 'Todas'];
    foreach (Db::todas('SELECT DISTINCT accion FROM auditoria ORDER BY accion') as $x) $acciones[$x['accion']] = $x['accion'];
    $h .= '<section class="panel"><h2>Auditoría</h2><form method="get" action="' . CC_RUTA . '" class="buscar"><input type="hidden" name="t" value="ajustes">'
        . '<select name="accion_aud" aria-label="Filtrar por acción">' . cc_opciones($acciones, $f) . '</select><button class="btn" type="submit">Filtrar</button></form>'
        . cc_tabla(['Fecha', 'Quién', 'Acción', 'Jugador', 'Compra', 'Detalle', 'IP'], array_map(fn($x) => [
            e(cc_fecha($x['creado'])), e($x['quien']), e($x['accion']),
            $x['jugador_id'] ? '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $x['jugador_id']])) . '">N° ' . (int) $x['jugador_id'] . '</a>' : '—',
            $x['compra_id'] ? '<a href="' . e(cc_url(['t' => 'compras', 'id' => $x['compra_id']])) . '">N° ' . (int) $x['compra_id'] . '</a>' : '—',
            '<span class="largo">' . e(mb_substr((string) $x['detalle'], 0, 400)) . '</span>', e($x['ip'])], $aud), 'Sin registros.', 'tabla-auditoria')
        . '</section>';
    return $h;
}

/** Panel de PayPal en Ajustes: ambiente, llaves puestas (sí/no), webhook, mínimo, ventas y los últimos avisos recibidos. */
function cc_paypal_panel(): string
{
    $listo = PayPal::configurado();
    $prod = PayPal::ambiente() === 'produccion';
    $h = '<section class="panel" id="panel-paypal"><h2>PayPal (tienda web) ' . ($listo ? cc_chip($prod ? 'producción' : 'sandbox (pruebas)', $prod ? 'ok' : 'aviso') : cc_chip('sin configurar')) . '</h2>'
        . '<ul class="lista">'
        . '<li>Llaves (PAYPAL_CLIENT_ID y PAYPAL_SECRET): ' . ($listo ? cc_chip('puestas', 'ok') : cc_chip('faltan', 'mal') . ' <span class="tenue">— sin ellas el botón «Pagar con PayPal» no aparece.</span>') . '</li>'
        . '<li>Webhook (PAYPAL_WEBHOOK_ID): ' . (PayPal::webhookConfigurado() ? cc_chip('puesto', 'ok') : cc_chip('falta', $listo ? 'mal' : '') . ' <span class="tenue">— sin él, los reembolsos y disputas de PayPal no se revierten solos.</span>')
        . ' <span class="tenue">Dirección: <code class="largo">' . e(Http::urlBase() . '/api/paypal/webhook') . '</code></span></li>'
        . '<li>Precio mínimo con PayPal (PAYPAL_MINIMO): <b>' . e(cc_dinero(PayPal::minimo())) . '</b> <span class="tenue">— la comisión en Ecuador es 5,4 % + $0,30 por venta.</span></li>'
        . '<li>Solo en la web: dentro de la app de Google Play nunca se muestra.</li>';
    if (Control::columna('compras', 'canal')) {
        $v = Db::fila("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t FROM compras WHERE canal = 'web_paypal' AND estado = 'pagado' AND pagado_en >= ?", [time() - 30 * 86400]);
        $h .= '<li>Ventas con PayPal (30 días): <b>' . (int) $v['n'] . '</b> · ' . e(cc_dinero((float) $v['t'])) . ' · <a href="' . e(cc_url(['t' => 'compras', 'canal' => 'web_paypal', 'estado' => 'todas'])) . '">ver compras</a></li>';
    }
    $h .= '</ul>';
    if (Control::tabla('paypal_eventos')) {
        $ev = Db::todas('SELECT * FROM paypal_eventos ORDER BY creado DESC LIMIT 20');
        $h .= '<h3>Últimos avisos de PayPal</h3>' . cc_tabla(['Fecha', 'Evento', 'Resultado', 'Compra'], array_map(fn($x) => [e(cc_fecha($x['creado'])), '<span class="largo">' . e($x['tipo']) . '</span>', e($x['resultado']),
            $x['compra_id'] ? '<a href="' . e(cc_url(['t' => 'compras', 'id' => $x['compra_id']])) . '">N° ' . (int) $x['compra_id'] . '</a>' : '—'], $ev), 'Todavía no llegó ningún aviso de PayPal.', 'tabla-paypal-eventos');
    }
    return $h . '<p class="tenue">Guía para configurarlo: <code>docs/PAYPAL.md</code>.</p></section>';
}

function cc_a_ajustes(string $accion, string $q): string
{
    switch ($accion) {
        case 'ajustes_mantenimiento':
            $on = cc_post('mantenimiento') === '1';
            Control::guardarMantenimiento($on, cc_post('mensaje'), $q);
            return $on ? 'La tienda quedó en mantenimiento: nadie puede comprar.' : 'La tienda está abierta otra vez.';
        case 'ajustes_anuncio':
            $txt = cc_post('texto');
            Control::guardarAnuncio($txt, cc_post('tipo'), cc_fecha_local(cc_post('hasta')), $q);
            return trim($txt) === '' ? 'Anuncio quitado.' : 'Anuncio publicado en el juego.';
        case 'ajustes_google':
            [$rev, $revert] = Control::revisarGoogle($q);
            return "Google: $rev compras anuladas revisadas, $revert revertidas.";
        case 'ajustes_abuso':
            Control::guardarAbuso(cc_post_int('reembolsos'), cc_post_int('dias'), cc_post('contracargo') === '1', $q);
            return 'Reglas contra el abuso de reembolsos guardadas.';
        case 'ajustes_google_avisos':
            return 'Google: ' . Control::avisarGoogle($q) . ' avisos enviados.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
