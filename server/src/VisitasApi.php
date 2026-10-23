<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/visitas... (las llama api.php con UNA línea; ver server/INTEGRAR_VISITAS.md). Todas con sesión.
 *   GET  /api/visitas/vitrina?jugador_id=N   vitrina pública + aplausos (403 visitas_cerradas si no recibe visitas)
 *   POST /api/visitas/aplaudir {jugador_id}  1 por visitante, productora y día; premio chico a los dos (tope diario)
 *   GET  /api/visitas/sugeridas              productoras de tu servidor para visitar + tus aplausos + tu ajuste
 *   GET  /api/visitas/ajustes                {permitir, aplausos}
 *   POST /api/visitas/ajustes {permitir}     privacidad: permitir visitas sí/no
 * POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí otra vez por si acaso). Errores como Fallo.
 */
final class VisitasApi
{
    public const RUTAS = ['/visitas/vitrina', '/visitas/aplaudir', '/visitas/sugeridas', '/visitas/ajustes'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    private static function id(mixed $v): int
    {
        if (is_int($v) && $v > 0) return $v;
        if (is_string($v) && preg_match('/^[1-9]\d{0,12}$/', $v)) return (int) $v;
        $k = 'jugador_id';
        throw new Fallo('Falta "' . $k . '".', 400, ['codigo' => 'falta_' . $k]);   // prefijo falta_<campo> → falta_dato
    }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $post = function () use ($metodo, $jugador): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            if (Limite::contar('visitas:' . $jugador, 60)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
            return Http::entrada(8 * 1024);
        };
        $get = function () use ($metodo, $jugador): void {
            if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
            if (Limite::contar('visitas_ver:' . $jugador, 240)) Http::error(429, 'Demasiadas visitas seguidas. Espera un momento.', [], 'limite_intentos');
        };
        switch ($ruta) {
            case '/visitas/vitrina':
                $get();
                Http::json(200, Visitas::ver($jugador, self::id($_GET['jugador_id'] ?? null)));
            case '/visitas/aplaudir':
                $in = $post();
                Http::json(200, Visitas::aplaudir($jugador, self::id($in['jugador_id'] ?? null)));
            case '/visitas/sugeridas':
                $get();
                Http::json(200, Visitas::sugeridas($jugador));
            case '/visitas/ajustes':
                if ($metodo === 'GET') { $get(); Http::json(200, Visitas::ajustes($jugador)); }
                $in = $post();
                Http::json(200, Visitas::guardarAjustes($jugador, $in['permitir'] ?? null));
        }
        Http::error(404, 'No encontrado.');
    }
}
