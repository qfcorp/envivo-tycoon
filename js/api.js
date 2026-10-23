/* =========================================================
   EN VIVO Tycoon — Conexión con el servidor (tienda, cuenta, partida en la nube)
   Contrato: server/API.md. Si el servidor no está (por ejemplo, el juego abierto como
   archivo o dentro de Claude), Api.disponible queda en false y el juego sigue funcionando
   sin tienda.
   ========================================================= */
(function (root) {
  'use strict';

  const Api = {
    disponible: null,   // null = todavía no se sabe; true / false
    estado: null,       // último /api/estado
  };

  // Textos de error del juego (en el idioma elegido, si js/i18n.js está cargado)
  const ES = {
    'err.servidor': 'El servidor no respondió bien. Intenta de nuevo.',
    'err.no_completo': 'No se pudo completar. Intenta de nuevo.',
    'err.lento': 'El servidor tardó demasiado. Revisa tu internet.',
  };
  const T = (k) => { try { if (root.I18N && root.I18N.T.has(k)) return root.I18N.T(k); } catch (e) { /* español */ } return ES[k] || k; };
  // Mensajes de error que manda el servidor: si trae `codigo` y hay texto para error.<codigo> (docs/traducciones/errores.json),
  // se usa ese, llenando sus {marcadores} con los datos de la respuesta; si no, el texto del servidor (en español).
  const TL = (t) => { try { return root.I18N ? root.I18N.TL(t) : t; } catch (e) { return t; } };
  function textoError(j) {
    try {
      if (j.codigo && root.I18N && root.I18N.T.has('error.' + j.codigo)) {
        const t = root.I18N.T('error.' + j.codigo, j);
        if (!/\{\w+\}/.test(t)) return t;   // faltan datos para algún marcador: mejor el texto del servidor
      }
      // falta_<campo> (falta_id, falta_periodo...): texto genérico "Falta {campo}" en el idioma del jugador
      if (j.codigo && /^falta_/.test(j.codigo) && root.I18N && root.I18N.T.has('error.falta_dato')) {
        const t = root.I18N.T('error.falta_dato', Object.assign({ campo: j.codigo.slice(6) }, j));
        if (!/\{\w+\}/.test(t)) return t;
      }
    } catch (e) { /* español */ }
    return j.error ? TL(j.error) : T('err.no_completo');
  }

  function puedeIntentar() {
    try {
      const p = root.location && root.location.protocol;
      return p === 'https:' || p === 'http:';
    } catch (e) { return false; }
  }

  async function req(method, ruta, body, ms) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), ms || 15000) : null;
    try {
      const r = await fetch(ruta, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': (root.I18N && root.I18N.idioma) || 'es' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
      });
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      if (!j || typeof j !== 'object') throw new Error(T('err.servidor'));
      if (!r.ok || j.ok === false) {
        const err = new Error(textoError(j));
        err.status = r.status;
        err.codigo = j.codigo || null;
        err.respuesta = j;   // la respuesta completa (ej. 409 de la partida trae "nube": versión y dispositivo)
        throw err;
      }
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error(T('err.lento'));
      throw e;
    } finally {
      if (t) clearTimeout(t);
    }
  }

  function guardarEstado(j) {
    if (j && j.tienda) { Api.estado = j; Api.disponible = true; }
    return j;
  }

  /* Revisa si hay servidor y trae el estado del jugador. Nunca lanza error. */
  Api.iniciar = async function () {
    if (!puedeIntentar()) { Api.disponible = false; return null; }
    try {
      const j = await req('GET', '/api/estado', undefined, 8000);
      if (!j.tienda) throw new Error('sin tienda');
      return guardarEstado(j);
    } catch (e) {
      Api.disponible = false;
      return null;
    }
  };

  Api.refrescar = async () => guardarEstado(await req('GET', '/api/estado'));
  Api.registro = async (email, nombre, clave, extra) => guardarEstado(await req('POST', '/api/registro', Object.assign({ email, nombre, clave }, extra || {})));   // extra: términos y edad (js/cuenta.js)
  Api.entrar = async (email, clave) => guardarEstado(await req('POST', '/api/entrar', { email, clave }));
  Api.salir = async () => { await req('POST', '/api/salir', {}); return Api.refrescar(); };
  // Partida en la nube con versión (server/src/Partidas.php): `base` = versión de la que partió esta partida y
  // `dispositivo` = código de esta pestaña. Si otro dispositivo guardó o tiene la partida abierta → error 409
  // (codigo partida_desactualizada / otro_dispositivo, con err.respuesta.nube). Sin `base` = juego viejo.
  Api.partida = () => req('GET', '/api/partida');
  Api.partidaMeta = (dispositivo) => req('GET', '/api/partida/meta?' + new URLSearchParams({ dispositivo: dispositivo || '' }).toString(), undefined, 10000);
  Api.activarPartida = (base, dispositivo) => req('POST', '/api/partida/activar', { base, dispositivo });
  Api.subirPartida = (datos, o) => req('POST', '/api/partida', o ? { datos, base: o.base, dispositivo: o.dispositivo, tomar: !!o.tomar } : { datos }, 20000);
  Api.gastar = (item) => req('POST', '/api/gastar', { item });
  Api.bonoVip = () => req('POST', '/api/vip/bono', {});
  // metodo: undefined = tarjeta (Pago Plux) · 'paypal' = PayPal (solo web, server/src/PayPal.php)
  Api.orden = (producto, metodo) => req('POST', '/api/orden', metodo === 'paypal' ? { producto, metodo } : { producto });

  // Mercado entre jugadores (server/MERCADO.md)
  Api.mercado = (item, orden) => req('GET', '/api/mercado?' + new URLSearchParams({ item: item || '', orden: orden || 'precio' }).toString());
  Api.publicar = (inventario_id, precio) => req('POST', '/api/mercado/publicar', { inventario_id, precio });
  Api.retirar = (publicacion_id) => req('POST', '/api/mercado/retirar', { publicacion_id });
  Api.comprarMercado = (publicacion_id) => req('POST', '/api/mercado/comprar', { publicacion_id });

  // Comunidad: perfil, asociaciones y chat (server/SOCIAL.md)
  Api.perfil = (alias, fama) => req('POST', '/api/perfil', { alias, fama });
  Api.asociaciones = (buscar) => req('GET', '/api/asociaciones?' + new URLSearchParams({ buscar: buscar || '' }).toString());
  Api.crearAsociacion = (datos) => req('POST', '/api/asociaciones/crear', datos);
  Api.unirse = (id) => req('POST', '/api/asociaciones/unirse', { id });
  Api.salirAsociacion = () => req('POST', '/api/asociaciones/salir', {});
  Api.chat = (canal, desde) => req('GET', '/api/chat?' + new URLSearchParams({ canal, desde: String(desde || 0) }).toString(), undefined, 10000);
  Api.escribir = (canal, texto) => req('POST', '/api/chat', { canal, texto });
  Api.mensajeRapido = (canal, rapido) => req('POST', '/api/chat', { canal, rapido });
  Api.reportar = (mensaje_id, motivo) => req('POST', '/api/chat/reportar', { mensaje_id, motivo });
  Api.bloquear = (jugador_id) => req('POST', '/api/chat/bloquear', { jugador_id });

  Api.logueado = () => !!(Api.estado && Api.estado.logueado);

  root.Api = Api;
})(typeof window !== 'undefined' ? window : globalThis);
