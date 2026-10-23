#!/usr/bin/env node
/* =========================================================
   EN VIVO Tycoon — Motor de batalla de la Copa de Servidores (ver server/COPAS.md, "Motor de batalla")
   Juega un CRUCE servidor contra servidor: 5 "partidos" (transmisiones). En el partido n el equipo n del plantel A
   y el equipo n del plantel B (ordenados por poder) cubren el MISMO contrato, con la MISMA semilla y la MISMA lista
   de imprevistos (contrato.imprevistos, como en los duelos). Gana el partido la mayor calidad.
   Usa EXACTAMENTE las reglas del validador (server/validador/validador.js → js/logic.js) con un estado de intento
   (s.intento = true: las extensiones del cliente, sede y temporadas, nunca aplican) y la política "prudente" de
   server/eventos/motor.js. Cada lado se repite con el validador: lo que sale aquí lo repite Repeticion::validar.

   Como módulo:
     const B = require('./batalla.js');
     B.jugarCruce({ seed, torneo, contratos: [5], planA: [≤5 equipos], planB: [≤5 equipos], contexto? })
       Cada equipo puede traer "bono" (0..12, ventajas pagadas, server/MONETIZACION.md §1): se suma a la calidad YA
       validada de su partido (tope 100). Fuera de rango se recorta; si no es número, 0. El equipo de la casa: 0.
     B.poder(equipo)            → entero (para ordenar planteles en PHP)
     B.equipoCasa(contrato)     → { staff, equip } (equipo de la casa para ese contrato)
     B.contratosDe(torneo)      → los 5 contratos estándar del torneo
     B.TORNEOS                  → { clave: { nombre, deporte, cadena, tipos: [5] } }
   Por consola (una línea JSON por stdout):
     node server/eventos/batalla.js < cruce.json                     (el cruce: igual que jugarCruce)
     { "accion": "poder", "equipo": {...} }    → { ok, poder }
     { "accion": "torneos" }                   → { ok, torneos }
     { "accion": "contratos", "torneo": "..." }→ { ok, contratos }
     { "accion": "casa", "contrato": {...} }   → { ok, equipo }
   Ver server/eventos/LEEME_BATALLA.md.
   ========================================================= */
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', 'validador', 'validador.js'));
const Intento = require(path.join(__dirname, '..', 'validador', 'intento.js'));
const Motor = require(path.join(__dirname, 'motor.js'));

const PARTIDOS = 5;
const POLITICA = 'prudente';
const MAX_ENTRADA = 512 * 1024;
/* Igual para los dos lados de todos los partidos (la exigencia del cliente depende de la fama): el de los duelos. */
const CONTEXTO = { fama: 30, dinero: 1000, stock: { cable: 1, battery: 1 } };
/* Equipo de la casa: personal de habilidad 2 (junior) y equipos normales del catálogo al 85 % (como el kit de duelo). */
const CASA = { habilidad: 2, nivel: 'junior', moral: 80, estado: 85 };
const CONTRATO_CLAVES = ['type', 'client', 'cams', 'audio', 'stream', 'outdoor', 'diff', 'pay'];
/* Bono de ventajas por equipo (MONETIZACION.md §1): techo de lo pagado en competencia. */
const BONO_MAX = 12;
const bonoDe = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(BONO_MAX, Math.round(v))) : 0);

