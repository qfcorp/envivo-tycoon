<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Desafío Técnico del Día (individual, un reto por día igual para todos). Ver server/INTEGRAR_DUELOS_DESAFIO.md.
 *
 * - Cada día de la semana tiene su modificador fijo: lunes lluvia garantizada, martes una sola cámara, miércoles internet
 *   inestable, jueves cliente exigente, viernes apagón, sábado final de campeonato y domingo todo junto.
 * - Todos juegan el mismo contrato, con la misma "maleta" (personal y equipos para elegir con un presupuesto) y la misma
 *   semilla base del día. El servidor usa la primera variante de esa semilla con la que el evento trae lo que pide el día
 *   (por ejemplo la lluvia), así que dos jugadores que eligen lo mismo juegan exactamente el mismo evento.
 * - El juego manda solo las decisiones; el validador (server/validador/) repite la jugada y su calidad es la que cuenta.
 * - 1 intento por día (+1 con VIP). Si no terminas en MINUTOS minutos, el intento se pierde.
 * - Premios: al terminar (una vez por día, según tus estrellas) repuestos, dinero del juego y Pases de Prensa; al cerrar el
 *   día, el top 10 de cada servidor (con al menos MIN_PARTICIPANTES jugadores) recibe más. Nada de esto se vende en el mercado.
 * - Pases de Prensa: UN solo saldo con el Mega Festival (libro festival_pases, Festival::moverPases). Desafio::pases(),
 *   Desafio::sumarPases() y Desafio::gastarPases() escriben ahí.
 */
final class Desafio
{
    public const MINUTOS = 30;
    public const INTENTOS = 1;
    public const VIP_EXTRA = 1;
    public const MIN_PARTICIPANTES = 3;
    public const BUSQUEDA_MAX = 4000;
    public const MORAL = 80;

    /** Modificador por día de la semana (date('N'): 1 = lunes … 7 = domingo). */
    public const MODIFICADORES = [
        1 => ['clave' => 'lluvia', 'nombre' => 'Lluvia garantizada', 'icono' => 'rain',
              'detalle' => 'Partido al aire libre y va a llover sí o sí. Los cobertores valen oro.',
              'contrato' => ['type' => 'barrial', 'cams' => 2, 'diff' => 2, 'audio' => false, 'stream' => true, 'outdoor' => true, 'pay' => 600],
              'requeridos' => ['lluvia'], 'fama' => 20, 'max_camaras' => 6, 'presupuesto' => 26],
        2 => ['clave' => 'una_camara', 'nombre' => 'Una sola cámara', 'icono' => 'cam_basic',
              'detalle' => 'El cliente pide 3 cámaras, pero hoy solo puedes llevar una. Que cada decisión cuente.',
              'contrato' => ['type' => 'lanzamiento', 'cams' => 3, 'diff' => 3, 'audio' => true, 'stream' => true, 'outdoor' => false, 'pay' => 1300],
              'requeridos' => [], 'fama' => 30, 'max_camaras' => 1, 'presupuesto' => 26],
        3 => ['clave' => 'internet', 'nombre' => 'Internet inestable', 'icono' => 'wifi_off',
              'detalle' => 'El internet del local se va a caer en plena transmisión. ¿Tienes respaldo?',
              'contrato' => ['type' => 'graduacion', 'cams' => 2, 'diff' => 2, 'audio' => true, 'stream' => true, 'outdoor' => false, 'pay' => 600],
              'requeridos' => ['internet'], 'fama' => 25, 'max_camaras' => 6, 'presupuesto' => 24],
        4 => ['clave' => 'exigente', 'nombre' => 'Cliente exigente', 'icono' => 'megaphone',
              'detalle' => 'Este cliente espera lo que espera de las productoras más famosas y pide cambios a última hora.',
              'contrato' => ['type' => 'lanzamiento', 'cams' => 3, 'diff' => 3, 'audio' => true, 'stream' => true, 'outdoor' => false, 'pay' => 1400],
              'requeridos' => ['logo'], 'fama' => 90, 'max_camaras' => 6, 'presupuesto' => 30],
        5 => ['clave' => 'apagon', 'nombre' => 'Apagón', 'icono' => 'bolt',
              'detalle' => 'Concierto bajo techo y se va a ir la luz. La UPS decide si sigues al aire.',
              'contrato' => ['type' => 'concierto', 'cams' => 3, 'diff' => 4, 'audio' => true, 'stream' => true, 'outdoor' => false, 'pay' => 2400],
              'requeridos' => ['luz'], 'fama' => 40, 'max_camaras' => 6, 'presupuesto' => 32],
        6 => ['clave' => 'final', 'nombre' => 'Final de campeonato', 'icono' => 'final',
              'detalle' => 'Cinco cámaras, dificultad máxima y todo el país mirando.',
              'contrato' => ['type' => 'final', 'cams' => 5, 'diff' => 5, 'audio' => true, 'stream' => true, 'outdoor' => true, 'pay' => 8000],
              'requeridos' => [], 'fama' => 65, 'max_camaras' => 6, 'presupuesto' => 46],
        7 => ['clave' => 'todo', 'nombre' => 'Todo junto', 'icono' => 'sparkle',
              'detalle' => 'Concierto al aire libre con lluvia, internet que se cae, apagón, cliente exigente y solo dos cámaras.',
              'contrato' => ['type' => 'concierto', 'cams' => 3, 'diff' => 4, 'audio' => true, 'stream' => true, 'outdoor' => true, 'pay' => 3000],
              'requeridos' => ['lluvia', 'internet', 'luz'], 'fama' => 90, 'max_camaras' => 2, 'presupuesto' => 40],
    ];
    public const DIAS = [1 => 'lunes', 2 => 'martes', 3 => 'miércoles', 4 => 'jueves', 5 => 'viernes', 6 => 'sábado', 7 => 'domingo'];
    public const CLIENTES = [
        'barrial' => ['Liga Barrial La Floresta', 'Liga Parroquial Conocoto', 'Liga Barrial El Inca'],
        'graduacion' => ['Colegio Nacional Mejía', 'Unidad Educativa Santa Ana', 'Colegio San Gabriel'],
        'lanzamiento' => ['Cervecería Montaña', 'Bebidas Volcán', 'Motos Kawa-Andes', 'Celulares Nébula'],
        'concierto' => ['Festival Sur Sonoro', 'Productora Tarima Viva', 'Coliseo Rumiñahui'],
        'final' => ['Liga Nacional de Fútbol', 'Federación del Torneo'],
    ];

