<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/liga... de la Liga Semanal (las llama api.php con UNA línea; ver server/INTEGRAR_LIGA.md).
 * Todas con sesión. POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí se revisa otra vez por si acaso).
 * Los errores salen como Fallo (api.php los convierte en {ok:false, error, codigo} con su código HTTP).
 */
final class LigaApi
{
    public const RUTAS = ['/liga', '/liga/tomar', '/liga/abandonar', '/liga/descartar', '/liga/intento', '/liga/completar', '/liga/tienda'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.');
        $post = function () use ($metodo): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            return Http::entrada(64 * 1024);
        };
        $id = function (array $in, string $k): int {
            $v = $in[$k] ?? null;
            if (is_int($v) && $v > 0) return $v;
            if (is_string($v) && preg_match('/^[1-9]\d{0,12}$/', $v)) return (int) $v;
            throw new Fallo('Falta "' . $k . '".', 400);
        };
        switch ($ruta) {
            case '/liga':
                if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
                Http::json(200, Liga::estado($jugador));
            case '/liga/tomar':
                $in = $post();
                if (Limite::contar('liga:' . $jugador, 120)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.');
                Http::json(200, ['ok' => true, 'liga' => Liga::tomar($jugador, $id($in, 'tarea_id'))]);
            case '/liga/abandonar':
                $post();
                Http::json(200, ['ok' => true, 'liga' => Liga::abandonar($jugador)]);
            case '/liga/descartar':
                $in = $post();
                if (Limite::contar('liga:' . $jugador, 120)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.');
                Http::json(200, ['ok' => true, 'liga' => Liga::descartar($jugador, $id($in, 'tarea_id'))]);
            case '/liga/intento':
                $in = $post();
                if (Limite::contar('liga_intento:' . $jugador, 40)) Http::error(429, 'Pediste demasiados intentos. Espera unos minutos.');
                Http::json(200, Liga::emitirIntento($jugador, $in));
            case '/liga/completar':
                $in = $post();
                $r = Liga::completar($jugador, $in);
                Http::json(($r['intento']['estado'] ?? '') === 'pendiente' ? 202 : 200, $r);
            case '/liga/tienda':
                if ($metodo === 'GET') Http::json(200, Liga::tienda($jugador));
                $in = $post();
                $a = is_string($in['articulo'] ?? null) ? $in['articulo'] : '';
                Http::json(200, Liga::comprar($jugador, $a));
        }
        Http::error(404, 'No encontrado.');
    }
}
