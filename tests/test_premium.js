/* Prueba de las reglas premium del juego (js/premium.js): exclusivos, VIP, inventario del servidor, entregas.
   Uso:  node tests/test_premium.js */
'use strict';
const G = require('../js/logic.js');
globalThis.Game = G;
const P = require('../js/premium.js');

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

const s = G.newGame(5);
s.money = 99999; s.rep = 60;
ok(!G.buy(s, 'dron4k').ok, 'Un exclusivo no se compra con dinero del juego');
ok(!G.buy(s, 'vip_cam8k').ok, 'Un equipo VIP no se compra con dinero del juego');

const sync = P.sincronizarInventario(s, [{ id: 1, item: 'dron4k', serie: 7 }, { id: 2, item: 'vip_cam8k', serie: 1 }]);
ok(sync.agregados.length === 2 && sync.agregados[0] === G.CATALOG.dron4k.name + ' #0007', 'El inventario del servidor entra a la bodega con su número de serie');
const dron = s.equip.find((e) => e.srvId === 1);
const cam8k = s.equip.find((e) => e.srvId === 2);
ok(!G.sell(s, dron.id).ok && G.sellPrice(dron) === 0, 'Los exclusivos no se venden al desarmadero');
ok(P.sincronizarInventario(s, [{ id: 1, item: 'dron4k', serie: 7 }, { id: 2, item: 'vip_cam8k', serie: 1 }]).agregados.length === 0, 'Sincronizar dos veces no duplica');

dron.condition = 50;
const sinVip = P.costoReparar(dron);
P.setVip(true);
ok(P.costoReparar(dron) === Math.round(sinVip * 0.7), 'VIP: reparar cuesta 30 % menos');
P.setVip(false);

const c = s.contracts[0];
ok(!G.suggestLoadout(s, c.id).equipIds.includes(cam8k.id), 'Sin VIP, el equipo VIP queda guardado (no se elige)');
P.setVip(true);
ok(G.suggestLoadout(s, c.id).equipIds.includes(cam8k.id), 'Con VIP, el equipo VIP sí se usa');
P.setVip(false);
const r = G.startEvent(s, c.id, [s.staff[0].id], [cam8k.id, dron.id]);
ok(r.ok && !s.currentEvent.equipIds.includes(cam8k.id), 'Sin VIP, aunque lo marques, el equipo VIP no sale al evento');
while (G.currentIncident(s)) G.resolveIncident(s, G.currentIncident(s).choices.find((x) => x.ok).i);
G.finishEvent(s);

const q = P.sincronizarInventario(s, [{ id: 2, item: 'vip_cam8k', serie: 1 }]);
ok(q.quitados.length === 1 && !s.equip.some((e) => e.srvId === 1), 'Si publicas o vendes un equipo, sale de tu bodega');

ok(P.aplicarEntregas(s, [{ id: 9, tipo: 'dinero', cantidad: 150 }, { id: 9, tipo: 'dinero', cantidad: 150 }]).length === 1, 'Cada entrega se aplica una sola vez');

const ns = G.newGame(6);
const dinero0 = ns.money, personal0 = ns.staff.length;
P.prepararPartidaNueva(ns, [{ id: 9, tipo: 'dinero', cantidad: 150 }, { id: 10, tipo: 'personal', item: 'stream', cantidad: 3 }]);
ok(ns.money === dinero0 && ns.staff.length === personal0 + 1, 'Partida nueva: el dinero de regalo no se repite, el personal comprado sí');

const otra = G.deserialize(G.serialize(s));
ok(otra && otra.premium && otra.premium.aplicadas.includes(9), 'Las entregas aplicadas se guardan en la partida');

/* ---------- Edición Exclusiva: una por categoría, sin ventaja en la competencia, también gratis ---------- */
const EX = Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].exclusivo);
const CON_CREDITOS = ['cam', 'switcher', 'vehicle', 'power'];   // ya tenían equipos con créditos; service = alquileres (no aplica)
const catsEx = EX.map((k) => G.CATALOG[k].cat);
ok(new Set(catsEx).size === EX.length && G.CATEGORIAS.every((c) => catsEx.includes(c.key) || CON_CREDITOS.includes(c.key) || c.key === 'service'),
  `Edición Exclusiva: una por cada categoría sin equipo con créditos (${EX.length})`);
