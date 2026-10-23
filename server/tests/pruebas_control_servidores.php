<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Pestaña "Servidores" del Centro de Control (/control/?t=servidores,
// server/public/control/lib/servidores.php, COPAS.md §3) por HTTP contra "php -S" + server/tests/router_control.php, con
// bases SQLite TEMPORALES:
//   A) migraciones + tablas del contrato + datos de ejemplo, y los módulos SIMULADOS (Universos, SaludServidores,
//      Fusiones, Copas con las firmas de INTEGRAR_CONTROL_SERVIDORES.md, cargados por un enrutador propio): se prueba todo
//      el flujo (aprobar con el nombre escrito, cancelar, crear universo, forzar fase, rejugar cruce, CSRF y auditoría).
//   B) los mismos datos con los módulos REALES que haya en server/src (o ninguno): la pestaña se ve sin errores y lo que
//      falte dice "Módulo no instalado".
//   C) una base sin las tablas de los módulos: todo "Módulo no instalado", nada se rompe.
//   Y (si hay Playwright) un celular de 390x844 sin desplazamiento horizontal, tocando el gráfico y aprobando una fusión.
// Uso:  php server/tests/pruebas_control_servidores.php      (GUARDAR_TMP=1 deja los archivos; CAPTURAS=carpeta)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
putenv('TZ=America/Guayaquil');
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$SRV = $RAIZ . '/server';
$TMP = sys_get_temp_dir() . '/envivo_ctl_srv_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$CAPTURAS = getenv('CAPTURAS') ?: $TMP . '/capturas';
@mkdir($CAPTURAS, 0777, true);
function puertos_libres(int $desde, int $n): int {
    for ($p = $desde; $p < $desde + 3000; $p += $n) {
        $ok = true;
        for ($i = 0; $i < $n && $ok; $i++) { $s = @stream_socket_server('tcp://127.0.0.1:' . ($p + $i)); if ($s === false) $ok = false; else fclose($s); }
        if ($ok) return $p;
    }
    throw new RuntimeException('No hay puertos libres');
}
$P = (int) (getenv('P_APP') ?: 0) ?: puertos_libres((int) (getenv('P_CONTROL_SRV') ?: 18591), 3);
[$PA, $PB, $PC] = [$P, puertos_libres($P + 1, 1), 0];
$PC = puertos_libres($PB + 1, 1);
$USUARIO = 'jefe_servidores';
$CLAVE = 'Srv-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
$QUIEN = 'control:' . $USUARIO;
$DB = ['A' => "$TMP/datos/a.sqlite", 'B' => "$TMP/datos/b.sqlite", 'C' => "$TMP/datos/c.sqlite"];
$PU = ['A' => $PA, 'B' => $PB, 'C' => $PC];
foreach ($DB as $k => $db) file_put_contents("$TMP/$k.env", "; SOLO PRUEBAS\nENVIVO_DB=$db\nENVIVO_URL=http://127.0.0.1:{$PU[$k]}\nENVIVO_ZONA=America/Guayaquil\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\nUNIVERSO_SERVIDORES_INICIALES=3\n");

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }

$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) proc_terminate($p);
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});

// ------------------------------------------------------------------------------------------------ bases
titulo('Bases temporales: migraciones del juego, tablas del contrato (COPAS.md) y datos de ejemplo');
foreach ($DB as $k => $db) {
    exec('ENVIVO_CONFIG=' . escapeshellarg("$TMP/$k.env") . ' php ' . escapeshellarg("$SRV/bin/migrar.php") . ' 2>&1', $out, $rc);
    check("Migraciones del juego (base $k)", 0, $rc);
}
/** Tablas del contrato si las migraciones de los módulos aún no están (mismas columnas que src/migraciones/*.sql). */
const DDL = <<<'SQL'
CREATE TABLE IF NOT EXISTS universos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, creado INTEGER NOT NULL, activo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS actividad_diaria (dia TEXT NOT NULL, jugador_id INTEGER NOT NULL, servidor_id INTEGER, eventos INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, jugador_id));
CREATE TABLE IF NOT EXISTS servidor_salud (dia TEXT NOT NULL, servidor_id INTEGER NOT NULL, activos_1 INTEGER NOT NULL DEFAULT 0, activos_7 INTEGER NOT NULL DEFAULT 0, activos_14 INTEGER NOT NULL DEFAULT 0,
    activos_30 INTEGER NOT NULL DEFAULT 0, eventos INTEGER NOT NULL DEFAULT 0, mensajes INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL, creado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, servidor_id));
CREATE TABLE IF NOT EXISTS fusiones (id INTEGER PRIMARY KEY AUTOINCREMENT, origen INTEGER NOT NULL, destino INTEGER NOT NULL, estado TEXT NOT NULL DEFAULT 'plan', plan_json TEXT NOT NULL,
    huella TEXT NOT NULL DEFAULT '', sugerida INTEGER NOT NULL DEFAULT 0, creado INTEGER NOT NULL, creado_por TEXT NOT NULL DEFAULT '', ejecutada INTEGER, quien TEXT, resultado_json TEXT, cancelada_en INTEGER, motivo TEXT);
