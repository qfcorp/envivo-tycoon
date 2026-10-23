<?php
// SOLO PRUEBAS: lo incluye pruebas.php después de pruebas_mercado_social.php (usa sus ayudas).
// Tienda nueva (precios, bienvenida, tarjeta mensual, refuerzos), transferencia oficial de cuenta, reembolsos/contracargos,
// Google Play (contra un Google FALSO), Centro de Control (admin.php), soporte, códigos de error, borrar la cuenta y los
// arreglos de la auditoría de seguridad (A-01, A-02, A-03, A-08).
if (PHP_SAPI !== 'cli' || !isset($nuevo, $pagador, $multi)) { http_response_code(404); exit; }

$exec('DELETE FROM intentos');
$csrfAdm = function () use ($adm, $AU, $AC): string { [, $h] = $adm('/admin.php?t=ajustes', $AU, $AC); return preg_match('/name="csrf" value="([a-f0-9]+)"/', $h, $m) ? $m[1] : ''; };
$admPost = function (string $tab, array $datos) use ($adm, $AU, $AC, $csrfAdm): array { return $adm('/admin.php?t=' . $tab, $AU, $AC, ['csrf' => $csrfAdm()] + $datos); };
$tareas = fn() => (string) shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/tareas.php') . ' 2>&1');
$auditado = fn(string $accion, ?int $j = null) => (int) $val('SELECT COUNT(*) FROM auditoria WHERE accion = ?' . ($j !== null ? ' AND jugador_id = ' . (int) $j : ''), [$accion]);

// =====================================================================
titulo('Tienda: oferta de bienvenida ($0,99, una sola vez)');
[$b1, $JB1] = $nuevo('Bienvenida');
$r = $pagar($b1, $ordenar($b1, 'bienvenida'), '4540639936908783');
$eb = $b1->apiGet('/api/estado');
check('Pagar la bienvenida -> 150 créditos', ['success', 150], [$r['status'] ?? null, $eb['creditos']]);
check('…entregas: refuerzo camarógrafo senior por 3 eventos y 3 cables', [['refuerzo', 'camarografo', 1, 'senior', 3], ['consumible', 'cable', 3, 'x', 'x']],
    array_map(fn($x) => [$x['tipo'], $x['item'], $x['cantidad'], array_key_exists('nivel', $x) ? $x['nivel'] : 'x', array_key_exists('eventos', $x) ? $x['eventos'] : 'x'], $eb['entregas']));
$r = $b1->api('/api/orden', ['producto' => 'bienvenida']);
check('Otra orden de bienvenida -> 409 ya_comprado', [409, 'ya_comprado'], [$b1->http, $r['codigo'] ?? null]);
check('Precio guardado: 0,99 = 0,86 + 0,13', [0.99, 0.86, 0.13], array_map('floatval', array_values($fila("SELECT total, subtotal, iva FROM compras WHERE jugador_id = ? AND producto = 'bienvenida'", [$JB1]))));

titulo('Tienda: Tarjeta mensual ($4,99: 20 créditos por día, 30 días, se suman)');
[$t1, $JT1] = $nuevo('Tarjeta');
$t1->api('/api/tarjeta/reclamar');
check('Sin tarjeta: reclamar -> 403 tarjeta_requerida', [403, 'tarjeta_requerida'], [$t1->http, json_decode($t1->cuerpo, true)['codigo'] ?? null]);
$pagar($t1, $ordenar($t1, 'tarjeta_mensual'), '4540639936908783');
$et = $t1->apiGet('/api/estado');
$th = (int) $val('SELECT tarjeta_hasta FROM jugadores WHERE id = ?', [$JT1]);
check('Comprar la tarjeta -> activa 30 días, no da créditos al comprar', [true, true, false, 0], [$et['tarjeta_activa'], cerca($th, time() + 30 * 86400), $et['tarjeta_reclamada_hoy'], $et['creditos']]);
check('…tarjeta_hasta en ISO', date('c', $th), $et['tarjeta_hasta']);
$r = $t1->api('/api/tarjeta/reclamar');
check('Reclamar -> +20 créditos', [200, 20, 20, true], [$t1->http, $r['creditos'] ?? null, $r['recibidos'] ?? null, $t1->apiGet('/api/estado')['tarjeta_reclamada_hoy']]);
$r = $t1->api('/api/tarjeta/reclamar');
check('Reclamar otra vez el mismo día -> 409 ya_reclamado, sin créditos', [409, 'ya_reclamado', 20], [$t1->http, $r['codigo'] ?? null, $saldo($JT1)]);
$exec('UPDATE tarjeta_reclamos SET dia = ? WHERE jugador_id = ?', [date('Y-m-d', strtotime('-1 day')), $JT1]);
$t1->api('/api/tarjeta/reclamar');
check('Al día siguiente se puede otra vez (40) y el libro lo anota', [200, 40, 40], [$t1->http, $saldo($JT1), $libro($JT1)]);
$pagar($t1, $ordenar($t1, 'tarjeta_mensual'), '4540639936908783');
check('Comprar otra tarjeta con la actual activa -> se SUMAN 30 días', $th + 30 * 86400, (int) $val('SELECT tarjeta_hasta FROM jugadores WHERE id = ?', [$JT1]));
$exec('UPDATE jugadores SET tarjeta_hasta = ? WHERE id = ?', [time() - 1, $JT1]);
$exec('DELETE FROM tarjeta_reclamos WHERE jugador_id = ?', [$JT1]);
$t1->api('/api/tarjeta/reclamar');
check('Tarjeta vencida -> 403', 403, $t1->http);

titulo('Refuerzos con créditos (entrega tipo refuerzo)');
[$rf, $JRF] = $nuevo('Refuerzos');
$darCreditos($JRF, 1000);
foreach (['refuerzo_camarografo_senior' => [120, 'senior', 2], 'refuerzo_tecnico_internacional' => [240, 'internacional', 3], 'alquiler_lente_box' => [120, null, 1], 'seguro_evento' => [100, null, 1], 'equipo_descansado' => [100, null, null]] as $id => [$cr, $niv, $ev]) {
    $antes = $saldo($JRF);
    $r = $rf->api('/api/gastar', ['item' => $id]);
    check("Canjear $id ($cr créditos) -> entrega refuerzo", [200, $antes - $cr, 'refuerzo', $id, $niv, $ev], [$rf->http, $r['creditos'] ?? null, $r['entrega']['tipo'] ?? null, $r['entrega']['item'] ?? null, array_key_exists('nivel', $r['entrega'] ?? []) ? $r['entrega']['nivel'] : 'x', array_key_exists('eventos', $r['entrega'] ?? []) ? $r['entrega']['eventos'] : 'x']);
}
check('…5 refuerzos en el historial de entregas', 5, count(array_filter($rf->apiGet('/api/estado')['entregas'], fn($e) => $e['tipo'] === 'refuerzo')));

// =====================================================================
titulo('Códigos de error estables (para traducir en el juego)');
$sinS = new Nav($URL, 'codigos');
$r = $sinS->api('/api/gastar', ['item' => 'dron4k']);
check('Sin sesión -> codigo sesion_requerida', [401, 'sesion_requerida'], [$sinS->http, $r['codigo'] ?? null]);
$r = $sinS->api('/api/registro', ['email' => 'mal', 'nombre' => 'x', 'clave' => '12345678']);
check('Correo inválido -> email_invalido', 'email_invalido', $r['codigo'] ?? null);
$r = $sinS->api('/api/registro', ['email' => 'corto@prueba.example', 'nombre' => 'x', 'clave' => '123']);
check('Clave corta -> clave_corta', 'clave_corta', $r['codigo'] ?? null);
$r = $sinS->api('/api/entrar', ['email' => 'nadie@prueba.example', 'clave' => '12345678x']);
check('Clave mala -> credenciales_invalidas', 'credenciales_invalidas', $r['codigo'] ?? null);
$r = $rf->api('/api/gastar', ['item' => 'unidad_movil']);
check('Sin créditos -> sin_creditos', [402, 'sin_creditos'], [$rf->http, $r['codigo'] ?? null]);
$r = $sinS->api('/api/estado', [], false);
check('Sin X-Envivo -> cabecera_requerida', 'cabecera_requerida', $r['codigo'] ?? null);
$r = $sinS->apiGet('/api/no-existe');
check('Ruta que no existe -> no_encontrado', 'no_encontrado', $r['codigo'] ?? null);
$exec('DELETE FROM intentos');
check('Todos los errores de la API traen "codigo" (en este recorrido)', true, isset($r['codigo'], $r['error']));

