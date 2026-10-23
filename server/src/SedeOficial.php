<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Sede oficial: la copia del SERVIDOR de la sede de js/sede.js (niveles 1 a 30, 4–5 mejoras chicas por nivel, 6 materiales,
 * entrega diaria y obras). Es la que cuenta en competencia (Ventajas: bonoCompetencia) y la que se puede acelerar con
 * créditos (modelo Kingshot: quien paga llega antes, quien no paga llega igual, más tarde).
 *
 * - Mismas reglas de costo que js/sede.js (materiales y edificios por nivel). El dinero del juego vive en la partida y el
 *   servidor no lo ve: en la sede oficial las obras cuestan solo materiales y tiempo real.
 * - Tiempo: un "día del juego" de js/sede.js dura horasDia(L) horas reales: 2 h en el nivel 2 y sube por una curva
 *   (2 + 22 × ((L − 2) / 28)^1,5) hasta 24 h en el nivel 30. Ver server/INTEGRAR_SEDE_OFICIAL.md (tabla).
 * - Requisito de cada nivel: la fama pública de la cuenta (jugadores.fama_publica, la misma de las asociaciones).
 *   Los requisitos de capítulo/historia de js/sede.js son del juego local y el servidor no los puede ver.
 * - Materiales del servidor: entrega diaria (día real de America/Guayaquil), intentos en línea validados
 *   (premioIntento, lo llama cada módulo), entregas tipo "materiales"/"acelerador" (Copa, regalos de asociación del VIP)
 *   y packs con dinero real (pack_obra_s/m/l, contenido fijo).
 * - Acelerar: termina una obra ya por créditos (1 crédito cada 6 minutos que falten, mínimo 5; se muestra antes de
 *   confirmar y se cobra por Monedero, con libro). Ayudas de la asociación: −1 % de la obra o 5 minutos (lo mayor),
 *   máximo 10 por obra (de 10 a 20 con AyudaAsoc: nivel de la asociación + investigación); el que ayuda recibe 1 material
 *   (sus primeras 10 ayudas del día) y fichas de asociación. Pedir ayuda / "Ayudar a todos": server/src/AyudaAsoc.php.
 * Todo lo que cambia algo va en Db::tx (BEGIN IMMEDIATE). Los errores son Fallo con 'codigo'.
 */
final class SedeOficial
{
    public const MAX_NIVEL = 30;
    public const MATS = ['cables', 'placas', 'paneles', 'credenciales', 'planos', 'chips'];
    public const COMUNES = ['cables', 'placas', 'paneles', 'credenciales', 'planos'];
    public const BASE5 = ['control', 'bodega', 'estudio', 'comercial', 'movil'];
    public const EDIFICIOS = ['control', 'bodega', 'estudio', 'comercial', 'movil', 'escuela'];
    /** Igual que RECETA de js/sede.js (material y su peso en el costo). */
    public const RECETA = [
        'control' => [['placas', 0.5], ['cables', 0.5]],
        'bodega' => [['cables', 0.55], ['planos', 0.45]],
        'estudio' => [['paneles', 0.6], ['credenciales', 0.4]],
        'comercial' => [['credenciales', 0.6], ['planos', 0.4]],
        'movil' => [['placas', 0.4], ['paneles', 0.3], ['cables', 0.3]],
        'escuela' => [['planos', 0.4], ['credenciales', 0.3], ['paneles', 0.3]],
        'sede' => [['planos', 0.35], ['placas', 0.35], ['paneles', 0.3]],
    ];
    public const SEGUNDO_OBRERO = 5;
    public const ESCUELA_DESDE = 8;
    public const RARO_DESDE = 6;
    public const MAT = ['base' => 9, 'crec' => 1.105, 'porNivel' => 1.2];
    public const COFRE = ['base' => 4, 'porNivel' => 0.55, 'chipDesde' => 4, 'chipProb' => 0.22, 'chipPorNivel' => 0.012];

    /** Horas reales por "día del juego": de HORAS_MIN (nivel 2) a HORAS_MAX (nivel 30) con esta curva. */
    public const HORAS_MIN = 2.0;
    public const HORAS_MAX = 24.0;
    public const CURVA = 1.5;

    /** Acelerar con créditos: 1 crédito por cada SEG_POR_CREDITO segundos que falten, mínimo COSTO_MIN. */
    public const SEG_POR_CREDITO = 360;
    public const COSTO_MIN = 5;

    /** Ayudas de la asociación. */
    public const AYUDAS_MAX = 10;          // por obra
    public const AYUDA_PCT = 0.01;         // 1 % de la duración de la obra...
    public const AYUDA_MIN_SEG = 300;      // ...o 5 minutos, lo que sea mayor
    public const AYUDAS_DIA = 30;          // ayudas que una persona puede dar por día
    public const AYUDA_PREMIOS_DIA = 10;   // de esas, cuántas le dan 1 material

    /** Intentos en línea validados (premioIntento). */
    public const MODOS = ['liga', 'festival', 'copa', 'duelo', 'desafio'];
    public const INTENTO = ['estrellas' => [0, 0.3, 0.6, 1, 1.35, 1.7], 'porNivel' => 0.03, 'cincoExtra' => 2, 'cincoChip' => 0.4, 'topeDia' => 60, 'chipsDia' => 2];

    /** Migración de la sede local: nunca más de este nivel. */
    public const MIGRAR_MAX = 8;

    /** Packs con dinero real (contenido FIJO y a la vista: nada al azar). Los precios por defecto los repite INTEGRAR. */
    public const PACKS = [
        'pack_obra_s' => ['nombre' => 'Pack de obra S', 'precio' => 1.99, 'acelera_min' => 600,
            'mat' => ['cables' => 12, 'placas' => 12, 'paneles' => 12, 'credenciales' => 12, 'planos' => 12, 'chips' => 1]],
        'pack_obra_m' => ['nombre' => 'Pack de obra M', 'precio' => 4.99, 'acelera_min' => 1800,
            'mat' => ['cables' => 32, 'placas' => 32, 'paneles' => 32, 'credenciales' => 32, 'planos' => 32, 'chips' => 3]],
        'pack_obra_l' => ['nombre' => 'Pack de obra L', 'precio' => 9.99, 'acelera_min' => 4800,
            'mat' => ['cables' => 70, 'placas' => 70, 'paneles' => 70, 'credenciales' => 70, 'planos' => 70, 'chips' => 8]],
    ];

    public const ZONA = 'America/Guayaquil';

    private static ?int $reloj = null;

    /** SOLO PRUEBAS: congela el reloj (null = el de verdad). */
    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    /** Día real en Guayaquil (AAAA-MM-DD). */
    public static function dia(?int $t = null): string
    {
        return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(new \DateTimeZone(self::ZONA))->format('Y-m-d');
    }

