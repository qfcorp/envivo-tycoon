<?php
// SOLO PRUEBAS (nunca en el servidor del juego). "Invita a tu equipo" y "Productores Aliados"
// (server/src/Invitaciones.php, Aliados.php, InvitarApi.php, los ganchos en api_registro / Buzon::canjear / Visitas::armar y
// la pestaña "Invitar y aliados" del Centro de Control, server/public/control/lib/invitar.php), con base SQLite TEMPORAL:
//   A) clases directas: código p+base36, vincular al crear la cuenta (pack de bienvenida al buzón), autoinvitación, mismo aparato,
//      aparato repetido, misma conexión, cuenta vieja, invitador más nuevo, premios por ETAPAS solo cuando el amigo avanza
//      (capítulo 2, 3 días, asociación), idempotencia, metas 1/3/5/10 con el letrero dorado, apagado; creadores: crear con
//      validaciones, código en "Canjear código", uno por cuenta, propio, regalo uno por aparato, enlace ?ref=CREADOR, insignia en
//      la vitrina, créditos del mes (una vez), ventas por mes (Plux / PayPal / Google, solo pagadas y después del código),
//      porcentaje, marcar pagado (solo meses cerrados, sin tocar créditos) y postulaciones.
//   B) por HTTP con php -S + router.php: /api/registro con ref y creador, GET /api/invitar (sin y con sesión), vincular,
//      /api/aliados/postular, /aliados.html y el Centro de Control (pestaña, crear creador, marcar pagado, CSRF, apagar).
// Uso:  php server/tests/pruebas_invitar.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_inv_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
function puerto_libre(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; }
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre();
$USUARIO = 'jefe_inv';
$CLAVE = 'Inv-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\nSOPORTE_CORREO=soporte@prueba.example\nCORREO_REGISTRO=$TMP/correos.log\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '10.1.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Aliados, BlackFriday, Buzon, Db, Fallo, Invitaciones, Visitas};

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
// La limpieza va al FINAL de todo (después del correo a soporte que Correo::despues manda al terminar)
register_shutdown_function(function () use (&$PIDS, $TMP) {
    register_shutdown_function(function () use (&$PIDS, $TMP) {
        foreach ($PIDS as $p) { proc_terminate($p); }
        if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
        else exec('rm -rf ' . escapeshellarg($TMP));
    });
});

Db::pdo();
Invitaciones::preparar();
$num = 0;
$nuevo = function (string $nombre, ?int $creado = null) use (&$num): int {
    $num++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, ultimo_ingreso) VALUES (?, ?, ?, ?, 1, ?)',
        ['inv' . $num . '@prueba.example', $nombre, 'x', $creado ?? time(), time()]);
    return Db::ultimoId();
};
$ip = function (int $n): void { $_SERVER['REMOTE_ADDR'] = '10.2.' . intdiv($n, 250) . '.' . ($n % 250 + 1); };
$inst = fn(int $n) => str_pad(dechex($n), 32, 'a', STR_PAD_LEFT);
$buzon = fn(int $j, string $ref) => Db::fila('SELECT * FROM buzon WHERE jugador_id = ? AND ref = ?', [$j, $ref]);
$adj = fn(?array $m) => $m ? array_map(fn($a) => $a['tipo'] . ':' . $a['item'] . ':' . $a['cantidad'], json_decode((string) $m['adjuntos_json'], true)) : null;
$partida = function (int $j, int $cap): void {
    Db::q('INSERT INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET datos = excluded.datos', [$j, json_encode(['chapter' => $cap, 'day' => 5]), time()]);
};
$dias = function (int $j, int $n): void { for ($i = 0; $i < $n; $i++) Db::q('INSERT OR IGNORE INTO actividad (jugador_id, dia) VALUES (?, ?)', [$j, date('Y-m-d', time() - $i * 86400)]); };
$asoc = null;
$unirAsoc = function (int $j) use (&$asoc): void {
    if ($asoc === null) { Db::q("INSERT INTO asociaciones (servidor_id, nombre, nombre_clave, siglas, color, creado) VALUES (1, 'Los Directos', 'los directos', 'LDR', '#ff3b3b', ?)", [time()]); $asoc = Db::ultimoId(); }
    Db::q("INSERT OR IGNORE INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, 'socio', ?)", [$asoc, $j, time()]);
};

