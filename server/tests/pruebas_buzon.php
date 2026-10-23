<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Buzón y códigos de regalo (server/src/Buzon.php, BuzonApi.php y la
// pestaña del Centro de Control server/public/control/lib/buzon.php), con base SQLite TEMPORAL:
//   A) la clase directa: adjuntos (validación y topes), enviar con ref (idempotente), reclamar (una sola vez, también
//      "a la vez"), entregas / créditos / inventario, vencimiento, leer y borrar, difusiones con filtros (servidor,
//      universo, lista, fechas, compradores, VIP, activos), "nuevos", retirar, códigos (uno por cuenta, por lote, usos,
//      fechas, desactivar), límite de intentos fallidos y estadísticas por etiqueta (compras después del canje).
//   B) por HTTP con php -S + router.php: /api/buzon*, /canjear.html y el Centro de Control (vista previa -> confirmar
//      -> enviar, CSRF, auditoría, lote con CSV).
// Uso:  php server/tests/pruebas_buzon.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_buzon_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
function puerto_libre(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; }
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre();
$USUARIO = 'jefe_buzon';
$CLAVE = 'Buz-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Buzon, Db, Fallo, Inventario, Limite, Monedero};

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
$PIDS = [];
register_shutdown_function(function () use (&$PIDS, $TMP) {
    foreach ($PIDS as $p) { proc_terminate($p); }
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});

Db::pdo();
Buzon::preparar();
$t0 = time();
// Servidores y universos (universos.sql ya está en migraciones): Quito (universo 1) y Guayaquil (universo 2)
Db::q("INSERT OR IGNORE INTO universos (id, nombre, creado, activo) VALUES (2, 'Universo Costa', ?, 1)", [$t0]);
Db::q("INSERT OR REPLACE INTO servidores (id, nombre, capacidad, abierto, creado, universo_id) VALUES (2, 'Servidor 2 · Guayaquil', 1000, 1, ?, 2)", [$t0]);
Db::q('UPDATE servidores SET universo_id = 1 WHERE id = 1');
$nuevo = function (string $nombre, int $servidor = 1, int $creado = 0, ?int $ultimo = null) use ($t0): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, ultimo_ingreso) VALUES (?, ?, ?, ?, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $nombre)) . '@prueba.example', $nombre, password_hash('ClaveBuena1', PASSWORD_BCRYPT), $creado ?: $t0, $servidor, $ultimo ?? $t0]);
    return Db::ultimoId();
};
$A = $nuevo('Ana Live'); $B = $nuevo('Beto Stream'); $C = $nuevo('Caro Guayaquil', 2, $t0 - 40 * 86400, $t0 - 20 * 86400);
$Dban = $nuevo('Dani Baneado'); Db::q("UPDATE jugadores SET estado = 'baneado' WHERE id = ?", [$Dban]);

// =====================================================================
titulo('Adjuntos: validación y topes');
check('Lista vacía = sin premios', [], Buzon::normalizarAdjuntos([]));
check('Créditos, dinero, repuestos, equipo, refuerzo, personal y reparar', [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 50], ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000],
    ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3], ['tipo' => 'item', 'item' => 'cam_pro', 'cantidad' => 1],
    ['tipo' => 'refuerzo', 'item' => 'seguro_evento', 'cantidad' => 1, 'nivel' => null, 'eventos' => 1], ['tipo' => 'personal', 'item' => 'camarografo', 'cantidad' => 4], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
    Buzon::normalizarAdjuntos([['tipo' => 'creditos', 'cantidad' => 50], ['tipo' => 'dinero', 'cantidad' => '5000'], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3],
        ['tipo' => 'item', 'item' => 'cam_pro'], ['tipo' => 'refuerzo', 'item' => 'seguro_evento'], ['tipo' => 'personal', 'item' => 'camarografo', 'cantidad' => 4], ['tipo' => 'reparar_todo']]));
check('Tipo desconocido -> 400 adjunto_invalido', [400, 'adjunto_invalido'], falla(fn() => Buzon::normalizarAdjuntos([['tipo' => 'dinero_real', 'cantidad' => 1]])));
check('Más de 5.000 créditos en un premio -> 400', [400, 'adjunto_invalido'], falla(fn() => Buzon::normalizarAdjuntos([['tipo' => 'creditos', 'cantidad' => 5001]])));
check('Cantidad 0 o negativa -> 400', [[400, 'adjunto_invalido'], [400, 'adjunto_invalido']], [falla(fn() => Buzon::normalizarAdjuntos([['tipo' => 'dinero', 'cantidad' => 0]])), falla(fn() => Buzon::normalizarAdjuntos([['tipo' => 'dinero', 'cantidad' => '-5']]))]);
check('Equipo que no existe -> 400', [400, 'adjunto_invalido'], falla(fn() => Buzon::normalizarAdjuntos([['tipo' => 'item', 'item' => 'nave_espacial']])));
check('Más de 8 premios -> 400', [400, 'adjunto_invalido'], falla(fn() => Buzon::normalizarAdjuntos(array_fill(0, 9, ['tipo' => 'dinero', 'cantidad' => 1]))));
check('Nombres de los premios', ['50 créditos', '$5.000 del juego', '3 × Cables de repuesto'], [Buzon::nombreAdjunto(['tipo' => 'creditos', 'item' => '-', 'cantidad' => 50]),
    Buzon::nombreAdjunto(['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000]), Buzon::nombreAdjunto(['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3])]);

