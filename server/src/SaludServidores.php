<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Salud de cada servidor (server/COPAS.md §3). Una foto por día en servidor_salud (cron diario bin/salud_servidores.php).
 *
 * Activo en un día = el jugador entró ese día. Se juntan (sin repetir) las fuentes que haya:
 *   1. actividad_diaria (módulo Universos: dia, jugador_id, servidor_id, eventos) — cuenta en el servidor donde estaba;
 *   2. actividad (núcleo, Sesiones::actividad: 1 fila por jugador y día) — cuenta en el servidor actual del jugador;
 *   3. jugadores.ultimo_ingreso (último ingreso) — si cae dentro de la ventana.
 * activos_N = jugadores distintos activos en los últimos N días (incluido el día de la foto).
 *
 * Estado (umbrales en la tabla ajustes, editables en el Centro de Control):
 *   abandono: activos_14 < salud_abandono_activos14 (10), o activos_7 < salud_abandono_activos7 (5) esta semana Y la
 *             anterior (2 semanas seguidas). Un servidor con menos de salud_gracia_dias (14) días de vida nunca es abandono.
 *   bajo:     activos_7 < salud_bajo_activos7 (25), o caída > salud_bajo_caida_pct (40 %) contra la semana anterior.
 *   sano:     lo demás.
 * Cuando un servidor ENTRA en abandono (la foto anterior no era abandono) se arma un plan de fusión sugerido
 * (Fusiones::crearPlan, estado 'plan') y se deja un aviso 'servidor_abandono' para el Centro de Control. La fusión la
 * aprueba siempre una persona: aquí nunca se ejecuta nada.
 */
final class SaludServidores
{
    public const UMBRALES = [
        'salud_bajo_activos7' => 25,
        'salud_bajo_caida_pct' => 40,
        'salud_abandono_activos14' => 10,
        'salud_abandono_activos7' => 5,
        'salud_gracia_dias' => 14,
    ];
    public const ORDEN = ['abandono' => 0, 'bajo' => 1, 'sano' => 2];

    /** @return array<string,int> umbrales vigentes (ajustes, o el valor por defecto si no hay o no es un número) */
    public static function umbrales(): array
    {
        $o = [];
        foreach (self::UMBRALES as $k => $def) {
            $v = Ajustes::get($k);
            $o[$k] = preg_match('/^\d{1,6}$/', $v) ? (int) $v : $def;
        }
        return $o;
    }

