<?php
declare(strict_types=1);

// Pestaña "Invitar y aliados" del Centro de Control (?t=aliados): src/Invitaciones.php y src/Aliados.php.
//  - Productores Aliados: crear / cambiar códigos de creador (nombre, redes, nivel, cuenta, %, créditos al mes, activo),
//    por creador cuántos jugadores usaron su código, cuántos compraron, cuánto compraron (Plux / PayPal / Google, en
//    dólares) y el monto a pagarle según el %. El pago es aparte, en DINERO, como publicidad: aquí solo se calcula y se
//    marca "pagado" (meses cerrados). Nunca se convierten créditos en dinero.
//  - Postulaciones desde /aliados.html.
//  - Invita a tu equipo: números, quiénes más invitan, últimas invitaciones (con las que no cuentan y por qué) y encender/apagar.
// Todo por POST con CSRF; cada cambio queda en la auditoría.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Aliados, Fallo, Invitaciones};

const CC_INV_MOTIVOS = ['mismo_aparato' => 'mismo aparato que quien invitó', 'aparato_repetido' => 'aparato ya usado por otra cuenta', 'misma_conexion' => 'demasiadas desde la misma conexión'];

function cc_t_aliados(): string
{
    $sel = cc_get_int('aliado');
    if ($sel > 0 && ($a = Aliados::porId($sel))) return cc_aliado_detalle($a);
    $lista = Aliados::lista();
    $pend = array_sum(array_column($lista, 'pendiente'));
    $h = '<section class="panel" id="panel-aliados"><h2>Productores Aliados (creadores)</h2>'
       . '<p class="tenue">Quien escribe el código de un creador (en «Canjear código», al crear la cuenta o con el enlace <code>?ref=CÓDIGO</code>) recibe un regalo pequeño del juego '
       . '(nunca un descuento) y queda asociado a ese creador. El creador tiene la insignia «Productor Aliado» en su vitrina y créditos al mes <b>para jugar en su cuenta</b>. '
       . 'El porcentaje de las compras se le paga <b>aparte, en dinero, como publicidad</b>: aquí solo se calcula y se marca «pagado». Los créditos nunca se convierten en dinero.</p>';
    $h .= '<div class="kpis">' . cc_tarjeta('Creadores activos', cc_num(count(array_filter($lista, fn($a) => (int) $a['activo'] === 1))), cc_num(count($lista)) . ' en total', 'kpi-aliados-activos')
        . cc_tarjeta('Jugadores con código', cc_num(array_sum(array_column($lista, 'jugadores'))), cc_num(array_sum(array_column($lista, 'compradores'))) . ' compraron', 'kpi-aliados-jugadores')
        . cc_tarjeta('Compras de sus jugadores', cc_dinero(array_sum(array_column($lista, 'ventas'))), 'Plux + PayPal + Google', 'kpi-aliados-ventas')
        . cc_tarjeta('Por pagar (meses cerrados)', cc_dinero($pend), 'porcentaje por defecto ' . rtrim(rtrim(number_format(Aliados::pctDefecto(), 2, ',', ''), '0'), ',') . ' %', 'kpi-aliados-pendiente') . '</div>';
    $filas = array_map(fn($a) => [
        '<a href="' . e(cc_url(['t' => 'aliados', 'aliado' => $a['id']])) . '"><b>' . e($a['codigo_ver']) . '</b></a>' . ((int) $a['activo'] === 1 ? '' : ' ' . cc_chip('inactivo', 'mal')),
        e($a['nombre']) . ($a['redes'] !== '' ? '<br><small class="tenue">' . e(mb_substr((string) $a['redes'], 0, 80)) . '</small>' : ''),
        e((string) $a['nivel']),
        $a['jugador_id'] !== null ? '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $a['jugador_id']])) . '">N° ' . (int) $a['jugador_id'] . '</a>' : '<span class="tenue">sin cuenta</span>',
        cc_num($a['jugadores']), cc_num($a['compradores']),
        e(cc_dinero($a['ventas'])) . '<br><small class="tenue">Plux ' . e(cc_dinero($a['por_canal']['plux'])) . ' · PayPal ' . e(cc_dinero($a['por_canal']['paypal'])) . ' · Google ' . e(cc_dinero($a['por_canal']['google'])) . '</small>',
        e(rtrim(rtrim(number_format((float) $a['pct'], 2, ',', ''), '0'), ',') . ' %'),
        e(cc_dinero($a['mes_actual'])),
        $a['pendiente'] > 0 ? '<b>' . e(cc_dinero($a['pendiente'])) . '</b>' : e(cc_dinero(0)),
        e(cc_dinero($a['pagado'])),
        cc_num($a['creditos']) . ($a['creditos_mes_entregado'] ? ' ✓' : ''),
    ], $lista);
    $h .= cc_tabla(['Código', 'Creador', 'Nivel', 'Cuenta', 'Jugadores', 'Compraron', 'Compras (USD)', '%', 'Este mes', 'Por pagar', 'Pagado', 'Créditos/mes'], $filas, 'Todavía no hay creadores.', 'tabla-aliados');
    $h .= '<h3>Nuevo creador</h3>' . cc_aliado_form(null);
    $h .= '<h3>Porcentaje por defecto</h3>' . cc_form('aliados_pct', [], 'form form-producto', '¿Cambiar el porcentaje por defecto de todos los creadores sin porcentaje propio?')
        . '<label>Porcentaje de las compras (0 a 50)<input name="pct" inputmode="decimal" required maxlength="5" value="' . e((string) Aliados::pctDefecto()) . '"></label>'
        . '<div class="botones"><button class="btn" type="submit">Guardar</button></div></form>';
    $h .= '<h3>Niveles</h3>' . cc_tabla(['Nivel', 'Desde', 'Créditos al mes (por defecto)'], array_map(fn($n, $d) => [e((string) $n), e($d['nombre'] . ' — ' . $d['desde']), cc_num($d['creditos'])], array_keys(Aliados::NIVELES), Aliados::NIVELES), '', 'tabla-aliados-niveles');
    $h .= '</section>' . cc_postulaciones_panel() . cc_invitaciones_panel();
    return $h;
}

