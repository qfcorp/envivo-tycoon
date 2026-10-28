/* Imprevistos v2 (reclamo del dueño: "todos se resuelven apretando la primera opción").
   Parte 1, lógica (Node, sin navegador):
     - ninguna opción domina: siempre el primer botón rinde claramente peor que decidir mirando el contexto
     - el orden de los botones se baraja (determinista: mismo evento = mismo orden; el validador lo repite)
     - las opciones con equipo/personal/repuesto solo aparecen si los llevas; las caras se bloquean sin caja
     - probabilidades que cambian con el contexto (cobertores por cámara, UPS según el momento, "largo" al final)
     - cadenas (solo en la partida; en un intento en línea -3 y la lista no cambia), oportunidades con dinero y fama
     - todos los textos existen (español), partidas viejas con un evento a medias cargan y se juegan
     - intentos en línea: jugar con la heurística y repetir con el validador da lo mismo
   Parte 2, navegador (celular 390x844, fecha fija 2026-06-10): pantalla del evento en vivo con el contexto, los % y
     "Lo trajiste"; lo que hizo cada decisión; "Tus decisiones" en el resultado. Sin errores ni desborde.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_imprevistos_v2.js      (SOLO_LOGICA=1: sin navegador) */
'use strict';
const path = require('path');
const fs = require('fs');

const RAIZ = path.resolve(__dirname, '..');
globalThis.window = globalThis;
require(path.join(RAIZ, 'js/datos.js'));
const G = require(path.join(RAIZ, 'js/logic.js'));
const I = require(path.join(RAIZ, 'server/validador/intento.js'));
const V = require(path.join(RAIZ, 'server/validador/validador.js'));
const Motor = require(path.join(RAIZ, 'server/eventos/motor.js'));

let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }
const copia = (s) => JSON.parse(JSON.stringify(s));

/* ---------- Ayudas ---------- */
let sem = 777;
const az = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };
const uno = (a) => a[Math.floor(az() * a.length)];
const deCat = (cat) => Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].cat === cat && !G.CATALOG[k].alquiler && !/^ex_/.test(k));
function intentoAlAzar(i) {
  const type = uno(Object.keys(G.EVENT_TYPES)), t = G.EVENT_TYPES[type];
  const staff = [{ role: 'camarografo', skill: 1 + Math.floor(az() * 4), owner: true }];
  Object.keys(t.crew || {}).forEach((rol) => {
    const [min, ideal] = t.crew[rol];
    const n = Math.max(min, az() < 0.7 ? ideal : min) - (rol === 'camarografo' ? 1 : 0);
    for (let k = 0; k < n && staff.length < 12; k++) staff.push({ role: rol, skill: 1 + Math.floor(az() * 5), morale: 70, tier: uno(['junior', 'semi_senior', 'senior']) });
  });
  const equip = [];
  const pon = (cat) => { const l = deCat(cat); if (l.length) equip.push({ type: uno(l), condition: 25 + Math.floor(az() * 75) }); };
  for (let k = 0; k < t.cams[1] + (az() < 0.3 ? 1 : 0); k++) pon('cam');
  if (t.cams[1] >= 2) pon('switcher');
  if (t.audio) pon('audio');
  if (t.stream) pon('encoder');
  if (staff.some((p) => p.role === 'operador_repeticion')) pon('replay');
  if (staff.some((p) => p.role === 'operador_graficos')) pon('graphics');
  [['mics', 0.6], ['internet', 0.5], ['power', 0.55], ['rain', 0.5], ['wireless', 0.2], ['support', 0.5]].forEach(([c, p]) => { if (az() < p) pon(c); });
  return { seed: 3000 + i * 7919, equipo: { staff, equip },
    contrato: { type, diff: t.diff, cams: t.cams[1], pay: Math.round((t.pay[0] + t.pay[1]) / 2), outdoor: az() < (t.outdoor || 0), stream: az() < (t.stream || 0), audio: !!t.audio },
    contexto: { fama: 30, dinero: uno([150, 600, 2500]), stock: { cable: uno([0, 1, 3]), battery: uno([0, 1, 3]) } } };
}
function empezar(intento) {
  const e = I.crearEstado(G, intento);
  const r = G.startEvent(e.s, e.contractId, e.staffIds, e.equipIds);
  return r.ok ? e.s : null;
}
// Valor de verdad de cada opción (la juega K veces con otras tiradas): calidad + dinero + fama + desgaste
function valoresMC(s, inc, K) {
  const ev = s.currentEvent, porQ = Math.max(4, ev.contract.pay * 0.012);
  return inc.choices.map((ch) => {
    if (!ch.ok) return null;
    let t = 0;
    for (let k = 0; k < K; k++) {
      const c = copia(s); c.seed = (s.seed + Math.imul(k + 1, 0x9E3779B1)) | 0;
      const m0 = c.money, eq0 = {}; c.equip.forEach((e) => { eq0[e.id] = e.condition; });
      const r = G.resolveIncident(c, ch.i);
      let v = r.q + (c.money - m0) / porQ + (r.fama || 0) * 3 + (c.currentEvent.incidents.length > ev.incidents.length ? -4 : 0);
      Object.keys(eq0).forEach((id) => { const e = c.equip.find((x) => x.id === Number(id)); const pr = (G.CATALOG[(s.equip.find((x) => x.id === Number(id)) || {}).type] || {}).price || 0; v -= pr * (eq0[id] - (e ? e.condition : 0)) / 100 * 0.6 / porQ; });
      t += v;
    }
    return t / K;
  });
}
function jugarEvento(s, pol) {
  let inc, g = 0;
  while ((inc = G.currentIncident(s)) && g++ < 20) {
    const ok = inc.choices.filter((c) => c.ok);
    const i = pol === 'primera' ? ok[0].i : pol === 'azar' ? uno(ok).i : G.elegirOpcion(s, inc);
    const r = G.resolveIncident(s, i);
    if (!r.ok) throw new Error('no se pudo elegir ' + inc.key);
  }
  return G.finishEvent(s).result;
}

