<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas de PayPal (src/PayPal.php, docs/PAYPAL.md). api.php las llama ANTES de pedir la cabecera X-Envivo, porque
 * /volver y /cancelado son navegaciones del navegador (GET, cuando PayPal devuelve al comprador) y /webhook llega desde
 * PayPal (firmado). /crear es del juego: aquí mismo se exige X-Envivo y la sesión.
 *   POST /api/paypal/crear     {o: token de la compra, factura: {...}}  -> {ok, url (PayPal)} | {ok, ir: "/?compra=ok"}
 *   GET  /api/paypal/volver    ?token=<orden>&PayerID=...              -> captura y redirige a /?compra=ok o a pago.php
 *   GET  /api/paypal/cancelado ?token=<orden>                          -> vuelve a pago.php (r=cancelado)
 *   POST /api/paypal/webhook   (aviso de PayPal, firma revisada con verify-webhook-signature)
 */
final class PayPalApi
{
    public static function esRuta(string $ruta): bool { return in_array($ruta, ['/paypal/crear', '/paypal/volver', '/paypal/cancelado', '/paypal/webhook'], true); }

    public static function responder(string $ruta, string $metodo): never
    {
        match ($ruta) {
            '/paypal/webhook' => self::webhook($metodo),
            '/paypal/volver' => self::volver(),
            '/paypal/cancelado' => self::cancelado(),
            default => self::crear($metodo),
        };
    }

    private static function texto(array $in, string $k): string { return is_string($in[$k] ?? null) ? $in[$k] : ''; }