    /** La maleta del día (igual para todos): [nombre, rol, habilidad, costo, nivel]. costo = puntos del presupuesto. p0 (tú) va siempre y es gratis. */
    public const PERSONAL = [
        'p0' => ['Tú (dueño)', 'camarografo', 2, 0, 'junior'],
        'p1' => ['Kevin Guamán', 'camarografo', 3, 4, 'senior'], 'p2' => ['Andrea Pazmiño', 'camarografo', 2, 2, 'semi_senior'],
        'p3' => ['Mishell Andrade', 'camarografo', 2, 1, 'junior'], 'p4' => ['Luis Toapanta', 'camarografo', 1, 1, 'junior'],
        'p5' => ['Daniela Cedeño', 'director', 3, 4, 'senior'], 'p6' => ['Bryan Lema', 'director', 1, 1, 'junior'],
        'p7' => ['Paola Zambrano', 'sonidista', 3, 3, 'senior'], 'p8' => ['Wilson Ortiz', 'sonidista', 1, 1, 'junior'],
        'p9' => ['Karla Salazar', 'tecnico_transmision', 3, 3, 'senior'], 'p10' => ['Diego Morales', 'tecnico_transmision', 1, 1, 'junior'],
        'p11' => ['Fernando Quishpe', 'productor', 2, 2, 'semi_senior'], 'p12' => ['Tania Villacís', 'cablero', 1, 1, 'junior'],
        'p13' => ['Jonathan Cevallos', 'coordinador_piso', 2, 1, 'junior'], 'p14' => ['Vane Tenorio', 'operador_repeticion', 2, 2, 'semi_senior'],
        'p15' => ['Stalin Chiluisa', 'operador_graficos', 2, 1, 'junior'],
    ];
    /** [tipo, estado %, costo] */
    public const EQUIPOS = [
        'e1' => ['cam_cine', 90, 4], 'e2' => ['cam_pro', 90, 2], 'e3' => ['cam_pro', 90, 2], 'e4' => ['cam_pro', 90, 2],
        'e5' => ['cam_basic', 90, 1], 'e6' => ['cam_basic', 90, 1], 'e7' => ['cam_pro', 35, 0],
        'e8' => ['switch_pro', 90, 3], 'e9' => ['switch_basic', 90, 1], 'e10' => ['audio_pro', 90, 2], 'e11' => ['audio_basic', 90, 1],
        'e12' => ['mics', 90, 1], 'e13' => ['encoder', 90, 1], 'e14' => ['router4g', 90, 1], 'e15' => ['ups', 90, 1], 'e16' => ['raincover', 90, 1],
    ];
    public const ITEMS = [
        'cam_cine' => ['cam', 'Kanon XF615'], 'cam_pro' => ['cam', 'Kanon XA65'], 'cam_basic' => ['cam', 'Zony Handicam FDX-AX44'],
        'switch_pro' => ['switcher', 'Blackmagia ATOM 2 M/E Constelación 4K + panel'], 'switch_basic' => ['switcher', 'Laptop con vMax Básico HD'],
        'audio_pro' => ['audio', 'Mydas MR19 (digital 18 canales)'], 'audio_basic' => ['audio', 'Yamaka MG10XV'],
        'mics' => ['mics', 'Inalámbrico de mano doble Behringa ULM'], 'encoder' => ['encoder', 'Blackmagia Web Presentador 4K'], 'router4g' => ['internet', 'Hotspot 5G NetGir M7'],
        'ups' => ['power', 'APZ Smart-UPS 1500 VA'], 'raincover' => ['rain', 'Cobertor de lluvia básico'],
    ];

