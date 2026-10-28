#!/usr/bin/env node
/* =========================================================
   Pruebas del validador de intentos.
   - 300 intentos jugados por un "cliente" (la lógica cargada como en el navegador, en otro contexto)
     con decisiones al azar: todos deben repetirse en el servidor con el mismo resultado.
   - Trampas: decisión cambiada, equipo cambiado, semilla cambiada, calidad/estrellas inventadas,
     opciones inválidas o no disponibles, decisiones de más o de menos.
   - Rendimiento: menos de 20 ms por validación (promedio).
   - Servicio HTTP (clave, /validar, /salud, límites), modo consola y el ayudante PHP del README.
   Uso:  node server/validador/test.js        (N=1000 SEMILLA=7 node server/validador/test.js)
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const V = require('./validador.js');

const N = Number(process.env.N || 300);
const RAIZ = V.RAIZ;
let fallas = 0, pruebas = 0;
function ok(cond, msg) { pruebas++; if (!cond) { fallas++; if (fallas < 40) console.error('  ❌', msg); } }

/* ---------- Azar propio de la prueba (reproducible) ---------- */
let semillaPrueba = Number(process.env.SEMILLA || 20261023) | 0;
function r() {
  semillaPrueba = (semillaPrueba + 0x6D2B79F5) | 0;
  let t = semillaPrueba;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
const elige = (arr) => arr[Math.floor(r() * arr.length)];
const clon = (o) => JSON.parse(JSON.stringify(o));

/* ---------- El "cliente": la lógica cargada como scripts del navegador, en su propio contexto ---------- */
function cargarCliente() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const archivos = ['js/datos.js', 'js/logic.js', 'js/premium.js'].map((f) => path.join(RAIZ, f)).filter((f) => fs.existsSync(f));
  archivos.push(path.join(__dirname, 'intento.js'));
  archivos.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  if (!ctx.Game || !ctx.Intento) throw new Error('El cliente no cargó Game / Intento');
  return ctx;
}
const C = cargarCliente();
function jugarCliente(intento, elegir) {
  if (C.Premium) C.Premium.setVip(intento.vip === true);
  try { return C.Intento.jugar(C.Game, clon(intento), elegir); } finally { if (C.Premium) C.Premium.setVip(false); }
}
const azar = (inc) => { const op = inc.choices.filter((c) => c.ok); return (r() < 0.25 ? op[0] : elige(op)).i; };

/* ---------- Generar intentos como los registraría el servidor ---------- */
const G = V.motorActual().G;
const TIPOS = Object.keys(G.EVENT_TYPES);
const ROLES = Object.keys(G.ROLES);
const EQUIPOS = Object.keys(G.CATALOG);
const CAMARAS = EQUIPOS.filter((k) => G.CATALOG[k].cat === 'cam');
const TOP = (G.BALANCE.skillUp || [0, 0, 0, 0, 0]).length;

function nuevoIntento() {
  const type = elige(TIPOS);
  const t = G.EVENT_TYPES[type];
  const vip = r() < 0.15;
  const okEquipo = (k) => vip || !G.CATALOG[k].vip;
  const contrato = { type, client: elige(t.clients), cams: ri(t.cams[0], t.cams[1]), diff: t.diff, audio: t.audio,
    stream: r() < t.stream, outdoor: r() < t.outdoor, pay: ri(t.pay[0], t.pay[1]) };
  if (t.diff >= 2 && r() < 0.25) { contrato.rival = true; contrato.diff = Math.min(5, t.diff + 1); contrato.rivalQuality = ri(45, 95); }
  else if (['lanzamiento', 'ligapro', 'final'].includes(type) && r() < 0.2) contrato.story = true;
  const staff = [{ name: 'Tú (dueño)', role: 'cam', skill: ri(1, TOP), owner: true, morale: 100 }];
  for (let i = ri(0, 9); i > 0; i--) staff.push({ name: `P${i}`, role: elige(ROLES), skill: ri(1, TOP), morale: ri(0, 100), wage: ri(20, 120), tier: elige(['junior', 'semisenior', 'senior']) });
  const equip = [];
  for (let i = ri(1, 5); i > 0; i--) equip.push({ type: elige(CAMARAS.filter(okEquipo)), condition: ri(1, 100) });
  for (let i = ri(0, 9); i > 0; i--) equip.push({ type: elige(EQUIPOS.filter(okEquipo)), condition: ri(1, 100), serie: ri(1, 9999) });
  return {
    seed: ri(-2147483648, 2147483647), vip, contrato, equipo: { staff, equip },
    contexto: { fama: ri(0, 100), dinero: ri(-250, 20000), stock: { cable: ri(0, 3), battery: ri(0, 2) } },
  };
}

