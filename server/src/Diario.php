<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Premio diario: calendario de 7 días (server/INTEGRAR_DIARIO.md). Solo para cuentas; los invitados lo juegan en el
 * celular (js/diario.js) sin créditos.
 * - Un reclamo por día de Ecuador (America/Guayaquil) según el reloj del SERVIDOR (la fecha del celular no cuenta).
 * - Faltar un día pausa el avance (no se pierde nada): el próximo reclamo es el día siguiente del ciclo.
 * - Al reclamar el día 7 empieza un ciclo nuevo en el día 1.
 * - Premios fijos y a la vista (PREMIOS). Dinero del juego, repuestos y materiales de la sede van como entregas
 *   (dinero / consumible / materiales, las aplica el juego o SedeOficial); los créditos van al Monedero con motivo 'diario'.
 * - VIP nivel 3 o más (Vip::nivel, si existe la clase): el dinero del día sale doble.
 * - Sin la clase SedeOficial, los materiales no se entregan (no habría dónde guardarlos).
 */
final class Diario
{
    public const ZONA = 'America/Guayaquil';
    public const DIAS = 7;
    public const VIP_DOBLE = 3;   // nivel VIP desde el que el dinero sale doble

    /**
     * Premio de cada día del ciclo. La misma tabla está en js/diario.js (PREMIOS): tests/test_diario.js revisa que sean iguales.
     * consumibles: claves de Datos.CONSUMIBLES (cable, battery). materiales: SedeOficial::MATS. creditos: solo cuentas.
     */
    public const PREMIOS = [
        1 => ['dinero' => 300, 'consumibles' => [], 'materiales' => [], 'creditos' => 0],
        2 => ['dinero' => 600, 'consumibles' => ['cable' => 2], 'materiales' => ['cables' => 4], 'creditos' => 5, 'grande' => true],
        3 => ['dinero' => 350, 'consumibles' => ['battery' => 1], 'materiales' => [], 'creditos' => 0],
        4 => ['dinero' => 400, 'consumibles' => [], 'materiales' => ['cables' => 3, 'placas' => 2], 'creditos' => 0],
        5 => ['dinero' => 450, 'consumibles' => ['battery' => 2], 'materiales' => [], 'creditos' => 0],
        6 => ['dinero' => 500, 'consumibles' => [], 'materiales' => ['paneles' => 2, 'chips' => 1], 'creditos' => 0],
        7 => ['dinero' => 1000, 'consumibles' => ['cable' => 2, 'battery' => 2], 'materiales' => ['cables' => 5, 'placas' => 4, 'paneles' => 3, 'chips' => 2], 'creditos' => 20, 'grande' => true],
    ];

    /** Reloj inyectable (pruebas). */
    public static ?int $reloj = null;
    public static function ahora(): int { return self::$reloj ?? time(); }

