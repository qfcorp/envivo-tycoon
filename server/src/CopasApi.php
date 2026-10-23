<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/copa... de la Copa de Servidores (api.php las llama con UNA línea; ver server/INTEGRAR_COPAS.md).
 * Todas con sesión. POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí se revisa otra vez por si acaso).
 * Los errores salen como Fallo (api.php los convierte en {ok:false, error, codigo} con su código HTTP).
 */
final class CopasApi
{
    public const RUTAS = ['/copa' => 'GET', '/copa/equipo' => 'POST', '/copa/intento/iniciar' => 'POST', '/copa/intento/enviar' => 'POST'];

    public static function esRuta(string $ruta): bool { return isset(self::RUTAS[$ruta]); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $esperado = self::RUTAS[$ruta] ?? null;
        if ($esperado === null) Http::error(404, 'No encontrado.');
        if ($metodo !== $esperado) Http::error(405, 'Usa ' . $esperado . '.');
        switch ($ruta) {
            case '/copa':
                Http::json(200, Copas::estado($jugador));
            case '/copa/equipo':
                if (Limite::contar('copa_equipo:' . $jugador, 30)) Http::error(429, 'Demasiados cambios seguidos. Espera un momento.');
                Http::json(200, Copas::registrarEquipo($jugador, Http::entrada(20000)));
            case '/copa/intento/iniciar':
                Http::json(200, Copas::iniciarIntento($jugador, Http::entrada(10000)));
            case '/copa/intento/enviar':
                $r = Copas::enviarIntento($jugador, Http::entrada(20000));
                Http::json(($r['resultado']['estado'] ?? '') === 'pendiente' ? 202 : 200, $r);
        }
        Http::error(404, 'No encontrado.');
    }
}
