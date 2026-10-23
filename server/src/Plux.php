<?php
declare(strict_types=1);

namespace EnVivo;

use RuntimeException;

/**
 * Pago con tarjeta: API de Pago Plux v1.3 (credentials/paymentCardResource). Copiado de TuPass (probado en producción).
 *
 * - Las credenciales van en /etc/envivo/config.env, NUNCA en el código (el repositorio es público):
 *     PLUX_AMBIENTE (sandbox | produccion; por defecto sandbox), PLUX_ID_ESTABLECIMIENTO, PLUX_ID_CLIENTE,
 *     PLUX_CLAVE_SECRETA, PLUX_LLAVE_PUBLICA (la llave pública RSA en una sola línea, sin BEGIN/END),
 *     PLUX_WEBHOOK_USUARIO y PLUX_WEBHOOK_CLAVE (los del aviso de pago).
 * - Authorization: Basic base64(id_cliente:clave_secreta). Cabecera simetricKey = clave al azar de 32 caracteres
 *   cifrada con RSA (PKCS#1) con la llave pública de Plux.
 * - Los datos de la tarjeta se cifran EN EL NAVEGADOR (AES-256-ECB con CryptoJS y la clave con JSEncrypt).
 *   Este servidor solo los reenvía cifrados: NUNCA los guarda ni los escribe en un registro.
 * - Códigos: 0 éxito, 1 error, 2 fallido, 100 pide OTP, 102 OTP incorrecto, 103 pide validación 3DS del banco.
 * - urlRetorno3ds va SIN parámetros (Plux agrega los suyos): la compra se reconoce por la sesión del jugador.
 * - Plux NO suma IVA: se manda siempre el valor final (todos los productos llevan IVA: va en baseAmount12).
 * - Funciona SIN el aviso de pago (webhook): el código 0 y la confirmación 3DS ya entregan la compra.
 */
final class Plux
{
    public const URL_SANDBOX = 'https://apipre.pagoplux.com/intv1/';
    public const URL_PRODUCCION = 'https://api.pagoplux.com/intv1/';
    public const RUTA_PAGO = 'credentials/paymentCardResource';
    public const RUTA_3DS = 'integrations/dataTransactionThreeDsResource';

    public static function ambiente(): string { return Config::get('PLUX_AMBIENTE', 'sandbox') === 'produccion' ? 'produccion' : 'sandbox'; }

    public static function urlBase(): string
    {
        $o = Config::get('PLUX_API_BASE');   // solo para pruebas (servidor falso local)
        if ($o !== '' && preg_match('#^https?://[^\s]+/$#', $o)) return $o;
        return self::ambiente() === 'produccion' ? self::URL_PRODUCCION : self::URL_SANDBOX;
    }

    /** ¿Están las credenciales? */
    public static function configurado(): bool
    {
        foreach (['PLUX_ID_ESTABLECIMIENTO', 'PLUX_ID_CLIENTE', 'PLUX_CLAVE_SECRETA', 'PLUX_LLAVE_PUBLICA'] as $k) if (Config::get($k) === '') return false;
        return true;
    }

    /** La llave pública en formato PEM (para JSEncrypt en el navegador). */
    public static function llavePem(): string
    {
        $k = str_replace('\n', "\n", Config::get('PLUX_LLAVE_PUBLICA'));
        if (str_contains($k, 'BEGIN')) return trim($k);
        return "-----BEGIN PUBLIC KEY-----\n" . trim(chunk_split(preg_replace('/\s+/', '', $k) ?? '', 64, "\n")) . "\n-----END PUBLIC KEY-----";
    }

