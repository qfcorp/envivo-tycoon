<?php
// SOLO PRUEBAS (en una máquina de pruebas; NUNCA en el servidor del juego). Prueba completa del bot de Discord:
//   - Discord FALSO (server/tests/discord_falso.php con php -S) y el juego con php -S (server/tests/router_discord.php)
//     sobre una COPIA de server/ a la que se le aplican los bloques de server/INTEGRAR_DISCORD.md (rutas y /api/estado).
//   - Firmas Ed25519 de verdad (llaves hechas aquí con sodium): firma mala, vieja, de otra llave, cuerpo cambiado, PING/PONG.
//   - /api/discord/codigo, /vincular de punta a punta con los roles en el Discord falso, /desvincular, /perfil, /ranking,
//     /eventos, /ayuda, idiomas, sincronización (bin/discord_sync.php), límites (429, global, X-RateLimit-Remaining: 0),
//     anuncios por webhook, registro de comandos (bin/discord_comandos.php), nginx + php-fpm si hay en la máquina,
//     y que NINGÚN token (bot, webhooks, interacciones) quede en registros, salidas ni en la base.
// Uso:  php server/tests/pruebas_discord.php        (GUARDAR_TMP=1 para dejar los archivos de la prueba)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$TMP = sys_get_temp_dir() . '/envivo-discord-' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
// Puertos libres al azar (en la máquina de pruebas puede haber otras pruebas corriendo a la vez)
$libre = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr(strrchr((string) stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; };
$P_APP = (int) (getenv('P_APP') ?: $libre()); $P_FALSO = (int) (getenv('P_FALSO') ?: $libre()); $P_NGINX = (int) (getenv('P_NGINX') ?: $libre());
$PROCS = [];
register_shutdown_function(function () use (&$PROCS, $TMP) {
    // Solo un pid de verdad: posix_kill(0, ...) (archivo vacío si nginx no arrancó) mataría a todo el grupo de procesos,
    // incluido server/tests/correr.sh
    foreach (['nginx.pid', 'fpm.pid'] as $f) if (is_file("$TMP/$f") && ($pid = (int) trim((string) file_get_contents("$TMP/$f"))) > 1) posix_kill($pid, SIGTERM);
    foreach ($PROCS as $p) { proc_terminate($p, SIGKILL); proc_close($p); }
    usleep(200000);
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }
$azar = fn(int $n, string $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') => implode('', array_map(fn() => $abc[random_int(0, strlen($abc) - 1)], range(1, $n)));

// ---------------------------------------------------------------- secretos de la prueba (todos inventados aquí)
$par = sodium_crypto_sign_keypair();
$PRIV = sodium_crypto_sign_secretkey($par);
$PUB = bin2hex(sodium_crypto_sign_publickey($par));
$otroPar = sodium_crypto_sign_keypair();
$APP = '111111111111111111'; $GUILD = '222222222222222222';
$TOKEN = 'MT' . $azar(24) . '.' . $azar(6) . '.' . $azar(38, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
$WH = ['anuncios' => ['333333333333333331', $azar(68)], 'eventos' => ['333333333333333332', $azar(68)], 'estado' => ['333333333333333333', $azar(68)]];
$SECRETOS = [$TOKEN, $WH['anuncios'][1], $WH['eventos'][1], $WH['estado'][1]];   // + los tokens de cada interacción (se suman abajo)
$BASE = "http://127.0.0.1:$P_FALSO/api/v10";
$R = ['verificado' => '500000000000000001', 'comprador' => '500000000000000002', 'vip' => '500000000000000003', 'presidente' => '500000000000000004',
      's1' => '500000000000000005', 'espanol' => '500000000000000006', 'moderador' => '500000000000000007', 's2' => '500000000000000008'];
$config = function (array $extra = []) use ($TMP, $P_APP, $APP, $PUB, $TOKEN, $GUILD, $BASE, $WH, $R): string {
    $c = ['ENVIVO_DB' => "$TMP/datos/envivo.sqlite", 'ENVIVO_URL' => "http://127.0.0.1:$P_APP", 'ENVIVO_ZONA' => 'America/Guayaquil',
          'SOPORTE_CORREO' => 'soporte@tukanec.com', 'DISCORD_APP_ID' => $APP, 'DISCORD_PUBLIC_KEY' => $PUB, 'DISCORD_BOT_TOKEN' => $TOKEN,
          'DISCORD_GUILD_ID' => $GUILD, 'DISCORD_API_BASE' => $BASE, 'DISCORD_ROLES_JSON' => json_encode(['VIP' => $R['vip']]),
          'DISCORD_WEBHOOK_ANUNCIOS' => "$BASE/webhooks/{$WH['anuncios'][0]}/{$WH['anuncios'][1]}",
          'DISCORD_WEBHOOK_EVENTOS' => "$BASE/webhooks/{$WH['eventos'][0]}/{$WH['eventos'][1]}",
          'DISCORD_WEBHOOK_ESTADO' => "$BASE/webhooks/{$WH['estado'][0]}/{$WH['estado'][1]}",
          'DISCORD_INVITACION' => 'https://discord.gg/envivo'];
    $t = "; SOLO PRUEBAS (server/tests/pruebas_discord.php)\n";
    foreach (array_merge($c, $extra) as $k => $v) if ($v !== null) $t .= "$k=$v\n";
    return $t;
};
file_put_contents("$TMP/config.env", $config());
putenv("ENVIVO_CONFIG=$TMP/config.env");

// ---------------------------------------------------------------- 0. sintaxis y copia de server/ con INTEGRAR_DISCORD.md aplicado
titulo('0. Sintaxis y bloques de INTEGRAR_DISCORD.md');
$mios = ['src/Discord.php', 'public/discord/interacciones.php', 'bin/discord_sync.php', 'bin/discord_comandos.php', 'tests/discord_falso.php', 'tests/router_discord.php', 'tests/pruebas_discord.php'];
$mal = [];
foreach ($mios as $f) { exec('php -l ' . escapeshellarg("$SRV/$f") . ' 2>&1', $o, $c); if ($c !== 0) $mal[] = $f; }
check('php -l de los archivos del bot', [], $mal);
$doc = (string) file_get_contents("$SRV/INTEGRAR_DISCORD.md");
$bloque = function (string $marca) use ($doc): string {
    if (!preg_match('/<!-- prueba:' . preg_quote($marca, '/') . " -->\s*```[a-z]*\n(.*?)\n```/s", $doc, $m)) return '';
    return $m[1];
};
@mkdir("$TMP/srv"); exec('cp -r ' . escapeshellarg("$SRV/src") . ' ' . escapeshellarg("$SRV/public") . ' ' . escapeshellarg("$SRV/bin") . ' ' . escapeshellarg("$TMP/srv/"));
$api = (string) file_get_contents("$TMP/srv/public/api.php");
$ancla = "        default => Http::error(404, 'No encontrado.'),";
$rutas = $bloque('rutas'); $antes = $bloque('estado_antes'); $despues = $bloque('estado_despues');
check('INTEGRAR_DISCORD.md trae los bloques rutas / estado / nginx / cron', [true, true, true, true, true], [$rutas !== '', $antes !== '', $despues !== '', $bloque('nginx') !== '', $bloque('cron') !== '']);
if (str_contains($api, $rutas) && substr_count($api, $despues) === 1) {
    // api.php ya trae los bloques (integrado en server/): se prueba tal cual
    check('api.php (de hoy) ya trae las rutas del bot y /api/estado con Discord::estado', [1, 1, 0], [substr_count($api, $rutas), substr_count($api, $despues), substr_count($api, $antes)]);
} else {
    check('api.php (de hoy) tiene el lugar donde va cada bloque', [1, 1], [substr_count($api, $ancla), substr_count($api, $antes)]);
    $api = str_replace([$ancla, $antes], [$rutas . "\n" . $ancla, $despues], $api);
}
file_put_contents("$TMP/srv/public/api.php", $api);
exec('php -l ' . escapeshellarg("$TMP/srv/public/api.php") . ' 2>&1', $o, $c);
check('api.php con los bloques del bot: sin errores de sintaxis', 0, $c);
$cron = $bloque('cron');
check('Línea de cron: cada 10 minutos, con ENVIVO_CONFIG y el script de sincronización', 1, preg_match('#^\*/10 \* \* \* \* ENVIVO_CONFIG=/etc/envivo/config\.env php /var/www/envivo/server/bin/discord_sync\.php >> /var/log/envivo-discord\.log 2>&1$#', $cron));

// ---------------------------------------------------------------- servidores: Discord falso y el juego
$estadoFalso = "$TMP/falso_estado.json"; $logFalso = "$TMP/falso.log";
file_put_contents($logFalso, '');
$roles = [['id' => $R['verificado'], 'name' => 'Jugador verificado'], ['id' => $R['comprador'], 'name' => 'Comprador verificado'],
          ['id' => $R['vip'], 'name' => '⭐ VIP'], ['id' => $R['presidente'], 'name' => 'Presidente de Asociación'],
          ['id' => $R['s1'], 'name' => 'Servidor 1 · Quito'], ['id' => $R['espanol'], 'name' => 'Español'],
          ['id' => $R['moderador'], 'name' => 'Moderador'], ['id' => $R['s2'], 'name' => 'Servidor 2 - Guayaquil'],
          ['id' => '500000000000000099', 'name' => 'EN VIVO Bot', 'managed' => true]];
$U = ['ana' => '400000000000000001', 'beto' => '400000000000000002', 'caro' => '400000000000000003', 'dani' => '400000000000000004',
      'eli' => '400000000000000005', 'fuera' => '400000000000000006', 'zeta' => '400000000000000009', 'nueva' => '400000000000000010'];
file_put_contents($estadoFalso, json_encode(['guild' => $GUILD, 'roles' => $roles, 'miembros' => [
    $U['ana'] => [$R['espanol'], $R['moderador']], $U['beto'] => [], $U['caro'] => [$R['espanol']], $U['dani'] => [], $U['eli'] => [], $U['zeta'] => [], $U['nueva'] => [],
]]));
$falso = function (callable $f) use ($estadoFalso) {
    $h = fopen($estadoFalso, 'c+'); flock($h, LOCK_EX);
    $e = json_decode((string) stream_get_contents($h), true) ?: [];
    $f($e);
    ftruncate($h, 0); rewind($h); fwrite($h, json_encode($e, JSON_UNESCAPED_UNICODE)); fflush($h); flock($h, LOCK_UN); fclose($h);
};
$leerFalso = fn() => json_decode((string) file_get_contents($estadoFalso), true);
$llamadas = fn() => array_values(array_filter(array_map(fn($l) => json_decode($l, true), file($logFalso, FILE_IGNORE_NEW_LINES) ?: [])));
$marca = fn() => count(file($logFalso, FILE_IGNORE_NEW_LINES) ?: []);
$desde = fn(int $m) => array_slice($llamadas(), $m);
$rolesDe = fn(string $uid) => (function () use ($leerFalso, $uid, $R) { $ids = $leerFalso()['miembros'][$uid] ?? null; if ($ids === null) return null; $n = array_flip($R); $o = array_map(fn($i) => $n[$i] ?? $i, $ids); sort($o); return $o; })();

$arrancar = function (array $cmd, array $env, string $log) use (&$PROCS) {
    $p = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tuberias, null, array_merge(getenv(), $env));
    $PROCS[] = $p;
    return $p;
};
$arrancar(['php', '-d', 'log_errors=1', '-S', "127.0.0.1:$P_FALSO", "$SRV/tests/discord_falso.php"], ['DISCORD_FALSO_ESTADO' => $estadoFalso, 'DISCORD_FALSO_LOG' => $logFalso, 'DISCORD_FALSO_TOKEN' => $TOKEN], "$TMP/falso_php.log");
$arrancar(['php', '-d', 'log_errors=1', '-S', "127.0.0.1:$P_APP", '-t', "$TMP/srv", "$SRV/tests/router_discord.php"], ['ENVIVO_CONFIG' => "$TMP/config.env", 'EV_SRV' => "$TMP/srv", 'PHP_CLI_SERVER_WORKERS' => '4'], "$TMP/app.log");
$esperar = function (string $url): bool { for ($i = 0; $i < 80; $i++) { $c = curl_init($url); curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 1]); curl_exec($c); $h = curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c); if ($h > 0) return true; usleep(100000); } return false; };
si('Discord falso y juego arrancan', $esperar("http://127.0.0.1:$P_FALSO/") && $esperar("http://127.0.0.1:$P_APP/api/estado"));

