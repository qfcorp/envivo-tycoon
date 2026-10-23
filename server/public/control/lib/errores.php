<?php
declare(strict_types=1);

// Pestaña "Errores" (server/INTEGRAR_ERRORES.md): los errores del juego en los celulares (js/errores.js -> /api/error),
// agrupados por huella. Lista de los grupos que más pasaron en 24 h / 7 días, detalle con la pila, versiones,
// plataformas, idiomas, navegadores y últimas ocurrencias, y "Marcar resuelto" / "Reabrir" (CSRF + auditoría).
// Además: cc_errores_alerta() para el Resumen (grupo NUEVO que ya pasó ERRORES_ALERTA veces, 5 por defecto) y la
// insignia de la pestaña (cc_errores_insignia). Todo lee y escribe con src/Errores.php.
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Control, Errores, Fallo};

const CC_ERR_PERIODOS = ['24h' => ['Últimas 24 horas', 86400], '7d' => ['Últimos 7 días', 7 * 86400]];
const CC_ERR_PLATAFORMAS = ['web' => 'Web', 'android' => 'App Android', 'pwa' => 'App instalada (PWA)'];

function cc_err_instalado(): bool { return class_exists(Errores::class) && Control::tablas('errores_grupos', 'errores_cliente'); }

function cc_err_estado(array $g): string
{
    if ($g['resuelto'] !== null) return cc_chip('resuelto', 'ok');
    if ($g['reabierto'] !== null) return cc_chip('reabierto', 'mal');
    if ((int) $g['primero'] >= time() - 86400) return cc_chip('nuevo', 'aviso');
    return cc_chip('abierto');
}

function cc_err_lugar(array $g): string
{
    $a = (string) $g['archivo'];
    return $a === '' ? 'sin archivo' : $a . ((int) $g['linea'] > 0 ? ':' . (int) $g['linea'] : '');
}

/** Línea de aviso para el Resumen: grupos nuevos (primera vez en 24 h) que ya pasaron el umbral. '' si no hay. */
function cc_errores_alerta(): string
{
    try {
        if (!cc_err_instalado()) return '';
        $al = Errores::alertas();
        if (!$al) return '';
        $prim = $al[0];
        return '<div class="aviso aviso-error" id="alerta-errores" role="alert">Error nuevo en el juego: '
            . (count($al) === 1 ? '' : '<b>' . count($al) . '</b> grupos nuevos pasaron ' . Errores::umbral() . ' veces o más en 24 h. El que más: ')
            . '«' . e(mb_substr((string) $prim['mensaje'], 0, 120)) . '» (' . cc_num($prim['total']) . ' veces, ' . e(cc_err_lugar($prim)) . '). '
            . '<a href="' . e(cc_url(['t' => 'errores', 'id' => $prim['id']])) . '">Ver el detalle</a> · <a href="' . e(cc_url(['t' => 'errores'])) . '">Todos los errores</a></div>';
    } catch (\Throwable) {
        return '';
    }
}

/** Insignia: grupos nuevos que ya pasaron el umbral + grupos reabiertos. */
function cc_errores_insignia(): int
{
    if (!cc_err_instalado()) return 0;
    return count(Errores::alertas()) + (int) Errores::conteos()['reabiertos'];
}

