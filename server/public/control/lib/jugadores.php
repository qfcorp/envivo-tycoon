<?php
declare(strict_types=1);

// Pestaña "Jugadores": buscar por correo, alias, nombre o número; ficha con compras, libro de créditos, entregas,
// inventario, VIP/tarjeta, historial de partidas guardadas, estado de la cuenta, sanciones del chat, transferencias, soporte y auditoría.
// Acciones: dar/quitar créditos (motivo obligatorio, tope diario), activo/suspendido/baneado, cerrar sesiones, restaurar una partida guardada, sanciones
// del chat y cancelar transferencias de cuenta. Todo con las clases del servidor (Control, Cuentas, Sesiones, Transferencias).
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Auditoria, Catalogo, Control, Db, Fallo, Monedero, Partidas, Transferencias, Vip};

function cc_estado_cuenta(string $e): string { return cc_chip($e, ['activo' => 'ok', 'suspendido' => 'aviso', 'baneado' => 'mal'][$e] ?? ''); }

function cc_t_jugadores(): string
{
    $id = cc_get_int('id');
    if ($id > 0) return cc_ficha_jugador($id);
    $b = cc_get('q');
    $h = '<h1>Jugadores</h1><form method="get" action="' . CC_RUTA . '" class="buscar" role="search"><input type="hidden" name="t" value="jugadores">'
       . '<input type="search" name="q" value="' . e($b) . '" placeholder="Correo, alias, nombre o N°" aria-label="Buscar jugador" maxlength="120"><button class="btn" type="submit">Buscar</button></form>';
    $sql = "SELECT j.*, (SELECT COALESCE(SUM(total), 0) FROM compras c WHERE c.jugador_id = j.id AND c.estado = 'pagado') AS gastado FROM jugadores j";
    $p = [];
    if ($b !== '') {
        $l = '%' . addcslashes($b, '%_\\') . '%';
        $w = ["j.email LIKE ? ESCAPE '\\'", "j.nombre LIKE ? ESCAPE '\\'", "j.alias LIKE ? ESCAPE '\\'"];
        $p = [$l, $l, $l];
        $num = ltrim($b, '#N°n° ');
        if ($num !== '' && ctype_digit($num)) { $w[] = 'j.id = ?'; $p[] = (int) $num; }
        $sql .= ' WHERE ' . implode(' OR ', $w);
    }
    $sql .= ' ORDER BY ' . ($b !== '' ? 'j.id DESC' : 'COALESCE(j.ultimo_ingreso, j.creado) DESC') . ' LIMIT 100';
    $filas = Db::todas($sql, $p);
    $h .= '<p class="tenue">' . ($b === '' ? 'Los 100 que entraron más recientemente.' : count($filas) . ' resultado(s)' . (count($filas) === 100 ? ' (máximo 100: afina la búsqueda)' : '') . '.') . '</p>';
    $h .= cc_tabla(['N°', 'Jugador', 'Créditos', 'Pagó', 'Estado', 'Último ingreso'], array_map(fn($j) => [
        (int) $j['id'],
        '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $j['id']])) . '"><b>' . e($j['nombre']) . '</b></a>' . ($j['alias'] ? ' · ' . e($j['alias']) : '') . '<br><span class="tenue">' . e($j['email']) . '</span>',
        cc_num((int) $j['creditos'] - (int) $j['deuda']), cc_dinero($j['gastado']),
        cc_estado_cuenta((string) $j['estado']) . ((int) ($j['vip_hasta'] ?? 0) > time() ? ' ' . cc_chip('VIP', 'vip') : ''),
        e(cc_fecha($j['ultimo_ingreso'] ?? null))], $filas), 'Ningún jugador coincide.', 'tabla-jugadores');
    if (Control::tabla('transferencias')) {
        $ts = Db::todas("SELECT * FROM transferencias ORDER BY CASE WHEN estado IN ('pendiente_pago', 'pagada') THEN 0 ELSE 1 END, id DESC LIMIT 50");
        $h .= '<section class="panel"><h2>Transferencias de cuenta</h2><p class="tenue">La paga el dueño actual; el nuevo dueño confirma con su correo y el código. Al completarse se cierran las sesiones del anterior y la cuenta no puede vender ni transferir por 7 días.</p>'
            . cc_tabla_transferencias($ts) . '</section>';
    }
    return $h;
}

