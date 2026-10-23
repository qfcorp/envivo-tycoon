<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Pase de Temporada (contrato: server/MONETIZACION.md y server/INTEGRAR_PASE.md).
 *
 * - Temporadas de 28 días que empiezan un lunes 00:00 (America/Guayaquil), contadas desde EPOCA (ajuste pase_epoca).
 *   Cada una tiene número, tema y nombre: "Temporada 3 · Año Nuevo en vivo". El tema sale del calendario de fechas
 *   especiales de js/temporadas.js (si una cae dentro de la temporada); si no, un tema general.
 * - 40 niveles de XP_NIVEL XP. La XP llega SOLO de juego en línea validado: Pase::sumarXp($j, $xp, $fuente, $ref), que
 *   es idempotente por $ref (la llama el integrador donde se valida cada intento; nunca lanza error). Tope diario de XP
 *   de juego (las misiones, saltos y el plus no cuentan para el tope). Misiones diarias y semanales fijas (rotan por fecha,
 *   sin azar): al cumplirse dan su XP solas.
 * - Dos pistas: GRATIS (premio en la mitad de los niveles más el cosmético final) y PREMIUM (premio en todos). Todo el
 *   contenido es fijo y visible (RECOMPENSAS). Se entrega con el sistema de entregas (Monedero::entregar), con los tipos
 *   de siempre más "materiales", "trofeo", "cosmetico", "acelerador" y "estrella" (el juego ignora los que no conoce).
 * - Premium: productos pase_premium ($4,99) y pase_premium_plus ($9,99, +10 niveles). Llegan por el gancho
 *   compra_aprobada (Ganchos::en) y se revierten con compra_revertida. Quien compra tarde reclama todos los premios
 *   premium de los niveles que ya tiene.
 * - Saltos de nivel con créditos: SALTO_CREDITOS por nivel, máximo SALTOS_MAX por temporada.
 * - Al terminar una temporada, sus premios sin reclamar se pueden reclamar GRACIA_DIAS días más; después se pierden.
 */
final class Pase
{
    public const NIVELES = 40;
    public const DIAS = 28;
    public const XP_NIVEL = 400;
    public const GRACIA_DIAS = 3;
    public const SALTOS_MAX = 10;
    public const SALTO_CREDITOS = 150;      // ajuste pase_salto_creditos
    public const PLUS_NIVELES = 10;
    /** Créditos que puede devolver el pase en una temporada: ~60 % de lo que dan $4,99 en créditos (700). Ajuste pase_creditos_tope. */
    public const CREDITOS_TOPE = 420;
    public const XP_TOPE_DIA = 700;         // ajuste pase_xp_tope_dia
    public const EPOCA = '2026-10-19';      // lunes en que empieza la Temporada 1 (ajuste pase_epoca, AAAA-MM-DD, debe ser lunes)
    public const ZONA = 'America/Guayaquil';

    /** Productos (los agrega el integrador a Catalogo::PRODUCTOS con tipo "pase"); precio por defecto si el catálogo no lo tiene. */
    public const PRODUCTOS = [
        'pase_premium' => ['plus' => false, 'precio' => 4.99],
        'pase_premium_plus' => ['plus' => true, 'precio' => 9.99],
    ];

    /** XP por cada intento validado (lo que el integrador pasa a sumarXp). */
    public const XP = ['liga' => 40, 'festival' => 30, 'copa' => 40, 'duelo' => 40, 'desafio' => 60, 'obra_ayuda' => 25, 'copa_equipo' => 50,
        'misiones' => 15];   // Misiones del día/semana (server/INTEGRAR_MISIONES.md): 15 por misión del día, 40 por semanal
    /** Fuentes que cuentan como "evento en línea" para las misiones. */
    public const EVENTOS = ['liga', 'festival', 'copa', 'duelo', 'desafio'];
    /** Fuentes internas (no pasan por el tope diario). */
    private const INTERNAS = ['mision', 'salto', 'plus', 'plus_revertido', 'ajuste'];

    /** Misiones: la primera de cada lista siempre está; de las demás rotan 2 por día / 1 por semana (por fecha, sin azar). */
    public const MISIONES_DIA = [
        'd_eventos' => ['fuentes' => self::EVENTOS, 'n' => 3, 'xp' => 150, 'texto' => 'Juega 3 eventos en línea'],
        'd_desafio' => ['fuentes' => ['desafio'], 'n' => 1, 'xp' => 100, 'texto' => 'Juega el Desafío del Día'],
        'd_duelo' => ['fuentes' => ['duelo'], 'n' => 1, 'xp' => 100, 'texto' => 'Juega 1 duelo'],
        'd_liga' => ['fuentes' => ['liga'], 'n' => 2, 'xp' => 120, 'texto' => 'Juega 2 intentos de encargos de la liga'],
        'd_obras' => ['fuentes' => ['obra_ayuda'], 'n' => 2, 'xp' => 120, 'texto' => 'Ayuda en 2 obras de tu asociación'],
        'd_festival' => ['fuentes' => ['festival'], 'n' => 2, 'xp' => 120, 'texto' => 'Juega 2 turnos del festival'],
        'd_copa' => ['fuentes' => ['copa'], 'n' => 2, 'xp' => 120, 'texto' => 'Suma 2 intentos de preparación de la copa'],
    ];
    public const MISIONES_SEMANA = [
        's_eventos' => ['fuentes' => self::EVENTOS, 'n' => 15, 'xp' => 600, 'texto' => 'Juega 15 eventos en línea'],
        's_copa_equipo' => ['fuentes' => ['copa_equipo'], 'n' => 1, 'xp' => 300, 'texto' => 'Registra tu equipo de copa'],
        's_duelos' => ['fuentes' => ['duelo'], 'n' => 5, 'xp' => 400, 'texto' => 'Juega 5 duelos'],
        's_desafio' => ['fuentes' => ['desafio'], 'n' => 4, 'xp' => 400, 'texto' => 'Juega el Desafío del Día en 4 días distintos', 'dias' => true],
        's_obras' => ['fuentes' => ['obra_ayuda'], 'n' => 6, 'xp' => 400, 'texto' => 'Ayuda en 6 obras de tu asociación'],
        's_liga' => ['fuentes' => ['liga'], 'n' => 6, 'xp' => 400, 'texto' => 'Juega 6 intentos de encargos de la liga'],
        's_festival' => ['fuentes' => ['festival'], 'n' => 6, 'xp' => 400, 'texto' => 'Juega 6 turnos del festival'],
    ];

