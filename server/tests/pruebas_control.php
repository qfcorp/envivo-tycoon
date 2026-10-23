<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Prueba el Centro de Control (/control/) por HTTP contra "php -S" con
// server/tests/router_control.php (imita al bloque de nginx de docs/INTEGRAR_CONTROL.md; lo demás va a router.php), una
// base SQLite TEMPORAL con las migraciones del juego y datos de ejemplo (jugadores, compras, libro de créditos, inventario,
// mercado, chat, soporte, transferencias).
// Revisa que /control/ use SOLO las tablas y clases del servidor: auditoria, ajustes, productos_ajustes, ofertas,
// Compras::revertir, Cuentas::cambiarEstado, Mercado::moderar, Soporte, Transferencias (y que la tienda de
// /api/estado vea los cambios). Además: entrada, segundo factor TOTP (con códigos de un solo uso), lista de IPs, bloqueo,
// galleta (HttpOnly, SameSite=Strict, Secure con https), CSRF, tope diario de créditos, cada pestaña (también con una base
// SIN las tablas opcionales), CSV del SRI y (si hay Playwright) el navegador en un celular 390x844.
// Uso:  php server/tests/pruebas_control.php            (GUARDAR_TMP=1 deja los archivos; CAPTURAS=carpeta para las capturas)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
putenv('TZ=America/Guayaquil');
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$SRV = $RAIZ . '/server';
$TMP = sys_get_temp_dir() . '/envivo_control_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$CAPTURAS = getenv('CAPTURAS') ?: $TMP . '/capturas';
@mkdir($CAPTURAS, 0777, true);
/** Primer puerto libre de 5 seguidos (otras pruebas pueden estar usando los de siempre). */
function puertos_libres(int $desde): int {
    for ($p = $desde; $p < $desde + 2000; $p += 5) {
        $ok = true;
        for ($i = 0; $i < 5 && $ok; $i++) { $s = @stream_socket_server("tcp://127.0.0.1:" . ($p + $i)); if ($s === false) $ok = false; else fclose($s); }
        if ($ok) return $p;
    }
    throw new RuntimeException('No hay puertos libres');
}
$P = puertos_libres((int) (getenv('P_CONTROL') ?: 18391));
[$P_HTTPS, $P_DEG, $P_TOTP, $P_IPS] = [$P + 1, $P + 2, $P + 3, $P + 4];
$USUARIO = 'jefe_control';
$CLAVE = 'Control-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
$TOTP = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
$DB = "$TMP/datos/envivo.sqlite";
$DB_DEG = "$TMP/datos/degradada.sqlite";
$conf = fn(string $db, string $url, string $extra = '') => "; SOLO PRUEBAS\nENVIVO_DB=$db\nENVIVO_URL=$url\nENVIVO_ZONA=America/Guayaquil\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\n$extra";
file_put_contents("$TMP/c.env", $conf($DB, "http://127.0.0.1:$P"));
file_put_contents("$TMP/c_https.env", $conf($DB, "https://127.0.0.1:$P_HTTPS"));
file_put_contents("$TMP/c_deg.env", $conf($DB_DEG, "http://127.0.0.1:$P_DEG"));
file_put_contents("$TMP/c_totp.env", $conf($DB, "http://127.0.0.1:$P_TOTP", "ENVIVO_ADMIN_TOTP=$TOTP\nENVIVO_CONTROL_IPS=10.0.0.0/8, 127.0.0.1\n"));
file_put_contents("$TMP/c_ips.env", $conf($DB, "http://127.0.0.1:$P_IPS", "ENVIVO_CONTROL_IPS=10.9.9.9, 192.168.0.0/16\n"));

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }

/** TOTP propio de la prueba (RFC 6238, independiente de Control.php). */
function totp(string $secreto, int $paso): string {
    $alf = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $k = '';
    foreach (str_split($secreto) as $c) $bits .= str_pad(decbin(strpos($alf, $c)), 5, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $k .= chr(bindec($b));
    $h = hash_hmac('sha1', pack('N*', 0) . pack('N*', $paso), $k, true);
    $o = ord($h[19]) & 0xF;
    return str_pad((string) ((((ord($h[$o]) & 0x7F) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3])) % 1000000), 6, '0', STR_PAD_LEFT);
}

$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) proc_terminate($p);
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});

// ------------------------------------------------------------------------------------------------ base y datos
titulo('Base temporal: migraciones del juego y datos de ejemplo');
foreach (["$TMP/c.env", "$TMP/c_deg.env"] as $c) {
    exec('ENVIVO_CONFIG=' . escapeshellarg($c) . ' php ' . escapeshellarg("$SRV/bin/migrar.php") . ' 2>&1', $out, $rc);
    check('Migraciones del juego (' . basename($c) . ')', 0, $rc);
}
$pdo = new PDO("sqlite:$DB", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec('PRAGMA busy_timeout = 10000');
$val = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); };
$fila = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetch(); };
$exec = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->rowCount(); };

$t = time();
$D = 86400;
foreach ([
    [1, 'ana@prueba.example', 'Ana Pagadora', 900, $t + 30 * $D - 1800, $t - 10 * $D, $t - 100, 'Producciones Ana'],
    [2, 'beto@prueba.example', 'Beto Gastador', 50, null, $t - 5 * $D, $t - 2 * $D, null],
    [3, 'caro@prueba.example', 'Caro Nueva', 0, null, $t - 60, $t - 60, null],
    [4, 'dani@prueba.example', 'Dani Grosero', 0, null, $t - 20 * $D, $t - 3600, 'Dani TV'],
    [5, 'eva@prueba.example', 'Eva Rechazada', 0, null, $t - 40 * $D, $t - 35 * $D, null],
    [6, 'fer@prueba.example', 'Fer Vendedor', 675, null, $t - 15 * $D, $t - 3 * $D, null],
    [7, 'gabi@prueba.example', 'Gabi Compradora', 1000, null, $t - 12 * $D, $t - 2 * $D, null],
] as [$id, $em, $no, $cr, $vip, $cre, $ult, $al]) {
    $exec('INSERT INTO jugadores (id, email, nombre, clave_hash, creditos, vip_hasta, creado, ultimo_ingreso, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
        [$id, $em, $no, 'x', $cr, $vip, $cre, $ult, $al, $al === null ? null : mb_strtolower($al)]);
}
$compra = function (int $id, int $j, string $prod, float $tot, string $estado, ?int $pag, array $extra = []) use ($exec, $t) {
    $sub = round($tot / 1.15, 2);
    $exec('INSERT INTO compras (id, token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en, pagado_por, plux_transaccion, comprador_cedula, comprador_nombre, comprador_email, comprador_telefono, canal, google_order_id, creditos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$id, bin2hex(random_bytes(16)), $j, $prod, $tot, $sub, round($tot - $sub, 2), $estado, ($pag ?? $t) - 120, $pag, $pag ? 'pago' : null, $extra['tx'] ?? ('PLX-' . $id),
         $extra['cedula'] ?? '1710034065', $extra['nombre'] ?? 'Comprador ' . $id, $extra['email'] ?? "factura$id@prueba.example", '0987654321', $extra['canal'] ?? 'web_plux', $extra['google'] ?? null, $extra['creditos'] ?? null]);
};
$compra(1, 1, 'creditos_700', 4.99, 'pagado', $t - 3600, ['cedula' => '1710034065', 'nombre' => 'Ana Pagadora', 'email' => 'ana.factura@prueba.example', 'creditos' => 700]);
$compra(2, 1, 'vip30', 4.99, 'pagado', $t - 1800);
$compra(3, 2, 'inicio', 2.99, 'pagado', $t - 3 * $D, ['nombre' => '=1+1 Beto', 'cedula' => '0912345678']);
$compra(4, 5, 'creditos_250', 1.99, 'rechazado', null);
$compra(5, 3, 'creditos_250', 1.99, 'pendiente', null);
$compra(6, 6, 'inicio', 2.99, 'pagado', $t - 10 * $D);
$compra(7, 7, 'creditos_1500', 9.99, 'pagado', $t - 2 * $D, ['canal' => 'google_play', 'google' => 'GPA.1234-5678', 'tx' => null]);
$mov = function (int $j, int $c, int $s, string $m, string $ref, int $cuando) use ($exec) {
    $exec('INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (?, ?, ?, ?, ?, ?)', [$j, $c, $s, $m, $ref, $cuando]);
};
$mov(1, 700, 700, 'compra', 'compra:1:creditos_700', $t - 3600); $mov(1, 200, 900, 'manual', 'admin:regalo', $t - 30 * $D);
$mov(2, 200, 200, 'compra', 'compra:3:inicio', $t - 3 * $D); $mov(2, -150, 50, 'gasto', 'premium:estrella', $t - 2 * $D);
$mov(6, 200, 200, 'compra', 'compra:6:inicio', $t - 10 * $D); $mov(6, 475, 675, 'mercado_venta', 'mercado:2:cam_pro#2:comision=25', $t - 5 * $D);
$mov(7, 1500, 1500, 'compra', 'compra:7:creditos_1500', $t - 2 * $D); $mov(7, -500, 1000, 'mercado_compra', 'mercado:2:cam_pro#2', $t - 5 * $D + 10);
foreach ([['cable', 5], ['battery', 3]] as [$it, $n]) $exec("INSERT INTO entregas (jugador_id, tipo, item, cantidad, origen, creado) VALUES (2, 'consumible', ?, ?, 'compra:3', ?)", [$it, $n, $t - 3 * $D]);
$exec("INSERT INTO entregas (jugador_id, tipo, item, cantidad, origen, creado) VALUES (2, 'personal', 'stream', 3, 'compra:3', ?)", [$t - 3 * $D]);
$exec("INSERT INTO inventario (id, jugador_id, item, serie, origen, ref, estado, creado, actualizado) VALUES (1, 2, 'cam_pro', 1, 'inicio', 'compra:3', 'publicado', ?, ?)", [$t - 3 * $D, $t - $D]);
$exec("INSERT INTO inventario (id, jugador_id, item, serie, origen, ref, estado, creado, actualizado) VALUES (2, 7, 'cam_pro', 2, 'mercado', 'mercado:2', 'bodega', ?, ?)", [$t - 10 * $D, $t - 5 * $D]);
$exec("INSERT INTO inventario (id, jugador_id, item, serie, origen, ref, estado, creado, actualizado) VALUES (3, 7, 'dron4k', 1, 'canje', 'creditos:dron4k', 'publicado', ?, ?)", [$t - 4 * $D, $t - $D]);
$exec("INSERT INTO series (item, ultima) VALUES ('cam_pro', 2), ('dron4k', 1)");
$exec("INSERT INTO mercado_publicaciones (id, inventario_id, vendedor_id, item, serie, precio, estado, publicado, vence) VALUES (1, 1, 2, 'cam_pro', 1, 300, 'activa', ?, ?)", [$t - $D, $t + 6 * $D]);
$exec("INSERT INTO mercado_publicaciones (id, inventario_id, vendedor_id, item, serie, precio, estado, publicado, vence, cerrado, comprador_id, pago_vendedor, comision) VALUES (2, 2, 6, 'cam_pro', 2, 500, 'vendida', ?, ?, ?, 7, 475, 25)", [$t - 6 * $D, $t + $D, $t - 5 * $D]);
$exec("INSERT INTO mercado_publicaciones (id, inventario_id, vendedor_id, item, serie, precio, estado, publicado, vence) VALUES (3, 3, 7, 'dron4k', 1, 800, 'activa', ?, ?)", [$t - $D, $t + 6 * $D]);
foreach ([1, 1, 2, 3] as $i => $j) $exec('INSERT INTO sesiones (token_hash, jugador_id, creado, expira, ip) VALUES (?, ?, ?, ?, ?)', [hash('sha256', "s$i"), $j, $t - 1000 * ($i + 1), $t + 50 * $D, '10.0.0.' . $i]);
foreach ([1, 3, 4] as $j) $exec('INSERT OR IGNORE INTO actividad (jugador_id, dia) VALUES (?, ?)', [$j, date('Y-m-d')]);
$exec('INSERT OR IGNORE INTO actividad (jugador_id, dia) VALUES (?, ?)', [6, date('Y-m-d', $t - 3 * $D)]);
$exec("INSERT INTO chat_mensajes (id, canal, jugador_id, texto, creado) VALUES (1, 'servidor:1', 4, 'Eres un tonto, vete del juego', ?), (2, 'servidor:1', 1, 'Hola productoras', ?)", [$t - 600, $t - 500]);
$exec("INSERT INTO chat_reportes (mensaje_id, reportante_id, motivo, creado) VALUES (1, 1, 'Acoso o insultos', ?), (1, 2, 'Groserías', ?)", [$t - 400, $t - 300]);
$exec("INSERT INTO soporte_casos (id, jugador_id, categoria, asunto, estado, compra_id, diagnostico_json, creado, actualizado) VALUES (1, 1, 'pago', 'No me llegaron los créditos', 'abierto', 1, ?, ?, ?)",
    [json_encode(['version' => '1.4.0', 'dia' => 12, 'navegador' => 'Chrome Android', 'pantalla' => '390x844']), $t - 900, $t - 900]);
