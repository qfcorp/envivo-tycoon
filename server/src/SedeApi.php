<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/sede... de la Sede oficial (las llama api.php con UNA línea; ver server/INTEGRAR_SEDE_OFICIAL.md).
 * Todas con sesión. POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí se revisa otra vez por si acaso).
 * Los errores salen como Fallo (api.php los convierte en {ok:false, error, codigo} con su código HTTP).
 */
final class SedeApi
{
    public const RUTAS = ['/sede', '/sede/mejorar', '/sede/subir', '/sede/cofre', '/sede/acelerar', '/sede/ayudar', '/sede/ayudas', '/sede/migrar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $post = function () use ($metodo, $jugador): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            if (Limite::contar('sede:' . $jugador, 120)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
            return Http::entrada(64 * 1024);
        };
        $get = function () use ($metodo): void { if ($metodo !== 'GET') Http::error(405, 'Usa GET.'); };
        $id = function (array $in, string $k): int {
            $v = $in[$k] ?? null;
            if (is_int($v) && $v > 0) return $v;
            if (is_string($v) && preg_match('/^[1-9]\d{0,12}$/', $v)) return (int) $v;
            throw new Fallo('Falta "' . $k . '".', 400, ['codigo' => 'falta_' . $k]);
        };
        switch ($ruta) {
            case '/sede':
                $get();
                Http::json(200, SedeOficial::vista($jugador));
            case '/sede/mejorar':
                $in = $post();
                Http::json(200, SedeOficial::mejorar($jugador, is_string($in['clave'] ?? null) ? $in['clave'] : ''));
            case '/sede/subir':
                $post();
                Http::json(200, SedeOficial::subir($jugador));
            case '/sede/cofre':
                $post();
                Http::json(200, SedeOficial::cofre($jugador));
            case '/sede/acelerar':
                $in = $post();
                $c = $in['confirmar_costo'] ?? null;
                $conf = is_int($c) ? $c : (is_string($c) && preg_match('/^\d{1,9}$/', $c) ? (int) $c : null);
                $usar = is_string($in['usar'] ?? null) ? $in['usar'] : 'creditos';
                Http::json(200, SedeOficial::acelerar($jugador, $id($in, 'obra_id'), $conf, $usar));
            case '/sede/ayudar':
                $in = $post();
                Http::json(200, SedeOficial::ayudar($jugador, $id($in, 'jugador_id'), $id($in, 'obra_id')));
            case '/sede/ayudas':
                $get();
                Http::json(200, SedeOficial::ayudas($jugador));
            case '/sede/migrar':
                $in = $post();
                Http::json(200, SedeOficial::migrar($jugador, $in['local'] ?? null));
        }
        Http::error(404, 'No encontrado.');
    }
}
