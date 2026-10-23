/* Prueba automática de la lógica: juega cientos de partidas con un "bot"
   y revisa que nada se rompa (dinero válido, sin errores, historia completable)
   y que la dificultad esté en el rango buscado (quiebras, duelos, estrellas).
   Uso:  node tests/test_logic.js      (SEED=5000 node tests/test_logic.js para otra semilla) */
'use strict';
const G = require('../js/logic.js');

let errors = 0;
function check(cond, msg) { if (!cond) { errors++; if (errors < 30) console.error('❌', msg); } }

function validState(s, tag) {
  check(Number.isFinite(s.money), `${tag}: dinero inválido ${s.money}`);
  check(Number.isFinite(s.rep) && s.rep >= 0 && s.rep <= 100, `${tag}: fama inválida ${s.rep}`);
  check(s.staff.some((p) => p.owner), `${tag}: desapareció el dueño`);
  s.equip.forEach((e) => check(G.CATALOG[e.type] && e.condition >= 1 && e.condition <= 100, `${tag}: equipo inválido ${JSON.stringify(e)}`));
  s.staff.forEach((p) => check(p.skill >= 1 && p.skill <= 5 && p.morale >= 0 && p.morale <= 100 && G.ROLE_KEYS.includes(p.role) && G.TIERS[p.tier], `${tag}: personal inválido ${JSON.stringify(p)}`));
  check(s.stock.cable >= 0 && s.stock.battery >= 0, `${tag}: stock negativo`);
}