// ---------------------------------------------------------------- ayudas HTTP
$URL = "http://127.0.0.1:$P_APP";
$http = function (string $metodo, string $ruta, ?string $cuerpo = null, array $cab = [], ?string $jar = null) use ($URL): array {
    $c = curl_init(str_starts_with($ruta, 'http') ? $ruta : $URL . $ruta);
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 30]);
    if ($cuerpo !== null) curl_setopt($c, CURLOPT_POSTFIELDS, $cuerpo);
    if ($jar !== null) curl_setopt_array($c, [CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar]);
    $t = microtime(true);
    $txt = (string) curl_exec($c);
    $r = ['http' => (int) curl_getinfo($c, CURLINFO_HTTP_CODE), 'txt' => $txt, 'json' => json_decode($txt, true), 'seg' => microtime(true) - $t, 'tipo' => (string) curl_getinfo($c, CURLINFO_CONTENT_TYPE)];
    curl_close($c);
    return $r;
};
$api = fn(string $ruta, array $d, string $jar, bool $cabecera = true) => $http('POST', $ruta, json_encode($d), array_merge(['Content-Type: application/json'], $cabecera ? ['X-Envivo: 1'] : []), $jar);
$apiGet = fn(string $ruta, string $jar) => $http('GET', $ruta, null, [], $jar);
$pdo = new PDO('sqlite:' . "$TMP/datos/envivo.sqlite", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec('PRAGMA busy_timeout = 10000');
$val = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); };
$exec = function (string $sql, array $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->rowCount(); };

