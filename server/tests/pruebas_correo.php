<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Correo y "¿Olvidaste tu contraseña?" (server/INTEGRAR_CORREO.md):
//  1. Plantillas en 10 idiomas, nombre escapado, idioma del encabezado Accept-Language.
//  2. Correo sin SMTP (modo registro: archivo) y con un SMTP FALSO (server/tests/smtp_falso.php): sin cifrar (127.0.0.1),
//     STARTTLS y SSL con un certificado de prueba hecho aquí, AUTH PLAIN y LOGIN, clave mala, destinatario rechazado,
//     "ninguna" prohibido hacia afuera, punto al inicio de línea, encabezados MIME.
//  3. Por HTTP (php -S + server/tests/router.php, como nginx): misma respuesta exista o no la cuenta, enlace de un solo
//     uso (solo el sha256 en la base), 30 minutos, límites por correo y por IP, cuenta baneada, cambio de clave que cierra
//     TODAS las sesiones y abre una nueva aquí, dos cambios a la vez, aviso de "tu clave cambió", /recuperar.html.
//  4. De punta a punta con el SMTP falso: el pedido por HTTP llega como correo con el enlace.
// Uso:  php server/tests/pruebas_correo.php        (GUARDAR_TMP=1 para dejar los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_correo_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr((string) strrchr((string) stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; };
$P_APP = (int) (getenv('P_APP') ?: $puerto()); $P_APP2 = $puerto();
$P_SMTP = $puerto(); $P_LOGIN = $puerto(); $P_TLS = $puerto(); $P_SSL = $puerto();
$base = "ENVIVO_ZONA=America/Guayaquil\nSOPORTE_CORREO=soporte@prueba.example\n";
file_put_contents("$TMP/config.env", "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:$P_APP\nCORREO_REGISTRO=$TMP/correos.log\n$base");
$smtp = fn(array $x) => "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo2.sqlite\nENVIVO_URL=http://127.0.0.1:$P_APP2\n$base" . implode("\n", array_map(fn($k, $v) => "$k=$v", array_keys($x), $x)) . "\n";
$smtpBase = ['SMTP_HOST' => '127.0.0.1', 'SMTP_PORT' => $P_SMTP, 'SMTP_SEGURIDAD' => 'ninguna', 'SMTP_USUARIO' => 'envivo', 'SMTP_CLAVE' => 'clave-smtp-prueba', 'SMTP_DE' => 'no-responder@prueba.example'];
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Correo, CorreoPlantillas, Cuentas, Db};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
$PROCS = [];
$arrancar = function (array $cmd, array $env, string $log) use (&$PROCS, $RAIZ) {
    $p = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tub, $RAIZ, $env + ['PATH' => getenv('PATH')]);
    $PROCS[] = $p;
    return $p;
};
$esperarPuerto = function (int $p): bool { for ($k = 0; $k < 80; $k++) { $s = @fsockopen('127.0.0.1', $p); if ($s) { fclose($s); return true; } usleep(100000); } return false; };
/** Líneas JSON de un archivo (espera hasta $n líneas, máximo 4 s). */
$lineas = function (string $f, int $n = 0): array {
    for ($k = 0; $k < 40; $k++) {
        $l = is_file($f) ? array_values(array_filter(explode("\n", (string) file_get_contents($f)))) : [];
        if (count($l) >= $n) return array_map(fn($x) => json_decode($x, true), $l);
        usleep(100000);
    }
    return array_map(fn($x) => json_decode($x, true), $l);
};
$fin = function () use (&$PROCS, $TMP) {
    foreach ($PROCS as $p) { @proc_terminate($p); @proc_close($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
};
register_shutdown_function($fin);

Db::pdo();

// =====================================================================
titulo('1. Plantillas (10 idiomas) e idioma');
check('Idiomas: pt -> pt-BR, zh-TW -> zh-CN, en-US -> en, xx -> es, vacío -> es', ['pt-BR', 'zh-CN', 'en', 'es', 'es', 'de'],
    [CorreoPlantillas::idioma('pt'), CorreoPlantillas::idioma('zh-TW'), CorreoPlantillas::idioma('en-US'), CorreoPlantillas::idioma('xx'), CorreoPlantillas::idioma(''), CorreoPlantillas::idioma('DE')]);
check('Accept-Language: el primero que el juego tenga', ['fr', 'es', 'pt-BR', 'es'],
    [CorreoPlantillas::idiomaDeCabecera('xx-YY, fr-CA;q=0.8, en;q=0.5'), CorreoPlantillas::idiomaDeCabecera('es-EC,es;q=0.9'), CorreoPlantillas::idiomaDeCabecera('pt-PT'), CorreoPlantillas::idiomaDeCabecera('')]);
$enl = 'http://127.0.0.1/recuperar.html#t=' . str_repeat('a', 64);
$asuntos = []; $bien = 0;
foreach (CorreoPlantillas::IDIOMAS as $i) {
    $c = CorreoPlantillas::armar('recuperar', $i, ['nombre' => 'Ana', 'enlace' => $enl, 'min' => 30]);
    $c2 = CorreoPlantillas::armar('clave_cambiada', $i, ['nombre' => 'Ana', 'fecha' => '2026-10-23 10:00']);
    $asuntos[] = $c['asunto'];
    if (str_contains($c['html'], htmlspecialchars($enl)) && str_contains($c['texto'], $enl) && str_contains($c['texto'], '30') && str_contains($c['html'], 'lang="' . $i . '"')
        && str_contains($c2['texto'], '2026-10-23 10:00') && str_contains($c['texto'], 'soporte@prueba.example') && !preg_match('/\{\w+\}/', $c['texto'] . $c2['texto'])) $bien++;
}
check('Las 10 plantillas: enlace en HTML y texto, minutos, soporte, sin {marcadores} sueltos', 10, $bien);
check('10 asuntos distintos (uno por idioma), con la marca', [10, 10], [count(array_unique($asuntos)), count(array_filter($asuntos, fn($a) => str_contains($a, 'EN VIVO Tycoon')))]);
$c = CorreoPlantillas::armar('recuperar', 'es', ['nombre' => '<b>Ana & "Co"</b>', 'enlace' => $enl, 'min' => 30]);
check('El nombre del jugador va escapado en el HTML', [true, false], [str_contains($c['html'], '&lt;b&gt;Ana &amp; &quot;Co&quot;&lt;/b&gt;'), str_contains($c['html'], '<b>Ana')]);
check('Asunto en español', 'Recupera tu contraseña de EN VIVO Tycoon', $c['asunto']);
check('Encabezado no ASCII en =?UTF-8?B?...?= (y se lee igual)', 'Subject: Recupera tu contraseña de EN VIVO Tycoon', iconv_mime_decode('Subject: ' . Correo::encabezado($c['asunto']), 0, 'UTF-8'));

// =====================================================================
titulo('2a. Sin SMTP: modo registro (archivo)');
check('Modo registro sin SMTP_HOST', ['registro', false], [Correo::modo(), Correo::configurado()]);
check('enviar() escribe una línea en CORREO_REGISTRO', [true, 1, 'ana@prueba.example', 'Hola'], (function () use ($TMP, $lineas) {
    $ok = Correo::enviar('ana@prueba.example', 'Hola', '<p>x</p>', 'x');
    $l = $lineas("$TMP/correos.log", 1);
    return [$ok, count($l), $l[0]['para'] ?? null, $l[0]['asunto'] ?? null];
})());
check('Archivo de correos solo para el dueño (600)', '600', substr(sprintf('%o', fileperms("$TMP/correos.log")), -3));
check('Destinatario con salto de línea, .invalid o inválido -> false (no se manda)', [false, false, false],
    [Correo::enviar("ana@prueba.example\r\nBcc: x@y.z", 'x', 'x', 'x'), Correo::enviar('borrado-3@invalid', 'x', 'x', 'x'), Correo::enviar('no-es-correo', 'x', 'x', 'x')]);
@unlink("$TMP/correos.log");

// =====================================================================
titulo('2b. SMTP FALSO: sin cifrar (127.0.0.1), STARTTLS, SSL, PLAIN y LOGIN');
exec('openssl req -x509 -newkey rsa:2048 -nodes -keyout ' . escapeshellarg("$TMP/k.pem") . ' -out ' . escapeshellarg("$TMP/c.pem")
    . ' -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1,DNS:localhost 2>/dev/null', $o, $rc);
file_put_contents("$TMP/servidor.pem", file_get_contents("$TMP/c.pem") . file_get_contents("$TMP/k.pem"));
$envF = ['FALSO_USUARIO' => 'envivo', 'FALSO_CLAVE' => 'clave-smtp-prueba'];
$arrancar(['php', __DIR__ . '/smtp_falso.php', (string) $P_SMTP, "$TMP/smtp.jsonl", 'plano'], $envF, "$TMP/smtp_srv.log");
$arrancar(['php', __DIR__ . '/smtp_falso.php', (string) $P_LOGIN, "$TMP/smtp_login.jsonl", 'plano'], $envF + ['FALSO_AUTH' => 'LOGIN'], "$TMP/smtp_srv.log");
$arrancar(['php', __DIR__ . '/smtp_falso.php', (string) $P_TLS, "$TMP/smtp_tls.jsonl", 'tls', "$TMP/servidor.pem"], $envF, "$TMP/smtp_srv.log");
$arrancar(['php', __DIR__ . '/smtp_falso.php', (string) $P_SSL, "$TMP/smtp_ssl.jsonl", 'ssl', "$TMP/servidor.pem"], $envF, "$TMP/smtp_srv.log");
check('Certificado de prueba y 4 SMTP falsos arriba', [0, true, true, true, true], [$rc, $esperarPuerto($P_SMTP), $esperarPuerto($P_LOGIN), $esperarPuerto($P_TLS), $esperarPuerto($P_SSL)]);
file_put_contents("$TMP/enviar.php", '<?php require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . '; $ok = \EnVivo\Correo::enviar($argv[1], "Asunto de prueba ñandú", "<p>Hola <b>HTML</b></p>", ".empieza con punto\n..dos puntos\nlínea 3"); echo json_encode(["ok" => $ok, "error" => \EnVivo\Correo::$ultimoError, "modo" => \EnVivo\Correo::modo()]);');
$enviarCon = function (array $cfg, string $para = 'ana@prueba.example') use ($TMP, $smtp): array {
    $f = "$TMP/cfg_" . bin2hex(random_bytes(3)) . '.env';
    file_put_contents($f, $smtp($cfg));
    $out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg($f) . ' php -d error_log=' . escapeshellarg("$TMP/php_cli.log") . ' ' . escapeshellarg("$TMP/enviar.php") . ' ' . escapeshellarg($para) . ' 2>&1');
    return json_decode((string) $out, true) ?? ['salida' => $out];
};
/** Encabezados y partes (texto, html) de un mensaje recibido. */
$partes = function (string $d): array {
    [$cab, $cuerpo] = explode("\r\n\r\n", $d, 2) + [1 => ''];
    $cab = preg_replace("/\r\n[ \t]+/", ' ', $cab);
    $h = [];
    foreach (explode("\r\n", $cab) as $l) if (str_contains($l, ':')) { [$k, $v] = explode(':', $l, 2); $h[strtolower($k)] = trim($v); }
    preg_match('/boundary="([^"]+)"/', $h['content-type'] ?? '', $m);
    $o = ['h' => $h, 'texto' => null, 'html' => null];
    foreach (explode('--' . ($m[1] ?? 'x'), $cuerpo) as $p) {
        if (!str_contains($p, "\r\n\r\n")) continue;
        [$pc, $pb] = explode("\r\n\r\n", $p, 2);
        if (str_contains($pc, 'text/plain')) $o['texto'] = base64_decode(preg_replace('/\s+/', '', $pb));
        if (str_contains($pc, 'text/html')) $o['html'] = base64_decode(preg_replace('/\s+/', '', $pb));
    }
    return $o;
};
$dec = fn(string $v): string => substr((string) iconv_mime_decode('X: ' . $v, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8'), 3);
$r = $enviarCon($smtpBase);
$m = $lineas("$TMP/smtp.jsonl", 1)[0] ?? [];
$p = $partes((string) ($m['datos'] ?? ''));
check('Sin cifrar hacia 127.0.0.1: el SMTP lo acepta (AUTH PLAIN)', [true, 'smtp', true, 'PLAIN', 'no-responder@prueba.example', ['ana@prueba.example']],
    [$r['ok'] ?? null, $r['modo'] ?? null, $m['auth_ok'] ?? null, $m['auth_metodo'] ?? null, $m['de'] ?? null, $m['para'] ?? null]);
check('Mensaje: asunto UTF-8, From con la marca, To, Reply-To soporte, Message-ID, MIME', ['Asunto de prueba ñandú', true, '<ana@prueba.example>', '<soporte@prueba.example>', true, '1.0', 'auto-generated'],
    [$dec($p['h']['subject'] ?? ''), $dec($p['h']['from'] ?? '') === '"EN VIVO Tycoon" <no-responder@prueba.example>', $p['h']['to'] ?? null,
     $p['h']['reply-to'] ?? null, (bool) preg_match('/^<[a-f0-9]{32}@prueba\.example>$/', $p['h']['message-id'] ?? ''), $p['h']['mime-version'] ?? null, $p['h']['auto-submitted'] ?? null]);
check('Partes texto y HTML; el punto al inicio de línea llega igual (RFC 5321)', [".empieza con punto\n..dos puntos\nlínea 3", '<p>Hola <b>HTML</b></p>'], [$p['texto'], $p['html']]);
$r = $enviarCon(['SMTP_PORT' => $P_LOGIN] + $smtpBase);
$m = $lineas("$TMP/smtp_login.jsonl", 1)[0] ?? [];
check('Servidor que solo ofrece AUTH LOGIN -> usa LOGIN', [true, true, 'LOGIN'], [$r['ok'] ?? null, $m['auth_ok'] ?? null, $m['auth_metodo'] ?? null]);
$r = $enviarCon(['SMTP_PORT' => $P_TLS, 'SMTP_SEGURIDAD' => 'tls', 'SMTP_CA' => "$TMP/c.pem"] + $smtpBase);
$m = $lineas("$TMP/smtp_tls.jsonl", 1)[0] ?? [];
check('STARTTLS (587): cifra antes de mandar usuario y clave', [true, true, true], [$r['ok'] ?? null, $m['tls'] ?? null, $m['auth_ok'] ?? null]);
$r = $enviarCon(['SMTP_PORT' => $P_SSL, 'SMTP_SEGURIDAD' => 'ssl', 'SMTP_CA' => "$TMP/c.pem"] + $smtpBase);
$m = $lineas("$TMP/smtp_ssl.jsonl", 1)[0] ?? [];
check('SSL (465): cifrado desde el inicio', [true, true, true], [$r['ok'] ?? null, $m['tls'] ?? null, $m['auth_ok'] ?? null]);
$r = $enviarCon(['SMTP_PORT' => $P_TLS, 'SMTP_SEGURIDAD' => 'tls'] + $smtpBase);
check('STARTTLS con un certificado que no es de confianza -> NO se manda (no se baja la guardia)', [false, true], [$r['ok'] ?? null, str_contains((string) ($r['error'] ?? ''), 'TLS')]);
$r = $enviarCon(['SMTP_SEGURIDAD' => 'tls'] + $smtpBase);
check('tls contra un servidor sin STARTTLS -> error claro', [false, true], [$r['ok'] ?? null, str_contains((string) ($r['error'] ?? ''), 'STARTTLS')]);
$r = $enviarCon(['SMTP_CLAVE' => 'mala'] + $smtpBase);
check('Clave SMTP mala -> false con el motivo (sin la clave)', [false, true, false], [$r['ok'] ?? null, str_contains((string) ($r['error'] ?? ''), '535'), str_contains((string) ($r['error'] ?? ''), 'mala')]);
$r = $enviarCon($smtpBase, 'rechazar@prueba.example');
check('Destinatario rechazado (550) -> false', [false, true], [$r['ok'] ?? null, str_contains((string) ($r['error'] ?? ''), 'RCPT')]);
$r = $enviarCon(['SMTP_HOST' => 'smtp.example.com'] + $smtpBase);
check('SMTP_SEGURIDAD=ninguna hacia otra máquina -> prohibido (la clave no viaja sin cifrar)', [false, true], [$r['ok'] ?? null, str_contains((string) ($r['error'] ?? ''), 'solo se permite con 127.0.0.1')]);
$r = $enviarCon(['SMTP_PORT' => $puerto()] + $smtpBase);
check('Servidor SMTP apagado -> false sin colgarse', [false, true], [$r['ok'] ?? null, str_contains((string) ($r['error'] ?? ''), 'no se pudo conectar')]);
check('Ninguna clave SMTP en el registro de errores de PHP', false, str_contains((string) @file_get_contents("$TMP/php_cli.log"), 'clave-smtp-prueba'));

// =====================================================================
titulo('3. Por HTTP: pedir el enlace, cambiar la clave (php -S + router.php)');
$phpIni = ['-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1'];
$arrancar(array_merge(['php'], $phpIni, ['-S', '127.0.0.1:' . $P_APP, '-t', $RAIZ, 'server/tests/router.php']), ['ENVIVO_CONFIG' => "$TMP/config.env", 'PHP_CLI_SERVER_WORKERS' => '4'], "$TMP/app.log");
file_put_contents("$TMP/config2.env", $smtp($smtpBase));
$arrancar(array_merge(['php'], $phpIni, ['-S', '127.0.0.1:' . $P_APP2, '-t', $RAIZ, 'server/tests/router.php']), ['ENVIVO_CONFIG' => "$TMP/config2.env", 'PHP_CLI_SERVER_WORKERS' => '2'], "$TMP/app2.log");
check('El juego arriba (dos: sin SMTP y con el SMTP falso)', [true, true], [$esperarPuerto($P_APP), $esperarPuerto($P_APP2)]);
$http = function (string $metodo, string $ruta, ?array $cuerpo = null, array $extra = [], int $p = 0) use ($P_APP): array {
    $ch = curl_init('http://127.0.0.1:' . ($p ?: $P_APP) . $ruta);
    $cab = [];
    $h = array_merge(['Content-Type: application/json'], $extra['sin_cabecera'] ?? false ? [] : ['X-Envivo: 1'], $extra['h'] ?? []);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 20,
        CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$cab) { if (str_contains($l, ':')) { [$k, $v] = explode(':', $l, 2); $cab[strtolower(trim($k))][] = trim($v); } return strlen($l); }]
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []) + (isset($extra['galleta']) ? [CURLOPT_COOKIE => 'envivo_s=' . $extra['galleta']] : []));
    $b = (string) curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode($b, true), $cab, $b];
};
$galletaDe = fn(array $cab) => preg_match('/envivo_s=([a-f0-9]{64})/', implode(';', $cab['set-cookie'] ?? []), $m) ? $m[1] : null;
$limpiarLimites = fn() => Db::q('DELETE FROM intentos');
$ANA = Cuentas::registrar('ana@prueba.example', 'Ana <Productora>', 'ClaveVieja1');
$BETO = Cuentas::registrar('beto@prueba.example', 'Beto', 'ClaveBeto11');
$sesion = function (int $j): string { $t = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $t), $j, time(), time() + 3600]); return $t; };
$s1 = $sesion($ANA); $s2 = $sesion($ANA); $sb = $sesion($BETO);
$R = '/api/cuenta/recuperar';
check('GET -> 405; POST sin X-Envivo -> 403', [405, 403], [$http('GET', $R)[0], $http('POST', $R, ['email' => 'ana@prueba.example'], ['sin_cabecera' => true])[0]]);
check('Correo mal escrito -> 400 email_invalido', [400, 'email_invalido'], (fn($x) => [$x[0], $x[1]['codigo'] ?? null])($http('POST', $R, ['email' => 'ana@'])));
[$c1, $j1, , $b1] = $http('POST', $R, ['email' => '  ANA@prueba.example ']);
[$c2, $j2, , $b2] = $http('POST', $R, ['email' => 'nadie@prueba.example']);
check('Existe o no: MISMA respuesta (código y cuerpo idénticos)', [200, true, true], [$c1, $b1 === $b2, $c1 === $c2]);
check('…con el aviso para el jugador (revisar spam, 30 minutos)', [true, true, 30], [str_contains((string) ($j1['mensaje'] ?? ''), 'spam'), str_contains((string) ($j1['mensaje'] ?? ''), '30 minutos'), $j1['minutos'] ?? null]);
$cor = $lineas("$TMP/correos.log", 1);
check('Solo la cuenta que existe recibe correo (1 en el archivo, para ana)', [1, 'ana@prueba.example'], [count($cor), $cor[0]['para'] ?? null]);
preg_match('~http://127\.0\.0\.1:' . $P_APP . '/recuperar\.html#t=([a-f0-9]{64})~', (string) ($cor[0]['texto'] ?? ''), $mm);
$TOK = $mm[1] ?? '';
check('El correo trae el enlace /recuperar.html#t=<64 letras> (en el texto y en el HTML), con el nombre escapado', [true, true, true],
    [$TOK !== '', str_contains((string) ($cor[0]['html'] ?? ''), $TOK), str_contains((string) ($cor[0]['html'] ?? ''), 'Ana &lt;Productora&gt;')]);
