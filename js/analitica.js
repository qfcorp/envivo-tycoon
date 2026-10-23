/* =========================================================
   EN VIVO Tycoon — Analítica propia (sin SDK de terceros)
   Cola de eventos que se manda en lotes a POST /api/eventos (server/src/AnaliticaApi.php):
   cada 30 s o con 20 eventos esperando, y con navigator.sendBeacon al esconder o cerrar la página.
   Privacidad: la "instalación" es un número al azar guardado en este navegador (no es el celular, ni la IP, ni la
   cuenta). La cuenta (jugador_id) la pone el servidor con la sesión; aquí no se manda. Los eventos solo llevan
   datos del juego (tipo de evento, estrellas, capítulo, producto...). Se borran en el servidor a los 90 días.

   API (ver server/INTEGRAR_ANALITICA.md):
     Analitica.evento(nombre, datos)  → anota un evento (true si quedó en la cola)
     Analitica.enviar()               → manda lo que haya (lo hace solo)
     Analitica.desactivar() / activar() / activo()   → opción "no enviar estadísticas" (localStorage envivo_analitica_no = '1')
     Analitica.instalacion()          → el número al azar de esta instalación
   Eventos estándar: app_abierta, tutorial_paso (lo toma solo de js/guia.js), evento_iniciado, evento_terminado,
   capitulo_completado, cuenta_creada, tienda_abierta, compra_iniciada, compra_aprobada, modo_online_abierto y
   sesion_fin (duración visible acumulada; lo manda solo). Los módulos pueden usar nombres "m_<algo>".
   Apagada: con la opción del jugador, fuera de http(s) (archivo, Claude) y en pruebas automáticas
   (navigator.webdriver) salvo que la prueba ponga window.__ENVIVO_ANALITICA = true.
   ========================================================= */