    private static bool $listo = false;
    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('diario_jugador', 'diario_reclamos')");
        if ($n < 2) Migraciones::aplicar('diario.sql');
        self::$listo = true;
    }

    private static function zona(): \DateTimeZone { return new \DateTimeZone(self::ZONA); }

    /** Día de Ecuador (AAAA-MM-DD) de un instante (por defecto, ahora). */
    public static function dia(?int $t = null): string
    {
        return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(self::zona())->format('Y-m-d');
    }

    /** Día anterior a $dia (AAAA-MM-DD). */
    public static function ayer(string $dia): string
    {
        return (new \DateTimeImmutable($dia . ' 12:00:00', self::zona()))->modify('-1 day')->format('Y-m-d');
    }

    /** Medianoche siguiente en Ecuador (segundos Unix): cuándo sale el próximo premio. */
    public static function proximo(?int $t = null): int
    {
        return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(self::zona())->modify('+1 day')->setTime(0, 0)->getTimestamp();
    }

    public static function vipNivel(int $jugador): int
    {
        if (!class_exists(Vip::class)) return 0;
        try { return (int) Vip::nivel($jugador); } catch (\Throwable) { return 0; }
    }

    public static function conSede(): bool { return class_exists(SedeOficial::class); }

    /** Premio del día $paso (1..7) para este jugador (dinero doble con VIP 3+; sin materiales si no hay sede oficial). */
    public static function premio(int $paso, int $vip = 0, ?bool $conSede = null): array
    {
        $p = self::PREMIOS[$paso] ?? self::PREMIOS[1];
        $doble = $vip >= self::VIP_DOBLE;
        return [
            'dia' => $paso,
            'dinero' => (int) $p['dinero'] * ($doble ? 2 : 1),
            'dinero_base' => (int) $p['dinero'],
            'consumibles' => (object) $p['consumibles'],
            'materiales' => (object) (($conSede ?? self::conSede()) ? $p['materiales'] : []),
            'creditos' => (int) $p['creditos'],
            'grande' => !empty($p['grande']),
            'vip_doble' => $doble,
        ];
    }

    private static function fila(int $jugador): array
    {
        self::preparar();
        $f = Db::fila('SELECT * FROM diario_jugador WHERE jugador_id = ?', [$jugador]);
        return $f ?? ['jugador_id' => $jugador, 'paso' => 0, 'ciclo' => 1, 'total' => 0, 'racha' => 0, 'ultimo_dia' => null];
    }

    /**
     * GET /api/diario. "dia" = el día del ciclo que toca (o el que ya se reclamó hoy). "estados" de cada día:
     * reclamado | hoy | siguiente | bloqueado.
     */
    public static function estado(int $jugador, ?int $vip = null): array
    {
        $f = self::fila($jugador);
        $vip ??= self::vipNivel($jugador);
        $hoy = self::dia();
        $hecho = $f['ultimo_dia'] !== null && (string) $f['ultimo_dia'] >= $hoy;
        $paso = (int) $f['paso'];                         // días ya reclamados en el ciclo actual
        // Si hoy ya reclamó el día 7, el ciclo ya avanzó (paso 0): se sigue mostrando el ciclo completo hasta mañana.
        $cicloLleno = $hecho && $paso === 0 && (int) $f['total'] > 0;
        $hechos = $cicloLleno ? self::DIAS : $paso;
        $dia = $hecho ? $hechos : $paso + 1;               // día que toca (o el de hoy ya reclamado)
        $premios = [];
        for ($d = 1; $d <= self::DIAS; $d++) {
            $e = $d <= $hechos ? 'reclamado' : (!$hecho && $d === $dia ? 'hoy' : ($hecho && $d === $hechos + 1 ? 'siguiente' : 'bloqueado'));
            $premios[] = self::premio($d, $vip) + ['estado' => $e];
        }
        $prox = self::proximo();
        return ['ok' => true, 'hoy' => $hoy, 'reclamado_hoy' => $hecho, 'dia' => $dia, 'dias' => self::DIAS,
            'ciclo' => (int) $f['ciclo'] - ($cicloLleno ? 1 : 0), 'total' => (int) $f['total'], 'racha' => (int) $f['racha'],
            'ultimo_dia' => $f['ultimo_dia'], 'vip_nivel' => $vip, 'vip_doble' => $vip >= self::VIP_DOBLE, 'vip_doble_desde' => self::VIP_DOBLE,
            'premios' => $premios, 'proximo' => Db::iso($prox), 'quedan_seg' => max(0, $prox - self::ahora())];
    }

    /** POST /api/diario/reclamar: reclama el premio de hoy (una vez por día de Ecuador). */
    public static function reclamar(int $jugador): array
    {
        self::preparar();
        Cuentas::exigirActiva($jugador);
        $vip = self::vipNivel($jugador);
        $conSede = self::conSede();
        $r = Db::tx(function () use ($jugador, $vip, $conSede): array {
            $f = self::fila($jugador);
            $hoy = self::dia();
            $t = self::ahora();
            Fallo::si($f['ultimo_dia'] !== null && (string) $f['ultimo_dia'] >= $hoy, 'Ya reclamaste el premio de hoy. Vuelve mañana.', 409, ['codigo' => 'ya_reclamado']);
            $paso = (int) $f['paso'] + 1;
            $ciclo = (int) $f['ciclo'];
            $p = self::premio($paso, $vip, $conSede);
            $ok = Db::q('INSERT OR IGNORE INTO diario_reclamos (jugador_id, dia, ciclo, paso, dinero, creditos, vip, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$jugador, $hoy, $ciclo, $paso, $p['dinero'], $p['creditos'], $vip, $t])->rowCount();
            Fallo::si($ok !== 1, 'Ya reclamaste el premio de hoy. Vuelve mañana.', 409, ['codigo' => 'ya_reclamado']);
            $racha = $f['ultimo_dia'] === self::ayer($hoy) ? (int) $f['racha'] + 1 : 1;
            $nuevoPaso = $paso >= self::DIAS ? 0 : $paso;
            $nuevoCiclo = $paso >= self::DIAS ? $ciclo + 1 : $ciclo;
            Db::q('INSERT INTO diario_jugador (jugador_id, paso, ciclo, total, racha, ultimo_dia, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (jugador_id) DO UPDATE SET paso = excluded.paso, ciclo = excluded.ciclo, total = excluded.total, racha = excluded.racha,
                   ultimo_dia = excluded.ultimo_dia, actualizado = excluded.actualizado',
                [$jugador, $nuevoPaso, $nuevoCiclo, (int) $f['total'] + 1, $racha, $hoy, $t, $t]);
            $origen = 'diario:' . $hoy;
            $entregas = [];
            if ($p['dinero'] > 0) $entregas[] = Monedero::entregar($jugador, 'dinero', '-', $p['dinero'], $origen);
            foreach ((array) $p['consumibles'] as $k => $n) if ($n > 0) $entregas[] = Monedero::entregar($jugador, 'consumible', (string) $k, (int) $n, $origen);
            foreach ((array) $p['materiales'] as $k => $n) if ($n > 0) $entregas[] = Monedero::entregar($jugador, 'materiales', (string) $k, (int) $n, $origen);
            $saldo = $p['creditos'] > 0 ? Monedero::mover($jugador, $p['creditos'], 'diario', $origen) : Monedero::saldo($jugador);
            return ['p' => $p, 'entregas' => $entregas, 'saldo' => $saldo];
        });
        return ['ok' => true, 'reclamado' => $r['p'], 'entregas' => $r['entregas'], 'creditos' => $r['saldo'], 'diario' => self::estado($jugador, $vip)];
    }
}
