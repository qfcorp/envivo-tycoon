<?php
// SOLO PRUEBAS (en una máquina de pruebas; nunca en el servidor del juego).
// Duelo de Productoras y Desafío Técnico del Día (server/INTEGRAR_DUELOS_DESAFIO.md) de punta a punta:
//  - base SQLite y configuración TEMPORALES, "php -S" con un enrutador que hace EXACTAMENTE la integración documentada
//    para api.php (Duelos::ruta / Desafio::ruta) y delega el resto a server/tests/router.php;
//  - el validador de verdad (server/validador/servidor.js por HTTP con clave) y server/eventos/motor.js (Node);
//  - también llama a las clases directamente (mismo archivo de base) para lo que necesita reloj o fallas simuladas.
// Uso:  php server/tests/pruebas_duelos_desafio.php        (GUARDAR_TMP=1 para dejar los archivos)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
date_default_timezone_set('America/Guayaquil');
$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_duelos_' . getmypid();
@mkdir($TMP . '/datos', 0755, true);
$NODE = trim((string) shell_exec('command -v node'));
if ($NODE === '') { fwrite(STDERR, "Falta Node (node) para el validador.\n"); exit(2); }
$P_APP = (int) (getenv('P_APP') ?: 8391); $P_VAL = (int) (getenv('P_VAL') ?: 8392);
$CLAVE_VAL = bin2hex(random_bytes(16));
file_put_contents("$TMP/config.env", "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:$P_APP\nENVIVO_ZONA=America/Guayaquil\n"
    . "PLUX_AMBIENTE=sandbox\nNODE_BIN=$NODE\nVALIDADOR_URL=http://127.0.0.1:$P_VAL\nVALIDADOR_CLAVE=$CLAVE_VAL\n");
putenv("ENVIVO_CONFIG=$TMP/config.env");
// Si js/logic.js del working copy no carga (otro ayudante lo está cambiando a medias), se prueba con la última versión
// guardada en git (js/logic.js, js/premium.js y js/datos.js si existe). El validador usa ENVIVO_JUEGO para eso.
$JUEGO = $RAIZ;
exec(escapeshellarg($NODE) . ' ' . escapeshellarg("$RAIZ/server/validador/validador.js") . ' --version 2>/dev/null', $salida, $cod);
if ($cod !== 0) {
    $JUEGO = "$TMP/juego"; @mkdir("$JUEGO/js", 0755, true);
    foreach (['logic.js', 'premium.js', 'datos.js'] as $f) {
        $t = shell_exec('git -C ' . escapeshellarg($RAIZ) . ' show HEAD:js/' . $f . ' 2>/dev/null');
        if (is_string($t) && $t !== '') file_put_contents("$JUEGO/js/$f", $t);
    }
    echo "(aviso: js/logic.js no carga ahora; se prueba con la versión de git HEAD en $JUEGO)\n";
}
putenv("ENVIVO_JUEGO=$JUEGO");

// Enrutador de prueba = la integración que pide INTEGRAR_DUELOS_DESAFIO.md (mismas comprobaciones que api.php)
file_put_contents("$TMP/router_prueba.php", '<?php
$ruta = (string) parse_url((string) $_SERVER["REQUEST_URI"], PHP_URL_PATH);
if (preg_match("#^/api/(duelos|desafio)(/|$)#", $ruta)) {
    require ' . var_export($RAIZ . '/server/src/arranque.php', true) . ';
    $r = "/" . trim(substr($ruta, 4), "/"); $metodo = (string) $_SERVER["REQUEST_METHOD"];
    try {
        EnVivo\Db::pdo();
        if ($metodo === "POST" && ($_SERVER["HTTP_X_ENVIVO"] ?? "") !== "1") EnVivo\Http::error(403, "Petición no permitida.");
        if (($x = EnVivo\Duelos::ruta($r, $metodo) ?? EnVivo\Desafio::ruta($r, $metodo)) !== null) EnVivo\Http::json(200, $x);
        EnVivo\Http::error(404, "No encontrado.");
    } catch (EnVivo\Fallo $e) { EnVivo\Http::error($e->getCode() ?: 400, $e->getMessage(), $e->extra); }
    catch (\Throwable $e) { error_log("PRUEBA " . get_class($e) . " " . $e->getMessage() . " " . $e->getFile() . ":" . $e->getLine()); EnVivo\Http::error(500, "Error: " . $e->getMessage()); }
}
return require ' . var_export($RAIZ . '/server/tests/router.php', true) . ';');

$procs = [];
$arrancar = function (array $cmd, array $env, string $log) use (&$procs) {
    $p = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $t, null, $env + ['PATH' => getenv('PATH')]);
    $procs[] = $p;
    return $p;
};
register_shutdown_function(function () use (&$procs, $TMP) {
    foreach ($procs as $p) { $s = proc_get_status($p); if ($s['running']) { posix_kill($s['pid'], 15); } proc_close($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});
$arrancar(['php', '-d', 'variables_order=EGPCS', '-S', "127.0.0.1:$P_APP", '-t', $RAIZ, "$TMP/router_prueba.php"], ['ENVIVO_CONFIG' => "$TMP/config.env", 'TZ' => 'America/Guayaquil', 'ENVIVO_JUEGO' => $JUEGO], "$TMP/php.log");
$procVal = $arrancar([$NODE, "$RAIZ/server/validador/servidor.js"], ['VALIDADOR_CLAVE' => $CLAVE_VAL, 'VALIDADOR_PUERTO' => (string) $P_VAL, 'ENVIVO_JUEGO' => $JUEGO], "$TMP/validador.log");
$esperar = function (string $url, array $cab = []) { for ($i = 0; $i < 80; $i++) { $c = curl_init($url); curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_PROXY => '', CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 1]); curl_exec($c); $h = curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c); if ($h > 0) return true; usleep(100000); } return false; };
$esperar("http://127.0.0.1:$P_APP/api/duelos");
$esperar("http://127.0.0.1:$P_VAL/salud", ["X-Validador-Clave: $CLAVE_VAL"]);

require $RAIZ . '/server/src/arranque.php';
use EnVivo\{Db, Desafio, Duelos, Fallo, Inventario, Monedero, Repeticion};
Db::pdo();

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }

