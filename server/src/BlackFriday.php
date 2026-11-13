<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Black Friday 2026 (pedido del dueño): las primeras 100 cuentas reciben el Pase VIP 30 días GRATIS para probar el juego.
 * Contrato en server/API.md ("Black Friday"); tabla promo_reclamos (migraciones/promo.sql).
 *  - Ventana y cupo en Ajustes (se cambian en el Centro de Control → Buzón y códigos → Black Friday):
 *      bf_activa (1/0, por defecto 1) · bf_desde / bf_hasta (segundos Unix; por defecto 27/11/2026 00:00 a 30/11/2026 23:59:59
 *      America/Guayaquil) · bf_cupo (100) · bf_codigo (BLACKFRIDAY) · bf_ip_max (3 cuentas por conexión).
 *  - Se reclama con el botón de Inicio (POST /api/promo/black_friday/reclamar) o con el código en el buzón / canjear.html
 *    (Buzon::canjear lo manda aquí): los dos sacan del MISMO cupo y una cuenta solo puede tenerlo una vez.
 *  - Entrega: Monedero::sumarVip($jugador, 30), lo mismo que la compra del Pase VIP 30 días (vip30), así valen todas las
 *    ventajas del Pase; si ya tiene VIP, se suman 30 días a su vencimiento. NO es una compra: no sube el nivel VIP ni cuenta
 *    como ingreso. Nada al azar y nada que se cambie por dinero. Deja un aviso en el buzón (sin premios) y una línea en la auditoría.
 *  - Contra el abuso (una persona con muchas cuentas): una vez por cuenta, una vez por instalación del juego (número al azar
 *    del aparato, el mismo de la analítica) y como máximo bf_ip_max cuentas por conexión (en Ecuador muchos celulares
 *    comparten IP), más el límite de intentos por cuenta y por conexión. Cuentas suspendidas o baneadas no reclaman.
 *  - Atómico: todo dentro de Db::tx (BEGIN IMMEDIATE); el cupo se cuenta dentro de la transacción y UNIQUE (promo, jugador_id)
 *    impide la segunda vez aunque lleguen dos peticiones a la vez. Nunca más de bf_cupo reclamos.
 */
final class BlackFriday
{
    public const PROMO = 'black_friday_2026';
    public const DIAS = 30;
    public const CUPO = 100;
    public const CODIGO = 'BLACKFRIDAY';
    public const IP_MAX = 3;
    public const DESDE = '2026-11-27 00:00:00';
    public const HASTA = '2026-11-30 23:59:59';
    public const ZONA = 'America/Guayaquil';
    public const INTENTOS_CUENTA = 10;   // en 10 minutos
    public const INTENTOS_IP = 40;

    private static ?int $reloj = null;
    private static bool $listo = false;

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    /** Crea la tabla si todavía no está (Db::migrarModulos ya lo hace; esto es por si acaso). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'promo_reclamos'")) Migraciones::aplicar('promo.sql');
        self::$listo = true;
    }

    private static function fechaPorDefecto(string $f): int { return (new \DateTimeImmutable($f, new \DateTimeZone(self::ZONA)))->getTimestamp(); }

    // ------------------------------------------------------------------------------------------ ajustes
    /** Ajustes de la promo con sus valores por defecto. */
    public static function config(): array
    {
        $ent = fn(string $k, int $def) => preg_match('/^\d{1,11}$/', Ajustes::get($k)) ? (int) Ajustes::get($k) : $def;
        $cod = Buzon::normalizarCodigo(Ajustes::get('bf_codigo', self::CODIGO));
        return [
            'activa' => Ajustes::get('bf_activa', '1') === '1',
            'desde' => $ent('bf_desde', self::fechaPorDefecto(self::DESDE)),
            'hasta' => $ent('bf_hasta', self::fechaPorDefecto(self::HASTA)),
            'cupo' => max(0, $ent('bf_cupo', self::CUPO)),
            'codigo' => $cod,
            'ip_max' => max(1, $ent('bf_ip_max', self::IP_MAX)),
        ];
    }

