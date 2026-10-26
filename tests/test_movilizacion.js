/* Prueba de la movilización (cómo llegan el personal y los equipos al evento) y de la flota de vehículos.
   - Precios: taxi del primer evento ~$4-6, rangos realistas de la aplicación (Económico, XL, Carga) por distancia.
   - Capacidad: asientos y bultos, bultos grandes (solo flete o vehículo propio), lo que no entra va por la aplicación.
   - Flota: se usa sola, cada vehículo necesita quien maneje, el del taller no sale, combustible y desgaste.
   - Gastos del día: mantenimiento de la flota en dailyCostBreakdown (y fuera del 0,2% de seguro de equipos).
   - Resultado: result.transporte y result.net lo descuentan; el registro lo anota; el capítulo 0 nunca pierde plata.
   - Determinismo: sin Math.random, no cambia la semilla, no cambia la calidad ni los imprevistos; los intentos en línea
     (s.intento) no tienen movilización. Partidas viejas sin los campos nuevos cargan y terminan bien.
   Uso:  node tests/test_movilizacion.js */
'use strict';
const G = require('../js/logic.js');

let fallas = 0, bien = 0;
function ok(c, m) { if (c) bien++; else { fallas++; console.log('  ✘ ' + m); } return c; }
const sec = (t) => console.log('• ' + t);
const T = G.BALANCE.transporte;

function jugar(s, cid, staffIds, equipIds, elegir) {
  const r = G.startEvent(s, cid, staffIds, equipIds);
  if (!r.ok) return { ok: false, msg: r.msg };
  let inc, n = 0;
  while ((inc = G.currentIncident(s)) && n++ < 12) {
    const okc = inc.choices.filter((c) => c.ok);
    G.resolveIncident(s, (elegir === 'peor' ? okc[okc.length - 1] : okc[0]).i);
  }
  return G.finishEvent(s);
}
// Estado de pruebas: fuera del tutorial, con plata, sin ofertas
function base(seed) {
  const s = G.newGame(seed || 11);
  s.stats.events = 20; s.rep = 40; s.money = 100000; s.contracts = []; s.chapter = 3;
  return s;
}
function contratar(s, n) { for (let i = 0; i < n; i++) { G.refreshCandidates(s); G.hire(s, s.candidates[0].id); } }
function comprar(s, k, n) { const ids = []; for (let i = 0; i < (n || 1); i++) { const r = G.buy(s, k); ok(r.ok, 'compra ' + k + ': ' + r.msg); ids.push(s.equip[s.equip.length - 1].id); } return ids; }

/* ---------- 1. Primer evento: taxi barato y siempre con ganancia ---------- */
sec('Capítulo 0: el taxi del primer evento cuesta $4-6 y el evento nunca pierde plata');
{
  let peorNeto = Infinity, min = Infinity, max = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = G.newGame(seed);
    for (let k = 0; k < 3; k++) { // los 3 eventos del tutorial
      const c = s.contracts.find((x) => x.type === 'misa' || x.type === 'boda') || s.contracts[0];
      if (!c) break;
      const lo = G.suggestLoadout(s, c.id);
      const tp = G.planTransporte(s, c, lo.staffIds, lo.equipIds);
      if (k === 0) {
        ok(tp.eleccion === 'economico' && tp.vehiculos.length === 0, `seed ${seed}: el primer evento va en un Económico (${tp.eleccion})`);
        min = Math.min(min, tp.total); max = Math.max(max, tp.total);
      }
      const money0 = s.money;
      const f = jugar(s, c.id, lo.staffIds, lo.equipIds, 'peor');
      if (!ok(f.ok, `seed ${seed}: el evento ${k + 1} termina`)) break;
      const r = f.result;
      ok(r.transporte && r.transporte.total === tp.total, `seed ${seed}: se cobra lo que mostró la preparación (${r.transporte && r.transporte.total} vs ${tp.total})`);
      ok(r.net === r.pay - r.wages - r.travelCost - r.transporte.total, `seed ${seed}: result.net descuenta la movilización`);
      if (k === 0) {
        peorNeto = Math.min(peorNeto, r.net - r.dailyCost);
        // La caja cambió: pago ahora - sueldos - transporte (y lo que entró del capítulo). Varios eventos por día: los gastos
        // fijos se cobran al cerrar el día (si este evento lo cerró, ya se cobraron)
        const premio = r.chapterDone ? r.chapterDone.reward : 0;
        const fijos = r.dia ? (r.dia.cerrado ? r.dia.gastos : 0) : r.dailyCost;
        ok(s.money === money0 + r.payNow - r.wages - r.transporte.total - fijos + premio, `seed ${seed}: la caja cuadra con el transporte`);
      }
    }
  }
  console.log(`  primer evento: taxi $${min}-$${max} · peor ganancia del día (con la peor opción en cada imprevisto) $${peorNeto}`);
  ok(min >= 4 && max <= 6, `taxi del primer evento entre $4 y $6 (sale $${min}-$${max})`);
  ok(peorNeto > 0, `el primer evento nunca pierde plata, ni con los gastos del día (peor: $${peorNeto})`);
}

