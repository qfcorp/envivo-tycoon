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
 *  - Avance (stats.events, luego day, luego chapter): una partida con MENOS avance que la de la nube nunca la
 *    reemplaza (409 partida_retroceso, ni con "tomar"; un juego viejo con una partida del día 28 pisó la del día 72).
 *    Con MÁS avance se guarda aunque `base` esté vieja o haya otro aparato activo (se jugó sin internet), salvo justo
 *    después de restaurar desde el panel. Volver atrás: solo el Centro de Control ("Restaurar esta"). Excepción:
 *    `nueva: true` (partida nueva tras la quiebra) solo si la de la nube tiene gameOver: true, con base y dispositivo al día.
 *  - Versión del juego: guardar y tomar la partida piden X-EnVivo-Version >= MIN_CLIENTE (si no, 426 cliente_viejo).
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
        $empezar = ($in['nueva'] ?? false) === true;   // partida nueva después de la quiebra (el juego reinicia en el día 1)
        return Db::tx(function () use ($jugador, $datos, $base, $disp, $tomar, $empezar): array {
            $p = Db::fila("SELECT rev, dispositivo, actualizado, CASE WHEN json_valid(datos) THEN json_type(datos, '$.gameOver') END AS fin, " . self::RESUMEN_SQL . ' FROM partidas WHERE jugador_id = ?', [$jugador]);
            $a = Db::fila('SELECT dispositivo FROM partida_activa WHERE jugador_id = ?', [$jugador]);
            $rev = $p ? (int) $p['rev'] : 0;
            $nueva = self::resumenDe($datos);
            $avance = $p ? self::compararAvance($nueva, $p) : 0;
            // Única excepción del juego: la partida de la nube terminó en quiebra (gameOver: true) y el jugador empezó otra
            // ("nueva": true). Igual rigen base y dispositivo; la terminada queda en el historial (motivo 'nueva').
            $reinicio = $empezar && $p && ($p['fin'] ?? null) === 'true';
            if ($reinicio && $avance < 0) $avance = 0;
            // Nunca se reemplaza la partida con una de MENOS avance (ni con "tomar"): un juego viejo en la caché de un
            // celular, con una partida del día 28, pisó la del día 72. Volver atrás solo desde el Centro de Control.
            if ($avance < 0) {
                throw new Fallo('La partida de la nube tiene más avance que la de este aparato. Se va a cargar la de la nube.', 409, [
                    'codigo' => 'partida_retroceso', 'nube' => self::meta($jugador, $disp),
                    'actual' => self::resumenSalida($p) + ['actualizado' => Db::iso((int) $p['actualizado'])],
                    'nueva' => self::resumenSalida($nueva) + ['actualizado' => null]]);
            }
            // Con MÁS avance (p. ej. se jugó sin internet con una versión vieja) se guarda aunque la versión o el aparato
            // activo no coincidan: decide el avance, no la versión. La que se pisa queda en el historial (otro_avance).
            // Salvo justo después de restaurar desde el panel: hasta que un aparato cargue la restaurada (base al día), manda la versión.
            $porAvance = false;
            if ($avance === 0 || ($p && $p['dispositivo'] === self::DISP_PANEL)) {
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
            } else {
                $porAvance = $base === null ? (($p && $p['dispositivo'] !== null) || $a) : ($rev !== $base || ($a && $a['dispositivo'] !== $disp && !$tomar));
            }
            $t = time();
            if ($p) self::alHistorial($jugador, $t, $reinicio ? 'nueva' : (self::menos($p['fama'], $nueva['fama'] ?? null) ? 'retroceso' : ($porAvance ? 'otro_avance' : ($tomar ? 'tomar' : 'guardado'))));
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
    /** Tope de especiales (tomar / retroceso / otro_avance / nueva / antes_de_restaurar) por jugador, para que la tabla no crezca sin fin. */
    public const HIST_MAX_ESPECIALES = 100;
    /** Código que queda como "dispositivo" de una versión restaurada desde el panel (ninguna pestaña la toma como suya). */
    public const DISP_PANEL = 'panel_restaurar';

    /** Columnas de resumen sacadas del JSON de `datos` (día, fama, dinero, eventos, capítulo). */
    private const RESUMEN_SQL = "CASE WHEN json_valid(datos) THEN json_extract(datos, '$.day') END AS dia,
        CASE WHEN json_valid(datos) THEN json_extract(datos, '$.rep') END AS fama,
        CASE WHEN json_valid(datos) THEN json_extract(datos, '$.money') END AS dinero,
        CASE WHEN json_valid(datos) THEN json_extract(datos, '$.stats.events') END AS eventos,
        CASE WHEN json_valid(datos) THEN json_extract(datos, '$.chapter') END AS capitulo";

    /** Resumen de una partida en texto JSON (ya validado). */
    private static function resumenDe(string $datos): array
    {
        return Db::fila('SELECT ' . self::RESUMEN_SQL . ' FROM (SELECT ? AS datos)', [$datos]) ?? [];
    }

    /** Resumen para la respuesta: números (o null si la partida no lo trae). */
    private static function resumenSalida(array $r): array
    {
        $o = [];
        foreach (['dia', 'fama', 'dinero', 'eventos', 'capitulo'] as $k) $o[$k] = is_numeric($r[$k] ?? null) ? $r[$k] + 0 : null;
        return $o;
    }

    private static function menos(mixed $antes, mixed $ahora): bool
    {
        return is_numeric($antes) && is_numeric($ahora) && (float) $ahora < (float) $antes;
    }

    /**
     * Compara el avance de dos partidas: primero los eventos jugados (stats.events), luego el día y luego el capítulo.
     * 1 = $a tiene más, -1 = menos, 0 = igual (o no se puede comparar: falta el dato en alguna).
     */
    private static function compararAvance(array $a, array $b): int
    {
        foreach (['eventos', 'dia', 'capitulo'] as $k) {
            if (!is_numeric($a[$k] ?? null) || !is_numeric($b[$k] ?? null)) continue;
            $c = (float) $a[$k] <=> (float) $b[$k];
            if ($c !== 0) return $c;
        }
        return 0;
    }

    // ------------------------------------------------------------------------------------- versión mínima del juego
    /**
     * Versión mínima del juego que puede guardar o tomar la partida (la VERSION de sw.js, que js/api.js manda en la
     * cabecera X-EnVivo-Version). Un juego viejo en la caché de un celular pisó una partida con mucho más avance.
     * Se cambia con ENVIVO_MIN_CLIENTE en config.env ("no" la apaga). Subirla cuando el juego nuevo ya esté publicado.
     */
    public const MIN_CLIENTE = 'envivo-v47';

    /** Número de una versión del juego ("envivo-v47" -> 47), o null si no es válida. */
    public static function numeroVersion(mixed $v): ?int
    {
        return is_string($v) && preg_match('/^envivo-v(\d{1,6})$/', trim($v), $m) ? (int) $m[1] : null;
    }

    /** POST /api/partida y /api/partida/activar: juego más viejo que el mínimo (o sin versión) -> 426 cliente_viejo. */
    public static function exigirCliente(mixed $version): void
    {
        $min = trim(Config::get('ENVIVO_MIN_CLIENTE', self::MIN_CLIENTE));
        if (in_array(strtolower($min), ['no', '0', 'ninguna'], true)) return;
        $nMin = self::numeroVersion($min);
        if ($nMin === null) { error_log('EN VIVO partida: ENVIVO_MIN_CLIENTE no válido (' . mb_substr($min, 0, 40) . '), se usa ' . self::MIN_CLIENTE); $nMin = (int) self::numeroVersion(self::MIN_CLIENTE); }
        $n = self::numeroVersion($version);
        if ($n === null || $n < $nMin) throw new Fallo('Hay una versión nueva del juego. Se va a actualizar.', 426, ['codigo' => 'cliente_viejo', 'minima' => 'envivo-v' . $nMin]);
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