const normales = (cat) => Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].cat === cat && !G.CATALOG[k].exclusivo && !G.CATALOG[k].premium && !G.CATALOG[k].alquiler);
const topDe = (cat) => normales(cat).sort((a, b) => G.CATALOG[b].q - G.CATALOG[a].q || G.CATALOG[b].minRep - G.CATALOG[a].minRep || G.CATALOG[b].price - G.CATALOG[a].price)[0];
const malQ = EX.filter((k) => {
  const it = G.CATALOG[k], top = G.CATALOG[topDe(it.cat)];
  const maxCat = Math.max(...Object.keys(G.CATALOG).filter((x) => G.CATALOG[x].cat === it.cat).map((x) => G.CATALOG[x].q));
  return !(it.q === top.q || (it.q === top.q + 1 && top.q + 1 < maxCat));
});
ok(!malQ.length, 'Misma calidad que el mejor normal de su categoría (+1 solo si ese está lejos del máximo)' + (malQ.length ? ': ' + malQ.join(', ') : ''));
const malFama = EX.filter((k) => { const it = G.CATALOG[k], top = G.CATALOG[topDe(it.cat)]; return !(it.minRep > top.minRep && (it.minRepCreditos < top.minRep || it.minRepCreditos === 0) && it.price > top.price); });
ok(!malFama.length, 'Gratis con dinero del juego: más caro y con más fama que el mejor normal; con créditos se desbloquea antes' + (malFama.length ? ': ' + malFama.join(', ') : ''));
const malPerks = EX.filter((k) => { const it = G.CATALOG[k], top = G.CATALOG[topDe(it.cat)]; return !(it.desgaste < 1 && it.repairBase < top.price && G.bultosDe(it) <= G.bultosDe(top) && it.valor === top.price && it.creditos > 0); });
ok(!malPerks.length, 'Ventajas sin puntos: se gasta menos, reparar cuesta menos, menos o iguales bultos, seguro como el normal' + (malPerks.length ? ': ' + malPerks.join(', ') : ''));
ok(EX.filter((k) => G.bultosDe(G.CATALOG[k]) < G.bultosDe(G.CATALOG[topDe(G.CATALOG[k].cat)])).length >= 12, 'La mayoría ocupa menos bultos que su par normal');
const sx = G.newGame(11);
sx.money = 200000; sx.rep = 60;
ok(!G.buy(sx, 'ex_repeticion').ok, 'Con dinero del juego no se compra antes de su fama (75)');
sx.rep = 80;
const antes = sx.money;
ok(G.buy(sx, 'ex_repeticion').ok && sx.money === antes - G.CATALOG.ex_repeticion.price, 'Con 80 de fama sí: gratis (con dinero del juego)');
const libre = sx.equip.find((e) => e.type === 'ex_repeticion');
ok(libre.srvId === undefined && G.sellPrice(libre) > 0, 'El comprado con dinero del juego se vende como cualquier equipo');
P.sincronizarInventario(sx, [{ id: 77, item: 'ex_repeticion', serie: 3 }]);
const deCred = sx.equip.find((e) => e.srvId === 77);
ok(deCred && P.exclusivoDelServidor(deCred) && !G.sell(sx, deCred.id).ok && G.sellPrice(deCred) === 0, 'El canjeado con créditos llega con número de serie y no se vende al desarmadero (va al mercado)');
const reg = { id: 999, type: 'rep_evx_xt_via', condition: 50 };
deCred.condition = 50;
ok(P.costoReparar(deCred) * 2 === P.costoReparar(reg), 'Reparar el exclusivo cuesta la mitad que el mejor normal');
const sv = G.newGame(12), sv2 = G.newGame(12);
sv.equip = [{ id: 1, type: 'ex_audio', condition: 100 }]; sv2.equip = [{ id: 1, type: 'au_kalrek_brio_37', condition: 100 }];
ok(G.dailyCost(sv) === G.dailyCost(sv2), 'El seguro diario es el del mejor normal (no su precio en dinero del juego)');

if (fallas) { console.error(`\n❌ ${fallas} fallas`); process.exit(1); }
console.log('\n✅ Reglas premium OK');