/* ---------- 2. Precios de la aplicación ---------- */
sec('Precios realistas por viaje (Ecuador): Económico $3-12, XL $8-20, Carga $25-60');
{
  const kms = [3, 8, 12, 20];
  kms.forEach((km) => {
    const e = G.tarifaApp('economico', km), x = G.tarifaApp('xl', km), c = G.tarifaApp('carga', km);
    if (km >= 3) ok(e >= 2.5 && e <= 12, `Económico a ${km} km: $${e}`);
    if (km >= 8) ok(x >= 7 && x <= 20, `XL a ${km} km: $${x}`);
    ok(c >= 25 && c <= 60, `Carga a ${km} km: $${c}`);
    ok(e < x && x < c, `a ${km} km: Económico < XL < Carga`);
  });
  ok(G.tarifaApp('economico', 22) > G.tarifaApp('economico', 3), 'más lejos, más caro');
  console.log(`  a 8 km: Económico $${G.tarifaApp('economico', 8)} · XL $${G.tarifaApp('xl', 8)} · Carga $${G.tarifaApp('carga', 8)} por viaje`);
  // Distancias: siempre la misma para el mismo cliente, dentro del rango del tipo de evento
  const s = base();
  Object.keys(T.km).filter((k) => k !== 'def' && G.EVENT_TYPES[k]).forEach((k) => {
    G.EVENT_TYPES[k].clients.forEach((cl) => {
      const c = { type: k, client: cl };
      const d1 = G.distanciaKm(s, c), d2 = G.distanciaKm(s, Object.assign({}, c));
      ok(d1 === d2 && d1 >= T.km[k][0] && d1 <= T.km[k][1], `${k} · ${cl}: ${d1} km (rango ${T.km[k]})`);
    });
  });
  ok(G.distanciaKm(s, { type: 'misa', client: 'X', km: 17 }) === 17, 'contract.km manda si viene');
  const nuevo = G.newGame(3);
  ok(nuevo.contracts.every((c) => G.distanciaKm(nuevo, c) <= T.kmTutorial), 'en el tutorial los eventos quedan cerca');
}

/* ---------- 3. Capacidad: asientos, bultos y bultos grandes ---------- */
sec('Capacidad: lo que llevas decide el auto (y los bultos grandes solo van en flete o en tu vehículo)');
{
  const s = base(21);
  contratar(s, 5); // 6 personas
  const c = G.addContract(s, 'concierto');
  c.rival = false;
  const ids = comprar(s, 'cam_pro', 3).concat(comprar(s, 'sop_tripode_basico', 3), comprar(s, 'audio_pro'), comprar(s, 'switch_basic'));
  const staffIds = s.staff.map((p) => p.id);
  const tp = G.planTransporte(s, c, staffIds, ids);
  ok(tp.personas === 6 && tp.bultos === 8, `6 personas y 8 bultos (${tp.personas}, ${tp.bultos})`);
  const op = (k) => tp.opciones.find((o) => o.key === k);
  ok(op('economico') && op('economico').autos === 2 && op('economico').ok, `Económico: 2 autos (${op('economico') && op('economico').autos})`);
  ok(op('xl') && op('xl').autos === 1 && op('xl').ok, `XL: 1 auto (6 asientos + 8 bultos) (${op('xl') && op('xl').autos})`);
  ok(op('carga') && op('carga').fletes === 1 && op('carga').autos === 1, 'Carga: 1 flete y 1 auto para el resto');
  const barata = tp.opciones.filter((o) => o.ok).sort((a, b) => a.precio - b.precio)[0];
  ok(tp.eleccion === barata.key && tp.total === barata.precio, `sin elegir va la más barata (${tp.eleccion} $${tp.total})`);
  ok(tp.opciones.every((o) => o.precio === Math.round(o.porViaje * 2)), 'el precio es ida y vuelta');
  // El jugador elige otra opción válida
  c.movil = 'carga';
  ok(G.planTransporte(s, c, staffIds, ids).eleccion === 'carga', 'contract.movil elige la opción');
  // Un jib (bulto de 4) no entra en un auto: solo Carga
  const jib = comprar(s, 'sop_jib_proeme_4m');
  c.movil = 'economico';
  const tj = G.planTransporte(s, c, staffIds, ids.concat(jib));
  ok(tj.grande === 4, 'el jib es un bulto grande (4)');
  ok(!tj.opciones.find((o) => o.key === 'economico').ok && !tj.opciones.find((o) => o.key === 'xl').ok, 'con el jib, ni Económico ni XL sirven');
  ok(tj.eleccion === 'carga', `una elección que ya no sirve pasa a la que sí (${tj.eleccion})`);
  ok(tj.opciones.find((o) => o.key === 'economico').motivo === 'grande', 'el motivo es el bulto grande');
  // Mucha gente para autos: los alquileres no ocupan lugar
  const rent = comprar(s, 'srv_grua_telescopica');
  ok(G.planTransporte(s, c, staffIds, ids.concat(rent)).bultos === tp.bultos, 'los alquileres los lleva la empresa que alquila (0 bultos)');
  ok(G.bultosDe(G.CATALOG.cam_zony_hdk_3200) === 3 && G.bultosDe(G.CATALOG.mics) === 0.5 && G.bultosDe(G.CATALOG.veh_furgon_carga) === 0, 'bultos por tipo de equipo');
}

