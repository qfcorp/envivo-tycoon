/* Prueba del nivel de sede (js/sede.js): mejoras chicas por nivel, costos y requisitos, entrega del día,
   materiales de los eventos, obras con días, bonos por la API de extensiones, guardar/cargar, determinismo
   y un bot de 300 días que reporta el nivel alcanzado.
   Uso:  node tests/test_sede.js      (GAMES=40 node tests/test_sede.js para más partidas en la simulación) */
'use strict';
const G = require('../js/logic.js');

let errors = 0;
function check(cond, msg) { if (!cond) { errors++; if (errors < 40) console.error('❌', msg); } }

/* ---------- Si logic.js todavía no tiene la API de extensiones: un shim mínimo ---------- */
let shim = false;
if (typeof G.registrarExtension !== 'function') {
  shim = true;
  const exts = [];
  G.registrarExtension = (e) => { exts.push(e); return true; };
  const each = (s, name, fn) => { if (s && !s.intento) exts.forEach((e) => { if (typeof e[name] === 'function') fn(e[name]); }); };
  const nd = G.nextDay, fe = G.finishEvent, ng = G.newGame, de = G.deserialize;
  G.newGame = (seed) => { const s = ng(seed); each(s, 'migrar', (h) => h(s)); return s; };
  G.deserialize = (str) => { const s = de(str); if (s) each(s, 'migrar', (h) => h(s)); return s; };
  G.nextDay = (s, o) => { nd(s, o); if (!s.gameOver) each(s, 'alNuevoDia', (h) => h(s)); };
  G.finishEvent = (s) => {
    const c = s.currentEvent && s.currentEvent.contract;
    const r = fe(s);
    if (r && r.ok) each(s, 'alTerminarEvento', (h) => h(s, r.result, c));
    return r;
  };
}
const S = require('../js/sede.js');
check(S.registrada, 'sede.js no se registró con Game.registrarExtension');
console.log(`API de extensiones: ${shim ? 'shim local (logic.js sin registrarExtension)' : 'la de logic.js'}`);

const A = S.AJUSTE;
const todo = (s, mats, plata) => { S.MATS.forEach((m) => { s.sede.materiales[m] = mats; }); s.money = plata; };
const pasar = (s, n) => { for (let i = 0; i < n; i++) G.nextDay(s); };

/* ---------- Estado inicial y migración ---------- */
(function () {
  const s = G.newGame(11);
  S.migrar(s);
  check(s.sede && s.sede.nivel === 1 && s.sede.obras.length === 0 && S.MATS.every((m) => s.sede.materiales[m] === 0), 'estado inicial de la sede incorrecto');
  const viejo = G.newGame(12); delete viejo.sede;
  const copia = G.deserialize(G.serialize(viejo));
  S.migrar(copia);
  check(copia.sede && copia.sede.nivel === 1, 'migrar no arma la sede en una partida vieja');
  const roto = G.newGame(13); roto.sede = { nivel: 99, materiales: { cables: -4, chips: 'x' }, obras: [null, { tipo: 'x' }] };
  S.migrar(roto);
  check(roto.sede.nivel === A.maxNivel && roto.sede.materiales.cables === 0 && roto.sede.materiales.chips === 0 && roto.sede.obras.length === 0 && roto.sede.mejoras, 'migrar no limpia datos rotos');
  // 4 o 5 mejoras por nivel; la escuela solo desde su nivel
  for (let L = 2; L <= A.maxNivel; L++) {
    const eds = S.edificiosDe(L);
    check(eds.length === (L < A.escuelaDesde ? 4 : 5), `nivel ${L}: debería tener ${L < A.escuelaDesde ? 4 : 5} mejoras (tiene ${eds.length})`);
    check(eds.includes('escuela') === (L >= A.escuelaDesde), `nivel ${L}: escuela mal`);
    check(new Set(eds).size === eds.length, `nivel ${L}: edificios repetidos`);
  }
})();