CREATE TABLE IF NOT EXISTS traslados (id INTEGER PRIMARY KEY AUTOINCREMENT, jugador_id INTEGER NOT NULL, origen INTEGER NOT NULL, destino INTEGER NOT NULL, motivo TEXT NOT NULL, fusion_id INTEGER, creado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS copas (id INTEGER PRIMARY KEY AUTOINCREMENT, universo_id INTEGER NOT NULL, semana TEXT NOT NULL, torneo_key TEXT NOT NULL, nombre TEXT NOT NULL, fase TEXT NOT NULL DEFAULT 'preparacion',
    inicio INTEGER NOT NULL, fin INTEGER NOT NULL, creado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS copa_servidores (copa_id INTEGER NOT NULL, servidor_id INTEGER NOT NULL, puntos_prep INTEGER NOT NULL DEFAULT 0, puntos_tabla INTEGER NOT NULL DEFAULT 0, ganados INTEGER NOT NULL DEFAULT 0,
    empatados INTEGER NOT NULL DEFAULT 0, perdidos INTEGER NOT NULL DEFAULT 0, dif_calidad INTEGER NOT NULL DEFAULT 0, posicion INTEGER, PRIMARY KEY (copa_id, servidor_id));
CREATE TABLE IF NOT EXISTS copa_cruces (id INTEGER PRIMARY KEY AUTOINCREMENT, copa_id INTEGER NOT NULL, ronda INTEGER NOT NULL, servidor_a INTEGER NOT NULL, servidor_b INTEGER NOT NULL, hora INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente', puntos_a INTEGER, puntos_b INTEGER, detalle_json TEXT);
SQL;
const TABLAS_MODULOS = ['universos', 'actividad_diaria', 'servidor_salud', 'fusiones', 'traslados', 'copas', 'copa_servidores', 'copa_cruces', 'copa_aportes', 'copa_equipos', 'copa_premios', 'copa_intentos', 'copa_ajustes'];

$t = time();
$D = 86400;
$dia = fn(int $hace) => date('Y-m-d', strtotime("-$hace days"));
$PLAN = ['origen' => 4, 'destino' => 2, 'jugadores' => ['total' => 2, 'activos' => 0, 'inactivos' => 2], 'choques_alias' => [['alias' => 'Loja TV', 'nuevo' => 'Loja TV (Loja)']],
         'asociaciones' => ['choques_nombre' => 0, 'choques_siglas' => 1], 'mercado' => ['publicaciones' => 0], 'en_curso' => [], 'canales' => ['servidor:4']];
$abrir = function (string $db): PDO {
    $p = new PDO("sqlite:$db", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $p->exec('PRAGMA busy_timeout = 10000');
    return $p;
};
$datos = function (PDO $p) use ($t, $D, $dia, $PLAN): void {
    $p->exec(DDL);
    $cols = array_column($p->query('PRAGMA table_info(servidores)')->fetchAll(), 'name');
    foreach (['universo_id', 'fusionado_en', 'fusionado_a'] as $c) if (!in_array($c, $cols, true)) $p->exec("ALTER TABLE servidores ADD COLUMN $c INTEGER");
    $x = fn(string $sql, array $a = []) => $p->prepare($sql)->execute($a);
    $x("INSERT OR IGNORE INTO universos (id, nombre, creado, activo) VALUES (1, 'Universo Andino', ?, 1)", [$t - 60 * $D]);
    $x('UPDATE servidores SET universo_id = 1 WHERE id = 1');
    foreach ([[2, 'Servidor 2 · Guayaquil', 1], [3, 'Servidor 3 · Cuenca', 1], [4, 'Servidor 4 · Loja', 1], [5, '<i>Prueba</i> · Sur', null]] as [$id, $n, $u]) {
        $x('INSERT OR REPLACE INTO servidores (id, nombre, capacidad, abierto, creado, universo_id) VALUES (?, ?, 1000, 1, ?, ?)', [$id, $n, $t - 50 * $D, $u]);
    }
    $srv = [1 => range(1, 8), 2 => range(9, 12), 3 => [13, 14], 4 => [15, 16]];
    foreach ($srv as $s => $js) foreach ($js as $j) $x('INSERT INTO jugadores (id, email, nombre, clave_hash, creado, servidor_id) VALUES (?, ?, ?, ?, ?, ?)', [$j, "j$j@prueba.example", "Jugador $j", 'x', $t - 40 * $D, $s]);
    $act = [[1, 0, [1, 2, 3]], [1, 3, [4, 5]], [1, 20, [6, 7, 8]], [2, 0, [9]], [2, 10, [10]], [4, 25, [15]]];
    foreach (range(1, 10) as $h) $act[] = [1, $h, [1]];
    foreach ($act as [$s, $h, $js]) foreach ($js as $j) $x('INSERT OR IGNORE INTO actividad_diaria (dia, jugador_id, servidor_id, eventos) VALUES (?, ?, ?, 1)', [$dia($h), $j, $s]);
    foreach ([[1, 3, 5, 6, 8, 'sano'], [2, 1, 1, 2, 2, 'bajo'], [3, 0, 0, 0, 0, 'bajo'], [4, 0, 0, 0, 1, 'abandono']] as [$s, $a1, $a7, $a14, $a30, $e]) {
        foreach ([1, 0] as $h) $x('INSERT OR REPLACE INTO servidor_salud (dia, servidor_id, activos_1, activos_7, activos_14, activos_30, eventos, mensajes, estado, creado) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)',
            [$dia($h), $s, $a1, $a7, $a14, $a30, $h ? 'sano' : $e, $t - $h * $D]);
    }
    $x("INSERT INTO copas (id, universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (1, 1, ?, 'balompie', 'Copa Planeta de Balompié', 'preparacion', ?, ?, ?)", [date('o-\WW'), $t - 3 * $D, $t + 4 * $D, $t - 3 * $D]);
    foreach ([[1, 120, 3, 1, 0, 0, 12, 1], [2, 80, 0, 0, 0, 1, -12, 2], [3, 10, 0, 0, 0, 0, 0, 3], [4, 0, 0, 0, 0, 0, 0, 4]] as [$s, $pp, $pt, $g, $em, $pe, $dc, $pos]) {
        $x('INSERT INTO copa_servidores (copa_id, servidor_id, puntos_prep, puntos_tabla, ganados, empatados, perdidos, dif_calidad, posicion) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)', [$s, $pp, $pt, $g, $em, $pe, $dc, $pos]);
    }
    $partidos = array_map(fn($n) => ['n' => $n, 'tipo' => 'final', 'calidad_a' => 80 + $n, 'calidad_b' => 78, 'ganador' => 'a'], range(1, 5));
    $x("INSERT INTO copa_cruces (id, copa_id, ronda, servidor_a, servidor_b, hora, estado, puntos_a, puntos_b, detalle_json) VALUES (1, 1, 1, 1, 2, ?, 'jugado', 52, 40, ?)", [$t - $D, json_encode(['partidos' => $partidos])]);
    $x("INSERT INTO copa_cruces (id, copa_id, ronda, servidor_a, servidor_b, hora, estado) VALUES (2, 1, 2, 1, 3, ?, 'pendiente')", [$t + $D]);
    $x("INSERT INTO fusiones (id, origen, destino, estado, plan_json, huella, sugerida, creado, creado_por) VALUES (1, 4, 2, 'plan', ?, 'h1', 1, ?, 'vigilancia')", [json_encode($PLAN, JSON_UNESCAPED_UNICODE), $t - 3600]);
    $x("INSERT INTO fusiones (id, origen, destino, estado, plan_json, huella, sugerida, creado, creado_por) VALUES (2, 3, 1, 'plan', ?, 'h2', 1, ?, 'vigilancia')", [json_encode(['origen' => 3, 'destino' => 1, 'jugadores' => 2]), $t - 1800]);
    $x("INSERT INTO avisos (tipo, detalle, creado) VALUES ('servidor_abandono', 'Servidor 4 · Loja entró en abandono: 0 activos en 14 días. Plan de fusión N° 1 sugerido.', ?)", [$t - 3600]);
};
foreach (['A', 'B'] as $k) { $p = $abrir($DB[$k]); $datos($p); $p = null; }
$pc = $abrir($DB['C']);
$pc->exec('PRAGMA foreign_keys = OFF');
foreach (TABLAS_MODULOS as $tb) $pc->exec("DROP TABLE IF EXISTS $tb");
$pc->exec("INSERT INTO jugadores (id, email, nombre, clave_hash, creado, servidor_id) VALUES (1, 'solo@prueba.example', 'Solo', 'x', $t, 1)");
$pc = null;
$pdo = $abrir($DB['A']);
$val = function (string $sql, array $a = [], string $k = 'A') use (&$pdo, $abrir, $DB) { $p = $k === 'A' ? $pdo : $abrir($DB[$k]); $s = $p->prepare($sql); $s->execute($a); return $s->fetchColumn(); };
$fila = function (string $sql, array $a = []) use (&$pdo) { $s = $pdo->prepare($sql); $s->execute($a); return $s->fetch() ?: []; };
check('Datos de ejemplo: 5 servidores, 16 jugadores, 2 planes de fusión, 1 copa con 2 cruces', [5, 16, 2, 2], [(int) $val('SELECT COUNT(*) FROM servidores'), (int) $val('SELECT COUNT(*) FROM jugadores'),
    (int) $val("SELECT COUNT(*) FROM fusiones WHERE estado = 'plan'"), (int) $val('SELECT COUNT(*) FROM copa_cruces')]);

// ------------------------------------------------------------------------------------------------ módulos simulados
// Mismas firmas que server/INTEGRAR_CONTROL_SERVIDORES.md (y las formas de Universos::resumen / SaludServidores::resumen
// reales). Se cargan ANTES que el autoload, así que en la base A siempre se usan estos (deterministas).
file_put_contents("$TMP/modulos_simulados.php", <<<'PHP'
<?php
declare(strict_types=1);
namespace EnVivo;
final class Universos {
    public static function resumen(): array {
        $o = [];
        foreach (Db::todas('SELECT * FROM universos ORDER BY id') as $u) {
            $sv = array_map(fn($s) => ['id' => (int) $s['id'], 'nombre' => $s['nombre'], 'universo_id' => (int) $s['universo_id'], 'capacidad' => (int) $s['capacidad'], 'abierto' => (bool) $s['abierto'],
                'creado' => (int) $s['creado'], 'fusionado_en' => $s['fusionado_en'] !== null ? (int) $s['fusionado_en'] : null, 'jugadores' => (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE servidor_id = ?', [$s['id']])],
                Db::todas('SELECT * FROM servidores WHERE universo_id = ? ORDER BY id', [$u['id']]));
            $o[] = ['id' => (int) $u['id'], 'nombre' => $u['nombre'], 'activo' => (bool) $u['activo'], 'creado' => (int) $u['creado'], 'servidores' => $sv];
        }
        return ['universos' => $o, 'siguiente_servidor' => 1];
    }
    public static function crear(string $nombre, int $n, string $quien): array {
        Fallo::si(mb_strlen($nombre) < 3, 'Nombre corto (simulado).', 400);
        return Db::tx(function () use ($nombre, $n, $quien): array {
            Db::q('INSERT INTO universos (nombre, creado, activo) VALUES (?, ?, 1)', [$nombre, time()]);
            $id = Db::ultimoId();
            for ($i = 0; $i < $n; $i++) { $s = (int) Db::valor('SELECT MAX(id) FROM servidores') + 1; Db::q('INSERT INTO servidores (id, nombre, capacidad, abierto, creado, universo_id) VALUES (?, ?, 1000, 1, ?, ?)', [$s, 'Servidor ' . $s . ' · Nuevo', time(), $id]); }
            Auditoria::anotar($quien, 'universo_crear', 'Universo ' . $id . ' (simulado)');
            return ['id' => $id, 'nombre' => $nombre, 'servidores' => []];
        });
    }
}
final class SaludServidores {
    public static function resumen(int $dias = 30): array {
        $o = [];
        foreach (Db::todas('SELECT * FROM servidores ORDER BY id') as $s) {
            $u = Db::fila('SELECT * FROM servidor_salud WHERE servidor_id = ? ORDER BY dia DESC LIMIT 1', [$s['id']]);
            $o[] = ['id' => (int) $s['id'], 'nombre' => $s['nombre'], 'salud' => $u ? ['estado' => $u['estado'], 'activos_1' => (int) $u['activos_1'], 'activos_7' => (int) $u['activos_7']] : null,
                    'historial' => array_map(fn($f) => ['dia' => $f['dia'], 'activos_1' => (int) $f['activos_1']], Db::todas('SELECT * FROM servidor_salud WHERE servidor_id = ? ORDER BY dia', [$s['id']]))];
        }
        return ['ok' => true, 'servidores' => $o];
    }
}
final class Fusiones {
    public static function plan(int $origen, int $destino): array {
        $n = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE servidor_id = ?', [$origen]);
        return ['origen' => ['id' => $origen, 'nombre' => 'x'], 'destino' => ['id' => $destino, 'nombre' => 'y'], 'resumen' => ['jugadores' => $n, 'activos_30' => 0, 'bloqueos' => $origen === 1 ? 1 : 0],
                'jugadores' => ['total' => $n, 'ids' => []], 'bloqueos' => $origen === 1 ? [['codigo' => 'copa', 'texto' => 'Hay una copa sin cerrar (simulado).']] : [], 'advertencias' => []];
    }
    public static function crearPlan(int $origen, int $destino, string $quien, bool $sugerida = false): int {
        return Db::tx(function () use ($origen, $destino, $quien, $sugerida): int {
            Db::q("UPDATE fusiones SET estado = 'cancelada', quien = ? WHERE origen = ? AND estado IN ('plan', 'aprobada')", [$quien, $origen]);
            Db::q("INSERT INTO fusiones (origen, destino, estado, plan_json, huella, sugerida, creado, creado_por) VALUES (?, ?, 'plan', ?, 'h', ?, ?, ?)", [$origen, $destino, json_encode(self::plan($origen, $destino)), (int) $sugerida, time(), $quien]);
            return Db::ultimoId();
        });
    }
    public static function ejecutar(int $plan_id, string $quien): array {
        return Db::tx(function () use ($plan_id, $quien): array {
            $f = Db::fila("SELECT * FROM fusiones WHERE id = ? AND estado = 'plan'", [$plan_id]);
            Fallo::si(!$f, 'Plan no ejecutable (simulado).', 409);
            $n = Db::q('UPDATE jugadores SET servidor_id = ? WHERE servidor_id = ?', [$f['destino'], $f['origen']])->rowCount();
            Db::q('UPDATE servidores SET fusionado_en = ?, fusionado_a = ?, abierto = 0 WHERE id = ?', [time(), $f['destino'], $f['origen']]);
            Db::q("UPDATE fusiones SET estado = 'ejecutada', ejecutada = ?, quien = ? WHERE id = ?", [time(), $quien, $plan_id]);
            Auditoria::anotar($quien, 'fusion_ejecutar', 'Fusión ' . $plan_id . ' (simulada)');
            return ['ok' => true, 'movidos' => $n];
        });
    }
}
final class Copas {
    public static function forzarFase(int $copa, string $fase, string $quien): void { Db::q('UPDATE copas SET fase = ? WHERE id = ?', [$fase, $copa]); }
    public static function rejugarCruce(int $cruce, string $quien): array {
        Db::q("UPDATE copa_cruces SET estado = 'jugado', puntos_a = 47, puntos_b = 45 WHERE id = ?", [$cruce]);
        return ['puntos_a' => 47, 'puntos_b' => 45];
    }
}
PHP);

// ------------------------------------------------------------------------------------------------ servidores
$arrancar = function (string $k, array $extra = [], ?string $router = null) use ($RAIZ, $TMP, $PU, &$PIDS) {
    $cmd = ['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', ...$extra, '-S', '127.0.0.1:' . $PU[$k], '-t', $RAIZ, $router ?? $RAIZ . '/server/tests/router_control.php'];
    $env = array_merge(getenv(), ['ENVIVO_CONFIG' => "$TMP/$k.env", 'PHP_CLI_SERVER_WORKERS' => '2']);
    $PIDS[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', "$TMP/srv_$k.log", 'a'], 2 => ['file', "$TMP/srv_$k.log", 'a']], $pipes, $RAIZ, $env);
    for ($i = 0; $i < 80; $i++) { if (@fsockopen('127.0.0.1', $PU[$k])) return true; usleep(100000); }
    return false;
};
// Base A: un enrutador que carga los módulos simulados antes que el del Centro de Control (el autoload ya no los busca).
file_put_contents("$TMP/router_simulado.php", '<?php require ' . var_export("$TMP/modulos_simulados.php", true) . '; return require ' . var_export("$SRV/tests/router_control.php", true) . ";\n");
si('Arrancan los 3 servidores de prueba (A: módulos simulados, B: módulos reales, C: sin tablas)', $arrancar('A', [], "$TMP/router_simulado.php") && $arrancar('B') && $arrancar('C'));

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_ctl_srv_' . $n . '_' . getmypid(); @unlink($this->jar); }
    public function __destruct() { @unlink($this->jar); }
    public function pedir(string $m, string $ruta, ?array $datos = null, array $cab = []): int {
        $ch = curl_init($this->base . $ruta);
        $this->cab = [];
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 60,
            CURLOPT_HEADERFUNCTION => function ($c, $h) { $p = explode(':', $h, 2); if (count($p) === 2) $this->cab[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); }]);
        if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($datos));
        $this->cuerpo = (string) curl_exec($ch);
        $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lugar = (string) ($this->cab['location'] ?? '');
        return $this->http;
    }
    public function get(string $r): int { return $this->pedir('GET', $r); }
    public function post(array $d, array $cab = []): int { return $this->pedir('POST', '/control/', $d, $cab); }
    public function tiene(string $t): bool { return str_contains($this->cuerpo, $t); }
    public function csrf(): string { return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $this->cuerpo, $m) ? $m[1] : ''; }
    public function entrar(string $u, string $c): int { $this->get('/control/'); return $this->post(['accion' => 'entrar', 'csrf' => $this->csrf(), 'usuario' => $u, 'clave' => $c]); }
    /** Manda una acción con el código CSRF de la pestaña; devuelve el aviso de la página siguiente ("ok: ..." / "error: ..."). */
    public function accion(array $d, string $desde = '/control/?t=servidores'): string {
        $this->get($desde);
        $d += ['csrf' => $this->csrf(), 'volver' => $desde];
        $this->post($d);
        if ($this->http !== 303) return 'HTTP ' . $this->http;
        $this->get($this->lugar);
        return preg_match('/<div class="aviso aviso-(ok|error)" id="aviso"[^>]*>(.*?)<\/div>/s', $this->cuerpo, $m) ? $m[1] . ': ' . html_entity_decode($m[2], ENT_QUOTES) : 'sin aviso';
    }
}
$aud = fn(string $accion, string $k = 'A') => (int) $val('SELECT COUNT(*) FROM auditoria WHERE accion = ?', [$accion], $k);
$ultAud = fn(string $accion) => $fila('SELECT * FROM auditoria WHERE accion = ? ORDER BY id DESC LIMIT 1', [$accion]);
$estadoFusion = fn(int $id, string $k = 'A') => (string) $val('SELECT estado FROM fusiones WHERE id = ?', [$id], $k);
$TAB = '/control/?t=servidores';

// ------------------------------------------------------------------------------------------------ A: la pestaña
titulo('A) Pestaña Servidores con los módulos simulados');
$c = new Cli("http://127.0.0.1:$PA", 'a');
check('Sin sesión ?t=servidores muestra la entrada (no la pestaña)', [200, false, true], [$c->get($TAB), $c->tiene('panel-universos'), $c->tiene('id="form-entrar"')]);
check('Entrar con el formulario -> 303', 303, $c->entrar($USUARIO, $CLAVE));
$c->get($TAB);
check('200, pestaña activa y en la barra con la insignia de 2 planes pendientes', [200, true, true], [$c->http, $c->tiene('data-pestana="servidores"'),
    (bool) preg_match('#\?t=servidores" class="activa" aria-current="page">Servidores <span class="insignia">2</span>#', $c->cuerpo)]);
check('Bloques: universos, copa, avisos de abandono, crear universo (ninguno "Módulo no instalado")', [true, true, true, true, false],
    [$c->tiene('id="panel-universos"'), $c->tiene('id="panel-copa"'), $c->tiene('id="panel-fusiones"'), $c->tiene('Crear universo (3 servidores)'), $c->tiene('data-no-instalado')]);
check('Universo Andino con sus 4 servidores; el servidor sin universo aparte', [true, 4, true], [$c->tiene('Universo Andino'),
    preg_match('#<table id="tabla-servidores-u1">.*?</table>#s', $c->cuerpo, $m) ? substr_count($m[0], '<tr>') - 1 : -1, $c->tiene('id="tabla-servidores-sueltos"')]);
$fila_srv = fn(string $nombre) => preg_match('#<tr><td><b>' . preg_quote($nombre, '#') . '</b>.*?</tr>#s', $c->cuerpo, $m) ? $m[0] : '';
check('Activos 1/7/30 días (actividad_diaria): Quito 3/5/8, Guayaquil 1/1/2, Cuenca 0/0/0, Loja 0/0/1',
    [true, true, true, true], [str_contains($fila_srv('Servidor 1 · Quito'), '<td>3 / 5 / 8</td>'), str_contains($fila_srv('Servidor 2 · Guayaquil'), '<td>1 / 1 / 2</td>'),
     str_contains($fila_srv('Servidor 3 · Cuenca'), '<td>0 / 0 / 0</td>'), str_contains($fila_srv('Servidor 4 · Loja'), '<td>0 / 0 / 1</td>')]);
check('Jugadores por servidor (Quito 8, Loja 2)', [true, true], [str_contains($fila_srv('Servidor 1 · Quito'), '<td>8<br>'), str_contains($fila_srv('Servidor 4 · Loja'), '<td>2<br>')]);
check('Estado de salud (SaludServidores::resumen, salud.estado): sano, bajo, abandono', [true, true, true],
    [str_contains($fila_srv('Servidor 1 · Quito'), 'chip-ok">sano'), str_contains($fila_srv('Servidor 2 · Guayaquil'), 'chip-aviso">bajo'), str_contains($fila_srv('Servidor 4 · Loja'), 'chip-mal">abandono')]);
preg_match_all('#<svg class="sparkline"[^>]*>.*?</svg>#s', $c->cuerpo, $sv);
check('Gráfico de 30 días en SVG por servidor (5), con polilínea de 30 puntos, detalle y título', [5, 30, true, true],
    [count($sv[0]), preg_match('#<polyline points="([^"]+)"#', $sv[0][0] ?? '', $mm) ? count(explode(' ', $mm[1])) : 0, str_contains($sv[0][0] ?? '', 'data-tip="Servidor 1 · Quito · últimos 30 días: máximo 3, hoy 3"'), str_contains($sv[0][0] ?? '', '<title>')]);
check('Sin librerías: ningún <script> además de control.js', 1, substr_count($c->cuerpo, '<script'));
check('Nombres de servidor escapados (sin HTML inyectado)', [true, false], [$c->tiene('&lt;i&gt;Prueba&lt;/i&gt; · Sur'), $c->tiene('<i>Prueba</i>')]);
check('Copa: torneo, fase, tabla y cruces (resultado y 5 partidos)', [true, true, true, true, true, true],
    [$c->tiene('Copa Planeta de Balompié'), $c->tiene('chip-aviso">Preparación'), $c->tiene('id="tabla-copa-1"'), $c->tiene('id="tabla-cruces-1"'), $c->tiene('52 – 40'), $c->tiene('5 partidos')]);
check('Copa: la tabla en orden (Quito 1°, con 3 puntos y 1-0-0)', true, (bool) preg_match('#<table id="tabla-copa-1">.*?<td>1</td><td>Servidor 1 · Quito</td><td><b>3</b></td><td>1-0-0</td>#s', $c->cuerpo));
check('Copa: administrar (forzar fase y rejugar cruce, con confirmación)', [true, true, true],
    [$c->tiene('name="accion" value="servidores_copa_fase"'), $c->tiene('name="accion" value="servidores_copa_rejugar"'), (bool) preg_match('#data-confirmar="¿Rejugar el cruce#', $c->cuerpo)]);
check('Avisos: los 2 planes con su resumen (jugadores, choques de alias, asociaciones) y el aviso de la vigilancia', [true, true, true, true, true],
    [$c->tiene('id="aviso-fusion-1"'), $c->tiene('id="aviso-fusion-2"'), $c->tiene('<dt>Jugadores a mover</dt><dd>total: 2 · activos: 0 · inactivos: 2</dd>'), $c->tiene('<dt>Choques de alias</dt><dd>1</dd>'), $c->tiene('id="avisos-vigilancia"')]);
check('Aprobar pide escribir el nombre del servidor y confirma; Cancelar también confirma', [true, true, true],
    [(bool) preg_match('#<form method="post" action="/control/" class="form" data-confirmar="¿Fusionar Servidor 4 · Loja en Servidor 2 · Guayaquil\?[^"]*">.*?name="fusion_id" value="1">.*?name="confirmar_nombre" required#s', $c->cuerpo),
     $c->tiene('escribe el nombre del servidor <b>Servidor 4 · Loja</b>'), (bool) preg_match('#data-confirmar="¿Cancelar este plan de fusión\?"#', $c->cuerpo)]);
check('Todos los formularios POST de la pestaña llevan el código CSRF', true, (function () use ($c) {
    preg_match_all('/<form method="post"[^>]*>(.*?)<\/form>/s', $c->cuerpo, $m);
    return count($m[1]) >= 8 && count(array_filter($m[1], fn($f) => !preg_match('/name="csrf" value="[a-f0-9]{64}"/', $f))) === 0;
})());
check('KPIs: universos 1, servidores 5, activos 7 días 6, avisos 2', [true, true, true, true], [(bool) preg_match('#id="kpi-universos".*?<b class="kpi-v">1</b>#s', $c->cuerpo),
    (bool) preg_match('#id="kpi-servidores".*?<b class="kpi-v">5</b>#s', $c->cuerpo), (bool) preg_match('#id="kpi-activos7".*?<b class="kpi-v">6</b>#s', $c->cuerpo), (bool) preg_match('#id="kpi-avisos".*?<b class="kpi-v">2</b>#s', $c->cuerpo)]);
$c->get($TAB . '&plan_origen=4&plan_destino=1');
check('Vista previa de un plan con otro destino (Fusiones::plan, solo lectura, con su "resumen")', [200, true, true, true, 2], [$c->http, $c->tiene('<h4>Servidor 4 · Loja → Servidor 1 · Quito</h4>'),
    $c->tiene('<dt>Jugadores a mover</dt><dd>2</dd>'), $c->tiene('value="servidores_fusion_plan"'), (int) $val('SELECT COUNT(*) FROM fusiones')]);
$c->get($TAB . '&plan_origen=1&plan_destino=2');
check('Vista previa con bloqueos: se muestran en rojo', [true, true], [$c->tiene('data-bloqueos="1"'), $c->tiene('Hay una copa sin cerrar (simulado).')]);

// ------------------------------------------------------------------------------------------------ A: aprobar
titulo('A) Aprobar una fusión: CSRF, nombre escrito y auditoría');
$csrfMalo = $aud('control_csrf_rechazado');
check('POST aprobar sin código CSRF -> 403 y el plan sigue en "plan"', [403, 'plan'], [$c->post(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => 'Servidor 4 · Loja']), $estadoFusion(1)]);
$otra = new Cli("http://127.0.0.1:$PA", 'otra');
$otra->entrar($USUARIO, $CLAVE); $otra->get($TAB);
$c->get($TAB);
check('POST aprobar con el código de OTRA sesión -> 403', 403, $c->post(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => 'Servidor 4 · Loja', 'csrf' => $otra->csrf()]));
$c->get($TAB);
check('POST aprobar con código bueno pero Origin de otro sitio -> 403', 403, $c->post(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => 'Servidor 4 · Loja', 'csrf' => $c->csrf()], ['Origin: https://malo.example']));
check('…nada cambió y los 3 rechazos quedaron en la auditoría (control_csrf_rechazado)', ['plan', 3, 2], [$estadoFusion(1), $aud('control_csrf_rechazado') - $csrfMalo, (int) $val('SELECT COUNT(*) FROM jugadores WHERE servidor_id = 4')]);
$r = $c->accion(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => 'Servidor 2 · Guayaquil']);
check('Escribir otro nombre (el del destino) -> error, no se fusiona, queda auditado', [true, 'plan', 1, 0], [str_starts_with($r, 'error: Para aprobar la fusión escribe el nombre'), $estadoFusion(1), $aud('servidores_fusion_confirmacion_mala'), $aud('fusion_ejecutar')]);
check('Sin nombre -> error, no se fusiona', [true, 'plan'], [str_starts_with($c->accion(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => '']), 'error:'), $estadoFusion(1)]);
$r = $c->accion(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => '  servidor 4 loja ']);
check('Nombre bien escrito (sin "·" ni mayúsculas) -> ok, Fusiones::ejecutar movió a los 2 jugadores', ['ok: Fusión aprobada: Servidor 4 · Loja → Servidor 2 · Guayaquil (2 jugadores movidos).', 'ejecutada', 0, 6],
    [$r, $estadoFusion(1), (int) $val('SELECT COUNT(*) FROM jugadores WHERE servidor_id = 4'), (int) $val('SELECT COUNT(*) FROM jugadores WHERE servidor_id = 2')]);
