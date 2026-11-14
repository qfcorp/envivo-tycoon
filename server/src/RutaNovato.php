<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * "Tus primeros 7 días" (ruta de novato, idea 4 de las propuestas del 13-nov-2026). Contrato en server/API.md.
 * El juego (js/novato.js) cuenta las tareas en la partida; aquí se guardan los premios de las cuentas y se valida lo importante.
 *
 *  - Solo cuentas NUEVAS: la ruta dura VENTANA días desde que empezó (inicio = jugadores.creado, o un poco antes si la partida
 *    empezó sin cuenta: POST /api/novato/empezar, como mucho ADELANTO_MAX antes de crear la cuenta). Una cuenta vieja no la ve.
 *  - Los días se desbloquean uno por día REAL (calendario de la zona del servidor, con 1 día de tolerancia por la zona del
 *    celular): el día N se puede reclamar desde inicio + (N-1) días. Los días anteriores se pueden reclamar después.
 *  - Premios FIJOS y a la vista (PREMIOS, FINAL: la MISMA tabla que js/novato.js; tests/test_novato.js lo revisa). El dinero y
 *    los repuestos los suma el juego en la partida; el servidor da los créditos y, al completar los 7 días, el premio grande:
 *    un camarógrafo internacional de habilidad 4 (entrega "personal_intl", la misma del personal internacional con créditos;
 *    no da ventaja en Duelos). Nada al azar y nada que se cambie por dinero.
 *  - Qué valida el servidor (los premios importantes): cuenta activa y nueva, la ruta encendida (ajuste novato_activa), el día
 *    ya desbloqueado por su reloj, una vez por cuenta (UNIQUE) y, para el premio grande, los 7 días reclamados EN EL SERVIDOR.
 *    NO ve las tareas de la partida local (igual que las misiones, INTEGRAR_MISIONES.md "Decisión"): quien haga trampa en su
 *    celular saca como mucho los créditos fijos de la tabla, un día por día real.
 *  - Oferta de novato (producto "oferta_novato", $0,99 una sola vez): solo durante las primeras OFERTA_HORAS horas desde el
 *    inicio. Compras::exigirComprable llama a exigirOferta (409 oferta_no_disponible). La entrega la hace Compras (tipo
 *    "oferta" con sus entregas fijas en Catalogo.php). No sale en la lista general de la tienda: solo en la hoja de la ruta.
 */
final class RutaNovato
{
    public const DIAS = 7;
    public const VENTANA = 14;                  // días (desde el inicio) en que la ruta se ve y se puede reclamar
    public const OFERTA_HORAS = 72;
    public const ADELANTO_MAX = 3 * 86400;      // la partida pudo empezar hasta 3 días antes de crear la cuenta
    public const PRODUCTO = 'oferta_novato';

    /** Premio de cada día (dinero y repuestos en la partida; créditos con cuenta). La MISMA tabla que js/novato.js. */
    public const PREMIOS = [
        1 => ['dinero' => 400, 'cons' => ['cable' => 2]],
        2 => ['dinero' => 600, 'cons' => ['battery' => 2]],
        3 => ['dinero' => 800, 'cons' => ['cable' => 2], 'creditos' => 10],
        4 => ['dinero' => 1000, 'cons' => ['cable' => 2, 'battery' => 2]],
        5 => ['dinero' => 1200, 'creditos' => 15],
        6 => ['dinero' => 1500, 'cons' => ['cable' => 3, 'battery' => 3]],
        7 => ['dinero' => 2000, 'creditos' => 25],
    ];
    /** Premio grande al reclamar los 7 días. personal = entrega personal_intl (rol, habilidad). */
    public const FINAL = ['dinero' => 5000, 'creditos' => 50, 'personal' => ['rol' => 'camarografo', 'habilidad' => 4]];

