<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * POST /api/eventos: lotes de la analítica propia (js/analitica.js). Sesión opcional (si hay, el servidor anota el
 * jugador_id; el juego nunca lo manda). La llama api.php con UNA línea ANTES de la revisión de X-Envivo, porque al
 * esconder la página el juego usa navigator.sendBeacon, que no puede poner cabeceras propias (INTEGRAR_ANALITICA.md):
 *  - con X-Envivo: 1 (fetch normal) pasa como cualquier POST del juego;
 *  - sin X-Envivo (sendBeacon) solo si el navegador dice que es del mismo sitio (Sec-Fetch-Site same-origin, o el
 *    Origin es el del juego); si no, 403 cabecera_requerida (otro sitio no puede mandar eventos con la galleta del jugador).
 * Límites: 32 KB por lote, 50 eventos, 40 lotes por instalación y 600 por conexión cada 10 minutos (429).
 * Respuesta: {ok:true, aceptados, rechazados}. Con la analítica apagada
 * (ENVIVO_ANALITICA=0 en config.env) responde {ok:true, aceptados:0, apagada:true} para que el juego vacíe su cola.
 */
final class AnaliticaApi
{
    public const RUTAS = ['/eventos'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, ?int $jugador): never
    {
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1' && !self::mismoSitio()) Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        if (Config::get('ENVIVO_ANALITICA', '1') === '0') Http::json(200, ['ok' => true, 'aceptados' => 0, 'rechazados' => 0, 'apagada' => true]);
        $in = Http::entrada(Analitica::MAX_CUERPO);
        if ($in === []) Http::error(400, 'Datos de analítica no válidos.', [], 'analitica_invalida');
        $inst = is_string($in['i'] ?? null) ? substr($in['i'], 0, 40) : '';
        if (Limite::contar('analitica:ip:' . Http::ip(), Analitica::LIMITE_IP) || ($inst !== '' && Limite::contar('analitica:i:' . $inst, Analitica::LIMITE_INSTALACION))) {
            Http::error(429, 'Demasiados eventos seguidos. Espera un momento.', [], 'limite_intentos');
        }
        Http::json(200, Analitica::recibir($in, $jugador, (string) ($_SERVER['HTTP_CF_IPCOUNTRY'] ?? '')));
    }

    /** ¿El navegador dice que la petición viene de una página del juego? (para sendBeacon, que no lleva X-Envivo) */
    public static function mismoSitio(): bool
    {
        $sfs = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
        if ($sfs !== '') return $sfs === 'same-origin';
        $o = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($o !== '') return $o === Http::urlBase();
        return false;   // sin ninguna de las dos (navegador muy viejo o un programa): no
    }
}