console.log(`Lógica ${V.info().version_logica} · ${N} intentos`);

/* ---------- 1. Intentos honestos ---------- */
const honestos = [];
const tiempos = [];
let imprevistos = 0, conRival = 0, maxDec = 0;
const claves = {};
for (let k = 0; k < N; k++) {
  const base = nuevoIntento();
  let jugado;
  try { jugado = jugarCliente(base, azar); } catch (e) { ok(false, `intento ${k}: el cliente no pudo jugar (${e.message})`); continue; }
  const intento = Object.assign(clon(base), { decisiones: jugado.decisiones, cliente_resultado: jugado.resultado });
  const t0 = process.hrtime.bigint();
  const v = V.validate(clon(intento));
  tiempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
  ok(v.valido === true && v.coincide === true, `intento ${k}: no validó (${v.detalle.motivo}: ${v.detalle.mensaje})`);
  ok(v.calidad === jugado.resultado.quality && v.estrellas === jugado.resultado.stars, `intento ${k}: calidad ${v.calidad} vs ${jugado.resultado.quality}`);
  const qCliente = jugado.completo.incidents.map((i) => i.result.q);
  ok(JSON.stringify(qCliente) === JSON.stringify(v.detalle.incidentes.map((i) => i.q)), `intento ${k}: imprevistos distintos`);
  ok(v.detalle.base === jugado.completo.base, `intento ${k}: calidad base distinta`);
  if (base.contrato.rival) { conRival++; ok(v.detalle.duelo === jugado.completo.duel, `intento ${k}: duelo distinto`); }
  imprevistos += jugado.decisiones.length;
  maxDec = Math.max(maxDec, jugado.decisiones.length);
  v.detalle.incidentes.forEach((i) => { claves[i.clave] = (claves[i.clave] || 0) + 1; });
  // Repetir dos veces da lo mismo (sin estado escondido entre validaciones)
  const v2 = V.validate(clon(intento));
  ok(v2.calidad === v.calidad && JSON.stringify(v2.detalle.incidentes) === JSON.stringify(v.detalle.incidentes), `intento ${k}: segunda validación distinta`);
  honestos.push({ base, intento, jugado, v });
}
console.log(`1. Honestos: ${honestos.filter((h) => h.v.valido).length}/${N} validados · ${imprevistos} imprevistos (máx. ${maxDec} por evento, ${Object.keys(claves).length} tipos) · ${conRival} duelos`);

