<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * POST /api/error: errores del juego (js/errores.js). La llama api.php con UNA línea ANTES de revisar la cabecera X-Envivo
 * (ver server/INTEGRAR_ERRORES.md), porque navigator.sendBeacon no puede mandar cabeceras propias. A cambio:
 *  - se rechaza lo que viene de otro sitio (Sec-Fetch-Site: cross-site, u Origin de otro dominio);
 *  - no hace falta sesión (si hay, se anota el jugador); 30 errores por hora y por IP; 32 KB por petición; 10 por lote.
 * Cuerpo (JSON; el tipo de contenido puede ser text/plain, como lo manda sendBeacon):
 *   {"errores": [{mensaje, pila, archivo, linea, columna, url, version, idioma, plataforma, memoria, conexion, ultimo_paso, contexto, tipo}]}
 *   (o un solo error sin la lista). Respuesta: {ok: true, guardados, descartados}; 429 si la IP ya pasó el límite.
 */
final class ErroresApi
{
    public const RUTAS = ['/error'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo): never
    {
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (!self::mismoSitio()) Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $ip = Http::ip();
        if (Errores::limitado($ip)) Http::error(429, 'Demasiados reportes de errores. Espera un rato.', [], 'limite_intentos');
        $t = (string) file_get_contents('php://input', false, null, 0, Errores::MAX_CUERPO + 1);
        if (strlen($t) > Errores::MAX_CUERPO) Http::error(413, 'La información enviada es demasiado grande.');
        $in = json_decode($t, true);
        if (!is_array($in)) Http::error(400, 'Datos no válidos.', [], 'datos_invalidos');
        $lote = isset($in['errores']) && is_array($in['errores']) ? $in['errores'] : (isset($in['mensaje']) ? [$in] : []);
        if (!$lote) Http::error(400, 'Falta "errores".', [], 'datos_invalidos');
        $jugador = null;
        try { $jugador = Sesiones::jugadorId(); } catch (\Throwable) {}
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        $r = Errores::registrar($lote, $jugador, $ip, Http::navegador(), preg_match('/^[A-Za-z0-9.\-]+(:\d+)?$/', $host) ? $host : '');
        if ($r['guardados'] === 0 && $r['limitado']) Http::error(429, 'Demasiados reportes de errores. Espera un rato.', [], 'limite_intentos');
        Http::json(200, ['ok' => true, 'guardados' => $r['guardados'], 'descartados' => $r['descartados']]);
    }

    /** ¿La petición viene del juego (mismo sitio)? Sin Origin ni Sec-Fetch-Site (navegadores viejos, curl) se acepta. */
    private static function mismoSitio(): bool
    {
        $sfs = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
        if ($sfs === 'cross-site') return false;
        $o = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($o === '' || $o === 'null') return $o === '' || $sfs === 'same-origin';
        $h = parse_url($o, PHP_URL_HOST);
        $p = parse_url($o, PHP_URL_PORT);
        $origen = strtolower((string) $h) . ($p ? ':' . $p : '');
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        return $origen === $host || rtrim($o, '/') === Http::urlBase();
    }
}