    /**
     * Premios fijos por nivel: [gratis|null, premium] = [tipo, item, cantidad]. Cosméticos: item = clase (marco, deco,
     * titulo, insignia); la clave final lleva la temporada (pase_marco_t3). "acelerador": cantidad = minutos de obra (como
     * SedeOficial). "estrella": contrato de personal estrella (item "comodin" = la estrella de la semana, cantidad =
     * partidos; si no existe Estrellas, se cambia por ESTRELLA_SUSTITUTO). Los créditos de la pista premium suman CREDITOS_TOPE.
     */
    public const RECOMPENSAS = [
        1 => [['dinero', '-', 300], ['materiales', 'cables', 12]],
        2 => [null, ['acelerador', 'obra', 120]],
        3 => [['materiales', 'cables', 6], ['materiales', 'placas', 8]],
        4 => [null, ['dinero', '-', 800]],
        5 => [['consumible', 'cable', 3], ['creditos', '-', 40]],
        6 => [null, ['materiales', 'paneles', 8]],
        7 => [['materiales', 'placas', 5], ['acelerador', 'obra', 180]],
        8 => [null, ['materiales', 'credenciales', 8]],
        9 => [['dinero', '-', 500], ['consumible', 'battery', 5]],
        10 => [null, ['cosmetico', 'marco', 1]],
        11 => [['materiales', 'paneles', 5], ['materiales', 'planos', 8]],
        12 => [null, ['creditos', '-', 50]],
        13 => [['consumible', 'battery', 3], ['acelerador', 'obra', 480]],
        14 => [null, ['materiales', 'chips', 3]],
        15 => [['materiales', 'credenciales', 5], ['dinero', '-', 1500]],
        16 => [null, ['materiales', 'placas', 12]],
        17 => [['dinero', '-', 800], ['consumible', 'cable', 8]],
        18 => [null, ['creditos', '-', 50]],
        19 => [['materiales', 'planos', 5], ['materiales', 'paneles', 12]],
        20 => [null, ['cosmetico', 'deco', 1]],
        21 => [['consumible', 'cable', 5], ['materiales', 'credenciales', 12]],
        22 => [null, ['acelerador', 'obra', 240]],
        23 => [['materiales', 'placas', 8], ['dinero', '-', 2000]],
        24 => [null, ['materiales', 'planos', 12]],
        25 => [['dinero', '-', 1200], ['creditos', '-', 60]],
        26 => [null, ['materiales', 'chips', 4]],
        27 => [['materiales', 'paneles', 8], ['reparar_todo', '-', 1]],
        28 => [null, ['acelerador', 'obra', 960]],
        29 => [['consumible', 'battery', 5], ['materiales', 'cables', 20]],
        30 => [null, ['creditos', '-', 60]],
        31 => [['materiales', 'credenciales', 8], ['materiales', 'placas', 15]],
        32 => [null, ['acelerador', 'obra', 300]],
        33 => [['dinero', '-', 1500], ['materiales', 'paneles', 15]],
        34 => [null, ['creditos', '-', 70]],
        35 => [['materiales', 'chips', 2], ['estrella', 'comodin', 5]],
        36 => [null, ['materiales', 'credenciales', 15]],
        37 => [['materiales', 'planos', 8], ['acelerador', 'obra', 1440]],
        38 => [null, ['creditos', '-', 90]],
        39 => [['dinero', '-', 2000], ['materiales', 'chips', 6]],
        40 => [['cosmetico', 'insignia', 1], ['cosmetico', 'titulo', 1]],
    ];
    public const ESTRELLA_SUSTITUTO = ['materiales', 'chips', 8];

    /** Temas de fecha especial (mismas ventanas que js/temporadas.js) en orden de prioridad; y temas generales. */
    public const TEMAS = [
        'fin_anio' => ['icono' => '🎆', 'nombre' => 'Año Nuevo en vivo'],
        'navidad' => ['icono' => '🎄', 'nombre' => 'Luces de Navidad'],
        'carnaval' => ['icono' => '🎭', 'nombre' => 'Carnaval en vivo'],
        'pascua' => ['icono' => '🕊️', 'nombre' => 'Semana Santa en vivo'],
        'san_valentin' => ['icono' => '💘', 'nombre' => 'Amor en vivo'],
        'halloween' => ['icono' => '🎃', 'nombre' => 'Noche de Calaveras'],
        'pase_nino' => ['icono' => '⭐', 'nombre' => 'Pase del Niño'],
        // generales (sin fecha especial), rotan por número de temporada
        'estadios' => ['icono' => '🏟️', 'nombre' => 'Gira de estadios'],
        'festivales' => ['icono' => '🎪', 'nombre' => 'Verano de festivales'],
        'estrenos' => ['icono' => '🎬', 'nombre' => 'Noches de estreno'],
        'conciertos' => ['icono' => '🎸', 'nombre' => 'Gira de conciertos'],
    ];
    private const GENERALES = ['estadios', 'festivales', 'estrenos', 'conciertos'];
    /** Días mínimos de la ventana especial que deben caer dentro de la temporada para tomar su tema. */
    private const MIN_DIAS_TEMA = 3;

    public const MATERIALES = ['cables' => 'Cables y conectores', 'placas' => 'Placas electrónicas', 'paneles' => 'Paneles LED',
        'credenciales' => 'Credenciales de prensa', 'planos' => 'Planos técnicos', 'chips' => 'Chips de video 4K'];

    private static ?int $reloj = null;
    private static bool $listo = false;
    private static int $sp = 0;
    private static array $temas = [];

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    /** Crea las tablas si faltan (normalmente ya las crea Db::migrarModulos con migraciones/pase.sql). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('pase_jugador', 'pase_xp', 'pase_reclamos', 'pase_compras')");
        if ($n < 4) Migraciones::aplicar('pase.sql');
        self::$listo = true;
    }

    /** Escucha las compras (una línea en arranque.php: \EnVivo\Pase::registrar();). Sin Ganchos no hace nada. */
    public static function registrar(): void
    {
        if (!class_exists(Ganchos::class)) return;
        Ganchos::en('compra_aprobada', [self::class, 'alAprobarCompra'], 'pase');   // con clave: registrar dos veces no duplica
        Ganchos::en('compra_revertida', [self::class, 'alRevertirCompra'], 'pase');
    }

    // ------------------------------------------------------------------ ajustes
    private static function ajusteInt(string $k, int $def, int $min, int $max): int
    {
        $v = trim(Ajustes::get($k, ''));
        return $v !== '' && preg_match('/^\d{1,7}$/', $v) ? max($min, min($max, (int) $v)) : $def;
    }
    public static function precioSalto(): int { return self::ajusteInt('pase_salto_creditos', self::SALTO_CREDITOS, 1, 100000); }
    public static function topeCreditos(): int { return self::ajusteInt('pase_creditos_tope', self::CREDITOS_TOPE, 0, 100000); }
    public static function topeXpDia(): int { return self::ajusteInt('pase_xp_tope_dia', self::XP_TOPE_DIA, 0, 1000000); }