/* ---------- Costos crecientes, chips desde el nivel 6, requisitos ---------- */
(function () {
  let prev = null;
  for (let L = 2; L <= A.maxNivel; L++) {
    S.edificiosDe(L).concat(['sede']).forEach((ed) => {
      const c = S.costo(L, ed);
      check(c.dinero > 0 && c.dias >= 1 && Object.values(c.mat).every((v) => Number.isInteger(v) && v > 0), `costo inválido nivel ${L} ${ed}`);
      if (L < A.raroDesde) check(!c.mat.chips, `nivel ${L} ${ed}: no debería pedir chips`);
    });
    const tot = (ed) => { const c = S.costo(L, ed); return Object.values(c.mat).reduce((a, b) => a + b, 0); };
    if (prev) check(tot('control') >= prev.m && S.costo(L, 'control').dinero > prev.d, `nivel ${L}: el costo no sube`);
    prev = { m: tot('control'), d: S.costo(L, 'control').dinero };
    if (L >= A.raroDesde) check(S.costo(L, 'sede').mat.chips > 0, `nivel ${L}: la sede principal debería pedir chips`);
  }
  check(S.costo(30, 'control').dinero > 10 * S.costo(3, 'control').dinero, 'la curva de costos es muy plana');
  check(S.costo(30, 'sede').dias > S.costo(2, 'sede').dias, 'la obra de la sede debería tardar más en niveles altos');
  // Requisitos: no se salta la historia
  for (let L = 13; L <= A.maxNivel; L++) check(S.requisito(L).historia, `nivel ${L}: debería pedir terminar la historia`);
  check(S.requisito(10).cap === 4 && !S.requisito(2).fama, 'requisitos de capítulo/fama mal');

  const s = G.newGame(21);
  todo(s, 9999, 1e6);
  // Fama baja: subir a nivel 3 pide fama 6
  s.rep = 0;
  S.edificiosDe(2).forEach((ed) => { s.sede.mejoras['2.' + ed] = 1; });
  s.sede.nivel = 2;
  S.edificiosDe(3).forEach((ed) => { s.sede.mejoras['3.' + ed] = 1; });
  const r = S.subirNivel(s);
  check(!r.ok && s.sede.obras.length === 0, 'subió de nivel sin la fama que pide');
  s.rep = 10;
  check(S.subirNivel(s).ok, 'con la fama pedida debería poder subir');
  // Historia: el nivel 13 pide terminarla
  const h = G.newGame(22); todo(h, 99999, 1e7); h.rep = 100; h.chapter = 5; h.storyDone = false;
  h.sede.nivel = 12; S.edificiosDe(13).forEach((ed) => { h.sede.mejoras['13.' + ed] = 1; });
  check(!S.subirNivel(h).ok, 'nivel 13 sin terminar la historia');
  h.storyDone = true;
  check(S.subirNivel(h).ok, 'nivel 13 con la historia terminada debería poder subir');
  // Sin materiales o sin plata no se puede
  const p = G.newGame(23);
  const r1 = S.mejorar(p, S.edificiosDe(2)[0]);
  check(!r1.ok && r1.falta && Object.keys(r1.falta).length > 0, 'mejoró sin materiales');
  todo(p, 50, 0);
  check(!S.mejorar(p, S.edificiosDe(2)[0]).ok, 'mejoró sin dinero');
  p.money = 5000;
  const antes = Object.assign({}, p.sede.materiales);
  const ed = S.edificiosDe(2)[0], c = S.costo(2, ed);
  check(S.mejorar(p, ed).ok && p.money === 5000 - c.dinero && Object.keys(c.mat).every((m) => p.sede.materiales[m] === antes[m] - c.mat[m]), 'mejorar no cobra bien');
  check(!S.mejorar(p, 'escuela').ok, 'la escuela no debería estar en el nivel 2');
})();

/* ---------- Subir de nivel exige TODAS las mejoras; obras con días y equipos de obra ---------- */
(function () {
  const s = G.newGame(31);
  todo(s, 9999, 1e6); s.rep = 50;
  const eds = S.edificiosDe(2);
  check(!S.subirNivel(s).ok, 'subió de nivel sin ninguna mejora');
  check(S.mejorar(s, eds[0]).ok, 'primera mejora');
  check(!S.mejorar(s, eds[1]).ok, 'con 1 equipo de obra no deberían ir 2 obras a la vez');
  check(s.sede.obras[0].fin === s.day + S.costo(2, eds[0]).dias, 'la obra no guarda el día en que termina');
  G.nextDay(s);
  check(s.sede.mejoras['2.' + eds[0]] === 1 && s.sede.obras.length === 0, 'la obra de 1 día no terminó con nextDay');
  for (let i = 1; i < eds.length - 1; i++) { check(S.mejorar(s, eds[i]).ok, 'mejora ' + eds[i]); G.nextDay(s); }
  check(!S.subirNivel(s).ok, 'subió de nivel con una mejora pendiente');
  check(S.mejorar(s, eds[eds.length - 1]).ok, 'última mejora');
  check(!S.subirNivel(s).ok, 'subió de nivel con la última mejora todavía en obra');
  G.nextDay(s);
  const dias = S.costo(2, 'sede').dias;
  check(S.subirNivel(s).ok, 'con todas las mejoras debería poder subir');
  check(S.etapa(s).sede.obra && s.sede.nivel === 1, 'la obra de la sede principal debería estar en curso');
  pasar(s, dias - 1);
  check(s.sede.nivel === 1, 'subió antes de tiempo');
  G.nextDay(s);
  check(s.sede.nivel === 2, `no subió al nivel 2 después de ${dias} días (nivel ${s.sede.nivel})`);
  check(s.log.some((l) => l.k === 'sedehq.subio'), 'no quedó en el registro que subió de nivel');
  // Segundo equipo de obra desde el nivel 5
  const t = G.newGame(32); todo(t, 9999, 1e6); t.rep = 60; t.chapter = 2;
  t.sede.nivel = 5;
  const e6 = S.edificiosDe(6);
  check(S.mejorar(t, e6[0]).ok && S.mejorar(t, e6[1]).ok, 'en el nivel 5 deberían ir 2 obras a la vez');
  check(!S.mejorar(t, e6[2]).ok, 'no debería haber un tercer equipo de obra');
  // Las obras terminan aunque pasen varios días de golpe (viajes) o el día pase dentro de finishEvent
  t.day += 30; S.actualizar(t);
  check(t.sede.obras.length === 0 && t.sede.mejoras['6.' + e6[0]] && t.sede.mejoras['6.' + e6[1]], 'actualizar no terminó las obras vencidas');
})();

