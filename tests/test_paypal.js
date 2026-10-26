/* Prueba de PayPal en la tienda (js/ui.js, server/src/PayPal.php, docs/PAYPAL.md) dentro del juego real con Playwright, en un
   celular de 390x844. El servidor se imita aquí (/api/estado con "paypal", /api/orden). Casos:
     web_es      – web con Pago Plux y PayPal (mínimo $4,99): los productos desde $4,99 muestran «Pagar con tarjeta» y «Pagar con
                   PayPal»; los más baratos solo el botón de siempre; PayPal → POST /api/orden {producto, metodo: "paypal"};
                   tarjeta → POST /api/orden {producto} (sin metodo); un botón de otra pantalla (sin método) pregunta cómo pagar.
     web_en      – lo mismo en inglés (textos traducidos).
     minimo      – PAYPAL_MINIMO = 9.99: $4,99 sin PayPal, $9,99 con PayPal.
     sin_llaves  – paypal.disponible false: ningún botón de PayPal (la tienda de siempre).
     app         – dentro de la app de Google Play (?origen=android, Play Billing falso): nada de PayPal (ni de Plux).
     sin_servidor – como la versión de un solo archivo (dist/, sin servidor): nada de PayPal.
   En todos: sin errores de JS, sin desborde horizontal a 390px y sin claves sin traducir.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_paypal.js   (capturas en tests/capturas/paypal_*.png) */
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
const pagina = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

const prod = (id, nombre, detalle, precio, creditos, tipo, extra) => Object.assign({ id, nombre, detalle, precio, creditos, una_vez: false, tipo, precio_base: precio, creditos_base: creditos, oferta: null }, extra || {});
const PRODUCTOS = [
  prod('creditos_250', '250 créditos', 'Paquete de 250 créditos', 1.99, 250, 'creditos'),
  prod('creditos_700', '700 créditos', '700 créditos (+40 % extra)', 4.99, 700, 'creditos'),
  prod('creditos_1500', '1.500 créditos', '1.500 créditos (+50 % extra)', 9.99, 1500, 'creditos'),
  prod('creditos_3200', '3.200 créditos', '3.200 créditos (+60 % extra)', 19.99, 3200, 'creditos'),
  prod('bienvenida', 'Oferta de bienvenida', 'Una sola vez: 150 créditos, un camarógrafo senior de refuerzo por 3 eventos y 3 cables', 0.99, 150, 'bienvenida', { una_vez: true }),
  prod('inicio', 'Paquete de inicio', 'Una sola vez: cámara profesional, 5 cables, 3 baterías, técnico de streaming nivel 3 y 200 créditos', 2.99, 200, 'inicio', { una_vez: true }),
  prod('tarjeta_mensual', 'Tarjeta mensual', '30 días: reclama 20 créditos cada día (600 en total). No se renueva sola; si compras otra se suman 30 días', 4.99, 0, 'tarjeta'),
  prod('vip30', 'Pase VIP 30 días', 'No se renueva solo: bono diario de $150 + 10 créditos, reparaciones 30 % más baratas, 1 oferta extra al día, distintivo VIP', 9.99, 0, 'vip'),
];
const PLAY = { creditos_250: '2.49', creditos_700: '5.99', creditos_1500: '11.99', creditos_3200: '23.99', inicio: '3.49', bienvenida: '1.29', vip30: '11.99', tarjeta_mensual: '5.99' };

function fakePlay(precios) {
  window.__gp = { pagos: [] };
  window.getDigitalGoodsService = async () => ({
    async getDetails(ids) { return ids.filter((id) => precios[id]).map((id) => ({ itemId: id, title: id, description: '', price: { currency: 'EUR', value: precios[id] } })); },
    async listPurchases() { return []; },
    async consume() {},
  });
  window.PaymentRequest = class {
    constructor(methods) { this.methods = methods; window.__gp.pagos.push(methods[0].data.sku); }
    async show() { throw new DOMException('cerrado en la prueba', 'AbortError'); }
  };
}

