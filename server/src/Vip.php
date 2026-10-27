<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Nivel VIP 1–10 por apoyo acumulado (server/MONETIZACION.md, server/INTEGRAR_VIP.md). NO es el Pase VIP de 30 días
 * (vip_hasta, Monedero::vipActivo): los dos conviven. El nivel es para siempre.
 * - Sale de las compras con dinero real APROBADAS (compras.estado = 'pagado', Plux y Google Play), en dólares (total con IVA).
 *   Una compra revertida (reembolso o contracargo) queda en estado 'revertido' y deja de contar: es lo ÚNICO que baja el nivel.
 *   Subir los umbrales en el Centro de Control no le quita el nivel a nadie (se guarda el máximo alcanzado en vip_jugadores).
 * - Umbrales (ajuste `vip_umbrales`, 10 valores en dólares separados por coma): 1, 5, 15, 30, 50, 100, 200, 350, 600, 1000.
 *   Lo que no cuenta (ajuste `vip_excluir`): transferencia_cuenta (es un trámite, no apoyo).
 * - Ventajas por nivel (tabla en GET /api/vip): insignia en el chat, color del marco de la productora, +1 intento diario de
 *   preparación en VIP 3, 6 y 9 (intentosExtra), regalo mensual (contenido fijo, una vez por mes), 2.º espacio de obra en
 *   la Sede oficial desde VIP 4 (slotsObra) y títulos exclusivos (solo cosméticos).
 * - Ofertas escalonadas de una sola vez (vip_ofertas): se desbloquean al subir de nivel, con la primera Copa ganada y con la
 *   Sede oficial en nivel 5 y 10; contenido fijo a la vista, tope de compras y vencimiento.
 * - Mecenas del servidor: ranking semanal y de siempre de quienes más apoyan, solo con el nombre público (NUNCA montos);
 *   cada jugador puede salir del ranking.
 */
final class Vip
{
    public const MAX = 10;
    public const UMBRALES = [1, 5, 15, 30, 50, 100, 200, 350, 600, 1000];
    public const PUNTOS_POR_USD = 10;   // lo que ve el jugador: "puntos VIP" ($1 = 10 puntos)
    public const NIVELES_INTENTO = [3, 6, 9];
    public const NIVEL_SLOT_OBRA = 4;
    public const EXCLUIR = ['transferencia_cuenta'];

    /** Reloj inyectable (pruebas). */
    public static ?int $reloj = null;
    public static function ahora(): int { return self::$reloj ?? time(); }

    /** Insignia, marco y título de cada nivel (los textos los traduce el juego por nivel). */
    public const NIVELES = [
        1 => ['insignia' => 'Bronce', 'color' => '#c58a4e', 'brillo' => false, 'titulo' => 'Patrocinador'],
        2 => ['insignia' => 'Plata', 'color' => '#c9d1dc', 'brillo' => false, 'titulo' => 'Aliado del directo'],
        3 => ['insignia' => 'Oro', 'color' => '#f2c14e', 'brillo' => false, 'titulo' => 'Productor asociado'],
        4 => ['insignia' => 'Jade', 'color' => '#3fd0a4', 'brillo' => false, 'titulo' => 'Productor ejecutivo'],
        5 => ['insignia' => 'Zafiro', 'color' => '#4da3ff', 'brillo' => false, 'titulo' => 'Socio de oro'],
        6 => ['insignia' => 'Amatista', 'color' => '#a77bff', 'brillo' => false, 'titulo' => 'Magnate del directo'],
        7 => ['insignia' => 'Rubí', 'color' => '#ff5c8a', 'brillo' => true, 'titulo' => 'Leyenda de cabina'],
        8 => ['insignia' => 'Fuego', 'color' => '#ff8a3d', 'brillo' => true, 'titulo' => 'Dueño del estudio'],
        9 => ['insignia' => 'Diamante', 'color' => '#7cf0ff', 'brillo' => true, 'titulo' => 'Ícono de la industria'],
        10 => ['insignia' => 'Leyenda', 'color' => '#ffd84d', 'brillo' => true, 'titulo' => 'Mecenas legendario'],
    ];

