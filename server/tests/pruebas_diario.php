<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Premio diario de 7 días (server/src/Diario.php, DiarioApi.php;
// server/INTEGRAR_DIARIO.md): base SQLite TEMPORAL con todas las migraciones, reloj inyectable (Diario::$reloj), un reclamo
// por día de Ecuador, pausa sin castigo al faltar, ciclo de 7 días, créditos con motivo 'diario', VIP 3+ con dinero doble,
// cuentas suspendidas, y las rutas por HTTP (php -S con una copia de api.php).
// Uso:  php server/tests/pruebas_diario.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_diario_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Diario, DiarioApi, Fallo, Migraciones, Monedero};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
function falla(callable $f): array
{
    try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; }
}

Db::pdo();
$nuevo = function (string $alias, int $creditos = 0): int {
    Db::q('INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (1, ?, 1000, 1, ?)', ['Servidor 1', time()]);
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, creditos) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '.' . bin2hex(random_bytes(2)) . '@prueba.example', $alias, 'x', time(), $alias, strtolower($alias), $creditos]);
    return Db::ultimoId();
};
$Z = new DateTimeZone('America/Guayaquil');
$en = fn(string $cuando) => (new DateTimeImmutable($cuando, $Z))->getTimestamp();
$movs = fn(int $j) => Db::todas("SELECT cambio, motivo, ref FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id", [$j]);
$entregas = fn(int $j) => array_map(fn($e) => [$e['tipo'], $e['item'], (int) $e['cantidad']], Db::todas('SELECT * FROM entregas WHERE jugador_id = ? ORDER BY id', [$j]));

// =====================================================================
titulo('Migración diario.sql');
$tablas = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'diario_%' ORDER BY name"), 'name');
check('Tablas diario_jugador y diario_reclamos', ['diario_jugador', 'diario_reclamos'], $tablas);
check('Aplicar diario.sql otra vez no cambia nada', [], Migraciones::aplicar('diario.sql'));

// =====================================================================
titulo('Tabla de premios (fija y visible)');
check('7 días', [1, 2, 3, 4, 5, 6, 7], array_keys(Diario::PREMIOS));
check('Día 2 y día 7 son los grandes', [2, 7], array_keys(array_filter(Diario::PREMIOS, fn($p) => !empty($p['grande']))));
check('Dinero modesto (día 7 = $1.000, total semana $3.600)', [1000, 3600], [Diario::PREMIOS[7]['dinero'], array_sum(array_column(Diario::PREMIOS, 'dinero'))]);
check('Créditos pequeños: 5 el día 2 y 20 el día 7', [0, 5, 0, 0, 0, 0, 20], array_values(array_column(Diario::PREMIOS, 'creditos')));
check('Materiales válidos de la sede', true, array_reduce(Diario::PREMIOS, fn($c, $p) => $c && !array_diff(array_keys($p['materiales']), ['cables', 'placas', 'paneles', 'credenciales', 'planos', 'chips']), true));
check('Repuestos válidos (cable, battery)', true, array_reduce(Diario::PREMIOS, fn($c, $p) => $c && !array_diff(array_keys($p['consumibles']), ['cable', 'battery']), true));
check('VIP 3: dinero doble (día 7 = $2.000), créditos iguales', [2000, 20, true], (fn($p) => [$p['dinero'], $p['creditos'], $p['vip_doble']])(Diario::premio(7, 3)));
check('VIP 2: dinero normal', [1000, false], (fn($p) => [$p['dinero'], $p['vip_doble']])(Diario::premio(7, 2)));
check('Sin sede oficial: sin materiales', [], (array) Diario::premio(7, 0, false)['materiales']);

// =====================================================================
titulo('Día de Ecuador (America/Guayaquil), del reloj del servidor');
check('23:59 en Ecuador = mismo día (aunque en UTC ya sea mañana)', '2026-10-23', Diario::dia($en('2026-10-23 23:59:00')));
check('00:01 en Ecuador = día siguiente', '2026-10-24', Diario::dia($en('2026-10-24 00:01:00')));
check('Próximo premio = medianoche de Ecuador', $en('2026-10-24 00:00:00'), Diario::proximo($en('2026-10-23 10:00:00')));
check('Ayer de 2026-11-01', '2026-10-31', Diario::ayer('2026-11-01'));