/* ---------- Entrega del día: una vez por día ---------- */
(function () {
  const s = G.newGame(41);
  check(S.cofreDisponible(s), 'la entrega del día debería estar disponible al empezar');
  const r = S.reclamarCofre(s);
  const tot = Object.values(s.sede.materiales).reduce((a, b) => a + b, 0);
  check(r.ok && tot === Math.floor(A.cofre.base + A.cofre.porNivel), `la entrega no dio lo que debía (${tot})`);
  check(!S.reclamarCofre(s).ok && !S.cofreDisponible(s), 'se pudo reclamar 2 veces el mismo día');
  check(Object.values(s.sede.materiales).reduce((a, b) => a + b, 0) === tot, 'el segundo reclamo dio materiales');
  G.nextDay(s);
  check(S.reclamarCofre(s).ok, 'al día siguiente debería poder reclamar otra vez');
  // Desde el nivel alto trae chips a veces; más unidades con más nivel
  const h = G.newGame(42); h.sede.nivel = 20; let chips = 0, units = 0;
  for (let i = 0; i < 100; i++) { const b = S.reclamarCofre(h).bolsa; chips += b.chips || 0; units += Object.values(b).reduce((a, x) => a + x, 0); h.day++; }
  check(chips > 10 && chips < 70, `chips de la entrega fuera de rango en 100 días: ${chips}`);
  check(units / 100 > tot + 5, 'la entrega del nivel 20 debería traer más que la del nivel 1');
  const g = G.newGame(43); g.gameOver = true;
  check(!S.reclamarCofre(g).ok, 'reclamó con la partida terminada');
})();