$exec("INSERT INTO soporte_mensajes (caso_id, autor, texto, creado) VALUES (1, 'jugador', 'Pagué los 700 créditos y no los veo. ¿Me ayudan?', ?)", [$t - 900]);
$exec("INSERT INTO transferencias (id, jugador_id, email_anterior, email_nuevo, estado, creado, vence) VALUES (1, 3, 'caro@prueba.example', 'nueva.caro@prueba.example', 'pendiente_pago', ?, ?)", [$t - 600, $t + 2 * $D]);
check('Datos de ejemplo: 7 jugadores, 7 compras, saldo = suma del libro para todos', [7, 7, 0], [(int) $val('SELECT COUNT(*) FROM jugadores'), (int) $val('SELECT COUNT(*) FROM compras'),
    (int) $val('SELECT COUNT(*) FROM jugadores j WHERE creditos - deuda <> (SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos m WHERE m.jugador_id = j.id)')]);

// Base "degradada": sin las tablas opcionales del panel (chat, soporte, transferencias, actividad, publicaciones del mercado)
$q = new PDO("sqlite:$DB_DEG", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$q->exec('PRAGMA foreign_keys = OFF');
foreach (['mercado_retenciones', 'mercado_publicaciones', 'chat_reportes', 'chat_sanciones', 'chat_bloqueos', 'chat_palabras', 'chat_mensajes', 'soporte_mensajes', 'soporte_casos', 'soporte_respuestas', 'actividad', 'transferencias', 'google_anuladas'] as $tb) $q->exec("DROP TABLE IF EXISTS $tb");
$q->exec("INSERT INTO jugadores (id, email, nombre, clave_hash, creditos, creado, servidor_id) VALUES (1, 'solo@prueba.example', 'Solo Jugador', 'x', 250, $t, 1)");
$q->exec("INSERT INTO compras (id, token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en, comprador_cedula, comprador_nombre, comprador_email) VALUES (1, 'tok1', 1, 'creditos_250', 1.99, 1.73, 0.26, 'pagado', $t, $t, '1710034065', 'Solo Jugador', 'solo@prueba.example')");
$q->exec("INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (1, 250, 250, 'compra', 'compra:1:creditos_250', $t)");
$q = null;

// ------------------------------------------------------------------------------------------------ servidores
$arrancar = function (string $conf, int $puerto) use ($RAIZ, $TMP, &$PIDS) {
    $cmd = ['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', "127.0.0.1:$puerto", '-t', $RAIZ, $RAIZ . '/server/tests/router_control.php'];
    $env = array_merge(getenv(), ['ENVIVO_CONFIG' => $conf, 'PHP_CLI_SERVER_WORKERS' => '3']);
    $PIDS[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/srv_$puerto.log", 'a'], 2 => ['file', "$TMP/srv_$puerto.log", 'a']], $pipes, $RAIZ, $env);
    for ($i = 0; $i < 80; $i++) { if (@fsockopen('127.0.0.1', $puerto)) return true; usleep(100000); }
    return false;
};
si('Arrancan los 5 servidores de prueba (normal, https, base degradada, con TOTP, IP no permitida)', $arrancar("$TMP/c.env", $P) && $arrancar("$TMP/c_https.env", $P_HTTPS) && $arrancar("$TMP/c_deg.env", $P_DEG)
    && $arrancar("$TMP/c_totp.env", $P_TOTP) && $arrancar("$TMP/c_ips.env", $P_IPS));

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public array $galletas = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_ctl_' . $n . '_' . getmypid(); @unlink($this->jar); }
    public function __destruct() { @unlink($this->jar); }
    public function pedir(string $m, string $ruta, ?array $datos = null, array $cab = []): int {
        $ch = curl_init($this->base . $ruta);
        $this->cab = []; $this->galletas = [];
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 60,
            CURLOPT_HEADERFUNCTION => function ($c, $h) { $p = explode(':', $h, 2); if (count($p) === 2) { $k = strtolower(trim($p[0])); $this->cab[$k] = trim($p[1]); if ($k === 'set-cookie') $this->galletas[] = trim($p[1]); } return strlen($h); }]);
        if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($datos));
        $this->cuerpo = (string) curl_exec($ch);
        $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lugar = (string) ($this->cab['location'] ?? '');
        return $this->http;
    }
    public function get(string $r, array $cab = []): int { return $this->pedir('GET', $r, null, $cab); }
    public function post(array $d, array $cab = []): int { return $this->pedir('POST', '/control/', $d, $cab); }
    public function tiene(string $t): bool { return str_contains($this->cuerpo, $t); }
    public function csrf(): string { return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $this->cuerpo, $m) ? $m[1] : ''; }
    /** Entra con el formulario. Devuelve el código HTTP de la respuesta al POST. */
    public function entrar(string $u, string $c, ?string $codigo = null): int {
        $this->get('/control/');
        return $this->post(['accion' => 'entrar', 'csrf' => $this->csrf(), 'usuario' => $u, 'clave' => $c] + ($codigo !== null ? ['codigo' => $codigo] : []));
    }
    /** Manda una acción del panel (toma el código CSRF de la página $desde). Devuelve el aviso que se muestra después. */
    public function accion(array $d, string $desde = '/control/?t=resumen'): string {
        $this->get($desde);
        $d += ['csrf' => $this->csrf(), 'volver' => $desde];
        $this->post($d);
        if ($this->http !== 303) return 'HTTP ' . $this->http;
        $this->get($this->lugar);
        return preg_match('/<div class="aviso aviso-(ok|error)" id="aviso"[^>]*>(.*?)<\/div>/s', $this->cuerpo, $m) ? $m[1] . ': ' . html_entity_decode($m[2], ENT_QUOTES) : 'sin aviso';
    }
}
$B = "http://127.0.0.1:$P";
$aud = fn(string $accion) => (int) $val('SELECT COUNT(*) FROM auditoria WHERE accion = ?', [$accion]);
$ultAud = fn(string $accion) => $fila('SELECT * FROM auditoria WHERE accion = ? ORDER BY id DESC LIMIT 1', [$accion]) ?: [];
$limpiarIntentos = fn() => $exec("DELETE FROM intentos WHERE clave LIKE 'control:%'");
$QUIEN = 'control:' . $USUARIO;
$estadoApi = fn() => json_decode((string) file_get_contents($B . '/api/estado'), true) ?? [];
$tienda = function () use ($estadoApi) { $o = []; foreach ($estadoApi()['tienda']['productos'] ?? [] as $p) $o[$p['id']] = $p; return $o; };

