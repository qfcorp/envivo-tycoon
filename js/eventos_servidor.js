/* =========================================================
   EN VIVO Tycoon — Eventos de todo el servidor y calendario de adviento (server/src/EventosServidor.php,
   server/INTEGRAR_EVENTOS_SERVIDOR.md)
     GET  /api/eventos_servidor            { calendario, eventos: [{ id, clave, fase, quedan_dias, fichas, hoy, tienda, meta, tabla, oferta }],
                                    adviento: { hoy, dias: [{ dia, estado, premios }] } | null, cosmeticos, fichas_por }
     POST /api/eventos_servidor/diario     { instancia }            → 5 fichas una vez al día
     POST /api/eventos_servidor/jugar      { eventos: [{ ref, estrellas }] }   (lo manda solo este archivo al terminar cada evento)
     POST /api/eventos_servidor/comprar    { instancia, articulo }
     POST /api/eventos_servidor/meta       { instancia, hito }
     POST /api/eventos_servidor/adviento   { dia }
   Qué hace:
     - Tarjeta de Inicio (window.EnVivoInicio, id 'eventos_servidor', orden 4) por cada evento en curso: días que quedan,
       barra del objetivo común del servidor, tus fichas, "Fichas del día", "Tienda y objetivo" (ventana con la tienda de
       temporada, los premios del objetivo común, cómo ganar fichas, la tabla especial y la oferta especial) y el
       calendario anual. Sin cuenta: "Crea tu cuenta gratis para participar".
     - Calendario de adviento (1 al 25 de diciembre): tarjeta con el regalo de hoy y "Recuperar el de ayer".
     - Cada evento jugado en la partida (extensión de la lógica alTerminarEvento) se manda al servidor en una cola
       (localStorage, se reintenta) solo con cuenta y con un evento en curso. Los intentos en línea no pasan por aquí
       (el servidor los cuenta solo).
     - Las decoraciones de sede ganadas (servidor) se ponen en s.temporada.cosmeticos (js/art.js las dibuja).
   Textos: claves evs.* en js/lang/es.js. API para pruebas: window.EventosServidor = { datos, cargar, invalidar, cola, enviarCola, anotarEvento }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'eventos_servidor';
  const RUTA = '/api/eventos_servidor';
  const CADA_MS = 120000;
  const K_COLA = 'envivo_evs_cola';
  const MAX_COLA = 40;

  const st = { datos: null, cargando: false, cargadoEn: 0, errorEn: 0, ocupado: false, cuenta: undefined, noDisponible: false, ctx: null, enviando: false };

  const T = (ctx, k, p) => { try { if (ctx && typeof ctx.T === 'function') return ctx.T(k, p); if (root.I18N) return root.I18N.T(k, p); } catch (e) { /* abajo */ } return k; };
  const TLx = (ctx, t) => { try { return ctx && typeof ctx.TL === 'function' ? ctx.TL(t) : t; } catch (e) { return t; } };
  const escH = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ApiDe = (ctx) => (ctx && ctx.Api) || root.Api || {};
  const conServidor = (ctx) => ApiDe(ctx).disponible === true;
  const logueado = (ctx) => { try { const A = ApiDe(ctx); return !!(A.logueado && A.logueado()); } catch (e) { return false; } };
  const cuentaId = (ctx) => { try { const e = ApiDe(ctx).estado; return e && e.jugador ? e.jugador.id : null; } catch (e) { return null; } };
  const num = (n) => { try { return Number(n || 0).toLocaleString('es-EC'); } catch (e) { return String(n); } };

  async function pedir(ctx, metodo, ruta, cuerpo) {
    if (ctx && typeof ctx.pedir === 'function') return ctx.pedir(metodo, ruta, cuerpo);
    const r = await fetch(ruta, { method: metodo, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
      body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || 'Error'); e.status = r.status; e.codigo = j && j.codigo; throw e; }
    return j;
  }

  async function cargar(ctx) {
    if (st.cargando) return st.datos;
    st.cargando = true;
    try {
      const r = await pedir(ctx, 'GET', RUTA);
      st.datos = r && Array.isArray(r.eventos) ? r : null;
      st.cargadoEn = Date.now();
      ponerCosmeticos(ctx);
    } catch (e) {
      if (e && e.status === 404) st.noDisponible = true;
      st.errorEn = Date.now();
    } finally { st.cargando = false; }
    return st.datos;
  }
  function invalidar() { st.cargadoEn = 0; st.errorEn = 0; }

  function alDia(ctx) {
    st.ctx = ctx;
    const c = logueado(ctx) ? cuentaId(ctx) : null;
    if (c !== st.cuenta) { st.cuenta = c; st.cargadoEn = 0; }
    if (!conServidor(ctx) || st.noDisponible || st.cargando) return;
    const ahora = Date.now();
    if (ahora - st.cargadoEn < CADA_MS || ahora - st.errorEn < CADA_MS) return;
    const antes = JSON.stringify(st.datos);
    cargar(ctx).then(() => { if (JSON.stringify(st.datos) !== antes) repintar(ctx); }).catch(() => {});
    enviarCola(ctx);
  }
  function repintar(ctx) { try { if (ctx && typeof ctx.render === 'function') ctx.render(); } catch (e) { /* nada */ } }

  /* ---------- Decoraciones de sede ganadas en el servidor → la partida ---------- */
  function ponerCosmeticos(ctx) {
    try {
      const d = st.datos, s = ctx && typeof ctx.S === 'function' ? ctx.S() : null;
      if (!d || !s || !Array.isArray(d.cosmeticos) || !d.cosmeticos.length) return;
      if (!s.temporada || typeof s.temporada !== 'object') return;
      if (!Array.isArray(s.temporada.cosmeticos)) s.temporada.cosmeticos = [];
      let cambio = false;
      d.cosmeticos.forEach((k) => { if (typeof k === 'string' && !s.temporada.cosmeticos.includes(k)) { s.temporada.cosmeticos.push(k); cambio = true; } });
      if (cambio && typeof ctx.save === 'function') ctx.save();
    } catch (e) { /* nada */ }
  }
  const tieneCosmetico = (ctx, k) => {
    try { const s = ctx.S(); if (s && s.temporada && Array.isArray(s.temporada.cosmeticos) && s.temporada.cosmeticos.includes(k)) return true; } catch (e) { /* abajo */ }
    return !!(st.datos && Array.isArray(st.datos.cosmeticos) && st.datos.cosmeticos.includes(k));
  };

  /* ---------- Cola de eventos jugados ---------- */
  function leerCola() { try { const v = JSON.parse(root.localStorage.getItem(K_COLA) || '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.ref === 'string') : []; } catch (e) { return []; } }
  function guardarCola(c) { try { root.localStorage.setItem(K_COLA, JSON.stringify(c.slice(-MAX_COLA))); } catch (e) { /* sin almacenamiento: se pierde, no pasa nada */ } }
  const hayEventoEnCurso = () => !!(st.datos && st.datos.eventos.some((e) => e.fase === 'activa'));
  function fechaHoy() {
    try { const f = root.Temporadas && root.Temporadas.fecha && root.Temporadas.fecha(); if (f) return f; } catch (e) { /* abajo */ }
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function anotarEvento(s, result, c) {
    if (!result || !c || !logueado(st.ctx) || !hayEventoEnCurso()) return;
    const ref = fechaHoy() + ':' + ((s.stats && s.stats.events) || 0) + ':' + (c.id || 0);
    const cola = leerCola();
    if (cola.some((x) => x.ref === ref)) return;
    cola.push({ ref, estrellas: Math.max(0, Math.min(5, Number(result.stars) || 0)) });
    guardarCola(cola);
    setTimeout(() => enviarCola(st.ctx), 1500);
  }
  async function enviarCola(ctx) {
    ctx = ctx || st.ctx;
    if (st.enviando || !ctx || !conServidor(ctx) || !logueado(ctx)) return null;
    const cola = leerCola();
    if (!cola.length) return null;
    st.enviando = true;
    const lote = cola.slice(0, 20);
    try {
      const r = await pedir(ctx, 'POST', RUTA + '/jugar', { eventos: lote });
      guardarCola(leerCola().filter((x) => !lote.some((y) => y.ref === x.ref)));
      if (r && r.fichas && st.datos) st.datos.eventos.forEach((e) => { if (typeof r.fichas[e.id] === 'number') e.fichas = r.fichas[e.id]; });
      if (r && r.contados > 0) { invalidar(); cargar(ctx).then(() => repintar(ctx)).catch(() => {}); }
      return r;
    } catch (e) {
      // Sin red: se queda en la cola. Error del servidor (400, 401...): se descarta para no repetirlo para siempre
      if (e && e.status && e.status >= 400 && e.status < 500 && e.status !== 429) guardarCola(leerCola().filter((x) => !lote.some((y) => y.ref === x.ref)));
      return null;
    } finally { st.enviando = false; }
  }
  try {
    const G = root.Game;
    if (G && typeof G.registrarExtension === 'function') G.registrarExtension({ id: ID, alTerminarEvento: (s, result, c) => { try { anotarEvento(s, result, c); } catch (e) { /* nunca rompe el juego */ } } });
  } catch (e) { /* sin lógica */ }

  /* ---------- Estilos ---------- */
  function ponerCss() {
    const doc = root.document;
    if (!doc || doc.getElementById('evs-css')) return;
    const s = doc.createElement('style');
    s.id = 'evs-css';
    s.textContent = `.evs-card{position:relative;overflow:hidden;border:1px solid #5ad1ff55;background:linear-gradient(135deg,#071a24 0%,#0d0f14 60%,#0f1b2a 100%)}
      .evs-card.evs-futbol{border-color:#7dff9a55;background:linear-gradient(135deg,#06200f 0%,#0d0f14 60%,#0d2316 100%)}
      .evs-card::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,#5ad1ff,#ffd27a,#ff5a8a)}
      .evs-tag{display:inline-block;font-family:var(--f-head);font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#06121a;background:#5ad1ff;border-radius:6px;padding:1px 7px}
      .evs-futbol .evs-tag{background:#7dff9a}
      .evs-t{margin:6px 0 2px;font-size:18px;line-height:1.2;overflow-wrap:anywhere}
      .evs-fichas{display:inline-flex;align-items:center;gap:4px;font-weight:800;color:var(--amber)}
      .evs-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.evs-row .btn{margin:0;flex:1 1 140px}
      .evs-art{display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center;padding:8px 0;border-top:1px solid #ffffff14}
      .evs-art b{overflow-wrap:anywhere}.evs-art .btn{margin:0;min-width:96px}
      .evs-hito{padding:8px 0;border-top:1px solid #ffffff14}
      .evs-adv{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:8px 0}
      .evs-dia{border:1px solid #ffffff22;border-radius:10px;padding:6px 2px;text-align:center;font-size:12px;min-height:46px;background:#ffffff08}
      .evs-dia b{display:block;font-size:15px}.evs-dia.reclamado{opacity:.55}.evs-dia.hoy{border-color:var(--amber);background:#ffd27a1a}
      .evs-dia.recuperar{border-color:#5ad1ff}.evs-dia.perdido{opacity:.35}
      .evs-tabla{width:100%;border-collapse:collapse;font-size:13px}.evs-tabla td{padding:4px 2px;border-top:1px solid #ffffff14}.evs-tabla tr.tu td{color:var(--amber);font-weight:700}`;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function fecha(iso) {
    try {
      const d = new Date(iso);
      const L = root.I18N && root.I18N.idiomas && root.I18N.idiomas.find((x) => x.code === root.I18N.idioma);
      return d.toLocaleDateString((L && L.locale) || 'es-EC', { day: 'numeric', month: 'short', timeZone: 'America/Guayaquil' });
    } catch (e) { return String(iso || '').slice(5, 10); }
  }
  const nombreEv = (ctx, clave) => T(ctx, 'evs.ev.' + clave);
  const premioTxt = (ctx, p) => TLx(ctx, p.nombre || '');
  const quedanTxt = (ctx, e) => (e.quedan_dias > 1 ? T(ctx, 'evs.quedan', { n: e.quedan_dias }) : e.quedan_dias === 1 ? T(ctx, 'evs.quedan_manana') : T(ctx, 'evs.ultimo_dia'));

  /* ---------- Tarjetas de Inicio ---------- */
  function barraMeta(ctx, e, esc) {
    const m = e.meta;
    if (!m) return '';
    return `<p class="small" style="margin:8px 0 2px">${esc(T(ctx, 'evs.objetivo.' + e.clave, { meta: num(m.meta) }))}</p>
      <div class="row between small"><span class="muted">${esc(m.servidor ? m.servidor.nombre : '')}</span><b class="num">${num(m.progreso)} / ${num(m.meta)}</b></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.meta}" aria-valuenow="${Math.min(m.progreso, m.meta)}" aria-label="${esc(T(ctx, 'evs.objetivo_comun'))}"><i style="width:${m.pct}%"></i></div>`;
  }
  function tarjetaEvento(ctx, e) {
    const esc = ctx.esc || escH;
    const log = logueado(ctx);
    const pend = e.meta ? e.meta.hitos.filter((h) => h.cumplido && !h.reclamado) : [];
    let acciones = '';
    if (!log) {
      acciones = `<div class="evs-row"><button class="btn main" data-act="cuenta" data-modo="registro" data-evs="crear">${esc(T(ctx, 'evs.crear_cuenta'))}</button>
        <button class="btn" data-ext="${ID}" data-acc="abrir" data-id="${esc(e.id)}">${esc(T(ctx, 'evs.ver_tienda'))}</button></div>`;
    } else if (e.fase === 'activa') {
      acciones = `<div class="evs-row">${e.hoy && !e.hoy.diario ? `<button class="btn main" data-ext="${ID}" data-acc="diario" data-id="${esc(e.id)}" data-evs="diario"${st.ocupado ? ' disabled' : ''}>🎟️ ${esc(T(ctx, 'evs.diario', { n: (st.datos.fichas_por || {}).diario || 5 }))}</button>` : ''}
        <button class="btn${e.hoy && e.hoy.diario && !pend.length ? ' main' : ''}" data-ext="${ID}" data-acc="abrir" data-id="${esc(e.id)}" data-evs="abrir">${esc(T(ctx, 'evs.ver_tienda'))}</button></div>`;
    }
    const reclamar = log && pend.length ? `<div class="evs-row">${pend.map((h) => `<button class="btn main" data-ext="${ID}" data-acc="meta" data-id="${esc(e.id)}" data-hito="${esc(h.hito)}" data-evs="meta"${st.ocupado ? ' disabled' : ''}>🎁 ${esc(T(ctx, 'evs.reclamar_hito.' + h.hito))}</button>`).join('')}</div>` : '';
    return `<div class="card evs-card${e.futbol ? ' evs-futbol' : ''}" data-evs-card="${esc(e.id)}">
      <div class="row between"><span class="evs-tag">${esc(T(ctx, e.fase === 'activa' ? 'evs.tag' : 'evs.tag_fin'))}</span><span class="small" style="color:var(--amber)">${esc(e.fase === 'activa' ? quedanTxt(ctx, e) : T(ctx, 'evs.terminado'))}</span></div>
      <h2 class="evs-t">${esc(e.icono)} ${esc(nombreEv(ctx, e.clave))}</h2>
      <p class="small muted" style="margin:2px 0">${esc(T(ctx, 'evs.lema.' + e.clave))}</p>
      ${log && typeof e.fichas === 'number' ? `<p class="small" style="margin:6px 0 0">${esc(T(ctx, 'evs.tus_fichas'))} <span class="evs-fichas" data-evs="fichas">🎟️ ${num(e.fichas)}</span></p>` : ''}
      ${barraMeta(ctx, e, esc)}${reclamar}${acciones}</div>`;
  }
  function tarjetaAdviento(ctx, a) {
    const esc = ctx.esc || escH;
    const hoy = a.dias.find((d) => d.estado === 'hoy');
    const ayer = a.dias.find((d) => d.estado === 'recuperar');
    const log = logueado(ctx);
    let btn = '';
    if (!log) btn = `<button class="btn main" data-act="cuenta" data-modo="registro">${esc(T(ctx, 'evs.crear_cuenta'))}</button>`;
    else if (hoy) btn = `<button class="btn main" data-ext="${ID}" data-acc="adviento" data-dia="${hoy.dia}" data-evs="adv-hoy"${st.ocupado ? ' disabled' : ''}>🎁 ${esc(T(ctx, 'evs.adv.abrir', { n: hoy.dia }))}</button>`;
    else if (ayer) btn = `<button class="btn main" data-ext="${ID}" data-acc="adviento" data-dia="${ayer.dia}" data-evs="adv-ayer"${st.ocupado ? ' disabled' : ''}>🎁 ${esc(T(ctx, 'evs.adv.recuperar', { n: ayer.dia }))}</button>`;
    else btn = `<p class="small up" style="margin:6px 0 0">✓ ${esc(T(ctx, a.hoy >= 25 ? 'evs.adv.completo' : 'evs.adv.manana'))}</p>`;
    const extra = log && hoy && ayer ? `<button class="btn" data-ext="${ID}" data-acc="adviento" data-dia="${ayer.dia}" data-evs="adv-ayer">${esc(T(ctx, 'evs.adv.recuperar', { n: ayer.dia }))}</button>` : '';
    return `<div class="card evs-card" data-evs-card="adviento">
      <div class="row between"><span class="evs-tag">${esc(T(ctx, 'evs.adv.tag'))}</span><span class="small muted">${esc(T(ctx, 'evs.adv.llevas', { n: a.reclamados, total: a.dias.length }))}</span></div>
      <h2 class="evs-t">🎁 ${esc(T(ctx, 'evs.adv.titulo'))}</h2>
      <p class="small muted" style="margin:2px 0">${esc(T(ctx, 'evs.adv.texto'))}</p>
      ${hoy ? `<p class="small" style="margin:6px 0 0">${esc(T(ctx, 'evs.adv.hoy_trae', { premio: hoy.premios.map((p) => premioTxt(ctx, p)).join(' · ') }))}</p>` : ''}
      <div class="evs-row">${btn}${extra}<button class="btn" data-ext="${ID}" data-acc="adviento_ver" data-evs="adv-ver">${esc(T(ctx, 'evs.adv.ver'))}</button></div></div>`;
  }
  function tarjetaProximo(ctx) {
    const esc = ctx.esc || escH;
    const p = (st.datos.calendario || []).find((c) => c.tipo === 'evento' && c.fase === 'pronto');
    if (!p) return '';
    return `<div class="card evs-card" data-evs-card="proximo"><div class="row between"><span class="small">${esc(p.icono)} ${esc(T(ctx, 'evs.proximo', { evento: nombreEv(ctx, p.clave), fecha: fecha(p.desde) }))}</span>
      <button class="btn sm" data-ext="${ID}" data-acc="calendario" data-evs="calendario">📅 ${esc(T(ctx, 'evs.calendario'))}</button></div></div>`;
  }

  function tarjeta(ctx) {
    alDia(ctx);
    const d = st.datos;
    if (!d || !conServidor(ctx) || !d.activo) return '';
    ponerCss();
    const evs = d.eventos.filter((e) => e.fase === 'activa' || logueado(ctx));
    let h = evs.map((e) => tarjetaEvento(ctx, e)).join('');
    if (d.adviento) h += tarjetaAdviento(ctx, d.adviento);
    if (!evs.some((e) => e.fase === 'activa')) h += tarjetaProximo(ctx);
    return h;
  }

  /* Franja corta arriba de Inicio SOLO si hay algo para reclamar (fichas del día, regalo de adviento, premio común) */
  function banner(ctx) {
    alDia(ctx);
    const d = st.datos;
    if (!d || !d.activo || !conServidor(ctx) || !logueado(ctx)) return '';
    const esc = ctx.esc || escH;
    let txt = '', btn = '';
    const adv = d.adviento && d.adviento.dias.find((x) => x.estado === 'hoy' || x.estado === 'recuperar');
    const meta = d.eventos.find((e) => e.meta && e.meta.hitos.some((h) => h.cumplido && !h.reclamado));
    const dia = d.eventos.find((e) => e.fase === 'activa' && e.hoy && !e.hoy.diario);
    if (meta) { txt = T(ctx, 'evs.banner_meta', { evento: nombreEv(ctx, meta.clave) }); btn = `data-acc="abrir" data-id="${esc(meta.id)}"`; }
    else if (adv) { txt = T(ctx, adv.estado === 'hoy' ? 'evs.banner_adv' : 'evs.banner_adv_ayer', { n: adv.dia }); btn = `data-acc="adviento" data-dia="${adv.dia}"`; }
    else if (dia) { txt = T(ctx, 'evs.banner_diario', { evento: nombreEv(ctx, dia.clave), n: (d.fichas_por || {}).diario || 5 }); btn = `data-acc="diario" data-id="${esc(dia.id)}"`; }
    if (!txt) return '';
    ponerCss();
    return `<div class="card evs-card" data-evs-card="banner" style="padding:10px 12px"><div class="row between" style="gap:8px"><span class="small" style="flex:1 1 auto;overflow-wrap:anywhere">${esc(txt)}</span>
      <button class="btn sm main" data-ext="${ID}" ${btn} data-evs="banner"${st.ocupado ? ' disabled' : ''}>${esc(T(ctx, 'evs.banner_btn'))}</button></div></div>`;
  }

  /* ---------- Ventanas ---------- */
  function cabecera(ctx, titulo) {
    const esc = ctx.esc || escH, I = ctx.I || (() => '✕');
    return `<div class="row between"><h2>${titulo}</h2><button class="btn sm" data-act="close" aria-label="${esc(T(ctx, 'comun.cerrar'))}">${I('close', 'sm')}</button></div>`;
  }
  function ventanaEvento(ctx, id) {
    const esc = ctx.esc || escH;
    const e = st.datos && st.datos.eventos.find((x) => x.id === id);
    if (!e) return null;
    const log = logueado(ctx);
    const fp = st.datos.fichas_por || {};
    const activa = e.fase === 'activa';
    const tienda = e.tienda.map((a) => {
      const agotado = a.comprados >= a.max || (a.tipo === 'cosmetico' && tieneCosmetico(ctx, a.item));
      const falta = log && typeof e.fichas === 'number' && e.fichas < a.precio;
      const btn = !log || !activa ? '' : agotado
        ? `<span class="small up">✓ ${esc(T(ctx, a.tipo === 'cosmetico' ? 'evs.ya_tienes' : 'evs.agotado'))}</span>`
        : `<button class="btn${falta ? '' : ' main'}" data-ext="${ID}" data-acc="comprar" data-id="${esc(e.id)}" data-art="${esc(a.id)}" data-evs="comprar-${esc(a.id)}"${falta || st.ocupado ? ' disabled' : ''}>🎟️ ${num(a.precio)}</button>`;
      return `<div class="evs-art" data-evs-art="${esc(a.id)}"><div><b>${esc(premioTxt(ctx, a))}</b>${a.tipo === 'cosmetico' ? `<br><span class="small" style="color:var(--amber)">${esc(T(ctx, 'evs.exclusivo'))}</span>` : ''}
        <br><span class="small muted">🎟️ ${num(a.precio)} · ${esc(T(ctx, 'evs.compras', { n: Math.min(a.comprados, a.max), max: a.max }))}</span></div>${btn}</div>`;
    }).join('');
    const hitos = e.meta ? e.meta.hitos.map((hh) => `<div class="evs-hito" data-evs-hito="${esc(hh.hito)}"><div class="row between"><b>${esc(T(ctx, 'evs.hito.' + hh.hito, { n: num(hh.en) }))}</b>
        <span class="small">${hh.reclamado ? '✓ ' + esc(T(ctx, 'evs.reclamado')) : hh.cumplido ? '' : esc(num(Math.min(e.meta.progreso, hh.en)) + ' / ' + num(hh.en))}</span></div>
        <p class="small muted" style="margin:2px 0">${esc(hh.premios.map((p) => premioTxt(ctx, p)).join(' · '))}</p>
        ${log && hh.cumplido && !hh.reclamado ? `<button class="btn main" data-ext="${ID}" data-acc="meta" data-id="${esc(e.id)}" data-hito="${esc(hh.hito)}"${st.ocupado ? ' disabled' : ''}>🎁 ${esc(T(ctx, 'evs.reclamar'))}</button>` : ''}</div>`).join('') : '';
    const tabla = e.tabla && e.tabla.top.length ? `<div class="sectitle">${esc(T(ctx, 'evs.tabla'))}</div><table class="evs-tabla" data-evs="tabla">${e.tabla.top.map((f) => `<tr${f.tu ? ' class="tu"' : ''}><td>${f.puesto}.</td><td>${esc(f.nombre)}</td><td style="text-align:right">🎟️ ${num(f.fichas)}</td></tr>`).join('')}</table>
      ${e.tabla.tu && !e.tabla.top.some((f) => f.tu) ? `<p class="small muted">${esc(T(ctx, 'evs.tu_puesto', { n: e.tabla.tu.puesto, fichas: num(e.tabla.tu.fichas) }))}</p>` : ''}` : '';
    const como = `<div class="sectitle">${esc(T(ctx, 'evs.como'))}</div><ul class="small" style="margin:4px 0 0;padding-left:18px">
      <li>${esc(T(ctx, 'evs.como_diario', { n: fp.diario || 5 }))}</li><li>${esc(T(ctx, 'evs.como_evento', { n: fp.evento || 2, extra: fp.evento_bueno || 1, tope: fp.tope_eventos || 12 }))}</li>
      <li>${esc(T(ctx, 'evs.como_linea', { n: fp.en_linea || 3, tope: fp.tope_en_linea || 5 }))}</li>${st.datos.adviento ? `<li>${esc(T(ctx, 'evs.como_adviento'))}</li>` : ''}</ul>
      <p class="small muted" style="margin:6px 0 0">${esc(T(ctx, 'evs.solo_este'))}</p>`;
    let oferta = '';
    if (e.oferta) {
      const prods = (ApiDe(ctx).estado && ApiDe(ctx).estado.tienda && ApiDe(ctx).estado.tienda.productos) || [];
      const p = prods.find((x) => x.id === e.oferta);
      const precio = typeof ctx.precio === 'function' ? ctx.precio(e.oferta) : null;
      if (p) oferta = `<div class="sectitle">${esc(T(ctx, 'evs.oferta'))}</div><p class="small" style="margin:4px 0"><b>${esc(TLx(ctx, p.nombre))}</b><br><span class="muted">${esc(TLx(ctx, p.detalle || ''))}</span></p>
        ${precio ? `<button class="btn" data-ext="${ID}" data-acc="oferta" data-k="${esc(e.oferta)}" data-evs="oferta">${esc(T(ctx, 'evs.ver_oferta', { precio }))}</button>`
          : `<button class="btn" data-ext="${ID}" data-acc="tienda" data-evs="oferta">${esc(T(ctx, 'evs.ir_tienda'))}</button>`}`;
    }
    return `${cabecera(ctx, esc(e.icono) + ' ' + esc(nombreEv(ctx, e.clave)))}
      <p class="small muted" style="margin:0 0 6px">${esc(fecha(e.desde))} – ${esc(fecha(e.hasta))} · ${esc(activa ? quedanTxt(ctx, e) : T(ctx, 'evs.terminado'))}</p>
      ${log && typeof e.fichas === 'number' ? `<p style="margin:4px 0">${esc(T(ctx, 'evs.tus_fichas'))} <span class="evs-fichas" data-evs="saldo">🎟️ ${num(e.fichas)}</span></p>` : `<p class="small">${esc(T(ctx, 'evs.sin_cuenta'))}</p>`}
      <div class="sectitle">${esc(T(ctx, 'evs.tienda'))}</div><p class="small muted" style="margin:2px 0">${esc(T(ctx, 'evs.tienda_txt'))}</p>${tienda}
      <div class="sectitle">${esc(T(ctx, 'evs.objetivo_comun'))}</div>${barraMeta(ctx, e, esc)}${hitos}
      ${como}${tabla}${oferta}
      <div class="evs-row"><button class="btn" data-ext="${ID}" data-acc="calendario">📅 ${esc(T(ctx, 'evs.calendario'))}</button></div>`;
  }
  function ventanaCalendario(ctx) {
    const esc = ctx.esc || escH;
    const cal = (st.datos && st.datos.calendario) || [];
    const filas = cal.map((c) => `<div class="row between small" style="margin:6px 0" data-evs-cal="${esc(c.id)}"><span>${esc(c.icono)} ${esc(nombreEv(ctx, c.clave))}${c.fase === 'activa' ? ` <b style="color:var(--green)">· ${esc(T(ctx, 'evs.en_curso'))}</b>` : ''}</span>
      <span class="muted num">${esc(fecha(c.desde))} – ${esc(fecha(c.hasta))}</span></div>`).join('');
    return `${cabecera(ctx, '📅 ' + esc(T(ctx, 'evs.calendario')))}<p class="small muted">${esc(T(ctx, 'evs.calendario_txt'))}</p>${filas || `<p class="small muted">${esc(T(ctx, 'evs.calendario_vacio'))}</p>`}`;
  }
  function ventanaAdviento(ctx) {
    const esc = ctx.esc || escH;
    const a = st.datos && st.datos.adviento;
    if (!a) return null;
    const log = logueado(ctx);
    const celdas = a.dias.map((d) => {
      const puede = log && (d.estado === 'hoy' || d.estado === 'recuperar');
      const tit = d.premios.map((p) => premioTxt(ctx, p)).join(' · ');
      const ico = d.estado === 'reclamado' ? '✓' : d.estado === 'perdido' ? '·' : d.dia === 25 ? '⭐' : '🎁';
      return puede ? `<button class="evs-dia ${d.estado}" data-ext="${ID}" data-acc="adviento" data-dia="${d.dia}" title="${esc(tit)}" aria-label="${esc(T(ctx, 'evs.adv.dia', { n: d.dia }) + ': ' + tit)}"><b>${d.dia}</b>${ico}</button>`
        : `<div class="evs-dia ${d.estado}" title="${esc(tit)}" aria-label="${esc(T(ctx, 'evs.adv.dia', { n: d.dia }) + ': ' + tit)}"><b>${d.dia}</b>${ico}</div>`;
    }).join('');
    const lista = a.dias.map((d) => `<div class="row between small" style="margin:3px 0"><span>${esc(T(ctx, 'evs.adv.dia', { n: d.dia }))}</span><span class="muted" style="text-align:right">${esc(d.premios.map((p) => premioTxt(ctx, p)).join(' · '))}</span></div>`).join('');
    return `${cabecera(ctx, '🎁 ' + esc(T(ctx, 'evs.adv.titulo')))}<p class="small muted">${esc(T(ctx, 'evs.adv.reglas'))}</p><div class="evs-adv" data-evs="adviento">${celdas}</div>
      <div class="sectitle">${esc(T(ctx, 'evs.adv.lista'))}</div>${lista}`;
  }
  function abrirVentana(ctx, html) { if (html && typeof ctx.openModal === 'function') { ponerCss(); ctx.openModal(html); } }

  /* ---------- Acciones ---------- */
  async function accion(ctx, ruta, cuerpo, despues) {
    if (st.ocupado) return;
    st.ocupado = true;
    repintar(ctx);
    try {
      const r = await pedir(ctx, 'POST', RUTA + ruta, cuerpo);
      try { if (ctx.snd) ctx.snd.play('chapter'); } catch (e) { /* nada */ }
      if (r && Array.isArray(r.cosmeticos) && r.cosmeticos.length && st.datos) { st.datos.cosmeticos = Array.from(new Set((st.datos.cosmeticos || []).concat(r.cosmeticos))); ponerCosmeticos(ctx); }
      if (r && r.evento && st.datos) st.datos.eventos = st.datos.eventos.map((e) => (e.id === r.evento.id ? Object.assign({}, e, r.evento) : e));
      if (r && r.adviento && st.datos) st.datos.adviento = r.adviento;
      try { ctx.toast(r && r.recibido ? T(ctx, 'evs.recibiste', { premio: TLx(ctx, r.recibido) }) : T(ctx, 'evs.fichas_recibidas', { n: (r && r.fichas_recibidas) || 0 })); } catch (e) { /* nada */ }
      st.ocupado = false;
      if (r && ((Array.isArray(r.entregas) && r.entregas.length) || r.creditos > 0) && typeof ctx.alReclamar === 'function') { try { await ctx.alReclamar(); } catch (e) { /* se aplica la próxima vez */ } }
      if (despues) despues(r);
    } catch (e) {
      st.ocupado = false;
      if (e && /^(evento|adviento)_/.test(e.codigo || '')) { invalidar(); await cargar(ctx).catch(() => {}); }
      try { ctx.toast(e && e.message ? e.message : T(ctx, 'err.no_completo')); } catch (x) { /* nada */ }
      if (despues) despues(null);
    }
    repintar(ctx);
  }

  function clic(ctx, acc, el) {
    const ds = (el && el.dataset) || {};
    if (acc === 'abrir') { abrirVentana(ctx, ventanaEvento(ctx, ds.id)); return; }
    if (acc === 'calendario') { abrirVentana(ctx, ventanaCalendario(ctx)); return; }
    if (acc === 'adviento_ver') { abrirVentana(ctx, ventanaAdviento(ctx)); return; }
    if (acc === 'diario') { accion(ctx, '/diario', { instancia: ds.id }); return; }
    if (acc === 'meta') { const abierta = !!(el && el.closest && el.closest('#overlay')); accion(ctx, '/meta', { instancia: ds.id, hito: ds.hito }, () => { if (abierta) abrirVentana(ctx, ventanaEvento(ctx, ds.id)); }); return; }
    if (acc === 'comprar') { accion(ctx, '/comprar', { instancia: ds.id, articulo: ds.art }, () => abrirVentana(ctx, ventanaEvento(ctx, ds.id))); return; }
    if (acc === 'adviento') { const abierta = !!(el && el.closest && el.closest('#overlay')); accion(ctx, '/adviento', { dia: Number(ds.dia) }, () => { if (abierta) abrirVentana(ctx, ventanaAdviento(ctx)); }); return; }
    if (acc === 'oferta') { try { if (typeof ctx.closeModal === 'function') ctx.closeModal(); if (typeof ctx.comprar === 'function') ctx.comprar(ds.k); } catch (e) { /* nada */ } return; }
    if (acc === 'tienda') {
      try { if (typeof ctx.closeModal === 'function') ctx.closeModal(); const b = root.document && root.document.querySelector('nav button[data-tab="tienda"]'); if (b) b.click(); } catch (e) { /* nada */ }
    }
  }

  root.EventosServidor = { get datos() { return st.datos; }, cargar: (ctx) => cargar(ctx || st.ctx), invalidar, cola: leerCola, enviarCola: (ctx) => enviarCola(ctx || st.ctx), anotarEvento };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 4, hub: 'misiones', tarjeta, banner, clic });
})(typeof window !== 'undefined' ? window : globalThis);