// =====================================================================
titulo('Enviar a un jugador, leer, reclamar (una sola vez) y borrar');
$m1 = Buzon::enviar($A, 'Perdón por la caída', "Se cayó el servidor 20 minutos.\nAquí va una compensación.", [['tipo' => 'creditos', 'cantidad' => 40], ['tipo' => 'dinero', 'cantidad' => 3000], ['tipo' => 'item', 'item' => 'cam_pro']], ['tipo' => 'compensacion', 'ref' => 'caida:2026-10-23']);
check('Enviar devuelve el id', true, is_int($m1) && $m1 > 0);
check('El mismo ref otra vez no duplica (null)', null, Buzon::enviar($A, 'Perdón por la caída', '', [['tipo' => 'creditos', 'cantidad' => 40]], ['ref' => 'caida:2026-10-23']));
check('Sin título -> 400 titulo_vacio', [400, 'titulo_vacio'], falla(fn() => Buzon::enviar($A, '   ')));
check('A un jugador que no existe -> 404', [404, 'jugador_no_existe'], falla(fn() => Buzon::enviar(99999, 'Hola')));
$aviso = Buzon::enviar($A, 'Bienvenida', 'Solo un aviso');
$l = Buzon::listar($A);
check('Lista: 2 mensajes, 2 sin leer, 1 por reclamar', [2, 2, 1], [count($l['mensajes']), $l['sin_leer'], $l['por_reclamar']]);
$mj = current(array_filter($l['mensajes'], fn($x) => $x['id'] === $m1));
check('Mensaje: remitente EN VIVO Tycoon, tipo, 3 premios con nombre, reclamable, vence en 30 días', ['EN VIVO Tycoon', 'compensacion', 3, '40 créditos', true, 30 * 86400],
    [$mj['remitente'], $mj['tipo'], count($mj['adjuntos']), $mj['adjuntos'][0]['nombre'], $mj['reclamable'], abs($mj['vence_seg'] - 30 * 86400) < 120 ? 30 * 86400 : $mj['vence_seg']]);
$r = Buzon::leer($A, $aviso);
check('Leer el aviso: estado leido, 1 sin leer', ['leido', 1], [$r['mensaje']['estado'], $r['sin_leer']]);
check('Borrar el aviso (no tiene regalo) -> ya no sale', [true, 1], [Buzon::borrar($A, $aviso)['borrado'] === $aviso, count(Buzon::listar($A)['mensajes'])]);
check('Borrar uno con regalo sin reclamar -> 409 mensaje_con_regalo', [409, 'mensaje_con_regalo'], falla(fn() => Buzon::borrar($A, $m1)));
check('Leer el mensaje de otro jugador -> 404', [404, 'mensaje_no_existe'], falla(fn() => Buzon::leer($B, $m1)));
$antes = Monedero::saldo($A);
$r = Buzon::reclamar($A, $m1);
check('Reclamar: +40 créditos (libro motivo buzon), entrega de $3.000, cámara al inventario', [false, $antes + 40, 1, 'dinero', 3000, 'buzon:' . $m1, 1, 'cam_pro', 'buzon'],
    [$r['ya_reclamado'], $r['creditos'], count($r['entregas']), $r['entregas'][0]['tipo'], $r['entregas'][0]['cantidad'], $r['entregas'][0]['origen'], count($r['equipos']), $r['equipos'][0]['item'], $r['equipos'][0]['origen']]);
check('El libro de créditos cuadra con el saldo', Monedero::saldo($A), (int) Db::valor('SELECT SUM(cambio) FROM movimientos_creditos WHERE jugador_id = ?', [$A]));
check('La entrega le llega al juego por /api/estado (Monedero::entregas) y el equipo por el inventario', [true, true],
    [(bool) array_filter(Monedero::entregas($A), fn($x) => $x['origen'] === 'buzon:' . $m1), (bool) array_filter(Inventario::deJugador($A), fn($x) => $x['item'] === 'cam_pro')]);
$r2 = Buzon::reclamar($A, $m1);
check('Reclamar otra vez: ok, ya_reclamado, sin entregas ni créditos nuevos (idempotente)', [true, true, [], $antes + 40], [$r2['ok'], $r2['ya_reclamado'], $r2['entregas'], $r2['creditos']]);
check('Solo 1 movimiento de créditos y 1 entrega de ese mensaje', [1, 1], [(int) Db::valor("SELECT COUNT(*) FROM movimientos_creditos WHERE ref = ?", ['buzon:' . $m1]), (int) Db::valor("SELECT COUNT(*) FROM entregas WHERE origen = ?", ['buzon:' . $m1])]);
check('Ahora sí se puede borrar', true, Buzon::borrar($A, $m1)['borrado'] === $m1);
check('Reclamar un aviso sin regalo -> 409 sin_regalo', [409, 'sin_regalo'], falla(fn() => Buzon::reclamar($A, (int) Buzon::enviar($A, 'Solo texto'))));
// Cuenta bloqueada: no reclama
$mb = Buzon::enviar($Dban, 'Hola', '', [['tipo' => 'creditos', 'cantidad' => 5]]);
check('Cuenta bloqueada no puede reclamar -> 403', [403, 'cuenta_baneada'], falla(fn() => Buzon::reclamar($Dban, $mb)));