// =====================================================================
titulo('A1) Código de invitación y vincular al crear la cuenta');
$A = $nuevo('Ana Invita', time() - 10 * 86400);
check('Código p + id en base 36 (como js/compartir.js) y de vuelta', ['p' . base_convert((string) $A, 10, 36), $A, null, null], [Invitaciones::codigoDe($A), Invitaciones::jugadorDeCodigo(strtoupper(Invitaciones::codigoDe($A))), Invitaciones::jugadorDeCodigo('hola'), Invitaciones::jugadorDeCodigo('p')]);
$ip(1);
$B = $nuevo('Beto Nuevo');
$r = Invitaciones::alRegistrar($B, ['ref' => Invitaciones::codigoDe($A), 'instalacion' => $inst(1)]);
check('alRegistrar con ?ref=: invitación ok y pack de bienvenida', [true, 'ok', true], [$r['invitacion']['ok'] ?? null, $r['invitacion']['estado'] ?? null, $r['invitacion']['bienvenida'] ?? null]);
check('El pack llega al buzón del amigo: 3 cables, 3 baterías y $1.000 del juego', ['consumible:cable:3', 'consumible:battery:3', 'dinero:-:1000'], $adj($buzon($B, 'invitar:bienvenida')));
check('Quien invita NO gana nada solo porque el amigo instaló', 0, (int) Db::valor("SELECT COUNT(*) FROM buzon WHERE jugador_id = ? AND ref LIKE 'invitar:%'", [$A]));
check('Otra vez -> 409 invitacion_ya', [409, 'invitacion_ya'], falla(fn() => Invitaciones::vincular($B, Invitaciones::codigoDe($A), $inst(1))));
check('Invitarse a sí mismo -> 409 invitacion_propia', [409, 'invitacion_propia'], falla(fn() => Invitaciones::vincular($A, Invitaciones::codigoDe($A), null)));
check('Código que no es de nadie -> 404 invitacion_codigo', [404, 'invitacion_codigo'], falla(fn() => Invitaciones::vincular($B, 'pzzzzz', null)));
$Viejo = $nuevo('Cuenta Vieja', time() - 5 * 86400);
check('Cuenta de más de 3 días -> 409 invitacion_tarde', [409, 'invitacion_tarde'], falla(fn() => Invitaciones::vincular($Viejo, Invitaciones::codigoDe($A), null)));
check('El invitador no puede ser una cuenta más nueva -> invitacion_tarde', [409, 'invitacion_tarde'], falla(fn() => Invitaciones::vincular($Viejo, Invitaciones::codigoDe($B), null)));

titulo('A2) Antifraude: mismo aparato, aparato repetido, misma conexión');
// El invitador usó el aparato 50 (analítica); una cuenta nueva desde ese aparato = autoinvitación
Db::q("INSERT INTO analitica_instalaciones (instalacion, primer_t, primer_dia, ultimo_dia, plataforma, jugador_id) VALUES (?, ?, ?, ?, 'web', ?)", [$inst(50), time(), date('Y-m-d'), date('Y-m-d'), $A]);
$ip(50);
$C = $nuevo('Clon de Ana');
$r = Invitaciones::vincular($C, Invitaciones::codigoDe($A), $inst(50));
check('Mismo aparato que el invitador: no cuenta (mismo_aparato) y SIN pack', ['bloqueada', 'mismo_aparato', false, null], [$r['estado'], $r['motivo'], $r['bienvenida'], $buzon($C, 'invitar:bienvenida')]);
$ip(51);
$D = $nuevo('Dos Cuentas');
$r = Invitaciones::vincular($D, Invitaciones::codigoDe($A), $inst(1));
check('Aparato que ya usó otra invitación: no cuenta (aparato_repetido) y sin pack (uno por aparato)', ['bloqueada', 'aparato_repetido', false], [$r['estado'], $r['motivo'], $r['bienvenida']]);
$ip(60);
$E1 = $nuevo('Casa Uno'); $E2 = $nuevo('Casa Dos'); $E3 = $nuevo('Casa Tres');
$r1 = Invitaciones::vincular($E1, Invitaciones::codigoDe($A), $inst(61));
$r2 = Invitaciones::vincular($E2, Invitaciones::codigoDe($A), $inst(62));
$r3 = Invitaciones::vincular($E3, Invitaciones::codigoDe($A), $inst(63));
check('Misma conexión: 2 cuentan, la tercera no (misma_conexion)', ['ok', 'ok', 'bloqueada', 'misma_conexion'], [$r1['estado'], $r2['estado'], $r3['estado'], $r3['motivo']]);
check('Packs de bienvenida por conexión: como mucho 3 cada 30 días', [true, true, true], [$r1['bienvenida'], $r2['bienvenida'], $r3['bienvenida']]);
$E4 = $nuevo('Casa Cuatro');
$r4 = Invitaciones::vincular($E4, Invitaciones::codigoDe($B), $inst(64));
check('El cuarto pack desde la misma conexión ya no sale', false, $r4['bienvenida']);

