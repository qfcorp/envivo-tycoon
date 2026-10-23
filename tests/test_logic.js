/* Prueba automática de la lógica: juega cientos de partidas con un "bot"
   y revisa que nada se rompa (dinero válido, sin errores, historia completable).
   Uso:  node tests/test_logic.js                                            */
'use strict';
const G = require('../js/logic.js');

let errors = 0;
function check(cond, msg) { if (!cond) { errors++; if (errors < 30) console.error('❌', msg); } }

function validState(s, tag) {
  check(Number.isFinite(s.money), `${tag}: dinero inválido ${s.money}`);
  check(Number.isFinite(s.rep) && s.rep >= 0 && s.rep <= 100, `${tag}: fama inválida ${s.rep}`);
  check(s.staff.some((p) => p.owner), `${tag}: desapareció el dueño`);
  s.equip.forEach((e) => check(G.CATALOG[e.type] && e.condition >= 1 && e.condition <= 100, `${tag}: equipo inválido ${JSON.stringify(e)}`));
  s.staff.forEach((p) => check(p.skill >= 1 && p.skill <= 5 && p.morale >= 0 && p.morale <= 100, `${tag}: personal inválido`));
  check(s.stock.cable >= 0 && s.stock.battery >= 0, `${tag}: stock negativo`);
}

// Bot que juega "razonablemente bien"
function botTurn(s) {
  const has = (cat) => G.countCat(s, cat);
  const roleCount = (r) => s.staff.filter((p) => p.role === r).length;
  // Mantener repuestos
  if (s.stock.cable < 2 && s.money > 300) G.buyConsumable(s, 'cable', 1);
  if (s.stock.battery < 1 && s.money > 400) G.buyConsumable(s, 'battery', 1);
  // Reparar equipo gastado
  s.equip.filter((e) => e.condition < 45).forEach((e) => { if (s.money > G.repairCost(e) + 300) G.repair(s, e.id); });
  // Comprar según necesidad
  const wishes = [
    ['audio_basic', () => has('audio') < 1], ['cam_basic', () => has('cam') < 2], ['switch_basic', () => has('switcher') < 1],
    ['encoder', () => has('encoder') < 1], ['raincover', () => has('rain') < 1], ['router4g', () => has('internet') < 1],
    ['ups', () => has('power') < 1], ['mics', () => has('mics') < 1], ['cam_pro', () => has('cam') < 4 && s.rep >= 10],
    ['audio_pro', () => s.rep >= 20 && !s.equip.some((e) => e.type === 'audio_pro')],
    ['switch_pro', () => s.rep >= 30 && !s.equip.some((e) => e.type === 'switch_pro')],
    ['cam_cine', () => s.rep >= 35 && has('cam') < 6],
  ];
  for (const [type, need] of wishes) {
    if (need() && s.money > G.CATALOG[type].price + 400 && G.CATALOG[type].minRep <= s.rep) { G.buy(s, type); break; }
  }
  // Contratar según necesidad
  const want = { cam: Math.min(has('cam'), 6), dir: 1, audio: 1, stream: 1 };
  for (const c of s.candidates.slice()) {
    if (roleCount(c.role) < want[c.role] && s.money > c.wage * 2 + 500) G.hire(s, c.id);
  }
  // Despedir desmotivados
  s.staff.filter((p) => !p.owner && p.morale < 15).forEach((p) => G.fire(s, p.id));
  if (s.contracts.length < 2 && s.money > 600) G.marketing(s, 'redes');
  // Elegir el mejor contrato según calidad esperada
  let best = null;
  for (const c of s.contracts) {
    const lo = G.suggestLoadout(s, c.id);
    const staff = s.staff.filter((p) => lo.staffIds.includes(p.id));
    const equip = s.equip.filter((e) => lo.equipIds.includes(e.id));
    if (!equip.length) continue;
    const q = G.computeQuality(s, c, staff, equip).q;
    let score = c.pay * (q / 100) * (q >= 50 ? 1 : 0.2);
    // Perseguir la historia: ofertas del capítulo y duelos contra la rival (si se pueden ganar)
    if (c.story && q >= 60) score *= 2;
    if (c.rival && s.chapter === 3 && !s.storyDone) score *= q >= 75 ? 1.5 : 0.5;
    if (!best || score > best.score) best = { c, lo, score };
  }
  if (!best) { G.nextDay(s); return; }
  const r = G.startEvent(s, best.c.id, best.lo.staffIds, best.lo.equipIds);
  check(r.ok, 'startEvent falló: ' + r.msg);
  if (!r.ok) { G.nextDay(s); return; }
  let inc, guard = 0;
  while ((inc = G.currentIncident(s)) && guard++ < 10) {
    check(inc.choices.some((ch) => ch.ok), 'imprevisto sin ninguna opción disponible: ' + inc.text);
    const ch = inc.choices.find((x) => x.ok);
    const rr = G.resolveIncident(s, ch.i);
    check(rr.ok && typeof rr.msg === 'string', 'resolveIncident falló');
  }
  const f = G.finishEvent(s);
  check(f.ok && f.result.stars >= 1 && f.result.stars <= 5, 'finishEvent falló');
}

