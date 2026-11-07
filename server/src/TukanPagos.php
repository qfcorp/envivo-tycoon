<?php
declare(strict_types=1);

namespace EnVivo;

use RuntimeException;

/**
 * Pago con tarjeta por TUKÁN PAGOS (pagos.tukanec.com), el portal de cobros de toda la empresa (pedido de Dimitry,
 * 6 nov 2026: "hay que unir los pagos del juego"). Es un MÓDULO con interruptor:
 *   TUKAN_PAGOS_ACTIVO=1             encendido (sin esto el juego sigue con su Plux propio, src/Plux.php)
 *   TUKAN_PAGOS_URL=https://pagos.tukanec.com
 *   TUKAN_PAGOS_CLAVE=tkp_...        la clave del programa «envivo» (Tukán Pagos → Programas → Agregar; se ve una sola vez)
 *   TUKAN_PAGOS_SECRETO_AVISO=...    el secreto de los avisos de ese programa
 * Todo en /etc/envivo/config.env (NUNCA en el código: el repositorio es público).
 *
 * Cómo funciona (la compra sigue siendo la misma: canal web_plux, valor fijo del catálogo con IVA, factura con TuFactura):
 *   1. pago.php (con el módulo encendido) pide solo los datos de la factura y "Pagar con tarjeta" → POST /api/tukanpagos/crear
 *   2. El servidor crea el cobro en Tukán Pagos (referencia envivo-compra-<id>, monto = total de la compra) y manda al
 *      jugador a la página de pago de Tukán Pagos (ahí pone su tarjeta: el juego nunca la ve).
 *   3. Lo que vale es el AVISO FIRMADO (cobro.aprobado → /api/tukanpagos/aviso, HMAC-SHA256) o la consulta del servidor a
 *      Tukán Pagos cuando el jugador vuelve (/api/tukanpagos/volver). Nunca lo que diga el navegador.
 *   4. Compras::aprobar() es idempotente: aviso + regreso no entregan dos veces.
 */
final class TukanPagos
{
    public const PREFIJO = 'envivo-compra-';

    public static function activo(): bool
    {
        return Config::get('TUKAN_PAGOS_ACTIVO', '0') === '1' && self::clave() !== '' && self::secreto() !== '' && self::url() !== '';
    }

    public static function clave(): string { return Config::get('TUKAN_PAGOS_CLAVE'); }
    public static function secreto(): string { return Config::get('TUKAN_PAGOS_SECRETO_AVISO'); }

    /** https siempre; http solo a 127.0.0.1 / localhost (pruebas con el Tukán Pagos falso). */
    public static function url(): string
    {
        $u = rtrim(Config::get('TUKAN_PAGOS_URL', 'https://pagos.tukanec.com'), '/');
        return preg_match('#^(https://[^\s/]+|http://(127\.0\.0\.1|localhost)(:\d+)?)(/[^\s]*)?$#', $u) ? $u : '';
    }

    public static function referencia(int $compra): string { return self::PREFIJO . $compra; }

    /** Número de compra de una referencia nuestra, o null. */
    public static function compraDeReferencia(string $ref): ?int
    {
        return preg_match('/^' . preg_quote(self::PREFIJO, '/') . '(\d{1,12})$/', $ref, $m) ? (int) $m[1] : null;
    }

    /**
     * Ambiente de Plux en Tukán Pagos (sandbox | produccion), para el aviso "modo de pruebas" de la tienda.
     * Se pregunta a Tukán Pagos (GET /api/v1/planes) y se guarda 10 minutos; si no contesta, el último que se supo (o sandbox).
     */
    public static function ambiente(): string
    {
        $f = dirname(Config::db()) . '/tukanpagos_ambiente.json';
        $g = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
        if (is_array($g) && time() - (int) ($g['t'] ?? 0) < 600) return (string) $g['a'];
        $a = is_array($g) ? (string) $g['a'] : 'sandbox';
        try {
            $p = self::pedir('GET', '/api/v1/planes', null, 4);
            $a = ($p['plux'] ?? '') === 'produccion' ? 'produccion' : 'sandbox';
        } catch (\Throwable) {
        }
        @file_put_contents($f, json_encode(['a' => $a, 't' => time()]));
        return $a;
    }

    /**
     * Crea (o reutiliza: misma referencia y mismo monto = mismo cobro) el cobro de la compra y devuelve la url de pago.
     * $comprador: nombre, correo, documento (opcional). Lanza Fallo 502 si Tukán Pagos no responde.
     */
    public static function crearCobro(array $c, array $comprador, string $descripcion): string
    {
        $base = rtrim(Config::get('ENVIVO_URL'), '/');
        $nombres = explode(' ', trim((string) ($comprador['nombre'] ?? '')), 2);
        $datos = [
            'referencia' => self::referencia((int) $c['id']),
            'descripcion' => mb_substr('EN VIVO Tycoon - ' . $descripcion, 0, 150),
            'monto' => round((float) $c['total'], 2),
            'con_iva' => true,   // el precio del catálogo ya trae el IVA 15 %
            'comprador' => array_filter(['nombre' => $nombres[0] ?? '', 'apellido' => $nombres[1] ?? '', 'documento' => (string) ($comprador['documento'] ?? ''),
                'correo' => (string) ($comprador['correo'] ?? '')], fn($v) => $v !== ''),
            'url_regreso' => $base . '/api/tukanpagos/volver?o=' . $c['token'],
            'metadatos' => ['compra' => (int) $c['id'], 'jugador' => (int) $c['jugador_id'], 'producto' => (string) $c['producto']],
        ];
        try {
            $r = self::pedir('POST', '/api/v1/cobros', $datos);
        } catch (RuntimeException $e) {
            error_log('EN VIVO Tukan Pagos crear: ' . mb_substr($e->getMessage(), 0, 300));
            throw new Fallo('No pudimos preparar el pago con tarjeta. No se hizo ningún cobro: intenta otra vez en un momento.', 502, ['codigo' => 'tukanpagos_no_responde']);
        }
        $cobro = $r['cobro'] ?? [];
        if (($cobro['estado'] ?? '') === 'aprobado') {   // ya se pagó (otra pestaña): se entrega aquí mismo
            self::aplicarCobro($cobro, 'Tukán Pagos (ya pagado al crear)');
            return '/?compra=ok';
        }
        $url = (string) ($cobro['url_pago'] ?? '');
        if (!preg_match('#^https?://#', $url)) throw new Fallo('No pudimos preparar el pago con tarjeta. Intenta otra vez.', 502, ['codigo' => 'tukanpagos_no_responde']);
        Compras::anotarPaso((int) $c['id'], 'tukanpagos', 'cobro ' . (int) ($cobro['id'] ?? 0) . ' creado en Tukán Pagos', 'tkp-' . (int) ($cobro['id'] ?? 0));
        return $url;
    }