/* Torneos (parodias; rotan por semana). tipos: el tipo de evento de cada uno de los 5 partidos. */
const TORNEOS = {
  copa_planeta_balompie: { nombre: 'Copa Planeta de Balompié', deporte: 'futbol', cadena: 'Red Mundovisión Planeta',
    tipos: ['ligapro', 'ligapro', 'final', 'ligapro', 'final'] },
  copa_libertadores_sur: { nombre: 'Copa de los Libertadores del Sur', deporte: 'futbol', cadena: 'Señal Cóndor Continental',
    tipos: ['ligapro', 'ligapro', 'ligapro', 'ligapro', 'final'] },
  liga_estelar_clubes: { nombre: 'Liga Estelar de Clubes', deporte: 'futbol', cadena: 'Canal Galaxia Deportiva',
    tipos: ['ligapro', 'final', 'ligapro', 'final', 'final'] },
  mundial_aro_tablero: { nombre: 'Mundial de Aro y Tablero', deporte: 'basquet', cadena: 'Aro y Red Televisión Global',
    tipos: ['concierto', 'concierto', 'concierto', 'concierto', 'concierto'] },
  juegos_cinco_continentes: { nombre: 'Juegos de los Cinco Continentes', deporte: 'multideporte', cadena: 'Antorcha Mundial TV',
    tipos: ['concierto', 'boxeo', 'lucha_libre', 'ligapro', 'final'] },
  gran_premio_formula_veloz: { nombre: 'Gran Premio Fórmula Veloz', deporte: 'autos', cadena: 'Bandera a Cuadros Network',
    tipos: ['lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos', 'lanzamiento_autos'] },
  la_pelea_del_siglo: { nombre: 'La Pelea del Siglo', deporte: 'boxeo', cadena: 'Cuadrilátero Mundial Pago por Ver',
    tipos: ['lucha_libre', 'lucha_libre', 'boxeo', 'boxeo', 'boxeo'] },
  el_gran_tazon: { nombre: 'El Gran Tazón', deporte: 'futbol_americano', cadena: 'Cadena Ovalada Intercontinental',
    tipos: ['ligapro', 'final', 'concierto', 'final', 'final'] },
};

class ErrorBatalla extends Error { constructor(motivo, mensaje) { super(mensaje || motivo); this.motivo = motivo; } }
const falla = (motivo, mensaje) => { throw new ErrorBatalla(motivo, mensaje); };
const esObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

let datosCache = null;
function claseCamara() {
  if (!datosCache) { try { datosCache = require(path.join(V.RAIZ, 'js', 'datos.js')); } catch (e) { datosCache = {}; } }
  return datosCache.CLASE_CAMARA || {};
}

/* Guardia de todo el cruce: Math.random está prohibido (rompería el determinismo), igual que en el validador. */
function sinAzar(fn) {
  const rnd = Math.random;
  Math.random = () => { throw new ErrorBatalla('logica_no_determinista', 'Se usó Math.random durante la batalla: no se puede repetir.'); };
  try { return fn(); } finally { Math.random = rnd; }
}

function semillaDe(v) {
  if (typeof v === 'string' && /^-?\d{1,10}$/.test(v)) v = Number(v);
  if (!Number.isSafeInteger(v) || v < -2147483648 || v > 4294967295) falla('semilla_invalida', 'La semilla debe ser un entero de 32 bits.');
  return v | 0;
}

/* ---------- Contratos ---------- */
/* Solo los campos que importan (nada de internacional, rival ni historia), con los mismos valores por defecto que intento.js. */
function normalizarContrato(G, c, i) {
  if (!esObj(c)) falla('contrato_invalido', `Contrato ${i + 1}: formato inválido.`);
  if (typeof c.type !== 'string' || !tiene(G.EVENT_TYPES, c.type)) falla('contrato_invalido', `Contrato ${i + 1}: tipo de evento desconocido (${String(c.type)}).`);
  const t = G.EVENT_TYPES[c.type];
  const o = {};
  CONTRATO_CLAVES.forEach((k) => { if (c[k] !== undefined) o[k] = c[k]; });
  if (o.cams === undefined) o.cams = t.cams[1];
  if (o.diff === undefined) o.diff = t.diff;
  if (o.pay === undefined) o.pay = t.pay[0];
  o.audio = o.audio === undefined ? !!t.audio : !!o.audio;
  o.stream = o.stream === undefined ? true : !!o.stream; // en la copa todo se transmite
  o.outdoor = o.outdoor === undefined ? (t.outdoor || 0) >= 0.5 : !!o.outdoor;
  if (!Number.isInteger(o.cams) || o.cams < 1 || o.cams > 12) falla('contrato_invalido', `Contrato ${i + 1}: cams debe ser entero de 1 a 12.`);
  if (!Number.isInteger(o.diff) || o.diff < 1 || o.diff > 5) falla('contrato_invalido', `Contrato ${i + 1}: diff debe ser entero de 1 a 5.`);
  return o;
}

function contratosDe(torneo) {
  const T = TORNEOS[torneo];
  if (!T) falla('torneo_invalido', `Torneo desconocido (${String(torneo)}).`);
  const G = V.motorActual().G;
  return T.tipos.map((tipo, i) => normalizarContrato(G, { type: tipo, client: T.nombre }, i));
}