final class Nav {
    public int $http = 0; private string $jar;
    public function __construct(private string $base, string $n) { $this->jar = getenv('ENVIVO_TMP') . "/jar_$n"; }
    public function pedir(string $m, string $ruta, ?array $d = null, bool $cab = true): array {
        $c = curl_init($this->base . $ruta);
        $h = ['Content-Type: application/json']; if ($cab) $h[] = 'X-Envivo: 1';
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $m,
            CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 60]);
        if ($d !== null) curl_setopt($c, CURLOPT_POSTFIELDS, json_encode($d));
        $r = (string) curl_exec($c); $this->http = (int) curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
        return json_decode($r, true) ?? ['crudo' => $r];
    }
    public function get(string $r): array { return $this->pedir('GET', $r); }
    public function post(string $r, array $d = [], bool $cab = true): array { return $this->pedir('POST', $r, $d, $cab); }
}
putenv("ENVIVO_TMP=$TMP");
$BASE = "http://127.0.0.1:$P_APP";
$n = 0;
$jugador = function (string $nombre, int $fama = 30) use ($BASE, &$n): array {
    $n++;
    $nav = new Nav($BASE, "j$n");
    $r = $nav->post('/api/registro', ['email' => "j{$n}_" . getmypid() . '@prueba.example', 'nombre' => $nombre, 'clave' => 'ClaveDePrueba1']);
    $id = (int) ($r['jugador']['id'] ?? 0);
    Db::q('UPDATE jugadores SET fama_publica = ?, alias = ?, alias_clave = ?, servidor_id = 1 WHERE id = ?', [$fama, $nombre, mb_strtolower($nombre) . $n, $id]);
    return [$nav, $id];
};
$equipoBasico = [['rol' => 'camarografo', 'habilidad' => 2, 'dueno' => true], ['rol' => 'camarografo', 'habilidad' => 2, 'nivel' => 'semi_senior'], ['rol' => 'camarografo', 'habilidad' => 1],
                 ['rol' => 'director', 'habilidad' => 2], ['rol' => 'sonidista', 'habilidad' => 2], ['rol' => 'tecnico_transmision', 'habilidad' => 1],
                 ['rol' => 'productor', 'habilidad' => 1], ['rol' => 'cablero', 'habilidad' => 1]];