    /** Pregunta a Tukán Pagos el estado del cobro de la compra (el regreso del jugador). null si no hay cobro. */
    public static function cobroDeCompra(int $compra): ?array
    {
        $r = self::pedir('GET', '/api/v1/cobros?referencia=' . rawurlencode(self::referencia($compra)), null, 20, true);
        return $r['cobro'] ?? null;
    }

    /**
     * Aplica un cobro de Tukán Pagos a su compra. Devuelve 'pagado' | 'ya_pagado' | 'rechazado' | 'pendiente' | 'ignorado'.
     * Revisa que la referencia sea nuestra, que la compra sea de tarjeta y que el monto sea EXACTAMENTE el de la compra.
     */
    public static function aplicarCobro(array $cobro, string $quien): string
    {
        $id = self::compraDeReferencia((string) ($cobro['referencia'] ?? ''));
        if ($id === null) return 'ignorado';
        $c = Compras::porId($id);
        if (!$c || ($c['canal'] ?? 'web_plux') !== 'web_plux') return 'ignorado';
        $estado = (string) ($cobro['estado'] ?? '');
        $tx = 'tkp-' . (int) ($cobro['id'] ?? 0);
        if ($estado === 'aprobado') {
            if (abs(round((float) ($cobro['monto'] ?? 0), 2) - round((float) $c['total'], 2)) > 0.001) {
                Db::aviso('tukanpagos_monto', 'Tukán Pagos aprobó el cobro ' . $tx . ' por ' . Http::dinero((float) ($cobro['monto'] ?? 0)) . ' pero la compra N° ' . $id
                    . ' vale ' . Http::dinero((float) $c['total']) . ': NO se entregó. Revisar.', $id);
                return 'ignorado';
            }
            if ($c['estado'] === 'pagado') return 'ya_pagado';
            $resp = 'Tukán Pagos: cobro ' . (int) ($cobro['id'] ?? 0) . ' aprobado' . (isset($cobro['plux_transaccion']) ? ' · Plux ' . mb_substr((string) $cobro['plux_transaccion'], 0, 60) : '');
            return Compras::aprobar($id, $quien, $tx, $resp) ? 'pagado' : 'ya_pagado';
        }
        if ($estado === 'rechazado') {
            Compras::anotarPaso($id, 'fallido', 'Tukán Pagos: tarjeta rechazada (se puede intentar otra vez)', $tx);
            return 'rechazado';
        }
        return 'pendiente';
    }

    /** Verifica la firma del aviso (X-Tukan-Fecha, X-Tukan-Firma = sha256=HMAC(secreto, fecha.cuerpo), máx. 5 minutos). */
    public static function verificarAviso(string $cuerpo, string $fecha, string $firma, int $tolerancia = 300): ?array
    {
        $s = self::secreto();
        if ($s === '' || !ctype_digit($fecha) || abs(time() - (int) $fecha) > $tolerancia) return null;
        if (!hash_equals('sha256=' . hash_hmac('sha256', $fecha . '.' . $cuerpo, $s), $firma)) return null;
        $j = json_decode($cuerpo, true);
        return is_array($j) ? $j : null;
    }

    /** Llama a la API de Tukán Pagos. Lanza RuntimeException (nunca escribe la clave en un registro). */
    private static function pedir(string $metodo, string $ruta, ?array $cuerpo = null, int $espera = 20, bool $nullSi404 = false): array
    {
        $u = self::url();
        if ($u === '' || self::clave() === '') throw new RuntimeException('Tukán Pagos sin configurar');
        $ch = curl_init($u . $ruta);
        $op = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_TIMEOUT => $espera, CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . self::clave(), 'Accept: application/json', 'Content-Type: application/json']];
        if ($cuerpo !== null) $op[CURLOPT_POSTFIELDS] = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        curl_setopt_array($ch, $op);
        $r = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        unset($ch);
        if ($r === false) throw new RuntimeException('Sin conexión con Tukán Pagos: ' . $err);
        $j = json_decode((string) $r, true);
        if ($nullSi404 && $http === 404) return [];
        if (!is_array($j) || $http >= 300 || empty($j['ok'])) throw new RuntimeException('Tukán Pagos: ' . (is_array($j) ? (string) ($j['error'] ?? "HTTP $http") : "HTTP $http"), $http);
        return $j;
    }
}
