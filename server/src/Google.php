<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Compras dentro de la app de Android (Google Play Billing). Ver server/GOOGLE_PLAY.md.
 * Configuración (/etc/envivo/config.env): GOOGLE_PACKAGE_NAME (ej. com.tukanec.envivo) y GOOGLE_SERVICE_ACCOUNT_JSON
 * (ruta del archivo .json de la cuenta de servicio, fuera del repositorio). GOOGLE_API_BASE solo para pruebas (servidor falso).
 *
 * POST /api/google/verificar {producto, purchaseToken, orderId?}   (en la app TWA el orderId llega vacío: se toma de Google)
 *  1. Pide a Google la compra (androidpublisher v3 purchases.products.get) con un token OAuth de la cuenta de servicio.
 *  2. Revisa: pagada (purchaseState 0), mismo producto, mismo orderId, y si la app mandó obfuscatedExternalAccountId,
 *     que sea de este jugador ("ev-<id del jugador>").
 *  3. Idempotente por purchaseToken y por orderId: si ya se entregó, responde lo mismo sin entregar otra vez.
 *  4. Entrega como una compra de Plux (canal 'google_play') y avisa a Google: consume (productos que se pueden volver a
 *     comprar) o acknowledge (los de una sola vez). Si Google no recibe el aviso en 3 días, devuelve el dinero solo.
 * bin/google_anulados.php revisa las compras anuladas (Voided Purchases API) y las revierte como un reembolso/contracargo.
 * Abuso de reembolsos (contracargo, o N reembolsos en X días -> baneo): lo decide Compras::revisarAbuso (reglas en Ajustes).
 */
final class Google
{
    public const API = 'https://androidpublisher.googleapis.com/';
    public const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

    private static ?array $token = null;

    public static function configurado(): bool
    {
        $f = Config::get('GOOGLE_SERVICE_ACCOUNT_JSON');
        return Config::get('GOOGLE_PACKAGE_NAME') !== '' && $f !== '' && is_readable($f);
    }

    private static function base(): string
    {
        $b = Config::get('GOOGLE_API_BASE');
        return $b !== '' && preg_match('#^https?://[^\s]+/$#', $b) ? $b : self::API;
    }

    private static function paquete(): string { return rawurlencode(Config::get('GOOGLE_PACKAGE_NAME')); }

    private static function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