/** "El juego": juega el intento con una política (como lo haría una persona) y devuelve lo que mandaría. */
$jugar = function (array $intento, string $politica = 'arriesgado'): array {
    $r = Repeticion::motor(['accion' => 'fantasma', 'intento' => $intento, 'politica' => $politica]);
    if (empty($r['ok'])) throw new RuntimeException('no se pudo jugar: ' . json_encode($r));
    return ['decisiones' => $r['decisiones'], 'resultado' => ['quality' => $r['calidad'], 'stars' => $r['estrellas']], 'claves' => array_column($r['incidentes'], 'clave')];
};
$saldoLibro = fn(int $j) => [(int) Db::valor('SELECT creditos FROM jugadores WHERE id = ?', [$j]), (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ?', [$j])];
$darCreditos = function (int $j, int $c) { Monedero::mover($j, $c, 'manual', 'prueba'); };

// =====================================================================
titulo('Duelos: acceso y resumen');
$sin = new Nav($BASE, 'sin');
$sin->get('/api/duelos');
check('Sin sesión: GET /api/duelos -> 401', 401, $sin->http);
[$A, $JA] = $jugador('Productora Alfa', 10);
[$B, $JB] = $jugador('Productora Beta', 30);
[$C, $JC] = $jugador('Productora Gamma', 30);
$A->post('/api/duelos/equipo', ['personal' => $equipoBasico], false);
check('POST sin X-Envivo -> 403', 403, $A->http);
$A->post('/api/duelos');
check('POST a una ruta GET -> 405', 405, $A->http);
$r = $A->get('/api/duelos');
check('Resumen: rating 1000, liga Bronce, 5 duelos gratis, sin equipo', [200, 1000, 'Bronce', 5, null], [$A->http, $r['rating']['rating'] ?? null, $r['rating']['liga'] ?? null, $r['cupos']['restantes'] ?? null, array_key_exists('equipo', $r) ? $r['equipo'] : 'x']);
check('…tablero con 3 contratos (fácil, medio, difícil) y kit básico', [['facil', 'medio', 'dificil'], 8], [array_column($r['contratos'], 'nivel'), count($r['kit'])]);
si('…todos los contratos se transmiten y piden 2 a 4 cámaras', array_reduce($r['contratos'], fn($a, $c) => $a && $c['contrato']['stream'] && $c['contrato']['cams'] >= 2 && $c['contrato']['cams'] <= 4, true));
check('…mismo tablero para todo el servidor', array_column($r['contratos'], 'contrato'), array_column($B->get('/api/duelos')['contratos'], 'contrato'));

// =====================================================================
titulo('Duelos: registrar el mejor equipo (validado)');
$r = $A->post('/api/duelos/equipo', ['personal' => [['rol' => 'camarografo', 'habilidad' => 2]]]);
check('Sin dueño -> 400 dueno', [400, 'dueno'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/duelos/equipo', ['personal' => [['rol' => 'cam', 'habilidad' => 2, 'dueno' => true], ['rol' => 'dir', 'habilidad' => 1, 'dueno' => true]]]);
check('Dos dueños -> 400 dueno', [400, 'dueno'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/duelos/equipo', ['personal' => [['rol' => 'piloto', 'habilidad' => 2, 'dueno' => true]]]);
check('Rol inventado -> 400 personal', [400, 'personal'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/duelos/equipo', ['personal' => array_fill(0, 13, ['rol' => 'camarografo', 'habilidad' => 1])]);
check('13 personas -> 400', 400, $A->http);
$r = $A->post('/api/duelos/equipo', ['personal' => [['rol' => 'cam', 'habilidad' => 2, 'dueno' => true], ['rol' => 'cam', 'habilidad' => 4]]]);
check('Fama 10: tope de habilidad 2; una persona de habilidad 4 -> 400 habilidad (tope 2)', [400, 'habilidad', 2], [$A->http, $r['codigo'] ?? null, $r['tope'] ?? null]);
$r = $A->post('/api/duelos/equipo', ['personal' => [['rol' => 'camarografo', 'habilidad' => 2, 'dueno' => true], ['rol' => 'director', 'habilidad' => 2, 'nivel' => 'senior']]]);
check('Fama 10: personal senior (pide 18 de fama) -> 400 nivel', [400, 'nivel'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/duelos/equipo', ['personal' => [['rol' => 'camarografo', 'habilidad' => 2, 'dueno' => true], ['rol' => 'director', 'habilidad' => 2, 'nivel' => 'experto']]]);
check('Nivel de experiencia inventado -> 400', 400, $A->http);
Monedero::entregar($JA, 'personal', 'cam', 4, 'creditos:estrella');
$r = $A->post('/api/duelos/equipo', ['personal' => [['rol' => 'camarografo', 'habilidad' => 2, 'dueno' => true], ['rol' => 'camarografo', 'habilidad' => 4, 'nivel' => 'senior'], ['rol' => 'cam', 'habilidad' => 4]]]);
check('Camarógrafo estrella comprado (nivel 4): permite UNO de nivel 4, no dos', [400, 'habilidad'], [$A->http, $r['codigo'] ?? null]);
$dronA = Inventario::crear($JA, 'dron4k', 'canje', 'prueba');
$gruaB = Inventario::crear($JB, 'grua', 'canje', 'prueba');
$r = $A->post('/api/duelos/equipo', ['personal' => $equipoBasico, 'inventario' => [$gruaB['id']]]);
check('Equipo de otro jugador -> 409 inventario', [409, 'inventario'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/duelos/equipo', ['personal' => $equipoBasico, 'inventario' => [$dronA['id'], $dronA['id']]]);
check('Equipo repetido -> 400', 400, $A->http);
$persA = array_merge($equipoBasico, [['rol' => 'cam', 'habilidad' => 4, 'nivel' => 'senior']]);
$r = $A->post('/api/duelos/equipo', ['personal' => $persA, 'inventario' => [$dronA['id']]]);
check('Equipo válido (estrella senior + Dron 4K) -> 200 con resumen', [200, 9, 'Dron 4K'], [$A->http, count($r['equipo']['personal'] ?? []), $r['equipo']['resumen']['camaras'][0] ?? null]);
check('…las claves viejas de rol (cam) se guardan con la clave nueva (camarografo)', 'camarografo', $r['equipo']['personal'][8]['rol'] ?? null);
si('…el poder sube con el dron', ($r['equipo']['poder'] ?? 0) > 0);
$B->post('/api/duelos/equipo', ['personal' => $equipoBasico, 'inventario' => [$gruaB['id']]]);
check('Beta registra su equipo con grúa', 200, $B->http);

// =====================================================================
titulo('Duelos: retar');
$r = $C->post('/api/duelos/retar', ['rival_id' => $JA, 'nivel' => 'medio']);
check('Sin equipo propio -> 409 sin_equipo', [409, 'sin_equipo'], [$C->http, $r['codigo'] ?? null]);
$C->post('/api/duelos/equipo', ['personal' => $equipoBasico]);
$r = $A->post('/api/duelos/retar', ['rival_id' => $JA, 'nivel' => 'medio']);
check('Retarse a sí mismo -> 400', 400, $A->http);
[$D, $JD] = $jugador('Productora Delta', 30);
$r = $A->post('/api/duelos/retar', ['rival_id' => $JD, 'nivel' => 'medio']);
check('Rival sin equipo -> 409 rival_sin_equipo', [409, 'rival_sin_equipo'], [$A->http, $r['codigo'] ?? null]);
Db::q('INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (2, ?, 1000, 1, ?)', ['Servidor 2 · Guayaquil', time()]);
[$E, $JE] = $jugador('Productora Lejana', 30);
Db::q('UPDATE jugadores SET servidor_id = 2 WHERE id = ?', [$JE]);
$E->post('/api/duelos/equipo', ['personal' => $equipoBasico]);
$r = $A->post('/api/duelos/retar', ['rival_id' => $JE, 'nivel' => 'medio']);
check('Rival de otro servidor -> 404', 404, $A->http);
$r = $A->post('/api/duelos/retar', ['rival_id' => $JB, 'nivel' => 'imposible']);
check('Nivel inventado -> 400 nivel', [400, 'nivel'], [$A->http, $r['codigo'] ?? null]);

$r = $A->post('/api/duelos/retar', ['rival_id' => $JB, 'nivel' => 'dificil']);
check('Retar a Beta (difícil) -> 200 con intento', [200, true, true], [$A->http, is_int($r['intento']['seed'] ?? null), isset($r['intento']['duelo_id'])]);
$intA = $r['intento'];
$camsA = count(array_filter($intA['equipo']['equip'], fn($e) => in_array($e['type'], ['cam_pro', 'dron4k', 'grua', 'vip_cam8k'], true)));
check('…personal del intento: el senior de nivel 4 en la primera cámara, roles de apoyo incluidos', [4, 'senior', true, true],
    [$intA['equipo']['staff'][0]['skill'], $intA['equipo']['staff'][0]['tier'], in_array('productor', array_column($intA['equipo']['staff'], 'role'), true), in_array('cablero', array_column($intA['equipo']['staff'], 'role'), true)]);
check('…lleva exactamente las cámaras del contrato (dron primero)', [$intA['contrato']['cams'], 'dron4k'], [$camsA, $intA['equipo']['equip'][0]['type']]);
check('…el contexto es el mismo para todos', Duelos::CONTEXTO, $intA['contexto']);
check('…la calidad del rival NO se ve antes de jugar', [null, 'abierto'], [$r['duelo']['calidad_rival'], $r['duelo']['estado']]);
check('…cupos: 4 restantes', 4, $r['cupos']['restantes']);
$fila = Db::fila('SELECT * FROM duelos WHERE id = ?', [$intA['duelo_id']]);
$intD = json_decode($fila['intento_defensor_json'], true);
check('…el defensor usa la MISMA semilla y el mismo contrato', [$intA['seed'], $intA['contrato']], [$intD['seed'], $intD['contrato']]);
check('…el fantasma del defensor ya está jugado (calidad guardada)', true, is_int(json_decode($fila['decisiones_defensor_json'], true)['decisiones'][0] ?? null) && (int) $fila['calidad_defensor'] >= 0);
$r2 = $A->post('/api/duelos/retar', ['rival_id' => $JC, 'nivel' => 'facil']);
check('Con un duelo en curso no se abre otro -> 409 duelo_abierto', [409, 'duelo_abierto'], [$A->http, $r2['codigo'] ?? null]);
$A->post('/api/duelos/equipo', ['personal' => $equipoBasico]);
check('…ni se puede cambiar el equipo -> 409', 409, $A->http);
$res = $A->get('/api/duelos');
check('Resumen trae el duelo abierto con su intento (para retomarlo)', [$intA['duelo_id'], $intA['seed']], [$res['abierto']['id'] ?? null, $res['abierto']['intento']['seed'] ?? null]);

// Mismo sorteo de imprevistos para los dos lados
$jR = $jugar($intA); $jD = $jugar($intD, 'prudente');
check('Mismos imprevistos para el retador y el fantasma (misma semilla)', $jR['claves'], $jD['claves']);

titulo('Duelos: jugar (el validador decide)');
$r = $A->post('/api/duelos/jugar', ['duelo_id' => $intA['duelo_id'], 'decisiones' => $jR['decisiones'], 'resultado' => $jR['resultado']]);
check('Jugada honesta -> 200 cerrado con la calidad del validador', [200, 'cerrado', $jR['resultado']['quality']], [$A->http, $r['duelo']['estado'] ?? null, $r['duelo']['calidad_mia'] ?? null]);
$fila = Db::fila('SELECT * FROM duelos WHERE id = ?', [$intA['duelo_id']]);
$esperado = $jR['resultado']['quality'] > (int) $fila['calidad_defensor'] ? 'retador' : ($jR['resultado']['quality'] < (int) $fila['calidad_defensor'] ? 'defensor' : 'empate');
check('…ganador según las calidades', $esperado, $fila['ganador']);
check('…validado por el servicio HTTP del validador, sin sospecha', ['http', 0], [json_decode($fila['validacion_json'], true)['via'] ?? null, (int) $fila['sospechoso']]);
$S = ['retador' => 1, 'defensor' => 0, 'empate' => 0.5][$fila['ganador']];
$Ex = 1 / (1 + 10 ** ((1000 - 1000) / 400));
check('…puntaje Elo: retador K=32, defensor K=16', [(int) round(32 * ($S - $Ex)), -(int) round(16 * ($S - $Ex))], [(int) $fila['cambio_retador'], (int) $fila['cambio_defensor']]);
check('…la respuesta trae el detalle de los dos lados', [count($jR['claves']), count($jR['claves'])], [count($r['detalle']['retador'] ?? []), count($r['detalle']['defensor'] ?? [])]);
$famaA = (int) Db::valor("SELECT COALESCE(SUM(cantidad),0) FROM entregas WHERE jugador_id = ? AND tipo = 'fama'", [$JA]);
$famaB = (int) Db::valor("SELECT COALESCE(SUM(cantidad),0) FROM entregas WHERE jugador_id = ? AND tipo = 'fama'", [$JB]);
check('…fama: ganar un difícil da 3; defender da 1 (entrega tipo fama)', $fila['ganador'] === 'retador' ? [3, 0] : ($fila['ganador'] === 'defensor' ? [0, 1] : [0, 0]), [$famaA, $famaB]);
$antes = Db::fila('SELECT rating FROM duelo_ratings WHERE jugador_id = ?', [$JA]);
$r = $A->post('/api/duelos/jugar', ['duelo_id' => $intA['duelo_id'], 'decisiones' => [0, 0, 0]]);
check('Mandar otra vez el mismo duelo: mismo resultado, el puntaje no cambia (una semilla, un intento)', [200, $antes], [$A->http, Db::fila('SELECT rating FROM duelo_ratings WHERE jugador_id = ?', [$JA])]);
$r = $B->post('/api/duelos/jugar', ['duelo_id' => $intA['duelo_id'], 'decisiones' => []]);
check('El defensor no puede jugar el duelo de otro -> 404', 404, $B->http);
$hb = $B->get('/api/duelos');
check('El defensor ve su defensa en el historial (y como nueva)', ['defensor', 1], [$hb['historial'][0]['rol'] ?? null, $hb['defensas_nuevas'] ?? null]);
check('…y la segunda vez ya no es nueva', 0, $B->get('/api/duelos')['defensas_nuevas']);
si('…el defensor recibe un aviso de sistema en el chat', (bool) Db::valor("SELECT 1 FROM chat_mensajes WHERE canal = ?", ['sistema:' . $JB]));

// Trampa: calidad inventada
$r = $A->post('/api/duelos/retar', ['rival_id' => $JC, 'nivel' => 'medio']);
$i2 = $r['intento']; $j2 = $jugar($i2);
$r = $A->post('/api/duelos/jugar', ['duelo_id' => $i2['duelo_id'], 'decisiones' => $j2['decisiones'], 'resultado' => ['quality' => 100, 'stars' => 5]]);
$f2 = Db::fila('SELECT * FROM duelos WHERE id = ?', [$i2['duelo_id']]);
check('Calidad inventada (100): vale la del validador y queda marcado sospechoso', [$j2['resultado']['quality'], 1, 'resultado_no_coincide'], [(int) $f2['calidad_retador'], (int) $f2['sospechoso'], $f2['motivo']]);
// Jugada imposible
$r = $A->post('/api/duelos/retar', ['rival_id' => $JB, 'nivel' => 'facil']);
$i3 = $r['intento'];
$r = $A->post('/api/duelos/jugar', ['duelo_id' => $i3['duelo_id'], 'decisiones' => [9, 9, 9, 9]]);
$f3 = Db::fila('SELECT * FROM duelos WHERE id = ?', [$i3['duelo_id']]);
check('Decisiones imposibles: gana el defensor, motivo jugada_imposible, sospechoso', ['defensor', 'jugada_imposible', 1, null], [$f3['ganador'], $f3['motivo'], (int) $f3['sospechoso'], array_key_exists('calidad_mia', $r['duelo'] ?? []) ? $r['duelo']['calidad_mia'] : 'x']);
$r = $A->post('/api/duelos/jugar', ['duelo_id' => $i3['duelo_id'], 'decisiones' => 'hola']);
check('Decisiones que no son lista -> 400', 400, $A->http);
// Vencido
$r = $A->post('/api/duelos/retar', ['rival_id' => $JB, 'nivel' => 'medio']);
$i4 = $r['intento'];
Db::q('UPDATE duelos SET vence = ? WHERE id = ?', [time() - 1, $i4['duelo_id']]);
$r = $A->post('/api/duelos/jugar', ['duelo_id' => $i4['duelo_id'], 'decisiones' => [0]]);
$f4 = Db::fila('SELECT * FROM duelos WHERE id = ?', [$i4['duelo_id']]);
check('Duelo vencido (20 min): 410 y cuenta como derrota', [410, 'vencido', 'defensor', 'cerrado'], [$A->http, $r['codigo'] ?? null, $f4['ganador'], $f4['estado']]);
$r = $A->post('/api/duelos/retar', ['rival_id' => $JC, 'nivel' => 'facil']);
$i5 = $r['intento'];
Db::q('UPDATE duelos SET vence = ? WHERE id = ?', [time() - 1, $i5['duelo_id']]);
$A->get('/api/duelos');
check('…también se cierra solo al abrir la pantalla', ['cerrado', 'vencido'], array_values(Db::fila('SELECT estado, motivo FROM duelos WHERE id = ?', [$i5['duelo_id']])));

// =====================================================================
titulo('Duelos: intentos por día, intentos extra con créditos y límite por rival');
$c = $A->get('/api/duelos')['cupos'];
check('Alfa usó sus 5 gratis', [5, 0], [$c['usados'], $c['restantes']]);
$r = $A->post('/api/duelos/retar', ['rival_id' => $JC, 'nivel' => 'facil']);
check('Sin intentos -> 409 sin_cupos', [409, 'sin_cupos'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/duelos/extra');
check('Comprar extra sin créditos -> 402 (sin gastar nada)', [402, 'sin_creditos', 0], [$A->http, $r['codigo'] ?? null, $saldoLibro($JA)[0]]);
$darCreditos($JA, 110);
for ($k = 0; $k < 5; $k++) $r = $A->post('/api/duelos/extra');
check('5 extra a 20 créditos: saldo 10 y libro cuadrado', [200, 10, 5, [10, 10]], [$A->http, $r['creditos'] ?? null, $r['cupos']['extra'] ?? null, $saldoLibro($JA)]);
$r = $A->post('/api/duelos/extra');
check('El sexto extra del día -> 409 extra_max', [409, 'extra_max'], [$A->http, $r['codigo'] ?? null]);
$jugados = 0; $par = null;
for ($k = 0; $k < 5; $k++) {
    $r = $A->post('/api/duelos/retar', ['rival_id' => $JC, 'nivel' => 'facil']);
    if ($A->http !== 200) { $par = $r; break; }
    $jj = $jugar($r['intento']);
    $A->post('/api/duelos/jugar', ['duelo_id' => $r['intento']['duelo_id'], 'decisiones' => $jj['decisiones'], 'resultado' => $jj['resultado']]);
    $jugados++;
}
check('Máximo 3 duelos por día contra la misma productora -> 409 par', [409, 'par'], [$A->http, $par['codigo'] ?? null]);
$famaHoy = (int) Db::valor("SELECT COALESCE(SUM(cantidad),0) FROM entregas WHERE jugador_id = ? AND tipo = 'fama' AND origen LIKE 'duelo:%'", [$JA]);
si('Fama por duelos: máximo 10 por día (salió ' . $famaHoy . ')', $famaHoy <= 10);
Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400, $JC]);
check('VIP: 6 duelos gratis', 6, $C->get('/api/duelos')['cupos']['gratis']);
$e = $A->get('/api/duelos');
si('Rivales sugeridos: de mi servidor, sin mí, con equipo (Beta y Gamma)', array_column($e['rivales'], 'id') == [$JB, $JC] || array_column($e['rivales'], 'id') == [$JC, $JB]);
si('Ranking del servidor ordenado por puntaje', array_column($e['ranking'], 'rating') === array_values(array_reverse(array_values(array_merge([], (function ($x) { sort($x); return $x; })(array_column($e['ranking'], 'rating')))))));

// =====================================================================
titulo('Duelos: equipos VIP y equipos vendidos');
$vipCam = Inventario::crear($JC, 'vip_cam8k', 'canje', 'prueba');
Db::q('UPDATE jugadores SET vip_hasta = NULL WHERE id = ?', [$JC]);
$C->post('/api/duelos/equipo', ['personal' => $equipoBasico, 'inventario' => [$vipCam['id']]]);
check('Registrar una cámara VIP -> 200', 200, $C->http);
$eqC = json_decode((string) Db::valor('SELECT equipo_json FROM duelo_equipos WHERE jugador_id = ?', [$JC]), true);
$contr = Duelos::contrato(1, 'medio');
$sinVip = Duelos::armarIntento($eqC, $contr, 5, false, $JC);
$conVip = Duelos::armarIntento($eqC, $contr, 5, true, $JC);
check('Sin VIP activo, la cámara VIP no va al duelo (el validador la rechazaría)', [false, 'vip_cam8k'], [in_array('vip_cam8k', array_column($sinVip['equipo']['equip'], 'type'), true), $conVip['equipo']['equip'][0]['type']]);
$v = Repeticion::validar($sinVip + ['decisiones' => $jugar($sinVip)['decisiones']]);
check('…y ese intento es válido para el validador', true, $v['valido']);
Db::q("UPDATE inventario SET estado = 'publicado' WHERE id = ?", [$gruaB['id']]);
$eqB = json_decode((string) Db::valor('SELECT equipo_json FROM duelo_equipos WHERE jugador_id = ?', [$JB]), true);
check('Equipo publicado en el mercado después de registrarlo: ya no va al duelo', false, in_array('grua', array_column(Duelos::armarIntento($eqB, $contr, 5, false, $JB)['equipo']['equip'], 'type'), true));
Db::q("UPDATE inventario SET estado = 'bodega' WHERE id = ?", [$gruaB['id']]);

titulo('Duelos: mismo sorteo para los dos lados (40 duelos al azar)');
// Con la lógica de realismo, el riesgo de cada rol depende del nivel de la persona: equipos de personal parecido sacan los
// mismos imprevistos; uno muy distinto (solo el dueño + freelances) puede sacar otros con la MISMA semilla.
$iguales = 0; $parecidos = 0; $total = 0; $validos = 0;
$eqA = json_decode((string) Db::valor('SELECT equipo_json FROM duelo_equipos WHERE jugador_id = ?', [$JA]), true);
$eqParecido = ['personal' => $eqA['personal'], 'inventario' => []];   // mismo personal, sin el dron
foreach (['facil', 'medio', 'dificil'] as $niv) for ($k = 0; $k < 14; $k++) {
    $seed = random_int(1, 2147483646);
    $ct = Duelos::contrato(1, $niv, '2026-10-' . str_pad((string) (1 + $k), 2, '0', STR_PAD_LEFT));
    $x = Duelos::armarIntento($eqA, $ct, $seed, false, $JA);
    $y = Duelos::armarIntento(['personal' => [['rol' => 'camarografo', 'habilidad' => 1, 'nivel' => 'junior', 'dueno' => true]], 'inventario' => []], $ct, $seed, false, null);
    $z = Duelos::armarIntento($eqParecido, $ct, $seed, false, null);
    $a = $jugar($x, 'prudente'); $b = $jugar($y, 'arriesgado'); $c = $jugar($z, 'arriesgado');
    $total++; if ($a['claves'] === $b['claves']) $iguales++; if ($a['claves'] === $c['claves']) $parecidos++;
    if ((Repeticion::validar($y + $b)['valido'] ?? false) && (Repeticion::validar($z + $c)['valido'] ?? false)) $validos++;
    if ($total >= 40) break 2;
}
echo "  INFO  Sin el gancho en js/logic.js, solo con la semilla: mismo personal con/sin exclusivos $parecidos de $total iguales; personal muy distinto $iguales de $total\n";
check("Todas las jugadas del 'juego' son válidas en el validador ($validos de $total)", $total, $validos);

// =====================================================================
titulo('Duelos: validador caído y tareas');
$cuposB = $B->get('/api/duelos')['cupos']['usados'];
Repeticion::$doble = fn(string $tipo, array $d) => $tipo === 'motor' ? ['ok' => false, 'motivo' => 'validador_caido'] : ['valido' => false, 'detalle' => ['motivo' => 'validador_caido']];
try { Duelos::retar($JB, ['rival_id' => $JC, 'nivel' => 'medio']); $cod = 0; } catch (Fallo $e) { $cod = $e->getCode(); }
Repeticion::$doble = null;
check('Sin Node al retar -> 503 y no se gasta el intento', [503, $cuposB], [$cod, $B->get('/api/duelos')['cupos']['usados']]);
$rr = Duelos::retar($JB, ['rival_id' => $JC, 'nivel' => 'medio']);
$jb = $jugar($rr['intento']);
Repeticion::$doble = fn(string $tipo, array $d) => ['valido' => false, 'detalle' => ['motivo' => 'validador_caido']];
$p = Duelos::jugar($JB, ['duelo_id' => $rr['intento']['duelo_id'], 'decisiones' => $jb['decisiones'], 'resultado' => $jb['resultado']]);
Repeticion::$doble = null;
check('Validador caído al terminar: queda pendiente (sin castigo)', [true, 'pendiente'], [$p['pendiente'] ?? null, Db::valor('SELECT estado FROM duelos WHERE id = ?', [$rr['intento']['duelo_id']])]);
check('La tarea revalida los pendientes', [1, 'cerrado', $jb['resultado']['quality']], [Duelos::revalidarPendientes(), Db::valor('SELECT estado FROM duelos WHERE id = ?', [$rr['intento']['duelo_id']]), (int) Db::valor('SELECT calidad_retador FROM duelos WHERE id = ?', [$rr['intento']['duelo_id']])]);
// Respaldo por consola: el servicio HTTP del validador se apaga
posix_kill(proc_get_status($procVal)['pid'], 9);
usleep(300000);
$v = Repeticion::validar($sinVip + ['decisiones' => $jugar($sinVip)['decisiones']]);
check('Con el servicio HTTP apagado, valida por consola (node validador.js)', [true, 'consola'], [$v['valido'] ?? null, $v['via'] ?? null]);

titulo('Duelos: mismos imprevistos con contrato.imprevistos (gancho de js/logic.js, ver INTEGRAR_DUELOS_DESAFIO.md)');
// El servidor ya manda la lista; aquí se prueba con una copia de la lógica que tiene el gancho de 3 líneas.
$GANCHO = "$TMP/juego_gancho"; @mkdir("$GANCHO/js", 0755, true);
foreach (['datos.js', 'premium.js'] as $f) if (is_file("$JUEGO/js/$f")) copy("$JUEGO/js/$f", "$GANCHO/js/$f");
$logica = (string) file_get_contents("$JUEGO/js/logic.js");
$bucle = '    for (let i = 0; i < nInc && pool.length; i++) {';
$gancho = "    const fijos = Array.isArray(contract.imprevistos) ? contract.imprevistos.filter((k, i, a) => INCIDENTS[k] && pool.includes(k) && a.indexOf(k) === i) : null;\n"
        . "    if (fijos) fijos.forEach((key) => { const def = INCIDENTS[key]; ev.incidents.push({ key, x: def.setup ? def.setup(s, view) : {}, done: false, result: null }); });\n"
        . "    else\n";
if (substr_count($logica, $bucle) === 1) {
    file_put_contents("$GANCHO/js/logic.js", str_replace($bucle, $gancho . $bucle, $logica));
    putenv("ENVIVO_JUEGO=$GANCHO");
    $mismos = 0; $tot = 0; $val = 0;
    foreach (['facil', 'medio', 'dificil'] as $niv) for ($k = 0; $k < 7; $k++) {
        $seed = random_int(1, 2147483646);
        $ct = Duelos::contrato(1, $niv, '2026-09-' . str_pad((string) (1 + $k), 2, '0', STR_PAD_LEFT));
        $def = Duelos::armarIntento($eqA, $ct, $seed, false, $JA);
        $f = Repeticion::motor(['accion' => 'fantasma', 'intento' => $def, 'politica' => 'prudente', 'fijar' => true]);
        $ret = Duelos::armarIntento(['personal' => [['rol' => 'camarografo', 'habilidad' => 1, 'nivel' => 'junior', 'dueno' => true]], 'inventario' => []], $f['contrato'], $seed, false, null);
        $b = $jugar($ret, 'arriesgado');
        $tot++; if (array_column($f['incidentes'], 'clave') === $b['claves']) $mismos++;
        if (Repeticion::validar($ret + $b)['valido'] ?? false) $val++;
    }
    putenv("ENVIVO_JUEGO=$JUEGO");
    check("Con el gancho: personal muy distinto, MISMOS imprevistos ($mismos de $tot)", $tot, $mismos);
    check("…y el validador (con la misma lógica) acepta todas las jugadas ($val de $tot)", $tot, $val);
} else echo "  INFO  js/logic.js cambió: no se encontró el bucle del sorteo para probar el gancho\n";

titulo('Duelos: fin de temporada');
$ant = Duelos::temporada(strtotime(date('Y-m-01') . ' -1 day'));
foreach ([[$JA, 1300], [$JB, 1200], [$JC, 1100], [$JD, 1050]] as [$jx, $rt]) {
    Db::q('INSERT OR REPLACE INTO duelo_ratings (temporada, jugador_id, servidor_id, rating, mejor, ganados, perdidos, actualizado) VALUES (?, ?, 1, ?, ?, ?, 1, ?)', [$ant, $jx, $rt, $rt, $jx === $JD ? 1 : 4, time()]);
}
Db::q('DELETE FROM duelo_temporadas_cerradas WHERE temporada = ?', [$ant]);
$A->get('/api/duelos');
$prem = Db::todas('SELECT jugador_id, puesto FROM duelo_premios WHERE temporada = ? ORDER BY puesto', [$ant]);
check('Al abrir duelos se cierra la temporada anterior: top con 3+ duelos (Delta no entra)', [[$JA, 1], [$JB, 2], [$JC, 3]], array_map(fn($x) => [(int) $x['jugador_id'], (int) $x['puesto']], $prem));
check('…premio del 1º: $5.000 y +5 de fama', [5000, 5], [(int) Db::valor("SELECT cantidad FROM entregas WHERE jugador_id = ? AND tipo = 'dinero' AND origen = ?", [$JA, 'duelo_temporada:' . $ant]),
    (int) Db::valor("SELECT cantidad FROM entregas WHERE jugador_id = ? AND tipo = 'fama' AND origen = ?", [$JA, 'duelo_temporada:' . $ant])]);
$B->get('/api/duelos');
check('…solo una vez', 3, (int) Db::valor('SELECT COUNT(*) FROM duelo_premios WHERE temporada = ?', [$ant]));
check('Nueva temporada: Alfa parte de la mitad de la distancia a 1000 (1150) si no jugó esta', 1150, (function () use ($JA, $ant) { Db::q("DELETE FROM duelo_ratings WHERE jugador_id = ? AND temporada > ?", [$JA, $ant]); return Duelos::estado($JA)['rating']; })());
$est = Duelos::estado($JA);
check('Bloque para /api/estado: rating, liga, restantes, tiene_equipo', ['rating', 'liga', 'restantes', 'tiene_equipo', 'defensas_nuevas', 'en_curso'], array_keys($est));

// =====================================================================
titulo('Desafío Técnico del Día');
$sin->get('/api/desafio');
check('Sin sesión -> 401', 401, $sin->http);
$hoyN = (int) date('N');
$r = $A->get('/api/desafio');
check('Resumen: modificador del día de la semana', [200, Desafio::MODIFICADORES[$hoyN]['clave']], [$A->http, $r['modificador']['clave'] ?? null]);
check('…maleta igual para todos, 1 intento sin VIP', [$r['maleta'], 1], [$B->get('/api/desafio')['maleta'], $r['intentos']['max']]);
check('…semana con los 7 modificadores', ['lluvia', 'una_camara', 'internet', 'exigente', 'apagon', 'final', 'todo'], array_column($r['semana'], 'clave'));
$mod = Desafio::MODIFICADORES[$hoyN];
// Una elección razonable dentro del presupuesto
$costoDe = fn(array $pers, array $eq) => array_sum(array_map(fn($x) => Desafio::PERSONAL[$x][3], $pers)) + array_sum(array_map(fn($x) => Desafio::EQUIPOS[$x][2], $eq));
$eleccion = function (array $mod) use ($costoDe): array {
    $pers = ['p2', 'p5', 'p7', 'p9', 'p11', 'p12', 'p13']; $eq = ['e2', 'e9', 'e11', 'e13', 'e15', 'e14', 'e16', 'e12'];
    if ($mod['max_camaras'] >= 2) { $eq[] = 'e3'; $pers[] = 'p3'; }
    while ($costoDe($pers, $eq) > $mod['presupuesto'] && count($eq) > 1) array_pop($eq);
    return ['personal' => $pers, 'equipos' => $eq];
};
$sel = $eleccion($mod);
$r = $A->post('/api/desafio/empezar', ['personal' => array_keys(Desafio::PERSONAL), 'equipos' => array_keys(Desafio::EQUIPOS)]);
check('Pasarse del presupuesto -> 400 presupuesto', [400, 'presupuesto'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/desafio/empezar', ['personal' => ['p2'], 'equipos' => ['e9']]);
check('Sin cámara -> 400 camaras', [400, 'camaras'], [$A->http, $r['codigo'] ?? null]);
$r = $A->post('/api/desafio/empezar', ['personal' => ['p99'], 'equipos' => ['e2']]);
check('Persona que no está en la maleta -> 400', 400, $A->http);
try { Desafio::armar(Desafio::dia('2026-10-20'), ['personal' => [], 'equipos' => ['e2', 'e3']]); $cod = 0; } catch (Fallo $e) { $cod = $e->extra['codigo'] ?? ''; }
check('Martes (una sola cámara): 2 cámaras -> camaras', 'camaras', $cod);

$r = $A->post('/api/desafio/empezar', $sel);
check('Empezar -> 200 con intento (semilla del servidor)', [200, true], [$A->http, is_int($r['intento']['seed'] ?? null)]);
$dA = $r['intento'];
$filaA = Db::fila('SELECT * FROM desafio_intentos WHERE id = ?', [$dA['intento_id']]);
si('…trae los imprevistos que pide el día (' . implode(', ', $mod['requeridos']) . ')', !array_diff($mod['requeridos'], json_decode($filaA['incidentes_json'], true)));
check('…contexto del día (fama del cliente)', $mod['fama'], $dA['contexto']['fama']);
$r = $A->post('/api/desafio/empezar', $sel);
check('Con uno en curso no se empieza otro -> 409', 409, $A->http);
$rb = $B->post('/api/desafio/empezar', $sel);
check('Misma elección = misma semilla y mismo evento para otra productora', [$dA['seed'], (int) $filaA['variante']], [$rb['intento']['seed'] ?? null, (int) Db::valor('SELECT variante FROM desafio_intentos WHERE id = ?', [$rb['intento_id'] ?? 0])]);
check('…y la semilla base del día es una sola', 1, (int) Db::valor('SELECT COUNT(*) FROM desafio_dias WHERE dia = ?', [Monedero::diaLocal()]));

$jA = $jugar($dA);
check('Mismos imprevistos que dijo el servidor al prepararlo', json_decode($filaA['incidentes_json'], true), $jA['claves']);
$pasesAntes = Desafio::pases($JA);
$r = $A->post('/api/desafio/terminar', ['intento_id' => $dA['intento_id'], 'decisiones' => $jA['decisiones'], 'resultado' => $jA['resultado']]);
check('Terminar -> válido, calidad del validador, puesto 1', [200, 'valido', $jA['resultado']['quality'], 1], [$A->http, $r['resultado']['estado'] ?? null, $r['resultado']['calidad'] ?? null, $r['puesto'] ?? null]);
[$cab, $bat, $din, $pas] = Desafio::PREMIO_ESTRELLAS[$jA['resultado']['stars']];
check('…premio por estrellas: repuestos y dinero como entregas, Pases de Prensa en el servidor',
    [$cab, $bat, $din, $pasesAntes + $pas],
    [(int) Db::valor("SELECT COALESCE(SUM(cantidad),0) FROM entregas WHERE jugador_id = ? AND item = 'cable' AND origen LIKE 'desafio:%'", [$JA]),
     (int) Db::valor("SELECT COALESCE(SUM(cantidad),0) FROM entregas WHERE jugador_id = ? AND item = 'battery' AND origen LIKE 'desafio:%'", [$JA]),
     (int) Db::valor("SELECT COALESCE(SUM(cantidad),0) FROM entregas WHERE jugador_id = ? AND tipo = 'dinero' AND origen LIKE 'desafio:%'", [$JA]),
     Desafio::pases($JA)]);
$r = $A->post('/api/desafio/empezar', $sel);
check('Sin VIP: un solo intento por día -> 409 sin_intentos', [409, 'sin_intentos'], [$A->http, $r['codigo'] ?? null]);
Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400, $JA]);
$r = $A->post('/api/desafio/empezar', $sel);
check('Con VIP: un segundo intento (misma elección = mismo evento)', [200, $dA['seed']], [$A->http, $r['intento']['seed'] ?? null]);
$jA2 = $jugar($r['intento'], 'prudente');
$A->post('/api/desafio/terminar', ['intento_id' => $r['intento_id'], 'decisiones' => $jA2['decisiones'], 'resultado' => $jA2['resultado']]);
check('…el premio por terminar es uno solo por día', 1, (int) Db::valor("SELECT COUNT(*) FROM desafio_premios WHERE jugador_id = ? AND tipo = 'participacion'", [$JA]));
check('…en el ranking cuenta su mejor intento', max($jA['resultado']['quality'], $jA2['resultado']['quality']), $A->get('/api/desafio')['mi_mejor']['calidad']);

$jB = $jugar($rb['intento'], 'prudente');
$r = $B->post('/api/desafio/terminar', ['intento_id' => $rb['intento_id'], 'decisiones' => $jB['decisiones'], 'resultado' => ['quality' => 100, 'stars' => 5]]);
check('Calidad inventada: vale la del validador, sospechoso', [$jB['resultado']['quality'], 1], [$r['resultado']['calidad'] ?? null, (int) Db::valor('SELECT sospechoso FROM desafio_intentos WHERE id = ?', [$rb['intento_id']])]);
$rc = $C->post('/api/desafio/empezar', $eleccion($mod));
Db::q('UPDATE desafio_intentos SET vence = ? WHERE id = ?', [time() - 1, $rc['intento_id']]);
$r = $C->post('/api/desafio/terminar', ['intento_id' => $rc['intento_id'], 'decisiones' => [0]]);
check('Intento vencido -> 410', [410, 'vencido'], [$C->http, $r['codigo'] ?? null]);
[$F, $JF] = $jugador('Productora Épsilon', 30);
$rf = $F->post('/api/desafio/empezar', ['personal' => ['p1'], 'equipos' => ['e2', 'e3', 'e13', 'e15', 'e9']]);
if ($F->http !== 200) echo '  (Épsilon no pudo empezar: ' . json_encode($rf, JSON_UNESCAPED_UNICODE) . ")\n";
$jF = $jugar($rf['intento']);
$tf = $F->post('/api/desafio/terminar', ['intento_id' => $rf['intento_id'], 'decisiones' => $jF['decisiones'], 'resultado' => $jF['resultado']]);
check('Épsilon termina su desafío (válido)', 'valido', $tf['resultado']['estado'] ?? json_encode($tf, JSON_UNESCAPED_UNICODE));
$rk = $A->get('/api/desafio/ranking');
check('Ranking del servidor: 3 participantes válidos, ordenado por calidad', [3, true], [$rk['participantes'], array_column($rk['ranking'], 'calidad') === (function ($x) { rsort($x); return $x; })(array_column($rk['ranking'], 'calidad'))]);
si('…Lejana (otro servidor) no aparece', !in_array($JE, array_column($rk['ranking'], 'jugador_id'), true));

titulo('Desafío: cierre del día y premios del ranking');
$hoy = Monedero::diaLocal(); $ayer = date('Y-m-d', strtotime('-1 day'));
Db::q('UPDATE desafio_dias SET dia = ? WHERE dia = ?', [$ayer, $hoy]);
Db::q('UPDATE desafio_intentos SET dia = ? WHERE dia = ?', [$ayer, $hoy]);
Db::q('UPDATE desafio_premios SET dia = ? WHERE dia = ?', [$ayer, $hoy]);
$top = Desafio::ranking($ayer, 1, 10);
$pasesTop = Desafio::pases($top[0]['jugador_id']);
$r = $C->get('/api/desafio');
check('Al abrir el desafío se cierra el día anterior: 3 premios de ranking', 3, (int) Db::valor("SELECT COUNT(*) FROM desafio_premios WHERE dia = ? AND tipo = 'ranking'", [$ayer]));
check('…el 1º recibe $3.000 y 5 Pases de Prensa', [3000, $pasesTop + 5], [(int) Db::valor("SELECT cantidad FROM entregas WHERE jugador_id = ? AND tipo = 'dinero' AND origen = ?", [$top[0]['jugador_id'], 'desafio_top:' . $ayer]), Desafio::pases($top[0]['jugador_id'])]);
$A->get('/api/desafio');
check('…solo una vez', 3, (int) Db::valor("SELECT COUNT(*) FROM desafio_premios WHERE dia = ? AND tipo = 'ranking'", [$ayer]));
$nav1 = ['A' => $A, 'B' => $B, 'F' => $F][array_search($top[0]['jugador_id'], ['A' => $JA, 'B' => $JB, 'F' => $JF], true)];
check('…y lo ve en "ayer" del resumen', 1, $nav1->get('/api/desafio')['ayer']['puesto'] ?? null);
check('Es un día nuevo: el desafío de hoy se puede jugar otra vez', 0, $A->get('/api/desafio')['intentos']['usados']);
check('Libro de Pases de Prensa cuadrado (suma = saldo)', Desafio::pases($JA), (int) Db::valor('SELECT COALESCE(SUM(cambio),0) FROM pases_prensa_libro WHERE jugador_id = ?', [$JA]));
try { Desafio::gastarPases($JD, 1, 'festival'); $cod = 0; } catch (Fallo $e) { $cod = $e->getCode(); }
check('Gastar pases sin tener -> 402', 402, $cod);
// Día con menos de 3 participantes: sin premios de ranking
Db::q("INSERT INTO desafio_dias (dia, modificador, semilla_base, contrato_json, creado) VALUES ('2026-01-05', 'lluvia', 7, ?, ?)", [json_encode(Desafio::MODIFICADORES[1]['contrato'] + ['client' => 'X']), time()]);
Db::q("INSERT INTO desafio_intentos (dia, servidor_id, jugador_id, numero, seleccion_json, variante, semilla, intento_json, incidentes_json, estado, calidad, estrellas, creado, vence, terminado)
       VALUES ('2026-01-05', 1, ?, 1, '{}', 0, 7, '{}', '[]', 'valido', 70, 4, ?, ?, ?)", [$JD, time(), time(), time()]);
Desafio::cerrarPendientes();
check('Día con 1 participante: sin premios de ranking (mínimo 3)', 0, (int) Db::valor("SELECT COUNT(*) FROM desafio_premios WHERE dia = '2026-01-05'"));
check('Bloque para /api/estado', ['dia', 'modificador', 'nombre', 'icono', 'restantes', 'jugado_hoy', 'pases_prensa'], array_keys(Desafio::estado($JA)));

titulo('Desafío: los 7 modificadores traen lo que prometen');
foreach (['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'] as $dd) {
    $m = Desafio::modificadorDe($dd);
    $a = Desafio::armar(Desafio::dia($dd), $eleccion($m));
    $s = Repeticion::motor(['accion' => 'semilla', 'intento' => $a['intento'], 'semilla_base' => (int) Desafio::dia($dd)['semilla_base'], 'requeridos' => $m['requeridos'], 'max' => Desafio::BUSQUEDA_MAX]);
    $cams = count(array_filter($a['intento']['equipo']['equip'], fn($e) => str_starts_with($e['type'], 'cam_')));
    $j = $jugar(['seed' => $s['seed']] + $a['intento']);
    $v = Repeticion::validar(['seed' => $s['seed']] + $a['intento'] + ['decisiones' => $j['decisiones'], 'cliente_resultado' => $j['resultado']]);
    si(sprintf('%-9s %-18s trae [%s], %d cámara(s), fama %d, válido', $m['dia_semana'], $m['nombre'], implode(', ', $m['requeridos']), $cams, $a['intento']['contexto']['fama']),
        $s['ok'] && $s['completo'] && !array_diff($m['requeridos'], $j['claves']) && $cams <= $m['max_camaras'] && ($v['valido'] ?? false));
}

echo "\n" . ($fallas ? "FALLAS: $fallas" : 'TODO OK') . " ($ok bien)\n";
if (filesize("$TMP/php.log") && preg_match('/PRUEBA|Fatal|Warning/', (string) file_get_contents("$TMP/php.log"))) {
    echo "\nRegistro de PHP:\n" . implode("\n", array_slice(array_filter(explode("\n", (string) file_get_contents("$TMP/php.log")), fn($l) => preg_match('/PRUEBA|Fatal|Warning|Notice|Deprecated/', $l)), 0, 20)) . "\n";
}
exit($fallas ? 1 : 0);