    /** Premio por terminar (una vez por día) según estrellas: [cables, baterías, dinero, pases]. */
    public const PREMIO_ESTRELLAS = [1 => [1, 0, 150, 0], 2 => [1, 0, 150, 0], 3 => [2, 1, 300, 1], 4 => [3, 2, 500, 2], 5 => [4, 2, 800, 3]];
    /** Premio del ranking al cerrar el día (top 10 por servidor): [dinero, pases, baterías]. */
    public const PREMIO_PUESTO = [1 => [3000, 5, 3], 2 => [2000, 4, 2], 3 => [1500, 3, 2], 10 => [600, 2, 1]];

    private static bool $listo = false;

    public static function preparar(): void
    {
        if (self::$listo) return;
        Duelos::preparar();   // el mismo archivo migraciones/duelos.sql crea las tablas de los dos
        self::$listo = true;
    }

    /** Atiende /api/desafio* (null si la ruta no es del desafío). */
    public static function ruta(string $ruta, string $metodo): ?array
    {
        $rutas = ['/desafio' => 'GET', '/desafio/ranking' => 'GET', '/desafio/empezar' => 'POST', '/desafio/terminar' => 'POST'];
        if (!isset($rutas[$ruta])) return null;
        Fallo::si($metodo !== $rutas[$ruta], 'Usa ' . $rutas[$ruta] . '.', 405);
        $j = Duelos::sesion();
        return match ($ruta) {
            '/desafio' => self::resumen($j),
            '/desafio/ranking' => self::rankingApi($j, is_string($_GET['dia'] ?? null) ? $_GET['dia'] : null),
            '/desafio/empezar' => self::empezar($j, Http::entrada(10000)),
            '/desafio/terminar' => self::terminar($j, Http::entrada(20000)),
        };
    }

    // ------------------------------------------------------------------ el día
    public static function modificadorDe(string $dia): array
    {
        $n = (int) date('N', (int) strtotime($dia . ' 12:00'));
        return self::MODIFICADORES[$n] + ['dia_semana' => self::DIAS[$n], 'n' => $n];
    }

    /** Fila del día (la crea la primera vez: misma semilla base para todos los servidores). */
    public static function dia(?string $dia = null): array
    {
        self::preparar();
        $dia ??= Monedero::diaLocal();
        $f = Db::fila('SELECT * FROM desafio_dias WHERE dia = ?', [$dia]);
        if ($f) return $f;
        $m = self::modificadorDe($dia);
        $c = $m['contrato'];
        $cl = self::CLIENTES[$c['type']];
        $c['client'] = $cl[crc32('desafio|' . $dia) % count($cl)];
        $c['rival'] = false;
        Db::q('INSERT OR IGNORE INTO desafio_dias (dia, modificador, semilla_base, contrato_json, creado) VALUES (?, ?, ?, ?, ?)',
            [$dia, $m['clave'], random_int(1, 2147483646), Duelos::json($c), time()]);
        return Db::fila('SELECT * FROM desafio_dias WHERE dia = ?', [$dia]);
    }

    public static function maleta(array $m): array
    {
        return [
            'personal' => array_map(fn($id, $p) => ['id' => $id, 'nombre' => $p[0], 'rol' => $p[1], 'rol_nombre' => Duelos::ROLES[$p[1]] ?? $p[1], 'habilidad' => $p[2], 'costo' => $p[3],
                'nivel' => $p[4], 'fijo' => $id === 'p0'],
                array_keys(self::PERSONAL), self::PERSONAL),
            'equipos' => array_map(fn($id, $e) => ['id' => $id, 'type' => $e[0], 'nombre' => self::ITEMS[$e[0]][1], 'cat' => self::ITEMS[$e[0]][0], 'estado' => $e[1], 'costo' => $e[2]],
                array_keys(self::EQUIPOS), self::EQUIPOS),
            'presupuesto' => $m['presupuesto'], 'max_camaras' => $m['max_camaras'],
        ];
    }

