// Datos para la factura electrónica del SRI en la página de pago (bloque de Facturacion::htmlPago).
// Tres opciones: a nombre del titular de la tarjeta (por defecto), a otro nombre / RUC, o consumidor final (solo hasta el
// tope del SRI, USD 50). pago.js llama a EnVivoFactura.leer(msg) al pagar: devuelve los datos, null (no hay bloque) o
// false (falta algo; ya mostró el mensaje). El servidor vuelve a revisar todo (Facturacion::datosDePago).
(function () {
  'use strict';
  var caja = document.getElementById('fact-caja');
  if (!caja) return;
  function $(id) { return document.getElementById(id); }
  function modo() { var r = caja.querySelector('input[name="fact-modo"]:checked'); return r ? r.value : 'titular'; }
  function mostrar() {
    var m = modo();
    $('fact-otro').hidden = m !== 'otro';
    $('fact-dir').hidden = m === 'consumidor_final';
  }
  Array.prototype.forEach.call(caja.querySelectorAll('input[name="fact-modo"]'), function (r) { r.addEventListener('change', mostrar); });
  mostrar();
  function cedulaValida(c) {
    if (!/^\d{10}$/.test(c)) return false;
    var p = +c.slice(0, 2);
    if (!((p >= 1 && p <= 24) || p === 30) || +c[2] >= 6) return false;
    var s = 0;
    for (var i = 0; i < 9; i++) { var x = +c[i] * (i % 2 === 0 ? 2 : 1); s += x > 9 ? x - 9 : x; }
    return (10 - s % 10) % 10 === +c[9];
  }
  function rucValido(r) {
    if (!/^\d{13}$/.test(r) || r.slice(10) === '000') return false;
    var p = +r.slice(0, 2);
    if (!((p >= 1 && p <= 24) || p === 30)) return false;
    var t = +r[2];
    return t < 6 ? cedulaValida(r.slice(0, 10)) : (t === 6 || t === 9);
  }
  function limpiar(v) { return String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); }
  window.EnVivoFactura = {
    cedulaValida: cedulaValida,
    rucValido: rucValido,
    leer: function (msg) {
      var m = modo(), dir = $('fact-direccion').value.trim();
      if (m === 'consumidor_final') {
        if (parseFloat(caja.dataset.total) > parseFloat(caja.dataset.tope)) { msg('Para este valor el SRI pide identificar al comprador. Elige otra opción de factura.', 'error'); return false; }
        return { modo: m };
      }
      if (m === 'otro') {
        var id = limpiar($('fact-identificacion').value), razon = $('fact-razon').value.trim(), email = $('fact-email').value.trim();
        if (!id || razon.length < 3) { msg('Para la factura escribe la cédula, RUC o pasaporte y el nombre o razón social.', 'error'); return false; }
        if (id.length === 13 && /^\d+$/.test(id) && !rucValido(id)) { msg('El RUC no es válido. Revísalo (13 números).', 'error'); return false; }
        if (id.length === 10 && /^\d+$/.test(id) && !cedulaValida(id)) { msg('La cédula para la factura no es válida. Revísala.', 'error'); return false; }
        if (email && !/^\S+@\S+\.\S+$/.test(email)) { msg('Escribe un correo válido para la factura.', 'error'); return false; }
        return { modo: m, identificacion: id, razon_social: razon, email: email, direccion: dir };
      }
      var ced = limpiar(($('plux-cedula') || {}).value);
      if ((ced.length === 10 && /^\d+$/.test(ced) && !cedulaValida(ced)) || (ced.length === 13 && /^\d+$/.test(ced) && !rucValido(ced))) {
        msg('La cédula del titular no es válida para la factura. Revísala o elige «Consumidor final».', 'error'); return false;
      }
      return { modo: 'titular', direccion: dir };
    }
  };
})();
