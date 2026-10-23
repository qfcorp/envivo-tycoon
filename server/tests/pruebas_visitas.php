<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Visitas a otras productoras (server/src/Visitas.php + VisitasApi.php):
// base SQLite TEMPORAL, reloj congelado. Vitrina con lista blanca (nada privado: correo, nombre de la cuenta, compras,
// créditos, dinero), cache, privacidad, aplausos (1 por día, premio a los dos con tope diario), sugeridas y, al final,
// las rutas por HTTP con una COPIA de server/public/api.php + la línea de server/INTEGRAR_VISITAS.md (php -S).
// Uso:  php server/tests/pruebas_visitas.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_visitas_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Fallo, Migraciones, Social, Visitas as V};

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
$T0 = (new DateTimeImmutable('2026-10-23 10:00:00', new DateTimeZone('America/Guayaquil')))->getTimestamp();
V::fijarReloj($T0);
$n = 0;
$nuevo = function (string $nombre, ?string $alias, int $fama = 0, int $servidor = 1) use (&$n, $T0): int {
    $n++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica, creditos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['secreto' . $n . '@correo-privado.example', $nombre, 'hash-secreto', $T0 - 86400 * 20, $servidor, $alias, $alias ? strtolower($alias) . $n : null, $fama, 777]);
    return Db::ultimoId();
};
$subir = function (int $j, array $s, int $t) { Db::q('INSERT INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado', [$j, json_encode($s), $t]); };
$entregas = fn(int $j) => Db::todas("SELECT tipo, item, cantidad, origen FROM entregas WHERE jugador_id = ? ORDER BY id", [$j]);

// Partida "real" con cosas privadas que NUNCA deben salir
$partida = function (array $extra = []): array {
    $staff = [['id' => 1, 'name' => 'Tú', 'role' => 'camarografo', 'tier' => 'semi_senior', 'skill' => 2, 'owner' => true, 'events' => 40]];
    $roles = ['director', 'sonidista', 'cam', 'tecnico_transmision', 'runner'];
    foreach ($roles as $i => $r) $staff[] = ['id' => 10 + $i, 'name' => 'Persona ' . $i, 'role' => $r, 'tier' => 'senior', 'skill' => 1 + $i, 'wage' => 99999, 'events' => $i * 3];
    $equip = [['type' => 'cam_basic'], ['type' => 'cam_pro'], ['type' => 'cam_pro'], ['type' => 'unidad_movil'], ['type' => 'veh_sedan_usado'], ['type' => 'veh_sedan_usado'],
              ['type' => 'veh_furgon_carga'], ['type' => 'srv_grua_telescopica'], ['type' => '<script>alert(1)</script>'], ['type' => 'mics']];
    return array_replace([
        'v' => 3, 'day' => 42, 'money' => 987654, 'rep' => 37.6, 'chapter' => 4, 'storyDone' => false, 'productora' => '  Tukán   Producciones  ',
        'staff' => $staff, 'equip' => $equip, 'stock' => ['cable' => 9],
        'stats' => ['events' => 55, 'fiveStars' => 12, 'earned' => 4444444, 'best' => ['boda' => 5, 'misa' => 4, 'concierto' => 5, 'inventado' => 5, 'barrial' => 3], 'good' => ['boda' => 2, 'concierto' => 7, 'misa' => 1], 'duels' => ['won' => 3, 'lost' => 1], 'intl' => 2],
        'decor' => ['items' => [['k' => 'sofa', 'dia' => 30], ['k' => 'flores', 'dia' => 40, 'hasta' => 45], ['k' => 'MAL<', 'dia' => 1]], 'gastado' => 500],
        'temporada' => ['cosmeticos' => ['arbol', 'fuegos', '"><x'], 'trofeos' => [['id' => 'navidad-2025', 'key' => 'navidad', 'anio' => 2025, 'dia' => 30]]],
        'premium' => ['aplicadas' => [1, 2, 3], 'compras' => ['inicio']], 'contracts' => [['client' => 'Cliente secreto']], 'log' => [['k' => 'privado']],
        'email' => 'filtrado@correo-privado.example', 'creditos' => 5000,
    ], $extra);
};

