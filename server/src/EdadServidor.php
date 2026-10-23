<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Edad del servidor (como Kingshot): lo que se abre según los días que tiene el servidor (conexión y reglas:
 * server/INTEGRAR_EDAD_SERVIDOR.md).
 *
 * - Día del servidor: día 1 = la fecha (America/Guayaquil) en que se creó (servidores.creado); cada desbloqueo se abre a
 *   las 00:00 del día que le toca. edad_dias = dia − 1.
 * - VETERANOS: los servidores que ya existían (servidores.creado <= corte, ver migraciones/edad_servidor.sql) tienen TODO
 *   abierto: nadie pierde algo que ya jugaba. El tutorial y el juego local nunca se cierran.
 * - Se cierra en el SERVIDOR (no solo en la pantalla): revisarRuta() responde 403 'edad_servidor' a los POST de un modo que
 *   todavía no se abre, con el texto "Se abre el día 7 del servidor (en 3 días)." y los datos para la cuenta regresiva.
 *   Los GET (mirar) siguen funcionando. La Copa además no mete en su calendario a un servidor que todavía no la tiene
 *   (Copas::asegurarCopa → filtrarAbiertos).
 * - Configuración (config.env): EDAD_SERVIDOR=apagado (todo abierto), EDAD_SERVIDOR_DIAS="duelos=3,festival=5,copa=7",
 *   EDAD_SERVIDOR_CORTE (fecha ISO o segundos Unix) para cambiar quién es veterano.
 * Ganchos para pruebas: EdadServidor::$reloj.
 */
final class EdadServidor
{
    public const ZONA = 'America/Guayaquil';

    /**
     * Línea de tiempo del servidor. dia = día del servidor en que se abre (1 = desde que nace).
     * modo = ficha de la pestaña "En línea" que la pantalla bloquea; rutas = POST /api/... que el servidor cierra antes.
     * Los textos para el jugador viven en js/edad_servidor.js (10 idiomas); estos en español son el respaldo.
     */
    public const LINEA = [
        'apertura' => ['dia' => 1, 'icono' => 'home', 'modo' => null, 'rutas' => [],
            'nombre' => 'Apertura del servidor',
            'detalle' => 'Tu productora, la Liga Semanal, el Desafío del Día, el Mercado, el chat, las asociaciones y la sede.'],
        'duelos' => ['dia' => 3, 'icono' => 'rival', 'modo' => 'duelos', 'rutas' => ['/duelos/equipo', '/duelos/retar', '/duelos/jugar', '/duelos/extra'],
            'nombre' => 'Duelo de Productoras',
            'detalle' => 'Reta a otras productoras de tu servidor con tu mejor equipo y sube de liga.'],
        'festival' => ['dia' => 5, 'icono' => 'festival', 'modo' => 'festival', 'rutas' => ['/festival/intento/iniciar', '/festival/intento/enviar', '/festival/pases/comprar'],
            'nombre' => 'Mega Festival',
            'detalle' => 'Tu asociación produce junta un festival gigante con 6 escenarios, cada 2 días.'],
        'copa' => ['dia' => 7, 'icono' => 'crown', 'modo' => 'copa', 'rutas' => ['/copa/equipo', '/copa/intento/iniciar', '/copa/intento/enviar', '/pase_copa/comprar'],
            'nombre' => 'Copa de Servidores',
            'detalle' => 'Tu servidor contra los demás servidores del universo: preparación de lunes a viernes y batalla el sábado.'],
    ];

    public static ?int $reloj = null;
    private static bool $listo = false;
    /** @var array<int, array> */
    private static array $cache = [];

    public static function ahora(): int { return self::$reloj ?? time(); }
    private static function zona(): \DateTimeZone { return new \DateTimeZone(self::ZONA); }
    public static function apagado(): bool { return in_array(strtolower(trim(Config::get('EDAD_SERVIDOR'))), ['apagado', 'off', '0', 'no'], true); }
    public static function olvidar(): void { self::$cache = []; }

    public static function preparar(): void
    {
        if (self::$listo) return;
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'servidor_edad_ajustes'")) Migraciones::aplicar('edad_servidor.sql');
        self::$listo = true;
    }

    private static function ajuste(string $clave): ?string
    {
        self::preparar();
        $v = Db::valor('SELECT valor FROM servidor_edad_ajustes WHERE clave = ?', [$clave]);
        return $v === null ? null : (string) $v;
    }

