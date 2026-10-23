<?php
// SOLO PRUEBAS: servicio de push FALSO para "php -S" (lo arranca server/tests/pruebas_push.php). Guarda cada petición
// (ruta, cabeceras y cuerpo cifrado en base64) en PUSH_FALSO_DIR y responde según la ruta, como FCM / Mozilla:
//   /ok/...    201 Created        /gone/...  410 Gone (suscripción muerta)     /nf/...  404 Not Found
//   /err/...   500 (reintentar)   /lento/... 429 Too Many Requests
$dir = getenv('PUSH_FALSO_DIR') ?: sys_get_temp_dir();
$ruta = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);
$cab = [];
foreach ($_SERVER as $k => $v) if (str_starts_with($k, 'HTTP_')) $cab[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
if (isset($_SERVER['CONTENT_TYPE'])) $cab['content-type'] = $_SERVER['CONTENT_TYPE'];
$cuerpo = (string) file_get_contents('php://input');
$n = sprintf('%s/push_%s_%s.json', $dir, str_pad((string) hrtime(true), 20, '0', STR_PAD_LEFT), bin2hex(random_bytes(3)));
file_put_contents($n, json_encode(['metodo' => $_SERVER['REQUEST_METHOD'], 'ruta' => $ruta, 'cabeceras' => $cab, 'cuerpo' => base64_encode($cuerpo)]));
$codigo = match (true) {
    str_starts_with($ruta, '/ok/') => 201,
    str_starts_with($ruta, '/gone/') => 410,
    str_starts_with($ruta, '/nf/') => 404,
    str_starts_with($ruta, '/err/') => 500,
    str_starts_with($ruta, '/lento/') => 429,
    default => 400,
};
http_response_code($codigo);
header('Content-Type: text/plain');
echo $codigo === 201 ? '' : "codigo $codigo\n";
return true;
