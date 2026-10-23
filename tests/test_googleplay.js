/* Prueba de js/googleplay.js (compras con Google Play dentro de la app de Android) con Playwright.
   - Levanta un servidor local que sirve js/googleplay.js y un /api/google/verificar FALSO (no habla con Google).
   - Simula la app de Android: window.getDigitalGoodsService y PaymentRequest falsos (como los da Chrome en una TWA).
   - Revisa: lista de precios, compra + verificación en el servidor + consume, cancelación, pago pendiente,
     servidor caído, restaurar compras sin confirmar, sin sesión, y que fuera de la app no haga NADA.
   Uso:  node tests/test_googleplay.js        (sale con código 1 si algo falla) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULO = fs.readFileSync(path.join(ROOT, 'js', 'googleplay.js'), 'utf8');

// ---- Servidor de prueba: la página, el módulo y un /api/google/verificar falso ----
const llamadas = [];          // lo que recibió el servidor falso
let modoServidor = 'ok';      // 'ok' | 'pendiente' | 'caido' | 'sin_sesion'
const entregados = new Set(); // purchaseToken ya entregados (para responder nueva:false)

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/prueba.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>prueba</title><body><button id="b">Comprar</button><script src="/js/googleplay.js"></script></body>');
      return;
    }
    if (url.pathname === '/js/googleplay.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(MODULO);
      return;
    }
    if (url.pathname === '/api/google/verificar' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let j = {};
        try { j = JSON.parse(body); } catch (e) { /* nada */ }
        llamadas.push({ body: j, cabecera: req.headers['x-envivo'], tipo: req.headers['content-type'] });
        const responder = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (modoServidor === 'caido') return responder(502, { ok: false, error: 'No se pudo verificar la compra con Google Play. Intenta otra vez.', codigo: 'google_error' });
        if (modoServidor === 'sin_sesion') return responder(401, { ok: false, error: 'Entra a tu cuenta.', codigo: 'sesion_requerida' });
        if (modoServidor === 'pendiente') return responder(402, { ok: false, error: 'Tu pago está pendiente en Google Play.', codigo: 'google_pendiente' });
        if (!j.producto || !j.purchaseToken) return responder(400, { ok: false, error: 'Faltan datos', codigo: 'datos_invalidos' });
        const nueva = !entregados.has(j.purchaseToken);
        entregados.add(j.purchaseToken);
        return responder(200, { ok: true, nueva, compra: { id: llamadas.length, producto: j.producto, estado: 'pagado', canal: 'google_play' }, creditos: 700 });
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---- Simulación de Chrome dentro de la TWA (se inyecta antes de que cargue la página) ----
function simularTwa(cfg) {
  const st = window.__gp = {
    cfg,
    pagos: [],          // PaymentRequest creados
    completados: [],    // valores de response.complete()
    consumidos: [],     // tokens consumidos
    // compras que Google tiene "sin consumir" (listPurchases); se pueden precargar
    compras: (cfg.comprasIniciales || []).slice(),
    contador: 0,
  };
  const detalles = {
    creditos_250: { currency: 'USD', value: '1.99', title: '250 créditos (EN VIVO Tycoon)' },
    creditos_700: { currency: 'USD', value: '4.99', title: '700 créditos (EN VIVO Tycoon)' },
    inicio: { currency: 'USD', value: '2.99', title: 'Paquete de inicio (EN VIVO Tycoon)' },
  };
  window.getDigitalGoodsService = async (proveedor) => {
    if (cfg.servicioFalla) throw new DOMException('Play Billing no está disponible', 'OperationError');
    if (proveedor !== 'https://play.google.com/billing') throw new Error('proveedor desconocido: ' + proveedor);
    return {
      async getDetails(ids) {
        return ids.filter((id) => detalles[id]).map((id) => ({
          itemId: id, title: detalles[id].title, description: 'desc ' + id,
          price: { currency: detalles[id].currency, value: detalles[id].value },
        }));
      },
      async listPurchases() { return st.compras.map((c) => ({ itemId: c.itemId, purchaseToken: c.purchaseToken })); },
      async consume(token) {
        st.consumidos.push(token);
        const i = st.compras.findIndex((c) => c.purchaseToken === token);
        if (i === -1) throw new DOMException('Item not owned', 'OperationError');
        st.compras.splice(i, 1);
      },
    };
  };
  window.PaymentRequest = class {
    constructor(methods, details) {
      this.methods = methods; this.details = details;
      st.pagos.push({ methods: JSON.parse(JSON.stringify(methods)), details: JSON.parse(JSON.stringify(details)) });
    }
    async show() {
      const accion = st.cfg.accion || 'pagar';
      if (accion === 'cancelar') throw new DOMException('El usuario cerró la ventana', 'AbortError');
      const sku = this.methods[0].data.sku;
      const token = 'tok_' + sku + '_' + (++st.contador) + '_abcdefghij';
      st.compras.push({ itemId: sku, purchaseToken: token });
      return {
        methodName: 'https://play.google.com/billing',
        details: { token, purchaseToken: token },   // así responde android-browser-helper (sin orderId)
        async complete(r) { st.completados.push(r); },
      };
    }
  };
}

