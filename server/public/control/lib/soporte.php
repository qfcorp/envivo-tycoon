<?php
declare(strict_types=1);

// Pestaña "Soporte" (server/SOPORTE.md, sección Centro de Control): bandeja de casos por estado y categoría (los que
// esperan respuesta primero), ficha con el jugador, la compra y el diagnóstico; responder con respuestas rápidas
// ({nombre}, {caso}, {compra}), cerrar y reabrir con Soporte.php (que audita), y editar las respuestas rápidas.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Catalogo, Control, Db, Fallo, Soporte};

const CC_SOPORTE_ESTADOS = ['pendientes' => 'Sin cerrar', 'abierto' => 'Abiertos', 'respondido' => 'Respondidos', 'cerrado' => 'Cerrados', 'todos' => 'Todos'];
const CC_SOPORTE_CATEGORIAS = ['' => 'Todas', 'pago' => 'Pago', 'cuenta' => 'Cuenta', 'error' => 'Error', 'sugerencia' => 'Sugerencia', 'reporte' => 'Reporte', 'otro' => 'Otro'];
const CC_SOPORTE_POR_PAGINA = 30;

function cc_soporte_disponible(): bool { return Control::tablas('soporte_casos', 'soporte_mensajes', 'soporte_respuestas'); }

/** SQL del autor del último mensaje de un caso (alias c). */
const CC_ULTIMO_AUTOR = '(SELECT autor FROM soporte_mensajes m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1)';

/** Por estado y cuántos esperan respuesta (último mensaje del jugador y sin cerrar). */
function cc_soporte_conteos(): array
{
    $o = ['abierto' => 0, 'respondido' => 0, 'cerrado' => 0];
    foreach (Db::todas('SELECT estado, COUNT(*) AS n FROM soporte_casos GROUP BY estado') as $f) $o[$f['estado']] = (int) $f['n'];
    $o['esperan_respuesta'] = (int) Db::valor("SELECT COUNT(*) FROM soporte_casos c WHERE c.estado <> 'cerrado' AND " . CC_ULTIMO_AUTOR . " = 'jugador'");
    return $o;
}

