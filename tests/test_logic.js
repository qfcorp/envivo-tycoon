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
  // Contrato internacional sin la experiencia internacional que pide: el camino del juego (Game.ayudaIntl): contratar a un
  // candidato que ya la tiene, capacitar a alguien del equipo o buscar uno (lo que haría una persona con la plata que tiene)
  s.contracts.filter((c) => c.internacional).forEach((c) => {
    const reserve = 1200 + 3 * G.dailyCost(s);
    G.ayudaIntl(s, c).forEach((f) => {
      let n = f.falta;
      f.cand.forEach((id) => {
        const x = s.candidates.find((k) => k.id === id);
        if (n > 0 && x && s.money > x.wage * 2 + reserve && G.hire(s, id).ok) { n--; intlUso.contrato++; }
      });
      f.curso.forEach((o) => { if (n > 0 && s.money > o.costo + reserve && G.cursoIntl(s, o.id).ok) { n--; intlUso.curso++; } });
      if (n > 0 && f.disponible && !f.cand.length && s.money > f.buscar + reserve + 400 && G.searchStaffIntl(s, f.rol).ok) intlUso.busca++;
    });
  });
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
    if (c.internacional && s.money < (c.travelCost || 0)) continue;   // sin plata para el viaje, todavía no
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
  // Muestras para medir el plan de cámaras a mano (automático vs. pensado vs. malo): 1 de cada 29 eventos
  if (camMuestras.length < CAM_MAX && camCuenta++ % (s.storyDone ? 97 : 9) === 0) camMuestras.push({ st: G.serialize(s), id: best.c.id, staffIds: best.lo.staffIds.slice(), equipIds: best.lo.equipIds.slice(), ch: s.storyDone ? NCH : s.chapter });
  const r = G.startEvent(s, best.c.id, best.lo.staffIds, best.lo.equipIds);
  check(r.ok, 'startEvent falló: ' + r.msg);
  if (!r.ok) { G.nextDay(s); return; }
  const ev = s.currentEvent;
  check(ev.crewPlan && Array.isArray(ev.crewPlan.roles) && ev.cameraPlan && Array.isArray(ev.cameraPlan.positions), 'el evento no guardó los planes');
  crewStats.events++;
  crewStats.falta += ev.crewPlan.falta;
  let inc, guard = 0;
  while ((inc = G.currentIncident(s)) && guard++ < 14) {
    check(inc.choices.some((ch) => ch.ok), 'imprevisto sin ninguna opción disponible: ' + inc.text);
    check(typeof inc.k === 'string' && G.TEXTOS[inc.k] !== undefined, 'imprevisto sin clave de texto: ' + inc.key);
    // Imprevistos v2: el bot decide con lo que se ve (equipo, % de salir bien, costo, caja, momento), no "el primer botón"
    const ch = inc.choices[G.elegirOpcion(s, inc)];
    check(ch && ch.ok, 'elegirOpcion devolvió una opción no disponible: ' + inc.key);
    const rr = G.resolveIncident(s, ch.i);
    check(rr.ok && typeof rr.msg === 'string' && G.TEXTOS[rr.k] !== undefined, 'resolveIncident falló o sin clave de texto: ' + inc.key);
  }
  const chBefore = s.storyDone ? NCH : s.chapter;
  const f = G.finishEvent(s);
  check(f.ok && f.result.stars >= 1 && f.result.stars <= 5, 'finishEvent falló');
  if (f.ok) {
    starsByChapter[chBefore].push(f.result.stars);
    // Varios eventos por día: cuántos eventos se ven en pérdida (ganancia del evento - su parte de los gastos fijos)
    if (f.result.dia) {
      const cap = chBefore < 2 ? 'inicio' : chBefore < NCH ? 'historia' : 'libre';
      verPerdida[cap] = verPerdida[cap] || [0, 0, 0]; verPerdida[cap][0]++;
      if (f.result.net - f.result.dia.parte < 0) verPerdida[cap][1]++;
      if (f.result.net - f.result.dailyCost < 0) verPerdida[cap][2]++; // como se veía antes (todo el gasto del día en un evento)
      check(f.result.dia.parte >= 0 && f.result.dia.n >= 1 && f.result.dia.n <= G.BALANCE.dia.franjas, 'resultado: turno del día inválido');
    }
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
const evPorDia = []; // eventos por día durante la historia
const verPerdida = {}; // { inicio | historia | libre: [eventos, en pérdida con su parte, en pérdida con todo el gasto del día] }
const intlIds = new Set();
const idle = { descanso: 0, sinOferta: 0, noRinde: 0, falta: 0 }; // por qué el bot no trabajó
const faltaRol = {};
let intlSeen = 0, intlPlayed = 0;
const intlUso = { curso: 0, busca: 0, contrato: 0 };
const camMuestras = [];
let camCuenta = 0;
const CAM_MAX = Number(process.env.CAM_MAX) || 400;

const GAMES = Number(process.env.GAMES) || 400, MAX_DAYS = 400, SEED = Number(process.env.SEED) || 1000;
const NCH = G.CHAPTERS.length;
const starsByChapter = G.CHAPTERS.map(() => []).concat([[]]); // índice NCH = modo libre
let storyWins = 0, bankrupt = 0, bankruptStory = 0, daysToWin = [], chapterReached = new Array(NCH + 1).fill(0);
const chapterDays = G.CHAPTERS.map(() => []);
let rivalSeen = 0, rivalEarly = 0, duelsWon = 0, duelsLost = 0;
const bankruptAt = []; // cuándo quiebra el bot
for (let g = 0; g < GAMES; g++) {
  const s = G.newGame(SEED + g);
  validState(s, `partida ${g} inicio`);
  let winDay = null, lastCh = s.chapter;
  const evDia = { ev: 0, dias: 0 };
  for (let t = 0; s.day <= MAX_DAYS && !s.gameOver && t < MAX_DAYS * 4; t++) { // cada vuelta: un evento o cerrar el día
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
    if (!s.storyDone) { evDia.ev = s.stats.events; evDia.dias = s.day; }
    if (s.storyDone && winDay === null) { winDay = s.day; chapterDays[NCH - 1].push(s.day); lastCh = NCH; }
  }
  // Guardar y cargar
  const copy = G.deserialize(G.serialize(s));
  check(copy && copy.money === s.money && copy.day === s.day, `partida ${g}: guardar/cargar no coincide`);
  if (winDay) { storyWins++; daysToWin.push(winDay); }
  if (evDia.dias) evPorDia.push(evDia.ev / evDia.dias);
  if (s.gameOver) { bankrupt++; if (!s.storyDone) bankruptStory++; bankruptAt.push({ day: s.day, ch: s.storyDone ? NCH : s.chapter, ev: s.stats.events }); }
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

/* ---------- Varios eventos por día (v4) ---------- */
(function () {
  const jugar = (s, c) => {
    const r = G.startEvent(s, c.id, [s.staff[0].id], [s.equip[0].id]);
    check(r.ok, 'varios eventos: no se pudo iniciar ' + r.msg);
    let inc; while ((inc = G.currentIncident(s))) G.resolveIncident(s, inc.choices.find((x) => x.ok).i);
    return G.finishEvent(s).result;
  };
  const s = G.newGame(4242);
  const d0 = s.day, m0 = s.money, dc = G.dailyCost(s);
  check(G.turnoDia(s).n === 0 && G.turnoDia(s).libres === 3 && G.turnoDia(s).turno === 0 && G.turnoDia(s).parte === null, 'turnoDia al empezar');
  const r1 = jugar(s, s.contracts[0]);
  check(s.day === d0 && !r1.dia.cerrado && r1.dia.n === 1 && r1.dia.parte === dc && r1.dia.conOtro === Math.round(dc / 2), `1er evento: el día no avanza (${s.day}) y le toca todo el gasto (${JSON.stringify(r1.dia)})`);
  check(s.money === m0 + r1.payNow - r1.wages - (r1.transporte ? r1.transporte.total : 0) + (r1.chapterDone ? r1.chapterDone.reward : 0), 'sin cerrar el día no se cobran los gastos fijos');
  const r2 = jugar(s, s.contracts[0]);
  check(s.day === d0 && r2.dia.n === 2 && r2.dia.turno === 1 && r2.dia.parte === Math.round(dc / 2) && r2.dia.conOtro === Math.round(dc / 3), `2º evento: mismo día, la parte baja a la mitad (${JSON.stringify(r2.dia)})`);
  check(G.turnoDia(s).n === 2 && G.turnoDia(s).libres === 1 && G.turnoDia(s).turno === 2, 'turnoDia después de 2 eventos (queda la noche)');
  // Cerrar el día: se cobra una vez y queda el resumen
  const m1 = s.money, gHoy = G.dailyCost(s);
  G.nextDay(s);
  const rd = G.takeResumenDia(s);
  check(s.day === d0 + 1 && rd && rd.eventos === 2 && rd.dia === d0 && rd.gastos === gHoy && rd.ganancia === r1.net + r2.net && rd.resultado === rd.ganancia - rd.gastos && rd.lista.length === 2,
    `resumen del día (${JSON.stringify(rd)})`);
  check(m1 - s.money <= gHoy && G.takeResumenDia(s) === null && G.turnoDia(s).n === 0, 'cerrar el día cobra una vez y el resumen se entrega una vez');
  // El 3er evento del día cierra el día solo
  const t = G.newGame(4343); t.stats.events = 5; t.contracts = [];
  for (let i = 0; i < 3; i++) { const c = G.addContract(t, 'misa'); c.stream = false; c.outdoor = false; c.cams = 1; }
  const dt = t.day;
  jugar(t, t.contracts[0]); jugar(t, t.contracts[0]);
  const r3 = jugar(t, t.contracts[0]);
  check(r3.dia.cerrado && r3.dia.n === 3 && t.day === dt + 1 && r3.dia.parte === Math.round(r3.dia.gastos / 3) && r3.dia.conOtro === null, `el 3er evento cierra el día (${JSON.stringify(r3.dia)})`);
  check(G.takeResumenDia(t).eventos === 3, 'resumen con los 3 eventos');
  // Los eventos grandes ocupan el día entero
  check(G.jornadaCompleta({ type: 'concierto' }) && G.jornadaCompleta({ type: 'final' }) && G.jornadaCompleta({ type: 'misa', internacional: true }) && !G.jornadaCompleta({ type: 'boda', diff: 2 }) && !G.jornadaCompleta({ type: 'lanzamiento' }),
    'jornada completa: dificultad 4+ e internacionales');
  const j = G.newGame(4444); j.stats.events = 5; j.rep = 40; j.contracts = [];
  const cj = G.addContract(j, 'concierto'); const dj = j.day;
  const rj = jugar(j, cj);
  check(rj.dia.jornada && rj.dia.cerrado && j.day === dj + 1, 'un concierto cierra el día');
  // Intento en línea: igual que antes (el evento ocupa el día y no hay turnos)
  const I = require('../server/validador/intento.js');
  const it = I.jugar(G, { seed: 77, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }], equip: [{ type: 'cam_basic', condition: 90 }] }, contrato: { type: 'misa' } }, (inc) => inc.choices.find((x) => x.ok).i);
  check(it.completo && it.completo.dia === undefined, 'intento en línea: el resultado no trae turnos');
  const est = I.crearEstado(G, { seed: 77, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }], equip: [{ type: 'cam_basic', condition: 90 }] }, contrato: { type: 'misa' } }).s;
  G.startEvent(est, est.contracts[0].id, est.staff.map((p) => p.id), est.equip.map((e) => e.id));
  let inc; while ((inc = G.currentIncident(est))) G.resolveIncident(est, inc.choices.find((x) => x.ok).i);
  G.finishEvent(est);
  check(est.day === 2 && !est.resumenDia, 'intento en línea: el día avanza como antes');
  // Partida v3 (sin turnos) carga bien
  const v3 = JSON.parse(G.serialize(G.newGame(4545))); v3.v = 3; delete v3.hoy; delete v3.resumenDia;
  const o3 = G.deserialize(JSON.stringify(v3));
  check(o3 && o3.v === G.SAVE_VERSION && o3.hoy && o3.hoy.n === 0 && o3.hoy.dia === o3.day && G.turnoDia(o3).libres === 3, 'partida v3: arranca el día sin eventos hechos');
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


