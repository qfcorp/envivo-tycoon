<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas del premio diario (api.php las llama con UNA línea; ver server/INTEGRAR_DIARIO.md). Todas con sesión.
 *   GET  /api/diario            calendario de 7 días, día que toca, si ya se reclamó hoy y cuándo sale el próximo
 *   POST /api/diario/reclamar   reclama el premio de hoy (X-Envivo: 1)
 */
final class DiarioApi
{
    public const RUTAS = ['/diario', '/diario/reclamar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        switch ($ruta) {
            case '/diario':
                if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
                Http::json(200, Diario::estado($jugador));
            case '/diario/reclamar':
                if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
                if (Limite::contar('diario:' . $jugador, 30)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
                Http::json(200, Diario::reclamar($jugador));
        }
        Http::error(404, 'No encontrado.');
    }
}
