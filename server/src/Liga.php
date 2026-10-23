<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Liga Semanal de Productoras (Fase 6, inspirada en el Derby de Hay Day). Ver server/INTEGRAR_LIGA.md.
 *
 * - Semana: lunes 00:00 a domingo 23:59:59 (zona del juego, America/Guayaquil). El cambio de semana es "perezoso":
 *   la primera petición de la semana nueva cierra la anterior (ranking, ascensos/descensos, fichas) y arma los grupos.
 *   La tarea programada server/bin/liga.php hace lo mismo a la hora exacta (y revalida intentos pendientes).
 * - Cinco ligas: Barrial, Provincial, Nacional, Internacional y Mundial. Cada semana las asociaciones se agrupan de a ~8
 *   con otras de liga parecida. Los primeros del grupo suben, los últimos (y las que no hicieron nada) bajan.
 * - Tablero de 12 encargos por asociación, sorteados con semilla propia de (asociación, semana) y más difíciles en ligas
 *   altas. Cada miembro toma UN encargo a la vez (máximo MAX_TAREAS_SEMANA por semana), lo cumple jugando y suma los
 *   puntos del encargo a su asociación al completarlo. El presidente puede descartar encargos que nadie tomó.
 * - Los encargos se cumplen SOLO con intentos de evento entregados por el servidor (semilla + contrato + equipo
 *   registrado) y devueltos con las decisiones del jugador. Modo 'firma' (por ahora): el servidor acepta el resultado
 *   que dice el juego si el intento es suyo, de ese jugador, se usa una sola vez y el resultado es coherente. Modo
 *   'repeticion': server/validador repite la jugada y vale SU resultado. Las decisiones se guardan siempre, así los
 *   intentos 'firmado' se pueden revalidar después (Liga::revalidar).
 * - Fichas de liga: por cada bandera (hito de puntos) y por la posición final, para los miembros que completaron al
 *   menos un encargo. Se gastan en la tienda de la liga (repuestos, dinero del juego, refuerzos, cosméticos): crean
 *   entregas de los tipos que el juego ya conoce. Nada de eso se puede vender en el mercado.
 * Errores para el jugador: Fallo (texto + código HTTP). Las tablas están en migraciones/liga.sql (se crean solas).
 */
final class Liga
{
    public const LIGAS = [
        ['id' => 'barrial', 'nombre' => 'Liga Barrial', 'color' => '#c58b5a'],
        ['id' => 'provincial', 'nombre' => 'Liga Provincial', 'color' => '#b8c2d6'],
        ['id' => 'nacional', 'nombre' => 'Liga Nacional', 'color' => '#ffb020'],
        ['id' => 'internacional', 'nombre' => 'Liga Internacional', 'color' => '#4da3ff'],
        ['id' => 'mundial', 'nombre' => 'Liga Mundial', 'color' => '#ff3b3b'],
    ];
    public const TABLERO = 12;
    public const MAX_TAREAS_SEMANA = 9;
    public const TAM_GRUPO = 8;              // tamaño ideal del grupo al armar la semana
    public const TAM_MAX_GRUPO = 10;         // las que llegan tarde entran a un grupo de su liga con menos de esto
    public const REEMPLAZO_SEG = 600;        // un encargo completado o descartado se reemplaza a los 10 minutos
    public const INTENTO_SEG = 3 * 3600;     // un intento emitido vale 3 horas
    public const HORAS_MAX = 48;
    public const PUNTOS_MULT = [1.0, 1.3, 1.65, 2.05, 2.5];
    public const BANDERAS = [1000, 3000, 6000, 10000];
    public const BANDERAS_MULT = [1.0, 1.4, 1.9, 2.5, 3.2];
    public const FICHAS_BANDERA = [15, 25, 35, 50];
    public const FICHAS_POSICION = [100, 75, 60, 45, 35, 25, 18, 12, 8, 5];
    public const ESTRELLAS = [85, 70, 55, 40];   // calidad mínima para 5, 4, 3 y 2 estrellas (BALANCE.stars de js/logic.js)
    /** Imprevistos que cortan la transmisión ("sin cortes" = ninguno de estos salió mal). */
    public const CORTES = ['internet', 'luz', 'senal', 'cable', 'bateria', 'falla'];

    /** Los 16 tipos de evento del juego (js/datos.js, vía CatalogoJuego): nombre, cams, audio, stream, outdoor, diff, pay, clientes. */
    public const TIPOS = CatalogoJuego::EVENTOS;
    /** Tipos de evento que entran en cada liga (y dificultad mínima de los encargos "genéricos"). */
    public const TIPOS_LIGA = [
        ['misa', 'funeral', 'boda', 'prensa', 'irl', 'barrial', 'graduacion'],
        ['misa', 'funeral', 'boda', 'prensa', 'irl', 'barrial', 'graduacion', 'lucha_libre', 'lanzamiento'],
        ['boda', 'prensa', 'irl', 'barrial', 'graduacion', 'lucha_libre', 'lanzamiento', 'boxeo', 'concierto'],
        ['barrial', 'graduacion', 'lucha_libre', 'lanzamiento', 'boxeo', 'lanzamiento_autos', 'concierto', 'ligapro'],
        ['lanzamiento', 'boxeo', 'lanzamiento_autos', 'concierto', 'ligapro', 'final', 'internacional_unilateral', 'internacional_host'],
    ];

    /**
     * Plantillas de encargos. meta = cuántos eventos pide en cada liga (null = no aparece en esa liga); pu = puntos por
     * evento (luego x PUNTOS_MULT de la liga). Criterio (igual en js/liga.js -> Liga.cumple):
     *   evento [tipos], min_estrellas, stream, sin_cortes, duelo 'won', min_diff, outdoor, senior.
     */
    public const PLANTILLAS = [
        'bodas' => ['titulo' => 'Cubre {n} bodas', 'uno' => 'Cubre una boda', 'icono' => 'boda', 'criterio' => ['evento' => ['boda'], 'min_estrellas' => 2], 'meta' => [3, 3, 4, 4, 5], 'pu' => 45],
        'misas' => ['titulo' => 'Transmite {n} misas en vivo', 'uno' => 'Transmite una misa en vivo', 'icono' => 'misa', 'criterio' => ['evento' => ['misa'], 'stream' => true], 'meta' => [3, 4, null, null, null], 'pu' => 35],
        'prensa' => ['titulo' => 'Cubre {n} ruedas de prensa', 'uno' => 'Cubre una rueda de prensa', 'icono' => 'prensa', 'criterio' => ['evento' => ['prensa']], 'meta' => [2, 3, 3, null, null], 'pu' => 40],
        'barrial' => ['titulo' => 'Transmite {n} partidos de liga barrial', 'uno' => 'Transmite un partido de liga barrial', 'icono' => 'barrial', 'criterio' => ['evento' => ['barrial'], 'stream' => true], 'meta' => [2, 3, 3, 4, null], 'pu' => 60],
        'graduaciones' => ['titulo' => 'Graba {n} graduaciones con 3⭐ o más', 'uno' => 'Graba una graduación con 3⭐ o más', 'icono' => 'graduacion', 'criterio' => ['evento' => ['graduacion'], 'min_estrellas' => 3], 'meta' => [2, 2, 3, 3, null], 'pu' => 65],
        'sin_cortes' => ['titulo' => 'Transmite {n} eventos sin cortes', 'uno' => 'Transmite un evento sin cortes', 'icono' => 'stream', 'criterio' => ['stream' => true, 'sin_cortes' => true], 'meta' => [3, 4, 5, 5, 6], 'pu' => 55],
        'duelos' => ['titulo' => 'Gana {n} duelos contra MegaVisión', 'uno' => 'Gana un duelo contra MegaVisión', 'icono' => 'rival', 'criterio' => ['duelo' => 'won'], 'meta' => [1, 2, 2, 3, 3], 'pu' => 110],
        'senior' => ['titulo' => 'Contrata a un Senior y llévalo a {n} eventos', 'uno' => 'Contrata a un Senior y llévalo a un evento', 'icono' => 'people', 'criterio' => ['senior' => true], 'meta' => [1, 2, 2, 3, 3], 'pu' => 70],
        'cinco_estrellas' => ['titulo' => 'Consigue 5⭐ en {n} eventos', 'uno' => 'Consigue 5⭐ en un evento', 'icono' => 'star', 'criterio' => ['min_estrellas' => 5], 'meta' => [1, 1, 2, 2, 3], 'pu' => 130],
        'aire_libre' => ['titulo' => 'Cubre {n} eventos al aire libre', 'uno' => 'Cubre un evento al aire libre', 'icono' => 'outdoor', 'criterio' => ['outdoor' => true, 'min_estrellas' => 2], 'meta' => [2, 3, 3, 4, 4], 'pu' => 50],
        'lanzamientos' => ['titulo' => 'Lanza {n} marcas con 4⭐', 'uno' => 'Lanza una marca con 4⭐', 'icono' => 'lanzamiento', 'criterio' => ['evento' => ['lanzamiento'], 'min_estrellas' => 4], 'meta' => [null, 1, 2, 2, 3], 'pu' => 120],
        'grandes' => ['titulo' => 'Cubre {n} eventos de dificultad 3 o más', 'uno' => 'Cubre un evento de dificultad 3 o más', 'icono' => 'trend', 'criterio' => ['min_diff' => 3], 'meta' => [null, 2, 3, 3, 4], 'pu' => 90],
        'conciertos' => ['titulo' => 'Consigue 4⭐ en {n} conciertos', 'uno' => 'Consigue 4⭐ en un concierto', 'icono' => 'concierto', 'criterio' => ['evento' => ['concierto'], 'min_estrellas' => 4], 'meta' => [null, null, 1, 2, 2], 'pu' => 160],
        'ligapro' => ['titulo' => 'Transmite {n} partidos de LigaPrima con 3⭐ o más', 'uno' => 'Transmite un partido de LigaPrima con 3⭐ o más', 'icono' => 'ligapro', 'criterio' => ['evento' => ['ligapro'], 'min_estrellas' => 3], 'meta' => [null, null, null, 1, 2], 'pu' => 200],
        'finales' => ['titulo' => 'Transmite {n} finales con 4⭐', 'uno' => 'Transmite una final con 4⭐', 'icono' => 'final', 'criterio' => ['evento' => ['final'], 'min_estrellas' => 4], 'meta' => [null, null, null, null, 1], 'pu' => 350],
    ];

