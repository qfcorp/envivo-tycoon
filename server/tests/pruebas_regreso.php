<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Avisos por etapa y regreso del jugador (server/src/Regreso.php,
// RegresoApi.php, los ganchos en Push.php, CorreoPlantillas 'regreso', las ofertas regreso_* del catálogo y el bloque del
// Centro de Control server/public/control/lib/regreso.php), con base SQLite TEMPORAL y relojes congelados:
//   A) directo: push del día 1/2/3 (horas, una sola vez, no si está jugando, premio diario), 3/7/14 días (y el recordatorio
//      viejo de Push no se repite), Liga y Duelos a 2 h del cierre con el puesto, tope de 2 al día, nunca de noche en la hora
//      del jugador, seguimiento (enviado / volvió), ausencias, correo de los 7 días (uno por ausencia, baja, correos falsos
//      no), «¡Volviste!» (regalo 7/14/30 que da el servidor una vez, 3 días de ventaja, oferta según lo que compraba),
//      compra de la oferta (solo quien la tiene, una vez), interruptores y estadísticas.
//   B) por HTTP con php -S + router.php: /api/regreso, /api/regreso/reclamar, la página de baja del correo y el Centro de Control.
// Uso:  php server/tests/pruebas_regreso.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$SRV = $RAIZ . '/server';
$TMP = sys_get_temp_dir() . '/envivo_rg_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
function puerto_libre(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; }
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre();
$USUARIO = 'jefe_rg';
$CLAVE = 'Rg-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
require $SRV . '/src/Config.php';
require $SRV . '/src/Push.php';
$VAPID = \EnVivo\Push::generarPar();
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P\n"
    . "ENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\nCORREO_REGISTRO=$TMP/correos.log\nPUSH_MAX_DIA=3\n"
    . 'PUSH_VAPID_PUBLICA=' . \EnVivo\Push::b64u($VAPID['publica']) . "\nPUSH_VAPID_PRIVADA=" . \EnVivo\Push::b64u($VAPID['d']) . "\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '10.3.0.1';
require $SRV . '/src/arranque.php';

use EnVivo\{Ajustes, Catalogo, Compras, CorreoPlantillas, Db, Diario, Duelos, Fallo, Ganchos, Liga, Migraciones, Monedero, Push, Regreso};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
function falla(callable $f): array { try { $f(); return [200, null]; } catch (Fallo $e) { return [$e->getCode(), $e->extra['codigo'] ?? null]; } }
$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) { @proc_terminate($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});

$tz = new DateTimeZone('America/Guayaquil');
$ts = fn(string $f) => (new DateTimeImmutable($f, $tz))->getTimestamp();
$reloj = function (int $t): void { Push::fijarReloj($t); Regreso::fijarReloj($t); };
$enviados = [];
Push::fijarTransporte(function (string $url, array $cab, string $cuerpo) use (&$enviados): array { $enviados[] = $url; return ['http' => 201, 'cuerpo' => '']; });

