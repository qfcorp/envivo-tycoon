<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Facturación electrónica SRI (server/src/Facturacion.php, FacturacionApi.php,
// public/control/lib/facturacion.php, bin/facturacion.php; docs/FACTURACION_SRI.md):
// base SQLite TEMPORAL con todas las migraciones, compras de verdad (Compras::insertar/aprobar/revertir, los ganchos de
// verdad), cédula/RUC, datos de la página de pago, facturas y notas de crédito, la API del ERP por HTTP (php -S con
// router.php y el api.php real) con la firma HMAC, repetición, reloj, IPs y sin clave, idempotencia y reintentos con espera,
// el aviso (webhook) a un ERP FALSO que verifica la firma, la alerta de atrasos, la pestaña del Centro de Control, el CSV,
// bin/facturacion.php (--rellenar) y las traducciones de los códigos nuevos.
// Uso:  php server/tests/pruebas_facturacion.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$SRV = dirname(__DIR__);
$RAIZ = dirname($SRV);
$TMP = sys_get_temp_dir() . '/envivo_fact_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
$puerto = function (): int { $s = stream_socket_server('tcp://127.0.0.1:0'); $p = (int) substr(strrchr(stream_socket_get_name($s, false), ':'), 1); fclose($s); return $p; };
$P_APP = (int) (getenv('P_APP') ?: $puerto());
$P_ERP = (int) (getenv('P_FALSO') ?: $puerto());
$P_IPS = $puerto();
$P_SIN = $puerto();
$CLAVE = bin2hex(random_bytes(32));
$ALERTA = $TMP . '/alerta.sh';
file_put_contents($ALERTA, "#!/bin/sh\nprintf '%s\\n' \"\$1\" >> " . escapeshellarg($TMP . '/alertas.txt') . "\n");
chmod($ALERTA, 0755);
$conf = "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:$P_APP\n"
      . "FACTURACION_CLAVE=$CLAVE\nFACTURACION_WEBHOOK_URL=http://127.0.0.1:$P_ERP/erp/aviso?origen=juego\nFACTURACION_ALERTA_CMD=$ALERTA\n";
file_put_contents($TMP . '/config.env', $conf);
file_put_contents($TMP . '/config_ips.env', $conf . "FACTURACION_IPS=10.9.9.9, 192.168.0.0/16\n");
file_put_contents($TMP . '/config_sin.env', str_replace("FACTURACION_CLAVE=$CLAVE\n", "FACTURACION_CLAVE=corta\n", $conf));
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require $SRV . '/src/arranque.php';   // registra los ganchos de los módulos, también Facturacion::registrar()

use EnVivo\{Ajustes, Catalogo, Compras, Cuentas, Db, Facturacion, Fallo, Ganchos, Migraciones, Plux};

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
Facturacion::$empujarAlTerminar = false;   // en este proceso el aviso al ERP se prueba a mano (Facturacion::empujar)
$clave49 = fn(int $id, string $r = '8') => str_pad((string) $id, 49, $r, STR_PAD_LEFT);

$nuevoJugador = function (string $alias): int {
    Db::q('INSERT OR IGNORE INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (1, ?, 1000, 1, ?)', ['Servidor 1', time()]);
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, alias, alias_clave) VALUES (?, ?, ?, ?, 1, ?, ?)',
        [strtolower(preg_replace('/\W+/', '.', $alias)) . '.' . bin2hex(random_bytes(2)) . '@prueba.example', $alias, 'x', time(), $alias, strtolower($alias)]);
    return Db::ultimoId();
};
$buyer = ['firstName' => 'Ana', 'lastName' => 'Pérez', 'documentNumber' => '1710034065', 'email' => 'ana.titular@prueba.example', 'phone' => '0991234567'];
// Lo mismo que hace api_plux_pago: datos del titular, datos de la factura (antes de cobrar), anotar, y Plux aprueba.
$compraPlux = function (int $j, string $prod, ?array $factura = null, ?array $b = null) use ($buyer): int {
    $c = Db::tx(fn() => Compras::insertar($j, Catalogo::producto($prod), 'web_plux'));
    $comprador = Plux::comprador(['buyer' => $b ?? $buyer], Cuentas::porId($j));
    $fd = Facturacion::datosDePago($factura === null ? [] : ['factura' => $factura], $comprador, $c, Cuentas::porId($j));
    Compras::anotarComprador((int) $c['id'], $comprador);
    Facturacion::anotarDatos((int) $c['id'], $fd);
    Compras::aprobar((int) $c['id'], 'prueba', 'TX-' . $c['id']);
    return (int) $c['id'];
};
$compraGoogle = function (int $j, string $prod): int {
    $c = Db::tx(fn() => Compras::insertar($j, Catalogo::productoCompra($prod), 'google_play', null, ['token' => 'tok-' . bin2hex(random_bytes(6)), 'order_id' => 'GPA.' . random_int(1000, 9999)]));
    Compras::aprobar((int) $c['id'], 'Google Play');
    return (int) $c['id'];
};
$factDe = fn(int $compra, string $tipo = 'factura') => Db::fila('SELECT * FROM facturas WHERE compra_id = ? AND tipo = ?', [$compra, $tipo]);

