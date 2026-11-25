<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Compras dentro de la app de iPhone con el App Store (StoreKit 2). Es el mismo camino que Google Play (src/Google.php):
 * la app de iPhone compra, manda la transacción firmada por Apple (JWS) y el servidor la verifica y entrega.
 * Guía: docs/IPHONE_APP_STORE.md. Lógica de la firma copiada de la probada en el Panel Tukán (tukan-central, src/BroadcastApple.php).
 *
 * Productos: el id de Apple es «envivo.» + el id del catálogo (server/src/Catalogo.php PRODUCTOS): envivo.creditos_250, envivo.inicio...
 *   Lo de «una sola vez» (una_vez) es NON_CONSUMABLE en App Store Connect; lo demás CONSUMABLE. No se vende lo oculto
 *   (transferencia_cuenta, ni lo de un módulo que no está instalado). Lista para App Store Connect: php server/bin/apple_productos.php
 *
 * POST /api/apple/verificar {producto, jws}  (con sesión de jugador; la app de iPhone SÍ puede llamarla)
 *  1. El JWS se verifica aquí con OpenSSL (el servidor nunca le cree al celular):
 *     cabecera x5c (hoja, intermedia, raíz) → la raíz es la Apple Root CA - G3 guardada en el servidor (server/config/apple/),
 *     la intermedia la firmó la raíz y la hoja la intermedia (con las marcas de Apple: OID 1.2.840.113635.100.6.2.1 y
 *     1.2.840.113635.100.6.11.1), certificados vigentes, firma ES256 con la llave de la hoja.
 *  2. bundleId = com.tukanec.envivo, productId = envivo.<id del catálogo> (el mismo que pidió el juego), ambiente Production
 *     o Sandbox (Sandbox = revisión de Apple y TestFlight: se entrega igual pero queda como PRUEBA, sin factura ni venta),
 *     no revocada (devuelta) y, si trae appAccountToken, que sea el de este jugador (apple_cuenta en /api/estado).
 *  3. Idempotente por transactionId y por originalTransactionId: si ya se entregó responde ok con estado «ya_entregado».
 *  4. Entrega como Google (Compras::insertar + Compras::aprobar, canal 'apple'). Lo de una sola vez repetido NO se entrega
 *     otra vez (queda un aviso para el dueño; el jugador pide la devolución a Apple).
 * POST /api/apple/notificacion  App Store Server Notifications V2 {signedPayload} (sin sesión: la firma es de Apple)
 *     REFUND / REVOKE → revierte la compra como un reembolso de Google (Compras::revertir). Cada aviso se atiende una vez.
 *
 * Configuración (/etc/envivo/config.env, todo opcional):
 *   APPLE_ROOT_CA   ruta de la raíz de Apple (por defecto server/config/apple/AppleRootCA-G3.cer del repositorio; DER o PEM)
 *   APPLE_SANDBOX   1 (por defecto) = acepta compras de Sandbox (revisión de Apple y TestFlight); 0 = solo Production
 *   APPLE_BUNDLE_ID solo pruebas (por defecto com.tukanec.envivo)
 */
final class Apple
{
    public const BUNDLE = 'com.tukanec.envivo';
    public const PREFIJO = 'envivo.';
    public const OID_HOJA = '1.2.840.113635.100.6.11.1';
    public const OID_INTERMEDIA = '1.2.840.113635.100.6.2.1';
    /** Huella SHA-256 de la Apple Root CA - G3 de verdad (https://www.apple.com/certificateauthority/), para revisar el archivo. */
    public const HUELLA_RAIZ_APPLE = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
    public const JWS_MAX = 60000;
    /** Espacio de nombres (UUID v5) para el apple_cuenta de cada jugador. Fijo: si cambia, las compras viejas no coinciden. */
    public const ESPACIO_CUENTA = '6f1d2a4e-8c3b-5e7a-9d41-2b6c8e0f7a35';
    public const QUIEN = 'App Store';
    /** pagado_por de una compra de Sandbox (PanelVentas::esPrueba busca "PRUEBA"). */
    public const QUIEN_PRUEBA = 'App Store (PRUEBA, Sandbox, sin cobro)';

