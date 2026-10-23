<?php
// SOLO PRUEBAS (las corre server/tests/correr.sh; nunca en el servidor). Prueba el servidor de EN VIVO Tycoon por HTTP contra
// "php -S" (con el enrutador que imita a nginx), una base SQLite temporal y el servidor FALSO de Plux.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
$E = fn(string $k) => (string) getenv($k);
$URL = $E('EV_URL'); $URL_SIN = $E('EV_URL_SINPLUX'); $TMP = $E('EV_TMP');
$pdo = new PDO('sqlite:' . $E('EV_DB'), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec('PRAGMA busy_timeout = 10000');
$val = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); };
$fila = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetch(); };
$exec = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->rowCount(); };

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }
function cerca(int $a, int $b, int $tol = 120): bool { return abs($a - $b) <= $tol; }

/** Un "navegador" con sus propias galletas. */
final class Nav {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public array $galletas = []; public string $lugar = '';
    private string $jar;
    public function __construct(private string $base, string $nombre) { $this->jar = getenv('EV_TMP') . "/jar_$nombre"; @unlink($this->jar); }
    public function pedir(string $metodo, string $ruta, $datos = null, array $cab = []): int {
        $ch = curl_init(str_starts_with($ruta, 'http') ? $ruta : $this->base . $ruta);
        $this->cab = []; $this->galletas = [];
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $metodo,
            CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 60,
            CURLOPT_HEADERFUNCTION => function ($c, $h) {
                $p = explode(':', $h, 2);
                if (count($p) === 2) { $k = strtolower(trim($p[0])); $this->cab[$k] = trim($p[1]); if ($k === 'set-cookie') $this->galletas[] = trim($p[1]); }
                return strlen($h);
            }]);
        if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $datos);
        $this->cuerpo = (string) curl_exec($ch);
        $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lugar = (string) ($this->cab['location'] ?? '');
        return $this->http;
    }
    public function get(string $r, array $cab = []): int { return $this->pedir('GET', $r, null, $cab); }
    /** POST JSON a la API (con la cabecera X-Envivo: 1, salvo que $conCabecera sea false). */
    public function api(string $r, array $d = [], bool $conCabecera = true, array $cab = []): array {
        $this->pedir('POST', $r, json_encode($d), array_merge(['Content-Type: application/json'], $conCabecera ? ['X-Envivo: 1'] : [], $cab));
        return json_decode($this->cuerpo, true) ?? ['crudo' => $this->cuerpo];
    }
    public function apiGet(string $r): array { $this->get($r); return json_decode($this->cuerpo, true) ?? ['crudo' => $this->cuerpo]; }
    public function tiene(string $t): bool { return str_contains($this->cuerpo, $t); }
    /** Valor de la galleta envivo_s guardada. */
    public function token(): string {
        foreach (file($this->jar, FILE_IGNORE_NEW_LINES) ?: [] as $l) { $p = explode("\t", $l); if (count($p) >= 7 && $p[5] === 'envivo_s') return $p[6]; }
        return '';
    }
}
function falso_log(): array { return array_map(fn($l) => json_decode($l, true), file(getenv('FALSO_LOG'), FILE_IGNORE_NEW_LINES) ?: []); }
function falso_ultimo(): array { $l = falso_log(); return end($l) ?: []; }

// ---- Simula lo que hace pago.js en el navegador (AES-256-ECB + RSA PKCS#1) ----
function tarjeta(string $num, string $mes = '04', string $anio = '2029', string $cvv = '123'): array {
    $pub = openssl_pkey_get_public((string) file_get_contents(getenv('FALSO_LLAVE_PUBLICA')));
    $k = substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(40))), 0, 32);
    openssl_public_encrypt($k, $kc, $pub);
    $aes = fn($v) => base64_encode(openssl_encrypt($v, 'aes-256-ecb', $k, OPENSSL_RAW_DATA));
    return ['card' => ['number' => $aes($num), 'expirationYear' => $aes($anio), 'expirationMonth' => $aes($mes), 'cvv' => $aes($cvv)], 'simetricKeyCifrada' => base64_encode($kc)];
}
$comprador = ['firstName' => 'Ana', 'lastName' => 'Pérez Tester', 'documentNumber' => '1710034065', 'email' => 'ana.titular@prueba.example', 'phone' => '0991234567'];
$n = 0;
$nuevo = function (string $nombre = 'Jugador') use ($URL, &$n): array {
    $n++;
    $nav = new Nav($URL, 'j' . $n);
    $email = 'jugador' . $n . '.' . bin2hex(random_bytes(3)) . '@prueba.example';
    $r = $nav->api('/api/registro', ['email' => $email, 'nombre' => $nombre . ' ' . $n, 'clave' => 'ClaveSegura' . $n]);
    return [$nav, (int) ($r['jugador']['id'] ?? 0), $email, $r, 'ClaveSegura' . $n];
};
$ordenar = function (Nav $nav, string $producto): string {
    $r = $nav->api('/api/orden', ['producto' => $producto]);
    return preg_match('#^/pago\.php\?o=([a-f0-9]{32})$#', (string) ($r['url'] ?? ''), $m) ? $m[1] : '';
};
$pagar = function (Nav $nav, string $tok, string $num, array $extra = []) use ($comprador): array {
    return $nav->api('/api/plux/pago', ['o' => $tok, 'buyer' => $comprador] + $extra + tarjeta($num));
};
$compra = fn(string $tok) => $fila('SELECT * FROM compras WHERE token = ?', [$tok]);
$saldo = fn(int $j) => (int) $val('SELECT creditos - deuda FROM jugadores WHERE id = ?', [$j]);   // saldo de verdad (con la deuda de un reembolso)
$libro = fn(int $j) => (int) $val('SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ?', [$j]);
$limpiarIntentos = fn() => $exec('DELETE FROM intentos');
$hook = function (array $d, string $u, string $c) use ($URL): array {
    $ch = curl_init($URL . '/api/plux/webhook');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($d), CURLOPT_USERPWD => "$u:$c", CURLOPT_HTTPHEADER => ['Content-Type: application/json']]);
    $r = (string) curl_exec($ch);
    return [(int) curl_getinfo($ch, CURLINFO_HTTP_CODE), json_decode($r, true)];
};

// =====================================================================
titulo('Rutas (lo mismo que nginx): el juego se ve, el código del servidor NO');
$v = new Nav($URL, 'visitante');
foreach (['/' => 200, '/index.html' => 200, '/js/logic.js' => 200, '/icons/icon-192.png' => 200, '/manifest.webmanifest' => 200, '/sw.js' => 200,
          '/terminos.html' => 200, '/privacidad.html' => 200, '/pago-assets/pago.js' => 200, '/pago-assets/estilo.css' => 200,
          '/pago-assets/vendor/crypto-js.min.js' => 200, '/pago-assets/vendor/jsencrypt.min.js' => 200,
          '/server/src/Config.php' => 404, '/server/src/Db.php' => 404, '/server/tests/pruebas.php' => 404, '/server/deploy/instalar.sh' => 404,
          '/server/bin/migrar.php' => 404, '/server/config.env.ejemplo' => 404, '/server/API.md' => 404, '/server/public/api.php' => 404,
          '/.git/config' => 404, '/.gitignore' => 404, '/PLAN.md' => 404, '/README.md' => 404, '/tests/test_logic.js' => 404, '/tools/build_single.js' => 404,
          '/dist/envivo-tycoon.html' => 404, '/HEAD_SNIPPET.html' => 404, '/config.env' => 404, '/pago-assets/../../src/Config.php' => 404] as $r => $h) {
    check("GET $r -> $h", $h, $v->get($r));
}

