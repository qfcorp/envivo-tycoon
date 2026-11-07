// Pago con tarjeta por Tukán Pagos (pago.php con TUKAN_PAGOS_ACTIVO=1). Pide al servidor que cree el cobro
// (POST /api/tukanpagos/crear, con los datos de la factura) y lleva al comprador a la página de pago de Tukán Pagos.
// Al volver, el servidor pregunta a Tukán Pagos (/api/tukanpagos/volver): el navegador nunca decide si se pagó.
(function () {
  'use strict';
  var caja = document.getElementById('tkp-caja');
  if (!caja) return;
  var ocupado = false;
  function $(id) { return document.getElementById(id); }
  function msg(t, tipo) { var m = $('tkp-mensaje'); m.className = 'aviso aviso-' + (tipo || 'info'); m.textContent = t; }
  function listo() { ocupado = false; $('tkp-pagar').disabled = false; }
  // Si vuelve con el botón «Atrás» desde la página de pago (página guardada por el navegador), el botón se puede tocar otra vez
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) { listo(); $('tkp-mensaje').className = ''; $('tkp-mensaje').textContent = ''; } });
  $('tkp-pagar').addEventListener('click', function () {
    if (ocupado) return;
    if (!$('tkp-terminos').checked) { msg('Para pagar debes aceptar los términos y condiciones.', 'error'); return; }
    // Datos para la factura SRI (assets/factura.js): false = falta algo (ya mostró el mensaje)
    var factura = window.EnVivoFactura ? window.EnVivoFactura.leer(msg) : null;
    if (factura === false) return;
    ocupado = true; $('tkp-pagar').disabled = true;
    msg('Te llevamos a la página segura de pago…', 'info');
    var body = { o: caja.dataset.o };
    if (factura) body.factura = factura;
    fetch('/api/tukanpagos/crear', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r && r.ok && r.ir) { msg('✅ Esta compra ya está pagada. Volviendo al juego…', 'ok'); location.href = r.ir; return; }
        if (r && r.ok && r.url) { location.href = r.url; return; }
        listo();
        msg('❌ ' + ((r && r.error) || 'No se pudo preparar el pago con tarjeta.') + ' No se hizo ningún cobro.', 'error');
      })
      .catch(function () { listo(); msg('Error de conexión. Revisa tu internet e intenta de nuevo.', 'error'); });
  });
})();
