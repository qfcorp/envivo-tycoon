<?php
// SOLO PRUEBAS (server/tests/pruebas_discord.php): enrutador para "php -S" con lo mismo que nginx para el bot de Discord.
//   /api/...                  -> <EV_SRV>/public/api.php   (EV_SRV = copia de server/ con los cambios de INTEGRAR_DISCORD.md)
//   /discord/interacciones    -> <EV_SRV>/public/discord/interacciones.php
//   todo lo demás             -> 404 (igual que la lista blanca de nginx)
$ruta = rawurldecode((string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH));
$srv = (string) getenv('EV_SRV');
if ($srv === '' || str_contains($ruta, '..')) { http_response_code(404); exit; }
if (str_starts_with($ruta, '/api/')) { $_SERVER['SCRIPT_NAME'] = '/api.php'; require $srv . '/public/api.php'; return true; }
if ($ruta === '/discord/interacciones') { $_SERVER['SCRIPT_NAME'] = '/discord/interacciones'; require $srv . '/public/discord/interacciones.php'; return true; }
http_response_code(404);
header('Content-Type: text/plain');
echo "404\n";
return true;
