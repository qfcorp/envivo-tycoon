<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Buzón del juego y códigos de regalo (server/INTEGRAR_BUZON.md). Tablas en migraciones/buzon.sql.
 *  - Mensajes por jugador: remitente ("EN VIVO Tycoon"), título, texto, adjuntos opcionales, estados sin_leer / leido /
 *    reclamado y vencimiento. Los adjuntos se entregan al RECLAMAR con lo de siempre: créditos con Monedero::mover
 *    (motivo 'buzon'), equipos al inventario del servidor (Inventario::crear, origen 'buzon') y lo demás como entregas
 *    (Monedero::entregarDef, origen 'buzon:<id>'). Reclamar es idempotente: dos toques (o dos pestañas) entregan UNA vez.
 *  - Difusiones del Centro de Control: a todos, a un servidor, a un universo o con filtros (registrados entre fechas,
 *    activos en N días, compradores, VIP) o a una lista de jugadores (compensaciones). Se copian al buzón de cada uno al
 *    enviar; con "nuevos" también les llega a los que entren después mientras no venza.
 *  - Códigos de regalo: premios fijos, usos máximos, uno por cuenta (y uno por lote), fechas, etiqueta de influencer.
 *    El premio llega al buzón. Límite de intentos fallidos por cuenta y por conexión (contra probar códigos al azar).
 * Nada es al azar y los créditos nunca se convierten en dinero.
 */
final class Buzon
{
    public const REMITENTE = 'EN VIVO Tycoon';
    public const DIAS_VENCE = 30;           // vencimiento por defecto de un mensaje
    public const DIAS_VENCE_MAX = 365;
    public const MAX_ADJUNTOS = 8;
    public const MAX_TITULO = 80;
    public const MAX_CUERPO = 2000;
    public const TIPOS = ['aviso' => 'Aviso', 'compensacion' => 'Compensación', 'evento' => 'Evento', 'regalo' => 'Regalo', 'codigo' => 'Código de regalo', 'sistema' => 'Sistema'];
    /** Topes por adjunto (cantidad máxima). */
    public const TOPES = ['creditos' => 5000, 'dinero' => 1000000, 'consumible' => 100, 'item' => 3, 'refuerzo' => 5, 'personal' => 5, 'reparar_todo' => 1];
    public const CONSUMIBLES = ['cable' => 'Cables de repuesto', 'battery' => 'Baterías de repuesto'];
    public const ROLES_VIEJOS = ['cam', 'dir', 'audio', 'stream'];
    /** Códigos: sin letras que se confunden (0/O, 1/I/L). */
    public const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    public const FALLOS_CUENTA = 8;         // códigos equivocados por cuenta en 10 minutos
    public const FALLOS_IP = 30;            // y por conexión (en Ecuador muchos celulares comparten IP)

    private static ?int $reloj = null;
    private static bool $listo = false;

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    /** Crea las tablas si todavía no están (Db::migrarModulos ya lo hace; esto es por si acaso). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('buzon', 'buzon_envios', 'buzon_codigos', 'buzon_canjes', 'buzon_borradores')");
        if ($n < 5) Migraciones::aplicar('buzon.sql');
        self::$listo = true;
    }

    // ------------------------------------------------------------------------------------------ adjuntos
    /**
     * Revisa y normaliza una lista de adjuntos [{tipo, item, cantidad}]. Lanza Fallo 400 adjunto_invalido.
     * @return list<array{tipo:string,item:string,cantidad:int,nivel?:?string,eventos?:?int}>
     */
    public static function normalizarAdjuntos(mixed $lista): array
    {
        if ($lista === null || $lista === '' || $lista === []) return [];
        Fallo::si(!is_array($lista) || !array_is_list($lista), 'Los premios no tienen el formato correcto.', 400, ['codigo' => 'adjunto_invalido']);
        Fallo::si(count($lista) > self::MAX_ADJUNTOS, 'Máximo ' . self::MAX_ADJUNTOS . ' premios por mensaje.', 400, ['codigo' => 'adjunto_invalido']);
        $o = [];
        foreach ($lista as $a) {
            Fallo::si(!is_array($a), 'Premio con formato incorrecto.', 400, ['codigo' => 'adjunto_invalido']);
            $tipo = is_string($a['tipo'] ?? null) ? trim($a['tipo']) : '';
            $item = is_string($a['item'] ?? null) ? trim($a['item']) : '-';
            $c = $a['cantidad'] ?? 1;
            $cant = is_int($c) ? $c : (is_string($c) && preg_match('/^\d{1,9}$/', trim($c)) ? (int) trim($c) : 0);
            $mal = fn(string $t) => new Fallo($t, 400, ['codigo' => 'adjunto_invalido']);
            if (!isset(self::TOPES[$tipo])) throw $mal('Tipo de premio desconocido: ' . mb_substr($tipo, 0, 30) . '.');
            if ($cant < 1 || $cant > self::TOPES[$tipo]) throw $mal('Cantidad no válida para ' . $tipo . ' (de 1 a ' . number_format(self::TOPES[$tipo], 0, ',', '.') . ').');
            $x = ['tipo' => $tipo, 'item' => '-', 'cantidad' => $cant];
            switch ($tipo) {
                case 'creditos': case 'dinero': case 'reparar_todo':
                    break;
                case 'consumible':
                    if (!isset(self::CONSUMIBLES[$item])) throw $mal('Repuesto desconocido: ' . mb_substr($item, 0, 30) . ' (cable o battery).');
                    $x['item'] = $item;
                    break;
                case 'item':
                    if (!Catalogo::esEquipo($item)) throw $mal('Equipo desconocido: ' . mb_substr($item, 0, 40) . '.');
                    $x['item'] = $item;
                    break;
                case 'refuerzo':
                    $p = Catalogo::PREMIUM[$item] ?? null;
                    if (!$p || ($p['entrega']['tipo'] ?? '') !== 'refuerzo') throw $mal('Refuerzo desconocido: ' . mb_substr($item, 0, 40) . '.');
                    $x['item'] = $p['entrega']['item'];
                    $x['nivel'] = $p['entrega']['nivel'] ?? null;
                    $x['eventos'] = isset($p['entrega']['eventos']) ? (int) $p['entrega']['eventos'] : null;
                    break;
                case 'personal':
                    $roles = array_values(CatalogoJuego::ROLES);
                    if (!in_array($item, $roles, true) && !in_array($item, self::ROLES_VIEJOS, true)) throw $mal('Puesto desconocido: ' . mb_substr($item, 0, 30) . '.');
                    $x['item'] = $item;
                    break;
            }
            $o[] = $x;
        }
        return $o;
    }

