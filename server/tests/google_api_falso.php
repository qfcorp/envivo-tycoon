<?php
// SOLO PRUEBAS: servidor FALSO de Google (OAuth + Google Play Developer API v3), para server/tests/correr.sh.
// Revisa lo mismo que Google: el JWT de la cuenta de servicio firmado con RS256 (llave pública en FALSO_G_PUB) y el
// token Bearer en cada pedido. Comprobantes (purchaseToken) según cómo empiezan:
//   ok-...    pagado (purchaseState 0), orderId GPA.<hash>, productId = el de la URL, sin obfuscatedExternalAccountId
//   cuenta-<id>-...  pagado y con obfuscatedExternalAccountId "ev-<id>"
//   pend-...  pendiente (2) · canc-... cancelado (1) · otro: 404
// :consume y :acknowledge responden 204 (consume de un token ya consumido: 400, como Google).
// voidedpurchases devuelve lo que diga el archivo FALSO_G_ANULADAS (JSON). Todo se anota en FALSO_G_LOG.
$E = fn(string $k) => (string) getenv($k);
$ruta = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);
$json = function (int $http, $d): void { http_response_code($http); header('Content-Type: application/json'); echo $d === null ? '' : json_encode($d); };
$anotar = function (array $d) use ($E): void { file_put_contents($E('FALSO_G_LOG'), json_encode($d) . "\n", FILE_APPEND | LOCK_EX); };
$b64d = fn(string $s) => base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));

if ($ruta === '/token' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $jwt = (string) ($_POST['assertion'] ?? '');
    $p = explode('.', $jwt);
    $ok = count($p) === 3 && ($_POST['grant_type'] ?? '') === 'urn:ietf:params:oauth:grant-type:jwt-bearer'
        && openssl_verify($p[0] . '.' . $p[1], $b64d($p[2]), (string) file_get_contents($E('FALSO_G_PUB')), OPENSSL_ALGO_SHA256) === 1;
    $c = $ok ? json_decode($b64d($p[1]), true) : null;
    $ok = $ok && ($c['scope'] ?? '') === 'https://www.googleapis.com/auth/androidpublisher' && ($c['exp'] ?? 0) > time();
    $anotar(['ruta' => 'token', 'ok' => $ok]);
    $ok ? $json(200, ['access_token' => 'TOKEN-FALSO-' . hash('crc32b', $jwt), 'expires_in' => 3600, 'token_type' => 'Bearer']) : $json(401, ['error' => 'invalid_grant']);
    return true;
}
$bearer = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
if (!str_starts_with($bearer, 'Bearer TOKEN-FALSO-')) { $anotar(['ruta' => $ruta, 'auth' => false]); $json(401, ['error' => 'unauthenticated']); return true; }
$pkg = $E('FALSO_G_PAQUETE');

if (preg_match('#^/androidpublisher/v3/applications/([^/]+)/purchases/products/([^/]+)/tokens/([^/:]+)(:consume|:acknowledge)?$#', $ruta, $m)) {
    [$todo, $app, $prod, $tok] = [$m[0], rawurldecode($m[1]), rawurldecode($m[2]), rawurldecode($m[3])];
    $accion = $m[4] ?? '';
    if ($app !== $pkg) { $json(404, ['error' => 'paquete']); return true; }
    if ($accion !== '') {
        $marca = $E('FALSO_G_LOG') . '.consumido_' . hash('sha256', $tok);
        if ($accion === ':consume' && is_file($marca)) { $anotar(['ruta' => 'consume', 'tok' => substr($tok, 0, 12), 'repetido' => true]); $json(400, ['error' => ['code' => 400, 'message' => 'The purchase has already been consumed.', 'status' => 'FAILED_PRECONDITION']]); return true; }
        if ($accion === ':consume') touch($marca);
        $anotar(['ruta' => substr($accion, 1), 'tok' => substr($tok, 0, 12), 'prod' => $prod]);
        $json(204, null);
        return true;
    }
    $orden = 'GPA.' . strtoupper(substr(hash('sha256', $tok), 0, 4)) . '-' . substr(hash('sha256', $tok), 4, 4) . '-' . substr(hash('sha256', $tok), 8, 4);
    $base = ['kind' => 'androidpublisher#productPurchase', 'orderId' => $orden, 'productId' => $prod, 'purchaseTimeMillis' => (string) (time() * 1000), 'acknowledgementState' => 0, 'consumptionState' => 0];
    $anotar(['ruta' => 'get', 'tok' => substr($tok, 0, 12), 'prod' => $prod]);
    if (preg_match('/^cuenta-(\d+)-/', $tok, $c)) { $json(200, $base + ['purchaseState' => 0, 'obfuscatedExternalAccountId' => 'ev-' . $c[1]]); return true; }
    if (str_starts_with($tok, 'ok-')) { $json(200, $base + ['purchaseState' => 0]); return true; }
    if (str_starts_with($tok, 'pend-')) { $json(200, $base + ['purchaseState' => 2]); return true; }
    if (str_starts_with($tok, 'canc-')) { $json(200, $base + ['purchaseState' => 1]); return true; }
    $json(404, ['error' => ['code' => 404, 'message' => 'The purchase token was not found.']]);
    return true;
}
if (preg_match('#^/androidpublisher/v3/applications/([^/]+)/purchases/voidedpurchases$#', $ruta, $m)) {
    $f = $E('FALSO_G_ANULADAS');
    $lista = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    $anotar(['ruta' => 'voided', 'n' => count($lista)]);
    $json(200, ['voidedPurchases' => $lista]);
    return true;
}
$json(404, ['error' => 'ruta']);
return true;
