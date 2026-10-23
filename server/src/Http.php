<?php
declare(strict_types=1);

namespace EnVivo;

/** Ayudas para responder: JSON, páginas simples, redirecciones, IP del visitante y dirección del sitio. */
final class Http
{
    public static function json(int $http, array $datos): never
    {
        http_response_code($http);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** Código estable (para que el juego traduzca el mensaje) según el estado HTTP, si no se dio uno más preciso. */
    public const CODIGOS = [400 => 'datos_invalidos', 401 => 'sesion_requerida', 402 => 'sin_creditos', 403 => 'prohibido', 404 => 'no_encontrado',
        405 => 'metodo_no_permitido', 409 => 'conflicto', 410 => 'vencido', 413 => 'muy_grande', 422 => 'datos_invalidos', 429 => 'limite_intentos',
        500 => 'error_servidor', 502 => 'error_externo', 503 => 'no_disponible'];

    /**
     * Error para el juego: { ok: false, error: "texto en español", codigo: "codigo_estable", ...extra }.
     * El texto está en español; "codigo" no cambia nunca (el juego lo usa para traducir a sus 10 idiomas).
     */
    public static function error(int $http, string $texto, array $extra = [], ?string $codigo = null): never
    {
        $codigo ??= is_string($extra['codigo'] ?? null) ? $extra['codigo'] : (self::CODIGOS[$http] ?? 'error');
        self::json($http, ['ok' => false, 'error' => $texto, 'codigo' => $codigo] + $extra);
    }

    /** Cuerpo JSON de la petición (máximo $max bytes). Si no es JSON válido devuelve []. */
    public static function entrada(int $max = 1048576): array
    {
        $t = (string) file_get_contents('php://input', false, null, 0, $max + 1);
        if (strlen($t) > $max) self::error(413, 'La información enviada es demasiado grande.');
        $j = json_decode($t, true);
        return is_array($j) ? $j : [];
    }

    public static function redirigir(string $a, int $codigo = 302): never
    {
        header('Cache-Control: no-store');
        header('Location: ' . $a, true, $codigo);
        exit;
    }

    public static function esHttps(): bool
    {
        $h = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
        return ($h !== '' && $h !== 'off') || (string) ($_SERVER['SERVER_PORT'] ?? '') === '443';
    }

    /** ¿La galleta lleva "Secure"? Sí si la petición es https o si ENVIVO_URL es https (detrás de un túnel de Cloudflare). */
    public static function galletaSegura(): bool { return self::esHttps() || str_starts_with(Config::get('ENVIVO_URL'), 'https://'); }

    /** https://juego.tukanec.com (de ENVIVO_URL; si no está, se arma con el Host). */
    public static function urlBase(): string
    {
        $u = rtrim(Config::get('ENVIVO_URL'), '/');
        if ($u !== '' && preg_match('#^https?://[A-Za-z0-9.-]+(:\d+)?$#', $u)) return $u;
        $h = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        if (!preg_match('/^[A-Za-z0-9.-]+(:\d+)?$/', $h)) $h = 'localhost';
        return (self::esHttps() ? 'https://' : 'http://') . $h;
    }

    /** IP del visitante. Con nginx directo es REMOTE_ADDR (no se confía en cabeceras que el visitante puede inventar). */
    public static function ip(): string
    {
        return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
    }

    public static function navegador(): string { return mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 250); }

    public static function e(?string $t): string { return htmlspecialchars((string) $t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

    /** 4.99 -> "$4,99" */
    public static function dinero(float|string $v): string { return '$' . number_format((float) $v, 2, ',', '.'); }

    /** Cabeceras de seguridad para las páginas HTML (pago, panel). */
    public static function cabecerasPagina(): void
    {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    }

    /** Página sencilla con un mensaje y un botón (oscura, como el juego). */
    public static function pagina(int $http, string $titulo, string $texto, string $enlace = '/', string $boton = 'Volver al juego'): never
    {
        http_response_code($http);
        self::cabecerasPagina();
        echo self::inicioHtml($titulo)
           . '<main class="caja"><div class="marca">EN VIVO <b>Tycoon</b></div><h1>' . self::e($titulo) . '</h1><p>' . self::e($texto) . '</p>'
           . '<p><a class="boton" href="' . self::e($enlace) . '">' . self::e($boton) . '</a></p></main></body></html>';
        exit;
    }

    public static function inicioHtml(string $titulo): string
    {
        return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
             . '<meta name="theme-color" content="#0d0f14"><meta name="robots" content="noindex"><title>' . self::e($titulo) . ' · EN VIVO Tycoon</title>'
             . '<link rel="icon" href="/icons/favicon-32.png"><link rel="stylesheet" href="/pago-assets/estilo.css?v=1"></head><body>';
    }
}
