<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Impulsos (monetización 2, los "más vendidos" de Kingshot adaptados). Contrato: server/MONETIZACION.md y
 * server/INTEGRAR_MONETIZACION2.md. Tres productos con contenido FIJO y visible (nada al azar):
 *
 * 1. equipo_obra_2 ($2.99, una sola vez) — "Equipo de obra extra (permanente)": +1 equipo de obra en la Sede oficial PARA SIEMPRE.
 *    Equipos de obra = (1, o 2 desde el nivel 5 de la sede o con VIP 4 — como hoy, no se suman entre sí) + 1 de este módulo,
 *    nunca más de 3 (SedeOficial::obreros). O sea: antes del nivel 5 y sin VIP es tu SEGUNDO equipo; después, tu TERCERO.
 *    Camino gratis (más lento): ALQUILAR el equipo extra 2 días con dinero del juego (precioAlquiler: $1.500 + $500 × nivel de
 *    la sede) una vez por semana (2 días puesto + 5 de espera). El dinero del juego vive en la partida (el servidor no lo ve):
 *    el juego lo descuenta al confirmar; la espera semanal la pone el servidor, así que nadie consigue más que quien paga en el
 *    juego. Premios de misiones/eventos: darHoras($j, $horas, $ref) (otros módulos; sin espera, una vez por $ref).
 * 2. fondo_crecimiento ($19.99, una sola vez) — "Fondo de crecimiento": créditos y materiales FIJOS en cada hito de nivel de
 *    la sede oficial (HITOS, tabla a la vista), unas 5 veces lo que cuesta. Se reclaman al llegar a cada nivel (también los
 *    niveles que ya tenías al comprarlo).
 * 3. tarjeta_semanal ($1.99) — "Tarjeta semanal": 7 días, reclama cada día 15 créditos + 3 de cada material común de la sede.
 *    Mismo mecanismo que la tarjeta mensual (días que se suman si compras otra, un reclamo por día de Guayaquil, no se renueva
 *    sola, el reembolso quita sus días), pero con su propia tabla (la mensual da 20/día y sigue igual).
 *
 * Entrega: gancho compra_aprobada (Ganchos) + conciliación al abrir (por si el gancho no llegó). Reembolso/contracargo
 * (compra_revertida): equipo permanente se quita; tarjeta: se quitan sus 7 días; fondo: se quita lo reclamado (créditos como
 * deuda, materiales hasta lo que quede) y ya no se reclama más. Todo con libro (movimientos_creditos y sede_libro).
 */
final class Impulsos
{
    public const EQUIPO = 'equipo_obra_2';
    public const FONDO = 'fondo_crecimiento';
    public const TARJETA = 'tarjeta_semanal';
    public const PRODUCTOS = [self::EQUIPO, self::FONDO, self::TARJETA];

    /** Equipo de obra alquilado (camino gratis). */
    public const ALQUILER_HORAS = 48;
    public const ALQUILER_ESPERA_HORAS = 120;           // después de que termina: 5 días (una vez por semana en total)
    public const ALQUILER_BASE = 1500;                  // dinero del juego
    public const ALQUILER_POR_NIVEL = 500;
    public const MAX_OBREROS = 3;

    /** Fondo de crecimiento: nivel de la sede oficial => créditos y materiales (fijo, a la vista). Total 10.000 créditos. */
    public const HITOS = [
        5  => ['creditos' => 500,  'mat' => ['cables' => 10, 'placas' => 10, 'paneles' => 10, 'credenciales' => 10, 'planos' => 10, 'chips' => 1]],
        8  => ['creditos' => 700,  'mat' => ['cables' => 16, 'placas' => 16, 'paneles' => 16, 'credenciales' => 16, 'planos' => 16, 'chips' => 1]],
        10 => ['creditos' => 800,  'mat' => ['cables' => 20, 'placas' => 20, 'paneles' => 20, 'credenciales' => 20, 'planos' => 20, 'chips' => 2]],
        12 => ['creditos' => 900,  'mat' => ['cables' => 24, 'placas' => 24, 'paneles' => 24, 'credenciales' => 24, 'planos' => 24, 'chips' => 2]],
        15 => ['creditos' => 1000, 'mat' => ['cables' => 30, 'placas' => 30, 'paneles' => 30, 'credenciales' => 30, 'planos' => 30, 'chips' => 3]],
        18 => ['creditos' => 1200, 'mat' => ['cables' => 36, 'placas' => 36, 'paneles' => 36, 'credenciales' => 36, 'planos' => 36, 'chips' => 3]],
        20 => ['creditos' => 1300, 'mat' => ['cables' => 40, 'placas' => 40, 'paneles' => 40, 'credenciales' => 40, 'planos' => 40, 'chips' => 4]],
        25 => ['creditos' => 1500, 'mat' => ['cables' => 50, 'placas' => 50, 'paneles' => 50, 'credenciales' => 50, 'planos' => 50, 'chips' => 5]],
        30 => ['creditos' => 2100, 'mat' => ['cables' => 60, 'placas' => 60, 'paneles' => 60, 'credenciales' => 60, 'planos' => 60, 'chips' => 6]],
    ];