// ------------------------------------------------------------------------------------------------ esquema
titulo('Sin tablas paralelas');
check('control.sql solo crea control_sesiones', ['control_sesiones'], (function () use ($SRV) { preg_match_all('/CREATE TABLE IF NOT EXISTS (\w+)/', (string) file_get_contents("$SRV/src/migraciones/control.sql"), $m); return $m[1]; })());

// ------------------------------------------------------------------------------------------------ entrada
titulo('Entrada, galleta de sesión y bloqueo');
$c = new Cli($B, 'a');
check('Sin sesión /control/ muestra el formulario de entrada (200)', [200, true, false], [$c->get('/control/'), $c->tiene('id="form-entrar"'), $c->tiene('class="pestanas"')]);
check('Sin TOTP configurado el formulario no pide código y recomienda activarlo', [false, true], [$c->tiene('name="codigo"'), $c->tiene('segundo factor')]);
check('Sin sesión ?t=compras&csv=1 NO entrega el CSV', [200, false], [$c->get('/control/?t=compras&csv=1'), str_contains($c->cab['content-type'] ?? '', 'csv')]);
check('Cabeceras de seguridad (CSP, no-store, X-Frame-Options DENY, noindex)', [true, 'no-store', 'DENY', true],
    [str_contains($c->cab['content-security-policy'] ?? '', "default-src 'self'"), $c->cab['cache-control'] ?? '', $c->cab['x-frame-options'] ?? '', $c->tiene('noindex')]);
check('/control sin barra -> 301 a /control/', [301, '/control/'], [$c->get('/control'), $c->lugar]);
check('Archivos que no son del panel bajo /control/ -> 404', [404, 404, 404, 404], [$c->get('/control/lib/base.php'), $c->get('/control/lib/'), $c->get('/control/assets/control.css.bak'), $c->get('/control/x.php')]);
check('CSS y JS del panel se sirven', [200, 200], [$c->get('/control/assets/control.css'), $c->get('/control/assets/control.js')]);
$c->get('/control/');
$pre = $c->csrf();
check('POST de entrada sin el código del formulario -> 403 y sin sesión', [403, false], [$c->post(['accion' => 'entrar', 'csrf' => 'x', 'usuario' => $USUARIO, 'clave' => $CLAVE]), $c->tiene('class="pestanas"')]);
check('POST de entrada desde otro sitio (Origin ajeno) -> 403', 403, $c->post(['accion' => 'entrar', 'csrf' => $pre, 'usuario' => $USUARIO, 'clave' => $CLAVE], ['Origin: https://malo.example']));
check('Clave equivocada -> 401 con mensaje y auditoría control_entrar_fallido (con IP)', [401, true, 1, '127.0.0.1'], [$c->entrar($USUARIO, 'mala'), $c->tiene('Usuario o clave incorrectos'), $aud('control_entrar_fallido'), $ultAud('control_entrar_fallido')['ip'] ?? null]);
check('Usuario equivocado (clave buena) -> 401', 401, $c->entrar('otro', $CLAVE));
$c->entrar($USUARIO, $CLAVE);
$gal = implode("\n", $c->galletas);
check('Entrar bien -> 303 a /control/ con galleta envivo_control', [303, '/control/', true], [$c->http, $c->lugar, str_contains($gal, 'envivo_control=')]);
check('La galleta es HttpOnly, SameSite=Strict y solo para /control/ (sin Secure en http)', [true, true, true, false],
    [stripos($gal, 'HttpOnly') !== false, stripos($gal, 'SameSite=Strict') !== false, stripos($gal, 'path=/control/') !== false, (bool) preg_match('/envivo_control=[a-f0-9]{64}[^\n]*secure/i', $gal)]);
check('En la base se guarda solo el sha256 del código de la sesión', [1, 0], [(int) $val('SELECT COUNT(*) FROM control_sesiones'),
    (int) $val('SELECT COUNT(*) FROM control_sesiones WHERE token_hash = ?', [preg_match('/envivo_control=([a-f0-9]{64})/', $gal, $m) ? $m[1] : ''])]);
check('Auditoría: control_entrar con quien = control:<usuario>', [1, $QUIEN], [$aud('control_entrar'), $ultAud('control_entrar')['quien'] ?? null]);
$c->get('/control/');
check('Con sesión se ven las pestañas y el usuario', [200, true, true], [$c->http, $c->tiene('class="pestanas"'), $c->tiene($USUARIO)]);
$h = new Cli("http://127.0.0.1:$P_HTTPS", 'https');
$h->get('/control/');
si('Con ENVIVO_URL https la galleta lleva Secure', stripos(implode("\n", $h->galletas), 'secure') !== false);

$limpiarIntentos();
$x = new Cli($B, 'bloqueo');
$codigos = [];
for ($i = 0; $i < 5; $i++) $codigos[] = $x->entrar($USUARIO, 'mala' . $i);
check('Claves equivocadas -> 401; la quinta avisa que el acceso queda bloqueado (429)', [401, 401, 401, 401, 429, true], [...$codigos, $x->tiene('Usuario o clave incorrectos. Demasiados intentos')]);
check('Después: bloqueado (429) aunque la clave sea la buena, sin sesión', [429, true, false], [$x->entrar($USUARIO, $CLAVE), $x->tiene('Demasiados intentos'), str_contains(implode("\n", $x->galletas), 'envivo_control=')]);
check('El formulario muestra el bloqueo y el botón desactivado', [429, true], [$x->get('/control/'), $x->tiene('type="submit" disabled')]);
check('La sesión ya abierta sigue funcionando durante el bloqueo', 200, $c->get('/control/?t=resumen'));
$limpiarIntentos();
check('Sin intentos recientes se puede entrar otra vez', 303, $x->entrar($USUARIO, $CLAVE));

// ------------------------------------------------------------------------------------------------ TOTP e IPs
titulo('Segundo factor (TOTP) y lista de IPs');
$z = new Cli("http://127.0.0.1:$P_TOTP", 'totp');
check('Con ENVIVO_ADMIN_TOTP el formulario pide el código', [200, true], [$z->get('/control/'), $z->tiene('name="codigo"')]);
check('Clave buena sin código -> 401 "código no válido", sin sesión', [401, true, false], [$z->entrar($USUARIO, $CLAVE, ''), $z->tiene('código de la app de autenticación no es válido'), str_contains(implode("\n", $z->galletas), 'envivo_control=')]);
check('Código equivocado -> 401', 401, $z->entrar($USUARIO, $CLAVE, totp($TOTP, intdiv(time(), 30) + 5)));
check('Código bueno pero clave mala -> 401 (no gasta el código)', 401, $z->entrar($USUARIO, 'mala', totp($TOTP, intdiv(time(), 30))));
$limpiarIntentos();
$cod = totp($TOTP, intdiv(time(), 30));
check('Clave + código de ahora -> 303 y auditoría "Con segundo factor"', [303, true], [$z->entrar($USUARIO, $CLAVE, $cod), str_starts_with($ultAud('control_entrar')['detalle'] ?? '', 'Con segundo factor')]);
$z2 = new Cli("http://127.0.0.1:$P_TOTP", 'totp2');
check('El mismo código no sirve dos veces (repetición)', 401, $z2->entrar($USUARIO, $CLAVE, $cod));
check('…y el código anterior a ese tampoco', 401, $z2->entrar($USUARIO, $CLAVE, totp($TOTP, intdiv(time(), 30) - 1)));
check('Con sesión TOTP se ve el panel (IP 127.0.0.1 está en la lista 10.0.0.0/8, 127.0.0.1)', [200, true], [$z->get('/control/?t=ajustes'), $z->tiene('Segundo factor (TOTP): <span class="chip chip-ok">activo')]);
$y = new Cli($B, 'otra_huella');
$y->entrar($USUARIO, $CLAVE);
check('Una sesión abierta SIN segundo factor no vale en el servidor que lo exige (huella distinta)', [200, false], [(function () use ($y, $P_TOTP) { $y->base = "http://127.0.0.1:$P_TOTP"; return $y->get('/control/'); })(), $y->tiene('class="pestanas"')]);
$w = new Cli("http://127.0.0.1:$P_IPS", 'ips');
check('Desde una IP fuera de ENVIVO_CONTROL_IPS: 404 sin formulario (GET y POST)', [404, false, 404], [$w->get('/control/'), $w->tiene('form-entrar'), $w->post(['accion' => 'entrar', 'usuario' => $USUARIO, 'clave' => $CLAVE])]);
check('php server/bin/control_totp.php crea un secreto base32 y el enlace otpauth', true, (bool) preg_match('/^ENVIVO_ADMIN_TOTP=[A-Z2-7]{32}\n\notpauth:\/\/totp\//', (string) shell_exec('ENVIVO_CONFIG=/dev/null php ' . escapeshellarg("$SRV/bin/control_totp.php") . ' jefe')));
check('Control::totpCodigo cumple los vectores del RFC 6238 (T=59, 1111111109, 2000000000)', "287082 081804 279037\n", (string) shell_exec('ENVIVO_CONFIG=/dev/null php -r ' . escapeshellarg('require "' . $SRV . '/src/arranque.php"; $s = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; echo EnVivo\Control::totpCodigo($s, 1), " ", EnVivo\Control::totpCodigo($s, 37037036), " ", EnVivo\Control::totpCodigo($s, 66666666), "\n";')));