    /** Valida la elección de la maleta y arma el intento (sin semilla). */
    public static function armar(array $diaFila, array $in): array
    {
        $m = self::modificadorDe((string) $diaFila['dia']);
        $p = $in['personal'] ?? []; $e = $in['equipos'] ?? [];
        Fallo::si(!is_array($p) || !array_is_list($p) || !is_array($e) || !array_is_list($e), 'Elige personal y equipos de la maleta.', 400, ['codigo' => 'seleccion']);
        $p = array_values(array_unique(array_merge(['p0'], array_map(fn($x) => is_string($x) ? $x : '', $p))));
        $e = array_values(array_unique(array_map(fn($x) => is_string($x) ? $x : '', $e)));
        foreach ($p as $x) Fallo::si(!isset(self::PERSONAL[$x]), 'Esa persona no está en la maleta de hoy.', 400, ['codigo' => 'seleccion']);
        foreach ($e as $x) Fallo::si(!isset(self::EQUIPOS[$x]), 'Ese equipo no está en la maleta de hoy.', 400, ['codigo' => 'seleccion']);
        $costo = array_sum(array_map(fn($x) => self::PERSONAL[$x][3], $p)) + array_sum(array_map(fn($x) => self::EQUIPOS[$x][2], $e));
        Fallo::si($costo > $m['presupuesto'], 'Te pasaste del presupuesto (' . $costo . ' de ' . $m['presupuesto'] . ' puntos).', 400, ['codigo' => 'presupuesto', 'costo' => $costo]);
        $cams = count(array_filter($e, fn($x) => self::ITEMS[self::EQUIPOS[$x][0]][0] === 'cam'));
        Fallo::si($cams < 1, 'Lleva al menos una cámara.', 400, ['codigo' => 'camaras']);
        Fallo::si($cams > $m['max_camaras'], 'Hoy puedes llevar máximo ' . $m['max_camaras'] . ' cámara' . ($m['max_camaras'] > 1 ? 's' : '') . '.', 400, ['codigo' => 'camaras']);
        $staff = array_map(fn($x) => ['name' => self::PERSONAL[$x][0], 'role' => self::PERSONAL[$x][1], 'skill' => self::PERSONAL[$x][2], 'tier' => self::PERSONAL[$x][4],
            'morale' => self::MORAL] + ($x === 'p0' ? ['owner' => true] : []), $p);
        $equip = array_map(fn($x) => ['type' => self::EQUIPOS[$x][0], 'condition' => self::EQUIPOS[$x][1]], $e);
        return [
            'seleccion' => ['personal' => $p, 'equipos' => $e, 'costo' => $costo],
            'intento' => ['contrato' => json_decode((string) $diaFila['contrato_json'], true), 'equipo' => ['staff' => $staff, 'equip' => $equip],
                          'contexto' => ['fama' => $m['fama'], 'dinero' => 1000, 'stock' => ['cable' => 1, 'battery' => 1]], 'vip' => false],
            'requeridos' => $m['requeridos'],
        ];
    }

    private static function maxIntentos(int $j): int { return self::INTENTOS + (Monedero::vipActivo($j) ? self::VIP_EXTRA : 0); }

    /** Los intentos que pasaron su tiempo se pierden. */
    public static function vencer(): int
    {
        self::preparar();
        return Db::q("UPDATE desafio_intentos SET estado = 'vencido', motivo = 'vencido', terminado = ? WHERE estado = 'abierto' AND vence < ?", [time(), time()])->rowCount();
    }

    // ------------------------------------------------------------------ jugar
    /** POST /api/desafio/empezar { personal: ['p1', ...], equipos: ['e2', ...] } */
    public static function empezar(int $j, array $in): array
    {
        self::preparar();
        self::vencer();
        Fallo::si(Limite::contar('desafio:' . $j, 20), 'Demasiados intentos seguidos. Espera unos minutos.', 429);
        $d = self::dia();
        $a = self::armar($d, $in);
        $usados = (int) Db::valor('SELECT COUNT(*) FROM desafio_intentos WHERE dia = ? AND jugador_id = ?', [$d['dia'], $j]);
        Fallo::si((bool) Db::valor("SELECT 1 FROM desafio_intentos WHERE jugador_id = ? AND estado IN ('abierto', 'validando')", [$j]), 'Ya tienes un desafío en curso.', 409, ['codigo' => 'en_curso']);
        Fallo::si($usados >= self::maxIntentos($j), 'Ya jugaste el desafío de hoy. Vuelve mañana' . (Monedero::vipActivo($j) ? '.' : ' (con el Pase VIP tienes un intento más).'), 409, ['codigo' => 'sin_intentos']);
        $r = Repeticion::motor(['accion' => 'semilla', 'intento' => $a['intento'], 'semilla_base' => (int) $d['semilla_base'], 'requeridos' => $a['requeridos'], 'max' => self::BUSQUEDA_MAX]);
        if (empty($r['ok'])) {
            if (($r['motivo'] ?? '') !== 'validador_caido') Db::aviso('desafio_semilla', 'No se pudo preparar el desafío: ' . json_encode($r, JSON_UNESCAPED_UNICODE));
            throw new Fallo('El desafío está en mantenimiento. Intenta otra vez en unos minutos (no se gastó tu intento).', 503, ['codigo' => 'mantenimiento']);
        }
        $intento = ['seed' => (int) $r['seed']] + $a['intento'];
        $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
        $t = time();
        return Db::tx(function () use ($j, $d, $a, $r, $intento, $sid, $t): array {
            $usados = (int) Db::valor('SELECT COUNT(*) FROM desafio_intentos WHERE dia = ? AND jugador_id = ?', [$d['dia'], $j]);
            Fallo::si($usados >= self::maxIntentos($j), 'Ya jugaste el desafío de hoy.', 409, ['codigo' => 'sin_intentos']);
            Db::q('INSERT INTO desafio_intentos (dia, servidor_id, jugador_id, numero, seleccion_json, variante, semilla, intento_json, incidentes_json, estado, version_logica, creado, vence)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'abierto\', ?, ?, ?)',
                [$d['dia'], $sid, $j, $usados + 1, Duelos::json($a['seleccion']), (int) $r['k'], (int) $r['seed'], Duelos::json($intento),
                 Duelos::json($r['incidentes'] ?? []), $r['version_logica'] ?? null, $t, $t + self::MINUTOS * 60]);
            $id = Db::ultimoId();
            return ['ok' => true, 'intento' => $intento + ['intento_id' => $id], 'intento_id' => $id, 'vence' => Db::iso($t + self::MINUTOS * 60),
                    'intentos' => self::intentos($j, (string) $d['dia'])];
        });
    }

