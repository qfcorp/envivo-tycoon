<?php
declare(strict_types=1);

// Bot de Discord de EN VIVO Tycoon: aquí llegan TODOS los comandos (/vincular, /perfil, /ranking...) que Discord manda por POST
// a https://juego.tukanec.com/discord/interacciones ("Interactions Endpoint URL" del Developer Portal; ver docs/DISCORD_BOT.md).
// 1. Revisa la firma Ed25519 de Discord (sin firma válida -> 401: así lo exige Discord y nadie más puede usar esta dirección).
// 2. PING -> PONG. Comandos -> Discord::manejar() responde en menos de 3 segundos; lo lento (poner roles) va DESPUÉS de
//    responder (fastcgi_finish_request) y el mensaje "pensando..." se cambia por el resultado.
// Nunca se escribe en los registros el token del bot ni el de la interacción.

require dirname(__DIR__, 2) . '/src/arranque.php';

use EnVivo\{Db, Discord};

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$responder = function (int $http, array $datos): void {
    $json = json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    http_response_code($http);
    header('Content-Type: application/json');
    header('Content-Length: ' . strlen((string) $json));
    echo $json;
};

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); $responder(405, ['error' => 'method not allowed']); exit; }

$cuerpo = (string) file_get_contents('php://input', false, null, 0, 200001);
if (strlen($cuerpo) > 200000) { $responder(413, ['error' => 'too large']); exit; }
if (Discord::appId() === '' || \EnVivo\Config::get('DISCORD_PUBLIC_KEY') === '') { $responder(503, ['error' => 'not configured']); exit; }

$firma = (string) ($_SERVER['HTTP_X_SIGNATURE_ED25519'] ?? '');
$momento = (string) ($_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'] ?? '');
if (!Discord::verificarFirma($firma, $momento, $cuerpo)) { $responder(401, ['error' => 'invalid request signature']); exit; }

$i = json_decode($cuerpo, true);
if (!is_array($i) || !isset($i['type'])) { $responder(400, ['error' => 'bad request']); exit; }
if ((int) $i['type'] === 1) { $responder(200, ['type' => 1]); exit; }   // PING de Discord (al guardar la dirección en el portal)

try {
    Db::pdo();
    $r = Discord::manejar($i);
} catch (\Throwable $e) {
    error_log(Discord::ocultar('EN VIVO discord: ' . get_class($e) . ' en ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 200)));
    $r = ['respuesta' => Discord::mensaje(Discord::t(Discord::idioma($i), 'error'), true), 'despues' => null];
}

if ($r['despues'] === null) { $responder(200, $r['respuesta']); exit; }

// Responder YA ("pensando...") y seguir trabajando sin que Discord espere.
ignore_user_abort(true);
set_time_limit(120);
$fpm = function_exists('fastcgi_finish_request');
if (!$fpm) header('Connection: close');             // php -S (pruebas): con Content-Length el cliente termina de leer aquí
$responder(200, $r['respuesta']);
if ($fpm) {
    fastcgi_finish_request();                       // php-fpm (el servidor): Discord recibe la respuesta aquí mismo
} else {
    while (ob_get_level() > 0) ob_end_flush();
    flush();
}
try {
    ($r['despues'])();
} catch (\Throwable $e) {
    error_log(Discord::ocultar('EN VIVO discord (después de responder): ' . get_class($e) . ' en ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 200)));
}
