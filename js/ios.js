/* =========================================================
   EN VIVO Tycoon — App de iPhone (App Store): sin tienda de dinero real (regla de Apple 3.1.1)

   La app de iPhone abre el juego con /index.html?origen=ios y su User-Agent trae «TukanIOS» (ej. «… TukanIOS/1.0.0»).
   En el iPhone NO se muestra la tienda de dinero real: ni precios en USD, ni botones de comprar o suscribirse, ni Pago Plux,
   PayPal o Google Play, ni textos que digan dónde pagar. Lo que se compra con lo ganado jugando (créditos, dinero del juego)
   sí se queda. El servidor también rechaza crear pagos si el User-Agent trae TukanIOS (server/public/api.php).

   API:  window.TukanIOS = { activo() -> true dentro de la app de iPhone }
   Con activo(), <html> lleva class="tukan-ios".
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

  root.TukanIOS = { activo: activo };
  try { if (activo() && root.document && root.document.documentElement) root.document.documentElement.classList.add('tukan-ios'); } catch (e) { /* nada */ }
})(typeof window !== 'undefined' ? window : globalThis);