    /** Segundo Unix en que empieza el próximo día de Guayaquil. */
    public static function proximoDia(?int $t = null): int
    {
        $z = new \DateTimeZone(self::ZONA);
        return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone($z)->setTime(0, 0)->modify('+1 day')->getTimestamp();
    }

    // ------------------------------------------------------------------ reglas (iguales a js/sede.js)
    public static function requisitoFama(int $L): int
    {
        $T = [3 => 6, 5 => 12, 6 => 15, 7 => 18, 8 => 22, 9 => 25, 11 => 32];
        if ($L <= 12) return $T[$L] ?? 0;
        return min(55, 30 + 2 * ($L - 12));
    }

    /** @return list<string> edificios con mejora chica para llegar al nivel $L */
    public static function edificiosDe(int $L): array
    {
        if ($L < 2 || $L > self::MAX_NIVEL) return [];
        if ($L < self::ESCUELA_DESDE) {
            $fuera = self::BASE5[($L - 2) % 5];
            return array_values(array_filter(self::BASE5, fn($e) => $e !== $fuera));
        }
        $fuera = self::BASE5[($L - self::ESCUELA_DESDE) % 5];
        return array_merge(array_values(array_filter(self::BASE5, fn($e) => $e !== $fuera)), ['escuela']);
    }

    private static function unidades(int $L): float
    {
        return self::MAT['base'] * pow(self::MAT['crec'], $L - 2) + self::MAT['porNivel'] * ($L - 2);
    }

    private static function repartir(float $total, array $receta): array
    {
        $o = [];
        foreach ($receta as [$m, $w]) $o[$m] = max(1, (int) round($total * $w));
        return $o;
    }

    public static function diasMejora(int $L): int { return (int) ceil($L / 5); }
    public static function diasNivel(int $L): int { return 1 + (int) ceil($L / 6); }

    /** Horas reales que dura un "día del juego" de una obra del nivel $L. */
    public static function horasDia(int $L): float
    {
        return self::HORAS_MIN + (self::HORAS_MAX - self::HORAS_MIN) * pow(max(0, $L - 2) / (self::MAX_NIVEL - 2), self::CURVA);
    }

    /** Duración en segundos (minutos enteros) de $dias días del juego en el nivel $L. */
    public static function segundos(int $L, int $dias): int { return (int) round($dias * self::horasDia($L) * 60) * 60; }

    /** Costo de una mejora chica ($ed) para llegar al nivel $L, o de la sede principal ($ed = 'sede'). */
    public static function costo(int $L, string $ed): array
    {
        if ($ed === 'sede') {
            $mat = self::repartir(self::unidades($L) * 1.2, self::RECETA['sede']);
            if ($L >= self::RARO_DESDE) $mat['chips'] = (int) ceil(($L - 5) / 2);
            $dias = self::diasNivel($L);
        } else {
            $mat = self::repartir(self::unidades($L), self::RECETA[$ed] ?? self::RECETA['control']);
            if ($L >= self::RARO_DESDE && ($ed === 'control' || $ed === 'escuela')) $mat['chips'] = (int) ceil(($L - 5) / 4);
            $dias = self::diasMejora($L);
        }
        return ['mat' => $mat, 'dias' => $dias, 'segundos' => self::segundos($L, $dias)];
    }

    /** Créditos para terminar ya una obra a la que le faltan $restante segundos. */
    public static function costoAcelerar(int $restante): int
    {
        return $restante <= 0 ? 0 : max(self::COSTO_MIN, (int) ceil($restante / self::SEG_POR_CREDITO));
    }

    /**
     * Ayudas máximas por obra para las obras de $duenio: 10 de base y, con server/src/AyudaAsoc.php, de 10 a 20 según el
     * nivel de su asociación y la investigación "Refuerzos" (server/INTEGRAR_AYUDA_ASOC.md).
     */
    public static function topeAyudas(int $duenio): int
    {
        try { if (class_exists(AyudaAsoc::class)) return AyudaAsoc::topeAyudas($duenio); } catch (\Throwable) {}
        return self::AYUDAS_MAX;
    }

    /** Lo que descuenta una ayuda en una obra de $duracion segundos. */
    public static function segundosAyuda(int $duracion): int { return max(self::AYUDA_MIN_SEG, (int) ceil($duracion * self::AYUDA_PCT)); }

    /** Bono de calidad en competencia por el nivel oficial (para Ventajas): +2 al 5, +4 al 10, +6 del 20 en adelante. */
    public static function bonoPorNivel(int $n): int { return $n >= 20 ? 6 : ($n >= 10 ? 4 : ($n >= 5 ? 2 : 0)); }

    public static function bonoCompetencia(int $j): int
    {
        try { return self::bonoPorNivel(self::nivelOficial($j)); } catch (\Throwable) { return 0; }
    }

    /** Lo mismo que nivelOficial() (lo usa Vip::revisarHitos para los hitos sede_5 y sede_10). */
    public static function nivel(int $j): int { return self::nivelOficial($j); }

    /** Nivel oficial sin escribir nada (cuenta una obra de nivel que ya terminó aunque nadie haya abierto la sede). */
    public static function nivelOficial(int $j): int
    {
        $n = Db::valor('SELECT nivel FROM sede_oficial WHERE jugador_id = ?', [$j]);
        $n = $n === null ? 1 : (int) $n;
        $fin = Db::valor("SELECT nivel FROM sede_obras WHERE jugador_id = ? AND tipo = 'nivel' AND estado = 'activa' AND fin <= ? AND nivel = ?", [$j, self::ahora(), $n + 1]);
        return $fin !== null ? $n + 1 : $n;
    }

    /** Equipos de obra: 1, 2 desde el nivel 5 y lo que dé Vip::slotsObra (si esa clase existe). Máximo 3. */
    public static function obreros(int $j, int $nivel): int
    {
        $n = $nivel >= self::SEGUNDO_OBRERO ? 2 : 1;
        try {
            if (class_exists(Vip::class) && method_exists(Vip::class, 'slotsObra')) {
                $v = Vip::slotsObra($j);
                $n = max($n, is_bool($v) ? ($v ? 2 : 1) : (int) $v);
            }
        } catch (\Throwable) {}
        return max(1, min(3, $n));
    }

    /** Nivel más alto que se acepta al traer la sede local: por antigüedad de la cuenta, por fama y nunca más de 8. */
    public static function nivelMaxMigracion(int $edadDias, int $fama): int
    {
        $porFama = 1;
        for ($k = 2; $k <= self::MIGRAR_MAX; $k++) { if (self::requisitoFama($k) > $fama) break; $porFama = $k; }
        return max(1, min(self::MIGRAR_MAX, 2 + 2 * max(0, $edadDias), $porFama));
    }

