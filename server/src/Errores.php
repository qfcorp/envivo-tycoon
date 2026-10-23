<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Errores del juego en los celulares (js/errores.js manda lotes a POST /api/error). Sin servicios de terceros.
 *  - Cada error se limpia (sin correos, números largos ni parámetros de direcciones), se recorta y se agrupa por
 *    "huella" = mensaje normalizado (números -> 0) + archivo + línea, con total, primera y última vez.
 *  - Límites: 30 errores por hora y por IP, 3000 por hora entre todos, 10 por lote, 32 KB por petición.
 *  - "Marcar resuelto" (Centro de Control > Errores) guarda la versión más nueva en que se vio; si vuelve a pasar en una
 *    versión MÁS NUEVA, el grupo se reabre (si llega de celulares con la versión vieja, no).
 *  - Errores::limpiar() borra lo de más de 30 días (server/bin/errores.php, cron diario).
 * Tablas: src/migraciones/errores.sql. Integración: server/INTEGRAR_ERRORES.md
 */
final class Errores
{
    public const LIMITE_IP_HORA = 30;
    public const LIMITE_TODOS_HORA = 3000;
    public const MAX_LOTE = 10;
    public const MAX_CUERPO = 32768;
    public const DIAS = 30;
    public const PLATAFORMAS = ['web', 'android', 'pwa'];
    public const TIPOS = ['error', 'promesa', 'manual'];
    /** Largo máximo de cada campo (caracteres). */
    public const LARGOS = ['mensaje' => 500, 'pila' => 2048, 'archivo' => 200, 'url' => 300, 'version' => 40, 'idioma' => 12,
        'memoria' => 60, 'conexion' => 60, 'ultimo_paso' => 400, 'contexto' => 120];

    /** Cuántas veces tiene que pasar un grupo NUEVO (primera vez en las últimas 24 h) para avisar en el Resumen. */
    public static function umbral(): int
    {
        $n = (int) Config::get('ERRORES_ALERTA', '5');
        return $n > 0 ? min($n, 100000) : 5;
    }

    // ------------------------------------------------------------------------------------------ recibir
    /**
     * Guarda un lote (lista de errores ya decodificada). Devuelve cuántos se guardaron y cuántos se descartaron.
     * $limitado = true si se llegó al límite por IP o global (los que sobran no se guardan).
     * @return array{guardados: int, descartados: int, limitado: bool}
     */
    public static function registrar(array $lote, ?int $jugador, string $ip, string $navegador = '', string $host = ''): array
    {
        $guardados = 0; $descartados = 0; $limitado = false;
        $lote = array_values(array_filter($lote, 'is_array'));
        $descartados += max(0, count($lote) - self::MAX_LOTE);
        $lote = array_slice($lote, 0, self::MAX_LOTE);
        $ipHuella = self::huellaIp($ip);
        $nav = self::navegadorCorto($navegador);
        $vistos = [];
        foreach ($lote as $e) {
            $f = self::normalizar($e, $host);
            if ($f === null) { $descartados++; continue; }
            $h = self::huella($f['mensaje'], $f['archivo'], $f['linea']);
            if (isset($vistos[$h]) && $vistos[$h] >= 3) { $descartados++; continue; }   // el mismo error repetido en un lote: máximo 3
            if (Limite::excedido('errores:ip:' . $ip, self::LIMITE_IP_HORA, 60) || Limite::excedido('errores:todos', self::LIMITE_TODOS_HORA, 60)) {
                $limitado = true;
                $descartados++;
                continue;
            }
            Limite::sumar('errores:ip:' . $ip);
            Limite::sumar('errores:todos');
            $vistos[$h] = ($vistos[$h] ?? 0) + 1;
            self::guardar($h, $f, $jugador, $ipHuella, $nav);
            $guardados++;
        }
        return ['guardados' => $guardados, 'descartados' => $descartados, 'limitado' => $limitado];
    }

    /** ¿Esta IP ya pasó el límite de la hora? (para responder 429 sin leer nada) */
    public static function limitado(string $ip): bool
    {
        return Limite::excedido('errores:ip:' . $ip, self::LIMITE_IP_HORA, 60) || Limite::excedido('errores:todos', self::LIMITE_TODOS_HORA, 60);
    }