titulo('Vencimiento');
$mv = Buzon::enviar($B, 'Regalo que vence', '', [['tipo' => 'dinero', 'cantidad' => 100]], ['dias' => 2]);
Buzon::fijarReloj($t0 + 3 * 86400);
check('Vencido: ya no sale en la lista ni cuenta como por reclamar', [false, 0], [(bool) array_filter(Buzon::listar($B)['mensajes'], fn($x) => $x['id'] === $mv), Buzon::resumen($B)['por_reclamar']]);
check('Reclamar un vencido -> 410 mensaje_vencido', [410, 'mensaje_vencido'], falla(fn() => Buzon::reclamar($B, $mv)));
Buzon::fijarReloj($t0 + 40 * 86400);
check('Limpieza: borra los vencidos hace más de 30 días', true, Buzon::limpiar() >= 1 && !Db::valor('SELECT 1 FROM buzon WHERE id = ?', [$mv]));
Buzon::fijarReloj(null);

titulo('Reclamar a la vez (dos procesos): se entrega UNA vez');
$mc = Buzon::enviar($B, 'Doble toque', '', [['tipo' => 'creditos', 'cantidad' => 7]]);
$script = $TMP . '/reclamar.php';
file_put_contents($script, '<?php putenv("ENVIVO_CONFIG=' . $TMP . '/config.env"); $_SERVER["REMOTE_ADDR"] = "10.0.0.9"; require ' . var_export(dirname(__DIR__) . '/src/arranque.php', true) . '; '
    . 'usleep(random_int(0, 2000)); $r = \EnVivo\Buzon::reclamar((int) $argv[1], (int) $argv[2]); echo $r["ya_reclamado"] ? "ya" : "nuevo";');
$procs = [];
for ($i = 0; $i < 4; $i++) { $pr = proc_open(['php', $script, (string) $B, (string) $mc], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pp); $procs[] = [$pr, $pp[1], $pp[2]]; }
$salidas = [];
foreach ($procs as [$pr, $o, $e2]) { $salidas[] = trim(stream_get_contents($o)) . trim(stream_get_contents($e2)); proc_close($pr); }
sort($salidas);
check('4 reclamos simultáneos: 1 "nuevo" y 3 "ya"', ['nuevo', 'ya', 'ya', 'ya'], $salidas);
check('…y un solo movimiento de 7 créditos', 1, (int) Db::valor('SELECT COUNT(*) FROM movimientos_creditos WHERE ref = ?', ['buzon:' . $mc]));