$fila = Db::fila('SELECT * FROM recuperaciones WHERE jugador_id = ?', [$ANA]);
check('En la base: solo el sha256 del código, vence en 30 minutos, sin usar', [hash('sha256', $TOK), 1800, null],
    [$fila['token_hash'] ?? null, (int) ($fila['expira'] ?? 0) - (int) ($fila['creado'] ?? 0), $fila ? $fila['usado'] : 'sin fila']);
// (se lee en OTRO proceso: si este abriera y cerrara el archivo de la base, SQLite perdería sus candados POSIX)
check('El código del enlace no está guardado en ninguna parte de la base', '0', trim((string) shell_exec('cat ' . escapeshellarg("$TMP/datos") . '/envivo.sqlite* | grep -ac ' . escapeshellarg($TOK))));
check('Auditoría: "recuperar_pedido" anotado para Ana', 1, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'recuperar_pedido' AND jugador_id = ?", [$ANA]));
// Idioma
$http('POST', $R, ['email' => 'beto@prueba.example', 'idioma' => 'en']);
$http('POST', $R, ['email' => 'beto@prueba.example'], ['h' => ['Accept-Language: pt-BR,pt;q=0.9']]);
$cor = $lineas("$TMP/correos.log", 3);
check('Idioma del juego (idioma=en) y, si no viene, el del encabezado (pt-BR); el enlace lleva &l=', ['Reset your EN VIVO Tycoon password', 'Recupere sua senha do EN VIVO Tycoon', true, true],
    [$cor[1]['asunto'] ?? null, $cor[2]['asunto'] ?? null, str_contains((string) ($cor[1]['texto'] ?? ''), '&l=en'), str_contains((string) ($cor[2]['texto'] ?? ''), '&l=pt-BR')]);
// Límites
$limpiarLimites();
$cods = []; for ($k = 0; $k < 4; $k++) $cods[] = $http('POST', $R, ['email' => 'ana@prueba.example'])[0];
$x = $http('POST', $R, ['email' => 'ana@prueba.example']);
check('Por correo: 3 por hora, el 4.º -> 429 recuperar_limite', [[200, 200, 200, 429], 'recuperar_limite'], [$cods, $x[1]['codigo'] ?? null]);
$cods = []; for ($k = 0; $k < 4; $k++) $cods[] = $http('POST', $R, ['email' => 'fantasma@prueba.example'])[0];
check('…igual para un correo SIN cuenta (el límite no revela nada)', [200, 200, 200, 429], $cods);
check('Los pedidos de más no mandan correo (3 + 3 nuevos en el archivo)', 6, count($lineas("$TMP/correos.log", 6)));
$limpiarLimites();
$cods = []; for ($k = 0; $k < 21; $k++) $cods[] = $http('POST', $R, ['email' => "ip$k@prueba.example"])[0];
check('Por conexión: 20 por hora, el 21.º -> 429 limite_intentos', [20, 429, 'limite_intentos'], [count(array_filter($cods, fn($c) => $c === 200)), end($cods), $http('POST', $R, ['email' => 'otro@prueba.example'])[1]['codigo'] ?? null]);
$limpiarLimites();
// Cuenta baneada / borrada: misma respuesta, sin correo
$BAN = Cuentas::registrar('ban@prueba.example', 'Baneado', 'ClaveBan111');
Db::q("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$BAN]);
$antes = count($lineas("$TMP/correos.log"));
[$c3, , , $b3] = $http('POST', $R, ['email' => 'ban@prueba.example']);
check('Cuenta baneada: misma respuesta, pero NO se manda enlace', [200, true, $antes, 0], [$c3, $b3 === $b2, count($lineas("$TMP/correos.log")), (int) Db::valor('SELECT COUNT(*) FROM recuperaciones WHERE jugador_id = ?', [$BAN])]);

// Revisar el enlace
$V = '/api/cuenta/recuperar/revisar';
[$c, $j] = $http('POST', $V, ['token' => $TOK]);
check('Revisar el enlace bueno -> 200 con el correo tapado y el mínimo de la clave', [200, 'a•••@prueba.example', 8], [$c, $j['email'] ?? null, $j['clave_min'] ?? null]);
check('Enlace inventado o mal formado -> 410 recuperar_enlace_invalido', [[410, 'recuperar_enlace_invalido'], [410, 'recuperar_enlace_invalido'], 410],
    [(fn($x) => [$x[0], $x[1]['codigo'] ?? null])($http('POST', $V, ['token' => str_repeat('b', 64)])), (fn($x) => [$x[0], $x[1]['codigo'] ?? null])($http('POST', $V, ['token' => 'x'])), $http('POST', $V, [])[0]]);
// Enlace vencido
$TOKV = bin2hex(random_bytes(32));
Db::q('INSERT INTO recuperaciones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $TOKV), $BETO, time() - 3600, time() - 1]);
check('Enlace vencido (más de 30 minutos) -> 410 al revisar y al cambiar', [410, 410], [$http('POST', $V, ['token' => $TOKV])[0], $http('POST', '/api/cuenta/recuperar/cambiar', ['token' => $TOKV, 'clave' => 'ClaveNueva123'])[0]]);

// Cambiar la clave
$C = '/api/cuenta/recuperar/cambiar';
check('Clave nueva corta -> 400 clave_corta (con min) y el enlace sigue sirviendo', [400, 'clave_corta', 8, 200],
    (function () use ($http, $C, $V, $TOK) { $x = $http('POST', $C, ['token' => $TOK, 'clave' => 'corta']); return [$x[0], $x[1]['codigo'] ?? null, $x[1]['min'] ?? null, $http('POST', $V, ['token' => $TOK])[0]]; })());
$antesCor = count($lineas("$TMP/correos.log"));
$otrosTok = (int) Db::valor('SELECT COUNT(*) FROM recuperaciones WHERE jugador_id = ? AND usado IS NULL', [$ANA]);
for ($k = 0; $k < 6; $k++) $http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'equivocada']);
check('Antes: Ana tiene 2 sesiones, varios enlaces pedidos y quedó bloqueada por claves equivocadas', [2, true, 429],
    [(int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$ANA]), $otrosTok >= 2, $http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'ClaveVieja1'])[0]]);
