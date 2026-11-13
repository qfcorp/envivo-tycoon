/* =========================================================
   EN VIVO Tycoon — Regreso del jugador: «¡Volviste!» y 3 días de ventaja (server/src/Regreso.php, INTEGRAR_REGRESO.md)
     POST /api/regreso           { zona }  → { ausencia: null | { id, dias, nivel, regalo: { creditos, entregas }, ventaja, oferta },
                                              ventaja: null | { id, hasta_ms, pago_pct, xp_mult }, oferta: null | { producto, nombre, detalle, precio, vence } }
     POST /api/regreso/reclamar  { id }    → lo mismo + { entregas, creditos_recibidos }   (el regalo lo da el SERVIDOR, una vez por ausencia)
   Qué hace:
     - Con cuenta, al abrir el juego manda la zona horaria del aparato (así los avisos nunca llegan de noche en SU hora).
     - Si volvió tras 7+ días: ventana «¡Volviste!» con el regalo (crece a los 7, 14 y 30 días), los 3 días de ventaja y,
       después de recibirlo, la oferta de regreso de una sola vez (botón de compra de siempre: data-act="comprar").
     - Ventaja (extensión de logic.js, determinista): mientras s.regreso.ahora < s.regreso.hasta, los contratos nuevos pagan
       +pago_pct % (multPago) y el personal gana doble experiencia por evento (limites → xpEvento). La pantalla pone
       s.regreso.ahora con el reloj del aparato; la lógica solo mira lo guardado. Los intentos en línea (s.intento) nunca
       aplican extensiones: el validador del servidor repite igual y la ventaja no toca la calidad ni las estrellas.
     - Franja en Inicio mientras dura la ventaja (cuánto queda y el botón de la oferta si sigue abierta).
   Textos: claves rg.* en js/lang/es.js. API para pruebas: window.Regreso = { datos, cargar, activa, EXT }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'regreso';
  const RUTA = '/api/regreso';
  const CADA_MS = 10 * 60000;
  const G = root.Game || (typeof require === 'function' ? (() => { try { return require('./logic.js'); } catch (e) { return null; } })() : null);

  /* ---------- Ventaja en la lógica (determinista: solo mira s.regreso) ---------- */
  const num = (v, a, b, d) => { const n = Number(v); return isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
  function activa(s) {
    const r = s && s.regreso;
    return !!(r && typeof r.hasta === 'number' && typeof r.ahora === 'number' && r.ahora < r.hasta);
  }
  const EXT = {
    id: ID,
    multPago(s, c) {
      if (!activa(s)) return 1;
      const p = num(s.regreso.pago, 0, 50, 25);
      if (c && typeof c === 'object') c.regreso = p;   // el contrato recuerda que salió con la ventaja
      return 1 + p / 100;
    },
    limites(s) { return activa(s) ? { xpEvento: num(s.regreso.xp, 1, 3, 2) - 1 } : {}; },
  };
  if (G && typeof G.registrarExtension === 'function') G.registrarExtension(EXT);

  /** Guarda la ventaja que dio el servidor en la partida (hasta en ms) y pone el reloj de la pantalla. */
  function ponerVentaja(s, v) {
    if (!s || !v || !isFinite(Number(v.hasta_ms))) return false;
    s.regreso = Object.assign({}, s.regreso || {}, { id: v.id || null, hasta: Number(v.hasta_ms), pago: num(v.pago_pct, 0, 50, 25), xp: num(v.xp_mult, 1, 3, 2), ahora: Date.now() });
    return true;
  }
  function reloj(s) { if (s && s.regreso && typeof s.regreso.hasta === 'number') s.regreso.ahora = Date.now(); }

  /* ---------- Pantalla ---------- */
  const st = { datos: null, cargando: false, cargadoEn: 0, errorEn: 0, cuenta: undefined, mostrada: {}, ocupado: false, noDisponible: false, precioPlay: {} };
  const T = (ctx, k, p) => { try { if (ctx && typeof ctx.T === 'function') return ctx.T(k, p); if (root.I18N) return root.I18N.T(k, p); } catch (e) { /* abajo */ } return k; };
  const escH = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ApiDe = (ctx) => (ctx && ctx.Api) || root.Api || {};
  const conServidor = (ctx) => ApiDe(ctx).disponible === true;
  const logueado = (ctx) => { try { const A = ApiDe(ctx); return !!(A.logueado && A.logueado()); } catch (e) { return false; } };
  const cuentaId = (ctx) => { try { const e = ApiDe(ctx).estado; return e && e.jugador ? e.jugador.id : null; } catch (e) { return null; } };
  const partida = (ctx) => { try { return ctx && (typeof ctx.S === 'function' ? ctx.S() : ctx.estado); } catch (e) { return null; } };
  const zona = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; } };
  const enApp = (ctx) => { try { return ctx && typeof ctx.enApp === 'function' ? !!ctx.enApp() : !!(root.GooglePlay && root.GooglePlay.enApp && root.GooglePlay.enApp()); } catch (e) { return false; } };
  const hayVentana = () => { try { const o = root.document.getElementById('overlay'); return !!(o && o.classList.contains('on')); } catch (e) { return true; } };

  async function pedir(ctx, metodo, ruta, cuerpo) {
    if (ctx && typeof ctx.pedir === 'function') return ctx.pedir(metodo, ruta, cuerpo);
    const r = await fetch(ruta, { method: metodo, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || 'Error'); e.status = r.status; e.codigo = j && j.codigo; throw e; }
    return j;
  }

  function aplicar(ctx, d) {
    st.datos = d && typeof d === 'object' ? d : null;
    const s = partida(ctx);
    if (s && st.datos && st.datos.ventaja) { ponerVentaja(s, st.datos.ventaja); try { if (ctx.save) ctx.save(); } catch (e) { /* nada */ } }
  }

  async function cargar(ctx) {
    if (st.cargando) return st.datos;
    st.cargando = true;
    try {
      aplicar(ctx, await pedir(ctx, 'POST', RUTA, { zona: zona() }));
      st.cargadoEn = Date.now();
    } catch (e) {
      if (e && e.status === 404) st.noDisponible = true;
      st.errorEn = Date.now();
    } finally { st.cargando = false; }
    return st.datos;
  }

  function alDia(ctx) {
    const c = logueado(ctx) ? cuentaId(ctx) : null;
    if (c !== st.cuenta) { st.cuenta = c; st.cargadoEn = 0; st.datos = null; }
    if (!c || !conServidor(ctx) || st.noDisponible || st.cargando) return;
    const ahora = Date.now();
    if (ahora - st.cargadoEn < CADA_MS || ahora - st.errorEn < CADA_MS) return;
    cargar(ctx).then(() => {
      const a = st.datos && st.datos.ausencia;
      if (a && a.reclamable && !st.mostrada[a.id] && !hayVentana()) { st.mostrada[a.id] = true; abrir(ctx); return; }
      try { ctx.render(); } catch (e) { /* nada */ }
    }).catch(() => {});
  }

  function ponerCss() {
    const doc = root.document;
    if (!doc || doc.getElementById('rg-css')) return;
    const s = doc.createElement('style');
    s.id = 'rg-css';
    s.textContent = `.rg-card{position:relative;margin:0 0 12px;padding:12px 14px;border-radius:14px;border:1px solid #4da3ff66;background:linear-gradient(135deg,#08131f 0%,#0d0f14 60%,#0b1a24 100%);overflow:hidden}
      .rg-card::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,#4da3ff,#7fe0c4,#4da3ff)}
      .rg-t{margin:2px 0;font-size:16px;line-height:1.25;overflow-wrap:anywhere}
      .rg-sub{margin:0;color:var(--muted);font-size:13px}
      .rg-card .btn{margin-top:8px}
      .rg-modal h2{margin:0 0 6px;font-size:24px}
      .rg-lista{list-style:none;margin:8px 0 12px;padding:0;display:grid;gap:6px}
      .rg-lista li{display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;background:#ffffff0d;overflow-wrap:anywhere}
      .rg-box{margin:10px 0;padding:10px 12px;border-radius:12px;border:1px solid #4da3ff55;background:#4da3ff12}
      .rg-box b{color:#7fc4ff}
      .rg-of{border-color:#ffd27a88;background:#ffb02012}
      .rg-of b{color:var(--amber)}
      .rg-chip{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#06121d;background:#7fc4ff;border-radius:6px;padding:1px 7px}`;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function restante(ctx, ms) {
    const h = Math.max(0, Math.ceil(ms / 3600000));
    return h >= 24 ? T(ctx, 'rg.quedan_dh', { d: Math.floor(h / 24), h: h % 24 }) : T(ctx, 'rg.quedan_h', { h: Math.max(1, h) });
  }
  function fecha(iso) {
    try { const L = root.I18N && root.I18N.idiomas && root.I18N.idiomas.find((x) => x.code === root.I18N.idioma); return new Date(iso).toLocaleString((L && L.locale) || 'es-EC', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso || '').slice(0, 16); }
  }
  const money = (ctx, n) => { try { return ctx.M ? ctx.M(n) : '$' + Number(n).toLocaleString('es-EC'); } catch (e) { return '$' + n; } };
  const N = (ctx, n) => { try { return ctx.N ? ctx.N(n) : String(n); } catch (e) { return String(n); } };

  function itemTxt(ctx, e) {
    const n = Number(e.cantidad) || 0;
    if (e.tipo === 'dinero') return T(ctx, 'rg.dinero', { m: money(ctx, n) });
    if (e.tipo === 'consumible') return T(ctx, e.item === 'battery' ? 'rg.battery' : 'rg.cable', { n });
    if (e.tipo === 'reparar_todo') return T(ctx, 'rg.reparar');
    if (e.tipo === 'creditos') return T(ctx, 'rg.creditos', { n: N(ctx, n) });
    try { return ctx.TL ? ctx.TL(e.nombre || '') : (e.nombre || ''); } catch (x) { return e.nombre || ''; }
  }
  function lista(ctx, creditos, entregas) {
    const esc = ctx.esc || escH;
    const li = [];
    if (creditos) li.push(`<li>💎 ${esc(T(ctx, 'rg.creditos', { n: N(ctx, creditos) }))}</li>`);
    (entregas || []).forEach((e) => li.push(`<li>${e.tipo === 'dinero' ? '💵' : e.tipo === 'reparar_todo' ? '🔧' : '🎒'} ${esc(itemTxt(ctx, e))}</li>`));
    return `<ul class="rg-lista">${li.join('')}</ul>`;
  }

  /** Precio real de la oferta en este canal (en la app: el de Google Play; si Play no la tiene, no se ofrece). */
  function precioOferta(ctx, o) {
    try { if (ctx && typeof ctx.precio === 'function') { const v = ctx.precio(o.producto, o.precio); if (v) return String(v); } } catch (e) { /* abajo */ }
    if (st.precioPlay[o.producto]) return st.precioPlay[o.producto];
    if (enApp(ctx)) {
      const GP = root.GooglePlay;
      if (GP && typeof GP.productos === 'function' && st.precioPlay[o.producto] === undefined) {
        st.precioPlay[o.producto] = null;
        Promise.resolve(GP.productos([o.producto])).then((l) => {
          const p = (l || []).find((x) => x && x.id === o.producto);
          if (p && p.precio) { st.precioPlay[o.producto] = String(p.precio); if (hayVentana() && root.document.querySelector('#overlay [data-rg="modal"]')) abrir(ctx, true); }
        }).catch(() => {});
      }
      return null;
    }
    return o.precio ? '$' + Number(o.precio).toFixed(2) : null;
  }

  function htmlOferta(ctx, o) {
    const esc = ctx.esc || escH;
    const valor = precioOferta(ctx, o);
    if (!valor) return '';
    const TL = (t) => { try { return ctx.TL ? ctx.TL(t) : t; } catch (e) { return t; } };
    return `<div class="rg-box rg-of" data-rg="oferta"><span class="rg-chip" style="background:var(--amber)">${esc(T(ctx, 'rg.oferta_t'))}</span>
      <p style="margin:6px 0 2px"><b>${esc(TL(o.nombre))}</b></p>
      ${lista(ctx, o.creditos, o.entregas)}
      ${o.vence ? `<p class="rg-sub">${esc(T(ctx, 'rg.oferta_vence', { fecha: fecha(o.vence) }))}</p>` : ''}
      <button class="btn main" data-act="comprar" data-k="${esc(o.producto)}" data-rg="comprar">${esc(T(ctx, 'rg.comprar', { p: valor }))}</button></div>`;
  }

  /** Ventana «¡Volviste!»: regalo + ventaja (antes de recibir) o la oferta (después). */
  function abrir(ctx, soloRepintar) {
    if (!ctx || typeof ctx.openModal !== 'function') return;
    ponerCss();
    const esc = ctx.esc || escH;
    const d = st.datos || {};
    const a = d.ausencia;
    let cuerpo;
    if (a && a.reclamable) {
      const v = a.ventaja || {};
      cuerpo = `<p>${esc(T(ctx, 'rg.fuera', { n: a.dias }))}</p>
        <span class="rg-chip">${esc(T(ctx, 'rg.nivel', { n: a.nivel }))}</span>
        ${lista(ctx, a.regalo && a.regalo.creditos, a.regalo && a.regalo.entregas)}
        <p class="rg-sub">${esc(T(ctx, 'rg.crece'))}</p>
        <div class="rg-box" data-rg="ventaja">⚡ <b>${esc(T(ctx, 'rg.ventaja_t', { n: v.dias || 3 }))}</b><br>${esc(T(ctx, 'rg.ventaja_txt', { p: v.pago_pct || 25 }))}</div>
        <button class="btn main" data-ext="${ID}" data-acc="reclamar" data-rg="reclamar"${st.ocupado ? ' disabled' : ''}>🎁 ${esc(T(ctx, st.ocupado ? 'rg.recibiendo' : 'rg.recibir'))}</button>`;
    } else {
      const v = d.ventaja;
      const of = d.oferta ? htmlOferta(ctx, d.oferta) : '';
      cuerpo = `${v ? `<div class="rg-box" data-rg="ventaja">⚡ <b>${esc(T(ctx, 'rg.banner_t'))}</b> · ${esc(restante(ctx, v.hasta_ms - Date.now()))}<br>${esc(T(ctx, 'rg.ventaja_txt', { p: v.pago_pct || 25 }))}</div>` : ''}
        ${of}
        <button class="btn" data-act="close" data-rg="seguir">${esc(T(ctx, of ? 'rg.ahora_no' : 'rg.seguir'))}</button>`;
    }
    if (soloRepintar && !hayVentana()) return;
    ctx.openModal(`<div class="rg-modal" data-rg="modal"><div class="row between"><h2>👋 ${esc(T(ctx, 'rg.titulo'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(T(ctx, 'comun.cerrar'))}">✕</button></div>${cuerpo}</div>`);
  }

  async function reclamar(ctx) {
    const a = st.datos && st.datos.ausencia;
    if (!a || st.ocupado) return;
    st.ocupado = true; abrir(ctx, true);
    try {
      const r = await pedir(ctx, 'POST', RUTA + '/reclamar', { id: a.id });
      st.ocupado = false;
      aplicar(ctx, r);
      try { if (ctx.snd) ctx.snd.play('chapter'); } catch (e) { /* nada */ }
      try { ctx.toast(T(ctx, 'rg.listo', { n: (r.ventaja && 3) || 3 })); } catch (e) { /* nada */ }
      try { if (typeof ctx.sincronizar === 'function') await ctx.sincronizar(); } catch (e) { /* se aplica la próxima vez */ }
      aplicar(ctx, r);   // sincronizar vuelve a pintar: la ventaja queda en la partida igual
      abrir(ctx);
    } catch (e) {
      st.ocupado = false;
      if (e && /^regreso_/.test(e.codigo || '')) { st.cargadoEn = 0; await cargar(ctx).catch(() => {}); }
      try { ctx.toast(e && e.message ? e.message : T(ctx, 'err.no_completo')); } catch (x) { /* nada */ }
      if (st.datos && (st.datos.ausencia || st.datos.oferta)) abrir(ctx); else try { ctx.closeModal(); } catch (x) { /* nada */ }
    }
  }

  /** Franja de Inicio: el regalo que espera (si cerró la ventana) o la ventaja mientras dura. */
  function banner(ctx) {
    const s = partida(ctx);
    reloj(s);
    alDia(ctx);
    const esc = ctx.esc || escH;
    const a = st.datos && st.datos.ausencia;
    if (a && a.reclamable && logueado(ctx)) {
      ponerCss();
      // Si al llegar los datos había otra ventana abierta (novedades, guía...), se abre ahora que no hay ninguna
      if (!st.mostrada[a.id] && !hayVentana()) { st.mostrada[a.id] = true; setTimeout(() => { if (!hayVentana()) abrir(ctx); }, 0); }
      return `<div class="rg-card" data-rg="pendiente"><h3 class="rg-t">🎁 ${esc(T(ctx, 'rg.pendiente_t'))}</h3>
        <p class="rg-sub">${esc(T(ctx, 'rg.fuera', { n: a.dias }))}</p>
        <button class="btn main sm" data-ext="${ID}" data-acc="ver" data-rg="ver-regalo">${esc(T(ctx, 'rg.ver_regalo'))}</button></div>`;
    }
    if (!s || !activa(s)) return '';
    ponerCss();
    const r = s.regreso;
    const of = st.datos && st.datos.oferta && precioOferta(ctx, st.datos.oferta);
    return `<div class="rg-card" data-rg="banner"><h3 class="rg-t">⚡ ${esc(T(ctx, 'rg.banner_t'))} · <span style="color:#7fc4ff">${esc(restante(ctx, r.hasta - r.ahora))}</span></h3>
      <p class="rg-sub">${esc(T(ctx, 'rg.banner_txt', { p: r.pago }))}</p>
      ${of ? `<button class="btn sm" data-ext="${ID}" data-acc="ver" data-rg="ver-oferta">🎁 ${esc(T(ctx, 'rg.ver_oferta'))}</button>` : ''}</div>`;
  }

  function clic(ctx, acc) {
    if (acc === 'reclamar') reclamar(ctx);
    else if (acc === 'ver') abrir(ctx);
  }

  root.Regreso = { get datos() { return st.datos; }, cargar: (ctx) => cargar(ctx), activa, ponerVentaja, EXT, abrir: (ctx) => abrir(ctx), invalidar: () => { st.cargadoEn = 0; st.errorEn = 0; } };
  if (root.document || root.EnVivoInicio) {
    root.EnVivoInicio = root.EnVivoInicio || [];
    if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: -9, banner, clic });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Regreso;
})(typeof window !== 'undefined' ? window : globalThis);