    /** Tarjeta semanal: lo que se reclama cada día (los días y el precio salen de Catalogo). */
    public const TARJETA_DIAS = 7;
    public const TARJETA_CREDITOS_DIA = 15;
    public const TARJETA_MAT_DIA = ['cables' => 3, 'placas' => 3, 'paneles' => 3, 'credenciales' => 3, 'planos' => 3];

    public static function ahora(): int { return SedeOficial::ahora(); }

    // ------------------------------------------------------------------ ganchos y conciliación
    /** Oyentes de server/src/Ganchos.php (línea en arranque.php: $registrar(Impulsos::class);). */
    public static function registrar(): void
    {
        if (!class_exists(Ganchos::class) || !method_exists(Ganchos::class, 'en')) return;
        Ganchos::en('compra_aprobada', [self::class, 'alCompraAprobada'], 'impulsos');
        Ganchos::en('compra_revertida', [self::class, 'alCompraRevertida'], 'impulsos');
    }

    public static function alCompraAprobada(array $d): void
    {
        $prod = (string) ($d['producto'] ?? '');
        if (in_array($prod, self::PRODUCTOS, true) && isset($d['jugador_id'], $d['compra_id'])) self::entregar((int) $d['jugador_id'], (int) $d['compra_id'], $prod);
    }

    public static function alCompraRevertida(array $d): void
    {
        if (isset($d['compra_id'])) self::revertir((int) $d['compra_id']);
    }

    /** Anota la compra como entregada (una sola vez por compra) y aplica lo que da. true si la entregó ahora. */
    public static function entregar(int $j, int $compraId, string $producto): bool
    {
        if (!in_array($producto, self::PRODUCTOS, true)) return false;
        return Db::tx(function () use ($j, $compraId, $producto): bool {
            $n = Db::q('INSERT OR IGNORE INTO impulsos_compras (compra_id, jugador_id, producto, entregado) VALUES (?, ?, ?, ?)', [$compraId, $j, $producto, self::ahora()])->rowCount();
            if (!$n) return false;
            if ($producto === self::TARJETA) {
                $t = self::ahora();
                $hasta = (int) (Db::valor('SELECT hasta FROM impulsos_tarjeta WHERE jugador_id = ?', [$j]) ?? 0);
                $nuevo = max($t, $hasta) + self::tarjetaDias() * 86400;
                Db::q('INSERT INTO impulsos_tarjeta (jugador_id, hasta) VALUES (?, ?) ON CONFLICT (jugador_id) DO UPDATE SET hasta = excluded.hasta', [$j, $nuevo]);
            }
            return true;
        });
    }

