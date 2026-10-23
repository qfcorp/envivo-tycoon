<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Límite de intentos (como demasiados_intentos de TuPass): cuenta por minuto en la tabla "intentos" y suma
 * los últimos N minutos. Se usa para entrar (por correo y por IP), registrarse, pagar y el panel.
 */
final class Limite
{
    /** ¿Ya pasó del máximo en los últimos $minutos? (solo mira, no suma) */
    public static function excedido(string $clave, int $max, int $minutos = 10): bool
    {
        try {
            $desde = intdiv(time(), 60) - $minutos;
            return (int) Db::valor('SELECT COALESCE(SUM(total), 0) FROM intentos WHERE clave = ? AND minuto > ?', [$clave, $desde]) >= $max;
        } catch (\Throwable) {
            return false;
        }
    }

    public static function sumar(string $clave): void
    {
        try {
            $min = intdiv(time(), 60);
            Db::q('INSERT INTO intentos (clave, minuto, total) VALUES (?, ?, 1) ON CONFLICT (clave, minuto) DO UPDATE SET total = total + 1', [$clave, $min]);
            if (random_int(1, 50) === 1) Db::q('DELETE FROM intentos WHERE minuto < ?', [$min - 24 * 60]);
        } catch (\Throwable) {
        }
    }

    /** Suma un intento y dice si con este ya se pasó del máximo. */
    public static function contar(string $clave, int $max, int $minutos = 10): bool
    {
        self::sumar($clave);
        return self::excedido($clave, $max + 1, $minutos);
    }
}
