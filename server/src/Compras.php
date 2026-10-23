<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Compras con dinero real (Pago Plux).
 * - Una compra nace "pendiente" con su valor FIJO del catálogo (total con IVA, subtotal e IVA aparte para la factura).
 * - aprobar() es IDEMPOTENTE y va en UNA transacción: marca "pagado" una sola vez y entrega una sola vez.
 *   Si llega dos veces (pago + aviso de Plux, recargar la página del banco...), la segunda no hace nada.
 * - El paquete de inicio solo se puede comprar una vez por cuenta.
 */
final class Compras
{
    public static function porToken(string $tok): ?array
    {
        return preg_match('/^[a-f0-9]{32}$/', $tok) ? Db::fila('SELECT * FROM compras WHERE token = ?', [$tok]) : null;
    }

    public static function porId(int $id): ?array { return Db::fila('SELECT * FROM compras WHERE id = ?', [$id]); }

    public static function inicioComprado(int $jugador): bool
    {
        return (bool) Db::valor("SELECT 1 FROM compras WHERE jugador_id = ? AND producto = 'inicio' AND estado = 'pagado' LIMIT 1", [$jugador]);
    }

    /** Crea la compra pendiente y devuelve la fila. Lanza \RuntimeException con el texto y el código HTTP. */
    public static function crear(int $jugador, string $producto): array
    {
        $p = Catalogo::producto($producto);
        if (!$p) throw new \RuntimeException('Ese producto no existe en la tienda.', 404);
        if (!Plux::configurado()) throw new \RuntimeException('El pago con tarjeta todavía no está disponible. Intenta más tarde.', 503);
        return Db::tx(function () use ($jugador, $producto, $p): array {
            if ($p['una_vez'] && Db::valor("SELECT 1 FROM compras WHERE jugador_id = ? AND producto = ? AND estado = 'pagado'", [$jugador, $producto])) {
                throw new \RuntimeException('Ya compraste el ' . $p['nombre'] . '. Solo se puede comprar una vez.', 409);
            }
            $total = round((float) $p['precio'], 2);
            [$sub, $iva] = Catalogo::desglose($total);
            $tok = bin2hex(random_bytes(16));
            Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado) VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)",
                [$tok, $jugador, $producto, $total, $sub, $iva, time()]);
            return self::porId(Db::ultimoId());
        });
    }

    /** Guarda los datos del comprador (para la factura del SRI). Nunca datos de tarjeta. */
    public static function anotarComprador(int $compra, array $c): void
    {
        Db::q("UPDATE compras SET comprador_cedula = ?, comprador_nombre = ?, comprador_email = ?, comprador_telefono = ? WHERE id = ? AND estado = 'pendiente'",
            [$c['cedula'], $c['nombre'], $c['email'], $c['telefono'], $compra]);
    }

    /** Anota en qué paso va el pago con Plux (otp, 3ds, fallido) y la respuesta ya limpia. */
    public static function anotarPaso(int $compra, string $paso, string $respuesta, string $transaccion = ''): void
    {
        Db::q("UPDATE compras SET plux_paso = ?, plux_respuesta = ?, plux_transaccion = COALESCE(NULLIF(?, ''), plux_transaccion) WHERE id = ? AND estado = 'pendiente'",
            [$paso, $respuesta, $transaccion, $compra]);
    }

    /**
     * Marca la compra como pagada y entrega lo comprado. Devuelve true si la aprobó ahora, false si ya estaba pagada.
     * $respuesta debe venir ya limpia (Plux::texto).
     */
    public static function aprobar(int $compraId, string $quien, ?string $transaccion = null, ?string $respuesta = null): bool
    {
        $r = Db::tx(function () use ($compraId, $quien, $transaccion, $respuesta): array {
            $c = self::porId($compraId);
            if (!$c || $c['estado'] === 'pagado') return [false, $c];
            $previo = $c['estado'];
            Db::q("UPDATE compras SET estado = 'pagado', pagado_en = ?, pagado_por = ?, plux_paso = 'pagado',
                     plux_transaccion = COALESCE(?, plux_transaccion), plux_respuesta = COALESCE(?, plux_respuesta) WHERE id = ? AND estado <> 'pagado'",
                [time(), mb_substr($quien, 0, 150), $transaccion, $respuesta, $compraId]);
            self::entregarCompra($c);
            if ($previo === 'rechazado') Db::aviso('pagado_tras_rechazo', 'La compra N° ' . $compraId . ' estaba rechazada y luego llegó como pagada (' . $quien . '): se entregó.', $compraId);
            return [true, $c];
        });
        return $r[0];
    }

    /** Entrega lo comprado (se llama SOLO desde aprobar(), dentro de su transacción). */
    private static function entregarCompra(array $c): void
    {
        $j = (int) $c['jugador_id'];
        $id = (int) $c['id'];
        $p = Catalogo::producto((string) $c['producto']);
        if (!$p) { Db::aviso('producto_desconocido', 'La compra N° ' . $id . ' es de un producto que ya no está en el catálogo (' . $c['producto'] . '): entregar a mano.', $id); return; }
        $origen = 'compra:' . $id;
        if ($p['tipo'] === 'inicio') {
            $otra = Db::valor("SELECT id FROM compras WHERE jugador_id = ? AND producto = 'inicio' AND estado = 'pagado' AND id <> ?", [$j, $id]);
            if ($otra) {
                // Se cobró dos veces el paquete de inicio (dos pagos casi al mismo tiempo): NO se entrega otra vez.
                Db::aviso('inicio_duplicado', 'El jugador ' . $j . ' pagó otra vez el paquete de inicio (compra N° ' . $id . ', la primera fue la N° ' . $otra . '). No se entregó: devolver el dinero en Plux o dar créditos a mano.', $id);
                return;
            }
            foreach (Catalogo::INICIO_ENTREGAS as $e) Monedero::entregar($j, $e['tipo'], $e['item'], (int) $e['cantidad'], $origen);
        }
        if ($p['tipo'] === 'vip') {
            Monedero::sumarVip($j, (int) $p['dias']);
        }
        if ((int) $p['creditos'] > 0) Monedero::mover($j, (int) $p['creditos'], 'compra', $origen . ':' . $c['producto']);
    }

    /** Marca rechazada una compra pendiente (aviso RECHAZADO de Plux). */
    public static function rechazar(int $compraId, string $respuesta): bool
    {
        return Db::q("UPDATE compras SET estado = 'rechazado', plux_paso = 'rechazado', plux_respuesta = ? WHERE id = ? AND estado = 'pendiente'", [$respuesta, $compraId])->rowCount() > 0;
    }
}
