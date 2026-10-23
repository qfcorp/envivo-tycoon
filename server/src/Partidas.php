<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Partida en la nube (una por cuenta) con versión y un solo dispositivo activo (migraciones/partida_nube.sql, API.md).
 *
 * Por qué: un jugador dejó el juego abierto en la computadora, avanzó en el celular y la pestaña vieja de la
 * computadora nunca bajó el avance; peor, cualquier guardado de esa pestaña (incluso al ocultarla) pisaba la partida
 * nueva. Ahora:
 *  - Cada guardado sube `rev` en 1. El juego manda `base` (la versión de la que partió su partida). Si en la nube
 *    hay otra versión → 409 partida_desactualizada, no se guarda nada y se devuelve `nube` (rev, actualizado, quién).
 *  - `dispositivo` es un código al azar de la pestaña (lo crea el juego al abrir). Solo el dispositivo activo de la
 *    cuenta (partida_activa) puede guardar; otro → 409 otro_dispositivo. Un dispositivo toma la partida al abrir el
 *    juego o al elegir "Usar la partida más nueva" (POST /api/partida/activar, también con `base` al día), o al guardar
 *    con `tomar: true` (cuando el jugador eligió quedarse con la partida de ese aparato).
 *  - Juego viejo (sin `base`, aún en la caché de algún celular): se acepta SOLO mientras la cuenta nunca usó el juego
 *    nuevo (la partida no tiene dispositivo y no hay dispositivo activo). Si ya lo usó, un juego viejo podría pisar
 *    avance nuevo (el error de siempre), así que recibe 409 partida_desactualizada; se anota en el registro para saber
 *    cuándo ya no quedan juegos viejos.
 */
final class Partidas
{
    public const MAX = 300 * 1024;

    /** Código de dispositivo válido (8–64 letras, números, - o _), o null. */
    public static function dispositivo(mixed $d): ?string
    {
        return is_string($d) && preg_match('/^[A-Za-z0-9_-]{8,64}$/', $d) ? $d : null;
    }

    /** Versión de la que partió el juego: entero ≥ 0 (o texto con el número), null si no vino. Otro valor → 400. */
    private static function base(mixed $b): ?int
    {
        if ($b === null) return null;
        if (is_int($b) && $b >= 0) return $b;
        if (is_string($b) && preg_match('/^\d{1,12}$/', $b)) return (int) $b;
        throw new Fallo('La versión de la partida no es válida.', 400, ['codigo' => 'partida_invalida']);
    }

    /** Cómo está la partida en la nube (sin los datos): versión, cuándo, quién guardó y quién la tiene abierta. */
    public static function meta(int $jugador, ?string $dispositivo = null): array
    {
        $p = Db::fila('SELECT rev, actualizado, dispositivo FROM partidas WHERE jugador_id = ?', [$jugador]);
        $a = Db::fila('SELECT dispositivo, desde FROM partida_activa WHERE jugador_id = ?', [$jugador]);
        $m = [
            'hay' => $p !== null,
            'rev' => $p ? (int) $p['rev'] : 0,
            'actualizado' => $p ? Db::iso((int) $p['actualizado']) : null,
            'guardo' => $p['dispositivo'] ?? null,
            'activo' => $a ? ['dispositivo' => (string) $a['dispositivo'], 'desde' => Db::iso((int) $a['desde'])] : null,
        ];
        if ($dispositivo !== null) $m['eres_activo'] = $a === null || $a['dispositivo'] === $dispositivo;
        return $m;
    }

    /** GET /api/partida: los datos y su versión. */
    public static function leer(int $jugador): array
    {
        $p = Db::fila('SELECT datos FROM partidas WHERE jugador_id = ?', [$jugador]);
        return ['ok' => true, 'datos' => $p['datos'] ?? null] + self::meta($jugador);
    }

    private static function conflicto(int $jugador, string $codigo, ?string $dispositivo): Fallo
    {
        $texto = $codigo === 'otro_dispositivo'
            ? 'Tu partida está abierta en otro dispositivo o pestaña. Carga la partida más nueva para seguir aquí.'
            : 'Tu partida se guardó en otro dispositivo o pestaña con más avance. Carga la más nueva antes de seguir.';
        return new Fallo($texto, 409, ['codigo' => $codigo, 'nube' => self::meta($jugador, $dispositivo)]);
    }

