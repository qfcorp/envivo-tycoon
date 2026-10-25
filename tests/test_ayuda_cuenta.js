/* Prueba de los botones "?" (js/ayuda.js) y del aviso de cuenta (ui.js) en el juego real, celular 390x844.
   El servidor se imita (/api/estado sin sesión o con sesión). Casos:
     1. Partida nueva sin cuenta: no hay aviso de cuenta durante el tutorial; tocar Dinero/Fama/Día abre su explicación
        y se cierra tocando; el toque no cambia nada del juego.
     2. Partida después del tutorial sin cuenta: tarjeta en Inicio + ventana sola UNA vez (no vuelve al recargar);
        "¿Por qué crear una cuenta?" la abre a mano; "Crear mi cuenta gratis" abre el formulario de registro;
        en el día 15 vuelve a salir una vez más (nivel 2).
     3. Con sesión: ni tarjeta ni ventana.
     4. Inglés: los textos salen traducidos (sin claves sin traducir).
   En todos: sin errores de JS y sin desborde horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_ayuda_cuenta.js   (capturas en tests/capturas/ayuda_*.png) */
'use strict';
// Fecha fija fuera de las temporadas (en Halloween, Navidad… al abrir sale el resumen del día y llegan contratos especiales)
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
const SAVE = 'envivo_tycoon_save_v1';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

