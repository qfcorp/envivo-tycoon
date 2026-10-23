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
  const M = G.money;
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
    if (res && res.msg) toast(res.msg);
    if (res) snd.play(res.ok ? (okSound || 'tap') : 'error');
    save(); render(); return res;
  }

  /* ---------- Ventana ---------- */
  function openModal(html) { $('modal').innerHTML = html; $('overlay').classList.add('on'); $('modal').scrollTop = 0; }
  function closeModal() { $('overlay').classList.remove('on'); $('modal').innerHTML = ''; }
  let confirmCb = null;
  function ask(text, yesLabel, cb) {
    confirmCb = cb;
    openModal(`<h2>¿Seguro?</h2><p>${text}</p>
      <button class="btn main" data-act="confirm-yes">${yesLabel}</button>
      <button class="btn" data-act="close">Cancelar</button>`);
  }

  /* ---------- Ayudantes visuales ---------- */
  const starsTxt = (n, max) => '★'.repeat(n) + '<span class="muted">' + '★'.repeat((max || 5) - n) + '</span>';
  function starsBig(n) {
    const path = 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z';
    return `<div class="starsvg" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5].map((i) =>
      `<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><path class="${i <= n ? 'on' : 'off'}" style="animation-delay:${i * 0.15}s" d="${path}"/></svg>`).join('')}</div>`;
  }
  function condBar(v) {
    const cls = v < 40 ? 'red' : v < 70 ? 'amber' : '';
    return `<div class="bar ${cls}"><i style="width:${v}%"></i></div>`;
  }
  /* ---------- Rarezas, equipos y personas (dibujos de Art) ---------- */
  const rar = (type) => { try { return A.rarity ? A.rarity(type) : { key: 'comun', label: 'Común', color: '#9aa6bb' }; } catch (e) { return { key: 'comun', label: 'Común', color: '#9aa6bb' }; } };
  const rtag = (type) => { const r = rar(type); return `<span class="rtag" style="--rc:${r.color}">${esc(r.label)}</span>`; };
  const itemArt = (type, size, cls) => { try { return A.item ? A.item(type, size).replace('class="itemart', `class="itemart ${cls || ''}`) : tile(type); } catch (e) { return tile(type); } };
  const avatarOf = (p, size) => { try { return A.avatar ? A.avatar(p.name, p.role, size || 52, { owner: p.owner, premium: p.premium }) : tile('role_' + p.role); } catch (e) { return tile('role_' + p.role); } };
  const equipName = (e) => { const it = G.CATALOG[e.type] || { name: e.type }; if (e.nick) return e.nick; try { if (Pm && Pm.nombreSerie) return Pm.nombreSerie(e); } catch (err) { /* nada */ } return it.name; };
  const vipBloqueado = (e) => { try { return !!(Pm && Pm.bloqueado && Pm.bloqueado(e)); } catch (err) { return false; } };
  const wageFor = (p, diff) => { try { return G.eventWage ? G.eventWage(p, diff) : p.wage; } catch (e) { return p.wage; } };
  const emptyState = (iconName, title, text) => `<div class="card empty"><div class="ei">${I(iconName)}</div><b>${title}</b><div class="small">${text}</div></div>`;
  const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function duelBars(you, mega, label) {
    const won = you > mega;
    return `<div class="duel ${won ? 'won' : ''}">
      <div class="row between small"><span>${I('rival', 'sm')} ${label || 'Duelo con MegaVisión'}</span>${label ? '' : `<b class="${won ? 'up' : 'down'}">${won ? 'Vas ganando' : 'Vas perdiendo'}</b>`}</div>
      <div class="lbl"><span>Tu calidad</span><b class="num">${you}</b></div><div class="bar you"><i style="width:${Math.max(0, Math.min(100, you))}%"></i></div>
      <div class="lbl"><span>MegaVisión promete</span><b class="num">${mega}</b></div><div class="bar mega"><i style="width:${Math.max(0, Math.min(100, mega))}%"></i></div></div>`;
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
    if (c.story) t.push(`<span class="tag amber">${I('star')}Oferta de la historia</span>`);
    if (c.rival) t.push(`<span class="tag rival">${I('rival')}Disputado con MegaVisión</span>`);
    t.push(`<span class="tag">${I('cam_basic')}${c.cams} cámara${c.cams > 1 ? 's' : ''}</span>`);
    if (c.cams >= 2) t.push(`<span class="tag">${I('switch_pro')}switcher + director</span>`);
    if (c.audio) t.push(`<span class="tag">${I('role_audio')}audio</span>`);
    if (c.stream) t.push(`<span class="tag red">${I('stream')}en vivo por internet</span>`);
    if (c.outdoor) t.push(`<span class="tag amber">${I('outdoor')}aire libre</span>`);
    return t.join('');
  }
  // Personaje de cada capítulo (si la lógica no lo indica)
  const CH_CHAR = ['ramiro', 'ramiro', 'marca', 'mega', 'dirigente', 'ramiro'];
  const charOf = (i) => (G.CHAPTERS[i] && G.CHAPTERS[i].character) || CH_CHAR[i] || 'ramiro';
  function speaker(key, html) {
    return `<div class="speaker">${A.portrait(key, 64)}<div class="grow"><div class="who">${esc(A.PORTRAIT_NAMES[key] || '')}</div></div></div>
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
    $('muteBtn').setAttribute('aria-label', snd.muted() ? 'Activar sonido' : 'Silenciar');
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
        <b style="font-family:inherit">${esc(cb.place)}</b> · gastos de hoy <b class="neg">${M(cb.total)}</b>
        <div class="small muted">Local ${M(cb.rent)}${cb.staff ? ` · personal ${M(cb.staff + (cb.payroll || 0))}` : ''}${cb.equip ? ` · seguro de equipos ${M(cb.equip)}` : ''}</div>
        ${cb.nextPlace ? `<div class="small" style="color:var(--amber)">Con ${cb.nextAt} entre personas y equipos (tienes ${cb.size}) pasas a ${esc(cb.nextPlace)}: el local sube a ${M(cb.nextRent)} al día.</div>` : ''}
      </div></div>` : '';
    let story;
    if (S.storyDone) {
      story = `<div class="card"><div class="story-tag">Modo historia</div><h2>¡Historia completada!</h2>
        <p class="muted">Sigue creciendo en modo libre: más eventos, mejor equipo y más fama.</p></div>`;
    } else {
      story = `<div class="card"><div class="story-tag">Historia</div><h2>${esc(ch.title)}</h2>
        <div class="row" style="align-items:flex-start;margin-top:8px">${A.portrait(charOf(S.chapter), 52)}
          <p class="small muted grow" style="margin:0">${esc(ch.intro)}</p></div>
        <p><b>Objetivo:</b> ${esc(ch.goal)}</p>
        <p class="small">Progreso: <span class="num">${esc(ch.progress(S))}</span></p>
        <p class="small muted">Premio: <span class="pay" style="font-size:14px">${M(ch.reward)}</span></p></div>`;
    }
    $('tab-inicio').innerHTML = `
      <div class="card hqcard">${A.hq(S)}
        <div class="in">
          <div class="row wrap small">
            <span class="tag">${I('people')}${S.staff.length} personas</span>
            <span class="tag">${I('box')}${S.equip.length} equipos</span>
            <span class="tag">${I('rec')}${S.stats.events} eventos</span>
            <span class="tag">${I('star')}${S.stats.fiveStars} de 5 estrellas</span>
          </div>
          ${costBox}
          <button class="btn main" data-act="tab" data-tab="clientes">${I('clients')}Ver ofertas de clientes (${S.contracts.length})</button>
          <button class="btn" data-act="next-day">${I('sleep')}Descansar y pasar al día siguiente <span class="muted small">(gastos ${M(cb ? cb.total : rent)})</span></button>
        </div>
      </div>
      ${installCard()}
      ${story}
      <div class="sectitle">Lo último que pasó</div>
      <div class="card log">${S.log.slice(0, 6).map((l) => `<p><span>Día ${l.day}</span>${esc(l.text)}</p>`).join('')}</div>
      <div class="sectitle">Ayuda rápida</div>
      <div class="card small muted">
        1) Toma una oferta en <b>Clientes</b>. 2) Elige personal y equipos. 3) Resuelve los imprevistos en vivo.
        4) Cobra, gana fama y compra mejor equipo en <b>Bodega</b>. Cada evento ocupa un día.
        Si tus deudas pasan de $300, quiebras.
      </div>
      <button class="btn" data-act="new-game" style="margin-bottom:20px">${I('refresh')}Empezar partida nueva</button>`;
  }

  // Botón para instalar como app (solo si el navegador lo permite)
  function installCard() {
    const P = window.PWA;
    try {
      if (!P || P.isStandalone()) return '';
      if (P.canInstall()) return `<button class="btn" data-act="install">${I('box')}Instalar como app en este celular</button>`;
      if (P.isIOS()) return `<div class="card small muted">${I('tip', 'sm')} Para instalar el juego: toca <b>Compartir</b> en Safari y luego <b>Agregar a inicio</b>.</div>`;
    } catch (e) { /* sin instalación */ }
    return '';
  }

  function renderClientes() {
    const cards = S.contracts.map((c) => {
      const t = G.EVENT_TYPES[c.type];
      return `<div class="card">
        <div class="row">${tile(c.type, TILE_COLOR[c.type])}
          <div class="grow"><h3>${esc(t.name)}</h3><div class="small muted">${esc(c.client)}</div></div>
          <div class="pay">${M(c.pay)}</div></div>
        <div style="margin-top:6px">${reqTags(c)}</div>
        ${c.rival && typeof c.rivalQuality === 'number' ? `<div class="duel small" style="margin-top:8px"><div class="row between"><span>${I('rival', 'sm')} MegaVisión promete calidad <b class="num">${c.rivalQuality}</b></span><span class="muted">supérala</span></div><div class="bar mega"><i style="width:${c.rivalQuality}%"></i></div></div>` : ''}
        <div class="row between small" style="margin-top:8px">
          <span>Dificultad ${starsTxt(c.diff)}</span>
          <span class="${c.daysLeft <= 1 ? 'neg' : 'muted'}">${I('clock', 'sm')} vence en ${c.daysLeft} día${c.daysLeft > 1 ? 's' : ''}</span>
        </div>
        <button class="btn main" data-act="prep" data-id="${c.id}">Preparar evento</button>
      </div>`;
    }).join('');
    $('tab-clientes').innerHTML = `
      <div class="sectitle">Buscar clientes</div>
      <div class="card">
        <button class="btn" data-act="mkt" data-k="redes" ${S.daily.redes ? 'disabled' : ''}>${I('social')}Publicar en redes <span class="muted small">($40 · 1 oferta · 1 vez al día)</span></button>
        <button class="btn" data-act="mkt" data-k="anuncio" ${S.daily.anuncio ? 'disabled' : ''}>${I('ad')}Pagar anuncio <span class="muted small">($200 · 2 ofertas mejor pagadas)</span></button>
        <button class="btn" data-act="mkt" data-k="visitar">${I('walk')}Visitar clientes en persona <span class="muted small">(gratis · usa 1 día · 2 ofertas)</span></button>
      </div>
      <div class="sectitle">Ofertas disponibles (${S.contracts.length})</div>
      ${cards || emptyState('clients', 'Sin ofertas por ahora', 'Busca clientes con los botones de arriba o pasa al día siguiente.')}`;
  }

  function renderPersonal() {
    const roleName = (r) => (G.ROLES[r] ? G.ROLES[r].name : r);
    const staff = S.staff.map((p) => `<div class="card">
      <div class="person">${avatarOf(p, 56)}
        <div class="grow who"><h3>${esc(p.name)}</h3><div class="small muted">${p.premium ? '<span class="badge-p" style="margin:0 4px 0 0">ESTRELLA</span>' : ''}${esc(roleName(p.role))} · ${p.events} eventos</div></div>
        <div class="small" style="text-align:right">Habilidad<br><span class="skill">${starsTxt(p.skill)}</span></div></div>
      ${p.owner ? '<p class="small muted">Eres tú. Cubres una cámara gratis.</p>' : `
      <div class="small muted" style="margin-top:8px">Moral ${p.morale}%</div>${condBar(p.morale)}
      <div class="row between" style="margin-top:10px"><span class="small">Cobra <b class="num">${M(p.wage)}</b> por evento</span>
        <button class="btn sm" data-act="fire" data-id="${p.id}">Despedir</button></div>`}
    </div>`).join('');
    const cands = S.candidates.map((c) => `<div class="card">
      <div class="person">${avatarOf(c, 56)}
        <div class="grow who"><h3>${esc(c.name)}</h3><div class="small muted">${esc(roleName(c.role))}</div></div>
        <div class="small" style="text-align:right">Habilidad<br><span class="skill">${starsTxt(c.skill)}</span></div></div>
      <div class="row between" style="margin-top:10px"><span class="small">Cobra <b class="num">${M(c.wage)}</b>/evento</span>
        <button class="btn sm main" data-act="hire" data-id="${c.id}">Contratar ${M(c.wage * 2)}</button></div>
    </div>`).join('');
    $('tab-personal').innerHTML = `
      <div class="sectitle">Tu equipo (${S.staff.length}/12)</div>${staff}
      <div class="sectitle">Candidatos</div>
      <p class="small muted">El pago inicial es 2 veces su sueldo. Solo pagas sueldo cuando le llevas a un evento.</p>
      ${cands || emptyState('people', 'No hay candidatos', 'Publica una vacante y en un rato llegan hojas de vida.')}
      <button class="btn" data-act="search-staff" style="margin-bottom:20px">${I('megaphone')}Publicar vacante ($30)</button>`;
  }

  function renderBodega() {
    const cons = Object.keys(G.CONSUMABLES).map((k) => {
      const it = G.CONSUMABLES[k];
      return `<div class="pick">${itemArt(k, 48, 'mini')}
        <div class="grow"><b>${it.name}</b> <span class="num">× ${S.stock[k] || 0}</span><div class="small muted">${it.desc}</div></div>
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
        <div class="nm">${esc(e.nick || it.name)}</div>
        ${off ? '<div class="small" style="color:var(--amber)">Guardado: necesita VIP activo</div>' : ''}
        <div class="grow2"></div>
        <div class="cond"><span>Estado</span><b class="num ${e.condition < 40 ? 'neg' : ''}">${e.condition}%</b></div>${condBar(e.condition)}
        <div class="row2">
          <button class="btn sm" data-act="repair" data-id="${e.id}" ${rc <= 0 ? 'disabled' : ''}>${I('wrench', 'sm')}${rc > 0 ? M(rc) : 'Nuevo'}</button>
          ${it.premium ? '<button class="btn sm" disabled>No se vende</button>' : `<button class="btn sm" data-act="sell" data-id="${e.id}">Vender ${M(G.sellPrice(e))}</button>`}</div></div>`;
    }).join('');
    const shop = Object.keys(G.CATALOG).filter((k) => !G.CATALOG[k].premium).map((k) => {
      const it = G.CATALOG[k];
      const r = rar(k);
      const locked = it.minRep > S.rep;
      const owned = S.equip.filter((e) => e.type === k).length;
      return `<div class="card gear rf r-${r.key} ${locked ? 'locked' : ''}">
        <div class="row between">${rtag(k)}</div>
        <div class="art">${itemArt(k, 110)}${owned ? `<span class="owned">×${owned}</span>` : ''}${locked ? `<span class="lockov">${I('lock', 'lg')}</span>` : ''}</div>
        <div class="nm">${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div><div class="grow2"></div>
        <button class="btn ${locked ? '' : 'green'}" data-act="buy" data-k="${k}" ${locked || S.money < it.price ? 'disabled' : ''}>
          ${locked ? `Fama ${it.minRep}` : M(it.price)}</button></div>`;
    }).join('');
    $('tab-bodega').innerHTML = `
      <div class="sectitle">Repuestos</div><p class="small muted" style="margin-top:-4px">Se usan solos en los imprevistos.</p><div class="card">${cons}</div>
      <div class="sectitle">Tus equipos (${S.equip.length})</div>
      ${mine ? `<div class="ggrid">${mine}</div>` : emptyState('box', 'Tu bodega está vacía', 'Compra tu primer equipo en la tienda de abajo.')}
      <p class="small muted">El equipo se gasta en cada evento. Por debajo de 40% puede fallar en vivo.</p>
      <div class="sectitle">Tienda de equipos</div><div class="ggrid">${shop}</div><div style="height:20px"></div>`;
  }


  /* ---------- Tienda (dinero real y créditos) ---------- */
  const precio = (n) => '$' + Number(n).toFixed(2).replace('.', ',');
  function fechaCorta(iso) {
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
    if (Api.disponible === null) { el.innerHTML = '<div class="sectitle">Tienda</div><div class="card muted">Conectando con la tienda…</div>'; return; }
    if (!Api.disponible || !Api.estado) {
      const vitrina = Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].premium).slice(0, 4).map((k) => {
        const r = rar(k);
        return `<div class="card gear rf r-${r.key}"><div class="row between">${rtag(k)}</div><div class="art">${itemArt(k, 110)}</div><div class="nm">${esc(G.CATALOG[k].name)}</div><div class="ds">${esc(G.CATALOG[k].desc || '')}</div></div>`;
      }).join('');
      el.innerHTML = `<div class="sectitle">Tienda</div><div class="card rf r-exclusivo">
        <div class="prodrow">${itemArt('creditos_700', 72)}<div class="grow"><h3>La tienda funciona en juego.tukanec.com</h3>
        <p class="small muted" style="margin:4px 0 0">Desde aquí puedes jugar todo gratis. Para comprar créditos, el pase VIP o equipos exclusivos, abre el juego en <b>juego.tukanec.com</b> e ingresa con tu cuenta.</p></div></div></div>
        ${vitrina ? `<div class="sectitle">Equipos exclusivos</div><div class="ggrid">${vitrina}</div>` : ''}`;
      return;
    }
    const E = Api.estado;
    const log = E.logueado;
    let cuenta;
    if (!log) {
      cuenta = `<div class="card">${tile('user', 'blue')}
        <h3 style="margin-top:10px">Crea tu cuenta gratis</h3>
        <p class="small muted">Con tu cuenta tus compras quedan guardadas y tu partida se respalda en la nube para jugar en cualquier celular.</p>
        <button class="btn main" data-act="cuenta" data-modo="registro">${I('user')}Crear cuenta</button>
        <button class="btn" data-act="cuenta" data-modo="entrar">Ya tengo cuenta: entrar</button></div>`;
    } else {
      const vip = E.vip_activo
        ? `<p class="small" style="color:var(--amber)">${I('crown', 'sm')} VIP activo hasta el ${esc(fechaCorta(E.vip_hasta))}</p>
           ${E.vip_bono_hoy ? '<p class="small muted">Ya reclamaste tu bono VIP de hoy. Vuelve mañana.</p>' : `<button class="btn" data-act="vip-bono" style="border-color:var(--amber)">${I('gift')}Reclamar bono VIP de hoy ($150 + 10 créditos)</button>`}`
        : '';
      cuenta = `<div class="card">
        <div class="row between"><div class="wallet">${I('gem')}<div><div class="big">${Number(E.creditos).toLocaleString('es-EC')}</div><div class="small muted">créditos</div></div></div>
          <div class="small muted" style="text-align:right">${esc(E.jugador.nombre)}<br>${esc(E.jugador.email)}</div></div>
        ${vip}
        <p class="small muted">${I('cloud', 'sm')} Tu partida se guarda en la nube${nubeEstado === 'error' ? ' (sin conexión: se guardará al volver internet)' : ''}.</p>
        <button class="btn sm" data-act="salir">Cerrar sesión</button></div>`;
    }
    const prueba = E.plux && E.plux.ambiente === 'sandbox' ? '<p class="small" style="color:var(--amber)">Modo de pruebas: los pagos no son reales.</p>' : '';
    const productos = (E.tienda.productos || []).map((p) => {
      const dest = p.id === 'inicio';
      const hecho = dest && E.inicio_comprado;
      return `<div class="card prod ${dest ? 'dest' : ''} ${p.id === 'vip30' ? 'rf r-vip' : ''}">${dest ? '<span class="ribbon">Oferta única</span>' : p.id === 'vip30' ? '<span class="ribbon">VIP</span>' : ''}
        <div class="prodrow">${itemArt(p.id, 64)}
          <div class="grow"><h3>${esc(p.nombre)}</h3><div class="small muted">${esc(p.detalle || '')}</div></div></div>
        <div class="row between" style="margin-top:10px"><span class="price">${precio(p.precio)}</span>
          <button class="btn sm main" data-act="comprar" data-k="${esc(p.id)}" ${hecho || !(E.plux && E.plux.disponible) ? 'disabled' : ''}>${hecho ? 'Ya lo tienes' : 'Comprar'}</button></div></div>`;
    }).join('');
    const premium = (E.tienda.premium || []).map((p) => {
      const alcanza = log && E.creditos >= p.creditos;
      const esEquipo = !!G.CATALOG[p.id];
      const rk = p.vip ? 'vip' : esEquipo ? rar(p.id).key : 'comun';
      const rl = p.vip ? { label: 'VIP', color: '#ffd34d' } : rar(p.id);
      return `<div class="card gear rf r-${rk}">
        <div class="row between">${esEquipo || p.vip ? `<span class="rtag" style="--rc:${rl.color}">${esc(rl.label)}</span>` : '<span class="rtag">Ayuda</span>'}</div>
        <div class="art">${itemArt(p.id, 110)}</div>
        <div class="nm">${esc(p.nombre)}</div><div class="ds">${esc(p.detalle || '')}</div><div class="grow2"></div>
        <div class="cr" style="margin-top:8px">${I('gem', 'sm')} ${Number(p.creditos).toLocaleString('es-EC')}</div>
        <button class="btn sm ${alcanza ? 'green' : ''}" data-act="canjear" data-k="${esc(p.id)}" ${log ? '' : 'disabled'}>${alcanza ? 'Canjear' : log ? 'Te faltan créditos' : 'Entra para canjear'}</button></div>`;
    }).join('');
    el.innerHTML = `${log && window.Mercado ? selectorTienda() : ''}
      <div class="sectitle">Tu cuenta</div>${cuenta}
      <div class="sectitle">Comprar</div>
      <p class="small muted">Precios en dólares con IVA incluido. Pago con tarjeta por Pago Plux.</p>${prueba}
      ${productos}
      ${E.plux && E.plux.disponible ? '' : '<div class="card small muted">El pago con tarjeta todavía no está activo. Vuelve pronto.</div>'}
      <div class="sectitle">Exclusivos con créditos</div>${premium ? `<div class="ggrid">${premium}</div>` : emptyState('gem', 'Pronto habrá exclusivos', 'Vuelve más tarde para ver equipos especiales.')}
      <p class="small muted">Todo se puede conseguir jugando gratis; los créditos solo te ayudan a avanzar más rápido. Si eres menor de edad, pide permiso a tus padres antes de comprar.</p>
      <div class="legal"><a href="/terminos.html">Términos y condiciones</a><a href="/privacidad.html">Privacidad</a></div>`;
  }

  function selectorTienda() {
    return `<div class="chat-tabs" style="margin:6px 0 4px;display:flex;gap:6px">
      <button class="btn sm ${vistaTienda === 'tienda' ? 'main' : ''}" data-act="vista-tienda" data-k="tienda" style="flex:1">${I('gem', 'sm')} Tienda</button>
      <button class="btn sm ${vistaTienda === 'mercado' ? 'main' : ''}" data-act="vista-tienda" data-k="mercado" style="flex:1">${I('cart', 'sm')} Mercado</button></div>`;
  }
  function ctxMercado() {
    return { Api, G, Pm, A, estado: () => S, toast, ask, openModal, closeModal, snd,
      sincronizar: () => { aplicarEntregas(); save(); } };
  }
  function ctxChat() {
    return { Api, A, toast, ask, snd,
      pagarAsociacion: (m) => { if (S.money < m) { toast(`Necesitas ${M(m)} del juego para crear una asociación (o tener VIP).`); return false; } S.money -= m; save(); render(); return true; } };
  }

  function abrirCuenta(modo, nota) {
    const reg = modo === 'registro';
    openModal(`<div class="row between"><h2>${reg ? 'Crear cuenta' : 'Entrar'}</h2><button class="btn sm" data-act="close" aria-label="Cerrar">${I('close', 'sm')}</button></div>
      ${nota ? `<p class="small" style="color:var(--amber)">${esc(nota)}</p>` : ''}
      <form id="formCuenta" data-modo="${modo}">
        ${reg ? '<label class="field">Tu nombre<input id="cu-nombre" autocomplete="name" maxlength="60" required></label>' : ''}
        <label class="field">Correo<input id="cu-email" type="email" autocomplete="email" maxlength="120" required></label>
        <label class="field">Contraseña${reg ? ' (mínimo 8 caracteres)' : ''}<input id="cu-clave" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="${reg ? 8 : 1}" required></label>
        <p class="small neg" id="cu-error" aria-live="polite"></p>
        <button class="btn main" type="submit" id="cu-btn">${reg ? 'Crear mi cuenta' : 'Entrar'}</button>
      </form>
      <button class="btn" data-act="cuenta" data-modo="${reg ? 'entrar' : 'registro'}">${reg ? 'Ya tengo cuenta' : 'No tengo cuenta: crear una'}</button>
      <p class="small muted">¿Olvidaste tu contraseña? Escríbenos por WhatsApp y te ayudamos.</p>`);
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
      toast(reg ? '¡Cuenta creada!' : `¡Hola, ${Api.estado.jugador.nombre}!`);
      await alConectar(true);
      if (window.Chat) window.Chat.iniciar(ctxChat());
    } catch (e) {
      $('cu-error').textContent = e.message; btn.disabled = false; snd.play('error');
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
      inv.agregados.forEach((t) => hechos.push(`Llegó a tu bodega: ${t}.`));
      if (inv.quitados.length) save();
    }
    if (hechos.length) { save(); toast(hechos[0] + (hechos.length > 1 ? ` (+${hechos.length - 1} más)` : '')); snd.play('chapter'); }
  }

  const resumen = (x) => `Día ${x.day} · ${G.CHAPTERS[x.chapter] ? esc(G.CHAPTERS[x.chapter].title.split('·')[0].trim()) : 'Historia completa'} · ${M(x.money)} · ${x.stats.events} eventos`;
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
      openModal(`<h2>¿Qué partida quieres usar?</h2>
        <p class="small muted">Tienes una partida guardada en tu cuenta y otra en este celular.</p>
        <button class="btn" data-act="partida" data-k="nube">${I('cloud')}En la nube<br><span class="small muted">${resumen(nube)}</span></button>
        <button class="btn" data-act="partida" data-k="local">${I('social')}En este celular<br><span class="small muted">${resumen(S)}</span></button>
        <p class="small muted">La que no elijas se reemplaza.</p>`);
    });
  }
  let eleccion = null;

  async function comprar(id) {
    if (!Api.logueado()) { abrirCuenta('registro', 'Crea tu cuenta para comprar: así tus compras quedan guardadas.'); return; }
    try {
      save(); await subirNube();
      const r = await Api.orden(id);
      snd.play('tap');
      location.href = r.url;
    } catch (e) { toast(e.message); snd.play('error'); }
  }

  function canjear(id) {
    const p = Api.estado.tienda.premium.find((x) => x.id === id);
    if (!p) return;
    if (Api.estado.creditos < p.creditos) {
      toast(`Te faltan ${(p.creditos - Api.estado.creditos).toLocaleString('es-EC')} créditos.`); snd.play('error'); return;
    }
    ask(`¿Canjear <b>${esc(p.nombre)}</b> por ${Number(p.creditos).toLocaleString('es-EC')} créditos?`, 'Sí, canjear', async () => {
      try {
        await Api.gastar(id);
        snd.play('buy');
        await Api.refrescar();
        aplicarEntregas();
        render();
      } catch (e) { toast(e.message); snd.play('error'); }
    });
  }

  async function bonoVip() {
    try {
      const r = await Api.bonoVip();
      Api.estado.creditos = r.creditos; Api.estado.vip_bono_hoy = true;
      if (r.entrega) Api.estado.entregas.push(r.entrega);
      aplicarEntregas(); render();
    } catch (e) { toast(e.message); snd.play('error'); }
  }

  function renderRegistro() {
    $('tab-registro').innerHTML = `<div class="sectitle">Registro de la productora</div>
      <div class="card log">${S.log.map((l) => `<p><span>Día ${l.day}</span>${esc(l.text)}</p>`).join('')}</div>`;
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
    const t = G.EVENT_TYPES[c.type];
    const staff = S.staff.filter((p) => prep.staff.has(p.id));
    const equip = S.equip.filter((e) => prep.equip.has(e.id));
    const q = G.computeQuality(S, c, staff, equip);
    const wages = staff.reduce((a, p) => a + wageFor(p, c.diff), 0);
    const est = q.q >= 85 ? 5 : q.q >= 70 ? 4 : q.q >= 55 ? 3 : q.q >= 40 ? 2 : 1;
    // Consejo: solo lo que se arregla con equipo o personal
    const NO_FIX = /^(dificultad|lo que esperan|base\b|experiencia)|cansad|cansancio|desmotivad|[aá]nimo|apoyo/i;
    const STAFF_FIX = /sin director|sin sonidista|sin t[eé]cnico|sin operador|camar[oó]graf|director|sonidista|t[eé]cnico/i;
    const worst = q.parts.filter((p) => p[1] < 0 && !NO_FIX.test(p[0])).sort((a, b) => a[1] - b[1])[0];
    const tip = worst ? `<p class="small" style="color:var(--amber)">${I('tip', 'sm')} Lo que más te resta: ${esc(worst[0])} (${worst[1]}). ${STAFF_FIX.test(worst[0]) && !/^Sin (switcher|consola|equipo)/i.test(worst[0]) ? 'Contrata en Personal.' : 'Cómpralo en Bodega.'}</p>` : '';
    const roleName = (r) => (G.ROLES[r] ? G.ROLES[r].name : r);
    const staffHtml = S.staff.map((p) => { const w = wageFor(p, c.diff); return `<label class="pick ${prep.staff.has(p.id) ? 'sel' : ''}">
        <input type="checkbox" id="st-${p.id}" data-act="tog-staff" data-id="${p.id}" ${prep.staff.has(p.id) ? 'checked' : ''}>
        ${avatarOf(p, 44)}
        <div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="small muted">${esc(roleName(p.role))} · <span class="skill">${starsTxt(p.skill)}</span></div></div>
        <span class="num small" style="text-align:right">${M(w)}${w > p.wage ? `<br><span class="muted" style="font-size:10.5px">+${Math.round((w / p.wage - 1) * 100)}%</span>` : ''}</span></label>`; }).join('');
    const equipHtml = S.equip.map((e) => {
      const it = G.CATALOG[e.type] || { name: e.type };
      const off = vipBloqueado(e);
      return `<label class="pick ${prep.equip.has(e.id) ? 'sel' : ''} ${off ? 'vipoff' : ''}">
        <input type="checkbox" id="eq-${e.id}" data-act="tog-equip" data-id="${e.id}" ${prep.equip.has(e.id) ? 'checked' : ''}>
        ${itemArt(e.type, 44, 'mini')}
        <div class="grow" style="min-width:0"><b>${esc(e.nick || it.name)}</b> ${rtag(e.type)}${off ? '<div class="small" style="color:var(--amber)">Necesita VIP activo</div>' : condBar(e.condition)}</div>
        <span class="num small ${e.condition < 40 ? 'neg' : 'muted'}">${e.condition}%</span></label>`;
    }).join('');
    const pos = $('modal').scrollTop;
    openModal(`
      <div class="row between"><div class="row">${tile(c.type, TILE_COLOR[c.type])}<h2>${esc(t.name)}</h2></div><button class="btn sm" data-act="close" aria-label="Cerrar">${I('close', 'sm')}</button></div>
      <div class="small muted" style="margin-top:6px">${esc(c.client)} · paga <span class="pay" style="font-size:15px">${M(c.pay)}</span> (con 3 estrellas)</div>
      <div style="margin:6px 0 4px">${reqTags(c)}</div>
      <button class="btn" data-act="auto">${I('sparkle')}Elegir lo mejor automáticamente</button>
      <div class="sectitle">¿A quién llevas?</div>${staffHtml}
      <div class="sectitle">¿Qué equipos llevas?</div>${equipHtml}
      <p class="small muted">Repuestos que llevas: ${S.stock.cable} cables · ${S.stock.battery} baterías</p>
      <details><summary>Ver cómo se calcula la calidad</summary>
        <table>${q.parts.map((p) => `<tr><td>${esc(p[0])}</td><td class="${p[1] < 0 ? 'down' : ''}">${p[1] > 0 ? '+' : ''}${p[1]}</td></tr>`).join('')}</table></details>
      <div class="preview">
        <div class="row between"><span>Calidad esperada <b class="num">${q.q}</b>/100</span><span>${starsTxt(est)}</span></div>
        ${c.rival && typeof c.rivalQuality === 'number' ? duelBars(q.q, c.rivalQuality) : `<div class="bar ${q.q < 40 ? 'red' : q.q < 55 ? 'amber' : ''}"><i style="width:${q.q}%"></i></div>`}
        ${tip}
        <div class="small muted" style="margin-top:6px">Sueldos a pagar: <b class="num">${M(wages)}</b> · Los imprevistos pueden subir o bajar la calidad.</div>
        <button class="btn main" data-act="go-live">${I('rec', 'sm')} ¡Salir al aire!</button>
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
    const t = G.EVENT_TYPES[c.type];
    const key = incKey();
    snd.play('incident');
    setTimeout(() => snd.play(key), 250);
    openModal(`
      ${liveScene(c.type, key)}
      <div class="row between" style="margin-top:10px"><span class="live"><i></i>EN VIVO</span><span class="small muted">Imprevisto ${inc.n} de ${inc.total}</span></div>
      <div class="small muted" style="margin-top:8px">${esc(t.name)} · ${esc(c.client)}</div>
      <div class="incident">${esc(noEmoji(inc.text))}</div>
      ${inc.choices.map((ch) => `<button class="btn choice" data-act="choose" data-i="${ch.i}" ${ch.ok ? '' : 'disabled'}>
        ${esc(ch.label)}${ch.ok ? '' : `<small>No disponible: ${esc(ch.why)}</small>`}</button>`).join('')}`);
  }

  function choose(i) {
    const key = incKey();
    const r = G.resolveIncident(S, i);
    if (!r.ok) { toast(r.msg); snd.play('error'); return; }
    save();
    snd.play(r.q >= 0 ? 'good' : 'bad');
    const cls = r.q > 0 ? 'up' : r.q < 0 ? 'down' : '';
    const more = G.currentIncident(S);
    const c = S.currentEvent.contract;
    openModal(`
      ${liveScene(c.type, r.q > 4 ? 'epico' : key === 'luz' && r.q < -10 ? 'luz' : null)}
      <div style="margin-top:10px"><span class="live"><i></i>EN VIVO</span></div>
      <div class="incident">${esc(r.msg)}</div>
      <p>Calidad: <span class="delta ${cls}">${r.q > 0 ? '+' : ''}${r.q}</span></p>
      <button class="btn main" data-act="${more ? 'next-inc' : 'finish'}">${more ? 'Continuar' : 'Terminar transmisión'}</button>`);
  }

  function finish() {
    const f = G.finishEvent(S);
    save();
    snd.amb(null);
    if (!f.ok) { toast(f.msg); closeModal(); render(); return; }
    const r = f.result;
    afterResult = r.chapterDone || null;
    snd.play('stars', r.stars);
    const duel = r.duel && typeof r.rivalQuality === 'number'
      ? `<div class="duel ${r.duel === 'won' ? 'won' : ''}" style="margin-top:10px">
          <div class="row between"><span class="res ${r.duel === 'won' ? 'up' : 'down'}">${I('rival', 'sm')} ${r.duel === 'won' ? '¡Duelo ganado!' : 'Duelo perdido'}</span><span class="small muted">${r.duel === 'won' ? 'Fama extra' : 'Perdiste fama extra'}</span></div>
          <div class="lbl"><span>Tu calidad</span><b class="num">${r.quality}</b></div><div class="bar you"><i style="width:${r.quality}%"></i></div>
          <div class="lbl"><span>MegaVisión</span><b class="num">${r.rivalQuality}</b></div><div class="bar mega"><i style="width:${r.rivalQuality}%"></i></div></div>`
      : r.duel === 'won' ? `<p class="small up">${I('rival', 'sm')} ¡Le ganaste el duelo a MegaVisión! Fama extra.</p>` : r.duel === 'lost' ? `<p class="small down">${I('rival', 'sm')} MegaVisión te ganó el duelo. Perdiste fama extra.</p>` : '';
    const later = r.payLater > 0 ? `<div class="paylater">${I('clock', 'sm')} Te pagan ${M(r.payNow)} ahora y ${M(r.payLater)} en ${r.payLaterDays} días.</div>` : '';
    openModal(`
      <div class="result-head"><div class="story-tag">${r.stars >= 4 ? '¡Transmisión impecable!' : r.stars === 3 ? 'Buen trabajo' : 'Transmisión terminada'}</div>
      <h2>${esc(noEmoji(r.title))}</h2></div>
      ${starsBig(r.stars)}
      <div class="bigmoney ${r.net >= 0 ? 'up' : 'down'} num" id="resNet">${r.net >= 0 ? '+' : '-'}${M(0)}</div>
      <div class="small muted" style="text-align:center">ganancia del evento</div>
      <div class="row between" style="margin-top:12px"><span>Calidad final</span><b class="num">${r.quality}/100</b></div>
      <div class="bar ${r.quality < 40 ? 'red' : r.quality < 55 ? 'amber' : ''}"><i style="width:${r.quality}%"></i></div>
      ${duel}
      <table style="margin-top:12px">
        <tr><td>Pago del cliente</td><td class="up">+${M(r.pay)}</td></tr>
        <tr><td>Sueldos del personal</td><td class="down">-${M(r.wages)}</td></tr>
        <tr><td><b>Ganancia</b></td><td class="${r.net >= 0 ? 'up' : 'down'}"><b>${M(r.net)}</b></td></tr>
        <tr><td>Fama</td><td class="${r.repDelta >= 0 ? 'up' : 'down'}">${r.repDelta >= 0 ? '+' : ''}${r.repDelta}</td></tr>
      </table>
      ${later}
      ${r.ups.length ? `<p class="small">${I('trend', 'sm')} ${r.ups.map(esc).join(' · ')}</p>` : ''}
      <details><summary>Ver detalle</summary>
        <p class="small"><b>Calidad inicial: ${r.base}</b></p>
        ${r.incidents.map((i) => `<p class="small">${esc(noEmoji(i.text))}<br><span class="muted">→ ${esc(i.result.msg)} (${i.result.q > 0 ? '+' : ''}${i.result.q})</span></p>`).join('')}
      </details>
      <p class="small muted">El equipo se desgastó un poco y pasó un día.</p>
      <button class="btn main" data-act="after-result">Continuar</button>`);
    countUp($('resNet'), r.net, 1000);
    if (r.stars >= 4) confetti(r.stars === 5 ? 70 : 45);
    else if (r.stars === 3) confetti(16);
  }

  function showChapterDone(d) {
    const idx = Math.max(0, G.CHAPTERS.findIndex((c) => c.title === d.title));
    snd.play('chapter');
    openModal(`<div class="story-tag">Capítulo completado</div><h2>${esc(d.title)}</h2>
      ${speaker(charOf(idx), esc(d.text))}
      <p>Premio: <span class="pay">${M(d.reward)}</span></p>
      <button class="btn main" data-act="close-story">¡Vamos!</button>`);
  }

  function showChapterIntro() {
    if (S.storyDone || S.chapterSeen === S.chapter) return false;
    const ch = G.CHAPTERS[S.chapter];
    S.chapterSeen = S.chapter;
    save();
    openModal(`<div class="story-tag">Nuevo capítulo</div><h2>${esc(ch.title)}</h2>
      ${speaker(charOf(S.chapter), esc(ch.intro))}
      <p><b>Objetivo:</b> ${esc(ch.goal)}</p>
      <button class="btn main" data-act="close">Entendido</button>`);
    return true;
  }

  function showGameOver() {
    openModal(`<h2>Quebraste</h2>
      ${speaker('ramiro', `Las deudas pasaron de $300. Llegaste al día ${S.day} con ${S.stats.events} eventos cubiertos. No te rindas: no compres equipo caro muy pronto y lleva repuestos.`)}
      <button class="btn main" data-act="restart">Empezar de nuevo</button>`);
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
      case 'salir': Api.salir().then(() => { if (Pm) Pm.setVip(false); toast('Cerraste sesión. Tu partida sigue en este celular.'); if (window.Chat) window.Chat.refrescar(); render(); }).catch((err) => toast(err.message)); break;
      case 'comprar': comprar(el.dataset.k); break;
      case 'canjear': canjear(el.dataset.k); break;
      case 'vip-bono': bonoVip(); break;
      case 'partida': if (eleccion) { const f = eleccion; eleccion = null; f(el.dataset.k); } break;
      case 'install':
        try { window.PWA.install().then((r) => { if (r === 'accepted') toast('¡Listo! El juego quedó instalado.'); render(); }); } catch (err) { toast('Este navegador no permite instalar.'); }
        break;
      case 'tab': tab = el.dataset.tab; snd.play('tap'); render(); window.scrollTo(0, 0); break;
      case 'close': closeModal(); render(); break;
      case 'confirm-yes': { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); break; }
      case 'next-day': G.nextDay(S); save(); snd.play('day'); render(); toast(`Día ${S.day}`); showChapterIntro(); break;
      case 'mkt': act(G.marketing(S, el.dataset.k), 'logo'); break;
      case 'hire': act(G.hire(S, id), 'hire'); showChapterIntro(); break;
      case 'fire': { const p = S.staff.find((x) => x.id === id); if (p) ask(`¿Despedir a ${esc(p.name)}?`, 'Sí, despedir', () => act(G.fire(S, id))); break; }
      case 'search-staff': act(G.searchStaff(S)); break;
      case 'buy': act(G.buy(S, el.dataset.k), 'buy'); showChapterIntro(); break;
      case 'buy-cons': act(G.buyConsumable(S, el.dataset.k, 1), 'buy'); break;
      case 'repair': act(G.repair(S, id), 'buy'); break;
      case 'sell': { const it = S.equip.find((x) => x.id === id); if (it) ask(`¿Vender ${esc(G.CATALOG[it.type].name)} por ${M(G.sellPrice(it))}?`, 'Sí, vender', () => act(G.sell(S, id), 'buy')); break; }
      case 'prep': snd.play('tap'); openPrep(id); break;
      case 'auto': { const s = G.suggestLoadout(S, prep.id); prep.staff = new Set(s.staffIds); prep.equip = new Set(s.equipIds); snd.play('tap'); renderPrep(); break; }
      case 'go-live': {
        const r = G.startEvent(S, prep.id, [...prep.staff], [...prep.equip]);
        if (!r.ok) { toast(r.msg); snd.play('error'); break; }
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
      case 'new-game': ask('Se borrará tu partida actual.', 'Sí, empezar de nuevo', () => { S = G.newGame(); if (Pm && Api.estado) Pm.prepararPartidaNueva(S, Api.estado.entregas); save(); tab = 'inicio'; render(); showChapterIntro(); }); break;
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
    if (volvioDePago) { tab = 'tienda'; render(); toast('¡Compra aprobada! Ya está en tu cuenta.'); snd.play('chapter'); }
  })();
  window.__game = { get state() { return S; } }; // para las pruebas automáticas
})();
