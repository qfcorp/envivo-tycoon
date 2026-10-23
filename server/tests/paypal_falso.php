<?php
// SOLO PRUEBAS: PayPal FALSO (se levanta con "php -S ... server/tests/paypal_falso.php"). Nunca se llama a PayPal de verdad.
// Imita lo que usa src/PayPal.php de la API REST de PayPal:
//   POST /v1/oauth2/token                          Basic client:secret, grant_type=client_credentials -> access_token
//   POST /v2/checkout/orders                       crea la orden (CREATED) con el enlace payer-action a /aprobar
//   GET  /aprobar?token=<orden>[&cancelar=1]       "el comprador aprueba" -> APPROVED y vuelve a return_url?token=..&PayerID=..
//   POST /v2/checkout/orders/<id>/capture          422 ORDER_NOT_APPROVED / ORDER_ALREADY_CAPTURED (salvo el mismo PayPal-Request-Id)
//   GET  /v2/checkout/orders/<id>
//   POST /v1/notifications/verify-webhook-signature   SUCCESS si webhook_id es el bueno y la firma es
//        base64(hmac_sha256(transmission_id|transmission_time|webhook_id|crc32(evento TAL CUAL), FALSO_PP_FIRMA))
//   POST /falso/escenario {orden, valor?, moneda?, estado?, issue?, custom_id?}  cambia lo que devuelve la captura de esa orden
// Estado en archivos JSON en FALSO_PP_DIR. Cada llamada queda en FALSO_PP_DIR/log.jsonl (sin el secreto).
$E = fn(string $k) => (string) getenv($k);
$dir = $E('FALSO_PP_DIR');
$ruta = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);
$metodo = (string) $_SERVER['REQUEST_METHOD'];
$crudo = (string) file_get_contents('php://input');
$in = json_decode($crudo, true) ?: [];
$json = function (int $http, array $d): bool { http_response_code($http); header('Content-Type: application/json'); echo json_encode($d, JSON_UNESCAPED_SLASHES); return true; };
$anotar = function (array $d) use ($dir): void { file_put_contents($dir . '/log.jsonl', json_encode($d, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX); };
$leer = fn(string $id) => is_file("$dir/orden_$id.json") ? json_decode((string) file_get_contents("$dir/orden_$id.json"), true) : null;
$guardar = fn(array $o) => file_put_contents("$dir/orden_{$o['id']}.json", json_encode($o, JSON_UNESCAPED_SLASHES), LOCK_EX);
$token = 'A21AA-falso-' . substr(hash('sha256', $E('FALSO_PP_CLIENTE')), 0, 16);
$bearerOk = ($_SERVER['HTTP_AUTHORIZATION'] ?? '') === 'Bearer ' . $token;
$issue = fn(int $http, string $nombre) => $json($http, ['name' => 'UNPROCESSABLE_ENTITY', 'details' => [['issue' => $nombre]], 'message' => $nombre]);
$vista = function (array $o): array {
    $pu = ['reference_id' => $o['pu']['reference_id'] ?? 'default', 'custom_id' => $o['pu']['custom_id'] ?? null, 'invoice_id' => $o['pu']['invoice_id'] ?? null,
        'amount' => $o['pu']['amount'] ?? null];
    if (!empty($o['captura'])) $pu['payments'] = ['captures' => [$o['captura']]];
    return ['id' => $o['id'], 'status' => $o['status'], 'purchase_units' => [$pu], 'payer' => ['email_address' => 'comprador@prueba.example', 'payer_id' => 'PAYER1'],
        'links' => [['rel' => 'self', 'href' => 'x']]];
};

if ($ruta === '/v1/oauth2/token') {
    $ok = $metodo === 'POST' && hash_equals('Basic ' . base64_encode($E('FALSO_PP_CLIENTE') . ':' . $E('FALSO_PP_SECRETO')), (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ''))
        && str_contains($crudo, 'grant_type=client_credentials');
    $anotar(['ruta' => 'token', 'auth_ok' => $ok]);
    return $ok ? $json(200, ['access_token' => $token, 'token_type' => 'Bearer', 'expires_in' => 32400]) : $json(401, ['error' => 'invalid_client']);
}
if ($ruta === '/aprobar') {
    $o = $leer(preg_replace('/\W/', '', (string) ($_GET['token'] ?? '')));
    if (!$o) { http_response_code(404); echo 'no'; return true; }
    $ctx = $o['ctx'];
    if (!empty($_GET['cancelar'])) { header('Location: ' . $ctx['cancel_url'] . '?token=' . $o['id'], true, 302); return true; }
    if ($o['status'] === 'CREATED') { $o['status'] = 'APPROVED'; $guardar($o); }
    header('Location: ' . $ctx['return_url'] . '?token=' . $o['id'] . '&PayerID=PAYER1', true, 302);
    return true;
}
if ($ruta === '/falso/escenario') {
    $o = $leer(preg_replace('/\W/', '', (string) ($in['orden'] ?? '')));
    if (!$o) return $json(404, ['ok' => false]);
    $o['escenario'] = array_intersect_key($in, array_flip(['valor', 'moneda', 'estado', 'issue', 'custom_id']));
    if (!empty($in['aprobar'])) $o['status'] = 'APPROVED';
    $guardar($o);
    return $json(200, ['ok' => true]);
}
if ($ruta === '/v1/notifications/verify-webhook-signature') {
    // El evento tiene que llegar TAL CUAL (src/PayPal.php no vuelve a armar el JSON): se toma el texto crudo de webhook_event
    $p = strpos($crudo, '"webhook_event":');
    $evento = $p === false ? '' : substr($crudo, $p + 16, -1);
    $esperada = base64_encode(hash_hmac('sha256', ($in['transmission_id'] ?? '') . '|' . ($in['transmission_time'] ?? '') . '|' . $E('FALSO_PP_WEBHOOK') . '|' . crc32($evento), $E('FALSO_PP_FIRMA'), true));
    $ok = $bearerOk && ($in['webhook_id'] ?? '') === $E('FALSO_PP_WEBHOOK') && hash_equals($esperada, (string) ($in['transmission_sig'] ?? '')) && is_array(json_decode($evento, true))
        && ($in['auth_algo'] ?? '') === 'SHA256withRSA';
    $anotar(['ruta' => 'verificar', 'auth_ok' => $bearerOk, 'ok' => $ok]);
    return $json(200, ['verification_status' => $ok ? 'SUCCESS' : 'FAILURE']);
}
if (!$bearerOk) { $anotar(['ruta' => $ruta, 'auth_ok' => false]); return $json(401, ['name' => 'AUTHENTICATION_FAILURE']); }

if ($ruta === '/v2/checkout/orders' && $metodo === 'POST') {
    $id = strtoupper(substr(bin2hex(random_bytes(9)), 0, 17));
    $pu = $in['purchase_units'][0] ?? [];
    $ctx = $in['payment_source']['paypal']['experience_context'] ?? [];
    $o = ['id' => $id, 'status' => 'CREATED', 'pu' => $pu, 'ctx' => $ctx, 'capturas' => 0, 'escenario' => []];
    $guardar($o);
    $anotar(['ruta' => 'crear', 'auth_ok' => true, 'orden' => $id, 'intent' => $in['intent'] ?? null, 'valor' => $pu['amount']['value'] ?? null, 'moneda' => $pu['amount']['currency_code'] ?? null,
        'custom_id' => $pu['custom_id'] ?? null, 'invoice_id' => $pu['invoice_id'] ?? null, 'categoria' => $pu['items'][0]['category'] ?? null, 'envio' => $ctx['shipping_preference'] ?? null,
        'return_url' => $ctx['return_url'] ?? null, 'cancel_url' => $ctx['cancel_url'] ?? null, 'request_id' => $_SERVER['HTTP_PAYPAL_REQUEST_ID'] ?? null]);
    return $json(200, ['id' => $id, 'status' => 'PAYER_ACTION_REQUIRED', 'links' => [['rel' => 'self', 'href' => 'x'],
        ['rel' => 'payer-action', 'href' => $E('FALSO_PP_BASE') . '/aprobar?token=' . $id]]]);
}
if (preg_match('#^/v2/checkout/orders/([A-Z0-9]+)(/capture)?$#', $ruta, $m)) {
    $o = $leer($m[1]);
    if (!$o) return $json(404, ['name' => 'RESOURCE_NOT_FOUND', 'details' => [['issue' => 'INVALID_RESOURCE_ID']]]);
    if (empty($m[2])) { $anotar(['ruta' => 'ver', 'auth_ok' => true, 'orden' => $o['id']]); return $json(200, $vista($o)); }
    $rid = (string) ($_SERVER['HTTP_PAYPAL_REQUEST_ID'] ?? '');
    $anotar(['ruta' => 'capturar', 'auth_ok' => true, 'orden' => $o['id'], 'request_id' => $rid, 'estado_antes' => $o['status']]);
    if ($o['status'] === 'COMPLETED') {
        if ($rid !== '' && $rid === ($o['captura_rid'] ?? null)) return $json(201, $vista($o));   // idempotente por PayPal-Request-Id
        return $issue(422, 'ORDER_ALREADY_CAPTURED');
    }
    if ($o['status'] !== 'APPROVED') return $issue(422, 'ORDER_NOT_APPROVED');
    $esc = $o['escenario'] ?? [];
    if (!empty($esc['issue'])) return $issue(422, (string) $esc['issue']);
    $o['status'] = 'COMPLETED';
    $o['capturas']++;
    $o['captura_rid'] = $rid;
    $valor = (string) ($esc['valor'] ?? $o['pu']['amount']['value']);
    $o['captura'] = ['id' => 'CAP' . strtoupper(substr(bin2hex(random_bytes(8)), 0, 14)), 'status' => (string) ($esc['estado'] ?? 'COMPLETED'),
        'amount' => ['currency_code' => (string) ($esc['moneda'] ?? $o['pu']['amount']['currency_code']), 'value' => $valor],
        'custom_id' => (string) ($esc['custom_id'] ?? $o['pu']['custom_id']), 'invoice_id' => $o['pu']['invoice_id'] ?? null, 'final_capture' => true,
        'seller_receivable_breakdown' => ['gross_amount' => ['currency_code' => 'USD', 'value' => $valor],
            'paypal_fee' => ['currency_code' => 'USD', 'value' => number_format(round((float) $valor * 0.054 + 0.30, 2), 2, '.', '')],
            'net_amount' => ['currency_code' => 'USD', 'value' => number_format((float) $valor - round((float) $valor * 0.054 + 0.30, 2), 2, '.', '')]]]
        + (($esc['estado'] ?? '') === 'PENDING' ? ['status_details' => ['reason' => 'PENDING_REVIEW']] : []);
    if (isset($esc['custom_id'])) $o['pu']['custom_id'] = $esc['custom_id'];
    $guardar($o);
    return $json(201, $vista($o));
}
$anotar(['ruta' => $ruta, 'auth_ok' => true, 'no_existe' => true]);
return $json(404, ['name' => 'NOT_FOUND']);