/* ---------- Materiales después de los eventos (estrellas, dificultad, 5★, duelos) ---------- */
(function () {
  const tot = (b) => b.reduce((a, x) => a + Object.values(x.bolsa).reduce((p, v) => p + v, 0), 0);
  const prueba = (stars, diff, duel) => { const s = G.newGame(51); const r = { stars, duel, extras: [] }; const e = S.EXT.alTerminarEvento(s, r, { diff, type: 'boxeo' }); return { s, r, e }; };
  const a = prueba(1, 1, null), b = prueba(3, 2, null), c = prueba(5, 4, null), d = prueba(4, 3, 'won');
  check(tot(a.e) < tot(b.e) && tot(b.e) < tot(c.e), `los materiales no suben con estrellas y dificultad (${tot(a.e)}, ${tot(b.e)}, ${tot(c.e)})`);
  check(c.r.extras.some((x) => x.k === 'sedehq.extra_5e'), 'no hay bono de 5 estrellas');
  check(d.r.extras.some((x) => x.k === 'sedehq.extra_duelo') && d.s.sede.materiales.chips >= 1, 'ganar un duelo debería dar bono con chip');
  [b, c, d].forEach((x) => x.r.extras.forEach((e) => {
    const txt = G.tx(e.k, e.p);
    check(typeof e.icon === 'string' && typeof e.k === 'string' && txt.indexOf('{') < 0 && txt.indexOf('sedehq.') < 0 && txt.length > 10, 'extra sin texto armado: ' + txt);
  }));
  check(tot(c.e) === S.MATS.reduce((acc, m) => acc + c.s.sede.materiales[m], 0), 'los materiales del evento no se sumaron');
  // Integrado: un evento de verdad deja materiales en result.extras
  const s = G.newGame(52);
  const ct = s.contracts[0];
  const lo = G.suggestLoadout(s, ct.id);
  G.startEvent(s, ct.id, lo.staffIds, lo.equipIds);
  let inc, guard = 0;
  while ((inc = G.currentIncident(s)) && guard++ < 10) G.resolveIncident(s, inc.choices.find((x) => x.ok).i);
  const f = G.finishEvent(s);
  check(f.ok && Array.isArray(f.result.extras) && f.result.extras.some((x) => x.k === 'sedehq.extra_evento' || f.result.stars === 1), 'el evento no trajo materiales en result.extras');
  // Reciclar: equipo roto → materiales, el equipo desaparece; la cámara de Don Ramiro no se recicla
  const rc = G.newGame(53); rc.money = 99999;
  G.buy(rc, 'cam_pro');
  const cam = rc.equip.find((e) => e.type === 'cam_pro'); cam.condition = 30;
  check(!S.reciclables(rc).some((x) => x.e.starter), 'la cámara de Don Ramiro no debería poder reciclarse');
  const n0 = rc.equip.length;
  const rr = S.reciclar(rc, cam.id);
  check(rr.ok && rc.equip.length === n0 - 1 && Object.values(rr.bolsa).reduce((p, v) => p + v, 0) >= 1, 'reciclar no funcionó');
  check(!S.reciclar(rc, rc.equip.find((e) => e.starter).id).ok, 'recicló la cámara de Don Ramiro');
})();

/* ---------- Bonos por los hooks (calidad, gastos, pago, cupos, taller) ---------- */
(function () {
  const s = G.newGame(61);
  check(S.EXT.bonoCalidad(s, { type: 'boda' }).length === 0 && S.EXT.multGastos(s) === 1 && S.EXT.multPago(s) === 1, 'sin mejoras no debería haber bonos');
  // Simula una sede de nivel 10 con todas sus mejoras
  const armar = (nivel) => {
    const x = G.newGame(62); x.sede.nivel = nivel;
    for (let L = 2; L <= nivel; L++) S.edificiosDe(L).forEach((ed) => { x.sede.mejoras[L + '.' + ed] = 1; });
    return x;
  };
  const tipos = Object.keys(G.EVENT_TYPES);
  const maxQ = (x) => Math.max(...tipos.map((k) => S.EXT.bonoCalidad(x, { type: k }).reduce((a, b) => a + b.pts, 0)));
  const s10 = armar(10), s30 = armar(30), s5 = armar(5);
  console.log(`  Bono de calidad máximo: nivel 5 +${maxQ(s5)}, nivel 10 +${maxQ(s10)}, nivel 30 +${maxQ(s30)}`);
  check(maxQ(s10) <= 6 && maxQ(s10) >= 3, `nivel 10: bono de calidad fuera de rango (${maxQ(s10)}, tope 6)`);
  check(maxQ(s30) <= 12 && maxQ(s30) >= 9, `nivel 30: bono de calidad fuera de rango (${maxQ(s30)}, tope 12)`);
  const qb = S.EXT.bonoCalidad(s10, { type: 'ligapro' });
  check(qb.some((b) => b.ed === 'control') && qb.some((b) => b.ed === 'movil') && !qb.some((b) => b.ed === 'estudio'), 'deportes: control + unidad móvil');
  check(S.EXT.bonoCalidad(s10, { type: 'prensa' }).some((b) => b.ed === 'estudio'), 'prensa: estudio');
  qb.forEach((b) => check(typeof b.k === 'string' && G.tx(b.k, b.p).indexOf('sedehq.') < 0, 'etiqueta de calidad sin texto'));
  const g10 = S.EXT.multGastos(s10), p10 = S.EXT.multPago(s10), l10 = S.EXT.limites(s10), l30 = S.EXT.limites(s30);
  console.log(`  Nivel 10: gastos ×${g10.toFixed(3)}, pago ×${p10.toFixed(3)}, cupos +${l10.staff} personal +${l10.equip} bodega · nivel 30: gastos ×${S.EXT.multGastos(s30).toFixed(3)}, pago ×${S.EXT.multPago(s30).toFixed(3)}, +${l30.staff}/+${l30.equip}`);
  check(g10 < 1 && g10 > 0.9 && S.EXT.multGastos(s30) >= 1 - A.bono.gastosMax, 'gastos fuera de rango');
  check(p10 > 1 && p10 < 1.05 && S.EXT.multPago(s30) <= 1 + A.bono.pagoMax, 'pago fuera de rango');
  check(l30.staff >= 1 && l30.staff <= 3 && l30.equip <= 12, 'cupos fuera de rango');
  check(S.listaBonos(s10).length >= 4, 'la lista de bonos debería mostrar varios bonos');
  // Taller: después del evento recupera estado a los equipos más gastados
  const tw = armar(12); tw.equip.forEach((e) => { e.condition = 50; });
  S.EXT.alTerminarEvento(tw, { stars: 3, extras: [] }, { diff: 2, type: 'boda' });
  check(tw.equip.some((e) => e.condition > 50), 'el taller no recuperó estado');
  // Por la lógica (si la API es la de logic.js): los gastos diarios y el pago bajan/suben con la sede
  if (!shim) {
    const base = G.newGame(63); const conSede = G.newGame(63);
    for (let L = 2; L <= 10; L++) S.edificiosDe(L).forEach((ed) => { conSede.sede.mejoras[L + '.' + ed] = 1; });
    conSede.sede.nivel = 10;
    G.buy(base, 'cam_pro'); G.buy(conSede, 'cam_pro');
    check(G.dailyCost(conSede) <= G.dailyCost(base), `dailyCost no aplica multGastos (${G.dailyCost(conSede)} vs ${G.dailyCost(base)})`);
    const c = conSede.contracts[0];
    const lo = G.suggestLoadout(conSede, c.id);
    const st = conSede.staff.filter((p) => lo.staffIds.includes(p.id)), eq = conSede.equip.filter((e) => lo.equipIds.includes(e.id));
    const q1 = G.computeQuality(conSede, c, st, eq), q0 = G.computeQuality(base, base.contracts[0], base.staff.filter((p) => lo.staffIds.includes(p.id)), base.equip.filter((e) => lo.equipIds.includes(e.id)));
    check(q1.parts.some((p) => p[2] === 'sedehq.q_label') && q1.q >= q0.q, 'computeQuality no suma el bono de la sede');
    if (G.maxStaff) { const x = armar(30); check(G.maxStaff(x) === G.BALANCE.maxStaff + l30.staff, 'maxStaff no suma los cupos de la escuela'); }
    // Los intentos en línea no usan la sede
    if (G.esIntento) { const it = armar(10); it.intento = true; check(!G.extActivas(it), 'las extensiones no deberían correr en un intento en línea'); }
  }
})();