$n = 0;
$nuevo = function (string $nombre, string $alias, int $fama) use (&$n, $api, $TMP, $exec): array {
    $n++;
    $jar = "$TMP/jar_$n";
    $r = $api('/api/registro', ['email' => "jugador$n@prueba.example", 'nombre' => $nombre, 'clave' => 'ClaveSegura123'], $jar);
    $id = (int) ($r['json']['jugador']['id'] ?? 0);
    $exec('UPDATE jugadores SET alias = ?, alias_clave = ?, fama_publica = ? WHERE id = ?', [$alias, mb_strtolower($alias), $fama, $id]);
    return [$jar, $id, "jugador$n@prueba.example"];
};
$INTER = [];   // tokens de interacción usados (no deben quedar en ningún registro)
$firmar = fn(string $cuerpo, ?int $ts = null, ?string $priv = null) => [(string) ($ts ?? time()), bin2hex(sodium_crypto_sign_detached((string) ($ts ?? time()) . $cuerpo, $priv ?? $PRIV))];
$interaccion = function (array $p, array $opc = []) use ($http, $firmar, $PRIV): array {
    $cuerpo = json_encode($p, JSON_UNESCAPED_UNICODE);
    [$ts, $f] = $firmar($cuerpo, $opc['ts'] ?? null, $opc['priv'] ?? $PRIV);
    if (isset($opc['alterar'])) $cuerpo = str_replace($opc['alterar'][0], $opc['alterar'][1], $cuerpo);
    $cab = ['Content-Type: application/json', 'User-Agent: Discord-Interactions/1.0 (+https://discord.com)'];
    if (empty($opc['sin_firma'])) { $cab[] = 'X-Signature-Ed25519: ' . ($opc['firma'] ?? $f); $cab[] = 'X-Signature-Timestamp: ' . $ts; }
    return $http('POST', $opc['url'] ?? '/discord/interacciones', $cuerpo, $cab);
};
$cmd = function (string $nombre, array $opciones, string $uid, string $locale = 'es-419', ?string $guild = null, array $extra = []) use (&$INTER, $APP, $GUILD, $azar): array {
    $tok = 'aW50ZXJhY3Rpb246' . $azar(150, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
    $INTER[] = $tok;
    $p = ['type' => 2, 'id' => (string) random_int(10 ** 17, 10 ** 18 - 1), 'application_id' => $APP, 'token' => $tok, 'version' => 1, 'locale' => $locale,
          'guild_locale' => 'es-ES', 'guild_id' => $guild ?? $GUILD, 'channel_id' => '600000000000000001',
          'member' => ['user' => ['id' => $uid, 'username' => 'usuario_' . substr($uid, -2), 'global_name' => 'Usuario ' . substr($uid, -2)], 'roles' => []],
          'data' => ['id' => '700000000000000001', 'name' => $nombre, 'type' => 1, 'options' => array_map(fn($k, $v) => ['name' => $k, 'type' => is_int($v) ? 4 : 3, 'value' => $v], array_keys($opciones), $opciones)]];
    if ($guild === '') { unset($p['guild_id'], $p['member']); $p['user'] = ['id' => $uid, 'username' => 'dm']; }
    return array_replace_recursive($p, $extra);
};
$huella = fn(string $t) => 'h:' . substr(hash('sha256', $t), 0, 12);
/** Espera la edición de la respuesta (PATCH .../messages/@original) de esa interacción. */
$seguimiento = function (array $p, float $max = 15.0) use ($llamadas, $huella, $APP): ?array {
    $ruta = "/api/v10/webhooks/$APP/" . $huella($p['token']) . '/messages/@original';
    $t = microtime(true);
    while (microtime(true) - $t < $max) {
        foreach ($llamadas() as $l) if ($l['ruta'] === $ruta && $l['metodo'] === 'PATCH' && $l['codigo'] === 200) return $l;
        usleep(100000);
    }
    return null;
};
$texto = fn(?array $j) => json_encode($j, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
$php = function (string $codigo, array $env = []) use ($SRV, $TMP): array {   // corre PHP aparte con la configuración de la prueba
    $f = "$TMP/script_" . bin2hex(random_bytes(3)) . '.php';
    file_put_contents($f, "<?php\nrequire '$SRV/src/arranque.php';\nuse EnVivo\\{Db, Discord, Config};\nDb::pdo();\n" . $codigo);
    $p = proc_open(['php', $f], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $t, null, array_merge(getenv(), ['ENVIVO_CONFIG' => "$TMP/config.env"], $env));
    $o = stream_get_contents($t[1]); $e = stream_get_contents($t[2]); $c = proc_close($p);
    file_put_contents("$TMP/salidas.log", $o . $e, FILE_APPEND);
    return ['salida' => $o, 'error' => $e, 'codigo' => $c];
};
$cli = function (array $args, array $env = []) use ($TMP): array {
    $p = proc_open(array_merge(['php'], $args), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $t, null, array_merge(getenv(), ['ENVIVO_CONFIG' => "$TMP/config.env"], $env));
    $o = stream_get_contents($t[1]); $e = stream_get_contents($t[2]); $c = proc_close($p);
    file_put_contents("$TMP/salidas.log", $o . $e, FILE_APPEND);
    return ['salida' => $o, 'error' => $e, 'codigo' => $c];
};

// =====================================================================
titulo('1. Firma Ed25519 y PING');
$ping = ['type' => 1, 'id' => '1', 'application_id' => $APP, 'token' => 'x', 'version' => 1];
$r = $http('GET', '/discord/interacciones');
check('GET -> 405', 405, $r['http']);
$r = $interaccion($ping, ['sin_firma' => true]);
check('Sin cabeceras de firma -> 401', 401, $r['http']);
$r = $interaccion($ping, ['firma' => str_repeat('zz', 64)]);
check('Firma que no es hexadecimal -> 401', 401, $r['http']);
$r = $interaccion($ping, ['firma' => str_repeat('ab', 64)]);
check('Firma inventada -> 401', 401, $r['http']);
$r = $interaccion($ping, ['priv' => sodium_crypto_sign_secretkey($otroPar)]);
check('Firmada con OTRA llave -> 401', 401, $r['http']);
$r = $interaccion($ping, ['alterar' => ['"type":1', '"type":2']]);
check('Cuerpo cambiado después de firmar -> 401', 401, $r['http']);
$r = $interaccion($ping, ['ts' => time() - 600]);
check('Firma válida pero de hace 10 minutos -> 401 (no se puede reenviar)', 401, $r['http']);
$r = $interaccion($ping);
check('PING firmado -> 200 {"type":1} (PONG) en JSON', [200, ['type' => 1], true], [$r['http'], $r['json'], str_starts_with($r['tipo'], 'application/json')]);
$r = $http('GET', '/discord/otra');
check('Otra dirección bajo /discord/ -> 404', 404, $r['http']);
file_put_contents("$TMP/config_sin.env", $config(['DISCORD_PUBLIC_KEY' => null, 'DISCORD_APP_ID' => null]));
$r = $php('$_SERVER["REQUEST_METHOD"] = "POST"; register_shutdown_function(function () { echo "|" . http_response_code(); }); require "' . $SRV . '/public/discord/interacciones.php";', ['ENVIVO_CONFIG' => "$TMP/config_sin.env"]);
check('Sin configuración de Discord -> 503 (no se acepta nada)', '503', substr(strrchr(trim($r['salida']), '|') ?: '', 1));

// =====================================================================
titulo('2. Código para vincular (POST /api/discord/codigo)');
[$jA, $A, $emailA] = $nuevo('Ana Torres', 'Andes Visión', 72);
[$jB, $B, $emailB] = $nuevo('Beto Mora', 'Beto Live', 40);
[$jC, $C] = $nuevo('Carolina Paz', 'Cumbre TV', 88);
[$jD, $D] = $nuevo('Daniel Ruiz', 'Delta Stream', 15);
[$jE, $E] = $nuevo('Elisa Vega', 'Eco Producciones', 60);
[$jF, $F] = $nuevo('Felipe Ortiz', 'Faro Media', 5);
si('Jugadores de prueba creados', $A > 0 && $F > 0);
$r = $apiGet('/api/estado', $jA);
check('/api/estado con los bloques: discord_vinculado false + invitación', [false, 'https://discord.gg/envivo', true], [$r['json']['discord_vinculado'] ?? null, $r['json']['discord_invitacion'] ?? null, isset($r['json']['tienda'])]);
$r = $http('GET', '/api/estado');
check('/api/estado sin sesión: discord_vinculado false', false, $r['json']['discord_vinculado'] ?? null);
$r = $api('/api/discord/codigo', [], "$TMP/jar_vacio");
check('Sin sesión -> 401', 401, $r['http']);
$r = $api('/api/discord/codigo', [], $jA, false);
check('Sin la cabecera X-Envivo -> 403', 403, $r['http']);
$r = $apiGet('/api/discord/codigo', $jA);
check('Con GET -> 405', 405, $r['http']);
$r = $api('/api/discord/codigo', [], $jA);
$codA = (string) ($r['json']['codigo'] ?? '');
check('Con sesión -> código de 8 (sin letras confusas), 600 s, comando listo', [200, 1, 600, "/vincular codigo:$codA", false],
    [$r['http'], preg_match('/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/', $codA), $r['json']['segundos'] ?? null, $r['json']['comando'] ?? null, $r['json']['vinculado'] ?? null]);
si('…expira en 10 minutos', abs(strtotime((string) ($r['json']['expira'] ?? '')) - (time() + 600)) <= 5);
check('…en la base solo va el sha256 (el código no aparece)', [1, 0], [(int) $val('SELECT COUNT(*) FROM discord_codigos WHERE jugador_id = ?', [$A]), (int) $val("SELECT COUNT(*) FROM discord_codigos WHERE codigo_hash LIKE ?", ["%$codA%"])]);
$r2 = $api('/api/discord/codigo', [], $jA);
$codA2 = (string) ($r2['json']['codigo'] ?? '');
check('Pedir otro anula el anterior (queda 1)', [true, 1], [$codA2 !== $codA && strlen($codA2) === 8, (int) $val('SELECT COUNT(*) FROM discord_codigos WHERE jugador_id = ?', [$A])]);
for ($i = 0; $i < 2; $i++) $api('/api/discord/codigo', [], $jA);
$r = $api('/api/discord/codigo', [], $jA);
$r429 = $api('/api/discord/codigo', [], $jA);
check('Límite: el 6º código en 10 minutos -> 429 (el 5º sí sale)', [200, 429, 'demasiados'], [$r['http'], $r429['http'], $r429['json']['codigo'] ?? null]);
$codA = (string) $r['json']['codigo'];
$exec("UPDATE jugadores SET estado = 'suspendido' WHERE id = ?", [$F]);
$r = $api('/api/discord/codigo', [], $jF);
check('Cuenta suspendida -> 403 (no puede vincular)', 403, $r['http']);
$exec("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$F]);

// =====================================================================
titulo('3. /vincular de punta a punta (respuesta en < 3 s y roles en Discord)');
$exec("UPDATE jugadores SET fama_publica = 72 WHERE id = ?", [$A]);
$pdo->prepare('INSERT INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?)')->execute([$A, json_encode(['v' => 2, 'staff' => [], 'chapter' => 2, 'storyDone' => false, 'money' => 999999]), time()]);
$r = $interaccion($cmd('vincular', ['codigo' => 'ABC'], $U['ana']));
check('Código con formato malo -> mensaje solo para él (efímero), sin tocar nada', [200, 4, 64, true], [$r['http'], $r['json']['type'] ?? null, $r['json']['data']['flags'] ?? null, str_contains($texto($r['json']), '8 letras')]);
$r = $interaccion($cmd('vincular', ['codigo' => 'ZZZZ2222'], $U['ana']));
check('Código que no existe -> "no es válido o ya venció"', [4, 64, true], [$r['json']['type'] ?? null, $r['json']['data']['flags'] ?? null, str_contains($texto($r['json']), 'no es válido')]);
$m0 = $marca();
$falso(function (&$e) { $e['lento'] = 0.6; });   // Discord lento: igual se responde enseguida
$pA = $cmd('vincular', ['codigo' => strtolower(substr($codA, 0, 4)) . '-' . strtolower(substr($codA, 4))], $U['ana']);
$r = $interaccion($pA);
check('Código bueno (aunque lo escriba en minúsculas y con guion) -> "pensando..." efímero (tipo 5)', [200, ['type' => 5, 'data' => ['flags' => 64]]], [$r['http'], $r['json']]);
si('…y responde en menos de 1,5 s aunque Discord tarde (' . round($r['seg'], 2) . ' s)', $r['seg'] < 1.5);
$s = $seguimiento($pA);
$falso(function (&$e) { $e['lento'] = 0; });
si('…luego cambia el "pensando..." por el resultado (PATCH a la interacción, sin token del bot)', $s !== null && $s['auth'] === 'ninguna');
check('…el mensaje dice la productora, el servidor y los roles', [true, true, true, true],
    [str_contains((string) ($s['cuerpo']['content'] ?? ''), 'Andes Visión'), str_contains((string) ($s['cuerpo']['content'] ?? ''), 'Servidor 1 · Quito'),
     str_contains((string) ($s['cuerpo']['content'] ?? ''), '`Jugador verificado`'), ($s['cuerpo']['allowed_mentions'] ?? null) === ['parse' => []]]);
check('En Discord: Jugador verificado + Servidor 1; Español y Moderador siguen (no son del bot)', ['espanol', 'moderador', 's1', 'verificado'], $rolesDe($U['ana']));
$puts = array_values(array_filter($desde($m0), fn($l) => $l['metodo'] === 'PUT'));
check('…con el token del bot, motivo en el registro de auditoría y Content-Length 0', [true, 'Sincronización con EN VIVO Tycoon', true],
    [count($puts) === 2 && $puts[0]['auth'] === 'bot_ok' && $puts[1]['auth'] === 'bot_ok', $puts[0]['razon'] ?? null, ($puts[0]['largo'] ?? null) === '0']);
si('…User-Agent con el formato que pide Discord', str_starts_with((string) ($puts[0]['agente'] ?? ''), 'DiscordBot ('));
check('Vínculo guardado en la base (ana <-> jugador A), código usado', [$U['ana'], 1, null], [(string) $val('SELECT discord_user_id FROM discord_vinculos WHERE jugador_id = ?', [$A]),
    (int) $val('SELECT COUNT(*) FROM discord_codigos WHERE jugador_id = ? AND usado IS NOT NULL', [$A]), $val('SELECT sync_error FROM discord_vinculos WHERE jugador_id = ?', [$A]) ?: null]);
$r = $apiGet('/api/estado', $jA);
check('/api/estado: discord_vinculado true', true, $r['json']['discord_vinculado'] ?? null);
$r = $interaccion($cmd('vincular', ['codigo' => $codA], $U['beto']));
check('El mismo código otra vez (otro usuario) -> no sirve (un solo uso)', true, str_contains($texto($r['json']), 'no es válido'));

// B: comprador + VIP + presidente
$exec("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES (?, ?, 'creditos_250', 1.99, 1.73, 0.26, 'pagado', ?, ?)", [bin2hex(random_bytes(8)), $B, time(), time()]);
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400 * 20, $B]);
$exec("INSERT INTO asociaciones (servidor_id, nombre, nombre_clave, siglas, color, descripcion, ingreso, creado) VALUES (1, 'Los Pioneros', 'los pioneros', 'PIO', '#ff3b3b', '', 'abierto', ?)", [time()]);
$ASOC = (int) $pdo->lastInsertId();
$exec("INSERT INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, 'presidente', ?), (?, ?, 'socio', ?)", [$ASOC, $B, time(), $ASOC, $C, time()]);
$codB = $api('/api/discord/codigo', [], $jB)['json']['codigo'];
$pB = $cmd('vincular', ['codigo' => $codB], $U['beto'], 'en-US');
$r = $interaccion($pB);
$s = $seguimiento($pB);
check('Comprador + VIP + presidente -> los 5 roles', ['comprador', 'presidente', 's1', 'verificado', 'vip'], $rolesDe($U['beto']));
check('…VIP por DISCORD_ROLES_JSON (en Discord se llama "⭐ VIP"); "Presidente de Asociación" encontrado por nombre', true, in_array('vip', $rolesDe($U['beto']), true) && in_array('presidente', $rolesDe($U['beto']), true));
si('…respuesta en inglés (locale en-US)', str_contains((string) ($s['cuerpo']['content'] ?? ''), 'Your Discord is now linked'));

// Ya vinculado a otra productora
$codC = $api('/api/discord/codigo', [], $jC)['json']['codigo'];
$r = $interaccion($cmd('vincular', ['codigo' => $codC], $U['beto']));
check('Un Discord ya vinculado no puede tomar otra productora (y el código sigue sin usar)', [true, 0], [str_contains($texto($r['json']), 'otra productora'), (int) $val('SELECT COUNT(*) FROM discord_codigos WHERE jugador_id = ? AND usado IS NOT NULL', [$C])]);
$pC = $cmd('vincular', ['codigo' => $codC], $U['caro'], 'pt-BR');
$interaccion($pC);
$s = $seguimiento($pC);
check('Caro (socia, sin compras) -> verificado + servidor; mensaje en portugués', [['espanol', 's1', 'verificado'], true], [$rolesDe($U['caro']), str_contains((string) ($s['cuerpo']['content'] ?? ''), 'Pronto!')]);

// Usuario que no está en el servidor de Discord
$codF = $api('/api/discord/codigo', [], $jF)['json']['codigo'];
$pF = $cmd('vincular', ['codigo' => $codF], $U['fuera']);
$interaccion($pF);
$s = $seguimiento($pF);
check('No está en el servidor de Discord -> queda vinculado y avisa "únete" (se reintenta luego)', [true, 'no_en_servidor'],
    [str_contains((string) ($s['cuerpo']['content'] ?? ''), 'únete al servidor'), $val('SELECT sync_error FROM discord_vinculos WHERE jugador_id = ?', [$F])]);

// Revincular la productora con otra cuenta de Discord: la vieja pierde los roles
$codD = $api('/api/discord/codigo', [], $jD)['json']['codigo'];
$pD = $cmd('vincular', ['codigo' => $codD], $U['dani']); $interaccion($pD); $seguimiento($pD);
$codD2 = $api('/api/discord/codigo', [], $jD)['json']['codigo'];
$pD2 = $cmd('vincular', ['codigo' => $codD2], $U['nueva']); $interaccion($pD2); $seguimiento($pD2);
check('Revincular con otra cuenta de Discord: la nueva tiene los roles y la vieja ya no', [['s1', 'verificado'], [], $U['nueva']],
    [$rolesDe($U['nueva']), $rolesDe($U['dani']), (string) $val('SELECT discord_user_id FROM discord_vinculos WHERE jugador_id = ?', [$D])]);

// Fuerza bruta de códigos
$res = [];
for ($i = 0; $i < 9; $i++) $res[] = $interaccion($cmd('vincular', ['codigo' => 'QQQQ' . substr('23456789', $i % 8, 1) . 'QQQ'], $U['zeta']));
check('Límite /vincular: 8 intentos cada 10 minutos por usuario; el 9º -> "Demasiados intentos"', [true, true], [str_contains($texto($res[7]['json']), 'no es válido'), str_contains($texto($res[8]['json']), 'Demasiados intentos')]);
$codE = $api('/api/discord/codigo', [], $jE)['json']['codigo'];
$r = $interaccion($cmd('vincular', ['codigo' => $codE], $U['zeta']));
check('…ni con un código bueno mientras dura el bloqueo', true, str_contains($texto($r['json']), 'Demasiados intentos'));
$exec('UPDATE discord_codigos SET expira = ? WHERE jugador_id = ?', [time() - 1, $E]);
$r = $interaccion($cmd('vincular', ['codigo' => $codE], $U['eli']));
check('Código vencido (más de 10 minutos) -> no sirve', true, str_contains($texto($r['json']), 'ya venció'));

// Fuera del servidor oficial
$r = $interaccion($cmd('perfil', [], $U['ana'], 'es-ES', '999999999999999999'));
check('Comando desde otro servidor de Discord -> "solo funciona en el servidor oficial"', [4, 64, true], [$r['json']['type'] ?? null, $r['json']['data']['flags'] ?? null, str_contains($texto($r['json']), 'servidor oficial')]);
$r = $interaccion($cmd('perfil', [], $U['ana'], 'es-ES', ''));
check('…y por mensaje privado igual', true, str_contains($texto($r['json']), 'servidor oficial'));
$r = $interaccion($cmd('borrar_todo', [], $U['ana']));
check('Comando desconocido -> efímero', [4, 64], [$r['json']['type'] ?? null, $r['json']['data']['flags'] ?? null]);

// =====================================================================
titulo('4. /perfil, /ranking, /eventos, /ayuda e idiomas');
$r = $interaccion($cmd('perfil', [], $U['ana']));
$t = $texto($r['json']);
$campos = array_column($r['json']['data']['embeds'][0]['fields'] ?? [], 'value', 'name');
check('/perfil propio: público, con alias, servidor, fama y capítulo', [4, false, '🎥 Andes Visión', 'Servidor 1 · Quito', '⭐ 72', 'Sin asociación', 'Capítulo 3 · El gran lanzamiento'],
    [$r['json']['type'] ?? null, isset($r['json']['data']['flags']), $r['json']['data']['embeds'][0]['title'] ?? null, $campos['Servidor'] ?? null, $campos['Fama'] ?? null, $campos['Asociación'] ?? null, $campos['Historia'] ?? null]);
check('…nunca correo, nombre real, dinero ni compras; sin menciones', [false, false, false, false, true], [str_contains($t, $emailA), str_contains($t, 'Ana Torres'), str_contains($t, '999999'), str_contains($t, 'creditos_'), str_contains($t, '"allowed_mentions":{"parse":[]}')]);
$r = $interaccion($cmd('perfil', ['usuario' => $U['beto']], $U['ana'], 'es-ES', null, ['data' => ['options' => [['name' => 'usuario', 'type' => 6, 'value' => $U['beto']]]]]));
$campos = array_column($r['json']['data']['embeds'][0]['fields'] ?? [], 'value', 'name');
$t = $texto($r['json']);
check('/perfil de otro: asociación con siglas y cargo; nada de VIP ni compras', ['🎥 Beto Live', 'Los Pioneros [PIO] · Presidente', false, false, false],
    [$r['json']['data']['embeds'][0]['title'] ?? null, $campos['Asociación'] ?? null, str_contains($t, 'VIP'), str_contains($t, 'Comprador'), str_contains($t, $emailB)]);
$r = $interaccion($cmd('perfil', [], $U['zeta'], 'es-ES', null, ['data' => ['options' => [['name' => 'usuario', 'type' => 6, 'value' => $U['eli']]], 'resolved' => ['users' => [$U['eli'] => ['id' => $U['eli'], 'username' => 'eli', 'global_name' => 'Eli*']]]]]));
check('/perfil de alguien sin vincular -> efímero, con el nombre escapado', [64, true], [$r['json']['data']['flags'] ?? null, str_contains($texto($r['json']), 'Eli\\\\* todavía no vinculó')]);
$r = $interaccion($cmd('perfil', [], $U['zeta']));
check('/perfil propio sin vincular -> explica cómo vincular', true, str_contains($texto($r['json']), 'Vincular Discord'));
$r = $interaccion($cmd('perfil', [], $U['beto'], 'en-US'));
$campos = array_column($r['json']['data']['embeds'][0]['fields'] ?? [], 'value', 'name');
check('/perfil en inglés', ['Server', 'Fame', 'Alliance', 'Story'], array_keys($campos));

$exec("UPDATE jugadores SET fama_publica = 99, estado = 'baneado' WHERE id = ?", [$F]);
$r = $interaccion($cmd('ranking', [], $U['ana']));
$d = (string) ($r['json']['data']['embeds'][0]['description'] ?? '');
preg_match_all('/\*\*([^*]+)\*\* · ⭐ (\d+)/u', explode('Asociaciones', $d)[0], $mm);
check('/ranking: productoras del servidor por fama (las bloqueadas no salen)', ['Cumbre TV', 'Andes Visión', 'Eco Producciones', 'Beto Live', 'Delta Stream'], array_slice($mm[1], 0, 5));
check('…título con el servidor y top de asociaciones', [true, true], [str_contains((string) ($r['json']['data']['embeds'][0]['title'] ?? ''), 'Servidor 1 · Quito'), str_contains($d, '**Los Pioneros** [PIO] · ⭐ 128 · 2 miembros')]);
$exec("UPDATE jugadores SET estado = 'activo', fama_publica = 5 WHERE id = ?", [$F]);
$r = $interaccion($cmd('ranking', ['servidor' => 7], $U['ana']));
check('/ranking servidor:7 (no existe) -> efímero', 64, $r['json']['data']['flags'] ?? null);
$r = $interaccion($cmd('ranking', [], $U['zeta'], 'pt-BR'));
check('/ranking sin vincular usa el primer servidor (en portugués)', true, str_contains((string) ($r['json']['data']['embeds'][0]['title'] ?? ''), 'Ranking do Servidor 1'));

$r = $interaccion($cmd('eventos', [], $U['ana']));
$d = (string) ($r['json']['data']['embeds'][0]['description'] ?? '');
check('/eventos sin tabla de eventos: horario fijo con cuenta regresiva de Discord (<t:...:R>)', [4, 1, true], [$r['json']['type'] ?? null, preg_match('/<t:\d+:R>/', $d), str_contains($d, 'próximamente')]);
$manana = (new DateTimeImmutable('tomorrow', new DateTimeZone('America/Guayaquil')))->getTimestamp();
si('…la cuenta regresiva es a la medianoche de Ecuador', str_contains($d, "<t:$manana:R>"));
$pdo->exec('CREATE TABLE eventos_en_linea (id INTEGER PRIMARY KEY, nombre TEXT, inicio INTEGER, fin INTEGER)');
$exec('INSERT INTO eventos_en_linea (nombre, inicio, fin) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', ['Liga Semanal', time() - 3600, time() + 7200, 'Copa Planeta de Balompié', time() + 86400, time() + 90000, 'Evento viejo', time() - 9000, time() - 100]);
$r = $interaccion($cmd('eventos', [], $U['ana'], 'en-GB'));
$d = (string) ($r['json']['data']['embeds'][0]['description'] ?? '');
check('/eventos con tabla: el que está en curso y el próximo (no el que terminó), en inglés', [true, true, false, true], [str_contains($d, '🔴 **Liga Semanal** · live now'), str_contains($d, 'Copa Planeta de Balompié** · starts <t:'), str_contains($d, 'viejo'), str_contains($r['json']['data']['embeds'][0]['title'] ?? '', 'Online events')]);

$r = $interaccion($cmd('ayuda', [], $U['zeta'], 'es-419'));
$d = (string) ($r['json']['data']['embeds'][0]['description'] ?? '');
check('/ayuda (es-419): "Ayuda y soporte", correo de soporte y aviso de que nunca piden la clave; efímero', [true, true, true, 64],
    [str_contains($d, 'Ayuda y soporte'), str_contains($d, 'soporte@tukanec.com'), str_contains($d, '**nunca** te pedirá tu contraseña'), $r['json']['data']['flags'] ?? null]);
$en = $interaccion($cmd('ayuda', [], $U['zeta'], 'fr'))['json']['data']['embeds'][0]['description'] ?? '';
$pt = $interaccion($cmd('ayuda', [], $U['zeta'], 'pt-BR'))['json']['data']['embeds'][0]['description'] ?? '';
$es = $interaccion($cmd('ayuda', [], $U['zeta'], 'es-ES'))['json']['data']['embeds'][0]['description'] ?? '';
check('Idiomas: francés -> inglés; pt-BR -> portugués; es-ES -> español', [true, true, true], [str_contains($en, 'Help & support'), str_contains($pt, 'Ajuda e suporte'), str_contains($es, 'Ayuda y soporte')]);
$sinLoc = $cmd('ayuda', [], $U['zeta']); unset($sinLoc['locale'], $sinLoc['guild_locale']);
check('Sin idioma -> español', true, str_contains($texto($interaccion($sinLoc)['json']), 'Ayuda y soporte'));

// =====================================================================
titulo('5. Sincronización (bin/discord_sync.php)');
$m0 = $marca();
$r = $cli(["$SRV/bin/discord_sync.php"]);
check('Sin cambios: corre bien y no toca roles (solo revisa)', [0, 0], [$r['codigo'], count(array_filter($desde($m0), fn($l) => in_array($l['metodo'], ['PUT', 'DELETE'], true)))]);
si('…dice cuántos revisó', str_contains($r['salida'], 'discord_sync OK:'));
// VIP vence, compra nueva, presidente pasa a socio, cambio de servidor
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() - 60, $B]);
$exec("UPDATE asociacion_miembros SET cargo = 'socio' WHERE jugador_id = ?", [$B]);
$exec("UPDATE asociacion_miembros SET cargo = 'presidente' WHERE jugador_id = ?", [$C]);
$exec("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES (?, ?, 'vip30', 4.99, 4.34, 0.65, 'pagado', ?, ?)", [bin2hex(random_bytes(8)), $A, time(), time()]);
$exec("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado) VALUES (?, ?, 'creditos_250', 1.99, 1.73, 0.26, 'pendiente', ?)", [bin2hex(random_bytes(8)), $C, time()]);
$exec("INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (2, 'Servidor 2 · Guayaquil', 1000, 1, ?)", [time()]);
$exec('UPDATE jugadores SET servidor_id = 2 WHERE id = ?', [$D]);
$m0 = $marca();
$r = $cli(["$SRV/bin/discord_sync.php", '--detalle']);
check('VIP vencido y ya no es presidente -> se le quitan VIP y Presidente', ['comprador', 's1', 'verificado'], $rolesDe($U['beto']));
check('Compra nueva -> Comprador verificado (Español y Moderador intactos)', ['comprador', 'espanol', 'moderador', 's1', 'verificado'], $rolesDe($U['ana']));
check('Nueva presidenta -> Presidente; compra pendiente NO cuenta', ['espanol', 'presidente', 's1', 'verificado'], $rolesDe($U['caro']));
check('Cambio de servidor del juego -> Servidor 2 (rol "Servidor 2 - Guayaquil" encontrado igual) y sin Servidor 1', ['s2', 'verificado'], $rolesDe($U['nueva']));
check('…en la salida: "4 con cambios" y el detalle', [true, true], [str_contains($r['salida'], '4 con cambios'), str_contains($r['salida'], '+Comprador verificado')]);
check('…con el motivo en el registro de auditoría de Discord', 'Sincronización con EN VIVO Tycoon', array_values(array_filter($desde($m0), fn($l) => $l['metodo'] === 'DELETE'))[0]['razon'] ?? null);
// Alguien quita un rol a mano: --todos lo repone
$falso(function (&$e) use ($U, $R) { $e['miembros'][$U['ana']] = array_values(array_diff($e['miembros'][$U['ana']], [$R['verificado']])); });
$r = $cli(["$SRV/bin/discord_sync.php", '--todos']);
check('--todos repone un rol quitado a mano', true, in_array('verificado', $rolesDe($U['ana']), true));
// El que no estaba en el servidor entra: a la hora se reintenta
$falso(function (&$e) use ($U) { $e['miembros'][$U['fuera']] = []; });
$cli(["$SRV/bin/discord_sync.php"]);
check('No estaba en el servidor: no se reintenta en cada vuelta (cada hora)', [], $rolesDe($U['fuera']));
$exec('UPDATE discord_vinculos SET sincronizado = ? WHERE jugador_id = ?', [time() - 3700, $F]);
$cli(["$SRV/bin/discord_sync.php"]);
check('…pasada la hora, ya tiene sus roles y sin error', [['s1', 'verificado'], null], [$rolesDe($U['fuera']), $val('SELECT sync_error FROM discord_vinculos WHERE jugador_id = ?', [$F]) ?: null]);
// Cuenta bloqueada: pierde los roles
$exec("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$F]);
$r = $cli(["$SRV/bin/discord_sync.php", "--jugador=$F"]);
check('Cuenta bloqueada -> --jugador le quita todos los roles del juego', [0, []], [$r['codigo'], $rolesDe($U['fuera'])]);
$exec("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$F]);
// Falta un rol en el servidor de Discord / sin permiso -> aviso en el panel
$falso(function (&$e) use ($R) { $e['roles'] = array_values(array_filter($e['roles'], fn($x) => $x['id'] !== $R['comprador'])); });
$exec("DELETE FROM discord_ajustes WHERE clave = 'roles_guild'");
$exec("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES (?, ?, 'creditos_250', 1.99, 1.73, 0.26, 'pagado', ?, ?)", [bin2hex(random_bytes(8)), $C, time(), time()]);
$cli(["$SRV/bin/discord_sync.php"]);
check('Falta el rol "Comprador verificado" en Discord -> error guardado y aviso para el panel (sin romper lo demás)', ['roles_faltantes:Comprador verificado', 1, true],
    [$val('SELECT sync_error FROM discord_vinculos WHERE jugador_id = ?', [$C]), (int) $val("SELECT COUNT(*) FROM avisos WHERE tipo = 'discord_roles_faltantes'"), in_array('presidente', $rolesDe($U['caro']), true)]);
$falso(function (&$e) use ($roles) { $e['roles'] = $roles; $e['prohibir_roles'] = true; });
$exec("DELETE FROM discord_ajustes WHERE clave = 'roles_guild'");
$exec('UPDATE discord_vinculos SET sincronizado = ? WHERE jugador_id = ?', [time() - 3700, $C]);
$cli(["$SRV/bin/discord_sync.php"]);
check('Rol del bot por debajo (403 Missing Permissions) -> error sin_permiso + aviso con la explicación', ['sin_permiso', 1],
    [$val('SELECT sync_error FROM discord_vinculos WHERE jugador_id = ?', [$C]), (int) $val("SELECT COUNT(*) FROM avisos WHERE tipo = 'discord_sin_permiso' AND detalle LIKE '%ARRIBA%'")]);
$falso(function (&$e) { $e['prohibir_roles'] = false; });
$exec('UPDATE discord_vinculos SET sincronizado = ? WHERE jugador_id = ?', [time() - 3700, $C]);
$cli(["$SRV/bin/discord_sync.php"]);
check('…arreglado el permiso, la siguiente vuelta pone el rol', [true, null], [in_array('comprador', $rolesDe($U['caro']), true), $val('SELECT sync_error FROM discord_vinculos WHERE jugador_id = ?', [$C]) ?: null]);
// Dos a la vez: la segunda no hace nada
$h = fopen("$TMP/datos/discord_sync.lock", 'c'); flock($h, LOCK_EX);
$r = $cli(["$SRV/bin/discord_sync.php"]);
flock($h, LOCK_UN); fclose($h);
check('Si otra sincronización sigue corriendo, sale sin hacer nada', [0, true], [$r['codigo'], str_contains($r['salida'], 'otra sincronización')]);
$r = $cli(["$SRV/bin/discord_sync.php"], ['ENVIVO_CONFIG' => "$TMP/config_sin.env"]);
check('Sin configuración de Discord: "no está configurado" y sale con 0', [0, true], [$r['codigo'], str_contains($r['salida'], 'no está configurado')]);

// =====================================================================
titulo('6. Límites de Discord (429, global, X-RateLimit-Remaining: 0) y errores');
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400, $B]);
$falso(function (&$e) { $e['limitar'] = 2; $e['limitar_ra'] = 0.4; $e['limitar_global'] = false; });
$m0 = $marca(); $t0 = microtime(true);
$r = $cli(["$SRV/bin/discord_sync.php", "--jugador=$B"]);
$t1 = microtime(true) - $t0;
$l = $desde($m0);
check('429 dos veces: espera retry_after y reintenta; al final pone el VIP', [0, [429, 429], true], [$r['codigo'], array_slice(array_column($l, 'codigo'), 0, 2), in_array('vip', $rolesDe($U['beto']), true)]);
si('…esperó de verdad (≥ 0,8 s: ' . round($t1, 2) . ' s) y avisa en el registro', $t1 >= 0.8 && str_contains($r['error'], 'límite de Discord (429)'));
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() - 60, $B]);
$falso(function (&$e) { $e['limitar'] = 1; $e['limitar_ra'] = 0.5; $e['limitar_global'] = true; });
$m0 = $marca();
$r = $cli(["$SRV/bin/discord_sync.php", "--jugador=$B"]);
$l = $desde($m0);
si('429 GLOBAL: espera y sigue (quita el VIP)', $r['codigo'] === 0 && ($l[0]['codigo'] ?? 0) === 429 && !in_array('vip', $rolesDe($U['beto']), true) && str_contains($r['error'], 'global') && ($l[1]['t'] - $l[0]['t']) >= 0.45);
// X-RateLimit-Remaining: 0 -> espera antes de la siguiente llamada a la MISMA ruta
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400, $B]);
$exec("UPDATE asociacion_miembros SET cargo = 'presidente' WHERE jugador_id = ?", [$B]);
$falso(function (&$e) { $e['remaining0'] = 2; $e['reset_after'] = 0.6; });
$m0 = $marca();
$cli(["$SRV/bin/discord_sync.php", "--jugador=$B"]);
$puts = array_values(array_filter($desde($m0), fn($x) => $x['metodo'] === 'PUT'));
si('Remaining 0 -> la 2ª llamada a la misma ruta espera Reset-After (' . round(($puts[1]['t'] ?? 0) - ($puts[0]['t'] ?? 0), 2) . ' s ≥ 0,55)', count($puts) === 2 && $puts[1]['t'] - $puts[0]['t'] >= 0.55);
// Error 500 una vez: reintenta
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() - 60, $B]);
$falso(function (&$e) { $e['fallar_500'] = 1; });
$r = $cli(["$SRV/bin/discord_sync.php", "--jugador=$B"]);
check('Discord falla una vez (500) -> reintenta y sale bien', [0, false], [$r['codigo'], in_array('vip', $rolesDe($U['beto']), true)]);
// 429 que pide esperar demasiado durante un comando: no se queda colgado
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400, $B]);
$falso(function (&$e) { $e['limitar'] = 1; $e['limitar_ra'] = 120; $e['limitar_global'] = false; });
$t0 = microtime(true);
$r = $cli(["$SRV/bin/discord_sync.php", "--jugador=$B"]);
check('429 con retry_after 120 s (más que el tope de 60) -> no espera: lo deja para la próxima vuelta', [1, true, true], [$r['codigo'], microtime(true) - $t0 < 5, str_contains($r['salida'], 'problema: discord')]);
$falso(function (&$e) { $e['limitar'] = 0; });

