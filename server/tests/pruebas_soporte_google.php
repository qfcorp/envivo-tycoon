<?php
// SOLO PRUEBAS (nunca en el servidor). Prueba las clases del servidor tal como están (NO las cambia):
//   Soporte.php (jugador + Centro de Control), Google.php (Google Play Billing) y sus rutas de api.php.
// Con:
//  - una base SQLite y una configuración TEMPORALES (se borran al final; GUARDAR_TMP=1 para dejarlas),
//  - las migraciones de Db.php tal cual (Db::pdo()),
//  - un Google FALSO (tests/google_falso.php con "php -S") que verifica la firma RS256 del JWT con la llave PÚBLICA,
//  - el juego con "php -S" + tests/router.php (como nginx) para las rutas /api/soporte* y /api/google/verificar.
// Al final lista lo PENDIENTE (lo que falta según docs/INTEGRAR_SOPORTE_GOOGLE.md): eso se informa, no cuenta como falla.
// Uso:  php server/tests/pruebas_soporte_google.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
ini_set('display_errors', '1');
set_error_handler(function (int $n, string $m, string $f, int $l) { if (!(error_reporting() & $n)) return false; throw new ErrorException($m, 0, $n, $f, $l); });
ini_set('error_log', '/dev/null');   // los error_log() esperados de Google.php (503 de prueba, firma mala) no ensucian la salida

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$TMP = sys_get_temp_dir() . '/ev_soporte_google_' . bin2hex(random_bytes(4));
mkdir("$TMP/datos", 0777, true);
mkdir("$TMP/google", 0777, true);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$ok = 0; $fallas = 0; $pendientes = [];
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
/** Algo que falta en el servidor (está en docs/INTEGRAR_SOPORTE_GOOGLE.md). Si ya está hecho, sale "YA ESTÁ". No es falla. */
function pendiente(string $id, string $n, bool $hecho): void {
    global $pendientes;
    echo ($hecho ? '  YA ESTÁ ' : '  PENDIENTE ') . "$id $n\n";
    if (!$hecho) $pendientes[] = "$id $n";
}
function titulo(string $t): void { echo "\n== $t\n"; }
/** Corre $f y devuelve [http, codigo] del Fallo que lanza (o null si no lanzó nada). */
function fallo(callable $f): ?array {
    try { $f(); return null; }
    catch (EnVivo\Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; }
}
function puerto(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; }
function esperar(string $url): bool {
    for ($i = 0; $i < 80; $i++) { $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_NOPROXY => '*', CURLOPT_TIMEOUT => 2]); if (curl_exec($ch) !== false) return true; usleep(100000); }
    return false;
}

// ---------------------------------------------------------------- llaves, cuenta de servicio y configuración
$llave = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
openssl_pkey_export($llave, $privPem);
file_put_contents("$TMP/google/publica.pem", openssl_pkey_get_details($llave)['key']);
$otra = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
openssl_pkey_export($otra, $otraPem);
$P_G = puerto(); $P_APP = puerto();
$G = "http://127.0.0.1:$P_G";
$EMAIL_SA = 'envivo-servidor@envivo-play.iam.gserviceaccount.com';
$PAQUETE = 'com.tukanec.envivo';
// Igual que el .json que descarga Google Cloud, pero token_uri apunta al Google falso (Google.php usa token_uri del archivo)
$sa = ['type' => 'service_account', 'project_id' => 'envivo-play', 'private_key_id' => 'kid-prueba-1', 'private_key' => $privPem, 'client_email' => $EMAIL_SA,
       'client_id' => '1', 'token_uri' => "$G/token"];
file_put_contents("$TMP/google-play.json", json_encode($sa));
file_put_contents("$TMP/google-mala.json", json_encode(['private_key' => $otraPem] + $sa));
file_put_contents("$TMP/config.env", "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P_APP\n"
     . "SOPORTE_CORREO=soporte@prueba.example\nSOPORTE_HORARIO=Lunes a viernes 9:00-18:00\n"
     . "GOOGLE_PACKAGE_NAME=$PAQUETE\nGOOGLE_SERVICE_ACCOUNT_JSON=$TMP/google-play.json\nGOOGLE_API_BASE=$G/\nGOOGLE_TOKEN_URL=$G/token\n");
putenv("ENVIVO_CONFIG=$TMP/config.env");

// ---------------------------------------------------------------- servidores: Google falso y el juego (4 procesos, como php-fpm)
$GLOG = "$TMP/google/log.jsonl";
touch($GLOG);
$procs = [];
$arrancar = function (array $cmd, array $env, string $log) use (&$procs) {
    $procs[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tubos, null, $env + getenv());
};
$arrancar([PHP_BINARY, '-S', "127.0.0.1:$P_G", "$SRV/tests/google_falso.php"],
    ['FALSO_GOOGLE_DIR' => "$TMP/google", 'FALSO_GOOGLE_EMAIL' => $EMAIL_SA, 'FALSO_GOOGLE_PAQUETE' => $PAQUETE, 'FALSO_GOOGLE_BASE' => $G], "$TMP/google_srv.log");
$arrancar([PHP_BINARY, '-d', "error_log=$TMP/php_errores.log", '-d', 'log_errors=1', '-d', 'display_errors=0', '-S', "127.0.0.1:$P_APP", '-t', $RAIZ, "$SRV/tests/router.php"],
    ['ENVIVO_CONFIG' => "$TMP/config.env", 'PHP_CLI_SERVER_WORKERS' => '4'], "$TMP/app.log");