    /** Nombre del premio en español (el juego lo traduce con TL o arma el suyo). */
    public static function nombreAdjunto(array $a): string
    {
        $n = (int) $a['cantidad'];
        $num = number_format($n, 0, ',', '.');
        return match ($a['tipo']) {
            'creditos' => $num . ' créditos',
            'dinero' => '$' . $num . ' del juego',
            'consumible' => $num . ' × ' . (self::CONSUMIBLES[$a['item']] ?? $a['item']),
            'item' => ($n > 1 ? $num . ' × ' : '') . Catalogo::nombreEquipo((string) $a['item']),
            'refuerzo' => ($n > 1 ? $num . ' × ' : '') . (Catalogo::PREMIUM[$a['item']]['nombre'] ?? $a['item']),
            'personal' => 'Personal: ' . $a['item'] . ' (habilidad ' . $n . ')',
            'reparar_todo' => 'Reparar todos tus equipos',
            default => $num . ' × ' . $a['item'],
        };
    }

    /** Adjuntos como los ve el juego (con nombre). */
    public static function adjuntosJson(array $lista): array
    {
        return array_map(fn($a) => ['tipo' => $a['tipo'], 'item' => $a['item'], 'cantidad' => (int) $a['cantidad'], 'nombre' => self::nombreAdjunto($a)], $lista);
    }

    /** Resumen corto de los premios ("50 créditos · $5.000 del juego"). */
    public static function textoAdjuntos(array $lista): string
    {
        return $lista ? implode(' · ', array_map([self::class, 'nombreAdjunto'], $lista)) : 'sin premios';
    }

    // ------------------------------------------------------------------------------------------ enviar a un jugador
    /**
     * Pone un mensaje en el buzón de un jugador. $op: tipo, remitente, ref (idempotencia: el mismo ref no se repite),
     * expira (segundos Unix) o dias, envio_id. Devuelve el id del mensaje, o null si ese ref ya existía.
     * Seguro dentro de otra transacción (Db::tx se suma a ella).
     */
    public static function enviar(int $jugador, string $titulo, string $cuerpo = '', array $adjuntos = [], array $op = []): ?int
    {
        self::preparar();
        $titulo = self::limpiarLinea($titulo, self::MAX_TITULO);
        $cuerpo = self::limpiarTexto($cuerpo, self::MAX_CUERPO);
        Fallo::si($titulo === '', 'El mensaje necesita un título.', 400, ['codigo' => 'titulo_vacio']);
        $adj = self::normalizarAdjuntos($adjuntos);
        $tipo = isset(self::TIPOS[$op['tipo'] ?? '']) ? $op['tipo'] : 'aviso';
        $rem = self::limpiarLinea((string) ($op['remitente'] ?? ''), 60) ?: self::REMITENTE;
        $t = self::ahora();
        $exp = self::expira($op, $t);
        $ref = isset($op['ref']) && $op['ref'] !== '' ? mb_substr((string) $op['ref'], 0, 120) : null;
        return Db::tx(function () use ($jugador, $titulo, $cuerpo, $adj, $tipo, $rem, $t, $exp, $ref, $op): ?int {
            Fallo::si(!Cuentas::porId($jugador), 'Ese jugador no existe.', 404, ['codigo' => 'jugador_no_existe']);
            $n = Db::q('INSERT OR IGNORE INTO buzon (jugador_id, envio_id, tipo, remitente, titulo, cuerpo, adjuntos_json, ref, estado, creado, expira) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$jugador, $op['envio_id'] ?? null, $tipo, $rem, $titulo, $cuerpo, json_encode($adj, JSON_UNESCAPED_UNICODE), $ref, 'sin_leer', $t, $exp])->rowCount();
            return $n === 1 ? Db::ultimoId() : null;
        });
    }

    private static function expira(array $op, int $t): int
    {
        if (isset($op['expira']) && is_int($op['expira'])) return max($t + 3600, min($op['expira'], $t + self::DIAS_VENCE_MAX * 86400));
        $d = isset($op['dias']) ? (int) $op['dias'] : self::DIAS_VENCE;
        return $t + max(1, min(self::DIAS_VENCE_MAX, $d)) * 86400;
    }

    public static function limpiarLinea(string $s, int $max): string
    {
        $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';
        return mb_substr(trim(preg_replace('/\s+/u', ' ', $s) ?? ''), 0, $max);
    }

    public static function limpiarTexto(string $s, int $max): string
    {
        $s = str_replace(["\r\n", "\r"], "\n", $s);
        $s = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]+/u', ' ', $s) ?? '';
        $s = preg_replace("/\n{3,}/", "\n\n", $s) ?? '';
        return mb_substr(trim($s), 0, $max);
    }

    // ------------------------------------------------------------------------------------------ difusiones (Centro de Control)
    public const ALCANCES = ['todos' => 'Todos los jugadores', 'servidor' => 'Un servidor', 'universo' => 'Un universo', 'lista' => 'Lista de jugadores (ids o correos)'];