    // ------------------------------------------------------------------ estado guardado
    private static function fila(int $j): array
    {
        $t = self::ahora();
        Db::q('INSERT OR IGNORE INTO sede_oficial (jugador_id, creado, actualizado) VALUES (?, ?, ?)', [$j, $t, $t]);
        return Db::fila('SELECT * FROM sede_oficial WHERE jugador_id = ?', [$j]);
    }

    /** Para otros módulos (AyudaAsoc: donaciones y tienda de fichas): como sumar(), con la fila creada si falta. */
    public static function moverMateriales(int $j, array $bolsa, string $motivo, ?string $ref): void
    {
        Db::tx(function () use ($j, $bolsa, $motivo, $ref): void { self::fila($j); self::sumar($j, $bolsa, $motivo, $ref); });
    }

    /** Suma (o resta, con negativos) materiales y/o 'acelera_min', con libro. Lanza Fallo si algo quedaría negativo. */
    private static function sumar(int $j, array $bolsa, string $motivo, ?string $ref): void
    {
        $t = self::ahora();
        $dia = self::dia($t);
        foreach ($bolsa as $k => $n) {
            $n = (int) $n;
            if ($n === 0) continue;
            if (!in_array($k, self::MATS, true) && $k !== 'acelera_min') throw new \InvalidArgumentException('Material desconocido: ' . $k);
            $ok = Db::q("UPDATE sede_oficial SET $k = $k + ?, actualizado = ? WHERE jugador_id = ? AND $k + ? >= 0", [$n, $t, $j, $n])->rowCount();
            if (!$ok) throw new Fallo('No tienes materiales suficientes.', 409, ['codigo' => 'faltan_materiales']);
            Db::q('INSERT INTO sede_libro (jugador_id, material, cambio, motivo, ref, dia, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$j, $k, $n, $motivo, $ref === null ? null : mb_substr($ref, 0, 200), $dia, $t]);
        }
    }

    private static function materiales(array $f): array
    {
        $o = [];
        foreach (self::MATS as $m) $o[$m] = (int) $f[$m];
        return $o;
    }

    /** @return array<string,int> "<nivel>.<edificio>" => 1 */
    private static function mejorasHechas(int $j): array
    {
        $o = [];
        foreach (Db::todas('SELECT nivel, ed FROM sede_mejoras WHERE jugador_id = ? ORDER BY nivel, ed', [$j]) as $m) $o[$m['nivel'] . '.' . $m['ed']] = 1;
        return $o;
    }

    private static function obrasActivas(int $j): array
    {
        return Db::todas("SELECT * FROM sede_obras WHERE jugador_id = ? AND estado = 'activa' ORDER BY fin, id", [$j]);
    }

    /** Termina las obras cuyo reloj ya llegó (en orden). Devuelve las que terminó. */
    private static function terminarVencidas(int $j): array
    {
        $hechas = Db::todas("SELECT * FROM sede_obras WHERE jugador_id = ? AND estado = 'activa' AND fin <= ? ORDER BY fin, id", [$j, self::ahora()]);
        foreach ($hechas as $o) {
            if ($o['tipo'] === 'mejora') {
                Db::q("INSERT OR IGNORE INTO sede_mejoras (jugador_id, nivel, ed, terminado, origen) VALUES (?, ?, ?, ?, 'obra')", [$j, $o['nivel'], $o['ed'], $o['fin']]);
            } else {
                Db::q('UPDATE sede_oficial SET nivel = ?, actualizado = ? WHERE jugador_id = ? AND nivel = ?', [$o['nivel'], self::ahora(), $j, (int) $o['nivel'] - 1]);
            }
            Db::q("UPDATE sede_obras SET estado = 'terminada', terminada = ? WHERE id = ?", [$o['fin'], $o['id']]);
        }
        return $hechas;
    }

    /** Pone al día la sede: obras terminadas, entregas de materiales nuevas y packs comprados. Devuelve la fila. */
    public static function sincronizar(int $j): array
    {
        return Db::tx(function () use ($j): array {
            self::fila($j);
            self::terminarVencidas($j);
            self::absorberEntregas($j);
            self::conciliarPacks($j);
            return Db::fila('SELECT * FROM sede_oficial WHERE jugador_id = ?', [$j]);
        });
    }

    /** Entregas tipo "materiales" (item = material) y "acelerador" (cantidad = minutos): Copa, regalos de asociación... */
    private static function absorberEntregas(int $j): void
    {
        $filas = Db::todas("SELECT * FROM entregas e WHERE e.jugador_id = ? AND e.tipo IN ('materiales', 'acelerador')
                            AND NOT EXISTS (SELECT 1 FROM sede_fuentes s WHERE s.fuente = 'entrega' AND s.ref = CAST(e.id AS TEXT)) ORDER BY e.id LIMIT 200", [$j]);
        foreach ($filas as $e) {
            $n = Db::q("INSERT OR IGNORE INTO sede_fuentes (fuente, ref, jugador_id, creado) VALUES ('entrega', ?, ?, ?)", [(string) $e['id'], $j, self::ahora()])->rowCount();
            if (!$n) continue;
            $c = max(0, min(100000, (int) $e['cantidad']));
            $ref = 'entrega:' . $e['id'] . ':' . $e['origen'];
            if ($e['tipo'] === 'acelerador') { if ($c > 0) self::sumar($j, ['acelera_min' => $c], 'entrega', $ref); continue; }
            if (in_array($e['item'], self::MATS, true) && $c > 0) self::sumar($j, [$e['item'] => $c], 'entrega', $ref);
        }
    }

    // ------------------------------------------------------------------ packs con dinero real
    public static function esPack(string $producto): bool { return isset(self::PACKS[$producto]); }

    /** Texto fijo del contenido (para el catálogo y la tienda). */
    public static function detallePack(string $producto): string
    {
        $p = self::PACKS[$producto] ?? null;
        if (!$p) return '';
        $nom = ['cables' => 'cables', 'placas' => 'placas', 'paneles' => 'paneles LED', 'credenciales' => 'credenciales', 'planos' => 'planos', 'chips' => 'chips 4K'];
        $l = [];
        foreach ($p['mat'] as $k => $n) $l[] = $n . ' ' . ($k === 'chips' && $n === 1 ? 'chip 4K' : $nom[$k]);
        $ult = array_pop($l);
        return 'Sede oficial: ' . intdiv($p['acelera_min'], 60) . ' h de aceleradores de obra + ' . implode(', ', $l) . ' y ' . $ult . '. Contenido fijo.';
    }

    /** Entrega el pack de una compra (una sola vez por compra). true si lo entregó ahora. */
    public static function entregarPack(int $j, int $compraId, string $producto): bool
    {
        $p = self::PACKS[$producto] ?? null;
        if (!$p) return false;
        return Db::tx(function () use ($j, $compraId, $producto, $p): bool {
            $n = Db::q('INSERT OR IGNORE INTO sede_packs (compra_id, jugador_id, producto, entregado) VALUES (?, ?, ?, ?)', [$compraId, $j, $producto, self::ahora()])->rowCount();
            if (!$n) return false;
            self::fila($j);
            self::sumar($j, $p['mat'] + ['acelera_min' => $p['acelera_min']], 'pack', 'compra:' . $compraId . ':' . $producto);
            return true;
        });
    }

    /** Reembolso o contracargo de un pack: quita lo que dio (lo que ya gastó no se puede quitar: queda en el libro). */
    public static function revertirPack(int $compraId): bool
    {
        return Db::tx(function () use ($compraId): bool {
            $r = Db::fila('SELECT * FROM sede_packs WHERE compra_id = ?', [$compraId]);
            if (!$r) {
                $c = Db::fila('SELECT jugador_id, producto FROM compras WHERE id = ?', [$compraId]);
                if (!$c || !self::esPack((string) $c['producto'])) return false;
                Db::q('INSERT OR IGNORE INTO sede_packs (compra_id, jugador_id, producto, entregado, revertido) VALUES (?, ?, ?, NULL, ?)', [$compraId, $c['jugador_id'], $c['producto'], self::ahora()]);
                return false;
            }
            if ($r['revertido'] !== null || $r['entregado'] === null) return false;
            $j = (int) $r['jugador_id'];
            $p = self::PACKS[$r['producto']] ?? null;
            Db::q('UPDATE sede_packs SET revertido = ? WHERE compra_id = ?', [self::ahora(), $compraId]);
            if (!$p) return true;
            $f = self::fila($j);
            $quitar = [];
            foreach ($p['mat'] + ['acelera_min' => $p['acelera_min']] as $k => $n) $quitar[$k] = -min((int) $f[$k], (int) $n);
            self::sumar($j, $quitar, 'pack_revertido', 'compra:' . $compraId . ':' . $r['producto']);
            return true;
        });
    }

    /** Por si el gancho de compras no llegó: entrega los packs pagados que falten y revierte los reembolsados. */
    private static function conciliarPacks(int $j): void
    {
        $ids = array_keys(self::PACKS);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (Db::todas("SELECT id, producto, estado FROM compras WHERE jugador_id = ? AND producto IN ($ph) AND estado IN ('pagado', 'revertido')
                            AND id NOT IN (SELECT compra_id FROM sede_packs) ORDER BY id", array_merge([$j], $ids)) as $c) {
            if ($c['estado'] === 'pagado') self::entregarPack($j, (int) $c['id'], (string) $c['producto']);
            else Db::q('INSERT OR IGNORE INTO sede_packs (compra_id, jugador_id, producto, entregado, revertido) VALUES (?, ?, ?, NULL, ?)', [$c['id'], $j, $c['producto'], self::ahora()]);
        }
        foreach (Db::todas("SELECT p.compra_id FROM sede_packs p JOIN compras c ON c.id = p.compra_id
                            WHERE p.jugador_id = ? AND p.revertido IS NULL AND p.entregado IS NOT NULL AND c.estado = 'revertido'", [$j]) as $r) {
            self::revertirPack((int) $r['compra_id']);
        }
    }

    /** Oyentes de server/src/Ganchos.php (línea en arranque.php: \EnVivo\SedeOficial::registrar();). */
    public static function registrar(): void
    {
        if (!class_exists(Ganchos::class) || !method_exists(Ganchos::class, 'en')) return;
        Ganchos::en('compra_aprobada', [self::class, 'alCompraAprobada']);
        Ganchos::en('compra_revertida', [self::class, 'alCompraRevertida']);
    }

    public static function alCompraAprobada(array $d): void
    {
        $prod = (string) ($d['producto'] ?? '');
        if (self::esPack($prod) && isset($d['jugador_id'], $d['compra_id'])) self::entregarPack((int) $d['jugador_id'], (int) $d['compra_id'], $prod);
    }

    public static function alCompraRevertida(array $d): void
    {
        if (isset($d['compra_id'])) self::revertirPack((int) $d['compra_id']);
    }

    // ------------------------------------------------------------------ vista para el juego
    public static function vista(int $j): array
    {
        $f = self::sincronizar($j);
        $t = self::ahora();
        $nivel = (int) $f['nivel'];
        $hechas = self::mejorasHechas($j);
        $activas = self::obrasActivas($j);
        $mat = self::materiales($f);
        $falta = function (array $c) use ($mat): array { $o = []; foreach ($c as $m => $n) if ($mat[$m] < $n) $o[$m] = $n - $mat[$m]; return $o; };
        $nivelEd = function (string $ed) use ($hechas): int { $n = 0; foreach ($hechas as $k => $_) if (explode('.', $k)[1] === $ed) $n++; return $n; };
        $etapa = null;
        if ($nivel < self::MAX_NIVEL) {
            $L = $nivel + 1;
            $mej = [];
            foreach (self::edificiosDe($L) as $ed) {
                $c = self::costo($L, $ed);
                $o = current(array_filter($activas, fn($x) => $x['tipo'] === 'mejora' && (int) $x['nivel'] === $L && $x['ed'] === $ed)) ?: null;
                $mej[] = ['ed' => $ed, 'mat' => $c['mat'], 'dias' => $c['dias'], 'segundos' => $c['segundos'], 'hecha' => isset($hechas[$L . '.' . $ed]),
                    'obra_id' => $o ? (int) $o['id'] : null, 'falta' => $falta($c['mat']), 'nivel_ed' => $nivelEd($ed)];
            }
            $cs = self::costo($L, 'sede');
            $on = current(array_filter($activas, fn($x) => $x['tipo'] === 'nivel')) ?: null;
            $fama = (int) (Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$j]) ?? 0);
            $rf = self::requisitoFama($L);
            $req = $rf > 0 ? [['k' => 'req_fama', 'p' => ['n' => $rf], 'ok' => $fama >= $rf]] : [];
            $nh = count(array_filter($mej, fn($m) => $m['hecha']));
            $etapa = ['objetivo' => $L, 'mejoras' => $mej, 'hechas' => $nh,
                'sede' => ['mat' => $cs['mat'], 'dias' => $cs['dias'], 'segundos' => $cs['segundos'], 'obra_id' => $on ? (int) $on['id'] : null, 'falta' => $falta($cs['mat']),
                    'req' => $req, 'listo' => $nh === count($mej) && !array_filter($req, fn($r) => !$r['ok'])]];
        }
        $fresca = $nivel === 1 && !$hechas && !(int) Db::valor('SELECT COUNT(*) FROM sede_obras WHERE jugador_id = ?', [$j]);
        $edad = intdiv(max(0, $t - (int) (Db::valor('SELECT creado FROM jugadores WHERE id = ?', [$j]) ?? $t)), 86400);
        $famaPub = (int) (Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$j]) ?? 0);
        $dia = self::dia($t);
        return [
            'ok' => true, 'ahora' => $t, 'dia' => $dia,
            'sede' => [
                'nivel' => $nivel, 'max' => $nivel >= self::MAX_NIVEL, 'materiales' => $mat, 'aceleradores_min' => (int) $f['acelera_min'],
                'mejoras' => $hechas, 'obreros' => self::obreros($j, $nivel), 'etapa' => $etapa,
                'obras' => array_map(fn($o) => self::obraJson($o, $t, self::topeAyudas($j)), $activas),
                'cofre' => ['disponible' => $f['ultimo_cofre'] !== $dia, 'proximo' => self::proximoDia($t)],
                'bono_competencia' => self::bonoPorNivel($nivel),
                'migracion' => ['posible' => (int) $f['migrado'] === 0 && $fresca, 'nivel_max' => self::nivelMaxMigracion($edad, $famaPub)],
            ],
            'creditos' => Monedero::saldo($j),
            'reglas' => ['seg_por_credito' => self::SEG_POR_CREDITO, 'costo_min' => self::COSTO_MIN, 'ayudas_max' => self::topeAyudas($j),
                'ayuda_pct' => self::AYUDA_PCT, 'ayuda_min_seg' => self::AYUDA_MIN_SEG],
        ];
    }

