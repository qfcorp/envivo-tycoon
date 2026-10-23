<?php
declare(strict_types=1);

namespace EnVivo;

/** Registro de todo lo que se hace desde el Centro de Control y de los eventos importantes de cuentas (transferencias, reembolsos). */
final class Auditoria
{
    public static function anotar(string $quien, string $accion, string $detalle, ?int $jugador = null, ?int $compra = null): void
    {
        Db::q('INSERT INTO auditoria (quien, accion, detalle, jugador_id, compra_id, ip, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [mb_substr($quien, 0, 80), mb_substr($accion, 0, 60), mb_substr($detalle, 0, 2000), $jugador, $compra, Http::ip() ?: null, time()]);
    }

    public static function ultimas(int $n = 100, ?int $jugador = null): array
    {
        return $jugador === null ? Db::todas('SELECT * FROM auditoria ORDER BY id DESC LIMIT ' . max(1, min($n, 500)))
                                 : Db::todas('SELECT * FROM auditoria WHERE jugador_id = ? ORDER BY id DESC LIMIT ' . max(1, min($n, 500)), [$jugador]);
    }
}