    /**
     * Filtro normalizado: {alcance, servidor_id?, universo_id?, ids?, desde?, hasta?, activos_dias?, compradores?, vip?}.
     * Lanza Fallo 400 filtro_invalido.
     */
    public static function normalizarFiltro(array $f): array
    {
        $al = (string) ($f['alcance'] ?? 'todos');
        Fallo::si(!isset(self::ALCANCES[$al]), 'Elige a quién se envía.', 400, ['codigo' => 'filtro_invalido']);
        $o = ['alcance' => $al];
        $ent = function (string $k) use ($f): int { $v = $f[$k] ?? 0; return is_int($v) ? $v : (is_string($v) && ctype_digit(trim($v)) ? (int) trim($v) : 0); };
        if ($al === 'servidor') {
            $o['servidor_id'] = $ent('servidor_id');
            Fallo::si(!Db::valor('SELECT 1 FROM servidores WHERE id = ?', [$o['servidor_id']]), 'Ese servidor no existe.', 400, ['codigo' => 'filtro_invalido']);
        }
        if ($al === 'universo') {
            $o['universo_id'] = $ent('universo_id');
            Fallo::si(Migraciones::columnas('universos') === null || !Db::valor('SELECT 1 FROM universos WHERE id = ?', [$o['universo_id']]), 'Ese universo no existe.', 400, ['codigo' => 'filtro_invalido']);
        }
        if ($al === 'lista') {
            $txt = $f['lista'] ?? ($f['ids'] ?? '');
            $partes = is_array($txt) ? $txt : preg_split('/[\s,;]+/u', (string) $txt, -1, PREG_SPLIT_NO_EMPTY);
            $ids = []; $faltan = [];
            foreach ($partes as $p) {
                $p = trim((string) $p);
                if ($p === '') continue;
                $id = ctype_digit($p) ? (int) (Db::valor("SELECT id FROM jugadores WHERE id = ? AND estado <> 'borrado'", [(int) $p]) ?? 0)
                                      : (int) (Db::valor("SELECT id FROM jugadores WHERE email = ? AND estado <> 'borrado'", [Cuentas::normalizarEmail($p)]) ?? 0);
                if ($id > 0) $ids[$id] = true; else $faltan[] = mb_substr($p, 0, 60);
            }
            Fallo::si($faltan !== [], 'No se encontraron estos jugadores: ' . implode(', ', array_slice($faltan, 0, 10)) . (count($faltan) > 10 ? '…' : '') . '.', 400, ['codigo' => 'filtro_invalido']);
            Fallo::si($ids === [], 'Escribe al menos un id o correo de jugador.', 400, ['codigo' => 'filtro_invalido']);
            Fallo::si(count($ids) > 5000, 'Máximo 5.000 jugadores en una lista.', 400, ['codigo' => 'filtro_invalido']);
            $o['ids'] = array_keys($ids);
            return $o;   // en una lista no se combinan los demás filtros
        }
        $fecha = function (string $k) use ($f): ?int {
            $v = trim((string) ($f[$k] ?? ''));
            if ($v === '') return null;
            Fallo::si(!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || strtotime($v . ' 00:00:00') === false, 'Fecha no válida: ' . mb_substr($v, 0, 20) . ' (AAAA-MM-DD).', 400, ['codigo' => 'filtro_invalido']);
            return (int) strtotime($v . ' 00:00:00');
        };
        if (($d = $fecha('desde')) !== null) $o['desde'] = $d;
        if (($h = $fecha('hasta')) !== null) $o['hasta'] = $h + 86400;   // hasta incluye ese día
        $act = $ent('activos_dias');
        if ($act > 0) $o['activos_dias'] = min(365, $act);
        if (!empty($f['compradores']) && $f['compradores'] !== '0') $o['compradores'] = true;
        if (!empty($f['vip']) && $f['vip'] !== '0') $o['vip'] = true;
        return $o;
    }

    /** [WHERE (sobre jugadores j), parámetros] del filtro. Nunca a cuentas borradas ni bloqueadas. */
    public static function filtroSql(array $f, ?int $soloJugador = null): array
    {
        $w = ["j.estado NOT IN ('borrado', 'baneado')"]; $p = [];
        if ($soloJugador !== null) { $w[] = 'j.id = ?'; $p[] = $soloJugador; }
        switch ($f['alcance'] ?? 'todos') {
            case 'servidor': $w[] = 'j.servidor_id = ?'; $p[] = (int) $f['servidor_id']; break;
            case 'universo': $w[] = 'j.servidor_id IN (SELECT id FROM servidores WHERE universo_id = ?)'; $p[] = (int) $f['universo_id']; break;
            case 'lista':
                $ids = array_map('intval', $f['ids'] ?? []);
                $w[] = $ids ? 'j.id IN (' . implode(',', $ids) . ')' : '0';
                return [implode(' AND ', $w), $p];
        }
        if (isset($f['desde'])) { $w[] = 'j.creado >= ?'; $p[] = (int) $f['desde']; }
        if (isset($f['hasta'])) { $w[] = 'j.creado < ?'; $p[] = (int) $f['hasta']; }
        if (isset($f['activos_dias'])) { $w[] = 'j.ultimo_ingreso >= ?'; $p[] = self::ahora() - (int) $f['activos_dias'] * 86400; }
        if (!empty($f['compradores'])) $w[] = "EXISTS (SELECT 1 FROM compras k WHERE k.jugador_id = j.id AND k.estado = 'pagado')";
        if (!empty($f['vip'])) { $w[] = 'j.vip_hasta > ?'; $p[] = self::ahora(); }
        return [implode(' AND ', $w), $p];
    }

    public static function contarDestinatarios(array $filtro): int
    {
        self::preparar();
        [$w, $p] = self::filtroSql($filtro);
        return (int) Db::valor('SELECT COUNT(*) FROM jugadores j WHERE ' . $w, $p);
    }

    /** Texto del filtro para el panel ("Servidor 1 · Quito · activos en 7 días"). */
    public static function textoFiltro(array $f): string
    {
        $o = [];
        switch ($f['alcance'] ?? 'todos') {
            case 'todos': $o[] = 'Todos los jugadores'; break;
            case 'servidor': $o[] = (string) (Db::valor('SELECT nombre FROM servidores WHERE id = ?', [(int) $f['servidor_id']]) ?? 'Servidor ' . $f['servidor_id']); break;
            case 'universo': $o[] = (string) (Db::valor('SELECT nombre FROM universos WHERE id = ?', [(int) $f['universo_id']]) ?? 'Universo ' . $f['universo_id']); break;
            case 'lista': $o[] = 'Lista de ' . count($f['ids'] ?? []) . ' jugador(es)'; break;
        }
        if (isset($f['desde'])) $o[] = 'registrados desde ' . date('d/m/Y', (int) $f['desde']);
        if (isset($f['hasta'])) $o[] = 'registrados hasta ' . date('d/m/Y', (int) $f['hasta'] - 86400);
        if (isset($f['activos_dias'])) $o[] = 'activos en ' . $f['activos_dias'] . ' días';
        if (!empty($f['compradores'])) $o[] = 'solo compradores';
        if (!empty($f['vip'])) $o[] = 'solo VIP activo';
        return implode(' · ', $o);
    }

