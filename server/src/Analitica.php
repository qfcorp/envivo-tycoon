<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Analítica propia de EN VIVO Tycoon (sin SDK de terceros; server/INTEGRAR_ANALITICA.md).
 *  - recibir(): guarda un lote de eventos que manda js/analitica.js (POST /api/eventos, ver AnaliticaApi).
 *    La "instalación" es un número al azar que el juego guarda en el navegador; no se guarda IP ni navegador.
 *    jugador_id sale SOLO de la sesión del servidor. País: cabecera CF-IPCountry (si el sitio está detrás de Cloudflare).
 *  - agregar(): resúmenes por día (bin/analitica.php, el cron): DAU/WAU/MAU, instalaciones nuevas, cuentas nuevas,
 *    retención D1/D7/D30 por cohorte (de instalación y de creación de cuenta), embudo de la guía, primer evento en
 *    10 minutos, pagadores, ingresos (tabla compras), sesiones y su duración. Cada número por plataforma y por país.
 *  - limpiar(): borra los eventos de más de 90 días (y las instalaciones sin uso en 90 días). Los resúmenes quedan.
 * Segmentos: plataforma ('web' | 'android') y país (ISO de 2 letras) son los de la PRIMERA vez que se vio la instalación;
 * '*' = todos y '--' = desconocido. Así las sumas por país o por plataforma cuadran con el total.
 */
final class Analitica
{
    public const RETENCION_DIAS = 90;
    public const MAX_CUERPO = 32768;        // bytes por lote
    public const MAX_LOTE = 50;             // eventos por lote
    public const MAX_DATOS = 1024;          // bytes de "datos" por evento
    public const MAX_CLAVES = 12;            // campos de "datos" por evento
    public const LIMITE_INSTALACION = 40;   // lotes por instalación cada 10 minutos (el juego manda 1 cada 30 s como mucho)
    public const LIMITE_IP = 600;           // lotes por conexión cada 10 minutos (muchos celulares comparten la IP de la operadora)
    public const DIAS_RECALCULO = 35;       // el cron rehace los últimos 35 días (las cohortes de hace 30 días ganan su D30)
    public const NOMBRES = ['app_abierta', 'tutorial_paso', 'evento_iniciado', 'evento_terminado', 'capitulo_completado', 'cuenta_creada',
        'tienda_abierta', 'compra_iniciada', 'compra_aprobada', 'modo_online_abierto', 'sesion_fin'];
    public const PLATAFORMAS = ['web', 'android'];
    /** Pasos de la guía del primer evento (js/guia.js, Guia.estado().paso) en orden. "seguir" se repite y no cuenta. */
    public const PASOS = ['intro', 'clientes', 'evento', 'auto', 'aire', 'elegir', 'terminar', 'resultado', 'fin'];
    /** Metas de retención (el panel las colorea). */
    public const METAS = ['d1' => 0.25, 'd7' => 0.08, 'd30' => 0.03];
    public const DURACION_MAX_S = 4 * 3600;   // una sesión más larga se cuenta como 4 horas (pestaña olvidada)

    private static ?int $reloj = null;