// El PATCH de la respuesta falla (500 dos veces): se registra sin el token de la interacción
$codE = $api('/api/discord/codigo', [], $jE)['json']['codigo'];
$falso(function (&$e) { $e['fallar_500'] = 0; });
$pE = $cmd('vincular', ['codigo' => $codE], $U['eli']);
$falso(function (&$e) { $e['fallar_webhook'] = true; });
$r = $interaccion($pE);
for ($i = 0; $i < 80 && !str_contains((string) @file_get_contents("$TMP/app.log"), 'webhooks/{id}/T/messages/@original'); $i++) usleep(100000);
$falso(function (&$e) { $e['fallar_webhook'] = false; });
check('Si no se puede editar la respuesta (Discord 500 dos veces), el vínculo y los roles igual quedan y se registra', [5, ['s1', 'verificado'], true],
    [$r['json']['type'] ?? null, $rolesDe($U['eli']), str_contains((string) file_get_contents("$TMP/app.log"), 'Discord no respondió bien (500) en PATCH /api/v10/webhooks/{id}/T/messages/@original')]);

// =====================================================================
titulo('7. /desvincular (Discord) y desde el juego');
$m0 = $marca();
$pX = $cmd('desvincular', [], $U['caro']);
$r = $interaccion($pX);
$s = $seguimiento($pX);
check('/desvincular -> "pensando..." efímero, luego confirma; quita SOLO los roles del juego', [['type' => 5, 'data' => ['flags' => 64]], true, ['espanol']],
    [$r['json'], str_contains((string) ($s['cuerpo']['content'] ?? ''), 'ya no está vinculado'), $rolesDe($U['caro'])]);
