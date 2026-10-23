/* Pruebas del motor de batalla de la Copa de Servidores (server/eventos/batalla.js).
   Uso:  node server/eventos/test_batalla.js        (sale con 1 si algo falla) */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const B = require(path.join(__dirname, 'batalla.js'));
const V = require(path.join(__dirname, '..', 'validador', 'validador.js'));

let fallas = 0, bien = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (c) bien++; else fallas++; };
const G = V.motorActual().G;
const TIPOS = Object.keys(G.EVENT_TYPES);
const CLI = path.join(__dirname, 'batalla.js');
const cli = (obj) => execFileSync(process.execPath, [CLI], { input: JSON.stringify(obj) }).toString('utf8');

/* Equipo fuerte: el de la casa del contrato, pero con gente internacional de habilidad 5 y equipos impecables (más extras). */
function fuerte(tipo) {
  const e = B.equipoCasa({ type: tipo });
  return { staff: e.staff.map((p) => Object.assign({}, p, { skill: 5, tier: 'internacional', morale: 95 })),
    equip: e.equip.map((x) => Object.assign({}, x, { condition: 100 })) };
}
const debil = () => ({ staff: [{ role: 'camarografo', skill: 1, tier: 'junior', morale: 60 }], equip: [{ type: 'cam_basic', condition: 40 }] });

console.log('Torneos');
const nombres = ['Copa Planeta de Balompié', 'Copa de los Libertadores del Sur', 'Liga Estelar de Clubes', 'Mundial de Aro y Tablero',
  'Juegos de los Cinco Continentes', 'Gran Premio Fórmula Veloz', 'La Pelea del Siglo', 'El Gran Tazón'];
const T = B.TORNEOS;
ok(Object.keys(T).length === 8 && nombres.every((n) => Object.values(T).some((t) => t.nombre === n)), 'Los 8 torneos parodia de COPAS.md');
ok(Object.values(T).every((t) => typeof t.cadena === 'string' && t.cadena.length > 3 && t.tipos.length === 5 && t.tipos.every((x) => TIPOS.includes(x))),
  'Cada torneo tiene su cadena parodia y 5 tipos de evento que existen');
const usados = new Set([].concat(...Object.values(T).map((t) => t.tipos)));
ok(['ligapro', 'final', 'concierto', 'boxeo', 'lucha_libre', 'lanzamiento_autos'].every((x) => usados.has(x)), 'Fútbol, arena, boxeo, lucha y autos están en algún torneo');
ok(new Set(Object.values(T).map((t) => t.cadena)).size === 8, 'Las cadenas no se repiten');

console.log('Determinismo');
const entrada = { seed: 424242, torneo: 'juegos_cinco_continentes', planA: [fuerte('ligapro'), debil()], planB: [fuerte('boxeo')] };
const r1 = JSON.stringify(B.jugarCruce(entrada));
const r2 = JSON.stringify(B.jugarCruce(JSON.parse(JSON.stringify(entrada))));
ok(r1 === r2, 'Misma entrada → misma salida (módulo)');
const c1 = cli(entrada), c2 = cli(entrada);
ok(c1 === c2 && c1 === r1 + '\n', 'Por consola: byte a byte igual y lo mismo que el módulo');
const otra = JSON.stringify(B.jugarCruce(Object.assign({}, entrada, { seed: 424243 })));
ok(otra !== r1, 'Otra semilla → otro resultado');
const R = JSON.parse(r1);
ok(R.ok === true && R.partidos.length === 5 && R.partidos.every((p, i) => p.n === i + 1), '5 partidos numerados 1..5');
ok(R.partidos.every((p) => Number.isInteger(p.calidad_a) && Number.isInteger(p.calidad_b) && ['a', 'b', 'empate'].includes(p.ganador)), 'Calidades enteras y ganador a|b|empate');
ok(R.calidad_total_a === R.partidos.reduce((a, p) => a + p.calidad_a, 0) && R.calidad_total_b === R.partidos.reduce((a, p) => a + p.calidad_b, 0), 'Totales = suma de los partidos');
ok(R.partidos.every((p) => p.incidentes_a.every((x) => p.imprevistos.includes(x.clave)) && p.incidentes_b.every((x) => p.imprevistos.includes(x.clave))),
  'Los dos lados juegan imprevistos de la MISMA lista sorteada');
ok(R.partidos.every((p) => p.tipo === T.juegos_cinco_continentes.tipos[p.n - 1]), 'Sin contratos: usa los tipos del torneo');
ok(Math.random() >= 0 && typeof Math.random === 'function', 'Math.random vuelve a la normalidad después del cruce');

