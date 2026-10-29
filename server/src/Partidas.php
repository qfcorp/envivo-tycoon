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
 *  - Historial (migraciones/partidas_historial.sql): antes de pisar la partida, la versión anterior se copia a
 *    partidas_historial en la misma transacción (la del dueño, fama 100, quedó pisada por otro aparato con fama 9 y solo
 *    había los respaldos de la noche). El Centro de Control la lista y puede restaurar una (Partidas::restaurar).
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
            $p = Db::fila("SELECT rev, dispositivo, CASE WHEN json_valid(datos) THEN json_extract(datos, '$.rep') END AS rep,
                                  CASE WHEN json_valid(datos) THEN json_extract(datos, '$.day') END AS dia FROM partidas WHERE jugador_id = ?", [$jugador]);
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
            if ($p) self::alHistorial($jugador, $t, $tomar ? 'tomar' : (self::retrocede($p, $datos) ? 'retroceso' : 'guardado'));
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

    // ------------------------------------------------------------------------------------------- historial de versiones
    // migraciones/partidas_historial.sql. Antes de pisar la partida (guardar o restaurar desde el panel), en la MISMA
    // transacción, la versión anterior se copia a partidas_historial y se poda lo viejo de ese jugador.

    /** Cuántas versiones recientes se guardan siempre, días con "la más nueva de cada día" y días de las especiales. */
    public const HIST_ULTIMAS = 30;
    public const HIST_DIAS = 60;
    public const HIST_DIAS_ESPECIALES = 90;
    /** Tope de especiales (tomar / retroceso / antes_de_restaurar) por jugador, para que la tabla no crezca sin fin. */
    public const HIST_MAX_ESPECIALES = 100;
    /** Código que queda como "dispositivo" de una versión restaurada desde el panel (ninguna pestaña la toma como suya). */
    public const DISP_PANEL = 'panel_restaurar';

    /** ¿La partida nueva tiene menos fama (rep) o menos días (day) que la que va a pisar? */
    private static function retrocede(array $anterior, string $datos): bool
    {
        $n = Db::fila("SELECT json_extract(?, '$.rep') AS rep, json_extract(?, '$.day') AS dia", [$datos, $datos]);
        $menos = fn($viejo, $nuevo) => is_numeric($viejo) && is_numeric($nuevo) && (float) $nuevo < (float) $viejo;
        return $menos($anterior['rep'] ?? null, $n['rep'] ?? null) || $menos($anterior['dia'] ?? null, $n['dia'] ?? null);
    }

    /** Copia la partida actual del jugador al historial (si hay) y poda. Llamar dentro de Db::tx. */
    private static function alHistorial(int $jugador, int $t, string $motivo): void
    {
        Db::q('INSERT INTO partidas_historial (jugador_id, rev, datos, actualizado, dispositivo, guardado_en, motivo)
               SELECT jugador_id, rev, datos, actualizado, dispositivo, ?, ? FROM partidas WHERE jugador_id = ?', [$t, $motivo, $jugador]);
        self::podar($jugador, $t);
    }

    /**
     * Borra del historial del jugador lo que ya no hace falta. Se queda con: las últimas 30 versiones; la más nueva de
     * cada día (hora del juego, ENVIVO_ZONA) de los últimos 60 días; y las especiales (motivo ≠ 'guardado') de los
     * últimos 90 días (máximo 100). Una sola consulta sobre las filas de ESE jugador (índice jugador_id, id).
     */
    public static function podar(int $jugador, ?int $t = null): int
    {
        $t ??= time();
        return Db::q("DELETE FROM partidas_historial WHERE jugador_id = :j0 AND id NOT IN (
                SELECT id FROM (SELECT id FROM partidas_historial WHERE jugador_id = :j1 ORDER BY id DESC LIMIT " . self::HIST_ULTIMAS . ")
                UNION SELECT MAX(id) FROM partidas_historial WHERE jugador_id = :j2 AND actualizado >= :t60 GROUP BY (actualizado + :off) / 86400
                UNION SELECT id FROM (SELECT id FROM partidas_historial WHERE jugador_id = :j3 AND motivo <> 'guardado' AND guardado_en >= :t90
                                      ORDER BY id DESC LIMIT " . self::HIST_MAX_ESPECIALES . "))",
            ['j0' => $jugador, 'j1' => $jugador, 'j2' => $jugador, 'j3' => $jugador, 't60' => $t - self::HIST_DIAS * 86400,
             'off' => (int) date('Z', $t), 't90' => $t - self::HIST_DIAS_ESPECIALES * 86400])->rowCount();
    }

    /**
     * Versiones guardadas del jugador (la más nueva primero), sin los datos completos: fama (rep), día (day) y dinero
     * (money) sacados del JSON. Para el Centro de Control.
     * @return list<array{id:int,rev:int,actualizado:int,dispositivo:?string,guardado_en:int,motivo:string,rep:mixed,dia:mixed,dinero:mixed,tam:int}>
     */
    public static function historial(int $jugador, int $limite = 200): array
    {
        $filas = Db::todas("SELECT id, rev, actualizado, dispositivo, guardado_en, motivo, length(datos) AS tam,
                CASE WHEN json_valid(datos) THEN json_extract(datos, '$.rep') END AS rep,
                CASE WHEN json_valid(datos) THEN json_extract(datos, '$.day') END AS dia,
                CASE WHEN json_valid(datos) THEN json_extract(datos, '$.money') END AS dinero
            FROM partidas_historial WHERE jugador_id = ? ORDER BY id DESC LIMIT " . max(1, min(1000, $limite)), [$jugador]);
        return array_map(fn($f) => ['id' => (int) $f['id'], 'rev' => (int) $f['rev'], 'actualizado' => (int) $f['actualizado'], 'dispositivo' => $f['dispositivo'],
            'guardado_en' => (int) $f['guardado_en'], 'motivo' => (string) $f['motivo'], 'rep' => $f['rep'], 'dia' => $f['dia'], 'dinero' => $f['dinero'], 'tam' => (int) $f['tam']], $filas);
    }

    /** La partida actual (sin los datos) con fama, día y dinero, o null si no hay. Para el Centro de Control. */
    public static function actual(int $jugador): ?array
    {
        $f = Db::fila("SELECT rev, actualizado, dispositivo, length(datos) AS tam,
                CASE WHEN json_valid(datos) THEN json_extract(datos, '$.rep') END AS rep,
                CASE WHEN json_valid(datos) THEN json_extract(datos, '$.day') END AS dia,
                CASE WHEN json_valid(datos) THEN json_extract(datos, '$.money') END AS dinero
            FROM partidas WHERE jugador_id = ?", [$jugador]);
        return $f ? ['rev' => (int) $f['rev'], 'actualizado' => (int) $f['actualizado'], 'dispositivo' => $f['dispositivo'], 'tam' => (int) $f['tam'],
            'rep' => $f['rep'], 'dia' => $f['dia'], 'dinero' => $f['dinero']] : null;
    }

    /**
     * Centro de Control: "Restaurar esta". La versión $historialId del historial del jugador pasa a ser la partida actual
     * con rev = rev actual + 1 (la actual va antes al historial con motivo 'antes_de_restaurar'). Se borra el dispositivo
     * activo: cada aparato, al revisar la nube, ve una versión más nueva que la suya (rev > base) y la carga (el flujo de
     * siempre de "partida más nueva"); ninguna pestaña puede pisarla porque su base quedó vieja. Queda en la auditoría.
     * @return array{rev:int, de_rev:int}
     */
    public static function restaurar(int $jugador, int $historialId, string $quien): array
    {
        return Db::tx(function () use ($jugador, $historialId, $quien): array {
            $h = Db::fila('SELECT id, rev, datos, actualizado FROM partidas_historial WHERE id = ? AND jugador_id = ?', [$historialId, $jugador]);
            Fallo::si(!$h, 'Esa versión no está en el historial de este jugador.', 404);
            $rev = (int) (Db::valor('SELECT rev FROM partidas WHERE jugador_id = ?', [$jugador]) ?? 0);
            $t = time();
            self::alHistorial($jugador, $t, 'antes_de_restaurar');
            // DISP_PANEL (no null): con dispositivo null un juego viejo sin versión podría volver a pisarla
            Db::q('INSERT INTO partidas (jugador_id, datos, actualizado, rev, dispositivo) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (jugador_id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado, rev = excluded.rev, dispositivo = excluded.dispositivo',
                [$jugador, $h['datos'], $t, $rev + 1, self::DISP_PANEL]);
            Db::q('DELETE FROM partida_activa WHERE jugador_id = ?', [$jugador]);
            $r = Db::fila("SELECT CASE WHEN json_valid(?) THEN json_extract(?, '$.rep') END AS rep, CASE WHEN json_valid(?) THEN json_extract(?, '$.day') END AS dia",
                [$h['datos'], $h['datos'], $h['datos'], $h['datos']]);
            Auditoria::anotar($quien, 'partida_restaurar', 'Restauró la versión rev ' . (int) $h['rev'] . ' del ' . date('d/m/Y H:i', (int) $h['actualizado'])
                . ' (fama ' . ($r['rep'] ?? '—') . ', día ' . ($r['dia'] ?? '—') . ') como rev ' . ($rev + 1) . '; la anterior (rev ' . $rev . ') quedó en el historial. Se borró el dispositivo activo.', $jugador);
            return ['rev' => $rev + 1, 'de_rev' => (int) $h['rev']];
        });
    }

    private static function marcarActivo(int $jugador, string $disp, int $t): void
    {
        Db::q('INSERT INTO partida_activa (jugador_id, dispositivo, desde) VALUES (?, ?, ?)
               ON CONFLICT (jugador_id) DO UPDATE SET dispositivo = excluded.dispositivo, desde = excluded.desde
               WHERE partida_activa.dispositivo <> excluded.dispositivo', [$jugador, $disp, $t]);
    }
}
