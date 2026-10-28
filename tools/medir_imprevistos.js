#!/usr/bin/env node
/* =========================================================
   EN VIVO Tycoon — ¿Hay una opción dominante en los imprevistos?
   Arma cientos de eventos al azar (tipo, personal, equipos, repuestos y caja distintos, como un intento en línea)
   y en cada imprevisto mide cuánto vale de verdad cada opción disponible: la juega muchas veces (con otras tiradas)
   y promedia calidad + dinero + fama + desgaste, todo pasado a "puntos de calidad".
   Políticas que compara:
     primera    — siempre el primer botón disponible (lo que se quejó el dueño)
     al_azar    — cualquier botón disponible
     heuristica — lo que ve el jugador (equipo, % de éxito, costo, caja) — js/logic.js: Game.elegirOpcion si existe
     experto    — la opción que más vale en promedio (conoce las reglas, no los dados)
   Uso:  node tools/medir_imprevistos.js [eventos=400] [tiradas=24]
   ========================================================= */
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'logic.js'));
const I = require(path.join(__dirname, '..', 'server', 'validador', 'intento.js'));

const N = Number(process.argv[2]) || 400, K = Number(process.argv[3]) || 24;
let semilla = 12345;
const az = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const uno = (a) => a[Math.floor(az() * a.length)];
const deCat = (cat) => Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].cat === cat && !G.CATALOG[k].alquiler && !/^ex_/.test(k));
const TIPOS = Object.keys(G.EVENT_TYPES);
const ROLES = Object.keys(G.ROLES);

// Un evento con un equipo armado "de verdad" (los roles y equipos que pide el tipo de evento), con extras al azar:
// así cambia el contexto (UPS o generador, cobertores, repuestos, microfonista, caja...) de un imprevisto a otro.
function intentoAlAzar(i) {
  const type = uno(TIPOS), t = G.EVENT_TYPES[type];
  const staff = [{ role: 'camarografo', skill: 1 + Math.floor(az() * 4), owner: true }];
  Object.keys(t.crew || {}).forEach((rol) => {
    const [min, ideal] = t.crew[rol];
    const n = Math.max(min, az() < 0.7 ? ideal : min) - (rol === 'camarografo' ? 1 : 0);
    for (let k = 0; k < n && staff.length < 12; k++) staff.push({ role: rol, skill: 1 + Math.floor(az() * 5), morale: 50 + Math.floor(az() * 50), tier: uno(['junior', 'semi_senior', 'senior']) });
  });
  const cams = t.cams[1] + (az() < 0.3 ? 1 : 0);
  const equip = [];
  const pon = (cat, f) => { const l = deCat(cat).filter(f || (() => true)); if (l.length) equip.push({ type: uno(l), condition: 25 + Math.floor(az() * 75) }); };
  for (let k = 0; k < cams; k++) pon('cam', (k2) => !G.CATALOG[k2].minRep || G.CATALOG[k2].minRep < 40);
  if (cams >= 2) pon('switcher');
  if (t.audio) pon('audio');
  if (t.stream) pon('encoder');
  const tiene = (r) => staff.some((p) => p.role === r);
  if (tiene('operador_repeticion')) pon('replay');
  if (tiene('operador_graficos')) pon('graphics');
  [['mics', 0.6], ['internet', 0.5], ['power', 0.55], ['rain', t.outdoor ? 0.6 : 0.1], ['wireless', 0.2], ['intercom', 0.3], ['case', 0.3], ['support', 0.5]]
    .forEach(([cat, p]) => { if (az() < p) pon(cat); });
  return {
    seed: 1000 + i * 7919,
    equipo: { staff, equip },
    contrato: { type, diff: t.diff, cams: t.cams[1], pay: Math.round((t.pay[0] + t.pay[1]) / 2), outdoor: az() < (t.outdoor || 0), stream: az() < (t.stream || 0), audio: !!t.audio },
    contexto: { fama: Math.floor(az() * 60), dinero: uno([40, 150, 600, 2500, 8000]), stock: { cable: uno([0, 0, 1, 3]), battery: uno([0, 0, 1, 3]) } },
  };
}

const copia = (s) => JSON.parse(JSON.stringify(s));
// Valor de lo que pasó al resolver (en puntos de calidad)
function valor(antes, despues, r, pay) {
  const porQ = Math.max(4, pay * 0.012);
  let v = r.q;
  v += (despues.money - antes.money) / porQ;
  const ev = despues.currentEvent;
  v += (r.fama || 0) * 3;
  antes.equip.forEach((e) => {
    const d = despues.equip.find((x) => x.id === e.id);
    const precio = (G.CATALOG[e.type] || {}).price || 0;
    const baja = d ? e.condition - d.condition : e.condition; // robado: se pierde todo
    if (baja > 0) v -= (precio * baja / 100 * 0.6) / porQ;
  });
  Object.keys(antes.stock || {}).forEach((k) => { const c = (G.CONSUMABLES[k] || {}).price || 20; v -= Math.max(0, antes.stock[k] - (despues.stock[k] || 0)) * c / porQ; });
  // Un imprevisto encadenado que aparece: se cuenta lo que suele costar
  const n0 = antes.currentEvent.incidents.length, n1 = ev ? ev.incidents.length : n0;
  if (n1 > n0) v -= 4 * (n1 - n0);
  return v;
}
// Valor esperado de cada opción disponible (K tiradas distintas)
function valores(s, inc, pay) {
  return inc.choices.map((ch) => {
    if (!ch.ok) return null;
    let tot = 0;
    for (let k = 0; k < K; k++) {
      const c = copia(s); c.seed = (s.seed + Math.imul(k + 1, 0x9E3779B1)) | 0;
      const r = G.resolveIncident(c, ch.i);
      tot += valor(s, c, r, pay);
    }
    return tot / K;
  });
}

