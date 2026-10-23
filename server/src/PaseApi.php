<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/pase... del Pase de Temporada (las llama api.php con UNA línea; ver server/INTEGRAR_PASE.md).
 * Todas con sesión. POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí se revisa otra vez por si acaso).
 * Los errores salen como Fallo con "codigo" (api.php los convierte en {ok:false, error, codigo}).
 */
final class PaseApi
{
    public const RUTAS = ['/pase', '/pase/reclamar', '/pase/reclamar_todo', '/pase/saltar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $post = function () use ($metodo): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            return Http::entrada(16 * 1024);
        };
        $entero = function (array $in, string $k, bool $opcional = false): ?int {
            $v = $in[$k] ?? null;
            if ($v === null && $opcional) return null;
            if (is_int($v)) return $v;
            if (is_string($v) && preg_match('/^-?\d{1,6}$/', $v)) return (int) $v;
            throw new Fallo('Falta "' . $k . '".', 400, ['codigo' => 'falta_' . $k]);
        };
        if ($metodo === 'POST' && Limite::contar('pase:' . $jugador, 120)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
        switch ($ruta) {
            case '/pase':
                if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
                Http::json(200, Pase::estado($jugador));
            case '/pase/reclamar':
                $in = $post();
                $pista = is_string($in['pista'] ?? null) ? $in['pista'] : '';
                Http::json(200, Pase::reclamar($jugador, $entero($in, 'nivel'), $pista, $entero($in, 'temporada', true)));
            case '/pase/reclamar_todo':
                $post();
                Http::json(200, Pase::reclamarTodo($jugador));
            case '/pase/saltar':
                $in = $post();
                Http::json(200, Pase::saltar($jugador, $entero($in, 'niveles')));
        }
        Http::error(404, 'No encontrado.');
    }
}
