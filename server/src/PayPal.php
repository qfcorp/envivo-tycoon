<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Pago con PayPal en la tienda WEB (nunca en la app de Google Play). PayPal Checkout con la API de Órdenes v2, por
 * REDIRECCIÓN (sin el JavaScript de PayPal en nuestras páginas: la CSP de pago.php sigue siendo solo 'self').
 * Guía para el dueño: docs/PAYPAL.md.
 *
 * Configuración (/etc/envivo/config.env, NUNCA en el código: el repositorio es público):
 *   PAYPAL_CLIENT_ID, PAYPAL_SECRET   credenciales REST de developer.paypal.com (sin ellas el botón no aparece)
 *   PAYPAL_WEBHOOK_ID                  id del webhook creado en developer.paypal.com (sin él los avisos se rechazan: 503)
 *   PAYPAL_AMBIENTE                    sandbox (por defecto) | produccion
 *   PAYPAL_MINIMO                      precio mínimo con PayPal (por defecto 4.99): la comisión en Ecuador es 5,4 % + $0,30
 *                                      por pago, que en una venta de $0,99 se come cerca de 35 %.
 *   PAYPAL_API_BASE                    SOLO PRUEBAS (PayPal falso local); en produccion se ignora.
 *
 * Flujo (nunca se confía en el navegador):
 *  1. POST /api/orden {producto, metodo: "paypal"}: compra pendiente con canal 'web_paypal' y el valor del CATÁLOGO.
 *  2. pago.php?o=<token>: datos de la factura SRI + "Pagar con PayPal" -> POST /api/paypal/crear: este servidor crea la
 *     orden en PayPal (intent CAPTURE, USD, el valor de la compra, custom_id "EV-<compra>") y manda al comprador a PayPal.
 *  3. PayPal vuelve a /api/paypal/volver?token=<orden>: este servidor CAPTURA la orden y revisa estado COMPLETED, moneda
 *     USD, valor y custom_id antes de entregar (Compras::aprobar, idempotente: una compra por orden y por captura).
 *  4. Webhook /api/paypal/webhook (firma revisada con verify-webhook-signature): PAYMENT.CAPTURE.COMPLETED entrega lo que
 *     quedó pendiente; REFUNDED (total) / REVERSED / CUSTOMER.DISPUTE.CREATED revierten la compra con Compras::revertir
 *     (lo mismo que Plux y Google: se quitan los créditos, la cuenta se suspende y Facturacion crea la nota de crédito).
 *     CHECKOUT.ORDER.APPROVED captura la orden si el comprador cerró el navegador antes de volver.
 */
