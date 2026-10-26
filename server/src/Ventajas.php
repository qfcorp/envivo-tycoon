<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Techo de la ventaja pagada en competencia (server/MONETIZACION.md §1). Se calcula SOLO en el servidor.
 *   Ventajas::bono($jugador, 'copa' | 'duelo') → ['total' => 0..TOPE, 'partes' => [['clave' => 'sede'|'estrella', 'pts' => n]], 'tope' => n]
 * Partes: Sede oficial (SedeOficial::bonoCompetencia($j), 0..6) y Personal estrella (Estrellas::bonoCompetencia($j, $modo), 0..6).
 * Si una de esas clases todavía no existe (o falla), su parte vale 0: nunca rompe la Copa ni el Duelo.
 * Total máximo: ajuste `ventajas_tope` (12 por defecto, se cambia en el Centro de Control; de 0 a 24).
 * Liga, Festival y Desafío no llevan bono (son de esfuerzo): bono() devuelve total 0 para esos modos.
 */
final class Ventajas
{
    public const TOPE = 12;
    public const TOPE_PARTE = 6;
    public const TOPE_MAX = 24;
    public const MODOS = ['copa', 'duelo'];

    /** Clases de cada parte (se pueden cambiar en pruebas por clases de mentira). */
    public static array $fuentes = [
        'sede' => 'EnVivo\\SedeOficial',
        'estrella' => 'EnVivo\\Estrellas',
    ];

    /**
     * Equipos VIP dentro del techo (decisión de Dimitry, oct. 2026: los equipos VIP canjeados funcionan SIEMPRE, también sin
     * el Pase VIP). Lo que suben la calidad ya validada se cobra del bono de ventajas: cada equipo VIP que lleva el equipo
     * resta estos puntos del bono (4 cámaras VIP + switcher + satélite = 11 de 12). Medido con batalla.js
     * (server/tests/pruebas_vip.php): el equipo VIP completo sube ~19,5 % solo; con el bono recortado queda en ~21 %.
     */
    public const PUNTOS_VIP = ['vip_cam8k' => 2, 'vip_switcher' => 2, 'vip_satelital' => 1];

    /** Puntos de techo que usan los equipos VIP de una lista [{type}] o [{item}]. */
    public static function puntosVip(array $equip): int
    {
        $n = 0;
        foreach ($equip as $e) {
            $t = is_array($e) ? (string) ($e['type'] ?? $e['item'] ?? '') : '';
            $n += self::PUNTOS_VIP[$t] ?? 0;
        }
        return $n;
    }

    /** Bono de ventajas después de cobrar los equipos VIP que lleva el equipo (nunca menos de 0). */
    public static function recorteVip(int $bono, array $equip): int { return max(0, $bono - self::puntosVip($equip)); }

    public static function tope(): int
    {
        $v = trim(Ajustes::get('ventajas_tope', (string) self::TOPE));
        return preg_match('/^\d{1,3}$/', $v) ? min(self::TOPE_MAX, (int) $v) : self::TOPE;
    }

    /** Bono de ventajas para un modo de competencia. */
    public static function bono(int $jugador, string $modo): array
    {
        $tope = self::tope();
        if (!in_array($modo, self::MODOS, true)) return ['total' => 0, 'partes' => [], 'tope' => $tope];
        $partes = [];
        foreach (self::$fuentes as $clave => $clase) {
            $pts = self::parte($clave, $clase, $jugador, $modo);
            if ($pts > 0) $partes[] = ['clave' => $clave, 'pts' => $pts];
        }
        $suma = array_sum(array_column($partes, 'pts'));
        $total = min($tope, $suma);
        // Si se pasó del techo, se recorta desde la última parte (la suma de las partes siempre es igual al total).
        for ($i = count($partes) - 1, $sobra = $suma - $total; $i >= 0 && $sobra > 0; $i--) {
            $quita = min($sobra, $partes[$i]['pts']);
            $partes[$i]['pts'] -= $quita;
            $sobra -= $quita;
        }
        return ['total' => $total, 'partes' => array_values(array_filter($partes, fn($p) => $p['pts'] > 0)), 'tope' => $tope];
    }

    private static function parte(string $clave, string $clase, int $jugador, string $modo): int
    {
        try {
            if (!class_exists($clase) || !method_exists($clase, 'bonoCompetencia')) return 0;
            $v = $clave === 'estrella' ? $clase::bonoCompetencia($jugador, $modo) : $clase::bonoCompetencia($jugador);
            return max(0, min(self::TOPE_PARTE, (int) $v));
        } catch (\Throwable) {
            return 0;
        }
    }

    /**
     * Poder para sugerir rivales parecidos (Duelos): poder del equipo de duelo guardado (duelo_equipos.poder, 0 si no hay)
     * + 4 por cada punto de bono de duelo (un punto de calidad pesa como el personal en Duelos::resumen).
     * Devuelve ['total', 'equipo', 'bono'].
     */
    public static function poder(int $jugador): array
    {
        $equipo = 0;
        try {
            if (Migraciones::columnas('duelo_equipos') !== null) $equipo = (int) (Db::valor('SELECT poder FROM duelo_equipos WHERE jugador_id = ?', [$jugador]) ?? 0);
        } catch (\Throwable) {
            $equipo = 0;
        }
        $bono = self::bono($jugador, 'duelo')['total'];
        return ['total' => $equipo + 4 * $bono, 'equipo' => $equipo, 'bono' => $bono];
    }
}
