<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas del pago por Tukán Pagos (src/TukanPagos.php, server/TUKAN_PAGOS.md). api.php las llama ANTES de pedir la cabecera
 * X-Envivo: /volver es una navegación del navegador (GET) y /aviso llega desde Tukán Pagos (firmado). /crear es del juego:
 * aquí mismo se exige X-Envivo y la sesión.
 *   POST /api/tukanpagos/crear   {o: token de la compra, factura: {...}}  -> {ok, url (página de pago de Tukán Pagos)} | {ok, ir}
 *   GET  /api/tukanpagos/volver  ?o=<token>                               -> el servidor PREGUNTA a Tukán Pagos y redirige
 *   POST /api/tukanpagos/aviso   (aviso firmado de Tukán Pagos: cobro.aprobado / cobro.rechazado / prueba)
 */
final class TukanPagosApi
{
    public static function esRuta(string $ruta): bool { return in_array($ruta, ['/tukanpagos/crear', '/tukanpagos/volver', '/tukanpagos/aviso'], true); }

    public static function responder(string $ruta, string $metodo): never
    {
        match ($ruta) {
            '/tukanpagos/aviso' => self::aviso($metodo),
            '/tukanpagos/volver' => self::volver(),
            default => self::crear($metodo),
        };
    }

    private static function texto(array $in, string $k): string { return is_string($in[$k] ?? null) ? $in[$k] : ''; }

    /** POST /api/tukanpagos/crear: datos de la factura + cobro en Tukán Pagos para la compra del jugador con sesión. */
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
        if (!in_array($c['estado'], ['pendiente', 'rechazado'], true)) Http::error(409, 'Esta compra ya no está abierta. Vuelve al juego y empieza otra.', [], 'conflicto');
        if (($c['canal'] ?? 'web_plux') !== 'web_plux') Http::error(409, 'Esta compra es para pagar con PayPal. Vuelve a la tienda y elige «Pagar con tarjeta».', [], 'pago_metodo_distinto');
        if (!TukanPagos::activo()) Http::error(503, 'El pago con tarjeta todavía no está disponible.', [], 'tukanpagos_no_disponible');
        if (Ajustes::mantenimiento()) Http::error(503, Ajustes::mensajeMantenimiento(), [], 'mantenimiento');
        if (Cuentas::estadoCuenta($j) !== 'activo') Http::error(403, Cuentas::aviso(Cuentas::estadoCuenta($j)) ?? 'Tu cuenta no está activa.', [], 'cuenta_suspendida');
        $p = Catalogo::productoCompra((string) $c['producto']);
        if ($p && $p['una_vez'] && Compras::yaComprado($j, (string) $c['producto'])) {
            Http::error(409, 'Ya compraste el ' . $p['nombre'] . '. Solo se puede comprar una vez: no se hizo ningún cobro.', [], 'ya_comprado');
        }
        if (Limite::contar('tkp:' . $c['id'], 12) || Limite::contar('tkpip:' . Http::ip(), 40)) {
            Http::error(429, 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', [], 'limite_intentos');
        }
        $jug = Cuentas::porId($j);
        // Factura SRI ANTES de cobrar: consumidor final (hasta FACTURACION_TOPE_CF) o la cédula / RUC que escriba el comprador
        $factura = null;
        if (class_exists(Facturacion::class)) {
            $f = is_array($in['factura'] ?? null) ? $in['factura'] : [];
            $f['modo'] = ($f['modo'] ?? '') === 'otro' ? 'otro' : 'consumidor_final';
            $comprador = ['email' => (string) $jug['email'], 'telefono' => '', 'cedula' => '', 'nombre' => (string) $jug['nombre']];
            $factura = Facturacion::datosDePago(['factura' => $f], $comprador, $c, $jug);   // Fallo 422 con el texto
        }
        $documento = ($factura['modo'] ?? '') === 'otro' ? (string) $factura['identificacion'] : '';
        $nombre = ($factura['modo'] ?? '') === 'otro' ? (string) $factura['razon_social'] : (string) $jug['nombre'];
        $url = TukanPagos::crearCobro($c, ['nombre' => $nombre, 'correo' => (string) ($factura['email'] ?? $jug['email']), 'documento' => $documento],
            (string) ($p['nombre'] ?? $c['producto']));
        if ($factura !== null) Facturacion::anotarDatos((int) $c['id'], $factura);
        if ($url === '/?compra=ok') Http::json(200, ['ok' => true, 'ir' => $url]);
        Http::json(200, ['ok' => true, 'url' => $url]);
    }

