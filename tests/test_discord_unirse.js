/* Prueba del botón "Únete a nuestro Discord" (docs/DISCORD_CREAR_SERVIDOR.md) en el juego real, celular 390x844.
   El servidor se imita (/api/estado con o sin discord_invitacion, con o sin sesión). Casos:
     1. Con invitación, sin cuenta: el botón sale en Inicio (junto a Ayuda y soporte) y abre la invitación en otra pestaña.
     2. Con invitación y con cuenta: también sale en Tienda → Tu cuenta, junto a "Vincular Discord".
     3. Sin invitación (o con una que no es de Discord): no sale en ninguna parte.
     4. Inglés: "Join our Discord".
   En todos: sin errores de JS y sin desborde horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_discord_unirse.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://envivo.test';
const INV = 'https://discord.gg/EnVivoTycoon';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

async function partida(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.setContent('<html></html>');
  await p.addScriptTag({ path: path.join(RAIZ, 'js/datos.js') });
  await p.addScriptTag({ path: path.join(RAIZ, 'js/logic.js') });
  const s = await p.evaluate(() => { const s = window.Game.newGame(7); Object.assign(s, { chapter: 1, day: 4 }); Object.assign(s.stats, { events: 3 }); return window.Game.serialize(s); });
  await ctx.close();
  return s;
}

async function abrir(browser, caso, guardada) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
  const estado = () => {
    const e = { ok: true, tienda: { productos: [], premium: [] }, logueado: !!caso.logueado, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' },
      discord_vinculado: false, discord_invitacion: caso.invitacion === undefined ? INV : caso.invitacion };
    if (e.logueado) Object.assign(e, { jugador: { id: 7, nombre: 'QF', email: 'qf@envivo.test' }, creditos: 5000, vip_activo: false, servidor: { id: 1, nombre: 'Servidor 1 · Quito' } });
    return e;
  };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(RAIZ, 'index.html')) });
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
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
  await page.addInitScript((c) => {
    window.__abiertos = [];
    window.open = (u, t, f) => { window.__abiertos.push([String(u), String(t), String(f || '')]); return null; };
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', c.idioma);
      localStorage.setItem('envivo_tycoon_save_v1', c.partida);
    } catch (e) { /* nada */ }
  }, { idioma: caso.idioma || 'es', partida: guardada });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null && window.Api.estado, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  for (let i = 0; i < 4; i++) {   // cerrar ventanas que tapan (capítulo, bienvenida)
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
    if (!b) break; await b.click(); await page.waitForTimeout(200);
  }
  return { ctx, page, errores };
}
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const botonEn = (page, tab) => page.$(`#tab-${tab} [data-act="discord-unirse"]`);
async function irTienda(page) {
  await page.click('nav button[data-tab="tienda"]');
  await page.waitForSelector('#tab-tienda .tv-trust', { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const guardada = await partida(browser);
  try {
    /* ---------- 1. Con invitación, sin cuenta ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, {}, guardada);
      const b = await botonEn(page, 'inicio');
      bien(!!b, '1: Inicio tiene "Únete a nuestro Discord"');
      bien(b && /Únete a nuestro Discord/.test(await b.innerText()), '1: el botón dice "Únete a nuestro Discord"');
      const junto = await page.evaluate(() => { const b = document.querySelector('#tab-inicio [data-act="discord-unirse"]'); const s = document.querySelector('#tab-inicio [data-act="soporte"]'); return !s || s.nextElementSibling === b; });
      bien(junto, '1: está justo debajo de "Ayuda y soporte"');
      if (b) { await b.click(); await page.waitForTimeout(150); }
      const ab = await page.evaluate(() => window.__abiertos);
      bien(ab.length === 1 && ab[0][0] === INV && ab[0][1] === '_blank' && /noopener/.test(ab[0][2]), '1: abre la invitación en otra pestaña (noopener)');
      await irTienda(page);
      bien(!(await botonEn(page, 'tienda')), '1: sin cuenta, la Tienda no lo repite (no hay "Tu cuenta" con Vincular)');
      bien(!(await desborde(page)), '1: sin desborde horizontal');
      bien(errores.length === 0, '1: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
    /* ---------- 2. Con invitación y con cuenta ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, { logueado: true }, guardada);
      bien(!!(await botonEn(page, 'inicio')), '2: con cuenta también sale en Inicio');
      await irTienda(page);
      const b = await botonEn(page, 'tienda');
      bien(!!b, '2: Tienda → Tu cuenta tiene "Únete a nuestro Discord"');
      const junto = await page.evaluate(() => { const b = document.querySelector('#tab-tienda [data-act="discord-unirse"]'); return !!b && !!b.previousElementSibling && b.previousElementSibling.getAttribute('data-act') === 'discord'; });
      bien(junto, '2: está junto a "Vincular Discord"');
      if (b) { await b.click(); await page.waitForTimeout(150); }
      bien((await page.evaluate(() => window.__abiertos.map((x) => x[0]))).join() === INV, '2: abre la invitación');
      bien(!(await desborde(page)), '2: sin desborde horizontal');
      bien(errores.length === 0, '2: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
    /* ---------- 3. Sin invitación o con una que no es de Discord ---------- */
    for (const inv of [null, 'javascript:alert(1)', 'https://estafa.example/discord.gg/x']) {
      const { ctx, page, errores } = await abrir(browser, { logueado: true, invitacion: inv }, guardada);
      bien(!(await botonEn(page, 'inicio')), `3 (${inv}): Inicio sin botón`);
      await irTienda(page);
      bien(!(await botonEn(page, 'tienda')), `3 (${inv}): Tienda sin botón`);
      bien(!!(await page.$('#tab-tienda [data-act="discord"]')), `3 (${inv}): "Vincular Discord" sigue ahí`);
      bien(errores.length === 0, `3 (${inv}): sin errores de JS` + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
    /* ---------- 4. Inglés ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, { idioma: 'en' }, guardada);
      const b = await botonEn(page, 'inicio');
      bien(b && /Join our Discord/.test(await b.innerText()), '4: en inglés dice "Join our Discord"');
      bien(errores.length === 0, '4: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} correctas, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