function cc_tabla_transferencias(array $ts): string
{
    return cc_tabla(['N°', 'Fecha', 'Cuenta', 'De → a', 'Estado', ''], array_map(fn($t) => [
        (int) $t['id'], e(cc_fecha($t['creado'])), '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $t['jugador_id']])) . '">N° ' . (int) $t['jugador_id'] . '</a>',
        '<span class="largo">' . e($t['email_anterior']) . ' → ' . e($t['email_nuevo']) . '</span>'
        . ($t['compra_id'] ? '<br><a href="' . e(cc_url(['t' => 'compras', 'id' => $t['compra_id']])) . '">compra N° ' . (int) $t['compra_id'] . '</a>' : ''),
        cc_chip((string) $t['estado'], ['pendiente_pago' => 'aviso', 'pagada' => 'aviso', 'completada' => 'ok', 'cancelada' => ''][$t['estado']] ?? ''),
        in_array($t['estado'], ['pendiente_pago', 'pagada'], true) ? cc_boton('transferencia_cancelar', ['transferencia_id' => $t['id']], 'Cancelar', 'btn btn-chico btn-sec',
            $t['estado'] === 'pagada' ? '¿Cancelar una transferencia YA PAGADA? Después decide si devuelves el dinero.' : '¿Cancelar esta transferencia?') : ''], $ts),
        'Sin transferencias.', 'tabla-transferencias');
}

