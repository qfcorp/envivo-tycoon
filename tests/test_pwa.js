/* Prueba de la PWA (app instalable + sin internet) con Playwright.
   - Levanta un servidor local (http://127.0.0.1:<puerto al azar>) con la carpeta del juego.
   - Inserta HEAD_SNIPPET.html en index.html al vuelo (como quedará integrado).
   - Verifica: service worker activo, manifest válido, íconos PNG con tamaño correcto,
     y que el juego carga SIN internet (modo avión).
   Uso:  node tests/test_pwa.js        (sale con código 1 si algo falla) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SNIPPET = fs.readFileSync(path.join(ROOT, 'HEAD_SNIPPET.html'), 'utf8');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return;
      }
      let body = fs.readFileSync(file);
      if (path.relative(ROOT, file) === 'index.html') {
        body = Buffer.from(body.toString('utf8').replace('</head>', SNIPPET + '\n</head>'));
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const failures = [];
  const ok = (cond, msg) => { if (cond) console.log('  ✔ ' + msg); else { console.log('  ✘ ' + msg); failures.push(msg); } };

  const server = await startServer();
  const base = `http://localhost:${server.address().port}/`;
  console.log('Servidor de prueba: ' + base);
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    const ignorable = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_INTERNET_DISCONNECTED|ERR_FAILED|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_PROXY|Failed to load resource/.test(t);
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push('console: ' + m.text()); });

    // 1) Carga en línea
    await page.goto(base + 'index.html', { waitUntil: 'load' });
    ok(await page.evaluate(() => !!document.querySelector('link[rel="manifest"]')), 'el snippet quedó dentro de <head>');
    ok(await page.evaluate(() => typeof window.PWA === 'object' && typeof PWA.install === 'function'), 'window.PWA existe');
    const api = await page.evaluate(async () => ({
      canInstall: PWA.canInstall(), isStandalone: PWA.isStandalone(), isIOS: PWA.isIOS(),
      install: await PWA.install(), unsub: typeof PWA.onChange(() => {}),
    }));
    ok(api.canInstall === false && api.install === 'unavailable' && api.unsub === 'function' && api.isStandalone === false,
      'API PWA responde (canInstall/install/isStandalone/onChange) ' + JSON.stringify(api));

    // 2) Service worker activo y controlando la página
    // ready se cumple ya en 'activating'; esperar a que el estado sea 'activated'.
    const swState = await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready.then((r) => {
        const sw = r.active;
        if (!sw || sw.state === 'activated') return sw && sw.state;
        return new Promise((res) => sw.addEventListener('statechange', () => { if (sw.state === 'activated' || sw.state === 'redundant') res(sw.state); }));
      }),
      new Promise((r) => setTimeout(() => r('timeout'), 15000)),
    ]));
    ok(swState === 'activated', 'service worker activado (' + swState + ')');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controla la página');
    const cached = await page.evaluate(async () => {
      const out = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
      return { names: await caches.keys(), files: out };
    });
    ok(cached.names.some((n) => n.startsWith('envivo-v')), 'caché versionada: ' + cached.names.join(', '));
    for (const f of ['/index.html', '/js/logic.js', '/js/ui.js', '/js/pwa.js', '/manifest.webmanifest', '/icons/icon-192.png']) {
      ok(cached.files.includes(f), 'en caché: ' + f);
    }

    // 3) Manifest
    const manRes = await page.request.get(base + 'manifest.webmanifest');
    ok(manRes.status() === 200, 'manifest HTTP 200');
    let man = {};
    try { man = JSON.parse(await manRes.text()); ok(true, 'manifest es JSON válido'); } catch (e) { ok(false, 'manifest es JSON válido: ' + e.message); }
    const expect = { name: 'EN VIVO Tycoon', short_name: 'EN VIVO', lang: 'es', start_url: './index.html', scope: './',
      display: 'standalone', orientation: 'portrait', background_color: '#0d0f14', theme_color: '#0d0f14' };
    for (const [k, v] of Object.entries(expect)) ok(man[k] === v, `manifest.${k} = ${JSON.stringify(man[k])}`);
    const icons = man.icons || [];
    ok(icons.some((i) => i.sizes === '192x192'), 'ícono 192 declarado');
    ok(icons.some((i) => i.sizes === '512x512' && (i.purpose || 'any').includes('any')), 'ícono 512 declarado');
    ok(icons.some((i) => i.sizes === '512x512' && (i.purpose || '').includes('maskable')), 'ícono 512 maskable declarado');

    // 4) Íconos: existen y miden lo que dicen
    const iconList = icons.map((i) => ({ src: i.src, size: +i.sizes.split('x')[0] }))
      .concat([{ src: 'icons/apple-touch-icon.png', size: 180 }, { src: 'icons/favicon-32.png', size: 32 }]);
    for (const { src, size } of iconList) {
      const r = await page.request.get(new URL(src, base + 'manifest.webmanifest').href);
      let meta = {};
      if (r.status() === 200) meta = await sharp(await r.body()).metadata();
      ok(r.status() === 200 && meta.format === 'png' && meta.width === size && meta.height === size,
        `${src}: HTTP ${r.status()}, ${meta.format} ${meta.width}x${meta.height}`);
    }
    for (const sel of ['link[rel="apple-touch-icon"]', 'meta[name="apple-mobile-web-app-capable"]', 'meta[name="theme-color"]', 'script[src="js/pwa.js"]']) {
      ok(await page.evaluate((s) => !!document.querySelector(s), sel), 'head contiene ' + sel);
    }

    // 5) Sin internet: recargar y comprobar que el juego se dibuja
    await ctx.setOffline(true);
    const offlineServerStop = new Promise((r) => server.close(r)); // también se apaga el servidor
    await page.reload({ waitUntil: 'load' });
    ok(await page.evaluate(() => !!document.querySelector('nav')), 'sin internet: aparece la barra <nav>');
    ok(await page.evaluate(() => (document.getElementById('tab-inicio') || {}).innerHTML.length > 50), 'sin internet: el juego dibujó la pestaña Inicio');
    ok(await page.evaluate(() => typeof window.__game === 'object'), 'sin internet: js/ui.js cargó');
    await page.screenshot({ path: path.join(__dirname, 'capturas', 'pwa_sin_internet.png') }).catch(() => {});
    await ctx.setOffline(false);
    void offlineServerStop;

    ok(errors.length === 0, 'sin errores en la página' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) {
    failures.push('excepción: ' + (e && e.stack || e));
    console.log(e);
  } finally {
    await browser.close();
    try { server.close(); } catch (e) { /* ya cerrado */ }
  }

  if (failures.length) {
    console.log(`\n❌ PWA: ${failures.length} falla(s)`);
    process.exit(1);
  }
  console.log('\n✅ PWA OK: instalable y funciona sin internet');
  process.exit(0);
})();