// ------------------------------------------------------------------------------------------------ CSRF
titulo('CSRF en cada POST');
$antes = (int) $val('SELECT creditos FROM jugadores WHERE id = 3');
check('POST sin código CSRF -> 403 y no cambia nada', [403, $antes], [$c->post(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 99, 'motivo' => 'x']), (int) $val('SELECT creditos FROM jugadores WHERE id = 3')]);
$c->get('/control/?t=jugadores&id=3');
$tok = $c->csrf();
check('POST con el código de OTRA sesión -> 403', 403, $c->post(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 99, 'motivo' => 'x', 'csrf' => (function () use ($x) { $x->get('/control/'); return $x->csrf(); })()]));
check('POST con código bueno pero Origin de otro sitio -> 403', 403, $c->post(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 99, 'motivo' => 'x', 'csrf' => $tok], ['Origin: https://malo.example']));
check('POST con Referer de otro sitio -> 403', 403, $c->post(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 99, 'motivo' => 'x', 'csrf' => $tok], ['Referer: https://malo.example/control/']));
check('…nada cambió y quedó auditado como control_csrf_rechazado', [$antes, true], [(int) $val('SELECT creditos FROM jugadores WHERE id = 3'), $aud('control_csrf_rechazado') >= 4]);
check('POST sin sesión -> vuelve a la entrada (303) sin hacer nada', [303, $antes], [(new Cli($B, 'nada'))->post(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 5, 'motivo' => 'x', 'csrf' => $tok]), (int) $val('SELECT creditos FROM jugadores WHERE id = 3')]);
check('El código CSRF está en todos los formularios POST de la ficha', true, (function () use ($c) {
    $c->get('/control/?t=jugadores&id=1');
    preg_match_all('/<form method="post"[^>]*>(.*?)<\/form>/s', $c->cuerpo, $m);
    return count($m[1]) > 3 && count(array_filter($m[1], fn($f) => !preg_match('/name="csrf" value="[a-f0-9]{64}"/', $f))) === 0;
})());
check('Volver a una dirección fuera del panel no se permite (vuelve a /control/)', '/control/', (function () use ($c) {
    $c->get('/control/?t=ajustes');
    $c->post(['accion' => 'ajustes_anuncio', 'texto' => '', 'tipo' => 'info', 'hasta' => '', 'csrf' => $c->csrf(), 'volver' => 'https://malo.example/']);
    return $c->lugar;
})());

// ------------------------------------------------------------------------------------------------ pestañas
titulo('Cada pestaña se ve (con datos)');
$marcas = ['resumen' => ['kpi-hoy', 'graf-ventas', 'graf-creditos', 'mas-vendidos', 'por-canal', 'tabla-creditos'], 'jugadores' => ['tabla-jugadores', 'ana@prueba.example', 'tabla-transferencias'],
    'compras' => ['tabla-compras', 'csv-sri'], 'productos' => ['prod-creditos_700', 'tabla-ofertas', 'tabla-premium'], 'mercado' => ['tabla-mercado', 'kpi-mercado-quemados'],
    'chat' => ['reporte-1', 'lista-palabras'], 'soporte' => ['lista-casos', 'No me llegaron', 'respuestas-rapidas'], 'ajustes' => ['panel-mantenimiento', 'panel-abuso', 'panel-google', 'panel-seguridad', 'tabla-auditoria']];
foreach ($marcas as $tab => $ids) {
    $c->get('/control/?t=' . $tab);
    check("Pestaña $tab: 200, marcada como activa, con sus partes", [200, true, true, false], [$c->http, $c->tiene('data-pestana="' . $tab . '"'), array_reduce($ids, fn($a, $i) => $a && $c->tiene($i), true), $c->tiene('aún no disponible')]);
}
$c->get('/control/?t=resumen');
$mesEsperado = '$' . number_format((float) $val("SELECT SUM(total) FROM compras WHERE estado = 'pagado' AND pagado_en >= ?", [strtotime(date('Y-m-01 00:00:00'))]), 2, ',', '.');
check('Resumen: ventas de hoy = compras 1 y 2 ($9,98) y las del mes cuadran con la base', [true, true], [(bool) preg_match('/id="kpi-hoy".*?\$9,98/s', $c->cuerpo), (bool) preg_match('/id="kpi-mes"><span class="kpi-t">[^<]*<\/span><b class="kpi-v">' . preg_quote($mesEsperado, '/') . '</s', $c->cuerpo)]);
check('Resumen: DAU = 3 (tabla actividad), MAU = 4', [true, true], [(bool) preg_match('/id="kpi-activos".*?<b class="kpi-v">3</s', $c->cuerpo), $c->tiene('MAU (30 días): 4')]);
check('Resumen: soporte (1 espera respuesta) y reportes (1), con insignias', [true, true, true], [(bool) preg_match('/id="kpi-soporte".*?<b class="kpi-v">1</s', $c->cuerpo), (bool) preg_match('/id="kpi-reportes".*?<b class="kpi-v">1</s', $c->cuerpo), $c->tiene('class="insignia"')]);
check('Resumen: emitidos 30 d = 2.600 (compras, sin el mercado) y quemados = 150 + 25 de comisión', [true, true], [(bool) preg_match('/id="kpi-emitidos".*?<b class="kpi-v">2\.600</s', $c->cuerpo), (bool) preg_match('/id="kpi-quemados".*?<b class="kpi-v">175</s', $c->cuerpo)]);
check('Resumen: gráficos SVG en línea con detalle por barra, tabla alternativa y Google Play', [true, true, true, true], [$c->tiene('<svg class="grafico"'), $c->tiene('data-tip="'), $c->tiene('Ver como tabla'), $c->tiene('Google Play')]);
$c->get('/control/?t=jugadores&q=Producciones%20Ana');
check('Buscar por alias encuentra a Ana', [true, false], [$c->tiene('ana@prueba.example'), $c->tiene('beto@prueba.example')]);
$c->get('/control/?t=jugadores&q=7');
check('Buscar por número encuentra a Gabi', true, $c->tiene('gabi@prueba.example'));
$c->get('/control/?t=jugadores&q=' . rawurlencode('<script>'));
check('La búsqueda se escapa (sin HTML inyectado)', [200, false], [$c->http, $c->tiene('value="<script>"')]);
$c->get('/control/?t=jugadores&id=2');
check('Ficha de Beto: compras, libro, inventario, entregas y sanciones del chat', [200, true, true, true, true, true], [$c->http, $c->tiene('id="compras-jugador"'), $c->tiene('id="libro-jugador"'), $c->tiene('id="inventario-jugador"') && $c->tiene('#0001'), $c->tiene('id="entregas-jugador"'), $c->tiene('id="sanciones-jugador"')]);
$c->get('/control/?t=jugadores&id=1');
check('Ficha de Ana: VIP activo, 2 sesiones y su caso de soporte', [true, true, true], [(bool) preg_match('/id="kpi-vip".*?Activo/s', $c->cuerpo), $c->tiene('Cerrar todas sus sesiones (2)'), $c->tiene('No me llegaron')]);
check('Ficha de un jugador que no existe: 200 con aviso', [200, true], [$c->get('/control/?t=jugadores&id=999'), $c->tiene('No existe')]);
$c->get('/control/?t=compras&id=3');
check('Detalle de la compra 3: lo que entregó (200 créditos, cámara, entregas) y el formulario de reembolso', [true, true, true, true], [$c->tiene('<b>200</b>'), $c->tiene((function () use ($SRV) { require_once $SRV . '/src/Catalogo.php'; return \EnVivo\Catalogo::EQUIPOS['cam_pro']; })() . ' #0001'), $c->tiene('no se puede quitar'), $c->tiene('compra_revertir')]);
$c->get('/control/?t=soporte&caso=1');
check('Caso de soporte: hilo, compra del caso, diagnóstico y respuestas rápidas', [true, true, true, true], [$c->tiene('id="hilo"'), $c->tiene('N° 1</a>'), $c->tiene('Chrome Android'), $c->tiene('data-rapida=')]);
$c->get('/control/?t=compras&estado=todas');
check('Compras: filtro "todas" muestra pagadas, pendiente y rechazada', [true, true, true], [$c->tiene('chip-ok">pagado'), $c->tiene('chip-aviso">pendiente'), $c->tiene('chip-mal">rechazado')]);
$c->get('/control/?t=compras&estado=pagado&canal=google_play');
check('Compras: filtro por canal Google Play', [true, false], [$c->tiene('>7</b>'), $c->tiene('>1</b></a>')]);
check('Compras: filtros inválidos se ignoran (200)', 200, $c->get('/control/?t=compras&estado=nada&desde=ayer&producto=nada'));

titulo('Cada pestaña se ve con una base SIN las tablas opcionales');
$d = new Cli("http://127.0.0.1:$P_DEG", 'deg');
check('Entrar en la base degradada', 303, $d->entrar($USUARIO, $CLAVE));
foreach (array_keys($marcas) as $tab) {
    $d->get('/control/?t=' . $tab);
    $esperaAviso = in_array($tab, ['mercado', 'chat', 'soporte', 'resumen'], true);
    check("Base degradada, $tab: 200" . ($esperaAviso ? ' con "aún no disponible"' : ''), [200, $esperaAviso], [$d->http, $d->tiene('aún no disponible')]);
}
check('Base degradada: ficha del jugador y detalle de compra (200)', [200, 200], [$d->get('/control/?t=jugadores&id=1'), $d->get('/control/?t=compras&id=1')]);
check('Base degradada: dar créditos funciona', true, str_starts_with($d->accion(['accion' => 'jugador_creditos', 'jugador_id' => 1, 'cambio' => 10, 'motivo' => 'Prueba sin tablas'], '/control/?t=jugadores&id=1'), 'ok:'));
check('Base degradada: acciones de mercado/chat/soporte responden "aún no disponible" sin romperse', [true, true, true], [
    str_contains($d->accion(['accion' => 'mercado_quitar', 'publicacion_id' => 1]), 'aún no'), str_contains($d->accion(['accion' => 'chat_ocultar', 'mensaje_id' => 1]), 'aún no'), str_contains($d->accion(['accion' => 'soporte_cerrar', 'caso_id' => 1]), 'aún no')]);