titulo('A3) Premios por ETAPAS cuando el amigo avanza');
check('Sin avance: evaluar no da nada', 0, Invitaciones::evaluar($A));
$partida($B, 0);
check('Capítulo 1 todavía no cuenta', 0, Invitaciones::evaluar($A));
$partida($B, 1);
check('Llega al capítulo 2: 1 premio para quien invitó ($1.500 + 2 cables)', [1, ['dinero:-:1500', 'consumible:cable:2']], [Invitaciones::evaluar($A), $adj($buzon($A, 'invitar:etapa:' . $B . ':capitulo2'))]);
check('Otra vez: nada (idempotente)', 0, Invitaciones::evaluar($A));
$dias($B, 2);
check('2 días jugados: todavía no', 0, Invitaciones::evaluar($A));
$dias($B, 3);
check('3 días distintos: 10 créditos; ya es amigo activo', [1, ['creditos:-:10'], 1], [Invitaciones::evaluar($A) - 1, $adj($buzon($A, 'invitar:etapa:' . $B . ':dias3')), Invitaciones::activos($A)]);
check('Meta de 1 amigo activo: 20 créditos + $2.000', ['creditos:-:20', 'dinero:-:2000'], $adj($buzon($A, 'invitar:meta:1')));
$unirAsoc($B);
check('Entra a una asociación: $1.000 + 2 baterías', [1, ['dinero:-:1000', 'consumible:battery:2']], [Invitaciones::evaluar($A), $adj($buzon($A, 'invitar:etapa:' . $B . ':asociacion'))]);
$partida($C, 3); $dias($C, 5);
check('Una invitación que NO cuenta (mismo aparato) nunca da premios', [0, null], [Invitaciones::evaluar($A), $buzon($A, 'invitar:etapa:' . $C . ':capitulo2')]);
check('Los créditos de premio son del juego: llegan solo al reclamar el buzón (sin movimientos todavía)', 0, (int) Db::valor("SELECT COUNT(*) FROM movimientos_creditos WHERE jugador_id = ?", [$A]));

titulo('A4) Metas 3, 5 y 10 y el letrero dorado');
$L = $nuevo('Lider Equipo', time() - 20 * 86400);
$amigos = [];
for ($i = 0; $i < 10; $i++) {
    $ip(100 + $i);
    $f = $nuevo('Amigo ' . $i);
    Invitaciones::vincular($f, Invitaciones::codigoDe($L), $inst(100 + $i));
    $partida($f, 1); $dias($f, 3);
    $amigos[] = $f;
    if ($i === 3) { Invitaciones::evaluar($L); check('Con 4 activos: metas 1 y 3 entregadas, 5 todavía no', [1, 3], array_map('intval', array_column(Db::todas('SELECT meta FROM invitaciones_metas WHERE invitador_id = ? ORDER BY meta', [$L]), 'meta'))); }
}
Invitaciones::evaluar($L);
check('10 activos: las 4 metas, sin repetir', [1, 3, 5, 10], array_map('intval', array_column(Db::todas('SELECT meta FROM invitaciones_metas WHERE invitador_id = ? ORDER BY meta', [$L]), 'meta')));
check('Meta 10: distintivo exclusivo "letrero dorado"', [['clave' => 'letrero_dorado', 'nombre' => 'Letrero dorado de la sede']], Invitaciones::distintivos($L));
check('Meta 3 trae "reparar todo"', ['creditos:-:40', 'reparar_todo:-:1'], $adj($buzon($L, 'invitar:meta:3')));
check('La vitrina (Visitas::armar) muestra el letrero dorado', 'letrero_dorado', Visitas::armar($L, null)['distintivos'][0]['clave'] ?? null);
$e = Invitaciones::estado($L);
check('GET estado: 10 amigos, 10 activos, metas logradas, código y enlace', [10, 10, true, Invitaciones::codigoDe($L), true],
    [$e['total'], $e['activos'], $e['metas'][3]['logrado'], $e['codigo'], str_ends_with($e['enlace'], '/?ref=' . Invitaciones::codigoDe($L))]);
check('GET estado del amigo: quién lo invitó y con pack', ['Lider', true], [explode(' ', $e2 = Invitaciones::estado($amigos[0])['mi_invitacion']['invitador'])[0], Invitaciones::estado($amigos[0])['mi_invitacion']['bienvenida']]);
Ajustes::set('inv_activa', '0');
$Z = $nuevo('Llega Apagado');
check('Apagado: vincular -> 409 invitacion_apagada', [409, 'invitacion_apagada'], falla(fn() => Invitaciones::vincular($Z, Invitaciones::codigoDe($L), $inst(999))));
Ajustes::set('inv_activa', '1');

