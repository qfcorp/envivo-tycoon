/* =========================================================
   EN VIVO Tycoon — Compras con Google Play dentro de la app de Android (TWA)
   Guía completa: docs/ANDROID_GOOGLE_PLAY.md

   Dentro de la app de Google Play (Trusted Web Activity hecha con Bubblewrap y "playBilling"),
   Chrome ofrece la Digital Goods API y el método de pago "https://play.google.com/billing".
   Fuera de la app (navegador normal, archivo, Claude) TODO esto queda apagado y no hace nada.

   API:  window.GooglePlay = {
     enApp()              -> true si el juego se abrió desde la app de Android (aunque Play Billing falle).
                             Con true, la Tienda NO debe mostrar Plux ni enlaces a la tienda web (política de Google).
     disponible()         -> Promise<boolean>: hay Play Billing (servicio 'https://play.google.com/billing').
     productos(ids)       -> Promise<[{ id, titulo, descripcion, precio, moneda, valor }]> con el precio de Google Play
                             ya formateado ("US$ 4,99"). Fuera de la app: [].
     comprar(productoId)  -> Promise<{ ok, estado, mensaje, codigo?, respuesta?, reintentar? }>
                             estado: 'entregado' | 'ya_entregado' | 'pendiente' | 'cancelado' | 'error'
                                     | 'no_disponible' | 'sesion_requerida' | 'ocupado'
                             LLAMARLO DIRECTO EN EL CLIC (sin "await" antes): Chrome exige un toque reciente del usuario.
     restaurar()          -> Promise<{ revisadas, entregadas:[ids], pendientes:[ids], errores:[{id, mensaje}], omitido? }>
                             Revisa compras de Google que el servidor todavía no confirmó (se cerró la app, se cayó el
                             internet...). Llamarlo al abrir el juego y al entrar a la cuenta.
     configurar(opciones) -> { verificarUrl, unaVez:[ids], consumirEnCliente, tiempoServidorMs }
   }

   Flujo de compra: PaymentRequest (Play) -> purchaseToken -> POST /api/google/verificar {producto, purchaseToken, orderId}
   -> el servidor verifica con Google, entrega y hace consume/acknowledge -> (opcional) consume también aquí para los
   productos que se pueden volver a comprar. Nunca se entrega nada en el celular sin la respuesta del servidor.
   ========================================================= */
