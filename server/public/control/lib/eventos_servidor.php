<?php
declare(strict_types=1);

// Pestaña "Eventos" del Centro de Control (src/EventosServidor.php, server/INTEGRAR_EVENTOS_SERVIDOR.md):
// encender/apagar todos los eventos, cada evento y el calendario de adviento; cambiar las fechas y la meta de cada edición
// (o volver a las del calendario); avance del objetivo común por servidor; vista previa del calendario en una fecha.
// Todo por POST con CSRF; EventosServidor::guardar audita (accion "eventos_servidor").
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{EventosServidor as EVS, Fallo};

const CC_EVS_FASES = ['apagada' => ['apagado', 'mal'], 'pronto' => ['programado', 'aviso'], 'activa' => ['EN CURSO', 'ok'], 'terminada' => ['terminado', '']];

function cc_evs_chip(string $fase): string { [$t, $k] = CC_EVS_FASES[$fase] ?? [$fase, '']; return cc_chip($t, $k); }

function cc_evs_rango(array $i): string
{
    return date('d/m/Y', $i['desde']) . ' – ' . date('d/m/Y', $i['hasta']);
}

function cc_t_eventos(): string
{
    EVS::preparar();
    $c = EVS::config();
    $t = EVS::ahora();
    $h = '<section class="panel" id="panel-eventos"><h1>Eventos del servidor</h1>'
       . '<p class="tenue">Cada temporada es un evento de <b>todo el servidor</b>: tienda de temporada que se paga con fichas que se ganan jugando '
       . '(nada pagado, nada al azar), un objetivo común por servidor con premio para todos y una oferta especial con un producto que ya existe. '
       . 'Fechas en hora de Ecuador. El Viernes Negro solo muestra las ofertas que ya hay (la promo de Black Friday se maneja en «Buzón y códigos»).</p>';
    // ---- general
    $h .= cc_form('eventos_general', [], 'form form-producto', '¿Guardar qué eventos están encendidos?')
        . '<label class="check"><input type="checkbox" name="activo" value="1"' . ($c['activo'] ? ' checked' : '') . '> Eventos del servidor encendidos (apagado: no sale ninguno en el juego)</label>'
        . '<label class="check"><input type="checkbox" name="adviento" value="1"' . ($c['adviento'] ? ' checked' : '') . '> Calendario de adviento (1 al 25 de diciembre)</label>'
        . '<fieldset><legend>Cada evento</legend>';
    foreach (EVS::CALENDARIO as $k => $d)
        $h .= '<label class="check"><input type="checkbox" name="ev_' . e($k) . '" value="1"' . ($c['eventos'][$k] ? ' checked' : '') . '> ' . e($d['icono'] . ' ' . EVS::NOMBRES[$k]) . '</label>';
    $h .= '</fieldset><div class="botones"><button class="btn" type="submit">Guardar</button></div></form></section>';

    // ---- en curso: objetivo común por servidor
    $curso = array_values(array_filter(EVS::instancias($t - EVS::DIAS_RECLAMO_META * 86400, $t, $c), fn($i) => $i['tipo'] === 'evento' && in_array($i['fase'], ['activa', 'terminada'], true)));
    $h .= '<section class="panel" id="panel-eventos-curso"><h2>En curso</h2>';
    if (!$curso) $h .= '<p class="tenue">Ningún evento en curso ahora.</p>';
    foreach ($curso as $i) {
        $tot = EVS::totales($i['id']);
        $h .= '<h3>' . e($i['icono'] . ' ' . $i['nombre'] . ' ' . $i['anio']) . ' ' . cc_evs_chip($i['fase']) . ' <span class="tenue">' . e(cc_evs_rango($i)) . '</span></h3>'
            . '<div class="kpis">' . cc_tarjeta('Jugadores', cc_num($tot['jugadores']), 'con fichas', 'kpi-evs-jug-' . $i['id']) . cc_tarjeta('Fichas ganadas', cc_num($tot['ganadas']))
            . cc_tarjeta('Fichas gastadas', cc_num($tot['gastadas'])) . cc_tarjeta('Compras en la tienda', cc_num($tot['compras'])) . '</div>';
        $filas = array_map(fn($s) => [e($s['nombre']), $s['meta'] === null ? '<span class="tenue">sin calcular (nadie entró)</span>' : cc_num($s['progreso']) . ' / ' . cc_num($s['meta']) . ' (' . (int) $s['pct'] . ' %)',
                                      cc_num($s['jugadores']), cc_num($s['premios'])], EVS::resumenServidores($i));
        $h .= cc_tabla(['Servidor', 'Objetivo común', 'Jugadores que aportan', 'Premios reclamados'], $filas, 'Sin servidores.', 'tabla-evs-' . $i['id']);
    }
    $adv = EVS::estadoAdviento(null, $c);
    if ($adv) { $ta = EVS::totalAdviento($adv['anio']); $h .= '<h3>🎁 Calendario de adviento ' . (int) $adv['anio'] . ' (hoy: día ' . (int) $adv['hoy'] . ')</h3><div class="kpis">'
        . cc_tarjeta('Regalos abiertos', cc_num($ta['regalos']), '', 'kpi-evs-adviento') . cc_tarjeta('Jugadores', cc_num($ta['jugadores'])) . cc_tarjeta('Recuperados al día siguiente', cc_num($ta['recuperados'])) . '</div>'; }
    $h .= '</section>';

    // ---- calendario: ediciones de los próximos 14 meses
    $h .= '<section class="panel" id="panel-eventos-calendario"><h2>Calendario (próximos 14 meses)</h2>'
        . '<p class="tenue">Cambia las fechas de una edición (días completos, hora de Ecuador) o fija su meta para todos los servidores. Sin meta fija, cada servidor la calcula '
        . 'una vez: jugadores activos × días × ' . str_replace('.', ',', (string) EVS::META_FACTOR) . ' (entre ' . EVS::META_MIN . ' y ' . cc_num(EVS::META_MAX) . '). Para probar, pon la fecha de hoy como inicio.</p>';
    $filas = [];
    foreach (EVS::instancias($t, $t + 425 * 86400, $c) as $i) {
        $form = $i['tipo'] !== 'evento' && $i['clave'] === 'viernes_negro' ? '<span class="tenue">fechas de Black Friday</span>'
            : cc_form('eventos_instancia', ['id' => $i['id']], 'en-linea form-evs')
              . '<input type="date" name="desde" aria-label="Desde" value="' . e(date('Y-m-d', $i['desde'])) . '"> <input type="date" name="hasta" aria-label="Hasta" value="' . e(date('Y-m-d', $i['hasta'])) . '"> '
              . ($i['tipo'] === 'evento' ? '<input name="meta" inputmode="numeric" maxlength="6" size="6" placeholder="meta" aria-label="Meta fija" value="' . e((string) ($i['meta_fija'] ?? '')) . '"> ' : '')
              . '<button class="btn btn-chico" type="submit">Guardar</button></form>'
              . ($i['cambiada'] || $i['meta_fija'] ? ' ' . cc_boton('eventos_instancia', ['id' => $i['id'], 'borrar' => '1'], 'Volver al calendario', 'btn btn-chico btn-sec', '¿Volver a las fechas y la meta del calendario?') : '');
        $filas[] = [e($i['icono'] . ' ' . $i['nombre'] . ' ' . $i['anio']), e(cc_evs_rango($i)) . ($i['cambiada'] ? ' ' . cc_chip('cambiada', 'aviso') : ''), cc_evs_chip($i['fase']),
                    e($i['oferta'] ?? '—'), e($i['deco'] ? EVS::COSMETICOS[$i['deco']] : '—'), $form];
    }
    $h .= cc_tabla(['Evento', 'Fechas', 'Estado', 'Oferta (producto)', 'Decoración exclusiva', 'Cambiar'], $filas, 'Sin eventos.', 'tabla-evs-calendario') . '</section>';

    // ---- vista previa
    $f = cc_get('fecha');
    $h .= '<section class="panel" id="panel-eventos-previa"><h2>Vista previa</h2><p class="tenue">Qué eventos estarían en curso en una fecha (no cambia nada en el juego).</p>'
        . '<form method="get" action="' . CC_RUTA . '" class="en-linea"><input type="hidden" name="t" value="eventos"><input type="date" name="fecha" aria-label="Fecha" value="' . e($f) . '"> <button class="btn btn-chico" type="submit">Ver</button></form>';
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $f)) {
        $ts = EVS::inicioDia($f) + 12 * 3600;
        $lista = array_filter(EVS::instancias($ts, $ts, $c), fn($i) => $i['fase'] !== 'apagada');
        $h .= '<ul id="evs-previa">' . ($lista ? implode('', array_map(fn($i) => '<li>' . e($i['icono'] . ' ' . $i['nombre'] . ' ' . $i['anio'] . ' · ' . cc_evs_rango($i)) . '</li>', $lista)) : '<li class="tenue">Ningún evento ese día.</li>')
            . (substr($f, 5, 2) === '12' && (int) substr($f, 8, 2) <= 25 && $c['adviento'] ? '<li>🎁 Calendario de adviento: día ' . (int) substr($f, 8, 2) . '</li>' : '') . '</ul>';
    }
    return $h . '</section>';
}

