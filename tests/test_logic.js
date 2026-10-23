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
    const score = c.pay * (q / 100) * (q >= 50 ? 1 : 0.2);
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
let storyWins = 0, bankrupt = 0, daysToWin = [], chapterReached = [0, 0, 0, 0, 0, 0, 0];
for (let g = 0; g < GAMES; g++) {
  const s = G.newGame(1000 + g);
  validState(s, `partida ${g} inicio`);
  let winDay = null;
  for (let t = 0; t < MAX_DAYS && !s.gameOver; t++) {
    try { botTurn(s); } catch (e) { check(false, `partida ${g} día ${s.day}: EXCEPCIÓN ${e.stack}`); break; }
    validState(s, `partida ${g} día ${s.day}`);
    if (s.storyDone && winDay === null) winDay = s.day;
  }
  // Guardar y cargar
  const copy = G.deserialize(G.serialize(s));
  check(copy && copy.money === s.money && copy.day === s.day, `partida ${g}: guardar/cargar no coincide`);
  if (winDay) { storyWins++; daysToWin.push(winDay); }
  if (s.gameOver) bankrupt++;
  chapterReached[s.storyDone ? 6 : s.chapter]++;
}

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
console.log(`Partidas simuladas: ${GAMES} (máx ${MAX_DAYS} días cada una)`);
console.log(`Terminaron la historia: ${storyWins} · Quebraron: ${bankrupt}`);
console.log('Capítulo alcanzado (1..6, 7=ganó):', chapterReached.map((n, i) => `${i + 1}:${n}`).join(' '));
if (daysToWin.length) console.log(`Días para ganar: mínimo ${daysToWin[0]}, mediana ${daysToWin[Math.floor(daysToWin.length / 2)]}, máximo ${daysToWin[daysToWin.length - 1]}`);
if (errors) { console.error(`\n❌ ${errors} errores encontrados`); process.exit(1); }
console.log('\n✅ Lógica OK: sin errores');
