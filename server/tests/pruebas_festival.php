<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Prueba el Mega Festival (server/src/Festival.php) con una base SQLite
// TEMPORAL y el validador DE VERDAD (server/validador/validador.js por consola): los intentos se juegan con la misma
// lógica que el juego (js/logic.js) y el servidor los repite.
// Uso:  php server/tests/pruebas_festival.php        (necesita node en el PATH o VALIDADOR_NODE=/ruta/a/node)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_festival_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0700, true);
$NODE = getenv('VALIDADOR_NODE') ?: trim((string) shell_exec('command -v node'));
if ($NODE === '') { fwrite(STDERR, "Falta node (para el validador).\n"); exit(1); }
file_put_contents($TMP . '/config.env', "ENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1\nENVIVO_ZONA=America/Guayaquil\nVALIDADOR_NODE=$NODE\nNODE_BIN=$NODE\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
register_shutdown_function(function () use ($TMP) { if (getenv('GUARDAR_TMP') !== '1') exec('rm -rf ' . escapeshellarg($TMP)); else echo "Archivos en $TMP\n"; });

// Si js/logic.js no carga (otra persona lo está cambiando a medias), el validador usa la última versión guardada en git.
exec(escapeshellarg($NODE) . ' -e ' . escapeshellarg("require(process.argv[1])") . ' ' . escapeshellarg($RAIZ . '/js/logic.js') . ' 2>&1', $_o, $_c);
if ($_c !== 0) {
    mkdir($TMP . '/juego/js', 0700, true);
    foreach (['logic.js', 'premium.js', 'datos.js'] as $_f) {
        $_t = shell_exec('git -C ' . escapeshellarg($RAIZ) . ' show HEAD:js/' . $_f . ' 2>/dev/null');
        if (is_string($_t) && $_t !== '') file_put_contents($TMP . '/juego/js/' . $_f, $_t);
    }
    putenv('ENVIVO_JUEGO=' . $TMP . '/juego');
    echo "AVISO: js/logic.js no carga ahora mismo; el validador usa js/ de git (HEAD).\n";
}

require $RAIZ . '/server/src/arranque.php';

use EnVivo\{Cuentas, Db, Fallo, Festival, Monedero, Social};

$ok = 0; $fallas = 0;
function check(string $n, $esperado, $real): void {
    global $ok, $fallas;
    if ($esperado === $real) { $ok++; echo "  OK    $n\n"; }
    else { $fallas++; echo "  FALLA $n — esperado [" . json_encode($esperado, JSON_UNESCAPED_UNICODE) . '], salió [' . json_encode($real, JSON_UNESCAPED_UNICODE) . "]\n"; }
}
function si(string $n, bool $c): void { check($n, true, $c); }
function titulo(string $t): void { echo "\n== $t\n"; }
/** Corre $f y devuelve [http, codigo, mensaje] del Fallo (o [200, null, null] si no falló). */
function falla(callable $f): array {
    try { $f(); return [200, null, null]; }
    catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null, $e->getMessage()]; }
}

