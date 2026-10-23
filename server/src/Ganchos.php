<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Ganchos del servidor (eventos), server/MONETIZACION.md §2.
 *   Ganchos::en('compra_aprobada', fn(array $d) => ...);   // lo registra cada módulo en arranque.php (Vip::registrar(), ...)
 *   Ganchos::emitir('compra_aprobada', [...]);              // lo emite Compras / Monedero
 * Eventos: compra_aprobada {compra_id, jugador_id, producto, monto_usd, canal:'plux'|'google'},
 *          compra_revertida {compra_id, jugador_id, motivo}, creditos_gastados {jugador_id, cantidad, motivo, ref}.
 *          (Propios del VIP, opcionales: copa_ganada {jugador_id, copa_id}, sede_nivel {jugador_id, nivel}.)
 * Cada oyente corre aparte: un error de un oyente NUNCA rompe la compra ni a los demás oyentes.
 *  - Si se emite dentro de una transacción (Db::tx), cada oyente va en un SAVEPOINT: si falla, se deshace solo lo suyo.
 *  - Si se emite fuera, cada oyente va en su propia Db::tx (todo o nada).
 * El fallo queda en avisos (tipo 'gancho_fallo') para el Centro de Control. Devuelve cuántos oyentes fallaron.
 */
final class Ganchos
{
    /** @var array<string, list<array{0:string,1:callable}>> */
    private static array $oyentes = [];
    private static int $sp = 0;

    /** Registra un oyente. Con $clave, registrar dos veces la misma clave no lo duplica (arranque.php puede correr de nuevo). */
    public static function en(string $evento, callable $fn, ?string $clave = null): void
    {
        $clave ??= 'f' . count(self::$oyentes[$evento] ?? []);
        foreach (self::$oyentes[$evento] ?? [] as $o) if ($o[0] === $clave) return;
        self::$oyentes[$evento][] = [$clave, $fn];
    }

    public static function hay(string $evento): bool { return !empty(self::$oyentes[$evento]); }

    /** Quita los oyentes de un evento (o todos). Solo para pruebas. */
    public static function olvidar(?string $evento = null): void
    {
        if ($evento === null) self::$oyentes = []; else unset(self::$oyentes[$evento]);
    }

    /** Avisa a todos los oyentes del evento. Nunca lanza. Devuelve el número de oyentes que fallaron. */
    public static function emitir(string $evento, array $datos): int
    {
        $fallas = 0;
        foreach (self::$oyentes[$evento] ?? [] as [$clave, $fn]) {
            try {
                self::correr($fn, $datos);
            } catch (\Throwable $e) {
                $fallas++;
                Db::aviso('gancho_fallo', 'Gancho "' . $evento . '" (' . $clave . ') falló: ' . mb_substr($e->getMessage(), 0, 500) . ' · datos ' . mb_substr((string) json_encode($datos, JSON_UNESCAPED_UNICODE), 0, 500),
                    isset($datos['compra_id']) && is_int($datos['compra_id']) ? $datos['compra_id'] : null);
            }
        }
        return $fallas;
    }

    private static function correr(callable $fn, array $datos): void
    {
        if (!self::enTransaccion()) { Db::tx(fn() => $fn($datos)); return; }
        $sp = 'gancho_' . (++self::$sp);
        $pdo = Db::pdo();
        $pdo->exec('SAVEPOINT ' . $sp);
        try {
            $fn($datos);
            $pdo->exec('RELEASE ' . $sp);
        } catch (\Throwable $e) {
            try { $pdo->exec('ROLLBACK TO ' . $sp); $pdo->exec('RELEASE ' . $sp); } catch (\Throwable) {}
            throw $e;
        }
    }

    /** ¿Hay una Db::tx abierta? (Db usa BEGIN IMMEDIATE a mano, así que PDO::inTransaction() no lo sabe.) */
    public static function enTransaccion(): bool
    {
        try { return (int) (new \ReflectionProperty(Db::class, 'profundidad'))->getValue() > 0; } catch (\Throwable) { return false; }
    }
}