// ---------------------------------------------------------------------------------------------- lista
function cc_t_errores(): string
{
    $h = '<h1>Errores del juego</h1>';
    if (!cc_err_instalado()) return $h . cc_no_disponible('Errores', 'Falta src/Errores.php o las tablas errores_grupos / errores_cliente (src/migraciones/errores.sql).');
    $id = cc_get_int('id');
    if ($id > 0) return cc_err_detalle($id);
    $p = cc_get('p');
    if (!isset(CC_ERR_PERIODOS[$p])) $p = '24h';
    $conRes = cc_get('resueltos') === '1';
    $c = Errores::conteos();
    $h .= '<p class="tenue">Errores de JavaScript en los celulares de los jugadores (sin servicios de terceros, sin datos personales: '
        . 'la dirección va sin parámetros y la IP solo como huella). Se guardan ' . Errores::DIAS . ' días. Aviso en el Resumen cuando un error nuevo pasa '
        . Errores::umbral() . ' veces (ERRORES_ALERTA).</p>';
    $h .= '<div class="kpis">'
        . cc_tarjeta('Errores en 24 h', cc_num($c['n24']), cc_num($c['grupos24']) . ' grupos distintos', 'kpi-err-24')
        . cc_tarjeta('Errores en 7 días', cc_num($c['n7']), 'afectados en 24 h: ' . cc_num($c['afectados24']), 'kpi-err-7d')
        . cc_tarjeta('Grupos nuevos (24 h)', cc_num($c['nuevos24']), 'vistos por primera vez', 'kpi-err-nuevos')
        . cc_tarjeta('Sin resolver', cc_num($c['abiertos']), $c['reabiertos'] > 0 ? cc_num($c['reabiertos']) . ' reabiertos (volvieron en una versión nueva)' : 'ninguno reabierto', 'kpi-err-abiertos')
        . '</div>';
    $h .= cc_errores_alerta();
    $h .= '<nav class="filtros" id="filtros-errores">';
    foreach (CC_ERR_PERIODOS as $k => [$n]) $h .= '<a href="' . e(cc_url(['t' => 'errores', 'p' => $k, 'resueltos' => $conRes ? '1' : ''])) . '"' . ($k === $p ? ' class="activo"' : '') . '>' . e($n) . '</a>';
    $h .= '<a href="' . e(cc_url(['t' => 'errores', 'p' => $p, 'resueltos' => $conRes ? '' : '1'])) . '"' . ($conRes ? ' class="activo"' : '') . '>' . ($conRes ? 'Con resueltos' : 'Mostrar resueltos') . '</a></nav>';
    $grupos = Errores::grupos(time() - CC_ERR_PERIODOS[$p][1], $conRes, 50);
    $filas = array_map(function (array $g) use ($p): array {
        $vers = $g['versiones'];
        $plat = array_map(fn($x) => CC_ERR_PLATAFORMAS[$x] ?? $x, $g['plataformas']);
        return [
            '<b>' . cc_num($g['n']) . '</b><br><span class="tenue">' . cc_num($g['total']) . ' en total</span>',
            '<a href="' . e(cc_url(['t' => 'errores', 'id' => $g['id']])) . '"><span class="largo">' . e(mb_substr((string) $g['mensaje'], 0, 160)) . '</span></a><br><span class="tenue">' . e(cc_err_lugar($g)) . '</span>',
            cc_num($g['afectados']),
            $vers ? e(implode(', ', array_slice($vers, 0, 3))) . (count($vers) > 3 ? ' <span class="tenue">+' . (count($vers) - 3) . '</span>' : '') : '<span class="tenue">—</span>',
            e(implode(', ', $plat)),
            e(cc_fecha($g['primero'])) . '<br><span class="tenue">última: ' . e(cc_fecha($g['ultimo'])) . '</span>',
            cc_err_estado($g),
        ];
    }, $grupos);
    $h .= '<section class="panel"><h2>Los que más pasaron · ' . e(strtolower(CC_ERR_PERIODOS[$p][0])) . '</h2>'
        . cc_tabla(['Veces', 'Error', 'Afectados', 'Versiones', 'Plataformas', 'Primera vez', 'Estado'], $filas,
            $conRes ? 'Ningún error en este período.' : 'Ningún error sin resolver en este período.', 'tabla-errores') . '</section>';
    return $h;
}