const GAMES = 400, MAX_DAYS = 400;
const NCH = G.CHAPTERS.length;
let storyWins = 0, bankrupt = 0, daysToWin = [], chapterReached = new Array(NCH + 1).fill(0);
const chapterDays = G.CHAPTERS.map(() => []);
let rivalSeen = 0, rivalEarly = 0, duelsWon = 0, duelsLost = 0;
for (let g = 0; g < GAMES; g++) {
  const s = G.newGame(1000 + g);
  validState(s, `partida ${g} inicio`);
  let winDay = null, lastCh = s.chapter;
  for (let t = 0; t < MAX_DAYS && !s.gameOver; t++) {
    try { botTurn(s); } catch (e) { check(false, `partida ${g} día ${s.day}: EXCEPCIÓN ${e.stack}`); break; }
    validState(s, `partida ${g} día ${s.day}`);
    s.contracts.forEach((c) => {
      check(typeof c.rival === 'boolean', `partida ${g}: contrato sin campo rival`);
      if (c.rival) { rivalSeen++; if (!s.storyDone && s.chapter < 3) rivalEarly++; }
      if (!s.storyDone && c.type === 'ligapro') check(s.chapter >= 4, `partida ${g}: LigaPro antes del capítulo 5`);
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
  s.chapter = 3; s.rep = 30; s.contracts = [];
  const c = G.addContract(s, 'boda');
  check(c && c.rival === false, 'contrato pedido a mano no debería ser disputado');
  c.rival = true; c.stream = true; c.audio = true; c.cams = 3; c.diff = 4;
  const owner = s.staff.find((p) => p.owner);
  const rep0 = s.rep;
  const r = play(s, c, [owner.id], s.equip.map((e) => e.id));
  check(r.rival && r.stars <= 2 && r.duel === 'lost' && s.stats.duels.lost === 1, 'duelo perdido no se registró');
  check(s.rep - rep0 <= -3, `duelo perdido debería quitar fama extra (${s.rep - rep0})`);
  // Ganar: subir la calidad base a la fuerza
  const s2 = G.newGame(78);
  s2.chapter = 3; s2.rep = 30; s2.contracts = [];
  const c2 = G.addContract(s2, 'misa'); c2.rival = true; c2.stream = false; c2.outdoor = false; c2.cams = 1; c2.audio = false;
  const ok = G.startEvent(s2, c2.id, [s2.staff[0].id], [s2.equip[0].id]);
  check(ok.ok, 'duelo 2: no se pudo iniciar');
  s2.currentEvent.base = 100; s2.currentEvent.incidents = [];
  const r2 = G.finishEvent(s2).result;
  check(r2.stars >= 4 && r2.duel === 'won' && s2.stats.duels.won === 1 && s2.stats.good.misa === 1, 'duelo ganado no se registró');
  check(s2.chapterStats.duels === 1 && /Duelos 1\/3/.test(G.CHAPTERS[3].progress(s2)), 'el duelo no cuenta para el capítulo 4');
  // Antes del capítulo 4 no hay contratos disputados
  const s3 = G.newGame(79); s3.rep = 30; s3.contracts = [];
  for (let i = 0; i < 60; i++) { const k = G.addContract(s3); if (k) check(!k.rival, 'disputado antes del capítulo 4'); s3.contracts = []; }
})();

// Una partida vieja (sin los campos nuevos) debe cargar bien
(function () {
  const s = G.newGame(5);
  delete s.stats.good; delete s.stats.duels; delete s.storyNext; delete s.chapterStats;
  s.contracts.forEach((c) => { delete c.rival; delete c.story; });
  s.stats.best.lanzamiento = 4; s.chapter = 2;
  const o = G.deserialize(JSON.stringify(s));
  check(o && o.stats.good.lanzamiento === 1 && o.stats.duels.won === 0 && typeof o.storyNext === 'number', 'deserialize no rellenó campos nuevos');
  check(o && o.chapterStats && o.chapterStats.good.lanzamiento === 1 && o.chapterStats.duels === 0, 'deserialize no rellenó chapterStats');
  check(o && /1\/2/.test(G.CHAPTERS[2].progress(o)), 'progreso del capítulo 3 en partida vieja');
  check(o && o.contracts.every((c) => c.rival === false && c.story === false), 'deserialize no rellenó campos de contratos');
  for (let i = 0; i < 30; i++) { G.nextDay(o); validState(o, 'partida vieja'); }
})();

// Probar que un guardado dañado no rompa el juego
check(G.deserialize('{basura') === null, 'deserialize debería rechazar basura');
check(G.deserialize('{"v":99}') === null, 'deserialize debería rechazar versión vieja');

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
console.log(`Duelos contra MegaVisión: ganados ${duelsWon}, perdidos ${duelsLost}`);

// Ritmo de la historia
const bankRate = bankrupt / GAMES, winRate = storyWins / GAMES;
const MIN_GAP = [0, 10, 5, 10, 10, 10];
medians.forEach((m, i) => {
  check(Number.isFinite(m), `capítulo ${i + 1}: sin mediana`);
  if (i > 0) check(m - medians[i - 1] >= MIN_GAP[i], `capítulo ${i + 1}: llega muy rápido tras el anterior (+${m - medians[i - 1]} días, mínimo ${MIN_GAP[i]})`);
});
check(medians[0] <= 10, `capítulo 1 debería ser rápido (mediana ${medians[0]})`);
check(medians[NCH - 1] >= 90 && medians[NCH - 1] <= 140, `la historia debería durar ~100-120 días (mediana ${medians[NCH - 1]})`);
check(bankRate < 0.05, `demasiadas quiebras: ${(bankRate * 100).toFixed(1)}%`);
check(winRate > 0.85, `pocas partidas terminan la historia: ${(winRate * 100).toFixed(1)}%`);
console.log(`Quiebras ${(bankRate * 100).toFixed(1)}% · historia completada ${(winRate * 100).toFixed(1)}%`);

if (errors) { console.error(`\n❌ ${errors} errores encontrados`); process.exit(1); }
console.log('\n✅ Lógica OK: sin errores');
