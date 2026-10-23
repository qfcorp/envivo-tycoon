<?php
declare(strict_types=1);

// Página de pago con tarjeta (Pago Plux) o con PayPal: /pago.php?o=<token de la compra>
// - Solo la ve el dueño de la compra (su sesión del juego).
// - Compra con canal web_paypal (POST /api/orden con metodo "paypal"): datos de la factura y «Pagar con PayPal», que va a
//   POST /api/paypal/crear y de ahí a PayPal (redirección: nada de JavaScript de PayPal aquí, la CSP sigue siendo 'self').
// - El valor es FIJO (del catálogo, con IVA incluido) y no se puede cambiar desde la página.
// - La tarjeta se cifra en el navegador (assets/pago.js con CryptoJS + JSEncrypt) y va cifrada a /api/plux/pago.
//   Este servidor nunca ve el número, la fecha ni el CVV.

require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Catalogo, Compras, Cuentas, Db, Http, PayPal, Plux, Sesiones};

try {
    Db::pdo();
    $j = Sesiones::jugadorId();
    if ($j === null) Http::pagina(401, 'Entra a tu cuenta', 'Para pagar, primero entra a tu cuenta desde el juego (menú Tienda) y vuelve a tocar Comprar.');
    $c = Compras::porToken(is_string($_GET['o'] ?? null) ? $_GET['o'] : '');
    if (!$c || (int) $c['jugador_id'] !== $j) Http::pagina(404, 'Compra no encontrada', 'Vuelve al juego y toca Comprar otra vez.');
    if ($c['estado'] === 'pagado') Http::redirigir('/?compra=ok');
    if ($c['estado'] !== 'pendiente') Http::pagina(409, 'Esta compra ya no está abierta', 'Vuelve al juego y empieza otra compra.');
    $paypal = ($c['canal'] ?? 'web_plux') === 'web_paypal';
    if ($paypal && !PayPal::configurado()) Http::pagina(503, 'Pago no disponible', 'El pago con PayPal todavía no está listo. Vuelve a la tienda y paga con tarjeta.');
    if (!$paypal && !Plux::configurado()) Http::pagina(503, 'Pago no disponible', 'El pago con tarjeta todavía no está listo. Intenta más tarde.');
    if (Ajustes::mantenimiento()) Http::pagina(503, 'Tienda en mantenimiento', Ajustes::mensajeMantenimiento());
    if (Cuentas::estadoCuenta($j) !== 'activo') Http::pagina(403, 'Cuenta suspendida', Cuentas::aviso(Cuentas::estadoCuenta($j)) ?? 'Tu cuenta no está activa.');
    $p = Catalogo::productoCompra((string) $c['producto']);
    if (!$p) Http::pagina(404, 'Producto no disponible', 'Este producto ya no está en la tienda.');
    if ($p['una_vez'] && Compras::yaComprado($j, (string) $c['producto'])) Http::pagina(409, 'Ya lo tienes', 'Este producto (' . $p['nombre'] . ') se compra una sola vez y ya lo tienes en tu cuenta.');
    // OJO (auditoría A-02): abrir esta página NO cambia la compra que se recuerda para el regreso del banco; solo /api/plux/pago lo hace.
    $jug = Cuentas::porId($j);
} catch (\Throwable $e) {
    error_log('EN VIVO pago.php: ' . get_class($e) . ' ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 300));
    Http::pagina(500, 'Algo salió mal', 'Intenta otra vez en un momento.');
}

$e = [Http::class, 'e'];
$total = Http::dinero($c['total']);
$avisos = [
    'rechazado' => 'Tu banco no aprobó el pago. Puedes intentar de nuevo o usar otra tarjeta.',
    'incompleto' => 'La respuesta del banco llegó incompleta. Intenta otra vez o usa otra tarjeta.',
    'paypal_cancelado' => 'No se completó el pago en PayPal y no se cobró nada. Puedes intentarlo otra vez.',
    'paypal_rechazado' => 'PayPal no aprobó el pago. Prueba con otra forma de pago en PayPal o vuelve a la tienda y paga con tarjeta.',
    'paypal_error' => 'No pudimos confirmar el pago con PayPal. Si PayPal te cobró, no pagues otra vez: escríbenos desde «Ayuda y soporte» en el juego.',
];
$aviso = $avisos[(string) ($_GET['r'] ?? '')] ?? '';
$nombres = explode(' ', (string) $jug['nombre'], 2);

Http::cabecerasPagina();
echo Http::inicioHtml('Pagar ' . $p['nombre']);
if ($paypal):   // ---------------------------------------------------------------- PayPal
?>
<main class="caja" id="paypal-caja" data-o="<?= $e($c['token']) ?>">
  <div class="marca">EN VIVO <b>Tycoon</b></div>
<?php if (PayPal::ambiente() === 'sandbox'): ?>
  <div class="aviso aviso-info"><b>MODO DE PRUEBAS (sandbox):</b> no se cobra dinero real. Usa solo una cuenta de comprador de prueba de PayPal.</div>
<?php endif; ?>
  <h1>Pagar con PayPal</h1>
  <section class="producto">
    <div class="producto-nombre"><?= $e($p['nombre']) ?></div>
    <div class="producto-detalle"><?= $e($p['detalle']) ?></div>
    <div class="producto-total"><span>Total a pagar</span><output id="valor-fijo"><?= $e($total) ?></output></div>
    <div class="tenue">Incluye IVA 15 %. El valor es fijo y no se puede cambiar.</div>
  </section>
<?php if ($aviso !== ''): ?>
  <div class="aviso aviso-error" id="aviso-regreso"><?= $e($aviso) ?></div>
<?php endif; ?>
<?= class_exists(\EnVivo\Facturacion::class) ? \EnVivo\Facturacion::htmlPago($c, $jug, true) : '' /* datos para la factura SRI (INTEGRAR_FACTURACION.md) */ ?>
  <label class="casilla"><input type="checkbox" id="paypal-terminos"> <span>Acepto los <a href="/terminos.html" target="_blank" rel="noopener">términos y condiciones</a> y la <a href="/privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.</span></label>
  <button type="button" class="boton grande paypal" id="paypal-pagar">Pagar <?= $e($total) ?> con <b>Pay<i>Pal</i></b></button>
  <div id="paypal-mensaje" aria-live="polite"></div>
  <p class="tenue seguro">Te llevamos a la página de PayPal para pagar con tu cuenta PayPal o con tarjeta. Nosotros no vemos ni guardamos tus datos de pago. Al terminar vuelves solo al juego.</p>
  <p class="tenue">Si eres menor de edad, pide permiso a tus padres antes de comprar.</p>
  <p class="tenue">¿Problemas con un pago? Usa la opción «Ayuda y soporte» dentro del juego.</p>
  <p class="pie"><a href="/">← Volver al juego</a> · <a href="/terminos.html" target="_blank" rel="noopener">Términos</a> · <a href="/privacidad.html" target="_blank" rel="noopener">Privacidad</a></p>
</main>
<script src="/pago-assets/factura.js?v=1"></script>
<script src="/pago-assets/paypal.js?v=1"></script>
</body></html>
<?php
    exit;
endif;   // ------------------------------------------------------------------------ tarjeta (Pago Plux)
?>
<main class="caja" id="plux-caja" data-o="<?= $e($c['token']) ?>" data-llave="<?= $e(Plux::llavePem()) ?>">
  <div class="marca">EN VIVO <b>Tycoon</b></div>
<?php if (Plux::ambiente() === 'sandbox'): ?>
  <div class="aviso aviso-info"><b>MODO DE PRUEBAS (sandbox):</b> no se cobra dinero real. Usa solo tarjetas de prueba de Plux.</div>
<?php endif; ?>
  <h1>Pagar con tarjeta</h1>
  <section class="producto">
    <div class="producto-nombre"><?= $e($p['nombre']) ?></div>
    <div class="producto-detalle"><?= $e($p['detalle']) ?></div>
    <div class="producto-total"><span>Total a pagar</span><output id="valor-fijo"><?= $e($total) ?></output></div>
    <div class="tenue">Incluye IVA 15 %. El valor es fijo y no se puede cambiar.</div>
  </section>
<?php if ($aviso !== ''): ?>
  <div class="aviso aviso-error" id="aviso-regreso"><?= $e($aviso) ?></div>
<?php endif; ?>

  <div id="plux-paso-datos">
    <div class="campos">
      <label class="ancho">Número de la tarjeta<input id="plux-numero" inputmode="numeric" autocomplete="cc-number" maxlength="23" placeholder="0000 0000 0000 0000"></label>
      <label>Mes<select id="plux-mes" autocomplete="cc-exp-month"><option value="">Mes</option>
<?php for ($m = 1; $m <= 12; $m++): ?>        <option value="<?= sprintf('%02d', $m) ?>"><?= sprintf('%02d', $m) ?></option>
<?php endfor; ?>
      </select></label>
      <label>Año<select id="plux-anio" autocomplete="cc-exp-year"><option value="">Año</option>
<?php for ($a = (int) date('Y'); $a <= (int) date('Y') + 12; $a++): ?>        <option value="<?= $a ?>"><?= $a ?></option>
<?php endfor; ?>
      </select></label>
      <label>CVV<input id="plux-cvv" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="123"></label>
      <label>Nombres del titular<input id="plux-nombres" maxlength="60" autocomplete="cc-given-name" value="<?= $e($nombres[0] ?? '') ?>"></label>
      <label>Apellidos del titular<input id="plux-apellidos" maxlength="60" autocomplete="cc-family-name" value="<?= $e($nombres[1] ?? '') ?>"></label>
      <label>Cédula del titular<input id="plux-cedula" maxlength="20" inputmode="numeric" placeholder="1712345678"></label>
      <label>Correo<input id="plux-email" type="email" maxlength="120" autocomplete="email" value="<?= $e($jug['email']) ?>"></label>
      <label class="ancho">Celular<input id="plux-telefono" type="tel" maxlength="16" autocomplete="tel" placeholder="0991234567"></label>
    </div>
<?= class_exists(\EnVivo\Facturacion::class) ? \EnVivo\Facturacion::htmlPago($c, $jug) : '' /* datos para la factura SRI (INTEGRAR_FACTURACION.md) */ ?>
    <label class="casilla"><input type="checkbox" id="plux-terminos"> <span>Acepto los <a href="/terminos.html" target="_blank" rel="noopener">términos y condiciones</a> y la <a href="/privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.</span></label>
    <button type="button" class="boton grande" id="plux-pagar">🔒 Pagar <?= $e($total) ?></button>
  </div>

  <div id="plux-paso-otp" hidden>
    <h2>Código de tu banco</h2>
    <p>Tu banco te envió un código por SMS o correo. Escríbelo aquí:</p>
    <input id="plux-otp" inputmode="numeric" maxlength="10" autocomplete="one-time-code" class="otp">
    <button type="button" class="boton grande" id="plux-otp-btn">Confirmar código</button>
  </div>

  <div id="plux-mensaje" aria-live="polite"></div>

  <p class="tenue seguro">Tu tarjeta se procesa con Pago Plux; nosotros no guardamos los datos de tu tarjeta. Los datos se cifran en este navegador antes de enviarse.</p>
  <p class="tenue">Si eres menor de edad, pide permiso a tus padres antes de comprar.</p>
  <p class="tenue">¿Problemas con un pago? Usa la opción «Ayuda y soporte» dentro del juego.</p>
  <p class="pie"><a href="/">← Volver al juego</a> · <a href="/terminos.html" target="_blank" rel="noopener">Términos</a> · <a href="/privacidad.html" target="_blank" rel="noopener">Privacidad</a></p>
</main>
<script src="/pago-assets/vendor/crypto-js.min.js"></script>
<script src="/pago-assets/vendor/jsencrypt.min.js"></script>
<script src="/pago-assets/factura.js?v=1"></script>
<script src="/pago-assets/pago.js?v=2"></script>
</body></html>
