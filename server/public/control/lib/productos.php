<?php
declare(strict_types=1);

// Pestaña "Productos y precios": las mismas tablas que lee la tienda (Catalogo::producto): productos_ajustes (precio,
// créditos, activo) y ofertas (% extra de créditos por tiempo limitado). Los exclusivos con créditos se muestran tal como
// están en Catalogo.php (todavía no se pueden cambiar desde la base: ver docs/INTEGRAR_CONTROL.md).
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Auditoria, Catalogo, Control, Db, Fallo};

function cc_t_productos(): string
{
    $h = '<h1>Productos y precios</h1><p class="tenue">Precios finales con IVA 15 % incluido. Los cambios mandan sobre <code>Catalogo.php</code> y la tienda los usa al instante. '
       . 'Las compras ya hechas guardan su propio valor.</p>';
    $aj = Catalogo::ajustes();
    $h .= '<h2>Con dinero real</h2><div class="productos">';
    foreach (Catalogo::PRODUCTOS as $id => $base) {
        if (!empty($base['oculto'])) continue;
        $p = Catalogo::producto($id);
        $cambiado = isset($aj[$id]);
        $h .= '<details class="producto-cc" id="prod-' . e($id) . '"><summary><span class="p-nombre">' . e($p['nombre']) . ' <span class="tenue">' . e($id) . '</span></span><span class="p-valores">'
            . '<b>' . cc_dinero($p['precio']) . '</b> · ' . cc_num(Control::creditosSinOferta($p)) . ' créditos'
            . (!$p['activo'] ? ' ' . cc_chip('apagado', 'mal') : '') . ($p['oferta'] ? ' ' . cc_chip('oferta +' . $p['bono_pct'] . ' %', 'vip') : '')
            . ($cambiado ? ' ' . cc_chip('cambiado', 'aviso') : '') . '</span></summary>'
            . cc_form('producto_guardar', ['producto' => $id], 'form form-producto')
            . '<label>Precio con IVA (Catalogo: ' . cc_dinero($base['precio']) . ')<input name="precio" inputmode="decimal" required value="' . e(number_format((float) $p['precio'], 2, '.', '')) . '"></label>'
            . '<label>Créditos que da (Catalogo: ' . cc_num($base['creditos']) . ')<input name="creditos" inputmode="numeric" required value="' . Control::creditosSinOferta($p) . '"></label>'
            . '<label class="check"><input type="checkbox" name="activo" value="1"' . ($p['activo'] ? ' checked' : '') . '> Activo (se vende en la tienda)</label>'
            . '<div class="botones"><button class="btn" type="submit">Guardar</button></div></form>'
            . ($cambiado ? cc_boton('producto_restaurar', ['producto' => $id], 'Volver a los valores de Catalogo.php', 'btn btn-sec', '¿Borrar los cambios de este producto?') : '')
            . '</details>';
    }
    $h .= '</div>';

    // Ofertas
    $conCreditos = [];
    foreach (Catalogo::PRODUCTOS as $id => $base) if (empty($base['oculto']) && (int) $base['creditos'] > 0) $conCreditos[$id] = $base['nombre'];
    $of = Db::todas('SELECT * FROM ofertas WHERE activa = 1 AND fin > ? ORDER BY inicio, id', [time()]);
    $h .= '<section class="panel" id="ofertas"><h2>Ofertas por tiempo limitado</h2><p class="tenue">Dan un % extra de créditos en la compra. Si hay varias a la vez para el mismo producto, vale la de mayor bono.</p>'
        . cc_tabla(['N°', 'Producto', 'Bono', 'Desde', 'Hasta', ''], array_map(fn($o) => [(int) $o['id'], e($conCreditos[$o['producto']] ?? $o['producto']), '+' . (int) $o['bono_pct'] . ' %',
            e(cc_fecha($o['inicio'])), e(cc_fecha($o['fin'])) . ((int) $o['inicio'] <= time() ? ' ' . cc_chip('vigente', 'ok') : ' ' . cc_chip('programada', 'aviso')),
            cc_boton('oferta_terminar', ['oferta_id' => $o['id']], 'Terminar', 'btn btn-chico btn-sec', '¿Terminar esta oferta ahora?')], $of), 'No hay ofertas vigentes ni programadas.', 'tabla-ofertas')
        . cc_form('oferta_crear', [], 'form form-producto')
        . '<label>Producto<select name="producto">' . cc_opciones($conCreditos, '') . '</select></label>'
        . '<label>Bono de créditos (%)<input name="bono_pct" inputmode="numeric" required placeholder="20"></label>'
        . '<label>Desde (vacío = ahora)<input type="datetime-local" name="inicio"></label>'
        . '<label>Hasta<input type="datetime-local" name="fin" required></label>'
        . '<div class="botones"><button class="btn" type="submit">Crear oferta</button></div></form></section>';

    // Exclusivos con créditos (solo lectura)
    $h .= '<section class="panel"><h2>Exclusivos con créditos</h2><p class="tenue">Por ahora se cambian en <code>Catalogo.php</code> (PREMIUM).</p>'
        . cc_tabla(['Id', 'Nombre', 'Cuesta', 'Tipo'], array_map(fn($id, $x) => [e($id), e($x['nombre']), cc_num($x['creditos']) . ' créditos',
            e($x['tipo'] ?? ($x['entrega']['tipo'] === 'item' ? (!empty($x['vip']) ? 'equipo VIP' : 'equipo') : 'consumo'))], array_keys(Catalogo::PREMIUM), Catalogo::PREMIUM), '', 'tabla-premium') . '</section>';

    $aud = Db::todas("SELECT * FROM auditoria WHERE accion IN ('producto_editar', 'producto_restaurar', 'oferta_crear', 'oferta_terminar') ORDER BY id DESC LIMIT 20");
    $h .= '<section class="panel"><h2>Últimos cambios</h2>' . cc_tabla(['Fecha', 'Quién', 'Acción', 'Detalle'], array_map(fn($a) => [e(cc_fecha($a['creado'])), e($a['quien']), e($a['accion']),
        '<span class="largo">' . e($a['detalle']) . '</span>'], $aud), 'Sin cambios todavía.') . '</section>';
    return $h;
}

/** "2026-10-23T18:30" (hora del juego) -> segundos Unix, o null si viene vacío. */
function cc_fecha_local(string $v): ?int
{
    if ($v === '') return null;
    $d = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $v, new \DateTimeZone(date_default_timezone_get()));
    Fallo::si(!$d, 'Revisa la fecha (' . $v . ').', 400);
    return $d->getTimestamp();
}

function cc_a_productos(string $accion, string $q): string
{
    switch ($accion) {
        case 'producto_guardar':
            $id = cc_post('producto');
            Control::guardarProducto($id, cc_post('precio'), cc_post('creditos'), cc_post('activo') === '1', $q);
            return Catalogo::producto($id)['nombre'] . ' guardado.';
        case 'producto_restaurar':
            return Control::restaurarProducto(cc_post('producto'), $q) ? 'Valores de Catalogo.php restaurados.' : 'Ese producto no tenía cambios.';
        case 'oferta_crear':
            $fin = cc_fecha_local(cc_post('fin'));
            Fallo::si($fin === null, 'Elige hasta cuándo dura la oferta.', 400);
            $id = Control::crearOferta(cc_post('producto'), cc_post_int('bono_pct'), cc_fecha_local(cc_post('inicio')) ?? time(), $fin, $q);
            return 'Oferta N° ' . $id . ' creada.';
        case 'oferta_terminar':
            Control::terminarOferta(cc_post_int('oferta_id'), $q);
            return 'Oferta terminada.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
