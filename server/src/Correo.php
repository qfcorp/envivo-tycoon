<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Correo del juego (recuperar la clave, avisos de la cuenta). Habla SMTP con sockets de PHP (sin composer).
 * Configuración en /etc/envivo/config.env (guía para el dueño: docs/CORREO.md):
 *   SMTP_HOST, SMTP_PORT (587 con tls, 465 con ssl), SMTP_USUARIO, SMTP_CLAVE, SMTP_DE (remitente: no-responder@tukanec.com),
 *   SMTP_NOMBRE (nombre visible; vacío = "EN VIVO Tycoon"), SMTP_SEGURIDAD (tls | ssl; "ninguna" SOLO para 127.0.0.1 en pruebas).
 * Sin SMTP_HOST el correo NO sale: se escribe en un archivo (CORREO_REGISTRO; vacío = correos.log junto a la base),
 * para pruebas o para ver el enlace a mano mientras el dueño configura el SMTP.
 * Nunca se escribe la clave SMTP ni el contenido del correo en el registro de errores de PHP.
 */
final class Correo
{
    public const MARCA = 'EN VIVO Tycoon';
    public const TIEMPO = 15;   // segundos máximos por paso de SMTP

    /** @var list<callable> correos para mandar después de responder al jugador */
    private static array $pendientes = [];
    private static bool $registrado = false;
    /** Último error de SMTP (para las pruebas y bin/correo_prueba.php; sin datos secretos). */
    public static string $ultimoError = '';

    /** 'smtp' (sale de verdad) o 'registro' (solo se escribe en el archivo). */
    public static function modo(): string { return Config::get('SMTP_HOST') !== '' ? 'smtp' : 'registro'; }

    public static function configurado(): bool { return self::modo() === 'smtp' && self::remitente() !== ''; }

    public static function remitente(): string
    {
        $de = Config::get('SMTP_DE', Config::get('SMTP_USUARIO'));
        return filter_var($de, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n<>]/', $de) ? $de : '';
    }

    public static function archivoRegistro(): string { return Config::get('CORREO_REGISTRO', dirname(Config::db()) . '/correos.log'); }

    /**
     * Manda un correo (HTML + texto). Devuelve true si el servidor SMTP lo aceptó (o si quedó en el archivo, en modo
     * registro). Nunca lanza: si falla, anota el motivo en error_log y en Correo::$ultimoError y devuelve false.
     */
    public static function enviar(string $para, string $asunto, string $html, string $texto): bool
    {
        self::$ultimoError = '';
        $para = trim($para);
        if (!filter_var($para, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>,;]/', $para) || str_ends_with($para, '.invalid')) {
            self::$ultimoError = 'destinatario no válido';
            return false;
        }
        $asunto = trim(preg_replace('/[\r\n]+/', ' ', $asunto) ?? '');
        if (self::modo() === 'registro') return self::registrar($para, $asunto, $html, $texto);
        try {
            self::smtp($para, self::mensaje($para, $asunto, $html, $texto));
            return true;
        } catch (\Throwable $e) {
            self::$ultimoError = mb_substr($e->getMessage(), 0, 300);
            error_log('EN VIVO correo: no salió (' . self::$ultimoError . ')');
            return false;
        }
    }

    /**
     * Manda el correo DESPUÉS de responder al jugador (php-fpm: fastcgi_finish_request). Así la respuesta tarda lo mismo
     * exista o no la cuenta (nadie puede averiguar qué correos están registrados midiendo el tiempo).
     */
    public static function despues(callable $mandar): void
    {
        self::$pendientes[] = $mandar;
        if (self::$registrado) return;
        self::$registrado = true;
        register_shutdown_function(static function (): void {
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
            foreach (self::$pendientes as $f) {
                try { $f(); } catch (\Throwable $e) { error_log('EN VIVO correo (después): ' . get_class($e) . ' ' . mb_substr($e->getMessage(), 0, 200)); }
            }
            self::$pendientes = [];
        });
    }

    // ------------------------------------------------------------------ modo registro (sin SMTP)