    /** POST /api/paypal/crear: crea la orden en PayPal para la compra (del jugador con sesión) y devuelve a dónde ir. */
    private static function crear(string $metodo): never
    {
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $j = Sesiones::jugadorId();
        if ($j === null) Http::error(401, 'Tu sesión se cerró. Entra otra vez a tu cuenta en el juego.', [], 'sesion_requerida');
        $in = Http::entrada(20000);
        $c = Compras::porToken(self::texto($in, 'o'));
        if (!$c || (int) $c['jugador_id'] !== $j) Http::error(404, 'Compra no encontrada.', [], 'no_encontrado');
        if ($c['estado'] === 'pagado') Http::json(200, ['ok' => true, 'ir' => '/?compra=ok']);
        if ($c['estado'] !== 'pendiente') Http::error(409, 'Esta compra ya no está abierta. Vuelve al juego y empieza otra.', [], 'conflicto');
        if (!PayPal::configurado()) Http::error(503, 'El pago con PayPal todavía no está disponible.', [], 'paypal_no_disponible');
        if (Ajustes::mantenimiento()) Http::error(503, Ajustes::mensajeMantenimiento(), [], 'mantenimiento');
        if (Cuentas::estadoCuenta($j) !== 'activo') Http::error(403, Cuentas::aviso(Cuentas::estadoCuenta($j)) ?? 'Tu cuenta no está activa.', [], 'cuenta_suspendida');
        $p = Catalogo::productoCompra((string) $c['producto']);
        if ($p && $p['una_vez'] && Compras::yaComprado($j, (string) $c['producto'])) {
            Http::error(409, 'Ya compraste el ' . $p['nombre'] . '. Solo se puede comprar una vez: no se hizo ningún cobro.', [], 'ya_comprado');
        }
        // Mismos límites que el pago con tarjeta (por compra y por conexión)
        if (Limite::contar('paypal:' . $c['id'], 12) || Limite::contar('paypalip:' . Http::ip(), 40)) {
            Http::error(429, 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', [], 'limite_intentos');
        }
        // Datos de la factura SRI ANTES de ir a PayPal: con PayPal no hay "titular de la tarjeta": consumidor final (hasta
        // FACTURACION_TOPE_CF) o la cédula / RUC que escriba el comprador.
        $factura = null;
        if (class_exists(Facturacion::class)) {
            $f = is_array($in['factura'] ?? null) ? $in['factura'] : [];
            $f['modo'] = ($f['modo'] ?? '') === 'otro' ? 'otro' : 'consumidor_final';
            $jug = Cuentas::porId($j);
            $comprador = ['email' => (string) $jug['email'], 'telefono' => '', 'cedula' => '', 'nombre' => (string) $jug['nombre']];
            $factura = Facturacion::datosDePago(['factura' => $f], $comprador, $c, $jug);   // Fallo 422 con el texto
        }
        $url = PayPal::crearOrden($c);   // Fallo 409 (mínimo / otro método), 502 (PayPal no responde)
        if ($factura !== null) Facturacion::anotarDatos((int) $c['id'], $factura);
        Http::json(200, ['ok' => true, 'url' => $url]);
    }

    /** GET /api/paypal/volver?token=<orden>: el comprador aprobó en PayPal. Se captura AQUÍ (en el servidor) y se entrega. */
    private static function volver(): never
    {
        if (Limite::contar('paypalvolver:' . Http::ip(), 40)) Http::pagina(429, 'Demasiados intentos', 'Espera unos minutos e intenta de nuevo.');
        $orden = is_string($_GET['token'] ?? null) ? $_GET['token'] : '';
        $o = PayPal::orden($orden);
        if (!$o) Http::pagina(404, 'Pago no encontrado', 'No encontramos ese pago de PayPal. Si PayPal te cobró, escríbenos desde «Ayuda y soporte» en el juego.');
        // Si la compra ya está pagada (recargar la página, u otra orden de otra pestaña) capturar() NO llama a PayPal:
        // así nunca se cobra dos veces ni se entrega dos veces.
        $r = PayPal::capturar($orden, 'regreso del comprador');
        $tok = (string) ($r['compra']['token'] ?? '');
        match ($r['estado']) {
            'pagado' => Http::redirigir('/?compra=ok'),
            'sin_orden', 'cerrada' => Http::pagina(409, 'Esta compra ya no está abierta', 'Vuelve al juego y empieza otra compra. Si PayPal te cobró, escríbenos desde «Ayuda y soporte» en el juego.'),
            'pendiente' => Http::pagina(202, 'PayPal está revisando tu pago', 'PayPal dejó tu pago en revisión. Apenas lo apruebe, lo que compraste llega solo a tu cuenta (puede tardar unos minutos). No pagues otra vez.'),
            'en_proceso' => Http::pagina(202, 'Estamos confirmando tu pago', 'Tu pago se está confirmando. Espera unos segundos y vuelve al juego: no pagues otra vez.'),
            'rechazado' => Http::redirigir('/pago.php?o=' . $tok . '&r=paypal_rechazado'),
            'no_aprobada' => Http::redirigir('/pago.php?o=' . $tok . '&r=paypal_cancelado'),
            default => Http::redirigir('/pago.php?o=' . $tok . '&r=paypal_error'),
        };
    }

    private static function cancelado(): never
    {
        $c = PayPal::cancelar(is_string($_GET['token'] ?? null) ? $_GET['token'] : '');
        if ($c && $c['estado'] === 'pagado') Http::redirigir('/?compra=ok');
        if ($c && $c['estado'] === 'pendiente') Http::redirigir('/pago.php?o=' . $c['token'] . '&r=paypal_cancelado');
        Http::redirigir('/');
    }

    /** POST /api/paypal/webhook: aviso de PayPal. Sin firma válida no se hace nada (401). Siempre responde rápido. */
    private static function webhook(string $metodo): never
    {
        if ($metodo !== 'POST') Http::error(405, 'Use POST.');
        if (!PayPal::configurado() || !PayPal::webhookConfigurado()) Http::error(503, 'Aviso de PayPal sin configurar.', [], 'paypal_no_disponible');
        if (Limite::excedido('ppwebhook:' . Http::ip(), 30)) Http::error(429, 'Demasiados intentos.');
        $cuerpo = (string) file_get_contents('php://input', false, null, 0, 200001);
        if (strlen($cuerpo) > 200000) Http::error(413, 'Aviso demasiado grande.');
        $ev = json_decode($cuerpo, true);
        if (!is_array($ev) || !is_string($ev['event_type'] ?? null)) Http::error(400, 'El aviso no es JSON.');
        $cab = [];
        foreach (['auth_algo' => 'HTTP_PAYPAL_AUTH_ALGO', 'cert_url' => 'HTTP_PAYPAL_CERT_URL', 'transmission_id' => 'HTTP_PAYPAL_TRANSMISSION_ID',
                  'transmission_sig' => 'HTTP_PAYPAL_TRANSMISSION_SIG', 'transmission_time' => 'HTTP_PAYPAL_TRANSMISSION_TIME'] as $k => $s) {
            $cab[$k] = is_string($_SERVER[$s] ?? null) ? trim($_SERVER[$s]) : '';
        }
        if (in_array('', $cab, true)) { Limite::sumar('ppwebhook:' . Http::ip()); Http::error(400, 'Faltan las cabeceras de la firma de PayPal.'); }
        if (!PayPal::firmaValida($cuerpo, $cab)) {
            Limite::sumar('ppwebhook:' . Http::ip());
            Db::aviso('paypal_firma_mala', 'Llegó un aviso de PayPal (' . mb_substr($ev['event_type'], 0, 60) . ') con una firma que PayPal no reconoce: NO se aplicó.');
            Http::error(401, 'Firma no válida.');
        }
        $r = PayPal::procesarEvento($ev);
        Http::json(200, ['ok' => true, 'resultado' => $r['resultado'], 'compra' => $r['compra']]);
    }
}
