<?php
declare(strict_types=1);

// Envío de notificaciones push (server/INTEGRAR_PUSH.md): cada minuto por cron (www-data):
//   * * * * * ENVIVO_CONFIG=/etc/envivo/config.env php /ruta/server/bin/push_enviar.php >> /var/log/envivo-push.log 2>&1
// Corre los detectores (obra terminada, copa, duelos, buzón, premio diario, recordatorios) y vacía la cola con las
// reglas de Push.php. Un candado evita que dos corridas se pisen. Solo escribe en el registro si hizo algo.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Push};

$candado = fopen(sys_get_temp_dir() . '/envivo_push_' . substr(hash('sha256', \EnVivo\Config::db()), 0, 12) . '.lock', 'c');
if (!$candado || !flock($candado, LOCK_EX | LOCK_NB)) exit(0);   // la corrida anterior sigue
try {
    Db::pdo();
    $r = Push::procesar();
    if ($r['sin_claves']) {
        if ((int) date('i') === 0) echo date('c') . " push: faltan las llaves VAPID (php server/bin/push_claves.php)\n";
        exit(0);
    }
    unset($r['sin_claves']);
    if (array_sum($r) > 0) echo date('c') . ' push: ' . json_encode($r) . "\n";
} catch (\Throwable $e) {
    echo date('c') . ' push ERROR: ' . get_class($e) . ' ' . mb_substr($e->getMessage(), 0, 300) . "\n";
    exit(1);
} finally {
    flock($candado, LOCK_UN);
}
