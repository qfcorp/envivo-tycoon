<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Conector del Panel Tukán Central: /tukan_central.php (src/ConectorCentral.php).
// De punta a punta con el Panel DE VERDAD (repo qfcorp/tukan-central en PANEL_DIR, por defecto ../tukan-central):
//  - el Panel agrega el programa «envivo» y consulta su estado como lo hace la revisión de cada 15 minutos (Monitor::consultar)
//    -> la tarjeta queda «En línea» con las cifras del juego (antes salía «Sin conexión: 404»);
//  - entrar desde el Panel (sso) abre el Centro de Control sin pedir clave y queda en la auditoría.
// Casos del protocolo (PROTOCOLO.md §6): firma mala, otro programa, tipo cambiado, vencido, futuro, nonce repetido,
// correo inválido y sin configurar (404).
// Uso:  php server/tests/pruebas_conector_central.php     (GUARDAR_TMP=1 deja los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$PANEL = getenv('PANEL_DIR') ?: dirname($RAIZ) . '/tukan-central';
$hayPanel = is_file($PANEL . '/src/Monitor.php');
$TMP = sys_get_temp_dir() . '/envivo_conector_' . bin2hex(random_bytes(4));
mkdir($TMP . '/panel', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; };
$P = $puerto(); $P_APAGADO = $puerto();

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}

// ---- El programa en el Panel (como «Programas → Agregar») -> su secreto de verdad
$envPanel = ['PATH' => getenv('PATH'), 'TZ' => 'America/Guayaquil', 'TUKAN_CENTRAL_DATOS' => $TMP . '/panel', 'TUKAN_CENTRAL_KEY' => bin2hex(random_bytes(32)),
             'TUKAN_CENTRAL_ENV' => '/no/existe', 'TELEGRAM_BOT_TOKEN' => '', 'TUKAN_APIS_ENV' => '/no/existe', 'no_proxy' => '127.0.0.1,localhost', 'PANEL' => $PANEL, 'JUEGO' => "http://127.0.0.1:$P"];
$panelPhp = function (string $codigo) use ($TMP, $envPanel): string {
    $f = $TMP . '/panel_' . bin2hex(random_bytes(3)) . '.php';
    file_put_contents($f, '<?php define("TUKAN_SIN_SESION", true); require getenv("PANEL") . "/app/bootstrap.php"; ' . $codigo);
    return (string) shell_exec(implode(' ', array_map(fn($k, $v) => $k . '=' . escapeshellarg($v), array_keys($envPanel), $envPanel)) . ' php ' . escapeshellarg($f) . ' 2>&1');
};
if ($hayPanel) {
    $SECRETO = trim($panelPhp('echo instancias()->crear(["id" => "envivo", "producto" => "envivo", "url" => getenv("JUEGO"), "nombre" => "EN VIVO Tycoon", "activo" => 1]);'));
} else {
    echo "  AVISO: no está el Panel en $PANEL (PANEL_DIR): se prueba solo el juego, con un secreto de prueba\n";
    $SECRETO = bin2hex(random_bytes(32));
}

// ---- El juego: base temporal con jugadores y compras
$USUARIO = 'jefe';
$base = "; SOLO PRUEBAS (pruebas_conector_central.php)\nENVIVO_ZONA=America/Guayaquil\nENVIVO_DB=$TMP/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:$P\n"
      . "ENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=" . password_hash('Clave-Larga-2026', PASSWORD_DEFAULT) . "\nPLUX_AMBIENTE=produccion\nTUKAN_CENTRAL_URL=https://panel.tukanec.com\n";