(async () => {
  const failures = [];
  const ok = (cond, msg) => { if (cond) console.log('  ✔ ' + msg); else { console.log('  ✘ ' + msg); failures.push(msg); } };
  const server = await startServer();
  const base = `http://localhost:${server.address().port}/prueba.html`;
  const browser = await chromium.launch();
  const errores = [];

  async function nuevaPagina(cfg, extra) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
    if (cfg) await page.addInitScript(simularTwa, cfg);
    if (extra) await page.addInitScript(extra);
    await page.goto(base, { waitUntil: 'load' });
    return { ctx, page };
  }
  // Ejecuta la compra dentro de un clic real (como en el juego)
  const comprarConClic = (page, id) => page.evaluate((pid) => new Promise((res) => {
    const b = document.getElementById('b');
    b.onclick = () => { GooglePlay.comprar(pid).then(res); };
    b.click();
  }), id);

  try {
    // 1) Navegador normal (fuera de la app): todo apagado, sin errores ni llamadas al servidor
    console.log('Fuera de la app:');
    {
      const { ctx, page } = await nuevaPagina(null);
      const r = await page.evaluate(async () => ({
        existe: typeof window.GooglePlay === 'object',
        enApp: GooglePlay.enApp(),
        disp: await GooglePlay.disponible(),
        prods: await GooglePlay.productos(['creditos_700']),
        compra: await GooglePlay.comprar('creditos_700'),
        rest: await GooglePlay.restaurar(),
      }));
      ok(r.existe && r.enApp === false && r.disp === false, 'GooglePlay existe, enApp() = false, disponible() = false');
      ok(Array.isArray(r.prods) && r.prods.length === 0, 'productos() devuelve [] sin errores');
      ok(r.compra.ok === false && r.compra.estado === 'no_disponible', 'comprar() responde no_disponible (' + r.compra.estado + ')');
      ok(r.rest.revisadas === 0 && r.rest.omitido === 'no_disponible', 'restaurar() no hace nada');
      ok(llamadas.length === 0, 'no llamó al servidor');
      await ctx.close();
    }

    // 2) Chrome con la API pero sin Play (por ejemplo, fuera de la TWA): disponible() = false sin romper
    console.log('API presente pero Play no disponible:');
    {
      const { ctx, page } = await nuevaPagina({ servicioFalla: true });
      const r = await page.evaluate(async () => ({ disp: await GooglePlay.disponible(), prods: await GooglePlay.productos(['inicio']), rest: await GooglePlay.restaurar() }));
      ok(r.disp === false && r.prods.length === 0 && r.rest.omitido === 'no_disponible', 'getDigitalGoodsService falla -> todo apagado sin errores');
      await ctx.close();
    }

    // 3) Dentro de la app (TWA simulada)
    console.log('Dentro de la app (TWA simulada):');
    {
      const { ctx, page } = await nuevaPagina({}, () => { window.Api = { logueado: () => true, estado: { tienda: { productos: [{ id: 'creditos_700', una_vez: false }, { id: 'inicio', una_vez: true }] } } }; });
      const enApp = await page.evaluate(() => GooglePlay.enApp());
      ok(enApp === false, 'sin ?origen=android ni referrer de la app, enApp() = false');
      ok(await page.evaluate(() => GooglePlay.disponible()), 'disponible() = true');

      const prods = await page.evaluate(() => GooglePlay.productos(['creditos_700', 'inicio', 'no_existe']));
      ok(prods.length === 2, 'productos() trae solo los que existen en Play (' + prods.length + ')');
      const p700 = prods.find((p) => p.id === 'creditos_700');
      ok(p700 && /4[.,]99/.test(p700.precio) && p700.moneda === 'USD' && p700.valor === 4.99, 'precio de Google Play formateado: ' + (p700 && p700.precio));
      ok(p700 && p700.titulo === '700 créditos', 'se quita "(EN VIVO Tycoon)" del título: ' + (p700 && p700.titulo));

      // Compra de un consumible
      llamadas.length = 0;
      const c1 = await comprarConClic(page, 'creditos_700');
      const gp1 = await page.evaluate(() => window.__gp);
      ok(c1.ok && c1.estado === 'entregado', 'compra de creditos_700 entregada (' + c1.estado + ')');
      const pago = gp1.pagos[0];
      ok(pago && pago.methods[0].supportedMethods === 'https://play.google.com/billing' && pago.methods[0].data.sku === 'creditos_700', 'PaymentRequest con el método de Play y sku correcto');
      ok(llamadas.length === 1 && llamadas[0].body.producto === 'creditos_700' && /^tok_creditos_700_/.test(llamadas[0].body.purchaseToken) && 'orderId' in llamadas[0].body,
        'POST /api/google/verificar {producto, purchaseToken, orderId}');
      ok(llamadas[0].cabecera === '1' && /json/.test(llamadas[0].tipo), 'manda X-Envivo: 1 y JSON (lo exige el servidor)');
      ok(gp1.completados[0] === 'success', 'response.complete("success")');
      ok(gp1.consumidos.length === 1 && gp1.consumidos[0] === llamadas[0].body.purchaseToken && c1.consumido === true, 'consume() DESPUÉS de que el servidor confirmó');

      // Compra de un producto de una sola vez: no se consume
      const c2 = await comprarConClic(page, 'inicio');
      const gp2 = await page.evaluate(() => window.__gp);
      ok(c2.ok && c2.estado === 'entregado' && gp2.consumidos.length === 1, 'paquete de inicio entregado y NO consumido (lo reconoce el servidor)');

      // Cancelar en la ventana de Google
      llamadas.length = 0;
      await page.evaluate(() => { window.__gp.cfg.accion = 'cancelar'; });
      const c3 = await comprarConClic(page, 'creditos_250');
      ok(c3.ok === false && c3.estado === 'cancelado' && llamadas.length === 0, 'cancelar no llama al servidor (' + c3.estado + ')');
      await page.evaluate(() => { window.__gp.cfg.accion = 'pagar'; });

      // Pago pendiente (efectivo, etc.)
      modoServidor = 'pendiente';
      const c4 = await comprarConClic(page, 'creditos_250');
      const gp4 = await page.evaluate(() => window.__gp);
      ok(c4.estado === 'pendiente' && gp4.consumidos.length === 1 && gp4.completados[gp4.completados.length - 1] === 'unknown', 'pago pendiente: no se consume, complete("unknown")');

      // Servidor caído: la compra queda en Google para restaurar()
      modoServidor = 'caido';
      const c5 = await comprarConClic(page, 'creditos_250');
      ok(c5.estado === 'error' && c5.reintentar === true, 'servidor caído: error con reintentar=true (' + c5.mensaje + ')');
      const sinConsumir = await page.evaluate(() => window.__gp.compras.map((c) => c.itemId));
      ok(sinConsumir.filter((x) => x === 'creditos_250').length === 2, 'las 2 compras sin confirmar siguen en Google');

      // Restaurar cuando vuelve el servidor
      modoServidor = 'ok';
      llamadas.length = 0;
      const r1 = await page.evaluate(() => GooglePlay.restaurar());
      ok(r1.revisadas === 2 && r1.entregadas.length === 2 && r1.errores.length === 0, 'restaurar() entrega las 2 compras pendientes ' + JSON.stringify(r1));
      ok(!llamadas.some((l) => /^tok_inicio_/.test(l.body.purchaseToken)), 'restaurar() no vuelve a mandar el paquete de inicio ya confirmado');
      const quedan = await page.evaluate(() => window.__gp.compras.map((c) => c.itemId));
      ok(quedan.length === 1 && quedan[0] === 'inicio', 'después de restaurar solo queda el de una sola vez en Google: ' + quedan.join(','));
      llamadas.length = 0;
      const r2 = await page.evaluate(() => GooglePlay.restaurar());
      ok(r2.revisadas === 0 && llamadas.length === 0, 'restaurar() otra vez: nada que hacer');

      // Dos toques seguidos: una sola compra
      const doble = await page.evaluate(() => new Promise((res) => {
        const b = document.getElementById('b');
        b.onclick = () => { Promise.all([GooglePlay.comprar('creditos_250'), GooglePlay.comprar('creditos_250')]).then(res); };
        b.click();
      }));
      ok(doble[0].ok && doble[1].estado === 'ocupado', 'doble toque: la segunda dice "ocupado"');

      // Sin sesión: no abre la ventana de Google (no se cobra a alguien que no puede recibir)
      const pagosAntes = (await page.evaluate(() => window.__gp.pagos.length));
      await page.evaluate(() => { window.Api.logueado = () => false; });
      const c6 = await comprarConClic(page, 'creditos_700');
      const pagosDespues = (await page.evaluate(() => window.__gp.pagos.length));
      ok(c6.estado === 'sesion_requerida' && pagosDespues === pagosAntes, 'sin sesión: pide entrar y no abre Google Play');
      const r3 = await page.evaluate(() => GooglePlay.restaurar());
      ok(r3.omitido === 'sesion_requerida', 'restaurar() sin sesión se omite');
      await ctx.close();
    }

    // 4) Restaurar con la sesión vencida en el servidor
    console.log('Sesión vencida en el servidor:');
    {
      const { ctx, page } = await nuevaPagina({ comprasIniciales: [{ itemId: 'creditos_700', purchaseToken: 'tok_previa_1234567890' }] });
      modoServidor = 'sin_sesion';
      const r = await page.evaluate(() => GooglePlay.restaurar());
      ok(r.errores.length === 1 && r.errores[0].codigo === 'sesion_requerida' && r.entregadas.length === 0, 'la compra no se pierde: queda para cuando entre');
      const quedan = await page.evaluate(() => window.__gp.compras.length);
      ok(quedan === 1 && (await page.evaluate(() => window.__gp.consumidos.length)) === 0, 'no se consume sin confirmación del servidor');
      modoServidor = 'ok';
      await ctx.close();
    }

    // 5) Detección de la app por ?origen=android (startUrl de twa-manifest.json)
    console.log('Detección de la app:');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(base + '?origen=android', { waitUntil: 'load' });
      const a = await page.evaluate(() => GooglePlay.enApp());
      await page.evaluate(() => history.replaceState(null, '', location.pathname));
      const b = await page.evaluate(() => GooglePlay.enApp());
      ok(a === true && b === true, 'enApp() = true con ?origen=android y se recuerda en la pestaña');
      await ctx.close();
    }

    ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) { console.error(`\n❌ ${failures.length} fallas`); process.exit(1); }
  console.log('\n✅ Google Play (TWA) OK');
})().catch((e) => { console.error(e); process.exit(1); });
