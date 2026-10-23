<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Errores del juego (server/INTEGRAR_ERRORES.md) por HTTP contra "php -S" +
// server/tests/router_control.php, con una base SQLite TEMPORAL:
//   A) POST /api/error: sin X-Envivo (sendBeacon, text/plain), origen de otro sitio, JSON malo, tamaños, lotes, limpieza
//      de datos personales, agrupación por huella, jugador de la sesión, reapertura por versión y límite por IP.
//   B) server/bin/errores.php: borra lo de más de 30 días (y --resumen no borra nada).
//   C) Centro de Control > Errores: lista 24 h / 7 días, detalle (pila, versiones, plataformas), marcar resuelto / reabrir
//      con CSRF y auditoría, insignia y aviso en el Resumen cuando un error nuevo pasa el umbral.
// Uso:  php server/tests/pruebas_errores.php      (GUARDAR_TMP=1 deja los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
putenv('TZ=America/Guayaquil');
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$SRV = $RAIZ . '/server';
$TMP = sys_get_temp_dir() . '/envivo_errores_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
function puerto_libre(int $desde): int {
    for ($p = $desde; $p < $desde + 3000; $p++) { $s = @stream_socket_server('tcp://127.0.0.1:' . $p); if ($s !== false) { fclose($s); return $p; } }
    throw new RuntimeException('No hay puertos libres');
}
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre(18791);
$BASE = "http://127.0.0.1:$P";
$USUARIO = 'jefe_errores';
$CLAVE = 'Err-' . bin2hex(random_bytes(5));
$QUIEN = 'control:' . $USUARIO;
$DB = "$TMP/datos/envivo.sqlite";
file_put_contents("$TMP/config.env", "; SOLO PRUEBAS\nENVIVO_DB=$DB\nENVIVO_URL=$BASE\nENVIVO_ZONA=America/Guayaquil\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=" . password_hash($CLAVE, PASSWORD_BCRYPT) . "\nERRORES_ALERTA=5\n");

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }

$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) proc_terminate($p);
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});

