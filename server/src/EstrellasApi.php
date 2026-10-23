<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas del Personal estrella y del Pase de Copa (api.php las llama con UNA línea; ver server/INTEGRAR_ESTRELLAS.md).
 *   GET  /api/estrellas                 → catálogo, contratos, fichas, equipos, bono, pase_copa
 *   POST /api/estrellas/contratar       {clave, modo: 'credito'|'fichas', partidos: 1|3|5, peticion?}
 *   POST /api/estrellas/asignar         {clave, equipo: 'copa'|'duelo', quitar?: true}
 *   POST /api/pase_copa/comprar         {modo?: 'credito'}   (con dinero: producto "pase_copa" por la tienda)
 * Todas con sesión. POST con X-Envivo: 1. Errores como Fallo → {ok:false, error, codigo} (api.php).
 */
final class EstrellasApi
{
    public const RUTAS = ['/estrellas' => 'GET', '/estrellas/contratar' => 'POST', '/estrellas/asignar' => 'POST', '/pase_copa/comprar' => 'POST'];

    public static function esRuta(string $ruta): bool { return isset(self::RUTAS[$ruta]); }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        $esperado = self::RUTAS[$ruta] ?? null;
        if ($esperado === null) Http::error(404, 'No encontrado.');
        if ($metodo !== $esperado) Http::error(405, 'Usa ' . $esperado . '.');
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $in = $metodo === 'POST' ? Http::entrada(16 * 1024) : [];
        Http::json(200, match ($ruta) {
            '/estrellas' => Estrellas::estado($jugador),
            '/estrellas/contratar' => Estrellas::contratar($jugador, $in),
            '/estrellas/asignar' => Estrellas::asignar($jugador, $in),
            '/pase_copa/comprar' => Estrellas::comprarPase($jugador, $in),
        });
    }
}