[$c, $j, $cab] = $http('POST', $C, ['token' => $TOK, 'clave' => 'ClaveNueva123'], ['galleta' => $s1]);
$nueva = $galletaDe($cab);
check('Cambiar con el enlace -> 200 y galleta de sesión nueva (HttpOnly)', [200, true, true, true], [$c, $j['ok'] ?? null, $nueva !== null && $nueva !== $s1, str_contains(implode(';', $cab['set-cookie'] ?? []), 'HttpOnly')]);
check('TODAS las sesiones de antes se cerraron (queda solo la nueva); la de Beto sigue', [1, hash('sha256', (string) $nueva), 1],
    [(int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$ANA]), Db::valor('SELECT token_hash FROM sesiones WHERE jugador_id = ?', [$ANA]), (int) Db::valor('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$BETO])]);
check('Con la galleta vieja ya no hay sesión; con la nueva sí', [false, true],
    [(bool) ($http('GET', '/api/estado', null, ['galleta' => $s2])[1]['logueado'] ?? true), (bool) ($http('GET', '/api/estado', null, ['galleta' => $nueva])[1]['logueado'] ?? false)]);
check('La clave vieja ya no entra; la nueva sí (y el bloqueo por claves equivocadas se limpió)', [401, 200],
    [$http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'ClaveVieja1'])[0], $http('POST', '/api/entrar', ['email' => 'ana@prueba.example', 'clave' => 'ClaveNueva123'])[0]]);