    /**
     * Cambios desde el Centro de Control: {activa?, desde?, hasta?, cupo?, codigo?, ip_max?} (fechas en segundos Unix).
     * Revisa todo y guarda en un paso (Ajustes::guardar deja UNA línea de auditoría "promo_black_friday").
     */
    public static function guardar(array $d, string $quien): array
    {
        self::preparar();
        $c = self::config();
        $n = array_merge($c, array_intersect_key($d, $c));
        $desde = (int) $n['desde']; $hasta = (int) $n['hasta'];
        Fallo::si($desde <= 0 || $hasta <= 0, 'Escribe las dos fechas de la promoción.', 400, ['codigo' => 'fecha_invalida']);
        Fallo::si($hasta <= $desde, 'La fecha final debe ser después de la inicial.', 400, ['codigo' => 'fecha_invalida']);
        $cupo = (int) $n['cupo'];
        Fallo::si($cupo < 1 || $cupo > 10000, 'El cupo va de 1 a 10.000 cuentas.', 400, ['codigo' => 'cupo_invalido']);
        $ya = self::reclamados();
        Fallo::si($cupo < $ya, 'Ya reclamaron ' . $ya . ' cuentas: el cupo no puede ser menor.', 400, ['codigo' => 'cupo_invalido']);
        $ipMax = (int) $n['ip_max'];
        Fallo::si($ipMax < 1 || $ipMax > 100, 'Cuentas por conexión: de 1 a 100.', 400, ['codigo' => 'cupo_invalido']);
        $cod = Buzon::normalizarCodigo((string) $n['codigo']);
        Fallo::si($cod !== '' && !preg_match('/^[A-Z0-9]{4,32}$/', $cod), 'El código debe tener de 4 a 32 letras o números (sin tildes ni signos), o quedar vacío.', 400, ['codigo' => 'codigo_formato']);
        Buzon::preparar();
        Fallo::si($cod !== '' && (bool) Db::valor('SELECT 1 FROM buzon_codigos WHERE codigo = ?', [$cod]), 'Ya existe un código de regalo ' . $cod . ' en el buzón: elige otra palabra.', 409, ['codigo' => 'codigo_repetido']);
        Ajustes::guardar(['bf_activa' => $n['activa'] ? '1' : '0', 'bf_desde' => (string) $desde, 'bf_hasta' => (string) $hasta, 'bf_cupo' => (string) $cupo,
            'bf_codigo' => $cod, 'bf_ip_max' => (string) $ipMax], $quien, 'promo_black_friday');
        return self::config();
    }

    // ------------------------------------------------------------------------------------------ estado
    public static function reclamados(): int
    {
        self::preparar();
        return (int) Db::valor('SELECT COUNT(*) FROM promo_reclamos WHERE promo = ?', [self::PROMO]);
    }

    /** 'apagada' | 'pronto' | 'activa' | 'agotada' | 'terminada'. */
    public static function fase(?array $c = null, ?int $reclamados = null): string
    {
        $c ??= self::config();
        $t = self::ahora();
        if (!$c['activa']) return 'apagada';
        if ($t < $c['desde']) return 'pronto';
        if ($t > $c['hasta']) return 'terminada';
        return ($reclamados ?? self::reclamados()) >= $c['cupo'] ? 'agotada' : 'activa';
    }

