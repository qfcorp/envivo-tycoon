<?php
declare(strict_types=1);

/**
 * SOLO PRUEBAS. «Apple falso» para las compras del App Store de la app de iPhone (src/Apple.php; copiado del Panel Tukán,
 * tukan-central tests/apple_falso.php): crea con OpenSSL una CA raíz falsa,
 * una intermedia (con la marca OID 1.2.840.113635.100.6.2.1) y una hoja P-256 (OID 1.2.840.113635.100.6.11.1), y firma
 * JWS ES256 con x5c como los de StoreKit 2 y las App Store Server Notifications V2.
 *
 * La raíz falsa se inyecta con APPLE_ROOT_CA en la configuración de la prueba (nunca en el servidor del juego).
 * En PHP:   $a = new AppleFalso($carpeta); APPLE_ROOT_CA=$a->raiz; $jws = $a->transaccion(['productId' => 'envivo.creditos_250']);
 * En bash:  php server/tests/apple_falso.php CARPETA raiz                       → ruta de la raíz (la crea si no existe)
 *           php server/tests/apple_falso.php CARPETA transaccion '{"productId":"envivo.inicio","type":"Non-Consumable"}'  → JWS
 *           php server/tests/apple_falso.php CARPETA aviso REFUND '' '{...campos de la transacción...}'  → cuerpo {signedPayload}
 */
final class AppleFalso
{
    public string $raiz;          // archivo DER de la raíz (lo que va en APPLE_ROOT_CA)
    private array $pem = [];
    private \OpenSSLAsymmetricKey $llaveHoja;
    private static int $serie = 100;