titulo('Reclamar todo');
Buzon::enviar($B, 'Uno', '', [['tipo' => 'creditos', 'cantidad' => 1]]);
Buzon::enviar($B, 'Dos', '', [['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2]]);
Buzon::enviar($B, 'Tres (aviso)');
$r = Buzon::reclamarTodo($B);
check('Reclama los 2 con regalo; 1 crédito y 1 entrega de baterías', [2, 1, 1, 0], [count($r['reclamados']), $r['creditos_recibidos'], count($r['entregas']), $r['por_reclamar']]);
check('Otra vez: nada', [], Buzon::reclamarTodo($B)['reclamados']);

// =====================================================================
titulo('Difusiones con filtros');
$cnt = fn(array $f) => Buzon::contarDestinatarios(Buzon::normalizarFiltro($f));
check('Todos (sin el baneado): 3', 3, $cnt(['alcance' => 'todos']));
check('Servidor 2: 1 · universo 1: 2 · universo 2: 1', [1, 2, 1], [$cnt(['alcance' => 'servidor', 'servidor_id' => '2']), $cnt(['alcance' => 'universo', 'universo_id' => '1']), $cnt(['alcance' => 'universo', 'universo_id' => 2])]);
check('Activos en 7 días: 2 (Caro entró hace 20)', 2, $cnt(['alcance' => 'todos', 'activos_dias' => '7']));
check('Registrados hasta hace 30 días: solo Caro', 1, $cnt(['alcance' => 'todos', 'hasta' => date('Y-m-d', $t0 - 30 * 86400)]));
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('tk1', ?, 'creditos_700', 9.99, 8.69, 1.30, 'pagado', ?, ?)", [$B, $t0 - 100, $t0 - 100]);
check('Solo compradores: 1 · solo VIP: 0', [1, 0], [$cnt(['alcance' => 'todos', 'compradores' => '1']), $cnt(['alcance' => 'todos', 'vip' => '1'])]);
check('Lista por id y correo', 2, $cnt(['alcance' => 'lista', 'lista' => $A . ", caro.guayaquil@prueba.example\n"]));
check('Lista con alguien que no existe -> 400 filtro_invalido', [400, 'filtro_invalido'], falla(fn() => Buzon::normalizarFiltro(['alcance' => 'lista', 'lista' => 'nadie@x.example'])));
check('Servidor que no existe -> 400', [400, 'filtro_invalido'], falla(fn() => Buzon::normalizarFiltro(['alcance' => 'servidor', 'servidor_id' => '77'])));
$r = Buzon::difundir(['tipo' => 'evento', 'titulo' => 'Fin de semana doble', 'cuerpo' => 'Gracias por jugar', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 1000]], 'filtro' => ['alcance' => 'universo', 'universo_id' => 1], 'nuevos' => true, 'dias' => 7], 'control:prueba');
check('Difusión al universo 1 con "nuevos": 2 destinatarios y queda en la auditoría', [2, 1], [$r['destinatarios'], (int) Db::valor("SELECT COUNT(*) FROM auditoria WHERE accion = 'buzon_difusion'")]);
check('Le llegó a Ana y no a Caro (otro universo)', [true, false], [(bool) Db::valor('SELECT 1 FROM buzon WHERE envio_id = ? AND jugador_id = ?', [$r['envio_id'], $A]), (bool) Db::valor('SELECT 1 FROM buzon WHERE envio_id = ? AND jugador_id = ?', [$r['envio_id'], $C])]);
$E = $nuevo('Eva Nueva');
check('Una jugadora nueva del universo 1 lo recibe al abrir su buzón (y una sola vez)', [1, 1], [count(array_filter(Buzon::listar($E)['mensajes'], fn($x) => $x['titulo'] === 'Fin de semana doble')),
    count(array_filter(Buzon::listar($E)['mensajes'], fn($x) => $x['titulo'] === 'Fin de semana doble'))]);
$F = $nuevo('Fede Costa', 2);
check('Un nuevo del universo 2 no lo recibe', 0, count(array_filter(Buzon::listar($F)['mensajes'], fn($x) => $x['titulo'] === 'Fin de semana doble')));
check('Destinatarios del envío se actualiza (3)', 3, (int) Db::valor('SELECT destinatarios FROM buzon_envios WHERE id = ?', [$r['envio_id']]));
Buzon::reclamar($A, (int) Db::valor('SELECT id FROM buzon WHERE envio_id = ? AND jugador_id = ?', [$r['envio_id'], $A]));
check('Retirar: se quita de los 2 sin reclamar (Ana ya lo reclamó)', 2, Buzon::retirarEnvio($r['envio_id'], 'control:prueba'));
check('Retirar otra vez -> 409', [409, 'envio_retirado'], falla(fn() => Buzon::retirarEnvio($r['envio_id'], 'control:prueba')));
$G = $nuevo('Gabi Tarde');
check('Retirado: a los nuevos ya no les llega', 0, count(array_filter(Buzon::listar($G)['mensajes'], fn($x) => $x['titulo'] === 'Fin de semana doble')));
check('Difusión sin título -> 400', [400, 'titulo_vacio'], falla(fn() => Buzon::difundir(['titulo' => '', 'filtro' => ['alcance' => 'todos']], 'x')));
check('Difusión con vencimiento de 400 días -> 400', [400, 'vence_invalido'], falla(fn() => Buzon::difundir(['titulo' => 'x', 'dias' => 400, 'filtro' => ['alcance' => 'todos']], 'x')));

// =====================================================================
titulo('Códigos de regalo');
$c1 = Buzon::crearCodigo(['codigo' => 'bienvenido-2026', 'titulo' => 'Regalo de bienvenida', 'adjuntos' => [['tipo' => 'creditos', 'cantidad' => 25], ['tipo' => 'dinero', 'cantidad' => 2000]], 'usos_max' => 2, 'etiqueta' => 'Dimitry_TV'], 'control:prueba');
check('Crear: normaliza (BIENVENIDO2026) y la etiqueta en minúsculas', ['BIENVENIDO2026', 'dimitry_tv', 2], [$c1['codigo'], $c1['etiqueta'], (int) $c1['usos_max']]);
check('Repetido -> 409 codigo_repetido', [409, 'codigo_repetido'], falla(fn() => Buzon::crearCodigo(['codigo' => 'BIENVENIDO 2026', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 1]]], 'x')));
check('Sin premio -> 400 · con tilde -> 400', [[400, 'adjunto_invalido'], [400, 'codigo_formato']], [falla(fn() => Buzon::crearCodigo(['codigo' => 'NADA1'], 'x')),
    falla(fn() => Buzon::crearCodigo(['codigo' => 'AÑO2026', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 1]]], 'x'))]);