check('El enlace ya se usó: otra vez -> 410; y los otros enlaces de Ana tampoco sirven', [410, 410, 0],
    [$http('POST', $C, ['token' => $TOK, 'clave' => 'OtraClave999'])[0], $http('POST', $V, ['token' => $TOK])[0], (int) Db::valor('SELECT COUNT(*) FROM recuperaciones WHERE jugador_id = ? AND usado IS NULL', [$ANA])]);
$cor = $lineas("$TMP/correos.log", $antesCor + 1);
check('Aviso por correo: "Tu contraseña de EN VIVO Tycoon cambió"', ['Tu contraseña de EN VIVO Tycoon cambió', 'ana@prueba.example'], [end($cor)['asunto'] ?? null, end($cor)['para'] ?? null]);
check('Auditoría: clave_recuperada', 1, (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'clave_recuperada' AND jugador_id = ?", [$ANA]));
// Dos cambios a la vez con el mismo enlace: solo uno pasa
$limpiarLimites();
$http('POST', $R, ['email' => 'beto@prueba.example']);
$cor = $lineas("$TMP/correos.log", count($cor) + 1);
preg_match('~#t=([a-f0-9]{64})~', (string) (end($cor)['texto'] ?? ''), $mm);
$TB = $mm[1] ?? '';
$mh = curl_multi_init(); $hs = [];
foreach (['ClaveDoble111', 'ClaveDoble222'] as $cl) {
    $ch = curl_init('http://127.0.0.1:' . $P_APP . $C);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['token' => $TB, 'clave' => $cl]), CURLOPT_PROXY => '',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Envivo: 1']]);
    curl_multi_add_handle($mh, $ch); $hs[] = $ch;
}
do { curl_multi_exec($mh, $corriendo); curl_multi_select($mh); } while ($corriendo);
$cods = array_map(fn($h) => (int) curl_getinfo($h, CURLINFO_HTTP_CODE), $hs);
sort($cods);
check('Dos cambios A LA VEZ con el mismo enlace: uno 200 y el otro 410', [200, 410], $cods);
// Cuenta borrada después de pedir el enlace: ya no sirve
$http('POST', $R, ['email' => 'ban@prueba.example']);
Db::q("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$BAN]);
$http('POST', $R, ['email' => 'ban@prueba.example']);
$cor = $lineas("$TMP/correos.log", count($cor) + 2);
preg_match('~#t=([a-f0-9]{64})~', (string) (end($cor)['texto'] ?? ''), $mm);
Db::q("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$BAN]);
check('Si baneamos la cuenta después de pedir el enlace, el enlace ya no sirve', 410, $http('POST', $C, ['token' => $mm[1] ?? '', 'clave' => 'ClaveNueva123'])[0]);
// Límite de intentos de cambio por conexión
$limpiarLimites();
$cods = []; for ($k = 0; $k < 31; $k++) $cods[] = $http('POST', $V, ['token' => bin2hex(random_bytes(32))])[0];
check('Revisar/cambiar: 30 intentos cada 10 minutos por conexión, el 31.º -> 429', [30, 429], [count(array_filter($cods, fn($c) => $c === 410)), end($cods)]);
$limpiarLimites();

// La página
[$c, , $cab, $html] = $http('GET', '/recuperar.html');
check('/recuperar.html se ve (200), con la CSP del juego (scripts solo propios), no-store y su JavaScript', [200, true, true, true, 200],
    [$c, str_contains(implode(' ', $cab['content-security-policy'] ?? []), "script-src 'self'"), str_contains(implode(' ', $cab['cache-control'] ?? []), 'no-store'),
     str_contains($html, '/pago-assets/recuperar.js'), $http('GET', '/pago-assets/recuperar.js')[0]]);
check('La página no lleva scripts en línea (la CSP los bloquearía)', 0, preg_match_all('/<script(?![^>]*\bsrc=)[^>]*>/i', $html));

// =====================================================================
titulo('4. De punta a punta: pedido por HTTP -> correo por el SMTP falso -> cambiar la clave');
$http('GET', '/api/estado', null, [], $P_APP2);   // la primera petición crea la base del segundo juego
$pdo2 = new PDO('sqlite:' . "$TMP/datos/envivo2.sqlite");
$pdo2->prepare('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id) VALUES (?, ?, ?, ?, 1)')->execute(['caro@prueba.example', 'Caro', password_hash('ClaveCaro11', PASSWORD_BCRYPT), time()]);
$antes = count($lineas("$TMP/smtp.jsonl"));
[$c] = $http('POST', $R, ['email' => 'caro@prueba.example', 'idioma' => 'fr'], [], $P_APP2);
$m = $lineas("$TMP/smtp.jsonl", $antes + 1);
$p = $partes((string) (end($m)['datos'] ?? ''));
preg_match('~http://127\.0\.0\.1:' . $P_APP2 . '/recuperar\.html#t=([a-f0-9]{64})&l=fr~', (string) $p['texto'], $mm);
check('El SMTP falso recibe el correo en francés para caro, con el enlace', [200, count($m), ['caro@prueba.example'], 'Réinitialise ton mot de passe EN VIVO Tycoon', true],
    [$c, $antes + 1, end($m)['para'] ?? null, $dec($p['h']['subject'] ?? ''), isset($mm[1])]);
check('Con ese enlace se cambia la clave', 200, $http('POST', $C, ['token' => $mm[1] ?? '', 'clave' => 'ClaveCaroNueva1'], [], $P_APP2)[0]);
$m = $lineas("$TMP/smtp.jsonl", $antes + 2);
check('…y llega el aviso "mot de passe a changé" por SMTP', true, str_contains($dec($partes((string) (end($m)['datos'] ?? ''))['h']['subject'] ?? ''), 'a changé'));
check('Con SMTP no se escribe ningún archivo de correos', false, is_file("$TMP/datos/correos.log"));

// =====================================================================
titulo('5. Registros');
usleep(300000);
$err = (string) @file_get_contents("$TMP/php_errores.log") . (string) @file_get_contents("$TMP/app.log") . (string) @file_get_contents("$TMP/app2.log");
check('Sin errores ni avisos de PHP', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO api/i', $err));
if (preg_match('/fatal|warning|deprecated|notice|EN VIVO api/i', $err)) echo substr($err, 0, 2000), "\n";
check('Ningún código de enlace en los registros del servidor', false, $TOK !== '' && str_contains($err, $TOK));

echo "\n----------------------------------------\nResumen pruebas_correo.php — correctas: $OK  ·  fallas: $FALLAS\n";
exit($FALLAS === 0 ? 0 : 1);
