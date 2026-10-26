/* Varios eventos por día (pedido de Dimitry: "todavía incomoda eso", un evento ya no es un día entero).
   En el juego real (index.html, 390x844, fecha fija para que no salgan temporadas):
     1. Partida con 3 ofertas chicas. 1er evento por la pantalla: el día NO avanza, los gastos fijos no se cobran todavía;
        el resultado muestra la ganancia del evento (pago - sueldos - transporte) como número grande y aparte
        "Gastos fijos del día $X: se cobran al cerrar el día" con la parte de este evento (todo, es el único) y cuánto
        bajaría con otro evento.
     2. Inicio dice "1 de 3 eventos hoy" y el botón es "Cerrar el día".
     3. 2º evento el mismo día: sigue el mismo día, la parte baja a la mitad (gastos / 2) y el aviso de "con otro evento".
        Captura: tests/capturas/varios_resultado.png
     4. "Cerrar el día": se cobra UNA vez (exactamente los gastos del día), pasa al día siguiente y sale UNA ventana
        "Resumen del día" con los 2 eventos, lo que dejaron, los gastos fijos y el resultado del día.
        Captura: tests/capturas/varios_resumen.png. Al cerrarla, el día nuevo empieza con 0 eventos.
     5. Cerrar el día sin eventos: también cobra los gastos (aviso corto, sin ventana que cerrar).
     6. Una partida guardada antes (v3, sin turnos) carga bien y arranca el día con 0 eventos.
     Sin errores de la página y sin desplazamiento horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_varios_eventos.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

globalThis.window = globalThis;
require(path.join(RAIZ, 'js/datos.js'));
const G = require(path.join(RAIZ, 'js/logic.js'));

function partida(v3) {
  const s = G.newGame(31);
  s.stats.events = 6; s.chapter = 1; s.chapterSeen = 1; s.day = 9; s.lastWorkDay = 9;
  s.money = 4000; s.rep = 8;
  s.contracts = [];
  for (let i = 0; i < 3; i++) {
    const c = G.addContract(s, 'misa');
    Object.assign(c, { outdoor: false, cams: 1, audio: false, stream: false, rival: false, diff: 1, daysLeft: 4, pay: 260 + 20 * i });
  }
  s.avisos = []; s.capCompletados = []; s.pending = [];
  if (v3) { s.v = 3; delete s.hoy; delete s.resumenDia; } else G.deserialize(G.serialize(s));
  return JSON.stringify(s);
}

async function abrir(browser, save) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-EC' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|Failed to fetch|ERR_/.test(m.text())) errores.push(m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript((c) => {
    window.__ENVIVO_FECHA = '2026-06-10';   // sin temporadas (Halloween, Navidad...)
    try {
      if (sessionStorage.getItem('__prueba_init')) return;
      sessionStorage.setItem('__prueba_init', '1');
      localStorage.clear();
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', 'es');
      localStorage.setItem('envivo_tycoon_save_v1', c);
    } catch (e) { /* nada */ }
  }, save);
  await page.goto('file://' + path.join(RAIZ, 'index.html') + '?fecha=2026-06-10', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Game);
  await page.waitForTimeout(400);
  await cerrarVentanas(page);
  return { ctx, page, errores };
}
const overlayOn = (page) => page.evaluate(() => document.getElementById('overlay').classList.contains('on'));
async function cerrarVentanas(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await overlayOn(page))) return;
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="after-result"], #overlay.on [data-act="close"], #overlay.on [data-act="demo-no"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const est = (page) => page.evaluate(() => { const s = window.__game.state; return { dia: s.day, dinero: s.money, eventos: s.stats.events, hoy: s.hoy, gastos: window.Game.dailyCost(s), contratos: s.contracts.map((c) => c.id), pend: (s.pending || []).length }; });
const ocultarToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });

