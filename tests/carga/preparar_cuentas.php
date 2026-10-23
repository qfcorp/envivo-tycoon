<?php
declare(strict_types=1);

// SOLO PRUEBAS DE CARGA (docs/PRUEBA_CARGA.md). Crea N cuentas de prueba (carga-0001@prueba.invalid ...) con una
// sesión abierta cada una y escribe sus galletas en un JSON para tests/carga/k6_juego.js (así la prueba no choca con
// el límite de registros por IP). Si la cuenta ya existe la reutiliza (se puede correr las veces que se quiera).
// Uso:  ENVIVO_CONFIG=/ruta/config.env php tests/carga/preparar_cuentas.php 300 /tmp/cuentas.json
// NUNCA contra la base real del juego: si la base es /var/lib/envivo/envivo.sqlite se niega (salvo CARGA_EN_PRODUCCION=1).

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__, 2) . '/server/src/arranque.php';

use EnVivo\{Config, Cuentas, Db};

$n = max(1, min(2000, (int) ($argv[1] ?? 300)));
$salida = (string) ($argv[2] ?? 'cuentas_carga.json');
$clave = 'ClaveDeCarga2026!';
if (realpath(Config::db()) === '/var/lib/envivo/envivo.sqlite' && getenv('CARGA_EN_PRODUCCION') !== '1') {
    fwrite(STDERR, "ERROR: esta es la base REAL del juego (" . Config::db() . "). Usa una copia (docs/PRUEBA_CARGA.md).\n");
    exit(1);
}
Db::pdo();
$out = [];
$t0 = microtime(true);
for ($desde = 1; $desde <= $n; $desde += 50) {
    Db::tx(function () use ($desde, $n, $clave, &$out): void {   // de a 50 por transacción (mucho más rápido)
        for ($i = $desde; $i <= min($n, $desde + 49); $i++) {
            $email = sprintf('carga-%04d@prueba.invalid', $i);
            $f = Db::fila('SELECT id FROM jugadores WHERE email = ?', [$email]);
            $id = $f ? (int) $f['id'] : Cuentas::registrar($email, sprintf('Carga %04d', $i), $clave);
            $tok = bin2hex(random_bytes(32));
            // 60 días (como una sesión normal): así la sesión no se alarga (UPDATE) en cada petición de la prueba
            Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira, ip, navegador) VALUES (?, ?, ?, ?, ?, ?)',
                [hash('sha256', $tok), $id, time(), time() + \EnVivo\Sesiones::DURACION, '127.0.0.1', 'k6 prueba de carga']);
            $out[] = ['email' => $email, 'clave' => $clave, 'galleta' => $tok, 'jugador_id' => $id];
        }
    });
}
file_put_contents($salida, json_encode($out, JSON_UNESCAPED_SLASHES));
printf("Listo: %d cuentas de prueba con sesión en %s (%.1f s)\n", $n, $salida, microtime(true) - $t0);