check('…sin vínculo en la base; /api/estado false', [0, false], [(int) $val('SELECT COUNT(*) FROM discord_vinculos WHERE jugador_id = ?', [$C]), $apiGet('/api/estado', $jC)['json']['discord_vinculado'] ?? null]);
$r = $interaccion($cmd('desvincular', [], $U['caro']));
check('/desvincular sin vínculo -> efímero, explica cómo vincular', [4, 64], [$r['json']['type'] ?? null, $r['json']['data']['flags'] ?? null]);
$r = $api('/api/discord/desvincular', [], $jB);
check('POST /api/discord/desvincular (juego) -> quita vínculo y roles', [200, true, []], [$r['http'], $r['json']['desvinculado'] ?? null, $rolesDe($U['beto'])]);
$r = $api('/api/discord/desvincular', [], $jB);
check('…otra vez: desvinculado false (no falla)', [200, false], [$r['http'], $r['json']['desvinculado'] ?? null]);

// =====================================================================
titulo('8. Anuncios por webhook (Discord::anunciar)');
$m0 = $marca();
$r = $php('echo json_encode([
  Discord::anunciar("anuncios", "¡Nueva temporada! @everyone"),
  Discord::anunciarEvento("Desafío Técnico del Día", time() + 3600, time() + 7200, "Transmite con 4 cámaras."),
  Discord::anunciarMantenimiento("Actualizamos el servidor.", time() + 1800),
  Discord::anunciar("anuncios", "Ganó la compra de jugador9@prueba.example"),
  Discord::anunciar("anuncios", "Escríbenos al 0991234567"),
  Discord::anunciar("otro", "hola"),
  Discord::anunciar("anuncios", ["embeds" => [Discord::embed("Resultados", "1. Cumbre TV", ["Liga" => "Semana 1"])]]),
]);');
check('anunciar: texto, evento, mantenimiento OK; con correo o teléfono NO; canal desconocido NO; embed OK', [true, true, true, false, false, false, true], json_decode(trim($r['salida']), true));
$l = $desde($m0);
check('…4 publicaciones, cada una a su webhook, sin token del bot', [4, ['ninguna'], [$huella($WH['anuncios'][1]), $huella($WH['eventos'][1]), $huella($WH['estado'][1])]],
    [count($l), array_values(array_unique(array_column($l, 'auth'))), [explode('/', $l[0]['ruta'])[5] ?? '', explode('/', $l[1]['ruta'])[5] ?? '', explode('/', $l[2]['ruta'])[5] ?? '']]);