    /** GET /api/tukanpagos/volver?o=<token>: el jugador vuelve de la página de pago. Se pregunta a Tukán Pagos (no al navegador). */
    private static function volver(): never
    {
        if (Limite::contar('tkpvolver:' . Http::ip(), 40)) Http::pagina(429, 'Demasiados intentos', 'Espera unos minutos e intenta de nuevo.');
        $c = Compras::porToken(is_string($_GET['o'] ?? null) ? $_GET['o'] : '');
        if (!$c) Http::pagina(404, 'Compra no encontrada', 'Vuelve al juego. Si te cobraron, escríbenos desde «Ayuda y soporte» en el juego.');
        if ($c['estado'] === 'pagado') Http::redirigir('/?compra=ok');
        $pago = '/pago.php?o=' . $c['token'];
        try {
            $cobro = TukanPagos::cobroDeCompra((int) $c['id']);
        } catch (\Throwable $e) {
            error_log('EN VIVO Tukan Pagos volver: ' . mb_substr($e->getMessage(), 0, 300));
            Http::redirigir($pago . '&r=tkp_confirmando');
        }
        $r = $cobro ? TukanPagos::aplicarCobro($cobro, 'Tukán Pagos (regreso del comprador)') : 'pendiente';
        match ($r) {
            'pagado', 'ya_pagado' => Http::redirigir('/?compra=ok'),
            'rechazado' => Http::redirigir($pago . '&r=rechazado'),
            default => Http::redirigir($pago . '&r=tkp_confirmando'),
        };
    }

    /** POST /api/tukanpagos/aviso: aviso firmado de Tukán Pagos. 2xx = recibido (si no, Tukán Pagos reintenta). */
    private static function aviso(string $metodo): never
    {
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (!TukanPagos::activo()) Http::error(503, 'Pago por Tukán Pagos apagado.', [], 'tukanpagos_no_disponible');
        $cuerpo = (string) file_get_contents('php://input');
        if (strlen($cuerpo) > 65536) Http::error(413, 'Aviso demasiado grande.');
        $ev = TukanPagos::verificarAviso($cuerpo, (string) ($_SERVER['HTTP_X_TUKAN_FECHA'] ?? ''), (string) ($_SERVER['HTTP_X_TUKAN_FIRMA'] ?? ''));
        if ($ev === null) {
            if (Limite::contar('tkpaviso_mal:' . Http::ip(), 30)) Http::error(429, 'Demasiados intentos.');
            Http::error(401, 'Firma no válida.', [], 'firma_invalida');
        }
        $evento = (string) ($ev['evento'] ?? '');
        $res = 'ignorado';
        if (in_array($evento, ['cobro.aprobado', 'cobro.rechazado'], true) && is_array($ev['datos'] ?? null)) {
            $cobro = isset($ev['datos']['cobro']) && is_array($ev['datos']['cobro']) ? $ev['datos']['cobro'] : $ev['datos'];
            $res = TukanPagos::aplicarCobro($cobro, 'Tukán Pagos (aviso ' . (int) ($_SERVER['HTTP_X_TUKAN_AVISO'] ?? 0) . ')');
        } elseif ($evento === 'prueba') {
            $res = 'prueba';
        }
        Http::json(200, ['ok' => true, 'resultado' => $res]);
    }
}