// =====================================================================
titulo('Ciclo de 7 días: un reclamo por día, faltar pausa');
$A = $nuevo('Ana Diaria', 10);
Diario::$reloj = $en('2026-10-23 09:00:00');
$e = Diario::estado($A);
check('Nuevo: Día 1 de 7, sin reclamar, hoy brilla el 1', [1, 7, false, 'hoy', 'bloqueado'], [$e['dia'], $e['dias'], $e['reclamado_hoy'], $e['premios'][0]['estado'], $e['premios'][1]['estado']]);
check('Faltan 15 h para el próximo', 15 * 3600, $e['quedan_seg']);
$r = Diario::reclamar($A);
check('Reclamar día 1 -> $300 como entrega de dinero, sin créditos', [true, 1, 300, [['dinero', '-', 300]], 10], [$r['ok'], $r['reclamado']['dia'], $r['reclamado']['dinero'], array_map(fn($x) => [$x['tipo'], $x['item'], $x['cantidad']], $r['entregas']), $r['creditos']]);
check('Después: reclamado hoy, día 1 listo y el 2 es el siguiente', [true, 1, 'reclamado', 'siguiente'], [$r['diario']['reclamado_hoy'], $r['diario']['dia'], $r['diario']['premios'][0]['estado'], $r['diario']['premios'][1]['estado']]);
check('Otra vez hoy -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => Diario::reclamar($A)));
Diario::$reloj = $en('2026-10-23 23:59:59');
check('A las 23:59 sigue siendo hoy -> 409', [409, 'ya_reclamado'], falla(fn() => Diario::reclamar($A)));
Diario::$reloj = $en('2026-10-24 00:00:05');
$r = Diario::reclamar($A);
check('Medianoche de Ecuador: día 2 (grande) -> $600 + 2 cables + materiales + 5 créditos', [2, [['dinero', '-', 600], ['consumible', 'cable', 2], ['materiales', 'cables', 4]], 15],
    [$r['reclamado']['dia'], array_map(fn($x) => [$x['tipo'], $x['item'], $x['cantidad']], $r['entregas']), $r['creditos']]);
check('Créditos al monedero con motivo diario y ref diario:<día>', [['cambio' => 5, 'motivo' => 'diario', 'ref' => 'diario:2026-10-24']], $movs($A));
check('Racha 2', 2, $r['diario']['racha']);
// Falta el 25 y el 26: el avance se pausa, no se reinicia
Diario::$reloj = $en('2026-10-27 08:00:00');
$e = Diario::estado($A);
check('Faltó 2 días: sigue en el Día 3 de 7 (pausa amable)', [3, false, 'reclamado', 'reclamado', 'hoy'], [$e['dia'], $e['reclamado_hoy'], $e['premios'][0]['estado'], $e['premios'][1]['estado'], $e['premios'][2]['estado']]);
$r = Diario::reclamar($A);
check('Día 3 -> $350 + 1 batería; racha vuelve a 1', [3, 350, [['dinero', '-', 350], ['consumible', 'battery', 1]], 1],
    [$r['reclamado']['dia'], $r['reclamado']['dinero'], array_map(fn($x) => [$x['tipo'], $x['item'], $x['cantidad']], $r['entregas']), $r['diario']['racha']]);
foreach (['2026-10-28', '2026-10-29', '2026-10-30'] as $k => $d) { Diario::$reloj = $en($d . ' 12:00:00'); $r = Diario::reclamar($A); }
check('Días 4, 5 y 6 seguidos -> estamos en el 6', [6, 4], [$r['reclamado']['dia'], $r['diario']['racha']]);
Diario::$reloj = $en('2026-10-31 18:00:00');
$antes = count($entregas($A));
$r = Diario::reclamar($A);
check('Día 7 (grande): $1.000 + 2 cables + 2 baterías + 4 materiales (7 entregas) + 20 créditos', [7, 1000, 7, 35],
    [$r['reclamado']['dia'], $r['reclamado']['dinero'], count($entregas($A)) - $antes, $r['creditos']]);
check('Con el día 7 reclamado se ve el ciclo completo (7 de 7) hasta mañana', [7, true, 1, ['reclamado', 'reclamado', 'reclamado', 'reclamado', 'reclamado', 'reclamado', 'reclamado']],
    [$r['diario']['dia'], $r['diario']['reclamado_hoy'], $r['diario']['ciclo'], array_column($r['diario']['premios'], 'estado')]);
Diario::$reloj = $en('2026-11-01 07:00:00');
$e = Diario::estado($A);
check('Al día siguiente: ciclo 2, Día 1 otra vez', [2, 1, 'hoy', 7], [$e['ciclo'], $e['dia'], $e['premios'][0]['estado'], $e['total']]);
$r = Diario::reclamar($A);
check('Ciclo 2 día 1 -> $300', [1, 300], [$r['reclamado']['dia'], $r['reclamado']['dinero']]);
check('Libro de créditos = saldo (10 + 5 + 20)', [35, 35], [Monedero::saldo($A), 10 + (int) array_sum(array_column($movs($A), 'cambio'))]);
check('Un reclamo por día en la tabla (8 reclamos)', 8, (int) Db::valor('SELECT COUNT(*) FROM diario_reclamos WHERE jugador_id = ?', [$A]));

// =====================================================================
titulo('Anti trampa: solo cuenta la fecha del servidor');
$B = $nuevo('Beto Reloj');
Diario::$reloj = $en('2026-11-05 10:00:00');
Diario::reclamar($B);
Diario::$reloj = $en('2026-11-04 10:00:00');   // si el reloj volviera atrás, no se cobra otra vez
check('Reloj hacia atrás: no se puede reclamar', [409, 'ya_reclamado'], falla(fn() => Diario::reclamar($B)));
check('…y se ve como ya reclamado', true, Diario::estado($B)['reclamado_hoy']);
// Dos reclamos del mismo día (el UNIQUE lo frena aunque el avance no se hubiera guardado)
Diario::$reloj = $en('2026-11-06 10:00:00');
Db::q("UPDATE diario_jugador SET ultimo_dia = '2026-11-05' WHERE jugador_id = ?", [$B]);
Db::q("INSERT INTO diario_reclamos (jugador_id, dia, ciclo, paso, creado) VALUES (?, '2026-11-06', 1, 2, ?)", [$B, time()]);
check('Reclamo duplicado del mismo día -> 409 y nada entregado', [[409, 'ya_reclamado'], 1], [falla(fn() => Diario::reclamar($B)), count($entregas($B))]);

// =====================================================================
titulo('VIP 3 o más: dinero doble');
$V = $nuevo('Vale Vip');
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES (?, ?, 'creditos_m', 20, 17.39, 2.61, 'pagado', ?, ?)", [bin2hex(random_bytes(8)), $V, time(), time()]);
check('Con $20 pagados es VIP 3', 3, Diario::vipNivel($V));
Diario::$reloj = $en('2026-11-10 10:00:00');
$e = Diario::estado($V);
check('El calendario ya muestra el dinero doble', [true, 600, 300, 2000], [$e['vip_doble'], $e['premios'][0]['dinero'], $e['premios'][0]['dinero_base'], $e['premios'][6]['dinero']]);
$r = Diario::reclamar($V);
check('Reclamar día 1 con VIP 3 -> $600', [600, [['dinero', '-', 600]]], [$r['reclamado']['dinero'], array_map(fn($x) => [$x['tipo'], $x['item'], $x['cantidad']], $r['entregas'])]);
check('Queda anotado el VIP del reclamo', [600, 3], (fn($f) => [(int) $f['dinero'], (int) $f['vip']])(Db::fila('SELECT * FROM diario_reclamos WHERE jugador_id = ?', [$V])));

// =====================================================================
titulo('Cuentas suspendidas');
$S = $nuevo('Susi Suspendida');
Db::q("UPDATE jugadores SET estado = 'suspendido' WHERE id = ?", [$S]);
check('Cuenta suspendida no reclama', [403, 'cuenta_suspendida'], falla(fn() => Diario::reclamar($S)));
check('…y no se anota nada', [0, 0], [(int) Db::valor('SELECT COUNT(*) FROM diario_reclamos WHERE jugador_id = ?', [$S]), count($entregas($S))]);

// =====================================================================
titulo('Rutas por HTTP (php -S con una copia de api.php)');
Diario::$reloj = null;
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$doc = (string) file_get_contents(dirname(__DIR__) . '/INTEGRAR_DIARIO.md');
preg_match('/<!-- api\.php -->\s*```php\s*(.+?)```/s', $doc, $lineaApi);
$lineaApi = trim($lineaApi[1] ?? '');
check('INTEGRAR_DIARIO.md trae la línea de api.php', true, str_contains($lineaApi, 'DiarioApi::esRuta'));
$ancla = "    // Copa de Servidores (server/INTEGRAR_COPAS.md): /api/copa*\n";
$yaIntegrado = str_contains($api, 'DiarioApi::esRuta');
check('api.php ya tiene la línea, o tiene el lugar donde va', true, $yaIntegrado || str_contains($api, $ancla));
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ';', $api);
if (!$yaIntegrado) $api = str_replace($ancla, '    ' . $lineaApi . "\n" . $ancla, $api);
mkdir($TMP . '/public');
file_put_contents($TMP . '/public/api.php', $api);
file_put_contents($TMP . '/router.php', '<?php $r = (string) parse_url((string) $_SERVER["REQUEST_URI"], PHP_URL_PATH); if (!str_starts_with($r, "/api/")) { http_response_code(404); echo "404\n"; return true; } require __DIR__ . "/public/api.php";');
$puerto = (function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $n = (int) substr((string) strrchr((string) stream_socket_get_name($s, false), ':'), 1); fclose($s); return $n; })();
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-S', '127.0.0.1:' . $puerto, $TMP . '/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $tub, null, ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PATH' => getenv('PATH')]);
for ($k = 0; $k < 50; $k++) { if (@fsockopen('127.0.0.1', $puerto)) break; usleep(100000); }
$sesion = function (int $j): string { $tok = bin2hex(random_bytes(32)); Db::q('INSERT INTO sesiones (token_hash, jugador_id, creado, expira) VALUES (?, ?, ?, ?)', [hash('sha256', $tok), $j, time(), time() + 3600]); return $tok; };
$http = function (string $metodo, string $ruta, ?array $cuerpo = null, ?string $tok = null, bool $cabecera = true) use ($puerto): array {
    $ch = curl_init('http://127.0.0.1:' . $puerto . $ruta);
    $h = ['Content-Type: application/json'];
    if ($cabecera) $h[] = 'X-Envivo: 1';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 20]
        + ($cuerpo !== null ? [CURLOPT_POSTFIELDS => json_encode($cuerpo)] : []) + ($tok ? [CURLOPT_COOKIE => 'envivo_s=' . $tok] : []));
    $b = curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode((string) $b, true)];
};
$H = $nuevo('Hugo Http', 3);
$tok = $sesion($H);
check('GET /api/estado sigue igual con la línea nueva', [200, true], (function () use ($http) { [$c, $j] = $http('GET', '/api/estado'); return [$c, isset($j['tienda'])]; })());
check('GET /api/diario sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], (function () use ($http) { [$c, $j] = $http('GET', '/api/diario'); return [$c, $j['codigo'] ?? null]; })());
[$c, $j] = $http('GET', '/api/diario', null, $tok);
check('GET /api/diario -> 200, Día 1 de 7 con los 7 premios', [200, 1, 7, 7, false, Diario::dia()], [$c, $j['dia'] ?? null, $j['dias'] ?? null, count($j['premios'] ?? []), $j['reclamado_hoy'] ?? null, $j['hoy'] ?? null]);
check('POST /api/diario/reclamar sin X-Envivo -> 403', 403, $http('POST', '/api/diario/reclamar', [], $tok, false)[0]);
[$c, $j] = $http('POST', '/api/diario/reclamar', [], $tok);
check('POST /api/diario/reclamar -> 200 con la entrega de dinero', [200, true, 'dinero', 300, 3, true], [$c, $j['ok'] ?? null, $j['entregas'][0]['tipo'] ?? null, $j['entregas'][0]['cantidad'] ?? null, $j['creditos'] ?? null, $j['diario']['reclamado_hoy'] ?? null]);
[$c, $j] = $http('POST', '/api/diario/reclamar', [], $tok);
check('Otra vez -> 409 ya_reclamado con texto', [409, 'ya_reclamado', false, true], [$c, $j['codigo'] ?? null, $j['ok'] ?? null, is_string($j['error'] ?? null)]);
check('La entrega sale en /api/estado (para que el juego la aplique)', true, (function () use ($http, $tok) { [$c, $j] = $http('GET', '/api/estado', null, $tok); return in_array('diario:' . Diario::dia(), array_column($j['entregas'] ?? [], 'origen'), true); })());
check('GET /api/diario/reclamar -> 405', 405, $http('GET', '/api/diario/reclamar', null, $tok)[0]);
check('POST /api/diario -> 405', 405, $http('POST', '/api/diario', [], $tok)[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

// La tabla de premios de js/diario.js es la misma (la revisa también tests/test_diario.js)
titulo('Misma tabla en js/diario.js');
$js = (string) file_get_contents(dirname(__DIR__, 2) . '/js/diario.js');
preg_match('/const PREMIOS = (\[.+?\]);/s', $js, $m);
$tablaJs = json_decode(preg_replace(['/(\w+):/', "/'/"], ['"$1":', '"'], $m[1] ?? 'null'), true);
$tablaPhp = array_values(array_map(fn($p) => ['dinero' => $p['dinero'], 'consumibles' => $p['consumibles'] ?: new stdClass(), 'materiales' => $p['materiales'] ?: new stdClass(), 'creditos' => $p['creditos'], 'grande' => !empty($p['grande'])], Diario::PREMIOS));
check('PREMIOS de js/diario.js = Diario::PREMIOS', json_encode($tablaPhp), json_encode(array_map(fn($p) => ['dinero' => $p['dinero'], 'consumibles' => $p['consumibles'] ?: new stdClass(), 'materiales' => $p['materiales'] ?: new stdClass(), 'creditos' => $p['creditos'], 'grande' => !empty($p['grande'])], $tablaJs ?? [])));

echo "\n----------------------------------------\nPremio diario: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