/* ---------- 4. Flota ---------- */
sec('Flota: tus vehículos se usan solos, con chofer del personal; el del taller no sale');
{
  const s = base(31);
  contratar(s, 3); // 4 personas
  const c = G.addContract(s, 'graduacion'); c.rival = false;
  const ids = comprar(s, 'cam_pro', 2).concat(comprar(s, 'sop_tripode_basico', 2), comprar(s, 'audio_pro'), comprar(s, 'switch_basic'), comprar(s, 'sop_jib_proeme_4m'));
  const staffIds = s.staff.map((p) => p.id);
  const sinFlota = G.planTransporte(s, c, staffIds, ids);
  ok(sinFlota.vehiculos.length === 0 && sinFlota.eleccion === 'carga', 'sin vehículos: el jib obliga a pedir Carga');
  const [cam] = comprar(s, 'veh_camioneta_carga');
  ok(G.flota(s).length === 1 && G.flota(s)[0].id === cam && G.flota(s)[0].asientos === 5 && G.flota(s)[0].carga === 14, 'comprar la camioneta la suma a la flota');
  const conFlota = G.planTransporte(s, c, staffIds, ids);
  ok(conFlota.vehiculos.length === 1 && conFlota.soloFlota && conFlota.app === 0, 'la camioneta lleva a las 4 personas y el jib: nada por la aplicación');
  ok(conFlota.combustible > 0 && conFlota.combustible < 5 && conFlota.total === conFlota.combustible, `solo combustible ($${conFlota.combustible} a ${conFlota.km} km)`);
  ok(conFlota.total < sinFlota.total, `tu flota sale más barata ($${conFlota.total} vs $${sinFlota.total})`);
  // Más gente de la que entra: el resto va por la aplicación
  contratar(s, 3);
  const staff7 = s.staff.map((p) => p.id);
  const mixto = G.planTransporte(s, c, staff7, ids);
  ok(mixto.vehiculos.length === 1 && mixto.resto.personas === 2 && mixto.app > 0, `7 personas: 5 en la camioneta y 2 por la aplicación (${mixto.resto.personas}, $${mixto.app})`);
  // Cada vehículo necesita quien maneje
  comprar(s, 'veh_sedan_usado');
  const solo = G.planTransporte(s, c, [s.staff[0].id], ids);
  ok(solo.vehiculos.length <= 1, 'una sola persona maneja un solo vehículo');
  // En el taller no sale
  s.equip.find((e) => e.id === cam).condition = T.taller - 1;
  ok(G.flota(s).find((v) => v.id === cam).enTaller, 'con poco estado la camioneta está en el taller');
  ok(!G.planTransporte(s, c, staffIds, ids).vehiculos.some((v) => v.id === cam), 'la del taller no se usa');
  const rc = G.repairCost(s.equip.find((e) => e.id === cam));
  ok(rc === Math.round(G.CATALOG.veh_camioneta_carga.price * T.repairFactor * (100 - (T.taller - 1)) / 100), `reparar un vehículo cuesta menos que un equipo de video ($${rc})`);
  G.repair(s, cam);
  // Desgaste: después del evento la camioneta pierde estado (sin azar)
  const seed0 = s.seed;
  const tp = G.planTransporte(s, c, staffIds, ids);
  ok(s.seed === seed0, 'planTransporte no toca la semilla');
  const f = jugar(s, c.id, staffIds, ids);
  ok(f.ok && f.result.transporte.vehiculos.some((v) => v.id === cam), 'el resultado dice qué vehículos fueron');
  ok(s.equip.find((e) => e.id === cam).condition === 100 - G.desgasteVehiculo(tp.km), `la camioneta se gasta ${G.desgasteVehiculo(tp.km)} por ${tp.km} km`);
  ok(s.log.some((l) => l.k === 'log.transporte'), 'el registro anota la movilización');
  // Unidad móvil llevada como equipo: va siempre (y lleva gente y carga)
  const s2 = base(32); contratar(s2, 2);
  const c2 = G.addContract(s2, 'barrial'); c2.rival = false;
  const ob = comprar(s2, 'veh_sprinto_ob_usada');
  const e2 = comprar(s2, 'cam_pro', 2);
  const t2 = G.planTransporte(s2, c2, s2.staff.map((p) => p.id), e2.concat(ob));
  ok(t2.vehiculos.some((v) => v.id === ob[0]) && t2.soloFlota, 'la unidad móvil que llevas como equipo también lleva al personal');
}

/* ---------- 5. Gastos del día ---------- */
sec('Gastos del día: mantenimiento y seguro de la flota');
{
  const s = base(41);
  const b0 = G.dailyCostBreakdown(s);
  ok(b0.vehiculos === 0, 'sin vehículos no hay gasto de flota');
  comprar(s, 'veh_camioneta_carga'); comprar(s, 'veh_furgon_carga');
  const b = G.dailyCostBreakdown(s);
  ok(b.vehiculos === G.CATALOG.veh_camioneta_carga.mant + G.CATALOG.veh_furgon_carga.mant, `mantenimiento diario de la flota: $${b.vehiculos}`);
  ok(b.equip === b0.equip, 'los vehículos con mantenimiento propio no pagan el 0,2% de seguro de equipos');
  ok(b.total === G.dailyCost(s), 'el detalle suma lo mismo que dailyCost');
  const m0 = s.money; G.nextDay(s);
  ok(m0 - s.money === b.total, 'nextDay cobra el mantenimiento');
  // Las unidades móviles (sin mant) siguen como antes
  const s3 = base(42); comprar(s3, 'veh_sprinto_ob_usada');
  const valor = s3.equip.filter((e) => !G.CATALOG[e.type].alquiler).reduce((a, e) => a + G.CATALOG[e.type].price, 0);
  ok(G.dailyCostBreakdown(s3).equip === Math.round(valor * G.BALANCE.daily.equipShare) && G.dailyCostBreakdown(s3).vehiculos === 0, 'la unidad móvil OB sigue en el seguro de equipos');
  ['veh_sedan_usado', 'veh_camioneta_carga', 'veh_van_pasajeros_usada', 'veh_furgon_carga'].forEach((k) => {
    const it = G.CATALOG[k];
    ok(it && it.cat === 'vehicle' && it.price >= 2000 && it.price <= 12000 && it.mant >= 2 && it.mant <= 10 && G.flotaDe(it), `${k}: $${it && it.price}, $${it && it.mant}/día, en la flota`);
    ok(it.name && it.name !== 'item.' + k + '.nombre' && it.desc, `${k}: tiene nombre y descripción`);
  });
  ok(G.shopByCategory(s).find((c) => c.key === 'vehicle').items.length >= 7, 'la tienda de vehículos tiene las opciones nuevas');
}

