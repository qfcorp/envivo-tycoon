<?php
// SOLO PRUEBAS: enrutador para "php -S" que hace lo mismo que nginx (server/deploy/nginx-sitio.sh).
// Se arranca con la raíz del repositorio como carpeta:  php -S 127.0.0.1:PUERTO -t RAIZ server/tests/router.php
// Lista blanca: archivos del juego, /api/, /pago.php, /admin.php, legales y /pago-assets/. Todo lo demás: 404.
$ruta = rawurldecode((string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH));
$raiz = dirname(__DIR__, 2);
$pub = $raiz . '/server/public';
$no = function (): bool { http_response_code(404); header('Content-Type: text/plain'); echo "404\n"; return true; };
if (str_contains($ruta, '..') || str_contains($ruta, "\0")) return $no();

if (str_starts_with($ruta, '/api/')) { $_SERVER['SCRIPT_NAME'] = '/api.php'; require $pub . '/api.php'; return true; }
if ($ruta === '/pago.php') { $_SERVER['SCRIPT_NAME'] = '/pago.php'; require $pub . '/pago.php'; return true; }
if ($ruta === '/admin.php') { $_SERVER['SCRIPT_NAME'] = '/admin.php'; require $pub . '/admin.php'; return true; }

$enviar = function (string $f) use ($no): bool {
    if (!is_file($f)) return $no();
    $tipos = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css', 'js' => 'text/javascript', 'png' => 'image/png', 'svg' => 'image/svg+xml',
              'webmanifest' => 'application/manifest+json', 'json' => 'application/json'];
    header('Content-Type: ' . ($tipos[strtolower(pathinfo($f, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    readfile($f);
    return true;
};
if (str_starts_with($ruta, '/pago-assets/')) return $enviar($pub . '/assets/' . substr($ruta, 13));
// Mismas cabeceras de seguridad que nginx (deploy/nginx-sitio.sh, auditoría A-09): así las pruebas del juego corren con la CSP real
$csp = function (string $cual): void {
    header('X-Frame-Options: DENY'); header('Referrer-Policy: same-origin'); header('X-Content-Type-Options: nosniff');
    $v = $cual === 'juego'
        ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        : "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
    header('Content-Security-Policy: ' . $v);
};
if ($ruta === '/' || $ruta === '/index.html' || $ruta === '/sw.js') $csp('juego');
if (in_array($ruta, ['/terminos.html', '/privacidad.html', '/borrar-cuenta.html'], true)) $csp('legal');
if (in_array($ruta, ['/terminos.html', '/privacidad.html', '/borrar-cuenta.html'], true)) return $enviar($pub . $ruta);
if ($ruta === '/.well-known/assetlinks.json') return $enviar($raiz . $ruta);
if ($ruta === '/') return $enviar($raiz . '/index.html');
if (in_array($ruta, ['/index.html', '/sw.js', '/manifest.webmanifest', '/robots.txt'], true)) return $enviar($raiz . $ruta);
if ($ruta === '/favicon.ico') return $enviar($raiz . '/icons/favicon-32.png');
if (preg_match('#^/(js|icons|css|img|audio|sounds|fonts)/[A-Za-z0-9._/-]+$#', $ruta)) return $enviar($raiz . $ruta);
return $no();
