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

// Ganchos de los módulos de monetización (server/MONETIZACION.md §2): una línea por módulo. Cada una corre solo si su
// módulo está instalado; si falta el archivo o el registro falla, el servidor sigue igual (ese módulo no escucha compras).
$registrar = static function (string $clase): void {
    try {
        if (class_exists(Ganchos::class) && class_exists($clase) && method_exists($clase, 'registrar')) $clase::registrar();
    } catch (\Throwable $e) {
        error_log('EN VIVO arranque: ' . $clase . '::registrar ' . mb_substr($e->getMessage(), 0, 200));
    }
};
$registrar(Vip::class);           // \EnVivo\Vip::registrar(); VIP 1–10 y regalos de asociación (también registra Regalos) — INTEGRAR_VIP.md
$registrar(Regalos::class);       // solo si Regalos tiene su propio registrar()
$registrar(SedeOficial::class);   // \EnVivo\SedeOficial::registrar(); packs de obra — INTEGRAR_SEDE_OFICIAL.md §2
$registrar(Pase::class);          // \EnVivo\Pase::registrar(); pase de temporada — INTEGRAR_PASE.md §3
$registrar(Estrellas::class);     // \EnVivo\Estrellas::registrar(); pase de copa ($2.99) — INTEGRAR_ESTRELLAS.md §2
$registrar(Facturacion::class);     // \EnVivo\Facturacion::registrar(); factura / nota de crédito SRI pendiente — INTEGRAR_FACTURACION.md
unset($registrar);
