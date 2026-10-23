<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Días temáticos de la preparación de la Copa de Servidores (como la preparación del KvK de Kingshot). Conexión y reglas:
 * server/INTEGRAR_EDAD_SERVIDOR.md §2. Hora de Ecuador (America/Guayaquil), el día lo marca cuándo se PIDIÓ el evento.
 *
 *   lunes      construccion  Las obras de la sede oficial que terminan hoy dan puntos de preparación DOBLES.
 *   martes     personal      Eventos de copa con el personal ideal completo: ×1,5.
 *   miércoles  equipos       Eventos de copa con todos los equipos que pide el contrato: ×1,5.
 *   jueves     en_linea      Todos los eventos de copa validados: ×1,5.
 *   viernes    total         Todo cuenta: personal ideal +25 %, equipos completos +25 % y obras de la sede (normales).
 *
 * ANTI-TRAMPAS: todo sale de fuentes que el servidor ya validó.
 *  - "Personal ideal" y "equipos completos" se leen de la REPETICIÓN del validador (detalle.partes de Repeticion::validar,
 *    las partes de la calidad que calculó js/logic.js con el equipo REGISTRADO en el servidor), nunca de lo que dice el juego.
 *    Sin partes (validador viejo o de prueba) no hay bono. Intento sospechoso (el juego dijo otro resultado): sin bono.
 *  - Las obras son de la sede OFICIAL (tabla sede_obras: el servidor fija cuándo terminan). Cuentan si el jugador registró
 *    su equipo de copa y es de un servidor de la copa; máximo OBRAS_DIA por día; cada obra suma una sola vez
 *    (copa_aportes.ref = 'obra:<id>' UNIQUE). Se suman en la tarea programada y al abrir la copa.
 *  - El bono de ventajas pagadas (Copas::bonoVentajas) NO se multiplica.
 */
final class CopaTemas
{
    /** Día ISO (1 = lunes … 5 = viernes) → tema. intentos = factor de todos los eventos; personal/equipos = se suman al factor si se cumple; obras = factor de las obras. */
    public const TEMAS = [
        1 => ['clave' => 'construccion', 'nombre' => 'Día de construcción', 'intentos' => 1.0, 'personal' => 0.0, 'equipos' => 0.0, 'obras' => 2,
              'cuenta' => 'Las obras de tu sede oficial que terminan hoy dan puntos dobles. Los eventos de copa suman normal.'],
        2 => ['clave' => 'personal', 'nombre' => 'Día de personal', 'intentos' => 1.0, 'personal' => 0.5, 'equipos' => 0.0, 'obras' => 0,
              'cuenta' => 'Eventos de copa con el personal ideal completo (cada puesto cubierto): ×1,5.'],
        3 => ['clave' => 'equipos', 'nombre' => 'Día de equipos', 'intentos' => 1.0, 'personal' => 0.0, 'equipos' => 0.5, 'obras' => 0,
              'cuenta' => 'Eventos de copa con todos los equipos que pide el contrato (cámaras, switcher, audio, transmisión): ×1,5.'],
        4 => ['clave' => 'en_linea', 'nombre' => 'Día de eventos en línea', 'intentos' => 1.5, 'personal' => 0.0, 'equipos' => 0.0, 'obras' => 0,
              'cuenta' => 'Todos tus eventos de copa validados: ×1,5.'],
        5 => ['clave' => 'total', 'nombre' => 'Día total', 'intentos' => 1.0, 'personal' => 0.25, 'equipos' => 0.25, 'obras' => 1,
              'cuenta' => 'Todo cuenta: personal ideal +25 %, equipos completos +25 % y las obras de la sede.'],
    ];
    public const FACTOR_MAX = 1.5;
    public const OBRA_PUNTOS = ['mejora' => 15, 'nivel' => 40];
    public const OBRAS_DIA = 6;
    public const CAMARAS_MIN = 20;   // de 25 (parte.camaras): casi todas las posiciones con su cámara ideal

    /** Partes de la calidad (js/logic.js computeQuality, 3.er elemento = clave) que dicen que faltó personal. */
    public const FALTA_PERSONAL = ['parte.falta_rol', 'parte.justo_rol', 'parte.switcher_sin_director', 'parte.consola_sin_sonidista',
        'parte.equipo_sin_tecnico', 'parte.repeticiones_sin_operador', 'parte.graficos_sin_operador', 'parte.sin_shader', 'parte.sin_operador'];
    /** …y las que dicen que faltó un equipo (más cualquier 'bloq.*': una cámara que no se pudo usar). */
    public const FALTA_EQUIPO = ['parte.sin_switcher', 'parte.sin_consola', 'parte.sin_equipo_transmision', 'parte.sin_repeticiones',
        'parte.sin_graficos', 'parte.sin_intercom'];

    private static function zona(): \DateTimeZone { return new \DateTimeZone(Copas::ZONA); }