// =====================================================================
titulo('A5) Productores Aliados: crear códigos');
$Juan = $nuevo('Juan Creador', time() - 30 * 86400);
Buzon::crearCodigo(['codigo' => 'REGALO2026', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 100]]], 'prueba');
check('Código mal escrito -> codigo_formato', [400, 'codigo_formato'], falla(fn() => Aliados::guardar(['codigo' => 'P-', 'nombre' => 'X', 'nivel' => 1], null, 'prueba')));
check('Igual a un código del buzón -> codigo_repetido', [409, 'codigo_repetido'], falla(fn() => Aliados::guardar(['codigo' => 'regalo-2026', 'nombre' => 'X', 'nivel' => 1], null, 'prueba')));
check('Igual a la palabra de Black Friday -> codigo_repetido', [409, 'codigo_repetido'], falla(fn() => Aliados::guardar(['codigo' => 'BLACK-FRIDAY', 'nombre' => 'X', 'nivel' => 1], null, 'prueba')));
check('Se confunde con un código de jugador (P + 6) -> codigo_formato', [409, 'codigo_formato'], falla(fn() => Aliados::guardar(['codigo' => 'PEPE', 'nombre' => 'X', 'nivel' => 1], null, 'prueba')));
check('Nivel 7 -> aliado_nivel', [400, 'aliado_nivel'], falla(fn() => Aliados::guardar(['codigo' => 'PRODUCTOR-X', 'nombre' => 'X', 'nivel' => 7], null, 'prueba')));
check('Porcentaje 80 -> aliado_porcentaje', [400, 'aliado_porcentaje'], falla(fn() => Aliados::guardar(['codigo' => 'PRODUCTOR-X', 'nombre' => 'X', 'nivel' => 1, 'porcentaje' => '80'], null, 'prueba')));
$al = Aliados::guardar(['codigo' => 'productor-juan', 'nombre' => 'Juan Producciones', 'redes' => 'canal de Juan', 'nivel' => 2, 'cuenta' => 'inv' . ($Juan - 0) . '@prueba.example', 'activo' => true], null, 'control:prueba');
$al = Aliados::guardar(['codigo' => 'productor-juan', 'nombre' => 'Juan Producciones', 'redes' => 'canal de Juan', 'nivel' => 2, 'cuenta' => (string) $Juan, 'activo' => true], (int) $al['id'], 'control:prueba');
check('Creado: PRODUCTOR-JUAN (normalizado PRODUCTORJUAN), nivel 2, cuenta vinculada', ['PRODUCTOR-JUAN', 'PRODUCTORJUAN', 2, $Juan], [$al['codigo_ver'], $al['codigo'], (int) $al['nivel'], (int) $al['jugador_id']]);
check('Auditoría del panel', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion IN ('aliado_crear', 'aliado_cambiar') AND quien = 'control:prueba'"));
check('Otra cuenta para el mismo creador no; código repetido no', [[409, 'codigo_repetido'], [409, 'aliado_cuenta_usada']],
    [falla(fn() => Aliados::guardar(['codigo' => 'PRODUCTORJUAN', 'nombre' => 'Otro', 'nivel' => 1], null, 'prueba')), falla(fn() => Aliados::guardar(['codigo' => 'PRODUCTOR-OTRO', 'nombre' => 'Otro', 'nivel' => 1, 'cuenta' => (string) $Juan], null, 'prueba'))]);

titulo('A6) Usar el código: regalo pequeño (no descuento) y asociación');
$ip(200);
$U1 = $nuevo('Fan Uno');
$r = Buzon::canjear($U1, ' Productor-Juan ', 'juego', $inst(200));
check('"Canjear código" con PRODUCTOR-JUAN: ok, regalo y mensaje en el buzón', [true, true, 'PRODUCTOR-JUAN', ['dinero:-:2000', 'consumible:cable:2', 'consumible:battery:2']],
    [$r['ok'], $r['regalo'], $r['codigo'], $adj($buzon($U1, 'aliado:uso'))]);
check('Queda asociado (canal codigo)', [(int) $al['id'], 'codigo'], [(int) Db::valor('SELECT aliado_id FROM aliados_usos WHERE jugador_id = ?', [$U1]), (string) Db::valor('SELECT canal FROM aliados_usos WHERE jugador_id = ?', [$U1])]);
check('Segunda vez -> 409 aliado_ya', [409, 'aliado_ya'], falla(fn() => Buzon::canjear($U1, 'PRODUCTORJUAN', 'juego')));
check('El creador con su propio código -> 409 aliado_propio', [409, 'aliado_propio'], falla(fn() => Buzon::canjear($Juan, 'PRODUCTOR-JUAN', 'juego')));
$U2 = $nuevo('Fan Dos');
$r = Buzon::canjear($U2, 'productor-juan', 'web', $inst(200));
check('Otra cuenta en el MISMO aparato: queda asociada pero sin regalo (uno por aparato), con aviso', [false, 'aparato_repetido', true, []],
    [$r['regalo'], (string) Db::valor('SELECT motivo FROM aliados_usos WHERE jugador_id = ?', [$U2]), isset($r['mensaje']['id']), $adj($buzon($U2, 'aliado:uso'))]);
$ip(201);
$U3 = $nuevo('Fan Tres');
$r = Invitaciones::alRegistrar($U3, ['creador' => 'PRODUCTOR-JUAN', 'instalacion' => $inst(201)]);
check('Al crear la cuenta con el código: asociado (canal registro) y con regalo', [true, 'registro'], [$r['aliado']['regalo'] ?? null, (string) Db::valor('SELECT canal FROM aliados_usos WHERE jugador_id = ?', [$U3])]);
$ip(202);
$U4 = $nuevo('Fan Cuatro');
$r = Invitaciones::alRegistrar($U4, ['ref' => 'PRODUCTOR-JUAN', 'instalacion' => $inst(202)]);
check('Con el enlace ?ref=PRODUCTOR-JUAN: asociado (canal enlace)', ['enlace', null], [(string) Db::valor('SELECT canal FROM aliados_usos WHERE jugador_id = ?', [$U4]), $r['invitacion']]);
$U5 = $nuevo('Fan Cinco');
$r = Invitaciones::alRegistrar($U5, ['creador' => 'NO-EXISTE-NUNCA']);
check('Código de creador que no existe al registrarse: no rompe el registro', 'aliado_codigo', $r['aliado']['error'] ?? null);
Aliados::guardar(['codigo' => 'PRODUCTOR-BAJA', 'nombre' => 'De Baja', 'nivel' => 1, 'activo' => false], null, 'prueba');
check('Código de un creador inactivo -> el de siempre: codigo_invalido', [404, 'codigo_invalido'], falla(fn() => Buzon::canjear($U5, 'PRODUCTOR-BAJA', 'juego')));

titulo('A7) El creador en el juego: insignia y créditos del mes');
check('Insignia "Productor Aliado" en sus distintivos y en la vitrina', ['productor_aliado', 2, 'productor_aliado'],
    [Invitaciones::distintivos($Juan)[0]['clave'] ?? null, Invitaciones::distintivos($Juan)[0]['nivel'] ?? null, Visitas::armar($Juan, null)['distintivos'][0]['clave'] ?? null]);
check('Un fan no tiene insignia', [], Invitaciones::distintivos($U1));
check('Créditos del mes (nivel 2 = 200) llegan al buzón una vez', [200, 0, ['creditos:-:200']], [Aliados::entregarCreditosMes($Juan), Aliados::entregarCreditosMes($Juan), $adj($buzon($Juan, 'aliado:creditos:' . date('Y-m')))]);
check('Un jugador que no es creador no recibe créditos', 0, Aliados::entregarCreditosMes($U1));
$ej = Invitaciones::estado($Juan);
check('GET estado del creador: su código y cuántos lo usaron, sin montos de dinero', ['PRODUCTOR-JUAN', 4, false], [$ej['aliado']['codigo'] ?? null, $ej['aliado']['jugadores'] ?? null, (bool) preg_match('/monto|ventas|usd/i', json_encode($ej['aliado']))]);
check('GET estado del fan: el creador que apoya', 'Juan Producciones', Invitaciones::estado($U1)['creador']['nombre'] ?? null);

titulo('A8) Ventas por mes, porcentaje y marcar pagado');
$t0 = (int) Db::valor('SELECT creado FROM aliados_usos WHERE jugador_id = ?', [$U1]);
$mesPasado = date('Y-m', strtotime('first day of last month'));
$tPasado = strtotime($mesPasado . '-15 12:00:00');
Db::q('UPDATE aliados_usos SET creado = ? WHERE jugador_id IN (?, ?)', [$tPasado - 86400, $U1, $U2]);
$compra = function (int $j, float $total, string $canal, string $estado, int $t): void {
    Db::q('INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en, canal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [bin2hex(random_bytes(8)), $j, 'creditos_500', $total, round($total / 1.15, 2), round($total - $total / 1.15, 2), $estado, $t, $estado === 'pagado' ? $t : null, $canal]);
};
$compra($U1, 4.99, 'web_plux', 'pagado', $tPasado);
$compra($U1, 9.99, 'web_paypal', 'pagado', $tPasado + 60);
$compra($U2, 2.99, 'google_play', 'pagado', $tPasado + 120);
$compra($U2, 50.00, 'google_play', 'revertido', $tPasado + 180);   // revertida: no cuenta
$compra($U1, 100.00, 'web_plux', 'pagado', $tPasado - 5 * 86400);   // antes de usar el código: no cuenta
$compra($U3, 1.99, 'web_plux', 'pagado', time());                    // este mes
$m = Aliados::meses((int) $al['id']);
$mp = array_values(array_filter($m, fn($x) => $x['mes'] === $mesPasado))[0] ?? [];
check('Mes pasado: 3 compras pagadas después del código, 2 compradores, $17,97 (Plux 4,99 · PayPal 9,99 · Google 2,99)', [3, 2, 17.97, 4.99, 9.99, 2.99, true],
    [$mp['compras'] ?? null, $mp['compradores'] ?? null, $mp['ventas'] ?? null, $mp['plux'] ?? null, $mp['paypal'] ?? null, $mp['google'] ?? null, $mp['cerrado'] ?? null]);
check('Monto a pagar con el 10 % por defecto: $1,80', 1.8, $mp['monto'] ?? null);
check('Mes en curso: abierto ($1,99)', [date('Y-m'), 1.99, false], [$m[0]['mes'], $m[0]['ventas'], $m[0]['cerrado']]);
Aliados::guardarPctDefecto('12,5', 'control:prueba');
$l = array_values(array_filter(Aliados::lista(), fn($x) => (int) $x['id'] === (int) $al['id']))[0];
check('Lista: 12,5 % por defecto → por pagar $2,25 (17,97 × 12,5 %), 4 jugadores, 3 compradores', [12.5, 2.25, 4, 3, 19.96], [$l['pct'], $l['pendiente'], $l['jugadores'], $l['compradores'], $l['ventas']]);
Aliados::guardar(['codigo' => 'PRODUCTOR-JUAN', 'nombre' => 'Juan Producciones', 'nivel' => 2, 'cuenta' => (string) $Juan, 'porcentaje' => '15', 'creditos_mes' => '250', 'activo' => true], (int) $al['id'], 'control:prueba');
check('Porcentaje propio 15 % → $2,70', 2.7, array_values(array_filter(Aliados::meses((int) $al['id']), fn($x) => $x['mes'] === $mesPasado))[0]['monto']);
check('Marcar pagado el mes en curso -> aliado_mes_abierto', [409, 'aliado_mes_abierto'], falla(fn() => Aliados::marcarPagado((int) $al['id'], date('Y-m'), '', 'prueba')));
$movAntes = (int) Db::valor('SELECT COUNT(*) FROM movimientos_creditos');
$p = Aliados::marcarPagado((int) $al['id'], $mesPasado, 'transferencia 123', 'control:prueba');
check('Marcar pagado el mes pasado: guarda $2,70 (15 % de $17,97) y la nota', [2.7, 17.97, 15.0, 'transferencia 123'], [(float) $p['monto_usd'], (float) $p['ventas_usd'], (float) $p['porcentaje'], $p['nota']]);
check('Pagar NO mueve créditos ni nada del juego', $movAntes, (int) Db::valor('SELECT COUNT(*) FROM movimientos_creditos'));
check('Dos veces -> aliado_ya_pagado', [409, 'aliado_ya_pagado'], falla(fn() => Aliados::marcarPagado((int) $al['id'], $mesPasado, '', 'prueba')));
$l = array_values(array_filter(Aliados::lista(), fn($x) => (int) $x['id'] === (int) $al['id']))[0];
check('Lista: ya no queda por pagar; pagado $2,70', [0.0, 2.7], [$l['pendiente'], $l['pagado']]);
Aliados::anularPago((int) $al['id'], $mesPasado, 'control:prueba');
check('Quitar la marca (por error): vuelve a quedar por pagar', 2.7, array_values(array_filter(Aliados::lista(), fn($x) => (int) $x['id'] === (int) $al['id']))[0]['pendiente']);
Aliados::marcarPagado((int) $al['id'], $mesPasado, '', 'control:prueba');

titulo('A9) Postulaciones');
$_SERVER['REMOTE_ADDR'] = '10.9.9.1';
$r = Aliados::postular(['nombre' => 'Canal Prueba', 'correo' => 'Creador@Prueba.example', 'redes' => '@canalprueba', 'pais' => 'Ecuador', 'mensaje' => 'Hago transmisiones']);
check('Postulación válida: guardada (correo en minúsculas)', [true, 'creador@prueba.example'], [$r['ok'], (string) Db::valor('SELECT correo FROM aliados_postulaciones WHERE id = ?', [$r['id'] ?? 0])]);
check('Trampa para robots llena: "ok" sin guardar', [true, 1], [Aliados::postular(['nombre' => 'Robot', 'correo' => 'r@b.example', 'redes' => 'xxxx', 'sitio' => 'http://spam']) ['ok'], (int) Db::valor('SELECT COUNT(*) FROM aliados_postulaciones')]);
check('Correo malo -> email_invalido', [400, 'email_invalido'], falla(fn() => Aliados::postular(['nombre' => 'Otro', 'correo' => 'no', 'redes' => '@otro'])));

// =====================================================================
titulo('B) Por HTTP: registro con ref y creador, /api/invitar, postular, /aliados.html y el Centro de Control');
Db::q('DELETE FROM intentos');
$env = array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PHP_CLI_SERVER_WORKERS' => '3']);
$PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $RAIZ . '/server/tests/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/srv.log', 'a'], 2 => ['file', $TMP . '/srv.log', 'a']], $pp, $RAIZ, $env);
$listo = false;
for ($i = 0; $i < 80 && !$listo; $i++) { $listo = (bool) @fsockopen('127.0.0.1', $P); if (!$listo) usleep(100000); }
check('Arranca el servidor de prueba', true, $listo);

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_inv_' . $n . '_' . getmypid(); @unlink($this->jar); }
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
    public function accion(array $d, string $desde = '/control/?t=aliados'): string {
        $this->pedir('GET', $desde);
        $d += ['csrf' => $this->csrf(), 'volver' => $desde];
        $this->pedir('POST', '/control/', $d);
        if ($this->http !== 303) return 'HTTP ' . $this->http;
        $this->pedir('GET', $this->lugar);
        return preg_match('/<div class="aviso aviso-(ok|error)" id="aviso"[^>]*>(.*?)<\/div>/s', $this->cuerpo, $m) ? $m[1] . ': ' . html_entity_decode($m[2], ENT_QUOTES) : 'sin aviso';
    }
}
$URL = 'http://127.0.0.1:' . $P;
$h = new Cli($URL, 'anfitrion');
$h->api('POST', '/registro', ['email' => 'anfitrion@prueba.example', 'nombre' => 'Anfitriona Web', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
$H = (int) Db::valor("SELECT id FROM jugadores WHERE email = 'anfitrion@prueba.example'");
$r = (new Cli($URL, 'sin'))->api('GET', '/invitar');
check('GET /api/invitar sin sesión -> 401', 401, (new Cli($URL, 'sin2'))->pedir('GET', '/api/invitar'));
$r = $h->api('GET', '/invitar');
check('GET /api/invitar con sesión: código, 0 amigos, sin caché', [200, Invitaciones::codigoDe($H), 0, true], [$h->http, $r['codigo'] ?? null, $r['total'] ?? null, str_contains($h->cab['cache-control'] ?? '', 'no-store')]);
$g = new Cli($URL, 'invitado');
$r = $g->api('POST', '/registro', ['email' => 'invitado@prueba.example', 'nombre' => 'Invitado Web', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true,
    'ref' => Invitaciones::codigoDe($H), 'creador' => 'productor-juan', 'instalacion' => str_repeat('e', 32)]);
$G = (int) ($r['jugador']['id'] ?? 0);
check('Registro con ref y creador: la cuenta se crea igual', true, $G > 0);
$r = $g->api('GET', '/invitar');
check('El invitado ve quién lo invitó (con pack) y el creador que apoya', ['Anfitriona', true, 'PRODUCTOR-JUAN'], [explode(' ', (string) ($r['mi_invitacion']['invitador'] ?? ''))[0], $r['mi_invitacion']['bienvenida'] ?? null, $r['creador']['codigo'] ?? null]);
$r = $h->api('GET', '/invitar');
check('La anfitriona ve a su invitado (cuenta, sin etapas todavía)', [1, true, false], [$r['total'] ?? null, $r['amigos'][0]['cuenta'] ?? null, $r['amigos'][0]['etapas']['capitulo2'] ?? null]);
$v = new Cli($URL, 'vincula');
$v->api('POST', '/registro', ['email' => 'vincula@prueba.example', 'nombre' => 'Vincula Luego', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
$r = $v->api('POST', '/invitar/vincular', ['ref' => Invitaciones::codigoDe($H), 'instalacion' => str_repeat('f', 32)]);
check('POST /api/invitar/vincular (se perdió el ?ref= al registrarse): ok + estado', [200, true, 'Anfitriona'], [$v->http, $r['ok'] ?? null, explode(' ', (string) ($r['estado_invitar']['mi_invitacion']['invitador'] ?? ''))[0]]);
$r = $v->api('POST', '/invitar/vincular', ['ref' => Invitaciones::codigoDe($H)]);
check('Otra vez -> 409 invitacion_ya', [409, 'invitacion_ya'], [$v->http, $r['codigo'] ?? null]);
$v->pedir('POST', '/api/invitar/vincular', '{}', ['Content-Type: application/json']);
check('Sin X-Envivo -> 403', 403, $v->http);
$an = new Cli($URL, 'anonimo');
$r = $an->api('POST', '/aliados/postular', ['nombre' => 'Canal Web', 'correo' => 'web@prueba.example', 'redes' => '@canalweb']);
check('POST /api/aliados/postular sin cuenta: ok', [200, true], [$an->http, $r['ok'] ?? null]);
check('Correo a soporte (modo registro en pruebas)', true, str_contains((string) @file_get_contents($TMP . '/correos.log'), 'Canal Web'));
$an->pedir('GET', '/aliados.html');
check('/aliados.html: 200, CSP del juego, el formulario y sin marcas reales', [200, true, true, false],
    [$an->http, str_contains($an->cab['content-security-policy'] ?? '', "script-src 'self'"), $an->tiene('id="al-form"'), (bool) preg_match('/tiktok|youtube|twitch|kick\.com/i', $an->cuerpo)]);

$cc = new Cli($URL, 'panel');
check('Entrar al Centro de Control', 303, $cc->entrar($USUARIO, $CLAVE));
$cc->pedir('GET', '/control/?t=aliados');
check('Pestaña "Invitar y aliados": creadores, postulaciones e invitaciones', [200, true, true, true, true, true],
    [$cc->http, $cc->tiene('id="panel-aliados"'), $cc->tiene('PRODUCTOR-JUAN'), $cc->tiene('id="panel-postulaciones"'), $cc->tiene('web@prueba.example'), $cc->tiene('id="panel-invitaciones"')]);
check('Sin CSRF -> 403', 403, $cc->pedir('POST', '/control/', ['accion' => 'aliados_crear', 'csrf' => 'mal']));
$av = $cc->accion(['accion' => 'aliados_crear', 'codigo' => 'PRODUCTOR-ANA', 'nombre' => 'Ana en Vivo', 'redes' => '@ana', 'nivel' => '3', 'cuenta' => 'anfitrion@prueba.example', 'porcentaje' => '', 'creditos_mes' => '', 'activo' => '1']);
check('Crear creador desde el panel', 'ok: Creador PRODUCTOR-ANA creado.', $av);
check('Código repetido desde el panel -> aviso de error', true, str_starts_with($cc->accion(['accion' => 'aliados_crear', 'codigo' => 'PRODUCTOR-ANA', 'nombre' => 'Otra', 'nivel' => '1', 'activo' => '1']), 'error:'));
$idJuan = (int) $al['id'];
$cc->pedir('GET', '/control/?t=aliados&aliado=' . $idJuan);
check('Detalle del creador: meses, compras por canal y jugadores', [200, true, true, true], [$cc->http, $cc->tiene('id="tabla-aliado-meses"'), $cc->tiene($mesPasado), $cc->tiene('id="tabla-aliado-usos"')]);
$mesAntes = date('Y-m', strtotime('first day of -2 month'));
$av = $cc->accion(['accion' => 'aliados_pagado', 'id' => (string) $idJuan, 'mes' => $mesAntes, 'nota' => 'sin ventas'], '/control/?t=aliados&aliado=' . $idJuan);
check('Marcar pagado desde el panel (mes cerrado)', true, str_starts_with($av, 'ok: Anotado: ' . $mesAntes));
check('Marcar pagado el mes en curso desde el panel -> error', true, str_starts_with($cc->accion(['accion' => 'aliados_pagado', 'id' => (string) $idJuan, 'mes' => date('Y-m')], '/control/?t=aliados&aliado=' . $idJuan), 'error:'));
$av = $cc->accion(['accion' => 'aliados_inv', 'activa' => '0']);
Ajustes::set('prueba_releer', (string) microtime(true));
check('Apagar invitaciones desde el panel', [true, false], [str_contains($av, 'apagadas'), Invitaciones::activa()]);
$cc->accion(['accion' => 'aliados_inv', 'activa' => '1']);
$pid = (int) Db::valor("SELECT id FROM aliados_postulaciones WHERE estado = 'nueva' ORDER BY id LIMIT 1");
check('Marcar postulación revisada', 'ok: Postulación marcada como revisada.', $cc->accion(['accion' => 'aliados_postulacion', 'id' => (string) $pid]));
check('Auditoría del panel con quien control:', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'aliado_pagado' AND quien LIKE 'control:%'"));

$log = (string) @file_get_contents($TMP . '/php_errores.log') . (string) @file_get_contents($TMP . '/srv.log');
check('Sin errores ni avisos de PHP en el servidor', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO (api|control|invitaciones|aliados)/i', $log));
if ($FALLAS) echo substr($log, 0, 3000);

echo "\n----------------------------------------\nPruebas de invitar y aliados: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