/* ---------- QA4: quiebra con aviso, textos traducibles, partida de demostración ---------- */
(function () {
  // Quiebra: cuentan los cobros que llegan pronto (no quiebras si el cliente te debe lo suficiente)
  const a = G.newGame(21); a.stats.events = 20;
  a.money = G.bankruptLimit(a) - 50; a.pending = [{ day: a.day + 2, amount: 900, client: 'Debe' }];
  G.nextDay(a);
  check(!a.gameOver && a.redDays === 0, `con un cobro pendiente grande no deberías quebrar (${a.money}, ${a.redDays})`);
  // Sin cobros: días de gracia con aviso, y recién después la quiebra
  const b = G.newGame(22); b.stats.events = 20; G.takeAvisos(b);
  b.money = G.bankruptLimit(b) - 400;
  G.nextDay(b);
  const av1 = G.takeAvisos(b);
  check(!b.gameOver && av1.some((x) => x.tipo === 'quiebra_aviso' && x.k === 'log.quiebra_aviso' && x.p.n === 2), 'primer día bajo el límite: aviso con 2 días de gracia');
  check(G.bankruptInfo(b).enPeligro && G.bankruptInfo(b).graceLeft === 2, 'bankruptInfo: en peligro con 2 días');
  G.nextDay(b);
  check(!b.gameOver && G.takeAvisos(b).some((x) => x.k === 'log.quiebra_aviso1'), 'segundo día: último aviso');
  G.nextDay(b);
  check(b.gameOver && G.takeAvisos(b).some((x) => x.tipo === 'quiebra'), 'tercer día bajo el límite: quiebra');
  // Si te recuperas, el contador vuelve a 0
  const c = G.newGame(23); c.stats.events = 20; c.money = G.bankruptLimit(c) - 100; G.nextDay(c);
  check(c.redDays === 1, 'redDays cuenta los días en peligro'); c.money = 2000; G.nextDay(c);
  check(c.redDays === 0 && !c.gameOver, 'al salir del rojo se reinician los días de gracia');
  // El límite crece con los gastos diarios
  const big = G.newGame(24);
  for (let i = 0; i < 9; i++) big.staff.push({ id: 700 + i, name: 'X', role: 'camarografo', tier: 'senior', skill: 3, wage: 120, morale: 80, events: 0 });
  for (let i = 0; i < 18; i++) big.equip.push({ id: 750 + i, type: 'cam_cine', condition: 100 });
  check(G.bankruptLimit(big) < G.bankruptLimit(G.newGame(1)) && G.bankruptLimit(G.newGame(1)) === G.BALANCE.bankruptAt, `el límite de quiebra debería crecer con los gastos (${G.bankruptLimit(big)})`);
  // 1 estrella paga poco (salvo mientras aprendes) y una racha de 1 estrella baja los pagos
  const p = G.newGame(25); const k = { diff: 1 };
  check(G.payMult(k, 1, p) === G.BALANCE.learn.pay1 && G.payMult(k, 3, p) === 1, 'mientras aprendes, 1 estrella paga como antes');
  p.stats.events = 30;
  check(G.payMult(k, 1, p) <= 0.15 && G.payMult({ diff: 4 }, 1, p) <= 0.15, `1 estrella debería pagar poco (${G.payMult(k, 1, p)})`);
  const f0 = G.payFactor(p, 1); p.recentStars = [1, 1, 1, 1, 1, 1];
  check(G.payFactor(p, 1) < f0 * 0.7, 'una racha de eventos con 1 estrella baja lo que pagan los clientes');
  p.recentStars = []; p.rep = 0;
  check(G.payFactor(p, 1) < G.payFactor(G.newGame(1), 1), 'con 0 de fama pagan menos que al empezar');
  // Las ofertas de la historia: la fama casi no suma exigencia
  const h = G.newGame(26); h.rep = 90; h.stats.events = 40;
  const so = G.addContract(h, 'lanzamiento', 1, { story: true }), no = G.addContract(h, 'lanzamiento');
  const fama = (q) => (q.parts.find((x) => x[2] === 'parte.fama') || [0, 0])[1];
  check(fama(G.computeQuality(h, so, h.staff, h.equip)) >= -G.BALANCE.expectStoryCap && fama(G.computeQuality(h, no, h.staff, h.equip)) < -15,
    'en la historia la fama no debería restar más de expectStoryCap');
  // Nombres del dueño y de la cámara de Don Ramiro: salen de su clave (también en partidas viejas)
  const n = G.newGame(27);
  check(n.equip[0].starter === true && G.equipName(n.equip[0]) === G.TEXTOS['equipo.camara_ramiro'] && G.staffName(n.staff[0]) === G.TEXTOS['persona.duenio'], 'nombres del dueño y de la cámara inicial');
  const viejo = JSON.parse(G.serialize(n)); delete viejo.equip[0].starter; viejo.staff[0].name = 'Tú (dueño)';
  const nv = G.deserialize(JSON.stringify(viejo));
  check(nv && nv.equip[0].starter === true, 'deserialize marca la cámara de Don Ramiro de una partida vieja');
  G.setTraductor((key) => (key === 'persona.duenio' ? 'You (owner)' : key === 'equipo.camara_ramiro' ? "Don Ramiro's camera" : key === 'up.habilidad_duenio' ? 'You reached skill {n}' : null));
  check(G.staffName(nv.staff[0]) === 'You (owner)' && G.equipName(nv.equip[0]) === "Don Ramiro's camera", 'los nombres cambian con el idioma');
  check(G.tx('log.subio', { texto: { k: 'up.habilidad_duenio', p: { n: 3 } } }) === G.TEXTOS['log.subio'].replace('{texto}', 'You reached skill 3'), 'un parámetro con clave se traduce al armar el texto');
  G.setTraductor(null);
  check(!/\{|oferta\(s\)/.test(G.tx('log.vencieron', { n: 1 })), 'vencieron: sin "oferta(s)"');
  check(G.paisNombre({ pais: 'España' }) === G.TEXTOS['pais.espana'], 'país con clave');
  // Partida de demostración: capítulo 4 con duelo y oferta internacional, armada con las reglas
  const d = G.demoGame('cap4');
  check(d && d.chapter === 3 && !d.gameOver && d.contracts.some((x) => x.rival && typeof x.rivalQuality === 'number') && d.contracts.some((x) => x.internacional),
    'demo cap4: capítulo 4 con un duelo y una oferta internacional');
  if (d) {
    validState(d, 'demo');
    check(d.staff.length >= 7 && d.equip.length >= 10 && d.money > 1500 && d.contracts.length <= G.BALANCE.maxContracts, `demo cap4: personal, equipos y dinero razonables (${d.staff.length}, ${d.equip.length}, ${d.money})`);
    const dd = G.deserialize(G.serialize(d));
    check(dd && dd.chapter === 3 && dd.money === d.money, 'demo cap4: se guarda y se carga');
    check(JSON.stringify(G.demoGame('cap4')) === JSON.stringify(d), 'demo cap4: siempre sale igual');
  }
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
    t.positions.forEach((p) => check(G.TEXTOS[`pos.${t.posDe || k}.${p[0]}`] && G.TEXTOS[`pos.${t.posDe || k}.${p[0]}.ideal`], `evento ${k}: posición ${p[0]} sin texto`)); // posDe: usa las de otro evento (temporadas)
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
  const n = Object.keys(G.CATALOG).filter((k) => !G.CATALOG[k].exclusivo).length;   // sin la Edición Exclusiva (una por categoría)
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
if (bankruptAt.length) console.log('  Quiebras por capítulo (1..6, 7=modo libre):', G.CHAPTERS.map((c, i) => i).concat([NCH]).map((i) => `${i + 1}:${bankruptAt.filter((b) => b.ch === i).length}`).join(' '), '· día mediano', median(bankruptAt.map((b) => b.day)));
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

// Economía (QA4): trabajar mal no debe rendir más que armar una productora de verdad
// "Solo, siempre 1 estrella": el dueño solo con la cámara inicial toma la oferta que más paga y elige siempre lo peor
function soloTurn(s) {
  const own = s.staff.find((p) => p.owner), cam = s.equip[0];
  const c = s.contracts.filter((x) => !x.internacional).sort((x, y) => y.pay - x.pay)[0];
  if (!c || !G.startEvent(s, c.id, [own.id], [cam.id]).ok) { G.nextDay(s); return; }
  let inc, guard = 0;
  // Imprevistos v2: el orden se baraja; "lo peor" es la opción disponible que menos vale
  while ((inc = G.currentIncident(s)) && guard++ < 10) { const en = inc.choices.filter((x) => x.ok); G.resolveIncident(s, en.reduce((a, b) => (b.valor < a.valor ? b : a), en[0]).i); }
  G.finishEvent(s);
}
const ECO = 60;
const cashAt = (turn, seed, days) => {
  const s = G.newGame(seed); const out = {};
  while (s.day <= days && !s.gameOver) { turn(s); if ([30, 45, 60, 90, 120].includes(s.day)) out[s.day] = out[s.day] === undefined ? s.money : out[s.day]; }
  out.fin = s.money; out.over = s.gameOver; out.stars = s.stats.events ? s.stats.fiveStars : 0;
  return out;
};
const soloRuns = [], botRuns = [];
for (let g = 0; g < ECO; g++) { soloRuns.push(cashAt(soloTurn, 9000 + g, 60)); botRuns.push(cashAt(botTurn, 9000 + g, 120)); }
const medOf = (runs, k) => median(runs.map((r) => (typeof r[k] === 'number' ? r[k] : r.over ? -1000 : r.fin)));
const soloEnd = medOf(soloRuns, 'fin'), bot60 = medOf(botRuns, 60), bot30 = medOf(botRuns, 30), bot90 = medOf(botRuns, 90), bot120 = medOf(botRuns, 120);
console.log(`Economía (${ECO} partidas): solo con 1 estrella, caja al día 60 ${soloEnd} · productora del bot: día 30 ${bot30}, día 60 ${bot60}, día 90 ${bot90}, día 120 ${bot120}`);
check(soloEnd < bot60, `trabajar solo y mal (caja ${soloEnd}) no debería ganarle a una productora de verdad a los 60 días (${bot60})`);
check(soloEnd < G.BALANCE.start.money * 2.5, `solo con 1 estrella no debería multiplicar la caja (${soloEnd})`);
check(bot60 > G.BALANCE.start.money && bot90 > bot30 && bot120 > bot60, `una productora que trabaja bien debería crecer en caja (${bot30} → ${bot60} → ${bot90} → ${bot120})`);

// Metas de dificultad (el juego gratis debe exigir, pero se puede terminar sin pagar)
// Las quiebras se miden durante la historia: en el modo libre (después del día ~100) el bot no achica la productora
// cuando bajan los contratos grandes y a veces se funde hacia el día 300; eso se reporta aparte.
const bankRate = bankruptStory / GAMES, winRate = storyWins / GAMES, bankFree = (bankrupt - bankruptStory) / GAMES;
// Ni muy rápido ni un muro (QA4: el capítulo 3 era un muro para jugadores reales): días entre capítulos
// v4 (varios eventos por día, 23 oct 2026): el bot hace ~1,6 eventos por día y los capítulos que no esperan una oferta
// de la historia llegan antes en días (cap. 2: +9, cap. 4: +14). Los mínimos se bajaron a propósito (ver PLAN.md, Bitácora).
const MIN_GAP = [0, 6, 10, 10, 15, 15];
const MAX_GAP = [10, 25, 22, 28, 30, 32];
medians.forEach((m, i) => {
  check(Number.isFinite(m), `capítulo ${i + 1}: sin mediana`);
  if (i > 0) check(m - medians[i - 1] >= MIN_GAP[i], `capítulo ${i + 1}: llega muy rápido tras el anterior (+${m - medians[i - 1]} días, mínimo ${MIN_GAP[i]})`);
  if (i > 0) check(m - medians[i - 1] <= MAX_GAP[i], `capítulo ${i + 1}: es un muro (+${m - medians[i - 1]} días, máximo ${MAX_GAP[i]})`);
});
check(medians[0] <= 10, `capítulo 1 debería ser rápido (mediana ${medians[0]})`);
// El bot juega mejor que una persona (QA4: una persona cuidadosa tarda más): para el bot, ~70-130 días
// (v4: con varios eventos por día la historia se acorta en días: antes ~104, ahora ~84; los eventos son los mismos)
check(medians[NCH - 1] >= 70 && medians[NCH - 1] <= 130, `la historia debería durar ~70-130 días para el bot (mediana ${medians[NCH - 1]})`);
// v4 (26 oct 2026, varios eventos por día): antes (main) historia ~4,8% y modo libre ~28%; ahora historia ~3% y modo
// libre ~8-10% (1 oferta segura por día y la exigencia de la fama más suave en eventos chicos y con tope).
// Los topes se bajaron a propósito (ver PLAN.md, Bitácora).
check(bankRate >= 0.01 && bankRate <= 0.07, `quiebras durante la historia fuera de rango (1-7%): ${(bankRate * 100).toFixed(1)}%`);
check(bankFree <= 0.15, `demasiadas quiebras en el modo libre (máx. 15% en 400 días): ${(bankFree * 100).toFixed(1)}%`);
check(winRate >= 0.85, `historia completada fuera de rango (85% o más): ${(winRate * 100).toFixed(1)}%`);
check(duelLoss >= 0.25, `el bot pierde muy pocos duelos (${(duelLoss * 100).toFixed(1)}%, mínimo 25%)`);
for (let i = 2; i < NCH; i++) {
  const a = avg(starsByChapter[i]);
  // v4: el tope sube de 3,9 a 4,1 a propósito: una productora famosa ya no saca 1-2 estrellas en cada evento chico
  // (el dueño: "fácil y nunca frustrante"); los capítulos 5 y 6 quedan en ~4,0
  check(a >= 3.0 && a <= 4.1, `capítulo ${i + 1}: estrellas promedio fuera de rango (3,0-4,1): ${a.toFixed(2)}`);
}
check(lateStars >= 3.0 && lateStars <= 3.95, `estrellas promedio de los capítulos 3-6 fuera de rango (3,0-3,95): ${lateStars.toFixed(2)}`);
// Lo que pidió el dueño: que casi todos los eventos no se vean en pérdida (ganancia del evento - su parte de los gastos fijos)
const pierde = (k) => (verPerdida[k] ? verPerdida[k][1] / verPerdida[k][0] : 0);
check(pierde('inicio') <= 0.08 && pierde('historia') <= 0.15, `demasiados eventos en pérdida con su parte de los gastos (inicio ${(100 * pierde('inicio')).toFixed(1)}%, máx. 8% · historia ${(100 * pierde('historia')).toFixed(1)}%, máx. 15%)`);
console.log('Eventos que se ven en pérdida (ganancia del evento - su parte de los gastos del día) · antes (todo el gasto del día en el evento):',
  Object.keys(verPerdida).map((k) => `${k} ${(100 * verPerdida[k][1] / verPerdida[k][0]).toFixed(1)}% · antes ${(100 * verPerdida[k][2] / verPerdida[k][0]).toFixed(1)}%`).join(' | '));
console.log(`Eventos por día (mediana por partida, hasta el fin de la historia o la quiebra): ${median(evPorDia).toFixed(2)}`);
console.log(`Quiebras durante la historia ${(bankRate * 100).toFixed(1)}% · en modo libre ${(bankFree * 100).toFixed(1)}% · historia completada ${(winRate * 100).toFixed(1)}%`);
check(intlUso.curso + intlUso.busca + intlUso.contrato > 0 && intlPlayed > 0, `el bot nunca usó el camino del personal internacional (curso/búsqueda) o nunca jugó un internacional: ${JSON.stringify(intlUso)} · jugados ${intlPlayed}`);
console.log(`Personal internacional del bot: ${intlUso.curso} capacitaciones · ${intlUso.busca} búsquedas · ${intlUso.contrato} contratados con experiencia internacional`);
console.log(`Contratos internacionales vistos: ${intlIds.size} · jugados por el bot: ${intlPlayed} · eventos con algún rol en rojo: ${(100 * crewStats.falta / Math.max(1, crewStats.events)).toFixed(1)}% · días sin trabajar: ${JSON.stringify(idle)}`);

/* ---------- Plan de cámaras a mano (28-oct): automático vs. un plan pensado vs. uno malo ----------
   Con las muestras de las partidas del bot (el equipo que llevó): el plan pensado se busca moviendo cámaras y
   operadores de a uno mientras la calidad sube (lo que haría una persona que conoce los combos); el malo, moviéndolas
   mientras baja sin dejar cámaras en la bodega. Pedido del dueño: el automático "decente", uno pensado claramente
   mejor (+5 a +15 %), uno malo claramente peor. */
// Calidad base sin el tope de 100 (en el modo libre muchos eventos llegan a 100 y no se vería la diferencia)
const crudo = (cq) => cq.parts.reduce((a, p) => a + p[1], 0);
// Cámaras libres: sitios a probar para la cámara de una toma (la marca sugerida, más cerca de lo que filma, a los lados;
// para el plan malo, también del otro lado y lejos). El validador descarta los que no se pueden (cancha, escenario...).
function sitiosToma(g, key, malo) {
  const m = g && g.marcas.find((x) => x.key === key);
  if (!m || m.kind === 'aereo') return [];
  const tx = m.tx * 100 / g.W, ty = m.ty * 100 / g.H;
  const out = [];
  const add = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x <= 100 && y >= 0 && y <= 100 && !out.some((p) => p[0] === x && p[1] === y)) out.push([x, y]); };
  [0.3, 0.5, 0.65].forEach((u) => add(m.nx + u * (tx - m.nx), m.ny + u * (ty - m.ny)));
  add(m.nx + 6, m.ny); add(m.nx - 6, m.ny); add(m.nx, m.ny + 6); add(m.nx, m.ny - 6);
  if (malo) { add(2 * tx - m.nx, 2 * ty - m.ny); add(m.nx + (m.nx < 50 ? 40 : -40), m.ny); add(m.nx, m.ny + (m.ny < 50 ? 40 : -40)); }
  return out;
}
function buscarPlan(s, c, staffIds, equipIds, signo, sinQuitar) {
  const staff = s.staff.filter((p) => staffIds.includes(p.id)), equip = s.equip.filter((e) => equipIds.includes(e.id));
  const q = (col) => crudo(G.computeQuality(s, c, staff, equip, col));
  const auto = G.cameraPlan(s, c, equipIds, staffIds);
  const geo = G.camGeo(c);
  const posKeys = auto.positions.map((p) => p.key);
  const cams = auto.camaras;
  let col = auto.colocacion.map((x) => Object.assign({}, x));
  let mejor = q(col);
  const valida = (k) => G.validarColocacion(s, c, equipIds, staffIds, k).ok;
  const opsDe = (rol) => staff.filter((p) => G.canonRole(p.role) === rol).map((p) => p.id);
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    let mejorK = null, mejorQ = mejor;
    const probar = (k) => { if (!valida(k)) return; const v = q(k); if (signo * (v - mejorQ) > 0) { mejorQ = v; mejorK = k; } };
    cams.forEach((cm) => {
      const de = col.find((x) => x.e === cm.equipId);
      posKeys.forEach((pk) => {
        if (de && de.p === pk) return;
        const k = col.map((x) => Object.assign({}, x));
        const ocupa = k.find((x) => x.p === pk);
        const yo = k.find((x) => x.e === cm.equipId);
        if (yo) { if (ocupa) { ocupa.p = yo.p; delete ocupa.x; delete ocupa.y; } yo.p = pk; delete yo.x; delete yo.y; } else {
          if (ocupa && sinQuitar) return;
          if (ocupa) k.splice(k.indexOf(ocupa), 1);
          k.push({ p: pk, e: cm.equipId });
        }
        probar(k);
      });
      if (de && !sinQuitar) probar(col.filter((x) => x !== de).map((x) => Object.assign({}, x)));
      // Mover la cámara dentro del plano (cámaras libres)
      if (de) sitiosToma(geo, de.p, signo < 0).forEach(([x, y]) => { const k = col.map((z) => Object.assign({}, z)); const yo = k.find((z) => z.e === cm.equipId); yo.x = x; yo.y = y; probar(k); });
    });
    // Operadores: cambiar dos de lugar o poner a uno que no está en ninguna cámara
    ['camarografo', 'operador_ptz'].forEach((rol) => {
      const ids = opsDe(rol);
      col.forEach((a, i) => {
        ids.forEach((id) => {
          if (a.o === id) return;
          const k = col.map((x) => Object.assign({}, x));
          const otro = k.find((x) => x.o === id);
          if (otro && rol === 'camarografo') otro.o = a.o;
          k[i].o = id;
          probar(k);
        });
      });
    });
    if (!mejorK) break;
    col = mejorK; mejor = mejorQ;
  }
  return { q: mejor, col };
}
if (process.env.CAM_DUMP) require('fs').writeFileSync(process.env.CAM_DUMP, JSON.stringify(camMuestras));
const camRes = [];
camMuestras.forEach((m) => {
  const s = G.deserialize(m.st);
  const c = s && s.contracts.find((x) => x.id === m.id);
  if (!c) return;
  const staff = s.staff.filter((p) => m.staffIds.includes(p.id)), equip = s.equip.filter((e) => m.equipIds.includes(e.id));
  const auto = crudo(G.computeQuality(s, c, staff, equip));
  const plan = G.cameraPlan(s, c, m.equipIds, m.staffIds);
  check(G.validarColocacion(s, c, m.equipIds, m.staffIds, plan.colocacion).ok, 'la colocación del automático no es válida');
  check(crudo(G.computeQuality(s, c, staff, equip, plan.colocacion)) === auto, 'la colocación del automático, puesta a mano, no da lo mismo');
  const multi = plan.camaras.length >= 2 && plan.positions.length >= 2;
  const bp = buscarPlan(s, c, m.staffIds, m.equipIds, 1);
  const bueno = bp.q;
  const malo = multi ? buscarPlan(s, c, m.staffIds, m.equipIds, -1, true).q : auto;
  // El plan pensado se vuelve a validar (con las cámaras movidas) y da lo mismo que en la búsqueda
  check(G.validarColocacion(s, c, m.equipIds, m.staffIds, bp.col).ok && crudo(G.computeQuality(s, c, staff, equip, bp.col)) === bueno, 'el plan pensado (cámaras movidas) no se valida igual');
  camRes.push({ ch: m.ch, multi, auto, bueno, malo, tipo: c.type, cams: c.cams || 1, movidas: bp.col.filter((x) => x.x !== undefined).length });
  if (process.env.CAM_VER && multi && camRes.length % 7 === 0) console.log(c.type, auto, bueno, malo, JSON.stringify(plan.positions.map((p) => [p.key, p.perfil, p.asignado, p.ajuste, p.razones.map((x) => x.texto + ' ' + x.pct).join('; ')])), JSON.stringify(plan.camaras.map((x) => x.tipo + '@' + x.en)));
});
const pct = (a, b) => (b ? (100 * (a - b)) / b : 0);
const camMulti = camRes.filter((r) => r.multi);
const fx = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
console.log(`Plan de cámaras a mano (${camRes.length} muestras, ${camMulti.length} con 2+ cámaras): calidad base mediana automático ${median(camMulti.map((r) => r.auto))} · pensado ${median(camMulti.map((r) => r.bueno))} · malo ${median(camMulti.map((r) => r.malo))}`);
console.log(`  pensado vs. automático: mediana ${fx(median(camMulti.map((r) => pct(r.bueno, r.auto))))}% (puntos ${fx(median(camMulti.map((r) => r.bueno - r.auto)))}) · malo vs. automático: mediana ${fx(median(camMulti.map((r) => pct(r.malo, r.auto))))}% (puntos ${fx(median(camMulti.map((r) => r.malo - r.auto)))})`);
console.log('  por capítulo (pensado / malo vs. automático, %):', G.CHAPTERS.map((ch, i) => i).concat([NCH]).map((i) => {
  const rs = camMulti.filter((r) => r.ch === i);
  return rs.length ? `${i + 1}: ${fx(median(rs.map((r) => pct(r.bueno, r.auto))))} / ${fx(median(rs.map((r) => pct(r.malo, r.auto))))} (${rs.length})` : `${i + 1}: -`;
}).join(' · '));
// Lo que se exige, en los eventos de 3 cámaras o más (en uno de 2 cámaras con 2 posiciones fijas casi no hay qué decidir)
const cam3 = camMulti.filter((r) => r.cams >= 3);
console.log(`  cámaras libres: en ${camMulti.filter((r) => r.movidas).length} de ${camMulti.length} planes pensados conviene mover alguna cámara fuera de su marca`);
console.log(`  eventos de 3+ cámaras (${cam3.length}): pensado ${fx(median(cam3.map((r) => pct(r.bueno, r.auto))))}% · malo ${fx(median(cam3.map((r) => pct(r.malo, r.auto))))}% · de 2 cámaras (${camMulti.length - cam3.length}): pensado ${fx(median(camMulti.filter((r) => r.cams < 3).map((r) => pct(r.bueno, r.auto))))}%`);
if (cam3.length >= 20) {
  const gan = median(cam3.map((r) => pct(r.bueno, r.auto))), pierde2 = median(camMulti.map((r) => pct(r.malo, r.auto)));
  check(camRes.every((r) => r.bueno >= r.auto), 'el plan pensado salió peor que el automático');
  check(gan >= 5 && gan <= 15, `un plan de cámaras pensado debería rendir +5 a +15 % sobre el automático en los eventos de 3+ cámaras (mediana ${gan.toFixed(1)}%)`);
  check(pierde2 <= -10, `un plan de cámaras malo debería rendir claramente menos que el automático (mediana ${pierde2.toFixed(1)}%, máximo -10%)`);
}

