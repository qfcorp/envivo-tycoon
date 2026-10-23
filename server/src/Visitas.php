<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Visitas a otras productoras (como las visitas de amigos de Pocket City). Ver server/INTEGRAR_VISITAS.md.
 *
 * - Vitrina pública de cada jugador: se arma con la partida en la nube (tabla partidas) + datos del servidor
 *   (alias, asociación, Sede oficial, premios de Copa y de Duelos, personal estrella). SOLO lo público: nunca correo,
 *   nombre de la cuenta, compras, créditos, dinero del juego ni nada de pagos. Se guarda armada en visitas_vitrinas
 *   y se rehace si la partida cambió (partidas.actualizado) o pasaron CACHE_SEG segundos.
 * - Privacidad: cada jugador decide si lo pueden visitar (visitas_ajustes, por defecto sí). Uno mismo siempre se ve.
 * - Aplauso 👏: uno por visitante, por productora y por día (hora de Ecuador). Premio chico a los dos lados ($50 del
 *   juego como entrega "dinero", la recoge el juego en /api/estado), con tope diario por jugador (PREMIOS_DIA al dar y
 *   PREMIOS_DIA al recibir). Pasado el tope el aplauso cuenta igual, pero sin premio.
 */
final class Visitas
{
    public const DINERO_APLAUSO = 50;      // $ del juego para cada lado
    public const PREMIOS_DIA = 10;         // premios por día al dar y (aparte) al recibir
    public const CACHE_SEG = 300;          // la vitrina armada vale 5 min (o hasta que cambie la partida)
    public const SUGERIDAS = 12;
    public const ETAPAS = [0, 15, 23, 31]; // personas + equipos propios para garaje / oficina / estudio / centro (js/logic.js BALANCE.daily.rent)
    public const ESPECIALES_HQ = ['unidad_movil', 'dron4k', 'vip_satelital', 'generador', 'grua'];   // los que dibuja Art.hq
    public const TABLAS = ['visitas_ajustes', 'visitas_vitrinas', 'visitas_aplausos'];

