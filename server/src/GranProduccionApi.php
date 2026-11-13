<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/gran... de la Gran Producción de Asociación (GranProduccion.php). api.php las llama con UNA línea
 * (server/INTEGRAR_GRAN_PRODUCCION.md). Todas con sesión; POST con X-Envivo: 1 y límite de acciones seguidas.
 *   GET  /api/gran            todo lo de la pantalla
 *   GET  /api/gran/resumen    liviano (franja de Inicio y botón del chat)
 *   POST /api/gran/aportar    {frente: 'personal' | 'equipos'}
 */
final class GranProduccionApi
{
    public const RUTAS = ['/gran', '/gran/resumen', '/gran/aportar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($ruta === '/gran/aportar') {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
            if (Limite::contar('gran:' . $jugador, 60)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
            $in = Http::entrada(4 * 1024);
            $f = is_string($in['frente'] ?? null) ? mb_substr($in['frente'], 0, 20) : '';
            Http::json(200, GranProduccion::aportar($jugador, $f));
        }
        if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
        Http::json(200, $ruta === '/gran/resumen' ? GranProduccion::resumen($jugador) : GranProduccion::vista($jugador));
    }
}