    /** Reembolso o contracargo: quita lo que dio la compra (idempotente). true si revirtió algo ahora. */
    public static function revertir(int $compraId): bool
    {
        return Db::tx(function () use ($compraId): bool {
            $r = Db::fila('SELECT * FROM impulsos_compras WHERE compra_id = ?', [$compraId]);
            if (!$r) {
                // Llegó el reembolso antes que la entrega: se anota para que nunca se entregue
                $c = Db::fila('SELECT jugador_id, producto FROM compras WHERE id = ?', [$compraId]);
                if (!$c || !in_array((string) $c['producto'], self::PRODUCTOS, true)) return false;
                Db::q('INSERT OR IGNORE INTO impulsos_compras (compra_id, jugador_id, producto, entregado, revertido) VALUES (?, ?, ?, NULL, ?)', [$compraId, $c['jugador_id'], $c['producto'], self::ahora()]);
                return false;
            }
            if ($r['revertido'] !== null) return false;
            Db::q('UPDATE impulsos_compras SET revertido = ? WHERE compra_id = ?', [self::ahora(), $compraId]);
            if ($r['entregado'] === null) return true;
            $j = (int) $r['jugador_id'];
            if ($r['producto'] === self::TARJETA) {
                $hasta = Db::valor('SELECT hasta FROM impulsos_tarjeta WHERE jugador_id = ?', [$j]);
                if ($hasta !== null) {
                    $nuevo = (int) $hasta - self::tarjetaDias() * 86400;
                    Db::q('UPDATE impulsos_tarjeta SET hasta = ? WHERE jugador_id = ?', [$nuevo <= self::ahora() ? self::ahora() - 1 : $nuevo, $j]);
                }
            } elseif ($r['producto'] === self::FONDO) {
                foreach (Db::todas('SELECT * FROM impulsos_fondo WHERE compra_id = ? AND revertido IS NULL ORDER BY nivel', [$compraId]) as $h) {
                    if ((int) $h['creditos'] > 0) Monedero::mover($j, -(int) $h['creditos'], 'reversion', 'compra:' . $compraId . ':fondo:' . $h['nivel'], true);
                    $mat = json_decode((string) $h['mat_json'], true) ?: [];
                    if ($mat) SedeOficial::sumarDesdeModulo($j, array_map(fn($n) => -(int) $n, $mat), 'fondo_revertido', 'compra:' . $compraId . ':fondo:' . $h['nivel'], true);
                    Db::q('UPDATE impulsos_fondo SET revertido = ? WHERE compra_id = ? AND nivel = ?', [self::ahora(), $compraId, $h['nivel']]);
                }
            }
            // equipo_obra_2: basta con la marca (permanente() solo cuenta compras sin revertir)
            return true;
        });
    }