function cc_aliado_form(?array $a): string
{
    $v = fn(string $k, string $def = '') => e($a !== null && $a[$k] !== null ? (string) $a[$k] : $def);
    $niv = '';
    foreach (Aliados::NIVELES as $n => $d) $niv .= '<option value="' . $n . '"' . ((int) ($a['nivel'] ?? 1) === $n ? ' selected' : '') . '>' . e($d['nombre']) . '</option>';
    return cc_form($a ? 'aliados_cambiar' : 'aliados_crear', $a ? ['id' => $a['id']] : [], 'form form-producto', $a ? '¿Guardar los cambios de este creador?' : null)
        . '<label>Código (ej. PRODUCTOR-JUAN)<input name="codigo" required maxlength="32" autocapitalize="characters" spellcheck="false" value="' . $v('codigo_ver') . '"></label>'
        . '<label>Nombre del creador<input name="nombre" required maxlength="60" value="' . $v('nombre') . '"></label>'
        . '<label>Redes (enlaces o usuarios)<input name="redes" maxlength="500" value="' . $v('redes') . '"></label>'
        . '<label>Nivel<select name="nivel">' . $niv . '</select></label>'
        . '<label>Cuenta del creador en el juego (N° o correo; vacío = sin cuenta)<input name="cuenta" maxlength="120" value="' . $v('jugador_id') . '"></label>'
        . '<label>Porcentaje propio (vacío = el de todos)<input name="porcentaje" inputmode="decimal" maxlength="5" value="' . $v('porcentaje') . '"></label>'
        . '<label>Créditos al mes para su cuenta (vacío = los del nivel)<input name="creditos_mes" inputmode="numeric" maxlength="5" value="' . $v('creditos_mes') . '"></label>'
        . '<label>Notas (solo para el panel)<input name="notas" maxlength="1000" value="' . $v('notas') . '"></label>'
        . '<label class="check"><input type="checkbox" name="activo" value="1"' . ($a === null || (int) $a['activo'] === 1 ? ' checked' : '') . '> Activo (inactivo: el código deja de funcionar y no hay insignia ni créditos)</label>'
        . '<div class="botones"><button class="btn" type="submit">' . ($a ? 'Guardar cambios' : 'Crear creador') . '</button></div></form>';
}

