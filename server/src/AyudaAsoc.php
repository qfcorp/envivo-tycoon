<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Asociación al estilo Kingshot: ayudas de un toque, Investigación con donaciones y Tienda de fichas. Todo gratis
 * (free-to-play): nada aquí se compra con dinero real ni con créditos.
 *
 * - Ayudas: las da SedeOficial::ayudar (una sola regla: −1 % de la obra o 5 minutos, lo mayor). Este módulo agrega:
 *   · "Pedir ayuda": el dueño de una obra la muestra a su asociación (ayuda_asoc_pedidos, una vez por obra).
 *   · "Ayudar a todos (N)": un toque ayuda en todos los pedidos pendientes (cada uno por SedeOficial::ayudar).
 *   · Tope por obra de 10 a 20: 10 + (nivel de la asociación − 1) + nivel de la investigación "Refuerzos".
 *   · Fichas de asociación para el que ayuda: 1 por ayuda, máximo FICHAS_AYUDA_DIA por día.
 *   · Anti cuentas alternas: solo cuenta quien lleva más de 24 h en la asociación (ayudar, donar y ganar fichas).
 * - Investigación: los socios donan dinero del juego (lo descuenta el juego y manda pagado_en_juego: true, como al crear
 *   una asociación; tope DONAR['dinero']['dia'] por día) o materiales de la sede oficial (el servidor los descuenta).
 *   Cada donación suma puntos al nivel de la tecnología elegida y a los puntos de la asociación (su nivel, 1 a 6) y da
 *   fichas al que dona (tope diario). Efectos: bonos($j) (los aplica el juego: js/ayuda_asoc.js) y topeAyudas().
 * - Tienda: artículos fijos con fichas (materiales, aceleradores de obra, insignia cosmética), con tope por día.
 * Reloj y día: los de SedeOficial (ahora(), dia()), así las pruebas lo congelan igual. Errores: Fallo con 'codigo'.
 * Auditoría: libro de fichas, tablas de donaciones y compras, y una línea en `auditoria` por donación, compra,
 * "ayudar a todos" y nivel de investigación subido.
 */
final class AyudaAsoc
{
    public const ANTIGUEDAD_SEG = 86400;   // 24 h en la asociación para que cuente
    public const TOPE_MIN = 10;
    public const TOPE_MAX = 20;

    /** Puntos de la asociación para cada nivel (1 a 6). Cada nivel sobre el 1 da +1 ayuda por obra. */
    public const NIVELES = [1 => 0, 2 => 600, 3 => 1800, 4 => 4000, 5 => 8000, 6 => 14000];

    /** Investigación: efecto por nivel y puntos para pasar de cada nivel al siguiente. */
    public const TECH = [
        'paga_eventos' => ['max' => 5, 'efecto' => 2, 'costos' => [400, 900, 1600, 2600, 4000]],   // +2 % de pago de eventos por nivel
        'reparacion' => ['max' => 3, 'efecto' => 5, 'costos' => [500, 1300, 2600]],              // −5 % costo de reparación por nivel
        'refuerzos' => ['max' => 5, 'efecto' => 1, 'costos' => [300, 800, 1500, 2500, 4000]],    // +1 ayuda por obra por nivel
    ];

    /** Fichas por ayuda y tope del día. */
    public const FICHAS_AYUDA = 1;
    public const FICHAS_AYUDA_DIA = 20;

    /** Donaciones (paquetes fijos). */
    public const DONAR = [
        'dinero' => ['monto' => 2000, 'puntos' => 10, 'fichas' => 2, 'dia' => 5],   // $2.000 del juego, máximo 5 por día
        'material' => ['cantidad' => 10, 'puntos' => 10, 'fichas' => 2],            // 10 de un material común de la sede oficial
        'chips' => ['cantidad' => 1, 'puntos' => 15, 'fichas' => 3],                // 1 chip 4K
    ];
    public const DONACIONES_DIA = 15;      // donaciones por persona y día (todas juntas)
    public const FICHAS_DONAR_DIA = 30;    // fichas por donar, por día