/* ============ Parte 1: lógica ============ */
console.log('1) Todos los textos (etiquetas, resultados, contexto)');
{
  const falt = new Set();
  const tiene = (k) => Object.prototype.hasOwnProperty.call(G.TEXTOS, k);
  const evs = [
    { contract: { type: 'misa', cams: 1, diff: 1, audio: true, stream: true, outdoor: false, pay: 300 }, staff: [], equip: [{ id: 1, type: 'cam_basic', condition: 90 }] },
    { contract: { type: 'boda', cams: 2, diff: 2, audio: true, stream: true, outdoor: true, pay: 600 }, staff: [], equip: [{ id: 1, type: 'cam_basic', condition: 90 }, { id: 2, type: 'cam_basic', condition: 90 }] },
    { contract: { type: 'ligapro', cams: 4, diff: 4, audio: true, stream: true, outdoor: true, pay: 3000 }, staff: [], equip: [1, 2, 3, 4].map((id) => ({ id, type: 'cam_pro', condition: 90 })) },
  ];
  Object.keys(G.INCIDENTS).forEach((k) => {
    const d = G.INCIDENTS[k];
    if (!d.ops) return; // extensiones (temporadas) tienen su propia prueba
    if (!tiene('duelo.inc.' + k) && !(globalThis.I18N_LANG && globalThis.I18N_LANG.es)) { /* el nombre corto se revisa abajo con es.js */ }
    evs.forEach((ev) => { try { const t = d.text(ev, { cam: 1, eq: 1, who: null, cost: 100 }); if (!tiene(t[0])) falt.add(t[0]); } catch (e) { /* texto que pide más contexto */ } });
    d.choices.forEach((c) => {
      if (!tiene(c.k)) falt.add(c.k);
      [c.ficha.si, c.ficha.no].forEach((o) => {
        if (!o) return;
        const rs = typeof o.r === 'function' ? evs.map((ev) => o.r({}, ev, {})) : [o.r];
        rs.forEach((r) => { if (!tiene('inc.' + k + '.' + r)) falt.add('inc.' + k + '.' + r); });
      });
      if (c.ficha.falta && !tiene(c.ficha.falta)) falt.add(c.ficha.falta);
    });
  });
  ['ctx.fase.inicio', 'ctx.fase.medio', 'ctx.fase.final', 'ctx.clima.sol', 'ctx.clima.nublado', 'ctx.clima.lluvioso', 'ctx.caja', 'ctx.cadena'].forEach((k) => { if (!tiene(k)) falt.add(k); });
  bien(!falt.size, `todas las claves de texto existen (${falt.size ? [...falt].join(', ') : 'ok'})`);
  require(path.join(RAIZ, 'js/lang/es.js'));
  const ES = globalThis.I18N_LANG.es;
  const sinNombre = Object.keys(G.INCIDENTS).filter((k) => G.INCIDENTS[k].ops && !ES['duelo.inc.' + k]);
  bien(!sinNombre.length, `cada imprevisto tiene su nombre corto para los duelos (${sinNombre.join(', ') || 'ok'})`);
  ['vivo.prob', 'vivo.seguro', 'vivo.costo', 'vivo.lo_trajiste', 'vivo.ocultas', 'res.decisiones', 'res.elegiste'].forEach((k) => bien(!!ES[k], `texto de pantalla ${k}`));
  const tipos = Object.keys(G.EVENT_TYPES);
  const porTipo = tipos.map((t) => [t, Object.keys(G.INCIDENTS).filter((k) => { const d = G.INCIDENTS[k]; if (!d.ops || d.cadena) return false;
    const T = G.EVENT_TYPES[t]; const ev = { contract: { type: t, cams: T.cams[1], diff: T.diff, audio: !!T.audio, stream: true, outdoor: !!T.outdoor, pay: T.pay[0], internacional: !!T.soloInternacional }, staff: [], equip: [{ id: 1, type: 'cam_pro', condition: 30 }, { id: 2, type: 'cam_pro', condition: 90 }, { id: 3, type: 'mics', condition: 90 }], clima: 'lluvioso' };
    try { return d.when({}, ev); } catch (e) { return false; } }).length]);
  bien(porTipo.every(([, n]) => n >= 9), `cada tipo de evento tiene 9+ imprevistos posibles (${porTipo.map(([t, n]) => t + ':' + n).join(' ')})`);
  const nuevos = ['bengalas', 'boda_retraso', 'boda_celulares', 'concierto_setlist', 'pirotecnia', 'coro', 'silencio', 'prensa_pregunta', 'ko_rapido', 'demo_falla', 'lista_eterna', 'formato_intl'];
  bien(nuevos.every((k) => G.INCIDENTS[k]), 'imprevistos propios de fútbol, boda, concierto, misa, prensa, ring, lanzamientos, graduación e internacional');
  bien(['op_toma_extra', 'op_celebridad', 'op_patrocinador'].every((k) => G.INCIDENTS[k] && G.INCIDENTS[k].bueno), 'oportunidades (toma extra pagada, celebridad, patrocinador) marcadas como momentos buenos');
}

