<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Mega Festival (inspirado en la Caza del Oso de Kingshot). Ver server/INTEGRAR_FESTIVAL.md.
 *
 * - Cada 2 días (CICLO) se abre una ventana de 24 h (DURACION). En esa ventana cada asociación (hasta 20 productoras)
 *   produce junta un festival gigante con 6 escenarios. Cada miembro manda su mejor personal y equipos a cubrir un
 *   escenario ("turno" = un intento). Cada intento suma su calidad al escenario hasta llenar su meta.
 * - Los imprevistos del festival (tormenta, público desbordado, baja de tensión) cambian por bloques de 6 h y le pegan
 *   a TODOS los escenarios a la vez (cambian el contrato que reparte el servidor).
 * - Cada intento gasta 1 Pase de Prensa: 1 diario por pasar lista (misión "entra al juego hoy"), hasta 2 por otras
 *   misiones del día (Festival::ganarPaseMision), +1 diario con VIP, y hasta 3 por día comprados a 30 créditos.
 * - Nadie puede inventar su resultado: el servidor reparte semilla + contrato + equipo (revisado con topes) + contexto,
 *   el juego juega y manda SOLO sus decisiones, y el validador (server/validador) repite la jugada. Lo que cuenta es la
 *   calidad del validador. Una semilla, un intento.
 * - Premios al cerrar (entregas de tipos que el juego ya aplica + fichas del festival): por aporte personal, por puesto
 *   en la asociación, por hitos de calidad del festival (25/50/75/100 %) y por cerrar un escenario.
 * - Dificultad: sube con la liga de la asociación (Bronce → Diamante); las metas crecen con el número de miembros.
 *
 * Todo lo que cambia saldos corre dentro de Db::tx(). Las tablas están en migraciones/festival.sql y se crean solas.
 */
final class Festival
{
    // ------------------------------------------------------------------ calendario
    public const CICLO = 172800;                 // cada 2 días
    public const DURACION = 86400;               // ventana de 24 h
    public const BLOQUE = 21600;                 // los imprevistos del festival cambian cada 6 h
    public const INICIO_POR_DEFECTO = '2026-10-01T12:00:00-05:00';   // primer festival (se cambia con FESTIVAL_INICIO)
    public const INTENTO_DURA = 1800;            // 30 min para jugar un intento después de pedirlo
    public const GRACIA_ENVIO = 900;             // se puede enviar hasta 15 min después del cierre (si empezó antes)
    public const GRACIA_CIERRE = 1200;           // el reparto de premios se hace 20 min después del cierre
    public const VALIDANDO_TRABADO = 120;        // un intento "validando" por más de 2 min se vuelve a validar

    // ------------------------------------------------------------------ pases de prensa
    public const PASES_DIARIOS = 1;              // misión "Pasar lista": entrar al juego en el día
    public const PASES_VIP = 1;
    public const PASES_MISION_MAX_DIA = 2;       // otras misiones del día (las da otro módulo con ganarPaseMision)
    public const PRECIO_PASE = 30;               // créditos
    public const COMPRA_MAX_DIA = 3;
    public const PASES_TOPE = 10;                // máximo guardado (lo que pase del tope no se suma)

    // ------------------------------------------------------------------ dificultad y metas
    public const LIGAS = ['Bronce', 'Plata', 'Oro', 'Diamante'];
    public const META_POR_MIEMBRO = [150, 190, 230, 270];            // puntos de calidad por miembro (todo el festival)
    public const MIN_MIEMBROS_META = 3;
    public const HITOS = [25, 50, 75, 100];
    public const LIGA_SUBE = 75;                 // % para subir de liga
    public const LIGA_BAJA = 25;                 // menos de esto: baja

    /** Los 6 escenarios. diff/cams son los de la liga Bronce (la liga suma). peso reparte la meta (suman 6). */
    public const ESCENARIOS = [
        1 => ['nombre' => 'Escenario Principal', 'tipo' => 'concierto', 'icono' => 'concierto', 'diff' => 4, 'cams' => 4, 'outdoor' => true, 'peso' => 1.3],
        2 => ['nombre' => 'Tarima Rock', 'tipo' => 'concierto', 'icono' => 'sound', 'diff' => 4, 'cams' => 3, 'outdoor' => true, 'peso' => 1.0],
        3 => ['nombre' => 'Carpa Electrónica', 'tipo' => 'concierto', 'icono' => 'bolt', 'diff' => 3, 'cams' => 3, 'outdoor' => false, 'peso' => 1.0],
        4 => ['nombre' => 'Escenario del Patrocinador', 'tipo' => 'lanzamiento', 'icono' => 'lanzamiento', 'diff' => 3, 'cams' => 3, 'outdoor' => false, 'peso' => 0.9],
        5 => ['nombre' => 'Zona de Prensa', 'tipo' => 'prensa', 'icono' => 'prensa', 'diff' => 2, 'cams' => 2, 'outdoor' => false, 'peso' => 0.7],
        6 => ['nombre' => 'Escenario Acústico', 'tipo' => 'concierto', 'icono' => 'mics', 'diff' => 3, 'cams' => 2, 'outdoor' => true, 'peso' => 1.1],
    ];

    /** Imprevistos del festival: le pegan a TODOS los escenarios mientras dura su bloque de 6 h. */
    public const INCIDENTES = [
        'calma' => ['nombre' => 'Todo en orden', 'detalle' => 'El festival arranca sin problemas.', 'icono' => 'check', 'efecto' => []],
        'tormenta' => ['nombre' => 'Tormenta sobre el predio', 'detalle' => 'Todos los escenarios quedan a la intemperie: puede llover en cualquiera.', 'icono' => 'rain', 'efecto' => ['outdoor' => true]],
        'publico' => ['nombre' => 'Público desbordado', 'detalle' => 'Llegó el doble de gente: cada escenario pide una cámara más.', 'icono' => 'people', 'efecto' => ['cams' => 1]],
        'tension' => ['nombre' => 'Baja de tensión en todo el predio', 'detalle' => 'Los generadores no dan abasto: todo es un punto más difícil.', 'icono' => 'bolt', 'efecto' => ['diff' => 1]],
    ];