    /** Regalo mensual por nivel: contenido FIJO (dinero del juego, repuestos y reparación; sin créditos). */
    public const MENSUAL = [
        1 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 500], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2]],
        2 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 800], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 1]],
        3 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1200], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2]],
        4 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1600], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]],
        5 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2200], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 4], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 4], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        6 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 3000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        7 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 4000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 6], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 6], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        8 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 8], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 8], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        9 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 6500], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 10], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 10], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        10 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 8000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 12], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 12], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
    ];

    /**
     * Productos de las ofertas escalonadas, con el MISMO formato que Catalogo::PRODUCTOS (el integrador los suma ahí:
     * `... ] + Vip::PRODUCTOS_OFERTA;`). Son variantes de los paquetes de créditos con contenido extra fijo y a la vista.
     * Compras entrega "creditos" (como cualquier producto) y "entregas" (línea de INTEGRAR_VIP.md). No salen en la tienda
     * normal (oferta_vip): solo en la ficha VIP de quien la desbloqueó, con su tope y su vencimiento.
     */
    public const PRODUCTOS_OFERTA = [
        'oferta_vip_s' => ['tipo' => 'oferta', 'oferta_vip' => true, 'nombre' => 'Oferta VIP: Primer impulso', 'detalle' => 'Oferta de nivel: 300 créditos, $2.000 del juego y 5 cables', 'precio' => 1.99, 'creditos' => 300, 'una_vez' => false,
            'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5]]],
        'oferta_vip_m' => ['tipo' => 'oferta', 'oferta_vip' => true, 'nombre' => 'Oferta VIP: Productora en ascenso', 'detalle' => 'Oferta de nivel: 900 créditos, $5.000 del juego, 5 cables y 5 baterías', 'precio' => 4.99, 'creditos' => 900, 'una_vez' => false,
            'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5]]],
        'oferta_vip_l' => ['tipo' => 'oferta', 'oferta_vip' => true, 'nombre' => 'Oferta VIP: Gran producción', 'detalle' => 'Oferta de nivel: 2.000 créditos, $12.000 del juego, 10 cables, 10 baterías y todo tu equipo al 100 %', 'precio' => 9.99, 'creditos' => 2000, 'una_vez' => false,
            'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 12000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 10], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 10], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
        'oferta_campeon' => ['tipo' => 'oferta', 'oferta_vip' => true, 'nombre' => 'Oferta del campeón', 'detalle' => 'Por tu primera Copa: 1.000 créditos, $8.000 del juego, 5 cables, 5 baterías y todo tu equipo al 100 %', 'precio' => 4.99, 'creditos' => 1000, 'una_vez' => false,
            'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 8000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
        'oferta_sede_5' => ['tipo' => 'oferta', 'oferta_vip' => true, 'nombre' => 'Oferta Sede nivel 5', 'detalle' => 'Tu sede llegó a nivel 5: 800 créditos, $10.000 del juego, 5 cables y 5 baterías', 'precio' => 4.99, 'creditos' => 800, 'una_vez' => false,
            'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 10000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5]]],
        'oferta_sede_10' => ['tipo' => 'oferta', 'oferta_vip' => true, 'nombre' => 'Oferta Sede nivel 10', 'detalle' => 'Tu sede llegó a nivel 10: 1.800 créditos, $25.000 del juego, 10 cables, 10 baterías y todo tu equipo al 100 %', 'precio' => 9.99, 'creditos' => 1800, 'una_vez' => false,
            'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 25000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 10], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 10], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
    ];

    /** Cada oferta: qué producto, cuántas veces se puede comprar y cuántas horas dura desde que se desbloquea. */
    public const OFERTAS = [
        'nivel_s' => ['producto' => 'oferta_vip_s', 'tope' => 1, 'horas' => 72],    // al subir a VIP 1–3
        'nivel_m' => ['producto' => 'oferta_vip_m', 'tope' => 1, 'horas' => 72],    // al subir a VIP 4–6
        'nivel_l' => ['producto' => 'oferta_vip_l', 'tope' => 2, 'horas' => 72],    // al subir a VIP 7–10
        'campeon' => ['producto' => 'oferta_campeon', 'tope' => 1, 'horas' => 168], // primera Copa ganada
        'sede_5' => ['producto' => 'oferta_sede_5', 'tope' => 1, 'horas' => 168],
        'sede_10' => ['producto' => 'oferta_sede_10', 'tope' => 1, 'horas' => 168],
    ];

    // ------------------------------------------------------------------ registro (arranque.php)
    public static function registrar(): void
    {
        Ganchos::en('compra_aprobada', [self::class, 'alAprobar'], 'vip');
        Ganchos::en('compra_aprobada', [Regalos::class, 'alAprobar'], 'regalos');
        Ganchos::en('compra_revertida', [Regalos::class, 'alRevertir'], 'regalos');
        Ganchos::en('compra_revertida', [self::class, 'alRevertir'], 'vip');
        Ganchos::en('copa_ganada', fn(array $d) => self::hito((int) ($d['jugador_id'] ?? 0), 'campeon', 'copa'), 'vip');
        Ganchos::en('sede_nivel', function (array $d): void {
            $j = (int) ($d['jugador_id'] ?? 0);
            $n = (int) ($d['nivel'] ?? 0);
            if ($n >= 5) self::hito($j, 'sede_5', 'sede:5');
            if ($n >= 10) self::hito($j, 'sede_10', 'sede:10');
        }, 'vip');
    }

    // ------------------------------------------------------------------ nivel
    /** Los 10 umbrales en dólares (ajuste vip_umbrales; si está mal escrito se usan los de este archivo). @return list<float> */
    public static function umbrales(): array
    {
        $t = trim(Ajustes::get('vip_umbrales'));
        if ($t === '') return array_map('floatval', self::UMBRALES);
        $v = array_map('trim', explode(',', $t));
        if (count($v) !== self::MAX) return array_map('floatval', self::UMBRALES);
        $o = [];
        foreach ($v as $x) {
            if (!preg_match('/^\d{1,6}(\.\d{1,2})?$/', $x)) return array_map('floatval', self::UMBRALES);
            $f = (float) $x;
            if ($f <= 0 || ($o && $f <= end($o))) return array_map('floatval', self::UMBRALES);
            $o[] = $f;
        }
        return $o;
    }

    /** Productos que no suman al nivel ni a Mecenas ni dan regalos. @return list<string> */
    public static function excluidos(): array
    {
        $t = trim(Ajustes::get('vip_excluir', implode(',', self::EXCLUIR)));
        return array_values(array_filter(array_map('trim', explode(',', $t)), fn($x) => $x !== ''));
    }

    public static function cuenta(string $producto): bool { return !in_array($producto, self::excluidos(), true); }

    private static function sqlExcluir(): array
    {
        $x = self::excluidos() ?: ['-'];
        return [implode(',', array_fill(0, count($x), '?')), $x];
    }

    /** Dólares de compras aprobadas que cuentan (las revertidas ya no están en 'pagado'). */
    public static function gastado(int $jugador): float
    {
        [$in, $p] = self::sqlExcluir();
        return round((float) Db::valor("SELECT COALESCE(SUM(total), 0) FROM compras WHERE jugador_id = ? AND estado = 'pagado' AND producto NOT IN ($in)", [$jugador, ...$p]), 2);
    }

    public static function nivelPara(float $usd): int
    {
        $n = 0;
        foreach (self::umbrales() as $i => $u) if ($usd + 0.0001 >= $u) $n = $i + 1;
        return $n;
    }

    /**
     * Pone al día el nivel guardado y lo devuelve. Nunca baja, salvo que haya una compra revertida que todavía no se tomó en
     * cuenta (vip_jugadores.revisado = cuántas revertidas ya se vieron; entonces queda en el que corresponde a las compras que
     * siguen pagadas). Al subir: la oferta del nivel nuevo (el juego lo muestra en la tarjeta VIP de Inicio; no se escribe en
     * el canal del sistema para no tapar los avisos de moderación).
     */
    public static function sincronizar(int $jugador): int
    {
        if ($jugador <= 0) return 0;
        return (int) Db::tx(function () use ($jugador): int {
            $f = Db::fila('SELECT * FROM vip_jugadores WHERE jugador_id = ?', [$jugador]);
            $calc = self::nivelPara(self::gastado($jugador));
            $rev = (int) Db::valor("SELECT COUNT(*) FROM compras WHERE jugador_id = ? AND estado = 'revertido'", [$jugador]);   // solo crece
            if (!$f) {
                if ($calc === 0 && $rev === 0) return 0;   // nunca compró: no hace falta fila
                Db::q('INSERT INTO vip_jugadores (jugador_id, nivel, revisado, actualizado) VALUES (?, 0, 0, ?)', [$jugador, self::ahora()]);
                $f = ['nivel' => 0, 'revisado' => 0];
            }
            $antes = (int) $f['nivel'];
            $nuevo = $rev > (int) $f['revisado'] ? $calc : max($antes, $calc);
            if ($nuevo !== $antes || $rev > (int) $f['revisado']) {
                Db::q('UPDATE vip_jugadores SET nivel = ?, revisado = MAX(revisado, ?), subio_en = CASE WHEN ? > nivel THEN ? ELSE subio_en END, actualizado = ? WHERE jugador_id = ?',
                    [$nuevo, $rev, $nuevo, self::ahora(), self::ahora(), $jugador]);
            }
            if ($nuevo > $antes) self::subio($jugador, $antes, $nuevo);
            if ($nuevo < $antes) Auditoria::anotar('sistema', 'vip_baja', 'Nivel VIP ' . $antes . ' -> ' . $nuevo . ' por una compra revertida', $jugador);
            return $nuevo;
        });
    }

    /**
     * Nivel EFECTIVO: el forzado desde el Centro de Control (solo pruebas, vip_jugadores.nivel_forzado) o, si no hay, el real.
     * Es el que usan las ventajas (Pase VIP, intentos, slots, regalo mensual, Diario) y GET /api/estado y /api/vip.
     */
    public static function nivel(int $jugador): int
    {
        $real = self::sincronizar($jugador);
        return self::nivelForzado($jugador) ?? $real;
    }

    /** Nivel real (el de las compras pagadas), sin el forzado del panel. */
    public static function nivelReal(int $jugador): int { return self::sincronizar($jugador); }

    /** ¿La base tiene la columna nivel_forzado (migración vip_admin.sql)? */
    public static function hayForzado(): bool
    {
        static $hay = null;
        if ($hay !== true) $hay = isset(Migraciones::columnas('vip_jugadores')['nivel_forzado']);
        return $hay;
    }

    /** Nivel forzado desde el Centro de Control (1..10) o null si usa el real. */
    public static function nivelForzado(int $jugador): ?int
    {
        if ($jugador <= 0 || !self::hayForzado()) return null;
        $v = Db::valor('SELECT nivel_forzado FROM vip_jugadores WHERE jugador_id = ?', [$jugador]);
        return $v === null ? null : max(1, min(self::MAX, (int) $v));
    }

    /** Expresión SQL del nivel efectivo para una tabla vip_jugadores con alias $a (listas: chat, Mecenas). */
    public static function sqlNivel(string $a): string
    {
        return self::hayForzado() ? "COALESCE($a.nivel_forzado, $a.nivel, 0)" : "COALESCE($a.nivel, 0)";
    }

    /** Nivel guardado sin recalcular (para listas: chat, Mecenas), con el forzado si lo hay. */
    public static function nivelGuardado(int $jugador): int
    {
        return (int) (Db::valor('SELECT ' . self::sqlNivel('v') . ' FROM vip_jugadores v WHERE v.jugador_id = ?', [$jugador]) ?? 0);
    }

    // ------------------------------------------------------------------ Centro de Control: VIP (pruebas)
    /**
     * Fuerza el nivel VIP (1..10) o lo quita (null: vuelve al real). NO crea compras ni ofertas de nivel: solo cambia lo que
     * ve y aprovecha el jugador. Auditoría vip_nivel_admin. Devuelve el nivel efectivo.
     */
    public static function forzarNivel(int $jugador, ?int $nivel, string $quien): int
    {
        Fallo::si(!self::hayForzado(), 'Falta la migración vip_admin.sql (nivel_forzado).', 409);
        Fallo::si($jugador <= 0 || !Db::valor('SELECT 1 FROM jugadores WHERE id = ?', [$jugador]), 'Ese jugador no existe.', 404);
        Fallo::si($nivel !== null && ($nivel < 1 || $nivel > self::MAX), 'El nivel VIP va de 1 a ' . self::MAX . '.', 400);
        return (int) Db::tx(function () use ($jugador, $nivel, $quien): int {
            $real = self::sincronizar($jugador);
            $antes = self::nivelForzado($jugador);
            Fallo::si($nivel === null && $antes === null, 'Este jugador no tiene un nivel forzado.', 409);
            Db::q('INSERT OR IGNORE INTO vip_jugadores (jugador_id, nivel, revisado, actualizado) VALUES (?, 0, 0, ?)', [$jugador, self::ahora()]);
            Db::q('UPDATE vip_jugadores SET nivel_forzado = ?, actualizado = ? WHERE jugador_id = ?', [$nivel, self::ahora(), $jugador]);
            Auditoria::anotar($quien, 'vip_nivel_admin', $nivel === null
                ? 'Quitó el nivel VIP forzado (era VIP ' . $antes . '); vuelve al real: VIP ' . $real
                : 'Nivel VIP forzado: ' . ($antes === null ? 'real VIP ' . $real : 'VIP ' . $antes) . ' -> VIP ' . $nivel . ' (solo pruebas; real VIP ' . $real . ')', $jugador);
            return $nivel ?? $real;
        });
    }

    /**
     * Pase VIP desde el Centro de Control: $dias > 0 lo activa o alarga (Monedero::sumarVip, desde ahora o desde su vencimiento);
     * $dias = 0 lo desactiva (vence ahora). Sin compras: no toca ingresos ni facturas. Auditoría vip_pase_admin.
     * Devuelve el nuevo vencimiento (segundos Unix).
     */
    public static function pasePanel(int $jugador, int $dias, string $quien): int
    {
        Fallo::si($jugador <= 0 || !Db::valor('SELECT 1 FROM jugadores WHERE id = ?', [$jugador]), 'Ese jugador no existe.', 404);
        Fallo::si($dias < 0 || $dias > 365, 'Los días del Pase VIP van de 1 a 365.', 400);
        return (int) Db::tx(function () use ($jugador, $dias, $quien): int {
            $antes = Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$jugador]);
            $txt = fn($v) => $v !== null && (int) $v > time() ? 'activo hasta ' . date('d/m/Y H:i', (int) $v) : 'inactivo';
            if ($dias === 0) {
                Fallo::si(!Monedero::vipActivo($jugador), 'El Pase VIP ya está inactivo.', 409);
                $nuevo = time() - 1;
                Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [$nuevo, $jugador]);
                Auditoria::anotar($quien, 'vip_pase_admin', 'Desactivó el Pase VIP (antes ' . $txt($antes) . ')', $jugador);
                return $nuevo;
            }
            $nuevo = Monedero::sumarVip($jugador, $dias);
            Auditoria::anotar($quien, 'vip_pase_admin', '+' . $dias . ' día(s) de Pase VIP (antes ' . $txt($antes) . ', ahora ' . $txt($nuevo) . ')', $jugador);
            return $nuevo;
        });
    }

    private static function subio(int $jugador, int $antes, int $nuevo): void
    {
        $clave = $nuevo >= 7 ? 'nivel_l' : ($nuevo >= 4 ? 'nivel_m' : 'nivel_s');
        self::hito($jugador, $clave, 'vip:' . $nuevo);
    }

    /** +1 intento diario de preparación en VIP 3, 6 y 9 (0..3). Lo suma la Copa a su límite diario. */
    public static function intentosExtra(int $jugador): int
    {
        $n = self::nivel($jugador);
        return count(array_filter(self::NIVELES_INTENTO, fn($x) => $n >= $x));
    }

    // ------------------------------------------------------------------ ventajas del Pase VIP (30 días) por nivel
    /**
     * Lo que da el Pase VIP de 30 días mientras está activo, según el nivel VIP (decisión de Dimitry, oct. 2026): los equipos
     * comprados con créditos (también los VIP) funcionan SIEMPRE; el Pase da comodidad, no poder en la competencia.
     * Filas "desde nivel" (con el Pase activo y nivel 0 cuenta como VIP 1):
     *  turnos: eventos por día en el modo historia (base 3; solo el juego, nunca en línea).
     *  descuento: reparaciones más baratas (modo historia). obra: obras de la Sede oficial más cortas (servidor, al empezarlas).
     *  bono: bono diario (POST /api/vip/bono): dinero del juego, créditos, cables, baterías y "todo tu equipo al 100 %".
     * La MISMA tabla está en js/premium.js (Premium.PASE_VIP): tests/pruebas_vip.php revisa que sean iguales.
     */
    public const PASE = [
        1 => ['turnos' => 4, 'descuento' => 30, 'obra' => 10, 'bono' => ['dinero' => 150, 'creditos' => 10, 'cable' => 1, 'battery' => 0, 'reparar' => false]],
        3 => ['turnos' => 4, 'descuento' => 35, 'obra' => 15, 'bono' => ['dinero' => 250, 'creditos' => 10, 'cable' => 2, 'battery' => 1, 'reparar' => false]],
        5 => ['turnos' => 5, 'descuento' => 40, 'obra' => 20, 'bono' => ['dinero' => 400, 'creditos' => 15, 'cable' => 2, 'battery' => 2, 'reparar' => false]],
        7 => ['turnos' => 5, 'descuento' => 45, 'obra' => 25, 'bono' => ['dinero' => 600, 'creditos' => 15, 'cable' => 3, 'battery' => 3, 'reparar' => false]],
        9 => ['turnos' => 5, 'descuento' => 50, 'obra' => 30, 'bono' => ['dinero' => 800, 'creditos' => 20, 'cable' => 4, 'battery' => 4, 'reparar' => true]],
    ];

    /** Ventajas del Pase VIP para un nivel VIP (0 cuenta como 1). */
    public static function pase(int $nivel): array
    {
        $n = max(1, min(self::MAX, $nivel));
        $o = self::PASE[1];
        foreach (self::PASE as $desde => $f) if ($n >= $desde) $o = $f;
        return $o + ['nivel' => $n];
    }

    /** Ventajas del Pase VIP de este jugador, o null si no tiene el Pase activo. */
    public static function paseDe(int $jugador): ?array
    {
        if (!Monedero::vipActivo($jugador)) return null;
        $n = 0;
        try { $n = self::nivel($jugador); } catch (\Throwable) { $n = 0; }
        return self::pase($n);
    }

    /** Duración de una obra de la Sede oficial con el Pase VIP (más corta según el nivel; sin Pase, igual). Mínimo 1 minuto. */
    public static function segundosObra(int $jugador, int $seg): int
    {
        try { $p = self::paseDe($jugador); } catch (\Throwable) { $p = null; }
        if ($p === null || $seg <= 0) return $seg;
        return max(60, (int) (round($seg * (100 - $p['obra']) / 100 / 60) * 60));
    }

    /** Entregas del bono diario del Pase VIP para un nivel (dinero, cables, baterías, reparar todo). Los créditos van aparte. */
    public static function entregasBono(int $nivel): array
    {
        $b = self::pase($nivel)['bono'];
        $o = [['tipo' => 'dinero', 'item' => '-', 'cantidad' => $b['dinero']]];
        if ($b['cable'] > 0) $o[] = ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => $b['cable']];
        if ($b['battery'] > 0) $o[] = ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => $b['battery']];
        if ($b['reparar']) $o[] = ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1];
        return $o;
    }

    /** Tabla del Pase VIP por nivel (la que ve el jugador en la Tienda). */
    public static function tablaPase(): array
    {
        $o = [];
        foreach (self::PASE as $desde => $f) $o[] = ['desde' => $desde] + $f;
        return $o;
    }

    /** Espacios de obra a la vez en la Sede oficial: 2 desde VIP 4, si no 1. */
    public static function slotsObra(int $jugador): int { return self::nivel($jugador) >= self::NIVEL_SLOT_OBRA ? 2 : 1; }

    /** Insignia pública de un nivel (para el chat, Mecenas y listas): null si no tiene nivel. */
    public static function insignia(int $nivel): ?array
    {
        if ($nivel < 1 || $nivel > self::MAX) return null;
        $d = self::NIVELES[$nivel];
        return ['nivel' => $nivel, 'nombre' => $d['insignia'], 'color' => $d['color'], 'brillo' => $d['brillo'], 'titulo' => $d['titulo']];
    }

    /** La tabla de niveles con sus ventajas (la que ve el jugador). */
    public static function tabla(): array
    {
        $u = self::umbrales();
        $o = [];
        for ($n = 1; $n <= self::MAX; $n++) {
            $d = self::NIVELES[$n];
            $o[] = ['nivel' => $n, 'puntos' => (int) round($u[$n - 1] * self::PUNTOS_POR_USD), 'insignia' => $d['insignia'], 'color' => $d['color'], 'brillo' => $d['brillo'],
                    'titulo' => $d['titulo'], 'intentos_extra' => count(array_filter(self::NIVELES_INTENTO, fn($x) => $n >= $x)),
                    'intento_nuevo' => in_array($n, self::NIVELES_INTENTO, true), 'slots_obra' => $n >= self::NIVEL_SLOT_OBRA ? 2 : 1,
                    'slot_nuevo' => $n === self::NIVEL_SLOT_OBRA, 'mensual' => self::MENSUAL[$n]];
        }
        return $o;
    }

    /** Puntos y avance al siguiente nivel. */
    public static function progreso(int $jugador, int $nivel): array
    {
        $u = self::umbrales();
        $pts = (int) floor(self::gastado($jugador) * self::PUNTOS_POR_USD + 0.0001);
        if ($nivel >= self::MAX) return ['puntos' => $pts, 'siguiente' => null, 'faltan' => 0, 'pct' => 100];
        $desde = $nivel > 0 ? (int) round($u[$nivel - 1] * self::PUNTOS_POR_USD) : 0;
        $hasta = (int) round($u[$nivel] * self::PUNTOS_POR_USD);
        $base = min($pts, $hasta);   // con umbrales subidos en el panel, el nivel guardado puede ir adelante de los puntos
        $pct = $hasta > $desde ? (int) floor(100 * max(0, $base - $desde) / ($hasta - $desde)) : 0;
        return ['puntos' => $pts, 'siguiente' => $nivel + 1, 'siguiente_puntos' => $hasta, 'faltan' => max(0, $hasta - $pts), 'pct' => max(0, min(99, $pct))];
    }

    // ------------------------------------------------------------------ regalo mensual
    public static function mes(?int $t = null): string { return date('Y-m', $t ?? self::ahora()); }

    public static function mensual(int $jugador, ?int $nivel = null): array
    {
        $nivel ??= self::nivel($jugador);
        $mes = self::mes();
        $hecho = $nivel > 0 && (bool) Db::valor('SELECT 1 FROM vip_mensual WHERE jugador_id = ? AND mes = ?', [$jugador, $mes]);
        $proximo = (new \DateTimeImmutable('@' . self::ahora()))->setTimezone(new \DateTimeZone(date_default_timezone_get()))->modify('first day of next month')->setTime(0, 0)->getTimestamp();
        return ['mes' => $mes, 'disponible' => $nivel > 0 && !$hecho, 'reclamado' => $hecho, 'contenido' => $nivel > 0 ? self::MENSUAL[$nivel] : self::MENSUAL[1],
                'nivel' => $nivel, 'proximo' => Db::iso($proximo)];
    }

    /** POST /api/vip/mensual: entrega el regalo del mes (una vez por mes, con el nivel de ese momento). */
    public static function reclamarMensual(int $jugador): array
    {
        $nivel = self::nivel($jugador);
        Fallo::si($nivel < 1, 'El regalo mensual es desde VIP 1. Cualquier compra en la tienda te da VIP 1.', 403, ['codigo' => 'vip_requerido']);
        return Db::tx(function () use ($jugador, $nivel): array {
            $mes = self::mes();
            $ok = Db::q('INSERT OR IGNORE INTO vip_mensual (jugador_id, mes, nivel, creado) VALUES (?, ?, ?, ?)', [$jugador, $mes, $nivel, self::ahora()])->rowCount();
            Fallo::si($ok !== 1, 'Ya reclamaste tu regalo VIP de este mes. Vuelve el próximo mes.', 409, ['codigo' => 'ya_reclamado']);
            $entregas = array_map(fn($e) => Monedero::entregarDef($jugador, $e, 'vip_mensual:' . $mes), self::MENSUAL[$nivel]);
            return ['ok' => true, 'entregas' => $entregas, 'mensual' => self::mensual($jugador, $nivel)];
        });
    }

    // ------------------------------------------------------------------ preferencias
    public static function preferencias(int $jugador): array
    {
        $f = Db::fila('SELECT anonimo, ocultar_mecenas FROM vip_jugadores WHERE jugador_id = ?', [$jugador]);
        return ['anonimo' => (bool) (int) ($f['anonimo'] ?? 0), 'ocultar_mecenas' => (bool) (int) ($f['ocultar_mecenas'] ?? 0)];
    }

    /** POST /api/vip/ajustes {anonimo?, ocultar_mecenas?} (booleanos). */
    public static function guardarPreferencias(int $jugador, array $in): array
    {
        $cambios = [];
        foreach (['anonimo', 'ocultar_mecenas'] as $k) {
            if (!array_key_exists($k, $in)) continue;
            Fallo::si(!is_bool($in[$k]), '"' . $k . '" debe ser true o false.', 400, ['codigo' => 'datos_invalidos']);
            $cambios[$k] = $in[$k] ? 1 : 0;
        }
        Fallo::si(!$cambios, 'No hay nada que guardar.', 400, ['codigo' => 'datos_invalidos']);
        Db::tx(function () use ($jugador, $cambios): void {
            Db::q('INSERT OR IGNORE INTO vip_jugadores (jugador_id, nivel, revisado, actualizado) VALUES (?, 0, 0, ?)', [$jugador, self::ahora()]);
            foreach ($cambios as $k => $v) Db::q("UPDATE vip_jugadores SET $k = ?, actualizado = ? WHERE jugador_id = ?", [$v, self::ahora(), $jugador]);
        });
        return ['ok' => true, 'ajustes' => self::preferencias($jugador)];
    }

    // ------------------------------------------------------------------ ofertas escalonadas
    /** Producto de una oferta: el del catálogo (con los cambios del Centro de Control) o, si aún no está integrado, el de aquí. */
    public static function producto(string $id): ?array
    {
        $p = Catalogo::producto($id);
        if ($p !== null) return $p;
        $d = self::PRODUCTOS_OFERTA[$id] ?? null;
        return $d === null ? null : $d + ['id' => $id, 'precio_base' => $d['precio'], 'creditos_base' => $d['creditos'], 'activo' => true, 'bono_pct' => 0, 'oferta' => null];
    }

    /** Desbloquea la oferta de un hito (una sola vez por hito). Devuelve true si la creó ahora. */
    public static function hito(int $jugador, string $clave, string $hito): bool
    {
        $o = self::OFERTAS[$clave] ?? null;
        if ($o === null || $jugador <= 0 || !Db::valor('SELECT 1 FROM jugadores WHERE id = ?', [$jugador])) return false;
        $p = self::producto($o['producto']);
        if ($p === null || !$p['activo']) return false;
        $t = self::ahora();
        $n = Db::q('INSERT OR IGNORE INTO vip_ofertas (jugador_id, clave, producto, hito, tope, compradas, creado, vence) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
            [$jugador, $clave, $o['producto'], $hito, $o['tope'], $t, $t + $o['horas'] * 3600])->rowCount();
        return $n === 1;
    }

    /** Hitos que se pueden revisar sin gancho: primera Copa ganada (copa_premios) y nivel de la Sede oficial (si existe). */
    public static function revisarHitos(int $jugador): void
    {
        try {
            if (Migraciones::columnas('copa_premios') !== null && Db::valor("SELECT 1 FROM copa_premios WHERE jugador_id = ? AND clave = 'campeon' LIMIT 1", [$jugador])) self::hito($jugador, 'campeon', 'copa');
        } catch (\Throwable) { /* sin copas */ }
        try {
            $c = 'EnVivo\\SedeOficial';
            if (class_exists($c) && method_exists($c, 'nivel')) {
                $n = (int) $c::nivel($jugador);
                if ($n >= 5) self::hito($jugador, 'sede_5', 'sede:5');
                if ($n >= 10) self::hito($jugador, 'sede_10', 'sede:10');
            }
        } catch (\Throwable) { /* sin sede oficial */ }
    }

    /** Ofertas vigentes del jugador (sin vencer y sin llegar al tope), con su contenido a la vista. */
    public static function ofertas(int $jugador): array
    {
        $o = [];
        foreach (Db::todas('SELECT * FROM vip_ofertas WHERE jugador_id = ? AND vence > ? AND compradas < tope ORDER BY vence, id', [$jugador, self::ahora()]) as $f) {
            $p = self::producto((string) $f['producto']);
            if (!$p || !$p['activo']) continue;
            $o[] = ['id' => (int) $f['id'], 'clave' => $f['clave'], 'hito' => $f['hito'], 'producto' => $f['producto'], 'nombre' => $p['nombre'], 'detalle' => $p['detalle'],
                    'precio' => (float) $p['precio'], 'creditos' => (int) $p['creditos'], 'entregas' => $p['entregas'] ?? [], 'tope' => (int) $f['tope'],
                    'compradas' => (int) $f['compradas'], 'quedan' => (int) $f['tope'] - (int) $f['compradas'], 'vence' => Db::iso((int) $f['vence'])];
        }
        return $o;
    }

    /** Para Compras::exigirComprable: una oferta VIP solo se compra si está desbloqueada, vigente y sin llegar al tope. */
    public static function exigirOferta(int $jugador, array $p): void
    {
        if (empty($p['oferta_vip'])) return;
        $ok = Db::valor('SELECT 1 FROM vip_ofertas WHERE jugador_id = ? AND producto = ? AND vence > ? AND compradas < tope LIMIT 1', [$jugador, $p['id'], self::ahora()]);
        Fallo::si(!$ok, 'Esa oferta no está disponible para ti (venció o ya la compraste).', 409, ['codigo' => 'oferta_no_disponible']);
    }

    // ------------------------------------------------------------------ ganchos
    /** compra_aprobada: pone al día el nivel y cuenta la compra en su oferta (una sola vez por compra). */
    public static function alAprobar(array $d): void
    {
        $j = (int) ($d['jugador_id'] ?? 0);
        $cid = (int) ($d['compra_id'] ?? 0);
        $c = $cid > 0 ? Compras::porId($cid) : null;
        if (!$c || (int) $c['jugador_id'] !== $j || $c['estado'] !== 'pagado') return;
        if (isset(self::PRODUCTOS_OFERTA[$c['producto']])) {
            $of = Db::fila('SELECT * FROM vip_ofertas WHERE jugador_id = ? AND producto = ? AND compradas < tope ORDER BY (vence > ?) DESC, vence, id LIMIT 1', [$j, $c['producto'], self::ahora()]);
            if ($of && Db::q('INSERT OR IGNORE INTO vip_ofertas_compras (compra_id, oferta_id, creado) VALUES (?, ?, ?)', [$cid, $of['id'], self::ahora()])->rowCount() === 1) {
                Db::q('UPDATE vip_ofertas SET compradas = compradas + 1 WHERE id = ?', [$of['id']]);
            }
        }
        self::sincronizar($j);
    }

    /** compra_revertida: el nivel vuelve al que corresponde a las compras que siguen pagadas. */
    public static function alRevertir(array $d): void
    {
        $j = (int) ($d['jugador_id'] ?? 0);
        if ($j > 0) self::sincronizar($j);
    }

    // ------------------------------------------------------------------ Mecenas del servidor
    /** Inicio de la semana (lunes 00:00, hora del juego). */
    public static function inicioSemana(?int $t = null): int
    {
        $d = (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(new \DateTimeZone(date_default_timezone_get()));
        return $d->setTime(0, 0)->modify('-' . ((int) $d->format('N') - 1) . ' days')->getTimestamp();
    }

    /** Ranking (solo nombre público y nivel, nunca montos) de un servidor, desde $desde. @return list<array> */
    private static function ranking(int $servidor, ?int $desde): array
    {
        [$in, $p] = self::sqlExcluir();
        $filas = Db::todas("SELECT j.id, j.alias, j.nombre, SUM(c.total) AS s, MIN(c.pagado_en) AS primero, " . self::sqlNivel('v') . " AS nivel
            FROM compras c JOIN jugadores j ON j.id = c.jugador_id LEFT JOIN vip_jugadores v ON v.jugador_id = j.id
            WHERE c.estado = 'pagado' AND c.producto NOT IN ($in) AND j.servidor_id = ? AND j.estado = 'activo' AND COALESCE(v.ocultar_mecenas, 0) = 0"
            . ($desde !== null ? ' AND c.pagado_en >= ?' : '') . ' GROUP BY j.id ORDER BY s DESC, primero ASC, j.id ASC',
            array_merge($p, [$servidor], $desde !== null ? [$desde] : []));
        $o = [];
        foreach ($filas as $i => $f) {
            $o[] = ['posicion' => $i + 1, 'jugador_id' => (int) $f['id'], 'nombre' => Social::nombrePublico($f['alias'], $f['nombre']), 'nivel' => (int) $f['nivel'], 'insignia' => self::insignia((int) $f['nivel'])];
        }
        return $o;
    }

    /** GET /api/mecenas: top 20 de la semana y de siempre del servidor del jugador. */
    public static function mecenas(int $jugador, int $max = 20): array
    {
        self::sincronizar($jugador);
        $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$jugador]);
        $ini = self::inicioSemana();
        $pref = self::preferencias($jugador);
        $out = ['ok' => true, 'servidor' => Social::servidorDe($jugador), 'oculto' => $pref['ocultar_mecenas'],
                'semana' => ['inicio' => Db::iso($ini), 'fin' => Db::iso($ini + 7 * 86400)]];
        foreach (['semana' => $ini, 'siempre' => null] as $k => $desde) {
            $r = self::ranking($sid, $desde);
            $mio = array_values(array_filter($r, fn($x) => $x['jugador_id'] === $jugador));
            $lista = array_map(fn($x) => ['posicion' => $x['posicion'], 'nombre' => $x['nombre'], 'nivel' => $x['nivel'], 'insignia' => $x['insignia'], 'yo' => $x['jugador_id'] === $jugador], array_slice($r, 0, $max));
            $out[$k === 'semana' ? 'lista_semana' : 'lista_siempre'] = $lista;
            $out['yo'][$k] = $mio ? $mio[0]['posicion'] : null;
        }
        return $out;
    }

    // ------------------------------------------------------------------ GET /api/vip y /api/estado
    public static function estado(int $jugador): array
    {
        $real = self::sincronizar($jugador);
        $forzado = self::nivelForzado($jugador);
        $nivel = $forzado ?? $real;
        self::revisarHitos($jugador);
        return ['ok' => true, 'nivel' => $nivel, 'forzado' => $forzado !== null, 'insignia' => self::insignia($nivel), 'progreso' => self::progreso($jugador, $nivel),
                'intentos_extra' => count(array_filter(self::NIVELES_INTENTO, fn($x) => $nivel >= $x)), 'slots_obra' => $nivel >= self::NIVEL_SLOT_OBRA ? 2 : 1,
                'niveles' => self::tabla(), 'mensual' => self::mensual($jugador, $nivel), 'regalos' => Regalos::pendientes($jugador),
                'regalos_tope_dia' => Regalos::topeDia(), 'ofertas' => self::ofertas($jugador), 'ajustes' => self::preferencias($jugador),
                'pase_vip_activo' => Monedero::vipActivo($jugador), 'pase_vip' => self::pase($nivel), 'pase_vip_tabla' => self::tablaPase()];
    }
}