    /** POST /api/desafio/terminar { intento_id, decisiones: [n...], resultado?: {quality, stars} } */
    public static function terminar(int $j, array $in): array
    {
        self::preparar();
        $id = $in['intento_id'] ?? null;
        Fallo::si(!is_int($id) || $id < 1, 'Falta "intento_id".', 400);
        $dec = $in['decisiones'] ?? null;
        Fallo::si(!is_array($dec) || !array_is_list($dec) || count($dec) > 20, 'Las decisiones deben ser una lista (máximo 20).', 400, ['codigo' => 'decisiones']);
        foreach ($dec as $x) Fallo::si(!is_int($x) || $x < 0 || $x > 9, 'Decisión no válida.', 400, ['codigo' => 'decisiones']);
        $cli = is_array($in['resultado'] ?? null) && is_int($in['resultado']['quality'] ?? null) && is_int($in['resultado']['stars'] ?? null)
            ? ['quality' => $in['resultado']['quality'], 'stars' => $in['resultado']['stars']] : null;
        $f = Db::tx(function () use ($j, $id, $dec, $cli) {
            $f = Db::fila('SELECT * FROM desafio_intentos WHERE id = ?', [$id]);
            Fallo::si(!$f || (int) $f['jugador_id'] !== $j, 'Ese intento no existe.', 404);
            if (in_array($f['estado'], ['valido', 'invalido'], true)) return $f;
            Fallo::si($f['estado'] === 'vencido' || ($f['estado'] === 'abierto' && (int) $f['vence'] < time()), 'Se acabó el tiempo de este desafío (' . self::MINUTOS . ' minutos).', 410, ['codigo' => 'vencido']);
            Fallo::si($f['estado'] !== 'abierto', 'Este intento ya se está revisando.', 409, ['codigo' => 'revisando']);
            Db::q("UPDATE desafio_intentos SET estado = 'validando', decisiones_json = ?, resultado_cliente_json = ? WHERE id = ? AND estado = 'abierto'",
                [Duelos::json($dec), $cli === null ? null : Duelos::json($cli), $id]);
            return Db::fila('SELECT * FROM desafio_intentos WHERE id = ?', [$id]);
        });
        if ($f['estado'] === 'validando') {
            $intento = json_decode((string) $f['intento_json'], true) + ['decisiones' => $dec];
            if ($cli !== null) $intento['cliente_resultado'] = $cli;
            $v = Repeticion::validar($intento);
            if (($v['detalle']['motivo'] ?? '') === 'validador_caido') {
                Db::q("UPDATE desafio_intentos SET estado = 'pendiente' WHERE id = ? AND estado = 'validando'", [$id]);
                return ['ok' => true, 'pendiente' => true, 'mensaje' => 'Tu jugada quedó guardada. El resultado aparece en unos minutos.'];
            }
            self::finalizar((int) $id, $v);
        }
        $f = Db::fila('SELECT * FROM desafio_intentos WHERE id = ?', [$id]);
        $val = json_decode((string) ($f['validacion_json'] ?? 'null'), true) ?: [];
        $premio = Db::fila("SELECT detalle_json FROM desafio_premios WHERE dia = ? AND jugador_id = ? AND tipo = 'participacion'", [$f['dia'], $j]);
        $rk = self::ranking((string) $f['dia'], (int) $f['servidor_id'], 10);
        return ['ok' => true,
                'resultado' => ['estado' => $f['estado'], 'calidad' => $f['calidad'] === null ? null : (int) $f['calidad'], 'estrellas' => $f['estrellas'] === null ? null : (int) $f['estrellas'],
                                'motivo' => $f['motivo'], 'incidentes' => $val['detalle']['incidentes'] ?? [], 'partes' => $val['detalle']['partes'] ?? []],
                'premio' => $premio ? json_decode((string) $premio['detalle_json'], true) + ['nuevo' => (int) $f['id'] === (int) (json_decode((string) $premio['detalle_json'], true)['intento_id'] ?? 0)] : null,
                'puesto' => self::puesto($j, (string) $f['dia'], (int) $f['servidor_id']), 'ranking' => $rk, 'intentos' => self::intentos($j, (string) $f['dia']),
                'pases_prensa' => self::pases($j)];
    }

