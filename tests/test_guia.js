/* Prueba de la guía del primer evento (js/guia.js) dentro del juego real, en un celular simulado (390x844) con Playwright.
   No toca los archivos compartidos: sirve index.html y js/ui.js CON las líneas de server/INTEGRAR_GUIA.md aplicadas en memoria
   (si una línea ya no calza con el archivo, la prueba falla y lo dice).
   Casos: seguir la guía tocando justo donde apunta la mano hasta el resultado del primer evento (revisa que cada paso
   señale el botón correcto), tocar fuera no hace nada, irse a otra pestaña → vuelve a señalar Clientes, recargar en pleno
   evento, no vuelve a salir al terminar, "Saltar guía" (y queda guardado), partida vieja, demo, sin forzar en pruebas
   automáticas, inglés, movimiento reducido, textos de los 10 idiomas cortos.
   Uso:  node tests/test_guia.js   (capturas en tests/capturas/guia_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
const URL0 = BASE + '/index.html?fecha=2026-11-10';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Integración (las mismas líneas que server/INTEGRAR_GUIA.md) ---------- */
function reemplazar(txt, ancla, nuevo, que) {
  if (txt.includes(nuevo)) return txt;   // ya integrada en el archivo real: se prueba tal cual
  if (!txt.includes(ancla)) throw new Error('No se encontró la línea de integración en ' + que + ': ' + ancla.slice(0, 80));
  return txt.replace(ancla, () => nuevo);
}
const ANCLA_HTML = '<script defer src="js/vip.js"></script>';
const LINEA_HTML = '<script defer src="js/guia.js"></script>';
const ANCLA_UI = '    else continuar();\n    // La red (tienda, cuenta, chat, Google Play)';
const LINEAS_UI = `    else continuar();
    // Guía del primer evento (js/guia.js, con defer): solo en una partida nueva; si aún no cargó, la toma al cargar
    const guiaCtx = { estado: () => S, A, tab: () => tab, idioma: () => (I18 ? I18.idioma : 'es') };
    if (window.Guia) window.Guia.iniciar(guiaCtx); else window.__guiaCtx = guiaCtx;
    // La red (tienda, cuenta, chat, Google Play)`;
const pagina = reemplazar(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), ANCLA_HTML, ANCLA_HTML + '\n' + LINEA_HTML, 'index.html');
const uiJs = reemplazar(fs.readFileSync(path.join(RAIZ, 'js/ui.js'), 'utf8'), ANCLA_UI, LINEAS_UI, 'js/ui.js');

/* ---------- Textos ---------- */
(function () {
  const g = {};
  new Function('window', 'globalThis', fs.readFileSync(path.join(RAIZ, 'js/guia.js'), 'utf8'))(g, g);   // eslint-disable-line no-new-func
  const TX = g.Guia.TEXTOS;
  const claves = Object.keys(TX.es);
  const codigos = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
  codigos.forEach((c) => {
    const d = TX[c] || {};
    const faltan = claves.filter((k) => !d[k]);
    const sobran = Object.keys(d).filter((k) => !TX.es[k]);
    const largos = claves.filter((k) => d[k] && (c === 'zh-CN' ? d[k].length > 16 : d[k].split(/\s+/).length > 8));
    bien(!faltan.length && !sobran.length && !largos.length, `Textos ${c}: completos y cortos (máx. 8 palabras)` + (faltan.length ? ' faltan ' + faltan : '') + (sobran.length ? ' sobran ' + sobran : '') + (largos.length ? ' largos ' + largos : ''));
  });
  bien(!/MegaVisi|Netflix|YouTube|Twitch|Sony|Canon/i.test(JSON.stringify(TX)), 'Sin marcas reales en los textos');
})();