/* ---------- Equipo de la casa ---------- */
const casaCache = new Map();
function equipoCasa(contrato) {
  const m = V.motorActual();
  const G = m.G;
  const c = normalizarContrato(G, contrato, 0);
  const llave = m.version + '|' + JSON.stringify([c.type, c.cams, c.diff, c.audio, c.stream, c.outdoor]);
  if (casaCache.has(llave)) return JSON.parse(casaCache.get(llave));
  const CLASE = claseCamara();
  const tope = Intento.LIMITES.staff;
  // Personal: el mínimo que pide el contrato de cada rol (crewReq de la lógica); camarógrafos para todas las cámaras si cabe
  const req = G.crewReq(c, []);
  const roles = G.ROLE_KEYS.filter((r) => req[r] && req[r][0] >= 1);
  const cuenta = {};
  roles.forEach((r) => { cuenta[r] = req[r][0]; });
  if (!cuenta.camarografo) cuenta.camarografo = 1;
  const otros = Object.keys(cuenta).reduce((a, r) => a + (r === 'camarografo' ? 0 : cuenta[r]), 0);
  cuenta.camarografo = Math.max(cuenta.camarografo, Math.min(c.cams, tope - otros));
  const staff = [];
  G.ROLE_KEYS.forEach((r) => {
    for (let k = 0; k < (cuenta[r] || 0) && staff.length < tope; k++) {
      staff.push({ role: r, skill: CASA.habilidad, tier: CASA.nivel, morale: CASA.moral, name: 'Casa ' + (G.ROLES[r].name || r) + (cuenta[r] > 1 ? ' ' + (k + 1) : '') });
    }
  });
  const tieneRol = (r) => staff.some((p) => p.role === r);
  // Equipos: lo normal del catálogo (sin VIP, exclusivos ni alquiler; sus requisitos solo pueden ser roles que lleva)
  const qObjetivo = c.diff <= 2 ? 2 : 3;
  const usable = (it) => !it.vip && !it.premium && !it.alquiler && (it.requiere || []).every((r) => tiene(G.ROLES, r) && tieneRol(r));
  const elegir = (filtro) => {
    const cand = Object.keys(G.CATALOG).sort().filter((k) => usable(G.CATALOG[k]) && filtro(G.CATALOG[k]));
    const nota = (k) => { const it = G.CATALOG[k]; return [(it.eventos || []).includes(c.type) ? 0 : 1, Math.abs((it.q || 1) - qObjetivo), it.price || 0]; };
    cand.sort((a, b) => { const x = nota(a), y = nota(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a < b ? -1 : a > b ? 1 : 0; });
    return cand[0] || null;
  };
  const equip = [];
  const pon = (tipo, n) => { if (tipo) for (let k = 0; k < (n || 1); k++) equip.push({ type: tipo, condition: CASA.estado }); };
  const camara = elegir((it) => it.cat === 'cam' && !!CLASE[it.subtipo] && !['ptz', 'pov', 'accion', 'dron', 'movil', 'bolsillo'].includes(CLASE[it.subtipo]));
  if (!camara) falla('casa_sin_camara', 'No hay una cámara normal en el catálogo para el equipo de la casa.');
  pon(camara, c.cams);
  pon(elegir((it) => it.cat === 'support' && /^tripode/.test(it.subtipo || '')), c.cams);
  if (c.cams >= 2) pon(elegir((it) => it.cat === 'switcher'));
  if (c.audio) { pon(elegir((it) => it.cat === 'audio')); pon(elegir((it) => it.cat === 'mics')); }
  if (c.stream) { pon(elegir((it) => it.cat === 'encoder')); pon(elegir((it) => it.cat === 'internet')); }
  if (tieneRol('operador_repeticion')) pon(elegir((it) => it.cat === 'replay'));
  if (tieneRol('operador_graficos')) pon(elegir((it) => it.cat === 'graphics'));
  if (c.diff >= 4 && c.cams >= 3) pon(elegir((it) => it.cat === 'intercom'));
  pon(elegir((it) => it.cat === 'power' && it.subtipo === 'ups'));
  if (c.outdoor) pon(elegir((it) => it.cat === 'rain'));
  const eq = { staff, equip: equip.slice(0, Intento.LIMITES.equip) };
  // Se valida con la lógica: el estado se arma y el evento arranca
  const { s, contractId, staffIds, equipIds } = Intento.crearEstado(G, { seed: 1, contrato: c, equipo: eq, contexto: CONTEXTO });
  const r = G.startEvent(s, contractId, staffIds, equipIds);
  if (!r || !r.ok) falla('casa_invalida', `El equipo de la casa no puede cubrir ${c.type}: ${(r && r.msg) || 'no inicia'}.`);
  casaCache.set(llave, JSON.stringify(eq));
  return eq;
}

/* ---------- Equipos de los jugadores ---------- */
/* Acepta { staff, equip } (formato de la lógica, como Duelos::armarIntento), { equipo: { staff, equip } } o el resumen de
   duelo { personal: [{rol, habilidad, nivel, dueno}], inventario: [{item}] }. Devuelve null si no tiene forma de equipo. */
function formaEquipo(e) {
  if (!esObj(e)) return null;
  if (esObj(e.equipo)) return formaEquipo(Object.assign({}, e.equipo, { vip: e.vip === true || e.equipo.vip === true, bono: tiene(e, 'bono') ? e.bono : e.equipo.bono }));
  if (Array.isArray(e.staff) && Array.isArray(e.equip)) return { staff: e.staff, equip: e.equip, vip: e.vip === true, bono: bonoDe(e.bono) };
  if (Array.isArray(e.personal)) {
    return {
      staff: e.personal.map((p) => (esObj(p) ? Object.assign({ role: p.rol, skill: p.habilidad, tier: p.nivel || 'junior', morale: CASA.moral }, p.dueno === true ? { owner: true } : {}) : p)),
      equip: (Array.isArray(e.inventario) ? e.inventario : []).map((x) => (esObj(x) ? { type: x.item, condition: 100 } : x)),
      vip: e.vip === true,
      bono: bonoDe(e.bono),
    };
  }
  return null;
}

/* Poder de un equipo (para ordenar planteles): personal (habilidad + nivel), variedad de roles, cámaras y apoyo.
   No depende del contrato. Entero ≥ 0; 0 si no es un equipo. */
function poder(equipo) {
  const e = formaEquipo(equipo);
  if (!e) return 0;
  let G;
  try { G = V.motorActual().G; } catch (x) { return 0; }
  const CLASE = claseCamara();
  let pts = 0;
  const roles = new Set();
  e.staff.slice(0, Intento.LIMITES.staff).forEach((p) => {
    if (!esObj(p) || typeof p.role !== 'string' || !tiene(G.ROLES, p.role) || !Number.isInteger(p.skill)) return;
    const sk = Math.max(1, Math.min(5, p.skill));
    const tier = typeof p.tier === 'string' && tiene(G.TIERS, p.tier) ? G.TIERS[p.tier].bonus || 0 : 0;
    pts += (sk + tier) * 4;
    roles.add(G.normRole(p.role));
  });
  pts += roles.size * 3;
  const cams = [];
  e.equip.slice(0, Intento.LIMITES.equip).forEach((x) => {
    if (!esObj(x) || typeof x.type !== 'string' || !tiene(G.CATALOG, x.type)) return;
    const it = G.CATALOG[x.type];
    const cond = Number.isInteger(x.condition) ? Math.max(1, Math.min(100, x.condition)) : 100;
    const v = (it.q || 1) * (0.5 + cond / 200);
    if ((it.cat === 'cam' || it.cat === 'service') && CLASE[it.subtipo]) cams.push(v); else pts += v * 3;
  });
  cams.sort((a, b) => b - a);
  pts += cams.slice(0, 8).reduce((a, v) => a + v * 10, 0);
  return Math.max(0, Math.round(pts));
}

/* ---------- Partidos ---------- */
function intentoDe(seed, contrato, eq, ctx) {
  return { seed, contrato, equipo: { staff: eq.staff, equip: eq.equip }, contexto: ctx, vip: eq.vip === true };
}

/* Imprevistos del partido: los sortea la lógica con el equipo de la casa (neutral) y esa semilla. */
function sortearImprevistos(G, seed, contrato, ctx) {
  const casa = equipoCasa(contrato);
  const { s, contractId, staffIds, equipIds } = Intento.crearEstado(G, intentoDe(seed, contrato, casa, ctx));
  const r = G.startEvent(s, contractId, staffIds, equipIds);
  if (!r || !r.ok) falla('evento_no_inicia', (r && r.msg) || 'No se pudo iniciar.');
  return s.currentEvent.incidents.map((x) => x.key);
}

/* Juega un lado con la política prudente y lo repite con el validador. */
function jugarLado(seed, contrato, eq, ctx) {
  const intento = intentoDe(seed, contrato, eq, ctx);
  const elegir = Motor.POLITICAS[POLITICA];
  const jugado = V.play(intento, (inc) => elegir(inc));
  const r = V.validate(Object.assign({}, intento, { decisiones: jugado.decisiones, cliente_resultado: jugado.resultado }));
  if (!r.valido) falla((r.detalle && r.detalle.motivo) || 'no_valido', (r.detalle && r.detalle.mensaje) || 'La repetición no coincide.');
  return { calidad: r.calidad, estrellas: r.estrellas, incidentes: (r.detalle.incidentes || []).map((x) => ({ clave: x.clave, eleccion: x.eleccion, q: x.q })) };
}

/* Un lado: su equipo; si falta o la lógica lo rechaza, el equipo de la casa (nunca pierde por no presentarse).
   El bono del equipo se suma DESPUÉS de validar (la repetición no cambia) y solo si juega su propio equipo. */
function lado(seed, contrato, eq, ctx) {
  if (eq) {
    let r = null;
    try { r = jugarLado(seed, contrato, eq, ctx); } catch (e) {
      if (e && e.motivo === 'logica_no_determinista') throw e;
      return Object.assign({ casa: true, motivo: (e && e.motivo) || 'equipo_invalido' }, conBono(jugarLado(seed, contrato, equipoCasa(contrato), ctx), 0));
    }
    return Object.assign({ casa: false, motivo: null }, conBono(r, eq.bono));
  }
  return Object.assign({ casa: true, motivo: null }, conBono(jugarLado(seed, contrato, equipoCasa(contrato), ctx), 0));
}
function conBono(r, bono) {
  const b = bonoDe(bono);
  return Object.assign({}, r, { calidad_base: r.calidad, bono: b, calidad: Math.min(100, r.calidad + b) });
}
/* Plantel: hasta 5 equipos ordenados por poder (mayor primero; empate: el orden de llegada); los que faltan → casa (null). */
function plantel(lista, nombre) {
  if (lista === undefined || lista === null) lista = [];
  if (!Array.isArray(lista)) falla('plantel_invalido', `${nombre} debe ser una lista de equipos.`);
  if (lista.length > PARTIDOS) falla('plantel_invalido', `${nombre}: máximo ${PARTIDOS} equipos.`);
  const reales = [];
  lista.forEach((x, i) => {
    if (x === null || x === undefined) return;
    const eq = formaEquipo(x);
    if (!eq) falla('plantel_invalido', `${nombre}, equipo ${i + 1}: formato inválido (se espera {staff, equip}).`);
    reales.push({ eq, poder: poder(eq), i });
  });
  reales.sort((a, b) => b.poder - a.poder || a.i - b.i);
  while (reales.length < PARTIDOS) reales.push({ eq: null, poder: null, i: null });
  return reales;
}

function jugarCruce(entrada) {
  try {
    return sinAzar(() => cruce(entrada));
  } catch (e) {
    return { ok: false, motivo: (e && e.motivo) || 'error_logica', mensaje: String((e && e.message) || e) };
  }
}

function cruce(x) {
  if (!esObj(x)) falla('entrada_invalida', 'La entrada debe ser un objeto JSON.');
  const m = V.motorActual();
  const G = m.G;
  const seed = semillaDe(x.seed);
  if (typeof x.torneo !== 'string' || !TORNEOS[x.torneo]) falla('torneo_invalido', `Torneo desconocido (${String(x.torneo)}). Ver TORNEOS.`);
  const T = TORNEOS[x.torneo];
  let contratos;
  if (x.contratos === undefined || x.contratos === null) contratos = contratosDe(x.torneo);
  else {
    if (!Array.isArray(x.contratos) || x.contratos.length !== PARTIDOS) falla('contratos_invalidos', `contratos debe ser una lista de ${PARTIDOS} contratos.`);
    contratos = x.contratos.map((c, i) => normalizarContrato(G, Object.assign({ client: T.nombre }, esObj(c) ? c : { type: null }), i));
  }
  // PHP manda [] por un arreglo vacío: igual que no mandarlo
  const sinCtx = x.contexto === undefined || x.contexto === null || (Array.isArray(x.contexto) && !x.contexto.length);
  if (!sinCtx && !esObj(x.contexto)) falla('contexto_invalido', 'contexto debe ser un objeto.');
  const ctx = sinCtx ? CONTEXTO : x.contexto;
  const A = plantel(x.planA, 'planA');
  const B = plantel(x.planB, 'planB');
  const partidos = [];
  let totA = 0, totB = 0, ganA = 0, ganB = 0, emp = 0;
  for (let n = 0; n < PARTIDOS; n++) {
    const s = Motor.variante(seed, n + 1);
    const base = contratos[n];
    const contrato = Object.assign({}, base, { imprevistos: sortearImprevistos(G, s, base, ctx) });
    const a = lado(s, contrato, A[n].eq, ctx);
    const b = lado(s, contrato, B[n].eq, ctx);
    const ganador = a.calidad > b.calidad ? 'a' : b.calidad > a.calidad ? 'b' : 'empate';
    if (ganador === 'a') ganA++; else if (ganador === 'b') ganB++; else emp++;
    totA += a.calidad; totB += b.calidad;
    partidos.push({ n: n + 1, tipo: contrato.type, calidad_a: a.calidad, calidad_b: b.calidad, ganador,
      incidentes_a: a.incidentes, incidentes_b: b.incidentes,
      estrellas_a: a.estrellas, estrellas_b: b.estrellas, casa_a: a.casa, casa_b: b.casa,
      motivo_casa_a: a.motivo, motivo_casa_b: b.motivo, poder_a: A[n].poder, poder_b: B[n].poder,
      orden_a: A[n].i, orden_b: B[n].i, bono_a: a.bono, bono_b: b.bono, calidad_base_a: a.calidad_base, calidad_base_b: b.calidad_base, seed: s, imprevistos: contrato.imprevistos, cams: contrato.cams, diff: contrato.diff });
  }
  return { ok: true, partidos, calidad_total_a: totA, calidad_total_b: totB, ganados_a: ganA, ganados_b: ganB, empates: emp,
    torneo: { clave: x.torneo, nombre: T.nombre, cadena: T.cadena, deporte: T.deporte }, politica: POLITICA, version_logica: m.version };
}

function atender(x) {
  if (!esObj(x)) return { ok: false, motivo: 'json_invalido' };
  try {
    if (x.accion === undefined || x.accion === 'cruce') return jugarCruce(x);
    if (x.accion === 'poder') return { ok: true, poder: poder(x.equipo) };
    if (x.accion === 'torneos') return { ok: true, torneos: TORNEOS };
    if (x.accion === 'contratos') return { ok: true, contratos: sinAzar(() => contratosDe(x.torneo)) };
    if (x.accion === 'casa') return { ok: true, equipo: sinAzar(() => equipoCasa(x.contrato)) };
    if (x.accion === 'version') return { ok: true, version_logica: V.info().version_logica };
  } catch (e) {
    return { ok: false, motivo: (e && e.motivo) || 'error', mensaje: String((e && e.message) || e) };
  }
  return { ok: false, motivo: 'accion_desconocida' };
}

module.exports = { jugarCruce, poder, equipoCasa, contratosDe, atender, TORNEOS, CONTEXTO, CASA, PARTIDOS, POLITICA, BONO_MAX };

if (require.main === module) {
  const trozos = [];
  let largo = 0;
  process.stdin.on('data', (b) => { largo += b.length; if (largo > MAX_ENTRADA) { process.stdout.write('{"ok":false,"motivo":"muy_grande"}\n'); process.exit(1); } trozos.push(b); });
  process.stdin.on('end', () => {
    let x;
    try { x = JSON.parse(Buffer.concat(trozos).toString('utf8')); } catch (e) { process.stdout.write('{"ok":false,"motivo":"json_invalido"}\n'); process.exit(1); }
    let r;
    try { r = atender(x); } catch (e) { r = { ok: false, motivo: 'error', mensaje: String(e.message || e) }; }
    process.stdout.write(JSON.stringify(r) + '\n');
    process.exit(0);
  });
}
