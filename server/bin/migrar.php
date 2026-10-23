<?php
declare(strict_types=1);

// Crea o actualiza las tablas de la base de EN VIVO Tycoon. Se puede correr las veces que se quiera (no borra nada).
// Uso en el servidor:   sudo -u www-data php /var/www/envivo/server/bin/migrar.php
// (La API también lo hace sola en la primera petición; este script sirve para hacerlo al instalar o actualizar.)

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Config, Db};

$ruta = Config::db();
$dir = dirname($ruta);
if (!is_dir($dir)) { fwrite(STDERR, "ERROR: no existe la carpeta $dir (la crea deploy/instalar.sh).\n"); exit(1); }
// Como root, en la carpeta de www-data: la base quedaría de root y el juego ya no podría escribir en ella.
if (function_exists('posix_geteuid') && posix_geteuid() === 0 && (int) fileowner($dir) !== 0) {
    fwrite(STDERR, "ERROR: no lo corras como root. Usa:  sudo -u www-data php " . __FILE__ . "\n");
    exit(1);
}
if (!is_writable($dir)) { fwrite(STDERR, "ERROR: no se puede escribir en $dir. Corre este script como www-data: sudo -u www-data php " . __FILE__ . "\n"); exit(1); }
try {
    Db::pdo();   // al abrir ya aplica las que falten
    $v = (int) Db::valor('PRAGMA user_version');
    $modo = (string) Db::valor('PRAGMA journal_mode');
    echo "Base de datos al día: $ruta (versión $v de " . Db::versionEsperada() . ", modo $modo)\n";
    exit($v === Db::versionEsperada() ? 0 : 1);
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . "\n");
    exit(1);
}