    /** Llama a Plux. Devuelve el JSON; en error de red: code -1. */
    public static function llamar(string $ruta, array $cuerpo, ?string $claveCifrada = null): array
    {
        $cab = ['Content-Type: application/json', 'Accept: application/json',
                'Authorization: Basic ' . base64_encode(Config::get('PLUX_ID_CLIENTE') . ':' . Config::get('PLUX_CLAVE_SECRETA'))];
        if ($claveCifrada !== null) $cab[] = 'simetricKey: ' . $claveCifrada;
        $ch = curl_init(self::urlBase() . $ruta);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($cuerpo, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => $cab, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_TIMEOUT => 45, CURLOPT_CONNECTTIMEOUT => 15,
        ]);
        $resp = curl_exec($ch);
        $err = curl_error($ch);
        unset($ch);
        if ($resp === false) return ['code' => -1, 'description' => 'No se pudo conectar con Plux (' . $err . ').'];
        $j = json_decode((string) $resp, true);
        return is_array($j) ? $j : ['code' => -1, 'description' => 'Plux respondió algo que no se entiende.'];
    }

    /** Todos los productos llevan IVA: el valor FINAL va en baseAmount12. */
    public static function montos(float $total): array
    {
        return ['baseAmount0' => 0.0, 'baseAmount12' => round($total, 2)];
    }

    public static function limpiarCedula(string $c): string { return strtoupper(preg_replace('/[^0-9A-Za-z]/', '', $c) ?? ''); }

    /** Datos del comprador que manda la página de pago (para Plux y para la factura). Lanza RuntimeException. */
    public static function comprador(array $in, array $jugador): array
    {
        $b = is_array($in['buyer'] ?? null) ? $in['buyer'] : [];
        $t = fn($v, int $n = 60) => mb_substr(trim(is_scalar($v) ? (string) $v : ''), 0, $n);
        $c = [
            'nombres' => $t($b['firstName'] ?? ''),
            'apellidos' => $t($b['lastName'] ?? ''),
            'cedula' => mb_substr(self::limpiarCedula((string) ($b['documentNumber'] ?? '')), 0, 20),
            'email' => $t($b['email'] ?? '', 120) ?: (string) $jugador['email'],
            'telefono' => mb_substr(preg_replace('/[^0-9+]/', '', (string) ($b['phone'] ?? '')) ?? '', 0, 20),
        ];
        if ($c['nombres'] === '' || $c['apellidos'] === '') throw new RuntimeException('Escribe nombres y apellidos del titular de la tarjeta.');
        if (!preg_match('/^[0-9A-Z]{5,20}$/', $c['cedula'])) throw new RuntimeException('Escribe la cédula (o pasaporte) del titular.');
        if (!filter_var($c['email'], FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Escribe un correo válido del titular de la tarjeta.');
        if (strlen($c['telefono']) < 7) throw new RuntimeException('Escribe el número de celular del titular.');
        $c['nombre'] = mb_substr($c['nombres'] . ' ' . $c['apellidos'], 0, 120);
        return $c;
    }

    /** Arma el pedido con la tarjeta YA cifrada en el navegador. Lanza RuntimeException con el texto para el comprador. */
    public static function cuerpo(array $compra, array $comprador, array $in): array
    {
        $card = is_array($in['card'] ?? null) ? $in['card'] : [];
        foreach (['number', 'expirationYear', 'expirationMonth', 'cvv'] as $k) {
            if (!isset($card[$k]) || !is_string($card[$k]) || !preg_match('#^[A-Za-z0-9+/=]{8,400}$#', $card[$k])) {
                throw new RuntimeException('Los datos de la tarjeta llegaron incompletos. Vuelve a escribirlos.');
            }
        }
        $p = Catalogo::producto((string) $compra['producto']);
        $c = [
            'card' => ['number' => $card['number'], 'expirationYear' => $card['expirationYear'], 'expirationMonth' => $card['expirationMonth'], 'cvv' => $card['cvv']],
            'buyer' => ['documentNumber' => $comprador['cedula'], 'firstName' => $comprador['nombres'], 'lastName' => $comprador['apellidos'],
                        'phone' => $comprador['telefono'], 'email' => $comprador['email']],
            'shippingAddress' => ['country' => 'Ecuador', 'city' => 'Quito', 'street' => 'S/N', 'number' => 'S/N'],
            'currency' => 'USD',
            'installments' => '0',
            'interests' => '0',
            'description' => self::descripcion($compra, $p),
            'clientIp' => Http::ip(),
            'idEstablecimiento' => base64_encode(Config::get('PLUX_ID_ESTABLECIMIENTO')),
            'urlRetorno3ds' => Http::urlBase() . '/api/plux/3ds',   // SIN parámetros
        ] + self::montos((float) $compra['total']);
        $otp = $in['paramsOtp'] ?? null;
        if (is_array($otp)) {
            $c['paramsOtp'] = [];
            foreach (['idTransaction', 'sessionId', 'tkn', 'tknky', 'tkniv', 'otpCode'] as $k) {
                if (isset($otp[$k]) && is_scalar($otp[$k])) $c['paramsOtp'][$k] = mb_substr((string) $otp[$k], 0, 2000);
            }
        }
        return $c;
    }

    /** "EV-<id> EN VIVO Tycoon <producto>" (la referencia EV-<id> sirve para reconocer el aviso de pago). */
    public static function descripcion(array $compra, ?array $p): string
    {
        return mb_substr('EV-' . $compra['id'] . ' EN VIVO Tycoon ' . ($p['nombre'] ?? $compra['producto']), 0, 100);
    }

    /** Quita de la respuesta todo lo que pueda ser de la tarjeta antes de guardarla. */
    public static function limpiar(mixed $v): mixed
    {
        if (is_array($v)) {
            $o = [];
            foreach ($v as $k => $x) {
                if (is_string($k) && preg_match('/card|tarjeta|cvv|cvc|pan|expir|number|numero|bin$/i', $k)) continue;
                $o[$k] = self::limpiar($x);
            }
            return $o;
        }
        if (is_string($v)) return preg_replace('/\d[\d \-]{10,22}\d/', '[oculto]', $v);
        return $v;
    }

    public static function texto(array $r): string
    {
        return mb_substr((string) json_encode(self::limpiar($r), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 3000);
    }

    /** Número de transacción que manda Plux (para relacionar el aviso de pago). */
    public static function transaccion(array $r): string
    {
        $d = is_array($r['detail'] ?? null) ? $r['detail'] : $r;
        foreach (['id_transaccion', 'idTransaccion', 'idTransaction', 'transactionId', 'id_transaction', 'token', 'voucher'] as $k) {
            if (isset($d[$k]) && is_scalar($d[$k]) && (string) $d[$k] !== '') return mb_substr((string) $d[$k], 0, 100);
        }
        return '';
    }

    /**
     * Respuesta de Plux -> qué le decimos al navegador. Si fue aprobado, entrega la compra.
     * Devuelve ['status' => success|otp_required|otp_incorrecto|3ds_required|failed, ...].
     */
    public static function procesar(array $compra, array $r, string $origen): array
    {
        $code = (int) ($r['code'] ?? -1);
        $txt = self::texto($r);
        $tr = self::transaccion($r);
        $quien = 'Plux' . (self::ambiente() === 'sandbox' ? ' (PRUEBAS)' : '') . ' · ' . $origen;
        $id = (int) $compra['id'];
        if ($code === 0) {
            Compras::aprobar($id, $quien, $tr !== '' ? $tr : null, $txt);
            return ['status' => 'success'];
        }
        $detalle = is_array($r['detail'] ?? null) ? self::limpiar($r['detail']) : null;
        if ($code === 100) { Compras::anotarPaso($id, 'otp', $txt, $tr); return ['status' => 'otp_required', 'detail' => $detalle]; }
        if ($code === 102) { Compras::anotarPaso($id, 'otp', $txt, $tr); return ['status' => 'otp_incorrecto', 'message' => 'El código no es correcto. Revisa el mensaje de tu banco e intenta otra vez.', 'detail' => $detalle]; }
        if ($code === 103) {
            Compras::anotarPaso($id, '3ds', $txt, $tr);
            $d = is_array($r['detail'] ?? null) ? $r['detail'] : [];
            $url = is_string($d['url'] ?? null) && preg_match('#^https?://#', $d['url']) ? $d['url'] : '';
            if ($url === '') return ['status' => 'failed', 'message' => 'El banco pidió una validación pero no llegó la dirección. Intenta otra vez.'];
            $params = [];
            foreach ((array) ($d['parameters'] ?? []) as $p) if (is_array($p) && isset($p['name'], $p['value'])) $params[] = ['name' => (string) $p['name'], 'value' => (string) $p['value']];
            return ['status' => '3ds_required', 'detail' => ['url' => $url, 'parameters' => $params, 'customFormChallenge' => !empty($d['customFormChallenge'])]];
        }
        Compras::anotarPaso($id, 'fallido', $txt, $tr);
        $msg = is_string($r['detail'] ?? null) && $r['detail'] !== '' ? $r['detail'] : (string) ($r['description'] ?? '');
        if ($code === 2) $msg = 'Tu banco no aprobó el pago' . ($msg !== '' ? ': ' . $msg : '') . '.';
        elseif ($msg === '') $msg = 'El pago no se pudo procesar.';
        error_log('EN VIVO Plux: compra ' . $id . ' respondió ' . $code);   // solo el código, nunca el pedido
        return ['status' => 'failed', 'code' => $code, 'message' => mb_substr((string) self::limpiar($msg), 0, 300)];
    }
}
