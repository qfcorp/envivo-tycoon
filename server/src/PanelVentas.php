<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Las ventas del juego se FACTURAN IGUAL QUE EN TODOS LOS SISTEMAS TUKÁN (pedido de Dimitry, 6 nov 2026: «la factura
 * debe hacerla igual que todos los sistemas, debemos igualar todos los sistemas»): cada compra aprobada (tarjeta por
 * Tukán Pagos o Plux propio, PayPal o Google Play) se manda firmada al Panel Tukán Central (POST {TUKAN_CENTRAL_URL}/ventas_api.php,
 * token v2 de tipo «venta» con TUKAN_CENTRAL_SECRET). El Panel la anota en «Cobros y facturas» y emite la factura con
 * TuFactura (datos del comprador o consumidor final hasta $50), como con todos los programas. Los reembolsos y contracargos
 * también se mandan (el cobro queda anulado; la nota de crédito se hace en TuFactura).
 *
 * Módulo con interruptor: FACTURACION_POR_PANEL=1 + TUKAN_CENTRAL_URL / TUKAN_CENTRAL_ID / TUKAN_CENTRAL_SECRET (los deja
 * deploy/conectar_central.sh). Encendido, la facturación propia del juego (src/Facturacion.php, ERP) se apaga sola: una
 * sola factura por venta. Los datos que el comprador pone en la página de pago (cédula/RUC o consumidor final) se siguen
 * pidiendo igual y viajan al Panel.
 *
 * Cola: tabla panel_ventas (migraciones/panel_ventas.sql). Se manda al terminar la petición y bin/tareas.php reintenta
 * lo que quedó pendiente (el Panel no responde, sin internet). El Panel no anota dos veces la misma venta.
 */
final class PanelVentas
{
    public const PREFIJO = 'envivo-compra-';
    public const MAX_INTENTOS = 30;
    /** Mandar al terminar la petición (después de responder al jugador). Las pruebas lo apagan para mandar a mano. */
    public static bool $enviarAlTerminar = true;
    private static bool $apagadoRegistrado = false;

    public static function activo(): bool
    {
        return Config::get('FACTURACION_POR_PANEL', '0') === '1' && self::url() !== '' && self::id() !== '' && strlen(self::secreto()) >= 16;
    }

    public static function id(): string { return Config::get('TUKAN_CENTRAL_ID'); }
    public static function secreto(): string { return Config::get('TUKAN_CENTRAL_SECRET'); }

    /** https siempre; http solo a 127.0.0.1 / localhost (pruebas). */
    public static function url(): string
    {
        $u = rtrim(Config::get('TUKAN_CENTRAL_URL'), '/');
        return preg_match('#^(https://[^\s/]+|http://(127\.0\.0\.1|localhost)(:\d+)?)(/[^\s]*)?$#', $u) ? $u : '';
    }

    public static function referencia(int $compra): string { return self::PREFIJO . $compra; }

    /** Gancho (arranque.php). Registrar dos veces no duplica. */
    public static function registrar(): void
    {
        Ganchos::en('compra_aprobada', static fn(array $d) => self::encolar((int) ($d['compra_id'] ?? 0), 'registrar'), 'panel_ventas');
        Ganchos::en('compra_revertida', static fn(array $d) => self::encolar((int) ($d['compra_id'] ?? 0), 'revertir', (string) ($d['motivo'] ?? 'reembolso')), 'panel_ventas');
    }

    /** ¿Es una venta de PRUEBA? (Plux / Tukán Pagos / PayPal en sandbox, o compra de prueba de Google): el Panel no la factura. */
    public static function esPrueba(array $c): bool
    {
        return match ($c['canal'] ?? 'web_plux') {
            'google_play' => str_contains((string) ($c['pagado_por'] ?? ''), 'PRUEBA'),
            'web_paypal' => PayPal::ambiente() === 'sandbox',
            default => TukanPagos::activo() ? TukanPagos::ambiente() === 'sandbox' : Plux::ambiente() === 'sandbox',
        };
    }

