<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Servidores (reinos), perfil público de la productora y asociaciones (ver server/SOCIAL.md).
 * - Al registrarse, el jugador entra al servidor del universo más nuevo con menos jugadores activos (Universos::asignar,
 *   COPAS.md §1); si no queda cupo en ningún servidor se abre un universo nuevo.
 * - Alias: nombre público de la productora, único por servidor, 3 a 24 caracteres, pasa por el filtro.
 * - Fama pública: la manda el juego; puede subir como máximo FAMA_TOPE_DIA puntos por día (contra trampas).
 * - Asociaciones: máximo 20 miembros, un jugador en una sola. Crear: gratis con VIP activo o $5.000 del juego
 *   (los descuenta el juego y manda pagado_en_juego: true).
 */
final class Social
{
    public const MAX_MIEMBROS = 20;
    public const COSTO_CREAR = 5000;
    public const FAMA_TOPE_DIA = 15;
    public const CIUDADES = ['Quito', 'Guayaquil', 'Cuenca', 'Manta', 'Loja', 'Ambato', 'Ibarra', 'Riobamba', 'Machala', 'Esmeraldas', 'Portoviejo', 'Latacunga'];

    // ------------------------------------------------------------------ servidores
    /**
     * Servidor de un jugador que se registra: reparto parejo dentro del universo más nuevo con cupo (Universos::asignar,
     * COPAS.md §1): el servidor abierto con menos jugadores activos en 7 días, empate -> menos jugadores en total. Los llenos
     * se cierran a nuevos; si no queda cupo en ninguno, se abre un universo nuevo con UNIVERSO_SERVIDORES_INICIALES servidores.
     */
    public static function servidorParaNuevo(): int
    {
        return Universos::asignar();
    }

    public static function servidorDe(int $jugador): ?array
    {
        $s = Db::fila('SELECT s.id, s.nombre FROM servidores s JOIN jugadores j ON j.servidor_id = s.id WHERE j.id = ?', [$jugador]);
        return $s ? ['id' => (int) $s['id'], 'nombre' => $s['nombre']] : null;
    }