$a = $ultAud('servidores_fusion_aprobar');
check('Auditoría servidores_fusion_aprobar (quién, detalle, IP) y la del módulo', [$QUIEN, true, '127.0.0.1', 1, $QUIEN],
    [$a['quien'] ?? null, str_contains($a['detalle'] ?? '', 'Plan N° 1: Servidor 4 · Loja → Servidor 2 · Guayaquil aprobado y ejecutado · 2 jugadores movidos'), $a['ip'] ?? null, $aud('fusion_ejecutar'), (string) $val('SELECT quien FROM fusiones WHERE id = 1')]);
check('Aprobar otra vez el mismo plan -> error "ya está ejecutada"', true, str_contains($c->accion(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => 'Servidor 4 · Loja']), 'ya está ejecutada'));
check('Aprobar un plan que no existe -> error', true, str_starts_with($c->accion(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 99, 'confirmar_nombre' => 'x']), 'error: Ese plan'));
$c->get($TAB);
check('Después: sin el aviso 1, en el historial como ejecutada, Loja "fusionado" en N° 2 y la insignia en 1', [false, true, true, true, true],
    [$c->tiene('id="aviso-fusion-1"'), (bool) preg_match('#id="tabla-fusiones-historial">.*?chip-ok">ejecutada#s', $c->cuerpo), str_contains($fila_srv('Servidor 4 · Loja'), '>fusionado</span>'), str_contains($fila_srv('Servidor 4 · Loja'), 'en N° 2'),
     (bool) preg_match('#>Servidores <span class="insignia">1</span>#', $c->cuerpo)]);

