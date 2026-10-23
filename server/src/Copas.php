<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Copa de Servidores: los servidores de un universo pelean entre sí cada semana (contrato: server/COPAS.md §2;
 * conexión y reglas: server/INTEGRAR_COPAS.md).
 *
 * Ciclo semanal (America/Guayaquil):
 *   preparacion  lunes 00:00 → sábado 00:00   intentos en línea validados suman puntos de preparación; cada jugador registra su equipo
 *   batalla      sábado 00:00 → sábado 20:00   cruces a su hora (3 servidores: 10:00, 14:00, 18:00) con el motor determinista
 *   cerrada      sábado 20:00 → lunes 00:00     tabla final, premios (una sola vez), anuncio en el chat y en Discord
 * La fase guardada solo avanza; 'cerrada' la pone cerrar() después de jugar todos los cruces y entregar los premios.
 *
 * Puntos de un cruce = puntos de batalla (5 partidos: ganar 10, empatar 5) + bono de preparación normalizado
 * (min(15, 15 × prep / máximo del universo), redondeado). Ganar un cruce = 3 puntos de tabla, empatar = 1.
 * Tabla: puntos de tabla, luego diferencia de calidad total, luego preparación (y al final el id del servidor, fijo).
 *
 * Ganchos para pruebas: Copas::$reloj (segundos Unix), Copas::$motor (reemplaza a node server/eventos/batalla.js),
 * Copas::$validador (reemplaza a Repeticion::validar).
 */
final class Copas
{
    public const ZONA = 'America/Guayaquil';
    public const HORA_BATALLA_FIN = 20;          // sábado 20:00 termina la batalla
    public const HORAS_3 = [10, 14, 18];         // horas de los cruces con 3 rondas
    public const INTENTO_SEG = 1800;             // 30 min para jugar un intento después de pedirlo
    public const INTENTOS_DIA = 10;              // intentos de preparación por jugador por día
    public const INTENTOS_TOPE = 18;             // con Pase de Copa (+5) y VIP (máx. +3): nunca más de 18 (MONETIZACION.md §4)
    public const BONO_VENTAJAS_MAX = 12;         // campo "bono" por equipo en batalla.js: 0..12 (MONETIZACION.md §1)
    public const VALIDANDO_TRABADO = 120;
    public const PLANTEL = 5;                    // equipos por servidor en cada cruce
    public const HABILIDAD_CASA = 2;
    public const BONO_MAX = 15;
    public const PUNTOS_GANAR_PARTIDO = 10;
    public const PUNTOS_EMPATAR_PARTIDO = 5;
    public const TABLA_GANAR = 3;
    public const TABLA_EMPATAR = 1;
    public const GRUPO_MAX = 6;                  // hasta 6 servidores: todos contra todos; con 7 o más: grupos de 3 o 4
    public const MORAL = 80;
    public const ESTADO_EQUIPO = 90;
    public const CONTEXTO = ['fama' => 30, 'dinero' => 1000, 'stock' => ['cable' => 1, 'battery' => 1]];
    public const ESTRELLAS_EXTRA = [0, 0, 0, 5, 10, 20];   // puntos de preparación extra por estrellas (índice = estrellas)

    /** Torneos parodia (rotan por semana): mismas claves que server/eventos/batalla.js (B.TORNEOS). tipos = los 5 partidos. */
    public const TORNEOS = [
        'copa_planeta_balompie' => ['nombre' => 'Copa Planeta de Balompié', 'deporte' => 'futbol', 'cadena' => 'Red Mundovisión Planeta', 'tipos' => ['ligapro', 'ligapro', 'final', 'ligapro', 'final']],
        'copa_libertadores_sur' => ['nombre' => 'Copa de los Libertadores del Sur', 'deporte' => 'futbol', 'cadena' => 'Señal Cóndor Continental', 'tipos' => ['ligapro', 'ligapro', 'ligapro', 'ligapro', 'final']],
        'liga_estelar_clubes' => ['nombre' => 'Liga Estelar de Clubes', 'deporte' => 'futbol', 'cadena' => 'Canal Galaxia Deportiva', 'tipos' => ['ligapro', 'final', 'ligapro', 'final', 'final']],
        'mundial_aro_tablero' => ['nombre' => 'Mundial de Aro y Tablero', 'deporte' => 'basquet', 'cadena' => 'Aro y Red Televisión Global', 'tipos' => ['concierto', 'concierto', 'concierto', 'concierto', 'concierto']],
        'juegos_cinco_continentes' => ['nombre' => 'Juegos de los Cinco Continentes', 'deporte' => 'multideporte', 'cadena' => 'Antorcha Mundial TV', 'tipos' => ['concierto', 'boxeo', 'lucha_libre', 'ligapro', 'final']],
        'gran_premio_formula_veloz' => ['nombre' => 'Gran Premio Fórmula Veloz', 'deporte' => 'autos', 'cadena' => 'Bandera a Cuadros Network', 'tipos' => ['lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos']],
        'la_pelea_del_siglo' => ['nombre' => 'La Pelea del Siglo', 'deporte' => 'boxeo', 'cadena' => 'Cuadrilátero Mundial Pago por Ver', 'tipos' => ['lucha_libre', 'lucha_libre', 'boxeo', 'boxeo', 'boxeo']],
        'el_gran_tazon' => ['nombre' => 'El Gran Tazón', 'deporte' => 'futbol_americano', 'cadena' => 'Cadena Ovalada Intercontinental', 'tipos' => ['ligapro', 'final', 'concierto', 'final', 'final']],
    ];

    /** Materiales de sede (js/sede.js): cables, placas, paneles, credenciales, planos, chips. */
    public const PREMIOS = [
        'campeon' => ['dinero' => 3000, 'fama' => 3, 'trofeo' => true, 'materiales' => ['chips' => 2, 'paneles' => 4, 'placas' => 4, 'credenciales' => 2]],
        'top10' => ['dinero' => 2000, 'consumible' => ['cable' => 5, 'battery' => 3]],
        'subcampeon' => ['dinero' => 1000, 'fama' => 1, 'materiales' => ['placas' => 2, 'cables' => 4]],
        // participación: 300 + 100 por cada 150 puntos de aporte (máximo +1200), más 3 cables de sede
        'participacion' => ['dinero' => 300, 'materiales' => ['cables' => 3]],
    ];

    // ------------------------------------------------------------------ ganchos (pruebas)
    public static ?int $reloj = null;
    /** @var null|callable(array): array  Reemplaza al motor de batalla (node server/eventos/batalla.js). */
    public static $motor = null;
    /** @var null|callable(array): array  Reemplaza al validador de intentos. */
    public static $validador = null;
    private static bool $listo = false;