    private static function finalizar(int $id, array $v): void
    {
        Db::tx(function () use ($id, $v): void {
            $f = Db::fila('SELECT * FROM desafio_intentos WHERE id = ?', [$id]);
            if (!$f || in_array($f['estado'], ['valido', 'invalido'], true)) return;
            $motivo = $v['detalle']['motivo'] ?? null;
            $cal = is_int($v['calidad'] ?? null) ? $v['calidad'] : null;
            $est = is_int($v['estrellas'] ?? null) ? $v['estrellas'] : null;
            $estado = $cal === null ? 'invalido' : 'valido';
            Db::q('UPDATE desafio_intentos SET estado = ?, calidad = ?, estrellas = ?, validacion_json = ?, version_logica = COALESCE(?, version_logica), sospechoso = ?, motivo = ?, terminado = ? WHERE id = ?',
                [$estado, $cal, $est, Duelos::json($v), $v['version_logica'] ?? null, (int) ($cal === null || $motivo === 'resultado_no_coincide'), $motivo, time(), $id]);
            if ($cal !== null) self::premioParticipacion((int) $f['jugador_id'], (string) $f['dia'], (int) $f['servidor_id'], $est, $id);
        });
    }

    /** Premio por terminar: una vez por día (el primer intento válido). */
    private static function premioParticipacion(int $j, string $dia, int $sid, int $estrellas, int $intento): void
    {
        if (Db::valor("SELECT 1 FROM desafio_premios WHERE dia = ? AND jugador_id = ? AND tipo = 'participacion'", [$dia, $j])) return;
        [$cab, $bat, $din, $pas] = self::PREMIO_ESTRELLAS[max(1, min(5, $estrellas))];
        $ref = 'desafio:' . $dia;
        if ($cab) Monedero::entregar($j, 'consumible', 'cable', $cab, $ref);
        if ($bat) Monedero::entregar($j, 'consumible', 'battery', $bat, $ref);
        if ($din) Monedero::entregar($j, 'dinero', '-', $din, $ref);
        if ($pas) self::sumarPases($j, $pas, 'desafio', $ref);
        Db::q("INSERT INTO desafio_premios (dia, jugador_id, tipo, servidor_id, puesto, detalle_json, creado) VALUES (?, ?, 'participacion', ?, NULL, ?, ?)",
            [$dia, $j, $sid, Duelos::json(['estrellas' => $estrellas, 'cables' => $cab, 'baterias' => $bat, 'dinero' => $din, 'pases' => $pas, 'intento_id' => $intento]), time()]);
    }

    /** Tarea: valida otra vez los intentos que quedaron pendientes (validador caído) o trabados. */
    public static function revalidarPendientes(int $max = 50): int
    {
        self::preparar();
        $n = 0;
        foreach (Db::todas("SELECT * FROM desafio_intentos WHERE estado = 'pendiente' OR (estado = 'validando' AND creado < ?) ORDER BY id LIMIT ?", [time() - 600, $max]) as $f) {
            $intento = json_decode((string) $f['intento_json'], true) + ['decisiones' => json_decode((string) ($f['decisiones_json'] ?? '[]'), true) ?: []];
            if ($f['resultado_cliente_json']) $intento['cliente_resultado'] = json_decode((string) $f['resultado_cliente_json'], true);
            $v = Repeticion::validar($intento);
            if (($v['detalle']['motivo'] ?? '') === 'validador_caido') break;
            self::finalizar((int) $f['id'], $v);
            $n++;
        }
        return $n;
    }