function cc_t_soporte(): string
{
    $h = '<h1>Soporte</h1>';
    if (!cc_soporte_disponible()) return $h . cc_no_disponible('Soporte', 'Faltan las tablas soporte_casos / soporte_mensajes / soporte_respuestas (ver SOPORTE.md).');
    $id = cc_get_int('caso');
    if ($id > 0) return cc_caso($id);
    $estado = cc_get('estado') ?: 'pendientes';
    if (!isset(CC_SOPORTE_ESTADOS[$estado])) $estado = 'pendientes';
    $cat = cc_get('cat');
    if (!isset(CC_SOPORTE_CATEGORIAS[$cat])) $cat = '';
    $buscar = cc_get('q');
    $con = cc_soporte_conteos();
    $h .= '<p class="tenue"><b>' . $con['esperan_respuesta'] . '</b> caso(s) esperan respuesta.</p><nav class="filtros">';
    foreach (CC_SOPORTE_ESTADOS as $k => $n) {
        $num = match ($k) { 'pendientes' => $con['abierto'] + $con['respondido'], 'todos' => null, default => $con[$k] };
        $h .= '<a href="' . e(cc_url(['t' => 'soporte', 'estado' => $k, 'cat' => $cat])) . '"' . ($k === $estado ? ' class="activo"' : '') . '>' . e($n) . ($num !== null ? ' (' . $num . ')' : '') . '</a>';
    }
    $h .= '</nav><nav class="filtros filtros-chicos">';
    foreach (CC_SOPORTE_CATEGORIAS as $k => $n) $h .= '<a href="' . e(cc_url(['t' => 'soporte', 'estado' => $estado, 'cat' => $k])) . '"' . ($k === $cat ? ' class="activo"' : '') . '>' . e($n) . '</a>';
    $h .= '</nav><form method="get" action="' . CC_RUTA . '" class="buscar" role="search"><input type="hidden" name="t" value="soporte"><input type="hidden" name="estado" value="' . e($estado) . '">'
        . '<input type="search" name="q" value="' . e($buscar) . '" placeholder="Asunto, correo, nombre o #caso" aria-label="Buscar casos"><button class="btn" type="submit">Buscar</button></form>';

    $w = []; $p = [];
    if ($estado === 'pendientes') $w[] = "c.estado <> 'cerrado'";
    elseif ($estado !== 'todos') { $w[] = 'c.estado = ?'; $p[] = $estado; }
    if ($cat !== '') { $w[] = 'c.categoria = ?'; $p[] = $cat; }
    if ($buscar !== '') {
        $l = '%' . addcslashes($buscar, '%_\\') . '%';
        $w[] = "(c.asunto LIKE ? ESCAPE '\\' OR j.email LIKE ? ESCAPE '\\' OR j.nombre LIKE ? ESCAPE '\\' OR c.id = ?)";
        array_push($p, $l, $l, $l, preg_match('/^#?(\d{1,12})$/', $buscar, $m) ? (int) $m[1] : -1);
    }
    $donde = $w ? ' WHERE ' . implode(' AND ', $w) : '';
    $total = (int) Db::valor('SELECT COUNT(*) FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id' . $donde, $p);
    $paginas = max(1, (int) ceil($total / CC_SOPORTE_POR_PAGINA));
    $pag = min(max(1, cc_get_int('p')), $paginas);
    $casos = Db::todas('SELECT c.*, j.nombre AS j_nombre, ' . CC_ULTIMO_AUTOR . ' AS ultimo_autor,
                               (SELECT texto FROM soporte_mensajes m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_texto,
                               (SELECT COUNT(*) FROM soporte_mensajes m WHERE m.caso_id = c.id) AS n_msg
                        FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id' . $donde . "
                        ORDER BY CASE WHEN c.estado <> 'cerrado' AND ultimo_autor = 'jugador' THEN 0 ELSE 1 END, c.actualizado DESC, c.id DESC
                        LIMIT " . CC_SOPORTE_POR_PAGINA . ' OFFSET ' . (($pag - 1) * CC_SOPORTE_POR_PAGINA), $p);
    if (!$casos) $h .= '<p class="tenue" id="sin-casos">No hay casos aquí.</p>';
    else {
        $h .= '<div class="casos" id="lista-casos">';
        foreach ($casos as $c) {
            $espera = $c['estado'] !== 'cerrado' && $c['ultimo_autor'] === 'jugador';
            $h .= '<a class="caso" href="' . e(cc_url(['t' => 'soporte', 'caso' => $c['id']])) . '"><div class="caso-cab"><b>#' . (int) $c['id'] . ' ' . e($c['asunto']) . '</b>'
                . ($espera ? cc_chip('espera respuesta', 'aviso') : cc_chip((string) $c['estado'], $c['estado'] === 'cerrado' ? '' : 'ok')) . '</div>'
                . '<div class="tenue">' . e(CC_SOPORTE_CATEGORIAS[$c['categoria']] ?? $c['categoria']) . ' · ' . e($c['j_nombre']) . ' · ' . e(cc_fecha($c['actualizado'])) . ' · ' . (int) $c['n_msg'] . ' mensajes</div>'
                . '<div class="caso-ultimo">' . e(mb_substr((string) $c['ultimo_texto'], 0, 140)) . '</div></a>';
        }
        $h .= '</div>';
        if ($paginas > 1) {
            $h .= '<nav class="filtros">';
            for ($i = 1; $i <= $paginas; $i++) $h .= '<a href="' . e(cc_url(['t' => 'soporte', 'estado' => $estado, 'cat' => $cat, 'q' => $buscar, 'p' => $i])) . '"' . ($i === $pag ? ' class="activo"' : '') . '>' . $i . '</a>';
            $h .= '</nav>';
        }
    }
    return $h . cc_respuestas_rapidas();
}

function cc_respuestas_rapidas(): string
{
    $h = '<section class="panel" id="respuestas-rapidas"><h2>Respuestas rápidas</h2><p class="tenue">Puedes usar {nombre}, {caso} y {compra}: se cambian por los datos del caso al responder.</p>';
    foreach (Db::todas('SELECT * FROM soporte_respuestas ORDER BY titulo COLLATE NOCASE, id') as $r) {
        $h .= '<details class="producto-cc"><summary><span class="p-nombre">' . e($r['titulo']) . '</span></summary>'
            . cc_form('rapida_guardar', ['rapida_id' => $r['id']], 'form')
            . '<label>Título<input name="titulo" required maxlength="' . Control::RAPIDA_TITULO . '" value="' . e($r['titulo']) . '"></label>'
            . '<label>Texto<textarea name="texto" required maxlength="' . Soporte::MAX_TEXTO . '" rows="3">' . e($r['texto']) . '</textarea></label>'
            . '<div class="botones"><button class="btn" type="submit">Guardar</button></div></form>'
            . cc_boton('rapida_borrar', ['rapida_id' => $r['id']], 'Borrar', 'btn btn-chico btn-peligro', '¿Borrar esta respuesta rápida?') . '</details>';
    }
    return $h . cc_form('rapida_guardar', [], 'form') . '<h3>Nueva</h3><label>Título<input name="titulo" required maxlength="' . Control::RAPIDA_TITULO . '"></label>'
        . '<label>Texto<textarea name="texto" required maxlength="' . Soporte::MAX_TEXTO . '" rows="3"></textarea></label><div class="botones"><button class="btn" type="submit">Agregar</button></div></form></section>';
}

function cc_caso(int $id): string
{
    $h = '<p><a href="' . e(cc_url(['t' => 'soporte'])) . '">← Bandeja</a></p>';
    $c = Db::fila('SELECT c.*, j.email, j.nombre, j.estado AS j_estado, j.creditos - j.deuda AS j_saldo FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id WHERE c.id = ?', [$id]);
    if (!$c) return $h . cc_no_disponible('Caso #' . $id, 'No existe.');
    $j = (int) $c['jugador_id'];
    $pagadas = (int) Db::valor("SELECT COUNT(*) FROM compras WHERE jugador_id = ? AND estado = 'pagado'", [$j]);
    $otros = (int) Db::valor('SELECT COUNT(*) FROM soporte_casos WHERE jugador_id = ? AND id <> ?', [$j, $id]);
    $h .= '<h1 id="caso">#' . $id . ' ' . e($c['asunto']) . ' ' . cc_chip((string) $c['estado']) . '</h1>'
        . '<p class="tenue">' . e(CC_SOPORTE_CATEGORIAS[$c['categoria']] ?? $c['categoria']) . ' · creado ' . e(cc_fecha($c['creado'])) . ' · '
        . '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $j])) . '">' . e($c['nombre'] . ' · ' . $c['email']) . '</a> · ' . cc_estado_cuenta((string) $c['j_estado']) . ' · ' . cc_num($c['j_saldo']) . ' créditos'
        . ' · ' . $pagadas . ' compras pagadas · ' . $otros . ' otros casos</p>';
    $delCaso = $c['compra_id'] ? Db::fila('SELECT * FROM compras WHERE id = ? AND jugador_id = ?', [$c['compra_id'], $j]) : null;
    $ultima = Db::fila('SELECT * FROM compras WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$j]);
    foreach (['Compra del caso' => $delCaso, 'Última compra' => ($ultima && (!$delCaso || (int) $ultima['id'] !== (int) $delCaso['id'])) ? $ultima : null] as $t => $x) {
        if (!$x) continue;
        $h .= '<p>' . $t . ': <a href="' . e(cc_url(['t' => 'compras', 'id' => $x['id']])) . '">N° ' . (int) $x['id'] . '</a> · ' . e(Catalogo::productoCompra((string) $x['producto'])['nombre'] ?? $x['producto'])
            . ' · ' . cc_dinero($x['total']) . ' · ' . cc_estado_compra((string) $x['estado']) . '</p>';
    }
    $diag = $c['diagnostico_json'] ? json_decode((string) $c['diagnostico_json'], true) : null;
    if (is_array($diag)) {
        $h .= '<details class="panel"><summary>Diagnóstico del juego</summary><dl class="datos">';
        foreach ($diag as $k => $v) $h .= '<dt>' . e((string) $k) . '</dt><dd>' . e(is_scalar($v) ? (string) $v : json_encode($v, JSON_UNESCAPED_UNICODE)) . '</dd>';
        $h .= '</dl></details>';
    }
    $h .= '<section class="hilo" id="hilo">';
    foreach (Db::todas('SELECT * FROM soporte_mensajes WHERE caso_id = ? ORDER BY id', [$id]) as $m) {
        $h .= '<div class="burbuja burbuja-' . e($m['autor']) . '"><div class="tenue">' . ($m['autor'] === 'soporte' ? 'Soporte' : e($c['nombre'])) . ' · ' . e(cc_fecha($m['creado']))
            . ($m['autor'] === 'soporte' && (int) $m['leido'] ? ' · leído' : '') . '</div><div class="burbuja-txt">' . nl2br(e($m['texto'])) . '</div></div>';
    }
    $h .= '</section><section class="panel">' . cc_form('soporte_responder', ['caso_id' => $id], 'form') . '<h2>Responder</h2>';
    $rapidas = Db::todas('SELECT * FROM soporte_respuestas ORDER BY titulo COLLATE NOCASE, id');
    if ($rapidas) {
        $h .= '<div class="rapidas">';
        foreach ($rapidas as $r) $h .= '<button type="button" class="btn btn-chico btn-sec" data-rapida="' . e(Control::plantilla((string) $r['texto'], $id)) . '">' . e($r['titulo']) . '</button>';
        $h .= '</div>';
    }
    $h .= '<label>Mensaje para el jugador<textarea name="mensaje" id="respuesta" required maxlength="' . Soporte::MAX_TEXTO . '" rows="5"></textarea></label>'
        . '<label class="check"><input type="checkbox" name="cerrar" value="1"> Cerrar el caso después de responder</label><div class="botones"><button class="btn" type="submit">Enviar respuesta</button></div></form>';
    $h .= '<div class="acciones">' . ($c['estado'] !== 'cerrado' ? cc_boton('soporte_cerrar', ['caso_id' => $id], 'Cerrar caso', 'btn btn-sec') : cc_boton('soporte_reabrir', ['caso_id' => $id], 'Reabrir caso', 'btn btn-sec')) . '</div></section>';
    return $h;
}

function cc_a_soporte(string $accion, string $q): string
{
    if (!cc_soporte_disponible()) throw new Fallo('El soporte aún no está disponible.', 409);
    $id = cc_post_int('caso_id');
    switch ($accion) {
        case 'soporte_responder':
            $cerrar = cc_post('cerrar') === '1';
            Control::responderCaso($id, str_replace("\r\n", "\n", cc_post('mensaje')), $q, $cerrar);
            return 'Respuesta enviada' . ($cerrar ? ' y caso cerrado.' : '.');
        case 'soporte_cerrar':
            Control::estadoCaso($id, 'cerrado', $q);
            return 'Caso #' . $id . ' cerrado.';
        case 'soporte_reabrir':
            Control::estadoCaso($id, 'abierto', $q);
            return 'Caso #' . $id . ' abierto otra vez.';
        case 'rapida_guardar':
            $rid = cc_post_int('rapida_id');
            return 'Respuesta rápida "' . Control::guardarRespuesta($rid > 0 ? $rid : null, cc_post('titulo'), str_replace("\r\n", "\n", cc_post('texto')), $q) . '" guardada.';
        case 'rapida_borrar':
            Control::borrarRespuesta(cc_post_int('rapida_id'), $q);
            return 'Respuesta rápida borrada.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
