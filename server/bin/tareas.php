<?php
declare(strict_types=1);

// Tarea diaria de EN VIVO Tycoon (la programa deploy/instalar.sh en el cron de www-data, cada día a las 4:10):
//  - devuelve a su dueño los equipos con publicaciones del mercado vencidas (7 días);
//  - borra los mensajes del chat de más de 30 días;
//  - borra sesiones vencidas e intentos viejos.
// Se puede correr a mano:   sudo -u www-data php /var/www/envivo/server/bin/tareas.php

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Chat, Db, Mercado};

try {
    Db::pdo();
    $vencidas = Mercado::vencer();
    $liberadas = Mercado::liberar();
    $google = \EnVivo\Google::configurado() ? \EnVivo\Google::avisosPendientes() : 0;
    $chat = Chat::limpiarViejos();
    $ses = Db::q('DELETE FROM sesiones WHERE expira < ?', [time()])->rowCount();
    $int = Db::q('DELETE FROM intentos WHERE minuto < ?', [intdiv(time(), 60) - 24 * 60])->rowCount();
    Db::q('DELETE FROM avisos WHERE creado < ?', [time() - 365 * 86400]);
    echo date('Y-m-d H:i') . " tareas OK: $vencidas publicaciones vencidas devueltas, $liberadas ventas liberadas, $google avisos a Google, $chat mensajes viejos borrados, $ses sesiones vencidas, $int intentos viejos\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en tareas: ' . $e->getMessage() . "\n");
    exit(1);
}