    private static function obraJson(array $o, int $t, int $tope = self::AYUDAS_MAX): array
    {
        $rest = max(0, (int) $o['fin'] - $t);
        return ['id' => (int) $o['id'], 'tipo' => $o['tipo'], 'ed' => $o['ed'], 'nivel' => (int) $o['nivel'], 'inicio' => (int) $o['inicio'], 'fin' => (int) $o['fin'],
            'duracion' => (int) $o['duracion'], 'restante' => $rest, 'ayudas' => (int) $o['ayudas'], 'ayudas_max' => $tope,
            'costo_creditos' => self::costoAcelerar($rest), 'segundos_ayuda' => self::segundosAyuda((int) $o['duracion'])];
    }

    // ------------------------------------------------------------------ acciones
    private static function nuevaObra(int $j, string $tipo, string $ed, int $L, int $seg): int
    {
        $t = self::ahora();
        Db::q('INSERT INTO sede_obras (jugador_id, tipo, ed, nivel, inicio, duracion, fin) VALUES (?, ?, ?, ?, ?, ?, ?)', [$j, $tipo, $ed, $L, $t, $seg, $t + $seg]);
        return Db::ultimoId();
    }

    private static function exigirMateriales(array $f, array $c): void
    {
        $o = [];
        foreach ($c as $m => $n) if ((int) $f[$m] < $n) $o[$m] = $n - (int) $f[$m];
        Fallo::si((bool) $o, 'Te faltan materiales.', 409, ['codigo' => 'faltan_materiales', 'falta' => $o]);
    }