titulo('Base temporal y servidor');
exec('ENVIVO_CONFIG=' . escapeshellarg("$TMP/config.env") . ' php ' . escapeshellarg("$SRV/bin/migrar.php") . ' 2>&1', $out, $rc);
check('Migraciones (con src/migraciones/errores.sql)', 0, $rc);
$pdo = new PDO("sqlite:$DB", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec('PRAGMA busy_timeout = 10000');
$val = function (string $sql, array $a = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($a); return $s->fetchColumn(); };
$fila = function (string $sql, array $a = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($a); return $s->fetch() ?: []; };
$x = function (string $sql, array $a = []) use ($pdo) { $pdo->prepare($sql)->execute($a); };
check('Tablas errores_grupos y errores_cliente', 2, (int) $val("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('errores_grupos', 'errores_cliente')"));
exec('ENVIVO_CONFIG=' . escapeshellarg("$TMP/config.env") . ' php ' . escapeshellarg("$SRV/bin/migrar.php") . ' 2>&1', $out, $rc);
check('Migraciones otra vez: sin error', 0, $rc);

$cmd = ['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $RAIZ . '/server/tests/router_control.php'];
$PIDS[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/srv.log", 'a'], 2 => ['file', "$TMP/srv.log", 'a']], $pipes, $RAIZ, array_merge(getenv(), ['ENVIVO_CONFIG' => "$TMP/config.env", 'PHP_CLI_SERVER_WORKERS' => '2']));
$arranco = false;
for ($i = 0; $i < 80 && !$arranco; $i++) { if (@fsockopen('127.0.0.1', $P)) $arranco = true; else usleep(100000); }
si('Arranca el servidor de prueba', $arranco);

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_errores_' . $n . '_' . getmypid(); @unlink($this->jar); }
    public function __destruct() { @unlink($this->jar); }
    public function pedir(string $m, string $ruta, ?string $cuerpo = null, array $cab = []): int {
        $ch = curl_init($this->base . $ruta);
        $this->cab = [];
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 60,
            CURLOPT_HEADERFUNCTION => function ($c, $h) { $p = explode(':', $h, 2); if (count($p) === 2) $this->cab[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); }]);
        if ($cuerpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $cuerpo);
        $this->cuerpo = (string) curl_exec($ch);
        $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lugar = (string) ($this->cab['location'] ?? '');
        return $this->http;
    }
    public function json(): array { $j = json_decode($this->cuerpo, true); return is_array($j) ? $j : []; }
    /** Como sendBeacon: text/plain, sin X-Envivo, Sec-Fetch-Site: same-origin y el Origin del juego. */
    public function error(array $cuerpo, array $cab = []): int {
        $cabs = [];
        foreach (array_merge(['Content-Type: text/plain;charset=UTF-8', 'Origin: ' . $this->base, 'Sec-Fetch-Site: same-origin',
            'User-Agent: Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'], $cab) as $h) $cabs[strtolower(strtok($h, ':'))] = $h;
        return $this->pedir('POST', '/api/error', json_encode($cuerpo, JSON_UNESCAPED_UNICODE), array_values($cabs));
    }
    public function get(string $r): int { return $this->pedir('GET', $r); }
    public function post(array $d, array $cab = []): int { return $this->pedir('POST', '/control/', http_build_query($d), $cab); }
    public function tiene(string $t): bool { return str_contains($this->cuerpo, $t); }
    public function csrf(): string { return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $this->cuerpo, $m) ? $m[1] : ''; }
    public function entrar(string $u, string $c): int { $this->get('/control/'); return $this->post(['accion' => 'entrar', 'csrf' => $this->csrf(), 'usuario' => $u, 'clave' => $c]); }
    public function accion(array $d, string $desde): string {
        $this->get($desde);
        $d += ['csrf' => $this->csrf(), 'volver' => $desde];
        $this->post($d);
        if ($this->http !== 303) return 'HTTP ' . $this->http;
        $this->get($this->lugar);
        return preg_match('/<div class="aviso aviso-(ok|error)" id="aviso"[^>]*>(.*?)<\/div>/s', $this->cuerpo, $m) ? $m[1] . ': ' . html_entity_decode($m[2], ENT_QUOTES) : 'sin aviso';
    }
}
$e = fn(string $msg, array $mas = []) => $mas + ['mensaje' => $msg, 'pila' => "TypeError: $msg\n    at f ($GLOBALS[BASE]/js/ui.js?v=3:120:7)", 'archivo' => "$GLOBALS[BASE]/js/ui.js", 'linea' => 120, 'columna' => 7,
    'url' => "$GLOBALS[BASE]/index.html", 'version' => 'envivo-v16', 'idioma' => 'es', 'plataforma' => 'web', 'tipo' => 'error'];
$limpiarLimites = fn() => $pdo->exec("DELETE FROM intentos WHERE clave LIKE 'errores:%'");

// ------------------------------------------------------------------------------------------------ A: API
titulo('A) POST /api/error');
$c = new Cli($BASE, 'api');
check('GET /api/error -> 405', 405, $c->get('/api/error'));
check('POST sin X-Envivo (como sendBeacon, text/plain) -> 200 y guarda 1', [200, true, 1], [$c->error(['errores' => [$e("Cannot read properties of undefined (reading 'x')")]]), $c->json()['ok'] ?? null, $c->json()['guardados'] ?? null]);
check('…queda 1 grupo con total 1 y 1 ocurrencia', [1, 1, 1], [(int) $val('SELECT COUNT(*) FROM errores_grupos'), (int) $val('SELECT total FROM errores_grupos'), (int) $val('SELECT COUNT(*) FROM errores_cliente')]);
$o = $fila('SELECT * FROM errores_cliente ORDER BY id DESC LIMIT 1');
check('…archivo como ruta del sitio, url sin dominio, navegador corto, sin jugador, IP solo como huella de 16', ['/js/ui.js', '/index.html', 'Chrome 129 · Android', null, 16, false],
    [$o['archivo'], $o['url'], $o['navegador'], $o['jugador_id'], strlen((string) $o['ip_huella']), str_contains(json_encode($o), '127.0.0.1')]);