    /** Pedido HTTP (POST con $form o $json, o GET). Devuelve [código, json|null]. */
    private static function http(string $metodo, string $url, ?array $json = null, ?array $form = null, ?string $bearer = null): array
    {
        $ch = curl_init($url);
        $cab = ['Accept: application/json'];
        if ($bearer !== null) $cab[] = 'Authorization: Bearer ' . $bearer;
        $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => true];
        if ($form !== null) { $o[CURLOPT_POSTFIELDS] = http_build_query($form); $cab[] = 'Content-Type: application/x-www-form-urlencoded'; }
        elseif ($json !== null) { $o[CURLOPT_POSTFIELDS] = json_encode($json); $cab[] = 'Content-Type: application/json'; }
        elseif ($metodo === 'POST') { $o[CURLOPT_POSTFIELDS] = ''; }
        $o[CURLOPT_HTTPHEADER] = $cab;
        curl_setopt_array($ch, $o);
        $r = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($r === false) return [0, null];
        $j = json_decode((string) $r, true);
        return [$code, is_array($j) ? $j : ($r === '' ? [] : null)];
    }

    /** Token OAuth2 de la cuenta de servicio (JWT firmado con su llave privada, RS256). */
    private static function token(): string
    {
        if (self::$token !== null && self::$token['vence'] > time() + 60) return self::$token['valor'];
        $sa = json_decode((string) file_get_contents(Config::get('GOOGLE_SERVICE_ACCOUNT_JSON')), true);
        if (!is_array($sa) || empty($sa['client_email']) || empty($sa['private_key'])) throw new Fallo('La cuenta de servicio de Google no es válida.', 503, ['codigo' => 'google_no_disponible']);
        // Siempre la dirección fija de Google (no la del .json: si alguien cambia el archivo no se manda el JWT a otro lado).
        $u = Config::get('GOOGLE_TOKEN_URL');   // SOLO PRUEBAS (Google falso); en el servidor va vacío
        $uri = $u !== '' && preg_match('~^https?://[^\s?#]+$~', $u) ? $u : 'https://oauth2.googleapis.com/token';
        $t = time();
        $jwt = self::b64u(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])) . '.' . self::b64u(json_encode(['iss' => $sa['client_email'], 'scope' => self::SCOPE, 'aud' => $uri, 'iat' => $t, 'exp' => $t + 3600]));
        if (!openssl_sign($jwt, $firma, (string) $sa['private_key'], OPENSSL_ALGO_SHA256)) throw new Fallo('No se pudo firmar con la llave de Google.', 503, ['codigo' => 'google_no_disponible']);
        [$c, $j] = self::http('POST', $uri, null, ['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt . '.' . self::b64u($firma)]);
        if ($c !== 200 || empty($j['access_token'])) { error_log('EN VIVO Google: token respondió ' . $c); throw new Fallo('No se pudo hablar con Google Play. Intenta otra vez en unos minutos.', 502, ['codigo' => 'google_error']); }
        self::$token = ['valor' => (string) $j['access_token'], 'vence' => $t + (int) ($j['expires_in'] ?? 3600)];
        return self::$token['valor'];
    }

    /** Pedido a la API con el token; si Google responde 401 (token vencido o revocado) pide otro y reintenta una vez. */
    private static function api(string $metodo, string $url, ?array $json = null): array
    {
        $r = self::http($metodo, $url, $json, null, self::token());
        if ($r[0] === 401) { self::$token = null; $r = self::http($metodo, $url, $json, null, self::token()); }
        return $r;
    }

    private static function urlProducto(string $producto, string $token, string $accion = ''): string
    {
        return self::base() . 'androidpublisher/v3/applications/' . self::paquete() . '/purchases/products/' . rawurlencode($producto) . '/tokens/' . rawurlencode($token) . $accion;
    }

    /** Compra ya registrada con ese comprobante (por el hash del purchaseToken; nunca por un orderId vacío). */
    public static function existente(string $purchaseToken, string $orderId = ''): ?array
    {
        $c = Db::fila('SELECT * FROM compras WHERE google_token_hash = ?', [hash('sha256', $purchaseToken)]);
        if (!$c && $orderId !== '') $c = Db::fila("SELECT * FROM compras WHERE google_order_id = ? AND google_order_id <> ''", [$orderId]);
        return $c;
    }

    /**
     * Verifica y entrega. Devuelve ['nueva' => bool, 'compra' => fila].
     * Dentro de la app de Android (TWA, Digital Goods API) solo llega el purchaseToken: el orderId es opcional y se toma
     * de la respuesta de Google. La cuenta se amarra por la SESIÓN: la primera cuenta que verifica un comprobante se
     * queda con él; si otra cuenta lo intenta después, se rechaza y queda anotado.
     */
    public static function verificar(int $jugador, string $producto, string $purchaseToken, string $orderId): array
    {
        Fallo::si(!self::configurado(), 'Las compras de Google Play todavía no están disponibles.', 503, ['codigo' => 'google_no_disponible']);
        Fallo::si(!preg_match('/^[A-Za-z0-9._:\-]{10,600}$/', $purchaseToken), 'Falta el comprobante de Google Play.', 400, ['codigo' => 'datos_invalidos']);
        Fallo::si($orderId !== '' && !preg_match('/^[A-Za-z0-9.\-]{5,100}$/', $orderId), 'El número de orden de Google Play no es válido.', 400, ['codigo' => 'datos_invalidos']);
        $p = Catalogo::productoGoogle($producto);
        Fallo::si(!$p, 'Ese producto no existe.', 404, ['codigo' => 'no_existe']);
        // ¿Ya se registró? (el juego manda el mismo comprobante varias veces: al comprar y al abrir la app para "restaurar")
        $ya = self::existente($purchaseToken, $orderId);
        if ($ya) return self::yaRegistrada($jugador, $producto, $purchaseToken, $ya);
        Ajustes::exigirTiendaAbierta();
        Cuentas::exigirActiva($jugador);
        [$c, $g] = self::api('GET', self::urlProducto($producto, $purchaseToken));
        if ($c === 404 || $c === 400 || $c === 410) throw new Fallo('Google Play no reconoce esa compra.', 402, ['codigo' => 'google_invalida']);
        if ($c !== 200 || !is_array($g)) { error_log('EN VIVO Google: purchases.products.get respondió ' . $c); throw new Fallo('No se pudo verificar la compra con Google Play. Intenta otra vez.', 502, ['codigo' => 'google_error']); }
        $estado = (int) ($g['purchaseState'] ?? -1);
        Fallo::si($estado === 2, 'Tu pago está pendiente en Google Play. Te entregaremos la compra cuando se apruebe.', 402, ['codigo' => 'google_pendiente']);
        Fallo::si($estado !== 0, 'Esa compra fue cancelada en Google Play.', 402, ['codigo' => 'google_cancelada']);
        $orden = (string) ($g['orderId'] ?? '');
        Fallo::si($orderId !== '' && $orden !== '' && $orden !== $orderId, 'Los datos de la compra no coinciden con Google Play.', 409, ['codigo' => 'google_no_coincide']);
        if ($orden === '') $orden = $orderId;
        if (isset($g['productId'])) Fallo::si((string) $g['productId'] !== $producto, 'Los datos de la compra no coinciden con Google Play.', 409, ['codigo' => 'google_no_coincide']);
        $cuenta = (string) ($g['obfuscatedExternalAccountId'] ?? '');
        Fallo::si($cuenta !== '' && !hash_equals('ev-' . $jugador, $cuenta), 'Esa compra de Google Play es de otra cuenta del juego.', 409, ['codigo' => 'google_otra_cuenta']);
        // Una sola transacción: si dos pedidos con el mismo comprobante llegan a la vez, el segundo ve la compra del primero
        $r = Db::tx(function () use ($jugador, $p, $purchaseToken, $orden, $g): array {
            $ya = self::existente($purchaseToken, $orden);
            if ($ya) return ['ya' => $ya];
            // Si era de una sola vez y ya lo tenía, Google ya cobró: Compras::aprobar la deja pagada SIN entregar otra vez y con aviso.
            $c = Compras::insertar($jugador, $p, 'google_play', null, ['order_id' => $orden, 'token' => $purchaseToken]);
            Compras::aprobar((int) $c['id'], 'Google Play', $orden !== '' ? $orden : null, mb_substr((string) json_encode(Plux::limpiar($g), JSON_UNESCAPED_SLASHES), 0, 3000));
            return ['nueva' => Compras::porId((int) $c['id'])];
        });
        if (isset($r['ya'])) return self::yaRegistrada($jugador, $producto, $purchaseToken, $r['ya']);
        if ((int) ($g['purchaseType'] ?? -1) === 0) {
            // Cuenta de "Pruebas de licencias" de Play Console: Google no cobró. Se entrega igual (para que el dueño pruebe),
            // pero queda marcada y el Centro de Control no la cuenta como venta.
            Db::q("UPDATE compras SET pagado_por = 'Google Play (PRUEBA, sin cobro)' WHERE id = ?", [$r['nueva']['id']]);
            Db::aviso('google_compra_prueba', 'La compra N° ' . $r['nueva']['id'] . ' es de PRUEBA (cuenta de pruebas de licencias de Google Play): Google no cobró.', (int) $r['nueva']['id']);
        }
        self::avisar($r['nueva']);
        return ['nueva' => true, 'compra' => Compras::porId((int) $r['nueva']['id'])];
    }

    private static function yaRegistrada(int $jugador, string $producto, string $purchaseToken, array $ya): array
    {
        if ((int) $ya['jugador_id'] !== $jugador) {
            Db::aviso('google_otra_cuenta', 'La cuenta ' . $jugador . ' intentó usar el comprobante de Google Play de la compra N° ' . $ya['id'] . ' (cuenta ' . $ya['jugador_id'] . '). Rechazado.', (int) $ya['id']);
            Auditoria::anotar('Google Play', 'google_otra_cuenta', 'Comprobante de la compra N° ' . $ya['id'] . ' usado desde la cuenta ' . $jugador, $jugador, (int) $ya['id']);
            throw new Fallo('Esa compra de Google Play ya se usó en otra cuenta.', 409, ['codigo' => 'google_otra_cuenta']);
        }
        Fallo::si($ya['producto'] !== $producto || !hash_equals((string) $ya['google_token_hash'], hash('sha256', $purchaseToken)), 'Los datos de la compra no coinciden.', 409, ['codigo' => 'google_no_coincide']);
        if ($ya['estado'] === 'pagado') { self::avisar($ya); return ['nueva' => false, 'compra' => Compras::porId((int) $ya['id'])]; }
        throw new Fallo('Esa compra de Google Play está ' . $ya['estado'] . '.', 409, ['codigo' => 'google_' . $ya['estado']]);
    }

    /** Reintenta el aviso a Google (consume/acknowledge) de las compras que todavía no lo tienen (Google devuelve el dinero a los 3 días). */
    public static function avisosPendientes(): int
    {
        if (!self::configurado()) return 0;
        $n = 0;
        foreach (Db::todas("SELECT * FROM compras WHERE canal = 'google_play' AND estado = 'pagado' AND google_ack IS NULL AND google_token IS NOT NULL AND pagado_en > ?", [time() - 3 * 86400]) as $c) {
            self::avisar($c);
            if (Db::valor('SELECT google_ack FROM compras WHERE id = ?', [$c['id']]) !== null) $n++;
        }
        return $n;
    }

    /** Consume (si se puede volver a comprar) o reconoce (si es de una sola vez) la compra en Google. No lanza errores. */
    private static function avisar(array $compra): void
    {
        if ($compra['google_ack'] !== null || $compra['google_token'] === null) return;
        try {
            $p = Catalogo::productoGoogle((string) $compra['producto']);
            $accion = $p && $p['una_vez'] ? ':acknowledge' : ':consume';
            [$c, $j] = self::api('POST', self::urlProducto((string) $compra['producto'], (string) $compra['google_token'], $accion), $accion === ':acknowledge' ? ['developerPayload' => 'EV-' . $compra['id']] : null);
            // 2xx = listo. 400/409 "already consumed/acknowledged" (la app también puede avisar): ya está avisado.
            $ya = in_array($c, [400, 409], true) && preg_match('/already|consumed|acknowledged/i', (string) json_encode($j));
            if (($c >= 200 && $c < 300) || $ya) Db::q('UPDATE compras SET google_ack = ? WHERE id = ? AND google_ack IS NULL', [time(), $compra['id']]);
            else error_log('EN VIVO Google: ' . $accion . ' de la compra ' . $compra['id'] . ' respondió ' . $c);
        } catch (\Throwable $e) {
            error_log('EN VIVO Google: no se pudo avisar la compra ' . $compra['id']);
        }
    }

    /**
     * Revisa las compras anuladas (reembolsos y contracargos) desde la última revisión y las revierte.
     * voidedReason 7 = contracargo; los demás = reembolso. Devuelve [revisadas, revertidas].
     */
    public static function revisarAnuladas(): array
    {
        if (!self::configurado()) throw new \RuntimeException('Google Play no está configurado (GOOGLE_PACKAGE_NAME y GOOGLE_SERVICE_ACCOUNT_JSON).');
        $min = (time() - 30 * 86400 + 300) * 1000;   // Google no acepta más de 30 días atrás: 5 minutos de margen
        $guardado = Ajustes::get('google_anulados_desde');
        $desde = max($min, $guardado === '' ? $min : (int) $guardado - 3600 * 1000);   // 1 hora de solape (revertir es idempotente)
        $hasta = $desde; $revisadas = 0; $revertidas = 0; $pag = null;
        do {
            $q = ['startTime' => $desde, 'type' => 0, 'maxResults' => 1000] + ($pag ? ['token' => $pag] : []);
            [$c, $j] = self::api('GET', self::base() . 'androidpublisher/v3/applications/' . self::paquete() . '/purchases/voidedpurchases?' . http_build_query($q));
            if ($c !== 200 || !is_array($j)) throw new \RuntimeException('Google respondió ' . $c . ' a voidedpurchases');
            foreach ((array) ($j['voidedPurchases'] ?? []) as $v) {
                $revisadas++;
                $hasta = max($hasta, (int) ($v['voidedTimeMillis'] ?? 0));
                $compra = self::existente((string) ($v['purchaseToken'] ?? ''), (string) ($v['orderId'] ?? ''));
                if (!$compra) {
                    $o = (string) ($v['orderId'] ?? '?');
                    if (!Db::valor("SELECT 1 FROM avisos WHERE tipo = 'google_anulada_sin_compra' AND detalle LIKE ?", ['%' . $o . '%'])) {
                        Db::aviso('google_anulada_sin_compra', 'Google anuló la orden ' . $o . ' (motivo ' . ($v['voidedReason'] ?? '?') . ') que no está en el juego.');
                    }
                    continue;
                }
                $tipo = (int) ($v['voidedReason'] ?? 0) === 7 ? 'contracargo' : 'reembolso';
                if (Compras::revertir((int) $compra['id'], $tipo, 'Google Play anuló la compra (motivo ' . ($v['voidedReason'] ?? '?') . ')', 'Google Play')) $revertidas++;
            }
            $pag = $j['tokenPagination']['nextPageToken'] ?? null;
        } while ($pag);
        Ajustes::set('google_anulados_desde', (string) max($hasta, (int) Ajustes::get('google_anulados_desde', '0')));
        return [$revisadas, $revertidas];
    }
}