    /** Segundos Unix: EDAD_SERVIDOR_CORTE (ISO o número) o el que fijó la migración. Servidores creados hasta aquí = veteranos. */
    public static function corte(): int
    {
        $c = trim(Config::get('EDAD_SERVIDOR_CORTE'));
        if ($c !== '') {
            if (ctype_digit($c)) return (int) $c;
            $t = strtotime($c);
            if ($t !== false) return $t;
        }
        $v = self::ajuste('corte');
        return $v !== null && ctype_digit($v) ? (int) $v : PHP_INT_MAX;   // sin corte (no debería pasar): todos veteranos
    }

    /** Día en que se abre cada desbloqueo (con EDAD_SERVIDOR_DIAS="duelos=3,festival=5,copa=7"). */
    public static function dias(): array
    {
        $o = array_map(fn($d) => (int) $d['dia'], self::LINEA);
        foreach (preg_split('/[,;\s]+/', Config::get('EDAD_SERVIDOR_DIAS'), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $par) {
            if (preg_match('/^(\w+)=(\d{1,3})$/', $par, $m) && isset($o[$m[1]]) && $m[1] !== 'apertura') $o[$m[1]] = max(1, (int) $m[2]);
        }
        return $o;
    }

    /** Medianoche (Guayaquil) del día en que cae $t. */
    private static function medianoche(int $t): \DateTimeImmutable
    {
        return (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona())->setTime(0, 0);
    }

    /**
     * Edad de un servidor: {id, nombre, dia, edad_dias, veterano, inicio (seg), desbloqueos:[...], proximos:[...]}, o null
     * si no existe. Cada desbloqueo: {clave, dia, nombre, detalle, icono, modo, abierto, abre (seg), faltan_dias}.
     */
    public static function de(int $sid, ?int $t = null): ?array
    {
        $t ??= self::ahora();
        $k = $sid . '@' . $t;
        if (isset(self::$cache[$k])) return self::$cache[$k];
        $s = Db::fila('SELECT id, nombre, creado FROM servidores WHERE id = ?', [$sid]);
        if (!$s) return null;
        $creado = (int) ($s['creado'] ?? 0);
        $otro = self::ajuste('inicio:' . $sid);
        $inicio = $otro !== null && ctype_digit($otro) ? (int) $otro : $creado;
        // Veterano: ya existía cuando llegó esta regla (y nadie le reinició la línea de tiempo), o no se sabe cuándo nació
        $veterano = self::apagado() || ($otro === null && ($creado <= 0 || $creado <= self::corte()));
        $d0 = self::medianoche($inicio > 0 ? $inicio : $t);
        $hoy = self::medianoche($t);
        $dia = max(1, (int) $d0->diff($hoy)->format('%r%a') + 1);
        $lin = [];
        foreach (self::dias() as $clave => $dd) {
            $L = self::LINEA[$clave];
            $abre = $d0->modify('+' . ($dd - 1) . ' days')->getTimestamp();
            $abierto = $veterano || $dia >= $dd;
            $lin[] = ['clave' => $clave, 'dia' => $dd, 'nombre' => $L['nombre'], 'detalle' => $L['detalle'], 'icono' => $L['icono'], 'modo' => $L['modo'],
                      'abierto' => $abierto, 'abre' => $abre, 'faltan_dias' => $abierto ? 0 : $dd - $dia];
        }
        usort($lin, fn($a, $b) => [$a['dia'], $a['clave']] <=> [$b['dia'], $b['clave']]);
        $o = ['id' => (int) $s['id'], 'nombre' => (string) $s['nombre'], 'dia' => $dia, 'edad_dias' => $dia - 1, 'veterano' => $veterano,
              'inicio' => $inicio, 'desbloqueos' => $lin, 'proximos' => array_values(array_filter($lin, fn($x) => !$x['abierto']))];
        if (count(self::$cache) > 64) self::$cache = [];
        return self::$cache[$k] = $o;
    }

    public static function servidorDe(int $jugador): int
    {
        return (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$jugador]);
    }

    /** ¿Ya se abrió $clave en el servidor $sid? (servidor que no existe o clave desconocida: abierto). */
    public static function abierto(int $sid, string $clave, ?int $t = null): bool
    {
        if (!isset(self::LINEA[$clave]) || $sid < 1) return true;
        $e = self::de($sid, $t);
        if ($e === null) return true;
        foreach ($e['desbloqueos'] as $d) if ($d['clave'] === $clave) return $d['abierto'];
        return true;
    }

    /** Solo los servidores que ya tienen $clave abierto (la Copa arma su calendario con estos). */
    public static function filtrarAbiertos(array $ids, string $clave, ?int $t = null): array
    {
        return array_values(array_filter($ids, fn($sid) => self::abierto((int) $sid, $clave, $t)));
    }