    // ------------------------------------------------------------------ ranking y cierre del día
    /** Mejor intento válido de cada jugador del servidor ese día (desempate: quien terminó primero). */
    public static function ranking(string $dia, int $sid, int $limite = 20): array
    {
        $filas = Db::todas('SELECT x.*, j.alias, j.nombre FROM (
                              SELECT di.*, ROW_NUMBER() OVER (PARTITION BY di.jugador_id ORDER BY di.calidad DESC, di.terminado ASC, di.id ASC) AS rn
                              FROM desafio_intentos di WHERE di.dia = ? AND di.servidor_id = ? AND di.estado = \'valido\') x
                            JOIN jugadores j ON j.id = x.jugador_id WHERE x.rn = 1 ORDER BY x.calidad DESC, x.terminado ASC, x.id ASC LIMIT ?', [$dia, $sid, $limite]);
        return array_map(fn($f, $i) => ['puesto' => $i + 1, 'jugador_id' => (int) $f['jugador_id'], 'nombre' => Social::nombrePublico($f['alias'], $f['nombre']),
            'calidad' => (int) $f['calidad'], 'estrellas' => (int) $f['estrellas'], 'terminado' => Db::iso((int) $f['terminado'])], $filas, array_keys($filas));
    }

    public static function participantes(string $dia, int $sid): int
    {
        return (int) Db::valor("SELECT COUNT(DISTINCT jugador_id) FROM desafio_intentos WHERE dia = ? AND servidor_id = ? AND estado = 'valido'", [$dia, $sid]);
    }

    public static function puesto(int $j, string $dia, int $sid): ?int
    {
        foreach (self::ranking($dia, $sid, 100000) as $r) if ($r['jugador_id'] === $j) return $r['puesto'];
        return null;
    }

    /** Premios del top 10 de cada servidor de un día ya terminado (una sola vez). Devuelve cuántos entregó. */
    public static function cerrarDia(string $dia): int
    {
        self::preparar();
        if ($dia >= Monedero::diaLocal()) return 0;
        return Db::tx(function () use ($dia): int {
            $d = Db::fila('SELECT * FROM desafio_dias WHERE dia = ?', [$dia]);
            if (!$d || $d['cerrado'] !== null) return 0;
            Db::q('UPDATE desafio_dias SET cerrado = ? WHERE dia = ?', [time(), $dia]);
            Db::q("UPDATE desafio_intentos SET estado = 'vencido', motivo = 'vencido', terminado = ? WHERE dia = ? AND estado = 'abierto'", [time(), $dia]);
            $n = 0;
            foreach (Db::todas('SELECT DISTINCT servidor_id FROM desafio_intentos WHERE dia = ?', [$dia]) as $s) {
                $sid = (int) $s['servidor_id'];
                if (self::participantes($dia, $sid) < self::MIN_PARTICIPANTES) continue;
                foreach (self::ranking($dia, $sid, 10) as $r) {
                    [$din, $pas, $bat] = self::PREMIO_PUESTO[$r['puesto']] ?? self::PREMIO_PUESTO[10];
                    $ref = 'desafio_top:' . $dia;
                    Monedero::entregar($r['jugador_id'], 'dinero', '-', $din, $ref);
                    Monedero::entregar($r['jugador_id'], 'consumible', 'battery', $bat, $ref);
                    self::sumarPases($r['jugador_id'], $pas, 'desafio_top', $ref);
                    Db::q("INSERT OR IGNORE INTO desafio_premios (dia, jugador_id, tipo, servidor_id, puesto, detalle_json, creado) VALUES (?, ?, 'ranking', ?, ?, ?, ?)",
                        [$dia, $r['jugador_id'], $sid, $r['puesto'], Duelos::json(['dinero' => $din, 'pases' => $pas, 'baterias' => $bat, 'calidad' => $r['calidad']]), time()]);
                    try { Chat::sistema($r['jugador_id'], '🎯 Desafío Técnico del ' . $dia . ': puesto ' . $r['puesto'] . ' en tu servidor. Premio: $' . number_format($din, 0, ',', '.') . ', ' . $pas . ' Pases de Prensa y ' . $bat . ' batería(s).'); } catch (\Throwable) {}
                    $n++;
                }
            }
            return $n;
        });
    }

    /** Cierra los días anteriores que falten (lo hace solo al abrir el desafío y en la tarea diaria). */
    public static function cerrarPendientes(): int
    {
        self::preparar();
        $n = 0;
        foreach (Db::todas('SELECT dia FROM desafio_dias WHERE cerrado IS NULL AND dia < ? ORDER BY dia LIMIT 14', [Monedero::diaLocal()]) as $d) $n += self::cerrarDia((string) $d['dia']);
        return $n;
    }

    // ------------------------------------------------------------------ Pases de Prensa
    // UN SOLO saldo de Pases de Prensa para todo el juego: el libro festival_pases del Mega Festival (Festival::moverPases:
    // idempotente por ref y con el tope Festival::PASES_TOPE; lo que pase del tope no se suma). Las tablas viejas
    // pases_prensa / pases_prensa_libro ya no se usan (Db las pasó a festival_pases).
    public const MOTIVOS_PASES = ['diario', 'vip', 'mision', 'compra', 'intento', 'ajuste', 'desafio', 'desafio_top', 'gasto'];

    public static function pases(int $j): int { Festival::preparar(); return Festival::pases($j); }

    /** Suma ($n > 0) o resta pases. Devuelve el saldo. Sin pases suficientes: 402 sin_pases. La misma ref no cuenta dos veces. */
    public static function sumarPases(int $j, int $n, string $motivo, ?string $ref = null): int
    {
        Festival::preparar();
        $m = in_array($motivo, self::MOTIVOS_PASES, true) ? $motivo : ($n < 0 ? 'gasto' : 'ajuste');
        $ref = mb_substr(($ref ?? ($motivo . ':' . bin2hex(random_bytes(8)))), 0, 200);
        Festival::moverPases($j, $n, $m, $ref);
        return Festival::pases($j);
    }

    public static function gastarPases(int $j, int $n, string $motivo, ?string $ref = null): int
    {
        Fallo::si($n < 1, 'Cantidad no válida.', 400);
        return self::sumarPases($j, -$n, $motivo, $ref);
    }

    // ------------------------------------------------------------------ lectura
    private static function intentos(int $j, string $dia): array
    {
        $usados = (int) Db::valor('SELECT COUNT(*) FROM desafio_intentos WHERE dia = ? AND jugador_id = ?', [$dia, $j]);
        $max = self::maxIntentos($j);
        return ['usados' => $usados, 'max' => $max, 'restantes' => max(0, $max - $usados)];
    }

    /** GET /api/desafio */
    public static function resumen(int $j): array
    {
        self::preparar();
        self::vencer();
        self::cerrarPendientes();
        $d = self::dia();
        $dia = (string) $d['dia'];
        $m = self::modificadorDe($dia);
        $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
        $abierto = Db::fila("SELECT * FROM desafio_intentos WHERE jugador_id = ? AND dia = ? AND estado IN ('abierto', 'pendiente', 'validando') ORDER BY id DESC LIMIT 1", [$j, $dia]);
        $mejor = Db::fila("SELECT calidad, estrellas FROM desafio_intentos WHERE jugador_id = ? AND dia = ? AND estado = 'valido' ORDER BY calidad DESC, terminado ASC LIMIT 1", [$j, $dia]);
        $ayer = date('Y-m-d', (int) strtotime($dia . ' -1 day'));
        $premioAyer = Db::fila("SELECT puesto, detalle_json FROM desafio_premios WHERE dia = ? AND jugador_id = ? AND tipo = 'ranking'", [$ayer, $j]);
        $semana = [];
        for ($i = 1; $i <= 7; $i++) $semana[] = ['n' => $i, 'dia' => self::DIAS[$i], 'clave' => self::MODIFICADORES[$i]['clave'], 'nombre' => self::MODIFICADORES[$i]['nombre'], 'icono' => self::MODIFICADORES[$i]['icono'], 'hoy' => $i === $m['n']];
        return [
            'ok' => true, 'dia' => $dia,
            'modificador' => ['clave' => $m['clave'], 'nombre' => $m['nombre'], 'detalle' => $m['detalle'], 'icono' => $m['icono'], 'dia_semana' => $m['dia_semana'], 'requeridos' => $m['requeridos']],
            'contrato' => json_decode((string) $d['contrato_json'], true),
            'contexto' => ['fama' => $m['fama']],
            'maleta' => self::maleta($m),
            'intentos' => self::intentos($j, $dia),
            'abierto' => $abierto ? ['intento_id' => (int) $abierto['id'], 'estado' => $abierto['estado'], 'vence' => Db::iso((int) $abierto['vence'])]
                + ($abierto['estado'] === 'abierto' ? ['intento' => json_decode((string) $abierto['intento_json'], true) + ['intento_id' => (int) $abierto['id']]] : []) : null,
            'mi_mejor' => $mejor ? ['calidad' => (int) $mejor['calidad'], 'estrellas' => (int) $mejor['estrellas'], 'puesto' => self::puesto($j, $dia, $sid)] : null,
            'ranking' => array_map(fn($r) => $r + ['yo' => $r['jugador_id'] === $j], self::ranking($dia, $sid, 20)),
            'participantes' => self::participantes($dia, $sid),
            'premios' => ['por_estrellas' => self::PREMIO_ESTRELLAS, 'por_puesto' => self::PREMIO_PUESTO, 'minimo_participantes' => self::MIN_PARTICIPANTES],
            'pases_prensa' => self::pases($j),
            'cierra' => Db::iso((int) strtotime($dia . ' 23:59:59')),
            'ayer' => $premioAyer ? ['puesto' => (int) $premioAyer['puesto']] + json_decode((string) $premioAyer['detalle_json'], true) : null,
            'semana' => $semana,
            'minutos' => self::MINUTOS,
        ];
    }

    public static function rankingApi(int $j, ?string $dia): array
    {
        self::preparar();
        $dia = $dia !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dia) ? $dia : Monedero::diaLocal();
        $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
        return ['ok' => true, 'dia' => $dia, 'ranking' => self::ranking($dia, $sid, 50), 'participantes' => self::participantes($dia, $sid), 'mi_puesto' => self::puesto($j, $dia, $sid)];
    }

    /** Bloque pequeño para GET /api/estado ("desafio"). */
    public static function estado(int $j): array
    {
        self::preparar();
        $dia = Monedero::diaLocal();
        $m = self::modificadorDe($dia);
        $i = self::intentos($j, $dia);
        return ['dia' => $dia, 'modificador' => $m['clave'], 'nombre' => $m['nombre'], 'icono' => $m['icono'], 'restantes' => $i['restantes'],
                'jugado_hoy' => $i['usados'] > 0, 'pases_prensa' => self::pases($j)];
    }
}