    /**
     * Revisa los datos de una difusión (del panel) y los deja listos: {tipo, remitente, titulo, cuerpo, adjuntos, filtro,
     * nuevos, dias}. Lanza Fallo si algo está mal.
     */
    public static function prepararDifusion(array $d): array
    {
        self::preparar();
        $titulo = self::limpiarLinea((string) ($d['titulo'] ?? ''), self::MAX_TITULO);
        Fallo::si($titulo === '', 'Escribe el título del mensaje.', 400, ['codigo' => 'titulo_vacio']);
        $dias = (int) ($d['dias'] ?? self::DIAS_VENCE);
        Fallo::si($dias < 1 || $dias > self::DIAS_VENCE_MAX, 'El vencimiento va de 1 a ' . self::DIAS_VENCE_MAX . ' días.', 400, ['codigo' => 'vence_invalido']);
        $filtro = self::normalizarFiltro(is_array($d['filtro'] ?? null) ? $d['filtro'] : []);
        return [
            'tipo' => isset(self::TIPOS[$d['tipo'] ?? '']) && $d['tipo'] !== 'codigo' ? $d['tipo'] : 'aviso',
            'remitente' => self::limpiarLinea((string) ($d['remitente'] ?? ''), 60) ?: self::REMITENTE,
            'titulo' => $titulo,
            'cuerpo' => self::limpiarTexto((string) ($d['cuerpo'] ?? ''), self::MAX_CUERPO),
            'adjuntos' => self::normalizarAdjuntos($d['adjuntos'] ?? []),
            'filtro' => $filtro,
            'nuevos' => !empty($d['nuevos']) && $filtro['alcance'] !== 'lista',
            'dias' => $dias,
        ];
    }

    /** Envía una difusión ya revisada (prepararDifusion). Audita. Devuelve {envio_id, destinatarios}. */
    public static function difundir(array $d, string $quien): array
    {
        $d = self::prepararDifusion($d);
        return Db::tx(function () use ($d, $quien): array {
            $t = self::ahora();
            $exp = $t + $d['dias'] * 86400;
            $adj = json_encode($d['adjuntos'], JSON_UNESCAPED_UNICODE);
            Db::q('INSERT INTO buzon_envios (tipo, remitente, titulo, cuerpo, adjuntos_json, filtro_json, nuevos, destinatarios, expira, estado, creado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
                [$d['tipo'], $d['remitente'], $d['titulo'], $d['cuerpo'], $adj, json_encode($d['filtro']), $d['nuevos'] ? 1 : 0, $exp, 'activo', $t, mb_substr($quien, 0, 80)]);
            $id = Db::ultimoId();
            [$w, $p] = self::filtroSql($d['filtro']);
            $n = Db::q("INSERT OR IGNORE INTO buzon (jugador_id, envio_id, tipo, remitente, titulo, cuerpo, adjuntos_json, estado, creado, expira)
                        SELECT j.id, ?, ?, ?, ?, ?, ?, 'sin_leer', ?, ? FROM jugadores j WHERE $w",
                [$id, $d['tipo'], $d['remitente'], $d['titulo'], $d['cuerpo'], $adj, $t, $exp, ...$p])->rowCount();
            Db::q('UPDATE buzon_envios SET destinatarios = ? WHERE id = ?', [$n, $id]);
            Auditoria::anotar($quien, 'buzon_difusion', 'Envío N° ' . $id . ' (' . self::TIPOS[$d['tipo']] . ') «' . $d['titulo'] . '» a ' . $n . ' jugador(es): '
                . self::textoFiltro($d['filtro']) . ($d['nuevos'] ? ' (+ los que entren después)' : '') . '. Premios: ' . self::textoAdjuntos($d['adjuntos']) . '. Vence en ' . $d['dias'] . ' días.');
            return ['envio_id' => $id, 'destinatarios' => $n];
        });
    }

    /** Retira un envío: desaparece de los buzones donde no se reclamó y deja de llegar a los nuevos. */
    public static function retirarEnvio(int $id, string $quien): int
    {
        self::preparar();
        return Db::tx(function () use ($id, $quien): int {
            $e = Db::fila('SELECT * FROM buzon_envios WHERE id = ?', [$id]);
            Fallo::si(!$e, 'Ese envío no existe.', 404, ['codigo' => 'envio_no_existe']);
            Fallo::si($e['estado'] === 'retirado', 'Ese envío ya estaba retirado.', 409, ['codigo' => 'envio_retirado']);
            Db::q("UPDATE buzon_envios SET estado = 'retirado' WHERE id = ?", [$id]);
            $n = Db::q("UPDATE buzon SET borrado = 1 WHERE envio_id = ? AND estado <> 'reclamado' AND borrado = 0", [$id])->rowCount();
            Auditoria::anotar($quien, 'buzon_retirar', 'Retiró el envío N° ' . $id . ' «' . $e['titulo'] . '»: se quitó de ' . $n . ' buzón(es) sin reclamar.');
            return $n;
        });
    }