    // ------------------------------------------------------------------ premios
    /** Por aporte personal (puntos = suma de la calidad validada de tus intentos). Se da el más alto que alcances. */
    public const PREMIOS_APORTE = [
        ['min' => 50, 'nombre' => 'Colaborador', 'fichas' => 10, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 300]]],
        ['min' => 150, 'nombre' => 'Jefe de escenario', 'fichas' => 25, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 600], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2]]],
        ['min' => 300, 'nombre' => 'Productor estrella', 'fichas' => 45, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1000], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
    ];
    /** Por puesto dentro de la asociación (solo fichas). */
    public const PREMIOS_PUESTO = [1 => 30, 2 => 15, 3 => 15];
    /** Para todos los que mandaron al menos un intento validado. */
    public const PREMIOS_HITO = [
        25 => ['fichas' => 10, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 400]]],
        50 => ['fichas' => 15, 'entregas' => [['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2]]],
        75 => ['fichas' => 25, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1200]]],
        100 => ['fichas' => 50, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
    ];
    public const FICHAS_CERRAR_ESCENARIO = 5;

    // ------------------------------------------------------------------ registro del equipo (topes contra trampas)
    public const PERSONAS_MAX = 8;
    public const EQUIPOS_MAX = 12;
    public const MORAL = 80;                     // el servidor fija ánimo y estado: iguales para todos
    public const ESTADO_EQUIPO = 90;
    /** Los 14 roles del juego (js/datos.js, vía CatalogoJuego). Las claves viejas cam/dir/audio/stream se aceptan y se guardan con la nueva. */
    public const ROLES = CatalogoJuego::ROLES;
    /**
     * Equipos que se compran con dinero del juego: TODO el catálogo de js/datos.js (CatalogoJuego::EQUIPOS: categoría y
     * fama mínima del juego). Máximo por intento según la categoría (lo que no está: 1). Ver equipoJuego().
     */
    public const MAX_POR_CATEGORIA = ['cam' => 4, 'lens' => 4, 'support' => 4, 'wireless' => 4, 'mics' => 4, 'cable' => 2, 'power' => 2, 'rain' => 2];

    /** [categoría, fama mínima, máximo por intento] de un equipo del juego, o null si no existe. */
    public static function equipoJuego(string $t): ?array
    {
        $x = CatalogoJuego::EQUIPOS[$t] ?? null;
        return $x === null ? null : [(string) $x['cat'], (int) $x['fama'], self::MAX_POR_CATEGORIA[$x['cat']] ?? 1];
    }
    /** Exclusivos del inventario del servidor (hay que tenerlos en la bodega). Los vip_* funcionan siempre, con o sin Pase VIP. */
    public const EQUIPOS_SERVIDOR = [
        'dron4k' => 'cam', 'grua' => 'cam', 'vip_cam8k' => 'cam', 'unidad_movil' => 'switcher', 'vip_switcher' => 'switcher',
        'generador' => 'power', 'vip_satelital' => 'internet',
    ];

    // ------------------------------------------------------------------ ganchos (pruebas)
    /** @var null|callable(array): array  Reemplaza al validador (pruebas). */
    public static $validador = null;
    /** Reloj fijo para pruebas (segundos Unix) o null. */
    public static ?int $reloj = null;
    private static bool $listo = false;

    public static function ahora(): int { return self::$reloj ?? time(); }
    public static function dia(?int $t = null): string { return date('Y-m-d', $t ?? self::ahora()); }

    // ------------------------------------------------------------------ esquema
    public const TABLAS = ['festival_ligas', 'festival_instancias', 'festival_escenarios', 'festival_intentos', 'festival_hitos', 'festival_pases', 'festival_fichas', 'festival_premios'];

    /** Crea las tablas del festival si falta alguna (una vez por petición). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        $ph = implode(',', array_fill(0, count(self::TABLAS), '?'));
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ($ph)", self::TABLAS);
        if ($n < count(self::TABLAS)) Db::pdo()->exec((string) file_get_contents(__DIR__ . '/migraciones/festival.sql'));
        self::$listo = true;
    }

    // ------------------------------------------------------------------ calendario
    public static function inicio(): int
    {
        $c = Config::get('FESTIVAL_INICIO');
        $t = $c !== '' ? strtotime($c) : false;
        return $t !== false ? $t : (int) strtotime(self::INICIO_POR_DEFECTO);
    }

    /** Ciclo que contiene $t: ['n', 'abre', 'cierra', 'abierto', 'siguiente']. */
    public static function ciclo(?int $t = null): array
    {
        $t ??= self::ahora();
        $n = (int) floor(($t - self::inicio()) / self::CICLO);
        $abre = self::inicio() + $n * self::CICLO;
        $cierra = $abre + self::DURACION;
        return ['n' => $n, 'abre' => $abre, 'cierra' => $cierra, 'abierto' => $t >= $abre && $t < $cierra, 'siguiente' => $abre + self::CICLO];
    }

    /** Clave del imprevisto del festival en el bloque b (0..3). El primer bloque siempre empieza en calma. */
    public static function incidenteDe(int $semilla, int $b): string
    {
        if ($b <= 0) return 'calma';
        $claves = array_keys(self::INCIDENTES);
        return $claves[1 + (crc32($semilla . ':' . $b) % (count($claves) - 1))];
    }

    public static function bloqueDe(array $inst, ?int $t = null): int
    {
        return max(0, min(3, intdiv(max(0, ($t ?? self::ahora()) - (int) $inst['abre']), self::BLOQUE)));
    }

    // ------------------------------------------------------------------ ligas, metas y contratos
    public static function liga(int $asoc): int { return (int) (Db::valor('SELECT liga FROM festival_ligas WHERE asociacion_id = ?', [$asoc]) ?? 0); }

    public static function metaEscenario(int $n, int $miembros, int $liga): int
    {
        $m = max(self::MIN_MIEMBROS_META, min(Social::MAX_MIEMBROS, $miembros));
        $v = $m * self::META_POR_MIEMBRO[max(0, min(3, $liga))] * self::ESCENARIOS[$n]['peso'] / 6;
        return (int) (ceil($v / 10) * 10);
    }

    /** Contrato que reparte el servidor para el escenario n con la liga y el imprevisto del festival de ese momento. */
    public static function contrato(array $inst, int $n, string $incidente): array
    {
        $e = self::ESCENARIOS[$n];
        $liga = (int) $inst['liga'];
        $ef = self::INCIDENTES[$incidente]['efecto'] ?? [];
        return [
            'type' => $e['tipo'],
            'client' => mb_substr($inst['nombre'] . ' · ' . $e['nombre'], 0, 80),
            'cams' => min(6, $e['cams'] + ($liga >= 2 ? 1 : 0) + (int) ($ef['cams'] ?? 0)),
            'diff' => min(5, $e['diff'] + $liga + (int) ($ef['diff'] ?? 0)),
            'audio' => true,
            'stream' => true,
            'outdoor' => (bool) ($ef['outdoor'] ?? $e['outdoor']),
            'pay' => 2500 + 500 * $liga,
            'rival' => false,
            'festival' => true,
            'escenario' => $n,
        ];
    }

    /** Contexto igual para todos los de una misma liga (la exigencia del cliente depende de la fama). */
    public static function contexto(int $liga): array
    {
        return ['fama' => 20 + 15 * max(0, min(3, $liga)), 'dinero' => 1000, 'stock' => ['cable' => 1, 'battery' => 1]];
    }

    // ------------------------------------------------------------------ instancia
    private static function miembros(int $asoc): int { return (int) Db::valor('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$asoc]); }

    /** Festival de la asociación en el ciclo abierto (lo crea si falta). Debe llamarse con la ventana abierta. */
    public static function instanciaAbierta(int $asoc, array $c): array
    {
        return Db::tx(function () use ($asoc, $c): array {
            $inst = Db::fila('SELECT * FROM festival_instancias WHERE ciclo = ? AND asociacion_id = ?', [$c['n'], $asoc]);
            $miembros = self::miembros($asoc);
            if (!$inst) {
                $a = Db::fila('SELECT * FROM asociaciones WHERE id = ?', [$asoc]);
                Fallo::si(!$a, 'Esa asociación ya no existe.', 404);
                $liga = self::liga($asoc);
                $t = self::ahora();
                Db::q('INSERT INTO festival_instancias (ciclo, asociacion_id, servidor_id, nombre, liga, miembros, semilla, abre, cierra, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$c['n'], $asoc, $a['servidor_id'], 'Mega Festival ' . $a['siglas'], $liga, max(1, $miembros), random_int(1, 2147483647), $c['abre'], $c['cierra'], $t]);
                $id = Db::ultimoId();
                foreach (self::ESCENARIOS as $n => $_) {
                    Db::q('INSERT INTO festival_escenarios (instancia_id, n, semilla, meta) VALUES (?, ?, ?, ?)', [$id, $n, random_int(1, 2147483647), self::metaEscenario($n, $miembros, $liga)]);
                }
                self::recalcular($id);
                return Db::fila('SELECT * FROM festival_instancias WHERE id = ?', [$id]);
            }
            // Si entró más gente, las metas crecen (nunca bajan). Los escenarios ya cerrados se quedan cerrados.
            if ($inst['estado'] === 'abierto' && $miembros > (int) $inst['miembros']) {
                Db::q('UPDATE festival_instancias SET miembros = ? WHERE id = ?', [$miembros, $inst['id']]);
                foreach (Db::todas('SELECT n, meta FROM festival_escenarios WHERE instancia_id = ? AND completado_en IS NULL', [$inst['id']]) as $e) {
                    $nueva = max((int) $e['meta'], self::metaEscenario((int) $e['n'], $miembros, (int) $inst['liga']));
                    Db::q('UPDATE festival_escenarios SET meta = ? WHERE instancia_id = ? AND n = ?', [$nueva, $inst['id'], $e['n']]);
                }
                self::recalcular((int) $inst['id']);
                $inst = Db::fila('SELECT * FROM festival_instancias WHERE id = ?', [$inst['id']]);
            }
            return $inst;
        });
    }

    /** Recalcula meta_total y calidad_total de la instancia. */
    private static function recalcular(int $inst): void
    {
        Db::q('UPDATE festival_instancias SET meta_total = (SELECT COALESCE(SUM(meta), 0) FROM festival_escenarios WHERE instancia_id = ?),
               calidad_total = (SELECT COALESCE(SUM(MIN(acumulado, meta)), 0) FROM festival_escenarios WHERE instancia_id = ?) WHERE id = ?', [$inst, $inst, $inst]);
    }

    public static function porcentaje(array $inst): int
    {
        $m = (int) $inst['meta_total'];
        return $m > 0 ? (int) min(100, floor(100 * (int) $inst['calidad_total'] / $m)) : 0;
    }

    // ------------------------------------------------------------------ pases de prensa
    public static function pases(int $j): int { return (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM festival_pases WHERE jugador_id = ?', [$j]); }

    /**
     * Anota un cambio de pases (idempotente por ref). Las sumas respetan PASES_TOPE. Devuelve lo que se sumó/restó o null si ya estaba.
     * Es el ÚNICO saldo de Pases de Prensa: también lo usan los premios del Desafío del Día (Desafio::sumarPases / gastarPases).
     */
    public static function moverPases(int $j, int $cambio, string $motivo, string $ref): ?int
    {
        return Db::tx(function () use ($j, $cambio, $motivo, $ref): ?int {
            if (Db::valor('SELECT 1 FROM festival_pases WHERE jugador_id = ? AND ref = ?', [$j, $ref])) return null;
            $saldo = self::pases($j);
            if ($cambio > 0) $cambio = max(0, min($cambio, self::PASES_TOPE - $saldo));
            Fallo::si($saldo + $cambio < 0, 'No tienes Pases de Prensa.', 402, ['codigo' => 'sin_pases']);
            Db::q('INSERT INTO festival_pases (jugador_id, cambio, saldo, motivo, ref, dia, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$j, $cambio, $saldo + $cambio, $motivo, $ref, self::dia(), self::ahora()]);
            return $cambio;
        });
    }

    /** Pase diario (misión "Pasar lista") y el del VIP: una vez por día local, solo si está en una asociación. */
    public static function otorgarDiarios(int $j): void
    {
        if (!Social::miembro($j)) return;
        $d = self::dia();
        self::moverPases($j, self::PASES_DIARIOS, 'diario', 'diario:' . $d);
        if (Monedero::vipActivo($j)) self::moverPases($j, self::PASES_VIP, 'vip', 'vip:' . $d);
    }

    /**
     * Gancho para las misiones del día (lo llama el módulo de misiones cuando el servidor confirma que se cumplió).
     * Máximo PASES_MISION_MAX_DIA por día; la misma misión cuenta una vez por día. Devuelve true si dio el pase.
     */
    public static function ganarPaseMision(int $j, string $mision): bool
    {
        self::preparar();
        $mision = preg_replace('/[^a-z0-9_]/', '', strtolower($mision)) ?: 'mision';
        return Db::tx(function () use ($j, $mision): bool {
            $hoy = (int) Db::valor("SELECT COUNT(*) FROM festival_pases WHERE jugador_id = ? AND dia = ? AND motivo = 'mision'", [$j, self::dia()]);
            if ($hoy >= self::PASES_MISION_MAX_DIA) return false;
            return self::moverPases($j, 1, 'mision', 'mision:' . $mision . ':' . self::dia()) !== null;
        });
    }

    private static function compradosHoy(int $j): int
    {
        return (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM festival_pases WHERE jugador_id = ? AND dia = ? AND motivo = 'compra'", [$j, self::dia()]);
    }

    /** POST /api/festival/pases/comprar {cantidad?: 1..3} */
    public static function comprarPases(int $j, array $in): array
    {
        self::preparar();
        if (method_exists(Cuentas::class, 'exigirActiva')) Cuentas::exigirActiva($j);
        $cant = $in['cantidad'] ?? 1;
        Fallo::si(!is_int($cant) || $cant < 1 || $cant > self::COMPRA_MAX_DIA, 'Puedes comprar de 1 a ' . self::COMPRA_MAX_DIA . ' pases.', 400, ['codigo' => 'cantidad']);
        Fallo::si(!Social::miembro($j), 'Únete a una asociación para participar en el Mega Festival.', 403, ['codigo' => 'sin_asociacion']);
        self::otorgarDiarios($j);
        $r = Db::tx(function () use ($j, $cant): array {
            $hoy = self::compradosHoy($j);
            Fallo::si($hoy + $cant > self::COMPRA_MAX_DIA, 'Hoy ya compraste ' . $hoy . ' de ' . self::COMPRA_MAX_DIA . ' pases. Vuelve mañana.', 409, ['codigo' => 'limite_compra', 'comprados_hoy' => $hoy]);
            Fallo::si(self::pases($j) + $cant > self::PASES_TOPE, 'Puedes guardar hasta ' . self::PASES_TOPE . ' pases. Usa algunos primero.', 409, ['codigo' => 'tope_pases']);
            $costo = self::PRECIO_PASE * $cant;
            $saldo = Monedero::saldo($j);
            Fallo::si($saldo < $costo, 'No tienes créditos suficientes. Necesitas ' . $costo . ' créditos.', 402, ['codigo' => 'sin_creditos', 'creditos' => $saldo]);
            $ref = 'compra:' . self::dia() . ':' . ($hoy + 1);
            try {
                $nuevo = Monedero::mover($j, -$costo, 'festival_pases', 'festival:' . $ref . 'x' . $cant);
            } catch (\RuntimeException $e) {
                throw new Fallo($e->getMessage(), 402, ['codigo' => 'sin_creditos', 'creditos' => Monedero::saldo($j)]);
            }
            self::moverPases($j, $cant, 'compra', $ref);
            return ['creditos' => $nuevo, 'comprados' => $cant];
        });
        return ['ok' => true, 'compra' => $r + ['pases' => self::pases($j)], 'estado' => self::resumen($j)];
    }

    // ------------------------------------------------------------------ fichas
    /**
     * Las fichas son UNA sola moneda de premio para los eventos en línea: si está la Liga Semanal (Liga::moverFichas),
     * el festival paga en esas fichas (se gastan en la tienda de la liga). Si no está, quedan en festival_fichas.
     */
    public static function fichasCompartidas(): bool { return class_exists(Liga::class) && method_exists(Liga::class, 'moverFichas') && method_exists(Liga::class, 'fichas'); }

    public static function fichas(int $j): int
    {
        $propias = (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM festival_fichas WHERE jugador_id = ?', [$j]);
        if (!self::fichasCompartidas()) return $propias;
        try { return Liga::fichas($j) + $propias; } catch (\Throwable) { return $propias; }
    }

    private static function darFichas(int $j, int $n, string $motivo, string $ref): void
    {
        if ($n <= 0) return;
        if (self::fichasCompartidas()) {
            try { Liga::moverFichas($j, $n, $motivo, $ref); return; }
            catch (\Throwable $e) { error_log('EN VIVO festival: fichas de liga no disponibles, se guardan aparte: ' . mb_substr($e->getMessage(), 0, 200)); }
        }
        if (Db::valor('SELECT 1 FROM festival_fichas WHERE jugador_id = ? AND ref = ?', [$j, $ref])) return;
        Db::q('INSERT INTO festival_fichas (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (?, ?, ?, ?, ?, ?)', [$j, $n, self::fichas($j) + $n, $motivo, $ref, self::ahora()]);
    }

    // ------------------------------------------------------------------ registro del equipo
    /** Máxima habilidad aceptada según la fama pública (que el servidor ya limita a +15 por día). */
    public static function habilidadMax(int $fama): int { return $fama < 15 ? 3 : ($fama < 40 ? 4 : 5); }

    /**
     * Revisa y normaliza el personal y los equipos que el jugador manda al festival. El servidor fija ánimo y estado.
     * Exclusivos y VIP: solo los que tiene en la bodega del servidor (lo comprado con créditos funciona siempre, sin pedir el
     * Pase VIP: decisión de Dimitry, oct. 2026); equipos del juego: según fama. $vip ya no cambia nada (se deja por compatibilidad).
     * Personal sobre el tope de su fama: solo tantos como personas premium recibió (entregas "personal").
     */
    public static function revisarEquipo(int $j, mixed $eq, bool $vip = false): array
    {
        Fallo::si(!is_array($eq) || !is_array($eq['staff'] ?? null) || !is_array($eq['equip'] ?? null), 'Elige el personal y los equipos que vas a mandar.', 400, ['codigo' => 'equipo']);
        $staff = array_values($eq['staff']);
        $equip = array_values($eq['equip']);
        Fallo::si(count($staff) < 1 || count($staff) > self::PERSONAS_MAX, 'Manda de 1 a ' . self::PERSONAS_MAX . ' personas.', 400, ['codigo' => 'equipo']);
        Fallo::si(count($equip) < 1 || count($equip) > self::EQUIPOS_MAX, 'Manda de 1 a ' . self::EQUIPOS_MAX . ' equipos.', 400, ['codigo' => 'equipo']);
        $fama = (int) Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$j]);
        $tope = self::habilidadMax($fama);
        $premium = array_map('intval', array_column(Db::todas("SELECT cantidad FROM entregas WHERE jugador_id = ? AND tipo = 'personal' ORDER BY cantidad DESC", [$j]), 'cantidad'));
        $s = [];
        $duenos = 0;
        $sobre = [];
        foreach ($staff as $i => $p) {
            if (is_array($p) && is_string($p['role'] ?? null)) $p['role'] = CatalogoJuego::ROL_ALIAS[$p['role']] ?? $p['role'];
            Fallo::si(!is_array($p) || !in_array($p['role'] ?? null, self::ROLES, true), 'Persona ' . ($i + 1) . ': rol no válido.', 400, ['codigo' => 'equipo']);
            $k = $p['skill'] ?? null;
            Fallo::si(!is_int($k) || $k < 1 || $k > 5, 'Persona ' . ($i + 1) . ': la habilidad va de 1 a 5.', 400, ['codigo' => 'equipo']);
            if ($k > $tope) $sobre[] = $k;
            $o = ['role' => $p['role'], 'skill' => $k, 'morale' => self::MORAL];
            if (($p['owner'] ?? false) === true) { $duenos++; $o['owner'] = true; }
            if (is_string($p['name'] ?? null)) $o['name'] = mb_substr(Social::limpiarTexto($p['name']), 0, 40);
            $s[] = $o;
        }
        Fallo::si($duenos > 1, 'Solo puede ir un dueño de la productora.', 400, ['codigo' => 'equipo']);
        rsort($sobre);
        foreach ($sobre as $i => $k) {
            Fallo::si(!isset($premium[$i]) || $premium[$i] < $k, 'Con tu fama (' . $fama . ') tu personal puede tener hasta habilidad ' . $tope . '. Sube tu fama para mandar gente con más experiencia.', 400, ['codigo' => 'habilidad', 'habilidad_max' => $tope]);
        }
        $cuenta = [];
        $e = [];
        $camaras = 0;
        foreach ($equip as $i => $x) {
            $t = is_array($x) && is_string($x['type'] ?? null) ? $x['type'] : '';
            $ej = $t === '' ? null : self::equipoJuego($t);
            Fallo::si($ej === null && !isset(self::EQUIPOS_SERVIDOR[$t]), 'Equipo ' . ($i + 1) . ': ese equipo no se puede llevar al festival.', 400, ['codigo' => 'equipo']);
            $cuenta[$t] = ($cuenta[$t] ?? 0) + 1;
            if ($ej !== null) {
                [$cat, $min, $max] = $ej;
                $nom = CatalogoJuego::EQUIPOS[$t]['nombre'];
                Fallo::si($fama < $min, 'Para llevar ' . $nom . ' necesitas ' . $min . ' de fama.', 400, ['codigo' => 'fama_equipo', 'item' => $t]);
                Fallo::si($cuenta[$t] > $max, 'Máximo ' . $max . ' de ' . $nom . ' por escenario.', 400, ['codigo' => 'equipo', 'item' => $t]);
            } else {
                $cat = self::EQUIPOS_SERVIDOR[$t];
                $tiene = (int) Db::valor("SELECT COUNT(*) FROM inventario WHERE jugador_id = ? AND item = ? AND estado = 'bodega'", [$j, $t]);
                Fallo::si($cuenta[$t] > $tiene, 'No tienes ' . ($cuenta[$t] > 1 ? $cuenta[$t] . ' de ' : '') . Catalogo::nombreEquipo($t) . ' en tu bodega.', 403, ['codigo' => 'no_es_tuyo', 'item' => $t]);
            }
            if ($cat === 'cam') $camaras++;
            $e[] = ['type' => $t, 'condition' => self::ESTADO_EQUIPO];
        }
        Fallo::si($camaras < 1, 'Lleva al menos una cámara.', 400, ['codigo' => 'sin_camara']);
        return ['staff' => $s, 'equip' => $e];
    }

    // ------------------------------------------------------------------ intentos
    /** Los intentos pedidos que nadie envió a tiempo se vencen (el pase ya se gastó). */
    private static function vencer(): void
    {
        Db::q("UPDATE festival_intentos SET estado = 'vencido', motivo = 'tiempo_agotado' WHERE estado = 'jugando' AND expira < ?", [self::ahora()]);
    }

    private static function intentoJson(array $i, bool $conSemilla): array
    {
        $o = ['id' => (int) $i['id'], 'escenario' => (int) $i['escenario'], 'estado' => $i['estado'],
              'creado' => Db::iso((int) $i['creado']), 'expira' => Db::iso((int) $i['expira'])];
        if ($conSemilla) {
            $o += ['seed' => (int) $i['semilla'], 'contrato' => json_decode($i['contrato_json'], true), 'equipo' => json_decode($i['equipo_json'], true),
                   'contexto' => json_decode($i['contexto_json'], true), 'vip' => (bool) $i['vip'], 'incidente' => $i['incidente']];
        }
        if (in_array($i['estado'], ['validado', 'invalido', 'pendiente'], true)) {
            $o += ['calidad' => $i['calidad'] === null ? null : (int) $i['calidad'], 'estrellas' => $i['estrellas'] === null ? null : (int) $i['estrellas'],
                   'aporte' => (int) $i['aporte'], 'valido' => $i['valido'] === null ? null : (bool) $i['valido'],
                   'coincide' => $i['coincide'] === null ? null : (bool) $i['coincide'], 'motivo' => $i['motivo']];
        }
        return $o;
    }

    /** ¿Puede este jugador jugar ahora? Devuelve [inst|null, motivo|null, codigo|null]. */
    private static function puedeJugar(int $j, array $c): array
    {
        $m = Social::miembro($j);
        if (!$m) return [null, 'Únete a una asociación para participar en el Mega Festival.', 'sin_asociacion'];
        if (!$c['abierto']) return [null, 'El Mega Festival está cerrado. El próximo abre el ' . date('d/m', $c['siguiente']) . ' a las ' . date('H:i', $c['siguiente']) . '.', 'cerrado'];
        $inst = self::instanciaAbierta((int) $m['asociacion_id'], $c);
        $otra = Db::valor('SELECT 1 FROM festival_intentos WHERE jugador_id = ? AND ciclo = ? AND instancia_id <> ?', [$j, $c['n'], $inst['id']]);
        if ($otra) return [$inst, 'En este festival ya produjiste con otra asociación. Podrás ayudar a la tuya en el próximo.', 'otra_asociacion'];
        return [$inst, null, null];
    }

    /** POST /api/festival/intento/iniciar {escenario: 1..6, equipo: {staff, equip}} → semilla + contrato (gasta 1 pase). */
    public static function iniciar(int $j, array $in): array
    {
        self::preparar();
        Fallo::si(Limite::contar('festival:' . $j, 40), 'Demasiados intentos seguidos. Espera unos minutos.', 429);
        $n = $in['escenario'] ?? null;
        Fallo::si(!is_int($n) || !isset(self::ESCENARIOS[$n]), 'Elige un escenario del 1 al 6.', 400, ['codigo' => 'escenario']);
        self::vencer();
        $c = self::ciclo();
        [$inst, $motivo, $codigo] = self::puedeJugar($j, $c);
        Fallo::si($motivo !== null, (string) $motivo, $codigo === 'sin_asociacion' ? 403 : 409, ['codigo' => $codigo]);
        // Un intento abierto a la vez: si ya pidió uno y no lo envió, se lo devolvemos (sin gastar otro pase)
        $abierto = Db::fila("SELECT * FROM festival_intentos WHERE jugador_id = ? AND estado = 'jugando' ORDER BY id DESC LIMIT 1", [$j]);
        if ($abierto) {
            Fallo::si((int) $abierto['escenario'] !== $n, 'Termina primero tu turno en ' . self::ESCENARIOS[(int) $abierto['escenario']]['nombre'] . '.', 409,
                ['codigo' => 'intento_abierto', 'intento' => self::intentoJson($abierto, true)]);
            return ['ok' => true, 'reanudado' => true, 'intento' => self::intentoJson($abierto, true), 'pases' => self::pases($j)];
        }
        $vip = Monedero::vipActivo($j);
        $equipo = self::revisarEquipo($j, $in['equipo'] ?? null, $vip);
        self::otorgarDiarios($j);
        $i = Db::tx(function () use ($j, $n, $inst, $c, $vip, $equipo): array {
            $esc = Db::fila('SELECT * FROM festival_escenarios WHERE instancia_id = ? AND n = ?', [$inst['id'], $n]);
            Fallo::si($esc['completado_en'] !== null, 'Ese escenario ya quedó cubierto. Elige otro.', 409, ['codigo' => 'escenario_completo']);
            Fallo::si(self::pases($j) < 1, 'No tienes Pases de Prensa. Gánalos con las misiones del día o cómpralos (' . self::PRECIO_PASE . ' créditos).', 402, ['codigo' => 'sin_pases']);
            $t = self::ahora();
            $inc = self::incidenteDe((int) $inst['semilla'], self::bloqueDe($inst, $t));
            $contrato = self::contrato($inst, $n, $inc);
            for ($k = 0; $k < 5; $k++) {
                $semilla = random_int(1, 2147483647);
                if (!Db::valor('SELECT 1 FROM festival_intentos WHERE semilla = ?', [$semilla])) break;
            }
            Db::q('INSERT INTO festival_intentos (instancia_id, ciclo, escenario, jugador_id, semilla, contrato_json, equipo_json, contexto_json, vip, incidente, creado, expira)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$inst['id'], $c['n'], $n, $j, $semilla, self::json($contrato), self::json($equipo), self::json(self::contexto((int) $inst['liga'])), $vip ? 1 : 0, $inc,
                 $t, min($t + self::INTENTO_DURA, (int) $inst['cierra'] + self::GRACIA_ENVIO)]);
            $id = Db::ultimoId();
            self::moverPases($j, -1, 'intento', 'intento:' . $id);
            return Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$id]);
        });
        return ['ok' => true, 'reanudado' => false, 'intento' => self::intentoJson($i, true), 'pases' => self::pases($j)];
    }

    /** El intento completo que va al validador (todo de la base menos decisiones y cliente_resultado). */
    private static function paraValidar(array $i): array
    {
        $o = ['seed' => (int) $i['semilla'], 'contrato' => json_decode($i['contrato_json'], true), 'equipo' => json_decode($i['equipo_json'], true),
              'contexto' => json_decode($i['contexto_json'], true), 'vip' => (bool) $i['vip'], 'decisiones' => json_decode((string) $i['decisiones_json'], true) ?? []];
        $cr = $i['cliente_json'] !== null ? json_decode($i['cliente_json'], true) : null;
        if (is_array($cr)) $o['cliente_resultado'] = $cr;
        return $o;
    }

    /** POST /api/festival/intento/enviar {intento_id, decisiones: [n...], resultado?: {quality, stars}} */
    public static function enviar(int $j, array $in): array
    {
        self::preparar();
        Fallo::si(Limite::contar('festival:' . $j, 40), 'Demasiados intentos seguidos. Espera unos minutos.', 429);
        $id = $in['intento_id'] ?? null;
        Fallo::si(!is_int($id) || $id < 1, 'Falta "intento_id".', 400);
        $dec = $in['decisiones'] ?? null;
        Fallo::si(!is_array($dec) || !array_is_list($dec) || count($dec) > 20 || array_filter($dec, fn($d) => !is_int($d) || $d < 0 || $d > 9) !== [],
            'Las decisiones deben ser una lista de números (máximo 20).', 400, ['codigo' => 'decisiones']);
        $res = $in['resultado'] ?? null;
        $cliente = is_array($res) && is_int($res['quality'] ?? null) && is_int($res['stars'] ?? null) ? ['quality' => $res['quality'], 'stars' => $res['stars']] : null;
        // Paso 1: la semilla queda usada ANTES de validar (aunque falle, no se puede volver a probar)
        $paso = Db::tx(function () use ($j, $id, $dec, $cliente): array {
            $i = Db::fila('SELECT i.*, f.cierra FROM festival_intentos i JOIN festival_instancias f ON f.id = i.instancia_id WHERE i.id = ? AND i.jugador_id = ?', [$id, $j]);
            Fallo::si(!$i, 'Ese intento no existe.', 404);
            Fallo::si($i['estado'] !== 'jugando', $i['estado'] === 'vencido' ? 'Se acabó el tiempo de ese turno.' : 'Ese turno ya se envió.', 409,
                ['codigo' => $i['estado'] === 'vencido' ? 'vencido' : 'ya_enviado']);
            if (self::ahora() > (int) $i['expira']) {
                Db::q("UPDATE festival_intentos SET estado = 'vencido', motivo = 'tiempo_agotado' WHERE id = ?", [$id]);
                return ['vencido' => true];
            }
            Db::q("UPDATE festival_intentos SET estado = 'validando', decisiones_json = ?, cliente_json = ?, enviado = ? WHERE id = ?",
                [self::json($dec), $cliente === null ? null : self::json($cliente), self::ahora(), $id]);
            return ['fila' => Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$id])];
        });
        Fallo::si(isset($paso['vencido']), 'Se acabó el tiempo de ese turno (' . intdiv(self::INTENTO_DURA, 60) . ' minutos).', 409, ['codigo' => 'vencido']);
        // Paso 2: el validador repite la jugada (fuera de la transacción: no bloquea a nadie)
        $r = self::validar(self::paraValidar($paso['fila']));
        $fila = self::aplicar($id, $r);
        return ['ok' => true, 'resultado' => self::intentoJson($fila, false), 'estado' => self::resumen($j)];
    }

    /**
     * Repite el intento: Festival::$validador (pruebas) → Repeticion::validar() (el puente común de los eventos en línea,
     * que a su vez usa EnVivo\Validador si existe) → copia propia del ayudante del README de server/validador.
     */
    public static function validar(array $intento): array
    {
        try {
            if (self::$validador !== null) return (self::$validador)($intento);
            if (class_exists(Repeticion::class) && method_exists(Repeticion::class, 'validar')) return Repeticion::validar($intento);
            return self::validarNode($intento, self::opcionesValidador());
        } catch (\Throwable $e) {
            error_log('EN VIVO festival: validador ' . get_class($e) . ': ' . mb_substr($e->getMessage(), 0, 200));
            return ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido']];
        }
    }

    private static function opcionesValidador(): array
    {
        $node = Config::get('NODE_BIN', Config::get('VALIDADOR_NODE'));
        if ($node === '') $node = is_executable('/usr/bin/node') ? '/usr/bin/node' : 'node';
        return ['url' => Config::get('VALIDADOR_URL', 'http://127.0.0.1:8790'), 'clave' => Config::get('VALIDADOR_CLAVE'), 'node' => $node,
                'script' => Config::get('VALIDADOR_SCRIPT', dirname(__DIR__) . '/validador/validador.js'), 'timeout_ms' => (int) Config::get('VALIDADOR_MS', '2000')];
    }

    /** Copia del ayudante de server/validador/README.md (servicio HTTP con clave; si no responde, consola). */
    private static function validarNode(array $intento, array $o): array
    {
        $json = json_encode($intento, JSON_UNESCAPED_UNICODE);
        if ($json === false) return ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'json_invalido']];
        $limite = max(500, (int) $o['timeout_ms']);
        if ($o['clave'] !== '' && function_exists('curl_init')) {
            $ch = curl_init(rtrim($o['url'], '/') . '/validar');
            curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $json, CURLOPT_RETURNTRANSFER => true, CURLOPT_PROXY => '', CURLOPT_NOSIGNAL => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Validador-Clave: ' . $o['clave']], CURLOPT_CONNECTTIMEOUT_MS => 500, CURLOPT_TIMEOUT_MS => $limite]);
            $cuerpo = curl_exec($ch);
            $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);
            if (is_string($cuerpo) && ($codigo === 200 || $codigo === 400)) {
                $r = json_decode($cuerpo, true);
                if (is_array($r)) return $r + ['via' => 'http'];
            }
            if ($codigo === 401) error_log('EN VIVO festival: la clave del validador no coincide (VALIDADOR_CLAVE)');
        }
        if (!function_exists('proc_open') || !is_file($o['script'])) return ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido']];
        $proc = @proc_open([$o['node'], $o['script']], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
        if (!is_resource($proc)) return ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido']];
        fwrite($tubos[0], $json);
        fclose($tubos[0]);
        stream_set_blocking($tubos[1], false);
        $salida = '';
        $fin = microtime(true) + max(3.0, $limite / 1000 * 2);
        while (microtime(true) < $fin) {
            $leer = [$tubos[1]]; $nada = null;
            if (@stream_select($leer, $nada, $nada, 0, 100000)) { $t = fread($tubos[1], 65536); if ($t !== false) $salida .= $t; }
            if (feof($tubos[1])) break;
        }
        $terminado = feof($tubos[1]);
        fclose($tubos[1]); fclose($tubos[2]);
        if (!$terminado) { proc_terminate($proc, 9); proc_close($proc); return ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => 'tiempo agotado']]; }
        proc_close($proc);
        $r = json_decode(trim($salida), true);
        return is_array($r) ? $r + ['via' => 'consola'] : ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => 'respuesta inválida']];
    }

    /**
     * Guarda lo que dijo el validador y suma al escenario. La calidad SIEMPRE es la del validador (nunca la del juego).
     * - validador caído → 'pendiente' (se valida otra vez más tarde; todavía no suma)
     * - jugada imposible (calidad null) → 'invalido', no suma
     * - jugada posible pero el juego dijo otro resultado → suma la calidad del servidor y queda marcado como sospechoso
     *   (salvo que la versión de la lógica sea otra: actualización a mitad del festival, no es trampa)
     */
    private static function aplicar(int $id, array $r): array
    {
        return Db::tx(function () use ($id, $r): array {
            $i = Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$id]);
            if (!in_array($i['estado'], ['validando', 'pendiente'], true)) return $i;   // otra petición ya lo aplicó
            $d = is_array($r['detalle'] ?? null) ? $r['detalle'] : [];
            $motivo = is_string($d['motivo'] ?? null) ? mb_substr($d['motivo'], 0, 60) : null;
            $via = is_string($r['via'] ?? null) ? $r['via'] : null;
            $ver = is_string($r['version_logica'] ?? null) ? mb_substr($r['version_logica'], 0, 40) : null;
            $t = self::ahora();
            if ($motivo === 'validador_caido' || $motivo === 'logica_no_carga') {
                Db::q("UPDATE festival_intentos SET estado = 'pendiente', motivo = ?, via = ?, reintentos = reintentos + 1 WHERE id = ?", [$motivo, $via, $id]);
                return Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$id]);
            }
            $cal = $r['calidad'] ?? null;
            if (!is_int($cal)) {
                Db::q("UPDATE festival_intentos SET estado = 'invalido', calidad = NULL, estrellas = NULL, aporte = 0, valido = 0, coincide = 0, motivo = ?, via = ?, version_logica = ?, validado_en = ? WHERE id = ?",
                    [$motivo ?? 'jugada_invalida', $via, $ver, $t, $id]);
                return Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$id]);
            }
            $cal = max(0, min(100, $cal));
            $est = is_int($r['estrellas'] ?? null) ? max(0, min(5, $r['estrellas'])) : null;
            $valido = ($r['valido'] ?? false) === true;
            $coincide = array_key_exists('coincide', $r) && $r['coincide'] !== null ? (bool) $r['coincide'] : null;
            $sospechoso = !$valido && empty($d['version_distinta']) ? 1 : 0;
            $inst = Db::fila('SELECT * FROM festival_instancias WHERE id = ?', [$i['instancia_id']]);
            $esc = Db::fila('SELECT * FROM festival_escenarios WHERE instancia_id = ? AND n = ?', [$i['instancia_id'], $i['escenario']]);
            $aporte = $inst['estado'] === 'abierto' ? max(0, min($cal, (int) $esc['meta'] - (int) $esc['acumulado'])) : 0;
            Db::q("UPDATE festival_intentos SET estado = 'validado', calidad = ?, estrellas = ?, aporte = ?, valido = ?, coincide = ?, sospechoso = ?, motivo = ?, via = ?, version_logica = ?, validado_en = ? WHERE id = ?",
                [$cal, $est, $aporte, $valido ? 1 : 0, $coincide === null ? null : ($coincide ? 1 : 0), $sospechoso, $motivo, $via, $ver, $t, $id]);
            Universos::marcarActivo((int) $i['jugador_id'], true);   // evento en línea validado (COPAS.md §1: actividad_diaria.eventos)
            if (class_exists(Pase::class)) Pase::sumarXp((int) $i['jugador_id'], Pase::XP['festival'], 'festival', 'intento:' . $id);   // INTEGRAR_PASE.md §5
            if ($valido && !$sospechoso && $est !== null && class_exists(SedeOficial::class)) SedeOficial::premioIntento((int) $i['jugador_id'], $cal, $est, 'festival', 'festival:' . $id);   // INTEGRAR_SEDE_OFICIAL.md §4
            if ($aporte > 0) {
                Db::q('UPDATE festival_escenarios SET acumulado = acumulado + ? WHERE instancia_id = ? AND n = ?', [$aporte, $i['instancia_id'], $i['escenario']]);
                if ((int) $esc['acumulado'] + $aporte >= (int) $esc['meta']) {
                    Db::q('UPDATE festival_escenarios SET completado_en = ?, completado_por = ? WHERE instancia_id = ? AND n = ? AND completado_en IS NULL', [$t, $i['jugador_id'], $i['instancia_id'], $i['escenario']]);
                }
                self::recalcular((int) $i['instancia_id']);
                $pct = self::porcentaje(Db::fila('SELECT * FROM festival_instancias WHERE id = ?', [$i['instancia_id']]));
                foreach (self::HITOS as $h) {
                    if ($pct >= $h) Db::q('INSERT OR IGNORE INTO festival_hitos (instancia_id, pct, alcanzado_en, alcanzado_por) VALUES (?, ?, ?, ?)', [$i['instancia_id'], $h, $t, $i['jugador_id']]);
                }
            }
            return Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$id]);
        });
    }

    /** Vuelve a validar los intentos pendientes (validador caído) o trabados. Devuelve cuántos se resolvieron. */
    public static function revalidar(?int $instancia = null, int $max = 20): int
    {
        self::preparar();
        $sql = "SELECT * FROM festival_intentos WHERE (estado = 'pendiente' OR (estado = 'validando' AND enviado < ?))";
        $p = [self::ahora() - self::VALIDANDO_TRABADO];
        if ($instancia !== null) { $sql .= ' AND instancia_id = ?'; $p[] = $instancia; }
        $n = 0;
        foreach (Db::todas($sql . ' ORDER BY id LIMIT ' . max(1, $max), $p) as $i) {
            if ($i['estado'] === 'validando') Db::q("UPDATE festival_intentos SET estado = 'pendiente' WHERE id = ? AND estado = 'validando'", [$i['id']]);
            $f = self::aplicar((int) $i['id'], self::validar(self::paraValidar($i)));
            if ($f['estado'] !== 'pendiente') $n++;
        }
        return $n;
    }

    // ------------------------------------------------------------------ cierre y premios
    /** Escala el dinero de los premios con la liga (+25 % por liga). */
    private static function escalar(array $entregas, int $liga): array
    {
        return array_map(fn($e) => $e['tipo'] === 'dinero' ? ['cantidad' => (int) (round($e['cantidad'] * (1 + 0.25 * $liga) / 10) * 10)] + $e : $e, $entregas);
    }

    /** Da un premio una sola vez (festival_premios es la llave). */
    private static function premiar(array $inst, int $j, string $tipo, string $clave, array $entregas, int $fichas): void
    {
        $ok = Db::q('INSERT OR IGNORE INTO festival_premios (instancia_id, jugador_id, tipo, clave, fichas, creado) VALUES (?, ?, ?, ?, ?, ?)',
            [$inst['id'], $j, $tipo, $clave, $fichas, self::ahora()])->rowCount();
        if (!$ok) return;
        $pid = Db::ultimoId();
        $hechas = [];
        foreach ($entregas as $e) $hechas[] = Monedero::entregar($j, $e['tipo'], $e['item'], (int) $e['cantidad'], 'festival:' . $inst['id'] . ':' . $tipo . ':' . $clave);
        Db::q('UPDATE festival_premios SET entregas_json = ? WHERE id = ?', [self::json(array_column($hechas, 'id')), $pid]);
        self::darFichas($j, $fichas, 'festival', 'festival:' . $inst['id'] . ':' . $tipo . ':' . $clave);
    }

    /** Puntos de cada participante (suma de la calidad validada), del mayor al menor. */
    private static function participantes(int $inst): array
    {
        return Db::todas("SELECT i.jugador_id, SUM(i.calidad) AS puntos, SUM(i.aporte) AS aporte, COUNT(*) AS intentos, MAX(i.calidad) AS mejor, j.alias, j.nombre
                          FROM festival_intentos i JOIN jugadores j ON j.id = i.jugador_id
                          WHERE i.instancia_id = ? AND i.estado = 'validado' GROUP BY i.jugador_id ORDER BY puntos DESC, MIN(i.validado_en), i.jugador_id", [$inst]);
    }

    /** Cierra un festival: reparte premios (idempotente), mueve la liga y avisa por el chat de sistema. */
    public static function cerrar(int $id): bool
    {
        self::preparar();
        self::revalidar($id, 200);
        return Db::tx(function () use ($id): bool {
            $inst = Db::fila('SELECT * FROM festival_instancias WHERE id = ?', [$id]);
            if (!$inst || $inst['estado'] !== 'abierto') return false;
            Db::q("UPDATE festival_intentos SET estado = 'vencido', motivo = COALESCE(motivo, 'cierre') WHERE instancia_id = ? AND estado IN ('jugando', 'validando', 'pendiente')", [$id]);
            self::recalcular($id);
            $inst = Db::fila('SELECT * FROM festival_instancias WHERE id = ?', [$id]);
            $pct = self::porcentaje($inst);
            $liga = (int) $inst['liga'];
            $part = self::participantes($id);
            $hitos = array_map('intval', array_column(Db::todas('SELECT pct FROM festival_hitos WHERE instancia_id = ? ORDER BY pct', [$id]), 'pct'));
            foreach ($part as $pos => $p) {
                $j = (int) $p['jugador_id'];
                $tier = null;
                foreach (self::PREMIOS_APORTE as $k => $t) if ((int) $p['puntos'] >= $t['min']) $tier = $k;
                if ($tier !== null) self::premiar($inst, $j, 'aporte', (string) $tier, self::escalar(self::PREMIOS_APORTE[$tier]['entregas'], $liga), self::PREMIOS_APORTE[$tier]['fichas']);
                if (isset(self::PREMIOS_PUESTO[$pos + 1])) self::premiar($inst, $j, 'puesto', (string) ($pos + 1), [], self::PREMIOS_PUESTO[$pos + 1]);
                foreach ($hitos as $h) self::premiar($inst, $j, 'hito', (string) $h, self::escalar(self::PREMIOS_HITO[$h]['entregas'], $liga), self::PREMIOS_HITO[$h]['fichas']);
            }
            foreach (Db::todas('SELECT n, completado_por FROM festival_escenarios WHERE instancia_id = ? AND completado_por IS NOT NULL', [$id]) as $e) {
                self::premiar($inst, (int) $e['completado_por'], 'escenario', (string) $e['n'], [], self::FICHAS_CERRAR_ESCENARIO);
            }
            $nueva = $pct >= self::LIGA_SUBE ? min(3, $liga + 1) : ($pct < self::LIGA_BAJA ? max(0, $liga - 1) : $liga);
            Db::q('INSERT INTO festival_ligas (asociacion_id, liga, actualizado) VALUES (?, ?, ?) ON CONFLICT (asociacion_id) DO UPDATE SET liga = excluded.liga, actualizado = excluded.actualizado',
                [$inst['asociacion_id'], $nueva, self::ahora()]);
            Db::q("UPDATE festival_instancias SET estado = 'cerrado', cerrado_en = ? WHERE id = ?", [self::ahora(), $id]);
            foreach ($part as $p) {
                try {
                    Chat::sistema((int) $p['jugador_id'], '🎪 ' . $inst['nombre'] . ' terminó con ' . $pct . ' % de calidad. Tu aporte: ' . (int) $p['puntos'] . ' puntos. Tus premios ya están en el juego.'
                        . ($nueva > $liga ? ' ¡Tu asociación sube a la liga ' . self::LIGAS[$nueva] . '!' : ''));
                } catch (\Throwable) {
                }
            }
            return true;
        });
    }

    /** Tarea (cron o perezosa): vence intentos, revalida pendientes y cierra festivales pasados. Devuelve [revalidados, cerrados]. */
    public static function tareas(int $maxCierres = 50): array
    {
        self::preparar();
        self::vencer();
        $rev = self::revalidar(null, 50);
        $n = 0;
        // (OJO: PDO manda los números como texto; nunca comparar "columna + ?" con "?": se compara en PHP)
        foreach (Db::todas("SELECT id FROM festival_instancias WHERE estado = 'abierto' AND cierra <= ? ORDER BY id LIMIT " . max(1, $maxCierres), [self::ahora() - self::GRACIA_CIERRE]) as $f) {
            if (self::cerrar((int) $f['id'])) $n++;
        }
        return [$rev, $n];
    }

    // ------------------------------------------------------------------ GET /api/festival
    private static function nombre(?string $alias, ?string $nombre): string { return Social::nombrePublico($alias, $nombre); }

    private static function festivalJson(array $inst, int $j): array
    {
        $id = (int) $inst['id'];
        $t = self::ahora();
        $bloque = self::bloqueDe($inst, $t);
        $inc = self::incidenteDe((int) $inst['semilla'], $bloque);
        $cubierto = [];
        foreach (Db::todas("SELECT i.escenario, i.jugador_id, SUM(i.calidad) AS puntos, SUM(i.aporte) AS aporte, COUNT(*) AS intentos, MAX(i.calidad) AS mejor, j.alias, j.nombre
                            FROM festival_intentos i JOIN jugadores j ON j.id = i.jugador_id WHERE i.instancia_id = ? AND i.estado = 'validado'
                            GROUP BY i.escenario, i.jugador_id ORDER BY aporte DESC, puntos DESC", [$id]) as $c) {
            $cubierto[(int) $c['escenario']][] = ['jugador_id' => (int) $c['jugador_id'], 'nombre' => self::nombre($c['alias'], $c['nombre']), 'aporte' => (int) $c['aporte'],
                'puntos' => (int) $c['puntos'], 'intentos' => (int) $c['intentos'], 'mejor' => (int) $c['mejor'], 'yo' => (int) $c['jugador_id'] === $j];
        }
        $esc = [];
        foreach (Db::todas('SELECT e.*, j.alias, j.nombre FROM festival_escenarios e LEFT JOIN jugadores j ON j.id = e.completado_por WHERE e.instancia_id = ? ORDER BY e.n', [$id]) as $e) {
            $n = (int) $e['n'];
            $d = self::ESCENARIOS[$n];
            $esc[] = ['n' => $n, 'nombre' => $d['nombre'], 'tipo' => $d['tipo'], 'icono' => $d['icono'], 'semilla' => (int) $e['semilla'],
                'contrato' => self::contrato($inst, $n, $inc), 'meta' => (int) $e['meta'], 'acumulado' => min((int) $e['acumulado'], (int) $e['meta']),
                'porcentaje' => (int) $e['meta'] > 0 ? (int) min(100, floor(100 * (int) $e['acumulado'] / (int) $e['meta'])) : 0,
                'completado' => $e['completado_en'] !== null, 'completado_en' => Db::iso($e['completado_en'] === null ? null : (int) $e['completado_en']),
                'completado_por' => $e['completado_por'] === null ? null : self::nombre($e['alias'], $e['nombre']), 'cubierto_por' => $cubierto[$n] ?? []];
        }
        $hitos = [];
        $alc = [];
        foreach (Db::todas('SELECT h.*, j.alias, j.nombre FROM festival_hitos h LEFT JOIN jugadores j ON j.id = h.alcanzado_por WHERE h.instancia_id = ?', [$id]) as $h) $alc[(int) $h['pct']] = $h;
        foreach (self::HITOS as $h) {
            $hitos[] = ['pct' => $h, 'alcanzado' => isset($alc[$h]), 'alcanzado_en' => isset($alc[$h]) ? Db::iso((int) $alc[$h]['alcanzado_en']) : null,
                'alcanzado_por' => isset($alc[$h]) && $alc[$h]['alcanzado_por'] !== null ? self::nombre($alc[$h]['alias'], $alc[$h]['nombre']) : null,
                'premio' => ['fichas' => self::PREMIOS_HITO[$h]['fichas'], 'entregas' => self::escalar(self::PREMIOS_HITO[$h]['entregas'], (int) $inst['liga'])]];
        }
        $inc4 = [];
        for ($b = 0; $b < 4; $b++) {
            $k = self::incidenteDe((int) $inst['semilla'], $b);
            $inc4[] = ['bloque' => $b, 'clave' => $k, 'nombre' => self::INCIDENTES[$k]['nombre'], 'detalle' => self::INCIDENTES[$k]['detalle'], 'icono' => self::INCIDENTES[$k]['icono'],
                'desde' => Db::iso((int) $inst['abre'] + $b * self::BLOQUE), 'hasta' => Db::iso((int) $inst['abre'] + ($b + 1) * self::BLOQUE),
                'activo' => $inst['estado'] === 'abierto' && $b === $bloque, 'pasado' => $b < $bloque];
        }
        $ranking = [];
        foreach (self::participantes($id) as $pos => $p) {
            $ranking[] = ['puesto' => $pos + 1, 'jugador_id' => (int) $p['jugador_id'], 'nombre' => self::nombre($p['alias'], $p['nombre']), 'puntos' => (int) $p['puntos'],
                'aporte' => (int) $p['aporte'], 'intentos' => (int) $p['intentos'], 'mejor' => (int) $p['mejor'], 'yo' => (int) $p['jugador_id'] === $j];
        }
        $liga = (int) $inst['liga'];
        return ['id' => $id, 'ciclo' => (int) $inst['ciclo'], 'nombre' => $inst['nombre'], 'estado' => $inst['estado'],
            'liga' => ['n' => $liga, 'nombre' => self::LIGAS[$liga]], 'miembros' => (int) $inst['miembros'],
            'abre' => Db::iso((int) $inst['abre']), 'cierra' => Db::iso((int) $inst['cierra']),
            'meta_total' => (int) $inst['meta_total'], 'calidad_total' => (int) $inst['calidad_total'], 'porcentaje' => self::porcentaje($inst),
            'incidente' => ['clave' => $inc, 'nombre' => self::INCIDENTES[$inc]['nombre'], 'detalle' => self::INCIDENTES[$inc]['detalle'], 'icono' => self::INCIDENTES[$inc]['icono'],
                            'hasta' => Db::iso(min((int) $inst['cierra'], (int) $inst['abre'] + ($bloque + 1) * self::BLOQUE))],
            'incidentes' => $inc4, 'escenarios' => $esc, 'hitos' => $hitos, 'ranking' => $ranking];
    }

    private static function premiosDe(int $inst, int $j): array
    {
        $o = [];
        foreach (Db::todas('SELECT * FROM festival_premios WHERE instancia_id = ? AND jugador_id = ? ORDER BY id', [$inst, $j]) as $p) {
            $ids = json_decode((string) $p['entregas_json'], true) ?: [];
            $ent = $ids ? array_map([Monedero::class, 'entregaJson'], Db::todas('SELECT * FROM entregas WHERE id IN (' . implode(',', array_map('intval', $ids)) . ') ORDER BY id')) : [];
            $o[] = ['tipo' => $p['tipo'], 'clave' => $p['clave'], 'fichas' => (int) $p['fichas'], 'entregas' => $ent];
        }
        return $o;
    }

    /** GET /api/festival: todo lo que pinta la pantalla del festival. */
    public static function resumen(int $j): array
    {
        self::preparar();
        try { self::tareas(5); } catch (\Throwable $e) { error_log('EN VIVO festival tareas: ' . mb_substr($e->getMessage(), 0, 200)); }
        $t = self::ahora();
        $c = self::ciclo($t);
        $m = Social::miembro($j);
        if ($m) self::otorgarDiarios($j);
        $asoc = $m ? Social::asociacionDe($j) : null;
        $inst = null;
        [$instJ, $motivo, $codigo] = self::puedeJugar($j, $c);
        if ($m && $c['abierto']) $inst = $instJ;
        $fest = $inst ? self::festivalJson($inst, $j) : null;
        $anterior = null;
        if ($m) {
            $a = Db::fila("SELECT * FROM festival_instancias WHERE asociacion_id = ? AND estado = 'cerrado' ORDER BY ciclo DESC LIMIT 1", [$m['asociacion_id']]);
            if ($a) $anterior = ['id' => (int) $a['id'], 'ciclo' => (int) $a['ciclo'], 'nombre' => $a['nombre'], 'porcentaje' => self::porcentaje($a),
                'liga' => ['n' => (int) $a['liga'], 'nombre' => self::LIGAS[(int) $a['liga']]], 'cerrado' => Db::iso((int) $a['cerrado_en']), 'mis_premios' => self::premiosDe((int) $a['id'], $j)];
        }
        $abierto = Db::fila("SELECT * FROM festival_intentos WHERE jugador_id = ? AND estado = 'jugando' ORDER BY id DESC LIMIT 1", [$j]);
        $mis = $inst ? Db::fila("SELECT COALESCE(SUM(calidad), 0) AS puntos, COUNT(*) AS n FROM festival_intentos WHERE instancia_id = ? AND jugador_id = ? AND estado = 'validado'", [$inst['id'], $j]) : null;
        $puesto = null;
        if ($fest) foreach ($fest['ranking'] as $r) if ($r['yo']) $puesto = $r['puesto'];
        $hoy = self::dia($t);
        $vip = Monedero::vipActivo($j);
        $compradas = self::compradosHoy($j);
        $pases = self::pases($j);
        $fama = (int) Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$j]);
        $creditos = Monedero::saldo($j);
        $ligaAsoc = $m ? self::liga((int) $m['asociacion_id']) : 0;
        return [
            'ok' => true,
            'ahora' => Db::iso($t),
            'ciclo' => ['n' => $c['n'], 'abierto' => $c['abierto'], 'abre' => Db::iso($c['abre']), 'cierra' => Db::iso($c['cierra']),
                        'siguiente' => Db::iso($c['siguiente']),
                        'duracion_h' => intdiv(self::DURACION, 3600), 'cada_h' => intdiv(self::CICLO, 3600)],
            'asociacion' => $asoc ? $asoc + ['liga' => ['n' => $ligaAsoc, 'nombre' => self::LIGAS[$ligaAsoc]]] : null,
            'festival' => $fest,
            'yo' => [
                'pases' => $pases, 'pases_tope' => self::PASES_TOPE, 'fichas' => self::fichas($j), 'creditos' => $creditos, 'vip' => $vip,
                'hoy' => ['diario' => (bool) Db::valor('SELECT 1 FROM festival_pases WHERE jugador_id = ? AND ref = ?', [$j, 'diario:' . $hoy]),
                          'vip' => (bool) Db::valor('SELECT 1 FROM festival_pases WHERE jugador_id = ? AND ref = ?', [$j, 'vip:' . $hoy]),
                          'misiones' => (int) Db::valor("SELECT COUNT(*) FROM festival_pases WHERE jugador_id = ? AND dia = ? AND motivo = 'mision'", [$j, $hoy]),
                          'misiones_max' => self::PASES_MISION_MAX_DIA],
                'compra' => ['precio' => self::PRECIO_PASE, 'max_dia' => self::COMPRA_MAX_DIA, 'comprados_hoy' => $compradas,
                             'puede' => $m !== null && $compradas < self::COMPRA_MAX_DIA && $pases < self::PASES_TOPE && $creditos >= self::PRECIO_PASE],
                'puntos' => $mis ? (int) $mis['puntos'] : 0, 'intentos' => $mis ? (int) $mis['n'] : 0, 'puesto' => $puesto,
                'puede_jugar' => $motivo === null && $pases > 0, 'motivo' => $motivo ?? ($pases > 0 ? null : 'No tienes Pases de Prensa.'), 'codigo' => $codigo ?? ($pases > 0 ? null : 'sin_pases'),
                'intento_abierto' => $abierto ? self::intentoJson($abierto, true) : null,
                'topes' => ['habilidad_max' => self::habilidadMax($fama), 'personas_max' => self::PERSONAS_MAX, 'equipos_max' => self::EQUIPOS_MAX, 'fama' => $fama],
            ],
            'premios' => ['aporte' => array_map(fn($p) => ['min' => $p['min'], 'nombre' => $p['nombre'], 'fichas' => $p['fichas'], 'entregas' => self::escalar($p['entregas'], $ligaAsoc)], self::PREMIOS_APORTE),
                          'puesto' => self::PREMIOS_PUESTO, 'cerrar_escenario' => self::FICHAS_CERRAR_ESCENARIO],
            'anterior' => $anterior,
        ];
    }

    private static function json(mixed $v): string { return (string) json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
}