/* ---------- 6. Internacional, intentos y determinismo ---------- */
sec('Internacional (va en el viaje), intentos en línea (sin movilización) y determinismo');
{
  const s = G.newGame(55); s.chapter = 4; s.rep = 60; s.money = 30000; s.contracts = []; s.stats.events = 30;
  const c = G.addIntlContract(s, 'regional');
  const tp = G.planTransporte(s, c, s.staff.map((p) => p.id), s.equip.map((e) => e.id));
  ok(tp.incluido === 'viaje' && tp.total === 0, 'internacional: la movilización va en los gastos de viaje (no se cobra dos veces)');
  // Intento: mismo estado, sin movilización
  const mk = () => { const x = base(77); contratar(x, 2); const cc = G.addContract(x, 'barrial'); cc.rival = false; return { x, cc }; };
  const a = mk(), b = mk();
  b.x.intento = true;
  const ids = (x) => [x.staff.map((p) => p.id), x.equip.map((e) => e.id)];
  const ra = G.startEvent(a.x, a.cc.id, ...ids(a.x)), rb = G.startEvent(b.x, b.cc.id, ...ids(b.x));
  ok(ra.ok && rb.ok && a.x.currentEvent.transporte && !b.x.currentEvent.transporte, 'el intento en línea no tiene movilización');
  ok(a.x.currentEvent.base === b.x.currentEvent.base && JSON.stringify(a.x.currentEvent.incidents.map((i) => i.key)) === JSON.stringify(b.x.currentEvent.incidents.map((i) => i.key)) && a.x.seed === b.x.seed,
    'la movilización no cambia la calidad, los imprevistos ni la semilla');
  // Sin Math.random en todo el evento
  const mr = Math.random; let usado = 0; Math.random = () => { usado++; return mr(); };
  try {
    const s2 = base(78); contratar(s2, 3); comprar(s2, 'veh_camioneta_carga'); const c2 = G.addContract(s2, 'boda');
    const lo = G.suggestLoadout(s2, c2.id);
    G.planTransporte(s2, c2, lo.staffIds, lo.equipIds); G.flota(s2); G.dailyCostBreakdown(s2);
    jugar(s2, c2.id, lo.staffIds, lo.equipIds);
  } finally { Math.random = mr; }
  ok(usado === 0, 'la movilización no usa Math.random');
  // Mismo plan dos veces
  const s3 = base(79); contratar(s3, 4); const c3 = G.addContract(s3, 'lanzamiento'); const lo3 = G.suggestLoadout(s3, c3.id);
  ok(JSON.stringify(G.planTransporte(s3, c3, lo3.staffIds, lo3.equipIds)) === JSON.stringify(G.planTransporte(s3, c3, lo3.staffIds, lo3.equipIds)), 'el plan siempre sale igual');
}

/* ---------- 7. Partidas viejas ---------- */
sec('Partidas viejas (sin los campos nuevos) cargan y terminan bien');
{
  const s = base(91); contratar(s, 2);
  comprar(s, 'veh_camioneta_carga'); comprar(s, 'veh_sprinto_ob_usada');
  const c = G.addContract(s, 'barrial'); c.rival = false;
  const lo = G.suggestLoadout(s, c.id);
  G.startEvent(s, c.id, lo.staffIds, lo.equipIds);
  // Como una partida guardada antes de la movilización: sin ev.transporte, sin contract.movil, sin result.transporte
  const viejo = JSON.parse(G.serialize(s));
  delete viejo.currentEvent.transporte;
  viejo.contracts.forEach((x) => { delete x.movil; });
  if (viejo.lastResult) delete viejo.lastResult.transporte;
  const s2 = G.deserialize(JSON.stringify(viejo));
  ok(!!s2, 'la partida vieja carga');
  ok(G.flota(s2).length === 2 && Number.isFinite(G.dailyCost(s2)), 'su camioneta y su unidad móvil quedan en la flota');
  let inc, n = 0;
  while ((inc = G.currentIncident(s2)) && n++ < 12) G.resolveIncident(s2, inc.choices.find((x) => x.ok).i);
  const f = G.finishEvent(s2);
  ok(f.ok && f.result.transporte === null && Number.isFinite(s2.money) && f.result.net === f.result.pay - f.result.wages - f.result.travelCost, 'el evento que estaba en curso termina sin cobrar movilización');
  const c2 = s2.contracts[0] || G.addContract(s2, 'misa');
  const lo2 = G.suggestLoadout(s2, c2.id);
  const f2 = jugar(s2, c2.id, lo2.staffIds, lo2.equipIds);
  ok(f2.ok && f2.result.transporte && Number.isFinite(f2.result.transporte.total), 'el siguiente evento ya tiene movilización');
  // Partida v2 sin vehículos nuevos ni nada de flota
  const v2 = JSON.parse(G.serialize(G.newGame(5))); v2.v = 2;
  const s3 = G.deserialize(JSON.stringify(v2));
  ok(s3 && G.flota(s3).length === 0 && G.dailyCostBreakdown(s3).vehiculos === 0, 'partida v2: flota vacía, sin gasto de vehículos');
}