/* ---------- 1b. Plan de cámaras a mano (intento.colocacion) ---------- */
{
  // La colocación del automático pasada a índices de equipo.equip / equipo.staff (lo que mandaría el juego)
  const aIndices = (intento, col) => {
    const est = C.Intento.crearEstado(C.Game, clon(intento));
    return col.map((x) => Object.assign({ p: x.p, e: est.equipIds.indexOf(x.e) }, x.o ? { o: est.staffIds.indexOf(x.o) } : x.o === 0 ? { o: null } : {}));
  };
  const planDe = (intento) => {
    const est = C.Intento.crearEstado(C.Game, clon(intento));
    return C.Game.cameraPlan(est.s, est.s.contracts[0], est.equipIds, est.staffIds);
  };
  let manuales = 0, distintos = 0, rechazados = 0, trampas = 0;
  honestos.slice(0, 120).forEach((h, k) => {
    const plan = planDe(h.base);
    const cams = plan.camaras;
    if (cams.length < 2 || plan.positions.length < 2) return;
    // Mover la primera cámara colocada a otra posición posible (o cambiarla con la que está ahí)
    const col = plan.colocacion.map((x) => ({ p: x.p, e: x.e }));
    if (!col.length) return;
    const otra = plan.positions.find((p) => p.key !== col[0].p && !(p.perfil === 'aerea'));
    if (!otra) return;
    const ocupa = col.find((x) => x.p === otra.key);
    if (ocupa) ocupa.p = col[0].p;
    col[0].p = otra.key;
    const colI = aIndices(h.base, col);
    const conCol = Object.assign(clon(h.base), { colocacion: colI });
    let jugado;
    try { jugado = jugarCliente(conCol, azar); } catch (e) {
      // Una colocación imposible (p. ej. un dron en el piso): el cliente tampoco puede jugarla
      ok(e.motivo === 'colocacion_invalida', `colocación ${k}: el cliente falló por otra cosa (${e.message})`);
      const v = V.validate(Object.assign(clon(conCol), { decisiones: [] }));
      ok(!v.valido && v.detalle.motivo === 'colocacion_invalida', `colocación ${k}: el servidor aceptó una colocación imposible (${v.detalle.motivo})`);
      rechazados++;
      return;
    }
    manuales++;
    const intento = Object.assign(clon(conCol), { decisiones: jugado.decisiones, cliente_resultado: jugado.resultado });
    const v = V.validate(clon(intento));
    ok(v.valido === true && v.calidad === jugado.resultado.quality, `colocación ${k}: no validó (${v.detalle.motivo}: ${v.detalle.mensaje})`);
    if (v.detalle.base !== h.v.detalle.base) distintos++;
    // Trampa: decir el resultado del plan a mano pero mandar el intento sin la colocación (o con otra)
    const sin = Object.assign(clon(intento), { colocacion: undefined });
    delete sin.colocacion;
    const vs = V.validate(sin);
    if (vs.calidad !== jugado.resultado.quality || !vs.valido) { trampas++; ok(!vs.valido, `colocación ${k}: el resultado del plan a mano pasó sin la colocación`); }
  });
  console.log(`1b. Plan de cámaras a mano: ${manuales} jugados y validados (${distintos} con otra calidad base que el automático) · ${rechazados} imposibles rechazados · ${trampas} trampas detectadas`);
  ok(manuales >= 20 && distintos >= 10, `muy pocos intentos con plan de cámaras a mano (${manuales}, ${distintos} distintos)`);
  // Colocaciones mal formadas o imposibles: el servidor las rechaza siempre
  const h = honestos.find((x) => planDe(x.base).camaras.length >= 1 && x.base.equipo.equip.some((e) => G.CATALOG[e.type].cat !== 'cam'));
  if (h) {
    const plan = planDe(h.base);
    const pos0 = plan.positions[0].key;
    const malos = {
      'índice fuera de rango': [{ p: pos0, e: 99 }],
      'posición que no existe': [{ p: 'cabina_del_vecino', e: 0 }],
      'no es lista': { p: pos0, e: 0 },
      'operador fuera de rango': [{ p: pos0, e: 0, o: 50 }],
      'equipo que no es cámara': [{ p: pos0, e: h.base.equipo.equip.findIndex((e) => G.CATALOG[e.type].cat !== 'cam') }],
      'cámara repetida': [{ p: plan.positions[0].key, e: 0 }, { p: (plan.positions[1] || plan.positions[0]).key, e: 0 }],
      'texto en vez de número': [{ p: pos0, e: '0' }],
    };
    Object.keys(malos).forEach((n) => {
      const v = V.validate(Object.assign(clon(h.intento), { colocacion: malos[n] }));
      ok(!v.valido && v.calidad === null && v.detalle.motivo === 'colocacion_invalida', `colocación mala (${n}) aceptada: ${v.detalle.motivo}`);
    });
    // Un dron en una posición fija: imposible
    const conDron = clon(h.base);
    conDron.equipo.equip.push({ type: 'dron_dgi_micro_4_pro', condition: 90 });
    conDron.equipo.staff.push({ name: 'Piloto', role: 'piloto_dron', skill: 3 });
    const pFija = planDe(conDron).positions.find((p) => p.perfil !== 'aerea' && p.perfil !== 'grua');
    if (pFija) {
      const v = V.validate(Object.assign(clon(conDron), { decisiones: [], colocacion: [{ p: pFija.key, e: conDron.equipo.equip.length - 1 }] }));
      ok(!v.valido && v.detalle.motivo === 'colocacion_invalida', `un dron en «${pFija.key}» debería ser imposible (${v.detalle.motivo})`);
    }
  }
}