// Juega un intento como lo haría el juego: mismo intento.js y misma lógica que el validador. Estrategia: la primera
// opción disponible (o la que diga $estrategia: 'mejor' = la de menor costo de calidad conocido no se sabe; usamos 'primera').
$JUGADOR = $TMP . '/jugar.cjs';
file_put_contents($JUGADOR, <<<'JS'
const V = require(process.argv[2]);
let t = ''; process.stdin.on('data', (b) => (t += b)); process.stdin.on('end', () => {
  const it = JSON.parse(t);
  const r = V.play(it, (inc) => { const i = inc.choices.findIndex((c) => c.ok); return i < 0 ? 0 : i; });
  process.stdout.write(JSON.stringify({ decisiones: r.decisiones, resultado: r.resultado }));
});
JS);
$jugar = function (array $intento) use ($NODE, $JUGADOR, $RAIZ): array {
    $p = proc_open([$NODE, $JUGADOR, $RAIZ . '/server/validador/validador.js'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $t);
    fwrite($t[0], json_encode(['seed' => $intento['seed'], 'contrato' => $intento['contrato'], 'equipo' => $intento['equipo'], 'contexto' => $intento['contexto'], 'vip' => $intento['vip']]));
    fclose($t[0]);
    $out = stream_get_contents($t[1]); $err = stream_get_contents($t[2]);
    fclose($t[1]); fclose($t[2]); proc_close($p);
    $j = json_decode((string) $out, true);
    if (!is_array($j)) { echo "  (node: $err)\n"; return ['decisiones' => [], 'resultado' => null]; }
    return $j;
};

Db::pdo();
Festival::preparar();
$limpiar = fn() => Db::q('DELETE FROM intentos');   // límites por minuto (Limite) entre bloques de pruebas
$n = 0;
$nuevo = function (string $nombre, int $fama = 60) use (&$n): int {
    $n++;
    $id = Cuentas::registrar("fest$n." . bin2hex(random_bytes(3)) . '@prueba.example', $nombre, 'ClaveSegura' . $n);
    Db::q('UPDATE jugadores SET fama_publica = ?, alias = ?, alias_clave = ? WHERE id = ?', [$fama, $nombre, Social::clave($nombre), $id]);
    return $id;
};
$creditos = function (int $j, int $c) { Monedero::mover($j, $c, 'manual', 'prueba'); };
$libro = fn(int $j) => (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ?', [$j]);
$EQUIPO = ['staff' => [['role' => 'cam', 'skill' => 5, 'owner' => true], ['role' => 'cam', 'skill' => 4], ['role' => 'cam', 'skill' => 4], ['role' => 'dir', 'skill' => 5],
                       ['role' => 'audio', 'skill' => 4], ['role' => 'stream', 'skill' => 4]],
           'equip' => [['type' => 'cam_cine', 'condition' => 100], ['type' => 'cam_cine'], ['type' => 'cam_cine'], ['type' => 'cam_cine'], ['type' => 'switch_pro'], ['type' => 'audio_pro'],
                       ['type' => 'mics'], ['type' => 'encoder'], ['type' => 'router4g'], ['type' => 'ups'], ['type' => 'raincover']]];
$I0 = Festival::inicio();
$C = Festival::CICLO;
$en = fn(int $ciclo, int $seg) => Festival::$reloj = $I0 + $ciclo * $C + $seg;
/** Pide, juega y envía un intento. Devuelve [respuesta de iniciar, respuesta de enviar]. */
$turno = function (int $j, int $esc, ?callable $cambiar = null) use ($jugar, $EQUIPO): array {
    $a = Festival::iniciar($j, ['escenario' => $esc, 'equipo' => $EQUIPO]);
    $p = $jugar($a['intento']);
    $env = ['intento_id' => $a['intento']['id'], 'decisiones' => $p['decisiones'], 'resultado' => $p['resultado']];
    if ($cambiar) $env = $cambiar($env, $p);
    return [$a, Festival::enviar($j, $env), $p];
};

// =====================================================================
titulo('Calendario: cada 2 días, ventana de 24 h');
$c = Festival::ciclo($I0 + 3600);
check('1 h después del inicio: ciclo 0 abierto', [0, true, $I0, $I0 + 86400, $I0 + 172800], [$c['n'], $c['abierto'], $c['abre'], $c['cierra'], $c['siguiente']]);
check('25 h después: cerrado (descanso), mismo ciclo', [0, false], [Festival::ciclo($I0 + 90000)['n'], Festival::ciclo($I0 + 90000)['abierto']]);
check('49 h después: ciclo 1 abierto', [1, true], [Festival::ciclo($I0 + 176400)['n'], Festival::ciclo($I0 + 176400)['abierto']]);
check('Imprevistos: el primer bloque siempre en calma; los otros salen de la semilla (iguales para todos)', ['calma', Festival::incidenteDe(77, 2)], [Festival::incidenteDe(77, 0), Festival::incidenteDe(77, 2)]);
$fake = ['nombre' => 'Mega Festival QFP', 'liga' => 0];
$k1 = Festival::contrato($fake, 1, 'calma'); $k2 = Festival::contrato($fake, 3, 'tormenta'); $k3 = Festival::contrato($fake, 5, 'tension'); $k4 = Festival::contrato($fake, 2, 'publico');
check('Contrato del Escenario Principal en Bronce (concierto, 4 cámaras, dificultad 4, al aire libre)', ['concierto', 4, 4, true, true], [$k1['type'], $k1['cams'], $k1['diff'], $k1['outdoor'], $k1['stream']]);
check('Tormenta: la carpa (bajo techo) queda a la intemperie', true, $k2['outdoor']);
check('Baja de tensión: +1 de dificultad (prensa 2 → 3)', 3, $k3['diff']);
check('Público desbordado: +1 cámara (rock 3 → 4)', 4, $k4['cams']);
$kd = Festival::contrato(['nombre' => 'X', 'liga' => 3], 1, 'tension');
check('Diamante: dificultad con tope 5 y una cámara más', [5, 5], [$kd['diff'], $kd['cams']]);
check('Metas: crecen con miembros y liga', [100, 650, 1170], [Festival::metaEscenario(1, 3, 0), Festival::metaEscenario(1, 20, 0), Festival::metaEscenario(1, 20, 3)]);
check('Metas: mínimo de 3 miembros', Festival::metaEscenario(1, 3, 0), Festival::metaEscenario(1, 1, 0));
check('Contexto igual para todos por liga (fama fija, no la del jugador)', [['fama' => 20, 'dinero' => 1000, 'stock' => ['cable' => 1, 'battery' => 1]], 65], [Festival::contexto(0), Festival::contexto(3)['fama']]);

// =====================================================================
titulo('Sin asociación');
$en(0, 3600);
$solo = $nuevo('Productora Sola');
$r = Festival::resumen($solo);
check('GET: festival null, no puede jugar, motivo sin_asociacion, 0 pases (no gana el diario)', [null, false, 'sin_asociacion', 0], [$r['festival'], $r['yo']['puede_jugar'], $r['yo']['codigo'], $r['yo']['pases']]);
check('Claves del GET', ['ok', 'ahora', 'ciclo', 'asociacion', 'festival', 'yo', 'premios', 'anterior'], array_keys($r));
check('Iniciar sin asociación -> 403', [403, 'sin_asociacion'], array_slice(falla(fn() => Festival::iniciar($solo, ['escenario' => 1, 'equipo' => $EQUIPO])), 0, 2));
check('Comprar pases sin asociación -> 403', 403, falla(fn() => Festival::comprarPases($solo, []))[0]);

// =====================================================================
titulo('Festival de una asociación: 6 escenarios, metas por tamaño');
$A = $nuevo('Ana Producciones'); $B = $nuevo('Beto Live'); $Cc = $nuevo('Caro Stream');
Social::crear($A, ['nombre' => 'Quito Festival Pro', 'siglas' => 'QFP', 'color' => '#ff3b3b', 'pagado_en_juego' => true]);
$asoc = (int) Social::miembro($A)['asociacion_id'];
Social::unirse($B, $asoc); Social::unirse($Cc, $asoc);
$r = Festival::resumen($A);
$f = $r['festival'];
check('Festival creado: nombre, Bronce, 3 miembros, abierto', ['Mega Festival QFP', 'Bronce', 3, 'abierto'], [$f['nombre'], $f['liga']['nombre'], $f['miembros'], $f['estado']]);
check('6 escenarios con nombre y contrato del servidor', [1, 2, 3, 4, 5, 6], array_column($f['escenarios'], 'n'));
check('Metas de 3 miembros en Bronce', [100, 80, 80, 70, 60, 90], array_column($f['escenarios'], 'meta'));
check('meta_total = suma, 0 %', [480, 0, 0], [$f['meta_total'], $f['calidad_total'], $f['porcentaje']]);
check('4 hitos (25/50/75/100) sin alcanzar, 4 bloques de imprevistos y el primero activo', [[25, 50, 75, 100], [false, false, false, false], 4, true], [array_column($f['hitos'], 'pct'), array_column($f['hitos'], 'alcanzado'), count($f['incidentes']), $f['incidentes'][0]['activo']]);
check('Pase diario (misión "pasar lista") y nada más sin VIP', [1, true, false], [$r['yo']['pases'], $r['yo']['hoy']['diario'], $r['yo']['hoy']['vip']]);
check('Pedir el estado otra vez no regala otro pase', 1, Festival::resumen($A)['yo']['pases']);
check('Una sola instancia por asociación y ciclo', 1, (int) Db::valor('SELECT COUNT(*) FROM festival_instancias WHERE asociacion_id = ?', [$asoc]));

// =====================================================================
titulo('Pases de Prensa: VIP, misiones, compra con créditos (libro de créditos)');
Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400 * 5, $B]);
$rb = Festival::resumen($B);
check('VIP: +1 pase al día (2 en total)', [2, true], [$rb['yo']['pases'], $rb['yo']['hoy']['vip']]);
check('Misión del día: da 1 pase', true, Festival::ganarPaseMision($A, 'cubre_un_evento'));
check('…la misma misión no da otro el mismo día', false, Festival::ganarPaseMision($A, 'cubre_un_evento'));
check('…otra misión sí (máximo 2 por día)', [true, false], [Festival::ganarPaseMision($A, 'repara_equipo'), Festival::ganarPaseMision($A, 'contrata')]);
check('A tiene 3 pases', 3, Festival::pases($A));
check('Comprar sin créditos -> 402 sin_creditos', [402, 'sin_creditos'], array_slice(falla(fn() => Festival::comprarPases($Cc, ['cantidad' => 1])), 0, 2));
$creditos($Cc, 100);
$rc = Festival::comprarPases($Cc, ['cantidad' => 2]);
check('Comprar 2 pases: -60 créditos, 3 pases', [40, 3, 2], [$rc['compra']['creditos'], $rc['compra']['pases'], $rc['estado']['yo']['compra']['comprados_hoy']]);
$rc = Festival::comprarPases($Cc, []);
check('Tercer pase del día: 10 créditos, 4 pases', [10, 4], [$rc['compra']['creditos'], $rc['compra']['pases']]);
$creditos($Cc, 100);
check('Cuarto pase del día -> 409 limite_compra (máximo 3)', [409, 'limite_compra'], array_slice(falla(fn() => Festival::comprarPases($Cc, [])), 0, 2));
check('Cantidad inválida -> 400', [400, 400], [falla(fn() => Festival::comprarPases($Cc, ['cantidad' => 4]))[0], falla(fn() => Festival::comprarPases($Cc, ['cantidad' => '1']))[0]]);
check('Libro de créditos = saldo (todo pasó por Monedero)', Monedero::saldo($Cc), $libro($Cc));
check('Movimientos de la compra en el libro', [-60, -30], array_map('intval', array_column(Db::todas("SELECT cambio FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'festival_pases' ORDER BY id", [$Cc]), 'cambio')));
check('Libro de pases = saldo', Festival::pases($Cc), (int) Db::valor('SELECT saldo FROM festival_pases WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$Cc]));
Db::q('UPDATE jugadores SET estado = ? WHERE id = ?', ['suspendido', $Cc]);
check('Cuenta suspendida: no compra pases (403)', 403, falla(fn() => Festival::comprarPases($Cc, []))[0]);
Db::q('UPDATE jugadores SET estado = ? WHERE id = ?', ['activo', $Cc]);
$limpiar();

// =====================================================================
titulo('Registro del equipo (topes contra trampas)');
$baja = $nuevo('Novata', 5);
Social::unirse($baja, $asoc);
Festival::resumen($baja);
$eq = fn(array $staff, array $equip) => ['staff' => $staff, 'equip' => $equip];
check('Fama 5: habilidad 5 -> 400 habilidad (máximo 3)', [400, 'habilidad'], array_slice(falla(fn() => Festival::iniciar($baja, ['escenario' => 1, 'equipo' => $eq([['role' => 'cam', 'skill' => 5]], [['type' => 'cam_basic']])])), 0, 2));
check('Fama 5: cámara broadcast 4K (fama 35) -> 400 fama_equipo', [400, 'fama_equipo'], array_slice(falla(fn() => Festival::iniciar($baja, ['escenario' => 1, 'equipo' => $eq([['role' => 'cam', 'skill' => 2]], [['type' => 'cam_cine']])])), 0, 2));
check('Dron 4K que no está en su bodega -> 403 no_es_tuyo', [403, 'no_es_tuyo'], array_slice(falla(fn() => Festival::iniciar($baja, ['escenario' => 1, 'equipo' => $eq([['role' => 'cam', 'skill' => 2]], [['type' => 'dron4k']])])), 0, 2));
check('Equipo VIP sin VIP -> 403 vip_requerido', [403, 'vip_requerido'], array_slice(falla(fn() => Festival::iniciar($baja, ['escenario' => 1, 'equipo' => $eq([['role' => 'cam', 'skill' => 2]], [['type' => 'vip_cam8k']])])), 0, 2));
check('Sin cámara -> 400 sin_camara', [400, 'sin_camara'], array_slice(falla(fn() => Festival::iniciar($baja, ['escenario' => 1, 'equipo' => $eq([['role' => 'cam', 'skill' => 2]], [['type' => 'mics']])])), 0, 2));
// Catálogo realista (js/datos.js vía CatalogoJuego): los 14 roles, las claves viejas y los 90 equipos del juego
$rv = Festival::revisarEquipo($baja, $eq([['role' => 'piloto_dron', 'skill' => 2], ['role' => 'cam', 'skill' => 2], ['role' => 'operador_graficos', 'skill' => 1]],
    [['type' => 'cam_gopra_heroe13'], ['type' => 'sop_tripode_basico'], ['type' => 'lente_kit_mft']]), false);
check('Roles nuevos y viejos (cam -> camarografo) y equipos del catálogo realista', [['piloto_dron', 'camarografo', 'operador_graficos'], ['cam_gopra_heroe13', 'sop_tripode_basico', 'lente_kit_mft']],
    [array_column($rv['staff'], 'role'), array_column($rv['equip'], 'type')]);
check('Los 14 roles del juego se aceptan', 14, count(Festival::revisarEquipo($baja, $eq(array_map(fn($r) => ['role' => $r, 'skill' => 1], array_slice(\EnVivo\CatalogoJuego::ROLES, 0, 8)), [['type' => 'cam_basic']]), false)['staff'])
    + count(Festival::revisarEquipo($baja, $eq(array_map(fn($r) => ['role' => $r, 'skill' => 1], array_slice(\EnVivo\CatalogoJuego::ROLES, 8)), [['type' => 'cam_basic']]), false)['staff']));
check('Cámara de sistema (fama 65 en el juego) con fama 5 -> 400 fama_equipo', [400, 'fama_equipo'], array_slice(falla(fn() => Festival::revisarEquipo($baja, $eq([['role' => 'camarografo', 'skill' => 2]], [['type' => 'cam_zony_hdk_3600']]), false)), 0, 2));
check('Rol que no existe -> 400 equipo', [400, 'equipo'], array_slice(falla(fn() => Festival::revisarEquipo($baja, $eq([['role' => 'astronauta', 'skill' => 2]], [['type' => 'cam_basic']]), false)), 0, 2));
check('Liga: los 16 tipos de evento, y cada liga usa solo tipos que existen', [16, []], [count(\EnVivo\Liga::TIPOS), array_values(array_diff(array_merge(...\EnVivo\Liga::TIPOS_LIGA), array_keys(\EnVivo\Liga::TIPOS)))]);
check('Equipo inventado -> 400', 400, falla(fn() => Festival::iniciar($baja, ['escenario' => 1, 'equipo' => $eq([['role' => 'cam', 'skill' => 2]], [['type' => 'cam_nasa']])]))[0]);
check('Escenario 7 -> 400', 400, falla(fn() => Festival::iniciar($baja, ['escenario' => 7, 'equipo' => $EQUIPO]))[0]);
check('Ningún intento fallido gastó pases', 1, Festival::pases($baja));
Monedero::entregar($baja, 'personal', 'cam', 4, 'creditos:estrella');
$okEq = Festival::revisarEquipo($baja, $eq([['role' => 'cam', 'skill' => 4, 'morale' => 100], ['role' => 'dir', 'skill' => 2]], [['type' => 'cam_basic', 'condition' => 100]]), false);
check('Camarógrafo estrella comprado (nivel 4) sí puede ir con fama baja; ánimo y estado los fija el servidor', [4, 80, 90], [$okEq['staff'][0]['skill'], $okEq['staff'][0]['morale'], $okEq['equip'][0]['condition']]);
check('…pero solo uno sobre el tope', 'habilidad', falla(fn() => Festival::revisarEquipo($baja, $eq([['role' => 'cam', 'skill' => 4], ['role' => 'dir', 'skill' => 4]], [['type' => 'cam_basic']]), false))[1]);
$limpiar();

// =====================================================================
titulo('Intento de verdad: semilla + contrato del servidor, el validador repite la jugada');
[$a, $e, $p] = $turno($A, 1);
$i = $a['intento'];
si('iniciar: semilla entera, contrato del escenario 1, equipo normalizado, contexto de la liga', is_int($i['seed']) && $i['contrato']['type'] === 'concierto' && $i['contrato']['escenario'] === 1 && $i['equipo']['staff'][0]['morale'] === 80 && $i['contexto']['fama'] === 20);
check('iniciar gasta 1 pase (3 → 2)', 2, $a['pases']);
$res = $e['resultado'];
check('enviar: validado, válido, coincide, calidad = la que dio la repetición', ['validado', true, true, $p['resultado']['quality'], $p['resultado']['stars']], [$res['estado'], $res['valido'], $res['coincide'], $res['calidad'], $res['estrellas']]);
$fa = $e['estado']['festival'];
check('El escenario 1 suma la calidad (tope: su meta)', min(100, $res['calidad']), $fa['escenarios'][0]['acumulado']);
check('Quién cubrió qué: Ana en el escenario 1', ['Ana Producciones'], array_column($fa['escenarios'][0]['cubierto_por'], 'nombre'));
check('Ranking personal: Ana 1.ª con sus puntos', [1, $res['calidad']], [$e['estado']['yo']['puesto'], $e['estado']['yo']['puntos']]);
check('Enviar otra vez el mismo intento -> 409 ya_enviado (una semilla, un intento)', [409, 'ya_enviado'], array_slice(falla(fn() => Festival::enviar($A, ['intento_id' => $i['id'], 'decisiones' => $p['decisiones']])), 0, 2));
check('El intento de otro jugador -> 404', 404, falla(fn() => Festival::enviar($B, ['intento_id' => $i['id'], 'decisiones' => $p['decisiones']]))[0]);
$fila = Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$i['id']]);
check('En la base: semilla, decisiones, resultado del cliente y validador por consola', [$i['seed'], json_encode($p['decisiones']), 'consola', 0], [(int) $fila['semilla'], $fila['decisiones_json'], $fila['via'], (int) $fila['sospechoso']]);
si('…y la versión de la lógica', is_string($fila['version_logica']) && strlen($fila['version_logica']) >= 8);

