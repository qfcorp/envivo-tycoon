<?php
declare(strict_types=1);

// Arranque del servidor de EN VIVO Tycoon: carga la configuración (/etc/envivo/config.env), la zona horaria
// y las clases de server/src. Lo incluyen api.php, pago.php, admin.php y los scripts de bin/.

namespace EnVivo;

spl_autoload_register(static function (string $clase): void {
    if (!str_starts_with($clase, 'EnVivo\\')) return;
    $f = __DIR__ . '/' . str_replace('\\', '/', substr($clase, 7)) . '.php';
    if (is_file($f)) require $f;
});

ini_set('display_errors', '0');   // nunca se muestran errores al jugador
ini_set('log_errors', '1');
Config::cargar();
date_default_timezone_set(Config::zona());