final class PayPal
{
    public const URL_SANDBOX = 'https://api-m.sandbox.paypal.com/';
    public const URL_PRODUCCION = 'https://api-m.paypal.com/';
    public const MINIMO_POR_DEFECTO = 4.99;
    /** Eventos del webhook que se atienden (los mismos que se marcan en developer.paypal.com, docs/PAYPAL.md). */
    public const EVENTOS = ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REFUNDED',
        'PAYMENT.CAPTURE.REVERSED', 'CUSTOMER.DISPUTE.CREATED'];

    private static ?array $token = null;

    // ============================================================================================ configuración
    public static function ambiente(): string { return Config::get('PAYPAL_AMBIENTE', 'sandbox') === 'produccion' ? 'produccion' : 'sandbox'; }

    public static function configurado(): bool { return Config::get('PAYPAL_CLIENT_ID') !== '' && Config::get('PAYPAL_SECRET') !== ''; }

    public static function webhookConfigurado(): bool { return Config::get('PAYPAL_WEBHOOK_ID') !== ''; }

    /** Precio mínimo (con IVA) para ofrecer PayPal. */
    public static function minimo(): float
    {
        $v = Config::get('PAYPAL_MINIMO');
        if ($v === '' || !is_numeric(str_replace(',', '.', $v))) return self::MINIMO_POR_DEFECTO;
        return max(0.0, round((float) str_replace(',', '.', $v), 2));
    }

    /** ¿Se puede pagar este valor con PayPal? (con llaves y desde el mínimo) */
    public static function permite(float $total): bool { return self::configurado() && round($total, 2) >= self::minimo() - 0.001; }

    /** Lo que recibe el juego en GET /api/estado (sin nada secreto). */
    public static function estado(): array
    {
        return ['disponible' => self::configurado(), 'ambiente' => self::ambiente(), 'minimo' => self::minimo()];
    }

    public static function urlBase(): string
    {
        // Solo para pruebas (PayPal falso local). En produccion se ignora, y fuera de 127.0.0.1 debe ser https.
        $o = Config::get('PAYPAL_API_BASE');
        if ($o !== '' && self::ambiente() !== 'produccion' && preg_match('#^(https://[^\s]+/|http://(127\.0\.0\.1|localhost)(:\d+)?/[^\s]*)$#', $o)) return $o;
        return self::ambiente() === 'produccion' ? self::URL_PRODUCCION : self::URL_SANDBOX;
    }

    /** ¿Es una dirección de PayPal a la que se puede mandar al comprador? (https y *.paypal.com; en pruebas, el PayPal falso) */
    public static function urlAprobacionValida(string $u): bool
    {
        if (!preg_match('#^https://([a-z0-9.-]+)/#i', $u, $m)) {
            $base = self::urlBase();
            return str_starts_with($base, 'http://') && str_starts_with($u, rtrim($base, '/') . '/');
        }
        $h = strtolower($m[1]);
        return $h === 'paypal.com' || str_ends_with($h, '.paypal.com');
    }

    public static function quien(string $origen): string { return 'PayPal' . (self::ambiente() === 'sandbox' ? ' (PRUEBAS)' : '') . ' · ' . $origen; }

    /** Referencia que va en la orden y vuelve en la captura, los reembolsos y las disputas. */
    public static function referencia(array $compra): string { return 'EV-' . (int) $compra['id']; }

    // ============================================================================================ HTTP
    /** @return array{0:int,1:?array,2:string} [código HTTP, JSON, texto] (0 si no hubo conexión) */
    private static function http(string $metodo, string $url, ?string $cuerpo, array $cab): array
    {
        $ch = curl_init($url);
        $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 10,
              CURLOPT_SSL_VERIFYPEER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP];
        if ($cuerpo !== null) $o[CURLOPT_POSTFIELDS] = $cuerpo;
        curl_setopt_array($ch, $o);
        $r = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);
        if ($r === false) return [0, null, ''];
        $j = json_decode((string) $r, true);
        return [$code, is_array($j) ? $j : null, (string) $r];
    }

    /** Token OAuth2 (client_credentials). Se guarda solo en memoria de esta petición. */
    private static function token(): string
    {
        if (self::$token !== null && self::$token['vence'] > time() + 60) return self::$token['valor'];
        [$c, $j] = self::http('POST', self::urlBase() . 'v1/oauth2/token', 'grant_type=client_credentials', [
            'Accept: application/json', 'Content-Type: application/x-www-form-urlencoded',
            'Authorization: Basic ' . base64_encode(Config::get('PAYPAL_CLIENT_ID') . ':' . Config::get('PAYPAL_SECRET'))]);
        if ($c !== 200 || !is_string($j['access_token'] ?? null) || $j['access_token'] === '') {
            error_log('EN VIVO PayPal: el token respondió ' . $c);   // nunca las credenciales
            throw new Fallo('No se pudo conectar con PayPal. Intenta otra vez en unos minutos.', 502, ['codigo' => 'paypal_error']);
        }
        self::$token = ['valor' => $j['access_token'], 'vence' => time() + max(120, (int) ($j['expires_in'] ?? 3600))];
        return self::$token['valor'];
    }

    /** Llamada a la API con el token (si PayPal responde 401, pide otro y reintenta una vez). */
    private static function api(string $metodo, string $ruta, ?string $cuerpo = null, array $extra = []): array
    {
        $cab = fn() => array_merge(['Accept: application/json', 'Content-Type: application/json', 'Authorization: Bearer ' . self::token()], $extra);
        $r = self::http($metodo, self::urlBase() . $ruta, $cuerpo, $cab());
        if ($r[0] === 401) { self::$token = null; $r = self::http($metodo, self::urlBase() . $ruta, $cuerpo, $cab()); }
        return $r;
    }

    /** Texto para guardar (sin nada de la cuenta del comprador más allá de lo necesario). */
    public static function texto(mixed $r): string
    {
        $limpio = function (mixed $v) use (&$limpio): mixed {
            if (!is_array($v)) return is_string($v) ? mb_substr($v, 0, 300) : $v;
            $o = [];
            foreach ($v as $k => $x) {
                if (is_string($k) && preg_match('/^(payer|payment_source|shipping|address|phone|links|birth_date|tax_info)$/i', $k)) continue;
                $o[$k] = $limpio($x);
            }
            return $o;
        };
        return mb_substr((string) json_encode($limpio($r), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 3000);
    }

    private static function nombreIssue(?array $j): string
    {
        $d = $j['details'][0]['issue'] ?? ($j['name'] ?? '');
        return is_string($d) ? mb_substr(preg_replace('/[^A-Z0-9_]/', '', strtoupper($d)) ?? '', 0, 60) : '';
    }

    // ============================================================================================ órdenes
    public static function orden(string $id): ?array
    {
        return preg_match('/^[A-Z0-9]{5,40}$/', $id) ? Db::fila('SELECT * FROM paypal_ordenes WHERE order_id = ?', [$id]) : null;
    }

    /**
     * Crea la orden en PayPal para una compra pendiente (canal web_paypal) y devuelve la dirección de PayPal a donde ir.
     * El valor SIEMPRE sale de la compra (que salió del catálogo). Lanza Fallo.
     */
    public static function crearOrden(array $compra): string
    {
        Fallo::si(!self::configurado(), 'El pago con PayPal todavía no está disponible.', 503, ['codigo' => 'paypal_no_disponible']);
        Fallo::si(($compra['canal'] ?? '') !== 'web_paypal', 'Esta compra es para pagar con tarjeta. Vuelve a la tienda y elige PayPal.', 409, ['codigo' => 'paypal_metodo_distinto']);
        $total = round((float) $compra['total'], 2);
        Fallo::si(!self::permite($total), 'PayPal está disponible para compras desde ' . Http::dinero(self::minimo()) . '. Paga con tarjeta.', 409, ['codigo' => 'paypal_minimo', 'minimo' => self::minimo()]);
        $p = Catalogo::productoCompra((string) $compra['producto']);
        $nombre = mb_substr((string) ($p['nombre'] ?? $compra['producto']), 0, 120);
        $valor = number_format($total, 2, '.', '');
        $ref = self::referencia($compra);
        $base = Http::urlBase();
        $cuerpo = [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'reference_id' => $ref,
                'custom_id' => $ref,
                // Único por compra: PayPal rechaza cobrar dos veces la misma factura (otra defensa contra el doble cobro)
                'invoice_id' => $ref . '-' . substr((string) $compra['token'], 0, 8),
                'description' => mb_substr('EN VIVO Tycoon: ' . $nombre, 0, 127),
                'amount' => ['currency_code' => 'USD', 'value' => $valor, 'breakdown' => ['item_total' => ['currency_code' => 'USD', 'value' => $valor]]],
                'items' => [['name' => $nombre, 'quantity' => '1', 'sku' => mb_substr((string) $compra['producto'], 0, 127), 'category' => 'DIGITAL_GOODS',
                    'unit_amount' => ['currency_code' => 'USD', 'value' => $valor]]],
            ]],
            'payment_source' => ['paypal' => ['experience_context' => [
                'brand_name' => 'EN VIVO Tycoon', 'shipping_preference' => 'NO_SHIPPING', 'user_action' => 'PAY_NOW',
                'payment_method_preference' => 'IMMEDIATE_PAYMENT_REQUIRED',
                'return_url' => $base . '/api/paypal/volver', 'cancel_url' => $base . '/api/paypal/cancelado',
            ]]],
        ];
        [$c, $j] = self::api('POST', 'v2/checkout/orders', (string) json_encode($cuerpo, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ['PayPal-Request-Id: ev-orden-' . (int) $compra['id'] . '-' . bin2hex(random_bytes(6)), 'Prefer: return=representation']);
        $id = is_string($j['id'] ?? null) ? $j['id'] : '';
        if (!in_array($c, [200, 201], true) || !preg_match('/^[A-Z0-9]{5,40}$/', $id)) {
            error_log('EN VIVO PayPal: crear orden de la compra ' . $compra['id'] . ' respondió ' . $c . ' ' . self::nombreIssue($j));
            throw new Fallo('No se pudo preparar el pago con PayPal. Intenta otra vez en unos minutos.', 502, ['codigo' => 'paypal_error']);
        }
        $url = '';
        foreach ((array) ($j['links'] ?? []) as $l) {
            if (is_array($l) && in_array($l['rel'] ?? '', ['payer-action', 'approve'], true) && is_string($l['href'] ?? null)) { $url = $l['href']; break; }
        }
        if (!self::urlAprobacionValida($url)) {
            error_log('EN VIVO PayPal: la orden ' . $id . ' no trae una dirección de PayPal válida');
            throw new Fallo('No se pudo preparar el pago con PayPal. Intenta otra vez en unos minutos.', 502, ['codigo' => 'paypal_error']);
        }
        Db::q("INSERT OR IGNORE INTO paypal_ordenes (order_id, compra_id, jugador_id, estado, valor, creado, actualizado) VALUES (?, ?, ?, 'creada', ?, ?, ?)",
            [$id, $compra['id'], $compra['jugador_id'], $total, time(), time()]);
        Compras::anotarPaso((int) $compra['id'], 'paypal_orden', self::texto(['orden' => $id, 'estado' => $j['status'] ?? null]), '');
        return $url;
    }

    /**
     * Captura la orden y entrega. Devuelve ['estado' => pagado|pendiente|rechazado|no_aprobada|en_proceso|error|no_coincide, 'compra' => fila|null].
     * Idempotente: si la compra ya está pagada no vuelve a capturar (así nunca se cobra dos veces la misma compra,
     * aunque el comprador haya abierto dos órdenes en dos pestañas).
     */
    public static function capturar(string $orderId, string $origen): array
    {
        $o = self::orden($orderId);
        if (!$o) return ['estado' => 'sin_orden', 'compra' => null];
        $compra = Compras::porId((int) $o['compra_id']);
        if (!$compra) return ['estado' => 'sin_orden', 'compra' => null];
        if ($compra['estado'] === 'pagado') {
            if ($o['estado'] !== 'capturada') Db::q("UPDATE paypal_ordenes SET estado = 'sin_capturar', actualizado = ? WHERE order_id = ? AND estado <> 'capturada'", [time(), $orderId]);
            return ['estado' => 'pagado', 'compra' => $compra];
        }
        if ($compra['estado'] !== 'pendiente') return ['estado' => 'cerrada', 'compra' => $compra];
        if (in_array($o['estado'], ['sin_capturar', 'no_coincide'], true)) return ['estado' => 'error', 'compra' => $compra];
        // Se "toma" la compra ANTES de llamar a PayPal (como Plux, auditoría A-03): si llega otro pedido a la vez (el regreso
        // del navegador y el aviso de PayPal, o dos pestañas), ese no captura.
        $ahora = time();
        $tomada = Db::q("UPDATE compras SET plux_paso = 'procesando', plux_desde = ? WHERE id = ? AND estado = 'pendiente'
                         AND (plux_paso IS NULL OR plux_paso <> 'procesando' OR plux_desde < ?)", [$ahora, $compra['id'], $ahora - 120])->rowCount();
        if ($tomada !== 1) return ['estado' => 'en_proceso', 'compra' => $compra];
        try {
            [$c, $j] = self::api('POST', 'v2/checkout/orders/' . rawurlencode($orderId) . '/capture', '{}',
                ['PayPal-Request-Id: ev-captura-' . $orderId, 'Prefer: return=representation']);
            $issue = self::nombreIssue($j);
            if ($c === 422 && $issue === 'ORDER_ALREADY_CAPTURED') [$c, $j] = self::api('GET', 'v2/checkout/orders/' . rawurlencode($orderId));
        } catch (\Throwable $e) {
            Compras::anotarPaso((int) $compra['id'], 'paypal_orden', self::texto(['orden' => $orderId, 'error' => 'sin conexión']));
            return ['estado' => 'error', 'compra' => $compra];
        }
        if ($c === 422 && in_array($issue, ['INSTRUMENT_DECLINED', 'PAYER_ACTION_REQUIRED', 'TRANSACTION_REFUSED', 'PAYER_CANNOT_PAY'], true)) {
            Compras::anotarPaso((int) $compra['id'], 'fallido', self::texto(['orden' => $orderId, 'issue' => $issue]));
            Db::q("UPDATE paypal_ordenes SET estado = 'rechazada', actualizado = ? WHERE order_id = ?", [time(), $orderId]);
            return ['estado' => 'rechazado', 'compra' => $compra];
        }
        if ($c === 422 && $issue === 'ORDER_NOT_APPROVED') {
            Compras::anotarPaso((int) $compra['id'], 'paypal_orden', self::texto(['orden' => $orderId, 'issue' => $issue]));
            return ['estado' => 'no_aprobada', 'compra' => $compra];
        }
        if (!in_array($c, [200, 201], true) || !is_array($j)) {
            error_log('EN VIVO PayPal: capturar la orden ' . $orderId . ' respondió ' . $c . ' ' . $issue);
            Compras::anotarPaso((int) $compra['id'], 'paypal_orden', self::texto(['orden' => $orderId, 'http' => $c, 'issue' => $issue]));
            return ['estado' => 'error', 'compra' => $compra];
        }
        return self::aplicarOrden($compra, $orderId, $j, $origen);
    }

    /** Revisa la orden capturada (lo que dice PayPal, no el navegador) y entrega si todo coincide. */
    private static function aplicarOrden(array $compra, string $orderId, array $j, string $origen): array
    {
        $pu = is_array($j['purchase_units'][0] ?? null) ? $j['purchase_units'][0] : [];
        $cap = is_array($pu['payments']['captures'][0] ?? null) ? $pu['payments']['captures'][0] : [];
        $motivo = self::noCoincide($compra, $cap, (string) ($pu['custom_id'] ?? ($cap['custom_id'] ?? '')));
        if (($j['id'] ?? null) !== $orderId) $motivo = 'la respuesta es de otra orden';
        $capId = is_string($cap['id'] ?? null) && preg_match('/^[A-Z0-9]{5,40}$/', $cap['id']) ? $cap['id'] : '';
        $estadoCap = strtoupper((string) ($cap['status'] ?? ''));
        if ($motivo === '' && $capId === '') $motivo = 'no trae el número de captura';
        if ($motivo !== '') {
            // PayPal ya cobró algo que no es esta compra: NO se entrega; el dueño revisa y devuelve el dinero.
            Db::aviso('paypal_no_coincide', 'PayPal capturó la orden ' . $orderId . ' de la compra N° ' . $compra['id'] . ' pero ' . $motivo . ': NO se entregó. Revisar en PayPal y devolver el dinero. ' . self::texto($j), (int) $compra['id']);
            Compras::anotarPaso((int) $compra['id'], 'fallido', self::texto($j), $capId);
            Db::q("UPDATE paypal_ordenes SET estado = 'no_coincide', capture_id = COALESCE(capture_id, NULLIF(?, '')), respuesta = ?, actualizado = ? WHERE order_id = ?", [$capId, self::texto($j), time(), $orderId]);
            return ['estado' => 'no_coincide', 'compra' => Compras::porId((int) $compra['id'])];
        }
        return self::aplicarCaptura($compra, $orderId, $cap, $estadoCap, $origen, self::texto($j));
    }

    /** '' si la captura es de esta compra (USD, mismo valor, custom_id EV-<id>); si no, el motivo. */
    private static function noCoincide(array $compra, array $cap, string $customId): string
    {
        $moneda = (string) ($cap['amount']['currency_code'] ?? '');
        $valor = $cap['amount']['value'] ?? null;
        return match (true) {
            $customId !== self::referencia($compra) => 'la referencia no coincide (' . mb_substr($customId, 0, 40) . ' en vez de ' . self::referencia($compra) . ')',
            $moneda !== 'USD' => 'la moneda no es USD (' . mb_substr($moneda, 0, 10) . ')',
            !is_numeric($valor) || abs((float) $valor - (float) $compra['total']) > 0.009 => 'el valor no coincide (' . (is_scalar($valor) ? mb_substr((string) $valor, 0, 20) : '?') . ' en vez de ' . $compra['total'] . ')',
            default => '',
        };
    }

    private static function aplicarCaptura(array $compra, string $orderId, array $cap, string $estadoCap, string $origen, string $texto): array
    {
        $capId = (string) $cap['id'];
        $id = (int) $compra['id'];
        $otra = Db::valor('SELECT order_id FROM paypal_ordenes WHERE capture_id = ? AND order_id <> ?', [$capId, $orderId]);
        if ($otra) {
            Db::aviso('paypal_no_coincide', 'La captura ' . $capId . ' ya era de la orden ' . $otra . ': no se aplicó a la compra N° ' . $id . '.', $id);
            Compras::anotarPaso($id, 'fallido', $texto);
            return ['estado' => 'no_coincide', 'compra' => $compra];
        }
        Db::q('UPDATE paypal_ordenes SET capture_id = ?, respuesta = ?, actualizado = ? WHERE order_id = ?', [$capId, $texto, time(), $orderId]);
        if ($estadoCap === 'COMPLETED') {
            Compras::aprobar($id, self::quien($origen), $capId, $texto);
            Db::q("UPDATE paypal_ordenes SET estado = 'capturada', actualizado = ? WHERE order_id = ?", [time(), $orderId]);
            return ['estado' => 'pagado', 'compra' => Compras::porId($id)];
        }
        if ($estadoCap === 'PENDING') {
            // PayPal retiene el pago para revisarlo (eCheck, revisión de riesgo): se entrega con el aviso PAYMENT.CAPTURE.COMPLETED
            Compras::anotarPaso($id, 'paypal_pendiente', $texto, $capId);
            Db::q("UPDATE paypal_ordenes SET estado = 'pendiente', actualizado = ? WHERE order_id = ?", [time(), $orderId]);
            Db::aviso('paypal_pendiente', 'PayPal dejó en revisión la captura ' . $capId . ' de la compra N° ' . $id . ' (' . mb_substr((string) json_encode($cap['status_details'] ?? null), 0, 200) . '). Se entrega sola cuando PayPal la complete.', $id);
            return ['estado' => 'pendiente', 'compra' => Compras::porId($id)];
        }
        Compras::anotarPaso($id, 'fallido', $texto, $capId);
        Db::q("UPDATE paypal_ordenes SET estado = 'rechazada', actualizado = ? WHERE order_id = ?", [time(), $orderId]);
        return ['estado' => 'rechazado', 'compra' => Compras::porId($id)];
    }

    /** El comprador volvió de PayPal sin pagar (Cancelar). Devuelve la compra o null. */
    public static function cancelar(string $orderId): ?array
    {
        $o = self::orden($orderId);
        if (!$o) return null;
        Db::q("UPDATE paypal_ordenes SET estado = 'cancelada', actualizado = ? WHERE order_id = ? AND estado IN ('creada', 'aprobada')", [time(), $orderId]);
        return Compras::porId((int) $o['compra_id']);
    }

    // ============================================================================================ webhook
    /**
     * Revisa la firma del aviso con la API de PayPal (verify-webhook-signature). El evento va TAL CUAL llegó (sin volver a
     * armar el JSON: así la firma no se rompe por espacios o decimales). true solo si PayPal responde SUCCESS.
     */
    public static function firmaValida(string $cuerpo, array $cab): bool
    {
        $req = ['auth_algo', 'cert_url', 'transmission_id', 'transmission_sig', 'transmission_time'];
        foreach ($req as $k) if (!is_string($cab[$k] ?? null) || $cab[$k] === '' || strlen($cab[$k]) > 2000) return false;
        if (!preg_match('#^https://#', $cab['cert_url']) && !str_starts_with(self::urlBase(), 'http://')) return false;
        $env = json_encode(['auth_algo' => $cab['auth_algo'], 'cert_url' => $cab['cert_url'], 'transmission_id' => $cab['transmission_id'],
            'transmission_sig' => $cab['transmission_sig'], 'transmission_time' => $cab['transmission_time'], 'webhook_id' => Config::get('PAYPAL_WEBHOOK_ID')], JSON_UNESCAPED_SLASHES);
        $pedido = substr((string) $env, 0, -1) . ',"webhook_event":' . $cuerpo . '}';
        try {
            [$c, $j] = self::api('POST', 'v1/notifications/verify-webhook-signature', $pedido);
        } catch (\Throwable $e) {
            return false;
        }
        if ($c !== 200) error_log('EN VIVO PayPal: verify-webhook-signature respondió ' . $c);
        return $c === 200 && ($j['verification_status'] ?? '') === 'SUCCESS';
    }

    /** Busca la compra de un recurso del aviso (orden, captura, reembolso o disputa). */
    private static function compraDe(?string $orderId, ?string $captureId, ?string $customId): ?array
    {
        if ($orderId && ($o = self::orden($orderId))) return Compras::porId((int) $o['compra_id']);
        if ($captureId && preg_match('/^[A-Z0-9]{5,40}$/', $captureId)) {
            $cid = Db::valor('SELECT compra_id FROM paypal_ordenes WHERE capture_id = ?', [$captureId])
                ?: Db::valor("SELECT id FROM compras WHERE plux_transaccion = ? AND canal = 'web_paypal'", [$captureId]);
            if ($cid) return Compras::porId((int) $cid);
        }
        if ($customId && preg_match('/^EV-(\d{1,10})(?:-|$)/', $customId, $m)) {
            $c = Compras::porId((int) $m[1]);
            if ($c && ($c['canal'] ?? '') === 'web_paypal') return $c;
        }
        return null;
    }

    /** Número de la captura a la que se refiere un reembolso / reversión (enlace "up") o la misma captura. */
    private static function capturaDe(array $r, string $tipoRecurso): ?string
    {
        if ($tipoRecurso === 'capture' && is_string($r['id'] ?? null)) return $r['id'];
        foreach ((array) ($r['links'] ?? []) as $l) {
            if (is_array($l) && ($l['rel'] ?? '') === 'up' && is_string($l['href'] ?? null) && preg_match('#/captures/([A-Z0-9]{5,40})(?:$|[/?])#', $l['href'], $m)) return $m[1];
        }
        return is_string($r['capture_id'] ?? null) ? $r['capture_id'] : null;
    }

    /**
     * Atiende un aviso YA verificado. Devuelve ['resultado' => texto, 'compra' => id|null]. Cada evento (id) se atiende una vez.
     */
    public static function procesarEvento(array $ev): array
    {
        $evId = is_string($ev['id'] ?? null) ? mb_substr($ev['id'], 0, 100) : '';
        $tipo = is_string($ev['event_type'] ?? null) ? mb_substr($ev['event_type'], 0, 80) : '';
        $r = is_array($ev['resource'] ?? null) ? $ev['resource'] : [];
        $tipoRec = strtolower((string) ($ev['resource_type'] ?? ''));
        if ($evId === '' || $tipo === '') return ['resultado' => 'sin_datos', 'compra' => null];
        if (Db::q('INSERT OR IGNORE INTO paypal_eventos (evento_id, tipo, recurso_id, resultado, creado) VALUES (?, ?, ?, ?, ?)',
                [$evId, $tipo, mb_substr((string) ($r['id'] ?? ''), 0, 100), 'procesando', time()])->rowCount() !== 1) {
            return ['resultado' => 'repetido', 'compra' => null];
        }
        try {
            [$res, $compra] = self::atender($tipo, $tipoRec, $r);
        } catch (\Throwable $e) {
            Db::q('DELETE FROM paypal_eventos WHERE evento_id = ?', [$evId]);   // PayPal lo reintenta
            throw $e;
        }
        Db::q('UPDATE paypal_eventos SET resultado = ?, compra_id = ?, detalle = ? WHERE evento_id = ?', [$res, $compra, self::texto($r), $evId]);
        return ['resultado' => $res, 'compra' => $compra];
    }

    /** @return array{0:string,1:?int} */
    private static function atender(string $tipo, string $tipoRec, array $r): array
    {
        $custom = is_string($r['custom_id'] ?? null) ? $r['custom_id'] : null;
        switch ($tipo) {
            case 'CHECKOUT.ORDER.APPROVED': {
                // El comprador aprobó pero no volvió (cerró el navegador): se captura desde aquí.
                $oid = is_string($r['id'] ?? null) ? $r['id'] : '';
                if (!self::orden($oid)) { self::sinCompra($tipo, $r); return ['sin_compra', null]; }
                $x = self::capturar($oid, 'aviso de PayPal');
                return [$x['estado'], $x['compra'] ? (int) $x['compra']['id'] : null];
            }
            case 'PAYMENT.CAPTURE.COMPLETED':
            case 'PAYMENT.CAPTURE.DENIED': {
                $oid = $r['supplementary_data']['related_ids']['order_id'] ?? null;
                $c = self::compraDe(is_string($oid) ? $oid : null, is_string($r['id'] ?? null) ? $r['id'] : null, $custom);
                if (!$c) { self::sinCompra($tipo, $r); return ['sin_compra', null]; }
                if ($c['estado'] !== 'pendiente') return ['ya_' . $c['estado'], (int) $c['id']];
                if ($tipo === 'PAYMENT.CAPTURE.DENIED') {
                    Compras::rechazar((int) $c['id'], self::texto($r));
                    return ['rechazado', (int) $c['id']];
                }
                $motivo = self::noCoincide($c, $r, (string) ($custom ?? ''));
                $capId = is_string($r['id'] ?? null) && preg_match('/^[A-Z0-9]{5,40}$/', $r['id']) ? $r['id'] : '';
                if ($motivo !== '' || $capId === '') {
                    Db::aviso('paypal_no_coincide', 'Aviso PAYMENT.CAPTURE.COMPLETED para la compra N° ' . $c['id'] . ' pero ' . ($motivo ?: 'sin número de captura') . ': NO se entregó. ' . self::texto($r), (int) $c['id']);
                    return ['no_coincide', (int) $c['id']];
                }
                $orden = is_string($oid) && self::orden($oid) ? $oid : (string) Db::valor('SELECT order_id FROM paypal_ordenes WHERE compra_id = ? ORDER BY creado DESC LIMIT 1', [$c['id']]);
                if ($orden === '') {
                    Compras::aprobar((int) $c['id'], self::quien('aviso de pago'), $capId, self::texto($r));
                    return ['pagado', (int) $c['id']];
                }
                $x = self::aplicarCaptura($c, $orden, $r, 'COMPLETED', 'aviso de pago', self::texto($r));
                return [$x['estado'], (int) $c['id']];
            }
            case 'PAYMENT.CAPTURE.REFUNDED':
            case 'PAYMENT.CAPTURE.REVERSED': {
                $capId = self::capturaDe($r, $tipoRec);
                $c = self::compraDe(null, $capId, $custom);
                if (!$c) { self::sinCompra($tipo, $r); return ['sin_compra', null]; }
                $monto = max((float) ($r['amount']['value'] ?? 0), (float) ($r['seller_payable_breakdown']['total_refunded_amount']['value'] ?? 0));
                $esReversion = $tipo === 'PAYMENT.CAPTURE.REVERSED';
                if (!$esReversion && $monto + 0.009 < (float) $c['total']) {
                    // Devolución parcial (ej. un gesto del dueño): no se revierte sola; queda el aviso para decidir.
                    Db::aviso('paypal_reembolso_parcial', 'PayPal devolvió ' . Http::dinero($monto) . ' de ' . Http::dinero((float) $c['total']) . ' de la compra N° ' . $c['id'] . ' (captura ' . $capId . '). Es parcial: NO se revirtió sola; si corresponde, revierte la compra en el Centro de Control.', (int) $c['id']);
                    return ['reembolso_parcial', (int) $c['id']];
                }
                $tipoRev = $esReversion ? 'contracargo' : 'reembolso';
                $det = ($esReversion ? 'PayPal revirtió el pago' : 'PayPal devolvió ' . Http::dinero($monto)) . ' (captura ' . $capId . ', ' . mb_substr((string) ($r['id'] ?? ''), 0, 40) . ')';
                return [self::revertir($c, $tipoRev, $det), (int) $c['id']];
            }
            case 'CUSTOMER.DISPUTE.CREATED': {
                $dId = mb_substr((string) ($r['dispute_id'] ?? ($r['id'] ?? '')), 0, 60);
                $razon = mb_substr((string) ($r['reason'] ?? ''), 0, 60);
                $res = 'sin_compra'; $cid = null;
                foreach ((array) ($r['disputed_transactions'] ?? []) as $t) {
                    if (!is_array($t)) continue;
                    $c = self::compraDe(null, is_string($t['seller_transaction_id'] ?? null) ? $t['seller_transaction_id'] : null,
                        is_string($t['custom'] ?? null) ? $t['custom'] : (is_string($t['invoice_number'] ?? null) ? $t['invoice_number'] : null));
                    if (!$c) continue;
                    $cid = (int) $c['id'];
                    $res = self::revertir($c, 'contracargo', 'Disputa de PayPal ' . $dId . ($razon !== '' ? ' (' . $razon . ')' : ''));
                }
                if ($cid === null) self::sinCompra($tipo, $r);
                return [$res, $cid];
            }
            default:
                return ['ignorado', null];
        }
    }

    /** Revierte (idempotente) y deja el aviso para el dueño. Devuelve el resultado. */
    private static function revertir(array $c, string $tipo, string $detalle): string
    {
        if ($c['estado'] === 'revertido') return 'ya_revertida';
        if ($c['estado'] !== 'pagado') {
            Db::aviso('paypal_reversion_sin_pago', $detalle . ' — la compra N° ' . $c['id'] . ' está "' . $c['estado'] . '": no había nada que revertir.', (int) $c['id']);
            return 'sin_pago';
        }
        $r = Compras::revertir((int) $c['id'], $tipo, $detalle, 'PayPal');
        Db::aviso($tipo === 'contracargo' ? 'paypal_contracargo' : 'paypal_reembolso', $detalle . ': compra N° ' . $c['id'] . ' revertida (' . json_encode($r) . ').', (int) $c['id']);
        return $r === null ? 'ya_revertida' : 'revertida';
    }

    private static function sinCompra(string $tipo, array $r): void
    {
        Db::aviso('paypal_aviso_sin_compra', 'Aviso de PayPal ' . $tipo . ' que no corresponde a ninguna compra del juego: ' . mb_substr(self::texto($r), 0, 1500));
    }
}