titulo('Trampas');
[$a, $e, $p] = $turno($A, 2, fn($env) => ['resultado' => ['quality' => 100, 'stars' => 5]] + $env);
$res = $e['resultado'];
check('Calidad inventada (100 ⭐5): se guarda la del servidor, no coincide, queda como sospechoso', ['validado', false, false, $p['resultado']['quality']],
    [$res['estado'], $res['valido'], $res['coincide'], $res['calidad']]);
check('…sospechoso en la base', 1, (int) Db::valor('SELECT sospechoso FROM festival_intentos WHERE id = ?', [$a['intento']['id']]));
[$a, $e] = $turno($B, 3, fn($env) => ['decisiones' => array_merge($env['decisiones'], [0, 0])] + $env);
check('Decisiones de más: inválido, no suma nada', ['invalido', 0, 'sobran_decisiones'], [$e['resultado']['estado'], $e['resultado']['aporte'], $e['resultado']['motivo']]);
[$a, $e] = $turno($B, 3, fn($env) => ['decisiones' => array_map(fn() => 9, $env['decisiones'])] + $env);
check('Opción que no existe: inválido', ['invalido', 'opcion_invalida'], [$e['resultado']['estado'], $e['resultado']['motivo']]);
check('Escenario 3 sigue en 0 después de las trampas', 0, $e['estado']['festival']['escenarios'][2]['acumulado']);
check('Decisiones mal formadas -> 400 (sin gastar la semilla)', 400, falla(fn() => Festival::enviar($A, ['intento_id' => 1, 'decisiones' => ['a']]))[0]);
$limpiar();

