<?php
declare(strict_types=1);

// Prueba del correo del juego (docs/CORREO.md): manda el correo de "recuperar contraseña" de ejemplo (con un enlace
// que NO sirve) a la dirección que le digas, con la configuración de /etc/envivo/config.env.
// Uso:   sudo -u www-data php /var/www/envivo/server/bin/correo_prueba.php tu@correo.com [idioma]
// Dice si salió por SMTP o si quedó en el archivo (sin SMTP_HOST), y el error del servidor SMTP si lo hubo.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Config, Correo, CorreoPlantillas, Http};

$para = (string) ($argv[1] ?? '');
if (!filter_var($para, FILTER_VALIDATE_EMAIL)) { fwrite(STDERR, "Uso: php correo_prueba.php tu@correo.com [idioma]\n"); exit(2); }
$idioma = CorreoPlantillas::idioma((string) ($argv[2] ?? 'es'));
echo 'Modo: ' . (Correo::modo() === 'smtp'
    ? 'SMTP ' . Config::get('SMTP_HOST') . ':' . Config::get('SMTP_PORT', '587') . ' (' . Config::get('SMTP_SEGURIDAD', 'tls') . '), remitente ' . (Correo::remitente() ?: '(FALTA SMTP_DE)')
    : 'SIN SMTP: el correo se escribe en ' . Correo::archivoRegistro()) . "\n";
$c = CorreoPlantillas::armar('recuperar', $idioma, ['nombre' => 'Prueba', 'enlace' => Http::urlBase() . '/recuperar.html#t=prueba', 'min' => 30]);
$ok = Correo::enviar($para, '[Prueba] ' . $c['asunto'], $c['html'], $c['texto']);
if ($ok) { echo "OK: " . (Correo::modo() === 'smtp' ? "el servidor SMTP aceptó el correo. Revisa la bandeja de $para (y el spam).\n" : "quedó en el archivo.\n"); exit(0); }
echo 'NO SALIÓ: ' . Correo::$ultimoError . "\n";
exit(1);