/* ---------- 1c. Cámaras libres: colocación con coordenadas (x, y de 0 a 100) ---------- */
{
  const aIndices = (intento, col) => {
    const est = C.Intento.crearEstado(C.Game, clon(intento));
    return col.map((x) => Object.assign({ p: x.p, e: est.equipIds.indexOf(x.e) }, x.x !== undefined ? { x: x.x, y: x.y } : {}));
  };
  const estDe = (intento) => C.Intento.crearEstado(C.Game, clon(intento));
  let movidos = 0, distintos = 0, prohibidos = 0;
  honestos.slice(0, 80).forEach((h, k) => {
    const est = estDe(h.base);
    const c = est.s.contracts[0];
    const plan = C.Game.cameraPlan(est.s, c, est.equipIds, est.staffIds);
    const geo = C.Game.camGeo(c);
    const o = plan.positions.find((p) => p.asignado && p.kind !== 'aereo');
    if (!o || !geo) return;
    // Mover esa cámara un 30 % hacia lo que filma (si el sitio se puede usar)
    const x = Math.round(o.nx + 0.3 * (o.tx - o.nx)), y = Math.round(o.ny + 0.3 * (o.ty - o.ny));
    const col = plan.colocacion.map((z) => (z.p === o.key ? { p: z.p, e: z.e, x, y } : { p: z.p, e: z.e }));
    const conCol = Object.assign(clon(h.base), { colocacion: aIndices(h.base, col) });
    let jugado;
    try { jugado = jugarCliente(conCol, azar); } catch (e) {
      ok(e.motivo === 'colocacion_invalida', `cámara movida ${k}: el cliente falló por otra cosa (${e.message})`);
      const v = V.validate(Object.assign(clon(conCol), { decisiones: [] }));
      ok(!v.valido && v.detalle.motivo === 'colocacion_invalida', `cámara movida ${k}: el servidor aceptó un sitio prohibido (${v.detalle.motivo})`);
      prohibidos++;
      return;
    }
    movidos++;
    const v = V.validate(Object.assign(clon(conCol), { decisiones: jugado.decisiones, cliente_resultado: jugado.resultado }));
    ok(v.valido === true && v.calidad === jugado.resultado.quality, `cámara movida ${k}: no validó (${v.detalle.motivo}: ${v.detalle.mensaje})`);
    if (v.detalle.base !== h.v.detalle.base) distintos++;
  });
  console.log(`1c. Cámaras libres: ${movidos} intentos con una cámara movida, jugados y validados (${distintos} con otra calidad base) · ${prohibidos} sitios prohibidos rechazados`);
  ok(movidos >= 20, `muy pocos intentos con cámaras movidas (${movidos})`);
  const h = honestos[0];
  const malos = { 'x sin y': [{ p: 'x', e: 0, x: 5 }], 'fuera de rango': [{ p: 'x', e: 0, x: -1, y: 5 }], 'texto': [{ p: 'x', e: 0, x: '5', y: 5 }], 'decimales': [{ p: 'x', e: 0, x: 5, y: 5.5 }] };
  const pos0 = C.Game.cameraPlan(estDe(h.base).s, estDe(h.base).s.contracts[0], estDe(h.base).equipIds, estDe(h.base).staffIds).positions[0].key;
  Object.keys(malos).forEach((n) => {
    const v = V.validate(Object.assign(clon(h.intento), { colocacion: malos[n].map((z) => Object.assign({}, z, { p: pos0 })) }));
    ok(!v.valido && v.calidad === null && v.detalle.motivo === 'colocacion_invalida', `coordenadas malas (${n}) aceptadas: ${v.detalle.motivo}`);
  });
}

/* ---------- 2. Trampas ---------- */
const T = {};
const anota = (nombre, detectada, inofensiva) => {
  T[nombre] = T[nombre] || { intentos: 0, detectadas: 0, inofensivas: 0 };
  T[nombre].intentos++;
  if (detectada) T[nombre].detectadas++; else if (inofensiva) T[nombre].inofensivas++;
};
// Una trampa "pasa" solo si el resultado que reclama el cliente es EXACTAMENTE lo que el servidor calcula con los
// datos del servidor; en ese caso no gana nada (inofensiva). Nunca se acepta un resultado distinto al del servidor.
function revisarTrampa(nombre, intento, k) {
  const v = V.validate(clon(intento));
  if (!v.valido) { anota(nombre, true); return v; }
  const real = V.validate(Object.assign(clon(intento), { cliente_resultado: null }));
  const igual = real.calidad === intento.cliente_resultado.quality && real.estrellas === intento.cliente_resultado.stars;
  ok(igual, `${nombre} ${k}: se aceptó un resultado que no es el del servidor`);
  anota(nombre, false, igual);
  return v;
}