titulo('A) Cancelar, crear universo, forzar fase y rejugar cruce');
$c->get($TAB);
check('Cancelar sin CSRF -> 403', [403, 'plan'], [$c->post(['accion' => 'servidores_fusion_cancelar', 'fusion_id' => 2]), $estadoFusion(2)]);
$r = $c->accion(['accion' => 'servidores_fusion_cancelar', 'fusion_id' => 2, 'motivo' => 'Cuenca va a crecer con la feria']);
check('Cancelar el plan 2 -> ok, estado cancelada (Fusiones sin cancelar(): la tabla), auditado con el motivo', [true, 'cancelada', true],
    [str_starts_with($r, 'ok: Plan de fusión N° 2 cancelado'), $estadoFusion(2), str_contains($ultAud('servidores_fusion_cancelar')['detalle'] ?? '', 'motivo: Cuenca va a crecer con la feria')]);
check('Cancelar otra vez -> error', true, str_starts_with($c->accion(['accion' => 'servidores_fusion_cancelar', 'fusion_id' => 2]), 'error:'));
check('Armar un plan sin CSRF -> 403, nada nuevo', [403, 2], [$c->post(['accion' => 'servidores_fusion_plan', 'origen' => 3, 'destino' => 2]), (int) $val('SELECT COUNT(*) FROM fusiones')]);
check('Armar un plan con origen = destino -> error', true, str_starts_with($c->accion(['accion' => 'servidores_fusion_plan', 'origen' => 3, 'destino' => 3]), 'error:'));
$r = $c->accion(['accion' => 'servidores_fusion_plan', 'origen' => 3, 'destino' => 2]);
check('Armar el plan Cuenca → Guayaquil (Fusiones::crearPlan) -> ok, plan 3 pendiente, auditado', [true, 'plan', true],
    [str_starts_with($r, 'ok: Plan de fusión N° 3 guardado: Servidor 3 · Cuenca → Servidor 2 · Guayaquil'), $estadoFusion(3), str_contains($ultAud('servidores_fusion_plan')['detalle'] ?? '', 'Plan N° 3')]);