function cc_aliado_detalle(array $a): string
{
    $id = (int) $a['id'];
    $h = '<section class="panel" id="panel-aliado"><p><a href="' . e(cc_url(['t' => 'aliados'])) . '">← Todos los creadores</a></p>'
       . '<h2>' . e($a['codigo_ver']) . ' · ' . e($a['nombre']) . ' ' . ((int) $a['activo'] === 1 ? cc_chip('activo', 'ok') : cc_chip('inactivo', 'mal')) . '</h2>'
       . '<p class="tenue">Compras pagadas de sus jugadores <b>después</b> de usar el código, por mes (las revertidas no cuentan). Porcentaje: '
       . e(rtrim(rtrim(number_format(Aliados::pctDe($a), 2, ',', ''), '0'), ',')) . ' %. El pago se hace aparte (transferencia, como publicidad) y aquí solo se anota.</p>';
    $filas = [];
    foreach (Aliados::meses($id) as $m) {
        $acc = '';
        if ($m['pagado']) $acc = cc_chip('pagado ' . cc_fecha($m['pagado']['pagado_en'], false), 'ok') . ' ' . cc_boton('aliados_anular', ['id' => $id, 'mes' => $m['mes']], 'Quitar marca', 'btn btn-chico', '¿Quitar la marca de pagado de ' . $m['mes'] . '?');
        elseif ($m['cerrado']) $acc = cc_form('aliados_pagado', ['id' => $id, 'mes' => $m['mes']], 'en-linea', '¿Anotar que ya le pagaste ' . cc_dinero($m['monto']) . ' de ' . $m['mes'] . '?')
            . '<input name="nota" maxlength="200" placeholder="nota (ej. transferencia)" style="max-width:160px"> <button class="btn btn-chico" type="submit">Marcar pagado</button></form>';
        else $acc = cc_chip('mes en curso', 'aviso');
        $filas[] = [e($m['mes']), cc_num($m['compras']), cc_num($m['compradores']), e(cc_dinero($m['plux'])), e(cc_dinero($m['paypal'])), e(cc_dinero($m['google'])), '<b>' . e(cc_dinero($m['ventas'])) . '</b>',
            '<b>' . e(cc_dinero($m['pagado'] ? $m['pagado']['monto_usd'] : $m['monto'])) . '</b>' . ($m['pagado'] && $m['pagado']['nota'] !== '' ? '<br><small class="tenue">' . e($m['pagado']['nota']) . '</small>' : ''), $acc];
    }
    $h .= cc_tabla(['Mes', 'Compras', 'Compradores', 'Plux', 'PayPal', 'Google', 'Total USD', 'A pagar', ''], $filas, 'Sus jugadores todavía no han comprado.', 'tabla-aliado-meses');
    $usos = array_map(fn($u) => [e(cc_fecha($u['creado'])), '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $u['jugador_id']])) . '">N° ' . (int) $u['jugador_id'] . '</a> ' . e((string) ($u['nombre'] ?? '')),
        e(Aliados::CANALES[$u['canal']] ?? $u['canal']), (int) $u['regalo'] === 1 ? 'sí' : e('no (' . (CC_INV_MOTIVOS[$u['motivo']] ?? (string) $u['motivo']) . ')')], Aliados::usos($id));
    $h .= '<h3>Jugadores que usaron el código (' . cc_num(count($usos)) . ')</h3>' . cc_tabla(['Fecha', 'Jugador', 'Por', 'Regalo'], $usos, 'Nadie lo ha usado todavía.', 'tabla-aliado-usos');
    $h .= '<h3>Cambiar datos</h3>' . cc_aliado_form($a);
    return $h . '</section>';
}

function cc_postulaciones_panel(): string
{
    $l = Aliados::postulaciones();
    $nuevas = count(array_filter($l, fn($p) => $p['estado'] === 'nueva'));
    $filas = array_map(fn($p) => [e(cc_fecha($p['creado'])), e($p['nombre']), e($p['correo']), e(mb_substr((string) $p['redes'], 0, 120)), e($p['pais']), e(mb_substr((string) $p['mensaje'], 0, 200)),
        $p['estado'] === 'nueva' ? cc_boton('aliados_postulacion', ['id' => $p['id']], 'Marcar revisada', 'btn btn-chico') : cc_chip('revisada')], $l);
    return '<section class="panel" id="panel-postulaciones"><h2>Postulaciones desde /aliados.html ' . ($nuevas ? cc_chip($nuevas . ' nuevas', 'aviso') : '') . '</h2>'
        . '<p class="tenue">Llegan aquí y, si está SOPORTE_CORREO, también por correo. Para aceptar a alguien, créale su código arriba.</p>'
        . cc_tabla(['Fecha', 'Nombre', 'Correo', 'Redes', 'País', 'Mensaje', ''], $filas, 'Todavía no hay postulaciones.', 'tabla-postulaciones') . '</section>';
}