// =====================================================================
titulo('Auditoría A-02: la confirmación 3DS solo aprueba SU compra, una vez');
[$x1, $JX1] = $pagador('Tres Ds Seguro');
$sx = $saldo($JX1);
$tokBarata = $ordenar($x1, 'creditos_250');
$r = $pagar($x1, $tokBarata, '5555555555554444');
$x1->get($r['detail']['url']);
$vueltaBarata = $x1->lugar;   // NO se visita todavía
$tokCara = $ordenar($x1, 'creditos_3200');
$r = $pagar($x1, $tokCara, '5555555555554444');
$x1->get($r['detail']['url']);
$vueltaCara = $x1->lugar;
check('Paso 103 guarda la transacción de Plux en la compra', true, str_starts_with((string) $compra($tokCara)['plux_transaccion'], 'FALSO3DS-'));
$x1->get($vueltaBarata);   // la sesión recuerda la compra CARA: la confirmación de la barata no debe aprobarla
check('Usar la confirmación de la compra barata con la cara pendiente -> NO se aprueba (transacción distinta)', ['pendiente', $sx, 1],
    [$compra($tokCara)['estado'], $saldo($JX1), (int) $val("SELECT COUNT(*) FROM avisos WHERE tipo = 'plux_3ds_no_coincide' AND compra_id = ?", [$compra($tokCara)['id']])]);
$x1->get($vueltaBarata);
check('Repetir esa misma confirmación -> rechazada (ya usada)', [true, $sx], [str_contains($x1->lugar, '&r=rechazado'), $saldo($JX1)]);
$x1->get('/pago.php?o=' . $tokBarata);   // abrir otra página de pago NO cambia la compra recordada
$r = $pagar($x1, $tokCara, '5555555555554444');
$x1->get($r['detail']['url']);
$v3 = $x1->lugar;
file_put_contents(getenv('FALSO_LOG') . '.ref_' . preg_replace('/^.*ptk=TK-/', '', $v3), '0.01');   // Plux "confirma" otro valor
$x1->get($v3);
check('Confirmación con otro valor -> NO se aprueba', ['pendiente', $sx, true], [$compra($tokCara)['estado'], $saldo($JX1), str_contains((string) $val("SELECT detalle FROM avisos WHERE tipo = 'plux_3ds_no_coincide' ORDER BY id DESC LIMIT 1"), 'valor')]);
$r = $pagar($x1, $tokCara, '5555555555554444');
$x1->get($r['detail']['url']); $x1->get($x1->lugar);
check('La confirmación correcta de SU compra sí se aprueba', ['/?compra=ok', 'pagado', $sx + 3200], [$x1->lugar, $compra($tokCara)['estado'], $saldo($JX1)]);
check('pago.php ya no cambia la compra recordada (solo /api/plux/pago)', (int) $compra($tokCara)['id'], (int) $val('SELECT compra_pendiente FROM sesiones WHERE token_hash = ?', [hash('sha256', $x1->token())]));

titulo('Auditoría A-03: dos "Pagar" a la vez no cobran dos veces');
$exec('DELETE FROM intentos');
$tokL = $ordenar($x1, 'creditos_700');
$llam = count(falso_log());
$res = $multi([[$x1->token(), '/api/plux/pago', ['o' => $tokL, 'buyer' => $comprador] + tarjeta('4000056655665556')], [$x1->token(), '/api/plux/pago', ['o' => $tokL, 'buyer' => $comprador] + tarjeta('4000056655665556')]]);
$cod = array_map(fn($x) => [$x[0], $x[1]['status'] ?? null, $x[1]['codigo'] ?? null], $res); sort($cod);
// (si php -S atiende los dos en el mismo proceso, el segundo llega después y responde "ya pagada": también es correcto)
si('Dos pagos a la vez de la misma compra -> uno success; el otro 409 pago_en_proceso (o "ya pagada" si llegó después)', in_array($cod, [[[200, 'success', null], [409, 'failed', 'pago_en_proceso']], [[200, 'success', null], [200, 'success', null]]], true));
check('…Plux recibió UN solo cobro y se entregó una vez', [1, 'pagado', 1], [count(falso_log()) - $llam, $compra($tokL)['estado'], (int) $val("SELECT COUNT(*) FROM movimientos_creditos WHERE ref LIKE ?", ['compra:' . $compra($tokL)['id'] . ':%'])]);
$tokP = $ordenar($x1, 'creditos_250');
$exec("UPDATE compras SET plux_paso = 'procesando', plux_desde = ? WHERE token = ?", [time(), $tokP]);
$llam = count(falso_log());
$r = $pagar($x1, $tokP, '4540639936908783');
check('Compra "procesando" (otro pedido la está cobrando) -> 409 pago_en_proceso SIN llamar a Plux', [409, 'pago_en_proceso', 0, 'pendiente'], [$x1->http, $r['codigo'] ?? null, count(falso_log()) - $llam, $compra($tokP)['estado']]);
$exec('UPDATE compras SET plux_desde = ? WHERE token = ?', [time() - 121, $tokP]);
$r = $pagar($x1, $tokP, '4540639936908783');
check('…si quedó "procesando" más de 2 minutos (el pedido se cortó), se puede pagar otra vez', ['success', 'pagado'], [$r['status'] ?? null, $compra($tokP)['estado']]);
$tokO = $ordenar($x1, 'creditos_250');
$r = $x1->api('/api/plux/pago', ['o' => $tokO, 'buyer' => $comprador, 'paramsOtp' => ['idTransaction' => 'OTP-1', 'otpCode' => '123456']] + tarjeta('36417200103608'));
check('Mandar un código OTP sin que la compra lo esté esperando -> 409 otp_vencido (no llama a Plux)', [409, 'otp_vencido'], [$x1->http, $r['codigo'] ?? null]);

// =====================================================================
titulo('Reembolso / contracargo (Centro de Control) y rastro en el mercado (A-01)');
$exec('DELETE FROM intentos');
[$fr, $JFR, $emailFR, , $claveFR] = $pagador('Fraude Tarjeta');      // compra 250 créditos
$tokF = $ordenar($fr, 'creditos_3200');
$pagar($fr, $tokF, '4540639936908783');
$cF = $compra($tokF);
$pagar($fr, $ordenar($fr, 'vip30'), '4540639936908783');
$cV = Db_todas($pdo, "SELECT * FROM compras WHERE jugador_id = ? AND producto = 'vip30'", [$JFR])[0];
$r = $fr->api('/api/gastar', ['item' => 'dron4k']);   // gasta 450 de los créditos comprados
$invFR = (int) $r['item']['id'];
[$lav, $JLAV] = $pagador('Lavador Cuenta B');
$darCreditos($JLAV, 100);
$r = $lav->api('/api/gastar', ['item' => 'generador']);
$invLav = (int) $r['item']['id'];
$r = $lav->api('/api/mercado/publicar', ['inventario_id' => $invLav, 'precio' => 750]);
$pubLav = (int) $r['publicacion']['id'];
$fr->api('/api/mercado/comprar', ['publicacion_id' => $pubLav]);
check('El de la tarjeta robada compra en el mercado a la cuenta B (712 retenidos para B)', [200, 'retenido', 712], [$fr->http, $val('SELECT estado FROM mercado_retenciones WHERE publicacion_id = ?', [$pubLav]), (int) $val('SELECT creditos FROM mercado_retenciones WHERE publicacion_id = ?', [$pubLav])]);
check('Comprador y vendedor desde la misma IP -> aviso y marca de riesgo en las dos cuentas', [true, true, true], [(bool) $val("SELECT 1 FROM avisos WHERE tipo = 'mercado_misma_ip' AND detalle LIKE ?", ['%N° ' . $pubLav . '%']),
    $val('SELECT riesgo_motivo FROM jugadores WHERE id = ?', [$JFR]) !== null, $val('SELECT riesgo_motivo FROM jugadores WHERE id = ?', [$JLAV]) !== null]);
