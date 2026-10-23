#!/usr/bin/env node
/* =========================================================
   EN VIVO Tycoon — Simulación de justicia de la Copa de Servidores
   (contrato: server/COPAS.md · reglas para jugadores: docs/COPA_DE_SERVIDORES.md)

   Simula semanas de Copa en universos de 3 servidores de tamaños muy distintos (por defecto 40, 12 y 3
   jugadores activos). Las productoras se arman con la LÓGICA REAL del juego (js/logic.js) usando el bot de
   tests/test_logic.js, que juega cada partida hasta distintos días (novatos, medios, avanzados, veteranos).
   Cada semana: cada jugador avanza días según lo activo que es, registra su equipo de copa, suma puntos de
   preparación con eventos en línea (repeticiones del validador), y el sábado se juegan los 3 cruces (todos
   contra todos) con 5 partidos cada uno: mismo contrato y misma semilla para los dos lados.

   Partidos: si existe server/eventos/batalla.js (jugarCruce) se usa; si no, un equivalente local sobre el
   validador (server/validador/validador.js, política "prudente" de server/eventos/motor.js, imprevistos fijados
   con el equipo de la casa para que ningún lado los decida).

   Puntaje (COPAS.md §2): puntos del cruce = puntos de batalla + bono de preparación normalizado
     bono = min(TOPE, TOPE × prep / máximo_del_universo); ganar cruce 3, empatar 1 (tabla).
   Como server/src/Copas.php: partido ganado = 10 puntos de batalla, empate = 5 (máx. 50); bono redondeado; puntos de
   preparación por intento = calidad + extra por estrellas; 10 intentos/día de lunes a viernes; contratos del cruce
   sorteados con la semilla como Copas::contratosCruce. Variantes que el simulador prueba además del contrato:
   casa "mediana" (la casa juega con el equipo mediano registrado del universo), orden "libre" y bono por promedio.

   Uso:  node tools/sim_copas.js                    (informe completo, ~1-3 min)
         UNIVERSOS=10 SEMANAS=8 node tools/sim_copas.js   (más rápido)
         TAMANOS=40,12,3 POOL=260 SEED=7 node tools/sim_copas.js
         JSON=1 node tools/sim_copas.js            (también imprime el resumen en JSON al final)
   ========================================================= */
'use strict';
const path = require('path');
const fs = require('fs');
const RAIZ = path.join(__dirname, '..');
const G = require(path.join(RAIZ, 'js', 'logic.js'));
const V = require(path.join(RAIZ, 'server', 'validador', 'validador.js'));
const Intento = require(path.join(RAIZ, 'server', 'validador', 'intento.js'));
const Motor = require(path.join(RAIZ, 'server', 'eventos', 'motor.js'));

const ENV = process.env;
const SEMANAS = Number(ENV.SEMANAS) || 8;
const UNIVERSOS = Number(ENV.UNIVERSOS) || 30; // réplicas de la temporada de 8 semanas (para tener porcentajes estables)
const TAMANOS = (ENV.TAMANOS || '40,12,3').split(',').map(Number);
const POOL = Number(ENV.POOL) || 240; // trayectorias de jugadores (se sortean para cada universo)
const SEED = Number(ENV.SEED) || 7;
const PUNTOS_PARTIDO = Number(ENV.PUNTOS_PARTIDO) || 10;
const TOPES = (ENV.TOPES || '0,5,10,15,25').split(',').map(Number);
const CASA_SKILL = Number(ENV.CASA_SKILL) || 2;

