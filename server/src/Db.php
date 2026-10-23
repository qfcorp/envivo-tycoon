<?php
declare(strict_types=1);

namespace EnVivo;

use PDO;
use PDOStatement;

/**
 * Base de datos SQLite (un solo archivo FUERA de la carpeta pública, por defecto /var/lib/envivo/envivo.sqlite).
 * - Modo WAL (lecturas y escrituras a la vez sin bloquearse).
 * - Las tablas se crean y se actualizan solas (migraciones) en la primera petición o con bin/migrar.php.
 * - Toda escritura de dinero/créditos va en Db::tx(), que usa BEGIN IMMEDIATE (un solo escritor a la vez).
 * - Las fechas se guardan como números (segundos Unix) y se muestran en la zona de ENVIVO_ZONA.
 */
final class Db
{
    private static ?PDO $pdo = null;
    private static int $profundidad = 0;

    /** Migraciones en orden. NUNCA cambiar una que ya se aplicó: agregar otra al final. */
    private const MIGRACIONES = [
        // 1: núcleo
        <<<'SQL'
        CREATE TABLE jugadores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            nombre TEXT NOT NULL,
            clave_hash TEXT NOT NULL,
            creditos INTEGER NOT NULL DEFAULT 0 CHECK (creditos >= 0),
            vip_hasta INTEGER,
            creado INTEGER NOT NULL,
            ultimo_ingreso INTEGER
        );
        CREATE TABLE sesiones (
            token_hash TEXT PRIMARY KEY,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            creado INTEGER NOT NULL,
            expira INTEGER NOT NULL,
            ip TEXT,
            navegador TEXT,
            compra_pendiente INTEGER
        );
        CREATE INDEX sesiones_jugador ON sesiones (jugador_id);
        CREATE TABLE partidas (
            jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
            datos TEXT NOT NULL,
            actualizado INTEGER NOT NULL
        );
        CREATE TABLE movimientos_creditos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            cambio INTEGER NOT NULL,
            saldo INTEGER NOT NULL,
            motivo TEXT NOT NULL,
            ref TEXT,
            creado INTEGER NOT NULL
        );
        CREATE INDEX movimientos_jugador ON movimientos_creditos (jugador_id);
        CREATE TABLE entregas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            item TEXT NOT NULL,
            cantidad INTEGER NOT NULL,
            origen TEXT NOT NULL,
            creado INTEGER NOT NULL
        );
        CREATE INDEX entregas_jugador ON entregas (jugador_id);
        CREATE TABLE compras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id),
            producto TEXT NOT NULL,
            total REAL NOT NULL,
            subtotal REAL NOT NULL,
            iva REAL NOT NULL,
            estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'rechazado')),
            plux_transaccion TEXT,
            plux_paso TEXT,
            plux_respuesta TEXT,
            comprador_cedula TEXT,
            comprador_nombre TEXT,
            comprador_email TEXT,
            comprador_telefono TEXT,
            creado INTEGER NOT NULL,
            pagado_en INTEGER,
            pagado_por TEXT
        );
        CREATE INDEX compras_jugador ON compras (jugador_id, producto, estado);
        CREATE INDEX compras_transaccion ON compras (plux_transaccion);
        CREATE INDEX compras_estado ON compras (estado, pagado_en);
        CREATE TABLE bonos_vip (
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            dia TEXT NOT NULL,
            creado INTEGER NOT NULL,
            PRIMARY KEY (jugador_id, dia)
        );
        CREATE TABLE intentos (
            clave TEXT NOT NULL,
            minuto INTEGER NOT NULL,
            total INTEGER NOT NULL,
            PRIMARY KEY (clave, minuto)
        );
        CREATE TABLE avisos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            detalle TEXT NOT NULL,
            compra_id INTEGER,
            creado INTEGER NOT NULL
        );
        SQL,
    ];

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) return self::$pdo;
        $ruta = Config::db();
        $pdo = new PDO('sqlite:' . $ruta, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 10,
        ]);
        $pdo->exec('PRAGMA busy_timeout = 10000');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA synchronous = NORMAL');
        $pdo->exec('PRAGMA foreign_keys = ON');
        self::$pdo = $pdo;
        self::migrar();
        return $pdo;
    }

    public static function versionEsperada(): int { return count(self::MIGRACIONES); }

    /** Aplica las migraciones que falten. Devuelve cuántas aplicó (0 = la base ya estaba al día). */
    public static function migrar(): int
    {
        $pdo = self::$pdo ?? self::pdo();
        if ((int) $pdo->query('PRAGMA user_version')->fetchColumn() >= count(self::MIGRACIONES)) return 0;
        return self::tx(function () use ($pdo): int {
            $v = (int) $pdo->query('PRAGMA user_version')->fetchColumn();   // otra petición pudo migrar mientras esperábamos
            $n = 0;
            for ($i = $v; $i < count(self::MIGRACIONES); $i++) {
                $pdo->exec(self::MIGRACIONES[$i]);
                $pdo->exec('PRAGMA user_version = ' . ($i + 1));
                $n++;
            }
            return $n;
        });
    }

    /**
     * Ejecuta $f dentro de una transacción con BEGIN IMMEDIATE (toma el turno de escritura al empezar, así
     * dos compras a la vez nunca se pisan). Si ya hay una transacción abierta, se suma a ella.
     */
    public static function tx(callable $f): mixed
    {
        $pdo = self::pdo();
        if (self::$profundidad > 0) return $f();
        $pdo->exec('BEGIN IMMEDIATE');
        self::$profundidad = 1;
        try {
            $r = $f();
            $pdo->exec('COMMIT');
            return $r;
        } catch (\Throwable $e) {
            try { $pdo->exec('ROLLBACK'); } catch (\Throwable) {}
            throw $e;
        } finally {
            self::$profundidad = 0;
        }
    }

    public static function q(string $sql, array $p = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st;
    }

    public static function fila(string $sql, array $p = []): ?array
    {
        $r = self::q($sql, $p)->fetch();
        return is_array($r) ? $r : null;
    }

    public static function valor(string $sql, array $p = []): mixed
    {
        $r = self::q($sql, $p)->fetchColumn();
        return $r === false ? null : $r;
    }

    public static function todas(string $sql, array $p = []): array { return self::q($sql, $p)->fetchAll(); }

    public static function ultimoId(): int { return (int) self::pdo()->lastInsertId(); }

    /** Fecha (segundos Unix) -> texto ISO 8601 con la zona del juego, ej. 2026-11-22T10:00:00-05:00 */
    public static function iso(?int $t): ?string { return $t === null ? null : date('c', $t); }

    /** Deja una nota para el administrador (se ve en admin.php). Nunca lleva datos de tarjeta. */
    public static function aviso(string $tipo, string $detalle, ?int $compra = null): void
    {
        try {
            self::q('INSERT INTO avisos (tipo, detalle, compra_id, creado) VALUES (?, ?, ?, ?)', [$tipo, mb_substr($detalle, 0, 3000), $compra, time()]);
        } catch (\Throwable $e) {
            error_log('EN VIVO: no se pudo guardar un aviso (' . $tipo . ')');
        }
    }
}