    private static function zona(): \DateTimeZone { return new \DateTimeZone(self::ZONA); }

    /** Lunes 00:00 de la Temporada 1. */
    public static function epoca(): int
    {
        $v = trim(Ajustes::get('pase_epoca', ''));
        foreach ([$v, self::EPOCA] as $f) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f)) continue;
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $f, self::zona());
            if ($d && $d->format('Y-m-d') === $f && $d->format('N') === '1') return $d->getTimestamp();
        }
        return (new \DateTimeImmutable(self::EPOCA . ' 00:00:00', self::zona()))->getTimestamp();
    }

    public static function dia(?int $t = null): string { return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(self::zona())->format('Y-m-d'); }

    // ------------------------------------------------------------------ temporadas
    /** Temporada número $n (1, 2, ...): {numero, inicio, fin (exclusivo), tema, icono, nombre_tema, nombre}. */
    public static function temporada(int $n): array
    {
        $ini = (new \DateTimeImmutable('@' . self::epoca()))->setTimezone(self::zona())->modify('+' . (($n - 1) * self::DIAS) . ' days');
        $fin = $ini->modify('+' . self::DIAS . ' days');
        $tema = self::temaDe($n);
        return ['numero' => $n, 'inicio' => $ini->getTimestamp(), 'fin' => $fin->getTimestamp(), 'tema' => $tema,
                'icono' => self::TEMAS[$tema]['icono'], 'nombre_tema' => self::TEMAS[$tema]['nombre'],
                'nombre' => 'Temporada ' . $n . ' · ' . self::TEMAS[$tema]['nombre']];
    }

    /** Número de la temporada en $t, o null antes de la Temporada 1. */
    public static function numeroEn(int $t): ?int
    {
        $e = self::epoca();
        if ($t < $e) return null;
        $n = intdiv($t - $e, self::DIAS * 86400) + 1;
        // por si acaso (la zona no tiene horario de verano, pero se confirma con las fechas reales)
        while ($n > 1 && self::temporada($n)['inicio'] > $t) $n--;
        while (self::temporada($n)['fin'] <= $t) $n++;
        return $n;
    }

    public static function actual(?int $t = null): ?array
    {
        $n = self::numeroEn($t ?? self::ahora());
        return $n === null ? null : self::temporada($n);
    }

    /** Tema de la temporada $n: la fecha especial de más prioridad que cae dentro (sin repetir la de la anterior), o uno general. */
    public static function temaDe(int $n): string
    {
        $e = self::epoca();
        $n = max(1, $n);
        if (isset(self::$temas[$e][$n])) return self::$temas[$e][$n];
        // El tema depende del de la temporada anterior: se calculan en orden desde la última conocida (quedan en memoria)
        $i = $n;
        while ($i > 1 && !isset(self::$temas[$e][$i - 1])) $i--;
        for (; $i <= $n; $i++) {
            $prev = $i > 1 ? self::$temas[$e][$i - 1] : null;
            $ini = (new \DateTimeImmutable('@' . $e))->setTimezone(self::zona())->modify('+' . (($i - 1) * self::DIAS) . ' days');
            $elegido = null;
            foreach (self::candidatos($ini) as $c) { if ($c !== $prev) { $elegido = $c; break; } }
            self::$temas[$e][$i] = $elegido ?? self::GENERALES[($i - 1) % count(self::GENERALES)];
        }
        return self::$temas[$e][$n];
    }

    /** Temas de fecha especial cuya ventana tiene al menos MIN_DIAS_TEMA días dentro de la temporada, por prioridad. */
    private static function candidatos(\DateTimeImmutable $ini): array
    {
        $dIni = self::diaAbs((int) $ini->format('Y'), (int) $ini->format('n'), (int) $ini->format('j'));
        $dFin = $dIni + self::DIAS - 1;
        $y = (int) $ini->format('Y');
        $o = [];
        foreach (array_keys(self::TEMAS) as $tema) {
            if (in_array($tema, self::GENERALES, true)) continue;
            $dias = 0;
            foreach ([$y - 1, $y, $y + 1] as $a) {
                [$d, $h] = self::ventana($tema, $a);
                $dias += max(0, min($h, $dFin) - max($d, $dIni) + 1);
            }
            if ($dias >= self::MIN_DIAS_TEMA) $o[] = $tema;
        }
        return $o;
    }

    /** Ventana [desde, hasta] (días absolutos) de una fecha especial del año $y (como js/temporadas.js). */
    public static function ventana(string $tema, int $y): array
    {
        $md = fn(string $s, int $a) => self::diaAbs($a, (int) substr($s, 0, 2), (int) substr($s, 3, 2));
        $e = self::pascua($y);
        return match ($tema) {
            'halloween' => [$md('10-24', $y), $md('10-31', $y)],
            'navidad' => [$md('12-01', $y), $md('12-25', $y)],
            'pase_nino' => [$md('12-15', $y), $md('12-28', $y)],
            'fin_anio' => [$md('12-26', $y), $md('01-01', $y + 1)],
            'san_valentin' => [$md('02-07', $y), $md('02-14', $y)],
            'pascua' => [$e - 7, $e],
            'carnaval' => [$e - 51, $e - 47],
            default => [0, -1],
        };
    }

    /** Domingo de Pascua (día absoluto), algoritmo de Meeus/Jones/Butcher. */
    public static function pascua(int $y): int
    {
        $a = $y % 19; $b = intdiv($y, 100); $c = $y % 100; $d = intdiv($b, 4); $e = $b % 4; $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3); $h = (19 * $a + $b - $d - $g + 15) % 30; $i = intdiv($c, 4); $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $mes = intdiv($h + $l - 7 * $m + 114, 31); $dia = (($h + $l - 7 * $m + 114) % 31) + 1;
        return self::diaAbs($y, $mes, $dia);
    }

    /** Días desde 1970-01-01 de una fecha civil (H. Hinnant, igual que js/temporadas.js). */
    public static function diaAbs(int $y, int $m, int $d): int
    {
        $y -= $m <= 2 ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        return $era * 146097 + $doe - 719468;
    }

    // ------------------------------------------------------------------ XP
    /**
     * Suma XP por juego en línea validado. IDEMPOTENTE por $ref (la misma ref nunca suma dos veces). Nunca lanza error
     * (el integrador la llama dentro de la transacción del intento). Fuentes: claves de Pase::XP. Respeta el tope diario
     * (lo que pasa del tope se anota con 0 XP: igual cuenta para las misiones). Devuelve {xp, nivel, misiones} o null
     * (ref repetida, sin temporada o error).
     */
    public static function sumarXp(int $j, int $xp, string $fuente, string $ref): ?array
    {
        if ($j <= 0 || $ref === '' || !isset(self::XP[$fuente])) return null;
        try {
            self::preparar();
            return self::atomico(function () use ($j, $xp, $fuente, $ref): ?array {
                $t = self::actual();
                if ($t === null) return null;
                $dia = self::dia();
                $hoy = (int) Db::valor('SELECT COALESCE(SUM(xp), 0) FROM pase_xp WHERE jugador_id = ? AND temporada = ? AND dia = ? AND fuente IN (' . self::lista(array_keys(self::XP)) . ')',
                    [$j, $t['numero'], $dia]);
                $dar = max(0, min(max(0, $xp), self::topeXpDia() - $hoy));
                if (!self::anotar($j, $t['numero'], $fuente, $fuente . ':' . $ref, $dar)) return null;
                $misiones = self::revisarMisiones($j, $t, $fuente);
                return ['xp' => $dar, 'nivel' => self::nivel(self::xpTotal($j, $t['numero'])), 'misiones' => $misiones];
            });
        } catch (\Throwable $e) {
            error_log('EN VIVO pase sumarXp: ' . get_class($e) . ' ' . mb_substr($e->getMessage(), 0, 200));
            return null;
        }
    }

    /** Anota una fila del libro de XP (INSERT OR IGNORE). true si es nueva. */
    private static function anotar(int $j, int $temporada, string $fuente, string $ref, int $xp): bool
    {
        self::asegurarJugador($temporada, $j);
        return Db::q('INSERT OR IGNORE INTO pase_xp (jugador_id, temporada, fuente, ref, xp, dia, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$j, $temporada, $fuente, mb_substr($ref, 0, 200), $xp, self::dia(), self::ahora()])->rowCount() > 0;
    }

    public static function xpTotal(int $j, int $temporada): int
    {
        return max(0, (int) Db::valor('SELECT COALESCE(SUM(xp), 0) FROM pase_xp WHERE jugador_id = ? AND temporada = ?', [$j, $temporada]));
    }

    public static function nivel(int $xp): int { return max(0, min(self::NIVELES, intdiv(max(0, $xp), self::XP_NIVEL))); }

    private static function lista(array $v): string { return implode(', ', array_map(fn($x) => Db::pdo()->quote((string) $x), $v)); }

    // ------------------------------------------------------------------ misiones
    /** Misiones activas de la fecha: ['dia' => [...], 'semana' => [...]] con periodo y rango. */
    public static function misionesActivas(array $t, ?int $ahora = null): array
    {
        $ahora ??= self::ahora();
        $hoy = self::dia($ahora);
        $dIdx = intdiv(max(0, $ahora - $t['inicio']), 86400);
        $sIdx = intdiv($dIdx, 7);   // 0..3
        $rotD = array_slice(array_keys(self::MISIONES_DIA), 1);
        $rotS = array_slice(array_keys(self::MISIONES_SEMANA), 2);
        $absDia = intdiv($ahora - self::epoca(), 86400);
        $diarias = [array_key_first(self::MISIONES_DIA), $rotD[(2 * $absDia) % count($rotD)], $rotD[(2 * $absDia + 1) % count($rotD)]];
        $semIni = (new \DateTimeImmutable('@' . $t['inicio']))->setTimezone(self::zona())->modify('+' . (7 * $sIdx) . ' days');
        $semFin = $semIni->modify('+7 days');
        $absSem = intdiv($t['inicio'] - self::epoca(), 7 * 86400) + $sIdx;
        $semanales = [array_keys(self::MISIONES_SEMANA)[0], array_keys(self::MISIONES_SEMANA)[1], $rotS[$absSem % count($rotS)]];
        return [
            'dia' => ['ids' => $diarias, 'periodo' => $hoy, 'desde' => $hoy, 'hasta' => $hoy,
                      'fin' => (new \DateTimeImmutable($hoy . ' 00:00:00', self::zona()))->modify('+1 day')->getTimestamp()],
            'semana' => ['ids' => $semanales, 'periodo' => 's' . ($sIdx + 1), 'desde' => $semIni->format('Y-m-d'), 'hasta' => $semFin->modify('-1 day')->format('Y-m-d'),
                         'fin' => $semFin->getTimestamp()],
        ];
    }

    private static function avanceMision(int $j, int $temporada, array $def, string $desde, string $hasta): int
    {
        $sel = !empty($def['dias']) ? 'COUNT(DISTINCT dia)' : 'COUNT(*)';
        return (int) Db::valor("SELECT $sel FROM pase_xp WHERE jugador_id = ? AND temporada = ? AND dia >= ? AND dia <= ? AND fuente IN (" . self::lista($def['fuentes']) . ')',
            [$j, $temporada, $desde, $hasta]);
    }

    /** Da la XP de las misiones de esta fuente que se acaban de cumplir. Devuelve los ids cumplidos ahora. */
    private static function revisarMisiones(int $j, array $t, string $fuente): array
    {
        $hechas = [];
        $act = self::misionesActivas($t);
        foreach (['dia' => self::MISIONES_DIA, 'semana' => self::MISIONES_SEMANA] as $per => $defs) {
            $a = $act[$per];
            foreach ($a['ids'] as $id) {
                $def = $defs[$id];
                if (!in_array($fuente, $def['fuentes'], true)) continue;
                if (self::avanceMision($j, $t['numero'], $def, $a['desde'], $a['hasta']) < $def['n']) continue;
                if (self::anotar($j, $t['numero'], 'mision', 'mision:' . $t['numero'] . ':' . $a['periodo'] . ':' . $id, (int) $def['xp'])) $hechas[] = $id;
            }
        }
        return $hechas;
    }

    // ------------------------------------------------------------------ premios
    /** Premio fijo de un nivel y pista para una temporada, o null. {tipo, item, cantidad, clave?, clase?} */
    public static function recompensa(int $nivel, string $pista, int $temporada): ?array
    {
        $fila = self::RECOMPENSAS[$nivel] ?? null;
        if ($fila === null) return null;
        $r = $fila[$pista === 'premium' ? 1 : 0];
        if ($r === null) return null;
        if ($r[0] === 'estrella' && !self::hayEstrellas()) $r = self::ESTRELLA_SUSTITUTO;
        $o = ['tipo' => $r[0], 'item' => $r[1], 'cantidad' => $r[2]];
        if ($r[0] === 'cosmetico') $o = ['tipo' => 'cosmetico', 'item' => 'pase_' . $r[1] . '_t' . $temporada, 'cantidad' => 1, 'clase' => $r[1]];
        return $o + ['nombre' => self::nombreRecompensa($o, $temporada)];
    }

    public static function hayEstrellas(): bool { return class_exists(Estrellas::class); }

    public static function nombreRecompensa(array $r, int $temporada): string
    {
        $n = (int) $r['cantidad'];
        $fmt = fn(int $x) => number_format($x, 0, ',', '.');
        $tema = self::TEMAS[self::temaDe($temporada)]['nombre'];
        return match ($r['tipo']) {
            'dinero' => '$' . $fmt($n) . ' para tu productora',
            'creditos' => $fmt($n) . ' créditos',
            'consumible' => $n . ' ' . ($r['item'] === 'battery' ? 'baterías' : 'cables de repuesto'),
            'materiales' => $n . ' × ' . (self::MATERIALES[$r['item']] ?? $r['item']),
            'acelerador' => 'Aceleradores de obra: ' . ($n % 60 === 0 ? intdiv($n, 60) . ' h' : $n . ' min'),
            'reparar_todo' => 'Reparación total de tu equipo',
            'estrella' => 'Contrato de personal estrella (' . $n . ' partidos)',
            'cosmetico' => match ($r['clase'] ?? '') {
                'marco' => 'Marco de productora «' . $tema . '»', 'deco' => 'Adorno de sede «' . $tema . '»',
                'titulo' => 'Título de chat «' . $tema . '»', default => 'Insignia «' . $tema . '»' },
            default => $n . ' × ' . $r['item'],
        };
    }

    /** Créditos que da la pista premium en una temporada (para la prueba del tope). */
    public static function creditosTabla(): int
    {
        $s = 0;
        foreach (self::RECOMPENSAS as $f) if ($f[1] !== null && $f[1][0] === 'creditos') $s += $f[1][2];
        return $s;
    }

    // ------------------------------------------------------------------ estado del jugador
    private static function asegurarJugador(int $temporada, int $j): array
    {
        Db::q('INSERT OR IGNORE INTO pase_jugador (temporada, jugador_id, creado, actualizado) VALUES (?, ?, ?, ?)', [$temporada, $j, self::ahora(), self::ahora()]);
        return Db::fila('SELECT * FROM pase_jugador WHERE temporada = ? AND jugador_id = ?', [$temporada, $j]);
    }

    private static function filaJugador(int $temporada, int $j): array
    {
        return Db::fila('SELECT * FROM pase_jugador WHERE temporada = ? AND jugador_id = ?', [$temporada, $j])
            ?? ['temporada' => $temporada, 'jugador_id' => $j, 'premium' => 0, 'plus' => 0, 'premium_desde' => null, 'saltos' => 0, 'creditos_dados' => 0, 'revisar' => 0];
    }

    public static function esPremium(int $j, int $temporada): bool { return (bool) (int) self::filaJugador($temporada, $j)['premium']; }

    /** ¿Se pueden reclamar todavía los premios de esa temporada? (la actual, o la anterior dentro de la gracia) */
    public static function reclamable(array $t): bool
    {
        $a = self::ahora();
        return $t['inicio'] <= $a && $a < $t['fin'] + self::GRACIA_DIAS * 86400;
    }

    /** Las dos pistas con su estado: reclamado, disponible, bloqueado (nivel no alcanzado) o requiere_premium. */
    private static function pistas(int $j, array $t, int $nivel, bool $premium, bool $abierta): array
    {
        $rec = [];
        foreach (Db::todas('SELECT nivel, pista, creditos, revisar FROM pase_reclamos WHERE temporada = ? AND jugador_id = ?', [$t['numero'], $j]) as $r) $rec[$r['pista']][(int) $r['nivel']] = $r;
        $o = ['gratis' => [], 'premium' => []];
        $por = ['gratis' => 0, 'premium' => 0];
        $esperando = 0;
        foreach (['gratis', 'premium'] as $pista) {
            for ($n = 1; $n <= self::NIVELES; $n++) {
                $r = self::recompensa($n, $pista, $t['numero']);
                if ($r === null) continue;
                $hecho = $rec[$pista][$n] ?? null;
                $estado = $hecho ? 'reclamado' : ($n > $nivel ? 'bloqueado' : ($pista === 'premium' && !$premium ? 'requiere_premium' : ($abierta ? 'disponible' : 'vencido')));
                if ($estado === 'disponible') $por[$pista]++;
                if ($estado === 'requiere_premium') $esperando++;
                $o[$pista][] = ['nivel' => $n, 'recompensa' => $r, 'estado' => $estado] + ($hecho && (int) $hecho['revisar'] ? ['revisar' => true] : []);
            }
        }
        return [$o, $por + ['total' => $por['gratis'] + $por['premium'], 'premium_esperando' => $esperando]];
    }

    private static function resumenTemporada(int $j, array $t): array
    {
        $pj = self::filaJugador($t['numero'], $j);
        $xp = self::xpTotal($j, $t['numero']);
        $nivel = self::nivel($xp);
        $premium = (bool) (int) $pj['premium'];
        [$pistas, $por] = self::pistas($j, $t, $nivel, $premium, self::reclamable($t));
        return [
            'temporada' => ['numero' => $t['numero'], 'tema' => $t['tema'], 'icono' => $t['icono'], 'nombre' => $t['nombre'], 'nombre_tema' => $t['nombre_tema'],
                            'inicio' => Db::iso($t['inicio']), 'fin' => Db::iso($t['fin']), 'quedan_seg' => max(0, $t['fin'] - self::ahora())],
            'nivel' => $nivel, 'niveles' => self::NIVELES, 'xp' => $xp, 'xp_nivel' => $nivel >= self::NIVELES ? self::XP_NIVEL : $xp - $nivel * self::XP_NIVEL,
            'xp_por_nivel' => self::XP_NIVEL, 'premium' => $premium, 'plus' => (bool) (int) $pj['plus'],
            'pistas' => $pistas, 'por_reclamar' => $por, 'creditos_dados' => (int) $pj['creditos_dados'],
        ];
    }

    /** GET /api/pase */
    public static function estado(int $j): array
    {
        self::preparar();
        $t = self::actual();
        $prod = [];
        foreach (self::PRODUCTOS as $id => $d) {
            $p = class_exists(Catalogo::class) ? Catalogo::producto($id) : null;
            $prod[$id] = ['id' => $id, 'precio' => $p ? (float) $p['precio'] : $d['precio'], 'activo' => $p ? (bool) $p['activo'] : true, 'plus' => $d['plus'], 'niveles' => $d['plus'] ? self::PLUS_NIVELES : 0];
        }
        $o = ['ok' => true, 'ahora' => Db::iso(self::ahora()), 'productos' => $prod, 'creditos_tope' => self::topeCreditos(), 'gracia_dias' => self::GRACIA_DIAS];
        if ($t === null) {
            $p = self::temporada(1);
            return $o + ['temporada' => null, 'proxima' => ['numero' => 1, 'nombre' => $p['nombre'], 'tema' => $p['tema'], 'icono' => $p['icono'], 'inicio' => Db::iso($p['inicio'])], 'anterior' => null];
        }
        $o += self::resumenTemporada($j, $t);
        $pj = self::filaJugador($t['numero'], $j);
        $o['saltos'] = ['usados' => (int) $pj['saltos'], 'max' => self::SALTOS_MAX, 'precio' => self::precioSalto(),
                        'max_ahora' => max(0, min(self::SALTOS_MAX - (int) $pj['saltos'], self::NIVELES - $o['nivel']))];
        $hoy = self::dia();
        $o['xp_hoy'] = (int) Db::valor('SELECT COALESCE(SUM(xp), 0) FROM pase_xp WHERE jugador_id = ? AND temporada = ? AND dia = ? AND fuente IN (' . self::lista(array_keys(self::XP)) . ')', [$j, $t['numero'], $hoy]);
        $o['xp_tope_dia'] = self::topeXpDia();
        $o['xp_fuentes'] = self::XP;
        $act = self::misionesActivas($t);
        $o['misiones'] = [];
        foreach (['dia' => ['diarias', self::MISIONES_DIA], 'semana' => ['semanales', self::MISIONES_SEMANA]] as $per => [$nom, $defs]) {
            $a = $act[$per];
            $o['misiones'][$nom] = array_map(function (string $id) use ($j, $t, $defs, $a): array {
                $d = $defs[$id];
                $av = self::avanceMision($j, $t['numero'], $d, $a['desde'], $a['hasta']);
                $hecha = (bool) Db::valor('SELECT 1 FROM pase_xp WHERE jugador_id = ? AND ref = ?', [$j, 'mision:' . $t['numero'] . ':' . $a['periodo'] . ':' . $id]);
                return ['id' => $id, 'texto' => $d['texto'], 'n' => $d['n'], 'avance' => min($d['n'], $av), 'xp' => $d['xp'], 'hecha' => $hecha];
            }, $a['ids']);
            $o['misiones'][$nom . '_fin'] = Db::iso(min($a['fin'], $t['fin']));
        }
        // La temporada anterior, si está en los días de gracia y le quedan premios por reclamar
        $o['anterior'] = null;
        if ($t['numero'] > 1) {
            $p = self::temporada($t['numero'] - 1);
            if (self::reclamable($p)) {
                $r = self::resumenTemporada($j, $p);
                if ($r['por_reclamar']['total'] > 0) $o['anterior'] = $r + ['gracia_hasta' => Db::iso($p['fin'] + self::GRACIA_DIAS * 86400)];
            }
        }
        return $o;
    }

    // ------------------------------------------------------------------ reclamar
    /** POST /api/pase/reclamar {nivel, pista, temporada?} */
    public static function reclamar(int $j, int $nivel, string $pista, ?int $temporada = null): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        Fallo::si(!in_array($pista, ['gratis', 'premium'], true), 'La pista debe ser "gratis" o "premium".', 400, ['codigo' => 'pista_invalida']);
        Fallo::si($nivel < 1 || $nivel > self::NIVELES, 'Ese nivel no existe.', 400, ['codigo' => 'nivel_invalido']);
        $r = Db::tx(function () use ($j, $nivel, $pista, $temporada): array {
            $t = self::temporadaParaReclamar($temporada);
            return self::reclamarUno($j, $t, $nivel, $pista, true);
        });
        return ['ok' => true, 'reclamado' => $r['reclamado'], 'entregas' => $r['entregas'], 'creditos' => Monedero::saldo($j), 'pase' => self::estado($j)];
    }

    /** POST /api/pase/reclamar_todo: todo lo disponible de la temporada actual y de la anterior (si sigue en gracia). */
    public static function reclamarTodo(int $j): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        $r = Db::tx(function () use ($j): array {
            $t = self::actual();
            Fallo::si($t === null, 'El Pase de Temporada todavía no empieza.', 409, ['codigo' => 'sin_temporada']);
            $lista = [];
            $entregas = [];
            $temps = [$t];
            if ($t['numero'] > 1 && self::reclamable(self::temporada($t['numero'] - 1))) array_unshift($temps, self::temporada($t['numero'] - 1));
            foreach ($temps as $tt) {
                $nivel = self::nivel(self::xpTotal($j, $tt['numero']));
                $premium = self::esPremium($j, $tt['numero']);
                foreach (['gratis', 'premium'] as $pista) {
                    if ($pista === 'premium' && !$premium) continue;
                    for ($n = 1; $n <= $nivel; $n++) {
                        $x = self::reclamarUno($j, $tt, $n, $pista, false);
                        if ($x === null) continue;
                        $lista[] = $x['reclamado'];
                        array_push($entregas, ...$x['entregas']);
                    }
                }
            }
            return [$lista, $entregas];
        });
        return ['ok' => true, 'reclamados' => $r[0], 'entregas' => $r[1], 'creditos' => Monedero::saldo($j), 'pase' => self::estado($j)];
    }

    private static function temporadaParaReclamar(?int $numero): array
    {
        $t = self::actual();
        Fallo::si($t === null, 'El Pase de Temporada todavía no empieza.', 409, ['codigo' => 'sin_temporada']);
        if ($numero === null || $numero === $t['numero']) return $t;
        Fallo::si($numero < 1 || $numero > $t['numero'], 'Esa temporada no existe.', 400, ['codigo' => 'temporada_invalida']);
        $p = self::temporada($numero);
        Fallo::si(!self::reclamable($p), 'Los premios de la ' . $p['nombre'] . ' ya no se pueden reclamar: se podían hasta ' . self::GRACIA_DIAS . ' días después de terminar.', 410, ['codigo' => 'gracia_terminada']);
        return $p;
    }

    /** Reclama un premio (dentro de una transacción). Con $estricto lanza Fallo si no se puede; si no, devuelve null. */
    private static function reclamarUno(int $j, array $t, int $nivel, string $pista, bool $estricto): ?array
    {
        $no = function (string $txt, int $http, string $codigo) use ($estricto): ?array {
            if ($estricto) throw new Fallo($txt, $http, ['codigo' => $codigo]);
            return null;
        };
        $r = self::recompensa($nivel, $pista, $t['numero']);
        if ($r === null) return $no('Ese nivel no tiene premio en la pista gratis.', 404, 'sin_recompensa');
        if (self::nivel(self::xpTotal($j, $t['numero'])) < $nivel) return $no('Todavía no llegas al nivel ' . $nivel . '. ¡Sigue jugando en línea!', 409, 'nivel_bloqueado');
        $pj = self::asegurarJugador($t['numero'], $j);
        if ($pista === 'premium' && !(int) $pj['premium']) return $no('Ese premio es del Pase Premium.', 403, 'premium_requerido');
        $ins = Db::q('INSERT OR IGNORE INTO pase_reclamos (temporada, jugador_id, nivel, pista, tipo, item, cantidad, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$t['numero'], $j, $nivel, $pista, $r['tipo'], $r['item'], (int) $r['cantidad'], self::ahora()])->rowCount();
        if (!$ins) return $no('Ya reclamaste ese premio.', 409, 'ya_reclamado');
        $origen = 'pase:' . $t['numero'] . ':' . $nivel . ':' . $pista;
        $entregas = [];
        $cred = 0;
        $entregaId = null;
        if ($r['tipo'] === 'creditos') {
            $cred = max(0, min((int) $r['cantidad'], self::topeCreditos() - (int) $pj['creditos_dados']));
            if ($cred > 0) {
                Monedero::mover($j, $cred, 'pase', $origen);
                Db::q('UPDATE pase_jugador SET creditos_dados = creditos_dados + ?, actualizado = ? WHERE temporada = ? AND jugador_id = ?', [$cred, self::ahora(), $t['numero'], $j]);
            }
        } else {
            $e = Monedero::entregar($j, $r['tipo'], (string) $r['item'], (int) $r['cantidad'], $origen);
            $entregas[] = $e;
            $entregaId = $e['id'];
            // El contrato estrella se crea ya (Estrellas::reclamarEntregas haría lo mismo después: misma ref, no se duplica)
            if ($r['tipo'] === 'estrella' && method_exists(Estrellas::class, 'otorgar')) Estrellas::otorgar($j, null, (int) $r['cantidad'], 'pase', 'entrega:' . $e['id']);
        }
        Db::q('UPDATE pase_reclamos SET creditos = ?, entrega_id = ? WHERE temporada = ? AND jugador_id = ? AND nivel = ? AND pista = ?', [$cred, $entregaId, $t['numero'], $j, $nivel, $pista]);
        return ['reclamado' => ['temporada' => $t['numero'], 'nivel' => $nivel, 'pista' => $pista, 'recompensa' => $r, 'creditos' => $cred], 'entregas' => $entregas];
    }

    // ------------------------------------------------------------------ saltos
    /** POST /api/pase/saltar {niveles}: sube N niveles por créditos (precio por nivel; máximo SALTOS_MAX por temporada). */
    public static function saltar(int $j, int $niveles): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        Fallo::si($niveles < 1 || $niveles > self::SALTOS_MAX, 'Puedes saltar de 1 a ' . self::SALTOS_MAX . ' niveles.', 400, ['codigo' => 'niveles_invalidos']);
        Db::tx(function () use ($j, $niveles): void {
            $t = self::actual();
            Fallo::si($t === null, 'El Pase de Temporada todavía no empieza.', 409, ['codigo' => 'sin_temporada']);
            $pj = self::asegurarJugador($t['numero'], $j);
            $quedan = self::SALTOS_MAX - (int) $pj['saltos'];
            Fallo::si($niveles > $quedan, $quedan > 0 ? 'Esta temporada solo puedes saltar ' . $quedan . ' nivel(es) más.' : 'Ya usaste los ' . self::SALTOS_MAX . ' saltos de nivel de esta temporada.', 409,
                ['codigo' => 'saltos_tope', 'quedan' => $quedan]);
            $nivel = self::nivel(self::xpTotal($j, $t['numero']));
            Fallo::si($nivel + $niveles > self::NIVELES, $nivel >= self::NIVELES ? 'Ya estás en el nivel máximo.' : 'Solo te faltan ' . (self::NIVELES - $nivel) . ' nivel(es) para el máximo.', 409, ['codigo' => 'nivel_max']);
            $costo = $niveles * self::precioSalto();
            Fallo::si(Monedero::saldo($j) < $costo, 'No tienes créditos suficientes. Necesitas ' . $costo . ' créditos.', 402, ['codigo' => 'sin_creditos', 'necesitas' => $costo]);
            $k = (int) $pj['saltos'] + 1;
            $ref = 'salto:' . $t['numero'] . ':' . $k . '-' . ($k + $niveles - 1);
            Monedero::mover($j, -$costo, 'pase_salto', 'pase:' . $ref);
            self::anotar($j, $t['numero'], 'salto', $ref, $niveles * self::XP_NIVEL);
            Db::q('UPDATE pase_jugador SET saltos = saltos + ?, actualizado = ? WHERE temporada = ? AND jugador_id = ?', [$niveles, self::ahora(), $t['numero'], $j]);
        });
        return ['ok' => true, 'creditos' => Monedero::saldo($j), 'pase' => self::estado($j)];
    }

    // ------------------------------------------------------------------ compras (ganchos)
    /** Para Compras::exigirComprable: ya tiene premium esta temporada -> 409. */
    public static function exigirComprable(int $j, string $producto): void
    {
        if (!isset(self::PRODUCTOS[$producto])) return;
        self::preparar();
        $t = self::actual();
        Fallo::si($t === null, 'El Pase de Temporada todavía no empieza.', 409, ['codigo' => 'sin_temporada']);
        Fallo::si(self::esPremium($j, $t['numero']), 'Ya tienes el Pase Premium de la ' . $t['nombre'] . '.', 409, ['codigo' => 'pase_ya_premium']);
    }

    /** Gancho compra_aprobada {compra_id, jugador_id, producto, monto_usd, canal}. Idempotente por compra_id. */
    public static function alAprobarCompra(array $d): void
    {
        $prod = (string) ($d['producto'] ?? '');
        if (!isset(self::PRODUCTOS[$prod])) return;
        $compra = (int) ($d['compra_id'] ?? 0);
        $j = (int) ($d['jugador_id'] ?? 0);
        if ($compra <= 0 || $j <= 0) return;
        self::preparar();
        self::atomico(function () use ($prod, $compra, $j): void {
            if (Db::valor('SELECT 1 FROM pase_compras WHERE compra_id = ?', [$compra])) return;
            $t = self::actual() ?? self::temporada(1);   // pagada antes de la Temporada 1: vale para la primera
            $pj = self::asegurarJugador($t['numero'], $j);
            $plus = self::PRODUCTOS[$prod]['plus'];
            if ((int) $pj['premium'] && (!$plus || (int) $pj['plus'])) {
                Db::q("INSERT INTO pase_compras (compra_id, jugador_id, temporada, producto, plus, estado, creado) VALUES (?, ?, ?, ?, ?, 'duplicada', ?)", [$compra, $j, $t['numero'], $prod, (int) $plus, self::ahora()]);
                Db::aviso('pase_duplicado', 'El jugador ' . $j . ' pagó "' . $prod . '" (compra N° ' . $compra . ') y ya tenía el Pase Premium' . ((int) $pj['plus'] ? ' Plus' : '') . ' de la temporada ' . $t['numero'] . '. No se entregó otra vez: devolver el dinero o dar créditos a mano.', $compra);
                return;
            }
            Db::q('UPDATE pase_jugador SET premium = 1' . ($plus ? ', plus = 1' : '') . ', premium_desde = COALESCE(premium_desde, ?), actualizado = ? WHERE temporada = ? AND jugador_id = ?',
                [self::ahora(), self::ahora(), $t['numero'], $j]);
            if ($plus) self::anotar($j, $t['numero'], 'plus', 'plus:compra:' . $compra, self::PLUS_NIVELES * self::XP_NIVEL);
            Db::q("INSERT INTO pase_compras (compra_id, jugador_id, temporada, producto, plus, estado, creado) VALUES (?, ?, ?, ?, ?, 'aplicada', ?)", [$compra, $j, $t['numero'], $prod, (int) $plus, self::ahora()]);
        });
    }

    /**
     * Gancho compra_revertida {compra_id, jugador_id, motivo}: quita el premium (si ninguna otra compra lo sostiene) y los
     * niveles del plus. Lo que todavía no reclamó ya no se puede reclamar. Lo YA reclamado que dependía de eso queda
     * marcado para revisión (y los créditos que dio se descuentan, aunque el saldo quede negativo, como en Compras::revertir).
     */
    public static function alRevertirCompra(array $d): void
    {
        $compra = (int) ($d['compra_id'] ?? 0);
        if ($compra <= 0) return;
        self::preparar();
        self::atomico(function () use ($compra): void {
            $c = Db::fila('SELECT * FROM pase_compras WHERE compra_id = ?', [$compra]);
            if (!$c || $c['estado'] === 'revertida') return;
            $j = (int) $c['jugador_id'];
            $tn = (int) $c['temporada'];
            $antes = $c['estado'];
            Db::q("UPDATE pase_compras SET estado = 'revertida', revertida_en = ? WHERE compra_id = ?", [self::ahora(), $compra]);
            if ($antes !== 'aplicada') return;   // duplicada: no había dado nada
            if ((int) $c['plus']) self::anotar($j, $tn, 'plus_revertido', 'plus_revertido:compra:' . $compra, -self::PLUS_NIVELES * self::XP_NIVEL);
            $quedan = Db::todas("SELECT plus FROM pase_compras WHERE jugador_id = ? AND temporada = ? AND estado = 'aplicada'", [$j, $tn]);
            $premium = count($quedan) > 0;
            $plus = (bool) array_filter($quedan, fn($x) => (int) $x['plus']);
            Db::q('UPDATE pase_jugador SET premium = ?, plus = ?' . ($premium ? '' : ', premium_desde = NULL') . ', actualizado = ? WHERE temporada = ? AND jugador_id = ?',
                [(int) $premium, (int) $plus, self::ahora(), $tn, $j]);
            $nivel = self::nivel(self::xpTotal($j, $tn));
            // inválidos ahora: los de niveles que ya no tiene y, sin premium, todos los de la pista premium
            $malos = Db::todas('SELECT * FROM pase_reclamos WHERE temporada = ? AND jugador_id = ? AND revisar = 0 AND (nivel > ?' . ($premium ? '' : " OR pista = 'premium'") . ')',
                [$tn, $j, $nivel]);
            if (!$malos) return;
            $cred = 0;
            foreach ($malos as $m) {
                $cr = (int) $m['creditos'] - (int) $m['creditos_devueltos'];
                Db::q('UPDATE pase_reclamos SET revisar = 1, creditos_devueltos = creditos_devueltos + ? WHERE temporada = ? AND jugador_id = ? AND nivel = ? AND pista = ?',
                    [max(0, $cr), $tn, $j, $m['nivel'], $m['pista']]);
                $cred += max(0, $cr);
            }
            if ($cred > 0) Monedero::mover($j, -$cred, 'pase_reversion', 'pase:' . $tn . ':reversion:' . $compra, true);
            Db::q('UPDATE pase_jugador SET revisar = 1, creditos_dados = MAX(0, creditos_dados - ?), actualizado = ? WHERE temporada = ? AND jugador_id = ?', [$cred, self::ahora(), $tn, $j]);
            $lista = implode(', ', array_map(fn($m) => 'nivel ' . $m['nivel'] . ' ' . $m['pista'] . ' (' . $m['tipo'] . ' ' . $m['item'] . ' x' . $m['cantidad'] . ')', $malos));
            Db::aviso('pase_revertido', 'Compra N° ' . $compra . ' del Pase (' . $c['producto'] . ', jugador ' . $j . ', temporada ' . $tn . ') revertida. Premios ya reclamados para revisar: '
                . $lista . '. Créditos descontados: ' . $cred . '.', $compra);
        });
    }

    /** Cosméticos del pase que tiene el jugador (claves), por si otro módulo los necesita (chat, sede). */
    public static function cosmeticos(int $j): array
    {
        self::preparar();
        return array_column(Db::todas("SELECT item FROM pase_reclamos WHERE jugador_id = ? AND tipo = 'cosmetico' AND revisar = 0 ORDER BY temporada, nivel", [$j]), 'item');
    }

    /** ¿Hay una Db::tx abierta? (Db hace BEGIN IMMEDIATE a mano: PDO::inTransaction() no lo sabe.) */
    private static function enTransaccion(): bool
    {
        try { return (int) (new \ReflectionProperty(Db::class, 'profundidad'))->getValue() > 0; } catch (\Throwable) { return Db::pdo()->inTransaction(); }
    }

    /** Ejecuta $f de forma atómica: en su propia transacción, o con un SAVEPOINT si ya hay una abierta (ganchos, intentos). */
    private static function atomico(callable $f): mixed
    {
        $pdo = Db::pdo();
        if (!self::enTransaccion()) return Db::tx($f);
        $sp = 'pase_sp' . (++self::$sp);
        $pdo->exec('SAVEPOINT ' . $sp);
        try {
            $r = $f();
            $pdo->exec('RELEASE ' . $sp);
            return $r;
        } catch (\Throwable $e) {
            $pdo->exec('ROLLBACK TO ' . $sp);
            $pdo->exec('RELEASE ' . $sp);
            throw $e;
        }
    }
}
