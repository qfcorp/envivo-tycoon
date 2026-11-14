<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * "Invita a tu equipo" (idea 5 de propuestas): premios por invitar amigos con el enlace ?ref= que ya comparte js/compartir.js.
 * Tablas en migraciones/invitar_creadores.sql; integración en server/INTEGRAR_INVITAR.md.
 *  - Código de invitación de cada cuenta: "p" + id en base 36 (el mismo que arma js/compartir.js: p1z).
 *  - El amigo que llega con ?ref= (lo guarda compartir.js en localStorage) lo manda al crear la cuenta (api_registro llama
 *    Invitaciones::alRegistrar) o, si se perdió, con POST /api/invitar/vincular hasta DIAS_VINCULAR días después.
 *    Recibe un pack de bienvenida en el buzón (cables, baterías y $ del juego): uno por aparato y pocos por conexión.
 *  - Quien invita gana premios por ETAPAS cuando el amigo AVANZA, nunca por instalar: llega al capítulo 2 (partida en la
 *    nube), juega 3 días distintos (actividad diaria del servidor) y entra a una asociación. "Amigo activo" = capítulo 2 y
 *    3 días. Metas acumuladas de 1, 3, 5 y 10 amigos activos; la de 10 da el distintivo exclusivo "letrero dorado".
 *  - Antifraude: nadie se invita a sí mismo, el invitador tiene que ser una cuenta más vieja, un aparato que ya usó el invitador
 *    (o que ya usó otra cuenta) no cuenta, como mucho IP_MAX_POR_INVITADOR invitados desde la misma conexión, y solo los
 *    primeros TOPE_AMIGOS amigos dan premios por etapa. Nunca se premia calificar ni opinar en la tienda.
 *  - Los premios llegan al buzón (Buzon::enviar con ref: idempotente). Todo es del juego: nada se cambia por dinero.
 *  - Se evalúa al pedir GET /api/invitar (el invitador o el invitado): sin tareas programadas.
 */
