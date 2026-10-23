<?php
// SOLO PRUEBAS: lo incluye pruebas.php (usa sus ayudas: Nav, check, si, $nuevo, $ordenar, $pagar, $val, $fila, $exec, $saldo, $libro, $adm...).
// Mercado entre jugadores y equipos VIP (MERCADO.md) · servidores, perfil, asociaciones y chat (SOCIAL.md).
if (PHP_SAPI !== 'cli' || !isset($nuevo)) { http_response_code(404); exit; }

$darCreditos = function (int $j, int $n) use ($exec) {
    // como Monedero::mover: si tiene deuda (reembolso), lo que recibe primero la paga
    $exec('UPDATE jugadores SET creditos = MAX(0, creditos - deuda + ?), deuda = MAX(0, deuda - creditos - ?) WHERE id = ?', [$n, $n, $j]);
    $exec("INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (?, ?, (SELECT creditos - deuda FROM jugadores WHERE id = ?), 'manual', 'prueba', ?)", [$j, $n, $j, time()]);
};
/** Jugador con una compra pagada de 250 créditos (para tener acceso al mercado). */
$pagador = function (string $nombre) use ($nuevo, $ordenar, $pagar): array {
    [$nav, $id, $email, , $clave] = $nuevo($nombre);
    $r = $pagar($nav, $ordenar($nav, 'creditos_250'), '4540639936908783');
    if (($r['status'] ?? '') !== 'success') echo "  (aviso: la compra de $nombre no salió: " . json_encode($r) . ")\n";
    return [$nav, $id, $email, null, $clave];
};
$canjear = fn(Nav $nav, string $item) => $nav->api('/api/gastar', ['item' => $item]);
$multi = function (array $pedidos): array {   // [[galleta, ruta, cuerpo], ...] todos a la vez -> [[http, json], ...]
    $mh = curl_multi_init(); $hs = [];
    foreach ($pedidos as [$tok, $ruta, $cuerpo]) {
        $h = curl_init(getenv('EV_URL') . $ruta);
        curl_setopt_array($h, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($cuerpo), CURLOPT_COOKIE => 'envivo_s=' . $tok,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Envivo: 1']]);
        curl_multi_add_handle($mh, $h); $hs[] = $h;
    }
    do { curl_multi_exec($mh, $corriendo); curl_multi_select($mh); } while ($corriendo > 0);
    return array_map(fn($h) => [(int) curl_getinfo($h, CURLINFO_HTTP_CODE), json_decode((string) curl_multi_getcontent($h), true)], $hs);
};

// =====================================================================
titulo('Equipos VIP (solo con VIP activo) e inventario con número de serie');
[$v1, $JV1] = $pagador('Valeria Vip');
$darCreditos($JV1, 5000);
$r = $canjear($v1, 'vip_cam8k');
check('Canjear un equipo VIP sin VIP -> 403 con motivo, sin gastar', [403, 'vip_requerido', true, 5250], [$v1->http, $r['motivo'] ?? null, str_contains((string) ($r['error'] ?? ''), 'VIP'), $saldo($JV1)]);
$pagar($v1, $ordenar($v1, 'vip30'), '4540639936908783');
$r = $canjear($v1, 'vip_cam8k');
check('Con VIP activo -> canje: inventario vip_cam8k serie 1, -800', [200, 'vip_cam8k', 1, 4450], [$v1->http, $r['item']['item'] ?? null, $r['item']['serie'] ?? null, $r['creditos'] ?? null]);
$canjear($v1, 'vip_switcher'); $canjear($v1, 'vip_satelital');
$r = $canjear($v1, 'dron4k');
$seriesDron = (int) $val("SELECT COUNT(*) FROM inventario WHERE item = 'dron4k'");
check('Números de serie por tipo (el dron sigue su propia cuenta)', [$seriesDron, 1, 1], [$r['item']['serie'] ?? null, (int) $val("SELECT serie FROM inventario WHERE item = 'vip_switcher'"), (int) $val("SELECT serie FROM inventario WHERE item = 'vip_satelital'")]);
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() - 60, $JV1]);
$ev = $v1->apiGet('/api/estado');
check('VIP vencido: los equipos VIP SIGUEN en su inventario', ['vip_cam8k', 'vip_switcher', 'vip_satelital', 'dron4k'], array_column($ev['inventario'], 'item'));
check('…estado.inventario: id, item, serie, origen, estado', ['id', 'item', 'serie', 'origen', 'estado'], array_slice(array_keys($ev['inventario'][0]), 0, 5));
check('…mercado {puede, motivo, comision}', ['puede' => true, 'motivo' => '', 'comision' => 0.05], $ev['mercado']);
$canjear($v1, 'vip_cam8k');
check('…pero no puede canjear otro VIP', 403, $v1->http);

// =====================================================================
titulo('Mercado: acceso solo con una compra pagada');
[$sin, $JSIN] = $nuevo('Sin Compra');
$darCreditos($JSIN, 1000);
$m = $sin->apiGet('/api/mercado');
check('Sin compras: puede ver (200) en modo lectura con motivo', [200, false, true, true], [$sin->http, $m['puede'] ?? null, str_contains((string) ($m['motivo'] ?? ''), 'primera compra'), is_array($m['publicaciones'] ?? null)]);
check('…estado.mercado.puede false', false, $sin->apiGet('/api/estado')['mercado']['puede']);
$r = $canjear($sin, 'generador');
$invSin = (int) ($r['item']['id'] ?? 0);
$r = $sin->api('/api/mercado/publicar', ['inventario_id' => $invSin, 'precio' => 300]);
check('Sin compras: publicar -> 403 sin_acceso (aunque tenga equipo)', [403, 'sin_acceso'], [$sin->http, $r['codigo'] ?? null]);
$v->get('/api/mercado');
check('Sin sesión: GET /api/mercado -> 401', 401, $v->http);
$sin->api('/api/mercado/publicar', ['inventario_id' => $invSin, 'precio' => 300], false);
check('Publicar sin X-Envivo -> 403', 403, $sin->http);

// =====================================================================
titulo('Mercado: publicar');
[$ven, $JVEN, $emailVen] = $pagador('Pedro Vendedor Ruiz');
$darCreditos($JVEN, 20000);
$inv = [];
for ($i = 0; $i < 12; $i++) { $r = $canjear($ven, 'kit_reparacion' === 'x' ? '' : 'generador'); $inv[] = (int) $r['item']['id']; }
check('El vendedor tiene 12 generadores en su bodega', 12, count($ven->apiGet('/api/estado')['inventario']));
foreach ([9, 100001, 0, -5, 10.5, '12a', '', null, 'cien'] as $malo) {
    $r = $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[0], 'precio' => $malo]);
    check('Precio ' . json_encode($malo) . ' -> 400 precio', [400, 'precio'], [$ven->http, $r['codigo'] ?? null]);
}
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[1], 'precio' => 10]);
check('Precio mínimo 10 -> ok', [200, 10], [$ven->http, $r['publicacion']['precio'] ?? null]);
$ven->api('/api/mercado/retirar', ['publicacion_id' => $r['publicacion']['id']]);
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[1], 'precio' => '751']);
check('Precio máximo por equipo (A-01): generador 751 -> 400 con precio_max 750', [400, 'precio', 750], [$ven->http, $r['codigo'] ?? null, $r['precio_max'] ?? null]);
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[1], 'precio' => '750']);
check('Precio máximo del generador 750 (como texto de dígitos) -> ok', [200, 750], [$ven->http, $r['publicacion']['precio'] ?? null]);
$ven->api('/api/mercado/retirar', ['publicacion_id' => $r['publicacion']['id']]);
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[0], 'precio' => 520]);
$pub0 = $r['publicacion'] ?? [];
check('Publicar -> publicación con item, serie, precio, vendedor "Pedro R.", vence en 7 días, mia', [200, 'generador', 520, 'Pedro R.', true, true],
    [$ven->http, $pub0['item'] ?? null, $pub0['precio'] ?? null, $pub0['vendedor'] ?? null, $pub0['mia'] ?? null, abs(strtotime((string) ($pub0['vence'] ?? '')) - strtotime((string) ($pub0['publicado'] ?? '')) - 7 * 86400) < 5]);
