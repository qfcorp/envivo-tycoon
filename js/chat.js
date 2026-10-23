/* =========================================================
   EN VIVO Tycoon — Chat y asociaciones (pantalla)
   Contrato: server/SOCIAL.md. Botón flotante con contador de no leídos; panel con pestañas
   Servidor / Asociación. Mientras el panel está abierto consulta cada 3 s; cerrado, cada 20 s.
   Uso desde ui.js:  Chat.iniciar(ctx)   ctx = { Api, A, toast, snd, ask }
   ========================================================= */
(function (root) {
  'use strict';
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Idiomas (js/i18n.js): T() textos de esta pantalla, TL() textos del servidor (en español)
  const T = (k, p) => (root.I18N ? root.I18N.T(k, p) : k);
  const TL = (t) => (root.I18N ? root.I18N.TL(t) : t);
  // Mensajes rápidos: la clave la entiende el servidor; el texto (chat.rapido.<clave>) es lo que se ve
  const RAPIDOS = ['hola', 'vamos_festival', 'necesito_sonidista', 'buen_trabajo', 'busco_asociacion', 'gracias'];
  const st = { ctx: null, abierto: false, canal: 'servidor', mensajes: { servidor: [], asociacion: [] }, ultimo: { servidor: 0, asociacion: 0 },
    leidos: { servidor: 0, asociacion: 0 }, timer: null, enviando: false, asociaciones: null };

  function css() {
    if (document.getElementById('chat-css')) return;
    const s = document.createElement('style');
    s.id = 'chat-css';
    s.textContent = `
      #chat-btn{position:fixed;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:7;width:52px;height:52px;border-radius:50%;
        background:var(--red);color:#fff;border:0;display:grid;place-items:center;box-shadow:0 6px 18px #0008}
      #chat-btn .ico{width:24px;height:24px}
      #chat-btn b{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--amber);color:#1a1205;font-size:11px;display:grid;place-items:center;padding:0 5px}
      #chat-panel{position:fixed;inset:0;z-index:25;background:var(--bg);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
      #chat-panel[hidden]{display:none}
      .chat-top{display:flex;align-items:center;gap:8px;padding:10px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line)}
      .chat-tabs{display:flex;gap:6px;flex:1}
      .chat-tabs button{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px;font-weight:600}
      .chat-tabs button.on{border-color:var(--red);background:#2a1a1f}
      .chat-lista{flex:1;overflow-y:auto;padding:10px max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:8px}
      .chat-msg{background:var(--panel);border:1px solid var(--line);border-radius:4px 12px 12px 12px;padding:8px 10px;max-width:88%;min-width:0}
      .chat-msg.yo{align-self:flex-end;border-radius:12px 4px 12px 12px;background:#22161a;border-color:#4a2228}
      .chat-msg .quien{font-size:12px;color:var(--amber);font-weight:600}
      .chat-msg .quien span{color:var(--muted);font-weight:400;margin-left:6px}
      .chat-msg p{margin:2px 0 0;font-size:14px;overflow-wrap:anywhere}
      .chat-rapidos{display:flex;gap:6px;overflow-x:auto;padding:6px max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))}
      .chat-rapidos button{flex:none;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-size:12px;white-space:nowrap}
      .chat-form{display:flex;gap:8px;padding:8px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
      .chat-form input{flex:1;min-width:0;font:inherit;font-size:16px;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
      .chat-vacio{color:var(--muted);text-align:center;font-size:13px;margin:auto}`;
    document.head.appendChild(s);
  }

  function noLeidos() {
    return ['servidor', 'asociacion'].reduce((a, c) => a + st.mensajes[c].filter((m) => m.id > st.leidos[c]).length, 0);
  }
  function pintarBoton() {
    const b = document.getElementById('chat-btn');
    if (!b) return;
    const E = st.ctx.Api.estado;
    b.hidden = !(st.ctx.Api.disponible && E && E.logueado);
    const n = st.abierto ? 0 : noLeidos();
    b.innerHTML = st.ctx.A.icon('social') + (n ? `<b>${n > 99 ? '99+' : n}</b>` : '');
  }

  function hora(iso) {
    if (root.I18N) return root.I18N.hora(iso);
    try { return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function pintarLista() {
    const el = document.getElementById('chat-lista');
    if (!el) return;
    const E = st.ctx.Api.estado || {};
    if (st.canal === 'asociacion' && !E.asociacion) { pintarAsociaciones(el); return; }
    const yo = E.jugador ? E.jugador.id : null;
    const ms = st.mensajes[st.canal];
    el.innerHTML = ms.length ? ms.map((m) => `<div class="chat-msg ${m.jugador_id === yo ? 'yo' : ''}" data-msg="${m.id}">
        <div class="quien">${m.siglas ? '[' + esc(m.siglas) + '] ' : ''}${esc(m.alias || T('chat.productora'))}${m.vip ? ' ⭐' : ''}${window.Vip && m.vip_nivel ? ' ' + window.Vip.insignia(m.vip_nivel) : ''}<span>${hora(m.creado)}</span></div>
        <p>${esc(m.texto)}</p></div>`).join('')
      : `<p class="chat-vacio">${st.canal === 'servidor' ? T('chat.vacio_servidor') : T('chat.vacio_asoc')}</p>`;
    el.scrollTop = el.scrollHeight;
    st.leidos[st.canal] = ms.length ? ms[ms.length - 1].id : st.leidos[st.canal];
  }

  async function pintarAsociaciones(el) {
    el.innerHTML = `<p class="chat-vacio">${T('chat.buscando')}</p>`;
    let lista = [];
    try { const r = await st.ctx.Api.asociaciones(''); lista = r.asociaciones || []; } catch (e) { el.innerHTML = `<p class="chat-vacio">${esc(TL(e.message))}</p>`; return; }
    if (st.canal !== 'asociacion') return;
    el.innerHTML = `<div class="card"><h3>${T('chat.unete')}</h3><p class="small muted">${T('chat.unete_det')}</p>
        <button class="btn main" data-chat="crear">${T('chat.crear_asoc')}</button></div>
      ${lista.map((a) => `<div class="card"><div class="row between"><div><b style="color:${/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : 'var(--amber)'}">[${esc(a.siglas)}]</b> <b>${esc(a.nombre)}</b>
          <div class="small muted">${T('chat.socios', { n: a.miembros || 0, max: 20 })} · ${a.ingreso === 'abierto' ? T('chat.entrada_libre') : T('chat.con_solicitud')}</div></div>
          <button class="btn sm" data-chat="unirse" data-id="${a.id}">${a.ingreso === 'abierto' ? T('chat.unirme') : T('chat.pedir_entrar')}</button></div></div>`).join('')
      || `<p class="chat-vacio">${T('chat.sin_asoc')}</p>`}`;
  }

  async function consultar(canal) {
    const E = st.ctx.Api.estado;
    if (!E || !E.logueado) return false;
    if (canal === 'asociacion' && !E.asociacion) return false;
    try {
      const r = await st.ctx.Api.chat(canal, st.ultimo[canal]);
      const nuevos = (r.mensajes || []).filter((m) => m.id > st.ultimo[canal]);
      if (!nuevos.length) return false;
      st.mensajes[canal] = st.mensajes[canal].concat(nuevos).slice(-150);
      st.ultimo[canal] = st.mensajes[canal][st.mensajes[canal].length - 1].id;
      return true;
    } catch (e) { return false; }
  }

  async function ciclo() {
    clearTimeout(st.timer);
    const E = st.ctx.Api.estado;
    if (st.ctx.Api.disponible && E && E.logueado && document.visibilityState !== 'hidden') {
      const cambios = await Promise.all([consultar('servidor'), consultar('asociacion')]);
      if (st.abierto && cambios.some(Boolean)) pintarLista();
      pintarBoton();
    } else pintarBoton();
    st.timer = setTimeout(ciclo, st.abierto ? 3000 : 20000);
  }

  function abrir() {
    st.abierto = true;
    const p = document.getElementById('chat-panel');
    p.hidden = false;
    p.querySelectorAll('[data-chat-tab]').forEach((b) => b.classList.toggle('on', b.dataset.chatTab === st.canal));
    const conChat = !(st.canal === 'asociacion' && !(st.ctx.Api.estado || {}).asociacion);
    p.querySelector('.chat-form').hidden = !conChat;
    p.querySelector('.chat-rapidos').hidden = !conChat;
    pintarLista(); pintarBoton(); ciclo();
  }
  function cerrar() { st.abierto = false; document.getElementById('chat-panel').hidden = true; pintarBoton(); ciclo(); }

  async function enviar(texto, rapido) {
    if (st.enviando) return;
    st.enviando = true;
    try {
      if (rapido) await st.ctx.Api.mensajeRapido(st.canal, rapido);
      else await st.ctx.Api.escribir(st.canal, texto);
      document.getElementById('chat-texto').value = '';
      await consultar(st.canal); pintarLista();
    } catch (e) { st.ctx.toast(TL(e.message)); st.ctx.snd.play('error'); }
    st.enviando = false;
  }

  function construir() {
    css();
    const b = document.createElement('button');
    b.id = 'chat-btn'; b.hidden = true; b.setAttribute('aria-label', T('chat.abrir'));
    b.onclick = abrir;
    document.body.appendChild(b);
    const p = document.createElement('div');
    p.id = 'chat-panel'; p.hidden = true;
    p.innerHTML = `<div class="chat-top"><div class="chat-tabs"><button data-chat-tab="servidor" data-i18n="chat.servidor">${T('chat.servidor')}</button><button data-chat-tab="asociacion" data-i18n="chat.asociacion">${T('chat.asociacion')}</button></div>
        <button class="btn sm" data-chat="cerrar" aria-label="${esc(T('chat.cerrar'))}" data-i18n-aria="chat.cerrar">${st.ctx.A.icon('close', 'sm')}</button></div>
      <div class="chat-lista" id="chat-lista"></div>
      <div class="chat-rapidos">${RAPIDOS.map((k) => `<button data-chat="rapido" data-k="${k}" data-i18n="chat.rapido.${k}">${esc(T('chat.rapido.' + k))}</button>`).join('')}</div>
      <form class="chat-form" id="chat-form"><input id="chat-texto" maxlength="300" autocomplete="off" placeholder="${esc(T('chat.escribe'))}" aria-label="${esc(T('chat.mensaje'))}" data-i18n-ph="chat.escribe" data-i18n-aria="chat.mensaje">
        <button class="btn sm main" type="submit" data-i18n="chat.enviar">${T('chat.enviar')}</button></form>`;
    document.body.appendChild(p);
    p.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-chat-tab]');
      if (t) { st.canal = t.dataset.chatTab; abrir(); return; }
      const a = ev.target.closest('[data-chat]');
      if (a) {
        const k = a.dataset.chat;
        if (k === 'cerrar') cerrar();
        else if (k === 'rapido') enviar('', a.dataset.k);
        else if (k === 'unirse') st.ctx.Api.unirse(Number(a.dataset.id)).then(async (r) => { await st.ctx.Api.refrescar(); st.ctx.toast(r.mensaje ? TL(r.mensaje) : T('chat.listo')); abrir(); }).catch((e) => st.ctx.toast(TL(e.message)));
        else if (k === 'crear') crearAsociacion();
        return;
      }
      const m = ev.target.closest('[data-msg]');
      if (m && !m.classList.contains('yo')) opcionesMensaje(Number(m.dataset.msg));
    });
    p.querySelector('#chat-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = document.getElementById('chat-texto').value.trim();
      if (v) enviar(v);
    });
  }

  function crearAsociacion() {
    const nombre = prompt === undefined ? null : null;   // el visor no permite prompt(): se usa un formulario propio
    void nombre;
    const el = document.getElementById('chat-lista');
    const dinero = (n) => (root.I18N ? root.I18N.money(n) : '$' + n);
    el.innerHTML = `<form class="card" id="form-asoc"><h3>${T('chat.nueva_asoc')}</h3>
        <label class="field">${T('chat.asoc_nombre', { min: 3, max: 30 })}<input id="as-nombre" maxlength="30" required></label>
        <label class="field">${T('chat.asoc_siglas', { n: 3 })}<input id="as-siglas" maxlength="3" required style="text-transform:uppercase"></label>
        <label class="field">${T('chat.asoc_color')}<input id="as-color" type="color" value="#ff3b3b"></label>
        <p class="small muted">${T('chat.asoc_costo', { m: dinero(5000) })}</p>
        <button class="btn main" type="submit">${T('chat.crear')}</button></form>`;
    el.querySelector('#form-asoc').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const vip = (st.ctx.Api.estado || {}).vip_activo;
        if (!vip && st.ctx.pagarAsociacion && !st.ctx.pagarAsociacion(5000)) return;
        await st.ctx.Api.crearAsociacion({ nombre: el.querySelector('#as-nombre').value.trim(), siglas: el.querySelector('#as-siglas').value.trim().toUpperCase(),
          color: el.querySelector('#as-color').value, pagado_en_juego: !vip });
        await st.ctx.Api.refrescar();
        st.ctx.toast(T('chat.asoc_creada')); st.ctx.snd.play('chapter');
        abrir();
      } catch (e) { st.ctx.toast(TL(e.message)); st.ctx.snd.play('error'); }
    });
  }

  function opcionesMensaje(id) {
    const m = st.mensajes[st.canal].find((x) => x.id === id);
    if (!m) return;
    st.ctx.ask(T('chat.reportar_q', { nombre: `<b>${esc(m.alias || T('chat.productora'))}</b>`, texto: esc(m.texto) }), T('chat.reportar_si'), async () => {
      try { await st.ctx.Api.reportar(id, 'ofensivo'); await st.ctx.Api.bloquear(m.jugador_id); st.mensajes[st.canal] = st.mensajes[st.canal].filter((x) => x.jugador_id !== m.jugador_id); st.ctx.toast(T('chat.reportado')); }
      catch (e) { st.ctx.toast(TL(e.message)); }
      abrir();
    });
  }

  root.Chat = {
    iniciar(ctx) {
      if (st.ctx) { st.ctx = ctx; pintarBoton(); return; }
      st.ctx = ctx;
      construir();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(); });
      ciclo();
    },
    refrescar() {
      if (!st.ctx) return;
      // Textos fijos del panel (por si cambió el idioma)
      const p = document.getElementById('chat-panel');
      if (p && root.I18N && root.I18N.aplicar) root.I18N.aplicar(p);
      const b = document.getElementById('chat-btn');
      if (b) b.setAttribute('aria-label', T('chat.abrir'));
      pintarBoton(); if (st.abierto) abrir();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