$nU = (int) $val('SELECT COUNT(*) FROM universos'); $nS = (int) $val('SELECT COUNT(*) FROM servidores');
check('Crear universo con 0 servidores o con 13 -> error', [true, true], [str_starts_with($c->accion(['accion' => 'servidores_universo_crear', 'n' => 0, 'nombre' => 'Universo Austral']), 'error:'),
    str_starts_with($c->accion(['accion' => 'servidores_universo_crear', 'n' => 13, 'nombre' => 'Universo Austral']), 'error:')]);
check('Crear universo sin nombre -> error', true, str_starts_with($c->accion(['accion' => 'servidores_universo_crear', 'n' => 3, 'nombre' => '']), 'error: El nombre'));
$r = $c->accion(['accion' => 'servidores_universo_crear', 'n' => 3, 'nombre' => 'Universo Austral']);
check('Crear "Universo Austral" con 3 servidores -> ok, universos +1, servidores +3, auditado', [true, $nU + 1, $nS + 3, 1, $QUIEN],
    [str_starts_with($r, 'ok: Universo N° 2 creado con 3 servidores'), (int) $val('SELECT COUNT(*) FROM universos'), (int) $val('SELECT COUNT(*) FROM servidores'), $aud('servidores_universo_crear'), $ultAud('servidores_universo_crear')['quien'] ?? null]);
