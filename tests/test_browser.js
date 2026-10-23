/* Prueba en un celular simulado (pantalla de 390x844) con Playwright.
   Juega varios eventos tocando los botones como lo haría una persona.
   Uso:  node tests/test_browser.js   (guarda capturas en tests/capturas/) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  const url = 'file://' + path.resolve(__dirname, '..', process.env.GAME_FILE || 'index.html');
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
  await click('[data-act="buy"][data-k="audio_basic"]');
  await shot('03_bodega'); await noHScroll('bodega');

  let played = 0;
  for (let round = 0; round < 8; round++) {
    await click('nav button[data-tab="clientes"]');
    const n = await page.locator('[data-act="prep"]').count();
    if (!n) { await click('[data-act="mkt"][data-k="visitar"]'); continue; }
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
      const st = page.locator('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
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
  // Cerrar intro de capítulo si apareció
  const intro = page.locator('#overlay.on [data-act="close"]');
  if (await intro.count()) await intro.first().click();
  await shot('10_personal'); await noHScroll('personal');

  // Guardado: recargar y comparar
  const st1 = await page.evaluate(() => ({ d: window.__game.state.day, m: window.__game.state.money }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const st2 = await page.evaluate(() => ({ d: window.__game.state.day, m: window.__game.state.money }));
  if (st1.d !== st2.d || st1.m !== st2.m) fail(`el guardado no funcionó ${JSON.stringify(st1)} vs ${JSON.stringify(st2)}`);
  const ov = page.locator('#overlay.on [data-act="close"]');
  if (await ov.count()) await ov.first().click();

  await click('nav button[data-tab="registro"]');
  await shot('11_registro');
  await click('nav button[data-tab="inicio"]');
  await shot('12_inicio_final');

  console.log(`Eventos jugados en el celular simulado: ${played}`);
  console.log('Estado final:', await page.evaluate(() => { const s = window.__game.state; return `día ${s.day}, dinero ${s.money}, fama ${s.rep}, capítulo ${s.chapter + 1}`; }));
  await browser.close();
  if (errors.length) { console.error('❌ Errores:\n' + errors.join('\n')); process.exit(1); }
  console.log('✅ Prueba en celular simulado OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