    /** Día ISO (1..7) en Ecuador. */
    public static function diaSemana(int $t): int
    {
        return (int) (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona())->format('N');
    }

    /** Tema del día de $t (null el sábado y el domingo). */
    public static function de(int $t): ?array
    {
        $n = self::diaSemana($t);
        return isset(self::TEMAS[$n]) ? self::TEMAS[$n] + ['n' => $n] : null;
    }

    /** Claves de las partes de la repetición del validador; [] si no vienen bien formadas (entonces no hay bono). */
    public static function partes(array $r): array
    {
        $p = $r['detalle']['partes'] ?? null;
        if (!is_array($p) || !$p || !array_is_list($p)) return [];
        $o = [];
        foreach ($p as $x) {
            if (!is_array($x) || !is_string($x[2] ?? null)) return [];
            $o[] = ['k' => $x[2], 'pts' => is_numeric($x[1] ?? null) ? (float) $x[1] : 0.0];
        }
        return in_array('parte.base', array_column($o, 'k'), true) ? $o : [];
    }

    public static function personalCompleto(array $partes): bool
    {
        if (!$partes) return false;
        foreach ($partes as $x) if (in_array($x['k'], self::FALTA_PERSONAL, true)) return false;
        return true;
    }

    public static function equiposCompletos(array $partes): bool
    {
        if (!$partes) return false;
        $cam = null;
        foreach ($partes as $x) {
            if (in_array($x['k'], self::FALTA_EQUIPO, true) || str_starts_with($x['k'], 'bloq.')) return false;
            if ($x['k'] === 'parte.camaras') $cam = $x['pts'];
        }
        return $cam !== null && $cam >= self::CAMARAS_MIN;
    }

    /**
     * Factor del tema para un intento pedido en $creado con la respuesta $r del validador.
     * $confiable = el validador dio el intento por bueno (o fue otra versión de la lógica, que no es trampa).
     * @return array{x: float, tema: ?string, motivos: list<string>}
     */
    public static function factor(int $creado, array $r, bool $confiable): array
    {
        $T = self::de($creado);
        if ($T === null || !$confiable) return ['x' => 1.0, 'tema' => $T['clave'] ?? null, 'motivos' => []];
        $x = (float) $T['intentos'];
        $mot = $x > 1.0 ? [$T['clave']] : [];
        if ($T['personal'] > 0 || $T['equipos'] > 0) {
            $p = self::partes($r);
            if ($T['personal'] > 0 && self::personalCompleto($p)) { $x += $T['personal']; $mot[] = 'personal'; }
            if ($T['equipos'] > 0 && self::equiposCompletos($p)) { $x += $T['equipos']; $mot[] = 'equipos'; }
        }
        return ['x' => min(self::FACTOR_MAX, $x), 'tema' => $T['clave'], 'motivos' => $mot];
    }

    /** Puntos de un intento con el tema del día (Copas::aplicar). $base = Copas::puntosIntento(calidad, estrellas). */
    public static function puntosIntento(int $base, int $creado, array $r, bool $confiable): int
    {
        return (int) round($base * self::factor($creado, $r, $confiable)['x']);
    }

