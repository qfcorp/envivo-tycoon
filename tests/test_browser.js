/* Prueba en un celular simulado (pantalla de 390x844) con Playwright.
   Juega varios eventos tocando los botones como lo haría una persona.
   Uso:  node tests/test_browser.js   (guarda capturas en tests/capturas/) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  // Rendimiento: index.html no debe cargar más de 13 scripts que bloquean la primera pantalla (los demás con defer).
  // 13 = los 11 de siempre + las extensiones js/temporadas.js y js/sede.js, que tienen que registrarse antes de js/ui.js.
  {
    const idx = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const sync = (idx.match(/<script\b[^>]*\bsrc=[^>]*>/g) || []).filter((t) => !/\b(defer|async)\b/.test(t));
    if (sync.length > 13) { console.error(`❌ index.html carga ${sync.length} scripts síncronos (máximo 13):\n` + sync.join('\n')); process.exit(1); }
    console.log(`Scripts síncronos en index.html: ${sync.length} (máximo 13)`);
  }
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  // ?fecha= fija un día sin temporada (js/temporadas.js): así la prueba no cambia según la fecha del equipo
  const url = 'file://' + path.resolve(__dirname, '..', process.env.GAME_FILE || 'index.html') + '?fecha=2026-11-10';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const shot = (n) => page.screenshot({ path: path.join(outDir, n + '.png') });
  const click = (sel) => page.locator(sel).first().click();
  const fail = (m) => { errors.push(m); };

  // Intro del capítulo 1
  await page.waitForSelector('#overlay.on');
  await shot('01_intro');
  await click('[data-act="close"]');

  const noHScroll = async (tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 1) fail(`${tag}: hay desplazamiento horizontal (${ov}px)`);
  };
  await shot('02_inicio'); await noHScroll('inicio');

  // Comprar consola de audio para mejorar
  await click('nav button[data-tab="bodega"]');
  // La tienda de equipos va por categorías: primero la de consolas de audio
  await click('[data-act="cat"][data-k="audio"]');
  await click('[data-act="buy"][data-k="audio_basic"]');
  await shot('03_bodega'); await noHScroll('bodega');

  let played = 0;
  for (let round = 0; round < 8; round++) {
    await click('nav button[data-tab="clientes"]');
    const n = await page.locator('[data-act="prep"]').count();
    if (!n) {
      await click('[data-act="mkt"][data-k="visitar"]');
      // Resumen del día (avisos) y capítulos: se cierran como lo haría una persona
      for (let k = 0; k < 4; k++) {
        const v = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
        if (await v.count()) await v.first().click(); else break;
      }
      continue;
    }
    if (round === 0) { await shot('04_clientes'); await noHScroll('clientes'); }
    await click('[data-act="prep"]');
    await page.waitForSelector('[data-act="go-live"]');
    if (round === 0) await shot('05_preparar');
    await click('[data-act="go-live"]');
    // Imprevistos
    for (let k = 0; k < 6; k++) {
      const choice = page.locator('[data-act="choose"]:not([disabled])');
      if (!(await choice.count())) break;
      if (round === 0 && k === 0) await shot('06_en_vivo');
      await choice.first().click();
      const next = page.locator('[data-act="next-inc"], [data-act="finish"]');
      if (round === 0 && k === 0) await shot('07_resultado_imprevisto');
      await next.first().click();
    }
    await page.waitForSelector('[data-act="after-result"]');
    if (round === 0) await shot('08_resultado_evento');
    await click('[data-act="after-result"]');
    // Posibles ventanas de historia
    for (let k = 0; k < 3; k++) {
      const st = page.locator('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close"]');
      if (await st.count()) { await shot(`09_historia_${played}_${k}`); await st.first().click(); }
    }
    played++;
  }
  if (played < 3) fail(`solo se jugaron ${played} eventos`);

  // Contratar a alguien
  await click('nav button[data-tab="personal"]');
  const before = await page.evaluate(() => window.__game.state.staff.length);
  const hireBtn = page.locator('[data-act="hire"]');
  if (await hireBtn.count()) {
    const money = await page.evaluate(() => window.__game.state.money);
    await hireBtn.first().click();
    const after = await page.evaluate(() => window.__game.state.staff.length);
    if (money > 200 && after !== before + 1) fail('contratar no funcionó');
  }
  // "Capítulo completado" (si contratar completó el capítulo) y la intro del siguiente
  for (let k = 0; k < 3; k++) {
    const intro = page.locator('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
    if (await intro.count()) await intro.first().click(); else break;
  }
  await shot('10_personal'); await noHScroll('personal');

  // Guardado: recargar y comparar
  const st1 = await page.evaluate(() => ({ d: window.__game.state.day, m: window.__game.state.money }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  const st2 = await page.evaluate(() => ({ d: window.__game.state.day, m: window.__game.state.money }));
  if (st1.d !== st2.d || st1.m !== st2.m) fail(`el guardado no funcionó ${JSON.stringify(st1)} vs ${JSON.stringify(st2)}`);
  for (let k = 0; k < 3; k++) {
    const ov = page.locator('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close"]');
    if (await ov.count()) await ov.first().click(); else break;
  }

  // El registro completo se abre desde Inicio
  await click('nav button[data-tab="inicio"]');
  await click('[data-act="tab"][data-tab="registro"]');
  await shot('11_registro');
  await click('nav button[data-tab="inicio"]');
  await shot('12_inicio_final');

  // QA: la ventana "Capítulo completado" siempre aparece, también al contratar (y sigue ahí si se recarga)
  {
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => errors.push('pageerror (capítulo): ' + e.message));
    await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await p2.goto(url, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => window.__game && window.__game.state);
    const st = await p2.evaluate(() => {
      const G = window.Game, s = G.newGame(7);
      s.chapter = 1; s.chapterSeen = 1; s.rep = 20; s.money = 5000; s.stats.events = 4;
      ['cam_pro', 'cam_cine'].forEach((t) => s.equip.push({ id: ++s.idc, type: t, condition: 90 }));
      while (s.staff.length < 3) s.staff.push(Object.assign({}, s.candidates[0], { id: ++s.idc }));
      G.refreshCandidates(s);
      return G.serialize(s);
    });
    await p2.addInitScript((x) => { if (!sessionStorage.getItem('cap')) { localStorage.setItem('envivo_tycoon_save_v1', x); sessionStorage.setItem('cap', '1'); } }, st);
    await p2.reload({ waitUntil: 'load' });
    await p2.waitForFunction(() => window.__game && window.__game.state && window.__game.state.chapter === 1);
    await p2.waitForTimeout(500);
    for (let k = 0; k < 3; k++) { const b = p2.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"]'); if (await b.count()) await b.first().click(); else break; }
    await p2.click('nav button[data-tab="personal"]');
    await p2.locator('[data-act="hire"]:not([disabled])').first().click();
    const cap = p2.locator('#overlay.on [data-act="close-story"]');
    await cap.first().waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await cap.count())) { console.log('DIAG1', JSON.stringify(await p2.evaluate(() => ({ ov: (document.querySelector('#overlay.on') || {}).innerText || '(sin ventana)', staff: window.__game.state.staff.length, ch: window.__game.state.chapter, pend: window.__game.state.capCompletados, msg: (document.querySelector('.toast') || {}).innerText }))).slice(0, 900)); fail('al contratar se completó el capítulo pero no apareció "Capítulo completado"'); }
    await p2.reload({ waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('#overlay.on [data-act="close-story"]', { timeout: 10000 }).catch(() => {});
    if (!(await p2.locator('#overlay.on [data-act="close-story"]').count())) {
      const diag = await p2.evaluate(() => ({ ov: (document.querySelector('#overlay.on') || {}).innerText || '(sin ventana)', pend: (window.__game && window.__game.state && window.__game.state.capCompletados) || null, ls: Object.keys(localStorage) }));
      console.log('DIAG', JSON.stringify(diag).slice(0, 900)); fail('"Capítulo completado" no volvió a aparecer al recargar: ' + JSON.stringify(diag).slice(0, 600));
    }
    await p2.locator('#overlay.on [data-act="close-story"]').click();
    const quedan = await p2.evaluate(() => (window.__game.state.capCompletados || []).length);
    if (quedan) fail('el capítulo visto sigue pendiente');
    await shot('13_capitulo');
    await p2.close();
  }

  console.log(`Eventos jugados en el celular simulado: ${played}`);
  console.log('Estado final:', await page.evaluate(() => { const s = window.__game.state; return `día ${s.day}, dinero ${s.money}, fama ${s.rep}, capítulo ${s.chapter + 1}`; }));
  await browser.close();
  if (errors.length) { console.error('❌ Errores:\n' + errors.join('\n')); process.exit(1); }
  console.log('✅ Prueba en celular simulado OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