titulo('Estado sin sesión: forma exacta de API.md');
$est = $v->apiGet('/api/estado');
check('GET /api/estado -> 200', 200, $v->http);
$CLAVES_ESTADO = ['universo', 'aviso_fusion', 'ok', 'logueado', 'jugador', 'creditos', 'vip_hasta', 'vip_activo', 'vip_bono_hoy', 'inicio_comprado', 'entregas', 'tienda', 'plux', 'inventario', 'mercado', 'servidor', 'asociacion', 'perfil',
    'tarjeta_hasta', 'tarjeta_activa', 'tarjeta_reclamada_hoy', 'cuenta_estado', 'aviso', 'soporte_sin_leer', 'compras_recientes', 'transferencia', 'creditos_retenidos', 'duelos', 'desafio', 'anuncio', 'mantenimiento', 'discord_vinculado', 'discord_invitacion'];
check('Claves del estado (API.md + MERCADO.md + SOCIAL.md + SOPORTE.md + tarjeta, cuenta, anuncio, duelos, desafío, Discord)', $CLAVES_ESTADO, array_keys($est));
check('Sin sesión: inventario [], mercado sin acceso, sin servidor ni asociación', [[], false, 0.05, null, null], [$est['inventario'], $est['mercado']['puede'], $est['mercado']['comision'], $est['servidor'], $est['asociacion']]);
check('Sin sesión: logueado false, créditos 0, entregas []', [true, false, 0, [], null, false, false, false], [$est['ok'], $est['logueado'], $est['creditos'], $est['entregas'], $est['vip_hasta'], $est['vip_activo'], $est['vip_bono_hoy'], $est['inicio_comprado']]);
check('Plux disponible en sandbox', ['disponible' => true, 'ambiente' => 'sandbox'], $est['plux']);
check('Productos de la tienda (id, precio, créditos, una_vez)', [
    ['creditos_250', 1.99, 250, false], ['creditos_700', 4.99, 700, false], ['creditos_1500', 9.99, 1500, false], ['creditos_3200', 19.99, 3200, false],
    ['bienvenida', 0.99, 150, true], ['inicio', 2.99, 200, true], ['tarjeta_mensual', 4.99, 0, false], ['vip30', 9.99, 0, false]],
    array_map(fn($p) => [$p['id'], $p['precio'], $p['creditos'], $p['una_vez']], $est['tienda']['productos']));
si('Cada producto trae nombre y detalle', array_reduce($est['tienda']['productos'], fn($c, $p) => $c && is_string($p['nombre']) && $p['nombre'] !== '' && is_string($p['detalle']) && $p['detalle'] !== '', true));
check('Exclusivos con créditos (id, créditos, vip, tipo)', [['generador', 250, false, 'equipo'], ['kit_reparacion', 60, false, 'consumo'], ['caja_chica', 120, false, 'consumo'], ['estrella', 300, false, 'consumo'], ['dron4k', 450, false, 'equipo'], ['grua', 650, false, 'equipo'], ['unidad_movil', 900, false, 'equipo'], ['vip_cam8k', 800, true, 'vip'], ['vip_switcher', 1000, true, 'vip'], ['vip_satelital', 700, true, 'vip'],
    ['refuerzo_camarografo_senior', 120, false, 'refuerzo'], ['refuerzo_tecnico_internacional', 240, false, 'refuerzo'], ['alquiler_lente_box', 120, false, 'refuerzo'], ['seguro_evento', 100, false, 'refuerzo'], ['equipo_descansado', 100, false, 'refuerzo']],
    array_map(fn($p) => [$p['id'], $p['creditos'], $p['vip'], $p['tipo']], $est['tienda']['premium']));
si('El producto oculto transferencia_cuenta NO sale en la tienda', !in_array('transferencia_cuenta', array_column($est['tienda']['productos'], 'id'), true));
si('Cada exclusivo trae nombre y detalle', array_reduce($est['tienda']['premium'], fn($c, $p) => $c && $p['nombre'] !== '' && $p['detalle'] !== '', true));
check('Ruta desconocida -> 404 con {ok:false,error}', [404, false, true], [$v->get('/api/no-existe'), json_decode($v->cuerpo, true)['ok'] ?? null, is_string(json_decode($v->cuerpo, true)['error'] ?? null)]);

titulo('Cabecera X-Envivo obligatoria en todo POST');
foreach (['/api/registro', '/api/entrar', '/api/salir', '/api/partida', '/api/gastar', '/api/vip/bono', '/api/orden', '/api/plux/pago'] as $r) {
    $j = $v->api($r, ['email' => 'x@prueba.example', 'clave' => '12345678'], false);
    check("POST $r sin X-Envivo -> 403", [403, false], [$v->http, $j['ok'] ?? null]);
}
$v->api('/api/registro', ['email' => 'x@prueba.example', 'nombre' => 'X', 'clave' => '12345678'], false, ['X-Envivo: 0']);
check('X-Envivo: 0 tampoco sirve', 403, $v->http);
check('Nada se creó sin la cabecera', 0, (int) $val("SELECT COUNT(*) FROM jugadores WHERE email = 'x@prueba.example'"));
$v->api('/api/estado', []);
check('POST /api/estado -> 405', 405, $v->http);

// =====================================================================
titulo('Cuenta: registro, entrar, salir');
$a = new Nav($URL, 'cuenta');
$r = $a->api('/api/registro', ['email' => 'corta@prueba.example', 'nombre' => 'Corta', 'clave' => '1234567']);
check('Clave de 7 caracteres -> 400', [400, false], [$a->http, $r['ok'] ?? null]);
$r = $a->api('/api/registro', ['email' => 'no-es-correo', 'nombre' => 'X', 'clave' => '12345678']);
check('Correo inválido -> 400', 400, $a->http);
$r = $a->api('/api/registro', ['email' => 'sinnombre@prueba.example', 'nombre' => '  ', 'clave' => '12345678']);
check('Sin nombre -> 400', 400, $a->http);
$r = $a->api('/api/registro', ['email' => 'Dimi.Tester@Prueba.example', 'nombre' => 'Dimi', 'clave' => 'MiClave2026']);
check('Registro -> 200 con el estado ya logueado', [200, true, true, 'dimi.tester@prueba.example', 'Dimi', 0], [$a->http, $r['ok'] ?? null, $r['logueado'] ?? null, $r['jugador']['email'] ?? null, $r['jugador']['nombre'] ?? null, $r['creditos'] ?? null]);
check('…mismas claves que /api/estado', array_keys($est), array_keys($r));
$JA = (int) ($r['jugador']['id'] ?? 0);
$gal = implode(' | ', $a->galletas);
si('Galleta envivo_s HttpOnly, SameSite=Lax, path=/', (bool) preg_match('/^envivo_s=[a-f0-9]{64};/', $a->galletas[0] ?? '') && stripos($gal, 'HttpOnly') !== false && stripos($gal, 'SameSite=Lax') !== false && stripos($gal, 'path=/') !== false);
si('…sin Secure en http (en https sí lleva Secure)', stripos($gal, 'secure') === false);
preg_match('/Max-Age=(\d+)/i', $gal, $mm);
si('…dura 60 días', isset($mm[1]) && abs((int) $mm[1] - 60 * 86400) < 120);
$tokA = $a->token();
check('En la base se guarda SOLO el sha256 del token de sesión', [1, 0], [(int) $val('SELECT COUNT(*) FROM sesiones WHERE token_hash = ?', [hash('sha256', $tokA)]), (int) $val('SELECT COUNT(*) FROM sesiones WHERE token_hash = ?', [$tokA])]);
si('La clave se guarda con bcrypt', str_starts_with((string) $val('SELECT clave_hash FROM jugadores WHERE id = ?', [$JA]), '$2y$'));
$a->api('/api/registro', ['email' => 'DIMI.tester@prueba.example', 'nombre' => 'Otro', 'clave' => 'OtraClave2026']);
check('Correo repetido (sin importar mayúsculas) -> 409', 409, $a->http);
$e2 = $a->apiGet('/api/estado');
check('GET /api/estado con sesión', [true, $JA], [$e2['logueado'], $e2['jugador']['id'] ?? null]);
$r = $a->api('/api/salir');
check('Salir -> {ok:true}', [200, ['ok' => true]], [$a->http, $r]);
check('…la sesión se borró de la base', 0, (int) $val('SELECT COUNT(*) FROM sesiones WHERE token_hash = ?', [hash('sha256', $tokA)]));
check('…estado sin sesión', false, $a->apiGet('/api/estado')['logueado']);
$robada = new Nav($URL, 'robada');
$ch = curl_init($URL . '/api/estado'); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIE => 'envivo_s=' . $tokA]);
check('El token viejo ya no sirve', false, json_decode((string) curl_exec($ch), true)['logueado'] ?? null);
$r = $a->api('/api/entrar', ['email' => 'dimi.tester@prueba.example', 'clave' => 'clave-mala-1']);
check('Entrar con clave mala -> 401', [401, false, 'Correo o clave incorrectos.'], [$a->http, $r['ok'] ?? null, $r['error'] ?? null]);
$r = $a->api('/api/entrar', ['email' => 'nadie@prueba.example', 'clave' => 'clave-mala-1']);
check('Entrar con correo que no existe -> 401 (mismo mensaje)', [401, 'Correo o clave incorrectos.'], [$a->http, $r['error'] ?? null]);
$r = $a->api('/api/entrar', ['email' => 'DIMI.TESTER@prueba.example', 'clave' => 'MiClave2026']);
check('Entrar bien (correo en mayúsculas) -> 200 con el estado', [200, true, $JA], [$a->http, $r['logueado'] ?? null, $r['jugador']['id'] ?? null]);
check('…mismas claves que /api/estado', array_keys($est), array_keys($r));