$c->get($TAB);
check('El universo nuevo se ve con sus 3 servidores', [true, true], [$c->tiene('Universo Austral'), $c->tiene('id="tabla-servidores-u2"')]);
check('Forzar una fase que no existe -> error, la copa no cambia', [true, 'preparacion'], [str_starts_with($c->accion(['accion' => 'servidores_copa_fase', 'copa_id' => 1, 'fase' => 'final']), 'error:'), (string) $val('SELECT fase FROM copas WHERE id = 1')]);
check('Forzar fase sin CSRF -> 403', 403, $c->post(['accion' => 'servidores_copa_fase', 'copa_id' => 1, 'fase' => 'batalla']));
$r = $c->accion(['accion' => 'servidores_copa_fase', 'copa_id' => 1, 'fase' => 'batalla']);
check('Forzar fase "batalla" -> ok, copa en batalla, auditado (preparacion → batalla)', ['ok: Copa N° 1: fase cambiada a Batalla.', 'batalla', true],
    [$r, (string) $val('SELECT fase FROM copas WHERE id = 1'), str_contains($ultAud('servidores_copa_fase')['detalle'] ?? '', 'fase preparacion → batalla')]);
$r = $c->accion(['accion' => 'servidores_copa_rejugar', 'cruce_id' => 2]);
check('Rejugar el cruce 2 -> ok con el resultado, auditado', ['ok: Cruce Servidor 1 · Quito vs Servidor 3 · Cuenca rejugado → 47 – 45.', 'jugado', true],
    [$r, (string) $val('SELECT estado FROM copa_cruces WHERE id = 2'), str_contains($ultAud('servidores_copa_rejugar')['detalle'] ?? '', 'Cruce N° 2 de la copa N° 1 (Servidor 1 · Quito vs Servidor 3 · Cuenca) rejugado → 47 – 45')]);
