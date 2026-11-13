<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Eventos de todo el servidor y calendario de adviento
// (server/src/EventosServidor.php, EventosServidorApi.php y la pestaña "Eventos" del Centro de Control), con base SQLite TEMPORAL:
//   A) la clase directa con el reloj congelado (EventosServidor::fijarReloj, el mismo que pone ENVIVO_PRUEBA_AHORA): fechas del
//      calendario en hora de Ecuador (Carnaval y Semana Santa por la Pascua, Día de la Madre 2.º domingo de mayo, Copa Global
//      Femenina solo 2027, Viernes Negro = fechas de Black Friday, sin duplicarlo), encender/apagar, cambiar fechas, fichas
//      (diario una vez, eventos con tope de 12 por día, 4-5 estrellas +1, refs repetidas, juego en línea desde pase_xp con tope),
//      tienda (sin fichas, tope, decoración, créditos y entregas), objetivo común por servidor (meta fija, mitad y meta, una vez
//      por jugador, otro servidor no), premio después de terminar (7 días), adviento (hoy, recuperar ayer, perdido, futuro,
//      26 de diciembre, fichas a Navidad, apagado) y sin nombres reales en el calendario.
//   B) por HTTP con php -S + router.php: GET /api/eventos_servidor (sin y con sesión), POST sin sesión 401, sin X-Envivo 403,
//      diario, jugar, comprar, y el Centro de Control (pestaña Eventos, CSRF, apagar, cambiar fechas, vista previa, auditoría).
// Uso:  php server/tests/pruebas_eventos_servidor.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);
putenv('no_proxy=127.0.0.1,localhost'); putenv('NO_PROXY=127.0.0.1,localhost');

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_evs_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
function puerto_libre(): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; }
$P = (int) (getenv('P_APP') ?: 0) ?: puerto_libre();
$USUARIO = 'jefe_evs';
$CLAVE = 'Evs-' . bin2hex(random_bytes(5));
$HASH = password_hash($CLAVE, PASSWORD_BCRYPT);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P\nENVIVO_ADMIN_USUARIO=$USUARIO\nENVIVO_ADMIN_CLAVE_HASH=$HASH\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '10.3.0.1';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Db, EventosServidor as E, Fallo, Monedero};

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
E::preparar();
\EnVivo\Universos::preparar();   // servidores 1, 2 y 3
$ts = fn(string $f) => (new \DateTimeImmutable($f, new \DateTimeZone('America/Guayaquil')))->getTimestamp();
$dia = fn(array $w) => [date('Y-m-d', $w[0]), date('Y-m-d H:i:s', $w[1])];
$num = 0;
$nuevo = function (string $nombre, int $srv = 1) use (&$num): int {
    $num++;
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, ultimo_ingreso) VALUES (?, ?, ?, ?, ?, ?)',
        ['evs' . $num . '@prueba.example', $nombre, 'x', time(), $srv, time()]);
    return Db::ultimoId();
};
$releer = fn() => Ajustes::set('prueba_releer', (string) microtime(true));
Db::q('DELETE FROM intentos');

