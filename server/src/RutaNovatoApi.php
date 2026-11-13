<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas de "Tus primeros 7 días" (RutaNovato.php; api.php las llama con UNA línea; contrato en server/API.md). Todas con sesión.
 *   GET  /api/novato             estado de la ruta de la cuenta (día, reclamados, premios y oferta de novato)
 *   POST /api/novato/empezar     {inicio: segundos Unix}: la partida empezó antes que la cuenta (como mucho 3 días antes)
 *   POST /api/novato/reclamar    {clave: "d1".."d7" | "final", ya_local?: bool}
 * POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí otra vez por si acaso).
 */
final class RutaNovatoApi
{
    public const RUTAS = ['/novato', '/novato/empezar', '/novato/reclamar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($ruta === '/novato') {
            if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
            Http::json(200, RutaNovato::estado($jugador));
        }
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        if (Limite::contar('novato:' . $jugador, 40)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
        $in = Http::entrada(4 * 1024);
        if ($ruta === '/novato/empezar') Http::json(200, RutaNovato::empezar($jugador, $in['inicio'] ?? null));
        $clave = is_string($in['clave'] ?? null) ? $in['clave'] : '';
        if ($clave === '') throw new Fallo('Falta "clave".', 400, ['codigo' => 'falta_clave']);
        Http::json(200, RutaNovato::reclamar($jugador, $clave, ($in['ya_local'] ?? false) === true));
    }
}