    /** Empieza la mejora chica del edificio $ed para el próximo nivel. */
    public static function mejorar(int $j, string $ed): array
    {
        Cuentas::exigirActiva($j);
        Db::tx(function () use ($j, $ed): void {
            $f = self::sincronizar($j);
            $nivel = (int) $f['nivel'];
            Fallo::si($nivel >= self::MAX_NIVEL, 'Tu sede ya está al máximo.', 409, ['codigo' => 'max']);
            $L = $nivel + 1;
            Fallo::si(!in_array($ed, self::edificiosDe($L), true), 'Ese edificio no tiene mejora en este nivel.', 400, ['codigo' => 'edificio_invalido']);
            Fallo::si((bool) Db::valor('SELECT 1 FROM sede_mejoras WHERE jugador_id = ? AND nivel = ? AND ed = ?', [$j, $L, $ed]), 'Esa mejora ya está lista.', 409, ['codigo' => 'ya_hecha']);
            $act = self::obrasActivas($j);
            Fallo::si((bool) array_filter($act, fn($o) => $o['tipo'] === 'mejora' && (int) $o['nivel'] === $L && $o['ed'] === $ed), 'Esa mejora ya está en obra.', 409, ['codigo' => 'en_obra']);
            Fallo::si(count($act) >= self::obreros($j, $nivel), 'Tu equipo de obra está ocupado.', 409, ['codigo' => 'sin_obrero']);
            $c = self::costo($L, $ed);
            self::exigirMateriales($f, $c['mat']);
            $id = self::nuevaObra($j, 'mejora', $ed, $L, $c['segundos']);
            self::sumar($j, array_map(fn($n) => -$n, $c['mat']), 'obra', 'obra:' . $id . ':' . $L . '.' . $ed);
        });
        return self::vista($j);
    }