check('…sin menciones (ni @everyone) y el evento con cuenta regresiva', [['parse' => []], 1], [$l[0]['cuerpo']['allowed_mentions'] ?? null, preg_match('/<t:\d+:R>/', (string) ($l[1]['cuerpo']['embeds'][0]['description'] ?? ''))]);
file_put_contents("$TMP/config_sinwh.env", $config(['DISCORD_WEBHOOK_ANUNCIOS' => null, 'DISCORD_WEBHOOK_EVENTOS' => 'https://ejemplo.com/webhooks/1/abc']));
$r = $php('echo json_encode([Discord::anunciar("anuncios", "hola"), Discord::anunciar("eventos", "hola")]);', ['ENVIVO_CONFIG' => "$TMP/config_sinwh.env"]);
check('Sin webhook, o con una dirección que no es de Discord -> false (no manda nada)', [false, false], json_decode(trim($r['salida']), true));

// =====================================================================
titulo('9. Registro de comandos (bin/discord_comandos.php)');
$r = $cli(["$SRV/bin/discord_comandos.php", '--mostrar']);
$cmds = json_decode($r['salida'], true);
$nombres = array_column($cmds ?: [], 'name');
check('--mostrar: 6 comandos', ['vincular', 'desvincular', 'perfil', 'ranking', 'eventos', 'ayuda'], $nombres);
$malos = [];
foreach ($cmds ?: [] as $c) {
    $todos = array_merge([$c['name']], array_values($c['name_localizations']));
    foreach ($c['options'] ?? [] as $o) $todos = array_merge($todos, [$o['name']], array_values($o['name_localizations'] ?? []));
    foreach ($todos as $x) if (!preg_match('/^[-_\p{Ll}\p{N}]{1,32}$/u', $x)) $malos[] = $x;
    foreach (array_merge([$c['description']], array_values($c['description_localizations']), array_column($c['options'] ?? [], 'description')) as $x) if (mb_strlen($x) < 1 || mb_strlen($x) > 100) $malos[] = $x;
    foreach (['es-ES', 'en-US', 'pt-BR'] as $loc) if (!isset($c['name_localizations'][$loc], $c['description_localizations'][$loc])) $malos[] = $c['name'] . ':' . $loc;
}
check('Nombres válidos para Discord (minúsculas, ≤32), descripciones ≤100, en es-ES / en-US / pt-BR', [], $malos);
check('Nombres en inglés y portugués', [['link', 'unlink', 'profile', 'ranking', 'events', 'help'], 'ajuda'], [array_column(array_column($cmds, 'name_localizations'), 'en-US'), $cmds[5]['name_localizations']['pt-BR'] ?? null]);
check('Solo en servidores (contexts [0]); /vincular con opción codigo obligatoria; /perfil con usuario (tipo 6)', [[0], true, 6], [$cmds[0]['contexts'] ?? null, $cmds[0]['options'][0]['required'] ?? null, $cmds[2]['options'][0]['type'] ?? null]);
$m0 = $marca();
$r = $cli(["$SRV/bin/discord_comandos.php"]);
$l = $desde($m0);
check('Registrar: PUT /applications/{id}/commands con el token del bot -> "Listo: 6 comandos"', [0, 'PUT', "/api/v10/applications/$APP/commands", 'bot_ok', 6, true],
    [$r['codigo'], $l[0]['metodo'] ?? null, $l[0]['ruta'] ?? null, $l[0]['auth'] ?? null, count($l[0]['cuerpo'] ?? []), str_contains($r['salida'], 'Listo: 6 comandos registrados globales')]);