    // ------------------------------------------------------------------ obras de la sede oficial (lunes ×2, viernes ×1)
    private static function hayTabla(string $t): bool { return (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]); }

    /** Días de la semana de la copa con obras: [[inicio, fin, factor]]. */
    private static function diasObras(int $lunes): array
    {
        $d0 = (new \DateTimeImmutable('@' . $lunes))->setTimezone(self::zona())->setTime(0, 0);
        $o = [];
        foreach (self::TEMAS as $n => $T) {
            if ($T['obras'] <= 0) continue;
            $o[] = [$d0->modify('+' . ($n - 1) . ' days')->getTimestamp(), $d0->modify('+' . $n . ' days')->getTimestamp(), (int) $T['obras']];
        }
        return $o;
    }

    /**
     * Suma (una sola vez) las obras de la sede oficial terminadas en los días con obras de las copas en preparación.
     * Con $jugador solo las suyas (al abrir la copa). Devuelve cuántos aportes nuevos hubo.
     */
    public static function sumarObras(?int $jugador = null): int
    {
        if (!self::hayTabla('sede_obras') || !self::hayTabla('copa_aportes')) return 0;
        $t = Copas::ahora();
        $n = 0;
        foreach (Db::todas("SELECT * FROM copas WHERE fase = 'preparacion' ORDER BY id") as $c) {
            $sem = Copas::semana((int) $c['inicio']);
            if ($t >= $sem['sabado'] || $t < (int) $c['inicio']) continue;
            if (Db::valor("SELECT 1 FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$c['id']])) continue;
            $ids = array_map('intval', array_column(Db::todas('SELECT servidor_id FROM copa_servidores WHERE copa_id = ?', [$c['id']]), 'servidor_id'));
            if (!$ids) continue;
            $nuevos = 0;
            foreach (self::diasObras((int) $c['inicio']) as [$ini, $fin, $x]) {
                if ($t < $ini) continue;
                $hasta = min($fin, $t + 1);
                $par = [$c['id'], $ini, $hasta];
                $sql = "SELECT o.id, o.jugador_id, o.tipo, o.fin, j.servidor_id FROM sede_obras o JOIN jugadores j ON j.id = o.jugador_id
                        JOIN copa_equipos e ON e.copa_id = ? AND e.jugador_id = o.jugador_id
                        WHERE o.fin >= ? AND o.fin < ? AND j.servidor_id IN (" . implode(',', $ids) . ")
                          AND NOT EXISTS (SELECT 1 FROM copa_aportes a WHERE a.ref = 'obra:' || o.id)";
                if ($jugador !== null) { $sql .= ' AND o.jugador_id = ?'; $par[] = $jugador; }
                foreach (Db::todas($sql . ' ORDER BY o.fin, o.id LIMIT 500', $par) as $o) {
                    $pts = (self::OBRA_PUNTOS[$o['tipo']] ?? 0) * $x;
                    if ($pts <= 0) continue;
                    $ok = Db::tx(function () use ($c, $o, $ini, $fin, $pts): bool {
                        $ya = (int) Db::valor("SELECT COUNT(*) FROM copa_aportes WHERE copa_id = ? AND jugador_id = ? AND fuente = 'obra' AND creado >= ? AND creado < ?",
                            [$c['id'], $o['jugador_id'], $ini, $fin]);
                        if ($ya >= self::OBRAS_DIA) return false;
                        $asoc = Db::valor('SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?', [$o['jugador_id']]);
                        return Db::q("INSERT OR IGNORE INTO copa_aportes (copa_id, jugador_id, servidor_id, asociacion_id, puntos, fuente, ref, creado) VALUES (?, ?, ?, ?, ?, 'obra', ?, ?)",
                            [$c['id'], $o['jugador_id'], $o['servidor_id'], $asoc === null ? null : (int) $asoc, $pts, 'obra:' . $o['id'], (int) $o['fin']])->rowCount() > 0;
                    });
                    if ($ok) $nuevos++;
                }
            }
            if ($nuevos) Copas::recalcularPrep((int) $c['id']);
            $n += $nuevos;
        }
        return $n;
    }

    // ------------------------------------------------------------------ para la pantalla
    /** Los 5 días de preparación de la semana de $t: [{n, clave, nombre, cuenta, fecha, hoy, pasado}]. */
    public static function semanaJson(int $t): array
    {
        $hoy = (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona())->setTime(0, 0);
        $lunes = $hoy->modify('-' . ((int) $hoy->format('N') - 1) . ' days');
        $o = [];
        foreach (self::TEMAS as $n => $T) {
            $d = $lunes->modify('+' . ($n - 1) . ' days');
            $o[] = ['n' => $n, 'clave' => $T['clave'], 'nombre' => $T['nombre'], 'cuenta' => $T['cuenta'], 'fecha' => $d->format('Y-m-d'),
                    'hoy' => $d == $hoy, 'pasado' => $d < $hoy];
        }
        return $o;
    }

    /** Lo que agrega Copas::estado: tema de hoy, la semana y lo que el jugador lleva hoy por obras. */
    public static function estadoJson(int $copa, int $jugador, int $t): array
    {
        $T = self::de($t);
        $hoy = (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona())->setTime(0, 0);
        $obras = ['puntos' => 0, 'cuantas' => 0, 'max' => self::OBRAS_DIA];
        if ($T !== null && $T['obras'] > 0) {
            $f = Db::fila("SELECT COUNT(*) AS n, COALESCE(SUM(puntos), 0) AS p FROM copa_aportes WHERE copa_id = ? AND jugador_id = ? AND fuente = 'obra' AND creado >= ? AND creado < ?",
                [$copa, $jugador, $hoy->getTimestamp(), $hoy->modify('+1 day')->getTimestamp()]);
            $obras = ['puntos' => (int) ($f['p'] ?? 0), 'cuantas' => (int) ($f['n'] ?? 0), 'max' => self::OBRAS_DIA];
        }
        return [
            'hoy' => $T === null ? null : ['n' => $T['n'], 'clave' => $T['clave'], 'nombre' => $T['nombre'], 'cuenta' => $T['cuenta'],
                'intentos' => $T['intentos'], 'personal' => $T['personal'], 'equipos' => $T['equipos'], 'obras' => $T['obras'], 'max' => self::FACTOR_MAX],
            'semana' => self::semanaJson($t),
            'obras' => $obras + ['puntos_mejora' => self::OBRA_PUNTOS['mejora'], 'puntos_nivel' => self::OBRA_PUNTOS['nivel']],
        ];
    }
}
