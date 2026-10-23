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

if (fallas) { console.error(`\n❌ ${fallas} fallas`); process.exit(1); }
console.log('\n✅ Reglas premium OK');
