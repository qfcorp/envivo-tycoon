<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/misiones... (las llama api.php con UNA línea; ver server/INTEGRAR_MISIONES.md). Todas con sesión.
 *   GET  /api/misiones            lo ya reclamado (últimos 16 días), misiones de hoy y de la semana, tope de créditos
 *   POST /api/misiones/reclamar   {periodo: "d:AAAA-MM-DD" | "s:AAAA-MM-DD", clave: "eventos" | "cofre60" | ...}
 * POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí otra vez por si acaso).
 */
final class MisionesApi
{
    public const RUTAS = ['/misiones', '/misiones/reclamar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        switch ($ruta) {
            case '/misiones':
                if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
                Http::json(200, Misiones::estado($jugador));
            case '/misiones/reclamar':
                if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
                if (Limite::contar('misiones:' . $jugador, 60)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
                $in = Http::entrada(4 * 1024);
                $periodo = is_string($in['periodo'] ?? null) ? $in['periodo'] : '';
                $clave = is_string($in['clave'] ?? null) ? $in['clave'] : '';
                if ($periodo === '') throw new Fallo('Falta "periodo".', 400, ['codigo' => 'falta_periodo']);
                if ($clave === '') throw new Fallo('Falta "clave".', 400, ['codigo' => 'falta_clave']);
                Http::json(200, Misiones::reclamar($jugador, $periodo, $clave));
        }
        Http::error(404, 'No encontrado.');
    }
}