titulo('Intento abierto, vencido y validador caído');
$x = Festival::iniciar($Cc, ['escenario' => 4, 'equipo' => $EQUIPO]);
$y = Festival::iniciar($Cc, ['escenario' => 4, 'equipo' => $EQUIPO]);
check('Pedir otra vez el mismo escenario: devuelve el mismo intento sin gastar otro pase', [true, $x['intento']['id'], $x['intento']['seed'], $x['pases']], [$y['reanudado'], $y['intento']['id'], $y['intento']['seed'], $y['pases']]);
check('Pedir otro escenario con uno abierto -> 409 intento_abierto', [409, 'intento_abierto'], array_slice(falla(fn() => Festival::iniciar($Cc, ['escenario' => 5, 'equipo' => $EQUIPO])), 0, 2));
check('GET muestra el intento abierto (para seguir después de recargar)', $x['intento']['id'], Festival::resumen($Cc)['yo']['intento_abierto']['id']);
$px = $jugar($x['intento']);
$en(0, 3600 + Festival::INTENTO_DURA + 60);
check('Enviar después de 30 min -> 409 vencido', [409, 'vencido'], array_slice(falla(fn() => Festival::enviar($Cc, ['intento_id' => $x['intento']['id'], 'decisiones' => $px['decisiones']])), 0, 2));
check('…el pase no se devuelve (4 → 3)', 3, Festival::pases($Cc));
Festival::$validador = fn(array $it) => ['valido' => false, 'calidad' => null, 'detalle' => ['motivo' => 'validador_caido']];
[$a, $e, $p] = $turno($Cc, 4);
check('Validador caído: queda pendiente, todavía no suma', ['pendiente', 0], [$e['resultado']['estado'], $e['estado']['festival']['escenarios'][3]['acumulado']]);
Festival::$validador = null;
$en(0, 3600 + Festival::INTENTO_DURA + 400);
$rv = Festival::revalidar();
$fila = Db::fila('SELECT * FROM festival_intentos WHERE id = ?', [$a['intento']['id']]);
check('Cuando vuelve: se revalida y suma lo del validador', [1, 'validado', $p['resultado']['quality']], [$rv, $fila['estado'], (int) $fila['calidad']]);
$limpiar();