Db::pdo();
titulo('Tablas');
check('Tablas regreso_* creadas solas al abrir la base', ['regreso_ausencias', 'regreso_avisos', 'regreso_jugador', 'regreso_marcas'],
    array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'regreso_%' ORDER BY name"), 'name'));
check('regreso.sql se puede aplicar otra vez sin error', [], Migraciones::aplicar('regreso.sql'));

$n = 0;
// Cuenta creada en $creado (sin otra actividad), con un aparato suscrito a push
$nuevo = function (int $creado, string $email = '', bool $push = true) use (&$n): int {
    $n++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, ultimo_ingreso) VALUES (?, ?, ?, ?, 1, ?)', [$email ?: 'rg' . $n . '@prueba.example', 'Productora ' . $n, 'x', $creado, $creado]);
    $j = Db::ultimoId();
    if ($push) {
        $ua = Push::generarPar();
        Db::q('INSERT INTO push_suscripciones (jugador_id, endpoint, p256dh, auth, idioma, categorias_json, creado, actualizado, visto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$j, 'https://fcm.googleapis.com/fcm/send/rg' . $n, Push::b64u($ua['publica']), Push::b64u(random_bytes(16)), 'es', json_encode(Push::CATEGORIAS), $creado, $creado, $creado]);
    }
    return $j;
};
$cola = fn(int $j) => Db::todas('SELECT categoria, clave, titulo, cuerpo, estado, motivo FROM push_cola WHERE jugador_id = ? ORDER BY id', [$j]);
$avisos = fn(int $j) => array_column(Db::todas('SELECT tipo FROM regreso_avisos WHERE jugador_id = ? ORDER BY id', [$j]), 'tipo');
// Lo que hace el cron de cada minuto: la tarea de Regreso y después la cola de Push
$cron = function (): void { Regreso::tarea(true); Push::procesar(); };
$jugar = function (int $j, int $t): void { Db::q('INSERT INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET actualizado = excluded.actualizado', [$j, '{}', $t]); };

// =====================================================================
titulo('A1) Día 1, 2 y 3 (horas desde que se creó la cuenta)');
$T0 = $ts('2026-11-02 12:00:00');   // lunes
$A = $nuevo($T0);
$reloj($T0 + 19 * 3600);
Regreso::tarea(true);
check('A las 19 h todavía nada', [], $avisos($A));
$reloj($T0 + 21 * 3600);   // martes 09:00
Regreso::tarea(true);
$c = $cola($A);
check('A las 21 h: aviso del día 1 en la cola (categoría etapa, obedece al interruptor "premio")', [1, 'etapa', 'rg:etapa:dia1', 'premio'], [count($c), $c[0]['categoria'] ?? null, $c[0]['clave'] ?? null, Push::interruptor('etapa')]);
check('El texto habla de su productora (nada de comprar)', [true, false], [str_contains(($c[0]['titulo'] ?? '') . ($c[0]['cuerpo'] ?? ''), 'productora') || str_contains(($c[0]['titulo'] ?? '') . ($c[0]['cuerpo'] ?? ''), 'equipo'), (bool) preg_match('/compr|oferta|\$/iu', $c[0]['cuerpo'] ?? '')]);
Regreso::tarea(true);
check('Otra corrida no lo repite', 1, count($cola($A)));
$r = Push::procesar();
Regreso::tarea(true);
check('Push lo envía (09:00 en Ecuador) y el seguimiento lo marca enviado', ['enviado', 'enviado'], [$cola($A)[0]['estado'], Db::valor('SELECT estado FROM regreso_avisos WHERE jugador_id = ?', [$A])]);
$jugar($A, $T0 + 23 * 3600);
$reloj($T0 + 24 * 3600);
Regreso::tarea(true);
check('Entró 2 h después: cuenta como "volvió"', true, Db::valor('SELECT volvio FROM regreso_avisos WHERE jugador_id = ?', [$A]) !== null);
// Día 2 mientras está jugando: no
$reloj($T0 + 45 * 3600); $jugar($A, $T0 + 44.5 * 3600);
Regreso::tarea(true);
check('Día 2 mientras está jugando (hace 30 min): no se avisa', ['dia1'], $avisos($A));
$reloj($T0 + 49 * 3600);
Diario::preparar();
Db::q('INSERT INTO diario_jugador (jugador_id, paso, ciclo, creado, actualizado) VALUES (?, 1, 1, ?, ?)', [$A, $T0, $T0]);
Regreso::tarea(true);
$c = $cola($A);
Push::procesar();
check('Día 2 (ya reclamó el día 1): "premio del día 2" y abre el premio diario', ['dia1', 'dia2', 'Tu premio del día 2 está listo'], [$avisos($A)[0] ?? null, $avisos($A)[1] ?? null, end($c)['titulo'] ?? null]);
$B = $nuevo($T0);
Db::q('INSERT INTO diario_reclamos (jugador_id, dia, ciclo, paso, creado) VALUES (?, ?, 1, 1, ?)', [$B, Push::dia($T0 + 49 * 3600), $T0 + 48 * 3600]);
Db::q('INSERT INTO regreso_avisos (jugador_id, tipo, clave, canal, estado, creado) VALUES (?, ?, ?, ?, ?, ?)', [$B, 'dia1', 'etapa:dia1', 'push', 'enviado', $T0 + 21 * 3600]);
Regreso::tarea(true);
check('Día 2 si ya reclamó el premio de hoy: no se avisa', ['dia1'], $avisos($B));
$reloj($T0 + 70 * 3600);
Regreso::tarea(true);
$c = $cola($A);
$av = $avisos($A);
check('Día 3: MegaVisión (el rival)', ['dia3', true], [end($av) ?: null, str_contains((end($c)['titulo'] ?? '') . (end($c)['cuerpo'] ?? ''), 'MegaVisión') || str_contains((end($c)['cuerpo'] ?? ''), 'rival')]);

titulo('A2) Nunca de noche (hora del jugador) y tope de 2 al día');
$C = $nuevo($T0);
Db::q('INSERT INTO regreso_jugador (jugador_id, zona) VALUES (?, ?)', [$C, 'Asia/Tokyo']);
$reloj($T0 + 22 * 3600);   // martes 10:00 en Ecuador = miércoles 00:00 en Tokio
Regreso::tarea(true);
Push::procesar();
$c = $cola($C);
check('10:00 en Ecuador pero medianoche en Tokio: se pospone (silencio) a las 08:00 de Tokio', ['pendiente', 'silencio', true],
    [$c[0]['estado'] ?? null, $c[0]['motivo'] ?? null, (int) Db::valor('SELECT enviar_desde FROM push_cola WHERE jugador_id = ?', [$C]) >= $ts('2026-11-04 08:00:00 Asia/Tokyo')]);
check('posponerHasta: Ecuador 10:00 → null; Tokio 00:00 → 08:00 Tokio', [null, (new DateTimeImmutable('2026-11-04 08:00:00', new DateTimeZone('Asia/Tokyo')))->getTimestamp()],
    [Regreso::posponerHasta($A, $T0 + 22 * 3600), Regreso::posponerHasta($C, $T0 + 22 * 3600)]);
$D = $nuevo($ts('2026-11-03 23:30:00') - 21 * 3600);
$reloj($ts('2026-11-03 23:30:00'));   // Ecuador de noche, sin zona: la del juego
Regreso::tarea(true); Push::procesar();
check('Sin zona y de noche en Ecuador (23:30): se pospone', 'silencio', $cola($D)[0]['motivo'] ?? null);
$E = $nuevo($T0);
$reloj($T0 + 22 * 3600);
Db::q('INSERT INTO push_jugador (jugador_id, dia, enviados_dia, ofertas_dia, ultimo_envio) VALUES (?, ?, 2, 0, ?)', [$E, Push::dia(), Push::ahora()]);
Regreso::tarea(true); Push::procesar();
check('Ya recibió 2 avisos hoy (PUSH_MAX_DIA=3): el de etapa espera a mañana (tope de 2)', ['pendiente', 'tope'], [$cola($E)[0]['estado'] ?? null, $cola($E)[0]['motivo'] ?? null]);
check('Zona no válida se ignora', [null, null, 'Europe/Madrid'], [Regreso::zonaValida('Mars/Base'), Regreso::zonaValida('../etc'), Regreso::zonaValida('Europe/Madrid')]);

titulo('A3) 3, 7 y 14 días sin entrar (y el recordatorio viejo no se repite)');
$T1 = $ts('2026-10-01 11:00:00');
$F = $nuevo($T1, 'ana.regreso@correo-prueba.com');
Db::q("INSERT INTO regreso_avisos (jugador_id, tipo, clave, canal, estado, creado) VALUES (?, 'dia3', 'etapa:dia3', 'push', 'enviado', ?)", [$F, $T1]);   // ya pasó la etapa
$reloj($T1 + 3 * 86400 + 3600);
$cron();
check('3 días: regreso3', ['dia3', 'regreso3'], $avisos($F));
check('El recordatorio viejo de Push (3 días) no se encola: lo cubre Regreso', 0, (function () use ($F) { Push::detectarRecordatorios(); return (int) Db::valor("SELECT COUNT(*) FROM push_cola WHERE jugador_id = ? AND clave LIKE 'recordatorio:%'", [$F]); })());
Regreso::tarea(true);
check('No se repite', 2, count($avisos($F)));
$reloj($T1 + 7 * 86400 + 3600);
$cron();
$c = $cola($F);
check('7 días: regreso7 con el regalo (100 créditos)', [true, true], [in_array('regreso7', $avisos($F), true), str_contains(end($c)['cuerpo'] ?? '', '100 créditos')]);
check('7 días: se abre la ausencia', 1, (int) Db::valor('SELECT COUNT(*) FROM regreso_ausencias WHERE jugador_id = ? AND volvio IS NULL', [$F]));
$log = is_file($TMP . '/correos.log') ? array_map(fn($l) => json_decode($l, true), file($TMP . '/correos.log', FILE_IGNORE_NEW_LINES)) : [];
$m = array_values(array_filter($log, fn($x) => ($x['para'] ?? '') === 'ana.regreso@correo-prueba.com'));
check('7 días: UN correo "Tu productora te extraña: regalo de créditos" con el enlace de baja', [1, 'Tu productora te extraña: regalo de créditos', true, true],
    [count($m), $m[0]['asunto'] ?? null, str_contains($m[0]['texto'] ?? '', '/api/regreso/baja?t='), str_contains($m[0]['html'] ?? '', 'No quiero recibir más correos como este')]);
Regreso::tarea(true);
$reloj($T1 + 8 * 86400 + 3600); Regreso::tarea(true);
$log2 = array_filter(array_map(fn($l) => json_decode($l, true), file($TMP . '/correos.log', FILE_IGNORE_NEW_LINES)), fn($x) => ($x['para'] ?? '') === 'ana.regreso@correo-prueba.com');
check('Al día siguiente no sale otro correo (uno por ausencia)', 1, count($log2));
$reloj($T1 + 14 * 86400 + 3600);
$cron();
$c = $cola($F);
check('14 días: regreso14 (el regalo creció: 150 créditos)', [true, true], [in_array('regreso14', $avisos($F), true), str_contains(end($c)['cuerpo'] ?? '', '150 créditos')]);
$G2 = $nuevo($T1, 'sin.correo@prueba.example');
$H = $nuevo($T1, 'baja@correo-prueba.com');
Db::q('INSERT INTO regreso_jugador (jugador_id, baja_correo) VALUES (?, ?)', [$H, $T1]);
Regreso::tarea(true);
$para = array_column(array_map(fn($l) => json_decode($l, true), file($TMP . '/correos.log', FILE_IGNORE_NEW_LINES)), 'para');
check('Correo que no existe (.example) o que se dio de baja: no se manda', [false, false], [in_array('sin.correo@prueba.example', $para, true), in_array('baja@correo-prueba.com', $para, true)]);
$reloj($T1 + 31 * 86400);
$antes = count($avisos($F));
Regreso::tarea(true);
check('30+ días: ya no se insiste por push', $antes, count($avisos($F)));

titulo('A4) «¡Volviste!»: regalo que da el servidor, una vez por ausencia');
$reloj($T1 + 9 * 86400 + 3600);   // volvamos a una ausencia de 9 días con otra cuenta
$V = $nuevo($T1, 'vuelve@correo-prueba.com');
Regreso::tarea(true);
check('Ausencia abierta a los 9 días', 1, (int) Db::valor('SELECT COUNT(*) FROM regreso_ausencias WHERE jugador_id = ? AND volvio IS NULL', [$V]));
$e = Regreso::estado($V, 'America/Bogota');
check('Al volver: ausencia de 9 días, regalo de 7 (100 créditos + $2.000 + repuestos), ventaja 3 días +25 % y doble experiencia',
    [9, 7, 100, 3, 3, 25, 2, true], [$e['ausencia']['dias'] ?? null, $e['ausencia']['nivel'] ?? null, $e['ausencia']['regalo']['creditos'] ?? null, count($e['ausencia']['regalo']['entregas'] ?? []),
     $e['ausencia']['ventaja']['dias'] ?? null, $e['ausencia']['ventaja']['pago_pct'] ?? null, $e['ausencia']['ventaja']['xp_mult'] ?? null, $e['ausencia']['oferta'] ?? null]);
check('Guarda la zona del aparato', 'America/Bogota', Db::valor('SELECT zona FROM regreso_jugador WHERE jugador_id = ?', [$V]));
$saldo = Monedero::saldo($V);
$id = (int) $e['ausencia']['id'];
$r = Regreso::reclamar($V, $id);
check('Reclamar: +100 créditos (libro "regreso"), 3 entregas (dinero, cables, baterías), ventaja hasta +3 días, oferta regreso_s (nunca pagó, $0,99)',
    [$saldo + 100, 3, 'regreso', true, 'regreso_s', 0.99, null],
    [Monedero::saldo($V), (int) Db::valor("SELECT COUNT(*) FROM entregas WHERE jugador_id = ? AND origen = ?", [$V, 'regreso:' . $id]), Db::valor('SELECT motivo FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$V]),
     ($r['ventaja']['hasta_ms'] ?? 0) === (Regreso::ahora() + 3 * 86400) * 1000, $r['oferta']['producto'] ?? null, $r['oferta']['precio'] ?? null, $r['ausencia']]);
check('Otra vez: 409 regreso_ya_reclamado (y no da más créditos)', [[409, 'regreso_ya_reclamado'], $saldo + 100], [falla(fn() => Regreso::reclamar($V, $id)), Monedero::saldo($V)]);
check('Una ausencia de otro jugador: 404 regreso_no_disponible', [404, 'regreso_no_disponible'], falla(fn() => Regreso::reclamar($A, $id)));
$e2 = Regreso::estado($V);
check('Después: sin ausencia pendiente, con la ventaja y la oferta abiertas', [null, true, 'regreso_s'], [$e2['ausencia'], $e2['ventaja'] !== null, $e2['oferta']['producto'] ?? null]);
check('Niveles: 7→7, 13→7, 14→14, 29→14, 30→30; créditos 100/150/250', [7, 7, 14, 14, 30, 100, 150, 250],
    [Regreso::nivel(7), Regreso::nivel(13), Regreso::nivel(14), Regreso::nivel(29), Regreso::nivel(30), Regreso::regalo(8)['creditos'], Regreso::regalo(20)['creditos'], Regreso::regalo(45)['creditos']]);
check('El aviso de la oferta no está en la tienda general', [false, false], [in_array('regreso_s', array_column(Catalogo::tienda()['productos'], 'id'), true), in_array('regreso_l', array_column(Catalogo::tienda()['productos'], 'id'), true)]);

titulo('A5) Oferta de regreso: una vez, solo para quien la tiene, según lo que compraba');
check('La puede comprar quien la tiene', [200, null], falla(fn() => Compras::exigirComprable($V, Catalogo::producto('regreso_s'))));
check('Otro jugador no (409 oferta_no_disponible)', [409, 'oferta_no_disponible'], falla(fn() => Compras::exigirComprable($A, Catalogo::producto('regreso_s'))));
check('Tampoco otra oferta de regreso distinta a la suya', [409, 'oferta_no_disponible'], falla(fn() => Compras::exigirComprable($V, Catalogo::producto('regreso_l'))));
Ganchos::emitir('compra_aprobada', ['compra_id' => 999, 'jugador_id' => $V, 'producto' => 'regreso_s', 'monto_usd' => 0.99, 'canal' => 'plux']);
check('Comprada: ya no se puede comprar otra vez y no sale en el estado', [[409, 'oferta_no_disponible'], null], [falla(fn() => Compras::exigirComprable($V, Catalogo::producto('regreso_s'))), Regreso::estado($V)['oferta']]);
$W = $nuevo($T1);
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('rgw', ?, 'creditos_1500', 9.99, 8.69, 1.30, 'pagado', ?, ?)", [$W, Regreso::ahora() - 30 * 86400, Regreso::ahora() - 30 * 86400]);
$X = $nuevo($T1);
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('rgx', ?, 'creditos_700', 4.99, 4.34, 0.65, 'pagado', ?, ?)", [$X, Regreso::ahora() - 30 * 86400, Regreso::ahora() - 30 * 86400]);
check('Según lo que compraba: nunca pagó → regreso_s ($0,99), compraba $4,99 → regreso_m, compraba $9,99 → regreso_l', ['regreso_s', 'regreso_m', 'regreso_l'], [Regreso::ofertaPara($A), Regreso::ofertaPara($X), Regreso::ofertaPara($W)]);
Ajustes::set('regreso_oferta', '0');
check('Oferta apagada en el Centro de Control: el estado no la muestra', null, Regreso::estado($W)['oferta']);
Ajustes::set('regreso_oferta', '1');

titulo('A6) Interruptores');
Regreso::guardarInterruptores(['dia1' => false, 'volviste' => false], 'prueba');
check('Apagar día 1 y «¡Volviste!» (auditoría regreso_interruptores)', [false, false, true, 1],
    [Regreso::activo('dia1'), Regreso::activo('volviste'), Regreso::activo('dia2'), (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'regreso_interruptores'")]);
$K = $nuevo(Regreso::ahora() - 21 * 3600);
Regreso::tarea(true);
check('Con el día 1 apagado no se encola', [], $avisos($K));
$Y = $nuevo($T1);
Regreso::tarea(true);
$eY = Regreso::estado($Y);
$idY = (int) Db::valor('SELECT id FROM regreso_ausencias WHERE jugador_id = ?', [$Y]);
check('«¡Volviste!» apagado: no se ofrece el regalo y reclamar → 409 regreso_apagado', [null, [409, 'regreso_apagado']], [$eY['ausencia'], falla(fn() => Regreso::reclamar($Y, $idY))]);
Regreso::guardarInterruptores(['dia1' => true, 'volviste' => true], 'prueba');
check('Encendidos otra vez: ahora sí se ofrece (dentro de los 7 días después de volver)', true, Regreso::estado($Y)['ausencia'] !== null);

titulo('A7) Liga y Duelos: faltan 2 h, con el puesto');
Duelos::preparar();
$tD = $ts('2026-11-30 21:45:00');   // fin de la temporada de noviembre: 01/12 00:00
$reloj($tD);
$d1 = $nuevo($T1); $d2 = $nuevo($T1); $d3 = $nuevo($T1);
foreach ([[$d1, 1100], [$d2, 1200], [$d3, 900]] as [$j, $rt]) Db::q('INSERT INTO duelo_ratings (temporada, jugador_id, servidor_id, rating, mejor, ganados, actualizado) VALUES (?, ?, 1, ?, ?, 1, ?)', ['2026-11', $j, $rt, $rt, $tD]);
Regreso::detectarCierres();
$c = $cola($d1);
check('Duelos a 2 h 15 min del cierre: "Faltan 2 h…" con el puesto 2 de su servidor (categoría cierre → interruptor duelo)', ['cierre', true, 'duelo'],
    [$c[0]['categoria'] ?? null, str_contains($c[0]['cuerpo'] ?? '', 'puesto 2'), Push::interruptor('cierre')]);
$reloj($ts('2026-11-30 20:00:00'));
check('Antes de la ventana no hay aviso', 0, Regreso::detectarCierres());
Liga::preparar();
$tL = $ts('2026-11-15 21:40:00');   // domingo: la semana cierra el lunes 16 a las 00:00
$reloj($tL);
$sem = Liga::semanaDe($tL)['id'];
Db::q('INSERT INTO liga_grupos (semana, liga, numero, creado) VALUES (?, 0, 1, ?)', [$sem, $tL]);
$g = Db::ultimoId();
$l1 = $nuevo($T1); $l2 = $nuevo($T1);
foreach ([[501, 300, $l1], [502, 900, $l2]] as [$as, $pt, $j]) {
    Db::q('INSERT INTO liga_participantes (semana, asociacion_id, grupo_id, liga, puntos, actualizado, nombre, siglas, color) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)', [$sem, $as, $g, $pt, $tL, 'Asoc ' . $as, 'A' . $as, '#fff']);
    Db::q('INSERT INTO liga_miembro_semana (semana, jugador_id, asociacion_id) VALUES (?, ?, ?)', [$sem, $j, $as]);
}
Regreso::detectarCierres();
check('Liga a 2 h 20 min del cierre: puesto 2 y puesto 1 de su grupo', [true, true], [str_contains($cola($l1)[0]['cuerpo'] ?? '', 'puesto 2'), str_contains($cola($l2)[0]['cuerpo'] ?? '', 'puesto 1')]);
Regreso::detectarCierres();
check('No se repite', 1, count($cola($l1)));

titulo('A8) Sin la tarea del servidor: se reconoce la ausencia al abrir el juego (sin falsos regalos)');
$reloj($ts('2026-11-20 10:00:00'));
$Q = $nuevo(Regreso::ahora() - 60 * 86400, '', false);
Db::q('INSERT INTO regreso_jugador (jugador_id, visto) VALUES (?, ?)', [$Q, Regreso::ahora() - 9 * 86400]);
$jugar($Q, Regreso::ahora() - 600);   // el juego recién abierto ya guardó
check('Visto hace 9 días (guardó hace 10 min): ausencia de 9 días', 9, Regreso::estado($Q)['ausencia']['dias'] ?? null);
$R2 = $nuevo(Regreso::ahora() - 60 * 86400, '', false);
$jugar($R2, Regreso::ahora() - 600);
check('Primera vez que el juego llama (sin "visto" anterior): no se inventa una ausencia', null, Regreso::estado($R2)['ausencia']);

titulo('A9) Baja del correo, plantilla y estadísticas');
$tok = substr(Regreso::enlaceBaja($F), -32);
check('Enlace de baja con código de 32 hex; porToken lo encuentra', [true, $F], [(bool) preg_match('/^[a-f0-9]{32}$/', $tok), (int) (Regreso::porToken($tok)['jugador_id'] ?? 0)]);
check('darBaja: válido (y auditado); código falso no', [true, false, true], [Regreso::darBaja($tok), Regreso::darBaja(str_repeat('0', 32)), Db::valor('SELECT baja_correo FROM regreso_jugador WHERE jugador_id = ?', [$F]) !== null]);
$pl = CorreoPlantillas::armar('regreso', 'en', ['nombre' => 'Ana', 'creditos' => 100, 'dias' => 8, 'enlace' => 'https://x.test/', 'baja' => 'https://x.test/api/regreso/baja?t=' . $tok]);
check('Plantilla (otro idioma: español hasta la traducción): asunto, créditos, días y enlace de baja', ['Tu productora te extraña: regalo de créditos', true, true, true],
    [$pl['asunto'], str_contains($pl['texto'], '100 créditos'), str_contains($pl['texto'], '8 días'), str_contains($pl['html'], 'api/regreso/baja?t=')]);
$s = Regreso::estadisticas(60);
check('Estadísticas: avisos por tipo, correos y ausencias', [true, true, true, true],
    [$s['tipos']['dia1']['enviados'] >= 1, $s['tipos']['dia1']['volvieron'] >= 1, $s['tipos']['correo7']['enviados'] >= 1, $s['ausencias']['reclamaron'] >= 1]);

// =====================================================================
titulo('B) Por HTTP: /api/regreso*, la baja del correo y el Centro de Control');
Push::fijarReloj(null); Regreso::fijarReloj(null);
$env = array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PHP_CLI_SERVER_WORKERS' => '3']);
$PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $RAIZ . '/server/tests/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/srv.log', 'a'], 2 => ['file', $TMP . '/srv.log', 'a']], $pp, $RAIZ, $env);
$listo = false;
for ($i = 0; $i < 80 && !$listo; $i++) { $listo = (bool) @fsockopen('127.0.0.1', $P); if (!$listo) usleep(100000); }
check('Arranca el servidor de prueba', true, $listo);

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_rg_' . $n . '_' . getmypid(); @unlink($this->jar); }
    public function __destruct() { @unlink($this->jar); }
    public function pedir(string $m, string $ruta, mixed $datos = null, array $cab = []): int {
        $ch = curl_init($this->base . $ruta);
        $this->cab = [];
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_CUSTOMREQUEST => $m, CURLOPT_HTTPHEADER => $cab, CURLOPT_TIMEOUT => 60,
            CURLOPT_HEADERFUNCTION => function ($c, $h) { $p = explode(':', $h, 2); if (count($p) === 2) $this->cab[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); }]);
        if ($datos !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($datos) ? $datos : http_build_query($datos));
        $this->cuerpo = (string) curl_exec($ch);
        $this->http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lugar = (string) ($this->cab['location'] ?? '');
        return $this->http;
    }
    public function api(string $m, string $ruta, ?array $j = null): array {
        $this->pedir($m, '/api' . $ruta, $j === null ? null : json_encode($j), ['Content-Type: application/json', 'X-Envivo: 1']);
        return json_decode($this->cuerpo, true) ?: [];
    }
    public function tiene(string $t): bool { return str_contains($this->cuerpo, $t); }
    public function csrf(): string { return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $this->cuerpo, $m) ? $m[1] : ''; }
    public function entrar(string $u, string $c): int { $this->pedir('GET', '/control/'); return $this->pedir('POST', '/control/', ['accion' => 'entrar', 'csrf' => $this->csrf(), 'usuario' => $u, 'clave' => $c]); }
    public function accion(array $d, string $desde = '/control/?t=push'): string {
        $this->pedir('GET', $desde);
        $d += ['csrf' => $this->csrf(), 'volver' => $desde];
        $this->pedir('POST', '/control/', $d);
        if ($this->http !== 303) return 'HTTP ' . $this->http;
        $this->pedir('GET', $this->lugar);
        return preg_match('/<div class="aviso aviso-(ok|error)" id="aviso"[^>]*>(.*?)<\/div>/s', $this->cuerpo, $m) ? $m[1] . ': ' . html_entity_decode($m[2], ENT_QUOTES) : 'sin aviso';
    }
}
$URL = 'http://127.0.0.1:' . $P;
$j = new Cli($URL, 'jugador');
$r = $j->api('POST', '/regreso', ['zona' => 'America/Guayaquil']);
check('POST /api/regreso sin sesión → 401 sesion_requerida', [401, 'sesion_requerida'], [$j->http, $r['codigo'] ?? null]);
$r = $j->api('POST', '/registro', ['email' => 'web.rg@correo-prueba.com', 'nombre' => 'Web RG', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
$WJ = (int) ($r['jugador']['id'] ?? 0);
check('Registro por HTTP', true, $WJ > 0);
$r = $j->api('POST', '/regreso', ['zona' => 'Europe/Madrid']);
check('Con sesión: 200, sin ausencia (cuenta nueva) y guarda la zona', [200, null, 'Europe/Madrid'], [$j->http, array_key_exists('ausencia', $r) ? $r['ausencia'] : 'falta', Db::valor('SELECT zona FROM regreso_jugador WHERE jugador_id = ?', [$WJ])]);
$j->pedir('POST', '/api/regreso', '{}', ['Content-Type: application/json']);
check('POST sin X-Envivo → 403', 403, $j->http);
Db::q('INSERT INTO regreso_ausencias (jugador_id, desde, detectado) VALUES (?, ?, ?)', [$WJ, time() - 15 * 86400, time() - 8 * 86400]);
$r = $j->api('POST', '/regreso', ['zona' => 'Europe/Madrid']);
check('Volvió tras 15 días: regalo de 14 (150 créditos)', [15, 14, 150], [$r['ausencia']['dias'] ?? null, $r['ausencia']['nivel'] ?? null, $r['ausencia']['regalo']['creditos'] ?? null]);
$aid = (int) ($r['ausencia']['id'] ?? 0);
$r = $j->api('POST', '/regreso/reclamar', ['id' => $aid]);
check('POST /api/regreso/reclamar: 200, 150 créditos, entregas, ventaja y oferta', [200, 150, 4, true, 'regreso_s'],
    [$j->http, $r['creditos_recibidos'] ?? null, count($r['entregas'] ?? []), isset($r['ventaja']['hasta_ms']), $r['oferta']['producto'] ?? null]);
$r = $j->api('POST', '/regreso/reclamar', ['id' => $aid]);
check('Otra vez → 409 regreso_ya_reclamado', [409, 'regreso_ya_reclamado'], [$j->http, $r['codigo'] ?? null]);
$r = $j->api('POST', '/regreso/reclamar', ['id' => 'x']);
check('id mal → 400', 400, $j->http);
$e = $j->api('GET', '/estado');
check('/api/estado trae las entregas del regreso para que el juego las aplique', true, count(array_filter($e['entregas'] ?? [], fn($x) => ($x['origen'] ?? '') === 'regreso:' . $aid)) === 4);
// Baja del correo
$tokW = substr(Regreso::enlaceBaja($WJ), -32);
$s = new Cli($URL, 'correo');
$s->pedir('GET', '/api/regreso/baja?t=' . $tokW);
check('GET de la baja: página con botón (no da de baja sola) y correo oculto', [200, true, true, null], [$s->http, $s->tiene('<form method="post"'), $s->tiene('w***@correo-prueba.com'), Db::valor('SELECT baja_correo FROM regreso_jugador WHERE jugador_id = ?', [$WJ])]);
$s->pedir('POST', '/api/regreso/baja', ['t' => $tokW]);
check('POST del formulario (sin cabecera del juego): 200 "Listo" y queda de baja', [200, true, true], [$s->http, $s->tiene('Listo'), Db::valor('SELECT baja_correo FROM regreso_jugador WHERE jugador_id = ?', [$WJ]) !== null]);
$s->pedir('GET', '/api/regreso/baja?t=' . str_repeat('a', 32));
check('Código que no existe → 404', 404, $s->http);
// Centro de Control
$cc = new Cli($URL, 'control');
$cc->entrar($USUARIO, $CLAVE);
$cc->pedir('GET', '/control/?t=push');
check('Pestaña Notificaciones: bloque de regreso con tabla e interruptores', [200, true, true, true], [$cc->http, $cc->tiene('id="panel-regreso"'), $cc->tiene('id="tabla-regreso"'), $cc->tiene('name="on_correo7"')]);
$on = []; foreach (Regreso::TIPOS as $k => $_) if ($k !== 'correo7') $on['on_' . $k] = '1';
$msg = $cc->accion(['accion' => 'regreso_guardar'] + $on);
Ajustes::set('__x', '1');   // limpia la caché de ajustes de este proceso
check('Apagar el correo desde el panel (aviso ok, Ajustes regreso_correo7 = 0)', [true, '0'], [str_starts_with($msg, 'ok:'), (string) Db::valor("SELECT valor FROM ajustes WHERE clave = 'regreso_correo7'")]);
$msg = $cc->accion(['accion' => 'regreso_guardar', 'csrf' => 'mal']);
check('Sin CSRF válido no cambia nada', '0', (string) Db::valor("SELECT valor FROM ajustes WHERE clave = 'regreso_correo7'"));
$err = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores de PHP en el servidor', '', trim((string) preg_replace('/^.*EN VIVO correo.*$\n?/m', '', $err)));

echo "\n----------------------------------------\nPruebas del regreso del jugador: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
