<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/buzon... del buzón y los códigos de regalo (api.php las llama con UNA línea; ver server/INTEGRAR_BUZON.md).
 * Todas con sesión. POST con cabecera X-Envivo: 1. Errores como Fallo con "codigo" ({ok:false, error, codigo}).
 */
final class BuzonApi
{
    public const RUTAS = ['/buzon', '/buzon/resumen', '/buzon/leer', '/buzon/reclamar', '/buzon/reclamar_todo', '/buzon/borrar', '/buzon/canjear'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $post = function () use ($metodo): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            return Http::entrada(8 * 1024);
        };
        $id = function (array $in): int {
            $v = $in['id'] ?? null;
            if (is_int($v) && $v > 0) return $v;
            if (is_string($v) && preg_match('/^[1-9]\d{0,12}$/', $v)) return (int) $v;
            throw new Fallo('Falta "id".', 400, ['codigo' => 'falta_id']);
        };
        if ($metodo === 'POST' && Limite::contar('buzon:' . $jugador, 120)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
        switch ($ruta) {
            case '/buzon':
                if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
                Http::json(200, Buzon::listar($jugador));
            case '/buzon/resumen':
                if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
                Http::json(200, ['ok' => true] + Buzon::resumen($jugador));
            case '/buzon/leer':
                Http::json(200, Buzon::leer($jugador, $id($post())));
            case '/buzon/reclamar':
                Http::json(200, Buzon::reclamar($jugador, $id($post())));
            case '/buzon/reclamar_todo':
                $post();
                Http::json(200, Buzon::reclamarTodo($jugador));
            case '/buzon/borrar':
                Http::json(200, Buzon::borrar($jugador, $id($post())));
            case '/buzon/canjear':
                $in = $post();
                $c = is_string($in['codigo'] ?? null) ? $in['codigo'] : '';
                if (trim($c) === '') throw new Fallo('Escribe el código.', 400, ['codigo' => 'falta_codigo']);
                Http::json(200, Buzon::canjear($jugador, $c, ($in['canal'] ?? '') === 'web' ? 'web' : 'juego'));
        }
        Http::error(404, 'No encontrado.');
    }
}