/* ---------- Textos: los 10 idiomas tienen todas las claves y los mismos {parámetros} ---------- */
(function () {
  const es = S.TRAD.es;
  ['en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'].forEach((c) => {
    const d = S.TRAD[c];
    check(d, `falta el idioma ${c}`);
    if (!d) return;
    Object.keys(es).filter((k) => !/^l\d$/.test(k)).forEach((k) => {
      check(typeof d[k] === 'string' && d[k].length > 0, `${c}: falta ${k}`);
      const ph = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join();
      if (d[k]) check(ph(d[k]) === ph(es[k]), `${c}: ${k} no tiene los mismos parámetros`);
    });
  });
  check(G.TEXTOS['sedehq.ed.control'] === es['ed.control'], 'las claves no quedaron en Game.TEXTOS');
})();

/* ---------- Guardar y cargar ---------- */
(function () {
  const s = G.newGame(71); todo(s, 77, 5000); s.rep = 40;
  S.reclamarCofre(s);
  S.mejorar(s, S.edificiosDe(2)[0]);
  const copia = G.deserialize(G.serialize(s));
  check(copia && JSON.stringify(copia.sede) === JSON.stringify(s.sede), 'guardar/cargar cambia la sede');
  check(!S.cofreDisponible(copia), 'al cargar se pudo reclamar otra vez la entrega del mismo día');
  G.nextDay(copia); G.nextDay(s);
  check(JSON.stringify(copia.sede) === JSON.stringify(s.sede), 'la partida cargada no sigue igual que la original');
})();