function cc_ficha_jugador(int $id): string
{
    $j = Db::fila('SELECT * FROM jugadores WHERE id = ?', [$id]);
    if (!$j) return '<h1>Jugador</h1>' . cc_no_disponible('Jugador N° ' . $id, 'No existe.') . '<p><a href="' . e(cc_url(['t' => 'jugadores'])) . '">← Volver a la búsqueda</a></p>';
    $t = time();
    $estado = (string) $j['estado'];
    $vip = $j['vip_hasta'] !== null ? (int) $j['vip_hasta'] : null;
    $tarjeta = $j['tarjeta_hasta'] !== null ? (int) $j['tarjeta_hasta'] : null;
    $saldo = (int) $j['creditos'] - (int) $j['deuda'];
    $sesiones = (int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ? AND expira > ?', [$id, $t]);
    $gastado = Db::fila("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t FROM compras WHERE jugador_id = ? AND estado = 'pagado'", [$id]);

    $h = '<p><a href="' . e(cc_url(['t' => 'jugadores'])) . '">← Jugadores</a></p>';
    $h .= '<h1 id="ficha-jugador">' . e($j['nombre']) . ' <span class="tenue">N° ' . $id . '</span></h1>';
    $h .= '<p class="ficha-sub">' . e($j['email']) . ($j['alias'] ? ' · productora <b>' . e($j['alias']) . '</b>' : '')
        . ($j['servidor_id'] ? ' · servidor ' . (int) $j['servidor_id'] : '') . ' · ' . cc_estado_cuenta($estado) . '</p>';
    if ($estado !== 'activo') {
        $h .= '<div class="aviso aviso-error" id="aviso-cuenta">Cuenta ' . e(['suspendido' => 'suspendida', 'baneado' => 'baneada'][$estado] ?? $estado)
            . ($j['estado_desde'] ? ' desde el ' . e(cc_fecha($j['estado_desde'])) : '') . '. Motivo: ' . e($j['estado_motivo'] ?: '—') . '</div>';
    }
    $chat = Control::tabla('chat_sanciones') ? \EnVivo\Chat::sancion($id) : null;
    $h .= '<div class="kpis kpis-chicos">'
        . cc_tarjeta('Créditos', cc_num($saldo), (int) $j['deuda'] > 0 ? 'deuda: ' . cc_num($j['deuda']) . ' (se descuenta de lo próximo)' : 'saldo actual', 'kpi-saldo')
        . cc_tarjeta('Pagó', cc_dinero($gastado['t']), (int) $gastado['n'] . ' compras pagadas')
        . cc_tarjeta('VIP', $vip !== null && $vip > $t ? 'Activo' : 'No', $vip ? 'hasta ' . cc_fecha($vip) : 'nunca compró', 'kpi-vip')
        . cc_tarjeta('Tarjeta mensual', $tarjeta !== null && $tarjeta > $t ? 'Activa' : 'No', $tarjeta ? 'hasta ' . cc_fecha($tarjeta) : '—', 'kpi-tarjeta')
        . cc_tarjeta('Sesiones abiertas', (string) $sesiones, 'creado ' . cc_fecha($j['creado'], false) . ' · último ingreso ' . cc_fecha($j['ultimo_ingreso'] ?? null))
        . cc_tarjeta('Chat', $chat ? ($chat['tipo'] === 'expulsion' ? 'Expulsado' : 'Silenciado') : 'Normal', $chat ? ($chat['hasta'] ? 'hasta ' . cc_fecha(strtotime($chat['hasta'])) : 'sin fin') : 'sin sanciones vigentes')
        . '</div>';

    // Acciones
    $hoy = Control::creditosManualesHoy();
    $tope = Control::topeDia();
    $h .= '<section class="panel"><h2>Acciones</h2><div class="acciones-grid">';
    $h .= cc_form('jugador_creditos', ['jugador_id' => $id], 'form', '¿Aplicar el cambio de créditos?')
        . '<h3>Dar o quitar créditos</h3><label>Créditos (negativo para quitar)<input type="number" name="cambio" required step="1" inputmode="numeric"></label>'
        . '<label>Motivo (obligatorio)<input name="motivo" required maxlength="300" placeholder="Ej. compra N° 12 no llegó"></label>'
        . '<label class="check"><input type="checkbox" name="confirmo" value="1"> Confirmo la cantidad (obligatorio si es más de ' . cc_num(Control::CONFIRMAR_DESDE) . ')</label>'
        . '<p class="tenue">Hoy se movieron ' . cc_num($hoy) . ($tope > 0 ? ' de ' . cc_num($tope) . ' (tope diario)' : '') . ' créditos a mano.</p><button class="btn" type="submit">Aplicar</button></form>';
    $h .= cc_form('jugador_dinero', ['jugador_id' => $id], 'form', '¿Dar este dinero del juego?')
        . '<h3>Dar dinero del juego</h3><label>Dinero del juego en $ (no son créditos)<input type="number" name="monto" required min="1" max="1000000" step="1" inputmode="numeric" placeholder="Ej. 50000"></label>'
        . '<label>Motivo (obligatorio)<input name="motivo" required maxlength="300" placeholder="Ej. demo para clientes"></label>'
        . '<p class="tenue">Le llega a la partida la próxima vez que abra o recargue el juego (con su cuenta). Sirve para demos y pruebas.</p><button class="btn" type="submit">Dar dinero</button></form>';
    $h .= cc_form('jugador_estado', ['jugador_id' => $id], 'form', '¿Cambiar el estado de la cuenta?')
        . '<h3>Estado de la cuenta</h3><label>Estado<select name="estado">' . cc_opciones(['activo' => 'Activa', 'suspendido' => 'Suspendida (no compra, no vende, no chatea)', 'baneado' => 'Baneada (no entra; cierra sus sesiones)'], $estado) . '</select></label>'
        . '<label>Motivo (obligatorio para suspender o banear)<input name="motivo" maxlength="300"></label><button class="btn btn-peligro" type="submit">Guardar estado</button></form>';
    $h .= '<div class="form"><h3>Sesiones y chat</h3>'
        . cc_boton('jugador_sesiones', ['jugador_id' => $id], 'Cerrar todas sus sesiones (' . $sesiones . ')', 'btn btn-sec', '¿Cerrar todas las sesiones de este jugador?');
    if (Control::tabla('chat_sanciones')) {
        $h .= '<div class="acciones">' . cc_acciones_autor($id) . ($chat ? cc_boton('chat_levantar', ['jugador_id' => $id], 'Levantar sanción del chat', 'btn btn-chico btn-sec') : '') . '</div>';
    }
    $h .= '</div></div></section>';
    $h .= cc_vip_pruebas($id);
    $h .= cc_partidas_historial($id);

    // Compras
    $compras = Db::todas('SELECT * FROM compras WHERE jugador_id = ? ORDER BY id DESC LIMIT 50', [$id]);
    $h .= '<section class="panel"><h2>Compras</h2>' . cc_tabla(['N°', 'Fecha', 'Producto', 'Total', 'Estado'], array_map(fn($c) => [
        '<a href="' . e(cc_url(['t' => 'compras', 'id' => $c['id']])) . '">' . (int) $c['id'] . '</a>', e(cc_fecha($c['pagado_en'] ?? $c['creado'])),
        e(Catalogo::productoCompra((string) $c['producto'])['nombre'] ?? $c['producto']) . cc_chip_canal($c),
        cc_dinero($c['total']), cc_estado_compra((string) $c['estado'])], $compras), 'Nunca compró.', 'compras-jugador') . '</section>';

    // Libro de créditos
    $mov = Db::todas('SELECT * FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 100', [$id]);
    $h .= '<section class="panel"><h2>Libro de créditos <span class="tenue">(últimos 100)</span></h2>' . cc_tabla(['Fecha', 'Cambio', 'Saldo', 'Motivo', 'Referencia'], array_map(fn($m) => [
        e(cc_fecha($m['creado'])), '<b class="' . ((int) $m['cambio'] >= 0 ? 'mas' : 'menos') . '">' . ((int) $m['cambio'] > 0 ? '+' : '') . cc_num($m['cambio']) . '</b>', cc_num($m['saldo']), e($m['motivo']), '<span class="largo">' . e($m['ref']) . '</span>'], $mov), 'Sin movimientos.', 'libro-jugador') . '</section>';

    // Inventario
    if (Control::tabla('inventario')) {
        $inv = Db::todas('SELECT * FROM inventario WHERE jugador_id = ? ORDER BY id DESC', [$id]);
        $h .= '<section class="panel"><h2>Inventario del servidor</h2>' . cc_tabla(['N°', 'Equipo', 'Serie', 'Origen', 'Estado', 'Desde'], array_map(fn($x) => [
            (int) $x['id'], e(Catalogo::nombreEquipo((string) $x['item'])), '#' . sprintf('%04d', (int) $x['serie']), e($x['origen']),
            cc_chip((string) $x['estado'], ['bodega' => 'ok', 'publicado' => 'aviso', 'revocado' => 'mal'][$x['estado']] ?? ''), e(cc_fecha($x['actualizado']))], $inv), 'Sin equipos en el servidor.', 'inventario-jugador') . '</section>';
    } else {
        $h .= '<section class="panel"><h2>Inventario</h2>' . cc_no_disponible('Inventario', 'Falta la tabla inventario.') . '</section>';
    }

    // Entregas
    $ent = Db::todas('SELECT * FROM entregas WHERE jugador_id = ? ORDER BY id DESC LIMIT 50', [$id]);
    $h .= '<section class="panel"><h2>Entregas <span class="tenue">(lo que el juego aplica una vez)</span></h2>' . cc_tabla(['N°', 'Fecha', 'Tipo', 'Qué', 'Cantidad', 'Origen'], array_map(fn($x) => [
        (int) $x['id'], e(cc_fecha($x['creado'])), e($x['tipo']), e($x['item']), cc_num($x['cantidad']), e($x['origen'])], $ent), 'Sin entregas.', 'entregas-jugador') . '</section>';

    // Sanciones del chat
    if (Control::tabla('chat_sanciones')) {
        $san = Db::todas('SELECT * FROM chat_sanciones WHERE jugador_id = ? ORDER BY id DESC LIMIT 30', [$id]);
        $h .= '<section class="panel"><h2>Sanciones del chat</h2>' . cc_tabla(['Fecha', 'Tipo', 'Hasta', 'Motivo'], array_map(fn($s) => [
            e(cc_fecha($s['creado'])), e($s['tipo'] . ((int) $s['levantada'] ? ' (levantada)' : '')), e($s['hasta'] === null ? 'sin fin' : cc_fecha($s['hasta'])), e($s['motivo'])], $san),
            'Nunca fue sancionado en el chat.', 'sanciones-jugador') . '</section>';
    }

    // Transferencias y soporte
    if (Control::tabla('transferencias')) {
        $ts = Db::todas('SELECT * FROM transferencias WHERE jugador_id = ? ORDER BY id DESC LIMIT 20', [$id]);
        if ($ts) $h .= '<section class="panel"><h2>Transferencias de esta cuenta</h2>' . cc_tabla_transferencias($ts) . '</section>';
    }
    if (Control::tabla('soporte_casos')) {
        $casos = Db::todas('SELECT * FROM soporte_casos WHERE jugador_id = ? ORDER BY id DESC LIMIT 20', [$id]);
        if ($casos) $h .= '<section class="panel"><h2>Casos de soporte</h2>' . cc_tabla(['N°', 'Asunto', 'Estado', 'Actualizado'], array_map(fn($c) => [
            '<a href="' . e(cc_url(['t' => 'soporte', 'caso' => $c['id']])) . '">#' . (int) $c['id'] . '</a>', e($c['asunto']), cc_chip((string) $c['estado']), e(cc_fecha($c['actualizado']))], $casos)) . '</section>';
    }

    // Auditoría del jugador (tabla auditoria)
    $aud = Auditoria::ultimas(50, $id);
    $h .= '<section class="panel"><h2>Auditoría de esta cuenta</h2>' . cc_tabla(['Fecha', 'Quién', 'Acción', 'Detalle'], array_map(fn($a) => [
        e(cc_fecha($a['creado'])), e($a['quien']), e($a['accion']), '<span class="largo">' . e(mb_substr((string) $a['detalle'], 0, 300)) . '</span>'], $aud), 'Sin cambios.', 'auditoria-jugador') . '</section>';
    return $h;
}

/**
 * Bloque "VIP (pruebas)" de la ficha: Pase VIP por días (1, 7, 30 u otro) y desactivarlo; nivel VIP forzado 1–10 y quitarlo.
 * Nada de esto crea compras (los ingresos y las facturas del SRI quedan limpios). El juego lo ve en el siguiente /api/estado.
 */
function cc_vip_pruebas(int $id): string
{
    if (!class_exists(Vip::class) || !Control::tabla('vip_jugadores')) return '<section class="panel" id="vip-pruebas"><h2>VIP (pruebas)</h2>' . cc_no_disponible('VIP', 'Falta el módulo VIP (vip.sql).') . '</section>';
    $real = Vip::nivelReal($id);
    $forzado = Vip::nivelForzado($id);
    $nivel = $forzado ?? $real;
    $hasta = Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$id]);
    $activo = Monedero::vipActivo($id);
    $pase = Vip::pase($nivel);
    $b = $pase['bono'];
    $bono = '$' . cc_num($b['dinero']) . ' del juego + ' . $b['creditos'] . ' créditos' . ($b['cable'] ? ' + ' . $b['cable'] . ' cable(s)' : '') . ($b['battery'] ? ' + ' . $b['battery'] . ' batería(s)' : '') . ($b['reparar'] ? ' + todo el equipo al 100 %' : '');
    $ins = fn(int $n) => $n > 0 ? 'VIP ' . $n . ' · ' . Vip::NIVELES[$n]['insignia'] : 'Sin nivel (0)';
    $intentos = count(array_filter(Vip::NIVELES_INTENTO, fn($x) => $nivel >= $x));
    $h = '<section class="panel" id="vip-pruebas"><h2>VIP (pruebas)</h2>'
       . '<p class="tenue">Para probar el Pase VIP y los niveles sin inventar compras: no crea ventas ni facturas. El juego lo ve en la próxima carga de /api/estado (al abrir o recargar). Todo queda en la auditoría.</p>'
       . '<dl class="datos" id="vip-estado">'
       . '<dt>Nivel real (compras)</dt><dd id="vip-real">' . e($ins($real)) . ' <span class="tenue">· ' . cc_dinero(Vip::gastado($id)) . ' que cuentan</span></dd>'
       . '<dt>Nivel forzado</dt><dd id="vip-forzado">' . ($forzado !== null ? cc_chip('VIP ' . $forzado . ' (pruebas)', 'aviso') : '—') . '</dd>'
       . '<dt>Nivel que usa el juego</dt><dd id="vip-efectivo"><b>' . e($ins($nivel)) . '</b>' . ($nivel > 0 ? ' · ' . e(Vip::NIVELES[$nivel]['titulo']) : '') . '</dd>'
       . '<dt>Pase VIP</dt><dd id="vip-pase">' . ($activo ? cc_chip('Activo', 'vip') . ' hasta ' . e(cc_fecha($hasta)) : 'Inactivo' . ($hasta !== null ? ' <span class="tenue">(venció ' . e(cc_fecha($hasta)) . ')</span>' : '')) . '</dd>'
       . '<dt>Ventajas del Pase con VIP ' . max(1, $nivel) . '</dt><dd id="vip-ventajas">' . $pase['turnos'] . ' eventos por día · reparaciones −' . $pase['descuento'] . ' % · obras −' . $pase['obra'] . ' % · bono diario: ' . e($bono)
       . ($activo ? '' : ' <span class="tenue">(solo con el Pase activo)</span>') . '</dd>'
       . '<dt>Ventajas del nivel</dt><dd>' . ($nivel > 0 ? '+' . $intentos . ' intento(s) de preparación por día · ' . ($nivel >= Vip::NIVEL_SLOT_OBRA ? 2 : 1) . ' espacio(s) de obra · regalo mensual · insignia en el chat' : 'Ninguna (sin nivel)') . '</dd>'
       . '</dl><div class="acciones-grid">';
    // Pase VIP
    $h .= '<div class="form" id="vip-pase-form"><h3>Pase VIP</h3><p class="tenue">Suma días desde ahora o desde su vencimiento si ya está activo.</p><div class="botones">';
    foreach ([1, 7, 30] as $d) $h .= cc_boton('jugador_vip_pase', ['jugador_id' => $id, 'dias' => $d], '+' . $d . ($d === 1 ? ' día' : ' días'), 'btn btn-sec', '¿Dar ' . $d . ($d === 1 ? ' día' : ' días') . ' de Pase VIP (sin compra)?');
    $h .= '</div>' . cc_form('jugador_vip_pase', ['jugador_id' => $id], 'form', '¿Dar estos días de Pase VIP (sin compra)?')
        . '<label>Otro número de días (1 a 365)<input type="number" name="dias" required min="1" max="365" step="1" inputmode="numeric" placeholder="Ej. 3"></label><button class="btn" type="submit">Activar / alargar</button></form>';
    if ($activo) $h .= cc_boton('jugador_vip_pase', ['jugador_id' => $id, 'dias' => 0], 'Desactivar el Pase VIP', 'btn btn-peligro', '¿Desactivar el Pase VIP de este jugador ahora? (si lo había comprado, también se le quita)');
    $h .= '</div>';
    // Nivel
    $ops = [];
    for ($n = 1; $n <= Vip::MAX; $n++) $ops[$n] = 'VIP ' . $n . ' · ' . Vip::NIVELES[$n]['insignia'];
    $h .= cc_form('jugador_vip_nivel', ['jugador_id' => $id], 'form', '¿Forzar este nivel VIP? (solo pruebas, no crea compras)')
        . '<h3>Nivel VIP (pruebas)</h3><label>Nivel forzado<select name="nivel">' . cc_opciones($ops, (string) ($forzado ?? max(1, $real))) . '</select></label>'
        . '<p class="tenue">Reemplaza al nivel real mientras esté puesto. No crea compras ni ofertas de nivel; el nivel real sigue contando aparte.</p><button class="btn" type="submit">Forzar nivel</button></form>';
    if ($forzado !== null) $h .= '<div class="form"><h3>Volver al nivel real</h3>' . cc_boton('jugador_vip_nivel', ['jugador_id' => $id, 'nivel' => 'real'], 'Quitar nivel forzado (volver al real: VIP ' . $real . ')', 'btn btn-sec', '¿Quitar el nivel forzado y volver al nivel real?') . '</div>';
    return $h . '</div></section>';
}