    private static ?int $reloj = null;
    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }
    public static function dia(?int $t = null): string
    {
        return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(new \DateTimeZone(Config::zona()))->format('Y-m-d');
    }

    // ------------------------------------------------------------------ privacidad
    public static function permite(int $jugador): bool
    {
        $v = Db::valor('SELECT permitir FROM visitas_ajustes WHERE jugador_id = ?', [$jugador]);
        return $v === null || (int) $v === 1;
    }

    /** GET /api/visitas/ajustes */
    public static function ajustes(int $jugador): array
    {
        return ['ok' => true, 'permitir' => self::permite($jugador), 'aplausos' => self::conteo($jugador, null)];
    }

    /** POST /api/visitas/ajustes {permitir: true|false} */
    public static function guardarAjustes(int $jugador, mixed $permitir): array
    {
        $k = 'permitir';
        Fallo::si(!is_bool($permitir) && $permitir !== 0 && $permitir !== 1, 'Falta "' . $k . '" (sí o no).', 400, ['codigo' => 'falta_' . $k]);   // prefijo falta_<campo>
        $p = $permitir === true || $permitir === 1 ? 1 : 0;
        Db::q('INSERT INTO visitas_ajustes (jugador_id, permitir, actualizado) VALUES (?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET permitir = excluded.permitir, actualizado = excluded.actualizado',
            [$jugador, $p, self::ahora()]);
        return self::ajustes($jugador);
    }

    // ------------------------------------------------------------------ vitrina
    /** El jugador que se quiere visitar, o Fallo 404 si no existe / está borrado o bloqueado. */
    private static function visitable(int $id): array
    {
        $j = $id > 0 ? Cuentas::porId($id) : null;
        $estado = $j ? (string) ($j['estado'] ?? 'activo') : '';
        Fallo::si(!$j || $estado === 'borrado' || $estado === 'baneado', 'Esa productora no existe.', 404, ['codigo' => 'productora_no_existe']);
        return $j;
    }

    /** GET /api/visitas/vitrina?jugador_id= → la vitrina + aplausos (y si ya aplaudiste hoy). */
    public static function ver(int $visitante, int $visitado): array
    {
        self::visitable($visitado);
        $propio = $visitante === $visitado;
        Fallo::si(!$propio && !self::permite($visitado), 'Esta productora no recibe visitas por ahora.', 403, ['codigo' => 'visitas_cerradas']);
        $ap = self::conteo($visitado, $propio ? null : $visitante);
        return ['ok' => true, 'propio' => $propio, 'vitrina' => self::vitrina($visitado), 'aplausos' => $ap,
                'puede_aplaudir' => !$propio && !$ap['ya_hoy'], 'premio' => ['dinero' => self::DINERO_APLAUSO, 'tope_dia' => self::PREMIOS_DIA]];
    }

    /** La vitrina pública (de cache si sirve). */
    public static function vitrina(int $jugador): array
    {
        $p = Db::fila('SELECT datos, actualizado FROM partidas WHERE jugador_id = ?', [$jugador]);
        $act = $p ? (int) $p['actualizado'] : 0;
        $c = Db::fila('SELECT partida_act, datos, creado FROM visitas_vitrinas WHERE jugador_id = ?', [$jugador]);
        if ($c && (int) $c['partida_act'] === $act && (int) $c['creado'] > self::ahora() - self::CACHE_SEG && (int) $c['creado'] <= self::ahora()) {
            $v = json_decode((string) $c['datos'], true);
            if (is_array($v)) return $v + ['cache' => true];
        }
        $v = self::armar($jugador, $p ? (string) $p['datos'] : null);
        Db::q('INSERT INTO visitas_vitrinas (jugador_id, partida_act, datos, creado) VALUES (?, ?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET partida_act = excluded.partida_act, datos = excluded.datos, creado = excluded.creado',
            [$jugador, $act, json_encode($v, JSON_UNESCAPED_UNICODE), self::ahora()]);
        return $v + ['cache' => false];
    }

    /** Opcional (INTEGRAR_VISITAS.md §5): después de guardar la partida en la nube, invalida la vitrina armada. Nunca lanza error. */
    public static function alSubirPartida(int $jugador): void
    {
        try { Db::q('DELETE FROM visitas_vitrinas WHERE jugador_id = ?', [$jugador]); } catch (\Throwable) { /* nada */ }
    }

    private static function tabla(string $t): bool
    {
        return (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]);
    }

    /** Arma la vitrina: lo público de la cuenta + lo público de la partida. */
    public static function armar(int $jugador, ?string $partidaJson): array
    {
        $j = Cuentas::porId($jugador) ?? [];
        $s = null;
        if ($partidaJson !== null && $partidaJson !== '') { $s = json_decode($partidaJson, true); if (!is_array($s)) $s = null; }
        $v = ['jugador_id' => $jugador, 'alias' => Social::nombrePublico($j['alias'] ?? null, $j['nombre'] ?? null),
              'fama_publica' => (int) ($j['fama_publica'] ?? 0), 'sin_partida' => $s === null] + self::desdePartida($s ?? []);
        $a = Db::fila('SELECT a.nombre, a.siglas, a.color FROM asociacion_miembros am JOIN asociaciones a ON a.id = am.asociacion_id WHERE am.jugador_id = ?', [$jugador]);
        $v['asociacion'] = $a ? ['nombre' => (string) $a['nombre'], 'siglas' => (string) $a['siglas'], 'color' => preg_match('/^#[0-9a-f]{6}$/i', (string) $a['color']) ? (string) $a['color'] : null] : null;
        $v['sede_nivel'] = self::tabla('sede_oficial') ? (int) (Db::valor('SELECT nivel FROM sede_oficial WHERE jugador_id = ?', [$jugador]) ?? 1) : null;
        $tro = [];
        if (self::tabla('copa_premios') && self::tabla('copas')) {
            foreach (Db::todas("SELECT cp.clave, c.nombre, c.semana FROM copa_premios cp JOIN copas c ON c.id = cp.copa_id
                                WHERE cp.jugador_id = ? AND cp.clave IN ('campeon', 'subcampeon', 'top10') ORDER BY c.inicio DESC, cp.clave LIMIT 12", [$jugador]) as $r)
                $tro[] = ['tipo' => 'copa', 'clave' => (string) $r['clave'], 'nombre' => (string) $r['nombre'], 'semana' => (string) $r['semana']];
        }
        if (self::tabla('duelo_premios')) {
            foreach (Db::todas('SELECT temporada, puesto FROM duelo_premios WHERE jugador_id = ? AND puesto BETWEEN 1 AND 10 ORDER BY temporada DESC LIMIT 6', [$jugador]) as $r)
                $tro[] = ['tipo' => 'duelo', 'puesto' => (int) $r['puesto'], 'temporada' => (string) $r['temporada']];
        }
        foreach ($v['trofeos_temporada'] as $t) $tro[] = ['tipo' => 'temporada', 'key' => $t['key'], 'anio' => $t['anio']];
        if ($v['historia_completa']) $tro[] = ['tipo' => 'historia'];
        unset($v['trofeos_temporada']);
        $v['trofeos'] = $tro;
        $est = [];
        if (self::tabla('estrellas_contratos') && class_exists(Estrellas::class)) {
            foreach (Db::todas('SELECT DISTINCT clave FROM estrellas_contratos WHERE jugador_id = ? AND revocado IS NULL AND vence > ? ORDER BY clave', [$jugador, self::ahora()]) as $r) {
                $c = Estrellas::CATALOGO[(string) $r['clave']] ?? null;
                if ($c) $est[] = ['clave' => (string) $r['clave'], 'nombre' => $c['nombre'], 'rol' => $c['rol']];
            }
        }
        $v['estrellas'] = $est;
        return $v;
    }

    /** Texto público corto de la partida (nombre de la productora, del personal): sin controles, sin groserías ni contactos. */
    private static function textoPublico(mixed $t, int $max): string
    {
        if (!is_string($t)) return '';
        $t = trim((string) preg_replace('/[\p{C}<>]+/u', '', $t));
        $t = mb_substr((string) preg_replace('/\s+/u', ' ', $t), 0, $max);
        if ($t === '' || Filtro::tieneGroseria($t) || Filtro::tieneContacto($t)) return '';
        return $t;
    }
    private static function entero(mixed $v, int $min, int $max): int
    {
        $n = is_int($v) ? $v : (is_float($v) && is_finite($v) ? (int) round($v) : 0);
        return max($min, min($max, $n));
    }

    /**
     * Lo público de una partida (el JSON que sube el juego, js/logic.js). Lista BLANCA: solo estas claves, todas revisadas.
     * Nunca: dinero, créditos, compras, entregas, registro, contratos, ni el resto de la partida.
     */
    public static function desdePartida(array $s): array
    {
        $EQ = CatalogoJuego::EQUIPOS;
        $EX = CatalogoJuego::EXCLUSIVOS;
        $staff = is_array($s['staff'] ?? null) ? array_values(array_filter($s['staff'], 'is_array')) : [];
        $equip = is_array($s['equip'] ?? null) ? array_values(array_filter($s['equip'], fn($e) => is_array($e) && is_string($e['type'] ?? null))) : [];
        // Equipos propios (lo alquilado, cat "service", no cuenta: igual que owned() de js/logic.js)
        $propios = array_values(array_filter($equip, fn($e) => (($EQ[$e['type']]['cat'] ?? '') !== 'service') && !str_starts_with($e['type'], 'srv_')));
        $tam = count($staff) + count($propios);
        $etapa = 0;
        foreach (self::ETAPAS as $i => $min) if ($tam >= $min) $etapa = $i;
        // Lo que se dibuja en la sede: hasta 6 cámaras + los especiales (unidad móvil, dron, satelital, generador, grúa)
        $hq = [];
        $cams = 0;
        foreach ($propios as $e) {
            $t = $e['type'];
            if (!isset($EQ[$t]) && !isset($EX[$t])) continue;
            $esCam = (($EQ[$t]['cat'] ?? '') === 'cam') || $t === 'vip_cam8k';
            if (in_array($t, self::ESPECIALES_HQ, true)) { if (!in_array($t, $hq, true)) $hq[] = $t; }
            elseif ($esCam && $cams < 6) { $hq[] = $t; $cams++; }
        }
        // Flota: vehículos propios por tipo
        $flota = [];
        foreach ($propios as $e) if ((($EQ[$e['type']]['cat'] ?? '') === 'vehicle')) $flota[$e['type']] = ($flota[$e['type']] ?? 0) + 1;
        $flota = array_slice(array_map(fn($k, $n) => ['tipo' => $k, 'n' => min(99, $n)], array_keys($flota), array_values($flota)), 0, 12);
        // Personal destacado: los 3 de más habilidad (sin el dueño)
        $roles = array_merge(CatalogoJuego::ROLES, array_keys(CatalogoJuego::ROL_ALIAS));
        $cand = array_values(array_filter($staff, fn($p) => empty($p['owner']) && is_string($p['role'] ?? null) && in_array($p['role'], $roles, true)));
        usort($cand, fn($a, $b) => [self::entero($b['skill'] ?? 0, 0, 10), self::entero($b['events'] ?? 0, 0, 99999)] <=> [self::entero($a['skill'] ?? 0, 0, 10), self::entero($a['events'] ?? 0, 0, 99999)]);
        $dest = [];
        foreach (array_slice($cand, 0, 3) as $p) {
            $rol = CatalogoJuego::ROL_ALIAS[$p['role']] ?? $p['role'];
            $nivel = is_string($p['tier'] ?? null) && preg_match('/^[a-z_]{1,20}$/', $p['tier']) ? $p['tier'] : null;
            $dest[] = ['nombre' => self::textoPublico($p['name'] ?? '', 30), 'rol' => $rol, 'nivel' => $nivel, 'habilidad' => self::entero($p['skill'] ?? 1, 1, 10), 'eventos' => self::entero($p['events'] ?? 0, 0, 99999)];
        }
        // Decoración del local (js/decoracion.js s.decor.items) y premios de temporada (js/temporadas.js s.temporada)
        $decor = [];
        foreach (is_array($s['decor']['items'] ?? null) ? $s['decor']['items'] : [] as $it) {
            if (!is_array($it) || !is_string($it['k'] ?? null) || !preg_match('/^[a-z0-9_]{1,24}$/', $it['k'])) continue;
            $o = ['k' => $it['k'], 'dia' => self::entero($it['dia'] ?? 1, 0, 1000000)];
            if (isset($it['hasta'])) $o['hasta'] = self::entero($it['hasta'], 0, 1000000);
            $decor[] = $o;
            if (count($decor) >= 24) break;
        }
        $T = is_array($s['temporada'] ?? null) ? $s['temporada'] : [];
        $cosm = array_values(array_unique(array_filter(is_array($T['cosmeticos'] ?? null) ? $T['cosmeticos'] : [], fn($c) => is_string($c) && preg_match('/^[a-z0-9_]{1,24}$/', $c))));
        $tt = [];
        foreach (is_array($T['trofeos'] ?? null) ? $T['trofeos'] : [] as $t) {
            if (!is_array($t) || !is_string($t['key'] ?? null) || !preg_match('/^[a-z0-9_]{1,32}$/', $t['key'])) continue;
            $tt[] = ['key' => $t['key'], 'anio' => self::entero($t['anio'] ?? 0, 0, 9999)];
            if (count($tt) >= 24) break;
        }
        // Mejores eventos: por estrellas (y veces con 4-5 estrellas)
        $stats = is_array($s['stats'] ?? null) ? $s['stats'] : [];
        $best = is_array($stats['best'] ?? null) ? $stats['best'] : [];
        $good = is_array($stats['good'] ?? null) ? $stats['good'] : [];
        $mej = [];
        foreach ($best as $tipo => $est) {
            if (!is_string($tipo) || !isset(CatalogoJuego::EVENTOS[$tipo])) continue;
            $e = self::entero($est, 0, 5);
            if ($e < 1) continue;
            $mej[] = ['tipo' => $tipo, 'estrellas' => $e, 'veces' => self::entero($good[$tipo] ?? 0, 0, 99999)];
        }
        usort($mej, fn($a, $b) => [$b['estrellas'], $b['veces'], $a['tipo']] <=> [$a['estrellas'], $a['veces'], $b['tipo']]);
        $logros = null;
        if (isset($s['logros']) && is_array($s['logros'])) $logros = min(9999, count(array_filter($s['logros'])));
        return [
            'productora' => self::textoPublico($s['productora'] ?? '', 24),
            'dia' => self::entero($s['day'] ?? 1, 1, 1000000),
            'fama' => self::entero($s['rep'] ?? 0, 0, 100),
            'capitulo' => self::entero($s['chapter'] ?? 0, 0, 99),
            'historia_completa' => ($s['storyDone'] ?? false) === true,
            'etapa' => $etapa,
            'personal' => min(99, count($staff)),
            'equipos' => min(999, count($propios)),
            'destacados' => $dest,
            'equipo_hq' => $hq,
            'flota' => $flota,
            'decor' => ['items' => $decor],
            'cosmeticos' => array_slice($cosm, 0, 12),
            'trofeos_temporada' => $tt,
            'mejores' => array_slice($mej, 0, 3),
            'stats' => ['eventos' => self::entero($stats['events'] ?? 0, 0, 1000000), 'cinco_estrellas' => self::entero($stats['fiveStars'] ?? 0, 0, 1000000),
                        'internacionales' => self::entero($stats['intl'] ?? 0, 0, 1000000), 'duelos_ganados' => self::entero(is_array($stats['duels'] ?? null) ? ($stats['duels']['won'] ?? 0) : 0, 0, 1000000)],
            'logros' => $logros,
        ];
    }

    // ------------------------------------------------------------------ aplausos
    /** {total, hoy, ya_hoy} de una productora (ya_hoy: si $visitante ya aplaudió hoy). */
    public static function conteo(int $visitado, ?int $visitante): array
    {
        $dia = self::dia();
        return ['total' => (int) Db::valor('SELECT COUNT(*) FROM visitas_aplausos WHERE visitado_id = ?', [$visitado]),
                'hoy' => (int) Db::valor('SELECT COUNT(*) FROM visitas_aplausos WHERE visitado_id = ? AND dia = ?', [$visitado, $dia]),
                'ya_hoy' => $visitante !== null && (bool) Db::valor('SELECT 1 FROM visitas_aplausos WHERE visitante_id = ? AND visitado_id = ? AND dia = ?', [$visitante, $visitado, $dia])];
    }

    /** POST /api/visitas/aplaudir {jugador_id} → aplausos + premio de cada lado ($ del juego como entrega). */
    public static function aplaudir(int $visitante, int $visitado): array
    {
        Fallo::si($visitante === $visitado, 'No puedes aplaudirte a ti mismo.', 400, ['codigo' => 'aplauso_propio']);
        Cuentas::exigirActiva($visitante);
        self::visitable($visitado);
        Fallo::si(!self::permite($visitado), 'Esta productora no recibe visitas por ahora.', 403, ['codigo' => 'visitas_cerradas']);
        $dia = self::dia();
        $t = self::ahora();
        return Db::tx(function () use ($visitante, $visitado, $dia, $t): array {
            Fallo::si((bool) Db::valor('SELECT 1 FROM visitas_aplausos WHERE visitante_id = ? AND visitado_id = ? AND dia = ?', [$visitante, $visitado, $dia]),
                'Ya le diste un aplauso hoy a esta productora. Vuelve mañana.', 409, ['codigo' => 'aplauso_ya']);
            $dados = (int) Db::valor('SELECT COUNT(*) FROM visitas_aplausos WHERE visitante_id = ? AND dia = ? AND premio_visitante = 1', [$visitante, $dia]);
            $recib = (int) Db::valor('SELECT COUNT(*) FROM visitas_aplausos WHERE visitado_id = ? AND dia = ? AND premio_visitado = 1', [$visitado, $dia]);
            $pv = $dados < self::PREMIOS_DIA ? 1 : 0;
            $pd = $recib < self::PREMIOS_DIA ? 1 : 0;
            Db::q('INSERT INTO visitas_aplausos (visitante_id, visitado_id, dia, premio_visitante, premio_visitado, creado) VALUES (?, ?, ?, ?, ?, ?)', [$visitante, $visitado, $dia, $pv, $pd, $t]);
            $entrega = null;
            if ($pv) $entrega = Monedero::entregar($visitante, 'dinero', '-', self::DINERO_APLAUSO, 'aplauso_dado');
            if ($pd) Monedero::entregar($visitado, 'dinero', '-', self::DINERO_APLAUSO, 'aplauso_recibido');
            return ['ok' => true, 'aplausos' => self::conteo($visitado, $visitante), 'puede_aplaudir' => false,
                    'premio' => ['dinero' => $pv ? self::DINERO_APLAUSO : 0, 'tope_alcanzado' => !$pv, 'para_visitado' => $pd ? self::DINERO_APLAUSO : 0],
                    'entregas' => $entrega ? [$entrega] : []];
        });
    }

    // ------------------------------------------------------------------ a quién visitar
    /** GET /api/visitas/sugeridas → productoras de tu servidor que reciben visitas (las más activas), sin ti. */
    public static function sugeridas(int $jugador): array
    {
        $yo = Cuentas::porId($jugador);
        $sid = $yo['servidor_id'] ?? null;
        $filas = Db::todas("SELECT j.id, j.alias, j.nombre, j.fama_publica FROM jugadores j JOIN partidas p ON p.jugador_id = j.id
                            LEFT JOIN visitas_ajustes va ON va.jugador_id = j.id
                            WHERE j.id <> ? AND (j.servidor_id IS ? OR j.servidor_id = ?) AND COALESCE(j.estado, 'activo') = 'activo' AND COALESCE(va.permitir, 1) = 1
                            ORDER BY p.actualizado DESC, j.id DESC LIMIT " . self::SUGERIDAS, [$jugador, $sid, $sid]);
        $lista = [];
        foreach ($filas as $f) {
            $a = Db::fila('SELECT a.siglas, a.color FROM asociacion_miembros am JOIN asociaciones a ON a.id = am.asociacion_id WHERE am.jugador_id = ?', [(int) $f['id']]);
            $lista[] = ['jugador_id' => (int) $f['id'], 'alias' => Social::nombrePublico($f['alias'], $f['nombre']), 'fama' => (int) $f['fama_publica'],
                        'siglas' => $a ? (string) $a['siglas'] : null, 'aplausos' => (int) Db::valor('SELECT COUNT(*) FROM visitas_aplausos WHERE visitado_id = ?', [(int) $f['id']])];
        }
        return ['ok' => true, 'productoras' => $lista, 'permitir' => self::permite($jugador), 'mis_aplausos' => self::conteo($jugador, null)];
    }
}