// Bot que juega "razonablemente bien" con personal y equipos realistas:
// arma la plantilla que piden los eventos (cablero, coordinador, repeticiones, gráficos, shader...),
// compra lentes para las cámaras de hombro y de sistema, fibra, intercom, etc.
const R = (r) => (s) => s.staff.filter((p) => G.canonRole(p.role) === r).length;
const own = (s, k) => s.equip.filter((e) => e.type === k).length;
const camsN = (s) => G.countCat(s, 'cam');
// [clave, condición] en orden de prioridad (solo compra si le sobra plata)
const WISHES = [
  ['audio_basic', (s) => G.countCat(s, 'audio') < 1],
  ['cam_basic', (s) => camsN(s) < 2],
  ['switch_basic', (s) => G.countCat(s, 'switcher') < 1],
  ['encoder', (s) => G.countCat(s, 'encoder') < 1],
  ['raincover', (s) => G.countCat(s, 'rain') < 1],
  ['router4g', (s) => G.countCat(s, 'internet') < 1],
  ['ups', (s) => G.countCat(s, 'power') < 1],
  ['mics', (s) => G.countCat(s, 'mics') < 1],
  ['sop_tripode_basico', (s) => own(s, 'sop_tripode_basico') < 2],
  ['cam_pro', (s) => camsN(s) < 3 && s.rep >= 6],
  ['audio_pro', (s) => s.rep >= 10 && own(s, 'audio_pro') < 1],
  ['cam_cine', (s) => s.rep >= 14 && own(s, 'cam_cine') < 2],
  ['ic_hollyband_solidkom_c2', (s) => s.rep >= 16 && G.countCat(s, 'intercom') < 1],
  ['gfx_kasparcg_pc', (s) => s.rep >= 18 && G.countCat(s, 'graphics') < 1],
  ['sw_vmax_pro_pc', (s) => s.rep >= 18 && own(s, 'sw_vmax_pro_pc') < 1],
  ['switch_pro', (s) => s.rep >= 28 && own(s, 'switch_pro') < 1],
  ['enc_kilovista_p3', (s) => s.rep >= 22 && own(s, 'enc_kilovista_p3') < 1],
  ['rep_vmax_repeticion', (s) => s.rep >= 30 && G.countCat(s, 'replay') < 1],
  ['cam_blackmagia_urso_broadcast_g3', (s) => s.rep >= 30 && own(s, 'cam_blackmagia_urso_broadcast_g3') < 2],
  ['lente_kanon_kx21x8_2', (s) => own(s, 'lente_kanon_kx21x8_2') < own(s, 'cam_blackmagia_urso_broadcast_g3') + own(s, 'cam_zony_hdk_3200')],
  ['au_behringa_x33_rack', (s) => s.rep >= 30 && own(s, 'au_behringa_x33_rack') < 1],
  ['pw_jonda_eu2300i', (s) => s.rep >= 30 && own(s, 'pw_jonda_eu2300i') < 1],
  ['sop_manfrotti_504x', (s) => s.rep >= 30 && own(s, 'sop_manfrotti_504x') < 2],
  ['tx_terradek_rayo_6', (s) => s.rep >= 40 && G.countCat(s, 'wireless') < 1],
  ['cam_zony_hdk_3200', (s) => s.rep >= 50 && own(s, 'cam_zony_hdk_3200') < 1 && own(s, 'switch_pro') > 0],
  ['fib_cable_smpte_100m', (s) => own(s, 'cam_zony_hdk_3200') > own(s, 'fib_cable_smpte_100m')],
  ['cam_cine', (s) => s.rep >= 40 && own(s, 'cam_cine') < 3],
];
// Personal que quiere tener según la fama (la plantilla de los eventos que puede tomar)
function wantStaff(s) {
  const r = s.rep, cams = camsN(s);
  const has = (cat) => G.countCat(s, cat) > 0;
  return {
    camarografo: Math.min(cams - 1, r < 10 ? 1 : r < 30 ? 2 : 3),
    director: cams >= 2 ? 1 : 0, sonidista: has('audio') ? 1 : 0, tecnico_transmision: has('encoder') ? 1 : 0,
    cablero: cams >= 3 ? 1 : 0,
    coordinador_piso: r >= 12 ? 1 : 0,
    microfonista: r >= 35 ? 1 : 0,
    operador_graficos: has('graphics') ? 1 : 0,
    operador_repeticion: has('replay') || own(s, 'sw_vmax_pro_pc') ? 1 : 0,
    shader: own(s, 'cam_zony_hdk_3200') ? 1 : 0,
  };
}
function botTurn(s) {
  // Mantener repuestos
  if (s.stock.cable < 2 && s.money > 300) G.buyConsumable(s, 'cable', 1);
  if (s.stock.battery < 1 && s.money > 400) G.buyConsumable(s, 'battery', 1);
  // Reparar equipo gastado
  s.equip.filter((e) => e.condition < 45).forEach((e) => { if (s.money > G.repairCost(e) + 300) G.repair(s, e.id); });
  // Comprar según necesidad
  for (const [type, need] of WISHES) {
    const it = G.CATALOG[type];
    if (need(s) && it.minRep <= s.rep && s.money > it.price + 800 + 6 * G.dailyCost(s)) { G.buy(s, type); break; }
  }
  // Contratar según necesidad (el que llega con mejor nivel primero)
  const want = wantStaff(s);
  for (const c of s.candidates.slice().sort((a, b) => b.skill - a.skill)) {
    const role = G.canonRole(c.role);
    const have = s.staff.filter((p) => G.canonRole(p.role) === role && !p.owner).length;
    const cap = s.rep < 12 ? 6 : s.rep < 30 ? 8 : s.rep < 45 ? 10 : 12;
    const core = ['camarografo', 'director', 'sonidista', 'tecnico_transmision'].includes(role);
    const reserve = core ? 300 + 2 * G.dailyCost(s) : 600 + 4 * G.dailyCost(s);
    if (have < (want[role] || 0) && s.staff.length < cap && c.tier !== 'internacional' && s.money > c.wage * 2 + reserve) G.hire(s, c.id);
  }
  // Si falta alguien que quiere y no hay candidatos de ese rol, publica una vacante para ese rol
  const missing = Object.keys(want).filter((r) => (want[r] || 0) > s.staff.filter((p) => G.canonRole(p.role) === r && !p.owner).length && !s.candidates.some((c) => c.role === r));
  if (missing.length && s.day % 4 === 0 && s.money > 1500 + 3 * G.dailyCost(s)) G.searchStaff(s, missing[0]);
  // Despedir desmotivados
  s.staff.filter((p) => !p.owner && p.morale < 15).forEach((p) => G.fire(s, p.id));
  if (s.contracts.length < 2 && s.money > 600) G.marketing(s, 'redes');
  // Si el equipo está muy cansado, descansa un día (lo que haría una persona)
  const hired = s.staff.filter((p) => !p.owner);
  if (hired.length && hired.reduce((a, p) => a + p.morale, 0) / hired.length < 45 && !s.contracts.some((c) => c.story && c.daysLeft <= 1)) { idle.descanso++; G.nextDay(s); return; }
  // Elegir el mejor contrato según calidad esperada
  let best = null;
  for (const c of s.contracts) {
    if (c.internacional) { intlSeen++; }
    const lo = G.suggestLoadout(s, c.id);
    // En eventos chicos lleva solo el mínimo de los roles de apoyo (ahorra sueldos)
    if (c.diff <= 2) {
      const plan = G.crewPlan(s, c, lo.staffIds, lo.equipIds);
      plan.roles.forEach((r) => {
        if (['camarografo', 'director', 'sonidista', 'tecnico_transmision'].includes(r.key)) return;
        r.personas.filter((p) => !p.owner).slice(r.min).forEach((p) => { lo.staffIds = lo.staffIds.filter((id) => id !== p.id); });
      });
    }
    if (c.internacional && G.requisitosInternacional(s, c, lo.staffIds, lo.equipIds).some((r) => r.obligatorio && !r.ok)) continue;
    const staff = s.staff.filter((p) => lo.staffIds.includes(p.id));
    const equip = s.equip.filter((e) => lo.equipIds.includes(e.id));
    if (!equip.some((e) => G.CATALOG[e.type].cat === 'cam')) continue;
    const cq = G.computeQuality(s, c, staff, equip);
    const q = cq.q;
    // Lo que espera ganar: el pago según las estrellas que cree que va a sacar, menos los sueldos
    const est = cq.rango.esperado;
    const B = G.BALANCE;
    const st = est >= B.stars[0] ? 5 : est >= B.stars[1] ? 4 : est >= B.stars[2] ? 3 : est >= B.stars[3] ? 2 : 1;
    const wages = staff.reduce((a, p) => a + G.eventWage(p, c.diff), 0) + (c.travelCost || 0);
    const net = c.pay * (c.diff >= B.bigFrom ? B.starsPayBig : B.starsPay)[st] - wages;
    if (net <= 0 && !c.story) { idle.noRinde++; continue; }
    // Semáforo en rojo (falta gente bajo el mínimo) en un evento grande: no se arriesga, salvo la historia
    const cpl = G.crewPlan(s, c, lo.staffIds, lo.equipIds);
    if (c.diff >= 3 && !c.story && cpl.falta > 0) { idle.falta++; cpl.roles.filter((r) => r.estado === 'falta' && r.min > 0).forEach((r) => { faltaRol[r.key] = (faltaRol[r.key] || 0) + 1; }); continue; }
    let score = Math.max(1, net + 0.35 * c.pay * (q / 100)) * (st >= 2 ? 1 : 0.3);
    // Perseguir la historia: ofertas del capítulo y duelos contra la rival (si se pueden ganar)
    if (c.story && q >= 60) score *= 2;
    // Duelos: el contrato muestra la calidad que promete MegaVisión; el bot solo se arriesga si cree que le gana
    if (c.rival) score *= q >= c.rivalQuality + 10 ? (s.chapter === 3 && !s.storyDone ? 1.6 : 1) : 0.3;
    if (!best || score > best.score) best = { c, lo, score };
  }
  if (!best) { idle.sinOferta++; G.nextDay(s); return; }
  // Antes de un evento de la historia, deja todo el equipo como nuevo (lo que haría una persona)
  if (best.c.story) s.equip.filter((e) => e.condition < 80).forEach((e) => { if (s.money > G.repairCost(e) + 200) G.repair(s, e.id); });
  const r = G.startEvent(s, best.c.id, best.lo.staffIds, best.lo.equipIds);
  check(r.ok, 'startEvent falló: ' + r.msg);
  if (!r.ok) { G.nextDay(s); return; }
  const ev = s.currentEvent;
  check(ev.crewPlan && Array.isArray(ev.crewPlan.roles) && ev.cameraPlan && Array.isArray(ev.cameraPlan.positions), 'el evento no guardó los planes');
  crewStats.events++;
  crewStats.falta += ev.crewPlan.falta;
  let inc, guard = 0;
  while ((inc = G.currentIncident(s)) && guard++ < 10) {
    check(inc.choices.some((ch) => ch.ok), 'imprevisto sin ninguna opción disponible: ' + inc.text);
    check(typeof inc.k === 'string' && G.TEXTOS[inc.k] !== undefined, 'imprevisto sin clave de texto: ' + inc.key);
    const ch = inc.choices.find((x) => x.ok);
    const rr = G.resolveIncident(s, ch.i);
    check(rr.ok && typeof rr.msg === 'string' && G.TEXTOS[rr.k] !== undefined, 'resolveIncident falló o sin clave de texto: ' + inc.key);
  }
  const chBefore = s.storyDone ? NCH : s.chapter;
  const f = G.finishEvent(s);
  check(f.ok && f.result.stars >= 1 && f.result.stars <= 5, 'finishEvent falló');
  if (f.ok) {
    starsByChapter[chBefore].push(f.result.stars);
    check(f.result.crewPlan && f.result.cameraPlan && f.result.type === best.c.type && Array.isArray(f.result.avisos), 'el resultado no trae los planes, el tipo o los avisos');
    if (best.c.internacional) intlPlayed++;
    if (f.result.rival) {
      check(typeof f.result.rivalQuality === 'number' && (f.result.duel === 'won') === (f.result.quality > f.result.rivalQuality),
        'duelo: el resultado no coincide con la calidad de MegaVisión');
    }
    check(f.result.payNow + f.result.payLater === f.result.pay, 'cobro en dos partes no suma el total');
  }
}
const crewStats = { events: 0, falta: 0 };
const intlIds = new Set();
const idle = { descanso: 0, sinOferta: 0, noRinde: 0, falta: 0 }; // por qué el bot no trabajó
const faltaRol = {};
let intlSeen = 0, intlPlayed = 0;

