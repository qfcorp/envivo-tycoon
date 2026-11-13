<?php
declare(strict_types=1);

// Pestaña "Gran Producción" del Centro de Control (src/GranProduccion.php, server/INTEGRAR_GRAN_PRODUCCION.md):
// la producción en curso (o la última) con su reloj, la tabla de cada servidor, pausar / reanudar / cancelar, el horario
// (día, hora, duración, encendida, mega evento de la próxima), los premios fijos y el historial. Todo por POST con CSRF;
// GranProduccion audita cada cambio.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Buzon, Fallo, GranProduccion as GP};

const CC_GP_ESTADOS = ['en_curso' => ['EN CURSO', 'ok'], 'pausada' => ['EN PAUSA', 'aviso'], 'cerrada' => ['terminada', ''], 'cancelada' => ['cancelada', 'mal']];
const CC_GP_DIAS = [1 => 'lunes', 2 => 'martes', 3 => 'miércoles', 4 => 'jueves', 5 => 'viernes', 6 => 'sábado', 7 => 'domingo'];

function cc_t_gran(): string
{
    $d = GP::panel();
    $c = $d['config'];
    $act = $d['actual'];
    $ver = $d['ver'];
    $h = '<section class="panel" id="panel-gran"><h2>Gran Producción de Asociación</h2>'
       . '<p class="tenue">Evento de equipo semanal: cada asociación cubre en conjunto un mega evento. Personal y equipos con turnos cada 4 h (se acumulan), '
       . 'transmisiones automáticas con los eventos que cada uno juega en su partida. Meta según los miembros activos de cada asociación. Premios fijos al buzón '
       . 'para todos los que aportaron (nada al azar).</p>';
    $estado = $act ? CC_GP_ESTADOS[$act['estado']] : ($c['activa'] ? ['esperando', ''] : ['APAGADA', 'mal']);
    $h .= '<div class="kpis">' . cc_tarjeta('Estado', $estado[0], $act ? 'producción ' . $act['id'] : '', 'kpi-gp-estado');
    if ($act) {
        $quedan = max(0, (int) $act['fin'] - ($act['estado'] === 'pausada' ? (int) $act['pausada_en'] : GP::ahora()));
        $h .= cc_tarjeta('Mega evento', (GP::TEMAS[$act['tema']]['icono'] ?? '') . ' ' . (GP::TEMAS[$act['tema']]['nombre'] ?? $act['tema']), '', 'kpi-gp-tema')
            . cc_tarjeta('Termina', cc_fecha($act['fin']), 'faltan ' . intdiv($quedan, 3600) . ' h ' . intdiv($quedan % 3600, 60) . ' min' . ($act['estado'] === 'pausada' ? ' (reloj detenido)' : ''), 'kpi-gp-fin');
    } elseif ($d['proxima']) {
        $p = $d['proxima'];
        $h .= cc_tarjeta('Próxima', cc_fecha($p['inicio']), (GP::TEMAS[$p['tema']]['nombre'] ?? $p['tema']) . ' · ' . $p['horas'] . ' h', 'kpi-gp-proxima');
    }
    $h .= '</div>';
    if ($act) {
        $h .= '<div class="botones">';
        $h .= $act['estado'] === 'en_curso'
            ? cc_boton('gp_pausar', [], 'Pausar', 'btn', '¿Pausar la Gran Producción? Nadie podrá aportar y el reloj se detiene (el final se corre lo que dure la pausa).')
            : cc_boton('gp_reanudar', [], 'Reanudar', 'btn', '¿Reanudar la Gran Producción?');
        $h .= cc_form('gp_cancelar', [], 'en-linea', '¿CANCELAR la Gran Producción de esta semana? No habrá premios y no se puede deshacer.')
            . '<input name="motivo" maxlength="200" placeholder="Motivo (opcional, solo para la auditoría)"> <button type="submit" class="btn btn-peligro">Cancelar producción</button></form>';
        $h .= '</div>';
    }

    // ---------------------------------------------------------------- tabla por servidor
    if ($ver) {
        $h .= '<h3>Tabla de la producción ' . e($ver['id']) . ' ' . cc_chip(CC_GP_ESTADOS[$ver['estado']][0], CC_GP_ESTADOS[$ver['estado']][1]) . '</h3>';
        if (!$d['tablas']) $h .= '<p class="tenue">Ninguna asociación en esta producción.</p>';
        foreach ($d['tablas'] as $srv => $t) {
            $pos = 0;
            $filas = array_map(function ($f) use (&$pos) {
                $pos += (int) $f['progreso'] > 0 ? 1 : 0;
                return [(int) $f['progreso'] > 0 ? (string) $pos : '—', e($f['siglas']) . ' · ' . e($f['nombre']) . ' <span class="tenue">(N° ' . (int) $f['asociacion_id'] . ')</span>',
                    (int) $f['progreso'] . ' %', e($f['nivel'] !== null ? GP::NOMBRE_NIVEL[$f['nivel']] : (GP::nivelDe((int) $f['progreso']) ? GP::NOMBRE_NIVEL[GP::nivelDe((int) $f['progreso'])] . ' (va)' : '—')),
                    (int) $f['personal'] . ' / ' . (int) $f['meta_personal'], (int) $f['equipos'] . ' / ' . (int) $f['meta_equipos'], (int) $f['transmision'] . ' / ' . (int) $f['meta_transmision'],
                    (int) $f['activos'], (int) $f['aportantes']];
            }, $t['filas']);
            $h .= '<h4>' . e($t['nombre']) . '</h4>' . cc_tabla(['Puesto', 'Asociación', 'Progreso', 'Nivel', 'Personal', 'Equipos', 'Transmisiones', 'Activos', 'Aportaron'], $filas, 'Nadie todavía.', 'tabla-gp-' . (int) $srv);
        }
    }

    // ---------------------------------------------------------------- horario
    $temas = ['' => 'El que toca (rotación semanal)'];
    foreach (GP::TEMAS as $k => $T) $temas[$k] = $T['icono'] . ' ' . $T['nombre'];
    $h .= '<h3>Horario</h3>' . cc_form('gp_config', [], 'form form-producto', '¿Guardar el horario de la Gran Producción?')
        . '<label class="check"><input type="checkbox" name="activa" value="1"' . ($c['activa'] ? ' checked' : '') . '> Encendida (apagada: no empieza ninguna nueva; la que corre sigue)</label>'
        . '<label>Día (hora de Ecuador)<select name="dia">' . cc_opciones(CC_GP_DIAS, (string) $c['dia']) . '</select></label>'
        . '<label>Hora de inicio<input type="time" name="hora" required value="' . e($c['hora']) . '"></label>'
        . '<label>Duración (horas, ' . GP::HORAS_MIN . ' a ' . GP::HORAS_MAX . ')<input name="horas" inputmode="numeric" required maxlength="3" value="' . (int) $c['horas'] . '"></label>'
        . '<label>Mega evento de la próxima<select name="tema_proximo">' . cc_opciones($temas, $c['tema_proximo']) . '</select></label>'
        . '<div class="botones"><button class="btn" type="submit">Guardar</button></div></form>'
        . '<p class="tenue">Si cambias el horario y la hora nueva ya empezó esta semana, la producción arranca enseguida. Cancelar no se puede deshacer.</p>';

    // ---------------------------------------------------------------- premios y reglas
    $fil = [];
    foreach (GP::NIVELES as $k => $N) $fil[] = [e(GP::NOMBRE_NIVEL[$k]), $N['pct'] . ' %', e(Buzon::textoAdjuntos(Buzon::normalizarAdjuntos($N['premios'])))];
    foreach (GP::PUESTOS as $k => $P) $fil[] = ['Puesto ' . $k . ' del servidor', 'con Bronce o más', '+ ' . e(Buzon::textoAdjuntos(Buzon::normalizarAdjuntos($P)))];
    $h .= '<h3>Premios (fijos, para cada productora que aportó)</h3>' . cc_tabla(['Nivel', 'Desde', 'Premio'], $fil, '', 'tabla-gp-premios');
    $fr = [];
    foreach (GP::FRENTES as $k => $F) $fr[] = [e(['personal' => 'Personal', 'equipos' => 'Equipos', 'transmision' => 'Transmisiones'][$k]), (string) $F['max'], (string) $F['meta'],
        e($F['cada'] === null ? 'automático (eventos de su partida)' : 'cada ' . intdiv($F['cada'], 3600) . ' h, se acumulan')];
    $h .= cc_tabla(['Frente', 'Máximo por productora', 'Meta por miembro activo', 'Cómo se gana'], $fr, '', 'tabla-gp-frentes');

    // ---------------------------------------------------------------- historial
    $hist = array_map(fn($p) => [e($p['id']), e((GP::TEMAS[$p['tema']]['icono'] ?? '') . ' ' . (GP::TEMAS[$p['tema']]['nombre'] ?? $p['tema'])), cc_chip(CC_GP_ESTADOS[$p['estado']][0], CC_GP_ESTADOS[$p['estado']][1]),
        e(cc_fecha($p['inicio'])) . ' → ' . e(cc_fecha($p['fin'])), cc_num($p['asocs']), cc_num($p['aportantes']), cc_num($p['premios']), e((string) ($p['nota'] ?? ''))], $d['historial']);
    $h .= '<h3>Últimas producciones</h3>' . cc_tabla(['Id', 'Mega evento', 'Estado', 'Fechas', 'Asociaciones', 'Aportaron', 'Premios', 'Nota'], $hist, 'Todavía no hubo ninguna.', 'tabla-gp-historial');
    return $h . '</section>';
}

function cc_a_gran(string $accion, string $q): string
{
    switch ($accion) {
        case 'gp_pausar':
            $p = GP::pausar($q);
            return 'Gran Producción ' . $p['id'] . ' en pausa.';
        case 'gp_reanudar':
            $p = GP::reanudar($q);
            return 'Gran Producción ' . $p['id'] . ' sigue: termina el ' . cc_fecha($p['fin']) . '.';
        case 'gp_cancelar':
            $p = GP::cancelar($q, cc_post('motivo'));
            return 'Gran Producción ' . $p['id'] . ' cancelada (sin premios).';
        case 'gp_config':
            $c = GP::guardarConfig(['activa' => cc_post('activa') === '1', 'dia' => cc_post_int('dia'), 'hora' => cc_post('hora'), 'horas' => cc_post_int('horas'),
                'tema_proximo' => cc_post('tema_proximo')], $q);
            return 'Horario guardado: ' . ($c['activa'] ? 'encendida' : 'apagada') . ', ' . CC_GP_DIAS[$c['dia']] . ' ' . $c['hora'] . ', ' . $c['horas'] . ' h.';
    }
    throw new Fallo('Acción desconocida.', 400);
}
