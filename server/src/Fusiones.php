<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Fusión de servidores abandonados y traslado voluntario (server/COPAS.md §3, server/INTEGRAR_FUSIONES.md).
 *
 * - plan(origen, destino): SOLO LECTURA. Informe de todo lo que se movería: jugadores (activos e inactivos), choques de
 *   alias (sufijo " (Ciudad)", y " (Ciudad B)", " (Ciudad C)"... si también está ocupado), choques de nombre y siglas de
 *   asociaciones, límite de miembros, publicaciones del mercado, canales de chat, estado en curso de liga / festival /
 *   duelos / desafío / copa / coaliciones / rankings, y CADA tabla de la base que tenga una columna de servidor con la
 *   regla que se le aplica. bloqueos = cosas que impiden ejecutar ahora (ej. una copa en curso: se espera a que cierre).
 * - crearPlan(): guarda el plan (tabla fusiones, estado 'plan') con su huella. Lo hace la vigilancia diaria al entrar en
 *   abandono (sugerido) o el Centro de Control.
 * - ejecutar(plan_id, quien): SOLO una persona (el Centro de Control). En UNA transacción: vuelve a armar el plan y exige
 *   la misma huella (si algo cambió, se niega con 'plan_desactualizado'), mueve todo, deja el origen fusionado_en /
 *   fusionado_a / abierto = 0, anota en auditoria, avisa en el chat de los dos servidores y deja el aviso_fusion de
 *   /api/estado a cada movido. Nunca borra datos de jugadores; nunca toca créditos, compras ni movimientos.
 * - Traslado voluntario: GET /api/servidor/opciones y POST /api/servidor/trasladar {destino} (gratis, 1 cada 30 días).
 *
 * Decisiones (también salen en cada plan, campo "decisiones"):
 *   jugadores, asociaciones, equipos de duelo: se mueven al destino (las asociaciones conservan su id: miembros, chat de
 *     asociación, liga de asociación, festival y coaliciones siguen igual).
 *   liga semanal: la liga es entre asociaciones de todos los servidores; solo se corrige servidor_id de la semana abierta.
 *   Mega Festival: los festivales abiertos de las asociaciones movidas siguen (se corrige servidor_id y el nombre si
 *     cambiaron las siglas); los cerrados quedan como historial.
 *   duelos: la temporada abierta (puntaje) y los duelos sin cerrar pasan al destino; temporadas cerradas y premios = historial.
 *   desafío del día: los intentos de días sin cerrar pasan al ranking del destino; días cerrados y premios = historial.
 *   coaliciones: las vigentes o futuras pasan al destino; las terminadas = historial.
 *   copa de servidores: en la preparación, aportes, equipos e intentos de copa del origen pasan al destino
 *     (Copas::sincronizarServidores saca al fusionado y recalcula la preparación con los aportes). Si la copa está en
 *     batalla (o ya se jugó algún cruce), la fusión ESPERA (bloqueo copa_en_curso) hasta que cierre. Copas cerradas = historial.
 *   chat: el canal servidor:<origen> queda como archivo (se borra solo a los 30 días); los demás canales van por id.
 *   mercado: es uno solo para todos los servidores: las publicaciones siguen igual.
 *   ranking de fama: se calcula en vivo con jugadores.servidor_id: se mueve solo.
 *   salud, actividad, traslados, fusiones: historial.
 *   cualquier otra tabla con columna de servidor que no esté en REGLAS: se deja como historial y sale en "advertencias".
 */
final class Fusiones
{
    public const DIAS_TRASLADO = 30;
    public const DIAS_AVISO = 14;
    public const QUIENES_AUTOMATICOS = ['', 'sistema', 'cron', 'vigilancia', 'automatico', 'auto'];

    /** tabla => [columna => regla]. Reglas: mover | mover_vigentes | mover_temporada_abierta | mover_abiertos |
     *  mover_dia_abierto | mover_semana_abierta | mover_abiertas | historial */
    public const REGLAS = [
        'jugadores' => ['servidor_id' => 'mover'],
        'asociaciones' => ['servidor_id' => 'mover'],
        'coaliciones' => ['servidor_id' => 'mover_vigentes'],
        'duelo_equipos' => ['servidor_id' => 'mover'],
        'duelo_ratings' => ['servidor_id' => 'mover_temporada_abierta'],
        'duelos' => ['servidor_id' => 'mover_abiertos'],
        'duelo_premios' => ['servidor_id' => 'historial'],
        'desafio_intentos' => ['servidor_id' => 'mover_dia_abierto'],
        'desafio_premios' => ['servidor_id' => 'historial'],
        'liga_participantes' => ['servidor_id' => 'mover_semana_abierta'],
        'festival_instancias' => ['servidor_id' => 'mover_abiertas'],
        'servidor_salud' => ['servidor_id' => 'historial'],
        'actividad_diaria' => ['servidor_id' => 'historial'],
        'traslados' => ['origen' => 'historial', 'destino' => 'historial'],
        'fusiones' => ['origen' => 'historial', 'destino' => 'historial'],
        'copa_servidores' => ['servidor_id' => 'historial'],                 // Copas::sincronizarServidores saca al fusionado en la preparación
        'copa_aportes' => ['servidor_id' => 'mover_copa_preparacion'],
        'copa_equipos' => ['servidor_id' => 'mover_copa_preparacion'],
        'copa_intentos' => ['servidor_id' => 'mover_copa_preparacion'],
        'copa_cruces' => ['servidor_a' => 'historial', 'servidor_b' => 'historial'],
    ];
    /** Columnas que se consideran "de servidor" al buscar tablas nuevas que no estén en REGLAS. */
    private const COLUMNAS_SERVIDOR = ['servidor_id', 'servidor', 'servidor_a', 'servidor_b'];

    // ------------------------------------------------------------------ ayudas
    private static function tabla(string $t): bool { return SaludServidores::tabla($t); }

    private static function servidor(int $id): ?array { return Db::fila('SELECT * FROM servidores WHERE id = ?', [$id]); }

    /** Universo del servidor (columna servidores.universo_id del módulo Universos; sin ella todos son del mismo). */
    public static function universo(array $s): ?int
    {
        return array_key_exists('universo_id', $s) && $s['universo_id'] !== null ? (int) $s['universo_id'] : null;
    }

    /** "Servidor 1 · Quito" -> "Quito" (si no hay "·", "Servidor N"). */
    public static function ciudad(array $s): string
    {
        $n = (string) $s['nombre'];
        $p = mb_strrpos($n, '·');
        $c = $p === false ? $n : trim(mb_substr($n, $p + 1));
        return $c !== '' ? $c : 'Servidor ' . $s['id'];
    }

