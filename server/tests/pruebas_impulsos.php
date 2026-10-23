<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Impulsos (server/src/Impulsos.php + ImpulsosApi.php, server/INTEGRAR_MONETIZACION2.md):
// base SQLite TEMPORAL y reloj congelado. Equipo de obra extra (compra permanente, alquiler con espera semanal, premio, tope 3,
// junto con el nivel 5 y el VIP), Fondo de crecimiento (hitos fijos, reclamar uno o todos, reembolso quita lo reclamado),
// Tarjeta semanal (7 días que se suman, un reclamo por día, reembolso quita los días), entrega por el gancho y por conciliación,
// productos del catálogo (precios por defecto, editables en el Centro de Control, una sola vez) y las rutas por HTTP con una
// COPIA de server/public/api.php con la línea de server/INTEGRAR_MONETIZACION2.md (php -S).
// Uso:  php server/tests/pruebas_impulsos.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$TMP = sys_get_temp_dir() . '/envivo_impulsos_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Catalogo, Compras, Db, Fallo, Ganchos, Impulsos as IM, Migraciones, Monedero, SedeOficial as SO};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
/** [código HTTP, codigo] del Fallo (o [200, null] si no falló). */
function falla(callable $f): array
{
    try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; }
}

Db::pdo();
$T0 = (new DateTimeImmutable('2026-10-23 10:00:00', new DateTimeZone('America/Guayaquil')))->getTimestamp();
SO::fijarReloj($T0);
$mas = function (int $s) { SO::fijarReloj(SO::ahora() + $s); };
$n = 0;
$nuevo = function (string $alias) use (&$n, $T0): int {
    $n++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave, fama_publica) VALUES (?, ?, ?, ?, 1, ?, ?, 0)',
        ['imp' . $n . '@prueba.example', $alias, 'x', $T0 - 30 * 86400, $alias, strtolower(str_replace(' ', '', $alias)) . $n]);
    return Db::ultimoId();
};
$nivel = function (int $j, int $n) { SO::sincronizar($j); Db::q('UPDATE sede_oficial SET nivel = ? WHERE jugador_id = ?', [$n, $j]); };
$pagar = function (int $j, string $prod): int {
    $c = Db::tx(fn() => Compras::insertar($j, Catalogo::producto($prod), 'web_plux'));
    Compras::aprobar((int) $c['id'], 'prueba');
    return (int) $c['id'];
};
$mat = fn(int $j) => SO::vista($j)['sede']['materiales'];
$libroOk = fn(int $j) => (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ?', [$j]) === Monedero::saldo($j);
IM::registrar();

// =====================================================================
titulo('Tablas, migración y catálogo');
$tablas = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'impulsos_%' ORDER BY name"), 'name');
check('Tablas impulsos_* creadas solas al abrir la base', ['impulsos_compras', 'impulsos_fondo', 'impulsos_obra_alquiler', 'impulsos_tarjeta', 'impulsos_tarjeta_reclamos'], $tablas);
check('impulsos.sql se puede aplicar otra vez sin error', [], Migraciones::aplicar('impulsos.sql'));
check('Precios por defecto: $2.99 / $19.99 / $1.99', [2.99, 19.99, 1.99], array_map(fn($id) => Catalogo::producto($id)['precio'], IM::PRODUCTOS));
check('equipo_obra_2 y fondo_crecimiento son de una sola vez; tarjeta_semanal no', [true, true, false], array_map(fn($id) => Catalogo::producto($id)['una_vez'], IM::PRODUCTOS));
check('Los tres salen en la tienda (/api/estado) con su tipo y módulo instalado', ['equipo_obra', 'fondo', 'tarjeta_semanal'],
    array_values(array_map(fn($p) => $p['tipo'], array_filter(Catalogo::tienda()['productos'], fn($p) => in_array($p['id'], IM::PRODUCTOS, true)))));
check('Google Play los vende con los mismos ids', [true, true, true], array_map(fn($id) => Catalogo::productoGoogle($id) !== null, IM::PRODUCTOS));
Catalogo::guardarAjuste('fondo_crecimiento', 17.99, 0, true, 'prueba');
check('El Centro de Control cambia el precio (productos_ajustes)', 17.99, Catalogo::producto('fondo_crecimiento')['precio']);
Catalogo::restaurarAjuste('fondo_crecimiento', 'prueba');
check('…y se restaura', 19.99, Catalogo::producto('fondo_crecimiento')['precio']);
check('Fondo: 10.000 créditos en 9 hitos (~5 veces su valor con los materiales)', [10000, 9], [array_sum(array_column(IM::HITOS, 'creditos')), count(IM::HITOS)]);
check('El texto del catálogo dice lo mismo que la tabla (1.430 materiales comunes, 27 chips)', [1430, 27], (function () {
    $c = 0; $ch = 0; foreach (IM::HITOS as $h) foreach ($h['mat'] as $m => $q) { if ($m === 'chips') $ch += $q; else $c += $q; } return [$c, $ch];
})());

// =====================================================================
titulo('Equipo de obra extra (permanente)');
$A = $nuevo('Constructora');
check('Sin nada: 1 equipo de obra', 1, SO::obreros($A, 1));
$cA = $pagar($A, 'equipo_obra_2');
check('Compra aprobada (gancho): 2 equipos en el nivel 1', [2, true, 1], [SO::obreros($A, 1), IM::estado($A)['equipo']['permanente'], IM::estado($A)['equipo']['extra']]);
check('En el nivel 5 (que ya da 2): 3 equipos', 3, SO::obreros($A, 5));
check('La vista de la sede oficial muestra los 2 equipos', 2, SO::vista($A)['sede']['obreros']);
check('Con el permanente no se alquila -> 409 equipo_ya_tienes', [409, 'equipo_ya_tienes'], falla(fn() => IM::alquilar($A, IM::precioAlquiler(1))));
check('Comprar otra vez (una sola vez) -> no se puede', true, (function () use ($A) { try { Db::tx(fn() => Compras::crear($A, 'equipo_obra_2')); return false; } catch (\Throwable) { return true; } })());
Compras::revertir($cA, 'reembolso', 'prueba', 'prueba');
check('Reembolso: vuelve a 1 equipo', [1, false], [SO::obreros($A, 1), IM::permanente($A)]);
Db::q("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$A]);   // la reversión suspende la cuenta; para seguir probando

// Sin gancho: la conciliación entrega
Ganchos::olvidar();
$B = $nuevo('Sin gancho');
$cB = $pagar($B, 'equipo_obra_2');
check('Sin gancho: todavía no está anotada', false, (bool) Db::valor('SELECT 1 FROM impulsos_compras WHERE compra_id = ?', [$cB]));
check('…GET estado la entrega (conciliación) y queda en 2 equipos', [true, 2], [IM::estado($B)['equipo']['permanente'], SO::obreros($B, 1)]);
Db::q("UPDATE compras SET estado = 'revertido' WHERE id = ?", [$cB]);
check('…y si se reembolsó sin gancho, la conciliación la quita', [false, 1], [IM::estado($B)['equipo']['permanente'], SO::obreros($B, 1)]);
IM::registrar();

// VIP 4 + nivel 5 + permanente: tope 3
if (class_exists(\EnVivo\Vip::class)) {
    $V = $nuevo('Vip cuatro');
    foreach (['creditos_3200', 'creditos_1500', 'creditos_250'] as $p) $pagar($V, $p);   // $31.97 = VIP 4
    $okVip = \EnVivo\Vip::slotsObra($V) === 2;
    if ($okVip) {
        check('VIP 4 da el segundo equipo (como hoy)', 2, SO::obreros($V, 1));
        $pagar($V, 'equipo_obra_2');
        check('VIP 4 + compra = 3; con nivel 5 también 3 (tope)', [3, 3], [SO::obreros($V, 1), SO::obreros($V, 9)]);
    } else echo "  AVISO: Vip::slotsObra no lee vip_jugadores directo en esta versión: se salta el caso VIP\n";
}

// =====================================================================
titulo('Alquiler gratis (dinero del juego) y premios');
$C = $nuevo('Alquila');
$nivel($C, 6);
$precio = IM::precioAlquiler(6);
check('Precio por nivel: $1.500 + $500 × nivel', 4500, $precio);
$e = IM::estado($C)['equipo']['alquiler'];
check('Estado: se puede alquilar, con su precio y 48 h', [true, 4500, 48], [$e['puede'], $e['precio'], $e['horas']]);
check('Sin confirmar_precio -> 400 confirmar_precio', [400, 'confirmar_precio'], falla(fn() => IM::alquilar($C, null)));
check('Precio distinto -> 409 precio_cambio', [409, 'precio_cambio'], falla(fn() => IM::alquilar($C, 100)));
$r = IM::alquilar($C, $precio);
check('Alquila: 3 equipos (nivel 6) por 48 h, devuelve el precio que el juego descuenta', [true, 3, 4500, false], [$r['alquilado'], $r['obreros'], $r['precio'], $r['equipo']['alquiler']['puede']]);
check('Otra vez mientras está puesto -> 409 equipo_alquilado', [409, 'equipo_alquilado'], falla(fn() => IM::alquilar($C, $precio)));
$mas(48 * 3600 + 1);
check('A las 48 h se va: vuelve a 2 equipos', 2, SO::obreros($C, 6));
check('…y hay que esperar 5 días -> 409 equipo_espera', [409, 'equipo_espera'], falla(fn() => IM::alquilar($C, $precio)));
check('…el estado dice desde cuándo', true, IM::estado($C)['equipo']['alquiler']['espera_hasta'] !== null);
$mas(120 * 3600);
check('Pasada la semana se puede otra vez', [true, 200], [IM::estado($C)['equipo']['alquiler']['puede'], falla(fn() => IM::alquilar($C, $precio))[0]]);
$D = $nuevo('Premiada');
check('Premio de evento (darHoras): +1 equipo 24 h, una vez por ref', [true, false, 2], [IM::darHoras($D, 24, 'copa:1:top'), IM::darHoras($D, 24, 'copa:1:top'), SO::obreros($D, 1)]);
check('…el premio no pone espera de alquiler', true, IM::estado($D)['equipo']['alquiler']['puede'] === false && IM::estado($D)['equipo']['alquiler']['espera_hasta'] === null);
$mas(25 * 3600);
check('…y termina solo', [1, true], [SO::obreros($D, 1), IM::estado($D)['equipo']['alquiler']['puede']]);
$Obra = $nuevo('Obra ocupada');
Db::q("INSERT INTO sede_obras (jugador_id, tipo, ed, nivel, inicio, duracion, fin) VALUES (?, 'mejora', 'control', 2, ?, 7200, ?)", [$Obra, SO::ahora(), SO::ahora() + 7200]);
SO::sincronizar($Obra);
Db::q('UPDATE sede_oficial SET cables = 999, placas = 999, paneles = 999, credenciales = 999, planos = 999, chips = 99 WHERE jugador_id = ?', [$Obra]);
check('Con 1 equipo ocupado: otra mejora -> 409 sin_obrero', [409, 'sin_obrero'], falla(fn() => SO::mejorar($Obra, 'bodega')));
IM::alquilar($Obra, IM::precioAlquiler(1));
check('…con el equipo alquilado sí se puede empezar otra obra', 200, falla(fn() => SO::mejorar($Obra, 'bodega'))[0]);

// =====================================================================
titulo('Fondo de crecimiento');
$F = $nuevo('Fondo');
check('Sin comprar -> 403 fondo_requerido', [403, 'fondo_requerido'], falla(fn() => IM::reclamarFondo($F, 5)));
$e = IM::estado($F)['fondo'];
check('La tabla de hitos se ve aunque no lo compres (contenido fijo)', [false, [5, 8, 10, 12, 15, 18, 20, 25, 30], 0], [$e['comprado'], array_column($e['hitos'], 'nivel'), $e['por_reclamar']]);
$nivel($F, 9);
$cF = $pagar($F, 'fondo_crecimiento');
$e = IM::estado($F)['fondo'];
check('Comprado en el nivel 9: 2 hitos por reclamar (5 y 8)', [true, 2], [$e['comprado'], $e['por_reclamar']]);
check('Hito que no existe -> 400 hito_invalido', [400, 'hito_invalido'], falla(fn() => IM::reclamarFondo($F, 7)));
check('Hito no alcanzado -> 409 fondo_nivel_bajo', [409, 'fondo_nivel_bajo'], falla(fn() => IM::reclamarFondo($F, 10)));
$m0 = $mat($F); $s0 = Monedero::saldo($F);
$r = IM::reclamarFondo($F, 5);
check('Reclama el 5: 500 créditos y sus materiales', [500, $m0['cables'] + 10, $m0['chips'] + 1], [Monedero::saldo($F) - $s0, $mat($F)['cables'], $mat($F)['chips']]);
check('Otra vez el 5 -> 409 fondo_ya', [409, 'fondo_ya'], falla(fn() => IM::reclamarFondo($F, 5)));
$r = IM::reclamarFondo($F, null);
check('Reclamar todos: solo el 8 (700 créditos)', [[8], 700], [$r['recibido']['niveles'], $r['recibido']['creditos']]);
check('Nada más por reclamar -> 409 fondo_nada', [409, 'fondo_nada'], falla(fn() => IM::reclamarFondo($F, null)));
$nivel($F, 12);
check('Al subir al 12: 2 más (10 y 12)', 2, IM::estado($F)['fondo']['por_reclamar']);
IM::reclamarFondo($F, null);
check('Libro de créditos cuadra (motivo fondo_crecimiento)', [true, 2900], [$libroOk($F), (int) Db::valor("SELECT SUM(cambio) FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'fondo_crecimiento'", [$F])]);
check('Libro de la sede: motivo fondo', true, (int) Db::valor("SELECT COUNT(*) FROM sede_libro WHERE jugador_id = ? AND motivo = 'fondo'", [$F]) > 0);
check('Comprar el fondo otra vez -> no se puede (una sola vez)', true, (function () use ($F) { try { Db::tx(fn() => Compras::crear($F, 'fondo_crecimiento')); return false; } catch (\Throwable) { return true; } })());
Monedero::mover($F, -2500, 'gasto_prueba', 'x');   // gastó casi todo
Db::q('UPDATE sede_oficial SET cables = 5 WHERE jugador_id = ?', [$F]);   // y gastó cables
Compras::revertir($cF, 'reembolso', 'prueba', 'prueba');
check('Reembolso: quita los 2.900 créditos (queda deuda) y los materiales que queden', [-2900 + ($s0 + 2900 - 2500) - $s0, 0], [Monedero::saldo($F) - $s0, $mat($F)['cables']]);
check('…ya no se reclama más -> 403 fondo_requerido', [403, 'fondo_requerido'], (function () use ($F, $nivel) { Db::q("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$F]); $nivel($F, 15); return falla(fn() => IM::reclamarFondo($F, 15)); })());
check('…y el libro sigue cuadrando', true, $libroOk($F));

// =====================================================================
titulo('Tarjeta semanal');
$W = $nuevo('Semanal');
check('Sin tarjeta -> 403 tarjeta_semanal_requerida', [403, 'tarjeta_semanal_requerida'], falla(fn() => IM::reclamarTarjeta($W)));
$c1 = $pagar($W, 'tarjeta_semanal');
$t = IM::estado($W)['tarjeta'];
check('Comprada: activa 7 días, 15 créditos/día', [true, 7, 15, false], [$t['activa'], $t['dias_restantes'], $t['creditos_dia'], $t['reclamada_hoy']]);
$m0 = $mat($W); $s0 = Monedero::saldo($W);
IM::reclamarTarjeta($W);
check('Reclama hoy: 15 créditos y 3 de cada material común', [15, $m0['planos'] + 3, $m0['chips']], [Monedero::saldo($W) - $s0, $mat($W)['planos'], $mat($W)['chips']]);
check('Otra vez hoy -> 409 ya_reclamado', [409, 'ya_reclamado'], falla(fn() => IM::reclamarTarjeta($W)));
$mas(86400);
check('Mañana sí', 200, falla(fn() => IM::reclamarTarjeta($W))[0]);
$c2 = $pagar($W, 'tarjeta_semanal');
check('Otra compra suma 7 días (13 en total)', 13, IM::estado($W)['tarjeta']['dias_restantes']);
Compras::revertir($c2, 'reembolso', 'prueba', 'prueba');
check('Reembolso de la segunda: quita sus 7 días', 6, IM::estado($W)['tarjeta']['dias_restantes']);
Db::q("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$W]);
Compras::revertir($c1, 'reembolso', 'prueba', 'prueba');
check('Reembolso de la primera: la tarjeta termina', false, IM::estado($W)['tarjeta']['activa']);
Db::q("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$W]);
$mas(8 * 86400);
check('Vencida: no se reclama', [403, 'tarjeta_semanal_requerida'], falla(fn() => IM::reclamarTarjeta($W)));
check('La tarjeta mensual sigue aparte (tarjeta_hasta sin tocar)', null, Db::valor('SELECT tarjeta_hasta FROM jugadores WHERE id = ?', [$W]));
check('Libro de créditos cuadra', true, $libroOk($W));

// =====================================================================
titulo('Cuenta suspendida y gancho que falla');
$S = $nuevo('Suspendida');
$pagar($S, 'tarjeta_semanal');
Db::q("UPDATE jugadores SET estado = 'suspendido' WHERE id = ?", [$S]);
check('Cuenta suspendida: no reclama', 403, falla(fn() => IM::reclamarTarjeta($S))[0]);
check('alCompraAprobada con producto ajeno no hace nada', false, (function () { IM::alCompraAprobada(['compra_id' => 99999, 'jugador_id' => 1, 'producto' => 'creditos_250']); return (bool) Db::valor('SELECT 1 FROM impulsos_compras WHERE compra_id = 99999'); })());
check('Reembolso que llega antes que la entrega: nunca se entrega', [false, false], (function () use ($nuevo) {
    $q = $nuevo('Antes');
    $c = Db::tx(fn() => Compras::insertar($q, Catalogo::producto('equipo_obra_2'), 'web_plux'));
    Db::q("UPDATE compras SET estado = 'pagado' WHERE id = ?", [$c['id']]);
    IM::revertir((int) $c['id']);
    IM::entregar($q, (int) $c['id'], 'equipo_obra_2');
    return [IM::permanente($q), IM::estado($q)['equipo']['permanente']];
})());

// =====================================================================
titulo('Rutas por HTTP (copia de api.php + la línea de INTEGRAR_MONETIZACION2.md)');
SO::fijarReloj(null);
$api = (string) file_get_contents(dirname(__DIR__) . '/public/api.php');
$linea = "    if (class_exists(\\EnVivo\\ImpulsosApi::class) && \\EnVivo\\ImpulsosApi::esRuta(\$ruta)) \\EnVivo\\ImpulsosApi::responder(\$ruta, \$metodo, requiere_sesion());\n";
$doc = (string) @file_get_contents(dirname(__DIR__) . '/INTEGRAR_MONETIZACION2.md');
check('INTEGRAR_MONETIZACION2.md trae la línea exacta de api.php', true, str_contains($doc, trim($linea)));
if (!str_contains($api, trim($linea))) {
    $anc = "    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina\n";
    check('api.php tiene el lugar donde va la línea', true, str_contains($api, $anc));
    $api = str_replace($anc, "    // Impulsos (server/INTEGRAR_MONETIZACION2.md): /api/impulsos*\n" . $linea . $anc, $api);
}
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . ';', $api);
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
    return [$c, json_decode((string) $b, true)];
};
$H = $nuevo('Por HTTP');
$tok = $sesion($H);
[$c, $j] = $http('GET', '/api/impulsos');
check('GET /api/impulsos sin sesión -> 401', 401, $c);
[$c, $j] = $http('GET', '/api/impulsos', null, $tok);
check('GET /api/impulsos -> 200 con equipo, fondo, tarjeta y productos', [200, true, 9, true, 19.99], [$c, isset($j['equipo']['alquiler']['precio']), count($j['fondo']['hitos'] ?? []), $j['tarjeta']['activa'] === false, $j['productos']['fondo_crecimiento']['precio'] ?? null]);
check('POST sin cabecera X-Envivo -> 403', 403, $http('POST', '/api/impulsos/alquilar', [], $tok, false)[0]);
[$c, $j] = $http('POST', '/api/impulsos/alquilar', [], $tok);
check('POST /api/impulsos/alquilar sin precio -> 400 confirmar_precio con el precio', [400, 'confirmar_precio', 2000], [$c, $j['codigo'] ?? null, $j['precio'] ?? null]);
[$c, $j] = $http('POST', '/api/impulsos/alquilar', ['confirmar_precio' => 2000], $tok);
check('POST /api/impulsos/alquilar -> 200, 2 equipos', [200, 2, true], [$c, $j['obreros'] ?? null, $j['equipo']['alquiler']['activo'] ?? null]);
[$c, $j] = $http('POST', '/api/impulsos/fondo', ['nivel' => 5], $tok);
check('POST /api/impulsos/fondo sin comprar -> 403 fondo_requerido', [403, 'fondo_requerido'], [$c, $j['codigo'] ?? null]);
[$c, $j] = $http('POST', '/api/impulsos/fondo', ['nivel' => 'cinco'], $tok);
check('POST /api/impulsos/fondo con nivel malo -> 400 hito_invalido', [400, 'hito_invalido'], [$c, $j['codigo'] ?? null]);
$pagar($H, 'tarjeta_semanal');
[$c, $j] = $http('POST', '/api/impulsos/tarjeta', [], $tok);
check('POST /api/impulsos/tarjeta -> 200, 15 créditos, reclamada hoy', [200, 15, true], [$c, $j['recibido']['creditos'] ?? null, $j['tarjeta']['reclamada_hoy'] ?? null]);
[$c, $j] = $http('POST', '/api/impulsos/tarjeta', [], $tok);
check('…otra vez -> 409 ya_reclamado', [409, 'ya_reclamado'], [$c, $j['codigo'] ?? null]);
check('GET /api/impulsos/tarjeta -> 405', 405, $http('GET', '/api/impulsos/tarjeta', null, $tok)[0]);
check('POST /api/impulsos -> 405', 405, $http('POST', '/api/impulsos', [], $tok)[0]);
check('GET /api/estado trae los productos nuevos en la tienda', true, (function () use ($http) { $ids = array_column($http('GET', '/api/estado')[1]['tienda']['productos'] ?? [], 'id'); return !array_diff(IM::PRODUCTOS, $ids); })());
proc_terminate($srv); proc_close($srv);
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en el servidor', '', $errores);

echo "\n----------------------------------------\nImpulsos: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