const GAMES = Number(process.env.GAMES) || 400, MAX_DAYS = 400, SEED = Number(process.env.SEED) || 1000;
const NCH = G.CHAPTERS.length;
const starsByChapter = G.CHAPTERS.map(() => []).concat([[]]); // índice NCH = modo libre
let storyWins = 0, bankrupt = 0, daysToWin = [], chapterReached = new Array(NCH + 1).fill(0);
const chapterDays = G.CHAPTERS.map(() => []);
let rivalSeen = 0, rivalEarly = 0, duelsWon = 0, duelsLost = 0;
for (let g = 0; g < GAMES; g++) {
  const s = G.newGame(SEED + g);
  validState(s, `partida ${g} inicio`);
  let winDay = null, lastCh = s.chapter;
  for (let t = 0; t < MAX_DAYS && !s.gameOver; t++) {
    try { botTurn(s); } catch (e) { check(false, `partida ${g} día ${s.day}: EXCEPCIÓN ${e.stack}`); break; }
    validState(s, `partida ${g} día ${s.day}`);
    check(Number.isFinite(G.dailyCost(s)) && G.dailyCost(s) >= 20, `partida ${g}: gasto diario inválido`);
    s.contracts.forEach((c) => {
      check(typeof c.rival === 'boolean', `partida ${g}: contrato sin campo rival`);
      if (c.rival) check(typeof c.rivalQuality === 'number', `partida ${g}: contrato disputado sin calidad de MegaVisión`);
      if (c.rival) { rivalSeen++; if (!s.storyDone && s.chapter < 3) rivalEarly++; }
      if (!s.storyDone && c.type === 'ligapro') check(s.chapter >= 4, `partida ${g}: LigaPrima antes del capítulo 5`);
      if (c.internacional) {
        intlIds.add(g + ':' + c.id);
        check(typeof c.pais === 'string' && c.mult > 1 && Array.isArray(c.requisitos) && c.requisitos.some((r) => r.obligatorio) && typeof c.travelCost === 'number' && typeof c.repRisk === 'number',
          `partida ${g}: contrato internacional sin sus campos`);
        check(!c.rival && !c.story, `partida ${g}: contrato internacional disputado o de historia`);
      }
    });
    while (lastCh < s.chapter) { chapterDays[lastCh].push(s.day); lastCh++; }
    if (s.storyDone && winDay === null) { winDay = s.day; chapterDays[NCH - 1].push(s.day); lastCh = NCH; }
  }
  // Guardar y cargar
  const copy = G.deserialize(G.serialize(s));
  check(copy && copy.money === s.money && copy.day === s.day, `partida ${g}: guardar/cargar no coincide`);
  if (winDay) { storyWins++; daysToWin.push(winDay); }
  if (s.gameOver) bankrupt++;
  duelsWon += s.stats.duels.won; duelsLost += s.stats.duels.lost;
  chapterReached[s.storyDone ? NCH : s.chapter]++;
}
check(rivalSeen > 0, 'nunca aparecieron contratos disputados');
check(rivalEarly === 0, `aparecieron ${rivalEarly} contratos disputados antes del capítulo 4`);

// Cada capítulo debe tener personaje, texto y progreso
G.CHAPTERS.forEach((ch, i) => {
  check(['ramiro', 'mega', 'marca', 'dirigente'].includes(ch.character), `capítulo ${i + 1}: personaje inválido`);
  ['title', 'intro', 'goal', 'done'].forEach((k) => check(typeof ch[k] === 'string' && ch[k].length > 0, `capítulo ${i + 1}: falta ${k}`));
  ['title', 'intro', 'goal', 'done'].forEach((k) => check(!/[—–]/.test(ch[k]), `capítulo ${i + 1}: ${k} tiene raya larga`));
  const p = ch.progress(G.newGame(7));
  check(typeof p === 'string' && p.length > 0 && p.length < 90, `capítulo ${i + 1}: progress debe ser un texto corto`);
});

// Duelos contra MegaVisión: ganar da fama extra, perder la quita
(function () {
  function play(s, c, staffIds, equipIds) {
    const r = G.startEvent(s, c.id, staffIds, equipIds);
    check(r.ok, 'duelo: no se pudo iniciar ' + r.msg);
    let inc; while ((inc = G.currentIncident(s))) G.resolveIncident(s, inc.choices.find((x) => x.ok).i);
    return G.finishEvent(s).result;
  }
  const s = G.newGame(77);
  s.chapter = 3; s.rep = 30; s.contracts = []; s.stats.events = 5;
  const c = G.addContract(s, 'boda');
  check(c && c.rival === false, 'contrato pedido a mano no debería ser disputado');
  c.rival = true; c.stream = true; c.audio = true; c.cams = 3; c.diff = 4; c.rivalQuality = 70;
  const owner = s.staff.find((p) => p.owner);
  const rep0 = s.rep;
  const r = play(s, c, [owner.id], s.equip.map((e) => e.id));
  check(r.rival && r.rivalQuality === 70 && r.quality <= 70 && r.duel === 'lost' && s.stats.duels.lost === 1, 'duelo perdido no se registró');
  check(s.rep - rep0 <= -G.BALANCE.rival.loseRep, `duelo perdido debería quitar fama extra (${s.rep - rep0})`);
  // Ganar: tu calidad final debe superar la de MegaVisión (aunque saques 3 estrellas)
  const s2 = G.newGame(78);
  s2.chapter = 3; s2.rep = 30; s2.contracts = [];
  const c2 = G.addContract(s2, 'misa'); c2.rival = true; c2.stream = false; c2.outdoor = false; c2.cams = 1; c2.audio = false; c2.rivalQuality = 60;
  const ok = G.startEvent(s2, c2.id, [s2.staff[0].id], [s2.equip[0].id]);
  check(ok.ok, 'duelo 2: no se pudo iniciar');
  s2.currentEvent.base = 100; s2.currentEvent.incidents = [];
  const r2 = G.finishEvent(s2).result;
  check(r2.stars >= 4 && r2.duel === 'won' && r2.rivalQuality === 60 && s2.stats.duels.won === 1 && s2.stats.good.misa === 1, 'duelo ganado no se registró');
  // Empate de calidad = gana MegaVisión
  const s4 = G.newGame(80); s4.chapter = 3; s4.contracts = [];
  const c4 = G.addContract(s4, 'misa'); c4.rival = true; c4.rivalQuality = 64; c4.stream = false; c4.outdoor = false; c4.cams = 1;
  G.startEvent(s4, c4.id, [s4.staff[0].id], [s4.equip[0].id]);
  s4.currentEvent.base = 64; s4.currentEvent.incidents = [];
  check(G.finishEvent(s4).result.duel === 'lost', 'con la misma calidad debería ganar MegaVisión');
  check(s2.chapterStats.duels === 1 && /Duelos 1\/3/.test(G.CHAPTERS[3].progress(s2)), 'el duelo no cuenta para el capítulo 4');
  // Antes del capítulo 4 no hay contratos disputados
  const s3 = G.newGame(79); s3.rep = 30; s3.contracts = [];
  for (let i = 0; i < 60; i++) { const k = G.addContract(s3); if (k) check(!k.rival, 'disputado antes del capítulo 4'); s3.contracts = []; }
})();

