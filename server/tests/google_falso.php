<?php
// SOLO PRUEBAS: servidor FALSO de Google (OAuth + androidpublisher v3). Se levanta con
//   php -S 127.0.0.1:PUERTO server/tests/google_falso.php
// Nunca se llama a Google de verdad. Revisa lo mismo que Google:
//  - POST /token: grant_type jwt-bearer y el JWT firmado RS256 con la llave de la cuenta de servicio (verifica la firma con
//    la llave PÚBLICA), iss = correo de la cuenta, aud = esta dirección, scope androidpublisher, iat/exp válidos (máx. 1 h).
//  - Las rutas de la API exigen "Authorization: Bearer <token que dio /token>" y el paquete correcto.
// Datos (los escribe la prueba en FALSO_GOOGLE_DIR):
//   publica.pem      llave pública de la cuenta de servicio
//   compras.json     { "<purchaseToken>": { productId, orderId, purchaseState, purchaseType?, obfuscatedExternalAccountId?, ... } }
//   anuladas.json    [ { purchaseToken, orderId, voidedTimeMillis, voidedReason, voidedSource, purchaseTimeMillis }, ... ]
//   tokens.json      tokens dados (la prueba lo borra para simular un token vencido -> 401)
//   log.jsonl        una línea por pedido (sin llaves)
// Variables: FALSO_GOOGLE_DIR, FALSO_GOOGLE_EMAIL, FALSO_GOOGLE_PAQUETE, FALSO_GOOGLE_BASE (http://127.0.0.1:PUERTO)
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }
$E = fn(string $k) => (string) getenv($k);
$dir = $E('FALSO_GOOGLE_DIR');
$leer = function (string $f, $def) use ($dir) { $t = @file_get_contents("$dir/$f"); $j = is_string($t) ? json_decode($t, true) : null; return is_array($j) ? $j : $def; };
$escribir = function (string $f, $d) use ($dir): void { file_put_contents("$dir/$f", json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX); };
$anotar = function (array $d) use ($dir): void { file_put_contents("$dir/log.jsonl", json_encode($d, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX); };
$json = function (int $http, array $d): bool { http_response_code($http); header('Content-Type: application/json'); echo json_encode($d, JSON_UNESCAPED_SLASHES); return true; };
$b64d = fn(string $s) => base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
$ruta = rawurldecode((string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH));
$metodo = $_SERVER['REQUEST_METHOD'];
$cuerpo = (string) file_get_contents('php://input');

// ---------------------------------------------------------------- OAuth
if ($ruta === '/token') {
    parse_str($cuerpo, $f);
    $ct = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
    $jwt = (string) ($f['assertion'] ?? '');
    $p = explode('.', $jwt);
    $motivo = '';
    $cab = $datos = null;
    if ($metodo !== 'POST' || !str_starts_with($ct, 'application/x-www-form-urlencoded')) $motivo = 'metodo_o_tipo';
    elseif (($f['grant_type'] ?? '') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer') $motivo = 'grant_type';
    elseif (count($p) !== 3) $motivo = 'jwt_partes';
    else {
        $cab = json_decode((string) $b64d($p[0]), true);
        $datos = json_decode((string) $b64d($p[1]), true);
        $firma = $b64d($p[2]);
        $pub = openssl_pkey_get_public((string) @file_get_contents("$dir/publica.pem"));
        $t = time();
        if (!is_array($cab) || ($cab['alg'] ?? '') !== 'RS256' || ($cab['typ'] ?? '') !== 'JWT') $motivo = 'cabecera';
        elseif ($pub === false || !is_string($firma) || openssl_verify($p[0] . '.' . $p[1], $firma, $pub, OPENSSL_ALGO_SHA256) !== 1) $motivo = 'firma';
        elseif (!is_array($datos) || ($datos['iss'] ?? '') !== $E('FALSO_GOOGLE_EMAIL')) $motivo = 'iss';
        elseif (($datos['aud'] ?? '') !== $E('FALSO_GOOGLE_BASE') . '/token') $motivo = 'aud';
        elseif (($datos['scope'] ?? '') !== 'https://www.googleapis.com/auth/androidpublisher') $motivo = 'scope';
        elseif (!is_int($datos['iat'] ?? null) || !is_int($datos['exp'] ?? null) || $datos['iat'] > $t + 60 || $datos['exp'] <= $t || $datos['exp'] - $datos['iat'] > 3600) $motivo = 'tiempo';
    }
    $anotar(['ruta' => 'token', 'jwt_ok' => $motivo === '', 'motivo' => $motivo, 'kid' => $cab['kid'] ?? null]);
    if ($motivo !== '') return $json(400, ['error' => 'invalid_grant', 'error_description' => 'JWT no válido: ' . $motivo]);
    $tok = 'ya29.falso-' . bin2hex(random_bytes(12));
    $ts = $leer('tokens.json', []);
    $ts[$tok] = time() + 3600;
    $escribir('tokens.json', $ts);
    return $json(200, ['access_token' => $tok, 'expires_in' => 3599, 'token_type' => 'Bearer']);
}

// ---------------------------------------------------------------- API
$auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$tok = str_starts_with($auth, 'Bearer ') ? substr($auth, 7) : '';
$ts = $leer('tokens.json', []);
$bearerOk = $tok !== '' && isset($ts[$tok]) && $ts[$tok] > time();
$base = '/androidpublisher/v3/applications/';
if (!str_starts_with($ruta, $base)) { $anotar(['ruta' => 'desconocida', 'path' => $ruta]); return $json(404, ['error' => ['code' => 404, 'message' => 'Not found']]); }
$resto = substr($ruta, strlen($base));
$paquete = explode('/', $resto, 2)[0];
if (!$bearerOk) { $anotar(['ruta' => 'api', 'bearer_ok' => false, 'path' => $ruta]); return $json(401, ['error' => ['code' => 401, 'message' => 'Request had invalid authentication credentials.', 'status' => 'UNAUTHENTICATED']]); }
if ($paquete !== $E('FALSO_GOOGLE_PAQUETE')) { $anotar(['ruta' => 'api', 'bearer_ok' => true, 'paquete_ok' => false]); return $json(404, ['error' => ['code' => 404, 'message' => 'No application was found for the given package name.']]); }

// purchases.products.get / :acknowledge / :consume
if (preg_match('#^[^/]+/purchases/products/([^/]+)/tokens/([^/:]+)(:acknowledge|:consume)?$#', $resto, $m)) {
    [$producto, $ptoken, $accion] = [$m[1], $m[2], $m[3] ?? ''];
    $compras = $leer('compras.json', []);
    $c = $compras[$ptoken] ?? null;
    if (!$c || ($c['productId'] ?? '') !== $producto) {
        $anotar(['ruta' => 'producto' . $accion, 'bearer_ok' => true, 'encontrada' => false, 'producto' => $producto]);
        return $json(404, ['error' => ['code' => 404, 'message' => 'The purchase token does not match the product ID.']]);
    }
    if ($accion === '') {
        if ($metodo !== 'GET') return $json(405, ['error' => ['code' => 405]]);
        $anotar(['ruta' => 'producto', 'bearer_ok' => true, 'encontrada' => true, 'producto' => $producto, 'orden' => $c['orderId'] ?? null]);
        return $json(200, ['kind' => 'androidpublisher#productPurchase', 'purchaseTimeMillis' => (string) ((time() - 30) * 1000), 'consumptionState' => 0,
            'developerPayload' => '', 'acknowledgementState' => 0, 'quantity' => 1, 'regionCode' => 'EC'] + $c);
    }
    if ($metodo !== 'POST') return $json(405, ['error' => ['code' => 405]]);
    $campo = $accion === ':acknowledge' ? 'acknowledgementState' : 'consumptionState';
    if (!empty($c['falla_aviso'])) {   // la prueba pide que el aviso falle una vez
        $compras[$ptoken]['falla_aviso'] = false; $escribir('compras.json', $compras);
        $anotar(['ruta' => 'aviso' . $accion, 'bearer_ok' => true, 'resultado' => 503]);
        return $json(503, ['error' => ['code' => 503, 'message' => 'Backend error']]);
    }
    if ((int) ($c[$campo] ?? 0) === 1) {
        $anotar(['ruta' => 'aviso' . $accion, 'bearer_ok' => true, 'resultado' => 400, 'ya' => true]);
        return $json(400, ['error' => ['code' => 400, 'message' => 'The purchase is already ' . ($accion === ':acknowledge' ? 'acknowledged' : 'consumed') . '.']]);
    }
    $compras[$ptoken][$campo] = 1;
    if ($accion === ':consume') $compras[$ptoken]['acknowledgementState'] = 1;
    $escribir('compras.json', $compras);
    $in = json_decode($cuerpo, true);
    $anotar(['ruta' => 'aviso' . $accion, 'bearer_ok' => true, 'resultado' => 200, 'payload' => is_array($in) ? ($in['developerPayload'] ?? null) : null]);
    http_response_code(204);   // Google responde vacío
    return true;
}

// purchases.voidedpurchases.list (páginas de 2 para probar la paginación)
if (preg_match('#^[^/]+/purchases/voidedpurchases$#', $resto)) {
    $desde = (int) ($_GET['startTime'] ?? 0);
    $minimo = (time() - 30 * 86400 - 120) * 1000;   // Google no acepta más de 30 días atrás (2 minutos de tolerancia)
    if ($desde < $minimo) { $anotar(['ruta' => 'anuladas', 'bearer_ok' => true, 'error' => 'startTime viejo']); return $json(400, ['error' => ['code' => 400, 'message' => 'startTime too far in the past']]); }
    $lista = array_values(array_filter($leer('anuladas.json', []), fn($v) => (int) $v['voidedTimeMillis'] >= $desde));
    usort($lista, fn($a, $b) => $a['voidedTimeMillis'] <=> $b['voidedTimeMillis']);
    $off = isset($_GET['token']) && preg_match('/^p(\d+)$/', (string) $_GET['token'], $mm) ? (int) $mm[1] : 0;
    $pagina = array_slice($lista, $off, 2);
    // Como Google: los *Millis (int64) llegan como texto; voidedReason y voidedSource como número
    $r = ['voidedPurchases' => array_map(function ($v) {
        foreach ($v as $k => $x) if (str_ends_with($k, 'Millis')) $v[$k] = (string) $x;
        return ['kind' => 'androidpublisher#voidedPurchase'] + $v;
    }, $pagina)];
    if (count($lista) > $off + 2) $r['tokenPagination'] = ['nextPageToken' => 'p' . ($off + 2)];
    if (!$pagina) $r = [];
    $anotar(['ruta' => 'anuladas', 'bearer_ok' => true, 'startTime' => $desde, 'type' => $_GET['type'] ?? null, 'token' => $_GET['token'] ?? null, 'n' => count($pagina)]);
    return $json(200, $r);
}
$anotar(['ruta' => 'desconocida', 'path' => $ruta]);
return $json(404, ['error' => ['code' => 404, 'message' => 'Not found']]);