/* ---------- Cámaras libres (28-oct): mover cada cámara a cualquier sitio del plano ---------- */
(function () {
  const s = G.newGame(31);
  s.equip = s.equip.filter((e) => !e.starter);
  const nid = () => { s.idc = (s.idc || 0) + 1; return s.idc; };
  const eq = (t) => { const e = { id: nid(), type: t, condition: 95 }; s.equip.push(e); return e.id; };
  ['cam_blackmagia_urso_broadcast_g3', 'lente_kanon_kx21x8_2', 'cam_zony_hxr_mk2500', 'cam_zony_hxr_mk2500', 'cam_cine', 'cam_basic', 'dron_basico', 'sw_vmax_pro_pc', 'audio_pro', 'encoder']
    .forEach((t) => { if (G.CATALOG[t]) eq(t); });
  ['camarografo', 'camarografo', 'camarografo', 'camarografo', 'director', 'sonidista', 'tecnico_transmision', 'piloto_dron'].forEach((role, i) => s.staff.push({ id: nid(), name: 'P' + i, role, skill: 3 + (i % 2), tier: 'junior', wage: 50, morale: 90, events: 5 }));
  const eqIds = s.equip.map((e) => e.id), stIds = s.staff.map((p) => p.id);
  const q = (c, col) => crudo(G.computeQuality(s, c, s.staff, s.equip, col));
  // Todas las tomas de todos los eventos tienen su marca de piso (dentro del plano) y hacia dónde mira
  Object.keys(G.EVENT_TYPES).forEach((t) => {
    const c = { type: t, cams: 8 };
    const g = G.camGeo(c);
    const pl = G.cameraPlan(s, c, eqIds, stIds);
    check(g && pl.positions.every((p) => g.marcas.some((m) => m.key === p.key && m.nx >= 0 && m.nx <= 100 && m.ny >= 0 && m.ny <= 100 && typeof m.tx === 'number' && m.kind)), `cámaras libres: a ${t} le falta la marca de alguna toma`);
    check(pl.positions.every((p) => typeof p.toma === 'string' && p.toma.length && !/^toma\./.test(p.toma)), `cámaras libres: a ${t} le falta el nombre corto de alguna toma`);
    // En su marca (con coordenadas) rinde exactamente lo mismo que sin coordenadas
    const conXY = pl.colocacion.map((x) => { const m = g.marcas.find((z) => z.key === x.p); return Object.assign({}, x, { x: m.nx, y: m.ny }); });
    check(G.validarColocacion(s, c, eqIds, stIds, conXY).ok && q(c, conXY) === q(c, pl.colocacion), `cámaras libres: en ${t}, una cámara en su marca no rinde lo mismo`);
  });
  // Graduación: la cámara de las reacciones más cerca de las familias rinde más; detrás de una columna, menos (y ✗)
  const gr = G.addContract(s, 'graduacion'); gr.cams = 4;
  const pg = G.cameraPlan(s, gr, eqIds, stIds);
  const base = q(gr, pg.colocacion);
  const mover = (col, k, x, y) => col.map((z) => (z.p === k ? Object.assign({}, z, { x, y }) : Object.assign({}, z)));
  const reac = pg.positions.find((p) => p.key === 'reaccion_familias');
  const cerca = mover(pg.colocacion, 'reaccion_familias', reac.nx - 10, reac.ny);
  check(G.validarColocacion(s, gr, eqIds, stIds, cerca).ok && q(gr, cerca) > base, `cámaras libres: más cerca de las familias debería rendir más (${base} → ${q(gr, cerca)})`);
  const tapada = mover(pg.colocacion, 'lateral_diplomas', 92, 51);
  const pt = G.cameraPlan(s, gr, eqIds, stIds, tapada);
  const dip = pt.positions.find((p) => p.key === 'lateral_diplomas');
  check(q(gr, tapada) < base && dip.tapada && !dip.ok && dip.pista === 'tapada' && pt.tomasOk < pg.tomasOk, 'cámaras libres: detrás de una columna la toma queda tapada (✗ con su pista)');
  // Fútbol: nada en la cancha salvo el dron; la cerrada del otro lado de la principal cruza el eje
  const lp = G.addContract(s, 'ligapro'); lp.cams = 4;
  const pf = G.cameraPlan(s, lp, eqIds, stIds);
  const enCancha = mover(pf.colocacion, 'cerrada', 50, 50);
  const vc = G.validarColocacion(s, lp, eqIds, stIds, enCancha);
  check(!vc.ok && vc.motivo === 'punto', 'cámaras libres: una cámara en la cancha debería rechazarse');
  const cruz = mover(pf.colocacion, 'cerrada', 55, 10);
  const pc = G.cameraPlan(s, lp, eqIds, stIds, cruz);
  check(G.validarColocacion(s, lp, eqIds, stIds, cruz).ok && pc.combos.some((x) => x.k === 'cam.g.eje' && x.pts < 0) && q(lp, cruz) < q(lp, pf.colocacion), 'cámaras libres: la cerrada en la tribuna de enfrente cruza el eje');
  // Formatos: x sin y, fuera de la cuadrícula, con decimales
  [[{ x: 50 }], [{ x: 101, y: 5 }], [{ x: 5.5, y: 5 }], [{ x: '5', y: 5 }]].forEach(([xy]) => {
    const col = pf.colocacion.map((z, i) => (i ? Object.assign({}, z) : Object.assign({}, z, xy)));
    check(G.validarColocacion(s, lp, eqIds, stIds, col).motivo === 'formato', `cámaras libres: coordenadas mal formadas aceptadas: ${JSON.stringify(xy)}`);
  });
  // startEvent guarda las coordenadas
  const r = G.startEvent(s, gr.id, stIds, eqIds, cerca);
  check(r.ok && s.currentEvent.colocacion.some((z) => z.p === 'reaccion_familias' && z.x === reac.nx - 10), 'cámaras libres: el evento no guardó dónde quedó la cámara');
  console.log(`Cámaras libres: graduación ${base} → más cerca de las familias ${q(gr, cerca)} · detrás de una columna ${q(gr, tapada)}; fútbol cruzando el eje ${q(lp, pf.colocacion)} → ${q(lp, cruz)}`);

  /* Fútbol, tomas a mano (28-oct, el dueño: "cuando usas VAR sí va una al otro lado; o esa cámara da técnicos o cambios;
     hay cómo poner las mini atrás del arco") */
  const mini1 = eq('cam_gopra_heroe13'), mini2 = eq('cam_marchall_cv513_pov');
  s.staff.push({ id: nid(), name: 'Repe', role: 'operador_repeticion', skill: 3, tier: 'junior', wage: 50, morale: 90, events: 5 });
  const eqIds2 = s.equip.map((e) => e.id), stIds2 = s.staff.map((p) => p.id);
  ['barrial', 'ligapro', 'final', 'internacional_host'].forEach((t) => {
    const c = { type: t, cams: G.EVENT_TYPES[t].cams[0] };
    const pl = G.cameraPlan(s, c, eqIds2, stIds2);
    const am = pl.positions.filter((p) => p.aMano);
    check(am.map((p) => p.key).join() === 'var,bancos,mini_arco_izq,mini_arco_der' && am.every((p) => p.opcional && !p.asignado && p.nota),
      `tomas a mano: ${t} debería tener contracampo, bancos y minicámaras (sin llenar en el automático)`);
  });
  // El automático no usa las tomas a mano (las minicámaras se quedan sin toma): el plan automático no cambia
  const pa = G.cameraPlan(s, lp, eqIds2, stIds2);
  check(!pa.positions.some((p) => p.aMano && p.asignado), 'tomas a mano: el automático no debería llenarlas');
  const q2 = (col) => crudo(G.computeQuality(s, lp, s.staff, s.equip, col));
  // Contracampo VAR del otro lado (con repeticiones): sin "cruza el eje" y con su combo; la cerrada del juego en vivo
  // del mismo lado, en cambio, sí cruza el eje
  const conVar = pa.colocacion.filter((z) => z.p !== 'arco_der_alto').map((z) => Object.assign({}, z));
  conVar.push({ p: 'var', e: pa.colocacion.find((z) => z.p === 'arco_der_alto').e });
  const pv = G.cameraPlan(s, lp, eqIds2, stIds2, conVar);
  const ov = pv.positions.find((p) => p.key === 'var');
  check(G.validarColocacion(s, lp, eqIds2, stIds2, conVar).ok && ov.asignado && ov.y < 30 && !ov.ejeCruzado && !pv.combos.some((x) => x.k === 'cam.g.eje')
    && ov.razones.some((x) => x.k === 'cam.r.var' && x.pts > 0), 'tomas a mano: el contracampo VAR del otro lado no cruza el eje y suma con repeticiones');
  const enVivo = mover(conVar, 'cerrada', 55, 10);
  check(G.cameraPlan(s, lp, eqIds2, stIds2, enVivo).positions.find((p) => p.key === 'cerrada').ejeCruzado, 'tomas a mano: la cerrada del juego en vivo del otro lado sigue cruzando el eje');
  // Minicámaras en la red: van solo cámaras de acción / POV (sin operador), suman y abren la "toma perfecta" del gol
  const conMini = pa.colocacion.map((z) => Object.assign({}, z)).filter((z) => z.e !== mini1 && z.e !== mini2)
    .concat([{ p: 'mini_arco_izq', e: mini1 }, { p: 'mini_arco_der', e: mini2 }]);
  const pm = G.cameraPlan(s, lp, eqIds2, stIds2, conMini);
  const mi = pm.positions.filter((p) => /^mini_arco_/.test(p.key));
  check(G.validarColocacion(s, lp, eqIds2, stIds2, conMini).ok && mi.every((p) => p.asignado && p.operado && p.ok) && pm.combos.some((x) => x.k === 'cam.r.mini_arco' && x.pts > 0 && x.pts <= G.CAMARAS_REGLAS.miniMax)
    && q2(conMini) > q2(pa.colocacion), 'tomas a mano: las minicámaras en la red suman (sin operador, ✓)');
  const cine = s.equip.find((e) => e.type === 'cam_cine').id;
  check(G.validarColocacion(s, lp, eqIds2, stIds2, [{ p: 'mini_arco_izq', e: cine }]).motivo === 'imposible', 'tomas a mano: una cámara de cine no va en la toma de la minicámara');
  check(G.validarColocacion(s, lp, eqIds2, stIds2, [{ p: 'cerrada', e: cine, x: 15, y: 47 }]).motivo === 'punto', 'tomas a mano: una cámara grande no cabe en la red del arco');
  check(G.validarColocacion(s, lp, eqIds2, stIds2, [{ p: 'mini_arco_izq', e: mini1, x: 30, y: 47 }]).motivo === 'punto', 'tomas a mano: la minicámara tampoco va en medio de la cancha');
  // Sin minicámara, la toma dice dónde comprarla
  const sinMini = G.cameraPlan(s, lp, eqIds2.filter((id) => id !== mini1 && id !== mini2), stIds2).positions.find((p) => p.key === 'mini_arco_izq');
  check(sinMini.compra && G.CATALOG[sinMini.compra] && /Bodega/.test(sinMini.compraTexto), 'tomas a mano: sin minicámara debería sugerir comprar una');
  console.log(`Tomas a mano (fútbol): automático ${q2(pa.colocacion)} · con minicámaras en la red ${q2(conMini)} · contracampo VAR ${q2(conVar)}`);
})();

if (errors) { console.error(`\n❌ ${errors} errores encontrados`); process.exit(1); }
console.log('\n✅ Lógica OK: sin errores');
