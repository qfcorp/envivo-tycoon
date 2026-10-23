/* PWA de EN VIVO Tycoon: registra el service worker (modo sin internet) y
   permite mostrar un botón "Instalar app".
   API:  window.PWA = { canInstall(), install(), isStandalone(), isIOS(), onChange(cb) }
   - canInstall(): true si Android/Chrome ofreció instalar (evento beforeinstallprompt).
   - install(): abre el diálogo; resuelve 'accepted' | 'dismissed' | 'unavailable'.
   - isIOS(): en iPhone/iPad no hay diálogo; mostrar "Compartir → Agregar a inicio".
   - onChange(cb): avisa cuando cambia canInstall() o se instala; devuelve función para dejar de escuchar. */
(function () {
  'use strict';
  var deferred = null;
  var listeners = [];

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](api); } catch (e) { /* ignorar errores del UI */ }
    }
  }

  function isStandalone() {
    try {
      if (window.navigator.standalone === true) return true; // iOS
      return !!(window.matchMedia && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches));
    } catch (e) { return false; }
  }

  function isIOS() {
    try {
      var ua = navigator.userAgent || '';
      if (/iPad|iPhone|iPod/.test(ua)) return true;
      // iPadOS 13+ se presenta como Mac con pantalla táctil
      return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    } catch (e) { return false; }
  }

  var api = {
    canInstall: function () { return !!deferred && !isStandalone(); },
    install: function () {
      if (!deferred) return Promise.resolve('unavailable');
      var ev = deferred;
      deferred = null; // el evento solo se puede usar una vez
      try {
        ev.prompt();
        return Promise.resolve(ev.userChoice).then(function (choice) {
          notify();
          return (choice && choice.outcome === 'accepted') ? 'accepted' : 'dismissed';
        }, function () { notify(); return 'dismissed'; });
      } catch (e) {
        notify();
        return Promise.resolve('unavailable');
      }
    },
    isStandalone: isStandalone,
    isIOS: isIOS,
    onChange: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function () {
        var i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    }
  };

  try { window.PWA = api; } catch (e) { /* nada */ }

  try {
    window.addEventListener('beforeinstallprompt', function (e) {
      try { e.preventDefault(); } catch (_) { /* nada */ }
      deferred = e;
      notify();
    });
    window.addEventListener('appinstalled', function () {
      deferred = null;
      notify();
    });
  } catch (e) { /* nada */ }

  // Registrar el service worker solo en https o en localhost (no en file:// ni dentro de iframes).
  try {
    var p = location.protocol;
    var h = location.hostname;
    var local = (h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
    var okProto = p === 'https:' || (p === 'http:' && local);
    var inFrame = false;
    try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
    if (okProto && !inFrame && 'serviceWorker' in navigator) {
      var reg = function () {
        try {
          navigator.serviceWorker.register('./sw.js', { scope: './' })['catch'](function () { /* silencioso */ });
        } catch (e) { /* silencioso */ }
      };
      if (document.readyState === 'complete') reg();
      else window.addEventListener('load', reg);
    }
  } catch (e) { /* entornos sin permiso (sandbox): no hacer nada */ }
})();