    /**
     * POST /api/partida {datos, base, dispositivo, tomar?}. Devuelve {ok, actualizado, rev}.
     * Todo en una transacción BEGIN IMMEDIATE: dos guardados a la vez nunca pasan los dos con la misma base.
     */
    public static function guardar(int $jugador, array $in): array
    {
        $datos = $in['datos'] ?? null;
        if (!is_string($datos) || $datos === '') throw new Fallo('No llegó la partida.', 400, ['codigo' => 'partida_vacia']);
        if (strlen($datos) > self::MAX) throw new Fallo('La partida es demasiado grande (máximo 300 KB).', 413, ['codigo' => 'partida_grande']);
        if (!json_validate($datos)) throw new Fallo('La partida no es un JSON válido.', 400, ['codigo' => 'partida_invalida']);
        $base = self::base($in['base'] ?? null);
        $disp = self::dispositivo($in['dispositivo'] ?? null);
        if ($base !== null && $disp === null) throw new Fallo('Falta el dispositivo de la partida.', 400, ['codigo' => 'partida_invalida']);
        $tomar = ($in['tomar'] ?? false) === true;
        return Db::tx(function () use ($jugador, $datos, $base, $disp, $tomar): array {
            $p = Db::fila('SELECT rev, dispositivo FROM partidas WHERE jugador_id = ?', [$jugador]);
            $a = Db::fila('SELECT dispositivo FROM partida_activa WHERE jugador_id = ?', [$jugador]);
            $rev = $p ? (int) $p['rev'] : 0;
            if ($base === null) {
                // Juego viejo: solo si la cuenta nunca usó el juego con versión (si no, podría pisar avance nuevo)
                if (($p && $p['dispositivo'] !== null) || $a) {
                    error_log('EN VIVO partida: juego viejo sin versión rechazado (jugador ' . $jugador . ')');
                    throw self::conflicto($jugador, 'partida_desactualizada', null);
                }
            } else {
                if ($rev !== $base) throw self::conflicto($jugador, 'partida_desactualizada', $disp);
                if ($a && $a['dispositivo'] !== $disp && !$tomar) throw self::conflicto($jugador, 'otro_dispositivo', $disp);
            }
            $t = time();
            Db::q('INSERT INTO partidas (jugador_id, datos, actualizado, rev, dispositivo) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (jugador_id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado, rev = excluded.rev, dispositivo = excluded.dispositivo',
                [$jugador, $datos, $t, $rev + 1, $disp]);
            if ($disp !== null && (!$a || $a['dispositivo'] !== $disp)) self::marcarActivo($jugador, $disp, $t);
            return ['ok' => true, 'actualizado' => Db::iso($t), 'rev' => $rev + 1];
        });
    }

    /**
     * POST /api/partida/activar {base, dispositivo}: este dispositivo pasa a ser el activo (los demás dejan de guardar).
     * Solo si su partida está al día (base = versión de la nube); si no → 409 partida_desactualizada (primero debe
     * cargar la más nueva o elegir cuál quiere).
     */
    public static function activar(int $jugador, array $in): array
    {
        $disp = self::dispositivo($in['dispositivo'] ?? null);
        $base = self::base($in['base'] ?? null);
        if ($disp === null || $base === null) throw new Fallo('Falta la versión o el dispositivo de la partida.', 400, ['codigo' => 'partida_invalida']);
        Db::tx(function () use ($jugador, $disp, $base): void {
            $rev = (int) (Db::valor('SELECT rev FROM partidas WHERE jugador_id = ?', [$jugador]) ?? 0);
            if ($rev !== $base) throw self::conflicto($jugador, 'partida_desactualizada', $disp);
            self::marcarActivo($jugador, $disp, time());
        });
        return ['ok' => true] + self::meta($jugador, $disp);
    }

    private static function marcarActivo(int $jugador, string $disp, int $t): void
    {
        Db::q('INSERT INTO partida_activa (jugador_id, dispositivo, desde) VALUES (?, ?, ?)
               ON CONFLICT (jugador_id) DO UPDATE SET dispositivo = excluded.dispositivo, desde = excluded.desde
               WHERE partida_activa.dispositivo <> excluded.dispositivo', [$jugador, $disp, $t]);
    }
}