console.log('Fuerte contra débil');
let gF = 0, tot = 0;
Object.keys(T).forEach((k, i) => {
  const tipos = T[k].tipos;
  const r = B.jugarCruce({ seed: 1000 + i * 77, torneo: k, planA: tipos.map((x) => fuerte(x)), planB: tipos.map(() => debil()) });
  if (!r.ok) { ok(false, `${k}: ${r.motivo} ${r.mensaje}`); return; }
  r.partidos.forEach((p) => { tot++; if (p.ganador === 'a') gF++; });
});
ok(tot === 40 && gF >= 36, `El equipo fuerte gana casi siempre (${gF}/${tot})`);
const inv = B.jugarCruce({ seed: 77, torneo: 'la_pelea_del_siglo', planA: [debil()], planB: [fuerte('boxeo')] });
ok(inv.ok && inv.partidos[0].ganador === 'b', 'Del otro lado también: el fuerte (B) gana el partido 1');

console.log('Equipo de la casa');
const casa = B.jugarCruce({ seed: 5, torneo: 'copa_libertadores_sur', planA: [fuerte('ligapro'), debil()], planB: [] });
ok(casa.ok && casa.partidos.every((p) => p.casa_b === true), 'Plantel vacío → 5 equipos de la casa (nunca pierde por no presentarse)');
ok(casa.partidos.slice(2).every((p) => p.casa_a === true) && casa.partidos.slice(0, 2).every((p) => p.casa_a === false), 'Plantel de 2 → partidos 3 a 5 con la casa');
ok(casa.partidos[0].orden_a === 0 && casa.partidos[1].orden_a === 1 && casa.partidos[0].poder_a > casa.partidos[1].poder_a, 'Ordenado por poder (el más fuerte juega el partido 1)');
const al = B.jugarCruce({ seed: 5, torneo: 'copa_libertadores_sur', planA: [debil(), fuerte('ligapro')], planB: [] });
ok(al.ok && al.partidos[0].orden_a === 1 && al.partidos[0].calidad_a === casa.partidos[0].calidad_a, 'El orden de llegada no importa: se ordena por poder');
const cc = B.jugarCruce({ seed: 9, torneo: 'mundial_aro_tablero', planA: [], planB: [] });
ok(cc.ok && cc.partidos.every((p) => p.ganador === 'empate' && p.calidad_a === p.calidad_b), 'Casa contra casa: empate exacto (los dos lados son simétricos)');
ok(TIPOS.every((t) => { const e = B.equipoCasa({ type: t }); return e.staff.every((p) => p.skill === 2) && e.equip.every((x) => !G.CATALOG[x.type].vip && !G.CATALOG[x.type].premium); }),
  'Casa: habilidad 2 y solo equipos normales del catálogo (sin VIP ni exclusivos)');
const malo = { staff: [{ role: 'astronauta', skill: 9 }], equip: [{ type: 'cam_basic', condition: 50 }] };
const rm = B.jugarCruce({ seed: 3, torneo: 'el_gran_tazon', planA: [malo], planB: [] });
ok(rm.ok && rm.partidos[0].casa_a === true && rm.partidos[0].motivo_casa_a === 'equipo_invalido', 'Equipo que la lógica rechaza → juega la casa (con motivo)');