    /** Tienda de la asociación: contenido fijo, a la vista. 'dia' = veces por día; 'una_vez' = solo una en la vida. */
    public const TIENDA = [
        'caja_materiales' => ['fichas' => 30, 'dia' => 3, 'da' => ['cables' => 3, 'placas' => 3, 'paneles' => 3, 'credenciales' => 3, 'planos' => 3]],
        'chip' => ['fichas' => 45, 'dia' => 1, 'da' => ['chips' => 1]],
        'acel_15' => ['fichas' => 15, 'dia' => 4, 'da' => ['acelera_min' => 15]],
        'acel_60' => ['fichas' => 50, 'dia' => 2, 'da' => ['acelera_min' => 60]],
        'insignia_solidaria' => ['fichas' => 250, 'una_vez' => true, 'da' => ['insignia' => 'solidaria']],
    ];

    private static function ahora(): int { return SedeOficial::ahora(); }
    private static function dia(): string { return SedeOficial::dia(); }

    // ------------------------------------------------------------------ asociación y antigüedad
    /** ['asociacion_id', 'cargo', 'desde'] o null. */
    public static function miembro(int $j): ?array
    {
        $m = Db::fila('SELECT asociacion_id, cargo, desde FROM asociacion_miembros WHERE jugador_id = ?', [$j]);
        return $m ? ['asociacion_id' => (int) $m['asociacion_id'], 'cargo' => (string) $m['cargo'], 'desde' => (int) $m['desde']] : null;
    }

    /** Segundos que le faltan para que cuente (0 = ya cuenta). Sin asociación: ANTIGUEDAD_SEG. */
    public static function espera(int $j): int
    {
        $m = self::miembro($j);
        if (!$m) return self::ANTIGUEDAD_SEG;
        return max(0, $m['desde'] + self::ANTIGUEDAD_SEG - self::ahora());
    }

    /** Lanza 409 miembro_nuevo si lleva menos de 24 h en su asociación (lo usa también SedeOficial::ayudar). */
    public static function exigirAntiguo(int $j): void
    {
        $e = self::espera($j);
        Fallo::si($e > 0, 'Llevas menos de 24 horas en tu asociación: podrás ayudar y donar en ' . self::horas($e) . '.', 409,
            ['codigo' => 'miembro_nuevo', 'espera' => $e]);
    }

    private static function horas(int $seg): string
    {
        $h = intdiv($seg, 3600); $m = intdiv($seg % 3600, 60);
        return $h > 0 ? $h . ' h ' . $m . ' min' : max(1, $m) . ' min';
    }

    private static function exigirMiembro(int $j): array
    {
        $m = self::miembro($j);
        Fallo::si(!$m, 'Únete a una asociación primero.', 409, ['codigo' => 'sin_asociacion']);
        return $m;
    }

    // ------------------------------------------------------------------ nivel, investigación y bonos
    public static function puntos(int $a): int
    {
        return (int) (Db::valor('SELECT puntos FROM ayuda_asoc_puntos WHERE asociacion_id = ?', [$a]) ?? 0);
    }

    public static function nivelPorPuntos(int $p): int
    {
        $n = 1;
        foreach (self::NIVELES as $k => $min) if ($p >= $min) $n = $k;
        return $n;
    }

    public static function nivelAsoc(int $a): int { return self::nivelPorPuntos(self::puntos($a)); }

    /** @return array<string,array{nivel:int,progreso:int}> */
    public static function investigacion(int $a): array
    {
        $o = [];
        foreach (self::TECH as $k => $_) $o[$k] = ['nivel' => 0, 'progreso' => 0];
        foreach (Db::todas('SELECT tech, nivel, progreso FROM ayuda_asoc_investigacion WHERE asociacion_id = ?', [$a]) as $f) {
            if (isset($o[$f['tech']])) $o[$f['tech']] = ['nivel' => min((int) $f['nivel'], self::TECH[$f['tech']]['max']), 'progreso' => (int) $f['progreso']];
        }
        return $o;
    }

    /** Tope de ayudas por obra de una asociación: 10 + (nivel − 1) + Refuerzos, de 10 a 20. */
    public static function topeDeAsoc(int $a): int
    {
        $inv = self::investigacion($a);
        return max(self::TOPE_MIN, min(self::TOPE_MAX, self::TOPE_MIN + self::nivelAsoc($a) - 1 + $inv['refuerzos']['nivel'] * self::TECH['refuerzos']['efecto']));
    }