check('…el equipo sale de la bodega al instante (no está en inventario)', false, in_array($inv[0], array_column($r['inventario'] ?? [], 'id'), true));
check('…ni en /api/estado', false, in_array($inv[0], array_column($ven->apiGet('/api/estado')['inventario'], 'id'), true));
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[0], 'precio' => 600]);
check('Publicar el mismo equipo otra vez -> 409', [409, 'ya_publicado'], [$ven->http, $r['codigo'] ?? null]);
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $invSin, 'precio' => 600]);
check('Publicar un equipo de otro -> 404', 404, $ven->http);
for ($i = 2; $i <= 10; $i++) $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[$i], 'precio' => 500 + $i]);
check('10 publicaciones activas', 10, (int) $val("SELECT COUNT(*) FROM mercado_publicaciones WHERE vendedor_id = ? AND estado = 'activa'", [$JVEN]));
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $inv[11], 'precio' => 700]);
check('La 11.ª -> 409 maximo', [409, 'maximo'], [$ven->http, $r['codigo'] ?? null]);
$m = $ven->apiGet('/api/mercado');
check('GET /api/mercado: claves de MERCADO.md', [], array_values(array_diff(['ok', 'puede', 'motivo', 'comision', 'publicaciones', 'mis_publicaciones', 'precios'], array_keys($m))));
check('…mis_publicaciones (10, todas mia)', [10, true], [count($m['mis_publicaciones']), array_reduce($m['mis_publicaciones'], fn($c, $x) => $c && $x['mia'] === true, true)]);
si('…ordenado por precio (de menor a mayor)', array_column($m['publicaciones'], 'precio') === (function ($a) { sort($a); return $a; })(array_column($m['publicaciones'], 'precio')));
si('…publicaciones con el formato de MERCADO.md', count(array_intersect(['id', 'item', 'serie', 'precio', 'vendedor', 'publicado', 'vence', 'mia'], array_keys($m['publicaciones'][0] ?? []))) === 8);
si('…el vendedor nunca muestra el correo', !str_contains(json_encode($m), $emailVen) && !str_contains(json_encode($m), '@'));
check('…precios: mínimo publicado del generador', 502, $m['precios']['generador']['minimo_publicado'] ?? null);
$mr = $ven->apiGet('/api/mercado?orden=reciente&item=generador');
check('?orden=reciente&item=generador -> el más nuevo primero, solo generadores', [true, ['generador']], [($mr['publicaciones'][0]['id'] ?? 0) > ($mr['publicaciones'][1]['id'] ?? 0), array_values(array_unique(array_column($mr['publicaciones'], 'item')))]);
$ven->get('/api/mercado?item=nave');
check('?item= que no existe -> 400', 400, $ven->http);

titulo('Mercado: retirar');
$pubX = (int) $val("SELECT id FROM mercado_publicaciones WHERE vendedor_id = ? AND estado = 'activa' AND precio = 510", [$JVEN]);
$r = $sin->api('/api/mercado/retirar', ['publicacion_id' => $pubX]);
check('Retirar una publicación ajena -> 404', 404, $sin->http);
$r = $ven->api('/api/mercado/retirar', ['publicacion_id' => $pubX]);
check('Retirar -> {ok} y el equipo vuelve a la bodega', [200, true, 'bodega'], [$ven->http, in_array((int) $r['item']['id'], array_column($r['inventario'], 'id'), true), $r['item']['estado'] ?? null]);
$r = $ven->api('/api/mercado/retirar', ['publicacion_id' => $pubX]);
check('Retirar otra vez -> 409', 409, $ven->http);

// =====================================================================
titulo('Mercado: comprar (comisión 5 %, libro de los dos, serie igual)');
[$com, $JCOM, $emailCom] = $pagador('Carla Compradora');
$saldoCom = $saldo($JCOM);
$r = $com->api('/api/mercado/comprar', ['publicacion_id' => $pub0['id']]);
check('Sin créditos suficientes -> 402 sin_creditos, nada cambia', [402, 'sin_creditos', $saldoCom, 'activa'], [$com->http, $r['codigo'] ?? null, $saldo($JCOM), $val('SELECT estado FROM mercado_publicaciones WHERE id = ?', [$pub0['id']])]);
$darCreditos($JCOM, 1000);
$saldoCom = $saldo($JCOM); $saldoVen = $saldo($JVEN);
$r = $ven->api('/api/mercado/comprar', ['publicacion_id' => $pub0['id']]);
check('Comprar lo propio -> 400 propia', [400, 'propia'], [$ven->http, $r['codigo'] ?? null]);
$serieAntes = (int) $val('SELECT serie FROM inventario WHERE id = ?', [$inv[0]]);
$r = $com->api('/api/mercado/comprar', ['publicacion_id' => $pub0['id']]);
check('Comprar a 520 -> {ok, creditos: saldo-520, item}', [200, $saldoCom - 520, $inv[0], 'generador', $serieAntes, 'mercado', 'bodega'],
    [$com->http, $r['creditos'] ?? null, $r['item']['id'] ?? null, $r['item']['item'] ?? null, $r['item']['serie'] ?? null, $r['item']['origen'] ?? null, $r['item']['estado'] ?? null]);