honestos.forEach(({ base, intento, jugado }, k) => {
  // a) Calidad inventada / estrellas inventadas
  const q = jugado.resultado.quality;
  const fq = Object.assign(clon(intento), { cliente_resultado: { quality: q < 100 ? q + 1 : q - 1, stars: jugado.resultado.stars } });
  const va = V.validate(fq); anota('calidad inventada', !va.valido); ok(!va.valido && va.detalle.motivo === 'resultado_no_coincide', `calidad inventada ${k} no detectada`);
  const fs5 = Object.assign(clon(intento), { cliente_resultado: { quality: q, stars: jugado.resultado.stars === 5 ? 4 : 5 } });
  const vb = V.validate(fs5); anota('estrellas inventadas', !vb.valido); ok(!vb.valido, `estrellas inventadas ${k} no detectadas`);

  // b) Decisión cambiada (el cliente dice que eligió otra cosa, pero reclama el resultado bueno)
  if (jugado.decisiones.length) {
    const i = ri(0, jugado.decisiones.length - 1);
    const d = clon(jugado.decisiones);
    d[i] = (d[i] + ri(1, 3)) % 3;
    if (d[i] !== jugado.decisiones[i]) revisarTrampa('decisión cambiada', Object.assign(clon(intento), { decisiones: d }), k);
    // Jugar de verdad con otra decisión y mandar decisiones originales (o al revés): mezclar jugadas
    const otro = jugarCliente(base, (inc, n) => (n === i ? (inc.choices.find((c) => c.ok && c.i !== jugado.decisiones[i]) || inc.choices.find((c) => c.ok)).i : jugado.decisiones[n] !== undefined && inc.choices[jugado.decisiones[n]] && inc.choices[jugado.decisiones[n]].ok ? jugado.decisiones[n] : azar(inc)));
    if (otro.resultado.quality !== q) revisarTrampa('resultado de otra jugada', Object.assign(clon(intento), { cliente_resultado: otro.resultado }), k);
  }

  // c) Equipo cambiado: el cliente juega con equipo mejor que el registrado y manda ese resultado
  const mejor = clon(base);
  mejor.equipo.equip = mejor.equipo.equip.map((e) => Object.assign(e, { condition: 100, type: G.CATALOG[e.type].cat === 'cam' ? 'cam_cine' : e.type }));
  mejor.equipo.equip.push({ type: 'router4g', condition: 100 }, { type: 'ups', condition: 100 }, { type: 'raincover', condition: 100 }, { type: 'switch_pro', condition: 100 });
  mejor.equipo.staff.forEach((p) => { p.skill = TOP; p.morale = 100; });
  let jm = null;
  try { jm = jugarCliente(mejor, azar); } catch (e) { /* no pasa */ }
  if (jm) revisarTrampa('equipo cambiado', Object.assign(clon(intento), { decisiones: jm.decisiones, cliente_resultado: jm.resultado }), k);

  // d) Semilla cambiada: el cliente reintenta con otra semilla hasta tener suerte
  const otraSemilla = Object.assign(clon(base), { seed: (base.seed + ri(1, 1e6)) | 0 });
  const js = jugarCliente(otraSemilla, azar);
  revisarTrampa('semilla cambiada', Object.assign(clon(intento), { decisiones: js.decisiones, cliente_resultado: js.resultado }), k);

  // e) Opciones fuera de rango / no disponibles / de más / de menos / no enteras
  if (jugado.decisiones.length) {
    const i = ri(0, jugado.decisiones.length - 1);
    const fuera = clon(jugado.decisiones); fuera[i] = elige([9, 7, -1, 99]); // imprevistos v2: hasta 5 opciones en pantalla (0-4)
    const ve = V.validate(Object.assign(clon(intento), { decisiones: fuera }));
    anota('opción fuera de rango', !ve.valido); ok(!ve.valido && ve.detalle.motivo === 'opcion_invalida', `opción fuera de rango ${k}: ${ve.detalle.motivo}`);
    const raro = clon(jugado.decisiones); raro[i] = elige([0.5, '1', null, true, [0]]);
    const vr = V.validate(Object.assign(clon(intento), { decisiones: raro }));
    anota('decisión no entera', !vr.valido); ok(!vr.valido && vr.detalle.motivo === 'opcion_invalida', `decisión no entera ${k}: ${vr.detalle.motivo}`);
    const menos = jugado.decisiones.slice(0, -1);
    const vm1 = V.validate(Object.assign(clon(intento), { decisiones: menos }));
    anota('faltan decisiones', !vm1.valido); ok(!vm1.valido && vm1.detalle.motivo === 'faltan_decisiones', `faltan decisiones ${k}: ${vm1.detalle.motivo}`);
  }
  const mas = jugado.decisiones.concat([0]);
  const vm2 = V.validate(Object.assign(clon(intento), { decisiones: mas }));
  anota('sobran decisiones', !vm2.valido); ok(!vm2.valido && vm2.detalle.motivo === 'sobran_decisiones', `sobran decisiones ${k}: ${vm2.detalle.motivo}`);
  // Opción no disponible: buscar un imprevisto con una opción bloqueada y elegirla
  let n = -1, bloqueada = -1;
  jugarCliente(base, (inc, m) => {
    if (n < 0) { const b = inc.choices.find((c) => !c.ok); if (b) { n = m; bloqueada = b.i; } }
    return jugado.decisiones[m];
  });
  if (n >= 0) {
    const d = clon(jugado.decisiones); d[n] = bloqueada;
    const vn = V.validate(Object.assign(clon(intento), { decisiones: d }));
    anota('opción no disponible', !vn.valido); ok(!vn.valido && vn.detalle.motivo === 'opcion_no_disponible', `opción no disponible ${k}: ${vn.detalle.motivo}`);
  }
});

