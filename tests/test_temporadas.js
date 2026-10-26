/* Prueba de las temporadas (js/temporadas.js) y de los ganchos de extensión de js/logic.js.
   1) Node: ventanas de fechas, Pascua 2026–2030, Carnaval, ofertas solo dentro de la ventana, determinismo con fecha fija,
      premio una sola vez, guardar/cargar, intentos en línea sin extensiones (intento.js), ganchos de extensión.
   2) Navegador (Playwright, 390x844): ?fecha=2026-12-20 y ?fecha=2026-12-31 → tarjeta en Inicio, se prepara y juega
      un evento especial hasta el final sin errores, el adorno de la sede aparece después del premio.
      Capturas: tests/capturas/temporada_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_temporadas.js   (SIN_NAVEGADOR=1 para saltar la parte 2) */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const RAIZ = path.resolve(__dirname, '..');
const G = require('../js/logic.js');
const TP = require('../js/temporadas.js');
const Intento = require('../server/validador/intento.js');

let fallas = 0, bien = 0;
const ok = (c, m) => { if (c) bien++; else { fallas++; console.log('  ✘ ' + m); } return c; };
const ids = (iso) => TP.activas(iso).map((a) => a.def.key).sort().join(',');

console.log('1) Fechas');
const pascuas = { 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21' };
Object.keys(pascuas).forEach((y) => ok(TP.isoDe(TP.pascua(Number(y))) === pascuas[y], `Pascua ${y}: ${TP.isoDe(TP.pascua(Number(y)))} ≠ ${pascuas[y]}`));
// Carnaval: los 5 días antes del Miércoles de Ceniza (Pascua − 46)
const carn = TP.porKey('carnaval');
Object.keys(pascuas).forEach((y) => {
  const w = TP.ventana(carn, Number(y)), ceniza = TP.pascua(Number(y)) - 46;
  ok(w.hasta === ceniza - 1 && w.desde === ceniza - 5, `Carnaval ${y}: ${TP.isoDe(w.desde)}–${TP.isoDe(w.hasta)}`);
});
ok(TP.isoDe(TP.ventana(carn, 2027).desde) === '2027-02-05' && TP.isoDe(TP.ventana(carn, 2027).hasta) === '2027-02-09', 'Carnaval 2027: 5–9 feb');
// Pascua: la semana antes (Domingo de Ramos → Domingo de Pascua)
ok(ids('2026-03-29') === 'pascua' && ids('2026-04-05') === 'pascua' && ids('2026-03-28') === '' && ids('2026-04-06') === '', 'ventana de Semana Santa 2026');
ok(ids('2026-10-23') === '', 'el 23 de octubre no hay temporada');
ok(ids('2026-10-24') === 'halloween' && ids('2026-10-31') === 'halloween' && ids('2026-11-01') === '', 'Halloween 24–31 oct');
ok(ids('2026-12-01') === 'navidad' && ids('2026-12-20') === 'navidad,pase_nino' && ids('2026-12-25') === 'navidad,pase_nino', 'Navidad y Pase del Niño');
ok(ids('2026-12-26') === 'fin_anio,pase_nino' && ids('2026-12-31') === 'fin_anio' && ids('2027-01-01') === 'fin_anio' && ids('2027-01-02') === '', 'Fin de año cruza el año (26 dic – 1 ene)');
ok(TP.activas('2027-01-01')[0].id === 'fin_anio-2026', 'el 1 de enero es la temporada de fin de año que empezó en 2026');
ok(ids('2027-02-07') === 'carnaval,san_valentin' && ids('2027-02-14') === 'san_valentin' && ids('2027-02-15') === '', 'San Valentín 7–14 feb');
const pr = TP.proxima('2026-10-23');
ok(pr && pr.def.key === 'halloween' && pr.dias === 1, 'el 23 de octubre la próxima es Halloween, mañana');
ok(TP.proxima('2026-11-05').def.key === 'navidad' && TP.proxima('2026-11-05').dias === 26, 'el 5 de noviembre: Navidad en 26 días');
ok(TP.activas('fecha mala').length === 0 && TP.activas(null).length === 0, 'fecha inválida: nada');

console.log('2) Ofertas solo dentro de la ventana');
function jugarDias(seed, fecha, dias) {
  const s = G.newGame(seed);
  if (fecha) TP.setFecha(fecha, s);
  const vistos = [];
  for (let d = 0; d < dias && !s.gameOver; d++) {
    s.contracts.forEach((c) => { if (c.temporada && !vistos.includes(c.id)) vistos.push(c.id); });
    G.nextDay(s);
  }
  return { s, vistos };
}
ok(jugarDias(11, null, 20).vistos.length === 0, 'sin fecha no hay ofertas especiales');
ok(jugarDias(11, '2026-10-23', 20).vistos.length === 0, 'fuera de temporada (23 oct) no hay ofertas especiales');
const nav = jugarDias(11, '2026-12-20', 20);
ok(nav.vistos.length >= 2, `en Navidad llegan ofertas especiales (${nav.vistos.length})`);
// Las ofertas normales nunca son de temporada
const s0 = G.newGame(3);
for (let i = 0; i < 300; i++) { s0.contracts = []; const c = G.addContract(s0); ok(!c || !G.EVENT_TYPES[c.type].temporada, 'oferta normal de temporada: ' + (c && c.type)); }
// Cuando la temporada termina, sus ofertas se retiran
{
  const s = G.newGame(5); TP.setFecha('2026-12-31', s);
  ok(s.contracts.some((c) => c.temporada === 'fin_anio'), 'el 31 de diciembre llega la oferta de Fin de año al cargar');
  const c = s.contracts.find((x) => x.temporada === 'fin_anio');
  ok(c.type === 'tmp_reveillon' || c.type === 'tmp_anio_viejo', 'oferta de fin de año: ' + c.type);
  TP.setFecha('2027-01-05', s); G.nextDay(s);
  ok(!s.contracts.some((x) => x.temporada === 'fin_anio'), 'pasada la temporada, su oferta se retira');
}
// El pago especial: multiplicador de la temporada
{
  const s = G.newGame(5); TP.setFecha('2026-12-20', s);
  const c = s.contracts.find((x) => x.type === 'tmp_arbol_ny');
  const t = G.EVENT_TYPES.tmp_arbol_ny;
  ok(c && c.pay >= Math.round(t.pay[0] * G.payFactor(s, t.diff) * 1.7 / 10) * 10 - 10, 'el árbol de Nueva York paga ×1,7');
  ok(c && !c.rival, 'los eventos especiales no son disputados');
}

console.log('3) Determinismo con fecha fija');
{
  const a = jugarDias(77, '2026-12-20', 30).s, b = jugarDias(77, '2026-12-20', 30).s;
  ok(G.serialize(a) === G.serialize(b), 'misma semilla + misma fecha = misma partida');
  const src = fs.readFileSync(path.join(RAIZ, 'js', 'temporadas.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  ok(!/Math\.random|Date\.now|new Date/.test(src), 'temporadas.js no usa Math.random ni el reloj');
}

console.log('4) Juego completo: premio una sola vez');
function jugarEspecial(s, tipo) {
  const c = s.contracts.find((x) => x.temporada && (!tipo || x.type === tipo));
  if (!c) return null;
  const lo = G.suggestLoadout(s, c.id);
  const r0 = G.startEvent(s, c.id, lo.staffIds, lo.equipIds);
  if (!r0.ok) return null;
  let inc, n = 0;
  while ((inc = G.currentIncident(s)) && n++ < 12) { const ch = inc.choices.findIndex((x) => x.ok); G.resolveIncident(s, ch >= 0 ? ch : inc.choices.length - 1); }
  return G.finishEvent(s).result;
}
{
  const s = G.newGame(21); s.money = 50000; TP.setFecha('2026-12-31', s);
  const meta = TP.porKey('fin_anio').meta.n, premio = TP.porKey('fin_anio').premios;
  let jugados = 0, premios = 0, guard = 0, partes = false;
  while (jugados < meta + 2 && guard++ < 80) {
    const c = s.contracts.find((x) => x.temporada === 'fin_anio');
    if (!c) { G.nextDay(s); continue; }
    const lo = G.suggestLoadout(s, c.id);
    const q = G.computeQuality(s, c, s.staff.filter((p) => lo.staffIds.includes(p.id)), s.equip.filter((e) => lo.equipIds.includes(e.id)));
    if (q.parts.some((p) => /^temp\.parte\.req_/.test(p[2]))) partes = true;
    const m0 = s.money, f0 = s.rep;
    const r = jugarEspecial(s, c.type);
    if (!r) { G.nextDay(s); continue; }
    jugados++;
    ok(Array.isArray(r.extras) && r.extras.some((x) => x.k === 'temp.res.progreso'), 'el resultado trae la línea de progreso');
    if (r.extras.some((x) => x.premio)) { premios++; ok(s.money - m0 >= premio.dinero - 20000 && s.rep >= Math.min(100, f0), 'el premio suma dinero y fama'); }
  }
  ok(partes, '"Ver cómo se calcula" muestra los requisitos especiales');
  ok(jugados >= meta + 1, `se jugaron ${jugados} eventos de fin de año`);
  ok(premios === 1, `el premio se entregó una sola vez (${premios})`);
  const T = s.temporada;
  ok(T.trofeos.length === 1 && T.trofeos[0].key === 'fin_anio' && T.cosmeticos.includes('fuegos'), 'trofeo y adorno de la sede');
  ok(T.prog['fin_anio-2026'].premio === true, 'progreso marcado como premiado');
  // Guardar / cargar
  const raw = G.serialize(s);
  const s2 = G.deserialize(raw);
  ok(s2 && s2.temporada && s2.temporada.trofeos.length === 1 && s2.temporada.fecha === '2026-12-31' && s2.temporada.cosmeticos.includes('fuegos'), 'guardar/cargar conserva la temporada');
  // Un campo desconocido de otra extensión sobrevive
  const o = JSON.parse(raw); o.campoDeOtraExtension = { a: 1 };
  const s3 = G.deserialize(JSON.stringify(o));
  ok(s3 && s3.campoDeOtraExtension && s3.campoDeOtraExtension.a === 1, 'los campos desconocidos sobreviven a guardar/cargar');
  // Partida vieja sin s.temporada: migrar la crea
  delete o.temporada;
  const s4 = G.deserialize(JSON.stringify(o));
  ok(s4 && s4.temporada && Array.isArray(s4.temporada.trofeos) && s4.temporada.fecha === null, 'partida vieja: migrar crea s.temporada');
  // Después de la historia (modo libre) los eventos especiales siguen llegando
  const s5 = G.newGame(9); s5.storyDone = true; s5.chapter = G.CHAPTERS.length - 1; TP.setFecha('2026-10-26', s5);
  ok(s5.contracts.some((c) => c.temporada === 'halloween'), 'modo libre: también hay eventos especiales');
}

console.log('5) Intentos en línea: sin extensiones');
{
  const intento = { seed: 4242, vip: false,
    equipo: { staff: [{ role: 'camarografo', tier: 'semi_senior', skill: 3, wage: 30, morale: 80 }, { role: 'director', tier: 'junior', skill: 2, wage: 30, morale: 80 }, { role: 'tecnico_transmision', tier: 'junior', skill: 2, wage: 25, morale: 80 }],
      equip: [{ type: 'cam_basic', condition: 90 }, { type: 'cam_basic', condition: 90 }] },
    contrato: { type: 'graduacion', client: 'Colegio', cams: 2, audio: true, stream: true, outdoor: false, diff: 2, pay: 600 },
    contexto: { fama: 30, dinero: 1000 } };
  const elegir = (inc) => inc.choices.length - 1;
  const sinExt = Intento.jugar(G, intento, elegir);
  // Una extensión que lo cambia TODO: si se aplicara a un intento, el resultado cambiaría
  let llamadas = 0;
  const trampa = { id: 'prueba_trampa', migrar: () => { llamadas++; }, bonoCalidad: () => { llamadas++; return [{ k: 'parte.base', pts: 40 }]; },
    multPago: () => { llamadas++; return 3; }, multGastos: () => { llamadas++; return 0.1; }, alNuevoDia: () => { llamadas++; },
    alTerminarEvento: (s, r) => { llamadas++; r.extras = [{ k: 'x' }]; }, limites: () => { llamadas++; return { staff: 50 }; }, contratosExtra: () => { llamadas++; } };
  G.registrarExtension(trampa);
  const { s } = Intento.crearEstado(G, intento);
  ok(s.intento === true && G.esIntento(s) && !G.extActivas(s), 'intento.js marca el estado (s.intento)');
  llamadas = 0;
  const conExt = Intento.jugar(G, intento, elegir);
  ok(JSON.stringify(conExt.resultado) === JSON.stringify(sinExt.resultado), 'el intento da lo mismo con o sin extensiones');
  ok(llamadas <= 1, `ningún gancho corre en el intento salvo migrar dentro de newGame (${llamadas})`);
  ok(!(conExt.resultado && conExt.resultado.extras), 'sin líneas extra en el resultado del intento');
  // Un estado de intento sin la marca (intento.js viejo) también se reconoce por su forma
  const { s: sv } = Intento.crearEstado(G, intento); delete sv.intento;
  ok(G.esIntento(sv), 'estado de intento sin marca: se reconoce igual');
  // Y en una partida normal la misma extensión sí corre
  const sn = G.newGame(1);
  ok(G.extActivas(sn) && G.maxStaff(sn) === G.BALANCE.maxStaff + 50, 'partida normal: limites() suma al máximo de personal');
  const base = G.dailyCostBreakdown(sn);
  ok(base.ext && base.ext.mult === 0.1, 'multGastos aparece en el detalle de gastos');
  const c = G.addContract(sn, 'boda');
  ok(c && c.pay % 10 === 0, 'multPago aplicado al crear el contrato');
  const q = G.computeQuality(sn, c, sn.staff, sn.equip);
  ok(q.parts.some((p) => p[2] === 'parte.base' && p[1] === 40), 'bonoCalidad entra en las partes de la calidad');
  // Quitar la trampa (registrar con el mismo id la reemplaza; aquí se saca de la lista)
  G.extensiones.splice(G.extensiones.indexOf(trampa), 1);
  ok(G.maxStaff(sn) === G.BALANCE.maxStaff, 'sin la extensión vuelve el máximo normal');
  // Las ofertas especiales nunca entran en un intento: limpiarContrato no deja pasar el campo temporada
  const ti = Object.assign({}, intento, { contrato: Object.assign({}, intento.contrato, { type: 'graduacion', temporada: 'navidad', temporadaId: 'navidad-2026' }) });
  const { s: st } = Intento.crearEstado(G, ti);
  ok(!G.extActivas(st), 'intento con campos de temporada en el contrato: igual sin extensiones');
}

console.log(`Node: ${bien} bien, ${fallas} mal`);

/* ---------- 2) Navegador ---------- */
async function navegador() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('(sin Playwright: se salta la prueba en el navegador)'); return; }
  const tipos = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (/^\/api\//.test(u)) { res.writeHead(404); res.end('{}'); return; }
    const f = path.join(RAIZ, u === '/' ? 'index.html' : u);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  fs.mkdirSync(path.join(__dirname, 'capturas'), { recursive: true });
  const cap = (n) => path.join(__dirname, 'capturas', 'temporada_' + n + '.png');
  try {
    for (const fecha of ['2026-12-20', '2026-12-31']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|404|net::/.test(m.text())) errores.push(m.text()); });
      await page.goto(`http://localhost:${port}/index.html?fecha=${fecha}`);
      await page.waitForFunction(() => window.__game && window.__game.state && document.querySelector('#tab-inicio .card'));
      // Fuera de la primera pantalla (capítulo 1 / tutorial): cerrar lo que esté abierto
      const cerrar = async () => {
        for (let i = 0; i < 6; i++) {
          const b = await page.$('#overlay.on #modal [data-act="close"], #overlay.on #modal [data-act="continue"], #overlay.on #modal .btn.main');
          if (!b) break;
          await b.click().catch(() => {}); await page.waitForTimeout(120);
        }
      };
      await cerrar();
      const tag = fecha.slice(5).replace('-', '');
      ok(await require('./hub_ayuda').verEnInicio(page, '.temp-card[data-temporada]', 4000) && await page.$('#tab-inicio .temp-card[data-temporada]'), `${fecha}: tarjeta de temporada en Inicio (pizarra de Misiones)`);
      // (en la partida nueva manda el primer evento; después, el evento especial va antes que los premios)
      ok(/especial|primer evento/i.test(await page.textContent('#tab-inicio .hub-ahora').catch(() => '')), `${fecha}: "qué hacer ahora" avisa del evento especial (o del primer evento)`);
      ok((await page.evaluate(() => window.__game.state.temporada.fecha)) === fecha, `${fecha}: la fecha quedó guardada en la partida`);
      // Para llegar al premio en la prueba: dinero de sobra y el progreso a uno de la meta
      const key = await page.evaluate(() => { const s = window.__game.state; const c = s.contracts.find((x) => x.temporada); s.money = 60000;
        const def = window.Temporadas.porKey(c.temporada); s.temporada.prog[c.temporadaId].n = def.meta.n - 1;
        localStorage.setItem('envivo_tycoon_save_v1', window.Game.serialize(s)); return c.temporada; });
      await page.reload();
      await page.waitForFunction(() => window.__game && window.__game.state && document.querySelector('#tab-inicio .card'));
      await cerrar();
      await require('./hub_ayuda').verEnInicio(page, `.temp-card[data-temporada="${key}"] [data-acc="oferta"]`, 4000);
      await page.screenshot({ path: cap(tag + '_inicio') });
      const tarjeta = await page.$(`#tab-inicio .temp-card[data-temporada="${key}"] [data-acc="oferta"]`);
      ok(tarjeta, `${fecha}: botón "Ver la oferta especial"`);
      ok(!(await page.evaluate(() => !!document.querySelector('.hq .hq-cosm'))), `${fecha}: sin adorno antes del premio`);
      await tarjeta.click();
      await page.waitForSelector('#tab-clientes .temp-card [data-act="prep"]');
      await page.screenshot({ path: cap(tag + '_oferta') });
      await page.click('#tab-clientes .temp-card [data-act="prep"]');
      await page.waitForSelector('#overlay.on #modal');
      await page.waitForTimeout(150);
      await page.screenshot({ path: cap(tag + '_preparar') });
      // Empezar el evento: equipo sugerido y "Al aire"
      const auto = await page.$('#overlay.on [data-act="auto"]');
      if (auto) { await auto.click(); await page.waitForTimeout(150); }
      await page.screenshot({ path: cap(tag + '_preparar') });
      const empezar = await page.$('#overlay.on [data-act="go-live"]:not([disabled])');
      ok(empezar, `${fecha}: botón para empezar el evento`);
      if (empezar) await empezar.click();
      let foto = false;
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(150);
        const st = await page.evaluate(() => ({ ev: !!window.__game.state.currentEvent, res: !!document.querySelector('#overlay.on .result-head') }));
        if (st.res) break;
        if (st.ev) {
          if (!foto) { await page.screenshot({ path: cap(tag + '_vivo') }); foto = true; }
        }
        const b = await page.$('#overlay.on [data-act="choose"]:not([disabled])') || await page.$('#overlay.on [data-act="next-inc"]') || await page.$('#overlay.on [data-act="finish"]');
        if (b) await b.click().catch(() => {});
      }
      ok(await page.$('#overlay.on .result-head'), `${fecha}: el evento especial se jugó hasta el resultado`);
      ok(await page.$('#overlay.on .paylater.ext'), `${fecha}: el resultado muestra el progreso/premio de la temporada`);
      await page.screenshot({ path: cap(tag + '_resultado') });
      const T = await page.evaluate(() => window.__game.state.temporada);
      ok(T.trofeos.length === 1 && T.cosmeticos.length === 1, `${fecha}: premio entregado (${JSON.stringify(T.cosmeticos)})`);
      const seguir = await page.$('#overlay.on [data-act="after-result"]');
      if (seguir) await seguir.click();
      await page.waitForTimeout(200);
      await cerrar();
      await page.evaluate(() => { const b = document.querySelector('nav button[data-tab="inicio"]'); if (b) b.click(); });
      await page.waitForTimeout(200);
      await cerrar();
      ok(await page.$('.hq .hq-cosm'), `${fecha}: el adorno de temporada aparece en la sede`);
      await page.screenshot({ path: cap(tag + '_sede') });
      ok(errores.length === 0, `${fecha}: sin errores de JS (${errores.slice(0, 3).join(' | ')})`);
      await ctx.close();
    }
    // Teaser fuera de temporada (23 oct: Halloween mañana)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/index.html?fecha=2026-10-23`);
    await page.waitForFunction(() => window.__game && window.__game.state && document.querySelector('#tab-inicio .card'));
    ok(await require('./hub_ayuda').verEnInicio(page, '.temp-prox', 4000), '23 oct: aviso "Próximo evento especial"');
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
}

(async () => {
  if (!process.env.SIN_NAVEGADOR) await navegador();
  console.log(fallas ? `❌ ${fallas} fallas (${bien} bien)` : `✅ Temporadas OK (${bien} comprobaciones)`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