check('Rejugar un cruce que no existe -> error', true, str_starts_with($c->accion(['accion' => 'servidores_copa_rejugar', 'cruce_id' => 77]), 'error:'));
check('Acción servidores_* desconocida -> error', 'error: Acción desconocida.', $c->accion(['accion' => 'servidores_borrar_todo']));

// ------------------------------------------------------------------------------------------------ B y C
titulo('B) Los mismos datos con los módulos reales de server/src (los que haya)');
$hay = fn(string $clase) => is_file("$SRV/src/$clase.php");
echo '  (módulos en src: ' . implode(', ', array_map(fn($x) => $x . ($hay($x) ? ' sí' : ' no'), ['Universos', 'SaludServidores', 'Fusiones', 'Copas'])) . ")\n";
$b = new Cli("http://127.0.0.1:$PB", 'b');
$b->entrar($USUARIO, $CLAVE);
$b->get($TAB);
check('B: 200 con los 4 bloques, sin "No se pudo leer" ni "falló"', [200, true, true, true, true, false, false],
    [$b->http, $b->tiene('id="panel-universos"'), $b->tiene('id="panel-copa"'), $b->tiene('id="panel-fusiones"'), $b->tiene('id="panel-crear-universo"'), $b->tiene('No se pudo leer'), $b->tiene('falló (')]);
check('B: universos, servidores y gráficos se ven; "Módulo no instalado" solo donde falta la clase', [true, true, !$hay('Universos'), !$hay('Fusiones'), !$hay('Universos'), !$hay('Copas')],
    [$b->tiene('Universo Andino'), $b->tiene('<svg class="sparkline"'), $b->tiene('id="universos-no-instalado"') || $b->tiene('id="crear-no-instalado"'), $b->tiene('id="fusion-ejecutar-no-instalado"'), $b->tiene('id="crear-no-instalado"'),
     $b->tiene('Forzar fase: Módulo no instalado')]);
$r = $b->accion(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => 'Servidor 4 · Loja']);
if (!$hay('Fusiones')) check('B: aprobar sin Fusiones -> "Módulo no instalado" y no se toca nada', [true, 'plan'], [str_contains($r, 'Módulo no instalado'), $estadoFusion(1, 'B')]);
else check('B: aprobar con el Fusiones real responde (ok o error claro) sin romper la página', [true, true], [str_starts_with($r, 'ok:') || str_starts_with($r, 'error:'), in_array($estadoFusion(1, 'B'), ['plan', 'ejecutada'], true)]);
$r = $b->accion(['accion' => 'servidores_universo_crear', 'n' => 2, 'nombre' => 'Universo Pacífico']);
check('B: crear universo con el módulo real (o "Módulo no instalado")', true, $hay('Universos') ? str_starts_with($r, 'ok: Universo N° ') && (int) $val("SELECT COUNT(*) FROM universos WHERE nombre = 'Universo Pacífico'", [], 'B') === 1 : str_contains($r, 'Módulo no instalado'));
$r = $b->accion(['accion' => 'servidores_copa_fase', 'copa_id' => 1, 'fase' => 'batalla']);
check('B: forzar fase "batalla" con el Copas real (forzarFase o el respaldo) -> ok y auditado', $hay('Copas') ? [true, 'batalla', 1] : [true, 'preparacion', 0],
    [$hay('Copas') ? str_starts_with($r, 'ok: Copa N° 1: fase cambiada a Batalla') : str_contains($r, 'Módulo no instalado'), (string) $val('SELECT fase FROM copas WHERE id = 1', [], 'B'), $aud('servidores_copa_fase', 'B')]);
if ($hay('Copas') && !str_contains((string) file_get_contents("$SRV/src/Copas.php"), 'function forzarFase')) {
    check('B: sin Copas::forzarFase la fase no vuelve atrás (error claro)', true, str_contains($b->accion(['accion' => 'servidores_copa_fase', 'copa_id' => 1, 'fase' => 'preparacion']), 'solo avanza'));
}