(function (root) {
  'use strict';
  const RUTA = '/api/eventos';
  const K_INST = 'envivo_instalacion';
  const K_COLA = 'envivo_analitica_cola';
  const K_NO = 'envivo_analitica_no';
  const K_UNA = 'envivo_analitica_una';      // eventos que se mandan una sola vez por instalación
  const K_COMPRA = 'envivo_analitica_compra'; // último producto que se empezó a comprar (para compra_aprobada al volver del pago)
  const MAX_COLA = 200, LOTE = 50, CADA_MS = 30000, UMBRAL = 20, NUEVA_SESION_MS = 30 * 60000;
  const NOMBRES = ['app_abierta', 'tutorial_paso', 'evento_iniciado', 'evento_terminado', 'capitulo_completado', 'cuenta_creada',
    'tienda_abierta', 'compra_iniciada', 'compra_aprobada', 'modo_online_abierto', 'sesion_fin'];
  const PASOS_GUIA = ['intro', 'clientes', 'evento', 'auto', 'aire', 'elegir', 'terminar', 'resultado', 'fin'];

  /* ---------- almacenamiento (nunca rompe: modo privado o sin espacio) ---------- */
  const ls = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, v); } catch (e) { /* nada */ } },
    json(k, def) { try { const v = JSON.parse(ls.get(k)); return v == null ? def : v; } catch (e) { return def; } },
  };
  function azar(n) {
    const b = new Uint8Array(n / 2);
    try { root.crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- ¿se puede medir? ---------- */
  function permitido() {
    try {
      if (ls.get(K_NO) === '1') return false;
      if (root.__ENVIVO_ANALITICA === false) return false;
      const p = root.location && root.location.protocol;
      if (p !== 'http:' && p !== 'https:') return false;
      if (root.navigator && root.navigator.webdriver && root.__ENVIVO_ANALITICA !== true) return false;
      return true;
    } catch (e) { return false; }
  }

  let inst = /^[a-f0-9]{32}$/.test(ls.get(K_INST) || '') ? ls.get(K_INST) : null;
  const nuevaInstalacion = !inst;
  let cola = [];
  let ses = azar(16);
  let visibleDesde = Date.now(), acumulado = 0, ocultoDesde = 0;
  // Mandados por sendBeacon en esta página: no se sabe si llegaron, así que se quedan guardados y se vuelven a mandar al
  // abrir el juego otra vez (el servidor ignora los repetidos por su clave). Mientras tanto, fetch no los repite.
  const porBeacon = new Set();
  let enviando = false, fallos = 0, esperaHasta = 0, sinServidor = false, timer = null;
  let version = '';

  function instalacion() {
    if (!inst) { inst = azar(32); ls.set(K_INST, inst); }
    return inst;
  }
  const guardarCola = () => ls.set(K_COLA, cola.length ? JSON.stringify(cola) : null);
  function origen() {
    try { if (root.GooglePlay && root.GooglePlay.enApp && root.GooglePlay.enApp()) return 'android'; } catch (e) { /* abajo */ }
    try { if (/[?&]origen=android\b/.test(root.location.search) || /^android-app:\/\//.test(root.document.referrer || '')) return 'android'; } catch (e) { /* web */ }
    return 'web';
  }
  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || (root.navigator && root.navigator.language) || ''; } catch (e) { return ''; } };
  // Versión del juego: el nombre del caché del service worker (sw.js: VERSION = 'envivo-vNN' → caché 'envivo-vNN-shell')
  try {
    if (root.caches && root.caches.keys) {
      root.caches.keys().then((ks) => { const m = ks.map((k) => /^envivo-v(\d+)-shell$/.exec(k)).filter(Boolean).sort((a, b) => b[1] - a[1])[0]; if (m) version = 'v' + m[1]; }).catch(() => {});
    }
  } catch (e) { /* sin caché */ }

  /* ---------- datos de un evento: solo campos simples ---------- */
  function limpiar(d) {
    if (!d || typeof d !== 'object') return undefined;
    const o = {}; let n = 0;
    Object.keys(d).forEach((k) => {
      if (n >= 12 || !/^[a-z0-9_]{1,24}$/.test(k)) return;
      const v = d[k];
      if (typeof v === 'string') { o[k] = v.slice(0, 80); n++; }
      else if (typeof v === 'number' && isFinite(v)) { o[k] = v; n++; }
      else if (typeof v === 'boolean') { o[k] = v; n++; }
    });
    return n ? o : undefined;
  }
  // Una sola vez por instalación: la cuenta creada, cada capítulo y cada paso de la guía
  function claveUnaVez(nombre, d) {
    if (nombre === 'cuenta_creada') return nombre;
    if (nombre === 'capitulo_completado' && d && d.capitulo != null) return nombre + ':' + d.capitulo;
    if (nombre === 'tutorial_paso' && d && d.paso) return nombre + ':' + d.paso;
    return null;
  }

  function evento(nombre, datos) {
    try {
      if (!permitido()) return false;
      if (typeof nombre !== 'string' || !(NOMBRES.includes(nombre) || /^m_[a-z0-9_]{2,30}$/.test(nombre))) return false;
      let d = limpiar(datos);
      if (nombre === 'compra_iniciada' && d && d.producto) ls.set(K_COMPRA, d.producto);
      if (nombre === 'compra_aprobada') {
        d = d || {};
        if (!d.producto && ls.get(K_COMPRA)) d.producto = String(ls.get(K_COMPRA)).slice(0, 80);
        ls.set(K_COMPRA, null);
      }
      const una = claveUnaVez(nombre, d);
      if (una) {
        const hechas = ls.json(K_UNA, []);
        if (Array.isArray(hechas) && hechas.includes(una)) return false;
        ls.set(K_UNA, JSON.stringify((Array.isArray(hechas) ? hechas : []).concat(una).slice(-300)));
      }
      instalacion();
      const ev = { n: nombre, t: Date.now(), k: azar(12) };
      if (d) ev.d = d;
      cola.push(ev);
      if (cola.length > MAX_COLA) cola = cola.slice(-MAX_COLA);   // sin internet mucho tiempo: quedan los más nuevos
      guardarCola();
      if (cola.length >= UMBRAL) enviar();
      return true;
    } catch (e) { return false; }
  }

  function sobre(lote) {
    return { i: instalacion(), s: ses, p: origen(), v: version, l: idioma(), e: lote };
  }
  function quitar(lote) {
    const ks = new Set(lote.map((x) => x.k));
    cola = cola.filter((x) => !ks.has(x.k));
    ks.forEach((k) => porBeacon.delete(k));
    guardarCola();
  }

  /* Manda un lote. Con beacon=true (al esconder o cerrar) usa navigator.sendBeacon (texto plano: no pide permiso CORS). */
  function enviar(beacon) {
    if (!permitido() || !cola.length || sinServidor) return Promise.resolve(false);
    const lote = cola.filter((x) => !porBeacon.has(x.k)).slice(0, LOTE);
    if (!lote.length) return Promise.resolve(false);
    const cuerpo = JSON.stringify(sobre(lote));
    if (beacon) {
      try {
        if (root.navigator && root.navigator.sendBeacon && root.navigator.sendBeacon(RUTA, new Blob([cuerpo], { type: 'text/plain;charset=UTF-8' }))) {
          lote.forEach((x) => porBeacon.add(x.k));
          enviar(true);
          return Promise.resolve(true);
        }
      } catch (e) { /* abajo con fetch */ }
    }
    if (enviando || (!beacon && Date.now() < esperaHasta) || typeof root.fetch !== 'function') return Promise.resolve(false);
    enviando = true;
    return root.fetch(RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, credentials: 'same-origin', cache: 'no-store', keepalive: cuerpo.length < 60000, body: cuerpo })
      .then((r) => r.json().catch(() => null).then((j) => {
        enviando = false;
        if (r.ok && j && j.ok) {
          fallos = 0;
          if (j.apagada) { cola = []; guardarCola(); return true; }   // el servidor no quiere eventos: se vacía la cola
          quitar(lote);
          if (cola.length >= UMBRAL) enviar();
          return true;
        }
        if (r.status === 400 || r.status === 413) { quitar(lote); return false; }      // lote malo: no se reintenta
        if (r.status === 404 || r.status === 405) { sinServidor = true; return false; } // sitio sin servidor del juego
        fallos++; esperaHasta = Date.now() + Math.min(300000, 15000 * Math.pow(2, fallos - 1));
        return false;
      }))
      .catch(() => { enviando = false; fallos++; esperaHasta = Date.now() + Math.min(300000, 15000 * Math.pow(2, fallos - 1)); return false; });
  }

  /* ---------- sesión: app_abierta al abrir (o al volver después de 30 min) y sesion_fin al esconder ---------- */
  function abrirSesion(reanudada) {
    ses = azar(16); acumulado = 0; visibleDesde = Date.now();
    const d = { origen: origen(), idioma: idioma() };
    if (version) d.version = version;
    if (reanudada) d.reanudada = true; else if (nuevaInstalacion) d.primera = true;
    evento('app_abierta', d);
  }
  function alEsconder() {
    if (ocultoDesde) return;
    ocultoDesde = Date.now();
    acumulado += Math.max(0, ocultoDesde - visibleDesde);
    if (acumulado >= 1000) evento('sesion_fin', { duracion_s: Math.round(acumulado / 1000) });
    enviar(true);
  }
  function alMostrar() {
    if (!ocultoDesde) return;
    const fuera = Date.now() - ocultoDesde;
    ocultoDesde = 0;
    if (fuera > NUEVA_SESION_MS) abrirSesion(true); else visibleDesde = Date.now();
  }

  /* ---------- guía del primer evento (js/guia.js): un tutorial_paso por paso nuevo ---------- */
  function vigilarGuia() {
    let ultimo = null, vista = false, intentos = 0, fin = false;
    const iv = setInterval(() => {
      try {
        const G = root.Guia;
        intentos++;
        if (!G || !G.estado) { if (intentos > 30) clearInterval(iv); return; }
        const e = G.estado();
        if (!e || !e.activa) {
          if (vista && !fin) evento('tutorial_paso', { paso: 'saltada', despues_de: ultimo || '' });
          if (vista || intentos > 30) clearInterval(iv);
          return;
        }
        vista = true;
        if (e.paso && e.paso !== ultimo && PASOS_GUIA.includes(e.paso)) {
          ultimo = e.paso;
          // La guía es una sola fila de pasos: llegar a uno es haber pasado los anteriores (si un paso duró menos que la
          // revisión, se anota igual, marcado "inferido"; los ya mandados no se repiten)
          const i = PASOS_GUIA.indexOf(e.paso);
          for (let j = 0; j < i; j++) evento('tutorial_paso', { paso: PASOS_GUIA[j], n: j + 1, inferido: true });
          evento('tutorial_paso', { paso: e.paso, n: i + 1 });
          if (e.paso === 'fin') { fin = true; clearInterval(iv); }
        }
        if (intentos > 3000) clearInterval(iv);   // ~35 minutos
      } catch (err) { clearInterval(iv); }
    }, 400);
  }

  function iniciar() {
    if (!permitido()) return;
    cola = ls.json(K_COLA, []);
    if (!Array.isArray(cola)) cola = [];
    // Eventos que js/ui.js anotó antes de que este archivo cargara (script con defer)
    const pend = Array.isArray(root.__anCola) ? root.__anCola.splice(0) : [];
    abrirSesion(false);
    pend.forEach((x) => { try { evento(x[0], x[1]); } catch (e) { /* nada */ } });
    vigilarGuia();
    timer = setInterval(() => enviar(), CADA_MS);
    setTimeout(() => enviar(), 4000);   // el primer lote poco después de abrir
    try {
      root.document.addEventListener('visibilitychange', () => { if (root.document.visibilityState === 'hidden') alEsconder(); else alMostrar(); });
      root.addEventListener('pagehide', alEsconder);
      root.addEventListener('pageshow', alMostrar);
    } catch (e) { /* sin documento */ }
  }

  function desactivar() {
    ls.set(K_NO, '1'); cola = []; guardarCola();
    if (timer) { clearInterval(timer); timer = null; }
  }
  function activar() {
    ls.set(K_NO, null);
    if (!timer && permitido()) iniciar();
  }
  try { if (/[?&]analitica=no\b/.test(root.location.search)) ls.set(K_NO, '1'); } catch (e) { /* nada */ }

  root.Analitica = {
    evento, enviar: () => enviar(false), desactivar, activar, activo: permitido, instalacion: () => (permitido() ? instalacion() : null),
    // Para las pruebas: copia de la cola y de la sesión
    _cola: () => cola.map((x) => Object.assign({}, x)), _sesion: () => ses, _esconder: alEsconder, _mostrar: alMostrar,
    NOMBRES, PASOS_GUIA,
  };
  iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
