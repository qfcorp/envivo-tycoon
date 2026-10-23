<?php
// SOLO PRUEBAS. Botón "Únete a nuestro Discord" (docs/DISCORD_CREAR_SERVIDOR.md): Discord::invitacion() y el campo
// discord_invitacion de /api/estado salen de DISCORD_INVITACION (o DISCORD_INVITE_URL) y SOLO si es un enlace de Discord.
// Cada caso corre en un php aparte (Config se lee una vez por proceso). No necesita base ni red.
// Uso:  php server/tests/pruebas_discord2.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);

$SRV = dirname(__DIR__);
$TMP = sys_get_temp_dir() . '/envivo-discord2-' . bin2hex(random_bytes(4));
mkdir($TMP, 0777, true);
register_shutdown_function(fn() => exec('rm -rf ' . escapeshellarg($TMP)));

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado) . '], salió [' . json_encode($real) . "]\n"; }
}

/** Corre Discord::invitacion() y Discord::estado(null) con esta configuración. */
$correr = function (string $config) use ($SRV, $TMP): array {
    $f = $TMP . '/c' . bin2hex(random_bytes(3)) . '.env';
    file_put_contents($f, "ENVIVO_DB=$TMP/no-se-usa.sqlite\n" . $config);
    $code = 'require ' . var_export("$SRV/src/Config.php", true) . '; require ' . var_export("$SRV/src/Discord.php", true) . ';'
        . ' \EnVivo\Config::cargar(); echo json_encode([\EnVivo\Discord::invitacion(), \EnVivo\Discord::estado(null)]);';
    $out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg($f) . ' ' . escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg($code) . ' 2>&1');
    $j = json_decode((string) $out, true);
    return is_array($j) ? $j : ['ERROR', (string) $out];
};

echo "== Invitación al Discord oficial\n";
$r = $correr("DISCORD_INVITACION=https://discord.gg/EnVivoTycoon\n");
check('DISCORD_INVITACION con discord.gg', 'https://discord.gg/EnVivoTycoon', $r[0]);
check('/api/estado: discord_invitacion y discord_vinculado false sin sesión', ['discord_vinculado' => false, 'discord_invitacion' => 'https://discord.gg/EnVivoTycoon'], $r[1]);
check('discord.com/invite también vale', 'https://discord.com/invite/abc-123', $correr("DISCORD_INVITACION=https://discord.com/invite/abc-123\n")[0]);
check('DISCORD_INVITE_URL sirve como otro nombre', 'https://discord.gg/envivo', $correr("DISCORD_INVITE_URL=https://discord.gg/envivo\n")[0]);
check('si están las dos, gana DISCORD_INVITACION', 'https://discord.gg/uno', $correr("DISCORD_INVITACION=https://discord.gg/uno\nDISCORD_INVITE_URL=https://discord.gg/dos\n")[0]);
check('con comillas y espacios (como lo pega el dueño)', 'https://discord.gg/envivo', $correr("DISCORD_INVITACION = \"https://discord.gg/envivo\"\n")[0]);
check('vacía: null (el juego esconde el botón)', [null, ['discord_vinculado' => false, 'discord_invitacion' => null]], $correr("DISCORD_INVITACION=\n"));
foreach (['http://discord.gg/envivo' => 'sin https', 'https://discord.gg.estafa.com/x' => 'otro dominio', 'https://evil.com/discord.gg/x' => 'dominio falso',
          'javascript:alert(1)' => 'javascript:', 'https://discord.gg/envivo?x=<script>' => 'con caracteres raros', 'https://discord.gg/' => 'sin código',
          'discord.gg/envivo' => 'sin https://'] as $u => $por) {
    check("no acepta $por", null, $correr("DISCORD_INVITACION=$u\n")[0]);
}

echo "\n" . str_repeat('=', 60) . "\npruebas_discord2.php: $ok correctas, $fallas fallas\n";
exit($fallas === 0 ? 0 : 1);
