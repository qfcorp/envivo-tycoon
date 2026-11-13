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
  var idiomaAnotado = null;

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
    // Anota el idioma elegido para el service worker (sw.js lo baja con cada versión nueva para jugar sin internet)
    idioma: function (code) {
      try {
        if (!window.caches || !code || idiomaAnotado === code) return;
        idiomaAnotado = code;
        caches.open('envivo-idioma').then(function (c) { return c.put('./__idioma', new Response(String(code))); })['catch'](function () { /* nada */ });
      } catch (e) { /* sin caché */ }
    },
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

  /* "Hay una versión nueva — Actualizar" (auditoría 13-nov): el service worker nuevo se activa solo (skipWaiting) y toma
     la página (controllerchange). Si la página ya tenía uno (no es la primera visita), sale un aviso chico: un toque
     abre el juego otra vez con la versión nueva (la partida ya está guardada). Si hubiera uno esperando, se le pide
     que se active. */
  var avisoMostrado = false;
  function txt(k, def) {
    try { var I = window.I18N; if (I && I.T) { var v = I.T(k); if (v && v !== k) return v; } } catch (e) { /* nada */ }
    return def;
  }
  function mostrarAvisoVersion() {
    if (avisoMostrado || !document.body) return;
    avisoMostrado = true;
    var d = document.createElement('div');
    d.className = 'swnueva';
    d.id = 'swNueva';
    d.setAttribute('role', 'status');
    var t = document.createElement('span');
    t.textContent = txt('sw.nueva', 'Hay una versión nueva');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn main sm';
    b.setAttribute('data-sw', 'actualizar');
    b.textContent = txt('sw.actualizar', 'Actualizar');
    b.addEventListener('click', function () { try { location.reload(); } catch (e) { /* nada */ } });
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'swx';
    x.setAttribute('aria-label', txt('comun.cerrar', 'Cerrar'));
    x.textContent = '×';
    x.addEventListener('click', function () { d.remove(); });
    d.appendChild(t); d.appendChild(b); d.appendChild(x);
    document.body.appendChild(d);
  }
  function avisoVersionNueva() {
    try {
      var sw = navigator.serviceWorker;
      var habia = !!sw.controller;   // primera visita: el primer service worker toma la página y no hay nada que avisar
      sw.addEventListener('controllerchange', function () { if (habia) mostrarAvisoVersion(); habia = true; });
      if (sw.getRegistration) sw.getRegistration().then(function (r) {
        if (r && r.waiting && sw.controller) { try { r.waiting.postMessage({ tipo: 'activar' }); } catch (e) { /* nada */ } }
      })['catch'](function () { /* nada */ });
    } catch (e) { /* nada */ }
  }
  try { window.__swAviso = mostrarAvisoVersion; } catch (e) { /* pruebas */ }

  // Registrar el service worker solo en https o en localhost (no en file:// ni dentro de iframes).
  try {
    var p = location.protocol;
    var h = location.hostname;
    var local = (h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
    var okProto = p === 'https:' || (p === 'http:' && local);
    var inFrame = false;
    try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
    if (okProto && !inFrame && 'serviceWorker' in navigator) {
      avisoVersionNueva();
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
