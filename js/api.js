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
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
      });
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      if (!j || typeof j !== 'object') throw new Error('El servidor no respondió bien. Intenta de nuevo.');
      if (!r.ok || j.ok === false) {
        const err = new Error(j.error || 'No se pudo completar. Intenta de nuevo.');
        err.status = r.status;
        throw err;
      }
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('El servidor tardó demasiado. Revisa tu internet.');
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
  Api.registro = async (email, nombre, clave) => guardarEstado(await req('POST', '/api/registro', { email, nombre, clave }));
  Api.entrar = async (email, clave) => guardarEstado(await req('POST', '/api/entrar', { email, clave }));
  Api.salir = async () => { await req('POST', '/api/salir', {}); return Api.refrescar(); };
  Api.partida = () => req('GET', '/api/partida');
  Api.subirPartida = (datos) => req('POST', '/api/partida', { datos }, 20000);
  Api.gastar = (item) => req('POST', '/api/gastar', { item });
  Api.bonoVip = () => req('POST', '/api/vip/bono', {});
  Api.orden = (producto) => req('POST', '/api/orden', { producto });

  Api.logueado = () => !!(Api.estado && Api.estado.logueado);

  root.Api = Api;
})(typeof window !== 'undefined' ? window : globalThis);