async function abrir(browser, caso) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
  const estado = () => {
    const e = { ok: true, tienda: { productos: [], premium: [] }, logueado: !!caso.logueado, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' } };
    if (e.logueado) Object.assign(e, { jugador: { id: 7, nombre: 'QF', email: 'qf@envivo.test' }, creditos: 5000, vip_activo: false, servidor: { id: 1, nombre: 'Servidor 1' } });
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
  // Sin la guía del primer evento (si existe) para que no tape lo que se prueba aquí
  await page.addInitScript((c) => {
    try {
      if (localStorage.getItem('__prueba_init')) return;   // solo en la primera carga: al recargar queda lo que guardó el juego
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      if (c.idioma) localStorage.setItem('envivo_lang', c.idioma);
      if (c.partida) localStorage.setItem('envivo_tycoon_save_v1', c.partida);
      if (c.aviso != null) localStorage.setItem('envivo_aviso_cuenta', String(c.aviso));
      if (c.plegado) localStorage.setItem('envivo_inicio_abiertos', '{}');
    } catch (e) { /* nada */ }
  }, { plegado: !!caso.plegado, idioma: caso.idioma || 'es', partida: caso.partida || null, aviso: caso.aviso == null ? null : caso.aviso });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null && window.Api.estado, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  return { ctx, page, errores };
}
// Cierra las ventanas del juego que no son el aviso de cuenta (capítulo nuevo, bienvenida), como lo haría el jugador
async function cerrarOtras(page) {
  for (let i = 0; i < 4; i++) {
    const t = await page.evaluate(() => (document.getElementById('overlay').classList.contains('on') ? document.getElementById('modal').innerText : ''));
    if (!t || /puedes perder|could lose/.test(t)) return;
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
const esperarAviso = (page) => page.waitForFunction(() => document.getElementById('overlay').classList.contains('on') && /puedes perder|could lose/.test(document.getElementById('modal').innerText), null, { timeout: 5000 }).catch(() => {});
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const modalTxt = (page) => page.evaluate(() => (document.getElementById('overlay').classList.contains('on') ? document.getElementById('modal').innerText : ''));

// Partida de prueba armada con la lógica real
async function partida(browser, cambios) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(FECHA_FIJA);
  const p = await ctx.newPage();
  await p.setContent('<html></html>');
  await p.addScriptTag({ path: path.join(RAIZ, 'js/datos.js') });
  await p.addScriptTag({ path: path.join(RAIZ, 'js/logic.js') });
  const s = await p.evaluate((c) => { const s = window.Game.newGame(7); Object.assign(s, c.top); Object.assign(s.stats, c.stats || {}); return window.Game.serialize(s); }, cambios);
  await ctx.close();
  return s;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    /* ---------- 1. Partida nueva sin cuenta ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, {});
      // Cerrar la bienvenida/intro si aparece
      for (let i = 0; i < 3; i++) {
        const b = await page.$('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"]');
        if (!b) break; await b.click(); await page.waitForTimeout(200);
      }
      await page.waitForTimeout(1500);
      bien(!(await page.$('.aviso-cuenta')), '1: durante el tutorial no hay tarjeta de cuenta');
      bien(!/(Esto es lo que puedes perder)/.test(await modalTxt(page)), '1: durante el tutorial no sale la ventana de cuenta');
      const dinero0 = await page.textContent('#hMoney');
      for (const [id, titulo] of [['#cMoney', 'Dinero'], ['#cRep', 'Fama'], ['#cDay', 'Día']]) {
        await page.click(id);
        await page.waitForSelector('.ay-velo', { timeout: 2000 });
        const t = await page.textContent('.ay-hoja h3');
        bien(t === titulo, `1: tocar ${id} explica "${titulo}"`);
        if (id === '#cMoney') await page.waitForTimeout(500), await page.screenshot({ path: path.join(OUT, 'ayuda_dinero.png') });
        await page.click('.ay-hoja button');
        bien(!(await page.$('.ay-velo')), `1: "Entendido" cierra la explicación de ${titulo}`);
      }
      bien((await page.textContent('#hMoney')) === dinero0, '1: tocar la ayuda no cambia el dinero');
      // El "?" de los gastos de hoy en Inicio
      const q = await page.$('.costbox .ay-q');
      bien(!!q, '1: Inicio tiene "?" en los gastos de hoy');
      if (q) { await q.click(); await page.waitForSelector('.ay-velo'); bien(/Gastos del día/.test(await page.textContent('.ay-hoja h3')), '1: el "?" de gastos explica los gastos del día'); await page.click('.ay-velo'); }
      bien(!(await page.$('.ay-velo')), '1: tocar fuera cierra la explicación');
      bien(!(await desborde(page)), '1: sin desborde horizontal');
      bien(errores.length === 0, '1: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 2. Después del tutorial, sin cuenta ---------- */
    const p2 = await partida(browser, { top: { chapter: 1, day: 4 }, stats: { events: 3 } });
    {
      const { ctx, page, errores } = await abrir(browser, { partida: p2 });
      bien(!!(await page.$('.aviso-cuenta')), '2: tarjeta "Tu productora está solo en este celular" en Inicio');
      const tarjeta = await page.textContent('.aviso-cuenta');
      bien(/Día 4/.test(tarjeta) && /3 eventos/.test(tarjeta), '2: la tarjeta dice el día y los eventos de la partida');
      await cerrarOtras(page); await esperarAviso(page);
      const m = await modalTxt(page);
      if (process.env.DBG) console.log('MODAL:', m.slice(0, 300), '| aviso:', await page.evaluate(() => localStorage.getItem('envivo_aviso_cuenta')));
      bien(/Esto es lo que puedes perder/.test(m) && /Si juegas solo en este celular/.test(m) && /Con tu cuenta gratis/.test(m), '2: la ventana sale sola con las dos listas');
      await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, 'ayuda_cuenta_ventana.png'), fullPage: false });
      bien((await page.evaluate(() => localStorage.getItem('envivo_aviso_cuenta'))) === '1', '2: queda anotado que ya salió (nivel 1)');
      await page.click('#overlay.on .btn.sm[data-act="close"]:not([aria-label])');
      bien(!(await modalTxt(page)), '2: "Ahora no" la cierra');
      await page.screenshot({ path: path.join(OUT, 'ayuda_cuenta_tarjeta.png') });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.Api && window.Api.estado, null, { timeout: 8000 });
      await cerrarOtras(page); await page.waitForTimeout(2000);
      bien(!/Esto es lo que puedes perder/.test(await modalTxt(page)), '2: al recargar ya no sale sola');
      await page.click('.aviso-cuenta [data-act="cuenta-info"]');
      bien(/Esto es lo que puedes perder/.test(await modalTxt(page)), '2: "¿Por qué crear una cuenta?" la abre');
      await page.click('#overlay.on [data-act="cuenta"][data-modo="registro"]');
      await page.waitForSelector('#formCuenta[data-modo="registro"]', { timeout: 2000 });
      bien(!!(await page.$('#cu-email')), '2: "Crear mi cuenta gratis" abre el formulario de registro');
      bien(!(await desborde(page)), '2: sin desborde horizontal');
      bien(errores.length === 0, '2: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
    {
      const p15 = await partida(browser, { top: { chapter: 2, day: 15 }, stats: { events: 20 } });
      const { ctx, page } = await abrir(browser, { partida: p15, aviso: 1 });
      await cerrarOtras(page); await esperarAviso(page);
      bien(/Esto es lo que puedes perder/.test(await modalTxt(page)), '2: en el día 15 vuelve a salir una vez (nivel 2)');
      bien((await page.evaluate(() => localStorage.getItem('envivo_aviso_cuenta'))) === '2', '2: queda anotado el nivel 2');
      await ctx.close();
    }

    /* ---------- 3. Con sesión ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, { partida: p2, logueado: true });
      await cerrarOtras(page); await page.waitForTimeout(2000);
      bien(!(await page.$('.aviso-cuenta')), '3: con cuenta no hay tarjeta');
      bien(!/Esto es lo que puedes perder/.test(await modalTxt(page)), '3: con cuenta no sale la ventana');
      bien(errores.length === 0, '3: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 4. Inglés ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, { partida: p2, idioma: 'en' });
      await cerrarOtras(page); await esperarAviso(page);
      const m = await modalTxt(page);
      bien(/This is what you could lose/.test(m), '4: la ventana sale en inglés');
      bien(!/avisoc\.|pe\.col|pe\.ley/.test(m + (await page.textContent('body'))), '4: sin claves sin traducir');
      await page.click('#overlay.on .btn.sm[data-act="close"]:not([aria-label])');
      await page.click('#cRep');
      bien((await page.textContent('.ay-hoja h3')) === 'Fame', '4: la ayuda de Fama sale en inglés');
      bien(errores.length === 0, '4: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 6. Flechas en la fila de categorías de la tienda de equipos (computadora y celular) ---------- */
    for (const vp of [{ width: 850, height: 900, n: 'pc' }, { width: 390, height: 844, n: 'cel' }]) {
      const { ctx, page, errores } = await abrir(browser, { partida: p2, aviso: 3 });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await cerrarOtras(page);
      await page.click('nav button[data-tab="bodega"]');
      await page.waitForSelector('.catwrap .catrow', { timeout: 3000 });
      await page.evaluate(() => { const r = document.querySelector('.catwrap .catrow'); r.scrollLeft = 0; r.dispatchEvent(new Event('scroll')); document.getElementById('tiendaEq').scrollIntoView(); });
      await page.waitForTimeout(200);
      const st = () => page.evaluate(() => { const w = document.querySelector('.catwrap'); const r = w.querySelector('.catrow'); return { sl: Math.round(r.scrollLeft), izq: !w.querySelector('.catflecha.izq').hidden, der: !w.querySelector('.catflecha.der').hidden }; });
      let e0 = await st();
      bien(!e0.izq && e0.der, `6 (${vp.n}): al inicio solo se ve la flecha derecha`);
      await page.click('.catflecha.der'); await page.waitForTimeout(700);
      const e1 = await st();
      bien(e1.sl > e0.sl && e1.izq, `6 (${vp.n}): la flecha derecha mueve la fila y aparece la izquierda`);
      await page.screenshot({ path: path.join(OUT, `ayuda_flechas_${vp.n}.png`) });
      for (let i = 0; i < 15 && (await st()).der; i++) { await page.click('.catflecha.der'); await page.waitForTimeout(450); }
      bien(!(await st()).der, `6 (${vp.n}): al final se esconde la flecha derecha`);
      // Elegir una categoría del final: la fila no vuelve al inicio
      const chips = await page.$$('.catrow .catchip');
      await chips[chips.length - 1].click(); await page.waitForTimeout(400);
      const e2 = await st();
      bien(e2.sl > 0 && (await page.$eval('.catrow .catchip:last-child', (b) => b.classList.contains('on'))), `6 (${vp.n}): elegir la última categoría funciona y la fila se queda ahí`);
      await page.click('.catflecha.izq'); await page.waitForTimeout(700);
      bien((await st()).sl < e2.sl, `6 (${vp.n}): la flecha izquierda regresa`);
      bien(!(await desborde(page)), `6 (${vp.n}): sin desborde horizontal`);
      bien(errores.length === 0, `6 (${vp.n}): sin errores de JS` + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 7. Inicio plegado: filas con resumen, "Nuevo", abrir/cerrar y se recuerda ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, { partida: p2, aviso: 3, plegado: true });
      await cerrarOtras(page);
      const filas = await page.$$eval('.pls .pl', (xs) => xs.map((x) => ({ id: x.dataset.pl, abierta: x.classList.contains('abierta'), nuevo: !!x.querySelector('.pl-nuevo'), res: (x.querySelector('.pl-tx small') || {}).textContent || '' })));
      bien(filas.length >= 4 && filas.every((f) => !f.abierta), '7: Inicio en filas, todas cerradas (' + filas.map((f) => f.id).join(', ') + ')');
      const h = filas.find((f) => f.id === 'historia');
      bien(h && /Capítulo 2/.test(h.res), '7: la fila de Historia resume el capítulo: ' + (h && h.res));
      bien(!!(await page.$('.pl[data-pl="cuenta"] .pl-nuevo')), '7: la fila de la cuenta dice "Nuevo"');
      bien(!(await page.isVisible('.aviso-cuenta')), '7: el contenido cerrado no se ve');
      await page.click('.pl[data-pl="cuenta"] .pl-cab');
      bien(await page.isVisible('.aviso-cuenta'), '7: al tocar la fila se abre');
      bien(!(await page.$('.pl[data-pl="cuenta"] .pl-nuevo')), '7: abierta ya no dice "Nuevo"');
      await page.screenshot({ path: path.join(OUT, 'ayuda_inicio_plegado.png'), fullPage: true });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.Api && window.Api.estado, null, { timeout: 8000 });
      await cerrarOtras(page); await page.waitForTimeout(300);
      bien(await page.isVisible('.aviso-cuenta'), '7: al recargar sigue abierta');
      await page.click('.pl[data-pl="cuenta"] .pl-cab');
      bien(!(await page.isVisible('.aviso-cuenta')), '7: al tocar otra vez se cierra');
      bien(!(await page.$('.pl[data-pl="cuenta"] .pl-nuevo')), '7: cerrada sin cambios no vuelve a decir "Nuevo"');
      bien(!(await desborde(page)), '7: sin desborde horizontal');
      bien(errores.length === 0, '7: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 8. Nombre de la productora y créditos arriba ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, { partida: p2, aviso: 3 });
      await cerrarOtras(page);
      bien(await page.isHidden('#cGem'), '8: sin cuenta no salen los créditos arriba');
      await page.click('.prod-nom-btn');
      await page.fill('#prod-nombre', 'Producciones Pichincha');
      await page.click('#formNombre button[type="submit"]');
      await page.waitForTimeout(300);
      bien((await page.textContent('.prod-nom')) === 'Producciones Pichincha', '8: el nombre sale en Inicio');
      bien(await page.evaluate(() => /PRODUCCIONES PICHINCHA/.test(document.querySelector('.hqcard').innerHTML)), '8: el nombre sale en el letrero del local');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.Api && window.Api.estado, null, { timeout: 8000 }); await cerrarOtras(page);
      bien((await page.textContent('.prod-nom')) === 'Producciones Pichincha', '8: el nombre se guarda');
      await page.screenshot({ path: path.join(OUT, 'ayuda_nombre.png') });
      bien(errores.length === 0, '8: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
    {
      const { ctx, page, errores } = await abrir(browser, { partida: p2, logueado: true });
      await cerrarOtras(page);
      bien(await page.isVisible('#cGem'), '8: con cuenta salen los créditos arriba');
      bien((await page.textContent('#hGem')).replace(/\D/g, '') === '5000', '8: muestra 5.000 créditos');
      await page.screenshot({ path: path.join(OUT, 'ayuda_creditos_arriba.png') });
      await page.click('#cGem');
      bien(await page.isVisible('#tab-tienda'), '8: tocar los créditos abre la Tienda');
      bien(!(await desborde(page)), '8: sin desborde horizontal con 4 recuadros arriba');
      bien(errores.length === 0, '8: sin errores de JS (con cuenta)' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 5. Todas las claves de ayuda en los 10 idiomas ---------- */
    {
      const ctx = await browser.newContext();
      await ctx.addInitScript(FECHA_FIJA); const p = await ctx.newPage();
      await p.setContent('<html><head></head><body></body></html>');
      await p.addScriptTag({ path: path.join(RAIZ, 'js/ayuda.js') });
      const faltan = await p.evaluate(() => { const D = window.Ayuda._D; const o = []; for (const l of Object.keys(D)) for (const k of Object.keys(D.es)) if (!D[l][k]) o.push(l + ':' + k); return o; });
      bien(faltan.length === 0, '5: ayuda completa en ' + 10 + ' idiomas' + (faltan.length ? ' (faltan ' + faltan.join(', ') + ')' : ''));
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(`\nAyuda y aviso de cuenta: ${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
