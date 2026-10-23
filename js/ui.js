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
  const M = (n) => (I18 ? I18.money(n) : G.money(n));
  const N = (n) => (I18 ? I18.num(n) : String(n));
  const I = (name, cls) => A.icon(name, cls);
  // Quita el emoji del inicio de los textos de la lógica (ahora hay dibujos)
  const noEmoji = (t) => String(t).replace(/^(\p{Extended_Pictographic}|️|‍|\s)+/u, '');

  /* ---------- Sonido (opcional: si js/sound.js no está, no pasa nada) ---------- */
  const snd = {
    play(n, x) { try { if (window.Sound) window.Sound.play(n, x); } catch (e) { /* sin sonido */ } },
    amb(k) { try { if (window.Sound) window.Sound.ambience(k); } catch (e) { /* sin sonido */ } },
    unlock() { try { if (window.Sound) window.Sound.unlock(); } catch (e) { /* sin sonido */ } },
    muted() { try { return window.Sound ? window.Sound.isMuted() : true; } catch (e) { return true; } },
    toggle() { try { if (window.Sound) window.Sound.setMuted(!window.Sound.isMuted()); } catch (e) { /* sin sonido */ } },
  };

  let S = null;            // estado del juego
  let tab = 'inicio';
  let prep = null;         // selección al preparar un evento
  let afterResult = null;  // capítulo completado pendiente de mostrar

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
  function confetti(n) {
    if (reduceMotion() || !n) return;
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
    const step = (t) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (t - t0) / (ms || 900));
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(to * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const TILE_COLOR = { misa: 'amber', boda: 'amber', prensa: 'blue', barrial: 'green', graduacion: 'blue', lanzamiento: 'red', concierto: 'red', ligapro: 'green', final: 'amber' };
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
    el.classList.remove('bump', 'down'); void el.offsetWidth;
    el.classList.add('bump'); if (!up) el.classList.add('down');
  }
  function render() {
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
    pintarIdiomaBtn();
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('main section').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + tab));
    if (Pm && Pm.tickVip(S)) { try { localStorage.setItem(SAVE_KEY, G.serialize(S)); } catch (e) { /* nada */ } }
    $('vipBadge').hidden = !(Pm && Pm.vip);
    ({ inicio: renderInicio, clientes: renderClientes, personal: renderPersonal, bodega: renderBodega, tienda: renderTienda, registro: renderRegistro })[tab]();
    if (S.gameOver && !$('overlay').classList.contains('on')) showGameOver();
  }

  function renderInicio() {
    const ch = G.CHAPTERS[S.chapter];
    const rent = G.dailyCost ? G.dailyCost(S) : 20 + 4 * (S.staff.length - 1);
    let cb = null;
    try { cb = G.dailyCostBreakdown ? G.dailyCostBreakdown(S) : null; } catch (e) { cb = null; }
    const costBox = cb ? `<div class="costbox"><div class="ci">${I('home')}</div><div class="t">
        <b style="font-family:inherit">${esc(TL(cb.place))}</b> · ${T('inicio.gastos_hoy')} <b class="neg">${M(cb.total)}</b>
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
    $('tab-inicio').innerHTML = `
      <div class="card hqcard">${A.hq(S)}
        <div class="in">
          <div class="row wrap small">
            <span class="tag">${I('people')}${T('inicio.personas', { n: S.staff.length })}</span>
            <span class="tag">${I('box')}${T('inicio.equipos', { n: S.equip.length })}</span>
            <span class="tag">${I('rec')}${T('inicio.eventos', { n: S.stats.events })}</span>
            <span class="tag">${I('star')}${T('inicio.cinco_estrellas', { n: S.stats.fiveStars })}</span>
          </div>
          ${costBox}
          <button class="btn main" data-act="tab" data-tab="clientes">${I('clients')}${T('inicio.ver_ofertas', { n: S.contracts.length })}</button>
          <button class="btn" data-act="next-day">${I('sleep')}${T('inicio.descansar')} <span class="muted small">(${T('inicio.gastos', { m: M(cb ? cb.total : rent) })})</span></button>
        </div>
      </div>
      ${installCard()}
      ${story}
      <div class="sectitle">${T('inicio.ultimo')}</div>
      <div class="card log">${S.log.slice(0, 6).map((l) => `<p><span>${T('comun.dia_n', { n: l.day })}</span>${esc(TL(l.text))}</p>`).join('')}</div>
      <div class="sectitle">${T('inicio.ayuda')}</div>
      <div class="card small muted">${T('inicio.ayuda_texto', { clientes: `<b>${T('nav.clientes')}</b>`, bodega: `<b>${T('nav.bodega')}</b>`, m: M(300) })}</div>
      <button class="btn" data-act="idioma">${I('stream')}${T('idioma.boton')}: ${esc(nombreIdioma())}</button>
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

  function renderPersonal() {
    const staff = S.staff.map((p) => `<div class="card">
      <div class="person">${avatarOf(p, 56)}
        <div class="grow who"><h3>${esc(TL(p.name))}</h3><div class="small muted">${p.premium ? `<span class="badge-p" style="margin:0 4px 0 0">${T('personal.estrella')}</span>` : ''}${esc(roleName(p.role))} · ${T('inicio.eventos', { n: p.events })}</div></div>
        <div class="small" style="text-align:right">${T('personal.habilidad')}<br><span class="skill">${starsTxt(p.skill)}</span></div></div>
      ${p.owner ? `<p class="small muted">${T('personal.eres_tu')}</p>` : `
      <div class="small muted" style="margin-top:8px">${T('personal.moral', { n: p.morale })}</div>${condBar(p.morale)}
      <div class="row between" style="margin-top:10px"><span class="small">${T('personal.cobra_evento', { m: `<b class="num">${M(p.wage)}</b>` })}</span>
        <button class="btn sm" data-act="fire" data-id="${p.id}">${T('personal.despedir')}</button></div>`}
    </div>`).join('');
    const cands = S.candidates.map((c) => `<div class="card">
      <div class="person">${avatarOf(c, 56)}
        <div class="grow who"><h3>${esc(TL(c.name))}</h3><div class="small muted">${esc(roleName(c.role))}</div></div>
        <div class="small" style="text-align:right">${T('personal.habilidad')}<br><span class="skill">${starsTxt(c.skill)}</span></div></div>
      <div class="row between" style="margin-top:10px"><span class="small">${T('personal.cobra_corto', { m: `<b class="num">${M(c.wage)}</b>` })}</span>
        <button class="btn sm main" data-act="hire" data-id="${c.id}">${T('personal.contratar', { m: M(c.wage * 2) })}</button></div>
    </div>`).join('');
    $('tab-personal').innerHTML = `
      <div class="sectitle">${T('personal.tu_equipo', { n: S.staff.length, max: 12 })}</div>${staff}
      <div class="sectitle">${T('personal.candidatos')}</div>
      <p class="small muted">${T('personal.pago_inicial')}</p>
      ${cands || emptyState('people', T('personal.vacio_t'), T('personal.vacio'))}
      <button class="btn" data-act="search-staff" style="margin-bottom:20px">${I('megaphone')}${T('personal.vacante', { m: M(30) })}</button>`;
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
    const shop = Object.keys(G.CATALOG).filter((k) => !G.CATALOG[k].premium).map((k) => {
      const it = G.CATALOG[k];
      const r = rar(k);
      const locked = it.minRep > S.rep;
      const owned = S.equip.filter((e) => e.type === k).length;
      return `<div class="card gear rf r-${r.key} ${locked ? 'locked' : ''}">
        <div class="row between">${rtag(k)}</div>
        <div class="art">${itemArt(k, 110)}${owned ? `<span class="owned">×${owned}</span>` : ''}${locked ? `<span class="lockov">${I('lock', 'lg')}</span>` : ''}</div>
        <div class="nm">${esc(TL(it.name))}</div><div class="ds">${esc(TL(it.desc))}</div><div class="grow2"></div>
        <button class="btn ${locked ? '' : 'green'}" data-act="buy" data-k="${k}" ${locked || S.money < it.price ? 'disabled' : ''}>
          ${locked ? T('bodega.fama_min', { n: it.minRep }) : M(it.price)}</button></div>`;
    }).join('');
    $('tab-bodega').innerHTML = `
      <div class="sectitle">${T('bodega.repuestos')}</div><p class="small muted" style="margin-top:-4px">${T('bodega.repuestos_det')}</p><div class="card">${cons}</div>
      <div class="sectitle">${T('bodega.tus_equipos', { n: S.equip.length })}</div>
      ${mine ? `<div class="ggrid">${mine}</div>` : emptyState('box', T('bodega.vacia_t'), T('bodega.vacia'))}
      <p class="small muted">${T('bodega.desgaste')}</p>
      <div class="sectitle">${T('bodega.tienda')}</div><div class="ggrid">${shop}</div><div style="height:20px"></div>`;
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
    if (!Api.disponible || !Api.estado) {
      const vitrina = Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].premium).slice(0, 4).map((k) => {
        const r = rar(k);
        return `<div class="card gear rf r-${r.key}"><div class="row between">${rtag(k)}</div><div class="art">${itemArt(k, 110)}</div><div class="nm">${esc(TL(G.CATALOG[k].name))}</div><div class="ds">${esc(TL(G.CATALOG[k].desc || ''))}</div></div>`;
      }).join('');
      el.innerHTML = `<div class="sectitle">${T('nav.tienda')}</div><div class="card rf r-exclusivo">
        <div class="prodrow">${itemArt('creditos_700', 72)}<div class="grow"><h3>${T('tienda.offline_t', { sitio: 'juego.tukanec.com' })}</h3>
        <p class="small muted" style="margin:4px 0 0">${T('tienda.offline', { sitio: '<b>juego.tukanec.com</b>' })}</p></div></div></div>
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
        <button class="btn sm" data-act="salir">${T('cuenta.salir')}</button></div>`;
    }
    const prueba = E.plux && E.plux.ambiente === 'sandbox' ? `<p class="small" style="color:var(--amber)">${T('tienda.sandbox')}</p>` : '';
    const productos = (E.tienda.productos || []).map((p) => {
      const dest = p.id === 'inicio';
      const hecho = dest && E.inicio_comprado;
      return `<div class="card prod ${dest ? 'dest' : ''} ${p.id === 'vip30' ? 'rf r-vip' : ''}">${dest ? `<span class="ribbon">${T('tienda.oferta_unica')}</span>` : p.id === 'vip30' ? '<span class="ribbon">VIP</span>' : ''}
        <div class="prodrow">${itemArt(p.id, 64)}
          <div class="grow"><h3>${esc(TL(p.nombre))}</h3><div class="small muted">${esc(TL(p.detalle || ''))}</div></div></div>
        <div class="row between" style="margin-top:10px"><span class="price">${precio(p.precio)}</span>
          <button class="btn sm main" data-act="comprar" data-k="${esc(p.id)}" ${hecho || !(E.plux && E.plux.disponible) ? 'disabled' : ''}>${hecho ? T('tienda.ya_tienes') : T('tienda.comprar')}</button></div></div>`;
    }).join('');
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
      <p class="small muted">${T('tienda.precios')}</p>${prueba}
      ${productos}
      ${E.plux && E.plux.disponible ? '' : `<div class="card small muted">${T('tienda.pago_inactivo')}</div>`}
      <div class="sectitle">${T('tienda.exclusivos')}</div>${premium ? `<div class="ggrid">${premium}</div>` : emptyState('gem', T('tienda.pronto_t'), T('tienda.pronto'))}
      <p class="small muted">${T('tienda.aviso')}</p>
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
      snd.play('hire');
      toast(reg ? T('cuenta.creada') : T('cuenta.hola', { nombre: Api.estado.jugador.nombre }));
      await alConectar(true);
      if (window.Chat) window.Chat.iniciar(ctxChat());
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

  async function comprar(id) {
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
    $('tab-registro').innerHTML = `<div class="sectitle">${T('registro.titulo')}</div>
      <div class="card log">${S.log.map((l) => `<p><span>${T('comun.dia_n', { n: l.day })}</span>${esc(TL(l.text))}</p>`).join('')}</div>`;
  }

  /* ---------- Preparar evento ---------- */
  function openPrep(contractId) {
    const c = S.contracts.find((x) => x.id === contractId);
    if (!c) return;
    const sug = G.suggestLoadout(S, contractId);
    prep = { id: contractId, staff: new Set(sug.staffIds), equip: new Set(sug.equipIds) };
    renderPrep();
  }

  function renderPrep() {
    const c = S.contracts.find((x) => x.id === prep.id);
    if (!c) { closeModal(); return; }
    const staff = S.staff.filter((p) => prep.staff.has(p.id));
    const equip = S.equip.filter((e) => prep.equip.has(e.id));
    const q = G.computeQuality(S, c, staff, equip);
    const wages = staff.reduce((a, p) => a + wageFor(p, c.diff), 0);
    const est = q.q >= 85 ? 5 : q.q >= 70 ? 4 : q.q >= 55 ? 3 : q.q >= 40 ? 2 : 1;
    // Consejo: solo lo que se arregla con equipo o personal
    const NO_FIX = /^(dificultad|lo que esperan|base\b|experiencia)|cansad|cansancio|desmotivad|[aá]nimo|apoyo/i;
    const STAFF_FIX = /sin director|sin sonidista|sin t[eé]cnico|sin operador|camar[oó]graf|director|sonidista|t[eé]cnico/i;
    const worst = q.parts.filter((p) => p[1] < 0 && !NO_FIX.test(p[0])).sort((a, b) => a[1] - b[1])[0];
    const tip = worst ? `<p class="small" style="color:var(--amber)">${I('tip', 'sm')} ${T('prep.resta', { que: esc(TL(worst[0])), n: worst[1] })} ${STAFF_FIX.test(worst[0]) && !/^Sin (switcher|consola|equipo)/i.test(worst[0]) ? T('prep.contrata') : T('prep.compralo')}</p>` : '';
    const staffHtml = S.staff.map((p) => { const w = wageFor(p, c.diff); return `<label class="pick ${prep.staff.has(p.id) ? 'sel' : ''}">
        <input type="checkbox" id="st-${p.id}" data-act="tog-staff" data-id="${p.id}" ${prep.staff.has(p.id) ? 'checked' : ''}>
        ${avatarOf(p, 44)}
        <div class="grow" style="min-width:0"><b>${esc(TL(p.name))}</b><div class="small muted">${esc(roleName(p.role))} · <span class="skill">${starsTxt(p.skill)}</span></div></div>
        <span class="num small" style="text-align:right">${M(w)}${w > p.wage ? `<br><span class="muted" style="font-size:10.5px">+${Math.round((w / p.wage - 1) * 100)}%</span>` : ''}</span></label>`; }).join('');
    const equipHtml = S.equip.map((e) => {
      const it = G.CATALOG[e.type] || { name: e.type };
      const off = vipBloqueado(e);
      return `<label class="pick ${prep.equip.has(e.id) ? 'sel' : ''} ${off ? 'vipoff' : ''}">
        <input type="checkbox" id="eq-${e.id}" data-act="tog-equip" data-id="${e.id}" ${prep.equip.has(e.id) ? 'checked' : ''}>
        ${itemArt(e.type, 44, 'mini')}
        <div class="grow" style="min-width:0"><b>${esc(TL(e.nick || it.name))}</b> ${rtag(e.type)}${off ? `<div class="small" style="color:var(--amber)">${T('prep.necesita_vip')}</div>` : condBar(e.condition)}</div>
        <span class="num small ${e.condition < 40 ? 'neg' : 'muted'}">${e.condition}%</span></label>`;
    }).join('');
    const pos = $('modal').scrollTop;
    openModal(`
      <div class="row between"><div class="row">${tile(c.type, TILE_COLOR[c.type])}<h2>${esc(eventName(c.type))}</h2></div><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <div class="small muted" style="margin-top:6px">${esc(TL(c.client))} · ${T('prep.paga', { m: `<span class="pay" style="font-size:15px">${M(c.pay)}</span>` })}</div>
      <div style="margin:6px 0 4px">${reqTags(c)}</div>
      <button class="btn" data-act="auto">${I('sparkle')}${T('prep.auto')}</button>
      <div class="sectitle">${T('prep.quien')}</div>${staffHtml}
      <div class="sectitle">${T('prep.que_equipos')}</div>${equipHtml}
      <p class="small muted">${T('prep.repuestos', { cables: T('prep.cables', { n: S.stock.cable }), baterias: T('prep.baterias', { n: S.stock.battery }) })}</p>
      <details><summary>${T('prep.como_calidad')}</summary>
        <table>${q.parts.map((p) => `<tr><td>${esc(TL(p[0]))}</td><td class="${p[1] < 0 ? 'down' : ''}">${p[1] > 0 ? '+' : ''}${p[1]}</td></tr>`).join('')}</table></details>
      <div class="preview">
        <div class="row between"><span>${T('prep.calidad_esperada')} <b class="num">${q.q}</b>/100</span><span>${starsTxt(est)}</span></div>
        ${c.rival && typeof c.rivalQuality === 'number' ? duelBars(q.q, c.rivalQuality) : `<div class="bar ${q.q < 40 ? 'red' : q.q < 55 ? 'amber' : ''}"><i style="width:${q.q}%"></i></div>`}
        ${tip}
        <div class="small muted" style="margin-top:6px">${T('prep.sueldos')} <b class="num">${M(wages)}</b> · ${T('prep.imprevistos')}</div>
        <button class="btn main" data-act="go-live">${I('rec', 'sm')} ${T('prep.al_aire')}</button>
      </div>`);
    $('modal').scrollTop = pos;
  }

  /* ---------- Evento en vivo ---------- */
  function liveCams() {
    const ev = S.currentEvent;
    return ev ? S.equip.filter((e) => ev.equipIds.includes(e.id) && G.CATALOG[e.type].cat === 'cam').length : 1;
  }
  function liveGear() {
    const ev = S.currentEvent;
    return ev ? S.equip.filter((e) => ev.equipIds.includes(e.id)).map((e) => e.type) : [];
  }
  function liveScene(type, key) {
    const ev = S.currentEvent;
    const c = ev ? ev.contract : null;
    return A.scene(type, key, liveCams(), false, liveGear(), { client: c ? c.client : '', seed: c ? c.id : 0 });
  }
  function incKey() {
    const ev = S.currentEvent;
    return ev && ev.incidents[ev.step] ? ev.incidents[ev.step].key : null;
  }

  function showIncident() {
    const inc = G.currentIncident(S);
    if (!inc) { finish(); return; }
    const c = S.currentEvent.contract;
    const key = incKey();
    snd.play('incident');
    setTimeout(() => snd.play(key), 250);
    openModal(`
      ${liveScene(c.type, key)}
      <div class="row between" style="margin-top:10px"><span class="live"><i></i>${T('vivo.en_vivo')}</span><span class="small muted">${T('vivo.imprevisto', { i: inc.n, total: inc.total })}</span></div>
      <div class="small muted" style="margin-top:8px">${esc(eventName(c.type))} · ${esc(TL(c.client))}</div>
      <div class="incident">${esc(noEmoji(TL(inc.text)))}</div>
      ${inc.choices.map((ch) => `<button class="btn choice" data-act="choose" data-i="${ch.i}" ${ch.ok ? '' : 'disabled'}>
        ${esc(TL(ch.label))}${ch.ok ? '' : `<small>${T('vivo.no_disponible', { why: esc(TL(ch.why)) })}</small>`}</button>`).join('')}`);
  }

  function choose(i) {
    const key = incKey();
    const r = G.resolveIncident(S, i);
    if (!r.ok) { toast(TL(r.msg)); snd.play('error'); return; }
    save();
    snd.play(r.q >= 0 ? 'good' : 'bad');
    const cls = r.q > 0 ? 'up' : r.q < 0 ? 'down' : '';
    const more = G.currentIncident(S);
    const c = S.currentEvent.contract;
    openModal(`
      ${liveScene(c.type, r.q > 4 ? 'epico' : key === 'luz' && r.q < -10 ? 'luz' : null)}
      <div style="margin-top:10px"><span class="live"><i></i>${T('vivo.en_vivo')}</span></div>
      <div class="incident">${esc(TL(r.msg))}</div>
      <p>${T('vivo.calidad')} <span class="delta ${cls}">${r.q > 0 ? '+' : ''}${r.q}</span></p>
      <button class="btn main" data-act="${more ? 'next-inc' : 'finish'}">${more ? T('comun.continuar') : T('vivo.terminar')}</button>`);
  }

  function finish() {
    const f = G.finishEvent(S);
    save();
    snd.amb(null);
    if (!f.ok) { toast(TL(f.msg)); closeModal(); render(); return; }
    const r = f.result;
    afterResult = r.chapterDone || null;
    snd.play('stars', r.stars);
    const duel = r.duel && typeof r.rivalQuality === 'number'
      ? `<div class="duel ${r.duel === 'won' ? 'won' : ''}" style="margin-top:10px">
          <div class="row between"><span class="res ${r.duel === 'won' ? 'up' : 'down'}">${I('rival', 'sm')} ${r.duel === 'won' ? T('res.duelo_ganado') : T('res.duelo_perdido')}</span><span class="small muted">${r.duel === 'won' ? T('res.fama_extra') : T('res.perdiste_fama')}</span></div>
          <div class="lbl"><span>${T('duelo.tu_calidad')}</span><b class="num">${r.quality}</b></div><div class="bar you"><i style="width:${r.quality}%"></i></div>
          <div class="lbl"><span>MegaVisión</span><b class="num">${r.rivalQuality}</b></div><div class="bar mega"><i style="width:${r.rivalQuality}%"></i></div></div>`
      : r.duel === 'won' ? `<p class="small up">${I('rival', 'sm')} ${T('res.ganaste_duelo')}</p>` : r.duel === 'lost' ? `<p class="small down">${I('rival', 'sm')} ${T('res.perdiste_duelo')}</p>` : '';
    const later = r.payLater > 0 ? `<div class="paylater">${I('clock', 'sm')} ${T('res.pago_luego', { ahora: M(r.payNow), luego: M(r.payLater), n: r.payLaterDays })}</div>` : '';
    openModal(`
      <div class="result-head"><div class="story-tag">${r.stars >= 4 ? T('res.impecable') : r.stars === 3 ? T('res.buen_trabajo') : T('res.terminada')}</div>
      <h2>${esc(noEmoji(TL(r.title)))}</h2></div>
      ${starsBig(r.stars)}
      <div class="bigmoney ${r.net >= 0 ? 'up' : 'down'} num" id="resNet">${r.net >= 0 ? '+' : '-'}${M(0)}</div>
      <div class="small muted" style="text-align:center">${T('res.ganancia_evento')}</div>
      <div class="row between" style="margin-top:12px"><span>${T('res.calidad_final')}</span><b class="num">${r.quality}/100</b></div>
      <div class="bar ${r.quality < 40 ? 'red' : r.quality < 55 ? 'amber' : ''}"><i style="width:${r.quality}%"></i></div>
      ${duel}
      <table style="margin-top:12px">
        <tr><td>${T('res.pago_cliente')}</td><td class="up">+${M(r.pay)}</td></tr>
        <tr><td>${T('res.sueldos')}</td><td class="down">-${M(r.wages)}</td></tr>
        <tr><td><b>${T('res.ganancia')}</b></td><td class="${r.net >= 0 ? 'up' : 'down'}"><b>${M(r.net)}</b></td></tr>
        <tr><td>${T('head.fama')}</td><td class="${r.repDelta >= 0 ? 'up' : 'down'}">${r.repDelta >= 0 ? '+' : ''}${r.repDelta}</td></tr>
      </table>
      ${later}
      ${r.ups.length ? `<p class="small">${I('trend', 'sm')} ${r.ups.map((u) => esc(TL(u))).join(' · ')}</p>` : ''}
      <details><summary>${T('res.ver_detalle')}</summary>
        <p class="small"><b>${T('res.calidad_inicial', { n: r.base })}</b></p>
        ${r.incidents.map((i) => `<p class="small">${esc(noEmoji(TL(i.text)))}<br><span class="muted">→ ${esc(TL(i.result.msg))} (${i.result.q > 0 ? '+' : ''}${i.result.q})</span></p>`).join('')}
      </details>
      <p class="small muted">${T('res.desgaste')}</p>
      <button class="btn main" data-act="after-result">${T('comun.continuar')}</button>`);
    countUp($('resNet'), r.net, 1000);
    if (r.stars >= 4) confetti(r.stars === 5 ? 70 : 45);
    else if (r.stars === 3) confetti(16);
  }

  function showChapterDone(d) {
    const idx = Math.max(0, G.CHAPTERS.findIndex((c) => c.title === d.title));
    snd.play('chapter');
    openModal(`<div class="story-tag">${T('historia.cap_completado')}</div><h2>${esc(TL(d.title))}</h2>
      ${speaker(charOf(idx), esc(TL(d.text)))}
      <p>${T('historia.premio')} <span class="pay">${M(d.reward)}</span></p>
      <button class="btn main" data-act="close-story">${T('historia.vamos')}</button>`);
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
    openModal(`<h2>${T('fin.titulo')}</h2>
      ${speaker('ramiro', T('fin.texto', { m: M(300), dia: S.day, eventos: T('inicio.eventos', { n: S.stats.events }) }))}
      <button class="btn main" data-act="restart">${T('fin.reiniciar')}</button>`);
  }

  /* ---------- Clics ---------- */
  document.addEventListener('click', (e) => {
    snd.unlock();
    const nav = e.target.closest('nav button');
    if (nav) { tab = nav.dataset.tab; snd.play('tap'); render(); window.scrollTo(0, 0); return; }
    const bm = e.target.closest('#overlay [data-merc]');
    if (bm && window.Mercado && $('merc-cont')) { window.Mercado.clicVentana(ctxMercado(), $('merc-cont'), bm); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    const id = el.dataset.id ? Number(el.dataset.id) : null;
    switch (a) {
      case 'mute': snd.toggle(); render(); break;
      case 'vista-tienda': vistaTienda = el.dataset.k; if (window.Mercado) window.Mercado.invalidar(); render(); break;
      case 'cuenta': abrirCuenta(el.dataset.modo); break;
      case 'salir': Api.salir().then(() => { if (Pm) Pm.setVip(false); toast(T('cuenta.salio')); if (window.Chat) window.Chat.refrescar(); render(); }).catch((err) => toast(TL(err.message))); break;
      case 'idioma': abrirIdiomas(); break;
      case 'set-idioma': closeModal(); if (I18) I18.setIdioma(el.dataset.k); snd.play('tap'); break;
      case 'comprar': comprar(el.dataset.k); break;
      case 'canjear': canjear(el.dataset.k); break;
      case 'vip-bono': bonoVip(); break;
      case 'partida': if (eleccion) { const f = eleccion; eleccion = null; f(el.dataset.k); } break;
      case 'install':
        try { window.PWA.install().then((r) => { if (r === 'accepted') toast(T('pwa.instalado')); render(); }); } catch (err) { toast(T('pwa.no_permite')); }
        break;
      case 'tab': tab = el.dataset.tab; snd.play('tap'); render(); window.scrollTo(0, 0); break;
      case 'close': closeModal(); render(); break;
      case 'confirm-yes': { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); break; }
      case 'next-day': G.nextDay(S); save(); snd.play('day'); render(); toast(T('comun.dia_n', { n: S.day })); showChapterIntro(); break;
      case 'mkt': act(G.marketing(S, el.dataset.k), 'logo'); break;
      case 'hire': act(G.hire(S, id), 'hire'); showChapterIntro(); break;
      case 'fire': { const p = S.staff.find((x) => x.id === id); if (p) ask(T('personal.despedir_q', { nombre: esc(TL(p.name)) }), T('personal.despedir_si'), () => act(G.fire(S, id))); break; }
      case 'search-staff': act(G.searchStaff(S)); break;
      case 'buy': act(G.buy(S, el.dataset.k), 'buy'); showChapterIntro(); break;
      case 'buy-cons': act(G.buyConsumable(S, el.dataset.k, 1), 'buy'); break;
      case 'repair': act(G.repair(S, id), 'buy'); break;
      case 'sell': { const it = S.equip.find((x) => x.id === id); if (it) ask(T('bodega.vender_q', { item: esc(itemName(it.type)), m: M(G.sellPrice(it)) }), T('bodega.vender_si'), () => act(G.sell(S, id), 'buy')); break; }
      case 'prep': snd.play('tap'); openPrep(id); break;
      case 'auto': { const s = G.suggestLoadout(S, prep.id); prep.staff = new Set(s.staffIds); prep.equip = new Set(s.equipIds); snd.play('tap'); renderPrep(); break; }
      case 'go-live': {
        const r = G.startEvent(S, prep.id, [...prep.staff], [...prep.equip]);
        if (!r.ok) { toast(TL(r.msg)); snd.play('error'); break; }
        save(); render();
        snd.play('live');
        snd.amb(['barrial', 'ligapro', 'final', 'concierto'].includes(S.currentEvent.contract.type) ? 'crowd' : 'room');
        showIncident();
        break;
      }
      case 'choose': choose(Number(el.dataset.i)); break;
      case 'next-inc': showIncident(); break;
      case 'finish': finish(); break;
      case 'after-result':
        if (afterResult) { const d = afterResult; afterResult = null; showChapterDone(d); }
        else { closeModal(); render(); if (S.gameOver) showGameOver(); }
        break;
      case 'close-story': closeModal(); render(); if (!showChapterIntro() && S.gameOver) showGameOver(); break;
      case 'new-game': ask(T('inicio.nueva_q'), T('inicio.nueva_si'), () => { S = G.newGame(); if (Pm && Api.estado) Pm.prepararPartidaNueva(S, Api.estado.entregas); save(); tab = 'inicio'; render(); showChapterIntro(); }); break;
      case 'restart': S = G.newGame(); if (Pm && Api.estado) Pm.prepararPartidaNueva(S, Api.estado.entregas); save(); closeModal(); tab = 'inicio'; render(); showChapterIntro(); break;
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'formCuenta') { e.preventDefault(); enviarCuenta(e.target); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !prep) return;
    const id = Number(el.dataset.id);
    if (el.dataset.act === 'tog-staff') { el.checked ? prep.staff.add(id) : prep.staff.delete(id); renderPrep(); }
    if (el.dataset.act === 'tog-equip') { el.checked ? prep.equip.add(id) : prep.equip.delete(id); renderPrep(); }
  });

  /* ---------- Inicio ---------- */
  // Íconos fijos de la barra de abajo y la cabecera
  document.querySelectorAll('[data-ico]').forEach((el) => { el.insertAdjacentHTML('afterbegin', I(el.dataset.ico)); });
  if (I18) {
    I18.aplicar();
    // Al cambiar de idioma se vuelve a pintar todo: textos fijos, pestaña, ventana abierta y chat
    I18.onChange(() => {
      I18.aplicar();
      if (window.Mercado && window.Mercado.invalidar) window.Mercado.invalidar();
      if (S) render();
      if (window.Chat && window.Chat.refrescar) { try { window.Chat.refrescar(); } catch (e) { /* nada */ } }
      toast(T('idioma.cambiado'));
    });
  }
  try { if (window.PWA) window.PWA.onChange(() => { if (tab === 'inicio') render(); }); } catch (e) { /* sin instalación */ }
  S = load() || G.newGame();
  save();
  render();
  if (S.currentEvent) showIncident();       // si cerraste la app en pleno evento, sigue donde quedó
  else showChapterIntro();
  // Conectar con la tienda (si hay servidor). Si volvemos de un pago aprobado, avisar.
  (async () => {
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
    if (volvioDePago) { tab = 'tienda'; render(); toast(T('tienda.compra_ok')); snd.play('chapter'); }
  })();
  window.__game = { get state() { return S; } }; // para las pruebas automáticas
})();