    /** "Se abre el día 7 del servidor (en 3 días)." */
    public static function mensaje(array $d): string
    {
        $f = (int) $d['faltan_dias'];
        return 'Se abre el día ' . (int) $d['dia'] . ' del servidor (' . ($f <= 1 ? 'mañana' : 'en ' . $f . ' días') . ').';
    }

    private static function json(array $d): array
    {
        return ['clave' => $d['clave'], 'dia' => $d['dia'], 'nombre' => $d['nombre'], 'detalle' => $d['detalle'], 'icono' => $d['icono'], 'modo' => $d['modo'],
                'abierto' => $d['abierto'], 'abre' => Db::iso($d['abre']), 'faltan_dias' => $d['faltan_dias'], 'mensaje' => $d['abierto'] ? null : self::mensaje($d)];
    }

    /** Lanza el mismo 403 'edad_servidor' que revisarRuta si $clave todavía no se abre en el servidor $sid. */
    public static function exigir(int $sid, string $clave, ?int $t = null): void
    {
        if (self::apagado() || $sid < 1) return;
        $e = self::de($sid, $t);
        if ($e === null) return;
        foreach ($e['desbloqueos'] as $d) if ($d['clave'] === $clave && !$d['abierto']) throw self::fallo($d);
    }

    private static function fallo(array $d): Fallo
    {
        return new Fallo(self::mensaje($d), 403, ['codigo' => 'edad_servidor', 'desbloqueo' => $d['clave'], 'dia' => $d['dia'],
            'faltan_dias' => $d['faltan_dias'], 'abre' => Db::iso($d['abre'])]);
    }

    /** Desbloqueo cerrado al que pertenece una ruta POST, para el jugador (null = se puede). */
    public static function bloqueoRuta(string $ruta, int $jugador): ?array
    {
        $clave = null;
        foreach (self::LINEA as $k => $L) if (in_array($ruta, $L['rutas'], true)) { $clave = $k; break; }
        if ($clave === null) return null;
        $e = self::de(self::servidorDe($jugador));
        if ($e === null) return null;
        foreach ($e['desbloqueos'] as $d) if ($d['clave'] === $clave && !$d['abierto']) return $d;
        return null;
    }

    /**
     * api.php la llama antes de las rutas de los módulos: un POST a un modo que todavía no se abre en el servidor del jugador
     * → 403 {codigo: 'edad_servidor', desbloqueo, dia, faltan_dias, abre}. Sin sesión no hace nada (el módulo responde 401).
     */
    public static function revisarRuta(string $ruta, string $metodo, callable|int|null $jugador): void
    {
        if ($metodo !== 'POST' || self::apagado()) return;
        $hay = false;
        foreach (self::LINEA as $L) if (in_array($ruta, $L['rutas'], true)) { $hay = true; break; }
        if (!$hay) return;
        if (is_callable($jugador)) $jugador = $jugador();   // la sesión se busca solo si la ruta tiene candado
        if (!is_int($jugador)) return;
        $d = self::bloqueoRuta($ruta, $jugador);
        if ($d === null) return;
        throw self::fallo($d);
    }

    // ------------------------------------------------------------------ /api/estado y /api/servidor/calendario
    /** Clave 'edad_servidor' para /api/estado: {servidor_id, dia, edad_dias, veterano, ahora, desbloqueos, proximos} o null. */
    public static function resumen(int $jugador): ?array
    {
        $e = self::de(self::servidorDe($jugador));
        if ($e === null) return null;
        return ['servidor_id' => $e['id'], 'dia' => $e['dia'], 'edad_dias' => $e['edad_dias'], 'veterano' => $e['veterano'], 'ahora' => Db::iso(self::ahora()),
                'desbloqueos' => array_map([self::class, 'json'], $e['desbloqueos']), 'proximos' => array_map([self::class, 'json'], $e['proximos'])];
    }

    /** Agrega 'edad_servidor' a una respuesta de /api/estado (arreglo). Nunca rompe /api/estado. */
    public static function agregarAEstado(?int $jugador, array $estado): array
    {
        try {
            if ($jugador === null || empty($estado['logueado']) || array_key_exists('edad_servidor', $estado)) return $estado;
            $r = self::resumen($jugador);
            if ($r !== null) $estado['edad_servidor'] = $r;
        } catch (\Throwable $ex) {
            error_log('EN VIVO edad_servidor: estado ' . mb_substr($ex->getMessage(), 0, 200));
        }
        return $estado;
    }

