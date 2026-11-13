<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas del regreso del jugador (Regreso.php; api.php las llama con UNA línea ANTES de exigir X-Envivo; contrato en API.md):
 *   GET|POST /api/regreso           {zona?}  con sesión (POST con X-Envivo): zona horaria + estado del «¡Volviste!»
 *   POST     /api/regreso/reclamar  {id}     con sesión y X-Envivo: entrega el regalo de regreso (una vez por ausencia)
 *   GET      /api/regreso/baja?t=…           página (HTML) del enlace del correo: pide confirmar con un botón
 *   POST     /api/regreso/baja       t=…     (formulario de esa página, sin sesión: el código del enlace basta) → baja
 * La baja va por GET + POST para que los programas que revisan enlaces en los correos no den de baja a nadie solos.
 */
final class RegresoApi
{
    public const RUTAS = ['/regreso', '/regreso/reclamar', '/regreso/baja'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, ?int $jugador): never
    {
        if ($ruta === '/regreso/baja') self::baja($metodo);
        if (!in_array($metodo, ['GET', 'POST'], true)) Http::error(405, 'Método no permitido.');
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        if (!$jugador) Http::error(401, 'Entra a tu cuenta para continuar.', [], 'sesion_requerida');
        if ($ruta === '/regreso') {
            $zona = $metodo === 'POST' ? (Http::entrada(2 * 1024)['zona'] ?? null) : ($_GET['zona'] ?? null);
            Http::json(200, Regreso::estado($jugador, $zona));
        }
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        $in = Http::entrada(2 * 1024);
        $id = $in['id'] ?? null;
        if (!is_int($id) && !(is_string($id) && ctype_digit($id))) Http::error(400, 'Falta el regalo.', [], 'datos_invalidos');
        Http::json(200, Regreso::reclamar($jugador, (int) $id));
    }

    private static function baja(string $metodo): never
    {
        $tok = $metodo === 'POST' ? (string) ($_POST['t'] ?? '') : (string) ($_GET['t'] ?? '');
        $tok = preg_match('/^[a-f0-9]{32}$/', $tok) ? $tok : '';
        $f = $tok !== '' ? Regreso::porToken($tok) : null;
        $e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        if (!$f) self::pagina(404, 'Enlace no válido', '<p>Este enlace no es válido o ya no existe.</p>');
        if ($metodo === 'POST') {
            Regreso::darBaja($tok);
            self::pagina(200, 'Listo', '<p>Listo: no te mandaremos más correos de regreso a <b>' . $e(self::ocultar((string) $f['email'])) . '</b>.</p><p>Tu cuenta y tu partida siguen igual.</p>');
        }
        if ($metodo !== 'GET') self::pagina(405, 'No permitido', '<p>Método no permitido.</p>');
        if ($f['baja_correo'] !== null) self::pagina(200, 'Ya estás dado de baja', '<p>Ya no te mandamos correos de regreso a <b>' . $e(self::ocultar((string) $f['email'])) . '</b>.</p>');
        self::pagina(200, 'Correos de regreso', '<p>¿No quieres recibir más correos de regreso en <b>' . $e(self::ocultar((string) $f['email'])) . '</b>?</p>'
            . '<form method="post" action="/api/regreso/baja"><input type="hidden" name="t" value="' . $e($tok) . '"><button type="submit">No quiero más correos como ese</button></form>'
            . '<p class="t">Los correos de tu cuenta (recuperar la contraseña, avisos de seguridad) siguen llegando.</p>');
    }

    /** a***@correo.com */
    private static function ocultar(string $c): string
    {
        $p = strpos($c, '@');
        return $p === false || $p < 1 ? '***' : mb_substr($c, 0, 1) . '***' . substr($c, $p);
    }

    private static function pagina(int $http, string $titulo, string $cuerpo): never
    {
        http_response_code($http);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('X-Robots-Tag: noindex');
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
        $t = htmlspecialchars($titulo, ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . $t . ' · EN VIVO Tycoon</title>'
            . '<style>body{margin:0;background:#0d0f14;color:#e9edf5;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}main{max-width:480px;margin:40px auto;padding:20px;background:#161a22;border:1px solid #2a3142;border-radius:16px}'
            . 'h1{font-size:20px;margin:0 0 12px}b{color:#ffb020}button{font:inherit;font-weight:700;color:#fff;background:#ff3b3b;border:0;border-radius:12px;padding:12px 18px;cursor:pointer}.t{color:#9aa3b5;font-size:14px}'
            . '.m{font-weight:800;letter-spacing:.04em;color:#ff3b3b;margin-bottom:10px}.m span{color:#ffb020}</style></head>'
            . '<body><main><div class="m">EN VIVO <span>Tycoon</span></div><h1>' . $t . '</h1>' . $cuerpo . '</main></body></html>';
        exit;
    }
}