// Una partida vieja (sin los campos nuevos) debe cargar bien
(function () {
  const s = G.newGame(5);
  s.v = 1; // guardado de la versión anterior
  delete s.stats.good; delete s.stats.duels; delete s.storyNext; delete s.chapterStats; delete s.pending; delete s.lastWorkDay;
  s.contracts.forEach((c) => { delete c.rival; delete c.story; });
  s.contracts[0].rival = true; // disputado sin calidad de MegaVisión (no existía en v1)
  s.stats.best.lanzamiento = 4; s.chapter = 2;
  const o = G.deserialize(JSON.stringify(s));
  check(o && o.stats.good.lanzamiento === 1 && o.stats.duels.won === 0 && typeof o.storyNext === 'number', 'deserialize no rellenó campos nuevos');
  check(o && o.chapterStats && o.chapterStats.good.lanzamiento === 1 && o.chapterStats.duels === 0, 'deserialize no rellenó chapterStats');
  check(o && /1\/2/.test(G.CHAPTERS[2].progress(o)), 'progreso del capítulo 3 en partida vieja');
  check(o && o.contracts.slice(1).every((c) => c.rival === false && c.story === false), 'deserialize no rellenó campos de contratos');
  check(o && typeof o.contracts[0].rivalQuality === 'number', 'deserialize no rellenó la calidad de MegaVisión');
  check(o && Array.isArray(o.pending) && typeof o.lastWorkDay === 'number' && o.v === G.SAVE_VERSION, 'deserialize no rellenó cobros pendientes / versión');
  for (let i = 0; i < 30; i++) { G.nextDay(o); validState(o, 'partida vieja'); }
})();

// Probar que un guardado dañado no rompa el juego
check(G.deserialize('{basura') === null, 'deserialize debería rechazar basura');
check(G.deserialize('{"v":99}') === null, 'deserialize debería rechazar versión desconocida');

// Probar reglas puntuales
(function () {
  const s = G.newGame(42);
  const c = s.contracts[0];
  const bad = G.startEvent(s, c.id, [], []);
  check(!bad.ok, 'debería impedir evento sin personal');
  const r = G.buy(s, 'cam_cine');
  check(!r.ok, 'no debería vender cámara 4K con fama baja');
  const m1 = G.marketing(s, 'redes');
  const m2 = G.marketing(s, 'redes');
  check(m1.ok && !m2.ok, 'redes solo una vez por día');
  // Gastos diarios: crecen con el tamaño de la productora
  const g0 = G.dailyCost(G.newGame(1));
  const big = G.newGame(1);
  for (let i = 0; i < 6; i++) big.staff.push({ id: 900 + i, name: 'X', role: 'cam', skill: 3, wage: 60, morale: 80, events: 0 });
  for (let i = 0; i < 12; i++) big.equip.push({ id: 950 + i, type: 'cam_pro', condition: 100 });
  const bd = G.dailyCostBreakdown(big);
  check(g0 === 20 + Math.round(G.CATALOG.cam_basic.price * G.BALANCE.daily.equipShare), `gasto diario inicial inesperado (${g0})`);
  check(G.dailyCost(big) > g0 * 5 && bd.total === G.dailyCost(big) && typeof bd.place === 'string', 'el gasto diario debería crecer con la empresa');
  const money0 = big.money; G.nextDay(big);
  check(money0 - big.money === bd.total, 'nextDay debería cobrar exactamente dailyCost');
  // Cobro pendiente: llega a los días indicados
  const lp = G.newGame(3); lp.pending = [{ day: lp.day + 2, amount: 500, client: 'Prueba' }];
  const m0 = lp.money; G.nextDay(lp); const m1b = lp.money; G.nextDay(lp);
  check(lp.pending.length === 0 && lp.money - m1b === 500 - G.dailyCost(lp), `el cobro pendiente no llegó (${m0} ${m1b} ${lp.money})`);
  // Los primeros eventos son suaves: 1 solo imprevisto y sin sorpresas de plata
  const tu = G.newGame(9);
  const t0 = tu.contracts[0];
  G.startEvent(tu, t0.id, [tu.staff[0].id], [tu.equip[0].id]);
  check(tu.currentEvent.incidents.length === 1 && tu.currentEvent.tutorial, 'el primer evento debería tener un solo imprevisto');
  // Eventos grandes: al menos 2 imprevistos desde dificultad 3
  const hi = G.newGame(10); hi.stats.events = 10; hi.rep = 40; hi.contracts = [];
  for (let i = 0; i < 20; i++) {
    const k = G.addContract(hi, 'lanzamiento'); k.diff = 3;
    G.startEvent(hi, k.id, [hi.staff[0].id], [hi.equip[0].id]);
    check(hi.currentEvent.incidents.length >= 2, 'dificultad 3 debería tener al menos 2 imprevistos');
    hi.currentEvent = null;
  }
  // Sueldo en eventos grandes
  check(G.eventWage({ wage: 100 }, 1) === 100 && G.eventWage({ wage: 100 }, 5) > 100, 'el sueldo debería subir en eventos grandes');
})();


/* ---------- Sistemas realistas ---------- */
// Arma una productora completa para probar un evento con o sin parte del personal
function armar(seed, tipo, roles, equipos) {
  const s = G.newGame(seed);
  s.stats.events = 20; s.rep = 30; s.money = 50000; s.contracts = []; s.chapter = 3;
  s.equip = []; s.staff = [s.staff[0]];
  let id = 5000;
  roles.forEach((r) => s.staff.push({ id: ++id, name: 'P' + id, role: r, tier: 'semi_senior', skill: 3, wage: 50, morale: 80, events: 0, eventos_nacionales: 0, eventos_internacionales: 0 }));
  equipos.forEach((k) => s.equip.push({ id: ++id, type: k, condition: 100 }));
  const c = G.addContract(s, tipo, 1, { noRival: true });
  c.stream = true; c.outdoor = false; c.cams = Math.min(c.cams, 3);
  return { s, c };
}
const KIT = ['cam_cine', 'cam_cine', 'cam_pro', 'switch_pro', 'audio_pro', 'mics', 'encoder', 'router4g', 'ups', 'raincover',
  'ic_hollyband_solidkom_c2', 'gfx_kasparcg_pc', 'sop_tripode_basico', 'sop_tripode_basico', 'sop_tripode_basico'];
