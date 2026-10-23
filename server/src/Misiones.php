<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Misiones del día y de la semana (las generales del juego; las del Pase de Temporada son otras y siguen en Pase.php).
 * Contrato: server/INTEGRAR_MISIONES.md. El juego (js/misiones.js) cuenta el avance en la partida y la tabla de premios
 * es FIJA y la misma en los dos lados (MISIONES_DIA, MISIONES_SEMANA, COFRES; tests/test_misiones.js revisa que el
 * JavaScript diga lo mismo que esta clase).
 *
 * Qué valida el servidor (a propósito, poco: los premios son chicos):
 *   - la cuenta está activa, el periodo es de hoy (±1 día por la zona horaria del celular) o de esta semana,
 *   - la misión es una de las 5 del día / de la semana para esa fecha (se eligen con un hash de la fecha, sin azar),
 *   - cada premio se reclama UNA vez por jugador y periodo (UNIQUE), con la hora en que se reclamó,
 *   - los créditos (solo en los cofres de 60 y 100 puntos) tienen un tope por día del servidor (ajuste misiones_creditos_dia).
 * NO valida el avance (el servidor no ve los eventos de la partida local): alguien que haga trampa en su celular saca como
 * mucho el tope diario de créditos y los materiales fijos de la tabla. Ver INTEGRAR_MISIONES.md, "Decisión".
 */
final class Misiones
{
    /** Por periodo: la misión fija + 4 elegidas por la fecha. */
    public const POR_PERIODO = 5;
    public const PUNTOS_MISION = 20;          // puntos de actividad por misión del día reclamada
    public const CREDITOS_DIA = 10;           // tope de créditos por día (ajuste misiones_creditos_dia)
    /** XP del Pase de Temporada por misión reclamada (solo si existe Pase y acepta la fuente "misiones"). */
    public const XP_PASE = ['d' => 15, 's' => 40];

    /**
     * Misiones del día: k = contador del juego, n = meta, premio fijo. en_linea = solo con cuenta. La primera es fija.
     * premio: dinero (del juego), cons (repuestos: cable, battery), mat (materiales de la sede), creditos.
     */
    public const MISIONES_DIA = [
        'eventos'    => ['k' => 'evento', 'n' => 3, 'premio' => ['dinero' => 250]],
        'estrellas4' => ['k' => 'estrellas4', 'n' => 1, 'premio' => ['dinero' => 200, 'cons' => ['cable' => 1]]],
        'cinco'      => ['k' => 'estrellas5', 'n' => 1, 'premio' => ['dinero' => 350]],
        'ganar'      => ['k' => 'ganar', 'n' => 800, 'premio' => ['dinero' => 150, 'cons' => ['battery' => 1]]],
        'reparar'    => ['k' => 'reparar', 'n' => 1, 'premio' => ['dinero' => 200]],
        'contratar'  => ['k' => 'contratar', 'n' => 1, 'premio' => ['dinero' => 200]],
        'repuesto'   => ['k' => 'repuesto', 'n' => 1, 'premio' => ['dinero' => 100, 'cons' => ['battery' => 1]]],
        'equipo'     => ['k' => 'equipo', 'n' => 1, 'premio' => ['dinero' => 250]],
        'publicidad' => ['k' => 'publicidad', 'n' => 1, 'premio' => ['dinero' => 150]],
        'en_linea'   => ['k' => 'en_linea', 'n' => 1, 'en_linea' => true, 'premio' => ['dinero' => 300, 'cons' => ['cable' => 1]]],
        'entrega'    => ['k' => 'entrega', 'n' => 1, 'premio' => ['dinero' => 150, 'cons' => ['cable' => 1]]],
    ];
    public const MISIONES_SEMANA = [
        'eventos_s'    => ['k' => 'evento', 'n' => 15, 'premio' => ['dinero' => 1200, 'mat' => ['cables' => 8]]],
        'estrellas4_s' => ['k' => 'estrellas4', 'n' => 6, 'premio' => ['dinero' => 1000, 'mat' => ['placas' => 6]]],
        'cinco_s'      => ['k' => 'estrellas5', 'n' => 3, 'premio' => ['dinero' => 1500, 'mat' => ['paneles' => 8]]],
        'ganar_s'      => ['k' => 'ganar', 'n' => 6000, 'premio' => ['dinero' => 900, 'mat' => ['paneles' => 5]]],
        'reparar_s'    => ['k' => 'reparar', 'n' => 5, 'premio' => ['dinero' => 800, 'cons' => ['cable' => 4]]],
        'contratar_s'  => ['k' => 'contratar', 'n' => 2, 'premio' => ['dinero' => 800, 'mat' => ['planos' => 4]]],
        'en_linea_s'   => ['k' => 'en_linea', 'n' => 5, 'en_linea' => true, 'premio' => ['dinero' => 1200, 'mat' => ['credenciales' => 6]]],
        'obra_s'       => ['k' => 'obra', 'n' => 2, 'premio' => ['dinero' => 1000, 'mat' => ['placas' => 8]]],
        'entrega_s'    => ['k' => 'entrega', 'n' => 5, 'premio' => ['dinero' => 800, 'mat' => ['chips' => 1]]],
    ];
    /** Cofre de actividad del día: se abre con los puntos de las misiones del día (20 cada una). Contenido fijo. */
    public const COFRES = [
        20  => ['dinero' => 150, 'cons' => ['cable' => 1]],
        40  => ['dinero' => 250, 'cons' => ['battery' => 1]],
        60  => ['dinero' => 350, 'mat' => ['cables' => 6], 'creditos' => 3],
        80  => ['dinero' => 500, 'cons' => ['cable' => 2], 'mat' => ['placas' => 5]],
        100 => ['dinero' => 800, 'mat' => ['paneles' => 5, 'planos' => 3], 'creditos' => 5],
    ];
    public const MATS = ['cables', 'placas', 'paneles', 'credenciales', 'planos', 'chips'];