    private static function guardar(string $huella, array $f, ?int $jugador, string $ipHuella, string $nav): void
    {
        $t = time();
        Db::tx(function () use ($huella, $f, $jugador, $ipHuella, $nav, $t): void {
            $g = Db::fila('SELECT id, resuelto, version_resuelto FROM errores_grupos WHERE huella = ?', [$huella]);
            if (!$g) {
                Db::q('INSERT INTO errores_grupos (huella, mensaje, archivo, linea, total, primero, ultimo) VALUES (?, ?, ?, ?, 1, ?, ?)',
                    [$huella, $f['mensaje'], $f['archivo'], $f['linea'], $t, $t]);
                $id = Db::ultimoId();
            } else {
                $id = (int) $g['id'];
                $reabrir = $g['resuelto'] !== null && $f['version'] !== '' && strnatcmp($f['version'], (string) $g['version_resuelto']) > 0;
                Db::q('UPDATE errores_grupos SET total = total + 1, ultimo = ?' . ($reabrir ? ', resuelto = NULL, reabierto = ?' : '') . ' WHERE id = ?',
                    $reabrir ? [$t, $t, $id] : [$t, $id]);
            }
            $jug = $jugador !== null && Db::valor('SELECT 1 FROM jugadores WHERE id = ?', [$jugador]) ? $jugador : null;
            Db::q('INSERT INTO errores_cliente (grupo_id, creado, mensaje, pila, archivo, linea, columna, url, version, idioma, plataforma, memoria, conexion, ultimo_paso, contexto, tipo, navegador, jugador_id, ip_huella)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $t, $f['mensaje'], $f['pila'], $f['archivo'], $f['linea'], $f['columna'], $f['url'], $f['version'], $f['idioma'], $f['plataforma'],
                 $f['memoria'], $f['conexion'], $f['ultimo_paso'], $f['contexto'], $f['tipo'], $nav, $jug, $ipHuella]);
        });
    }

    /** Huella del grupo: mensaje normalizado (números -> 0, espacios juntos, minúsculas) + archivo + línea. */
    public static function huella(string $mensaje, string $archivo, int $linea): string
    {
        $m = mb_strtolower(trim((string) preg_replace(['/\d+/', '/\s+/u'], ['0', ' '], $mensaje)));
        return substr(hash('sha256', $m . '|' . $archivo . '|' . $linea), 0, 40);
    }

    /**
     * Un error que llegó del juego -> fila limpia (o null si no sirve). Nada de datos personales: sin correos, sin números
     * largos (tarjetas, teléfonos), direcciones sin parámetros (salvo origen=android) y la lista de pasos sin textos.
     */
    public static function normalizar(array $e, string $host = ''): ?array
    {
        $txt = fn(string $k): string => is_scalar($e[$k] ?? null) ? (string) $e[$k] : '';
        $num = function (string $k) use ($e): int {
            $v = $e[$k] ?? 0;
            return is_int($v) || (is_string($v) && preg_match('/^\d{1,9}$/', $v)) || (is_float($v) && is_finite($v)) ? max(0, min(99999999, (int) $v)) : 0;
        };
        $mensaje = self::recortar(self::privado($txt('mensaje')), 'mensaje');
        if ($mensaje === '') return null;
        $pasos = $e['ultimo_paso'] ?? [];
        if (is_string($pasos)) $pasos = explode(' > ', $pasos);
        $pasos = is_array($pasos) ? array_slice(array_values(array_filter(array_map(
            fn($p) => is_string($p) ? mb_substr((string) preg_replace('/[^\w\-.:=#\[\]\/ ]+/u', '', self::privado($p)), 0, 60) : '', $pasos), fn($p) => $p !== '')), -6) : [];
        $plat = $txt('plataforma');
        $tipo = $txt('tipo');
        return [
            'mensaje' => $mensaje,
            'pila' => self::recortar(self::privado(self::sinSitio(self::sinParametros($txt('pila')), $host)), 'pila'),
            'archivo' => self::recortar(self::archivo($txt('archivo'), $host), 'archivo'),
            'linea' => $num('linea'),
            'columna' => $num('columna'),
            'url' => self::recortar(self::url($txt('url')), 'url'),
            'version' => self::recortar((string) preg_replace('/[^\w.\-+]/', '', $txt('version')), 'version'),
            'idioma' => self::recortar((string) preg_replace('/[^A-Za-z\-]/', '', $txt('idioma')), 'idioma'),
            'plataforma' => in_array($plat, self::PLATAFORMAS, true) ? $plat : 'web',
            'memoria' => self::recortar((string) preg_replace('/[^\w .\/,:=-]/', '', $txt('memoria')), 'memoria'),
            'conexion' => self::recortar((string) preg_replace('/[^\w .\/,:=-]/', '', $txt('conexion')), 'conexion'),
            'ultimo_paso' => self::recortar(implode(' > ', $pasos), 'ultimo_paso'),
            'contexto' => self::recortar(self::privado($txt('contexto')), 'contexto'),
            'tipo' => in_array($tipo, self::TIPOS, true) ? $tipo : 'error',
        ];
    }

    private static function recortar(string $s, string $campo): string
    {
        $s = trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', mb_convert_encoding($s, 'UTF-8', 'UTF-8')));
        return mb_substr($s, 0, self::LARGOS[$campo] ?? 200);
    }

    /** Quita correos, números largos y valores de "clave=..." / "token=..." de un texto. */
    public static function privado(string $s): string
    {
        $s = (string) preg_replace('/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/', '[correo]', $s);
        $s = (string) preg_replace('/\b\d(?:[ \-]?\d){11,}\b/', '[número]', $s);
        $s = (string) preg_replace('/\b(clave|password|pass|token|secret|secreto|codigo|code)=([^&\s"\']+)/i', '$1=[oculto]', $s);
        return $s;
    }

    /** La dirección de este sitio fuera de la pila ("https://juego.tukanec.com/js/ui.js:10:5" -> "/js/ui.js:10:5"). */
    public static function sinSitio(string $s, string $host): string
    {
        return $host === '' ? $s : str_ireplace(['https://' . $host . '/', 'http://' . $host . '/'], '/', $s);
    }

    /** Direcciones dentro de un texto (la pila) sin "?..." ni "#...". */
    public static function sinParametros(string $s): string
    {
        return (string) preg_replace('#((?:https?|file|blob)://[^\s?\#)]*)[?\#][^\s):]*#', '$1', $s);
    }

    /** Dirección de la página: solo la ruta (más ?origen=android si venía). */
    public static function url(string $u): string
    {
        if ($u === '') return '';
        $p = parse_url($u);
        if ($p === false) return '';
        $ruta = (string) ($p['path'] ?? '/');
        $q = [];
        parse_str((string) ($p['query'] ?? ''), $q);
        return $ruta . (($q['origen'] ?? null) === 'android' ? '?origen=android' : '');
    }

    /** Archivo del error: ruta si es de este sitio (o no trae dominio); si es de otro sitio, el dominio + ruta. */
    public static function archivo(string $a, string $host = ''): string
    {
        if ($a === '') return '';
        $p = parse_url($a);
        if ($p === false) return '';
        $ruta = (string) ($p['path'] ?? '');
        if (!isset($p['host'])) return isset($p['scheme']) ? $p['scheme'] . ':' . $ruta : $ruta;
        $h = strtolower((string) $p['host']) . (isset($p['port']) ? ':' . $p['port'] : '');
        return ($host !== '' && $h === strtolower($host)) ? $ruta : ($p['scheme'] ?? 'http') . '://' . $h . $ruta;
    }

    /** IP -> huella corta (sirve para contar a cuántos les pasa, sin guardar la IP). */
    public static function huellaIp(string $ip): string
    {
        if ($ip === '') return '';
        $sal = Config::get('ENVIVO_ADMIN_CLAVE_HASH', '') . '|' . Config::db();
        return substr(hash_hmac('sha256', $ip, 'envivo-errores|' . $sal), 0, 16);
    }

    /** "Chrome 129 · Android" (sin la cadena entera del navegador). */
    public static function navegadorCorto(string $ua): string
    {
        if ($ua === '') return '';
        $nav = match (true) {
            (bool) preg_match('#EdgA?/(\d+)#', $ua, $m) => 'Edge ' . $m[1],
            (bool) preg_match('#SamsungBrowser/(\d+)#', $ua, $m) => 'Samsung ' . $m[1],
            (bool) preg_match('#Firefox/(\d+)#', $ua, $m) => 'Firefox ' . $m[1],
            (bool) preg_match('#(?:Chrome|CriOS)/(\d+)#', $ua, $m) => 'Chrome ' . $m[1],
            (bool) preg_match('#Version/(\d+)[\d.]* .*Safari#', $ua, $m) => 'Safari ' . $m[1],
            default => 'Otro',
        };
        $so = match (true) {
            str_contains($ua, 'Android') => 'Android',
            (bool) preg_match('/iPhone|iPad|iPod/', $ua) => 'iOS',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Mac OS') => 'Mac',
            str_contains($ua, 'Linux') => 'Linux',
            default => '',
        };
        return $nav . ($so !== '' ? ' · ' . $so : '');
    }

    // ------------------------------------------------------------------------------------------ limpiar
    /** Borra las ocurrencias de más de $dias días y los grupos que ya no tienen ninguna. */
    public static function limpiar(int $dias = self::DIAS): array
    {
        $corte = time() - max(1, $dias) * 86400;
        return Db::tx(function () use ($corte): array {
            $o = Db::q('DELETE FROM errores_cliente WHERE creado < ?', [$corte])->rowCount();
            $g = Db::q('DELETE FROM errores_grupos WHERE ultimo < ? AND NOT EXISTS (SELECT 1 FROM errores_cliente c WHERE c.grupo_id = errores_grupos.id)', [$corte])->rowCount();
            return ['ocurrencias' => $o, 'grupos' => $g];
        });
    }

    // ------------------------------------------------------------------------------------------ panel
    /**
     * Grupos con ocurrencias desde $desde, los que más pasaron primero.
     * @return list<array> con id, mensaje, archivo, linea, total, primero, ultimo, resuelto, reabierto, n (en el período),
     *         afectados (IPs distintas), versiones, plataformas
     */
    public static function grupos(int $desde, bool $conResueltos = false, int $limite = 50): array
    {
        $filas = Db::todas('SELECT g.*, COUNT(c.id) AS n, COUNT(DISTINCT c.ip_huella) AS afectados, GROUP_CONCAT(DISTINCT c.version) AS versiones, GROUP_CONCAT(DISTINCT c.plataforma) AS plataformas
            FROM errores_grupos g JOIN errores_cliente c ON c.grupo_id = g.id AND c.creado >= ?'
            . ($conResueltos ? '' : ' WHERE g.resuelto IS NULL') . ' GROUP BY g.id ORDER BY n DESC, g.ultimo DESC LIMIT ' . max(1, min($limite, 500)), [$desde]);
        foreach ($filas as &$f) {
            foreach (['versiones', 'plataformas'] as $k) {
                $v = array_values(array_filter(explode(',', (string) $f[$k]), fn($x) => $x !== ''));
                usort($v, fn($a, $b) => strnatcmp($b, $a));
                $f[$k] = $v;
            }
        }
        return $filas;
    }

    /** Un grupo con su detalle: última pila, desglose por versión / plataforma / idioma / navegador y las últimas ocurrencias. */
    public static function grupo(int $id, int $ultimas = 20): ?array
    {
        $g = Db::fila('SELECT * FROM errores_grupos WHERE id = ?', [$id]);
        if (!$g) return null;
        $por = fn(string $col) => Db::todas("SELECT $col AS valor, COUNT(*) AS n, MAX(creado) AS ultimo FROM errores_cliente WHERE grupo_id = ? GROUP BY $col ORDER BY n DESC LIMIT 20", [$id]);
        $g['por_version'] = $por('version');
        $g['por_plataforma'] = $por('plataforma');
        $g['por_idioma'] = $por('idioma');
        $g['por_navegador'] = $por('navegador');
        $g['afectados'] = (int) Db::valor("SELECT COUNT(DISTINCT ip_huella) FROM errores_cliente WHERE grupo_id = ? AND ip_huella <> ''", [$id]);
        $g['jugadores'] = (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM errores_cliente WHERE grupo_id = ? AND jugador_id IS NOT NULL', [$id]);
        $g['n24'] = (int) Db::valor('SELECT COUNT(*) FROM errores_cliente WHERE grupo_id = ? AND creado >= ?', [$id, time() - 86400]);
        $g['n7'] = (int) Db::valor('SELECT COUNT(*) FROM errores_cliente WHERE grupo_id = ? AND creado >= ?', [$id, time() - 7 * 86400]);
        $g['ultimas'] = Db::todas('SELECT * FROM errores_cliente WHERE grupo_id = ? ORDER BY id DESC LIMIT ' . max(1, min($ultimas, 200)), [$id]);
        $g['pila'] = (string) (Db::valor("SELECT pila FROM errores_cliente WHERE grupo_id = ? AND pila <> '' ORDER BY id DESC LIMIT 1", [$id]) ?: '');
        return $g;
    }

    /** Marca resuelto (con la versión más nueva en que se vio). Devuelve el grupo antes del cambio. */
    public static function resolver(int $id, string $quien, string $nota = ''): array
    {
        $nota = mb_substr(trim((string) preg_replace('/\s+/u', ' ', $nota)), 0, 300);
        return Db::tx(function () use ($id, $quien, $nota): array {
            $g = Db::fila('SELECT * FROM errores_grupos WHERE id = ?', [$id]);
            Fallo::si(!$g, 'Ese grupo de errores no existe (quizá ya se borró por tener más de 30 días).', 404);
            Fallo::si($g['resuelto'] !== null, 'Ese error ya está marcado como resuelto.', 409);
            $vers = array_column(Db::todas("SELECT DISTINCT version FROM errores_cliente WHERE grupo_id = ? AND version <> ''", [$id]), 'version');
            usort($vers, 'strnatcmp');
            $max = $vers ? (string) end($vers) : '';
            Db::q('UPDATE errores_grupos SET resuelto = ?, resuelto_por = ?, nota = ?, version_resuelto = ? WHERE id = ?', [time(), mb_substr($quien, 0, 80), $nota !== '' ? $nota : null, $max, $id]);
            Auditoria::anotar($quien, 'errores_resolver', 'Grupo N° ' . $id . ' marcado resuelto (visto hasta ' . ($max !== '' ? $max : 'versión desconocida') . ', ' . (int) $g['total'] . ' veces): '
                . mb_substr((string) $g['mensaje'], 0, 200) . ($nota !== '' ? ' · Nota: ' . $nota : ''));
            return $g;
        });
    }

    public static function reabrir(int $id, string $quien): array
    {
        return Db::tx(function () use ($id, $quien): array {
            $g = Db::fila('SELECT * FROM errores_grupos WHERE id = ?', [$id]);
            Fallo::si(!$g, 'Ese grupo de errores no existe.', 404);
            Fallo::si($g['resuelto'] === null, 'Ese error no está marcado como resuelto.', 409);
            Db::q('UPDATE errores_grupos SET resuelto = NULL, version_resuelto = NULL, reabierto = ? WHERE id = ?', [time(), $id]);
            Auditoria::anotar($quien, 'errores_reabrir', 'Grupo N° ' . $id . ' reabierto a mano: ' . mb_substr((string) $g['mensaje'], 0, 200));
            return $g;
        });
    }

    /** Grupos NUEVOS (primera vez en las últimas 24 h), sin resolver, que ya pasaron $umbral veces o más. */
    public static function alertas(?int $umbral = null): array
    {
        return Db::todas('SELECT * FROM errores_grupos WHERE primero >= ? AND resuelto IS NULL AND total >= ? ORDER BY total DESC LIMIT 10', [time() - 86400, $umbral ?? self::umbral()]);
    }

    /** Números del panel: ocurrencias y grupos en 24 h, grupos nuevos, abiertos y reabiertos. */
    public static function conteos(): array
    {
        $d1 = time() - 86400;
        return [
            'n24' => (int) Db::valor('SELECT COUNT(*) FROM errores_cliente WHERE creado >= ?', [$d1]),
            'n7' => (int) Db::valor('SELECT COUNT(*) FROM errores_cliente WHERE creado >= ?', [time() - 7 * 86400]),
            'grupos24' => (int) Db::valor('SELECT COUNT(DISTINCT grupo_id) FROM errores_cliente WHERE creado >= ?', [$d1]),
            'nuevos24' => (int) Db::valor('SELECT COUNT(*) FROM errores_grupos WHERE primero >= ?', [$d1]),
            'abiertos' => (int) Db::valor('SELECT COUNT(*) FROM errores_grupos WHERE resuelto IS NULL'),
            'reabiertos' => (int) Db::valor('SELECT COUNT(*) FROM errores_grupos WHERE resuelto IS NULL AND reabierto IS NOT NULL'),
            'afectados24' => (int) Db::valor("SELECT COUNT(DISTINCT ip_huella) FROM errores_cliente WHERE creado >= ? AND ip_huella <> ''", [$d1]),
        ];
    }
}