const COMPLETO = ['director', 'camarografo', 'camarografo', 'cablero', 'cablero', 'sonidista', 'microfonista', 'operador_graficos', 'tecnico_transmision', 'coordinador_piso'];
const CORTO = ['director', 'camarografo', 'camarografo', 'sonidista', 'tecnico_transmision']; // sin cablero ni coordinador de piso
(function () {
  const run = (roles) => {
    const out = { base: 0, quality: 0, roleInc: 0, inc: 0, neg: 0, bad: 0, n: 0 };
    for (let k = 0; k < 300; k++) {
      const { s, c } = armar(9000 + k, 'lanzamiento', roles, KIT);
      const lo = G.suggestLoadout(s, c.id);
      const r = G.startEvent(s, c.id, s.staff.map((p) => p.id), lo.equipIds);
      if (!r.ok) { check(false, 'falta de personal: no inicia ' + r.msg); return out; }
      const ev = s.currentEvent;
      out.base += ev.base; out.n++;
      ev.incidents.forEach((i) => { out.inc++; if (['cablero', 'coordinador_piso'].includes(G.INCIDENTS[i.key].rol)) out.roleInc++; });
      let inc; while ((inc = G.currentIncident(s))) { const rr = G.resolveIncident(s, inc.choices.find((x) => x.ok).i); if (rr.q < 0) out.neg++; }
      const f = G.finishEvent(s).result;
      out.quality += f.quality; if (f.stars <= 3) out.bad++;
    }
    return out;
  };
  const full = run(COMPLETO), short = run(CORTO);
  const avg = (o, k) => o[k] / Math.max(1, o.n);
  console.log(`Falta de personal (lanzamiento, 300 eventos): completo base ${avg(full, 'base').toFixed(1)} final ${avg(full, 'quality').toFixed(1)} · ` +
    `sin cablero ni coordinador base ${avg(short, 'base').toFixed(1)} final ${avg(short, 'quality').toFixed(1)} · imprevistos de esos roles ${avg(full, 'roleInc').toFixed(2)} vs ${avg(short, 'roleInc').toFixed(2)} por evento`);
  check(avg(short, 'base') < avg(full, 'base') - 5, 'ir con menos gente debería bajar la calidad base');
  check(avg(short, 'quality') < avg(full, 'quality') - 8, 'ir con menos gente debería bajar la calidad final');
  check(avg(short, 'roleInc') > 1.5 * avg(full, 'roleInc'), 'sin cablero ni coordinador deberían salir más imprevistos de esos roles');
  check(avg(short, 'inc') > avg(full, 'inc'), 'ir bajo el mínimo debería traer más imprevistos');
  check(full.neg > 0 && full.bad > 0, 'con la plantilla completa igual tiene que poder salir algo mal');
  // El plan de personal: semáforo por rol y ahorro
  const { s, c } = armar(77, 'lanzamiento', CORTO, KIT);
  const cp = G.crewPlan(s, c, s.staff.map((p) => p.id));
  const cab = cp.roles.find((r) => r.key === 'cablero');
  const dir = cp.roles.find((r) => r.key === 'director');
  check(cab && cab.estado === 'falta' && cab.asignados === 0 && cab.min >= 1 && cab.riesgo > dir.riesgo && typeof cab.si_falta === 'string', 'crewPlan: el cablero debería salir en rojo con más riesgo');
  check(dir && dir.estado === 'completo' && cp.savings > 0 && cp.idealWages > cp.wages && cp.falta >= 1, 'crewPlan: sueldos, ahorro y conteo');
  const prod = cp.roles.find((r) => r.key === 'productor');
  check(prod && prod.dobleRol && prod.asignados === 1, 'crewPlan: el dueño hace de productor si no llevas uno');
  // Mejor gente resuelve mejor: más riesgo con un junior que con un senior
  const jr = Object.assign({}, s.staff.find((p) => p.role === 'director'), { id: 7001, tier: 'junior', skill: 1 });
  const sr = Object.assign({}, jr, { id: 7002, tier: 'senior', skill: 4 });
  s.staff.push(jr, sr);
  const cj = G.crewPlan(s, c, [s.staff[0].id, jr.id]).roles.find((r) => r.key === 'director');
  const cs = G.crewPlan(s, c, [s.staff[0].id, sr.id]).roles.find((r) => r.key === 'director');
  check(cj.riesgo > cs.riesgo, 'el personal con experiencia debería bajar el riesgo de su rol');
})();