/* ---------- Navegador ---------- */
const errores = [];
async function abrir(browser, op) {
  op = op || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'es-EC', reducedMotion: op.reduce ? 'reduce' : 'no-preference' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname === '/js/ui.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: uiJs });
    if (u.pathname.startsWith('/api')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const f = path.join(RAIZ, decodeURIComponent(u.pathname));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f);
      const tipo = { '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  // Las pruebas automáticas no ven la guía salvo que se fuerce (como hacen las otras pruebas del juego, que no la esperan)
  await ctx.addInitScript((o) => {
    if (o.forzar) window.__ENVIVO_GUIA = true;
    if (o.demo) window.__ENVIVO_DEMO = o.demo;
    if (!sessionStorage.getItem('pre')) {
      sessionStorage.setItem('pre', '1');
      Object.keys(o.ls || {}).forEach((k) => localStorage.setItem(k, o.ls[k]));
    }
  }, { forzar: op.forzar !== false, demo: op.demo || null, ls: op.ls || {} });
  const page = await ctx.newPage();
  const tag = op.tag || 'guia';
  page.on('pageerror', (e) => errores.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  await page.waitForLoadState('load');
  return { ctx, page };
}
const est = (page) => page.evaluate(() => (window.Guia ? window.Guia.estado() : { activa: false }));
async function esperarVisible(page, ms) {
  await page.waitForFunction(() => { const g = window.Guia && window.Guia.estado(); return g && (!g.activa || g.paso === 'fin' || g.visible); }, null, { timeout: ms || 6000 }).catch(() => {});
  await page.waitForTimeout(450);   // que termine el desplazamiento suave
  return est(page);
}
const SEL = {
  intro: '#overlay.on .btn.main[data-act="close"]',
  clientes: 'nav button[data-tab="clientes"]',
  evento: '#tab-clientes [data-act="prep"]',
  auto: '#overlay.on [data-act="auto"]',
  aire: '#overlay.on [data-act="go-live"]',
  elegir: '#overlay.on [data-act="choose"]',
  seguir: '#overlay.on [data-act="next-inc"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"]',
  terminar: '#overlay.on [data-act="finish"]',
  resultado: '#overlay.on [data-act="after-result"]',
};
// Revisa el paso: la punta del dedo cae sobre el botón esperado, el anillo lo rodea y la burbuja se ve entera
async function revisarPaso(page, st) {
  return page.evaluate(({ st, sel }) => {
    const r = { ok: true, por: [] };
    const no = (m) => { r.ok = false; r.por.push(m); };
    const enPunta = document.elementFromPoint(st.x, st.y);
    const t = enPunta && enPunta.closest(sel);
    if (!t) no('en la punta del dedo no está ' + sel + ' sino ' + (enPunta ? enPunta.outerHTML.slice(0, 120) : 'nada'));
    const g = document.getElementById('guia');
    const ring = g.querySelector('.g-ring').getBoundingClientRect();
    if (t) { const b = t.getBoundingClientRect(); if (!(ring.left <= b.left + 1 && ring.top <= b.top + 1 && ring.right >= b.right - 1 && ring.bottom >= b.bottom - 1)) no('el anillo no rodea el botón'); }
    const bub = g.querySelector('.g-bub');
    const bb = bub.getBoundingClientRect();
    if (bub.hidden || !bub.textContent.trim()) no('sin burbuja');
    if (bb.left < 0 || bb.right > innerWidth || bb.top < 0 || bb.bottom > innerHeight) no('la burbuja se sale de la pantalla');
    if (t) { const b = t.getBoundingClientRect(); if (bb.left < b.right && bb.right > b.left && bb.top < b.bottom && bb.bottom > b.top) no('la burbuja tapa el botón'); }
    const sk = g.querySelector('.g-skip'); const sb = sk.getBoundingClientRect();
    if (sk.hidden || sb.width < 40 || sb.top < 0) no('"Saltar guía" no se ve');
    const hand = g.querySelector('.g-hand').getBoundingClientRect();
    if (hand.width < 50) no('la mano es muy chica');
    if (document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) no('desplazamiento horizontal');
    r.texto = bub.textContent.trim();
    return r;
  }, { st, sel: SEL[st.paso] || '#nada' });
}

(async () => {
  const browser = await chromium.launch();

  /* ===== 1. Partida nueva: seguir la mano hasta el resultado ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'flujo' });
    const t0 = Date.now();
    const vistos = [];
    let n = 0, recargado = false, fuera = false, paseo = false;
    for (let i = 0; i < 25; i++) {
      const st = await esperarVisible(page);
      if (!st.activa) break;
      if (st.paso === 'fin') {
        vistos.push('fin');
        await page.screenshot({ path: path.join(OUT, `guia_${String(++n).padStart(2, '0')}_fin.png`) });
        break;
      }
      if (!st.visible) { bien(false, `paso "${st.paso}" sin mano visible`); break; }
      const rv = await revisarPaso(page, st);
      bien(rv.ok, `Paso "${st.paso}": la mano señala el botón correcto ("${rv.texto}")` + (rv.ok ? '' : ' — ' + rv.por.join('; ')));
      vistos.push(st.paso);
      await page.screenshot({ path: path.join(OUT, `guia_${String(++n).padStart(2, '0')}_${st.paso}.png`) });

      // Tocar fuera del botón no hace nada (en Inicio: "Descansar" queda tapado)
      if (st.paso === 'clientes' && !fuera) {
        fuera = true;
        const b = await page.locator('#tab-inicio [data-act="next-day"]').boundingBox();
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await page.waitForTimeout(300);
        const s = await page.evaluate(() => ({ d: window.__game.state.day, ov: !!document.querySelector('#overlay.on') }));
        bien(s.d === 1 && !s.ov, 'Tocar fuera del botón señalado no hace nada (no se pasó el día)');
      }
      // Irse a otra pestaña: la guía vuelve a señalar Clientes
      if (st.paso === 'evento' && !paseo) {
        paseo = true;
        await page.evaluate(() => document.querySelector('nav button[data-tab="personal"]').click());
        const s2 = await esperarVisible(page);
        bien(s2.paso === 'clientes', 'Si se va a otra pestaña, vuelve a señalar Clientes (paso: ' + s2.paso + ')');
        await page.screenshot({ path: path.join(OUT, `guia_${String(++n).padStart(2, '0')}_volver.png`) });
        await page.touchscreen.tap(s2.x, s2.y);
        continue;
      }
      // Recargar en pleno evento: la guía sigue donde quedó
      if (st.paso === 'elegir' && !recargado) {
        recargado = true;
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
        const s3 = await esperarVisible(page);
        bien(s3.paso === 'elegir', 'Al recargar en pleno evento, la guía sigue en el imprevisto (paso: ' + s3.paso + ')');
        continue;
      }
      const antes = await page.evaluate(() => ({ paso: window.Guia.estado().paso, html: (document.getElementById('modal') || {}).innerHTML || '', tab: (document.querySelector('main section.on') || {}).id }));
      await page.touchscreen.tap(st.x, st.y);
      await page.waitForFunction((a) => {
        const g = window.Guia.estado();
        return !g.activa || g.paso !== a.paso || ((document.getElementById('modal') || {}).innerHTML || '') !== a.html;
      }, antes, { timeout: 6000 }).catch(() => bien(false, `tocar donde apunta la mano en "${st.paso}" no avanzó`));
    }
    const dur = (Date.now() - t0) / 1000;
    console.log('   Pasos:', vistos.join(' → '), `(${dur.toFixed(1)} s con las esperas de la prueba)`);
    const orden = ['intro', 'clientes', 'evento', 'aire', 'elegir', 'resultado', 'fin'];
    bien(orden.every((p) => vistos.includes(p)), 'Pasó por intro → clientes → evento → al aire → imprevisto → resultado → fin');
    bien(vistos.length <= 12, `Guía corta: ${vistos.length} pasos`);
    const s = await page.evaluate(() => ({ ev: window.__game.state.stats.events, k: localStorage.getItem('envivo_guia_v1') }));
    bien(s.ev === 1 && s.k === '1', 'Se jugó el primer evento y quedó guardado que la guía se vio');
    await page.waitForFunction(() => !document.getElementById('guia'), null, { timeout: 5000 }).catch(() => {});
    bien(!(await page.$('#guia')), 'El mensaje final se va solo');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state);
    await page.waitForTimeout(800);
    bien(!(await page.$('#guia')) && !(await est(page)).activa, 'Al recargar después de terminar, la guía no vuelve a salir');
    await ctx.close();
  }

  /* ===== 2. Saltar guía ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'saltar' });
    const st = await esperarVisible(page);
    bien(st.activa && st.paso === 'intro', 'Partida nueva: la guía arranca en la intro del capítulo');
    await page.locator('#guia .g-skip').tap();
    await page.waitForTimeout(200);
    bien(!(await page.$('#guia')), '"Saltar guía" la cierra');
    bien((await page.evaluate(() => localStorage.getItem('envivo_guia_v1'))) === '1', '"Saltar guía" queda guardado');
    await page.locator('#overlay.on [data-act="close"]').click({ timeout: 3000 });
    await page.click('nav button[data-tab="clientes"]', { timeout: 3000 });
    bien(await page.locator('#tab-clientes [data-act="prep"]').count() > 0, 'Después de saltarla se juega normal');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    bien(!(await page.$('#guia')), 'Saltada: no vuelve a salir al recargar');
    await ctx.close();
  }

  /* ===== 3. Partida vieja, demo y pruebas automáticas sin forzar ===== */
  {
    const vieja = await (async () => {
      const { ctx, page } = await abrir(browser, { tag: 'prep-vieja', forzar: false });
      const x = await page.evaluate(() => { const G = window.Game, s = G.newGame(5); s.day = 6; s.stats.events = 4; s.chapterSeen = 0; return G.serialize(s); });
      await ctx.close();
      return x;
    })();
    {
      const { ctx, page } = await abrir(browser, { tag: 'vieja', ls: { envivo_tycoon_save_v1: vieja } });
      await page.waitForTimeout(900);
      const s = await page.evaluate(() => ({ ev: window.__game.state.stats.events, k: localStorage.getItem('envivo_guia_v1') }));
      bien(s.ev === 4 && !(await page.$('#guia')), 'Partida vieja: no sale la guía');
      bien(s.k === '1', 'Partida vieja: queda marcada (tampoco sale en una partida nueva después)');
      await ctx.close();
    }
    {
      const { ctx, page } = await abrir(browser, { tag: 'demo', demo: 'cap4' });
      await page.waitForTimeout(900);
      bien(!(await page.$('#guia')), 'Copia demo (window.__ENVIVO_DEMO): no sale la guía');
      await ctx.close();
    }
    {
      const { ctx, page } = await abrir(browser, { tag: 'sinforzar', forzar: false });
      await page.waitForTimeout(900);
      bien(!(await page.$('#guia')) && !(await page.evaluate(() => localStorage.getItem('envivo_guia_v1'))), 'Pruebas automáticas (navigator.webdriver) sin forzar: no sale ni se marca (las otras pruebas siguen igual)');
      await ctx.close();
    }
  }

  /* ===== 4. Inglés y movimiento reducido ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'en', ls: { envivo_lang: 'en' } });
    await page.waitForFunction(() => window.I18N && window.I18N.idioma === 'en', null, { timeout: 8000 }).catch(() => {});
    const st = await esperarVisible(page);
    const t = await page.evaluate(() => (document.querySelector('#guia .g-tx') || {}).textContent);
    bien(st.paso === 'intro' && t === 'Tap here to start', 'Inglés: "' + t + '"');
    await page.locator('#guia .g-skip').evaluate((b) => b.textContent).then((x) => bien(/Skip guide/.test(x), 'Inglés: botón "' + x + '"'));
    await page.touchscreen.tap(st.x, st.y);
    const s2 = await esperarVisible(page);
    await page.screenshot({ path: path.join(OUT, 'guia_en_clientes.png') });
    bien(s2.paso === 'clientes', 'Inglés: segundo paso Clientes');
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir(browser, { tag: 'reduce', reduce: true });
    await esperarVisible(page);
    const a = await page.evaluate(() => ({
      ring: getComputedStyle(document.querySelector('#guia .g-ring'), '::after').animationName,
      mano: getComputedStyle(document.querySelector('#guia .g-hand svg')).animationName,
    }));
    bien(a.ring === 'none' && a.mano === 'none', 'Movimiento reducido: sin pulso ni toque animado (' + JSON.stringify(a) + ')');
    await ctx.close();
  }

  await browser.close();
  if (errores.length) { fallas++; console.error('❌ Errores de JS:\n' + errores.join('\n')); }
  console.log(`\n${bien_} bien, ${fallas} fallas`);
  if (fallas) process.exit(1);
  console.log('✅ Guía del primer evento OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