    private static function servidorId(int $jugador): int { return (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$jugador]); }

    // ------------------------------------------------------------------ perfil público
    /** Nombre que ven los demás: el alias o, si no tiene, "Nombre I." (nunca el correo). */
    public static function nombrePublico(?string $alias, ?string $nombre): string
    {
        return $alias !== null && $alias !== '' ? $alias : Mercado::nombreCorto($nombre);
    }

    public static function perfil(int $jugador): array
    {
        $j = Db::fila('SELECT alias, nombre, fama_publica FROM jugadores WHERE id = ?', [$jugador]);
        $s = Chat::sancion($jugador);
        return ['alias' => $j['alias'] ?? null, 'nombre_publico' => self::nombrePublico($j['alias'] ?? null, $j['nombre'] ?? null),
                'fama' => (int) ($j['fama_publica'] ?? 0), 'chat_sancion' => $s];
    }

    /** Clave para comparar nombres sin importar mayúsculas ni tildes ("Ñandú" = "ñandu"). */
    public static function clave(string $t): string { return Filtro::limpiarPalabra(Filtro::normalizar($t)) ?: mb_strtolower($t, 'UTF-8'); }

    public static function limpiarTexto(mixed $v): string
    {
        $t = is_string($v) ? $v : '';
        $t = preg_replace('/[\x00-\x1F\x7F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{206F}\x{FEFF}]/u', '', $t) ?? '';
        return trim(preg_replace('/\s+/u', ' ', $t) ?? '');
    }

    /** POST /api/perfil {alias?, fama?} */
    public static function guardarPerfil(int $jugador, array $in): array
    {
        Cuentas::exigirActiva($jugador);   // auditoría A-08: una cuenta suspendida no cambia su perfil ni asociaciones
        return Db::tx(function () use ($jugador, $in): array {
            $j = Db::fila('SELECT * FROM jugadores WHERE id = ?', [$jugador]);
            $aceptada = null;
            if (array_key_exists('alias', $in)) {
                $a = self::limpiarTexto($in['alias']);
                Fallo::si(mb_strlen($a) < 3 || mb_strlen($a) > 24, 'El nombre de tu productora debe tener de 3 a 24 caracteres.', 400, ['codigo' => 'alias']);
                Fallo::si(!preg_match("/^[\\p{L}\\p{N}][\\p{L}\\p{N} .&'\\-]*$/u", $a), 'El nombre solo puede tener letras, números, espacios y . & \' -', 400, ['codigo' => 'alias']);
                Filtro::revisar($a, 'El nombre');
                $otro = Db::valor('SELECT id FROM jugadores WHERE servidor_id = ? AND alias_clave = ? AND id <> ?', [$j['servidor_id'], self::clave($a), $jugador]);
                Fallo::si((bool) $otro, 'Ya hay una productora con ese nombre en tu servidor. Elige otro.', 409, ['codigo' => 'alias_ocupado']);
                Db::q('UPDATE jugadores SET alias = ?, alias_clave = ? WHERE id = ?', [$a, self::clave($a), $jugador]);
            }
            if (array_key_exists('fama', $in)) {
                $f = $in['fama'];
                Fallo::si(!is_int($f) && !(is_float($f) && is_finite($f)), 'La fama debe ser un número.', 400);
                $f = max(0, min(100, (int) floor((float) $f)));
                $hoy = Monedero::diaLocal();
                $base = $j['fama_dia'] === $hoy ? (int) $j['fama_inicio_dia'] : (int) $j['fama_publica'];
                $aceptada = min($f, $base + self::FAMA_TOPE_DIA);
                Db::q('UPDATE jugadores SET fama_publica = ?, fama_dia = ?, fama_inicio_dia = ? WHERE id = ?', [$aceptada, $hoy, $base, $jugador]);
            }
            return ['ok' => true, 'perfil' => self::perfil($jugador), 'fama_aceptada' => $aceptada];
        });
    }

    // ------------------------------------------------------------------ asociaciones
    public static function miembro(int $jugador): ?array
    {
        return Db::fila('SELECT am.*, a.servidor_id FROM asociacion_miembros am JOIN asociaciones a ON a.id = am.asociacion_id WHERE am.jugador_id = ?', [$jugador]);
    }

    public static function asociacionDe(int $jugador): ?array
    {
        $f = Db::fila('SELECT a.*, am.cargo FROM asociacion_miembros am JOIN asociaciones a ON a.id = am.asociacion_id WHERE am.jugador_id = ?', [$jugador]);
        return $f ? ['id' => (int) $f['id'], 'nombre' => $f['nombre'], 'siglas' => $f['siglas'], 'color' => $f['color'], 'cargo' => $f['cargo']] : null;
    }

    private static function asocJson(array $a, bool $detalle = false, ?int $jugador = null): array
    {
        $o = ['id' => (int) $a['id'], 'nombre' => $a['nombre'], 'siglas' => $a['siglas'], 'color' => $a['color'],
              'logo' => $a['logo_json'] !== null ? json_decode((string) $a['logo_json'], true) : null, 'descripcion' => $a['descripcion'],
              'ingreso' => $a['ingreso'], 'miembros' => (int) ($a['n'] ?? Db::valor('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$a['id']])),
              'max_miembros' => self::MAX_MIEMBROS, 'fama' => (int) ($a['fama'] ?? 0), 'creado' => Db::iso((int) $a['creado'])];
        if ($jugador !== null) $o['solicitud_enviada'] = (bool) Db::valor('SELECT 1 FROM asociacion_solicitudes WHERE asociacion_id = ? AND jugador_id = ?', [$a['id'], $jugador]);
        if (!$detalle) return $o;
        $o['lista'] = array_map(fn($m) => ['jugador_id' => (int) $m['jugador_id'], 'nombre' => self::nombrePublico($m['alias'], $m['nombre']), 'cargo' => $m['cargo'],
            'desde' => Db::iso((int) $m['desde']), 'fama' => (int) $m['fama_publica'], 'vip' => $m['vip_hasta'] !== null && (int) $m['vip_hasta'] > time()],
            Db::todas("SELECT am.*, j.alias, j.nombre, j.fama_publica, j.vip_hasta FROM asociacion_miembros am JOIN jugadores j ON j.id = am.jugador_id
                       WHERE am.asociacion_id = ? ORDER BY CASE am.cargo WHEN 'presidente' THEN 0 WHEN 'vicepresidente' THEN 1 ELSE 2 END, am.desde, am.jugador_id", [$a['id']]));
        return $o;
    }

    /** GET /api/asociaciones?buscar= */
    public static function listar(int $jugador, string $buscar): array
    {
        $sid = self::servidorId($jugador);
        $buscar = mb_substr(self::limpiarTexto($buscar), 0, 30);
        $sql = 'SELECT a.*, (SELECT COUNT(*) FROM asociacion_miembros m WHERE m.asociacion_id = a.id) AS n,
                       (SELECT COALESCE(SUM(j.fama_publica), 0) FROM asociacion_miembros m JOIN jugadores j ON j.id = m.jugador_id WHERE m.asociacion_id = a.id) AS fama
                FROM asociaciones a WHERE a.servidor_id = ?';
        $p = [$sid];
        if ($buscar !== '') { $sql .= " AND (a.nombre LIKE ? ESCAPE '\\' OR a.siglas LIKE ? ESCAPE '\\')"; $l = '%' . addcslashes($buscar, '%_\\') . '%'; $p[] = $l; $p[] = $l; }
        $sql .= ' ORDER BY fama DESC, n DESC, a.id LIMIT 50';
        $mia = self::miembro($jugador);
        $o = ['ok' => true, 'asociaciones' => array_map(fn($a) => self::asocJson($a, false, $jugador), Db::todas($sql, $p)), 'mi_asociacion' => null, 'solicitudes' => [],
              'puede_crear' => self::puedeCrear($jugador), 'costo_crear' => self::COSTO_CREAR];
        if ($mia) {
            $o['mi_asociacion'] = self::asocJson(Db::fila('SELECT * FROM asociaciones WHERE id = ?', [$mia['asociacion_id']]), true) + ['mi_cargo' => $mia['cargo']];
            if ($mia['cargo'] !== 'socio') {
                $o['solicitudes'] = array_map(fn($s) => ['jugador_id' => (int) $s['jugador_id'], 'nombre' => self::nombrePublico($s['alias'], $s['nombre']), 'fama' => (int) $s['fama_publica'], 'creado' => Db::iso((int) $s['creado'])],
                    Db::todas('SELECT s.*, j.alias, j.nombre, j.fama_publica FROM asociacion_solicitudes s JOIN jugadores j ON j.id = s.jugador_id WHERE s.asociacion_id = ? ORDER BY s.creado', [$mia['asociacion_id']]));
            }
        }
        return $o;
    }

    private static function puedeCrear(int $jugador): array
    {
        if (self::miembro($jugador)) return ['puede' => false, 'gratis' => false, 'motivo' => 'Ya estás en una asociación. Sal de ella para crear otra.'];
        $vip = Monedero::vipActivo($jugador);
        return ['puede' => true, 'gratis' => $vip, 'motivo' => $vip ? 'Gratis con tu Pase VIP.' : 'Cuesta $' . number_format(self::COSTO_CREAR, 0, ',', '.') . ' del juego.'];
    }

    /** POST /api/asociaciones/crear */
    public static function crear(int $jugador, array $in): array
    {
        Cuentas::exigirActiva($jugador);   // auditoría A-08: una cuenta suspendida no cambia su perfil ni asociaciones
        $nombre = self::limpiarTexto($in['nombre'] ?? '');
        $siglas = strtoupper(self::limpiarTexto($in['siglas'] ?? ''));
        $color = strtolower(self::limpiarTexto($in['color'] ?? '#ff3b3b'));
        $desc = self::limpiarTexto($in['descripcion'] ?? '');
        $ingreso = ($in['ingreso'] ?? 'abierto') === 'solicitud' ? 'solicitud' : 'abierto';
        Fallo::si(mb_strlen($nombre) < 3 || mb_strlen($nombre) > 30, 'El nombre de la asociación debe tener de 3 a 30 caracteres.', 400, ['codigo' => 'nombre']);
        Fallo::si(!preg_match("/^[\\p{L}\\p{N}][\\p{L}\\p{N} .&'\\-]*$/u", $nombre), 'El nombre solo puede tener letras, números, espacios y . & \' -', 400, ['codigo' => 'nombre']);
        Fallo::si(!preg_match('/^[A-Z0-9]{3}$/', $siglas), 'Las siglas son 3 letras o números (ej. QFP).', 400, ['codigo' => 'siglas']);
        Fallo::si(!preg_match('/^#[0-9a-f]{6}$/', $color), 'El color debe ser como #ff3b3b.', 400, ['codigo' => 'color']);
        Fallo::si(mb_strlen($desc) > 200, 'La descripción tiene máximo 200 caracteres.', 400, ['codigo' => 'descripcion']);
        Filtro::revisar($nombre, 'El nombre');
        Filtro::revisar($siglas, 'Las siglas');
        if ($desc !== '') Filtro::revisar($desc, 'La descripción');
        $logo = null;
        if (isset($in['logo']) && $in['logo'] !== null) {
            $logo = json_encode($in['logo'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            Fallo::si(!is_array($in['logo']) || strlen((string) $logo) > 2000, 'El logo no es válido (máximo 2 KB).', 400, ['codigo' => 'logo']);
        }
        return Db::tx(function () use ($jugador, $nombre, $siglas, $color, $desc, $ingreso, $logo, $in): array {
            Fallo::si((bool) self::miembro($jugador), 'Ya estás en una asociación. Sal de ella para crear otra.', 409, ['codigo' => 'ya_miembro']);
            $vip = Monedero::vipActivo($jugador);
            Fallo::si(!$vip && ($in['pagado_en_juego'] ?? false) !== true, 'Crear una asociación cuesta $' . number_format(self::COSTO_CREAR, 0, ',', '.') . ' del juego (gratis con el Pase VIP).', 402, ['codigo' => 'sin_pago', 'costo' => self::COSTO_CREAR]);
            $sid = self::servidorId($jugador);
            Fallo::si((bool) Db::valor('SELECT 1 FROM asociaciones WHERE servidor_id = ? AND nombre_clave = ?', [$sid, self::clave($nombre)]), 'Ya existe una asociación con ese nombre en tu servidor.', 409, ['codigo' => 'nombre_ocupado']);
            Fallo::si((bool) Db::valor('SELECT 1 FROM asociaciones WHERE servidor_id = ? AND siglas = ?', [$sid, $siglas]), 'Esas siglas ya las usa otra asociación de tu servidor.', 409, ['codigo' => 'siglas_ocupadas']);
            $t = time();
            Db::q('INSERT INTO asociaciones (servidor_id, nombre, nombre_clave, siglas, color, logo_json, descripcion, ingreso, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [$sid, $nombre, self::clave($nombre), $siglas, $color, $logo, $desc, $ingreso, $t]);
            $id = Db::ultimoId();
            Db::q("INSERT INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, 'presidente', ?)", [$id, $jugador, $t]);
            Db::q('DELETE FROM asociacion_solicitudes WHERE jugador_id = ?', [$jugador]);
            return ['ok' => true, 'asociacion' => self::asociacionDe($jugador), 'cobrar_en_juego' => $vip ? 0 : self::COSTO_CREAR];
        });
    }

    /** POST /api/asociaciones/unirse {id} -> estado 'miembro' o 'solicitud' */
    public static function unirse(int $jugador, int $id): array
    {
        Cuentas::exigirActiva($jugador);   // auditoría A-08: una cuenta suspendida no cambia su perfil ni asociaciones
        return Db::tx(function () use ($jugador, $id): array {
            $a = Db::fila('SELECT * FROM asociaciones WHERE id = ?', [$id]);
            Fallo::si(!$a || (int) $a['servidor_id'] !== self::servidorId($jugador), 'Esa asociación no existe en tu servidor.', 404);
            Fallo::si((bool) self::miembro($jugador), 'Ya estás en una asociación. Sal de ella primero.', 409, ['codigo' => 'ya_miembro']);
            $n = (int) Db::valor('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$id]);
            Fallo::si($n >= self::MAX_MIEMBROS, 'Esa asociación está llena (' . self::MAX_MIEMBROS . ' miembros).', 409, ['codigo' => 'llena']);
            if ($a['ingreso'] === 'solicitud') {
                Db::q('INSERT OR IGNORE INTO asociacion_solicitudes (asociacion_id, jugador_id, creado) VALUES (?, ?, ?)', [$id, $jugador, time()]);
                return ['ok' => true, 'estado' => 'solicitud'];
            }
            Db::q("INSERT INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, 'socio', ?)", [$id, $jugador, time()]);
            Db::q('DELETE FROM asociacion_solicitudes WHERE jugador_id = ?', [$jugador]);
            return ['ok' => true, 'estado' => 'miembro', 'asociacion' => self::asociacionDe($jugador)];
        });
    }

    /** Quita a un miembro; si era el presidente, pasa al vicepresidente más antiguo o al socio más antiguo. Si queda vacía, se borra. */
    private static function quitar(int $jugador, int $asoc, string $cargo): void
    {
        Db::q('DELETE FROM asociacion_miembros WHERE jugador_id = ?', [$jugador]);
        if ($cargo === 'presidente') {
            $sig = Db::fila("SELECT jugador_id FROM asociacion_miembros WHERE asociacion_id = ? ORDER BY CASE cargo WHEN 'vicepresidente' THEN 0 ELSE 1 END, desde, jugador_id LIMIT 1", [$asoc]);
            if ($sig) Db::q("UPDATE asociacion_miembros SET cargo = 'presidente' WHERE jugador_id = ?", [$sig['jugador_id']]);
        }
        if ((int) Db::valor('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$asoc]) === 0) Db::q('DELETE FROM asociaciones WHERE id = ?', [$asoc]);
    }

    public static function salir(int $jugador): array
    {
        return Db::tx(function () use ($jugador): array {
            $m = self::miembro($jugador);
            Fallo::si(!$m, 'No estás en ninguna asociación.', 409);
            self::quitar($jugador, (int) $m['asociacion_id'], $m['cargo']);
            return ['ok' => true];
        });
    }

    /** Presidente: nombra vicepresidente / socio, o pasa la presidencia (él queda de vicepresidente). */
    public static function cargo(int $jugador, int $otro, string $cargo): array
    {
        Cuentas::exigirActiva($jugador);   // auditoría A-08: una cuenta suspendida no cambia su perfil ni asociaciones
        return Db::tx(function () use ($jugador, $otro, $cargo): array {
            $yo = self::miembro($jugador);
            Fallo::si(!$yo || $yo['cargo'] !== 'presidente', 'Solo el presidente puede cambiar cargos.', 403);
            Fallo::si($otro === $jugador, 'No puedes cambiar tu propio cargo.', 400);
            $el = self::miembro($otro);
            Fallo::si(!$el || (int) $el['asociacion_id'] !== (int) $yo['asociacion_id'], 'Esa persona no está en tu asociación.', 404);
            Fallo::si(!in_array($cargo, ['presidente', 'vicepresidente', 'socio'], true), 'Cargo no válido.', 400);
            Db::q('UPDATE asociacion_miembros SET cargo = ? WHERE jugador_id = ?', [$cargo, $otro]);
            if ($cargo === 'presidente') Db::q("UPDATE asociacion_miembros SET cargo = 'vicepresidente' WHERE jugador_id = ?", [$jugador]);
            return ['ok' => true];
        });
    }

    /** Presidente expulsa a cualquiera; vicepresidente solo a socios. */
    public static function expulsar(int $jugador, int $otro): array
    {
        Cuentas::exigirActiva($jugador);   // auditoría A-08: una cuenta suspendida no cambia su perfil ni asociaciones
        return Db::tx(function () use ($jugador, $otro): array {
            $yo = self::miembro($jugador);
            Fallo::si(!$yo || $yo['cargo'] === 'socio', 'Solo el presidente o un vicepresidente pueden expulsar.', 403);
            Fallo::si($otro === $jugador, 'Para irte usa "Salir de la asociación".', 400);
            $el = self::miembro($otro);
            Fallo::si(!$el || (int) $el['asociacion_id'] !== (int) $yo['asociacion_id'], 'Esa persona no está en tu asociación.', 404);
            Fallo::si($yo['cargo'] === 'vicepresidente' && $el['cargo'] !== 'socio', 'Un vicepresidente solo puede expulsar a socios.', 403);
            self::quitar($otro, (int) $el['asociacion_id'], $el['cargo']);
            Chat::sistema($otro, 'Te sacaron de la asociación.');
            return ['ok' => true];
        });
    }

    /** Presidente o vice: aceptar o rechazar una solicitud de ingreso. */
    public static function solicitud(int $jugador, int $otro, bool $aceptar): array
    {
        Cuentas::exigirActiva($jugador);   // auditoría A-08: una cuenta suspendida no cambia su perfil ni asociaciones
        return Db::tx(function () use ($jugador, $otro, $aceptar): array {
            $yo = self::miembro($jugador);
            Fallo::si(!$yo || $yo['cargo'] === 'socio', 'Solo el presidente o un vicepresidente pueden responder solicitudes.', 403);
            $asoc = (int) $yo['asociacion_id'];
            Fallo::si(!Db::valor('SELECT 1 FROM asociacion_solicitudes WHERE asociacion_id = ? AND jugador_id = ?', [$asoc, $otro]), 'Esa solicitud ya no existe.', 404);
            Db::q('DELETE FROM asociacion_solicitudes WHERE asociacion_id = ? AND jugador_id = ?', [$asoc, $otro]);
            if (!$aceptar) return ['ok' => true, 'estado' => 'rechazada'];
            Fallo::si((bool) self::miembro($otro), 'Esa persona ya entró a otra asociación.', 409, ['codigo' => 'ya_miembro']);
            Fallo::si((int) Db::valor('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$asoc]) >= self::MAX_MIEMBROS, 'Tu asociación está llena (' . self::MAX_MIEMBROS . ' miembros).', 409, ['codigo' => 'llena']);
            Db::q("INSERT INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, 'socio', ?)", [$asoc, $otro, time()]);
            Db::q('DELETE FROM asociacion_solicitudes WHERE jugador_id = ?', [$otro]);
            Chat::sistema($otro, 'Te aceptaron en la asociación.');
            return ['ok' => true, 'estado' => 'aceptada'];
        });
    }

    /** Coalición activa ahora de la asociación del jugador (o null). */
    public static function coalicionActiva(int $jugador, ?int $id = null): ?array
    {
        $m = self::miembro($jugador);
        if (!$m) return null;
        $t = time();
        $sql = 'SELECT c.* FROM coaliciones c JOIN coalicion_miembros cm ON cm.coalicion_id = c.id WHERE cm.asociacion_id = ? AND c.inicio <= ? AND c.fin > ?';
        $p = [$m['asociacion_id'], $t, $t];
        if ($id !== null) { $sql .= ' AND c.id = ?'; $p[] = $id; }
        return Db::fila($sql . ' ORDER BY c.id DESC LIMIT 1', $p);
    }
}