    public function __construct(private string $dir, bool $sinMarcas = false)
    {
        @mkdir($dir, 0700, true);
        $this->raiz = "$dir/raiz.cer";
        if (is_file("$dir/hoja.key")) {
            foreach (['raiz', 'inter', 'hoja'] as $n) $this->pem[$n] = (string) file_get_contents("$dir/$n.pem");
            $this->llaveHoja = openssl_pkey_get_private((string) file_get_contents("$dir/hoja.key"));
            return;
        }
        $cnf = "$dir/openssl.cnf";
        file_put_contents($cnf, "[ req ]\ndistinguished_name = dn\n[ dn ]\n"
            . "[ v3_ca ]\nbasicConstraints = critical,CA:TRUE\nkeyUsage = critical,keyCertSign,cRLSign\n"
            . "[ v3_int ]\nbasicConstraints = critical,CA:TRUE,pathlen:0\nkeyUsage = critical,keyCertSign,cRLSign\n" . ($sinMarcas ? '' : "1.2.840.113635.100.6.2.1 = ASN1:NULL\n")
            . "[ v3_hoja ]\nbasicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature\n" . ($sinMarcas ? '' : "1.2.840.113635.100.6.11.1 = ASN1:NULL\n"));
        $ec = fn(string $curva) => openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => $curva]);
        $op = fn(string $ext) => ['config' => $cnf, 'digest_alg' => 'sha256', 'x509_extensions' => $ext];
        $kr = $ec('secp384r1');   // como la Apple Root CA - G3 (P-384)
        $ki = $ec('secp384r1');
        $kh = $ec('prime256v1');  // la hoja firma ES256
        $cr = openssl_csr_sign(openssl_csr_new(['CN' => 'Raiz Falsa de Pruebas - G3', 'O' => 'Pruebas EnVivo'], $kr, ['config' => $cnf]), null, $kr, 3650, $op('v3_ca'), self::$serie++);
        $ci = openssl_csr_sign(openssl_csr_new(['CN' => 'Intermedia Falsa', 'O' => 'Pruebas EnVivo'], $ki, ['config' => $cnf]), $cr, $kr, 3650, $op('v3_int'), self::$serie++);
        $ch = openssl_csr_sign(openssl_csr_new(['CN' => 'Hoja Falsa StoreKit', 'O' => 'Pruebas EnVivo'], $kh, ['config' => $cnf]), $ci, $ki, 3650, $op('v3_hoja'), self::$serie++);
        foreach (['raiz' => $cr, 'inter' => $ci, 'hoja' => $ch] as $n => $c) {
            openssl_x509_export($c, $this->pem[$n]);
            file_put_contents("$dir/$n.pem", $this->pem[$n]);
        }
        openssl_pkey_export($kh, $kpem);
        file_put_contents("$dir/hoja.key", $kpem);
        file_put_contents($this->raiz, self::der($this->pem['raiz']));
        $this->llaveHoja = $kh;
    }

    public static function der(string $pem): string
    {
        return base64_decode(preg_replace('/-----[^-]+-----|\s+/', '', $pem));
    }

    private static function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    /** DER (de openssl_sign) → R||S de 64 bytes (formato JWS). */
    public static function derARaw(string $der): string
    {
        $i = 2;
        if (ord($der[1]) & 0x80) $i += ord($der[1]) & 0x7f;
        $out = '';
        for ($k = 0; $k < 2; $k++) {
            $len = ord($der[$i + 1]);
            $n = ltrim(substr($der, $i + 2, $len), "\x00");
            $out .= str_pad($n, 32, "\x00", STR_PAD_LEFT);
            $i += 2 + $len;
        }
        return $out;
    }

    /** Firma un JWS ES256 con x5c = [hoja, intermedia, raíz]. */
    public function firmar(array $datos, array $cab = []): string
    {
        $x5c = array_map(fn($n) => base64_encode(self::der($this->pem[$n])), ['hoja', 'inter', 'raiz']);
        $h = self::b64(json_encode($cab + ['alg' => 'ES256', 'x5c' => $x5c]));
        $p = self::b64(json_encode($datos, JSON_UNESCAPED_SLASHES));
        openssl_sign("$h.$p", $firma, $this->llaveHoja, OPENSSL_ALGO_SHA256);
        return "$h.$p." . self::b64(self::derARaw($firma));
    }

    /** Transacción de StoreKit 2 (JWSTransactionDecodedPayload) con valores por defecto de una compra nueva (consumible). */
    public function datosTransaccion(array $c = []): array
    {
        $ahora = (int) ($c['_ahora'] ?? time());
        unset($c['_ahora']);
        $prod = (string) ($c['productId'] ?? 'envivo.creditos_250');
        $id = (string) ($c['transactionId'] ?? (string) random_int(2000000000000, 2999999999999));
        $d = ['transactionId' => $id, 'originalTransactionId' => $id, 'bundleId' => 'com.tukanec.envivo', 'productId' => $prod,
              'purchaseDate' => $ahora * 1000, 'originalPurchaseDate' => $ahora * 1000, 'quantity' => 1,
              'type' => 'Consumable', 'inAppOwnershipType' => 'PURCHASED',
              'signedDate' => $ahora * 1000, 'environment' => 'Production', 'transactionReason' => 'PURCHASE', 'storefront' => 'ECU',
              'price' => 1990, 'currency' => 'USD'];
        foreach ($c as $k => $v) {
            if ($v === null) unset($d[$k]); else $d[$k] = $v;
        }
        return $d;
    }

    public function transaccion(array $c = []): string
    {
        return $this->firmar($this->datosTransaccion($c));
    }

    /** Cuerpo JSON de una App Store Server Notification V2. */
    public function aviso(string $tipo, string $subtipo = '', ?array $tx = null, ?array $ren = null, array $data = []): string
    {
        $env = (string) ($tx['environment'] ?? 'Production');
        $n = ['notificationType' => $tipo, 'notificationUUID' => sprintf('%04x%04x-%04x-4%03x-a%03x-%012x', random_int(0, 65535), random_int(0, 65535), random_int(0, 65535), random_int(0, 4095), random_int(0, 4095), random_int(0, 2 ** 40)),
              'version' => '2.0', 'signedDate' => time() * 1000,
              'data' => $data + ['bundleId' => 'com.tukanec.envivo', 'environment' => $env, 'appAppleId' => 6700000000, 'bundleVersion' => '1']];
        if ($subtipo !== '') $n['subtype'] = $subtipo;
        if ($tx) $n['data']['signedTransactionInfo'] = $this->firmar($tx);
        if ($ren) $n['data']['signedRenewalInfo'] = $this->firmar($ren + ['signedDate' => time() * 1000, 'environment' => $env]);
        return json_encode(['signedPayload' => $this->firmar($n)]);
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $a = new AppleFalso($argv[1] ?? sys_get_temp_dir() . '/apple_falso');
    $j = fn(int $i) => isset($argv[$i]) && $argv[$i] !== '' ? (json_decode($argv[$i], true) ?? []) : null;
    echo match ($argv[2] ?? 'raiz') {
        'raiz' => $a->raiz,
        'transaccion' => $a->transaccion($j(3) ?? []),
        'datos' => json_encode($a->datosTransaccion($j(3) ?? [])),
        'aviso' => $a->aviso($argv[3], $argv[4] ?? '', $j(5) === null ? null : $a->datosTransaccion($j(5)), $j(6)),
        default => '',
    };
}