    /** Tope para las obras de $duenio (lo pide SedeOficial::topeAyudas). Sin asociación: 10. */
    public static function topeAyudas(int $duenio): int
    {
        $m = self::miembro($duenio);
        return $m ? self::topeDeAsoc($m['asociacion_id']) : self::TOPE_MIN;
    }

    /** Bonos de la investigación para el juego: ['paga_eventos_pct', 'reparacion_pct', 'ayudas_extra']. Sin asociación: 0. */
    public static function bonos(int $j): array
    {
        $m = self::miembro($j);
        if (!$m) return ['paga_eventos_pct' => 0, 'reparacion_pct' => 0, 'ayudas_extra' => 0];
        $inv = self::investigacion($m['asociacion_id']);
        return ['paga_eventos_pct' => $inv['paga_eventos']['nivel'] * self::TECH['paga_eventos']['efecto'],
            'reparacion_pct' => $inv['reparacion']['nivel'] * self::TECH['reparacion']['efecto'],
            'ayudas_extra' => self::topeDeAsoc($m['asociacion_id']) - self::TOPE_MIN];
    }

    // ------------------------------------------------------------------ fichas
    public static function fichas(int $j): int
    {
        return (int) (Db::valor('SELECT saldo FROM ayuda_asoc_fichas WHERE jugador_id = ?', [$j]) ?? 0);
    }

    /** Suma (o resta) fichas con libro. 409 sin_fichas si quedaría negativo. */
    private static function moverFichas(int $j, int $n, string $motivo, ?string $ref): void
    {
        if ($n === 0) return;
        $t = self::ahora();
        Db::q('INSERT OR IGNORE INTO ayuda_asoc_fichas (jugador_id, saldo, ganadas, actualizado) VALUES (?, 0, 0, ?)', [$j, $t]);
        $ok = Db::q('UPDATE ayuda_asoc_fichas SET saldo = saldo + ?, ganadas = ganadas + ?, actualizado = ? WHERE jugador_id = ? AND saldo + ? >= 0',
            [$n, max(0, $n), $t, $j, $n])->rowCount();
        Fallo::si(!$ok, 'No tienes fichas suficientes.', 409, ['codigo' => 'sin_fichas', 'fichas' => self::fichas($j)]);
        Db::q('INSERT INTO ayuda_asoc_libro (jugador_id, cambio, motivo, ref, dia, creado) VALUES (?, ?, ?, ?, ?, ?)',
            [$j, $n, $motivo, $ref === null ? null : mb_substr($ref, 0, 200), self::dia(), $t]);
    }