$m0 = $marca();
$r = $cli(["$SRV/bin/discord_comandos.php", '--servidor']);
check('--servidor -> /applications/{id}/guilds/{guild}/commands', "/api/v10/applications/$APP/guilds/$GUILD/commands", $desde($m0)[0]['ruta'] ?? null);
$TOKEN_MALO = 'MT' . $azar(24) . '.' . $azar(6) . '.' . $azar(38);
$SECRETOS[] = $TOKEN_MALO;
file_put_contents("$TMP/config_malo.env", $config(['DISCORD_BOT_TOKEN' => $TOKEN_MALO]));
$r = $cli(["$SRV/bin/discord_comandos.php"], ['ENVIVO_CONFIG' => "$TMP/config_malo.env"]);
check('Token equivocado -> error 401 con la pista (sin mostrar el token)', [1, true, false], [$r['codigo'], str_contains($r['error'], 'Discord respondió 401') && str_contains($r['error'], 'Reset Token'), str_contains($r['salida'] . $r['error'], $TOKEN_MALO)]);
$r = $cli(["$SRV/bin/discord_comandos.php"], ['ENVIVO_CONFIG' => "$TMP/config_sin.env"]);
check('Sin configuración -> error claro', [1, true], [$r['codigo'], str_contains($r['error'], 'faltan DISCORD_APP_ID')]);