// ------------------------------------------------------------------------------------------------ jugadores
titulo('Jugadores: créditos (con tope), estado de la cuenta, sesiones, transferencias');
check('Dar créditos sin motivo -> error, nada cambia', [true, 0], [str_starts_with($c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 50, 'motivo' => ''], '/control/?t=jugadores&id=3'), 'error:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 3')]);
$r = $c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 50, 'motivo' => 'Compensación por caída'], '/control/?t=jugadores&id=3');
check('Dar 50 créditos con motivo -> ok, saldo 50, libro con motivo manual y ref control:', [true, 50, ['cambio' => 50, 'saldo' => 50, 'motivo' => 'manual', 'ref' => 'control:Compensación por caída']],
    [str_starts_with($r, 'ok:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 3'), $fila('SELECT cambio, saldo, motivo, ref FROM movimientos_creditos WHERE jugador_id = 3 ORDER BY id DESC LIMIT 1')]);
$a = $ultAud('creditos_dar');
check('Auditoría (tabla auditoria): quién, jugador, detalle con antes -> después, IP', [$QUIEN, 3, '50 créditos: Compensación por caída (saldo 0 -> 50)', '127.0.0.1'], [$a['quien'] ?? null, (int) ($a['jugador_id'] ?? 0), $a['detalle'] ?? null, $a['ip'] ?? null]);
check('Quitar más de lo que tiene -> error, saldo igual', [true, 50], [str_starts_with($c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => -80, 'motivo' => 'x'], '/control/?t=jugadores&id=3'), 'error:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 3')]);
check('Quitar 20 -> ok, saldo 30 y auditoría creditos_quitar', [true, 30, 1], [str_starts_with($c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => -20, 'motivo' => 'Error mío'], '/control/?t=jugadores&id=3'), 'ok:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 3'), $aud('creditos_quitar')]);
check('Cantidad no numérica -> error', true, str_starts_with($c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => '1e3', 'motivo' => 'x'], '/control/?t=jugadores&id=3'), 'error:'));
check('Más de 5.000 sin "Confirmo la cantidad" -> error', [true, 30], [str_contains($c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 6000, 'motivo' => 'Premio'], '/control/?t=jugadores&id=3'), 'Confirmo la cantidad'), (int) $val('SELECT creditos FROM jugadores WHERE id = 3')]);
check('…con la confirmación -> ok', [true, 6030], [str_starts_with($c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 6000, 'motivo' => 'Premio', 'confirmo' => '1'], '/control/?t=jugadores&id=3'), 'ok:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 3')]);
check('Tope diario (20.000): otros 15.000 hoy -> error "Tope diario", saldo igual', [true, 6030], [str_contains($c->accion(['accion' => 'jugador_creditos', 'jugador_id' => 3, 'cambio' => 15000, 'motivo' => 'Otro premio', 'confirmo' => '1'], '/control/?t=jugadores&id=3'), 'Tope diario'), (int) $val('SELECT creditos FROM jugadores WHERE id = 3')]);
$r = $c->accion(['accion' => 'jugador_estado', 'jugador_id' => 4, 'estado' => 'suspendido', 'motivo' => 'Insultos en el chat'], '/control/?t=jugadores&id=4');
check('Suspender (Cuentas::cambiarEstado): estado, motivo y auditoría cuenta_suspendido', [true, 'suspendido', 'Insultos en el chat', 1], [str_starts_with($r, 'ok:'), $val('SELECT estado FROM jugadores WHERE id = 4'), $val('SELECT estado_motivo FROM jugadores WHERE id = 4'), $aud('cuenta_suspendido')]);
check('Banear sin motivo -> error', [true, 'activo'], [str_starts_with($c->accion(['accion' => 'jugador_estado', 'jugador_id' => 5, 'estado' => 'baneado', 'motivo' => ''], '/control/?t=jugadores&id=5'), 'error:'), $val('SELECT estado FROM jugadores WHERE id = 5')]);
check('Reactivar -> activo, auditoría cuenta_activo', [true, 'activo', 1], [str_starts_with($c->accion(['accion' => 'jugador_estado', 'jugador_id' => 4, 'estado' => 'activo', 'motivo' => ''], '/control/?t=jugadores&id=4'), 'ok:'), $val('SELECT estado FROM jugadores WHERE id = 4'), $aud('cuenta_activo')]);
$exec('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, 5, ?, ?)', [hash('sha256', 'eva'), time(), time() + $D]);
check('Banear: baneada, cierra sus sesiones, la ficha lo muestra', [true, 'baneado', 0, true], [str_starts_with($c->accion(['accion' => 'jugador_estado', 'jugador_id' => 5, 'estado' => 'baneado', 'motivo' => 'Fraude'], '/control/?t=jugadores&id=5'), 'ok:'),
    $val('SELECT estado FROM jugadores WHERE id = 5'), (int) $val('SELECT COUNT(*) FROM sesiones WHERE jugador_id = 5'), $c->tiene('Cuenta baneada desde el')]);
check('Estado no válido -> error', true, str_starts_with($c->accion(['accion' => 'jugador_estado', 'jugador_id' => 5, 'estado' => 'borrado', 'motivo' => 'x'], '/control/?t=jugadores&id=5'), 'error:'));
check('Cerrar sesiones de Beto: 1 -> 0, auditoría sesiones_cerrar', [1, true, 0, 1], [(int) $val('SELECT COUNT(*) FROM sesiones WHERE jugador_id = 2'),
    str_contains($c->accion(['accion' => 'jugador_sesiones', 'jugador_id' => 2], '/control/?t=jugadores&id=2'), 'Se cerraron 1'), (int) $val('SELECT COUNT(*) FROM sesiones WHERE jugador_id = 2'), $aud('sesiones_cerrar')]);
check('Cancelar la transferencia de Caro (Transferencias::cancelar audita)', [true, 'cancelada', $QUIEN, 1], [str_starts_with($c->accion(['accion' => 'transferencia_cancelar', 'transferencia_id' => 1], '/control/?t=jugadores'), 'ok:'),
    $val('SELECT estado FROM transferencias WHERE id = 1'), $val('SELECT cancelada_por FROM transferencias WHERE id = 1'), $aud('transferencia_cancelada')]);
check('Cancelarla otra vez -> error', true, str_starts_with($c->accion(['accion' => 'transferencia_cancelar', 'transferencia_id' => 1], '/control/?t=jugadores'), 'error:'));
$c->get('/control/?t=jugadores&id=3');
check('La ficha muestra la auditoría de la cuenta (tabla auditoria)', [true, true], [$c->tiene('id="auditoria-jugador"'), $c->tiene('Compensación por caída')]);

// ------------------------------------------------------------------------------------------------ mercado (antes de los reembolsos: suspender congela publicaciones)
titulo('Mercado (Mercado::moderar): congelar, reactivar, quitar');
check('Congelar la publicación 3 (dron de Gabi)', [true, 'congelada', 1], [str_starts_with($c->accion(['accion' => 'mercado_congelar', 'publicacion_id' => 3], '/control/?t=mercado'), 'ok:'), $val('SELECT estado FROM mercado_publicaciones WHERE id = 3'), $aud('mercado_congelar')]);
check('Congelar otra vez -> error', true, str_starts_with($c->accion(['accion' => 'mercado_congelar', 'publicacion_id' => 3], '/control/?t=mercado'), 'error:'));
check('Reactivar', [true, 'activa', 1], [str_starts_with($c->accion(['accion' => 'mercado_descongelar', 'publicacion_id' => 3], '/control/?t=mercado'), 'ok:'), $val('SELECT estado FROM mercado_publicaciones WHERE id = 3'), $aud('mercado_descongelar')]);
check('Quitar: publicación quitada y el dron vuelve a la bodega de Gabi', [true, 'quitada', 'bodega', 7, 1], [str_starts_with($c->accion(['accion' => 'mercado_quitar', 'publicacion_id' => 3], '/control/?t=mercado'), 'ok:'),
    $val('SELECT estado FROM mercado_publicaciones WHERE id = 3'), $val('SELECT estado FROM inventario WHERE id = 3'), (int) $val('SELECT jugador_id FROM inventario WHERE id = 3'), $aud('mercado_quitar')]);
check('Quitar una vendida -> error', true, str_starts_with($c->accion(['accion' => 'mercado_quitar', 'publicacion_id' => 2], '/control/?t=mercado'), 'error:'));
$c->get('/control/?t=mercado&estado=vendida');
check('Mercado: ventas y comisión quemada (25)', [true, true], [$c->tiene('comisión 25'), (bool) preg_match('/id="kpi-mercado-quemados".*?<b class="kpi-v">25</s', $c->cuerpo)]);

// ------------------------------------------------------------------------------------------------ reembolsos
titulo('Reembolso / contracargo (Compras::revertir)');
check('Revertir una compra pendiente o rechazada -> error', [true, true], [str_starts_with($c->accion(['accion' => 'compra_revertir', 'compra_id' => 5, 'tipo' => 'reembolso', 'motivo' => 'x'], '/control/?t=compras&id=5'), 'error:'),
    str_starts_with($c->accion(['accion' => 'compra_revertir', 'compra_id' => 4, 'tipo' => 'reembolso', 'motivo' => 'x'], '/control/?t=compras&id=4'), 'error:')]);
check('Revertir sin motivo o con tipo inválido -> error, la compra sigue pagada', [true, true, 'pagado'], [str_starts_with($c->accion(['accion' => 'compra_revertir', 'compra_id' => 1, 'tipo' => 'reembolso', 'motivo' => ''], '/control/?t=compras&id=1'), 'error:'),
    str_starts_with($c->accion(['accion' => 'compra_revertir', 'compra_id' => 1, 'tipo' => 'regalo', 'motivo' => 'x'], '/control/?t=compras&id=1'), 'error:'), $val('SELECT estado FROM compras WHERE id = 1')]);
