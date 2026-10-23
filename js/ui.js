/* =========================================================
   EN VIVO Tycoon — Pantallas (interfaz)
   Usa las reglas de js/logic.js (objeto global "Game").
   ========================================================= */
(function () {
  'use strict';
  const G = window.Game;
  const SAVE_KEY = 'envivo_tycoon_save_v1';
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = G.money;

  let S = null;            // estado del juego
  let tab = 'inicio';
  let prep = null;         // selección al preparar un evento
  let afterResult = null;  // capítulo completado pendiente de mostrar

  /* ---------- Guardado ---------- */
  function save() { try { localStorage.setItem(SAVE_KEY, G.serialize(S)); } catch (e) { /* sin espacio o modo privado */ } }
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
  function act(res) { if (res && res.msg) toast(res.msg); save(); render(); return res; }

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
  function condBar(v) {
    const cls = v < 40 ? 'red' : v < 70 ? 'amber' : '';
    return `<div class="bar ${cls}"><i style="width:${v}%"></i></div>`;
  }
  function reqTags(c) {
    const t = [`<span class="tag">📹 ${c.cams} cámara${c.cams > 1 ? 's' : ''}</span>`];
    if (c.cams >= 2) t.push('<span class="tag">🎛️ switcher + director</span>');
    if (c.audio) t.push('<span class="tag">🎧 audio</span>');
    if (c.stream) t.push('<span class="tag red">📡 en vivo por internet</span>');
    if (c.outdoor) t.push('<span class="tag amber">🌦️ aire libre</span>');
    return t.join('');
  }

  /* ---------- Render general ---------- */
  function render() {
    $('hMoney').textContent = M(S.money);
    $('hMoney').classList.toggle('neg', S.money < 0);
    $('hRep').textContent = Math.floor(S.rep);
    $('hDay').textContent = S.day;
    $('badgeC').textContent = S.contracts.length || '';
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('main section').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + tab));
    ({ inicio: renderInicio, clientes: renderClientes, personal: renderPersonal, bodega: renderBodega, registro: renderRegistro })[tab]();
    if (S.gameOver && !$('overlay').classList.contains('on')) showGameOver();
  }

  function renderInicio() {
    const ch = G.CHAPTERS[S.chapter];
    const rent = 20 + 4 * (S.staff.length - 1);
    let story;
    if (S.storyDone) {
      story = `<div class="card"><div class="story-tag">Modo historia</div><h2>🏆 ¡Historia completada!</h2>
        <p class="muted">Sigue creciendo en modo libre: más eventos, mejor equipo y más fama.</p></div>`;
    } else {
      story = `<div class="card"><div class="story-tag">Historia</div><h2>${esc(ch.title)}</h2>
        <p class="small muted">${esc(ch.intro)}</p>
        <p><b>🎯 Objetivo:</b> ${esc(ch.goal)}</p>
        <p class="small">Progreso: <span class="num">${esc(ch.progress(S))}</span></p>
        <p class="small muted">Premio: <span class="pay" style="font-size:14px">${M(ch.reward)}</span></p></div>`;
    }
    $('tab-inicio').innerHTML = story + `
      <div class="card">
        <div class="row between"><h3>Tu productora</h3><span class="muted small">Día ${S.day}</span></div>
        <div class="row wrap small" style="margin-top:6px">
          <span class="tag">👥 ${S.staff.length} personas</span>
          <span class="tag">📦 ${S.equip.length} equipos</span>
          <span class="tag">🎬 ${S.stats.events} eventos</span>
          <span class="tag">⭐ ${S.stats.fiveStars} de 5 estrellas</span>
        </div>
        <button class="btn main" data-act="tab" data-tab="clientes">📋 Ver ofertas de clientes (${S.contracts.length})</button>
        <button class="btn" data-act="next-day">😴 Descansar y pasar al día siguiente <span class="muted small">(gastos ${M(rent)})</span></button>
      </div>
      <div class="sectitle">Lo último que pasó</div>
      <div class="card log">${S.log.slice(0, 6).map((l) => `<p><span>Día ${l.day}</span>${esc(l.text)}</p>`).join('')}</div>
      <div class="sectitle">Ayuda rápida</div>
      <div class="card small muted">
        1) Toma una oferta en <b>Clientes</b>. 2) Elige personal y equipos. 3) Resuelve los imprevistos en vivo.
        4) Cobra, gana fama y compra mejor equipo en <b>Bodega</b>. Cada evento ocupa un día.
        Si tus deudas pasan de $300, quiebras.
      </div>
      <button class="btn" data-act="new-game" style="margin-bottom:20px">🔄 Empezar partida nueva</button>`;
  }

  function renderClientes() {
    const cards = S.contracts.map((c) => {
      const t = G.EVENT_TYPES[c.type];
      return `<div class="card">
        <div class="row"><div class="icon">${t.icon}</div>
          <div class="grow"><h3>${esc(t.name)}</h3><div class="small muted">${esc(c.client)}</div></div>
          <div class="pay">${M(c.pay)}</div></div>
        <div style="margin-top:6px">${reqTags(c)}</div>
        <div class="row between small" style="margin-top:8px">
          <span>Dificultad ${starsTxt(c.diff)}</span>
          <span class="${c.daysLeft <= 1 ? 'neg' : 'muted'}">⏳ vence en ${c.daysLeft} día${c.daysLeft > 1 ? 's' : ''}</span>
        </div>
        <button class="btn main" data-act="prep" data-id="${c.id}">Preparar evento</button>
      </div>`;
    }).join('');
    $('tab-clientes').innerHTML = `
      <div class="sectitle">Buscar clientes</div>
      <div class="card">
        <button class="btn" data-act="mkt" data-k="redes" ${S.daily.redes ? 'disabled' : ''}>📱 Publicar en redes <span class="muted small">($40 · 1 oferta · 1 vez al día)</span></button>
        <button class="btn" data-act="mkt" data-k="anuncio" ${S.daily.anuncio ? 'disabled' : ''}>📰 Pagar anuncio <span class="muted small">($200 · 2 ofertas mejor pagadas)</span></button>
        <button class="btn" data-act="mkt" data-k="visitar">🚶 Visitar clientes en persona <span class="muted small">(gratis · usa 1 día · 2 ofertas)</span></button>
      </div>
      <div class="sectitle">Ofertas disponibles (${S.contracts.length})</div>
      ${cards || '<div class="card muted">No tienes ofertas. Busca clientes con los botones de arriba o pasa al día siguiente.</div>'}`;
  }

  function renderPersonal() {
    const staff = S.staff.map((p) => `<div class="card">
      <div class="row"><div class="icon">${G.ROLES[p.role].icon}</div>
        <div class="grow"><h3>${esc(p.name)}</h3><div class="small muted">${G.ROLES[p.role].name} · ${p.events} eventos</div></div>
        <div class="small" style="text-align:right">Habilidad<br>${starsTxt(p.skill)}</div></div>
      ${p.owner ? '<p class="small muted">Eres tú. Cubres una cámara gratis.</p>' : `
      <div class="small muted" style="margin-top:8px">Moral ${p.morale}%</div>${condBar(p.morale)}
      <div class="row between" style="margin-top:10px"><span class="small">Cobra <b class="num">${M(p.wage)}</b> por evento</span>
        <button class="btn sm" data-act="fire" data-id="${p.id}">Despedir</button></div>`}
    </div>`).join('');
    const cands = S.candidates.map((c) => `<div class="card">
      <div class="row"><div class="icon">${G.ROLES[c.role].icon}</div>
        <div class="grow"><h3>${esc(c.name)}</h3><div class="small muted">${G.ROLES[c.role].name}</div></div>
        <div class="small" style="text-align:right">Habilidad<br>${starsTxt(c.skill)}</div></div>
      <div class="row between" style="margin-top:10px"><span class="small">Cobra <b class="num">${M(c.wage)}</b>/evento</span>
        <button class="btn sm main" data-act="hire" data-id="${c.id}">Contratar ${M(c.wage * 2)}</button></div>
    </div>`).join('');
    $('tab-personal').innerHTML = `
      <div class="sectitle">Tu equipo (${S.staff.length}/12)</div>${staff}
      <div class="sectitle">Candidatos</div>
      <p class="small muted">El pago inicial es 2 veces su sueldo. Solo pagas sueldo cuando le llevas a un evento.</p>
      ${cands || '<div class="card muted">No hay candidatos. Publica una vacante.</div>'}
      <button class="btn" data-act="search-staff" style="margin-bottom:20px">📢 Publicar vacante ($30)</button>`;
  }

  function renderBodega() {
    const cons = Object.keys(G.CONSUMABLES).map((k) => {
      const it = G.CONSUMABLES[k];
      return `<div class="pick"><div class="icon">${it.icon}</div>
        <div class="grow"><b>${it.name}</b> <span class="num">× ${S.stock[k] || 0}</span><div class="small muted">${it.desc}</div></div>
        <button class="btn sm" data-act="buy-cons" data-k="${k}">+1 ${M(it.price)}</button></div>`;
    }).join('');
    const mine = S.equip.map((e) => {
      const it = G.CATALOG[e.type];
      const rc = G.repairCost(e);
      return `<div class="card"><div class="row"><div class="icon">${it.icon}</div>
        <div class="grow"><b>${esc(e.nick || it.name)}</b><div class="small muted">Estado ${e.condition}%</div>${condBar(e.condition)}</div></div>
        <div class="row" style="margin-top:10px;justify-content:flex-end;gap:8px">
          <button class="btn sm" data-act="repair" data-id="${e.id}" ${rc <= 0 ? 'disabled' : ''}>🔧 Reparar ${rc > 0 ? M(rc) : ''}</button>
          <button class="btn sm" data-act="sell" data-id="${e.id}">Vender ${M(G.sellPrice(e))}</button></div></div>`;
    }).join('');
    const shop = Object.keys(G.CATALOG).map((k) => {
      const it = G.CATALOG[k];
      const locked = it.minRep > S.rep;
      const owned = S.equip.filter((e) => e.type === k).length;
      return `<div class="card"><div class="row"><div class="icon">${it.icon}</div>
        <div class="grow"><b>${it.name}</b>${owned ? ` <span class="tag">tienes ${owned}</span>` : ''}<div class="small muted">${it.desc}</div></div></div>
        <button class="btn ${locked ? '' : 'green'}" data-act="buy" data-k="${k}" ${locked || S.money < it.price ? 'disabled' : ''}>
          ${locked ? `🔒 Necesitas ${it.minRep} de fama` : `Comprar ${M(it.price)}`}</button></div>`;
    }).join('');
    $('tab-bodega').innerHTML = `
      <div class="sectitle">Repuestos (se usan solos en los imprevistos)</div><div class="card">${cons}</div>
      <div class="sectitle">Tus equipos (${S.equip.length})</div>${mine}
      <p class="small muted">El equipo se gasta en cada evento. Por debajo de 40% puede fallar en vivo.</p>
      <div class="sectitle">Tienda</div>${shop}<div style="height:20px"></div>`;
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
    const wages = staff.reduce((a, p) => a + p.wage, 0);
    const est = q.q >= 85 ? 5 : q.q >= 70 ? 4 : q.q >= 55 ? 3 : q.q >= 40 ? 2 : 1;
    const worst = q.parts.filter((p) => p[1] < 0 && !/^Dificultad/.test(p[0])).sort((a, b) => a[1] - b[1])[0];
    const tip = worst ? `<p class="small" style="color:var(--amber)">💡 Lo que más te resta: ${esc(worst[0])} (${worst[1]}). Consíguelo en Bodega o Personal.</p>` : '';
    const staffHtml = S.staff.map((p) => `<label class="pick ${prep.staff.has(p.id) ? 'sel' : ''}">
        <input type="checkbox" data-act="tog-staff" data-id="${p.id}" ${prep.staff.has(p.id) ? 'checked' : ''}>
        <div class="grow"><b>${G.ROLES[p.role].icon} ${esc(p.name)}</b><div class="small muted">${G.ROLES[p.role].name} · ${starsTxt(p.skill)}</div></div>
        <span class="num small">${M(p.wage)}</span></label>`).join('');
    const equipHtml = S.equip.map((e) => {
      const it = G.CATALOG[e.type];
      return `<label class="pick ${prep.equip.has(e.id) ? 'sel' : ''}">
        <input type="checkbox" data-act="tog-equip" data-id="${e.id}" ${prep.equip.has(e.id) ? 'checked' : ''}>
        <div class="grow"><b>${it.icon} ${esc(e.nick || it.name)}</b>${condBar(e.condition)}</div>
        <span class="num small ${e.condition < 40 ? 'neg' : 'muted'}">${e.condition}%</span></label>`;
    }).join('');
    const pos = $('modal').scrollTop;
    openModal(`
      <div class="row between"><h2>${t.icon} ${esc(t.name)}</h2><button class="btn sm" data-act="close">✕</button></div>
      <div class="small muted">${esc(c.client)} · paga <span class="pay" style="font-size:15px">${M(c.pay)}</span> (con 3⭐)</div>
      <div style="margin:6px 0 4px">${reqTags(c)}</div>
      <button class="btn" data-act="auto">✨ Elegir lo mejor automáticamente</button>
      <div class="sectitle">¿A quién llevas?</div>${staffHtml}
      <div class="sectitle">¿Qué equipos llevas?</div>${equipHtml}
      <p class="small muted">Repuestos que llevas: 🔌 ${S.stock.cable} cables · 🪫 ${S.stock.battery} baterías</p>
      <details><summary>Ver cómo se calcula la calidad</summary>
        <table>${q.parts.map((p) => `<tr><td>${esc(p[0])}</td><td class="${p[1] < 0 ? 'down' : ''}">${p[1] > 0 ? '+' : ''}${p[1]}</td></tr>`).join('')}</table></details>
      <div class="preview">
        <div class="row between"><span>Calidad esperada <b class="num">${q.q}</b>/100</span><span>${starsTxt(est)}</span></div>
        <div class="bar ${q.q < 40 ? 'red' : q.q < 55 ? 'amber' : ''}"><i style="width:${q.q}%"></i></div>
        ${tip}
        <div class="small muted" style="margin-top:6px">Sueldos a pagar: <b class="num">${M(wages)}</b> · Los imprevistos pueden subir o bajar la calidad.</div>
        <button class="btn main" data-act="go-live">🔴 ¡Salir al aire!</button>
      </div>`);
    $('modal').scrollTop = pos;
  }

  /* ---------- Evento en vivo ---------- */
  function showIncident() {
    const inc = G.currentIncident(S);
    if (!inc) { finish(); return; }
    const c = S.currentEvent.contract;
    const t = G.EVENT_TYPES[c.type];
    openModal(`
      <div class="row between"><span class="live"><i></i>EN VIVO</span><span class="small muted">Imprevisto ${inc.n} de ${inc.total}</span></div>
      <div class="small muted" style="margin-top:8px">${t.icon} ${esc(t.name)} · ${esc(c.client)}</div>
      <div class="incident">${esc(inc.text)}</div>
      ${inc.choices.map((ch) => `<button class="btn choice" data-act="choose" data-i="${ch.i}" ${ch.ok ? '' : 'disabled'}>
        ${esc(ch.label)}${ch.ok ? '' : `<small>🚫 ${esc(ch.why)}</small>`}</button>`).join('')}`);
  }

  function choose(i) {
    const r = G.resolveIncident(S, i);
    if (!r.ok) { toast(r.msg); return; }
    save();
    const cls = r.q > 0 ? 'up' : r.q < 0 ? 'down' : '';
    const more = G.currentIncident(S);
    openModal(`
      <span class="live"><i></i>EN VIVO</span>
      <div class="incident">${esc(r.msg)}</div>
      <p>Calidad: <span class="delta ${cls}">${r.q > 0 ? '+' : ''}${r.q}</span></p>
      <button class="btn main" data-act="${more ? 'next-inc' : 'finish'}">${more ? 'Continuar ▶' : 'Terminar transmisión ⏹'}</button>`);
  }

  function finish() {
    const f = G.finishEvent(S);
    save();
    if (!f.ok) { toast(f.msg); closeModal(); render(); return; }
    const r = f.result;
    afterResult = r.chapterDone || null;
    openModal(`
      <h2>${esc(r.title)}</h2>
      <div class="stars">${starsTxt(r.stars)}</div>
      <div class="row between"><span>Calidad final</span><b class="num">${r.quality}/100</b></div>
      <div class="bar ${r.quality < 40 ? 'red' : r.quality < 55 ? 'amber' : ''}"><i style="width:${r.quality}%"></i></div>
      <table style="margin-top:12px">
        <tr><td>Pago del cliente</td><td class="up">+${M(r.pay)}</td></tr>
        <tr><td>Sueldos del personal</td><td class="down">-${M(r.wages)}</td></tr>
        <tr><td><b>Ganancia</b></td><td class="${r.net >= 0 ? 'up' : 'down'}"><b>${M(r.net)}</b></td></tr>
        <tr><td>Fama</td><td class="${r.repDelta >= 0 ? 'up' : 'down'}">${r.repDelta >= 0 ? '+' : ''}${r.repDelta}</td></tr>
      </table>
      ${r.ups.length ? `<p class="small">📈 ${r.ups.map(esc).join(' · ')}</p>` : ''}
      <details><summary>Ver detalle</summary>
        <p class="small"><b>Calidad inicial: ${r.base}</b></p>
        ${r.incidents.map((i) => `<p class="small">${esc(i.text)}<br><span class="muted">→ ${esc(i.result.msg)} (${i.result.q > 0 ? '+' : ''}${i.result.q})</span></p>`).join('')}
      </details>
      <p class="small muted">El equipo se desgastó un poco y pasó un día.</p>
      <button class="btn main" data-act="after-result">Continuar</button>`);
  }

  function showChapterDone(d) {
    openModal(`<div class="story-tag">🏅 Capítulo completado</div><h2>${esc(d.title)}</h2>
      <p class="story">${esc(d.text)}</p><p>Premio: <span class="pay">${M(d.reward)}</span></p>
      <button class="btn main" data-act="close-story">¡Vamos!</button>`);
  }

  function showChapterIntro() {
    if (S.storyDone || S.chapterSeen === S.chapter) return false;
    const ch = G.CHAPTERS[S.chapter];
    S.chapterSeen = S.chapter;
    save();
    openModal(`<div class="story-tag">Nuevo capítulo</div><h2>${esc(ch.title)}</h2>
      <p class="story">${esc(ch.intro)}</p><p><b>🎯 Objetivo:</b> ${esc(ch.goal)}</p>
      <button class="btn main" data-act="close">Entendido</button>`);
    return true;
  }

  function showGameOver() {
    openModal(`<h2>💸 Quebraste</h2>
      <p>Las deudas de tu productora pasaron de $300. Llegaste al día ${S.day} con ${S.stats.events} eventos cubiertos.</p>
      <p class="muted small">Consejo: no compres equipo caro muy pronto y lleva repuestos.</p>
      <button class="btn main" data-act="restart">Empezar de nuevo</button>`);
  }

  /* ---------- Clics ---------- */
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('nav button');
    if (nav) { tab = nav.dataset.tab; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    const id = el.dataset.id ? Number(el.dataset.id) : null;
    switch (a) {
      case 'tab': tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
      case 'close': closeModal(); render(); break;
      case 'confirm-yes': { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); break; }
      case 'next-day': G.nextDay(S); save(); render(); toast(`Día ${S.day}`); if (!showChapterIntro()) render(); break;
      case 'mkt': act(G.marketing(S, el.dataset.k)); break;
      case 'hire': act(G.hire(S, id)); showChapterIntro(); break;
      case 'fire': { const p = S.staff.find((x) => x.id === id); if (p) ask(`¿Despedir a ${esc(p.name)}?`, 'Sí, despedir', () => act(G.fire(S, id))); break; }
      case 'search-staff': act(G.searchStaff(S)); break;
      case 'buy': act(G.buy(S, el.dataset.k)); showChapterIntro(); break;
      case 'buy-cons': act(G.buyConsumable(S, el.dataset.k, 1)); break;
      case 'repair': act(G.repair(S, id)); break;
      case 'sell': { const it = S.equip.find((x) => x.id === id); if (it) ask(`¿Vender ${esc(G.CATALOG[it.type].name)} por ${M(G.sellPrice(it))}?`, 'Sí, vender', () => act(G.sell(S, id))); break; }
      case 'prep': openPrep(id); break;
      case 'auto': { const s = G.suggestLoadout(S, prep.id); prep.staff = new Set(s.staffIds); prep.equip = new Set(s.equipIds); renderPrep(); break; }
      case 'go-live': {
        const r = G.startEvent(S, prep.id, [...prep.staff], [...prep.equip]);
        if (!r.ok) { toast(r.msg); break; }
        save(); render(); showIncident(); break;
      }
      case 'choose': choose(Number(el.dataset.i)); break;
      case 'next-inc': showIncident(); break;
      case 'finish': finish(); break;
      case 'after-result':
        if (afterResult) { const d = afterResult; afterResult = null; showChapterDone(d); }
        else { closeModal(); render(); if (S.gameOver) showGameOver(); }
        break;
      case 'close-story': closeModal(); render(); if (!showChapterIntro() && S.gameOver) showGameOver(); break;
      case 'new-game': ask('Se borrará tu partida actual.', 'Sí, empezar de nuevo', () => { S = G.newGame(); save(); tab = 'inicio'; render(); showChapterIntro(); }); break;
      case 'restart': S = G.newGame(); save(); closeModal(); tab = 'inicio'; render(); showChapterIntro(); break;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !prep) return;
    const id = Number(el.dataset.id);
    if (el.dataset.act === 'tog-staff') { el.checked ? prep.staff.add(id) : prep.staff.delete(id); renderPrep(); }
    if (el.dataset.act === 'tog-equip') { el.checked ? prep.equip.add(id) : prep.equip.delete(id); renderPrep(); }
  });

  /* ---------- Inicio ---------- */
  S = load() || G.newGame();
  save();
  render();
  if (S.currentEvent) showIncident();       // si cerraste la app en pleno evento, sigue donde quedó
  else showChapterIntro();
  window.__game = { get state() { return S; } }; // para las pruebas automáticas
})();