    private static ?int $reloj = null;
    private static bool $listo = false;
    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'misiones_reclamos'")) Migraciones::aplicar('misiones.sql');
        self::$listo = true;
    }

    public static function topeCreditos(): int
    {
        $v = trim(Ajustes::get('misiones_creditos_dia'));
        return preg_match('/^\d{1,5}$/', $v) ? (int) $v : self::CREDITOS_DIA;
    }

    // ------------------------------------------------------------------ fechas y elección (igual que js/misiones.js)
    /** FNV-1a de 32 bits (el mismo número en PHP y en JavaScript). */
    public static function fnv(string $s): int
    {
        $h = 0x811C9DC5;
        $n = strlen($s);
        for ($i = 0; $i < $n; $i++) { $h ^= ord($s[$i]); $h = ($h * 0x01000193) & 0xFFFFFFFF; }
        return $h;
    }

    /** Las 5 misiones de la fecha: la primera de la lista (fija) + las 4 con menor hash(fecha:id). */
    public static function elegir(string $tipo, string $fecha, bool $enLinea = true): array
    {
        $defs = $tipo === 's' ? self::MISIONES_SEMANA : self::MISIONES_DIA;
        $ids = array_keys($defs);
        $fija = array_shift($ids);
        if (!$enLinea) $ids = array_values(array_filter($ids, fn($id) => empty($defs[$id]['en_linea'])));
        $h = [];
        foreach ($ids as $id) $h[$id] = self::fnv($fecha . ':' . $id);
        usort($ids, fn($a, $b) => $h[$a] <=> $h[$b] ?: strcmp($a, $b));
        return array_merge([$fija], array_slice($ids, 0, self::POR_PERIODO - 1));
    }

    public static function hoy(?int $t = null): string { return date('Y-m-d', $t ?? self::ahora()); }
    /** Lunes de la semana de una fecha AAAA-MM-DD. */
    public static function lunes(string $fecha): string
    {
        $d = new \DateTimeImmutable($fecha . ' 12:00:00', new \DateTimeZone('UTC'));
        return $d->modify('-' . ((int) $d->format('N') - 1) . ' days')->format('Y-m-d');
    }
    private static function diaNum(string $f): int { return intdiv((new \DateTimeImmutable($f . ' 12:00:00', new \DateTimeZone('UTC')))->getTimestamp(), 86400); }
    private static function fechaOk(string $f): bool
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $f, $m)) return false;
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /**
     * "d:AAAA-MM-DD" (el día del celular: hoy ±1 en la zona del servidor) o "s:AAAA-MM-DD" (el lunes de una semana que
     * toca hoy ±1). Devuelve [tipo, fecha] o lanza Fallo periodo_invalido.
     */
    public static function periodo(string $p): array
    {
        $ok = preg_match('/^([ds]):(\d{4}-\d{2}-\d{2})$/', $p, $m) && self::fechaOk($m[2]);
        Fallo::si(!$ok, 'Ese periodo de misiones no es válido.', 400, ['codigo' => 'periodo_invalido']);
        $hoy = self::diaNum(self::hoy());
        $d = self::diaNum($m[2]);
        if ($m[1] === 'd') $vale = abs($d - $hoy) <= 1;
        else $vale = self::lunes($m[2]) === $m[2] && $d <= $hoy + 1 && $d + 6 >= $hoy - 1;
        Fallo::si(!$vale, 'Esas misiones ya vencieron. Mira las de hoy.', 409, ['codigo' => 'misiones_vencidas']);
        return [$m[1], $m[2]];
    }

    /** Definición fija de una clave: misión del día/semana elegida para esa fecha, o "cofre20".."cofre100" (solo día). */
    public static function definicion(string $tipo, string $fecha, string $clave): ?array
    {
        if ($tipo === 'd' && preg_match('/^cofre(\d{2,3})$/', $clave, $m) && isset(self::COFRES[(int) $m[1]])) return ['cofre' => (int) $m[1], 'premio' => self::COFRES[(int) $m[1]]];
        $defs = $tipo === 's' ? self::MISIONES_SEMANA : self::MISIONES_DIA;
        if (!isset($defs[$clave]) || !in_array($clave, self::elegir($tipo, $fecha), true)) return null;
        return $defs[$clave];
    }

    // ------------------------------------------------------------------ estado y reclamos
    /** GET /api/misiones: lo ya reclamado (para otro celular), las misiones elegidas y el tope de créditos. */
    public static function estado(int $j): array
    {
        self::preparar();
        $hoy = self::hoy();
        $per = [];
        foreach (Db::todas('SELECT periodo, clave FROM misiones_reclamos WHERE jugador_id = ? AND creado >= ? ORDER BY id', [$j, self::ahora() - 16 * 86400]) as $f) $per[$f['periodo']][] = $f['clave'];
        $lun = self::lunes($hoy);
        return ['ok' => true, 'hoy' => $hoy, 'lunes' => $lun, 'reclamados' => (object) $per,
            'dia' => self::elegir('d', $hoy), 'semana' => self::elegir('s', $lun),
            'creditos_hoy' => self::creditosHoy($j), 'creditos_tope' => self::topeCreditos(), 'xp_pase' => self::hayXpPase()];
    }

    private static function creditosHoy(int $j): int
    {
        return (int) Db::valor('SELECT COALESCE(SUM(creditos), 0) FROM misiones_reclamos WHERE jugador_id = ? AND dia = ?', [$j, self::hoy()]);
    }

    public static function hayXpPase(): bool { return class_exists(Pase::class) && isset(Pase::XP['misiones']); }

    /**
     * POST /api/misiones/reclamar {periodo, clave}. Da los créditos (con tope por día) y los materiales de la sede como
     * entregas (las absorbe la sede oficial); el dinero y los repuestos los suma el juego en la partida (vienen en "premio").
     */
    public static function reclamar(int $j, string $periodo, string $clave): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        [$tipo, $fecha] = self::periodo($periodo);
        Fallo::si(!preg_match('/^[a-z0-9_]{1,24}$/', $clave), 'Esa misión no existe.', 400, ['codigo' => 'mision_invalida']);
        $def = self::definicion($tipo, $fecha, $clave);
        Fallo::si($def === null, 'Esa misión no es de este periodo.', 404, ['codigo' => 'mision_invalida']);
        $r = Db::tx(function () use ($j, $tipo, $periodo, $clave, $def): array {
            $ya = Db::fila('SELECT creado FROM misiones_reclamos WHERE jugador_id = ? AND periodo = ? AND clave = ?', [$j, $periodo, $clave]);
            Fallo::si($ya !== null, 'Ya reclamaste ese premio.', 409, ['codigo' => 'ya_reclamado', 'reclamado' => $ya ? Db::iso((int) $ya['creado']) : null]);
            $p = $def['premio'];
            $cred = max(0, min((int) ($p['creditos'] ?? 0), self::topeCreditos() - self::creditosHoy($j)));
            Db::q('INSERT INTO misiones_reclamos (jugador_id, periodo, clave, creditos, xp, dia, creado) VALUES (?, ?, ?, ?, 0, ?, ?)',
                [$j, $periodo, $clave, $cred, self::hoy(), self::ahora()]);
            $id = Db::ultimoId();
            $origen = 'misiones:' . $periodo . ':' . $clave;
            if ($cred > 0) Monedero::mover($j, $cred, 'misiones', $origen);
            $entregas = [];
            foreach (($p['mat'] ?? []) as $m => $n) if (in_array($m, self::MATS, true) && $n > 0) $entregas[] = Monedero::entregar($j, 'materiales', $m, (int) $n, $origen);
            $xp = 0;
            if (!isset($def['cofre']) && self::hayXpPase()) {
                $x = Pase::sumarXp($j, self::XP_PASE[$tipo], 'misiones', $periodo . ':' . $clave);
                $xp = $x ? (int) $x['xp'] : 0;
                if ($xp) Db::q('UPDATE misiones_reclamos SET xp = ? WHERE id = ?', [$xp, $id]);
            }
            return ['creditos_dados' => $cred, 'entregas' => $entregas, 'xp_pase' => $xp, 'tope_alcanzado' => $cred < (int) ($p['creditos'] ?? 0)];
        });
        return ['ok' => true, 'periodo' => $periodo, 'clave' => $clave, 'premio' => $def['premio']] + $r
            + ['creditos' => Monedero::saldo($j), 'creditos_hoy' => self::creditosHoy($j), 'creditos_tope' => self::topeCreditos()];
    }
}