console.log('2) Ninguna opción domina: el primer botón vs decidir con el contexto');
{
  const N = Number(process.env.EVENTOS) || 220;
  let multi = 0, primeraMejor = 0;
  const q = { primera: [], azar: [], contexto: [] }, regret = { primera: 0, contexto: 0 };
  const mejorOrig = {};
  for (let i = 0; i < N; i++) {
    const it = intentoAlAzar(i);
    const s = empezar(it);
    if (!s) continue;
    // Imprevisto por imprevisto
    const a = copia(s);
    let inc, g = 0;
    while ((inc = G.currentIncident(a)) && g++ < 20) {
      const ok = inc.choices.filter((c) => c.ok);
      const vs = valoresMC(a, inc, 8);
      const mejor = vs.reduce((b, v, j) => (v !== null && (b < 0 || v > vs[b]) ? j : b), -1);
      if (ok.length >= 2) {
        multi++;
        if (ok[0].i === mejor) primeraMejor++;
        const h = G.elegirOpcion(a, inc);
        regret.primera += vs[mejor] - vs[ok[0].i];
        regret.contexto += vs[mejor] - vs[h];
        const ko = inc.key + ':' + inc.choices[mejor].o;
        mejorOrig[inc.key] = mejorOrig[inc.key] || {}; mejorOrig[inc.key][ko] = (mejorOrig[inc.key][ko] || 0) + 1;
      }
      G.resolveIncident(a, mejor);
    }
    // Evento entero con cada forma de jugar (misma semilla)
    for (const p of Object.keys(q)) q[p].push(jugarEvento(copia(s), p).quality);
  }
  const prom = (l) => l.reduce((x, y) => x + y, 0) / Math.max(1, l.length);
  const pct = 100 * primeraMejor / Math.max(1, multi);
  console.log(`   ${multi} imprevistos con 2+ opciones · el primer botón es el mejor en ${pct.toFixed(1)}% (antes de v2: 83%)`);
  console.log(`   pérdida media por imprevisto: primer botón ${(regret.primera / multi).toFixed(2)} · con contexto ${(regret.contexto / multi).toFixed(2)} puntos`);
  console.log(`   calidad final media: primer botón ${prom(q.primera).toFixed(1)} · al azar ${prom(q.azar).toFixed(1)} · con contexto ${prom(q.contexto).toFixed(1)}`);
  bien(pct < 50, `el primer botón ya no es "la respuesta" (${pct.toFixed(1)}% de las veces es el mejor, máx. 50%)`);
  bien(prom(q.contexto) >= prom(q.primera) + 4, `decidir con el contexto rinde claramente más que apretar siempre el primero (+${(prom(q.contexto) - prom(q.primera)).toFixed(1)} de calidad, mín. +4)`);
  bien(prom(q.contexto) > prom(q.azar), 'y más que elegir al azar');
  bien(regret.contexto / multi < regret.primera / multi / 2, 'la heurística pierde menos de la mitad que el primer botón frente a la mejor opción');
  // Que la mejor opción cambie según el contexto en los imprevistos comunes
  const variados = ['cable', 'luz', 'lluvia', 'internet', 'acople', 'bateria', 'falla'].filter((k) => mejorOrig[k] && Object.keys(mejorOrig[k]).length >= 2);
  bien(variados.length >= 6, `en los imprevistos comunes la mejor opción depende del contexto (${variados.join(', ')})`);
}