    public static function ahora(): int { return self::$reloj ?? time(); }
    private static function zona(): \DateTimeZone { return new \DateTimeZone(self::ZONA); }
    private static function json(mixed $v): string { return (string) json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

    public const TABLAS = ['copas', 'copa_servidores', 'copa_aportes', 'copa_equipos', 'copa_cruces', 'copa_premios', 'copa_intentos', 'copa_ajustes'];

    public static function preparar(): void
    {
        if (self::$listo) return;
        $ph = implode(',', array_fill(0, count(self::TABLAS), '?'));
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ($ph)", self::TABLAS);
        if ($n < count(self::TABLAS)) Migraciones::aplicar('copas.sql');
        self::$listo = true;
    }

    // ------------------------------------------------------------------ calendario
    /**
     * Semana que contiene $t: ['id' => 'YYYY-Www', 'inicio' => lunes 00:00, 'sabado' => sábado 00:00,
     * 'batalla_fin' => sábado 20:00, 'fin' => lunes siguiente 00:00].
     */
    public static function semana(?int $t = null): array
    {
        $d = (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(self::zona());
        $lunes = $d->setTime(0, 0)->modify('-' . ((int) $d->format('N') - 1) . ' days');
        $sab = $lunes->modify('+5 days');
        return ['id' => $lunes->format('o-\WW'), 'inicio' => $lunes->getTimestamp(), 'sabado' => $sab->getTimestamp(),
                'batalla_fin' => $sab->setTime(self::HORA_BATALLA_FIN, 0)->getTimestamp(), 'fin' => $lunes->modify('+7 days')->getTimestamp()];
    }

    /** Fase que corresponde por reloj: preparacion | batalla | cerrada. */
    public static function fase(?int $t = null): string
    {
        $t ??= self::ahora();
        $s = self::semana($t);
        return $t < $s['sabado'] ? 'preparacion' : ($t < $s['batalla_fin'] ? 'batalla' : 'cerrada');
    }

    /** Torneo de la semana (rota por número de semana desde el lunes 2026-01-05). */
    public static function torneoDe(int $inicioSemana): string
    {
        $base = (new \DateTimeImmutable('2026-01-05 00:00:00', self::zona()))->getTimestamp();
        $n = (int) round(($inicioSemana - $base) / 604800);
        $claves = array_keys(self::TORNEOS);
        return $claves[(($n % count($claves)) + count($claves)) % count($claves)];
    }

    /** Horas (Unix) de las rondas del sábado. 3 rondas: 10, 14 y 18 h. Otras: repartidas entre 08:00 y 19:00. */
    public static function horasRondas(int $rondas, int $sabado): array
    {
        if ($rondas <= 0) return [];
        if ($rondas <= 3) {
            $h = $rondas === 1 ? [14] : ($rondas === 2 ? [10, 14] : self::HORAS_3);
            return array_map(fn($x) => $sabado + $x * 3600, $h);
        }
        $paso = (int) (floor(11 * 60 / ($rondas - 1) / 15) * 15);   // minutos, múltiplo de 15
        $o = [];
        for ($i = 0; $i < $rondas; $i++) $o[] = $sabado + 8 * 3600 + $i * $paso * 60;
        return $o;
    }

    /** Todos contra todos (método del círculo): lista de rondas, cada una con pares [a, b]. */
    public static function todosContraTodos(array $ids): array
    {
        $ids = array_values($ids);
        if (count($ids) < 2) return [];
        if (count($ids) % 2) $ids[] = null;   // descanso
        $n = count($ids);
        $rondas = [];
        for ($r = 0; $r < $n - 1; $r++) {
            $pares = [];
            for ($i = 0; $i < $n / 2; $i++) {
                $a = $ids[$i]; $b = $ids[$n - 1 - $i];
                if ($a !== null && $b !== null) $pares[] = $r % 2 ? [$b, $a] : [$a, $b];
            }
            $rondas[] = $pares;
            $fijo = array_shift($ids);
            $ultimo = array_pop($ids);
            array_unshift($ids, $ultimo);
            array_unshift($ids, $fijo);
        }
        return $rondas;
    }

    /**
     * Calendario del sábado: [['ronda', 'a', 'b', 'hora', 'grupo'], ...].
     * - 2 a 6 servidores: un solo grupo, todos contra todos (3 servidores: 3 cruces a las 10, 14 y 18 h).
     * - 7 o más: grupos de 3 o 4 (reparto en serpiente por id), todos contra todos dentro de cada grupo, a la misma hora.
     *   La tabla es una sola (puntos, diferencia, preparación): campeón = el primero de la tabla general.
     */
    public static function calendario(array $servidores, int $sabado): array
    {
        sort($servidores);
        $n = count($servidores);
        if ($n < 2) return [];
        $grupos = [$servidores];
        if ($n > self::GRUPO_MAX) {
            $g = (int) ceil($n / 4);
            $grupos = array_fill(0, $g, []);
            foreach ($servidores as $i => $s) {
                $vuelta = intdiv($i, $g);
                $grupos[$vuelta % 2 ? $g - 1 - $i % $g : $i % $g][] = $s;
            }
        }
        $porGrupo = array_map([self::class, 'todosContraTodos'], $grupos);
        $rondas = max(array_map('count', $porGrupo));
        $horas = self::horasRondas($rondas, $sabado);
        $o = [];
        foreach ($porGrupo as $gi => $rs) {
            foreach ($rs as $r => $pares) foreach ($pares as [$a, $b]) $o[] = ['ronda' => $r + 1, 'a' => $a, 'b' => $b, 'hora' => $horas[$r], 'grupo' => $gi + 1];
        }
        usort($o, fn($x, $y) => [$x['ronda'], $x['grupo'], $x['a']] <=> [$y['ronda'], $y['grupo'], $y['a']]);
        return $o;
    }

    // ------------------------------------------------------------------ universos (Universos.php si está; si no, todos en el 1)
    private static function hayTabla(string $t): bool { return (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]); }

    /** Universos activos con sus servidores: [['id', 'nombre', 'servidores' => [ids]]]. */
    public static function universos(): array
    {
        try {
            if (class_exists(Universos::class) && method_exists(Universos::class, 'preparar')) Universos::preparar();   // crea los servidores iniciales
        } catch (\Throwable $e) {
            error_log('EN VIVO copa: Universos::preparar ' . mb_substr($e->getMessage(), 0, 200));
        }
        $cols = Migraciones::columnas('servidores') ?? [];
        $sinFusion = isset($cols['fusionado_en']) ? ' AND fusionado_en IS NULL' : '';
        if (isset($cols['universo_id']) && self::hayTabla('universos')) {
            $o = [];
            foreach (Db::todas('SELECT id, nombre FROM universos WHERE activo = 1 ORDER BY id') as $u) {
                $ids = array_map('intval', array_column(Db::todas('SELECT id FROM servidores WHERE universo_id = ?' . $sinFusion . ' ORDER BY id', [$u['id']]), 'id'));
                if ($ids) $o[] = ['id' => (int) $u['id'], 'nombre' => (string) $u['nombre'], 'servidores' => $ids];
            }
            if ($o) return $o;
        }
        $ids = array_map('intval', array_column(Db::todas('SELECT id FROM servidores WHERE 1 = 1' . $sinFusion . ' ORDER BY id'), 'id'));
        return [['id' => 1, 'nombre' => 'Universo Andino', 'servidores' => $ids]];
    }

    public static function universoDeServidor(int $sid): ?array
    {
        foreach (self::universos() as $u) if (in_array($sid, $u['servidores'], true)) return $u;
        return null;
    }

    private static function nombreServidor(int $sid): string
    {
        return (string) (Db::valor('SELECT nombre FROM servidores WHERE id = ?', [$sid]) ?? ('Servidor ' . $sid));
    }

    // ------------------------------------------------------------------ copa de la semana
    /** Copa del universo para la semana de $t (la crea con su calendario si falta) y avanza su fase por reloj. */
    public static function asegurarCopa(array $u, ?int $t = null): array
    {
        self::preparar();
        $t ??= self::ahora();
        $s = self::semana($t);
        $c = Db::fila('SELECT * FROM copas WHERE universo_id = ? AND semana = ?', [$u['id'], $s['id']]);
        if (!$c) {
            Db::tx(function () use ($u, $s): void {
                $k = self::torneoDe($s['inicio']);
                Db::q('INSERT OR IGNORE INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (?, ?, ?, ?, \'preparacion\', ?, ?, ?)',
                    [$u['id'], $s['id'], $k, self::TORNEOS[$k]['nombre'], $s['inicio'], $s['fin'], self::ahora()]);
            });
            $c = Db::fila('SELECT * FROM copas WHERE universo_id = ? AND semana = ?', [$u['id'], $s['id']]);
        }
        $f = self::fase($t);
        if ($c['fase'] === 'preparacion') self::sincronizarServidores((int) $c['id'], $u['servidores']);
        if ($c['fase'] === 'preparacion' && $f !== 'preparacion') {
            Db::q("UPDATE copas SET fase = 'batalla' WHERE id = ? AND fase = 'preparacion'", [$c['id']]);
            $c['fase'] = 'batalla';
        }
        return $c;
    }

    /** Durante la preparación la copa sigue a los servidores del universo (nuevos entran, fusionados salen) y rehace el calendario. */
    private static function sincronizarServidores(int $copa, array $ids): void
    {
        $hay = array_map('intval', array_column(Db::todas('SELECT servidor_id FROM copa_servidores WHERE copa_id = ? ORDER BY servidor_id', [$copa]), 'servidor_id'));
        $ids = array_values(array_unique(array_map('intval', $ids)));
        sort($ids);
        $nCruces = (int) Db::valor('SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ?', [$copa]);
        if ($hay === $ids && $nCruces === count(self::calendario($ids, 0))) return;
        if (Db::valor("SELECT 1 FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$copa])) return;
        Db::tx(function () use ($copa, $ids): void {
            $c = Db::fila('SELECT * FROM copas WHERE id = ?', [$copa]);
            foreach ($ids as $sid) Db::q('INSERT OR IGNORE INTO copa_servidores (copa_id, servidor_id) VALUES (?, ?)', [$copa, $sid]);
            if ($ids) Db::q('DELETE FROM copa_servidores WHERE copa_id = ? AND servidor_id NOT IN (' . implode(',', $ids) . ')', [$copa]);
            Db::q("DELETE FROM copa_cruces WHERE copa_id = ? AND estado = 'pendiente'", [$copa]);
            foreach (self::calendario($ids, self::semana((int) $c['inicio'])['sabado']) as $x) {
                Db::q("INSERT INTO copa_cruces (copa_id, ronda, servidor_a, servidor_b, hora, estado, detalle_json) VALUES (?, ?, ?, ?, ?, 'pendiente', ?)",
                    [$copa, $x['ronda'], $x['a'], $x['b'], $x['hora'], self::json(['semilla' => random_int(1, 2147483646), 'grupo' => $x['grupo']])]);
            }
            self::recalcularPrep($copa);
        });
    }

    /** Copa actual del servidor del jugador: [copa, universo, servidor_id]. */
    private static function copaDelJugador(int $j): array
    {
        $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
        Fallo::si($sid < 1, 'Tu productora todavía no tiene servidor.', 409, ['codigo' => 'sin_servidor']);
        $u = self::universoDeServidor($sid);
        Fallo::si($u === null, 'Tu servidor no participa en la Copa de Servidores.', 409, ['codigo' => 'sin_universo']);
        return [self::asegurarCopa($u), $u, $sid];
    }

    private static function cuentaActiva(int $j): void
    {
        $cols = Migraciones::columnas('jugadores') ?? [];
        if (!isset($cols['estado'])) return;
        $e = (string) Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$j]);
        Fallo::si($e !== '' && $e !== 'activo', 'Tu cuenta no puede participar en eventos en línea ahora mismo.', 403, ['codigo' => 'cuenta_' . $e]);
    }

    // ------------------------------------------------------------------ equipo de copa
    /**
     * "Poder" para ordenar el plantel (los 5 mejores van a la batalla): el de server/eventos/batalla.js ({accion: 'poder'})
     * si está el motor de verdad; si no (o en pruebas con Copas::$motor), una cuenta parecida en PHP.
     */
    public static function poder(array $eq): int
    {
        if (self::$motor === null) {
            $r = self::batallaNode(['accion' => 'poder', 'equipo' => $eq], 5);
            if (is_array($r) && !empty($r['ok']) && is_int($r['poder'] ?? null)) return $r['poder'];
        }
        return self::poderPhp($eq);
    }

    public static function poderPhp(array $eq): int
    {
        $p = 0;
        foreach ($eq['staff'] as $s) $p += 8 * (int) $s['skill'];
        $roles = count(array_unique(array_column($eq['staff'], 'role')));
        foreach ($eq['equip'] as $x) {
            $c = CatalogoJuego::EQUIPOS[$x['type']] ?? null;
            $p += $c === null ? 12 : (($c['cat'] ?? '') === 'cam' ? 5 + intdiv((int) $c['fama'], 5) : 3);
        }
        return $p + 3 * $roles;
    }

    /** POST /api/copa/equipo {staff, equip}: revisado como en el festival/duelos (fama pública, inventario del servidor, VIP). */
    public static function registrarEquipo(int $j, array $in): array
    {
        self::preparar();
        self::cuentaActiva($j);
        [$c, , $sid] = self::copaDelJugador($j);
        Fallo::si($c['fase'] !== 'preparacion', 'El registro de equipos cerró: la copa ya está en ' . ($c['fase'] === 'batalla' ? 'batalla' : 'su cierre') . '.', 409, ['codigo' => 'fase']);
        $eq = Festival::revisarEquipo($j, ['staff' => $in['staff'] ?? null, 'equip' => $in['equip'] ?? null], Monedero::vipActivo($j));
        $poder = self::poder(class_exists(Estrellas::class) ? Estrellas::aplicarAEquipo($j, $eq, 'copa') : $eq);   // con su estrella (se guarda sin ella)
        Db::q('INSERT INTO copa_equipos (copa_id, jugador_id, servidor_id, equipo_json, poder, registrado) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (copa_id, jugador_id) DO UPDATE SET servidor_id = excluded.servidor_id, equipo_json = excluded.equipo_json, poder = excluded.poder, registrado = excluded.registrado',
            [$c['id'], $j, $sid, self::json($eq), $poder, self::ahora()]);
        if (class_exists(Pase::class)) Pase::sumarXp($j, Pase::XP['copa_equipo'], 'copa_equipo', 'copa:' . $c['id']);   // INTEGRAR_PASE.md §5 (una vez por copa)
        return ['ok' => true, 'equipo' => $eq + ['poder' => $poder], 'copa' => self::estado($j)];
    }

    /**
     * Plantel de un servidor: hasta 5 equipos registrados (los de más poder) de jugadores que siguen en el servidor y con
     * la cuenta activa. Si son menos de 5, el motor completa con el "equipo de la casa": nunca se pierde por no presentarse.
     */
    public static function plantel(int $copa, int $sid): array
    {
        $cols = Migraciones::columnas('jugadores') ?? [];
        $activa = isset($cols['estado']) ? " AND (j.estado IS NULL OR j.estado = 'activo')" : '';
        $filas = Db::todas('SELECT e.*, j.alias, j.nombre FROM copa_equipos e JOIN jugadores j ON j.id = e.jugador_id
                            WHERE e.copa_id = ? AND e.servidor_id = ? AND j.servidor_id = ?' . $activa . ' ORDER BY e.poder DESC, e.registrado, e.jugador_id LIMIT ' . self::PLANTEL,
            [$copa, $sid, $sid]);
        $o = [];
        foreach ($filas as $f) {
            $eq = json_decode((string) $f['equipo_json'], true);
            $o[] = ['jugador_id' => (int) $f['jugador_id'], 'nombre' => Social::nombrePublico($f['alias'], $f['nombre']), 'casa' => false, 'poder' => (int) $f['poder'],
                    'vip' => Monedero::vipActivo((int) $f['jugador_id']), 'staff' => $eq['staff'], 'equip' => $eq['equip']];
        }
        return $o;   // los que faltan los completa el motor con su "equipo de la casa" (habilidad 2, B.equipoCasa)
    }

    // ------------------------------------------------------------------ contratos
    /** Números al azar repetibles (0 <= x < 1) a partir de un texto. */
    private static function azar(string $semilla): \Closure
    {
        $i = 0;
        return function () use ($semilla, &$i): float { return hexdec(substr(hash('sha256', $semilla . '#' . $i++), 0, 13)) / 4503599627370496; };
    }

    /** Contrato de un tipo de evento para la copa. $r: función 0..1 (azar repetible para la batalla; random_int para los intentos). */
    private static function contrato(string $torneo, string $tipo, callable $r): array
    {
        $T = CatalogoJuego::EVENTOS[$tipo];
        $cl = $T['clientes'];
        $lo = (int) $T['cams'][0]; $hi = min(6, (int) $T['cams'][1]);
        return [
            'type' => $tipo, 'client' => mb_substr(self::TORNEOS[$torneo]['nombre'] . ' · ' . $cl[(int) floor($r() * count($cl)) % count($cl)], 0, 80),
            'cams' => min($hi, $lo + (int) floor($r() * ($hi - $lo + 1))), 'audio' => (bool) $T['audio'], 'stream' => true,
            'outdoor' => $r() < (float) $T['outdoor'], 'diff' => min(5, (int) $T['diff']), 'pay' => (int) $T['pay'][1],
            'rival' => false, 'copa' => true, 'cadena' => self::TORNEOS[$torneo]['cadena'],
        ];
    }

    /** Los 5 contratos de un cruce (mismos para los dos lados): salen de la semilla del cruce. */
    public static function contratosCruce(string $torneo, int $semilla): array
    {
        $r = self::azar('copa|' . $torneo . '|' . $semilla);
        $tipos = self::TORNEOS[$torneo]['tipos'];
        $o = [];
        for ($n = 0; $n < self::PLANTEL; $n++) $o[] = self::contrato($torneo, $tipos[$n % count($tipos)], $r) + ['partido' => $n + 1];
        return $o;
    }

    // ------------------------------------------------------------------ batalla
    /**
     * Bono de preparación MIXTO (simulación tools/sim_copas.js, docs/COPA_DE_SERVIDORES.md "Para Dimitry"):
     * round(min(15, 15 × (½ · prep / máx_prep + ½ · prom / máx_prom))), con prom = prep / jugadores activos (7 días).
     * Premia el tamaño del servidor Y lo activo que es cada jugador (un servidor chico muy activo puede llegar a 15).
     */
    public static function bono(int $prep, int $maxPrep, float $prom = 0.0, float $maxProm = 0.0): int
    {
        $a = $maxPrep > 0 ? max(0, $prep) / $maxPrep : 0.0;
        $b = $maxProm > 0 ? max(0.0, $prom) / $maxProm : 0.0;
        return (int) round(min(self::BONO_MAX, self::BONO_MAX * (0.5 * $a + 0.5 * $b)));
    }

    /** Jugadores activos del servidor en 7 días (Universos::activos; sin Universos: los que aportaron a esta copa). Mínimo 1. */
    public static function activosServidor(int $sid, int $copa): int
    {
        try {
            if (class_exists(Universos::class) && method_exists(Universos::class, 'activos') && self::hayTabla('actividad_diaria')) return max(1, (int) Universos::activos($sid, 7));
        } catch (\Throwable $e) {
            error_log('EN VIVO copa: Universos::activos ' . mb_substr($e->getMessage(), 0, 200));
        }
        return max(1, (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM copa_aportes WHERE copa_id = ? AND servidor_id = ?', [$copa, $sid]));
    }

    /**
     * Bono de cada servidor de la copa: [servidor_id => ['bono', 'prep', 'activos', 'prom']]. Con $congelar (al jugar el
     * primer cruce) se guarda en copa_ajustes ('bonos:<copa>') y ya no cambia en el sábado (ni al rejugar un cruce).
     */
    public static function bonos(int $copa, bool $congelar = false): array
    {
        $g = Db::valor('SELECT valor FROM copa_ajustes WHERE clave = ?', ['bonos:' . $copa]);
        if ($g !== null) return json_decode((string) $g, true) ?: [];
        $o = [];
        foreach (Db::todas('SELECT servidor_id, puntos_prep FROM copa_servidores WHERE copa_id = ?', [$copa]) as $s) {
            $sid = (int) $s['servidor_id']; $act = self::activosServidor($sid, $copa);
            $o[$sid] = ['prep' => (int) $s['puntos_prep'], 'activos' => $act, 'prom' => round((int) $s['puntos_prep'] / $act, 3)];
        }
        $maxPrep = $o ? max(array_column($o, 'prep')) : 0;
        $maxProm = $o ? (float) max(array_column($o, 'prom')) : 0.0;
        foreach ($o as &$x) $x['bono'] = self::bono($x['prep'], $maxPrep, (float) $x['prom'], $maxProm);
        unset($x);
        if ($congelar) Db::q('INSERT OR IGNORE INTO copa_ajustes (clave, valor, actualizado) VALUES (?, ?, ?)', ['bonos:' . $copa, self::json($o), time()]);
        return $o;
    }

    /**
     * "Equipo de la casa" de la semana: el equipo MEDIANO por poder del universo (de los equipos registrados por jugadores
     * que aportaron a esta copa). null si no hay ninguno: entonces batalla.js usa su casa por defecto (habilidad 2).
     */
    public static function equipoCasa(int $copa): ?array
    {
        $f = Db::todas('SELECT e.equipo_json, e.poder FROM copa_equipos e WHERE e.copa_id = ?
                          AND EXISTS (SELECT 1 FROM copa_aportes a WHERE a.copa_id = e.copa_id AND a.jugador_id = e.jugador_id)
                        ORDER BY e.poder, e.jugador_id', [$copa]);
        if (!$f) return null;
        $m = $f[intdiv(count($f) - 1, 2)];
        $eq = json_decode((string) $m['equipo_json'], true);
        return ['jugador_id' => null, 'nombre' => 'Equipo de la casa', 'casa' => true, 'poder' => (int) $m['poder'], 'vip' => false, 'staff' => $eq['staff'], 'equip' => $eq['equip']];
    }

    /** node server/eventos/batalla.js < json. Devuelve la respuesta o null si no se pudo. */
    public static function batallaNode(array $peticion, ?int $seg = null): ?array
    {
        $script = dirname(__DIR__) . '/eventos/batalla.js';
        if (!is_file($script) || !function_exists('proc_open')) return null;
        $proc = @proc_open([Repeticion::node(), $script], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
        if (!is_resource($proc)) return null;
        fwrite($tubos[0], self::json($peticion));
        fclose($tubos[0]);
        stream_set_blocking($tubos[1], false);
        $salida = '';
        $fin = microtime(true) + ($seg ?? (float) Config::get('COPA_MOTOR_SEG', '20'));
        while (microtime(true) < $fin) {
            $leer = [$tubos[1]]; $nada = null;
            if (@stream_select($leer, $nada, $nada, 0, 100000)) { $t = fread($tubos[1], 65536); if ($t !== false) $salida .= $t; }
            if (feof($tubos[1])) break;
        }
        $listo = feof($tubos[1]);
        $err = (string) stream_get_contents($tubos[2]);
        fclose($tubos[1]); fclose($tubos[2]);
        if (!$listo) { proc_terminate($proc, 9); proc_close($proc); error_log('EN VIVO copa: batalla.js tardó demasiado'); return null; }
        proc_close($proc);
        $r = json_decode(trim($salida), true);
        if (!is_array($r)) { error_log('EN VIVO copa: respuesta inválida de batalla.js: ' . mb_substr($err, 0, 300)); return null; }
        return $r;
    }

    private static function llamarMotor(array $peticion): ?array
    {
        try {
            $r = self::$motor !== null ? (self::$motor)($peticion) : self::batallaNode($peticion);
        } catch (\Throwable $e) {
            error_log('EN VIVO copa: motor ' . mb_substr($e->getMessage(), 0, 200));
            return null;
        }
        if (!is_array($r) || ($r['ok'] ?? true) === false || !is_array($r['partidos'] ?? null) || count($r['partidos']) !== self::PLANTEL) {
            if (is_array($r) && isset($r['motivo'])) error_log('EN VIVO copa: el motor no jugó el cruce: ' . mb_substr((string) json_encode($r, JSON_UNESCAPED_UNICODE), 0, 300));
            return null;
        }
        foreach ($r['partidos'] as $p) if (!is_array($p) || !is_numeric($p['calidad_a'] ?? null) || !is_numeric($p['calidad_b'] ?? null)) return null;
        return $r;
    }

    /** Petición al motor (pública para pruebas y para la simulación). */
    public static function peticionCruce(array $copa, array $cruce): array
    {
        $d = json_decode((string) $cruce['detalle_json'], true) ?: [];
        $semilla = (int) ($d['semilla'] ?? crc32('copa|' . $cruce['id']));
        $k = (string) $copa['torneo_key'];
        $casa = self::equipoCasa((int) $copa['id']);
        $plan = function (int $sid) use ($copa, $casa, $cruce): array {
            $p = self::plantel((int) $copa['id'], $sid);
            if (class_exists(Estrellas::class)) {   // personal estrella (server/INTEGRAR_ESTRELLAS.md)
                $ref = 'copa_cruce:' . $cruce['id'];
                foreach ($p as &$e) {
                    $e['staff'] = Estrellas::aplicarAEquipo((int) $e['jugador_id'], ['staff' => $e['staff'], 'equip' => $e['equip']], 'copa', $ref)['staff'];
                    $e['estrellas'] = Estrellas::activas((int) $e['jugador_id'], 'copa', $ref);
                }
                unset($e);
            }
            // Bono de ventajas pagadas (MONETIZACION.md §1, techo +12): batalla.js lo suma a la calidad del partido de ese equipo
            foreach ($p as &$e) $e['bono'] = self::bonoVentajas((int) $e['jugador_id'], 'copa_cruce:' . $cruce['id']);
            unset($e);
            if ($casa !== null) while (count($p) < self::PLANTEL) $p[] = $casa;   // copias del equipo mediano en los lugares vacíos
            return $p;
        };
        return ['seed' => $semilla, 'torneo' => $k, 'contratos' => self::contratosCruce($k, $semilla), 'contexto' => self::CONTEXTO,
                'planA' => $plan((int) $cruce['servidor_a']), 'planB' => $plan((int) $cruce['servidor_b'])];
    }

    /** Juega un cruce pendiente (una sola vez). false si el motor no respondió (se reintenta en la próxima tarea). */
    public static function jugarCruce(int $id): bool
    {
        $x = Db::fila('SELECT * FROM copa_cruces WHERE id = ?', [$id]);
        if (!$x || $x['estado'] !== 'pendiente') return false;
        $copa = Db::fila('SELECT * FROM copas WHERE id = ?', [$x['copa_id']]);
        self::revalidar((int) $copa['id'], 200);   // lo pendiente del validador entra antes del primer cruce
        $pet = self::peticionCruce($copa, $x);
        $r = self::llamarMotor($pet);
        if ($r === null) {
            if (self::$motor === null && !Db::valor("SELECT 1 FROM avisos WHERE tipo = 'copa_motor' AND creado > ?", [time() - 3600])) Db::aviso('copa_motor', 'No se pudo jugar el cruce ' . $id . ' de la copa ' . $copa['id'] . ' (server/eventos/batalla.js). Se reintenta en la próxima tarea.');
            return false;
        }
        return Db::tx(function () use ($x, $copa, $pet, $r): bool {
            if (Db::valor('SELECT estado FROM copa_cruces WHERE id = ?', [$x['id']]) !== 'pendiente') return false;
            $cid = (int) $copa['id'];
            $bonos = self::bonos($cid, true);
            $partidos = []; $batA = 0; $batB = 0; $totA = 0; $totB = 0;
            // Qué equipo jugó cada partido: orden_a/orden_b del motor (posición en el plantel enviado; null = la casa)
            $quien = function (array $plan, array $p, string $lado, int $i): array {
                $o = array_key_exists('orden_' . $lado, $p) || array_key_exists('casa_' . $lado, $p) ? ($p['orden_' . $lado] ?? null) : $i;
                if (!empty($p['casa_' . $lado]) || !is_int($o) || !isset($plan[$o]) || !empty($plan[$o]['casa'])) return ['Equipo de la casa', true];
                return [$plan[$o]['nombre'], false];
            };
            foreach (array_values($r['partidos']) as $i => $p) {
                $qa = max(0, min(100, (int) round((float) $p['calidad_a']))); $qb = max(0, min(100, (int) round((float) $p['calidad_b'])));
                $g = $qa > $qb ? 'a' : ($qb > $qa ? 'b' : 'empate');   // gana la mayor calidad (se calcula aquí, no se confía en el campo)
                $batA += $g === 'a' ? self::PUNTOS_GANAR_PARTIDO : ($g === 'empate' ? self::PUNTOS_EMPATAR_PARTIDO : 0);
                $batB += $g === 'b' ? self::PUNTOS_GANAR_PARTIDO : ($g === 'empate' ? self::PUNTOS_EMPATAR_PARTIDO : 0);
                $totA += $qa; $totB += $qb;
                $partidos[] = ['n' => $i + 1, 'tipo' => (string) ($p['tipo'] ?? $pet['contratos'][$i]['type']), 'calidad_a' => $qa, 'calidad_b' => $qb, 'ganador' => $g,
                    'equipo_a' => $quien($pet['planA'], $p, 'a', $i)[0], 'equipo_b' => $quien($pet['planB'], $p, 'b', $i)[0],
                    'casa_a' => $quien($pet['planA'], $p, 'a', $i)[1], 'casa_b' => $quien($pet['planB'], $p, 'b', $i)[1],
                    'incidentes_a' => is_array($p['incidentes_a'] ?? null) ? array_slice($p['incidentes_a'], 0, 20) : [], 'incidentes_b' => is_array($p['incidentes_b'] ?? null) ? array_slice($p['incidentes_b'], 0, 20) : []];
            }
            $bA = (int) ($bonos[(int) $x['servidor_a']]['bono'] ?? 0); $bB = (int) ($bonos[(int) $x['servidor_b']]['bono'] ?? 0);
            $d = json_decode((string) $x['detalle_json'], true) ?: [];
            $d += ['semilla' => $pet['seed']];
            $d['bono_a'] = $bA; $d['bono_b'] = $bB; $d['batalla_a'] = $batA; $d['batalla_b'] = $batB;
            $d['calidad_total_a'] = $totA; $d['calidad_total_b'] = $totB; $d['partidos'] = $partidos;
            $d['casa_poder'] = null;
            foreach (array_merge($pet['planA'], $pet['planB']) as $e) if (!empty($e['casa'])) $d['casa_poder'] = $e['poder'];
            $pl = fn(array $plan) => array_pad(array_map(fn($e) => ['jugador_id' => $e['jugador_id'], 'nombre' => $e['nombre'], 'casa' => !empty($e['casa']), 'poder' => $e['poder']], $plan),
                self::PLANTEL, ['jugador_id' => null, 'nombre' => 'Equipo de la casa', 'casa' => true, 'poder' => null]);
            $d['planteles'] = ['a' => $pl($pet['planA']), 'b' => $pl($pet['planB'])];
            if (isset($r['version_logica'])) $d['version_logica'] = mb_substr((string) $r['version_logica'], 0, 40);
            Db::q("UPDATE copa_cruces SET estado = 'jugado', puntos_a = ?, puntos_b = ?, detalle_json = ? WHERE id = ? AND estado = 'pendiente'",
                [$batA + $bA, $batB + $bB, self::json($d), $x['id']]);
            if (class_exists(Estrellas::class)) foreach (array_merge($pet['planA'], $pet['planB']) as $e) {   // 1 partido de su estrella
                if (empty($e['casa']) && !empty($e['jugador_id'])) Estrellas::consumir((int) $e['jugador_id'], 'copa', 'copa_cruce:' . $x['id']);
            }
            self::recalcularTabla($cid);
            return true;
        });
    }

    /** Puntos de preparación de cada servidor = suma de sus aportes. */
    private static function recalcularPrep(int $copa): void
    {
        Db::q('UPDATE copa_servidores SET puntos_prep = (SELECT COALESCE(SUM(a.puntos), 0) FROM copa_aportes a WHERE a.copa_id = copa_servidores.copa_id AND a.servidor_id = copa_servidores.servidor_id) WHERE copa_id = ?', [$copa]);
    }

    /** Rehace la tabla con los cruces jugados (idempotente) y ordena: puntos, diferencia de calidad, preparación, id. */
    public static function recalcularTabla(int $copa): void
    {
        $t = [];
        foreach (Db::todas('SELECT * FROM copa_servidores WHERE copa_id = ?', [$copa]) as $s) $t[(int) $s['servidor_id']] = ['pt' => 0, 'g' => 0, 'e' => 0, 'p' => 0, 'dif' => 0, 'prep' => (int) $s['puntos_prep']];
        foreach (Db::todas("SELECT * FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$copa]) as $x) {
            $a = (int) $x['servidor_a']; $b = (int) $x['servidor_b'];
            if (!isset($t[$a], $t[$b])) continue;
            $d = json_decode((string) $x['detalle_json'], true) ?: [];
            $dif = (int) ($d['calidad_total_a'] ?? 0) - (int) ($d['calidad_total_b'] ?? 0);
            $t[$a]['dif'] += $dif; $t[$b]['dif'] -= $dif;
            $pa = (int) $x['puntos_a']; $pb = (int) $x['puntos_b'];
            if ($pa > $pb) { $t[$a]['pt'] += self::TABLA_GANAR; $t[$a]['g']++; $t[$b]['p']++; }
            elseif ($pb > $pa) { $t[$b]['pt'] += self::TABLA_GANAR; $t[$b]['g']++; $t[$a]['p']++; }
            else { $t[$a]['pt'] += self::TABLA_EMPATAR; $t[$b]['pt'] += self::TABLA_EMPATAR; $t[$a]['e']++; $t[$b]['e']++; }
        }
        $orden = array_keys($t);
        usort($orden, fn($x, $y) => [$t[$y]['pt'], $t[$y]['dif'], $t[$y]['prep'], $x] <=> [$t[$x]['pt'], $t[$x]['dif'], $t[$x]['prep'], $y]);
        foreach ($orden as $i => $sid) {
            Db::q('UPDATE copa_servidores SET puntos_tabla = ?, ganados = ?, empatados = ?, perdidos = ?, dif_calidad = ?, posicion = ? WHERE copa_id = ? AND servidor_id = ?',
                [$t[$sid]['pt'], $t[$sid]['g'], $t[$sid]['e'], $t[$sid]['p'], $t[$sid]['dif'], $i + 1, $copa, $sid]);
        }
    }

    // ------------------------------------------------------------------ cierre y premios
    private static function sedeDisponible(): bool { return is_file(dirname(__DIR__, 2) . '/js/sede.js'); }

    /** Clave y nombre del trofeo de copa (cosmético; entrega tipo "trofeo"). */
    public static function trofeo(array $copa): array
    {
        return ['clave' => 'copa_' . $copa['torneo_key'] . '_' . $copa['semana'], 'nombre' => 'Trofeo ' . $copa['nombre'] . ' ' . $copa['semana']];
    }

    /** Entregas de un premio (lo que el juego aplica; los tipos que no conoce los ignora). */
    public static function entregasPremio(string $clave, array $copa, int $aporte): array
    {
        $p = self::PREMIOS[$clave];
        $o = [];
        $dinero = (int) $p['dinero'] + ($clave === 'participacion' ? min(1200, 100 * intdiv(max(0, $aporte), 150)) : 0);
        if ($dinero > 0) $o[] = ['tipo' => 'dinero', 'item' => '-', 'cantidad' => $dinero];
        if (!empty($p['fama'])) $o[] = ['tipo' => 'fama', 'item' => '-', 'cantidad' => (int) $p['fama']];
        foreach ($p['consumible'] ?? [] as $k => $n) $o[] = ['tipo' => 'consumible', 'item' => $k, 'cantidad' => $n];
        if (!empty($p['trofeo'])) $o[] = ['tipo' => 'trofeo', 'item' => self::trofeo($copa)['clave'], 'cantidad' => 1];
        if (self::sedeDisponible()) foreach ($p['materiales'] ?? [] as $k => $n) $o[] = ['tipo' => 'materiales', 'item' => $k, 'cantidad' => $n];
        return $o;
    }

    /** Da un premio una sola vez (copa_premios es la llave: INSERT OR IGNORE dentro de la misma transacción). */
    private static function premiar(array $copa, int $j, string $clave, int $aporte): bool
    {
        $n = Db::q('INSERT OR IGNORE INTO copa_premios (copa_id, jugador_id, clave, entregado) VALUES (?, ?, ?, ?)', [$copa['id'], $j, $clave, self::ahora()])->rowCount();
        if (!$n) return false;
        foreach (self::entregasPremio($clave, $copa, $aporte) as $e) Monedero::entregar($j, $e['tipo'], $e['item'], (int) $e['cantidad'], 'copa:' . $copa['id'] . ':' . $clave);
        if ($clave === 'campeon') {   // oferta del campeón del VIP (INTEGRAR_VIP.md §12; Ganchos nunca lanza ni deshace el premio)
            try { if (class_exists(Ganchos::class)) Ganchos::emitir('copa_ganada', ['jugador_id' => $j, 'copa_id' => (int) $copa['id']]); } catch (\Throwable) {}
        }
        return true;
    }

    /** Aportantes de un servidor en la copa (solo intentos validados), del mayor al menor. */
    public static function aportantes(int $copa, int $sid, int $limite = 1000): array
    {
        return Db::todas('SELECT a.jugador_id, SUM(a.puntos) AS puntos, MIN(a.creado) AS primero, j.alias, j.nombre,
                                 (SELECT s.siglas FROM asociacion_miembros m JOIN asociaciones s ON s.id = m.asociacion_id WHERE m.jugador_id = a.jugador_id) AS siglas
                          FROM copa_aportes a JOIN jugadores j ON j.id = a.jugador_id
                          WHERE a.copa_id = ? AND a.servidor_id = ? GROUP BY a.jugador_id HAVING SUM(a.puntos) > 0
                          ORDER BY puntos DESC, primero, a.jugador_id LIMIT ' . max(1, $limite), [$copa, $sid]);
    }

    /**
     * Cierra la copa si ya es sábado 20:00 (o pasó la semana) y todos los cruces se jugaron: tabla final, premios
     * (idempotente) y anuncio. Devuelve true si la cerró en esta llamada.
     */
    public static function cerrar(int $id, bool $forzar = false): bool
    {
        self::preparar();
        $copa = Db::fila('SELECT * FROM copas WHERE id = ?', [$id]);
        if (!$copa || $copa['fase'] === 'cerrada') return false;
        if (!$forzar && self::ahora() < self::semana((int) $copa['inicio'])['batalla_fin']) return false;
        if (Db::valor("SELECT 1 FROM copa_cruces WHERE copa_id = ? AND estado = 'pendiente'", [$id])) return false;
        $hecho = Db::tx(function () use ($id): ?array {
            $copa = Db::fila('SELECT * FROM copas WHERE id = ?', [$id]);
            if ($copa['fase'] === 'cerrada') return null;
            Db::q("UPDATE copa_intentos SET estado = 'vencido', motivo = COALESCE(motivo, 'cierre') WHERE copa_id = ? AND estado IN ('jugando', 'validando', 'pendiente')", [$id]);
            self::recalcularTabla($id);
            $tabla = Db::todas('SELECT * FROM copa_servidores WHERE copa_id = ? ORDER BY posicion', [$id]);
            $hayCopa = count($tabla) >= 2 && (int) Db::valor("SELECT COUNT(*) FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$id]) > 0;
            $campeon = $hayCopa ? (int) $tabla[0]['servidor_id'] : null;
            $sub = $hayCopa && count($tabla) >= 3 ? (int) $tabla[1]['servidor_id'] : null;
            $premiados = [];
            foreach ($tabla as $s) {
                $sid = (int) $s['servidor_id'];
                foreach (self::aportantes($id, $sid) as $i => $a) {
                    $j = (int) $a['jugador_id']; $pts = (int) $a['puntos'];
                    if ($sid === $campeon) {
                        self::premiar($copa, $j, 'campeon', $pts);
                        if ($i < 10) self::premiar($copa, $j, 'top10', $pts);
                    } else {
                        if ($sid === $sub) self::premiar($copa, $j, 'subcampeon', $pts);
                        self::premiar($copa, $j, 'participacion', $pts);
                    }
                    $premiados[] = [$j, $sid, $pts];
                    if (class_exists(Estrellas::class)) Estrellas::ganarFichas($j, 4, 'copa_cierre:' . $id);
                }
            }
            Db::q("UPDATE copas SET fase = 'cerrada' WHERE id = ?", [$id]);
            return ['copa' => $copa, 'tabla' => $tabla, 'campeon' => $campeon, 'premiados' => $premiados];
        });
        if ($hecho === null) return false;
        self::anunciar($hecho);
        return true;
    }

    private static function anunciar(array $h): void
    {
        $copa = $h['copa'];
        $nom = $h['campeon'] !== null ? self::nombreServidor($h['campeon']) : null;
        try {
            foreach ($h['tabla'] as $s) {
                $txt = $nom !== null
                    ? '🏆 ' . $copa['nombre'] . ': ¡' . $nom . ' es el campeón! Tu servidor terminó en el puesto ' . (int) $s['posicion'] . ' con ' . (int) $s['puntos_tabla'] . ' puntos.'
                    : '🏆 ' . $copa['nombre'] . ' terminó. Gracias por producir para tu servidor.';
                Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, creado) VALUES (?, NULL, ?, ?)', ['servidor:' . (int) $s['servidor_id'], mb_substr($txt, 0, 300), time()]);
            }
            foreach ($h['premiados'] as [$j, $sid, $pts]) {
                Chat::sistema($j, '🏆 ' . $copa['nombre'] . ': aportaste ' . $pts . ' puntos a tu servidor' . ($sid === $h['campeon'] ? ', ¡que salió campeón! Tu trofeo y tus premios' : '. Tus premios') . ' ya están en el juego.');
            }
        } catch (\Throwable $e) {
            error_log('EN VIVO copa: anuncio en el chat ' . mb_substr($e->getMessage(), 0, 200));
        }
        try {
            if ($nom !== null && class_exists(Discord::class) && Config::get('DISCORD_WEBHOOK_EVENTOS') !== '') {
                $campos = [];
                foreach ($h['tabla'] as $s) $campos[(int) $s['posicion'] . '. ' . self::nombreServidor((int) $s['servidor_id'])] = (int) $s['puntos_tabla'] . ' pts · ' . (int) $s['ganados'] . 'G ' . (int) $s['empatados'] . 'E ' . (int) $s['perdidos'] . 'P';
                Discord::anunciar('eventos', ['embeds' => [Discord::embed('🏆 ' . $copa['nombre'] . ' · ' . $nom . ' campeón', 'Copa de Servidores, semana ' . $copa['semana'] . '.', $campos)]]);
            }
        } catch (\Throwable $e) {
            error_log('EN VIVO copa: anuncio en Discord ' . mb_substr($e->getMessage(), 0, 200));
        }
    }

    /**
     * Tarea programada (server/bin/copas.php, cada 10 min). Idempotente: crea la copa de la semana de cada universo,
     * avanza las fases, revalida intentos pendientes, juega los cruces que ya tienen hora y cierra (premios una vez).
     * También termina copas de semanas anteriores que quedaron abiertas (por ejemplo, si el motor estuvo caído).
     */
    public static function tareaProgramada(): array
    {
        self::preparar();
        $o = ['copas' => 0, 'revalidados' => 0, 'cruces' => 0, 'fallidos' => 0, 'cerradas' => 0];
        foreach (self::universos() as $u) { self::asegurarCopa($u); $o['copas']++; }
        self::vencer();
        $o['revalidados'] = self::revalidar(null, 100);
        $t = self::ahora();
        foreach (Db::todas("SELECT * FROM copas WHERE fase <> 'cerrada' ORDER BY id") as $c) {
            if ($c['fase'] === 'preparacion' && $t >= self::semana((int) $c['inicio'])['sabado']) Db::q("UPDATE copas SET fase = 'batalla' WHERE id = ? AND fase = 'preparacion'", [$c['id']]);
            foreach (Db::todas("SELECT id FROM copa_cruces WHERE copa_id = ? AND estado = 'pendiente' AND hora <= ? ORDER BY hora, id", [$c['id'], $t]) as $x) {
                if (self::jugarCruce((int) $x['id'])) $o['cruces']++; else $o['fallidos']++;
            }
            if (self::cerrar((int) $c['id'])) $o['cerradas']++;
        }
        return $o;
    }

    // ------------------------------------------------------------------ Centro de Control (auditado)
    public const FASES = ['preparacion' => 0, 'batalla' => 1, 'cerrada' => 2];

    /**
     * Fuerza la fase de una copa (solo hacia adelante: preparacion → batalla → cerrada). A 'cerrada': juega ya todos los
     * cruces pendientes (sin esperar su hora), cierra y entrega los premios (una sola vez). Queda en la auditoría.
     */
    public static function forzarFase(int $copa, string $fase, string $quien): void
    {
        self::preparar();
        $c = Db::fila('SELECT * FROM copas WHERE id = ?', [$copa]);
        Fallo::si(!$c, 'Esa copa no existe.', 404, ['codigo' => 'no_existe']);
        Fallo::si(!isset(self::FASES[$fase]), 'Fase desconocida.', 422, ['codigo' => 'fase']);
        Fallo::si(self::FASES[$fase] <= self::FASES[$c['fase']], 'La fase de la copa solo avanza (está en ' . $c['fase'] . ').', 409, ['codigo' => 'fase']);
        Db::q("UPDATE copas SET fase = 'batalla' WHERE id = ? AND fase = 'preparacion'", [$copa]);
        $jugados = 0;
        if ($fase === 'cerrada') {
            foreach (Db::todas("SELECT id FROM copa_cruces WHERE copa_id = ? AND estado = 'pendiente' ORDER BY hora, id", [$copa]) as $x) {
                if (self::jugarCruce((int) $x['id'])) $jugados++;
            }
            if (Db::valor("SELECT 1 FROM copa_cruces WHERE copa_id = ? AND estado = 'pendiente'", [$copa])) {
                Auditoria::anotar($quien, 'copa_fase', 'Copa N° ' . $copa . ': ' . $c['fase'] . ' → batalla (pedida: cerrada; el motor no jugó todos los cruces; ' . $jugados . ' jugados)');
                throw new Fallo('El motor de batalla no respondió: la copa quedó en batalla con cruces pendientes (' . $jugados . ' jugados). Intenta de nuevo en unos minutos.', 503, ['codigo' => 'motor_caido']);
            }
            self::cerrar($copa, true);
        }
        Auditoria::anotar($quien, 'copa_fase', 'Copa N° ' . $copa . ' (' . $c['nombre'] . '): ' . $c['fase'] . ' → ' . $fase . ($jugados ? ' (' . $jugados . ' cruces jugados antes de cerrar)' : ''));
    }

    /**
     * Vuelve a jugar un cruce (misma semilla, mismos planteles) y recalcula la tabla. No se puede con la copa cerrada.
     * Devuelve {puntos_a, puntos_b, estado}; si el motor no responde, el cruce queda pendiente para la tarea programada.
     */
    public static function rejugarCruce(int $cruce, string $quien): array
    {
        self::preparar();
        $x = Db::fila('SELECT * FROM copa_cruces WHERE id = ?', [$cruce]);
        Fallo::si(!$x, 'Ese cruce no existe.', 404, ['codigo' => 'no_existe']);
        Fallo::si((string) Db::valor('SELECT fase FROM copas WHERE id = ?', [$x['copa_id']]) === 'cerrada', 'La copa ya cerró y entregó premios: no se rejuegan sus cruces.', 409, ['codigo' => 'copa_cerrada']);
        $antes = $x['estado'] === 'jugado' ? $x['puntos_a'] . '–' . $x['puntos_b'] : 'pendiente';
        $d = json_decode((string) $x['detalle_json'], true) ?: [];
        Db::q("UPDATE copa_cruces SET estado = 'pendiente', puntos_a = NULL, puntos_b = NULL, detalle_json = ? WHERE id = ?",
            [self::json(array_intersect_key($d, ['semilla' => 1, 'grupo' => 1])), $cruce]);
        $ok = self::jugarCruce($cruce);
        if (!$ok) self::recalcularTabla((int) $x['copa_id']);
        $y = Db::fila('SELECT * FROM copa_cruces WHERE id = ?', [$cruce]);
        Auditoria::anotar($quien, 'copa_rejugar', 'Cruce N° ' . $cruce . ' de la copa N° ' . $x['copa_id'] . ': ' . $antes . ' → ' . ($ok ? $y['puntos_a'] . '–' . $y['puntos_b'] : 'pendiente (el motor no respondió)'));
        return ['puntos_a' => $y['puntos_a'] === null ? null : (int) $y['puntos_a'], 'puntos_b' => $y['puntos_b'] === null ? null : (int) $y['puntos_b'], 'estado' => $y['estado']];
    }

    // ------------------------------------------------------------------ intentos de preparación
    private static function secreto(): string
    {
        $c = Config::get('COPA_SECRETO');
        if ($c !== '') return $c;
        $v = Db::valor("SELECT valor FROM copa_ajustes WHERE clave = 'secreto'");
        if ($v === null) {
            Db::q("INSERT OR IGNORE INTO copa_ajustes (clave, valor, actualizado) VALUES ('secreto', ?, ?)", [bin2hex(random_bytes(32)), time()]);
            $v = Db::valor("SELECT valor FROM copa_ajustes WHERE clave = 'secreto'");
        }
        return (string) $v;
    }

    private static function firma(int $id, int $j, int $semilla): string { return hash_hmac('sha256', 'copa|' . $id . '|' . $j . '|' . $semilla, self::secreto()); }

    private static function vencer(): void
    {
        Db::q("UPDATE copa_intentos SET estado = 'vencido', motivo = 'tiempo_agotado' WHERE estado = 'jugando' AND vence < ?", [self::ahora()]);
    }

    private static function intentoJson(array $i): array
    {
        return ['id' => (int) $i['id'], 'seed' => (int) $i['semilla'], 'contrato' => json_decode((string) $i['contrato_json'], true), 'equipo' => json_decode((string) $i['equipo_json'], true),
                'contexto' => json_decode((string) $i['contexto_json'], true), 'vip' => (bool) $i['vip'], 'firma' => self::firma((int) $i['id'], (int) $i['jugador_id'], (int) $i['semilla']),
                'vence' => Db::iso((int) $i['vence'])];
    }

    /**
     * Intentos de preparación por día: 10 + Pase de Copa (+5) + VIP (máx. 3), nunca más de 18 (server/INTEGRAR_ESTRELLAS.md).
     * Estrellas::limiteIntentos ya incluye el VIP; sin Estrellas, solo el VIP (Vip::intentosExtra). Si algo falla: 10.
     */
    public static function intentosMax(int $j, int $copa): int
    {
        try {
            if (class_exists(Estrellas::class) && method_exists(Estrellas::class, 'limiteIntentos')) $n = Estrellas::limiteIntentos($j, $copa);
            else $n = self::INTENTOS_DIA + (class_exists(Vip::class) && method_exists(Vip::class, 'intentosExtra') ? max(0, min(3, (int) Vip::intentosExtra($j))) : 0);
            return max(self::INTENTOS_DIA, min(self::INTENTOS_TOPE, (int) $n));
        } catch (\Throwable $e) {
            error_log('EN VIVO copa: intentosMax ' . mb_substr($e->getMessage(), 0, 200));
            return self::INTENTOS_DIA;
        }
    }

    /**
     * Bono de ventajas pagadas en la copa (MONETIZACION.md §1): Ventajas::bono($j, 'copa'). Con $ref (un cruce), recortado
     * con Estrellas::bonoFinal (la estrella ya juega DENTRO del equipo). 0 sin Ventajas o si algo falla.
     */
    public static function bonoVentajas(int $j, ?string $ref = null): int
    {
        try {
            if ($j < 1 || !class_exists(Ventajas::class) || !method_exists(Ventajas::class, 'bono')) return 0;
            $b = (int) (Ventajas::bono($j, 'copa')['total'] ?? 0);
            if ($ref !== null && class_exists(Estrellas::class) && method_exists(Estrellas::class, 'bonoFinal')) $b = Estrellas::bonoFinal($j, 'copa', $b, $ref);
            return max(0, min($ref !== null ? self::BONO_VENTAJAS_MAX : Ventajas::TOPE_MAX, $b));
        } catch (\Throwable $e) {
            error_log('EN VIVO copa: bono de ventajas ' . mb_substr($e->getMessage(), 0, 200));
            return 0;
        }
    }

    /** POST /api/copa/intento/iniciar {} → {id, seed, contrato, equipo, contexto, vip, firma, vence} (si ya hay uno abierto, el mismo). */
    public static function iniciarIntento(int $j, array $in = []): array
    {
        self::preparar();
        self::cuentaActiva($j);
        Fallo::si(Limite::contar('copa:' . $j, 60), 'Demasiados intentos seguidos. Espera unos minutos.', 429);
        self::vencer();
        [$c, , $sid] = self::copaDelJugador($j);
        Fallo::si($c['fase'] !== 'preparacion', 'La preparación terminó: ahora juegan los planteles de cada servidor.', 409, ['codigo' => 'fase']);
        $eqf = Db::fila('SELECT * FROM copa_equipos WHERE copa_id = ? AND jugador_id = ?', [$c['id'], $j]);
        Fallo::si(!$eqf, 'Primero registra tu equipo de copa.', 409, ['codigo' => 'sin_equipo']);
        $abierto = Db::fila("SELECT * FROM copa_intentos WHERE jugador_id = ? AND copa_id = ? AND estado = 'jugando' ORDER BY id DESC LIMIT 1", [$j, $c['id']]);
        if ($abierto) return ['ok' => true, 'reanudado' => true] + self::intentoJson($abierto);
        $hoy = (new \DateTimeImmutable('@' . self::ahora()))->setTimezone(self::zona())->setTime(0, 0)->getTimestamp();
        $n = (int) Db::valor('SELECT COUNT(*) FROM copa_intentos WHERE jugador_id = ? AND creado >= ?', [$j, $hoy]);
        $max = self::intentosMax($j, (int) $c['id']);
        Fallo::si($n >= $max, 'Ya jugaste tus ' . $max . ' eventos de copa de hoy. Vuelve mañana.', 429, ['codigo' => 'limite_dia', 'max' => $max]);
        $tipos = array_values(array_unique(self::TORNEOS[$c['torneo_key']]['tipos']));
        $tipo = $tipos[random_int(0, count($tipos) - 1)];
        $contrato = self::contrato((string) $c['torneo_key'], $tipo, fn() => random_int(0, 999999) / 1000000);
        $vip = Monedero::vipActivo($j);
        $t = self::ahora();
        $vence = min($t + self::INTENTO_SEG, self::semana($t)['sabado']);
        $i = Db::tx(function () use ($j, $c, $sid, $eqf, $contrato, $vip, $t, $vence): array {
            Db::q("INSERT INTO copa_intentos (copa_id, jugador_id, servidor_id, semilla, contrato_json, equipo_json, contexto_json, vip, estado, creado, vence)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'jugando', ?, ?)",
                [$c['id'], $j, $sid, random_int(1, 2147483646), self::json($contrato), $eqf['equipo_json'], self::json(self::CONTEXTO), $vip ? 1 : 0, $t, $vence]);
            return Db::fila('SELECT * FROM copa_intentos WHERE id = ?', [Db::ultimoId()]);
        });
        return ['ok' => true, 'reanudado' => false] + self::intentoJson($i);
    }

    private static function paraValidar(array $i): array
    {
        $o = ['seed' => (int) $i['semilla'], 'contrato' => json_decode((string) $i['contrato_json'], true), 'equipo' => json_decode((string) $i['equipo_json'], true),
              'contexto' => json_decode((string) $i['contexto_json'], true), 'vip' => (bool) $i['vip'], 'decisiones' => json_decode((string) $i['decisiones_json'], true) ?? []];
        $cr = $i['cliente_json'] !== null ? json_decode((string) $i['cliente_json'], true) : null;
        if (is_array($cr)) $o['cliente_resultado'] = $cr;
        return $o;
    }

    public static function validar(array $intento): array
    {
        try {
            return self::$validador !== null ? (self::$validador)($intento) : Repeticion::validar($intento);
        } catch (\Throwable $e) {
            return ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => mb_substr($e->getMessage(), 0, 200)]];
        }
    }

    /** Puntos de preparación de un intento validado: calidad + extra por estrellas. */
    public static function puntosIntento(int $calidad, int $estrellas): int
    {
        return max(0, min(100, $calidad)) + (self::ESTRELLAS_EXTRA[max(0, min(5, $estrellas))] ?? 0);
    }

    /** POST /api/copa/intento/enviar {intento_id, decisiones, resultado} → {resultado: {calidad, estrellas, valido, puntos}, copa} */
    public static function enviarIntento(int $j, array $in): array
    {
        self::preparar();
        Fallo::si(Limite::contar('copa:' . $j, 60), 'Demasiados intentos seguidos. Espera unos minutos.', 429);
        $id = $in['intento_id'] ?? null;
        if (is_string($id) && ctype_digit($id)) $id = (int) $id;
        Fallo::si(!is_int($id) || $id < 1, 'Falta "intento_id".', 400);
        $dec = $in['decisiones'] ?? null;
        Fallo::si(!is_array($dec) || !array_is_list($dec) || count($dec) > 20 || array_filter($dec, fn($d) => !is_int($d) || $d < 0 || $d > 9) !== [],
            'Las decisiones deben ser una lista de números (máximo 20).', 400, ['codigo' => 'decisiones']);
        $res = $in['resultado'] ?? null;
        $q = is_array($res) ? ($res['quality'] ?? $res['calidad'] ?? null) : null;
        $s = is_array($res) ? ($res['stars'] ?? $res['estrellas'] ?? null) : null;
        $cliente = is_int($q) && is_int($s) ? ['quality' => $q, 'stars' => $s] : null;
        // Paso 1: la semilla queda usada ANTES de validar (aunque falle, no se puede volver a probar)
        $paso = Db::tx(function () use ($j, $id, $dec, $cliente, $in): array {
            $i = Db::fila('SELECT * FROM copa_intentos WHERE id = ? AND jugador_id = ?', [$id, $j]);
            Fallo::si(!$i, 'Ese intento no existe.', 404, ['codigo' => 'no_existe']);
            Fallo::si($i['estado'] !== 'jugando', $i['estado'] === 'vencido' ? 'Se acabó el tiempo de ese evento.' : 'Ese evento ya se envió.', 409,
                ['codigo' => $i['estado'] === 'vencido' ? 'vencido' : 'ya_enviado']);
            if (self::ahora() > (int) $i['vence']) {
                Db::q("UPDATE copa_intentos SET estado = 'vencido', motivo = 'tiempo_agotado' WHERE id = ?", [$id]);
                return ['error' => new Fallo('Se acabó el tiempo de ese evento.', 409, ['codigo' => 'vencido'])];
            }
            if (is_string($in['firma'] ?? null) && !hash_equals(self::firma($id, $j, (int) $i['semilla']), $in['firma'])) {
                Db::q("UPDATE copa_intentos SET estado = 'rechazado', motivo = 'firma_invalida', sospechoso = 1, enviado = ? WHERE id = ?", [self::ahora(), $id]);
                return ['error' => new Fallo('El intento no tiene la firma del servidor.', 403, ['codigo' => 'firma'])];
            }
            Db::q("UPDATE copa_intentos SET estado = 'validando', decisiones_json = ?, cliente_json = ?, enviado = ? WHERE id = ?",
                [self::json($dec), $cliente === null ? null : self::json($cliente), self::ahora(), $id]);
            return ['fila' => Db::fila('SELECT * FROM copa_intentos WHERE id = ?', [$id])];
        });
        if (isset($paso['error'])) throw $paso['error'];
        // Paso 2: el validador repite la jugada (fuera de la transacción)
        $f = self::aplicar($id, self::validar(self::paraValidar($paso['fila'])));
        return ['ok' => true, 'resultado' => ['calidad' => $f['calidad'] === null ? null : (int) $f['calidad'], 'estrellas' => $f['estrellas'] === null ? null : (int) $f['estrellas'],
                'valido' => $f['estado'] === 'validado' ? (bool) $f['valido'] : ($f['estado'] === 'pendiente' ? null : false), 'puntos' => (int) $f['puntos'],
                'estado' => $f['estado'], 'sospechoso' => (bool) $f['sospechoso'], 'motivo' => $f['motivo']], 'copa' => self::estado($j)];
    }

    /**
     * Guarda lo que dijo el validador. Cuenta SIEMPRE la calidad del validador (nunca la que dice el juego): si el juego
     * dijo otro resultado, el intento queda marcado como sospechoso (salvo otra versión de la lógica), pero suma lo que el
     * servidor calculó, así mentir no da nada. Jugada imposible (calidad null) → 'rechazado', 0 puntos.
     * Validador caído → 'pendiente' (se revalida después). Fuera de tiempo (ya se jugó un cruce) → no suma.
     */
    private static function aplicar(int $id, array $r): array
    {
        return Db::tx(function () use ($id, $r): array {
            $i = Db::fila('SELECT * FROM copa_intentos WHERE id = ?', [$id]);
            if (!in_array($i['estado'], ['validando', 'pendiente'], true)) return $i;
            $d = is_array($r['detalle'] ?? null) ? $r['detalle'] : [];
            $motivo = is_string($d['motivo'] ?? null) ? mb_substr($d['motivo'], 0, 60) : null;
            $ver = is_string($r['version_logica'] ?? null) ? mb_substr($r['version_logica'], 0, 40) : null;
            $t = self::ahora();
            if ($motivo === 'validador_caido' || $motivo === 'logica_no_carga') {
                Db::q("UPDATE copa_intentos SET estado = 'pendiente', motivo = ? WHERE id = ?", [$motivo, $id]);
                return Db::fila('SELECT * FROM copa_intentos WHERE id = ?', [$id]);
            }
            $cal = $r['calidad'] ?? null;
            if (!is_int($cal)) {
                Db::q("UPDATE copa_intentos SET estado = 'rechazado', valido = 0, puntos = 0, motivo = ?, version_logica = ?, validado_en = ? WHERE id = ?", [$motivo ?? 'jugada_invalida', $ver, $t, $id]);
                return Db::fila('SELECT * FROM copa_intentos WHERE id = ?', [$id]);
            }
            $cal = max(0, min(100, $cal));
            $est = is_int($r['estrellas'] ?? null) ? max(0, min(5, $r['estrellas'])) : 0;
            $valido = ($r['valido'] ?? false) === true;
            $otraVersion = !empty($d['version_distinta']);
            $sospechoso = !$valido && !$otraVersion;
            $copa = Db::fila('SELECT * FROM copas WHERE id = ?', [$i['copa_id']]);
            $aTiempo = (int) $i['enviado'] < self::semana((int) $copa['inicio'])['sabado'] && $copa['fase'] !== 'cerrada'
                && !Db::valor("SELECT 1 FROM copa_cruces WHERE copa_id = ? AND estado = 'jugado'", [$copa['id']]);
            $puntos = $aTiempo ? self::puntosIntento($cal, $est) + self::bonoVentajas((int) $i['jugador_id']) : 0;   // + bono de ventajas (MONETIZACION.md §1)
            $nota = !$aTiempo ? 'fuera_de_tiempo' : ($sospechoso ? ($motivo ?? 'resultado_no_coincide') : $motivo);
            Db::q("UPDATE copa_intentos SET estado = ?, calidad = ?, estrellas = ?, puntos = ?, valido = ?, sospechoso = ?, motivo = ?, version_logica = ?, validado_en = ? WHERE id = ?",
                ['validado', $cal, $est, $puntos, $valido ? 1 : 0, $sospechoso ? 1 : 0, $nota, $ver, $t, $id]);
            if ($valido && $aTiempo && class_exists(SedeOficial::class)) SedeOficial::premioIntento((int) $i['jugador_id'], $cal, $est, 'copa', 'copa:' . $id);   // INTEGRAR_SEDE_OFICIAL.md §4
            if ($puntos > 0) {
                $asoc = Db::valor('SELECT asociacion_id FROM asociacion_miembros WHERE jugador_id = ?', [$i['jugador_id']]);
                Db::q("INSERT OR IGNORE INTO copa_aportes (copa_id, jugador_id, servidor_id, asociacion_id, puntos, fuente, ref, creado) VALUES (?, ?, ?, ?, ?, 'intento', ?, ?)",
                    [$i['copa_id'], $i['jugador_id'], $i['servidor_id'], $asoc === null ? null : (int) $asoc, $puntos, 'intento:' . $id, $t]);
                self::recalcularPrep((int) $i['copa_id']);
                if (class_exists(Estrellas::class)) Estrellas::ganarFichas((int) $i['jugador_id'], 1, 'copa_intento:' . $id);
                try {
                    if (class_exists(Universos::class) && method_exists(Universos::class, 'marcarActivo')) Universos::marcarActivo((int) $i['jugador_id'], true);
                } catch (\Throwable) {
                }
                if (class_exists(Pase::class)) Pase::sumarXp((int) $i['jugador_id'], Pase::XP['copa'], 'copa', 'intento:' . $id);   // INTEGRAR_PASE.md §5
            }
            return Db::fila('SELECT * FROM copa_intentos WHERE id = ?', [$id]);
        });
    }

    /** Vuelve a validar intentos pendientes (validador caído) o trabados. Devuelve cuántos se resolvieron. */
    public static function revalidar(?int $copa = null, int $max = 50): int
    {
        self::preparar();
        $sql = "SELECT * FROM copa_intentos WHERE (estado = 'pendiente' OR (estado = 'validando' AND enviado < ?))";
        $p = [self::ahora() - self::VALIDANDO_TRABADO];
        if ($copa !== null) { $sql .= ' AND copa_id = ?'; $p[] = $copa; }
        $n = 0;
        foreach (Db::todas($sql . ' ORDER BY id LIMIT ' . max(1, $max), $p) as $i) {
            $f = self::aplicar((int) $i['id'], self::validar(self::paraValidar($i)));
            if ($f['estado'] !== 'pendiente') $n++;
        }
        return $n;
    }

    // ------------------------------------------------------------------ GET /api/copa
    private static function cruceJson(array $x, array $nombres): array
    {
        $d = json_decode((string) $x['detalle_json'], true) ?: [];
        $jugado = $x['estado'] === 'jugado';
        return ['id' => (int) $x['id'], 'ronda' => (int) $x['ronda'], 'grupo' => (int) ($d['grupo'] ?? 1), 'a' => (int) $x['servidor_a'], 'b' => (int) $x['servidor_b'],
            'a_nombre' => $nombres[(int) $x['servidor_a']] ?? '', 'b_nombre' => $nombres[(int) $x['servidor_b']] ?? '',
            'hora' => Db::iso((int) $x['hora']), 'estado' => $x['estado'],
            'puntos_a' => $jugado ? (int) $x['puntos_a'] : null, 'puntos_b' => $jugado ? (int) $x['puntos_b'] : null,
            'bono_a' => $jugado ? (int) ($d['bono_a'] ?? 0) : null, 'bono_b' => $jugado ? (int) ($d['bono_b'] ?? 0) : null,
            'calidad_total_a' => $jugado ? (int) ($d['calidad_total_a'] ?? 0) : null, 'calidad_total_b' => $jugado ? (int) ($d['calidad_total_b'] ?? 0) : null,
            'partidos' => $jugado ? array_map(fn($p) => ['n' => (int) $p['n'], 'tipo' => $p['tipo'], 'calidad_a' => (int) $p['calidad_a'], 'calidad_b' => (int) $p['calidad_b'],
                'ganador' => $p['ganador'], 'equipo_a' => $p['equipo_a'] ?? null, 'equipo_b' => $p['equipo_b'] ?? null], $d['partidos'] ?? []) : []];
    }

    /** Todo lo que pinta la pantalla de la copa. */
    public static function estado(int $j): array
    {
        self::preparar();
        [$c, $u, $sid] = self::copaDelJugador($j);
        $cid = (int) $c['id'];
        $c = Db::fila('SELECT * FROM copas WHERE id = ?', [$cid]);
        $nombres = [];
        foreach (Db::todas('SELECT id, nombre FROM servidores') as $s) $nombres[(int) $s['id']] = (string) $s['nombre'];
        $servs = [];
        foreach (Db::todas('SELECT * FROM copa_servidores WHERE copa_id = ? ORDER BY COALESCE(posicion, 999), puntos_prep DESC, servidor_id', [$cid]) as $s) {
            $servs[] = ['id' => (int) $s['servidor_id'], 'nombre' => $nombres[(int) $s['servidor_id']] ?? '', 'puntos_prep' => (int) $s['puntos_prep'], 'puntos_tabla' => (int) $s['puntos_tabla'],
                'g' => (int) $s['ganados'], 'e' => (int) $s['empatados'], 'p' => (int) $s['perdidos'], 'dif_calidad' => (int) $s['dif_calidad'],
                'posicion' => $s['posicion'] === null ? null : (int) $s['posicion'], 'yo' => (int) $s['servidor_id'] === $sid];
        }
        $bonos = self::bonos($cid);
        foreach ($servs as &$s) { $s['bono'] = (int) ($bonos[$s['id']]['bono'] ?? 0); $s['activos'] = (int) ($bonos[$s['id']]['activos'] ?? 1); }
        unset($s);
        $cruces = array_map(fn($x) => self::cruceJson($x, $nombres), Db::todas('SELECT * FROM copa_cruces WHERE copa_id = ? ORDER BY ronda, hora, id', [$cid]));
        $ap = self::aportantes($cid, $sid);
        $miAporte = 0; $miPos = null;
        foreach ($ap as $i => $a) if ((int) $a['jugador_id'] === $j) { $miAporte = (int) $a['puntos']; $miPos = $i + 1; }
        $abierto = Db::fila("SELECT * FROM copa_intentos WHERE jugador_id = ? AND copa_id = ? AND estado = 'jugando' AND vence >= ? ORDER BY id DESC LIMIT 1", [$j, $cid, self::ahora()]);
        $hist = [];
        foreach (Db::todas("SELECT c.*, (SELECT servidor_id FROM copa_servidores s WHERE s.copa_id = c.id AND s.posicion = 1) AS campeon FROM copas c
                            WHERE c.universo_id = ? AND c.fase = 'cerrada' ORDER BY c.inicio DESC LIMIT 8", [$u['id']]) as $h) {
            $hist[] = ['semana' => $h['semana'], 'nombre' => $h['nombre'], 'torneo_key' => $h['torneo_key'], 'campeon' => $h['campeon'] === null ? null : ($nombres[(int) $h['campeon']] ?? null)];
        }
        $trofeos = [];
        foreach (Db::todas("SELECT c.* FROM copa_premios p JOIN copas c ON c.id = p.copa_id WHERE p.jugador_id = ? AND p.clave = 'campeon' ORDER BY c.inicio DESC", [$j]) as $h) {
            $trofeos[] = self::trofeo($h) + ['semana' => $h['semana']];
        }
        $T = self::TORNEOS[$c['torneo_key']];
        $sem = self::semana((int) $c['inicio']);
        return [
            'ok' => true,
            'copa' => ['id' => $cid, 'nombre' => $c['nombre'], 'torneo_key' => $c['torneo_key'], 'fase' => $c['fase'], 'inicio' => Db::iso((int) $c['inicio']), 'fin' => Db::iso((int) $c['fin']),
                       'ahora' => Db::iso(self::ahora()), 'semana' => $c['semana'], 'batalla' => Db::iso($sem['sabado']), 'cierre' => Db::iso($sem['batalla_fin']),
                       'deporte' => $T['deporte'], 'cadena' => $T['cadena'], 'tipos' => array_values(array_unique($T['tipos'])), 'equipo_registrado_total' => (int) Db::valor('SELECT COUNT(*) FROM copa_equipos WHERE copa_id = ?', [$cid])],
            'universo' => ['id' => (int) $u['id'], 'nombre' => $u['nombre']],
            'servidores' => $servs,
            'cruces' => $cruces,
            'yo' => ['servidor_id' => $sid, 'aporte' => $miAporte, 'posicion_en_servidor' => $miPos,
                     'equipo_registrado' => (bool) Db::valor('SELECT 1 FROM copa_equipos WHERE copa_id = ? AND jugador_id = ?', [$cid, $j]),
                     'intento_abierto' => $abierto ? self::intentoJson($abierto) : null,
                     'intentos_hoy' => (int) Db::valor('SELECT COUNT(*) FROM copa_intentos WHERE jugador_id = ? AND creado >= ?', [$j, (new \DateTimeImmutable('@' . self::ahora()))->setTimezone(self::zona())->setTime(0, 0)->getTimestamp()]),
                     'intentos_max' => self::intentosMax($j, $cid), 'trofeos' => $trofeos,
                     'premios' => array_map(fn($p) => ['clave' => $p['clave'], 'entregado' => Db::iso((int) $p['entregado'])], Db::todas('SELECT * FROM copa_premios WHERE copa_id = ? AND jugador_id = ? ORDER BY clave', [$cid, $j]))],
            'top_aportantes' => array_map(fn($a) => ['jugador_id' => (int) $a['jugador_id'], 'alias' => Social::nombrePublico($a['alias'], $a['nombre']), 'siglas' => $a['siglas'], 'puntos' => (int) $a['puntos']], array_slice($ap, 0, 10)),
            'historial' => $hist,
        ];
    }
}