/**
 * Bloque "Partidas guardadas (historial)" de la ficha (Partidas::historial, migraciones/partidas_historial.sql): la partida
 * actual y cada versión anterior con fecha, rev, dispositivo, fama, día, dinero y motivo, y "Restaurar esta".
 */
function cc_partidas_historial(int $id): string
{
    $tit = '<section class="panel" id="partidas-historial"><h2>Partidas guardadas (historial)</h2>';
    if (!Control::tabla('partidas_historial')) return $tit . cc_no_disponible('Historial de partidas', 'Falta la tabla partidas_historial (partidas_historial.sql).') . '</section>';
    $disp = fn($d) => $d === null ? '<span class="tenue">juego viejo</span>' : ($d === Partidas::DISP_PANEL ? cc_chip('panel', 'aviso') : '<code title="' . e((string) $d) . '">' . e(mb_substr((string) $d, 0, 8)) . '…</code>');
    $n = fn($v) => is_numeric($v) ? cc_num($v) : '—';
    $mot = fn(string $m) => cc_chip(['guardado' => 'guardado', 'tomar' => 'tomar', 'retroceso' => 'retroceso', 'otro_avance' => 'otro aparato con más avance', 'nueva' => 'quiebra: partida nueva', 'antes_de_restaurar' => 'antes de restaurar'][$m] ?? $m,
        ['tomar' => 'aviso', 'retroceso' => 'mal', 'otro_avance' => 'aviso', 'nueva' => 'aviso', 'antes_de_restaurar' => 'aviso'][$m] ?? '');
    $act = Partidas::actual($id);
    $h = $tit . '<p class="tenue">Antes de cada guardado, la versión anterior se copia aquí. Se guardan las últimas ' . Partidas::HIST_ULTIMAS
       . ', la más nueva de cada día de los últimos ' . Partidas::HIST_DIAS . ' días y, por ' . Partidas::HIST_DIAS_ESPECIALES
       . ' días, las que se pisaron con «tomar», con menos fama (retroceso) o desde otro aparato con más avance. El juego nunca deja reemplazar la partida con una de menos avance: volver atrás solo se puede aquí. «Restaurar esta» la vuelve la partida actual (versión nueva): '
       . 'la actual pasa antes al historial y todos los aparatos tienen que cargar la de la nube. Queda en la auditoría.</p>';
    $h .= '<dl class="datos" id="partida-actual"><dt>Partida actual</dt><dd>' . ($act
        ? 'rev <b>' . $act['rev'] . '</b> · ' . e(cc_fecha($act['actualizado'])) . ' · ' . $disp($act['dispositivo']) . ' · fama ' . $n($act['rep']) . ' · día ' . $n($act['dia']) . ' · $' . $n($act['dinero'])
        : 'Sin partida en la nube.') . '</dd></dl>';
    $filas = Partidas::historial($id);
    $h .= cc_tabla(['Fecha', 'Rev', 'Dispositivo', 'Fama', 'Día', 'Dinero', 'Motivo', ''], array_map(fn($v) => [
        e(cc_fecha($v['actualizado'])) . '<br><span class="tenue">pisada ' . e(cc_fecha($v['guardado_en'])) . '</span>', (string) $v['rev'], $disp($v['dispositivo']),
        $n($v['rep']), $n($v['dia']), '$' . $n($v['dinero']), $mot($v['motivo']),
        cc_boton('jugador_partida_restaurar', ['jugador_id' => $id, 'historial_id' => $v['id']], 'Restaurar esta', 'btn btn-chico btn-sec',
            '¿Restaurar la versión rev ' . $v['rev'] . ' del ' . cc_fecha($v['actualizado']) . ' (fama ' . (is_numeric($v['rep']) ? $v['rep'] : '—') . ', día ' . (is_numeric($v['dia']) ? $v['dia'] : '—')
            . ') como partida actual? La actual pasa al historial y todos los aparatos tendrán que cargar la de la nube.')], $filas),
        'Todavía no hay versiones anteriores.', 'tabla-partidas-historial');
    return $h . '</section>';
}

