<?php
// SOLO PRUEBAS: enrutador para "php -S" que atiende /api/liga... como lo hará api.php con la línea de
// server/INTEGRAR_LIGA.md (misma revisión de X-Envivo, misma sesión, mismo LigaApi::responder y mismos errores).
// Uso: ENVIVO_CONFIG=... php -S 127.0.0.1:PUERTO server/tests/router_liga.php
require dirname(__DIR__) . '/src/arranque.php';
require __DIR__ . '/reloj_prueba.php';   // ENVIVO_PRUEBA_AHORA: reloj congelado de la prueba ("php -S" no corre auto_prepend_file en el enrutador)

use EnVivo\{Db, Fallo, Http, LigaApi, Sesiones};

$ruta = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
if (!str_starts_with($ruta, '/api/')) { http_response_code(404); echo "404\n"; return true; }
$ruta = '/' . trim(substr($ruta, strlen('/api')), '/');
$metodo = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
try {
    Db::pdo();
    if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.');
    if (!in_array($metodo, ['GET', 'POST'], true)) Http::error(405, 'Método no permitido.');
    if (str_starts_with($ruta, '/liga')) {
        $j = Sesiones::jugadorId();
        if ($j === null) Http::error(401, 'Entra a tu cuenta para continuar.');
        if (LigaApi::esRuta($ruta)) LigaApi::responder($ruta, $metodo, $j);
    }
    Http::error(404, 'No encontrado.');
} catch (Fallo $e) {
    Http::error($e->getCode() ?: 400, $e->getMessage(), $e->extra);
} catch (\Throwable $e) {
    error_log('EN VIVO api ' . $ruta . ': ' . get_class($e) . ' en ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 300));
    Http::error(500, 'Ocurrió un error en el servidor.');
}
