/* =========================================================
   EN VIVO Tycoon — Black Friday: VIP 30 días GRATIS para las primeras 100 cuentas (server/src/BlackFriday.php, API.md)
     GET  /api/promo/black_friday           { fase: apagada|pronto|activa|agotada|terminada, cupo, reclamados, quedan, dias,
                                              desde, hasta, reclamado (null sin sesión), vip_hasta? }
     POST /api/promo/black_friday/reclamar  { instalacion } → lo mismo + { nuevo: true }   (errores con "codigo")
   Qué hace:
     - Franja grande arriba de Inicio (window.EnVivoInicio con banner(ctx), ui.js la pinta antes de la productora) SOLO
       mientras la promo está en curso o agotada: "🎁 Black Friday: VIP 30 días GRATIS — quedan N de 100" con barra,
       botón "Reclamar" (con cuenta) o "Crea tu cuenta gratis para reclamar" (sin cuenta); "Ya tienes tu VIP gratis" si
       ya lo reclamó; "Se agotaron los 100 VIP gratis — gracias" cuando se acaba. Fuera de la ventana no se ve nada.
     - El contador se pide al abrir el juego y cada minuto mientras se ve la franja (el servidor deja guardarlo 15 s).
     - Al reclamar: el servidor activa el Pase VIP (lo mismo que comprarlo) y el juego trae /api/estado otra vez.
     - La misma promo se puede canjear con la palabra del dueño en "Canjear código" (js/buzon.js).
   Textos: claves bf.* en js/lang/es.js (los demás idiomas usan el español hasta la traducción final).
   API para pruebas: window.BlackFriday = { datos, cargar, invalidar, instalacion, visible }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'black_friday';
  const RUTA = '/api/promo/black_friday';
  const CADA_MS = 60000;
  const K_INST = 'envivo_instalacion';   // el mismo número al azar de la instalación que usa js/analitica.js

  const st = { datos: null, cargando: false, cargadoEn: 0, errorEn: 0, ocupado: false, cuenta: undefined, noDisponible: false };

  const T = (ctx, k, p) => { try { if (ctx && typeof ctx.T === 'function') return ctx.T(k, p); if (root.I18N) return root.I18N.T(k, p); } catch (e) { /* abajo */ } return k; };
  const escH = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ApiDe = (ctx) => (ctx && ctx.Api) || root.Api || {};
  const conServidor = (ctx) => { const A = ApiDe(ctx); return A.disponible === true; };
  const logueado = (ctx) => { try { const A = ApiDe(ctx); return !!(A.logueado && A.logueado()); } catch (e) { return false; } };
  const cuentaId = (ctx) => { try { const e = ApiDe(ctx).estado; return e && e.jugador ? e.jugador.id : null; } catch (e) { return null; } };

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
      st.datos = r && typeof r.fase === 'string' ? r : null;
      st.cargadoEn = Date.now();
    } catch (e) {
      if (e && e.status === 404) st.noDisponible = true;   // servidor sin la promo
      st.errorEn = Date.now();
    } finally { st.cargando = false; }
    return st.datos;
  }
  function invalidar() { st.cargadoEn = 0; st.errorEn = 0; }

  // Pide el contador si hace falta y vuelve a pintar Inicio cuando llega (sin bloquear el dibujo)
  function alDia(ctx) {
    const c = logueado(ctx) ? cuentaId(ctx) : null;
    if (c !== st.cuenta) { st.cuenta = c; st.cargadoEn = 0; }
    if (!conServidor(ctx) || st.noDisponible || st.cargando) return;
    const ahora = Date.now();
    if (ahora - st.cargadoEn < CADA_MS || ahora - st.errorEn < CADA_MS) return;
    const antes = JSON.stringify(st.datos);
    cargar(ctx).then(() => { if (JSON.stringify(st.datos) !== antes) { try { if (typeof ctx.render === 'function') ctx.render(); } catch (e) { /* nada */ } } }).catch(() => {});
  }

  const visible = (d) => !!d && (d.fase === 'activa' || d.fase === 'agotada');

  function ponerCss() {
    const doc = root.document;
    if (!doc || doc.getElementById('bf-css')) return;
    const s = doc.createElement('style');
    s.id = 'bf-css';
    s.textContent = `.bf-card{position:relative;margin:0 0 12px;padding:14px 14px 12px;border-radius:14px;border:1px solid #ffd27a88;
      background:linear-gradient(135deg,#1b1406 0%,#0d0f14 55%,#21160a 100%);box-shadow:0 0 0 1px #00000040 inset,0 6px 18px #0006;overflow:hidden}
      .bf-card::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--amber),#ffd27a,var(--amber))}
      .bf-tag{display:inline-block;font-family:var(--f-head);font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#1a1205;background:var(--amber);border-radius:6px;padding:1px 7px}
      .bf-t{margin:6px 0 2px;font-size:19px;line-height:1.2;overflow-wrap:anywhere}
      .bf-t b{color:var(--amber)}
      .bf-sub{margin:0 0 8px;color:var(--muted);font-size:13px}
      .bf-bar{height:8px;border-radius:5px;background:#ffffff14;overflow:hidden;margin:4px 0 10px}
      .bf-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--amber),#ffd27a)}
      .bf-ok{color:var(--green);font-weight:700;margin:4px 0 0}
      .bf-fin{color:var(--muted);margin:4px 0 0}
      .bf-card .btn{margin-top:0}
      .bf-link{background:none;border:0;color:var(--muted);text-decoration:underline;font:inherit;font-size:13px;padding:8px 0 0;cursor:pointer;width:100%}`;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function fecha(iso) {
    try {
      const d = new Date(iso);
      const L = root.I18N && root.I18N.idiomas && root.I18N.idiomas.find((x) => x.code === root.I18N.idioma);
      return d.toLocaleDateString((L && L.locale) || 'es-EC', { day: 'numeric', month: 'long' });
    } catch (e) { return String(iso || '').slice(0, 10); }
  }

  /** Franja de Inicio (ui.js la pone arriba de la productora). */
  function banner(ctx) {
    alDia(ctx);
    const d = st.datos;
    if (!visible(d) || !conServidor(ctx)) return '';
    ponerCss();
    const esc = ctx.esc || escH;
    const cupo = Math.max(0, Number(d.cupo) || 0), quedan = Math.max(0, Number(d.quedan) || 0), dias = Number(d.dias) || 30;
    const pct = cupo ? Math.round(((cupo - quedan) / cupo) * 100) : 100;
    let cuerpo;
    if (d.reclamado) {
      cuerpo = `<p class="bf-ok" data-bf="reclamado">✓ ${esc(T(ctx, 'bf.reclamado'))}</p>
        ${d.vip_hasta ? `<p class="bf-sub" style="margin:2px 0 0">${esc(T(ctx, 'bf.activo_hasta', { fecha: fecha(d.vip_hasta) }))}</p>` : ''}`;
    } else if (d.fase === 'agotada' || quedan <= 0) {
      cuerpo = `<p class="bf-fin" data-bf="agotada">${esc(T(ctx, 'bf.agotada', { n: cupo }))}</p>`;
    } else if (logueado(ctx)) {
      cuerpo = `<button class="btn main" data-ext="${ID}" data-acc="reclamar" data-bf="reclamar"${st.ocupado ? ' disabled' : ''}>🎁 ${esc(T(ctx, st.ocupado ? 'bf.reclamando' : 'bf.reclamar'))}</button>`;
    } else {
      cuerpo = `<button class="btn main" data-act="cuenta" data-modo="registro" data-bf="crear">${esc(T(ctx, 'bf.crear_cuenta'))}</button>
        <button class="bf-link" data-act="cuenta" data-modo="entrar">${esc(T(ctx, 'bf.ya_tengo'))}</button>`;
    }
    const titulo = esc(T(ctx, 'bf.titulo', { dias })).replace(/\*([^*]+)\*/g, '<b>$1</b>');
    return `<div class="bf-card" data-bf="card" aria-live="polite"><span class="bf-tag">${esc(T(ctx, 'bf.tag'))}</span>
      <h2 class="bf-t">🎁 ${titulo}</h2>
      <p class="bf-sub" data-bf="quedan">${esc(d.fase === 'agotada' || quedan <= 0 ? T(ctx, 'bf.sin_cupo', { n: cupo }) : T(ctx, 'bf.quedan', { n: quedan, total: cupo }))}</p>
      <div class="bf-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${cupo}" aria-valuenow="${cupo - quedan}" aria-label="${esc(T(ctx, 'bf.quedan', { n: quedan, total: cupo }))}"><i style="width:${pct}%"></i></div>
      ${cuerpo}
      ${!d.reclamado && d.fase === 'activa' ? `<p class="bf-sub" style="margin:8px 0 0;font-size:12px">${esc(T(ctx, 'bf.detalle', { dias }))}</p>` : ''}</div>`;
  }

  async function reclamar(ctx) {
    if (st.ocupado) return;
    st.ocupado = true;
    try { ctx.render(); } catch (e) { /* nada */ }
    try {
      const r = await pedir(ctx, 'POST', RUTA + '/reclamar', { instalacion: instalacion() });
      st.datos = r; st.cargadoEn = Date.now();
      try { if (ctx.snd) ctx.snd.play('chapter'); } catch (e) { /* nada */ }
      try { ctx.toast(T(ctx, 'bf.listo', { dias: r.dias || 30 })); } catch (e) { /* nada */ }
      st.ocupado = false;
      try { if (typeof ctx.sincronizar === 'function') await ctx.sincronizar(); else ctx.render(); } catch (e) { /* se ve la próxima vez */ }
    } catch (e) {
      st.ocupado = false;
      // Agotada, terminada o ya reclamada: se trae el contador otra vez para mostrar el estado real
      if (e && /^promo_/.test(e.codigo || '')) { invalidar(); await cargar(ctx).catch(() => {}); }
      try { ctx.toast(e && e.message ? e.message : T(ctx, 'err.no_completo')); } catch (x) { /* nada */ }
    }
    try { ctx.render(); } catch (e) { /* nada */ }
  }

  function clic(ctx, acc) {
    if (acc === 'reclamar') reclamar(ctx);
  }

  root.BlackFriday = { get datos() { return st.datos; }, cargar: (ctx) => cargar(ctx), invalidar, instalacion, visible: () => visible(st.datos) };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: -10, banner, clic });
})(typeof window !== 'undefined' ? window : globalThis);