console.log('3) El orden se baraja (y es siempre el mismo para el mismo evento)');
{
  const primeros = {}, posRepuesto = {};
  let iguales = true, n = 0;
  for (let i = 0; i < 60; i++) {
    const s = empezar({ seed: 100 + i * 13, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }, { role: 'cablero', skill: 3 }], equip: [{ type: 'cam_basic', condition: 90 }, { type: 'cam_basic', condition: 90 }, { type: 'cam_basic', condition: 90 }, { type: 'tx_hollyband_marte_4k', condition: 90 }] },
      contrato: { type: 'boda', diff: 2, cams: 2, pay: 600, imprevistos: ['cable'] }, contexto: { dinero: 1000, stock: { cable: 2, battery: 1 } } });
    const inc = G.currentIncident(s);
    if (!inc || inc.key !== 'cable') continue;
    n++;
    primeros[inc.choices[0].k] = (primeros[inc.choices[0].k] || 0) + 1;
    const p = inc.choices.findIndex((c) => c.k === 'inc.cable.o3');
    posRepuesto[p] = (posRepuesto[p] || 0) + 1;
    if (JSON.stringify(G.currentIncident(s).choices.map((c) => c.k)) !== JSON.stringify(inc.choices.map((c) => c.k))) iguales = false;
    if (JSON.stringify(G.currentIncident(G.deserialize(G.serialize(s))).choices.map((c) => c.k)) !== JSON.stringify(inc.choices.map((c) => c.k))) iguales = false;
  }
  bien(n >= 50 && Object.keys(primeros).length >= 4, `el primer botón cambia de un evento a otro (${JSON.stringify(primeros)})`);
  bien(Object.keys(posRepuesto).length >= 4 && Math.max(...Object.values(posRepuesto)) < n * 0.5, `la opción segura (cable de repuesto) no está siempre primera (${JSON.stringify(posRepuesto)})`);
  bien(iguales, 'mismo evento = mismo orden (también después de guardar y cargar)');
}

console.log('4) Opciones que solo aparecen con el equipo o la persona');
{
  const base = (equip, staff, stock, extra) => empezar(Object.assign({ seed: 4242, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }].concat(staff || []), equip: [{ type: 'cam_basic', condition: 90 }].concat(equip || []) },
    contrato: Object.assign({ type: 'boda', diff: 2, cams: 1, pay: 600, outdoor: true }, extra || {}), contexto: { dinero: 1000, stock: stock || { cable: 0, battery: 0 } } }));
  const ks = (s) => G.currentIncident(s).choices.map((c) => c.k);
  let s = base([], [], null, { imprevistos: ['luz'] });
  bien(!ks(s).includes('inc.luz.o3') && !ks(s).includes('inc.luz.o4'), 'sin UPS ni generador: no aparecen "Aguantar con la UPS" ni "Prender el generador"');
  bien(G.currentIncident(s).ocultas.some((o) => o.whyK === 'need.ups') && G.currentIncident(s).ocultas.some((o) => o.whyK === 'need.generador'), '…y se avisa qué equipo te habría dado más opciones');
  s = base([{ type: 'ups', condition: 90 }], [], null, { imprevistos: ['luz'] });
  const ups = G.currentIncident(s).choices.find((c) => c.k === 'inc.luz.o3');
  bien(!!ups && ups.equipo && !ks(s).includes('inc.luz.o4'), 'con UPS: aparece "Aguantar con la UPS" (Lo trajiste), sin la del generador');
  s = base([{ type: 'pw_jonda_eu2300i', condition: 90 }], [], null, { imprevistos: ['luz'] });
  bien(ks(s).includes('inc.luz.o4') && /generador que trajiste/.test(G.currentIncident(s).choices.find((c) => c.k === 'inc.luz.o4').label), 'con generador: "Prender el generador que trajiste"');
  s = base([], [], { cable: 0, battery: 0 }, { imprevistos: ['cable'] });
  bien(!ks(s).includes('inc.cable.o3') && !ks(s).includes('inc.cable.o5') && !ks(s).includes('inc.cable.o7'), 'cable roto sin repuestos, sin cablero y sin inalámbrico: esas opciones no aparecen');
  s = base([{ type: 'tx_hollyband_marte_4k', condition: 90 }], [{ role: 'cablero', skill: 2 }], { cable: 2, battery: 0 }, { imprevistos: ['cable'] });
  const rep = G.currentIncident(s).choices.find((c) => c.k === 'inc.cable.o3');
  bien(rep && /te quedan 2/.test(rep.label) && ks(s).includes('inc.cable.o5') && ks(s).includes('inc.cable.o7'), 'con repuestos, cablero e inalámbrico: aparecen las tres (y dice cuántos cables quedan)');
  // Caja: la opción cara se ve, pero bloqueada
  const pobre = empezar({ seed: 9, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }], equip: [{ type: 'cam_basic', condition: 90 }] },
    contrato: { type: 'boda', diff: 2, cams: 1, pay: 600, imprevistos: ['luz'] }, contexto: { dinero: 10 } });
  const alq = G.currentIncident(pobre).choices.find((c) => c.k === 'inc.luz.o5');
  bien(alq && !alq.ok && alq.whyK === 'need.dinero' && alq.costo > 10, 'sin caja: "Alquilar un generador" se ve bloqueada con el motivo');
  bien(!G.resolveIncident(pobre, alq.i).ok, '…y no se puede elegir');
}

