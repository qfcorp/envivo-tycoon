<?php
declare(strict_types=1);

// Registra (o actualiza) los comandos del bot en Discord: /vincular, /desvincular, /perfil, /ranking, /eventos, /ayuda,
// con nombres y descripciones en español (es-ES y es-419), inglés (en-US, en-GB) y portugués (pt-BR).
// Se corre UNA vez al instalar y otra cada vez que cambien los comandos (no hace falta en cada actualización):
//   sudo -u www-data php /var/www/envivo/server/bin/discord_comandos.php             (globales: PUT /applications/{id}/commands)
//   sudo -u www-data php /var/www/envivo/server/bin/discord_comandos.php --servidor  (solo en el servidor de Discord: aparecen al instante)
//   php server/bin/discord_comandos.php --mostrar                                    (solo muestra el JSON; no manda nada)
// Usa DISCORD_APP_ID, DISCORD_BOT_TOKEN y DISCORD_GUILD_ID de /etc/envivo/config.env. Nunca imprime el token.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Config, Discord};

$op = getopt('', ['mostrar', 'servidor']);
if (isset($op['mostrar'])) {
    echo json_encode(Discord::comandos(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
    exit(0);
}
if (Discord::appId() === '' || trim(Config::get('DISCORD_BOT_TOKEN')) === '' || (isset($op['servidor']) && Discord::guild() === '')) {
    fwrite(STDERR, 'ERROR: faltan DISCORD_APP_ID, DISCORD_BOT_TOKEN' . (isset($op['servidor']) ? ' o DISCORD_GUILD_ID' : '') . ' en ' . Config::ruta() . "\n");
    exit(1);
}
try {
    $r = Discord::registrarComandos(isset($op['servidor']));
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . Discord::ocultar($e->getMessage()) . "\n");
    exit(1);
}
if ($r['codigo'] === 200 && is_array($r['datos'])) {
    $n = array_map(fn($c) => '/' . ($c['name'] ?? '?'), $r['datos']);
    echo 'Listo: ' . count($n) . ' comandos registrados ' . (isset($op['servidor']) ? 'en el servidor de Discord' : 'globales') . ': ' . implode(' ', $n) . "\n";
    exit(0);
}
$msg = is_array($r['datos']) && isset($r['datos']['message']) ? Discord::ocultar((string) $r['datos']['message']) : '';
fwrite(STDERR, 'ERROR: Discord respondió ' . $r['codigo'] . ($msg !== '' ? " ($msg)" : '') . ".\n"
    . ($r['codigo'] === 401 ? "   Revisa DISCORD_BOT_TOKEN (Developer Portal > Bot > Reset Token).\n" : '')
    . ($r['codigo'] === 403 ? "   El bot no está en el servidor o falta el permiso applications.commands en la invitación.\n" : ''));
exit(1);