check('…la pila sin "?v=3" (parámetros fuera)', [false, true], [str_contains($o['pila'], '?v=3'), str_contains($o['pila'], '/js/ui.js:120:7')]);
check('Un solo error sin la lista (objeto suelto) también vale', [200, 1], [$c->error($e('Error suelto')), $c->json()['guardados'] ?? null]);
check('Origin de otro sitio -> 403 (no guarda)', [403, 2], [$c->error(['errores' => [$e('desde otro sitio')]], ['Origin: https://malo.example', 'Sec-Fetch-Site: cross-site']), (int) $val('SELECT COUNT(*) FROM errores_cliente')]);
check('Sec-Fetch-Site: cross-site sin Origin -> 403', 403, $c->pedir('POST', '/api/error', json_encode(['errores' => [$e('x')]]), ['Content-Type: text/plain', 'Sec-Fetch-Site: cross-site']));
check('Origin con el mismo host pero otro puerto -> 403', 403, $c->error(['errores' => [$e('x')]], ['Origin: http://127.0.0.1:1']));
check('Con fetch (application/json + X-Envivo) también vale', 200, $c->pedir('POST', '/api/error', json_encode(['errores' => [$e('Con fetch')]]), ['Content-Type: application/json', 'X-Envivo: 1']));
check('JSON malo -> 400 datos_invalidos', [400, 'datos_invalidos'], [$c->pedir('POST', '/api/error', '{malo', ['Content-Type: text/plain']), $c->json()['codigo'] ?? null]);
check('Sin errores -> 400', 400, $c->error(['errores' => []]));
check('Errores sin mensaje (o que no son objetos) -> 200 con 0 guardados y 1 descartado', [200, 0, 1], [$c->error(['errores' => [['pila' => 'x'], 'texto']]), $c->json()['guardados'] ?? null, $c->json()['descartados'] ?? null]);
check('Más de 32 KB -> 413', 413, $c->pedir('POST', '/api/error', json_encode(['errores' => [$e(str_repeat('a', 40000))]]), ['Content-Type: text/plain']));
$n0 = (int) $val('SELECT COUNT(*) FROM errores_cliente');
$lote = array_map(fn($i) => $e("Lote $i", ['linea' => 500 + $i]), range(1, 13));
check('Lote de 13 -> se guardan 10 (máximo por lote), 3 descartados', [200, 10, 3, 10], [$c->error(['errores' => $lote]), $c->json()['guardados'] ?? null, $c->json()['descartados'] ?? null, (int) $val('SELECT COUNT(*) FROM errores_cliente') - $n0]);
$limpiarLimites();

titulo('A) Datos personales fuera y recortes');
$c->error(['errores' => [$e('Falló para ana.perez@correo.example con tarjeta 4111 1111 1111 1111 token=abc123', [
    'pila' => str_repeat('x', 5000), 'url' => "$BASE/index.html?origen=android&email=ana@correo.example&fecha=2026-11-10#x", 'contexto' => 'mercado.publicar <b>ana@correo.example</b>',
    'ultimo_paso' => ['button[act=close]', 'nav[tab=online] <img src=x onerror=alert(1)>', 'a#enlace'], 'plataforma' => 'raro', 'tipo' => 'manual',
    'memoria' => 'equipo 4 GB, js 30/2048 MB', 'conexion' => '4g, 10 Mbps', 'idioma' => 'pt-BR<script>', 'version' => 'envivo-v16"><b>', 'linea' => 'abc', 'columna' => -5])]]);
