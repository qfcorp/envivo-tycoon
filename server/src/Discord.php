<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Bot de Discord de EN VIVO Tycoon (modelo "HTTP Interactions": NO hay un proceso conectado a Discord todo el tiempo).
 * Discord manda cada comando (/vincular, /perfil...) por POST a https://juego.tukanec.com/discord/interacciones,
 * firmado con Ed25519; server/public/discord/interacciones.php verifica la firma y llama a Discord::manejar().
 * Guía para el dueño: docs/DISCORD_BOT.md · Integración en api.php / nginx / cron: server/INTEGRAR_DISCORD.md
 *
 * - Vincular: el juego pide un código (POST /api/discord/codigo -> Discord::codigoParaJugador), 8 caracteres, 10 minutos,
 *   un solo uso, en la base SOLO su sha256. En Discord: /vincular codigo:XXXXXXXX -> se une discord_user_id <-> jugador_id
 *   y se ponen los roles ("Jugador verificado", "Comprador verificado", "VIP", "Presidente de asociación", "Servidor N · Ciudad").
 * - Roles: el bot SOLO toca los roles que maneja (los de arriba y los de los servidores del juego); los de idioma y
 *   los que pone el staff no los toca nunca. bin/discord_sync.php los revisa cada 10 minutos (VIP vencido, compras nuevas,
 *   cambios de asociación).
 * - Anuncios: Discord::anunciar('anuncios'|'eventos'|'estado', ...) con los webhooks de la configuración. Nunca compras ni
 *   datos personales (se rechaza el texto que tenga un correo o un número de teléfono).
 * - Configuración (todo en /etc/envivo/config.env, NUNCA en el repositorio, que es público): DISCORD_APP_ID,
 *   DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_ROLES_JSON (opcional), DISCORD_ROL_* (nombres, opcional),
 *   DISCORD_WEBHOOK_ANUNCIOS / _EVENTOS / _ESTADO, DISCORD_INVITACION (opcional), SOPORTE_CORREO (ya existía).
 * - El token del bot, los tokens de los webhooks y los de cada interacción NUNCA se escriben en registros ni en la base:
 *   todo lo que se registra pasa por Discord::ocultar().
 */
final class Discord
{
    public const API = 'https://discord.com/api/v10';
    public const CODIGO_LARGO = 8;
    public const CODIGO_DURA = 600;                                  // 10 minutos
    public const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';       // sin I, L, O, 0, 1 (se confunden al copiar)
    public const EFIMERO = 64;                                      // flag de Discord: solo lo ve quien usó el comando
    public const COLOR = 0xFF3B3B;
    public const TABLAS = ['discord_vinculos', 'discord_codigos', 'discord_ajustes'];
    public const CANALES = ['anuncios' => 'DISCORD_WEBHOOK_ANUNCIOS', 'eventos' => 'DISCORD_WEBHOOK_EVENTOS', 'estado' => 'DISCORD_WEBHOOK_ESTADO'];
    /** Roles fijos que maneja el bot: clave interna => [clave de configuración para cambiar el nombre, nombre por defecto]. */
    public const ROLES = [
        'verificado' => ['DISCORD_ROL_VERIFICADO', 'Jugador verificado'],
        'comprador' => ['DISCORD_ROL_COMPRADOR', 'Comprador verificado'],
        'vip' => ['DISCORD_ROL_VIP', 'VIP'],
        'presidente' => ['DISCORD_ROL_PRESIDENTE', 'Presidente de asociación'],
    ];
    /** Títulos de los capítulos de la historia (js/logic.js, CHAPTERS). */
    public const CAPITULOS = ['El garaje', 'Armando el equipo', 'El gran lanzamiento', 'La rival', 'Al estadio', 'La final'];

    private static bool $listo = false;
    private static ?array $mapaRoles = null;
    /** @var array<string, float> ruta (sin ids) => microtime hasta el que hay que esperar (límite de Discord) */
    private static array $esperar = [];
    private static float $esperarGlobal = 0.0;
    /** @var list<string> */
    private static array $registro = [];

    // ================================================================== base
    /** Crea las tablas del bot si falta alguna (server/src/migraciones/discord.sql; no borra nada). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        $ph = implode(',', array_fill(0, count(self::TABLAS), '?'));
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ($ph)", self::TABLAS);
        if ($n < count(self::TABLAS)) Db::pdo()->exec((string) file_get_contents(__DIR__ . '/migraciones/discord.sql'));
        self::$listo = true;
    }

    /** ¿Está todo lo necesario para el bot? (sin la llave pública ni el token, el bot no funciona) */
    public static function configurado(): bool
    {
        return self::llavePublica() !== '' && self::token() !== '' && self::guild() !== '' && self::appId() !== '';
    }

    public static function appId(): string { $v = Config::get('DISCORD_APP_ID'); return preg_match('/^\d{5,25}$/', $v) ? $v : ''; }
    public static function guild(): string { $v = Config::get('DISCORD_GUILD_ID'); return preg_match('/^\d{5,25}$/', $v) ? $v : ''; }
    private static function token(): string { return trim(Config::get('DISCORD_BOT_TOKEN')); }
    private static function llavePublica(): string { $v = strtolower(trim(Config::get('DISCORD_PUBLIC_KEY'))); return preg_match('/^[0-9a-f]{64}$/', $v) ? $v : ''; }

    /** https://discord.com/api/v10 (en pruebas se cambia con DISCORD_API_BASE). */
    public static function base(): string
    {
        $b = rtrim(Config::get('DISCORD_API_BASE'), '/');
        return $b !== '' && preg_match('#^https?://[A-Za-z0-9.:\[\]-]+(/[A-Za-z0-9._/-]*)?$#', $b) ? $b : self::API;
    }

    // ================================================================== firma (Ed25519)
    /**
     * Revisa la firma que manda Discord (cabeceras X-Signature-Ed25519 y X-Signature-Timestamp) sobre timestamp + cuerpo.
     * También rechaza firmas de más de 5 minutos (para que nadie pueda reenviar una petición vieja).
     */
    public static function verificarFirma(string $firmaHex, string $timestamp, string $cuerpo, ?string $llaveHex = null, ?int $ahora = null): bool
    {
        $llaveHex = $llaveHex ?? self::llavePublica();
        if ($llaveHex === '' || !preg_match('/^[0-9a-fA-F]{128}$/', $firmaHex) || !preg_match('/^\d{1,12}$/', $timestamp)) return false;
        if (abs(($ahora ?? time()) - (int) $timestamp) > 300) return false;
        try {
            $firma = sodium_hex2bin($firmaHex);
            $llave = sodium_hex2bin($llaveHex);
            if (strlen($llave) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) return false;
            return sodium_crypto_sign_verify_detached($firma, $timestamp . $cuerpo, $llave);
        } catch (\Throwable) {
            return false;
        }
    }