/* ---------- Azar propio del simulador (determinista) ---------- */
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry(SEED * 7919);
const uni = (a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (pesos) => { let r = rng() * pesos.reduce((x, y) => x + y[1], 0); for (const [v, w] of pesos) { r -= w; if (r <= 0) return v; } return pesos[pesos.length - 1][0]; };

/* ---------- Torneos (parodias; COPAS.md §2). Tipos de los 5 partidos y cadena internacional parodia ---------- */
const TORNEOS_LOCAL = [ // respaldo si batalla.js no carga (mismas claves, nombres y cadenas que batalla.js / Copas.php)
  { key: 'copa_planeta_balompie', nombre: 'Copa Planeta de Balompié', cadena: 'Red Mundovisión Planeta', partidos: ['ligapro', 'ligapro', 'final', 'ligapro', 'final'] },
  { key: 'copa_libertadores_sur', nombre: 'Copa de los Libertadores del Sur', cadena: 'Señal Cóndor Continental', partidos: ['ligapro', 'ligapro', 'ligapro', 'ligapro', 'final'] },
  { key: 'liga_estelar_clubes', nombre: 'Liga Estelar de Clubes', cadena: 'Canal Galaxia Deportiva', partidos: ['ligapro', 'final', 'ligapro', 'final', 'final'] },
  { key: 'mundial_aro_tablero', nombre: 'Mundial de Aro y Tablero', cadena: 'Aro y Red Televisión Global', partidos: ['concierto', 'concierto', 'concierto', 'concierto', 'concierto'] },
  { key: 'juegos_cinco_continentes', nombre: 'Juegos de los Cinco Continentes', cadena: 'Antorcha Mundial TV', partidos: ['concierto', 'boxeo', 'lucha_libre', 'ligapro', 'final'] },
  { key: 'gran_premio_formula_veloz', nombre: 'Gran Premio Fórmula Veloz', cadena: 'Bandera a Cuadros Network', partidos: ['lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos'] },
  { key: 'la_pelea_del_siglo', nombre: 'La Pelea del Siglo', cadena: 'Cuadrilátero Mundial Pago por Ver', partidos: ['lucha_libre', 'lucha_libre', 'boxeo', 'boxeo', 'boxeo'] },
  { key: 'el_gran_tazon', nombre: 'El Gran Tazón', cadena: 'Cadena Ovalada Intercontinental', partidos: ['ligapro', 'final', 'concierto', 'final', 'final'] },
];

let BATALLA = null;
try {
  const f = path.join(RAIZ, 'server', 'eventos', 'batalla.js');
  if (fs.existsSync(f)) { const B = require(f); if (typeof B.jugarCruce === 'function') BATALLA = B; }
} catch (e) { console.error('[sim] server/eventos/batalla.js existe pero no carga, uso el equivalente local:', e.message); BATALLA = null; }

function contratoDe(tipo, n) {
  const t = G.EVENT_TYPES[tipo];
  return { type: tipo, cams: t.cams[1], diff: t.diff, pay: Math.round((t.pay[0] + t.pay[1]) / 2), audio: !!t.audio, stream: true,
    outdoor: ['ligapro', 'final', 'lanzamiento_autos'].includes(tipo), client: (t.clients && t.clients[0]) || tipo, rival: false, story: false, n };
}

/* ---------- Bot (copiado de tests/test_logic.js, sin las verificaciones) ---------- */
const own = (s, k) => s.equip.filter((e) => e.type === k).length;
const camsN = (s) => G.countCat(s, 'cam');
const WISHES = [
  ['audio_basic', (s) => G.countCat(s, 'audio') < 1], ['cam_basic', (s) => camsN(s) < 2], ['switch_basic', (s) => G.countCat(s, 'switcher') < 1],
  ['encoder', (s) => G.countCat(s, 'encoder') < 1], ['raincover', (s) => G.countCat(s, 'rain') < 1], ['router4g', (s) => G.countCat(s, 'internet') < 1],
  ['ups', (s) => G.countCat(s, 'power') < 1], ['mics', (s) => G.countCat(s, 'mics') < 1], ['sop_tripode_basico', (s) => own(s, 'sop_tripode_basico') < 2],
  ['cam_pro', (s) => camsN(s) < 3 && s.rep >= 6], ['audio_pro', (s) => s.rep >= 10 && own(s, 'audio_pro') < 1], ['cam_cine', (s) => s.rep >= 14 && own(s, 'cam_cine') < 2],
  ['ic_hollyband_solidkom_c2', (s) => s.rep >= 16 && G.countCat(s, 'intercom') < 1], ['gfx_kasparcg_pc', (s) => s.rep >= 18 && G.countCat(s, 'graphics') < 1],
  ['sw_vmax_pro_pc', (s) => s.rep >= 18 && own(s, 'sw_vmax_pro_pc') < 1], ['switch_pro', (s) => s.rep >= 28 && own(s, 'switch_pro') < 1],
  ['enc_kilovista_p3', (s) => s.rep >= 22 && own(s, 'enc_kilovista_p3') < 1], ['rep_vmax_repeticion', (s) => s.rep >= 30 && G.countCat(s, 'replay') < 1],
  ['cam_blackmagia_urso_broadcast_g3', (s) => s.rep >= 30 && own(s, 'cam_blackmagia_urso_broadcast_g3') < 2],
  ['lente_kanon_kx21x8_2', (s) => own(s, 'lente_kanon_kx21x8_2') < own(s, 'cam_blackmagia_urso_broadcast_g3') + own(s, 'cam_zony_hdk_3200')],
  ['au_behringa_x33_rack', (s) => s.rep >= 30 && own(s, 'au_behringa_x33_rack') < 1], ['pw_jonda_eu2300i', (s) => s.rep >= 30 && own(s, 'pw_jonda_eu2300i') < 1],
  ['sop_manfrotti_504x', (s) => s.rep >= 30 && own(s, 'sop_manfrotti_504x') < 2], ['tx_terradek_rayo_6', (s) => s.rep >= 40 && G.countCat(s, 'wireless') < 1],
  ['cam_zony_hdk_3200', (s) => s.rep >= 50 && own(s, 'cam_zony_hdk_3200') < 1 && own(s, 'switch_pro') > 0],
  ['fib_cable_smpte_100m', (s) => own(s, 'cam_zony_hdk_3200') > own(s, 'fib_cable_smpte_100m')], ['cam_cine', (s) => s.rep >= 40 && own(s, 'cam_cine') < 3],
];
function wantStaff(s) {
  const r = s.rep, cams = camsN(s);
  const has = (cat) => G.countCat(s, cat) > 0;
  return {
    camarografo: Math.min(cams - 1, r < 10 ? 1 : r < 30 ? 2 : 3), director: cams >= 2 ? 1 : 0, sonidista: has('audio') ? 1 : 0,
    tecnico_transmision: has('encoder') ? 1 : 0, cablero: cams >= 3 ? 1 : 0, coordinador_piso: r >= 12 ? 1 : 0, microfonista: r >= 35 ? 1 : 0,
    operador_graficos: has('graphics') ? 1 : 0, operador_repeticion: has('replay') || own(s, 'sw_vmax_pro_pc') ? 1 : 0, shader: own(s, 'cam_zony_hdk_3200') ? 1 : 0,
  };
}
function botTurn(s) {
  if (s.stock.cable < 2 && s.money > 300) G.buyConsumable(s, 'cable', 1);
  if (s.stock.battery < 1 && s.money > 400) G.buyConsumable(s, 'battery', 1);
  s.equip.filter((e) => e.condition < 45).forEach((e) => { if (s.money > G.repairCost(e) + 300) G.repair(s, e.id); });
  for (const [type, need] of WISHES) {
    const it = G.CATALOG[type];
    if (need(s) && it.minRep <= s.rep && s.money > it.price + 800 + 6 * G.dailyCost(s)) { G.buy(s, type); break; }
  }
  const want = wantStaff(s);
  for (const c of s.candidates.slice().sort((a, b) => b.skill - a.skill)) {
    const role = G.canonRole(c.role);
    const have = s.staff.filter((p) => G.canonRole(p.role) === role && !p.owner).length;
    const cap = s.rep < 12 ? 6 : s.rep < 30 ? 8 : s.rep < 45 ? 10 : 12;
    const core = ['camarografo', 'director', 'sonidista', 'tecnico_transmision'].includes(role);
    const reserve = core ? 300 + 2 * G.dailyCost(s) : 600 + 4 * G.dailyCost(s);
    if (have < (want[role] || 0) && s.staff.length < cap && c.tier !== 'internacional' && s.money > c.wage * 2 + reserve) G.hire(s, c.id);
  }
  const missing = Object.keys(want).filter((r) => (want[r] || 0) > s.staff.filter((p) => G.canonRole(p.role) === r && !p.owner).length && !s.candidates.some((c) => c.role === r));
  if (missing.length && s.day % 4 === 0 && s.money > 1500 + 3 * G.dailyCost(s)) G.searchStaff(s, missing[0]);
  s.staff.filter((p) => !p.owner && p.morale < 15).forEach((p) => G.fire(s, p.id));
  if (s.contracts.length < 2 && s.money > 600) G.marketing(s, 'redes');
  const hired = s.staff.filter((p) => !p.owner);
  if (hired.length && hired.reduce((a, p) => a + p.morale, 0) / hired.length < 45 && !s.contracts.some((c) => c.story && c.daysLeft <= 1)) { G.nextDay(s); return; }
  let best = null;
  for (const c of s.contracts) {
    const lo = G.suggestLoadout(s, c.id);
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
    const est = cq.rango.esperado, B = G.BALANCE;
    const st = est >= B.stars[0] ? 5 : est >= B.stars[1] ? 4 : est >= B.stars[2] ? 3 : est >= B.stars[3] ? 2 : 1;
    const wages = staff.reduce((a, p) => a + G.eventWage(p, c.diff), 0) + (c.travelCost || 0);
    const net = c.pay * (c.diff >= B.bigFrom ? B.starsPayBig : B.starsPay)[st] - wages;
    if (net <= 0 && !c.story) continue;
    const cpl = G.crewPlan(s, c, lo.staffIds, lo.equipIds);
    if (c.diff >= 3 && !c.story && cpl.falta > 0) continue;
    let score = Math.max(1, net + 0.35 * c.pay * (cq.q / 100)) * (st >= 2 ? 1 : 0.3);
    if (c.story && cq.q >= 60) score *= 2;
    if (c.rival) score *= cq.q >= c.rivalQuality + 10 ? (s.chapter === 3 && !s.storyDone ? 1.6 : 1) : 0.3;
    if (!best || score > best.score) best = { c, lo, score };
  }
  if (!best) { G.nextDay(s); return; }
  if (best.c.story) s.equip.filter((e) => e.condition < 80).forEach((e) => { if (s.money > G.repairCost(e) + 200) G.repair(s, e.id); });
  const r = G.startEvent(s, best.c.id, best.lo.staffIds, best.lo.equipIds);
  if (!r.ok) { G.nextDay(s); return; }
  let inc, guard = 0;
  while ((inc = G.currentIncident(s)) && guard++ < 10) { const ch = inc.choices.find((x) => x.ok); G.resolveIncident(s, ch.i); }
  G.finishEvent(s);
}

/* ---------- Equipo de copa registrado (lo que un jugador cuidadoso registra para el torneo de la semana) ---------- */
const limpiarP = (p) => { const o = { role: p.role, skill: p.skill, morale: Math.round(p.morale), wage: p.wage || 0, tier: p.tier, events: p.events || 0 }; if (p.owner) o.owner = true; return o; };
const limpiarE = (e) => ({ type: e.type, condition: Math.max(1, Math.min(100, Math.round(e.condition))) });
const tiposDe = (torneo) => Array.from(new Set(torneo.partidos));

function equipoCopa(s, torneo) {
  const staffIds = new Set(), equipIds = new Set();
  let poder = 0;
  for (const tipo of tiposDe(torneo)) {
    const c = Object.assign(contratoDe(tipo), { id: 990000 + tiposDe(torneo).indexOf(tipo), daysLeft: 3 });
    s.contracts.push(c);
    try {
      const lo = G.suggestLoadout(s, c.id);
      lo.staffIds.forEach((id) => staffIds.add(id));
      lo.equipIds.forEach((id) => equipIds.add(id));
    } finally { s.contracts = s.contracts.filter((x) => x !== c); }
  }
  const staff = s.staff.filter((p) => staffIds.has(p.id)).slice(0, Intento.LIMITES.staff);
  const equip = s.equip.filter((e) => equipIds.has(e.id) && !G.CATALOG[e.type].vip).slice(0, Intento.LIMITES.equip);
  if (!staff.length) staff.push(s.staff.find((p) => p.owner));
  if (!equip.length) equip.push(s.equip[0]);
  // "poder" para ordenar el plantel: calidad esperada promedio en los partidos del torneo
  for (const tipo of torneo.partidos) {
    const c = Object.assign(contratoDe(tipo), { id: 990100 });
    poder += G.computeQuality(s, c, staff, equip).rango.esperado;
  }
  const eq = { staff: staff.map(limpiarP), equip: equip.map(limpiarE), fama: Math.round(s.rep), poder: poder / torneo.partidos.length };
  eq.poderB = BATALLA ? BATALLA.poder({ staff: eq.staff, equip: eq.equip }) : eq.poder;
  return eq;
}

/* Equipo de la casa (COPAS.md: equipo base estándar con habilidad 2) — el que completa un plantel con menos de 5 */
function equipoCasa(torneo, skill) {
  const s = G.newGame(1);
  let id = 1000;
  const p = (role) => ({ id: ++id, name: 'Casa', role, skill, tier: 'semi_senior', wage: 0, morale: 80, events: 0 });
  s.staff = [Object.assign(p('camarografo'), { owner: true }), p('camarografo'), p('camarografo'), p('director'), p('sonidista'), p('tecnico_transmision'), p('cablero')];
  s.equip = ['cam_basic', 'cam_basic', 'cam_pro', 'cam_pro', 'audio_basic', 'mics', 'switch_basic', 'encoder', 'router4g', 'ups', 'raincover', 'sop_tripode_basico', 'sop_tripode_basico']
    .map((type) => ({ id: ++id, type, condition: 90 }));
  s.rep = 25;
  const eq = equipoCopa(s, torneo);
  eq.casa = true;
  return eq;
}

/* ---------- Jugadores: trayectorias del bot ---------- */
// Perfil de actividad: días de juego que avanza por semana y eventos en línea validados por semana
const PERFILES = { casual: { dias: [3, 7], eventos: [2, 6] }, regular: { dias: [7, 14], eventos: [6, 14] }, intenso: { dias: [14, 25], eventos: [15, 30] } };
const PESOS_PERFIL = [['casual', 0.4], ['regular', 0.4], ['intenso', 0.2]];
const PESOS_INICIO = [[[5, 40], 0.3], [[40, 120], 0.35], [[120, 250], 0.25], [[250, 400], 0.1]];
const TOPE_EVENTOS_DIA = 10; // Copas::INTENTOS_DIA: 10 intentos por día, lunes a viernes (máx. 50 a la semana)

function crearTrayectoria(i, perfilForzado) {
  const perfil = perfilForzado || pick(PESOS_PERFIL);
  const P = PERFILES[perfil];
  const [a, b] = pick(PESOS_INICIO);
  const inicio = uni(a, b);
  const dias = [];
  let d = inicio;
  for (let w = 0; w < SEMANAS; w++) { dias.push(d); d += uni(P.dias[0], P.dias[1]); }
  const eventos = dias.map(() => Math.min(TOPE_EVENTOS_DIA * 5, uni(P.eventos[0], P.eventos[1])));
  let s = G.newGame(SEED * 100000 + i);
  let jugados = 0, reinicios = 0;
  const fotos = [];
  for (let w = 0; w < SEMANAS; w++) {
    while (jugados < dias[w]) {
      if (s.gameOver) { s = G.newGame(SEED * 100000 + i + 50000 * ++reinicios); }
      botTurn(s); jugados++;
    }
    const torneo = TORNEOS[w % TORNEOS.length];
    fotos.push(Object.assign(equipoCopa(s, torneo), { dia: jugados, eventos: eventos[w] }));
  }
  return { i, perfil, inicio, fotos };
}

/* ---------- Partidos ----------
   Con batalla.js: orden "mejor" → B.jugarCruce tal cual (se le pasan solo los equipos reales; él completa con su casa).
   Para las variantes que batalla.js no hace (orden libre, casa = equipo mediano) se usa el equivalente local, armado con
   las MISMAS piezas de batalla.js (contratosDe, equipoCasa, CONTEXTO); se verifica que coincide con B.jugarCruce. */
const CTX = BATALLA ? BATALLA.CONTEXTO : { fama: 30, dinero: 1000, stock: { cable: 1, battery: 1 } };
const contratosTorneo = (torneo) => (BATALLA ? BATALLA.contratosDe(torneo.key) : torneo.partidos.map((t) => { const c = contratoDe(t); delete c.n; return c; }));
/* Los 5 contratos de un cruce como Copas::contratosCruce (cámaras y exterior sorteados con la semilla del cruce) */
const crypto = require('crypto');
function contratosCruce(torneo, semilla) {
  let i = 0;
  const r = () => parseInt(crypto.createHash('sha256').update(`copa|${torneo.key}|${semilla}#${i++}`).digest('hex').slice(0, 13), 16) / 4503599627370496;
  return torneo.partidos.map((tipo) => {
    const T = G.EVENT_TYPES[tipo];
    const cl = T.clients || [tipo];
    const lo = T.cams[0], hi = Math.min(6, T.cams[1]);
    const client = (torneo.nombre + ' · ' + cl[Math.floor(r() * cl.length) % cl.length]).slice(0, 80);
    const cams = Math.min(hi, lo + Math.floor(r() * (hi - lo + 1)));
    return { type: tipo, client, cams, audio: !!T.audio, stream: true, outdoor: r() < Number(T.outdoor || 0), diff: Math.min(5, T.diff), pay: T.pay[1] };
  });
}
const cacheCasa = {};
function casaPara(contrato, torneo) {
  if (BATALLA) return BATALLA.equipoCasa(contrato);
  return cacheCasa[torneo.key] || (cacheCasa[torneo.key] = equipoCasa(torneo, CASA_SKILL));
}
function imprevistosCon(equipo, contrato, seed) {
  const m = V.motorActual();
  const intento = { seed, vip: false, contrato, equipo: { staff: equipo.staff, equip: equipo.equip }, contexto: CTX };
  const { s, contractId, staffIds, equipIds } = Intento.crearEstado(m.G, intento);
  const r = m.G.startEvent(s, contractId, staffIds, equipIds);
  if (!r || !r.ok) return [];
  return s.currentEvent.incidents.map((x) => x.key);
}
function jugarLado(equipo, contrato, seed) {
  const intento = { seed, vip: false, contrato, equipo: { staff: equipo.staff, equip: equipo.equip }, contexto: CTX };
  const r = Motor.fantasma(intento, 'prudente', false);
  if (!r.ok) return { calidad: 0 };
  return { calidad: r.calidad };
}
function jugarCruceLocal({ seed, torneo, planA, planB }) {
  const partidos = [];
  let ta = 0, tb = 0;
  contratosCruce(torneo, seed).forEach((c0, k) => {
    const sd = Motor.variante(seed, k + 1);
    const casa = casaPara(c0, torneo);
    const contrato = Object.assign({}, c0, { imprevistos: imprevistosCon(casa, c0, sd) });
    const ea = planA[k].casa && !planA[k].staff ? casa : planA[k], eb = planB[k].casa && !planB[k].staff ? casa : planB[k];
    const A = jugarLado(ea, contrato, sd), B = jugarLado(eb, contrato, sd);
    ta += A.calidad; tb += B.calidad;
    partidos.push({ n: k + 1, tipo: c0.type, calidad_a: A.calidad, calidad_b: B.calidad, ganador: A.calidad > B.calidad ? 'a' : B.calidad > A.calidad ? 'b' : 'empate',
      casa_a: !!planA[k].casa, casa_b: !!planB[k].casa });
  });
  return { partidos, calidad_total_a: ta, calidad_total_b: tb };
}
let verificado = null; // ¿el equivalente local da lo mismo que batalla.js?
function jugarCruce(x, cfg) {
  if (BATALLA && cfg.orden === 'mejor') {
    // batalla.js ordena por B.poder y completa con su casa: se le pasan solo los equipos reales (o la casa "mediana")
    const eq = (e) => ({ staff: e.staff, equip: e.equip });
    const r = BATALLA.jugarCruce({ seed: x.seed, torneo: x.torneo.key, contratos: contratosCruce(x.torneo, x.seed), planA: x.planA.filter((e) => e.staff).map(eq), planB: x.planB.filter((e) => e.staff).map(eq) });
    if (!r.ok) throw new Error('batalla.js: ' + r.motivo + ' ' + r.mensaje);
    if (verificado === null && cfg.casa === 'base') {
      const l = jugarCruceLocal(x);
      verificado = l.partidos.every((p, i) => p.calidad_a === r.partidos[i].calidad_a && p.calidad_b === r.partidos[i].calidad_b);
    }
    return r;
  }
  return jugarCruceLocal(x);
}

/* ---------- Una semana de copa en un universo ---------- */
// Puntos de preparación (como Copas::puntosIntento): por intento validado, calidad + extra por estrellas [0,0,0,5,10,20].
// Los intentos de preparación usan contratos del torneo de la semana → calidad ≈ la calidad esperada del equipo en el torneo.
const ESTRELLAS_EXTRA = [0, 0, 0, 5, 10, 20];
function estrellasDe(q) { const B = G.BALANCE.stars; return q >= B[0] ? 5 : q >= B[1] ? 4 : q >= B[2] ? 3 : q >= B[3] ? 2 : 1; }
function prepJugador(f) {
  const q = Math.max(0, Math.min(100, Math.round(f.poder)));
  return f.eventos * (q + ESTRELLAS_EXTRA[estrellasDe(q)]);
}

const REGISTRA = 0.85; // probabilidad de que un jugador activo registre su equipo de copa esa semana
/* cfg.casa: 'base' (COPAS.md: equipo estándar de habilidad 2) | 'mediana' (la casa juega como el equipo mediano registrado del universo)
   cfg.orden: 'mejor' (cada plantel en orden de poder: 1º contra 1º) | 'libre' (cada servidor decide el orden en secreto; el que tiene
   equipos de la casa los pone primero, para que sus equipos reales enfrenten a los 3º-5º del rival) */
function plantel(fotos, casa, cfg) {
  const reg = fotos.filter((f) => f.registra).sort((a, b) => b.poderB - a.poderB).slice(0, 5);
  while (reg.length < 5) reg.push(casa);
  if (cfg.orden === 'libre') return reg.filter((e) => e.casa).concat(reg.filter((e) => !e.casa));
  return reg;
}

function semana(servs, w, seedU, cfg) {
  const torneo = TORNEOS[w % TORNEOS.length];
  const rs = mulberry(seedU * 97 + w); // mismo registro en todas las configuraciones
  const todas = servs.map((sv) => sv.jug.map((t) => Object.assign({}, t.fotos[w], { registra: rs() < REGISTRA })));
  let casa = { casa: true, poder: CASA_Q[torneo.key], poderB: 0 }; // la casa estándar (se arma por contrato en el partido)
  if (cfg.casa === 'mediana') {
    const reg = [].concat(...todas).filter((f) => f.registra).sort((a, b) => a.poder - b.poder);
    if (reg.length) casa = Object.assign({}, reg[Math.floor(reg.length / 2)], { casa: true });
  }
  const info = todas.map((fotos) => {
    const prepSuma = fotos.reduce((a, f) => a + prepJugador(f), 0);
    const plan = plantel(fotos, casa, cfg);
    return { plan, prepSuma, prepProm: prepSuma / Math.max(1, fotos.length), n: fotos.length, casas: plan.filter((e) => e.casa).length };
  });
  const cruces = [];
  for (let a = 0; a < servs.length; a++) for (let b = a + 1; b < servs.length; b++) {
    const r = jugarCruce({ seed: (seedU * 1000 + w * 10 + a * 3 + b) | 0, torneo, planA: info[a].plan, planB: info[b].plan }, cfg);
    const ga = r.partidos.filter((p) => p.ganador === 'a').length, gb = r.partidos.filter((p) => p.ganador === 'b').length;
    const emp = r.partidos.length - ga - gb;
    cruces.push({ a, b, batA: ga * PUNTOS_PARTIDO + emp * PUNTOS_PARTIDO / 2, batB: gb * PUNTOS_PARTIDO + emp * PUNTOS_PARTIDO / 2, ga, gb, qa: r.calidad_total_a, qb: r.calidad_total_b });
  }
  return { torneo, info, cruces };
}


/* Aplica una regla de puntaje a una semana ya jugada (los partidos no dependen del bono) */
function puntuar(sem, tope, modo) {
  // suma (COPAS.md): prep del servidor / máximo · promedio: por jugador activo / máximo · mixto: mitad y mitad
  const maxS = Math.max(1, ...sem.info.map((x) => x.prepSuma)), maxP = Math.max(1, ...sem.info.map((x) => x.prepProm));
  const rel = sem.info.map((x) => (modo === 'promedio' ? x.prepProm / maxP : modo === 'mixto' ? 0.5 * x.prepSuma / maxS + 0.5 * x.prepProm / maxP : x.prepSuma / maxS));
  const prep = sem.info.map((x) => x.prepSuma); // desempate de la tabla: preparación total
  const bono = rel.map((r) => (r > 0 ? Math.round(Math.min(tope, tope * r)) : 0)); // redondeado, como Copas::bono
  const tabla = sem.info.map(() => ({ pts: 0, g: 0, e: 0, p: 0, dif: 0 }));
  const res = sem.cruces.map((c) => {
    const pa = c.batA + bono[c.a], pb = c.batB + bono[c.b];
    const EPS = 1e-9;
    if (pa > pb + EPS) { tabla[c.a].pts += 3; tabla[c.a].g++; tabla[c.b].p++; } else if (pb > pa + EPS) { tabla[c.b].pts += 3; tabla[c.b].g++; tabla[c.a].p++; } else { tabla[c.a].pts++; tabla[c.b].pts++; tabla[c.a].e++; tabla[c.b].e++; }
    tabla[c.a].dif += c.qa - c.qb; tabla[c.b].dif += c.qb - c.qa;
    return { a: c.a, b: c.b, pa, pb };
  });
  const orden = tabla.map((t, i) => i).sort((x, y) => tabla[y].pts - tabla[x].pts || tabla[y].dif - tabla[x].dif || prep[y] - prep[x]);
  return { tabla, campeon: orden[0], res, bono };
}

/* ---------- Corrida ---------- */
const TORNEOS = BATALLA && BATALLA.TORNEOS && Object.keys(BATALLA.TORNEOS).length
  ? Object.entries(BATALLA.TORNEOS).map(([key, t]) => ({ key, nombre: t.nombre, cadena: t.cadena, partidos: t.tipos }))
  : TORNEOS_LOCAL;
/* Calidad esperada del equipo de la casa estándar en cada torneo (para el informe y el "poder" de relleno) */
const CASA_Q = {};
TORNEOS.forEach((t) => {
  let q = 0;
  contratosTorneo(t).forEach((c) => {
    const casa = casaPara(c, t);
    const st = Intento.crearEstado(G, { seed: 1, contrato: c, equipo: { staff: casa.staff, equip: casa.equip }, contexto: CTX });
    q += G.computeQuality(st.s, st.s.contracts[0], st.s.staff, st.s.equip).rango.esperado;
  });
  CASA_Q[t.key] = q / t.partidos.length;
});
const t0 = Date.now();
const log = (m) => process.stderr.write(m + '\n');
log(`[sim] partidos con: ${BATALLA ? 'server/eventos/batalla.js (jugarCruce)' : 'equivalente LOCAL sobre el validador + motor.js (batalla.js no existe todavía)'}`);
log(`[sim] generando ${POOL} trayectorias de jugadores con el bot (lógica real) ...`);
const pool = [];
for (let i = 0; i < POOL; i++) pool.push(crearTrayectoria(i));
// Jugadores "muy activos" para el escenario del servidor chico pero activo
const poolIntenso = [];
for (let i = 0; i < Math.max(30, Math.round(POOL / 6)); i++) poolIntenso.push(crearTrayectoria(POOL + i, 'intenso'));
log(`[sim] trayectorias listas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

function sortear(n, fuente) { const idx = fuente.map((x, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, n).map((i) => fuente[i]); }

function correrEscenario(universos, cfg) {
  const semanas = [];
  universos.forEach((servs, u) => { for (let w = 0; w < SEMANAS; w++) semanas.push(semana(servs, w, SEED * 100 + u, cfg)); });
  return semanas;
}

function resumir(semanas, tope, modo) {
  const nS = semanas[0].info.length;
  const camp = new Array(nS).fill(0), crG = new Array(nS).fill(0), crJ = new Array(nS).fill(0);
  let chicoGana1 = 0, chicoEmpata1 = 0;
  const gaps = {}; // "a-b" → diferencias de puntos (a − b)
  const partidosChico = { g: 0, j: 0 };
  semanas.forEach((sem) => {
    const r = puntuar(sem, tope, modo);
    camp[r.campeon]++;
    r.tabla.forEach((t, i) => { crG[i] += t.g; crJ[i] += t.g + t.e + t.p; });
    if (r.tabla[nS - 1].g > 0) chicoGana1++;
    if (r.tabla[nS - 1].g > 0 || r.tabla[nS - 1].e > 0) chicoEmpata1++;
    r.res.forEach((c) => { const k = `${c.a}-${c.b}`; (gaps[k] = gaps[k] || []).push(c.pa - c.pb); });
    sem.cruces.forEach((c) => { if (c.b === nS - 1) { partidosChico.g += c.gb; partidosChico.j += 5; } });
  });
  const med = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
  const p = (x) => Math.round((100 * x) / semanas.length);
  return {
    tope, modo, semanas: semanas.length,
    campeon: camp.map((c) => p(c)), cruces_ganados: crG.map((g, i) => Math.round((100 * g) / Math.max(1, crJ[i]))),
    chico_gana_1_cruce: p(chicoGana1), chico_suma_algo: p(chicoEmpata1),
    partidos_ganados_chico: Math.round((100 * partidosChico.g) / Math.max(1, partidosChico.j)),
    brecha_mediana: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, Math.round(med(v) * 10) / 10])),
  };
}

const NOMBRES = TAMANOS.map((n, i) => `S${i + 1}(${n})`);
const escenarios = [
  ['normal', 'jugadores de los 3 servidores sorteados de la misma población (mismo nivel típico)', () => TAMANOS.map((n) => ({ jug: sortear(n, pool) }))],
  ['chico_activo', 'el servidor chico tiene 3 jugadores MUY activos (perfil intenso); los demás, población normal', () => TAMANOS.map((n, i) => ({ jug: sortear(n, i === TAMANOS.length - 1 ? poolIntenso : pool) }))],
];
const CFGS = [
  { casa: 'base', orden: 'mejor' }, // COPAS.md tal cual
  { casa: 'base', orden: 'libre' },
  { casa: 'mediana', orden: 'mejor' },
  { casa: 'mediana', orden: 'libre' },
];
const cfgNombre = (c) => `casa ${c.casa} · orden ${c.orden}`;
const resultados = {};
for (const [k, desc, armar] of escenarios) {
  const universos = [];
  for (let u = 0; u < UNIVERSOS; u++) universos.push(armar());
  resultados[k] = { desc, cfgs: [] };
  for (const cfg of CFGS) {
    log(`[sim] escenario ${k} · ${cfgNombre(cfg)}: ${UNIVERSOS} universos × ${SEMANAS} semanas ...`);
    const sems = correrEscenario(universos, cfg);
    const R = { cfg, filas: [] };
    for (const modo of ['suma', 'promedio', 'mixto']) for (const tope of TOPES) R.filas.push(resumir(sems, tope, modo));
    const q = sems.map((s) => s.info.map((x) => x.plan.reduce((a, e) => a + e.poder, 0) / 5));
    R.poder = TAMANOS.map((n, i) => Math.round(q.reduce((a, x) => a + x[i], 0) / q.length));
    R.casas = TAMANOS.map((n, i) => Math.round((10 * sems.reduce((a, s) => a + s.info[i].casas, 0)) / sems.length) / 10);
    R.prepRel = TAMANOS.map((n, i) => ({
      suma: Math.round(100 * sems.reduce((a, s) => a + s.info[i].prepSuma / Math.max(1, ...s.info.map((x) => x.prepSuma)), 0) / sems.length),
      promedio: Math.round(100 * sems.reduce((a, s) => a + s.info[i].prepProm / Math.max(1, ...s.info.map((x) => x.prepProm)), 0) / sems.length),
    }));
    const brQ = {};
    sems.forEach((s) => s.cruces.forEach((c) => { const kk = `${c.a}-${c.b}`; (brQ[kk] = brQ[kk] || []).push((c.qa - c.qb) / 5); }));
    R.brecha_calidad = Object.fromEntries(Object.entries(brQ).map(([kk, v]) => { v.sort((a, b) => a - b); return [kk, Math.round(v[Math.floor(v.length / 2)])]; }));
    resultados[k].cfgs.push(R);
  }
}

/* ---------- Informe ---------- */
const out = [];
const casaQ = TORNEOS.map((t) => Math.round(CASA_Q[t.key]));
out.push(`# Copa de Servidores — simulación de justicia`);
out.push(`${UNIVERSOS} universos × ${SEMANAS} semanas = ${UNIVERSOS * SEMANAS} semanas por escenario · servidores ${NOMBRES.join(', ')} · ${POOL} trayectorias del bot (+${poolIntenso.length} intensas) · semilla ${SEED}`);
out.push(`Partidos: ${BATALLA ? `server/eventos/batalla.js (orden libre: equivalente local con sus piezas; coincide con batalla.js: ${verificado === null ? 'sin verificar' : verificado ? 'sí' : 'NO'})` : 'equivalente LOCAL (batalla.js no existía): validador + política "prudente" de motor.js, imprevistos fijados con el equipo de la casa'}`);
out.push(`Puntos de batalla: ${PUNTOS_PARTIDO} por partido ganado, ${PUNTOS_PARTIDO / 2} por empate (máx. ${5 * PUNTOS_PARTIDO}) · bono = min(T, T × prep / máx) · tabla 3/1/0 · casa base = habilidad ${CASA_SKILL}, calidad esperada por torneo ${casaQ.join('/')}`);
const parG = (k) => k.split('-').map((i) => NOMBRES[Number(i)].replace(/\(.*/, '')).join('−');
const pc = (xs) => xs.map((x) => x + '%').join(' / ');
for (const [k, r] of Object.entries(resultados)) {
  const R = r.cfgs[0];
  out.push('');
  out.push(`## 1. Contrato tal cual (casa base, mejor contra mejor) — escenario "${k}": ${r.desc}`);
  out.push(`Calidad esperada del plantel: ${NOMBRES.map((n, i) => `${n} ${R.poder[i]}`).join(' · ')} · equipos de la casa/semana: ${NOMBRES.map((n, i) => `${n} ${R.casas[i]}`).join(' · ')}`);
  out.push(`Brecha mediana de calidad por partido: ${Object.entries(R.brecha_calidad).map(([kk, v]) => `${parG(kk)} ${v}`).join(' · ')} · prep relativa al máximo (suma | promedio): ${NOMBRES.map((n, i) => `${n} ${R.prepRel[i].suma}% | ${R.prepRel[i].promedio}%`).join(' · ')}`);
  out.push('');
  out.push(`| Prep | Tope | Campeón ${NOMBRES.join('/')} | Cruces ganados ${NOMBRES.join('/')} | Chico gana ≥1 cruce | Chico suma ≥1 pto | Partidos ganados chico | Brecha mediana pts (${Object.keys(R.filas[0].brecha_mediana).map(parG).join(', ')}) |`);
  out.push('|---|---|---|---|---|---|---|---|');
  R.filas.forEach((f) => out.push(`| ${f.modo} | ${f.tope} | ${pc(f.campeon)} | ${pc(f.cruces_ganados)} | **${f.chico_gana_1_cruce}%** | ${f.chico_suma_algo}% | ${f.partidos_ganados_chico}% | ${Object.values(f.brecha_mediana).join(', ')} |`));
}
out.push('');
out.push(`## 2. Palancas: casa (base | mediana del universo) × orden (mejor contra mejor | libre en secreto) × bono (suma | promedio | mixto) × tope`);
out.push(`Objetivo: el chico (3) gana ≥1 cruce en ~20-35% de las semanas; el grande sigue siendo favorito. ✔ = cumple en "chico_activo" con el grande campeón más seguido.`);
out.push(`Casa base = equipo estándar de habilidad 2 (batalla.js) · casa mediana = la casa juega con el equipo registrado mediano del universo esa semana. Orden mejor = 1º contra 1º; libre = el servidor con casas las pone primero. Bono suma = prep del servidor / máximo (COPAS.md); promedio = prep por jugador activo / máximo; mixto = mitad y mitad.`);
out.push('');
out.push(`| Casa | Orden | Prep | Tope | normal: campeón ${NOMBRES.join('/')} | normal: chico ≥1 cruce | activo: campeón ${NOMBRES.join('/')} | activo: chico ≥1 cruce | activo: partidos chico | |`);
out.push('|---|---|---|---|---|---|---|---|---|---|');
const N = resultados.normal.cfgs, A = resultados.chico_activo.cfgs;
const candidatas = [];
N.forEach((rn, ci) => rn.filas.forEach((fn, fi) => {
  const fa = A[ci].filas[fi];
  const ok = fa.chico_gana_1_cruce >= 20 && fa.chico_gana_1_cruce <= 35 && fa.campeon[0] >= Math.max(...fa.campeon.slice(1)) && fn.campeon[0] >= Math.max(...fn.campeon.slice(1));
  if (ok) candidatas.push({ cfg: rn.cfg, modo: fn.modo, tope: fn.tope, n: fn, a: fa });
  out.push(`| ${rn.cfg.casa} | ${rn.cfg.orden} | ${fn.modo} | ${fn.tope} | ${pc(fn.campeon)} | ${fn.chico_gana_1_cruce}% | ${pc(fa.campeon)} | **${fa.chico_gana_1_cruce}%** | ${fa.partidos_ganados_chico}% | ${ok ? '✔' : ''} |`);
}));
out.push('');
out.push(`Calidad esperada del plantel por configuración (normal | activo): ${N.map((rn, ci) => `${cfgNombre(rn.cfg)}: ${rn.poder.join('/')} | ${A[ci].poder.join('/')}`).join(' · ')}`);
out.push('');
out.push(candidatas.length ? `Configuraciones que cumplen el objetivo: ${candidatas.map((c) => `${cfgNombre(c.cfg)} · prep ${c.modo} · tope ${c.tope} (activo ${c.a.chico_gana_1_cruce}%, normal ${c.n.chico_gana_1_cruce}%)`).join(' | ')}` : 'Ninguna configuración cumple el objetivo con estos parámetros.');
out.push(`Tiempo total: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(out.join('\n'));
if (ENV.JSON === '1') console.log(JSON.stringify(resultados));