// =====================================================================
titulo('A1) Calendario (hora de Ecuador)');
check('Carnaval 2027: 31 ene – 10 feb (Pascua 28 mar)', ['2027-01-31', '2027-02-10 23:59:59'], $dia(E::ventanaBase('carnaval', 2027)));
check('Semana Santa 2027: 21 – 28 mar', ['2027-03-21', '2027-03-28 23:59:59'], $dia(E::ventanaBase('pascua', 2027)));
check('Día de la Madre 2027: semana del 2.º domingo de mayo (3 – 9 may)', ['2027-05-03', '2027-05-09 23:59:59'], $dia(E::ventanaBase('dia_madre', 2027)));
check('Día de la Madre 2028: 8 – 14 may', ['2028-05-08', '2028-05-14 23:59:59'], $dia(E::ventanaBase('dia_madre', 2028)));
check('Semana de Finales 2027: 24 may – 6 jun', ['2027-05-24', '2027-06-06 23:59:59'], $dia(E::ventanaBase('semana_finales', 2027)));
check('Copa Global Femenina 2027: 24 jun – 25 jul', ['2027-06-24', '2027-07-25 23:59:59'], $dia(E::ventanaBase('copa_femenina', 2027)));
check('Copa Global Femenina: no hay en 2026 ni en 2028', [null, null], [E::ventanaBase('copa_femenina', 2026), E::ventanaBase('copa_femenina', 2028)]);
check('Final Continental: desde 2027 (13 – 22 nov)', [null, ['2027-11-13', '2027-11-22 23:59:59']], [E::ventanaBase('final_continental', 2026), $dia(E::ventanaBase('final_continental', 2027))]);
check('Gran Final Nacional 2026: 4 – 13 dic', ['2026-12-04', '2026-12-13 23:59:59'], $dia(E::ventanaBase('gran_final_nacional', 2026)));
check('Fin de año 2026 cruza el año: 26 dic – 6 ene', ['2026-12-26', '2027-01-06 23:59:59'], $dia(E::ventanaBase('fin_anio', 2026)));
check('Viernes Negro 2026 = fechas de Black Friday (27 – 30 nov)', [\EnVivo\BlackFriday::config()['desde'], \EnVivo\BlackFriday::config()['hasta']], E::ventanaBase('viernes_negro', 2026));
check('Viernes Negro 2027: viernes después del 4.º jueves (26 – 29 nov)', ['2027-11-26', '2027-11-29 23:59:59'], $dia(E::ventanaBase('viernes_negro', 2027)));
check('Halloween 2026 ya no se programa (empieza en 2027)', null, E::ventanaBase('halloween', 2026));
check('Hora de Ecuador: Navidad empieza 1 dic 00:00 -05', $ts('2026-12-01 00:00:00'), E::ventanaBase('navidad', 2026)[0]);
$texto = json_encode([E::NOMBRES, E::COSMETICOS], JSON_UNESCAPED_UNICODE);
check('Sin nombres reales en el calendario', 0, preg_match('/FIFA|Libertadores|LigaPro|Sudamericana|Champions|Mundial|Copa Am[eé]rica|Black Friday/i', $texto));