// f) Datos mal formados o prohibidos
const h0 = honestos[0].intento;
const malos = {
  'semilla de texto': Object.assign(clon(h0), { seed: 'abc' }),
  'semilla enorme': Object.assign(clon(h0), { seed: 2 ** 40 }),
  'decisiones no lista': Object.assign(clon(h0), { decisiones: '0,1' }),
  'demasiadas decisiones': Object.assign(clon(h0), { decisiones: new Array(50).fill(0) }),
  'rol inventado': (() => { const x = clon(h0); x.equipo.staff[0].role = 'mago'; return x; })(),
  'habilidad 99': (() => { const x = clon(h0); x.equipo.staff[0].skill = 99; return x; })(),
  'equipo inventado': (() => { const x = clon(h0); x.equipo.equip[0].type = 'cam_dios'; return x; })(),
  'estado 150': (() => { const x = clon(h0); x.equipo.equip[0].condition = 150; return x; })(),
  'sin personal': (() => { const x = clon(h0); x.equipo.staff = []; return x; })(),
  'sin equipos': (() => { const x = clon(h0); x.equipo.equip = []; return x; })(),
  '13 personas': (() => { const x = clon(h0); x.equipo.staff = new Array(13).fill(0).map(() => ({ role: 'cam', skill: 1 })); return x; })(),
  'dos dueños': (() => { const x = clon(h0); x.equipo.staff = [{ role: 'cam', skill: 1, owner: true }, { role: 'dir', skill: 1, owner: true }]; return x; })(),
  'evento inventado': (() => { const x = clon(h0); x.contrato.type = 'mundial'; return x; })(),
  'dificultad 9': (() => { const x = clon(h0); x.contrato.diff = 9; return x; })(),
  'duelo sin calidad rival': (() => { const x = clon(h0); x.contrato.rival = true; delete x.contrato.rivalQuality; return x; })(),
  '__proto__ en el personal': (() => { const x = JSON.parse(JSON.stringify(h0).replace('"role":', '"__proto__":{"skill":5},"role":')); return x; })(),
  'fama 500': Object.assign(clon(h0), { contexto: { fama: 500 } }),
  'repuesto inventado': Object.assign(clon(h0), { contexto: { stock: { oro: 3 } } }),
  'no es objeto': [1, 2, 3],
};
Object.keys(malos).forEach((k) => {
  const v = V.validate(malos[k]);
  if (k === '__proto__ en el personal') { ok(!Object.prototype.skill, '__proto__ contaminó Object.prototype'); return; }
  anota('datos mal formados', !v.valido);
  ok(!v.valido && v.detalle.motivo, `datos mal formados "${k}" se aceptaron`);
});
// Equipos VIP SIN el Pase VIP (vip: false): valen igual (lo comprado con créditos funciona siempre; decisión de Dimitry, oct. 2026)
{
  const vipK = Object.keys(G.CATALOG).find((k) => G.CATALOG[k].vip);
  if (vipK) {
    const x = Object.assign(clon(h0), { vip: false, cliente_resultado: undefined });
    x.equipo.equip.push({ type: vipK, condition: 100 });
    const v = V.validate(x);
    ok(v.valido === true && v.coincide === null, `un equipo VIP sin el Pase VIP debe valer (${v.detalle && v.detalle.motivo})`);
  }
}
// Sin cliente_resultado: vale el resultado del servidor (coincide = null)
const sinCliente = V.validate(Object.assign(clon(h0), { cliente_resultado: undefined }));
ok(sinCliente.valido === true && sinCliente.coincide === null && sinCliente.calidad === honestos[0].v.calidad, 'sin cliente_resultado debe valer el del servidor');

// g) La guardia de Math.random: si la lógica lo usara en el evento, el intento se rechaza
{
  const m = V.motorActual();
  const orig = m.G.resolveIncident;
  m.G.resolveIncident = function () { Math.random(); return orig.apply(this, arguments); };
  const v = V.validate(clon(honestos.find((h) => h.jugado.decisiones.length).intento));
  m.G.resolveIncident = orig;
  ok(!v.valido && v.detalle.motivo === 'logica_no_determinista', `la guardia de Math.random no funcionó (${v.detalle.motivo})`);
  ok(typeof Math.random() === 'number', 'Math.random quedó roto después de la guardia');
}

console.log('2. Trampas:');
let trampaMal = 0;
Object.keys(T).forEach((k) => {
  const x = T[k];
  const pasa = x.intentos - x.detectadas - x.inofensivas;
  trampaMal += pasa;
  console.log(`   ${k.padEnd(26)} ${String(x.detectadas).padStart(4)}/${String(x.intentos).padEnd(4)} detectadas${x.inofensivas ? ` · ${x.inofensivas} inofensivas (el resultado reclamado era justo el del servidor)` : ''}`);
});