    /** Por si el gancho no llegó: entrega lo pagado que falte y revierte lo reembolsado. */
    public static function conciliar(int $j): void
    {
        $ph = implode(',', array_fill(0, count(self::PRODUCTOS), '?'));
        foreach (Db::todas("SELECT id, producto, estado FROM compras WHERE jugador_id = ? AND producto IN ($ph) AND estado IN ('pagado', 'revertido')
                            AND id NOT IN (SELECT compra_id FROM impulsos_compras) ORDER BY id", array_merge([$j], self::PRODUCTOS)) as $c) {
            if ($c['estado'] === 'pagado') self::entregar($j, (int) $c['id'], (string) $c['producto']);
            else Db::q('INSERT OR IGNORE INTO impulsos_compras (compra_id, jugador_id, producto, entregado, revertido) VALUES (?, ?, ?, NULL, ?)', [$c['id'], $j, $c['producto'], self::ahora()]);
        }
        foreach (Db::todas("SELECT i.compra_id FROM impulsos_compras i JOIN compras c ON c.id = i.compra_id
                            WHERE i.jugador_id = ? AND i.revertido IS NULL AND c.estado = 'revertido'", [$j]) as $r) {
            self::revertir((int) $r['compra_id']);
        }
    }

    /** Compra vigente (entregada y sin revertir) de un producto, o null. */
    private static function compraVigente(int $j, string $producto): ?int
    {
        $v = Db::valor('SELECT compra_id FROM impulsos_compras WHERE jugador_id = ? AND producto = ? AND entregado IS NOT NULL AND revertido IS NULL ORDER BY compra_id LIMIT 1', [$j, $producto]);
        return $v === null ? null : (int) $v;
    }

    // ------------------------------------------------------------------ 1. equipo de obra extra
    public static function permanente(int $j): bool { return self::compraVigente($j, self::EQUIPO) !== null; }

    /** Alquiler (o premio) vigente: fila o null. */
    private static function alquilerActivo(int $j): ?array
    {
        return Db::fila('SELECT * FROM impulsos_obra_alquiler WHERE jugador_id = ? AND fin > ? ORDER BY fin DESC LIMIT 1', [$j, self::ahora()]) ?: null;
    }

    /** Equipos de obra que suma este módulo (0 o 1). Lo llama SedeOficial::obreros. Nunca lanza. */
    public static function obrerosExtra(int $j): int
    {
        try { return self::permanente($j) || self::alquilerActivo($j) ? 1 : 0; } catch (\Throwable) { return 0; }
    }

    public static function precioAlquiler(int $nivel): int { return self::ALQUILER_BASE + self::ALQUILER_POR_NIVEL * max(1, $nivel); }

    /** Desde cuándo se puede volver a alquilar (null = ya se puede). Solo cuentan los alquileres pagados en el juego. */
    private static function esperaHasta(int $j): ?int
    {
        $fin = Db::valor("SELECT MAX(fin) FROM impulsos_obra_alquiler WHERE jugador_id = ? AND origen = 'alquiler'", [$j]);
        if ($fin === null) return null;
        $libre = (int) $fin + self::ALQUILER_ESPERA_HORAS * 3600;
        return $libre > self::ahora() ? $libre : null;
    }

    /**
     * Alquila el equipo extra 2 días con dinero del juego. Hay que mandar el precio que se mostró ($confirmar): si cambió
     * (subió de nivel), 409 precio_cambio. El juego descuenta el dinero cuando esto responde ok.
     */
    public static function alquilar(int $j, ?int $confirmar): array
    {
        Cuentas::exigirActiva($j);
        Db::tx(function () use ($j, $confirmar): void {
            self::conciliar($j);
            $nivel = SedeOficial::nivelOficial($j);
            $precio = self::precioAlquiler($nivel);
            Fallo::si(self::permanente($j), 'Ya tienes el equipo de obra extra para siempre.', 409, ['codigo' => 'equipo_ya_tienes']);
            $a = self::alquilerActivo($j);
            Fallo::si($a !== null, 'Ya tienes un equipo de obra extra trabajando.', 409, ['codigo' => 'equipo_alquilado', 'hasta' => $a ? Db::iso((int) $a['fin']) : null]);
            $espera = self::esperaHasta($j);
            Fallo::si($espera !== null, 'El equipo extra se puede alquilar una vez por semana.', 409, ['codigo' => 'equipo_espera', 'disponible' => Db::iso($espera)]);
            Fallo::si($confirmar === null, 'Confirma el precio del alquiler.', 400, ['codigo' => 'confirmar_precio', 'precio' => $precio]);
            Fallo::si($confirmar !== $precio, 'El precio cambió. Revísalo y confirma otra vez.', 409, ['codigo' => 'precio_cambio', 'precio' => $precio]);
            $t = self::ahora();
            Db::q("INSERT INTO impulsos_obra_alquiler (jugador_id, inicio, fin, precio, origen, ref, creado) VALUES (?, ?, ?, ?, 'alquiler', NULL, ?)",
                [$j, $t, $t + self::ALQUILER_HORAS * 3600, $precio, $t]);
        });
        $e = self::estado($j);
        return ['alquilado' => true, 'precio' => $e['equipo']['alquiler']['ultimo_precio']] + $e;
    }

    /**
     * Premio de misiones/eventos (lo llama otro módulo): equipo extra por $horas, una vez por $ref, sin espera.
     * Si ya hay uno puesto, se alarga. true si lo dio ahora.
     */
    public static function darHoras(int $j, int $horas, string $ref): bool
    {
        $horas = max(1, min(24 * 14, $horas));
        return Db::tx(function () use ($j, $horas, $ref): bool {
            if (Db::valor('SELECT 1 FROM impulsos_obra_alquiler WHERE ref = ?', [$ref])) return false;
            $t = self::ahora();
            $a = self::alquilerActivo($j);
            $desde = $a ? (int) $a['fin'] : $t;
            Db::q("INSERT INTO impulsos_obra_alquiler (jugador_id, inicio, fin, precio, origen, ref, creado) VALUES (?, ?, ?, 0, 'premio', ?, ?)",
                [$j, $desde, $desde + $horas * 3600, mb_substr($ref, 0, 200), $t]);
            return true;
        });
    }

    // ------------------------------------------------------------------ 2. fondo de crecimiento
    /** Reclama un hito ($nivel) o todos los alcanzados ($nivel = null). Devuelve lo recibido + el estado. */
    public static function reclamarFondo(int $j, ?int $nivel): array
    {
        Cuentas::exigirActiva($j);
        $dado = Db::tx(function () use ($j, $nivel): array {
            self::conciliar($j);
            $compra = self::compraVigente($j, self::FONDO);
            Fallo::si($compra === null, 'Primero compra el Fondo de crecimiento.', 403, ['codigo' => 'fondo_requerido']);
            Fallo::si($nivel !== null && !isset(self::HITOS[$nivel]), 'Ese nivel no tiene premio en el fondo.', 400, ['codigo' => 'hito_invalido']);
            SedeOficial::sincronizar($j);
            $actual = SedeOficial::nivelOficial($j);
            $ya = array_map('intval', array_column(Db::todas('SELECT nivel FROM impulsos_fondo WHERE compra_id = ?', [$compra]), 'nivel'));
            if ($nivel !== null) {
                Fallo::si(in_array($nivel, $ya, true), 'Ya reclamaste ese premio.', 409, ['codigo' => 'fondo_ya']);
                Fallo::si($actual < $nivel, 'Tu sede oficial todavía no llega a ese nivel.', 409, ['codigo' => 'fondo_nivel_bajo', 'nivel' => $nivel]);
                $lista = [$nivel];
            } else {
                $lista = array_values(array_filter(array_keys(self::HITOS), fn($L) => $L <= $actual && !in_array($L, $ya, true)));
                Fallo::si(!$lista, 'No tienes premios del fondo por reclamar todavía.', 409, ['codigo' => 'fondo_nada']);
            }
            $tot = ['creditos' => 0, 'mat' => []];
            foreach ($lista as $L) {
                $h = self::HITOS[$L];
                $ref = 'compra:' . $compra . ':fondo:' . $L;
                Db::q('INSERT INTO impulsos_fondo (compra_id, jugador_id, nivel, creditos, mat_json, reclamado) VALUES (?, ?, ?, ?, ?, ?)',
                    [$compra, $j, $L, $h['creditos'], json_encode($h['mat']), self::ahora()]);
                if ($h['creditos'] > 0) Monedero::mover($j, $h['creditos'], 'fondo_crecimiento', $ref);
                SedeOficial::sumarDesdeModulo($j, $h['mat'], 'fondo', $ref);
                $tot['creditos'] += $h['creditos'];
                foreach ($h['mat'] as $m => $q) $tot['mat'][$m] = ($tot['mat'][$m] ?? 0) + $q;
            }
            return ['niveles' => $lista] + $tot;
        });
        return ['recibido' => $dado] + self::estado($j);
    }

    // ------------------------------------------------------------------ 3. tarjeta semanal
    public static function tarjetaDias(): int { return (int) (Catalogo::PRODUCTOS[self::TARJETA]['dias'] ?? self::TARJETA_DIAS); }
    public static function tarjetaCreditosDia(): int { return (int) (Catalogo::PRODUCTOS[self::TARJETA]['creditos_dia'] ?? self::TARJETA_CREDITOS_DIA); }

    private static function tarjetaHasta(int $j): ?int
    {
        $v = Db::valor('SELECT hasta FROM impulsos_tarjeta WHERE jugador_id = ?', [$j]);
        return $v === null ? null : (int) $v;
    }

    public static function reclamarTarjeta(int $j): array
    {
        Cuentas::exigirActiva($j);
        Db::tx(function () use ($j): void {
            self::conciliar($j);
            Fallo::si((self::tarjetaHasta($j) ?? 0) <= self::ahora(), 'No tienes la Tarjeta semanal activa.', 403, ['codigo' => 'tarjeta_semanal_requerida']);
            $dia = SedeOficial::dia();
            $n = Db::q('INSERT OR IGNORE INTO impulsos_tarjeta_reclamos (jugador_id, dia, creditos, creado) VALUES (?, ?, ?, ?)', [$j, $dia, self::tarjetaCreditosDia(), self::ahora()])->rowCount();
            Fallo::si(!$n, 'Ya reclamaste lo de hoy. Vuelve mañana.', 409, ['codigo' => 'ya_reclamado', 'proximo' => Db::iso(SedeOficial::proximoDia())]);
            Monedero::mover($j, self::tarjetaCreditosDia(), 'tarjeta_semanal', 'tsem:' . $dia);
            SedeOficial::sumarDesdeModulo($j, self::TARJETA_MAT_DIA, 'tarjeta_semanal', 'tsem:' . $dia);
        });
        return ['recibido' => ['creditos' => self::tarjetaCreditosDia(), 'mat' => self::TARJETA_MAT_DIA]] + self::estado($j);
    }

    // ------------------------------------------------------------------ vista para el juego
    private static function productoJson(string $id): ?array
    {
        $p = Catalogo::producto($id);
        if (!$p) return null;
        return ['id' => $id, 'precio' => $p['precio'], 'activo' => (bool) $p['activo'] && empty($p['oculto'])];
    }

    public static function estado(int $j): array
    {
        self::conciliar($j);
        SedeOficial::sincronizar($j);
        $t = self::ahora();
        $nivel = SedeOficial::nivelOficial($j);
        $obreros = SedeOficial::obreros($j, $nivel);
        $perm = self::permanente($j);
        $a = self::alquilerActivo($j);
        $espera = self::esperaHasta($j);
        $ultimo = Db::valor("SELECT precio FROM impulsos_obra_alquiler WHERE jugador_id = ? AND origen = 'alquiler' ORDER BY id DESC LIMIT 1", [$j]);
        $fondo = self::compraVigente($j, self::FONDO);
        $ya = [];
        if ($fondo !== null) foreach (Db::todas('SELECT nivel FROM impulsos_fondo WHERE compra_id = ?', [$fondo]) as $r) $ya[(int) $r['nivel']] = true;
        $hitos = [];
        $porReclamar = 0;
        foreach (self::HITOS as $L => $h) {
            $alc = $nivel >= $L;
            $rec = isset($ya[$L]);
            if ($fondo !== null && $alc && !$rec) $porReclamar++;
            $hitos[] = ['nivel' => $L, 'creditos' => $h['creditos'], 'mat' => $h['mat'], 'alcanzado' => $alc, 'reclamado' => $rec];
        }
        $hasta = self::tarjetaHasta($j);
        $activa = $hasta !== null && $hasta > $t;
        $dia = SedeOficial::dia($t);
        $hoy = (bool) Db::valor('SELECT 1 FROM impulsos_tarjeta_reclamos WHERE jugador_id = ? AND dia = ?', [$j, $dia]);
        return [
            'ok' => true, 'ahora' => $t, 'dia' => $dia, 'sede_nivel' => $nivel,
            'obreros' => $obreros, 'obreros_max' => self::MAX_OBREROS,
            'equipo' => [
                'producto' => self::EQUIPO, 'permanente' => $perm, 'extra' => self::obrerosExtra($j),
                'alquiler' => [
                    'activo' => $a !== null, 'hasta' => $a ? Db::iso((int) $a['fin']) : null, 'origen' => $a['origen'] ?? null,
                    'horas' => self::ALQUILER_HORAS, 'precio' => self::precioAlquiler($nivel), 'espera_hasta' => Db::iso($espera),
                    'puede' => !$perm && $a === null && $espera === null, 'ultimo_precio' => $ultimo === null ? null : (int) $ultimo,
                ],
            ],
            'fondo' => ['producto' => self::FONDO, 'comprado' => $fondo !== null, 'hitos' => $hitos, 'por_reclamar' => $porReclamar,
                'total_creditos' => array_sum(array_column(self::HITOS, 'creditos'))],
            'tarjeta' => ['producto' => self::TARJETA, 'activa' => $activa, 'hasta' => $activa ? Db::iso($hasta) : null,
                'dias_restantes' => $activa ? (int) ceil(($hasta - $t) / 86400) : 0, 'reclamada_hoy' => $activa && $hoy,
                'creditos_dia' => self::tarjetaCreditosDia(), 'mat_dia' => self::TARJETA_MAT_DIA, 'dias' => self::tarjetaDias(),
                'proximo' => Db::iso(SedeOficial::proximoDia($t))],
            'productos' => array_filter(array_combine(self::PRODUCTOS, array_map([self::class, 'productoJson'], self::PRODUCTOS))),
            'creditos' => Monedero::saldo($j),
        ];
    }
}