    /** Anota la venta (o el reverso) para mandarla al Panel. Va dentro de la transacción de la compra: nunca se pierde. */
    public static function encolar(int $compra, string $accion, string $motivo = ''): void
    {
        if ($compra < 1 || !self::activo()) return;
        $c = Compras::porId($compra);
        if (!$c) return;
        Db::q('INSERT OR IGNORE INTO panel_ventas (compra_id, accion, motivo, prueba, estado, creado) VALUES (?, ?, ?, ?, ?, ?)',
            [$compra, $accion, $motivo !== '' ? mb_substr($motivo, 0, 40) : null, self::esPrueba($c) ? 1 : 0, 'pendiente', time()]);
        self::enviarLuego();
    }

    private static function enviarLuego(): void
    {
        if (!self::$enviarAlTerminar || self::$apagadoRegistrado) return;
        self::$apagadoRegistrado = true;
        register_shutdown_function(static function (): void {
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();   // el jugador ya tiene su respuesta
            try { self::enviarPendientes(20); } catch (\Throwable $e) { error_log('EN VIVO panel ventas: ' . mb_substr($e->getMessage(), 0, 200)); }
        });
    }

    /** Manda lo pendiente (primero las ventas, después los reversos). Devuelve cuántas se mandaron bien. */
    public static function enviarPendientes(int $max = 50): int
    {
        if (!self::activo()) return 0;
        $filas = Db::todas("SELECT * FROM panel_ventas WHERE estado IN ('pendiente', 'error') AND intentos < ? ORDER BY CASE accion WHEN 'registrar' THEN 0 ELSE 1 END, id LIMIT " . max(1, $max),
            [self::MAX_INTENTOS]);
        $ok = 0;
        foreach ($filas as $f) if (self::enviar($f)) $ok++;
        return $ok;
    }

    /** Lo que se le manda al Panel de una compra. */
    public static function datosVenta(array $c, bool $prueba): array
    {
        $j = Db::fila('SELECT id, nombre, email FROM jugadores WHERE id = ?', [$c['jugador_id']]) ?? [];
        $q = Facturacion::compradorDe($c);   // lo que eligió en la página de pago; Google / PayPal sin datos: consumidor final
        $cf = ($q['tipo_id'] ?? '07') === '07';
        $p = Catalogo::productoCompra((string) $c['producto']);
        return [
            'referencia' => self::referencia((int) $c['id']),
            'fecha' => date('Y-m-d', (int) ($c['pagado_en'] ?: $c['creado'])),
            'concepto' => (string) ($p['nombre'] ?? $c['producto']),
            'producto' => (string) $c['producto'],
            'canal' => match ($c['canal'] ?? 'web_plux') { 'web_paypal' => 'paypal', 'google_play' => 'google_play', default => 'tarjeta' },
            'subtotal' => round((float) $c['subtotal'], 2),
            'total' => round((float) $c['total'], 2),
            'prueba' => $prueba,
            'comprador' => ['id' => (string) $c['jugador_id'], 'nombre' => (string) ($j['nombre'] ?? ''), 'correo' => (string) ($j['email'] ?? '')],
            'factura' => $cf ? ['modo' => 'consumidor', 'correo' => (string) ($q['email'] ?? '')]
                : ['modo' => 'auto', 'identificacion' => (string) $q['identificacion'], 'razon_social' => (string) $q['razon_social'],
                   'correo' => (string) ($q['email'] ?? ''), 'telefono' => (string) ($q['telefono'] ?? ''), 'direccion' => (string) ($q['direccion'] ?? '')],
        ];
    }

