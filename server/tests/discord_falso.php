<?php
// SOLO PRUEBAS: API de Discord FALSA para server/tests/pruebas_discord.php. Se arranca con:
//   DISCORD_FALSO_ESTADO=archivo.json DISCORD_FALSO_LOG=archivo.log DISCORD_FALSO_TOKEN=... php -S 127.0.0.1:PUERTO server/tests/discord_falso.php
// Imita lo que usa el bot (prefijo /api/v10): roles del servidor, miembros, poner/quitar roles, editar la respuesta de una
// interacción, webhooks de anuncios y registro de comandos. Se puede pedir que responda 429 (límite), que avise
// X-RateLimit-Remaining: 0, que sea lento o que no deje poner roles (403). Cada petición queda en el log (JSON por línea)
// SIN el token del bot ni el de los webhooks (se guarda solo una huella sha256).
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }

$EST = (string) getenv('DISCORD_FALSO_ESTADO');
$LOG = (string) getenv('DISCORD_FALSO_LOG');
$TOKEN = (string) getenv('DISCORD_FALSO_TOKEN');
$metodo = $_SERVER['REQUEST_METHOD'];
$ruta = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$cuerpoTxt = (string) file_get_contents('php://input');
$cuerpo = $cuerpoTxt !== '' ? json_decode($cuerpoTxt, true) : null;
$auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$authTipo = $auth === '' ? 'ninguna' : ($auth === 'Bot ' . $TOKEN ? 'bot_ok' : 'mala');
$huella = fn(string $t) => 'h:' . substr(hash('sha256', $t), 0, 12);
$rutaLog = preg_replace_callback('#^(/api/v10/webhooks/\d+/)([^/]+)#', fn($m) => $m[1] . $huella($m[2]), $ruta);

$f = fopen($EST, 'c+');
flock($f, LOCK_EX);
$e = json_decode((string) stream_get_contents($f), true) ?: [];
$guardar = function () use (&$e, $f) { ftruncate($f, 0); rewind($f); fwrite($f, json_encode($e, JSON_UNESCAPED_UNICODE)); fflush($f); };
$cab = [];
$resp = function (int $codigo, $datos = null) use (&$cab, $metodo, $rutaLog, $authTipo, $cuerpo, $LOG, $guardar, $f) {
    $guardar();
    flock($f, LOCK_UN);
    $razon = isset($_SERVER['HTTP_X_AUDIT_LOG_REASON']) ? rawurldecode($_SERVER['HTTP_X_AUDIT_LOG_REASON']) : null;
    file_put_contents($LOG, json_encode(['t' => microtime(true), 'metodo' => $metodo, 'ruta' => $rutaLog, 'auth' => $authTipo, 'codigo' => $codigo,
        'cuerpo' => $cuerpo, 'razon' => $razon, 'agente' => $_SERVER['HTTP_USER_AGENT'] ?? '', 'largo' => $_SERVER['CONTENT_LENGTH'] ?? null], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
    http_response_code($codigo);
    foreach ($cab as $k => $v) header("$k: $v");
    if ($datos !== null) { header('Content-Type: application/json'); echo json_encode($datos, JSON_UNESCAPED_UNICODE); }
    exit;
};

if (!empty($e['lento'])) usleep((int) ($e['lento'] * 1e6));
$esWebhook = str_starts_with($ruta, '/api/v10/webhooks/');
if (!$esWebhook && $authTipo !== 'bot_ok') $resp(401, ['message' => '401: Unauthorized', 'code' => 0]);
if (!empty($e['limitar'])) {
    $e['limitar']--;
    $ra = (float) ($e['limitar_ra'] ?? 0.3);
    $cab = ['Retry-After' => (string) (int) ceil($ra), 'X-RateLimit-Scope' => 'user'];
    if (!empty($e['limitar_global'])) $cab['X-RateLimit-Global'] = 'true';
    $resp(429, ['message' => 'You are being rate limited.', 'retry_after' => $ra, 'global' => !empty($e['limitar_global'])]);
}
if (!empty($e['remaining0'])) { $e['remaining0']--; $cab = ['X-RateLimit-Limit' => '5', 'X-RateLimit-Remaining' => '0', 'X-RateLimit-Reset-After' => (string) ($e['reset_after'] ?? 0.4)]; }
else $cab = ['X-RateLimit-Limit' => '5', 'X-RateLimit-Remaining' => '4', 'X-RateLimit-Reset-After' => '1'];
if (!empty($e['fallar_500'])) { $e['fallar_500']--; $resp(500, ['message' => 'Internal error']); }

$G = (string) ($e['guild'] ?? '');
if ($metodo === 'GET' && $ruta === "/api/v10/guilds/$G/roles") $resp(200, $e['roles'] ?? []);
if (preg_match("#^/api/v10/guilds/$G/members/(\d+)$#", $ruta, $m) && $metodo === 'GET') {
    if (!isset($e['miembros'][$m[1]])) $resp(404, ['message' => 'Unknown Member', 'code' => 10007]);
    $resp(200, ['user' => ['id' => $m[1], 'username' => 'u' . $m[1]], 'roles' => array_values($e['miembros'][$m[1]])]);
}
if (preg_match("#^/api/v10/guilds/$G/members/(\d+)/roles/(\d+)$#", $ruta, $m) && in_array($metodo, ['PUT', 'DELETE'], true)) {
    if (!isset($e['miembros'][$m[1]])) $resp(404, ['message' => 'Unknown Member', 'code' => 10007]);
    if (!in_array($m[2], array_column($e['roles'] ?? [], 'id'), true)) $resp(404, ['message' => 'Unknown Role', 'code' => 10011]);
    if (!empty($e['prohibir_roles'])) $resp(403, ['message' => 'Missing Permissions', 'code' => 50013]);
    $r = array_values(array_filter($e['miembros'][$m[1]], fn($x) => $x !== $m[2]));
    if ($metodo === 'PUT') $r[] = $m[2];
    $e['miembros'][$m[1]] = $r;
    $resp(204);
}
if (preg_match('#^/api/v10/webhooks/(\d+)/([^/]+)/messages/@original$#', $ruta, $m) && $metodo === 'PATCH') {
    if (!empty($e['fallar_webhook'])) $resp(500, ['message' => 'Internal error', 'code' => 0]);
    $resp(200, ['id' => '9' . random_int(100000000, 999999999), 'content' => $cuerpo['content'] ?? '']);
}
if (preg_match('#^/api/v10/webhooks/(\d+)/([^/]+)$#', $ruta, $m) && $metodo === 'POST') $resp(200, ['id' => '8' . random_int(100000000, 999999999), 'channel_id' => '1']);
if (preg_match('#^/api/v10/applications/(\d+)(/guilds/\d+)?/commands$#', $ruta, $m) && $metodo === 'PUT') {
    $e['comandos'] = $cuerpo;
    $resp(200, array_map(fn($c, $n) => $c + ['id' => (string) (7000 + $n), 'application_id' => $m[1], 'version' => '1'], is_array($cuerpo) ? $cuerpo : [], array_keys(is_array($cuerpo) ? $cuerpo : [])));
}
$resp(404, ['message' => '404: Not Found', 'code' => 0]);