console.log('5) El contexto cambia las probabilidades y el costo');
{
  const lluvia = (cams, covers) => {
    const s = empezar({ seed: 55, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }], equip: Array.from({ length: cams }, () => ({ type: 'cam_basic', condition: 90 })).concat(Array.from({ length: covers }, () => ({ type: 'raincover', condition: 90 }))) },
      contrato: { type: 'boda', diff: 2, cams, pay: 600, outdoor: true, imprevistos: ['lluvia'] }, contexto: { dinero: 1000 } });
    return G.currentIncident(s).choices.find((c) => c.k === 'inc.lluvia.o3');
  };
  bien(lluvia(2, 2).prob === null && Math.abs(lluvia(3, 1).prob - 1 / 3) < 0.02, `cobertores: seguro si alcanzan para todas las cámaras, 33 % si cubren 1 de 3 (${lluvia(3, 1).prob})`);
  bien(/1 para 3 cámaras/.test(lluvia(3, 1).label), 'la etiqueta dice cuántos cobertores hay para cuántas cámaras');
  // UPS: al final del evento aguanta casi seguro; al inicio, no
  const ups = (lista) => {
    const s = empezar({ seed: 66, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }], equip: [{ type: 'cam_basic', condition: 90 }, { type: 'ups', condition: 90 }] },
      contrato: { type: 'boda', diff: 2, cams: 1, pay: 600, imprevistos: lista }, contexto: { dinero: 1000 } });
    let inc; while ((inc = G.currentIncident(s)) && inc.key !== 'luz') G.resolveIncident(s, G.elegirOpcion(s, inc));
    return inc;
  };
  const alInicio = ups(['luz', 'acople', 'tarde', 'logo']), alFinal = ups(['acople', 'logo', 'luz']);
  const pI = alInicio.choices.find((c) => c.k === 'inc.luz.o3').prob, pF = alFinal.choices.find((c) => c.k === 'inc.luz.o3').prob;
  bien(alInicio.fase === 'inicio' && alFinal.fase === 'final' && pI < 0.5 && pF > 0.85, `la UPS aguanta más si falta poco (inicio ${pI} · final ${pF})`);
  bien(alInicio.ctx.some((c) => c.k === 'ctx.fase.inicio') && alFinal.ctx.some((c) => c.k === 'ctx.fase.final') && alFinal.ctx.some((c) => c.k === 'ctx.caja'), 'el contexto (momento y caja) se ve en el imprevisto');
  // "Seguir sin esa cámara" pesa menos al final
  const sinCam = (lista) => {
    const s = empezar({ seed: 67, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }], equip: [{ type: 'cam_basic', condition: 90 }, { type: 'cam_basic', condition: 90 }] },
      contrato: { type: 'boda', diff: 2, cams: 2, pay: 600, imprevistos: lista }, contexto: { dinero: 1000 } });
    let inc; while ((inc = G.currentIncident(s)) && inc.key !== 'cable') G.resolveIncident(s, G.elegirOpcion(s, inc));
    return G.resolveIncident(s, inc.choices.find((c) => c.k === 'inc.cable.o6').i).q;
  };
  const qi = sinCam(['cable', 'acople', 'logo']), qf = sinCam(['acople', 'logo', 'cable']);
  bien(qf > qi, `seguir sin la cámara cuesta menos al final (${qf}) que al inicio (${qi})`);
}

