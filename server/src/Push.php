<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Notificaciones Web Push (server/INTEGRAR_PUSH.md). PHP puro con openssl, sin composer:
 *  - Cifrado del mensaje RFC 8291 (aes128gcm, RFC 8188) y firma VAPID RFC 8292 (JWT ES256).
 *  - Suscripciones por cuenta y por aparato (push_suscripciones), con un interruptor por categoría.
 *  - Cola (push_cola) que vacía bin/push_enviar.php cada minuto con las reglas:
 *      máximo PUSH_MAX_DIA (3) por jugador al día · ofertas: 1 al día y nunca el último cupo · silencio 22:00–08:00
 *      (America/Guayaquil: se pospone, no se pierde) · nunca el mismo texto dos veces seguidas en un aparato ·
 *      recordatorio de inactividad solo desde 3 días sin jugar · nada después de 30 días sin jugar ·
 *      suscripciones muertas (404/410) se borran.
 *  - Detectores (corren antes de vaciar la cola, cada uno solo si su tabla existe): obra de la sede terminada,
 *    cambio de fase de la Copa, resultado de un duelo (al defensor), respuesta de soporte en el buzón, premio diario
 *    de la tarjeta mensual listo, recordatorio a los 3/7/14/28 días sin jugar.
 *  - Para cualquier otro módulo: Push::encolar($jugador, $categoria, $titulo, $cuerpo, $url) (nunca lanza).
 * Llaves VAPID: php server/bin/push_claves.php (PUSH_VAPID_PUBLICA / PUSH_VAPID_PRIVADA / PUSH_VAPID_SUJETO).
 */
