<?php
declare(strict_types=1);

// Bloque "Avisos por etapa y regreso" del Centro de Control (va en la pestaña Notificaciones, src/Regreso.php):
// cuántos avisos y correos salieron en 30 días por tipo, cuántos jugadores volvieron después, ausencias (fuera ahora,
// volvieron, recibieron el regalo, compraron la oferta), bajas del correo, y un interruptor por tipo (POST con CSRF;
// Regreso::guardarInterruptores deja una línea de auditoría "regreso_interruptores").
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Fallo, Regreso};

function cc_regreso_panel(): string
{
    if (!class_exists(Regreso::class)) return '';
    try {
        $s = Regreso::estadisticas(30);
    } catch (\Throwable $e) {
        error_log('EN VIVO control regreso: ' . $e->getMessage());
        return '<section class="panel" id="panel-regreso"><div class="vacio">No se pudieron leer los avisos de regreso (¿falta la migración regreso.sql?).</div></section>';
    }
    $a = $s['ausencias'];
    $pct = fn(int $v, int $n) => $n > 0 ? round($v * 100 / $n) . ' %' : '—';
    $h = '<section class="panel" id="panel-regreso"><h2>Avisos por etapa y regreso (30 días)</h2>'
       . '<p class="tenue">Push del día 1, 2 y 3, Liga y Duelos a 2 h del cierre, 3/7/14 días sin entrar, un correo a los 7 días y la pantalla «¡Volviste!» '
       . '(regalo que crece con los días fuera, 3 días de ventaja y una oferta de una sola vez). Máximo ' . \EnVivo\Push::TOPE_REGRESO . ' avisos al día, nunca de noche en la hora del jugador. '
       . '«Volvieron» = el jugador entró dentro de las 72 h siguientes al aviso (o cerró su ausencia, en el correo).</p>';
    $h .= '<div class="kpis kpis-chicos">'
        . cc_tarjeta('Fuera ahora (7+ días)', cc_num($a['fuera_ahora']), cc_num($a['detectadas']) . ' ausencias nuevas', 'kpi-regreso-fuera')
        . cc_tarjeta('Volvieron', cc_num($a['volvieron']), cc_num($a['reclamaron']) . ' recibieron el regalo', 'kpi-regreso-volvieron')
        . cc_tarjeta('Ofertas de regreso', cc_num($a['ofertas_compradas']) . ' / ' . cc_num($a['ofertas']), 'compradas / mostradas', 'kpi-regreso-ofertas')
        . cc_tarjeta('Bajas del correo', cc_num($s['bajas_correo']), cc_num($s['zonas']) . ' jugadores con su zona horaria', 'kpi-regreso-bajas')
        . '</div>';
    $filas = [];
    foreach ($s['tipos'] as $k => $t) {
        $env = (int) $t['enviados'];
        $filas[] = [e($t['nombre']), $t['activo'] ? cc_chip('encendido', 'ok') : cc_chip('apagado', 'mal'),
            in_array($k, ['volviste', 'oferta'], true) ? '<span class="tenue">' . ($k === 'volviste' ? 'recibidos: ' : 'mostradas: ') . '</span>' . cc_num($env) : cc_num($env),
            cc_num((int) $t['en_cola']), cc_num((int) $t['descartados']),
            cc_num((int) $t['volvieron']) . ' <span class="tenue">(' . $pct((int) $t['volvieron'], $env) . ($k === 'oferta' ? ' compraron' : '') . ')</span>'];
    }
    $h .= cc_tabla(['Tipo', 'Estado', 'Enviados', 'En cola', 'Descartados', 'Volvieron'], $filas, 'Sin datos.', 'tabla-regreso');
    // Interruptores
    $h .= '<h3>Encender o apagar cada tipo</h3>' . cc_form('regreso_guardar', [], 'form form-producto', '¿Guardar qué avisos de regreso quedan encendidos?');
    foreach ($s['tipos'] as $k => $t) {
        $h .= '<label class="check"><input type="checkbox" name="on_' . e($k) . '" value="1"' . ($t['activo'] ? ' checked' : '') . '> ' . e($t['nombre']) . '</label>';
    }
    $h .= '<div class="botones"><button class="btn" type="submit">Guardar</button></div></form>';
    // Últimos
    $h .= '<h3>Últimos avisos</h3>' . cc_tabla(['Fecha', 'Jugador', 'Tipo', 'Canal', 'Estado', 'Volvió'], array_map(fn($f) => [
        e(cc_fecha($f['creado'])),
        '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $f['jugador_id']])) . '">' . e($f['alias'] ?: $f['nombre'] ?: '#' . $f['jugador_id']) . '</a>',
        e(Regreso::TIPOS[$f['tipo']] ?? $f['tipo']), e($f['canal']),
        $f['estado'] === 'enviado' ? cc_chip('enviado', 'ok') : ($f['estado'] === 'cola' ? cc_chip('en cola', 'aviso') : cc_chip('descartado', '')),
        $f['volvio'] ? e(cc_fecha($f['volvio'])) : '<span class="tenue">—</span>',
    ], $s['recientes']), 'Todavía no salió ningún aviso de regreso.', 'tabla-regreso-recientes');
    return $h . '</section>';
}

function cc_a_regreso(string $accion, string $q): string
{
    if ($accion !== 'regreso_guardar') throw new Fallo('Acción desconocida.', 400);
    $in = [];
    foreach (Regreso::TIPOS as $k => $_) $in[$k] = cc_post('on_' . $k) === '1';
    $r = Regreso::guardarInterruptores($in, $q);
    $apagados = array_keys(array_filter($r, fn($v) => !$v));
    return 'Avisos de regreso guardados: ' . (count($r) - count($apagados)) . ' encendidos' . ($apagados ? ', apagados: ' . implode(', ', $apagados) : '') . '.';
}