$r = Buzon::canjear($A, ' bienvenido 2026 ');
check('Canjear (con espacios y minúsculas): el premio llega al buzón (tipo codigo)', [true, 'BIENVENIDO2026', 'codigo', 'Regalo de bienvenida', true], [$r['ok'], $r['codigo'], $r['mensaje']['tipo'], $r['mensaje']['titulo'], $r['mensaje']['reclamable']]);
check('Uno por cuenta -> 409 codigo_ya_usado', [409, 'codigo_ya_usado'], falla(fn() => Buzon::canjear($A, 'BIENVENIDO2026')));
Buzon::canjear($B, 'BIENVENIDO2026');
check('Usos máximos (2) -> el tercero 409 codigo_agotado', [409, 'codigo_agotado'], falla(fn() => Buzon::canjear($C, 'BIENVENIDO2026')));
check('Usos = 2 y 2 canjes anotados con la etiqueta', [2, 2], [(int) Db::valor('SELECT usos FROM buzon_codigos WHERE id = ?', [$c1['id']]), (int) Db::valor("SELECT COUNT(*) FROM buzon_canjes WHERE etiqueta = 'dimitry_tv'")]);
$c2 = Buzon::crearCodigo(['codigo' => 'PRONTO1', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 1]], 'desde' => date('Y-m-d', $t0 + 3 * 86400)], 'x');
$c3 = Buzon::crearCodigo(['codigo' => 'VIEJO1', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 1]], 'hasta' => date('Y-m-d', $t0 - 2 * 86400)], 'x');
check('Todavía no empieza -> 409 codigo_pronto · vencido -> 410 codigo_vencido', [[409, 'codigo_pronto'], [410, 'codigo_vencido']], [falla(fn() => Buzon::canjear($C, 'PRONTO1')), falla(fn() => Buzon::canjear($C, 'VIEJO1'))]);
Buzon::activarCodigo((int) $c2['id'], false, 'x');
check('Desactivado -> 404 codigo_invalido', [404, 'codigo_invalido'], falla(fn() => Buzon::canjear($C, 'PRONTO1')));
$lote = Buzon::generarLote(['titulo' => 'Regalo de Dimitry', 'adjuntos' => [['tipo' => 'creditos', 'cantidad' => 10]], 'etiqueta' => 'dimitry_tv'], 50, 'dimi', 'control:prueba');
check('Lote: 50 códigos únicos con el prefijo DIMI + 8, de 1 uso', [50, 50, true, 50], [count($lote['codigos']), count(array_unique($lote['codigos'])), (bool) array_filter($lote['codigos'], fn($c) => (bool) preg_match('/^DIMI[A-HJ-NP-Z2-9]{8}$/', $c)) && count(array_filter($lote['codigos'], fn($c) => !preg_match('/^DIMI[A-HJ-NP-Z2-9]{8}$/', $c))) === 0,
    (int) Db::valor('SELECT COUNT(*) FROM buzon_codigos WHERE lote = ? AND usos_max = 1', [$lote['lote']])]);
Buzon::canjear($C, $lote['codigos'][0]);
check('Del mismo lote, la misma cuenta no canjea otro -> 409 codigo_lote_usado', [409, 'codigo_lote_usado'], falla(fn() => Buzon::canjear($C, $lote['codigos'][1])));
check('El código ya usado no sirve para otra cuenta -> 409 codigo_agotado', [409, 'codigo_agotado'], falla(fn() => Buzon::canjear($E, $lote['codigos'][0])));
check('Otra cuenta sí canjea otro del lote', true, Buzon::canjear($E, $lote['codigos'][1])['ok']);
check('Desactivar el lote entero', 50, Buzon::activarCodigo((int) Db::valor('SELECT id FROM buzon_codigos WHERE codigo = ?', [$lote['codigos'][2]]), false, 'control:prueba', true));
check('Cantidad de lote fuera de rango -> 400', [400, 'cantidad_invalida'], falla(fn() => Buzon::generarLote(['adjuntos' => [['tipo' => 'dinero', 'cantidad' => 1]]], 1001, 'X', 'x')));

titulo('Límite de intentos (fuerza bruta)');
$_SERVER['REMOTE_ADDR'] = '10.0.0.50';
$H = $nuevo('Hugo Prueba');
$res = [];
for ($i = 0; $i < Buzon::FALLOS_CUENTA + 1; $i++) $res[] = falla(fn() => Buzon::canjear($H, 'NOEXISTE' . $i))[1];
check(Buzon::FALLOS_CUENTA . ' códigos equivocados -> el siguiente 429 limite_intentos (aunque sea bueno)', ['codigo_invalido', 'limite_intentos', 'limite_intentos'],
    [$res[0], $res[Buzon::FALLOS_CUENTA], falla(fn() => Buzon::canjear($H, 'BIENVENIDO2026'))[1]]);
check('Los fallos quedan anotados aunque el error deshaga la transacción', Buzon::FALLOS_CUENTA, (int) Db::valor("SELECT COALESCE(SUM(total), 0) FROM intentos WHERE clave = ?", ['canje:j:' . $H]));
$_SERVER['REMOTE_ADDR'] = '10.0.0.51';
$I = $nuevo('Iris Otra');
check('Otra cuenta desde otra conexión no está bloqueada', [404, 'codigo_invalido'], falla(fn() => Buzon::canjear($I, 'NOEXISTE')));
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

titulo('Estadísticas por etiqueta (programa de influencers)');
// Ana canjeó BIENVENIDO2026 y compra DESPUÉS (cuenta); Beto compró ANTES (no cuenta) y otra vez después
$tc = (int) Db::valor('SELECT creado FROM buzon_canjes WHERE jugador_id = ? LIMIT 1', [$A]);
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('tk2', ?, 'creditos_700', 4.99, 4.34, 0.65, 'pagado', ?, ?)", [$A, $tc + 60, $tc + 60]);
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('tk3', ?, 'creditos_700', 9.99, 8.69, 1.30, 'pagado', ?, ?)", [$B, $tc + 120, $tc + 120]);
Db::q("INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado) VALUES ('tk4', ?, 'creditos_700', 9.99, 8.69, 1.30, 'pendiente', ?)", [$A, $tc + 200]);
$est = current(array_filter(Buzon::estadisticas(), fn($x) => $x['etiqueta'] === 'dimitry_tv'));
check('dimitry_tv: 51 códigos, 4 canjes, 4 jugadores, 2 compraron después, 2 compras, $14.98 (lo pagado antes y lo pendiente no cuentan)',
    [51, 4, 4, 2, 2, 14.98], [$est['codigos'], $est['canjes'], $est['jugadores'], $est['compradores'], $est['compras'], $est['ingresos']]);

