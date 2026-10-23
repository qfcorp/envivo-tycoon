<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Inventario del servidor: los equipos que se pueden intercambiar en el mercado (exclusivos y VIP canjeados con créditos
 * y la cámara del paquete de inicio). Cada uno tiene un número de serie por tipo ("Dron 4K #0007") que nunca cambia.
 * Estados: 'bodega' (es del jugador y lo usa en el juego) o 'publicado' (está en el mercado: sale de la bodega).
 * Los equipos comprados con dinero del juego NO están aquí (viven solo en la partida).
 */
final class Inventario
{
    /** Crea un equipo nuevo con el siguiente número de serie de su tipo. Debe ir dentro de una transacción. */
    public static function crear(int $jugador, string $item, string $origen, ?string $ref = null): array
    {
        return Db::tx(function () use ($jugador, $item, $origen, $ref): array {
            Db::q('INSERT INTO series (item, ultima) VALUES (?, 1) ON CONFLICT (item) DO UPDATE SET ultima = ultima + 1', [$item]);
            $serie = (int) Db::valor('SELECT ultima FROM series WHERE item = ?', [$item]);
            $t = time();
            Db::q("INSERT INTO inventario (jugador_id, item, serie, origen, ref, estado, creado, actualizado) VALUES (?, ?, ?, ?, ?, 'bodega', ?, ?)",
                [$jugador, $item, $serie, $origen, $ref, $t, $t]);
            return self::json(Db::fila('SELECT * FROM inventario WHERE id = ?', [Db::ultimoId()]));
        });
    }

    /** Equipos del jugador que están en su bodega (los publicados no vienen: están en el mercado). */
    public static function deJugador(int $jugador): array
    {
        return array_map([self::class, 'json'], Db::todas("SELECT * FROM inventario WHERE jugador_id = ? AND estado = 'bodega' ORDER BY id", [$jugador]));
    }

    public static function json(array $f): array
    {
        return ['id' => (int) $f['id'], 'item' => $f['item'], 'serie' => (int) $f['serie'], 'origen' => $f['origen'], 'estado' => $f['estado'],
                'nombre' => Catalogo::nombreEquipo((string) $f['item']), 'entrega_id' => $f['entrega_id'] === null ? null : (int) $f['entrega_id'],
                'creado' => Db::iso((int) $f['creado'])];
    }
}