// =====================================================================
titulo('Escenarios completos, hitos y metas que crecen con la asociación');
$D = $nuevo('Dani Medios');
Social::unirse($D, $asoc);
$fD = Festival::resumen($D)['festival'];
check('Entró un 5.º miembro: las metas suben (nunca bajan)', [5, 170], [$fD['miembros'], $fD['escenarios'][0]['meta']]);
// Para no gastar horas: dar pases a todos y jugar hasta llenar el festival con intentos validados de verdad.
foreach ([$A, $B, $Cc, $D] as $q) Db::q("INSERT INTO festival_pases (jugador_id, cambio, saldo, motivo, ref, dia, creado) VALUES (?, 8, 0, 'ajuste', ?, ?, ?)", [$q, 'prueba:' . $q, Festival::dia(), Festival::ahora()]);
$jugadores = [$A, $B, $Cc, $D];
$vueltas = 0;
$completoCerrado = null;
while ($vueltas < 30) {
    $f = Festival::resumen($A)['festival'];
    $libre = array_values(array_filter($f['escenarios'], fn($s) => !$s['completado']));
    if (!$libre) break;
    $q = $jugadores[$vueltas % 4];
    $esc = $libre[0]['n'];
    [$a, $e] = $turno($q, $esc);
    $vueltas++;
    if ($completoCerrado === null && $e['estado']['festival']['escenarios'][$esc - 1]['completado']) $completoCerrado = [$esc, $q];
    if ($vueltas % 6 === 0) $limpiar();
}
$f = Festival::resumen($A)['festival'];
check('Con intentos validados se llenan los 6 escenarios: 100 %', [100, 6], [$f['porcentaje'], count(array_filter($f['escenarios'], fn($s) => $s['completado']))]);
check('Los 4 hitos alcanzados', [true, true, true, true], array_column($f['hitos'], 'alcanzado'));
si('Cada escenario dice quién lo cerró', count(array_filter($f['escenarios'], fn($s) => is_string($s['completado_por']))) === 6);
check('Un escenario completo no acepta más turnos -> 409 escenario_completo', [409, 'escenario_completo'], array_slice(falla(fn() => Festival::iniciar($B, ['escenario' => 1, 'equipo' => $EQUIPO])), 0, 2));
check('calidad_total nunca pasa de la meta', $f['meta_total'], $f['calidad_total']);
echo "  (", $vueltas, " turnos para el 100 %)\n";
$limpiar();

