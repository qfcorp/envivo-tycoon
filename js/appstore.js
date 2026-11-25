/* =========================================================
   EN VIVO Tycoon — Compras con el App Store dentro de la app de iPhone (StoreKit 2)
   Guía completa: docs/IPHONE_APP_STORE.md

   La app de iPhone (WKWebView, User-Agent con «TukanIOS») trae un puente nativo:
     window.webkit.messageHandlers.tukanAppStore.postMessage(obj) → Promise (WKScriptMessageHandlerWithReply)
       {accion:'productos', ids:['envivo.creditos_250', ...]} → {ok, productos:[{id, titulo, descripcion, precio, moneda, valor}]}
       {accion:'comprar', id:'envivo.creditos_250', cuenta:'<uuid>'} → {ok:true, estado:'comprado', jws, transaccion, producto}
                                                                      | {ok:false, estado:'cancelado'|'pendiente'|'error', mensaje}
       {accion:'terminar', transaccion}  → {ok:true}   (SOLO después de que el servidor confirmó la entrega)
       {accion:'pendientes'}             → {ok:true, transacciones:[{jws, transaccion, producto}]}  (pagadas sin terminar)
       {accion:'restaurar'}              → {ok:true, transacciones:[{jws, transaccion, producto}]}  (lo de «una sola vez»)
     y el evento window 'tukanAppStore' {detail:{tipo:'transaccion', jws, transaccion, producto}} (compra aprobada más tarde,
     por ejemplo «Pedir permiso para comprar»).
   Sin ese puente (app de iPhone vieja, web, Android) TODO esto queda apagado: enApp() = false y no se vende nada.

   API (la MISMA forma que window.GooglePlay de js/googleplay.js, para que js/ui.js use una u otra):
     window.AppStore = {
       enApp()              -> true dentro de la app de iPhone CON el puente del App Store.
       disponible()         -> Promise<boolean>: hay puente.
       productos(ids)       -> Promise<[{ id, titulo, descripcion, precio, moneda, valor }]> con los ids del catálogo
                               (sin «envivo.») y el precio del App Store ya formateado ("US$1.99"). Sin puente: [].
       comprar(productoId)  -> Promise<{ ok, estado, mensaje, codigo?, respuesta?, reintentar? }>
                               estado: 'entregado' | 'ya_entregado' | 'pendiente' | 'cancelado' | 'error'
                                       | 'no_disponible' | 'sesion_requerida' | 'ocupado'
       restaurar()          -> Promise<{ revisadas, entregadas:[ids], pendientes:[ids], errores:[{id, mensaje}], omitido? }>
                               Compras pagadas que el servidor todavía no confirmó (puente 'pendientes'). Al abrir el juego
                               y al entrar a la cuenta.
       restaurarCompras()   -> igual, pero con lo de «una sola vez» del Apple ID (puente 'restaurar'): botón «Restaurar compras».
       escuchar(fn)         -> fn({ entregadas:[ids] }) cuando llega sola una compra aprobada más tarde (evento 'tukanAppStore').
       configurar(opciones) -> { verificarUrl, tiempoServidorMs, tiempoPuenteMs }
     }
   Flujo de compra: puente 'comprar' → POST /api/apple/verificar {producto, jws} → si el servidor entregó (o la compra ya no
   sirve: de otra cuenta, devuelta...) puente 'terminar'. Si el servidor no respondió, NO se termina: Apple la vuelve a dar
   en 'pendientes' y se entrega después. Nunca se entrega nada en el celular sin la respuesta del servidor.
   ========================================================= */
