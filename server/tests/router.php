<?php
// SOLO PRUEBAS: enrutador para "php -S" que hace lo mismo que nginx (server/deploy/nginx-sitio.sh).
// Se arranca con la raíz del repositorio como carpeta:  php -S 127.0.0.1:PUERTO -t RAIZ server/tests/router.php
// Lista blanca: archivos del juego, /api/, /pago.php, /admin.php, /control/, /discord/interacciones, legales y /pago-assets/. Todo lo demás: 404.
$ruta = rawurldecode((string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH));
$raiz = dirname(__DIR__, 2);
$pub = $raiz . '/server/public';
$no = function (): bool { http_response_code(404); header('Content-Type: text/plain'); echo "404\n"; return true; };
if (str_contains($ruta, '..') || str_contains($ruta, "\0")) return $no();

if (str_starts_with($ruta, '/api/')) { $_SERVER['SCRIPT_NAME'] = '/api.php'; require $pub . '/api.php'; return true; }
if ($ruta === '/pago.php') { $_SERVER['SCRIPT_NAME'] = '/pago.php'; require $pub . '/pago.php'; return true; }
if ($ruta === '/admin.php') { $_SERVER['SCRIPT_NAME'] = '/admin.php'; require $pub . '/admin.php'; return true; }
if ($ruta === '/discord/interacciones') { $_SERVER['SCRIPT_NAME'] = '/discord/interacciones'; require $pub . '/discord/interacciones.php'; return true; }
if ($ruta === '/control') { header('Location: /control/', true, 301); return true; }
if ($ruta === '/control/') { $_SERVER['SCRIPT_NAME'] = '/control/index.php'; header('Cache-Control: no-store'); header('X-Robots-Tag: noindex, nofollow'); require $pub . '/control/index.php'; return true; }
if (preg_match('#^/control/assets/control\.(css|js)$#', $ruta)) {
    header('Content-Type: ' . (str_ends_with($ruta, '.css') ? 'text/css' : 'text/javascript')); readfile($pub . $ruta); return true;
}
if (str_starts_with($ruta, '/control/')) return $no();

$enviar = function (string $f) use ($no): bool {
    if (!is_file($f)) return $no();
    $tipos = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css', 'js' => 'text/javascript', 'png' => 'image/png', 'svg' => 'image/svg+xml',
              'webmanifest' => 'application/manifest+json', 'json' => 'application/json'];
    header('Content-Type: ' . ($tipos[strtolower(pathinfo($f, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    readfile($f);
    return true;
};
if (str_starts_with($ruta, '/pago-assets/')) return $enviar($pub . '/assets/' . substr($ruta, 13));
// Mismas cabeceras de seguridad que nginx (auditoría A-09): se LEEN de deploy/nginx-sitio.sh (CSP_JUEGO, CSP_LEGAL,
// PERMISOS), así las pruebas del juego corren con la CSP real y nunca quedan desfasadas de la plantilla.
$plantilla = (string) file_get_contents($raiz . '/server/deploy/nginx-sitio.sh');
$var = fn(string $n): string => preg_match('/^' . $n . '="([^"]*)"/m', $plantilla, $m) ? $m[1] : '';
header('X-Frame-Options: DENY'); header('Referrer-Policy: same-origin'); header('X-Content-Type-Options: nosniff');
if ($var('PERMISOS') !== '') header('Permissions-Policy: ' . $var('PERMISOS'));
$csp = function (string $cual) use ($var): void { header('Content-Security-Policy: ' . $var($cual === 'juego' ? 'CSP_JUEGO' : 'CSP_LEGAL')); };
if ($ruta === '/' || $ruta === '/index.html' || $ruta === '/sw.js') $csp('juego');
if (in_array($ruta, ['/terminos.html', '/privacidad.html', '/borrar-cuenta.html'], true)) $csp('legal');
if (in_array($ruta, ['/terminos.html', '/privacidad.html', '/borrar-cuenta.html'], true)) return $enviar($pub . $ruta);
if ($ruta === '/.well-known/assetlinks.json') return $enviar($raiz . $ruta);
if ($ruta === '/') return $enviar($raiz . '/index.html');
if (in_array($ruta, ['/index.html', '/sw.js', '/manifest.webmanifest', '/robots.txt'], true)) return $enviar($raiz . $ruta);
if ($ruta === '/favicon.ico') return $enviar($raiz . '/icons/favicon-32.png');
if (preg_match('#^/(js|icons|css|img|audio|sounds|fonts)/[A-Za-z0-9._/-]+$#', $ruta)) return $enviar($raiz . $ruta);
return $no();