console.log('6) Cadenas, oportunidades y lo que se guarda en el resultado');
{
  // Esperar la luz y que salga mal → vuelve con un pico de voltaje (en la partida)
  let encadenado = null;
  for (let seed = 1; seed < 400 && !encadenado; seed++) {
    const s = G.newGame(seed);
    s.stats.events = 20;
    const c = s.contracts[0];
    Object.assign(c, { type: 'boda', diff: 2, cams: 1, outdoor: false, rival: false, story: false, imprevistos: ['luz'] });
    if (!G.startEvent(s, c.id, [s.staff[0].id], [s.equip[0].id]).ok) continue;
    const inc = G.currentIncident(s);
    const r = G.resolveIncident(s, inc.choices.find((x) => x.k === 'inc.luz.o6').i);
    if (r.sigue === 'luz_pico') encadenado = s;
  }
  bien(!!encadenado && G.currentIncident(encadenado).key === 'luz_pico' && G.currentIncident(encadenado).cadena === 'luz', 'una mala salida trae el imprevisto que sigue (vuelve la luz con un pico)');
  if (encadenado) {
    let inc; while ((inc = G.currentIncident(encadenado))) G.resolveIncident(encadenado, G.elegirOpcion(encadenado, inc));
    const res = G.finishEvent(encadenado).result;
    bien(res.incidents.length === 2 && res.incidents[1].cadena === 'luz' && res.incidents[0].result.op === 'inc.luz.o6' && res.incidents[0].result.prob > 0, 'el resultado guarda la cadena, la opción elegida y su probabilidad');
  }
  // En un intento en línea no se agrega nada: -3 y la misma lista para los dos lados
  let enLinea = null;
  for (let seed = 1; seed < 400 && !enLinea; seed++) {
    const s = empezar({ seed, equipo: { staff: [{ role: 'camarografo', skill: 3, owner: true }], equip: [{ type: 'cam_basic', condition: 90 }] }, contrato: { type: 'boda', diff: 2, cams: 1, pay: 600, imprevistos: ['luz'] }, contexto: { dinero: 1000 } });
    const inc = G.currentIncident(s);
    const r = G.resolveIncident(s, inc.choices.find((x) => x.k === 'inc.luz.o6').i);
    if (inc.choices.find((x) => x.k === 'inc.luz.o6') && s.currentEvent.incidents[0].result.sigueQ === -3) enLinea = { s, r };
  }
  bien(!!enLinea && enLinea.s.currentEvent.incidents.length === 1 && !G.currentIncident(enLinea.s), 'intento en línea: la cadena no agrega imprevistos (cuesta -3 de calidad)');
  // Oportunidad: toma extra pagada con una cámara de sobra
  const s = G.newGame(31);
  s.stats.events = 20;
  G.buy(s, 'cam_basic'); s.money = 2000;
  const c = s.contracts[0];
  Object.assign(c, { type: 'boda', diff: 2, cams: 1, pay: 800, outdoor: false, rival: false, story: false, imprevistos: ['op_toma_extra', 'silencio'] });
  c.type = 'misa';
  G.startEvent(s, c.id, [s.staff[0].id], s.equip.map((e) => e.id));
  const inc = G.currentIncident(s);
  bien(inc && inc.key === 'op_toma_extra' && inc.bueno, 'oportunidad: el cliente pide una toma extra pagada (momento bueno)');
  const m0 = s.money;
  const r = G.resolveIncident(s, inc.choices.find((x) => x.k === 'inc.op_toma_extra.o0').i);
  bien(r.ok && r.din > 0 && s.money === m0 + r.din && r.q > 0, `con la cámara de sobra: cobras la toma (+${r.din}) y sube la calidad`);
  // La fama de las decisiones entra en el resultado
  const inc2 = G.currentIncident(s);
  const malo = inc2.choices.find((x) => x.k === 'inc.silencio.o2');
  let fin = null;
  for (let seed = 1; seed < 200 && malo; seed++) {
    const t = copia(s); t.seed = seed;
    const rr = G.resolveIncident(t, G.currentIncident(t).choices.find((x) => x.k === 'inc.silencio.o2').i);
    if (rr.fama < 0) { fin = G.finishEvent(t).result; break; }
  }
  bien(fin && fin.famaImprevistos === -2, `la fama que restan las decisiones va al resultado (famaImprevistos ${fin && fin.famaImprevistos})`);
}