    private static ?int $reloj = null;
    private static bool $listo = false;
    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'novato_reclamos'")) Migraciones::aplicar('ruta_novato.sql');
        self::$listo = true;
    }

    public static function activa(): bool { return Ajustes::get('novato_activa', '1') !== '0'; }

    // ------------------------------------------------------------------ fechas
    private static function diaNum(int $t): int
    {
        $f = date('Y-m-d', $t);
        return intdiv((new \DateTimeImmutable($f . ' 12:00:00', new \DateTimeZone('UTC')))->getTimestamp(), 86400);
    }

    /** Inicio de la ruta de la cuenta (segundos) o null si la cuenta no existe. */
    public static function inicio(int $j): ?int
    {
        self::preparar();
        $i = Db::valor('SELECT inicio FROM novato_jugadores WHERE jugador_id = ?', [$j]);
        if ($i !== null && $i !== false) return (int) $i;
        $c = Db::valor('SELECT creado FROM jugadores WHERE id = ?', [$j]);
        return $c === null || $c === false ? null : (int) $c;
    }

    /** Día de la ruta HOY según el reloj del servidor (1 = el día que empezó). */
    public static function diaDe(int $inicio): int { return max(1, self::diaNum(self::ahora()) - self::diaNum($inicio) + 1); }

    /** ¿La cuenta todavía está dentro de su ruta (VENTANA días)? */
    public static function elegible(int $j): bool
    {
        $i = self::inicio($j);
        return $i !== null && self::activa() && self::diaDe($i) <= self::VENTANA;
    }

    /** Oferta de novato vigente para la cuenta: [disponible, hasta (segundos)]. */
    public static function oferta(int $j): array
    {
        $i = self::inicio($j);
        if ($i === null) return [false, 0];
        $hasta = $i + self::OFERTA_HORAS * 3600;
        $p = Catalogo::producto(self::PRODUCTO);
        $ok = self::activa() && self::ahora() < $hasta && $p !== null && !empty($p['activo']) && !Compras::yaComprado($j, self::PRODUCTO);
        return [$ok, $hasta];
    }

    /** Para Compras::exigirComprable: la oferta de novato solo en las primeras 72 horas de una cuenta nueva. */
    public static function exigirOferta(int $j, array $p): void
    {
        if (empty($p['oferta_novato'])) return;
        self::preparar();
        $i = self::inicio($j);
        $ok = $i !== null && self::activa() && self::ahora() < $i + self::OFERTA_HORAS * 3600;
        Fallo::si(!$ok, 'La oferta de novato solo dura las primeras 72 horas de una cuenta nueva.', 409, ['codigo' => 'oferta_no_disponible']);
    }

    // ------------------------------------------------------------------ estado
    /** GET /api/novato */
    public static function estado(int $j): array
    {
        self::preparar();
        $i = self::inicio($j);
        Fallo::si($i === null, 'Esa cuenta no existe.', 404, ['codigo' => 'jugador_no_existe']);
        $rec = array_map('strval', array_column(Db::todas('SELECT clave FROM novato_reclamos WHERE jugador_id = ? ORDER BY id', [$j]), 'clave'));
        [$of, $hasta] = self::oferta($j);
        $p = Catalogo::producto(self::PRODUCTO);
        return ['ok' => true, 'activa' => self::activa(), 'elegible' => self::elegible($j), 'inicio' => Db::iso($i), 'inicio_t' => $i, 'ahora_t' => self::ahora(),
            'dia' => self::diaDe($i), 'dias' => self::DIAS, 'ventana' => self::VENTANA, 'reclamados' => $rec, 'final' => in_array('final', $rec, true),
            'premios' => self::PREMIOS, 'premio_final' => self::FINAL,
            'oferta' => ['producto' => self::PRODUCTO, 'disponible' => $of, 'hasta' => Db::iso($hasta), 'hasta_t' => $hasta,
                'comprada' => Compras::yaComprado($j, self::PRODUCTO), 'precio' => $p ? (float) $p['precio'] : null, 'creditos' => $p ? (int) $p['creditos'] : 0,
                'entregas' => $p['entregas'] ?? []]];
    }

    /**
     * POST /api/novato/empezar {inicio}: la partida empezó sin cuenta antes de crear la cuenta. El inicio se adelanta como mucho
     * ADELANTO_MAX antes de jugadores.creado, solo una vez y solo si todavía no reclamó nada.
     */
    public static function empezar(int $j, mixed $inicioCliente): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        $creado = Db::valor('SELECT creado FROM jugadores WHERE id = ?', [$j]);
        Fallo::si($creado === null || $creado === false, 'Esa cuenta no existe.', 404, ['codigo' => 'jugador_no_existe']);
        $creado = (int) $creado;
        $ic = is_int($inicioCliente) || (is_string($inicioCliente) && ctype_digit($inicioCliente)) ? (int) $inicioCliente : 0;
        Db::tx(function () use ($j, $creado, $ic): void {
            if (Db::valor('SELECT 1 FROM novato_jugadores WHERE jugador_id = ?', [$j])) return;
            if (Db::valor('SELECT 1 FROM novato_reclamos WHERE jugador_id = ?', [$j])) return;
            if ($ic <= 0 || $ic >= $creado) return;
            $ini = max($creado - self::ADELANTO_MAX, $ic);
            Db::q('INSERT INTO novato_jugadores (jugador_id, inicio, creado) VALUES (?, ?, ?)', [$j, $ini, self::ahora()]);
        });
        return self::estado($j);
    }

    /**
     * POST /api/novato/reclamar {clave: "d1".."d7" | "final", ya_local?: bool}. Da los créditos del día y, con "final", el
     * camarógrafo internacional (si ya_local, el juego ya lo dio sin cuenta: solo los créditos). El dinero y los repuestos
     * los suma el juego (vienen en "premio"). Errores: novato_terminado, novato_clave, novato_bloqueado, novato_incompleto,
     * ya_reclamado, cuenta_*.
     */
    public static function reclamar(int $j, string $clave, bool $yaLocal = false): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        $i = self::inicio($j);
        Fallo::si($i === null, 'Esa cuenta no existe.', 404, ['codigo' => 'jugador_no_existe']);
        Fallo::si(!self::elegible($j), 'Tus primeros 7 días ya terminaron.', 409, ['codigo' => 'novato_terminado']);
        $n = preg_match('/^d([1-7])$/', $clave, $m) ? (int) $m[1] : ($clave === 'final' ? 0 : -1);
        Fallo::si($n < 0, 'Ese premio no existe.', 400, ['codigo' => 'novato_clave']);
        $dia = self::diaDe($i);
        if ($n > 0) Fallo::si($n > $dia + 1, 'El día ' . $n . ' se abre en ' . ($n - $dia) . ' días.', 409, ['codigo' => 'novato_bloqueado', 'dia' => $dia]);
        else Fallo::si(self::DIAS > $dia + 1, 'El premio grande se abre el día ' . self::DIAS . '.', 409, ['codigo' => 'novato_bloqueado', 'dia' => $dia]);
        $premio = $n > 0 ? self::PREMIOS[$n] : self::FINAL;
        $r = Db::tx(function () use ($j, $clave, $n, $premio, $yaLocal, $dia): array {
            $ya = Db::fila('SELECT creado FROM novato_reclamos WHERE jugador_id = ? AND clave = ?', [$j, $clave]);
            Fallo::si($ya !== null, 'Ya reclamaste ese premio.', 409, ['codigo' => 'ya_reclamado', 'reclamado' => $ya ? Db::iso((int) $ya['creado']) : null]);
            if ($n === 0) {
                $hechos = (int) Db::valor("SELECT COUNT(*) FROM novato_reclamos WHERE jugador_id = ? AND clave IN ('d1','d2','d3','d4','d5','d6','d7')", [$j]);
                Fallo::si($hechos < self::DIAS, 'Primero reclama los premios de los 7 días (' . $hechos . ' de ' . self::DIAS . ').', 409,
                    ['codigo' => 'novato_incompleto', 'hechos' => $hechos]);
            }
            $cred = (int) ($premio['creditos'] ?? 0);
            Db::q('INSERT INTO novato_reclamos (jugador_id, clave, creditos, ya_local, dia_real, creado) VALUES (?, ?, ?, ?, ?, ?)',
                [$j, $clave, $cred, $yaLocal ? 1 : 0, $dia, self::ahora()]);
            $ref = 'novato:' . $clave;
            if ($cred > 0) Monedero::mover($j, $cred, 'novato', $ref);
            $entregas = [];
            if ($n === 0) {
                if (!$yaLocal) {
                    $p = self::FINAL['personal'];
                    $entregas[] = Monedero::entregar($j, 'personal_intl', $p['rol'], (int) $p['habilidad'], $ref, 'semi_senior');
                }
                try {
                    Buzon::enviarPlantilla($j, 'novato_t', 'novato_c', ['habilidad' => self::FINAL['personal']['habilidad'], 'creditos' => self::FINAL['creditos']],
                        [], ['tipo' => 'evento', 'ref' => $ref]);
                } catch (\Throwable) {
                    // el aviso del buzón es opcional
                }
                Auditoria::anotar('juego', 'novato_final', 'Ruta de novato completa' . ($yaLocal ? ' (camarógrafo ya dado sin cuenta)' : ': camarógrafo internacional') . ' + ' . $cred . ' créditos', $j);
            }
            return ['creditos_dados' => $cred, 'entregas' => $entregas];
        });
        return ['ok' => true, 'clave' => $clave, 'premio' => $premio, 'ya_local' => $yaLocal] + $r + ['creditos' => Monedero::saldo($j), 'estado' => self::estado($j)];
    }

    // ------------------------------------------------------------------ Centro de Control y analítica
    /**
     * Avance por día para medir la retención (Centro de Control → Analítica):
     *  - instalaciones: de los eventos "novato_dia" de la analítica (con o sin cuenta), cuántas instalaciones empezaron la ruta
     *    entre $desde y $hasta, y de ellas cuántas completaron / reclamaron cada día y el premio grande.
     *  - cuentas: reclamos guardados en el servidor (novato_reclamos) de las cuentas que empezaron en ese período.
     */
    public static function resumen(string $desde, string $hasta): array
    {
        self::preparar();
        $o = ['instalaciones' => ['inicio' => 0, 'completo' => array_fill(1, self::DIAS, 0), 'reclamado' => array_fill(1, self::DIAS, 0), 'final' => 0],
              'cuentas' => ['reclamado' => array_fill(1, self::DIAS, 0), 'final' => 0, 'ofertas' => 0]];
        if (Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'eventos'")) {
            $ini = "SELECT DISTINCT instalacion FROM eventos WHERE nombre = 'novato_dia' AND json_extract(datos, '$.accion') = 'inicio' AND dia BETWEEN ? AND ?";
            $o['instalaciones']['inicio'] = (int) Db::valor("SELECT COUNT(*) FROM ($ini)", [$desde, $hasta]);
            foreach (Db::todas("SELECT json_extract(datos, '$.accion') AS a, CAST(json_extract(datos, '$.dia') AS INTEGER) AS d, COUNT(DISTINCT instalacion) AS n FROM eventos
                    WHERE nombre = 'novato_dia' AND instalacion IN ($ini) GROUP BY a, d", [$desde, $hasta]) as $f) {
                $d = (int) $f['d'];
                if ($f['a'] === 'final') $o['instalaciones']['final'] = max($o['instalaciones']['final'], (int) $f['n']);
                elseif (in_array($f['a'], ['completo', 'reclamado'], true) && $d >= 1 && $d <= self::DIAS) $o['instalaciones'][$f['a']][$d] = (int) $f['n'];
            }
        }
        $t0 = (new \DateTimeImmutable($desde . ' 00:00:00'))->getTimestamp();
        $t1 = (new \DateTimeImmutable($hasta . ' 00:00:00'))->modify('+1 day')->getTimestamp();
        $cuentas = 'SELECT id FROM jugadores WHERE creado >= ? AND creado < ?';
        foreach (Db::todas("SELECT clave, COUNT(*) AS n FROM novato_reclamos WHERE jugador_id IN ($cuentas) GROUP BY clave", [$t0, $t1]) as $f) {
            if ($f['clave'] === 'final') $o['cuentas']['final'] = (int) $f['n'];
            elseif (preg_match('/^d([1-7])$/', (string) $f['clave'], $m)) $o['cuentas']['reclamado'][(int) $m[1]] = (int) $f['n'];
        }
        $o['cuentas']['nuevas'] = (int) Db::valor("SELECT COUNT(*) FROM ($cuentas)", [$t0, $t1]);
        $o['cuentas']['ofertas'] = (int) Db::valor("SELECT COUNT(*) FROM compras WHERE producto = ? AND estado = 'pagado' AND jugador_id IN ($cuentas)", [self::PRODUCTO, $t0, $t1]);
        return $o;
    }
}
