/* Prueba de los avisos de equipos dañados (ui.js, solo pantalla) en el juego real, celular 390x844.
   Partida armada con la lógica real: una cámara al 25% y otra al 90%, un contrato al aire libre con lluvia.
     1. Inicio: franja "1 equipo necesita reparación" y número en el botón Bodega.
     2. Preparación: la cámara al 25% marcada avisa "Puede fallar en vivo · Reparar $X".
     3. Evento con lluvia sin protector: la cámara al 90% se moja. El resultado trae "Equipos dañados" con las dos
        (antes → después, causa "Se mojó con la lluvia", costo); "Reparar" la deja como nueva al instante.
     4. Inicio → franja → Bodega: la cámara al 25% va primera, resaltada con "¡Repárame!"; al repararla se van
        la franja y el número.
     5. Resultado guardado (recarga) sin dinero, en inglés: botones desactivados con "You're $X short".
   En todos: sin errores de JS y sin desborde horizontal. Capturas: tests/capturas/danos_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_danos.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

async function abrir(browser, caso) {
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
  // Fecha fija fuera de las temporadas (en Halloween, Navidad… llegan contratos especiales y cambia el número de Clientes)
  await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
  await page.addInitScript((c) => {
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', c.idioma);
      localStorage.setItem('envivo_tycoon_save_v1', c.partida);
      if (c.pendiente) localStorage.setItem('envivo_resultado_pendiente', c.pendiente);
    } catch (e) { /* nada */ }
  }, { idioma: caso.idioma || 'es', partida: caso.partida, pendiente: caso.pendiente || null });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  return { ctx, page, errores };
}
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const overlayOn = (page) => page.evaluate(() => document.getElementById('overlay').classList.contains('on'));
async function cerrarVentanas(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await overlayOn(page))) return;
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="after-result"], #overlay.on [data-act="close"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(300);
  }
}