function cc_a_eventos(string $accion, string $q): string
{
    switch ($accion) {
        case 'eventos_general':
            $ev = [];
            foreach (EVS::CALENDARIO as $k => $_) $ev[$k] = cc_post('ev_' . $k) === '1';
            $c = EVS::guardar(['activo' => cc_post('activo') === '1', 'adviento' => cc_post('adviento') === '1', 'eventos' => $ev], $q);
            return 'Eventos guardados: ' . ($c['activo'] ? 'encendidos' : 'APAGADOS') . ' (' . count(array_filter($c['eventos'])) . ' de ' . count($c['eventos']) . '), adviento ' . ($c['adviento'] ? 'encendido' : 'apagado') . '.';
        case 'eventos_instancia':
            $id = cc_post('id');
            if (cc_post('borrar') === '1') { EVS::guardar(['instancia' => ['id' => $id, 'borrar' => true]], $q); return 'Edición ' . $id . ': vuelve a las fechas y la meta del calendario.'; }
            $dia = function (string $k): int {
                $v = cc_post($k);
                Fallo::si(!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v), 'Revisa la fecha (' . mb_substr($v, 0, 20) . ').', 400);
                return EVS::inicioDia($v);
            };
            $meta = cc_post('meta');
            Fallo::si($meta !== '' && !preg_match('/^\d{1,6}$/', $meta), 'La meta es un número.', 400);
            EVS::guardar(['instancia' => ['id' => $id, 'desde' => $dia('desde'), 'hasta' => $dia('hasta') + 86399, 'meta' => $meta === '' ? 0 : (int) $meta]], $q);
            $i = EVS::instancia($id);
            return 'Edición ' . $id . ' guardada: del ' . date('d/m/Y', $i['desde']) . ' al ' . date('d/m/Y', $i['hasta']) . ($i['meta_fija'] ? ', meta fija ' . $i['meta_fija'] : '') . '.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