console.log('7) Partida vieja con un evento a medias (sin mezcla, momento ni clima)');
{
  const s = G.newGame(5);
  s.stats.events = 20;
  const c = s.contracts[0];
  Object.assign(c, { imprevistos: ['cable', 'acople'], audio: true, type: 'boda', diff: 2 });
  G.startEvent(s, c.id, [s.staff[0].id], [s.equip[0].id]);
  const ev = s.currentEvent;
  delete ev.mezcla; delete ev.clima; ev.incidents.forEach((i) => { delete i.x.fase; });
  const o = G.deserialize(G.serialize(s));
  let ok = !!o && !!G.currentIncident(o), inc, g = 0;
  while (ok && (inc = G.currentIncident(o)) && g++ < 6) ok = G.resolveIncident(o, inc.choices.find((x) => x.ok).i).ok;
  bien(ok && G.finishEvent(o).ok, 'carga y se juega hasta el final');
}

console.log('8) Intentos en línea: jugar con la heurística y repetir con el validador');
{
  let validos = 0, total = 0, distintos = 0;
  for (let i = 0; i < 40; i++) {
    const it = intentoAlAzar(500 + i);
    let j;
    try { j = I.jugar(G, it, (inc) => G.elegirOpcion(null, inc)); } catch (e) { continue; }
    total++;
    const v = V.validate(Object.assign({}, it, { decisiones: j.decisiones, cliente_resultado: j.resultado }));
    if (v.valido) validos++;
    const p = I.jugar(G, it, (inc) => inc.choices.find((c) => c.ok).i);
    if (JSON.stringify(p.decisiones) !== JSON.stringify(j.decisiones)) distintos++;
  }
  bien(total >= 35 && validos === total, `el validador repite todas las jugadas (${validos} de ${total})`);
  bien(distintos > total * 0.4, `la heurística no es "siempre la primera" (${distintos} de ${total} jugadas distintas)`);
  // El fantasma prudente de los duelos decide con valor, no con el primer botón
  const f = Motor.fantasma(intentoAlAzar(900), 'prudente', true);
  bien(f.ok, 'el fantasma prudente juega y el validador lo acepta' + (f.ok ? '' : ': ' + f.mensaje));
}