    /** Las difusiones con "nuevos" que le tocan a este jugador y todavía no tiene (al abrir su buzón). */
    public static function alcanzarNuevos(int $jugador): int
    {
        $t = self::ahora();
        $n = 0;
        $envios = Db::todas("SELECT * FROM buzon_envios e WHERE e.estado = 'activo' AND e.nuevos = 1 AND e.expira > ?
                             AND NOT EXISTS (SELECT 1 FROM buzon b WHERE b.envio_id = e.id AND b.jugador_id = ?) ORDER BY e.id LIMIT 50", [$t, $jugador]);
        foreach ($envios as $e) {
            $f = json_decode((string) $e['filtro_json'], true);
            if (!is_array($f)) continue;
            [$w, $p] = self::filtroSql($f, $jugador);
            $n += Db::q("INSERT OR IGNORE INTO buzon (jugador_id, envio_id, tipo, remitente, titulo, cuerpo, adjuntos_json, estado, creado, expira)
                         SELECT j.id, ?, ?, ?, ?, ?, ?, 'sin_leer', ?, ? FROM jugadores j WHERE $w",
                [(int) $e['id'], $e['tipo'], $e['remitente'], $e['titulo'], $e['cuerpo'], $e['adjuntos_json'], $t, (int) $e['expira'], ...$p])->rowCount();
            if ($n > 0) Db::q('UPDATE buzon_envios SET destinatarios = (SELECT COUNT(*) FROM buzon WHERE envio_id = ?) WHERE id = ?', [(int) $e['id'], (int) $e['id']]);
        }
        return $n;
    }

    // ------------------------------------------------------------------------------------------ el jugador
    private static function visibles(): string
    {
        // no borrados; los que vencieron sin reclamar ya no se ven; los reclamados se ven 30 días más
        return 'jugador_id = ? AND borrado = 0 AND (expira > ? OR (estado = \'reclamado\' AND reclamado > ?))';
    }

    /** Un mensaje como lo ve el juego. */
    public static function json(array $m): array
    {
        $t = self::ahora();
        $adj = json_decode((string) $m['adjuntos_json'], true);
        $adj = is_array($adj) ? $adj : [];
        $vencido = $m['expira'] !== null && (int) $m['expira'] <= $t;
        return [
            'id' => (int) $m['id'], 'tipo' => $m['tipo'], 'remitente' => $m['remitente'], 'titulo' => $m['titulo'], 'cuerpo' => $m['cuerpo'],
            'adjuntos' => self::adjuntosJson($adj), 'estado' => $m['estado'],
            'reclamable' => $adj !== [] && $m['estado'] !== 'reclamado' && !$vencido,
            'creado' => Db::iso((int) $m['creado']), 'expira' => Db::iso($m['expira'] === null ? null : (int) $m['expira']),
            'vence_seg' => $m['expira'] === null ? null : max(0, (int) $m['expira'] - $t),
            'reclamado' => Db::iso($m['reclamado'] === null ? null : (int) $m['reclamado']),
        ];
    }

    /** Números para el sobre del encabezado: mensajes sin leer y con regalos por reclamar. */
    public static function resumen(int $jugador): array
    {
        self::preparar();
        $t = self::ahora();
        $f = Db::fila("SELECT COALESCE(SUM(estado = 'sin_leer'), 0) AS sin_leer,
                              COALESCE(SUM(estado <> 'reclamado' AND adjuntos_json <> '[]' AND expira > ?), 0) AS por_reclamar
                       FROM buzon WHERE " . self::visibles(), [$t, $jugador, $t, $t - 30 * 86400]) ?? [];
        return ['sin_leer' => (int) ($f['sin_leer'] ?? 0), 'por_reclamar' => (int) ($f['por_reclamar'] ?? 0)];
    }

    /** GET /api/buzon */
    public static function listar(int $jugador): array
    {
        self::preparar();
        Db::tx(fn() => self::alcanzarNuevos($jugador));
        if (random_int(1, 50) === 1) self::limpiar();
        $t = self::ahora();
        $filas = Db::todas('SELECT * FROM buzon WHERE ' . self::visibles() . ' ORDER BY (estado = \'reclamado\'), id DESC LIMIT 100', [$jugador, $t, $t - 30 * 86400]);
        return ['ok' => true, 'mensajes' => array_map([self::class, 'json'], $filas)] + self::resumen($jugador);
    }

    /** Borra los mensajes vencidos hace más de 30 días (sus envíos ya vencieron: no vuelven a llegar). */
    public static function limpiar(): int
    {
        return Db::q('DELETE FROM buzon WHERE expira < ?', [self::ahora() - 30 * 86400])->rowCount();
    }

    private static function mio(int $jugador, int $id): array
    {
        $m = Db::fila('SELECT * FROM buzon WHERE id = ? AND jugador_id = ? AND borrado = 0', [$id, $jugador]);
        Fallo::si(!$m, 'Ese mensaje no está en tu buzón.', 404, ['codigo' => 'mensaje_no_existe']);
        return $m;
    }

    /** POST /api/buzon/leer {id} */
    public static function leer(int $jugador, int $id): array
    {
        self::preparar();
        self::mio($jugador, $id);
        Db::q("UPDATE buzon SET estado = 'leido', leido = ? WHERE id = ? AND jugador_id = ? AND estado = 'sin_leer'", [self::ahora(), $id, $jugador]);
        return ['ok' => true, 'mensaje' => self::json(self::mio($jugador, $id))] + self::resumen($jugador);
    }

    /** POST /api/buzon/borrar {id}: solo si no tiene regalos por reclamar. */
    public static function borrar(int $jugador, int $id): array
    {
        self::preparar();
        $m = self::json(self::mio($jugador, $id));
        Fallo::si($m['reclamable'], 'Primero reclama el regalo de este mensaje.', 409, ['codigo' => 'mensaje_con_regalo']);
        Db::q('UPDATE buzon SET borrado = 1 WHERE id = ? AND jugador_id = ?', [$id, $jugador]);
        return ['ok' => true, 'borrado' => $id] + self::resumen($jugador);
    }

    /**
     * Entrega los premios de UN mensaje (dentro de la transacción del que llama). Devuelve [entregas, equipos, creditos]
     * o null si ya estaba reclamado (otro toque llegó antes). Lanza Fallo 410 si venció.
     */
    private static function entregarMensaje(int $jugador, array $m): ?array
    {
        $t = self::ahora();
        $adj = json_decode((string) $m['adjuntos_json'], true);
        $adj = is_array($adj) ? $adj : [];
        Fallo::si($adj === [], 'Este mensaje no tiene regalos.', 409, ['codigo' => 'sin_regalo']);
        if ($m['estado'] === 'reclamado') return null;
        Fallo::si($m['expira'] !== null && (int) $m['expira'] <= $t, 'Este regalo ya venció.', 410, ['codigo' => 'mensaje_vencido']);
        $tomado = Db::q("UPDATE buzon SET estado = 'reclamado', reclamado = ?, leido = COALESCE(leido, ?) WHERE id = ? AND jugador_id = ? AND estado <> 'reclamado'",
            [$t, $t, (int) $m['id'], $jugador])->rowCount();
        if ($tomado !== 1) return null;
        $origen = 'buzon:' . (int) $m['id'];
        $entregas = []; $equipos = []; $cred = 0;
        foreach ($adj as $a) {
            $n = (int) $a['cantidad'];
            switch ($a['tipo']) {
                case 'creditos': Monedero::mover($jugador, $n, 'buzon', $origen); $cred += $n; break;
                case 'item': for ($i = 0; $i < $n; $i++) $equipos[] = Inventario::crear($jugador, (string) $a['item'], 'buzon', $origen); break;
                case 'refuerzo': for ($i = 0; $i < $n; $i++) $entregas[] = Monedero::entregar($jugador, 'refuerzo', (string) $a['item'], 1, $origen, $a['nivel'] ?? null, isset($a['eventos']) ? (int) $a['eventos'] : null); break;
                default: $entregas[] = Monedero::entregar($jugador, (string) $a['tipo'], (string) $a['item'], $n, $origen);
            }
        }
        return [$entregas, $equipos, $cred];
    }

    /** POST /api/buzon/reclamar {id}: idempotente (si ya se reclamó responde ok con ya_reclamado: true y sin entregas). */
    public static function reclamar(int $jugador, int $id): array
    {
        self::preparar();
        Cuentas::exigirActiva($jugador);
        return Db::tx(function () use ($jugador, $id): array {
            $m = self::mio($jugador, $id);
            $r = self::entregarMensaje($jugador, $m);
            $o = ['ok' => true, 'ya_reclamado' => $r === null, 'entregas' => $r[0] ?? [], 'equipos' => $r[1] ?? [], 'creditos_recibidos' => $r[2] ?? 0,
                  'creditos' => Monedero::saldo($jugador), 'mensaje' => self::json(self::mio($jugador, $id))];
            if (!empty($r[1])) $o['inventario'] = Inventario::deJugador($jugador);
            return $o + self::resumen($jugador);
        });
    }

    /** POST /api/buzon/reclamar_todo: todos los regalos que se pueden reclamar (hasta 50 a la vez). */
    public static function reclamarTodo(int $jugador): array
    {
        self::preparar();
        Cuentas::exigirActiva($jugador);
        return Db::tx(function () use ($jugador): array {
            $t = self::ahora();
            $filas = Db::todas("SELECT * FROM buzon WHERE jugador_id = ? AND borrado = 0 AND estado <> 'reclamado' AND adjuntos_json <> '[]' AND expira > ? ORDER BY id LIMIT 50", [$jugador, $t]);
            $ids = []; $ent = []; $eq = []; $cred = 0;
            foreach ($filas as $m) {
                $r = self::entregarMensaje($jugador, $m);
                if ($r === null) continue;
                $ids[] = (int) $m['id'];
                array_push($ent, ...$r[0]); array_push($eq, ...$r[1]); $cred += $r[2];
            }
            $o = ['ok' => true, 'reclamados' => $ids, 'entregas' => $ent, 'equipos' => $eq, 'creditos_recibidos' => $cred, 'creditos' => Monedero::saldo($jugador)];
            if ($eq) $o['inventario'] = Inventario::deJugador($jugador);
            return $o + self::resumen($jugador);
        });
    }

    // ------------------------------------------------------------------------------------------ códigos de regalo
    /** "dimi-2026 x" -> "DIMI2026X" (mayúsculas, sin espacios, guiones ni puntos). */
    public static function normalizarCodigo(string $c): string
    {
        return strtoupper(preg_replace('/[\s\-_.]+/u', '', $c) ?? '');
    }

    /** Un código al azar de $n caracteres (sin letras que se confunden). */
    public static function aleatorio(int $n = 8): string
    {
        $a = self::ALFABETO; $o = '';
        for ($i = 0; $i < $n; $i++) $o .= $a[random_int(0, strlen($a) - 1)];
        return $o;
    }

    /**
     * Revisa los datos de un código: {codigo?, titulo, mensaje, adjuntos, usos_max, desde?, hasta?, etiqueta}.
     * @return array{titulo:string,mensaje:string,adjuntos:array,usos_max:int,desde:?int,hasta:?int,etiqueta:string}
     */
    private static function datosCodigo(array $d): array
    {
        $adj = self::normalizarAdjuntos($d['adjuntos'] ?? []);
        Fallo::si($adj === [], 'Un código de regalo necesita al menos un premio.', 400, ['codigo' => 'adjunto_invalido']);
        $titulo = self::limpiarLinea((string) ($d['titulo'] ?? ''), self::MAX_TITULO) ?: 'Regalo de código';
        $usos = (int) ($d['usos_max'] ?? 0);
        Fallo::si($usos < 0 || $usos > 1000000, 'Usos máximos: de 0 (sin límite) a 1.000.000.', 400, ['codigo' => 'usos_invalidos']);
        $fecha = function (string $k, bool $fin) use ($d): ?int {
            $v = trim((string) ($d[$k] ?? ''));
            if ($v === '') return null;
            Fallo::si(!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || strtotime($v) === false, 'Fecha no válida: ' . mb_substr($v, 0, 20) . ' (AAAA-MM-DD).', 400, ['codigo' => 'fecha_invalida']);
            return (int) strtotime($v . ' 00:00:00') + ($fin ? 86400 : 0);
        };
        $desde = $fecha('desde', false); $hasta = $fecha('hasta', true);
        Fallo::si($desde !== null && $hasta !== null && $hasta <= $desde, 'La fecha final debe ser después de la inicial.', 400, ['codigo' => 'fecha_invalida']);
        $et = strtolower(self::limpiarLinea((string) ($d['etiqueta'] ?? ''), 40));
        Fallo::si($et !== '' && !preg_match('/^[a-z0-9_\-. @áéíóúñü]+$/u', $et), 'La etiqueta solo puede tener letras, números, punto, guion y guion bajo.', 400, ['codigo' => 'etiqueta_invalida']);
        return ['titulo' => $titulo, 'mensaje' => self::limpiarTexto((string) ($d['mensaje'] ?? ''), self::MAX_CUERPO), 'adjuntos' => $adj,
                'usos_max' => $usos, 'desde' => $desde, 'hasta' => $hasta, 'etiqueta' => $et];
    }

    /** Crea UN código (escrito o al azar). Audita. Devuelve la fila. */
    public static function crearCodigo(array $d, string $quien): array
    {
        self::preparar();
        $x = self::datosCodigo($d);
        $cod = self::normalizarCodigo((string) ($d['codigo'] ?? ''));
        if ($cod === '') $cod = self::aleatorio(10);
        Fallo::si(!preg_match('/^[A-Z0-9]{4,32}$/', $cod), 'El código debe tener de 4 a 32 letras o números (sin tildes ni signos).', 400, ['codigo' => 'codigo_formato']);
        return Db::tx(function () use ($x, $cod, $quien): array {
            Fallo::si((bool) Db::valor('SELECT 1 FROM buzon_codigos WHERE codigo = ?', [$cod]), 'Ya existe el código ' . $cod . '.', 409, ['codigo' => 'codigo_repetido']);
            self::insertarCodigo($cod, $x, null, $quien);
            $f = Db::fila('SELECT * FROM buzon_codigos WHERE codigo = ?', [$cod]);
            Auditoria::anotar($quien, 'buzon_codigo_crear', 'Código ' . $cod . ($x['etiqueta'] !== '' ? ' [' . $x['etiqueta'] . ']' : '') . ': ' . self::textoAdjuntos($x['adjuntos'])
                . ' · usos ' . ($x['usos_max'] ?: 'sin límite') . self::textoFechas($x['desde'], $x['hasta']) . '.');
            return $f;
        });
    }

    private static function insertarCodigo(string $cod, array $x, ?string $lote, string $quien): void
    {
        Db::q('INSERT INTO buzon_codigos (codigo, titulo, mensaje, adjuntos_json, usos_max, usos, desde, hasta, etiqueta, lote, activo, creado, creado_por) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?, ?)',
            [$cod, $x['titulo'], $x['mensaje'], json_encode($x['adjuntos'], JSON_UNESCAPED_UNICODE), $x['usos_max'], $x['desde'], $x['hasta'], $x['etiqueta'], $lote, self::ahora(), mb_substr($quien, 0, 80)]);
    }

    private static function textoFechas(?int $desde, ?int $hasta): string
    {
        return ($desde ? ' · desde ' . date('d/m/Y', $desde) : '') . ($hasta ? ' · hasta ' . date('d/m/Y', $hasta - 86400) : '');
    }

    /**
     * Generador para influencers: $n códigos ÚNICOS (de 1 uso cada uno, salvo usos_max) con un prefijo, en un lote
     * (una cuenta solo canjea uno del lote). Devuelve {lote, codigos: [...]}.
     */
    public static function generarLote(array $d, int $n, string $prefijo, string $quien): array
    {
        self::preparar();
        Fallo::si($n < 1 || $n > 1000, 'Cantidad de códigos: de 1 a 1.000.', 400, ['codigo' => 'cantidad_invalida']);
        $pre = self::normalizarCodigo($prefijo);
        Fallo::si(!preg_match('/^[A-Z0-9]{0,12}$/', $pre), 'El prefijo puede tener hasta 12 letras o números.', 400, ['codigo' => 'codigo_formato']);
        $d['usos_max'] = (int) ($d['usos_max'] ?? 1) ?: 1;
        $x = self::datosCodigo($d);
        return Db::tx(function () use ($x, $n, $pre, $quien): array {
            $lote = date('Ymd', self::ahora()) . '-' . strtolower(self::aleatorio(6));
            $codigos = [];
            for ($i = 0; $i < $n; $i++) {
                for ($k = 0; $k < 20; $k++) {
                    $c = $pre . self::aleatorio(8);
                    if (!isset($codigos[$c]) && !Db::valor('SELECT 1 FROM buzon_codigos WHERE codigo = ?', [$c])) break;
                }
                $codigos[$c] = true;
                self::insertarCodigo($c, $x, $lote, $quien);
            }
            Auditoria::anotar($quien, 'buzon_codigo_lote', 'Lote ' . $lote . ': ' . $n . ' códigos ' . ($pre !== '' ? $pre . '…' : '') . ($x['etiqueta'] !== '' ? ' [' . $x['etiqueta'] . ']' : '')
                . ' de ' . $x['usos_max'] . ' uso(s): ' . self::textoAdjuntos($x['adjuntos']) . self::textoFechas($x['desde'], $x['hasta']) . '.');
            return ['lote' => $lote, 'codigos' => array_keys($codigos)];
        });
    }

    /** Activa o desactiva un código (o todo su lote). Audita. */
    public static function activarCodigo(int $id, bool $activo, string $quien, bool $loteEntero = false): int
    {
        self::preparar();
        $c = Db::fila('SELECT * FROM buzon_codigos WHERE id = ?', [$id]);
        Fallo::si(!$c, 'Ese código no existe.', 404, ['codigo' => 'codigo_invalido']);
        $n = $loteEntero && $c['lote'] !== null
            ? Db::q('UPDATE buzon_codigos SET activo = ? WHERE lote = ?', [$activo ? 1 : 0, $c['lote']])->rowCount()
            : Db::q('UPDATE buzon_codigos SET activo = ? WHERE id = ?', [$activo ? 1 : 0, $id])->rowCount();
        Auditoria::anotar($quien, $activo ? 'buzon_codigo_activar' : 'buzon_codigo_desactivar', ($loteEntero && $c['lote'] ? 'Lote ' . $c['lote'] . ' (' . $n . ' códigos)' : 'Código ' . $c['codigo']) . ($activo ? ' activado' : ' desactivado') . '.');
        return $n;
    }

    /**
     * Canjear un código (en el juego o en /canjear.html): el premio llega al buzón. Límite de intentos fallidos por cuenta
     * y por conexión. Devuelve {ok, mensaje, codigo, sin_leer, por_reclamar}.
     */
    public static function canjear(int $jugador, string $texto, string $canal = 'juego'): array
    {
        self::preparar();
        $kj = 'canje:j:' . $jugador; $ki = 'canje:ip:' . Http::ip();
        if (Limite::excedido($kj, self::FALLOS_CUENTA) || Limite::excedido($ki, self::FALLOS_IP))
            throw new Fallo('Demasiados códigos equivocados. Espera 10 minutos e intenta de nuevo.', 429, ['codigo' => 'limite_intentos']);
        Cuentas::exigirActiva($jugador);
        $fallar = function (string $txt, int $http, string $cod) use ($kj, $ki): never { Limite::sumar($kj); Limite::sumar($ki); throw new Fallo($txt, $http, ['codigo' => $cod]); };
        $cod = self::normalizarCodigo(mb_substr($texto, 0, 60));
        if (!preg_match('/^[A-Z0-9]{4,32}$/', $cod)) $fallar('Ese código no existe o ya no está activo. Revisa que esté bien escrito.', 404, 'codigo_invalido');
        $canal = $canal === 'web' ? 'web' : 'juego';
        // Fuera de la transacción: el intento fallido tiene que quedar anotado (dentro se desharía con el error)
        $c0 = Db::fila('SELECT id, activo FROM buzon_codigos WHERE codigo = ?', [$cod]);
        if (!$c0 || !(int) $c0['activo']) $fallar('Ese código no existe o ya no está activo. Revisa que esté bien escrito.', 404, 'codigo_invalido');
        return Db::tx(function () use ($jugador, $cod, $canal): array {
            $t = self::ahora();
            $c = Db::fila('SELECT * FROM buzon_codigos WHERE codigo = ?', [$cod]);
            if (!$c || !(int) $c['activo']) throw new Fallo('Ese código no existe o ya no está activo. Revisa que esté bien escrito.', 404, ['codigo' => 'codigo_invalido']);
            if (Db::valor('SELECT 1 FROM buzon_canjes WHERE codigo_id = ? AND jugador_id = ?', [(int) $c['id'], $jugador]))
                throw new Fallo('Ya canjeaste este código en tu cuenta.', 409, ['codigo' => 'codigo_ya_usado']);
            if ($c['desde'] !== null && (int) $c['desde'] > $t) throw new Fallo('Este código todavía no se puede usar. Se activa el ' . date('d/m/Y', (int) $c['desde']) . '.', 409, ['codigo' => 'codigo_pronto', 'fecha' => date('d/m/Y', (int) $c['desde'])]);
            if ($c['hasta'] !== null && (int) $c['hasta'] <= $t) throw new Fallo('Este código ya venció.', 410, ['codigo' => 'codigo_vencido']);
            if ($c['lote'] !== null && Db::valor('SELECT 1 FROM buzon_canjes WHERE jugador_id = ? AND lote = ?', [$jugador, $c['lote']]))
                throw new Fallo('Ya canjeaste otro código de esta misma campaña: es uno por cuenta.', 409, ['codigo' => 'codigo_lote_usado']);
            $ok = Db::q('UPDATE buzon_codigos SET usos = usos + 1 WHERE id = ? AND (usos_max = 0 OR usos < usos_max)', [(int) $c['id']])->rowCount();
            if ($ok !== 1) throw new Fallo('Este código ya se usó todas las veces posibles.', 409, ['codigo' => 'codigo_agotado']);
            $adj = json_decode((string) $c['adjuntos_json'], true) ?: [];
            $cuerpo = $c['mensaje'] !== '' ? $c['mensaje'] : '¡Gracias por jugar EN VIVO Tycoon! Aquí está el regalo del código ' . $cod . '.';
            $exp = $c['hasta'] !== null ? max($t + 7 * 86400, (int) $c['hasta']) : null;
            $mid = self::enviar($jugador, (string) $c['titulo'], $cuerpo, $adj, ['tipo' => 'codigo', 'ref' => 'codigo:' . $c['id']] + ($exp ? ['expira' => $exp] : []));
            if ($mid === null) $mid = (int) Db::valor('SELECT id FROM buzon WHERE jugador_id = ? AND ref = ?', [$jugador, 'codigo:' . $c['id']]);
            Db::q('INSERT INTO buzon_canjes (codigo_id, jugador_id, lote, etiqueta, buzon_id, canal, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [(int) $c['id'], $jugador, $c['lote'], (string) $c['etiqueta'], $mid, $canal, $t]);
            return ['ok' => true, 'codigo' => $cod, 'mensaje' => self::json(self::mio($jugador, $mid))] + self::resumen($jugador);
        });
    }

    // ------------------------------------------------------------------------------------------ estadísticas (Centro de Control)
    /**
     * Por etiqueta (influencer/campaña): códigos, canjes, jugadores únicos, cuántos compraron DESPUÉS de canjear,
     * cuántas compras y cuánto pagaron (USD con IVA). Cada jugador cuenta desde su primer canje de esa etiqueta.
     */
    public static function estadisticas(): array
    {
        self::preparar();
        $base = Db::todas("SELECT etiqueta, COUNT(*) AS codigos, COALESCE(SUM(usos), 0) AS usos, COALESCE(SUM(activo), 0) AS activos FROM buzon_codigos GROUP BY etiqueta");
        $o = [];
        foreach ($base as $b) $o[(string) $b['etiqueta']] = ['etiqueta' => (string) $b['etiqueta'], 'codigos' => (int) $b['codigos'], 'activos' => (int) $b['activos'], 'canjes' => 0, 'jugadores' => 0,
            'web' => 0, 'compradores' => 0, 'compras' => 0, 'ingresos' => 0.0];
        foreach (Db::todas("SELECT etiqueta, COUNT(*) AS canjes, COUNT(DISTINCT jugador_id) AS jugadores, COALESCE(SUM(canal = 'web'), 0) AS web FROM buzon_canjes GROUP BY etiqueta") as $f) {
            $k = (string) $f['etiqueta'];
            $o[$k] ??= ['etiqueta' => $k, 'codigos' => 0, 'activos' => 0, 'canjes' => 0, 'jugadores' => 0, 'web' => 0, 'compradores' => 0, 'compras' => 0, 'ingresos' => 0.0];
            $o[$k]['canjes'] = (int) $f['canjes']; $o[$k]['jugadores'] = (int) $f['jugadores']; $o[$k]['web'] = (int) $f['web'];
        }
        $compras = Db::todas("SELECT p.etiqueta, COUNT(DISTINCT k.jugador_id) AS compradores, COUNT(k.id) AS compras, COALESCE(SUM(k.total), 0) AS ingresos
                              FROM (SELECT etiqueta, jugador_id, MIN(creado) AS desde FROM buzon_canjes GROUP BY etiqueta, jugador_id) p
                              JOIN compras k ON k.jugador_id = p.jugador_id AND k.estado = 'pagado' AND COALESCE(k.pagado_en, k.creado) >= p.desde
                              GROUP BY p.etiqueta");
        foreach ($compras as $f) {
            $k = (string) $f['etiqueta'];
            if (!isset($o[$k])) continue;
            $o[$k]['compradores'] = (int) $f['compradores']; $o[$k]['compras'] = (int) $f['compras']; $o[$k]['ingresos'] = round((float) $f['ingresos'], 2);
        }
        uasort($o, fn($a, $b) => [$b['canjes'], $a['etiqueta']] <=> [$a['canjes'], $b['etiqueta']]);
        return array_values($o);
    }

    /** Totales del buzón para el panel. */
    public static function totales(): array
    {
        self::preparar();
        $t = self::ahora();
        return [
            'envios' => (int) Db::valor('SELECT COUNT(*) FROM buzon_envios'),
            'mensajes' => (int) Db::valor('SELECT COUNT(*) FROM buzon'),
            'por_reclamar' => (int) Db::valor("SELECT COUNT(*) FROM buzon WHERE borrado = 0 AND estado <> 'reclamado' AND adjuntos_json <> '[]' AND expira > ?", [$t]),
            'codigos_activos' => (int) Db::valor("SELECT COUNT(*) FROM buzon_codigos WHERE activo = 1 AND (hasta IS NULL OR hasta > ?)", [$t]),
            'canjes_7d' => (int) Db::valor('SELECT COUNT(*) FROM buzon_canjes WHERE creado >= ?', [$t - 7 * 86400]),
            'creditos_7d' => (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE motivo = 'buzon' AND creado >= ?", [$t - 7 * 86400]),
        ];
    }
}