    private static function registrar(string $para, string $asunto, string $html, string $texto): bool
    {
        $f = self::archivoRegistro();
        $linea = json_encode(['fecha' => date('c'), 'para' => $para, 'asunto' => $asunto, 'texto' => $texto, 'html' => $html],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        $nuevo = !is_file($f);
        $ok = @file_put_contents($f, $linea, FILE_APPEND | LOCK_EX) !== false;
        if ($ok && $nuevo) @chmod($f, 0600);
        if (!$ok) { self::$ultimoError = 'no se pudo escribir ' . $f; error_log('EN VIVO correo: sin SMTP y no se pudo escribir el archivo de correos'); }
        return $ok;
    }

    // ------------------------------------------------------------------ mensaje MIME

    /** Encabezado con letras no ASCII (=?UTF-8?B?...?=). */
    public static function encabezado(string $t): string
    {
        if (!preg_match('/[^\x20-\x7e]/', $t)) return $t;
        return implode("\r\n ", array_map(fn($p) => '=?UTF-8?B?' . base64_encode($p) . '?=', mb_str_split($t, 30, 'UTF-8')));
    }

    public static function mensaje(string $para, string $asunto, string $html, string $texto): string
    {
        $de = self::remitente();
        $dominio = substr((string) strrchr($de ?: 'envivo@localhost', '@'), 1) ?: 'localhost';
        $limite = '=_envivo_' . bin2hex(random_bytes(12));
        $nombre = str_replace(['"', '\\', "\r", "\n"], '', Config::get('SMTP_NOMBRE', self::MARCA));
        $nombre = preg_match('/[^\x20-\x7e]/', $nombre) ? self::encabezado($nombre) : '"' . $nombre . '"';   // ASCII: entre comillas (comas, puntos...)
        $cab = [
            'Date: ' . date('r'),
            'From: ' . $nombre . ' <' . $de . '>',
            'To: <' . $para . '>',
            'Subject: ' . self::encabezado($asunto),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $dominio . '>',
            'MIME-Version: 1.0',
            'Auto-Submitted: auto-generated',
            'X-Auto-Response-Suppress: All',
            'Content-Type: multipart/alternative; boundary="' . $limite . '"',
        ];
        $soporte = Config::get('SOPORTE_CORREO');
        if (filter_var($soporte, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n<>]/', $soporte)) $cab[] = 'Reply-To: <' . $soporte . '>';
        $parte = fn(string $tipo, string $cuerpo) => '--' . $limite . "\r\nContent-Type: $tipo; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . rtrim(chunk_split(base64_encode($cuerpo), 76, "\r\n")) . "\r\n";
        return implode("\r\n", $cab) . "\r\n\r\n" . $parte('text/plain', $texto) . $parte('text/html', $html) . '--' . $limite . "--\r\n";
    }

    // ------------------------------------------------------------------ SMTP

    /** @param resource $s */
    private static function leer($s): array
    {
        $todo = '';
        while (true) {
            $l = fgets($s, 2048);
            if ($l === false) {
                $m = stream_get_meta_data($s);
                throw new \RuntimeException(!empty($m['timed_out']) ? 'el servidor SMTP tardó demasiado' : 'el servidor SMTP cerró la conexión');
            }
            $todo .= $l;
            if (strlen($l) < 4 || $l[3] !== '-') break;
        }
        return [(int) substr($todo, 0, 3), $todo];
    }

    /** @param resource $s */
    private static function orden($s, ?string $linea, array $esperado, string $paso): string
    {
        if ($linea !== null && fwrite($s, $linea . "\r\n") === false) throw new \RuntimeException('no se pudo escribir al servidor SMTP (' . $paso . ')');
        [$c, $t] = self::leer($s);
        if (!in_array($c, $esperado, true)) throw new \RuntimeException($paso . ': el servidor respondió ' . trim(mb_substr(preg_replace('/\s+/', ' ', $t) ?? '', 0, 160)));
        return $t;
    }

    private static function smtp(string $para, string $mensaje): void
    {
        $host = Config::get('SMTP_HOST');
        $seg = strtolower(Config::get('SMTP_SEGURIDAD', 'tls'));
        if (!in_array($seg, ['tls', 'ssl', 'ninguna'], true)) throw new \RuntimeException('SMTP_SEGURIDAD debe ser tls o ssl');
        $puerto = (int) Config::get('SMTP_PORT', $seg === 'ssl' ? '465' : '587');
        if (!preg_match('/^[A-Za-z0-9.-]+$/', $host) || $puerto < 1 || $puerto > 65535) throw new \RuntimeException('SMTP_HOST o SMTP_PORT no válidos');
        // Sin cifrar SOLO hacia esta misma máquina (servidor falso de las pruebas): la clave nunca viaja en claro por internet
        if ($seg === 'ninguna' && !in_array($host, ['127.0.0.1', 'localhost'], true)) throw new \RuntimeException('SMTP_SEGURIDAD=ninguna solo se permite con 127.0.0.1');
        $de = self::remitente();
        if ($de === '') throw new \RuntimeException('falta SMTP_DE (el correo remitente)');
        $ssl = ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host, 'SNI_enabled' => true];
        $ca = Config::get('SMTP_CA');   // opcional: certificado raíz propio (solo pruebas o un SMTP interno); vacío = los del sistema
        if ($ca !== '' && is_file($ca)) $ssl['cafile'] = $ca;
        $ctx = stream_context_create(['ssl' => $ssl]);
        $s = @stream_socket_client(($seg === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $puerto, $errno, $errstr, self::TIEMPO, STREAM_CLIENT_CONNECT, $ctx);
        if (!$s) throw new \RuntimeException('no se pudo conectar a ' . $host . ':' . $puerto . ' (' . $errstr . ')');
        stream_set_timeout($s, self::TIEMPO);
        try {
            $yo = (string) (parse_url(Config::get('ENVIVO_URL'), PHP_URL_HOST) ?: 'localhost');
            self::orden($s, null, [220], 'saludo');
            $cap = self::orden($s, 'EHLO ' . $yo, [250], 'EHLO');
            if ($seg === 'tls') {
                if (!preg_match('/^250[- ]STARTTLS/mi', $cap)) throw new \RuntimeException('el servidor no ofrece STARTTLS (prueba SMTP_SEGURIDAD=ssl con el puerto 465)');
                self::orden($s, 'STARTTLS', [220], 'STARTTLS');
                $metodo = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT : 0);
                if (@stream_socket_enable_crypto($s, true, $metodo) !== true) throw new \RuntimeException('no se pudo cifrar la conexión (TLS)');
                $cap = self::orden($s, 'EHLO ' . $yo, [250], 'EHLO (TLS)');
            }
            $usuario = Config::get('SMTP_USUARIO');
            if ($usuario !== '') {
                $clave = Config::get('SMTP_CLAVE');
                if (preg_match('/^250[- ]AUTH\b[^\r\n]*\bPLAIN\b/mi', $cap)) {
                    self::orden($s, 'AUTH PLAIN ' . base64_encode("\0" . $usuario . "\0" . $clave), [235], 'usuario y clave SMTP');
                } else {
                    self::orden($s, 'AUTH LOGIN', [334], 'AUTH LOGIN');
                    self::orden($s, base64_encode($usuario), [334], 'usuario SMTP');
                    self::orden($s, base64_encode($clave), [235], 'usuario y clave SMTP');
                }
            }
            self::orden($s, 'MAIL FROM:<' . $de . '>', [250], 'MAIL FROM');
            self::orden($s, 'RCPT TO:<' . $para . '>', [250, 251], 'RCPT TO');
            self::orden($s, 'DATA', [354], 'DATA');
            // Punto al inicio de una línea se duplica (RFC 5321 §4.5.2)
            $cuerpo = preg_replace('/^\./m', '..', str_replace(["\r\n", "\r"], "\n", $mensaje)) ?? '';
            self::orden($s, str_replace("\n", "\r\n", rtrim($cuerpo, "\n")) . "\r\n.", [250], 'envío del mensaje');
            @fwrite($s, "QUIT\r\n");
        } finally {
            @fclose($s);
        }
    }
}
