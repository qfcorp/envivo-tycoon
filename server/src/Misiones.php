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
 *
 * PREMIOS POR CONSTANCIA (pedido de Dimitry: "a los F2P demos regalos si hacen misiones"; economía en MONETIZACION.md §6):
 *   - Un "día activo" = un día del celular en que abriste el cofre de 60 puntos (3 misiones del día). Lo cuenta el SERVIDOR
 *     con sus propios reclamos (misiones_reclamos, clave cofre60): no se le cree al celular.
 *   - Cofre de constancia semanal ("s:<lunes>", clave "constancia"): con CONSTANCIA['meta'] días activos de esa semana.
 *     Trae dinero, materiales, créditos y el PREMIO DE LA SEMANA (rota cada lunes: equipo de obra extra 24 h, personal
 *     estrella de la semana por 2 partidos o prueba del Pase VIP por 1 día), por los caminos de siempre (Impulsos::darHoras,
 *     Estrellas::otorgar, Monedero::sumarVip).
 *   - Ruta del mes ("m:AAAA-MM", claves mes7 / mes14 / mes21): 7, 14 y 21 días activos en el mes. El de 21 trae un equipo
 *     de Edición Exclusiva PERMANENTE (rota cada mes entre los baratos; Inventario::crear, origen "misiones").
 *   - Créditos con dos topes: el del día (misiones_creditos_dia, solo los cofres del día) y uno por semana del servidor para
 *     TODO lo de misiones (misiones_creditos_semana, CREDITOS_SEMANA).
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

    /** Premios por constancia (la MISMA tabla en js/misiones.js; tests/test_misiones_f2p.js lo revisa). */
    public const CREDITOS_SEMANA = 120;       // tope de créditos de misiones por semana del servidor (ajuste misiones_creditos_semana)
    public const DIA_ACTIVO = 'cofre60';      // un día cuenta cuando se abre este cofre
    public const CONSTANCIA = ['meta' => 5, 'premio' => ['dinero' => 2000, 'mat' => ['cables' => 10, 'placas' => 10, 'paneles' => 10, 'chips' => 1], 'creditos' => 25]];
    /** Premio de la semana (con cuenta): rota cada lunes en este orden. */
    public const PREMIOS_SEMANA = [
        'obra'     => ['horas' => 24],      // equipo de obra extra de la sede oficial por 24 h
        'estrella' => ['partidos' => 2],    // la estrella de la semana de la agencia, 2 partidos de Copa o Duelos
        'vip'      => ['dias' => 1],        // prueba del Pase VIP por 1 día (se suma al que tengas)
    ];
    /** Ruta del mes: días activos => premio. 'exclusivo' = el equipo exclusivo del mes (solo con cuenta). */
    public const MES = [
        7  => ['dinero' => 1500, 'mat' => ['planos' => 8, 'credenciales' => 8], 'creditos' => 20],
        14 => ['dinero' => 2500, 'mat' => ['paneles' => 12, 'chips' => 2], 'creditos' => 30],
        21 => ['dinero' => 3000, 'exclusivo' => 1],
    ];
    /** Equipo de Edición Exclusiva del mes (rota; los más baratos del catálogo: 100 a 300 créditos). */
    public const EXCLUSIVOS_MES = ['ex_lluvia', 'ex_maletas', 'ex_cable', 'ex_mics', 'ex_monitor', 'ex_wireless'];

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

    public static function topeCreditosSemana(): int
    {
        $v = trim(Ajustes::get('misiones_creditos_semana'));
        return preg_match('/^\d{1,6}$/', $v) ? (int) $v : self::CREDITOS_SEMANA;
    }

    // ------------------------------------------------------------------ premios por constancia (igual que js/misiones.js)
    /** Número de la semana (lunes) desde 1970: el premio de la semana rota con él. */
    public static function semanaNum(string $lunes): int { return intdiv(self::diaNum($lunes) - 4, 7); }
    /** Clave del premio de la semana del lunes $lunes ('obra' | 'estrella' | 'vip'). */
    public static function premioSemana(string $lunes): string
    {
        $k = array_keys(self::PREMIOS_SEMANA);
        return $k[((self::semanaNum($lunes) % count($k)) + count($k)) % count($k)];
    }
    /** Equipo exclusivo del mes "AAAA-MM". */
    public static function exclusivoMes(string $mes): string
    {
        $n = (int) substr($mes, 0, 4) * 12 + (int) substr($mes, 5, 2) - 1;
        return self::EXCLUSIVOS_MES[$n % count(self::EXCLUSIVOS_MES)];
    }
    /** Días activos (cofre de 60 abierto) entre dos fechas del celular, contados con los reclamos del servidor. */
    public static function diasActivos(int $j, string $desde, string $hasta): int
    {
        return (int) Db::valor('SELECT COUNT(DISTINCT periodo) FROM misiones_reclamos WHERE jugador_id = ? AND clave = ? AND periodo >= ? AND periodo <= ?',
            [$j, self::DIA_ACTIVO, 'd:' . $desde, 'd:' . $hasta]);
    }
    private static function masDias(string $f, int $n): string { return gmdate('Y-m-d', (self::diaNum($f) + $n) * 86400 + 43200); }

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
        if (preg_match('/^m:(\d{4})-(\d{2})$/', $p, $mm)) {
            Fallo::si(!checkdate((int) $mm[2], 1, (int) $mm[1]), 'Ese periodo de misiones no es válido.', 400, ['codigo' => 'periodo_invalido']);
            $hoy = self::hoy();
            $mes = $mm[1] . '-' . $mm[2];
            $vale = in_array($mes, [substr(self::masDias($hoy, -1), 0, 7), substr($hoy, 0, 7), substr(self::masDias($hoy, 1), 0, 7)], true);
            Fallo::si(!$vale, 'Esas misiones ya vencieron. Mira las de hoy.', 409, ['codigo' => 'misiones_vencidas']);
            return ['m', $mes];
        }
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
        if ($tipo === 's' && $clave === 'constancia') return ['constancia' => true, 'meta' => self::CONSTANCIA['meta'], 'premio' => self::CONSTANCIA['premio'], 'extra' => self::premioSemana($fecha)];
        if ($tipo === 'm') {
            if (!preg_match('/^mes(\d{1,2})$/', $clave, $h) || !isset(self::MES[(int) $h[1]])) return null;
            return ['mes' => (int) $h[1], 'meta' => (int) $h[1], 'premio' => self::MES[(int) $h[1]]];
        }
        if ($tipo === 'd' && preg_match('/^cofre(\d{2,3})$/', $clave, $m) && isset(self::COFRES[(int) $m[1]])) return ['cofre' => (int) $m[1], 'premio' => self::COFRES[(int) $m[1]]];
        $defs = $tipo === 's' ? self::MISIONES_SEMANA : self::MISIONES_DIA;
        if (!isset($defs[$clave]) || !in_array($clave, self::elegir($tipo, $fecha), true)) return null;
        return $defs[$clave];
    }

    // ------------------------------------------------------------------ estado y reclamos
    /** GET /api/misiones: lo ya reclamado (para otro celular), las misiones elegidas, los topes y los premios por constancia. */
    public static function estado(int $j): array
    {
        self::preparar();
        $hoy = self::hoy();
        $lun = self::lunes($hoy);
        $mes = substr($hoy, 0, 7);
        $per = [];
        foreach (Db::todas('SELECT periodo, clave FROM misiones_reclamos WHERE jugador_id = ? AND (creado >= ? OR periodo IN (?, ?)) ORDER BY id',
            [$j, self::ahora() - 16 * 86400, 'm:' . $mes, 'm:' . substr(self::masDias($lun, -1), 0, 7)]) as $f) $per[$f['periodo']][] = $f['clave'];
        return ['ok' => true, 'hoy' => $hoy, 'lunes' => $lun, 'reclamados' => (object) $per,
            'dia' => self::elegir('d', $hoy), 'semana' => self::elegir('s', $lun),
            'creditos_hoy' => self::creditosHoy($j), 'creditos_tope' => self::topeCreditos(), 'xp_pase' => self::hayXpPase(),
            'creditos_semana' => self::creditosSemana($j), 'creditos_semana_tope' => self::topeCreditosSemana(),
            'constancia' => self::constancia($j, $hoy)];
    }

    /** Premios por constancia de la semana y el mes de $hoy (y los días activos de los últimos 45 días, para el celular). */
    public static function constancia(int $j, string $hoy): array
    {
        $lun = self::lunes($hoy);
        $mes = substr($hoy, 0, 7);
        $dias = array_map(fn($p) => substr((string) $p, 2), array_column(Db::todas('SELECT DISTINCT periodo FROM misiones_reclamos WHERE jugador_id = ? AND clave = ? AND periodo >= ? ORDER BY periodo',
            [$j, self::DIA_ACTIVO, 'd:' . self::masDias($hoy, -45)]), 'periodo'));
        return ['dias' => $dias,
            'semana' => ['lunes' => $lun, 'activos' => self::diasActivos($j, $lun, self::masDias($lun, 6)), 'meta' => self::CONSTANCIA['meta'], 'premio' => self::premioSemana($lun)],
            'mes' => ['mes' => $mes, 'activos' => self::diasActivos($j, $mes . '-01', $mes . '-31'), 'exclusivo' => self::exclusivoMes($mes)]];
    }

    private static function creditosHoy(int $j): int
    {
        return (int) Db::valor("SELECT COALESCE(SUM(creditos), 0) FROM misiones_reclamos WHERE jugador_id = ? AND dia = ? AND periodo LIKE 'd:%'", [$j, self::hoy()]);
    }
    private static function creditosSemana(int $j): int
    {
        $lun = self::lunes(self::hoy());
        return (int) Db::valor('SELECT COALESCE(SUM(creditos), 0) FROM misiones_reclamos WHERE jugador_id = ? AND dia >= ? AND dia <= ?', [$j, $lun, self::masDias($lun, 6)]);
    }

    public static function hayXpPase(): bool { return class_exists(Pase::class) && isset(Pase::XP['misiones']); }

    /**
     * POST /api/misiones/reclamar {periodo, clave}. Da los créditos (con tope por día y por semana), los materiales de la sede
     * como entregas (las absorbe la sede oficial) y lo especial de los premios por constancia; el dinero y los repuestos los
     * suma el juego en la partida (vienen en "premio").
     */
    public static function reclamar(int $j, string $periodo, string $clave): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        [$tipo, $fecha] = self::periodo($periodo);
        Fallo::si(!preg_match('/^[a-z0-9_]{1,24}$/', $clave), 'Esa misión no existe.', 400, ['codigo' => 'mision_invalida']);
        $def = self::definicion($tipo, $fecha, $clave);
        Fallo::si($def === null, 'Esa misión no es de este periodo.', 404, ['codigo' => 'mision_invalida']);
        $r = Db::tx(function () use ($j, $tipo, $fecha, $periodo, $clave, $def): array {
            $ya = Db::fila('SELECT creado FROM misiones_reclamos WHERE jugador_id = ? AND periodo = ? AND clave = ?', [$j, $periodo, $clave]);
            Fallo::si($ya !== null, 'Ya reclamaste ese premio.', 409, ['codigo' => 'ya_reclamado', 'reclamado' => $ya ? Db::iso((int) $ya['creado']) : null]);
            if (isset($def['meta'])) {
                $activos = $tipo === 'm' ? self::diasActivos($j, $fecha . '-01', $fecha . '-31') : self::diasActivos($j, $fecha, self::masDias($fecha, 6));
                Fallo::si($activos < $def['meta'], 'Todavía no completas los días que pide ese premio (' . $activos . ' de ' . $def['meta'] . ').', 409,
                    ['codigo' => 'no_disponible', 'activos' => $activos, 'meta' => $def['meta']]);
            }
            $p = $def['premio'];
            $quiere = (int) ($p['creditos'] ?? 0);
            $libre = self::topeCreditosSemana() - self::creditosSemana($j);
            if ($tipo === 'd') $libre = min($libre, self::topeCreditos() - self::creditosHoy($j));
            $cred = max(0, min($quiere, $libre));
            Db::q('INSERT INTO misiones_reclamos (jugador_id, periodo, clave, creditos, xp, dia, creado) VALUES (?, ?, ?, ?, 0, ?, ?)',
                [$j, $periodo, $clave, $cred, self::hoy(), self::ahora()]);
            $id = Db::ultimoId();
            $origen = 'misiones:' . $periodo . ':' . $clave;
            if ($cred > 0) Monedero::mover($j, $cred, 'misiones', $origen);
            $entregas = [];
            foreach (($p['mat'] ?? []) as $m => $n) if (in_array($m, self::MATS, true) && $n > 0) $entregas[] = Monedero::entregar($j, 'materiales', $m, (int) $n, $origen);
            $extra = null;
            $equipos = [];
            if (isset($def['extra'])) $extra = self::darPremioSemana($j, $def['extra'], $origen);
            if (!empty($p['exclusivo'])) {
                $item = self::exclusivoMes($fecha);
                $equipos[] = Inventario::crear($j, $item, 'misiones', $origen);
                $extra = ['tipo' => 'exclusivo', 'item' => $item, 'dado' => true];
            }
            $xp = 0;
            if (!isset($def['cofre']) && !isset($def['meta']) && self::hayXpPase()) {
                $x = Pase::sumarXp($j, self::XP_PASE[$tipo], 'misiones', $periodo . ':' . $clave);
                $xp = $x ? (int) $x['xp'] : 0;
                if ($xp) Db::q('UPDATE misiones_reclamos SET xp = ? WHERE id = ?', [$xp, $id]);
            }
            return ['creditos_dados' => $cred, 'entregas' => $entregas, 'equipos' => $equipos, 'extra' => $extra, 'xp_pase' => $xp, 'tope_alcanzado' => $cred < $quiere];
        });
        return ['ok' => true, 'periodo' => $periodo, 'clave' => $clave, 'premio' => $def['premio']] + $r
            + ['creditos' => Monedero::saldo($j), 'creditos_hoy' => self::creditosHoy($j), 'creditos_tope' => self::topeCreditos(),
               'creditos_semana' => self::creditosSemana($j), 'creditos_semana_tope' => self::topeCreditosSemana()];
    }

    /** Entrega el premio de la semana por el camino de siempre. Dentro de la transacción del reclamo. */
    private static function darPremioSemana(int $j, string $k, string $ref): array
    {
        $d = self::PREMIOS_SEMANA[$k];
        $dado = false;
        if ($k === 'obra' && class_exists(Impulsos::class)) $dado = Impulsos::darHoras($j, (int) $d['horas'], $ref);
        elseif ($k === 'estrella' && class_exists(Estrellas::class)) $dado = Estrellas::otorgar($j, null, (int) $d['partidos'], 'regalo', $ref) !== null;
        elseif ($k === 'vip') { Monedero::sumarVip($j, (int) $d['dias']); $dado = true; }
        return ['tipo' => $k, 'dado' => $dado] + $d;
    }
}
