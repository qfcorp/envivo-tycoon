<?php
// SOLO PRUEBAS: Tukán Pagos FALSO (php -S 127.0.0.1:PUERTO tukanpagos_falso.php). Imita lo que usa el juego de
// https://pagos.tukanec.com (docs/API.md de qfcorp/tukanpagos): POST /api/v1/cobros, GET /api/v1/cobros?referencia=,
// GET /api/v1/planes. Para la prueba: POST /_falso/estado {referencia, estado} cambia el estado de un cobro.
// FALSO_TKP_DIR (carpeta), FALSO_TKP_CLAVE (la clave Bearer que acepta), FALSO_TKP_BASE (su dirección).
$dir = getenv('FALSO_TKP_DIR'); $clave = getenv('FALSO_TKP_CLAVE'); $base = getenv('FALSO_TKP_BASE');
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$metodo = $_SERVER['REQUEST_METHOD'];
$cuerpo = (string) file_get_contents('php://input');
$in = json_decode($cuerpo, true) ?: [];
$auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$authOk = $auth === 'Bearer ' . $clave;
file_put_contents($dir . '/log.jsonl', json_encode(['ruta' => $ruta, 'metodo' => $metodo, 'auth_ok' => $authOk, 'cuerpo' => $in, 'query' => $_GET]) . "\n", FILE_APPEND);
$responder = function (int $http, array $j): never { http_response_code($http); header('Content-Type: application/json'); echo json_encode($j); exit; };
$archivo = fn(string $ref) => $dir . '/cobro_' . preg_replace('/[^a-z0-9_-]/i', '_', $ref) . '.json';

if ($ruta === '/_falso/estado') {
    $f = $archivo((string) ($in['referencia'] ?? ''));
    $c = json_decode((string) @file_get_contents($f), true);
    if (!$c) $responder(404, ['ok' => false]);
    $c['estado'] = (string) $in['estado'];
    if (isset($in['monto'])) $c['monto'] = (float) $in['monto'];
    file_put_contents($f, json_encode($c));
    $responder(200, ['ok' => true, 'cobro' => $c]);
}
if (!$authOk) $responder(401, ['ok' => false, 'error' => 'Clave no válida']);
if ($ruta === '/api/v1/planes') $responder(200, ['ok' => true, 'programa' => 'envivo', 'planes' => [], 'iva' => 15, 'plux' => 'sandbox']);
if ($ruta === '/api/v1/cobros' && $metodo === 'POST') {
    foreach (['referencia', 'descripcion', 'monto', 'url_regreso'] as $k) if (!isset($in[$k]) || $in[$k] === '') $responder(422, ['ok' => false, 'error' => "Falta $k"]);
    $f = $archivo((string) $in['referencia']);
    $c = json_decode((string) @file_get_contents($f), true);
    if ($c && abs((float) $c['monto'] - (float) $in['monto']) > 0.001) $responder(422, ['ok' => false, 'error' => 'Esa referencia ya tiene otro monto']);
    if (!$c) {
        $n = count(glob($dir . '/cobro_*.json')) + 1;
        $c = ['id' => $n, 'referencia' => $in['referencia'], 'estado' => 'pendiente', 'monto' => (float) $in['monto'], 'descripcion' => $in['descripcion'],
              'url_pago' => $base . '/pagar/' . bin2hex(random_bytes(8)), 'metadatos' => $in['metadatos'] ?? [], 'url_regreso' => $in['url_regreso']];
        file_put_contents($f, json_encode($c));
    }
    $responder(201, ['ok' => true, 'cobro' => $c]);
}
if ($ruta === '/api/v1/cobros' && $metodo === 'GET') {
    $c = json_decode((string) @file_get_contents($archivo((string) ($_GET['referencia'] ?? ''))), true);
    if (!$c) $responder(404, ['ok' => false, 'error' => 'No existe']);
    $responder(200, ['ok' => true, 'cobro' => $c]);
}
$responder(404, ['ok' => false, 'error' => 'Ruta desconocida']);