register_shutdown_function(function () use (&$procs, $TMP) {
    foreach ($procs as $p) { $s = proc_get_status($p); if ($s['running']) { exec('pkill -TERM -P ' . (int) $s['pid'] . ' 2>/dev/null'); proc_terminate($p); } proc_close($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
});

require $SRV . '/src/arranque.php';
use EnVivo\{Ajustes, Catalogo, Compras, Config, Cuentas, Db, Google, Inventario, Monedero, Soporte};

/** Cambia un valor de la configuración en este proceso y olvida el token de Google guardado. */
function cfg(string $k, string $v): void {
    $r = new ReflectionProperty(Config::class, 'valores');
    $a = $r->getValue(); $a[$k] = $v; $r->setValue(null, $a);
    (new ReflectionProperty(Google::class, 'token'))->setValue(null, null);
}
$glog = function () use ($GLOG): array { return array_map(fn($l) => json_decode($l, true), file($GLOG, FILE_IGNORE_NEW_LINES) ?: []); };
$glogDesde = function (int $n) use ($glog): array { return array_slice($glog(), $n); };
$sinToken = fn(array $l) => array_values(array_filter($l, fn($x) => $x['ruta'] !== 'token'));
$compraG = function (string $token, array $c) use ($TMP): void {   // agrega una compra al Google falso
    $f = "$TMP/google/compras.json";
    $a = is_file($f) ? json_decode((string) file_get_contents($f), true) : [];
    $a[$token] = $c;
    file_put_contents($f, json_encode($a), LOCK_EX);
};
$enGoogle = function (string $token) use ($TMP): ?array { return json_decode((string) @file_get_contents("$TMP/google/compras.json"), true)[$token] ?? null; };
$n = 0;
$jugador = function (string $nombre = 'Jugador') use (&$n): int {
    $n++;
    return Cuentas::registrar('sg' . $n . '.' . bin2hex(random_bytes(3)) . '@prueba.example', $nombre . ' ' . $n, 'ClaveSegura' . $n);
};
$tok = fn(string $s) => 'tok-' . $s . '-' . bin2hex(random_bytes(12));
$orden = function (): string { static $i = 0; $i++; return sprintf('GPA.3300-0000-0000-%05d', $i); };

// =====================================================================================================================
titulo('1. Base: migraciones de Db.php (sin cambiarlas)');
Db::pdo();
check('Base temporal al día', Db::versionEsperada(), (int) Db::valor('PRAGMA user_version'));
$cols = array_column(Db::todas('PRAGMA table_info(compras)'), 'name');
check('compras tiene las columnas de Google que usa Google.php', [true, true, true, true, true],
    array_map(fn($c) => in_array($c, $cols, true), ['canal', 'google_order_id', 'google_token', 'google_token_hash', 'google_ack']));
check('Tablas de soporte y 4 respuestas rápidas iniciales', [true, true, 4],
    [(bool) Db::valor("SELECT 1 FROM sqlite_master WHERE name = 'soporte_casos'"), (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE name = 'soporte_mensajes'"), (int) Db::valor('SELECT COUNT(*) FROM soporte_respuestas')]);

// =====================================================================================================================
titulo('2. Soporte del jugador (Soporte.php)');
check('Contacto: correo y horario de la configuración, sin WhatsApp', ['ok' => true, 'correo' => 'soporte@prueba.example', 'horario' => 'Lunes a viernes 9:00-18:00'], Soporte::contacto());
si('Contacto: solo correo y horario (ninguna clave de teléfono/WhatsApp)', !preg_match('/whats|telefono|phone|wsp/i', json_encode(Soporte::contacto())));
$A = $jugador('Ana');
$B = $jugador('Beto');
$compraA = Db::tx(fn() => Compras::insertar($A, Catalogo::producto('creditos_250'), 'web_plux'));
$compraB = Db::tx(fn() => Compras::insertar($B, Catalogo::producto('creditos_250'), 'web_plux'));
$r = Soporte::crear($A, ['categoria' => 'pago', 'asunto' => '  No me llegaron   los créditos ', 'mensaje' => 'Pagué y no veo los 250 créditos.', 'compra_id' => (int) $compraA['id'],
    'diagnostico' => ['version' => '1.4.0', 'dia' => 12, 'idioma' => 'es', 'email' => 'ana@prueba.example', 'tarjeta' => '4111111111111111', 'nota' => 'pagué con 4111 1111 1111 1111', 'pantalla' => ['w' => 390, 'h' => 844]]]);
$casoA = $r['caso'];
check('Crear caso: abierto, asunto limpio, la compra y 1 mensaje del jugador', ['abierto', 'No me llegaron los créditos', (int) $compraA['id'], 1, 'jugador', 0],
    [$casoA['estado'], $casoA['asunto'], $casoA['compra_id'], count($casoA['mensajes']), $casoA['mensajes'][0]['autor'], $casoA['sin_leer']]);
check('Diagnóstico: sin correo ni tarjeta y oculta números largos', ['version' => '1.4.0', 'dia' => 12, 'idioma' => 'es', 'nota' => 'pagué con [oculto]', 'pantalla' => ['w' => 390, 'h' => 844]],
    json_decode((string) Db::valor('SELECT diagnostico_json FROM soporte_casos WHERE id = ?', [$casoA['id']]), true));
check('Categoría inválida -> 400 categoria_invalida', [400, 'categoria_invalida'], fallo(fn() => Soporte::crear($A, ['categoria' => 'whatsapp', 'asunto' => 'x', 'mensaje' => 'y'])));
check('Asunto de más de 80 -> 400 asunto_invalido', [400, 'asunto_invalido'], fallo(fn() => Soporte::crear($A, ['categoria' => 'otro', 'asunto' => str_repeat('a', 81), 'mensaje' => 'y'])));
check('Sin mensaje -> 400 vacio', [400, 'vacio'], fallo(fn() => Soporte::crear($A, ['categoria' => 'otro', 'asunto' => 'Hola', 'mensaje' => '   '])));
check('Mensaje de más de 2000 -> 400 largo', [400, 'largo'], fallo(fn() => Soporte::crear($A, ['categoria' => 'otro', 'asunto' => 'Hola', 'mensaje' => str_repeat('é', 2001)])));
check('Compra de otro jugador -> 400 compra_ajena', [400, 'compra_ajena'], fallo(fn() => Soporte::crear($A, ['categoria' => 'pago', 'asunto' => 'Hola', 'mensaje' => 'y', 'compra_id' => (int) $compraB['id']])));
check('Diagnóstico que no es objeto -> 400 diagnostico_invalido', [400, 'diagnostico_invalido'], fallo(fn() => Soporte::crear($A, ['categoria' => 'error', 'asunto' => 'Hola', 'mensaje' => 'y', 'diagnostico' => 'texto'])));
check('Diagnóstico de más de 4 KB -> 413 diagnostico_grande', [413, 'diagnostico_grande'],
    fallo(fn() => Soporte::crear($A, ['categoria' => 'error', 'asunto' => 'Hola', 'mensaje' => 'y', 'diagnostico' => array_fill(0, 30, str_repeat('x', 200))])));
check('Nada de eso creó casos', 1, (int) Db::valor('SELECT COUNT(*) FROM soporte_casos WHERE jugador_id = ?', [$A]));
$C = $jugador('Caro');
for ($i = 1; $i <= 5; $i++) Soporte::crear($C, ['categoria' => 'sugerencia', 'asunto' => 'Idea ' . $i, 'mensaje' => 'Idea número ' . $i]);
check('Límite: el 6.º caso sin cerrar -> 409 max_casos', [409, 'max_casos'], fallo(fn() => Soporte::crear($C, ['categoria' => 'otro', 'asunto' => 'Otra', 'mensaje' => 'y'])));
$D = $jugador('Dani');
$casoD = Soporte::crear($D, ['categoria' => 'error', 'asunto' => 'Se cierra', 'mensaje' => 'Mensaje 1'])['caso']['id'];
for ($i = 2; $i <= 10; $i++) Soporte::responder($D, $casoD, 'Mensaje ' . $i);
check('Límite: el mensaje 11 en una hora -> 429 limite_intentos (y no se guarda)', [[429, 'limite_intentos'], 10],
    [fallo(fn() => Soporte::responder($D, $casoD, 'Mensaje 11')), (int) Db::valor('SELECT COUNT(*) FROM soporte_mensajes WHERE caso_id = ?', [$casoD])]);
check('Responder / marcar leído el caso de otro jugador -> 404', [404, 404], [fallo(fn() => Soporte::responder($B, $casoA['id'], 'hola'))[0] ?? null, fallo(fn() => Soporte::leido($B, $casoA['id']))[0] ?? null]);
$suspendido = $jugador('Susi');
Cuentas::suspender($suspendido, 'Prueba de reembolso', 'prueba');
si('Una cuenta suspendida (reembolso) SÍ puede escribir a soporte', isset(Soporte::crear($suspendido, ['categoria' => 'cuenta', 'asunto' => 'Me suspendieron', 'mensaje' => '¿Por qué?'])['caso']));

// =====================================================================================================================
titulo('3. Soporte desde el Centro de Control (Soporte::responderSoporte / cambiarEstado)');
Soporte::responderSoporte($casoA['id'], 'Hola, ya está acreditado.', 'admin_prueba');
check('Responder: estado respondido y 1 sin leer para el jugador (también en /api/estado)', ['respondido', 1, 1],
    [Db::valor('SELECT estado FROM soporte_casos WHERE id = ?', [$casoA['id']]), Soporte::sinLeer($A), Cuentas::estado($A)['soporte_sin_leer']]);
check('compras_recientes en el estado (para elegir la compra en el formulario)', [(int) $compraA['id']], array_map(fn($c) => $c['id'], Cuentas::estado($A)['compras_recientes']));
$l = Soporte::listar($A)['casos'];
check('listar(): el caso con sin_leer 1 y 2 mensajes', [$casoA['id'], 1, 2], [$l[0]['id'], $l[0]['sin_leer'], count($l[0]['mensajes'])]);
check('leido() -> soporte_sin_leer 0', ['ok' => true, 'soporte_sin_leer' => 0], Soporte::leido($A, $casoA['id']));
check('El jugador responde -> se reabre', 'abierto', Soporte::responder($A, $casoA['id'], 'Gracias, ya lo veo.')['caso']['estado']);
Soporte::cambiarEstado($casoA['id'], 'cerrado', 'admin_prueba');
check('Cerrar', 'cerrado', Db::valor('SELECT estado FROM soporte_casos WHERE id = ?', [$casoA['id']]));
Soporte::cambiarEstado($casoA['id'], 'abierto', 'admin_prueba');
check('Reabrir', 'abierto', Db::valor('SELECT estado FROM soporte_casos WHERE id = ?', [$casoA['id']]));
Soporte::responderSoporte($casoA['id'], 'Listo, cerramos.', 'admin_prueba', true);
check('Responder y cerrar a la vez', 'cerrado', Db::valor('SELECT estado FROM soporte_casos WHERE id = ?', [$casoA['id']]));
check('El jugador escribe en un caso cerrado -> se reabre', 'abierto', Soporte::responder($A, $casoA['id'], 'Una cosa más')['caso']['estado']);
check('Estado no válido -> 400 · caso que no existe -> 404 · respuesta vacía -> 400',
    [400, 404, 400], [fallo(fn() => Soporte::cambiarEstado($casoA['id'], 'respondido', 'a'))[0] ?? null, fallo(fn() => Soporte::cambiarEstado(99999, 'cerrado', 'a'))[0] ?? null, fallo(fn() => Soporte::responderSoporte($casoA['id'], '  ', 'a'))[0] ?? null]);
check('Todo en la auditoría (2 respuestas, cerrar, reabrir)', ['soporte_cerrar', 'soporte_reabrir', 'soporte_respuesta', 'soporte_respuesta'],
    array_column(Db::todas("SELECT accion FROM auditoria WHERE accion LIKE 'soporte_%' AND jugador_id = ? ORDER BY accion", [$A]), 'accion'));

// =====================================================================================================================
titulo('4. Google Play: JWT RS256, token OAuth y verificar compras (Google.php + Google falso)');
if (!esperar("$G/x") || !esperar("http://127.0.0.1:$P_APP/api/estado")) { echo "No arrancaron los servidores de prueba\n"; exit(1); }
si('Google configurado (paquete + .json legible)', Google::configurado());
$G1 = $jugador('Gabi');
$tk1 = $tok('c700'); $o1 = $orden();
$compraG($tk1, ['productId' => 'creditos_700', 'orderId' => $o1, 'purchaseState' => 0, 'obfuscatedExternalAccountId' => 'ev-' . $G1]);
$antes = count($glog());
$r = Google::verificar($G1, 'creditos_700', $tk1, $o1);
$l = $glogDesde($antes);
check('El Google falso aceptó el JWT (firma RS256 con la llave pública, iss, aud, scope, 1 hora)', [true, ''], [$l[0]['jwt_ok'] ?? null, $l[0]['motivo'] ?? null]);
check('Compra nueva: pagada, canal google_play, con orderId, comprobante (y su hash) y avisada', [true, 'pagado', 'google_play', $o1, $tk1, hash('sha256', $tk1), true],
    [$r['nueva'], $r['compra']['estado'], $r['compra']['canal'], $r['compra']['google_order_id'], $r['compra']['google_token'], $r['compra']['google_token_hash'], $r['compra']['google_ack'] !== null]);
check('…entregó 700 créditos y se consumió en Google', [700, 1], [Monedero::saldo($G1), $enGoogle($tk1)['consumptionState']]);
check('…pedidos: products.get y consume, con Bearer válido', [['producto', true], ['aviso:consume', true]], array_map(fn($x) => [$x['ruta'], $x['bearer_ok']], $sinToken($l)));
$antes = count($glog());
$r2 = Google::verificar($G1, 'creditos_700', $tk1, $o1);
check('El mismo comprobante otra vez: misma compra, nueva=false, sin entregar ni llamar a Google', [false, (int) $r['compra']['id'], 700, 0],
    [$r2['nueva'], (int) $r2['compra']['id'], Monedero::saldo($G1), count($glogDesde($antes))]);
check('…también si la app manda el orderId vacío (restaurar compras en la TWA)', [false, 700], [Google::verificar($G1, 'creditos_700', $tk1, '')['nueva'], Monedero::saldo($G1)]);
$G2 = $jugador('Gina');
check('El mismo comprobante desde otra cuenta -> 409 google_otra_cuenta (y queda anotado)', [[409, 'google_otra_cuenta'], 1],
    [fallo(fn() => Google::verificar($G2, 'creditos_700', $tk1, $o1)), (int) Db::valor("SELECT COUNT(*) FROM avisos WHERE tipo = 'google_otra_cuenta'")]);
check('El mismo orderId con otro comprobante -> 409', 409, fallo(fn() => Google::verificar($G1, 'creditos_700', $tok('x'), $o1))[0] ?? null);
// TWA: sin orderId -> se toma el de Google
$tkw = $tok('twa'); $ow = $orden();
$compraG($tkw, ['productId' => 'creditos_250', 'orderId' => $ow, 'purchaseState' => 0]);
$r = Google::verificar($G2, 'creditos_250', $tkw, '');
check('TWA sin orderId: entrega y guarda el orderId que dice Google', [true, $ow, 250], [$r['nueva'], $r['compra']['google_order_id'], Monedero::saldo($G2)]);
// Errores (todos con codigo)
$casos = [
    'desconocido' => [$tok('nada'), 'creditos_250', null, ''],
    'pendiente' => [$tok('pend'), 'creditos_250', ['purchaseState' => 2], 'google_pendiente'],
    'cancelada' => [$tok('canc'), 'creditos_250', ['purchaseState' => 1], 'google_cancelada'],
    'otra_cuenta' => [$tok('otra'), 'creditos_250', ['purchaseState' => 0, 'obfuscatedExternalAccountId' => 'ev-' . $G2], 'google_otra_cuenta'],
    'orden_distinta' => [$tok('mal'), 'creditos_250', ['purchaseState' => 0], 'google_no_coincide'],
];
$res = [];
foreach ($casos as $k => [$t, $prod, $datos, $cod]) {
    $o = $orden();
    if ($datos !== null) $compraG($t, ['productId' => $prod, 'orderId' => $o] + $datos);
    $res[$k] = fallo(fn() => Google::verificar($G1, $prod, $t, $k === 'orden_distinta' ? 'GPA.9999-9999-9999-99999' : $o));
}
check('Errores de Google con su codigo: desconocida 402, pendiente 402, cancelada 402, otra cuenta 409, orden distinta 409', [
    'desconocido' => [402, 'google_invalida'], 'pendiente' => [402, 'google_pendiente'], 'cancelada' => [402, 'google_cancelada'],
    'otra_cuenta' => [409, 'google_otra_cuenta'], 'orden_distinta' => [409, 'google_no_coincide']], $res);
check('Producto desconocido -> 404 · oculto (transferencia_cuenta) -> 404 · datos raros -> 400', [[404, 'no_existe'], [404, 'no_existe'], [400, 'datos_invalidos'], [400, 'datos_invalidos']],
    [fallo(fn() => Google::verificar($G1, 'creditos_9999', $tok('a'), '')), fallo(fn() => Google::verificar($G1, 'transferencia_cuenta', $tok('a'), '')),
     fallo(fn() => Google::verificar($G1, 'creditos_250', 'corto', '')), fallo(fn() => Google::verificar($G1, 'creditos_250', $tok('a'), "GPA'; DROP"))]);
check('Ninguno de esos creó compras ni dio créditos', [1, 700], [(int) Db::valor("SELECT COUNT(*) FROM compras WHERE canal = 'google_play' AND jugador_id = ?", [$G1]), Monedero::saldo($G1)]);
// Paquete de inicio (una sola vez)
$tki = $tok('ini'); $oi = $orden(); $compraG($tki, ['productId' => 'inicio', 'orderId' => $oi, 'purchaseState' => 0]);
$antes = count($glog());
$r = Google::verificar($G2, 'inicio', $tki, $oi);
check('Paquete de inicio: acknowledge (no consume) con developerPayload EV-<compra>', [['aviso:acknowledge', 'EV-' . $r['compra']['id']]],
    array_map(fn($x) => [$x['ruta'], $x['payload']], array_values(array_filter($glogDesde($antes), fn($x) => str_starts_with($x['ruta'], 'aviso')))));
check('…200 créditos y la cámara al inventario', [450, ['cam_pro']], [Monedero::saldo($G2), array_column(Inventario::deJugador($G2), 'item')]);
$tki2 = $tok('ini2'); $oi2 = $orden(); $compraG($tki2, ['productId' => 'inicio', 'orderId' => $oi2, 'purchaseState' => 0]);
$r = Google::verificar($G2, 'inicio', $tki2, $oi2);
check('Segundo paquete de inicio cobrado por Google: pagado pero NO se entrega otra vez (aviso para devolver)', [true, 450, 1, 1],
    [$r['nueva'], Monedero::saldo($G2), count(Inventario::deJugador($G2)), (int) Db::valor("SELECT COUNT(*) FROM avisos WHERE tipo = 'inicio_duplicado' AND compra_id = ?", [$r['compra']['id']])]);
$tkr = $tok('ref'); $or = $orden(); $compraG($tkr, ['productId' => 'refuerzo_camarografo_senior', 'orderId' => $or, 'purchaseState' => 0]);
Google::verificar($G2, 'refuerzo_camarografo_senior', $tkr, $or);
check('Refuerzo vendido en Google: crea la entrega tipo refuerzo', [['refuerzo', 'refuerzo_camarografo_senior']],
    array_map(fn($e) => [$e['tipo'], $e['item']], Db::todas("SELECT * FROM entregas WHERE jugador_id = ? AND tipo = 'refuerzo'", [$G2])));
// Aviso a Google que falla -> avisosPendientes()
$tkf = $tok('falla'); $of = $orden(); $compraG($tkf, ['productId' => 'creditos_1500', 'orderId' => $of, 'purchaseState' => 0, 'falla_aviso' => true]);
$r = Google::verificar($G2, 'creditos_1500', $tkf, $of);
check('El aviso a Google falla: se entrega igual y queda sin google_ack', [true, null], [$r['nueva'], $r['compra']['google_ack']]);
check('avisosPendientes() lo reintenta y queda avisada (y otra vez: nada)', [1, true, 1, 0],
    [Google::avisosPendientes(), Compras::porId((int) $r['compra']['id'])['google_ack'] !== null, $enGoogle($tkf)['consumptionState'], Google::avisosPendientes()]);
$tka = $tok('ya'); $oa = $orden(); $compraG($tka, ['productId' => 'creditos_250', 'orderId' => $oa, 'purchaseState' => 0, 'consumptionState' => 1, 'acknowledgementState' => 1]);
check('Google dice "already consumed" (400): se da por avisada', true, Google::verificar($G2, 'creditos_250', $tka, $oa)['compra']['google_ack'] !== null);
// Llave equivocada
cfg('GOOGLE_SERVICE_ACCOUNT_JSON', "$TMP/google-mala.json");
$antes = count($glog());
check('Llave equivocada: Google rechaza la firma -> 502 google_error', [502, 'google_error'], fallo(fn() => Google::verificar($G1, 'creditos_250', $tok('k'), '')));
check('…y el Google falso dice que fue la firma', 'firma', $glogDesde($antes)[0]['motivo'] ?? null);
cfg('GOOGLE_SERVICE_ACCOUNT_JSON', "$TMP/no-existe.json");
check('Sin el .json -> 503 google_no_disponible', [503, 'google_no_disponible'], fallo(fn() => Google::verificar($G1, 'creditos_250', $tok('k'), '')));
cfg('GOOGLE_SERVICE_ACCOUNT_JSON', "$TMP/google-play.json");

// =====================================================================================================================
titulo('5. Google Play: compras anuladas (voidedpurchases.list) -> reembolso / contracargo');
$ahoraMs = time() * 1000;
$oB = (string) Db::valor('SELECT google_order_id FROM compras WHERE google_token_hash = ?', [hash('sha256', $tkw)]);
file_put_contents("$TMP/google/anuladas.json", json_encode([
    ['purchaseToken' => $tk1, 'orderId' => $o1, 'voidedTimeMillis' => $ahoraMs - 5000, 'purchaseTimeMillis' => $ahoraMs - 60000, 'voidedReason' => 1, 'voidedSource' => 0],
    ['purchaseToken' => $tkw, 'orderId' => $oB, 'voidedTimeMillis' => $ahoraMs - 4000, 'purchaseTimeMillis' => $ahoraMs - 60000, 'voidedReason' => 7, 'voidedSource' => 2],
    ['purchaseToken' => 'tok-de-otra-app-0000000', 'orderId' => 'GPA.9999-0000-0000-00000', 'voidedTimeMillis' => $ahoraMs - 3000, 'voidedReason' => 0, 'voidedSource' => 1],
    ['purchaseToken' => 'tok-vieja-00000000000', 'orderId' => 'GPA.8888-0000-0000-00000', 'voidedTimeMillis' => $ahoraMs - 40 * 86400 * 1000, 'voidedReason' => 1, 'voidedSource' => 0],
]));
$saldoG1 = Monedero::saldo($G1);
$antes = count($glog());
check('revisarAnuladas(): 3 revisadas (las de 30 días), 2 revertidas', [3, 2], Google::revisarAnuladas());
$ped = array_values(array_filter($glogDesde($antes), fn($x) => $x['ruta'] === 'anuladas'));
check('…en 2 páginas (token de paginación), solo compras de una vez (type=0), Bearer válido', [2, ['0', '0'], [null, 'p2']], [count($ped), array_column($ped, 'type'), array_column($ped, 'token')]);
check('…motivo 1 = reembolso, motivo 7 = contracargo', [['revertido', 'reembolso'], ['revertido', 'contracargo']],
    [array_values(Db::fila('SELECT estado, revertida_tipo FROM compras WHERE google_order_id = ?', [$o1])), array_values(Db::fila('SELECT estado, revertida_tipo FROM compras WHERE google_order_id = ?', [$oB]))]);
// G6 (decisión del dueño): un reembolso suspende; un contracargo BANEA (Compras::revisarAbuso)
check('…quitó los 700 créditos: reembolso -> suspendida, contracargo -> baneada', [$saldoG1 - 700, 'suspendido', 'baneado'], [Monedero::saldo($G1), Cuentas::estadoCuenta($G1), Cuentas::estadoCuenta($G2)]);
check('…la que no está en el juego deja un aviso', 1, (int) Db::valor("SELECT COUNT(*) FROM avisos WHERE tipo = 'google_anulada_sin_compra' AND detalle LIKE '%GPA.9999%'"));
si('…guardó desde dónde seguir (la última anulada vista)', abs((int) Ajustes::get('google_anulados_desde') - ($ahoraMs - 3000)) <= 1);
$antes = count($glog());
// G4: con 1 hora de solape vuelve a ver las mismas anuladas, pero NO las revierte otra vez
check('revisarAnuladas() otra vez: no revierte nada nuevo', 0, Google::revisarAnuladas()[1]);
$st = (int) (array_values(array_filter($glogDesde($antes), fn($x) => $x['ruta'] === 'anuladas'))[0]['startTime'] ?? 0);
si('…pidió desde la última vista (con hasta 1 hora de solape)', $st >= $ahoraMs - 3000 - 3600 * 1000 && $st <= $ahoraMs - 3000 + 1);
check('Verificar otra vez una compra reembolsada -> 409 google_revertido', [409, 'google_revertido'], fallo(fn() => Google::verificar($G1, 'creditos_700', $tk1, $o1)));
$tks = $tok('susp'); $os = $orden(); $compraG($tks, ['productId' => 'creditos_250', 'orderId' => $os, 'purchaseState' => 0]);
check('Cuenta suspendida que compra en Google -> 403 cuenta_suspendida (no se avisa: Google devuelve el dinero a los 3 días)', [[403, 'cuenta_suspendida'], 0],
    [fallo(fn() => Google::verificar($G1, 'creditos_250', $tks, $os)), (int) ($enGoogle($tks)['consumptionState'] ?? 0)]);

// =====================================================================================================================
titulo('6. Por HTTP (api.php + router.php): rutas de soporte, /api/estado y /api/google/verificar');
final class Nav {
    public int $http = 0; public string $cuerpo = '';
    private string $jar;
    public function __construct(private string $base, string $nombre) { $this->jar = sys_get_temp_dir() . "/ev_sg_jar_{$nombre}_" . getmypid(); @unlink($this->jar); }
    public function __destruct() { @unlink($this->jar); }
    public function ch(string $metodo, string $ruta, ?array $datos = null, bool $cabecera = true): CurlHandle {
        $ch = curl_init($this->base . $ruta);
        $cab = ['Content-Type: application/json'];
        if ($cabecera) $cab[] = 'X-Envivo: 1';
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar,
            CURLOPT_HTTPHEADER => $cab, CURLOPT_NOPROXY => '*', CURLOPT_TIMEOUT => 30]);
        if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($datos));
        return $ch;
    }
    public function pedir(string $metodo, string $ruta, ?array $datos = null, bool $cabecera = true): array {
        $ch = $this->ch($metodo, $ruta, $datos, $cabecera);
        $this->cuerpo = (string) curl_exec($ch);
        $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        return json_decode($this->cuerpo, true) ?? ['crudo' => $this->cuerpo];
    }
    public function get(string $r): array { return $this->pedir('GET', $r); }
    public function post(string $r, array $d = [], bool $cabecera = true): array { return $this->pedir('POST', $r, $d, $cabecera); }
}
$URL = "http://127.0.0.1:$P_APP";
$anon = new Nav($URL, 'anon');
$r = $anon->get('/api/soporte/contacto');
check('GET /api/soporte/contacto sin sesión', [200, 'soporte@prueba.example', 'Lunes a viernes 9:00-18:00'], [$anon->http, $r['correo'] ?? null, $r['horario'] ?? null]);
$r = $anon->get('/api/soporte');
check('GET /api/soporte sin sesión -> 401 con error y codigo', [401, false, true, 'sesion_requerida'], [$anon->http, $r['ok'] ?? null, is_string($r['error'] ?? null), $r['codigo'] ?? null]);
$h = new Nav($URL, 'h');
$reg = $h->post('/api/registro', ['email' => 'http.' . bin2hex(random_bytes(3)) . '@prueba.example', 'nombre' => 'Hugo', 'clave' => 'ClaveSegura99', 'acepta_terminos' => true, 'edad_16' => true]);
$H = (int) ($reg['jugador']['id'] ?? 0);
si('Registro por HTTP', $H > 0);
$r = $h->post('/api/soporte', ['categoria' => 'pago', 'asunto' => 'Prueba HTTP', 'mensaje' => 'Hola soporte', 'diagnostico' => ['version' => '1.4.0']]);
$casoH = (int) ($r['caso']['id'] ?? 0);
check('POST /api/soporte crea el caso', [200, true, 'abierto'], [$h->http, $r['ok'] ?? null, $r['caso']['estado'] ?? null]);
$r = $h->post('/api/soporte', ['categoria' => 'pago', 'asunto' => 'x', 'mensaje' => 'y'], false);
check('POST sin X-Envivo -> 403 cabecera_requerida', [403, 'cabecera_requerida'], [$h->http, $r['codigo'] ?? null]);
$r = $h->post('/api/soporte', ['categoria' => 'nada', 'asunto' => 'x', 'mensaje' => 'y']);
check('Validación -> 400 con error y codigo', [400, false, true, 'categoria_invalida'], [$h->http, $r['ok'] ?? null, is_string($r['error'] ?? null), $r['codigo'] ?? null]);
Soporte::responderSoporte($casoH, 'Hola Hugo, revisamos tu pago.', 'admin_prueba');
$e = $h->get('/api/estado');
check('/api/estado: soporte_sin_leer 1 y compras_recientes', [1, true], [$e['soporte_sin_leer'] ?? null, is_array($e['compras_recientes'] ?? null)]);
$r = $h->get('/api/soporte');
check('GET /api/soporte: el caso con la respuesta sin leer', [$casoH, 1, 'Hola Hugo, revisamos tu pago.'], [$r['casos'][0]['id'] ?? null, $r['casos'][0]['sin_leer'] ?? null, $r['casos'][0]['mensajes'][1]['texto'] ?? null]);
$r = $h->post('/api/soporte/leido', ['caso_id' => $casoH]);
check('POST /api/soporte/leido', [200, 0], [$h->http, $r['soporte_sin_leer'] ?? null]);
$r = $h->post('/api/soporte/responder', ['caso_id' => $casoH, 'mensaje' => 'Gracias']);
check('POST /api/soporte/responder reabre', [200, 'abierto'], [$h->http, $r['caso']['estado'] ?? null]);
$r = $h->post('/api/soporte/responder', ['caso_id' => $casoA['id'], 'mensaje' => 'Me meto en otro caso']);
check('Responder el caso de otro jugador -> 404 con codigo', [404, true], [$h->http, is_string($r['codigo'] ?? null)]);
$r = $h->post('/api/soporte/leido', []);
check('Sin caso_id -> 400 falta_caso_id', [400, 'falta_caso_id'], [$h->http, $r['codigo'] ?? null]);
$tkh = $tok('http'); $oh = $orden(); $compraG($tkh, ['productId' => 'creditos_250', 'orderId' => $oh, 'purchaseState' => 0]);
$r = $h->post('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => $tkh, 'orderId' => '']);
check('POST /api/google/verificar (TWA, sin orderId): nueva, pagada, google_play y el estado con los créditos', [200, true, 'pagado', 'google_play', 250],
    [$h->http, $r['nueva'] ?? null, $r['compra']['estado'] ?? null, $r['compra']['canal'] ?? null, $r['creditos'] ?? null]);
$r = $h->post('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => $tkh]);
check('…otra vez: nueva=false y los créditos iguales', [200, false, 250], [$h->http, $r['nueva'] ?? null, $r['creditos'] ?? null]);
$r = $h->post('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => $tok('desc')]);
check('…comprobante desconocido -> 402 con error y codigo', [402, true, 'google_invalida'], [$h->http, is_string($r['error'] ?? null), $r['codigo'] ?? null]);
$r = $h->post('/api/google/verificar', ['producto' => 'creditos_250']);
check('…sin comprobante -> 400 con codigo', [400, 'datos_invalidos'], [$h->http, $r['codigo'] ?? null]);
$sin = new Nav($URL, 'sin');
$r = $sin->post('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => $tkh]);
check('…sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], [$sin->http, $r['codigo'] ?? null]);
// Dos pedidos A LA VEZ con el mismo comprobante (la app al comprar + al restaurar): una sola compra
$tkc = $tok('vez'); $oc = $orden(); $compraG($tkc, ['productId' => 'creditos_700', 'orderId' => $oc, 'purchaseState' => 0]);
$mh = curl_multi_init(); $hs = [];
for ($i = 0; $i < 3; $i++) { $hs[$i] = $h->ch('POST', '/api/google/verificar', ['producto' => 'creditos_700', 'purchaseToken' => $tkc]); curl_multi_add_handle($mh, $hs[$i]); }
do { curl_multi_exec($mh, $activos); curl_multi_select($mh); } while ($activos);
$res = array_map(fn($c) => [(int) curl_getinfo($c, CURLINFO_HTTP_CODE), json_decode((string) curl_multi_getcontent($c), true)['nueva'] ?? null], $hs);
usort($res, fn($a, $b) => (int) $b[1] <=> (int) $a[1]);
check('3 pedidos a la vez con el mismo comprobante: todos 200, solo uno "nueva", 1 compra y 700 créditos más', [[[200, true], [200, false], [200, false]], 1, 950],
    [$res, (int) Db::valor('SELECT COUNT(*) FROM compras WHERE google_token_hash = ?', [hash('sha256', $tkc)]), Monedero::saldo($H)]);

$errores = is_file("$TMP/php_errores.log") ? trim((string) file_get_contents("$TMP/php_errores.log")) : '';
$errores = trim(implode("\n", array_filter(explode("\n", $errores), fn($x) => !str_contains($x, 'EN VIVO Google: token respondió') && !str_contains($x, 'respondió 503'))));
check('Sin errores ni avisos de PHP en el juego', '', $errores);
check('El Google falso solo vio una firma inválida (la de la llave equivocada)', 1, count(array_filter($glog(), fn($x) => ($x['motivo'] ?? '') === 'firma')));
check('Ningún pedido a la API de Google sin Bearer válido', 0, count(array_filter($glog(), fn($x) => ($x['bearer_ok'] ?? true) === false)));

// =====================================================================================================================
titulo('7. Pendiente según docs/INTEGRAR_SOPORTE_GOOGLE.md (se informa; no cuenta como falla)');
pendiente('G1', 'bin/google_anulados.php existe (revisarAnuladas + avisosPendientes, cron diario)', is_file("$SRV/bin/google_anulados.php"));
$tareas = (string) file_get_contents("$SRV/bin/tareas.php") . (string) @file_get_contents("$SRV/deploy/instalar.sh");
pendiente('G2', 'el cron llama a la revisión de anuladas y a avisosPendientes()', str_contains($tareas, 'google_anulados') || str_contains($tareas, 'revisarAnuladas'));
$fuente = (string) file_get_contents("$SRV/src/Google.php");
pendiente('G3', 'acknowledge "already acknowledged" (400) también cuenta como avisada', !str_contains($fuente, "\$accion === ':consume' && in_array(\$c, [400, 409]"));
pendiente('G4', 'startTime de anuladas con margen (no exactamente 30 días atrás) y solape de 1 hora', !str_contains($fuente, '(time() - 30 * 86400) * 1000'));
pendiente('G5', 'compras de prueba (purchaseType 0) dejan un aviso', str_contains($fuente, 'purchaseType'));
pendiente('G6', 'reembolsos repetidos o contracargo -> baneo (abuso de reembolsos)', str_contains($fuente, 'baneado') || str_contains($fuente, 'baneo'));
pendiente('G7', 'token: 401 de Google -> token nuevo y un reintento', str_contains($fuente, '401'));
pendiente('G8', 'GOOGLE_TOKEN_URL (o token fijo de Google) en vez de confiar en token_uri del .json', str_contains($fuente, 'GOOGLE_TOKEN_URL'));
$sop = (string) file_get_contents("$SRV/src/Soporte.php");
pendiente('S1', 'respuestas rápidas editables (crear / editar / borrar)', str_contains($sop, 'soporte_respuestas') && preg_match('/(INSERT INTO|UPDATE|DELETE FROM) soporte_respuestas/', $sop . @file_get_contents("$SRV/public/control/lib/soporte.php")) === 1);
pendiente('S2', "errores del Centro de Control con 'codigo' (caso_no_existe, estado_invalido, vacio)", substr_count($sop, "'caso_no_existe'") > 0);
pendiente('DOC', 'server/GOOGLE_PLAY.md (lo nombran Google.php e instalar.sh)', is_file("$SRV/GOOGLE_PLAY.md"));
$dist = (string) @file_get_contents("$RAIZ/dist/envivo-tycoon.html");
pendiente('S5', 'dist/ reconstruido sin "WhatsApp" (el soporte es solo en el juego y por correo)', !preg_match('/whats\s*app/i', $dist));

echo "\nResumen pruebas_soporte_google.php — correctas: $ok  ·  Fallas: $fallas  ·  Pendientes (no son fallas): " . count($pendientes) . "\n";
exit($fallas === 0 ? 0 : 1);