// =====================================================================
titulo('Nadie produce con dos asociaciones en el mismo festival');
Social::salir($D);
Social::crear($D, ['nombre' => 'Otra Asociacion', 'siglas' => 'OTR', 'color' => '#00aa00', 'pagado_en_juego' => true]);
$rD = Festival::resumen($D);
check('D ya jugó en QFP: en OTR no puede jugar este ciclo', [false, 'otra_asociacion'], [$rD['yo']['puede_jugar'], $rD['yo']['codigo']]);
check('Iniciar -> 409 otra_asociacion', [409, 'otra_asociacion'], array_slice(falla(fn() => Festival::iniciar($D, ['escenario' => 1, 'equipo' => $EQUIPO])), 0, 2));

// =====================================================================
titulo('Cierre: premios por aporte, puesto, hitos y escenarios; liga sube');
$instId = $f['id'];
$en(0, 86400 - 60);
check('Un minuto antes del cierre, con todo cubierto: no hay turnos (escenario_completo)', 'escenario_completo', falla(fn() => Festival::iniciar($baja, ['escenario' => 6, 'equipo' => $eq([['role' => 'cam', 'skill' => 2]], [['type' => 'cam_basic']])]))[1]);
$en(0, 86400 + 60);
check('Pasado el cierre: el GET ya no muestra festival abierto, pero tampoco reparte antes de la gracia', [null, 'abierto'], [Festival::resumen($A)['festival'], Db::valor('SELECT estado FROM festival_instancias WHERE id = ?', [$instId])]);
$en(0, 86400 + Festival::GRACIA_CIERRE + 5);
$rA = Festival::resumen($A);
check('Después de la gracia: cerrado al pedir el estado', 'cerrado', Db::valor('SELECT estado FROM festival_instancias WHERE id = ?', [$instId]));
check('Liga de la asociación: sube a Plata (100 % ≥ 75 %)', [1, 'Plata'], [$rA['asociacion']['liga']['n'], $rA['asociacion']['liga']['nombre']]);
check('"anterior" con el porcentaje y mis premios', [$instId, 100], [$rA['anterior']['id'], $rA['anterior']['porcentaje']]);
$tipos = array_count_values(array_column($rA['anterior']['mis_premios'], 'tipo'));
si('Ana recibe premio de aporte, de puesto y los 4 hitos', ($tipos['aporte'] ?? 0) === 1 && ($tipos['puesto'] ?? 0) === 1 && ($tipos['hito'] ?? 0) === 4);
$ent = array_merge(...array_column($rA['anterior']['mis_premios'], 'entregas'));
si('Premios como entregas de tipos que el juego ya aplica (dinero, consumible, reparar_todo)', $ent && !array_diff(array_unique(array_column($ent, 'tipo')), ['dinero', 'consumible', 'reparar_todo']));
si('…y aparecen en las entregas del estado del juego', count(array_intersect(array_column($ent, 'id'), array_column(Monedero::entregas($A), 'id'))) === count($ent));
$fichasA = Festival::fichas($A);
si('Fichas del festival = suma de sus premios' . (Festival::fichasCompartidas() ? ' (pagadas en las fichas de la Liga)' : ''), $fichasA > 0 && $fichasA === (int) Db::valor('SELECT SUM(fichas) FROM festival_premios WHERE jugador_id = ?', [$A]));
check('Los que no jugaron no reciben nada (Novata)', 0, (int) Db::valor('SELECT COUNT(*) FROM festival_premios WHERE jugador_id = ?', [$baja]));
check('Cerrar otra vez no duplica nada', [false, (int) Db::valor('SELECT COUNT(*) FROM entregas')], [Festival::cerrar($instId), (int) Db::valor('SELECT COUNT(*) FROM entregas')]);
check('Aviso por el chat de sistema a cada participante', 1, (int) Db::valor("SELECT COUNT(*) FROM chat_mensajes WHERE canal = ? AND texto LIKE '%Mega Festival QFP%'", ['sistema:' . $A]));
$pts = array_map('intval', array_column(Db::todas("SELECT SUM(calidad) AS p FROM festival_intentos WHERE instancia_id = ? AND estado = 'validado' GROUP BY jugador_id ORDER BY p DESC", [$instId]), 'p'));
$primero = (int) Db::valor("SELECT jugador_id FROM festival_intentos WHERE instancia_id = ? AND estado = 'validado' GROUP BY jugador_id ORDER BY SUM(calidad) DESC, MIN(validado_en) LIMIT 1", [$instId]);
check('Premio de puesto 1 (30 fichas) para quien más aportó', 30, (int) Db::valor("SELECT fichas FROM festival_premios WHERE instancia_id = ? AND tipo = 'puesto' AND clave = '1'", [$instId]));
check('…y es el primero del ranking', $primero, (int) Db::valor("SELECT jugador_id FROM festival_premios WHERE instancia_id = ? AND tipo = 'puesto' AND clave = '1'", [$instId]));