$saldoAntes = $saldo($JFR); $saldoLav = $saldo($JLAV);
[$h, $html] = $admPost('compras&id=' . $cF['id'], ['accion' => 'revertir', 'compra_id' => $cF['id'], 'tipo' => 'reembolso', 'motivo' => '']);
check('Revertir sin motivo -> no hace nada', ['pagado', true], [$compra($tokF)['estado'], str_contains($html, 'motivo')]);
[$h, $html] = $admPost('compras&id=' . $cF['id'], ['accion' => 'revertir', 'compra_id' => $cF['id'], 'tipo' => 'reembolso', 'motivo' => 'Reembolso pedido al banco']);
check('Reembolso -> compra revertida, cuenta suspendida (1.er reembolso: todavía no banea)', [true, 'revertido', 'reembolso', 'suspendido'], [str_contains($html, 'revertida'), $compra($tokF)['estado'], $compra($tokF)['revertida_tipo'], $val('SELECT estado FROM jugadores WHERE id = ?', [$JFR])]);
check('…se descuentan los 3.200 créditos aunque ya los gastó: el saldo queda NEGATIVO', $saldoAntes - 3200, $saldo($JFR));
check('…libro = saldo (con la deuda)', $saldo($JFR), $libro($JFR));
check('…lo retenido a la cuenta B se recupera (nunca le llega) y el equipo vuelve a B', ['recuperado', $saldoLav, $JLAV, 'bodega'],
    [$val('SELECT estado FROM mercado_retenciones WHERE publicacion_id = ?', [$pubLav]), $saldo($JLAV), (int) $val('SELECT jugador_id FROM inventario WHERE id = ?', [$invLav]), $val('SELECT estado FROM inventario WHERE id = ?', [$invLav])]);
check('…aviso de recuperación y las dos cuentas marcadas', [true, true], [(bool) $val("SELECT 1 FROM avisos WHERE tipo = 'mercado_recuperado'"), str_contains((string) $val('SELECT riesgo_motivo FROM jugadores WHERE id = ?', [$JLAV]), 'revertida')]);
$exec('UPDATE mercado_retenciones SET libera = ? WHERE publicacion_id = ?', [time() - 1, $pubLav]);
$tareas();
check('…la retención recuperada NO se libera después', $saldoLav, $saldo($JLAV));
$e = $fr->apiGet('/api/estado');
check('estado: cuenta_estado suspendido con aviso en español', ['suspendido', true, true], [$e['cuenta_estado'], str_contains((string) $e['aviso'], 'suspendida'), $e['creditos'] < 0]);
check('…el dron canjeado (ref creditos:) sigue en su inventario (no salió de la compra)', true, in_array($invFR, array_column($e['inventario'], 'id'), true));
$r = $fr->api('/api/orden', ['producto' => 'creditos_250']);
check('Suspendido: no puede comprar (403 cuenta_suspendida)', [403, 'cuenta_suspendida'], [$fr->http, $r['codigo'] ?? null]);
$r = $fr->api('/api/plux/pago', ['o' => $ordenar($x1, 'creditos_250'), 'buyer' => $comprador] + tarjeta('4540639936908783'));
$tokAbierta = (string) $val("SELECT token FROM compras WHERE jugador_id = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1", [$JFR]);
if ($tokAbierta !== '') { $fr->api('/api/plux/pago', ['o' => $tokAbierta, 'buyer' => $comprador] + tarjeta('4540639936908783')); check('Suspendido: /api/plux/pago de una orden vieja -> 403', 403, $fr->http); }
$fr->api('/api/gastar', ['item' => 'kit_reparacion']);
check('…ni canjear', 403, $fr->http);
$fr->api('/api/chat', ['canal' => 'servidor', 'texto' => 'vendo créditos baratos']);
check('…ni escribir en el chat (A-08)', [403, 'cuenta_suspendida'], [$fr->http, json_decode($fr->cuerpo, true)['codigo'] ?? null]);
$fr->api('/api/perfil', ['alias' => 'Fraude TV']);
check('…ni cambiar su perfil (A-08)', 403, $fr->http);
$fr->api('/api/asociaciones/crear', ['nombre' => 'Fraudes', 'siglas' => 'FRA', 'color' => '#ff0000', 'pagado_en_juego' => true]);
check('…ni crear asociaciones (A-08)', 403, $fr->http);
check('…ni usar el mercado', false, $fr->apiGet('/api/mercado')['puede']);
$fr->api('/api/vip/bono');
check('…ni reclamar el bono VIP', 403, $fr->http);
check('…pero sí puede leer su partida y escribir a soporte', [200], [$fr->get('/api/partida')]);
[$h, $html] = $admPost('compras&id=' . $cV['id'], ['accion' => 'revertir', 'compra_id' => $cV['id'], 'tipo' => 'reembolso', 'motivo' => 'Reembolso pedido']);
check('Reembolso del VIP -> el VIP termina (le quitan los 30 días)', [true, 'revertido'], [(int) $val('SELECT vip_hasta FROM jugadores WHERE id = ?', [$JFR]) <= time(), $val('SELECT estado FROM compras WHERE id = ?', [$cV['id']])]);
check('G6: 2.º reembolso en 180 días -> cuenta BANEADA (sesiones cerradas) y aviso', ['baneado', false, true], [$val('SELECT estado FROM jugadores WHERE id = ?', [$JFR]), $fr->apiGet('/api/estado')['logueado'], (bool) $val("SELECT 1 FROM avisos WHERE tipo = 'abuso_reembolsos' AND detalle LIKE ?", ['%cuenta ' . $JFR . ' %'])]);
$r = $fr->api('/api/entrar', ['email' => $emailFR, 'clave' => $claveFR]);
check('…el baneado ve un mensaje claro con el correo de soporte', [403, 'cuenta_baneada', true], [$fr->http, $r['codigo'] ?? null, str_contains((string) ($r['error'] ?? ''), 'soporte@prueba.example')]);
[$h, $html] = $admPost('compras&id=' . $cF['id'], ['accion' => 'revertir', 'compra_id' => $cF['id'], 'tipo' => 'reembolso', 'motivo' => 'otra vez']);
check('Revertir otra vez la misma compra -> no hace nada (idempotente)', [true, $saldoAntes - 3200], [str_contains($html, 'no está pagada'), $saldo($JFR)]);
check('Una compra revertida no se vuelve a aprobar (aviso de Plux PAGADO después)', [200, 'ya_estaba_pagado', 'revertido'], (function () use ($hook, $E, $cF, $compra, $tokF) { [$h, $j] = $hook(['state' => 'PAGADO', 'description' => 'EV-' . $cF['id'], 'amount' => 19.99], $E('PLUX_WEBHOOK_USUARIO'), $E('PLUX_WEBHOOK_CLAVE')); return [$h, $j['resultado'] ?? null, $compra($tokF)['estado']]; })());
check('Auditoría: 2 compra_reembolso y el baneo anotados', [2, 1], [$auditado('compra_reembolso', $JFR), $auditado('cuenta_baneado', $JFR)]);
// Paquete de inicio revertido: la cámara del paquete se quita si todavía la tiene
[$ip, $JIP] = $nuevo('Inicio Revertido');
$pagar($ip, $ordenar($ip, 'inicio'), '4540639936908783');
$cI = Db_todas($pdo, "SELECT * FROM compras WHERE jugador_id = ? AND producto = 'inicio'", [$JIP])[0];
$admPost('compras&id=' . $cI['id'], ['accion' => 'revertir', 'compra_id' => $cI['id'], 'tipo' => 'reembolso', 'motivo' => 'Prueba']);
check('Reembolso del paquete de inicio -> la cámara del paquete sale del inventario y se quitan sus 200 créditos', [[], 'revocado', 0],
    [$ip->apiGet('/api/estado')['inventario'], $val("SELECT estado FROM inventario WHERE jugador_id = ? AND item = 'cam_pro'", [$JIP]), $saldo($JIP)]);
