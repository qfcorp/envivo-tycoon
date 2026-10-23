<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Compras con dinero real (Pago Plux y PayPal en la web, Google Play en la app).
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

    public static function inicioComprado(int $jugador): bool { return self::yaComprado($jugador, 'inicio'); }

    /** ¿Ya pagó este producto? (para los de una sola vez; una compra revertida también cuenta: no se vuelve a vender). */
    public static function yaComprado(int $jugador, string $producto): bool
    {
        return (bool) Db::valor("SELECT 1 FROM compras WHERE jugador_id = ? AND producto = ? AND estado IN ('pagado', 'revertido') LIMIT 1", [$jugador, $producto]);
    }

    /** Las últimas compras del jugador (para el formulario de soporte). */
    public static function recientes(int $jugador, int $n = 10): array
    {
        return array_map(fn($c) => ['id' => (int) $c['id'], 'producto' => $c['producto'], 'nombre' => (Catalogo::productoCompra((string) $c['producto'])['nombre'] ?? $c['producto']),
            'total' => (float) $c['total'], 'estado' => $c['estado'], 'canal' => $c['canal'], 'creado' => Db::iso((int) $c['creado'])],
            Db::todas('SELECT * FROM compras WHERE jugador_id = ? ORDER BY id DESC LIMIT ' . $n, [$jugador]));
    }

    /** Revisa si el producto se puede comprar ahora (activo, una sola vez, cuenta no suspendida). Lanza Fallo. */
    public static function exigirComprable(int $jugador, array $p): void
    {
        Cuentas::exigirActiva($jugador);
        Fallo::si(!$p['activo'], 'Ese producto no está disponible ahora.', 409, ['codigo' => 'producto_inactivo']);
        Fallo::si($p['una_vez'] && self::yaComprado($jugador, $p['id']), 'Ya compraste el ' . $p['nombre'] . '. Solo se puede comprar una vez.', 409, ['codigo' => 'ya_comprado']);
        // Reglas propias de los módulos de monetización (server/MONETIZACION.md), solo si el módulo está instalado
        if (($p['tipo'] ?? '') === 'pase' && class_exists(Pase::class) && method_exists(Pase::class, 'exigirComprable')) Pase::exigirComprable($jugador, $p['id']);   // 409 pase_ya_premium / sin_temporada
        if (!empty($p['oferta_vip']) && class_exists(Vip::class) && method_exists(Vip::class, 'exigirOferta')) Vip::exigirOferta($jugador, $p);   // 409 oferta_no_disponible
    }

    /**
     * Crea la compra pendiente y devuelve la fila. Lanza Fallo con el texto y el código HTTP.
     * El precio, los créditos (con el bono de la oferta vigente) se guardan en la compra: lo que se pagó es lo que se entrega,
     * aunque después cambie el precio o termine la oferta.
     */
    public static function crear(int $jugador, string $producto, ?int $transferencia = null, string $metodo = 'tarjeta'): array
    {
        $p = Catalogo::producto($producto);
        if (!$p || (!empty($p['oculto']) && $transferencia === null)) throw new Fallo('Ese producto no existe en la tienda.', 404, ['codigo' => 'no_existe']);
        Ajustes::exigirTiendaAbierta();
        $paypal = $metodo === 'paypal';
        if ($paypal) {
            // PayPal (src/PayPal.php): solo en la web, con llaves y desde PAYPAL_MINIMO (la comisión se come las ventas chicas)
            if (!PayPal::configurado()) throw new Fallo('El pago con PayPal todavía no está disponible. Paga con tarjeta o intenta más tarde.', 503, ['codigo' => 'paypal_no_disponible']);
            if ($transferencia !== null || !PayPal::permite((float) $p['precio'])) {
                throw new Fallo('PayPal está disponible para compras desde ' . Http::dinero(PayPal::minimo()) . '. Paga con tarjeta.', 409, ['codigo' => 'paypal_minimo', 'minimo' => PayPal::minimo()]);
            }
        } elseif (!Plux::configurado()) {
            throw new Fallo('El pago con tarjeta todavía no está disponible. Intenta más tarde.', 503, ['codigo' => 'plux_no_disponible']);
        }
        return Db::tx(function () use ($jugador, $producto, $p, $transferencia, $paypal): array {
            self::exigirComprable($jugador, $p);
            return self::insertar($jugador, $p, $paypal ? 'web_paypal' : 'web_plux', $transferencia);
        });
    }

    /** Inserta la compra pendiente con los valores de este momento. Debe ir dentro de una transacción. */
    public static function insertar(int $jugador, array $p, string $canal, ?int $transferencia = null, array $google = []): array
    {
        $total = round((float) $p['precio'], 2);
        [$sub, $iva] = Catalogo::desglose($total);
        $gt = $google['token'] ?? null;
        Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, canal, creditos, bono_pct, transferencia_id, google_order_id, google_token, google_token_hash)
               VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?)",
            [bin2hex(random_bytes(16)), $jugador, $p['id'], $total, $sub, $iva, time(), $canal, (int) $p['creditos'], (int) $p['bono_pct'], $transferencia,
             ($google['order_id'] ?? '') !== '' ? $google['order_id'] : null, $gt, $gt === null ? null : hash('sha256', $gt)]);
        return self::porId(Db::ultimoId());
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
            if (!$c || $c['estado'] === 'pagado' || $c['estado'] === 'revertido') return [false, $c];   // nunca dos veces, ni después de un reembolso
            $previo = $c['estado'];
            Db::q("UPDATE compras SET estado = 'pagado', pagado_en = ?, pagado_por = ?, plux_paso = 'pagado',
                     plux_transaccion = COALESCE(?, plux_transaccion), plux_respuesta = COALESCE(?, plux_respuesta) WHERE id = ? AND estado <> 'pagado'",
                [time(), mb_substr($quien, 0, 150), $transaccion, $respuesta, $compraId]);
            $entregada = self::entregarCompra($c);
            if ($entregada) self::emitir('compra_aprobada', ['compra_id' => (int) $c['id'], 'jugador_id' => (int) $c['jugador_id'], 'producto' => (string) $c['producto'],
                'monto_usd' => round((float) $c['total'], 2), 'canal' => match ($c['canal']) { 'google_play' => 'google', 'web_paypal' => 'paypal', default => 'plux' }]);
            if ($previo === 'rechazado') Db::aviso('pagado_tras_rechazo', 'La compra N° ' . $compraId . ' estaba rechazada y luego llegó como pagada (' . $quien . '): se entregó.', $compraId);
            return [true, $c];
        });
        return $r[0];
    }

    /**
     * Avisa a los módulos (server/src/Ganchos.php, MONETIZACION.md §2). Nunca rompe la compra: Ganchos corre cada oyente
     * aparte (SAVEPOINT dentro de la transacción) y aquí se atrapa cualquier otra cosa. Sin Ganchos no hace nada.
     */
    private static function emitir(string $evento, array $datos): void
    {
        try {
            if (class_exists(Ganchos::class) && method_exists(Ganchos::class, 'emitir')) Ganchos::emitir($evento, $datos);
        } catch (\Throwable $e) {
            error_log('EN VIVO compras: gancho ' . $evento . ' ' . mb_substr($e->getMessage(), 0, 200));
        }
    }

    /**
     * Entrega lo comprado (se llama SOLO desde aprobar(), dentro de su transacción). false si no entregó nada
     * (producto desconocido o un "una sola vez" pagado dos veces): entonces tampoco se avisa a los módulos.
     * Los tipos de los módulos (pase, pase_copa, pack_obra) no traen entregas aquí: los entrega su gancho compra_aprobada.
     */
    private static function entregarCompra(array $c): bool
    {
        $j = (int) $c['jugador_id'];
        $id = (int) $c['id'];
        $p = Catalogo::productoCompra((string) $c['producto']);
        if (!$p) { Db::aviso('producto_desconocido', 'La compra N° ' . $id . ' es de un producto que ya no está en el catálogo (' . $c['producto'] . '): entregar a mano.', $id); return false; }
        $origen = 'compra:' . $id;
        if ($p['una_vez']) {
            $otra = Db::valor("SELECT id FROM compras WHERE jugador_id = ? AND producto = ? AND estado IN ('pagado', 'revertido') AND id <> ?", [$j, $c['producto'], $id]);
            if ($otra) {
                // Se cobró dos veces un producto de una sola vez (dos pagos casi al mismo tiempo): NO se entrega otra vez.
                Db::aviso($c['producto'] === 'inicio' ? 'inicio_duplicado' : 'una_vez_duplicado', 'El jugador ' . $j . ' pagó otra vez "' . $p['nombre'] . '" (compra N° ' . $id . ', la primera fue la N° ' . $otra . '). No se entregó: devolver el dinero o dar créditos a mano.', $id);
                return false;
            }
        }
        $lista = match ($p['tipo']) {
            'inicio' => Catalogo::INICIO_ENTREGAS,
            'bienvenida' => Catalogo::BIENVENIDA_ENTREGAS,
            'refuerzo_directo' => [$p['entrega']],
            'oferta' => $p['entregas'] ?? [],   // ofertas escalonadas del VIP: contenido fijo (Vip::PRODUCTOS_OFERTA)
            default => [],
        };
        foreach ($lista as $e) {
            if ($e['tipo'] === 'item') Inventario::crear($j, $e['item'], 'inicio', $origen);   // equipo: al inventario del servidor
            else Monedero::entregarDef($j, $e, $origen);
        }
        if ($p['tipo'] === 'vip') Monedero::sumarVip($j, (int) $p['dias']);
        if ($p['tipo'] === 'tarjeta') Monedero::sumarTarjeta($j, (int) $p['dias']);
        if ($p['tipo'] === 'transferencia' && $c['transferencia_id'] !== null) Transferencias::pagada((int) $c['transferencia_id'], $id);
        $cred = $c['creditos'] !== null ? (int) $c['creditos'] : (int) $p['creditos'];   // las compras viejas no guardaban los créditos
        if ($cred > 0) Monedero::mover($j, $cred, 'compra', $origen . ':' . $c['producto']);
        return true;
    }

    /**
     * Reembolso o contracargo (D): revierte lo que dio la compra y suspende la cuenta hasta que se resuelva.
     * - Créditos: se descuentan aunque ya los haya gastado (el saldo queda negativo como deuda).
     * - Equipos del inventario que dio la compra: se quitan si todavía son suyos (si los vendió, queda anotado).
     * - VIP / tarjeta mensual: se les quitan los días que dio la compra (si no queda nada, terminan ahora).
     * - Las entregas que ya aplicó el juego (repuestos, refuerzos) no se pueden quitar: quedan anotadas.
     * Idempotente: una compra ya revertida no se revierte otra vez. Devuelve un resumen o null si no se revirtió.
     */
    public static function revertir(int $compraId, string $tipo, string $motivo, string $quien): ?array
    {
        return Db::tx(function () use ($compraId, $tipo, $motivo, $quien): ?array {
            $c = self::porId($compraId);
            if (!$c || $c['estado'] !== 'pagado') return null;
            $j = (int) $c['jugador_id'];
            $id = (int) $c['id'];
            $origen = 'compra:' . $id;
            $res = ['creditos' => 0, 'equipos_quitados' => 0, 'equipos_ya_vendidos' => 0, 'vip' => false, 'tarjeta' => false];
            $dados = (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'compra' AND ref LIKE ?", [$j, $origen . ':%']);
            if ($dados > 0) { Monedero::mover($j, -$dados, 'reversion', $origen . ':' . $tipo, true); $res['creditos'] = $dados; }
            // Auditoría A-01: seguir el rastro de esos créditos en el mercado (lo retenido al vendedor se recupera)
            [$res['mercado_recuperados'], $res['mercado_ya_liberados']] = $dados > 0 ? Mercado::seguirRastro($j, (int) ($c['pagado_en'] ?? $c['creado']), $dados, $origen) : [0, 0];
            foreach (Db::todas('SELECT * FROM inventario WHERE ref = ?', [$origen]) as $inv) {
                if ((int) $inv['jugador_id'] === $j && $inv['estado'] !== 'revocado') {
                    Db::q("UPDATE mercado_publicaciones SET estado = 'quitada', cerrado = ? WHERE inventario_id = ? AND estado IN ('activa', 'congelada')", [time(), $inv['id']]);
                    Db::q("UPDATE inventario SET estado = 'revocado', actualizado = ? WHERE id = ?", [time(), $inv['id']]);
                    $res['equipos_quitados']++;
                } elseif ((int) $inv['jugador_id'] !== $j) {
                    $res['equipos_ya_vendidos']++;   // ya es de otro jugador (lo compró en el mercado de buena fe): no se le quita
                }
            }
            $p = Catalogo::productoCompra((string) $c['producto']);
            if ($p && in_array($p['tipo'], ['vip', 'tarjeta'], true)) {
                $col = $p['tipo'] === 'vip' ? 'vip_hasta' : 'tarjeta_hasta';
                $hasta = Db::valor("SELECT $col FROM jugadores WHERE id = ?", [$j]);
                if ($hasta !== null) {
                    $nuevo = (int) $hasta - (int) $p['dias'] * 86400;
                    Db::q("UPDATE jugadores SET $col = ? WHERE id = ?", [$nuevo <= time() ? time() - 1 : $nuevo, $j]);
                }
                $res[$p['tipo']] = true;
            }
            Db::q("UPDATE compras SET estado = 'revertido', revertida_en = ?, revertida_tipo = ?, revertida_motivo = ?, revertida_por = ? WHERE id = ?",
                [time(), $tipo, mb_substr($motivo, 0, 300), mb_substr($quien, 0, 80), $id]);
            // Los módulos quitan lo que dio la compra (pase, pase de copa, packs de obra, nivel VIP, cofres de regalo)
            self::emitir('compra_revertida', ['compra_id' => $id, 'jugador_id' => $j, 'motivo' => $tipo, 'detalle' => $motivo, 'producto' => (string) $c['producto']]);
            Cuentas::suspender($j, ($tipo === 'contracargo' ? 'Contracargo' : 'Reembolso') . ' de la compra N° ' . $id . ($motivo !== '' ? ': ' . $motivo : ''), $quien);
            $res['baneado'] = self::revisarAbuso($j, $tipo, $quien);
            Auditoria::anotar($quien, 'compra_' . $tipo, 'Compra N° ' . $id . ' (' . $c['producto'] . ', $' . $c['total'] . ') revertida: ' . json_encode($res) . ($motivo !== '' ? ' · ' . $motivo : ''), $j, $id);
            return $res;
        });
    }

    /**
     * Abuso de reembolsos (decisión del dueño): un contracargo, o N reembolsos en X días -> la cuenta queda BANEADA.
     * Las reglas están en Ajustes (se cambian en el Centro de Control): abuso_contracargo_banea (1/0),
     * abuso_reembolsos (2) y abuso_dias (180). Vale para Pago Plux, PayPal y Google Play. Devuelve true si la baneó ahora.
     */
    public static function revisarAbuso(int $jugador, string $tipo, string $quien): bool
    {
        $max = max(1, (int) Ajustes::get('abuso_reembolsos', '2'));
        $dias = max(1, (int) Ajustes::get('abuso_dias', '180'));
        $porContracargo = $tipo === 'contracargo' && Ajustes::get('abuso_contracargo_banea', '1') === '1';
        $n = (int) Db::valor("SELECT COUNT(*) FROM compras WHERE jugador_id = ? AND estado = 'revertido' AND revertida_en > ?", [$jugador, time() - $dias * 86400]);
        if (!$porContracargo && $n < $max) return false;
        if (Cuentas::estadoCuenta($jugador) === 'baneado') return false;
        $motivo = $porContracargo ? 'Contracargo de una compra' : $n . ' reembolsos en ' . $dias . ' días';
        Cuentas::cambiarEstado($jugador, 'baneado', $motivo, $quien);
        Db::aviso('abuso_reembolsos', 'La cuenta ' . $jugador . ' quedó BANEADA por abuso de reembolsos: ' . $motivo . '. Se puede levantar en el Centro de Control.');
        return true;
    }

    /** Marca rechazada una compra pendiente (aviso RECHAZADO de Plux, PAYMENT.CAPTURE.DENIED de PayPal). */
    public static function rechazar(int $compraId, string $respuesta): bool
    {
        return Db::q("UPDATE compras SET estado = 'rechazado', plux_paso = 'rechazado', plux_respuesta = ? WHERE id = ? AND estado = 'pendiente'", [$respuesta, $compraId])->rowCount() > 0;
    }
}
