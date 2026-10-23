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
    if (sync.length > 14) { console.error(`❌ index.html carga ${sync.length} scripts síncronos (máximo 14):\n` + sync.join('\n')); process.exit(1); }
    console.log(`Scripts síncronos en index.html: ${sync.length} (máximo 14: decoracion.js es una extensión de la lógica y tiene que cargar antes que la partida)`);
  }
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  // El juego se sirve desde un sitio http de mentira (como tests/test_tienda_v2.js) y no desde file://:
  // Chromium a veces pierde el localStorage de file:// al recargar (la página nueva lo ve vacío, ~1 de cada 15 recargas,
  // también con una página mínima), y eso hacía fallar al azar las pruebas de guardado. Con un origen http normal no pasa.
  const RAIZ = path.resolve(__dirname, '..');
  const BASE = 'http://envivo-prueba.test';
  const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };
  async function servir(c) {
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await c.route(BASE + '/**', (route) => {
      const u = new URL(route.request().url());
      // Página vacía del mismo origen: para sembrar y leer el guardado sin que el juego esté abierto
      if (u.pathname === '/vacia.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>vacía</title>' });
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const f = path.join(RAIZ, rel);
      // Sin servidor (/api/...) o archivo que no existe: falla igual que en file:// (net::ERR_FAILED)
      if (rel.startsWith('api/') || !f.startsWith(RAIZ + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.abort('failed');
      return route.fulfill({ status: 200, contentType: TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
  }
  const opcCtx = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' };
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opcCtx);
  await servir(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push('console: ' + m.text()); });

  // ?fecha= fija un día sin temporada (js/temporadas.js): así la prueba no cambia según la fecha del equipo
  const url = BASE + '/' + (process.env.GAME_FILE || 'index.html').replace(/\\/g, '/').replace(/^\/+/, '') + '?fecha=2026-11-10';
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
    // En un navegador aparte: dos pestañas del juego comparten el guardado y la otra podía guardar encima (falla al azar)
    const ctx2 = await browser.newContext(opcCtx);
    await servir(ctx2);
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => errors.push('pageerror (capítulo): ' + e.message));
    const SAVE = 'envivo_tycoon_save_v1';
    // Lee el guardado desde una pestaña vacía del mismo origen: confirma que quedó en el almacenamiento del navegador
    // (no solo en la memoria de la página) antes de recargar.
    const guardadoFuera = async (cond, ms) => {
      const pv = await ctx2.newPage();
      try {
        await pv.goto(BASE + '/vacia.html');
        return await pv.waitForFunction(([k, c]) => { try { const o = JSON.parse(localStorage.getItem(k)); return new Function('o', 'return ' + c)(o) ? { ch: o.chapter, staff: o.staff.length, cola: (o.capCompletados || []).length } : null; } catch (e) { return null; } }, [SAVE, cond], { timeout: ms || 5000 }).then((h) => h.jsonValue()).catch(() => null);
      } finally { await pv.close(); }
    };
    // 1) Armar la partida con la lógica del juego
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
    // 2) Sembrarla una sola vez, con el juego cerrado (en la página vacía), para que nada la pise ni se vuelva a sembrar al recargar
    await p2.goto(BASE + '/vacia.html');
    await p2.evaluate(([k, x]) => localStorage.setItem(k, x), [SAVE, st]);
    if (!(await guardadoFuera('o.chapter === 1 && o.staff.length === 3'))) fail('no se pudo sembrar la partida del capítulo 1');
    // 3) Abrir el juego con esa partida
    await p2.goto(url, { waitUntil: 'load' });
    await p2.waitForFunction(() => window.__game && window.__game.state && window.__game.state.chapter === 1 && window.__game.state.staff.length === 3, null, { timeout: 15000 });
    await p2.waitForTimeout(500);
    for (let k = 0; k < 3; k++) { const b = p2.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"]'); if (await b.count()) await b.first().click(); else break; }
    await p2.click('nav button[data-tab="personal"]');
    await p2.locator('[data-act="hire"]:not([disabled])').first().click();
    const cap = p2.locator('#overlay.on [data-act="close-story"]');
    await cap.first().waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await cap.count())) { console.log('DIAG1', JSON.stringify(await p2.evaluate(() => ({ ov: (document.querySelector('#overlay.on') || {}).innerText || '(sin ventana)', staff: window.__game.state.staff.length, ch: window.__game.state.chapter, pend: window.__game.state.capCompletados, msg: (document.querySelector('.toast') || {}).innerText }))).slice(0, 900)); fail('al contratar se completó el capítulo pero no apareció "Capítulo completado"'); }
    await p2.screenshot({ path: path.join(outDir, '13_capitulo.png') });
    // 4) Recargar sin cerrar la ventana: antes, confirmar que el guardado con el capítulo pendiente ya está en el navegador
    const guardado = await guardadoFuera('o.staff.length === 4 && Array.isArray(o.capCompletados) && o.capCompletados.length > 0');
    if (!guardado) fail('después de contratar, el guardado no tiene el capítulo pendiente (S.capCompletados)');
    await p2.reload({ waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('#overlay.on [data-act="close-story"]', { timeout: 10000 }).catch(() => {});
    if (!(await p2.locator('#overlay.on [data-act="close-story"]').count())) {
      const diag = await p2.evaluate(() => ({ ov: (document.querySelector('#overlay.on') || {}).innerText || '(sin ventana)', staff: window.__game && window.__game.state && window.__game.state.staff.length, pend: (window.__game && window.__game.state && window.__game.state.capCompletados) || null, ls: Object.keys(localStorage) }));
      fail('"Capítulo completado" no volvió a aparecer al recargar: ' + JSON.stringify({ antes: guardado, despues: diag }).slice(0, 700));
    } else {
      await p2.locator('#overlay.on [data-act="close-story"]').click();
      const quedan = await p2.evaluate(() => (window.__game.state.capCompletados || []).length);
      if (quedan) fail('el capítulo visto sigue pendiente');
    }
    await p2.close(); await ctx2.close();
  }

  console.log(`Eventos jugados en el celular simulado: ${played}`);
  console.log('Estado final:', await page.evaluate(() => { const s = window.__game.state; return `día ${s.day}, dinero ${s.money}, fama ${s.rep}, capítulo ${s.chapter + 1}`; }));
  await browser.close();
  if (errors.length) { console.error('❌ Errores:\n' + errors.join('\n')); process.exit(1); }
  console.log('✅ Prueba en celular simulado OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
