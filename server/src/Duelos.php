<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Duelo de Productoras (asincrónico, jugador contra jugador del mismo servidor). Ver server/INTEGRAR_DUELOS_DESAFIO.md.
 *
 * - Cada jugador registra su "mejor equipo de duelo": su personal (resumen que manda el juego, validado contra su fama
 *   pública y su personal comprado) y los equipos de su INVENTARIO DEL SERVIDOR. A eso el servidor le suma el kit básico
 *   de duelo, igual para todos. Nada del equipo sale de la partida guardada.
 * - Retar: el servidor elige la semilla (random_int), el contrato (tablero del día del servidor: fácil, medio, difícil)
 *   y el contexto (igual para los dos). Arma los dos intentos con la MISMA semilla y la misma cantidad de cámaras (la que
 *   pide el contrato), así el sorteo de imprevistos es el mismo para los dos. El fantasma del defensor (IA "prudente")
 *   se juega en ese momento con server/eventos/motor.js y queda guardado (el retador no lo ve hasta terminar).
 * - Jugar: el retador juega en vivo y manda SOLO sus decisiones. Se repiten en el validador (server/validador/): la
 *   calidad que cuenta es SIEMPRE la del validador. Una semilla, un intento: al recibir las decisiones el duelo se cierra.
 * - Si el retador no termina en MINUTOS minutos, pierde (no se puede abandonar un duelo que va mal).
 * - 5 intentos gratis por día (+1 con VIP) y hasta 5 extra a 20 créditos cada uno.
 * - Puntaje tipo Elo por temporada (mes): K = 32 para el retador y 16 para el defensor; mínimo 100.
 * - Fama: ganar un duelo da (dificultad - 1) de fama; defender con éxito da 1 (máximo 10 de fama por día por duelos).
 *   Se entrega como entrega tipo "fama" (la aplica js/duelos.js). Premios de fin de temporada al top 10 de cada servidor.
 */
final class Duelos
{
    public const GRATIS_DIA = 5;
    public const VIP_EXTRA = 1;
    public const EXTRA_PRECIO = 20;
    public const EXTRA_MAX = 5;
    public const MINUTOS = 20;
    public const RATING_INICIAL = 1000;
    public const RATING_MIN = 100;
    public const K_RETADOR = 32;
    public const K_DEFENSOR = 16;
    public const MAX_PAR_DIA = 3;
    public const FAMA_TOPE_DIA = 10;
    public const MAX_PERSONAL = 12;
    public const MAX_INVENTARIO = 12;
    public const POLITICA = 'prudente';
    public const MORAL = 80;
    /** Igual para los dos lados de todos los duelos (la exigencia del cliente depende de la fama). */
    public const CONTEXTO = ['fama' => 30, 'dinero' => 1000, 'stock' => ['cable' => 1, 'battery' => 1]];
    public const LIGAS = [[0, 'Bronce'], [1100, 'Plata'], [1250, 'Oro'], [1400, 'Platino'], [1600, 'Diamante']];
    /** Roles del juego (js/datos.js ROLES_DATA). Las claves viejas (cam, dir, audio, stream) se aceptan y se traducen. */
    public const ROLES = [
        'director' => 'Realizador / director', 'productor' => 'Productor / coordinador', 'camarografo' => 'Camarógrafo', 'operador_ptz' => 'Operador de cámaras robóticas (PTZ)',
        'cablero' => 'Asistente de cámara / cablero', 'sonidista' => 'Sonidista', 'microfonista' => 'Microfonista / boom', 'operador_repeticion' => 'Operador de repeticiones',
        'operador_graficos' => 'Operador de gráficos', 'shader' => 'Ingeniero de video (shader)', 'tecnico_transmision' => 'Técnico de transmisión',
        'piloto_dron' => 'Piloto de dron', 'coordinador_piso' => 'Coordinador de piso', 'runner' => 'Asistente de producción (runner)',
    ];
    public const ROL_ALIAS = ['cam' => 'camarografo', 'dir' => 'director', 'audio' => 'sonidista', 'stream' => 'tecnico_transmision'];
    /** Nivel de experiencia => [fama mínima para tenerlo, ayuda en imprevistos (como TIERS_DATA.bonus)] */
    public const NIVELES_PERSONAL = ['junior' => [0, 0], 'semi_senior' => [0, 0.5], 'senior' => [18, 1], 'internacional' => [45, 1.5]];
    /** Además de cámaras, director, sonidista y técnico de transmisión, entra 1 persona de cada uno de estos roles (en este orden). */
    public const ROLES_APOYO = ['productor', 'cablero', 'operador_repeticion', 'operador_graficos', 'coordinador_piso', 'microfonista', 'shader', 'operador_ptz', 'piloto_dron', 'runner'];

    /** Kit básico de duelo (igual para todos): [tipo, cantidad]. Estado 85 %. */
    public const KIT = [['cam_pro', 4], ['switch_basic', 1], ['audio_basic', 1], ['mics', 1], ['encoder', 1], ['router4g', 1], ['ups', 1], ['raincover', 1]];
    public const KIT_ESTADO = 85;

    /** Equipos que pueden ir a un duelo: [es cámara, orden entre cámaras, nombre]. Los del inventario van TODOS (salvo cámaras de más). */
    public const EQUIPOS = [
        'cam_pro' => [true, 2, 'Kanon XA65'], 'switch_basic' => [false, 0, 'Laptop con vMax Básico HD'],
        'audio_basic' => [false, 0, 'Yamaka MG10XV'], 'mics' => [false, 0, 'Inalámbrico de mano doble Behringa ULM'],
        'encoder' => [false, 0, 'Blackmagia Web Presentador 4K'], 'router4g' => [false, 0, 'Hotspot 5G NetGir M7'],
        'ups' => [false, 0, 'APZ VoltGuard 1500 VA'], 'raincover' => [false, 0, 'Cobertor de lluvia básico'],
        'dron4k' => [true, 5, 'DGI Inspira 3X Cine (dron) Exclusivo'], 'grua' => [true, 4, 'Grúa telescópica de 12 m con cabeza remota'],
        'unidad_movil' => [false, 0, 'Sprinto OB equipada (4 a 6 cámaras)'], 'generador' => [false, 0, 'Kummins 22 kVA diésel insonorizado'],
        'vip_cam8k' => [true, 6, 'Zony HDK-3600 4K HDR Edición VIP (con lente box 107x)'], 'vip_switcher' => [false, 0, 'Rozz Carbonita Ultra Edición VIP'],
        'vip_satelital' => [false, 0, 'Enlace satelital portátil (flyaway) Edición VIP'],
    ];
    public const VIP_ITEMS = ['vip_cam8k', 'vip_switcher', 'vip_satelital'];

    /** Tablero de contratos del día (uno por nivel; cambia cada día y por servidor). Todos se transmiten (stream). */
    public const NIVELES = [
        'facil' => [['type' => 'barrial', 'cams' => 2, 'diff' => 2, 'audio' => false, 'outdoor' => true, 'pay' => 500],
                    ['type' => 'graduacion', 'cams' => 2, 'diff' => 2, 'audio' => true, 'outdoor' => false, 'pay' => 550]],
        'medio' => [['type' => 'lanzamiento', 'cams' => 3, 'diff' => 3, 'audio' => true, 'outdoor' => false, 'pay' => 1300],
                    ['type' => 'lanzamiento', 'cams' => 3, 'diff' => 3, 'audio' => true, 'outdoor' => true, 'pay' => 1400]],
        'dificil' => [['type' => 'concierto', 'cams' => 4, 'diff' => 4, 'audio' => true, 'outdoor' => true, 'pay' => 2600],
                      ['type' => 'ligapro', 'cams' => 4, 'diff' => 4, 'audio' => true, 'outdoor' => true, 'pay' => 3600]],
    ];
    public const CLIENTES = [
        'barrial' => ['Liga Barrial La Floresta', 'Liga Parroquial Conocoto', 'Liga Barrial El Inca'],
        'graduacion' => ['Colegio Nacional Mejía', 'Unidad Educativa Santa Ana', 'Colegio San Gabriel'],
        'lanzamiento' => ['Cervecería Montaña', 'Bebidas Volcán', 'Motos Kawa-Andes', 'Celulares Nébula'],
        'concierto' => ['Festival Sur Sonoro', 'Productora Tarima Viva', 'Coliseo Rumiñahui'],
        'ligapro' => ['Club Atlético del Valle', 'Deportivo Cumbayá FC', 'Sporting Pichincha'],
    ];
    /** Premios de fin de temporada por puesto (top 10 por servidor, con al menos 3 duelos en la temporada). */
    public const PREMIOS_TEMPORADA = [1 => [5000, 5], 2 => [3000, 4], 3 => [2000, 3], 4 => [1000, 2], 10 => [1000, 2]];
    public const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    private static bool $listo = false;

