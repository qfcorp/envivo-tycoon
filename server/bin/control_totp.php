<?php
declare(strict_types=1);

// Crea el secreto del segundo factor (TOTP) del Centro de Control. Uso:   php server/bin/control_totp.php [usuario]
// 1. Copia la línea ENVIVO_ADMIN_TOTP=... en /etc/envivo/config.env (y recarga php-fpm).
// 2. Agrega la cuenta en tu app de autenticación (Google Authenticator, Aegis, 1Password...) con el enlace otpauth://
//    (muchas apps lo leen como código QR: cualquier generador de QR sin conexión sirve) o escribiendo el secreto a mano.
// Al cambiar el secreto, todas las sesiones abiertas del panel se cierran.
// Con --codigo SECRETO muestra el código de ahora (para probar la app).

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\Control;

if (($argv[1] ?? '') === '--codigo') {
    $s = (string) ($argv[2] ?? '');
    if (Control::base32($s) === '') { fwrite(STDERR, "Secreto base32 no válido.\n"); exit(1); }
    echo Control::totpCodigo($s, intdiv(time(), 30)), "\n";
    exit(0);
}
$usuario = preg_replace('/[^A-Za-z0-9._-]/', '', (string) ($argv[1] ?? 'admin')) ?: 'admin';
$alf = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
$secreto = '';
foreach (str_split(random_bytes(32)) as $b) $secreto .= $alf[ord($b) & 31];   // 32 caracteres = 160 bits
echo "ENVIVO_ADMIN_TOTP=$secreto\n\n";
echo 'otpauth://totp/' . rawurlencode('EN VIVO Control:' . $usuario) . '?secret=' . $secreto . '&issuer=' . rawurlencode('EN VIVO Control') . "&algorithm=SHA1&digits=6&period=30\n";