(function (root) {
  'use strict';

  var PREFIJO = 'envivo.';
  var CLAVE_HECHOS = 'envivo_as_hechos';   // transacciones que el servidor ya confirmó (por si 'terminar' falló)
  // Respuestas del servidor que no cambian si se reintenta: la transacción se termina igual (si no, se repetiría siempre)
  var DEFINITIVOS = ['apple_otra_cuenta', 'apple_no_coincide', 'apple_revocada', 'apple_revertido', 'apple_rechazado', 'apple_ya_comprado', 'datos_invalidos'];

  var opciones = {
    verificarUrl: '/api/apple/verificar',
    tiempoServidorMs: 20000,
    tiempoPuenteMs: 15000,   // productos, pendientes, restaurar y terminar (comprar no tiene tiempo: el usuario decide)
  };
  var comprando = false;
  var revisando = null;
  var oyentes = [];

  /* ---------- utilidades ---------- */
  function guardado() { try { return root.localStorage; } catch (e) { return null; } }
  function leerHechos() {
    var s = guardado();
    try { var v = s && JSON.parse(s.getItem(CLAVE_HECHOS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function marcarHecho(t) {
    var s = guardado();
    if (!s || !t) return;
    try {
      var h = leerHechos().filter(function (x) { return x !== t; });
      h.push(String(t));
      s.setItem(CLAVE_HECHOS, JSON.stringify(h.slice(-80)));
    } catch (e) { /* sin espacio o modo privado */ }
  }
  function yaHecho(t) { return !!t && leerHechos().indexOf(String(t)) !== -1; }

  function aApple(id) { return PREFIJO + id; }
  function aCatalogo(id) { id = String(id || ''); return id.indexOf(PREFIJO) === 0 ? id.slice(PREFIJO.length) : id; }

  function sinSesion() {
    try { return !!(root.Api && typeof root.Api.logueado === 'function' && !root.Api.logueado()); } catch (e) { return false; }
  }
  function cuentaApple() {
    try { var c = root.Api && root.Api.estado && root.Api.estado.apple_cuenta; return typeof c === 'string' && c ? c : undefined; } catch (e) { return undefined; }
  }

  function manejador() {
    try { var h = root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.tukanAppStore; return h && typeof h.postMessage === 'function' ? h : null; } catch (e) { return null; }
  }
  function iphone() { try { return !!(root.TukanIOS && root.TukanIOS.activo && root.TukanIOS.activo()); } catch (e) { return false; } }

  /* Mensaje al puente. Devuelve la respuesta (objeto) o null si falló o tardó más de ms (0 = sin tiempo). Nunca lanza error. */
  function puente(msg, ms) {
    var h = manejador();
    if (!h) return Promise.resolve(null);
    return new Promise(function (ok) {
      var t = ms ? setTimeout(function () { ok(null); }, ms) : null;
      var p;
      try { p = Promise.resolve(h.postMessage(msg)); } catch (e) { p = Promise.resolve(null); }
      p.then(function (r) {
        if (t) clearTimeout(t);
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
        ok(r && typeof r === 'object' ? r : null);
      }, function () { if (t) clearTimeout(t); ok(null); });
    });
  }

  /* ---------- ¿estamos en la app de iPhone con el App Store? ---------- */
  function enApp() { return iphone() && !!manejador(); }
  function disponible() { return Promise.resolve(enApp()); }

  async function productos(ids) {
    if (!enApp() || !ids || !ids.length) return [];
    var r = await puente({ accion: 'productos', ids: ids.map(aApple) }, opciones.tiempoPuenteMs);
    if (!r || r.ok === false || !Array.isArray(r.productos)) return [];
    return r.productos.filter(function (p) { return p && p.id && p.precio; }).map(function (p) {
      return {
        id: aCatalogo(p.id),
        titulo: String(p.titulo || ''),
        descripcion: String(p.descripcion || ''),
        precio: String(p.precio),
        moneda: String(p.moneda || ''),
        valor: Number(p.valor) || 0,
      };
    });
  }

  /* POST /api/apple/verificar. Devuelve { ok, j, status }. Nunca lanza error. */
  async function verificar(producto, jws) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, opciones.tiempoServidorMs) : null;
    try {
      var r = await root.fetch(opciones.verificarUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'X-EnVivo-Canal': 'ios' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ producto: producto || '', jws: jws }),
        signal: ctrl ? ctrl.signal : undefined,
      });
      var j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      if (!j || typeof j !== 'object') return { ok: false, status: r.status, j: { error: 'El servidor no respondió bien.', codigo: 'error_servidor' } };
      return { ok: r.ok && j.ok !== false, status: r.status, j: j };
    } catch (e) {
      return { ok: false, status: 0, j: { error: 'Sin conexión con el servidor. Tu compra está guardada: se entregará al volver el internet.', codigo: 'sin_conexion' } };
    } finally {
      if (t) clearTimeout(t);
    }
  }

  /* Traduce la respuesta del servidor a un resultado para la Tienda (igual que GooglePlay). */
  function resultadoServidor(v) {
    var j = v.j || {};
    if (v.ok) return { ok: true, estado: j.nueva === false ? 'ya_entregado' : 'entregado', mensaje: j.nueva === false ? 'Esta compra ya estaba en tu cuenta.' : '¡Compra lista! Ya está en tu cuenta.', respuesta: j };
    var codigo = j.codigo || '';
    if (codigo === 'sesion_requerida' || v.status === 401) return { ok: false, estado: 'sesion_requerida', codigo: 'sesion_requerida', mensaje: 'Entra a tu cuenta para recibir tu compra.', reintentar: true };
    var definitivo = DEFINITIVOS.indexOf(codigo) !== -1;
    return { ok: false, estado: 'error', codigo: codigo || 'error', mensaje: j.error || 'No se pudo confirmar la compra. Intenta otra vez.', reintentar: !definitivo, definitivo: definitivo };
  }

  function terminar(transaccion) {
    if (!transaccion) return Promise.resolve(false);
    return puente({ accion: 'terminar', transaccion: String(transaccion) }, opciones.tiempoPuenteMs).then(function (r) { return !!(r && r.ok !== false); });
  }

  /* Entrega una transacción ya pagada: servidor → (si toca) terminar. Devuelve el resultado como comprar(). */
  async function entregar(t, terminarla) {
    var producto = aCatalogo(t.producto);
    if (terminarla && yaHecho(t.transaccion)) { await terminar(t.transaccion); return { ok: true, estado: 'ya_entregado', mensaje: 'Esta compra ya estaba en tu cuenta.', repetida: true }; }
    var r = resultadoServidor(await verificar(producto, t.jws));
    if (r.ok) marcarHecho(t.transaccion);
    if (terminarla && (r.ok || r.definitivo)) r.terminada = await terminar(t.transaccion);
    return r;
  }

  /* Compra. Se puede llamar directo desde el clic (el puente no necesita un toque reciente, pero así se parece a Google Play). */
  function comprar(productoId) {
    if (comprando) return Promise.resolve({ ok: false, estado: 'ocupado', mensaje: 'Ya hay una compra en curso.' });
    if (!enApp()) return Promise.resolve({ ok: false, estado: 'no_disponible', mensaje: 'Las compras del App Store no están disponibles aquí.' });
    if (sinSesion()) return Promise.resolve({ ok: false, estado: 'sesion_requerida', mensaje: 'Crea tu cuenta o entra para comprar: así tu compra queda guardada.' });
    if (!productoId || typeof productoId !== 'string') return Promise.resolve({ ok: false, estado: 'error', mensaje: 'Producto no válido.' });
    comprando = true;
    return (async function () {
      try {
        var msg = { accion: 'comprar', id: aApple(productoId) };
        var c = cuentaApple();
        if (c) msg.cuenta = c;
        var r = await puente(msg, 0);
        if (!r) return { ok: false, estado: 'error', mensaje: 'El App Store no respondió. Intenta otra vez.' };
        if (!r.ok || !r.jws) {
          if (r.estado === 'cancelado') return { ok: false, estado: 'cancelado', mensaje: 'Compra cancelada.' };
          if (r.estado === 'pendiente') return { ok: false, estado: 'pendiente', mensaje: 'Tu compra está pendiente en el App Store. Te la entregaremos cuando se apruebe.' };
          return { ok: false, estado: 'error', mensaje: r.mensaje || 'El App Store no pudo completar la compra.', codigo: r.codigo };
        }
        return await entregar({ jws: r.jws, transaccion: r.transaccion, producto: r.producto || aApple(productoId) }, true);
      } finally {
        comprando = false;
      }
    })();
  }

  /* Revisa una lista de transacciones del puente y las manda al servidor. */
  async function revisarLista(accion, terminarlas) {
    var out = { revisadas: 0, entregadas: [], pendientes: [], errores: [] };
    if (!enApp()) { out.omitido = 'no_disponible'; return out; }
    if (sinSesion()) { out.omitido = 'sesion_requerida'; return out; }
    var r = await puente({ accion: accion }, opciones.tiempoPuenteMs);
    if (!r || r.ok === false || !Array.isArray(r.transacciones)) { out.omitido = 'error'; return out; }
    for (var i = 0; i < r.transacciones.length; i++) {
      var t = r.transacciones[i] || {};
      if (!t.jws || !t.producto) continue;
      out.revisadas++;
      var x = await entregar(t, terminarlas);
      var id = aCatalogo(t.producto);
      if (x.ok) { if (x.estado === 'entregado') out.entregadas.push(id); }
      else {
        out.errores.push({ id: id, mensaje: x.mensaje, codigo: x.codigo });
        if (x.estado === 'sesion_requerida') break;
      }
    }
    return out;
  }

  /* Compras pagadas sin terminar (se cerró la app, se cayó el internet...). Al abrir el juego y al entrar a la cuenta. */
  function restaurar() {
    if (revisando) return revisando;
    revisando = revisarLista('pendientes', true);
    revisando.then(function () { revisando = null; }, function () { revisando = null; });
    return revisando;
  }

  /* Botón «Restaurar compras» (Apple lo exige para lo de una sola vez). El servidor no entrega dos veces. */
  function restaurarCompras() { return revisarLista('restaurar', false); }

  function escuchar(fn) { if (typeof fn === 'function' && oyentes.indexOf(fn) === -1) oyentes.push(fn); }

  /* Compra aprobada más tarde (p. ej. «Pedir permiso para comprar»): llega sola desde la app. */
  try {
    if (root.addEventListener) root.addEventListener('tukanAppStore', function (ev) {
      var d = ev && ev.detail;
      if (!d || d.tipo !== 'transaccion' || !d.jws || !enApp() || sinSesion()) return;
      entregar({ jws: d.jws, transaccion: d.transaccion, producto: d.producto }, true).then(function (r) {
        var info = { entregadas: r.ok && r.estado === 'entregado' ? [aCatalogo(d.producto)] : [], resultado: r };
        oyentes.forEach(function (fn) { try { fn(info); } catch (e) { /* nada */ } });
      });
    });
  } catch (e) { /* sin ventana (pruebas en node) */ }

  function configurar(o) {
    if (o && typeof o === 'object') {
      Object.keys(o).forEach(function (k) { if (k in opciones) opciones[k] = o[k]; });
    }
    return Object.assign({}, opciones);
  }

  root.AppStore = {
    PREFIJO: PREFIJO,
    enApp: enApp,
    disponible: disponible,
    productos: productos,
    comprar: comprar,
    restaurar: restaurar,
    restaurarCompras: restaurarCompras,
    escuchar: escuchar,
    configurar: configurar,
    _reiniciar: function () { comprando = false; revisando = null; oyentes = []; },   // solo pruebas
  };
})(typeof window !== 'undefined' ? window : globalThis);