async function abrir(browser, caso) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: caso.locale || 'es-EC' });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { ordenes: [] };
  const estado = () => {
    const e = { ok: true, tienda: { productos: PRODUCTOS, premium: [] }, logueado: true, entregas: [], inventario: [], inicio_comprado: false,
      plux: { disponible: true, ambiente: 'produccion' }, jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: 1340, vip_activo: false,
      servidor: { id: 1, nombre: 'Servidor 1' } };
    if (caso.paypal !== null) e.paypal = Object.assign({ disponible: true, ambiente: 'produccion', minimo: 4.99 }, caso.paypal || {});
    return e;
  };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/paypal\.com/, (r) => { errores.push('pidió algo a PayPal: ' + r.request().url()); return r.abort(); });
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      if (caso.sinServidor) return route.abort();   // como dist/ (un solo archivo, sin servidor)
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/orden') {
        let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) { b = null; }
        srv.ordenes.push(b);
        return json(200, { ok: true, url: BASE + '/pago-prueba.html' });
      }
      return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    }
    if (u.pathname === '/pago-prueba.html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>pago</p>' });
    const rel = decodeURIComponent(u.pathname).replace(/^\//, '');
    const f = path.join(RAIZ, rel);
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  if (caso.play) await page.addInitScript(fakePlay, caso.play);
  if (caso.idioma) await page.addInitScript((c) => { try { localStorage.setItem('envivo_lang', c); } catch (e) { /* nada */ } }, caso.idioma);
  await page.goto(BASE + '/' + (caso.query || ''), { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('#overlay.on [data-act="close"]', { timeout: 4000 }); await page.click('#overlay.on [data-act="close"]'); } catch (e) { /* sin bienvenida */ }
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 8000 });
  if (caso.idioma) await page.waitForFunction((c) => window.I18N && window.I18N.idioma === c, caso.idioma, { timeout: 8000 }).catch(() => null);
  return { ctx, page, errores, srv };
}

