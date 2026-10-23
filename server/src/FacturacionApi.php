<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * API para el ERP del dueño (facturación SRI): /api/facturacion/*. NO usa la sesión del juego ni la cabecera X-Envivo:
 * cada petición va firmada con HMAC-SHA256 (FACTURACION_CLAVE) y, si está FACTURACION_IPS, solo desde esas IPs.
 *   GET  /api/facturacion/ping                    prueba de la firma (no cambia nada)
 *   GET  /api/facturacion/pendientes?limite=50&desde_id=0
 *   GET  /api/facturacion/comprobante?id=123
 *   POST /api/facturacion/confirmar               {id, estado, clave_acceso, numero_autorizacion, ...} o {confirmaciones: [...]}
 * Contrato: docs/FACTURACION_SRI.md. Línea en api.php (antes de la revisión de X-Envivo): ver server/INTEGRAR_FACTURACION.md.
 */
final class FacturacionApi
{
    public static function esRuta(string $ruta): bool { return $ruta === '/facturacion' || str_starts_with($ruta, '/facturacion/'); }

    public static function responder(string $ruta, string $metodo): never
    {
        try {
            $cuerpo = (string) file_get_contents('php://input', false, null, 0, 200001);
            if (strlen($cuerpo) > 200000) Http::error(413, 'La información enviada es demasiado grande.');
            $h = fn(string $k) => is_string($_SERVER[$k] ?? null) ? trim($_SERVER[$k]) : '';
            $uri = (string) ($_SERVER['REQUEST_URI'] ?? $ruta);
            Facturacion::autenticar($metodo, $uri, $cuerpo, $h('HTTP_X_FACTURA_FECHA'), $h('HTTP_X_FACTURA_NONCE'), $h('HTTP_X_FACTURA_FIRMA'), Http::ip());
            $soloGet = fn() => $metodo === 'GET' || Http::error(405, 'Usa GET.');
            $soloPost = fn() => $metodo === 'POST' || Http::error(405, 'Usa POST.');
            $int = fn(string $k, int $def) => ($v = filter_var($_GET[$k] ?? null, FILTER_VALIDATE_INT)) === false || $v === null ? $def : (int) $v;
            match ($ruta) {
                '/facturacion/ping' => $soloGet() && Http::json(200, ['ok' => true, 'ahora' => Db::iso(Facturacion::ahora()), 'activa' => Facturacion::activa(),
                    'webhook' => Facturacion::webhookUrl() !== '', 'tope_consumidor_final' => Facturacion::topeConsumidorFinal()]),
                '/facturacion/pendientes' => $soloGet() && Http::json(200, Facturacion::pendientes($int('limite', 50), $int('desde_id', 0))),
                '/facturacion/comprobante' => $soloGet() && self::comprobante($int('id', 0)),
                '/facturacion/confirmar' => $soloPost() && self::confirmar($cuerpo),
                default => Http::error(404, 'No encontrado.'),
            };
        } catch (Fallo $e) {
            Http::error($e->getCode() ?: 400, $e->getMessage(), $e->extra);
        }
    }

    private static function comprobante(int $id): never
    {
        $f = $id > 0 ? Facturacion::porId($id) : null;
        if (!$f) throw new Fallo('No existe el comprobante ' . $id . '.', 404, ['codigo' => 'facturacion_no_existe']);
        Http::json(200, ['ok' => true, 'comprobante' => Facturacion::json($f)]);
    }

    private static function confirmar(string $cuerpo): never
    {
        $in = json_decode($cuerpo, true);
        if (!is_array($in)) throw new Fallo('El cuerpo debe ser JSON.', 400, ['codigo' => 'datos_invalidos']);
        if (!isset($in['confirmaciones'])) Http::json(200, Facturacion::confirmar($in));
        // Lote: cada una por separado (una mala no detiene a las demás)
        if (!is_array($in['confirmaciones']) || !array_is_list($in['confirmaciones']) || count($in['confirmaciones']) > 100) {
            throw new Fallo('"confirmaciones" debe ser una lista de hasta 100.', 400, ['codigo' => 'datos_invalidos']);
        }
        $res = [];
        foreach ($in['confirmaciones'] as $c) {
            try {
                $res[] = Facturacion::confirmar(is_array($c) ? $c : []);
            } catch (Fallo $e) {
                $res[] = ['ok' => false, 'id' => is_array($c) && is_int($c['id'] ?? null) ? $c['id'] : null, 'error' => $e->getMessage(), 'codigo' => $e->extra['codigo'] ?? 'error', 'http' => $e->getCode()];
            }
        }
        Http::json(200, ['ok' => true, 'resultados' => $res]);
    }
}