titulo('Límite de intentos al entrar');
[$lim, $JL, $emailL] = $nuevo('Limite');
$lim->api('/api/salir');
for ($i = 1; $i <= 5; $i++) $lim->api('/api/entrar', ['email' => $emailL, 'clave' => 'equivocada' . $i]);
check('5 claves malas -> 401', 401, $lim->http);
$r = $lim->api('/api/entrar', ['email' => $emailL, 'clave' => 'ClaveSegura' . $n]);
check('6.º intento (aunque la clave sea buena) -> 429', [429, false], [$lim->http, $r['ok'] ?? null]);
$exec('DELETE FROM intentos WHERE clave LIKE ?', ['entrar:%']);
$r = $lim->api('/api/entrar', ['email' => $emailL, 'clave' => 'ClaveSegura' . $n]);
check('Pasado el tiempo (intentos borrados) -> entra', [200, true], [$lim->http, $r['logueado'] ?? null]);
$limpiarIntentos();
$ip = new Nav($URL, 'ip');
for ($i = 1; $i <= 61; $i++) $ip->api('/api/entrar', ['email' => "otro$i@prueba.example", 'clave' => 'x12345678']);
check('Más de 60 intentos desde la misma conexión -> 429', 429, $ip->http);
$limpiarIntentos();

