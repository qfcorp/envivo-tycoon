<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas de la promo de Black Friday (BlackFriday.php; api.php las llama con UNA línea; contrato en server/API.md):
 *   GET  /api/promo/black_friday             contador en vivo (sin sesión también); con sesión dice si ya lo reclamó.
 *                                            Cache-Control: public, max-age=15 sin sesión; private, max-age=15 con sesión.
 *   POST /api/promo/black_friday/reclamar    {instalacion?: 32 hex} con sesión y X-Envivo: 1 → VIP 30 días gratis.
 */
final class BlackFridayApi
{
    public const RUTAS = ['/promo/black_friday', '/promo/black_friday/reclamar'];
    public const CACHE_SEG = 15;

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, ?int $jugador): never
    {
        if ($ruta === '/promo/black_friday') {
            if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
            $d = BlackFriday::estado($jugador ?: null);
            http_response_code(200);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: ' . ($jugador ? 'private' : 'public') . ', max-age=' . self::CACHE_SEG);
            header('Vary: Cookie');
            header('X-Content-Type-Options: nosniff');
            echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        if (!$jugador) Http::error(401, 'Crea tu cuenta gratis (o entra) para reclamar el VIP.', [], 'sesion_requerida');
        $in = Http::entrada(4 * 1024);
        Http::json(200, BlackFriday::reclamar($jugador, 'juego', $in['instalacion'] ?? null));
    }
}