// El plan de cámaras: una handycam en la tribuna principal rinde poco; una cámara de sistema con lente box, todo
(function () {
  const pobre = armar(31, 'ligapro', ['director', 'camarografo', 'camarografo', 'camarografo', 'shader'], ['cam_basic', 'cam_basic', 'cam_basic', 'cam_basic', 'switch_pro']);
  const rico = armar(31, 'ligapro', ['director', 'camarografo', 'camarografo', 'camarografo', 'shader'],
    ['cam_zony_hdk_3200', 'lente_box_kanon_digisupra_88', 'adaptador_lente_box', 'sop_vinter_vector_760', 'fib_cable_smpte_100m',
      'cam_blackmagia_urso_broadcast_g3', 'lente_kanon_kx21x8_2', 'cam_zony_pxv_z760', 'lente_kanon_cx25ex7_5', 'cam_blackmagia_urso_broadcast_g3', 'lente_kanon_kx21x8_2', 'switch_pro']);
  pobre.c.cams = 4; rico.c.cams = 4;
  const pp = G.cameraPlan(pobre.s, pobre.c, pobre.s.equip.map((e) => e.id), pobre.s.staff.map((p) => p.id));
  const pr = G.cameraPlan(rico.s, rico.c, rico.s.equip.map((e) => e.id), rico.s.staff.map((p) => p.id));
  const p0 = pp.positions[0], r0 = pr.positions[0];
  check(p0.key === 'principal' && p0.asignado === 'cam_basic' && p0.ajuste < 0.4, `handycam en la tribuna principal debería rendir poco (${p0.ajuste})`);
  check(r0.key === 'principal' && r0.asignado === 'cam_zony_hdk_3200' && r0.lente === 'lente_box_kanon_digisupra_88' && r0.ajuste === 1, `cámara de sistema con lente box en la principal debería rendir 1 (${JSON.stringify(r0)})`);
  check(pr.ajusteMedio > pp.ajusteMedio + 0.3, 'el plan de cámaras debería notar el equipo bueno');
  const camPts = (x) => G.computeQuality(x.s, x.c, x.s.staff, x.s.equip).parts.filter((p) => ['parte.camaras', 'parte.calidad_camaras'].includes(p[2])).reduce((a, p) => a + p[1], 0);
  const qp = camPts(pobre), qr = camPts(rico);
  check(qr >= qp + 12, `el ajuste de las cámaras debería pesar en la calidad (${qp} vs ${qr})`);
  // Requisitos: una cámara de hombro sin lente no sirve; una de sistema sin fibra tampoco; un dron sin piloto no vuela
  const req = armar(32, 'concierto', ['director', 'camarografo'], ['cam_blackmagia_urso_broadcast_g3', 'cam_zony_hdk_3200', 'lente_kanon_kx21x8_2', 'dron_dgi_micro_4_pro', 'cam_basic']);
  const pq = G.cameraPlan(req.s, req.c, req.s.equip.map((e) => e.id), req.s.staff.map((p) => p.id));
  const motivos = pq.bloqueados.map((b) => b.motivo).sort();
  check(JSON.stringify(motivos) === JSON.stringify(['sin_fibra', 'sin_piloto']), `requisitos de las cámaras: ${JSON.stringify(motivos)}`);
  check(pq.positions.every((p) => p.asignado !== 'dron_dgi_micro_4_pro'), 'un dron sin piloto no se puede usar');
  // Funeral: sin dron y errores más caros
  check(G.EVENT_TYPES.funeral.sensible && G.EVENT_TYPES.funeral.positions.every((p) => p[1] !== 'aerea'), 'funeral: sin dron');
  // Cada tipo de evento tiene plantilla, posiciones con texto y nombre
  Object.keys(G.EVENT_TYPES).forEach((k) => {
    const t = G.EVENT_TYPES[k];
    check(t.name && Object.keys(t.crew).length && t.positions.length >= t.cams[1], `evento ${k}: faltan datos`);
    t.positions.forEach((p) => check(G.TEXTOS[`pos.${k}.${p[0]}`] && G.TEXTOS[`pos.${k}.${p[0]}.ideal`], `evento ${k}: posición ${p[0]} sin texto`));
    let ideal = 0; Object.keys(t.crew).forEach((r) => { ideal += t.crew[r][1]; });
    check(ideal <= G.BALANCE.maxStaff + 1, `evento ${k}: la plantilla ideal (${ideal}) no cabe en ${G.BALANCE.maxStaff} personas`);
  });
  ['boxeo', 'lucha_libre', 'funeral', 'lanzamiento_autos', 'irl'].forEach((k) => check(G.EVENT_TYPES[k], `falta el evento ${k}`));
})();

// Contratos internacionales: piden personal con experiencia internacional
(function () {
  check(intlIds.size > 0, 'nunca apareció un contrato internacional en las partidas del bot');
  const s = G.newGame(55); s.chapter = 4; s.rep = 60; s.money = 30000; s.contracts = []; s.stats.events = 30;
  s.staff.push({ id: 801, name: 'Dir', role: 'director', tier: 'senior', skill: 4, wage: 120, morale: 90, events: 0, eventos_nacionales: 40, eventos_internacionales: 0 });
  s.staff.push({ id: 802, name: 'Cam', role: 'camarografo', tier: 'senior', skill: 4, wage: 100, morale: 90, events: 0, eventos_nacionales: 40, eventos_internacionales: 0 });
  ['cam_cine', 'cam_cine', 'switch_pro', 'audio_pro', 'encoder', 'enc_kilovista_p3', 'gfx_kasparcg_pc'].forEach((k, i) => s.equip.push({ id: 900 + i, type: k, condition: 100 }));
  const c = G.addIntlContract(s, 'boxeo_ext');
  check(c && c.internacional && c.pais && c.mult === 2 && c.requisitos.length >= 3, 'contrato internacional mal armado');
  check(!c.requisitos.find((r) => r.key === 'dir_intl').ok, 'sin experiencia internacional el requisito debería salir en rojo');
  const r1 = G.startEvent(s, c.id, s.staff.map((p) => p.id), s.equip.map((e) => e.id));
  check(!r1.ok && /extranjero/.test(r1.msg), 'sin realizador internacional no debería poder salir: ' + r1.msg);
  s.staff.find((p) => p.id === 801).tier = 'internacional';
  const m0 = s.money;
  const r2 = G.startEvent(s, c.id, s.staff.map((p) => p.id), s.equip.map((e) => e.id));
  check(r2.ok && s.money === m0 - c.travelCost, 'con realizador internacional debería salir y pagar el viaje: ' + r2.msg);
  let inc; while ((inc = G.currentIncident(s))) G.resolveIncident(s, inc.choices.find((x) => x.ok).i);
  const f = G.finishEvent(s).result;
  check(f.internacional && s.staff.find((p) => p.id === 802).eventos_internacionales === 1, 'el personal debería sumar experiencia internacional');
  // Días de viaje: el tiempo pasa solo
  const s2 = G.newGame(56); s2.chapter = 4; s2.rep = 65; s2.money = 90000; s2.contracts = []; s2.stats.events = 30;
  s2.staff.push({ id: 811, name: 'Dir', role: 'director', tier: 'internacional', skill: 5, wage: 200, morale: 90, events: 0, eventos_nacionales: 40, eventos_internacionales: 5 });
  s2.staff.push({ id: 812, name: 'Cam', role: 'camarografo', tier: 'internacional', skill: 5, wage: 160, morale: 90, events: 0, eventos_nacionales: 40, eventos_internacionales: 5 });
  s2.staff.push({ id: 813, name: 'Son', role: 'sonidista', tier: 'internacional', skill: 5, wage: 160, morale: 90, events: 0, eventos_nacionales: 40, eventos_internacionales: 5 });
  ['cam_cine', 'cam_cine', 'cam_cine', 'switch_pro', 'audio_pro', 'encoder', 'case_maletas_pelikano'].forEach((k, i) => s2.equip.push({ id: 950 + i, type: k, condition: 100 }));
  const v = G.addIntlContract(s2, 'vecino');
  const d0 = s2.day;
  check(G.startEvent(s2, v.id, s2.staff.map((p) => p.id), s2.equip.map((e) => e.id)).ok, 'evento en país vecino no inicia');
  while ((inc = G.currentIncident(s2))) G.resolveIncident(s2, inc.choices.find((x) => x.ok).i);
  const fv = G.finishEvent(s2).result;
  check(s2.day === d0 + 1 + v.travelDays && fv.travelDays === v.travelDays, 'los días de viaje deberían pasar solos');
  // Si sale mal, la fama cae fuerte
  const s3 = G.newGame(57); s3.chapter = 4; s3.rep = 60; s3.contracts = []; s3.stats.events = 30; s3.money = 9000;
  s3.staff.push({ id: 821, name: 'Dir', role: 'director', tier: 'internacional', skill: 5, wage: 200, morale: 90, events: 0, eventos_nacionales: 0, eventos_internacionales: 5 });
  const b = G.addIntlContract(s3, 'boxeo_ext');
  G.startEvent(s3, b.id, s3.staff.map((p) => p.id), s3.equip.map((e) => e.id));
  s3.currentEvent.base = 10; s3.currentEvent.incidents = [];
  const rep0 = s3.rep;
  const fb = G.finishEvent(s3).result;
  check(fb.stars <= 2 && fb.intlFail && rep0 - s3.rep >= b.repRisk, 'un contrato internacional que sale mal debería quitar mucha fama');
})();