function cc_invitaciones_panel(): string
{
    $r = Invitaciones::resumenPanel();
    $on = Invitaciones::activa();
    $h = '<section class="panel" id="panel-invitaciones"><h2>Invita a tu equipo ' . cc_chip($on ? 'encendido' : 'apagado', $on ? 'ok' : 'mal') . '</h2>'
       . '<p class="tenue">El amigo que llega con el enlace <code>?ref=</code> recibe un pack de bienvenida (uno por aparato). Quien invita gana premios cuando el amigo AVANZA '
       . '(capítulo 2, 3 días jugados, entra a una asociación) y metas de 1, 3, 5 y 10 amigos activos (la de 10: letrero dorado). No cuentan: el mismo aparato del que invita, '
       . 'un aparato que ya usó otra cuenta y más de ' . Invitaciones::IP_MAX_POR_INVITADOR . ' invitados desde la misma conexión. Nunca se premian reseñas.</p>';
    $h .= '<div class="kpis">' . cc_tarjeta('Invitaciones', cc_num($r['total']), cc_num($r['bloqueadas']) . ' no cuentan', 'kpi-inv-total') . cc_tarjeta('Amigos activos', cc_num($r['activos']), 'capítulo 2 y 3 días', 'kpi-inv-activos')
        . cc_tarjeta('Packs de bienvenida', cc_num($r['packs']), '', 'kpi-inv-packs') . cc_tarjeta('Metas entregadas', cc_num($r['metas']), cc_num($r['letreros']) . ' letreros dorados', 'kpi-inv-metas') . '</div>';
    $h .= cc_form('aliados_inv', ['activa' => $on ? '0' : '1'], 'en-linea', $on ? '¿Apagar las invitaciones? (nadie recibe premios nuevos mientras esté apagado)' : null)
        . '<button class="btn" type="submit">' . ($on ? 'Apagar invitaciones' : 'Encender invitaciones') . '</button></form>';
    $top = array_map(fn($f) => ['<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $f['invitador_id']])) . '">N° ' . (int) $f['invitador_id'] . '</a> ' . e((string) ($f['nombre'] ?? '')), e((string) ($f['email'] ?? '')),
        cc_num($f['total']), cc_num($f['activos']), cc_num($f['bloqueadas'])], Invitaciones::topInvitadores());
    $h .= '<h3>Quiénes más invitan</h3>' . cc_tabla(['Jugador', 'Correo', 'Invitados', 'Activos', 'No cuentan'], $top, 'Nadie ha invitado todavía.', 'tabla-inv-top');
    $rec = array_map(fn($f) => [e(cc_fecha($f['creado'])), 'N° ' . (int) $f['invitado_id'] . ' ' . e((string) ($f['invitado_nombre'] ?? '')), 'N° ' . (int) $f['invitador_id'] . ' ' . e((string) ($f['invitador_nombre'] ?? '')),
        $f['estado'] === 'ok' ? cc_chip('cuenta', 'ok') : cc_chip('no cuenta: ' . (CC_INV_MOTIVOS[$f['motivo']] ?? (string) $f['motivo']), 'mal'), (int) $f['bienvenida'] ? 'sí' : 'no',
        ($f['capitulo2'] ? 'cap. 2 ✓ ' : '') . ($f['dias3'] ? '3 días ✓ ' : '') . ($f['asociacion'] ? 'asociación ✓' : ''), e((string) ($f['ip'] ?? '—'))], Invitaciones::recientes());
    $h .= '<h3>Últimas invitaciones</h3>' . cc_tabla(['Fecha', 'Invitado', 'Invitó', 'Estado', 'Pack', 'Etapas', 'IP'], $rec, 'Todavía no hay invitaciones.', 'tabla-inv-recientes');
    return $h . '</section>';
}

function cc_a_aliados(string $accion, string $q): string
{
    $datos = fn() => ['codigo' => cc_post('codigo'), 'nombre' => cc_post('nombre'), 'redes' => cc_post('redes'), 'nivel' => cc_post_int('nivel'), 'cuenta' => cc_post('cuenta'),
        'porcentaje' => cc_post('porcentaje'), 'creditos_mes' => cc_post('creditos_mes'), 'activo' => cc_post('activo') === '1', 'notas' => cc_post('notas')];
    switch ($accion) {
        case 'aliados_crear':
            $a = Aliados::guardar($datos(), null, $q);
            return 'Creador ' . $a['codigo_ver'] . ' creado.';
        case 'aliados_cambiar':
            $a = Aliados::guardar($datos(), cc_post_int('id'), $q);
            return 'Creador ' . $a['codigo_ver'] . ' guardado.';
        case 'aliados_pct':
            return 'Porcentaje por defecto: ' . Aliados::guardarPctDefecto(cc_post('pct'), $q) . ' %.';
        case 'aliados_pagado':
            $p = Aliados::marcarPagado(cc_post_int('id'), cc_post('mes'), cc_post('nota'), $q);
            return 'Anotado: ' . $p['mes'] . ' pagado (' . cc_dinero($p['monto_usd']) . ').';
        case 'aliados_anular':
            Aliados::anularPago(cc_post_int('id'), cc_post('mes'), $q);
            return 'Se quitó la marca de pagado de ' . cc_post('mes') . '.';
        case 'aliados_postulacion':
            Aliados::revisarPostulacion(cc_post_int('id'), $q);
            return 'Postulación marcada como revisada.';
        case 'aliados_inv':
            Invitaciones::encender(cc_post('activa') === '1', $q);
            return 'Invitaciones ' . (cc_post('activa') === '1' ? 'encendidas' : 'apagadas') . '.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
