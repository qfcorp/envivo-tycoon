<?php
declare(strict_types=1);

// Pestaña "Notificaciones" (server/INTEGRAR_PUSH.md): estado de las llaves VAPID, jugadores y aparatos suscritos,
// enviados / fallos / suscripciones muertas, interruptores encendidos por categoría, motivos de descarte, últimos envíos
// y un formulario para mandar una notificación de PRUEBA a un jugador (sin horario ni tope; queda en la auditoría).
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Auditoria, Db, Fallo, Push};

const CC_PUSH_CATS = ['obra' => 'Obra / sede terminada', 'copa' => 'Copa / batalla', 'premio' => 'Premio diario (y recordatorios)',
    'buzon' => 'Mensaje en el buzón', 'duelo' => 'Liga y duelos', 'ofertas' => 'Ofertas', 'recordatorio' => 'Recordatorio (inactivo)',
    'liga' => 'Liga', 'prueba' => 'Prueba'];

function cc_t_push(): string
{
    $h = '<h1>Notificaciones</h1>';
    if (!class_exists(Push::class)) return $h . cc_no_disponible('Notificaciones push', 'Falta server/src/Push.php');
    try {
        $s = Push::estadisticas();
    } catch (\Throwable $e) {
        error_log('EN VIVO control push: ' . $e->getMessage());
        return $h . '<section class="panel"><div class="vacio">No se pudieron leer las notificaciones (¿falta la migración push.sql?).</div></section>';
    }
    if (!$s['disponible']) {
        $h .= '<div class="aviso aviso-error" id="push-sin-claves">Faltan las llaves VAPID: en el servidor corre <code>sudo php server/bin/push_claves.php --escribir</code> y después <code>sudo systemctl reload php8.3-fpm</code>. Sin llaves el juego no ofrece notificaciones.</div>';
    }
    $h .= '<div class="kpis kpis-chicos">'
        . cc_tarjeta('Jugadores suscritos', cc_num($s['jugadores']), cc_num($s['aparatos']) . ' aparatos', 'kpi-push-jugadores')
        . cc_tarjeta('Enviadas hoy', cc_num($s['enviados_hoy']), 'máximo ' . Push::maxDia() . ' por jugador', 'kpi-push-hoy')
        . cc_tarjeta('Enviadas 7 días', cc_num($s['enviados_7d']), cc_num($s['pendientes']) . ' en cola', 'kpi-push-7d')
        . cc_tarjeta('Fallos 7 días', cc_num($s['fallos_7d']), cc_num($s['muertas_7d']) . ' suscripciones muertas borradas', 'kpi-push-fallos')
        . '</div>';

    // Prueba
    $h .= '<section class="panel" id="panel-push-prueba"><h2>Enviar una prueba</h2>'
        . cc_form('push_prueba', [], 'form', '¿Enviar una notificación de prueba a todos los aparatos de este jugador?')
        . '<label>Jugador (número, correo o alias)<input name="jugador" required maxlength="120" autocapitalize="off" spellcheck="false" placeholder="Ej. 12 o ana@correo.com"></label>'
        . '<button class="btn" type="submit"' . ($s['disponible'] ? '' : ' disabled') . '>Enviar prueba</button></form>'
        . '<p class="tenue">Llega al instante (sin horario de silencio ni tope diario) y no cuenta para el tope del jugador.</p></section>';

    // Por categoría
    $filas = [];
    foreach (CC_PUSH_CATS as $k => $n) {
        $c = $s['por_categoria'][$k] ?? null;
        $on = $s['interruptores'][$k] ?? null;
        if ($c === null && $on === null) continue;
        $filas[] = [e($n), $on === null ? '<span class="tenue">—</span>' : cc_num($on) . ' de ' . cc_num($s['aparatos']), cc_num($c['ok'] ?? 0), cc_num($c['fallos'] ?? 0)];
    }
    $h .= '<section class="panel"><h2>Por categoría (7 días)</h2>' . cc_tabla(['Categoría', 'Aparatos con el interruptor encendido', 'Enviadas', 'Fallos'], $filas, 'Sin datos.', 'tabla-push-categorias') . '</section>';

    // Descartes
    $mot = ['vencido' => 'Vencido (llegó tarde)', 'inactivo' => 'Jugador 30+ días sin jugar', 'volvio' => 'El jugador volvió (recordatorio)', 'tope' => 'Tope diario',
        'repetido' => 'Mismo texto que el anterior', 'sin_suscripcion' => 'Sin aparato con esa categoría'];
    $h .= '<section class="panel"><h2>Avisos descartados (7 días)</h2>' . cc_tabla(['Motivo', 'Cantidad'],
        array_map(fn($f) => [e($mot[$f['motivo']] ?? (string) $f['motivo']), cc_num($f['n'])], $s['descartados_7d']), 'Ninguno.', 'tabla-push-descartes') . '</section>';

    // Últimos envíos
    $h .= '<section class="panel"><h2>Últimos envíos</h2>' . cc_tabla(['Fecha', 'Jugador', 'Categoría', 'Respuesta'],
        array_map(fn($f) => [e(cc_fecha($f['creado'])), '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $f['jugador_id']])) . '">' . e($f['alias'] ?: $f['nombre'] ?: '#' . $f['jugador_id']) . '</a>',
            e(CC_PUSH_CATS[$f['categoria']] ?? $f['categoria']), (int) $f['ok'] === 1 ? cc_chip('OK ' . $f['http'], 'ok') : cc_chip(((int) $f['http'] === 0 ? 'sin respuesta' : 'HTTP ' . $f['http']), 'mal')],
            $s['recientes']), 'Todavía no se ha enviado nada.', 'tabla-push-recientes') . '</section>';
    $h .= '<p class="tenue">Reglas: máximo ' . Push::maxDia() . ' al día por jugador (ofertas: 1 y nunca el último cupo), nada entre las 22:00 y las 08:00 (se pospone),'
        . ' nunca el mismo texto dos veces seguidas, recordatorio solo desde 3 días sin jugar y nada después de 30 días. Las suscripciones que responden 404/410 se borran solas.</p>';
    return $h;
}

function cc_a_push(string $accion, string $q): string
{
    if ($accion !== 'push_prueba') throw new Fallo('Acción desconocida.', 400);
    $x = mb_substr(cc_post('jugador'), 0, 120);
    $j = preg_match('/^\d{1,12}$/', $x) ? Db::fila('SELECT id, nombre, alias FROM jugadores WHERE id = ?', [(int) $x])
        : Db::fila('SELECT id, nombre, alias FROM jugadores WHERE email = ? COLLATE NOCASE OR alias = ? COLLATE NOCASE ORDER BY id LIMIT 1', [$x, $x]);
    if (!$j) throw new Fallo('No encontré ese jugador.', 404);
    $r = Push::enviarPrueba((int) $j['id']);
    Auditoria::anotar($q, 'push_prueba', 'Prueba de notificación: ' . $r['ok'] . ' de ' . $r['aparatos'] . ' aparatos (HTTP ' . implode(', ', $r['http']) . ')', (int) $j['id']);
    $quien = $j['alias'] ?: $j['nombre'];
    if ($r['ok'] > 0) return 'Prueba enviada a ' . $quien . ': llegó a ' . $r['ok'] . ' de ' . $r['aparatos'] . ' aparatos.';
    return 'La prueba no llegó a ningún aparato de ' . $quien . ' (HTTP ' . implode(', ', $r['http']) . ')' . ($r['muertas'] ? '; ' . $r['muertas'] . ' suscripciones muertas borradas.' : '.');
}