// Partida armada con la lógica real (Node)
function armarPartida(cambios) {
  globalThis.window = globalThis;
  require(path.join(RAIZ, 'js/datos.js'));
  const G = require(path.join(RAIZ, 'js/logic.js')) || globalThis.Game;
  const s = G.newGame(7);
  s.stats.events = 6; s.chapter = 1; s.chapterSeen = 1; s.day = 8; s.money = cambios.money;
  s.equip[0].condition = 25;                       // cámara "de Don Ramiro" gastada
  G.buy(s, 'cam_basic');
  s.equip[1].condition = 90;                       // cámara casi nueva
  s.money = cambios.money;
  const c = s.contracts[0];
  Object.assign(c, { outdoor: true, cams: 2, audio: false, stream: false, rival: false, diff: 1, imprevistos: ['lluvia'], daysLeft: 5 });
  s.contracts = [c];
  return { G, s, cid: c.id, bajaId: s.equip[0].id, altaId: s.equip[1].id };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    const P = armarPartida({ money: 2000 });
    const costoBaja = P.G.repairCost(P.s.equip[0]);
    /* ---------- 1. Inicio ---------- */
    const { ctx, page, errores } = await abrir(browser, { partida: P.G.serialize(P.s) });
    await cerrarVentanas(page);
    const strip = await page.$('.dnstrip');
    bien(!!strip, '1: Inicio tiene la franja de equipos para reparar');
    const stTxt = strip ? await strip.innerText() : '';
    bien(/1 equipo necesita reparación/.test(stTxt), `1: la franja dice "1 equipo necesita reparación" (${stTxt.replace(/\s+/g, ' ')})`);
    bien((await page.textContent('#badgeB')) === '1', '1: el botón Bodega muestra 1');
    bien((await page.textContent('#badgeC')) === '1', '1: el número de Clientes sigue igual');
    await page.screenshot({ path: path.join(OUT, 'danos_inicio.png') });

    /* ---------- 2. Preparación ---------- */
    await page.click('nav button[data-tab="clientes"]');
    await page.click(`[data-act="prep"][data-id="${P.cid}"]`);
    await page.waitForSelector('#modal #prepPie');
    await page.click('#modal .pp-k[data-k="equipos"]');   // navegación v2: los equipos van en su paso
    for (const id of [P.bajaId, P.altaId]) {
      if (!(await page.isChecked(`#eq-${id}`))) { await page.click(`label:has(#eq-${id})`); await page.waitForTimeout(150); }
    }
    const aviso = page.locator(`label:has(#eq-${P.bajaId}) .dn-prep`);
    bien(await aviso.isVisible(), '2: la cámara al 25% marcada avisa en la preparación');
    bien(/Puede fallar en vivo/.test(await aviso.innerText()) && !!(await aviso.locator('[data-act="repair-prep"]').count()), '2: el aviso dice "Puede fallar en vivo" y tiene "Reparar"');
    bien(!(await page.locator(`label:has(#eq-${P.altaId}) .dn-prep`).count()), '2: la cámara al 90% no tiene aviso');
    await page.locator(`label:has(#eq-${P.bajaId})`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, 'danos_prep.png') });
    // Desmarcada, el aviso se esconde
    await page.click(`label:has(#eq-${P.bajaId}) .grow b`); await page.waitForTimeout(150);
    bien(!(await aviso.isVisible()), '2: desmarcada, el aviso no se ve');
    await page.click(`label:has(#eq-${P.bajaId}) .grow b`); await page.waitForTimeout(150);
    bien(await page.isChecked(`#eq-${P.bajaId}`), '2: se vuelve a marcar');

    /* ---------- 3. Evento con lluvia ---------- */
    // Semilla con la que la lluvia moja la cámara al 90% (la lógica es determinista: se busca antes de salir al aire)
    const busc = await page.evaluate(({ cid, altaId }) => {
      const S = window.__game.state, G = window.Game;
      const ids = (a) => [...document.querySelectorAll(`#modal input[data-act="${a}"]:checked`)].map((x) => Number(x.dataset.id));
      for (let seed = 1; seed < 4000; seed++) {
        const c = G.deserialize(G.serialize(S)); c.seed = seed;
        const r = G.startEvent(c, cid, ids('tog-staff'), ids('tog-equip'));
        if (!r.ok) return { err: r.msg };
        const inc = c.currentEvent.incidents;
        if (inc.length !== 1 || inc[0].key !== 'lluvia') return { err: 'imprevistos: ' + inc.map((i) => i.key).join(',') };
        if (!G.resolveIncident(c, 1).ok) return { err: 'no se pudo elegir' };
        if (c.equip.find((e) => e.id === altaId).condition <= 60) { S.seed = seed; return { seed }; }
      }
      return { err: 'sin semilla' };
    }, { cid: P.cid, altaId: P.altaId });
    bien(!!busc.seed, '3: hay una semilla con la cámara mojada' + (busc.err ? ': ' + busc.err : ''));
    await page.click('#modal [data-act="go-live"]');
    await page.waitForSelector('#modal [data-act="choose"][data-i="1"]:not([disabled])', { timeout: 15000 });
    await page.click('#modal [data-act="choose"][data-i="1"]');
    await page.waitForSelector('#modal [data-act="finish"]', { timeout: 5000 });
    const dinero0 = await page.evaluate(() => window.__game.state.money);
    await page.click('#modal [data-act="finish"]');
    await page.waitForSelector('#resDanos', { timeout: 5000 });
    const filas = await page.$$eval('#resDanos .dn-it', (xs) => xs.map((x) => x.innerText.replace(/\s+/g, ' ')));
    bien(filas.length === 2, `3: "Equipos dañados" trae las 2 cámaras (${filas.length})`);
    bien(/Equipos dañados/.test(await page.textContent('#resDanos .dn-hd')), '3: título "Equipos dañados"');
    const mojada = filas.find((t) => /Se mojó con la lluvia/.test(t)) || '';
    bien(/90% → \d+%/.test(mojada), `3: la cámara mojada muestra antes → después (${mojada})`);
    bien(/Reparar \$/.test(mojada), '3: con su botón "Reparar $X"');
    const gastada = filas.find((t) => /25% →/.test(t)) || '';
    bien(/Puede fallar en vivo/.test(gastada) && /Desgaste del evento/.test(gastada), `3: la cámara gastada dice "Puede fallar en vivo" (${gastada})`);
    bien(!!(await page.$('#resDanos [data-act="repair-all-res"]:not([disabled])')), '3: hay "Reparar todo" (alcanza el dinero)');
    bien(await page.evaluate(() => !!document.querySelector('#resDanos .dn-bar s')), '3: la barra muestra el estado de antes');
    await page.locator('#resDanos').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, 'danos_resultado.png') });
    // Reparar la mojada en un toque
    const st = await page.evaluate((id) => { const e = window.__game.state.equip.find((x) => x.id === id); return { c: e.condition, rc: window.Game.repairCost(e), m: window.__game.state.money }; }, P.altaId);
    await page.click(`#resDanos [data-act="repair-res"][data-id="${P.altaId}"]`);
    await page.waitForTimeout(200);
    const st2 = await page.evaluate((id) => ({ c: window.__game.state.equip.find((x) => x.id === id).condition, m: window.__game.state.money }), P.altaId);
    bien(st2.c === 100 && st2.m === st.m - st.rc, `3: "Reparar" la deja al 100% y cobra ${st.rc} (${st.c}% → ${st2.c}%)`);
    bien(await overlayOn(page) && !!(await page.$('#resDanos')), '3: el resultado sigue abierto');
    bien(/Reparado/.test(await page.innerText('#resDanos')), '3: la fila dice "Reparado"');
    const filaRep = await page.evaluate(() => { const f = document.querySelector('#resDanos .dn-it.ok'); const i = f && f.querySelector('.dn-bar i'); return f ? { txt: f.querySelector('.dn-cond').innerText, w: i ? i.style.width : '' } : null; });
    bien(filaRep && filaRep.w === '100%' && /100%/.test(filaRep.txt), `3: la barra y el número muestran 100% después de reparar (${JSON.stringify(filaRep)})`);
    bien(!(await page.$('#resDanos [data-act="repair-all-res"]')), '3: "Reparar todo" se va (queda solo una)');
    bien((await page.textContent('#hMoney')).replace(/\D/g, '') === String(st2.m).replace(/\D/g, ''), '3: el dinero de arriba se actualiza');
    await page.locator('#resDanos').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, 'danos_reparado.png') });
    bien(dinero0 > 0, '3: había dinero');
    bien(!(await desborde(page)), '3: sin desborde horizontal');

    /* ---------- 4. Inicio → Bodega ---------- */
    await cerrarVentanas(page);
    if ((await page.evaluate(() => document.querySelector('nav button.on').dataset.tab)) !== 'inicio') await page.click('nav button[data-tab="inicio"]');
    bien(/1 equipo necesita reparación/.test(await page.innerText('.dnstrip')), '4: la franja sigue con la cámara gastada');
    await page.click('.dnstrip');
    await page.waitForTimeout(300);
    bien(await page.evaluate(() => document.getElementById('tab-bodega').classList.contains('on')), '4: la franja lleva a la Bodega');
    const top = await page.evaluate(() => { const t = document.getElementById('tusEquipos'); return t ? t.getBoundingClientRect().top : -1; });
    bien(top >= 0 && top < 220, `4: la Bodega queda en "Tus equipos" (y=${Math.round(top)})`);
    const primera = await page.evaluate(() => { const g = document.querySelector('#tab-bodega .ggrid .gear'); return g ? { worn: g.classList.contains('worn'), chip: g.querySelector('.dn-chip') ? g.querySelector('.dn-chip').textContent : '', rep: g.querySelector('[data-act="repair"]').dataset.id } : null; });
    bien(primera && primera.worn && /Repárame/.test(primera.chip) && Number(primera.rep) === P.bajaId, '4: la cámara gastada va primera, resaltada con "¡Repárame!"');
    bien((await page.$$('#tab-bodega .gear.worn')).length === 1, '4: solo una resaltada');
    bien((await page.textContent('#badgeB')) === '1', '4: Bodega sigue con 1');
    await page.screenshot({ path: path.join(OUT, 'danos_bodega.png') });
    await page.click(`#tab-bodega [data-act="repair"][data-id="${P.bajaId}"]`);
    await page.waitForTimeout(200);
    bien((await page.textContent('#badgeB')) === '', '4: reparada, el número de Bodega se va');
    bien(!(await page.$('#tab-bodega .gear.worn')), '4: ya no hay equipos resaltados');
    await page.click('nav button[data-tab="inicio"]');
    bien(!(await page.$('.dnstrip')), '4: la franja de Inicio se va');
    bien(!(await desborde(page)), '4: sin desborde horizontal');
    bien(errores.length === 0, '1-4: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
    bien(costoBaja > 0, '1-4: reparar la cámara gastada cuesta ' + costoBaja);
    await ctx.close();

    /* ---------- 5. Resultado guardado, sin dinero, en inglés ---------- */
    {
      const Q = armarPartida({ money: 2000 });
      const { G, s } = Q;
      const ok = G.startEvent(s, Q.cid, s.staff.map((p) => p.id), [Q.bajaId, Q.altaId]);
      while (G.currentIncident(s)) G.resolveIncident(s, 1);
      const f = G.finishEvent(s);
      s.money = 5;
      const danos = s.equip.filter((e) => [Q.bajaId, Q.altaId].includes(e.id)).map((e) => ({ id: e.id, type: e.type, antes: e.id === Q.bajaId ? 25 : 90, despues: e.id === Q.bajaId ? e.condition : Math.min(e.condition, 55), causas: e.id === Q.bajaId ? [] : ['lluvia'] }));
      s.equip.find((e) => e.id === Q.altaId).condition = danos[1] ? danos[1].despues : 55;
      bien(ok.ok && f.ok, '5: evento armado con la lógica real');
      const pend = JSON.stringify({ r: f.result, ev: s.stats.events, caja: null, ty: f.result.type, danos });
      const { ctx: c2, page: p2, errores: e2 } = await abrir(browser, { partida: G.serialize(s), pendiente: pend, idioma: 'en' });
      await p2.waitForSelector('#resDanos', { timeout: 6000 });
      const txt = await p2.innerText('#resDanos');
      bien(/Damaged gear/.test(txt) && /Got wet in the rain/.test(txt) && /Can fail live/.test(txt), '5: al recargar vuelve el bloque, en inglés');
      bien((await p2.$$('#resDanos [data-act="repair-res"][disabled]')).length === 2, '5: sin dinero, "Repair" desactivado');
      bien(/You're \$[\d,]+ short/.test(txt), '5: dice cuánto falta');
      bien(!!(await p2.$('#resDanos [data-act="repair-all-res"][disabled]')), '5: "Repair all" desactivado');
      bien(!/danos\./.test(await p2.textContent('body')), '5: sin claves sin traducir');
      await p2.locator('#resDanos').scrollIntoViewIfNeeded();
      await p2.screenshot({ path: path.join(OUT, 'danos_sin_dinero_en.png') });
      await cerrarVentanas(p2);
      bien(/2 items need repair|1 item needs repair/.test(await p2.innerText('.dnstrip')), '5: franja de Inicio en inglés');
      bien(!(await desborde(p2)), '5: sin desborde horizontal');
      bien(e2.length === 0, '5: sin errores de JS' + (e2.length ? ': ' + e2.join(' | ') : ''));
      await c2.close();
    }
    /* ---------- 6. Reparar desde la preparación (sin desmarcar el equipo) ---------- */
    {
      const R = armarPartida({ money: 2000 });
      const { ctx: c3, page: p3, errores: e3 } = await abrir(browser, { partida: R.G.serialize(R.s) });
      await cerrarVentanas(p3);
      await p3.click('nav button[data-tab="clientes"]');
      await p3.click(`[data-act="prep"][data-id="${R.cid}"]`);
      await p3.waitForSelector('#modal #prepPie');
      await p3.click('#modal .pp-k[data-k="equipos"]');
      if (!(await p3.isChecked(`#eq-${R.bajaId}`))) await p3.click(`label:has(#eq-${R.bajaId}) .grow b`);
      await p3.click(`label:has(#eq-${R.bajaId}) [data-act="repair-prep"]`);
      await p3.waitForTimeout(250);
      const cond = await p3.evaluate((id) => window.__game.state.equip.find((e) => e.id === id).condition, R.bajaId);
      bien(cond === 100, '6: "Reparar" en la preparación la deja al 100%');
      bien(await p3.isChecked(`#eq-${R.bajaId}`), '6: el equipo sigue marcado');
      bien(!(await p3.$(`label:has(#eq-${R.bajaId}) .dn-prep`)), '6: el aviso se va');
      bien(await overlayOn(p3) && !!(await p3.$('#modal #prepPie')), '6: la preparación sigue abierta');
      bien((await p3.textContent('#badgeB')) === '', '6: el número de Bodega se va');
      bien(e3.length === 0, '6: sin errores de JS' + (e3.length ? ': ' + e3.join(' | ') : ''));
      await c3.close();
    }
    /* ---------- 7. Bodega: "Reparar todo" con el costo total a la vista ---------- */
    {
      const R = armarPartida({ money: 5000 });
      const total = R.s.equip.filter((e) => e.condition < 100).reduce((a, e) => a + R.G.repairCost(e), 0);
      const { ctx: c4, page: p4, errores: e4 } = await abrir(browser, { partida: R.G.serialize(R.s) });
      await cerrarVentanas(p4);
      await p4.click('nav button[data-tab="bodega"]');
      await p4.waitForSelector('#repTodo');
      const txt = await p4.textContent('#repTodo');
      bien(txt.replace(/\D/g, '').includes(String(total)), `7: la Bodega muestra el total para reparar todo (${total})`);
      const m0 = await p4.evaluate(() => window.__game.state.money);
      await p4.click('#repTodo [data-act="repair-all-bodega"]');
      await p4.waitForTimeout(250);
      const st = await p4.evaluate(() => ({ m: window.__game.state.money, c: window.__game.state.equip.map((e) => e.condition) }));
      bien(st.c.every((c) => c === 100) && st.m === m0 - total, `7: "Reparar todo" deja todo al 100% y cobra el total (${m0} → ${st.m})`);
      bien(!(await p4.$('#repTodo')), '7: el botón se va cuando ya no hay nada que reparar');
      bien(e4.length === 0, '7: sin errores de JS' + (e4.length ? ': ' + e4.join(' | ') : ''));
      await c4.close();
    }
  } catch (e) {
    fallas++; console.error('❌ excepción:', e);
  } finally {
    await browser.close();
  }
  console.log(`\nEquipos dañados: ${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