    /** Solo pruebas: la hora "ahora" (para revisar fechas de certificados). */
    public static ?int $ahora = null;

    private static function t(): int { return self::$ahora ?? time(); }

    // ------------------------------------------------------------------ configuración

    public static function rutaRaiz(): string
    {
        return Config::get('APPLE_ROOT_CA', dirname(__DIR__) . '/config/apple/AppleRootCA-G3.cer');
    }

    public static function bundle(): string { return Config::get('APPLE_BUNDLE_ID', self::BUNDLE); }

    /** Sandbox (revisión de Apple y TestFlight) aceptado salvo APPLE_SANDBOX=0. */
    public static function sandbox(): bool { return !in_array(strtolower(Config::get('APPLE_SANDBOX', '1')), ['0', 'no', 'false'], true); }

    public static function configurado(): bool { return self::raizPem() !== null; }

    /** Production siempre; Sandbox salvo APPLE_SANDBOX=0; Xcode / LocalTesting nunca. */
    public static function entornoAceptado(string $entorno): bool
    {
        return $entorno === 'Production' || ($entorno === 'Sandbox' && self::sandbox());
    }

    private static function pem(string $der): string
    {
        return "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END CERTIFICATE-----\n";
    }

    /** La raíz de confianza en PEM (el archivo puede ser DER, como lo baja Apple, o PEM). null si falta o no es un certificado. */
    public static function raizPem(): ?string
    {
        $f = self::rutaRaiz();
        if (!is_file($f) || !is_readable($f)) return null;
        $d = (string) file_get_contents($f);
        $pem = str_contains($d, '-----BEGIN CERTIFICATE-----') ? $d : self::pem($d);
        return @openssl_x509_read($pem) ? $pem : null;
    }

    /** ¿La raíz guardada es la de Apple de verdad? (para el chequeo de salud y el Centro de Control) */
    public static function raizEsDeApple(): bool
    {
        $r = self::raizPem();
        return $r !== null && openssl_x509_fingerprint($r, 'sha256') === self::HUELLA_RAIZ_APPLE;
    }

    // ------------------------------------------------------------------ productos y cuenta

    /** envivo.creditos_250 → creditos_250 (null si no empieza con «envivo.»). */
    public static function idCatalogo(string $idApple): ?string
    {
        if (!str_starts_with($idApple, self::PREFIJO)) return null;
        $id = substr($idApple, strlen(self::PREFIJO));
        return preg_match('/^[a-z0-9_]{1,60}$/', $id) ? $id : null;
    }

    public static function idApple(string $idCatalogo): string { return self::PREFIJO . $idCatalogo; }

    /** Producto del catálogo que se vende en el App Store (null si no existe o está oculto: transferencia_cuenta o sin módulo). */
    public static function producto(string $idCatalogo): ?array
    {
        $p = Catalogo::producto($idCatalogo);
        return $p !== null && empty($p['oculto']) ? $p : null;
    }

    /** Tipo de compra en App Store Connect: lo de una sola vez no se gasta (NON_CONSUMABLE); lo demás sí (CONSUMABLE). */
    public static function tipo(array $p): string { return !empty($p['una_vez']) ? 'NON_CONSUMABLE' : 'CONSUMABLE'; }