async function irTienda(page, espera) {
  await page.click('nav button[data-tab="tienda"]');
  await page.waitForSelector(espera || '#tab-tienda .tv-trust', { timeout: 8000 });
  await page.waitForTimeout(600);
}
// Botones de cada producto: {id: ['tarjeta'|'paypal'|'comprar', ...]}
const botones = (page) => page.evaluate(() => {
  const o = {};
  document.querySelectorAll('#tab-tienda [data-prod]').forEach((c) => {
    o[c.dataset.prod] = [...c.querySelectorAll('[data-act="comprar"]')].map((b) => b.dataset.metodo || 'comprar');
  });
  return o;
});
async function revisar(o, nombre) {
  const r = await o.page.evaluate(() => {
    const t = document.getElementById('tab-tienda');
    const ancho = window.innerWidth;
    const fuera = [...document.querySelectorAll('#tab-tienda *, #overlay.on *')].filter((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || el.closest('.catrow')) return false;   // la fila de atajos se desliza a propósito
      return b.right > ancho + 0.5 || b.left < -0.5;
    }).map((el) => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName);
    const txt = t.innerText + ' ' + ((document.querySelector('#overlay.on') || {}).innerText || '');
    return { scroll: document.documentElement.scrollWidth - ancho, fuera: fuera.slice(0, 6), txt, claves: (txt.match(/\b(tienda|error)\.[a-z_.]+\b/g) || []), marcas: (txt.match(/\{\w+\}/g) || []) };
  });
  bien(r.scroll <= 0 && !r.fuera.length, `${nombre}: sin desborde horizontal a 390px` + (r.scroll > 0 ? ` (scroll ${r.scroll}px)` : '') + (r.fuera.length ? ' fuera: ' + r.fuera.join(', ') : ''));
  bien(!r.claves.length && !r.marcas.length, `${nombre}: sin claves sin traducir ni {marcadores}` + (r.claves.length ? ' ' + r.claves.join(',') : '') + (r.marcas.length ? ' ' + r.marcas.join(',') : ''));
  return r;
}
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  await o.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------- 1) Web en español ---------- */
    {
      const o = await abrir(browser, { nombre: 'web_es' });
      await irTienda(o.page);
      const r = await revisar(o, 'Web (es)');
      const b = await botones(o.page);
      bien(JSON.stringify(b.creditos_700) === '["tarjeta","paypal"]', 'Web: $4,99 (700 créditos) muestra «Pagar con tarjeta» y «Pagar con PayPal» (' + JSON.stringify(b.creditos_700) + ')');
      bien(JSON.stringify(b.creditos_3200) === '["tarjeta","paypal"]' && JSON.stringify(b.tarjeta_mensual) === '["tarjeta","paypal"]', 'Web: $19,99 y la tarjeta mensual ($4,99) también');
      bien(JSON.stringify(b.creditos_250) === '["comprar"]' && JSON.stringify(b.bienvenida) === '["comprar"]' && JSON.stringify(b.inicio) === '["comprar"]',
        'Web: por debajo del mínimo ($1,99, $0,99, $2,99) solo el botón de siempre, sin PayPal');
      const t700 = await o.page.$eval('[data-prod="creditos_700"]', (el) => el.innerText).catch(() => '');
      bien(/Pagar con tarjeta/.test(t700) && /Pagar con PayPal/.test(t700) && /\$4,99/.test(t700), 'Web: textos «Pagar con tarjeta» / «Pagar con PayPal» con el precio al lado');
      bien(/PayPal/.test(r.txt) && /\$4,99/.test(r.txt.split('PayPal')[0] + r.txt) && /tarjeta \(Pago Plux\)/.test(r.txt), 'Web: la nota de precios explica tarjeta (Pago Plux) y PayPal desde $4,99');
      await o.page.evaluate(() => { const el = document.querySelector('[data-prod="creditos_700"]'); if (el) el.scrollIntoView({ block: 'center' }); });
      await o.page.screenshot({ path: path.join(OUT, 'paypal_web_es.png') });
      // Botón de otra pantalla (pase, VIP...) sin método: pregunta cómo pagar
      await o.page.evaluate(() => { const b = document.createElement('button'); b.className = 'btn'; b.id = 'prueba-sin-metodo'; b.dataset.act = 'comprar'; b.dataset.k = 'vip30'; b.textContent = 'Comprar'; document.getElementById('tab-tienda').appendChild(b); });
      await o.page.click('#prueba-sin-metodo');
      await o.page.waitForSelector('#overlay.on .tv-pagos-modal', { timeout: 4000 }).catch(() => null);
      const modal = await o.page.$eval('#overlay.on', (el) => el.innerText).catch(() => '');
      bien(/¿Cómo quieres pagar\?/.test(modal) && /Pagar con tarjeta/.test(modal) && /Pagar con PayPal/.test(modal) && /\$9,99/.test(modal), 'Web: un botón sin método pregunta «¿Cómo quieres pagar?» con las dos opciones y el precio');
      await revisar(o, 'Web (es) con la ventana de pago');
      await o.page.screenshot({ path: path.join(OUT, 'paypal_web_es_elegir.png') });
      bien(!o.srv.ordenes.length, 'Web: preguntar no crea ninguna orden');
      await o.page.click('#overlay.on [data-metodo="paypal"]');
      await o.page.waitForURL(/pago-prueba/, { timeout: 8000 }).catch(() => null);
      bien(JSON.stringify(o.srv.ordenes[0]) === JSON.stringify({ producto: 'vip30', metodo: 'paypal' }), 'Web: elegir PayPal pide POST /api/orden {producto: vip30, metodo: paypal} (sin valor: lo pone el servidor) → ' + JSON.stringify(o.srv.ordenes[0]));
      await cerrar(o, 'Web (es)');
    }
    {
      const o = await abrir(browser, { nombre: 'web_es_compra' });
      await irTienda(o.page);
      await o.page.click('[data-prod="creditos_700"] [data-metodo="paypal"]');
      await o.page.waitForURL(/pago-prueba/, { timeout: 8000 }).catch(() => null);
      bien(JSON.stringify(o.srv.ordenes[0]) === JSON.stringify({ producto: 'creditos_700', metodo: 'paypal' }), 'Web: «Pagar con PayPal» → POST /api/orden {producto: creditos_700, metodo: paypal} y abre el pago');
      await cerrar(o, 'Web (es) PayPal');
    }
    {
      const o = await abrir(browser, { nombre: 'web_es_tarjeta' });
      await irTienda(o.page);
      await o.page.click('[data-prod="creditos_700"] [data-metodo="tarjeta"]');
      await o.page.waitForURL(/pago-prueba/, { timeout: 8000 }).catch(() => null);
      bien(JSON.stringify(o.srv.ordenes[0]) === JSON.stringify({ producto: 'creditos_700' }), 'Web: «Pagar con tarjeta» → POST /api/orden {producto} como siempre (Pago Plux)');
      await cerrar(o, 'Web (es) tarjeta');
    }

    /* ---------- 2) Web en inglés ---------- */
    {
      const o = await abrir(browser, { nombre: 'web_en', idioma: 'en', locale: 'en-US' });
      await irTienda(o.page);
      const r = await revisar(o, 'Web (en)');
      const t700 = await o.page.$eval('[data-prod="creditos_700"]', (el) => el.innerText).catch(() => '');
      bien(/Pay by card/.test(t700) && /Pay with PayPal/.test(t700), 'Inglés: «Pay by card» y «Pay with PayPal»');
      bien(/with PayPal/.test(r.txt) && !/Pagar con/.test(r.txt), 'Inglés: la nota de precios en inglés, nada en español');
      await o.page.screenshot({ path: path.join(OUT, 'paypal_web_en.png') });
      await cerrar(o, 'Web (en)');
    }

    /* ---------- 3) Otro mínimo, sin llaves ---------- */
    {
      const o = await abrir(browser, { nombre: 'minimo', paypal: { minimo: 9.99 } });
      await irTienda(o.page);
      await revisar(o, 'Mínimo $9,99');
      const b = await botones(o.page);
      bien(JSON.stringify(b.creditos_700) === '["comprar"]' && JSON.stringify(b.creditos_1500) === '["tarjeta","paypal"]', 'Mínimo $9,99: $4,99 sin PayPal, $9,99 con PayPal');
      await cerrar(o, 'Mínimo $9,99');
    }
    {
      const o = await abrir(browser, { nombre: 'sin_llaves', paypal: { disponible: false } });
      await irTienda(o.page);
      const r = await revisar(o, 'Sin llaves');
      bien(!(await o.page.$('#tab-tienda [data-metodo="paypal"]')) && !/PayPal/.test(r.txt), 'Sin llaves de PayPal: ningún botón ni texto de PayPal');
      await cerrar(o, 'Sin llaves');
    }

    /* ---------- 4) En la app de Google Play ---------- */
    {
      const o = await abrir(browser, { nombre: 'app', query: '?origen=android', play: PLAY });
      await irTienda(o.page);
      await o.page.waitForFunction(() => document.querySelector('#tab-tienda [data-prod="creditos_700"] .price'), null, { timeout: 8000 }).catch(() => null);
      const r = await revisar(o, 'App');
      bien(!(await o.page.$('[data-metodo="paypal"]')) && !/paypal/i.test(r.txt) && !/plux/i.test(r.txt), 'App: nada de PayPal ni de Plux (solo Google Play)');
      await o.page.click('[data-prod="creditos_700"] [data-act="comprar"]');
      await o.page.waitForTimeout(500);
      bien((await o.page.evaluate(() => window.__gp.pagos)).includes('creditos_700') && !o.srv.ordenes.length && !(await o.page.$('#overlay.on .tv-pagos-modal')),
        'App: Comprar abre Google Play, sin preguntar el método y sin /api/orden');
      await o.page.screenshot({ path: path.join(OUT, 'paypal_app.png') });
      await cerrar(o, 'App');
    }

    /* ---------- 5) Sin servidor (como dist/) ---------- */
    {
      const o = await abrir(browser, { nombre: 'sin_servidor', sinServidor: true });
      await irTienda(o.page, '#tab-tienda .card');
      const t = await o.page.$eval('#tab-tienda', (el) => el.innerText).catch(() => '');
      bien(!/paypal/i.test(t) && !(await o.page.$('[data-metodo="paypal"]')), 'Sin servidor (dist/): nada de PayPal');
      await cerrar(o, 'Sin servidor');
    }
  } catch (e) {
    fallas++;
    console.error('❌ La prueba se detuvo:', e);
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})();
