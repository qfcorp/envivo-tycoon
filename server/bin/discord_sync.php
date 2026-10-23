<?php
declare(strict_types=1);

// Sincroniza los roles de Discord de los jugadores vinculados (VIP que venció, compras nuevas, cambios de asociación o de
// servidor, roles quitados a mano). La programa el cron de www-data cada 10 minutos (ver server/INTEGRAR_DISCORD.md):
//   */10 * * * * ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/discord_sync.php >> /var/log/envivo-discord.log 2>&1
// A mano:
//   sudo -u www-data php /var/www/envivo/server/bin/discord_sync.php            (solo los que cambiaron + un repaso de 25)
//   sudo -u www-data php /var/www/envivo/server/bin/discord_sync.php --todos    (todos los vinculados)
//   sudo -u www-data php /var/www/envivo/server/bin/discord_sync.php --jugador=7
//   Opciones: --repaso=N (cuántos "revisados hace más tiempo" se repasan; 25), --segundos=N (tope de tiempo; 480), --detalle
// Respeta los límites de Discord (espera cuando Discord lo pide). Nunca imprime el token del bot.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Config, Db, Discord};

$op = getopt('', ['todos', 'jugador:', 'repaso:', 'segundos:', 'detalle']);
$hora = fn() => date('Y-m-d H:i:s');

try {
    Db::pdo();
    Discord::preparar();
    if (!Discord::configurado()) {
        echo $hora() . " discord_sync: el bot no está configurado (faltan DISCORD_APP_ID, DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN o DISCORD_GUILD_ID en " . Config::ruta() . "). Nada que hacer.\n";
        exit(0);
    }
    // Una sola vuelta a la vez (si la anterior sigue, esta no hace nada)
    $candado = fopen(dirname(Config::db()) . '/discord_sync.lock', 'c');
    if ($candado === false || !flock($candado, LOCK_EX | LOCK_NB)) {
        echo $hora() . " discord_sync: otra sincronización sigue corriendo; salgo.\n";
        exit(0);
    }
    if (isset($op['jugador'])) {
        $j = (int) $op['jugador'];
        $r = Discord::sincronizar($j);
        echo $hora() . " discord_sync jugador $j: " . ($r['puestos'] ? 'puse ' . implode(', ', $r['puestos']) . '. ' : '')
            . ($r['quitados'] ? 'quité ' . implode(', ', $r['quitados']) . '. ' : '') . 'Tiene: ' . (implode(', ', $r['tiene']) ?: '-')
            . ($r['error'] !== null ? ' · problema: ' . $r['error'] : '') . "\n";
        exit($r['error'] === null ? 0 : 1);
    }
    $eco = isset($op['detalle']) ? function (string $t) { echo '   ' . Discord::ocultar($t) . "\n"; } : null;
    $e = Discord::sincronizarPendientes(isset($op['todos']), (int) ($op['repaso'] ?? 25), (int) ($op['segundos'] ?? 480), $eco);
    echo $hora() . " discord_sync OK: {$e['revisados']} revisados, {$e['cambios']} con cambios (+{$e['puestos']} / -{$e['quitados']} roles), {$e['errores']} con problemas"
        . ($e['pendientes'] ? ", {$e['pendientes']} quedan para la próxima vuelta" : '') . "\n";
} catch (\Throwable $e) {
    fwrite(STDERR, $hora() . ' ERROR en discord_sync: ' . Discord::ocultar(get_class($e) . ': ' . $e->getMessage()) . "\n");
    exit(1);
}