// =====================================================================
titulo('10. nginx + php-fpm (si hay en esta máquina)');
$fpm = trim((string) shell_exec('command -v php-fpm8.3 || command -v php-fpm'));
$nginx = trim((string) shell_exec('command -v nginx'));
if ($fpm !== '' && $nginx !== '' && is_file("$SRV/deploy/nginx-sitio.sh")) {
    $NG = "$TMP/nginx"; @mkdir("$NG/logs", 0777, true); @mkdir("$NG/tmp", 0777, true);
    $APPN = "$TMP/app"; @mkdir("$APPN/server", 0777, true);
    exec('cp -r ' . escapeshellarg("$TMP/srv/src") . ' ' . escapeshellarg("$TMP/srv/public") . ' ' . escapeshellarg("$APPN/server/") . ' && chmod -R a+rX ' . escapeshellarg($TMP));
    $sitio = (string) file_get_contents("$SRV/deploy/nginx-sitio.sh");
    $anclaN = '    location = /terminos.html';
    if (str_contains($sitio, 'location = /discord/interacciones {')) {   // la plantilla ya trae el bloque (integrado)
        check('nginx-sitio.sh (de hoy) ya trae el bloque del bot (una vez)', 1, substr_count($sitio, 'location = /discord/interacciones'));
        file_put_contents("$NG/nginx-sitio.sh", $sitio);
    } else {
        check('nginx-sitio.sh (de hoy) tiene el lugar del bloque de nginx', 1, substr_count($sitio, $anclaN));
        file_put_contents("$NG/nginx-sitio.sh", str_replace($anclaN, $bloque('nginx') . "\n" . $anclaN, $sitio));
    }
    file_put_contents("$TMP/config_nginx.env", str_replace("ENVIVO_URL=http://127.0.0.1:$P_APP", "ENVIVO_URL=http://127.0.0.1:$P_NGINX", (string) file_get_contents("$TMP/config.env")));
    touch("$TMP/php_errores.log"); chmod("$TMP/php_errores.log", 0666); chmod("$TMP/datos", 0777); foreach (glob("$TMP/datos/*") as $f) @chmod($f, 0666); chmod("$TMP/config_nginx.env", 0644);
    $usr = posix_geteuid() === 0 ? "user = nobody\ngroup = nogroup\n" : '';
    file_put_contents("$NG/fpm.conf", "[global]\npid = $TMP/fpm.pid\nerror_log = $NG/logs/fpm.log\ndaemonize = yes\n[envivo]\nlisten = $NG/fpm.sock\nlisten.mode = 0666\npm = static\npm.max_children = 3\nclear_env = no\n"
        . "env[ENVIVO_CONFIG] = $TMP/config_nginx.env\nphp_admin_value[error_log] = $TMP/php_errores.log\nphp_admin_flag[log_errors] = on\n$usr");
    exec(escapeshellarg($fpm) . ' -y ' . escapeshellarg("$NG/fpm.conf") . ' -R 2> ' . escapeshellarg("$NG/logs/fpm-arranque.log"));
    exec('DOMINIO=juego.tukanec.com APP=' . escapeshellarg($APPN) . ' SOCK=' . escapeshellarg("$NG/fpm.sock") . ' LISTEN=127.0.0.1:' . $P_NGINX . ' IPV6=0 bash ' . escapeshellarg("$NG/nginx-sitio.sh") . ' > ' . escapeshellarg("$NG/sitio.conf"));
    file_put_contents("$NG/nginx.conf", "worker_processes 1;\npid $TMP/nginx.pid;\nerror_log $NG/logs/error.log;\nevents { worker_connections 64; }\nhttp {\n  include /etc/nginx/mime.types;\n  access_log off;\n"
        . "  client_body_temp_path $NG/tmp; fastcgi_temp_path $NG/tmp; proxy_temp_path $NG/tmp; uwsgi_temp_path $NG/tmp; scgi_temp_path $NG/tmp;\n"
        // Las zonas de límite que usa la plantilla (en el VPS: /etc/nginx/conf.d/envivo-limites.conf, lo copia instalar.sh)
        . "  include $SRV/deploy/ops/nginx-envivo-limites.conf;\n  include $NG/sitio.conf;\n}\n");
    exec('nginx -t -q -c ' . escapeshellarg("$NG/nginx.conf") . ' -p ' . escapeshellarg($NG) . ' 2> ' . escapeshellarg("$NG/logs/t.log"), $o, $c);
    check('nginx -t acepta el sitio con el bloque del bot', 0, $c);
    exec('nginx -c ' . escapeshellarg("$NG/nginx.conf") . ' -p ' . escapeshellarg($NG) . ' 2>> ' . escapeshellarg("$NG/logs/t.log"));
    $esperar("http://127.0.0.1:$P_NGINX/");
    $NB = "http://127.0.0.1:$P_NGINX";
    check('nginx: GET /discord/interacciones llega a PHP (405); otras rutas 404', [405, 404, 404, 404],
        [$http('GET', "$NB/discord/interacciones")['http'], $http('GET', "$NB/discord/otra")['http'], $http('GET', "$NB/server/public/discord/interacciones.php")['http'], $http('GET', "$NB/server/src/Discord.php")['http']]);
    $r = $interaccion($ping, ['url' => "$NB/discord/interacciones"]);
    check('nginx + php-fpm: PING firmado -> PONG; firma mala -> 401', [200, ['type' => 1], 401], [$r['http'], $r['json'], $interaccion($ping, ['url' => "$NB/discord/interacciones", 'firma' => str_repeat('ab', 64)])['http']]);
    $codE2 = $api('/api/discord/codigo', [], $jC)['json']['codigo'];
    $falso(function (&$e) { $e['lento'] = 1.0; });
    $pN = $cmd('vincular', ['codigo' => $codE2], $U['caro']);
    $r = $interaccion($pN, ['url' => "$NB/discord/interacciones"]);
    $s = $seguimiento($pN, 20);
    $falso(function (&$e) { $e['lento'] = 0; });
    si('php-fpm: "pensando..." en ' . round($r['seg'], 2) . ' s aunque Discord tarde 1 s por llamada (fastcgi_finish_request) y después el resultado', ($r['json']['type'] ?? 0) === 5 && $r['seg'] < 0.9 && $s !== null);
    check('…y la vinculó con sus roles (presidenta y compradora)', ['comprador', 'espanol', 'presidente', 's1', 'verificado'], $rolesDe($U['caro']));
} else {
    echo "  (sin nginx o php-fpm en esta máquina: se salta)\n";
}

// =====================================================================
titulo('11. Ningún token en registros, salidas ni en la base');
usleep(300000);
$SECRETOS = array_merge($SECRETOS, $INTER);
$archivos = array_filter(array_merge(glob("$TMP/*.log") ?: [], glob("$TMP/nginx/logs/*.log") ?: [], ["$TMP/falso_estado.json"]), 'is_file');
$volcado = '';
foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN) as $t) {
    foreach ($pdo->query('SELECT * FROM "' . $t . '"')->fetchAll() as $f) $volcado .= json_encode($f, JSON_UNESCAPED_UNICODE) . "\n";
}
file_put_contents("$TMP/volcado_base.txt", $volcado);
$archivos[] = "$TMP/volcado_base.txt";
foreach (glob("$TMP/datos/*") ?: [] as $f) $archivos[] = $f;   // también el archivo SQLite y su WAL tal cual
$fugas = [];
foreach ($archivos as $f) { $c = (string) file_get_contents($f); foreach ($SECRETOS as $s) if (str_contains($c, $s)) $fugas[] = basename($f) . ' contiene ' . substr($s, 0, 6) . '…'; }
check('Ni el token del bot, ni los de los webhooks, ni los de ' . count($INTER) . ' interacciones aparecen en ' . count($archivos) . ' archivos', [], array_values(array_unique($fugas)));
$app = (string) file_get_contents("$TMP/app.log") . (string) @file_get_contents("$TMP/php_errores.log") . (string) file_get_contents("$TMP/salidas.log");
si('…y sí hubo registros que revisar (errores y límites de Discord, con la ruta pero sin el token)', str_contains($app, 'EN VIVO discord:') && str_contains($app, 'límite de Discord') && str_contains($app, '/webhooks/{id}/T/'));
$r = $php('echo Discord::ocultar("Authorization: Bot " . Config::get("DISCORD_BOT_TOKEN") . " /webhooks/123456789/abcDEF_ghi-jkl0123456789 " . Config::get("DISCORD_WEBHOOK_ESTADO"));');
check('Discord::ocultar tapa token, tokens de webhooks y de interacciones', [false, false, true], [str_contains($r['salida'], $TOKEN), str_contains($r['salida'], $WH['estado'][1]), str_contains($r['salida'], '/webhooks/123456789/[oculto]')]);
check('En la base no hay códigos en texto (solo sha256 de 64)', 0, (int) $val("SELECT COUNT(*) FROM discord_codigos WHERE length(codigo_hash) <> 64"));

echo "\n" . str_repeat('=', 60) . "\npruebas_discord.php: $ok correctas, $fallas fallas\n";
exit($fallas === 0 ? 0 : 1);