/* ---------- 8. En proporción a lo que cobras, y la flota se paga sola ---------- */
sec('Proporción con el pago (eventos chicos ~3-6%) y la flota se paga con el tiempo');
{
  // Un evento chico ($130-220) con 2 personas y equipo básico: taxi de $5-12 ida y vuelta
  let peor = 0, mejor = 1, suma = 0, n = 0;
  // (las bodas quedan más lejos —haciendas, 4-14 km— pero pagan más: van con los eventos medianos)
  ['misa', 'funeral', 'irl', 'prensa'].forEach((tipo, i) => {
    for (let k = 0; k < 12; k++) {
      const s = base(300 + i * 20 + k); s.rep = 5; contratar(s, 1);
      const c = G.addContract(s, tipo); c.pay = 130 + ((k * 37) % 91);
      const staffIds = s.staff.slice(0, 2).map((p) => p.id);
      const equipIds = s.equip.filter((e) => ['cam', 'audio', 'support', 'mics'].includes(G.CATALOG[e.type].cat)).slice(0, 3).map((e) => e.id);
      const tp = G.planTransporte(s, c, staffIds, equipIds);
      ok(tp.total >= 5 && tp.total <= 12, `${tipo} de $${c.pay} a ${tp.km} km: movilización $${tp.total} (esperado $5-12)`);
      const pct = tp.cobro / c.pay; peor = Math.max(peor, pct); mejor = Math.min(mejor, pct); suma += pct; n++;
      ok(tp.pctPago === Math.round(tp.cobro / c.pay * 1000) / 10, 'pctPago es el % del pago');
    }
  });
  console.log(`  eventos chicos ($130-220): movilización ${(suma / n * 100).toFixed(1)}% del pago en promedio (de ${(mejor * 100).toFixed(1)}% a ${(peor * 100).toFixed(1)}%)`);
  ok(suma / n >= 0.03 && suma / n <= 0.06 && mejor >= 0.025 && peor <= 0.09, 'eventos chicos: ~3-6% del pago en promedio (nunca más del 9%)');
  // Tope: nunca más del 10% del pago acordado
  const s = base(77); contratar(s, 6);
  const c = G.addContract(s, 'final'); c.pay = 200; c.km = 22;
  const tp = G.planTransporte(s, c, s.staff.map((p) => p.id), s.equip.map((e) => e.id));
  ok(tp.cobro <= 20 && tp.total > tp.cobro, `tope del 10%: cuesta $${tp.total}, se cobra $${tp.cobro}`);
  // La camioneta propia vs el taxi en barriales a ~8 km, un evento por día: la mitad con equipo liviano (2 autos) y la
  // mitad con un bulto grande (jib: flete). Se paga con lo que ahorras y con el rótulo (+1% en las cotizaciones).
  const s2 = base(78); contratar(s2, 4);
  const c2 = G.addContract(s2, 'barrial'); c2.km = 8; c2.rival = false;
  const lo2 = G.suggestLoadout(s2, c2.id);
  const jib2 = comprar(s2, 'sop_jib_proeme_4m');
  const costo = () => [G.planTransporte(s2, c2, lo2.staffIds, lo2.equipIds).total, G.planTransporte(s2, c2, lo2.staffIds, lo2.equipIds.concat(jib2)).total];
  const taxi = costo();
  comprar(s2, 'veh_camioneta_carga');
  const prop = costo();
  const it = G.CATALOG.veh_camioneta_carga;
  const pub = c2.pay * T.publicidad.porVehiculo;
  const porDia = (taxi[0] - prop[0] + taxi[1] - prop[1]) / 2 + pub - it.mant;
  const dias = Math.round(it.price / porDia);
  console.log(`  barrial de $${c2.pay}: taxi $${taxi[0]} / con jib $${taxi[1]} · camioneta propia $${prop[0]} / $${prop[1]} (+$${Math.round(pub)} por el rótulo) − $${it.mant}/día → se paga en ~${dias} eventos`);
  ok(prop[0] < taxi[0] && prop[1] < taxi[1] && porDia > 0 && dias >= 40 && dias <= 300, `la camioneta se paga sola en muchos eventos (${dias})`);
}

/* ---------- 9. En el navegador (celular 390x844) ----------
   node tests/test_movilizacion.js --navegador   (NODE_PATH=/opt/npm-tools/node_modules)
   Aplica en memoria cada cambio de server/INTEGRAR_MOVILIZACION.md que todavía no esté en ui.js, index.html y js/lang.
   Un evento en taxi (Llévame) y otro con la van propia rotulada; capturas tests/capturas/movil_*.png */