    /**
     * GET /api/promo/black_friday: {ok, promo, fase, activa, desde, hasta, ahora, cupo, reclamados, quedan, dias, reclamado}
     * (reclamado: null sin sesión; con sesión true/false y vip_hasta). Nunca dice el código ni quién reclamó.
     */
    public static function estado(?int $jugador = null): array
    {
        self::preparar();
        $c = self::config();
        $n = self::reclamados();
        $fase = self::fase($c, $n);
        $o = ['ok' => true, 'promo' => self::PROMO, 'fase' => $fase, 'activa' => $fase === 'activa', 'desde' => Db::iso($c['desde']), 'hasta' => Db::iso($c['hasta']),
              'ahora' => Db::iso(self::ahora()), 'cupo' => $c['cupo'], 'reclamados' => min($n, $c['cupo']), 'quedan' => max(0, $c['cupo'] - $n), 'dias' => self::DIAS, 'reclamado' => null];
        if ($jugador) {
            $r = Db::fila('SELECT creado, vip_hasta FROM promo_reclamos WHERE promo = ? AND jugador_id = ?', [self::PROMO, $jugador]);
            $o['reclamado'] = (bool) $r;
            if ($r) { $o['reclamado_en'] = Db::iso((int) $r['creado']); $o['vip_hasta'] = Db::iso((int) $r['vip_hasta']); }
        }
        return $o;
    }

    /** ¿Este texto (ya normalizado por Buzon::normalizarCodigo) es la palabra de la promo? */
    public static function esCodigo(string $cod): bool
    {
        if ($cod === '') return false;
        $c = self::config()['codigo'];
        return $c !== '' && hash_equals($c, $cod);
    }

    private static function instalacion(mixed $i): ?string
    {
        return is_string($i) && preg_match('/^[a-f0-9]{32}$/', $i) ? $i : null;
    }