// Niveles de experiencia: con más fama llegan mejores candidatos; el internacional es escaso y caro
(function () {
  const cnt = (rep) => { const s = G.newGame(3); s.rep = rep; const t = {}; for (let i = 0; i < 300; i++) { G.refreshCandidates(s); s.candidates.forEach((c) => { t[c.tier] = (t[c.tier] || 0) + 1; }); } return t; };
  const lo = cnt(5), hi = cnt(90);
  check(!lo.internacional && !lo.senior && lo.junior > 0, `con poca fama no deberían llegar seniors ni internacionales ${JSON.stringify(lo)}`);
  check(hi.senior > 0 && hi.internacional > 0 && hi.internacional < hi.senior && hi.internacional < 0.2 * 1500, `con mucha fama: seniors e internacionales escasos ${JSON.stringify(hi)}`);
  const w = G.TIER_KEYS.map((t) => G.baseWage('camarografo', t, 3));
  check(w.every((x, i) => i === 0 || x > w[i - 1]) && G.TIERS.internacional.mul === 5 && G.TIERS.senior.mul === 3, 'los sueldos deberían subir con el nivel');
  check(G.ROLE_KEYS.length === 14 && G.ROLE_KEYS.every((k) => G.ROLES[k].name && G.ROLES[k].desc && G.ROLES[k].siFalta), 'roles: 14 con nombre, descripción y "si falta"');
  check(G.ROLES.cam === G.ROLES.camarografo && !Object.keys(G.ROLES).includes('cam'), 'las claves viejas de roles siguen funcionando como alias');
})();

