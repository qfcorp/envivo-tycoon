/* Compras de Google Play sin confirmar (auditoría A3): dentro del juego real (js/ui.js + js/googleplay.js) en un celular,
   con Play Billing FALSO (getDigitalGoodsService / listPurchases, como los da Chrome en la TWA) y el servidor imitado aquí.
   Google devuelve el dinero solo si el servidor no confirma la compra en 3 días: el juego debe mandarlas a
   POST /api/google/verificar
     1. al ABRIR la app (cada arranque), sin que el jugador toque nada;
     2. al VOLVER a la app desde segundo plano (visibilitychange), como mucho una vez cada 10 s;
   y no volver a mandar las ya confirmadas. Un "de una sola vez" repetido (409 google_ya_comprado) no rompe nada.
   En la web (sin Play Billing) no se verifica nada.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_play_restaurar.js */
'use strict';
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://envivo.test';
const pagina = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }
const PRODUCTOS = [
  { id: 'creditos_250', nombre: '250 créditos', detalle: '', precio: 1.99, creditos: 250, una_vez: false, tipo: 'creditos', precio_base: 1.99, creditos_base: 250, oferta: null },
  { id: 'inicio', nombre: 'Paquete de inicio', detalle: '', precio: 2.99, creditos: 200, una_vez: true, tipo: 'inicio', precio_base: 2.99, creditos_base: 200, oferta: null },
];

function fakePlay(compras) {
  window.__gp = { compras: compras.slice(), listas: 0 };
  window.getDigitalGoodsService = async () => ({
    async getDetails(ids) { return ids.map((id) => ({ itemId: id, title: id, description: '', price: { currency: 'USD', value: '1.99' } })); },
    async listPurchases() { window.__gp.listas++; return window.__gp.compras.map((c) => Object.assign({}, c)); },
    async consume() {},
  });
  window.PaymentRequest = class { constructor() {} async show() { throw new DOMException('no', 'AbortError'); } };
}

async function abrir(browser, query, compras) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { verificar: [], estado: 0 };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/estado') {
        srv.estado++;
        return json(200, { ok: true, tienda: { productos: PRODUCTOS, premium: [] }, logueado: true, entregas: [], inventario: [], plux: { disponible: true, ambiente: 'produccion' },
          jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: 100, vip_activo: false, vip_nivel: 0, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' } });
      }
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/google/verificar') {
        let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) { b = {}; }
        srv.verificar.push(b);
        if (/^tok_dup/.test(b.purchaseToken || '')) {
          return json(409, { ok: false, error: 'Ya tienes «Paquete de inicio» (se compra una sola vez), así que no te lo entregamos otra vez. No te preocupes: Google Play te devolverá el dinero automáticamente en unos días.', codigo: 'google_ya_comprado' });
        }
        return json(200, { ok: true, nueva: true, compra: { id: srv.verificar.length, producto: b.producto, estado: 'pagado', canal: 'google_play' } });
      }
      return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    }
    const rel = decodeURIComponent(u.pathname).replace(/^\//, '');
    const f = path.join(RAIZ, rel);
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  if (compras) await page.addInitScript(fakePlay, compras);
  await page.goto(BASE + '/' + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 10000 });
  return { ctx, page, errores, srv };
}

// Simula que la app pasa a segundo plano y vuelve (Chrome en la TWA dispara visibilitychange)
async function irYVolver(page) {
  await page.evaluate(() => {
    const poner = (v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); };
    poner('hidden'); poner('visible');
  });
}
const tokens = (srv) => srv.verificar.map((v) => v.purchaseToken);
const esperarHasta = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return fn(); };

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- 1. En la app: al abrir se mandan las compras sin confirmar
    const o = await abrir(browser, '?origen=android', [
      { itemId: 'creditos_250', purchaseToken: 'tok_a_' + 'x'.repeat(20) },
      { itemId: 'inicio', purchaseToken: 'tok_dup_' + 'y'.repeat(20) },
    ]);
    await esperarHasta(() => o.srv.verificar.length >= 2, 10000);
    bien(tokens(o.srv).some((t) => /^tok_a_/.test(t)) && tokens(o.srv).some((t) => /^tok_dup_/.test(t)), 'al abrir la app: las 2 compras sin confirmar se mandan a /api/google/verificar (' + tokens(o.srv).length + ')');
    bien(o.srv.verificar.every((v) => v.producto && v.purchaseToken), 'cada verificación lleva producto y purchaseToken');
    await esperarHasta(() => o.srv.estado >= 2, 5000);
    bien(o.srv.estado >= 2, 'la entregada refresca /api/estado (para aplicar lo que llegó)');
    const listasAlAbrir = await o.page.evaluate(() => window.__gp.listas);
    bien(listasAlAbrir >= 1, 'listPurchases() se llamó al abrir (' + listasAlAbrir + ')');

    // ---- 2. Volver a la app enseguida (menos de 10 s): no se revisa otra vez
    await o.page.evaluate(() => { window.__gp.compras.push({ itemId: 'creditos_250', purchaseToken: 'tok_b_' + 'z'.repeat(20) }); });
    const n1 = o.srv.verificar.length;
    await irYVolver(o.page);
    await o.page.waitForTimeout(1500);
    bien(o.srv.verificar.length === n1, 'volver a la app enseguida: no se revisa otra vez (máximo una vez cada 10 s)');

    // ---- 3. Volver después de 10 s: la compra nueva (p. ej. un pago pendiente ya aprobado) se manda
    await o.page.waitForTimeout(9500);
    await irYVolver(o.page);
    await esperarHasta(() => tokens(o.srv).some((t) => /^tok_b_/.test(t)), 6000);
    const nuevos = tokens(o.srv).slice(n1);
    bien(nuevos.some((t) => /^tok_b_/.test(t)), 'volver a la app después de 10 s: la compra nueva se manda a verificar');
    bien(!nuevos.some((t) => /^tok_a_/.test(t)), '…la ya confirmada (tok_a) no se vuelve a mandar');
    bien(!o.errores.length, 'app: sin errores de JS (también con el 409 google_ya_comprado)' + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
    await o.ctx.close();

    // ---- 4. En la web (un navegador normal no tiene Play Billing): nada que verificar, ni al abrir ni al volver
    const w = await abrir(browser, '', null);
    await w.page.waitForTimeout(2500);
    await irYVolver(w.page);
    await w.page.waitForTimeout(800);
    bien(w.srv.verificar.length === 0, 'web: no llama a /api/google/verificar');
    bien(!w.errores.length, 'web: sin errores de JS' + (w.errores.length ? ' → ' + w.errores.slice(0, 3).join(' | ') : ''));
    await w.ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} correctas, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
