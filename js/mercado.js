/* =========================================================
   EN VIVO Tycoon — Mercado entre jugadores (pantalla)
   Reglas: server/MERCADO.md. El servidor decide todo (precios, dueños, créditos);
   esta pantalla solo muestra y pide. Se usa desde ui.js:
     Mercado.render(elemento, ctx)   ctx = { Api, G, Pm, A, estado(), toast, ask, openModal, closeModal, sincronizar, snd }
   ========================================================= */
(function (root) {
  'use strict';
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Idiomas (js/i18n.js): T() textos de esta pantalla, TL() textos del servidor o de la lógica (en español)
  const T = (k, p) => (root.I18N ? root.I18N.T(k, p) : k);
  const TL = (t) => (root.I18N ? root.I18N.TL(t) : t);
  const num = (n) => (root.I18N ? root.I18N.num(n || 0) : Number(n || 0).toLocaleString('es-EC'));
  const serie = (n) => (n ? ' #' + String(n).padStart(4, '0') : '');
  let filtro = '', orden = 'precio', datos = null, cargando = false, error = '';

  function nombre(ctx, item) { const it = ctx.G.CATALOG[item]; return TL(it ? it.name : item); }
  function dibujo(ctx, item) {
    try { if (ctx.A.item) return ctx.A.item(item, 64); } catch (e) { /* sin ilustración */ }
    return `<div class="tile t-amber">${ctx.A.icon(item)}</div>`;
  }
  function vence(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return T('mercado.vence_pronto');
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24;
    return d > 0 ? T('mercado.vence_dh', { d, h }) : T('mercado.vence_h', { h });
  }

  async function cargar(ctx, el) {
    if (cargando) return;
    cargando = true; error = '';
    try { datos = await ctx.Api.mercado(filtro, orden); } catch (e) { error = TL(e.message); }
    cargando = false;
    pintar(ctx, el);
  }

  function tarjeta(ctx, p, mia) {
    const st = datos && datos.precios && datos.precios[p.item];
    return `<div class="card prod"><div class="row">${dibujo(ctx, p.item)}
        <div class="grow"><h3>${esc(nombre(ctx, p.item))}<span class="muted small">${serie(p.serie)}</span></h3>
          <div class="small muted">${mia ? T('mercado.tu_publicacion') : T('mercado.vende', { nombre: esc(p.vendedor) })} · ${vence(p.vence)}</div>
          ${st && st.ultimo ? `<div class="small muted">${T('mercado.ultima_venta', { n: st.ultimo })}</div>` : ''}</div></div>
      <div class="row between" style="margin-top:10px"><span class="cr">${ctx.A.icon('gem', 'sm')} ${num(p.precio)}</span>
        ${mia ? `<button class="btn sm" data-merc="retirar" data-id="${p.id}">${T('mercado.retirar')}</button>`
              : `<button class="btn sm main" data-merc="comprar" data-id="${p.id}" ${datos.puede ? '' : 'disabled'}>${T('tienda.comprar')}</button>`}</div></div>`;
  }

  function pintar(ctx, el) {
    const E = ctx.Api.estado || {};
    if (!E.logueado) { el.innerHTML = `<div class="card muted">${T('mercado.entra')}</div>`; return; }
    if (!datos && !error) { el.innerHTML = `<div class="card muted">${T('mercado.abriendo')}</div>`; cargar(ctx, el); return; }
    if (error) {
      el.innerHTML = `<div class="card"><p class="small neg">${esc(error)}</p><button class="btn sm" data-merc="recargar">${T('comun.reintentar')}</button></div>`;
      return;
    }
    const tipos = Object.keys(ctx.G.CATALOG).filter((k) => ctx.G.CATALOG[k].premium);
    const s = ctx.estado();
    const vendibles = s.equip.filter((e) => e.srvId !== undefined && !(s.currentEvent && s.currentEvent.equipIds.includes(e.id)));
    const ajenas = (datos.publicaciones || []).filter((p) => !p.mia);
    el.innerHTML = `
      ${datos.puede ? '' : `<div class="card" style="border-color:var(--amber)"><p class="small">${ctx.A.icon('lock', 'sm')} ${esc(datos.motivo ? TL(datos.motivo) : T('mercado.motivo'))}</p></div>`}
      <div class="card">
        <label class="field">${T('mercado.equipo')}<select id="merc-filtro"><option value="">${T('mercado.todos')}</option>${tipos.map((k) => `<option value="${k}" ${k === filtro ? 'selected' : ''}>${esc(nombre(ctx, k))}</option>`).join('')}</select></label>
        <label class="field">${T('mercado.ordenar')}<select id="merc-orden"><option value="precio" ${orden === 'precio' ? 'selected' : ''}>${T('mercado.mas_barato')}</option><option value="reciente" ${orden === 'reciente' ? 'selected' : ''}>${T('mercado.mas_reciente')}</option></select></label>
        <p class="small muted">${T('mercado.comision', { n: Math.round((datos.comision || 0.05) * 100) })}</p>
      </div>
      <div class="sectitle">${T('mercado.en_venta', { n: ajenas.length })}</div>
      ${ajenas.map((p) => tarjeta(ctx, p, false)).join('') || `<div class="card muted small">${T('mercado.nadie')}</div>`}
      <div class="sectitle">${T('mercado.tus_publicaciones', { n: (datos.mis_publicaciones || []).length, max: 10 })}</div>
      ${(datos.mis_publicaciones || []).map((p) => tarjeta(ctx, p, true)).join('') || `<div class="card muted small">${T('mercado.sin_publicaciones')}</div>`}
      <div class="sectitle">${T('mercado.vender_tuyo')}</div>
      ${vendibles.map((e) => `<div class="card"><div class="row">${dibujo(ctx, e.type)}
          <div class="grow"><b>${esc(nombre(ctx, e.type))}</b><span class="muted small">${serie(e.serie)}</span></div>
          <button class="btn sm" data-merc="publicar" data-id="${e.srvId}" ${datos.puede ? '' : 'disabled'}>${T('mercado.publicar')}</button></div></div>`).join('')
        || `<div class="card muted small">${T('mercado.solo_exclusivos')}</div>`}`;
    const f = el.querySelector('#merc-filtro'), o = el.querySelector('#merc-orden');
    if (f) f.onchange = () => { filtro = f.value; datos = null; pintar(ctx, el); };
    if (o) o.onchange = () => { orden = o.value; datos = null; pintar(ctx, el); };
  }

  async function despues(ctx, el, msg) {
    try { await ctx.Api.refrescar(); } catch (e) { /* se reintenta al volver */ }
    ctx.sincronizar();
    if (msg) ctx.toast(msg);
    datos = null; pintar(ctx, el);
  }

  function clic(ctx, el, b) {
    const acc = b.dataset.merc, id = Number(b.dataset.id);
    if (acc === 'recargar') { datos = null; error = ''; pintar(ctx, el); return; }
    if (acc === 'comprar') {
      const p = (datos.publicaciones || []).find((x) => x.id === id);
      if (!p) return;
      const cr = (ctx.Api.estado || {}).creditos || 0;
      if (cr < p.precio) { ctx.toast(T('tienda.faltan_n', { n: p.precio - cr })); ctx.snd.play('error'); return; }
      ctx.ask(`${T('mercado.comprar_q', { item: `<b>${esc(nombre(ctx, p.item))}${serie(p.serie)}</b>`, n: p.precio })}<br><span class="small muted">${T('mercado.te_quedan', { n: cr - p.precio })}</span>`, T('mercado.comprar_si'), async () => {
        try { await ctx.Api.comprarMercado(id); ctx.snd.play('buy'); await despues(ctx, el, T('mercado.compra_hecha')); }
        catch (e) { ctx.toast(TL(e.message)); ctx.snd.play('error'); datos = null; pintar(ctx, el); }
      });
      return;
    }
    if (acc === 'retirar') {
      ctx.ask(T('mercado.retirar_q'), T('mercado.retirar_si'), async () => {
        try { await ctx.Api.retirar(id); await despues(ctx, el, T('mercado.retirado')); } catch (e) { ctx.toast(TL(e.message)); }
      });
      return;
    }
    if (acc === 'publicar') {
      const e = ctx.estado().equip.find((x) => x.srvId === id);
      if (!e) return;
      const st = datos.precios && datos.precios[e.type];
      const sug = (st && (st.minimo_publicado || st.ultimo)) || 100;
      ctx.openModal(`<h2>${T('mercado.vender_t', { item: esc(nombre(ctx, e.type)) + serie(e.serie) })}</h2>
        <label class="field">${T('mercado.precio_lbl', { min: 10, max: 100000 })}<input id="merc-precio" type="number" inputmode="numeric" min="10" max="100000" step="1" value="${sug}"></label>
        <p class="small muted" id="merc-recibes"></p>
        <p class="small muted">${T('mercado.publicar_det', { n: 7 })}</p>
        <button class="btn main" data-merc="confirmar-publicar" data-id="${id}">${T('mercado.publicar')}</button>
        <button class="btn" data-act="close">${T('comun.cancelar')}</button>`);
      const inp = document.getElementById('merc-precio'), rec = document.getElementById('merc-recibes');
      const upd = () => { const v = Math.floor(Number(inp.value) || 0); rec.textContent = v >= 10 ? T('mercado.recibiras', { n: Math.floor(v * (1 - (datos.comision || 0.05))) }) : T('mercado.minimo', { n: 10 }); };
      inp.oninput = upd; upd();
      return;
    }
    if (acc === 'confirmar-publicar') {
      const v = Math.floor(Number(document.getElementById('merc-precio').value) || 0);
      if (v < 10 || v > 100000) { ctx.toast(T('mercado.precio_rango', { min: 10, max: 100000 })); return; }
      ctx.Api.publicar(id, v).then(async () => { ctx.closeModal(); ctx.snd.play('logo'); await despues(ctx, el, T('mercado.publicado')); })
        .catch((err) => ctx.toast(TL(err.message)));
    }
  }

  root.Mercado = {
    render(el, ctx) {
      pintar(ctx, el);
      el.onclick = (ev) => { const b = ev.target.closest('[data-merc]'); if (b && !b.disabled && el.contains(b)) clic(ctx, el, b); };
    },
    // El botón de confirmar está en la ventana (fuera del elemento): ui.js reenvía estos clics
    clicVentana(ctx, el, b) { clic(ctx, el, b); },
    invalidar() { datos = null; error = ''; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
