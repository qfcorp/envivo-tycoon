/* =========================================================
   EN VIVO Tycoon — App de iPhone (App Store)

   La app de iPhone abre el juego con /index.html?origen=ios y su User-Agent trae «TukanIOS» (ej. «… TukanIOS/1.0.0»).
   - App nueva, CON el puente del App Store (window.webkit.messageHandlers.tukanAppStore, js/appstore.js): se vende con las
     compras dentro de la app de Apple (StoreKit 2), igual que la app de Android con Google Play. Docs: docs/IPHONE_APP_STORE.md
   - App vieja, SIN ese puente: NO se muestra la tienda de dinero real (regla de Apple 3.1.1): ni precios en USD, ni botones
     de comprar o suscribirse, ni textos que digan dónde pagar. Lo que se compra con lo ganado jugando (créditos, dinero del
     juego) sí se queda.
   Nunca, en ningún iPhone: Pago Plux, PayPal, Tukán Pagos, Google Play ni enlaces de pago. El servidor rechaza esos pagos si
   el User-Agent trae TukanIOS (server/public/api.php); solo acepta /api/apple/verificar.

   API:  window.TukanIOS = {
     activo()     -> true dentro de la app de iPhone
     conTienda()  -> true dentro de la app de iPhone CON el puente del App Store
     sinTienda()  -> true dentro de la app de iPhone SIN el puente (app vieja): nada de dinero real
   }
   Con activo(), <html> lleva class="tukan-ios" (y "tukan-ios-tienda" si conTienda()).
   ?origen=ios lo guarda en localStorage (por si la app abre una página sin el parámetro); ?origen=web lo quita.
   ========================================================= */
(function (root) {
  'use strict';
  var CLAVE = 'envivo_canal';

  function guardado() { try { return root.localStorage; } catch (e) { return null; } }

  function activo() {
    try {
      var ua = (root.navigator && root.navigator.userAgent) || '';
      if (/TukanIOS/.test(ua)) return true;
      var q = (root.location && root.location.search) || '';
      var s = guardado();
      if (/[?&]origen=ios\b/.test(q)) { try { if (s) s.setItem(CLAVE, 'ios'); } catch (e) { /* modo privado */ } return true; }
      if (/[?&]origen=(web|android)\b/.test(q)) { try { if (s) s.removeItem(CLAVE); } catch (e) { /* nada */ } return false; }
      return !!(s && s.getItem(CLAVE) === 'ios');
    } catch (e) {
      return false;
    }
  }

  // El puente del App Store lo pone la app nueva de iPhone (WKScriptMessageHandlerWithReply «tukanAppStore»)
  function puente() {
    try { var h = root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.tukanAppStore; return !!(h && typeof h.postMessage === 'function'); } catch (e) { return false; }
  }
  function conTienda() { return activo() && puente(); }
  function sinTienda() { return activo() && !puente(); }

  root.TukanIOS = { activo: activo, conTienda: conTienda, sinTienda: sinTienda };
  try {
    if (activo() && root.document && root.document.documentElement) {
      root.document.documentElement.classList.add('tukan-ios');
      if (puente()) root.document.documentElement.classList.add('tukan-ios-tienda');
    }
  } catch (e) { /* nada */ }
})(typeof window !== 'undefined' ? window : globalThis);