/* ---------- Bot de 300 días ---------- */
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
  ['lente_kanon_kx21x8_2', (s) => own(s, 'lente_kanon_kx21x8_2') < own(s, 'cam_blackmagia_urso_broadcast_g3')],
  ['au_behringa_x33_rack', (s) => s.rep >= 30 && own(s, 'au_behringa_x33_rack') < 1], ['pw_jonda_eu2300i', (s) => s.rep >= 30 && own(s, 'pw_jonda_eu2300i') < 1],
].filter(([k]) => G.CATALOG[k]);
function wantStaff(s) {
  const r = s.rep, cams = camsN(s), has = (cat) => G.countCat(s, cat) > 0;
  return { camarografo: Math.min(cams - 1, r < 10 ? 1 : r < 30 ? 2 : 3), director: cams >= 2 ? 1 : 0, sonidista: has('audio') ? 1 : 0,
    tecnico_transmision: has('encoder') ? 1 : 0, cablero: cams >= 3 ? 1 : 0, coordinador_piso: r >= 12 ? 1 : 0, operador_graficos: has('graphics') ? 1 : 0,
    operador_repeticion: has('replay') || own(s, 'sw_vmax_pro_pc') ? 1 : 0 };
}
// La parte de la sede: lo que haría un jugador que entra todos los días
function sedeTurn(s) {
  S.reclamarCofre(s);
  const reserva = Math.max(1200, 20 * G.dailyCost(s));
  S.reciclables(s).filter((x) => x.e.condition <= 30).forEach((x) => S.reciclar(s, x.e.id));
  const e = S.etapa(s);
  if (e.max) return;
  if (e.hechas === e.mejoras.length && s.money > e.sede.costo.dinero + reserva) S.subirNivel(s);
  e.mejoras.forEach((m) => { if (!m.hecha && !m.obra && s.money > m.costo.dinero + reserva) S.mejorar(s, m.ed); });
}
function botTurn(s) {
  sedeTurn(s);
  if (s.stock.cable < 2 && s.money > 300) G.buyConsumable(s, 'cable', 1);
  s.equip.filter((e) => e.condition < 45).forEach((e) => { if (s.money > G.repairCost(e) + 300) G.repair(s, e.id); });
  for (const [type, need] of WISHES) {
    const it = G.CATALOG[type];
    if (need(s) && it.minRep <= s.rep && s.money > it.price + 800 + 6 * G.dailyCost(s)) { G.buy(s, type); break; }
  }
  const want = wantStaff(s);
  for (const c of s.candidates.slice().sort((a, b) => b.skill - a.skill)) {
    const role = G.canonRole(c.role);
    const have = s.staff.filter((p) => G.canonRole(p.role) === role && !p.owner).length;
    const cap = s.rep < 12 ? 6 : s.rep < 30 ? 8 : 10;
    if (have < (want[role] || 0) && s.staff.length < cap && c.tier !== 'internacional' && s.money > c.wage * 2 + 400 + 3 * G.dailyCost(s)) G.hire(s, c.id);
  }
  s.staff.filter((p) => !p.owner && p.morale < 15).forEach((p) => G.fire(s, p.id));
  if (s.contracts.length < 2 && s.money > 600) G.marketing(s, 'redes');
  const hired = s.staff.filter((p) => !p.owner);
  if (hired.length && hired.reduce((a, p) => a + p.morale, 0) / hired.length < 45) { G.nextDay(s); return; }
  let best = null;
  for (const c of s.contracts) {
    if (c.internacional) continue;
    const lo = G.suggestLoadout(s, c.id);
    const staff = s.staff.filter((p) => lo.staffIds.includes(p.id)), equip = s.equip.filter((e) => lo.equipIds.includes(e.id));
    if (!equip.some((e) => G.CATALOG[e.type].cat === 'cam')) continue;
    const cq = G.computeQuality(s, c, staff, equip), est = cq.rango.esperado, B = G.BALANCE;
    const st = est >= B.stars[0] ? 5 : est >= B.stars[1] ? 4 : est >= B.stars[2] ? 3 : est >= B.stars[3] ? 2 : 1;
    const net = c.pay * (c.diff >= B.bigFrom ? B.starsPayBig : B.starsPay)[st] - staff.reduce((a, p) => a + G.eventWage(p, c.diff), 0);
    if (net <= 0 && !c.story) continue;
    let score = Math.max(1, net + 0.35 * c.pay * (cq.q / 100)) * (st >= 2 ? 1 : 0.3);
    if (c.story && cq.q >= 60) score *= 2;
    if (c.rival) score *= cq.q >= c.rivalQuality + 10 ? 1 : 0.3;
    if (!best || score > best.score) best = { c, lo, score };
  }
  if (!best) { G.nextDay(s); return; }
  if (!G.startEvent(s, best.c.id, best.lo.staffIds, best.lo.equipIds).ok) { G.nextDay(s); return; }
  let inc, guard = 0;
  while ((inc = G.currentIncident(s)) && guard++ < 10) G.resolveIncident(s, inc.choices.find((x) => x.ok).i);
  G.finishEvent(s);
}
const MARCAS = [50, 100, 200, 300];
function jugar(seed, dias) {
  const s = G.newGame(seed);
  const out = {};
  let guard = 0;
  while (s.day <= dias && !s.gameOver && guard++ < dias * 3) {
    const d0 = s.day;
    botTurn(s);
    MARCAS.forEach((m) => { if (d0 < m && s.day >= m && out[m] === undefined) out[m] = s.sede.nivel; });
  }
  MARCAS.forEach((m) => { if (out[m] === undefined) out[m] = s.gameOver ? null : s.sede.nivel; });
  out.over = s.gameOver; out.storyDay = null; out.s = s;
  return out;
}
/* Determinismo: la misma semilla da exactamente la misma partida (sede incluida) */
(function () {
  const a = jugar(4242, 120).s, b = jugar(4242, 120).s;
  check(G.serialize(a) === G.serialize(b), 'la misma semilla no da la misma partida');
  check(a.sede.nivel >= 2, 'el bot no subió la sede en 120 días');
  // La sede no toca s.seed: con o sin reclamar la entrega, el resto del azar sigue igual
  const x = G.newGame(99), y = G.newGame(99);
  S.reclamarCofre(x); S.EXT.alTerminarEvento(x, { stars: 5, duel: 'won', extras: [] }, { diff: 3 });
  check(x.seed === y.seed, 'la sede consumió números del azar del juego');
})();