const POL = {
  primera: (inc) => inc.choices.find((c) => c.ok).i,
  al_azar: (inc) => uno(inc.choices.filter((c) => c.ok)).i,
  heuristica: (inc, s) => (typeof G.elegirOpcion === 'function' ? G.elegirOpcion(s, inc) : inc.choices.find((c) => c.ok).i),
};
const est = { incidentes: 0, multi: 0, primeraMejor: 0, ordenMejor: {}, perdida: { primera: 0, al_azar: 0, heuristica: 0 }, porClave: {} };
const fin = { primera: [], al_azar: [], heuristica: [], experto: [] };

for (let i = 0; i < N; i++) {
  const it = intentoAlAzar(i);
  let base;
  try { base = I.crearEstado(G, it); } catch (e) { continue; }
  const r0 = G.startEvent(base.s, base.contractId, base.staffIds, base.equipIds);
  if (!r0.ok) continue;
  const pay = base.s.currentEvent.contract.pay;
  // 1) Análisis imprevisto por imprevisto (se avanza con la opción del experto)
  const s = copia(base.s);
  let inc, g = 0;
  while ((inc = G.currentIncident(s)) && g++ < 20) {
    const vs = valores(s, inc, pay);
    const ok = inc.choices.filter((c) => c.ok);
    const mejor = vs.reduce((b, v, j) => (v !== null && (b < 0 || v > vs[b]) ? j : b), -1);
    est.incidentes++;
    if (ok.length >= 2) {
      est.multi++;
      if (ok[0].i === mejor) est.primeraMejor++;
      const orig = inc.choices[mejor].o !== undefined ? inc.choices[mejor].o : mejor;
      est.ordenMejor[orig] = (est.ordenMejor[orig] || 0) + 1;
      const pk = est.porClave[inc.key] = est.porClave[inc.key] || { n: 0, primera: 0, mejores: {} };
      pk.n++; if (ok[0].i === mejor) pk.primera++; pk.mejores[orig] = (pk.mejores[orig] || 0) + 1;
      const prom = ok.reduce((a, c) => a + vs[c.i], 0) / ok.length;
      est.perdida.primera += vs[mejor] - vs[ok[0].i];
      est.perdida.al_azar += vs[mejor] - prom;
      const h = POL.heuristica(inc, s);
      est.perdida.heuristica += vs[mejor] - (vs[h] === null || vs[h] === undefined ? prom : vs[h]);
    }
    G.resolveIncident(s, mejor);
  }
  // 2) El evento completo con cada política (misma semilla)
  for (const p of Object.keys(fin)) {
    const x = copia(base.s), m0 = x.money, rep0 = x.rep;
    let y, gg = 0;
    while ((y = G.currentIncident(x)) && gg++ < 20) {
      const ch = p === 'experto' ? (() => { const vs = valores(x, y, pay); return vs.reduce((b, v, j) => (v !== null && (b < 0 || v > vs[b]) ? j : b), -1); })() : POL[p](y, x);
      G.resolveIncident(x, ch);
    }
    const f = G.finishEvent(x);
    if (f.ok) fin[p].push({ q: f.result.quality, st: f.result.stars, dinero: x.money - m0, fama: x.rep - rep0 });
  }
}
const prom = (a, k) => (a.length ? a.reduce((t, x) => t + x[k], 0) / a.length : 0);
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
console.log(`Eventos: ${fin.primera.length} · imprevistos: ${est.incidentes} · con 2+ opciones disponibles: ${est.multi}`);
console.log(`El PRIMER botón disponible es la mejor opción en ${pct(est.primeraMejor, est.multi)} de los imprevistos (sin dominante ≈ 1/nº de opciones ≈ 35-45%)`);
console.log('Mejor opción según su posición original en la lista (o0, o1, ...):', Object.keys(est.ordenMejor).sort().map((k) => `o${k} ${pct(est.ordenMejor[k], est.multi)}`).join(' · '));
console.log(`Pérdida media por imprevisto frente al experto (puntos de calidad): primera ${(est.perdida.primera / est.multi).toFixed(2)} · al azar ${(est.perdida.al_azar / est.multi).toFixed(2)} · heurística ${(est.perdida.heuristica / est.multi).toFixed(2)}`);
console.log('Evento completo (calidad · estrellas · dinero del evento · fama):');
Object.keys(fin).forEach((p) => console.log(`  ${p.padEnd(10)} ${prom(fin[p], 'q').toFixed(1)} · ${prom(fin[p], 'st').toFixed(2)}⭐ · ${prom(fin[p], 'dinero').toFixed(0)} · ${prom(fin[p], 'fama').toFixed(2)}`));
if (process.env.DETALLE) Object.keys(est.porClave).sort().forEach((k) => { const x = est.porClave[k]; console.log(`  ${k.padEnd(18)} n=${String(x.n).padStart(4)} primera=${pct(x.primera, x.n).padStart(6)} mejores ${JSON.stringify(x.mejores)}`); });