    // ------------------------------------------------------------------------------------------ reclamar
    /**
     * Reclama el VIP gratis. $canal: 'juego' (botón de Inicio), 'codigo' (código en el buzón del juego) o 'web' (canjear.html).
     * Devuelve estado() + {vip_hasta, vip_antes, nuevo: true}. Errores (Fallo con codigo): promo_apagada, promo_pronto,
     * promo_terminada, promo_agotada, promo_ya_reclamada, promo_dispositivo, promo_conexion, limite_intentos, cuenta_*.
     */
    public static function reclamar(int $jugador, string $canal = 'juego', mixed $instalacion = null): array
    {
        self::preparar();
        $ip = Http::ip();
        $kj = 'promo:j:' . $jugador; $ki = 'promo:ip:' . $ip;
        if (Limite::contar($kj, self::INTENTOS_CUENTA) || Limite::contar($ki, self::INTENTOS_IP))
            throw new Fallo('Demasiados intentos seguidos. Espera 10 minutos e intenta de nuevo.', 429, ['codigo' => 'limite_intentos']);
        Cuentas::exigirActiva($jugador);
        Fallo::si(!Cuentas::porId($jugador), 'Esa cuenta no existe.', 404, ['codigo' => 'jugador_no_existe']);
        $canal = in_array($canal, ['juego', 'codigo', 'web'], true) ? $canal : 'juego';
        $inst = self::instalacion($instalacion);
        $res = Db::tx(function () use ($jugador, $canal, $inst, $ip): array {
            $t = self::ahora();
            $c = self::config();
            if (Db::valor('SELECT 1 FROM promo_reclamos WHERE promo = ? AND jugador_id = ?', [self::PROMO, $jugador]))
                throw new Fallo('Ya reclamaste tu VIP gratis de Black Friday en esta cuenta.', 409, ['codigo' => 'promo_ya_reclamada']);
            $n = self::reclamados();
            switch (self::fase($c, $n)) {
                case 'apagada': throw new Fallo('La promoción de Black Friday no está disponible.', 409, ['codigo' => 'promo_apagada']);
                case 'pronto': throw new Fallo('La promoción de Black Friday empieza el ' . date('d/m/Y H:i', $c['desde']) . '.', 409, ['codigo' => 'promo_pronto', 'fecha' => date('d/m/Y H:i', $c['desde'])]);
                case 'terminada': throw new Fallo('La promoción de Black Friday ya terminó.', 410, ['codigo' => 'promo_terminada']);
                case 'agotada': throw new Fallo('Se agotaron los ' . $c['cupo'] . ' VIP gratis. ¡Gracias por jugar!', 410, ['codigo' => 'promo_agotada', 'cupo' => $c['cupo']]);
            }
            if ($inst !== null && Db::valor('SELECT 1 FROM promo_reclamos WHERE promo = ? AND instalacion = ?', [self::PROMO, $inst]))
                throw new Fallo('El VIP gratis ya se reclamó desde este aparato con otra cuenta. Es uno por persona.', 409, ['codigo' => 'promo_dispositivo']);
            if ($ip !== '' && (int) Db::valor('SELECT COUNT(*) FROM promo_reclamos WHERE promo = ? AND ip = ?', [self::PROMO, $ip]) >= $c['ip_max'])
                throw new Fallo('Desde esta conexión ya se reclamaron varios VIP gratis. Es uno por persona.', 409, ['codigo' => 'promo_conexion']);
            $antes = Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$jugador]);
            $nuevo = Monedero::sumarVip($jugador, self::DIAS);   // lo mismo que comprar el Pase VIP 30 días (vip30)
            Db::q('INSERT INTO promo_reclamos (promo, jugador_id, canal, instalacion, ip, vip_antes, vip_hasta, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [self::PROMO, $jugador, $canal, $inst, $ip !== '' ? $ip : null, $antes, $nuevo, $t]);
            $num = $n + 1;
            try {
                Buzon::enviar($jugador, '🎁 Black Friday: VIP 30 días GRATIS', 'Tu Pase VIP de ' . self::DIAS . ' días ya está activo (hasta el ' . date('d/m/Y', $nuevo) . '). '
                    . 'Eres una de las ' . $c['cupo'] . " primeras productoras de Black Friday.\n¡Gracias por jugar EN VIVO Tycoon!", [], ['tipo' => 'evento', 'ref' => 'promo:' . self::PROMO]);
            } catch (\Throwable) {
                // el aviso del buzón es opcional: el VIP ya quedó
            }
            Auditoria::anotar('juego', 'promo_black_friday_reclamo', 'VIP ' . self::DIAS . ' días gratis (' . $num . ' de ' . $c['cupo'] . ', canal ' . $canal . '): '
                . ($antes !== null && (int) $antes > time() ? 'tenía VIP hasta ' . date('d/m/Y H:i', (int) $antes) . ', ' : '') . 'ahora hasta ' . date('d/m/Y H:i', $nuevo), $jugador);
            return ['vip_antes' => $antes !== null ? Db::iso((int) $antes) : null, 'nuevo' => true];
        });
        return self::estado($jugador) + $res;
    }

    /** Canje con la palabra de la promo desde el buzón (Buzon::canjear): devuelve lo mismo que un código del buzón + "promo". */
    public static function canjearCodigo(int $jugador, string $canal = 'juego', mixed $instalacion = null): array
    {
        $r = self::reclamar($jugador, in_array($canal, ['web'], true) ? $canal : 'codigo', $instalacion);
        $mid = (int) Db::valor('SELECT id FROM buzon WHERE jugador_id = ? AND ref = ?', [$jugador, 'promo:' . self::PROMO]);
        $o = ['ok' => true, 'codigo' => self::config()['codigo'], 'promo' => $r];
        if ($mid > 0) {
            $m = Db::fila('SELECT * FROM buzon WHERE id = ?', [$mid]);
            if ($m) $o['mensaje'] = Buzon::json($m);
        }
        return $o + Buzon::resumen($jugador);
    }

    // ------------------------------------------------------------------------------------------ Centro de Control
    /** Lista de quienes reclamaron (más recientes primero). */
    public static function lista(int $max = 200): array
    {
        self::preparar();
        return Db::todas('SELECT r.*, j.email, j.nombre, j.vip_hasta AS vip_actual FROM promo_reclamos r LEFT JOIN jugadores j ON j.id = r.jugador_id
                          WHERE r.promo = ? ORDER BY r.id DESC LIMIT ' . max(1, min($max, 10000)), [self::PROMO]);
    }
}
