<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/push/* (las llama api.php con UNA línea; ver server/INTEGRAR_PUSH.md). Todas con sesión y por POST
 * (el endpoint del aparato es largo y no debe quedar en los registros de nginx como parte de la dirección).
 *   POST /api/push/estado        {endpoint?}                                         -> estado (y marca el aparato como visto)
 *   POST /api/push/suscribir     {suscripcion:{endpoint, keys:{p256dh, auth}}, dispositivo, idioma, categorias?, anterior?}
 *   POST /api/push/preferencias  {endpoint, categorias:{obra:bool, ...}}
 *   POST /api/push/baja          {endpoint}
 * Respuesta: {ok, disponible, publica, max_dia, categorias_defecto, suscrito, categorias, aparatos}.
 */
final class PushApi
{
    public const RUTAS = ['/push/estado', '/push/suscribir', '/push/preferencias', '/push/baja'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        if (Limite::contar('push:' . $jugador, 60)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
        $in = Http::entrada(8 * 1024);
        $ep = is_string($in['endpoint'] ?? null) ? mb_substr($in['endpoint'], 0, 1000) : '';
        match ($ruta) {
            '/push/estado' => Http::json(200, Push::estado($jugador, $ep)),
            '/push/suscribir' => Http::json(200, Push::suscribir($jugador, $in)),
            '/push/preferencias' => Http::json(200, Push::preferencias($jugador, $ep, $in['categorias'] ?? null)),
            '/push/baja' => Http::json(200, Push::baja($jugador, $ep)),
        };
    }
}
