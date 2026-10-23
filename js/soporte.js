/* =========================================================
   EN VIVO Tycoon — Soporte dentro del juego (pantalla)
   Contrato: server/SOPORTE.md. Lista de casos, crear caso, conversación y contacto directo.
   Uso desde ui.js:  Soporte.abrir(ctx)   ctx = { Api, A, estado(), toast, snd, openModal, closeModal }
   Textos: usa I18N si existe (claves soporte.*) y si no, el español de aquí.
   ========================================================= */
(function (root) {
  'use strict';
  const ES = {
    'soporte.titulo': 'Ayuda y soporte', 'soporte.nuevo': 'Escribir a soporte', 'soporte.mis_casos': 'Tus casos',
    'soporte.vacio': 'No tienes casos abiertos. Si algo salió mal con una compra o tu cuenta, escríbenos.',
    'soporte.entrar': 'Entra a tu cuenta para escribir a soporte.', 'soporte.contacto': 'También puedes escribirnos',
    'soporte.categoria': '¿De qué se trata?', 'soporte.asunto': 'Asunto', 'soporte.mensaje': 'Cuéntanos qué pasó',
    'soporte.compra': 'Compra relacionada (opcional)', 'soporte.ninguna': 'Ninguna', 'soporte.enviar': 'Enviar',
    'soporte.responder': 'Responder', 'soporte.enviado': 'Listo. Te responderemos aquí mismo.',
    'soporte.tu': 'Tú', 'soporte.equipo': 'Soporte', 'soporte.volver': 'Volver', 'soporte.cerrar': 'Cerrar',
    'soporte.estado.abierto': 'Abierto', 'soporte.estado.respondido': 'Respondido', 'soporte.estado.cerrado': 'Cerrado',
    'soporte.cat.pago': 'Un pago o compra', 'soporte.cat.cuenta': 'Mi cuenta', 'soporte.cat.error': 'Un error del juego',
    'soporte.cat.sugerencia': 'Una sugerencia', 'soporte.cat.reporte': 'Reportar a un jugador', 'soporte.cat.otro': 'Otra cosa',
    'soporte.falta': 'Escribe el asunto y el mensaje.', 'soporte.horario': 'Horario: {horario}',
    'soporte.nuevas': '{n} respuesta(s) nueva(s) de soporte',
  };
  const T = (k, p) => {
    try { if (root.I18N && root.I18N.T && (!root.I18N.T.has || root.I18N.T.has(k))) return root.I18N.T(k, p); } catch (e) { /* español */ }
    return String(ES[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  };
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CATS = ['pago', 'cuenta', 'error', 'sugerencia', 'reporte', 'otro'];
  let ctx = null, casos = [], contacto = null, vista = 'lista', casoId = null;

  async function pedir(method, ruta, body) {
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1' };
    try { if (root.I18N && root.I18N.idioma) h['X-Envivo-Idioma'] = root.I18N.idioma; } catch (e) { /* nada */ }
    const r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) throw new Error((j && j.error) || 'No se pudo completar. Intenta de nuevo.');
    return j;
  }
  function diagnostico() {
    const s = ctx.estado ? ctx.estado() : null;
    return {
      version: (root.Game && root.Game.SAVE_VERSION) || null, dia: s ? s.day : null, capitulo: s ? s.chapter + 1 : null,
      dinero: s ? Math.round(s.money) : null, idioma: (root.I18N && root.I18N.idioma) || navigator.language,
      pantalla: `${innerWidth}x${innerHeight}`, navegador: String(navigator.userAgent).slice(0, 180),
    };
  }
  const fecha = (iso) => { try { return new Date(iso).toLocaleString((root.I18N && root.I18N.idioma) || 'es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  async function cargar() {
    try { const r = await pedir('GET', '/api/soporte'); casos = r.casos || []; } catch (e) { casos = []; }
    if (!contacto) { try { contacto = await pedir('GET', '/api/soporte/contacto'); } catch (e) { contacto = {}; } }
  }

  function bloqueContacto() {
    if (!contacto || !contacto.correo) return '';
    return `<div class="card small"><b>${esc(T('soporte.contacto'))}</b>
      ${contacto.correo ? `<p style="margin:6px 0">Correo: <span style="user-select:all">${esc(contacto.correo)}</span></p>` : ''}
      ${contacto.horario ? `<p class="muted" style="margin:6px 0">${esc(T('soporte.horario', { horario: contacto.horario }))}</p>` : ''}</div>`;
  }

  function pintar() {
    const E = ctx.Api.estado || {};
    const cab = `<div class="row between"><h2>${esc(T('soporte.titulo'))}</h2><button class="btn sm" data-sop="cerrar" aria-label="${esc(T('soporte.cerrar'))}">${ctx.A.icon('close', 'sm')}</button></div>`;
    if (!E.logueado) { ctx.openModal(`${cab}<p class="small muted">${esc(T('soporte.entrar'))}</p>${bloqueContacto()}`); return; }
    if (vista === 'nuevo') {
      const compras = (E.compras_recientes || []);
      ctx.openModal(`${cab}<form id="sop-form">
        <label class="field">${esc(T('soporte.categoria'))}<select id="sop-cat">${CATS.map((c) => `<option value="${c}">${esc(T('soporte.cat.' + c))}</option>`).join('')}</select></label>
        ${compras.length ? `<label class="field">${esc(T('soporte.compra'))}<select id="sop-compra"><option value="">${esc(T('soporte.ninguna'))}</option>${compras.map((c) => `<option value="${c.id}">#${c.id} · ${esc(c.producto)} · ${esc(fecha(c.creado))}</option>`).join('')}</select></label>` : ''}
        <label class="field">${esc(T('soporte.asunto'))}<input id="sop-asunto" maxlength="80" required></label>
        <label class="field">${esc(T('soporte.mensaje'))}<textarea id="sop-msg" maxlength="2000" rows="5" required style="font:inherit;font-size:16px;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px"></textarea></label>
        <button class="btn main" type="submit">${esc(T('soporte.enviar'))}</button></form>
        <button class="btn" data-sop="lista">${esc(T('soporte.volver'))}</button>`);
      document.getElementById('sop-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const asunto = document.getElementById('sop-asunto').value.trim(), msg = document.getElementById('sop-msg').value.trim();
        if (!asunto || !msg) { ctx.toast(T('soporte.falta')); return; }
        const sc = document.getElementById('sop-compra');
        try {
          await pedir('POST', '/api/soporte', { categoria: document.getElementById('sop-cat').value, asunto, mensaje: msg,
            compra_id: sc && sc.value ? Number(sc.value) : null, diagnostico: diagnostico() });
          ctx.toast(T('soporte.enviado')); ctx.snd.play('logo');
          await cargar(); vista = 'lista'; pintar();
        } catch (e) { ctx.toast(e.message); ctx.snd.play('error'); }
      });
      return;
    }
    if (vista === 'caso') {
      const c = casos.find((x) => x.id === casoId);
      if (!c) { vista = 'lista'; pintar(); return; }
      ctx.openModal(`${cab}<p class="small muted">#${c.id} · ${esc(T('soporte.cat.' + c.categoria))} · ${esc(T('soporte.estado.' + c.estado))}</p><h3>${esc(c.asunto)}</h3>
        ${(c.mensajes || []).map((m) => `<div class="card small" style="${m.autor === 'soporte' ? 'border-color:var(--amber)' : ''}">
          <b>${esc(m.autor === 'soporte' ? T('soporte.equipo') : T('soporte.tu'))}</b> <span class="muted">${esc(fecha(m.creado))}</span>
          <p style="margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.texto)}</p></div>`).join('')}
        ${c.estado !== 'cerrado' ? `<form id="sop-resp"><label class="field">${esc(T('soporte.responder'))}<textarea id="sop-rmsg" maxlength="2000" rows="3" required style="font:inherit;font-size:16px;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px"></textarea></label>
          <button class="btn main" type="submit">${esc(T('soporte.enviar'))}</button></form>` : ''}
        <button class="btn" data-sop="lista">${esc(T('soporte.volver'))}</button>`);
      if (c.sin_leer) pedir('POST', '/api/soporte/leido', { caso_id: c.id }).catch(() => {});
      const f = document.getElementById('sop-resp');
      if (f) f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const t = document.getElementById('sop-rmsg').value.trim();
        if (!t) return;
        try { await pedir('POST', '/api/soporte/responder', { caso_id: c.id, mensaje: t }); await cargar(); pintar(); }
        catch (e) { ctx.toast(e.message); }
      });
      return;
    }
    ctx.openModal(`${cab}
      <button class="btn main" data-sop="nuevo">${ctx.A.icon('social')}${esc(T('soporte.nuevo'))}</button>
      <div class="sectitle">${esc(T('soporte.mis_casos'))}</div>
      ${casos.map((c) => `<button class="btn" data-sop="caso" data-id="${c.id}" style="text-align:left">
          ${c.sin_leer ? '<span class="badge">' + c.sin_leer + '</span> ' : ''}<b>${esc(c.asunto)}</b><br>
          <span class="small muted">#${c.id} · ${esc(T('soporte.estado.' + c.estado))} · ${esc(fecha(c.actualizado || c.creado))}</span></button>`).join('')
        || `<p class="small muted">${esc(T('soporte.vacio'))}</p>`}
      ${bloqueContacto()}`);
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sop]');
    if (!b || !ctx) return;
    const a = b.dataset.sop;
    if (a === 'cerrar') { ctx.closeModal(); return; }
    if (a === 'nuevo') { vista = 'nuevo'; pintar(); return; }
    if (a === 'lista') { vista = 'lista'; pintar(); return; }
    if (a === 'caso') { vista = 'caso'; casoId = Number(b.dataset.id); pintar(); }
  });

  root.Soporte = {
    ES,
    async abrir(c) { ctx = c; vista = 'lista'; await cargar(); pintar(); },
    sinLeer() { return (ctx && ctx.Api.estado && ctx.Api.estado.soporte_sin_leer) || 0; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