    /**
     * api.php: para GET /api/estado con sesión deja un filtro de salida que agrega 'edad_servidor' al JSON (así la línea de
     * '/estado', que fijan las pruebas de Discord y Fusiones, no cambia, y 'servidor' queda igual que siempre).
     */
    public static function decorarEstado(string $ruta, string $metodo, callable $jugador): void
    {
        if ($ruta !== '/estado' || $metodo !== 'GET') return;
        // Se calcula ANTES (la base sigue abierta); el filtro de salida solo junta el JSON, sin tocar la base
        try {
            $j = $jugador();
            $r = is_int($j) ? self::resumen($j) : null;
        } catch (\Throwable $ex) {
            error_log('EN VIVO edad_servidor: estado ' . mb_substr($ex->getMessage(), 0, 200));
            $r = null;
        }
        if ($r === null) return;
        ob_start(function (string $salida) use ($r): string {
            try {
                if (http_response_code() !== 200) return $salida;
                $d = json_decode($salida, true);
                if (!is_array($d) || ($d['ok'] ?? null) !== true || empty($d['logueado']) || array_key_exists('edad_servidor', $d)) return $salida;
                $n = json_encode($d + ['edad_servidor' => $r], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return is_string($n) ? $n : $salida;
            } catch (\Throwable) {
                return $salida;
            }
        });
    }

    public const RUTAS = ['/servidor/calendario' => 'GET'];
    public static function esRuta(string $ruta): bool { return isset(self::RUTAS[$ruta]); }

    /** GET /api/servidor/calendario → {ok, servidor, desbloqueos, proximos, ahora, copa_semana, recurrentes} */
    public static function calendario(int $jugador): array
    {
        $sid = self::servidorDe($jugador);
        Fallo::si($sid < 1, 'Tu productora todavía no tiene servidor.', 409, ['codigo' => 'sin_servidor']);
        $e = self::de($sid);
        Fallo::si($e === null, 'Tu productora todavía no tiene servidor.', 409, ['codigo' => 'sin_servidor']);
        return [
            'ok' => true,
            'servidor' => ['id' => $e['id'], 'nombre' => $e['nombre'], 'dia' => $e['dia'], 'edad_dias' => $e['edad_dias'], 'veterano' => $e['veterano'], 'inicio' => Db::iso($e['inicio'] ?: null)],
            'ahora' => Db::iso(self::ahora()),
            'desbloqueos' => array_map([self::class, 'json'], $e['desbloqueos']),
            'proximos' => array_map([self::class, 'json'], $e['proximos']),
            'copa_semana' => class_exists(CopaTemas::class) ? CopaTemas::semanaJson(self::ahora()) : [],
            'recurrentes' => [
                ['clave' => 'liga', 'nombre' => 'Liga Semanal', 'cada' => 'semana'],
                ['clave' => 'desafio', 'nombre' => 'Desafío del Día', 'cada' => 'dia'],
                ['clave' => 'festival', 'nombre' => 'Mega Festival', 'cada' => '2_dias'],
                ['clave' => 'copa', 'nombre' => 'Copa de Servidores', 'cada' => 'semana'],
            ],
        ];
    }

    public static function responder(string $ruta, string $metodo, int $jugador): array
    {
        $esperado = self::RUTAS[$ruta] ?? null;
        Fallo::si($esperado === null, 'No encontrado.', 404);
        Fallo::si($metodo !== $esperado, 'Usa ' . $esperado . '.', 405, ['codigo' => 'metodo_no_permitido']);
        return self::calendario($jugador);
    }

    // ------------------------------------------------------------------ Centro de Control (auditado)
    /** Reinicia (o con null devuelve a lo normal) la línea de tiempo de un servidor desde $inicio. */
    public static function fijarInicio(int $sid, ?int $inicio, string $quien): void
    {
        self::preparar();
        Fallo::si(!Db::valor('SELECT 1 FROM servidores WHERE id = ?', [$sid]), 'Ese servidor no existe.', 404, ['codigo' => 'no_existe']);
        if ($inicio === null) Db::q('DELETE FROM servidor_edad_ajustes WHERE clave = ?', ['inicio:' . $sid]);
        else Db::q('INSERT INTO servidor_edad_ajustes (clave, valor, actualizado) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado',
            ['inicio:' . $sid, (string) $inicio, time()]);
        self::olvidar();
        Auditoria::anotar($quien, 'edad_servidor_inicio', 'Servidor ' . $sid . ': ' . ($inicio === null ? 'línea de tiempo normal' : 'reinicia desde ' . date('c', $inicio)));
    }
}