    private static function jugadoresDe(int $sid): int { return (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE servidor_id = ?', [$sid]); }

    private static function json(mixed $v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

    private static function temporadasCerradas(): array
    {
        return self::tabla('duelo_temporadas_cerradas') ? array_column(Db::todas('SELECT temporada FROM duelo_temporadas_cerradas'), 'temporada') : [];
    }

    /** Condición SQL de las filas "en curso" de cada regla (o null = todas las del servidor; 'nada' = ninguna). */
    private static function condicion(string $tabla, string $regla): ?string
    {
        return match ($regla) {
            'mover' => null,
            'mover_vigentes' => 'fin > ' . time(),
            'mover_temporada_abierta' => self::tabla('duelo_temporadas_cerradas') ? 'temporada NOT IN (SELECT temporada FROM duelo_temporadas_cerradas)' : null,
            'mover_abiertos' => "estado <> 'cerrado'",
            'mover_dia_abierto' => self::tabla('desafio_dias') ? 'dia NOT IN (SELECT dia FROM desafio_dias WHERE cerrado IS NOT NULL)' : null,
            'mover_semana_abierta' => self::tabla('liga_semanas') ? "semana NOT IN (SELECT semana FROM liga_semanas WHERE estado = 'cerrada')" : null,
            'mover_abiertas' => "estado = 'abierto'",
            'mover_copa_preparacion' => self::tabla('copas') ? "copa_id IN (SELECT id FROM copas WHERE fase = 'preparacion')" : 'nada',
            default => 'nada',
        };
    }

    /**
     * Copa en BATALLA (o con algún cruce ya jugado) donde juega alguno de estos servidores, o null. En la preparación no
     * bloquea: los aportes, equipos e intentos del origen pasan al destino y Copas::sincronizarServidores saca al fusionado
     * de la tabla y recalcula la preparación con los aportes.
     */
    public static function copaEnCurso(array $servidores): ?array
    {
        if (!self::tabla('copas') || !self::tabla('copa_servidores')) return null;
        $ids = implode(',', array_map('intval', $servidores));
        $jugado = self::tabla('copa_cruces') ? " OR EXISTS (SELECT 1 FROM copa_cruces x WHERE x.copa_id = copas.id AND x.estado = 'jugado')" : '';
        return Db::fila("SELECT * FROM copas WHERE fase <> 'cerrada' AND (fase = 'batalla'$jugado) AND id IN (SELECT copa_id FROM copa_servidores WHERE servidor_id IN ($ids)) ORDER BY id DESC LIMIT 1");
    }

    /** Candidatos a destino del mismo universo: abiertos, sin fusionar, con cupo para $necesita jugadores, ordenados por salud. */
    public static function destinos(int $origen, int $necesita = 0): array
    {
        $o = self::servidor($origen);
        if (!$o) return [];
        $u = self::universo($o);
        $out = [];
        foreach (Db::todas('SELECT * FROM servidores WHERE id <> ? AND abierto = 1 AND fusionado_en IS NULL ORDER BY id', [$origen]) as $s) {
            if (self::universo($s) !== $u) continue;
            $n = self::jugadoresDe((int) $s['id']);
            if ((int) $s['capacidad'] - $n < $necesita) continue;
            $salud = SaludServidores::estadoActual((int) $s['id']);
            $out[] = ['id' => (int) $s['id'], 'nombre' => $s['nombre'], 'jugadores' => $n, 'capacidad' => (int) $s['capacidad'],
                      'estado' => $salud['estado'], 'activos_7' => (int) $salud['activos_7']];
        }
        usort($out, fn($a, $b) => [SaludServidores::ORDEN[$b['estado']] ?? 0, $b['activos_7'], $a['id']] <=> [SaludServidores::ORDEN[$a['estado']] ?? 0, $a['activos_7'], $b['id']]);
        return $out;
    }

    /** El de más actividad con cupo para todos los jugadores del origen (y que no esté en abandono), o null. */
    public static function destinoSugerido(int $origen): ?array
    {
        foreach (self::destinos($origen, self::jugadoresDe($origen)) as $d) if ($d['estado'] !== 'abandono') return $d;
        return null;
    }

    /** Siguiente nombre libre: "$base$suf" con " (Ciudad)", " (Ciudad B)", ... recortando $base para no pasar $max. */
    private static function nombreLibre(string $base, string $ciudad, int $max, array &$ocupadas): string
    {
        foreach (array_merge([''], range('B', 'Z')) as $letra) {
            $suf = ' (' . $ciudad . ($letra === '' ? '' : ' ' . $letra) . ')';
            if (mb_strlen($suf) >= $max) $suf = ' (' . mb_substr($ciudad, 0, max(1, $max - 8)) . ($letra === '' ? '' : ' ' . $letra) . ')';
            $n = rtrim(mb_substr($base, 0, $max - mb_strlen($suf))) . $suf;
            $k = Social::clave($n);
            if (!isset($ocupadas[$k])) { $ocupadas[$k] = true; return $n; }
        }
        throw new \RuntimeException('No hay nombre libre para ' . $base);
    }

    /** Siglas libres de 3 caracteres: cambia la última letra (2-9, A-Z), luego las dos últimas. */
    private static function siglasLibres(string $s, array &$ocupadas): string
    {
        $s = strtoupper($s);
        $chars = array_merge(range('2', '9'), range('A', 'Z'));
        foreach ($chars as $c) { $n = substr($s, 0, 2) . $c; if (!isset($ocupadas[$n])) { $ocupadas[$n] = true; return $n; } }
        foreach ($chars as $c1) foreach ($chars as $c2) { $n = $s[0] . $c1 . $c2; if (!isset($ocupadas[$n])) { $ocupadas[$n] = true; return $n; } }
        throw new \RuntimeException('No hay siglas libres para ' . $s);
    }

    // ------------------------------------------------------------------ plan (solo lectura)
    /** Informe de la fusión de $origen en $destino. No escribe nada. */
    public static function plan(int $origen, int $destino): array
    {
        $o = self::servidor($origen);
        $d = self::servidor($destino);
        Fallo::si(!$o, 'El servidor de origen no existe.', 404, ['codigo' => 'origen_no_existe']);
        Fallo::si(!$d, 'El servidor de destino no existe.', 404, ['codigo' => 'destino_no_existe']);
        $bloqueos = [];
        $bloq = function (string $c, string $t) use (&$bloqueos): void { $bloqueos[] = ['codigo' => $c, 'texto' => $t]; };
        if ($origen === $destino) $bloq('mismo_servidor', 'El origen y el destino son el mismo servidor.');
        if ($o['fusionado_en'] !== null) $bloq('origen_fusionado', 'El servidor de origen ya se fusionó.');
        if ($d['fusionado_en'] !== null) $bloq('destino_fusionado', 'El servidor de destino ya se fusionó con otro.');
        if (!(int) $d['abierto']) $bloq('destino_cerrado', 'El servidor de destino está cerrado.');
        if (self::universo($o) !== self::universo($d)) $bloq('otro_universo', 'Los dos servidores deben ser del mismo universo.');
        $ciudad = self::ciudad($o);
        $t = time();

        // Jugadores y alias
        $jug = Db::todas('SELECT id, alias, alias_clave, estado FROM jugadores WHERE servidor_id = ? ORDER BY id', [$origen]);
        $activos = SaludServidores::activosIds($origen, SaludServidores::dia(SaludServidores::hoy(), -29), SaludServidores::hoy());
        $nDest = self::jugadoresDe($destino);
        if ($nDest + count($jug) > (int) $d['capacidad']) $bloq('sin_cupo', 'El destino no tiene cupo: ' . $nDest . ' + ' . count($jug) . ' > ' . $d['capacidad'] . '.');
        $ocup = [];
        foreach (Db::todas('SELECT alias_clave FROM jugadores WHERE servidor_id IN (?, ?) AND alias_clave IS NOT NULL', [$origen, $destino]) as $f) $ocup[$f['alias_clave']] = true;
        $claveDest = [];
        foreach (Db::todas('SELECT alias_clave FROM jugadores WHERE servidor_id = ? AND alias_clave IS NOT NULL', [$destino]) as $f) $claveDest[$f['alias_clave']] = true;
        $alias = [];
        foreach ($jug as $j) {
            if ($j['alias_clave'] === null || !isset($claveDest[$j['alias_clave']])) continue;
            $alias[] = ['jugador_id' => (int) $j['id'], 'antes' => $j['alias'], 'nuevo' => self::nombreLibre((string) $j['alias'], $ciudad, 24, $ocup)];
        }

        // Asociaciones
        $ocN = []; $ocS = []; $nomDest = []; $sigDest = [];
        foreach (Db::todas('SELECT servidor_id, nombre_clave, siglas FROM asociaciones WHERE servidor_id IN (?, ?)', [$origen, $destino]) as $f) {
            $ocN[$f['nombre_clave']] = true; $ocS[strtoupper($f['siglas'])] = true;
            if ((int) $f['servidor_id'] === $destino) { $nomDest[$f['nombre_clave']] = true; $sigDest[strtoupper($f['siglas'])] = true; }
        }
        $asocs = [];
        foreach (Db::todas('SELECT a.*, (SELECT COUNT(*) FROM asociacion_miembros m WHERE m.asociacion_id = a.id) AS n FROM asociaciones a WHERE a.servidor_id = ? ORDER BY a.id', [$origen]) as $a) {
            $cN = isset($nomDest[$a['nombre_clave']]); $cS = isset($sigDest[strtoupper($a['siglas'])]);
            $asocs[] = ['id' => (int) $a['id'], 'nombre' => $a['nombre'], 'siglas' => $a['siglas'], 'miembros' => (int) $a['n'],
                'sobre_limite' => (int) $a['n'] > Social::MAX_MIEMBROS,
                'choque_nombre' => $cN, 'choque_siglas' => $cS,
                'nombre_nuevo' => $cN ? self::nombreLibre((string) $a['nombre'], $ciudad, 30, $ocN) : null,
                'siglas_nuevas' => $cS ? self::siglasLibres((string) $a['siglas'], $ocS) : null];
        }
        $sobre = array_values(array_filter($asocs, fn($a) => $a['sobre_limite']));
        $solicitudes = (int) Db::valor('SELECT COUNT(*) FROM asociacion_solicitudes s JOIN asociaciones a ON a.id = s.asociacion_id WHERE a.servidor_id = ?', [$origen]);

        // Mercado
        $pubs = (int) Db::valor("SELECT COUNT(*) FROM mercado_publicaciones p JOIN jugadores j ON j.id = p.vendedor_id WHERE j.servidor_id = ? AND p.estado IN ('activa', 'congelada')", [$origen]);

        // Chat
        $canales = [['canal' => 'servidor:' . $origen, 'mensajes' => (int) Db::valor('SELECT COUNT(*) FROM chat_mensajes WHERE canal = ?', ['servidor:' . $origen]),
                     'decision' => 'queda como archivo (se borra solo a los ' . Chat::DIAS . ' días); los movidos leen y escriben en servidor:' . $destino]];
        $msgAsoc = (int) Db::valor("SELECT COUNT(*) FROM chat_mensajes WHERE canal IN (SELECT 'asociacion:' || id FROM asociaciones WHERE servidor_id = ?)", [$origen]);
        $canales[] = ['canal' => 'asociacion:<id> (' . count($asocs) . ')', 'mensajes' => $msgAsoc, 'decision' => 'siguen igual: van por id de asociación'];
        $canales[] = ['canal' => 'coalicion:<id> y sistema:<jugador>', 'mensajes' => null, 'decision' => 'siguen igual: van por id'];

        // Copa
        $copa = self::copaEnCurso([$origen, $destino]);
        if ($copa) $bloq('copa_en_curso', 'Hay una copa en batalla (' . ($copa['nombre'] ?? ('N° ' . $copa['id'])) . ', fase ' . $copa['fase'] . '): la fusión espera a que cierre' . (isset($copa['fin']) ? ' (' . Db::iso((int) $copa['fin']) . ')' : '') . '.');

        // Cada tabla con columna de servidor
        $tablas = []; $advert = [];
        foreach (Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as $tf) {
            $tn = (string) $tf['name'];
            if ($tn === 'servidores') continue;
            $cols = array_keys(Migraciones::columnas($tn) ?? []);
            $reglas = self::REGLAS[$tn] ?? [];
            foreach ($cols as $c) {
                if (!isset($reglas[$c]) && !in_array($c, self::COLUMNAS_SERVIDOR, true)) continue;
                $regla = $reglas[$c] ?? 'historial';
                $total = (int) Db::valor("SELECT COUNT(*) FROM \"$tn\" WHERE \"$c\" = ?", [$origen]);
                $cond = self::condicion($tn, $regla);
                $mover = $cond === 'nada' ? 0 : (int) Db::valor("SELECT COUNT(*) FROM \"$tn\" WHERE \"$c\" = ?" . ($cond ? " AND $cond" : ''), [$origen]);
                $tablas[] = ['tabla' => $tn, 'columna' => $c, 'regla' => $regla, 'filas_origen' => $total, 'se_mueven' => $mover];
                if (!isset($reglas[$c])) $advert[] = "La tabla $tn.$c no tiene regla de fusión: se deja como historial ($total filas del origen).";
            }
        }
        $porTabla = [];
        foreach ($tablas as $x) $porTabla[$x['tabla'] . '.' . $x['columna']] = $x;
        $mov = fn(string $k) => $porTabla[$k]['se_mueven'] ?? 0;
        $hist = fn(string $k) => ($porTabla[$k]['filas_origen'] ?? 0) - ($porTabla[$k]['se_mueven'] ?? 0);

        $enCurso = [
            ['modulo' => 'liga', 'filas' => $mov('liga_participantes.servidor_id'), 'decision' => 'migrar: la liga es entre asociaciones (conservan su id); se corrige el servidor de la semana abierta; ' . $hist('liga_participantes.servidor_id') . ' filas de semanas cerradas quedan como historial'],
            ['modulo' => 'festival', 'filas' => $mov('festival_instancias.servidor_id'), 'decision' => 'migrar: los festivales abiertos siguen con la misma asociación (se corrige servidor y nombre si cambian las siglas); los cerrados quedan como historial'],
            ['modulo' => 'duelos', 'filas' => $mov('duelos.servidor_id') + $mov('duelo_ratings.servidor_id') + $mov('duelo_equipos.servidor_id'), 'decision' => 'migrar: equipos de duelo, puntaje de la temporada abierta y duelos sin cerrar pasan al destino; temporadas cerradas y premios quedan como historial'],
            ['modulo' => 'desafio', 'filas' => $mov('desafio_intentos.servidor_id'), 'decision' => 'migrar: los intentos de días sin cerrar cuentan en el ranking del destino; días cerrados y premios quedan como historial'],
            ['modulo' => 'coaliciones', 'filas' => $mov('coaliciones.servidor_id'), 'decision' => 'migrar: las coaliciones vigentes o futuras pasan al destino; las terminadas quedan como historial'],
            ['modulo' => 'copa', 'filas' => $copa ? 1 : $mov('copa_aportes.servidor_id') + $mov('copa_equipos.servidor_id') + $mov('copa_intentos.servidor_id'),
             'decision' => $copa ? 'esperar: hay una copa en batalla; la fusión se puede ejecutar cuando cierre (sábado 20:00)'
                 : 'migrar: en la preparación los aportes, equipos e intentos de copa pasan al destino (la copa saca al fusionado y recalcula la preparación); copas cerradas = historial'],
        ];
        $resumen = ['jugadores' => count($jug), 'activos_30' => count(array_intersect_key($activos, array_flip(array_map('intval', array_column($jug, 'id'))))),
                    'choques_alias' => count($alias), 'asociaciones' => count($asocs),
                    'choques_asociaciones' => count(array_filter($asocs, fn($a) => $a['choque_nombre'] || $a['choque_siglas'])),
                    'publicaciones_activas' => $pubs, 'bloqueos' => count($bloqueos)];
        $resumen['inactivos'] = $resumen['jugadores'] - $resumen['activos_30'];
        $plan = [
            'origen' => ['id' => $origen, 'nombre' => $o['nombre'], 'ciudad' => $ciudad, 'universo_id' => self::universo($o), 'jugadores' => count($jug), 'salud' => SaludServidores::estadoActual($origen)],
            'destino' => ['id' => $destino, 'nombre' => $d['nombre'], 'universo_id' => self::universo($d), 'jugadores' => $nDest, 'capacidad' => (int) $d['capacidad'],
                          'cupo' => (int) $d['capacidad'] - $nDest, 'salud' => SaludServidores::estadoActual($destino)],
            'generado' => Db::iso($t),
            'resumen' => $resumen,
            'jugadores' => ['total' => count($jug), 'activos_30' => $resumen['activos_30'], 'inactivos' => $resumen['inactivos'], 'ids' => array_map('intval', array_column($jug, 'id'))],
            'alias' => $alias,
            'asociaciones' => $asocs,
            'limite_miembros' => ['max' => Social::MAX_MIEMBROS, 'sobre_limite' => $sobre, 'decision' => 'las asociaciones se mueven enteras (no se juntan): cada una conserva sus miembros'],
            'solicitudes_pendientes' => ['filas' => $solicitudes, 'decision' => 'siguen igual (la asociación y quien pidió entrar se mueven juntos)'],
            'mercado' => ['publicaciones_activas' => $pubs, 'decision' => 'sin cambios: el mercado es uno solo para todos los servidores'],
            'chat' => $canales,
            'en_curso' => $enCurso,
            'rankings' => [
                ['ranking' => 'fama (productoras y asociaciones)', 'decision' => 'se calcula en vivo con el servidor del jugador: se mueve solo'],
                ['ranking' => 'duelos (temporada abierta)', 'filas' => $mov('duelo_ratings.servidor_id'), 'decision' => 'pasa al ranking del destino'],
                ['ranking' => 'desafío del día (días abiertos)', 'filas' => $mov('desafio_intentos.servidor_id'), 'decision' => 'pasa al ranking del destino'],
                ['ranking' => 'liga y festival', 'decision' => 'son por asociación: no cambian'],
            ],
            'tablas' => $tablas,
            'bloqueos' => $bloqueos,
            'advertencias' => $advert,
            'decisiones' => [
                'Se mueven TODOS los jugadores del origen (activos e inactivos). Nunca se borran datos de jugadores; créditos, compras y movimientos no se tocan.',
                'Alias que ya existe en el destino: se le agrega " (' . $ciudad . ')" (o " (' . $ciudad . ' B)", " (' . $ciudad . ' C)"... si también está ocupado), máximo 24 caracteres.',
                'Asociación con nombre o siglas repetidos en el destino: nombre + " (' . $ciudad . ')" y siglas con la última letra cambiada.',
                'El servidor de origen queda fusionado (fusionado_en, fusionado_a) y cerrado (abierto = 0). Lo aprueba una persona en el Centro de Control.',
            ],
        ];
        $plan['huella'] = self::huella($plan);
        return $plan;
    }

    /** Lo que tiene que seguir igual entre el plan guardado y el momento de ejecutar. */
    private static function huella(array $p): string
    {
        return hash('sha256', self::json([$p['origen']['id'], $p['destino']['id'], $p['jugadores']['ids'], $p['alias'],
            array_map(fn($a) => [$a['id'], $a['nombre_nuevo'], $a['siglas_nuevas']], $p['asociaciones']), array_column($p['bloqueos'], 'codigo')]));
    }

    /** Guarda un plan (estado 'plan'). Si ya había uno pendiente para ese origen, lo reemplaza (el viejo queda cancelado). */
    public static function crearPlan(int $origen, int $destino, string $quien, bool $sugerida = false): int
    {
        $p = self::plan($origen, $destino);
        return Db::tx(function () use ($p, $origen, $destino, $quien, $sugerida): int {
            Db::q("UPDATE fusiones SET estado = 'cancelada', cancelada_en = ?, motivo = 'reemplazado por un plan nuevo', quien = ? WHERE origen = ? AND estado IN ('plan', 'aprobada')", [time(), mb_substr($quien, 0, 80), $origen]);
            Db::q("INSERT INTO fusiones (origen, destino, estado, plan_json, huella, sugerida, creado, creado_por) VALUES (?, ?, 'plan', ?, ?, ?, ?, ?)",
                [$origen, $destino, self::json($p), $p['huella'], (int) $sugerida, time(), mb_substr($quien, 0, 80)]);
            $id = Db::ultimoId();
            Auditoria::anotar($quien, 'fusion_plan', 'Plan N° ' . $id . ': ' . $p['origen']['nombre'] . ' -> ' . $p['destino']['nombre'] . ' (' . $p['resumen']['jugadores'] . ' jugadores'
                . ($p['bloqueos'] ? '; bloqueos: ' . implode(', ', array_column($p['bloqueos'], 'codigo')) : '') . ')');
            return $id;
        });
    }

    public static function planJson(array $f, bool $completo = true): array
    {
        $p = json_decode((string) $f['plan_json'], true) ?: [];
        $o = ['id' => (int) $f['id'], 'origen' => (int) $f['origen'], 'destino' => (int) $f['destino'], 'estado' => $f['estado'], 'sugerida' => (bool) (int) $f['sugerida'],
              'creado' => Db::iso((int) $f['creado']), 'creado_por' => $f['creado_por'], 'ejecutada' => $f['ejecutada'] !== null ? Db::iso((int) $f['ejecutada']) : null,
              'quien' => $f['quien'], 'motivo' => $f['motivo'], 'origen_nombre' => $p['origen']['nombre'] ?? null, 'destino_nombre' => $p['destino']['nombre'] ?? null,
              'resumen' => $p['resumen'] ?? null, 'bloqueos' => $p['bloqueos'] ?? []];
        if ($completo) { $o['plan'] = $p; $o['resultado'] = $f['resultado_json'] !== null ? json_decode((string) $f['resultado_json'], true) : null; }
        return $o;
    }

    public static function obtener(int $planId): ?array
    {
        $f = Db::fila('SELECT * FROM fusiones WHERE id = ?', [$planId]);
        return $f ? self::planJson($f) : null;
    }

    /** Centro de Control: descarta un plan pendiente. */
    public static function cancelar(int $planId, string $quien, string $motivo = ''): void
    {
        self::exigirPersona($quien);
        Db::tx(function () use ($planId, $quien, $motivo): void {
            $f = Db::fila('SELECT * FROM fusiones WHERE id = ?', [$planId]);
            Fallo::si(!$f, 'Ese plan de fusión no existe.', 404, ['codigo' => 'plan_no_existe']);
            Fallo::si(!in_array($f['estado'], ['plan', 'aprobada'], true), 'Ese plan ya está "' . $f['estado'] . '".', 409, ['codigo' => 'plan_' . $f['estado']]);
            Db::q("UPDATE fusiones SET estado = 'cancelada', cancelada_en = ?, quien = ?, motivo = ? WHERE id = ?", [time(), mb_substr($quien, 0, 80), mb_substr($motivo, 0, 300) ?: 'cancelado', $planId]);
            Auditoria::anotar($quien, 'fusion_cancelar', 'Plan N° ' . $planId . ' (' . $f['origen'] . ' -> ' . $f['destino'] . ')' . ($motivo !== '' ? ': ' . $motivo : ''));
        });
    }

    private static function exigirPersona(string $quien): void
    {
        Fallo::si(in_array(strtolower(trim($quien)), self::QUIENES_AUTOMATICOS, true), 'La fusión solo la aprueba una persona desde el Centro de Control.', 403, ['codigo' => 'requiere_persona']);
    }

    // ------------------------------------------------------------------ ejecutar
    /** Ejecuta un plan guardado. $quien = usuario del Centro de Control (nunca un proceso automático). */
    public static function ejecutar(int $planId, string $quien): array
    {
        self::exigirPersona($quien);
        return Db::tx(function () use ($planId, $quien): array {
            $f = Db::fila('SELECT * FROM fusiones WHERE id = ?', [$planId]);
            Fallo::si(!$f, 'Ese plan de fusión no existe.', 404, ['codigo' => 'plan_no_existe']);
            Fallo::si($f['estado'] === 'ejecutada', 'Ese plan ya se ejecutó.', 409, ['codigo' => 'ya_ejecutada']);
            Fallo::si($f['estado'] === 'cancelada', 'Ese plan está cancelado.', 409, ['codigo' => 'plan_cancelado']);
            $O = (int) $f['origen']; $D = (int) $f['destino'];
            $p = self::plan($O, $D);
            if ($p['bloqueos']) throw new Fallo('No se puede ejecutar ahora: ' . implode(' ', array_column($p['bloqueos'], 'texto')), 409, ['codigo' => $p['bloqueos'][0]['codigo'], 'bloqueos' => $p['bloqueos']]);
            Fallo::si($p['huella'] !== $f['huella'], 'El servidor cambió desde que se armó el plan (jugadores, alias o asociaciones). Arma el plan otra vez y revísalo.', 409, ['codigo' => 'plan_desactualizado']);
            $t = time();
            $ciudad = $p['origen']['ciudad'];
            $creditos = (int) Db::valor('SELECT COALESCE(SUM(creditos), 0) FROM jugadores WHERE servidor_id = ?', [$O]);

            // 1. Renombres (todavía en el origen: los nombres nuevos también están libres ahí)
            $aliasNuevo = [];
            foreach ($p['alias'] as $a) {
                Db::q('UPDATE jugadores SET alias = ?, alias_clave = ? WHERE id = ? AND servidor_id = ?', [$a['nuevo'], Social::clave($a['nuevo']), $a['jugador_id'], $O]);
                $aliasNuevo[$a['jugador_id']] = $a;
            }
            $asocCambio = [];
            foreach ($p['asociaciones'] as $a) {
                if ($a['nombre_nuevo'] === null && $a['siglas_nuevas'] === null) continue;
                $n = $a['nombre_nuevo'] ?? $a['nombre']; $s = $a['siglas_nuevas'] ?? $a['siglas'];
                Db::q('UPDATE asociaciones SET nombre = ?, nombre_clave = ?, siglas = ? WHERE id = ?', [$n, Social::clave($n), $s, $a['id']]);
                $asocCambio[$a['id']] = ['antes' => $a['nombre'] . ' [' . $a['siglas'] . ']', 'nueva' => $n . ' [' . $s . ']', 'siglas' => $s, 'siglas_cambian' => $a['siglas_nuevas'] !== null];
            }
            // 2. Mover cada tabla según su regla
            $movidas = [];
            foreach ($p['tablas'] as $x) {
                $regla = self::REGLAS[$x['tabla']][$x['columna']] ?? 'historial';
                $cond = self::condicion($x['tabla'], $regla);
                if ($regla === 'historial' || $cond === 'nada' || $x['tabla'] === 'jugadores') continue;
                if ($x['tabla'] === 'festival_instancias') {
                    foreach ($asocCambio as $aid => $c) if ($c['siglas_cambian']) Db::q("UPDATE festival_instancias SET nombre = ? WHERE asociacion_id = ? AND servidor_id = ? AND estado = 'abierto'", ['Mega Festival ' . $c['siglas'], $aid, $O]);
                }
                $movidas[$x['tabla']] = Db::q("UPDATE \"{$x['tabla']}\" SET \"{$x['columna']}\" = ? WHERE \"{$x['columna']}\" = ?" . ($cond ? " AND $cond" : ''), [$D, $O])->rowCount();
            }
            $ids = $p['jugadores']['ids'];
            $movidas['jugadores'] = Db::q('UPDATE jugadores SET servidor_id = ? WHERE servidor_id = ?', [$D, $O])->rowCount();
            Fallo::si($movidas['jugadores'] !== count($ids), 'Los jugadores del origen cambiaron durante la fusión.', 409, ['codigo' => 'plan_desactualizado']);
            // 3. Origen fusionado y cerrado; los planes que iban HACIA el origen ya no sirven
            Db::q('UPDATE servidores SET fusionado_en = ?, fusionado_a = ?, abierto = 0 WHERE id = ?', [$t, $D, $O]);
            Db::q("UPDATE fusiones SET estado = 'cancelada', cancelada_en = ?, quien = ?, motivo = ? WHERE destino = ? AND estado IN ('plan', 'aprobada')", [$t, mb_substr($quien, 0, 80), 'el destino se fusionó (plan N° ' . $planId . ')', $O]);
            // 4. Traslados (y aviso_fusion de /api/estado)
            $miAsoc = [];
            foreach (Db::todas('SELECT m.jugador_id, m.asociacion_id FROM asociacion_miembros m JOIN asociaciones a ON a.id = m.asociacion_id WHERE a.servidor_id = ?', [$D]) as $m) $miAsoc[(int) $m['jugador_id']] = (int) $m['asociacion_id'];
            $st = Db::pdo()->prepare("INSERT INTO traslados (jugador_id, origen, destino, motivo, fusion_id, alias_antes, alias_nuevo, asociacion_id, asociacion_antes, asociacion_nueva, creado) VALUES (?, ?, ?, 'fusion', ?, ?, ?, ?, ?, ?, ?)");
            foreach ($ids as $j) {
                $a = $aliasNuevo[$j] ?? null; $as = $miAsoc[$j] ?? null; $c = $as !== null ? ($asocCambio[$as] ?? null) : null;
                $st->execute([$j, $O, $D, $planId, $a['antes'] ?? null, $a['nuevo'] ?? null, $as, $c['antes'] ?? null, $c['nueva'] ?? null, $t]);
            }
            // 5. Chat de los dos servidores
            $txtO = '📦 ' . $p['origen']['nombre'] . ' se unió a ' . $p['destino']['nombre'] . '. Todas las productoras de aquí ya están allá: tu progreso, créditos y equipos siguen igual.';
            $txtD = '🤝 ¡Bienvenidas las ' . count($ids) . ' productoras de ' . $p['origen']['nombre'] . '! Desde hoy juegan en ' . $p['destino']['nombre'] . '.';
            Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, creado) VALUES (?, NULL, ?, ?)', ['servidor:' . $O, mb_substr($txtO, 0, Chat::MAX_TEXTO), $t]);
            Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, creado) VALUES (?, NULL, ?, ?)', ['servidor:' . $D, mb_substr($txtD, 0, Chat::MAX_TEXTO), $t]);
            // 6. Resultado y auditoría
            Fallo::si((int) Db::valor('SELECT COALESCE(SUM(creditos), 0) FROM jugadores WHERE id IN (SELECT jugador_id FROM traslados WHERE fusion_id = ?)', [$planId]) !== $creditos, 'Los créditos no cuadran: no se fusiona.', 500, ['codigo' => 'creditos_no_cuadran']);
            $res = ['movidas' => $movidas, 'alias_renombrados' => count($aliasNuevo), 'asociaciones_renombradas' => count($asocCambio), 'jugadores' => count($ids), 'creditos_total' => $creditos];
            Db::q("UPDATE fusiones SET estado = 'ejecutada', ejecutada = ?, quien = ?, resultado_json = ?, plan_json = ? WHERE id = ?", [$t, mb_substr($quien, 0, 80), self::json($res), self::json($p), $planId]);
            Auditoria::anotar($quien, 'fusion_ejecutar', 'Plan N° ' . $planId . ': ' . $p['origen']['nombre'] . ' -> ' . $p['destino']['nombre'] . '. ' . count($ids) . ' jugadores, '
                . count($aliasNuevo) . ' alias y ' . count($asocCambio) . ' asociaciones renombrados. Filas: ' . self::json($movidas));
            return ['ok' => true, 'plan_id' => $planId] + $res;
        });
    }

    // ------------------------------------------------------------------ /api/estado
    /** Para sumar a /api/estado: ['aviso_fusion' => null | {...}] (el último cambio por fusión de los últimos 14 días sin cerrar). */
    public static function estado(?int $jugador): array
    {
        if ($jugador === null) return ['aviso_fusion' => null];
        try {
            $f = Db::fila("SELECT t.*, so.nombre AS origen_nombre, sd.nombre AS destino_nombre FROM traslados t LEFT JOIN servidores so ON so.id = t.origen LEFT JOIN servidores sd ON sd.id = t.destino
                           WHERE t.jugador_id = ? AND t.motivo = 'fusion' AND t.aviso_visto IS NULL AND t.creado >= ? ORDER BY t.id DESC LIMIT 1", [$jugador, time() - self::DIAS_AVISO * 86400]);
        } catch (\Throwable) { return ['aviso_fusion' => null]; }
        if (!$f) return ['aviso_fusion' => null];
        $txt = 'Tu servidor ' . $f['origen_nombre'] . ' se unió a ' . $f['destino_nombre'] . ' para que siempre tengas con quién jugar. Tu progreso, créditos y equipos siguen igual.';
        if ($f['alias_nuevo'] !== null) $txt .= ' Ya había otra productora "' . $f['alias_antes'] . '" allá: ahora te llamas "' . $f['alias_nuevo'] . '" (puedes cambiarlo en tu perfil).';
        if ($f['asociacion_nueva'] !== null) $txt .= ' Tu asociación ' . $f['asociacion_antes'] . ' ahora es ' . $f['asociacion_nueva'] . '.';
        return ['aviso_fusion' => ['id' => (int) $f['id'], 'fusion_id' => $f['fusion_id'] !== null ? (int) $f['fusion_id'] : null,
            'origen' => ['id' => (int) $f['origen'], 'nombre' => $f['origen_nombre']], 'destino' => ['id' => (int) $f['destino'], 'nombre' => $f['destino_nombre']],
            'alias_antes' => $f['alias_antes'], 'alias_nuevo' => $f['alias_nuevo'], 'asociacion_antes' => $f['asociacion_antes'], 'asociacion_nueva' => $f['asociacion_nueva'],
            'de' => $f['origen_nombre'], 'a' => $f['destino_nombre'], 'fecha' => date('Y-m-d', (int) $f['creado']), 'fecha_iso' => Db::iso((int) $f['creado']), 'texto' => $txt]];
    }

    // ------------------------------------------------------------------ traslado voluntario
    /** Por qué este jugador no puede trasladarse ahora (sin mirar el destino): [codigo, texto, extra] o null. */
    private static function impedimento(int $j): ?array
    {
        $ult = Db::valor("SELECT MAX(creado) FROM traslados WHERE jugador_id = ? AND motivo = 'voluntario'", [$j]);
        if ($ult !== null && (int) $ult > time() - self::DIAS_TRASLADO * 86400) {
            $desde = (int) $ult + self::DIAS_TRASLADO * 86400;
            return ['traslado_reciente', 'Ya te trasladaste hace poco. Puedes volver a hacerlo desde el ' . date('d/m/Y', $desde) . '.', ['disponible_desde' => Db::iso($desde)]];
        }
        $m = Social::miembro($j);
        if ($m && $m['cargo'] === 'presidente' && (int) Db::valor('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$m['asociacion_id']]) > 1)
            return ['presidente_con_miembros', 'Eres presidente de una asociación con miembros. Pasa la presidencia a otra persona antes de trasladarte.', []];
        $abiertos = [
            ['duelos', 'retador_id', "('abierto', 'validando', 'pendiente')"], ['desafio_intentos', 'jugador_id', "('abierto', 'validando', 'pendiente')"],
            ['liga_intentos', 'jugador_id', "('emitido', 'pendiente')"], ['festival_intentos', 'jugador_id', "('jugando', 'validando', 'pendiente')"],
            ['copa_intentos', 'jugador_id', "('emitido', 'abierto', 'jugando', 'validando', 'pendiente')"],
        ];
        foreach ($abiertos as [$t, $c, $est]) {
            if (!self::tabla($t) || !isset((Migraciones::columnas($t) ?? [])['estado'])) continue;
            if (Db::valor("SELECT 1 FROM $t WHERE $c = ? AND estado IN $est LIMIT 1", [$j])) return ['intento_abierto', 'Tienes un evento en línea sin terminar. Termínalo (o deja que venza) antes de trasladarte.', ['donde' => $t]];
        }
        if (Db::valor("SELECT 1 FROM mercado_publicaciones WHERE vendedor_id = ? AND estado IN ('activa', 'congelada') LIMIT 1", [$j]))
            return ['publicaciones_activas', 'Tienes equipos publicados en el mercado. Retíralos (o espera a que se vendan) antes de trasladarte.', []];
        if (self::tabla('copa_equipos') && self::tabla('copas') && Db::valor("SELECT 1 FROM copa_equipos e JOIN copas c ON c.id = e.copa_id WHERE e.jugador_id = ? AND c.fase <> 'cerrada' LIMIT 1", [$j]))
            return ['copa_en_curso', 'Registraste tu equipo en la copa de esta semana: podrás trasladarte cuando la copa cierre.', []];
        return null;
    }

    /** {id, nombre} del universo del servidor (tabla universos del módulo Universos; sin ella, el de arranque). */
    public static function universoInfo(array $s): array
    {
        // Lo mismo que Universos::universoDe() pero leyendo la tabla directo (universoDe llama a Universos::preparar,
        // que puede crear servidores: un GET no debe tener ese efecto).
        $uid = self::universo($s);
        if ($uid !== null && self::tabla('universos')) {
            $n = Db::valor('SELECT nombre FROM universos WHERE id = ?', [$uid]);
            if ($n !== null) return ['id' => $uid, 'nombre' => (string) $n];
        }
        return ['id' => $uid ?? 1, 'nombre' => 'Universo Andino'];
    }

    /** GET /api/servidor/opciones */
    public static function opciones(int $j): array
    {
        $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
        $s = self::servidor($sid);
        $salud = SaludServidores::estadoActual($sid);
        $mas = array_values(array_filter(self::destinos($sid, 1), fn($d) => (SaludServidores::ORDEN[$d['estado']] ?? 0) > (SaludServidores::ORDEN[$salud['estado']] ?? 0)));
        $imp = Cuentas::estadoCuenta($j) !== 'activo' ? ['cuenta_no_activa', 'Tu cuenta no está activa.', []] : self::impedimento($j);
        if ($imp === null && !$mas) $imp = $salud['estado'] === 'sano' ? ['servidor_sano', 'Tu servidor está activo: no hace falta trasladarse.', []] : ['sin_destino', 'Ahora no hay otro servidor más activo con cupo en tu universo.', []];
        $ult = Db::valor("SELECT MAX(creado) FROM traslados WHERE jugador_id = ? AND motivo = 'voluntario'", [$j]);
        $prox = $ult !== null && (int) $ult + self::DIAS_TRASLADO * 86400 > time() ? date('Y-m-d', (int) $ult + self::DIAS_TRASLADO * 86400) : null;
        $uni = self::universoInfo($s ?? ['id' => $sid]);
        $actual = ['id' => $sid, 'nombre' => $s['nombre'] ?? null, 'estado' => $salud['estado'], 'activos_7' => (int) $salud['activos_7'], 'activos_30' => (int) ($salud['activos_30'] ?? 0),
                   'jugadores' => self::jugadoresDe($sid), 'dia' => $salud['dia'] ?? null, 'universo' => $uni];
        return ['ok' => true,
            'actual' => $actual,
            'servidor' => $actual,   // mismo objeto que "actual" (nombre viejo)
            'universo' => $uni,
            'proximo_traslado' => $prox,
            'sugerido' => $mas[0] ?? null,
            'destinos' => $mas,
            'puede' => $imp === null, 'codigo' => $imp[0] ?? null, 'motivo' => $imp[1] ?? null] + ($imp[2] ?? []) + ['cada_dias' => self::DIAS_TRASLADO, 'gratis' => true];
    }

    /** POST /api/servidor/trasladar {destino} */
    public static function trasladar(int $j, array $in): array
    {
        Cuentas::exigirActiva($j);
        $dest = $in['destino'] ?? null;
        $dest = is_int($dest) ? $dest : (is_string($dest) && preg_match('/^\d{1,9}$/', $dest) ? (int) $dest : 0);
        Fallo::si($dest <= 0, 'Elige el servidor de destino.', 400, ['codigo' => 'falta_destino']);
        return Db::tx(function () use ($j, $dest): array {
            $O = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
            $o = self::servidor($O); $d = self::servidor($dest);
            Fallo::si(!$d, 'Ese servidor no existe.', 404, ['codigo' => 'destino_no_existe']);
            Fallo::si($dest === $O, 'Ya estás en ese servidor.', 409, ['codigo' => 'mismo_servidor']);
            Fallo::si(!(int) $d['abierto'] || $d['fusionado_en'] !== null, 'Ese servidor está cerrado.', 409, ['codigo' => 'destino_cerrado']);
            Fallo::si(self::universo($o) !== self::universo($d), 'Solo puedes trasladarte a un servidor de tu universo.', 409, ['codigo' => 'otro_universo']);
            Fallo::si(self::jugadoresDe($dest) >= (int) $d['capacidad'], 'Ese servidor está lleno.', 409, ['codigo' => 'destino_lleno']);
            $eo = SaludServidores::estadoActual($O)['estado']; $ed = SaludServidores::estadoActual($dest)['estado'];
            Fallo::si((SaludServidores::ORDEN[$ed] ?? 0) <= (SaludServidores::ORDEN[$eo] ?? 0), 'Solo puedes trasladarte a un servidor más activo que el tuyo.', 409, ['codigo' => 'destino_no_mas_sano', 'estado_origen' => $eo, 'estado_destino' => $ed]);
            $imp = self::impedimento($j);
            if ($imp !== null) throw new Fallo($imp[1], 409, ['codigo' => $imp[0]] + $imp[2]);
            $t = time();
            $ciudad = self::ciudad($o);
            // Alias: si ya existe en el destino, sufijo " (Ciudad)"
            $yo = Db::fila('SELECT alias, alias_clave FROM jugadores WHERE id = ?', [$j]);
            $aliasNuevo = null;
            if ($yo['alias_clave'] !== null && Db::valor('SELECT 1 FROM jugadores WHERE servidor_id = ? AND alias_clave = ?', [$dest, $yo['alias_clave']])) {
                $oc = [];
                foreach (Db::todas('SELECT alias_clave FROM jugadores WHERE servidor_id IN (?, ?) AND alias_clave IS NOT NULL', [$O, $dest]) as $f) $oc[$f['alias_clave']] = true;
                $aliasNuevo = self::nombreLibre((string) $yo['alias'], $ciudad, 24, $oc);
                Db::q('UPDATE jugadores SET alias = ?, alias_clave = ? WHERE id = ?', [$aliasNuevo, Social::clave($aliasNuevo), $j]);
            }
            // Asociación: presidente solo -> la asociación se va con él (renombrada si choca); socio/vice -> sale de ella
            $m = Social::miembro($j);
            $asocId = null; $asocAntes = null; $asocNueva = null; $salio = null;
            if ($m && $m['cargo'] === 'presidente') {
                $a = Db::fila('SELECT * FROM asociaciones WHERE id = ?', [$m['asociacion_id']]);
                $asocId = (int) $a['id'];
                $ocN = []; $ocS = [];
                foreach (Db::todas('SELECT nombre_clave, siglas FROM asociaciones WHERE servidor_id IN (?, ?)', [$O, $dest]) as $f) { $ocN[$f['nombre_clave']] = true; $ocS[strtoupper($f['siglas'])] = true; }
                $n = $a['nombre']; $s = $a['siglas'];
                if (Db::valor('SELECT 1 FROM asociaciones WHERE servidor_id = ? AND nombre_clave = ?', [$dest, $a['nombre_clave']])) $n = self::nombreLibre((string) $a['nombre'], $ciudad, 30, $ocN);
                if (Db::valor('SELECT 1 FROM asociaciones WHERE servidor_id = ? AND siglas = ? COLLATE NOCASE', [$dest, $a['siglas']])) $s = self::siglasLibres((string) $a['siglas'], $ocS);
                if ($n !== $a['nombre'] || $s !== $a['siglas']) { $asocAntes = $a['nombre'] . ' [' . $a['siglas'] . ']'; $asocNueva = $n . ' [' . $s . ']'; }
                Db::q('UPDATE asociaciones SET servidor_id = ?, nombre = ?, nombre_clave = ?, siglas = ? WHERE id = ?', [$dest, $n, Social::clave($n), $s, $asocId]);
                Db::q('DELETE FROM asociacion_solicitudes WHERE asociacion_id = ?', [$asocId]);   // quienes pidieron entrar se quedan en el otro servidor
                if (self::tabla('festival_instancias')) Db::q("UPDATE festival_instancias SET servidor_id = ? WHERE asociacion_id = ? AND estado = 'abierto'", [$dest, $asocId]);
                if (self::tabla('liga_participantes')) Db::q('UPDATE liga_participantes SET servidor_id = ? WHERE asociacion_id = ?' . (self::tabla('liga_semanas') ? " AND semana NOT IN (SELECT semana FROM liga_semanas WHERE estado = 'cerrada')" : ''), [$dest, $asocId]);
                // coaliciones con asociaciones del otro servidor: la asociación deja las que siguen vigentes
                Db::q('DELETE FROM coalicion_miembros WHERE asociacion_id = ? AND coalicion_id IN (SELECT id FROM coaliciones WHERE fin > ?)', [$asocId, $t]);
            } elseif ($m) {
                $salio = (int) $m['asociacion_id'];
                Db::q('DELETE FROM asociacion_miembros WHERE jugador_id = ?', [$j]);
            }
            Db::q('DELETE FROM asociacion_solicitudes WHERE jugador_id = ?', [$j]);   // pedidos de ingreso a asociaciones del servidor que deja
            Db::q('UPDATE jugadores SET servidor_id = ? WHERE id = ?', [$dest, $j]);
            if (self::tabla('duelo_equipos')) Db::q('UPDATE duelo_equipos SET servidor_id = ? WHERE jugador_id = ?', [$dest, $j]);
            if (self::tabla('duelo_ratings')) Db::q('UPDATE duelo_ratings SET servidor_id = ? WHERE jugador_id = ?' . (($c = self::condicion('duelo_ratings', 'mover_temporada_abierta')) ? " AND $c" : ''), [$dest, $j]);
            if (self::tabla('desafio_intentos')) Db::q('UPDATE desafio_intentos SET servidor_id = ? WHERE jugador_id = ?' . (($c = self::condicion('desafio_intentos', 'mover_dia_abierto')) ? " AND $c" : ''), [$dest, $j]);
            Db::q("INSERT INTO traslados (jugador_id, origen, destino, motivo, alias_antes, alias_nuevo, asociacion_id, asociacion_antes, asociacion_nueva, aviso_visto, creado) VALUES (?, ?, ?, 'voluntario', ?, ?, ?, ?, ?, ?, ?)",
                [$j, $O, $dest, $aliasNuevo !== null ? $yo['alias'] : null, $aliasNuevo, $asocId, $asocAntes, $asocNueva, $t, $t]);
            Auditoria::anotar('jugador:' . $j, 'servidor_traslado', $o['nombre'] . ' -> ' . $d['nombre'] . ($aliasNuevo ? ' · alias: ' . $yo['alias'] . ' -> ' . $aliasNuevo : '')
                . ($asocId ? ' · con su asociación N° ' . $asocId : '') . ($salio ? ' · dejó la asociación N° ' . $salio : ''), $j);
            Chat::sistema($j, '🧳 Te trasladaste a ' . $d['nombre'] . '. Tu progreso, créditos y equipos siguen igual.' . ($aliasNuevo ? ' Tu productora ahora se llama "' . $aliasNuevo . '".' : ''));
            return ['ok' => true, 'servidor' => Social::servidorDe($j), 'alias_nuevo' => $aliasNuevo, 'asociacion' => Social::asociacionDe($j),
                    'dejo_asociacion' => $salio !== null, 'asociacion_renombrada' => $asocNueva, 'proximo_traslado' => Db::iso($t + self::DIAS_TRASLADO * 86400)];
        });
    }

    /** POST /api/servidor/aviso-visto {id?}: cierra el aviso_fusion (todos los del jugador si no viene id). */
    public static function avisoVisto(int $j, array $in): array
    {
        $id = is_int($in['id'] ?? null) ? $in['id'] : null;
        $n = Db::q('UPDATE traslados SET aviso_visto = ? WHERE jugador_id = ? AND aviso_visto IS NULL' . ($id !== null ? ' AND id = ?' : ''), $id !== null ? [time(), $j, $id] : [time(), $j])->rowCount();
        return ['ok' => true, 'cerrados' => $n];
    }

    // ------------------------------------------------------------------ rutas
    /** /api/servidor/opciones (GET), /api/servidor/trasladar (POST), /api/servidor/aviso-visto (POST). null = no es mía. */
    public static function ruta(string $ruta, string $metodo): ?array
    {
        $rutas = ['/servidor/opciones' => 'GET', '/servidor/trasladar' => 'POST', '/servidor/aviso-visto' => 'POST'];
        if (!isset($rutas[$ruta])) return null;
        Fallo::si($metodo !== $rutas[$ruta], 'Usa ' . $rutas[$ruta] . '.', 405, ['codigo' => 'metodo_no_permitido']);
        $j = Sesiones::jugadorId();
        Fallo::si($j === null, 'Entra a tu cuenta para continuar.', 401, ['codigo' => 'sesion_requerida']);
        return match ($ruta) {
            '/servidor/opciones' => self::opciones($j),
            '/servidor/trasladar' => self::trasladar($j, Http::entrada(2000)),
            '/servidor/aviso-visto' => self::avisoVisto($j, Http::entrada(2000)),
        };
    }
}
