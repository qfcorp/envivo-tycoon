<?php
declare(strict_types=1);

// Conector del Panel Tukán Central (Protocolo Tukán v1): el Panel ve las cifras del juego y entra al Centro de Control.
//   GET /tukan_central.php?accion=estado&t=TOKEN  -> JSON con las cifras (src/ConectorCentral.php)
//   GET /tukan_central.php?accion=sso&t=TOKEN     -> abre el Centro de Control como el administrador del juego
// Mismo ID y secreto que las ventas (deploy/conectar_central.sh). Sin configurar: 404, como en todos los programas.

const ENVIVO_CONTROL = true;
require dirname(__DIR__) . '/src/arranque.php';
require __DIR__ . '/control/lib/base.php';

use EnVivo\{Auditoria, Config, ConectorCentral, Control, Db, Http, Limite};

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$accion = is_string($_GET['accion'] ?? null) ? $_GET['accion'] : '';
$token = is_string($_GET['t'] ?? null) ? $_GET['t'] : '';

$json = static function (int $codigo, array $datos): never {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
};
$pagina = static function (int $codigo, string $titulo, string $texto, string $codigoError = ''): never {
    http_response_code($codigo);
    header('Content-Type: text/html; charset=utf-8');
    if ($codigoError !== '') header('X-Tukan-Codigo: ' . $codigoError);
    $panel = rtrim(Config::get('TUKAN_CENTRAL_URL', 'https://panel.tukanec.com'), '/');
    echo '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<title>' . htmlspecialchars($titulo) . '</title><body style="font-family:system-ui,sans-serif;max-width:32em;margin:3em auto;padding:0 1em">'
       . '<h1 style="font-size:1.3em">' . htmlspecialchars($titulo) . '</h1><p>' . htmlspecialchars($texto) . '</p>'
       . (preg_match('#^https?://#', $panel) ? '<p><a href="' . htmlspecialchars($panel) . '">← Volver al Panel Tukán</a></p>' : '') . '</body></html>';
    exit;
};

try {
    if (!ConectorCentral::activo()) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo "404\n"; exit; }
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') { http_response_code(405); exit; }
    if (!in_array($accion, ['estado', 'sso'], true)) $json(400, ['ok' => false, 'codigo' => 'invalido', 'error' => 'Acción no válida.']);
    Db::pdo();
    if (Limite::contar('tukan_central:' . Http::ip(), ConectorCentral::MAX_POR_MINUTO, 1)) {
        header('Retry-After: 60');
        $accion === 'estado' ? $json(429, ['ok' => false, 'codigo' => 'limite', 'error' => 'Demasiados pedidos. Espera un minuto.'])
                             : $pagina(429, 'Demasiados intentos', 'Espera un minuto y vuelve a entrar desde el Panel Tukán.', 'limite');
    }
    try {
        $p = ConectorCentral::validar($token, $accion);
    } catch (RuntimeException $e) {
        $c = $e->getMessage();
        $accion === 'estado' ? $json(401, ['ok' => false, 'codigo' => $c, 'error' => ConectorCentral::mensaje($c)])
                             : $pagina(401, 'No se pudo entrar', ConectorCentral::mensaje($c), $c);
    }

    if ($accion === 'estado') $json(200, ConectorCentral::estado());

    // ---- sso: abre el Centro de Control como el administrador del juego
    if (!Control::ipPermitida(Http::ip())) $pagina(403, 'No se pudo entrar', 'El Centro de Control solo se abre desde las conexiones permitidas (ENVIVO_CONTROL_IPS).', 'no_permitido');
    Control::preparar();
    $usuario = Config::get('ENVIVO_ADMIN_USUARIO');
    if ($usuario === '' || Config::get('ENVIVO_ADMIN_CLAVE_HASH') === '') $pagina(503, 'Centro de Control sin configurar', 'Falta ENVIVO_ADMIN_USUARIO o ENVIVO_ADMIN_CLAVE_HASH en /etc/envivo/config.env.', 'sin_configurar');
    cc_abrir_sesion($usuario);
    Auditoria::anotar(Control::quien($usuario), 'panel_tukan_sso', 'Entró desde el Panel Tukán Central: ' . mb_substr((string) $p['email'], 0, 120));
    // La galleta del Centro de Control es SameSite=Strict: si se redirige directo, el navegador todavía cuenta la visita
    // como «venida del Panel» y no la manda. Por eso se pasa con una página propia que sigue sola a /control/.
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    echo '<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/control/">'
       . '<title>Entrando al Centro de Control…</title><body style="font-family:system-ui,sans-serif;margin:3em auto;max-width:30em;padding:0 1em">'
       . '<p>Entrando al Centro de Control de EN VIVO Tycoon…</p><p><a href="/control/">Si no avanza solo, toca aquí.</a></p></body></html>';
    exit;
} catch (Throwable $e) {
    error_log('EN VIVO tukan_central: ' . mb_substr($e->getMessage(), 0, 300));
    $accion === 'sso' ? $pagina(500, 'Error', 'Algo falló al entrar. Intenta otra vez desde el Panel Tukán.', 'error')
                      : $json(500, ['ok' => false, 'codigo' => 'error', 'error' => 'Error del juego.']);
}