// Reactivar la cuenta
[$h, $html] = $admPost('jugadores&id=' . $JFR, ['accion' => 'cuenta_estado', 'jugador_id' => $JFR, 'estado' => 'activo', 'motivo' => '']);
check('Centro de Control: levantar el baneo (reactivar la cuenta)', ['activo', true], [$val('SELECT estado FROM jugadores WHERE id = ?', [$JFR]), $auditado('cuenta_activo', $JFR) === 1]);
$darCreditos($JFR, 5000);
check('La deuda se descuenta de lo próximo que reciba (5000 - deuda)', $saldoAntes - 3200 + 5000, $saldo($JFR));

// =====================================================================
titulo('Transferencia oficial de cuenta');
$exec('DELETE FROM intentos');
[$tv, $JTV, $emailTV, , $claveTV] = $pagador('Dueño Viejo');
$darCreditos($JTV, 1000);
$r = $tv->api('/api/gastar', ['item' => 'generador']);
$tv->api('/api/mercado/publicar', ['inventario_id' => (int) $r['item']['id'], 'precio' => 500]);
$otraSesion = new Nav($URL, 'otra_sesion_tv');
$otraSesion->api('/api/entrar', ['email' => $emailTV, 'clave' => $claveTV]);
$tv->api('/api/cuenta/transferir/iniciar', ['email_nuevo' => 'no-es-correo']);
check('Correo inválido -> 400', 400, $tv->http);
$tv->api('/api/cuenta/transferir/iniciar', ['email_nuevo' => $emailTV]);
check('El mismo correo -> 400 mismo_email', 'mismo_email', json_decode($tv->cuerpo, true)['codigo'] ?? null);
$tv->api('/api/cuenta/transferir/iniciar', ['email_nuevo' => $emailL]);
check('Un correo que ya tiene cuenta -> 409 email_en_uso', [409, 'email_en_uso'], [$tv->http, json_decode($tv->cuerpo, true)['codigo'] ?? null]);
$nuevoEmail = 'nuevo.dueno.' . bin2hex(random_bytes(3)) . '@prueba.example';
$r = $tv->api('/api/cuenta/transferir/iniciar', ['email_nuevo' => strtoupper($nuevoEmail)]);
check('Iniciar -> transferencia pendiente_pago con la página de pago ($9,99)', [200, 'pendiente_pago', true, 9.99], [$tv->http, $r['transferencia']['estado'] ?? null, str_starts_with((string) ($r['url'] ?? ''), '/pago.php?o='), (float) $val("SELECT total FROM compras WHERE producto = 'transferencia_cuenta' AND jugador_id = ?", [$JTV])]);
$tv->api('/api/cuenta/transferir/iniciar', ['email_nuevo' => 'otro@prueba.example']);
check('Otra transferencia mientras hay una en curso -> 409', 409, $tv->http);
$tokT = substr((string) $r['url'], 12);
$pagar($tv, $tokT, '4540639936908783');
$et = $tv->apiGet('/api/estado')['transferencia'];
check('Pagada -> estado.transferencia trae el código de 8 caracteres (solo lo ve el dueño)', ['pagada', true], [$et['estado'] ?? null, (bool) preg_match('/^[A-Z2-9]{8}$/', (string) ($et['codigo'] ?? ''))]);
$cod = (string) $et['codigo'];
$nn = new Nav($URL, 'nuevo_dueno');
$r = $nn->api('/api/cuenta/transferir/confirmar', ['email' => $nuevoEmail, 'codigo' => 'AAAAAAAA', 'clave' => 'ClaveNueva2026']);
check('Confirmar con código malo -> 400 codigo_invalido', [400, 'codigo_invalido'], [$nn->http, $r['codigo'] ?? null]);
$r = $nn->api('/api/cuenta/transferir/confirmar', ['email' => $nuevoEmail, 'codigo' => strtolower($cod), 'clave' => 'ClaveNueva2026', 'nombre' => 'Nueva Dueña']);
check('Confirmar con el código -> el nuevo dueño entra a ESA cuenta', [200, true, $JTV, $nuevoEmail], [$nn->http, $r['logueado'] ?? null, $r['jugador']['id'] ?? null, $r['jugador']['email'] ?? null]);
check('…todas las sesiones del dueño anterior se cerraron', [false, false], [$tv->apiGet('/api/estado')['logueado'], $otraSesion->apiGet('/api/estado')['logueado']]);
$tv->api('/api/entrar', ['email' => $emailTV, 'clave' => $claveTV]);
check('…el correo y la clave viejos ya no entran', 401, $tv->http);
check('…sus publicaciones del mercado se retiraron (el equipo volvió a la bodega)', [0, 1], [(int) $val("SELECT COUNT(*) FROM mercado_publicaciones WHERE vendedor_id = ? AND estado = 'activa'", [$JTV]), count($r['inventario'])]);
$r = $nn->api('/api/mercado/publicar', ['inventario_id' => (int) $r['inventario'][0]['id'], 'precio' => 500]);
check('…bloqueo de 7 días: no puede vender en el mercado', [403, 'bloqueo_transferencia'], [$nn->http, $r['codigo'] ?? null]);
$nn->api('/api/cuenta/transferir/iniciar', ['email_nuevo' => 'tercero@prueba.example']);
check('…ni transferirla otra vez', [403, 'bloqueo_transferencia'], [$nn->http, json_decode($nn->cuerpo, true)['codigo'] ?? null]);
check('…y sigue con sus créditos y compras', [true, true], [$saldo($JTV) > 0, (int) $val("SELECT COUNT(*) FROM compras WHERE jugador_id = ? AND estado = 'pagado'", [$JTV]) >= 2]);
check('Auditoría: transferencia iniciada, pagada y completada', [1, 1, 1], [$auditado('transferencia_iniciada', $JTV), $auditado('transferencia_pagada', $JTV), $auditado('transferencia_completada', $JTV)]);
// Cancelar desde el Centro de Control
[$tc, $JTC] = $pagador('Cancela Transferencia');
$tc->api('/api/cuenta/transferir/iniciar', ['email_nuevo' => 'cancelada.' . bin2hex(random_bytes(3)) . '@prueba.example']);
$tid = (int) $val("SELECT id FROM transferencias WHERE jugador_id = ? AND estado = 'pendiente_pago'", [$JTC]);
[$h, $html] = $adm('/admin.php?t=transferencias', $AU, $AC);
si('El Centro de Control lista las transferencias', str_contains($html, 'id="tabla-transferencias"') && str_contains($html, 'pendiente_pago'));
$admPost('transferencias', ['accion' => 'transferencia_cancelar', 'transferencia_id' => $tid]);
check('Cancelar desde el panel -> cancelada y su orden ya no se puede pagar', ['cancelada', 'rechazado'], [$val('SELECT estado FROM transferencias WHERE id = ?', [$tid]), $val('SELECT c.estado FROM compras c JOIN transferencias t ON t.compra_id = c.id WHERE t.id = ?', [$tid])]);

