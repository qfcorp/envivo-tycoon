<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Ruta /api/cuenta/terminos (la llama api.php con UNA línea; ver server/INTEGRAR_CUENTA.md). Con sesión.
 *   GET  -> {ok, terminos: {version, aceptados, aceptado_en, edad_minima}}
 *   POST {acepta_terminos: true, edad_16: true} -> lo mismo, ya aceptado (cuentas creadas antes de pedir la aceptación)
 */
final class TerminosApi
{
    public const RUTAS = ['/cuenta/terminos'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        if ($metodo === 'GET') Http::json(200, ['ok' => true] + Terminos::estado($jugador));
        if ($metodo !== 'POST') Http::error(405, 'Usa GET o POST.');
        if (Limite::contar('terminos:' . $jugador, 30)) Http::error(429, 'Demasiados intentos. Espera un momento.', [], 'limite_intentos');
        $in = Http::entrada(4096);
        Terminos::revisar($in, false);
        Terminos::aceptar($jugador, 'juego');
        Http::json(200, ['ok' => true] + Terminos::estado($jugador));
    }
}
