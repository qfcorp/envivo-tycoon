<?php
// SOLO PRUEBAS: servidor SMTP FALSO para server/tests/pruebas_correo.php (nunca en el servidor del juego).
// Uso: php smtp_falso.php PUERTO REGISTRO.jsonl MODO [CERT.pem]
//   MODO: plano (sin cifrar) · tls (STARTTLS, necesita CERT) · ssl (cifrado desde el inicio, necesita CERT)
// Entorno: FALSO_USUARIO / FALSO_CLAVE (si faltan, no pide usuario) · FALSO_AUTH = PLAIN (por defecto) | LOGIN
// Cada correo recibido se anota como una línea JSON: {tls, auth_ok, auth_metodo, de, para, datos}.
// Un destinatario que contiene "rechazar" recibe 550 (para probar el error).
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
[$_, $puerto, $log, $modo] = $argv + [null, null, null, 'plano'];
$cert = $argv[4] ?? '';
$ctx = stream_context_create(['ssl' => ['local_cert' => $cert, 'verify_peer' => false, 'allow_self_signed' => true]]);
$srv = stream_socket_server(($modo === 'ssl' ? 'ssl' : 'tcp') . '://127.0.0.1:' . $puerto, $errno, $errstr, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $ctx);
if (!$srv) { fwrite(STDERR, "no arranca: $errstr\n"); exit(1); }
$usuario = (string) getenv('FALSO_USUARIO');
$clave = (string) getenv('FALSO_CLAVE');
$metodo = getenv('FALSO_AUTH') ?: 'PLAIN';
while (true) {
    $c = @stream_socket_accept($srv, 3600);
    if (!$c) continue;
    stream_set_timeout($c, 10);
    $tls = $modo === 'ssl';
    $auth = $usuario === '';
    $am = null;
    $de = null; $para = [];
    $w = fn(string $l) => fwrite($c, $l . "\r\n");
    $w('220 falso.example ESMTP listo');
    while (($l = fgets($c, 4096)) !== false) {
        $l = rtrim($l, "\r\n");
        $u = strtoupper($l);
        if (str_starts_with($u, 'EHLO')) {
            $caps = ['250-falso.example hola'];
            if ($modo === 'tls' && !$tls) $caps[] = '250-STARTTLS';
            if ($usuario !== '') $caps[] = '250-AUTH ' . ($metodo === 'LOGIN' ? 'LOGIN' : 'LOGIN PLAIN');
            $caps[] = '250 8BITMIME';
            $w(implode("\r\n", $caps));
        } elseif ($u === 'STARTTLS' && $modo === 'tls') {
            $w('220 adelante');
            stream_context_set_option($c, 'ssl', 'local_cert', $cert);
            if (!@stream_socket_enable_crypto($c, true, STREAM_CRYPTO_METHOD_TLS_SERVER)) break;
            $tls = true;
        } elseif (str_starts_with($u, 'AUTH PLAIN ')) {
            $p = explode("\0", (string) base64_decode(substr($l, 11)));
            $auth = ($p[1] ?? '') === $usuario && ($p[2] ?? '') === $clave; $am = 'PLAIN';
            $w($auth ? '235 bien' : '535 usuario o clave mal');
        } elseif ($u === 'AUTH LOGIN') {
            $w('334 VXNlcm5hbWU6');
            $us = base64_decode(rtrim((string) fgets($c), "\r\n"));
            $w('334 UGFzc3dvcmQ6');
            $cl = base64_decode(rtrim((string) fgets($c), "\r\n"));
            $auth = $us === $usuario && $cl === $clave; $am = 'LOGIN';
            $w($auth ? '235 bien' : '535 usuario o clave mal');
        } elseif (str_starts_with($u, 'MAIL FROM:')) {
            if (!$auth) { $w('530 primero el usuario'); continue; }
            $de = trim(substr($l, 10), '<> '); $para = []; $w('250 ok');
        } elseif (str_starts_with($u, 'RCPT TO:')) {
            $r = trim(substr($l, 8), '<> ');
            if (str_contains($r, 'rechazar')) { $w('550 no existe ese buzon'); continue; }
            $para[] = $r; $w('250 ok');
        } elseif ($u === 'DATA') {
            $w('354 manda');
            $d = '';
            while (($x = fgets($c, 8192)) !== false) { if ($x === ".\r\n") break; $d .= $x; }
            $d = preg_replace('/^\.\./m', '.', $d);
            file_put_contents($log, json_encode(['tls' => $tls, 'auth_ok' => $auth && $usuario !== '', 'auth_metodo' => $am, 'de' => $de, 'para' => $para, 'datos' => $d], JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
            $w('250 encolado');
        } elseif ($u === 'QUIT') { $w('221 chao'); break; }
        elseif ($u === 'RSET' || $u === 'NOOP') $w('250 ok');
        else $w('502 no entiendo');
    }
    @fclose($c);
}
