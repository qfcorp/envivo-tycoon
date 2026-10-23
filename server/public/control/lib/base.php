<?php
declare(strict_types=1);

// Centro de Control: ayudas comunes (sesión del panel, protección CSRF, avisos, formularios, diseño de la página y
// gráficos SVG). Solo se carga desde public/control/index.php.

defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Config, Control, Db, Http, Limite};

const CC_GALLETA = 'envivo_control';
const CC_GALLETA_PRE = 'envivo_control_pre';   // código CSRF del formulario de entrada (antes de tener sesión)
const CC_RUTA = '/control/';
const CC_DURACION = 12 * 3600;                  // una sesión dura como máximo 12 horas
const CC_INACTIVIDAD = 2 * 3600;                // y se cierra sola con 2 horas sin uso
const CC_INTENTOS_IP = 5;                       // claves equivocadas por conexión en 15 minutos antes de bloquear
const CC_INTENTOS_TODOS = 30;                   // claves equivocadas en total (desde cualquier conexión) en 15 minutos
const CC_MINUTOS_BLOQUEO = 15;

const CC_PESTANAS = [
    'resumen' => 'Resumen', 'jugadores' => 'Jugadores', 'compras' => 'Compras', 'productos' => 'Productos',
    'mercado' => 'Mercado', 'chat' => 'Chat', 'soporte' => 'Soporte', 'ajustes' => 'Ajustes',
    'servidores' => 'Servidores', 'facturacion' => 'Facturación', 'errores' => 'Errores',
    'analitica' => 'Analítica',
    'push' => 'Notificaciones',   // server/INTEGRAR_PUSH.md (lib/push.php)
    'buzon' => 'Buzón y códigos',
];

function e(mixed $t): string { return Http::e($t === null ? '' : (string) $t); }
function cc_fecha(mixed $t, bool $hora = true): string { return $t === null || $t === '' ? '—' : date($hora ? 'd/m/Y H:i' : 'd/m/Y', (int) $t); }
function cc_dinero(mixed $v): string { return Http::dinero((float) $v); }
function cc_num(mixed $v): string { return number_format((float) $v, 0, ',', '.'); }
function cc_url(array $p = []): string { $p = array_filter($p, fn($v) => $v !== null && $v !== ''); return CC_RUTA . ($p ? '?' . http_build_query($p) : ''); }
function cc_get(string $k): string { $v = $_GET[$k] ?? ''; return is_string($v) ? mb_substr(trim($v), 0, 200) : ''; }
function cc_post(string $k): string { $v = $_POST[$k] ?? ''; return is_string($v) ? trim($v) : ''; }
function cc_post_int(string $k): int { $v = filter_var(cc_post($k), FILTER_VALIDATE_INT); return $v === false ? 0 : (int) $v; }
function cc_get_int(string $k): int { $v = filter_var(cc_get($k), FILTER_VALIDATE_INT); return $v === false ? 0 : (int) $v; }

// ---------------------------------------------------------------------------------------------- sesión del panel
function cc_huella(): string { return substr(hash('sha256', 'envivo-control|' . Config::get('ENVIVO_ADMIN_USUARIO') . '|' . Config::get('ENVIVO_ADMIN_CLAVE_HASH') . '|' . Control::totpSecreto()), 0, 24); }

function cc_galleta(string $nombre, string $valor, int $expira): void
{
    if (headers_sent()) return;
    setcookie($nombre, $valor, ['expires' => $expira, 'path' => CC_RUTA, 'secure' => Http::galletaSegura(), 'httponly' => true, 'samesite' => 'Strict']);
}