$r = $c->accion(['accion' => 'compra_revertir', 'compra_id' => 1, 'tipo' => 'reembolso', 'motivo' => 'Pidió devolución'], '/control/?t=compras&id=1');
check('Reembolso compra 1 (Ana, 700 de 900): saldo 200, sin deuda, compra revertida con sus datos', [true, 200, 0, ['estado' => 'revertido', 'revertida_tipo' => 'reembolso', 'revertida_motivo' => 'Pidió devolución', 'revertida_por' => $QUIEN]],
    [str_starts_with($r, 'ok:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 1'), (int) $val('SELECT deuda FROM jugadores WHERE id = 1'), $fila('SELECT estado, revertida_tipo, revertida_motivo, revertida_por FROM compras WHERE id = 1')]);
check('…el libro anota -700 y el saldo = suma del libro', [-700, 200, 200], [(int) $val('SELECT cambio FROM movimientos_creditos WHERE jugador_id = 1 ORDER BY id DESC LIMIT 1'), (int) $val('SELECT saldo FROM movimientos_creditos WHERE jugador_id = 1 ORDER BY id DESC LIMIT 1'), (int) $val('SELECT SUM(cambio) FROM movimientos_creditos WHERE jugador_id = 1')]);
check('…Ana suspendida y auditoría compra_reembolso con la compra y el jugador', ['suspendido', 1, 1, 1], [$val('SELECT estado FROM jugadores WHERE id = 1'), $aud('compra_reembolso'), (int) ($ultAud('compra_reembolso')['compra_id'] ?? 0), (int) ($ultAud('compra_reembolso')['jugador_id'] ?? 0)]);
check('…revertir otra vez la misma compra -> error "ya fue revertida"', true, str_contains($c->accion(['accion' => 'compra_revertir', 'compra_id' => 1, 'tipo' => 'reembolso', 'motivo' => 'otra vez'], '/control/?t=compras&id=1'), 'ya fue revertida'));
check('…el detalle muestra el reembolso aplicado y ya no el formulario', [true, false], [$c->get('/control/?t=compras&id=1') === 200 && $c->tiene('id="reembolso-hecho"'), $c->tiene('name="accion" value="compra_revertir"')]);
check('Reembolso compra 2 (VIP 30 días): el VIP queda terminado', [true, true], [str_starts_with($c->accion(['accion' => 'compra_revertir', 'compra_id' => 2, 'tipo' => 'reembolso', 'motivo' => 'Doble cobro'], '/control/?t=compras&id=2'), 'ok:'),
    (int) $val('SELECT vip_hasta FROM jugadores WHERE id = 1') <= time()]);
$r = $c->accion(['accion' => 'compra_revertir', 'compra_id' => 3, 'tipo' => 'contracargo', 'motivo' => 'Contracargo del banco'], '/control/?t=compras&id=3');
check('Contracargo compra 3 (Beto, gastó 150 de 200): saldo -150 (créditos 0, deuda 150)', [true, 0, 150, -150], [str_starts_with($r, 'ok:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 2'), (int) $val('SELECT deuda FROM jugadores WHERE id = 2'), (int) $val('SELECT SUM(cambio) FROM movimientos_creditos WHERE jugador_id = 2')]);
check('…la cámara del paquete (publicada) queda revocada y su publicación "quitada"; un contracargo BANEA (Compras::revisarAbuso); auditoría', ['revocado', 'quitada', 'baneado', 1, true],
    [$val('SELECT estado FROM inventario WHERE id = 1'), $val('SELECT estado FROM mercado_publicaciones WHERE id = 1'), $val('SELECT estado FROM jugadores WHERE id = 2'), $aud('compra_contracargo'), str_contains($r, 'BANEADA')]);
$r = $c->accion(['accion' => 'compra_revertir', 'compra_id' => 7, 'tipo' => 'contracargo', 'motivo' => 'Reembolso de Google'], '/control/?t=compras&id=7');
check('Contracargo compra 7 (Gabi, Google Play, 1.500 con 1.000): deuda 500; lo que no vino de la compra no se toca', [true, 0, 500, 'bodega', 'bodega'],
    [str_starts_with($r, 'ok:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 7'), (int) $val('SELECT deuda FROM jugadores WHERE id = 7'), $val('SELECT estado FROM inventario WHERE id = 2'), $val('SELECT estado FROM inventario WHERE id = 3')]);
$r = $c->accion(['accion' => 'compra_revertir', 'compra_id' => 6, 'tipo' => 'reembolso', 'motivo' => 'Prueba'], '/control/?t=compras&id=6');
check('Reembolso compra 6 (Fer ya vendió su cámara a Gabi): quita 200, Gabi conserva la cámara', [true, 475, 7, 'bodega'],
    [str_starts_with($r, 'ok:'), (int) $val('SELECT creditos FROM jugadores WHERE id = 6'), (int) $val('SELECT jugador_id FROM inventario WHERE id = 2'), $val('SELECT estado FROM inventario WHERE id = 2')]);
check('Saldo (créditos − deuda) = suma del libro para todos tras los reembolsos', 0, (int) $val('SELECT COUNT(*) FROM jugadores j WHERE creditos - deuda <> (SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos m WHERE m.jugador_id = j.id)'));
check('Nada en tablas propias: no existen control_reembolsos / control_auditoria / productos_config / control_ajustes', 0, (int) $val("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('control_reembolsos', 'control_auditoria', 'productos_config', 'control_ajustes', 'control_sanciones')"));

// ------------------------------------------------------------------------------------------------ CSV
titulo('CSV para el SRI');
$exec("UPDATE compras SET estado = 'pagado' WHERE id = 3");   // para revisar el escape de fórmulas en una fila pagada
$c->get('/control/?t=compras&estado=pagado&csv=1');
$lineas = array_values(array_filter(preg_split('/\r?\n/', $c->cuerpo)));
$cab = str_getcsv(preg_replace('/^\xEF\xBB\xBF/', '', $lineas[0] ?? ''), ';', '"', '');
check('CSV: 200, text/csv, adjunto, con BOM para Excel', [200, true, true, true], [$c->http, str_contains($c->cab['content-type'] ?? '', 'text/csv'), str_contains($c->cab['content-disposition'] ?? '', 'attachment'), str_starts_with($c->cuerpo, "\xEF\xBB\xBF")]);
check('CSV: columnas para facturar', ['N° compra', 'Fecha de pago', 'Cédula/RUC comprador', 'Nombre comprador', 'Correo comprador', 'Celular', 'Producto', 'Subtotal', 'IVA', 'Total', 'Estado', 'Canal', 'Transacción', 'Cuenta del jugador'], $cab);
$filas = array_map(fn($l) => array_combine($cab, str_getcsv($l, ';', '"', '')), array_slice($lineas, 1));
$f3 = array_values(array_filter($filas, fn($f) => $f['N° compra'] === '3'))[0] ?? [];
check('CSV: solo pagadas (las revertidas/pendientes no salen) -> solo la 3', ['3'], array_column($filas, 'N° compra'));
check('CSV: fila 3 con cédula, nombre escapado contra fórmulas, correo, subtotal + IVA = total, fecha', ['0912345678', "'=1+1 Beto", 'factura3@prueba.example', '2.60', '0.39', '2.99', true],
    [$f3['Cédula/RUC comprador'] ?? null, $f3['Nombre comprador'] ?? null, $f3['Correo comprador'] ?? null, $f3['Subtotal'] ?? null, $f3['IVA'] ?? null, $f3['Total'] ?? null, (bool) preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $f3['Fecha de pago'] ?? '')]);
$exec("UPDATE compras SET estado = 'revertido' WHERE id = 3");
$c->get('/control/?t=compras&estado=revertido&csv=1');
check('CSV de revertidas (para notas de crédito): 5 filas, Google Play con su orden', [5, 'GPA.1234-5678'], [count(array_filter(preg_split('/\r?\n/', $c->cuerpo))) - 1,
    (function ($t) { foreach (preg_split('/\r?\n/', $t) as $l) { $x = str_getcsv($l, ';', '"', ''); if (($x[0] ?? '') === '7') return $x[12]; } return null; })($c->cuerpo)]);
check('Exportar CSV queda en la auditoría', true, $aud('control_csv_compras') >= 2);

// ------------------------------------------------------------------------------------------------ productos
titulo('Productos y ofertas (productos_ajustes y ofertas: las que lee la tienda)');
$r = $c->accion(['accion' => 'producto_guardar', 'producto' => 'creditos_700', 'precio' => '3,49', 'creditos' => '750', 'activo' => '1'], '/control/?t=productos');
check('Guardar $3,49 y 750 créditos -> productos_ajustes y auditoría producto_editar', [true, ['precio' => 3.49, 'creditos' => 750, 'activo' => 1], 1],
    [str_starts_with($r, 'ok:'), $fila('SELECT precio, creditos, activo FROM productos_ajustes WHERE producto = ?', ['creditos_700']), $aud('producto_editar')]);
$fin = date('Y-m-d\TH:i', time() + 86400);
$r = $c->accion(['accion' => 'oferta_crear', 'producto' => 'creditos_700', 'bono_pct' => '20', 'inicio' => '', 'fin' => $fin], '/control/?t=productos');
check('Crear oferta +20 % hasta mañana -> tabla ofertas y auditoría oferta_crear', [true, ['producto' => 'creditos_700', 'bono_pct' => 20, 'activa' => 1], 1],
    [str_starts_with($r, 'ok:'), $fila('SELECT producto, bono_pct, activa FROM ofertas ORDER BY id DESC LIMIT 1'), $aud('oferta_crear')]);
