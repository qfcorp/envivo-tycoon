/* =========================================================
   EN VIVO Tycoon — Pantallas (interfaz)
   Usa las reglas de js/logic.js (Game), los dibujos de js/art.js (Art)
   y, si existe, los sonidos de js/sound.js (Sound).
   ========================================================= */
(function () {
  'use strict';
  const G = window.Game;
  const A = window.Art;
  const SAVE_KEY = 'envivo_tycoon_save_v1';
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Idiomas (js/i18n.js): T() para los textos de la pantalla, TL() para los textos que vienen de la lógica
  const I18 = window.I18N || null;
  const T = (k, p) => (I18 ? I18.T(k, p) : k);
  const TL = (t) => (I18 ? I18.TL(t) : t);
  // Dinero: el signo va antes del símbolo ("-$24", no "$-24")
  const M0 = (n) => (I18 ? I18.money(n) : G.money(n));
  const M = (n) => { const v = Math.round(Number(n) || 0); return v < 0 ? '-' + M0(-v) : M0(v); };
  const N = (n) => (I18 ? I18.num(n) : String(n));
  const I = (name, cls) => A.icon(name, cls);
  // Quita el emoji del inicio de los textos de la lógica (ahora hay dibujos)
  const noEmoji = (t) => String(t).replace(/^(\p{Extended_Pictographic}|️|‍|\s)+/u, '');
  // Textos de la lógica que traen clave y parámetros ({ k, p }): se arman otra vez con G.tx (así salen en el idioma
  // elegido cuando js/i18n.js trae I18N.juego). Si no traen clave, el texto guardado pasa por TL().
  const gtx = (o, txt) => {
    try { if (o && o.k && G.tx) { const t = G.tx(o.k, o.p || undefined); if (typeof t === 'string' && t !== o.k) return TL(t); } } catch (e) { /* abajo */ }
    return TL(txt !== undefined ? txt : (o && o.text) || '');
  };
  function enlazarTraductor() {
    try { if (G.setTraductor && I18 && I18.juego) G.setTraductor(I18.juego); } catch (e) { /* sin traductor */ }
  }
  // Puestos y niveles del personal
  const normRole = (r) => { try { return G.normRole ? G.normRole(r) : r; } catch (e) { return r; } };
  const roleIcon = (r) => { const k = normRole(r); return A.hasIcon && A.hasIcon('role_' + k) ? 'role_' + k : ((G.ROLES[k] || {}).icon || 'people'); };
  const tierOf = (p) => (p && p.tier && G.TIERS && G.TIERS[p.tier] ? p.tier : 'junior');
  const tierName = (t) => TL((G.TIERS && G.TIERS[t] && G.TIERS[t].name) || t);
  const tierBadge = (p) => `<span class="lvl lvl-${tierOf(p)}">${esc(tierName(tierOf(p)))}</span>`;
  const venueName = () => { try { return TL(G.venue ? G.venue(S).name : (G.dailyCostBreakdown ? G.dailyCostBreakdown(S).place : '')); } catch (e) { return ''; } };

  /* ---------- Sonido (opcional: si js/sound.js no está, no pasa nada) ---------- */
  const snd = {
    play(n, x) { try { if (window.Sound) window.Sound.play(n, x); } catch (e) { /* sin sonido */ } },
    amb(k) { try { if (window.Sound) window.Sound.ambience(k); } catch (e) { /* sin sonido */ } },
    unlock() { try { if (window.Sound) window.Sound.unlock(); } catch (e) { /* sin sonido */ } },
    muted() { try { return window.Sound ? window.Sound.isMuted() : true; } catch (e) { return true; } },
    toggle() { try { if (window.Sound) window.Sound.setMuted(!window.Sound.isMuted()); } catch (e) { /* sin sonido */ } },
  };
  /* ---------- Música (opcional: si js/musica.js no está, no pasa nada) ---------- */
  const mus = {
    go(t) { try { if (window.Musica) window.Musica.tema(t); } catch (e) { /* sin música */ } },
    stinger() { try { if (window.Musica) window.Musica.stinger(); } catch (e) { /* sin música */ } },
    init() { try { if (window.Musica) window.Musica.iniciar(); } catch (e) { /* sin música */ } },
    muted() { try { return window.Musica ? window.Musica.isMuted() : true; } catch (e) { return true; } },
    toggle() { try { if (window.Musica) window.Musica.setMuted(!window.Musica.isMuted()); } catch (e) { /* sin música */ } },
    actual() { try { return window.Musica && window.Musica.temaActual ? window.Musica.temaActual() : null; } catch (e) { return null; } },
  };
  const temaDeEvento = (type) => (type === 'concierto' ? 'concierto' : 'en_vivo');
  const esFuneral = (type) => /funeral|velorio|sepelio/.test(type || '');
  // Imprevistos graves: la música pasa a tensión. Los demás solo llevan un golpe ("última hora").
  const INC_GRAVE = /^(luz|internet|falla|robo|senal|senal_irl|cobertura|lluvia|transporte|dron)$/;

  /* ---------- Compras de Google Play (solo dentro de la app de Android) ---------- */
  // js/googleplay.js llega después (defer): se busca cada vez
  let GP = window.GooglePlay || null;
  const enApp = () => { try { GP = GP || window.GooglePlay || null; return !!(GP && GP.enApp()); } catch (e) { return false; } };
  let playOk = false;        // hay Play Billing en este celular
  let preciosPlay = {};      // id → { precio, ... } con el precio de Google Play

  /* ---------- Límites (de la lógica si los exporta) ---------- */
  const BAL = () => G.BALANCE || {};
  const maxStaff = () => BAL().maxStaff || 12;
  const maxEquip = () => BAL().maxEquip || 30;
  const bankruptAt = () => (typeof BAL().bankruptAt === 'number' ? BAL().bankruptAt : -300);
  const isCam = (e) => ((G.CATALOG[e.type] || {}).cat === 'cam');

  /* ---------- Datos chicos de la pantalla (aparte de la partida, que es de la lógica) ---------- */
  const RES_KEY = 'envivo_resultado_pendiente'; // resultado que falta ver (si se recarga en esa pantalla)
  const DIA_KEY = 'envivo_dia_inicio';          // dinero al empezar el día (para "Te quedó en caja")
  const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio o modo privado */ } };
  let dia0 = lsGet(DIA_KEY);
  function marcarDia() {
    if (!S) return;
    if (!dia0 || dia0.day !== S.day || typeof dia0.money !== 'number') { dia0 = { day: S.day, money: S.money }; lsSet(DIA_KEY, dia0); }
  }
  function olvidarDia() { dia0 = null; lsSet(DIA_KEY, null); lsSet(RES_KEY, null); }

  /* ---------- Plan del evento (opcional: js/plan_evento.js) ---------- */
  const PE = window.PlanEvento || null;
  const eqName = (id) => { const e = S.equip.find((x) => x.id === id); return e ? TL(e.nick || (G.CATALOG[e.type] || {}).name || e.type) : ''; };

  let S = null;            // estado del juego
  let tab = 'inicio';
  let prep = null;         // selección al preparar un evento
  let afterResult = null;  // capítulo completado pendiente de mostrar (solo con una lógica sin capCompletados)
  let VI = null;           // evento en línea que se está jugando (liga / festival): { v, resolver, incidentes, modo }
  const evS = () => (VI ? VI.v.s : S);   // estado del evento en vivo: la partida o el intento en línea (aparte)
  let catSel = lsGet('envivo_cat') || 'cam';   // categoría elegida en la tienda de equipos
  let rolBuscar = '';      // puesto elegido para buscar personal
  let diaAntes = null;     // dinero antes de descansar (para el resumen del día)

  /* ---------- Guardado ---------- */
  function save() {
    try { localStorage.setItem(SAVE_KEY, G.serialize(S)); } catch (e) { /* sin espacio o modo privado */ }
    nubeLuego();
  }
  /* ---------- Partida en la nube ---------- */
  const Api = window.Api || { disponible: false, logueado: () => false };
  const Pm = window.Premium;
  let nubeT = null, nubeEstado = '';
  function nubeLuego() {
    if (!Api.disponible || !Api.logueado() || cloudPendiente) return;
    clearTimeout(nubeT);
    nubeT = setTimeout(subirNube, 4000);
  }
  async function subirNube() {
    if (!Api.disponible || !Api.logueado() || cloudPendiente) return;
    try { await Api.subirPartida(G.serialize(S)); nubeEstado = 'ok'; } catch (e) { nubeEstado = 'error'; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(nubeT); subirNube(); } });
  let cloudPendiente = false;   // mientras el jugador elige entre la partida de la nube y la del celular
  function load() {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? G.deserialize(raw) : null; } catch (e) { return null; }
  }

  /* ---------- Mensajes cortos ---------- */
  let toastT = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }
  function act(res, okSound) {
    if (res && res.msg) toast(TL(res.msg));
    if (res) snd.play(res.ok ? (okSound || 'tap') : 'error');
    save(); render(); return res;
  }

  /* ---------- Ventana ---------- */
  function openModal(html) { $('modal').innerHTML = html; $('overlay').classList.add('on'); $('modal').scrollTop = 0; }
  function closeModal() { $('overlay').classList.remove('on'); $('modal').innerHTML = ''; }
  let confirmCb = null;
  function ask(text, yesLabel, cb) {
    confirmCb = cb;
    openModal(`<h2>${T('comun.seguro')}</h2><p>${text}</p>
      <button class="btn main" data-act="confirm-yes">${yesLabel}</button>
      <button class="btn" data-act="close">${T('comun.cancelar')}</button>`);
  }

  /* ---------- Idioma ---------- */
  const GLOBO = '<svg class="ico sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>';
  const svgIco = (body, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const NOTA = svgIco('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>', 'sm');
  const NOTA_OFF = svgIco('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/><path d="M3 3l18 18"/>', 'sm');
  const AYUDA = svgIco('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><path d="M12 17.2v.1"/>');
  function nombreIdioma() {
    if (!I18) return 'Español';
    const i = I18.idiomas.find((x) => x.code === I18.idioma);
    return i ? i.nombre : I18.idioma;
  }
  function pintarIdiomaBtn() {
    const b = $('langBtn');
    if (!b) return;
    const code = I18 ? I18.idioma : 'es';
    b.innerHTML = `${GLOBO}<span>${esc(code.split('-')[0].toUpperCase())}</span>`;
    b.setAttribute('aria-label', `${T('idioma.boton')}: ${nombreIdioma()}`);
    b.hidden = !I18;
  }
  function abrirIdiomas() {
    if (!I18) return;
    openModal(`<div class="row between"><h2>${T('idioma.titulo')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <div class="langlist">${I18.idiomas.map((l) => `<button class="btn ${l.code === I18.idioma ? 'main' : ''}" data-act="set-idioma" data-k="${esc(l.code)}" lang="${esc(l.code)}" dir="${l.dir}">${esc(l.nombre)}</button>`).join('')}</div>`);
  }

  /* ---------- Ayudantes visuales ---------- */
  const starsTxt = (n, max) => '★'.repeat(n) + '<span class="muted">' + '★'.repeat((max || 5) - n) + '</span>';
  function starsBig(n) {
    const path = 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z';
    return `<div class="starsvg" aria-label="${esc(T('estrellas.aria', { n }))}">${[1, 2, 3, 4, 5].map((i) =>
      `<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><path class="${i <= n ? 'on' : 'off'}" style="animation-delay:${i * 0.15}s" d="${path}"/></svg>`).join('')}</div>`;
  }
  function condBar(v) {
    const cls = v < 40 ? 'red' : v < 70 ? 'amber' : '';
    return `<div class="bar ${cls}"><i style="width:${v}%"></i></div>`;
  }
  /* ---------- Rarezas, equipos y personas (dibujos de Art) ---------- */
  const rar = (type) => { try { return A.rarity ? A.rarity(type) : { key: 'comun', label: 'Común', color: '#9aa6bb' }; } catch (e) { return { key: 'comun', label: 'Común', color: '#9aa6bb' }; } };
  const rlabel = (r) => (I18 && I18.T.has('rareza.' + r.key) ? T('rareza.' + r.key) : TL(r.label));
  const rtag = (type) => { const r = rar(type); return `<span class="rtag" style="--rc:${r.color}">${esc(rlabel(r))}</span>`; };
  const itemArt = (type, size, cls) => { try { return A.item ? A.item(type, size).replace('class="itemart', `class="itemart ${cls || ''}`) : tile(type); } catch (e) { return tile(type); } };
  const avatarOf = (p, size) => { try { return A.avatar ? A.avatar(p.name, p.role, size || 52, { owner: p.owner, premium: p.premium }) : tile('role_' + p.role); } catch (e) { return tile('role_' + p.role); } };
  const itemName = (type) => TL((G.CATALOG[type] || { name: type }).name);
  const roleName = (r) => TL(G.ROLES[r] ? G.ROLES[r].name : r);
  const eventName = (type) => TL((G.EVENT_TYPES[type] || { name: type }).name);
  const vipBloqueado = (e) => { try { return !!(Pm && Pm.bloqueado && Pm.bloqueado(e)); } catch (err) { return false; } };
  const wageFor = (p, diff) => { try { return G.eventWage ? G.eventWage(p, diff) : p.wage; } catch (e) { return p.wage; } };
  const emptyState = (iconName, title, text) => `<div class="card empty"><div class="ei">${I(iconName)}</div><b>${title}</b><div class="small">${text}</div></div>`;
  const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function duelBars(you, mega, label) {
    const won = you > mega;
    return `<div class="duel ${won ? 'won' : ''}">
      <div class="row between small"><span>${I('rival', 'sm')} ${label || T('duelo.titulo')}</span>${label ? '' : `<b class="${won ? 'up' : 'down'}">${won ? T('duelo.ganando') : T('duelo.perdiendo')}</b>`}</div>
      <div class="lbl"><span>${T('duelo.tu_calidad')}</span><b class="num">${you}</b></div><div class="bar you"><i style="width:${Math.max(0, Math.min(100, you))}%"></i></div>
      <div class="lbl"><span>${T('duelo.mega_promete')}</span><b class="num">${mega}</b></div><div class="bar mega"><i style="width:${Math.max(0, Math.min(100, mega))}%"></i></div></div>`;
  }
  // Confeti de celebración (DOM liviano, solo transform/opacity)
  // Celulares modestos (4 núcleos o menos, 2 GB o menos): la mitad de confeti
  const equipoModesto = (() => { try { return (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2; } catch (e) { return false; } })();
  function confetti(n) {
    if (reduceMotion() || !n) return;
    if (equipoModesto) n = Math.max(6, Math.round(n / 2));
    const box = document.createElement('div');
    box.className = 'confetti';
    const cols = ['#ff3b3b', '#ffb020', '#4da3ff', '#2ecc71', '#ffd34d', '#b57bff'];
    let h = '';
    for (let i = 0; i < n; i++) {
      const left = Math.random() * 100;
      h += `<i style="left:${left.toFixed(1)}%;background:${cols[i % cols.length]};--x:${((Math.random() - 0.5) * 160).toFixed(0)}px;--y:${(70 + Math.random() * 40).toFixed(0)}vh;--r:${(360 + Math.random() * 540).toFixed(0)}deg;--d:${(1.4 + Math.random() * 1.2).toFixed(2)}s;--w:${(Math.random() * 0.4).toFixed(2)}s;${i % 3 ? '' : 'width:6px;height:6px;border-radius:50%;'}"></i>`;
    }
    box.innerHTML = h;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3200);
  }
  // Cuenta de dinero animada en el resultado
  function countUp(el, to, ms) {
    if (!el) return;
    const fmt = (v) => (v < 0 ? '-' : '+') + M(Math.abs(v));
    if (reduceMotion()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    let ultimo = null;
    const step = (t) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (t - t0) / (ms || 900));
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(to * e);
      if (v !== ultimo) { ultimo = v; el.textContent = fmt(v); }   // solo si cambió el número
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const TILE_COLOR = { misa: 'amber', boda: 'amber', prensa: 'blue', barrial: 'green', graduacion: 'blue', lanzamiento: 'red', concierto: 'red', ligapro: 'green', final: 'amber',
    boxeo: 'red', lucha_libre: 'red', funeral: '', lanzamiento_autos: 'amber', irl: 'blue', internacional_unilateral: 'blue', internacional_host: 'blue' };
  const tile = (iconName, color) => `<div class="tile ${color ? 't-' + color : ''}">${I(iconName)}</div>`;
  function reqTags(c) {
    const t = [];
    if (c.story) t.push(`<span class="tag amber">${I('star')}${T('req.historia')}</span>`);
    if (c.rival) t.push(`<span class="tag rival">${I('rival')}${T('req.rival')}</span>`);
    t.push(`<span class="tag">${I('cam_basic')}${T('req.camaras', { n: c.cams })}</span>`);
    if (c.cams >= 2) t.push(`<span class="tag">${I('switch_pro')}${T('req.switcher')}</span>`);
    if (c.audio) t.push(`<span class="tag">${I('role_audio')}${T('req.audio')}</span>`);
    if (c.stream) t.push(`<span class="tag red">${I('stream')}${T('req.stream')}</span>`);
    if (c.outdoor) t.push(`<span class="tag amber">${I('outdoor')}${T('req.outdoor')}</span>`);
    return t.join('');
  }
  // Personaje de cada capítulo (si la lógica no lo indica)
  const CH_CHAR = ['ramiro', 'ramiro', 'marca', 'mega', 'dirigente', 'ramiro'];
  const charOf = (i) => (G.CHAPTERS[i] && G.CHAPTERS[i].character) || CH_CHAR[i] || 'ramiro';
  function speaker(key, html) {
    return `<div class="speaker">${A.portrait(key, 64)}<div class="grow"><div class="who">${esc(TL(A.PORTRAIT_NAMES[key] || ''))}</div></div></div>
      <div class="bubble story">${html}</div>`;
  }

  /* ---------- Render general ---------- */
  let lastHead = null, lastTab = null;
  function bump(id, up) {
    const el = $(id);
    if (!el || reduceMotion()) return;
    // 'bump-down' y no 'down': la clase global .down pinta el texto de rojo y se quedaba así
    el.classList.remove('bump', 'bump-down'); void el.offsetWidth;
    el.classList.add('bump'); if (!up) el.classList.add('bump-down');
  }
  /* ---------- Ayuda y soporte (solo con servidor) ---------- */
  const sinLeerSoporte = () => { try { return Math.max(0, Number(Api.estado && Api.estado.soporte_sin_leer) || 0); } catch (e) { return 0; } };
  function soporteBtn(extra) {
    if (!window.Soporte || Api.disponible !== true) return '';
    const n = sinLeerSoporte();
    return `<button class="btn ${extra || ''}" data-act="soporte">${AYUDA}${T('soporte.titulo')}${n ? `<span class="badge sop" aria-label="${esc(T('soporte.sin_leer', { n }))}">${N(n)}</span>` : ''}</button>`;
  }
  function ctxSoporte() {
    return { Api, A, estado: () => S, toast, snd, openModal,
      closeModal: () => { closeModal(); render(); if (Api.disponible && Api.logueado()) Api.refrescar().then(() => render()).catch(() => {}); } };
  }
  function render() {
    marcarDia();
    $('hMoney').textContent = M(S.money);
    $('hMoney').classList.toggle('neg', S.money < 0);
    $('hRep').textContent = Math.floor(S.rep);
    $('hDay').textContent = S.day;
    if (lastHead) {
      if (S.money !== lastHead.m) bump('cMoney', S.money > lastHead.m);
      if (Math.floor(S.rep) !== lastHead.r) bump('cRep', Math.floor(S.rep) > lastHead.r);
      if (S.day !== lastHead.d) bump('cDay', true);
    }
    lastHead = { m: S.money, r: Math.floor(S.rep), d: S.day };
    if (lastTab !== tab) {
      const sec = $('tab-' + tab);
      if (sec && lastTab !== null) { sec.classList.remove('enter'); void sec.offsetWidth; sec.classList.add('enter'); }
      lastTab = tab;
    }
    $('badgeC').textContent = S.contracts.length || '';
    $('muteBtn').innerHTML = I(snd.muted() ? 'close' : 'sound', 'sm');
    $('muteBtn').setAttribute('aria-label', snd.muted() ? T('head.sonido_on') : T('head.silenciar'));
    const mb = $('musicBtn');
    if (mb) {
      mb.hidden = !window.Musica;
      mb.innerHTML = mus.muted() ? NOTA_OFF : NOTA;
      mb.setAttribute('aria-label', mus.muted() ? T('head.musica_on') : T('head.musica_off'));
      mb.setAttribute('aria-pressed', mus.muted() ? 'false' : 'true');
    }
    pintarIdiomaBtn();
    // El registro completo se abre desde Inicio (su lugar en la barra lo ocupa "En línea")
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === (tab === 'registro' ? 'inicio' : tab)));
    // Las pestañas que no se ven quedan vacías (menos nodos en la página); se vuelven a pintar al abrirlas
    document.querySelectorAll('main section').forEach((s) => { const on = s.id === 'tab-' + tab; s.classList.toggle('on', on); if (!on && s.firstChild) s.textContent = ''; });
    if (Pm && Pm.tickVip(S)) { try { localStorage.setItem(SAVE_KEY, G.serialize(S)); } catch (e) { /* nada */ } }
    $('vipBadge').hidden = !(Pm && Pm.vip);
    const bo = $('badgeO');
    if (bo) bo.textContent = avisosOnline() || '';
    if (tab !== 'online' && montado) desmontarOnline();
    ({ inicio: renderInicio, clientes: renderClientes, personal: renderPersonal, bodega: renderBodega, tienda: renderTienda, registro: renderRegistro, online: renderOnline })[tab]();
    if (S.gameOver && !$('overlay').classList.contains('on')) showGameOver();
  }

  function renderInicio() {
    const ch = G.CHAPTERS[S.chapter];
    const rent = G.dailyCost ? G.dailyCost(S) : 20 + 4 * (S.staff.length - 1);
    let cb = null;
    try { cb = G.dailyCostBreakdown ? G.dailyCostBreakdown(S) : null; } catch (e) { cb = null; }
    const costBox = cb ? `<div class="costbox"><div class="ci">${I('home')}</div><div class="t">
        <b style="font-family:inherit">${esc(venueName() || TL(cb.place))}</b> · ${T('inicio.gastos_hoy')} <b class="neg">${M(cb.total)}</b>
        <div class="small muted">${T('inicio.local', { m: M(cb.rent) })}${cb.staff ? ` · ${T('inicio.c_personal', { m: M(cb.staff + (cb.payroll || 0)) })}` : ''}${cb.equip ? ` · ${T('inicio.c_seguro', { m: M(cb.equip) })}` : ''}</div>
        ${cb.nextPlace ? `<div class="small" style="color:var(--amber)">${T('inicio.siguiente_local', { n: cb.nextAt, tienes: cb.size, lugar: esc(TL(cb.nextPlace)), m: M(cb.nextRent) })}</div>` : ''}
      </div></div>` : '';
    let story;
    if (S.storyDone) {
      story = `<div class="card"><div class="story-tag">${T('historia.modo')}</div><h2>${T('historia.completada')}</h2>
        <p class="muted">${T('historia.libre')}</p></div>`;
    } else {
      story = `<div class="card"><div class="story-tag">${T('historia.tag')}</div><h2>${esc(TL(ch.title))}</h2>
        <div class="row" style="align-items:flex-start;margin-top:8px">${A.portrait(charOf(S.chapter), 52)}
          <p class="small muted grow" style="margin:0">${esc(TL(ch.intro))}</p></div>
        <p><b>${T('historia.objetivo')}</b> ${esc(TL(ch.goal))}</p>
        <p class="small">${T('historia.progreso')} <span class="num">${esc(TL(ch.progress(S)))}</span></p>
        <p class="small muted">${T('historia.premio')} <span class="pay" style="font-size:14px">${M(ch.reward)}</span></p></div>`;
    }
    // En rojo: avisar antes de la quiebra
    const rojo = S.money < 0 && !S.gameOver
      ? `<div class="redstrip" role="status">${I('bolt', 'sm')}<span>${T('inicio.en_rojo', { m: `<b class="num">${M(bankruptAt())}</b>` })}</span></div>` : '';
    $('tab-inicio').innerHTML = `${rojo}
      <div class="card hqcard">${A.hq(S)}
        <div class="in">
          <div class="row wrap small">
            <span class="tag">${I('people')}${T('inicio.personas', { n: S.staff.length })}</span>
            <span class="tag">${I('box')}${T('inicio.equipos', { n: S.equip.length })}</span>
            <span class="tag">${I('rec')}${T('inicio.eventos', { n: S.stats.events })}</span>
            <span class="tag">${I('star')}${T('inicio.eventos_5e', { n: S.stats.fiveStars })}</span>
          </div>
          ${costBox}
          <button class="btn main" data-act="tab" data-tab="clientes">${I('clients')}${T('inicio.ver_ofertas', { n: S.contracts.length })}</button>
          <button class="btn" data-act="next-day">${I('sleep')}${T('inicio.descansar')} <span class="muted small">(${T('inicio.gastos', { m: M(cb ? cb.total : rent) })})</span></button>
        </div>
      </div>
      ${installCard()}
      ${story}
      <div class="sectitle">${T('inicio.ultimo')}</div>
      <div class="card log">${S.log.slice(0, 6).map((l) => `<p><span>${T('comun.dia_n', { n: l.day })}</span>${esc(gtx(l, l.text))}</p>`).join('')}
        <button class="btn sm" data-act="tab" data-tab="registro" style="margin-top:10px">${I('log', 'sm')} ${T('inicio.ver_registro')}</button></div>
      <div class="sectitle">${T('inicio.ayuda')}</div>
      <div class="card small muted">${T('inicio.ayuda_texto', { clientes: `<b>${T('nav.clientes')}</b>`, bodega: `<b>${T('nav.bodega')}</b>`, m: M(-bankruptAt()) })}</div>
      <button class="btn" data-act="idioma">${I('stream')}${T('idioma.boton')}: ${esc(nombreIdioma())}</button>
      ${soporteBtn()}
      <button class="btn" data-act="new-game" style="margin-bottom:20px">${I('refresh')}${T('inicio.nueva')}</button>`;
  }

  // Botón para instalar como app (solo si el navegador lo permite)
  function installCard() {
    const P = window.PWA;
    try {
      if (!P || P.isStandalone()) return '';
      if (P.canInstall()) return `<button class="btn" data-act="install">${I('box')}${T('pwa.instalar')}</button>`;
      if (P.isIOS()) return `<div class="card small muted">${I('tip', 'sm')} ${T('pwa.ios', { compartir: `<b>${T('pwa.compartir')}</b>`, agregar: `<b>${T('pwa.agregar')}</b>` })}</div>`;
    } catch (e) { /* sin instalación */ }
    return '';
  }

  function renderClientes() {
    const cards = S.contracts.map((c) => {
      return `<div class="card">
        <div class="row">${tile(c.type, TILE_COLOR[c.type])}
          <div class="grow"><h3>${esc(eventName(c.type))}</h3><div class="small muted">${esc(TL(c.client))}</div></div>
          <div class="pay">${M(c.pay)}</div></div>
        <div style="margin-top:6px">${reqTags(c)}</div>
        ${PE ? PE.internacional(c) : ''}
        ${c.rival && typeof c.rivalQuality === 'number' ? `<div class="duel small" style="margin-top:8px"><div class="row between"><span>${I('rival', 'sm')} ${T('clientes.mega_promete')} <b class="num">${c.rivalQuality}</b></span><span class="muted">${T('clientes.superala')}</span></div><div class="bar mega"><i style="width:${c.rivalQuality}%"></i></div></div>` : ''}
        <div class="row between small" style="margin-top:8px">
          <span>${T('clientes.dificultad')} ${starsTxt(c.diff)}</span>
          <span class="${c.daysLeft <= 1 ? 'neg' : 'muted'}">${I('clock', 'sm')} ${T('clientes.vence', { n: c.daysLeft })}</span>
        </div>
        <button class="btn main" data-act="prep" data-id="${c.id}">${T('clientes.preparar')}</button>
      </div>`;
    }).join('');
    $('tab-clientes').innerHTML = `
      <div class="sectitle">${T('clientes.buscar')}</div>
      <div class="card">
        <button class="btn" data-act="mkt" data-k="redes" ${S.daily.redes ? 'disabled' : ''}>${I('social')}${T('clientes.redes')} <span class="muted small">(${T('clientes.redes_det', { m: M(40) })})</span></button>
        <button class="btn" data-act="mkt" data-k="anuncio" ${S.daily.anuncio ? 'disabled' : ''}>${I('ad')}${T('clientes.anuncio')} <span class="muted small">(${T('clientes.anuncio_det', { m: M(200) })})</span></button>
        <button class="btn" data-act="mkt" data-k="visitar">${I('walk')}${T('clientes.visitar')} <span class="muted small">(${T('clientes.visitar_det')})</span></button>
      </div>
      <div class="sectitle">${T('clientes.disponibles', { n: S.contracts.length })}</div>
      ${cards || emptyState('clients', T('clientes.vacio_t'), T('clientes.vacio'))}`;
  }

  /* ---------- Personal ---------- */
  // Experiencia: eventos nacionales e internacionales trabajados
  // Nivel (Junior… Internacional) y experiencia: eventos nacionales e internacionales trabajados
  function expLine(p, conExp) {
    const nac = typeof p.eventos_nacionales === 'number' ? p.eventos_nacionales : (p.events || 0);
    const intl = p.eventos_internacionales || 0;
    return `<div class="exp small">${tierBadge(p)}<span class="skill" title="${esc(T('personal.habilidad'))}" aria-label="${esc(T('personal.habilidad'))} ${p.skill}/5">${starsTxt(p.skill)}</span></div>
      ${conExp ? `<div class="exp small"><span>${I('flag', 'sm')}${T('personal.nacionales', { n: nac })}</span><span class="${intl ? 'intl' : ''}">${I('globe', 'sm')}${T('personal.internacionales', { n: intl })}</span></div>` : ''}`;
  }
  function rolLine(p) {
    return `<div class="rolrow"><span class="roleic">${I(roleIcon(p.role), 'sm')}</span><span class="rn">${esc(roleName(normRole(p.role)))}</span></div>`;
  }
  function renderPersonal() {
    const ord = (p) => (p.owner ? -1 : ((G.ROLES[normRole(p.role)] || {}).orden || 0));
    const lista = S.staff.slice().sort((a, b) => ord(a) - ord(b) || (b.skill - a.skill));
    const staff = lista.map((p) => `<div class="card staffc">
      <div class="person">${avatarOf(p, 56)}
        <div class="grow who"><h3>${esc(TL(p.name))}${p.premium ? `<span class="badge-p">${T('personal.estrella')}</span>` : ''}</h3>${rolLine(p)}${expLine(p, true)}</div></div>
      ${p.owner ? `<p class="small muted" style="margin:8px 0 0">${T('personal.eres_tu')}</p>` : `
      <div class="small muted" style="margin-top:8px">${T('personal.moral', { n: p.morale })}</div>${condBar(p.morale)}
      <div class="row between" style="margin-top:10px"><span class="small">${T('personal.cobra_evento', { m: `<b class="num">${M(p.wage)}</b>` })}</span>
        <button class="btn sm" data-act="fire" data-id="${p.id}">${T('personal.despedir')}</button></div>`}
    </div>`).join('');
    const max = maxStaff();
    const lleno = S.staff.length >= max;
    const fee = (c) => c.wage * ((BAL().wage && BAL().wage.hireFeeDays) || 2);
    const cands = S.candidates.map((c) => `<div class="card staffc cand">
      <div class="person">${avatarOf(c, 56)}
        <div class="grow who"><h3>${esc(TL(c.name))}</h3>${rolLine(c)}${expLine(c, !!c.eventos_internacionales)}</div></div>
      <div class="row between" style="margin-top:10px"><span class="small">${T('personal.cobra_evento', { m: `<b class="num">${M(c.wage)}</b>` })}</span>
        ${lleno ? `<button class="btn sm" disabled>${T('personal.equipo_completo', { n: S.staff.length, max })}</button>`
          : `<button class="btn sm main" data-act="hire" data-id="${c.id}" ${S.money < fee(c) ? 'disabled' : ''}>${T('personal.contratar', { m: M(fee(c)) })}</button>`}</div>
    </div>`).join('');
    // Resumen por puesto (íconos con cuántos tienes de cada uno)
    const cuenta = {};
    S.staff.forEach((p) => { const k = normRole(p.role); cuenta[k] = (cuenta[k] || 0) + 1; });
    const keys = (G.ROLE_KEYS || Object.keys(G.ROLES)).filter((k) => cuenta[k]);
    const resumenRoles = keys.length ? `<div class="rolesum">${keys.map((k) => `<span class="tag" title="${esc(roleName(k))}">${I(roleIcon(k))}${N(cuenta[k])}</span>`).join('')}</div>` : '';
    const opciones = (G.ROLE_KEYS || Object.keys(G.ROLES)).map((k) => `<option value="${esc(k)}" ${rolBuscar === k ? 'selected' : ''}>${esc(roleName(k))}</option>`).join('');
    $('tab-personal').innerHTML = `
      <div class="sectitle">${T('personal.tu_equipo', { n: S.staff.length, max })}</div>
      ${resumenRoles}${staff}
      <div class="sectitle">${T('personal.candidatos')}</div>
      <p class="small muted">${T('personal.pago_inicial')}</p>
      ${lleno ? `<div class="redstrip amberstrip" role="status">${I('home', 'sm')}<span>${T('personal.lleno_local', { lugar: esc(venueName()), n: S.staff.length, max })}</span></div>` : ''}
      ${cands || emptyState('people', T('personal.vacio_t'), T('personal.vacio'))}
      <div class="card buscar">
        <label class="field" for="rolBuscar">${T('personal.buscar_puesto')}
          <select id="rolBuscar" data-act="rol-buscar"><option value="">${T('personal.cualquier_puesto')}</option>${opciones}</select></label>
        <button class="btn" data-act="search-staff" ${S.money < 30 ? 'disabled' : ''}>${I('megaphone')}${T('personal.vacante', { m: M(30) })}</button>
      </div><div style="height:12px"></div>`;
  }

  /* ---------- Bodega y tienda de equipos ---------- */
  // Requisitos de un equipo en corto: puestos con su nombre; equipos con rq.<clave>
  function rqLabel(k) {
    const rk = normRole(k);
    if (G.ROLES[rk]) return roleName(rk);
    if (I18 && I18.T.has('rq.' + k)) return T('rq.' + k);
    return String(k).replace(/_/g, ' ');
  }
  function qPips(q) {
    const n = Math.max(0, Math.min(6, q || 0));
    return `<span class="qp" aria-label="${esc(T('bodega.calidad_n', { n }))}">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  }
  function categorias() {
    try { if (G.shopByCategory) return G.shopByCategory(S); } catch (e) { /* abajo */ }
    // Lógica sin categorías: todo en una lista
    return [{ key: 'todo', nombre: T('bodega.tienda'), icon: 'box', items: Object.keys(G.CATALOG).filter((k) => !G.CATALOG[k].premium)
      .map((k) => Object.assign({}, G.CATALOG[k], { key: k, locked: G.CATALOG[k].minRep > S.rep, owned: S.equip.filter((e) => e.type === k).length })) }];
  }
  function shopCard(it, llena, maxEq) {
    const k = it.key;
    const r = rar(k);
    const locked = !!it.locked;
    const owned = it.owned || 0;
    const rq = (it.requiere || []).map(rqLabel);
    const ac = (it.acepta || []).map(rqLabel);
    const label = locked ? `${I('lock', 'sm')} ${T('bodega.fama_min', { n: it.minRep })}` : llena ? T('bodega.llena', { n: S.equip.length, max: maxEq })
      : it.alquiler ? T('bodega.reservar', { m: M(it.price) }) : M(it.price);
    return `<div class="card gear shopc rf r-${r.key} ${locked ? 'locked' : ''}">
      <div class="row between">${rtag(k)}</div>
      <div class="art">${itemArt(k, 110)}${owned ? `<span class="owned">×${owned}</span>` : ''}${it.alquiler ? `<span class="rent rentov" title="${esc(T('bodega.alquiler_det'))}">${I('clock', 'sm')}${T('bodega.alquiler')}</span>` : ''}${locked ? `<span class="lockov">${I('lock', 'lg')}</span>` : ''}</div>
      <div class="nm">${esc(TL(it.name))}</div><div class="ds">${esc(TL(it.desc || ''))}</div>
      <div class="qrow">${T('bodega.calidad')} ${qPips(it.q)}</div>
      ${rq.length ? `<div class="rq"><b>${T('bodega.necesita')}</b> ${rq.map(esc).join(' · ')}</div>` : ''}
      ${ac.length ? `<div class="rq ac"><b>${T('bodega.acepta')}</b> ${ac.map(esc).join(' · ')}</div>` : ''}
      ${locked ? `<div class="lockwhy">${T('bodega.desbloquea', { n: it.minRep })}</div>` : ''}
      <div class="grow2"></div>
      <button class="btn ${locked || llena ? '' : 'green'}" data-act="buy" data-k="${esc(k)}" ${locked || llena || S.money < it.price ? 'disabled' : ''}>${label}</button></div>`;
  }
  function renderBodega() {
    const cons = Object.keys(G.CONSUMABLES).map((k) => {
      const it = G.CONSUMABLES[k];
      return `<div class="pick">${itemArt(k, 48, 'mini')}
        <div class="grow"><b>${esc(TL(it.name))}</b> <span class="num">× ${S.stock[k] || 0}</span><div class="small muted">${esc(TL(it.desc))}</div></div>
        <button class="btn sm" data-act="buy-cons" data-k="${k}">+1 ${M(it.price)}</button></div>`;
    }).join('');
    // Equipos ordenados por rareza (lo más valioso primero) y luego por estado
    const RORD = { vip: 0, exclusivo: 1, elite: 2, pro: 3, comun: 4 };
    const sorted = S.equip.slice().sort((a, b) => (RORD[rar(a.type).key] - RORD[rar(b.type).key]) || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || (a.id - b.id));
    const mine = sorted.map((e) => {
      const it = G.CATALOG[e.type] || { name: e.type, desc: '' };
      const r = rar(e.type);
      let rc = 0;
      try { rc = G.repairCost(e); } catch (err) { rc = 0; }
      const off = vipBloqueado(e);
      if (it.alquiler) {
        return `<div class="card gear rf r-${r.key} rented">
        <div class="row between">${rtag(e.type)}</div>
        <div class="art">${itemArt(e.type, 110)}<span class="rent rentov">${I('clock', 'sm')}${T('bodega.alquiler')}</span></div>
        <div class="nm">${esc(TL(e.nick || it.name))}</div>
        <div class="small" style="color:var(--amber);margin-top:4px">${T('bodega.reservado')}</div>
        <div class="grow2"></div>
        <button class="btn sm" data-act="sell" data-id="${e.id}">${T('bodega.cancelar_alquiler', { m: M(G.sellPrice(e)) })}</button></div>`;
      }
      return `<div class="card gear rf r-${r.key} ${e.condition < 40 ? 'worn' : ''}">
        <div class="row between">${rtag(e.type)}${e.serie ? `<span class="num small muted">#${String(e.serie).padStart(4, '0')}</span>` : ''}</div>
        <div class="art">${itemArt(e.type, 110)}</div>
        <div class="nm">${esc(TL(e.nick || it.name))}</div>
        ${off ? `<div class="small" style="color:var(--amber)">${T('bodega.guardado_vip')}</div>` : ''}
        <div class="grow2"></div>
        <div class="cond"><span>${T('bodega.estado')}</span><b class="num ${e.condition < 40 ? 'neg' : ''}">${e.condition}%</b></div>${condBar(e.condition)}
        <div class="row2">
          <button class="btn sm" data-act="repair" data-id="${e.id}" ${rc <= 0 ? 'disabled' : ''}>${I('wrench', 'sm')}${rc > 0 ? M(rc) : T('bodega.nuevo')}</button>
          ${it.premium ? `<button class="btn sm" disabled>${T('bodega.no_se_vende')}</button>` : `<button class="btn sm" data-act="sell" data-id="${e.id}">${T('bodega.vender', { m: M(G.sellPrice(e)) })}</button>`}</div></div>`;
    }).join('');
    const maxEq = maxEquip();
    const llena = S.equip.length >= maxEq;
    const cats = categorias();
    let cur = cats.find((c) => c.key === catSel);
    if (!cur) { cur = cats[0]; catSel = cur ? cur.key : ''; }
    const chips = cats.length > 1 ? `<div class="catrow" role="tablist" aria-label="${esc(T('bodega.categorias'))}">${cats.map((c) => {
      return `<button class="catchip ${c.key === catSel ? 'on' : ''}" role="tab" aria-selected="${c.key === catSel}" data-act="cat" data-k="${esc(c.key)}">${I(c.icon || 'box', 'sm')}<span>${esc(TL(c.nombre || c.name || c.key))}</span><b>${N(c.items.length)}</b></button>`;
    }).join('')}</div>` : '';
    const shop = cur ? cur.items.map((it) => shopCard(it, llena, maxEq)).join('') : '';
    const nota = cur && cur.key === 'service' ? `<p class="small muted" style="margin-top:-2px">${T('bodega.alquiler_det')}</p>` : '';
    $('tab-bodega').innerHTML = `
      <div class="sectitle">${T('bodega.repuestos')}</div><p class="small muted" style="margin-top:-4px">${T('bodega.repuestos_det')}</p><div class="card">${cons}</div>
      <div class="sectitle">${T('bodega.tus_equipos', { n: S.equip.length })}${llena ? ` <span class="neg">· ${T('bodega.llena_local', { lugar: esc(venueName()), n: S.equip.length, max: maxEq })}</span>` : ''}</div>
      ${mine ? `<div class="ggrid">${mine}</div>` : emptyState('box', T('bodega.vacia_t'), T('bodega.vacia'))}
      <p class="small muted">${T('bodega.desgaste')}</p>
      <div class="sectitle" id="tiendaEq">${T('bodega.tienda')}</div>${chips}
      ${cur ? `<div class="cathead"><b>${esc(TL(cur.nombre || cur.name || ''))}</b><span class="small muted">${T('bodega.n_equipos', { n: cur.items.length })}</span></div>` : ''}${nota}
      <div class="ggrid">${shop}</div><div style="height:20px"></div>`;
    // La categoría elegida queda visible en la fila de categorías
    const on = document.querySelector('.catrow .catchip.on');
    if (on && on.parentElement) { try { const row = on.parentElement; row.scrollLeft = Math.max(0, on.offsetLeft - row.clientWidth / 2 + on.clientWidth / 2); } catch (e) { /* nada */ } }
  }

  /* ---------- Tienda (dinero real y créditos) ---------- */
  const precio = (n) => (I18 ? I18.money(n, { dec: 2 }) : '$' + Number(n).toFixed(2).replace('.', ','));
  function fechaCorta(iso) {
    if (I18) return I18.fecha(iso, { day: 'numeric', month: 'long' });
    try { return new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' }); } catch (e) { return ''; }
  }
  let vistaTienda = 'tienda';
  function renderTienda() {
    const el = $('tab-tienda');
    if (vistaTienda === 'mercado' && Api.disponible && Api.estado && Api.estado.logueado && window.Mercado) {
      el.innerHTML = `${selectorTienda()}<div id="merc-cont"></div>`;
      window.Mercado.render($('merc-cont'), ctxMercado());
      return;
    }
    if (Api.disponible === null) { el.innerHTML = `<div class="sectitle">${T('nav.tienda')}</div><div class="card muted">${T('tienda.conectando')}</div>`; return; }
    const app = enApp();   // dentro de la app de Google Play: nada de Plux ni de la tienda web
    if (!Api.disponible || !Api.estado) {
      const vitrina = Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].premium).slice(0, 4).map((k) => {
        const r = rar(k);
        return `<div class="card gear rf r-${r.key}"><div class="row between">${rtag(k)}</div><div class="art">${itemArt(k, 110)}</div><div class="nm">${esc(TL(G.CATALOG[k].name))}</div><div class="ds">${esc(TL(G.CATALOG[k].desc || ''))}</div></div>`;
      }).join('');
      const aviso = app
        ? `<h3>${T('tienda.sin_conexion_t')}</h3><p class="small muted" style="margin:4px 0 0">${T('tienda.sin_conexion')}</p>`
        : `<h3>${T('tienda.offline_t', { sitio: 'juego.tukanec.com' })}</h3><p class="small muted" style="margin:4px 0 0">${T('tienda.offline', { sitio: '<b>juego.tukanec.com</b>' })}</p>`;
      el.innerHTML = `<div class="sectitle">${T('nav.tienda')}</div><div class="card rf r-exclusivo">
        <div class="prodrow">${itemArt('creditos_700', 72)}<div class="grow">${aviso}</div></div></div>
        ${vitrina ? `<div class="sectitle">${T('tienda.exclusivos_eq')}</div><div class="ggrid">${vitrina}</div>` : ''}`;
      return;
    }
    const E = Api.estado;
    const log = E.logueado;
    let cuenta;
    if (!log) {
      cuenta = `<div class="card">${tile('user', 'blue')}
        <h3 style="margin-top:10px">${T('cuenta.crea_gratis')}</h3>
        <p class="small muted">${T('cuenta.beneficios')}</p>
        <button class="btn main" data-act="cuenta" data-modo="registro">${I('user')}${T('cuenta.crear')}</button>
        <button class="btn" data-act="cuenta" data-modo="entrar">${T('cuenta.ya_tengo_entrar')}</button></div>`;
    } else {
      const vip = E.vip_activo
        ? `<p class="small" style="color:var(--amber)">${I('crown', 'sm')} ${T('tienda.vip_hasta', { fecha: esc(fechaCorta(E.vip_hasta)) })}</p>
           ${E.vip_bono_hoy ? `<p class="small muted">${T('tienda.vip_bono_ya')}</p>` : `<button class="btn" data-act="vip-bono" style="border-color:var(--amber)">${I('gift')}${T('tienda.vip_bono', { m: M(150), n: 10 })}</button>`}`
        : '';
      cuenta = `<div class="card">
        <div class="row between"><div class="wallet">${I('gem')}<div><div class="big">${N(E.creditos)}</div><div class="small muted">${T('tienda.creditos_lbl')}</div></div></div>
          <div class="small muted" style="text-align:right">${esc(E.jugador.nombre)}<br>${esc(E.jugador.email)}</div></div>
        ${vip}
        <p class="small muted">${I('cloud', 'sm')} ${nubeEstado === 'error' ? T('tienda.nube_error') : T('tienda.nube_ok')}</p>
        ${discordBtn('sm')}
        <button class="btn sm" data-act="salir">${T('cuenta.salir')}</button></div>`;
    }
    const prueba = !app && E.plux && E.plux.ambiente === 'sandbox' ? `<p class="small" style="color:var(--amber)">${T('tienda.sandbox')}</p>` : '';
    // En la app: solo lo que Google Play tiene activo, con su precio; nunca la transferencia de cuenta
    const lista = (E.tienda.productos || []).filter((p) => !app || (playOk && preciosPlay[p.id] && p.id !== 'transferencia_cuenta'));
    const puedePagar = app ? playOk : !!(E.plux && E.plux.disponible);
    const productos = lista.map((p) => {
      const dest = p.id === 'inicio';
      const hecho = dest && E.inicio_comprado;
      const valor = app ? esc(preciosPlay[p.id].precio) : precio(p.precio);
      return `<div class="card prod ${dest ? 'dest' : ''} ${p.id === 'vip30' ? 'rf r-vip' : ''}">${dest ? `<span class="ribbon">${T('tienda.oferta_unica')}</span>` : p.id === 'vip30' ? '<span class="ribbon">VIP</span>' : ''}
        <div class="prodrow">${itemArt(p.id, 64)}
          <div class="grow"><h3>${esc(TL(p.nombre))}</h3><div class="small muted">${esc(TL(p.detalle || ''))}</div></div></div>
        <div class="row between" style="margin-top:10px"><span class="price">${valor}</span>
          <button class="btn sm main" data-act="comprar" data-k="${esc(p.id)}" ${hecho || !puedePagar ? 'disabled' : ''}>${hecho ? T('tienda.ya_tienes') : T('tienda.comprar')}</button></div></div>`;
    }).join('');
    const sinPago = app
      ? (playOk ? '' : `<div class="card small muted">${T('tienda.play_no_disp')}</div>`)
      : (E.plux && E.plux.disponible ? '' : `<div class="card small muted">${T('tienda.pago_inactivo')}</div>`);
    const premium = (E.tienda.premium || []).map((p) => {
      const alcanza = log && E.creditos >= p.creditos;
      const esEquipo = !!G.CATALOG[p.id];
      const rk = p.vip ? 'vip' : esEquipo ? rar(p.id).key : 'comun';
      const rl = p.vip ? { label: 'VIP', color: '#ffd34d' } : rar(p.id);
      return `<div class="card gear rf r-${rk}">
        <div class="row between">${esEquipo || p.vip ? `<span class="rtag" style="--rc:${rl.color}">${esc(p.vip ? 'VIP' : rlabel(rl))}</span>` : `<span class="rtag">${T('tienda.ayuda')}</span>`}</div>
        <div class="art">${itemArt(p.id, 110)}</div>
        <div class="nm">${esc(TL(p.nombre))}</div><div class="ds">${esc(TL(p.detalle || ''))}</div><div class="grow2"></div>
        <div class="cr" style="margin-top:8px">${I('gem', 'sm')} ${N(p.creditos)}</div>
        <button class="btn sm ${alcanza ? 'green' : ''}" data-act="canjear" data-k="${esc(p.id)}" ${log ? '' : 'disabled'}>${alcanza ? T('tienda.canjear') : log ? T('tienda.faltan') : T('tienda.entra_canjear')}</button></div>`;
    }).join('');
    el.innerHTML = `${log && window.Mercado ? selectorTienda() : ''}
      <div class="sectitle">${T('tienda.tu_cuenta')}</div>${cuenta}
      <div class="sectitle">${T('tienda.comprar')}</div>
      ${app && !playOk ? '' : `<p class="small muted">${app ? T('tienda.play_precios') : T('tienda.precios')}</p>`}${prueba}
      ${productos}
      ${sinPago}
      <div class="sectitle">${T('tienda.exclusivos')}</div>${premium ? `<div class="ggrid">${premium}</div>` : emptyState('gem', T('tienda.pronto_t'), T('tienda.pronto'))}
      <p class="small muted">${T('tienda.aviso')}</p>
      ${soporteBtn()}
      <div class="legal"><a href="/terminos.html">${T('tienda.terminos')}</a><a href="/privacidad.html">${T('tienda.privacidad')}</a></div>`;
  }

  function selectorTienda() {
    return `<div class="chat-tabs" style="margin:6px 0 4px;display:flex;gap:6px">
      <button class="btn sm ${vistaTienda === 'tienda' ? 'main' : ''}" data-act="vista-tienda" data-k="tienda" style="flex:1">${I('gem', 'sm')} ${T('nav.tienda')}</button>
      <button class="btn sm ${vistaTienda === 'mercado' ? 'main' : ''}" data-act="vista-tienda" data-k="mercado" style="flex:1">${I('cart', 'sm')} ${T('mercado.titulo')}</button></div>`;
  }
  function ctxMercado() {
    return { Api, G, Pm, A, T, TL, I18N: I18, estado: () => S, toast, ask, openModal, closeModal, snd,
      sincronizar: () => { aplicarEntregas(); save(); } };
  }
  function ctxChat() {
    return { Api, A, T, TL, I18N: I18, toast, ask, snd,
      pagarAsociacion: (m) => { if (S.money < m) { toast(T('chat.asoc_falta_dinero', { m: M(m) })); return false; } S.money -= m; save(); render(); return true; } };
  }

  function abrirCuenta(modo, nota) {
    const reg = modo === 'registro';
    openModal(`<div class="row between"><h2>${reg ? T('cuenta.crear') : T('cuenta.entrar')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      ${nota ? `<p class="small" style="color:var(--amber)">${esc(nota)}</p>` : ''}
      <form id="formCuenta" data-modo="${modo}">
        ${reg ? `<label class="field">${T('cuenta.nombre')}<input id="cu-nombre" autocomplete="name" maxlength="60" required></label>` : ''}
        <label class="field">${T('cuenta.correo')}<input id="cu-email" type="email" autocomplete="email" maxlength="120" required></label>
        <label class="field">${reg ? T('cuenta.clave_min', { n: 8 }) : T('cuenta.clave')}<input id="cu-clave" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="${reg ? 8 : 1}" required></label>
        <p class="small neg" id="cu-error" aria-live="polite"></p>
        <button class="btn main" type="submit" id="cu-btn">${reg ? T('cuenta.crear_mia') : T('cuenta.entrar')}</button>
      </form>
      <button class="btn" data-act="cuenta" data-modo="${reg ? 'entrar' : 'registro'}">${reg ? T('cuenta.ya_tengo') : T('cuenta.no_tengo')}</button>
      <p class="small muted">${T('cuenta.olvido')}</p>`);
  }

  async function enviarCuenta(form) {
    const reg = form.dataset.modo === 'registro';
    const email = $('cu-email').value.trim(), clave = $('cu-clave').value;
    const btn = $('cu-btn'); btn.disabled = true; $('cu-error').textContent = '';
    try {
      if (reg) await Api.registro(email, $('cu-nombre').value.trim(), clave);
      else await Api.entrar(email, clave);
      closeModal();
      invalidarOnline(); vistaOnline = 'hub';
      snd.play('hire');
      toast(reg ? T('cuenta.creada') : T('cuenta.hola', { nombre: Api.estado.jugador.nombre }));
      await alConectar(true);
      if (window.Chat) window.Chat.iniciar(ctxChat());
      restaurarPlay();
    } catch (e) {
      $('cu-error').textContent = TL(e.message); btn.disabled = false; snd.play('error');
    }
  }

  // Después de iniciar sesión o al abrir el juego con sesión: entregas, VIP y partida en la nube
  async function alConectar(recienEntro) {
    const E = Api.estado;
    if (!E) { render(); return; }
    if (Pm) Pm.setVip(E.vip_activo);
    if (E.logueado && recienEntro) await elegirPartida();
    aplicarEntregas();
    render();
  }

  function aplicarEntregas() {
    if (!Pm || !Api.estado || !Api.estado.logueado) return;
    const hechos = Pm.aplicarEntregas(S, Api.estado.entregas);
    if (Array.isArray(Api.estado.inventario) && Pm.sincronizarInventario) {
      const inv = Pm.sincronizarInventario(S, Api.estado.inventario);
      inv.agregados.forEach((t) => hechos.push(T('tienda.llego', { item: TL(t) })));
      if (inv.quitados.length) save();
    }
    if (hechos.length) { save(); toast(TL(hechos[0]) + (hechos.length > 1 ? ' ' + T('comun.mas', { n: hechos.length - 1 }) : '')); snd.play('chapter'); }
  }

  const resumen = (x) => `${T('comun.dia_n', { n: x.day })} · ${G.CHAPTERS[x.chapter] ? esc(TL(G.CHAPTERS[x.chapter].title).split('·')[0].trim()) : T('historia.completa')} · ${M(x.money)} · ${T('inicio.eventos', { n: x.stats.events })}`;
  async function elegirPartida() {
    let nube = null;
    try { const r = await Api.partida(); nube = r.datos ? G.deserialize(r.datos) : null; } catch (e) { return; }
    const localNueva = S.stats.events === 0 && S.day <= 1;
    if (!nube) { await subirNube(); return; }
    if (localNueva) { S = nube; save(); return; }
    if (nube.day === S.day && nube.money === S.money && nube.stats.events === S.stats.events) return;
    cloudPendiente = true;
    await new Promise((listo) => {
      eleccion = (cual) => {
        if (cual === 'nube') { S = nube; }
        cloudPendiente = false;
        save(); subirNube(); closeModal(); render(); listo();
      };
      openModal(`<h2>${T('nube.titulo')}</h2>
        <p class="small muted">${T('nube.texto')}</p>
        <button class="btn" data-act="partida" data-k="nube">${I('cloud')}${T('nube.nube')}<br><span class="small muted">${resumen(nube)}</span></button>
        <button class="btn" data-act="partida" data-k="local">${I('social')}${T('nube.local')}<br><span class="small muted">${resumen(S)}</span></button>
        <p class="small muted">${T('nube.reemplaza')}</p>`);
    });
  }
  let eleccion = null;

  // Se llama directo desde el clic: en la app, GooglePlay.comprar() va primero (sin nada esperado antes),
  // porque Chrome exige un toque reciente para abrir la ventana de pago. La nube se guarda después.
  function comprar(id) {
    if (enApp()) { comprarPlay(id); return; }
    comprarWeb(id);
  }
  function comprarPlay(id) {
    if (!GP || !playOk) { toast(T('tienda.play_no_disp')); snd.play('error'); return; }
    if (!Api.logueado()) { abrirCuenta('registro', T('cuenta.para_comprar')); return; }
    let pr;
    try { pr = GP.comprar(id); } catch (e) { pr = Promise.resolve({ ok: false, estado: 'error' }); }
    save();
    Promise.resolve(pr).then(async (r) => {
      r = r || { ok: false, estado: 'error' };
      if (r.ok) {
        snd.play('buy');
        try { await Api.refrescar(); } catch (e) { /* se verá al volver */ }
        aplicarEntregas(); save(); render();
        toast(r.estado === 'ya_entregado' ? T('tienda.gp_ya') : T('tienda.gp_ok'));
        subirNube();
        return;
      }
      if (r.estado === 'cancelado') return;
      if (r.estado === 'sesion_requerida') { abrirCuenta('registro', T('cuenta.para_comprar')); return; }
      if (r.estado === 'pendiente') { toast(T('tienda.gp_pendiente')); return; }
      const porCodigo = r.codigo && I18 && I18.T.has('error.' + r.codigo) ? T('error.' + r.codigo) : null;
      toast(porCodigo || (r.estado === 'ocupado' ? T('tienda.gp_ocupado') : r.estado === 'no_disponible' ? T('tienda.play_no_disp') : T('tienda.gp_error')));
      snd.play('error');
    }).catch(() => { toast(T('tienda.gp_error')); snd.play('error'); });
  }
  // Precios de Google Play y compras que quedaron sin confirmar (al abrir el juego y al entrar a la cuenta)
  async function iniciarPlay() {
    GP = GP || window.GooglePlay || null;
    if (!GP || !Api.disponible || !Api.estado) return;
    try { playOk = !!(await GP.disponible()); } catch (e) { playOk = false; }
    if (playOk) {
      const ids = ((Api.estado.tienda && Api.estado.tienda.productos) || []).map((p) => p.id);
      try { (await GP.productos(ids)).forEach((p) => { preciosPlay[p.id] = p; }); } catch (e) { /* sin precios */ }
    }
    await restaurarPlay();
    if (tab === 'tienda') render();
  }
  async function restaurarPlay() {
    if (!GP || !Api.disponible || !Api.logueado()) return;
    try {
      const r = await GP.restaurar();
      if (r && r.entregadas && r.entregadas.length) {
        await Api.refrescar(); aplicarEntregas(); save(); render(); toast(T('tienda.play_llego')); snd.play('chapter');
      }
    } catch (e) { /* se reintenta la próxima vez */ }
  }

  async function comprarWeb(id) {
    if (!Api.logueado()) { abrirCuenta('registro', T('cuenta.para_comprar')); return; }
    try {
      save(); await subirNube();
      const r = await Api.orden(id);
      snd.play('tap');
      location.href = r.url;
    } catch (e) { toast(TL(e.message)); snd.play('error'); }
  }

  function canjear(id) {
    const p = Api.estado.tienda.premium.find((x) => x.id === id);
    if (!p) return;
    if (Api.estado.creditos < p.creditos) {
      toast(T('tienda.faltan_n', { n: p.creditos - Api.estado.creditos })); snd.play('error'); return;
    }
    ask(T('tienda.canjear_q', { item: `<b>${esc(TL(p.nombre))}</b>`, n: p.creditos }), T('tienda.canjear_si'), async () => {
      try {
        await Api.gastar(id);
        snd.play('buy');
        await Api.refrescar();
        aplicarEntregas();
        render();
      } catch (e) { toast(TL(e.message)); snd.play('error'); }
    });
  }

  async function bonoVip() {
    try {
      const r = await Api.bonoVip();
      Api.estado.creditos = r.creditos; Api.estado.vip_bono_hoy = true;
      if (r.entrega) Api.estado.entregas.push(r.entrega);
      aplicarEntregas(); render();
    } catch (e) { toast(TL(e.message)); snd.play('error'); }
  }

  function renderRegistro() {
    $('tab-registro').innerHTML = `<button class="btn sm" data-act="tab" data-tab="inicio" style="margin-top:4px">← ${T('nav.inicio')}</button>
      <div class="sectitle">${T('registro.titulo')}</div>
      <div class="card log">${S.log.map((l) => `<p><span>${T('comun.dia_n', { n: l.day })}</span>${esc(gtx(l, l.text))}</p>`).join('')}</div>`;
  }

  /* ---------- Preparar evento ---------- */
  function openPrep(contractId) {
    const c = S.contracts.find((x) => x.id === contractId);
    if (!c) return;
    const sug = G.suggestLoadout(S, contractId);
    prep = { id: contractId, staff: new Set(sug.staffIds), equip: new Set(sug.equipIds) };
    renderPrep();
  }

  // Rango de calidad esperado (la lógica lo da en computeQuality().rango)
  function rangoDe(q) {
    const r = q && q.rango;
    if (r && typeof r.min === 'number' && typeof r.max === 'number') {
      const min = Math.min(r.min, r.max), max = Math.max(r.min, r.max);
      const esperado = Math.max(min, Math.min(max, typeof r.esperado === 'number' ? r.esperado : Math.round((min + max) / 2)));
      // La lógica da el peor y el mejor caso (min/max) y lo esperado. Lo que se muestra es la franja probable:
      // de la mitad entre el peor caso y lo esperado hasta la mitad entre lo esperado y el mejor caso.
      const lo = Math.round((min + esperado) / 2), hi = Math.round((esperado + max) / 2);
      return { min: lo, max: Math.max(lo, hi), peor: min, mejor: max, esperado, imprevistos: r.imprevistos };
    }
    return null;
  }
  const estrellasDe = (v) => (v >= 85 ? 5 : v >= 70 ? 4 : v >= 55 ? 3 : v >= 40 ? 2 : 1);
  // Barra con la franja min–max y una marca en lo esperado
  function barraRango(rg, cls, mega) {
    const c = (v) => Math.max(0, Math.min(100, v));
    const tone = rg.esperado < 40 ? 'red' : rg.esperado < 55 ? 'amber' : '';
    return `<div class="rbar ${tone} ${cls || ''}" aria-hidden="true">${typeof rg.peor === 'number' ? `<em style="left:${c(rg.peor)}%;width:${Math.max(2, c(rg.mejor) - c(rg.peor))}%"></em>` : ''}<i style="left:${c(rg.min)}%;width:${Math.max(2, c(rg.max) - c(rg.min))}%"></i><s style="left:${c(rg.esperado)}%"></s>${typeof mega === 'number' ? `<u style="left:${c(mega)}%"></u>` : ''}</div>`;
  }
  // Duelo con MegaVisión con la incertidumbre de los imprevistos
  function duelRango(rg, mega) {
    const mejor = typeof rg.mejor === 'number' ? rg.mejor : rg.max;
    const k = rg.min > mega ? 'ventaja' : mejor <= mega ? 'desventaja' : rg.max <= mega ? 'dificil' : rg.esperado > mega ? 'parejo_arriba' : 'parejo_abajo';
    const cls = k === 'ventaja' ? 'up' : k === 'desventaja' || k === 'dificil' ? 'down' : '';
    const c = (v) => Math.max(0, Math.min(100, v));
    return `<div class="duel ${k === 'ventaja' ? 'won' : ''}">
      <div class="row between small"><span>${I('rival', 'sm')} ${T('duelo.titulo')}</span><b class="${cls}" style="${cls ? '' : 'color:var(--amber)'}">${T('prep.duelo_' + k)}</b></div>
      <div class="lbl"><span>${T('duelo.tu_calidad')}</span><b class="num">${rg.min}–${rg.max}</b></div>
      ${barraRango(rg, 'you', mega)}
      <div class="lbl"><span>${T('duelo.mega_promete')}</span><b class="num">${mega}</b></div><div class="bar mega"><i style="width:${c(mega)}%"></i></div>
      <div class="small muted" style="margin-top:4px">${T('prep.duelo_det_' + k)}</div></div>`;
  }
  // Cámaras que no se pueden usar (sin lente, sin fibra...) con su motivo
  function bloqueadosHtml(camP) {
    const bl = (camP && Array.isArray(camP.bloqueados)) ? camP.bloqueados : [];
    if (!bl.length) return '';
    return `<div class="bloq"><div class="pe-hd"><span class="pe-ttl">${T('prep.bloqueados')}</span><span class="pe-sub">${T('prep.bloqueados_n', { n: bl.length })}</span></div>
      ${bl.map((b) => {
        const corto = b.motivo && I18 && I18.T.has('prep.bloq.' + b.motivo) ? T('prep.bloq.' + b.motivo) : (b.motivo || '').replace(/_/g, ' ');
        const it = G.CATALOG[b.tipo] || {};
        const e = S.equip.find((x) => x.id === b.equipId);
        return `<div class="bq">${itemArt(b.tipo, 40, 'mini')}<div class="grow"><b>${esc(TL((e && e.nick) || it.name || b.tipo))}</b><div class="small muted">${esc(TL(b.texto || ''))}</div></div><span class="bqr">${I('lock', 'sm')}${esc(corto)}</span></div>`;
      }).join('')}</div>`;
  }
  function renderPrep(soloCalculo) {
    const c = S.contracts.find((x) => x.id === prep.id);
    if (!c) { closeModal(); return; }
    const staff = S.staff.filter((p) => prep.staff.has(p.id));
    const equip = S.equip.filter((e) => prep.equip.has(e.id));
    const q = G.computeQuality(S, c, staff, equip);
    const rg = rangoDe(q);
    const wages = staff.reduce((a, p) => a + wageFor(p, c.diff), 0);
    const est = estrellasDe(rg ? rg.esperado : q.q);
    // Consejo: solo lo que se arregla con equipo o personal
    const NO_FIX = /^(dificultad|lo que esperan|base\b|experiencia)|cansad|cansancio|desmotivad|[aá]nimo|apoyo|suerte/i;
    const STAFF_FIX = /sin director|sin sonidista|sin t[eé]cnico|sin operador|camar[oó]graf|director|sonidista|t[eé]cnico|falta|personal/i;
    // Con clave (p[2]) se sabe qué es cada parte; si no, se adivina por el texto
    const K_NO_FIX = /^parte\.(base|experiencia|cansado|animo|dificultad|fama|sensible|suerte|apoyo)/;
    const K_STAFF = /^parte\.(falta_rol|justo_rol|switcher_sin_director|consola_sin_sonidista|equipo_sin_tecnico|repeticiones_sin_operador|graficos_sin_operador|sin_operador|sin_shader)$/;
    const noFix = (p) => (p[2] ? K_NO_FIX.test(p[2]) : NO_FIX.test(p[0]));
    const esPersonal = (p) => (p[2] ? K_STAFF.test(p[2]) : STAFF_FIX.test(p[0]) && !/^Sin (switcher|consola|equipo)/i.test(p[0]));
    const worst = q.parts.filter((p) => p[1] < 0 && !noFix(p)).sort((a, b) => a[1] - b[1])[0];
    // Contrato internacional: requisitos con lo que llevas ahora, días y gastos de viaje
    let reqs = [];
    if (c.internacional && G.requisitosInternacional) { try { reqs = G.requisitosInternacional(S, c, [...prep.staff], [...prep.equip]); } catch (e) { reqs = []; } }
    const faltaReq = reqs.find((r) => r.obligatorio && !r.ok);
    const sinViaje = c.internacional && S.money < (c.travelCost || 0);
    // Sin nadie o sin cámara no se puede salir al aire: en vez del consejo, se dice qué falta
    const listo = staff.length > 0 && equip.some(isCam);
    const puede = listo && !faltaReq && !sinViaje;
    const tip = !listo ? `<p class="small hint" id="goHint">${I('tip', 'sm')} ${T('prep.falta_gente')}</p>`
      : faltaReq ? `<p class="small hint" id="goHint">${I('lock', 'sm')} ${T('prep.falta_req', { req: esc(TL(faltaReq.texto)) })}</p>`
      : sinViaje ? `<p class="small hint" id="goHint">${I('money', 'sm')} ${T('prep.falta_viaje', { m: M(c.travelCost) })}</p>`
      : worst ? `<p class="small" style="color:var(--amber);margin:6px 0 0">${I('tip', 'sm')} ${T('prep.resta', { que: esc(TL(worst[0])), n: worst[1] })} ${esPersonal(worst) ? T('prep.contrata') : T('prep.compralo')}</p>` : '';
    // Plan del evento (js/plan_evento.js): plantilla por rol con semáforo y plano de cámaras
    let crew = null, camP = null;
    try { crew = G.crewPlan ? G.crewPlan(S, c, [...prep.staff], [...prep.equip]) : null; } catch (e) { crew = null; }
    try { camP = q.cameraPlan || (G.cameraPlan ? G.cameraPlan(S, c, [...prep.equip], [...prep.staff]) : null); } catch (e) { camP = null; }
    if (!camP && PE && !G.cameraPlan) {
      const camsSel = equip.filter(isCam);
      const pos = PE.posiciones(c.type);
      if (pos.length) camP = { positions: pos.map((p, i) => Object.assign({}, p, { asignado: camsSel[i] ? camsSel[i].id : null })) };
    }
    const reqVista = reqs.map((r) => ({ texto: TL(r.texto), ok: r.ok, detalle: r.ok ? '' : r.obligatorio ? T('prep.obligatorio') : T('prep.req_resta') }));
    const intlHtml = PE && c.internacional ? PE.internacional(Object.assign({}, c, { requisitos: reqVista })) : PE ? PE.internacional(c) : '';
    const sinOp = camP && camP.sinOperador ? `<p class="small" style="color:var(--amber);margin:6px 0 0">${I('role_camarografo', 'sm')} ${T('prep.sin_operador', { n: camP.sinOperador })}</p>` : '';
    const planHtml = PE ? (camP || PE.posiciones(c.type).length ? PE.camaras(camP, c.type, { nombreEquipo: eqName }) : '') + bloqueadosHtml(camP) + sinOp + (crew ? PE.personal(crew) : '') : bloqueadosHtml(camP);
    const calidadTxt = rg ? T('prep.calidad_rango', { min: `<b class="num">${rg.min}</b>`, max: `<b class="num">${rg.max}</b>` }) : `${T('prep.calidad_esperada')} <b class="num">${q.q}</b>/100`;
    const mega = c.rival && typeof c.rivalQuality === 'number' ? c.rivalQuality : undefined;
    const barra = rg ? barraRango(rg, '', mega) : `<div class="bar ${q.q < 40 ? 'red' : q.q < 55 ? 'amber' : ''}"><i style="width:${q.q}%"></i></div>`;
    // Partes que cambian con lo que eliges: arriba (#prepCalc), la tabla del detalle (#prepTabla) y la barra fija (#prepPie)
    const calcHtml = `${intlHtml}
      <div class="pronostico">${c.rival && typeof c.rivalQuality === 'number' ? (rg ? duelRango(rg, c.rivalQuality) : duelBars(q.q, c.rivalQuality)) : ''}
        ${puede ? tip : ''}
        <div class="small muted" style="margin-top:6px">${T('prep.sueldos')} <b class="num">${M(wages)}</b>${c.internacional && c.travelCost ? ` · ${T('prep.viaje', { m: `<b class="num">${M(c.travelCost)}</b>` })}` : ''} · ${rg ? T('prep.rango_det') : T('prep.imprevistos')}</div></div>
      ${planHtml ? `<div class="planev">${planHtml}</div>` : ''}`;
    const tablaHtml = `${q.parts.map((p) => `<tr><td>${esc(TL(p[0]))}</td><td class="${p[1] < 0 ? 'down' : ''}">${p[1] > 0 ? '+' : ''}${p[1]}</td></tr>`).join('')}
          ${rg ? `<tr><td>${T('prep.imprevistos_esperados', { n: rg.imprevistos != null ? N(rg.imprevistos) : '?' })}</td><td class="down">${rg.esperado - q.q}</td></tr>
            <tr><td>${T('prep.peor_mejor')}</td><td>${rg.peor}–${rg.mejor}</td></tr>` : ''}`;
    const pieHtml = `<div class="row between"><span>${calidadTxt}</span><span>${starsTxt(est)}</span></div>
        ${barra}
        ${puede ? '' : tip}
        <button class="btn main" data-act="go-live" ${puede ? '' : 'disabled aria-describedby="goHint"'}>${I('rec', 'sm')} ${T('prep.al_aire')}</button>`;
    if (soloCalculo && $('prepCalc') && $('prepPie') && $('prepTabla')) {
      // Al marcar o desmarcar: solo se rehace lo que depende de la selección (no toda la ventana)
      $('prepCalc').innerHTML = calcHtml;
      $('prepTabla').innerHTML = tablaHtml;
      $('prepPie').innerHTML = pieHtml;
      return;
    }
    const staffHtml = S.staff.map((p) => { const w = wageFor(p, c.diff); return `<label class="pick ${prep.staff.has(p.id) ? 'sel' : ''}">
        <input type="checkbox" id="st-${p.id}" data-act="tog-staff" data-id="${p.id}" ${prep.staff.has(p.id) ? 'checked' : ''}>
        ${avatarOf(p, 44)}
        <div class="grow" style="min-width:0"><b>${esc(TL(p.name))}</b><div class="small muted pkrol">${I(roleIcon(p.role), 'sm')}<span>${esc(roleName(normRole(p.role)))}</span>${tierBadge(p)}</div></div>
        <span class="num small" style="text-align:end">${M(w)}${w > p.wage ? `<br><span class="muted" style="font-size:10.5px">+${Math.round((w / p.wage - 1) * 100)}%</span>` : ''}</span></label>`; }).join('');
    const equipHtml = S.equip.map((e) => {
      const it = G.CATALOG[e.type] || { name: e.type };
      const off = vipBloqueado(e);
      return `<label class="pick ${prep.equip.has(e.id) ? 'sel' : ''} ${off ? 'vipoff' : ''}">
        <input type="checkbox" id="eq-${e.id}" data-act="tog-equip" data-id="${e.id}" ${prep.equip.has(e.id) ? 'checked' : ''}>
        ${itemArt(e.type, 44, 'mini')}
        <div class="grow" style="min-width:0"><b>${esc(TL(e.nick || it.name))}</b> ${rtag(e.type)}${it.alquiler ? ` <span class="rent">${T('bodega.alquiler')}</span>` : ''}${off ? `<div class="small" style="color:var(--amber)">${T('prep.necesita_vip')}</div>` : it.alquiler ? '' : condBar(e.condition)}</div>
        <span class="num small ${e.condition < 40 ? 'neg' : 'muted'}">${it.alquiler ? '' : e.condition + '%'}</span></label>`;
    }).join('');
    const pos = $('modal').scrollTop;
    openModal(`
      <div class="row between"><div class="row" style="min-width:0">${tile(c.type, TILE_COLOR[c.type] || (c.internacional ? 'blue' : ''))}<h2>${esc(eventName(c.type))}</h2></div><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <div class="small muted" style="margin-top:6px">${esc(TL(c.client))} · ${T('prep.paga', { m: `<span class="pay" style="font-size:15px">${M(c.pay)}</span>` })}</div>
      <div style="margin:6px 0 4px">${reqTags(c)}</div>
      <button class="btn" data-act="auto">${I('sparkle')}${T('prep.auto')}</button>
      <div id="prepCalc">${calcHtml}</div>
      <div class="sectitle">${T('prep.quien')}</div>${staffHtml}
      <div class="sectitle">${T('prep.que_equipos')}</div>${equipHtml}
      <p class="small muted">${T('prep.repuestos', { cables: T('prep.cables', { n: S.stock.cable || 0 }), baterias: T('prep.baterias', { n: S.stock.battery || 0 }) })}</p>
      <details><summary>${T('prep.como_calidad')}</summary><table id="prepTabla">${tablaHtml}</table></details>
      <div class="preview" id="prepPie">${pieHtml}</div>`);
    $('modal').scrollTop = pos;
  }
  // "Elegir lo mejor": se marcan las casillas y se rehace solo el cálculo
  function marcarSeleccion() {
    document.querySelectorAll('#modal input[data-act="tog-staff"], #modal input[data-act="tog-equip"]').forEach((x) => {
      const set = x.dataset.act === 'tog-staff' ? prep.staff : prep.equip;
      x.checked = set.has(Number(x.dataset.id));
      const l = x.closest('.pick'); if (l) l.classList.toggle('sel', x.checked);
    });
  }

  /* ---------- Evento en vivo ---------- */
  // Sirve para la partida (S) y para los eventos en línea de la liga y el festival (VI: un estado aparte)
  function liveCams() {
    const s = evS(), ev = s.currentEvent;
    return ev ? s.equip.filter((e) => ev.equipIds.includes(e.id) && G.CATALOG[e.type] && G.CATALOG[e.type].cat === 'cam').length : 1;
  }
  function liveGear() {
    const s = evS(), ev = s.currentEvent;
    return ev ? s.equip.filter((e) => ev.equipIds.includes(e.id)).map((e) => e.type) : [];
  }
  function liveScene(type, key) {
    const ev = evS().currentEvent;
    const c = ev ? ev.contract : null;
    return A.scene(type, key, liveCams(), false, liveGear(), { client: c ? c.client : '', seed: c ? c.id : 0 });
  }
  function incKey() {
    const ev = evS().currentEvent;
    return ev && ev.incidents[ev.step] ? ev.incidents[ev.step].key : null;
  }
  const viTag = () => (VI ? `<span class="tag ${VI.modo === 'festival' ? 'amber' : ''}" style="margin:0">${I(VI.modo === 'festival' ? 'festival' : 'shield')}${T(VI.modo === 'festival' ? 'online.festival' : 'online.liga')}</span>` : '');

  function showIncident() {
    const s = evS();
    const inc = G.currentIncident(s);
    if (!inc) { finish(); return; }
    const c = s.currentEvent.contract;
    const key = incKey();
    const bueno = key === 'epico' || inc.positive === true || inc.bueno === true;   // un momento bueno, no un problema
    snd.play('incident');
    setTimeout(() => snd.play(key), 250);
    if (!esFuneral(c.type)) {
      if (!bueno && INC_GRAVE.test(key || '')) mus.go('tension');
      else mus.stinger();
    }
    // Si el imprevisto es de un puesto que llevaste incompleto, se avisa (pega más fuerte)
    const rolInc = inc.rol && (inc.estadoRol === 'falta' || inc.estadoRol === 'justo')
      ? `<div class="rolwarn ${inc.estadoRol}">${I(roleIcon(inc.rol), 'sm')}<span>${T(inc.estadoRol === 'falta' ? 'vivo.rol_falta' : 'vivo.rol_justo', { rol: esc(roleName(normRole(inc.rol))) })}</span></div>` : '';
    openModal(`
      ${liveScene(c.type, key)}
      <div class="row between" style="margin-top:10px"><span class="row" style="gap:6px"><span class="live"><i></i>${T('vivo.en_vivo')}</span>${viTag()}</span><span class="small muted">${bueno ? T('vivo.momento', { i: inc.n, total: inc.total }) : T('vivo.imprevisto', { i: inc.n, total: inc.total })}</span></div>
      <div class="small muted" style="margin-top:8px">${esc(eventName(c.type))} · ${esc(TL(c.client))}</div>
      <div class="incident">${esc(noEmoji(gtx(inc, inc.text)))}</div>
      ${rolInc}
      ${inc.choices.map((ch) => `<button class="btn choice" data-act="choose" data-i="${ch.i}" ${ch.ok ? '' : 'disabled'}>
        ${esc(gtx(ch, ch.label))}${ch.ok ? '' : `<small>${T('vivo.no_disponible', { why: esc(ch.whyK ? gtx({ k: ch.whyK, p: ch.whyP }, ch.why) : TL(ch.why)) })}</small>`}</button>`).join('')}
      ${VI ? `<button class="btn sm vi-salir" data-act="vi-salir">${T('online.dejar')}</button>` : ''}`);
  }

  function choose(i) {
    const key = incKey();
    let r;
    if (VI) {
      r = window.EnVivoVivo.elegir(VI.v, i);
      if (r && r.ok) VI.incidentes.push({ clave: key, q: r.q });
    } else r = G.resolveIncident(S, i);
    if (!r || !r.ok) { toast(TL((r && r.msg) || '')); snd.play('error'); return; }
    if (!VI) save();
    snd.play(r.q >= 0 ? 'good' : 'bad');
    const cls = r.q > 0 ? 'up' : r.q < 0 ? 'down' : '';
    const s = evS();
    const more = G.currentIncident(s);
    const c = s.currentEvent.contract;
    if (r.q >= 0 && mus.actual() === 'tension' && !esFuneral(c.type)) mus.go(temaDeEvento(c.type));
    openModal(`
      ${liveScene(c.type, r.q > 4 ? 'epico' : key === 'luz' && r.q < -10 ? 'luz' : null)}
      <div class="row" style="margin-top:10px;gap:6px"><span class="live"><i></i>${T('vivo.en_vivo')}</span>${viTag()}</div>
      <div class="incident">${esc(gtx(r, r.msg))}</div>
      <p>${T('vivo.calidad')} <span class="delta ${cls}">${r.q > 0 ? '+' : ''}${r.q}</span></p>
      <button class="btn main" data-act="${more ? 'next-inc' : 'finish'}">${more ? T('comun.continuar') : T('vivo.terminar')}</button>`);
  }

  function finish() {
    if (VI) { terminarIntento(); return; }
    const dia = S.day;
    const caja0 = dia0 && dia0.day === dia && typeof dia0.money === 'number' ? dia0.money : null;
    const ty = S.currentEvent && S.currentEvent.contract ? S.currentEvent.contract.type : '';
    const f = G.finishEvent(S);
    save();
    snd.amb(null);
    if (!f.ok) { toast(TL(f.msg)); closeModal(); render(); return; }
    const r = f.result;
    const caja = caja0 === null ? null : S.money - caja0;   // cuánto cambió la caja desde que empezó el día
    // Si se recarga en esta pantalla, el resultado se vuelve a mostrar (QA-09)
    lsSet(RES_KEY, { r, ev: S.stats.events, caja, ty });
    showResult(r, caja, true, ty);
  }

  /* ---------- Avisos del día (renuncias, pagos, la rival, cancelaciones…) ---------- */
  const AV_ICON = { pago: ['money', 'g'], fama: ['trend_down', 'a'], vencidas: ['clock', 'm'], cancelacion: ['x_circle', 'r'], internacional: ['globe', 'b'],
    rival: ['rival', 'r'], animo: ['sad', 'a'], renuncia: ['user_x', 'r'], sueldo: ['money', 'a'], quiebra: ['bolt', 'r'], capitulo: ['star', 'a'] };
  const avisosPend = () => (S && Array.isArray(S.avisos) ? S.avisos.filter((a) => a && a.tipo !== 'capitulo') : []);
  function tomarAvisos() { try { if (G.takeAvisos) G.takeAvisos(S); else S.avisos = []; } catch (e) { S.avisos = []; } save(); }
  // Una tarjeta por día con sus avisos
  function avisosHtml(lista) {
    const dias = [];
    lista.forEach((a) => { let d = dias.find((x) => x.day === a.day); if (!d) { d = { day: a.day, items: [] }; dias.push(d); } d.items.push(a); });
    return dias.map((d) => `<div class="daycard">${dias.length > 1 ? `<div class="dh">${T('comun.dia_n', { n: d.day })}</div>` : ''}
      ${d.items.map((a) => { const ic = AV_ICON[a.tipo] || ['tip', 'm']; return `<div class="av av-${ic[1]}"><span class="avi">${I(ic[0], 'sm')}</span><span class="t">${esc(noEmoji(gtx(a, a.text)))}</span></div>`; }).join('')}</div>`).join('');
  }
  function showResumenDia() {
    const lista = avisosPend();
    if (!lista.length) { tomarAvisos(); continuar(); return; }
    const dia = lista[lista.length - 1].day;
    const malo = lista.some((a) => /renuncia|rival|cancelacion|quiebra/.test(a.tipo));
    snd.play(malo ? 'bad' : 'good');
    const caja = diaAntes && typeof diaAntes.money === 'number' ? S.money - diaAntes.money : null;
    diaAntes = null;
    openModal(`<div class="story-tag">${T('dia.resumen')}</div><h2>${T('comun.dia_n', { n: dia })}</h2>
      ${caja !== null ? `<div class="row between small" style="margin:2px 0 0"><span class="muted">${T('dia.caja')}</span><b class="num ${caja >= 0 ? 'up' : 'down'}">${caja >= 0 ? '+' : '-'}${M(Math.abs(caja))}</b></div>
        <div class="small muted" style="margin-bottom:8px">${T('dia.gastos', { m: M(G.dailyCost ? G.dailyCost(S) : 0) })}</div>` : ''}
      ${avisosHtml(lista)}
      <button class="btn main" data-act="close-dia">${T('comun.continuar')}</button>`);
  }
  // Qué ventana toca después: el evento en curso, el resumen del día, los capítulos completados y la intro del capítulo
  const capPend = () => (S && Array.isArray(S.capCompletados) ? S.capCompletados : []);
  function continuar() {
    if (VI || !S) return;
    if ($('overlay').classList.contains('on')) return;
    if (S.currentEvent) { showIncident(); return; }
    if (avisosPend().length) { showResumenDia(); return; }
    if (capPend().length) { showChapterDone(capPend()[0], true); return; }
    if (showChapterIntro()) return;
    if (S.gameOver) showGameOver();
  }

  function showResult(r, caja, fresh, ty0) {
    // Con la lógica nueva los capítulos esperan en S.capCompletados; con una vieja, en r.chapterDone
    afterResult = !Array.isArray(S.capCompletados) && r.chapterDone ? r.chapterDone : null;
    if (fresh) snd.play('stars', r.stars);
    const ty = r.type || r.contractType || ty0 || '';
    if (esFuneral(ty)) mus.go('funeral');
    else if (r.stars >= 4) { mus.go('menu'); mus.go('victoria'); }
    else mus.go('menu');
    const duel = r.duel && typeof r.rivalQuality === 'number'
      ? `<div class="duel ${r.duel === 'won' ? 'won' : ''}" style="margin-top:10px">
          <div class="row between"><span class="res ${r.duel === 'won' ? 'up' : 'down'}">${I('rival', 'sm')} ${r.duel === 'won' ? T('res.duelo_ganado') : T('res.duelo_perdido')}</span><span class="small muted">${r.duel === 'won' ? T('res.fama_extra') : T('res.perdiste_fama')}</span></div>
          <div class="lbl"><span>${T('duelo.tu_calidad')}</span><b class="num">${r.quality}</b></div><div class="bar you"><i style="width:${r.quality}%"></i></div>
          <div class="lbl"><span>MegaVisión</span><b class="num">${r.rivalQuality}</b></div><div class="bar mega"><i style="width:${r.rivalQuality}%"></i></div></div>`
      : r.duel === 'won' ? `<p class="small up">${I('rival', 'sm')} ${T('res.ganaste_duelo')}</p>` : r.duel === 'lost' ? `<p class="small down">${I('rival', 'sm')} ${T('res.perdiste_duelo')}</p>` : '';
    const later = r.payLater > 0 ? `<div class="paylater">${I('clock', 'sm')} ${T('res.pago_luego', { ahora: M(r.payNow), luego: M(r.payLater), n: r.payLaterDays })}</div>` : '';
    // Contrato internacional: viaje y riesgo de fama
    const intl = r.internacional ? `<div class="paylater intl ${r.intlFail ? 'mal' : ''}">${I(r.intlFail ? 'bolt' : 'globe', 'sm')} ${r.intlFail ? T('res.intl_mal') : T('res.intl_ok')}${r.travelDays ? ` · ${T('res.viaje_dias', { n: r.travelDays })}` : ''}</div>` : '';
    // Gastos fijos del día y lo que de verdad cambió en caja (QA-04)
    const gastoDia = G.dailyCost && typeof r.dailyCost === 'number' ? r.dailyCost : null;
    const sgn = (v) => (v > 0 ? '+' : '') + M(v);
    const filasCaja = (gastoDia !== null ? `<tr><td>${T('res.gastos_dia')}</td><td class="down">-${M(gastoDia)}</td></tr>` : '')
      + (typeof caja === 'number' ? `<tr class="caja"><td><b>${T('res.en_caja')}</b></td><td class="${caja >= 0 ? 'up' : 'down'}"><b>${sgn(caja)}</b></td></tr>` : '');
    const riesgo = PE ? PE.resumenRiesgo(r.crewPlan || (r.crew && r.crew.plan), { camaras: r.cameraPlan, tipo: ty, nombreEquipo: eqName }) : '';
    // Lo que pasó mientras tanto (el evento ocupa el día): pagos, renuncias, la rival…
    const mientras = fresh || avisosPend().length ? avisosPend() : [];
    openModal(`
      <div class="result-head"><div class="story-tag">${r.stars >= 4 ? T('res.impecable') : r.stars === 3 ? T('res.buen_trabajo') : T('res.terminada')}</div>
      <h2>${esc(noEmoji(TL(r.title)))}</h2></div>
      ${starsBig(r.stars)}
      <div class="bigmoney ${r.net >= 0 ? 'up' : 'down'} num" id="resNet">${fresh ? (r.net >= 0 ? '+' : '-') + M(0) : (r.net >= 0 ? '+' : '-') + M(Math.abs(r.net))}</div>
      <div class="small muted" style="text-align:center">${T('res.ganancia_evento')}</div>
      <div class="row between" style="margin-top:12px"><span>${T('res.calidad_final')}</span><b class="num">${r.quality}/100</b></div>
      <div class="bar ${r.quality < 40 ? 'red' : r.quality < 55 ? 'amber' : ''}"><i style="width:${r.quality}%"></i></div>
      ${duel}
      ${intl}
      ${riesgo}
      <table style="margin-top:12px">
        <tr><td>${T('res.pago_cliente')}</td><td class="up">+${M(r.pay)}</td></tr>
        <tr><td>${T('res.sueldos')}</td><td class="down">-${M(r.wages)}</td></tr>
        ${r.travelCost ? `<tr><td>${T('res.viaje')}</td><td class="down">-${M(r.travelCost)}</td></tr>` : ''}
        <tr><td><b>${T('res.ganancia')}</b></td><td class="${r.net >= 0 ? 'up' : 'down'}"><b>${M(r.net)}</b></td></tr>
        ${filasCaja}
        <tr><td>${T('head.fama')}</td><td class="${r.repDelta >= 0 ? 'up' : 'down'}">${r.repDelta >= 0 ? '+' : ''}${r.repDelta}</td></tr>
      </table>
      ${later}
      ${(r.ups || []).length ? `<p class="small">${I('trend', 'sm')} ${r.ups.map((u) => esc(TL(u))).join(' · ')}</p>` : ''}
      ${mientras.length ? `<div class="sectitle">${T('dia.mientras')}</div>${avisosHtml(mientras)}` : ''}
      <details><summary>${T('res.ver_detalle')}</summary>
        <p class="small"><b>${T('res.calidad_inicial', { n: r.base })}</b></p>
        ${(r.incidents || []).map((i) => { const x = i.result || {}; return `<p class="small">${esc(noEmoji(gtx(i, i.text)))}<br><span class="muted">→ ${esc(gtx(x, x.msg || ''))} (${x.q > 0 ? '+' : ''}${x.q || 0})</span></p>`; }).join('')}
      </details>
      <p class="small muted">${T('res.desgaste')}</p>
      <button class="btn main" data-act="after-result">${T('comun.continuar')}</button>`);
    if (!fresh) return;
    countUp($('resNet'), r.net, 1000);
    if (r.stars >= 4) confetti(r.stars === 5 ? 28 : 20);
    else if (r.stars === 3) confetti(10);
  }

  let capDeCola = false;   // el capítulo que se ve salió de S.capCompletados (se quita al cerrar)
  function showChapterDone(d, deCola) {
    capDeCola = !!deCola;
    const idx = typeof d.chapter === 'number' ? d.chapter : Math.max(0, G.CHAPTERS.findIndex((c) => c.title === d.title));
    const ch = G.CHAPTERS[idx] || {};
    // Título y texto en el idioma actual (si la lógica ya los traduce); si no, los que se guardaron
    const titulo = ch.title && typeof d.chapter === 'number' ? ch.title : d.title;
    const texto = ch.done && typeof d.chapter === 'number' ? ch.done : d.text;
    snd.play('chapter');
    mus.go('victoria');
    openModal(`<div class="story-tag">${T('historia.cap_completado')}</div><h2>${esc(TL(titulo))}</h2>
      ${speaker(charOf(idx), esc(TL(texto)))}
      <p>${T('historia.premio')} <span class="pay">${M(d.reward)}</span></p>
      <button class="btn main" data-act="close-story">${T('historia.vamos')}</button>`);
    if (!reduceMotion()) confetti(24);
  }

  /* ---------- Eventos en línea (liga y festival): se juegan en un estado aparte con la semilla del servidor ---------- */
  // Devuelve { decisiones, resultado: { quality, stars, duel, incidentes: [{ clave, q }] } } o null si lo deja para después.
  async function jugarIntento(intento, modo) {
    const V = window.EnVivoVivo;
    if (!V || !intento) { toast(T('online.sin_motor')); return null; }
    if (VI || (S && S.currentEvent)) { toast(T('online.ocupado')); return null; }
    try { await V.asegurar(); } catch (e) { toast(TL(e.message)); return null; }
    let v;
    try { v = V.crear(G, intento); } catch (e) { toast(TL(e.message)); snd.play('error'); return null; }
    return new Promise((resolver) => {
      VI = { v, resolver, incidentes: [], modo: modo || 'liga' };
      const ty = v.contrato.type;
      snd.play('live');
      mus.go(esFuneral(ty) ? 'funeral' : temaDeEvento(ty));
      showIncident();
    });
  }
  function terminarIntento() {
    const vi = VI;
    let out;
    try { out = window.EnVivoVivo.terminar(vi.v); } catch (e) { toast(TL(e.message)); return; }
    const r = vi.v.resultado || {};
    out.resultado.duel = r.duel || null;
    out.resultado.incidentes = vi.incidentes.slice();
    vi.salida = out;
    snd.play('stars', r.stars);
    mus.go(r.stars >= 4 ? 'victoria' : 'menu');
    openModal(`<div class="result-head"><div class="story-tag">${viTag()}</div><h2>${T('online.turno_listo')}</h2></div>
      ${starsBig(r.stars || 1)}
      <div class="row between" style="margin-top:12px"><span>${T('res.calidad_final')}</span><b class="num">${r.quality}/100</b></div>
      <div class="bar ${r.quality < 40 ? 'red' : r.quality < 55 ? 'amber' : ''}"><i style="width:${r.quality}%"></i></div>
      <p class="small muted">${T('online.servidor_confirma')}</p>
      <button class="btn main" data-act="vi-enviar">${I('cloud', 'sm')} ${T('online.enviar')}</button>`);
    if (r.stars >= 4) confetti(20);
  }
  function cerrarIntento(conResultado) {
    const vi = VI;
    if (!vi) return;
    VI = null;
    closeModal(); mus.go('menu'); render();
    vi.resolver(conResultado ? vi.salida : null);
  }

  function showChapterIntro() {
    if (S.storyDone || S.chapterSeen === S.chapter) return false;
    const ch = G.CHAPTERS[S.chapter];
    S.chapterSeen = S.chapter;
    save();
    openModal(`<div class="story-tag">${T('historia.nuevo_cap')}</div><h2>${esc(TL(ch.title))}</h2>
      ${speaker(charOf(S.chapter), esc(TL(ch.intro)))}
      <p><b>${T('historia.objetivo')}</b> ${esc(TL(ch.goal))}</p>
      <button class="btn main" data-act="close">${T('historia.entendido')}</button>`);
    return true;
  }

  function showGameOver() {
    mus.go('tension');
    openModal(`<h2>${T('fin.titulo')}</h2>
      ${speaker('ramiro', T('fin.texto', { m: M(-bankruptAt()), dia: S.day, eventos: T('inicio.eventos', { n: S.stats.events }) }))}
      <button class="btn main" data-act="restart">${T('fin.reiniciar')}</button>`);
  }

  /* ---------- En línea: Liga Semanal, Mega Festival, Duelo de Productoras y Desafío del Día ---------- */
  let vistaOnline = 'hub';
  let montado = null;   // módulo que está pintado en la pestaña (para no volver a pedirlo en cada render)
  const MODOS = [
    { k: 'liga', mod: 'Liga', icon: 'shield', tono: 'blue' },
    { k: 'festival', mod: 'Festival', icon: 'festival', tono: 'amber' },
    { k: 'duelos', mod: 'Duelos', icon: 'rival', tono: 'red' },
    { k: 'desafio', mod: 'Desafio', icon: 'target', tono: 'green' },
  ];
  const enLinea = () => Api.disponible === true && Api.logueado();
  function avisosOnline() {
    try {
      if (!enLinea()) return 0;
      const E = Api.estado || {};
      return (Number(E.duelos && E.duelos.defensas_nuevas) || 0) + (E.desafio && E.desafio.jugado_hoy === false && Number(E.desafio.restantes) > 0 ? 1 : 0);
    } catch (e) { return 0; }
  }
  function desmontarOnline() {
    try { if (montado === 'festival' && window.Festival && window.Festival.detener) window.Festival.detener(); } catch (e) { /* nada */ }
    montado = null;
  }
  function invalidarOnline() {
    ['Liga', 'Duelos', 'Desafio'].forEach((m) => { try { if (window[m] && window[m].invalidar) window[m].invalidar(); } catch (e) { /* nada */ } });
    desmontarOnline();
  }
  function estadoModo(k) {
    const E = (Api.estado || {});
    try {
      if (k === 'duelos' && E.duelos) return `${E.duelos.liga ? esc(TL(E.duelos.liga)) + ' · ' : ''}${T('online.duelos_hoy', { n: Number(E.duelos.restantes) || 0 })}`;
      if (k === 'desafio' && E.desafio) return E.desafio.jugado_hoy ? T('online.desafio_jugado') : esc(TL(E.desafio.nombre || ''));
    } catch (e) { /* nada */ }
    return '';
  }
  function hubOnline(activo) {
    return `<div class="onl-grid">${MODOS.map((m) => {
      const extra = activo ? estadoModo(m.k) : '';
      const nuevo = activo && m.k === 'duelos' && Api.estado && Api.estado.duelos && Api.estado.duelos.defensas_nuevas;
      return `<button class="onl-tile t-${m.tono}" data-act="online" data-k="${m.k}" ${activo ? '' : 'disabled'}>
        <span class="oi">${I(m.icon)}</span>${nuevo ? `<span class="badge">${N(nuevo)}</span>` : ''}
        <b>${T('online.' + m.k)}</b><span class="od">${T('online.' + m.k + '_det')}</span>${extra ? `<span class="oe">${extra}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }
  function renderOnline() {
    const el = $('tab-online');
    if (!enLinea()) {
      desmontarOnline();
      const acceso = Api.disponible === null ? `<p class="small muted">${T('tienda.conectando')}</p>`
        : Api.disponible ? `<button class="btn main" data-act="cuenta" data-modo="registro">${I('user')}${T('cuenta.crear')}</button>
            <button class="btn" data-act="cuenta" data-modo="entrar">${T('cuenta.ya_tengo_entrar')}</button>`
          : `<p class="small muted" style="margin:6px 0 0">${T('online.sin_servidor', { sitio: '<b>juego.tukanec.com</b>' })}</p>`;
      el.innerHTML = `<div class="sectitle">${T('nav.online')}</div>
        <div class="card onl-hero"><div class="row" style="align-items:flex-start">${tile('online', 'blue')}<div class="grow"><h3>${T('online.entra')}</h3>
          <p class="small muted" style="margin:4px 0 0">${T('online.entra_det')}</p></div></div>${acceso}</div>
        <div class="sectitle">${T('online.modos')}</div>${hubOnline(false)}`;
      return;
    }
    if (vistaOnline === 'hub') {
      desmontarOnline();
      const E = Api.estado || {};
      el.innerHTML = `<div class="sectitle">${T('nav.online')}</div>
        <div class="card onl-hero"><div class="row">${tile('online', 'blue')}<div class="grow"><h3>${T('online.hola', { nombre: esc((E.jugador && E.jugador.nombre) || '') })}</h3>
          <p class="small muted" style="margin:2px 0 0">${T('online.hub_det')}</p></div></div></div>
        ${hubOnline(true)}
        <div class="sectitle">${T('discord.titulo')}</div>
        <div class="card"><p class="small muted" style="margin:0">${T('discord.det')}</p>${discordBtn()}</div>`;
      return;
    }
    const m = MODOS.find((x) => x.k === vistaOnline);
    const cont = $('online-cont');
    if (montado === vistaOnline && cont && el.contains(cont)) return;   // ya está pintado: el módulo se actualiza solo
    desmontarOnline();
    el.innerHTML = `<div class="onl-top"><button class="btn sm" data-act="online" data-k="hub">← ${T('nav.online')}</button><b>${I(m.icon, 'sm')} ${T('online.' + m.k)}</b></div><div id="online-cont"></div>`;
    const M = window[m.mod];
    if (!M || !M.render) { $('online-cont').innerHTML = emptyState(m.icon, T('online.no_disponible_t'), T('online.no_disponible')); return; }
    montado = vistaOnline;
    try { M.render($('online-cont'), ctxOnline(m.k)); } catch (e) { montado = null; $('online-cont').innerHTML = emptyState(m.icon, T('online.no_disponible_t'), esc(TL(e.message))); }
  }
  const sincronizarEntregas = () => { aplicarEntregas(); save(); if (tab !== 'online') render(); };
  function ctxOnline(k) {
    const base = { Api, G, A, T, TL, I18N: I18, estado: () => S, toast, ask, openModal, closeModal, snd, sincronizar: sincronizarEntregas };
    if (k === 'liga') {
      return { A, estado: () => S, guardar: save, toast, ask,
        jugarIntento: (it) => jugarIntento(it, 'liga'),
        abrirAsociaciones: () => { const b = $('chat-btn'); if (b) { b.hidden = false; b.click(); setTimeout(() => { const t = document.querySelector('[data-chat-tab="asociacion"]'); if (t) t.click(); }, 60); } else toast(T('online.no_disponible')); },
        alCanjear: () => { Api.refrescar().then(() => sincronizarEntregas()).catch(() => {}); } };
    }
    if (k === 'festival') {
      return { A, estado: () => S, vip: !!(Pm && Pm.vip), toast, snd: (n) => snd.play(n),
        jugarIntento: (seed, contrato, it) => jugarIntento(it || { seed, contrato }, 'festival') };
    }
    return base;
  }

  /* ---------- Discord: código para /vincular (server/INTEGRAR_DISCORD.md) ---------- */
  let discordOff = false;   // el servidor dijo que el bot no está configurado
  async function apiPost(ruta, body) {
    const r = await fetch(ruta, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': (I18 && I18.idioma) || 'es' }, body: JSON.stringify(body || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const err = new Error(j && j.codigo && I18 && I18.T.has('error.' + j.codigo) ? T('error.' + j.codigo) : (j && j.error ? TL(j.error) : T('err.no_completo')));
      err.status = r.status; err.codigo = j && j.codigo;
      throw err;
    }
    return j;
  }
  function discordBtn(cls) {
    if (!enLinea() || discordOff) return '';
    const v = !!(Api.estado && Api.estado.discord_vinculado);
    return `<button class="btn ${cls || ''} ${v ? '' : 'discord'}" data-act="discord">${I(v ? 'check' : 'link', 'sm')} ${v ? T('discord.vinculado') : T('discord.vincular')}</button>`;
  }
  let discordT = null;
  async function abrirDiscord() {
    let r;
    try { r = await apiPost('/api/discord/codigo', {}); } catch (err) {
      if (err.codigo === 'discord_no_configurado' || err.status === 503 || err.status === 404) { discordOff = true; toast(T('discord.no_disponible')); render(); return; }
      toast(err.message); snd.play('error'); return;
    }
    const fin = Date.now() + (Number(r.segundos) || 600) * 1000;
    const inv = r.invitacion || (Api.estado && Api.estado.discord_invitacion);
    const vinc = !!(r.vinculado || (Api.estado && Api.estado.discord_vinculado));
    openModal(`<div class="row between"><h2>${T('discord.titulo')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <ol class="pasos small">
        <li>${inv ? T('discord.paso1_link', { link: `<a href="${esc(inv)}" target="_blank" rel="noopener">${T('discord.servidor')}</a>` }) : T('discord.paso1')}</li>
        <li>${T('discord.paso2')}</li></ol>
      <div class="dcode num">${esc(r.codigo)}</div>
      <p class="small muted" style="text-align:center"><code>${esc(r.comando || '/vincular codigo:' + r.codigo)}</code> · ${T('discord.vence')} <span id="dc-t">10:00</span></p>
      <p class="small muted">${T('discord.seguridad')}</p>
      <button class="btn main" data-act="discord-copiar" data-k="${esc(r.comando || '/vincular codigo:' + r.codigo)}">${T('discord.copiar')}</button>
      ${vinc ? `<button class="btn" data-act="discord-quitar">${T('discord.desvincular')}</button>` : ''}`);
    clearInterval(discordT);
    discordT = setInterval(() => {
      const el = $('dc-t');
      if (!el) { clearInterval(discordT); return; }
      const sec = Math.max(0, Math.round((fin - Date.now()) / 1000));
      el.textContent = sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : T('discord.vencido');
    }, 1000);
  }

  /* ---------- Clics ---------- */
  document.addEventListener('click', (e) => {
    if (!S) return;   // todavía cargando el idioma guardado
    snd.unlock();
    mus.init();
    const nav = e.target.closest('nav button');
    if (nav) {
      if (VI) return;   // jugando un turno en línea: primero se termina o se deja para después
      if (nav.dataset.tab === 'online' && tab === 'online' && vistaOnline !== 'hub') { vistaOnline = 'hub'; desmontarOnline(); }
      tab = nav.dataset.tab; snd.play('tap'); mus.go('menu'); render(); window.scrollTo(0, 0); return;
    }
    const bm = e.target.closest('#overlay [data-merc]');
    if (bm && window.Mercado && $('merc-cont')) { window.Mercado.clicVentana(ctxMercado(), $('merc-cont'), bm); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    const id = el.dataset.id ? Number(el.dataset.id) : null;
    switch (a) {
      case 'mute': snd.toggle(); render(); break;
      case 'music': mus.toggle(); mus.init(); render(); break;
      case 'soporte': if (window.Soporte) Promise.resolve(window.Soporte.abrir(ctxSoporte())).catch(() => toast(T('err.no_completo'))); break;
      case 'vista-tienda': vistaTienda = el.dataset.k; if (window.Mercado) window.Mercado.invalidar(); render(); break;
      case 'cuenta': abrirCuenta(el.dataset.modo); break;
      case 'salir': Api.salir().then(() => { if (Pm) Pm.setVip(false); invalidarOnline(); vistaOnline = 'hub'; toast(T('cuenta.salio')); if (window.Chat) window.Chat.refrescar(); render(); }).catch((err) => toast(TL(err.message))); break;
      case 'idioma': abrirIdiomas(); break;
      case 'set-idioma': closeModal(); elegirIdioma(el.dataset.k); snd.play('tap'); break;
      case 'comprar': comprar(el.dataset.k); break;
      case 'canjear': canjear(el.dataset.k); break;
      case 'vip-bono': bonoVip(); break;
      case 'partida': if (eleccion) { const f = eleccion; eleccion = null; f(el.dataset.k); } break;
      case 'install':
        try { window.PWA.install().then((r) => { if (r === 'accepted') toast(T('pwa.instalado')); render(); }); } catch (err) { toast(T('pwa.no_permite')); }
        break;
      case 'tab': tab = el.dataset.tab; snd.play('tap'); mus.go('menu'); render(); window.scrollTo(0, 0); break;
      case 'online': vistaOnline = el.dataset.k || 'hub'; snd.play('tap'); desmontarOnline(); render(); window.scrollTo(0, 0); break;
      case 'discord': abrirDiscord(); break;
      case 'discord-copiar': {
        const txt = el.dataset.k || '';
        try { navigator.clipboard.writeText(txt).then(() => toast(T('discord.copiado'))).catch(() => toast(txt)); } catch (err) { toast(txt); }
        break;
      }
      case 'discord-quitar':
        apiPost('/api/discord/desvincular', {}).then(() => Api.refrescar()).then(() => { closeModal(); toast(T('discord.desvinculado')); render(); }).catch((err) => toast(err.message));
        break;
      case 'close': { const deprep = !!prep && !S.currentEvent; closeModal(); if (deprep) { prep = null; mus.go('menu'); } render(); break; }
      case 'confirm-yes': { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); break; }
      case 'next-day': diaAntes = { money: S.money }; G.nextDay(S); save(); snd.play('day'); render(); toast(T('comun.dia_n', { n: S.day })); continuar(); break;
      case 'close-dia': tomarAvisos(); closeModal(); render(); continuar(); break;
      case 'mkt': {
        const visita = el.dataset.k === 'visitar';
        if (visita) diaAntes = { money: S.money };
        act(G.marketing(S, el.dataset.k), 'logo');
        if (visita) continuar();
        break;
      }
      case 'hire': {
        const r = act(G.hire(S, id), 'hire');
        // QA: la ventana de "Capítulo completado" siempre aparece (también al contratar o comprar)
        if (r && r.chapterDone && !Array.isArray(S.capCompletados)) showChapterDone(r.chapterDone); else continuar();
        break;
      }
      case 'fire': { const p = S.staff.find((x) => x.id === id); if (p) ask(T('personal.despedir_q', { nombre: esc(TL(p.name)) }), T('personal.despedir_si'), () => act(G.fire(S, id))); break; }
      case 'search-staff': { const sel = $('rolBuscar'); rolBuscar = sel ? sel.value : rolBuscar; act(G.searchStaff(S, rolBuscar || undefined)); break; }
      case 'cat': catSel = el.dataset.k; lsSet('envivo_cat', catSel); snd.play('tap'); render(); break;
      case 'buy': {
        const r = act(G.buy(S, el.dataset.k), 'buy');
        if (r && r.chapterDone && !Array.isArray(S.capCompletados)) showChapterDone(r.chapterDone); else continuar();
        break;
      }
      case 'buy-cons': act(G.buyConsumable(S, el.dataset.k, 1), 'buy'); break;
      case 'repair': act(G.repair(S, id), 'buy'); break;
      case 'sell': { const it = S.equip.find((x) => x.id === id); if (it) ask(T('bodega.vender_q', { item: esc(itemName(it.type)), m: M(G.sellPrice(it)) }), T('bodega.vender_si'), () => act(G.sell(S, id), 'buy')); break; }
      case 'prep': { snd.play('tap'); const pc = S.contracts.find((x) => x.id === id); if (pc) mus.go(esFuneral(pc.type) ? 'funeral' : 'preparacion'); openPrep(id); break; }
      case 'auto': { const sg = G.suggestLoadout(S, prep.id); prep.staff = new Set(sg.staffIds); prep.equip = new Set(sg.equipIds); snd.play('tap'); marcarSeleccion(); renderPrep(true); break; }
      case 'go-live': {
        const r = G.startEvent(S, prep.id, [...prep.staff], [...prep.equip]);
        if (!r.ok) { toast(TL(r.msg)); snd.play('error'); break; }
        save(); render();
        snd.play('live');
        const ty = S.currentEvent.contract.type;
        snd.amb(['barrial', 'ligapro', 'final', 'concierto', 'boxeo', 'lucha_libre', 'internacional_host', 'internacional_unilateral'].includes(ty) ? 'crowd' : 'room');
        mus.go(esFuneral(ty) ? 'funeral' : temaDeEvento(ty));
        if (ty === 'final' || ty === 'ligapro') setTimeout(() => mus.stinger(), 900);
        prep = null;
        showIncident();
        break;
      }
      case 'choose': choose(Number(el.dataset.i)); break;
      case 'next-inc': showIncident(); break;
      case 'finish': finish(); break;
      case 'vi-salir': cerrarIntento(false); break;
      case 'vi-enviar': cerrarIntento(true); break;
      case 'after-result':
        tomarAvisos();   // ya se vieron en el resultado
        if (afterResult) { const d = afterResult; afterResult = null; lsSet(RES_KEY, { chapter: d, ev: S.stats.events }); showChapterDone(d); }
        else { lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); }
        break;
      case 'close-story':
        if (capDeCola && Array.isArray(S.capCompletados) && S.capCompletados.length) { S.capCompletados.shift(); save(); }
        capDeCola = false;
        lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); break;
      case 'new-game': ask(T('inicio.nueva_q'), T('inicio.nueva_si'), () => { S = G.newGame(); olvidarDia(); if (Pm && Api.estado) Pm.prepararPartidaNueva(S, Api.estado.entregas); save(); tab = 'inicio'; mus.go('menu'); render(); showChapterIntro(); }); break;
      case 'restart': S = G.newGame(); olvidarDia(); if (Pm && Api.estado) Pm.prepararPartidaNueva(S, Api.estado.entregas); save(); closeModal(); tab = 'inicio'; mus.go('menu'); render(); showChapterIntro(); break;
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'formCuenta') { e.preventDefault(); enviarCuenta(e.target); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.id === 'rolBuscar') { rolBuscar = el.value; return; }
    if (!el.dataset || !prep) return;
    const id = Number(el.dataset.id);
    if (el.dataset.act === 'tog-staff' || el.dataset.act === 'tog-equip') {
      const set = el.dataset.act === 'tog-staff' ? prep.staff : prep.equip;
      if (el.checked) set.add(id); else set.delete(id);
      const l = el.closest('.pick'); if (l) l.classList.toggle('sel', el.checked);
      renderPrep(true);
    }
  });

  /* ---------- Inicio ---------- */
  /* ---------- Idiomas: al inicio solo está js/lang/es.js; js/i18n.js carga el resto bajo pedido ---------- */
  let idiomaPedido = false;   // el aviso "idioma cambiado" solo cuando lo eligió el jugador
  function elegirIdioma(code) { if (!I18) return; idiomaPedido = true; I18.setIdioma(code); }

  // Textos del juego (nombres, imprevistos, registro) en el idioma elegido: js/i18n.js trae I18N.juego
  if (I18) {
    // Al cambiar de idioma se vuelve a pintar todo: textos fijos, pestaña, ventana abierta y chat
    I18.onChange(() => {
      enlazarTraductor();
      I18.aplicar();
      if (window.Mercado && window.Mercado.invalidar) window.Mercado.invalidar();
      invalidarOnline();
      if (S) render();
      if (window.Chat && window.Chat.refrescar) { try { window.Chat.refrescar(); } catch (e) { /* nada */ } }
      if (idiomaPedido && S) toast(T('idioma.cambiado'));
      idiomaPedido = false;
    });
  }
  try { if (window.PWA) window.PWA.onChange(() => { if (tab === 'inicio') render(); }); } catch (e) { /* sin instalación */ }

  function arrancar() {
    enlazarTraductor();
    if (I18) I18.aplicar();
    S = load() || G.newGame();
    save();
    render();
    // Resultado que no se alcanzó a ver (se recargó en esa pantalla): se muestra otra vez
    const pend = lsGet(RES_KEY);
    const pendOk = pend && !S.currentEvent && pend.ev === S.stats.events;
    if (pend && !pendOk) lsSet(RES_KEY, null);
    if (S.currentEvent) showIncident();       // si cerraste la app en pleno evento, sigue donde quedó
    else if (pendOk && pend.r) { try { showResult(pend.r, pend.caja, false, pend.ty); } catch (e) { lsSet(RES_KEY, null); closeModal(); continuar(); } }
    else if (pendOk && pend.chapter) { try { showChapterDone(pend.chapter); } catch (e) { lsSet(RES_KEY, null); closeModal(); continuar(); } }
    else continuar();
    // La red (tienda, cuenta, chat, Google Play) después de la primera pantalla y de los scripts diferidos
    const red = () => setTimeout(conectar, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', red, { once: true }); else red();
  }
  // Conectar con la tienda (si hay servidor). Si volvemos de un pago aprobado, avisar.
  async function conectar() {
    GP = GP || window.GooglePlay || null;
    const volvioDePago = /[?&]compra=ok\b/.test(location.search);
    if (volvioDePago) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ } }
    if (window.Api && window.Api.iniciar) await window.Api.iniciar();
    await alConectar(false);
    if (window.Chat && Api.disponible) window.Chat.iniciar(ctxChat());
    if (Api.estado && Api.estado.logueado) {
      // Si este celular no tiene partida avanzada pero la cuenta sí, traerla
      if (S.stats.events === 0 && S.day <= 1) await elegirPartida();
      aplicarEntregas(); render();
    }
    if (volvioDePago && !enApp()) { tab = 'tienda'; render(); toast(T('tienda.compra_ok')); snd.play('chapter'); }
    else if (sinLeerSoporte()) toast(T('soporte.nuevas', { n: sinLeerSoporte() }));
    // Google Play (solo en la app de Android): precios y compras que quedaron sin confirmar
    await iniciarPlay();
  }
  // Íconos fijos de la barra de abajo y la cabecera
  document.querySelectorAll('[data-ico]').forEach((el) => { el.insertAdjacentHTML('afterbegin', I(el.dataset.ico)); });
  // Con otro idioma guardado, js/i18n.js trae su diccionario (I18N.listo) y después se pinta, ya en ese idioma
  if (I18 && I18.listo && typeof I18.listo.then === 'function') I18.listo.then(arrancar, arrancar);
  else arrancar();
  window.__game = { get state() { return S; } }; // para las pruebas automáticas
})();