/** La sesión válida del panel (fila de control_sesiones) o null. */
function cc_sesion(bool $olvidar = false): ?array
{
    static $s = false;
    if ($olvidar) { $s = false; return null; }
    if ($s !== false) return $s;
    $s = null;
    $tok = $_COOKIE[CC_GALLETA] ?? '';
    if (!is_string($tok) || !preg_match('/^[a-f0-9]{64}$/', $tok)) return null;
    $f = Db::fila('SELECT * FROM control_sesiones WHERE token_hash = ?', [hash('sha256', $tok)]);
    $t = time();
    if (!$f) return null;
    if ((int) $f['expira'] <= $t || (int) $f['ultimo'] < $t - CC_INACTIVIDAD || !hash_equals(cc_huella(), (string) $f['huella'])
        || !hash_equals(Config::get('ENVIVO_ADMIN_USUARIO'), (string) $f['usuario'])) {
        Db::q('DELETE FROM control_sesiones WHERE token_hash = ?', [$f['token_hash']]);
        cc_galleta(CC_GALLETA, '', $t - 3600);
        return null;
    }
    if ((int) $f['ultimo'] < $t - 60) Db::q('UPDATE control_sesiones SET ultimo = ? WHERE token_hash = ?', [$t, $f['token_hash']]);
    return $s = $f;
}

/** Usuario del panel (para mostrar) y "control:<usuario>" (para la auditoría). */
function cc_usuario(): string { return (string) (cc_sesion()['usuario'] ?? 'panel'); }
function cc_quien(): string { return Control::quien(cc_usuario()); }
function cc_csrf(): string { return (string) (cc_sesion()['csrf'] ?? ''); }