/* ---------- 3. Rendimiento ---------- */
// Medir otra vez en caliente (los primeros intentos incluyen la compilación de la lógica)
const caliente = [];
for (let vuelta = 0; vuelta < 3; vuelta++) honestos.forEach((h) => { const t0 = process.hrtime.bigint(); V.validate(clon(h.intento)); caliente.push(Number(process.hrtime.bigint() - t0) / 1e6); });
const prom = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const p = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
console.log(`3. Rendimiento: primera pasada ${prom(tiempos).toFixed(3)} ms promedio (máx ${Math.max(...tiempos).toFixed(2)} ms) · en caliente ${prom(caliente).toFixed(3)} ms promedio, p95 ${p(caliente, 0.95).toFixed(3)} ms, máx ${Math.max(...caliente).toFixed(2)} ms (${caliente.length} validaciones)`);
ok(prom(tiempos) < 20, `validación lenta: ${prom(tiempos).toFixed(2)} ms promedio`);
ok(prom(caliente) < 20, `validación lenta en caliente: ${prom(caliente).toFixed(2)} ms promedio`);

/* ---------- 4. Modo consola ---------- */
{
  const t0 = Date.now();
  const sp = spawnSync(process.execPath, [path.join(__dirname, 'validador.js')], { input: JSON.stringify(honestos[1].intento), encoding: 'utf8' });
  const ms = Date.now() - t0;
  let out = null; try { out = JSON.parse(sp.stdout); } catch (e) { /* abajo */ }
  ok(sp.status === 0 && out && out.valido === true && out.calidad === honestos[1].v.calidad, `modo consola: ${sp.status} ${sp.stdout} ${sp.stderr}`);
  const malo = spawnSync(process.execPath, [path.join(__dirname, 'validador.js')], { input: '{no es json', encoding: 'utf8' });
  ok(malo.status === 1 && /json_invalido/.test(malo.stdout), 'modo consola con JSON roto');
  console.log(`4. Consola: ${out && out.valido ? 'ok' : 'FALLA'} (${ms} ms por llamada, incluye arrancar Node)`);
}

/* ---------- 5. Servicio HTTP y ayudante PHP ---------- */
function pedir(puerto, metodo, ruta, cuerpo, clave) {
  return new Promise((res) => {
    const h = { 'Content-Type': 'application/json' };
    if (clave !== undefined) h['X-Validador-Clave'] = clave;
    // Conexión reutilizada (keep-alive), como un cliente que manda muchos intentos seguidos
    const q = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: h, agent: agente }, (r2) => {
      let d = ''; r2.on('data', (b) => { d += b; }); r2.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { /* */ } res({ codigo: r2.statusCode, j }); });
    });
    q.on('error', (e) => res({ codigo: 0, error: e.message }));
    if (cuerpo !== undefined) q.write(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    q.end();
  });
}
const agente = new http.Agent({ keepAlive: true, maxSockets: 1 });
async function esperar(puerto, clave) {
  for (let i = 0; i < 50; i++) { const r2 = await pedir(puerto, 'GET', '/salud', undefined, clave); if (r2.codigo === 200) return true; await new Promise((x) => setTimeout(x, 100)); }
  return false;
}