const GAMES = Number(process.env.GAMES) || 16;
const runs = [];
for (let g = 0; g < GAMES; g++) {
  try { runs.push(jugar(7000 + g, 300)); } catch (e) { check(false, `partida ${g}: EXCEPCIÓN ${e.stack}`); }
}
const median = (a) => { const v = a.filter((x) => x !== null).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
const med = {};
MARCAS.forEach((m) => { med[m] = median(runs.map((r) => r[m])); });
const vivos = runs.filter((r) => !r.over).length;
console.log(`Simulación (${GAMES} partidas, ${vivos} sin quiebra a los 300 días) · nivel de sede (mediana): día 50 → ${med[50]}, día 100 → ${med[100]}, día 200 → ${med[200]}, día 300 → ${med[300]}`);
console.log('  por partida (50/100/200/300): ' + runs.map((r) => MARCAS.map((m) => (r[m] === null ? '–' : r[m])).join('/')).join('  '));
check(med[50] >= 3 && med[50] <= 5, `día 50: nivel de sede fuera de rango (3-5): ${med[50]}`);
check(med[100] >= 8 && med[100] <= 12, `día 100: nivel de sede fuera de rango (8-12): ${med[100]}`);
check(med[200] >= 15 && med[200] <= 20, `día 200: nivel de sede fuera de rango (15-20): ${med[200]}`);
check(med[300] < A.maxNivel && runs.every((r) => r[300] === null || r[300] < A.maxNivel), `día 300: la sede no debería estar al máximo (${med[300]})`);
check(med[300] > med[200], 'la sede debería seguir subiendo entre el día 200 y el 300');

if (errors) { console.error(`\n❌ ${errors} errores encontrados`); process.exit(1); }
console.log('\n✅ Sede OK: sin errores');

/* ---------- En el navegador (celular de 390x844): node tests/test_sede.js --navegador ----------
   Carga index.html con js/sede.js agregado antes de js/ui.js (si index.html todavía no lo tiene),
   reclama la entrega, abre "Mejorar sede", empieza una mejora y revisa errores y desplazamiento horizontal.
   Capturas en tests/capturas/sede_*.png */
if (process.argv.includes('--navegador')) (async () => {
  const path = require('path'), fs = require('fs'), os = require('os');
  const { chromium } = require('playwright');
  const raiz = path.resolve(__dirname, '..');
  let html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  if (!/js\/sede\.js/.test(html)) html = html.replace('<script src="js/ui.js"></script>', '<script src="js/sede.js"></script>\n<script src="js/ui.js"></script>');
  html = html.replace(/<head>/i, `<head><base href="file://${raiz}/">`);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sede-')), 'index.html');
  fs.writeFileSync(tmp, html);
  const out = path.join(__dirname, 'capturas'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('file://' + tmp, { waitUntil: 'domcontentloaded' });
  const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, 'sede_' + n + '.png') }); };
  const noHScroll = async (tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 1) errs.push(`${tag}: desplazamiento horizontal (${ov}px)`);
    const modal = await page.evaluate(() => { const m = document.getElementById('modal'); return m ? m.scrollWidth - m.clientWidth : 0; });
    if (modal > 1) errs.push(`${tag}: la ventana se sale por los costados (${modal}px)`);
  };
  await page.waitForSelector('#overlay.on');
  await page.locator('[data-act="close"]').first().click();
  // La tarjeta vive en "Tu sede" (el letrero de la sede de Inicio, js/hub.js)
  if (!(await require('./hub_ayuda').verEnInicio(page, '.sd-card', 30000))) errs.push('no apareció la tarjeta de la sede en Inicio');
  await page.locator('.sd-card').scrollIntoViewIfNeeded();
  await shot('01_tarjeta'); await noHScroll('tarjeta');
  // Reclamar la entrega del día (una sola vez)
  const antes = await page.evaluate(() => Object.values(window.__game.state.sede.materiales).reduce((a, b) => a + b, 0));
  await page.locator('.sd-card [data-acc="cofre"]').click();
  const despues = await page.evaluate(() => Object.values(window.__game.state.sede.materiales).reduce((a, b) => a + b, 0));
  if (!(despues > antes)) errs.push('la entrega del día no dio materiales');
  if (await page.locator('.sd-card [data-acc="cofre"]').count()) errs.push('el botón de la entrega sigue activo después de reclamar');
  await page.locator('.sd-card').scrollIntoViewIfNeeded();
  await shot('02_entrega'); await noHScroll('entrega');
  // Abrir "Mejorar sede" y empezar una mejora (con materiales suficientes)
  await page.evaluate(() => { const m = window.__game.state.sede.materiales; ['cables', 'placas', 'paneles', 'credenciales', 'planos'].forEach((k) => { m[k] += 30; }); });
  await page.locator('.sd-card .sd-head').click();
  await page.waitForSelector('#modal .sd-modal');
  await shot('03_modal'); await noHScroll('modal');
  await page.locator('#modal [data-acc="mejorar"]').first().click();
  const obras = await page.evaluate(() => window.__game.state.sede.obras.length);
  if (obras !== 1) errs.push('no empezó la mejora (obras: ' + obras + ')');
  if (!(await page.locator('#modal .sd-modal').count())) errs.push('la ventana se cerró después de mejorar');
  await shot('04_mejora'); await noHScroll('mejora');
  await page.locator('#modal [data-act="close"]').first().click();
  await page.locator('.sd-card').scrollIntoViewIfNeeded();
  await shot('05_tarjeta_obra');
  // Una sede avanzada (nivel 12, con bonos y equipos para reciclar) en inglés
  await page.evaluate(() => {
    const s = window.__game.state, S = window.Sede;
    s.sede.obras = []; s.sede.nivel = 12; s.money = 50000;
    for (let L = 2; L <= 12; L++) S.edificiosDe(L).forEach((ed) => { s.sede.mejoras[L + '.' + ed] = 1; });
    S.edificiosDe(13).slice(0, 2).forEach((ed) => { s.sede.mejoras['13.' + ed] = 1; });
    s.equip.push({ id: 900, type: 'cam_pro', condition: 22 });
    S.MATS.forEach((m) => { s.sede.materiales[m] = 40; });
  });
  if (await page.evaluate(() => !!(window.I18N && window.I18N.setIdioma))) {
    await page.evaluate(() => window.I18N.setIdioma('en'));
    await page.waitForFunction(() => window.I18N.idioma === 'en', null, { timeout: 5000 }).catch(() => errs.push('no cambió a inglés'));
  }
  await page.locator('nav button[data-tab="inicio"]').click();
  await require('./hub_ayuda').verEnInicio(page, '.sd-card', 4000);
  await page.locator('.sd-card').scrollIntoViewIfNeeded();
  await shot('06_tarjeta_nivel12_en'); await noHScroll('nivel 12');
  await page.locator('.sd-card .sd-head').click();
  await page.waitForSelector('#modal .sd-modal');
  await shot('07_modal_nivel12_en');
  await page.evaluate(() => { const m = document.getElementById('modal'); m.scrollTop = m.scrollHeight; });
  await shot('08_modal_bonos_en'); await noHScroll('bonos');
  await page.locator('#modal [data-acc="reciclar"]').first().click();
  await page.waitForSelector('#modal [data-act="confirm-yes"]');
  await page.locator('#modal [data-act="confirm-yes"]').click();
  if (await page.evaluate(() => window.__game.state.equip.some((e) => e.id === 900))) errs.push('reciclar no quitó el equipo');
  await browser.close();
  if (errs.length) { console.error('❌ Navegador:\n' + errs.join('\n')); process.exit(1); }
  console.log('✅ Navegador OK (capturas en tests/capturas/sede_*.png)');
})().catch((e) => { console.error('❌ Navegador:', e); process.exit(1); });
