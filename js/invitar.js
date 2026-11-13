/* =========================================================
   EN VIVO Tycoon — "Invita a tu equipo" y "Productores Aliados" (server/src/Invitaciones.php, Aliados.php,
   server/INTEGRAR_INVITAR.md)
     GET  /api/invitar            { codigo, enlace, amigos:[{alias, desde, cuenta, activo, capitulo, dias, etapas}], activos,
                                    metas:[{n, premios, distintivo, logrado}], etapas, bienvenida, mi_invitacion, puede_vincular,
                                    distintivos, asociacion:{miembros, max}|null, creador:{nombre, codigo}|null, aliado:{codigo, ...}|null }
     POST /api/invitar/vincular   { ref, instalacion }  (cuenta nueva que perdió el ?ref= al registrarse)
   Qué hace (sin tocar ui.js):
     - Registro: agrega el campo "Código de creador (opcional)" a Cuenta.camposRegistro y manda ref (el ?ref= que guardó
       js/compartir.js), creador e instalacion con Api.registro. Después avisa: pack de bienvenida o regalo del creador.
     - Tarjeta de Inicio (window.EnVivoInicio, id 'invitar', lugar 'sala' del hub): amigos activos, próxima meta, "Invitar por WhatsApp" y "Mis invitados".
     - Ventana "Mis invitados": tu enlace, qué gana tu amigo, qué ganas tú por etapa, metas 1/3/5/10, cada amigo con su avance,
       el creador que apoyas y, si eres Productor Aliado, tu código (sin montos de dinero: el pago al creador es aparte).
     - Pestaña "Asociación" del chat: botón "Invitar" (Invitar.enAsociacion, lo llama js/chat.js).
     - Vitrina (js/visitas.js): insignia "Productor Aliado" y "Letrero dorado" (Invitar.distintivosHtml / Invitar.letrero).
   Textos: claves inv.* en js/lang/es.js (los demás idiomas usan el español hasta la traducción final).
   API para pruebas: window.Invitar = { datos, cargar, invalidar, abrirLista, extraRegistro, distintivosHtml, letrero, enAsociacion }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'invitar';
  const RUTA = '/api/invitar';
  const CADA_MS = 5 * 60000;
  const K_INST = 'envivo_instalacion';      // el mismo número al azar de la instalación (js/analitica.js, js/black_friday.js)
  const K_REF = 'envivo_ref_origen';        // { code, t } que guarda js/compartir.js al abrir con ?ref=
  const K_AVISOS = 'envivo_invitar_avisos'; // avisos ya mostrados (bienvenida, creador, vincular)

  const st = { datos: null, cargando: false, cargadoEn: 0, errorEn: 0, cuenta: undefined, noDisponible: false, creadorEscrito: '', ctx: null };

  const T = (k, p) => { try { if (st.ctx && typeof st.ctx.T === 'function') return st.ctx.T(k, p); if (root.I18N) return root.I18N.T(k, p); } catch (e) { /* abajo */ } return k; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const Api = () => (st.ctx && st.ctx.Api) || root.Api || {};
  const conServidor = () => Api().disponible === true;
  const logueado = () => { try { const A = Api(); return !!(A.logueado && A.logueado()); } catch (e) { return false; } };
  const cuentaId = () => { try { const e = Api().estado; return e && e.jugador ? e.jugador.id : null; } catch (e) { return null; } };
  const lsGet = (k) => { try { return JSON.parse(root.localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } };
  const toast = (m) => { try { if (st.ctx && st.ctx.toast) st.ctx.toast(m); else if (root.EnVivoToast) root.EnVivoToast(m); } catch (e) { /* nada */ } };
  const enApp = () => { try { if (st.ctx && typeof st.ctx.enApp === 'function') return !!st.ctx.enApp(); } catch (e) { /* abajo */ } try { return /android-app:/.test(document.referrer || '') || !!(root.GooglePlay && root.GooglePlay.enApp && root.GooglePlay.enApp()); } catch (e) { return false; } };

  function instalacion() {
    try {
      let v = root.localStorage.getItem(K_INST);
      if (!/^[a-f0-9]{32}$/.test(v || '')) {
        const b = new Uint8Array(16);
        root.crypto.getRandomValues(b);
        v = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
        root.localStorage.setItem(K_INST, v);
      }
      return v;
    } catch (e) { return null; }
  }
  function refOrigen() {
    const r = lsGet(K_REF);
    return r && typeof r.code === 'string' && /^[\w-]{1,24}$/.test(r.code) ? r.code : '';
  }
  const esCodigoJugador = (c) => /^p[0-9a-z]{1,6}$/i.test(c || '');
  const avisos = () => lsGet(K_AVISOS) || {};
  const marcarAviso = (k) => { const a = avisos(); a[k] = Date.now(); lsSet(K_AVISOS, a); };

  async function pedir(metodo, ruta, cuerpo) {
    if (st.ctx && typeof st.ctx.pedir === 'function') return st.ctx.pedir(metodo, ruta, cuerpo);
    const r = await fetch(ruta, { method: metodo, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
      body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || 'Error'); e.status = r.status; e.codigo = j && j.codigo; throw e; }
    return j;
  }

  async function cargar() {
    if (st.cargando) return st.datos;
    st.cargando = true;
    try {
      const r = await pedir('GET', RUTA);
      st.datos = r && typeof r.codigo === 'string' ? r : null;
      st.cargadoEn = Date.now();
      await despuesDeCargar();
    } catch (e) {
      if (e && e.status === 404) st.noDisponible = true;
      st.errorEn = Date.now();
    } finally { st.cargando = false; }
    return st.datos;
  }
  function invalidar() { st.cargadoEn = 0; st.errorEn = 0; }
  function repintar() { try { if (st.ctx && typeof st.ctx.render === 'function') st.ctx.render(); } catch (e) { /* nada */ } }

  function alDia() {
    const c = logueado() ? cuentaId() : null;
    if (c !== st.cuenta) { st.cuenta = c; st.cargadoEn = 0; st.datos = null; }
    if (!c || !conServidor() || st.noDisponible || st.cargando) return;
    const ahora = Date.now();
    if (ahora - st.cargadoEn < CADA_MS || ahora - st.errorEn < 60000) return;
    const antes = JSON.stringify(st.datos);
    cargar().then(() => { if (JSON.stringify(st.datos) !== antes) repintar(); }).catch(() => {});
  }

  // Avisos una sola vez: pack de bienvenida, regalo del creador, código de creador que no existe; y vincular el ?ref= perdido
  async function despuesDeCargar() {
    const d = st.datos;
    if (!d) return;
    const a = avisos();
    const c = cuentaId();
    if (d.mi_invitacion && d.mi_invitacion.bienvenida && !a['bien:' + c]) { marcarAviso('bien:' + c); toast(T('inv.aviso_bienvenida', { nombre: d.mi_invitacion.invitador })); }
    if (d.creador && !a['cre:' + c]) { marcarAviso('cre:' + c); toast(T('inv.aviso_creador', { nombre: d.creador.nombre })); }
    if (st.creadorEscrito && !d.creador) { toast(T('inv.aviso_creador_mal', { codigo: st.creadorEscrito })); }
    st.creadorEscrito = '';
    const ref = refOrigen();
    if (d.puede_vincular && !d.mi_invitacion && esCodigoJugador(ref) && ref.toLowerCase() !== String(d.codigo).toLowerCase() && !a['vin:' + c]) {
      marcarAviso('vin:' + c);
      try {
        const r = await pedir('POST', RUTA + '/vincular', { ref, instalacion: instalacion() });
        if (r.estado_invitar) st.datos = r.estado_invitar;
        if (r.bienvenida) { marcarAviso('bien:' + c); toast(T('inv.aviso_bienvenida', { nombre: r.invitador })); }
        try { if (root.Buzon && root.Buzon.cargar) root.Buzon.cargar().catch(() => {}); } catch (e) { /* nada */ }
      } catch (e) { /* enlace viejo o no válido: no se insiste */ }
    }
  }

  /* ---------- Registro: campo del código de creador y datos extra ---------- */
  function campoCreador() {
    const ref = refOrigen();
    const pre = ref && !esCodigoJugador(ref) ? ref.toUpperCase() : '';
    return `<label class="field inv-campo">${esc(T('inv.campo_creador'))}<input id="inv-creador" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(pre)}" placeholder="${esc(T('inv.campo_creador_ej'))}"></label>
      ${esCodigoJugador(ref) ? `<p class="small inv-nota" data-inv="nota-invitado">🎁 ${esc(T('inv.registro_invitado'))}</p>` : ''}`;
  }
  function extraRegistro() {
    const o = {};
    const ref = refOrigen();
    if (ref) o.ref = ref;
    const el = root.document && root.document.getElementById('inv-creador');
    const cre = el ? String(el.value || '').trim() : '';
    if (cre) o.creador = cre;
    const inst = instalacion();
    if (inst) o.instalacion = inst;
    return o;
  }
  function engancharRegistro() {
    const C = root.Cuenta;
    if (C && !C.__invitar) {
      const campos = C.camposRegistro;
      C.camposRegistro = function () { return (typeof campos === 'function' ? campos.apply(C, arguments) : '') + campoCreador(); };
      C.__invitar = true;
    }
    const A = root.Api;
    if (A && typeof A.registro === 'function' && !A.registro.__invitar) {
      const orig = A.registro;
      const nuevo = async function (email, nombre, clave, extra) {
        const ex = extraRegistro();
        st.creadorEscrito = ex.creador || '';
        const r = await orig.call(A, email, nombre, clave, Object.assign({}, extra || {}, ex));
        invalidar(); st.datos = null; st.cuenta = undefined;
        setTimeout(() => { alDia(); }, 300);
        return r;
      };
      nuevo.__invitar = true;
      A.registro = nuevo;
    }
  }

  /* ---------- Estilos ---------- */
  function css() {
    const doc = root.document;
    if (!doc || doc.getElementById('inv-css')) return;
    const s = doc.createElement('style');
    s.id = 'inv-css';
    s.textContent = `.inv-card .inv-bar{height:8px;border-radius:5px;background:#ffffff14;overflow:hidden;margin:6px 0 10px}
      .inv-card .inv-bar i{display:block;height:100%;background:linear-gradient(90deg,#25d366,#7cf0a8)}
      .inv-fila{display:flex;gap:8px;flex-wrap:wrap}.inv-fila .btn{flex:1;min-width:140px;margin:0}
      .inv-wa{background:linear-gradient(180deg,#34e07a,#1fb85a)!important;border-color:#1fb85a!important;color:#06210f!important;font-weight:700}
      .inv-sub{color:var(--muted);font-size:13px;margin:2px 0 6px}
      .inv-oro{color:#ffd84d;border-color:#ffd84d!important}
      .inv-aliado{color:#7cf0ff;border-color:#7cf0ff!important}
      .inv-modal h3{margin:14px 0 6px;font-size:15px}
      .inv-enlace{display:flex;gap:6px;align-items:center;margin:6px 0}.inv-enlace code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--panel2,#1a2030);border:1px solid var(--line,#2a3242);border-radius:8px;padding:8px;font-size:12px}
      .inv-enlace .btn{margin:0;flex:0 0 auto;width:auto}
      .inv-premios{margin:4px 0 0;padding-left:18px;font-size:13px}.inv-premios li{margin:2px 0}
      .inv-meta{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line,#2a3242);font-size:13px}
      .inv-meta.ok b{color:var(--green,#34e07a)}
      .inv-amigo{padding:8px 0;border-bottom:1px solid var(--line,#2a3242)}.inv-amigo:last-child{border-bottom:0}
      .inv-chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.inv-chip{font-size:11px;border:1px solid var(--line,#2a3242);border-radius:10px;padding:1px 7px;color:var(--muted)}
      .inv-chip.ok{color:var(--green,#34e07a);border-color:var(--green,#34e07a)}.inv-chip.no{color:var(--red,#ff6b6b);border-color:var(--red,#ff6b6b)}
      .inv-regla{font-size:12px;color:var(--muted);margin:10px 0 0}
      .inv-nota{color:var(--green,#34e07a);margin:-4px 0 8px}
      .inv-asoc{display:flex;gap:8px;align-items:center;padding:8px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line,#2a3242);font-size:13px}
      .inv-asoc[hidden]{display:none}.inv-asoc span{flex:1;min-width:0}.inv-asoc .btn{margin:0;width:auto;flex:0 0 auto}
      .vis-hq{position:relative}
      .inv-letrero{position:absolute;left:50%;top:8px;transform:translateX(-50%);max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        padding:3px 12px;border-radius:6px;font-weight:800;font-size:13px;letter-spacing:.5px;color:#2a1b00;
        background:linear-gradient(180deg,#fff0a8,#ffd84d 45%,#c99a1e);border:1px solid #fff6c8;box-shadow:0 2px 8px #0008,0 0 12px #ffd84d66;pointer-events:none}`;
    (doc.head || doc.documentElement).appendChild(s);
  }

  /* ---------- Compartir ---------- */
  function enlace() {
    const d = st.datos;
    if (d && d.enlace) return d.enlace;
    try { if (root.Compartir && root.Compartir.enlace) return root.Compartir.enlace(); } catch (e) { /* nada */ }
    return 'https://juego.tukanec.com/';
  }
  function abrirFuera(url, intent) {
    root.__invitarUltimo = { url, intent: enApp() ? intent || null : null };
    if (root.__compartirNoNavegar) return;
    try {
      if (enApp() && intent) { location.href = intent; return; }
      const w = root.open(url, '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* nada */ } } else location.href = url;
    } catch (e) { /* nada */ }
  }
  function whatsapp(tipo) {
    const texto = T(tipo === 'asoc' ? 'inv.wa_asoc' : 'inv.wa_msg', { enlace: enlace(), siglas: (st.datos && st.datos.asociacion && st.datos.asociacion.siglas) || '' });
    const wa = 'https://wa.me/?text=' + encodeURIComponent(texto);
    abrirFuera(wa, 'intent://send?text=' + encodeURIComponent(texto) + '#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=' + encodeURIComponent(wa) + ';end');
  }
  async function copiar() {
    const u = enlace();
    try { await root.navigator.clipboard.writeText(u); toast(T('inv.copiado')); } catch (e) { toast(u); }
  }

  /* ---------- Textos de premios ---------- */
  function premio(a) {
    try { if (root.Buzon && typeof root.Buzon.nombreAdjunto === 'function') { const n = root.Buzon.nombreAdjunto(a, st.ctx); if (n) return n; } } catch (e) { /* abajo */ }
    return a.nombre || '';
  }
  const premios = (l) => (l || []).map(premio).filter(Boolean).join(' · ');
  function proximaMeta(d) {
    const m = (d.metas || []).find((x) => !x.logrado && x.n > (d.activos || 0));
    return m || null;
  }
  const tieneLetrero = (l) => (l || []).some((x) => x && x.clave === 'letrero_dorado');

  /* ---------- Tarjeta de Inicio ---------- */
  function tarjeta(ctx) {
    st.ctx = ctx || st.ctx;
    engancharRegistro();
    alDia();
    const d = st.datos;
    if (!d || !d.activa || !logueado() || !conServidor()) return '';
    css();
    const act = d.activos || 0;
    const meta = proximaMeta(d);
    const ant = (d.metas || []).filter((x) => x.n <= act).reduce((m, x) => Math.max(m, x.n), 0);
    const pct = meta ? Math.round(((act - ant) / Math.max(1, meta.n - ant)) * 100) : 100;
    return `<div class="card inv-card" data-inv="tarjeta">
      <div class="row between"><div class="story-tag">${esc(T('inv.tag'))}</div><span class="small muted">${esc(T('inv.activos', { n: act }))}</span></div>
      <h3>🤝 ${esc(T('inv.titulo'))}</h3>
      <p class="inv-sub">${esc(meta ? T('inv.proxima', { n: meta.n, premio: premios(meta.premios) + (meta.distintivo ? ' + ' + T('inv.dist.' + meta.distintivo) : '') }) : T('inv.todas'))}</p>
      ${meta ? `<div class="inv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${meta.n}" aria-valuenow="${act}" aria-label="${esc(T('inv.activos', { n: act }))}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>` : ''}
      ${tieneLetrero(d.distintivos) ? `<p class="small inv-oro" data-inv="letrero">🏅 ${esc(T('inv.letrero_ok'))}</p>` : ''}
      ${d.aliado ? `<p class="small inv-aliado" data-inv="aliado">🎬 ${esc(T('inv.aliado_corto', { codigo: d.aliado.codigo, n: d.aliado.jugadores }))}</p>` : ''}
      <div class="inv-fila"><button class="btn inv-wa" data-ext="${ID}" data-acc="wa">${esc(T('inv.invitar_wa'))}</button>
        <button class="btn" data-ext="${ID}" data-acc="lista" data-inv="abrir-lista">${esc(T('inv.mis_invitados', { n: d.total || 0 }))}</button></div></div>`;
  }

  /* ---------- Ventana "Mis invitados" ---------- */
  function amigoHtml(a) {
    const chip = (ok, txt) => `<span class="inv-chip ${ok ? 'ok' : ''}">${ok ? '✓ ' : ''}${esc(txt)}</span>`;
    const e = a.etapas || {};
    return `<div class="inv-amigo" data-inv="amigo"><div class="row between"><b>${esc(a.alias)}</b><span class="small muted">${esc(a.activo ? T('inv.amigo_activo') : '')}</span></div>
      ${a.cuenta ? `<div class="inv-chips">${chip(e.capitulo2, T('inv.etapa.capitulo2') + (a.capitulo ? ' (' + T('inv.cap_n', { n: a.capitulo }) + ')' : ''))}
        ${chip(e.dias3, T('inv.etapa.dias3') + ' (' + Math.min(3, a.dias || 0) + '/3)')}${chip(e.asociacion, T('inv.etapa.asociacion'))}</div>`
        : `<div class="inv-chips"><span class="inv-chip no">${esc(T('inv.no_cuenta'))}</span></div>`}</div>`;
  }
  function listaHtml() {
    const d = st.datos;
    if (!d) return `<p class="muted">${esc(T('inv.cargando'))}</p>`;
    const metas = (d.metas || []).map((m) => `<div class="inv-meta ${m.logrado ? 'ok' : ''}" data-inv="meta-${m.n}"><span><b>${m.logrado ? '✓ ' : ''}${esc(T('inv.meta_n', { n: m.n }))}</b></span>
      <span class="muted" style="text-align:right">${esc(premios(m.premios))}${m.distintivo ? ' + ' + esc(T('inv.dist.' + m.distintivo)) : ''}</span></div>`).join('');
    const etapas = (d.etapas || []).map((e) => `<li>${esc(T('inv.etapa.' + e.clave))}: ${esc(premios(e.premios))}</li>`).join('');
    const amigos = (d.amigos || []).map(amigoHtml).join('');
    let cre = '';
    if (d.aliado) {
      cre += `<h3>🎬 ${esc(T('inv.aliado_t'))}</h3><p class="small">${esc(T('inv.aliado_txt', { codigo: d.aliado.codigo, n: d.aliado.jugadores, c: d.aliado.creditos_mes }))}</p>
        <div class="inv-enlace"><code data-inv="codigo-aliado">${esc(d.aliado.codigo)}</code></div>`;
    }
    if (d.creador) cre += `<p class="small" data-inv="creador">🎬 ${esc(T('inv.apoyas', { nombre: d.creador.nombre, codigo: d.creador.codigo }))}</p>`;
    else cre += `<p class="small muted">${esc(T('inv.sin_creador'))} <button class="btn sm" data-ext="${ID}" data-acc="canjear" style="width:auto;display:inline-flex;margin:4px 0 0">${esc(T('inv.canjear'))}</button></p>`;
    return `<div class="inv-modal" data-inv="lista">
      <div class="row between"><h2>🤝 ${esc(T('inv.titulo'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">✕</button></div>
      <p class="small muted">${esc(T('inv.explica'))}</p>
      <div class="inv-enlace"><code data-inv="enlace">${esc(enlace())}</code><button class="btn sm" data-ext="${ID}" data-acc="copiar">${esc(T('inv.copiar'))}</button></div>
      <button class="btn inv-wa" data-ext="${ID}" data-acc="wa" style="margin:4px 0 0">${esc(T('inv.invitar_wa'))}</button>
      ${d.mi_invitacion ? `<p class="small inv-nota" style="margin:10px 0 0">${esc(T('inv.te_invito', { nombre: d.mi_invitacion.invitador }))}</p>` : ''}
      <h3>${esc(T('inv.gana_amigo'))}</h3><ul class="inv-premios"><li>${esc(premios(d.bienvenida))}</li></ul>
      <h3>${esc(T('inv.gana_tu'))}</h3><ul class="inv-premios">${etapas}</ul>
      <h3>${esc(T('inv.metas', { n: d.activos || 0 }))}</h3>${metas}
      <h3>${esc(T('inv.tus_amigos', { n: d.total || 0 }))}</h3>${amigos || `<p class="small muted" data-inv="vacio">${esc(T('inv.vacio'))}</p>`}
      ${cre}
      <p class="inv-regla">${esc(T('inv.reglas', { n: d.tope || 30 }))}</p></div>`;
  }
  async function abrirLista(ctx) {
    st.ctx = ctx || st.ctx;
    css();
    if (!st.ctx || typeof st.ctx.openModal !== 'function') return;
    st.ctx.openModal(listaHtml());
    await cargar().catch(() => {});
    const el = root.document.querySelector('#overlay .inv-modal');
    if (el && el.parentNode) el.outerHTML = listaHtml();
  }

  function clic(ctx, acc) {
    st.ctx = ctx || st.ctx;
    if (acc === 'wa') whatsapp('ini');
    else if (acc === 'lista') abrirLista(ctx);
    else if (acc === 'copiar') copiar();
    else if (acc === 'canjear') {
      try { if (ctx.closeModal) ctx.closeModal(); } catch (e) { /* nada */ }
      try { if (root.Buzon && root.Buzon.abrir) root.Buzon.abrir(ctx, 'canjear'); } catch (e) { /* nada */ }
    }
  }

  /* ---------- Pestaña "Asociación" del chat ---------- */
  function enAsociacion(panel, visible) {
    if (!panel || !root.document) return;
    css();
    let el = panel.querySelector('#inv-asoc');
    if (!el) {
      el = root.document.createElement('div');
      el.id = 'inv-asoc'; el.className = 'inv-asoc';
      const barra = panel.querySelector('#chat-asoc-barra');
      if (barra && barra.parentNode) barra.parentNode.insertBefore(el, barra.nextSibling); else panel.insertBefore(el, panel.firstChild && panel.firstChild.nextSibling);
      el.addEventListener('click', (ev) => { if (ev.target.closest('[data-inv="asoc-invitar"]')) { ev.preventDefault(); ev.stopPropagation(); whatsapp('asoc'); } });
    }
    el.hidden = !visible || !logueado();
    if (el.hidden) return;
    if (!st.datos) alDia();
    const a = st.datos && st.datos.asociacion;
    let txt = T('inv.asoc_generico');
    if (a && a.max) {
      const meta = Math.min(a.max, Math.ceil((a.miembros + 1) / 5) * 5);
      txt = a.miembros >= a.max ? T('inv.asoc_llena') : T('inv.asoc_faltan', { n: meta - a.miembros });
    }
    el.innerHTML = `<span data-inv="asoc-texto">${esc(txt)}</span><button class="btn sm inv-wa" data-inv="asoc-invitar">${esc(T('inv.invitar'))}</button>`;
  }

  /* ---------- Vitrina (visitas) ---------- */
  function distintivosHtml(v) {
    css();
    return ((v && v.distintivos) || []).map((x) => {
      if (x.clave === 'productor_aliado') return `<span class="vis-tag inv-aliado" data-inv="dist-aliado">🎬 ${esc(T('inv.dist.productor_aliado'))}</span>`;
      if (x.clave === 'letrero_dorado') return `<span class="vis-tag inv-oro" data-inv="dist-letrero">🏅 ${esc(T('inv.dist.letrero_dorado'))}</span>`;
      return '';
    }).join('');
  }
  function letrero(v) {
    if (!v || !tieneLetrero(v.distintivos)) return '';
    css();
    const n = v.productora || v.alias || '';
    return `<div class="inv-letrero" data-inv="letrero-sede">★ ${esc(n)} ★</div>`;
  }

  /* ---------- Arranque ---------- */
  engancharRegistro();
  if (root.document && root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', engancharRegistro);
  root.Invitar = { get datos() { return st.datos; }, cargar, invalidar, abrirLista: (ctx) => abrirLista(ctx), extraRegistro, campoCreador, distintivosHtml, letrero, enAsociacion, instalacion };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 8, hub: 'sala', tarjeta, clic });   // en Inicio, en la Sala (junto a las visitas)
})(typeof window !== 'undefined' ? window : globalThis);