// Catálogo: todas las categorías, la escalera completa y sin marcas reales en ningún texto
(function () {
  const cats = G.CATEGORIAS.map((c) => c.key);
  ['cam', 'lens', 'support', 'switcher', 'replay', 'graphics', 'audio', 'mics', 'intercom', 'encoder', 'internet', 'wireless', 'cable', 'monitor', 'power', 'rain', 'case', 'vehicle', 'service']
    .forEach((k) => check(cats.includes(k) && Object.values(G.CATALOG).some((it) => it.cat === k), `categoría ${k} vacía o sin nombre`));
  G.CATEGORIAS.forEach((c) => check(typeof c.nombre === 'string' && c.nombre.length, `categoría ${c.key} sin nombre`));
  const n = Object.keys(G.CATALOG).length;
  check(n >= 60 && n <= 100, `catálogo con ${n} equipos`);
  Object.keys(G.CATALOG).forEach((k) => { const it = G.CATALOG[k]; check(it.name && it.desc && it.q >= 1 && it.q <= 6 && it.price > 0 && typeof it.minRep === 'number' && it.durabilidad >= 1, `equipo ${k} incompleto`); });
  ['cam_basic', 'cam_pro', 'cam_cine', 'switch_basic', 'switch_pro', 'audio_basic', 'audio_pro', 'mics', 'encoder', 'router4g', 'ups', 'raincover'].forEach((k) => check(G.CATALOG[k], `falta la clave vieja ${k}`));
  check(Object.values(G.CATALOG).some((it) => it.subtipo === 'lente_box' && /122x/.test(it.name)) && Object.values(G.CATALOG).some((it) => it.subtipo === 'camcorder_consumo'), 'falta la escalera de cámaras (de handycam a box 122x)');
  const shop = G.shopByCategory(G.newGame(1));
  check(shop.length >= 15 && shop[0].key === 'cam' && shop[0].items[0].price <= shop[0].items[shop[0].items.length - 1].price, 'tienda agrupada por categoría');
  // Marcas, ligas y canales reales: no pueden aparecer en ningún texto del juego
  const fs = require('fs'), path = require('path');
  const textos = [JSON.stringify(G.TEXTOS), JSON.stringify(G.CATALOG), JSON.stringify(G.EVENT_TYPES), JSON.stringify(G.INTL_KINDS),
    fs.readFileSync(path.join(__dirname, '..', 'js', 'premium.js'), 'utf8')].join('\n');
  const LARGAS = ['Sony', 'Canon', 'Panasonic', 'Blackmagic', 'Fujinon', 'Grass Valley', 'Ikegami', 'Shure', 'Sennheiser', 'Behringer', 'Midas', 'Yamaha',
    'Allen & Heath', 'Clear-Com', 'LiveU', 'Teradek', 'Haivision', 'Vinten', 'Sachtler', 'Vizrt', 'Atomos', 'vMix', 'Conmebol', 'Televisa', 'Telemundo'];
  const CORTAS = ['JVC', 'Ross', 'DJI', 'EVS', 'AJA', 'Rode', 'FIFA', 'FIBA', 'UEFA', 'ESPN', 'Fox', 'DAZN', 'TNT', 'Globo', 'beIN', 'ATEM', 'LigaPro']; // exactas (mayúsculas; las claves internas como ligapro no cuentan)
  LARGAS.forEach((m) => check(!new RegExp('\\b' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(textos), `marca real en los textos: ${m}`));
  CORTAS.forEach((m) => check(!new RegExp('\\b' + m + '\\b').test(textos), `marca real en los textos: ${m}`));
  check(!/[—–]/.test(JSON.stringify(G.TEXTOS)), 'los textos tienen rayas largas');
})();

// Textos: cada clave que usa la lógica existe en datos.js (para traducir después)
(function () {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'logic.js'), 'utf8');
  const keys = new Set();
  (src.match(/['"`]((?:inc|log|msg|parte|need|req|bloq|cap|up|historia|res|sede|persona|equipo|pos|cat|rol|nivel|cons|ev|intl|taunt)\.[a-z0-9_.]+)['"`]/g) || [])
    .forEach((m) => keys.add(m.slice(1, -1)));
  Object.keys(G.INCIDENTS).forEach((k) => G.INCIDENTS[k].choices.forEach((c) => keys.add(c.k)));
  [...keys].filter((k) => !/\.$/.test(k)).forEach((k) => check(Object.prototype.hasOwnProperty.call(G.TEXTOS, k), `falta el texto ${k}`));
  // Traductor: los nombres se vuelven a armar
  G.setTraductor((k) => (k === 'rol.cablero.nombre' ? 'Cable assistant' : null));
  check(G.ROLES.cablero.name === 'Cable assistant', 'setTraductor no cambió los nombres');
  G.setTraductor(null);
  check(G.ROLES.cablero.name === G.TEXTOS['rol.cablero.nombre'], 'setTraductor(null) no volvió al español');
})();

// Avisos del día, capítulos completados por compra y nombre del local
(function () {
  const s = G.newGame(12);
  s.stats.events = 3; G.checkChapter(s); // capítulo 1 listo
  s.money = 20000; s.rep = 20;
  G.takeChapterDone(s);
  s.staff.push({ id: 991, name: 'A', role: 'sonidista', tier: 'junior', skill: 1, wage: 30, morale: 80, events: 0 }, { id: 992, name: 'B', role: 'tecnico_transmision', tier: 'junior', skill: 1, wage: 30, morale: 80, events: 0 });
  s.candidates = [{ id: 993, name: 'C', role: 'director', tier: 'junior', skill: 1, wage: 30, morale: 80, events: 0 }];
  const h = G.hire(s, 993);
  const b = G.buy(s, 'cam_basic');
  const done = G.takeChapterDone(s);
  check((h.chapterDone || b.chapterDone) && done.length === 1 && done[0].reward === 800, 'el capítulo completado al comprar o contratar debería quedar en la cola');
  s.staff.find((p) => p.id === 991).morale = 10;
  for (let i = 0; i < 6; i++) G.nextDay(s);
  const av = G.takeAvisos(s);
  check(av.some((a) => a.tipo === 'animo' || a.tipo === 'renuncia') && G.takeAvisos(s).length === 0, 'avisos: ánimo bajo o renuncia');
  const v = G.venue(s);
  check(v.name === G.dailyCostBreakdown(s).place && G.venueName(s) === v.name, 'un solo nombre para el local');
  // Rango esperado de calidad
  const c = s.contracts[0] || G.addContract(s);
  const q = G.computeQuality(s, c, s.staff, s.equip);
  check(q.rango && q.rango.min <= q.rango.esperado && q.rango.esperado <= q.rango.max, 'rango de calidad esperado');
})();

// Guardado v2 (roles viejos) → v3
(function () {
  const s = G.newGame(8);
  s.v = 2;
  s.staff[0].role = 'cam'; delete s.staff[0].tier;
  s.staff.push({ id: 700, name: 'D', role: 'dir', skill: 3, wage: 60, morale: 70, events: 12 }, { id: 701, name: 'S', role: 'stream', skill: 1, wage: 30, morale: 70, events: 2 });
  delete s.intlNext; delete s.avisos;
  const o = G.deserialize(JSON.stringify(s));
  check(o && o.v === G.SAVE_VERSION && o.staff[0].role === 'camarografo' && o.staff[1].role === 'director' && o.staff[2].role === 'tecnico_transmision', 'migración de roles viejos');
  check(o && o.staff.every((p) => G.TIERS[p.tier] && typeof p.eventos_nacionales === 'number') && o.staff[1].eventos_nacionales === 12, 'migración de niveles y experiencia');
  for (let i = 0; i < 10; i++) { G.nextDay(o); validState(o, 'partida v2'); }
})();

daysToWin.sort((a, b) => a - b);
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const medians = chapterDays.map(median);
console.log(`Partidas simuladas: ${GAMES} (máx ${MAX_DAYS} días cada una)`);
console.log(`Terminaron la historia: ${storyWins} · Quebraron: ${bankrupt}`);
console.log('Capítulo alcanzado (1..6, 7=ganó):', chapterReached.map((n, i) => `${i + 1}:${n}`).join(' '));
if (daysToWin.length) console.log(`Días para ganar: mínimo ${daysToWin[0]}, mediana ${daysToWin[Math.floor(daysToWin.length / 2)]}, máximo ${daysToWin[daysToWin.length - 1]}`);
console.log('Día mediano en que se completa cada capítulo:');
G.CHAPTERS.forEach((ch, i) => console.log(`  ${ch.title.padEnd(34)} día ${medians[i]}  (${chapterDays[i].length} partidas)` +
  (i ? `  +${medians[i] - medians[i - 1]} días` : '')));
const duelLoss = duelsLost / Math.max(1, duelsWon + duelsLost);
console.log(`Duelos contra MegaVisión: ganados ${duelsWon}, perdidos ${duelsLost} (pierde el ${(duelLoss * 100).toFixed(1)}%)`);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
console.log('Estrellas promedio por evento:');
starsByChapter.forEach((a, i) => console.log(`  ${(i < NCH ? G.CHAPTERS[i].title : 'Modo libre').padEnd(34)} ${avg(a).toFixed(2)}⭐  (${a.length} eventos)`));
const lateStars = avg([].concat(...starsByChapter.slice(2, NCH)));
console.log(`  Capítulos 3 a 6 juntos: ${lateStars.toFixed(2)}⭐`);

// Metas de dificultad (el juego gratis debe exigir, pero se puede terminar sin pagar)
const bankRate = bankrupt / GAMES, winRate = storyWins / GAMES;
const MIN_GAP = [0, 10, 10, 15, 15, 15];
medians.forEach((m, i) => {
  check(Number.isFinite(m), `capítulo ${i + 1}: sin mediana`);
  if (i > 0) check(m - medians[i - 1] >= MIN_GAP[i], `capítulo ${i + 1}: llega muy rápido tras el anterior (+${m - medians[i - 1]} días, mínimo ${MIN_GAP[i]})`);
});
check(medians[0] <= 10, `capítulo 1 debería ser rápido (mediana ${medians[0]})`);
check(medians[NCH - 1] >= 150 && medians[NCH - 1] <= 220, `la historia debería durar ~150-220 días (mediana ${medians[NCH - 1]})`);
check(bankRate >= 0.06 && bankRate <= 0.15, `quiebras fuera de rango (6-15%): ${(bankRate * 100).toFixed(1)}%`);
check(winRate >= 0.60 && winRate <= 0.85, `historia completada fuera de rango (60-85%): ${(winRate * 100).toFixed(1)}%`);
check(duelLoss >= 0.25, `el bot pierde muy pocos duelos (${(duelLoss * 100).toFixed(1)}%, mínimo 25%)`);
for (let i = 2; i < NCH; i++) {
  const a = avg(starsByChapter[i]);
  check(a >= 3.0 && a <= 3.9, `capítulo ${i + 1}: estrellas promedio fuera de rango (3,0-3,9): ${a.toFixed(2)}`);
}
check(lateStars >= 3.0 && lateStars <= 3.8, `estrellas promedio de los capítulos 3-6 fuera de rango (3,0-3,8): ${lateStars.toFixed(2)}`);
console.log(`Quiebras ${(bankRate * 100).toFixed(1)}% · historia completada ${(winRate * 100).toFixed(1)}%`);
console.log(`Contratos internacionales vistos: ${intlIds.size} · jugados por el bot: ${intlPlayed} · eventos con algún rol en rojo: ${(100 * crewStats.falta / Math.max(1, crewStats.events)).toFixed(1)}% · días sin trabajar: ${JSON.stringify(idle)}`);

if (errors) { console.error(`\n❌ ${errors} errores encontrados`); process.exit(1); }
console.log('\n✅ Lógica OK: sin errores');