    /** Empieza la obra de la sede principal (la que sube el nivel). */
    public static function subir(int $j): array
    {
        Cuentas::exigirActiva($j);
        Db::tx(function () use ($j): void {
            $f = self::sincronizar($j);
            $nivel = (int) $f['nivel'];
            Fallo::si($nivel >= self::MAX_NIVEL, 'Tu sede ya está al máximo.', 409, ['codigo' => 'max']);
            $L = $nivel + 1;
            $act = self::obrasActivas($j);
            Fallo::si((bool) array_filter($act, fn($o) => $o['tipo'] === 'nivel'), 'La sede principal ya está en obra.', 409, ['codigo' => 'en_obra']);
            $hechas = (int) Db::valor('SELECT COUNT(*) FROM sede_mejoras WHERE jugador_id = ? AND nivel = ?', [$j, $L]);
            $total = count(self::edificiosDe($L));
            Fallo::si($hechas < $total, 'Primero termina las mejoras de este nivel (' . $hechas . '/' . $total . ').', 409, ['codigo' => 'faltan_mejoras', 'hechas' => $hechas, 'total' => $total]);
            $rf = self::requisitoFama($L);
            $fama = (int) (Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$j]) ?? 0);
            Fallo::si($fama < $rf, 'Necesitas fama ' . $rf . ' para el nivel ' . $L . '.', 409, ['codigo' => 'requisito', 'fama' => $rf]);
            Fallo::si(count($act) >= self::obreros($j, $nivel), 'Tu equipo de obra está ocupado.', 409, ['codigo' => 'sin_obrero']);
            $c = self::costo($L, 'sede');
            self::exigirMateriales($f, $c['mat']);
            $id = self::nuevaObra($j, 'nivel', 'sede', $L, $c['segundos']);
            self::sumar($j, array_map(fn($n) => -$n, $c['mat']), 'obra', 'obra:' . $id . ':nivel' . $L);
        });
        return self::vista($j);
    }

    /** Elige un material común al azar (servidor: random_int). */
    private static function alAzar(): string { return self::COMUNES[random_int(0, count(self::COMUNES) - 1)]; }
    private static function probabilidad(float $p): bool { return random_int(0, 999999) < (int) round($p * 1000000); }

    /** El material común que más falta para la etapa actual (la mitad de la entrega diaria va ahí). */
    private static function masFalta(int $j, array $f): ?string
    {
        $nivel = (int) $f['nivel'];
        if ($nivel >= self::MAX_NIVEL) return null;
        $L = $nivel + 1;
        $hechas = self::mejorasHechas($j);
        $act = self::obrasActivas($j);
        $tot = [];
        $suma = function (array $c) use (&$tot, $f): void { foreach ($c as $m => $n) if ((int) $f[$m] < $n) $tot[$m] = ($tot[$m] ?? 0) + $n - (int) $f[$m]; };
        foreach (self::edificiosDe($L) as $ed) {
            if (isset($hechas[$L . '.' . $ed]) || array_filter($act, fn($o) => $o['tipo'] === 'mejora' && $o['ed'] === $ed && (int) $o['nivel'] === $L)) continue;
            $suma(self::costo($L, $ed)['mat']);
        }
        if (!array_filter($act, fn($o) => $o['tipo'] === 'nivel')) $suma(self::costo($L, 'sede')['mat']);
        $mejor = null;
        foreach (self::COMUNES as $m) if (($tot[$m] ?? 0) > 0 && ($mejor === null || $tot[$m] > $tot[$mejor])) $mejor = $m;
        return $mejor;
    }

    /** Entrega diaria (una vez por día real de Guayaquil). Devuelve ['bolsa', ...vista]. */
    public static function cofre(int $j): array
    {
        Cuentas::exigirActiva($j);
        $bolsa = Db::tx(function () use ($j): array {
            $f = self::sincronizar($j);
            $dia = self::dia();
            Fallo::si($f['ultimo_cofre'] === $dia, 'Ya reclamaste la entrega de hoy. Vuelve mañana.', 409, ['codigo' => 'cofre_ya', 'proximo' => self::proximoDia()]);
            $nivel = (int) $f['nivel'];
            $C = self::COFRE;
            $n = (int) floor($C['base'] + $nivel * $C['porNivel']);
            $foco = self::masFalta($j, $f);
            $bolsa = [];
            $fijos = $foco !== null ? intdiv($n, 2) : 0;
            if ($fijos) $bolsa[$foco] = $fijos;
            for ($i = $fijos; $i < $n; $i++) { $m = self::alAzar(); $bolsa[$m] = ($bolsa[$m] ?? 0) + 1; }
            if ($nivel >= $C['chipDesde'] && self::probabilidad($C['chipProb'] + $C['chipPorNivel'] * $nivel)) $bolsa['chips'] = 1;
            $o = [];
            foreach (self::MATS as $m) if (!empty($bolsa[$m])) $o[$m] = $bolsa[$m];
            self::sumar($j, $o, 'cofre', 'cofre:' . $dia);
            Db::q('UPDATE sede_oficial SET ultimo_cofre = ? WHERE jugador_id = ?', [$dia, $j]);
            return $o;
        });
        return ['bolsa' => $bolsa] + self::vista($j);
    }

    /**
     * Acelera una obra propia: con créditos ($usar 'creditos', hay que mandar el costo que se mostró: si sube, 409
     * costo_cambio) o con los aceleradores guardados ($usar 'aceleradores', minutos de packs y regalos).
     */
    public static function acelerar(int $j, int $obraId, ?int $confirmar, string $usar = 'creditos'): array
    {
        Cuentas::exigirActiva($j);
        Fallo::si(!in_array($usar, ['creditos', 'aceleradores'], true), 'Forma de acelerar no válida.', 400, ['codigo' => 'datos_invalidos']);
        $r = Db::tx(function () use ($j, $obraId, $confirmar, $usar): array {
            $f = self::sincronizar($j);
            $o = Db::fila('SELECT * FROM sede_obras WHERE id = ? AND jugador_id = ?', [$obraId, $j]);
            Fallo::si(!$o, 'Esa obra no existe.', 404, ['codigo' => 'obra_no_existe']);
            Fallo::si($o['estado'] !== 'activa', 'Esa obra ya terminó.', 409, ['codigo' => 'ya_terminada']);
            $t = self::ahora();
            $rest = (int) $o['fin'] - $t;
            if ($usar === 'aceleradores') {
                $min = (int) $f['acelera_min'];
                Fallo::si($min <= 0, 'No tienes aceleradores de obra.', 409, ['codigo' => 'sin_aceleradores']);
                $u = min($min, (int) ceil($rest / 60));
                self::sumar($j, ['acelera_min' => -$u], 'acelerar', 'obra:' . $obraId);
                Db::q('UPDATE sede_obras SET fin = MAX(?, fin - ?), acelerada_min = acelerada_min + ? WHERE id = ?', [$t, $u * 60, $u, $obraId]);
                self::terminarVencidas($j);
                return ['costo' => 0, 'minutos' => $u];
            }
            $costo = self::costoAcelerar($rest);
            Fallo::si($confirmar === null, 'Confirma el costo para acelerar.', 400, ['codigo' => 'confirmar_costo', 'costo' => $costo]);
            Fallo::si($confirmar < $costo, 'El costo cambió: ahora son ' . $costo . ' créditos.', 409, ['codigo' => 'costo_cambio', 'costo' => $costo]);
            $saldo = Monedero::saldo($j);
            Fallo::si($saldo < $costo, 'No tienes créditos suficientes. Necesitas ' . $costo . ' créditos.', 402, ['codigo' => 'sin_creditos', 'costo' => $costo, 'creditos' => $saldo]);
            Monedero::mover($j, -$costo, 'sede_acelerar', 'sede_obra:' . $obraId);
            Db::q('UPDATE sede_obras SET fin = ?, creditos = creditos + ? WHERE id = ?', [$t, $costo, $obraId]);
            self::terminarVencidas($j);
            return ['costo' => $costo, 'minutos' => 0];
        });
        return $r + self::vista($j);
    }

    private static function asociacion(int $j): ?int
    {
        $a = Db::valor('SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?', [$j]);
        return $a === null ? null : (int) $a;
    }

    private static function ayudasHoy(int $j, string $dia): array
    {
        $f = Db::fila('SELECT COUNT(*) AS n, COUNT(premio) AS p FROM sede_ayudas WHERE ayudante_id = ? AND dia = ?', [$j, $dia]);
        return ['ayudas' => (int) $f['n'], 'max' => self::AYUDAS_DIA, 'premios' => (int) $f['p'], 'premios_max' => self::AYUDA_PREMIOS_DIA];
    }

    /** Obras de la gente de tu asociación a las que todavía puedes ayudar. */
    public static function ayudas(int $j): array
    {
        $t = self::ahora();
        $a = self::asociacion($j);
        $hoy = self::ayudasHoy($j, self::dia($t));
        if ($a === null) return ['ok' => true, 'asociacion' => null, 'obras' => [], 'hoy' => $hoy];
        $tope = self::topeAyudas($j);   // misma asociación: el mismo tope para todas sus obras
        $filas = Db::todas("SELECT o.*, j.alias, j.nombre FROM sede_obras o JOIN asociacion_miembros m ON m.jugador_id = o.jugador_id JOIN jugadores j ON j.id = o.jugador_id
                            WHERE m.asociacion_id = ? AND o.jugador_id <> ? AND o.estado = 'activa' AND o.fin > ? AND o.ayudas < ?
                            AND NOT EXISTS (SELECT 1 FROM sede_ayudas x WHERE x.obra_id = o.id AND x.ayudante_id = ?) ORDER BY o.fin, o.id LIMIT 50",
            [$a, $j, $t, $tope, $j]);
        return ['ok' => true, 'asociacion' => $a, 'hoy' => $hoy, 'obras' => array_map(fn($o) => ['obra_id' => (int) $o['id'], 'jugador_id' => (int) $o['jugador_id'],
            'nombre' => Social::nombrePublico($o['alias'], $o['nombre']), 'tipo' => $o['tipo'], 'ed' => $o['ed'], 'nivel' => (int) $o['nivel'],
            'restante' => max(0, (int) $o['fin'] - $t), 'ayudas' => (int) $o['ayudas'], 'ayudas_max' => $tope,
            'segundos_ayuda' => min(max(0, (int) $o['fin'] - $t), self::segundosAyuda((int) $o['duracion']))], $filas)];
    }

    /**
     * Ayuda gratis a una obra de alguien de tu asociación. Devuelve lo que descontó, el premio, las fichas de asociación
     * (AyudaAsoc) y la lista actualizada ($conLista = false: sin lista, para "Ayudar a todos").
     */
    public static function ayudar(int $ayudante, int $duenio, int $obraId, bool $conLista = true): array
    {
        Cuentas::exigirActiva($ayudante);
        $r = Db::tx(function () use ($ayudante, $duenio, $obraId): array {
            Fallo::si($ayudante === $duenio, 'No puedes ayudar a tus propias obras.', 409, ['codigo' => 'misma_cuenta']);
            $a = self::asociacion($ayudante);
            Fallo::si($a === null, 'Únete a una asociación para ayudar.', 409, ['codigo' => 'sin_asociacion']);
            Fallo::si(self::asociacion($duenio) !== $a, 'Solo puedes ayudar a gente de tu asociación.', 403, ['codigo' => 'otra_asociacion']);
            if (class_exists(AyudaAsoc::class)) AyudaAsoc::exigirAntiguo($ayudante);   // anti cuentas alternas: más de 24 h en la asociación
            self::sincronizar($duenio);
            $o = Db::fila('SELECT * FROM sede_obras WHERE id = ? AND jugador_id = ?', [$obraId, $duenio]);
            Fallo::si(!$o, 'Esa obra no existe.', 404, ['codigo' => 'obra_no_existe']);
            Fallo::si($o['estado'] !== 'activa', 'Esa obra ya terminó.', 409, ['codigo' => 'ya_terminada']);
            Fallo::si((int) $o['ayudas'] >= self::topeAyudas($duenio), 'Esa obra ya recibió todas las ayudas.', 409, ['codigo' => 'ayudas_completas']);
            Fallo::si((bool) Db::valor('SELECT 1 FROM sede_ayudas WHERE obra_id = ? AND ayudante_id = ?', [$obraId, $ayudante]), 'Ya ayudaste en esa obra.', 409, ['codigo' => 'ya_ayudaste']);
            $t = self::ahora();
            $dia = self::dia($t);
            $hoy = self::ayudasHoy($ayudante, $dia);
            Fallo::si($hoy['ayudas'] >= self::AYUDAS_DIA, 'Ya diste todas tus ayudas de hoy. Vuelve mañana.', 409, ['codigo' => 'tope_ayudas_dia']);
            $seg = min((int) $o['fin'] - $t, self::segundosAyuda((int) $o['duracion']));
            Db::q('UPDATE sede_obras SET fin = fin - ?, ayudas = ayudas + 1 WHERE id = ?', [$seg, $obraId]);
            $premio = null;
            if ($hoy['premios'] < self::AYUDA_PREMIOS_DIA) {
                $premio = [self::alAzar() => 1];
                self::fila($ayudante);
                self::sumar($ayudante, $premio, 'ayuda', 'obra:' . $obraId);
            }
            Db::q('INSERT INTO sede_ayudas (obra_id, ayudante_id, segundos, premio, dia, creado) VALUES (?, ?, ?, ?, ?, ?)',
                [$obraId, $ayudante, $seg, $premio ? array_key_first($premio) : null, $dia, $t]);
            $fichas = class_exists(AyudaAsoc::class) ? AyudaAsoc::alAyudar($ayudante, $obraId) : 0;   // fichas de asociación (tope diario)
            // Pase de temporada: XP por ayudar en una obra de la asociación (misiones d_obras / s_obras)
            try {
                if (class_exists('\EnVivo\Pase')) \EnVivo\Pase::sumarXp($ayudante, \EnVivo\Pase::XP['obra_ayuda'], 'obra_ayuda', 'obra:' . $obraId);
            } catch (\Throwable) { /* el pase nunca rompe la ayuda */ }
            self::terminarVencidas($duenio);
            return ['segundos' => $seg, 'premio' => $premio, 'fichas' => $fichas];
        });
        return ['ok' => true] + $r + ($conLista ? ['lista' => self::ayudas($ayudante)] : []);
    }

    /**
     * Trae la sede LOCAL (s.sede de js/sede.js) la primera vez, con tope: nunca más que lo creíble para la edad y la fama
     * de la cuenta, ni más del nivel 8. Solo si la sede oficial está sin usar. Con $local vacío solo marca que ya se decidió.
     */
    public static function migrar(int $j, mixed $local): array
    {
        Cuentas::exigirActiva($j);
        $res = Db::tx(function () use ($j, $local): array {
            $f = self::sincronizar($j);
            $fresca = (int) $f['nivel'] === 1 && !Db::valor('SELECT 1 FROM sede_mejoras WHERE jugador_id = ?', [$j]) && !Db::valor('SELECT 1 FROM sede_obras WHERE jugador_id = ?', [$j]);
            Fallo::si((int) $f['migrado'] === 1 || !$fresca, 'Tu sede oficial ya tiene progreso: la sede de este celular no se puede traer.', 409, ['codigo' => 'ya_migrado']);
            Fallo::si($local !== null && !is_array($local), 'La sede enviada no es válida.', 400, ['codigo' => 'migracion_invalida']);
            $local = is_array($local) ? $local : [];
            $pedidoNivel = is_numeric($local['nivel'] ?? null) ? max(1, min(self::MAX_NIVEL, (int) $local['nivel'])) : 1;
            $jug = Db::fila('SELECT creado, fama_publica FROM jugadores WHERE id = ?', [$j]);
            $edad = intdiv(max(0, self::ahora() - (int) $jug['creado']), 86400);
            $tope = self::nivelMaxMigracion($edad, (int) $jug['fama_publica']);
            $nivel = min($pedidoNivel, $tope);
            $t = self::ahora();
            $nm = 0;
            for ($L = 2; $L <= $nivel; $L++) foreach (self::edificiosDe($L) as $ed) {
                Db::q("INSERT OR IGNORE INTO sede_mejoras (jugador_id, nivel, ed, terminado, origen) VALUES (?, ?, ?, ?, 'migracion')", [$j, $L, $ed, $t]); $nm++;
            }
            // Las mejoras del nivel siguiente (hechas o en obra) solo si el nivel no se recortó
            $sig = [];
            if ($nivel === $pedidoNivel && $nivel < self::MAX_NIVEL) {
                $L = $nivel + 1;
                $mej = is_array($local['mejoras'] ?? null) ? $local['mejoras'] : [];
                $obras = is_array($local['obras'] ?? null) ? $local['obras'] : [];
                foreach (self::edificiosDe($L) as $ed) {
                    $ok = !empty($mej[$L . '.' . $ed]);
                    foreach ($obras as $o) if (is_array($o) && ($o['tipo'] ?? '') === 'mejora' && ($o['ed'] ?? '') === $ed && (int) ($o['nivel'] ?? 0) === $L) $ok = true;
                    if ($ok) { Db::q("INSERT OR IGNORE INTO sede_mejoras (jugador_id, nivel, ed, terminado, origen) VALUES (?, ?, ?, ?, 'migracion')", [$j, $L, $ed, $t]); $sig[] = $ed; }
                }
            }
            $pm = is_array($local['materiales'] ?? null) ? $local['materiales'] : [];
            $mat = [];
            foreach (self::MATS as $m) {
                $v = is_numeric($pm[$m] ?? null) ? max(0, (int) $pm[$m]) : 0;
                $cap = $m === 'chips' ? intdiv($nivel, 2) : 40 + 20 * $nivel;
                if (min($v, $cap) > 0) $mat[$m] = min($v, $cap);
            }
            self::sumar($j, $mat, 'migracion', 'migracion');
            $recortado = $nivel < $pedidoNivel;
            foreach (self::MATS as $m) if ((is_numeric($pm[$m] ?? null) ? (int) $pm[$m] : 0) > ($mat[$m] ?? 0)) $recortado = true;
            $acept = ['nivel' => $nivel, 'mejoras_siguiente' => $sig, 'materiales' => $mat];
            Db::q('UPDATE sede_oficial SET nivel = ?, migrado = 1, migrado_en = ?, migrado_json = ?, actualizado = ? WHERE jugador_id = ?',
                [$nivel, $t, json_encode(['pedido' => ['nivel' => $pedidoNivel, 'materiales' => $pm], 'aceptado' => $acept, 'tope' => $tope], JSON_UNESCAPED_UNICODE), $t, $j]);
            return ['aceptado' => $acept, 'tope' => $tope, 'recortado' => $recortado];
        });
        return $res + self::vista($j);
    }

    /**
     * Materiales por un intento EN LÍNEA ya validado por el servidor (Liga, Festival, Copa, Duelos, Desafío). Lo llama
     * cada módulo (ver INTEGRAR_SEDE_OFICIAL.md) con $ref único ('liga:<id>'...) para no pagar dos veces el mismo intento.
     * Igual que los eventos de js/sede.js: (dificultad + 1) × factor por estrellas × (1 + 3 % por nivel), con la
     * dificultad sacada de la calidad (1 + calidad/20, de 1 a 5); 5 estrellas = +2 y 40 % de un chip. Tope por día:
     * 60 materiales comunes y 2 chips. Nunca lanza error (no rompe el intento): devuelve la bolsa ([] si nada).
     */
    public static function premioIntento(int $j, int $calidad, int $estrellas, string $modo, ?string $ref = null): array
    {
        if (!in_array($modo, self::MODOS, true) || $estrellas < 1) return [];
        try {
            return Db::tx(function () use ($j, $calidad, $estrellas, $modo, $ref): array {
                $t = self::ahora();
                if ($ref !== null && !Db::q("INSERT OR IGNORE INTO sede_fuentes (fuente, ref, jugador_id, creado) VALUES ('intento', ?, ?, ?)", [mb_substr($ref, 0, 200), $j, $t])->rowCount()) return [];
                $f = self::fila($j);
                $I = self::INTENTO;
                $est = max(1, min(5, $estrellas));
                $diff = max(1, min(5, 1 + intdiv(max(0, $calidad), 20)));
                $n = (int) round(($diff + 1) * $I['estrellas'][$est] * (1 + (int) $f['nivel'] * $I['porNivel']));
                $chip = 0;
                if ($est === 5) { $n += $I['cincoExtra']; if (self::probabilidad($I['cincoChip'])) $chip = 1; }
                $dia = self::dia($t);
                $hoy = (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM sede_libro WHERE jugador_id = ? AND motivo = 'intento' AND dia = ? AND material <> 'chips'", [$j, $dia]);
                $hoyChips = (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM sede_libro WHERE jugador_id = ? AND motivo = 'intento' AND dia = ? AND material = 'chips'", [$j, $dia]);
                $n = max(0, min($n, $I['topeDia'] - $hoy));
                $chip = max(0, min($chip, $I['chipsDia'] - $hoyChips));
                $bolsa = [];
                for ($i = 0; $i < $n; $i++) { $m = self::alAzar(); $bolsa[$m] = ($bolsa[$m] ?? 0) + 1; }
                if ($chip) $bolsa['chips'] = $chip;
                $o = [];
                foreach (self::MATS as $m) if (!empty($bolsa[$m])) $o[$m] = $bolsa[$m];
                self::sumar($j, $o, 'intento', $modo . ($ref !== null ? ':' . $ref : ''));
                return $o;
            });
        } catch (\Throwable $e) {
            error_log('EN VIVO sede premioIntento: ' . get_class($e) . ' ' . mb_substr($e->getMessage(), 0, 200));
            return [];
        }
    }
}