function aplicarIntegracion(leer) {
  const fs = require('fs'), path = require('path');
  const doc = fs.readFileSync(path.join(__dirname, '..', 'server', 'INTEGRAR_MOVILIZACION.md'), 'utf8');
  const out = {}, hechos = [], ya = [], errores = [];
  doc.split(/\n### /).slice(1).forEach((secc) => {
    const cab = secc.split('\n')[0];
    const mf = /— `([^`]+)`/.exec(cab);
    if (!mf) return;
    const archivo = mf[1];
    const bloques = [...secc.matchAll(/```[a-z]*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    let txt = out[archivo] !== undefined ? out[archivo] : leer(archivo);
    const ma = /agregar después de la línea `([^`]+)`/.exec(cab);
    if (ma) {
      if (txt.includes(bloques[0])) { ya.push(cab); return; }
      const lineas = txt.split('\n'), idx = lineas.map((l, i) => (l.includes(ma[1]) ? i : -1)).filter((i) => i >= 0);
      if (idx.length !== 1) { errores.push(`${cab}: la línea aparece ${idx.length} veces`); return; }
      lineas.splice(idx[0] + 1, 0, bloques[0]);
      txt = lineas.join('\n');
    } else {
      if (txt.includes(bloques[1])) { ya.push(cab); return; }
      const n = txt.split(bloques[0]).length - 1;
      if (n !== 1) { errores.push(`${cab}: el texto a buscar aparece ${n} veces`); return; }
      txt = txt.replace(bloques[0], () => bloques[1]);
    }
    out[archivo] = txt; hechos.push(cab);
  });
  return { archivos: out, hechos, ya, errores };
}
if (process.argv.includes('--integrar')) {
  // Escribe los archivos integrados en otra carpeta (para correr las demás pruebas con la integración puesta)
  const fs = require('fs'), path = require('path');
  const RAIZ = path.resolve(__dirname, '..'), dest = process.argv[process.argv.indexOf('--integrar') + 1];
  const r = aplicarIntegracion((f) => fs.readFileSync(path.join(RAIZ, f), 'utf8'));
  Object.entries(r.archivos).forEach(([f, txt]) => fs.writeFileSync(path.join(dest, f), txt));
  console.log(`integración: ${r.hechos.length} cambios aplicados en ${dest}, ${r.ya.length} ya estaban, ${r.errores.length} errores`);
  r.errores.forEach((e) => console.log('  ✘ ' + e));
  process.exit(r.errores.length ? 1 : 0);
}

if (!process.argv.includes('--navegador')) {
  console.log(fallas ? `\n❌ ${fallas} fallas (${bien} bien)` : `\n✅ Movilización OK (${bien} comprobaciones)`);
  process.exit(fallas ? 1 : 0);
}
(async () => {
  const fs = require('fs'), path = require('path');
  const { chromium } = require('playwright');
  const RAIZ = path.resolve(__dirname, '..'), BASE = 'http://envivo.test';
  const CAP = path.join(__dirname, 'capturas'); fs.mkdirSync(CAP, { recursive: true });
  const integ = aplicarIntegracion((f) => fs.readFileSync(path.join(RAIZ, f), 'utf8'));
  integ.errores.forEach((e) => ok(false, 'integración: ' + e));
  console.log(`• Navegador: ${integ.hechos.length} cambios de INTEGRAR_MOVILIZACION.md aplicados en memoria, ${integ.ya.length} ya estaban`);
  const errs = [];
  // Partida: capítulo 1, fuera del tutorial, 3 personas, sin vehículos, con un nombre de productora
  const save = (() => {
    const s = G.newGame(21); s.chapter = 1; s.day = 14; s.stats.events = 8; s.money = 20000; s.rep = 30; s.productora = 'Tukán Producciones';
    contratar(s, 2); s.contracts = [];
    ['cam_basic', 'sop_tripode_basico', 'sop_tripode_basico', 'audio_basic', 'mics', 'sw_blackmagia_atom_mini_pro'].forEach((k) => G.buy(s, k));
    s.money = 20000;
    const c1 = G.addContract(s, 'boda'); c1.rival = false;
    const c2 = G.addContract(s, 'barrial'); c2.rival = false;
    const c3 = G.addContract(s, 'misa'); c3.rival = false;
    return G.serialize(s);
  })();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
    const tipo = rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.html') ? 'text/html' : rel.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    if (integ.archivos[rel] !== undefined) return r.fulfill({ status: 200, contentType: tipo, body: integ.archivos[rel] });
    if (u.pathname === '/api/estado') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tienda: { productos: [], premium: [] }, logueado: false, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' } }) });
    if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const f = path.join(RAIZ, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript((s) => {
    window.__ENVIVO_ANIM_MOVIL = true; // la escena también en el navegador controlado
    localStorage.setItem('envivo_lang', 'es'); localStorage.setItem('envivo_tycoon_save_v1', s);
    localStorage.setItem('envivo_aviso_cuenta', '3'); localStorage.setItem('envivo_guia_v1', '"1"');
  }, save);
  await page.goto(BASE + '/?fecha=2026-10-10');
  await page.waitForTimeout(1800);
  const cerrar = async () => { for (let i = 0; i < 6; i++) { const x = await page.$('#overlay.on [data-act^="close"]'); if (!x) break; await x.click(); await page.waitForTimeout(200); } };
  await cerrar();
  const shot = async (n, sel) => { await page.waitForTimeout(250); if (sel) await page.locator(sel).first().screenshot({ path: path.join(CAP, 'movil_' + n + '.png') }); else await page.screenshot({ path: path.join(CAP, 'movil_' + n + '.png') }); };
  const noHScroll = async (tag) => {
    const ov = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, (() => { const m = document.getElementById('modal'); return m ? m.scrollWidth - m.clientWidth : 0; })()));
    if (ov > 1) errs.push(`${tag}: desplazamiento horizontal (${ov}px)`);
  };
  const st = () => page.evaluate(() => window.__game.state);
  const abrirPrep = async (tipo) => {
    await page.locator('nav button[data-tab="clientes"]').click();
    await page.waitForTimeout(250);
    const id = await page.evaluate((t) => { const c = window.__game.state.contracts.find((x) => x.type === t); return c ? c.id : null; }, tipo);
    if (id == null) { errs.push('no está la oferta ' + tipo); return false; }
    await page.locator(`[data-act="prep"][data-id="${id}"]`).click();
    await page.waitForSelector('#modal #movSec');
    return id;
  };
  // Juega el evento en vivo hasta el resultado (la primera opción posible en cada imprevisto)
  const jugarVivo = async () => {
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(220);
      if (await page.locator('#modal [data-act="after-result"]').count()) return true;
      const b = page.locator('#modal [data-act="choose"]:not([disabled])');
      if (await b.count()) { await b.first().click(); continue; }
      const n = page.locator('#modal [data-act="next-inc"], #modal [data-act="finish"]');
      if (await n.count()) { await n.first().click(); continue; }
    }
    return !!(await page.locator('#modal [data-act="after-result"]').count());
  };

  /* --- Evento 1: en taxi (sin vehículos) --- */
  const id1 = await abrirPrep('boda');
  await page.locator('#movSec').scrollIntoViewIfNeeded();
  const app1 = await page.locator('#movSec .mov-app').count();
  if (!app1) errs.push('sin vehículos debería salir la tarjeta de Llévame');
  const ops = await page.locator('#movSec .mov-op').count();
  if (ops < 2 || ops > 3) errs.push('la app debería mostrar 2-3 opciones: ' + ops);
  if (await page.locator('#movSec .mov-op.sel').count() !== 1) errs.push('debería haber una opción ya elegida');
  const txt1 = await page.locator('#modal').textContent();
  if (!/Movilización \$\d+ · \d+(,\d)?% del pago/.test(txt1)) errs.push('falta "Movilización $X · N% del pago"');
  if (/Uber|Cabify|DiDi|InDrive/i.test(txt1)) errs.push('marca real en la app');
  await shot('01_taxi', '#movSec'); await noHScroll('preparación');
  await page.evaluate(() => { const m = document.getElementById('modal'); const sec = document.getElementById('movSec'); m.scrollTop = sec.offsetTop - 260; });
  await shot('02_prep_taxi');
  // Elegir otra opción y volver a la más barata
  const elegida0 = await page.locator('#movSec .mov-op.sel').getAttribute('data-mov-op');
  const otra = page.locator('#movSec .mov-op:not(.sel):not([disabled])');
  if (await otra.count()) {
    const k = await otra.first().getAttribute('data-mov-op');
    await otra.first().click(); await page.waitForTimeout(150);
    const mv = await page.evaluate((cid) => window.__game.state.contracts.find((c) => c.id === cid).movil, id1);
    if (mv !== k) errs.push(`tocar la opción no la guardó (${mv} vs ${k})`);
    if ((await page.locator('#movSec .mov-op.sel').getAttribute('data-mov-op')) !== k) errs.push('la opción tocada no quedó marcada');
    await page.locator(`#movSec .mov-op[data-mov-op="${elegida0}"]`).click(); await page.waitForTimeout(150);
  }
  const plan1 = await page.evaluate((cid) => { const s = window.__game.state; const c = s.contracts.find((x) => x.id === cid); return { c: c.pay }; }, id1);
  // ¡Salir al aire! → escena del taxi
  const m0 = (await st()).money;
  await page.locator('#modal [data-act="go-live"]').click();
  await page.waitForSelector('.mov-anim', { timeout: 3000 }).catch(() => errs.push('no salió la escena al salir al aire'));
  await page.waitForTimeout(500); await shot('03_escena_taxi_llega');
  await page.waitForTimeout(1500); await shot('04_escena_taxi_sale');
  await page.waitForSelector('.mov-anim', { state: 'detached', timeout: 5000 }).catch(() => errs.push('la escena no se fue sola'));
  if (!(await page.locator('#modal [data-act="choose"]').count()) && !(await page.locator('#modal [data-act="after-result"]').count())) errs.push('después de la escena no está el evento en vivo');
  await shot('05_en_vivo');
  if (!(await jugarVivo())) errs.push('el evento 1 no llegó al resultado');
  const r1 = await page.evaluate(() => window.__game.state.lastResult || null);
  const filaRes = await page.locator('#modal table td', { hasText: 'Movilización' }).count();
  if (!filaRes) errs.push('el resultado no muestra la movilización');
  await page.evaluate(() => { const m = document.getElementById('modal'); const t = m.querySelector('table'); if (t) m.scrollTop = t.offsetTop - 200; });
  await shot('06_resultado_taxi'); await noHScroll('resultado');
  await page.locator('#modal [data-act="after-result"]').click(); await page.waitForTimeout(300); await cerrar();

  /* --- "Flota" en la sede de Inicio (el garaje, js/hub.js) sin vehículos y con la van --- */
  const { verEnInicio } = require('./hub_ayuda');
  const hojaFlota = async () => { await verEnInicio(page, '.mov-flota'); return ((await page.textContent('#hubSheet .hub-sh-t').catch(() => '')) + ' · ' + (await page.textContent('#hubSheet .mov-flota').catch(() => ''))).replace(/\s+/g, ' '); };
  await page.locator('nav button[data-tab="inicio"]').click(); await page.waitForTimeout(250);
  if (!(await page.locator('.hs[data-hub="flota"]').count())) errs.push('no está el garaje (Flota) en la sede de Inicio');
  const resumen0 = await hojaFlota();
  if (!/Flota y movilización/.test(resumen0) || !/taxi/.test(resumen0)) errs.push('título/resumen de la hoja Flota: ' + resumen0);
  await page.locator('.mov-flota').first().scrollIntoViewIfNeeded(); await shot('07_flota_vacia', '#hubSheet .hub-sh');
  // Comprar la van desde Bodega (categoría vehicle)
  await page.locator('.mov-flota [data-acc="tienda"]').click(); await page.waitForTimeout(400);
  const catOn = await page.evaluate(() => { const b = document.querySelector('[data-act="cat"].on'); return b ? b.dataset.k : ''; });
  if (catOn !== 'vehicle') errs.push('"Ver vehículos" no abrió la categoría de vehículos: ' + catOn);
  const bVan = page.locator('[data-act="buy"][data-k="veh_van_pasajeros_usada"]');
  if (await bVan.count()) { await bVan.scrollIntoViewIfNeeded(); await shot('07b_tienda_vehiculos'); await bVan.click(); await page.waitForTimeout(300); await cerrar(); }
  else errs.push('la van no está en la tienda de vehículos');
  if (!(await st()).equip.some((e) => e.type === 'veh_van_pasajeros_usada')) errs.push('no se compró la van');
  await page.locator('nav button[data-tab="inicio"]').click(); await page.waitForTimeout(250);
  if (!(await page.evaluate(() => !!document.querySelector('.hub-svg [data-cuarto="flota"] svg')))) errs.push('la van no se ve en el garaje de la sede');
  const resumen1 = await hojaFlota();
  await page.locator('.mov-flota').first().scrollIntoViewIfNeeded();
  if (!/1 vehículo · \$5\/día/.test(resumen1)) errs.push('resumen de la flota con la van: ' + resumen1);
  await shot('08_flota_van', '#hubSheet .hub-sh');
  await verEnInicio(page, '.costbox');   // los gastos de hoy: en "Tu sede"
  const gastos = await page.locator('.costbox').textContent().catch(() => '');
  if (!/vehículos \$5/i.test(gastos)) errs.push('los gastos de hoy no muestran los vehículos: ' + gastos);

  /* --- Evento 2: con la van propia rotulada --- */
  await abrirPrep('barrial');
  const veh = await page.locator('#movSec .mov-veh').count();
  if (!veh) errs.push('la van propia no aparece en la movilización');
  await page.evaluate(() => { const m = document.getElementById('modal'); const sec = document.getElementById('movSec'); m.scrollTop = sec.offsetTop - 260; });
  await shot('09_prep_van'); await shot('10_van', '#movSec'); await noHScroll('preparación van');
  await page.locator('#modal [data-act="go-live"]').click();
  await page.waitForSelector('.mov-anim', { timeout: 3000 }).catch(() => errs.push('no salió la escena con la van'));
  const rot = await page.locator('.mov-anim svg').innerHTML().catch(() => '');
  if (!/TUKÁN PRODUCCIONES/.test(rot)) errs.push('la van no lleva el nombre de la productora');
  await page.waitForTimeout(1100); await shot('11_escena_van_carga');
  await page.waitForTimeout(1050); await shot('12_escena_van_sale');
  // Se salta tocando
  await page.locator('.mov-anim').click().catch(() => {});
  await page.waitForSelector('.mov-anim', { state: 'detached', timeout: 1500 }).catch(() => errs.push('tocar no saltó la escena'));
  if (!(await jugarVivo())) errs.push('el evento 2 no llegó al resultado');
  const r2 = await page.evaluate(() => window.__game.state.lastResult || null);
  await page.evaluate(() => { const m = document.getElementById('modal'); const t = m.querySelector('table'); if (t) m.scrollTop = t.offsetTop - 200; });
  await shot('13_resultado_van');
  await page.locator('#modal [data-act="after-result"]').click(); await page.waitForTimeout(300); await cerrar();

  /* --- Evento 3: menos movimiento (prefers-reduced-motion): imagen fija ~1 s --- */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirPrep('misa');
  const t0 = Date.now();
  await page.locator('#modal [data-act="go-live"]').click();
  await page.waitForSelector('.mov-anim.quieto', { timeout: 2000 }).catch(() => errs.push('con reduced-motion la escena no es fija'));
  await shot('14_escena_fija');
  await page.waitForSelector('.mov-anim', { state: 'detached', timeout: 2500 }).catch(() => errs.push('la escena fija no se fue en ~1 s'));
  const dt = Date.now() - t0;
  if (dt > 2200) errs.push('la escena fija tardó ' + dt + ' ms');
  await jugarVivo();
  await page.locator('#modal [data-act="after-result"]').click().catch(() => {}); await page.waitForTimeout(300); await cerrar();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  /* --- Inglés --- */
  if (await page.evaluate(() => !!(window.I18N && window.I18N.setIdioma))) {
    await page.evaluate(() => window.I18N.setIdioma('en'));
    await page.waitForFunction(() => window.I18N.idioma === 'en', null, { timeout: 5000 }).catch(() => errs.push('no cambió a inglés'));
    await page.waitForTimeout(400);
    await page.locator('nav button[data-tab="inicio"]').click(); await page.waitForTimeout(250);
    const en = await hojaFlota();
    if (!/Fleet & transport/.test(en) || !/vehicle/.test(en)) errs.push('hoja Flota en inglés: ' + en.slice(0, 120));
    await page.locator('.mov-flota').first().scrollIntoViewIfNeeded(); await shot('15_flota_en', '#hubSheet .hub-sh');
  }
  await browser.close();
  ok(!!r1 && r1.transporte && r1.transporte.eleccion && !r1.transporte.vehiculos.length, `evento 1 fue en taxi (${r1 && r1.transporte && r1.transporte.eleccion}, $${r1 && r1.transporte && r1.transporte.total})`);
  ok(!!r2 && r2.transporte && r2.transporte.vehiculos.length === 1, `evento 2 fue en la van propia ($${r2 && r2.transporte && r2.transporte.total})`);
  errs.forEach((e) => ok(false, 'navegador: ' + e));
  console.log(fallas ? `\n❌ ${fallas} fallas (${bien} bien)` : `\n✅ Movilización OK, con el navegador (${bien} comprobaciones; capturas en tests/capturas/movil_*.png)`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('❌ Navegador:', e); process.exit(1); });