    // ------------------------------------------------------------------ esquema y rutas
    public static function preparar(): void
    {
        if (self::$listo) return;
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pases_prensa_libro'")) Migraciones::aplicar('duelos.sql');
        self::$listo = true;
    }

    /**
     * Atiende /api/duelos* (devuelve null si la ruta no es de duelos). api.php: ver INTEGRAR_DUELOS_DESAFIO.md.
     * Lanza Fallo (401 sin sesión, 405 método, 4xx reglas).
     */
    public static function ruta(string $ruta, string $metodo): ?array
    {
        $rutas = ['/duelos' => 'GET', '/duelos/ranking' => 'GET', '/duelos/equipo' => 'POST', '/duelos/retar' => 'POST', '/duelos/jugar' => 'POST', '/duelos/extra' => 'POST'];
        if (!isset($rutas[$ruta])) return null;
        Fallo::si($metodo !== $rutas[$ruta], 'Usa ' . $rutas[$ruta] . '.', 405);
        $j = self::sesion();
        return match ($ruta) {
            '/duelos' => self::resumen($j),
            '/duelos/ranking' => self::ranking($j),
            '/duelos/equipo' => self::guardarEquipo($j, Http::entrada(20000)),
            '/duelos/retar' => self::retar($j, Http::entrada(10000)),
            '/duelos/jugar' => self::jugar($j, Http::entrada(20000)),
            '/duelos/extra' => self::comprarExtra($j),
        };
    }