// =====================================================================
titulo('B) Por HTTP: /api/buzon*, /canjear.html y el Centro de Control');
$env = array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PHP_CLI_SERVER_WORKERS' => '3']);
$PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $RAIZ . '/server/tests/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/srv.log', 'a'], 2 => ['file', $TMP . '/srv.log', 'a']], $pp, $RAIZ, $env);
$listo = false;
for ($i = 0; $i < 80 && !$listo; $i++) { $listo = (bool) @fsockopen('127.0.0.1', $P); if (!$listo) usleep(100000); }
check('Arranca el servidor de prueba', true, $listo);
Db::q('DELETE FROM intentos');

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_buzon_' . $n . '_' . getmypid(); @unlink($this->jar); }
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
    public function accion(array $d, string $desde = '/control/?t=buzon'): string {
        $this->pedir('GET', $desde);
        $d += ['csrf' => $this->csrf(), 'volver' => $desde];
        $this->pedir('POST', '/control/', $d);
        if ($this->http !== 303) return 'HTTP ' . $this->http;
        $this->pedir('GET', $this->lugar);
        return preg_match('/<div class="aviso aviso-(ok|error)" id="aviso"[^>]*>(.*?)<\/div>/s', $this->cuerpo, $m) ? $m[1] . ': ' . html_entity_decode($m[2], ENT_QUOTES) : 'sin aviso';
    }
}
$B_URL = 'http://127.0.0.1:' . $P;
$j = new Cli($B_URL, 'jugador');
check('Sin sesión: GET /api/buzon -> 401 sesion_requerida', [401, 'sesion_requerida'], [($r = $j->api('GET', '/buzon')) ? $j->http : 0, $r['codigo'] ?? null]);
$r = $j->api('POST', '/registro', ['email' => 'web@prueba.example', 'nombre' => 'Web Uno', 'clave' => 'ClaveBuena1']);
$W = (int) ($r['jugador']['id'] ?? 0);
check('Registro por HTTP', true, $W > 0);
Buzon::enviar($W, 'Hola por HTTP', 'Texto <b>con</b> etiquetas', [['tipo' => 'creditos', 'cantidad' => 15]]);
$r = $j->api('GET', '/buzon');
check('GET /api/buzon: 1 mensaje (y el de bienvenida no), 1 sin leer, 1 por reclamar; el texto va tal cual (lo escapa el juego)', [200, 1, 1, 1, 'Texto <b>con</b> etiquetas'],
    [$j->http, count($r['mensajes'] ?? []), $r['sin_leer'] ?? null, $r['por_reclamar'] ?? null, $r['mensajes'][0]['cuerpo'] ?? null]);
$mid = (int) ($r['mensajes'][0]['id'] ?? 0);
$j->pedir('POST', '/api/buzon/reclamar', json_encode(['id' => $mid]), ['Content-Type: application/json']);
check('POST sin X-Envivo -> 403', 403, $j->http);
check('GET /api/buzon/resumen', [200, 1, 1], [($r = $j->api('GET', '/buzon/resumen')) ? $j->http : 0, $r['sin_leer'] ?? null, $r['por_reclamar'] ?? null]);
check('POST /api/buzon/leer', ['leido', 0], [($r = $j->api('POST', '/buzon/leer', ['id' => $mid]))['mensaje']['estado'] ?? null, $r['sin_leer'] ?? null]);
$r = $j->api('POST', '/buzon/reclamar', ['id' => $mid]);
check('POST /api/buzon/reclamar: +15 créditos', [200, false, 15, 15], [$j->http, $r['ya_reclamado'] ?? null, $r['creditos_recibidos'] ?? null, $r['creditos'] ?? null]);
check('Otra vez: 200 ya_reclamado', [200, true, 15], [($r = $j->api('POST', '/buzon/reclamar', ['id' => $mid])) ? $j->http : 0, $r['ya_reclamado'] ?? null, $r['creditos'] ?? null]);
check('Sin id -> 400 falta_id · id ajeno -> 404', [[400, 'falta_id'], [404, 'mensaje_no_existe']], [[($r = $j->api('POST', '/buzon/reclamar', [])) ? $j->http : 0, $r['codigo'] ?? null],
    [($r = $j->api('POST', '/buzon/reclamar', ['id' => $m1])) ? $j->http : 0, $r['codigo'] ?? null]]);