// =====================================================================
titulo('Siguiente ciclo: más difícil en Plata');
$en(1, 600);
$r2 = Festival::resumen($A);
$f2 = $r2['festival'];
check('Nuevo festival en el ciclo 1, Plata, 0 %', [1, 'Plata', 0], [$f2['ciclo'], $f2['liga']['nombre'], $f2['porcentaje']]);
check('Dificultad +1 (Escenario Principal 4 → 5) y metas más altas (190 por miembro)', [5, Festival::metaEscenario(1, 4, 1)], [$f2['escenarios'][0]['contrato']['diff'], $f2['escenarios'][0]['meta']]);
check('El intento vencido de antes ya no está abierto', null, $r2['yo']['intento_abierto']);
$limpiar();
[$a2, $e2] = $turno($A, 5);
check('Se juega normal en el nuevo ciclo (contrato con dificultad de Plata)', ['validado', 3], [$e2['resultado']['estado'], $a2['intento']['contrato']['diff']]);
$en(1, 86400 + Festival::GRACIA_CIERRE + 5);
[$rev, $cer] = Festival::tareas();
check('Tarea programada: cierra el festival vencido del ciclo 1', [1, 'cerrado'], [$cer, Db::valor('SELECT estado FROM festival_instancias WHERE id = ?', [$f2['id']])]);
check('Con menos de 25 %: QFP baja a Bronce otra vez', 0, Festival::liga($asoc));

// =====================================================================
titulo('Rutas HTTP: el bloque de INTEGRAR_FESTIVAL.md aplicado a una copia de api.php');
$doc = (string) file_get_contents($RAIZ . '/server/INTEGRAR_FESTIVAL.md');
$bloque = preg_match('/<!-- prueba:rutas -->\s*```php\n(.*?)```/s', $doc, $mm) ? $mm[1] : '';
si('El documento trae el bloque de rutas', str_contains($bloque, "'/festival/intento/iniciar'"));
$api = (string) file_get_contents($RAIZ . '/server/public/api.php');
$ancla = "        default => Http::error(404, 'No encontrado.'),";
if (!str_contains($api, "'/festival'")) {
    si('api.php tiene el lugar donde va el bloque', str_contains($api, $ancla));
    $api = str_replace($ancla, $bloque . $ancla, $api);
}
$api = str_replace("require dirname(__DIR__) . '/src/arranque.php';", 'require ' . var_export($RAIZ . '/server/src/arranque.php', true) . ';', $api);
mkdir($TMP . '/web');
file_put_contents($TMP . '/web/api.php', $api);
file_put_contents($TMP . '/web/router.php', "<?php\nif (str_starts_with((string) parse_url(\$_SERVER['REQUEST_URI'], PHP_URL_PATH), '/api/')) { require __DIR__ . '/api.php'; return true; }\nhttp_response_code(404); return true;\n");
check('La copia de api.php con el bloque no tiene errores de sintaxis', 0, (function () use ($TMP) { exec('php -l ' . escapeshellarg($TMP . '/web/api.php') . ' 2>&1', $o, $c); return $c; })());
// Base aparte y el festival abierto AHORA (el servidor HTTP usa la hora real)
file_put_contents($TMP . '/http.env', "ENVIVO_DB=$TMP/datos/http.sqlite\nENVIVO_URL=http://127.0.0.1\nENVIVO_ZONA=America/Guayaquil\nNODE_BIN=$NODE\nFESTIVAL_INICIO=" . date('c', time() - 3600) . "\n");
$puerto = 18000 + random_int(0, 999);
$srv = proc_open(['php', '-S', '127.0.0.1:' . $puerto, '-t', $TMP . '/web', $TMP . '/web/router.php'], [0 => ['pipe', 'r'], 1 => ['file', $TMP . '/http.log', 'a'], 2 => ['file', $TMP . '/http.log', 'a']],
    $tubosSrv, null, ['ENVIVO_CONFIG' => $TMP . '/http.env', 'PATH' => (string) getenv('PATH'), 'no_proxy' => '127.0.0.1', 'NO_PROXY' => '127.0.0.1'] + (getenv('ENVIVO_JUEGO') ? ['ENVIVO_JUEGO' => getenv('ENVIVO_JUEGO')] : []));