final class Invitaciones
{
    public const PREFIJO = 'p';
    public const DIAS_VINCULAR = 3;
    public const TOPE_AMIGOS = 30;
    public const IP_MAX_POR_INVITADOR = 2;
    public const IP_MAX_BIENVENIDA = 3;       // packs de bienvenida por conexión cada 30 días
    public const CAPITULO = 1;                // s.chapter es 0 en el capítulo 1: >= 1 = llegó al capítulo 2
    public const DIAS = 3;
    public const MAX_ASOC = 20;
    public const BIENVENIDA = [
        ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3],
        ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3],
        ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1000],
    ];
    /** Etapas de cada amigo (en orden) y lo que gana quien invitó. */
    public const ETAPAS = [
        'capitulo2' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1500], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2]],
        'dias3' => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 10]],
        'asociacion' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1000], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2]],
    ];
    public const NOMBRE_ETAPA = ['capitulo2' => 'llegó al capítulo 2', 'dias3' => 'jugó 3 días distintos', 'asociacion' => 'entró a una asociación'];
    /** Metas acumuladas de amigos activos. */
    public const METAS = [
        1 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 20], ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000]],
        3 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 40], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        5 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 60], ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000]],
        10 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 100]],
    ];
    public const DISTINTIVO_META = [10 => 'letrero_dorado'];
    public const DISTINTIVOS = ['letrero_dorado' => 'Letrero dorado de la sede', 'productor_aliado' => 'Productor Aliado'];

    private static ?int $reloj = null;
    private static bool $listo = false;

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'invitaciones'")) Migraciones::aplicar('invitar_creadores.sql');
        self::$listo = true;
    }

    public static function activa(): bool { return Ajustes::get('inv_activa', '1') === '1'; }

    // ------------------------------------------------------------------------------------------ código
    public static function codigoDe(int $jugador): string { return self::PREFIJO . base_convert((string) $jugador, 10, 36); }

    /** Id del jugador de un código "p1z" (o null). */
    public static function jugadorDeCodigo(string $c): ?int
    {
        $c = strtolower(trim($c));
        if (!preg_match('/^' . self::PREFIJO . '([0-9a-z]{1,6})$/', $c, $m)) return null;
        $id = (int) base_convert($m[1], 36, 10);
        return $id > 0 ? $id : null;
    }

    public static function instalacion(mixed $i): ?string
    {
        return is_string($i) && preg_match('/^[a-f0-9]{32}$/', $i) ? $i : null;
    }

    private static function tabla(string $t): bool
    {
        return (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]);
    }

    // ------------------------------------------------------------------------------------------ al crear la cuenta
    /**
     * Gancho de api_registro (una línea): $in = lo que mandó el juego. ref = código de invitación ("p1z") o código de un
     * creador (?ref=PRODUCTOR-JUAN); creador = código de creador escrito en el formulario. NUNCA lanza: la cuenta ya existe.
     * Devuelve lo que pasó (para pruebas y la auditoría).
     */
    public static function alRegistrar(int $jugador, array $in): array
    {
        $o = ['invitacion' => null, 'aliado' => null];
        try {
            self::preparar();
            $ref = is_string($in['ref'] ?? null) ? mb_substr(trim($in['ref']), 0, 40) : '';
            $cre = is_string($in['creador'] ?? null) ? mb_substr(trim($in['creador']), 0, 40) : '';
            $inst = self::instalacion($in['instalacion'] ?? null);
            if ($ref !== '') {
                if (self::jugadorDeCodigo($ref) !== null) {
                    try { $o['invitacion'] = self::vincular($jugador, $ref, $inst, 'registro'); } catch (Fallo $e) { $o['invitacion'] = ['error' => $e->extra['codigo'] ?? 'error']; }
                } elseif ($cre === '' && Aliados::esCodigo(Buzon::normalizarCodigo($ref))) {
                    $cre = $ref;   // enlace de un creador: juego.tukanec.com/?ref=PRODUCTOR-JUAN
                }
            }
            if ($cre !== '') {
                try { $o['aliado'] = Aliados::usar($jugador, $cre, $ref !== '' && $cre === $ref ? 'enlace' : 'registro', $inst); }
                catch (Fallo $e) { $o['aliado'] = ['error' => $e->extra['codigo'] ?? 'error']; }
            }
        } catch (\Throwable $e) {
            error_log('EN VIVO invitaciones: alRegistrar ' . mb_substr($e->getMessage(), 0, 200));
        }
        return $o;
    }

    /**
     * Une la cuenta nueva $invitado con quien la invitó. Errores (Fallo con codigo): invitacion_apagada, invitacion_codigo,
     * invitacion_propia, invitacion_ya, invitacion_tarde. Devuelve {ok, invitador, estado, motivo, bienvenida}.
     */
    public static function vincular(int $invitado, string $ref, mixed $instalacion, string $canal = 'registro'): array
    {
        self::preparar();
        Fallo::si(!self::activa(), 'Las invitaciones no están disponibles por ahora.', 409, ['codigo' => 'invitacion_apagada']);
        $de = self::jugadorDeCodigo($ref);
        $inv = $de ? Cuentas::porId($de) : null;
        Fallo::si(!$inv || ($inv['estado'] ?? 'activo') !== 'activo', 'Ese enlace de invitación no es válido.', 404, ['codigo' => 'invitacion_codigo']);
        Fallo::si($de === $invitado, 'No puedes invitarte a ti mismo.', 409, ['codigo' => 'invitacion_propia']);
        $yo = Cuentas::porId($invitado);
        Fallo::si(!$yo, 'Esa cuenta no existe.', 404, ['codigo' => 'jugador_no_existe']);
        $t = self::ahora();
        Fallo::si((int) $yo['creado'] < $t - self::DIAS_VINCULAR * 86400 || (int) $inv['creado'] > (int) $yo['creado'],
            'La invitación solo vale para cuentas nuevas.', 409, ['codigo' => 'invitacion_tarde']);
        $inst = self::instalacion($instalacion);
        $ip = Http::ip();
        $canal = in_array($canal, ['registro', 'vincular'], true) ? $canal : 'registro';
        return Db::tx(function () use ($invitado, $de, $inst, $ip, $canal, $t, $inv): array {
            Fallo::si((bool) Db::valor('SELECT 1 FROM invitaciones WHERE invitado_id = ?', [$invitado]), 'Tu cuenta ya tiene una invitación.', 409, ['codigo' => 'invitacion_ya']);
            [$estado, $motivo] = self::revisarFraude($invitado, $de, $inst, $ip);
            $bien = $motivo !== 'mismo_aparato' && self::bienvenidaPermitida($inst, $ip, $t);
            Db::q('INSERT INTO invitaciones (invitado_id, invitador_id, codigo, canal, instalacion, ip, estado, motivo, bienvenida, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$invitado, $de, self::codigoDe($de), $canal, $inst, $ip !== '' ? $ip : null, $estado, $motivo, $bien ? 1 : 0, $t]);
            $alias = Social::nombrePublico($inv['alias'] ?? null, $inv['nombre'] ?? null);
            if ($bien) {
                Buzon::enviarPlantilla($invitado, 'inv_bienvenida_t', 'inv_bienvenida_c', ['alias' => $alias],
                    self::BIENVENIDA, ['tipo' => 'regalo', 'ref' => 'invitar:bienvenida']);
            }
            Auditoria::anotar('juego', 'invitacion_vincular', 'Invitado por N° ' . $de . ' (' . $canal . ')' . ($estado === 'bloqueada' ? ' · NO cuenta: ' . $motivo : '') . ($bien ? ' · pack de bienvenida' : ' · sin pack'), $invitado);
            return ['ok' => true, 'invitador' => $alias, 'estado' => $estado, 'motivo' => $motivo, 'bienvenida' => $bien];
        });
    }

    /** ['ok', null] o ['bloqueada', motivo]. Dentro de la transacción de vincular. */
    private static function revisarFraude(int $invitado, int $invitador, ?string $inst, string $ip): array
    {
        if ($inst !== null) {
            // El aparato ya es del invitador: se invitó a sí mismo con otra cuenta
            $delInvitador = (bool) Db::valor('SELECT 1 FROM invitaciones WHERE invitado_id = ? AND instalacion = ?', [$invitador, $inst])
                || (self::tabla('aliados_usos') && (bool) Db::valor('SELECT 1 FROM aliados_usos WHERE jugador_id = ? AND instalacion = ?', [$invitador, $inst]))
                || (self::tabla('analitica_instalaciones') && (bool) Db::valor('SELECT 1 FROM analitica_instalaciones WHERE instalacion = ? AND jugador_id = ?', [$inst, $invitador]))
                || (self::tabla('promo_reclamos') && (bool) Db::valor('SELECT 1 FROM promo_reclamos WHERE instalacion = ? AND jugador_id = ?', [$inst, $invitador]));
            if ($delInvitador) return ['bloqueada', 'mismo_aparato'];
            // Un aparato da UNA recompensa: ya lo usó otra invitación u otra cuenta
            if (Db::valor('SELECT 1 FROM invitaciones WHERE instalacion = ?', [$inst])) return ['bloqueada', 'aparato_repetido'];
            if (self::tabla('analitica_instalaciones') && Db::valor('SELECT 1 FROM analitica_instalaciones WHERE instalacion = ? AND jugador_id IS NOT NULL AND jugador_id <> ?', [$inst, $invitado]))
                return ['bloqueada', 'aparato_repetido'];
        }
        if ($ip !== '') {
            $n = (int) Db::valor("SELECT COUNT(*) FROM invitaciones WHERE invitador_id = ? AND ip = ? AND estado = 'ok'", [$invitador, $ip]);
            if ($n >= self::IP_MAX_POR_INVITADOR) return ['bloqueada', 'misma_conexion'];
        }
        return ['ok', null];
    }

    private static function bienvenidaPermitida(?string $inst, string $ip, int $t): bool
    {
        if ($inst !== null && Db::valor('SELECT 1 FROM invitaciones WHERE instalacion = ? AND bienvenida = 1', [$inst])) return false;
        if ($ip !== '' && (int) Db::valor('SELECT COUNT(*) FROM invitaciones WHERE ip = ? AND bienvenida = 1 AND creado >= ?', [$ip, $t - 30 * 86400]) >= self::IP_MAX_BIENVENIDA) return false;
        return true;
    }

    // ------------------------------------------------------------------------------------------ avance del amigo
    /** {capitulo: int|null (0 = capítulo 1), dias: int, asociacion: bool} de un jugador, con lo que sabe el servidor. */
    public static function progreso(int $jugador): array
    {
        $cap = Db::valor("SELECT CASE WHEN json_valid(datos) THEN json_extract(datos, '$.chapter') END FROM partidas WHERE jugador_id = ?", [$jugador]);
        $fin = Db::valor("SELECT CASE WHEN json_valid(datos) THEN json_extract(datos, '$.storyDone') END FROM partidas WHERE jugador_id = ?", [$jugador]);
        $sql = 'SELECT dia FROM actividad WHERE jugador_id = ?';
        $p = [$jugador];
        if (self::tabla('actividad_diaria')) { $sql .= ' UNION SELECT dia FROM actividad_diaria WHERE jugador_id = ?'; $p[] = $jugador; }
        $dias = (int) Db::valor('SELECT COUNT(*) FROM (' . $sql . ')', $p);
        $asoc = (bool) Db::valor('SELECT 1 FROM asociacion_miembros WHERE jugador_id = ?', [$jugador]);
        $c = is_numeric($cap) ? (int) $cap : null;
        if ((int) $fin === 1) $c = max($c ?? 0, self::CAPITULO);
        return ['capitulo' => $c, 'dias' => $dias, 'asociacion' => $asoc];
    }

    /** Qué etapas cumple ese avance. */
    private static function cumple(array $p): array
    {
        return ['capitulo2' => $p['capitulo'] !== null && $p['capitulo'] >= self::CAPITULO, 'dias3' => $p['dias'] >= self::DIAS, 'asociacion' => $p['asociacion']];
    }

    /**
     * Revisa a los amigos de $invitador: anota las etapas nuevas, manda los premios (solo los primeros TOPE_AMIGOS amigos) y
     * las metas acumuladas. Idempotente (UPDATE ... WHERE etapa IS NULL + ref del buzón). Devuelve cuántos premios mandó.
     */
    public static function evaluar(int $invitador): int
    {
        self::preparar();
        if (!self::activa()) return 0;
        $enviados = 0;
        $filas = Db::todas("SELECT * FROM invitaciones WHERE invitador_id = ? AND estado = 'ok' ORDER BY creado, invitado_id", [$invitador]);
        $orden = 0;
        foreach ($filas as $f) {
            $orden++;
            $inv = (int) $f['invitado_id'];
            if ($f['capitulo2'] !== null && $f['dias3'] !== null && $f['asociacion'] !== null) continue;
            $c = self::cumple(self::progreso($inv));
            foreach (array_keys(self::ETAPAS) as $etapa) {
                if (!$c[$etapa] || $f[$etapa] !== null) continue;
                $enviados += Db::tx(function () use ($etapa, $inv, $invitador, $orden): int {
                    $t = self::ahora();
                    if (Db::q('UPDATE invitaciones SET ' . $etapa . ' = ? WHERE invitado_id = ? AND ' . $etapa . ' IS NULL', [$t, $inv])->rowCount() !== 1) return 0;
                    if ($orden > self::TOPE_AMIGOS) return 0;
                    $a = Cuentas::porId($inv) ?? [];
                    $alias = Social::nombrePublico($a['alias'] ?? null, $a['nombre'] ?? null);
                    Buzon::enviarPlantilla($invitador, 'inv_etapa_t', 'inv_etapa_' . $etapa . '_c', ['alias' => $alias], self::ETAPAS[$etapa],
                        ['tipo' => 'regalo', 'ref' => 'invitar:etapa:' . $inv . ':' . $etapa]);
                    return 1;
                });
            }
            // Activo = capítulo 2 y 3 días
            Db::q('UPDATE invitaciones SET activo = ? WHERE invitado_id = ? AND activo IS NULL AND capitulo2 IS NOT NULL AND dias3 IS NOT NULL', [self::ahora(), $inv]);
        }
        return $enviados + self::metas($invitador);
    }

    private static function metas(int $invitador): int
    {
        $n = self::activos($invitador);
        $enviados = 0;
        foreach (self::METAS as $meta => $premio) {
            if ($n < $meta) break;
            $enviados += Db::tx(function () use ($meta, $premio, $invitador): int {
                $t = self::ahora();
                if (Db::q('INSERT OR IGNORE INTO invitaciones_metas (invitador_id, meta, creado) VALUES (?, ?, ?)', [$invitador, $meta, $t])->rowCount() !== 1) return 0;
                $dist = self::DISTINTIVO_META[$meta] ?? null;
                if ($dist) Db::q('INSERT OR IGNORE INTO distintivos (jugador_id, clave, creado) VALUES (?, ?, ?)', [$invitador, $dist, $t]);
                $clave = $meta === 1 ? 'inv_meta1' : 'inv_meta';
                Buzon::enviarPlantilla($invitador, $clave . '_t', $clave . '_c', ['n' => $meta,
                    'extra' => fn(string $L) => $dist ? (isset(TextosSistema::T['es']['inv_meta_dist_' . $dist]) ? TextosSistema::texto('inv_meta_dist_' . $dist, $L)
                        : "\nAdemás ganaste el " . mb_strtolower(self::DISTINTIVOS[$dist]) . ': se ve en tu vitrina.') : ''],
                    $premio, ['tipo' => 'regalo', 'ref' => 'invitar:meta:' . $meta]);
                Auditoria::anotar('juego', 'invitacion_meta', 'Meta de ' . $meta . ' amigos activos' . ($dist ? ' + ' . $dist : ''), $invitador);
                return 1;
            });
        }
        return $enviados;
    }

    public static function activos(int $invitador): int
    {
        return (int) Db::valor("SELECT COUNT(*) FROM invitaciones WHERE invitador_id = ? AND estado = 'ok' AND activo IS NOT NULL", [$invitador]);
    }

    // ------------------------------------------------------------------------------------------ distintivos
    /** Distintivos públicos de un jugador: [{clave, nombre, nivel?}] (letrero dorado, Productor Aliado). */
    public static function distintivos(int $jugador): array
    {
        try {
            self::preparar();
            $o = [];
            foreach (Db::todas('SELECT clave FROM distintivos WHERE jugador_id = ? ORDER BY creado, clave', [$jugador]) as $f) {
                $k = (string) $f['clave'];
                if (isset(self::DISTINTIVOS[$k])) $o[] = ['clave' => $k, 'nombre' => self::DISTINTIVOS[$k]];
            }
            $a = Aliados::insignia($jugador);
            if ($a) array_unshift($o, ['clave' => 'productor_aliado', 'nombre' => self::DISTINTIVOS['productor_aliado'], 'nivel' => $a['nivel']]);
            return $o;
        } catch (\Throwable) {
            return [];
        }
    }

    // ------------------------------------------------------------------------------------------ GET /api/invitar
    private static function premiosJson(array $l): array { return Buzon::adjuntosJson(Buzon::normalizarAdjuntos($l)); }

    /** Lo que ve el juego: código, enlace, amigos con su avance, metas, quién te invitó, distintivos y lo de creador. */
    public static function estado(int $jugador): array
    {
        self::preparar();
        $mia = Db::fila('SELECT * FROM invitaciones WHERE invitado_id = ?', [$jugador]);
        if (self::activa()) {
            self::evaluar($jugador);
            if ($mia && $mia['estado'] === 'ok') self::evaluar((int) $mia['invitador_id']);
        }
        try { Aliados::entregarCreditosMes($jugador); } catch (\Throwable $e) { error_log('EN VIVO aliados: créditos del mes ' . mb_substr($e->getMessage(), 0, 200)); }
        $amigos = [];
        foreach (Db::todas('SELECT i.*, j.alias, j.nombre FROM invitaciones i JOIN jugadores j ON j.id = i.invitado_id WHERE i.invitador_id = ? ORDER BY i.creado DESC, i.invitado_id DESC LIMIT 100', [$jugador]) as $f) {
            $p = $f['estado'] === 'ok' ? self::progreso((int) $f['invitado_id']) : ['capitulo' => null, 'dias' => 0, 'asociacion' => false];
            $amigos[] = ['alias' => Social::nombrePublico($f['alias'], $f['nombre']), 'desde' => Db::iso((int) $f['creado']), 'cuenta' => $f['estado'] === 'ok',
                'activo' => $f['activo'] !== null, 'capitulo' => $p['capitulo'] !== null ? $p['capitulo'] + 1 : null, 'dias' => min($p['dias'], 99),
                'etapas' => ['capitulo2' => $f['capitulo2'] !== null, 'dias3' => $f['dias3'] !== null, 'asociacion' => $f['asociacion'] !== null]];
        }
        $act = self::activos($jugador);
        $hechas = array_map('intval', array_column(Db::todas('SELECT meta FROM invitaciones_metas WHERE invitador_id = ?', [$jugador]), 'meta'));
        $metas = [];
        foreach (self::METAS as $m => $pr) $metas[] = ['n' => $m, 'premios' => self::premiosJson($pr), 'distintivo' => self::DISTINTIVO_META[$m] ?? null, 'logrado' => in_array($m, $hechas, true)];
        $etapas = [];
        foreach (self::ETAPAS as $k => $pr) $etapas[] = ['clave' => $k, 'premios' => self::premiosJson($pr)];
        $mi = null;
        if ($mia) {
            $a = Cuentas::porId((int) $mia['invitador_id']) ?? [];
            $mi = ['invitador' => Social::nombrePublico($a['alias'] ?? null, $a['nombre'] ?? null), 'bienvenida' => (bool) (int) $mia['bienvenida'], 'desde' => Db::iso((int) $mia['creado'])];
        }
        $as = Social::asociacionDe($jugador);
        $asoc = $as ? ['siglas' => $as['siglas'], 'nombre' => $as['nombre'], 'miembros' => (int) Db::valor('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$as['id']]), 'max' => self::MAX_ASOC] : null;
        $yo = Cuentas::porId($jugador) ?? [];
        return ['ok' => true, 'activa' => self::activa(), 'codigo' => self::codigoDe($jugador), 'enlace' => rtrim(Http::urlBase(), '/') . '/?ref=' . self::codigoDe($jugador),
            'amigos' => $amigos, 'total' => count($amigos), 'activos' => $act, 'tope' => self::TOPE_AMIGOS, 'metas' => $metas, 'etapas' => $etapas,
            'bienvenida' => self::premiosJson(self::BIENVENIDA), 'mi_invitacion' => $mi,
            'puede_vincular' => !$mia && (int) ($yo['creado'] ?? 0) >= self::ahora() - self::DIAS_VINCULAR * 86400,
            'distintivos' => self::distintivos($jugador), 'asociacion' => $asoc] + Aliados::estadoJugador($jugador);
    }

    // ------------------------------------------------------------------------------------------ Centro de Control
    public static function resumenPanel(): array
    {
        self::preparar();
        return [
            'total' => (int) Db::valor('SELECT COUNT(*) FROM invitaciones'),
            'bloqueadas' => (int) Db::valor("SELECT COUNT(*) FROM invitaciones WHERE estado = 'bloqueada'"),
            'activos' => (int) Db::valor("SELECT COUNT(*) FROM invitaciones WHERE estado = 'ok' AND activo IS NOT NULL"),
            'packs' => (int) Db::valor('SELECT COUNT(*) FROM invitaciones WHERE bienvenida = 1'),
            'metas' => (int) Db::valor('SELECT COUNT(*) FROM invitaciones_metas'),
            'letreros' => (int) Db::valor("SELECT COUNT(*) FROM distintivos WHERE clave = 'letrero_dorado'"),
        ];
    }

    /** Los que más invitan (amigos activos primero). */
    public static function topInvitadores(int $max = 20): array
    {
        self::preparar();
        return Db::todas("SELECT i.invitador_id, j.nombre, j.email, COUNT(*) AS total, SUM(i.estado = 'ok' AND i.activo IS NOT NULL) AS activos, SUM(i.estado = 'bloqueada') AS bloqueadas
                          FROM invitaciones i LEFT JOIN jugadores j ON j.id = i.invitador_id GROUP BY i.invitador_id ORDER BY activos DESC, total DESC LIMIT " . max(1, min($max, 500)));
    }

    public static function recientes(int $max = 50): array
    {
        self::preparar();
        return Db::todas('SELECT i.*, a.nombre AS invitado_nombre, b.nombre AS invitador_nombre FROM invitaciones i LEFT JOIN jugadores a ON a.id = i.invitado_id
                          LEFT JOIN jugadores b ON b.id = i.invitador_id ORDER BY i.creado DESC, i.invitado_id DESC LIMIT ' . max(1, min($max, 1000)));
    }

    public static function encender(bool $on, string $quien): void
    {
        Ajustes::guardar(['inv_activa' => $on ? '1' : '0'], $quien, 'invitaciones_ajuste');
    }
}