$cw = Buzon::crearCodigo(['codigo' => 'WEB2026', 'titulo' => 'Regalo web', 'adjuntos' => [['tipo' => 'creditos', 'cantidad' => 5]], 'etiqueta' => 'web_test'], 'x');
$r = $j->api('POST', '/buzon/canjear', ['codigo' => 'web-2026', 'canal' => 'web']);
check('POST /api/buzon/canjear (canal web): mensaje en el buzón', [200, 'WEB2026', 1], [$j->http, $r['codigo'] ?? null, $r['por_reclamar'] ?? null]);
check('Canje anotado con canal web', 'web', (string) Db::valor('SELECT canal FROM buzon_canjes WHERE codigo_id = ?', [$cw['id']]));
check('Código vacío -> 400 falta_codigo', [400, 'falta_codigo'], [($r = $j->api('POST', '/buzon/canjear', ['codigo' => ' '])) ? $j->http : 0, $r['codigo'] ?? null]);
$cods = [];
for ($i = 0; $i < Buzon::FALLOS_CUENTA + 1; $i++) { $r = $j->api('POST', '/buzon/canjear', ['codigo' => 'MALO' . $i . 'XX']); $cods[] = $j->http; }
check('Fuerza bruta por HTTP: 404 … y después 429', [404, 429], [$cods[0], end($cods)]);
check('POST /api/buzon/reclamar_todo', [200, 1], [($r = $j->api('POST', '/buzon/reclamar_todo')) ? $j->http : 0, count($r['reclamados'] ?? [])]);
check('GET /api/buzon/leer -> 405', 405, ($j->api('GET', '/buzon/leer') || true) ? $j->http : 0);

// /canjear.html (página web)
$w = new Cli($B_URL, 'web');
$w->pedir('GET', '/canjear.html');
check('/canjear.html: 200, con la CSP del juego (solo scripts propios) y su script js/canjear.js', [200, true, true, false],
    [$w->http, str_contains($w->cab['content-security-policy'] ?? '', "script-src 'self'"), $w->tiene('src="/js/canjear.js"'), $w->tiene('<script>')]);
$w->pedir('GET', '/js/canjear.js');
check('/js/canjear.js se sirve', [200, true], [$w->http, $w->tiene('/api/buzon/canjear')]);

// Centro de Control
$cc = new Cli($B_URL, 'control');
check('Entrar al Centro de Control', 303, $cc->entrar($USUARIO, $CLAVE));
$cc->pedir('GET', '/control/?t=buzon');
check('Pestaña "Buzón y códigos": 200, activa, con KPIs, formulario, envíos, códigos y estadísticas', [200, true, true, true, true, true, true],
    [$cc->http, $cc->tiene('data-pestana="buzon"'), $cc->tiene('id="kpi-codigos"'), $cc->tiene('id="form-difusion"'), $cc->tiene('id="tabla-envios"'), $cc->tiene('id="tabla-codigos"'), $cc->tiene('id="tabla-estadisticas"')]);
check('Todos los formularios POST llevan CSRF', true, (function () use ($cc) {
    preg_match_all('/<form method="post"[^>]*>(.*?)<\/form>/s', $cc->cuerpo, $m);
    return count($m[1]) >= 4 && count(array_filter($m[1], fn($f) => !preg_match('/name="csrf" value="[a-f0-9]{64}"/', $f))) === 0;
})());
$cc->pedir('POST', '/control/', ['accion' => 'buzon_previa', 'csrf' => 'mal', 'titulo' => 'x']);
check('Acción sin CSRF válido -> 403', 403, $cc->http);
$antesEnv = (int) Db::valor('SELECT COUNT(*) FROM buzon_envios');
$srvW = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$W]);
$av = $cc->accion(['accion' => 'buzon_previa', 'tipo' => 'compensacion', 'remitente' => 'EN VIVO Tycoon', 'titulo' => 'Compensación <script>', 'cuerpo' => "Línea 1\nLínea 2",
    'adj_tipo' => ['creditos', 'dinero', ''], 'adj_item' => ['', '', ''], 'adj_cant' => ['20', '1500', ''], 'alcance' => 'servidor', 'servidor_id' => (string) $srvW, 'dias' => '10']);
check('Vista previa (no envía nada todavía)', ['ok: Revisa la vista previa y confirma el envío.', true, $antesEnv], [$av, $cc->tiene('id="panel-previa"'), (int) Db::valor('SELECT COUNT(*) FROM buzon_envios')]);
$nSrv1 = Buzon::contarDestinatarios(['alcance' => 'servidor', 'servidor_id' => $srvW]);
check('Vista previa: título escapado, cuántos jugadores, créditos en total, confirmación', [true, false, true, true, true],
    [$cc->tiene('Compensación &lt;script&gt;'), $cc->tiene('Compensación <script>'), (bool) preg_match('#id="previa-destinatarios">' . $nSrv1 . '<#', $cc->cuerpo), $cc->tiene(number_format(20 * $nSrv1, 0, ',', '.')), $cc->tiene('data-confirmar="¿Enviar')]);
