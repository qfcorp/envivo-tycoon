<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/asoc/... de AyudaAsoc (ayudas de un toque, investigación y tienda de fichas). Las llama api.php con UNA
 * línea (server/INTEGRAR_AYUDA_ASOC.md). Todas con sesión; POST con X-Envivo: 1 y límite de acciones seguidas.
 */
final class AyudaAsocApi
{
    public const RUTAS = ['/asoc/ayuda', '/asoc/ayuda/resumen', '/asoc/ayuda/pedir', '/asoc/ayuda/todos', '/asoc/investigacion/donar', '/asoc/tienda/comprar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $post = function () use ($metodo, $jugador): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            if (Limite::contar('asoc_ayuda:' . $jugador, 90)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.', [], 'limite_intentos');
            return Http::entrada(16 * 1024);
        };
        $get = function () use ($metodo): void { if ($metodo !== 'GET') Http::error(405, 'Usa GET.'); };
        $txt = fn(array $in, string $k): string => is_string($in[$k] ?? null) ? mb_substr($in[$k], 0, 40) : '';
        switch ($ruta) {
            case '/asoc/ayuda':
                $get();
                Http::json(200, AyudaAsoc::vista($jugador));
            case '/asoc/ayuda/resumen':
                $get();
                Http::json(200, AyudaAsoc::resumen($jugador));
            case '/asoc/ayuda/pedir':
                $in = $post();
                $v = $in['obra_id'] ?? null;
                $id = null;
                if ($v !== null) {
                    if (is_int($v) && $v > 0) $id = $v;
                    elseif (is_string($v) && preg_match('/^[1-9]\d{0,12}$/', $v)) $id = (int) $v;
                    else throw new Fallo('"obra_id" no es válido.', 400, ['codigo' => 'datos_invalidos']);
                }
                Http::json(200, AyudaAsoc::pedir($jugador, $id));
            case '/asoc/ayuda/todos':
                $post();
                Http::json(200, AyudaAsoc::ayudarTodos($jugador));
            case '/asoc/investigacion/donar':
                $in = $post();
                $mat = $txt($in, 'material');
                Http::json(200, AyudaAsoc::donar($jugador, $txt($in, 'tech'), $txt($in, 'tipo'), $mat === '' ? null : $mat, ($in['pagado_en_juego'] ?? false) === true));
            case '/asoc/tienda/comprar':
                $in = $post();
                Http::json(200, AyudaAsoc::comprar($jugador, $txt($in, 'item')));
        }
        Http::error(404, 'No encontrado.');
    }
}