    /** Solo pruebas: congela la hora. */
    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }
    public static function dia(int $t): string { return date('Y-m-d', $t); }
    public static function mover(string $dia, int $n): string { return (new \DateTimeImmutable($dia . ' 12:00'))->modify(($n >= 0 ? '+' : '') . $n . ' day')->format('Y-m-d'); }

    // ------------------------------------------------------------------------------------------ recibir
    /**
     * Guarda un lote. $in = {i: instalación (32 hex), s: sesión (16-32 hex), p: 'web'|'android', v: versión, l: idioma,
     * e: [{n: nombre, t: milisegundos, k: clave al azar (8-16 hex), d: {campo: valor}}]}.
     * Los eventos que no pasan la revisión se descartan (se cuentan en "rechazados"); un sobre malo es 400.
     * @return array{ok:true, aceptados:int, rechazados:int}
     */
    public static function recibir(array $in, ?int $jugador, string $pais = ''): array
    {
        $mal = fn(string $que) => new Fallo('Datos de analítica no válidos (' . $que . ').', 400, ['codigo' => 'analitica_invalida']);
        $inst = $in['i'] ?? null;
        if (!is_string($inst) || !preg_match('/^[a-f0-9]{32}$/', $inst)) throw $mal('instalación');
        $ses = $in['s'] ?? null;
        if (!is_string($ses) || !preg_match('/^[a-f0-9]{16,32}$/', $ses)) throw $mal('sesión');
        $lista = $in['e'] ?? null;
        if (!is_array($lista) || !array_is_list($lista)) throw $mal('eventos');
        $plat = in_array($in['p'] ?? null, self::PLATAFORMAS, true) ? (string) $in['p'] : 'web';
        $ver = is_string($in['v'] ?? null) ? substr((string) preg_replace('/[^\w.\-]/', '', $in['v']), 0, 20) : '';
        $idioma = is_string($in['l'] ?? null) && preg_match('/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/', $in['l']) ? $in['l'] : '';
        $pais = self::pais($pais);
        $ahora = self::ahora();
        $rech = max(0, count($lista) - self::MAX_LOTE);
        $buenos = [];
        foreach (array_slice($lista, 0, self::MAX_LOTE) as $ev) {
            $x = is_array($ev) ? self::evento($ev, $ahora) : null;
            if ($x === null) { $rech++; continue; }
            $buenos[] = $x;
        }
        $nuevos = 0;
        if ($buenos) {
            Db::tx(function () use ($buenos, $inst, $ses, $jugador, $ahora, $plat, $pais, $ver, $idioma, &$nuevos): void {
                $ins = Db::pdo()->prepare('INSERT OR IGNORE INTO eventos (instalacion, sesion, clave, jugador_id, nombre, datos, t, dia, recibido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $min = PHP_INT_MAX; $max = 0;
                foreach ($buenos as [$nombre, $t, $clave, $datos]) {
                    $ins->execute([$inst, $ses, $clave, $jugador, $nombre, $datos, $t, self::dia($t), $ahora]);
                    $nuevos += $ins->rowCount();
                    $min = min($min, $t); $max = max($max, $t);
                }
                Db::q('INSERT INTO analitica_instalaciones (instalacion, primer_t, primer_dia, ultimo_dia, plataforma, pais, version, idioma, jugador_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT (instalacion) DO UPDATE SET
                         primer_dia = CASE WHEN excluded.primer_t < primer_t THEN excluded.primer_dia ELSE primer_dia END,
                         primer_t = MIN(primer_t, excluded.primer_t),
                         ultimo_dia = MAX(ultimo_dia, excluded.ultimo_dia),
                         pais = COALESCE(pais, excluded.pais),
                         version = COALESCE(NULLIF(excluded.version, \'\'), version),
                         idioma = COALESCE(NULLIF(excluded.idioma, \'\'), idioma),
                         jugador_id = COALESCE(excluded.jugador_id, jugador_id)',
                    [$inst, $min, self::dia($min), self::dia($max), $plat, $pais, $ver, $idioma, $jugador]);
            });
        }
        if (random_int(1, 500) === 1) { try { self::limpiar(); } catch (\Throwable) { /* lo hace el cron */ } }
        return ['ok' => true, 'aceptados' => $nuevos, 'rechazados' => $rech];
    }

    /** País ISO de 2 letras (CF-IPCountry) o null ("XX" = desconocido y "T1" = Tor para Cloudflare). */
    public static function pais(string $p): ?string
    {
        $p = strtoupper(trim($p));
        return preg_match('/^[A-Z]{2}$/', $p) && !in_array($p, ['XX', 'T1'], true) ? $p : null;
    }

    /** Un evento revisado: [nombre, t (segundos), clave, datos JSON|null] o null si no sirve. */
    private static function evento(array $ev, int $ahora): ?array
    {
        $n = $ev['n'] ?? null;
        if (!is_string($n) || !(in_array($n, self::NOMBRES, true) || preg_match('/^m_[a-z0-9_]{2,30}$/', $n))) return null;
        $k = $ev['k'] ?? null;
        if (!is_string($k) || !preg_match('/^[a-f0-9]{8,16}$/', $k)) return null;
        // Hora del celular: si está muy en el futuro o es de hace más de 7 días (o no vino), vale la del servidor
        $ms = $ev['t'] ?? null;
        $t = is_int($ms) || (is_float($ms) && is_finite($ms)) ? (int) floor($ms / 1000) : $ahora;
        if ($t > $ahora + 300 || $t < $ahora - 7 * 86400) $t = $ahora;
        $datos = null;
        $d = $ev['d'] ?? null;
        if (is_array($d) && $d !== []) {
            $o = [];
            foreach ($d as $c => $v) {
                if (count($o) >= self::MAX_CLAVES) break;
                if (!is_string($c) || !preg_match('/^[a-z0-9_]{1,24}$/', $c)) continue;
                if (is_string($v)) $o[$c] = mb_substr((string) preg_replace('/[\x00-\x1F\x7F]/u', '', $v), 0, 80);
                elseif (is_int($v) || is_bool($v)) $o[$c] = $v;
                elseif (is_float($v) && is_finite($v)) $o[$c] = round($v, 4);
            }
            if ($o) {
                $j = json_encode($o, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $datos = is_string($j) && strlen($j) <= self::MAX_DATOS ? $j : null;
            }
        }
        return [$n, $t, $k, $datos];
    }

    // ------------------------------------------------------------------------------------------ limpiar
    /** Borra eventos de más de 90 días y las instalaciones que no se usan hace 90 días. Devuelve [eventos, instalaciones]. */
    public static function limpiar(): array
    {
        $corte = self::ahora() - self::RETENCION_DIAS * 86400;
        $e = Db::q('DELETE FROM eventos WHERE t < ?', [$corte])->rowCount();
        $i = Db::q('DELETE FROM analitica_instalaciones WHERE ultimo_dia < ?', [self::dia($corte)])->rowCount();
        return [$e, $i];
    }

    // ------------------------------------------------------------------------------------------ agregar
    /**
     * Rehace los resúmenes de los últimos $dias días hasta $hoy (incluido; por defecto hoy). Un día "termina" a medianoche
     * (ENVIVO_ZONA): D1/D7/D30 de una cohorte solo se guardan cuando ese día ya terminó (antes quedan NULL).
     * @return array{dias:int, desde:string, hasta:string, segundos:float}
     */
    public static function agregar(int $dias = self::DIAS_RECALCULO, ?string $hoy = null): array
    {
        $ini = microtime(true);
        $hoy ??= self::dia(self::ahora());
        $dias = max(1, min(400, $dias));
        $desde = self::mover($hoy, -($dias - 1));
        $mapa = self::mapaJugadores();
        for ($d = $desde; $d <= $hoy; $d = self::mover($d, 1)) {
            $filaDia = self::calcularDia($d, $mapa);
            $coh = self::calcularCohortes($d, $hoy, $mapa);
            $emb = self::calcularEmbudo($d);
            Db::tx(function () use ($d, $filaDia, $coh, $emb): void {
                $t = self::ahora();
                Db::q('DELETE FROM analitica_dia WHERE dia = ?', [$d]);
                $ins = Db::pdo()->prepare('INSERT INTO analitica_dia (dia, plataforma, pais, dau, wau, mau, nuevas, cuentas_nuevas, sesiones, sesiones_medidas, duracion_total_s,
                    pagadores, compras, ingresos, primer_evento_10m, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($filaDia as $seg => $v) {
                    [$p, $c] = explode('|', $seg);
                    $ins->execute([$d, $p, $c, $v['dau'], $v['wau'], $v['mau'], $v['nuevas'], $v['cuentas_nuevas'], $v['sesiones'], $v['sesiones_medidas'], $v['duracion_total_s'],
                        $v['pagadores'], $v['compras'], round($v['ingresos'], 2), $v['primer_evento_10m'], $t]);
                }
                Db::q('DELETE FROM analitica_cohortes WHERE cohorte = ?', [$d]);
                $ins = Db::pdo()->prepare('INSERT INTO analitica_cohortes (tipo, cohorte, plataforma, pais, tamano, d1, d7, d30, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($coh as $tipo => $segs) foreach ($segs as $seg => $v) {
                    [$p, $c] = explode('|', $seg);
                    $ins->execute([$tipo, $d, $p, $c, $v['tamano'], $v['d1'], $v['d7'], $v['d30'], $t]);
                }
                Db::q('DELETE FROM analitica_embudo WHERE cohorte = ?', [$d]);
                $ins = Db::pdo()->prepare('INSERT INTO analitica_embudo (cohorte, plataforma, pais, paso, instalaciones) VALUES (?, ?, ?, ?, ?)');
                foreach ($emb as $seg => $pasos) {
                    [$p, $c] = explode('|', $seg);
                    foreach ($pasos as $paso => $n) $ins->execute([$d, $p, $c, $paso, $n]);
                }
            });
        }
        $limp = self::limpiar();
        $r = ['dias' => $dias, 'desde' => $desde, 'hasta' => $hoy, 'segundos' => round(microtime(true) - $ini, 2), 'borrados' => $limp[0]];
        Db::q('INSERT INTO analitica_meta (clave, valor) VALUES (\'ultima\', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor',
            [json_encode($r + ['en' => self::ahora()], JSON_UNESCAPED_UNICODE)]);
        return $r;
    }

    /** Última agregación (o null): {dias, desde, hasta, segundos, en}. */
    public static function ultima(): ?array
    {
        $v = Db::valor("SELECT valor FROM analitica_meta WHERE clave = 'ultima'");
        $j = is_string($v) ? json_decode($v, true) : null;
        return is_array($j) ? $j : null;
    }

    /** Suma $v en los 4 segmentos de (plataforma, país): exacto, solo plataforma, solo país y total. */
    private static function sumar(array &$acc, string $p, string $c, string $campo, float|int $v): void
    {
        foreach (["$p|$c", "$p|*", "*|$c", '*|*'] as $k) $acc[$k][$campo] = ($acc[$k][$campo] ?? 0) + $v;
    }

    /** Cuenta distintos por los 4 segmentos con SQL. $sql lleva {P} y {C} en el SELECT y el GROUP BY. */
    private static function distintos(string $sql, array $params): array
    {
        $o = [];
        foreach ([["'*'", "'*'"], ['i.plataforma', "'*'"], ["'*'", "COALESCE(i.pais, '--')"], ['i.plataforma', "COALESCE(i.pais, '--')"]] as [$P, $C]) {
            foreach (Db::todas(str_replace(['{P}', '{C}'], [$P, $C], $sql), $params) as $f) $o[$f['p'] . '|' . $f['c']] = (int) $f['n'];
        }
        return $o;
    }

    /** jugador_id => [plataforma, país] de su primera instalación conocida. */
    private static function mapaJugadores(): array
    {
        $o = [];
        foreach (Db::todas('SELECT jugador_id, plataforma, COALESCE(pais, \'--\') AS pais FROM analitica_instalaciones WHERE jugador_id IS NOT NULL ORDER BY primer_t DESC') as $f) {
            $o[(int) $f['jugador_id']] = [(string) $f['plataforma'], (string) $f['pais']];   // DESC: la más antigua queda al final
        }
        return $o;
    }

    private const CAMPOS_DIA = ['dau', 'wau', 'mau', 'nuevas', 'cuentas_nuevas', 'sesiones', 'sesiones_medidas', 'duracion_total_s', 'pagadores', 'compras', 'ingresos', 'primer_evento_10m'];

    /** Números de un día por segmento ("plataforma|país" => campos). */
    private static function calcularDia(string $d, array $mapa): array
    {
        $acc = [];
        $base = 'SELECT {P} AS p, {C} AS c, COUNT(DISTINCT e.%s) AS n FROM eventos e JOIN analitica_instalaciones i ON i.instalacion = e.instalacion WHERE %s GROUP BY 1, 2';
        foreach ([['dau', 'e.dia = ?', [$d]], ['wau', 'e.dia BETWEEN ? AND ?', [self::mover($d, -6), $d]], ['mau', 'e.dia BETWEEN ? AND ?', [self::mover($d, -29), $d]]] as [$campo, $w, $par]) {
            foreach (self::distintos(sprintf($base, 'instalacion', $w), $par) as $k => $n) $acc[$k][$campo] = $n;
        }
        foreach (self::distintos(sprintf($base, 'sesion', 'e.dia = ?'), [$d]) as $k => $n) $acc[$k]['sesiones'] = $n;
        // Instalaciones nuevas y las que terminaron su primer evento en menos de 10 minutos
        foreach (Db::todas('SELECT i.plataforma, COALESCE(i.pais, \'--\') AS pais,
                (SELECT 1 FROM eventos e WHERE e.instalacion = i.instalacion AND e.nombre = \'evento_terminado\' AND e.t <= i.primer_t + 600 LIMIT 1) AS rapido
                FROM analitica_instalaciones i WHERE i.primer_dia = ?', [$d]) as $f) {
            self::sumar($acc, $f['plataforma'], $f['pais'], 'nuevas', 1);
            if ($f['rapido']) self::sumar($acc, $f['plataforma'], $f['pais'], 'primer_evento_10m', 1);
        }
        // Duración: de cada sesión vale el sesion_fin más largo (el juego manda el acumulado cada vez que se esconde)
        foreach (Db::todas('SELECT i.plataforma, COALESCE(i.pais, \'--\') AS pais, MAX(CAST(json_extract(e.datos, \'$.duracion_s\') AS INTEGER)) AS s
                FROM eventos e JOIN analitica_instalaciones i ON i.instalacion = e.instalacion WHERE e.dia = ? AND e.nombre = \'sesion_fin\' GROUP BY e.sesion', [$d]) as $f) {
            $s = (int) $f['s'];
            if ($s <= 0) continue;
            self::sumar($acc, $f['plataforma'], $f['pais'], 'sesiones_medidas', 1);
            self::sumar($acc, $f['plataforma'], $f['pais'], 'duracion_total_s', min($s, self::DURACION_MAX_S));
        }
        [$t0, $t1] = self::limitesDia($d);
        // Cuentas nuevas (todas las de jugadores, aunque no tengan analítica: van como '--')
        foreach (Db::todas("SELECT id FROM jugadores WHERE creado >= ? AND creado < ? AND estado <> 'borrado'", [$t0, $t1]) as $f) {
            [$p, $c] = $mapa[(int) $f['id']] ?? ['--', '--'];
            self::sumar($acc, $p, $c, 'cuentas_nuevas', 1);
        }
        // Compras pagadas ese día (tabla compras). Sin instalación conocida: la plataforma sale del canal.
        $pag = [];
        foreach (Db::todas("SELECT jugador_id, total, canal FROM compras WHERE estado = 'pagado' AND pagado_en >= ? AND pagado_en < ?", [$t0, $t1]) as $f) {
            $j = (int) $f['jugador_id'];
            [$p, $c] = $mapa[$j] ?? [($f['canal'] ?? '') === 'google_play' ? 'android' : 'web', '--'];
            self::sumar($acc, $p, $c, 'compras', 1);
            self::sumar($acc, $p, $c, 'ingresos', (float) $f['total']);
            foreach (["$p|$c", "$p|*", "*|$c", '*|*'] as $k) $pag[$k][$j] = true;
        }
        foreach ($pag as $k => $js) $acc[$k]['pagadores'] = count($js);
        $o = [];
        foreach ($acc as $k => $v) {
            $o[$k] = array_fill_keys(self::CAMPOS_DIA, 0);
            foreach ($v as $c => $x) $o[$k][$c] = $c === 'ingresos' ? (float) $x : (int) $x;
        }
        $o['*|*'] ??= array_fill_keys(self::CAMPOS_DIA, 0);   // el total existe siempre (días sin nada = 0)
        return $o;
    }

    /** [inicio, fin) del día en segundos (zona del juego). */
    public static function limitesDia(string $d): array
    {
        $a = (new \DateTimeImmutable($d . ' 00:00:00'))->getTimestamp();
        return [$a, (new \DateTimeImmutable(self::mover($d, 1) . ' 00:00:00'))->getTimestamp()];
    }

    /** Cohortes del día $d: ['instalacion' => [seg => {tamano, d1, d7, d30}], 'cuenta' => [...]]. */
    private static function calcularCohortes(string $d, string $hoy, array $mapa): array
    {
        $o = ['instalacion' => [], 'cuenta' => []];
        $listo = fn(int $n) => self::mover($d, $n) < $hoy;   // ese día ya terminó
        // Por instalación
        $vuelve = [];
        foreach ([1, 7, 30] as $n) {
            if (!$listo($n)) continue;
            foreach (Db::todas('SELECT DISTINCT e.instalacion FROM eventos e JOIN analitica_instalaciones i ON i.instalacion = e.instalacion WHERE i.primer_dia = ? AND e.dia = ?', [$d, self::mover($d, $n)]) as $f) $vuelve[$n][$f['instalacion']] = true;
        }
        foreach (Db::todas('SELECT instalacion, plataforma, COALESCE(pais, \'--\') AS pais FROM analitica_instalaciones WHERE primer_dia = ?', [$d]) as $f) {
            self::sumarCohorte($o['instalacion'], $f['plataforma'], $f['pais'], $vuelve, $f['instalacion'], $listo);
        }
        // Por cuenta (jugadores.creado ese día; "volvió" = algún evento con su jugador_id ese día)
        [$t0, $t1] = self::limitesDia($d);
        $vuelve = [];
        foreach ([1, 7, 30] as $n) {
            if (!$listo($n)) continue;
            foreach (Db::todas("SELECT DISTINCT e.jugador_id FROM eventos e JOIN jugadores j ON j.id = e.jugador_id WHERE j.creado >= ? AND j.creado < ? AND e.dia = ?", [$t0, $t1, self::mover($d, $n)]) as $f) $vuelve[$n][(int) $f['jugador_id']] = true;
        }
        foreach (Db::todas("SELECT id FROM jugadores WHERE creado >= ? AND creado < ? AND estado <> 'borrado'", [$t0, $t1]) as $f) {
            [$p, $c] = $mapa[(int) $f['id']] ?? ['--', '--'];
            self::sumarCohorte($o['cuenta'], $p, $c, $vuelve, (int) $f['id'], $listo);
        }
        return $o;
    }

    private static function sumarCohorte(array &$acc, string $p, string $c, array $vuelve, string|int $quien, callable $listo): void
    {
        foreach (["$p|$c", "$p|*", "*|$c", '*|*'] as $k) {
            $acc[$k] ??= ['tamano' => 0, 'd1' => $listo(1) ? 0 : null, 'd7' => $listo(7) ? 0 : null, 'd30' => $listo(30) ? 0 : null];
            $acc[$k]['tamano']++;
            foreach ([1, 7, 30] as $n) if (isset($vuelve[$n][$quien])) $acc[$k]['d' . $n]++;
        }
    }

    /** Embudo de la cohorte de instalación $d: seg => [paso => instalaciones] (pasos de la guía + primer evento). */
    private static function calcularEmbudo(string $d): array
    {
        $acc = [];
        $filas = Db::todas('SELECT i.instalacion, i.plataforma, COALESCE(i.pais, \'--\') AS pais, i.primer_t,
                (SELECT GROUP_CONCAT(DISTINCT json_extract(e.datos, \'$.paso\')) FROM eventos e WHERE e.instalacion = i.instalacion AND e.nombre = \'tutorial_paso\') AS pasos,
                (SELECT MIN(e.t) FROM eventos e WHERE e.instalacion = i.instalacion AND e.nombre = \'evento_terminado\') AS primer_ev
                FROM analitica_instalaciones i WHERE i.primer_dia = ?', [$d]);
        foreach ($filas as $f) {
            $vistos = array_flip(array_filter(explode(',', (string) $f['pasos'])));
            $pasos = ['instalaciones' => 1];
            foreach (self::PASOS as $p) $pasos['guia_' . $p] = isset($vistos[$p]) ? 1 : 0;
            $pasos['primer_evento'] = $f['primer_ev'] !== null ? 1 : 0;
            $pasos['primer_evento_10m'] = $f['primer_ev'] !== null && (int) $f['primer_ev'] <= (int) $f['primer_t'] + 600 ? 1 : 0;
            foreach ($pasos as $k => $v) self::sumar($acc, $f['plataforma'], $f['pais'], $k, $v);
        }
        return $acc;
    }

    // ------------------------------------------------------------------------------------------ lecturas (panel)
    /** Filas de analitica_dia del segmento entre $desde y $hasta (por día; los que faltan van en 0). */
    public static function dias(string $desde, string $hasta, string $plat = '*', string $pais = '*'): array
    {
        $o = [];
        for ($d = $desde; $d <= $hasta; $d = self::mover($d, 1)) $o[$d] = array_fill_keys(self::CAMPOS_DIA, 0) + ['dia' => $d];
        foreach (Db::todas('SELECT * FROM analitica_dia WHERE dia BETWEEN ? AND ? AND plataforma = ? AND pais = ?', [$desde, $hasta, $plat, $pais]) as $f) {
            if (!isset($o[$f['dia']])) continue;
            foreach (self::CAMPOS_DIA as $c) $o[$f['dia']][$c] = $c === 'ingresos' ? (float) $f[$c] : (int) $f[$c];
        }
        return $o;
    }

    /** Cohortes (más nuevas primero) del segmento. */
    public static function cohortes(string $tipo, string $desde, string $hasta, string $plat = '*', string $pais = '*'): array
    {
        return Db::todas('SELECT cohorte, tamano, d1, d7, d30 FROM analitica_cohortes WHERE tipo = ? AND cohorte BETWEEN ? AND ? AND plataforma = ? AND pais = ? ORDER BY cohorte DESC',
            [$tipo, $desde, $hasta, $plat, $pais]);
    }

    /** Embudo sumado de las cohortes entre $desde y $hasta: paso => instalaciones (en el orden del embudo). */
    public static function embudo(string $desde, string $hasta, string $plat = '*', string $pais = '*'): array
    {
        $orden = ['instalaciones', ...array_map(fn($p) => 'guia_' . $p, self::PASOS), 'primer_evento', 'primer_evento_10m'];
        $o = array_fill_keys($orden, 0);
        foreach (Db::todas('SELECT paso, SUM(instalaciones) AS n FROM analitica_embudo WHERE cohorte BETWEEN ? AND ? AND plataforma = ? AND pais = ? GROUP BY paso', [$desde, $hasta, $plat, $pais]) as $f) {
            if (isset($o[$f['paso']])) $o[$f['paso']] = (int) $f['n'];
        }
        return $o;
    }

    /** Países y plataformas que aparecen en los resúmenes (para los filtros). */
    public static function segmentos(): array
    {
        return [
            'plataformas' => array_map('strval', array_column(Db::todas("SELECT DISTINCT plataforma FROM analitica_dia WHERE plataforma <> '*' ORDER BY plataforma"), 'plataforma')),
            'paises' => array_map('strval', array_column(Db::todas("SELECT pais, SUM(dau) AS n FROM analitica_dia WHERE pais <> '*' AND plataforma = '*' GROUP BY pais ORDER BY n DESC, pais LIMIT 60"), 'pais')),
        ];
    }
}