// =====================================================================
titulo('Tablas y migración');
check('Tablas visitas_* creadas solas al abrir la base', ['visitas_ajustes', 'visitas_aplausos', 'visitas_vitrinas'],
    array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'visitas_%' ORDER BY name"), 'name'));
check('visitas.sql se puede aplicar otra vez sin error', [], Migraciones::aplicar('visitas.sql'));

// =====================================================================
titulo('Lo público de la partida (lista blanca)');
$p = V::desdePartida($partida());
check('Claves exactas (nada más)', ['capitulo', 'cosmeticos', 'decor', 'destacados', 'dia', 'equipo_hq', 'equipos', 'etapa', 'fama', 'flota', 'historia_completa', 'logros', 'mejores', 'personal', 'productora', 'stats', 'trofeos_temporada'],
    (function () use ($p) { $k = array_keys($p); sort($k); return $k; })());
check('Nombre de la productora limpio', 'Tukán Producciones', $p['productora']);
check('Día, fama redondeada, capítulo', [42, 38, 4], [$p['dia'], $p['fama'], $p['capitulo']]);
check('Personal (6) y equipos propios (sin el alquilado srv_*: 9)', [6, 9], [$p['personal'], $p['equipos']]);
check('Etapa: 6 + 9 = 15 → oficina (1)', 1, $p['etapa']);
check('Sede dibujada: cámaras + unidad móvil, sin tipos desconocidos', ['cam_basic', 'cam_pro', 'cam_pro', 'unidad_movil'], $p['equipo_hq']);
check('Flota agrupada por tipo', [['tipo' => 'veh_sedan_usado', 'n' => 2], ['tipo' => 'veh_furgon_carga', 'n' => 1]], $p['flota']);
check('Destacados: 3 de más habilidad, sin el dueño, rol viejo traducido', [['Persona 4', 'runner', 5], ['Persona 3', 'tecnico_transmision', 4], ['Persona 2', 'camarografo', 3]],
    array_map(fn($d) => [$d['nombre'], $d['rol'], $d['habilidad']], $p['destacados']));
check('Destacados sin sueldo', false, str_contains(json_encode($p['destacados']), 'wage') || str_contains(json_encode($p['destacados']), '99999'));
check('Mejores eventos: por estrellas y veces, sin tipos inventados', [['concierto', 5, 7], ['boda', 5, 2], ['misa', 4, 1]], array_map(fn($m) => [$m['tipo'], $m['estrellas'], $m['veces']], $p['mejores']));
check('Decoración: solo claves válidas, con días', [['k' => 'sofa', 'dia' => 30], ['k' => 'flores', 'dia' => 40, 'hasta' => 45]], $p['decor']['items']);
check('Cosméticos válidos', ['arbol', 'fuegos'], $p['cosmeticos']);
check('Trofeo de temporada', [['key' => 'navidad', 'anio' => 2025]], $p['trofeos_temporada']);
check('Stats públicas (sin lo ganado)', ['eventos' => 55, 'cinco_estrellas' => 12, 'internacionales' => 2, 'duelos_ganados' => 3], $p['stats']);
$js = json_encode($p, JSON_UNESCAPED_UNICODE);
check('Nada de dinero, créditos, compras, contratos, registro ni correos', [false, false, false, false, false, false, false],
    [str_contains($js, '987654'), str_contains($js, '4444444'), str_contains($js, 'creditos'), str_contains($js, 'correo-privado'), str_contains($js, 'Cliente secreto'), str_contains($js, 'privado'), str_contains($js, '<script')]);
check('Nombre con contacto → vacío', '', V::desdePartida(['productora' => 'Llama al 0991234567'])['productora']);
check('Nombre con enlace → vacío', '', V::desdePartida(['productora' => 'www.mipagina.com'])['productora']);
check('Partida vacía o rota: valores por defecto', [1, 0, 0, [], ''], (function () { $x = V::desdePartida(['staff' => 'x', 'equip' => [1, 2], 'day' => 'mucho', 'productora' => 7]); return [$x['dia'], $x['etapa'], $x['personal'], $x['equipo_hq'], $x['productora']]; })());
$grande = $partida(['equip' => array_fill(0, 40, ['type' => 'mics'])]);
check('40 equipos + 6 personas → centro (3)', 3, V::desdePartida($grande)['etapa']);
check('logros si la partida los tiene', 2, V::desdePartida(['logros' => ['a' => true, 'b' => true, 'c' => false]])['logros']);

// =====================================================================
titulo('Vitrina con datos del servidor (sin datos de la cuenta)');
$A = $nuevo('Juana Pérez Secreta', 'TukanTV', 40);
$B = $nuevo('Pedro Gómez', 'MegaCanal', 25);
$C = $nuevo('Carla Ruiz', null, 10);
$subir($A, $partida(), $T0 - 100);
Social::crear($A, ['nombre' => 'Los del Cable', 'siglas' => 'LDC', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
Db::q("INSERT INTO sede_oficial (jugador_id, nivel, creado, actualizado) VALUES (?, 7, ?, ?)", [$A, $T0, $T0]);
Db::q("INSERT INTO copas (universo_id, semana, torneo_key, nombre, fase, inicio, fin, creado) VALUES (1, '2026-W42', 'copa_oro', 'Copa de Oro', 'cerrada', ?, ?, ?)", [$T0 - 9 * 86400, $T0 - 2 * 86400, $T0 - 9 * 86400]);
$copa = Db::ultimoId();
Db::q("INSERT INTO copa_premios (copa_id, jugador_id, clave, entregado) VALUES (?, ?, 'campeon', ?), (?, ?, 'participacion', ?)", [$copa, $A, $T0, $copa, $A, $T0]);
Db::q("INSERT INTO duelo_premios (temporada, jugador_id, servidor_id, puesto, rating, detalle_json, creado) VALUES ('2026-09', ?, 1, 2, 1500, '{\"creditos\":99}', ?)", [$A, $T0]);
Db::q("INSERT INTO estrellas_contratos (jugador_id, clave, partidos, origen, ref, creditos, fichas, creado, vence) VALUES (?, 'lupe', 3, 'credito', 'r1', 90, 0, ?, ?), (?, 'varela', 1, 'credito', 'r2', 60, 0, ?, ?)",
    [$A, $T0, $T0 + 86400, $A, $T0 - 40 * 86400, $T0 - 86400]);
$v = V::ver($B, $A);
$vit = $v['vitrina'];
check('Ver otra productora: ok, no es propia, puede aplaudir', [true, false, true], [$v['ok'], $v['propio'], $v['puede_aplaudir']]);
check('Alias público, productora, fama pública', ['TukanTV', 'Tukán Producciones', 40], [$vit['alias'], $vit['productora'], $vit['fama_publica']]);
check('Asociación (nombre, siglas, color)', ['nombre' => 'Los del Cable', 'siglas' => 'LDC', 'color' => '#ff3b3b'], $vit['asociacion']);
check('Nivel de la Sede oficial', 7, $vit['sede_nivel']);
check('Trofeos: copa campeón (no participación), duelo 2.º, temporada', [['copa', 'campeon'], ['duelo', 2], ['temporada', 'navidad']],
    array_map(fn($t) => [$t['tipo'], $t['clave'] ?? $t['puesto'] ?? $t['key'] ?? null], $vit['trofeos']));
check('Estrella con contrato vigente (no la vencida)', [['lupe', 'Lupe Zoom', 'camarografo']], array_map(fn($e) => [$e['clave'], $e['nombre'], $e['rol']], $vit['estrellas']));
$js = json_encode($v, JSON_UNESCAPED_UNICODE);
$prohibido = ['correo-privado', 'Secreta', 'Juana', 'hash-secreto', '987654', '4444444', '777', 'creditos', 'email', 'compras', 'money', 'clave_hash', 'premium'];
check('La respuesta no trae nada privado (' . implode(', ', $prohibido) . ')', [], array_values(array_filter($prohibido, fn($w) => str_contains($js, $w))));
check('Sin alias: nombre corto público (como en el chat)', 'Carla R.', V::ver($A, $C)['vitrina']['alias']);
check('Sin partida en la nube: vitrina mínima (garaje)', [true, 0, ''], (function () use ($A, $C) { $x = V::ver($A, $C)['vitrina']; return [$x['sin_partida'], $x['etapa'], $x['productora']]; })());
check('Productora que no existe → 404 productora_no_existe', [404, 'productora_no_existe'], falla(fn() => V::ver($A, 99999)));

titulo('Cache de la vitrina');
check('Segunda vez sale de la cache', true, V::ver($B, $A)['vitrina']['cache']);
$subir($A, $partida(['productora' => 'Tukán Media']), $T0 - 50);
$x = V::ver($B, $A)['vitrina'];
check('Partida nueva en la nube → se rehace', [false, 'Tukán Media'], [$x['cache'], $x['productora']]);
V::fijarReloj($T0 + V::CACHE_SEG + 1);
check('Pasado el tiempo de cache → se rehace', false, V::ver($B, $A)['vitrina']['cache']);
V::alSubirPartida($A);
check('alSubirPartida borra la cache', false, V::ver($B, $A)['vitrina']['cache']);
V::fijarReloj($T0);

// =====================================================================
titulo('Privacidad');
check('Por defecto se permiten visitas', true, V::ajustes($B)['permitir']);
check('Apagar visitas', false, V::guardarAjustes($B, false)['permitir']);
check('Otro jugador → 403 visitas_cerradas', [403, 'visitas_cerradas'], falla(fn() => V::ver($A, $B)));
check('Aplaudir a quien no recibe visitas → 403 visitas_cerradas', [403, 'visitas_cerradas'], falla(fn() => V::aplaudir($A, $B)));
check('Uno mismo sí se ve (propio, sin aplauso)', [true, false], (function () use ($B) { $x = V::ver($B, $B); return [$x['propio'], $x['puede_aplaudir']]; })());
check('Sugeridas de A no incluye a B (cerrada) ni a A', [], array_values(array_filter(array_column(V::sugeridas($A)['productoras'], 'jugador_id'), fn($id) => $id === $B || $id === $A)));
check('"permitir" inválido → 400 falta_permitir', [400, 'falta_permitir'], falla(fn() => V::guardarAjustes($B, 'quizas')));
check('Encender otra vez', true, V::guardarAjustes($B, 1)['permitir']);

// =====================================================================
titulo('Aplausos');
check('Aplaudirse a sí mismo → 400 aplauso_propio', [400, 'aplauso_propio'], falla(fn() => V::aplaudir($A, $A)));
$r = V::aplaudir($B, $A);
check('Aplauso: total 1, hoy 1, ya_hoy, premio $50 a cada lado', [1, 1, true, 50, 50], [$r['aplausos']['total'], $r['aplausos']['hoy'], $r['aplausos']['ya_hoy'], $r['premio']['dinero'], $r['premio']['para_visitado']]);
check('Entregas de dinero del juego a los dos', [[['tipo' => 'dinero', 'item' => '-', 'cantidad' => 50, 'origen' => 'aplauso_dado']], [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 50, 'origen' => 'aplauso_recibido']]], [$entregas($B), $entregas($A)]);
check('La respuesta trae la entrega del visitante', 1, count($r['entregas']));
check('Otra vez el mismo día → 409 aplauso_ya', [409, 'aplauso_ya'], falla(fn() => V::aplaudir($B, $A)));
check('Al ver de nuevo: ya no puede aplaudir', false, V::ver($B, $A)['puede_aplaudir']);
V::fijarReloj($T0 + 86400);
check('Al día siguiente sí (total 2, hoy 1)', [2, 1], (function () use ($A, $B) { $x = V::aplaudir($B, $A); return [$x['aplausos']['total'], $x['aplausos']['hoy']]; })());
V::fijarReloj($T0 + 2 * 86400);
$fans = [];
for ($i = 0; $i < V::PREMIOS_DIA + 2; $i++) $fans[] = $nuevo('Fan ' . $i, 'Fan' . $i);
$premiosC = 0;
foreach ($fans as $f) $premiosC += V::aplaudir($f, $C)['premio']['para_visitado'];
check('Tope al recibir: 12 aplausos, premio solo 10 veces', [V::PREMIOS_DIA + 2, V::PREMIOS_DIA * 50], [V::conteo($C, null)['hoy'], $premiosC]);
check('Entregas de C = 10', V::PREMIOS_DIA, count($entregas($C)));
$dados = 0;
foreach (array_slice($fans, 1) as $f) $dados += V::aplaudir($fans[0], $f)['premio']['dinero'];
check('Tope al dar: el fan 0 dio 1 + 11 aplausos y cobró 10', (V::PREMIOS_DIA - 1) * 50, $dados);
check('…el último dice tope_alcanzado', true, (function () use ($fans, $A) { return V::aplaudir($fans[0], $A)['premio']['tope_alcanzado']; })());
Db::q("UPDATE jugadores SET estado = 'suspendido' WHERE id = ?", [$fans[1]]);
check('Cuenta suspendida no aplaude → 403 cuenta_suspendida', [403, 'cuenta_suspendida'], falla(fn() => V::aplaudir($fans[1], $B)));
check('…pero sí puede mirar', true, V::ver($fans[1], $B)['ok']);
check('Suspendida no sale en sugeridas', false, in_array($fans[1], array_column(V::sugeridas($A)['productoras'], 'jugador_id'), true));
Db::q("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$fans[2]]);
check('Productora bloqueada → 404', [404, 'productora_no_existe'], falla(fn() => V::ver($A, $fans[2])));
Db::q("INSERT OR IGNORE INTO servidores (id, nombre, creado) VALUES (2, 'Servidor 2', ?)", [$T0]);
$otro = $nuevo('De otro servidor', 'Lejana', 0, 2);
$subir($otro, $partida(), $T0);
check('Sugeridas: solo de tu servidor', false, in_array($otro, array_column(V::sugeridas($A)['productoras'], 'jugador_id'), true));
check('…pero se puede visitar por id (Copa, otros servidores)', true, V::ver($A, $otro)['ok']);
$sg = V::sugeridas($B);
check('Sugeridas trae alias/siglas/aplausos y mis aplausos', [true, 'LDC', true], [in_array($A, array_column($sg['productoras'], 'jugador_id'), true), (array_values(array_filter($sg['productoras'], fn($x) => $x['jugador_id'] === $A))[0]['siglas'] ?? null), isset($sg['mis_aplausos']['total'])]);
check('Sugeridas no trae nada privado', [], array_values(array_filter($prohibido, fn($w) => str_contains(json_encode($sg, JSON_UNESCAPED_UNICODE), $w))));
V::fijarReloj(null);

// =====================================================================
titulo('Rutas por HTTP (copia de api.php + la línea de INTEGRAR_VISITAS.md)');
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$linea = "    if (\\EnVivo\\VisitasApi::esRuta(\$ruta)) \\EnVivo\\VisitasApi::responder(\$ruta, \$metodo, requiere_sesion());\n";
$anc = "    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina\n";
$doc = (string) @file_get_contents(dirname(__DIR__) . '/INTEGRAR_VISITAS.md');
check('INTEGRAR_VISITAS.md trae la línea exacta de api.php', true, str_contains($doc, trim($linea)));
check('api.php tiene el lugar donde va la línea', true, str_contains($api, $anc));
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ';', $api);
if (!str_contains($api, 'VisitasApi')) $api = str_replace($anc, "    // Visitas a otras productoras (server/INTEGRAR_VISITAS.md): /api/visitas/*\n" . $linea . $anc, $api);
mkdir($TMP . '/pub');
file_put_contents($TMP . '/pub/api.php', $api);
file_put_contents($TMP . '/pub/router.php', "<?php\n\$r = (string) parse_url((string) \$_SERVER['REQUEST_URI'], PHP_URL_PATH);\nif (str_starts_with(\$r, '/api/')) { require __DIR__ . '/api.php'; return true; }\nhttp_response_code(404); echo \"404\\n\"; return true;\n");
$puerto = (function () { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; })();
$log = $TMP . '/http.log';
$srv = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-S', '127.0.0.1:' . $puerto, $TMP . '/pub/router.php'],
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
    return [$c, json_decode((string) $b, true), (string) $b];
};
$H1 = $nuevo('Visitante Http', 'VisitaHTTP');
$H2 = $nuevo('Visitada Http Secreta', 'VisitadaHTTP');
$subir($H2, $partida(), time());
$t1 = $sesion($H1); $t2 = $sesion($H2);
check('GET /api/visitas/vitrina sin sesión → 401 sesion_requerida', [401, 'sesion_requerida'], (function () use ($http, $H2) { [$c, $j] = $http('GET', '/api/visitas/vitrina?jugador_id=' . $H2); return [$c, $j['codigo'] ?? null]; })());
[$c, $j, $raw] = $http('GET', '/api/visitas/vitrina?jugador_id=' . $H2, null, $t1);
check('GET /api/visitas/vitrina → 200 con alias, productora y etapa', [200, 'VisitadaHTTP', 'Tukán Producciones', 1], [$c, $j['vitrina']['alias'] ?? null, $j['vitrina']['productora'] ?? null, $j['vitrina']['etapa'] ?? null]);
check('…sin nada privado por HTTP', [], array_values(array_filter(array_merge($prohibido, ['Secreta']), fn($w) => str_contains($raw, $w))));
check('GET /api/visitas/vitrina sin jugador_id → 400 falta_jugador_id', [400, 'falta_jugador_id'], (function () use ($http, $t1) { [$c, $j] = $http('GET', '/api/visitas/vitrina', null, $t1); return [$c, $j['codigo'] ?? null]; })());
check('POST /api/visitas/aplaudir sin X-Envivo → 403', 403, $http('POST', '/api/visitas/aplaudir', ['jugador_id' => $H2], $t1, false)[0]);
[$c, $j] = $http('POST', '/api/visitas/aplaudir', ['jugador_id' => $H2], $t1);
check('POST /api/visitas/aplaudir → 200 total 1 y $50', [200, 1, 50], [$c, $j['aplausos']['total'] ?? null, $j['premio']['dinero'] ?? null]);
check('POST /api/visitas/aplaudir otra vez → 409 aplauso_ya', [409, 'aplauso_ya'], (function () use ($http, $t1, $H2) { [$c, $j] = $http('POST', '/api/visitas/aplaudir', ['jugador_id' => (string) $H2], $t1); return [$c, $j['codigo'] ?? null]; })());
check('La entrega de dinero llega en /api/estado', true, (function () use ($http, $t1) { [, $j] = $http('GET', '/api/estado', null, $t1); return in_array('dinero', array_column($j['entregas'] ?? [], 'tipo'), true); })());
[$c, $j] = $http('POST', '/api/visitas/ajustes', ['permitir' => false], $t2);
check('POST /api/visitas/ajustes {permitir:false} → 200', [200, false], [$c, $j['permitir'] ?? null]);
check('…y GET /api/visitas/ajustes lo dice (con aplausos)', [200, false, 1], (function () use ($http, $t2) { [$c, $j] = $http('GET', '/api/visitas/ajustes', null, $t2); return [$c, $j['permitir'] ?? null, $j['aplausos']['total'] ?? null]; })());
check('Visitar a quien apagó → 403 visitas_cerradas', [403, 'visitas_cerradas'], (function () use ($http, $t1, $H2) { [$c, $j] = $http('GET', '/api/visitas/vitrina?jugador_id=' . $H2, null, $t1); return [$c, $j['codigo'] ?? null]; })());
check('GET /api/visitas/sugeridas → 200', [200, true], (function () use ($http, $t1) { [$c, $j] = $http('GET', '/api/visitas/sugeridas', null, $t1); return [$c, is_array($j['productoras'] ?? null)]; })());
check('GET /api/visitas/aplaudir → 405', 405, $http('GET', '/api/visitas/aplaudir', null, $t1)[0]);
check('POST /api/visitas/sugeridas → 405', 405, $http('POST', '/api/visitas/sugeridas', [], $t1)[0]);
check('GET /api/visitas/otra → 404', 404, $http('GET', '/api/visitas/otra', null, $t1)[0]);
check('Las demás rutas de api.php siguen (GET /api/estado → 200)', 200, $http('GET', '/api/estado')[0]);
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nVisitas: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
