/* EN VIVO Tycoon — reporte de errores del juego, sin servicios de terceros (server/INTEGRAR_ERRORES.md).
   - Escucha window.onerror ('error') y las promesas sin atender ('unhandledrejection'); y window.ReportarError(e, contexto)
     para que cualquier parte del juego reporte un error atrapado (contexto: texto corto, ej. 'mercado.publicar').
   - Sin repetidos (mensaje + archivo + línea) y máximo 10 por sesión. Se mandan en lotes a POST /api/error con
     navigator.sendBeacon (o fetch keepalive): {errores: [{mensaje, pila (2 KB), archivo, linea, columna, url (sin
     parámetros), version (la del service worker), idioma, plataforma (web / android / pwa), memoria, conexion,
     ultimo_paso (los últimos toques: solo qué botón, nunca textos), contexto, tipo}]}.
   - Nunca lanza errores. Apagado en pruebas automáticas (navigator.webdriver) salvo window.__ENVIVO_ERRORES = true;
     window.__ENVIVO_ERRORES = false lo apaga siempre. Sin http(s) (file://, el juego en un solo archivo) no manda nada.
   - Sin textos para el jugador: no muestra nada en pantalla. API: window.EnVivoErrores = { reportar, enviar, pendientes, estado }. */
(function (root) {
  'use strict';
  var MAX_SESION = 10, MAX_PILA = 2048, ESPERA = 2000, MAX_PASOS = 6;
  var ATRIBUTOS = ['act', 'tab', 'accion'];   // qué se tocó: data-act, data-tab, data-accion (nunca el texto)
  var vistos = {}, contados = 0, cola = [], pasos = [], reloj = null, version = '', ultimoEnvio = null;

  function activo() {
    try {
      if (root.__ENVIVO_ERRORES === false) return false;
      if (root.__ENVIVO_ERRORES === true) return true;
      if (root.navigator && root.navigator.webdriver) return false;
      return /^https?:$/.test(root.location.protocol);
    } catch (e) { return false; }
  }

  function texto(v, max) {
    try { v = v == null ? '' : String(v); } catch (e) { v = ''; }
    return v.length > max ? v.slice(0, max) : v;
  }

  // Sin correos ni números largos (tarjetas, teléfonos), y las direcciones sin "?..." ni "#..."
  function privado(s) {
    try {
      return String(s)
        .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '[correo]')
        .replace(/\b\d(?:[ \-]?\d){11,}\b/g, '[número]')
        .replace(/((?:https?|file|blob):\/\/[^\s?#)]*)[?#][^\s):]*/g, '$1');
    } catch (e) { return ''; }
  }

  function urlLimpia() {
    try {
      var l = root.location, a = /[?&]origen=android\b/.test(l.search || '');
      return l.pathname + (a ? '?origen=android' : '');
    } catch (e) { return ''; }
  }

  function archivo(f) {
    try {
      if (!f) return '';
      var u = new URL(String(f), root.location.href);
      return u.origin === root.location.origin ? u.pathname : u.origin + u.pathname;
    } catch (e) { return texto(f, 200); }
  }

  function plataforma() {
    try {
      var ses = root.sessionStorage;
      if (/[?&]origen=android\b/.test(root.location.search || '') || /^android-app:\/\//.test(root.document.referrer || '') ||
          (ses && ses.getItem('envivo_origen') === 'android')) return 'android';
      if (root.matchMedia && (root.matchMedia('(display-mode: standalone)').matches || root.matchMedia('(display-mode: fullscreen)').matches)) return 'pwa';
      if (root.navigator && root.navigator.standalone === true) return 'pwa';
    } catch (e) { /* nada */ }
    return 'web';
  }

  function idioma() {
    try { return texto((root.I18N && root.I18N.idioma) || root.document.documentElement.lang || root.navigator.language || '', 12); } catch (e) { return ''; }
  }

  function memoria() {
    try {
      var p = [], n = root.navigator;
      if (n && n.deviceMemory) p.push('equipo ' + n.deviceMemory + ' GB');
      var m = root.performance && root.performance.memory;
      if (m && m.usedJSHeapSize) p.push('js ' + Math.round(m.usedJSHeapSize / 1048576) + '/' + Math.round(m.jsHeapSizeLimit / 1048576) + ' MB');
      return p.join(', ');
    } catch (e) { return ''; }
  }

  function conexion() {
    try {
      var n = root.navigator, c = n && (n.connection || n.mozConnection || n.webkitConnection), p = [];
      if (n && n.onLine === false) p.push('sin internet');
      if (c) {
        if (c.effectiveType) p.push(String(c.effectiveType));
        if (c.downlink) p.push(c.downlink + ' Mbps');
        if (c.saveData) p.push('ahorro de datos');
      }
      return p.join(', ');
    } catch (e) { return ''; }
  }

  // Versión del juego = la caché del service worker que está activa (envivo-vNN-shell), o window.ENVIVO_VERSION
  function buscarVersion() {
    try {
      if (typeof root.ENVIVO_VERSION === 'string') { version = texto(root.ENVIVO_VERSION, 40); return Promise.resolve(version); }
      if (version || !root.caches || !root.caches.keys) return Promise.resolve(version);
      return root.caches.keys().then(function (ks) {
        var v = '';
        for (var i = 0; i < ks.length; i++) {
          var m = /^(envivo-v[\w.\-]+)-shell$/.exec(ks[i]);
          if (m && (!v || v.localeCompare(m[1], 'en', { numeric: true }) < 0)) v = m[1];
        }
        version = v;
        return v;
      }, function () { return ''; });
    } catch (e) { return Promise.resolve(''); }
  }

  // Últimos toques: solo QUÉ se tocó (data-act, data-tab, id), nunca el texto
  function anotarPaso(ev) {
    try {
      var el = ev.target, d = 0;
      while (el && el.nodeType === 1 && d < 5) {
        var a = '';
        if (el.getAttribute) for (var k = 0; k < ATRIBUTOS.length; k++) { var v = el.getAttribute('data-' + ATRIBUTOS[k]); if (v) a += '[' + ATRIBUTOS[k] + '=' + v.slice(0, 24) + ']'; }
        if (a || el.id || el.tagName === 'BUTTON' || el.tagName === 'A') {
          var p = el.tagName.toLowerCase() + (a || (el.id ? '#' + el.id : ''));
          p = texto(p.replace(/[^\w\-.:=#\[\]\/ ]+/g, ''), 60);
          if (pasos[pasos.length - 1] !== p) pasos.push(p);
          if (pasos.length > MAX_PASOS) pasos.shift();
          return;
        }
        el = el.parentNode; d++;
      }
    } catch (e) { /* nada */ }
  }

  function reportar(err, extra) {
    try {
      if (!activo() || contados >= MAX_SESION) return false;
      extra = extra || {};
      var msg = extra.mensaje, pila = '', arch = extra.archivo || '', lin = extra.linea || 0, col = extra.columna || 0;
      if (err && typeof err === 'object') {
        if (!msg) msg = (err.name && err.message ? err.name + ': ' + err.message : err.message) || '';
        pila = err.stack ? String(err.stack) : '';
      }
      if (!msg) { try { msg = typeof err === 'string' ? err : JSON.stringify(err); } catch (e) { msg = String(err); } }
      msg = texto(privado(msg || 'Error sin mensaje'), 500);
      if (!arch && pila) {   // primer archivo de la pila
        var m = /((?:https?|file|blob):\/\/[^\s)]+?):(\d+):(\d+)/.exec(pila);
        if (m) { arch = m[1]; lin = lin || +m[2]; col = col || +m[3]; }
      }
      arch = archivo(arch);
      // "Script error." sin archivo = de otro sitio (extensiones, anuncios): no sirve
      if (/^Script error\.?$/i.test(msg) && !arch) return false;
      var clave = msg + '|' + arch + '|' + (lin || 0);
      if (vistos[clave]) return false;
      vistos[clave] = 1;
      contados++;
      cola.push({
        mensaje: msg, pila: texto(privado(pila), MAX_PILA), archivo: arch, linea: +lin || 0, columna: +col || 0,
        url: urlLimpia(), idioma: idioma(), plataforma: plataforma(), memoria: memoria(), conexion: conexion(),
        ultimo_paso: pasos.slice(), contexto: texto(privado(extra.contexto || ''), 120), tipo: extra.tipo || 'manual'
      });
      programar();
      return true;
    } catch (e) { return false; }
  }

  function programar() {
    try {
      if (reloj) return;
      reloj = setTimeout(function () { reloj = null; enviar(); }, ESPERA);
    } catch (e) { /* nada */ }
  }

  function mandar(lote) {
    var cuerpo = JSON.stringify({ errores: lote });
    try {
      var n = root.navigator;
      if (n && typeof n.sendBeacon === 'function' && root.Blob) {
        // text/plain: el navegador no hace la consulta previa (CORS) y el servidor lee el JSON igual
        if (n.sendBeacon('/api/error', new root.Blob([cuerpo], { type: 'text/plain;charset=UTF-8' }))) { ultimoEnvio = 'beacon'; return; }
      }
    } catch (e) { /* sigue con fetch */ }
    try {
      if (typeof root.fetch === 'function') {
        root.fetch('/api/error', { method: 'POST', body: cuerpo, keepalive: true, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' } }).catch(function () {});
        ultimoEnvio = 'fetch';
      }
    } catch (e) { /* nada */ }
  }

  // Manda lo que haya en la cola (con la versión si ya se conoce). Si la página se cierra, sin esperar la versión.
  function enviar(ya) {
    try {
      if (reloj) { clearTimeout(reloj); reloj = null; }
      if (!cola.length || !activo()) return;
      var poner = function () {
        if (!cola.length) return;
        var lote = cola.splice(0, cola.length);
        for (var i = 0; i < lote.length; i++) lote[i].version = version;
        mandar(lote);
      };
      if (ya || version) poner();
      else buscarVersion().then(poner, poner);
    } catch (e) { /* nada */ }
  }

  try {
    root.addEventListener('error', function (ev) {
      try {
        if (!ev || ev.target && ev.target !== root && ev.target.nodeType === 1) return;   // falló un <img>/<script>: no es un error del código
        reportar(ev.error || null, { mensaje: ev.error ? '' : ev.message, archivo: ev.filename, linea: ev.lineno, columna: ev.colno, tipo: 'error' });
      } catch (e) { /* nada */ }
    }, true);
    root.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev && ev.reason;
        reportar(r instanceof Error ? r : null, { mensaje: r instanceof Error ? '' : 'Promesa sin atender: ' + texto(typeof r === 'string' ? r : (function () { try { return JSON.stringify(r); } catch (e) { return String(r); } })(), 300), tipo: 'promesa' });
      } catch (e) { /* nada */ }
    });
    root.addEventListener('pointerdown', anotarPaso, true);
    root.addEventListener('keydown', function (ev) { try { if (ev.key === 'Enter' || ev.key === 'Escape') anotarPaso(ev); } catch (e) { /* nada */ } }, true);
    root.addEventListener('pagehide', function () { enviar(true); });
    root.document && root.document.addEventListener('visibilitychange', function () { try { if (root.document.visibilityState === 'hidden') enviar(true); } catch (e) { /* nada */ } });
    setTimeout(function () { if (activo()) buscarVersion(); }, 3000);
  } catch (e) { /* nada */ }

  try {
    root.ReportarError = function (e, contexto) { return reportar(e, { contexto: contexto, tipo: 'manual' }); };
    root.EnVivoErrores = {
      reportar: root.ReportarError,
      enviar: function () { enviar(); },
      pendientes: function () { return cola.length; },
      estado: function () { return { activo: activo(), contados: contados, pendientes: cola.length, pasos: pasos.slice(), version: version, ultimoEnvio: ultimoEnvio }; }
    };
  } catch (e) { /* nada */ }
})(typeof window !== 'undefined' ? window : this);