$tt = $tienda();
check('La tienda del juego (/api/estado) ya muestra $3,49 (base de Catalogo $4,99/700) y 750 + 20 % = 900 créditos', [3.49, 4.99, 700, 900, 20], [(float) ($tt['creditos_700']['precio'] ?? 0), (float) ($tt['creditos_700']['precio_base'] ?? 0), (int) ($tt['creditos_700']['creditos_base'] ?? 0), (int) ($tt['creditos_700']['creditos'] ?? 0), (int) ($tt['creditos_700']['oferta']['bono_pct'] ?? 0)]);
check('Precio fuera de rango, créditos vacíos, oferta sin fin o vencida -> error', [true, true, true, true], [
    str_starts_with($c->accion(['accion' => 'producto_guardar', 'producto' => 'creditos_250', 'precio' => '0,10', 'creditos' => '250'], '/control/?t=productos'), 'error:'),
    str_starts_with($c->accion(['accion' => 'producto_guardar', 'producto' => 'creditos_250', 'precio' => '1.99', 'creditos' => ''], '/control/?t=productos'), 'error:'),
    str_starts_with($c->accion(['accion' => 'oferta_crear', 'producto' => 'creditos_250', 'bono_pct' => '10', 'fin' => ''], '/control/?t=productos'), 'error:'),
    str_starts_with($c->accion(['accion' => 'oferta_crear', 'producto' => 'creditos_250', 'bono_pct' => '10', 'fin' => date('Y-m-d\TH:i', time() - 3600)], '/control/?t=productos'), 'error:')]);
check('Oferta para un producto sin créditos (vip30) -> error', true, str_starts_with($c->accion(['accion' => 'oferta_crear', 'producto' => 'vip30', 'bono_pct' => '10', 'fin' => $fin], '/control/?t=productos'), 'error:'));
check('Apagar creditos_250 -> desaparece de la tienda del juego', [true, false], [str_starts_with($c->accion(['accion' => 'producto_guardar', 'producto' => 'creditos_250', 'precio' => '1.99', 'creditos' => '250'], '/control/?t=productos'), 'ok:'), isset($tienda()['creditos_250'])]);
check('Producto que no existe -> error', true, str_starts_with($c->accion(['accion' => 'producto_guardar', 'producto' => 'nada', 'precio' => '1', 'creditos' => '1'], '/control/?t=productos'), 'error:'));
$oid = (int) $val('SELECT id FROM ofertas ORDER BY id DESC LIMIT 1');
check('Terminar la oferta -> la tienda vuelve a 750', [true, 0, 750, 1], [str_starts_with($c->accion(['accion' => 'oferta_terminar', 'oferta_id' => $oid], '/control/?t=productos'), 'ok:'), (int) $val('SELECT activa FROM ofertas WHERE id = ?', [$oid]), (int) ($tienda()['creditos_700']['creditos'] ?? 0), $aud('oferta_terminar')]);
check('Restaurar creditos_250 y creditos_700 a Catalogo.php', [true, true, 0, true, 2], [str_starts_with($c->accion(['accion' => 'producto_restaurar', 'producto' => 'creditos_250'], '/control/?t=productos'), 'ok:'),
    str_starts_with($c->accion(['accion' => 'producto_restaurar', 'producto' => 'creditos_700'], '/control/?t=productos'), 'ok:'), (int) $val('SELECT COUNT(*) FROM productos_ajustes'), isset($tienda()['creditos_250']), $aud('producto_restaurar')]);

// ------------------------------------------------------------------------------------------------ chat
titulo('Chat y reportes');
check('Ocultar el mensaje reportado: oculto y reportes resueltos', [true, 1, 0, 1], [str_starts_with($c->accion(['accion' => 'chat_ocultar', 'mensaje_id' => 1], '/control/?t=chat'), 'ok:'),
    (int) $val('SELECT oculto FROM chat_mensajes WHERE id = 1'), (int) $val("SELECT COUNT(*) FROM chat_reportes WHERE estado = 'pendiente'"), $aud('chat_ocultar')]);
check('Silenciar a Dani 1 h: sanción de ~3600 s y aviso en su canal del sistema', [true, 'silencio', true, 1, 1], [str_starts_with($c->accion(['accion' => 'chat_silenciar', 'jugador_id' => 4, 'duracion' => '1h', 'mensaje_id' => 1], '/control/?t=chat'), 'ok:'),
    $val('SELECT tipo FROM chat_sanciones WHERE jugador_id = 4 ORDER BY id DESC LIMIT 1'), abs((int) $val('SELECT hasta FROM chat_sanciones WHERE jugador_id = 4 ORDER BY id DESC LIMIT 1') - time() - 3600) < 60,
    (int) $val("SELECT COUNT(*) FROM chat_mensajes WHERE canal = 'sistema:4'"), $aud('chat_silenciar')]);
check('Duración no válida -> error', true, str_starts_with($c->accion(['accion' => 'chat_silenciar', 'jugador_id' => 4, 'duracion' => '2h'], '/control/?t=chat'), 'error:'));
check('Silenciar 24 h y 7 días también', [true, true], [str_starts_with($c->accion(['accion' => 'chat_silenciar', 'jugador_id' => 4, 'duracion' => '24h'], '/control/?t=chat'), 'ok:'), str_starts_with($c->accion(['accion' => 'chat_silenciar', 'jugador_id' => 4, 'duracion' => '7d'], '/control/?t=chat'), 'ok:')]);
check('Expulsar del chat: sanción sin fin', [true, 'expulsion', null, 1], [str_starts_with($c->accion(['accion' => 'chat_expulsar', 'jugador_id' => 4], '/control/?t=chat'), 'ok:'),
    $val('SELECT tipo FROM chat_sanciones WHERE jugador_id = 4 ORDER BY id DESC LIMIT 1'), $fila('SELECT hasta FROM chat_sanciones WHERE jugador_id = 4 ORDER BY id DESC LIMIT 1')['hasta'], $aud('chat_expulsar')]);
check('Levantar las sanciones del chat', [true, 0, 1], [str_starts_with($c->accion(['accion' => 'chat_levantar', 'jugador_id' => 4], '/control/?t=chat'), 'ok:'), (int) $val('SELECT COUNT(*) FROM chat_sanciones WHERE jugador_id = 4 AND levantada = 0'), $aud('chat_levantar')]);
check('Mostrar otra vez el mensaje', [true, 0, 1], [str_starts_with($c->accion(['accion' => 'chat_mostrar', 'mensaje_id' => 1], '/control/?t=chat'), 'ok:'), (int) $val('SELECT oculto FROM chat_mensajes WHERE id = 1'), $aud('chat_mostrar')]);
check('Agregar y quitar una palabra prohibida (sin tildes, minúsculas)', [true, 1, true, 0, 1, 1], [str_starts_with($c->accion(['accion' => 'palabra_agregar', 'palabra' => 'Tontísimo'], '/control/?t=chat'), 'ok:'),
    (int) $val("SELECT COUNT(*) FROM chat_palabras WHERE palabra = 'tontisimo'"), str_starts_with($c->accion(['accion' => 'palabra_quitar', 'palabra' => 'tontisimo'], '/control/?t=chat'), 'ok:'),
    (int) $val("SELECT COUNT(*) FROM chat_palabras WHERE palabra = 'tontisimo'"), $aud('palabra_agregar'), $aud('palabra_quitar')]);
check('Mensaje que no existe -> error', true, str_starts_with($c->accion(['accion' => 'chat_ocultar', 'mensaje_id' => 999], '/control/?t=chat'), 'error:'));

// ------------------------------------------------------------------------------------------------ soporte
titulo('Soporte (Soporte::responderSoporte / cambiarEstado)');
$r = $c->accion(['accion' => 'soporte_responder', 'caso_id' => 1, 'mensaje' => "Hola {nombre}.\nYa revisamos tu caso {caso}."], '/control/?t=soporte&caso=1');
check('Responder: plantilla aplicada, caso "respondido", auditoría soporte_respuesta', [true, ['autor' => 'soporte', 'texto' => "Hola Ana Pagadora.\nYa revisamos tu caso 1.", 'leido' => 0], 'respondido', 1],
    [str_starts_with($r, 'ok:'), $fila('SELECT autor, texto, leido FROM soporte_mensajes WHERE caso_id = 1 ORDER BY id DESC LIMIT 1'), $val('SELECT estado FROM soporte_casos WHERE id = 1'), $aud('soporte_respuesta')]);
check('Respuesta vacía -> error', true, str_starts_with($c->accion(['accion' => 'soporte_responder', 'caso_id' => 1, 'mensaje' => '  '], '/control/?t=soporte&caso=1'), 'error:'));
check('Cerrar, cerrar otra vez (error) y reabrir', ['cerrado', true, 'abierto'], [(function () use ($c, $val) { $c->accion(['accion' => 'soporte_cerrar', 'caso_id' => 1], '/control/?t=soporte&caso=1'); return $val('SELECT estado FROM soporte_casos WHERE id = 1'); })(),
    str_starts_with($c->accion(['accion' => 'soporte_cerrar', 'caso_id' => 1], '/control/?t=soporte&caso=1'), 'error:'),
    (function () use ($c, $val) { $c->accion(['accion' => 'soporte_reabrir', 'caso_id' => 1], '/control/?t=soporte&caso=1'); return $val('SELECT estado FROM soporte_casos WHERE id = 1'); })()]);
check('Responder y cerrar a la vez', 'cerrado', (function () use ($c, $val) { $c->accion(['accion' => 'soporte_responder', 'caso_id' => 1, 'mensaje' => 'Listo', 'cerrar' => '1'], '/control/?t=soporte&caso=1'); return $val('SELECT estado FROM soporte_casos WHERE id = 1'); })());
$nR = (int) $val('SELECT COUNT(*) FROM soporte_respuestas');
check('Respuestas rápidas: crear, editar y borrar (auditadas)', [true, $nR + 1, true, true, $nR, 1, 1, 1], (function () use ($c, $val, $aud) {
    $a = str_starts_with($c->accion(['accion' => 'rapida_guardar', 'titulo' => 'Prueba', 'texto' => 'Hola {nombre}'], '/control/?t=soporte'), 'ok:');
    $n = (int) $val('SELECT COUNT(*) FROM soporte_respuestas');
    $id = (int) $val("SELECT id FROM soporte_respuestas WHERE titulo = 'Prueba'");
    $b = str_starts_with($c->accion(['accion' => 'rapida_guardar', 'rapida_id' => $id, 'titulo' => 'Prueba 2', 'texto' => 'Hola'], '/control/?t=soporte'), 'ok:');
    $d = str_starts_with($c->accion(['accion' => 'rapida_borrar', 'rapida_id' => $id], '/control/?t=soporte'), 'ok:');
    return [$a, $n, $b, $d, (int) $val('SELECT COUNT(*) FROM soporte_respuestas'), $aud('soporte_rapida_crear'), $aud('soporte_rapida_editar'), $aud('soporte_rapida_borrar')];
})());

