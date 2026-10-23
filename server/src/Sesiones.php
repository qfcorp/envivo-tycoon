<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Sesiones de los jugadores: galleta "envivo_s" (HttpOnly, Secure con https, SameSite=Lax, 60 días).
 * La galleta lleva un código al azar de 64 letras; en la base se guarda SOLO su sha256 (si alguien copia la base,
 * no puede entrar como el jugador). La sesión además recuerda la compra que se está pagando, para reconocerla
 * cuando el banco devuelve al jugador después de la validación 3DS (la dirección de regreso va sin parámetros propios).
 */
final class Sesiones
{
    public const GALLETA = 'envivo_s';
    public const DURACION = 60 * 86400;

    private static ?array $actual = null;
    private static bool $leida = false;

    /** La sesión válida de esta petición (con los datos del jugador), o null. */
    public static function actual(): ?array
    {
        if (self::$leida) return self::$actual;
        self::$leida = true;
        $tok = (string) ($_COOKIE[self::GALLETA] ?? '');
        if (!preg_match('/^[a-f0-9]{64}$/', $tok)) return null;
        $s = Db::fila('SELECT s.token_hash, s.jugador_id, s.expira, s.compra_pendiente, s.creado AS sesion_creada, s.ultimo_dia FROM sesiones s WHERE s.token_hash = ?', [hash('sha256', $tok)]);
        if (!$s) return null;
        if ((int) $s['expira'] < time()) {
            Db::q('DELETE FROM sesiones WHERE token_hash = ?', [$s['token_hash']]);
            self::borrarGalleta();
            return null;
        }
        // Si le quedan menos de 30 días, se alarga otra vez a 60 (el jugador que juega seguido no tiene que volver a entrar)
        if ((int) $s['expira'] - time() < 30 * 86400) {
            $exp = time() + self::DURACION;
            Db::q('UPDATE sesiones SET expira = ? WHERE token_hash = ?', [$exp, $s['token_hash']]);
            self::ponerGalleta($tok, $exp);
        }
        self::actividad($s);
        self::$actual = $s;
        return $s;
    }

    /** Anota que el jugador jugó hoy (una vez por día y sesión): sirve para DAU / MAU del Centro de Control. */
    private static function actividad(array $s): void
    {
        $hoy = date('Y-m-d');
        if (($s['ultimo_dia'] ?? null) === $hoy) return;
        try {
            Db::q('UPDATE sesiones SET ultimo_dia = ? WHERE token_hash = ?', [$hoy, $s['token_hash']]);
            Db::q('INSERT OR IGNORE INTO actividad (jugador_id, dia) VALUES (?, ?)', [$s['jugador_id'], $hoy]);
        } catch (\Throwable) {}
    }

    /** Cierra TODAS las sesiones de un jugador (transferencia de cuenta, baneo, "cerrar sesiones" del panel). */
    public static function revocarTodas(int $jugador): int { return Db::q('DELETE FROM sesiones WHERE jugador_id = ?', [$jugador])->rowCount(); }

    public static function jugadorId(): ?int
    {
        $s = self::actual();
        return $s ? (int) $s['jugador_id'] : null;
    }

    /** Abre una sesión nueva para el jugador y manda la galleta. */
    public static function abrir(int $jugador): void
    {
        $tok = bin2hex(random_bytes(32));
        $exp = time() + self::DURACION;
        Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira, ip, navegador) VALUES (?, ?, ?, ?, ?, ?)',
            [hash('sha256', $tok), $jugador, time(), $exp, Http::ip(), Http::navegador()]);
        Db::q('UPDATE jugadores SET ultimo_ingreso = ? WHERE id = ?', [time(), $jugador]);
        if (random_int(1, 20) === 1) Db::q('DELETE FROM sesiones WHERE expira < ?', [time()]);
        self::ponerGalleta($tok, $exp);
        self::$leida = true;
        self::$actual = Db::fila('SELECT token_hash, jugador_id, expira, compra_pendiente, creado AS sesion_creada, ultimo_dia FROM sesiones WHERE token_hash = ?', [hash('sha256', $tok)]);
        self::actividad(self::$actual);
    }

    public static function cerrar(): void
    {
        $s = self::actual();
        if ($s) Db::q('DELETE FROM sesiones WHERE token_hash = ?', [$s['token_hash']]);
        self::borrarGalleta();
        self::$actual = null;
    }

    /** Recuerda (en la sesión) qué compra se está pagando: sirve para el regreso del banco (3DS). */
    public static function recordarCompra(int $compra): void
    {
        $s = self::actual();
        if ($s) {
            Db::q('UPDATE sesiones SET compra_pendiente = ? WHERE token_hash = ?', [$compra, $s['token_hash']]);
            self::$actual['compra_pendiente'] = $compra;
        }
    }

    public static function compraRecordada(): ?int
    {
        $s = self::actual();
        return $s && $s['compra_pendiente'] !== null ? (int) $s['compra_pendiente'] : null;
    }

    private static function ponerGalleta(string $valor, int $expira): void
    {
        if (headers_sent()) return;
        setcookie(self::GALLETA, $valor, ['expires' => $expira, 'path' => '/', 'secure' => Http::galletaSegura(), 'httponly' => true, 'samesite' => 'Lax']);
    }

    private static function borrarGalleta(): void
    {
        if (headers_sent()) return;
        setcookie(self::GALLETA, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => Http::galletaSegura(), 'httponly' => true, 'samesite' => 'Lax']);
    }
}