function cc_abrir_sesion(string $usuario): void
{
    $tok = bin2hex(random_bytes(32));
    $t = time();
    Db::q('DELETE FROM control_sesiones WHERE expira <= ? OR ultimo < ?', [$t, $t - CC_INACTIVIDAD]);
    Db::q('INSERT INTO control_sesiones (token_hash, usuario, huella, csrf, creado, ultimo, expira, ip, navegador) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [hash('sha256', $tok), $usuario, cc_huella(), bin2hex(random_bytes(32)), $t, $t, $t + CC_DURACION, Http::ip(), Http::navegador()]);
    cc_galleta(CC_GALLETA, $tok, $t + CC_DURACION);
    cc_galleta(CC_GALLETA_PRE, '', $t - 3600);
    cc_sesion(true);
}

function cc_cerrar_sesion(): void
{
    $s = cc_sesion();
    if ($s) Db::q('DELETE FROM control_sesiones WHERE token_hash = ?', [$s['token_hash']]);
    cc_galleta(CC_GALLETA, '', time() - 3600);
    cc_sesion(true);
}

/** Mensaje que se muestra una sola vez en la siguiente página (después de una acción). */
function cc_avisar(string $tipo, string $texto): void
{
    $s = cc_sesion();
    if ($s) Db::q('UPDATE control_sesiones SET aviso = ? WHERE token_hash = ?', [json_encode([$tipo, mb_substr($texto, 0, 1500)], JSON_UNESCAPED_UNICODE), $s['token_hash']]);
}

function cc_tomar_aviso(): ?array
{
    $s = cc_sesion();
    if (!$s || $s['aviso'] === null) return null;
    Db::q('UPDATE control_sesiones SET aviso = NULL WHERE token_hash = ?', [$s['token_hash']]);
    $a = json_decode((string) $s['aviso'], true);
    return is_array($a) && count($a) === 2 ? $a : null;
}

/** ¿La petición viene de esta misma página? (Origin/Referer, si el navegador los manda) */
function cc_mismo_origen(): bool
{
    $base = Http::urlBase();
    $o = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($o !== '') return $o === $base;
    $r = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    return $r === '' || $r === $base || str_starts_with($r, $base . '/');
}

function cc_bloqueado(): bool
{
    return Limite::excedido('control:ip:' . Http::ip(), CC_INTENTOS_IP, CC_MINUTOS_BLOQUEO) || Limite::excedido('control:todos', CC_INTENTOS_TODOS, CC_MINUTOS_BLOQUEO);
}

/** Dirección a la que vuelve una acción (solo direcciones del panel). */
function cc_volver(): string
{
    $v = cc_post('volver');
    return preg_match('#^/control/(\?[A-Za-z0-9_\-.%=&+]*)?$#', $v) ? $v : CC_RUTA;
}

function cc_redirigir(string $a): never
{
    header('Cache-Control: no-store');
    header('Location: ' . $a, true, 303);
    exit;
}

// ---------------------------------------------------------------------------------------------- formularios
/** Inicio de un formulario del panel con su código CSRF, la acción y la dirección de regreso. */
function cc_form(string $accion, array $campos = [], string $clase = '', ?string $confirmar = null): string
{
    $h = '<form method="post" action="' . CC_RUTA . '"' . ($clase !== '' ? ' class="' . e($clase) . '"' : '') . ($confirmar ? ' data-confirmar="' . e($confirmar) . '"' : '') . '>'
       . '<input type="hidden" name="csrf" value="' . e(cc_csrf()) . '"><input type="hidden" name="accion" value="' . e($accion) . '">'
       . '<input type="hidden" name="volver" value="' . e((string) ($_SERVER['REQUEST_URI'] ?? CC_RUTA)) . '">';
    foreach ($campos as $k => $v) $h .= '<input type="hidden" name="' . e($k) . '" value="' . e((string) $v) . '">';
    return $h;
}

/** Un botón que manda una acción (un formulario de una sola línea). */
function cc_boton(string $accion, array $campos, string $texto, string $clase = 'btn', ?string $confirmar = null): string
{
    return cc_form($accion, $campos, 'en-linea', $confirmar) . '<button type="submit" class="' . e($clase) . '">' . e($texto) . '</button></form>';
}

function cc_opciones(array $ops, string $actual): string
{
    $h = '';
    foreach ($ops as $k => $v) $h .= '<option value="' . e((string) $k) . '"' . ((string) $k === $actual ? ' selected' : '') . '>' . e($v) . '</option>';
    return $h;
}

function cc_no_disponible(string $que, string $falta): string
{
    return '<div class="vacio" data-no-disponible="1"><b>' . e($que) . ': aún no disponible.</b><br><span class="tenue">' . e($falta) . '</span></div>';
}

function cc_tabla(array $cabeceras, array $filas, string $vacio = 'Nada por aquí todavía.', string $id = ''): string
{
    $h = '<div class="tabla"><table' . ($id !== '' ? ' id="' . e($id) . '"' : '') . '><thead><tr>';
    foreach ($cabeceras as $c) $h .= '<th>' . e($c) . '</th>';
    $h .= '</tr></thead><tbody>';
    if (!$filas) $h .= '<tr><td colspan="' . count($cabeceras) . '" class="tenue">' . e($vacio) . '</td></tr>';
    foreach ($filas as $f) $h .= '<tr>' . implode('', array_map(fn($c) => '<td>' . $c . '</td>', $f)) . '</tr>';
    return $h . '</tbody></table></div>';
}

function cc_tarjeta(string $titulo, string $valor, string $pie = '', string $id = ''): string
{
    return '<div class="kpi"' . ($id !== '' ? ' id="' . e($id) . '"' : '') . '><span class="kpi-t">' . e($titulo) . '</span><b class="kpi-v">' . e($valor) . '</b>'
         . ($pie !== '' ? '<span class="kpi-p">' . e($pie) . '</span>' : '') . '</div>';
}

function cc_chip(string $texto, string $tipo = ''): string { return '<span class="chip' . ($tipo !== '' ? ' chip-' . e($tipo) : '') . '">' . e($texto) . '</span>'; }

function cc_estado_compra(string $e): string
{
    return cc_chip($e, ['pagado' => 'ok', 'pendiente' => 'aviso', 'rechazado' => 'mal', 'revertido' => 'mal'][$e] ?? '');
}

// ---------------------------------------------------------------------------------------------- página
function cc_pagina(string $titulo, string $pestana, string $cuerpo, int $http = 200): never
{
    http_response_code($http);
    Http::cabecerasPagina();
    $aviso = cc_tomar_aviso();
    $insignias = cc_insignias();
    echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
       . '<meta name="theme-color" content="#0d0f14"><meta name="robots" content="noindex, nofollow"><title>' . e($titulo) . ' · Centro de Control</title>'
       . '<link rel="icon" href="/icons/favicon-32.png"><link rel="stylesheet" href="' . CC_RUTA . 'assets/control.css?v=2"><script src="' . CC_RUTA . 'assets/control.js?v=2" defer></script></head>'
       . '<body data-pestana="' . e($pestana) . '"><header class="barra"><div class="marca">EN VIVO <b>Tycoon</b> <span>Centro de Control</span></div>';
    if (cc_sesion()) {
        echo '<div class="barra-der"><span class="tenue">' . e(cc_usuario()) . '</span>' . cc_boton('salir', [], 'Salir', 'btn btn-chico btn-sec') . '</div></header>';
        echo '<nav class="pestanas" aria-label="Secciones">';
        foreach (CC_PESTANAS as $k => $n) {
            $b = $insignias[$k] ?? 0;
            echo '<a href="' . e(cc_url(['t' => $k])) . '"' . ($k === $pestana ? ' class="activa" aria-current="page"' : '') . '>' . e($n)
               . ($b > 0 ? ' <span class="insignia">' . (int) $b . '</span>' : '') . '</a>';
        }
        echo '</nav>';
    } else {
        echo '</header>';
    }
    echo '<main class="contenido">';
    if ($aviso) echo '<div class="aviso aviso-' . ($aviso[0] === 'ok' ? 'ok' : 'error') . '" id="aviso" role="status">' . e($aviso[1]) . '</div>';
    echo $cuerpo . '</main><div id="tip" class="tip" hidden></div></body></html>';
    exit;
}

/** Números en las pestañas: casos de soporte abiertos y reportes del chat pendientes. */
function cc_insignias(): array
{
    $o = [];
    try {
        if (Control::tablas('soporte_casos', 'soporte_mensajes')) $o['soporte'] = cc_soporte_conteos()['esperan_respuesta'];
        if (Control::tabla('chat_reportes')) $o['chat'] = (int) Db::valor("SELECT COUNT(DISTINCT mensaje_id) FROM chat_reportes WHERE estado = 'pendiente'");
        if (function_exists('cc_servidores_insignia')) $o['servidores'] = cc_servidores_insignia();
        if (function_exists('cc_facturacion_insignia')) $o['facturacion'] = cc_facturacion_insignia();
        if (function_exists('cc_errores_insignia')) $o['errores'] = cc_errores_insignia();
    } catch (\Throwable) {}
    return $o;
}

function cc_pagina_simple(int $http, string $titulo, string $texto): never
{
    cc_pagina($titulo, '', '<section class="panel"><h1>' . e($titulo) . '</h1><p>' . e($texto) . '</p><p><a class="btn" href="' . CC_RUTA . '">Volver al Centro de Control</a></p></section>', $http);
}

// ---------------------------------------------------------------------------------------------- gráficos (SVG sin librerías)
/**
 * Barras (una o dos series lado a lado). $series = [['nombre' => ..., 'clase' => 's-a', 'valores' => [...]], ...].
 * $fmt da el texto de un valor. Cada barra lleva data-tip (control.js muestra el detalle al pasar o tocar) y <title>.
 */
function cc_grafico_barras(string $titulo, array $etiquetas, array $series, callable $fmt, string $id = ''): string
{
    $W = 420; $H = 220; $iz = 54; $de = 8; $ar = 12; $ab = 26;
    $n = count($etiquetas);
    $max = 0.0;
    foreach ($series as $s) foreach ($s['valores'] as $v) $max = max($max, (float) $v);
    if ($max <= 0) return cc_figura_vacia($titulo, $id);
    $tope = cc_tope($max);
    $ancho = ($W - $iz - $de) / max(1, $n);
    $ns = count($series);
    $hueco = 2;
    $barra = max(2.0, ($ancho - 4 - $hueco * ($ns - 1)) / $ns);
    $y = fn(float $v) => $ar + ($H - $ar - $ab) * (1 - ($tope > 0 ? $v / $tope : 0));
    $svg = '<svg class="grafico" viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="' . e($titulo) . '" preserveAspectRatio="xMidYMid meet">';
    foreach ([0, 0.5, 1] as $f) {
        $yy = round($y($tope * $f), 1);
        $svg .= '<line class="rejilla" x1="' . $iz . '" x2="' . ($W - $de) . '" y1="' . $yy . '" y2="' . $yy . '"/>'
              . '<text class="eje" x="' . ($iz - 6) . '" y="' . ($yy + 4) . '" text-anchor="end">' . e($fmt($tope * $f, true)) . '</text>';
    }
    $paso = max(1, (int) ceil($n / 5));
    foreach ($etiquetas as $i => $et) {
        $x0 = $iz + $i * $ancho + 2;
        foreach ($series as $k => $s) {
            $v = (float) ($s['valores'][$i] ?? 0);
            $x = round($x0 + $k * ($barra + $hueco), 1);
            $y1 = $y($v); $base = $y(0);
            $tip = $et . ' · ' . $s['nombre'] . ': ' . $fmt($v, false);
            if ($v > 0) {
                $r = min(4.0, $barra / 2, $base - $y1);
                $d = sprintf('M%.1f %.1fV%.1fQ%.1f %.1f %.1f %.1fH%.1fQ%.1f %.1f %.1f %.1fV%.1fZ', $x, $base, $y1 + $r, $x, $y1, $x + $r, $y1, $x + $barra - $r, $x + $barra, $y1, $x + $barra, $y1 + $r, $base);
                $svg .= '<path class="' . e($s['clase']) . '" d="' . $d . '"/>';
            }
            // zona sensible más grande que la barra (toda la columna)
            $svg .= '<rect class="zona" x="' . $x . '" y="' . $ar . '" width="' . round($barra, 1) . '" height="' . ($H - $ar - $ab) . '" data-tip="' . e($tip) . '"><title>' . e($tip) . '</title></rect>';
        }
        if ($i === $n - 1) $svg .= '<text class="eje" x="' . round($x0 + $ancho - 4, 1) . '" y="' . ($H - 8) . '" text-anchor="end">' . e($et) . '</text>';
        elseif ($i % $paso === 0 && $i <= $n - 1 - $paso) $svg .= '<text class="eje" x="' . round($x0 + ($ancho - 4) / 2, 1) . '" y="' . ($H - 8) . '" text-anchor="middle">' . e($et) . '</text>';
    }
    $svg .= '<line class="base" x1="' . $iz . '" x2="' . ($W - $de) . '" y1="' . $y(0) . '" y2="' . $y(0) . '"/></svg>';
    return cc_figura($titulo, $svg, $etiquetas, $series, $fmt, $id);
}

/** Línea (una serie). */
function cc_grafico_linea(string $titulo, array $etiquetas, array $serie, callable $fmt, string $id = ''): string
{
    $W = 420; $H = 200; $iz = 54; $de = 12; $ar = 12; $ab = 26;
    $n = count($etiquetas);
    if ((float) max([0, ...$serie['valores']]) <= 0) return cc_figura_vacia($titulo, $id);
    $tope = cc_tope((float) max([0, ...$serie['valores']]));
    $x = fn(int $i) => $iz + ($n > 1 ? $i * ($W - $iz - $de) / ($n - 1) : 0);
    $y = fn(float $v) => $ar + ($H - $ar - $ab) * (1 - ($tope > 0 ? $v / $tope : 0));
    $svg = '<svg class="grafico" viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="' . e($titulo) . '" preserveAspectRatio="xMidYMid meet">';
    foreach ([0, 0.5, 1] as $f) {
        $yy = round($y($tope * $f), 1);
        $svg .= '<line class="rejilla" x1="' . $iz . '" x2="' . ($W - $de) . '" y1="' . $yy . '" y2="' . $yy . '"/><text class="eje" x="' . ($iz - 6) . '" y="' . ($yy + 4) . '" text-anchor="end">' . e($fmt($tope * $f, true)) . '</text>';
    }
    $pts = [];
    foreach ($serie['valores'] as $i => $v) $pts[] = round($x($i), 1) . ',' . round($y((float) $v), 1);
    $svg .= '<polyline class="linea ' . e($serie['clase']) . '" points="' . implode(' ', $pts) . '"/>';
    $paso = max(1, (int) ceil($n / 6));
    $col = ($W - $iz - $de) / max(1, $n - 1);
    foreach ($etiquetas as $i => $et) {
        $v = (float) ($serie['valores'][$i] ?? 0);
        $tip = $et . ' · ' . $serie['nombre'] . ': ' . $fmt($v, false);
        $svg .= '<rect class="zona" x="' . round($x($i) - $col / 2, 1) . '" y="' . $ar . '" width="' . round($col, 1) . '" height="' . ($H - $ar - $ab) . '" data-tip="' . e($tip) . '"><title>' . e($tip) . '</title></rect>';
        $anc = $i === 0 ? 'start' : ($i === $n - 1 ? 'end' : 'middle');
        if ($i === $n - 1 || ($i % $paso === 0 && $i <= $n - 1 - $paso)) $svg .= '<text class="eje" x="' . round($x($i), 1) . '" y="' . ($H - 8) . '" text-anchor="' . $anc . '">' . e($et) . '</text>';
    }
    $ult = count($serie['valores']) - 1;
    if ($ult >= 0) $svg .= '<circle class="punto ' . e($serie['clase']) . '" cx="' . round($x($ult), 1) . '" cy="' . round($y((float) $serie['valores'][$ult]), 1) . '" r="4"/>';
    $svg .= '</svg>';
    return cc_figura($titulo, $svg, $etiquetas, [$serie], $fmt, $id);
}

function cc_figura_vacia(string $titulo, string $id): string
{
    return '<figure class="figura"' . ($id !== '' ? ' id="' . e($id) . '"' : '') . '><figcaption>' . e($titulo) . '</figcaption><p class="vacio tenue">Sin datos en este período.</p></figure>';
}

/** Tope "redondo" del eje: 1, 2, 5 × 10^n. */
function cc_tope(float $max): float
{
    if ($max <= 0) return 1;
    $p = 10 ** floor(log10($max));
    foreach ([1, 2, 5, 10] as $m) if ($m * $p >= $max) return $m * $p;
    return 10 * $p;
}

function cc_figura(string $titulo, string $svg, array $etiquetas, array $series, callable $fmt, string $id): string
{
    $ley = '';
    if (count($series) > 1) {
        $ley = '<div class="leyenda">';
        foreach ($series as $s) $ley .= '<span><i class="muestra ' . e($s['clase']) . '"></i>' . e($s['nombre']) . '</span>';
        $ley .= '</div>';
    }
    $tabla = '<details class="ver-tabla"><summary>Ver como tabla</summary>' . cc_tabla(['Día', ...array_column($series, 'nombre')],
        array_map(fn($i, $et) => [e($et), ...array_map(fn($s) => e($fmt((float) ($s['valores'][$i] ?? 0), false)), $series)], array_keys($etiquetas), $etiquetas)) . '</details>';
    return '<figure class="figura"' . ($id !== '' ? ' id="' . e($id) . '"' : '') . '><figcaption>' . e($titulo) . '</figcaption>' . $ley . $svg . $tabla . '</figure>';
}

/** Días [inicio => 'dd/mm'] de los últimos $n días (hoy incluido) en la zona del juego. */
function cc_dias(int $n): array
{
    $o = [];
    $hoy = strtotime('today');
    for ($i = $n - 1; $i >= 0; $i--) { $d = strtotime('-' . $i . ' days', $hoy); $o[date('Y-m-d', $d)] = date('d/m', $d); }
    return $o;
}

/** Suma por día local: $filas = [[t => segundos, v => valor], ...] -> valores en el orden de cc_dias(). */
function cc_por_dia(array $dias, array $filas, string $t = 't', string $v = 'v'): array
{
    $o = array_fill_keys(array_keys($dias), 0.0);
    foreach ($filas as $f) { $k = date('Y-m-d', (int) $f[$t]); if (isset($o[$k])) $o[$k] += (float) $f[$v]; }
    return array_values($o);
}