$bid = preg_match('/name="borrador_id" value="(\d+)"/', $cc->cuerpo, $mm) ? (int) $mm[1] : 0;
check('Enviar sin marcar la casilla -> error y no envía', ['error: Marca la casilla de confirmación para enviar.', $antesEnv], [$cc->accion(['accion' => 'buzon_enviar', 'borrador_id' => $bid, 'destinatarios' => $nSrv1], '/control/?t=buzon&borrador=' . $bid), (int) Db::valor('SELECT COUNT(*) FROM buzon_envios')]);
$av = $cc->accion(['accion' => 'buzon_enviar', 'borrador_id' => $bid, 'destinatarios' => $nSrv1, 'confirmar' => '1'], '/control/?t=buzon&borrador=' . $bid);
check('Confirmar: enviado a los del servidor del jugador web y auditado por el usuario del panel', [true, $antesEnv + 1, 'control:' . $USUARIO],
    [str_starts_with($av, 'ok: Enviado'), (int) Db::valor('SELECT COUNT(*) FROM buzon_envios'), (string) Db::valor("SELECT quien FROM auditoria WHERE accion = 'buzon_difusion' ORDER BY id DESC LIMIT 1")]);
check('Enviar el mismo borrador otra vez -> error (no se manda dos veces)', true, str_starts_with($cc->accion(['accion' => 'buzon_enviar', 'borrador_id' => $bid, 'destinatarios' => $nSrv1, 'confirmar' => '1']), 'error: Ese mensaje ya se envió'));
$r = $j->api('GET', '/buzon');
check('El jugador web lo ve en su buzón con 2 premios', [true, 2], [(bool) array_filter($r['mensajes'] ?? [], fn($x) => $x['titulo'] === 'Compensación <script>'),
    count(current(array_filter($r['mensajes'] ?? [], fn($x) => $x['titulo'] === 'Compensación <script>'))['adjuntos'] ?? [])]);
check('Vista previa con error (lista con alguien que no existe) -> vuelve al formulario con el aviso', true,
    str_starts_with($cc->accion(['accion' => 'buzon_previa', 'titulo' => 'Lista', 'alcance' => 'lista', 'lista' => 'nadie@nada.example', 'dias' => '5']), 'error: No se encontraron'));
$av = $cc->accion(['accion' => 'buzon_codigo_crear', 'codigo' => 'panel-123', 'titulo' => 'Del panel', 'adj_tipo' => ['creditos'], 'adj_item' => [''], 'adj_cant' => ['30'], 'usos_max' => '100', 'etiqueta' => 'Tuka']);
check('Crear código desde el panel', ['ok: Código creado: PANEL123', 'tuka'], [$av, (string) Db::valor("SELECT etiqueta FROM buzon_codigos WHERE codigo = 'PANEL123'")]);
$av = $cc->accion(['accion' => 'buzon_codigo_lote', 'prefijo' => 'TUKA', 'cantidad' => '50', 'usos_max' => '1', 'titulo' => 'Regalo Tuka', 'adj_tipo' => ['dinero'], 'adj_item' => [''], 'adj_cant' => ['2500'], 'etiqueta' => 'tuka']);
$loteP = (string) Db::valor("SELECT lote FROM buzon_codigos WHERE codigo LIKE 'TUKA%' LIMIT 1");
check('Generar lote de 50 desde el panel: muestra los códigos', [true, 50, true], [str_contains($av, '50 códigos creados'), (int) Db::valor('SELECT COUNT(*) FROM buzon_codigos WHERE lote = ?', [$loteP]), $cc->tiene('id="lote-codigos"')]);
$cc->pedir('GET', '/control/?t=buzon&csv=lote&lote=' . $loteP);
check('CSV del lote: 51 líneas (cabecera + 50), text/csv', [200, true, 51], [$cc->http, str_starts_with($cc->cab['content-type'] ?? '', 'text/csv'), count(array_filter(explode("\n", $cc->cuerpo)))]);
$idP = (int) Db::valor("SELECT id FROM buzon_codigos WHERE codigo = 'PANEL123'");
check('Desactivar un código desde el panel', ['ok: Desactivado (1 código).', 0], [$cc->accion(['accion' => 'buzon_codigo_activo', 'codigo_id' => $idP, 'activo' => '0']), (int) Db::valor('SELECT activo FROM buzon_codigos WHERE id = ?', [$idP])]);
$envId = (int) Db::valor('SELECT MAX(id) FROM buzon_envios');
check('Retirar un envío desde el panel', true, str_starts_with($cc->accion(['accion' => 'buzon_retirar', 'envio_id' => $envId]), 'ok: Envío retirado'));
$cc->pedir('GET', '/control/?t=buzon&etiqueta=dimitry_tv');
check('Estadísticas en el panel: dimitry_tv con 2 compradores y $14,98', true, (bool) preg_match('#dimitry_tv</a></td><td>51</td><td>4</td><td>4</td><td>0</td><td>2</td><td>2</td><td>\$14,98</td>#', $cc->cuerpo));
check('Auditoría: difusión, código, lote, desactivar y retirar', [true, true, true, true, true], array_map(fn($a) => (bool) Db::valor('SELECT 1 FROM auditoria WHERE accion = ?', [$a]), ['buzon_difusion', 'buzon_codigo_crear', 'buzon_codigo_lote', 'buzon_codigo_desactivar', 'buzon_retirar']));

// Errores de PHP del servidor
$log = (string) @file_get_contents($TMP . '/php_errores.log') . (string) @file_get_contents($TMP . '/srv.log');
check('Sin errores ni avisos de PHP en el servidor', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO (api|control)/i', $log));
if ($FALLAS) echo substr($log, 0, 3000);

echo "\n----------------------------------------\nPruebas del buzón: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