(function (root) {
  'use strict';

  var METODO = 'https://play.google.com/billing';
  var CLAVE_HECHOS = 'envivo_gp_hechos';     // comprobantes que el servidor ya confirmó (para no repetir)
  var CLAVE_ORIGEN = 'envivo_origen';        // 'android' si se abrió desde la app (solo esta pestaña)

  var opciones = {
    verificarUrl: '/api/google/verificar',
    // Productos de una sola vez: NO se consumen (si se consumen, Google deja comprarlos otra vez).
    // Se completa con los "una_vez" que manda el servidor en Api.estado.tienda.productos.
    unaVez: ['inicio', 'bienvenida'],
    // El servidor ya hace consume/acknowledge. Consumir también aquí (después de que el servidor confirmó)
    // es un respaldo por si el aviso del servidor a Google falló. Si falla aquí, no pasa nada.
    consumirEnCliente: true,
    tiempoServidorMs: 20000,
  };

  var servicioPromesa = null;   // Promise<DigitalGoodsService|null>
  var comprando = false;
  var restaurando = null;

  /* ---------- utilidades ---------- */
  function guardado(tipo) {
    try { return tipo === 'sesion' ? root.sessionStorage : root.localStorage; } catch (e) { return null; }
  }
  function leerHechos() {
    var s = guardado('local');
    try { var v = s && JSON.parse(s.getItem(CLAVE_HECHOS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function marcarHecho(token) {
    var s = guardado('local');
    if (!s || !token) return;
    try {
      var h = leerHechos().filter(function (t) { return t !== token; });
      h.push(token);
      s.setItem(CLAVE_HECHOS, JSON.stringify(h.slice(-60)));
    } catch (e) { /* sin espacio o modo privado */ }
  }
  function yaHecho(token) { return leerHechos().indexOf(token) !== -1; }

  function esUnaVez(id) {
    if (opciones.unaVez.indexOf(id) !== -1) return true;
    try {
      var prods = root.Api && root.Api.estado && root.Api.estado.tienda && root.Api.estado.tienda.productos;
      if (prods) for (var i = 0; i < prods.length; i++) if (prods[i].id === id) return !!prods[i].una_vez;
    } catch (e) { /* nada */ }
    return false;
  }

  function sinSesion() {
    try { return !!(root.Api && typeof root.Api.logueado === 'function' && !root.Api.logueado()); } catch (e) { return false; }
  }

  function conTiempo(promesa, ms, valor) {
    return new Promise(function (ok) {
      var t = setTimeout(function () { ok(valor); }, ms);
      promesa.then(function (v) { clearTimeout(t); ok(v); }, function () { clearTimeout(t); ok(valor); });
    });
  }

  function formatoPrecio(precio) {
    if (!precio) return '';
    var valor = Number(precio.value);
    try {
      var idioma = (root.navigator && root.navigator.language) || 'es-EC';
      return new Intl.NumberFormat(idioma, { style: 'currency', currency: precio.currency }).format(valor);
    } catch (e) {
      return (precio.currency || '') + ' ' + (isFinite(valor) ? valor.toFixed(2) : String(precio.value));
    }
  }

  /* ---------- ¿estamos dentro de la app de Android? ---------- */
  function enApp() {
    try {
      var ses = guardado('sesion');
      if (ses && ses.getItem(CLAVE_ORIGEN) === 'android') return true;
      var porRef = /^android-app:\/\//.test(root.document && root.document.referrer || '');
      var porUrl = /[?&]origen=android\b/.test(root.location && root.location.search || '');
      if (porRef || porUrl) { try { if (ses) ses.setItem(CLAVE_ORIGEN, 'android'); } catch (e) { /* nada */ } return true; }
    } catch (e) { /* nada */ }
    return false;
  }

  /* ---------- Play Billing ---------- */
  function servicio() {
    if (servicioPromesa) return servicioPromesa;
    servicioPromesa = (async function () {
      try {
        if (typeof root.getDigitalGoodsService !== 'function' || typeof root.PaymentRequest !== 'function') return null;
        var s = await conTiempo(Promise.resolve(root.getDigitalGoodsService(METODO)), 6000, null);
        return s && typeof s.getDetails === 'function' ? s : null;
      } catch (e) {
        return null;   // Chrome sin TWA, otro navegador o Play no disponible
      }
    })();
    return servicioPromesa;
  }

  async function disponible() { return !!(await servicio()); }

  async function productos(ids) {
    var s = await servicio();
    if (!s || !ids || !ids.length) return [];
    try {
      var det = await s.getDetails(ids.slice());
      return (det || []).map(function (d) {
        return {
          id: d.itemId,
          titulo: String(d.title || '').replace(/\s*\([^)]*\)\s*$/, ''),  // Google agrega "(nombre de la app)" al título
          descripcion: d.description || '',
          precio: formatoPrecio(d.price),
          moneda: d.price ? d.price.currency : '',
          valor: d.price ? Number(d.price.value) : 0,
        };
      });
    } catch (e) {
      return [];
    }
  }

  /* POST /api/google/verificar. Devuelve { ok, j, status }. Nunca lanza error. */
  async function verificar(producto, token, orderId) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, opciones.tiempoServidorMs) : null;
    try {
      var r = await root.fetch(opciones.verificarUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ producto: producto, purchaseToken: token, orderId: orderId || '' }),
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

  /* Traduce la respuesta del servidor a un resultado para la Tienda. */
  function resultadoServidor(v) {
    var j = v.j || {};
    if (v.ok) return { ok: true, estado: j.nueva === false ? 'ya_entregado' : 'entregado', mensaje: j.nueva === false ? 'Esta compra ya estaba en tu cuenta.' : '¡Compra lista! Ya está en tu cuenta.', respuesta: j };
    var codigo = j.codigo || '';
    if (codigo === 'google_pendiente') return { ok: false, estado: 'pendiente', codigo: codigo, mensaje: j.error || 'Tu pago está pendiente en Google Play. Te lo entregaremos cuando se apruebe.' };
    if (codigo === 'sesion_requerida' || v.status === 401) return { ok: false, estado: 'sesion_requerida', codigo: 'sesion_requerida', mensaje: 'Entra a tu cuenta para recibir tu compra.', reintentar: true };
    // Fallas pasajeras: la compra sigue en Google sin confirmar y restaurar() la vuelve a intentar (hay 3 días).
    var pasajera = v.status === 0 || v.status === 429 || v.status >= 500 || codigo === 'sin_conexion';
    return { ok: false, estado: 'error', codigo: codigo || 'error', mensaje: j.error || 'No se pudo confirmar la compra. Intenta otra vez.', reintentar: pasajera };
  }

  async function consumirSiToca(s, producto, token) {
    if (!opciones.consumirEnCliente || esUnaVez(producto) || typeof s.consume !== 'function') return false;
    try { await s.consume(token); return true; } catch (e) { return false; }  // el servidor ya lo consumió: normal
  }

  /* Compra. Llamar directamente desde el clic del botón. */
  function comprar(productoId) {
    if (comprando) return Promise.resolve({ ok: false, estado: 'ocupado', mensaje: 'Ya hay una compra en curso.' });
    // Sin "await" antes de request.show(): se revisa lo que se pueda de forma síncrona.
    if (typeof root.PaymentRequest !== 'function' || typeof root.getDigitalGoodsService !== 'function') {
      return Promise.resolve({ ok: false, estado: 'no_disponible', mensaje: 'Las compras de Google Play no están disponibles aquí.' });
    }
    if (sinSesion()) return Promise.resolve({ ok: false, estado: 'sesion_requerida', mensaje: 'Crea tu cuenta o entra para comprar: así tu compra queda guardada.' });
    if (!productoId || typeof productoId !== 'string') return Promise.resolve({ ok: false, estado: 'error', mensaje: 'Producto no válido.' });

    var request;
    try {
      request = new root.PaymentRequest(
        [{ supportedMethods: METODO, data: { sku: productoId } }],
        // Google Play ignora este total (cobra el precio de Play Console), pero la API lo exige.
        { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } }
      );
    } catch (e) {
      return Promise.resolve({ ok: false, estado: 'no_disponible', mensaje: 'Las compras de Google Play no están disponibles aquí.' });
    }
    comprando = true;
    var mostrar;
    try { mostrar = Promise.resolve(request.show()); }   // se llama YA, dentro del gesto del usuario
    catch (e) { mostrar = Promise.reject(e); }
    mostrar.catch(function () { /* se atiende abajo */ });

    return (async function () {
      try {
        var s = await servicio();
        var resp;
        try {
          resp = await mostrar;
        } catch (e) {
          if (e && e.name === 'AbortError') return { ok: false, estado: 'cancelado', mensaje: 'Compra cancelada.' };
          if (e && e.name === 'NotSupportedError') return { ok: false, estado: 'no_disponible', mensaje: 'Las compras de Google Play no están disponibles aquí.' };
          return { ok: false, estado: 'error', mensaje: 'Google Play no pudo completar la compra.', codigo: e && e.name };
        }
        var det = (resp && resp.details) || {};
        var token = det.purchaseToken || det.token || '';
        if (!token) {
          try { await resp.complete('fail'); } catch (e) { /* nada */ }
          return { ok: false, estado: 'error', mensaje: 'Google Play no devolvió el comprobante de la compra.' };
        }
        var r = resultadoServidor(await verificar(productoId, token, det.orderId || ''));
        try { await resp.complete(r.ok ? 'success' : r.estado === 'pendiente' || r.reintentar ? 'unknown' : 'fail'); } catch (e) { /* nada */ }
        if (r.ok) {
          marcarHecho(token);
          if (s) r.consumido = await consumirSiToca(s, productoId, token);
        }
        return r;
      } finally {
        comprando = false;
      }
    })();
  }

  /* Revisa compras de Google sin confirmar y las manda al servidor. */
  function restaurar() {
    if (restaurando) return restaurando;
    restaurando = (async function () {
      var out = { revisadas: 0, entregadas: [], pendientes: [], errores: [] };
      var s = await servicio();
      if (!s || typeof s.listPurchases !== 'function') { out.omitido = 'no_disponible'; return out; }
      if (sinSesion()) { out.omitido = 'sesion_requerida'; return out; }
      var lista;
      try { lista = await s.listPurchases(); } catch (e) { out.omitido = 'error'; return out; }
      for (var i = 0; i < (lista || []).length; i++) {
        var p = lista[i] || {};
        var token = p.purchaseToken;
        if (!token || !p.itemId) continue;
        if (yaHecho(token)) continue;                 // ya confirmada antes en este celular
        if (p.purchaseState === 2) { out.pendientes.push(p.itemId); continue; }   // Chrome antiguo: pago pendiente
        out.revisadas++;
        var r = resultadoServidor(await verificar(p.itemId, token, p.orderId || ''));
        if (r.ok) {
          marcarHecho(token);
          if (r.estado === 'entregado') out.entregadas.push(p.itemId);
          await consumirSiToca(s, p.itemId, token);
        } else if (r.estado === 'pendiente') {
          out.pendientes.push(p.itemId);
        } else {
          out.errores.push({ id: p.itemId, mensaje: r.mensaje, codigo: r.codigo });
          if (r.estado === 'sesion_requerida') break;
        }
      }
      return out;
    })();
    restaurando.then(function () { restaurando = null; }, function () { restaurando = null; });
    return restaurando;
  }

  function configurar(o) {
    if (o && typeof o === 'object') {
      Object.keys(o).forEach(function (k) { if (k in opciones) opciones[k] = o[k]; });
    }
    return Object.assign({}, opciones);
  }

  root.GooglePlay = {
    METODO: METODO,
    enApp: enApp,
    disponible: disponible,
    productos: productos,
    comprar: comprar,
    restaurar: restaurar,
    configurar: configurar,
    _reiniciar: function () { servicioPromesa = null; comprando = false; restaurando = null; },  // solo pruebas
  };
  enApp();   // guarda el origen apenas carga (el referrer de la app solo llega en la primera página)
})(typeof window !== 'undefined' ? window : globalThis);
