<?php
declare(strict_types=1);

// Pestaña "Chat y reportes": cola de reportes, mensajes recientes, ocultar/mostrar, silenciar 1 h / 24 h / 7 días,
// expulsar del chat, levantar sanciones y la lista de palabras prohibidas.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Chat, Control, Db, Fallo};

function cc_nombre_pub(array $f): string
{
    $alias = $f['alias'] ?? null;
    return $alias !== null && $alias !== '' ? (string) $alias : (string) ($f['nombre'] ?? '—');
}

function cc_acciones_autor(int $jugador, int $mensaje = 0): string
{
    $h = '';
    foreach (['1h' => '1 h', '24h' => '24 h', '7d' => '7 días'] as $k => $n) $h .= cc_boton('chat_silenciar', ['jugador_id' => $jugador, 'duracion' => $k, 'mensaje_id' => $mensaje], 'Silenciar ' . $n, 'btn btn-chico btn-sec');
    return $h . cc_boton('chat_expulsar', ['jugador_id' => $jugador, 'mensaje_id' => $mensaje], 'Expulsar del chat', 'btn btn-chico btn-peligro', '¿Expulsar del chat a este jugador (sin fecha de fin)?');
}

function cc_t_chat(): string
{
    $h = '<h1>Chat y reportes</h1>';
    if (!Control::tablas('chat_mensajes', 'chat_reportes', 'chat_sanciones')) return $h . cc_no_disponible('Chat', 'Faltan las tablas chat_mensajes / chat_reportes / chat_sanciones.');
    $alias = Control::columna('jugadores', 'alias') ? 'j.alias' : 'NULL AS alias';

    $rep = Db::todas("SELECT m.id AS mensaje_id, m.texto, m.canal, m.creado, m.oculto, m.jugador_id, j.email, j.nombre, $alias, COUNT(r.id) AS n, GROUP_CONCAT(r.motivo, ' · ') AS motivos
                      FROM chat_reportes r JOIN chat_mensajes m ON m.id = r.mensaje_id LEFT JOIN jugadores j ON j.id = m.jugador_id
                      WHERE r.estado = 'pendiente' GROUP BY m.id ORDER BY COUNT(r.id) DESC, MIN(r.id) LIMIT 100");
    $h .= '<section class="panel"><h2>Reportes pendientes (' . count($rep) . ')</h2>';
    if (!$rep) $h .= '<p class="tenue" id="sin-reportes">No hay reportes pendientes.</p>';
    foreach ($rep as $r) {
        $h .= '<article class="reporte" id="reporte-' . (int) $r['mensaje_id'] . '"><p class="msg">' . ((int) $r['oculto'] ? cc_chip('oculto', 'mal') . ' ' : '') . e($r['texto']) . '</p>'
            . '<p class="tenue">N° ' . (int) $r['mensaje_id'] . ' · ' . e(cc_fecha($r['creado'])) . ' · ' . e($r['canal']) . ' · de <a href="' . e(cc_url(['t' => 'jugadores', 'id' => $r['jugador_id']])) . '">' . e(cc_nombre_pub($r)) . '</a></p>'
            . '<p><b>' . (int) $r['n'] . ' reporte(s):</b> ' . e($r['motivos']) . '</p><div class="acciones">'
            . ((int) $r['oculto'] ? cc_boton('chat_mostrar', ['mensaje_id' => $r['mensaje_id']], 'Mostrar otra vez', 'btn btn-chico btn-sec') . cc_boton('chat_resolver', ['mensaje_id' => $r['mensaje_id']], 'Dejar oculto y cerrar', 'btn btn-chico')
                : cc_boton('chat_ocultar', ['mensaje_id' => $r['mensaje_id']], 'Ocultar', 'btn btn-chico') . cc_boton('chat_descartar', ['mensaje_id' => $r['mensaje_id']], 'Descartar reportes', 'btn btn-chico btn-sec'))
            . ($r['jugador_id'] ? cc_acciones_autor((int) $r['jugador_id'], (int) $r['mensaje_id']) : '') . '</div></article>';
    }
    $h .= '</section>';

    $san = Db::todas("SELECT s.*, j.email, j.nombre, $alias FROM chat_sanciones s JOIN jugadores j ON j.id = s.jugador_id WHERE s.levantada = 0 AND (s.hasta IS NULL OR s.hasta > ?) ORDER BY s.id DESC LIMIT 100", [time()]);
    $h .= '<section class="panel"><h2>Sanciones vigentes del chat</h2>' . cc_tabla(['Jugador', 'Tipo', 'Hasta', 'Motivo', ''], array_map(fn($s) => [
        '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $s['jugador_id']])) . '">' . e(cc_nombre_pub($s)) . '</a>', e($s['tipo']), e($s['hasta'] === null ? 'sin fin' : cc_fecha($s['hasta'])), e($s['motivo']),
        cc_boton('chat_levantar', ['jugador_id' => $s['jugador_id']], 'Levantar', 'btn btn-chico btn-sec')], $san), 'Nadie está sancionado.', 'tabla-sanciones-chat') . '</section>';

    $q = cc_get('q');
    $sql = "SELECT m.*, j.email, j.nombre, $alias FROM chat_mensajes m LEFT JOIN jugadores j ON j.id = m.jugador_id WHERE m.jugador_id IS NOT NULL";
    $p = [];
    if ($q !== '') { $sql .= " AND m.texto LIKE ? ESCAPE '\\'"; $p[] = '%' . addcslashes($q, '%_\\') . '%'; }
    $ult = Db::todas($sql . ' ORDER BY m.id DESC LIMIT 50', $p);
    $h .= '<section class="panel"><h2>Mensajes recientes</h2><form method="get" action="' . CC_RUTA . '" class="buscar"><input type="hidden" name="t" value="chat">'
        . '<input type="search" name="q" value="' . e($q) . '" placeholder="Buscar en el texto" aria-label="Buscar mensajes"><button class="btn" type="submit">Buscar</button></form>';
    $h .= cc_tabla(['Mensaje', 'Autor', ''], array_map(fn($m) => [
        '<span class="largo">' . ((int) $m['oculto'] ? cc_chip('oculto', 'mal') . ' ' : '') . e($m['texto']) . '</span><br><span class="tenue">N° ' . (int) $m['id'] . ' · ' . e(cc_fecha($m['creado'])) . ' · ' . e($m['canal']) . '</span>',
        '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $m['jugador_id']])) . '">' . e(cc_nombre_pub($m)) . '</a>',
        '<div class="acciones">' . ((int) $m['oculto'] ? cc_boton('chat_mostrar', ['mensaje_id' => $m['id']], 'Mostrar', 'btn btn-chico btn-sec') : cc_boton('chat_ocultar', ['mensaje_id' => $m['id']], 'Ocultar', 'btn btn-chico'))
        . cc_boton('chat_silenciar', ['jugador_id' => $m['jugador_id'], 'duracion' => '24h', 'mensaje_id' => $m['id']], 'Silenciar 24 h', 'btn btn-chico btn-sec') . '</div>'], $ult), 'Sin mensajes.', 'tabla-mensajes') . '</section>';

    if (Control::tabla('chat_palabras')) {
        $pal = array_column(Db::todas('SELECT palabra FROM chat_palabras ORDER BY palabra'), 'palabra');
        $h .= '<section class="panel"><h2>Palabras prohibidas (' . count($pal) . ')</h2><p class="tenue">Se buscan sin tildes ni mayúsculas, con letras repetidas o cambiadas por números, y en plural.</p>'
            . cc_form('palabra_agregar', [], 'buscar') . '<input name="palabra" required maxlength="40" placeholder="Nueva palabra" aria-label="Nueva palabra"><button class="btn" type="submit">Agregar</button></form><div class="palabras" id="lista-palabras">';
        foreach ($pal as $w) $h .= '<span class="palabra">' . e($w) . cc_boton('palabra_quitar', ['palabra' => $w], '×', 'quitar') . '</span>';
        $h .= '</div></section>';
    } else {
        $h .= '<section class="panel"><h2>Palabras prohibidas</h2>' . cc_no_disponible('Lista de palabras', 'Falta la tabla chat_palabras.') . '</section>';
    }
    return $h;
}

function cc_a_chat(string $accion, string $q): string
{
    if (!Control::tablas('chat_mensajes', 'chat_reportes', 'chat_sanciones')) throw new Fallo('El chat aún no está disponible.', 409);
    if ($accion === 'palabra_agregar' || $accion === 'palabra_quitar') {
        Fallo::si(!Control::tabla('chat_palabras'), 'La lista de palabras aún no está disponible.', 409);
        $w = Control::palabra(cc_post('palabra'), $accion === 'palabra_agregar', $q);
        return $accion === 'palabra_agregar' ? '"' . $w . '" agregada a la lista.' : '"' . $w . '" quitada de la lista.';
    }
    if (in_array($accion, ['chat_ocultar', 'chat_mostrar', 'chat_resolver', 'chat_descartar'], true)) {
        $id = cc_post_int('mensaje_id');
        Control::moderarMensaje($id, substr($accion, 5), $q);
        return ['chat_ocultar' => 'Mensaje N° ' . $id . ' oculto.', 'chat_mostrar' => 'Mensaje N° ' . $id . ' visible otra vez.', 'chat_resolver' => 'Reportes cerrados; el mensaje sigue oculto.', 'chat_descartar' => 'Reportes descartados.'][$accion];
    }
    $j = cc_post_int('jugador_id');
    $mensaje = cc_post_int('mensaje_id');
    $motivo = $mensaje ? 'Mensaje N° ' . $mensaje . ' del chat' : 'Incumplir las reglas del chat';
    switch ($accion) {
        case 'chat_silenciar':
            $d = cc_post('duracion');
            Control::sancionChat($j, $d, $motivo, $q);
            if ($mensaje && Db::valor('SELECT 1 FROM chat_mensajes WHERE id = ?', [$mensaje])) Control::moderarMensaje($mensaje, 'resolver', $q);
            return 'Jugador N° ' . $j . ' silenciado por ' . (['1h' => '1 hora', '24h' => '24 horas', '7d' => '7 días'][$d] ?? $d) . '.';
        case 'chat_expulsar':
            Control::sancionChat($j, null, $motivo, $q);
            if ($mensaje && Db::valor('SELECT 1 FROM chat_mensajes WHERE id = ?', [$mensaje])) Control::moderarMensaje($mensaje, 'resolver', $q);
            return 'Jugador N° ' . $j . ' expulsado del chat.';
        case 'chat_levantar':
            return 'Se levantaron ' . Control::levantarChat($j, $q) . ' sanciones del chat.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