    /**
     * appAccountToken del jugador: UUID v5 estable (siempre el mismo para la misma cuenta). La app lo pasa al comprar
     * (Product.PurchaseOption.appAccountToken) y Apple lo devuelve dentro de la transacción firmada.
     */
    public static function cuenta(int $jugador): string
    {
        $ns = (string) hex2bin(str_replace('-', '', self::ESPACIO_CUENTA));
        $h = sha1($ns . 'envivo-jugador:' . $jugador);
        $h = substr($h, 0, 12) . '5' . substr($h, 13, 3) . dechex((hexdec($h[16]) & 0x3) | 0x8) . substr($h, 17, 15);
        return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20, 12);
    }

    /** Para /api/estado: el appAccountToken que el juego pasa como «cuenta» al comprar (null sin sesión). */
    public static function estado(?int $jugador): array
    {
        return ['apple_cuenta' => $jugador ? self::cuenta($jugador) : null];
    }

    // ------------------------------------------------------------------ verificar un JWS de Apple

    private static function b64url(string $s): string
    {
        $r = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
        if ($r === false) throw self::invalida('La compra no tiene el formato de Apple.');
        return $r;
    }

    private static function invalida(string $msg, string $codigo = 'apple_invalida', int $http = 402): Fallo
    {
        return new Fallo($msg, $http, ['codigo' => $codigo]);
    }

    /** Firma JWS ES256 (R||S, 64 bytes) → DER (lo que entiende openssl_verify). */
    public static function firmaADer(string $raw): string
    {
        if (strlen($raw) !== 64) throw self::invalida('La firma de la compra no es válida.');
        $ent = function (string $b): string {
            $b = ltrim($b, "\x00");
            if ($b === '' || ord($b[0]) & 0x80) $b = "\x00" . $b;
            return "\x02" . chr(strlen($b)) . $b;
        };
        $seq = $ent(substr($raw, 0, 32)) . $ent(substr($raw, 32));
        return "\x30" . chr(strlen($seq)) . $seq;
    }

    /**
     * Verifica un JWS firmado por Apple (transacción o notificación) y devuelve su contenido.
     * Lanza Fallo 402 apple_invalida con el motivo en español sencillo si algo no cuadra.
     */
    public static function verificarJws(string $jws): array
    {
        $jws = trim($jws);
        if ($jws === '' || strlen($jws) > self::JWS_MAX) throw self::invalida('Falta la compra de Apple.', 'datos_invalidos', 400);
        $p = explode('.', $jws);
        if (count($p) !== 3) throw self::invalida('La compra no tiene el formato de Apple.');
        $cab = json_decode(self::b64url($p[0]), true);
        if (!is_array($cab) || ($cab['alg'] ?? '') !== 'ES256') throw self::invalida('La compra no tiene el formato de Apple.');
        $x5c = $cab['x5c'] ?? null;
        if (!is_array($x5c) || count($x5c) !== 3) throw self::invalida('La compra no trae los certificados de Apple.');
        $certs = [];
        foreach ($x5c as $b) {
            $der = is_string($b) ? base64_decode($b, true) : false;
            $pem = $der ? self::pem($der) : '';
            if (!$der || !@openssl_x509_read($pem)) throw self::invalida('La compra no trae los certificados de Apple.');
            $certs[] = $pem;
        }
        [$hoja, $inter, $raizX5c] = $certs;
        $raiz = self::raizPem() ?? throw new Fallo('Las compras del App Store todavía no están listas en el servidor. Intenta más tarde.', 503, ['codigo' => 'apple_no_disponible']);

        // Cadena: la raíz que trae es la nuestra, la intermedia la firmó la raíz y la hoja la firmó la intermedia
        if (openssl_x509_fingerprint($raizX5c, 'sha256') !== openssl_x509_fingerprint($raiz, 'sha256')) throw self::invalida('La compra no viene de Apple.');
        if (openssl_x509_verify($inter, openssl_pkey_get_public($raiz)) !== 1) throw self::invalida('La compra no viene de Apple.');
        if (openssl_x509_verify($hoja, openssl_pkey_get_public($inter)) !== 1) throw self::invalida('La compra no viene de Apple.');
        $di = openssl_x509_parse($inter);
        $dh = openssl_x509_parse($hoja);
        if (!isset($di['extensions'][self::OID_INTERMEDIA]) || !str_contains((string) ($di['extensions']['basicConstraints'] ?? ''), 'CA:TRUE')) {
            throw self::invalida('La compra no viene de Apple.');
        }
        if (!isset($dh['extensions'][self::OID_HOJA])) throw self::invalida('La compra no viene de Apple.');

        // Firma ES256 con la llave de la hoja (P-256)
        $llave = openssl_pkey_get_public($hoja);
        $info = $llave ? openssl_pkey_get_details($llave) : null;
        if (!$info || ($info['ec']['curve_name'] ?? '') !== 'prime256v1') throw self::invalida('La firma de la compra no es válida.');
        if (openssl_verify($p[0] . '.' . $p[1], self::firmaADer(self::b64url($p[2])), $llave, OPENSSL_ALGO_SHA256) !== 1) {
            throw self::invalida('La firma de la compra no es válida.');
        }
        $datos = json_decode(self::b64url($p[1]), true);
        if (!is_array($datos)) throw self::invalida('La compra no tiene el formato de Apple.');

        // Certificados vigentes cuando Apple firmó (signedDate; si no viene, ahora). Firmado en el futuro = no
        $ahora = self::t();
        $momento = isset($datos['signedDate']) && is_numeric($datos['signedDate']) ? intdiv((int) $datos['signedDate'], 1000) : $ahora;
        if ($momento > $ahora + 300) throw self::invalida('La fecha de la compra no es válida.');
        foreach ([$dh, $di, openssl_x509_parse($raiz)] as $c) {
            if ($momento < (int) $c['validFrom_time_t'] || $momento > (int) $c['validTo_time_t']) throw self::invalida('Los certificados de la compra están vencidos.');
        }
        return $datos;
    }

    // ------------------------------------------------------------------ verificar y entregar

    /** Compra ya registrada con esa transacción (por transactionId o por originalTransactionId). */
    public static function existente(string $transaccion, string $original = ''): ?array
    {
        $c = Db::fila('SELECT * FROM compras WHERE apple_transaccion = ?', [$transaccion]);
        if (!$c && $original !== '') $c = Db::fila('SELECT * FROM compras WHERE apple_original = ? OR apple_transaccion = ? ORDER BY id LIMIT 1', [$original, $original]);
        return $c;
    }

    /**
     * Verifica la transacción del App Store y entrega. Devuelve ['nueva' => bool, 'compra' => fila].
     * $producto = id del catálogo que pidió el juego (vacío = el de la transacción).
     */
    public static function verificar(int $jugador, string $producto, string $jws): array
    {
        Fallo::si(!self::configurado(), 'Las compras del App Store todavía no están disponibles.', 503, ['codigo' => 'apple_no_disponible']);
        Fallo::si($producto !== '' && !preg_match('/^[a-z0-9_]{1,60}$/', $producto), 'Ese producto no existe.', 404, ['codigo' => 'no_existe']);
        $tx = self::verificarJws($jws);
        if (($tx['bundleId'] ?? '') !== self::bundle()) throw self::invalida('Esa compra es de otra app.', 'apple_no_coincide', 409);
        $entorno = (string) ($tx['environment'] ?? '');
        if (!self::entornoAceptado($entorno)) {
            throw self::invalida($entorno === 'Sandbox' ? 'Las compras de prueba (Sandbox) no están habilitadas en este servidor.' : 'Esa compra no es del App Store.', 'apple_ambiente');
        }
        $idApple = (string) ($tx['productId'] ?? '');
        $id = self::idCatalogo($idApple);
        $p = $id !== null ? self::producto($id) : null;
        Fallo::si(!$p, 'Ese producto no existe.', 404, ['codigo' => 'no_existe']);
        Fallo::si($producto !== '' && $producto !== $id, 'Los datos de la compra no coinciden con el App Store.', 409, ['codigo' => 'apple_no_coincide']);
        $txid = (string) ($tx['transactionId'] ?? '');
        $original = (string) ($tx['originalTransactionId'] ?? $txid);
        Fallo::si(!preg_match('/^\d{1,30}$/', $txid) || !preg_match('/^\d{1,30}$/', $original), 'Falta el número de la compra de Apple.', 400, ['codigo' => 'datos_invalidos']);
        $tipoApple = (string) ($tx['type'] ?? '');
        $tipoEsperado = self::tipo($p) === 'NON_CONSUMABLE' ? 'Non-Consumable' : 'Consumable';
        Fallo::si($tipoApple !== '' && $tipoApple !== $tipoEsperado, 'La compra no corresponde a ese producto.', 409, ['codigo' => 'apple_no_coincide']);
        $tok = strtolower((string) ($tx['appAccountToken'] ?? ''));
        if ($tok !== '' && !hash_equals(self::cuenta($jugador), $tok)) {
            Db::aviso('apple_otra_cuenta', 'La cuenta ' . $jugador . ' intentó usar la compra del App Store ' . $txid . ' hecha para otra cuenta del juego. Rechazado.');
            throw new Fallo('Esa compra del App Store es de otra cuenta del juego.', 409, ['codigo' => 'apple_otra_cuenta']);
        }
        // ¿Ya se registró? (el juego la manda varias veces: al comprar, al abrir el juego, al restaurar)
        $ya = self::existente($txid, $original);
        if ($ya) return self::yaRegistrada($jugador, $id, $ya);
        if (!empty($tx['revocationDate'])) throw self::invalida('Apple devolvió el dinero de esa compra (o la anuló).', 'apple_revocada', 409);
        if ((int) ($tx['quantity'] ?? 1) > 1) Db::aviso('apple_cantidad', 'La compra del App Store ' . $txid . ' (' . $idApple . ') trae cantidad ' . (int) $tx['quantity'] . ': se entrega una. Revisar.');

        $prueba = $entorno === 'Sandbox';
        $r = Db::tx(function () use ($jugador, $p, $txid, $original, $entorno, $tx, $prueba): array {
            $ya = self::existente($txid, $original);
            if ($ya) return ['ya' => $ya];
            // De una sola vez y ya lo tiene (por ejemplo, comprado antes en la web con esta misma cuenta): no se entrega otra vez
            if (!empty($p['una_vez'])) {
                $otra = Db::valor("SELECT id FROM compras WHERE jugador_id = ? AND producto = ? AND estado IN ('pagado', 'revertido')", [$jugador, $p['id']]);
                if ($otra) return ['duplicada' => (int) $otra];
            }
            $c = Compras::insertar($jugador, $p, 'apple', null, [], ['transaccion' => $txid, 'original' => $original, 'ambiente' => $entorno]);
            Compras::aprobar((int) $c['id'], $prueba ? self::QUIEN_PRUEBA : self::QUIEN, $txid, mb_substr((string) json_encode(self::limpiar($tx), JSON_UNESCAPED_SLASHES), 0, 3000));
            return ['nueva' => Compras::porId((int) $c['id'])];
        });
        if (isset($r['ya'])) return self::yaRegistrada($jugador, $id, $r['ya']);
        if (isset($r['duplicada'])) {
            if (!Db::valor("SELECT 1 FROM avisos WHERE tipo = 'apple_una_vez_duplicado' AND detalle LIKE ?", ['%' . $txid . '%'])) {
                Db::aviso('apple_una_vez_duplicado', 'El jugador ' . $jugador . ' compró otra vez en el App Store "' . $p['nombre'] . '" (transacción ' . $txid . '), que es de una sola vez y ya tenía (compra N° ' . $r['duplicada'] . '). No se entregó otra vez: el jugador debe pedir la devolución a Apple (reportaproblem.apple.com).', $r['duplicada']);
            }
            throw new Fallo('Ya tienes «' . $p['nombre'] . '» (se compra una sola vez), así que no te lo entregamos otra vez. Puedes pedir la devolución a Apple en reportaproblem.apple.com.', 409, ['codigo' => 'apple_ya_comprado']);
        }
        $cid = (int) $r['nueva']['id'];
        if ($prueba) Db::aviso('apple_compra_prueba', 'La compra N° ' . $cid . ' es de PRUEBA (Sandbox del App Store: revisión de Apple o TestFlight). Apple no cobró. No se factura.', $cid);
        // Apple ya cobró: se entrega aunque la tienda esté cerrada o la cuenta no esté activa. Queda la nota para el dueño.
        $notas = [];
        if (Ajustes::mantenimiento()) $notas[] = 'la tienda estaba en mantenimiento';
        $estadoCuenta = Cuentas::estadoCuenta($jugador);
        if ($estadoCuenta !== 'activo') $notas[] = 'la cuenta estaba ' . match ($estadoCuenta) { 'suspendido' => 'suspendida', 'baneado' => 'baneada', 'borrado' => 'borrada', default => $estadoCuenta };
        if ($notas) Db::aviso('apple_entregada_con_tienda_cerrada', 'La compra N° ' . $cid . ' del App Store (ya cobrada) se entregó aunque ' . implode(' y ', $notas) . '.', $cid);
        return ['nueva' => true, 'compra' => Compras::porId($cid)];
    }

    private static function yaRegistrada(int $jugador, string $producto, array $ya): array
    {
        if ((int) $ya['jugador_id'] !== $jugador) {
            Db::aviso('apple_otra_cuenta', 'La cuenta ' . $jugador . ' intentó usar la compra del App Store de la compra N° ' . $ya['id'] . ' (cuenta ' . $ya['jugador_id'] . '). Rechazado.', (int) $ya['id']);
            Auditoria::anotar('App Store', 'apple_otra_cuenta', 'Transacción de la compra N° ' . $ya['id'] . ' usada desde la cuenta ' . $jugador, $jugador, (int) $ya['id']);
            throw new Fallo('Esa compra del App Store ya se usó en otra cuenta.', 409, ['codigo' => 'apple_otra_cuenta']);
        }
        Fallo::si($ya['producto'] !== $producto, 'Los datos de la compra no coinciden.', 409, ['codigo' => 'apple_no_coincide']);
        if ($ya['estado'] === 'pagado') return ['nueva' => false, 'compra' => Compras::porId((int) $ya['id'])];
        throw new Fallo('Esa compra del App Store está ' . $ya['estado'] . '.', 409, ['codigo' => 'apple_' . $ya['estado']]);
    }

    /** Lo que se guarda de la transacción (sin el appAccountToken). */
    private static function limpiar(array $tx): array
    {
        $o = [];
        foreach (['transactionId', 'originalTransactionId', 'productId', 'type', 'environment', 'purchaseDate', 'storefront', 'price', 'currency', 'quantity', 'inAppOwnershipType', 'transactionReason'] as $k) {
            if (isset($tx[$k]) && is_scalar($tx[$k])) $o[$k] = $tx[$k];
        }
        return $o;
    }

    // ------------------------------------------------------------------ App Store Server Notifications V2

    /**
     * Aviso de Apple ({signedPayload}). 200 si se entendió (aunque no haya nada que hacer) para que Apple no lo repita;
     * 400 si la firma no es de Apple. Devoluciones (REFUND) y anulaciones (REVOKE) revierten la compra (Compras::revertir).
     * @return array{0:int,1:array}
     */
    public static function notificacion(string $cuerpo): array
    {
        $j = json_decode($cuerpo, true);
        $sp = is_array($j) && is_string($j['signedPayload'] ?? null) ? $j['signedPayload'] : '';
        if ($sp === '') return [400, ['ok' => false, 'error' => 'Falta signedPayload.']];
        try {
            $n = self::verificarJws($sp);
            $data = is_array($n['data'] ?? null) ? $n['data'] : [];
            $tx = !empty($data['signedTransactionInfo']) && is_string($data['signedTransactionInfo']) ? self::verificarJws($data['signedTransactionInfo']) : null;
        } catch (Fallo $e) {
            return [$e->getCode() === 503 ? 503 : 400, ['ok' => false, 'error' => $e->getMessage()]];
        }
        $tipo = mb_substr((string) ($n['notificationType'] ?? ''), 0, 60);
        $sub = mb_substr((string) ($n['subtype'] ?? ''), 0, 60);
        $uuid = mb_substr((string) ($n['notificationUUID'] ?? ''), 0, 80);
        if (($data['bundleId'] ?? ($tx['bundleId'] ?? '')) !== self::bundle()) return [200, ['ok' => true, 'resultado' => 'otra app']];
        if (!self::entornoAceptado((string) ($data['environment'] ?? ($tx['environment'] ?? '')))) return [200, ['ok' => true, 'resultado' => 'ambiente no aceptado']];
        $txid = (string) ($tx['transactionId'] ?? '');
        if ($uuid !== '') {
            $nuevo = Db::q('INSERT OR IGNORE INTO apple_avisos (uuid, tipo, subtipo, transaccion, resultado, creado) VALUES (?, ?, ?, ?, ?, ?)', [$uuid, $tipo, $sub, $txid ?: null, '', time()])->rowCount() > 0;
            if (!$nuevo) return [200, ['ok' => true, 'resultado' => 'repetido']];
        }
        $res = self::aplicarAviso($tipo, $sub, $tx);
        if ($uuid !== '') Db::q('UPDATE apple_avisos SET resultado = ? WHERE uuid = ?', [mb_substr($res, 0, 300), $uuid]);
        return [200, ['ok' => true, 'resultado' => $res]];
    }

    private static function aplicarAviso(string $tipo, string $sub, ?array $tx): string
    {
        if ($tipo === 'TEST') return 'prueba de Apple';
        if (!$tx) return 'sin transacción';
        $txid = (string) ($tx['transactionId'] ?? '');
        $compra = $txid !== '' ? Db::fila('SELECT * FROM compras WHERE apple_transaccion = ?', [$txid]) : null;
        switch ($tipo) {
            case 'REFUND':
            case 'REVOKE':
                if (!$compra) {
                    Db::aviso('apple_devuelta_sin_compra', 'Apple devolvió (' . $tipo . ') la transacción ' . $txid . ' (' . ($tx['productId'] ?? '?') . ') que no está en el juego.');
                    return 'devolución de una compra que no está en el juego';
                }
                $motivo = 'Apple devolvió el dinero (' . $tipo . ($sub !== '' ? ' ' . $sub : '') . ', motivo ' . (int) ($tx['revocationReason'] ?? 0) . ')';
                return Compras::revertir((int) $compra['id'], 'reembolso', $motivo, self::QUIEN) ? 'compra N° ' . $compra['id'] . ' revertida' : 'compra N° ' . $compra['id'] . ' ya estaba ' . $compra['estado'];
            case 'REFUND_REVERSED':
                if ($compra) Db::aviso('apple_devolucion_anulada', 'Apple anuló la devolución de la compra N° ' . $compra['id'] . ' (transacción ' . $txid . '). Si se revirtió, revisar si hay que entregarla otra vez a mano.', (int) $compra['id']);
                return 'devolución anulada (aviso al dueño)';
            case 'CONSUMPTION_REQUEST':
                if ($compra) Db::aviso('apple_pide_consumo', 'El jugador pidió a Apple la devolución de la compra N° ' . $compra['id'] . ' (transacción ' . $txid . '). Apple decide; si la devuelve llega REFUND y se revierte sola.', (int) $compra['id']);
                return 'pedido de devolución (aviso al dueño)';
            case 'REFUND_DECLINED':
                return 'Apple no devolvió el dinero';
            default:
                return 'sin cambios (' . $tipo . ')';
        }
    }
}