final class Push
{
    /** Categorías que el jugador ve en Ajustes (valor = encendida por defecto). */
    public const CATEGORIAS = ['obra' => true, 'copa' => true, 'premio' => true, 'buzon' => true, 'duelo' => true, 'ofertas' => false];
    /** Categorías internas que obedecen al interruptor de otra (null = ninguno: prueba del Centro de Control). */
    public const ALIAS = ['recordatorio' => 'premio', 'liga' => 'duelo', 'prueba' => null];
    public const PRIORIDAD = ['prueba' => 9, 'buzon' => 3, 'obra' => 3, 'duelo' => 2, 'liga' => 2, 'copa' => 2, 'premio' => 1, 'recordatorio' => 1, 'ofertas' => 0];
    /** Cuánto guarda el servicio de push el aviso si el aparato está apagado (segundos). */
    public const TTL = ['prueba' => 600, 'buzon' => 86400, 'obra' => 43200, 'duelo' => 43200, 'liga' => 43200, 'copa' => 21600, 'premio' => 43200, 'recordatorio' => 86400, 'ofertas' => 86400];
    /** Servicios de push permitidos (https). Más con PUSH_HOSTS_EXTRA (lista con comas; solo para pruebas). */
    public const HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', '*.push.services.mozilla.com',
        '*.notify.windows.com', 'web.push.apple.com', '*.push.apple.com'];
    public const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
    public const MAX_SUSCRIPCIONES = 10;
    public const INACTIVO_RECORDAR = 3;
    public const INACTIVO_PARAR = 30;
    public const RECORDAR_DIAS = [3, 7, 14, 28];
    public const SILENCIO_DESDE = 22;
    public const SILENCIO_HASTA = 8;
    public const MAX_INTENTOS = 5;
    public const RS = 4096;

    private static ?int $reloj = null;
    /** @var null|callable(string $url, array $cabeceras, string $cuerpo): array{http:int, cuerpo:string} */
    private static $transporte = null;
    private static array $jwt = [];

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }
    /** Solo pruebas: cambia el envío HTTP (curl) por una función. */
    public static function fijarTransporte(?callable $f): void { self::$transporte = $f; }

    // =================================================================== base64url y llaves P-256
    public static function b64u(string $b): string { return rtrim(strtr(base64_encode($b), '+/', '-_'), '='); }

    public static function b64ud(string $s): string
    {
        if (!preg_match('/^[A-Za-z0-9_\-]*={0,2}$/', $s)) return '';
        $s = rtrim($s, '=');
        $r = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
        return $r === false ? '' : $r;
    }

    /** PEM de una llave pública P-256 a partir del punto sin comprimir (65 bytes, 0x04 || X || Y). */
    public static function pemPublica(string $punto): string
    {
        if (strlen($punto) !== 65 || $punto[0] !== "\x04") throw new \InvalidArgumentException('Llave pública P-256 no válida.');
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $punto;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /** PEM (SEC1) de una llave privada P-256: d (32 bytes) y su punto público (65 bytes). */
    public static function pemPrivada(string $d, string $punto): string
    {
        if (strlen($d) !== 32 || strlen($punto) !== 65) throw new \InvalidArgumentException('Llave privada P-256 no válida.');
        $der = hex2bin('30770201010420') . $d . hex2bin('a00a06082a8648ce3d030107a144034200') . $punto;
        return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
    }

    /** Par nuevo P-256: ['d' => 32 bytes, 'publica' => 65 bytes]. */
    public static function generarPar(): array
    {
        $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if ($k === false) throw new \RuntimeException('openssl no pudo crear la llave P-256.');
        $e = openssl_pkey_get_details($k)['ec'];
        $p = fn(string $b) => str_pad($b, 32, "\0", STR_PAD_LEFT);
        return ['d' => $p($e['d']), 'publica' => "\x04" . $p($e['x']) . $p($e['y'])];
    }

    private static function ecdh(string $privD, string $privPub, string $peerPub): string
    {
        $s = openssl_pkey_derive(self::pemPublica($peerPub), self::pemPrivada($privD, $privPub), 32);
        if ($s === false || strlen($s) !== 32) throw new \RuntimeException('ECDH falló.');
        return $s;
    }

    // =================================================================== RFC 8291 (aes128gcm)
    /** Llaves de contenido (CEK, NONCE) de RFC 8291 §3.4 + RFC 8188 §2.2. */
    public static function derivar(string $ecdh, string $auth, string $uaPub, string $asPub, string $salt): array
    {
        $prkKey = hash_hmac('sha256', $ecdh, $auth, true);
        $ikm = hash_hmac('sha256', "WebPush: info\0" . $uaPub . $asPub . "\x01", $prkKey, true);
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        return [
            'prk_key' => $prkKey, 'ikm' => $ikm, 'prk' => $prk,
            'cek' => substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16),
            'nonce' => substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12),
        ];
    }

    /**
     * Cifra $texto para un aparato (p256dh y auth en base64url, como los da PushSubscription.toJSON()).
     * $as (pruebas) = ['d' => ..., 'publica' => ...] fijo y $salt fijo; si no, se generan al azar en cada envío.
     */
    public static function cifrar(string $texto, string $p256dh, string $auth, ?array $as = null, ?string $salt = null, int $relleno = 0): string
    {
        $ua = self::b64ud($p256dh);
        $au = self::b64ud($auth);
        if (strlen($ua) !== 65 || $ua[0] !== "\x04") throw new \InvalidArgumentException('p256dh no válido.');
        if (strlen($au) !== 16) throw new \InvalidArgumentException('auth no válido.');
        if (strlen($texto) + $relleno + 17 > self::RS) throw new \InvalidArgumentException('Mensaje demasiado largo.');
        $as ??= self::generarPar();
        $salt ??= random_bytes(16);
        $k = self::derivar(self::ecdh($as['d'], $as['publica'], $ua), $au, $ua, $as['publica'], $salt);
        $tag = '';
        $ct = openssl_encrypt($texto . "\x02" . str_repeat("\0", $relleno), 'aes-128-gcm', $k['cek'], OPENSSL_RAW_DATA, $k['nonce'], $tag, '', 16);
        if ($ct === false) throw new \RuntimeException('AES-GCM falló.');
        return $salt . pack('N', self::RS) . chr(65) . $as['publica'] . $ct . $tag;
    }

    /** Descifra un cuerpo aes128gcm de un solo registro (lo usan las pruebas y el servicio de push falso). */
    public static function descifrar(string $cuerpo, string $uaD, string $uaPub, string $auth): ?string
    {
        if (strlen($cuerpo) < 21 + 65 + 16) return null;
        $salt = substr($cuerpo, 0, 16);
        $idlen = ord($cuerpo[20]);
        $asPub = substr($cuerpo, 21, $idlen);
        $ct = substr($cuerpo, 21 + $idlen);
        try {
            $k = self::derivar(self::ecdh($uaD, $uaPub, $asPub), $auth, $uaPub, $asPub, $salt);
        } catch (\Throwable) {
            return null;
        }
        $p = openssl_decrypt(substr($ct, 0, -16), 'aes-128-gcm', $k['cek'], OPENSSL_RAW_DATA, $k['nonce'], substr($ct, -16));
        if ($p === false) return null;
        $p = rtrim($p, "\0");
        return str_ends_with($p, "\x02") ? substr($p, 0, -1) : null;
    }

    // =================================================================== VAPID (RFC 8292, JWT ES256)
    /** Firma DER de openssl -> r||s (64 bytes) que pide JWS. */
    public static function derARaw(string $der): string
    {
        $i = 2;
        if (ord($der[1]) & 0x80) $i += ord($der[1]) & 0x7f;
        $leer = function () use ($der, &$i): string {
            if (ord($der[$i]) !== 0x02) throw new \RuntimeException('Firma DER no válida.');
            $n = ord($der[$i + 1]);
            $v = substr($der, $i + 2, $n);
            $i += 2 + $n;
            return str_pad(ltrim($v, "\0"), 32, "\0", STR_PAD_LEFT);
        };
        return $leer() . $leer();
    }

    /** r||s -> DER (para verificar con openssl_verify). */
    public static function rawADer(string $raw): string
    {
        $int = function (string $v): string {
            $v = ltrim($v, "\0");
            if ($v === '' || (ord($v[0]) & 0x80)) $v = "\0" . $v;
            return "\x02" . chr(strlen($v)) . $v;
        };
        $s = $int(substr($raw, 0, 32)) . $int(substr($raw, 32, 32));
        return "\x30" . chr(strlen($s)) . $s;
    }

    public static function jwt(string $aud, int $exp, string $sujeto, string $d, string $publica): string
    {
        $h = self::b64u('{"typ":"JWT","alg":"ES256"}');
        $c = self::b64u((string) json_encode(['aud' => $aud, 'exp' => $exp, 'sub' => $sujeto], JSON_UNESCAPED_SLASHES));
        if (!openssl_sign($h . '.' . $c, $der, self::pemPrivada($d, $publica), OPENSSL_ALGO_SHA256)) throw new \RuntimeException('No se pudo firmar el JWT.');
        return $h . '.' . $c . '.' . self::b64u(self::derARaw($der));
    }

    /** Llaves del config, o null si faltan o no cuadran. */
    public static function claves(): ?array
    {
        $pub = self::b64ud(Config::get('PUSH_VAPID_PUBLICA'));
        $d = self::b64ud(Config::get('PUSH_VAPID_PRIVADA'));
        if (strlen($pub) !== 65 || strlen($d) !== 32 || $pub[0] !== "\x04") return null;
        $suj = Config::get('PUSH_VAPID_SUJETO', 'mailto:soporte@tukanec.com');
        return ['publica' => $pub, 'd' => $d, 'sujeto' => $suj, 'publica_b64' => self::b64u($pub)];
    }

    public static function disponible(): bool { return self::claves() !== null; }

    /** "https://fcm.googleapis.com" de un endpoint (la audiencia del JWT). */
    public static function origen(string $endpoint): string
    {
        $p = parse_url($endpoint);
        return strtolower((string) ($p['scheme'] ?? '')) . '://' . strtolower((string) ($p['host'] ?? '')) . (isset($p['port']) ? ':' . $p['port'] : '');
    }

    public static function autorizacion(string $endpoint, ?array $claves = null): string
    {
        $c = $claves ?? self::claves();
        if ($c === null) throw new \RuntimeException('Faltan las llaves VAPID.');
        $aud = self::origen($endpoint);
        $t = self::ahora();
        $k = $aud . '|' . $c['publica_b64'];
        if (!isset(self::$jwt[$k]) || self::$jwt[$k][1] < $t + 3600 || self::$jwt[$k][1] > $t + 12 * 3600) self::$jwt[$k] = [self::jwt($aud, $t + 12 * 3600, $c['sujeto'], $c['d'], $c['publica']), $t + 12 * 3600];
        return 'vapid t=' . self::$jwt[$k][0] . ', k=' . $c['publica_b64'];
    }

    /** ¿El endpoint es de un servicio de push conocido? (evita que el servidor llame a cualquier dirección: SSRF) */
    public static function endpointValido(string $e): bool
    {
        if (strlen($e) > 1000 || !preg_match('#^https?://[^\s/?\#]+(/[^\s]*)?$#', $e)) return false;
        $p = parse_url($e);
        if (!$p || empty($p['host'])) return false;
        $host = strtolower((string) $p['host']);
        $hp = $host . (isset($p['port']) ? ':' . $p['port'] : '');
        $extra = array_filter(array_map('trim', explode(',', Config::get('PUSH_HOSTS_EXTRA'))));
        foreach ($extra as $x) if (strtolower($x) === $hp || strtolower($x) === $host) return true;   // pruebas (puede ser http)
        if (($p['scheme'] ?? '') !== 'https' || isset($p['user']) || (isset($p['port']) && (int) $p['port'] !== 443)) return false;
        foreach (self::HOSTS as $h) {
            if ($h === $host) return true;
            if (str_starts_with($h, '*.') && str_ends_with($host, substr($h, 1))) return true;
        }
        return false;
    }

    // =================================================================== horario y reglas
    private static function zona(): \DateTimeZone { return new \DateTimeZone(Config::zona()); }
    public static function dia(?int $t = null): string { return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(self::zona())->format('Y-m-d'); }
    public static function hora(?int $t = null): int { return (int) (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(self::zona())->format('G'); }

    public static function enSilencio(?int $t = null): bool
    {
        $h = self::hora($t);
        return $h >= self::SILENCIO_DESDE || $h < self::SILENCIO_HASTA;
    }

    /** Próximas 08:00 de Guayaquil después de $t (hoy si aún no son las 8, si no mañana). */
    public static function proximaManana(?int $t = null): int
    {
        $t ??= self::ahora();
        $d = (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona())->setTime(self::SILENCIO_HASTA, 0);
        if ($d->getTimestamp() <= $t) $d = $d->modify('+1 day');
        return $d->getTimestamp();
    }

    public static function maxDia(): int { return max(1, min(5, (int) Config::get('PUSH_MAX_DIA', '3'))); }

    /** Última señal de vida del jugador: entrada, partida guardada o juego abierto en un aparato suscrito. */
    public static function ultimaActividad(int $j): int
    {
        $f = Db::fila('SELECT creado, ultimo_ingreso FROM jugadores WHERE id = ?', [$j]);
        if (!$f) return 0;
        $p = (int) Db::valor('SELECT COALESCE(MAX(actualizado), 0) FROM partidas WHERE jugador_id = ?', [$j]);
        $s = (int) Db::valor('SELECT COALESCE(MAX(visto), 0) FROM push_suscripciones WHERE jugador_id = ?', [$j]);
        return max((int) $f['creado'], (int) ($f['ultimo_ingreso'] ?? 0), $p, $s);
    }

    private static function contador(int $j): array
    {
        $hoy = self::dia();
        $f = Db::fila('SELECT * FROM push_jugador WHERE jugador_id = ?', [$j]);
        if (!$f || $f['dia'] !== $hoy) return ['dia' => $hoy, 'enviados_dia' => 0, 'ofertas_dia' => 0];
        return ['dia' => $hoy, 'enviados_dia' => (int) $f['enviados_dia'], 'ofertas_dia' => (int) $f['ofertas_dia']];
    }

    private static function contar(int $j, string $cat): void
    {
        $c = self::contador($j);
        Db::q('INSERT INTO push_jugador (jugador_id, dia, enviados_dia, ofertas_dia, ultimo_envio) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (jugador_id) DO UPDATE SET dia = excluded.dia, enviados_dia = excluded.enviados_dia, ofertas_dia = excluded.ofertas_dia, ultimo_envio = excluded.ultimo_envio',
            [$j, $c['dia'], $c['enviados_dia'] + 1, $c['ofertas_dia'] + ($cat === 'ofertas' ? 1 : 0), self::ahora()]);
    }

    /** Interruptor que manda sobre una categoría ('recordatorio' -> 'premio'), o null si no tiene (prueba). */
    public static function interruptor(string $cat): ?string { return array_key_exists($cat, self::ALIAS) ? self::ALIAS[$cat] : $cat; }

    public static function categoriaValida(string $cat): bool { return isset(self::CATEGORIAS[$cat]) || array_key_exists($cat, self::ALIAS); }

    // =================================================================== encolar (para cualquier módulo)
    /**
     * Encola un aviso con texto propio. NUNCA lanza (un aviso nunca rompe la jugada que lo provoca). Devuelve el id o null
     * (repetido, jugador sin aparatos suscritos o datos malos). $op: clave (evita duplicados; por defecto texto+día),
     * enviar_desde (unix), vence (unix; por defecto 24 h, buzón 48 h), forzar (bool, solo Centro de Control).
     */
    public static function encolar(int $jugador, string $categoria, string $titulo, string $cuerpo, string $url = '/', array $op = []): ?int
    {
        $op['titulo'] = mb_substr(trim($titulo), 0, 80);
        $op['cuerpo'] = mb_substr(trim($cuerpo), 0, 200);
        if ($op['titulo'] === '' && $op['cuerpo'] === '') return null;
        $op['clave'] ??= 'libre:' . substr(hash('sha256', $categoria . '|' . $op['titulo'] . '|' . $op['cuerpo'] . '|' . self::dia()), 0, 24);
        return self::meter($jugador, $categoria, $url, $op);
    }

    /** Encola con textos de PushTextos (se eligen al enviar, en el idioma de cada aparato y sin repetir el último). */
    public static function encolarPlantilla(int $jugador, string $categoria, string $plantilla, array $vars, string $url, string $clave, array $op = []): ?int
    {
        if (!PushTextos::existe($plantilla)) return null;
        $op['plantilla'] = $plantilla;
        $op['vars'] = $vars;
        $op['clave'] = $clave;
        return self::meter($jugador, $categoria, $url, $op);
    }

    private static function meter(int $jugador, string $categoria, string $url, array $op): ?int
    {
        try {
            if (!self::categoriaValida($categoria) || $jugador <= 0) return null;
            if (empty($op['forzar']) && !Db::valor('SELECT 1 FROM push_suscripciones WHERE jugador_id = ? LIMIT 1', [$jugador])) return null;
            $t = self::ahora();
            $desde = max($t, (int) ($op['enviar_desde'] ?? $t));
            $vence = (int) ($op['vence'] ?? ($desde + ($categoria === 'buzon' ? 48 : 24) * 3600));
            $n = Db::q('INSERT OR IGNORE INTO push_cola (jugador_id, categoria, clave, plantilla, vars_json, titulo, cuerpo, url, prioridad, forzar, creado, enviar_desde, vence)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$jugador, $categoria, mb_substr((string) $op['clave'], 0, 120), $op['plantilla'] ?? null,
                 isset($op['vars']) ? json_encode($op['vars'], JSON_UNESCAPED_UNICODE) : null, $op['titulo'] ?? null, $op['cuerpo'] ?? null,
                 self::urlSegura($url), self::PRIORIDAD[$categoria] ?? 1, empty($op['forzar']) ? 0 : 1, $t, $desde, $vence])->rowCount();
            return $n ? Db::ultimoId() : null;
        } catch (\Throwable $e) {
            error_log('EN VIVO push encolar: ' . mb_substr($e->getMessage(), 0, 300));
            return null;
        }
    }

    /** Solo rutas del propio juego ("/", "/?ir=sede"...). */
    public static function urlSegura(string $u): string
    {
        $u = trim($u);
        return preg_match('#^/(?!/)[A-Za-z0-9_\-./?=&%\#]*$#', $u) && strlen($u) <= 200 ? $u : '/';
    }

    // =================================================================== suscripciones (API del juego)
    public static function normalizarIdioma(mixed $i): string
    {
        $i = is_string($i) ? trim($i) : '';
        foreach (self::IDIOMAS as $x) if (strcasecmp($x, $i) === 0) return $x;
        $base = strtolower(explode('-', $i)[0]);
        foreach (self::IDIOMAS as $x) if (strtolower(explode('-', $x)[0]) === $base) return $x;
        return 'es';
    }

    /** Mezcla {cat: bool} sobre $base; las claves desconocidas se ignoran. */
    public static function normalizarCategorias(mixed $in, ?array $base = null): array
    {
        $o = $base ?? self::CATEGORIAS;
        if (is_array($in)) foreach (self::CATEGORIAS as $k => $_) if (array_key_exists($k, $in)) $o[$k] = (bool) $in[$k];
        return $o;
    }

    private static function sub(int $j, string $endpoint): ?array
    {
        return $endpoint === '' ? null : Db::fila('SELECT * FROM push_suscripciones WHERE jugador_id = ? AND endpoint = ?', [$j, $endpoint]);
    }

    public static function estado(int $j, string $endpoint = ''): array
    {
        $c = self::claves();
        $s = self::sub($j, $endpoint);
        if ($s) Db::q('UPDATE push_suscripciones SET visto = ? WHERE id = ?', [self::ahora(), $s['id']]);
        return ['ok' => true, 'disponible' => $c !== null, 'publica' => $c['publica_b64'] ?? null, 'max_dia' => self::maxDia(),
            'categorias_defecto' => self::CATEGORIAS, 'suscrito' => (bool) $s,
            'categorias' => $s ? self::normalizarCategorias(json_decode((string) $s['categorias_json'], true) ?: []) : self::CATEGORIAS,
            'aparatos' => (int) Db::valor('SELECT COUNT(*) FROM push_suscripciones WHERE jugador_id = ?', [$j])];
    }

    public static function suscribir(int $j, array $in): array
    {
        Fallo::si(!self::disponible(), 'Las notificaciones aún no están activas en el servidor.', 503, ['codigo' => 'push_no_configurado']);
        $sub = is_array($in['suscripcion'] ?? null) ? $in['suscripcion'] : [];
        $e = is_string($sub['endpoint'] ?? null) ? trim($sub['endpoint']) : '';
        Fallo::si(!self::endpointValido($e), 'Ese servicio de notificaciones no es válido.', 400, ['codigo' => 'push_endpoint_invalido']);
        $p = is_string($sub['keys']['p256dh'] ?? null) ? $sub['keys']['p256dh'] : '';
        $a = is_string($sub['keys']['auth'] ?? null) ? $sub['keys']['auth'] : '';
        $pb = self::b64ud($p);
        Fallo::si(strlen($pb) !== 65 || $pb[0] !== "\x04" || strlen(self::b64ud($a)) !== 16, 'Las llaves de la suscripción no son válidas.', 400, ['codigo' => 'push_llaves_invalidas']);
        try { openssl_pkey_get_public(self::pemPublica($pb)) ?: throw new \RuntimeException(); } catch (\Throwable) {
            throw new Fallo('Las llaves de la suscripción no son válidas.', 400, ['codigo' => 'push_llaves_invalidas']);
        }
        $disp = is_string($in['dispositivo'] ?? null) && preg_match('/^[A-Za-z0-9_\-]{8,64}$/', $in['dispositivo']) ? $in['dispositivo'] : null;
        $t = self::ahora();
        // El navegador cambió la suscripción (pushsubscriptionchange): la nueva hereda idioma, aparato e interruptores.
        $ant = is_string($in['anterior'] ?? null) ? $in['anterior'] : '';
        $previa = $ant !== '' && $ant !== $e ? self::sub($j, $ant) : null;
        $disp ??= $previa['dispositivo'] ?? null;
        $idioma = self::normalizarIdioma($in['idioma'] ?? ($previa['idioma'] ?? null));
        Db::tx(function () use ($j, $e, $p, $a, $disp, $idioma, $in, $t, $ant, $previa): void {
            if ($ant !== '' && $ant !== $e) Db::q('DELETE FROM push_suscripciones WHERE jugador_id = ? AND endpoint = ?', [$j, $ant]);
            if ($disp !== null) Db::q('DELETE FROM push_suscripciones WHERE jugador_id = ? AND dispositivo = ? AND endpoint <> ?', [$j, $disp, $e]);
            $ya = Db::fila('SELECT * FROM push_suscripciones WHERE endpoint = ?', [$e]);
            $base = $ya && (int) $ya['jugador_id'] === $j ? (json_decode((string) $ya['categorias_json'], true) ?: null)
                : ($previa ? (json_decode((string) $previa['categorias_json'], true) ?: null) : null);
            $cats = json_encode(self::normalizarCategorias($in['categorias'] ?? null, $base !== null ? self::normalizarCategorias($base) : null));
            if ($ya) {
                // El mismo aparato con otra cuenta: pasa a la cuenta que está jugando ahora.
                Db::q('UPDATE push_suscripciones SET jugador_id = ?, p256dh = ?, auth = ?, dispositivo = ?, idioma = ?, categorias_json = ?, navegador = ?, fallos = 0, actualizado = ?, visto = ?'
                    . ((int) $ya['jugador_id'] !== $j ? ', ultimo_texto = NULL' : '') . ' WHERE id = ?',
                    [$j, $p, $a, $disp, $idioma, $cats, Http::navegador(), $t, $t, $ya['id']]);
            } else {
                Db::q('INSERT INTO push_suscripciones (jugador_id, endpoint, p256dh, auth, dispositivo, idioma, categorias_json, navegador, creado, actualizado, visto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$j, $e, $p, $a, $disp, $idioma, $cats, Http::navegador(), $t, $t, $t]);
            }
            $sobran = Db::todas('SELECT id FROM push_suscripciones WHERE jugador_id = ? ORDER BY visto DESC, id DESC LIMIT -1 OFFSET ?', [$j, self::MAX_SUSCRIPCIONES]);
            foreach ($sobran as $s) Db::q('DELETE FROM push_suscripciones WHERE id = ?', [$s['id']]);
        });
        return self::estado($j, $e);
    }

    public static function preferencias(int $j, string $endpoint, mixed $categorias): array
    {
        $s = self::sub($j, $endpoint);
        Fallo::si(!$s, 'Este aparato no tiene las notificaciones activadas.', 404, ['codigo' => 'push_no_suscrito']);
        Fallo::si(!is_array($categorias), 'Faltan las categorías.', 400, ['codigo' => 'push_categoria_invalida']);
        foreach ($categorias as $k => $v) Fallo::si(!isset(self::CATEGORIAS[$k]) || !is_bool($v), 'Categoría no válida.', 400, ['codigo' => 'push_categoria_invalida']);
        $cats = self::normalizarCategorias($categorias, self::normalizarCategorias(json_decode((string) $s['categorias_json'], true) ?: []));
        Db::q('UPDATE push_suscripciones SET categorias_json = ?, actualizado = ?, visto = ? WHERE id = ?', [json_encode($cats), self::ahora(), self::ahora(), $s['id']]);
        return self::estado($j, $endpoint);
    }

    public static function baja(int $j, string $endpoint): array
    {
        Db::q('DELETE FROM push_suscripciones WHERE jugador_id = ? AND endpoint = ?', [$j, $endpoint]);
        return self::estado($j);
    }

    // =================================================================== envío
    /** Suscripciones del jugador que quieren esta categoría. */
    private static function destinos(int $j, string $cat): array
    {
        $sw = self::interruptor($cat);
        $o = [];
        foreach (Db::todas('SELECT * FROM push_suscripciones WHERE jugador_id = ? ORDER BY id', [$j]) as $s) {
            $c = self::normalizarCategorias(json_decode((string) $s['categorias_json'], true) ?: []);
            if ($sw === null || !empty($c[$sw])) $o[] = $s;
        }
        return $o;
    }

    /** [titulo, cuerpo] para un aparato. */
    private static function textosPara(array $f, array $s): array
    {
        if ($f['plantilla'] !== null && $f['plantilla'] !== '') {
            return PushTextos::elegir((string) $f['plantilla'], (string) $s['idioma'], json_decode((string) $f['vars_json'], true) ?: [], $s['ultimo_texto']);
        }
        return [(string) ($f['titulo'] ?: 'EN VIVO Tycoon'), (string) $f['cuerpo']];
    }

    /** POST cifrado a un aparato. Devuelve el código HTTP (0 = sin respuesta). */
    public static function enviarA(array $s, string $json, string $cat, ?array $claves = null): int
    {
        $cuerpo = self::cifrar($json, (string) $s['p256dh'], (string) $s['auth']);
        $cab = [
            'Authorization' => self::autorizacion((string) $s['endpoint'], $claves),
            'Content-Encoding' => 'aes128gcm',
            'Content-Type' => 'application/octet-stream',
            'TTL' => (string) (self::TTL[$cat] ?? 43200),
            'Urgency' => in_array($cat, ['buzon', 'prueba'], true) ? 'high' : 'normal',
            'Topic' => substr(preg_replace('/[^A-Za-z0-9_\-]/', '', $cat) ?: 'aviso', 0, 32),
        ];
        $f = self::$transporte;
        $r = $f !== null ? $f((string) $s['endpoint'], $cab, $cuerpo) : self::curl((string) $s['endpoint'], $cab, $cuerpo);
        return (int) ($r['http'] ?? 0);
    }

    private static function curl(string $url, array $cab, string $cuerpo): array
    {
        if (!self::endpointValido($url)) return ['http' => 410, 'cuerpo' => ''];   // ya no está permitido: se borra
        $c = curl_init($url);
        $h = [];
        foreach ($cab as $k => $v) $h[] = $k . ': ' . $v;
        curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $cuerpo, CURLOPT_HTTPHEADER => $h, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | (Config::get('PUSH_HOSTS_EXTRA') !== '' ? CURLPROTO_HTTP : 0)]);
        $out = curl_exec($c);
        $http = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
        curl_close($c);
        return ['http' => $out === false ? 0 : $http, 'cuerpo' => is_string($out) ? mb_substr($out, 0, 300) : ''];
    }

    private static function cerrar(int $id, string $estado, ?string $motivo): string
    {
        Db::q('UPDATE push_cola SET estado = ?, motivo = ?, enviado = CASE WHEN ? = \'enviado\' THEN ? ELSE enviado END WHERE id = ?', [$estado, $motivo, $estado, self::ahora(), $id]);
        return $estado === 'enviado' ? 'enviados' : ($estado === 'fallido' ? 'fallidos' : 'descartados');
    }

    private static function posponer(array $f, int $a, string $motivo): string
    {
        if ($a > (int) $f['vence']) return self::cerrar((int) $f['id'], 'descartado', $motivo === 'silencio' ? 'vencido' : $motivo);
        Db::q('UPDATE push_cola SET enviar_desde = ?, motivo = ? WHERE id = ?', [$a, $motivo, $f['id']]);
        return 'pospuestos';
    }

    /** Aplica las reglas y envía una fila de la cola. Devuelve el resultado ('enviados', 'pospuestos', ...). */
    public static function procesarUno(array $f, array &$r = []): string
    {
        $t = self::ahora();
        $j = (int) $f['jugador_id'];
        $cat = (string) $f['categoria'];
        $forzar = (int) $f['forzar'] === 1;
        $claves = self::claves();
        if ($claves === null) return 'sin_claves';
        if ((int) $f['vence'] < $t) return self::cerrar((int) $f['id'], 'descartado', 'vencido');
        $est = Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$j]);
        if ($est === null || $est === false || !in_array((string) $est, ['activo', ''], true) && !$forzar) {
            if ($est === 'borrado' || $est === null || $est === false) Db::q('DELETE FROM push_suscripciones WHERE jugador_id = ?', [$j]);
            return self::cerrar((int) $f['id'], 'descartado', 'cuenta_' . ($est ?: 'no_existe'));
        }
        if (!$forzar) {
            $inact = intdiv($t - self::ultimaActividad($j), 86400);
            if ($inact >= self::INACTIVO_PARAR) return self::cerrar((int) $f['id'], 'descartado', 'inactivo');
            if ($cat === 'recordatorio' && $inact < self::INACTIVO_RECORDAR) return self::cerrar((int) $f['id'], 'descartado', 'volvio');
            if (self::enSilencio($t)) return self::posponer($f, self::proximaManana($t) + random_int(0, 900), 'silencio');
            $c = self::contador($j);
            if ($c['enviados_dia'] >= self::maxDia()) return self::posponer($f, self::proximaManana($t) + random_int(0, 1800), 'tope');
            if ($cat === 'ofertas' && ($c['ofertas_dia'] >= 1 || $c['enviados_dia'] >= self::maxDia() - 1)) return self::posponer($f, self::proximaManana($t) + random_int(0, 1800), 'tope');
        }
        $subs = self::destinos($j, $cat);
        if (!$subs) return self::cerrar((int) $f['id'], 'descartado', 'sin_suscripcion');
        $ok = 0; $reintentar = 0; $repetidos = 0; $muertas = 0;
        foreach ($subs as $s) {
            [$titulo, $cuerpo] = self::textosPara($f, $s);
            if (!$forzar && $s['ultimo_texto'] !== null && $cuerpo === $s['ultimo_texto']) { $repetidos++; continue; }
            $json = (string) json_encode(['t' => mb_substr($titulo, 0, 80), 'b' => mb_substr($cuerpo, 0, 200), 'u' => (string) $f['url'], 'tag' => $cat, 'id' => (int) $f['id']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            try {
                $http = self::enviarA($s, $json, $cat, $claves);
            } catch (\Throwable $e) {
                error_log('EN VIVO push enviar: ' . mb_substr($e->getMessage(), 0, 200));
                $http = -1;   // llaves del aparato rotas: se trata como muerta
            }
            $bien = $http >= 200 && $http < 300;
            Db::q('INSERT INTO push_envios (cola_id, suscripcion_id, jugador_id, categoria, http, ok, creado) VALUES (?, ?, ?, ?, ?, ?, ?)', [$f['id'], $s['id'], $j, $cat, $http, $bien ? 1 : 0, $t]);
            if ($bien) {
                $ok++;
                Db::q('UPDATE push_suscripciones SET ultimo_texto = ?, ultimo_ok = ?, fallos = 0 WHERE id = ?', [$cuerpo, $t, $s['id']]);
            } elseif (in_array($http, [404, 410, -1], true) || ((int) $s['fallos'] + 1 >= 20)) {
                $muertas++;
                Db::q('DELETE FROM push_suscripciones WHERE id = ?', [$s['id']]);
            } else {
                Db::q('UPDATE push_suscripciones SET fallos = fallos + 1 WHERE id = ?', [$s['id']]);
                if ($http === 0 || $http === 429 || $http >= 500) $reintentar++;
            }
        }
        $r['muertas'] = ($r['muertas'] ?? 0) + $muertas;
        if ($ok > 0) {
            if (!$forzar) self::contar($j, $cat);
            return self::cerrar((int) $f['id'], 'enviado', $ok . '/' . count($subs));
        }
        if ($reintentar > 0 && (int) $f['intentos'] + 1 < self::MAX_INTENTOS) {
            $n = (int) $f['intentos'] + 1;
            Db::q('UPDATE push_cola SET intentos = ?, enviar_desde = ?, motivo = ? WHERE id = ?', [$n, $t + 60 * (2 ** $n), 'reintento', $f['id']]);
            return 'reintentos';
        }
        if ($repetidos > 0 && $repetidos === count($subs)) return self::cerrar((int) $f['id'], 'descartado', 'repetido');
        if ($muertas === count($subs) - $repetidos) return self::cerrar((int) $f['id'], 'descartado', 'sin_suscripcion');
        return self::cerrar((int) $f['id'], 'fallido', 'servicio');
    }

    /** Lo que hace bin/push_enviar.php cada minuto: detectores y luego la cola. */
    public static function procesar(int $limite = 300): array
    {
        $r = ['detectados' => 0, 'enviados' => 0, 'pospuestos' => 0, 'descartados' => 0, 'fallidos' => 0, 'reintentos' => 0, 'muertas' => 0, 'sin_claves' => 0];
        if (!self::disponible()) { $r['sin_claves'] = 1; return $r; }
        $r['detectados'] = self::detectar();
        $filas = Db::todas("SELECT * FROM push_cola WHERE estado = 'pendiente' AND enviar_desde <= ? ORDER BY prioridad DESC, id LIMIT ?", [self::ahora(), $limite]);
        foreach ($filas as $f) {
            $k = self::procesarUno($f, $r);
            $r[$k] = ($r[$k] ?? 0) + 1;
        }
        if (random_int(1, 60) === 1) self::limpiar();
        return $r;
    }

    public static function limpiar(): void
    {
        $t = self::ahora();
        Db::q("DELETE FROM push_cola WHERE estado <> 'pendiente' AND creado < ?", [$t - 30 * 86400]);
        Db::q('DELETE FROM push_envios WHERE creado < ?', [$t - 90 * 86400]);
        Db::q('DELETE FROM push_marcas WHERE actualizado < ?', [$t - 60 * 86400]);
    }

    /** Prueba del Centro de Control: envía YA a todos los aparatos del jugador (sin horario ni tope). */
    public static function enviarPrueba(int $j): array
    {
        Fallo::si(!self::disponible(), 'Faltan las llaves VAPID (php server/bin/push_claves.php).', 400, ['codigo' => 'push_no_configurado']);
        Fallo::si(!Db::valor('SELECT 1 FROM push_suscripciones WHERE jugador_id = ?', [$j]), 'Ese jugador no tiene aparatos suscritos.', 404, ['codigo' => 'push_no_suscrito']);
        $id = self::encolarPlantilla($j, 'prueba', 'prueba', [], '/', 'prueba:' . self::ahora() . ':' . bin2hex(random_bytes(3)), ['forzar' => true, 'vence' => self::ahora() + 600]);
        Fallo::si($id === null, 'No se pudo encolar la prueba.', 500);
        $r = [];
        $res = self::procesarUno(Db::fila('SELECT * FROM push_cola WHERE id = ?', [$id]), $r);
        $envios = Db::todas('SELECT http, ok FROM push_envios WHERE cola_id = ?', [$id]);
        return ['resultado' => $res, 'aparatos' => count($envios), 'ok' => count(array_filter($envios, fn($e) => (int) $e['ok'] === 1)),
            'http' => array_map(fn($e) => (int) $e['http'], $envios), 'muertas' => $r['muertas'] ?? 0];
    }

    // =================================================================== detectores
    private static function hayTabla(string $t): bool { return Migraciones::columnas($t) !== null; }

    private static function marca(string $k): ?string { $v = Db::valor('SELECT valor FROM push_marcas WHERE clave = ?', [$k]); return $v === false || $v === null ? null : (string) $v; }

    private static function marcar(string $k, string $v): void
    {
        Db::q('INSERT INTO push_marcas (clave, valor, actualizado) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado', [$k, $v, self::ahora()]);
    }

    private const SUSCRITO = 'EXISTS (SELECT 1 FROM push_suscripciones ps WHERE ps.jugador_id = %s)';

    /** Corre todos los detectores (cada uno aparte: si uno falla, los demás siguen). Devuelve cuántos avisos encoló. */
    public static function detectar(): int
    {
        $n = 0;
        foreach (['obras', 'copas', 'duelos', 'buzon', 'premio', 'recordatorios'] as $d) {
            try {
                $n += self::{'detectar' . ucfirst($d)}();
            } catch (\Throwable $e) {
                error_log('EN VIVO push detector ' . $d . ': ' . mb_substr($e->getMessage(), 0, 300));
            }
        }
        return $n;
    }

    /** Obra de la Sede oficial que terminó con su reloj (no las que se terminaron al instante con créditos). */
    public static function detectarObras(): int
    {
        if (!self::hayTabla('sede_obras')) return 0;
        $t = self::ahora();
        $n = 0;
        $filas = Db::todas('SELECT o.id, o.jugador_id, o.fin FROM sede_obras o WHERE o.fin <= ? AND o.fin > ? AND o.creditos = 0 AND ' . sprintf(self::SUSCRITO, 'o.jugador_id'), [$t, $t - 6 * 3600]);
        foreach ($filas as $o) {
            if (self::encolarPlantilla((int) $o['jugador_id'], 'obra', 'obra', [], '/?ir=sede', 'obra:' . $o['id'], ['vence' => (int) $o['fin'] + 12 * 3600]) !== null) $n++;
        }
        return $n;
    }

    /** Cambio de fase de la Copa de Servidores: aviso a los jugadores de los servidores que juegan esa copa. */
    public static function detectarCopas(): int
    {
        if (!self::hayTabla('copas') || !self::hayTabla('copa_servidores')) return 0;
        $t = self::ahora();
        $n = 0;
        foreach (Db::todas("SELECT id, fase, inicio, creado FROM copas WHERE fase IN ('preparacion', 'batalla') AND fin > ?", [$t]) as $c) {
            $k = 'copa:' . $c['id'];
            $antes = self::marca($k);
            if ($antes === $c['fase']) continue;
            self::marcar($k, (string) $c['fase']);
            // Primera vez que se ve la copa: solo se avisa si empezó hace poco (al instalar no se avisa una fase vieja).
            if ($antes === null && !($c['fase'] === 'preparacion' && max((int) $c['inicio'], (int) $c['creado']) > $t - 86400)) continue;
            $pl = $c['fase'] === 'batalla' ? 'copa_batalla' : 'copa_inicio';
            $js = Db::todas('SELECT j.id FROM jugadores j JOIN copa_servidores cs ON cs.servidor_id = j.servidor_id AND cs.copa_id = ? WHERE ' . sprintf(self::SUSCRITO, 'j.id'), [$c['id']]);
            foreach ($js as $j) if (self::encolarPlantilla((int) $j['id'], 'copa', $pl, [], '/?ir=copa', 'copa:' . $c['id'] . ':' . $c['fase'], ['vence' => $t + 8 * 3600]) !== null) $n++;
        }
        return $n;
    }

    /** Resultado de un duelo: al defensor (el retador lo vio en vivo). */
    public static function detectarDuelos(): int
    {
        if (!self::hayTabla('duelos')) return 0;
        $t = self::ahora();
        $n = 0;
        $filas = Db::todas("SELECT d.id, d.defensor_id, d.ganador, r.alias, r.nombre FROM duelos d JOIN jugadores r ON r.id = d.retador_id
                            WHERE d.estado = 'cerrado' AND d.cerrado > ? AND d.cerrado <= ? AND d.ganador IS NOT NULL AND (d.motivo IS NULL OR d.motivo <> 'vencido') AND "
                            . sprintf(self::SUSCRITO, 'd.defensor_id'), [$t - 6 * 3600, $t]);
        foreach ($filas as $d) {
            $pl = ['defensor' => 'duelo_ganado', 'retador' => 'duelo_perdido', 'empate' => 'duelo_empate'][$d['ganador']] ?? null;
            if ($pl === null) continue;
            $rival = mb_substr((string) ($d['alias'] ?: ''), 0, 30);
            if (self::encolarPlantilla((int) $d['defensor_id'], 'duelo', $pl, ['rival' => $rival], '/?ir=duelos', 'duelo:' . $d['id']) !== null) $n++;
        }
        return $n;
    }

    /** Respuesta nueva de soporte sin leer (el buzón del jugador). Otros buzones: Push::encolar(..., 'buzon', ...). */
    public static function detectarBuzon(): int
    {
        if (!self::hayTabla('soporte_mensajes')) return 0;
        $t = self::ahora();
        $n = 0;
        $filas = Db::todas("SELECT m.id, c.jugador_id FROM soporte_mensajes m JOIN soporte_casos c ON c.id = m.caso_id
                            WHERE m.autor = 'soporte' AND m.leido = 0 AND m.creado > ? AND " . sprintf(self::SUSCRITO, 'c.jugador_id'), [$t - 6 * 3600]);
        foreach ($filas as $m) if (self::encolarPlantilla((int) $m['jugador_id'], 'buzon', 'buzon', [], '/?ir=soporte', 'buzon:soporte:' . $m['id']) !== null) $n++;
        return $n;
    }

    /** Premio diario listo: tarjeta mensual activa y aún sin reclamar hoy (desde las 9:00). Otros premios: Push::encolar con enviar_desde. */
    public static function detectarPremio(): int
    {
        if (!self::hayTabla('tarjeta_reclamos') || !isset(Migraciones::columnas('jugadores')['tarjeta_hasta'])) return 0;
        $t = self::ahora();
        $h = self::hora($t);
        if ($h < 9 || $h >= self::SILENCIO_DESDE) return 0;
        $hoy = self::dia($t);
        $n = 0;
        $filas = Db::todas("SELECT j.id FROM jugadores j WHERE j.tarjeta_hasta > ? AND NOT EXISTS (SELECT 1 FROM tarjeta_reclamos r WHERE r.jugador_id = j.id AND r.dia = ?) AND "
                           . sprintf(self::SUSCRITO, 'j.id'), [$t, $hoy]);
        $fin = (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona())->setTime(self::SILENCIO_DESDE, 0)->getTimestamp();
        foreach ($filas as $j) if (self::encolarPlantilla((int) $j['id'], 'premio', 'premio', [], '/?ir=tienda', 'premio:tarjeta:' . $hoy, ['vence' => $fin]) !== null) $n++;
        return $n;
    }

    /** Recordatorio a los 3, 7, 14 y 28 días sin jugar (uno por escalón; nunca después de 30 días). Entre 10:00 y 20:00. */
    public static function detectarRecordatorios(): int
    {
        $t = self::ahora();
        $h = self::hora($t);
        if ($h < 10 || $h >= 20) return 0;
        $ult = self::marca('recordatorios:ultimo');
        if ($ult !== null && (int) $ult > $t - 600) return 0;
        self::marcar('recordatorios:ultimo', (string) $t);
        $n = 0;
        foreach (Db::todas('SELECT DISTINCT jugador_id FROM push_suscripciones') as $s) {
            $j = (int) $s['jugador_id'];
            $act = self::ultimaActividad($j);
            $dias = intdiv($t - $act, 86400);
            if ($dias < self::INACTIVO_RECORDAR || $dias >= self::INACTIVO_PARAR) continue;
            $esc = 0;
            foreach (self::RECORDAR_DIAS as $d) if ($dias >= $d) $esc = $d;
            if (self::encolarPlantilla($j, 'recordatorio', 'recordatorio', ['dias' => $dias], '/', 'recordatorio:' . self::dia($act) . ':' . $esc, ['vence' => $t + 10 * 3600]) !== null) $n++;
        }
        return $n;
    }

    // =================================================================== Centro de Control
    public static function estadisticas(): array
    {
        $t = self::ahora();
        $hoy0 = (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona())->setTime(0, 0)->getTimestamp();
        $v = fn(string $sql, array $p = []) => (int) Db::valor($sql, $p);
        $porCat = [];
        foreach (Db::todas('SELECT categoria, SUM(ok) AS ok, SUM(1 - ok) AS mal FROM push_envios WHERE creado >= ? GROUP BY categoria ORDER BY categoria', [$t - 7 * 86400]) as $f) {
            $porCat[$f['categoria']] = ['ok' => (int) $f['ok'], 'fallos' => (int) $f['mal']];
        }
        $cats = [];
        foreach (self::CATEGORIAS as $k => $_) $cats[$k] = 0;
        foreach (Db::todas('SELECT categorias_json FROM push_suscripciones') as $s) {
            foreach (self::normalizarCategorias(json_decode((string) $s['categorias_json'], true) ?: []) as $k => $on) if ($on) $cats[$k]++;
        }
        return [
            'disponible' => self::disponible(),
            'jugadores' => $v('SELECT COUNT(DISTINCT jugador_id) FROM push_suscripciones'),
            'aparatos' => $v('SELECT COUNT(*) FROM push_suscripciones'),
            'enviados_hoy' => $v('SELECT COUNT(*) FROM push_envios WHERE ok = 1 AND creado >= ?', [$hoy0]),
            'enviados_7d' => $v('SELECT COUNT(*) FROM push_envios WHERE ok = 1 AND creado >= ?', [$t - 7 * 86400]),
            'fallos_7d' => $v('SELECT COUNT(*) FROM push_envios WHERE ok = 0 AND creado >= ?', [$t - 7 * 86400]),
            'muertas_7d' => $v('SELECT COUNT(*) FROM push_envios WHERE http IN (404, 410) AND creado >= ?', [$t - 7 * 86400]),
            'pendientes' => $v("SELECT COUNT(*) FROM push_cola WHERE estado = 'pendiente'"),
            'descartados_7d' => Db::todas("SELECT motivo, COUNT(*) AS n FROM push_cola WHERE estado = 'descartado' AND creado >= ? GROUP BY motivo ORDER BY n DESC", [$t - 7 * 86400]),
            'por_categoria' => $porCat,
            'interruptores' => $cats,
            'recientes' => Db::todas('SELECT e.creado, e.jugador_id, e.categoria, e.http, e.ok, j.alias, j.nombre FROM push_envios e LEFT JOIN jugadores j ON j.id = e.jugador_id ORDER BY e.id DESC LIMIT 20'),
        ];
    }
}