$o = $fila('SELECT * FROM errores_cliente ORDER BY id DESC LIMIT 1');
check('Mensaje sin correo, sin número de tarjeta ni token', ['Falló para [correo] con tarjeta [número] token=[oculto]', false], [$o['mensaje'], str_contains(json_encode($o), 'ana')]);
check('Url: solo la ruta + ?origen=android (sin correo ni fecha)', '/index.html?origen=android', $o['url']);
check('Pila recortada a 2048', 2048, mb_strlen($o['pila']));
check('Últimos pasos sin HTML', ['button[act=close] > nav[tab=online] img src=x onerror=alert1 > a#enlace', false], [$o['ultimo_paso'], str_contains($o['ultimo_paso'], '<')]);
$c->error(['errores' => [$e('Muchos pasos', ['linea' => 8, 'ultimo_paso' => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']])]]);
check('Últimos pasos: solo los 6 últimos', 'p3 > p4 > p5 > p6 > p7 > p8', (string) $val("SELECT ultimo_paso FROM errores_cliente WHERE mensaje = 'Muchos pasos'"));
check('Contexto sin correo; plataforma rara -> web; idioma/versión limpios; línea mala -> 0', ['mercado.publicar <b>[correo]</b>', 'web', 'pt-BRscript', 'envivo-v16b', 0, 0, 'manual'],
    [$o['contexto'], $o['plataforma'], $o['idioma'], $o['version'], (int) $o['linea'], (int) $o['columna'], $o['tipo']]);
check('Memoria y conexión', ['equipo 4 GB, js 30/2048 MB', '4g, 10 Mbps'], [$o['memoria'], $o['conexion']]);

titulo('A) Agrupación por huella');
$g0 = (int) $val('SELECT COUNT(*) FROM errores_grupos');
$c->error(['errores' => [$e('Índice 12 fuera de rango'), $e('Índice 7 fuera de rango'), $e('Índice 7 fuera de rango', ['linea' => 121])]]);
check('Mismo mensaje con otros números, mismo archivo y línea -> mismo grupo (total 2); otra línea -> otro grupo', [2, 2, 1],
    [(int) $val('SELECT COUNT(*) FROM errores_grupos') - $g0, (int) $val("SELECT total FROM errores_grupos WHERE mensaje = 'Índice 12 fuera de rango'"), (int) $val("SELECT total FROM errores_grupos WHERE linea = 121")]);
$c->error(['errores' => array_fill(0, 5, $e('Repetido en un lote', ['linea' => 9]))]);
check('El mismo error 5 veces en UN lote -> máximo 3', 3, (int) $val("SELECT total FROM errores_grupos WHERE mensaje = 'Repetido en un lote'"));
$gid = (int) $val("SELECT id FROM errores_grupos WHERE mensaje = 'Índice 12 fuera de rango'");
check('El grupo guarda primera y última vez', true, (int) $val('SELECT primero FROM errores_grupos WHERE id = ?', [$gid]) <= (int) $val('SELECT ultimo FROM errores_grupos WHERE id = ?', [$gid]));

titulo('A) Jugador de la sesión');
$cj = new Cli($BASE, 'jugador');
check('Registro de un jugador', 200, $cj->pedir('POST', '/api/registro', json_encode(['email' => 'errores@prueba.example', 'nombre' => 'Errores', 'clave' => 'ClaveErrores1']), ['Content-Type: application/json', 'X-Envivo: 1']));
$jid = (int) $val("SELECT id FROM jugadores WHERE email = 'errores@prueba.example'");
$cj->error(['errores' => [$e('Con sesión', ['linea' => 77])]]);
check('Con sesión: se anota el jugador', $jid, (int) $val("SELECT jugador_id FROM errores_cliente WHERE mensaje = 'Con sesión'"));
$limpiarLimites();

titulo('A) Resuelto y reabierto por versión');
$c->error(['errores' => [$e('Se arregla en v17', ['linea' => 33, 'version' => 'envivo-v9']), $e('Se arregla en v17', ['linea' => 33, 'version' => 'envivo-v16'])]]);
$gr = (int) $val("SELECT id FROM errores_grupos WHERE mensaje = 'Se arregla en v17'");
$x("UPDATE errores_grupos SET resuelto = ?, resuelto_por = 'prueba', version_resuelto = 'envivo-v16' WHERE id = ?", [time(), $gr]);
$c->error(['errores' => [$e('Se arregla en v17', ['linea' => 33, 'version' => 'envivo-v16'])]]);
check('Vuelve a pasar en la MISMA versión (celular viejo) -> sigue resuelto', [true, 3], [$val('SELECT resuelto FROM errores_grupos WHERE id = ?', [$gr]) !== null, (int) $val('SELECT total FROM errores_grupos WHERE id = ?', [$gr])]);
$c->error(['errores' => [$e('Se arregla en v17', ['linea' => 33, 'version' => 'envivo-v17'])]]);
check('Pasa en una versión MÁS NUEVA (v17 > v16, orden natural) -> reabierto', [null, true], [$val('SELECT resuelto FROM errores_grupos WHERE id = ?', [$gr]) ?: null, $val('SELECT reabierto FROM errores_grupos WHERE id = ?', [$gr]) !== null]);
$limpiarLimites();

titulo('A) Límite por IP (30 por hora)');
$antes = (int) $val('SELECT COUNT(*) FROM errores_cliente');
$res = [];
for ($i = 0; $i < 4; $i++) { $c->error(['errores' => array_map(fn($k) => $e("Límite $i-$k", ['linea' => 1000 + $i * 10 + $k]), range(1, 10))]); $res[] = $c->http . ':' . ($c->json()['guardados'] ?? '-'); }
check('4 lotes de 10: se guardan 30 y el resto no; el último lote -> 429 limite_intentos', [['200:10', '200:10', '200:10', '429:-'], 30, 'limite_intentos'], [$res, (int) $val('SELECT COUNT(*) FROM errores_cliente') - $antes, $c->json()['codigo'] ?? null]);
check('Pasado el límite, otro POST -> 429 sin leer nada', 429, $c->error(['errores' => [$e('uno más')]]));
$limpiarLimites();
check('Sin los contadores (pasó la hora) vuelve a aceptar', 200, $c->error(['errores' => [$e('después de la hora', ['linea' => 2000])]]));
$limpiarLimites();
si('Sin errores de PHP en el registro hasta aquí', !is_file("$TMP/php_errores.log") || !preg_match('/PHP (Fatal|Warning|Notice|Deprecated)/', (string) file_get_contents("$TMP/php_errores.log")));

// ------------------------------------------------------------------------------------------------ B: limpieza
titulo('B) Limpieza (server/bin/errores.php)');
$viejo = time() - 31 * 86400;
$x("INSERT INTO errores_grupos (huella, mensaje, archivo, linea, total, primero, ultimo) VALUES ('viejo1', 'Error viejo', '/js/logic.js', 5, 2, ?, ?)", [$viejo - 86400, $viejo]);
$gv = (int) $pdo->lastInsertId();
foreach ([$viejo - 86400, $viejo] as $t) $x("INSERT INTO errores_cliente (grupo_id, creado, mensaje) VALUES (?, ?, 'Error viejo')", [$gv, $t]);
$x("INSERT INTO errores_cliente (grupo_id, creado, mensaje) VALUES (?, ?, 'Índice 12 fuera de rango')", [$gid, $viejo]);   // una vieja de un grupo vivo
$total = (int) $val('SELECT COUNT(*) FROM errores_cliente');
exec('ENVIVO_CONFIG=' . escapeshellarg("$TMP/config.env") . ' php ' . escapeshellarg("$SRV/bin/errores.php") . ' --resumen 2>&1', $o1, $rc1);
check('--resumen: no borra nada', [0, $total], [$rc1, (int) $val('SELECT COUNT(*) FROM errores_cliente')]);
$o2 = []; exec('ENVIVO_CONFIG=' . escapeshellarg("$TMP/config.env") . ' php ' . escapeshellarg("$SRV/bin/errores.php") . ' 2>&1', $o2, $rc2);
check('Limpieza: borra las 3 ocurrencias viejas y el grupo viejo; el grupo vivo se queda', [0, true, 0, 3, true],
    [$rc2, str_contains(implode("\n", $o2), 'borradas 3 ocurrencias y 1 grupos de más de 30 días'), (int) $val('SELECT COUNT(*) FROM errores_grupos WHERE id = ?', [$gv]), $total - (int) $val('SELECT COUNT(*) FROM errores_cliente'), (bool) $val('SELECT 1 FROM errores_grupos WHERE id = ?', [$gid])]);
exec('ENVIVO_CONFIG=' . escapeshellarg("$TMP/config.env") . ' php ' . escapeshellarg("$SRV/bin/errores.php") . ' --malo 2>&1', $o3, $rc3);
check('Opción desconocida -> sale con 2', 2, $rc3);

// ------------------------------------------------------------------------------------------------ C: panel
titulo('C) Centro de Control > Errores');
// Datos para el panel: un error nuevo frecuente (alerta), uno de hace 3 días (solo en 7 días) y uno con HTML en el mensaje
$c->error(['errores' => array_map(fn($k) => $e('Error nuevo frecuente', ['linea' => 3000, 'version' => 'envivo-v' . (15 + $k % 2), 'plataforma' => $k % 2 ? 'android' : 'web', 'idioma' => $k % 3 ? 'es' : 'en']), range(1, 3))]);
$c->error(['errores' => array_map(fn($k) => $e('Error nuevo frecuente', ['linea' => 3000, 'version' => 'envivo-v16', 'plataforma' => 'android']), range(1, 3))]);
$c->error(['errores' => [$e('<script>alert(1)</script> en el mensaje', ['linea' => 4000]), $e('<script>alert(1)</script> en el mensaje', ['linea' => 4000])]]);
$x("INSERT INTO errores_grupos (huella, mensaje, archivo, linea, total, primero, ultimo) VALUES ('hace3', 'Error de hace 3 días', '/js/chat.js', 8, 1, ?, ?)", [time() - 3 * 86400, time() - 3 * 86400]);
$g3 = (int) $pdo->lastInsertId();
for ($i = 0; $i < 8; $i++) $x("INSERT INTO errores_cliente (grupo_id, creado, mensaje, version, plataforma) VALUES (?, ?, 'Error de hace 3 días', 'envivo-v15', 'web')", [$g3, time() - 3 * 86400 + $i]);   // 8 veces: entre los primeros de 7 días
$limpiarLimites();
$gf = (int) $val("SELECT id FROM errores_grupos WHERE mensaje = 'Error nuevo frecuente'");
check('El error frecuente tiene 6 (con el máximo de 3 por lote)', 6, (int) $val('SELECT total FROM errores_grupos WHERE id = ?', [$gf]));

$p = new Cli($BASE, 'panel');
check('Sin sesión ?t=errores muestra la entrada', [200, false, true], [$p->get('/control/?t=errores'), $p->tiene('id="tabla-errores"'), $p->tiene('id="form-entrar"')]);
check('Entrar -> 303', 303, $p->entrar($USUARIO, $CLAVE));
$p->get('/control/?t=errores');
check('Pestaña Errores: 200, activa y con insignia (1 nuevo sobre el umbral + 1 reabierto = 2)', [200, true, true], [$p->http, $p->tiene('data-pestana="errores"'),
    (bool) preg_match('#\?t=errores" class="activa" aria-current="page">Errores <span class="insignia">2</span>#', $p->cuerpo)]);
check('KPIs y aviso del error nuevo', [true, true, true, true], [$p->tiene('id="kpi-err-24"'), $p->tiene('id="kpi-err-abiertos"'), $p->tiene('id="alerta-errores"'), $p->tiene('«Error nuevo frecuente» (6 veces, /js/ui.js:3000)')]);
preg_match('#<table id="tabla-errores">.*?</table>#s', $p->cuerpo, $m);
$tabla = $m[0] ?? '';
check('Lista de 24 h: el más frecuente primero, con versiones y plataformas', [true, true, true], [(bool) preg_match('#<tbody><tr><td><b>6</b>.*?Error nuevo frecuente#s', $tabla),
    str_contains($tabla, 'envivo-v16, envivo-v15'), str_contains($tabla, 'App Android, Web') || str_contains($tabla, 'Web, App Android')]);
check('24 h: sin el de hace 3 días ni el borrado; el HTML del mensaje escapado', [false, false, true, false], [str_contains($tabla, 'Error de hace 3 días'), str_contains($tabla, 'Error viejo'),
    str_contains($tabla, '&lt;script&gt;alert(1)&lt;/script&gt;'), str_contains($p->cuerpo, '<script>alert(1)')]);
$p->get('/control/?t=errores&p=7d');
check('7 días: aparece el de hace 3 días (8 veces, segundo después del frecuente)', true, (bool) preg_match('#<tbody><tr><td><b>8</b>.*?Error de hace 3 días#s', $p->cuerpo));
$p->get('/control/?t=errores&id=' . $gf);
check('Detalle: pila, versiones, plataformas, idiomas, navegadores y últimas veces', [200, true, true, true, true, true, true], [$p->http, $p->tiene('id="pila-error"'), $p->tiene('id="tabla-err-versiones"'),
    $p->tiene('id="tabla-err-plataformas"'), $p->tiene('id="tabla-err-idiomas"'), $p->tiene('Chrome 129 · Android'), $p->tiene('id="tabla-err-ultimas"')]);
check('Detalle: versiones con sus veces (v16: 5, v15: 1) y plataforma App Android', [true, true, true],
    [(bool) preg_match('#id="tabla-err-versiones">.*?<td>envivo-v16</td><td>5</td>.*?<td>envivo-v15</td><td>1</td>#s', $p->cuerpo), (bool) preg_match('#id="tabla-err-plataformas">.*?App Android#s', $p->cuerpo), $p->tiene('id="btn-resolver"')]);
check('Todos los formularios POST llevan CSRF', true, (function () use ($p) {
    preg_match_all('/<form method="post"[^>]*>(.*?)<\/form>/s', $p->cuerpo, $m);
    return count($m[1]) >= 2 && count(array_filter($m[1], fn($f) => !preg_match('/name="csrf" value="[a-f0-9]{64}"/', $f))) === 0;
})());
$TAB = '/control/?t=errores&id=' . $gf;
$csrfMalo = (int) $val("SELECT COUNT(*) FROM auditoria WHERE accion = 'control_csrf_rechazado'");
check('Marcar resuelto sin CSRF -> 403 y sigue abierto', [403, null], [$p->post(['accion' => 'errores_resolver', 'grupo_id' => $gf]), $val('SELECT resuelto FROM errores_grupos WHERE id = ?', [$gf]) ?: null]);
$p->get($TAB);
check('Con CSRF bueno pero Origin de otro sitio -> 403', 403, $p->post(['accion' => 'errores_resolver', 'grupo_id' => $gf, 'csrf' => $p->csrf()], ['Origin: https://malo.example']));
check('…los 2 rechazos quedaron en la auditoría', 2, (int) $val("SELECT COUNT(*) FROM auditoria WHERE accion = 'control_csrf_rechazado'") - $csrfMalo);
$r = $p->accion(['accion' => 'errores_resolver', 'grupo_id' => $gf, 'nota' => 'arreglado en envivo-v17'], $TAB);
check('Marcar resuelto -> ok, con la versión más nueva vista (v16) y la nota', ['ok: Error N° ' . $gf . ' marcado como resuelto: Error nuevo frecuente', 'envivo-v16', 'arreglado en envivo-v17', $QUIEN],
    [$r, (string) $val('SELECT version_resuelto FROM errores_grupos WHERE id = ?', [$gf]), (string) $val('SELECT nota FROM errores_grupos WHERE id = ?', [$gf]), (string) $val('SELECT resuelto_por FROM errores_grupos WHERE id = ?', [$gf])]);
$a = $fila("SELECT * FROM auditoria WHERE accion = 'errores_resolver' ORDER BY id DESC LIMIT 1");
check('Auditoría errores_resolver (quién, detalle, IP)', [$QUIEN, true, '127.0.0.1'], [$a['quien'] ?? null, str_contains($a['detalle'] ?? '', 'Grupo N° ' . $gf . ' marcado resuelto (visto hasta envivo-v16, 6 veces)'), $a['ip'] ?? null]);
check('Marcar resuelto otra vez -> error', true, str_starts_with($p->accion(['accion' => 'errores_resolver', 'grupo_id' => $gf], $TAB), 'error: Ese error ya está marcado'));
check('Grupo que no existe -> error', true, str_starts_with($p->accion(['accion' => 'errores_resolver', 'grupo_id' => 999999], $TAB), 'error: Ese grupo de errores no existe'));
check('Acción desconocida -> error', true, str_starts_with($p->accion(['accion' => 'errores_borrar_todo', 'grupo_id' => $gf], $TAB), 'error: Acción desconocida'));
$p->get('/control/?t=errores');
check('Después: fuera de la lista abierta, sin aviso en Errores; con "Mostrar resueltos" aparece como resuelto', [false, false], [str_contains($p->cuerpo, '>Error nuevo frecuente<'), $p->tiene('id="alerta-errores"')]);
$p->get('/control/?t=errores&resueltos=1');
check('…con resueltos: aparece con el chip "resuelto"', true, (bool) preg_match('#Error nuevo frecuente</span></a>.*?chip-ok">resuelto#s', $p->cuerpo));
$p->get($TAB);
check('Detalle resuelto: botón Reabrir con confirmación', [true, true], [$p->tiene('value="errores_reabrir"'), $p->tiene('data-confirmar="¿Reabrir este error?"')]);
check('Reabrir -> ok y auditoría', ['ok: Error N° ' . $gf . ' reabierto.', null, 1], [$p->accion(['accion' => 'errores_reabrir', 'grupo_id' => $gf], $TAB), $val('SELECT resuelto FROM errores_grupos WHERE id = ?', [$gf]) ?: null,
    (int) $val("SELECT COUNT(*) FROM auditoria WHERE accion = 'errores_reabrir'")]);
$p->get('/control/?t=resumen');
check('Resumen: aviso del error nuevo (reabierto, pasó 5 veces)', [200, true, true], [$p->http, $p->tiene('id="alerta-errores"'), $p->tiene('href="/control/?t=errores&amp;id=' . $gf . '"')]);
$x('UPDATE errores_grupos SET total = 4 WHERE id = ?', [$gf]);
$p->get('/control/?t=resumen');
check('Resumen: con menos veces que ERRORES_ALERTA (5) no hay aviso', false, $p->tiene('id="alerta-errores"'));
$x('UPDATE errores_grupos SET total = 6, primero = ? WHERE id = ?', [time() - 2 * 86400, $gf]);
$p->get('/control/?t=resumen');
check('Resumen: si el grupo ya no es nuevo (más de 24 h), no hay aviso', false, $p->tiene('id="alerta-errores"'));
$p->get('/control/?t=errores&id=999999');
check('Detalle de un grupo que no existe: 200 con aviso', [200, true], [$p->http, $p->tiene('Ese grupo no existe')]);
check('Sin librerías: un solo <script> (control.js)', 1, substr_count($p->cuerpo, '<script'));
si('Sin errores de PHP en el registro', !is_file("$TMP/php_errores.log") || !preg_match('/PHP (Fatal|Warning|Notice|Deprecated)|EN VIVO (api|control)/', (string) file_get_contents("$TMP/php_errores.log")));
if (is_file("$TMP/php_errores.log") && filesize("$TMP/php_errores.log") > 0) echo substr((string) file_get_contents("$TMP/php_errores.log"), 0, 2000) . "\n";

echo "\n----------------------------------------\n";
echo "Errores: $ok correctas, $fallas fallas\n";
exit($fallas ? 1 : 0);
