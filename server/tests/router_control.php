<?php
// SOLO PRUEBAS: enrutador para "php -S" del Centro de Control. Hace lo mismo que el bloque de nginx de
// server/INTEGRAR_CONTROL.md: /control/ -> server/public/control/index.php, /control/assets/ (lista blanca de archivos)
// y todo lo demás de /control/ da 404. Lo que no es /control/ lo atiende el enrutador del juego (router.php).
// Uso: php -S 127.0.0.1:PUERTO -t RAIZ server/tests/router_control.php
$ruta = rawurldecode((string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH));
$ctl = dirname(__DIR__) . '/public/control';
if ($ruta === '/control') { header('Location: /control/', true, 301); return true; }
if ($ruta === '/control/' || $ruta === '/control/index.php') {
    $_SERVER['SCRIPT_NAME'] = '/control/index.php';
    require $ctl . '/index.php';
    return true;
}
if (str_starts_with($ruta, '/control/')) {
    if (preg_match('#^/control/assets/([a-z0-9_-]+\.(css|js))$#', $ruta, $m) && is_file($ctl . '/assets/' . $m[1])) {
        header('Content-Type: ' . ($m[2] === 'css' ? 'text/css' : 'text/javascript') . '; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        readfile($ctl . '/assets/' . $m[1]);
        return true;
    }
    http_response_code(404); header('Content-Type: text/plain'); echo "404\n"; return true;
}
return require __DIR__ . '/router.php';