    private static function fichasHoy(int $j, string $motivo): int
    {
        return (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM ayuda_asoc_libro WHERE jugador_id = ? AND motivo = ? AND dia = ? AND cambio > 0", [$j, $motivo, self::dia()]);
    }

    /** Gancho de SedeOficial::ayudar (dentro de su transacción): fichas para el que ayudó, con tope diario. */
    public static function alAyudar(int $ayudante, int $obraId): int
    {
        if (self::espera($ayudante) > 0) return 0;
        $n = max(0, min(self::FICHAS_AYUDA, self::FICHAS_AYUDA_DIA - self::fichasHoy($ayudante, 'ayuda')));
        if ($n > 0) self::moverFichas($ayudante, $n, 'ayuda', 'obra:' . $obraId);
        return $n;
    }

    // ------------------------------------------------------------------ pedidos de ayuda
    /** Borra los pedidos de obras que ya terminaron (o de dueños que dejaron la asociación). */
    private static function limpiarPedidos(int $a): void
    {
        Db::q("DELETE FROM ayuda_asoc_pedidos WHERE asociacion_id = ? AND (obra_id IN (SELECT id FROM sede_obras WHERE estado <> 'activa' OR fin <= ?)
               OR jugador_id NOT IN (SELECT jugador_id FROM asociacion_miembros WHERE asociacion_id = ?))", [$a, self::ahora(), $a]);
    }

    /** Pedidos de otros socios en los que $j todavía puede ayudar (máximo 50, los más viejos primero). */
    public static function pendientes(int $j): array
    {
        $m = self::miembro($j);
        if (!$m) return [];
        $a = $m['asociacion_id'];
        $t = self::ahora();
        $tope = self::topeDeAsoc($a);
        $filas = Db::todas("SELECT o.*, p.creado AS pedido, j.alias, j.nombre FROM ayuda_asoc_pedidos p
                JOIN sede_obras o ON o.id = p.obra_id
                JOIN asociacion_miembros am ON am.jugador_id = o.jugador_id AND am.asociacion_id = p.asociacion_id
                JOIN jugadores j ON j.id = o.jugador_id
                WHERE p.asociacion_id = ? AND o.jugador_id <> ? AND o.estado = 'activa' AND o.fin > ? AND o.ayudas < ?
                AND NOT EXISTS (SELECT 1 FROM sede_ayudas x WHERE x.obra_id = o.id AND x.ayudante_id = ?)
                ORDER BY p.creado, o.id LIMIT 50", [$a, $j, $t, $tope, $j]);
        return array_map(fn($o) => ['obra_id' => (int) $o['id'], 'jugador_id' => (int) $o['jugador_id'], 'nombre' => Social::nombrePublico($o['alias'], $o['nombre']),
            'tipo' => $o['tipo'], 'ed' => $o['ed'], 'nivel' => (int) $o['nivel'], 'restante' => max(0, (int) $o['fin'] - $t),
            'ayudas' => (int) $o['ayudas'], 'ayudas_max' => $tope,
            'segundos_ayuda' => min(max(0, (int) $o['fin'] - $t), SedeOficial::segundosAyuda((int) $o['duracion']))], $filas);
    }

    /** Mis obras activas y si ya pedí ayuda en cada una. */
    private static function misObras(int $j, ?int $a): array
    {
        $t = self::ahora();
        $tope = $a === null ? self::TOPE_MIN : self::topeDeAsoc($a);
        return array_map(fn($o) => ['obra_id' => (int) $o['id'], 'tipo' => $o['tipo'], 'ed' => $o['ed'], 'nivel' => (int) $o['nivel'],
            'restante' => max(0, (int) $o['fin'] - $t), 'ayudas' => (int) $o['ayudas'], 'ayudas_max' => $tope, 'pedida' => $o['pedido'] !== null],
            Db::todas("SELECT o.*, p.creado AS pedido FROM sede_obras o LEFT JOIN ayuda_asoc_pedidos p ON p.obra_id = o.id
                       WHERE o.jugador_id = ? AND o.estado = 'activa' AND o.fin > ? ORDER BY o.fin, o.id", [$j, $t]));
    }

    /** "Pedir ayuda" en una obra propia ($obraId) o en todas las que falten ($obraId null). */
    public static function pedir(int $j, ?int $obraId): array
    {
        Cuentas::exigirActiva($j);
        $n = Db::tx(function () use ($j, $obraId): int {
            $m = self::exigirMiembro($j);
            $a = $m['asociacion_id'];
            SedeOficial::sincronizar($j);
            self::limpiarPedidos($a);
            $tope = self::topeDeAsoc($a);
            $t = self::ahora();
            if ($obraId !== null) {
                $o = Db::fila('SELECT * FROM sede_obras WHERE id = ? AND jugador_id = ?', [$obraId, $j]);
                Fallo::si(!$o, 'Esa obra no existe.', 404, ['codigo' => 'obra_no_existe']);
                Fallo::si($o['estado'] !== 'activa' || (int) $o['fin'] <= $t, 'Esa obra ya terminó.', 409, ['codigo' => 'ya_terminada']);
                Fallo::si((int) $o['ayudas'] >= $tope, 'Esa obra ya recibió todas las ayudas.', 409, ['codigo' => 'ayudas_completas']);
                Fallo::si((bool) Db::valor('SELECT 1 FROM ayuda_asoc_pedidos WHERE obra_id = ?', [$obraId]), 'Ya pediste ayuda para esa obra.', 409, ['codigo' => 'ya_pedida']);
                $obras = [(int) $o['id']];
            } else {
                $obras = array_map('intval', array_column(Db::todas("SELECT id FROM sede_obras WHERE jugador_id = ? AND estado = 'activa' AND fin > ? AND ayudas < ?
                    AND id NOT IN (SELECT obra_id FROM ayuda_asoc_pedidos)", [$j, $t, $tope]), 'id'));
                Fallo::si(!$obras, 'No tienes obras para pedir ayuda.', 409, ['codigo' => 'sin_obras']);
            }
            foreach ($obras as $id) Db::q('INSERT OR IGNORE INTO ayuda_asoc_pedidos (obra_id, jugador_id, asociacion_id, creado) VALUES (?, ?, ?, ?)', [$id, $j, $a, $t]);
            return count($obras);
        });
        return ['pedidas' => $n] + self::vista($j);
    }

    /** "Ayudar a todos": ayuda en cada pedido pendiente (SedeOficial::ayudar) hasta el tope del día. */
    public static function ayudarTodos(int $j): array
    {
        Cuentas::exigirActiva($j);
        self::exigirMiembro($j);
        self::exigirAntiguo($j);
        $lista = self::pendientes($j);
        Fallo::si(!$lista, 'No hay pedidos de ayuda ahora.', 409, ['codigo' => 'sin_pedidos']);
        $hechas = 0; $seg = 0; $premio = []; $fichas = 0; $topeDia = false;
        foreach ($lista as $p) {
            try {
                $r = SedeOficial::ayudar($j, $p['jugador_id'], $p['obra_id'], false);
                $hechas++; $seg += (int) $r['segundos']; $fichas += (int) ($r['fichas'] ?? 0);
                foreach (($r['premio'] ?? []) ?: [] as $k => $n) $premio[$k] = ($premio[$k] ?? 0) + (int) $n;
            } catch (Fallo $e) {
                if (($e->extra['codigo'] ?? '') === 'tope_ayudas_dia') { $topeDia = true; break; }
                // otra (ya terminó, se llenó, se fue de la asociación…): se salta
            }
        }
        Fallo::si($hechas === 0 && $topeDia, 'Ya diste todas tus ayudas de hoy. Vuelve mañana.', 409, ['codigo' => 'tope_ayudas_dia']);
        if ($hechas > 0) self::auditar($j, 'asoc_ayudar_todos', $hechas . ' ayudas, −' . $seg . ' s en total, ' . $fichas . ' fichas');
        return ['ayudadas' => $hechas, 'segundos' => $seg, 'premio' => $premio, 'fichas_ganadas' => $fichas, 'tope_dia' => $topeDia] + self::vista($j);
    }

    // ------------------------------------------------------------------ donaciones
    /**
     * Dona a la tecnología $tech: $tipo 'dinero' (con $pagado = true: el juego ya descontó DONAR['dinero']['monto']) o
     * 'material' ($material: uno común da 10 unidades; 'chips' da 1 chip).
     */
    public static function donar(int $j, string $tech, string $tipo, ?string $material, bool $pagado): array
    {
        Cuentas::exigirActiva($j);
        Fallo::si(!isset(self::TECH[$tech]), 'Esa investigación no existe.', 400, ['codigo' => 'tech_invalida']);
        Fallo::si(!in_array($tipo, ['dinero', 'material'], true), 'Tipo de donación no válido.', 400, ['codigo' => 'datos_invalidos']);
        $r = Db::tx(function () use ($j, $tech, $tipo, $material, $pagado): array {
            $m = self::exigirMiembro($j);
            self::exigirAntiguo($j);
            $a = $m['asociacion_id'];
            $dia = self::dia();
            $t = self::ahora();
            $hoy = (int) Db::valor('SELECT COUNT(*) FROM ayuda_asoc_donaciones WHERE jugador_id = ? AND dia = ?', [$j, $dia]);
            Fallo::si($hoy >= self::DONACIONES_DIA, 'Ya donaste todo lo de hoy. Vuelve mañana.', 409, ['codigo' => 'tope_donaciones', 'max' => self::DONACIONES_DIA]);
            $inv = self::investigacion($a)[$tech];
            $T = self::TECH[$tech];
            Fallo::si($inv['nivel'] >= $T['max'], 'Esa investigación ya está al máximo.', 409, ['codigo' => 'tech_max']);
            if ($tipo === 'dinero') {
                Fallo::si(!$pagado, 'Donar cuesta ' . '$' . number_format(self::DONAR['dinero']['monto'], 0, ',', '.') . ' del juego.', 402, ['codigo' => 'sin_pago', 'costo' => self::DONAR['dinero']['monto']]);
                $hoyD = (int) Db::valor("SELECT COUNT(*) FROM ayuda_asoc_donaciones WHERE jugador_id = ? AND dia = ? AND tipo = 'dinero'", [$j, $dia]);
                Fallo::si($hoyD >= self::DONAR['dinero']['dia'], 'Ya donaste dinero ' . self::DONAR['dinero']['dia'] . ' veces hoy. Dona materiales o vuelve mañana.', 409, ['codigo' => 'tope_donaciones_dinero', 'max' => self::DONAR['dinero']['dia']]);
                $D = self::DONAR['dinero']; $cant = $D['monto']; $mat = null;
            } else {
                Fallo::si($material === null || !in_array($material, SedeOficial::MATS, true), 'Ese material no existe.', 400, ['codigo' => 'material_invalido']);
                $D = $material === 'chips' ? self::DONAR['chips'] : self::DONAR['material'];
                $cant = $D['cantidad']; $mat = $material;
                SedeOficial::moverMateriales($j, [$material => -$cant], 'donacion_asoc', 'asoc:' . $a . ':' . $tech);
            }
            $fichas = max(0, min($D['fichas'], self::FICHAS_DONAR_DIA - self::fichasHoy($j, 'donacion')));
            $puntos = (int) $D['puntos'];
            Db::q('INSERT INTO ayuda_asoc_donaciones (asociacion_id, jugador_id, tech, tipo, material, cantidad, puntos, fichas, dia, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$a, $j, $tech, $tipo, $mat, $cant, $puntos, $fichas, $dia, $t]);
            $donId = Db::ultimoId();
            // Progreso y niveles de la tecnología (lo que sobra pasa al nivel siguiente)
            $nivel = $inv['nivel']; $prog = $inv['progreso'] + $puntos; $subio = 0;
            while ($nivel < $T['max'] && $prog >= $T['costos'][$nivel]) { $prog -= $T['costos'][$nivel]; $nivel++; $subio++; }
            if ($nivel >= $T['max']) $prog = 0;
            Db::q('INSERT INTO ayuda_asoc_investigacion (asociacion_id, tech, nivel, progreso, actualizado) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (asociacion_id, tech) DO UPDATE SET nivel = excluded.nivel, progreso = excluded.progreso, actualizado = excluded.actualizado',
                [$a, $tech, $nivel, $prog, $t]);
            $antes = self::nivelAsoc($a);
            Db::q('INSERT INTO ayuda_asoc_puntos (asociacion_id, puntos, actualizado) VALUES (?, ?, ?)
                   ON CONFLICT (asociacion_id) DO UPDATE SET puntos = puntos + excluded.puntos, actualizado = excluded.actualizado', [$a, $puntos, $t]);
            $despues = self::nivelAsoc($a);
            if ($fichas > 0) self::moverFichas($j, $fichas, 'donacion', 'donacion:' . $donId);
            self::auditar($j, 'asoc_donar', 'Asociación ' . $a . ': ' . $tech . ' ← ' . ($tipo === 'dinero' ? '$' . $cant . ' del juego' : $cant . ' ' . $mat)
                . ' (' . $puntos . ' puntos, ' . $fichas . ' fichas)' . ($subio ? '; ' . $tech . ' sube a nivel ' . $nivel : '') . ($despues > $antes ? '; asociación sube a nivel ' . $despues : ''));
            return ['donacion' => ['tech' => $tech, 'tipo' => $tipo, 'material' => $mat, 'cantidad' => $cant, 'puntos' => $puntos, 'fichas' => $fichas,
                'subio' => $subio > 0, 'nivel_tech' => $nivel, 'nivel_asoc' => $despues, 'subio_asoc' => $despues > $antes]];
        });
        return $r + self::vista($j);
    }

    // ------------------------------------------------------------------ tienda
    public static function comprar(int $j, string $item): array
    {
        Cuentas::exigirActiva($j);
        $I = self::TIENDA[$item] ?? null;
        Fallo::si($I === null, 'Ese artículo no existe.', 400, ['codigo' => 'item_invalido']);
        $r = Db::tx(function () use ($j, $item, $I): array {
            self::exigirMiembro($j);
            $dia = self::dia();
            if (!empty($I['una_vez'])) {
                Fallo::si((bool) Db::valor('SELECT 1 FROM ayuda_asoc_compras WHERE jugador_id = ? AND item = ?', [$j, $item]), 'Ya tienes ese artículo.', 409, ['codigo' => 'ya_comprado']);
            } else {
                $hoy = (int) Db::valor('SELECT COUNT(*) FROM ayuda_asoc_compras WHERE jugador_id = ? AND item = ? AND dia = ?', [$j, $item, $dia]);
                Fallo::si($hoy >= $I['dia'], 'Ya compraste ese artículo ' . $I['dia'] . ' veces hoy. Vuelve mañana.', 409, ['codigo' => 'tope_tienda', 'max' => $I['dia']]);
            }
            $t = self::ahora();
            Db::q('INSERT INTO ayuda_asoc_compras (jugador_id, item, fichas, dia, creado) VALUES (?, ?, ?, ?, ?)', [$j, $item, $I['fichas'], $dia, $t]);
            $id = Db::ultimoId();
            self::moverFichas($j, -$I['fichas'], 'tienda', 'compra:' . $id . ':' . $item);
            $da = $I['da'];
            if (isset($da['insignia'])) Db::q('INSERT OR IGNORE INTO ayuda_asoc_insignias (jugador_id, insignia, creado) VALUES (?, ?, ?)', [$j, $da['insignia'], $t]);
            else SedeOficial::moverMateriales($j, $da, 'tienda_asoc', 'asoc_compra:' . $id . ':' . $item);
            self::auditar($j, 'asoc_tienda', $item . ' por ' . $I['fichas'] . ' fichas (compra ' . $id . ')');
            return ['compra' => ['item' => $item, 'fichas' => $I['fichas'], 'da' => $da]];
        });
        return $r + self::vista($j);
    }

    /** Insignias cosméticas del jugador (para chat / perfil). @return list<string> */
    public static function insignias(int $j): array
    {
        return array_column(Db::todas('SELECT insignia FROM ayuda_asoc_insignias WHERE jugador_id = ? ORDER BY creado, insignia', [$j]), 'insignia');
    }

    // ------------------------------------------------------------------ vistas
    /** Para el globo con el número (consulta liviana). */
    public static function resumen(int $j): array
    {
        $m = self::miembro($j);
        return ['ok' => true, 'asociacion' => $m ? $m['asociacion_id'] : null, 'pendientes' => $m ? count(self::pendientes($j)) : 0,
            'fichas' => self::fichas($j), 'espera' => $m ? self::espera($j) : null, 'bonos' => self::bonos($j)];
    }

    public static function vista(int $j): array
    {
        $m = self::miembro($j);
        $dia = self::dia();
        $hoyAy = Db::fila('SELECT COUNT(*) AS n, COUNT(premio) AS p FROM sede_ayudas WHERE ayudante_id = ? AND dia = ?', [$j, $dia]);
        $hoy = ['ayudas' => (int) $hoyAy['n'], 'ayudas_max' => SedeOficial::AYUDAS_DIA,
            'fichas_ayuda' => self::fichasHoy($j, 'ayuda'), 'fichas_ayuda_max' => self::FICHAS_AYUDA_DIA,
            'donaciones' => (int) Db::valor('SELECT COUNT(*) FROM ayuda_asoc_donaciones WHERE jugador_id = ? AND dia = ?', [$j, $dia]), 'donaciones_max' => self::DONACIONES_DIA,
            'donaciones_dinero' => (int) Db::valor("SELECT COUNT(*) FROM ayuda_asoc_donaciones WHERE jugador_id = ? AND dia = ? AND tipo = 'dinero'", [$j, $dia]),
            'donaciones_dinero_max' => self::DONAR['dinero']['dia'],
            'fichas_donar' => self::fichasHoy($j, 'donacion'), 'fichas_donar_max' => self::FICHAS_DONAR_DIA];
        $compras = [];
        foreach (Db::todas('SELECT item, COUNT(*) AS n, SUM(dia = ?) AS hoy FROM ayuda_asoc_compras WHERE jugador_id = ? GROUP BY item', [$dia, $j]) as $c) $compras[$c['item']] = $c;
        $tienda = [];
        foreach (self::TIENDA as $k => $I) {
            $usadas = !empty($I['una_vez']) ? (int) ($compras[$k]['n'] ?? 0) : (int) ($compras[$k]['hoy'] ?? 0);
            $tope = !empty($I['una_vez']) ? 1 : (int) $I['dia'];
            $tienda[] = ['id' => $k, 'fichas' => $I['fichas'], 'da' => $I['da'], 'una_vez' => !empty($I['una_vez']), 'tope' => $tope, 'usadas' => $usadas, 'agotado' => $usadas >= $tope];
        }
        $reglas = ['antiguedad_seg' => self::ANTIGUEDAD_SEG, 'tope_min' => self::TOPE_MIN, 'tope_max' => self::TOPE_MAX, 'fichas_ayuda' => self::FICHAS_AYUDA,
            'donar' => self::DONAR, 'niveles' => self::NIVELES, 'ayuda_pct' => SedeOficial::AYUDA_PCT, 'ayuda_min_seg' => SedeOficial::AYUDA_MIN_SEG];
        $o = ['ok' => true, 'ahora' => self::ahora(), 'dia' => $dia, 'fichas' => self::fichas($j), 'hoy' => $hoy, 'tienda' => $tienda,
            'insignias' => self::insignias($j), 'reglas' => $reglas, 'asociacion' => null, 'pendientes' => [], 'mis_obras' => self::misObras($j, null),
            'bonos' => self::bonos($j), 'materiales' => self::materiales($j)];
        if (!$m) return $o;
        $a = $m['asociacion_id'];
        self::limpiarPedidos($a);
        $p = self::puntos($a);
        $nv = self::nivelPorPuntos($p);
        $info = Db::fila('SELECT nombre, siglas, color FROM asociaciones WHERE id = ?', [$a]) ?: ['nombre' => '', 'siglas' => '', 'color' => ''];
        $inv = [];
        foreach (self::investigacion($a) as $k => $x) {
            $T = self::TECH[$k];
            $inv[] = ['id' => $k, 'nivel' => $x['nivel'], 'max' => $T['max'], 'efecto' => $T['efecto'], 'total' => $x['nivel'] * $T['efecto'],
                'progreso' => $x['progreso'], 'costo' => $x['nivel'] < $T['max'] ? $T['costos'][$x['nivel']] : null, 'costos' => $T['costos']];
        }
        $o['asociacion'] = ['id' => $a, 'nombre' => $info['nombre'], 'siglas' => $info['siglas'], 'color' => $info['color'], 'cargo' => $m['cargo'],
            'nivel' => $nv, 'nivel_max' => max(array_keys(self::NIVELES)), 'puntos' => $p, 'siguiente' => self::NIVELES[$nv + 1] ?? null,
            'tope_ayudas' => self::topeDeAsoc($a), 'espera' => self::espera($j), 'investigacion' => $inv];
        $o['pendientes'] = self::pendientes($j);
        $o['mis_obras'] = self::misObras($j, $a);
        return $o;
    }

    /** Materiales de la sede oficial del jugador (para los botones de donar). */
    private static function materiales(int $j): array
    {
        $f = Db::fila('SELECT * FROM sede_oficial WHERE jugador_id = ?', [$j]) ?: [];
        $o = [];
        foreach (SedeOficial::MATS as $k) $o[$k] = (int) ($f[$k] ?? 0);
        return $o;
    }

    private static function auditar(int $j, string $accion, string $detalle): void
    {
        try { Auditoria::anotar('jugador:' . $j, $accion, $detalle, $j); } catch (\Throwable $e) { error_log('EN VIVO ayuda_asoc auditoría: ' . $e->getMessage()); }
    }
}
