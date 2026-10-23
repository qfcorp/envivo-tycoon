<?php
declare(strict_types=1);

// Pestaña "Mercado": publicaciones, ventas, créditos quemados por comisión; congelar / reactivar / quitar una publicación.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Catalogo, Control, Db, Fallo, Mercado};

const CC_ESTADOS_PUB = ['activa' => 'Activas', 'congelada' => 'Congeladas', 'vendida' => 'Vendidas', 'retirada' => 'Retiradas', 'vencida' => 'Vencidas', 'quitada' => 'Quitadas', 'todas' => 'Todas'];

function cc_t_mercado(): string
{
    $h = '<h1>Mercado entre jugadores</h1>';
    if (!Control::tablas('mercado_publicaciones', 'inventario')) return $h . cc_no_disponible('Mercado', 'Faltan las tablas mercado_publicaciones / inventario.');
    $mes = strtotime(date('Y-m-01 00:00:00'));
    $tot = Db::fila("SELECT COUNT(*) AS n, COALESCE(SUM(precio), 0) AS mov, COALESCE(SUM(comision), 0) AS quem FROM mercado_publicaciones WHERE estado = 'vendida'");
    $quemMes = (int) Db::valor("SELECT COALESCE(SUM(comision), 0) FROM mercado_publicaciones WHERE estado = 'vendida' AND cerrado >= ?", [$mes]);
    $activas = (int) Db::valor("SELECT COUNT(*) FROM mercado_publicaciones WHERE estado = 'activa'");
    $congeladas = (int) Db::valor("SELECT COUNT(*) FROM mercado_publicaciones WHERE estado = 'congelada'");
    $h .= '<div class="kpis kpis-chicos">' . cc_tarjeta('Ventas', cc_num($tot['n']), cc_num($tot['mov']) . ' créditos movidos', 'kpi-mercado-ventas')
        . cc_tarjeta('Quemados por comisión', cc_num($tot['quem']), 'este mes: ' . cc_num($quemMes), 'kpi-mercado-quemados')
        . cc_tarjeta('Activas', cc_num($activas), $congeladas . ' congeladas · comisión ' . (Catalogo::MERCADO_COMISION * 100) . ' %') . '</div>';

    $estado = cc_get('estado') ?: 'activa';
    if (!isset(CC_ESTADOS_PUB[$estado])) $estado = 'activa';
    $h .= '<nav class="filtros">';
    foreach (CC_ESTADOS_PUB as $k => $n) $h .= '<a href="' . e(cc_url(['t' => 'mercado', 'estado' => $k])) . '"' . ($k === $estado ? ' class="activo"' : '') . '>' . e($n) . '</a>';
    $h .= '</nav>';
    $filas = Db::todas('SELECT p.*, jv.email AS v_email, jv.nombre AS v_nombre, jc.email AS c_email, jc.nombre AS c_nombre FROM mercado_publicaciones p
                        LEFT JOIN jugadores jv ON jv.id = p.vendedor_id LEFT JOIN jugadores jc ON jc.id = p.comprador_id'
                        . ($estado !== 'todas' ? ' WHERE p.estado = ?' : '') . ' ORDER BY COALESCE(p.cerrado, p.publicado) DESC, p.id DESC LIMIT 200', $estado !== 'todas' ? [$estado] : []);
    $h .= cc_tabla(['N°', 'Equipo', 'Precio', 'Vendedor', 'Comprador', 'Estado', 'Fecha', ''], array_map(function ($p) {
        $acc = '';
        if ($p['estado'] === 'activa') $acc .= cc_boton('mercado_congelar', ['publicacion_id' => $p['id']], 'Congelar', 'btn btn-chico btn-sec');
        if ($p['estado'] === 'congelada') $acc .= cc_boton('mercado_descongelar', ['publicacion_id' => $p['id']], 'Reactivar', 'btn btn-chico btn-sec');
        if (in_array($p['estado'], ['activa', 'congelada'], true)) $acc .= cc_boton('mercado_quitar', ['publicacion_id' => $p['id']], 'Quitar', 'btn btn-chico btn-peligro', '¿Quitar la publicación? El equipo vuelve a la bodega del vendedor.');
        return [(int) $p['id'], e(Catalogo::nombreEquipo((string) $p['item'])) . ' <span class="tenue">#' . sprintf('%04d', (int) $p['serie']) . '</span>',
            cc_num($p['precio']) . ($p['comision'] !== null ? '<br><span class="tenue">comisión ' . cc_num($p['comision']) . '</span>' : ''),
            $p['vendedor_id'] ? '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $p['vendedor_id']])) . '">' . e($p['v_nombre']) . '</a>' : '—',
            $p['comprador_id'] ? '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $p['comprador_id']])) . '">' . e($p['c_nombre']) . '</a>' : '—',
            cc_chip((string) $p['estado'], ['activa' => 'ok', 'congelada' => 'aviso', 'vendida' => 'vip', 'quitada' => 'mal'][$p['estado']] ?? ''),
            e(cc_fecha($p['cerrado'] ?? $p['publicado'])), '<div class="acciones">' . $acc . '</div>'];
    }, $filas), 'No hay publicaciones en este estado.', 'tabla-mercado');
    return $h;
}

function cc_a_mercado(string $accion, string $q): string
{
    if (!Control::tablas('mercado_publicaciones', 'inventario')) throw new Fallo('El mercado aún no está disponible.', 409);
    $acc = substr($accion, strlen('mercado_'));
    Fallo::si(!in_array($acc, ['congelar', 'descongelar', 'quitar'], true), 'Acción desconocida.', 400);
    $id = cc_post_int('publicacion_id');
    $estado = Mercado::moderar($id, $acc, $q);   // audita (auditoria: mercado_<acción>)
    return 'Publicación N° ' . $id . ': ahora está ' . $estado . ($acc === 'quitar' ? ' (el equipo volvió a la bodega del vendedor).' : '.');
}