titulo('C) Base sin las tablas de los módulos');
$cc = new Cli("http://127.0.0.1:$PC", 'c');
$cc->entrar($USUARIO, $CLAVE);
$cc->get($TAB);
$falta = fn(string $tb) => !(bool) $val("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$tb], 'C');   // (si otro módulo cambió sus .sql mientras corre la prueba, se vuelven a crear)
check('C: 200 y la lista de servidores sueltos', [200, true], [$cc->http, $cc->tiene('id="tabla-servidores-sueltos"')]);
check('C: "Módulo no instalado" en universos, copa y fusiones (las tablas no están)', [$falta('universos'), $falta('copas'), $falta('fusiones')],
    [$cc->tiene('id="universos-no-instalado"'), $cc->tiene('id="copa-no-instalada"'), $cc->tiene('id="fusiones-no-instaladas"')]);
check('C: acciones -> error "Módulo no instalado" (no 500)', [true, true, true], [str_contains($cc->accion(['accion' => 'servidores_fusion_aprobar', 'fusion_id' => 1, 'confirmar_nombre' => 'x']), $falta('fusiones') ? 'Módulo no instalado' : 'error:'),
    str_contains($cc->accion(['accion' => 'servidores_copa_rejugar', 'cruce_id' => 1]), 'error:'), str_contains($cc->accion(['accion' => 'servidores_copa_fase', 'copa_id' => 1, 'fase' => 'batalla']), 'error:')]);
check('C: las demás pestañas siguen bien (resumen, ajustes)', [200, 200], [$cc->get('/control/?t=resumen'), $cc->get('/control/?t=ajustes')]);

// ------------------------------------------------------------------------------------------------ navegador
titulo('Navegador de verdad (Playwright + Chromium, celular 390x844)');
$NP = getenv('NODE_PATH') ?: '/opt/npm-tools/node_modules';
if (is_dir($NP . '/playwright')) {
    file_put_contents("$TMP/navegador_servidores.cjs", <<<'JS'
// Igual que server/tests/navegador_control.cjs, para la pestaña Servidores.
const { chromium } = require('playwright');
(async () => {
  const [base, usuario, clave, carpeta] = process.argv.slice(2);
  const r = { ok: false, paginas: {}, errores: [], pasos: {} };
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-EC', deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => r.errores.push('pagina: ' + e));
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') r.errores.push('consola (' + p.url() + '): ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    const desborde = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await p.goto(base + '/control/');
    await p.fill('input[name="usuario"]', usuario);
    await p.fill('input[name="clave"]', clave);
    await Promise.all([p.waitForNavigation(), p.click('#form-entrar button[type="submit"]')]);
    let res = await p.goto(base + '/control/?t=servidores');
    await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    r.paginas.servidores = { http: res.status(), desborde: await desborde() };
    await p.screenshot({ path: carpeta + '/control_servidores.png', fullPage: true });
    res = await p.goto(base + '/control/?t=servidores&plan_origen=3&plan_destino=1');
    r.paginas.plan_previo = { http: res.status(), desborde: await desborde() };
    await p.goto(base + '/control/?t=servidores');
    const sp = p.locator('svg.sparkline').first();
    await sp.scrollIntoViewIfNeeded();
    await sp.tap();
    r.pasos.tip = (await p.locator('#tip').isVisible()) && /últimos 30 días/.test(await p.textContent('#tip'));
    const f = p.locator('#aviso-fusion-3 form:has(input[name="confirmar_nombre"])');
    await f.locator('input[name="confirmar_nombre"]').fill('Cuenca');
    await Promise.all([p.waitForNavigation(), f.locator('button[type="submit"]').click()]);
    r.pasos.nombre_malo = (await p.locator('#aviso.aviso-error').count()) === 1;
    const g = p.locator('#aviso-fusion-3 form:has(input[name="confirmar_nombre"])');
    await g.locator('input[name="confirmar_nombre"]').fill('Servidor 3 · Cuenca');
    await Promise.all([p.waitForNavigation(), g.locator('button[type="submit"]').click()]);
    r.pasos.aprobada = (await p.locator('#aviso.aviso-ok').count()) === 1 && (await p.locator('#aviso-fusion-3').count()) === 0;
    r.paginas.tras_aprobar = { http: 200, desborde: await desborde() };
    await ctx.close();
    r.ok = r.pasos.tip && r.pasos.nombre_malo && r.pasos.aprobada && Object.values(r.paginas).every((x) => x.http === 200 && x.desborde === 0) && r.errores.length === 0;
  } catch (e) {
    r.errores.push(String(e));
  }
  await nav.close();
  console.log(JSON.stringify(r));
})();
JS);
    $sal = trim((string) shell_exec('NODE_PATH=' . escapeshellarg($NP) . ' node ' . escapeshellarg("$TMP/navegador_servidores.cjs") . ' ' . escapeshellarg("http://127.0.0.1:$PA") . ' ' . escapeshellarg($USUARIO) . ' ' . escapeshellarg($CLAVE) . ' ' . escapeshellarg($CAPTURAS) . ' 2>&1'));
    $ult = json_decode((string) substr($sal, (int) strrpos("\n" . $sal, "\n{")), true) ?? ['crudo' => $sal];
    echo '  ' . json_encode($ult, JSON_UNESCAPED_UNICODE) . "\n";
    foreach (($ult['paginas'] ?? []) as $n => $pg) check("Navegador: $n sin desplazamiento horizontal a 390 px (HTTP 200)", [200, 0], [$pg['http'], $pg['desborde']]);
    check('Navegador: tocar el gráfico muestra el detalle; nombre malo -> error; nombre bueno -> fusión aprobada', ['tip' => true, 'nombre_malo' => true, 'aprobada' => true], $ult['pasos'] ?? null);
    check('Navegador: sin errores de consola ni de la página (CSP incluida)', [], $ult['errores'] ?? ['sin respuesta']);
    check('Navegador: la fusión 3 quedó ejecutada y auditada', ['ejecutada', 2], [$estadoFusion(3), $aud('servidores_fusion_aprobar')]);
    echo "  Captura en $CAPTURAS/control_servidores.png\n";
} else {
    echo "  (no hay Playwright en $NP: se salta)\n";
}

titulo('Registro de PHP');
$log = @file_get_contents("$TMP/php_errores.log") ?: '';
foreach (glob("$TMP/srv_*.log") as $f) $log .= (string) file_get_contents($f);
$malos = array_values(array_filter(preg_split('/\n/', $log), fn($l) => preg_match('/fatal|warning|deprecated|notice|EN VIVO (control|servidores)/i', $l)));
check('Sin errores ni avisos de PHP', [], array_slice($malos, 0, 5));

echo "\n----------------------------------------\npruebas_control_servidores.php: $ok correctas, $fallas fallas\n";
exit($fallas === 0 ? 0 : 1);