titulo('A2) Fases, encender/apagar y fechas desde el panel');
E::fijarReloj($ts('2026-12-05 10:00:00'));
check('5 dic 2026: en curso Navidad y Gran Final Nacional', ['navidad-2026', 'gran_final_nacional-2026'], array_column(E::activas(), 'id'));
E::fijarReloj($ts('2026-11-28 10:00:00'));
check('28 nov 2026: el Viernes Negro está en curso pero no es evento de tienda (no duplica Black Friday)', [[], 'activa'], [array_column(E::activas(), 'id'), E::instancia('viernes_negro-2026')['fase']]);
$est = E::estado(null);
check('Estado sin sesión: el calendario trae Viernes Negro y Navidad; ningún evento con tienda', [true, true, []], [in_array('viernes_negro-2026', array_column($est['calendario'], 'id'), true), in_array('navidad-2026', array_column($est['calendario'], 'id'), true), $est['eventos']]);
E::fijarReloj($ts('2026-12-05 10:00:00'));
E::guardar(['eventos' => ['gran_final_nacional' => false]], 'prueba');
check('Apagar Gran Final Nacional: queda solo Navidad', ['navidad-2026'], array_column(E::activas(), 'id'));
E::guardar(['activo' => false], 'prueba');
check('Apagar todo: ningún evento', [], E::activas());
E::guardar(['activo' => true, 'eventos' => ['gran_final_nacional' => true]], 'prueba');
check('Auditoría eventos_servidor', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'eventos_servidor'"));
check('Fecha final antes de la inicial -> fecha_invalida', [400, 'fecha_invalida'], falla(fn() => E::guardar(['instancia' => ['id' => 'navidad-2026', 'desde' => $ts('2026-12-10'), 'hasta' => $ts('2026-12-09')]], 'prueba')));
check('Edición desconocida -> evento_desconocido', [400, 'evento_desconocido'], falla(fn() => E::guardar(['instancia' => ['id' => 'mundial-2026', 'desde' => 1, 'hasta' => 2]], 'prueba')));
E::fijarReloj($ts('2026-11-20 10:00:00'));
check('20 nov: Navidad todavía no empieza', 'pronto', E::instancia('navidad-2026')['fase']);
E::guardar(['instancia' => ['id' => 'navidad-2026', 'desde' => $ts('2026-11-19 00:00:00')]], 'prueba');
check('Adelantar la fecha de inicio desde el panel: en curso (para probar)', ['activa', true], [E::instancia('navidad-2026')['fase'], E::instancia('navidad-2026')['cambiada']]);
E::guardar(['instancia' => ['id' => 'navidad-2026', 'borrar' => true]], 'prueba');
check('Volver al calendario', ['pronto', false], [E::instancia('navidad-2026')['fase'], E::instancia('navidad-2026')['cambiada']]);

titulo('A3) Fichas');
E::fijarReloj($ts('2026-12-05 10:00:00'));
$A = $nuevo('Ana'); $B = $nuevo('Beto'); $C = $nuevo('Caro', 2);
$r = E::diario($A, 'navidad-2026');
check('Fichas del día: +5', [5, 5], [$r['fichas_recibidas'], E::saldo($A, 'navidad-2026')]);
check('Otra vez hoy -> evento_diario_hecho', [409, 'evento_diario_hecho'], falla(fn() => E::diario($A, 'navidad-2026')));
check('Evento que no está en curso -> evento_pronto', [409, 'evento_pronto'], falla(fn() => E::diario($A, 'fin_anio-2026')));
check('Evento que no existe -> evento_desconocido', [404, 'evento_desconocido'], falla(fn() => E::diario($A, 'mundial-2026')));
$r = E::jugar($A, [['ref' => '2026-12-05:1:10', 'estrellas' => 5], ['ref' => '2026-12-05:2:11', 'estrellas' => 2], ['ref' => 'mal ref!', 'estrellas' => 5]]);
check('Dos eventos (5⭐ y 2⭐) cuentan en los DOS eventos en curso; la ref mala no', [4, 5 + 3 + 2, 3 + 2], [$r['contados'], E::saldo($A, 'navidad-2026'), E::saldo($A, 'gran_final_nacional-2026')]);
$r = E::jugar($A, [['ref' => '2026-12-05:1:10', 'estrellas' => 5]]);
check('La misma ref otra vez no cuenta', 0, $r['contados']);
$lista = array_map(fn($i) => ['ref' => '2026-12-05:x:' . $i, 'estrellas' => 1], range(1, 15));
check('Más de 20 en un pedido -> evento_lista', [400, 'evento_lista'], falla(fn() => E::jugar($A, array_merge($lista, $lista))));
E::jugar($A, $lista);
check('Tope de 12 eventos por día y evento (de los 15 solo 10 más, 2 fichas c/u)', [12, 10 + 10 * 2], [(int) Db::valor("SELECT COUNT(*) FROM evs_fichas WHERE instancia = 'navidad-2026' AND jugador_id = ? AND motivo = 'evento'", [$A]), E::saldo($A, 'navidad-2026')]);
E::fijarReloj($ts('2026-12-06 09:00:00'));
check('Al día siguiente vuelven a contar', 1, E::jugar($A, [['ref' => '2026-12-06:1:1', 'estrellas' => 3]])['contados'] >= 1 ? 1 : 0);
// Juego en línea validado (libro de XP del Pase)
for ($i = 1; $i <= 7; $i++) Db::q('INSERT INTO pase_xp (jugador_id, temporada, fuente, ref, xp, dia, creado) VALUES (?, 1, ?, ?, 40, ?, ?)', [$B, $i % 2 ? 'liga' : 'duelo', 'intento:' . $i, '2026-12-06', $ts('2026-12-06 08:00:00') + $i]);
Db::q('INSERT INTO pase_xp (jugador_id, temporada, fuente, ref, xp, dia, creado) VALUES (?, 1, ?, ?, 40, ?, ?)', [$B, 'misiones', 'm:1', '2026-12-06', $ts('2026-12-06 08:30:00')]);
E::estado($B);
check('En línea: 7 intentos validados -> 5 con fichas (3 c/u, tope 5 por día); misiones no cuentan', [15, 7], [E::saldo($B, 'navidad-2026'), (int) Db::valor("SELECT COUNT(*) FROM evs_fichas WHERE instancia = 'navidad-2026' AND jugador_id = ? AND motivo = 'en_linea'", [$B])]);
E::estado($B);
check('Leer otra vez no las duplica', 15, E::saldo($B, 'navidad-2026'));

titulo('A4) Tienda de temporada');
$saldoA = E::saldo($A, 'navidad-2026');
check('Artículo que no existe -> evento_articulo', [404, 'evento_articulo'], falla(fn() => E::comprar($A, 'navidad-2026', 'cofre_sorpresa')));
$C0 = Monedero::saldo($B);
check('Sin fichas suficientes -> evento_sin_fichas', [409, 'evento_sin_fichas'], falla(fn() => E::comprar($B, 'navidad-2026', 'deco')));
$r = E::comprar($A, 'navidad-2026', 'cables');
check('Comprar 3 cables: −10 fichas, entrega consumible', [$saldoA - 10, 'consumible', 'cable', 3], [E::saldo($A, 'navidad-2026'), $r['entregas'][0]['tipo'] ?? null, $r['entregas'][0]['item'] ?? null, $r['entregas'][0]['cantidad'] ?? null]);
Db::q("INSERT INTO evs_fichas (instancia, jugador_id, servidor_id, motivo, ref, fichas, aporte, dia, creado) VALUES ('navidad-2026', ?, 1, 'ajuste', 'prueba:1', 500, 0, '2026-12-06', ?)", [$A, time()]);
$r = E::comprar($A, 'navidad-2026', 'deco');
check('Decoración exclusiva: evs_reno en cosmeticos', [['evs_reno'], true], [$r['cosmeticos'], in_array('evs_reno', E::estado($A)['cosmeticos'], true)]);
check('La decoración solo una vez -> evento_agotado', [409, 'evento_agotado'], falla(fn() => E::comprar($A, 'navidad-2026', 'deco')));
$cA = Monedero::saldo($A);
$r = E::comprar($A, 'navidad-2026', 'creditos');
check('10 créditos por fichas (nunca dinero real)', [$cA + 10, 10], [Monedero::saldo($A), $r['creditos']]);
E::comprar($A, 'navidad-2026', 'creditos');
check('Tope 2 -> evento_agotado', [409, 'evento_agotado'], falla(fn() => E::comprar($A, 'navidad-2026', 'creditos')));
$r = E::comprar($A, 'navidad-2026', 'seguro');
check('Refuerzo (seguro de evento) como entrega refuerzo', ['refuerzo', 'seguro_evento'], [$r['entregas'][0]['tipo'] ?? null, $r['entregas'][0]['item'] ?? null]);
$ev = E::estado($A)['eventos'][0];
check('Estado: comprados y nombres claros (sin azar)', [2, 1, 'Decoración: Reno luminoso en el techo'], [array_column($ev['tienda'], 'comprados', 'id')['creditos'], array_column($ev['tienda'], 'comprados', 'id')['deco'], array_column($ev['tienda'], 'nombre', 'id')['deco']]);
check('Oferta especial = producto que ya existe (pack_obra_m o null si el módulo no está)', true, in_array($ev['oferta'], ['pack_obra_m', null], true));
check('Auditoría de compras', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'evento_servidor_compra'"));

titulo('A5) Objetivo común por servidor');
E::guardar(['instancia' => ['id' => 'navidad-2026', 'meta' => 60]], 'prueba');
$m = E::estado($A)['eventos'][0]['meta'];
check('Meta fija 60 desde el panel; progreso del servidor 1 = 13 eventos de Ana + 5 en línea de Beto (×2)', [60, 23, 30], [$m['meta'], $m['progreso'], $m['hitos'][0]['en']]);
check('Antes de la mitad -> evento_meta_falta', [409, 'evento_meta_falta'], falla(fn() => E::reclamarMeta($A, 'navidad-2026', 'mitad')));
E::jugar($B, array_map(fn($i) => ['ref' => '2026-12-06:b:' . $i, 'estrellas' => 4], range(1, 12)));
E::estado($B);
$m = E::estado($A)['eventos'][0]['meta'];
check('Beto aporta (eventos + en línea): pasa la mitad', [true, 23 + 12], [$m['hitos'][0]['cumplido'], $m['progreso']]);
$r = E::reclamarMeta($A, 'navidad-2026', 'mitad');
check('Ana reclama la mitad: $3.000 y 3 baterías', ['dinero', 3000, 'consumible'], [$r['entregas'][0]['tipo'] ?? null, $r['entregas'][0]['cantidad'] ?? null, $r['entregas'][1]['tipo'] ?? null]);
check('Otra vez -> evento_meta_hecha', [409, 'evento_meta_hecha'], falla(fn() => E::reclamarMeta($A, 'navidad-2026', 'mitad')));
check('Beto (mismo servidor) también la reclama', true, E::reclamarMeta($B, 'navidad-2026', 'mitad')['ok']);
check('Caro (servidor 2) no llega -> evento_meta_falta', [409, 'evento_meta_falta'], falla(fn() => E::reclamarMeta($C, 'navidad-2026', 'mitad')));
check('Hito que no existe -> evento_hito', [404, 'evento_hito'], falla(fn() => E::reclamarMeta($A, 'navidad-2026', 'doble')));
E::guardar(['instancia' => ['id' => 'navidad-2026', 'meta' => 0]], 'prueba');
E::guardar(['instancia' => ['id' => 'gran_final_nacional-2026', 'meta' => 0]], 'prueba');
Db::q("DELETE FROM evs_metas WHERE instancia = 'navidad-2026'");
$mm = E::meta(E::instancia('navidad-2026'), 2);
check('Meta calculada (servidor chico): mínimo ' . E::META_MIN . ' y queda fija', [E::META_MIN, E::META_MIN], [$mm, (int) Db::valor("SELECT meta FROM evs_metas WHERE instancia = 'navidad-2026' AND servidor_id = 2")]);
// La meta completa de Gran Final y después de terminar
E::guardar(['instancia' => ['id' => 'gran_final_nacional-2026', 'meta' => 20]], 'prueba');
E::fijarReloj($ts('2026-12-15 10:00:00'));
$ev = array_values(array_filter(E::estado($B)['eventos'], fn($e) => $e['id'] === 'gran_final_nacional-2026'));
check('Terminado con premio pendiente: se sigue viendo para reclamar', [1, 'terminada'], [count($ev), $ev[0]['fase'] ?? null]);
check('Terminado: ya no se compra -> evento_terminado', [410, 'evento_terminado'], falla(fn() => E::comprar($B, 'gran_final_nacional-2026', 'cables')));
check('Terminado: el premio común sí se reclama (7 días)', true, E::reclamarMeta($B, 'gran_final_nacional-2026', 'meta')['ok']);
E::fijarReloj($ts('2026-12-21 10:00:00'));
check('Más de 7 días después -> evento_terminado', [410, 'evento_terminado'], falla(fn() => E::reclamarMeta($A, 'gran_final_nacional-2026', 'meta')));

titulo('A6) Calendario de adviento');
E::fijarReloj($ts('2026-11-30 12:00:00'));
check('30 nov: sin adviento', [null, [409, 'adviento_cerrado']], [E::estado($A)['adviento'], falla(fn() => E::adviento($A, 1))]);
E::fijarReloj($ts('2026-12-10 12:00:00'));
$adv = E::estado($A)['adviento'];
check('10 dic: 25 días, hoy = 10, ayer = recuperar, antes = perdido, después = futuro', [25, 'hoy', 'recuperar', 'perdido', 'futuro'],
    [count($adv['dias']), $adv['dias'][9]['estado'], $adv['dias'][8]['estado'], $adv['dias'][7]['estado'], $adv['dias'][10]['estado']]);
check('Día futuro -> adviento_pronto', [409, 'adviento_pronto'], falla(fn() => E::adviento($A, 11)));
check('Anteayer -> adviento_perdido (solo se recupera el de ayer)', [410, 'adviento_perdido'], falla(fn() => E::adviento($A, 8)));
$r = E::adviento($A, 10);
check('Día 10: reparar todo', ['reparar_todo', false], [$r['entregas'][0]['tipo'] ?? null, $r['recuperado']]);
check('Otra vez -> adviento_hecho', [409, 'adviento_hecho'], falla(fn() => E::adviento($A, 10)));
$r = E::adviento($A, 9);
check('Recuperar el de ayer (día 9: 3 cables)', [true, 'consumible', 3], [$r['recuperado'], $r['entregas'][0]['tipo'] ?? null, $r['entregas'][0]['cantidad'] ?? null]);
E::fijarReloj($ts('2026-12-15 12:00:00'));
$s0 = E::saldo($B, 'navidad-2026');
E::adviento($B, 15);
check('Día 15: 20 fichas al evento de Navidad', $s0 + 20, E::saldo($B, 'navidad-2026'));
E::guardar(['eventos' => ['navidad' => false]], 'prueba');
$r = E::adviento($B, 14);
check('Sin evento de Navidad: alquiler de lente igual; las fichas llegarían como dinero', 'refuerzo', $r['entregas'][0]['tipo'] ?? null);
E::fijarReloj($ts('2026-12-22 12:00:00'));
$r = E::adviento($B, 22);
check('Día 22 sin Navidad: 20 fichas = $2.000 del juego', ['dinero', 2000], [$r['entregas'][0]['tipo'] ?? null, $r['entregas'][0]['cantidad'] ?? null]);
E::guardar(['eventos' => ['navidad' => true]], 'prueba');
E::fijarReloj($ts('2026-12-26 09:00:00'));
$r = E::adviento($A, 25);
check('26 dic: todavía se recupera el 25 (estrella del adviento + 20 créditos)', [true, ['evs_estrella'], 20], [$r['recuperado'], $r['cosmeticos'], $r['creditos']]);
check('26 dic: el 26 no existe -> adviento_dia', [404, 'adviento_dia'], falla(fn() => E::adviento($A, 26)));
E::fijarReloj($ts('2026-12-27 09:00:00'));
check('27 dic: cerrado', [409, 'adviento_cerrado'], falla(fn() => E::adviento($A, 25)));
E::fijarReloj($ts('2026-12-05 09:00:00'));
E::guardar(['adviento' => false], 'prueba');
check('Adviento apagado desde el panel', [null, [409, 'adviento_cerrado']], [E::estado($A)['adviento'], falla(fn() => E::adviento($A, 5))]);
E::guardar(['adviento' => true], 'prueba');
check('Tabla especial: Ana primera en su servidor', [1, 'Ana', true], [E::tabla('navidad-2026', 1, $A)['top'][0]['puesto'] ?? 0, (string) (E::tabla('navidad-2026', 1, $A)['top'][0]['nombre'] ?? ''), (bool) (E::tabla('navidad-2026', 1, $A)['top'][0]['tu'] ?? false)]);
check('Suma de premios del adviento: créditos (55) y nada al azar', 55, array_sum(array_map(fn($d) => array_sum(array_map(fn($p) => $p['tipo'] === 'creditos' ? $p['cantidad'] : 0, $d)), E::ADVIENTO)));

// =====================================================================
titulo('B) Por HTTP: /api/eventos_servidor* y el Centro de Control');
E::fijarReloj(null);
Db::q('DELETE FROM intentos');
// "Adelantar la fecha" como Black Friday: la edición de Navidad empieza hoy (hora real) desde el panel
$hoy0 = (new \DateTimeImmutable('today', new \DateTimeZone('America/Guayaquil')))->getTimestamp();
E::guardar(['instancia' => ['id' => 'navidad-2026', 'desde' => $hoy0 - 86400, 'hasta' => $hoy0 + 10 * 86400]], 'prueba');
$env = array_merge(getenv(), ['ENVIVO_CONFIG' => $TMP . '/config.env', 'PHP_CLI_SERVER_WORKERS' => '3']);
$PIDS[] = proc_open(['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-d', 'error_reporting=-1', '-S', '127.0.0.1:' . $P, '-t', $RAIZ, $RAIZ . '/server/tests/router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/srv.log', 'a'], 2 => ['file', $TMP . '/srv.log', 'a']], $pp, $RAIZ, $env);
$listo = false;
for ($i = 0; $i < 80 && !$listo; $i++) { $listo = (bool) @fsockopen('127.0.0.1', $P); if (!$listo) usleep(100000); }
check('Arranca el servidor de prueba', true, $listo);

final class Cli {
    public string $cuerpo = ''; public int $http = 0; public array $cab = []; public string $lugar = '';
    private string $jar;
    public function __construct(public string $base, string $n) { $this->jar = sys_get_temp_dir() . '/jar_evs_' . $n . '_' . getmypid(); @unlink($this->jar); }
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
    public function accion(array $d, string $desde = '/control/?t=eventos'): string {
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
$r = $j->api('GET', '/eventos_servidor');
$nav = array_values(array_filter($r['eventos'] ?? [], fn($e) => $e['id'] === 'navidad-2026'));
check('GET sin sesión: 200, Navidad en curso con tienda, sin fichas ni objetivo, caché privada', [200, 1, true, null, null, 'private, max-age=10'],
    [$j->http, count($nav), count($nav[0]['tienda'] ?? []) >= 8, array_key_exists('fichas', $nav[0] ?? []) ? $nav[0]['fichas'] : 'x', array_key_exists('meta', $nav[0] ?? []) ? $nav[0]['meta'] : 'x', $j->cab['cache-control'] ?? '']);
$r = $j->api('POST', '/eventos_servidor/diario', ['instancia' => 'navidad-2026']);
check('POST sin sesión -> 401 sesion_requerida', [401, 'sesion_requerida'], [$j->http, $r['codigo'] ?? null]);
$r = $j->api('POST', '/registro', ['email' => 'web.evs@prueba.example', 'nombre' => 'Web Evs', 'clave' => 'ClaveBuena1', 'acepta_terminos' => true, 'edad_16' => true]);
check('Registro por HTTP', true, (int) ($r['jugador']['id'] ?? 0) > 0);
$j->pedir('POST', '/api/eventos_servidor/diario', '{"instancia":"navidad-2026"}', ['Content-Type: application/json']);
check('POST sin X-Envivo -> 403', 403, $j->http);
$j->api('GET', '/eventos_servidor/diario');
check('GET a diario -> 405', 405, $j->http);
$r = $j->api('POST', '/eventos_servidor/diario', ['instancia' => 'navidad-2026']);
check('Fichas del día por HTTP: +5', [200, 5, 5], [$j->http, $r['fichas_recibidas'] ?? null, $r['evento']['fichas'] ?? null]);
$r = $j->api('POST', '/eventos_servidor/jugar', ['eventos' => [['ref' => 'web:1:1', 'estrellas' => 4], ['ref' => 'web:2:2', 'estrellas' => 1]]]);
check('Jugar por HTTP: 2 contados, 5 + 3 + 2 = 10 fichas', [200, 2, 10], [$j->http, $r['contados'] ?? null, $r['fichas']['navidad-2026'] ?? null]);
$r = $j->api('POST', '/eventos_servidor/comprar', ['instancia' => 'navidad-2026', 'articulo' => 'cables']);
check('Comprar por HTTP: cables', [200, 0, 'consumible'], [$j->http, $r['evento']['fichas'] ?? null, $r['entregas'][0]['tipo'] ?? null]);
$e = $j->api('GET', '/estado');
check('/api/estado trae la entrega de los cables', true, (bool) array_filter($e['entregas'] ?? [], fn($x) => $x['tipo'] === 'consumible' && str_starts_with((string) $x['origen'], 'evento:navidad-2026')));
$r = $j->api('POST', '/eventos_servidor/comprar', ['instancia' => 'navidad-2026', 'articulo' => 'deco']);
check('Sin fichas por HTTP -> 409 evento_sin_fichas (texto claro)', [409, 'evento_sin_fichas', true], [$j->http, $r['codigo'] ?? null, str_contains((string) ($r['error'] ?? ''), 'fichas')]);
$r = $j->api('GET', '/eventos_servidor');
$nav = array_values(array_filter($r['eventos'] ?? [], fn($e) => $e['id'] === 'navidad-2026'))[0] ?? [];
check('GET con sesión: fichas, objetivo del servidor y tabla', [true, true, true], [isset($nav['fichas']), isset($nav['meta']['meta']), isset($nav['tabla']['top'])]);

// Centro de Control
$cc = new Cli($URL, 'panel');
check('Entrar al Centro de Control', 303, $cc->entrar($USUARIO, $CLAVE));
$cc->pedir('GET', '/control/?t=eventos');
check('Pestaña Eventos: en curso, calendario, Navidad con su objetivo por servidor', [200, true, true, true, true],
    [$cc->http, $cc->tiene('id="panel-eventos-curso"'), $cc->tiene('id="tabla-evs-calendario"'), $cc->tiene('tabla-evs-navidad-2026'), $cc->tiene('EN CURSO')]);
check('Sin CSRF -> 403', 403, $cc->pedir('POST', '/control/', ['accion' => 'eventos_general', 'csrf' => 'mal']));
$av = $cc->accion(['accion' => 'eventos_general', 'adviento' => '1']);   // sin "activo": apaga todo
$releer();
check('Apagar todos los eventos desde el panel; el juego ya no ve eventos', [true, false, []], [str_contains($av, 'APAGADOS'), E::config()['activo'], $j->api('GET', '/eventos_servidor')['eventos'] ?? 'x']);
$todos = ['accion' => 'eventos_general', 'activo' => '1', 'adviento' => '1'];
foreach (array_keys(E::CALENDARIO) as $k) $todos['ev_' . $k] = '1';
$av = $cc->accion($todos);
$releer();
check('Encender otra vez', [true, true], [str_contains($av, 'encendidos'), E::config()['activo']]);
$av = $cc->accion(['accion' => 'eventos_instancia', 'id' => 'fin_anio-2026', 'desde' => '2026-12-27', 'hasta' => '2027-01-05', 'meta' => '300']);
$releer();
$fa = E::instancia('fin_anio-2026');
check('Cambiar fechas y meta de Fin de año desde el panel', [true, $ts('2026-12-27 00:00:00'), $ts('2027-01-05 23:59:59'), 300], [str_starts_with($av, 'ok: Edición fin_anio-2026 guardada'), $fa['desde'], $fa['hasta'], $fa['meta_fija']]);
check('Fecha mala desde el panel -> error', true, str_starts_with($cc->accion(['accion' => 'eventos_instancia', 'id' => 'fin_anio-2026', 'desde' => '2027-01-09', 'hasta' => '2027-01-05']), 'error:'));
$av = $cc->accion(['accion' => 'eventos_instancia', 'id' => 'fin_anio-2026', 'borrar' => '1']);
$releer();
check('Volver al calendario desde el panel', [true, false, null], [str_contains($av, 'vuelve'), E::instancia('fin_anio-2026')['cambiada'], E::instancia('fin_anio-2026')['meta_fija']]);
$cc->pedir('GET', '/control/?t=eventos&fecha=2027-06-30');
check('Vista previa 30 jun 2027: Copa Global Femenina', true, $cc->tiene('id="evs-previa"') && $cc->tiene('Copa Global Femenina 2027'));
check('Auditoría: cambios del panel con quien control:', true, (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'eventos_servidor' AND quien LIKE 'control:%'"));

$log = (string) @file_get_contents($TMP . '/php_errores.log') . (string) @file_get_contents($TMP . '/srv.log');
check('Sin errores ni avisos de PHP en el servidor', 0, preg_match_all('/fatal|warning|deprecated|notice|EN VIVO (api|control)/i', $log));
if ($FALLAS) echo substr($log, 0, 3000);

echo "\n----------------------------------------\nPruebas de eventos del servidor: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