for ($k = 0; $k < 50 && !@fsockopen('127.0.0.1', $puerto); $k++) usleep(100000);
$http = function (string $metodo, string $ruta, ?array $cuerpo = null, string $jar = '', bool $cabecera = true) use ($puerto): array {
    $ch = curl_init('http://127.0.0.1:' . $puerto . $ruta);
    $cab = ['Content-Type: application/json'];
    if ($cabecera) $cab[] = 'X-Envivo: 1';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cab, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30]);
    if ($jar !== '') curl_setopt_array($ch, [CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar]);
    if ($cuerpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cuerpo));
    $r = (string) curl_exec($ch);
    $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$c, json_decode($r, true)];
};
$jar1 = $TMP . '/jar_h1';
[$c] = $http('GET', '/api/festival');
check('GET /api/festival sin sesión -> 401', 401, $c);
[$c, $j] = $http('POST', '/api/registro', ['email' => 'http1.' . bin2hex(random_bytes(3)) . '@prueba.example', 'nombre' => 'Hugo Http', 'clave' => 'ClaveSegura99'], $jar1);
check('Registro por HTTP', 200, $c);
$http('POST', '/api/perfil', ['alias' => 'Hugo Http', 'fama' => 15], $jar1);
[$c] = $http('POST', '/api/asociaciones/crear', ['nombre' => 'Rutas de Prueba', 'siglas' => 'RDP', 'color' => '#4da3ff', 'pagado_en_juego' => true], $jar1);
check('Crear asociación por HTTP', 200, $c);
[$c, $j] = $http('GET', '/api/festival', null, $jar1);
check('GET /api/festival: abierto, 6 escenarios, 1 pase', [200, true, 6, 1], [$c, $j['ciclo']['abierto'] ?? null, count($j['festival']['escenarios'] ?? []), $j['yo']['pases'] ?? null]);
[$c] = $http('POST', '/api/festival', [], $jar1);
check('POST a /api/festival -> 405', 405, $c);
$eqH = ['staff' => [['role' => 'cam', 'skill' => 4, 'owner' => true], ['role' => 'dir', 'skill' => 3]], 'equip' => [['type' => 'cam_pro'], ['type' => 'cam_basic'], ['type' => 'switch_basic'], ['type' => 'audio_basic']]];
[$c] = $http('POST', '/api/festival/intento/iniciar', ['escenario' => 2, 'equipo' => $eqH], $jar1, false);
check('iniciar sin X-Envivo -> 403', 403, $c);
[$c, $j] = $http('POST', '/api/festival/intento/iniciar', ['escenario' => 2, 'equipo' => ['staff' => [['role' => 'cam', 'skill' => 5]], 'equip' => [['type' => 'cam_pro']]]], $jar1);
check('iniciar con habilidad sobre el tope -> 400 con codigo', [400, false, 'habilidad', 4], [$c, $j['ok'] ?? null, $j['codigo'] ?? null, $j['habilidad_max'] ?? null]);
[$c, $j] = $http('POST', '/api/festival/intento/iniciar', ['escenario' => 2, 'equipo' => $eqH], $jar1);
check('POST /api/festival/intento/iniciar -> semilla + contrato del escenario 2', [200, true, 2, 0], [$c, is_int($j['intento']['seed'] ?? null), $j['intento']['contrato']['escenario'] ?? null, $j['pases'] ?? null]);
$p = $jugar($j['intento']);
[$c, $k] = $http('POST', '/api/festival/intento/enviar', ['intento_id' => $j['intento']['id'], 'decisiones' => $p['decisiones'], 'resultado' => $p['resultado']], $jar1);
check('POST /api/festival/intento/enviar -> validado por el validador (calidad del servidor)', [200, 'validado', $p['resultado']['quality'], true],
    [$c, $k['resultado']['estado'] ?? null, $k['resultado']['calidad'] ?? null, isset($k['estado']['festival'])]);
[$c, $k] = $http('POST', '/api/festival/intento/enviar', ['intento_id' => $j['intento']['id'], 'decisiones' => $p['decisiones']], $jar1);
check('…enviarlo otra vez -> 409 ya_enviado', [409, 'ya_enviado'], [$c, $k['codigo'] ?? null]);
[$c, $k] = $http('POST', '/api/festival/pases/comprar', ['cantidad' => 1], $jar1);
check('POST /api/festival/pases/comprar sin créditos -> 402 sin_creditos con el saldo', [402, 'sin_creditos', 0], [$c, $k['codigo'] ?? null, $k['creditos'] ?? null]);
proc_terminate($srv); proc_close($srv);

echo "\nFestival: $ok OK, $fallas fallas\n";
exit($fallas ? 1 : 0);