async function pruebaHttp() {
  const puerto = 18790 + Math.floor((process.pid % 1000));
  const clave = 'prueba-' + require('crypto').randomBytes(16).toString('hex');
  // Sin clave no arranca
  const sinClave = spawnSync(process.execPath, [path.join(__dirname, 'servidor.js')], { env: Object.assign({}, process.env, { VALIDADOR_CLAVE: '', VALIDADOR_PUERTO: String(puerto) }), encoding: 'utf8', timeout: 5000 });
  ok(sinClave.status === 1, 'el servicio arrancó sin clave');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'validador-'));
  const archivoClave = path.join(tmp, 'clave');
  fs.writeFileSync(archivoClave, clave + '\n', { mode: 0o600 });
  const srv = spawn(process.execPath, [path.join(__dirname, 'servidor.js')], {
    env: Object.assign({}, process.env, { VALIDADOR_CLAVE: '', VALIDADOR_CLAVE_ARCHIVO: archivoClave, VALIDADOR_PUERTO: String(puerto), NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' }), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; srv.stdout.on('data', (b) => { log += b; }); srv.stderr.on('data', (b) => { log += b; });
  try {
    ok(await esperar(puerto, clave), 'el servicio HTTP no arrancó: ' + log);
    const s0 = await pedir(puerto, 'GET', '/salud', undefined, clave);
    ok(s0.j && s0.j.ok && s0.j.version_logica === V.info().version_logica, '/salud');
    ok((await pedir(puerto, 'POST', '/validar', honestos[2].intento)).codigo === 401, 'sin clave debe dar 401');
    ok((await pedir(puerto, 'POST', '/validar', honestos[2].intento, clave + 'x')).codigo === 401, 'clave mala debe dar 401');
    ok((await pedir(puerto, 'GET', '/validar', undefined, clave)).codigo === 405, 'GET /validar debe dar 405');
    ok((await pedir(puerto, 'POST', '/otra', {}, clave)).codigo === 404, 'ruta desconocida debe dar 404');
    ok((await pedir(puerto, 'POST', '/validar', '{roto', clave)).codigo === 400, 'JSON roto debe dar 400');
    ok((await pedir(puerto, 'POST', '/validar', 'x'.repeat(300 * 1024), clave)).codigo === 413, 'cuerpo enorme debe dar 413');
    // 50 intentos por HTTP: mismos resultados que directo; las trampas siguen detectándose
    const t0 = Date.now();
    let iguales = 0;
    for (const h of honestos.slice(0, 50)) {
      const rr = await pedir(puerto, 'POST', '/validar', h.intento, clave);
      if (rr.codigo === 200 && rr.j.valido && rr.j.calidad === h.v.calidad && rr.j.estrellas === h.v.estrellas) iguales++;
      else console.error('    HTTP distinto:', rr.codigo, rr.error || (rr.j && rr.j.detalle && rr.j.detalle.motivo));
    }
    const msHttp = (Date.now() - t0) / 50;
    ok(iguales === 50, `HTTP: ${iguales}/50 iguales`);
    const tr = await pedir(puerto, 'POST', '/validar', Object.assign(clon(honestos[3].intento), { cliente_resultado: { quality: 100, stars: 5 } }), clave);
    ok(tr.codigo === 200 && tr.j.valido === false, 'HTTP: trampa no detectada');
    console.log(`5. HTTP: ${iguales}/50 iguales, ${msHttp.toFixed(2)} ms por pedido (ida y vuelta)`);

    // Ayudante PHP del README (curl con clave y, si el servicio no responde, el modo consola)
    const php = spawnSync('php', ['-v'], { encoding: 'utf8' });
    if (php.status !== 0) { console.log('6. PHP: no hay php en esta máquina, se salta'); return; }
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    const m = readme.match(/```php\n([\s\S]*?)```/);
    ok(!!m, 'README sin bloque ```php');
    if (!m) return;
    const ayudante = path.join(tmp, 'ayudante.php');
    fs.writeFileSync(ayudante, m[1]);
    const prueba = path.join(tmp, 'prueba.php');
    fs.writeFileSync(prueba, `<?php
require ${JSON.stringify(ayudante)};
$i = json_decode(stream_get_contents(STDIN), true);
$r = envivo_validar_intento($i, ['url' => getenv('VURL'), 'clave' => getenv('VCLAVE'), 'script' => ${JSON.stringify(path.join(__dirname, 'validador.js'))}, 'node' => ${JSON.stringify(process.execPath)}]);
echo json_encode($r);
`);
    const correrPhp = (url, intento) => spawnSync('php', [prueba], { input: JSON.stringify(intento), encoding: 'utf8', env: Object.assign({}, process.env, { VURL: url, VCLAVE: clave, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' }) });
    const a = correrPhp(`http://127.0.0.1:${puerto}`, honestos[4].intento);
    let ja = null; try { ja = JSON.parse(a.stdout); } catch (e) { /* */ }
    ok(ja && ja.valido === true && ja.calidad === honestos[4].v.calidad && ja.via === 'http', `PHP por HTTP: ${a.stdout} ${a.stderr}`);
    const b = correrPhp('http://127.0.0.1:9', honestos[4].intento); // nadie escucha: respaldo por consola
    let jb = null; try { jb = JSON.parse(b.stdout); } catch (e) { /* */ }
    ok(jb && jb.valido === true && jb.calidad === honestos[4].v.calidad && jb.via === 'consola', `PHP respaldo consola: ${b.stdout} ${b.stderr}`);
    const c = correrPhp(`http://127.0.0.1:${puerto}`, Object.assign(clon(honestos[4].intento), { cliente_resultado: { quality: 100, stars: 5 } }));
    let jc = null; try { jc = JSON.parse(c.stdout); } catch (e) { /* */ }
    ok(jc && jc.valido === false, `PHP trampa: ${c.stdout}`);
    console.log(`6. PHP: por HTTP ${ja && ja.valido ? 'ok' : 'FALLA'} · respaldo por consola ${jb && jb.valido ? 'ok' : 'FALLA'} · trampa ${jc && jc.valido === false ? 'detectada' : 'FALLA'}`);
  } finally {
    agente.destroy();
    srv.kill('SIGTERM');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

pruebaHttp().then(() => {
  ok(trampaMal === 0, `${trampaMal} trampas aceptadas con un resultado distinto al del servidor`);
  console.log(fallas ? `\n❌ ${fallas} de ${pruebas} comprobaciones fallaron` : `\n✅ ${pruebas} comprobaciones, todo bien`);
  process.exit(fallas ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