async function jugar(page, cid) {
  await cerrarVentanas(page);
  await page.click('nav button[data-tab="clientes"]');
  await page.click(`[data-act="prep"][data-id="${cid}"]`);
  await page.waitForSelector('#modal #prepPie');
  const auto = await page.$('#modal [data-act="auto"]');
  if (auto) { await auto.click(); await page.waitForTimeout(150); }
  await page.click('#modal [data-act="go-live"]');
  for (let i = 0; i < 25; i++) {
    await page.waitForSelector('#modal [data-act="choose"]:not([disabled]), #modal [data-act="finish"], #modal [data-act="next-inc"]', { timeout: 15000 });
    if (await page.$('#modal [data-act="finish"]')) break;
    const nx = await page.$('#modal [data-act="next-inc"]');
    if (nx) { await nx.click(); continue; }
    await page.click('#modal [data-act="choose"]:not([disabled])');
    await page.waitForTimeout(120);
  }
  await page.click('#modal [data-act="finish"]');
  await page.waitForSelector('#modal [data-act="after-result"]', { timeout: 8000 });
  await page.waitForTimeout(1200);   // la cifra grande cuenta hacia arriba
  return page.evaluate(() => {
    const r = window.__game.state.lastResult;
    const f = document.getElementById('resFijos');
    return { r: { net: r.net, pay: r.pay, wages: r.wages, dia: r.dia, payNow: r.payNow, premio: r.chapterDone ? r.chapterDone.reward || 0 : 0 }, fijos: f ? f.innerText.replace(/\s+/g, ' ').trim() : '',
      grande: (document.getElementById('resNet') || {}).textContent || '', otro: !!document.getElementById('resFijosOtro') };
  });
}
const num = (t) => Number(String(t).replace(/[^\d-]/g, ''));
const M = (n) => '$' + Math.round(n).toLocaleString('en-US');

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------- 1-5: dos eventos el mismo día y cerrar el día ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, partida(false));
      const e0 = await est(page);
      bien(e0.hoy && e0.hoy.n === 0 && e0.contratos.length === 3, `partida lista: día ${e0.dia}, 0 eventos hoy, 3 ofertas`);
      const gastos = e0.gastos;

      const a = await jugar(page, e0.contratos[0]);
      const e1 = await est(page);
      bien(e1.dia === e0.dia && e1.hoy.n === 1, `1er evento: sigue el día ${e0.dia} (ahora ${e1.dia}), 1 evento hoy`);
      const esperado = e0.dinero + a.r.payNow - a.r.pay + a.r.net + a.r.premio;   // pago ahora - sueldos - transporte (+ premio del capítulo)
      bien(e1.dinero === esperado, `1er evento: la caja cambia solo por el evento (sin gastos fijos todavía): ${e0.dinero} → ${e1.dinero} (esperado ${esperado})`);
      bien(num(a.grande) === Math.abs(a.r.net), `1er evento: la cifra grande es la ganancia del evento (${a.grande} = ${a.r.net})`);
      bien(a.r.dia && !a.r.dia.cerrado && a.r.dia.parte === gastos, `1er evento: le toca todo el gasto del día (${a.r.dia && a.r.dia.parte} = ${gastos})`);
      bien(a.fijos.includes('Gastos fijos del día: ' + M(gastos)) && a.fijos.includes('Se cobran al cerrar el día'), `1er evento: "Gastos fijos del día ${M(gastos)} · se cobran al cerrar el día" (${a.fijos.slice(0, 120)})`);
      bien(a.otro && a.fijos.includes('Si haces otro evento hoy, bajan a ' + M(Math.round(gastos / 2))), '1er evento: dice cuánto bajaría con otro evento');
      await page.click('#modal [data-act="after-result"]'); await page.waitForTimeout(300);
      bien(!(await overlayOn(page)), '1er evento: al cerrar el resultado no sale el resumen del día (el día sigue)');

      // Inicio: turno y botón
      await page.click('nav button[data-tab="inicio"]');
      const ini = await page.evaluate(() => ({ turno: (document.querySelector('#tab-inicio .turno-hoy') || {}).innerText || '', boton: (document.querySelector('#tab-inicio [data-act="next-day"]') || {}).innerText || '' }));
      bien(/1 de 3 eventos hoy/.test(ini.turno) && /tarde/.test(ini.turno), `Inicio: "${ini.turno.trim()}"`);
      bien(/Cerrar el día/.test(ini.boton), `Inicio: el botón dice "${ini.boton.replace(/\s+/g, ' ').trim()}"`);

      const b = await jugar(page, e0.contratos[1]);
      const e2 = await est(page);
      bien(e2.dia === e0.dia && e2.hoy.n === 2, `2º evento: sigue el mismo día (${e2.dia}), 2 eventos hoy`);
      bien(b.r.dia.parte === Math.round(gastos / 2) && b.fijos.includes('Repartidos entre los 2 eventos de hoy, a este le tocan ' + M(Math.round(gastos / 2))), `2º evento: la parte baja a la mitad (${b.fijos.slice(0, 160)})`);
      bien(b.otro && b.fijos.includes(M(Math.round(gastos / 3))), '2º evento: con un 3er evento bajaría a un tercio');
      await ocultarToast(page);
      await page.evaluate(() => { const m = document.getElementById('resFijos'); if (m) m.scrollIntoView({ block: 'center' }); });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, 'varios_resultado.png') });
      bien(!(await desborde(page)), 'resultado: sin desplazamiento horizontal');
      await page.click('#modal [data-act="after-result"]'); await page.waitForTimeout(300);
      bien(!(await overlayOn(page)), '2º evento: al cerrar el resultado no sale ventana (el día sigue)');

      // Cerrar el día: cobra una vez y una sola ventana con el resumen
      await page.click('nav button[data-tab="inicio"]');
      const antes = await est(page);
      await page.click('#tab-inicio [data-act="next-day"]');
      await page.waitForSelector('#overlay.on #resDia', { timeout: 5000 }).catch(() => {});
      const e3 = await est(page);
      bien(e3.dia === e0.dia + 1, `Cerrar el día: pasa al día ${e0.dia + 1} (${e3.dia})`);
      bien(antes.dinero - e3.dinero === antes.gastos, `Cerrar el día: se cobra una sola vez, ${M(antes.gastos)} (${antes.dinero} → ${e3.dinero})`);
      const res = await page.evaluate(() => {
        const m = document.querySelector('#overlay.on #modal');
        return { n: document.querySelectorAll('#overlay.on #resDia').length, txt: m ? m.innerText.replace(/\s+/g, ' ') : '', ventanas: document.querySelectorAll('#overlay.on [data-act="close-dia"]').length };
      });
      bien(res.n === 1 && res.ventanas === 1, 'Cerrar el día: una sola ventana "Resumen del día"');
      bien(/Resumen del día/i.test(res.txt) && /2 eventos/.test(res.txt) && res.txt.includes('-' + M(gastos)) && /Resultado del día/.test(res.txt), `resumen: 2 eventos, gastos fijos ${M(gastos)} y el resultado (${res.txt.slice(0, 200)})`);
      const resultado = a.r.net + b.r.net - gastos;
      bien(res.txt.includes((resultado >= 0 ? '+' : '-') + M(Math.abs(resultado))), `resumen: resultado del día ${resultado}`);
      await ocultarToast(page);
      await page.waitForTimeout(900);   // la ventana entra con animación
      await page.screenshot({ path: path.join(OUT, 'varios_resumen.png') });
      bien(!(await desborde(page)), 'resumen: sin desplazamiento horizontal');
      await page.click('#overlay.on [data-act="close-dia"]'); await page.waitForTimeout(300);
      bien(!(await overlayOn(page)), 'resumen: se cierra con Continuar (y no vuelve a salir)');
      const e4 = await est(page);
      bien(e4.hoy && e4.hoy.n === 0 && e4.hoy.dia === e4.dia, 'el día nuevo empieza con 0 eventos');
      const ini2 = await page.evaluate(() => (document.querySelector('#tab-inicio .turno-hoy') || {}).innerText || '');
      bien(/0 de 3 eventos hoy/.test(ini2) && /mañana/.test(ini2), `Inicio del día nuevo: "${ini2.trim()}"`);

      // Cerrar el día sin eventos: también se cobra
      const d0 = await est(page);
      await page.click('#tab-inicio [data-act="next-day"]');
      await page.waitForTimeout(400);
      const d1 = await est(page);
      const extra = d1.pend !== d0.pend ? null : 0;
      bien(d1.dia === d0.dia + 1 && (extra === null || d0.dinero - d1.dinero === d0.gastos), `día sin eventos: también cobra los gastos (${d0.dinero} → ${d1.dinero}, gastos ${d0.gastos})`);
      await cerrarVentanas(page);
      bien(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 6: partida vieja (v3) ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, partida(true));
      const s = await page.evaluate(() => { const s = window.__game.state; return { v: s.v, hoy: s.hoy, dia: s.day, turno: (document.querySelector('#tab-inicio .turno-hoy') || {}).innerText || '' }; });
      bien(s.v === G.SAVE_VERSION && s.hoy && s.hoy.n === 0 && s.hoy.dia === s.dia, `partida v3: carga como v${s.v} y arranca el día ${s.dia} con 0 eventos`);
      bien(/0 de 3 eventos hoy/.test(s.turno), 'partida v3: Inicio muestra los turnos');
      const c = await page.evaluate(() => window.__game.state.contracts[0].id);
      const r = await jugar(page, c);
      bien(r.r.dia && r.r.dia.n === 1 && !r.r.dia.cerrado, 'partida v3: se juega un evento y el día sigue');
      await page.click('#modal [data-act="after-result"]'); await page.waitForTimeout(300);
      bien(errores.length === 0, 'partida v3: sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
  } catch (e) {
    fallas++; console.error('❌ excepción:', e && e.stack || e);
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