file_put_contents("$TMP/c.env", $base . "TUKAN_CENTRAL_ID=envivo\nTUKAN_CENTRAL_SECRET=$SECRETO\n");
file_put_contents("$TMP/c_apagado.env", $base . "TUKAN_CENTRAL_ID=envivo\nTUKAN_CENTRAL_SECRET=corto\n");
putenv("ENVIVO_CONFIG=$TMP/c.env");
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';
use EnVivo\{ConectorCentral, Db};
Db::pdo();
$t = time();
$inicioMes = (int) strtotime(date('Y-m-01 00:00:00'));
$q = fn(string $sql, array $p = []) => Db::q($sql, $p);
for ($i = 1; $i <= 3; $i++) $q('INSERT INTO jugadores (id, email, nombre, clave_hash, creditos, creado, ultimo_ingreso) VALUES (?, ?, ?, ?, 0, ?, ?)', [$i, "j$i@prueba.example", "Jugador $i", 'x', $t - ($i === 3 ? 60 * 86400 : 86400), $i === 1 ? $t - 3600 : $t - 5 * 86400]);
$compra = function (int $id, float $sub, int $pagado, string $estado = 'pagado') use ($q, $t): void {
    $q("INSERT INTO compras (id, token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en, canal) VALUES (?, ?, 1, 'creditos_250', ?, ?, ?, ?, ?, ?, 'web_plux')",
        [$id, "tok$id", round($sub * 1.15, 2), $sub, round($sub * 0.15, 2), $estado, $pagado, $estado === 'pagado' ? $pagado : null]);
};
$compra(1, 10.00, $inicioMes + 3600);                       // este mes
$compra(2, 4.35, max($inicioMes + 7200, $t - 60));           // este mes
$compra(3, 20.00, $inicioMes - 86400);                       // mes anterior
$compra(4, 99.00, $t - 60, 'pendiente');                     // no cuenta

// ---- Servidores del juego (con el enrutador que copia a nginx)
$PIDS = [];
$arrancar = function (string $conf, int $puerto) use ($RAIZ, $TMP, &$PIDS): bool {
    $PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-S', "127.0.0.1:$puerto", '-t', $RAIZ, $RAIZ . '/server/tests/router.php'],
        [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/srv_$puerto.log", 'a'], 2 => ['file', "$TMP/srv_$puerto.log", 'a']], $pipes, $RAIZ, array_merge(getenv(), ['ENVIVO_CONFIG' => $conf]));
    for ($i = 0; $i < 80; $i++) { if (@fsockopen('127.0.0.1', $puerto)) return true; usleep(100000); }
    return false;
};
check('Arrancan el juego conectado y uno sin configurar', true, $arrancar("$TMP/c.env", $P) && $arrancar("$TMP/c_apagado.env", $P_APAGADO));
register_shutdown_function(function () use (&$PIDS, $TMP): void {
    foreach ($PIDS as $p) { $s = proc_get_status($p); if ($s['running']) posix_kill($s['pid'], SIGTERM); proc_close($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});
$jar = "$TMP/galletas.txt";
$pedir = function (int $puerto, string $ruta, bool $galletas = false) use ($jar): array {
    $cab = [];
    $ch = curl_init("http://127.0.0.1:$puerto$ruta");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_NOPROXY => '*',
        CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$cab) { $p = explode(':', $h, 2); if (count($p) === 2) $cab[strtolower(trim($p[0]))][] = trim($p[1]); return strlen($h); }]);
    if ($galletas) curl_setopt_array($ch, [CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar]);
    $cuerpo = (string) curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return [$http, $cuerpo, $cab];
};
$tok = function (string $tipo, array $cambios = []) use ($SECRETO): string {
    $ahora = time();
    $p = array_merge(['v' => 1, 'tipo' => $tipo, 'inst' => 'envivo', 'email' => 'dimitryfierro@gmail.com', 'nombre' => 'Dimitry', 'iat' => $ahora, 'exp' => $ahora + 60, 'nonce' => bin2hex(random_bytes(16))], $cambios);
    return ConectorCentral::firmar($p, $cambios['_secreto'] ?? $SECRETO);
};

titulo('Estado (las cifras de la tarjeta del Panel)');
[$h, $c] = $pedir($P, '/tukan_central.php?accion=estado&t=' . $tok('estado'));
$j = json_decode($c, true) ?: [];
check('Token correcto: 200 con ok, protocolo 1 y producto envivo', [200, true, 1, 'envivo'], [$h, $j['ok'] ?? null, $j['protocolo'] ?? null, $j['producto'] ?? null]);
check('Juego de una sola empresa: negocios = null y cliente', [true, 'EN VIVO Tycoon'], [array_key_exists('negocios', $j) && $j['negocios'] === null, $j['cliente'] ?? null]);
check('Ventas del mes sin IVA (10 + 4,35) y mes anterior (20); la pendiente no cuenta', [14.35, 20], [$j['ingresos_mes'] ?? null, $j['ingresos_mes_anterior'] ?? null]);
check('Nuevos en 30 días (2 de 3) y extra con jugadores, 24 h y ventas del mes', [2, 3, 1, 2], [$j['nuevos_30d'] ?? null, $j['extra']['Jugadores'] ?? null, $j['extra']['Jugaron en 24 h'] ?? null, $j['extra']['Ventas del mes'] ?? null]);
check('version: commit corto de git', true, (bool) preg_match('/^[0-9a-f]{7}$/', (string) ($j['version'] ?? '')));