check('Vendedor: floor(520 × 0,95) = 494 RETENIDOS 7 días (A-01), aún no gastables; comisión 26 quemada', [$saldoVen, 494, 26], [$saldo($JVEN), (int) $val('SELECT pago_vendedor FROM mercado_publicaciones WHERE id = ?', [$pub0['id']]), (int) $val('SELECT comision FROM mercado_publicaciones WHERE id = ?', [$pub0['id']])]);
check('…libro del comprador: mercado_compra -520', ['mercado_compra', -520], array_values($fila('SELECT motivo, cambio FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$JCOM])));
check('…retención de 494 que se libera en 7 días; estado.creditos_retenidos', ['retenido', 494, true, 494], [$val('SELECT estado FROM mercado_retenciones WHERE publicacion_id = ?', [$pub0['id']]), (int) $val('SELECT creditos FROM mercado_retenciones WHERE publicacion_id = ?', [$pub0['id']]),
    cerca((int) $val('SELECT libera FROM mercado_retenciones WHERE publicacion_id = ?', [$pub0['id']]), time() + 7 * 86400), $ven->apiGet('/api/estado')['creditos_retenidos'] ?? null]);
$exec('UPDATE mercado_retenciones SET libera = ? WHERE publicacion_id = ?', [time() - 1, $pub0['id']]);
$ev = $ven->apiGet('/api/estado');
check('Pasados los 7 días: se libera al consultar (+494 al saldo) y el libro anota mercado_venta +494', [$saldoVen + 494, 0, ['mercado_venta', 494]],
    [$ev['creditos'], $ev['creditos_retenidos'], array_values($fila('SELECT motivo, cambio FROM movimientos_creditos WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$JVEN]))]);
check('…el equipo es del comprador y está en su inventario', [$JCOM, true, false], [(int) $val('SELECT jugador_id FROM inventario WHERE id = ?', [$inv[0]]),
    in_array($inv[0], array_column($com->apiGet('/api/estado')['inventario'], 'id'), true), in_array($inv[0], array_column($ven->apiGet('/api/estado')['inventario'], 'id'), true)]);
$r = $com->api('/api/mercado/comprar', ['publicacion_id' => $pub0['id']]);
check('Comprar lo ya vendido -> 409 vendida', [409, 'vendida'], [$com->http, $r['codigo'] ?? null]);
$r = $com->api('/api/mercado/retirar', ['publicacion_id' => $pub0['id']]);
check('El comprador no puede "retirar" la publicación vendida', 404, $com->http);
$r = $com->api('/api/mercado/comprar', ['publicacion_id' => $pubX]);
check('Comprar una retirada -> 409 retirada', [409, 'retirada'], [$com->http, $r['codigo'] ?? null]);
$m = $com->apiGet('/api/mercado');
check('Precios: último 520, vendidos_7d 1', [520, 1], [$m['precios']['generador']['ultimo'] ?? null, $m['precios']['generador']['vendidos_7d'] ?? null]);
check('…mis_ventas del vendedor muestra la venta', [520, 494, 26], (function ($x) { return [$x['precio'] ?? null, $x['recibido'] ?? null, $x['comision'] ?? null]; })($ven->apiGet('/api/mercado')['mis_ventas'][0] ?? []));
// El comprador vuelve a vender lo comprado (la serie no cambia) y un precio impar redondea hacia abajo
$r = $com->api('/api/mercado/publicar', ['inventario_id' => $inv[0], 'precio' => 749]);
$pubRev = (int) ($r['publicacion']['id'] ?? 0);
check('El comprador puede revender el equipo (misma serie)', [200, $serieAntes], [$com->http, $r['publicacion']['serie'] ?? null]);
$ven->api('/api/mercado/comprar', ['publicacion_id' => $pubRev]);
check('Precio 749 -> vendedor recibe 711 (floor de 711,55, retenidos), comisión 38', [200, 711, 38], [$ven->http, (int) $val('SELECT creditos FROM mercado_retenciones WHERE publicacion_id = ?', [$pubRev]), (int) $val('SELECT comision FROM mercado_publicaciones WHERE id = ?', [$pubRev])]);
$out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/tareas.php') . ' 2>&1');
check('La tarea diaria no libera antes de tiempo', 'retenido', $val('SELECT estado FROM mercado_retenciones WHERE publicacion_id = ?', [$pubRev]));
$exec('UPDATE mercado_retenciones SET libera = ? WHERE publicacion_id = ?', [time() - 1, $pubRev]);
$sv = $saldo($JCOM);
$out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/tareas.php') . ' 2>&1');
check('…y cuando cumple los 7 días la tarea diaria lo libera', [true, 'liberado', $sv + 711], [str_contains((string) $out, '1 ventas liberadas'), $val('SELECT estado FROM mercado_retenciones WHERE publicacion_id = ?', [$pubRev]), $saldo($JCOM)]);

titulo('Mercado: dos compradores a la vez -> solo uno gana');
$pubC = (int) $val("SELECT id FROM mercado_publicaciones WHERE vendedor_id = ? AND estado = 'activa' ORDER BY precio LIMIT 1", [$JVEN]);
$precioC = (int) $val('SELECT precio FROM mercado_publicaciones WHERE id = ?', [$pubC]);
$compradores = [];
for ($i = 0; $i < 6; $i++) { $c = $pagador('Carrera ' . $i); $darCreditos($c[1], 2000); $compradores[] = $c; }
$antes = array_map(fn($c) => $saldo($c[1]), $compradores);
$sVen = $saldo($JVEN);
$res = $multi(array_map(fn($c) => [$c[0]->token(), '/api/mercado/comprar', ['publicacion_id' => $pubC]], $compradores));
$cod = array_column($res, 0); sort($cod);
check('6 compras simultáneas de la misma publicación -> 1 × 200 y 5 × 409', [200, 409, 409, 409, 409, 409], $cod);
$ganador = array_search(200, array_column($res, 0), true);
$cobrados = 0; foreach ($compradores as $k => $c) if ($saldo($c[1]) !== $antes[$k]) $cobrados++;
check('…solo al ganador se le cobró, el vendedor tiene UNA retención', [1, $antes[$ganador] - $precioC, $sVen, 1, (int) floor($precioC * 0.95)], [$cobrados, $saldo($compradores[$ganador][1]), $saldo($JVEN), (int) $val('SELECT COUNT(*) FROM mercado_retenciones WHERE publicacion_id = ?', [$pubC]), (int) $val('SELECT creditos FROM mercado_retenciones WHERE publicacion_id = ?', [$pubC])]);
check('…el equipo es del ganador', (int) $compradores[$ganador][1], (int) $val('SELECT jugador_id FROM inventario WHERE id = (SELECT inventario_id FROM mercado_publicaciones WHERE id = ?)', [$pubC]));
check('…una sola venta anotada para esa publicación', 1, (int) $val("SELECT COUNT(*) FROM movimientos_creditos WHERE motivo = 'mercado_compra' AND ref LIKE ?", ['mercado:' . $pubC . ':%']));
// Comprar dos publicaciones a la vez con créditos para una sola
[$pobre, $JPOB] = $pagador('Pobre Paralelo');
$exec('UPDATE jugadores SET creditos = 0 WHERE id = ?', [$JPOB]); $exec('DELETE FROM movimientos_creditos WHERE jugador_id = ?', [$JPOB]);
$darCreditos($JPOB, 600);
$dos = array_map('intval', array_column(Db_todas($pdo, "SELECT id FROM mercado_publicaciones WHERE vendedor_id = ? AND estado = 'activa' AND precio BETWEEN 503 AND 509 ORDER BY id LIMIT 2", [$JVEN]), 'id'));
$res = $multi([[$pobre->token(), '/api/mercado/comprar', ['publicacion_id' => $dos[0]]], [$pobre->token(), '/api/mercado/comprar', ['publicacion_id' => $dos[1]]]]);
$cod = array_column($res, 0); sort($cod);
check('Mismo comprador, 2 compras a la vez con créditos para 1 -> 200 + 402, saldo nunca negativo', [[200, 402], true, 1], [$cod, $saldo($JPOB) >= 0 && $saldo($JPOB) < 100, (int) $val("SELECT COUNT(*) FROM mercado_publicaciones WHERE comprador_id = ?", [$JPOB])]);

titulo('Mercado: vencen a los 7 días y el equipo vuelve solo');
$pubV = (int) $val("SELECT id FROM mercado_publicaciones WHERE vendedor_id = ? AND estado = 'activa' ORDER BY id DESC LIMIT 1", [$JVEN]);
$invV = (int) $val('SELECT inventario_id FROM mercado_publicaciones WHERE id = ?', [$pubV]);
$exec('UPDATE mercado_publicaciones SET vence = ? WHERE id = ?', [time() - 1, $pubV]);
$r = $com->api('/api/mercado/comprar', ['publicacion_id' => $pubV]);
check('Comprar una vencida -> 410 vencida, nada se cobra', [410, 'vencida'], [$com->http, $r['codigo'] ?? null]);
check('…y al consultar, el equipo ya volvió a la bodega del dueño', ['vencida', 'bodega', true], [$val('SELECT estado FROM mercado_publicaciones WHERE id = ?', [$pubV]), $val('SELECT estado FROM inventario WHERE id = ?', [$invV]), in_array($invV, array_column($ven->apiGet('/api/estado')['inventario'], 'id'), true)]);
$pubV2 = (int) $val("SELECT id FROM mercado_publicaciones WHERE vendedor_id = ? AND estado = 'activa' ORDER BY id DESC LIMIT 1", [$JVEN]);
$exec('UPDATE mercado_publicaciones SET vence = ? WHERE id = ?', [time() - 1, $pubV2]);
$out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/tareas.php') . ' 2>&1');
check('La tarea diaria (bin/tareas.php) devuelve las vencidas', [true, 'vencida', 'bodega'], [str_contains((string) $out, 'tareas OK: 1 publicaciones vencidas'), $val('SELECT estado FROM mercado_publicaciones WHERE id = ?', [$pubV2]), $val('SELECT estado FROM inventario WHERE id = (SELECT inventario_id FROM mercado_publicaciones WHERE id = ?)', [$pubV2])]);
$r = $ven->api('/api/mercado/retirar', ['publicacion_id' => $pubV2]);
check('Retirar una vencida -> 409', 409, $ven->http);
$r = $ven->api('/api/mercado/publicar', ['inventario_id' => $invV, 'precio' => 450]);
check('El equipo vencido se puede volver a publicar', 200, $ven->http);

// =====================================================================
titulo('Servidores y perfil público');
check('Jugadores nuevos entran al Servidor 1 · Quito', ['id' => 1, 'nombre' => 'Servidor 1 · Quito'], $com->apiGet('/api/estado')['servidor']);
$exec('UPDATE servidores SET capacidad = ? WHERE id = 1', [(int) $val('SELECT COUNT(*) FROM jugadores WHERE servidor_id = 1')]);
[$s2a, $JS2A] = $nuevo('Segundo Server');
$e2 = $s2a->apiGet('/api/estado');
check('Servidor 1 lleno -> se abre el Servidor 2 y el nuevo jugador entra ahí', [2, 'Servidor 2 · Guayaquil', 0], [$e2['servidor']['id'] ?? null, $e2['servidor']['nombre'] ?? null, (int) $val('SELECT abierto FROM servidores WHERE id = 1')]);
[$s2b, $JS2B] = $nuevo('Segundo Bis');
check('…el siguiente también va al servidor abierto más nuevo', 2, $s2b->apiGet('/api/estado')['servidor']['id'] ?? null);
$exec('UPDATE servidores SET capacidad = 1000, abierto = 1 WHERE id = 1');
$exec('UPDATE servidores SET abierto = 0 WHERE id = 2');   // para que los siguientes jugadores de la prueba vuelvan al Servidor 1
$r = $com->api('/api/perfil', ['alias' => 'Producciones Ñandú']);
check('Alias con tildes y ñ -> ok', [200, 'Producciones Ñandú'], [$com->http, $r['perfil']['alias'] ?? null]);
$r = $ven->api('/api/perfil', ['alias' => 'producciones ñandú']);
check('El mismo alias en el mismo servidor (otra mayúscula) -> 409', [409, 'alias_ocupado'], [$ven->http, $r['codigo'] ?? null]);
$r = $s2a->api('/api/perfil', ['alias' => 'Producciones Ñandú']);
check('…pero en OTRO servidor sí se puede', 200, $s2a->http);
foreach (['ab' => 'alias', str_repeat('x', 25) => 'alias', 'Pinga Films' => 'groseria', 'Visita www.x.com' => 'contacto', 'Llama 0991234567' => 'contacto', '<script>' => 'alias'] as $malo => $cod) {
    $r = $ven->api('/api/perfil', ['alias' => $malo]);
    check('Alias ' . json_encode($malo) . " -> 400 $cod", [400, $cod], [$ven->http, $r['codigo'] ?? null]);
}
$r = $ven->api('/api/perfil', ['alias' => 'Ruiz TV']);
check('Alias válido', 'Ruiz TV', $r['perfil']['alias'] ?? null);
$r = $ven->api('/api/perfil', ['fama' => 10]);
check('Fama 10 -> aceptada', [10, 10], [$r['fama_aceptada'] ?? null, $r['perfil']['fama'] ?? null]);
$r = $ven->api('/api/perfil', ['fama' => 90]);
check('Fama 90 el mismo día -> tope +15 sobre el inicio del día (15)', 15, $r['fama_aceptada'] ?? null);
$r = $ven->api('/api/perfil', ['fama' => 5]);
check('Fama puede bajar', 5, $r['fama_aceptada'] ?? null);
$exec('UPDATE jugadores SET fama_dia = ? WHERE id = ?', [date('Y-m-d', strtotime('-1 day')), $JVEN]);
$r = $ven->api('/api/perfil', ['fama' => 90]);
check('Al día siguiente: tope desde la fama actual (5 + 15)', 20, $r['fama_aceptada'] ?? null);
$ven->api('/api/perfil', ['fama' => 'mucha']);
check('Fama que no es número -> 400', 400, $ven->http);
check('estado.perfil', ['alias' => 'Ruiz TV', 'nombre_publico' => 'Ruiz TV', 'fama' => 20, 'chat_sancion' => null], $ven->apiGet('/api/estado')['perfil']);
check('Sin alias, el nombre público es el nombre (+ inicial del apellido), nunca el correo', 'Carrera', $compradores[0][0]->apiGet('/api/estado')['perfil']['nombre_publico']);

// =====================================================================
titulo('Asociaciones');
$p1 = $ven;   // presidente (Ruiz TV) — no tiene VIP
$asocBase = ['nombre' => 'Los Productores', 'siglas' => 'qfp', 'color' => '#ff3b3b', 'descripcion' => 'Transmisiones de Quito', 'ingreso' => 'abierto'];
$r = $p1->api('/api/asociaciones/crear', $asocBase);
check('Sin VIP y sin pagado_en_juego -> 402 (cuesta $5.000 del juego)', [402, 'sin_pago', 5000], [$p1->http, $r['codigo'] ?? null, $r['costo'] ?? null]);
$r = $p1->api('/api/asociaciones/crear', $asocBase + ['pagado_en_juego' => 'si']);
check('pagado_en_juego debe ser true (no "si")', 402, $p1->http);
foreach ([['siglas' => 'AB'], ['siglas' => 'ABCD'], ['nombre' => 'xx'], ['color' => 'rojo'], ['nombre' => 'Los Hijueputas'], ['descripcion' => 'escribe a a@b.com']] as $mal) {
    $p1->api('/api/asociaciones/crear', $mal + $asocBase + ['pagado_en_juego' => true]);
    check('Crear con ' . json_encode($mal, JSON_UNESCAPED_UNICODE) . ' -> 400', 400, $p1->http);
}
$r = $p1->api('/api/asociaciones/crear', $asocBase + ['pagado_en_juego' => true, 'logo' => ['forma' => 'escudo', 'icono' => 'camara']]);
$AS1 = (int) ($r['asociacion']['id'] ?? 0);
check('Crear pagando en el juego -> presidente, siglas en mayúsculas, cobrar_en_juego 5000', [200, 'QFP', 'presidente', 5000], [$p1->http, $r['asociacion']['siglas'] ?? null, $r['asociacion']['cargo'] ?? null, $r['cobrar_en_juego'] ?? null]);
check('estado.asociacion', ['id' => $AS1, 'nombre' => 'Los Productores', 'siglas' => 'QFP', 'color' => '#ff3b3b', 'cargo' => 'presidente'], $p1->apiGet('/api/estado')['asociacion']);
$p1->api('/api/asociaciones/crear', ['nombre' => 'Otra', 'siglas' => 'OTR'] + $asocBase + ['pagado_en_juego' => true]);
check('Un jugador, una asociación: crear otra -> 409', 409, $p1->http);
$r = $v1->api('/api/asociaciones/crear', ['nombre' => 'los productores', 'siglas' => 'ZZZ'] + $asocBase + ['pagado_en_juego' => true]);
check('Nombre repetido en el servidor -> 409', [409, 'nombre_ocupado'], [$v1->http, $r['codigo'] ?? null]);
$r = $v1->api('/api/asociaciones/crear', ['nombre' => 'Vip Media', 'siglas' => 'QFP'] + $asocBase + ['pagado_en_juego' => true]);
check('Siglas repetidas en el servidor -> 409', [409, 'siglas_ocupadas'], [$v1->http, $r['codigo'] ?? null]);
$exec('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [time() + 86400, $JV1]);
$r = $v1->api('/api/asociaciones/crear', ['nombre' => 'Vip Media', 'siglas' => 'VIP', 'color' => '#ffb020', 'ingreso' => 'solicitud']);
$AS2 = (int) ($r['asociacion']['id'] ?? 0);
check('Con VIP activo: crear GRATIS (cobrar_en_juego 0)', [200, 0], [$v1->http, $r['cobrar_en_juego'] ?? null]);
$r = $s2a->api('/api/asociaciones/unirse', ['id' => $AS1]);
check('Unirse a una asociación de OTRO servidor -> 404', 404, $s2a->http);
$miembros = [$com];
$r = $com->api('/api/asociaciones/unirse', ['id' => $AS1]);
check('Unirse (ingreso abierto) -> miembro socio', [200, 'miembro', 'socio'], [$com->http, $r['estado'] ?? null, $r['asociacion']['cargo'] ?? null]);
$com->api('/api/asociaciones/unirse', ['id' => $AS2]);
check('Ya es miembro de una -> no puede unirse a otra (409)', 409, $com->http);
foreach ($compradores as $c) { $c[0]->api('/api/asociaciones/unirse', ['id' => $AS1]); $miembros[] = $c[0]; }
$lista = $p1->apiGet('/api/asociaciones?buscar=produc');
check('GET /api/asociaciones?buscar=produc -> la encuentra con 8 miembros', [true, 8], [in_array($AS1, array_column($lista['asociaciones'], 'id'), true), $lista['mi_asociacion']['miembros'] ?? null]);
si('…mi_asociacion trae la lista de miembros con cargo y nombre público (sin correos)', count($lista['mi_asociacion']['lista'] ?? []) === 8 && ($lista['mi_asociacion']['lista'][0]['cargo'] ?? '') === 'presidente' && !str_contains(json_encode($lista), '@'));
check('…buscar con % no rompe ni trae todo', 0, count($p1->apiGet('/api/asociaciones?buscar=%25%25')['asociaciones']));
// Llenar hasta 20
$extra = [];
for ($i = (int) $val('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$AS1]); $i < 20; $i++) { [$x] = $nuevo('Relleno ' . $i); $x->api('/api/asociaciones/unirse', ['id' => $AS1]); $extra[] = $x; }
check('La asociación llega a 20 miembros', 20, (int) $val('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$AS1]));
[$x21] = $nuevo('Veintiuno');
$r = $x21->api('/api/asociaciones/unirse', ['id' => $AS1]);
check('El 21.º -> 409 llena', [409, 'llena'], [$x21->http, $r['codigo'] ?? null]);
// 3 entran a la vez a una asociación con 1 lugar libre
$extra[0]->api('/api/asociaciones/salir');
$tres = [$x21]; for ($i = 0; $i < 2; $i++) { [$x] = $nuevo('Carrera Asoc ' . $i); $tres[] = $x; }
$res = $multi(array_map(fn($x) => [$x->token(), '/api/asociaciones/unirse', ['id' => $AS1]], $tres));
$cod = array_column($res, 0); sort($cod);
check('3 se unen a la vez con 1 lugar libre -> solo 1 entra, nunca más de 20', [[200, 409, 409], 20], [$cod, (int) $val('SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ?', [$AS1])]);
// Cargos
$JC0 = (int) $compradores[0][1]; $JC1 = (int) $compradores[1][1];
$com->api('/api/asociaciones/cargo', ['jugador_id' => $JC0, 'cargo' => 'vicepresidente']);
check('Un socio no puede cambiar cargos -> 403', 403, $com->http);
$r = $p1->api('/api/asociaciones/cargo', ['jugador_id' => $JC0, 'cargo' => 'vicepresidente']);
check('Presidente nombra vicepresidente', [200, 'vicepresidente'], [$p1->http, $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [$JC0])]);
$p1->api('/api/asociaciones/cargo', ['jugador_id' => $JC0, 'cargo' => 'rey']);
check('Cargo inválido -> 400', 400, $p1->http);
$p1->api('/api/asociaciones/cargo', ['jugador_id' => (int) $JV1, 'cargo' => 'socio']);
check('Cambiar cargo a alguien de otra asociación -> 404', 404, $p1->http);
// Expulsar
$vice = $compradores[0][0];
$vice->api('/api/asociaciones/expulsar', ['jugador_id' => $JVEN]);
check('El vice no puede expulsar al presidente -> 403', 403, $vice->http);
$r = $vice->api('/api/asociaciones/expulsar', ['jugador_id' => $JC1]);
check('El vice expulsa a un socio', [200, false], [$vice->http, (bool) $val('SELECT 1 FROM asociacion_miembros WHERE jugador_id = ?', [$JC1])]);
$com->api('/api/asociaciones/expulsar', ['jugador_id' => $JC0]);
check('Un socio no puede expulsar -> 403', 403, $com->http);
$sist = $compradores[1][0]->apiGet('/api/chat?canal=sistema');
check('El expulsado recibe un aviso en su canal del sistema', [true, 'EN VIVO'], [str_contains((string) ($sist['mensajes'][0]['texto'] ?? ''), 'sacaron'), $sist['mensajes'][0]['alias'] ?? null]);
// Solicitudes (asociación con ingreso por solicitud)
$r = $compradores[1][0]->api('/api/asociaciones/unirse', ['id' => $AS2]);
check('Unirse a una asociación con ingreso por solicitud -> estado solicitud', [200, 'solicitud', false], [$compradores[1][0]->http, $r['estado'] ?? null, (bool) $val('SELECT 1 FROM asociacion_miembros WHERE jugador_id = ?', [$JC1])]);
$lv = $v1->apiGet('/api/asociaciones');
check('El presidente ve la solicitud', [$JC1], array_column($lv['solicitudes'], 'jugador_id'));
$r = $v1->api('/api/asociaciones/solicitud', ['jugador_id' => $JC1, 'aceptar' => 'si']);
check('aceptar debe ser true/false -> 400', 400, $v1->http);
$r = $v1->api('/api/asociaciones/solicitud', ['jugador_id' => $JC1, 'aceptar' => true]);
check('Aceptar la solicitud -> socio', [200, 'aceptada', 'socio'], [$v1->http, $r['estado'] ?? null, $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [$JC1])]);
$r = $v1->api('/api/asociaciones/solicitud', ['jugador_id' => $JC1, 'aceptar' => true]);
check('Aceptar otra vez -> 404 (ya no existe)', 404, $v1->http);
[$rech] = $nuevo('Rechazado');
$rech->api('/api/asociaciones/unirse', ['id' => $AS2]);
$JRECH = (int) $rech->apiGet('/api/estado')['jugador']['id'];
$r = $v1->api('/api/asociaciones/solicitud', ['jugador_id' => $JRECH, 'aceptar' => false]);
check('Rechazar la solicitud', [200, 'rechazada', false], [$v1->http, $r['estado'] ?? null, (bool) $val('SELECT 1 FROM asociacion_miembros WHERE jugador_id = ?', [$JRECH])]);
// Si el presidente sale: pasa al vicepresidente más antiguo
$p1->api('/api/asociaciones/cargo', ['jugador_id' => (int) $compradores[2][1], 'cargo' => 'vicepresidente']);
$exec('UPDATE asociacion_miembros SET desde = desde + 100 WHERE jugador_id = ?', [(int) $compradores[2][1]]);
$r = $p1->api('/api/asociaciones/salir');
check('El presidente sale -> el vicepresidente MÁS ANTIGUO queda de presidente', [200, 'presidente', 'vicepresidente', false], [$p1->http, $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [$JC0]), $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [(int) $compradores[2][1]]), (bool) $val('SELECT 1 FROM asociacion_miembros WHERE jugador_id = ?', [$JVEN])]);
check('…estado.asociacion del que salió: null', null, $p1->apiGet('/api/estado')['asociacion']);
$p1->api('/api/asociaciones/salir');
check('Salir sin estar en ninguna -> 409', 409, $p1->http);
// Sin vices: pasa al socio más antiguo; la última persona que sale borra la asociación
$v1->api('/api/asociaciones/salir');
check('Presidente de VIP Media sale (sin vices) -> el socio más antiguo queda de presidente', 'presidente', $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [$JC1]));
$compradores[1][0]->api('/api/asociaciones/salir');
check('Sale el último miembro -> la asociación se borra', false, (bool) $val('SELECT 1 FROM asociaciones WHERE id = ?', [$AS2]));
// Pasar la presidencia
$vice->api('/api/asociaciones/cargo', ['jugador_id' => (int) $compradores[3][1], 'cargo' => 'presidente']);
check('Pasar la presidencia: el nuevo es presidente y el anterior queda vicepresidente', ['presidente', 'vicepresidente', 1],
    [$val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [(int) $compradores[3][1]]), $val('SELECT cargo FROM asociacion_miembros WHERE jugador_id = ?', [$JC0]), (int) $val("SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ? AND cargo = 'presidente'", [$AS1])]);
$v->get('/api/asociaciones');
check('Sin sesión: /api/asociaciones -> 401', 401, $v->http);

// =====================================================================
titulo('Chat: escribir, leer, ritmo de 1 mensaje cada 3 s');
$exec('DELETE FROM intentos');
$ch1 = $com; $J_CH1 = $JCOM;                  // Carla (socia de Los Productores, alias Producciones Ñandú)
$ch2 = $compradores[4][0]; $J_CH2 = (int) $compradores[4][1];   // también socio de Los Productores
$espera = fn() => usleep(3100 * 1000);
$r = $ch1->api('/api/chat', ['canal' => 'servidor', 'texto' => '  Hola,   productoras de Quito!  ']);
$M1 = (int) ($r['mensaje']['id'] ?? 0);
check('Mensaje al canal del servidor -> ok, texto con espacios limpios', [200, 'Hola, productoras de Quito!', 'Producciones Ñandú', 'QFP', 'socio', true],
    [$ch1->http, $r['mensaje']['texto'] ?? null, $r['mensaje']['alias'] ?? null, $r['mensaje']['siglas'] ?? null, $r['mensaje']['cargo'] ?? null, $r['mensaje']['mio'] ?? null]);
$r = $ch1->api('/api/chat', ['canal' => 'servidor', 'texto' => 'otro enseguida']);
check('Otro mensaje antes de 3 s -> 429 muy_rapido con espera_ms', [429, 'muy_rapido', true], [$ch1->http, $r['codigo'] ?? null, ($r['espera_ms'] ?? 0) > 0 && ($r['espera_ms'] ?? 9999) <= 3000]);
$l = $ch2->apiGet('/api/chat?canal=servidor&desde=0');
check('Leer el canal del servidor: llega el mensaje con {id, alias, siglas, cargo, vip, texto, creado}', [true, true], [in_array($M1, array_column($l['mensajes'], 'id'), true),
    count(array_intersect(['id', 'alias', 'siglas', 'cargo', 'vip', 'texto', 'creado'], array_keys($l['mensajes'][0] ?? []))) === 7]);
si('…sin correos ni datos privados', !str_contains(json_encode($l), '@prueba.example'));
$desde = (int) $l['ultimo_id'];
check('…con desde=ultimo_id no llega nada nuevo', [], $ch2->apiGet('/api/chat?canal=servidor&desde=' . $desde)['mensajes']);
$espera();
$ch1->api('/api/chat', ['canal' => 'servidor', 'texto' => 'Segundo mensaje']);
check('Pasados 3 s -> se puede otra vez', 200, $ch1->http);
$nuevos = $ch2->apiGet('/api/chat?canal=servidor&desde=' . $desde);
check('…y desde=<id> trae SOLO el nuevo', ['Segundo mensaje'], array_column($nuevos['mensajes'], 'texto'));
$s2a->apiGet('/api/chat?canal=servidor&desde=0');
si('Un jugador de OTRO servidor no ve los mensajes del Servidor 1', !in_array($M1, array_column($s2a->apiGet('/api/chat?canal=servidor&desde=0')['mensajes'], 'id'), true));
// Ritmo con mensajes a la vez
$espera();
$res = $multi(array_map(fn($i) => [$ch2->token(), '/api/chat', ['canal' => 'servidor', 'texto' => 'Ráfaga ' . $i]], range(1, 5)));
$cod = array_column($res, 0); sort($cod);
check('5 mensajes A LA VEZ del mismo jugador -> solo 1 pasa (4 × 429)', [200, 429, 429, 429, 429], $cod);
check('…solo 1 guardado', 1, (int) $val("SELECT COUNT(*) FROM chat_mensajes WHERE jugador_id = ? AND texto LIKE 'Ráfaga%'", [$J_CH2]));

titulo('Chat: canal de la asociación, mensajes rápidos, texto inválido');
$espera();
$r = $ch1->api('/api/chat', ['canal' => 'asociacion', 'texto' => 'Solo para la asociación']);
$MA = (int) ($r['mensaje']['id'] ?? 0);
check('Mensaje al canal de la asociación', 200, $ch1->http);
si('Los de la asociación lo ven', in_array($MA, array_column($ch2->apiGet('/api/chat?canal=asociacion')['mensajes'], 'id'), true));
si('…en el canal del servidor NO aparece', !in_array($MA, array_column($ch2->apiGet('/api/chat?canal=servidor')['mensajes'], 'id'), true));
$p1->apiGet('/api/chat?canal=asociacion');
check('Sin asociación: leer el canal de la asociación -> 403', 403, $p1->http);
$p1->api('/api/chat', ['canal' => 'asociacion', 'texto' => 'hola']);
check('…ni escribir', 403, $p1->http);
$ch1->api('/api/chat', ['canal' => 'sistema', 'texto' => 'hola']);
check('En el canal del sistema nadie escribe -> 403', 403, $ch1->http);
$ch1->api('/api/chat', ['canal' => 'privado:9', 'texto' => 'hola']);
check('Canal inválido -> 400', 400, $ch1->http);
$rap = $ch1->apiGet('/api/chat/rapidos');
check('GET /api/chat/rapidos trae la lista fija y los motivos de reporte', [true, true], [in_array('vamos_festival', array_column($rap['rapidos'] ?? [], 'id'), true), in_array('acoso', array_column($rap['motivos_reporte'] ?? [], 'id'), true)]);
$espera();
$r = $ch1->api('/api/chat', ['canal' => 'servidor', 'rapido' => 'vamos_festival']);
check('Mensaje rápido "vamos_festival"', [200, '¡Vamos al festival! 🎪', 'vamos_festival'], [$ch1->http, $r['mensaje']['texto'] ?? null, $r['mensaje']['rapido'] ?? null]);
$ch1->api('/api/chat', ['canal' => 'servidor', 'rapido' => 'insulto_libre']);
check('Mensaje rápido que no existe -> 400', 400, $ch1->http);
$rechazos = ['' => 'vacio', '   ' => 'vacio', str_repeat('a', 301) => 'largo',
    'eres un hijueputa' => 'groseria', 'HIJUEPUTA' => 'groseria', 'que put4 suerte' => 'groseria', 'p.u.t.a' => 'groseria', 'puuuuta madre' => 'groseria', 'p u t a' => 'groseria',
    'no seas pendejos' => 'groseria', 'huevón' => 'groseria', 'verga!' => 'groseria', 'chucha tu madre' => 'groseria',
    'entra a www.mipagina.com' => 'contacto', 'mira https://bit.ly/x' => 'contacto', 'escribe a pepe@gmail.com' => 'contacto', 'pepe arroba gmail punto com' => 'contacto',
    'mi wasap 0991234567' => 'contacto', 'llama al 099 123 4567' => 'contacto', '+593 99 123 4567' => 'contacto', 'visita tienda.ec' => 'contacto', 'sígueme instagram: @pepito_99' => 'contacto'];
foreach ($rechazos as $t => $cod) {
    $r = $ch2->api('/api/chat', ['canal' => 'servidor', 'texto' => $t]);
    check('Rechaza ' . json_encode(mb_substr($t, 0, 40), JSON_UNESCAPED_UNICODE) . " -> 400 $cod", [400, $cod], [$ch2->http, $r['codigo'] ?? null]);
}
check('…los rechazados no se guardan ni cuentan para el ritmo de 3 s', 0, (int) $val("SELECT COUNT(*) FROM chat_mensajes WHERE texto LIKE '%hijueputa%' OR texto LIKE '%0991234567%'"));
$buenos = ['Computadora nueva para la disputa del título', 'Gracias. Me voy al evento', 'Tengo 3 cámaras y pago 1500 créditos', '¡Qué buena transmisión en 4K a 60 fps!', '@todos listos para el festival'];
foreach ($buenos as $t) {
    $espera();
    $r = $ch2->api('/api/chat', ['canal' => 'servidor', 'texto' => $t]);
    check('Acepta ' . json_encode($t, JSON_UNESCAPED_UNICODE) . ' (sin falso positivo)', 200, $ch2->http);
}

titulo('Chat: bloquear y reportar');
$espera();
$r = $ch2->api('/api/chat', ['canal' => 'servidor', 'texto' => 'Mensaje que molesta']);
$MB = (int) ($r['mensaje']['id'] ?? 0);
$r = $ch1->api('/api/chat/bloquear', ['jugador_id' => $J_CH2]);
check('Bloquear -> lista de bloqueados', [200, [$J_CH2]], [$ch1->http, array_column($r['bloqueados'] ?? [], 'jugador_id')]);
si('Los mensajes del bloqueado ya no le llegan', !in_array($J_CH2, array_column($ch1->apiGet('/api/chat?canal=servidor&desde=0')['mensajes'], 'jugador_id'), true));
si('…pero a los demás sí', in_array($MB, array_column($p1->apiGet('/api/chat?canal=servidor&desde=0')['mensajes'], 'id'), true));
$ch1->api('/api/chat/bloquear', ['jugador_id' => $J_CH1]);
check('Bloquearse a sí mismo -> 400', 400, $ch1->http);
$r = $ch1->api('/api/chat/bloquear', ['jugador_id' => $J_CH2, 'desbloquear' => true]);
check('Desbloquear', [200, []], [$ch1->http, $r['bloqueados'] ?? null]);
si('…vuelven a llegar', in_array($MB, array_column($ch1->apiGet('/api/chat?canal=servidor&desde=0')['mensajes'], 'id'), true));
$ch2->api('/api/chat/reportar', ['mensaje_id' => $MB, 'motivo' => 'spam']);
check('Reportar el propio mensaje -> 400', 400, $ch2->http);
$s2a->api('/api/chat/reportar', ['mensaje_id' => $MB, 'motivo' => 'spam']);
check('Reportar un mensaje que no puede ver (otro servidor) -> 404', 404, $s2a->http);
$ch1->api('/api/chat/reportar', ['mensaje_id' => $MB, 'motivo' => '']);
check('Reportar sin motivo -> 400', 400, $ch1->http);
$r = $ch1->api('/api/chat/reportar', ['mensaje_id' => $MB, 'motivo' => 'acoso']);
check('Reportar -> ok, nuevo', [200, true, false], [$ch1->http, $r['nuevo'] ?? null, $r['oculto'] ?? null]);
$r = $ch1->api('/api/chat/reportar', ['mensaje_id' => $MB, 'motivo' => 'acoso']);
check('Reportar dos veces lo mismo no suma', [200, false, 1], [$ch1->http, $r['nuevo'] ?? null, (int) $val('SELECT COUNT(*) FROM chat_reportes WHERE mensaje_id = ?', [$MB])]);
$p1->api('/api/chat/reportar', ['mensaje_id' => $MB, 'motivo' => 'spam']);
$r = $compradores[5][0]->api('/api/chat/reportar', ['mensaje_id' => $MB, 'motivo' => 'groseria']);
check('3 reportes de personas distintas -> el mensaje se oculta solo', [true, 1], [$r['oculto'] ?? null, (int) $val('SELECT oculto FROM chat_mensajes WHERE id = ?', [$MB])]);
$l = $p1->apiGet('/api/chat?canal=servidor&desde=0');
check('…ya no sale y viene en "ocultos" (para quitarlo de la pantalla)', [false, true], [in_array($MB, array_column($l['mensajes'], 'id'), true), in_array($MB, $l['ocultos'], true)]);

titulo('Centro de Control: moderación del chat (Chat::moderarMensaje / sancionar / levantar / palabra, con auditoría)');
// La interfaz de /control/ (tablas de reportes, mercado, sanciones) la prueba pruebas_control.php; aquí, los métodos del servidor
$audit = fn(string $acc) => $fila('SELECT quien, accion, jugador_id FROM auditoria WHERE accion = ? ORDER BY id DESC LIMIT 1', [$acc]) ?: [];
$r = $accion('chat_mensaje', ['mensaje' => $MB, 'que' => 'borrar']);
check('Acción no válida -> 400 accion_invalida', [false, 400, 'accion_invalida'], [$r['ok'], $r['http'] ?? null, $r['codigo'] ?? null]);
$r = $accion('chat_mensaje', ['mensaje' => 99999999, 'que' => 'ocultar']);
check('Mensaje que no existe -> 404', [false, 404, 'mensaje_no_existe'], [$r['ok'], $r['http'] ?? null, $r['codigo'] ?? null]);
$r = $accion('chat_mensaje', ['mensaje' => $MB, 'que' => 'mostrar', 'quien' => 'control:mod']);
check('"Mostrar" el mensaje (reporte descartado), auditado', [true, 0, 'descartado', 'control:mod'], [$r['ok'], (int) $val('SELECT oculto FROM chat_mensajes WHERE id = ?', [$MB]), $val('SELECT estado FROM chat_reportes WHERE mensaje_id = ? LIMIT 1', [$MB]), $audit('chat_mostrar')['quien'] ?? null]);
$accion('chat_mensaje', ['mensaje' => $M1, 'que' => 'ocultar']);
check('Ocultar cualquier mensaje (auditoría chat_ocultar)', [1, 'chat_ocultar'], [(int) $val('SELECT oculto FROM chat_mensajes WHERE id = ?', [$M1]), $audit('chat_ocultar')['accion'] ?? null]);
si('…ya no sale en el chat', !in_array($M1, array_column($ch2->apiGet('/api/chat?canal=servidor&desde=0')['mensajes'], 'id'), true));
$r = $accion('chat_sancion', ['jugador' => $J_CH2, 'tipo' => 'silencio', 'segundos' => 5]);
check('Silencio de menos de 1 minuto -> 400 sancion_invalida, sin sanción', [false, 'sancion_invalida', 0], [$r['ok'], $r['codigo'] ?? null, (int) $val('SELECT COUNT(*) FROM chat_sanciones WHERE jugador_id = ?', [$J_CH2])]);
foreach (['1h' => 3600, '24h' => 86400, '7d' => 7 * 86400] as $d => $seg) {
    $exec('DELETE FROM chat_sanciones WHERE jugador_id = ?', [$J_CH2]);
    $r = $accion('chat_sancion', ['jugador' => $J_CH2, 'tipo' => 'silencio', 'segundos' => $seg, 'motivo' => 'Prueba']);
    $hasta = (int) $val('SELECT hasta FROM chat_sanciones WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$J_CH2]);
    check("Silenciar $d (auditoría chat_silenciar con el jugador)", [true, true, ['control:prueba', 'chat_silenciar', $J_CH2]], [$r['ok'], cerca($hasta, time() + $seg, 30), array_values($audit('chat_silenciar'))]);
}
$espera();
$r = $ch2->api('/api/chat', ['canal' => 'servidor', 'texto' => 'hola']);
check('Silenciado: escribir -> 403 con hasta cuándo', [403, 'sancion', 'silencio', true], [$ch2->http, $r['codigo'] ?? null, $r['sancion']['tipo'] ?? null, str_contains((string) ($r['error'] ?? ''), 'hasta el')]);
$ch2->api('/api/chat', ['canal' => 'servidor', 'rapido' => 'hola']);
check('…tampoco con mensajes rápidos', 403, $ch2->http);
check('…pero sí puede leer, y ve su sanción', [200, 'silencio'], [($ch2->apiGet('/api/chat?canal=servidor') && true) ? $ch2->http : 0, $ch2->apiGet('/api/chat?canal=servidor')['sancion']['tipo'] ?? null]);
check('…estado.perfil.chat_sancion', 'silencio', $ch2->apiGet('/api/estado')['perfil']['chat_sancion']['tipo'] ?? null);
si('…recibió un aviso del sistema', str_contains(json_encode($ch2->apiGet('/api/chat?canal=sistema')['mensajes'], JSON_UNESCAPED_UNICODE), 'No podrás escribir'));
$exec('UPDATE chat_sanciones SET hasta = ? WHERE jugador_id = ?', [time() - 1, $J_CH2]);
$r = $ch2->api('/api/chat', ['canal' => 'servidor', 'texto' => 'Ya puedo hablar']);
check('Cuando vence el silencio, vuelve a escribir', 200, $ch2->http);
$accion('chat_sancion', ['jugador' => $J_CH2, 'tipo' => 'expulsion', 'motivo' => 'Reincidente']);
$espera();
$r = $ch2->api('/api/chat', ['canal' => 'servidor', 'texto' => 'hola']);
check('Expulsar del chat (sin fecha) -> 403 expulsión', [403, 'expulsion', null], [$ch2->http, $r['sancion']['tipo'] ?? null, array_key_exists('hasta', $r['sancion'] ?? []) ? $r['sancion']['hasta'] : 'x']);
check('…queda una expulsión vigente sin fecha (auditoría chat_expulsar)', [1, 'chat_expulsar'], [(int) $val("SELECT COUNT(*) FROM chat_sanciones WHERE jugador_id = ? AND tipo = 'expulsion' AND hasta IS NULL AND levantada = 0", [$J_CH2]), $audit('chat_expulsar')['accion'] ?? null]);
$r = $accion('chat_levantar', ['jugador' => $J_CH2]);
check('Levantar: cuenta las sanciones levantadas y audita', [true, true, 'chat_levantar'], [$r['ok'], ($r['r'] ?? 0) >= 1, $audit('chat_levantar')['accion'] ?? null]);
$espera();
$ch2->api('/api/chat', ['canal' => 'servidor', 'texto' => 'Gracias por perdonarme']);
check('Levantar sanciones -> puede escribir', 200, $ch2->http);
// Lista de palabras editable
$espera();
$ch1->api('/api/chat', ['canal' => 'servidor', 'texto' => 'eres un zopenco']);
check('"zopenco" no está en la lista: pasa', 200, $ch1->http);
$r = $accion('palabra', ['palabra' => 'Zopénco', 'agregar' => true]);
check('Agregar "Zopénco" (se guarda sin tilde, auditado)', [true, 'zopenco', true, 'palabra_agregar'], [$r['ok'], $r['r'] ?? null, (bool) $val("SELECT 1 FROM chat_palabras WHERE palabra = 'zopenco'"), $audit('palabra_agregar')['accion'] ?? null]);
$r = $accion('palabra', ['palabra' => 'zopenco', 'agregar' => true]);
check('…agregarla otra vez -> 409 palabra_repetida', [false, 409, 'palabra_repetida'], [$r['ok'], $r['http'] ?? null, $r['codigo'] ?? null]);
$espera();
$r = $ch1->api('/api/chat', ['canal' => 'servidor', 'texto' => 'eres un ZOPENCOS']);
check('…ahora se rechaza (también en plural y mayúsculas)', [400, 'groseria'], [$ch1->http, $r['codigo'] ?? null]);
$r = $accion('palabra', ['palabra' => 'zopenco', 'agregar' => false]);
check('Quitar la palabra (auditado); quitarla otra vez -> 404', [true, 'palabra_quitar', 404], [$r['ok'], $audit('palabra_quitar')['accion'] ?? null, $accion('palabra', ['palabra' => 'zopenco'])['http'] ?? null]);
$r = $ch1->api('/api/chat', ['canal' => 'servidor', 'texto' => 'eres un zopenco']);
check('…sin la palabra, vuelve a pasar', 200, $ch1->http);
si('La lista inicial de Ecuador está cargada (chucha, verga, cojudo, huevon...)', (int) $val("SELECT COUNT(*) FROM chat_palabras WHERE palabra IN ('chucha', 'verga', 'cojudo', 'huevon', 'longo', 'conchatumadre')") === 6);

titulo('Chat: coaliciones y limpieza de 30 días');
$asocB = $v1;   // crea otra asociación (VIP) para la coalición
$v1->api('/api/asociaciones/crear', ['nombre' => 'Aliados Sur', 'siglas' => 'ALS', 'color' => '#2ecc71']);
$ASB = (int) $val("SELECT id FROM asociaciones WHERE siglas = 'ALS'");
$exec("INSERT INTO coaliciones (servidor_id, evento_id, nombre, inicio, fin, creado) VALUES (1, 'festival_quito', 'Coalición Festival', ?, ?, ?)", [time() - 60, time() + 3600, time()]);
$CO = (int) $pdo->lastInsertId();
$exec('INSERT INTO coalicion_miembros (coalicion_id, asociacion_id) VALUES (?, ?), (?, ?)', [$CO, $AS1, $CO, $ASB]);
$espera();
$r = $ch1->api('/api/chat', ['canal' => 'coalicion', 'texto' => 'Hola aliados']);
$MCO = (int) ($r['mensaje']['id'] ?? 0);
check('Canal de coalición activa: escribir', 200, $ch1->http);
si('…lo ve la otra asociación de la coalición', in_array($MCO, array_column($v1->apiGet('/api/chat?canal=coalicion')['mensajes'], 'id'), true));
$p1->apiGet('/api/chat?canal=coalicion');
check('…quien no está en la coalición -> 403', 403, $p1->http);
$exec('UPDATE coaliciones SET fin = ? WHERE id = ?', [time() - 1, $CO]);
$ch1->apiGet('/api/chat?canal=coalicion');
check('Coalición terminada: el canal se cierra (403)', 403, $ch1->http);
$fallo = null;
try { $exec('INSERT INTO coalicion_miembros (coalicion_id, asociacion_id) VALUES (?, 9001), (?, 9002), (?, 9003)', [$CO, $CO, $CO]); } catch (\Throwable $e) { $fallo = $e->getMessage(); }
si('Una coalición tiene máximo 4 asociaciones (la base no deja una 5.ª)', $fallo !== null && str_contains($fallo, 'maximo 4'));
$exec('UPDATE chat_mensajes SET creado = ? WHERE id IN (?, ?)', [time() - 31 * 86400, $MA, $MB]);
si('Mensajes de más de 30 días no se muestran', !in_array($MA, array_column($ch2->apiGet('/api/chat?canal=asociacion&desde=0')['mensajes'], 'id'), true));
$out = shell_exec('ENVIVO_CONFIG=' . escapeshellarg((string) getenv('ENVIVO_CONFIG')) . ' php ' . escapeshellarg(dirname(__DIR__) . '/bin/tareas.php') . ' 2>&1');
check('La tarea diaria los borra (con sus reportes)', [true, 0, 0], [str_contains((string) $out, '2 mensajes viejos borrados'), (int) $val('SELECT COUNT(*) FROM chat_mensajes WHERE id IN (?, ?)', [$MA, $MB]), (int) $val('SELECT COUNT(*) FROM chat_reportes WHERE mensaje_id = ?', [$MB])]);
$v->get('/api/chat?canal=servidor');
check('Sin sesión: /api/chat -> 401', 401, $v->http);
$exec('DELETE FROM intentos');

function Db_todas(PDO $pdo, string $sql, array $p): array { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchAll(); }