    /** Manda una fila de la cola. true si el Panel la recibió. */
    public static function enviar(array $f): bool
    {
        $c = Compras::porId((int) $f['compra_id']);
        if (!$c) {
            Db::q("UPDATE panel_ventas SET estado = 'rechazado', respuesta = 'la compra no existe' WHERE id = ?", [$f['id']]);
            return false;
        }
        $cuerpo = $f['accion'] === 'registrar'
            ? ['accion' => 'registrar', 'venta' => self::datosVenta($c, (bool) (int) $f['prueba'])]
            : ['accion' => 'revertir', 'referencia' => self::referencia((int) $c['id']), 'motivo' => (string) ($f['motivo'] ?: 'reembolso')];
        [$http, $r, $err] = self::pedir($cuerpo);
        $resp = mb_substr($http . ' ' . ($err !== '' ? $err : (string) json_encode($r, JSON_UNESCAPED_UNICODE)), 0, 1000);
        if ($http === 200 && !empty($r['ok'])) {
            Db::q("UPDATE panel_ventas SET estado = 'enviado', intentos = intentos + 1, cobro_id = ?, factura = ?, respuesta = ?, enviado = ? WHERE id = ?",
                [isset($r['cobro']) ? (int) $r['cobro'] : null, mb_substr((string) ($r['factura'] ?? $r['mensaje'] ?? ''), 0, 300), $resp, time(), $f['id']]);
            return true;
        }
        // Reverso de una venta que el Panel todavía no tiene: se espera a que llegue la venta
        if ($f['accion'] === 'revertir' && $http === 404 && ($r['codigo'] ?? '') === 'no_existe') {
            Db::q("UPDATE panel_ventas SET estado = 'error', intentos = intentos + 1, respuesta = ? WHERE id = ?", [$resp, $f['id']]);
            return false;
        }
        if ($http === 422 || $http === 404 || $http === 401) {
            // Datos que el Panel no acepta, programa no conectado o clave mala: no se reintenta solo; aviso en el Centro de Control
            Db::q("UPDATE panel_ventas SET estado = 'rechazado', intentos = intentos + 1, respuesta = ? WHERE id = ?", [$resp, $f['id']]);
            Db::aviso('panel_ventas', 'El Panel Tukán no recibió la ' . ($f['accion'] === 'registrar' ? 'venta' : 'devolución') . ' de la compra N° ' . $c['id'] . ' (' . $resp . '). Revisar.', (int) $c['id']);
            return false;
        }
        Db::q("UPDATE panel_ventas SET estado = 'error', intentos = intentos + 1, respuesta = ? WHERE id = ?", [$resp, $f['id']]);
        return false;
    }

    /** Pregunta al Panel si la conexión funciona (para deploy/conectar_central.sh). Devuelve [http, json|null, error]. */
    public static function probar(): array { return self::pedir(['accion' => 'estado', 'referencia' => 'envivo-prueba-conexion']); }

    /** POST firmado a ventas_api.php del Panel (token v2 «venta»). Nunca escribe el secreto en un registro. */
    private static function pedir(array $cuerpo): array
    {
        if (self::url() === '' || self::id() === '' || self::secreto() === '') return [0, null, 'Panel sin configurar'];
        $json = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $b64 = fn(string $s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $ahora = time();
        $p = ['v' => 2, 'tipo' => 'venta', 'inst' => self::id(), 'email' => 'juego@tukanec.com', 'nombre' => 'EN VIVO Tycoon', 'rol' => 'dueno',
              'iat' => $ahora, 'exp' => $ahora + 60, 'nonce' => bin2hex(random_bytes(16)), 'bh' => $b64(hash('sha256', $json, true))];
        $a = $b64(json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $token = $a . '.' . $b64(hash_hmac('sha256', $a, self::secreto(), true));
        $ch = curl_init(self::url() . '/ventas_api.php');
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $json, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 40,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Tukan-Token: ' . $token]]);
        $r = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        unset($ch);
        if ($r === false) return [0, null, 'Sin conexión con el Panel: ' . $err];
        $j = json_decode((string) $r, true);
        return [$http, is_array($j) ? $j : null, is_array($j) ? '' : 'Respuesta no válida del Panel'];
    }
}