titulo('Rechazos (PROTOCOLO.md §3 y §6)');
$codigo = function (string $t) use ($pedir, $P): array { [$h, $c] = $pedir($P, '/tukan_central.php?accion=estado&t=' . rawurlencode($t)); return [$h, (json_decode($c, true) ?: [])['codigo'] ?? null]; };
check('Firma mala', [401, 'firma'], $codigo($tok('estado', ['_secreto' => str_repeat('a', 64)])));
check('Otro programa (inst)', [401, 'inst'], $codigo($tok('estado', ['inst' => 'tuevento'])));
check('Tipo cambiado (token de sso para estado)', [401, 'tipo'], $codigo($tok('sso')));
check('Versión 2', [401, 'version'], $codigo($tok('estado', ['v' => 2])));
check('Vencido', [401, 'vencido'], $codigo($tok('estado', ['iat' => time() - 200, 'exp' => time() - 140])));
check('Del futuro', [401, 'futuro'], $codigo($tok('estado', ['iat' => time() + 120, 'exp' => time() + 150])));
check('Más de 60 segundos de vida', [401, 'invalido'], $codigo($tok('estado', ['exp' => time() + 120])));
check('Correo inválido', [401, 'email'], $codigo($tok('estado', ['email' => 'no-es-correo'])));
$uno = $tok('estado');
check('Nonce repetido: el mismo token sirve una sola vez', [[200, null], [401, 'repetido']], [$codigo($uno), $codigo($uno)]);
check('Basura en vez de token', [401, 'firma'], $codigo('abc'));
check('Acción desconocida -> 400', 400, $pedir($P, '/tukan_central.php?accion=borrar&t=' . $tok('estado'))[0]);
check('Sin configurar (secreto corto): 404 y nada más', [404, "404\n"], array_slice($pedir($P_APAGADO, '/tukan_central.php?accion=estado&t=' . $tok('estado')), 0, 2));

titulo('Entrar desde el Panel (sso) al Centro de Control');
check('Sin entrar: /control/ pide usuario y clave', true, str_contains($pedir($P, '/control/', true)[1], 'name="clave"'));
[$h, $c, $cab] = $pedir($P, '/tukan_central.php?accion=sso&t=' . $tok('sso'), true);
check('sso: 200, galleta del Centro de Control (HttpOnly, SameSite=Strict, solo /control/) y sigue sola a /control/', [200, true, true],
      [$h, (bool) preg_grep('/^envivo_control=[a-f0-9]{64}; .*path=\/control\/; .*HttpOnly; SameSite=Strict/i', $cab['set-cookie'] ?? []), str_contains($c, 'content="0;url=/control/"')]);
[$h, $c] = $pedir($P, '/control/', true);
check('Con esa galleta, /control/ abre el panel (sin clave ni código)', [200, false, true], [$h, str_contains($c, 'name="clave"'), str_contains($c, 'Resumen')]);
check('Queda en la auditoría del juego: «Entró desde el Panel Tukán Central»', 1,
      (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'panel_tukan_sso' AND quien = ? AND detalle LIKE '%dimitryfierro@gmail.com%'", ["control:$USUARIO"]));
[$h, $c, $cab] = $pedir($P, '/tukan_central.php?accion=sso&t=' . $tok('sso', ['inst' => 'otro']));
check('sso con token malo: 401, página en español con enlace al Panel y X-Tukan-Codigo', [401, true, ['inst']], [$h, str_contains($c, 'Volver al Panel Tukán'), $cab['x-tukan-codigo'] ?? []]);

if ($hayPanel) {
    titulo('De punta a punta: el Panel DE VERDAD consulta el juego (revisión de cada 15 minutos)');
    $r = json_decode(trim($panelPhp('$i = instancias()->obtener("envivo"); $r = monitor()->consultar([$i], "revision@panel.tukanec.com", "Panel Tukan (revision automatica)"); echo json_encode($r["envivo"] ?? null);')), true) ?: [];
    check('El Panel ve el juego «En línea» (antes: Sin conexión, 404)', [true, 200, null], [$r['en_linea'] ?? null, $r['http'] ?? null, $r['error'] ?? null]);
    check('…con sus cifras: ventas del mes 14,35 y producto envivo', [14.35, 'envivo'], [$r['datos']['ingresos_mes'] ?? null, $r['datos']['producto'] ?? null]);
}

echo "\nConector del Panel: $OK correctas · $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
