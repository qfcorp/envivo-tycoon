<?php
declare(strict_types=1);

// Llaves VAPID de las notificaciones push (server/INTEGRAR_PUSH.md). Se hacen UNA vez: si se cambian, todos los aparatos
// suscritos dejan de recibir avisos hasta que el juego se vuelva a suscribir solo (lo hace al abrir).
//   sudo php server/bin/push_claves.php            muestra las líneas para /etc/envivo/config.env
//   sudo php server/bin/push_claves.php --escribir las agrega al config (si ya hay llaves, no hace nada)
//   php server/bin/push_claves.php --revisar       dice si las llaves del config están bien
// Después:  sudo systemctl reload php8.3-fpm
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Config, Push};

$args = array_slice($argv, 1);
$ruta = Config::ruta();

if (in_array('--revisar', $args, true)) {
    $c = Push::claves();
    if ($c === null) { fwrite(STDERR, "FALTAN o no son válidas PUSH_VAPID_PUBLICA / PUSH_VAPID_PRIVADA en $ruta\n"); exit(1); }
    $jwt = Push::jwt('https://fcm.googleapis.com', time() + 60, $c['sujeto'], $c['d'], $c['publica']);
    [$h, $p, $s] = explode('.', $jwt);
    $ok = openssl_verify("$h.$p", Push::rawADer(Push::b64ud($s)), Push::pemPublica($c['publica']), OPENSSL_ALGO_SHA256) === 1;
    echo $ok ? "Llaves VAPID bien (el par cuadra). Sujeto: {$c['sujeto']}\n" : "Las llaves NO cuadran (la privada no es de esa pública)\n";
    exit($ok ? 0 : 1);
}

$par = Push::generarPar();
$lineas = "; Notificaciones push (server/INTEGRAR_PUSH.md). La PRIVADA es secreta. Hechas con server/bin/push_claves.php el " . date('Y-m-d') . "\n"
    . 'PUSH_VAPID_PUBLICA=' . Push::b64u($par['publica']) . "\n"
    . 'PUSH_VAPID_PRIVADA=' . Push::b64u($par['d']) . "\n"
    . "PUSH_VAPID_SUJETO=mailto:soporte@tukanec.com\n";

if (!in_array('--escribir', $args, true)) {
    echo "Agrega estas líneas a $ruta (o corre este script con --escribir):\n\n" . $lineas;
    exit(0);
}
if (Push::claves() !== null) { echo "Ya hay llaves VAPID en $ruta: no se cambian (borrarlas a mano si de verdad hace falta).\n"; exit(0); }
if (!is_file($ruta) || !is_writable($ruta)) { fwrite(STDERR, "No se puede escribir $ruta (¿falta sudo?)\n"); exit(1); }
$texto = (string) file_get_contents($ruta);
$texto = preg_replace('/^PUSH_VAPID_(PUBLICA|PRIVADA|SUJETO)=.*\R?/m', '', $texto);
file_put_contents($ruta, rtrim((string) $texto, "\n") . "\n\n" . $lineas, LOCK_EX);
echo "Listo: llaves VAPID guardadas en $ruta. Ahora: sudo systemctl reload php8.3-fpm\n";
