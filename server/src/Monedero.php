<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Monedero de créditos, entregas y VIP.
 * - El saldo vive en jugadores.creditos y CADA cambio queda anotado en movimientos_creditos (cambio, saldo después,
 *   motivo y referencia). La suma de los movimientos de un jugador siempre es igual a su saldo.
 * - Una "entrega" es algo que el juego debe aplicar UNA vez (equipo, repuestos, personal, dinero del juego, reparar).
 *   El juego guarda los ids que ya aplicó.
 * Todo lo que cambia saldo o crea entregas corre dentro de Db::tx() (todo o nada).
 */
final class Monedero
{
    /** Suma (o resta, con número negativo) créditos y lo anota. Lanza \RuntimeException si el saldo quedaría negativo. */
    public static function mover(int $jugador, int $cambio, string $motivo, ?string $ref = null): int
    {
        return Db::tx(function () use ($jugador, $cambio, $motivo, $ref): int {
            $saldo = Db::valor('SELECT creditos FROM jugadores WHERE id = ?', [$jugador]);
            if ($saldo === null) throw new \RuntimeException('Jugador no encontrado.');
            $nuevo = (int) $saldo + $cambio;
            if ($nuevo < 0) throw new \RuntimeException('No tienes créditos suficientes.');
            Db::q('UPDATE jugadores SET creditos = ? WHERE id = ?', [$nuevo, $jugador]);
            Db::q('INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (?, ?, ?, ?, ?, ?)',
                [$jugador, $cambio, $nuevo, $motivo, $ref === null ? null : mb_substr($ref, 0, 200), time()]);
            return $nuevo;
        });
    }

    public static function saldo(int $jugador): int { return (int) Db::valor('SELECT creditos FROM jugadores WHERE id = ?', [$jugador]); }

    /** Crea una entrega y la devuelve como la ve el juego. */
    public static function entregar(int $jugador, string $tipo, string $item, int $cantidad, string $origen): array
    {
        $t = time();
        Db::q('INSERT INTO entregas (jugador_id, tipo, item, cantidad, origen, creado) VALUES (?, ?, ?, ?, ?, ?)', [$jugador, $tipo, $item, $cantidad, $origen, $t]);
        return ['id' => Db::ultimoId(), 'tipo' => $tipo, 'item' => $item, 'cantidad' => $cantidad, 'origen' => $origen, 'creado' => Db::iso($t)];
    }

    /** TODAS las entregas del jugador (historial), de la más vieja a la más nueva. */
    public static function entregas(int $jugador): array
    {
        return array_map(fn(array $e) => ['id' => (int) $e['id'], 'tipo' => $e['tipo'], 'item' => $e['item'], 'cantidad' => (int) $e['cantidad'],
            'origen' => $e['origen'], 'creado' => Db::iso((int) $e['creado'])],
            Db::todas('SELECT * FROM entregas WHERE jugador_id = ? ORDER BY id', [$jugador]));
    }

    /** Gasta créditos en un exclusivo. Devuelve [saldo, entrega]. Lanza \RuntimeException('...', 402) si no alcanza. */
    public static function gastar(int $jugador, string $item): array
    {
        $p = Catalogo::premium($item);
        if (!$p) throw new \InvalidArgumentException('Ese artículo no existe en la tienda.', 404);
        return Db::tx(function () use ($jugador, $item, $p): array {
            if (self::saldo($jugador) < $p['creditos']) throw new \RuntimeException('No tienes créditos suficientes. Necesitas ' . $p['creditos'] . ' créditos.', 402);
            $saldo = self::mover($jugador, -$p['creditos'], 'gasto', 'premium:' . $item);
            $e = $p['entrega'];
            $entrega = self::entregar($jugador, $e['tipo'], $e['item'], (int) $e['cantidad'], 'creditos:' . $item);
            return [$saldo, $entrega];
        });
    }

    public static function diaLocal(?int $t = null): string { return date('Y-m-d', $t ?? time()); }

    public static function bonoReclamadoHoy(int $jugador): bool
    {
        return (bool) Db::valor('SELECT 1 FROM bonos_vip WHERE jugador_id = ? AND dia = ?', [$jugador, self::diaLocal()]);
    }

    public static function vipActivo(int $jugador): bool
    {
        $v = Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$jugador]);
        return $v !== null && (int) $v > time();
    }

    /** Bono VIP diario: una vez por día local. Devuelve [saldo, entrega]. */
    public static function bonoVip(int $jugador): array
    {
        return Db::tx(function () use ($jugador): array {
            if (!self::vipActivo($jugador)) throw new \RuntimeException('Necesitas el Pase VIP activo para reclamar el bono diario.', 403);
            $dia = self::diaLocal();
            if (self::bonoReclamadoHoy($jugador)) throw new \RuntimeException('Ya reclamaste el bono VIP de hoy. Vuelve mañana.', 409);
            Db::q('INSERT INTO bonos_vip (jugador_id, dia, creado) VALUES (?, ?, ?)', [$jugador, $dia, time()]);
            $entrega = self::entregar($jugador, 'dinero', '-', Catalogo::VIP_BONO_DINERO, 'vip_bono:' . $dia);
            $saldo = self::mover($jugador, Catalogo::VIP_BONO_CREDITOS, 'vip_bono', 'vip_bono:' . $dia);
            return [$saldo, $entrega];
        });
    }

    /** Suma días de VIP desde lo que sea más tarde: ahora o el vencimiento actual. Devuelve el nuevo vencimiento. */
    public static function sumarVip(int $jugador, int $dias): int
    {
        return Db::tx(function () use ($jugador, $dias): int {
            $v = Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$jugador]);
            $nuevo = max(time(), (int) ($v ?? 0)) + $dias * 86400;
            Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [$nuevo, $jugador]);
            return $nuevo;
        });
    }
}
