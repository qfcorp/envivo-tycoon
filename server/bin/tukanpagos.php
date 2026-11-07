<?php
declare(strict_types=1);

// Tukán Pagos del juego (src/TukanPagos.php, server/TUKAN_PAGOS.md).
//   php server/bin/tukanpagos.php probar     revisa la configuración y la conexión con Tukán Pagos (GET /api/v1/planes)
// Nunca muestra la clave ni el secreto. Mensajes sin tildes a propósito (se leen bien por SSH desde el celular).
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Config, TukanPagos};

$q = fn(string $t) => strtr($t, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n', 'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U']);
$accion = $argv[1] ?? 'probar';
if ($accion !== 'probar') { fwrite(STDERR, "Uso: php server/bin/tukanpagos.php probar\n"); exit(2); }
$mal = 0;
$linea = function (string $txt, bool $ok) use (&$mal, $q): void { if (!$ok) $mal++; echo ($ok ? '   OK    ' : '   FALTA ') . $q($txt) . "\n"; };
echo "== Tukan Pagos del juego\n";
$linea('Modulo encendido (TUKAN_PAGOS_ACTIVO=1)', Config::get('TUKAN_PAGOS_ACTIVO', '0') === '1');
$linea('Direccion valida (TUKAN_PAGOS_URL): ' . (TukanPagos::url() ?: Config::get('TUKAN_PAGOS_URL')), TukanPagos::url() !== '');
$linea('Clave del programa (TUKAN_PAGOS_CLAVE, empieza con tkp_)', str_starts_with(TukanPagos::clave(), 'tkp_'));
$linea('Secreto de los avisos (TUKAN_PAGOS_SECRETO_AVISO)', strlen(TukanPagos::secreto()) >= 16);
$linea('Direccion del juego (ENVIVO_URL): ' . Config::get('ENVIVO_URL'), preg_match('#^https://#', Config::get('ENVIVO_URL')) === 1);
if (TukanPagos::url() !== '' && TukanPagos::clave() !== '') {
    $f = dirname(Config::db()) . '/tukanpagos_ambiente.json';
    @unlink($f);   // pregunta de nuevo
    $ch = curl_init(TukanPagos::url() . '/api/v1/planes');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . TukanPagos::clave(), 'Accept: application/json']]);
    $r = curl_exec($ch); $http = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); unset($ch);
    $j = is_string($r) ? json_decode($r, true) : null;
    $linea('Tukan Pagos contesta y acepta la clave (HTTP ' . $http . ')', $http === 200 && !empty($j['ok']));
    if (is_array($j) && !empty($j['ok'])) {
        echo '   Programa en Tukan Pagos: ' . ($j['programa'] ?? '?') . ' · Plux: ' . ($j['plux'] ?? '?') . ($j['plux'] === 'sandbox' ? ' (PRUEBAS: no se cobra dinero real)' : '') . "\n";
        $linea('Tukan Pagos ya puede cobrar con tarjeta (Plux configurado alla)', !empty($j['puede_cobrar']));
        $linea('Tukan Pagos tiene la direccion de aviso de este programa', !empty($j['url_aviso']));
    }
}
echo $mal === 0 ? "RESULTADO: todo bien. La tienda del juego cobra con tarjeta por Tukan Pagos.\n" : "RESULTADO: falta lo marcado arriba (FALTA). Guia: server/TUKAN_PAGOS.md\n";
exit($mal === 0 ? 0 : 1);