// =====================================================================
titulo('Migración facturacion.sql y ganchos');
$t = array_column(Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND (name = 'facturas' OR name LIKE 'facturacion_%') ORDER BY name"), 'name');
check('Tablas facturas, facturacion_datos_compra, facturacion_eventos, facturacion_nonces', ['facturacion_datos_compra', 'facturacion_eventos', 'facturacion_nonces', 'facturas'], $t);
check('Aplicar facturacion.sql otra vez no cambia nada', [], Migraciones::aplicar('facturacion.sql'));
Facturacion::registrar();
check('arranque.php registró los oyentes (compra_aprobada y compra_revertida), sin duplicar', [true, true], [Ganchos::hay('compra_aprobada'), Ganchos::hay('compra_revertida')]);
check('Compras.php no cambió: sigue emitiendo compra_aprobada y compra_revertida', [true, true],
    [str_contains((string) file_get_contents($SRV . '/src/Compras.php'), "'compra_aprobada'"), str_contains((string) file_get_contents($SRV . '/src/Compras.php'), "'compra_revertida'")]);

// =====================================================================
titulo('Cédula, RUC y tipo de identificación (tablas del SRI)');
check('Cédulas válidas e inválidas (módulo 10, provincia, tercer dígito)', [true, true, false, false, false, false],
    array_map([Facturacion::class, 'cedulaValida'], ['1710034065', '0926687856', '1712345678', '2510034065', '1770034065', '171003406']));
check('RUC: persona natural (cédula + 001), sociedad (9), pública (6); malos: 000, cédula mala, tercer dígito 8, 12 dígitos', [true, true, true, false, false, false, false],
    array_map([Facturacion::class, 'rucValido'], ['1710034065001', '1790012345001', '1760001550001', '1710034065000', '1710034066001', '1780012345001', '179001234500']));
check('Tipo: 05 cédula, 04 RUC, 06 pasaporte, 07 consumidor final, null mal escrito', ['05', '04', '06', '07', null, null],
    array_map([Facturacion::class, 'tipoIdentificacion'], ['1710034065', '1790012345001', 'AB123456', '9999999999999', '1712345678', '1710034066001']));

// =====================================================================
titulo('Datos de la factura en la página de pago (antes de cobrar)');
$J = $nuevoJugador('Compradora Uno');
$cPend = Db::tx(fn() => Compras::insertar($J, Catalogo::producto('creditos_250'), 'web_plux'));
$tit = Plux::comprador(['buyer' => $buyer], Cuentas::porId($J));
$d = fn(?array $f, array $c = null, array $t = null) => Facturacion::datosDePago($f === null ? [] : ['factura' => $f], $t ?? $tit, $c ?? $cPend, Cuentas::porId($J));
$x = $d(null);
check('Sin "factura" (página vieja en caché): a nombre del titular, cédula 05, nombre en mayúsculas', ['titular', '05', '1710034065', 'ANA PÉREZ', 'ana.titular@prueba.example'],
    [$x['modo'], $x['tipo_id'], $x['identificacion'], $x['razon_social'], $x['email']]);
$x = $d(['modo' => 'otro', 'identificacion' => '1790012345001', 'razon_social' => 'Productora Andina S.A.', 'email' => 'conta@andina.example', 'direccion' => 'Av. Amazonas N1-23, Quito']);
check('Otro con RUC de sociedad: 04, razón social, correo y dirección', ['otro', '04', '1790012345001', 'PRODUCTORA ANDINA S.A.', 'conta@andina.example', 'Av. Amazonas N1-23, Quito'],
    [$x['modo'], $x['tipo_id'], $x['identificacion'], $x['razon_social'], $x['email'], $x['direccion']]);
$x = $d(['modo' => 'otro', 'identificacion' => 'p-ab 123.456', 'razon_social' => 'John Smith', 'email' => 'malo']);
check('Otro con pasaporte (se limpia) y correo malo -> el del titular', ['06', 'PAB123456', 'ana.titular@prueba.example'], [$x['tipo_id'], $x['identificacion'], $x['email']]);
$x = $d(['modo' => 'consumidor_final']);
check('Consumidor final (compra de $1,99): 07, 9999999999999, CONSUMIDOR FINAL, con el correo', ['07', '9999999999999', 'CONSUMIDOR FINAL', 'ana.titular@prueba.example'],
    [$x['tipo_id'], $x['identificacion'], $x['razon_social'], $x['email']]);
check('Otro con 9999999999999 = consumidor final', '07', $d(['modo' => 'otro', 'identificacion' => '9999999999999', 'razon_social' => 'x'])['tipo_id']);
$caro = $cPend; $caro['total'] = 60.0;
check('Consumidor final por más de $50 -> 422 factura_consumidor_final_tope', [422, 'factura_consumidor_final_tope'], falla(fn() => $d(['modo' => 'consumidor_final'], $caro)));
check('Con $50 justos sí se puede', '07', $d(['modo' => 'consumidor_final'], ['total' => 50.0] + $cPend)['tipo_id']);
check('RUC mal escrito -> 422 factura_ruc_invalido', [422, 'factura_ruc_invalido'], falla(fn() => $d(['modo' => 'otro', 'identificacion' => '1710034066001', 'razon_social' => 'Alguien'])));
check('Cédula mal escrita en "otro" -> 422 factura_cedula_invalida', [422, 'factura_cedula_invalida'], falla(fn() => $d(['modo' => 'otro', 'identificacion' => '1712345678', 'razon_social' => 'Alguien'])));
check('"Otro" sin razón social -> 422 factura_datos_incompletos', [422, 'factura_datos_incompletos'], falla(fn() => $d(['modo' => 'otro', 'identificacion' => '1710034065', 'razon_social' => ''])));
check('Titular con cédula mal escrita -> 422 factura_cedula_invalida (se puede elegir consumidor final)', [422, 'factura_cedula_invalida', '07'],
    [...falla(fn() => $d(null, null, ['cedula' => '1712345678'] + $tit)), $d(['modo' => 'consumidor_final'], null, ['cedula' => '1712345678'] + $tit)['tipo_id']]);
$x = $d(['modo' => 'otro', 'identificacion' => '1790012345001', 'razon_social' => "<script>alert(1)</script>\x01 Empresa"]);
check('Textos limpios (sin < > ni caracteres de control)', false, (bool) preg_match('/[<>\x00-\x1F]/', $x['razon_social']));
$html = Facturacion::htmlPago($cPend, Cuentas::porId($J));
check('Bloque de pago.php: 3 opciones, campos y sin estilos ni scripts en línea (CSP)', [true, true, true, false, false],
    [str_contains($html, 'value="titular" checked') && str_contains($html, 'value="otro"') && str_contains($html, 'value="consumidor_final"'),
     str_contains($html, 'id="fact-identificacion"') && str_contains($html, 'id="fact-razon"') && str_contains($html, 'id="fact-direccion"'),
     str_contains($html, '/pago-assets/factura.css'), str_contains($html, 'style='), str_contains($html, '<script')]);
check('Compra de más de $50: consumidor final desactivado en la página', true, str_contains(Facturacion::htmlPago($caro, Cuentas::porId($J)), 'value="consumidor_final" disabled'));
$pago = (string) file_get_contents($SRV . '/public/pago.php');
$pagoJs = (string) file_get_contents($SRV . '/public/assets/pago.js');
$api = (string) file_get_contents($SRV . '/public/api.php');
check('pago.php, pago.js y api.php con sus líneas (INTEGRAR_FACTURACION.md)', [true, true, true, true, true],
    [str_contains($pago, 'Facturacion::htmlPago($c, $jug)') && str_contains($pago, '/pago-assets/factura.js'), str_contains($pagoJs, 'EnVivoFactura.leer(msg)') && str_contains($pagoJs, 'body.factura = estado.factura'),
     str_contains($api, 'FacturacionApi::esRuta($ruta)'), str_contains($api, 'Facturacion::datosDePago($in, $comprador, $c'), str_contains($api, 'Facturacion::anotarDatos((int) $c[\'id\'], $factura)')]);
check('La ruta del ERP va ANTES de la revisión de X-Envivo (el ERP no la manda)', true, strpos($api, 'FacturacionApi::esRuta') < strpos($api, "HTTP_X_ENVIVO"));
exec('node --check ' . escapeshellarg($SRV . '/public/assets/factura.js') . ' 2>&1', $o, $rc);
check('assets/factura.js sin errores de sintaxis', 0, $rc);

// =====================================================================
titulo('Compra aprobada -> factura pendiente (Plux y Google Play)');
$c1 = $compraPlux($J, 'creditos_250');
$f1 = $factDe($c1);
$cp = Compras::porId($c1);
check('Plux: una factura pendiente con la compra, el canal y el titular', ['pendiente', 'web_plux', '05', '1710034065', 'ANA PÉREZ', '19'],
    [$f1['estado'], $f1['canal'], $f1['comprador_tipo_id'], $f1['comprador_identificacion'], $f1['comprador_razon_social'], $f1['forma_pago']]);
check('Valores: los de la compra (subtotal + IVA 15 % = total) e IVA código 4', [(float) $cp['subtotal'], (float) $cp['iva'], (float) $cp['total'], true, 15.0],
    [(float) $f1['subtotal'], (float) $f1['iva'], (float) $f1['total'], abs($f1['subtotal'] + $f1['iva'] - $f1['total']) < 0.001, (float) $f1['iva_pct']]);
$it = json_decode($f1['items_json'], true);
check('Ítem: código, nombre del catálogo, 1 unidad, IVA 4 / 15 %', ['creditos_250', Catalogo::producto('creditos_250')['nombre'], 1, '4', 15.0, (float) $cp['total']],
    [$it[0]['codigo'], $it[0]['descripcion'], $it[0]['cantidad'], $it[0]['iva_codigo'], (float) $it[0]['iva_tarifa'], (float) $it[0]['total']]);
Compras::aprobar($c1, 'otra vez');
Facturacion::alAprobar(['compra_id' => $c1]);
check('Aprobar otra vez / gancho repetido: sigue UNA sola factura', 1, (int) Db::valor('SELECT COUNT(*) FROM facturas WHERE compra_id = ?', [$c1]));
check('Webhook configurado: la factura queda con aviso pendiente', 'pendiente', $f1['webhook_estado']);
$c2 = $compraPlux($J, 'creditos_250', ['modo' => 'otro', 'identificacion' => '1790012345001', 'razon_social' => 'Productora Andina S.A.', 'email' => 'conta@andina.example', 'direccion' => 'Quito']);
$f2 = $factDe($c2);
check('Plux con RUC: los datos que eligió en la página', ['04', '1790012345001', 'PRODUCTORA ANDINA S.A.', 'conta@andina.example', 'Quito'],
    [$f2['comprador_tipo_id'], $f2['comprador_identificacion'], $f2['comprador_razon_social'], $f2['comprador_email'], $f2['comprador_direccion']]);
$c3 = $compraPlux($J, 'creditos_250', ['modo' => 'consumidor_final']);
check('Plux a consumidor final', ['07', '9999999999999'], [$factDe($c3)['comprador_tipo_id'], $factDe($c3)['comprador_identificacion']]);
$G = $nuevoJugador('Jugador Android');
$cg = $compraGoogle($G, 'creditos_250');
$fg = $factDe($cg);
check('Google Play: consumidor final con el correo de la cuenta, forma de pago 20', ['google_play', '07', 'CONSUMIDOR FINAL', Cuentas::porId($G)['email'], '20', null],
    [$fg['canal'], $fg['comprador_tipo_id'], $fg['comprador_razon_social'], $fg['comprador_email'], $fg['forma_pago'], $fg['advertencia']]);
// Compra aprobada sin datos de la página (ej. aprobada por el aviso de Plux de una página vieja): el titular de compras
$cv = Db::tx(fn() => Compras::insertar($J, Catalogo::producto('creditos_250'), 'web_plux'));
Compras::anotarComprador((int) $cv['id'], ['cedula' => '1712345678', 'nombre' => 'Titular Viejo', 'email' => 'viejo@prueba.example', 'telefono' => '0990000000']);
Compras::aprobar((int) $cv['id'], 'aviso de Plux');
$fv = $factDe((int) $cv['id']);
check('Sin datos de la página: el titular de la compra (cédula que no valida -> 06 y advertencia para revisar)', ['06', '1712345678', 'TITULAR VIEJO', true],
    [$fv['comprador_tipo_id'], $fv['comprador_identificacion'], $fv['comprador_razon_social'], str_contains((string) $fv['advertencia'], 'no pasa la validación')]);
$fila = Facturacion::json($f1);
check('JSON para el ERP: referencia EVF-, comprador, ítems, totales, forma de pago, sri vacío', ['EVF-' . str_pad((string) $f1['id'], 6, '0', STR_PAD_LEFT), 'cedula', false, 'USD', '19', null, 'TX-' . $c1],
    [$fila['referencia'], $fila['comprador']['tipo_identificacion_nombre'], $fila['comprador']['consumidor_final'], $fila['moneda'], $fila['forma_pago']['codigo'], $fila['sri']['clave_acceso'], $fila['compra']['transaccion']]);

// =====================================================================
titulo('Reembolsos y contracargos -> nota de crédito');
$activar = fn(int $j) => Db::q("UPDATE jugadores SET estado = 'activo', estado_motivo = NULL WHERE id = ?", [$j]);
Compras::revertir($c3, 'reembolso', 'antes de facturar', 'prueba');
$activar($J);
check('Reembolso ANTES de que el ERP reciba la factura: factura "no_aplica" y sin nota de crédito', ['no_aplica', null], [$factDe($c3)['estado'], $factDe($c3, 'nota_credito')]);
// La factura 1 ya la recibió el ERP y se autorizó; luego reembolso -> nota de crédito pendiente que ya se puede pedir
Facturacion::pendientes(200);   // el ERP las recibe (entregada_en)
Facturacion::confirmar(['id' => (int) $f1['id'], 'estado' => 'autorizada', 'clave_acceso' => $clave49((int) $f1['id']), 'numero_comprobante' => '001-001-000000001']);
Compras::revertir($c1, 'contracargo', 'el banco lo pidió', 'prueba');
$activar($J); Db::q("UPDATE jugadores SET estado = 'activo' WHERE id = ?", [$J]);
$n1 = $factDe($c1, 'nota_credito');
check('Contracargo de una factura autorizada: nota de crédito pendiente que modifica esa factura', ['pendiente', (int) $f1['id'], true, (float) $f1['total']],
    [$n1['estado'], (int) $n1['factura_id'], str_contains((string) $n1['motivo'], 'Contracargo de la compra N° ' . $c1), (float) $n1['total']]);
$jn = Facturacion::json($n1);
check('JSON de la nota: EVN-, factura_modificada con su clave de acceso y número', ['EVN-' . str_pad((string) $n1['id'], 6, '0', STR_PAD_LEFT), 'nota_credito', $clave49((int) $f1['id']), '001-001-000000001', 'autorizada'],
    [$jn['referencia'], $jn['tipo'], $jn['factura_modificada']['clave_acceso'], $jn['factura_modificada']['numero_comprobante'], $jn['factura_modificada']['estado']]);
Facturacion::alRevertir(['compra_id' => $c1, 'motivo' => 'contracargo']);
check('Gancho repetido: una sola nota de crédito', 1, (int) Db::valor("SELECT COUNT(*) FROM facturas WHERE compra_id = ? AND tipo = 'nota_credito'", [$c1]));
// La de Google (consumidor final), recibida por el ERP y autorizada, luego Google la anula -> el SRI no permite NC a consumidor final
Facturacion::confirmar(['id' => (int) $fg['id'], 'estado' => 'autorizada', 'clave_acceso' => $clave49((int) $fg['id'])]);
Compras::revertir($cg, 'reembolso', 'Google Play anuló la compra', 'Google Play');
$ng = $factDe($cg, 'nota_credito');
check('Consumidor final: nota de crédito "no_aplica" (SRI 2026) y aviso para el dueño', ['no_aplica', true, true],
    [$ng['estado'], str_contains((string) $ng['advertencia'], 'consumidor final'), (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'nota_credito_consumidor_final' AND compra_id = ?", [$cg])]);
// Reembolso de una factura que el ERP ya recibió pero no ha autorizado: la nota espera a la factura
$Q = $nuevoJugador('Espera Factura');
$c4 = $compraPlux($Q, 'creditos_250');
$f4 = $factDe($c4);
Facturacion::pendientes(200);
Compras::revertir($c4, 'reembolso', '', 'prueba');
$n4 = $factDe($c4, 'nota_credito');
$lista = array_column(Facturacion::pendientes(200)['comprobantes'], 'id');
check('Factura ya entregada al ERP sin autorizar: la nota se crea pero NO se lista hasta que la factura esté autorizada', ['pendiente', true, false],
    [$n4['estado'], in_array((int) $f4['id'], $lista, true), in_array((int) $n4['id'], $lista, true)]);
check('Confirmar la nota antes que la factura -> 409 facturacion_factura_sin_autorizar', [409, 'facturacion_factura_sin_autorizar'],
    falla(fn() => Facturacion::confirmar(['id' => (int) $n4['id'], 'estado' => 'autorizada', 'clave_acceso' => $clave49((int) $n4['id'])])));
Facturacion::confirmar(['id' => (int) $f4['id'], 'estado' => 'autorizada', 'clave_acceso' => $clave49((int) $f4['id'])]);
check('Autorizada la factura, la nota ya aparece en pendientes', true, in_array((int) $n4['id'], array_column(Facturacion::pendientes(200)['comprobantes'], 'id'), true));

// =====================================================================
titulo('Confirmar (idempotente) y reintentos con espera creciente');
$R = $nuevoJugador('Reintentos');
$c5 = $compraPlux($R, 'creditos_250');
$f5 = (int) $factDe($c5)['id'];
$conf = fn(array $in) => Facturacion::confirmar($in + ['id' => $f5]);
check('Estado desconocido -> 422 · sin id -> 400 · no existe -> 404', [[422, 'facturacion_estado_invalido'], [400, 'falta_id'], [404, 'facturacion_no_existe']],
    [falla(fn() => $conf(['estado' => 'feliz'])), falla(fn() => Facturacion::confirmar(['estado' => 'error'])), falla(fn() => Facturacion::confirmar(['id' => 999999, 'estado' => 'error']))]);
check('Autorizada sin clave de 49 dígitos -> 422 facturacion_autorizacion_invalida', [[422, 'facturacion_autorizacion_invalida'], [422, 'facturacion_autorizacion_invalida']],
    [falla(fn() => $conf(['estado' => 'autorizada', 'clave_acceso' => '123'])), falla(fn() => $conf(['estado' => 'autorizada', 'clave_acceso' => $clave49(5), 'numero_comprobante' => '1-1-1']))]);
$base = time();
Facturacion::$reloj = fn() => $base;
$r = $conf(['estado' => 'error', 'mensaje' => 'SRI sin conexión']);
$x = Facturacion::porId($f5);
check('Error pasajero: sigue pendiente, 1 intento, espera 1 minuto', ['actualizado', 'pendiente', 1, $base + 60, 'SRI sin conexión'], [$r['resultado'], $x['estado'], (int) $x['intentos'], (int) $x['proximo_intento'], $x['ultimo_error']]);
check('El mismo error repetido dentro de la espera -> sin_cambios (no suma intentos)', ['sin_cambios', 1], [$conf(['estado' => 'error', 'mensaje' => 'SRI sin conexión'])['resultado'], (int) Facturacion::porId($f5)['intentos']]);
check('Durante la espera no aparece en pendientes', false, in_array($f5, array_column(Facturacion::pendientes(200)['comprobantes'], 'id'), true));
Facturacion::$reloj = fn() => $base + 61;
check('Pasada la espera vuelve a aparecer', true, in_array($f5, array_column(Facturacion::pendientes(200)['comprobantes'], 'id'), true));
check('Espera creciente: 1, 2, 4, 8 minutos... tope 6 horas', [60, 120, 240, 480, 21600], [Facturacion::espera(1), Facturacion::espera(2), Facturacion::espera(3), Facturacion::espera(4), Facturacion::espera(20)]);
for ($i = 2, $t = $base + 61; $i <= Facturacion::MAX_ERRORES; $i++) { Facturacion::$reloj = fn() => $t; $conf(['estado' => 'error', 'mensaje' => 'falla ' . $i]); $t += 30000; }
$x = Facturacion::porId($f5);
check('A los ' . Facturacion::MAX_ERRORES . ' errores pasa a "fallida" con aviso', ['fallida', Facturacion::MAX_ERRORES, true], [$x['estado'], (int) $x['intentos'], (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'factura_fallida' AND compra_id = ?", [$c5])]);
check('Un "error" sobre una fallida -> sin_cambios', 'sin_cambios', $conf(['estado' => 'error', 'mensaje' => 'otra'])['resultado']);
Facturacion::$reloj = null;
check('Reintentar desde el Centro de Control: vuelve a pendiente, 0 intentos', [true, 'pendiente', 0], [Facturacion::reintentar($f5, 'control:prueba'), Facturacion::porId($f5)['estado'], (int) Facturacion::porId($f5)['intentos']]);
check('"en_proceso" (el ERP la mandó al SRI) y repetido -> sin_cambios', ['actualizado', 'sin_cambios', 'en_proceso'], [$conf(['estado' => 'recibida'])['resultado'], $conf(['estado' => 'en_proceso'])['resultado'], Facturacion::porId($f5)['estado']]);
$r = $conf(['estado' => 'rechazada', 'mensaje' => 'DEVUELTA: identificación del comprador']);
check('"rechazada" por el SRI -> fallida, con el mensaje y un aviso', ['actualizado', 'fallida', 'SRI: DEVUELTA: identificación del comprador', true],
    [$r['resultado'], Facturacion::porId($f5)['estado'], Facturacion::porId($f5)['ultimo_error'], (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'factura_rechazada' AND compra_id = ?", [$c5])]);
$r = $conf(['estado' => 'autorizada', 'clave_acceso' => $clave49($f5), 'numero_autorizacion' => $clave49($f5), 'numero_comprobante' => '001-001-000000005', 'fecha_autorizacion' => '2026-10-23T10:15:00-05:00']);
$x = Facturacion::porId($f5);
check('Autorizada (el ERP la corrigió): clave, número, fecha del ERP', ['actualizado', 'autorizada', $clave49($f5), '001-001-000000005', strtotime('2026-10-23T10:15:00-05:00'), null],
    [$r['resultado'], $x['estado'], $x['clave_acceso'], $x['numero_comprobante'], (int) $x['autorizada_en'], $x['ultimo_error']]);
check('La misma autorización otra vez -> sin_cambios (idempotente)', 'sin_cambios', $conf(['estado' => 'autorizada', 'clave_acceso' => $clave49($f5)])['resultado']);
check('Otra clave sobre una autorizada -> 409 facturacion_ya_autorizada; un "error" también 409', [[409, 'facturacion_ya_autorizada'], [409, 'facturacion_ya_autorizada']],
    [falla(fn() => $conf(['estado' => 'autorizada', 'clave_acceso' => $clave49($f5, '1')])), falla(fn() => $conf(['estado' => 'error']))]);
check('La misma clave de acceso en otro comprobante -> 409 facturacion_clave_repetida', [409, 'facturacion_clave_repetida'],
    falla(fn() => Facturacion::confirmar(['id' => (int) $f2['id'], 'estado' => 'autorizada', 'clave_acceso' => $clave49($f5)])));
check('Sobre una "no_aplica" -> 409 facturacion_estado_final', [409, 'facturacion_estado_final'],
    falla(fn() => Facturacion::confirmar(['id' => (int) $factDe($c3)['id'], 'estado' => 'autorizada', 'clave_acceso' => $clave49(3, '3')])));
check('Historial de eventos guardado', true, (int) Db::valor('SELECT COUNT(*) FROM facturacion_eventos WHERE factura_id = ?', [$f5]) >= 10);

// =====================================================================
titulo('API del ERP por HTTP (php -S + router.php + api.php reales), firma HMAC');
file_put_contents($TMP . '/erp_falso.php', <<<'PHP'
<?php
// ERP FALSO: verifica la firma como lo haría el ERP del dueño (docs/FACTURACION_SRI.md §4) y responde según erp_modo.txt
$dir = getenv('ERP_DIR');
$cuerpo = (string) file_get_contents('php://input');
$f = $_SERVER['HTTP_X_FACTURA_FECHA'] ?? ''; $n = $_SERVER['HTTP_X_FACTURA_NONCE'] ?? ''; $s = $_SERVER['HTTP_X_FACTURA_FIRMA'] ?? '';
$ok = hash_equals(hash_hmac('sha256', "POST\n" . $_SERVER['REQUEST_URI'] . "\n$f\n$n\n" . hash('sha256', $cuerpo), getenv('ERP_CLAVE')), $s) && abs(time() - (int) $f) <= 300;
$j = json_decode($cuerpo, true);
file_put_contents("$dir/erp.log", json_encode(['firma_ok' => $ok, 'uri' => $_SERVER['REQUEST_URI'], 'evento' => $_SERVER['HTTP_X_FACTURA_EVENTO'] ?? '', 'id' => $j['comprobante']['id'] ?? null, 'tipo' => $j['comprobante']['tipo'] ?? null]) . "\n", FILE_APPEND);
$modo = trim((string) @file_get_contents("$dir/erp_modo.txt")) ?: 'ok';
if (!$ok) { http_response_code(401); echo '{"error":"firma"}'; return; }
if ($modo === 'falla') { http_response_code(503); echo 'ERP en mantenimiento'; return; }
header('Content-Type: application/json');
if ($modo === 'autoriza') { $id = (int) $j['comprobante']['id']; echo json_encode(['estado' => 'autorizada', 'clave_acceso' => str_pad((string) $id, 49, '7', STR_PAD_LEFT), 'numero_comprobante' => '001-002-' . str_pad((string) $id, 9, '0', STR_PAD_LEFT)]); return; }
echo '{"recibido":true}';
PHP);
$procs = [];
$arrancar = function (int $p, string $config, ?string $script = null) use ($TMP, $RAIZ, $SRV, $CLAVE, &$procs): void {
    $cmd = ['php', '-d', 'error_log=' . $TMP . '/php_errores.log', '-d', 'log_errors=1', '-d', 'display_errors=0', '-S', '127.0.0.1:' . $p];
    $cmd = $script === null ? [...$cmd, '-t', $RAIZ, $SRV . '/tests/router.php'] : [...$cmd, $script];
    $procs[] = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $TMP . '/http.log', 'a'], 2 => ['file', $TMP . '/http.log', 'a']], $tub, $RAIZ,
        ['ENVIVO_CONFIG' => $config, 'PATH' => getenv('PATH'), 'ERP_DIR' => $TMP, 'ERP_CLAVE' => $CLAVE, 'TZ' => 'America/Guayaquil']);
    for ($k = 0; $k < 60; $k++) { if (@fsockopen('127.0.0.1', $p)) return; usleep(100000); }
};
$arrancar($P_APP, $TMP . '/config.env');
$arrancar($P_IPS, $TMP . '/config_ips.env');
$arrancar($P_SIN, $TMP . '/config_sin.env');
$arrancar($P_ERP, $TMP . '/config.env', $TMP . '/erp_falso.php');
// Petición del ERP: firma con FACTURACION_CLAVE (como el fragmento PHP de docs/FACTURACION_SRI.md)
$erp = function (string $metodo, string $uri, ?array $json = null, array $op = []) use ($P_APP, $CLAVE): array {
    $cuerpo = $json === null ? '' : (string) json_encode($json);
    $cab = Facturacion::firmar($metodo, $op['uri_firma'] ?? $uri, $op['cuerpo_firma'] ?? $cuerpo, $op['clave'] ?? $CLAVE, $op['fecha'] ?? time(), $op['nonce'] ?? null);
    if (isset($op['cab'])) $cab = $op['cab'] + $cab;
    $h = ['Content-Type: application/json'];
    foreach ($cab as $k => $v) if ($v !== null) $h[] = $k . ': ' . $v;
    $ch = curl_init('http://127.0.0.1:' . ($op['puerto'] ?? $P_APP) . $uri);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $h, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 30]
        + ($metodo === 'POST' ? [CURLOPT_POSTFIELDS => $cuerpo] : []));
    $b = curl_exec($ch); $c = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$c, json_decode((string) $b, true), $cab];
};
$cod = fn(array $r) => [$r[0], $r[1]['codigo'] ?? null];
[$c, $j] = $erp('GET', '/api/facturacion/ping');
check('GET /api/facturacion/ping firmado -> 200 (sin sesión ni X-Envivo), webhook y tope', [200, true, true, 50.0], [$c, $j['ok'] ?? null, $j['webhook'] ?? null, (float) ($j['tope_consumidor_final'] ?? 0)]);
check('Sin firma -> 401 · firma con otra clave -> 401 facturacion_firma_invalida', [[401, 'facturacion_fecha_invalida'], [401, 'facturacion_firma_invalida']],
    [$cod($erp('GET', '/api/facturacion/ping', null, ['cab' => ['X-Factura-Fecha' => null, 'X-Factura-Nonce' => null, 'X-Factura-Firma' => null]])), $cod($erp('GET', '/api/facturacion/ping', null, ['clave' => str_repeat('x', 64)]))]);
check('Reloj desfasado 10 minutos -> 401 facturacion_fecha_invalida', [401, 'facturacion_fecha_invalida'], $cod($erp('GET', '/api/facturacion/ping', null, ['fecha' => time() - 600])));
check('Firma de otra ruta o con ?parámetros cambiados -> 401', [[401, 'facturacion_firma_invalida'], [401, 'facturacion_firma_invalida']],
    [$cod($erp('GET', '/api/facturacion/pendientes', null, ['uri_firma' => '/api/facturacion/ping'])), $cod($erp('GET', '/api/facturacion/pendientes?limite=200', null, ['uri_firma' => '/api/facturacion/pendientes?limite=1']))]);
check('Cuerpo cambiado en el camino -> 401', [401, 'facturacion_firma_invalida'], $cod($erp('POST', '/api/facturacion/confirmar', ['id' => $f5, 'estado' => 'no_aplica'], ['cuerpo_firma' => '{"id":1}'])));
$r1 = $erp('GET', '/api/facturacion/ping', null, ['nonce' => 'nonce-repetido-' . bin2hex(random_bytes(4))]);
$r2 = $erp('GET', '/api/facturacion/ping', null, ['cab' => $r1[2]]);
check('La MISMA petición repetida (nonce) -> 401 facturacion_nonce_repetido', [200, 401, 'facturacion_nonce_repetido'], [$r1[0], $r2[0], $r2[1]['codigo'] ?? null]);
check('Con FACTURACION_IPS (10.9.9.9, 192.168.0.0/16) desde 127.0.0.1 -> 403 facturacion_ip_no_permitida', [403, 'facturacion_ip_no_permitida'], $cod($erp('GET', '/api/facturacion/ping', null, ['puerto' => $P_IPS])));
check('Sin FACTURACION_CLAVE (o muy corta) -> 503 facturacion_no_configurada', [503, 'facturacion_no_configurada'], $cod($erp('GET', '/api/facturacion/ping', null, ['puerto' => $P_SIN, 'clave' => 'corta'])));
check('Método equivocado -> 405 · ruta que no existe -> 404', [405, 404], [$erp('POST', '/api/facturacion/pendientes', [])[0], $erp('GET', '/api/facturacion/otra')[0]]);
// Pendientes
$P = $nuevoJugador('Por HTTP');
$c6 = $compraPlux($P, 'creditos_250');
$f6 = (int) $factDe($c6)['id'];
[$c, $j] = $erp('GET', '/api/facturacion/pendientes?limite=200');
$ids = array_column($j['comprobantes'] ?? [], 'id');
$mio = array_values(array_filter($j['comprobantes'] ?? [], fn($x) => $x['id'] === $f6))[0] ?? [];
check('GET pendientes -> 200, incluye la nueva, en orden, sin autorizadas ni no_aplica', [200, true, $ids, false, false],
    [$c, in_array($f6, $ids, true), (function ($a) { sort($a); return $a; })($ids), in_array($f5, $ids, true), in_array((int) $factDe($c3)['id'], $ids, true)]);
check('…con todo lo que necesita el ERP', [true, '05', 'creditos_250', '4', 'web_plux'],
    [isset($mio['referencia'], $mio['comprador']['razon_social'], $mio['items'][0]['precio_unitario'], $mio['subtotal'], $mio['iva'], $mio['total'], $mio['forma_pago']['codigo'], $mio['fecha_venta']),
     $mio['comprador']['tipo_identificacion'] ?? null, $mio['items'][0]['codigo'] ?? null, $mio['iva_codigo'] ?? null, $mio['compra']['canal'] ?? null]);
check('…y queda marcada como entregada (y el último contacto del ERP)', [true, true], [Facturacion::porId($f6)['entregada_en'] !== null, (int) Ajustes::get('facturacion_ultimo_erp') >= time() - 60]);
[$c, $j] = $erp('GET', '/api/facturacion/pendientes?limite=1');
check('limite=1 -> 1 comprobante y hay_mas', [200, 1, true], [$c, count($j['comprobantes'] ?? []), $j['hay_mas'] ?? null]);
[$c, $j2] = $erp('GET', '/api/facturacion/pendientes?limite=1&desde_id=' . ($j['comprobantes'][0]['id'] ?? 0));
check('desde_id pagina hacia adelante', true, $c === 200 && ($j2['comprobantes'][0]['id'] ?? 0) > ($j['comprobantes'][0]['id'] ?? 0));
check('GET comprobante?id= -> 200 · no existe -> 404', [200, $f6, 404], [$erp('GET', '/api/facturacion/comprobante?id=' . $f6)[0], $erp('GET', '/api/facturacion/comprobante?id=' . $f6)[1]['comprobante']['id'] ?? null, $erp('GET', '/api/facturacion/comprobante?id=999999')[0]]);
// Confirmar por HTTP
[$c, $j] = $erp('POST', '/api/facturacion/confirmar', ['id' => $f6, 'estado' => 'autorizada', 'clave_acceso' => $clave49($f6), 'numero_comprobante' => '001-001-000000006']);
check('POST confirmar autorizada -> 200 actualizado', [200, 'actualizado', 'autorizada'], [$c, $j['resultado'] ?? null, $j['estado'] ?? null]);
[$c, $j] = $erp('POST', '/api/facturacion/confirmar', ['id' => $f6, 'estado' => 'autorizada', 'clave_acceso' => $clave49($f6)]);
check('…la misma otra vez (reintento del ERP con otro nonce) -> 200 sin_cambios', [200, 'sin_cambios'], [$c, $j['resultado'] ?? null]);
check('…otra clave -> 409 facturacion_ya_autorizada · cuerpo que no es JSON -> 400', [[409, 'facturacion_ya_autorizada'], 400],
    [$cod($erp('POST', '/api/facturacion/confirmar', ['id' => $f6, 'estado' => 'autorizada', 'clave_acceso' => $clave49($f6, '2')])), $erp('POST', '/api/facturacion/confirmar', null)[0]]);
$c7 = $compraPlux($P, 'creditos_250'); $f7 = (int) $factDe($c7)['id'];
$c8 = $compraPlux($P, 'creditos_250'); $f8 = (int) $factDe($c8)['id'];
[$c, $j] = $erp('POST', '/api/facturacion/confirmar', ['confirmaciones' => [
    ['id' => $f7, 'estado' => 'autorizada', 'clave_acceso' => $clave49($f7)], ['id' => $f8, 'estado' => 'error', 'mensaje' => 'Firma electrónica vencida'], ['id' => 999999, 'estado' => 'error']]]);
check('Lote de confirmaciones: cada una por separado (una mala no detiene a las demás)', [200, ['actualizado', 'actualizado', null], [true, true, false], 'pendiente'],
    [$c, array_map(fn($x) => $x['resultado'] ?? null, $j['resultados'] ?? []), array_map(fn($x) => $x['ok'], $j['resultados'] ?? []), Facturacion::porId($f8)['estado']]);

// =====================================================================
titulo('Aviso (webhook) al ERP, firmado, con reintentos');
$W = $nuevoJugador('Webhook');
$c9 = $compraPlux($W, 'creditos_250'); $f9 = (int) $factDe($c9)['id'];
@unlink($TMP . '/erp.log');
file_put_contents($TMP . '/erp_modo.txt', 'ok');
check('Aviso entregado: el ERP falso verificó la firma (ruta con ?origen=juego) y el evento', [true, 'entregado', true, 'factura_pendiente', '/erp/aviso?origen=juego'],
    (function () use ($f9, $TMP) { $r = Facturacion::empujar($f9); $l = json_decode((string) file_get_contents($TMP . '/erp.log'), true); return [$r, Facturacion::porId($f9)['webhook_estado'], $l['firma_ok'] ?? null, $l['evento'] ?? null, $l['uri'] ?? null]; })());
check('Entregado no se vuelve a mandar', false, Facturacion::empujar($f9));
$c10 = $compraPlux($W, 'creditos_250'); $f10 = (int) $factDe($c10)['id'];
file_put_contents($TMP . '/erp_modo.txt', 'falla');
$r = Facturacion::empujar($f10);
$x = Facturacion::porId($f10);
check('ERP caído (503): sigue pendiente, 1 intento, espera 1 minuto y el error guardado', [false, 'pendiente', 1, true, true],
    [$r, $x['webhook_estado'], (int) $x['webhook_intentos'], (int) $x['webhook_proximo'] >= time() + 50, str_contains((string) $x['webhook_error'], 'HTTP 503')]);
check('El cron no lo reintenta antes de la espera', [0, 0], (function () use ($f10) { $r = Facturacion::empujarPendientes(); return [(int) Facturacion::porId($f10)['webhook_intentos'] - 1, 0 * $r[0]]; })());
file_put_contents($TMP . '/erp_modo.txt', 'autoriza');
Db::q('UPDATE facturas SET webhook_proximo = 0 WHERE id = ?', [$f10]);
[$ok] = Facturacion::empujarPendientes();
$x = Facturacion::porId($f10);
check('Pasada la espera el cron lo manda; el ERP responde {estado: autorizada}: queda autorizada', [true, 'entregado', 'autorizada', str_pad((string) $f10, 49, '7', STR_PAD_LEFT), '001-002-' . str_pad((string) $f10, 9, '0', STR_PAD_LEFT)],
    [$ok >= 1, $x['webhook_estado'], $x['estado'], $x['clave_acceso'], $x['numero_comprobante']]);
// Al confirmar por HTTP una factura con nota de crédito esperando, el servidor del juego avisa la nota al ERP al terminar
file_put_contents($TMP . '/erp_modo.txt', 'ok');
$c11 = $compraPlux($W, 'creditos_250'); $f11 = (int) $factDe($c11)['id'];
Facturacion::pendientes(200);
Compras::revertir($c11, 'reembolso', '', 'prueba');
$n11 = (int) $factDe($c11, 'nota_credito')['id'];
@unlink($TMP . '/erp.log');
$erp('POST', '/api/facturacion/confirmar', ['id' => $f11, 'estado' => 'autorizada', 'clave_acceso' => $clave49($f11)]);
usleep(300000);
$l = array_map(fn($x) => json_decode($x, true), array_filter(explode("\n", (string) @file_get_contents($TMP . '/erp.log'))));
check('Autorizada la factura por HTTP: el juego avisa la nota de crédito al ERP (al terminar la respuesta)', [true, 'nota_credito', 'nota_credito_pendiente', 'entregado'],
    [count($l) >= 1 && $l[0]['firma_ok'], $l[0]['tipo'] ?? null, $l[0]['evento'] ?? null, Facturacion::porId($n11)['webhook_estado']]);
Db::q("UPDATE facturas SET webhook_estado = 'pendiente', webhook_intentos = ? WHERE id = ?", [Facturacion::WEBHOOK_MAX - 1, $f8]);
file_put_contents($TMP . '/erp_modo.txt', 'falla');
Facturacion::empujar($f8);
check('A los ' . Facturacion::WEBHOOK_MAX . ' avisos fallidos: "agotado" (el ERP igual la ve en pendientes)', ['agotado', true],
    [Facturacion::porId($f8)['webhook_estado'], in_array($f8, array_column(Facturacion::pendientes(200)['comprobantes'], 'id'), true) || (int) Facturacion::porId($f8)['proximo_intento'] > time()]);

// =====================================================================
titulo('Alerta: más de 1 hora sin autorizar');
check('Recién creadas: no hay atrasadas', 0, Facturacion::resumen()['atrasadas']);
@unlink($TMP . '/alertas.txt');
Facturacion::$reloj = fn() => time() + 2 * 3600;
$r = Facturacion::resumen();
$msg = Facturacion::revisarAtrasos();
check('2 horas después: atrasadas > 0, aviso factura_atrasada y FACTURACION_ALERTA_CMD recibió el mensaje', [true, true, true, true],
    [$r['atrasadas'] > 0, is_string($msg) && str_contains($msg, 'más de 1 hora sin autorizar'), (bool) Db::valor("SELECT 1 FROM avisos WHERE tipo = 'factura_atrasada'"),
     str_contains((string) @file_get_contents($TMP . '/alertas.txt'), 'Facturación SRI')]);
check('Otra revisión enseguida: no repite (una vez al día)', null, Facturacion::revisarAtrasos());
Facturacion::$reloj = fn() => time() + 3 * 3600 + 120;
check('Una hora después, sin atrasadas nuevas: tampoco', null, Facturacion::revisarAtrasos());
Facturacion::$reloj = null;
$cN = $compraPlux($W, 'creditos_250');
Db::q('UPDATE facturas SET creado = ? WHERE compra_id = ?', [time() - 7200, $cN]);
Ajustes::set('facturacion_alerta_en', (string) (time() - 3700));
check('Con una atrasada NUEVA y más de 1 hora desde la última alerta: avisa otra vez', true, is_string(Facturacion::revisarAtrasos()));
Ajustes::set('facturacion_alerta_en', (string) (time() - 90000));
check('Más de un día: avisa otra vez aunque no haya nuevas', true, is_string(Facturacion::revisarAtrasos()));

// =====================================================================
titulo('Centro de Control: pestaña Facturación');
define('ENVIVO_CONTROL', true);
require $SRV . '/public/control/lib/base.php';
foreach (['resumen', 'jugadores', 'compras', 'productos', 'mercado', 'chat', 'soporte', 'ajustes', 'servidores', 'facturacion'] as $lib) require_once $SRV . '/public/control/lib/' . $lib . '.php';
$idx = (string) file_get_contents($SRV . '/public/control/index.php');
check('Registrada en index.php (require, pestaña, acciones) y base.php (nombre e insignia)', [true, true, true, true, true],
    [(bool) preg_match("/foreach \\(\\[[^\\]]*'facturacion'[^\\]]*\\] as \\\$f\\)/", $idx), str_contains($idx, "'facturacion' => cc_t_facturacion()"), str_contains($idx, "str_starts_with(\$accion, 'facturacion_') => cc_a_facturacion(\$accion, \$q)"),
     (CC_PESTANAS['facturacion'] ?? '') === 'Facturación', array_key_exists('facturacion', cc_insignias())]);
check('Insignia = atrasadas + fallidas', Facturacion::resumen()['atrasadas'] + Facturacion::resumen()['fallida'], cc_facturacion_insignia());
$_GET = ['t' => 'facturacion'];
$h = cc_t_facturacion();
check('La pestaña muestra conexión con el ERP, alerta, contadores, filtros, CSV y la tabla', [true, true, true, true, true, true],
    [str_contains($h, 'id="fact-config"') && str_contains($h, 'configurada'), str_contains($h, 'id="fact-alerta"'), str_contains($h, 'id="kpi-fact-atrasadas"') && str_contains($h, 'id="kpi-fact-fallidas"'),
     str_contains($h, 'name="estado"'), str_contains($h, 'id="fact-csv"'), str_contains($h, 'id="tabla-facturas"') && str_contains($h, 'EVF-')]);
$_GET = ['t' => 'facturacion', 'estado' => 'autorizada'];
check('Filtro "autorizadas": se ve la autorizada por el webhook, no las pendientes', [true, false],
    [str_contains($h2 = cc_t_facturacion(), Facturacion::referencia(['tipo' => 'factura', 'id' => $f10])), str_contains($h2, Facturacion::referencia(['tipo' => 'factura', 'id' => $f8]) . '<')]);
$_GET = ['t' => 'facturacion', 'id' => (string) $n1['id']];
check('Detalle: el JSON que recibe el ERP y el historial', [true, true], [str_contains($h3 = cc_t_facturacion(), 'id="fact-json"'), str_contains($h3, 'id="fact-historial"')]);
Db::q("UPDATE facturas SET estado = 'fallida' WHERE id = ?", [$f8]);
$_POST = ['id' => (string) $f8];
check('Acción reintentar (auditada)', [true, 'pendiente', true], [str_contains(cc_a_facturacion('facturacion_reintentar', 'control:prueba'), 'pendiente'), Facturacion::porId($f8)['estado'],
    (bool) Db::valor("SELECT 1 FROM auditoria WHERE accion = 'facturacion_reintentar'")]);
$_POST = ['id' => (string) $f8, 'motivo' => 'Venta de prueba del dueño'];
check('Acción "no aplica" con motivo', [true, 'no_aplica'], [str_contains(cc_a_facturacion('facturacion_no_aplica', 'control:prueba'), 'no aplica'), Facturacion::porId($f8)['estado']]);
check('"No aplica" sin motivo o sobre una autorizada -> error', [400, 400], [falla(fn() => ($_POST = ['id' => (string) $f7]) && cc_a_facturacion('facturacion_no_aplica', 'q'))[0], falla(fn() => ($_POST = ['id' => (string) $f7, 'motivo' => 'x']) && cc_a_facturacion('facturacion_no_aplica', 'q'))[0]]);
// CSV (en otro proceso: termina con exit)
file_put_contents($TMP . '/csv.php', '<?php putenv("ENVIVO_CONFIG=" . $argv[1]); $_SERVER["REMOTE_ADDR"] = "127.0.0.1"; require $argv[2] . "/src/arranque.php"; const ENVIVO_CONTROL = true;'
    . ' require $argv[2] . "/public/control/lib/base.php"; require $argv[2] . "/public/control/lib/compras.php"; require $argv[2] . "/public/control/lib/facturacion.php";'
    . ' $_GET = ["t" => "facturacion", "estado" => "todas", "csv" => "1"]; \EnVivo\Db::pdo(); cc_t_facturacion();');
$csv = (string) shell_exec('php ' . escapeshellarg($TMP . '/csv.php') . ' ' . escapeshellarg($TMP . '/config.env') . ' ' . escapeshellarg($SRV) . ' 2>&1');
$lineas = array_values(array_filter(explode("\n", trim(substr($csv, 3)))));
check('CSV: BOM, cabecera con autorización y clave de acceso, una fila por comprobante', [true, true, (int) Db::valor('SELECT COUNT(*) FROM facturas')],
    [str_starts_with($csv, "\xEF\xBB\xBF"), str_contains($lineas[0] ?? '', 'Clave de acceso') && str_contains($lineas[0] ?? '', 'N° autorización'), count($lineas) - 1]);
check('El CSV de compras para el SRI sigue (pestaña Compras)', true, function_exists('cc_compras_csv') && str_contains($idx, "cc_compras_csv()"));

// =====================================================================
titulo('bin/facturacion.php (cron y --rellenar)');
Ganchos::olvidar('compra_aprobada');   // compras "de antes del módulo": sin factura
$V = $nuevoJugador('Compra Vieja');
$cOld = Db::tx(fn() => Compras::insertar($V, Catalogo::producto('creditos_250'), 'web_plux'));
Compras::anotarComprador((int) $cOld['id'], ['cedula' => '1710034065', 'nombre' => 'Vieja Compra', 'email' => 'vieja@prueba.example', 'telefono' => '0990000001']);
Compras::aprobar((int) $cOld['id'], 'prueba');
check('Compra pagada sin factura (antes del módulo)', null, $factDe((int) $cOld['id']));
$bin = 'ENVIVO_CONFIG=' . escapeshellarg($TMP . '/config.env') . ' php ' . escapeshellarg($SRV . '/bin/facturacion.php');
exec($bin . ' --rellenar=2026-01-01 2>&1', $o1, $rc1);
exec($bin . ' --rellenar=2026-01-01 2>&1', $o2, $rc2);
check('--rellenar crea la que falta (una vez) con el titular; repetir no duplica', [0, true, '05', 0, true],
    [$rc1, str_contains(implode(' ', $o1), '1 factura'), $factDe((int) $cOld['id'])['comprador_tipo_id'] ?? null, $rc2, str_contains(implode(' ', $o2), '0 factura')]);
exec($bin . ' --rellenar=ayer 2>&1', $o3, $rc3);
exec($bin . ' 2>&1', $o4, $rc4);
exec($bin . ' --resumen 2>&1', $o5, $rc5);
check('Fecha mala -> error · cron normal -> 0 · --resumen -> JSON', [1, 0, 0, true], [$rc3, $rc4, $rc5, is_array(json_decode(implode("\n", $o5), true))]);

// =====================================================================
titulo('Configuración, despliegue y traducciones');
$ej = (string) file_get_contents($SRV . '/config.env.ejemplo');
check('config.env.ejemplo con las líneas (vacías: el repositorio es público)', [true, true, true], [str_contains($ej, "\nFACTURACION_CLAVE=\n"), str_contains($ej, "\nFACTURACION_WEBHOOK_URL=\n"), str_contains($ej, "\nFACTURACION_IPS=\n")]);
check('Cron cada 5 minutos en deploy/instalar.sh', true, str_contains((string) file_get_contents($SRV . '/deploy/instalar.sh'), '*/5 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/facturacion.php'));
$tr = json_decode((string) file_get_contents($RAIZ . '/docs/traducciones/errores_nuevos/facturacion.json'), true);
$base = json_decode((string) file_get_contents($RAIZ . '/docs/traducciones/errores.json'), true);
$idiomas = array_values(array_filter(array_keys($base), fn($k) => $k[0] !== '_'));
$codigos = array_keys($tr['_codigos'] ?? []);
$usados = [];
preg_match_all("/'codigo' => '((?:factura|facturacion)_[a-z_]+)'/", (string) file_get_contents($SRV . '/src/Facturacion.php') . file_get_contents($SRV . '/src/FacturacionApi.php'), $m);
$usados = array_values(array_unique($m[1])); sort($usados);
$cs = $codigos; sort($cs);
check('errores_nuevos/facturacion.json: los 10 idiomas de errores.json, cada uno con todos los códigos, sin vacíos', [$idiomas, true, true],
    [array_values(array_filter(array_keys($tr), fn($k) => $k[0] !== '_')), array_reduce($idiomas, fn($a, $l) => $a && array_keys($tr[$l] ?? []) === $codigos, true),
     array_reduce($idiomas, fn($a, $l) => $a && !in_array('', array_map('trim', $tr[$l] ?? ['']), true), true)]);
check('Cada código que manda el servidor está traducido', $usados, array_values(array_intersect($cs, $usados)));

// =====================================================================
foreach ($procs as $p) { proc_terminate($p); proc_close($p); }
$errores = is_file($TMP . '/php_errores.log') ? trim((string) file_get_contents($TMP . '/php_errores.log')) : '';
check('Sin errores ni avisos de PHP en los servidores', '', $errores);
echo "\n----------------------------------------\nFacturación: $OK correctas · $FALLAS fallas\n";
if (getenv('GUARDAR_TMP') === '1') echo "Base de la prueba en $TMP\n"; else exec('rm -rf ' . escapeshellarg($TMP));
exit($FALLAS === 0 ? 0 : 1);
