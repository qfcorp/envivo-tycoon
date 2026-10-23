/* =========================================================
   EN VIVO Tycoon — Mercado entre jugadores (pantalla)
   Reglas: server/MERCADO.md. El servidor decide todo (precios, dueños, créditos);
   esta pantalla solo muestra y pide. Se usa desde ui.js:
     Mercado.render(elemento, ctx)   ctx = { Api, G, Pm, A, estado(), toast, ask, openModal, closeModal, sincronizar, snd }
   ========================================================= */
(function (root) {
  'use strict';
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('es-EC');
  const serie = (n) => (n ? ' #' + String(n).padStart(4, '0') : '');
  let filtro = '', orden = 'precio', datos = null, cargando = false, error = '';

  function nombre(ctx, item) { const it = ctx.G.CATALOG[item]; return it ? it.name : item; }
  function dibujo(ctx, item) {
    try { if (ctx.A.item) return ctx.A.item(item, 64); } catch (e) { /* sin ilustración */ }
    return `<div class="tile t-amber">${ctx.A.icon(item)}</div>`;
  }
  function vence(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return 'vence pronto';
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24;
    return d > 0 ? `vence en ${d} d ${h} h` : `vence en ${h} h`;
  }

  async function cargar(ctx, el) {
    if (cargando) return;
    cargando = true; error = '';
    try { datos = await ctx.Api.mercado(filtro, orden); } catch (e) { error = e.message; }
    cargando = false;
    pintar(ctx, el);
  }

  function tarjeta(ctx, p, mia) {
    const st = datos && datos.precios && datos.precios[p.item];
    return `<div class="card prod"><div class="row">${dibujo(ctx, p.item)}
        <div class="grow"><h3>${esc(nombre(ctx, p.item))}<span class="muted small">${serie(p.serie)}</span></h3>
          <div class="small muted">${mia ? 'Tu publicación' : 'Vende ' + esc(p.vendedor)} · ${vence(p.vence)}</div>
          ${st && st.ultimo ? `<div class="small muted">Última venta: ${num(st.ultimo)} créditos</div>` : ''}</div></div>
      <div class="row between" style="margin-top:10px"><span class="cr">${ctx.A.icon('gem', 'sm')} ${num(p.precio)}</span>
        ${mia ? `<button class="btn sm" data-merc="retirar" data-id="${p.id}">Retirar</button>`
              : `<button class="btn sm main" data-merc="comprar" data-id="${p.id}" ${datos.puede ? '' : 'disabled'}>Comprar</button>`}</div></div>`;
  }

  function pintar(ctx, el) {
    const E = ctx.Api.estado || {};
    if (!E.logueado) { el.innerHTML = '<div class="card muted">Entra a tu cuenta para ver el mercado.</div>'; return; }
    if (!datos && !error) { el.innerHTML = '<div class="card muted">Abriendo el mercado…</div>'; cargar(ctx, el); return; }
    if (error) {
      el.innerHTML = `<div class="card"><p class="small neg">${esc(error)}</p><button class="btn sm" data-merc="recargar">Intentar de nuevo</button></div>`;
      return;
    }
    const tipos = Object.keys(ctx.G.CATALOG).filter((k) => ctx.G.CATALOG[k].premium);
    const s = ctx.estado();
    const vendibles = s.equip.filter((e) => e.srvId !== undefined && !(s.currentEvent && s.currentEvent.equipIds.includes(e.id)));
    const ajenas = (datos.publicaciones || []).filter((p) => !p.mia);
    el.innerHTML = `
      ${datos.puede ? '' : `<div class="card" style="border-color:var(--amber)"><p class="small">${ctx.A.icon('lock', 'sm')} ${esc(datos.motivo || 'Compra cualquier paquete de créditos para comprar y vender en el mercado.')}</p></div>`}
      <div class="card">
        <label class="field">Equipo<select id="merc-filtro"><option value="">Todos</option>${tipos.map((k) => `<option value="${k}" ${k === filtro ? 'selected' : ''}>${esc(nombre(ctx, k))}</option>`).join('')}</select></label>
        <label class="field">Ordenar<select id="merc-orden"><option value="precio" ${orden === 'precio' ? 'selected' : ''}>Más barato primero</option><option value="reciente" ${orden === 'reciente' ? 'selected' : ''}>Más reciente</option></select></label>
        <p class="small muted">Comisión del mercado: ${Math.round((datos.comision || 0.05) * 100)} %. Los créditos no se cambian por dinero real.</p>
      </div>
      <div class="sectitle">En venta (${ajenas.length})</div>
      ${ajenas.map((p) => tarjeta(ctx, p, false)).join('') || '<div class="card muted small">Nadie está vendiendo este equipo ahora. Vuelve más tarde.</div>'}
      <div class="sectitle">Tus publicaciones (${(datos.mis_publicaciones || []).length}/10)</div>
      ${(datos.mis_publicaciones || []).map((p) => tarjeta(ctx, p, true)).join('') || '<div class="card muted small">No tienes equipos a la venta.</div>'}
      <div class="sectitle">Vender un equipo tuyo</div>
      ${vendibles.map((e) => `<div class="card"><div class="row">${dibujo(ctx, e.type)}
          <div class="grow"><b>${esc(nombre(ctx, e.type))}</b><span class="muted small">${serie(e.serie)}</span></div>
          <button class="btn sm" data-merc="publicar" data-id="${e.srvId}" ${datos.puede ? '' : 'disabled'}>Publicar</button></div></div>`).join('')
        || '<div class="card muted small">Solo se venden los equipos exclusivos y VIP que viven en tu cuenta.</div>'}`;
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
      if (cr < p.precio) { ctx.toast(`Te faltan ${num(p.precio - cr)} créditos.`); ctx.snd.play('error'); return; }
      ctx.ask(`¿Comprar <b>${esc(nombre(ctx, p.item))}${serie(p.serie)}</b> por ${num(p.precio)} créditos?<br><span class="small muted">Te quedarán ${num(cr - p.precio)} créditos.</span>`, 'Sí, comprar', async () => {
        try { await ctx.Api.comprarMercado(id); ctx.snd.play('buy'); await despues(ctx, el, '¡Compra hecha! El equipo llegó a tu bodega.'); }
        catch (e) { ctx.toast(e.message); ctx.snd.play('error'); datos = null; pintar(ctx, el); }
      });
      return;
    }
    if (acc === 'retirar') {
      ctx.ask('¿Retirar esta publicación? El equipo vuelve a tu bodega.', 'Sí, retirar', async () => {
        try { await ctx.Api.retirar(id); await despues(ctx, el, 'El equipo volvió a tu bodega.'); } catch (e) { ctx.toast(e.message); }
      });
      return;
    }
    if (acc === 'publicar') {
      const e = ctx.estado().equip.find((x) => x.srvId === id);
      if (!e) return;
      const st = datos.precios && datos.precios[e.type];
      const sug = (st && (st.minimo_publicado || st.ultimo)) || 100;
      ctx.openModal(`<h2>Vender ${esc(nombre(ctx, e.type))}${serie(e.serie)}</h2>
        <label class="field">Precio en créditos (10 a 100.000)<input id="merc-precio" type="number" inputmode="numeric" min="10" max="100000" step="1" value="${sug}"></label>
        <p class="small muted" id="merc-recibes"></p>
        <p class="small muted">Mientras esté publicado, el equipo sale de tu bodega. Si en 7 días nadie lo compra, vuelve solo.</p>
        <button class="btn main" data-merc="confirmar-publicar" data-id="${id}">Publicar</button>
        <button class="btn" data-act="close">Cancelar</button>`);
      const inp = document.getElementById('merc-precio'), rec = document.getElementById('merc-recibes');
      const upd = () => { const v = Math.floor(Number(inp.value) || 0); rec.textContent = v >= 10 ? `Recibirás ${num(Math.floor(v * (1 - (datos.comision || 0.05))))} créditos si se vende.` : 'Mínimo 10 créditos.'; };
      inp.oninput = upd; upd();
      return;
    }
    if (acc === 'confirmar-publicar') {
      const v = Math.floor(Number(document.getElementById('merc-precio').value) || 0);
      if (v < 10 || v > 100000) { ctx.toast('El precio debe estar entre 10 y 100.000 créditos.'); return; }
      ctx.Api.publicar(id, v).then(async () => { ctx.closeModal(); ctx.snd.play('logo'); await despues(ctx, el, 'Tu equipo ya está a la venta.'); })
        .catch((err) => ctx.toast(err.message));
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
