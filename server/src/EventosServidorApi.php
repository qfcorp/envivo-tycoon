<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas de los eventos del servidor y del adviento (EventosServidor.php; api.php las llama con UNA línea;
 * contrato en server/INTEGRAR_EVENTOS_SERVIDOR.md):
 *   GET  /api/eventos_servidor            calendario, eventos en curso (tienda, fichas, objetivo común, tabla) y adviento.
 *                                Sin sesión también (sin fichas ni objetivo). Cache-Control: private, max-age=10.
 *   POST /api/eventos_servidor/diario     {instancia}                 5 fichas una vez al día
 *   POST /api/eventos_servidor/jugar      {eventos: [{ref, estrellas}]} eventos jugados en la partida (fichas + objetivo común)
 *   POST /api/eventos_servidor/comprar    {instancia, articulo}       tienda de temporada (con fichas)
 *   POST /api/eventos_servidor/meta       {instancia, hito}           premio del objetivo común (mitad | meta)
 *   POST /api/eventos_servidor/adviento   {dia}                       regalo del calendario de adviento (hoy o el de ayer)
 * Los POST piden sesión y la cabecera X-Envivo: 1.
 */
final class EventosServidorApi
{
    public const RUTAS = ['/eventos_servidor', '/eventos_servidor/diario', '/eventos_servidor/jugar', '/eventos_servidor/comprar', '/eventos_servidor/meta', '/eventos_servidor/adviento'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, ?int $jugador): never
    {
        if ($ruta === '/eventos_servidor') {
            if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
            $d = EventosServidor::estado($jugador ?: null);
            http_response_code(200);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: private, max-age=10');
            header('Vary: Cookie');
            header('X-Content-Type-Options: nosniff');
            echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        if (!$jugador) Http::error(401, 'Crea tu cuenta gratis (o entra) para participar en los eventos.', [], 'sesion_requerida');
        $in = Http::entrada(16 * 1024);
        $txt = fn(string $k): string => is_string($in[$k] ?? null) ? mb_substr($in[$k], 0, 60) : '';
        Http::json(200, match ($ruta) {
            '/eventos_servidor/diario' => EventosServidor::diario($jugador, $txt('instancia')),
            '/eventos_servidor/jugar' => EventosServidor::jugar($jugador, $in['eventos'] ?? null),
            '/eventos_servidor/comprar' => EventosServidor::comprar($jugador, $txt('instancia'), $txt('articulo')),
            '/eventos_servidor/meta' => EventosServidor::reclamarMeta($jugador, $txt('instancia'), $txt('hito')),
            '/eventos_servidor/adviento' => EventosServidor::adviento($jugador, is_int($in['dia'] ?? null) ? $in['dia'] : (int) ($in['dia'] ?? 0)),
        });
    }
}