// =====================================================================
titulo('Google Play (contra un Google FALSO)');
$exec('DELETE FROM intentos');
$glog = fn() => array_map(fn($l) => json_decode($l, true), file(getenv('FALSO_G_LOG'), FILE_IGNORE_NEW_LINES) ?: []);
[$gp, $JGP] = $nuevo('Android Uno');
$tok = 'ok-' . bin2hex(random_bytes(12));
$r = $gp->api('/api/google/verificar', ['producto' => 'creditos_700', 'purchaseToken' => $tok, 'orderId' => '']);
check('TWA: verificar con orderId VACÍO -> se toma de Google, compra google_play pagada, +700', [200, true, 'google_play', 'pagado', 700], [$gp->http, $r['nueva'] ?? null, $r['compra']['canal'] ?? null, $r['compra']['estado'] ?? null, $r['creditos'] ?? null]);
$cg = $fila("SELECT * FROM compras WHERE jugador_id = ? AND canal = 'google_play'", [$JGP]);
check('…orderId de Google guardado, token guardado con su hash, total 4,99 con IVA', [true, hash('sha256', $tok), 4.99], [str_starts_with((string) $cg['google_order_id'], 'GPA.'), $cg['google_token_hash'], (float) $cg['total']]);
check('…se avisó a Google (consume, porque se puede volver a comprar)', [true, true], [$cg['google_ack'] !== null, (bool) array_filter($glog(), fn($x) => ($x['ruta'] ?? '') === 'consume')]);
check('…el token OAuth se pidió con un JWT RS256 válido', true, (bool) array_filter($glog(), fn($x) => ($x['ruta'] ?? '') === 'token' && $x['ok']));
$r = $gp->api('/api/google/verificar', ['producto' => 'creditos_700', 'purchaseToken' => $tok, 'orderId' => '']);
check('Mandar el mismo comprobante otra vez ("restaurar") -> nueva false, sin entregar otra vez', [200, false, 700], [$gp->http, $r['nueva'] ?? null, $saldo($JGP)]);
[$gp2, $JGP2] = $nuevo('Android Dos');
$r = $gp2->api('/api/google/verificar', ['producto' => 'creditos_700', 'purchaseToken' => $tok, 'orderId' => '']);
check('El mismo comprobante desde OTRA cuenta -> 409 google_otra_cuenta y queda anotado', [409, 'google_otra_cuenta', 0, true], [$gp2->http, $r['codigo'] ?? null, $saldo($JGP2), (bool) $val("SELECT 1 FROM avisos WHERE tipo = 'google_otra_cuenta' AND compra_id = ?", [$cg['id']])]);
$tok2 = 'ok-' . bin2hex(random_bytes(12));
$res = $multi([[$gp2->token(), '/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => $tok2, 'orderId' => '']], [$gp2->token(), '/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => $tok2, 'orderId' => '']]]);
check('El mismo comprobante dos veces A LA VEZ -> 250 créditos una sola vez', [250, 1], [$saldo($JGP2), (int) $val('SELECT COUNT(*) FROM compras WHERE google_token_hash = ?', [hash('sha256', $tok2)])]);
foreach (['pend-' => [402, 'google_pendiente'], 'canc-' => [402, 'google_cancelada'], 'xx-' => [402, 'google_invalida'], 'cuenta-99999-' => [409, 'google_otra_cuenta']] as $pre => [$hEsp, $cEsp]) {
    $r = $gp2->api('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => $pre . bin2hex(random_bytes(10)), 'orderId' => '']);
    check("Comprobante $pre -> $hEsp $cEsp, sin entregar", [$hEsp, $cEsp, 250], [$gp2->http, $r['codigo'] ?? null, $saldo($JGP2)]);
}
$r = $gp2->api('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => 'cuenta-' . $JGP2 . '-' . bin2hex(random_bytes(8)), 'orderId' => '']);
check('Comprobante con obfuscatedExternalAccountId de ESTA cuenta -> ok', [200, 500], [$gp2->http, $saldo($JGP2)]);
$r = $gp2->api('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => 'ok-' . bin2hex(random_bytes(10)), 'orderId' => 'GPA.0000-0000-0000']);
check('orderId distinto al de Google -> 409 google_no_coincide', [409, 'google_no_coincide'], [$gp2->http, $r['codigo'] ?? null]);
$gp2->api('/api/google/verificar', ['producto' => 'nave', 'purchaseToken' => 'ok-' . bin2hex(random_bytes(10))]);
check('Producto que no existe -> 404', 404, $gp2->http);
$gp2->api('/api/google/verificar', ['producto' => 'transferencia_cuenta', 'purchaseToken' => 'ok-' . bin2hex(random_bytes(10))]);
check('El producto oculto de transferencia no se vende en Google -> 404', 404, $gp2->http);
$r = $gp2->api('/api/google/verificar', ['producto' => 'seguro_evento', 'purchaseToken' => 'ok-' . bin2hex(random_bytes(10))]);
$eG = $gp2->apiGet('/api/estado');
check('Refuerzo vendido directo en Google ($0,99) -> entrega refuerzo', [200, 0.99, 'refuerzo', 'seguro_evento'], [$gp2->http, (float) $val("SELECT total FROM compras WHERE jugador_id = ? AND producto = 'seguro_evento'", [$JGP2]), end($eG['entregas'])['tipo'] ?? null, end($eG['entregas'])['item'] ?? null]);
$tokI = 'ok-' . bin2hex(random_bytes(12));
$gp2->api('/api/google/verificar', ['producto' => 'inicio', 'purchaseToken' => $tokI]);
check('Paquete de inicio por Google -> entregado y acknowledge (no consume)', [200, true], [$gp2->http, (bool) array_filter($glog(), fn($x) => ($x['ruta'] ?? '') === 'acknowledge' && ($x['prod'] ?? '') === 'inicio')]);
$gp2->api('/api/google/verificar', ['producto' => 'inicio', 'purchaseToken' => 'ok-' . bin2hex(random_bytes(12))]);
check('Un segundo paquete de inicio pagado en Google -> pagado pero NO se entrega otra vez y queda aviso', [200, 1, true], [$gp2->http, (int) $val("SELECT COUNT(*) FROM inventario WHERE jugador_id = ? AND item = 'cam_pro'", [$JGP2]), (bool) $val("SELECT 1 FROM avisos WHERE tipo = 'inicio_duplicado' AND detalle LIKE ?", ['%jugador ' . $JGP2 . ' %'])]);
// Anuladas (reembolso / contracargo en Google) -> bin/google_anulados.php las revierte
$sG = $saldo($JGP);
file_put_contents(getenv('FALSO_G_ANULADAS'), json_encode([['purchaseToken' => $tok, 'orderId' => $cg['google_order_id'], 'voidedTimeMillis' => (string) (time() * 1000), 'voidedReason' => 7, 'voidedSource' => 0]]));
$out = (string) shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/google_anulados.php') . ' 2>&1');
check('google_anulados.php: contracargo de Google -> compra revertida, créditos quitados, cuenta BANEADA (G6)', [true, 'revertido', 'contracargo', $sG - 700, 'baneado'],
    [str_contains($out, '1 revertidas'), $val('SELECT estado FROM compras WHERE id = ?', [$cg['id']]), $val('SELECT revertida_tipo FROM compras WHERE id = ?', [$cg['id']]), $saldo($JGP), $val('SELECT estado FROM jugadores WHERE id = ?', [$JGP])]);
$out = (string) shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/google_anulados.php') . ' 2>&1');
check('…correrlo otra vez no revierte dos veces', [true, $sG - 700], [str_contains($out, '0 revertidas'), $saldo($JGP)]);
$exec("UPDATE compras SET google_ack = NULL WHERE jugador_id = ? AND producto = 'seguro_evento'", [$JGP2]);
$out = (string) shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/google_anulados.php') . ' 2>&1');
check('…y reintenta los avisos a Google que faltan (dentro de los 3 días)', true, str_contains($out, 'avisos reintentados') && $val("SELECT google_ack FROM compras WHERE jugador_id = ? AND producto = 'seguro_evento'", [$JGP2]) !== null);

// =====================================================================
titulo('Centro de Control: productos, ofertas, mantenimiento, anuncio, jugadores');
$exec('DELETE FROM intentos');
foreach (array_keys(['resumen' => 1, 'jugadores' => 1, 'compras' => 1, 'productos' => 1, 'mercado' => 1, 'chat' => 1, 'soporte' => 1, 'transferencias' => 1, 'ajustes' => 1, 'auditoria' => 1]) as $tab) {
    [$h, $html] = $adm('/admin.php?t=' . $tab, $AU, $AC);
    check("Pestaña $tab -> 200 con la barra de pestañas", [200, true], [$h, str_contains($html, 'class="tabs"') && str_contains($html, 'aria-current="page"')]);
}
[$h, $html] = $adm('/admin.php?t=resumen', $AU, $AC);
$dau = (int) $val('SELECT COUNT(*) FROM actividad WHERE dia = ?', [date('Y-m-d')]);
si('Resumen: DAU/MAU, ARPPU, más vendidos, por canal (web y Google) y créditos emitidos/quemados', $dau > 0 && str_contains($html, '<b id="dau-mau">' . $dau . ' / ') && str_contains($html, 'id="arppu"') && str_contains($html, 'id="tabla-mas-vendidos"') && str_contains($html, 'Google Play') && str_contains($html, 'id="creditos-quemados"'));
[$h, $html] = $admPost('productos', ['accion' => 'producto_guardar', 'producto' => 'creditos_700', 'precio' => '5.49', 'creditos' => '800', 'activo' => '1']);
$pt = array_values(array_filter((new Nav($URL, 'ver_tienda'))->apiGet('/api/estado')['tienda']['productos'], fn($p) => $p['id'] === 'creditos_700'))[0];
check('Editar precio y créditos -> la tienda lo muestra', [5.49, 800, 4.99, 700], [$pt['precio'], $pt['creditos'], $pt['precio_base'], $pt['creditos_base']]);
[$pc, $JPC] = $nuevo('Precio Nuevo');
$tokPc = $ordenar($pc, 'creditos_700');
check('…la orden nueva usa el precio nuevo (5,49 = 4,77 + 0,72) y 800 créditos', [5.49, 4.77, 0.72, 800], [(float) $compra($tokPc)['total'], (float) $compra($tokPc)['subtotal'], (float) $compra($tokPc)['iva'], (int) $compra($tokPc)['creditos']]);
[$h, $html] = $admPost('productos', ['accion' => 'oferta_crear', 'producto' => 'creditos_700', 'bono_pct' => '50', 'inicio' => '', 'fin' => date('Y-m-d\TH:i', time() + 3600)]);
$pt = array_values(array_filter((new Nav($URL, 'ver_tienda2'))->apiGet('/api/estado')['tienda']['productos'], fn($p) => $p['id'] === 'creditos_700'))[0];
check('Oferta +50 % por tiempo limitado -> 1.200 créditos con la oferta en la tienda', [1200, 50], [$pt['creditos'], $pt['oferta']['bono_pct'] ?? null]);
$tokOf = $ordenar($pc, 'creditos_700');
$exec('UPDATE ofertas SET activa = 0');
$pagar($pc, $tokOf, '4540639936908783');
check('…lo que se pagó con la oferta se entrega aunque la oferta termine (1.200 guardados en la compra)', [1200, 50, 1200], [(int) $compra($tokOf)['creditos'], (int) $compra($tokOf)['bono_pct'], $saldo($JPC)]);
$admPost('productos', ['accion' => 'producto_guardar', 'producto' => 'creditos_250', 'precio' => '1.99', 'creditos' => '250']);   // sin "activo" = apagado
check('Apagar un producto -> no sale en la tienda', false, in_array('creditos_250', array_column((new Nav($URL, 'ver_tienda3'))->apiGet('/api/estado')['tienda']['productos'], 'id'), true));
$r = $pc->api('/api/orden', ['producto' => 'creditos_250']);
check('…y no se puede ordenar (409 producto_inactivo)', [409, 'producto_inactivo'], [$pc->http, $r['codigo'] ?? null]);
$admPost('productos', ['accion' => 'producto_restaurar', 'producto' => 'creditos_250']);
$admPost('productos', ['accion' => 'producto_restaurar', 'producto' => 'creditos_700']);
check('Restaurar -> vuelven los valores de Catalogo.php', [true, 4.99], [in_array('creditos_250', array_column((new Nav($URL, 'ver_tienda4'))->apiGet('/api/estado')['tienda']['productos'], 'id'), true), array_values(array_filter((new Nav($URL, 'ver_tienda5'))->apiGet('/api/estado')['tienda']['productos'], fn($p) => $p['id'] === 'creditos_700'))[0]['precio']]);
check('Cada cambio de precio quedó en la auditoría', [true, true, true], [$auditado('producto_editar') >= 2, $auditado('oferta_crear') === 1, $auditado('producto_restaurar') === 2]);
[$h, $html] = $admPost('productos', ['accion' => 'producto_guardar', 'producto' => 'creditos_700', 'precio' => '0.10', 'creditos' => '700', 'activo' => '1']);
check('Precio menor a $0,50 -> rechazado', [true, false], [str_contains($html, 'El precio debe ser'), $val("SELECT precio FROM productos_ajustes WHERE producto = 'creditos_700'")]);
// Mantenimiento
$tokM = $ordenar($pc, 'creditos_250');
$admPost('ajustes', ['accion' => 'mantenimiento', 'activo' => '1', 'mensaje' => 'Volvemos a las 18:00']);
$e = $pc->apiGet('/api/estado');
check('Mantenimiento -> estado.mantenimiento activo con el mensaje', ['activo' => true, 'mensaje' => 'Volvemos a las 18:00'], $e['mantenimiento']);
$r = $pc->api('/api/orden', ['producto' => 'creditos_250']);
check('…no se pueden crear órdenes (503 mantenimiento)', [503, 'mantenimiento'], [$pc->http, $r['codigo'] ?? null]);
$r = $pagar($pc, $tokM, '4540639936908783');
check('…ni pagar una orden ya creada (503) sin llamar a Plux', [503, 'mantenimiento', 'pendiente'], [$pc->http, $r['codigo'] ?? null, $compra($tokM)['estado']]);
$r = $gp2->api('/api/google/verificar', ['producto' => 'creditos_250', 'purchaseToken' => 'ok-' . bin2hex(random_bytes(10))]);
check('…ni verificar compras nuevas de Google (503)', [503, 'mantenimiento'], [$gp2->http, $r['codigo'] ?? null]);
check('…pago.php muestra el mensaje de mantenimiento', [503, true], [$pc->get('/pago.php?o=' . $tokM), $pc->tiene('Volvemos a las 18:00')]);
$admPost('ajustes', ['accion' => 'mantenimiento', 'mensaje' => '']);
check('Quitar el mantenimiento -> se puede ordenar otra vez', 200, ($pc->api('/api/orden', ['producto' => 'creditos_250']) && true) ? $pc->http : 0);
$admPost('ajustes', ['accion' => 'anuncio', 'texto' => '¡Festival de Quito este sábado!', 'tipo' => 'evento', 'hasta' => '']);
$an = (new Nav($URL, 'anuncio'))->apiGet('/api/estado')['anuncio'];
check('Anuncio del sistema -> /api/estado.anuncio (también sin sesión)', ['¡Festival de Quito este sábado!', 'evento', null, true], [$an['texto'] ?? null, $an['tipo'] ?? null, array_key_exists('hasta', (array) $an) ? $an['hasta'] : 'x', strlen((string) ($an['id'] ?? '')) === 12]);
$admPost('ajustes', ['accion' => 'anuncio', 'texto' => '']);
check('…quitar el anuncio', null, (new Nav($URL, 'anuncio2'))->apiGet('/api/estado')['anuncio']);
check('Mantenimiento y anuncio en la auditoría', [true, true], [$auditado('mantenimiento') === 2, $auditado('anuncio') === 2]);
// Jugadores
[$h, $html] = $adm('/admin.php?t=jugadores&q=' . urlencode($emailFR), $AU, $AC);
si('Buscar jugador por correo', str_contains($html, 'id="tabla-jugadores"') && str_contains($html, $emailFR));
[$h, $html] = $adm('/admin.php?t=jugadores&id=' . $JFR, $AU, $AC);
si('Ficha del jugador: compras, libro, inventario, entregas, auditoría', str_contains($html, 'id="ficha-compras"') && str_contains($html, 'id="ficha-libro"') && str_contains($html, 'id="ficha-inventario"') && str_contains($html, 'id="ficha-entregas"') && str_contains($html, 'compra_reembolso'));
[$bn, $JBN, $emailBN, , $claveBN] = $nuevo('Baneado');
$admPost('jugadores&id=' . $JBN, ['accion' => 'cuenta_estado', 'jugador_id' => $JBN, 'estado' => 'baneado', 'motivo' => 'Trampas']);
check('Banear -> se cierran sus sesiones', [false, 'baneado'], [$bn->apiGet('/api/estado')['logueado'], $val('SELECT estado FROM jugadores WHERE id = ?', [$JBN])]);
$r = $bn->api('/api/entrar', ['email' => $emailBN, 'clave' => $claveBN]);
check('…y no puede entrar (403 cuenta_baneada)', [403, 'cuenta_baneada'], [$bn->http, $r['codigo'] ?? null]);
[$cs, $JCS, $emailCS] = $nuevo('Cerrar Sesiones');
$admPost('jugadores&id=' . $JCS, ['accion' => 'cerrar_sesiones', 'jugador_id' => $JCS]);
check('Cerrar sesiones de un jugador', [false, 1], [$cs->apiGet('/api/estado')['logueado'], $auditado('sesiones_cerrar', $JCS)]);
[$h, $csv] = $adm('/admin.php?a=csv&canal=google_play', $AU, $AC);
$lin = array_values(array_filter(explode("\n", trim($csv))));
check('CSV filtrado por canal google_play: solo compras de Google', [(int) $val("SELECT COUNT(*) FROM compras WHERE canal = 'google_play'"), true], [count($lin) - 1, array_reduce(array_slice($lin, 1), fn($c, $l) => $c && str_ends_with(trim($l), ';google_play'), true)]);
// Mercado: congelar y quitar
[$mv, $JMV] = $pagador('Mercado Moderado');
$darCreditos($JMV, 300);
$r = $mv->api('/api/gastar', ['item' => 'generador']);
$invMv = (int) $r['item']['id'];
$r = $mv->api('/api/mercado/publicar', ['inventario_id' => $invMv, 'precio' => 300]);
$pubMv = (int) $r['publicacion']['id'];
$admPost('mercado', ['accion' => 'mercado_congelar', 'publicacion_id' => $pubMv]);
$r = $x1->api('/api/mercado/comprar', ['publicacion_id' => $pubMv]);
check('Congelar una publicación -> nadie la puede comprar (409 congelada)', [409, 'congelada'], [$x1->http, $r['codigo'] ?? null]);
$admPost('mercado', ['accion' => 'mercado_quitar', 'publicacion_id' => $pubMv]);
check('Quitarla -> el equipo vuelve a la bodega del vendedor', ['quitada', 'bodega', true], [$val('SELECT estado FROM mercado_publicaciones WHERE id = ?', [$pubMv]), $val('SELECT estado FROM inventario WHERE id = ?', [$invMv]), in_array($invMv, array_column($mv->apiGet('/api/estado')['inventario'], 'id'), true)]);
check('…moderación del mercado en la auditoría', [1, 1], [$auditado('mercado_congelar', $JMV), $auditado('mercado_quitar', $JMV)]);
[$h, $html] = $adm('/admin.php?t=auditoria', $AU, $AC);
si('Pestaña Auditoría lista las acciones', str_contains($html, 'id="tabla-auditoria"') && str_contains($html, 'mercado_quitar'));

// =====================================================================
titulo('Soporte dentro del juego');
$exec('DELETE FROM intentos');
$r = (new Nav($URL, 'contacto'))->apiGet('/api/soporte/contacto');
check('GET /api/soporte/contacto (público): solo correo y horario, sin WhatsApp', ['ok' => true, 'correo' => 'soporte@prueba.example', 'horario' => 'Lunes a viernes 9:00-18:00'], $r);
[$so, $JSO] = $pagador('Soporte Uno');
$cso = (int) $val("SELECT id FROM compras WHERE jugador_id = ? AND estado = 'pagado'", [$JSO]);
$r = $so->api('/api/soporte', ['categoria' => 'pago', 'asunto' => 'No llegaron mis créditos', 'mensaje' => 'Pagué y no veo nada', 'compra_id' => $cso,
    'diagnostico' => ['version' => '1.4', 'dia' => 12, 'idioma' => 'es', 'email' => 'secreto@prueba.example', 'pantalla' => '390x844', 'tarjeta' => '4540639936908783']]);
$caso = (int) ($r['caso']['id'] ?? 0);
check('Crear caso -> abierto con su compra y el primer mensaje', [200, 'abierto', $cso, 1, 'jugador'], [$so->http, $r['caso']['estado'] ?? null, $r['caso']['compra_id'] ?? null, count($r['caso']['mensajes'] ?? []), $r['caso']['mensajes'][0]['autor'] ?? null]);
$diag = (string) $val('SELECT diagnostico_json FROM soporte_casos WHERE id = ?', [$caso]);
check('…el diagnóstico se guarda SIN datos sensibles (sin correo ni tarjeta)', [true, false, false], [str_contains($diag, '390x844'), str_contains($diag, 'secreto@'), str_contains($diag, '4540639936908783')]);
$so->api('/api/soporte', ['categoria' => 'pago', 'asunto' => 'x', 'mensaje' => 'y', 'compra_id' => $cF['id']]);
check('compra_id de OTRO jugador -> 400 compra_ajena', [400, 'compra_ajena'], [$so->http, json_decode($so->cuerpo, true)['codigo'] ?? null]);
$so->api('/api/soporte', ['categoria' => 'chisme', 'asunto' => 'x', 'mensaje' => 'y']);
check('Categoría inválida -> 400', [400, 'categoria_invalida'], [$so->http, json_decode($so->cuerpo, true)['codigo'] ?? null]);
$so->api('/api/soporte', ['categoria' => 'error', 'asunto' => 'x', 'mensaje' => 'y', 'diagnostico' => ['relleno' => str_repeat('a', 290), 'b' => str_repeat('b', 290), 'c' => array_fill(0, 30, str_repeat('c', 200))]]);
check('Diagnóstico de más de 4 KB -> 413', 413, $so->http);
$so->api('/api/soporte', ['categoria' => 'otro', 'asunto' => str_repeat('a', 81), 'mensaje' => 'y']);
check('Asunto de más de 80 -> 400', 400, $so->http);
check('estado.compras_recientes para elegir la compra', true, in_array($cso, array_column($so->apiGet('/api/estado')['compras_recientes'], 'id'), true));
// Centro de Control responde
[$h, $html] = $adm('/admin.php?t=soporte', $AU, $AC);
si('Bandeja de soporte: el caso con el jugador y la compra', str_contains($html, 'id="tabla-soporte"') && str_contains($html, 'No llegaron mis créditos'));
[$h, $html] = $adm('/admin.php?t=soporte&caso=' . $caso, $AU, $AC);
si('Ficha del caso: diagnóstico, enlace al jugador y a la compra, respuestas rápidas', str_contains($html, 'id="ficha-caso"') && str_contains($html, 'Diagnóstico del juego') && str_contains($html, 't=jugadores&amp;id=' . $JSO) && str_contains($html, 't=compras&amp;id=' . $cso) && str_contains($html, 'Pago acreditado'));
$rapida = (int) $val("SELECT id FROM soporte_respuestas WHERE titulo = 'Pago acreditado'");
$admPost('soporte&caso=' . $caso, ['accion' => 'soporte_responder', 'caso_id' => $caso, 'rapida_id' => $rapida]);
$e = $so->apiGet('/api/estado');
check('Responder con respuesta rápida -> soporte_sin_leer 1, caso respondido', [1, 'respondido'], [$e['soporte_sin_leer'], $val('SELECT estado FROM soporte_casos WHERE id = ?', [$caso])]);
$l = $so->apiGet('/api/soporte');
check('GET /api/soporte: el caso con la respuesta de soporte sin leer', [1, 'soporte', true], [$l['casos'][0]['sin_leer'] ?? null, end($l['casos'][0]['mensajes'])['autor'] ?? null, str_contains((string) end($l['casos'][0]['mensajes'])['texto'], 'acreditado')]);
$r = $so->api('/api/soporte/leido', ['caso_id' => $caso]);
check('Marcar leído -> 0 sin leer', [200, 0], [$so->http, $r['soporte_sin_leer'] ?? null]);
$r = $so->api('/api/soporte/responder', ['caso_id' => $caso, 'mensaje' => 'Ya lo vi, ¡gracias!']);
check('El jugador responde -> el caso vuelve a "abierto"', [200, 'abierto'], [$so->http, $r['caso']['estado'] ?? null]);
$x1->api('/api/soporte/responder', ['caso_id' => $caso, 'mensaje' => 'me meto']);
check('Responder un caso ajeno -> 404', 404, $x1->http);
$admPost('soporte&caso=' . $caso, ['accion' => 'soporte_cerrar', 'caso_id' => $caso]);
check('Cerrar desde el panel (y queda en la auditoría)', ['cerrado', 1], [$val('SELECT estado FROM soporte_casos WHERE id = ?', [$caso]), $auditado('soporte_cerrar', $JSO)]);
$admPost('soporte', ['accion' => 'respuesta_guardar', 'rapida_id' => 0, 'titulo' => 'Cuenta borrada', 'texto' => 'Tu cuenta fue borrada.']);
check('Respuestas rápidas editables', true, (bool) $val("SELECT 1 FROM soporte_respuestas WHERE titulo = 'Cuenta borrada'"));
for ($i = 0; $i < 4; $i++) $so->api('/api/soporte', ['categoria' => 'sugerencia', 'asunto' => 'Idea ' . $i, 'mensaje' => 'Una idea']);
$r = $so->api('/api/soporte', ['categoria' => 'sugerencia', 'asunto' => 'Idea 5', 'mensaje' => 'Otra idea']);
check('Con 4 casos abiertos se puede uno más (5) y el 6.º -> 409 max_casos', [200, 409], [$so->http, ($so->api('/api/soporte', ['categoria' => 'sugerencia', 'asunto' => 'Idea 6', 'mensaje' => 'x']) && true) ? $so->http : 0]);
$casoAbierto = (int) $val("SELECT id FROM soporte_casos WHERE jugador_id = ? AND estado = 'abierto' ORDER BY id DESC LIMIT 1", [$JSO]);
for ($i = 0; $i < 6; $i++) $so->api('/api/soporte/responder', ['caso_id' => $casoAbierto, 'mensaje' => 'insisto ' . $i]);
check('Más de 10 mensajes en una hora -> 429 limite_intentos', [429, 'limite_intentos'], [$so->http, json_decode($so->cuerpo, true)['codigo'] ?? null]);
$exec('DELETE FROM intentos');

// =====================================================================
titulo('Borrar la cuenta (LOPDP y Google Play)');
check('/borrar-cuenta.html se ve (pública) y explica cómo', [200, true, false], [$v->get('/borrar-cuenta.html'), $v->tiene('Borrar mi cuenta'), stripos($v->cuerpo, 'whatsapp') !== false]);
[$bo, $JBO, $emailBO, , $claveBO] = $pagador('Borra Cuenta');
$bo->api('/api/partida', ['datos' => '{"dia":3}']);
$bo->api('/api/perfil', ['alias' => 'Borrable TV']);
$espera = fn() => usleep(3100 * 1000);
$bo->api('/api/chat', ['canal' => 'servidor', 'texto' => 'Me voy del juego']);
$compraBO = (int) $val("SELECT id FROM compras WHERE jugador_id = ? AND estado = 'pagado'", [$JBO]);
$bo->api('/api/cuenta/borrar', ['clave' => $claveBO]);
check('Sin escribir BORRAR -> 400 confirmacion_requerida', [400, 'confirmacion_requerida'], [$bo->http, json_decode($bo->cuerpo, true)['codigo'] ?? null]);
$bo->api('/api/cuenta/borrar', ['clave' => 'mala-clave', 'confirmar' => 'BORRAR']);
check('Con la clave mala -> 401 clave_incorrecta', [401, 'clave_incorrecta'], [$bo->http, json_decode($bo->cuerpo, true)['codigo'] ?? null]);
$r = $bo->api('/api/cuenta/borrar', ['clave' => $claveBO, 'confirmar' => 'BORRAR']);
check('Borrar -> ok y la sesión se cierra', [200, true, false], [$bo->http, $r['borrada'] ?? null, $bo->apiGet('/api/estado')['logueado']]);
$jb = $fila('SELECT * FROM jugadores WHERE id = ?', [$JBO]);
check('…datos personales anonimizados', ['borrado-' . $JBO . '@invalid', 'Cuenta borrada', null, 'borrado'], [$jb['email'], $jb['nombre'], $jb['alias'], $jb['estado']]);
check('…partida, inventario, mensajes y sesiones borrados', [0, 0, 0, 0], [(int) $val('SELECT COUNT(*) FROM partidas WHERE jugador_id = ?', [$JBO]), (int) $val('SELECT COUNT(*) FROM inventario WHERE jugador_id = ?', [$JBO]), (int) $val('SELECT COUNT(*) FROM chat_mensajes WHERE jugador_id = ?', [$JBO]), (int) $val('SELECT COUNT(*) FROM sesiones WHERE jugador_id = ?', [$JBO])]);
check('…las compras se CONSERVAN con los datos de factura (SRI)', [true, '1710034065'], [(bool) $val('SELECT 1 FROM compras WHERE id = ?', [$compraBO]), $val('SELECT comprador_cedula FROM compras WHERE id = ?', [$compraBO])]);
$bo->api('/api/entrar', ['email' => $emailBO, 'clave' => $claveBO]);
check('…ya no se puede entrar con esos datos', 401, $bo->http);
$r = $bo->api('/api/registro', ['email' => $emailBO, 'nombre' => 'Vuelve', 'clave' => 'ClaveNueva2026']);
check('…y el correo queda libre para una cuenta NUEVA (sin nada de la anterior)', [200, true, 0], [$bo->http, ($r['jugador']['id'] ?? 0) !== $JBO, $r['creditos'] ?? null]);
check('Auditoría: cuenta_borrada', 1, $auditado('cuenta_borrada', $JBO));

