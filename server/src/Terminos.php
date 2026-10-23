<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Aceptación de los Términos y la Política de privacidad (Google Play y LOPDP). Ver server/INTEGRAR_CUENTA.md.
 * - Al registrarse: POST /api/registro debe traer acepta_terminos: true y edad_16: true (si no, 400 y no se crea la cuenta).
 * - Cuentas viejas (o que cambiaron de dueño): el juego pide aceptar UNA vez (POST /api/cuenta/terminos) antes del chat,
 *   el mercado y los modos en línea. El servidor no deja escribir en el chat sin aceptar (403 terminos_pendientes).
 * - Versión: Terminos::VERSION, o ENVIVO_TERMINOS_VERSION en config.env para pedir que todos acepten otra vez
 *   (cuando cambien los términos). Edad mínima: 16 años (decisión del dueño).
 */
final class Terminos
{
    public const VERSION = '2026-10';
    public const EDAD_MINIMA = 16;

    public static function version(): string
    {
        $v = trim(Config::get('ENVIVO_TERMINOS_VERSION'));
        return $v !== '' && preg_match('/^[\w.\-]{1,32}$/', $v) ? $v : self::VERSION;
    }

    private static function hashEmail(string $email): string { return hash('sha256', Cuentas::normalizarEmail($email)); }

    /** Fecha (segundos) en que el jugador aceptó la versión vigente con su correo actual, o null. */
    public static function aceptadoEn(int $jugador): ?int
    {
        $email = Db::valor('SELECT email FROM jugadores WHERE id = ?', [$jugador]);
        if ($email === null) return null;
        $t = Db::valor('SELECT MAX(aceptado) FROM cuenta_terminos WHERE jugador_id = ? AND version = ? AND email_hash = ?',
            [$jugador, self::version(), self::hashEmail((string) $email)]);
        return $t === null ? null : (int) $t;
    }

    public static function aceptado(int $jugador): bool { return self::aceptadoEn($jugador) !== null; }

    /** Revisa lo que manda el formulario (registro o ventana del juego). Lanza Fallo 400 con el código si falta algo. */
    public static function revisar(array $in, bool $registro = true): void
    {
        if (($in['acepta_terminos'] ?? null) !== true) {
            throw new Fallo(($registro ? 'Para crear tu cuenta' : 'Para seguir') . ' debes aceptar los Términos y la Política de privacidad.', 400, ['codigo' => 'terminos_requeridos']);
        }
        if (($in['edad_16'] ?? null) !== true) {
            throw new Fallo('Debes tener ' . self::EDAD_MINIMA . ' años o más para tener una cuenta.', 400, ['codigo' => 'edad_requerida', 'edad' => self::EDAD_MINIMA]);
        }
    }

    /** Guarda la aceptación de la versión vigente (si ya estaba, no hace nada). */
    public static function aceptar(int $jugador, string $origen): int
    {
        $email = Db::valor('SELECT email FROM jugadores WHERE id = ?', [$jugador]);
        Fallo::si($email === null, 'La cuenta no existe.', 404);
        $ahora = time();
        Db::q('INSERT INTO cuenta_terminos (jugador_id, version, email_hash, edad_minima, origen, aceptado) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (jugador_id, version, email_hash) DO NOTHING',
            [$jugador, self::version(), self::hashEmail((string) $email), self::EDAD_MINIMA, in_array($origen, ['registro', 'juego'], true) ? $origen : 'juego', $ahora]);
        return self::aceptadoEn($jugador) ?? $ahora;
    }

    /** Lanza Fallo 403 terminos_pendientes si el jugador no aceptó la versión vigente (chat). */
    public static function exigir(int $jugador): void
    {
        if (self::aceptado($jugador)) return;
        throw new Fallo('Antes de usar el chat acepta los Términos y la Política de privacidad (te lo pedimos una sola vez).', 403,
            ['codigo' => 'terminos_pendientes', 'version' => self::version()]);
    }

    /** Bloque "terminos" de GET /api/estado (con sesión). Nunca rompe el estado. */
    public static function estado(int $jugador): array
    {
        try {
            $t = self::aceptadoEn($jugador);
            return ['terminos' => ['version' => self::version(), 'aceptados' => $t !== null, 'aceptado_en' => Db::iso($t), 'edad_minima' => self::EDAD_MINIMA]];
        } catch (\Throwable $e) {
            error_log('EN VIVO terminos: ' . get_class($e) . ' ' . mb_substr($e->getMessage(), 0, 200));
            return ['terminos' => null];
        }
    }
}
