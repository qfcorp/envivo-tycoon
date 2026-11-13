<?php
declare(strict_types=1);

// Bloque "Black Friday: VIP 30 días gratis" del Centro de Control (va en la pestaña Buzón y códigos, src/BlackFriday.php):
// estado (fechas, reclamados de cupo, palabra del código), lista de quienes reclamaron y el formulario para encender/apagar,
// cambiar las fechas, el cupo, la palabra y las cuentas por conexión. Todo por POST con CSRF; BlackFriday::guardar audita.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{BlackFriday, Fallo};

const CC_PROMO_FASES = ['apagada' => ['apagada', 'mal'], 'pronto' => ['programada', 'aviso'], 'activa' => ['EN CURSO', 'ok'], 'agotada' => ['agotada', 'aviso'], 'terminada' => ['terminada', '']];

function cc_promo_panel(): string
{
    $c = BlackFriday::config();
    $n = BlackFriday::reclamados();
    $fase = BlackFriday::fase($c, $n);
    [$txt, $tipo] = CC_PROMO_FASES[$fase];
    $h = '<section class="panel" id="panel-black-friday"><h2>Black Friday: VIP ' . BlackFriday::DIAS . ' días gratis ' . cc_chip($txt, $tipo) . '</h2>'
       . '<p class="tenue">Las primeras cuentas que lo reclaman (botón en Inicio o la palabra en «Canjear código») reciben el Pase VIP de ' . BlackFriday::DIAS . ' días, igual que si lo compraran '
       . '(si ya tienen VIP, se suman los días). No cuenta como compra ni sube el nivel VIP. Una vez por cuenta, por aparato y como máximo ' . (int) $c['ip_max'] . ' cuentas por conexión.</p>';
    $h .= '<div class="kpis">' . cc_tarjeta('Reclamados', cc_num($n) . ' / ' . cc_num($c['cupo']), 'quedan ' . cc_num(max(0, $c['cupo'] - $n)), 'kpi-bf-reclamados')
        . cc_tarjeta('Desde', cc_fecha($c['desde']), 'hora de Ecuador', 'kpi-bf-desde') . cc_tarjeta('Hasta', cc_fecha($c['hasta']), 'incluido ese minuto', 'kpi-bf-hasta')
        . cc_tarjeta('Código', $c['codigo'] !== '' ? $c['codigo'] : '—', 'mismo cupo que el botón', 'kpi-bf-codigo') . '</div>';
    $h .= cc_form('promo_bf_guardar', [], 'form form-producto', '¿Guardar los cambios de la promoción de Black Friday?')
        . '<label class="check"><input type="checkbox" name="activa" value="1"' . ($c['activa'] ? ' checked' : '') . '> Promoción encendida (apagada: no sale en el juego y nadie puede reclamar)</label>'
        . '<label>Desde<input type="datetime-local" name="desde" required value="' . e(date('Y-m-d\TH:i', $c['desde'])) . '"></label>'
        . '<label>Hasta (incluido ese minuto)<input type="datetime-local" name="hasta" required value="' . e(date('Y-m-d\TH:i', $c['hasta'])) . '"></label>'
        . '<label>Cupo (cuentas)<input name="cupo" inputmode="numeric" required maxlength="5" value="' . (int) $c['cupo'] . '"></label>'
        . '<label>Palabra para canjear (vacío = solo el botón)<input name="codigo" maxlength="32" autocapitalize="characters" spellcheck="false" value="' . e($c['codigo']) . '"></label>'
        . '<label>Máximo de cuentas por conexión (IP)<input name="ip_max" inputmode="numeric" required maxlength="3" value="' . (int) $c['ip_max'] . '"></label>'
        . '<div class="botones"><button class="btn" type="submit">Guardar</button></div></form>';
    $filas = array_map(fn($r) => [
        e(cc_fecha($r['creado'])),
        '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $r['jugador_id']])) . '">N° ' . (int) $r['jugador_id'] . '</a> ' . e((string) ($r['nombre'] ?? '')),
        e((string) ($r['email'] ?? '')),
        e(['juego' => 'botón', 'codigo' => 'código (juego)', 'web' => 'código (web)'][$r['canal']] ?? $r['canal']),
        e(cc_fecha($r['vip_hasta'])),
        e((string) ($r['ip'] ?? '—')),
    ], BlackFriday::lista());
    $h .= '<h3>Quiénes lo reclamaron (' . cc_num($n) . ')</h3>' . cc_tabla(['Fecha', 'Jugador', 'Correo', 'Por', 'VIP hasta', 'IP'], $filas, 'Nadie lo ha reclamado todavía.', 'tabla-black-friday');
    return $h . '</section>';
}

function cc_a_promo(string $accion, string $q): string
{
    if ($accion !== 'promo_bf_guardar') throw new Fallo('Acción desconocida.', 400);
    $desde = cc_fecha_local(cc_post('desde'));
    $hasta = cc_fecha_local(cc_post('hasta'));
    Fallo::si($desde === null || $hasta === null, 'Escribe las dos fechas de la promoción.', 400);
    $c = BlackFriday::guardar(['activa' => cc_post('activa') === '1', 'desde' => $desde, 'hasta' => $hasta + 59, 'cupo' => cc_post_int('cupo'),
        'codigo' => cc_post('codigo'), 'ip_max' => cc_post_int('ip_max')], $q);
    return 'Black Friday guardado: ' . ($c['activa'] ? 'encendido' : 'apagado') . ', del ' . cc_fecha($c['desde']) . ' al ' . cc_fecha($c['hasta']) . ', cupo ' . $c['cupo'] . '.';
}