function cc_a_jugadores(string $accion, string $q): string
{
    if ($accion === 'transferencia_cancelar') {
        $tid = cc_post_int('transferencia_id');
        Transferencias::cancelar($tid, $q);
        return 'Transferencia N° ' . $tid . ' cancelada.';
    }
    $id = cc_post_int('jugador_id');
    Fallo::si($id <= 0, 'Falta el jugador.', 400);
    switch ($accion) {
        case 'jugador_creditos':
            $cambio = filter_var(cc_post('cambio'), FILTER_VALIDATE_INT);
            Fallo::si($cambio === false, 'Escribe un número entero de créditos.', 400);
            $saldo = Control::darCreditos($id, (int) $cambio, cc_post('motivo'), $q, cc_post('confirmo') === '1');
            return ($cambio > 0 ? 'Se dieron ' : 'Se quitaron ') . cc_num(abs($cambio)) . ' créditos. Saldo nuevo: ' . cc_num($saldo) . '.';
        case 'jugador_dinero':
            $monto = filter_var(cc_post('monto'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 1000000]]);
            Fallo::si($monto === false, 'Escribe un monto entre 1 y 1.000.000.', 400);
            $motivo = trim(cc_post('motivo'));
            Fallo::si($motivo === '', 'Escribe el motivo.', 400);
            \EnVivo\Monedero::entregar($id, 'dinero', '-', (int) $monto, 'panel');
            \EnVivo\Auditoria::anotar($q, 'dinero_dar', '$' . $monto . ' del juego: ' . mb_substr($motivo, 0, 300), $id);
            return 'Se enviaron $' . cc_num($monto) . ' del juego. Le llegan al abrir o recargar el juego.';
        case 'jugador_estado':
            $estado = cc_post('estado');
            Control::cambiarEstado($id, $estado, cc_post('motivo'), $q);
            return 'La cuenta ahora está: ' . $estado . '.';
        case 'jugador_vip_pase':
            $dias = filter_var(cc_post('dias'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 365]]);
            Fallo::si($dias === false, 'Escribe un número de días entre 1 y 365.', 400);
            $hasta = Vip::pasePanel($id, (int) $dias, $q);
            return $dias === 0 ? 'Pase VIP desactivado.' : 'Pase VIP: +' . $dias . ($dias === 1 ? ' día' : ' días') . ', activo hasta ' . cc_fecha($hasta) . '. El juego lo ve al abrir o recargar.';
        case 'jugador_vip_nivel':
            if (cc_post('nivel') === 'real') return 'Nivel forzado quitado: vuelve al nivel real (VIP ' . Vip::forzarNivel($id, null, $q) . ').';
            $n = filter_var(cc_post('nivel'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => Vip::MAX]]);
            Fallo::si($n === false, 'Elige un nivel VIP del 1 al ' . Vip::MAX . '.', 400);
            return 'Nivel VIP forzado: VIP ' . Vip::forzarNivel($id, (int) $n, $q) . ' (solo pruebas). El juego lo ve al abrir o recargar.';
        case 'jugador_partida_restaurar':
            $hid = cc_post_int('historial_id');
            Fallo::si($hid <= 0, 'Falta la versión a restaurar.', 400);
            $r = Partidas::restaurar($id, $hid, $q);
            return 'Partida restaurada: la versión rev ' . $r['de_rev'] . ' es ahora la actual (rev ' . $r['rev'] . '). Cada aparato la carga al revisar la nube (al abrir, al volver a la pestaña o en un minuto).';
        case 'jugador_sesiones':
            return 'Se cerraron ' . Control::revocarSesiones($id, $q) . ' sesiones.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