    /**
     * Tienda de la liga (precios en fichas). La "entrega" usa los tipos que el juego ya aplica (server/API.md). Los
     * refuerzos solo se ofrecen si la base tiene entregas.nivel/eventos (migración 4). Los cosméticos quedan en
     * liga_cosmeticos (el juego los muestra; no son entregas). max_semana: límite por jugador y semana (null = sin límite).
     */
    public const TIENDA = [
        'cables' => ['nombre' => '3 cables de repuesto', 'detalle' => 'Para cuando se rompe un cable en vivo', 'icono' => 'cable', 'fichas' => 25, 'max_semana' => 3, 'entrega' => ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3]],
        'baterias' => ['nombre' => '3 baterías extra', 'detalle' => 'Ninguna cámara se queda sin carga', 'icono' => 'battery', 'fichas' => 30, 'max_semana' => 3, 'entrega' => ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]],
        'caja_liga' => ['nombre' => 'Premio de la liga: $600', 'detalle' => 'Dinero del juego para tu productora', 'icono' => 'money', 'fichas' => 45, 'max_semana' => 3, 'entrega' => ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 600]],
        'caja_grande' => ['nombre' => 'Bolsa de campeón: $2.500', 'detalle' => 'Dinero del juego (desde la Liga Nacional)', 'icono' => 'money', 'fichas' => 160, 'max_semana' => 1, 'liga_min' => 2, 'entrega' => ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2500]],
        'reparar' => ['nombre' => 'Taller de la liga', 'detalle' => 'Todos tus equipos al 100 %', 'icono' => 'wrench', 'fichas' => 70, 'max_semana' => 2, 'entrega' => ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        'ref_camarografo' => ['nombre' => 'Camarógrafo senior de refuerzo', 'detalle' => 'Te acompaña en tus próximos 2 eventos', 'icono' => 'role_cam', 'fichas' => 110, 'max_semana' => 1, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'refuerzo_camarografo_senior', 'cantidad' => 1, 'nivel' => 'senior', 'eventos' => 2]],
        'ref_tecnico' => ['nombre' => 'Técnico de streaming internacional', 'detalle' => 'Cuida tu señal en tus próximos 2 eventos (desde la Liga Internacional)', 'icono' => 'role_stream', 'fichas' => 190, 'max_semana' => 1, 'liga_min' => 3, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'refuerzo_tecnico_internacional', 'cantidad' => 1, 'nivel' => 'internacional', 'eventos' => 2]],
        'seguro' => ['nombre' => 'Seguro de evento', 'detalle' => 'Si sacas 2⭐ o menos en tu próximo evento, te devuelven la mitad', 'icono' => 'lock', 'fichas' => 80, 'max_semana' => 2, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'seguro_evento', 'cantidad' => 1, 'eventos' => 1]],
        'descanso' => ['nombre' => 'Día libre pagado', 'detalle' => 'Todo tu personal recupera la energía', 'icono' => 'sleep', 'fichas' => 60, 'max_semana' => 2, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'equipo_descansado', 'cantidad' => 1]],
        'marco_liga' => ['nombre' => 'Marco "Liga Semanal"', 'detalle' => 'Marco de perfil para tu productora', 'icono' => 'sparkle', 'fichas' => 150, 'max_semana' => null, 'cosmetico' => true],
        'banderin' => ['nombre' => 'Banderín dorado', 'detalle' => 'Aparece junto a tu nombre en el chat', 'icono' => 'crown', 'fichas' => 220, 'max_semana' => null, 'cosmetico' => true],
        'neon_sede' => ['nombre' => 'Letrero de neón para tu sede', 'detalle' => 'Desde la Liga Provincial', 'icono' => 'bolt', 'fichas' => 300, 'max_semana' => null, 'liga_min' => 1, 'cosmetico' => true],
        'trofeo_mundial' => ['nombre' => 'Trofeo de la Liga Mundial', 'detalle' => 'Para la vitrina de tu sede (solo en la Liga Mundial)', 'icono' => 'final', 'fichas' => 600, 'max_semana' => null, 'liga_min' => 4, 'cosmetico' => true],
    ];

    private static bool $listo = false;
    private static ?int $reloj = null;
    private static ?string $modo = null;
    /** @var callable|null */
    private static $validador = null;
    private static ?string $semanaLista = null;

    // ------------------------------------------------------------------ esquema, reloj y modo
    public static function preparar(): void
    {
        if (self::$listo) return;
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('liga_semanas', 'liga_tareas', 'liga_intentos', 'liga_fichas_mov', 'liga_cosmeticos')");
        if ($n < 5) Db::pdo()->exec((string) file_get_contents(__DIR__ . '/migraciones/liga.sql'));
        self::$listo = true;
    }

    /** Solo pruebas: congela el reloj de la liga (null = reloj de verdad). */
    public static function fijarReloj(?int $t): void { self::$reloj = $t; self::$semanaLista = null; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    /** 'firma' (por defecto, mientras no está el validador) o 'repeticion'. Config LIGA_VALIDACION. */
    public static function modoValidacion(): string
    {
        $m = self::$modo ?? Config::get('LIGA_VALIDACION', 'firma');
        return $m === 'repeticion' ? 'repeticion' : 'firma';
    }

    /** Cambia el modo (pruebas, o el panel). null = vuelve a la configuración. */
    public static function fijarModo(?string $m): void { self::$modo = $m; }

    /**
     * Función que repite un intento: recibe el intento {seed, contrato, equipo, contexto, vip, decisiones, cliente_resultado}
     * y devuelve la respuesta del validador ({valido, calidad, estrellas, coincide, version_logica, detalle}).
     * null = la de siempre: EnVivo\Validador::validar() si existe, si no Liga::validarConNode().
     */
    public static function usarValidador(?callable $f): void { self::$validador = $f; }

    // ------------------------------------------------------------------ semanas
    /** ['id' => '2026-10-19', 'inicio' => lunes 00:00, 'fin' => lunes siguiente 00:00] de la semana que contiene $t. */
    public static function semanaDe(int $t): array
    {
        $z = new \DateTimeZone(date_default_timezone_get());
        $d = (new \DateTimeImmutable('@' . $t))->setTimezone($z);
        $lunes = $d->setTime(0, 0)->modify('-' . ((int) $d->format('N') - 1) . ' days');
        return ['id' => $lunes->format('Y-m-d'), 'inicio' => $lunes->getTimestamp(), 'fin' => $lunes->modify('+7 days')->getTimestamp()];
    }

    private static function semanaAnterior(string $id): string
    {
        return (new \DateTimeImmutable($id . ' 12:00:00', new \DateTimeZone(date_default_timezone_get())))->modify('-7 days')->format('Y-m-d');
    }

    /**
     * Cambio de semana perezoso: cierra las semanas anteriores que sigan abiertas, crea la actual y arma sus grupos.
     * Devuelve la fila de la semana actual. Barato si ya está todo hecho (solo lee).
     */
    public static function asegurarSemana(): array
    {
        self::preparar();
        $s = self::semanaDe(self::ahora());
        if (self::$semanaLista !== $s['id']) {
            $pendiente = (int) Db::valor("SELECT COUNT(*) FROM liga_semanas WHERE estado = 'abierta' AND fin <= ?", [self::ahora()]);
            $fila = Db::fila('SELECT * FROM liga_semanas WHERE semana = ?', [$s['id']]);
            if ($pendiente > 0 || !$fila || !(int) $fila['agrupada']) {
                Db::tx(function () use ($s): void {
                    foreach (Db::todas("SELECT semana FROM liga_semanas WHERE estado = 'abierta' AND fin <= ? ORDER BY semana", [self::ahora()]) as $v) self::cerrarSemana($v['semana']);
                    Db::q('INSERT OR IGNORE INTO liga_semanas (semana, inicio, fin, estado, agrupada, creada) VALUES (?, ?, ?, \'abierta\', 0, ?)', [$s['id'], $s['inicio'], $s['fin'], self::ahora()]);
                    self::agrupar($s['id']);
                });
            }
            self::$semanaLista = $s['id'];
        }
        return Db::fila('SELECT * FROM liga_semanas WHERE semana = ?', [$s['id']]);
    }

    /** Liga actual de una asociación (crea la fila en Barrial si es nueva). */
    public static function ligaDe(int $asoc): int
    {
        self::preparar();
        $l = Db::valor('SELECT liga FROM liga_asociaciones WHERE asociacion_id = ?', [$asoc]);
        if ($l !== null) return (int) $l;
        if (!Db::valor('SELECT 1 FROM asociaciones WHERE id = ?', [$asoc])) return 0;
        Db::q('INSERT OR IGNORE INTO liga_asociaciones (asociacion_id, liga, desde, mejor_liga, semanas) VALUES (?, 0, ?, 0, 0)', [$asoc, self::ahora()]);
        return 0;
    }

    /**
     * Arma los grupos de la semana con las asociaciones activas (con miembros y que jugaron alguna de las 2 semanas
     * anteriores, o creadas hace menos de 14 días): se ordenan por liga y por puntaje de la semana pasada y se cortan
     * en grupos de ~TAM_GRUPO consecutivos (así cada grupo es de liga parecida). Las demás entran solas cuando un
     * miembro abre la liga (Liga::inscribir). Devuelve cuántas inscribió. No hace nada si ya estaba agrupada.
     */
    public static function agrupar(string $semana): int
    {
        return Db::tx(function () use ($semana): int {
            $sem = Db::fila('SELECT * FROM liga_semanas WHERE semana = ?', [$semana]);
            if (!$sem || (int) $sem['agrupada']) return 0;
            $ant = self::semanaAnterior($semana);
            $ant2 = self::semanaAnterior($ant);
            $cand = Db::todas("SELECT a.id, a.creado,
                       COALESCE((SELECT puntos FROM liga_participantes p WHERE p.semana = ? AND p.asociacion_id = a.id), 0) AS previos,
                       (SELECT MAX(puntos) FROM liga_participantes p WHERE p.semana IN (?, ?) AND p.asociacion_id = a.id) AS jugo
                FROM asociaciones a
                WHERE EXISTS (SELECT 1 FROM asociacion_miembros m WHERE m.asociacion_id = a.id)
                  AND NOT EXISTS (SELECT 1 FROM liga_participantes p WHERE p.semana = ? AND p.asociacion_id = a.id)", [$ant, $ant, $ant2, $semana]);
            $lista = [];
            foreach ($cand as $c) {
                if ((int) ($c['jugo'] ?? 0) <= 0 && (int) $c['creado'] < (int) $sem['inicio'] - 14 * 86400) continue;
                $lista[] = ['id' => (int) $c['id'], 'liga' => self::ligaDe((int) $c['id']), 'previos' => (int) $c['previos']];
            }
            usort($lista, fn($a, $b) => [$b['liga'], $b['previos'], $a['id']] <=> [$a['liga'], $a['previos'], $b['id']]);
            $n = count($lista);
            if ($n > 0) {
                $k = max(1, (int) round($n / self::TAM_GRUPO));
                $base = intdiv($n, $k);
                $extra = $n % $k;
                $i = 0;
                for ($g = 0; $g < $k; $g++) {
                    $tam = $base + ($g < $extra ? 1 : 0);
                    $miembros = array_slice($lista, $i, $tam);
                    $i += $tam;
                    $ligas = array_count_values(array_column($miembros, 'liga'));
                    arsort($ligas);
                    $gid = self::crearGrupo($semana, (int) array_key_first($ligas));
                    foreach ($miembros as $m) self::agregarParticipante($semana, $m['id'], $gid, $m['liga']);
                }
            }
            Db::q('UPDATE liga_semanas SET agrupada = 1 WHERE semana = ?', [$semana]);
            return $n;
        });
    }

    private static function crearGrupo(string $semana, int $liga): int
    {
        $num = (int) Db::valor('SELECT COALESCE(MAX(numero), 0) FROM liga_grupos WHERE semana = ?', [$semana]) + 1;
        Db::q('INSERT INTO liga_grupos (semana, liga, numero, creado) VALUES (?, ?, ?, ?)', [$semana, $liga, $num, self::ahora()]);
        return Db::ultimoId();
    }

    private static function agregarParticipante(string $semana, int $asoc, int $grupo, int $liga): void
    {
        $a = Db::fila('SELECT * FROM asociaciones WHERE id = ?', [$asoc]);
        Db::q('INSERT INTO liga_participantes (semana, asociacion_id, grupo_id, liga, puntos, tareas_completadas, actualizado, nombre, siglas, color, servidor_id)
               VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)', [$semana, $asoc, $grupo, $liga, self::ahora(), $a['nombre'] ?? '¿?', $a['siglas'] ?? '???', $a['color'] ?? '#8b95a8', $a['servidor_id'] ?? null]);
        for ($n = 0; $n < self::TABLERO; $n++) self::crearTarea($semana, $asoc, $liga, $n, self::ahora());
    }

    /** Inscribe la asociación en la semana si no lo estaba (grupo de su liga con cupo, o uno nuevo) y arma su tablero. */
    public static function inscribir(string $semana, int $asoc): array
    {
        return Db::tx(function () use ($semana, $asoc): array {
            $p = Db::fila('SELECT * FROM liga_participantes WHERE semana = ? AND asociacion_id = ?', [$semana, $asoc]);
            if ($p) return $p;
            $liga = self::ligaDe($asoc);
            $g = Db::fila('SELECT g.id, (SELECT COUNT(*) FROM liga_participantes p WHERE p.grupo_id = g.id) AS n FROM liga_grupos g
                           WHERE g.semana = ? AND g.liga = ? AND (SELECT COUNT(*) FROM liga_participantes p WHERE p.grupo_id = g.id) < ? ORDER BY n, g.id LIMIT 1',
                [$semana, $liga, self::TAM_MAX_GRUPO]);
            $gid = $g ? (int) $g['id'] : self::crearGrupo($semana, $liga);
            self::agregarParticipante($semana, $asoc, $gid, $liga);
            return Db::fila('SELECT * FROM liga_participantes WHERE semana = ? AND asociacion_id = ?', [$semana, $asoc]);
        });
    }

    /**
     * Cierra una semana: posiciones de cada grupo (puntos, y a igual puntaje quien llegó primero), ascensos y descensos,
     * fichas por banderas y por posición para los que completaron al menos un encargo. Idempotente. true si la cerró.
     */
    public static function cerrarSemana(string $semana): bool
    {
        return Db::tx(function () use ($semana): bool {
            $sem = Db::fila('SELECT * FROM liga_semanas WHERE semana = ?', [$semana]);
            if (!$sem || $sem['estado'] === 'cerrada') return false;
            $t = self::ahora();
            foreach (Db::todas('SELECT id FROM liga_grupos WHERE semana = ? ORDER BY numero', [$semana]) as $g) {
                $ps = Db::todas('SELECT * FROM liga_participantes WHERE grupo_id = ? ORDER BY puntos DESC, actualizado ASC, asociacion_id ASC', [$g['id']]);
                $n = count($ps);
                $cupo = $n >= 6 ? 2 : ($n >= 3 ? 1 : 0);
                foreach ($ps as $i => $p) {
                    $liga = (int) $p['liga'];
                    $puntos = (int) $p['puntos'];
                    $res = 'queda';
                    if ($i < $cupo && $liga < 4 && $puntos > 0) $res = 'sube';
                    elseif ($liga > 0 && ($puntos === 0 || ($i >= $n - $cupo && $i >= $cupo))) $res = 'baja';
                    $nueva = $liga + ($res === 'sube' ? 1 : ($res === 'baja' ? -1 : 0));
                    Db::q('UPDATE liga_participantes SET posicion = ?, resultado = ?, liga_nueva = ? WHERE semana = ? AND asociacion_id = ?', [$i + 1, $res, $nueva, $semana, $p['asociacion_id']]);
                    Db::q('UPDATE liga_asociaciones SET liga = ?, desde = CASE WHEN liga <> ? THEN ? ELSE desde END, mejor_liga = MAX(mejor_liga, ?), semanas = semanas + 1 WHERE asociacion_id = ?',
                        [$nueva, $nueva, $t, $nueva, $p['asociacion_id']]);
                    // Premios
                    $fb = 0;
                    foreach (self::banderas($liga) as $b) if ($puntos >= $b['puntos']) $fb += $b['fichas'];
                    $fp = $puntos > 0 ? self::fichasPosicion($liga, $i + 1) : 0;
                    $nombreLiga = self::LIGAS[$nueva]['nombre'];
                    foreach (Db::todas('SELECT jugador_id FROM liga_miembro_semana WHERE semana = ? AND asociacion_id = ? AND tareas_completadas > 0', [$semana, $p['asociacion_id']]) as $m) {
                        $j = (int) $m['jugador_id'];
                        if (!Db::valor('SELECT 1 FROM jugadores WHERE id = ?', [$j])) continue;
                        if ($fb > 0) self::moverFichas($j, $fb, 'bandera', 'liga:' . $semana . ':banderas:' . $p['asociacion_id'], $semana);
                        if ($fp > 0) self::moverFichas($j, $fp, 'posicion', 'liga:' . $semana . ':posicion:' . $p['asociacion_id'], $semana);
                        $txt = 'Liga Semanal: ' . $p['nombre'] . ' terminó en el puesto ' . ($i + 1) . ' de ' . $n
                             . ($res === 'sube' ? ' y sube a la ' . $nombreLiga : ($res === 'baja' ? ' y baja a la ' . $nombreLiga : '')) . '. Ganaste ' . ($fb + $fp) . ' fichas de liga.';
                        try { if (class_exists(Chat::class) && method_exists(Chat::class, 'sistema')) Chat::sistema($j, $txt); } catch (\Throwable) {}
                    }
                }
            }
            Db::q("UPDATE liga_intentos SET estado = 'vencido', cerrado = ? WHERE semana = ? AND estado = 'emitido'", [$t, $semana]);
            Db::q("UPDATE liga_semanas SET estado = 'cerrada', cerrada_en = ? WHERE semana = ?", [$t, $semana]);
            return true;
        });
    }

    // ------------------------------------------------------------------ banderas, puntos y fichas
    /** Hitos de puntos de una liga: [{n, puntos, fichas}] */
    public static function banderas(int $liga): array
    {
        $o = [];
        foreach (self::BANDERAS as $i => $p) {
            $o[] = ['n' => $i + 1, 'puntos' => (int) (round($p * self::BANDERAS_MULT[$liga] / 50) * 50), 'fichas' => (int) round(self::FICHAS_BANDERA[$i] * (1 + 0.2 * $liga))];
        }
        return $o;
    }

    public static function fichasPosicion(int $liga, int $pos): int
    {
        $b = self::FICHAS_POSICION[min($pos, count(self::FICHAS_POSICION)) - 1];
        return (int) round($b * (1 + 0.25 * $liga));
    }

    public static function fichas(int $jugador): int
    {
        self::preparar();
        return (int) (Db::valor('SELECT saldo FROM liga_fichas WHERE jugador_id = ?', [$jugador]) ?? 0);
    }

    /**
     * Suma o resta fichas con su anotación. La referencia es única por jugador: si ya se usó, no hace nada y devuelve
     * null (así un premio nunca se paga dos veces). Fallo 402 si el saldo quedaría negativo.
     */
    public static function moverFichas(int $jugador, int $cambio, string $motivo, string $ref, ?string $semana = null): ?int
    {
        self::preparar();
        return Db::tx(function () use ($jugador, $cambio, $motivo, $ref, $semana): ?int {
            if (Db::valor('SELECT 1 FROM liga_fichas_mov WHERE jugador_id = ? AND ref = ?', [$jugador, $ref])) return null;
            $saldo = self::fichas($jugador) + $cambio;
            Fallo::si($saldo < 0, 'No tienes fichas de liga suficientes.', 402, ['codigo' => 'sin_fichas']);
            Db::q('INSERT INTO liga_fichas (jugador_id, saldo) VALUES (?, ?) ON CONFLICT (jugador_id) DO UPDATE SET saldo = excluded.saldo', [$jugador, $saldo]);
            Db::q('INSERT INTO liga_fichas_mov (jugador_id, cambio, saldo, motivo, ref, semana, creado) VALUES (?, ?, ?, ?, ?, ?, ?)', [$jugador, $cambio, $saldo, $motivo, mb_substr($ref, 0, 200), $semana, self::ahora()]);
            return $saldo;
        });
    }

    // ------------------------------------------------------------------ encargos
    private static function secreto(): string
    {
        $c = Config::get('LIGA_SECRETO');
        if ($c !== '') return $c;
        $v = Db::valor("SELECT valor FROM liga_ajustes WHERE clave = 'secreto'");
        if ($v === null) {
            Db::q("INSERT OR IGNORE INTO liga_ajustes (clave, valor, actualizado) VALUES ('secreto', ?, ?)", [bin2hex(random_bytes(32)), time()]);
            $v = Db::valor("SELECT valor FROM liga_ajustes WHERE clave = 'secreto'");
        }
        return (string) $v;
    }

    /** Números al azar repetibles (0 <= x < 1) a partir de un texto. */
    private static function azar(string $semilla): \Closure
    {
        $i = 0;
        return function () use ($semilla, &$i): float { return hexdec(substr(hash('sha256', $semilla . '#' . $i++), 0, 13)) / 4503599627370496; };
    }

    /** Tipos de evento con los que se puede cumplir un criterio en una liga. */
    public static function tiposPara(array $c, int $liga): array
    {
        $base = self::TIPOS_LIGA[$liga];
        if (!empty($c['evento'])) {
            $t = array_values(array_intersect($c['evento'], array_keys(self::TIPOS)));
            return $t;
        }
        $minGen = [1, 1, 2, 2, 3][$liga];
        return array_values(array_filter($base, function ($k) use ($c, $minGen) {
            $t = self::TIPOS[$k];
            if ($t['diff'] < $minGen) return false;
            if (isset($c['min_diff']) && $t['diff'] < (int) $c['min_diff']) return false;
            if (!empty($c['outdoor']) && $t['outdoor'] <= 0) return false;
            if (($c['duelo'] ?? null) === 'won' && $t['diff'] < 2) return false;
            return true;
        }));
    }

    /** Crea el encargo n de (asociación, semana): plantilla y meta sorteadas con semilla propia, máximo 2 iguales activas. */
    private static function crearTarea(string $semana, int $asoc, int $liga, int $n, int $visible): void
    {
        $r = self::azar(self::secreto() . '|liga|' . $semana . '|' . $asoc . '|' . $n);
        $activas = array_count_values(array_column(Db::todas("SELECT plantilla FROM liga_tareas WHERE semana = ? AND asociacion_id = ? AND estado IN ('disponible', 'tomada')", [$semana, $asoc]), 'plantilla'));
        $opc = [];
        foreach (self::PLANTILLAS as $k => $p) {
            if ($p['meta'][$liga] === null || ($activas[$k] ?? 0) >= 2 || !self::tiposPara($p['criterio'], $liga)) continue;
            $nueva = $liga > 0 && $p['meta'][$liga - 1] === null;   // lo propio de esta liga sale más
            $opc[$k] = $nueva ? 1.6 : 1.0;
        }
        if (!$opc) $opc = ['sin_cortes' => 1.0];
        $x = $r() * array_sum($opc);
        $clave = array_key_last($opc);
        foreach ($opc as $k => $w) { $x -= $w; if ($x <= 0) { $clave = $k; break; } }
        $p = self::PLANTILLAS[$clave];
        $meta = (int) $p['meta'][$liga];
        if ($r() < 0.25) $meta++;   // a veces piden uno más (y pagan más)
        $puntos = (int) (round($p['pu'] * $meta * self::PUNTOS_MULT[$liga] * (0.9 + 0.2 * $r()) / 10) * 10);
        $titulo = $meta === 1 ? $p['uno'] : str_replace('{n}', (string) $meta, $p['titulo']);
        Db::q('INSERT INTO liga_tareas (semana, asociacion_id, n, plantilla, titulo, icono, criterio_json, meta, puntos, horas, estado, avance, visible_desde, creado)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'disponible\', 0, ?, ?)',
            [$semana, $asoc, $n, $clave, $titulo, $p['icono'], json_encode($p['criterio']), $meta, $puntos, min(self::HORAS_MAX, 12 + 6 * $meta), $visible, self::ahora()]);
    }

    private static function reemplazar(array $tarea): void
    {
        $liga = (int) (Db::valor('SELECT liga FROM liga_participantes WHERE semana = ? AND asociacion_id = ?', [$tarea['semana'], $tarea['asociacion_id']]) ?? 0);
        $n = (int) Db::valor('SELECT MAX(n) FROM liga_tareas WHERE semana = ? AND asociacion_id = ?', [$tarea['semana'], $tarea['asociacion_id']]) + 1;
        self::crearTarea((string) $tarea['semana'], (int) $tarea['asociacion_id'], $liga, $n, self::ahora() + self::REEMPLAZO_SEG);
    }

    /** Devuelve al tablero los encargos vencidos o tomados por alguien que ya no está en la asociación. */
    private static function mantener(string $semana, ?int $asoc = null): int
    {
        $t = self::ahora();
        $sql = "SELECT t.id FROM liga_tareas t WHERE t.semana = ? AND t.estado = 'tomada' AND (t.vence_en <= ? OR NOT EXISTS
                (SELECT 1 FROM asociacion_miembros m WHERE m.jugador_id = t.jugador_id AND m.asociacion_id = t.asociacion_id))";
        $p = [$semana, $t];
        if ($asoc !== null) { $sql .= ' AND t.asociacion_id = ?'; $p[] = $asoc; }
        $ids = array_column(Db::todas($sql, $p), 'id');
        foreach ($ids as $id) self::soltar((int) $id);
        return count($ids);
    }

    private static function soltar(int $tareaId): void
    {
        Db::q("UPDATE liga_tareas SET estado = 'disponible', jugador_id = NULL, tomada_en = NULL, vence_en = NULL, avance = 0 WHERE id = ? AND estado = 'tomada'", [$tareaId]);
        Db::q("UPDATE liga_intentos SET estado = 'vencido', cerrado = ? WHERE tarea_id = ? AND estado = 'emitido'", [self::ahora(), $tareaId]);
    }

    private static function miembroOFallo(int $jugador): array
    {
        $m = Social::miembro($jugador);
        Fallo::si(!$m, 'Únete a una asociación para jugar la Liga Semanal.', 409, ['codigo' => 'sin_asociacion']);
        return $m;
    }

    private static function tareaTomada(string $semana, int $jugador): ?array
    {
        return Db::fila("SELECT * FROM liga_tareas WHERE semana = ? AND jugador_id = ? AND estado = 'tomada' LIMIT 1", [$semana, $jugador]);
    }

    private static function usadas(string $semana, int $jugador): int
    {
        return (int) Db::valor('SELECT COALESCE(SUM(tareas_usadas), 0) FROM liga_miembro_semana WHERE semana = ? AND jugador_id = ?', [$semana, $jugador]);
    }

    /** POST /api/liga/tomar {tarea_id} */
    public static function tomar(int $jugador, int $tareaId): array
    {
        $sem = self::asegurarSemana();
        Db::tx(function () use ($jugador, $tareaId, $sem): void {
            $m = self::miembroOFallo($jugador);
            $asoc = (int) $m['asociacion_id'];
            self::inscribir($sem['semana'], $asoc);
            self::mantener($sem['semana'], $asoc);
            $t = Db::fila('SELECT * FROM liga_tareas WHERE id = ?', [$tareaId]);
            Fallo::si(!$t || $t['semana'] !== $sem['semana'] || (int) $t['asociacion_id'] !== $asoc, 'Ese encargo no está en el tablero de tu asociación.', 404, ['codigo' => 'no_existe']);
            Fallo::si((bool) self::tareaTomada($sem['semana'], $jugador), 'Ya tienes un encargo. Termínalo o abandónalo antes de tomar otro.', 409, ['codigo' => 'ya_tienes']);
            Fallo::si($t['estado'] !== 'disponible', $t['estado'] === 'tomada' ? 'Otra productora ya tomó ese encargo.' : 'Ese encargo ya no está disponible.', 409, ['codigo' => 'ocupada']);
            Fallo::si((int) $t['visible_desde'] > self::ahora(), 'Ese encargo todavía no aparece en el tablero.', 409, ['codigo' => 'espera']);
            Fallo::si(self::usadas($sem['semana'], $jugador) >= self::MAX_TAREAS_SEMANA, 'Ya usaste tus ' . self::MAX_TAREAS_SEMANA . ' encargos de esta semana. ¡Vuelve el lunes!', 409, ['codigo' => 'limite']);
            $vence = min((int) $sem['fin'], self::ahora() + (int) $t['horas'] * 3600);
            Db::q("UPDATE liga_tareas SET estado = 'tomada', jugador_id = ?, tomada_en = ?, vence_en = ?, avance = 0 WHERE id = ? AND estado = 'disponible'", [$jugador, self::ahora(), $vence, $tareaId]);
            Db::q('INSERT INTO liga_miembro_semana (semana, jugador_id, asociacion_id, tareas_usadas) VALUES (?, ?, ?, 1)
                   ON CONFLICT (semana, jugador_id, asociacion_id) DO UPDATE SET tareas_usadas = tareas_usadas + 1', [$sem['semana'], $jugador, $asoc]);
        });
        return self::estado($jugador);
    }

    /** POST /api/liga/abandonar — el encargo vuelve al tablero (con el avance en 0); el cupo de la semana ya se usó. */
    public static function abandonar(int $jugador): array
    {
        $sem = self::asegurarSemana();
        Db::tx(function () use ($jugador, $sem): void {
            $t = self::tareaTomada($sem['semana'], $jugador);
            Fallo::si(!$t, 'No tienes ningún encargo tomado.', 409, ['codigo' => 'sin_tarea']);
            self::soltar((int) $t['id']);
        });
        return self::estado($jugador);
    }

    /** POST /api/liga/descartar {tarea_id} — solo el presidente, solo encargos que nadie tomó. Llega otro a los 10 minutos. */
    public static function descartar(int $jugador, int $tareaId): array
    {
        $sem = self::asegurarSemana();
        Db::tx(function () use ($jugador, $tareaId, $sem): void {
            $m = self::miembroOFallo($jugador);
            Fallo::si($m['cargo'] !== 'presidente', 'Solo el presidente de la asociación puede descartar encargos.', 403, ['codigo' => 'no_presidente']);
            $t = Db::fila('SELECT * FROM liga_tareas WHERE id = ?', [$tareaId]);
            Fallo::si(!$t || $t['semana'] !== $sem['semana'] || (int) $t['asociacion_id'] !== (int) $m['asociacion_id'], 'Ese encargo no está en el tablero de tu asociación.', 404, ['codigo' => 'no_existe']);
            Fallo::si($t['estado'] !== 'disponible' || (int) $t['visible_desde'] > self::ahora(), 'Solo se pueden descartar encargos libres (que nadie tomó).', 409, ['codigo' => 'ocupada']);
            Db::q("UPDATE liga_tareas SET estado = 'descartada' WHERE id = ?", [$tareaId]);
            self::reemplazar($t);
        });
        return self::estado($jugador);
    }

    // ------------------------------------------------------------------ intentos de evento
    /** Revisa y limpia el equipo que el juego registra para el intento (el validador revisa lo demás). */
    public static function limpiarEquipo(mixed $e): array
    {
        $mal = fn(string $t) => throw new Fallo('El equipo no es válido: ' . $t, 400, ['codigo' => 'equipo']);
        if (!is_array($e) || !is_array($e['staff'] ?? null) || !is_array($e['equip'] ?? null)) $mal('falta staff o equip.');
        if (strlen((string) json_encode($e)) > 20000) $mal('demasiado grande.');
        $staff = array_values($e['staff']); $equip = array_values($e['equip']);
        if (count($staff) < 1 || count($staff) > 12) $mal('de 1 a 12 personas.');
        if (count($equip) < 1 || count($equip) > 40) $mal('de 1 a 40 equipos.');
        $duenos = 0; $s = [];
        foreach ($staff as $i => $p) {
            if (!is_array($p) || !is_string($p['role'] ?? null) || !preg_match('/^[a-z_]{2,24}$/', $p['role'])) $mal('persona ' . ($i + 1) . ' sin rol.');
            if (!is_int($p['skill'] ?? null) || $p['skill'] < 1 || $p['skill'] > 5) $mal('persona ' . ($i + 1) . ': habilidad de 1 a 5.');
            $mor = $p['morale'] ?? 80;
            if (!is_int($mor) || $mor < 0 || $mor > 100) $mal('persona ' . ($i + 1) . ': ánimo de 0 a 100.');
            $o = ['role' => $p['role'], 'skill' => $p['skill'], 'morale' => $mor];
            if (($p['owner'] ?? false) === true) { $o['owner'] = true; $duenos++; }
            if (is_string($p['name'] ?? null) && $p['name'] !== '') $o['name'] = mb_substr($p['name'], 0, 40);
            if (is_string($p['tier'] ?? null) && preg_match('/^[a-z_]{2,20}$/', $p['tier'])) $o['tier'] = $p['tier'];
            $s[] = $o;
        }
        if ($duenos > 1) $mal('solo un dueño.');
        $q = [];
        foreach ($equip as $i => $x) {
            if (!is_array($x) || !is_string($x['type'] ?? null) || !preg_match('/^[a-z0-9_]{2,40}$/', $x['type'])) $mal('equipo ' . ($i + 1) . ' sin tipo.');
            if (!is_int($x['condition'] ?? null) || $x['condition'] < 1 || $x['condition'] > 100) $mal('equipo ' . ($i + 1) . ': estado de 1 a 100.');
            $q[] = ['type' => $x['type'], 'condition' => $x['condition']];
        }
        return ['staff' => $s, 'equip' => $q];
    }

    private static function firma(int $id, int $jugador, int $semilla, int $tarea): string
    {
        return hash_hmac('sha256', 'liga|' . $id . '|' . $jugador . '|' . $semilla . '|' . $tarea, self::secreto());
    }

    /**
     * POST /api/liga/intento {tipo?, equipo} — entrega semilla y contrato para jugar el encargo tomado y guarda el
     * equipo registrado. Un intento abierto por jugador (pedir otro vence el anterior). Devuelve el intento tal como lo
     * usa server/validador/intento.js (Intento.crearEstado) + id, firma y vence.
     */
    public static function emitirIntento(int $jugador, array $in): array
    {
        $sem = self::asegurarSemana();
        $equipo = self::limpiarEquipo($in['equipo'] ?? null);
        return Db::tx(function () use ($jugador, $in, $equipo, $sem): array {
            $m = self::miembroOFallo($jugador);
            self::mantener($sem['semana'], (int) $m['asociacion_id']);
            $t = self::tareaTomada($sem['semana'], $jugador);
            Fallo::si(!$t, 'Toma un encargo del tablero antes de jugar.', 409, ['codigo' => 'sin_tarea']);
            $liga = (int) (Db::valor('SELECT liga FROM liga_participantes WHERE semana = ? AND asociacion_id = ?', [$sem['semana'], $t['asociacion_id']]) ?? 0);
            $c = json_decode((string) $t['criterio_json'], true) ?: [];
            $tipos = self::tiposPara($c, $liga);
            $tipo = is_string($in['tipo'] ?? null) && $in['tipo'] !== '' ? $in['tipo'] : $tipos[random_int(0, count($tipos) - 1)];
            Fallo::si(!in_array($tipo, $tipos, true), 'Ese tipo de evento no sirve para este encargo.', 400, ['codigo' => 'tipo']);
            $T = self::TIPOS[$tipo];
            $p = fn(float $x) => $x >= 1 || ($x > 0 && random_int(1, 1000) <= (int) round($x * 1000));
            $rival = ($c['duelo'] ?? null) === 'won';
            $diff = min(5, $T['diff'] + ($rival ? 1 : 0));
            $contrato = [
                'type' => $tipo, 'client' => $T['clientes'][random_int(0, count($T['clientes']) - 1)],
                'cams' => random_int($T['cams'][0], $T['cams'][1]), 'audio' => $T['audio'],
                'stream' => !empty($c['stream']) || !empty($c['sin_cortes']) || $p($T['stream']),
                'outdoor' => !empty($c['outdoor']) || $p($T['outdoor']),
                'diff' => $diff, 'pay' => (int) (round(random_int($T['pay'][0], $T['pay'][1]) * ($rival ? 1.3 : 1) / 10) * 10),
                'rival' => $rival, 'liga' => true,
            ];
            if ($rival) $contrato['rivalQuality'] = max(45, min(95, 40 + 5 * $liga + 3 * $diff + random_int(-6, 8)));
            $fama = (int) (Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$jugador]) ?? 0);
            $contexto = ['fama' => max(0, min(100, $fama)), 'dinero' => 1000, 'stock' => ['cable' => 1, 'battery' => 1]];
            $vip = Monedero::vipActivo($jugador);
            $semilla = random_int(1, 2147483646);
            $t0 = self::ahora();
            $vence = min((int) $sem['fin'], $t0 + self::INTENTO_SEG);
            Db::q("UPDATE liga_intentos SET estado = 'vencido', cerrado = ? WHERE jugador_id = ? AND estado = 'emitido'", [$t0, $jugador]);
            Db::q('INSERT INTO liga_intentos (jugador_id, tarea_id, semana, semilla, contrato_json, equipo_json, contexto_json, vip, estado, creado, vence)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'emitido\', ?, ?)',
                [$jugador, $t['id'], $sem['semana'], $semilla, json_encode($contrato, JSON_UNESCAPED_UNICODE), json_encode($equipo, JSON_UNESCAPED_UNICODE), json_encode($contexto), $vip ? 1 : 0, $t0, $vence]);
            $id = Db::ultimoId();
            return ['ok' => true, 'intento' => ['id' => $id, 'tarea_id' => (int) $t['id'], 'seed' => $semilla, 'contrato' => $contrato, 'equipo' => $equipo,
                'contexto' => $contexto, 'vip' => $vip, 'firma' => self::firma($id, $jugador, $semilla, (int) $t['id']), 'vence' => Db::iso($vence), 'modo' => self::modoValidacion()]];
        });
    }

    /** Lo que dice el juego que sacó (modo firma). Revisa que sea coherente con el contrato. */
    private static function resultadoCliente(mixed $r, array $contrato, int $nDecisiones): array
    {
        $mal = fn(string $t) => throw new Fallo('El resultado no es válido: ' . $t, 422, ['codigo' => 'resultado']);
        if (!is_array($r)) $mal('falta.');
        $cal = $r['calidad'] ?? ($r['quality'] ?? null);
        $est = $r['estrellas'] ?? ($r['stars'] ?? null);
        if (!is_int($cal) || $cal < 0 || $cal > 100) $mal('calidad de 0 a 100.');
        if (!is_int($est) || $est < 1 || $est > 5) $mal('estrellas de 1 a 5.');
        $E = self::ESTRELLAS;
        $deberia = $cal >= $E[0] ? 5 : ($cal >= $E[1] ? 4 : ($cal >= $E[2] ? 3 : ($cal >= $E[3] ? 2 : 1)));
        if ($deberia !== $est) $mal('las estrellas no corresponden a la calidad.');
        $duelo = null;
        if (!empty($contrato['rival'])) {
            $duelo = $cal > (int) $contrato['rivalQuality'] ? 'won' : 'lost';
            $dijo = $r['duelo'] ?? ($r['duel'] ?? $duelo);
            if ($dijo !== $duelo) $mal('el duelo no corresponde a la calidad.');
        }
        $inc = [];
        foreach (is_array($r['incidentes'] ?? null) ? $r['incidentes'] : [] as $x) {
            if (!is_array($x) || !is_string($x['clave'] ?? null) || !preg_match('/^[a-z_]{2,24}$/', $x['clave']) || !is_int($x['q'] ?? null) || abs($x['q']) > 100) $mal('imprevisto mal formado.');
            $inc[] = ['clave' => $x['clave'], 'q' => $x['q']];
        }
        if (count($inc) !== $nDecisiones) $mal('debe haber un imprevisto por decisión.');
        return ['calidad' => $cal, 'estrellas' => $est, 'duelo' => $duelo, 'incidentes' => $inc];
    }

    /**
     * POST /api/liga/completar {intento_id, decisiones: [n...], resultado: {calidad, estrellas, duelo?, incidentes?: [{clave, q}]}, firma}
     * Una semilla, un intento: se marca usado al llegar aunque no sirva. Devuelve {ok, intento: {...}, tarea_completada,
     * puntos, liga: estado}. Si el validador no responde: 202 con intento.estado 'pendiente' (se revalida después).
     */
    public static function completar(int $jugador, array $in): array
    {
        self::asegurarSemana();
        $id = $in['intento_id'] ?? null;
        if (is_string($id) && ctype_digit($id)) $id = (int) $id;
        Fallo::si(!is_int($id) || $id < 1, 'Falta "intento_id".', 400);
        $dec = $in['decisiones'] ?? null;
        Fallo::si(!is_array($dec) || !array_is_list($dec) || count($dec) > 20 || array_filter($dec, fn($d) => !is_int($d) || $d < 0 || $d > 9),
            'Las decisiones deben ser una lista de números (una por imprevisto).', 400, ['codigo' => 'decisiones']);
        $modo = self::modoValidacion();
        // 1) Marcar el intento como usado (con lo que mandó el juego). Los rechazos se guardan y el error se lanza
        //    DESPUÉS de la transacción (si se lanzara adentro, se desharía la marca de "usado").
        $paso = Db::tx(function () use ($jugador, $id, $in, $dec, $modo): array {
            $it = Db::fila('SELECT * FROM liga_intentos WHERE id = ?', [$id]);
            Fallo::si(!$it || (int) $it['jugador_id'] !== $jugador, 'Ese intento no existe.', 404, ['codigo' => 'no_existe']);
            Fallo::si($it['estado'] !== 'emitido', 'Ese intento ya se usó o se venció. Pide uno nuevo.', 409, ['codigo' => 'usado']);
            $t0 = self::ahora();
            if ((int) $it['vence'] <= $t0) {
                Db::q("UPDATE liga_intentos SET estado = 'vencido', cerrado = ? WHERE id = ?", [$t0, $id]);
                return ['error' => new Fallo('El intento se venció. Pide uno nuevo.', 409, ['codigo' => 'vencido'])];
            }
            $firmaOk = is_string($in['firma'] ?? null) && hash_equals(self::firma($id, $jugador, (int) $it['semilla'], (int) $it['tarea_id']), $in['firma']);
            if ($modo === 'firma' && !$firmaOk) {
                Db::q("UPDATE liga_intentos SET estado = 'rechazado', modo = 'firma', motivo = 'firma_invalida', decisiones_json = ?, cerrado = ? WHERE id = ?", [json_encode($dec), $t0, $id]);
                return ['error' => new Fallo('El intento no tiene la firma del servidor.', 403, ['codigo' => 'firma'])];
            }
            $cliente = is_array($in['resultado'] ?? null) ? $in['resultado'] : null;
            Db::q("UPDATE liga_intentos SET estado = 'pendiente', modo = ?, decisiones_json = ?, cliente_json = ?, cerrado = ? WHERE id = ?",
                [$modo, json_encode($dec), $cliente === null ? null : mb_substr((string) json_encode($cliente, JSON_UNESCAPED_UNICODE), 0, 5000), $t0, $id]);
            return ['it' => Db::fila('SELECT * FROM liga_intentos WHERE id = ?', [$id])];
        });
        if (isset($paso['error'])) throw $paso['error'];
        $it = $paso['it'];
        // 2) Resultado de verdad
        $contrato = json_decode((string) $it['contrato_json'], true);
        if ($modo === 'firma') {
            try {
                $res = self::resultadoCliente($in['resultado'] ?? null, $contrato, count($dec));
            } catch (Fallo $e) {
                Db::q("UPDATE liga_intentos SET estado = 'rechazado', motivo = ? WHERE id = ?", ['resultado: ' . $e->getMessage(), $id]);
                throw $e;
            }
            $r = self::aplicar($id, 'firmado', $res, null, false, null);
        } else {
            $r = self::validarYAplicar($it);
        }
        $ok = ['ok' => true, 'intento' => $r['intento'], 'tarea_completada' => $r['completada'], 'puntos' => $r['puntos'], 'liga' => self::estado($jugador)];
        return $ok;
    }

    /** Intento listo para el validador (lo que viene del juego son solo las decisiones y el resultado que dice). */
    public static function intentoParaValidador(array $it): array
    {
        $o = ['seed' => (int) $it['semilla'], 'contrato' => json_decode((string) $it['contrato_json'], true), 'equipo' => json_decode((string) $it['equipo_json'], true),
              'contexto' => json_decode((string) $it['contexto_json'], true), 'vip' => (bool) $it['vip'], 'decisiones' => json_decode((string) $it['decisiones_json'], true) ?? []];
        $c = $it['cliente_json'] !== null ? json_decode((string) $it['cliente_json'], true) : null;
        if (is_array($c)) {
            $q = $c['calidad'] ?? ($c['quality'] ?? null); $s = $c['estrellas'] ?? ($c['stars'] ?? null);
            if (is_int($q) && is_int($s)) $o['cliente_resultado'] = ['quality' => $q, 'stars' => $s];
        }
        return $o;
    }

    private static function llamarValidador(array $intento): array
    {
        $f = self::$validador;
        if ($f === null && class_exists(__NAMESPACE__ . '\\Validador') && method_exists(__NAMESPACE__ . '\\Validador', 'validar')) $f = [__NAMESPACE__ . '\\Validador', 'validar'];
        if ($f === null) $f = [self::class, 'validarConNode'];
        try {
            $r = $f($intento);
        } catch (\Throwable $e) {
            return ['valido' => false, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => mb_substr($e->getMessage(), 0, 200)]];
        }
        return is_array($r) ? $r : ['valido' => false, 'detalle' => ['motivo' => 'validador_caido']];
    }

    /** Repite el intento (estado 'pendiente') y aplica el resultado del servidor. Si el validador no está, sigue pendiente. */
    private static function validarYAplicar(array $it): array
    {
        $v = self::llamarValidador(self::intentoParaValidador($it));
        $motivo = (string) ($v['detalle']['motivo'] ?? '');
        if ($motivo === 'validador_caido' || $motivo === 'logica_no_carga') {
            return ['intento' => self::intentoJson(Db::fila('SELECT * FROM liga_intentos WHERE id = ?', [$it['id']])), 'completada' => false, 'puntos' => 0];
        }
        if (!isset($v['calidad']) || $v['calidad'] === null) {
            Db::q("UPDATE liga_intentos SET estado = 'rechazado', motivo = ?, resultado_json = ?, version_logica = ? WHERE id = ? AND estado = 'pendiente'",
                [$motivo !== '' ? $motivo : 'jugada_imposible', mb_substr((string) json_encode($v, JSON_UNESCAPED_UNICODE), 0, 20000), $v['version_logica'] ?? null, $it['id']]);
            return ['intento' => self::intentoJson(Db::fila('SELECT * FROM liga_intentos WHERE id = ?', [$it['id']])), 'completada' => false, 'puntos' => 0];
        }
        $res = ['calidad' => (int) $v['calidad'], 'estrellas' => (int) $v['estrellas'], 'duelo' => $v['detalle']['duelo'] ?? null,
                'incidentes' => array_map(fn($x) => ['clave' => (string) ($x['clave'] ?? ''), 'q' => (int) ($x['q'] ?? 0)], is_array($v['detalle']['incidentes'] ?? null) ? $v['detalle']['incidentes'] : [])];
        // Vale el resultado del servidor. Si el juego dijo otra cosa (y no es por otra versión de la lógica) queda marcado.
        $sosp = ($v['coincide'] ?? null) === false && empty($v['detalle']['version_distinta']);
        return self::aplicar((int) $it['id'], 'validado', $res, $v['version_logica'] ?? null, $sosp, $sosp ? 'resultado_no_coincide' : null);
    }

    /** Evalúa el intento contra su encargo y suma avance / completa el encargo / da puntos. */
    private static function aplicar(int $id, string $estado, array $res, ?string $version, bool $sospechoso, ?string $motivo): array
    {
        return Db::tx(function () use ($id, $estado, $res, $version, $sospechoso, $motivo): array {
            $it = Db::fila('SELECT * FROM liga_intentos WHERE id = ?', [$id]);
            if (!$it || $it['estado'] !== 'pendiente') return ['intento' => $it ? self::intentoJson($it) : null, 'completada' => false, 'puntos' => 0];
            $t = Db::fila('SELECT * FROM liga_tareas WHERE id = ?', [$it['tarea_id']]);
            $sem = Db::fila('SELECT * FROM liga_semanas WHERE semana = ?', [$it['semana']]);
            $contrato = json_decode((string) $it['contrato_json'], true);
            $equipo = json_decode((string) $it['equipo_json'], true);
            $cuenta = self::cumple(json_decode((string) $t['criterio_json'], true) ?: [], $contrato, $res, $equipo);
            $nota = $motivo;
            if ($t['estado'] !== 'tomada' || (int) $t['jugador_id'] !== (int) $it['jugador_id']) { $cuenta = false; $nota = $nota ?? 'encargo_ya_no_es_tuyo'; }
            elseif (!$sem || $sem['estado'] === 'cerrada' || (int) $it['cerrado'] >= (int) $sem['fin']) { $cuenta = false; $nota = $nota ?? 'semana_terminada'; }
            elseif (!$cuenta) $nota = $nota ?? 'no_cumple';
            Db::q('UPDATE liga_intentos SET estado = ?, resultado_json = ?, calidad = ?, estrellas = ?, cuenta = ?, sospechoso = ?, motivo = ?, version_logica = COALESCE(?, version_logica) WHERE id = ?',
                [$estado, json_encode($res, JSON_UNESCAPED_UNICODE), $res['calidad'], $res['estrellas'], $cuenta ? 1 : 0, $sospechoso ? 1 : 0, $nota, $version, $id]);
            $completada = false; $puntos = 0;
            if ($cuenta) {
                $avance = (int) $t['avance'] + 1;
                if ($avance >= (int) $t['meta']) {
                    $completada = true; $puntos = (int) $t['puntos'];
                    $t0 = self::ahora();
                    Db::q("UPDATE liga_tareas SET avance = ?, estado = 'completada', completada_en = ? WHERE id = ?", [$avance, $t0, $t['id']]);
                    Db::q('UPDATE liga_participantes SET puntos = puntos + ?, tareas_completadas = tareas_completadas + 1, actualizado = ? WHERE semana = ? AND asociacion_id = ?',
                        [$puntos, $t0, $t['semana'], $t['asociacion_id']]);
                    Db::q('INSERT INTO liga_miembro_semana (semana, jugador_id, asociacion_id, tareas_usadas, tareas_completadas, puntos) VALUES (?, ?, ?, 0, 1, ?)
                           ON CONFLICT (semana, jugador_id, asociacion_id) DO UPDATE SET tareas_completadas = tareas_completadas + 1, puntos = puntos + excluded.puntos',
                        [$t['semana'], $it['jugador_id'], $t['asociacion_id'], $puntos]);
                    self::reemplazar($t);
                } else {
                    Db::q('UPDATE liga_tareas SET avance = ? WHERE id = ?', [$avance, $t['id']]);
                }
            }
            return ['intento' => self::intentoJson(Db::fila('SELECT * FROM liga_intentos WHERE id = ?', [$id])), 'completada' => $completada, 'puntos' => $puntos];
        });
    }

    /** ¿El evento cumple el criterio del encargo? (igual que Liga.cumple de js/liga.js) */
    public static function cumple(array $c, array $contrato, array $res, array $equipo): bool
    {
        if ((int) ($res['estrellas'] ?? 0) < max(1, (int) ($c['min_estrellas'] ?? 1))) return false;
        if (!empty($c['evento']) && !in_array($contrato['type'] ?? '', (array) $c['evento'], true)) return false;
        if (!empty($c['stream']) && empty($contrato['stream'])) return false;
        if (!empty($c['outdoor']) && empty($contrato['outdoor'])) return false;
        if (isset($c['min_diff']) && (int) ($contrato['diff'] ?? 0) < (int) $c['min_diff']) return false;
        if (($c['duelo'] ?? null) === 'won' && ($res['duelo'] ?? null) !== 'won') return false;
        if (!empty($c['sin_cortes'])) {
            if (empty($contrato['stream'])) return false;
            foreach ($res['incidentes'] ?? [] as $x) if (in_array($x['clave'] ?? '', self::CORTES, true) && (int) ($x['q'] ?? 0) < 0) return false;
        }
        if (!empty($c['senior'])) {
            $hay = false;
            foreach ($equipo['staff'] ?? [] as $p) if (in_array($p['tier'] ?? '', ['senior', 'internacional'], true) || (int) ($p['skill'] ?? 0) >= 4) $hay = true;
            if (!$hay) return false;
        }
        return true;
    }

    private static function intentoJson(array $it): array
    {
        return ['id' => (int) $it['id'], 'tarea_id' => (int) $it['tarea_id'], 'estado' => $it['estado'], 'modo' => $it['modo'],
                'calidad' => $it['calidad'] === null ? null : (int) $it['calidad'], 'estrellas' => $it['estrellas'] === null ? null : (int) $it['estrellas'],
                'cuenta' => (bool) $it['cuenta'], 'motivo' => $it['motivo'], 'vence' => Db::iso((int) $it['vence'])];
    }

    /**
     * Vuelve a pasar por el validador los intentos 'pendiente' (validador caído) y, con $firmados, los 'firmado' de las
     * últimas semanas (para encontrar trampas cuando llegue el validador: se marcan sospechoso, no se quitan puntos).
     */
    public static function revalidar(int $max = 100, bool $firmados = false): array
    {
        self::preparar();
        $o = ['pendientes' => 0, 'aplicados' => 0, 'revisados' => 0, 'sospechosos' => 0];
        if (self::modoValidacion() === 'repeticion') {
            foreach (Db::todas("SELECT * FROM liga_intentos WHERE estado = 'pendiente' AND modo = 'repeticion' ORDER BY id LIMIT ?", [$max]) as $it) {
                $o['pendientes']++;
                $r = self::validarYAplicar($it);
                if (($r['intento']['estado'] ?? '') !== 'pendiente') $o['aplicados']++;
            }
        }
        if ($firmados) {
            foreach (Db::todas("SELECT * FROM liga_intentos WHERE estado = 'firmado' AND sospechoso = 0 AND (motivo IS NULL OR motivo NOT LIKE 'revisado%') ORDER BY id LIMIT ?", [$max]) as $it) {
                $v = self::llamarValidador(self::intentoParaValidador($it));
                if (($v['detalle']['motivo'] ?? '') === 'validador_caido') break;
                $o['revisados']++;
                $bien = isset($v['calidad']) && $v['calidad'] !== null && (int) $v['calidad'] === (int) $it['calidad'] && (int) $v['estrellas'] === (int) $it['estrellas'];
                if (!$bien) $o['sospechosos']++;
                Db::q('UPDATE liga_intentos SET sospechoso = ?, motivo = ?, version_logica = COALESCE(?, version_logica) WHERE id = ?',
                    [$bien ? 0 : 1, $bien ? 'revisado_ok' : 'revisado_no_coincide: ' . ($v['detalle']['motivo'] ?? 'calidad ' . ($v['calidad'] ?? 'null')), $v['version_logica'] ?? null, $it['id']]);
            }
        }
        return $o;
    }

    // ------------------------------------------------------------------ estado (GET /api/liga)
    private static function ligaJson(int $l): array
    {
        return ['indice' => $l] + self::LIGAS[$l];
    }

    private static function nombreJugador(?int $id): ?array
    {
        if ($id === null) return null;
        $j = Db::fila('SELECT id, alias, nombre FROM jugadores WHERE id = ?', [$id]);
        return $j ? ['id' => (int) $j['id'], 'nombre' => Social::nombrePublico($j['alias'], $j['nombre'])] : ['id' => $id, 'nombre' => 'Productora'];
    }

    private static function tareaJson(array $t, int $yo, int $liga): array
    {
        $now = self::ahora();
        if ((int) $t['visible_desde'] > $now) {
            return ['id' => (int) $t['id'], 'n' => (int) $t['n'], 'estado' => 'espera', 'aparece_en' => Db::iso((int) $t['visible_desde']), 'aparece_seg' => (int) $t['visible_desde'] - $now];
        }
        $c = json_decode((string) $t['criterio_json'], true) ?: [];
        return ['id' => (int) $t['id'], 'n' => (int) $t['n'], 'estado' => $t['estado'], 'plantilla' => $t['plantilla'], 'titulo' => $t['titulo'], 'icono' => $t['icono'],
                'meta' => (int) $t['meta'], 'avance' => (int) $t['avance'], 'puntos' => (int) $t['puntos'], 'horas' => (int) $t['horas'], 'criterio' => $c,
                'tipos' => self::tiposPara($c, $liga), 'jugador' => $t['estado'] === 'tomada' ? self::nombreJugador((int) $t['jugador_id']) : null,
                'mia' => $t['estado'] === 'tomada' && (int) $t['jugador_id'] === $yo,
                'tomada_en' => Db::iso($t['tomada_en'] === null ? null : (int) $t['tomada_en']),
                'vence' => Db::iso($t['vence_en'] === null ? null : (int) $t['vence_en']), 'vence_seg' => $t['vence_en'] === null ? null : max(0, (int) $t['vence_en'] - $now)];
    }

    /** Ranking del grupo: [{posicion, asociacion_id, nombre, siglas, color, servidor, puntos, banderas, mia, zona}] */
    public static function ranking(int $grupo, ?int $miAsoc = null): array
    {
        $ps = Db::todas('SELECT p.*, a.nombre AS a_nombre, a.siglas AS a_siglas, a.color AS a_color, s.nombre AS servidor FROM liga_participantes p
                         LEFT JOIN asociaciones a ON a.id = p.asociacion_id LEFT JOIN servidores s ON s.id = p.servidor_id
                         WHERE p.grupo_id = ? ORDER BY p.puntos DESC, p.actualizado ASC, p.asociacion_id ASC', [$grupo]);
        $n = count($ps);
        $cupo = $n >= 6 ? 2 : ($n >= 3 ? 1 : 0);
        $o = [];
        foreach ($ps as $i => $p) {
            $liga = (int) $p['liga'];
            $b = 0;
            foreach (self::banderas($liga) as $x) if ((int) $p['puntos'] >= $x['puntos']) $b++;
            $zona = null;
            if ($i < $cupo && $liga < 4 && (int) $p['puntos'] > 0) $zona = 'sube';
            elseif ($liga > 0 && $i >= $n - $cupo && $i >= $cupo) $zona = 'baja';
            $o[] = ['posicion' => $i + 1, 'asociacion_id' => (int) $p['asociacion_id'], 'nombre' => $p['a_nombre'] ?? $p['nombre'], 'siglas' => $p['a_siglas'] ?? $p['siglas'],
                    'color' => $p['a_color'] ?? $p['color'], 'servidor' => $p['servidor'], 'liga' => $liga, 'puntos' => (int) $p['puntos'],
                    'tareas' => (int) $p['tareas_completadas'], 'banderas' => $b, 'mia' => (int) $p['asociacion_id'] === $miAsoc, 'zona' => $zona];
        }
        return $o;
    }

    /** GET /api/liga */
    public static function estado(int $jugador): array
    {
        $sem = self::asegurarSemana();
        $now = self::ahora();
        $semana = ['id' => $sem['semana'], 'inicio' => Db::iso((int) $sem['inicio']), 'fin' => Db::iso((int) $sem['fin'] - 1), 'quedan_seg' => max(0, (int) $sem['fin'] - $now)];
        $base = ['ok' => true, 'semana' => $semana, 'ligas' => array_map(fn($i) => self::ligaJson($i), array_keys(self::LIGAS)), 'fichas' => self::fichas($jugador),
                 'validacion' => self::modoValidacion(), 'max_tareas' => self::MAX_TAREAS_SEMANA];
        $m = Social::miembro($jugador);
        if (!$m) return $base + ['sin_asociacion' => true, 'asociacion' => null];
        $asoc = (int) $m['asociacion_id'];
        $part = self::inscribir($sem['semana'], $asoc);
        Db::tx(fn() => self::mantener($sem['semana'], $asoc));
        $liga = (int) $part['liga'];
        $a = Db::fila('SELECT * FROM asociaciones WHERE id = ?', [$asoc]);
        $tareas = Db::todas("SELECT * FROM liga_tareas WHERE semana = ? AND asociacion_id = ? AND estado IN ('disponible', 'tomada') ORDER BY n", [$sem['semana'], $asoc]);
        $tablero = array_map(fn($t) => self::tareaJson($t, $jugador, $liga), $tareas);
        $mia = self::tareaTomada($sem['semana'], $jugador);
        $miTarea = null;
        if ($mia && (int) $mia['asociacion_id'] === $asoc) {
            $miTarea = self::tareaJson($mia, $jugador, $liga);
            $ab = Db::fila("SELECT * FROM liga_intentos WHERE jugador_id = ? AND tarea_id = ? AND estado IN ('emitido', 'pendiente') ORDER BY id DESC LIMIT 1", [$jugador, $mia['id']]);
            $miTarea['intento_abierto'] = $ab ? self::intentoJson($ab) : null;
        }
        $yo = Db::fila('SELECT COALESCE(SUM(tareas_usadas), 0) AS usadas, COALESCE(SUM(tareas_completadas), 0) AS hechas, COALESCE(SUM(puntos), 0) AS puntos FROM liga_miembro_semana WHERE semana = ? AND jugador_id = ?', [$sem['semana'], $jugador]);
        $hechas = array_map(fn($t) => ['id' => (int) $t['id'], 'titulo' => $t['titulo'], 'icono' => $t['icono'], 'puntos' => (int) $t['puntos'], 'jugador' => self::nombreJugador((int) $t['jugador_id']),
            'completada_en' => Db::iso((int) $t['completada_en'])],
            Db::todas("SELECT * FROM liga_tareas WHERE semana = ? AND asociacion_id = ? AND estado = 'completada' ORDER BY completada_en DESC LIMIT 20", [$sem['semana'], $asoc]));
        $puntos = (int) $part['puntos'];
        $banderas = array_map(fn($b) => $b + ['alcanzada' => $puntos >= $b['puntos']], self::banderas($liga));
        $ant = Db::fila('SELECT * FROM liga_participantes WHERE semana = ? AND asociacion_id = ? AND posicion IS NOT NULL', [self::semanaAnterior($sem['semana']), $asoc]);
        $ultima = null;
        if ($ant) {
            $gan = (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM liga_fichas_mov WHERE jugador_id = ? AND semana = ? AND cambio > 0', [$jugador, $ant['semana']]);
            $ultima = ['semana' => $ant['semana'], 'posicion' => (int) $ant['posicion'], 'resultado' => $ant['resultado'], 'puntos' => (int) $ant['puntos'], 'fichas_ganadas' => $gan,
                       'liga_nueva' => self::ligaJson((int) $ant['liga_nueva'])];
        }
        $g = Db::fila('SELECT * FROM liga_grupos WHERE id = ?', [$part['grupo_id']]);
        return $base + [
            'liga' => self::ligaJson($liga),
            'asociacion' => ['id' => $asoc, 'nombre' => $a['nombre'], 'siglas' => $a['siglas'], 'color' => $a['color'], 'puntos' => $puntos,
                             'tareas_completadas' => (int) $part['tareas_completadas'], 'mi_cargo' => $m['cargo'], 'puede_descartar' => $m['cargo'] === 'presidente'],
            'banderas' => $banderas,
            'tablero' => $tablero,
            'mi_tarea' => $miTarea,
            'mis_tareas' => ['usadas' => (int) $yo['usadas'], 'max' => self::MAX_TAREAS_SEMANA, 'completadas' => (int) $yo['hechas'], 'puntos' => (int) $yo['puntos']],
            'hechas' => $hechas,
            'grupo' => ['id' => (int) $g['id'], 'numero' => (int) $g['numero'], 'liga' => self::ligaJson((int) $g['liga']), 'ranking' => self::ranking((int) $g['id'], $asoc)],
            'ultima_semana' => $ultima,
        ];
    }

    // ------------------------------------------------------------------ tienda
    private static function refuerzosSoportados(): bool
    {
        $c = array_column(Db::todas('PRAGMA table_info(entregas)'), 'name');
        return in_array('nivel', $c, true) && in_array('eventos', $c, true);
    }

    /** GET /api/liga/tienda */
    public static function tienda(int $jugador): array
    {
        $sem = self::asegurarSemana();
        $m = Social::miembro($jugador);
        $liga = $m ? self::ligaDe((int) $m['asociacion_id']) : 0;
        $fichas = self::fichas($jugador);
        $ref = self::refuerzosSoportados();
        $mios = array_column(Db::todas('SELECT cosmetico FROM liga_cosmeticos WHERE jugador_id = ?', [$jugador]), 'cosmetico');
        $art = [];
        foreach (self::TIENDA as $id => $x) {
            $comp = (int) Db::valor('SELECT COUNT(*) FROM liga_compras WHERE jugador_id = ? AND semana = ? AND articulo = ?', [$jugador, $sem['semana'], $id]);
            $motivo = null;
            if (!empty($x['cosmetico']) && in_array($id, $mios, true)) $motivo = 'Ya lo tienes';
            elseif (($x['entrega']['tipo'] ?? '') === 'refuerzo' && !$ref) $motivo = 'Muy pronto';
            elseif (($x['liga_min'] ?? 0) > $liga) $motivo = 'Desde la ' . self::LIGAS[$x['liga_min']]['nombre'];
            elseif ($x['max_semana'] !== null && $comp >= $x['max_semana']) $motivo = 'Límite de la semana';
            $art[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'icono' => $x['icono'], 'fichas' => $x['fichas'],
                      'tipo' => !empty($x['cosmetico']) ? 'cosmetico' : $x['entrega']['tipo'], 'max_semana' => $x['max_semana'], 'compradas_semana' => $comp,
                      'disponible' => $motivo === null, 'alcanza' => $fichas >= $x['fichas'], 'motivo' => $motivo];
        }
        return ['ok' => true, 'fichas' => $fichas, 'liga' => self::ligaJson($liga), 'articulos' => $art, 'cosmeticos' => $mios,
                'historial' => array_map(fn($r) => ['cambio' => (int) $r['cambio'], 'saldo' => (int) $r['saldo'], 'motivo' => $r['motivo'], 'semana' => $r['semana'], 'creado' => Db::iso((int) $r['creado'])],
                    Db::todas('SELECT * FROM liga_fichas_mov WHERE jugador_id = ? ORDER BY id DESC LIMIT 15', [$jugador]))];
    }

    /** POST /api/liga/tienda {articulo} -> {ok, fichas, entrega|null, cosmetico|null, tienda} */
    public static function comprar(int $jugador, string $articulo): array
    {
        $sem = self::asegurarSemana();
        $x = self::TIENDA[$articulo] ?? null;
        Fallo::si($x === null, 'Ese artículo no existe en la tienda de la liga.', 404, ['codigo' => 'no_existe']);
        if (method_exists(Cuentas::class, 'exigirActiva')) Cuentas::exigirActiva($jugador);
        $r = Db::tx(function () use ($jugador, $articulo, $x, $sem): array {
            $estado = self::tienda($jugador);
            $a = current(array_filter($estado['articulos'], fn($y) => $y['id'] === $articulo));
            Fallo::si(!$a['disponible'], (string) $a['motivo'], 409, ['codigo' => 'no_disponible']);
            Fallo::si(self::fichas($jugador) < $x['fichas'], 'Te faltan ' . ($x['fichas'] - self::fichas($jugador)) . ' fichas de liga.', 402, ['codigo' => 'sin_fichas']);
            Db::q('INSERT INTO liga_compras (jugador_id, articulo, fichas, semana, creado) VALUES (?, ?, ?, ?, ?)', [$jugador, $articulo, $x['fichas'], $sem['semana'], self::ahora()]);
            $cid = Db::ultimoId();
            $saldo = self::moverFichas($jugador, -$x['fichas'], 'tienda', 'tienda:' . $cid . ':' . $articulo, $sem['semana']);
            $entrega = null; $cosm = null;
            if (!empty($x['cosmetico'])) {
                Db::q('INSERT INTO liga_cosmeticos (jugador_id, cosmetico, creado) VALUES (?, ?, ?)', [$jugador, $articulo, self::ahora()]);
                $cosm = $articulo;
            } else {
                $e = $x['entrega'];
                $entrega = Monedero::entregar($jugador, $e['tipo'], $e['item'], (int) $e['cantidad'], 'liga:' . $articulo, $e['nivel'] ?? null, isset($e['eventos']) ? (int) $e['eventos'] : null);
                Db::q('UPDATE liga_compras SET entrega_id = ? WHERE id = ?', [$entrega['id'], $cid]);
            }
            return ['saldo' => $saldo, 'entrega' => $entrega, 'cosmetico' => $cosm];
        });
        return ['ok' => true, 'fichas' => $r['saldo'], 'entrega' => $r['entrega'], 'cosmetico' => $r['cosmetico'], 'tienda' => self::tienda($jugador)];
    }

    // ------------------------------------------------------------------ tarea programada
    /** server/bin/liga.php: cambio de semana, encargos vencidos, intentos vencidos, revalidar pendientes. */
    public static function tareaProgramada(bool $revisarFirmados = false): array
    {
        $sem = self::asegurarSemana();
        $t = self::ahora();
        $vencidas = Db::tx(fn() => self::mantener($sem['semana']));
        $intentos = Db::q("UPDATE liga_intentos SET estado = 'vencido', cerrado = ? WHERE estado = 'emitido' AND vence <= ?", [$t, $t])->rowCount();
        $rev = self::revalidar(200, $revisarFirmados);
        return ['semana' => $sem['semana'], 'encargos_devueltos' => $vencidas, 'intentos_vencidos' => $intentos] + $rev;
    }

    // ------------------------------------------------------------------ validador (Node)
    /**
     * Repite un intento con server/validador (servicio HTTP en 127.0.0.1 y, si no responde, por consola). Copia del
     * ayudante de server/validador/README.md. Config: VALIDADOR_URL, VALIDADOR_CLAVE, VALIDADOR_SCRIPT, VALIDADOR_NODE.
     */
    public static function validarConNode(array $intento): array
    {
        $url = rtrim(Config::get('VALIDADOR_URL', 'http://127.0.0.1:8790'), '/');
        $clave = Config::get('VALIDADOR_CLAVE');
        $script = Config::get('VALIDADOR_SCRIPT', dirname(__DIR__) . '/validador/validador.js');
        $node = Config::get('VALIDADOR_NODE', is_executable('/usr/bin/node') ? '/usr/bin/node' : 'node');
        $json = json_encode($intento, JSON_UNESCAPED_UNICODE);
        if ($json === false) return ['valido' => false, 'detalle' => ['motivo' => 'json_invalido']];
        if ($clave !== '' && function_exists('curl_init')) {
            $ch = curl_init($url . '/validar');
            curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $json, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT_MS => 500,
                CURLOPT_TIMEOUT_MS => 2000, CURLOPT_PROXY => '', CURLOPT_NOSIGNAL => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Validador-Clave: ' . $clave]]);
            $cuerpo = curl_exec($ch);
            $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);
            if (is_string($cuerpo) && ($codigo === 200 || $codigo === 400)) {
                $r = json_decode($cuerpo, true);
                if (is_array($r)) return $r + ['via' => 'http'];
            }
        }
        if (!is_file($script)) return ['valido' => false, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => 'no está validador.js']];
        $proc = @proc_open([$node, $script], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
        if (!is_resource($proc)) return ['valido' => false, 'detalle' => ['motivo' => 'validador_caido']];
        fwrite($tubos[0], $json);
        fclose($tubos[0]);
        stream_set_blocking($tubos[1], false);
        $salida = '';
        $fin = microtime(true) + 5.0;
        while (microtime(true) < $fin) {
            $leer = [$tubos[1]]; $nada = null;
            if (stream_select($leer, $nada, $nada, 0, 100000)) { $x = fread($tubos[1], 65536); if ($x !== false) $salida .= $x; }
            if (feof($tubos[1])) break;
        }
        $listo = feof($tubos[1]);
        fclose($tubos[1]); fclose($tubos[2]);
        if (!$listo) { proc_terminate($proc, 9); proc_close($proc); return ['valido' => false, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => 'tiempo agotado']]; }
        proc_close($proc);
        $r = json_decode(trim($salida), true);
        return is_array($r) ? $r + ['via' => 'consola'] : ['valido' => false, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => 'respuesta inválida']];
    }
}