    // ================================================================== códigos para vincular
    /** POST /api/discord/codigo (con sesión). Devuelve el código para escribir en Discord. */
    public static function codigoParaJugador(int $jugador): array
    {
        self::preparar();
        Fallo::si(!self::configurado(), 'La conexión con Discord todavía no está disponible.', 503, ['codigo' => 'discord_no_configurado']);
        Cuentas::exigirActiva($jugador);
        if (Limite::contar('discord_codigo:' . $jugador, 5, 10) || Limite::contar('discord_codigoip:' . Http::ip(), 30, 10)) {
            throw new Fallo('Pediste muchos códigos. Espera 10 minutos e intenta otra vez.', 429, ['codigo' => 'demasiados']);
        }
        $codigo = '';
        for ($i = 0; $i < self::CODIGO_LARGO; $i++) $codigo .= self::ALFABETO[random_int(0, strlen(self::ALFABETO) - 1)];
        $t = time();
        Db::tx(function () use ($jugador, $codigo, $t) {
            Db::q('DELETE FROM discord_codigos WHERE jugador_id = ? OR expira < ?', [$jugador, $t - 86400]);   // el código anterior deja de servir
            Db::q('INSERT INTO discord_codigos (codigo_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [self::hashCodigo($codigo), $jugador, $t, $t + self::CODIGO_DURA]);
        });
        return ['ok' => true, 'codigo' => $codigo, 'expira' => Db::iso($t + self::CODIGO_DURA), 'segundos' => self::CODIGO_DURA,
                'comando' => '/vincular codigo:' . $codigo, 'vinculado' => self::vinculo($jugador) !== null, 'invitacion' => self::invitacion()];
    }

    /** Campos para /api/estado: { discord_vinculado, discord_invitacion } */
    public static function estado(?int $jugador): array
    {
        $v = false;
        if ($jugador !== null) {
            try { self::preparar(); $v = self::vinculo($jugador) !== null; } catch (\Throwable) { $v = false; }
        }
        return ['discord_vinculado' => $v, 'discord_invitacion' => self::invitacion()];
    }

    public static function invitacion(): ?string
    {
        $u = trim(Config::get('DISCORD_INVITACION'));
        return preg_match('#^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,40}$#', $u) ? $u : null;
    }

    public static function normalizarCodigo(string $c): string { return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $c) ?? ''); }
    private static function hashCodigo(string $c): string { return hash('sha256', 'envivo-discord|' . self::normalizarCodigo($c)); }

    public static function vinculo(int $jugador): ?array { return Db::fila('SELECT * FROM discord_vinculos WHERE jugador_id = ?', [$jugador]); }
    public static function vinculoDeDiscord(string $uid): ?array { return Db::fila('SELECT * FROM discord_vinculos WHERE discord_user_id = ?', [$uid]); }

    /**
     * Usa el código y une las cuentas. Devuelve ['ok' => true, 'jugador' => id, 'anterior' => discord_user_id|null]
     * o ['ok' => false, 'motivo' => codigo_formato|demasiados|codigo_invalido|ya_vinculado_otro|cuenta_inactiva].
     */
    public static function vincular(string $uid, string $nombre, string $codigo): array
    {
        self::preparar();
        $codigo = self::normalizarCodigo($codigo);
        if (Limite::contar('discord_vincular:' . $uid, 8, 10) || Limite::excedido('discord_vincular_fallos', 300, 10)) return ['ok' => false, 'motivo' => 'demasiados'];
        if (strlen($codigo) !== self::CODIGO_LARGO || strspn($codigo, self::ALFABETO) !== self::CODIGO_LARGO) {
            return ['ok' => false, 'motivo' => 'codigo_formato'];
        }
        $r = Db::tx(function () use ($uid, $nombre, $codigo): array {
            $t = time();
            $c = Db::fila('SELECT * FROM discord_codigos WHERE codigo_hash = ? AND usado IS NULL AND expira > ?', [self::hashCodigo($codigo), $t]);
            if (!$c) return ['ok' => false, 'motivo' => 'codigo_invalido'];
            $j = (int) $c['jugador_id'];
            $otro = self::vinculoDeDiscord($uid);
            if ($otro && (int) $otro['jugador_id'] !== $j) return ['ok' => false, 'motivo' => 'ya_vinculado_otro'];
            if (self::estadoCuenta($j) !== 'activo') return ['ok' => false, 'motivo' => 'cuenta_inactiva'];
            Db::q('UPDATE discord_codigos SET usado = ? WHERE codigo_hash = ? AND usado IS NULL', [$t, $c['codigo_hash']]);
            $antes = self::vinculo($j);
            $anterior = $antes && $antes['discord_user_id'] !== $uid ? (string) $antes['discord_user_id'] : null;
            Db::q('INSERT INTO discord_vinculos (jugador_id, discord_user_id, discord_nombre, roles_json, creado) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (jugador_id) DO UPDATE SET discord_user_id = excluded.discord_user_id, discord_nombre = excluded.discord_nombre,
                   roles_json = CASE WHEN discord_vinculos.discord_user_id = excluded.discord_user_id THEN discord_vinculos.roles_json ELSE ? END,
                   creado = excluded.creado, sincronizado = NULL, sync_error = NULL',
                [$j, $uid, mb_substr($nombre, 0, 40), '[]', $t, '[]']);
            return ['ok' => true, 'jugador' => $j, 'anterior' => $anterior];
        });
        if (!$r['ok'] && $r['motivo'] === 'codigo_invalido') Limite::sumar('discord_vincular_fallos');
        return $r;
    }

    /** Quita el vínculo y los roles del juego. Por el lado de Discord (/desvincular) o del juego. */
    public static function desvincular(?string $uid = null, ?int $jugador = null): array
    {
        self::preparar();
        $v = $uid !== null ? self::vinculoDeDiscord($uid) : ($jugador !== null ? self::vinculo($jugador) : null);
        if (!$v) return ['ok' => false, 'motivo' => 'no_vinculado'];
        Db::q('DELETE FROM discord_vinculos WHERE jugador_id = ?', [$v['jugador_id']]);
        $r = self::ponerRoles((string) $v['discord_user_id'], [], 'Desvinculado de EN VIVO Tycoon');
        return ['ok' => true, 'jugador' => (int) $v['jugador_id'], 'roles' => $r];
    }

    /** POST /api/discord/desvincular (opcional, desde el juego). */
    public static function desvincularJugador(int $jugador): array
    {
        $r = self::desvincular(null, $jugador);
        return ['ok' => true, 'desvinculado' => $r['ok']];
    }

    private static function estadoCuenta(int $jugador): string
    {
        if (!self::columna('jugadores', 'estado')) return 'activo';
        return (string) (Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$jugador]) ?? 'activo');
    }

    private static array $cols = [];
    private static function columna(string $tabla, string $col): bool
    {
        if (!isset(self::$cols[$tabla])) {
            self::$cols[$tabla] = [];
            foreach (Db::todas('PRAGMA table_info(' . preg_replace('/[^a-z_]/', '', $tabla) . ')') as $c) self::$cols[$tabla][$c['name']] = true;
        }
        return isset(self::$cols[$tabla][$col]);
    }

    private static function tabla(string $t): bool { return (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]); }

    // ================================================================== roles
    /** Nombre del rol en Discord para cada rol fijo (se puede cambiar con DISCORD_ROL_*). */
    public static function nombreRol(string $clave): string { return Config::get(self::ROLES[$clave][0], self::ROLES[$clave][1]); }

    /** Todos los roles que el bot maneja (nombres): los fijos + uno por cada servidor del juego. */
    public static function rolesGestionados(): array
    {
        $o = array_map(fn($k) => self::nombreRol($k), array_keys(self::ROLES));
        foreach (Db::todas('SELECT nombre FROM servidores ORDER BY id') as $s) $o[] = (string) $s['nombre'];
        return array_values(array_unique($o));
    }

    /** Datos de todos los vinculados (o de uno) con lo necesario para saber sus roles. */
    private static function datosVinculos(?int $jugador = null): array
    {
        $estado = self::columna('jugadores', 'estado') ? 'j.estado' : "'activo'";
        $sql = "SELECT v.*, $estado AS estado_cuenta, j.vip_hasta, s.nombre AS servidor,
                   EXISTS (SELECT 1 FROM compras c WHERE c.jugador_id = j.id AND c.estado = 'pagado') AS comprador,
                   EXISTS (SELECT 1 FROM asociacion_miembros m WHERE m.jugador_id = j.id AND m.cargo = 'presidente') AS presidente
                FROM discord_vinculos v JOIN jugadores j ON j.id = v.jugador_id LEFT JOIN servidores s ON s.id = j.servidor_id";
        if ($jugador !== null) return Db::todas($sql . ' WHERE v.jugador_id = ?', [$jugador]);
        return Db::todas($sql . ' ORDER BY v.jugador_id');
    }

    /** Roles que le tocan (nombres, ordenados). Cuenta bloqueada: ninguno. */
    public static function rolesDeseados(array $d): array
    {
        if (($d['estado_cuenta'] ?? 'activo') === 'baneado') return [];
        $o = [self::nombreRol('verificado')];
        if ((int) $d['comprador'] === 1) $o[] = self::nombreRol('comprador');
        if ($d['vip_hasta'] !== null && (int) $d['vip_hasta'] > time()) $o[] = self::nombreRol('vip');
        if ((int) $d['presidente'] === 1) $o[] = self::nombreRol('presidente');
        if (($d['servidor'] ?? null) !== null) $o[] = (string) $d['servidor'];
        sort($o);
        return $o;
    }

    /** "Presidente de Asociación" = "presidente de asociacion"; "Servidor 1 · Quito" = "servidor 1 quito". */
    public static function claveRol(string $n): string
    {
        $n = mb_strtolower(trim($n), 'UTF-8');
        $n = strtr($n, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'â' => 'a', 'ê' => 'e', 'ô' => 'o', 'ã' => 'a', 'õ' => 'o', 'ç' => 'c']);
        return trim(preg_replace('/[^a-z0-9]+/', ' ', $n) ?? '');
    }

    /**
     * Mapa claveRol(nombre) => id del rol en Discord. Primero DISCORD_ROLES_JSON ({"Jugador verificado": "123", ...});
     * lo que falte se busca por nombre en el servidor de Discord (GET /guilds/{id}/roles, guardado 1 hora en la base).
     */
    public static function mapaRoles(bool $refrescar = false): array
    {
        if (self::$mapaRoles !== null && !$refrescar) return self::$mapaRoles;
        self::preparar();
        $m = [];
        $cache = Db::fila("SELECT valor, actualizado FROM discord_ajustes WHERE clave = 'roles_guild'");
        if (!$refrescar && $cache && (int) $cache['actualizado'] > time() - 3600) {
            $m = json_decode((string) $cache['valor'], true) ?: [];
        } elseif (self::guild() !== '' && self::token() !== '') {
            $r = self::rest('GET', '/guilds/' . self::guild() . '/roles');
            if ($r['codigo'] === 200 && is_array($r['datos'])) {
                foreach ($r['datos'] as $rol) {
                    if (!is_array($rol) || !isset($rol['id'], $rol['name']) || !empty($rol['managed'])) continue;
                    $k = self::claveRol((string) $rol['name']);
                    if ($k !== '' && !isset($m[$k])) $m[$k] = (string) $rol['id'];
                }
                Db::q("INSERT INTO discord_ajustes (clave, valor, actualizado) VALUES ('roles_guild', ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado",
                    [json_encode($m), time()]);
            } elseif ($cache) {
                $m = json_decode((string) $cache['valor'], true) ?: [];   // Discord no respondió: se usa la lista vieja
            }
        }
        $fijos = json_decode(Config::get('DISCORD_ROLES_JSON', '{}'), true);
        if (is_array($fijos)) foreach ($fijos as $n => $id) if (is_string($n) && preg_match('/^\d{5,25}$/', (string) $id)) $m[self::claveRol($n)] = (string) $id;
        return self::$mapaRoles = $m;
    }

    /**
     * Deja en Discord exactamente $deseados entre los roles que maneja el bot (los demás roles del usuario no se tocan).
     * Devuelve ['ok', 'error' => null|no_en_servidor|sin_permiso|roles_faltantes|discord, 'puestos' => [...], 'quitados' => [...], 'faltan' => [...]]
     */
    public static function ponerRoles(string $uid, array $deseados, string $motivo): array
    {
        $o = ['ok' => false, 'error' => null, 'puestos' => [], 'quitados' => [], 'faltan' => [], 'tiene' => []];
        if (!self::configurado()) { $o['error'] = 'no_configurado'; return $o; }
        $mapa = self::mapaRoles();
        $ids = [];
        $faltan = [];
        foreach (self::rolesGestionados() as $n) {
            $id = $mapa[self::claveRol($n)] ?? null;
            if ($id === null) { if (in_array($n, $deseados, true)) $faltan[] = $n; continue; }
            $ids[$n] = $id;
        }
        if ($faltan && !self::$refrescado) {   // ¿crearon el rol hace poco? se pide la lista otra vez (una vez por proceso)
            self::$refrescado = true;
            $mapa = self::mapaRoles(true);
            $faltan = [];
            foreach (self::rolesGestionados() as $n) {
                $id = $mapa[self::claveRol($n)] ?? null;
                if ($id === null) { if (in_array($n, $deseados, true)) $faltan[] = $n; continue; }
                $ids[$n] = $id;
            }
        }
        $o['faltan'] = $faltan;
        $m = self::rest('GET', '/guilds/' . self::guild() . '/members/' . $uid);
        if ($m['codigo'] === 404) { $o['error'] = 'no_en_servidor'; return $o; }
        if ($m['codigo'] !== 200 || !is_array($m['datos'])) { $o['error'] = $m['codigo'] === 403 ? 'sin_permiso' : 'discord'; return $o; }
        $actuales = array_map('strval', is_array($m['datos']['roles'] ?? null) ? $m['datos']['roles'] : []);
        $razon = ['X-Audit-Log-Reason: ' . rawurlencode($motivo)];
        foreach ($ids as $n => $id) {
            $quiere = in_array($n, $deseados, true);
            $tiene = in_array($id, $actuales, true);
            if ($quiere === $tiene) { if ($tiene) $o['tiene'][] = $n; continue; }
            $r = self::rest($quiere ? 'PUT' : 'DELETE', '/guilds/' . self::guild() . '/members/' . $uid . '/roles/' . $id, null, ['cabeceras' => $razon]);
            if ($r['codigo'] === 204 || $r['codigo'] === 200) {
                $o[$quiere ? 'puestos' : 'quitados'][] = $n;
                if ($quiere) $o['tiene'][] = $n;
            } elseif ($r['codigo'] === 404 && ($r['datos']['code'] ?? 0) === 10007) {
                $o['error'] = 'no_en_servidor'; return $o;
            } elseif ($r['codigo'] === 403) {
                $o['error'] = 'sin_permiso';
            } else {
                $o['error'] = $o['error'] ?? 'discord';
            }
        }
        if ($o['error'] === null && $faltan) $o['error'] = 'roles_faltantes';
        $o['ok'] = $o['error'] === null;
        sort($o['tiene']);
        return $o;
    }
    private static bool $refrescado = false;

    /** Revisa y arregla los roles de un jugador vinculado. Guarda el resultado en discord_vinculos. */
    public static function sincronizar(int $jugador): array
    {
        self::preparar();
        $d = self::datosVinculos($jugador)[0] ?? null;
        if (!$d) return ['ok' => false, 'error' => 'no_vinculado', 'puestos' => [], 'quitados' => [], 'faltan' => [], 'tiene' => []];
        return self::sincronizarFila($d);
    }

    private static function sincronizarFila(array $d): array
    {
        $deseados = self::rolesDeseados($d);
        $r = self::ponerRoles((string) $d['discord_user_id'], $deseados, 'Sincronización con EN VIVO Tycoon');
        $err = $r['error'];
        if ($err === 'roles_faltantes') $err .= ':' . implode(', ', $r['faltan']);
        // roles_json = lo que el bot dejó (o intentó dejar). Si Discord falló de paso, se deja como estaba: se reintenta en la próxima vuelta;
        // con los otros errores (no está en el servidor, sin permiso, faltan roles) se reintenta cada hora.
        Db::q('UPDATE discord_vinculos SET roles_json = ?, sincronizado = ?, sync_error = ? WHERE jugador_id = ? AND discord_user_id = ?',
            [$r['error'] !== 'discord' ? json_encode($deseados, JSON_UNESCAPED_UNICODE) : $d['roles_json'], time(), $err !== null ? mb_substr($err, 0, 300) : null,
             $d['jugador_id'], $d['discord_user_id']]);
        if ($r['error'] === 'sin_permiso' || $r['error'] === 'roles_faltantes') self::avisoUnaVez($r['error'], $r['error'] === 'sin_permiso'
            ? 'Discord: el bot no tiene permiso para poner roles. En Discord: Ajustes del servidor > Roles: el rol del bot debe estar ARRIBA de los roles que reparte y tener "Gestionar roles".'
            : 'Discord: faltan estos roles en el servidor de Discord (créalos con ese nombre exacto o ponlos en DISCORD_ROLES_JSON): ' . implode(', ', $r['faltan']));
        return $r;
    }

    /** Un aviso para el panel como máximo cada 6 horas por tipo. */
    private static function avisoUnaVez(string $tipo, string $texto): void
    {
        $k = 'aviso_' . $tipo;
        $f = Db::fila('SELECT actualizado FROM discord_ajustes WHERE clave = ?', [$k]);
        if ($f && (int) $f['actualizado'] > time() - 6 * 3600) return;
        Db::q('INSERT INTO discord_ajustes (clave, valor, actualizado) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado', [$k, '1', time()]);
        Db::aviso('discord_' . $tipo, self::ocultar($texto));
    }

    /**
     * Tarea de bin/discord_sync.php. Sin $todos revisa: los que tienen roles distintos a los que les tocan ahora (VIP vencido,
     * compra nueva, cambio de asociación o de servidor), los que nunca se revisaron, los que tuvieron un error (cada hora) y
     * los $repaso revisados hace más tiempo (por si alguien quitó un rol a mano). Se detiene a los $segundos.
     */
    public static function sincronizarPendientes(bool $todos = false, int $repaso = 25, int $segundos = 480, ?callable $eco = null): array
    {
        self::preparar();
        $est = ['revisados' => 0, 'cambios' => 0, 'errores' => 0, 'pendientes' => 0, 'puestos' => 0, 'quitados' => 0];
        if (!self::configurado()) { $est['errores'] = -1; return $est; }
        $t0 = time();
        $filas = self::datosVinculos();
        $cola = [];
        $viejos = [];
        foreach ($filas as $d) {
            $deseados = json_encode(self::rolesDeseados($d), JSON_UNESCAPED_UNICODE);
            $previos = json_decode((string) $d['roles_json'], true);
            $previos = is_array($previos) ? $previos : [];
            sort($previos);
            $cambio = json_encode($previos, JSON_UNESCAPED_UNICODE) !== $deseados;
            $conError = $d['sync_error'] !== null && (int) $d['sincronizado'] < time() - 3600;
            if ($todos || $cambio || $d['sincronizado'] === null || $conError) $cola[] = $d;
            elseif ($d['sync_error'] === null) $viejos[] = $d;   // los que tienen un error se reintentan cada hora (arriba), no en el repaso
        }
        usort($viejos, fn($a, $b) => (int) $a['sincronizado'] <=> (int) $b['sincronizado']);
        $cola = array_merge($cola, array_slice($viejos, 0, max(0, $repaso)));
        foreach ($cola as $i => $d) {
            if (time() - $t0 >= $segundos) { $est['pendientes'] = count($cola) - $i; break; }
            $r = self::sincronizarFila($d);
            $est['revisados']++;
            $est['puestos'] += count($r['puestos']);
            $est['quitados'] += count($r['quitados']);
            if ($r['puestos'] || $r['quitados']) $est['cambios']++;
            if ($r['error'] !== null) $est['errores']++;
            if ($eco) $eco('jugador ' . $d['jugador_id'] . ': ' . ($r['puestos'] ? '+' . implode(', +', $r['puestos']) . ' ' : '') . ($r['quitados'] ? '-' . implode(', -', $r['quitados']) . ' ' : '')
                . ($r['error'] !== null ? '(' . $r['error'] . ')' : ($r['puestos'] || $r['quitados'] ? '' : 'sin cambios')));
        }
        return $est;
    }

    // ================================================================== REST de Discord
    /**
     * Llama a la API de Discord con el token del bot. Respeta los límites de Discord: si responde 429 espera lo que pide
     * (retry_after) y reintenta (hasta 4 veces); si avisa que no quedan llamadas (X-RateLimit-Remaining: 0) espera antes
     * de la siguiente a esa misma ruta. $opc: cabeceras (lista), sin_bot (true = sin token: webhooks), max_espera (segundos).
     * Devuelve ['codigo' => http (0 = sin conexión), 'datos' => JSON|null].
     */
    public static function rest(string $metodo, string $ruta, ?array $cuerpo = null, array $opc = []): array
    {
        $url = str_starts_with($ruta, 'http') ? $ruta : self::base() . $ruta;
        $max = (float) ($opc['max_espera'] ?? (PHP_SAPI === 'cli' ? 60 : 10));
        $clave = $metodo . ' ' . preg_replace(['#/webhooks/(\d+)/[^/?]+#', '#\d{5,25}#'], ['/webhooks/$1/T', '{id}'], (string) parse_url($url, PHP_URL_PATH));
        $cab = ['Accept: application/json', 'User-Agent: DiscordBot (https://juego.tukanec.com, 1.0) EnVivoTycoon'];
        if (empty($opc['sin_bot'])) $cab[] = 'Authorization: Bot ' . self::token();
        if ($cuerpo !== null) $cab[] = 'Content-Type: application/json';
        foreach ($opc['cabeceras'] ?? [] as $c) $cab[] = $c;
        $json = $cuerpo !== null ? json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
        for ($intento = 0; $intento < 5; $intento++) {
            $espera = max(self::$esperarGlobal, self::$esperar[$clave] ?? 0.0) - microtime(true);
            if ($espera > 0) {
                if ($espera > $max) return ['codigo' => 429, 'datos' => null];
                usleep((int) ($espera * 1e6));
            }
            [$codigo, $texto, $h] = self::http($metodo, $url, $cab, $json, (int) ($opc['timeout'] ?? 8));
            $datos = $texto !== '' ? json_decode($texto, true) : null;
            if (($h['x-ratelimit-remaining'] ?? null) === '0' && isset($h['x-ratelimit-reset-after'])) {
                self::$esperar[$clave] = microtime(true) + min(60.0, (float) $h['x-ratelimit-reset-after']);
            }
            if ($codigo === 429) {
                $ra = (float) (is_array($datos) && isset($datos['retry_after']) ? $datos['retry_after'] : ($h['retry-after'] ?? 1));
                $ra = max(0.05, $ra);
                $global = (is_array($datos) && !empty($datos['global'])) || ($h['x-ratelimit-global'] ?? '') === 'true';
                self::log('límite de Discord (429' . ($global ? ', global' : '') . ') en ' . $clave . ': espero ' . round($ra, 2) . ' s');
                if ($ra > $max) return ['codigo' => 429, 'datos' => is_array($datos) ? $datos : null];
                if ($global) self::$esperarGlobal = microtime(true) + $ra; else self::$esperar[$clave] = microtime(true) + $ra;
                continue;
            }
            if ($codigo >= 500 || $codigo === 0) {
                if ($intento < 1) { usleep(800000); continue; }
                self::log('Discord no respondió bien (' . $codigo . ') en ' . $clave);
            } elseif ($codigo >= 400 && $codigo !== 404) {
                self::log('Discord respondió ' . $codigo . ' en ' . $clave . (is_array($datos) && isset($datos['message']) ? ': ' . mb_substr((string) $datos['message'], 0, 200) : ''));
            }
            return ['codigo' => $codigo, 'datos' => is_array($datos) ? $datos : null];
        }
        return ['codigo' => 429, 'datos' => null];
    }

    /** @return array{int, string, array<string,string>} */
    private static function http(string $metodo, string $url, array $cab, ?string $json, int $timeout): array
    {
        $h = [];
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $cab,
            CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => max(2, $timeout), CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$h) {
                $p = explode(':', $l, 2);
                if (count($p) === 2) $h[strtolower(trim($p[0]))] = trim($p[1]);
                return strlen($l);
            },
        ]);
        if ($json !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        elseif (in_array($metodo, ['PUT', 'POST', 'PATCH'], true)) { curl_setopt($ch, CURLOPT_POSTFIELDS, ''); }
        $texto = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($texto === false) { self::log('sin conexión con Discord: ' . curl_error($ch)); $texto = ''; $codigo = 0; }
        curl_close($ch);
        return [$codigo, (string) $texto, $h];
    }

    /** Quita de un texto todo lo secreto: token del bot, tokens de webhooks (de la configuración y de interacciones). */
    public static function ocultar(string $t): string
    {
        foreach (['DISCORD_BOT_TOKEN', 'DISCORD_WEBHOOK_ANUNCIOS', 'DISCORD_WEBHOOK_EVENTOS', 'DISCORD_WEBHOOK_ESTADO'] as $k) {
            $v = trim(Config::get($k));
            if (strlen($v) >= 8) $t = str_replace($v, '[oculto]', $t);
        }
        $t = preg_replace('#/webhooks/(\d+)/[A-Za-z0-9._-]+#', '/webhooks/$1/[oculto]', $t) ?? '';
        $t = preg_replace('/\b(Bot|Bearer)\s+[A-Za-z0-9._-]{20,}/', '$1 [oculto]', $t) ?? '';
        return preg_replace('/\b[A-Za-z0-9_-]{20,30}\.[A-Za-z0-9_-]{5,10}\.[A-Za-z0-9_-]{25,}\b/', '[oculto]', $t) ?? '';   // forma de token de bot
    }

    private static function log(string $t): void
    {
        $t = self::ocultar($t);
        self::$registro[] = $t;
        error_log('EN VIVO discord: ' . $t);
    }

    /** Lo registrado en esta petición (ya sin secretos). Para las pruebas y los scripts. */
    public static function registro(): array { return self::$registro; }

    // ================================================================== anuncios (webhooks)
    /**
     * Publica en el canal ('anuncios', 'eventos' o 'estado') con su webhook de la configuración.
     * $mensaje: texto, o ['content' => ..., 'embeds' => [...]] (máx. 10 embeds). Nunca menciona a nadie (@everyone tampoco).
     * Rechaza textos con correos o números de teléfono (nunca se publican compras ni datos personales).
     */
    public static function anunciar(string $canal, string|array $mensaje): bool
    {
        $k = self::CANALES[$canal] ?? null;
        if ($k === null) return false;
        $url = trim(Config::get($k));
        $base = preg_quote(self::base(), '#');
        if (!preg_match('#^(https://(discord\.com|discordapp\.com|canary\.discord\.com|ptb\.discord\.com)/api(/v\d+)?|' . $base . ')/webhooks/\d{5,25}/[A-Za-z0-9._-]{20,200}$#', $url)) return false;
        $m = is_string($mensaje) ? ['content' => $mensaje] : $mensaje;
        $cuerpo = [];
        if (isset($m['content'])) $cuerpo['content'] = mb_substr((string) $m['content'], 0, 2000);
        if (isset($m['embeds']) && is_array($m['embeds'])) $cuerpo['embeds'] = array_slice(array_values($m['embeds']), 0, 10);
        if (isset($m['username'])) $cuerpo['username'] = mb_substr((string) $m['username'], 0, 80);
        if (!$cuerpo) return false;
        $plano = json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (preg_match('/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/', $plano) || preg_match('/(?<![\d<:])\+?\d[\d \-]{8,}\d(?![\d>])/', (string) preg_replace('/<t:\d+(:[a-zA-Z])?>/', '', $plano))) {
            self::log('anuncio rechazado en "' . $canal . '": parece tener un correo o un teléfono');
            return false;
        }
        $cuerpo['allowed_mentions'] = ['parse' => []];
        $r = self::rest('POST', $url . '?wait=true', $cuerpo, ['sin_bot' => true, 'max_espera' => 10]);
        return $r['codigo'] >= 200 && $r['codigo'] < 300;
    }

    /** Un embed sencillo con el color del juego. */
    public static function embed(string $titulo, string $texto = '', array $campos = [], ?int $color = null): array
    {
        $e = ['title' => mb_substr($titulo, 0, 256), 'color' => $color ?? self::COLOR];
        if ($texto !== '') $e['description'] = mb_substr($texto, 0, 4000);
        if ($campos) $e['fields'] = array_slice(array_map(fn($n, $v) => ['name' => mb_substr((string) $n, 0, 256), 'value' => mb_substr((string) $v, 0, 1024), 'inline' => true], array_keys($campos), $campos), 0, 25);
        return $e;
    }

    /** Atajos para el servidor del juego. */
    public static function anunciarEvento(string $nombre, int $inicio, ?int $fin = null, string $detalle = ''): bool
    {
        return self::anunciar('eventos', ['embeds' => [self::embed('🎬 ' . $nombre, trim($detalle . "\n\nEmpieza <t:$inicio:R> (<t:$inicio:f>)" . ($fin ? " · termina <t:$fin:R>" : '')))]]);
    }

    public static function anunciarMantenimiento(string $mensaje, ?int $hasta = null): bool
    {
        return self::anunciar('estado', ['embeds' => [self::embed('🛠️ Mantenimiento', $mensaje . ($hasta ? "\n\nVolvemos <t:$hasta:R>." : ''), [], 0xF5A623)]]);
    }

    // ================================================================== interacciones (comandos)
    /**
     * Atiende una interacción ya verificada. Devuelve ['respuesta' => JSON para Discord, 'despues' => callable|null]:
     * 'despues' se corre DESPUÉS de responder (los roles tardan; Discord exige respuesta en menos de 3 segundos).
     */
    public static function manejar(array $i): array
    {
        $tipo = (int) ($i['type'] ?? 0);
        if ($tipo === 1) return ['respuesta' => ['type' => 1], 'despues' => null];
        $L = self::idioma($i);
        if ($tipo === 4) return ['respuesta' => ['type' => 8, 'data' => ['choices' => []]], 'despues' => null];
        if ($tipo !== 2) return self::solo(self::mensaje(self::t($L, 'desconocido'), true));
        $g = (string) ($i['guild_id'] ?? '');
        if ($g === '' || $g !== self::guild()) return self::solo(self::mensaje(self::t($L, 'otro_servidor'), true));
        if (!self::configurado()) return self::solo(self::mensaje(self::t($L, 'no_configurado'), true));
        $u = is_array($i['member']['user'] ?? null) ? $i['member']['user'] : (is_array($i['user'] ?? null) ? $i['user'] : []);
        $uid = (string) ($u['id'] ?? '');
        if (!preg_match('/^\d{5,25}$/', $uid)) return self::solo(self::mensaje(self::t($L, 'desconocido'), true));
        $data = is_array($i['data'] ?? null) ? $i['data'] : [];
        $op = [];
        foreach (is_array($data['options'] ?? null) ? $data['options'] : [] as $o) if (isset($o['name'])) $op[(string) $o['name']] = $o['value'] ?? null;
        try {
            self::preparar();
            return match ((string) ($data['name'] ?? '')) {
                'vincular' => self::cmdVincular($i, $L, $uid, (string) ($u['username'] ?? ''), is_scalar($op['codigo'] ?? null) ? (string) $op['codigo'] : ''),
                'desvincular' => self::cmdDesvincular($i, $L, $uid),
                'perfil' => self::solo(self::cmdPerfil($L, $uid, isset($op['usuario']) && is_string($op['usuario']) ? $op['usuario'] : null, $data)),
                'ranking' => self::solo(self::cmdRanking($L, $uid, is_int($op['servidor'] ?? null) ? $op['servidor'] : null)),
                'eventos' => self::solo(self::cmdEventos($L)),
                'ayuda' => self::solo(self::cmdAyuda($L)),
                default => self::solo(self::mensaje(self::t($L, 'desconocido'), true)),
            };
        } catch (\Throwable $e) {
            self::log('error en el comando ' . ((string) ($data['name'] ?? '?')) . ': ' . get_class($e) . ' en ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 200));
            return self::solo(self::mensaje(self::t($L, 'error'), true));
        }
    }

    private static function solo(array $r): array { return ['respuesta' => $r, 'despues' => null]; }

    /** Respuesta de mensaje (tipo 4). $m: texto o ['content', 'embeds']. Nunca menciona a nadie. */
    public static function mensaje(string|array $m, bool $efimero = false): array
    {
        $d = is_string($m) ? ['content' => $m] : $m;
        $d['allowed_mentions'] = ['parse' => []];
        if ($efimero) $d['flags'] = self::EFIMERO;
        return ['type' => 4, 'data' => $d];
    }

    /** Cambia el mensaje "pensando..." por el resultado (PATCH al webhook de la interacción; vale 15 minutos). */
    public static function editarRespuesta(array $i, string|array $m): bool
    {
        $app = preg_match('/^\d{5,25}$/', (string) ($i['application_id'] ?? '')) ? (string) $i['application_id'] : self::appId();
        $tok = (string) ($i['token'] ?? '');
        if ($app === '' || !preg_match('/^[A-Za-z0-9._-]{20,500}$/', $tok)) return false;
        $d = is_string($m) ? ['content' => $m] : $m;
        $d['allowed_mentions'] = ['parse' => []];
        $r = self::rest('PATCH', '/webhooks/' . $app . '/' . $tok . '/messages/@original', $d, ['sin_bot' => true, 'max_espera' => 20]);
        return $r['codigo'] === 200;
    }

    private static function cmdVincular(array $i, string $L, string $uid, string $nombre, string $codigo): array
    {
        $r = self::vincular($uid, $nombre, $codigo);
        if (!$r['ok']) return self::solo(self::mensaje(self::t($L, $r['motivo']), true));
        $j = (int) $r['jugador'];
        $anterior = $r['anterior'];
        return ['respuesta' => ['type' => 5, 'data' => ['flags' => self::EFIMERO]], 'despues' => function () use ($i, $L, $j, $anterior) {
            if ($anterior !== null) self::ponerRoles($anterior, [], 'La productora se vinculó con otra cuenta de Discord');
            $s = self::sincronizar($j);
            $p = self::perfilDatos($j);
            $vars = ['alias' => self::md($p['nombre']), 'servidor' => self::md($p['servidor'] ?? '-')];
            if ($s['error'] === null) $txt = self::t($L, 'vinculado_ok', $vars + ['roles' => $s['tiene'] ? implode(', ', array_map(fn($x) => '`' . $x . '`', $s['tiene'])) : '-']);
            else $txt = self::t($L, 'vinculado_pendiente', $vars + ['motivo' => self::t($L, 'motivo_' . explode(':', (string) $s['error'])[0])]);
            self::editarRespuesta($i, $txt);
        }];
    }

    private static function cmdDesvincular(array $i, string $L, string $uid): array
    {
        $v = self::vinculoDeDiscord($uid);
        if (!$v) return self::solo(self::mensaje(self::t($L, 'no_vinculado'), true));
        return ['respuesta' => ['type' => 5, 'data' => ['flags' => self::EFIMERO]], 'despues' => function () use ($i, $L, $uid) {
            $r = self::desvincular($uid);
            $ok = $r['ok'] && in_array($r['roles']['error'] ?? null, [null, 'no_en_servidor', 'roles_faltantes'], true);
            self::editarRespuesta($i, self::t($L, $ok ? 'desvinculado_ok' : 'desvinculado_sin_roles'));
        }];
    }

    /** Datos públicos de la productora (nunca correo ni compras). */
    public static function perfilDatos(int $j): array
    {
        $f = Db::fila('SELECT j.id, j.alias, j.nombre, j.fama_publica, s.nombre AS servidor, s.id AS servidor_id FROM jugadores j LEFT JOIN servidores s ON s.id = j.servidor_id WHERE j.id = ?', [$j]) ?? [];
        $a = Db::fila('SELECT a.nombre, a.siglas, m.cargo FROM asociacion_miembros m JOIN asociaciones a ON a.id = m.asociacion_id WHERE m.jugador_id = ?', [$j]);
        $cap = null;
        $datos = Db::valor('SELECT datos FROM partidas WHERE jugador_id = ?', [$j]);
        if (is_string($datos) && $datos !== '') {
            $s = json_decode($datos, true);
            if (is_array($s)) {
                if (!empty($s['storyDone'])) $cap = ['fin' => true, 'n' => count(self::CAPITULOS), 'titulo' => self::CAPITULOS[count(self::CAPITULOS) - 1]];
                elseif (isset($s['chapter']) && is_int($s['chapter']) && $s['chapter'] >= 0 && $s['chapter'] < count(self::CAPITULOS)) $cap = ['fin' => false, 'n' => $s['chapter'] + 1, 'titulo' => self::CAPITULOS[$s['chapter']]];
            }
        }
        return ['nombre' => Social::nombrePublico($f['alias'] ?? null, $f['nombre'] ?? null), 'fama' => (int) ($f['fama_publica'] ?? 0),
                'servidor' => $f['servidor'] ?? null, 'servidor_id' => isset($f['servidor_id']) ? (int) $f['servidor_id'] : null,
                'asociacion' => $a ? ['nombre' => $a['nombre'], 'siglas' => $a['siglas'], 'cargo' => $a['cargo']] : null, 'capitulo' => $cap];
    }

    private static function cmdPerfil(string $L, string $uid, ?string $otro, array $data): array
    {
        $quien = $otro !== null && preg_match('/^\d{5,25}$/', $otro) ? $otro : $uid;
        $v = self::vinculoDeDiscord($quien);
        if (!$v) {
            if ($quien === $uid) return self::mensaje(self::t($L, 'no_vinculado'), true);
            $n = (string) ($data['resolved']['members'][$quien]['nick'] ?? $data['resolved']['users'][$quien]['global_name'] ?? $data['resolved']['users'][$quien]['username'] ?? '');
            return self::mensaje(self::t($L, 'perfil_otro_no', ['usuario' => $n !== '' ? self::md($n) : self::t($L, 'ese_usuario')]), true);
        }
        $p = self::perfilDatos((int) $v['jugador_id']);
        $a = $p['asociacion'];
        $cap = $p['capitulo'] === null ? '-' : ($p['capitulo']['fin'] ? self::t($L, 'historia_fin') : self::t($L, 'capitulo', ['n' => $p['capitulo']['n'], 't' => $p['capitulo']['titulo']]));
        $campos = [
            self::t($L, 'servidor') => self::md($p['servidor'] ?? '-'),
            self::t($L, 'fama') => '⭐ ' . $p['fama'],
            self::t($L, 'asociacion') => $a ? self::md($a['nombre']) . ' [' . self::md($a['siglas']) . '] · ' . self::t($L, 'cargo_' . $a['cargo']) : self::t($L, 'sin_asociacion'),
            self::t($L, 'historia') => $cap,
        ];
        return self::mensaje(['embeds' => [self::embed('🎥 ' . $p['nombre'], '', $campos)]]);
    }

    private static function cmdRanking(string $L, string $uid, ?int $servidor): array
    {
        if ($servidor === null) {
            $v = self::vinculoDeDiscord($uid);
            $servidor = $v ? (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$v['jugador_id']]) : (int) (Db::valor('SELECT MIN(id) FROM servidores') ?? 1);
        }
        $s = Db::fila('SELECT id, nombre FROM servidores WHERE id = ?', [$servidor]);
        if (!$s) return self::mensaje(self::t($L, 'servidor_no_existe'), true);
        $noBan = self::columna('jugadores', 'estado') ? "AND j.estado <> 'baneado'" : '';
        $top = Db::todas("SELECT j.alias, j.nombre, j.fama_publica FROM jugadores j WHERE j.servidor_id = ? $noBan ORDER BY j.fama_publica DESC, j.id LIMIT 10", [$s['id']]);
        if (!$top) return self::mensaje(['embeds' => [self::embed('🏆 ' . self::t($L, 'ranking_de', ['servidor' => $s['nombre']]), self::t($L, 'ranking_vacio'))]]);
        $medalla = fn(int $n) => ['🥇', '🥈', '🥉'][$n] ?? '`' . ($n + 1) . '.`';
        $lineas = [];
        foreach ($top as $n => $j) $lineas[] = $medalla($n) . ' **' . self::md(Social::nombrePublico($j['alias'], $j['nombre'])) . '** · ⭐ ' . (int) $j['fama_publica'];
        $txt = '**' . self::t($L, 'top_productoras') . "**\n" . implode("\n", $lineas);
        $asoc = Db::todas("SELECT a.nombre, a.siglas, COUNT(m.jugador_id) AS n, COALESCE(SUM(j.fama_publica), 0) AS fama FROM asociaciones a
                           JOIN asociacion_miembros m ON m.asociacion_id = a.id JOIN jugadores j ON j.id = m.jugador_id
                           WHERE a.servidor_id = ? GROUP BY a.id ORDER BY fama DESC, n DESC, a.id LIMIT 5", [$s['id']]);
        if ($asoc) {
            $l = [];
            foreach ($asoc as $n => $a) $l[] = $medalla($n) . ' **' . self::md($a['nombre']) . '** [' . self::md($a['siglas']) . '] · ⭐ ' . (int) $a['fama'] . ' · ' . self::t($L, 'miembros', ['n' => (int) $a['n']]);
            $txt .= "\n\n**" . self::t($L, 'top_asociaciones') . "**\n" . implode("\n", $l);
        }
        return self::mensaje(['embeds' => [self::embed('🏆 ' . self::t($L, 'ranking_de', ['servidor' => $s['nombre']]), $txt)]]);
    }

    /**
     * Eventos en línea actuales y próximos. Si existe una tabla de eventos (eventos_en_linea / eventos_online / eventos con
     * nombre|titulo, inicio y fin en segundos Unix) se usa; si no, un horario fijo con la cuenta regresiva del día.
     */
    public static function eventosProximos(int $max = 6): array
    {
        foreach (['eventos_en_linea', 'eventos_online', 'eventos'] as $t) {
            if (!self::tabla($t) || !self::columna($t, 'inicio') || !self::columna($t, 'fin')) continue;
            $n = self::columna($t, 'nombre') ? 'nombre' : (self::columna($t, 'titulo') ? 'titulo' : null);
            if ($n === null) continue;
            $extra = self::columna($t, 'activo') ? ' AND activo = 1' : '';
            return array_map(fn($e) => ['nombre' => (string) $e['n'], 'inicio' => (int) $e['inicio'], 'fin' => (int) $e['fin']],
                Db::todas("SELECT $n AS n, inicio, fin FROM $t WHERE fin > ?$extra ORDER BY inicio LIMIT " . max(1, min(20, $max)), [time()]));
        }
        return [];
    }

    private static function cmdEventos(string $L): array
    {
        $ev = self::eventosProximos();
        $ahora = time();
        if ($ev) {
            $l = [];
            foreach ($ev as $e) {
                $l[] = $e['inicio'] <= $ahora
                    ? '🔴 **' . self::md($e['nombre']) . '** · ' . self::t($L, 'en_curso', ['fin' => '<t:' . $e['fin'] . ':R>'])
                    : '🗓️ **' . self::md($e['nombre']) . '** · ' . self::t($L, 'empieza', ['inicio' => '<t:' . $e['inicio'] . ':R>', 'fecha' => '<t:' . $e['inicio'] . ':f>']);
            }
            return self::mensaje(['embeds' => [self::embed('🎬 ' . self::t($L, 'eventos_titulo'), implode("\n", $l))]]);
        }
        $manana = (new \DateTimeImmutable('tomorrow', new \DateTimeZone(Config::zona())))->getTimestamp();
        return self::mensaje(['embeds' => [self::embed('🎬 ' . self::t($L, 'eventos_titulo'), self::t($L, 'eventos_fijo', ['reinicio' => "<t:$manana:R>", 'hora' => "<t:$manana:t>"]))]]);
    }

    private static function cmdAyuda(string $L): array
    {
        $correo = trim(Config::get('SOPORTE_CORREO'));
        $correo = filter_var($correo, FILTER_VALIDATE_EMAIL) ? $correo : '';
        $txt = self::t($L, 'ayuda') . ($correo !== '' ? "\n" . self::t($L, 'ayuda_correo', ['correo' => $correo]) : '') . "\n\n" . self::t($L, 'ayuda_aviso');
        return self::mensaje(['embeds' => [self::embed('🆘 ' . self::t($L, 'ayuda_titulo'), $txt)]], true);
    }

    /** Evita que un nombre rompa el formato de Discord (negritas, enlaces...). */
    public static function md(string $t): string { return preg_replace('/([\\\\*_~`|>\[\]()#@<:])/', '\\\\$1', $t) ?? ''; }

    // ================================================================== idiomas
    /** es* -> es, pt* -> pt, en* (y cualquier otro) -> en. Sin idioma: español. */
    public static function idioma(array $i): string
    {
        $l = strtolower((string) ($i['locale'] ?? $i['guild_locale'] ?? 'es'));
        if (str_starts_with($l, 'es')) return 'es';
        if (str_starts_with($l, 'pt')) return 'pt';
        return 'en';
    }

    public static function t(string $L, string $k, array $v = []): string
    {
        $t = self::TEXTOS[$L][$k] ?? self::TEXTOS['en'][$k] ?? self::TEXTOS['es'][$k] ?? $k;
        foreach ($v as $a => $b) $t = str_replace('{' . $a . '}', (string) $b, $t);
        return $t;
    }

    public const TEXTOS = [
        'es' => [
            'desconocido' => 'No conozco ese comando. Usa `/ayuda`.',
            'otro_servidor' => 'Este bot solo funciona en el servidor oficial de EN VIVO Tycoon.',
            'no_configurado' => 'El bot todavía no está listo. Avísale al staff.',
            'error' => 'Algo falló de nuestro lado. Intenta otra vez en un momento.',
            'codigo_formato' => '❌ El código tiene 8 letras y números, por ejemplo `K7M2QX9P`. En el juego, en **Cuenta**, toca **Vincular Discord** para ver el tuyo.',
            'codigo_invalido' => '❌ Ese código no es válido o ya venció. En el juego, en **Cuenta**, toca **Vincular Discord** y pide uno nuevo (dura 10 minutos).',
            'demasiados' => '⏳ Demasiados intentos. Espera 10 minutos y vuelve a probar.',
            'ya_vinculado_otro' => 'Esta cuenta de Discord ya está vinculada con otra productora. Usa `/desvincular` primero.',
            'cuenta_inactiva' => 'Esa cuenta del juego no está activa. Escríbenos desde **Ayuda y soporte** en el juego.',
            'vinculado_ok' => "✅ ¡Listo! Tu Discord quedó vinculado con la productora **{alias}** ({servidor}).\nTus roles: {roles}",
            'vinculado_pendiente' => "✅ Tu Discord quedó vinculado con la productora **{alias}** ({servidor}), pero todavía no pude ponerte los roles: {motivo}.\nLo intentaré otra vez solo en unos minutos.",
            'motivo_no_en_servidor' => 'primero únete al servidor oficial de Discord',
            'motivo_sin_permiso' => 'el bot no tiene permiso para dar roles (ya avisamos al staff)',
            'motivo_roles_faltantes' => 'faltan roles en el servidor (ya avisamos al staff)',
            'motivo_discord' => 'Discord no respondió',
            'motivo_no_configurado' => 'el bot no está listo',
            'motivo_no_vinculado' => 'el vínculo ya no existe',
            'no_vinculado' => 'Tu Discord no está vinculado con ninguna productora. En el juego, en **Cuenta**, toca **Vincular Discord** para obtener un código y luego usa `/vincular`.',
            'desvinculado_ok' => 'Listo: tu Discord ya no está vinculado con tu productora y te quité los roles del juego.',
            'desvinculado_sin_roles' => 'Listo: tu Discord ya no está vinculado. No pude quitarte algunos roles; el staff puede quitarlos a mano.',
            'perfil_otro_no' => '{usuario} todavía no vinculó su productora.',
            'ese_usuario' => 'Ese usuario',
            'servidor' => 'Servidor', 'fama' => 'Fama', 'asociacion' => 'Asociación', 'historia' => 'Historia',
            'sin_asociacion' => 'Sin asociación',
            'cargo_presidente' => 'Presidente', 'cargo_vicepresidente' => 'Vicepresidente', 'cargo_socio' => 'Socio',
            'capitulo' => 'Capítulo {n} · {t}', 'historia_fin' => 'Historia completada 🏆',
            'ranking_de' => 'Ranking de {servidor}', 'ranking_vacio' => 'Todavía no hay productoras en este servidor.',
            'top_productoras' => 'Productoras con más fama', 'top_asociaciones' => 'Asociaciones con más fama', 'miembros' => '{n} miembros',
            'servidor_no_existe' => 'Ese servidor del juego no existe.',
            'eventos_titulo' => 'Eventos en línea',
            'en_curso' => 'en curso, termina {fin}', 'empieza' => 'empieza {inicio} ({fecha})',
            'eventos_fijo' => "🔁 **Bono VIP diario y recompensas del día:** se renuevan {reinicio} ({hora}, hora de Ecuador).\n🏆 **Liga Semanal, Desafío Técnico del Día y Copas internacionales:** próximamente. Las fechas se anuncian en el canal de eventos.",
            'ayuda_titulo' => '¿Necesitas ayuda?',
            'ayuda' => "• **En el juego:** abre el menú **Ayuda y soporte** y cuéntanos qué pasó (te respondemos ahí mismo; si es de un pago, elige la compra).\n• Para dudas del juego también puedes preguntar a la comunidad en los canales de ayuda.",
            'ayuda_correo' => '• **Correo:** {correo}',
            'ayuda_aviso' => '⚠️ El staff **nunca** te pedirá tu contraseña, los datos de tu tarjeta ni tu código de vinculación, ni por mensaje privado. No los compartas con nadie.',
        ],
        'en' => [
            'desconocido' => "I don't know that command. Use `/help`.",
            'otro_servidor' => 'This bot only works on the official EN VIVO Tycoon server.',
            'no_configurado' => 'The bot is not ready yet. Please tell the staff.',
            'error' => 'Something went wrong on our side. Please try again in a moment.',
            'codigo_formato' => '❌ The code has 8 letters and numbers, for example `K7M2QX9P`. In the game, go to **Account** and tap **Link Discord** to see yours.',
            'codigo_invalido' => '❌ That code is not valid or has expired. In the game, go to **Account**, tap **Link Discord** and get a new one (it lasts 10 minutes).',
            'demasiados' => '⏳ Too many attempts. Wait 10 minutes and try again.',
            'ya_vinculado_otro' => 'This Discord account is already linked to another production company. Use `/unlink` first.',
            'cuenta_inactiva' => 'That game account is not active. Contact us from **Help & support** in the game.',
            'vinculado_ok' => "✅ Done! Your Discord is now linked to the production company **{alias}** ({servidor}).\nYour roles: {roles}",
            'vinculado_pendiente' => "✅ Your Discord is now linked to **{alias}** ({servidor}), but I couldn't give you the roles yet: {motivo}.\nI'll try again automatically in a few minutes.",
            'motivo_no_en_servidor' => 'join the official Discord server first',
            'motivo_sin_permiso' => "the bot isn't allowed to give roles (the staff has been notified)",
            'motivo_roles_faltantes' => 'some roles are missing on the server (the staff has been notified)',
            'motivo_discord' => "Discord didn't respond",
            'motivo_no_configurado' => 'the bot is not ready',
            'motivo_no_vinculado' => 'the link no longer exists',
            'no_vinculado' => 'Your Discord is not linked to any production company. In the game, go to **Account**, tap **Link Discord** to get a code and then use `/link`.',
            'desvinculado_ok' => 'Done: your Discord is no longer linked and the game roles were removed.',
            'desvinculado_sin_roles' => "Done: your Discord is no longer linked. I couldn't remove some roles; the staff can remove them manually.",
            'perfil_otro_no' => "{usuario} hasn't linked a production company yet.",
            'ese_usuario' => 'That user',
            'servidor' => 'Server', 'fama' => 'Fame', 'asociacion' => 'Alliance', 'historia' => 'Story',
            'sin_asociacion' => 'No alliance',
            'cargo_presidente' => 'President', 'cargo_vicepresidente' => 'Vice president', 'cargo_socio' => 'Member',
            'capitulo' => 'Chapter {n} · {t}', 'historia_fin' => 'Story completed 🏆',
            'ranking_de' => '{servidor} ranking', 'ranking_vacio' => 'There are no production companies on this server yet.',
            'top_productoras' => 'Most famous production companies', 'top_asociaciones' => 'Most famous alliances', 'miembros' => '{n} members',
            'servidor_no_existe' => "That game server doesn't exist.",
            'eventos_titulo' => 'Online events',
            'en_curso' => 'live now, ends {fin}', 'empieza' => 'starts {inicio} ({fecha})',
            'eventos_fijo' => "🔁 **Daily VIP bonus and daily rewards:** reset {reinicio} ({hora}).\n🏆 **Weekly League, Daily Tech Challenge and International Cups:** coming soon. Dates are announced in the events channel.",
            'ayuda_titulo' => 'Need help?',
            'ayuda' => "• **In the game:** open **Help & support** and tell us what happened (we answer right there; for a payment, pick the purchase).\n• For game questions you can also ask the community in the help channels.",
            'ayuda_correo' => '• **Email:** {correo}',
            'ayuda_aviso' => '⚠️ The staff will **never** ask for your password, your card details or your link code, not even by DM. Never share them.',
        ],
        'pt' => [
            'desconocido' => 'Não conheço esse comando. Use `/ajuda`.',
            'otro_servidor' => 'Este bot só funciona no servidor oficial do EN VIVO Tycoon.',
            'no_configurado' => 'O bot ainda não está pronto. Avise a equipe.',
            'error' => 'Algo deu errado do nosso lado. Tente de novo em um momento.',
            'codigo_formato' => '❌ O código tem 8 letras e números, por exemplo `K7M2QX9P`. No jogo, em **Conta**, toque em **Vincular Discord** para ver o seu.',
            'codigo_invalido' => '❌ Esse código não é válido ou expirou. No jogo, em **Conta**, toque em **Vincular Discord** e peça um novo (dura 10 minutos).',
            'demasiados' => '⏳ Tentativas demais. Espere 10 minutos e tente de novo.',
            'ya_vinculado_otro' => 'Esta conta do Discord já está vinculada a outra produtora. Use `/desvincular` primeiro.',
            'cuenta_inactiva' => 'Essa conta do jogo não está ativa. Fale conosco em **Ajuda e suporte** no jogo.',
            'vinculado_ok' => "✅ Pronto! Seu Discord foi vinculado à produtora **{alias}** ({servidor}).\nSeus cargos: {roles}",
            'vinculado_pendiente' => "✅ Seu Discord foi vinculado à produtora **{alias}** ({servidor}), mas ainda não consegui dar os cargos: {motivo}.\nVou tentar de novo sozinho em alguns minutos.",
            'motivo_no_en_servidor' => 'entre primeiro no servidor oficial do Discord',
            'motivo_sin_permiso' => 'o bot não tem permissão para dar cargos (a equipe já foi avisada)',
            'motivo_roles_faltantes' => 'faltam cargos no servidor (a equipe já foi avisada)',
            'motivo_discord' => 'o Discord não respondeu',
            'motivo_no_configurado' => 'o bot não está pronto',
            'motivo_no_vinculado' => 'o vínculo não existe mais',
            'no_vinculado' => 'Seu Discord não está vinculado a nenhuma produtora. No jogo, em **Conta**, toque em **Vincular Discord** para obter um código e depois use `/vincular`.',
            'desvinculado_ok' => 'Pronto: seu Discord não está mais vinculado e os cargos do jogo foram removidos.',
            'desvinculado_sin_roles' => 'Pronto: seu Discord não está mais vinculado. Não consegui remover alguns cargos; a equipe pode removê-los manualmente.',
            'perfil_otro_no' => '{usuario} ainda não vinculou uma produtora.',
            'ese_usuario' => 'Esse usuário',
            'servidor' => 'Servidor', 'fama' => 'Fama', 'asociacion' => 'Associação', 'historia' => 'História',
            'sin_asociacion' => 'Sem associação',
            'cargo_presidente' => 'Presidente', 'cargo_vicepresidente' => 'Vice-presidente', 'cargo_socio' => 'Sócio',
            'capitulo' => 'Capítulo {n} · {t}', 'historia_fin' => 'História concluída 🏆',
            'ranking_de' => 'Ranking do {servidor}', 'ranking_vacio' => 'Ainda não há produtoras neste servidor.',
            'top_productoras' => 'Produtoras com mais fama', 'top_asociaciones' => 'Associações com mais fama', 'miembros' => '{n} membros',
            'servidor_no_existe' => 'Esse servidor do jogo não existe.',
            'eventos_titulo' => 'Eventos online',
            'en_curso' => 'acontecendo agora, termina {fin}', 'empieza' => 'começa {inicio} ({fecha})',
            'eventos_fijo' => "🔁 **Bônus VIP diário e recompensas do dia:** renovam {reinicio} ({hora}).\n🏆 **Liga Semanal, Desafio Técnico do Dia e Copas internacionais:** em breve. As datas são anunciadas no canal de eventos.",
            'ayuda_titulo' => 'Precisa de ajuda?',
            'ayuda' => "• **No jogo:** abra **Ajuda e suporte** e conte o que aconteceu (respondemos ali mesmo; se for um pagamento, escolha a compra).\n• Para dúvidas do jogo você também pode perguntar à comunidade nos canais de ajuda.",
            'ayuda_correo' => '• **E-mail:** {correo}',
            'ayuda_aviso' => '⚠️ A equipe **nunca** vai pedir sua senha, os dados do seu cartão ou seu código de vinculação, nem por mensagem privada. Não compartilhe com ninguém.',
        ],
    ];

    // ================================================================== comandos (registro)
    /** Definición de los comandos globales con nombres y descripciones en es-ES, es-419, en-US, en-GB y pt-BR. */
    public static function comandos(): array
    {
        $loc = fn(string $es, string $en, string $pt) => ['es-ES' => $es, 'es-419' => $es, 'en-US' => $en, 'en-GB' => $en, 'pt-BR' => $pt];
        $c = fn(string $nombre, array $n, array $d, array $opciones = []) => array_filter([
            'name' => $nombre, 'name_localizations' => $loc(...$n), 'description' => $d[0], 'description_localizations' => $loc(...$d),
            'type' => 1, 'contexts' => [0], 'integration_types' => [0], 'options' => $opciones ?: null,
        ], fn($x) => $x !== null);
        return [
            $c('vincular', ['vincular', 'link', 'vincular'], ['Vincula tu productora del juego con tu Discord', 'Link your game production company to your Discord', 'Vincule sua produtora do jogo ao seu Discord'], [[
                'type' => 3, 'name' => 'codigo', 'name_localizations' => $loc('codigo', 'code', 'codigo'), 'required' => true, 'min_length' => 8, 'max_length' => 12,
                'description' => 'El código de 8 caracteres que te da el juego (Cuenta > Vincular Discord)',
                'description_localizations' => $loc('El código de 8 caracteres que te da el juego (Cuenta > Vincular Discord)', 'The 8-character code from the game (Account > Link Discord)', 'O código de 8 caracteres do jogo (Conta > Vincular Discord)'),
            ]]),
            $c('desvincular', ['desvincular', 'unlink', 'desvincular'], ['Quita el vínculo con tu productora y los roles del juego', 'Unlink your production company and remove the game roles', 'Remove o vínculo com sua produtora e os cargos do jogo']),
            $c('perfil', ['perfil', 'profile', 'perfil'], ['Muestra el perfil público de una productora', 'Show the public profile of a production company', 'Mostra o perfil público de uma produtora'], [[
                'type' => 6, 'name' => 'usuario', 'name_localizations' => $loc('usuario', 'user', 'usuario'), 'required' => false,
                'description' => 'De quién (si no eliges, el tuyo)', 'description_localizations' => $loc('De quién (si no eliges, el tuyo)', 'Whose (yours if empty)', 'De quem (se vazio, o seu)'),
            ]]),
            $c('ranking', ['ranking', 'ranking', 'ranking'], ['Las productoras y asociaciones con más fama de tu servidor', 'Most famous production companies and alliances on your server', 'Produtoras e associações com mais fama do seu servidor'], [[
                'type' => 4, 'name' => 'servidor', 'name_localizations' => $loc('servidor', 'server', 'servidor'), 'required' => false, 'min_value' => 1,
                'description' => 'Número del servidor del juego (si no eliges, el tuyo)', 'description_localizations' => $loc('Número del servidor del juego (si no eliges, el tuyo)', 'Game server number (yours if empty)', 'Número do servidor do jogo (se vazio, o seu)'),
            ]]),
            $c('eventos', ['eventos', 'events', 'eventos'], ['Eventos en línea de ahora y los próximos', 'Current and upcoming online events', 'Eventos online de agora e os próximos']),
            $c('ayuda', ['ayuda', 'help', 'ajuda'], ['Cómo pedir ayuda y soporte', 'How to get help and support', 'Como pedir ajuda e suporte']),
        ];
    }

    /** PUT /applications/{id}/commands (o /guilds/{id}/commands con $enGuild: se ven al instante, para probar). */
    public static function registrarComandos(bool $enGuild = false): array
    {
        $ruta = '/applications/' . self::appId() . ($enGuild ? '/guilds/' . self::guild() : '') . '/commands';
        return self::rest('PUT', $ruta, self::comandos());
    }
}