    public static function tabla(string $t): bool
    {
        return (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]);
    }

    public static function hoy(): string { return date('Y-m-d'); }

    /** Día local anterior/siguiente: dia('2026-10-23', -6) = '2026-10-17'. */
    public static function dia(string $dia, int $mas): string
    {
        return (new \DateTimeImmutable($dia . ' 12:00:00'))->modify(($mas >= 0 ? '+' : '') . $mas . ' days')->format('Y-m-d');
    }

    private static function inicioDia(string $dia): int { return (int) strtotime($dia . ' 00:00:00'); }

    /**
     * Ids de los jugadores activos en el servidor entre $desde y $hasta (días, incluidos).
     * @return array<int,true>
     */
    public static function activosIds(int $servidor, string $desde, string $hasta): array
    {
        $ids = [];
        if (self::tabla('actividad_diaria')) {
            foreach (Db::todas('SELECT DISTINCT jugador_id FROM actividad_diaria WHERE servidor_id = ? AND dia BETWEEN ? AND ?', [$servidor, $desde, $hasta]) as $f) $ids[(int) $f['jugador_id']] = true;
        }
        foreach (Db::todas('SELECT DISTINCT a.jugador_id FROM actividad a JOIN jugadores j ON j.id = a.jugador_id WHERE j.servidor_id = ? AND a.dia BETWEEN ? AND ?', [$servidor, $desde, $hasta]) as $f) $ids[(int) $f['jugador_id']] = true;
        foreach (Db::todas('SELECT id FROM jugadores WHERE servidor_id = ? AND ultimo_ingreso >= ? AND ultimo_ingreso < ?', [$servidor, self::inicioDia($desde), self::inicioDia(self::dia($hasta, 1))]) as $f) $ids[(int) $f['id']] = true;
        return $ids;
    }

    /** Eventos jugados ese día en el servidor: actividad_diaria.eventos si existe; si no, intentos en línea de ese día. */
    public static function eventos(int $servidor, string $dia): int
    {
        if (self::tabla('actividad_diaria')) return (int) Db::valor('SELECT COALESCE(SUM(eventos), 0) FROM actividad_diaria WHERE servidor_id = ? AND dia = ?', [$servidor, $dia]);
        $a = self::inicioDia($dia); $b = self::inicioDia(self::dia($dia, 1));
        $n = 0;
        if (self::tabla('duelos')) $n += (int) Db::valor("SELECT COUNT(*) FROM duelos WHERE servidor_id = ? AND dia = ? AND estado = 'cerrado'", [$servidor, $dia]);
        if (self::tabla('desafio_intentos')) $n += (int) Db::valor("SELECT COUNT(*) FROM desafio_intentos WHERE servidor_id = ? AND dia = ? AND estado = 'valido'", [$servidor, $dia]);
        if (self::tabla('liga_intentos')) $n += (int) Db::valor("SELECT COUNT(*) FROM liga_intentos i JOIN jugadores j ON j.id = i.jugador_id WHERE j.servidor_id = ? AND i.estado IN ('validado', 'firmado') AND i.creado >= ? AND i.creado < ?", [$servidor, $a, $b]);
        if (self::tabla('festival_intentos')) $n += (int) Db::valor("SELECT COUNT(*) FROM festival_intentos i JOIN jugadores j ON j.id = i.jugador_id WHERE j.servidor_id = ? AND i.estado = 'validado' AND i.creado >= ? AND i.creado < ?", [$servidor, $a, $b]);
        return $n;
    }

    /** Mensajes de jugadores ese día en el chat del servidor y en el de sus asociaciones. */
    public static function mensajes(int $servidor, string $dia): int
    {
        return (int) Db::valor("SELECT COUNT(*) FROM chat_mensajes WHERE jugador_id IS NOT NULL AND creado >= ? AND creado < ?
                                  AND (canal = ? OR canal IN (SELECT 'asociacion:' || id FROM asociaciones WHERE servidor_id = ?))",
            [self::inicioDia($dia), self::inicioDia(self::dia($dia, 1)), 'servidor:' . $servidor, $servidor]);
    }

    /** Mide un servidor en un día (sin guardar). */
    public static function medir(array $s, string $dia): array
    {
        $sid = (int) $s['id'];
        $u = self::umbrales();
        $a1 = count(self::activosIds($sid, $dia, $dia));
        $ids7 = self::activosIds($sid, self::dia($dia, -6), $dia);
        $a7 = count($ids7);
        $a14 = count(self::activosIds($sid, self::dia($dia, -13), $dia));
        $a30 = count(self::activosIds($sid, self::dia($dia, -29), $dia));
        $antes = count(self::activosIds($sid, self::dia($dia, -13), self::dia($dia, -7)));
        $tend = $antes > 0 ? (int) round(($a7 - $antes) * 100 / $antes) : null;
        $asocActivas = 0;
        foreach (Db::todas('SELECT a.id, GROUP_CONCAT(m.jugador_id) AS ids FROM asociaciones a JOIN asociacion_miembros m ON m.asociacion_id = a.id WHERE a.servidor_id = ? GROUP BY a.id', [$sid]) as $f) {
            foreach (explode(',', (string) $f['ids']) as $j) if (isset($ids7[(int) $j])) { $asocActivas++; break; }
        }
        $edad = (int) floor((self::inicioDia($dia) - (int) $s['creado']) / 86400) + 1;
        $motivo = null;
        if ($a14 < $u['salud_abandono_activos14']) { $estado = 'abandono'; $motivo = "activos 14 días: $a14 (< {$u['salud_abandono_activos14']})"; }
        elseif ($a7 < $u['salud_abandono_activos7'] && $antes < $u['salud_abandono_activos7']) { $estado = 'abandono'; $motivo = "activos 7 días: $a7 y $antes la semana anterior (< {$u['salud_abandono_activos7']} dos semanas)"; }
        else $estado = 'sano';
        if ($estado === 'abandono' && $edad < $u['salud_gracia_dias']) { $estado = 'sano'; $motivo = "servidor nuevo ($edad días): sin abandono hasta los {$u['salud_gracia_dias']} días"; }
        if ($estado === 'sano') {
            if ($a7 < $u['salud_bajo_activos7']) { $estado = 'bajo'; $motivo = trim(($motivo ? $motivo . '; ' : '') . "activos 7 días: $a7 (< {$u['salud_bajo_activos7']})"); }
            elseif ($tend !== null && -$tend > $u['salud_bajo_caida_pct']) { $estado = 'bajo'; $motivo = "caída de " . (-$tend) . " % contra la semana anterior (> {$u['salud_bajo_caida_pct']} %)"; }
        }
        return ['dia' => $dia, 'servidor_id' => $sid, 'activos_1' => $a1, 'activos_7' => $a7, 'activos_14' => $a14, 'activos_30' => $a30,
                'activos_7_antes' => $antes, 'tendencia_pct' => $tend, 'eventos' => self::eventos($sid, $dia), 'mensajes' => self::mensajes($sid, $dia),
                'asociaciones_activas' => $asocActivas, 'jugadores' => (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE servidor_id = ?', [$sid]),
                'estado' => $estado, 'motivo' => $motivo];
    }

    /**
     * Saca la foto de todos los servidores (no fusionados) para el día $dia (por defecto ayer, el último día completo).
     * Idempotente: repetir el mismo día reemplaza la fila. Devuelve ['dia', 'servidores' => [...], 'nuevos_abandono' => [ids], 'planes' => [ids]].
     */
    public static function foto(?string $dia = null, string $quien = 'vigilancia'): array
    {
        $dia ??= self::dia(self::hoy(), -1);
        Fallo::si(!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dia), 'Día no válido (YYYY-MM-DD).', 400, ['codigo' => 'dia_invalido']);
        $o = ['dia' => $dia, 'servidores' => [], 'nuevos_abandono' => [], 'planes' => []];
        foreach (Db::todas('SELECT * FROM servidores WHERE fusionado_en IS NULL AND creado < ? ORDER BY id', [self::inicioDia(self::dia($dia, 1))]) as $s) {
            $m = self::medir($s, $dia);
            $antes = Db::valor('SELECT estado FROM servidor_salud WHERE servidor_id = ? AND dia < ? ORDER BY dia DESC LIMIT 1', [$m['servidor_id'], $dia]);
            Db::q('INSERT INTO servidor_salud (dia, servidor_id, activos_1, activos_7, activos_14, activos_30, activos_7_antes, tendencia_pct, eventos, mensajes,
                   asociaciones_activas, jugadores, estado, motivo, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (dia, servidor_id) DO UPDATE SET activos_1 = excluded.activos_1, activos_7 = excluded.activos_7, activos_14 = excluded.activos_14,
                   activos_30 = excluded.activos_30, activos_7_antes = excluded.activos_7_antes, tendencia_pct = excluded.tendencia_pct, eventos = excluded.eventos,
                   mensajes = excluded.mensajes, asociaciones_activas = excluded.asociaciones_activas, jugadores = excluded.jugadores, estado = excluded.estado,
                   motivo = excluded.motivo, creado = excluded.creado',
                [$dia, $m['servidor_id'], $m['activos_1'], $m['activos_7'], $m['activos_14'], $m['activos_30'], $m['activos_7_antes'], $m['tendencia_pct'],
                 $m['eventos'], $m['mensajes'], $m['asociaciones_activas'], $m['jugadores'], $m['estado'], $m['motivo'], time()]);
            $m['antes'] = $antes;
            $o['servidores'][] = $m;
            if ($m['estado'] === 'abandono' && $antes !== 'abandono') {
                $o['nuevos_abandono'][] = $m['servidor_id'];
                $plan = self::avisarAbandono($s, $m, $quien);
                if ($plan !== null) $o['planes'][] = $plan;
            }
        }
        return $o;
    }

    /** Servidor que entra en abandono: plan sugerido (si hay destino y no hay ya uno pendiente) + aviso. Devuelve el id del plan o null. */
    private static function avisarAbandono(array $s, array $m, string $quien): ?int
    {
        $sid = (int) $s['id'];
        $pend = Db::valor("SELECT id FROM fusiones WHERE origen = ? AND estado IN ('plan', 'aprobada')", [$sid]);
        if ($pend !== null) return null;   // ya hay un plan esperando a una persona: no se repite el aviso
        $marca = $s['nombre'] . ' entró en ABANDONO el ' . $m['dia'];
        if (Db::valor("SELECT 1 FROM avisos WHERE tipo = 'servidor_abandono' AND substr(detalle, 1, ?) = ?", [mb_strlen($marca), $marca])) return null;   // misma foto repetida
        $dest = Fusiones::destinoSugerido($sid);
        $plan = null;
        $txt = $marca . ' (' . $m['motivo'] . '). Activos 1/7/14/30 días: '
             . $m['activos_1'] . '/' . $m['activos_7'] . '/' . $m['activos_14'] . '/' . $m['activos_30'] . '; ' . $m['jugadores'] . ' jugadores.';
        if ($dest !== null) {
            try {
                $plan = Fusiones::crearPlan($sid, (int) $dest['id'], $quien, true);
                $p = json_decode((string) Db::valor('SELECT plan_json FROM fusiones WHERE id = ?', [$plan]), true);
                $txt .= ' Plan sugerido N° ' . $plan . ': fusionar con ' . $dest['nombre'] . ' (' . ($p['resumen']['jugadores'] ?? 0) . ' jugadores, '
                      . ($p['resumen']['choques_alias'] ?? 0) . ' alias y ' . ($p['resumen']['choques_asociaciones'] ?? 0) . ' asociaciones a renombrar'
                      . (($p['bloqueos'] ?? []) ? '; espera: ' . implode(', ', array_column($p['bloqueos'], 'codigo')) : '') . '). Apruébalo o cancélalo en el Centro de Control > Servidores.';
            } catch (\Throwable $e) {
                $txt .= ' No se pudo armar el plan sugerido: ' . $e->getMessage();
            }
        } else {
            $txt .= ' No hay otro servidor abierto y más sano en su universo: no hay plan sugerido.';
        }
        Db::aviso('servidor_abandono', $txt);
        return $plan;
    }

    /** Última foto de un servidor (o null). */
    public static function ultima(int $servidor): ?array
    {
        $f = Db::fila('SELECT * FROM servidor_salud WHERE servidor_id = ? ORDER BY dia DESC LIMIT 1', [$servidor]);
        return $f ? self::filaJson($f) : null;
    }

    /** Estado de salud para decidir traslados: la última foto, o una medición de hoy si todavía no hay fotos. */
    public static function estadoActual(int $servidor): array
    {
        $u = self::ultima($servidor);
        if ($u !== null) return $u;
        $s = Db::fila('SELECT * FROM servidores WHERE id = ?', [$servidor]);
        return $s ? self::filaJson(self::medir($s, self::hoy())) : ['estado' => 'sano', 'activos_7' => 0];
    }

    private static function filaJson(array $f): array
    {
        $o = [];
        foreach (['activos_1', 'activos_7', 'activos_14', 'activos_30', 'activos_7_antes', 'eventos', 'mensajes', 'asociaciones_activas', 'jugadores'] as $k) $o[$k] = (int) ($f[$k] ?? 0);
        return ['dia' => $f['dia'], 'estado' => $f['estado'], 'motivo' => $f['motivo'] ?? null,
                'tendencia_pct' => isset($f['tendencia_pct']) ? (int) $f['tendencia_pct'] : null] + $o;
    }

    /**
     * Para la pestaña "Servidores" del Centro de Control: umbrales, cada servidor con su última foto y los últimos
     * $dias días (para el gráfico), y los planes de fusión pendientes / recientes.
     */
    public static function resumen(int $dias = 30): array
    {
        $dias = max(1, min($dias, 120));
        $desde = self::dia(self::hoy(), -$dias);   // los últimos $dias días completos (y hoy si ya hay foto)
        $cols = Migraciones::columnas('servidores') ?? [];
        $servs = [];
        foreach (Db::todas('SELECT s.*, (SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = s.id) AS n FROM servidores s ORDER BY s.id') as $s) {
            $hist = array_map(fn($f) => ['dia' => $f['dia'], 'activos_1' => (int) $f['activos_1'], 'activos_7' => (int) $f['activos_7'], 'activos_14' => (int) $f['activos_14'],
                'activos_30' => (int) $f['activos_30'], 'eventos' => (int) $f['eventos'], 'mensajes' => (int) $f['mensajes'], 'estado' => $f['estado']],
                Db::todas('SELECT * FROM servidor_salud WHERE servidor_id = ? AND dia >= ? ORDER BY dia', [$s['id'], $desde]));
            $servs[] = ['id' => (int) $s['id'], 'nombre' => $s['nombre'], 'universo_id' => isset($cols['universo_id']) && $s['universo_id'] !== null ? (int) $s['universo_id'] : null,
                'abierto' => (bool) (int) $s['abierto'], 'capacidad' => (int) $s['capacidad'], 'jugadores' => (int) $s['n'],
                'fusionado_en' => $s['fusionado_en'] !== null ? Db::iso((int) $s['fusionado_en']) : null,
                'fusionado_a' => $s['fusionado_a'] !== null ? (int) $s['fusionado_a'] : null,
                'salud' => self::ultima((int) $s['id']), 'historial' => $hist];
        }
        $planes = array_map(fn($f) => Fusiones::planJson($f, false),
            Db::todas("SELECT * FROM fusiones WHERE estado IN ('plan', 'aprobada') OR creado >= ? ORDER BY (estado IN ('plan', 'aprobada')) DESC, id DESC LIMIT 50", [time() - 90 * 86400]));
        return ['ok' => true, 'umbrales' => self::umbrales(), 'dias' => $dias, 'servidores' => $servs, 'fusiones' => $planes,
                'avisos' => array_map(fn($a) => ['id' => (int) $a['id'], 'detalle' => $a['detalle'], 'creado' => Db::iso((int) $a['creado'])],
                    Db::todas("SELECT * FROM avisos WHERE tipo = 'servidor_abandono' ORDER BY id DESC LIMIT 20"))];
    }
}