/* ============ Parte 2: navegador ============ */
async function navegador() {
  const { chromium } = require('playwright');
  const OUT = path.join(__dirname, 'capturas');
  fs.mkdirSync(OUT, { recursive: true });
  const BASE = 'http://envivo.test';
  // Partida: cámara + UPS + cobertor, contrato al aire libre con los imprevistos fijos (luz, lluvia y la toma extra)
  const s = G.newGame(7);
  s.stats.events = 8; s.chapter = 1; s.chapterSeen = 1; s.day = 9; s.money = 3000;
  G.buy(s, 'cam_basic'); G.buy(s, 'ups'); G.buy(s, 'raincover');
  s.money = 3000; s.stock.cable = 2;
  const c = s.contracts[0];
  Object.assign(c, { type: 'boda', outdoor: true, cams: 1, audio: true, stream: false, rival: false, story: false, diff: 2, pay: 800, imprevistos: ['luz', 'op_toma_extra', 'lluvia'], daysLeft: 5 });
  s.contracts = [c];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route(BASE + '/**', async (route) => {
      const u = new URL(route.request().url());
      const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
      if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(RAIZ, 'index.html')) });
      if (u.pathname.startsWith('/api/')) {
        if (u.pathname === '/api/estado') return json(200, { ok: true, tienda: { productos: [], premium: [] }, logueado: false, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' } });
        if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
        return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
      }
      const f = path.join(RAIZ, decodeURIComponent(u.pathname).replace(/^\//, ''));
      if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
        return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
    await page.addInitScript((partida) => {
      try {
        if (localStorage.getItem('__prueba_init')) return;
        localStorage.setItem('__prueba_init', '1');
        localStorage.setItem('envivo_guia_v1', '"hecha"');
        localStorage.setItem('envivo_aviso_cuenta', '9');
        localStorage.setItem('envivo_lang', 'es');
        localStorage.setItem('envivo_tycoon_save_v1', partida);
      } catch (e) { /* nada */ }
    }, G.serialize(s));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    for (let i = 0; i < 6; i++) {
      const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close"]');
      if (!b) break;
      await b.click(); await page.waitForTimeout(250);
    }
    await page.click('nav button[data-tab="clientes"]');
    await page.click(`[data-act="prep"][data-id="${c.id}"]`);
    await page.waitForSelector('#modal #prepPie');
    for (const e of s.equip) { if (!(await page.isChecked(`#eq-${e.id}`))) { await page.click(`label:has(#eq-${e.id}) .grow b`); await page.waitForTimeout(120); } }
    await page.click('#modal [data-act="go-live"]');
    await page.waitForSelector('#modal [data-act="choose"]', { timeout: 15000 });
    const desborde = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('#modal .choice, #modal .incctx, #modal .efx, #modal .decis')].some((x) => x.scrollWidth > x.clientWidth + 1));
    // Imprevisto 1: se fue la luz (con UPS)
    const v1 = await page.evaluate(() => ({
      ctx: [...document.querySelectorAll('#modal .incctx span')].map((x) => x.innerText),
      ops: [...document.querySelectorAll('#modal [data-act="choose"]')].map((b) => ({ k: b.dataset.k, i: b.dataset.i, t: b.innerText.replace(/\s+/g, ' ') })),
    }));
    bien(v1.ctx.some((t) => /Recién empieza/.test(t)) && v1.ctx.some((t) => /Caja: \$/.test(t)), `contexto visible: momento y caja (${v1.ctx.join(' | ')})`);
    const ups = v1.ops.find((o) => o.k === 'inc.luz.o3');
    bien(!!ups && /Lo trajiste/.test(ups.t) && /% de salir bien/.test(ups.t), `"Aguantar con la UPS" aparece con "Lo trajiste" y su % (${ups && ups.t})`);
    bien(v1.ops.every((o) => /% de salir bien|Seguro/.test(o.t)), 'cada opción dice si es segura o su % de salir bien');
    bien(v1.ops.some((o) => /Cuesta \$|\(\$\d/.test(o.t)), 'la opción que cuesta dinero lo dice');
    bien(!v1.ops.some((o) => o.k === 'inc.luz.o4') && /Con otro equipo tendrías más opciones/.test(await page.innerText('#modal')), 'sin generador: no aparece su opción y se avisa qué faltó');
    bien(!(await desborde()), 'imprevisto: sin desborde horizontal');
    await page.screenshot({ path: path.join(OUT, 'imprevistos_v2_luz.png') });
    // Elegir "Alquilar un generador" (segura y cuesta): se ve el dinero que salió
    await page.click('#modal [data-act="choose"][data-k="inc.luz.o5"]');
    await page.waitForSelector('#modal .efx', { timeout: 5000 });
    const efx = await page.innerText('#modal .efx');
    bien(/Calidad -\d/.test(efx) && /-\$/.test(efx), `lo que hizo la decisión: calidad y dinero (${efx.replace(/\s+/g, ' ')})`);
    bien(!(await desborde()), 'consecuencia: sin desborde horizontal');
    await page.screenshot({ path: path.join(OUT, 'imprevistos_v2_efecto.png') });
    // Siguientes: la toma extra (oportunidad) y la lluvia
    for (let g = 0; g < 6; g++) {
      if (await page.$('#modal [data-act="next-inc"]')) { await page.click('#modal [data-act="next-inc"]'); await page.waitForTimeout(200); }
      const b = await page.$('#modal [data-act="choose"]:not([disabled])');
      if (!b) break;
      const titulo = await page.innerText('#modal');
      if (/toma extra/.test(titulo)) {
        bien(/Momento en vivo/.test(titulo), 'la toma extra pagada se muestra como momento bueno');
        await page.screenshot({ path: path.join(OUT, 'imprevistos_v2_oportunidad.png') });
      }
      await b.click();
      await page.waitForSelector('#modal [data-act="next-inc"], #modal [data-act="finish"]', { timeout: 5000 });
    }
    await page.click('#modal [data-act="finish"]');
    await page.waitForSelector('#resDecisiones', { timeout: 8000 });
    const dec = await page.$$eval('#resDecisiones .decis-i', (xs) => xs.map((x) => x.innerText.replace(/\s+/g, ' ')));
    bien(dec.length === 3 && dec.every((t) => /Elegiste:/.test(t) && /Calidad [+-]?\d/.test(t)), `resultado: "Tus decisiones" con lo elegido y su efecto (${dec.length})`);
    bien(dec.some((t) => /Alquilar un generador/.test(t) && /-\$/.test(t)), 'la decisión del generador muestra lo que costó');
    await page.locator('#resDecisiones').scrollIntoViewIfNeeded();
    bien(!(await desborde()), 'resultado: sin desborde horizontal');
    await page.screenshot({ path: path.join(OUT, 'imprevistos_v2_resultado.png') });
    bien(errores.length === 0, 'sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
    await ctx.close();
  } finally { await browser.close(); }
}

(async () => {
  if (!process.env.SOLO_LOGICA) {
    try { await navegador(); } catch (e) { bien(false, 'navegador: ' + (e && e.stack || e)); }
  }
  console.log(`\n${fallas ? '❌ ' + fallas + ' fallas' : '✅ Imprevistos v2 OK'} (${aciertos} bien)`);
  process.exit(fallas ? 1 : 0);
})();