console.log('Entradas inválidas');
const malas = [
  [null, 'entrada_invalida'], [[1, 2], 'entrada_invalida'],
  [{ seed: 'x', torneo: 'el_gran_tazon' }, 'semilla_invalida'], [{ seed: 2 ** 40, torneo: 'el_gran_tazon' }, 'semilla_invalida'],
  [{ seed: 1, torneo: 'copa_mundial_real' }, 'torneo_invalido'], [{ seed: 1 }, 'torneo_invalido'],
  [{ seed: 1, torneo: 'el_gran_tazon', contratos: [{ type: 'ligapro' }] }, 'contratos_invalidos'],
  [{ seed: 1, torneo: 'el_gran_tazon', contratos: [1, 2, 3, 4, 5].map(() => ({ type: 'partido_de_marte' })) }, 'contrato_invalido'],
  [{ seed: 1, torneo: 'el_gran_tazon', contratos: [1, 2, 3, 4, 5].map(() => ({ type: 'ligapro', cams: 99 })) }, 'contrato_invalido'],
  [{ seed: 1, torneo: 'el_gran_tazon', planA: 'todos' }, 'plantel_invalido'],
  [{ seed: 1, torneo: 'el_gran_tazon', planB: [1, 2, 3, 4, 5, 6].map(() => debil()) }, 'plantel_invalido'],
  [{ seed: 1, torneo: 'el_gran_tazon', planA: [{ hola: 1 }] }, 'plantel_invalido'],
  [{ seed: 1, torneo: 'el_gran_tazon', contexto: 'fama' }, 'contexto_invalido'],
  [{ seed: 1, torneo: 'el_gran_tazon', contexto: { fama: 500 } }, 'contexto_invalido'],
];
malas.forEach(([x, motivo]) => { const r = B.jugarCruce(x); ok(r.ok === false && r.motivo === motivo, `Rechaza (${motivo}): ${JSON.stringify(x).slice(0, 70)}`); });
ok(B.jugarCruce({ seed: 1, torneo: 'el_gran_tazon', contexto: [] }).ok === true, 'contexto [] (arreglo vacío de PHP) = sin contexto');
ok(cli({ accion: 'nada' }).includes('accion_desconocida'), 'Consola: acción desconocida');
let salida = '';
try { execFileSync(process.execPath, [CLI], { input: '{no es json' }); } catch (e) { salida = String(e.stdout); }
ok(salida.includes('json_invalido'), 'Consola: JSON inválido');

console.log('Los 16 tipos de evento');
ok(TIPOS.length === 16, `La lógica tiene ${TIPOS.length} tipos de evento`);
const jugados = new Set();
for (let i = 0; i < TIPOS.length; i += 5) {
  const lote = TIPOS.slice(i, i + 5);
  while (lote.length < 5) lote.push(TIPOS[lote.length]);
  const r = B.jugarCruce({ seed: 31337 + i, torneo: 'juegos_cinco_continentes', contratos: lote.map((t) => ({ type: t })),
    planA: lote.map((t) => fuerte(t)), planB: [debil(), debil()] });
  if (!r.ok) { ok(false, `Lote ${lote.join(',')}: ${r.motivo} ${r.mensaje}`); continue; }
  r.partidos.forEach((p) => { if (p.calidad_a >= 0 && p.calidad_a <= 100 && p.calidad_b >= 0 && p.calidad_b <= 100 && !p.casa_a) jugados.add(p.tipo); });
}
ok(TIPOS.every((t) => jugados.has(t)), `Se juegan los 16 (${jugados.size}): ${TIPOS.filter((t) => !jugados.has(t)).join(', ') || 'todos'}`);

console.log('Poder');
ok(B.poder(fuerte('final')) > B.poder(B.equipoCasa({ type: 'final' })) && B.poder(B.equipoCasa({ type: 'final' })) > B.poder(debil()) && B.poder(debil()) > 0, 'fuerte > casa > débil > 0');
ok(B.poder(null) === 0 && B.poder({ x: 1 }) === 0 && B.poder('a') === 0, 'Lo que no es equipo vale 0');
ok(B.poder({ equipo: debil() }) === B.poder(debil()), 'Acepta {equipo:{staff, equip}}');
ok(B.poder({ personal: [{ rol: 'camarografo', habilidad: 1, nivel: 'junior' }], inventario: [{ item: 'cam_basic' }] }) > 0, 'Acepta el resumen de duelo {personal, inventario}');
ok(JSON.parse(cli({ accion: 'poder', equipo: debil() })).poder === B.poder(debil()), 'Consola: {accion:"poder"}');
ok(JSON.parse(cli({ accion: 'contratos', torneo: 'el_gran_tazon' })).contratos.length === 5, 'Consola: {accion:"contratos"}');

console.log('Rapidez');
const pesado = { seed: 8080, torneo: 'liga_estelar_clubes', planA: T.liga_estelar_clubes.tipos.map((t) => fuerte(t)), planB: T.liga_estelar_clubes.tipos.map((t) => fuerte(t)) };
let peor = 0;
for (let k = 0; k < 5; k++) { const t0 = process.hrtime.bigint(); B.jugarCruce(Object.assign({}, pesado, { seed: 8080 + k })); peor = Math.max(peor, Number(process.hrtime.bigint() - t0) / 1e6); }
ok(peor < 300, `Cruce de 5 partidos en menos de 300 ms (peor: ${peor.toFixed(1)} ms)`);
const t0 = Date.now(); cli(pesado); const msCli = Date.now() - t0;
console.log(`  · por consola (con arranque de Node): ${msCli} ms`);

console.log(`\n${fallas ? 'FALLAS: ' + fallas : 'TODO OK'} (${bien} bien)`);
process.exit(fallas ? 1 : 0);