// =====================================================================
titulo('Partida en la nube');
check('Sin sesión: GET /api/partida -> 401', 401, $v->get('/api/partida'));
$v->api('/api/partida', ['datos' => '{}']);
check('Sin sesión: POST /api/partida -> 401', 401, $v->http);
$p = $a->apiGet('/api/partida');
check('Partida vacía al inicio', ['ok' => true, 'datos' => null, 'actualizado' => null], $p);
$datos = json_encode(['dinero' => 1234, 'dia' => 7, 'nombre' => 'Producciones Ñandú', 'premium' => ['aplicadas' => [1, 2]]], JSON_UNESCAPED_UNICODE);
$r = $a->api('/api/partida', ['datos' => $datos]);
check('Guardar partida -> {ok, actualizado ISO}', [200, true, true], [$a->http, $r['ok'] ?? null, (bool) preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-05:00$/', (string) ($r['actualizado'] ?? ''))]);
$p = $a->apiGet('/api/partida');
check('Leer partida: el mismo texto exacto (con tildes)', [$datos, $r['actualizado'] ?? 'x'], [$p['datos'] ?? null, $p['actualizado'] ?? null]);
$grande = json_encode(['x' => str_repeat('a', 300 * 1024)]);
$a->api('/api/partida', ['datos' => $grande]);
check('Partida de más de 300 KB -> 413', 413, $a->http);
$justa = json_encode(['x' => str_repeat('b', 300 * 1024 - 10)]);
$a->api('/api/partida', ['datos' => $justa]);
check('Partida de casi 300 KB -> 200', 200, $a->http);
$a->api('/api/partida', ['datos' => '{esto no es json']);
check('Partida que no es JSON -> 400', 400, $a->http);
$a->api('/api/partida', ['datos' => 123]);
check('"datos" que no es texto -> 400', 400, $a->http);
check('…sigue la última partida buena', strlen($justa), strlen((string) $a->apiGet('/api/partida')['datos']));

// =====================================================================
titulo('Gastar créditos (exclusivos)');
$r = $a->api('/api/gastar', ['item' => 'dron4k']);
check('Sin créditos -> 402', [402, false, 0], [$a->http, $r['ok'] ?? null, $r['creditos'] ?? null]);
check('…nada en el libro de créditos ni entregas', [0, 0], [(int) $val('SELECT COUNT(*) FROM movimientos_creditos WHERE jugador_id = ?', [$JA]), (int) $val('SELECT COUNT(*) FROM entregas WHERE jugador_id = ?', [$JA])]);
$a->api('/api/gastar', ['item' => 'nave_espacial']);
check('Artículo que no existe -> 404', 404, $a->http);
$v->api('/api/gastar', ['item' => 'dron4k']);
check('Sin sesión -> 401', 401, $v->http);

// =====================================================================
titulo('Órdenes de compra');
$v->api('/api/orden', ['producto' => 'creditos_700']);
check('Sin sesión -> 401', 401, $v->http);
$a->api('/api/orden', ['producto' => 'creditos_9999']);
check('Producto que no existe -> 404', 404, $a->http);
$r = $a->api('/api/orden', ['producto' => 'creditos_700']);
check('Orden -> {ok, url: /pago.php?o=<token>}', [200, true, true], [$a->http, $r['ok'] ?? null, (bool) preg_match('#^/pago\.php\?o=[a-f0-9]{32}$#', (string) ($r['url'] ?? ''))]);
$tok700 = substr((string) $r["url"], 12);
$c = $compra($tok700);
check('Compra pendiente con total, subtotal e IVA (4,99 = 4,34 + 0,65)', ['pendiente', 'creditos_700', 4.99, 4.34, 0.65, $JA], [$c['estado'], $c['producto'], (float) $c['total'], (float) $c['subtotal'], (float) $c['iva'], (int) $c['jugador_id']]);
$todos = true;
foreach (['creditos_250' => [1.99, 1.73, 0.26], 'creditos_1500' => [9.99, 8.69, 1.30], 'creditos_3200' => [19.99, 17.38, 2.61], 'inicio' => [2.99, 2.60, 0.39], 'vip30' => [9.99, 8.69, 1.30], 'bienvenida' => [0.99, 0.86, 0.13], 'tarjeta_mensual' => [4.99, 4.34, 0.65]] as $prod => [$t, $s, $i]) {
    $tk = $ordenar($a, $prod); $cc = $compra($tk);
    $todos = $todos && abs((float) $cc['total'] - $t) < 0.001 && abs((float) $cc['subtotal'] - $s) < 0.001 && abs((float) $cc['iva'] - $i) < 0.001 && abs((float) $cc['subtotal'] + (float) $cc['iva'] - $t) < 0.001;
}
si('Subtotal = total / 1,15 redondeado y subtotal + IVA = total en todos los productos', $todos);

titulo('Página de pago (pago.php)');
check('Sin sesión -> 401', 401, $v->get('/pago.php?o=' . $tok700));
[$intruso] = $nuevo('Intruso');
check('Otro jugador no puede ver la compra -> 404', 404, $intruso->get('/pago.php?o=' . $tok700));
check('Token que no existe -> 404', 404, $a->get('/pago.php?o=' . str_repeat('a', 32)));
check('Token mal formado -> 404', 404, $a->get('/pago.php?o=../../etc'));
check('El dueño -> 200', 200, $a->get('/pago.php?o=' . $tok700));
si('Muestra el producto y el valor FIJO con IVA ($4,99)', $a->tiene('700 créditos') && $a->tiene('<output id="valor-fijo">$4,99</output>') && $a->tiene('Incluye IVA'));
si('…sin ningún campo para cambiar el valor', !preg_match('/<input[^>]*(id|name)="[^"]*(monto|valor|amount|precio|total)/i', $a->cuerpo));
si('Logo "EN VIVO Tycoon"', $a->tiene('EN VIVO <b>Tycoon</b>'));
si('Formulario: número, mes, año, CVV, nombres, apellidos, cédula, correo y celular', $a->tiene('id="plux-numero"') && $a->tiene('id="plux-mes"') && $a->tiene('id="plux-anio"') && $a->tiene('id="plux-cvv"')
    && $a->tiene('id="plux-nombres"') && $a->tiene('id="plux-apellidos"') && $a->tiene('id="plux-cedula"') && $a->tiene('id="plux-email"') && $a->tiene('id="plux-telefono"'));
si('Texto: "Tu tarjeta se procesa con Pago Plux; nosotros no guardamos los datos de tu tarjeta"', $a->tiene('Tu tarjeta se procesa con Pago Plux; nosotros no guardamos los datos de tu tarjeta'));
si('Casilla "Acepto los términos" y enlaces a términos y privacidad', $a->tiene('id="plux-terminos"') && $a->tiene('Acepto los') && $a->tiene('href="/terminos.html"') && $a->tiene('href="/privacidad.html"'));
si('Aviso para menores de edad', $a->tiene('Si eres menor de edad, pide permiso a tus padres antes de comprar'));
si('Aviso de MODO DE PRUEBAS (sandbox)', $a->tiene('MODO DE PRUEBAS'));
si('Enlace "Volver al juego"', $a->tiene('Volver al juego'));
si('Carga CryptoJS, JSEncrypt, pago.js y la llave pública', $a->tiene('/pago-assets/vendor/crypto-js.min.js') && $a->tiene('/pago-assets/vendor/jsencrypt.min.js') && $a->tiene('/pago-assets/pago.js') && $a->tiene('BEGIN PUBLIC KEY'));
si('Cabeceras: sin caché, sin iframes, CSP', ($a->cab['cache-control'] ?? '') === 'no-store' && ($a->cab['x-frame-options'] ?? '') === 'DENY' && str_contains($a->cab['content-security-policy'] ?? '', "script-src 'self'"));

// =====================================================================
titulo('Pago aprobado (código 0) contra el Plux FALSO');
$r = $a->api('/api/plux/pago', ['o' => $tok700, 'buyer' => $comprador, 'baseAmount12' => 0.01, 'monto' => 0.01, 'total' => 0.01] + tarjeta('4540639936908783'));
check('Código 0 -> success y va a /?compra=ok', ['success', '/?compra=ok'], [$r['status'] ?? null, $r['ir'] ?? null]);
$f = falso_ultimo(); $c = $compra($tok700);
check('Plux recibió: Basic Auth, simetricKey RSA, tarjeta AES, establecimiento base64', [true, true, true, true], [$f['auth_ok'], $f['clave_ok'], $f['tarjeta_ok'], $f['establecimiento_ok']]);
check('Plux recibió el valor FINAL con IVA en baseAmount12 (ignora lo que mande el navegador)', [4.99, true, 0.0, 'USD'], [$f['monto'], $f['con_iva'], (float) $f['sin_iva'], $f['moneda']]);
check('urlRetorno3ds SIN parámetros', [true, $URL . '/api/plux/3ds'], [$f['retorno_limpio'], $f['retorno']]);
check('Descripción "EV-<id> EN VIVO Tycoon <producto>"', 'EV-' . $c['id'] . ' EN VIVO Tycoon 700 créditos', $f['descripcion']);
check('Datos del titular a Plux', ['1710034065', '0991234567'], [$f['documento'], $f['telefono']]);
check('Compra pagada con la transacción de Plux', ['pagado', true, true], [$c['estado'], str_starts_with((string) $c['plux_transaccion'], 'FALSO-'), (int) $c['pagado_en'] > 0]);
check('Datos del comprador guardados para la factura', ['1710034065', 'Ana Pérez Tester', 'ana.titular@prueba.example', '0991234567'], [$c['comprador_cedula'], $c['comprador_nombre'], $c['comprador_email'], $c['comprador_telefono']]);
si('La respuesta guardada NO tiene datos de tarjeta', !str_contains((string) $c['plux_respuesta'], 'cardNumber') && !str_contains((string) $c['plux_respuesta'], '4540') && str_contains((string) $c['plux_respuesta'], '[oculto]'));
check('700 créditos entregados', 700, $saldo($JA));
check('…anotados en el libro (motivo compra, ref compra:<id>)', ['compra', 'compra:' . $c['id'] . ':creditos_700', 700, 700], array_values($fila('SELECT motivo, ref, cambio, saldo FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$JA])));
$e3 = $a->apiGet('/api/estado');
check('El estado ya muestra 700 créditos', 700, $e3['creditos']);
$r = $a->api('/api/plux/pago', ['o' => $tok700, 'buyer' => $comprador] + tarjeta('4540639936908783'));
check('Pagar OTRA VEZ la misma compra -> success sin llamar a Plux ni dar más créditos', ['success', 700, count(falso_log())], [$r['status'] ?? null, $saldo($JA), count(falso_log())]);
$a->get('/pago.php?o=' . $tok700);
check('pago.php de una compra pagada -> a /?compra=ok', [302, '/?compra=ok'], [$a->http, $a->lugar]);
$r = $intruso->api('/api/plux/pago', ['o' => $tok700, 'buyer' => $comprador] + tarjeta('4540639936908783'));
check('Otro jugador no puede pagar/ver la compra -> 404', 404, $intruso->http);

titulo('Gastar con créditos (ahora sí alcanza)');
$r = $a->api('/api/gastar', ['item' => 'dron4k']);
check('Gastar dron4k (450) -> {ok, creditos: 250, entrega}', [200, true, 250], [$a->http, $r['ok'] ?? null, $r['creditos'] ?? null]);
check('…equipo: entrega null y llega al inventario (dron4k serie 1, origen canje, en bodega)', [null, 'dron4k', 1, 'canje', 'bodega'], [array_key_exists('entrega', $r) ? $r['entrega'] : 'x', $r['item']['item'] ?? null, $r['item']['serie'] ?? null, $r['item']['origen'] ?? null, $r['item']['estado'] ?? null]);
si('…con id y la lista completa del inventario', is_int($r['item']['id'] ?? null) && ($r['inventario'][0]['id'] ?? 0) === ($r['item']['id'] ?? -1));
check('…ya NO crea entrega tipo item', 0, (int) $val("SELECT COUNT(*) FROM entregas WHERE tipo = 'item'"));
check('…en el libro: -450 motivo gasto', ['gasto', 'premium:dron4k', -450, 250], array_values($fila('SELECT motivo, ref, cambio, saldo FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$JA])));
$r = $a->api('/api/gastar', ['item' => 'caja_chica']);
check('caja_chica -> entrega dinero 1000', ['dinero', '-', 1000, 130], [$r['entrega']['tipo'] ?? null, $r['entrega']['item'] ?? null, $r['entrega']['cantidad'] ?? null, $r['creditos'] ?? null]);
$r = $a->api('/api/gastar', ['item' => 'kit_reparacion']);
check('kit_reparacion -> entrega reparar_todo', ['reparar_todo', 1, 70], [$r['entrega']['tipo'] ?? null, $r['entrega']['cantidad'] ?? null, $r['creditos'] ?? null]);
$r = $a->api('/api/gastar', ['item' => 'grua']);
check('grua (650) con 70 -> 402 y el saldo no cambia', [402, 70, 70], [$a->http, $r['creditos'] ?? null, $saldo($JA)]);
check('Libro = saldo', $saldo($JA), $libro($JA));
$e4 = $a->apiGet('/api/estado');
check('El estado trae TODAS las entregas (historial, sin equipos)', [['dinero', '-', 1000], ['reparar_todo', '-', 1]], array_map(fn($x) => [$x['tipo'], $x['item'], $x['cantidad']], $e4['entregas']));
check('…y el equipo en inventario', [['dron4k', 1, 'bodega']], array_map(fn($x) => [$x['item'], $x['serie'], $x['estado']], $e4['inventario']));
si('…cada entrega con id, tipo, item, cantidad y creado', array_reduce($e4['entregas'], fn($cc, $x) => $cc && count(array_intersect(['id', 'tipo', 'item', 'cantidad', 'creado'], array_keys($x))) === 5, true));

titulo('Gastar a la vez (atómico): 5 compras simultáneas con créditos para 1');
[$par, $JP] = $nuevo('Paralelo');
$exec("UPDATE jugadores SET creditos = 450 WHERE id = ?", [$JP]);
$exec("INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (?, 450, 450, 'manual', 'prueba', ?)", [$JP, time()]);
$mh = curl_multi_init(); $hs = [];
for ($i = 0; $i < 5; $i++) {
    $h = curl_init($URL . '/api/gastar');
    curl_setopt_array($h, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{"item":"dron4k"}', CURLOPT_COOKIE => 'envivo_s=' . $par->token(), CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Envivo: 1']]);
    curl_multi_add_handle($mh, $h); $hs[] = $h;
}
do { curl_multi_exec($mh, $corriendo); curl_multi_select($mh); } while ($corriendo > 0);
$codigos = array_map(fn($h) => (int) curl_getinfo($h, CURLINFO_HTTP_CODE), $hs); sort($codigos);
check('Solo 1 sale bien; las otras 4 -> 402', [200, 402, 402, 402, 402], $codigos);
check('…saldo 0, un solo equipo en el inventario y libro = saldo', [0, 1, 0], [$saldo($JP), (int) $val('SELECT COUNT(*) FROM inventario WHERE jugador_id = ?', [$JP]), $libro($JP)]);

// =====================================================================
titulo('Pago rechazado (código 2) y datos incompletos');
$tokR = $ordenar($a, 'creditos_250');
$antes = $saldo($JA);
$r = $pagar($a, $tokR, '4111111111111111');
check('Código 2 -> failed con mensaje del banco', ['failed', true], [$r['status'] ?? null, str_contains((string) ($r['message'] ?? ''), 'no aprobó')]);
$c = $compra($tokR);
check('…la compra sigue abierta para reintentar y no se entregó nada', ['pendiente', 'fallido', $antes], [$c['estado'], $c['plux_paso'], $saldo($JA)]);
$r = $a->api('/api/plux/pago', ['o' => $tokR, 'simetricKeyCifrada' => 'x', 'card' => []]);
check('Clave cifrada mala -> 422', 422, $a->http);
$r = $a->api('/api/plux/pago', ['o' => $tokR, 'buyer' => $comprador, 'card' => ['number' => 'corto']] + ['simetricKeyCifrada' => tarjeta('1')['simetricKeyCifrada']]);
check('Tarjeta incompleta -> 422', 422, $a->http);
$r = $a->api('/api/plux/pago', ['o' => $tokR, 'buyer' => ['firstName' => 'A', 'lastName' => 'B', 'email' => 'a@b.example', 'phone' => '0991234567']] + tarjeta('4540639936908783'));
check('Sin cédula -> 422 con mensaje', [422, true], [$a->http, str_contains((string) ($r['message'] ?? ''), 'cédula')]);
$r = $a->api('/api/plux/pago', ['o' => $tokR, 'buyer' => ['documentNumber' => '1710034065', 'email' => 'a@b.example', 'phone' => '0991234567']] + tarjeta('4540639936908783'));
check('Sin nombres -> 422', 422, $a->http);
$r = $a->api('/api/plux/pago', ['o' => $tokR, 'buyer' => ['firstName' => 'A', 'lastName' => 'B', 'documentNumber' => '1710034065', 'email' => 'a@b.example']] + tarjeta('4540639936908783'));
check('Sin celular -> 422', 422, $a->http);
check('…nada de eso llegó a Plux ni entregó créditos', ['pendiente', $antes], [$compra($tokR)['estado'], $saldo($JA)]);
$r = $pagar($a, $tokR, '4000000000000002');
check('Tarjeta desconocida (código 1) -> failed', 'failed', $r['status'] ?? null);
$r = $pagar($a, $tokR, '4540639936908783');
check('Reintento con la tarjeta buena -> success', ['success', $antes + 250], [$r['status'] ?? null, $saldo($JA)]);

titulo('OTP (100 / 102 / 0)');
$tokO = $ordenar($a, 'creditos_1500');
$antes = $saldo($JA);
$tj = tarjeta('36417200103608');
$r = $a->api('/api/plux/pago', ['o' => $tokO, 'buyer' => $comprador] + $tj);
check('Código 100 -> pide OTP', ['otp_required', 'OTP-1'], [$r['status'] ?? null, $r['detail']['idTransaction'] ?? null]);
check('…paso otp, sin entregar', ['otp', 'pendiente', $antes], [$compra($tokO)['plux_paso'], $compra($tokO)['estado'], $saldo($JA)]);
$otp = ['idTransaction' => 'OTP-1', 'sessionId' => 'S-1', 'tkn' => 'a', 'tknky' => 'b', 'tkniv' => 'c'];
$r = $a->api('/api/plux/pago', ['o' => $tokO, 'buyer' => $comprador, 'paramsOtp' => $otp + ['otpCode' => '000000']] + $tj);
check('Código equivocado (102) -> otp_incorrecto, sin entregar', ['otp_incorrecto', $antes], [$r['status'] ?? null, $saldo($JA)]);
$r = $a->api('/api/plux/pago', ['o' => $tokO, 'buyer' => $comprador, 'paramsOtp' => $otp + ['otpCode' => '123456']] + $tj);
check('OTP 123456 -> success', ['success', '/?compra=ok'], [$r['status'] ?? null, $r['ir'] ?? null]);
check('…1.500 créditos entregados una vez', [$antes + 1500, 'pagado'], [$saldo($JA), $compra($tokO)['estado']]);

titulo('3DS (103): banco -> /api/plux/3ds reconocido por la sesión');
$tok3 = $ordenar($a, 'creditos_3200');
$antes = $saldo($JA);
$r = $pagar($a, $tok3, '5555555555554444');
check('Código 103 -> 3DS con la dirección del banco', ['3ds_required', true], [$r['status'] ?? null, str_starts_with((string) ($r['detail']['url'] ?? ''), $E('FALSO_BASE') . '/banco')]);
check('…paso 3ds, sin entregar', ['3ds', $antes], [$compra($tok3)['plux_paso'], $saldo($JA)]);
$a->get($r['detail']['url']);
check('El banco vuelve a /api/plux/3ds con SUS parámetros (los nuestros no van)', true, str_starts_with($a->lugar, $URL . '/api/plux/3ds?pti='));
$vuelta = $a->lugar;
$a->get($vuelta);
check('Regreso 3DS con la galleta de sesión -> /?compra=ok', [302, '/?compra=ok'], [$a->http, $a->lugar]);
$f = falso_ultimo();
check('…se llamó a la confirmación 3DS de Plux (RUTA_3DS) con Basic Auth', ['3ds', true, 0], [$f['ruta'], $f['auth_ok'], $f['code']]);
check('…3.200 créditos entregados', [$antes + 3200, 'pagado', true], [$saldo($JA), $compra($tok3)['estado'], str_starts_with((string) $compra($tok3)['plux_transaccion'], 'FALSO3DS-')]);
$llamadas = count(falso_log());
$a->get($vuelta); $a->get($vuelta);
check('Recargar la vuelta del banco 2 veces -> /?compra=ok sin entregar otra vez ni llamar a Plux', ['/?compra=ok', $antes + 3200, $llamadas, 1],
    [$a->lugar, $saldo($JA), count(falso_log()), (int) $val("SELECT COUNT(*) FROM movimientos_creditos WHERE ref LIKE ?", ['compra:' . $compra($tok3)['id'] . ':%'])]);
$a->get('/api/plux/3ds');
check('Vuelta del banco sin parámetros (con sesión de compra pagada) -> /?compra=ok', '/?compra=ok', $a->lugar);
$tok3b = $ordenar($a, 'creditos_250');
$r = $pagar($a, $tok3b, '5555555555554444');
$a->get('/api/plux/3ds?pti=PTI-1');
check('Vuelta incompleta -> otra vez a la página de pago con aviso', '/pago.php?o=' . $tok3b . '&r=incompleto', $a->lugar);
$a->get('/pago.php?o=' . $tok3b . '&r=incompleto');
si('…la página muestra el aviso', $a->http === 200 && $a->tiene('llegó incompleta'));
$a->get('/api/plux/3ds?pti=PTI-1&pcc=MALO&ptk=TK-1');
check('El banco no aprueba (3DS falla) -> página de pago con aviso, sin entregar', ['/pago.php?o=' . $tok3b . '&r=rechazado', 'pendiente'], [$a->lugar, $compra($tok3b)['estado']]);
$sinSesion = new Nav($URL, 'sin_sesion_3ds');
$sinSesion->get('/api/plux/3ds?pti=PTI-1&pcc=PCC-1&ptk=TK-zzz');
check('3DS aprobado en un navegador sin sesión: no se pierde (queda un aviso para el admin)', [200, 1], [$sinSesion->http, (int) $val("SELECT COUNT(*) FROM avisos WHERE tipo = 'plux_sin_relacionar'")]);
[$otroJ] = $nuevo('OtroJ');
$otroJ->get($vuelta);
check('Otro jugador con la vuelta del banco (A-02: confirmación ya usada) -> 409, no recibe nada ni se entrega otra vez', [409, $antes + 3200, $antes + 3200], [$otroJ->http, $saldo($JA), $libro($JA)]);
$limpiarIntentos();

// =====================================================================
titulo('Paquete de inicio (una sola vez)');
[$b, $JB] = $nuevo('Inicio');
$tokI1 = $ordenar($b, 'inicio');
$tokI2 = $ordenar($b, 'inicio');
si('Se pueden abrir 2 órdenes pendientes mientras no haya ninguna pagada', $tokI1 !== '' && $tokI2 !== '');
$r = $pagar($b, $tokI1, '4540639936908783');
check('Pagar el paquete -> success', 'success', $r['status'] ?? null);
$eb = $b->apiGet('/api/estado');
check('Entregas: 5 cables, 3 baterías, técnico de streaming nivel 3', [['consumible', 'cable', 5], ['consumible', 'battery', 3], ['personal', 'stream', 3]],
    array_map(fn($x) => [$x['tipo'], $x['item'], $x['cantidad']], $eb['entregas']));
check('…y la cámara profesional en el inventario (origen inicio)', [['cam_pro', 'inicio', 'bodega']], array_map(fn($x) => [$x['item'], $x['origen'], $x['estado']], $eb['inventario']));
check('…200 créditos e inicio_comprado true', [200, true], [$eb['creditos'], $eb['inicio_comprado']]);
$b->api('/api/orden', ['producto' => 'inicio']);
check('Otra orden del paquete -> 409', [409, true], [$b->http, str_contains((string) (json_decode($b->cuerpo, true)['error'] ?? ''), 'una vez')]);
$llamadas = count(falso_log());
$r = $pagar($b, $tokI2, '4540639936908783');
check('Pagar la 2.ª orden vieja -> 409 SIN cobrar (no llama a Plux)', [409, 'failed', $llamadas], [$b->http, $r['status'] ?? null, count(falso_log())]);
check('pago.php de la 2.ª orden -> 409', 409, $b->get('/pago.php?o=' . $tokI2));
$b->api('/api/plux/pago', ['o' => $tokI1, 'buyer' => $comprador] + tarjeta('4540639936908783'));
check('Repetir el pago del paquete no entrega otra vez', [3, 1, 200], [(int) $val('SELECT COUNT(*) FROM entregas WHERE jugador_id = ?', [$JB]), (int) $val('SELECT COUNT(*) FROM inventario WHERE jugador_id = ?', [$JB]), $saldo($JB)]);
// Si de todas formas llegan 2 cobros del paquete (el aviso de Plux de una orden vieja), NO se entrega dos veces: queda aviso.
$cI2 = $compra($tokI2);
[$h, $j] = $hook(['state' => 'PAGADO', 'description' => 'EV-' . $cI2['id'] . ' EN VIVO Tycoon Paquete de inicio', 'amount' => 2.99], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('Cobro doble del paquete (aviso de Plux): pagado pero NO se entrega otra vez y queda aviso', [200, 3, 1, 200, 1],
    [$h, (int) $val('SELECT COUNT(*) FROM entregas WHERE jugador_id = ?', [$JB]), (int) $val('SELECT COUNT(*) FROM inventario WHERE jugador_id = ?', [$JB]), $saldo($JB), (int) $val("SELECT COUNT(*) FROM avisos WHERE tipo = 'inicio_duplicado' AND compra_id = ?", [$cI2['id']])]);

// =====================================================================
titulo('VIP 30 días (se suma) y bono diario');
[$c1, $JC] = $nuevo('Vip');
$c1->api('/api/vip/bono');
check('Sin VIP: bono -> 403', 403, $c1->http);
$r = $pagar($c1, $ordenar($c1, 'vip30'), '4540639936908783');
$ec = $c1->apiGet('/api/estado');
$vh = (int) $val('SELECT vip_hasta FROM jugadores WHERE id = ?', [$JC]);
check('Comprar VIP -> vip_activo, vence en 30 días, sin créditos', ['success', true, true, 0], [$r['status'] ?? null, $ec['vip_activo'], cerca($vh, time() + 30 * 86400), $ec['creditos']]);
check('vip_hasta en ISO con zona de Ecuador', date('c', $vh), $ec['vip_hasta']);
si('…termina en -05:00', str_ends_with((string) $ec['vip_hasta'], '-05:00'));
$pagar($c1, $ordenar($c1, 'vip30'), '4540639936908783');
$vh2 = (int) $val('SELECT vip_hasta FROM jugadores WHERE id = ?', [$JC]);
check('Comprar VIP otra vez -> se SUMAN 30 días (60 en total)', [true, $vh + 30 * 86400], [cerca($vh2, time() + 60 * 86400), $vh2]);
check('Bono no reclamado todavía', false, $ec['vip_bono_hoy']);
$r = $c1->api('/api/vip/bono');
check('Bono VIP -> {ok, creditos: 10, entrega dinero 150}', [200, true, 10, 'dinero', 150], [$c1->http, $r['ok'] ?? null, $r['creditos'] ?? null, $r['entrega']['tipo'] ?? null, $r['entrega']['cantidad'] ?? null]);
check('…vip_bono_hoy true', true, $c1->apiGet('/api/estado')['vip_bono_hoy']);
$r = $c1->api('/api/vip/bono');
check('Bono otra vez el mismo día -> 409 y no da nada', [409, 10, 1], [$c1->http, $saldo($JC), (int) $val("SELECT COUNT(*) FROM entregas WHERE jugador_id = ? AND tipo = 'dinero'", [$JC])]);
$exec('UPDATE bonos_vip SET dia = ? WHERE jugador_id = ?', [date('Y-m-d', strtotime('-1 day')), $JC]);
check('Al día siguiente: vip_bono_hoy false', false, $c1->apiGet('/api/estado')['vip_bono_hoy']);
$r = $c1->api('/api/vip/bono');
check('…y el bono se puede reclamar otra vez', [200, 20], [$c1->http, $r['creditos'] ?? null]);
check('Libro = saldo', $saldo($JC), $libro($JC));
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() - 5 * 86400, $JC]);
$ec = $c1->apiGet('/api/estado');
check('VIP vencido -> vip_activo false (vip_hasta se sigue mostrando)', [false, true], [$ec['vip_activo'], $ec['vip_hasta'] !== null]);
$exec('DELETE FROM bonos_vip WHERE jugador_id = ?', [$JC]);
$c1->api('/api/vip/bono');
check('VIP vencido: bono -> 403', 403, $c1->http);
$pagar($c1, $ordenar($c1, 'vip30'), '4540639936908783');
check('Comprar con el VIP vencido -> 30 días desde AHORA (no desde el vencimiento)', true, cerca((int) $val('SELECT vip_hasta FROM jugadores WHERE id = ?', [$JC]), time() + 30 * 86400));
$limpiarIntentos();

// =====================================================================
titulo('Aviso de pago de Plux (webhook) con Basic Auth');
[$w, $JW] = $nuevo('Webhook');
$tokW = $ordenar($w, 'creditos_700');
$cw = $compra($tokW);
[$h] = $hook(['state' => 'PAGADO', 'description' => 'EV-' . $cw['id'] . ' algo', 'amount' => 4.99], $E('PLUX_WEBHOOK_USUARIO'), 'clave-mala');
check('Basic Auth inválida -> 401 y nada cambia', [401, 'pendiente', 0], [$h, $compra($tokW)['estado'], $saldo($JW)]);
$ch = curl_init($URL . '/api/plux/webhook'); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{"state":"PAGADO"}']); curl_exec($ch);
check('Sin Basic Auth -> 401', 401, (int) curl_getinfo($ch, CURLINFO_HTTP_CODE));
[$h] = $hook(['state' => 'PAGADO', 'description' => 'EV-' . $cw['id'], 'amount' => 1.00], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('Valor distinto -> 409 y no se aplica (queda aviso)', [409, 'pendiente', 1], [$h, $compra($tokW)['estado'], (int) $val("SELECT COUNT(*) FROM avisos WHERE tipo = 'plux_aviso_monto' AND compra_id = ?", [$cw['id']])]);
[$h] = $hook(['state' => 'PAGADO', 'description' => 'EV-' . $cw['id']], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('Sin valor -> 409 y no se aplica', [409, 'pendiente'], [$h, $compra($tokW)['estado']]);
[$h] = $hook(['state' => 'PAGADO', 'description' => 'EV-999999', 'amount' => 4.99], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('Referencia que no existe -> 404', 404, $h);
[$h] = $hook(['state' => 'OTRA_COSA', 'description' => 'EV-' . $cw['id'], 'amount' => 4.99], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('Estado desconocido -> 422', 422, $h);
// 4 avisos PAGADO iguales A LA VEZ: se entrega una sola vez
$mh = curl_multi_init(); $hs = [];
for ($i = 0; $i < 4; $i++) {
    $hh = curl_init($URL . '/api/plux/webhook');
    curl_setopt_array($hh, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_USERPWD => $E('PLUX_WEBHOOK_USUARIO') . ':' . $E('PLUX_WEBHOOK_CLAVE'),
        CURLOPT_POSTFIELDS => json_encode(['data' => ['state' => 'PAGADO', 'description' => 'EV-' . $cw['id'] . ' EN VIVO Tycoon 700 créditos', 'amount' => '4.99', 'id_transaccion' => 'HOOK-1']]), CURLOPT_HTTPHEADER => ['Content-Type: application/json']]);
    curl_multi_add_handle($mh, $hh); $hs[] = $hh;
}
do { curl_multi_exec($mh, $corriendo); curl_multi_select($mh); } while ($corriendo > 0);
$res = array_map(fn($hh) => json_decode((string) curl_multi_getcontent($hh), true)['resultado'] ?? null, $hs); sort($res);
check('4 avisos PAGADO a la vez (por referencia EV-<id>) -> 1 pagado + 3 ya_estaba_pagado', ['pagado', 'ya_estaba_pagado', 'ya_estaba_pagado', 'ya_estaba_pagado'], $res);
check('…700 créditos UNA sola vez, transacción guardada', [700, 'pagado', 'HOOK-1', 1], [$saldo($JW), $compra($tokW)['estado'], $compra($tokW)['plux_transaccion'], (int) $val("SELECT COUNT(*) FROM movimientos_creditos WHERE jugador_id = ?", [$JW])]);
[$h, $j] = $hook(['state' => 'PAGADO', 'id_transaccion' => 'HOOK-1', 'amount' => 4.99], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('Aviso repetido reconocido por número de transacción -> ya_estaba_pagado', [200, 'ya_estaba_pagado', 700], [$h, $j['resultado'] ?? null, $saldo($JW)]);
[$h, $j] = $hook(['state' => 'RECHAZADO', 'id_transaccion' => 'HOOK-1'], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('RECHAZADO después de pagado -> solo queda aviso (no se quita nada)', [200, 'revisar', 'pagado', 700, 1], [$h, $j['resultado'] ?? null, $compra($tokW)['estado'], $saldo($JW), (int) $val("SELECT COUNT(*) FROM avisos WHERE tipo = 'plux_aviso_rechazo' AND compra_id = ?", [$cw['id']])]);
// Reconocer por número de transacción una compra que pasó por 3DS (Plux ya mandó su número)
$tokT = $ordenar($w, 'creditos_250');
$cT = $compra($tokT);
$exec("UPDATE compras SET plux_transaccion = 'TR-777' WHERE id = ?", [$cT['id']]);
[$h, $j] = $hook(['state' => 'PAGADO', 'id_transaccion' => 'TR-777', 'amount' => 1.99, 'description' => 'pago'], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('PAGADO reconocido por número de transacción -> pagado', [200, 'pagado', 950], [$h, $j['resultado'] ?? null, $saldo($JW)]);
$tokX = $ordenar($w, 'creditos_250');
$cX = $compra($tokX);
[$h, $j] = $hook(['state' => 'RECHAZADO', 'description' => 'EV-' . $cX['id']], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE'));
check('RECHAZADO de una pendiente -> rechazado, sin créditos', [200, 'rechazado', 'rechazado', 950], [$h, $j['resultado'] ?? null, $compra($tokX)['estado'], $saldo($JW)]);
$r = $pagar($w, $tokX, '4540639936908783');
check('…ya no se puede pagar esa compra rechazada (409)', [409, 'failed'], [$w->http, $r['status'] ?? null]);
check('Libro = saldo', $saldo($JW), $libro($JW));

// =====================================================================
titulo('/admin.php -> /control/ y créditos a mano (Monedero::ajusteManual, lo que usa el Centro de Control)');
$adm = function (string $ruta, ?string $u, ?string $c, ?array $post = null, array $cab = []) use ($URL): array {
    $ch = curl_init($URL . $ruta);
    $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $cab];
    if ($u !== null) $o[CURLOPT_USERPWD] = "$u:$c";
    if ($post !== null) { $o[CURLOPT_POST] = true; $o[CURLOPT_POSTFIELDS] = http_build_query($post); }
    curl_setopt_array($ch, $o);
    $r = (string) curl_exec($ch);
    $hs = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    return [(int) curl_getinfo($ch, CURLINFO_HTTP_CODE), substr($r, $hs), substr($r, 0, $hs)];
};
// Acción del Centro de Control con los mismos métodos del servidor que llama /control/ (tests/accion.php)
$accion = function (string $que, array $args = []): array {
    $sal = shell_exec('php ' . escapeshellarg(__DIR__ . '/accion.php') . ' ' . escapeshellarg($que) . ' ' . escapeshellarg(json_encode($args)) . ' 2>&1');
    return json_decode(trim((string) $sal), true) ?: ['ok' => false, 'http' => 0, 'error' => (string) $sal];
};
$AU = $E('EV_ADMIN_USUARIO'); $AC = $E('EV_ADMIN_CLAVE');
foreach ([['/admin.php', null, null, null], ['/admin.php?t=compras&a=csv', $AU, $AC, null], ['/admin.php', $AU, $AC, ['csrf' => 'x', 'email' => $emailL, 'creditos' => '50']]] as [$ruta, $u, $c, $post]) {
    [$h, $html, $cab] = $adm($ruta, $u, $c, $post);
    check('/admin.php' . ($post ? ' (POST)' : ($u ? ' con clave' : '')) . ' -> 302 a /control/, sin cuerpo', [302, true, ''], [$h, (bool) preg_match('~^Location: /control/\r?$~mi', $cab), trim($html)]);
}
check('…y el POST a /admin.php no dio créditos', 0, $saldo($JL));
$r = $accion('creditos', ['jugador' => $JL, 'cambio' => 50, 'motivo' => '']);
check('Créditos a mano sin motivo -> 400 motivo_invalido', [false, 400, 'motivo_invalido', 0], [$r['ok'], $r['http'] ?? null, $r['codigo'] ?? null, $saldo($JL)]);
$r = $accion('creditos', ['jugador' => 999999, 'cambio' => 50, 'motivo' => 'x']);
check('…a un jugador que no existe -> 404', [false, 404], [$r['ok'], $r['http'] ?? null]);
$r = $accion('creditos', ['jugador' => $JL, 'cambio' => 0, 'motivo' => 'x']);
check('…0 créditos -> 400 cantidad_invalida', 'cantidad_invalida', $r['codigo'] ?? null);
$r = $accion('creditos', ['jugador' => $JL, 'cambio' => 50, 'motivo' => 'compra N° 3 no llegó', 'quien' => 'control:dueno']);
check('Dar 50 créditos a mano -> saldo 50', [true, 50, 50], [$r['ok'], $r['r'] ?? null, $saldo($JL)]);
check('…en el libro con motivo manual', ['manual', 50, 'control:compra N° 3 no llegó'], array_values($fila('SELECT motivo, cambio, ref FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$JL])));
check('…y en la auditoría (quién, qué y el saldo)', ['control:dueno', 'creditos_dar', $JL], array_values($fila("SELECT quien, accion, jugador_id FROM auditoria WHERE accion LIKE 'creditos_%' ORDER BY id DESC LIMIT 1") ?: []));
$r = $accion('creditos', ['jugador' => $JL, 'cambio' => -80, 'motivo' => 'devolución']);
check('Quitar más de lo que tiene -> 409 sin_creditos, saldo igual', [false, 409, 'sin_creditos', 50], [$r['ok'], $r['http'] ?? null, $r['codigo'] ?? null, $saldo($JL)]);
$r = $accion('creditos', ['jugador' => $JL, 'cambio' => -20, 'motivo' => 'devolución']);
check('Quitar 20 -> saldo 30 (auditoría creditos_quitar)', [true, 30, 'creditos_quitar'], [$r['ok'], $saldo($JL), $val("SELECT accion FROM auditoria WHERE accion LIKE 'creditos_%' ORDER BY id DESC LIMIT 1")]);
check('Libro = saldo', 30, $libro($JL));
$hoy = (int) $val("SELECT COALESCE(SUM(ABS(cambio)), 0) FROM movimientos_creditos WHERE motivo = 'manual' AND creado >= ?", [strtotime('today')]);
$r = $accion('creditos', ['jugador' => $JL, 'cambio' => 20001 - $hoy, 'motivo' => 'pasa el tope']);
check('Tope diario de créditos a mano (20.000 por defecto) -> 409 tope_dia, saldo igual', [false, 409, 'tope_dia', 30], [$r['ok'], $r['http'] ?? null, $r['codigo'] ?? null, $saldo($JL)]);
$r = $accion('creditos', ['jugador' => $JL, 'cambio' => 100001, 'motivo' => 'demasiado']);
check('…más de 100.000 de una vez -> 400', [false, 400], [$r['ok'], $r['http'] ?? null]);

// =====================================================================
titulo('Sin credenciales de Plux');
$s = new Nav($URL_SIN, 'sinplux');
$r = $s->api('/api/registro', ['email' => 'sinplux@prueba.example', 'nombre' => 'Sin Plux', 'clave' => 'ClaveSinPlux1']);
check('Estado: plux.disponible false', ['disponible' => false, 'ambiente' => 'sandbox'], $r['plux'] ?? null);
$s->api('/api/orden', ['producto' => 'creditos_250']);
check('Orden -> 503', 503, $s->http);

// Mercado entre jugadores, equipos VIP, servidores, asociaciones y chat (MERCADO.md y SOCIAL.md)
require __DIR__ . '/pruebas_mercado_social.php';
// Tienda nueva, transferencias, reembolsos, Google Play, Centro de Control, soporte, borrar cuenta y arreglos de la auditoría
require __DIR__ . '/pruebas_tienda_cuenta.php';

titulo('Libro de créditos de TODOS los jugadores = su saldo');
check('Jugadores con saldo (créditos - deuda) distinto a la suma de su libro', 0, (int) $val('SELECT COUNT(*) FROM jugadores j WHERE j.creditos - j.deuda <> (SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos m WHERE m.jugador_id = j.id)'));
check('Cada movimiento guarda el saldo que quedó', 0, (int) $val('SELECT COUNT(*) FROM movimientos_creditos m WHERE m.saldo <> (SELECT SUM(cambio) FROM movimientos_creditos x WHERE x.jugador_id = m.jugador_id AND x.id <= m.id)'));
check('Inventario: ningún número de serie repetido por tipo', 0, (int) $val('SELECT COUNT(*) FROM (SELECT item, serie FROM inventario GROUP BY item, serie HAVING COUNT(*) > 1)'));
check('Inventario: cada equipo publicado tiene exactamente una publicación activa, y viceversa', [0, 0], [(int) $val("SELECT COUNT(*) FROM inventario i WHERE i.estado = 'publicado' AND (SELECT COUNT(*) FROM mercado_publicaciones p WHERE p.inventario_id = i.id AND p.estado = 'activa') <> 1"), (int) $val("SELECT COUNT(*) FROM mercado_publicaciones p JOIN inventario i ON i.id = p.inventario_id WHERE p.estado = 'activa' AND i.estado <> 'publicado'")]);
check('Ninguna compra pagada se entregó dos veces', 0, (int) $val("SELECT COUNT(*) FROM (SELECT ref FROM movimientos_creditos WHERE motivo = 'compra' GROUP BY ref HAVING COUNT(*) > 1)"));
check('Base en modo WAL', 'wal', strtolower((string) $val('PRAGMA journal_mode')));

echo "\n----------------------------------------\nResumen pruebas.php — correctas: $ok  ·  Fallas: $fallas\n";
file_put_contents($TMP . '/resumen_pruebas.txt', "$ok $fallas");
exit($fallas === 0 ? 0 : 1);
