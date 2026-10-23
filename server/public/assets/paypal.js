// Pago con PayPal de EN VIVO Tycoon (pago.php con una compra web_paypal). Sin JavaScript de PayPal: este archivo pide al
// servidor que cree la orden (POST /api/paypal/crear, con los datos de la factura) y lleva al comprador a PayPal.
// Al volver, el servidor captura y revisa el pago (/api/paypal/volver): el navegador nunca decide si se pagó.
(function () {
  'use strict';
  var caja = document.getElementById('paypal-caja');
  if (!caja) return;
  var ocupado = false;
  function $(id) { return document.getElementById(id); }
  function msg(t, tipo) { var m = $('paypal-mensaje'); m.className = 'aviso aviso-' + (tipo || 'info'); m.textContent = t; }
  function listo() { ocupado = false; $('paypal-pagar').disabled = false; }
  // Si vuelve con el botón «Atrás» desde PayPal (página guardada por el navegador), el botón se puede tocar otra vez
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) { listo(); $('paypal-mensaje').className = ''; $('paypal-mensaje').textContent = ''; } });
  $('paypal-pagar').addEventListener('click', function () {
    if (ocupado) return;
    if (!$('paypal-terminos').checked) { msg('Para pagar debes aceptar los términos y condiciones.', 'error'); return; }
    // Datos para la factura SRI (assets/factura.js): false = falta algo (ya mostró el mensaje)
    var factura = window.EnVivoFactura ? window.EnVivoFactura.leer(msg) : null;
    if (factura === false) return;
    ocupado = true; $('paypal-pagar').disabled = true;
    msg('Te llevamos a PayPal…', 'info');
    var body = { o: caja.dataset.o };
    if (factura) body.factura = factura;
    fetch('/api/paypal/crear', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r && r.ok && r.ir) { msg('✅ Esta compra ya está pagada. Volviendo al juego…', 'ok'); location.href = r.ir; return; }
        if (r && r.ok && r.url) { location.href = r.url; return; }
        listo();
        msg('❌ ' + ((r && r.error) || 'No se pudo preparar el pago con PayPal.') + ' No se hizo ningún cobro.', 'error');
      })
      .catch(function () { listo(); msg('Error de conexión. Revisa tu internet e intenta de nuevo.', 'error'); });
  });
})();
