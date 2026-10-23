<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/impulsos... (api.php las llama con UNA línea; ver server/INTEGRAR_MONETIZACION2.md). Todas con sesión.
 * POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí otra vez por si acaso).
 *   GET  /api/impulsos                  equipo de obra extra (permanente/alquiler), Fondo de crecimiento (hitos), Tarjeta semanal
 *   POST /api/impulsos/alquilar         {confirmar_precio}       alquila el equipo extra 2 días (el juego descuenta su dinero)
 *   POST /api/impulsos/fondo            {nivel?}                 reclama un hito (o todos los alcanzados sin "nivel")
 *   POST /api/impulsos/tarjeta          —                        reclama lo de hoy de la Tarjeta semanal
 */
final class ImpulsosApi
{
    public const RUTAS = ['/impulsos', '/impulsos/alquilar', '/impulsos/fondo', '/impulsos/tarjeta'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $post = function () use ($metodo, $jugador): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            if (Limite::contar('impulsos:' . $jugador, 60)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
            return Http::entrada(8 * 1024);
        };
        $entero = function (mixed $v): ?int {
            if (is_int($v)) return $v;
            if (is_string($v) && preg_match('/^\d{1,9}$/', $v)) return (int) $v;
            return null;
        };
        switch ($ruta) {
            case '/impulsos':
                if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
                Http::json(200, Impulsos::estado($jugador));
            case '/impulsos/alquilar':
                $in = $post();
                Http::json(200, Impulsos::alquilar($jugador, $entero($in['confirmar_precio'] ?? null)));
            case '/impulsos/fondo':
                $in = $post();
                $n = array_key_exists('nivel', $in) && $in['nivel'] !== null ? $entero($in['nivel']) : null;
                if (array_key_exists('nivel', $in) && $in['nivel'] !== null && $n === null) throw new Fallo('Ese nivel no tiene premio en el fondo.', 400, ['codigo' => 'hito_invalido']);
                Http::json(200, Impulsos::reclamarFondo($jugador, $n));
            case '/impulsos/tarjeta':
                $post();
                Http::json(200, Impulsos::reclamarTarjeta($jugador));
        }
        Http::error(404, 'No encontrado.');
    }
}