// ------------------------------------------------------------------------------------------------ ajustes
titulo('Ajustes (tabla ajustes, la que lee /api/estado)');
check('Encender mantenimiento con mensaje', [true, '1', 'Volvemos a las 10', 1], [str_starts_with($c->accion(['accion' => 'ajustes_mantenimiento', 'mantenimiento' => '1', 'mensaje' => 'Volvemos a las 10'], '/control/?t=ajustes'), 'ok:'),
    $val("SELECT valor FROM ajustes WHERE clave = 'mantenimiento'"), $val("SELECT valor FROM ajustes WHERE clave = 'mantenimiento_mensaje'"), $aud('mantenimiento')]);
$hasta = date('Y-m-d\TH:i', time() + 2 * 86400);
check('Publicar anuncio con fecha de fin', [true, 'Nuevo evento: Copa Planeta', 'evento', true], [str_starts_with($c->accion(['accion' => 'ajustes_anuncio', 'texto' => 'Nuevo evento: Copa Planeta', 'tipo' => 'evento', 'hasta' => $hasta], '/control/?t=ajustes'), 'ok:'),
    $val("SELECT valor FROM ajustes WHERE clave = 'anuncio_texto'"), $val("SELECT valor FROM ajustes WHERE clave = 'anuncio_tipo'"), abs((int) $val("SELECT valor FROM ajustes WHERE clave = 'anuncio_hasta'") - strtotime($hasta)) < 2]);
$est = $estadoApi();
check('/api/estado del juego muestra el mantenimiento y el anuncio', [true, 'Volvemos a las 10', 'Nuevo evento: Copa Planeta', 'evento'], [$est['mantenimiento']['activo'] ?? null, $est['mantenimiento']['mensaje'] ?? null, $est['anuncio']['texto'] ?? null, $est['anuncio']['tipo'] ?? null]);
check('Anuncio con fecha ya pasada -> error', true, str_starts_with($c->accion(['accion' => 'ajustes_anuncio', 'texto' => 'x', 'tipo' => 'info', 'hasta' => date('Y-m-d\TH:i', time() - 7200)], '/control/?t=ajustes'), 'error:'));
check('Apagar mantenimiento y quitar el anuncio', [false, null], (function () use ($c, $estadoApi) {
    $c->accion(['accion' => 'ajustes_mantenimiento', 'mensaje' => ''], '/control/?t=ajustes');
    $c->accion(['accion' => 'ajustes_anuncio', 'texto' => '', 'tipo' => 'info', 'hasta' => ''], '/control/?t=ajustes');
    $e = $estadoApi();
    return [$e['mantenimiento']['activo'] ?? null, array_key_exists('anuncio', $e) ? $e['anuncio'] : 'falta'];
})());
check('Reglas contra el abuso de reembolsos (ajustes abuso_*), con validación y auditoría', [true, '3', '90', '0', true, 1], [
    str_starts_with($c->accion(['accion' => 'ajustes_abuso', 'reembolsos' => '3', 'dias' => '90'], '/control/?t=ajustes'), 'ok:'), $val("SELECT valor FROM ajustes WHERE clave = 'abuso_reembolsos'"),
    $val("SELECT valor FROM ajustes WHERE clave = 'abuso_dias'"), $val("SELECT valor FROM ajustes WHERE clave = 'abuso_contracargo_banea'"),
    str_starts_with($c->accion(['accion' => 'ajustes_abuso', 'reembolsos' => '0', 'dias' => '90'], '/control/?t=ajustes'), 'error:'), $aud('abuso_reglas')]);
check('Google Play sin configurar: "Revisar anuladas" responde con error claro', true, str_contains($c->accion(['accion' => 'ajustes_google'], '/control/?t=ajustes'), 'no está configurado'));
$c->get('/control/?t=ajustes&accion_aud=compra_reembolso');
check('La auditoría se ve y se filtra por acción', [true, true, false], [$c->tiene('id="tabla-auditoria"'), $c->tiene('Pidió devolución'), $c->tiene('Contracargo del banco')]);
check('Acción desconocida -> error sin romper', true, str_starts_with($c->accion(['accion' => 'borrar_todo']), 'error:'));

titulo('Toda acción de cambio dejó su fila en auditoria');
$acciones = ['control_entrar', 'control_entrar_fallido', 'control_csrf_rechazado', 'creditos_dar', 'creditos_quitar', 'cuenta_suspendido', 'cuenta_activo', 'cuenta_baneado', 'sesiones_cerrar',
    'transferencia_cancelada', 'compra_reembolso', 'compra_contracargo', 'control_csv_compras', 'producto_editar', 'producto_restaurar', 'oferta_crear', 'oferta_terminar',
    'mercado_congelar', 'mercado_descongelar', 'mercado_quitar', 'chat_ocultar', 'chat_mostrar', 'chat_resolver', 'chat_silenciar', 'chat_expulsar', 'chat_levantar', 'palabra_agregar', 'palabra_quitar',
    'soporte_respuesta', 'soporte_cerrar', 'soporte_reabrir', 'soporte_rapida_crear', 'soporte_rapida_editar', 'soporte_rapida_borrar', 'mantenimiento', 'anuncio', 'abuso_reglas'];
check('Auditoría: hay filas de las ' . count($acciones) . ' acciones', [], array_values(array_filter($acciones, fn($a) => $aud($a) === 0)));
check('Auditoría: todo lo del panel con quien = control:<usuario> (o control:? en entradas fallidas) e IP', 0,
    (int) $val("SELECT COUNT(*) FROM auditoria WHERE quien LIKE 'control:%' AND (ip IS NULL OR ip = '')") + (int) $val("SELECT COUNT(*) FROM auditoria WHERE accion LIKE 'control_%' AND quien NOT LIKE 'control:%'"));

// ------------------------------------------------------------------------------------------------ salir y sesión
titulo('Salir y vencimiento de la sesión');
$c->get('/control/');
$nSes = (int) $val('SELECT COUNT(*) FROM control_sesiones');
$c->post(['accion' => 'salir', 'csrf' => $c->csrf(), 'volver' => '/control/']);
check('Salir -> 303, la galleta se borra, la sesión desaparece de la base, auditoría control_salir', [303, true, $nSes - 1, 1],
    [$c->http, str_contains(implode("\n", $c->galletas), 'envivo_control=deleted'), (int) $val('SELECT COUNT(*) FROM control_sesiones'), $aud('control_salir')]);
check('Después de salir ya no hay pestañas', [200, false], [$c->get('/control/?t=resumen'), $c->tiene('class="pestanas"')]);
$x->get('/control/');
$exec('UPDATE control_sesiones SET ultimo = ?', [time() - 3 * 3600]);
check('Sesión sin uso por más de 2 horas -> vuelve a pedir entrar', [200, false], [$x->get('/control/?t=resumen'), $x->tiene('class="pestanas"')]);
$x->entrar($USUARIO, $CLAVE);
$exec("UPDATE control_sesiones SET huella = 'otra'");
check('Si cambia la clave del panel (huella distinta) las sesiones abiertas mueren', false, ($x->get('/control/') && $x->tiene('class="pestanas"')));

// ------------------------------------------------------------------------------------------------ navegador
titulo('Navegador de verdad (Playwright + Chromium, celular 390x844)');
$NP = getenv('NODE_PATH') ?: '/opt/npm-tools/node_modules';
if (is_dir($NP . '/playwright')) {
    $limpiarIntentos();
    $sal = trim((string) shell_exec('NODE_PATH=' . escapeshellarg($NP) . ' node ' . escapeshellarg(__DIR__ . '/navegador_control.cjs') . ' ' . escapeshellarg($B) . ' ' . escapeshellarg($USUARIO) . ' ' . escapeshellarg($CLAVE) . ' ' . escapeshellarg($CAPTURAS) . ' 3 3 1 2>&1'));
    $ult = json_decode((string) substr($sal, (int) strrpos($sal, "\n{") ?: 0), true) ?? json_decode($sal, true) ?? ['crudo' => $sal];
    echo '  ' . json_encode($ult, JSON_UNESCAPED_UNICODE) . "\n";
    foreach (($ult['paginas'] ?? []) as $n => $pg) check("Navegador: $n sin desplazamiento horizontal (HTTP 200)", [200, 0], [$pg['http'], $pg['desborde']]);
    check('Navegador: entrar, detalle del gráfico al tocar, acción con confirmación y salir', ['entro' => true, 'tip' => true, 'accion_ok' => true, 'salio' => true], $ult['pasos'] ?? null);
    check('Navegador: sin errores de consola ni de la página (CSP incluida)', [], $ult['errores'] ?? ['sin respuesta']);
    echo "  Capturas en $CAPTURAS\n";
} else {
    echo "  (no hay Playwright en $NP: se salta)\n";
}

titulo('Registro de PHP');
$log = @file_get_contents("$TMP/php_errores.log") ?: '';
foreach (glob("$TMP/srv_*.log") as $f) $log .= (string) file_get_contents($f);
$malos = array_values(array_filter(preg_split('/\n/', $log), fn($l) => preg_match('/fatal|warning|deprecated|notice|EN VIVO control/i', $l)));
check('Sin errores ni avisos de PHP', [], array_slice($malos, 0, 5));

echo "\n----------------------------------------\npruebas_control.php: $ok correctas, $fallas fallas\n";
exit($fallas === 0 ? 0 : 1);