    /** Jugador de la sesión (o 401) con la cuenta activa (o 403). La comparten Duelos y Desafio. */
    public static function sesion(): int
    {
        $j = Sesiones::jugadorId();
        Fallo::si($j === null, 'Entra a tu cuenta para continuar.', 401);
        $cols = Migraciones::columnas('jugadores') ?? [];
        if (isset($cols['estado'])) {
            $e = (string) Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$j]);
            Fallo::si($e !== '' && $e !== 'activo', 'Tu cuenta no puede participar en eventos en línea ahora mismo.', 403, ['codigo' => 'cuenta_' . $e]);
        }
        return (int) $j;
    }

    // ------------------------------------------------------------------ ayudas
    public static function temporada(?int $t = null): string { return date('Y-m', $t ?? time()); }

    public static function nombreTemporada(string $t): string
    {
        [$a, $m] = array_map('intval', explode('-', $t));
        return 'Temporada ' . (self::MESES[$m] ?? $m) . ' ' . $a;
    }

    public static function liga(int $rating): string
    {
        $n = self::LIGAS[0][1];
        foreach (self::LIGAS as [$min, $nombre]) if ($rating >= $min) $n = $nombre;
        return $n;
    }

    private static function servidorId(int $j): int { return (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]); }

    private static function nombre(int $j): string
    {
        $f = Db::fila('SELECT alias, nombre FROM jugadores WHERE id = ?', [$j]);
        return Social::nombrePublico($f['alias'] ?? null, $f['nombre'] ?? null);
    }

    /** Fila del puntaje en la temporada (la crea con el reinicio suave: la mitad de la distancia a 1000). Dentro de tx. */
    private static function filaRating(string $t, int $j, int $sid): array
    {
        $f = Db::fila('SELECT * FROM duelo_ratings WHERE temporada = ? AND jugador_id = ?', [$t, $j]);
        if ($f) return $f;
        $r = self::ratingInicial($t, $j);
        Db::q('INSERT OR IGNORE INTO duelo_ratings (temporada, jugador_id, servidor_id, rating, mejor, actualizado) VALUES (?, ?, ?, ?, ?, ?)', [$t, $j, $sid, $r, $r, time()]);
        return Db::fila('SELECT * FROM duelo_ratings WHERE temporada = ? AND jugador_id = ?', [$t, $j]);
    }

    private static function ratingInicial(string $t, int $j): int
    {
        $prev = Db::valor('SELECT rating FROM duelo_ratings WHERE jugador_id = ? AND temporada < ? ORDER BY temporada DESC LIMIT 1', [$j, $t]);
        return $prev === null ? self::RATING_INICIAL : (int) round(self::RATING_INICIAL + ((int) $prev - self::RATING_INICIAL) / 2);
    }

    private static function ratingDe(string $t, int $j): array
    {
        $f = Db::fila('SELECT * FROM duelo_ratings WHERE temporada = ? AND jugador_id = ?', [$t, $j]);
        $r = $f ? (int) $f['rating'] : self::ratingInicial($t, $j);
        return ['rating' => $r, 'liga' => self::liga($r), 'mejor' => $f ? (int) $f['mejor'] : $r,
                'ganados' => (int) ($f['ganados'] ?? 0), 'perdidos' => (int) ($f['perdidos'] ?? 0), 'empates' => (int) ($f['empates'] ?? 0),
                'defensas_ganadas' => (int) ($f['defensas_ganadas'] ?? 0), 'defensas_perdidas' => (int) ($f['defensas_perdidas'] ?? 0),
                'racha' => (int) ($f['racha'] ?? 0)];
    }

    public static function cupos(int $j): array
    {
        $dia = Monedero::diaLocal();
        $f = Db::fila('SELECT usados, extra FROM duelo_cupos WHERE jugador_id = ? AND dia = ?', [$j, $dia]);
        $vip = Monedero::vipActivo($j);
        $gratis = self::GRATIS_DIA + ($vip ? self::VIP_EXTRA : 0);
        $usados = (int) ($f['usados'] ?? 0); $extra = (int) ($f['extra'] ?? 0);
        return ['gratis' => $gratis, 'usados' => $usados, 'extra' => $extra, 'extra_max' => self::EXTRA_MAX, 'precio_extra' => self::EXTRA_PRECIO,
                'restantes' => max(0, $gratis + $extra - $usados), 'vip' => $vip];
    }

    /** Contrato del tablero del día para un nivel (igual para todo el servidor ese día). */
    public static function contrato(int $servidor, string $nivel, ?string $dia = null): array
    {
        Fallo::si(!isset(self::NIVELES[$nivel]), 'Elige un contrato: fácil, medio o difícil.', 400, ['codigo' => 'nivel']);
        $dia ??= Monedero::diaLocal();
        $h = crc32('duelo|' . $dia . '|' . $servidor . '|' . $nivel);
        $p = self::NIVELES[$nivel][$h % count(self::NIVELES[$nivel])];
        $cl = self::CLIENTES[$p['type']];
        return ['type' => $p['type'], 'client' => $cl[intdiv($h, 7) % count($cl)], 'cams' => $p['cams'], 'diff' => $p['diff'],
                'audio' => $p['audio'], 'stream' => true, 'outdoor' => $p['outdoor'], 'pay' => $p['pay'], 'rival' => false];
    }

    public static function tablero(int $servidor): array
    {
        $o = [];
        foreach (array_keys(self::NIVELES) as $n) $o[] = ['nivel' => $n, 'contrato' => self::contrato($servidor, $n), 'fama_premio' => max(1, self::contrato($servidor, $n)['diff'] - 1)];
        return $o;
    }

    // ------------------------------------------------------------------ mejor equipo de duelo
    /** Permisos por encima del tope de fama: el personal comprado (entregas tipo "personal": rol, habilidad y nivel). */
    private static function permisos(int $j): array
    {
        $cols = Migraciones::columnas('entregas') ?? [];
        $sql = 'SELECT item, cantidad' . (isset($cols['nivel']) ? ', nivel' : ', NULL AS nivel') . " FROM entregas WHERE jugador_id = ? AND tipo = 'personal' ORDER BY cantidad DESC";
        return array_map(fn($e) => ['rol' => self::ROL_ALIAS[$e['item']] ?? $e['item'], 'habilidad' => (int) $e['cantidad'],
            'nivel' => isset(self::NIVELES_PERSONAL[(string) $e['nivel']]) ? (string) $e['nivel'] : 'internacional'], Db::todas($sql, [$j]));
    }

    /** Habilidad máxima del personal propio según la fama pública (la fama la limita el servidor por día). */
    public static function topeHabilidad(int $fama): int { return min(5, 2 + intdiv(max(0, $fama), 15)); }

    public static function rol(mixed $r): ?string
    {
        if (!is_string($r)) return null;
        $r = self::ROL_ALIAS[$r] ?? $r;
        return isset(self::ROLES[$r]) ? $r : null;
    }

    /**
     * POST /api/duelos/equipo { personal: [{rol, habilidad, nivel?, dueno?}], inventario: [ids] }
     * El personal es el resumen de la partida (rol, habilidad y nivel de experiencia); el servidor lo limita con la fama
     * pública y el personal comprado. Los equipos solo pueden ser del inventario del servidor y estar en la bodega.
     */
    public static function guardarEquipo(int $j, array $in): array
    {
        self::preparar();
        $pers = $in['personal'] ?? null;
        Fallo::si(!is_array($pers) || !array_is_list($pers) || count($pers) < 1, 'Manda tu personal (al menos tú, el dueño).', 400, ['codigo' => 'personal']);
        Fallo::si(count($pers) > self::MAX_PERSONAL, 'Máximo ' . self::MAX_PERSONAL . ' personas en tu equipo de duelo.', 400, ['codigo' => 'personal']);
        $fama = (int) Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$j]);
        $tope = self::topeHabilidad($fama);
        $permisos = self::permisos($j);
        $limpio = []; $duenos = 0;
        foreach ($pers as $i => $p) {
            Fallo::si(!is_array($p), 'Persona ' . ($i + 1) . ': formato no válido.', 400, ['codigo' => 'personal']);
            $rol = self::rol($p['rol'] ?? null); $hab = $p['habilidad'] ?? null; $dueno = ($p['dueno'] ?? false) === true;
            $niv = $p['nivel'] ?? 'junior';
            Fallo::si($rol === null, 'Persona ' . ($i + 1) . ': rol no válido.', 400, ['codigo' => 'personal']);
            Fallo::si(!is_int($hab) || $hab < 1 || $hab > 5, 'Persona ' . ($i + 1) . ': la habilidad va de 1 a 5.', 400, ['codigo' => 'personal']);
            Fallo::si(!is_string($niv) || !isset(self::NIVELES_PERSONAL[$niv]), 'Persona ' . ($i + 1) . ': nivel de experiencia no válido.', 400, ['codigo' => 'personal']);
            if ($dueno) $duenos++;
            $nivelAlto = $fama < self::NIVELES_PERSONAL[$niv][0];
            if ($hab > $tope || $nivelAlto) {
                // ¿Lo cubre una persona comprada en la tienda (camarógrafo estrella, técnico del paquete de inicio)?
                $k = null;
                foreach ($permisos as $x => $pm) {
                    if ($pm['rol'] === $rol && $pm['habilidad'] >= $hab && self::NIVELES_PERSONAL[$pm['nivel']][1] >= self::NIVELES_PERSONAL[$niv][1]) { $k = $x; break; }
                }
                Fallo::si($k === null && $hab > $tope, 'Con ' . $fama . ' de fama tu personal llega hasta habilidad ' . $tope . '. Sube tu fama para registrar gente de nivel ' . $hab . '.', 400, ['codigo' => 'habilidad', 'tope' => $tope]);
                Fallo::si($k === null, 'Con ' . $fama . ' de fama todavía no puedes tener personal ' . str_replace('_', ' ', $niv) . '.', 400, ['codigo' => 'nivel']);
                array_splice($permisos, $k, 1);
            }
            $limpio[] = ['rol' => $rol, 'habilidad' => $hab, 'nivel' => $niv, 'dueno' => $dueno];
        }
        Fallo::si($duenos !== 1, 'Tu equipo debe tener exactamente un dueño (tú).', 400, ['codigo' => 'dueno']);

        $ids = $in['inventario'] ?? [];
        Fallo::si(!is_array($ids) || !array_is_list($ids) || count($ids) > self::MAX_INVENTARIO, 'Máximo ' . self::MAX_INVENTARIO . ' equipos de tu inventario.', 400, ['codigo' => 'inventario']);
        $inv = [];
        foreach ($ids as $id) {
            Fallo::si(!is_int($id) || $id < 1 || isset($inv[$id]), 'Lista de equipos no válida.', 400, ['codigo' => 'inventario']);
            $f = Db::fila("SELECT id, item, serie FROM inventario WHERE id = ? AND jugador_id = ? AND estado = 'bodega'", [$id, $j]);
            Fallo::si(!$f, 'Ese equipo no está en tu bodega del servidor (¿lo publicaste en el mercado?).', 409, ['codigo' => 'inventario', 'id' => $id]);
            Fallo::si(!isset(self::EQUIPOS[$f['item']]), self::nombreItem((string) $f['item']) . ' no se puede llevar a un duelo.', 400, ['codigo' => 'inventario']);
            $inv[$id] = ['id' => (int) $f['id'], 'item' => $f['item'], 'serie' => (int) $f['serie']];
        }
        $equipo = ['personal' => $limpio, 'inventario' => array_values($inv)];
        $resumen = self::resumenEquipo($equipo, Monedero::vipActivo($j));
        $sid = self::servidorId($j);
        return Db::tx(function () use ($j, $sid, $equipo, $resumen): array {
            Fallo::si((bool) Db::valor("SELECT 1 FROM duelos WHERE retador_id = ? AND estado IN ('abierto', 'validando')", [$j]),
                'Termina tu duelo en curso antes de cambiar tu equipo.', 409, ['codigo' => 'duelo_abierto']);
            Db::q('INSERT INTO duelo_equipos (jugador_id, servidor_id, equipo_json, resumen_json, poder, cambios, actualizado) VALUES (?, ?, ?, ?, ?, 1, ?)
                   ON CONFLICT (jugador_id) DO UPDATE SET servidor_id = excluded.servidor_id, equipo_json = excluded.equipo_json, resumen_json = excluded.resumen_json,
                   poder = excluded.poder, cambios = cambios + 1, actualizado = excluded.actualizado',
                [$j, $sid, self::json($equipo), self::json($resumen), $resumen['poder'], time()]);
            return ['ok' => true, 'equipo' => self::miEquipo($j)];
        });
    }

    private static function nombreItem(string $item): string { return self::EQUIPOS[$item][2] ?? Catalogo::nombreEquipo($item); }

    private static function valor(array $p): float { return $p['habilidad'] + self::NIVELES_PERSONAL[$p['nivel'] ?? 'junior'][1]; }

    /** Lo que ven los demás del equipo (y el "poder" para ordenar). */
    public static function resumenEquipo(array $equipo, bool $vip): array
    {
        $cams = array_values(array_filter($equipo['inventario'], fn($x) => self::EQUIPOS[$x['item']][0] && ($vip || !in_array($x['item'], self::VIP_ITEMS, true))));
        usort($cams, fn($a, $b) => self::EQUIPOS[$b['item']][1] <=> self::EQUIPOS[$a['item']][1]);
        $nombres = array_map(fn($x) => self::nombreItem($x['item']), array_slice($cams, 0, 4));
        while (count($nombres) < 4) $nombres[] = self::nombreItem('cam_pro');
        $por = []; $mejor = []; $suma = 0;
        foreach ($equipo['personal'] as $p) {
            $por[$p['rol']] = ($por[$p['rol']] ?? 0) + 1;
            $mejor[$p['rol']] = max($mejor[$p['rol']] ?? 0, $p['habilidad']);
            $suma += $p['habilidad'];
        }
        $camQ = array_sum(array_map(fn($x) => self::EQUIPOS[$x['item']][1], array_slice($cams, 0, 4))) + 2 * max(0, 4 - count($cams));
        $apoyo = array_sum(array_map(fn($x) => self::EQUIPOS[$x['item']][0] ? 0 : 6, $equipo['inventario']));
        $poder = (int) round($camQ * 10 + $apoyo + array_sum(array_map(fn($p) => self::valor($p) * 4, $equipo['personal'])) + count($por) * 3);
        return [
            'camaras' => $nombres,
            'exclusivos' => array_values(array_map(fn($x) => ['item' => $x['item'], 'serie' => $x['serie'], 'nombre' => self::nombreItem($x['item'])], $equipo['inventario'])),
            'personal' => $por, 'mejor_habilidad' => $mejor, 'personas' => count($equipo['personal']),
            'habilidad_media' => count($equipo['personal']) ? round($suma / count($equipo['personal']), 1) : 0,
            'poder' => $poder,
        ];
    }

    /**
     * Arma el intento de un lado del duelo (lo que el validador repite). Igual para los dos lados: la semilla, el contrato,
     * el contexto, el kit básico (estado 85 %) y la cantidad de cámaras (la que pide el contrato: primero las exclusivas,
     * después las del kit). Los demás equipos del inventario van todos (los VIP solo con VIP activo, y solo si el dueño
     * todavía los tiene en su bodega). Personal: las mejores personas para las cámaras (siempre al menos un camarógrafo que no
     * es el dueño), director, sonidista (si hay audio), técnico de transmisión y 1 de cada rol de apoyo, hasta 12. Lo que
     * falte de los cuatro roles principales lo cubre un freelance junior de nivel 1.
     */
    public static function armarIntento(array $equipo, array $contrato, int $seed, bool $vip, ?int $dueno): array
    {
        $inv = array_values(array_filter($equipo['inventario'] ?? [], function ($x) use ($vip, $dueno) {
            if (!isset(self::EQUIPOS[$x['item']])) return false;
            if (in_array($x['item'], self::VIP_ITEMS, true) && !$vip) return false;
            return $dueno === null || (bool) Db::valor("SELECT 1 FROM inventario WHERE id = ? AND jugador_id = ? AND estado = 'bodega'", [$x['id'], $dueno]);
        }));
        $premCams = array_values(array_filter($inv, fn($x) => self::EQUIPOS[$x['item']][0]));
        usort($premCams, fn($a, $b) => [self::EQUIPOS[$b['item']][1], $b['serie']] <=> [self::EQUIPOS[$a['item']][1], $a['serie']]);
        $equip = [];
        foreach (array_slice($premCams, 0, $contrato['cams']) as $x) $equip[] = ['type' => $x['item'], 'condition' => 100, 'serie' => (int) $x['serie']];
        while (count($equip) < $contrato['cams']) $equip[] = ['type' => 'cam_pro', 'condition' => self::KIT_ESTADO];
        foreach (self::KIT as [$t]) {
            if ($t === 'cam_pro') continue;
            if (in_array($t, ['audio_basic', 'mics'], true) && !$contrato['audio']) continue;
            if ($t === 'raincover' && !$contrato['outdoor']) continue;
            $equip[] = ['type' => $t, 'condition' => self::KIT_ESTADO];
        }
        foreach ($inv as $x) if (!self::EQUIPOS[$x['item']][0]) $equip[] = ['type' => $x['item'], 'condition' => 100, 'serie' => (int) $x['serie']];

        $pers = $equipo['personal'];
        $de = function (string $r) use ($pers): array {
            $x = array_values(array_filter($pers, fn($p) => $p['rol'] === $r));
            usort($x, fn($a, $b) => [self::valor($b), (int) !$b['dueno']] <=> [self::valor($a), (int) !$a['dueno']]);
            return $x;
        };
        $free = fn(string $r) => ['rol' => $r, 'habilidad' => 1, 'nivel' => 'junior', 'dueno' => false, 'freelance' => true];
        $staff = [];
        $pon = function (array $p, string $nombre) use (&$staff): void {
            $staff[] = ['role' => $p['rol'], 'skill' => $p['habilidad'], 'tier' => $p['nivel'] ?? 'junior', 'morale' => self::MORAL,
                        'name' => $p['dueno'] ? 'Tú (dueño)' : $nombre] + ($p['dueno'] ? ['owner' => true] : []);
        };
        $cams = array_slice($de('camarografo'), 0, $contrato['cams']);
        if ($cams && count(array_filter($cams, fn($p) => !$p['dueno'])) === 0) {
            // Solo el dueño entre los elegidos (con 1 cámara): el sorteo pide un camarógrafo que no sea el dueño
            $otro = array_values(array_filter($de('camarografo'), fn($p) => !$p['dueno']));
            if (count($cams) >= $contrato['cams']) array_pop($cams);
            $cams[] = $otro[0] ?? $free('camarografo');
        }
        while (count($cams) < $contrato['cams']) $cams[] = $free('camarografo');
        foreach ($cams as $i => $p) $pon($p, !empty($p['freelance']) ? 'Camarógrafo freelance' : 'Camarógrafo ' . ($i + 1));
        foreach (['director' => 'Director', 'sonidista' => 'Sonidista', 'tecnico_transmision' => 'Técnico de transmisión'] as $r => $nom) {
            if ($r === 'sonidista' && !$contrato['audio']) continue;
            $p = $de($r)[0] ?? $free($r);
            $pon($p, !empty($p['freelance']) ? $nom . ' freelance' : $nom);
        }
        foreach (self::ROLES_APOYO as $r) {
            if (count($staff) >= self::MAX_PERSONAL) break;
            if ($p = $de($r)[0] ?? null) $pon($p, self::ROLES[$r]);
        }
        return ['seed' => $seed, 'contrato' => $contrato, 'equipo' => ['staff' => $staff, 'equip' => $equip], 'contexto' => self::CONTEXTO, 'vip' => $vip];
    }

    private static function equipoGuardado(int $j): ?array
    {
        $f = Db::fila('SELECT equipo_json FROM duelo_equipos WHERE jugador_id = ?', [$j]);
        return $f ? json_decode((string) $f['equipo_json'], true) : null;
    }

    private static function miEquipo(int $j): ?array
    {
        $f = Db::fila('SELECT * FROM duelo_equipos WHERE jugador_id = ?', [$j]);
        if (!$f) return null;
        $eq = json_decode((string) $f['equipo_json'], true);
        return ['personal' => $eq['personal'], 'inventario' => $eq['inventario'], 'resumen' => json_decode((string) $f['resumen_json'], true),
                'poder' => (int) $f['poder'], 'actualizado' => Db::iso((int) $f['actualizado'])];
    }

    // ------------------------------------------------------------------ retar y jugar
    /** POST /api/duelos/retar { rival_id, nivel: facil|medio|dificil } */
    public static function retar(int $j, array $in): array
    {
        self::preparar();
        self::vencer();
        Fallo::si(Limite::contar('duelo:' . $j, 40), 'Demasiados duelos seguidos. Espera unos minutos.', 429);
        $rival = $in['rival_id'] ?? null;
        Fallo::si(!is_int($rival) || $rival < 1, 'Elige a la productora que quieres retar.', 400, ['codigo' => 'rival']);
        $nivel = is_string($in['nivel'] ?? null) ? $in['nivel'] : 'medio';
        $sid = self::servidorId($j);
        $contrato = self::contrato($sid, $nivel);
        Fallo::si($rival === $j, 'No puedes retarte a ti mismo.', 400, ['codigo' => 'rival']);
        $r = Db::fila('SELECT id, servidor_id FROM jugadores WHERE id = ?', [$rival]);
        Fallo::si(!$r || (int) $r['servidor_id'] !== $sid, 'Esa productora no está en tu servidor.', 404, ['codigo' => 'rival']);
        $cols = Migraciones::columnas('jugadores') ?? [];
        if (isset($cols['estado'])) Fallo::si((string) Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$rival]) !== 'activo', 'Esa productora no está disponible para duelos.', 409, ['codigo' => 'rival']);
        $miEq = self::equipoGuardado($j);
        Fallo::si($miEq === null, 'Primero registra tu equipo de duelo.', 409, ['codigo' => 'sin_equipo']);
        $suEq = self::equipoGuardado($rival);
        Fallo::si($suEq === null, 'Esa productora todavía no registró su equipo de duelo.', 409, ['codigo' => 'rival_sin_equipo']);
        $dia = Monedero::diaLocal();
        Fallo::si((int) Db::valor('SELECT COUNT(*) FROM duelos WHERE retador_id = ? AND defensor_id = ? AND dia = ?', [$j, $rival, $dia]) >= self::MAX_PAR_DIA,
            'Ya retaste ' . self::MAX_PAR_DIA . ' veces hoy a esa productora. Elige otra o vuelve mañana.', 409, ['codigo' => 'par']);
        Fallo::si((bool) Db::valor("SELECT 1 FROM duelos WHERE retador_id = ? AND estado IN ('abierto', 'validando')", [$j]), 'Ya tienes un duelo en curso. Termínalo primero.', 409, ['codigo' => 'duelo_abierto']);
        Fallo::si(self::cupos($j)['restantes'] <= 0, 'Ya usaste tus duelos de hoy. Compra un intento extra o vuelve mañana.', 409, ['codigo' => 'sin_cupos']);

        $seed = random_int(1, 2147483646);
        if (class_exists(Estrellas::class)) {   // personal estrella (server/INTEGRAR_ESTRELLAS.md): retar gasta 1 partido, defender no
            $miEq = Estrellas::aplicarAEquipo($j, $miEq, 'duelo');
            $suEq = Estrellas::aplicarAEquipo($rival, $suEq, 'duelo');
        }
        // Bono de ventajas pagadas (MONETIZACION.md §1, techo +12) para el retador y el fantasma: se fija al retar
        $bonos = ['retador' => self::bonoVentajas($j), 'defensor' => self::bonoVentajas($rival)];
        $intR = self::armarIntento($miEq, $contrato, $seed, Monedero::vipActivo($j), $j);
        $intD = self::armarIntento($suEq, $contrato, $seed, Monedero::vipActivo($rival), $rival);
        $f = Repeticion::motor(['accion' => 'fantasma', 'intento' => $intD, 'politica' => self::POLITICA, 'fijar' => true]);
        if (!empty($f['ok']) && is_array($f['contrato'] ?? null)) {
            // Mismos imprevistos para los dos: el contrato final (con contrato.imprevistos) va a los dos intentos
            $contrato = $f['contrato'];
            $intD['contrato'] = $contrato;
            $intR['contrato'] = $contrato;
        }
        if (empty($f['ok'])) {
            if (($f['motivo'] ?? '') !== 'validador_caido') Db::aviso('duelo_fantasma', 'No se pudo jugar el fantasma del duelo: ' . json_encode($f, JSON_UNESCAPED_UNICODE));
            throw new Fallo('Los duelos están en mantenimiento. Intenta otra vez en unos minutos (no se gastó tu intento).', 503, ['codigo' => 'mantenimiento']);
        }
        $t = time();
        return Db::tx(function () use ($j, $rival, $sid, $nivel, $contrato, $seed, $intR, $intD, $f, $dia, $t, $bonos): array {
            Fallo::si((bool) Db::valor("SELECT 1 FROM duelos WHERE retador_id = ? AND estado IN ('abierto', 'validando')", [$j]), 'Ya tienes un duelo en curso. Termínalo primero.', 409, ['codigo' => 'duelo_abierto']);
            Fallo::si(self::cupos($j)['restantes'] <= 0, 'Ya usaste tus duelos de hoy.', 409, ['codigo' => 'sin_cupos']);
            $temp = self::temporada($t);
            self::filaRating($temp, $j, $sid);
            self::filaRating($temp, $rival, $sid);
            Db::q('INSERT INTO duelo_cupos (jugador_id, dia, usados) VALUES (?, ?, 1) ON CONFLICT (jugador_id, dia) DO UPDATE SET usados = usados + 1', [$j, $dia]);
            Db::q('INSERT INTO duelos (temporada, dia, servidor_id, retador_id, defensor_id, nivel, semilla, contrato_json, contexto_json, intento_retador_json, intento_defensor_json,
                     politica, decisiones_defensor_json, calidad_defensor, estrellas_defensor, estado, version_logica, creado, vence)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'abierto\', ?, ?, ?)',
                [$temp, $dia, $sid, $j, $rival, $nivel, $seed, self::json($contrato), self::json(self::CONTEXTO), self::json($intR), self::json($intD),
                 $f['politica'] ?? self::POLITICA, self::json(['decisiones' => $f['decisiones'], 'incidentes' => $f['incidentes'] ?? []] + ($bonos['retador'] || $bonos['defensor'] ? ['bonos' => $bonos] : [])),
                 (int) $f['calidad'], (int) $f['estrellas'], $f['version_logica'] ?? null, $t, $t + self::MINUTOS * 60]);
            $id = Db::ultimoId();
            if (class_exists(Estrellas::class)) Estrellas::consumir($j, 'duelo', 'duelo:' . $id);
            $d = Db::fila('SELECT * FROM duelos WHERE id = ?', [$id]);
            return ['ok' => true, 'duelo' => self::duelJson($d, $j), 'intento' => $intR + ['duelo_id' => $id], 'cupos' => self::cupos($j),
                    'rival' => self::rivalJson($rival, $temp)];
        });
    }

    /** POST /api/duelos/jugar { duelo_id, decisiones: [n...], resultado?: {quality, stars} } */
    public static function jugar(int $j, array $in): array
    {
        self::preparar();
        $id = $in['duelo_id'] ?? null;
        Fallo::si(!is_int($id) || $id < 1, 'Falta "duelo_id".', 400);
        $dec = self::decisiones($in['decisiones'] ?? null);
        $cli = self::resultadoCliente($in['resultado'] ?? null);
        $d = Db::tx(function () use ($j, $id, $dec, $cli) {
            $d = Db::fila('SELECT * FROM duelos WHERE id = ?', [$id]);
            Fallo::si(!$d || (int) $d['retador_id'] !== $j, 'Ese duelo no existe.', 404);
            if ($d['estado'] === 'cerrado') return $d;   // ya se cerró (reintento del juego): mismo resultado
            Fallo::si($d['estado'] !== 'abierto', 'Ese duelo ya se está revisando.', 409, ['codigo' => 'revisando']);
            if ((int) $d['vence'] < time()) return null;  // se venció: se cierra afuera como derrota
            Db::q("UPDATE duelos SET estado = 'validando', decisiones_json = ?, resultado_cliente_json = ? WHERE id = ? AND estado = 'abierto'",
                [self::json($dec), $cli === null ? null : self::json($cli), $id]);
            return Db::fila('SELECT * FROM duelos WHERE id = ?', [$id]);
        });
        if ($d === null) {
            self::vencer();
            throw new Fallo('Se acabó el tiempo de ese duelo (' . self::MINUTOS . ' minutos): cuenta como derrota.', 410, ['codigo' => 'vencido', 'duelo' => self::duelJson(Db::fila('SELECT * FROM duelos WHERE id = ?', [$id]), $j)]);
        }
        if ($d['estado'] === 'validando') {
            $intento = json_decode((string) $d['intento_retador_json'], true) + ['decisiones' => $dec];
            if ($cli !== null) $intento['cliente_resultado'] = $cli;
            $v = Repeticion::validar($intento);
            if (($v['detalle']['motivo'] ?? '') === 'validador_caido') {
                Db::q("UPDATE duelos SET estado = 'pendiente' WHERE id = ? AND estado = 'validando'", [$id]);
                return ['ok' => true, 'pendiente' => true, 'mensaje' => 'Tu jugada quedó guardada. El resultado aparece en unos minutos.',
                        'duelo' => self::duelJson(Db::fila('SELECT * FROM duelos WHERE id = ?', [$id]), $j)];
            }
            self::finalizar($d, $v);
        }
        $d = Db::fila('SELECT * FROM duelos WHERE id = ?', [$id]);
        $val = json_decode((string) ($d['validacion_json'] ?? 'null'), true) ?: [];
        $fan = json_decode((string) $d['decisiones_defensor_json'], true) ?: [];
        return ['ok' => true, 'duelo' => self::duelJson($d, $j),
                'detalle' => ['retador' => $val['detalle']['incidentes'] ?? [], 'defensor' => $fan['incidentes'] ?? [], 'motivo' => $val['detalle']['motivo'] ?? null],
                'rating' => self::ratingDe((string) $d['temporada'], $j), 'cupos' => self::cupos($j)];
    }

    private static function decisiones(mixed $v): array
    {
        Fallo::si(!is_array($v) || !array_is_list($v) || count($v) > 20, 'Las decisiones deben ser una lista (máximo 20).', 400, ['codigo' => 'decisiones']);
        foreach ($v as $x) Fallo::si(!is_int($x) || $x < 0 || $x > 9, 'Decisión no válida.', 400, ['codigo' => 'decisiones']);
        return $v;
    }

    private static function resultadoCliente(mixed $v): ?array
    {
        if (!is_array($v)) return null;
        $q = $v['quality'] ?? null; $s = $v['stars'] ?? null;
        return is_int($q) && is_int($s) ? ['quality' => $q, 'stars' => $s] : null;
    }

    /** Cierra un duelo con la respuesta del validador. La calidad que cuenta es la del validador. */
    private static function finalizar(array $d, array $v): void
    {
        $motivo = $v['detalle']['motivo'] ?? null;
        $cal = is_int($v['calidad'] ?? null) ? $v['calidad'] : null;
        $est = is_int($v['estrellas'] ?? null) ? $v['estrellas'] : null;
        $sosp = $cal === null || $motivo === 'resultado_no_coincide';
        self::cerrar((int) $d['id'], $cal, $est, $v, $cal === null ? 'jugada_imposible' : ($motivo === 'resultado_no_coincide' ? 'resultado_no_coincide' : null), $sosp);
    }

    /** Puntaje, fama y aviso al defensor. $calidad null = derrota del retador (vencido o jugada imposible). */
    private static function cerrar(int $id, ?int $calidad, ?int $estrellas, ?array $val, ?string $motivo, bool $sospechoso): void
    {
        Db::tx(function () use ($id, $calidad, $estrellas, $val, $motivo, $sospechoso): void {
            $d = Db::fila('SELECT * FROM duelos WHERE id = ?', [$id]);
            if (!$d || $d['estado'] === 'cerrado') return;
            $t = (string) $d['temporada']; $sid = (int) $d['servidor_id'];
            $rj = (int) $d['retador_id']; $dj = (int) $d['defensor_id'];
            $R = self::filaRating($t, $rj, $sid); $D = self::filaRating($t, $dj, $sid);
            [$bR, $bD] = self::bonosDuelo($d);   // bono de ventajas fijado al retar (0 y 0 si no hay)
            $calRaw = $calidad;
            $cd = min(100, (int) $d['calidad_defensor'] + $bD);
            $calidad = $calidad === null ? null : min(100, $calidad + $bR);
            $S = $calidad === null ? 0.0 : ($calidad > $cd ? 1.0 : ($calidad < $cd ? 0.0 : 0.5));
            $E = 1 / (1 + 10 ** (((int) $D['rating'] - (int) $R['rating']) / 400));
            $nR = max(self::RATING_MIN, (int) $R['rating'] + (int) round(self::K_RETADOR * ($S - $E)));
            $nD = max(self::RATING_MIN, (int) $D['rating'] - (int) round(self::K_DEFENSOR * ($S - $E)));
            $ganador = $S === 1.0 ? 'retador' : ($S === 0.0 ? 'defensor' : 'empate');
            $now = time();
            Db::q('UPDATE duelo_ratings SET rating = ?, mejor = MAX(mejor, ?), ganados = ganados + ?, perdidos = perdidos + ?, empates = empates + ?,
                   racha = CASE WHEN ? = 1 THEN (CASE WHEN racha > 0 THEN racha + 1 ELSE 1 END) WHEN ? = 1 THEN (CASE WHEN racha < 0 THEN racha - 1 ELSE -1 END) ELSE 0 END,
                   actualizado = ? WHERE temporada = ? AND jugador_id = ?',
                [$nR, $nR, (int) ($S === 1.0), (int) ($S === 0.0), (int) ($S === 0.5), (int) ($S === 1.0), (int) ($S === 0.0), $now, $t, $rj]);
            Db::q('UPDATE duelo_ratings SET rating = ?, mejor = MAX(mejor, ?), defensas_ganadas = defensas_ganadas + ?, defensas_perdidas = defensas_perdidas + ?, actualizado = ?
                   WHERE temporada = ? AND jugador_id = ?', [$nD, $nD, (int) ($S === 0.0), (int) ($S === 1.0), $now, $t, $dj]);
            $diff = (int) (json_decode((string) $d['contrato_json'], true)['diff'] ?? 2);
            $fR = $ganador === 'retador' ? self::darFama($rj, max(1, $diff - 1), 'duelo:' . $id) : 0;
            $fD = $ganador === 'defensor' ? self::darFama($dj, 1, 'duelo:' . $id . ':defensa') : 0;
            Db::q("UPDATE duelos SET estado = 'cerrado', calidad_retador = ?, estrellas_retador = ?, validacion_json = ?, version_logica = COALESCE(?, version_logica),
                   ganador = ?, motivo = ?, sospechoso = ?, rating_retador_antes = ?, rating_defensor_antes = ?, cambio_retador = ?, cambio_defensor = ?,
                   fama_retador = ?, fama_defensor = ?, cerrado = ? WHERE id = ?",
                [$calRaw, $estrellas, $val === null ? null : self::json($val), $val['version_logica'] ?? null, $ganador, $motivo, (int) $sospechoso,
                 (int) $R['rating'], (int) $D['rating'], $nR - (int) $R['rating'], $nD - (int) $D['rating'], $fR, $fD, $now, $id]);
            if ($calidad !== null) Universos::marcarActivo($rj, true);   // evento en línea validado (COPAS.md §1: actividad_diaria.eventos)
            if ($calRaw !== null && $estrellas !== null && !$sospechoso && class_exists(SedeOficial::class)) SedeOficial::premioIntento($rj, $calRaw, $estrellas, 'duelo', 'duelo:' . $id);   // INTEGRAR_SEDE_OFICIAL.md §4
            if ($calidad !== null && class_exists(Pase::class)) Pase::sumarXp($rj, Pase::XP['duelo'], 'duelo', 'duelo:' . $id);   // INTEGRAR_PASE.md §5
            try {
                $quien = self::nombre($rj);
                Chat::sistema($dj, match ($ganador) {
                    'defensor' => '🛡️ Tu equipo de duelo le ganó a ' . $quien . ' (' . $cd . ' contra ' . ($calidad ?? 0) . '). Puntaje ' . ($nD - (int) $D['rating'] >= 0 ? '+' : '') . ($nD - (int) $D['rating']) . '.',
                    'retador' => '⚔️ ' . $quien . ' le ganó a tu equipo de duelo (' . $calidad . ' contra ' . $cd . '). Puntaje ' . ($nD - (int) $D['rating']) . '.',
                    default => '🤝 Empate con ' . $quien . ' en un duelo (' . $cd . ' a ' . $calidad . ').',
                });
            } catch (\Throwable) { /* el chat es opcional */ }
        });
    }

    /** Entrega de fama (tipo "fama") con tope diario. Devuelve lo entregado. */
    private static function darFama(int $j, int $n, string $origen): int
    {
        $hoy = (int) strtotime('today');
        $ya = (int) Db::valor("SELECT COALESCE(SUM(cantidad), 0) FROM entregas WHERE jugador_id = ? AND tipo = 'fama' AND origen LIKE 'duelo:%' AND creado >= ?", [$j, $hoy]);
        $n = max(0, min($n, self::FAMA_TOPE_DIA - $ya));
        if ($n > 0) Monedero::entregar($j, 'fama', '-', $n, $origen);
        return $n;
    }

    /** Los duelos abiertos que pasaron su tiempo: derrota del retador. Las validaciones pendientes se reintentan. */
    public static function vencer(): int
    {
        self::preparar();
        $n = 0;
        foreach (Db::todas("SELECT id FROM duelos WHERE estado = 'abierto' AND vence < ? LIMIT 200", [time()]) as $f) { self::cerrar((int) $f['id'], null, null, null, 'vencido', false); $n++; }
        return $n;
    }

    /** Tarea: vuelve a validar los duelos que quedaron pendientes (validador caído) o trabados. */
    public static function revalidarPendientes(int $max = 50): int
    {
        self::preparar();
        $n = 0;
        foreach (Db::todas("SELECT * FROM duelos WHERE estado = 'pendiente' OR (estado = 'validando' AND creado < ?) ORDER BY id LIMIT ?", [time() - 600, $max]) as $d) {
            $intento = json_decode((string) $d['intento_retador_json'], true) + ['decisiones' => json_decode((string) ($d['decisiones_json'] ?? '[]'), true) ?: []];
            if ($d['resultado_cliente_json']) $intento['cliente_resultado'] = json_decode((string) $d['resultado_cliente_json'], true);
            $v = Repeticion::validar($intento);
            if (($v['detalle']['motivo'] ?? '') === 'validador_caido') break;
            self::finalizar($d, $v);
            $n++;
        }
        return $n;
    }

    // ------------------------------------------------------------------ créditos: intentos extra
    /** POST /api/duelos/extra → +1 intento por 20 créditos (máximo 5 por día). */
    public static function comprarExtra(int $j): array
    {
        self::preparar();
        $dia = Monedero::diaLocal();
        return Db::tx(function () use ($j, $dia): array {
            $c = self::cupos($j);
            Fallo::si($c['extra'] >= self::EXTRA_MAX, 'Ya compraste los ' . self::EXTRA_MAX . ' intentos extra de hoy.', 409, ['codigo' => 'extra_max']);
            try {
                $saldo = Monedero::mover($j, -self::EXTRA_PRECIO, 'duelo_extra', 'duelo_extra:' . $dia . ':' . ($c['extra'] + 1));
            } catch (\RuntimeException $e) {
                throw new Fallo('Necesitas ' . self::EXTRA_PRECIO . ' créditos para un intento extra.', 402, ['codigo' => 'sin_creditos', 'creditos' => Monedero::saldo($j)]);
            }
            Db::q('INSERT INTO duelo_cupos (jugador_id, dia, extra) VALUES (?, ?, 1) ON CONFLICT (jugador_id, dia) DO UPDATE SET extra = extra + 1', [$j, $dia]);
            return ['ok' => true, 'creditos' => $saldo, 'cupos' => self::cupos($j)];
        });
    }

    // ------------------------------------------------------------------ temporada
    /** Premios del top 10 de cada servidor (una sola vez por temporada). Devuelve cuántos premios entregó. */
    public static function cerrarTemporada(string $t): int
    {
        self::preparar();
        Fallo::si(!preg_match('/^\d{4}-\d{2}$/', $t), 'Temporada no válida.', 400);
        if ($t >= self::temporada()) return 0;   // todavía no termina
        return Db::tx(function () use ($t): int {
            if (Db::valor('SELECT 1 FROM duelo_temporadas_cerradas WHERE temporada = ?', [$t])) return 0;
            Db::q('INSERT INTO duelo_temporadas_cerradas (temporada, cerrada) VALUES (?, ?)', [$t, time()]);
            $n = 0;
            foreach (Db::todas('SELECT DISTINCT servidor_id FROM duelo_ratings WHERE temporada = ?', [$t]) as $s) {
                $top = Db::todas('SELECT * FROM duelo_ratings WHERE temporada = ? AND servidor_id = ? AND (ganados + perdidos + empates) >= 3
                                  ORDER BY rating DESC, mejor DESC, actualizado ASC LIMIT 10', [$t, $s['servidor_id']]);
                foreach ($top as $i => $f) {
                    $p = $i + 1;
                    [$dinero, $fama] = self::PREMIOS_TEMPORADA[$p] ?? self::PREMIOS_TEMPORADA[10];
                    $j = (int) $f['jugador_id'];
                    Monedero::entregar($j, 'dinero', '-', $dinero, 'duelo_temporada:' . $t);
                    Monedero::entregar($j, 'fama', '-', $fama, 'duelo_temporada:' . $t);
                    Db::q('INSERT OR IGNORE INTO duelo_premios (temporada, jugador_id, servidor_id, puesto, rating, detalle_json, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [$t, $j, (int) $s['servidor_id'], $p, (int) $f['rating'], self::json(['dinero' => $dinero, 'fama' => $fama]), time()]);
                    try { Chat::sistema($j, '🏆 ' . self::nombreTemporada($t) . ' de duelos: terminaste en el puesto ' . $p . '. Premio: $' . number_format($dinero, 0, ',', '.') . ' y +' . $fama . ' de fama.'); } catch (\Throwable) {}
                    $n++;
                }
            }
            return $n;
        });
    }

    // ------------------------------------------------------------------ lectura
    private static function rivalJson(int $r, string $t, ?array $fila = null): array
    {
        $f = $fila ?? Db::fila('SELECT j.id, j.alias, j.nombre, j.fama_publica, j.vip_hasta, e.resumen_json, e.poder FROM jugadores j LEFT JOIN duelo_equipos e ON e.jugador_id = j.id WHERE j.id = ?', [$r]);
        $rt = self::ratingDe($t, $r);
        $as = Social::asociacionDe($r);
        return ['id' => (int) $f['id'], 'nombre' => Social::nombrePublico($f['alias'] ?? null, $f['nombre'] ?? null), 'fama' => (int) ($f['fama_publica'] ?? 0),
                'vip' => $f['vip_hasta'] !== null && (int) $f['vip_hasta'] > time(), 'siglas' => $as['siglas'] ?? null, 'color' => $as['color'] ?? null,
                'rating' => $rt['rating'], 'liga' => $rt['liga'], 'poder' => (int) ($f['poder'] ?? 0),
                'equipo' => isset($f['resumen_json']) ? json_decode((string) $f['resumen_json'], true) : null];
    }

    /** Un duelo visto por $j (retador o defensor). */
    public static function duelJson(array $d, int $j): array
    {
        $soyR = (int) $d['retador_id'] === $j;
        $otro = $soyR ? (int) $d['defensor_id'] : (int) $d['retador_id'];
        $c = json_decode((string) $d['contrato_json'], true);
        $cerrado = $d['estado'] === 'cerrado';
        $gane = !$cerrado || $d['ganador'] === 'empate' ? null : (($d['ganador'] === 'retador') === $soyR);
        return [
            'id' => (int) $d['id'], 'rol' => $soyR ? 'retador' : 'defensor', 'estado' => $d['estado'], 'nivel' => $d['nivel'],
            'rival' => ['id' => $otro, 'nombre' => self::nombre($otro)],
            'contrato' => ['type' => $c['type'], 'client' => $c['client'], 'cams' => $c['cams'], 'diff' => $c['diff'], 'outdoor' => $c['outdoor'], 'audio' => $c['audio']],
            'ganador' => $d['ganador'], 'gane' => $gane, 'empate' => $d['ganador'] === 'empate',
            // La calidad del fantasma solo se muestra al terminar (antes sería una pista)
            'calidad_mia' => $cerrado ? ($soyR ? ($d['calidad_retador'] === null ? null : (int) $d['calidad_retador']) : (int) $d['calidad_defensor']) : null,
            'calidad_rival' => $cerrado ? ($soyR ? (int) $d['calidad_defensor'] : ($d['calidad_retador'] === null ? null : (int) $d['calidad_retador'])) : null,
            'estrellas_mia' => $cerrado ? ($soyR ? ($d['estrellas_retador'] === null ? null : (int) $d['estrellas_retador']) : (int) $d['estrellas_defensor']) : null,
            'estrellas_rival' => $cerrado ? ($soyR ? (int) $d['estrellas_defensor'] : ($d['estrellas_retador'] === null ? null : (int) $d['estrellas_retador'])) : null,
            'bono_mio' => $cerrado ? self::bonosDuelo($d)[$soyR ? 0 : 1] : null, 'bono_rival' => $cerrado ? self::bonosDuelo($d)[$soyR ? 1 : 0] : null,   // ventajas (MONETIZACION.md §1): suman a la calidad
            'cambio' => $cerrado ? (int) ($soyR ? $d['cambio_retador'] : $d['cambio_defensor']) : null,
            'fama' => (int) ($soyR ? $d['fama_retador'] : $d['fama_defensor']),
            'motivo' => $d['motivo'], 'creado' => Db::iso((int) $d['creado']), 'vence' => Db::iso((int) $d['vence']),
            'cerrado' => $d['cerrado'] === null ? null : Db::iso((int) $d['cerrado']),
        ];
    }

    /** Top del servidor en la temporada + mi puesto. */
    public static function ranking(int $j, int $limite = 20): array
    {
        self::preparar();
        $t = self::temporada(); $sid = self::servidorId($j);
        $filas = Db::todas('SELECT r.*, j.alias, j.nombre FROM duelo_ratings r JOIN jugadores j ON j.id = r.jugador_id WHERE r.temporada = ? AND r.servidor_id = ?
                            ORDER BY r.rating DESC, r.mejor DESC, r.actualizado ASC LIMIT ?', [$t, $sid, $limite]);
        $lista = array_map(fn($f, $i) => ['puesto' => $i + 1, 'jugador_id' => (int) $f['jugador_id'], 'nombre' => Social::nombrePublico($f['alias'], $f['nombre']),
            'rating' => (int) $f['rating'], 'liga' => self::liga((int) $f['rating']), 'ganados' => (int) $f['ganados'], 'perdidos' => (int) $f['perdidos'],
            'yo' => (int) $f['jugador_id'] === $j], $filas, array_keys($filas));
        $mio = self::ratingDe($t, $j);
        $puesto = Db::valor('SELECT rating FROM duelo_ratings WHERE temporada = ? AND jugador_id = ?', [$t, $j]) === null ? null
            : 1 + (int) Db::valor('SELECT COUNT(*) FROM duelo_ratings WHERE temporada = ? AND servidor_id = ? AND rating > ?', [$t, $sid, $mio['rating']]);
        return ['ok' => true, 'temporada' => ['id' => $t, 'nombre' => self::nombreTemporada($t)], 'ranking' => $lista, 'mi_puesto' => $puesto, 'mi_rating' => $mio];
    }

    /** GET /api/duelos: todo lo que la pantalla necesita. */
    public static function resumen(int $j): array
    {
        self::preparar();
        self::vencer();
        $t = self::temporada();
        $ant = self::temporada(strtotime(date('Y-m-01') . ' -1 day'));
        if (!Db::valor('SELECT 1 FROM duelo_temporadas_cerradas WHERE temporada = ?', [$ant]) && Db::valor('SELECT 1 FROM duelo_ratings WHERE temporada = ? LIMIT 1', [$ant])) self::cerrarTemporada($ant);
        $sid = self::servidorId($j);
        $mio = self::ratingDe($t, $j);
        $rivales = class_exists(Estrellas::class) && method_exists(Estrellas::class, 'rivalesSugeridos') ? Estrellas::rivalesSugeridos($j, 12) : Db::todas('SELECT j.id, j.alias, j.nombre, j.fama_publica, j.vip_hasta, e.resumen_json, e.poder, COALESCE(r.rating, ?) AS rt
                              FROM duelo_equipos e JOIN jugadores j ON j.id = e.jugador_id LEFT JOIN duelo_ratings r ON r.jugador_id = j.id AND r.temporada = ?
                              WHERE j.servidor_id = ? AND j.id <> ? ORDER BY ABS(COALESCE(r.rating, ?) - ?), e.actualizado DESC LIMIT 12',
            [self::RATING_INICIAL, $t, $sid, $j, self::RATING_INICIAL, $mio['rating']]);
        if (!class_exists(Estrellas::class) && class_exists(Ventajas::class) && method_exists(Ventajas::class, 'poder')) {   // INTEGRAR_VIP.md §7b
            try {
                $miPoder = Ventajas::poder($j)['total'];
                $clave = fn($f) => [intdiv(abs((int) $f['rt'] - (int) $mio['rating']), 50), abs(Ventajas::poder((int) $f['id'])['total'] - $miPoder)];
                usort($rivales, fn($a, $b) => $clave($a) <=> $clave($b));   // mismo tramo de puntaje primero, y dentro, poder parecido
            } catch (\Throwable $e) {
                error_log('EN VIVO duelos: rivales por poder ' . mb_substr($e->getMessage(), 0, 200));
            }
        }
        $dia = Monedero::diaLocal();
        $rivales = array_map(function ($f) use ($t, $j, $dia) {
            $o = self::rivalJson((int) $f['id'], $t, $f);
            $o['retos_hoy'] = (int) Db::valor('SELECT COUNT(*) FROM duelos WHERE retador_id = ? AND defensor_id = ? AND dia = ?', [$j, (int) $f['id'], $dia]);
            $o['parecido'] = (bool) ($f['parecido'] ?? false);   // poder parecido (±20 %): el juego lo marca como "rival parejo"
            return $o;
        }, $rivales);
        $abierto = Db::fila("SELECT * FROM duelos WHERE retador_id = ? AND estado IN ('abierto', 'validando', 'pendiente') ORDER BY id DESC LIMIT 1", [$j]);
        $hist = Db::todas('SELECT * FROM duelos WHERE (retador_id = ? OR defensor_id = ?) AND estado = \'cerrado\' ORDER BY id DESC LIMIT 15', [$j, $j]);
        $nuevas = (int) Db::valor("SELECT COUNT(*) FROM duelos WHERE defensor_id = ? AND estado = 'cerrado' AND visto_defensor = 0", [$j]);
        Db::q("UPDATE duelos SET visto_defensor = 1 WHERE defensor_id = ? AND estado = 'cerrado' AND visto_defensor = 0", [$j]);
        $rk = self::ranking($j, 10);
        $o = [
            'ok' => true,
            'temporada' => ['id' => $t, 'nombre' => self::nombreTemporada($t), 'termina' => Db::iso((int) strtotime(date('Y-m-01') . ' +1 month') - 1)],
            'rating' => $mio + ['puesto' => $rk['mi_puesto']],
            'cupos' => self::cupos($j),
            'equipo' => self::miEquipo($j),
            'kit' => array_map(fn($k) => ['item' => $k[0], 'cantidad' => $k[1], 'nombre' => self::nombreItem($k[0]), 'estado' => self::KIT_ESTADO], self::KIT),
            'inventario_elegible' => array_values(array_map(fn($f) => ['id' => (int) $f['id'], 'item' => $f['item'], 'serie' => (int) $f['serie'], 'nombre' => self::nombreItem((string) $f['item']),
                'vip' => in_array($f['item'], self::VIP_ITEMS, true)],
                array_filter(Db::todas("SELECT id, item, serie FROM inventario WHERE jugador_id = ? AND estado = 'bodega' ORDER BY id", [$j]), fn($f) => isset(self::EQUIPOS[$f['item']])))),
            'tope_habilidad' => self::topeHabilidad((int) Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$j])),
            'contratos' => self::tablero($sid),
            'rivales' => $rivales,
            'abierto' => $abierto ? self::duelJson($abierto, $j) + ($abierto['estado'] === 'abierto' ? ['intento' => json_decode((string) $abierto['intento_retador_json'], true) + ['duelo_id' => (int) $abierto['id']]] : []) : null,
            'historial' => array_map(fn($d) => self::duelJson($d, $j), $hist),
            'defensas_nuevas' => $nuevas,
            'ranking' => $rk['ranking'],
            'reglas' => ['minutos' => self::MINUTOS, 'max_par_dia' => self::MAX_PAR_DIA, 'fama_tope_dia' => self::FAMA_TOPE_DIA, 'politica' => self::POLITICA],
        ];
        return $o;
    }

    /**
     * Bono de ventajas pagadas en duelos (MONETIZACION.md §1): Ventajas::bono($j, 'duelo'), recortado con
     * Estrellas::bonoFinal (la estrella ya juega dentro del equipo). 0 sin Ventajas o si algo falla. Máximo 12.
     */
    public static function bonoVentajas(int $j): int
    {
        try {
            if ($j < 1 || !class_exists(Ventajas::class) || !method_exists(Ventajas::class, 'bono')) return 0;
            $b = (int) (Ventajas::bono($j, 'duelo')['total'] ?? 0);
            if (class_exists(Estrellas::class) && method_exists(Estrellas::class, 'bonoFinal')) $b = Estrellas::bonoFinal($j, 'duelo', $b);
            return max(0, min(12, $b));
        } catch (\Throwable $e) {
            error_log('EN VIVO duelos: bono de ventajas ' . mb_substr($e->getMessage(), 0, 200));
            return 0;
        }
    }

    /** [bono del retador, bono del fantasma] fijados al retar (guardados con las decisiones del fantasma). */
    private static function bonosDuelo(array $d): array
    {
        $b = json_decode((string) ($d['decisiones_defensor_json'] ?? ''), true)['bonos'] ?? null;
        return [max(0, min(12, (int) ($b['retador'] ?? 0))), max(0, min(12, (int) ($b['defensor'] ?? 0)))];
    }

    /** Bloque pequeño para GET /api/estado ("duelos"). */
    public static function estado(int $j): array
    {
        self::preparar();
        $r = self::ratingDe(self::temporada(), $j);
        $c = self::cupos($j);
        return ['rating' => $r['rating'], 'liga' => $r['liga'], 'restantes' => $c['restantes'],
                'tiene_equipo' => (bool) Db::valor('SELECT 1 FROM duelo_equipos WHERE jugador_id = ?', [$j]),
                'defensas_nuevas' => (int) Db::valor("SELECT COUNT(*) FROM duelos WHERE defensor_id = ? AND estado = 'cerrado' AND visto_defensor = 0", [$j]),
                'en_curso' => (bool) Db::valor("SELECT 1 FROM duelos WHERE retador_id = ? AND estado = 'abierto' AND vence >= ?", [$j, time()])];
    }

    public static function json(mixed $v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
}