// ---------------------------------------------------------------------------------------------- detalle
function cc_err_detalle(int $id): string
{
    $g = Errores::grupo($id, 25);
    $volver = '<p><a href="' . e(cc_url(['t' => 'errores'])) . '">← Todos los errores</a></p>';
    if (!$g) return '<h1>Error N° ' . $id . '</h1>' . $volver . '<section class="panel"><p>Ese grupo no existe (los errores se borran a los ' . Errores::DIAS . ' días).</p></section>';
    $h = '<h1>Error N° ' . (int) $g['id'] . ' ' . cc_err_estado($g) . '</h1>' . $volver;
    $h .= '<div class="kpis">'
        . cc_tarjeta('Veces en total', cc_num($g['total']), 'desde ' . cc_fecha($g['primero']), 'kpi-err-total')
        . cc_tarjeta('Últimas 24 h', cc_num($g['n24']), '7 días: ' . cc_num($g['n7']), 'kpi-err-n24')
        . cc_tarjeta('Afectados', cc_num($g['afectados']), cc_num($g['jugadores']) . ' con su cuenta abierta', 'kpi-err-afectados')
        . cc_tarjeta('Última vez', cc_fecha($g['ultimo']), $g['por_version'] ? 'versión ' . (string) $g['por_version'][0]['valor'] : '', 'kpi-err-ultimo')
        . '</div>';
    $estado = $g['resuelto'] !== null
        ? 'Resuelto el ' . cc_fecha($g['resuelto']) . ' por ' . $g['resuelto_por'] . ((string) $g['version_resuelto'] !== '' ? ' (visto hasta ' . $g['version_resuelto'] . '; si vuelve en una versión más nueva, se reabre solo)' : '') . ($g['nota'] ? ' · Nota: ' . $g['nota'] : '')
        : ($g['reabierto'] !== null ? 'Reabierto el ' . cc_fecha($g['reabierto']) . ' (volvió a pasar en una versión más nueva)' : 'Sin resolver');
    $h .= '<section class="panel"><dl class="datos" id="datos-error">'
        . '<dt>Mensaje</dt><dd><b>' . e($g['mensaje']) . '</b></dd>'
        . '<dt>Dónde</dt><dd>' . e(cc_err_lugar($g)) . '</dd>'
        . '<dt>Primera vez</dt><dd>' . e(cc_fecha($g['primero'])) . '</dd>'
        . '<dt>Última vez</dt><dd>' . e(cc_fecha($g['ultimo'])) . '</dd>'
        . '<dt>Estado</dt><dd>' . e($estado) . '</dd>'
        . '<dt>Huella</dt><dd><code>' . e(substr((string) $g['huella'], 0, 16)) . '</code></dd></dl>';
    if ($g['resuelto'] === null) {
        $h .= cc_form('errores_resolver', ['grupo_id' => $g['id']], 'form', '¿Marcar este error como resuelto? Si vuelve a pasar en una versión más nueva del juego, se reabre solo.')
            . '<h3>¿Ya está arreglado?</h3><label>Nota (opcional: qué se arregló, en qué versión)<input name="nota" maxlength="300" placeholder="Ej.: arreglado en envivo-v17"></label>'
            . '<button type="submit" class="btn" id="btn-resolver">Marcar resuelto</button></form>';
    } else {
        $h .= cc_boton('errores_reabrir', ['grupo_id' => $g['id']], 'Reabrir', 'btn btn-sec', '¿Reabrir este error?');
    }
    $h .= '</section>';
    $h .= '<section class="panel"><h2>Pila (la más reciente)</h2>'
        . ($g['pila'] !== '' ? '<pre class="json" id="pila-error">' . e($g['pila']) . '</pre>' : '<p class="tenue">Este error no trajo pila.</p>') . '</section>';
    $tabla = fn(string $titulo, array $filas, string $tid, ?array $nombres = null) => '<section class="panel"><h2>' . e($titulo) . '</h2>' . cc_tabla(['', 'Veces', 'Última vez'], array_map(fn($f) => [
        e(($nombres[(string) $f['valor']] ?? null) ?? ((string) $f['valor'] !== '' ? (string) $f['valor'] : '(sin dato)')), cc_num($f['n']), e(cc_fecha($f['ultimo']))], $filas), 'Sin datos.', $tid) . '</section>';
    $h .= '<div class="dos">' . $tabla('Por versión del juego', $g['por_version'], 'tabla-err-versiones') . $tabla('Por plataforma', $g['por_plataforma'], 'tabla-err-plataformas', CC_ERR_PLATAFORMAS) . '</div>';
    $h .= '<div class="dos">' . $tabla('Por idioma', $g['por_idioma'], 'tabla-err-idiomas') . $tabla('Por navegador', $g['por_navegador'], 'tabla-err-navegadores') . '</div>';
    $tipos = ['error' => 'error', 'promesa' => 'promesa sin atender', 'manual' => 'reportado por el juego'];
    $filas = array_map(fn($o) => [
        e(cc_fecha($o['creado'])),
        e($o['version'] !== '' ? $o['version'] : '—') . '<br><span class="tenue">' . e(CC_ERR_PLATAFORMAS[$o['plataforma']] ?? $o['plataforma']) . ' · ' . e($o['idioma'] !== '' ? $o['idioma'] : '—') . '</span>',
        e($o['url'] !== '' ? $o['url'] : '—') . ((int) $o['linea'] > 0 ? '<br><span class="tenue">línea ' . (int) $o['linea'] . ':' . (int) $o['columna'] . '</span>' : ''),
        e($tipos[$o['tipo']] ?? $o['tipo']) . ($o['contexto'] !== '' ? '<br><span class="tenue">' . e($o['contexto']) . '</span>' : ''),
        $o['ultimo_paso'] !== '' ? '<span class="largo">' . e($o['ultimo_paso']) . '</span>' : '<span class="tenue">—</span>',
        e($o['navegador'] !== '' ? $o['navegador'] : '—') . (($o['memoria'] . $o['conexion']) !== '' ? '<br><span class="tenue">' . e(trim($o['memoria'] . ' · ' . $o['conexion'], ' ·')) . '</span>' : ''),
        $o['jugador_id'] !== null ? '<a href="' . e(cc_url(['t' => 'jugadores', 'id' => $o['jugador_id']])) . '">N° ' . (int) $o['jugador_id'] . '</a>' : '<span class="tenue">sin sesión</span>',
    ], $g['ultimas']);
    $h .= '<section class="panel"><h2>Últimas veces que pasó (' . count($g['ultimas']) . ')</h2>'
        . cc_tabla(['Fecha', 'Versión', 'Dirección', 'Tipo', 'Últimos pasos', 'Navegador', 'Jugador'], $filas, 'Sin ocurrencias guardadas.', 'tabla-err-ultimas') . '</section>';
    return $h;
}

// ---------------------------------------------------------------------------------------------- acciones (POST)
function cc_a_errores(string $accion, string $q): string
{
    if (!cc_err_instalado()) throw new Fallo('El módulo de errores no está instalado.', 400);
    $id = cc_post_int('grupo_id');
    if ($id <= 0) throw new Fallo('Falta el grupo de errores.', 400);
    return match ($accion) {
        'errores_resolver' => (function () use ($id, $q): string {
            $g = Errores::resolver($id, $q, cc_post('nota'));
            return 'Error N° ' . $id . ' marcado como resuelto: ' . mb_substr((string) $g['mensaje'], 0, 120);
        })(),
        'errores_reabrir' => (function () use ($id, $q): string {
            Errores::reabrir($id, $q);
            return 'Error N° ' . $id . ' reabierto.';
        })(),
        default => throw new Fallo('Acción desconocida.', 400),
    };
}
