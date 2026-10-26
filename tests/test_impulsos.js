/* Prueba de js/impulsos.js (Equipo de obra extra, Fondo de crecimiento y Tarjeta semanal; server/INTEGRAR_MONETIZACION2.md)
   dentro del juego real en un celular de 360x780 con Playwright. El servidor se imita aquí (/api/estado, /api/impulsos*,
   /api/sede, /api/orden). Casos:
     web        – con cuenta y Pago Plux: sección "Crecer más rápido" en la Tienda con las 3 tarjetas, cada compra con su
                  precio real; tabla fija de 9 hitos; Comprar → POST /api/orden.
     comprado   – fondo comprado (2 premios listos) y tarjeta activa: Reclamar todo → POST /api/impulsos/fondo; Reclamar hoy →
                  POST /api/impulsos/tarjeta; tarjeta de Inicio solo mientras hay algo por reclamar.
     sede       – sede oficial con el único equipo ocupado: botón discreto "¿Segundo equipo de obra?" junto a la cola →
                  ventana con compra y alquiler; Alquilar → confirma → POST {confirmar_precio} y descuenta el dinero del juego.
                  Con un equipo libre, el botón no sale.
     app        – dentro de la app de Google Play: solo precios de Play; equipo_obra_2 sin precio en Play → sin botón de compra
                  (el alquiler gratis sigue); nada de "Plux".
     en         – en inglés: textos traducidos.
     sin_modulo – js/impulsos.js no carga: la tienda funciona igual.
   En todos: sin errores de JS, sin desborde horizontal, sin textos de premios al azar, sin claves sin traducir.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_impulsos.js   (capturas en tests/capturas/impulsos_*.png) */
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

const CLAVES = Object.keys(require(path.join(RAIZ, 'js/impulsos.js')).ES);
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Datos del servidor de prueba ---------- */
const prod = (id, nombre, detalle, precio, tipo, extra) => Object.assign({ id, nombre, detalle, precio, creditos: 0, una_vez: false, tipo, precio_base: precio, creditos_base: 0, oferta: null }, extra || {});
const PRODUCTOS = [
  prod('creditos_250', '250 créditos', 'Paquete de 250 créditos', 1.99, 'creditos', { creditos: 250 }),
  prod('pack_obra_s', 'Pack de obra S', 'Sede oficial: 10 h de aceleradores', 1.99, 'pack_obra'),
  prod('equipo_obra_2', 'Equipo de obra extra (permanente)', 'Sede oficial: +1 equipo de obra para siempre', 2.99, 'equipo_obra', { una_vez: true }),
  prod('fondo_crecimiento', 'Fondo de crecimiento', 'Una sola vez: créditos y materiales fijos', 19.99, 'fondo', { una_vez: true }),
  prod('tarjeta_semanal', 'Tarjeta semanal', '7 días: 15 créditos cada día', 1.99, 'tarjeta_semanal', { dias: 7, creditos_dia: 15 }),
];
const HITOS = [[5, 500, 10, 1], [8, 700, 16, 1], [10, 800, 20, 2], [12, 900, 24, 2], [15, 1000, 30, 3], [18, 1200, 36, 3], [20, 1300, 40, 4], [25, 1500, 50, 5], [30, 2100, 60, 6]];
function impulsos(o) {
  const nivel = o.nivel || 3;
  return {
    ok: true, ahora: 1792800000, dia: '2026-10-23', sede_nivel: nivel, obreros: o.obreros || 1, obreros_max: 3,
    equipo: { producto: 'equipo_obra_2', permanente: !!o.permanente, extra: o.permanente || o.alquilado ? 1 : 0,
      alquiler: { activo: !!o.alquilado, hasta: o.alquilado ? '2026-10-25T15:00:00-05:00' : null, origen: o.alquilado ? 'alquiler' : null, horas: 48,
        precio: 1500 + 500 * nivel, espera_hasta: null, puede: !o.permanente && !o.alquilado, ultimo_precio: o.alquilado ? 1500 + 500 * nivel : null } },
    fondo: { producto: 'fondo_crecimiento', comprado: !!o.fondo, por_reclamar: o.fondo ? HITOS.filter((h) => h[0] <= nivel && !(o.reclamados || []).includes(h[0])).length : 0, total_creditos: 10000,
      hitos: HITOS.map(([n, cr, c, x]) => ({ nivel: n, creditos: cr, mat: { cables: c, placas: c, paneles: c, credenciales: c, planos: c, chips: x }, alcanzado: nivel >= n, reclamado: (o.reclamados || []).includes(n) })) },
    tarjeta: { producto: 'tarjeta_semanal', activa: !!o.tarjeta, hasta: o.tarjeta ? '2026-10-29T10:00:00-05:00' : null, dias_restantes: o.tarjeta ? 6 : 0,
      reclamada_hoy: !!o.reclamadaHoy, creditos_dia: 15, mat_dia: { cables: 3, placas: 3, paneles: 3, credenciales: 3, planos: 3 }, dias: 7, proximo: '2026-10-24T00:00:00-05:00' },
    productos: { equipo_obra_2: { id: 'equipo_obra_2', precio: 2.99, activo: true }, fondo_crecimiento: { id: 'fondo_crecimiento', precio: 19.99, activo: true }, tarjeta_semanal: { id: 'tarjeta_semanal', precio: 1.99, activo: true } },
    creditos: 1340,
  };
}
// Sede oficial mínima (nivel 3, un solo equipo, ocupado o libre)
function sede(ocupada, obreros) {
  const ahora = Math.floor(Date.now() / 1000);
  const obras = ocupada ? [{ id: 41, tipo: 'mejora', ed: 'control', nivel: 4, inicio: ahora - 600, duracion: 7200, fin: ahora + 6600, restante: 6600, ayudas: 0, ayudas_max: 10, costo_creditos: 19, segundos_ayuda: 300 }] : [];
  return { ok: true, ahora, dia: '2026-10-23', creditos: 1340, reglas: { seg_por_credito: 360, costo_min: 5, ayudas_max: 10, ayuda_pct: 0.01, ayuda_min_seg: 300 },
    sede: { nivel: 3, max: false, materiales: { cables: 40, placas: 22, paneles: 35, credenciales: 18, planos: 30, chips: 3 }, aceleradores_min: 0, mejoras: {}, obreros: obreros || 1,
      etapa: { objetivo: 4, hechas: 0, mejoras: [
        { ed: 'control', mat: { placas: 6, cables: 6 }, dias: 1, segundos: 7200, hecha: false, obra_id: ocupada ? 41 : null, falta: {}, nivel_ed: 2 },
        { ed: 'bodega', mat: { cables: 6, planos: 5 }, dias: 1, segundos: 7200, hecha: false, obra_id: null, falta: {}, nivel_ed: 2 }],
        sede: { mat: { planos: 8, placas: 8, paneles: 7 }, dias: 2, segundos: 14400, obra_id: null, falta: {}, req: [], listo: false } },
      obras, cofre: { disponible: false, proximo: ahora + 9 * 3600 }, bono_competencia: 0, migracion: { posible: false, nivel_max: 8 } } };
}
const PLAY = { creditos_250: '2.49', pack_obra_s: '2.49', fondo_crecimiento: '23.99', tarjeta_semanal: '2.49' };   // equipo_obra_2 NO está en Play

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
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: caso.locale || 'es-EC' });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { ordenes: [], posts: [], imp: Object.assign({}, caso.imp || {}) };
  const estado = () => ({ ok: true, tienda: { productos: PRODUCTOS, premium: [] }, logueado: true, entregas: [], inventario: [],
    plux: { disponible: true, ambiente: 'produccion' }, jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: 1340, vip_activo: false,
    vip_nivel: 0, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) { b = null; }
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      if (req.method() === 'POST') srv.posts.push({ ruta: u.pathname, body: b, cabecera: req.headers()['x-envivo'] });
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/impulsos') {
        if (caso.sinServidor) return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
        return json(200, impulsos(srv.imp));
      }
      if (u.pathname === '/api/impulsos/fondo') {
        const nivel = srv.imp.nivel || 3;
        const listos = HITOS.filter((h) => h[0] <= nivel && !(srv.imp.reclamados || []).includes(h[0])).map((h) => h[0]);
        const lista = b && b.nivel ? [b.nivel] : listos;
        srv.imp.reclamados = (srv.imp.reclamados || []).concat(lista);
        return json(200, Object.assign({ recibido: { niveles: lista, creditos: HITOS.filter((h) => lista.includes(h[0])).reduce((s, h) => s + h[1], 0), mat: {} } }, impulsos(srv.imp)));
      }
      if (u.pathname === '/api/impulsos/tarjeta') { srv.imp.reclamadaHoy = true; return json(200, Object.assign({ recibido: { creditos: 15, mat: {} } }, impulsos(srv.imp))); }
      if (u.pathname === '/api/impulsos/alquilar') {
        const precio = 1500 + 500 * (srv.imp.nivel || 3);
        if (!b || typeof b.confirmar_precio !== 'number') return json(400, { ok: false, error: 'Confirma el precio del alquiler.', codigo: 'confirmar_precio', precio });
        srv.imp.alquilado = true; srv.imp.obreros = 2;
        return json(200, Object.assign({ alquilado: true, precio }, impulsos(srv.imp)));
      }
      if (u.pathname === '/api/sede') return caso.sede ? json(200, sede(!srv.imp.alquilado && caso.sede.ocupada, srv.imp.alquilado ? 2 : 1)) : json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
      if (u.pathname === '/api/sede/ayudas') return json(200, { ok: true, asociacion: null, hoy: { ayudas: 0, max: 30, premios: 0, premios_max: 10 }, obras: [] });
      if (u.pathname === '/api/orden') { srv.ordenes.push(b && b.producto); return json(200, { ok: true, url: BASE + '/pago-prueba.html' }); }
      return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    }
    if (u.pathname === '/pago-prueba.html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>pago</p>' });
    const rel = decodeURIComponent(u.pathname).replace(/^\//, '');
    if ((caso.sinModulos || []).includes(rel)) return route.fulfill({ status: 404, body: '' });
    const f = path.join(RAIZ, rel);
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  if (caso.play) await page.addInitScript(fakePlay, caso.play);
  await page.addInitScript((c) => { try { localStorage.setItem('envivo_lang', c); } catch (e) { /* nada */ } }, caso.idioma || 'es');
  await page.goto(BASE + '/' + (caso.query || ''), { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('#overlay.on [data-act="close"]', { timeout: 4000 }); await page.click('#overlay.on [data-act="close"]'); } catch (e) { /* sin bienvenida */ }
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 8000 });
  return { ctx, page, errores, srv };
}

async function irTienda(page) {
  await page.click('nav button[data-tab="tienda"]');
  await page.waitForSelector('#tab-tienda .tv-trust', { timeout: 8000 });
  await page.waitForTimeout(800);   // /api/impulsos y Google Play llegan después
}
async function revisar(o, nombre, sel) {
  const r = await o.page.evaluate(([sel, CLAVES]) => {
    const t = document.querySelector(sel);
    if (!t) return { falta: true };
    const ancho = window.innerWidth;
    const fuera = [...t.querySelectorAll('*')].filter((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || el.closest('.catrow')) return false;
      return b.right > ancho + 0.5 || b.left < -0.5;
    }).map((el) => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName);
    const txt = t.innerText;
    const sinPrecio = [...t.querySelectorAll('[data-act="comprar"]')].filter((b) => { const c = b.closest('.card'); const p = c && c.querySelector('.price'); return !(p && p.textContent.trim()); }).map((b) => b.dataset.k);
    return { scroll: document.documentElement.scrollWidth - ancho, fuera: fuera.slice(0, 6), txt, sinPrecio,
      claves: (txt.match(/\b(tienda|online|err|mat)\.[a-z_.]+\b/g) || []).concat((txt.match(/\b[a-z]+_[a-z0-9_]+\b/g) || []).filter((k) => CLAVES.includes(k))),
      marcas: (txt.match(/\{\w+\}/g) || []) };
  }, [sel, CLAVES]);
  if (r.falta) { bien(false, `${nombre}: falta ${sel}`); return r; }
  bien(r.scroll <= 0 && !r.fuera.length, `${nombre}: sin desborde horizontal a 360px` + (r.scroll > 0 ? ` (scroll ${r.scroll}px)` : '') + (r.fuera.length ? ' fuera: ' + r.fuera.join(', ') : ''));
  bien(!r.sinPrecio.length, `${nombre}: cada botón de compra muestra su precio real` + (r.sinPrecio.length ? ' → sin precio: ' + r.sinPrecio.join(', ') : ''));
  bien(!/aleatori|al azar|probabilidad|suerte|random|chance/i.test(r.txt), `${nombre}: ningún texto de premios al azar`);
  bien(!r.claves.length && !r.marcas.length, `${nombre}: sin claves sin traducir ni {marcadores}` + (r.claves.length ? ' ' + r.claves.join(',') : '') + (r.marcas.length ? ' ' + r.marcas.join(',') : ''));
  return r;
}
async function fotoSel(page, sel, nombre) {
  const el = await page.$(sel);
  if (!el) return;
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await el.screenshot({ path: path.join(OUT, 'impulsos_' + nombre + '.png') });
}
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  await o.ctx.close();
}

(async () => {
  bien(pagina.includes('src="js/impulsos.js"'), 'index.html carga js/impulsos.js');
  const browser = await chromium.launch();
  try {
    /* ---------- 1) Web con cuenta, nada comprado ---------- */
    {
      const o = await abrir(browser, { imp: { nivel: 3 } });
      await irTienda(o.page);
      await o.page.waitForSelector('#tv-crecer', { timeout: 5000 }).catch(() => {});
      const r = await revisar(o, 'Web', '#tab-tienda');
      const cards = await o.page.$$eval('#tv-crecer [data-prod]', (l) => l.map((x) => x.dataset.prod)).catch(() => []);
      bien(JSON.stringify(cards) === JSON.stringify(['equipo_obra_2', 'fondo_crecimiento', 'tarjeta_semanal']), 'Web: sección Crecer con las 3 tarjetas [' + cards.join(', ') + ']');
      const atajo = await o.page.$('#tab-tienda .tv-nav [data-k="tv-crecer"]');
      bien(!!atajo, 'Web: atajo a la sección en la fila de secciones');
      const precios = await o.page.$$eval('#tv-crecer .price', (l) => l.map((x) => x.textContent.trim()));
      bien(precios.length === 3 && precios.every((p) => /\d/.test(p)), 'Web: precios reales (' + precios.join(' / ') + ')');
      const hitos = await o.page.$$eval('#tv-crecer .imp-hito', (l) => l.map((x) => x.dataset.hito));
      bien(hitos.join(',') === '5,8,10,12,15,18,20,25,30', 'Web: tabla fija del fondo con los 9 hitos');
      bien(/10\.000|10,000/.test(r.txt) && /2\.100|2,100/.test(r.txt), 'Web: el fondo muestra el total (10.000) y el premio del nivel 30 (2.100)');
      bien(!(await o.page.$('#tv-crecer [data-acc="fondo"]')), 'Web: sin comprar no hay botones de reclamar');
      const alq = await o.page.$eval('#tv-crecer [data-acc="alquilar"]', (b) => b.textContent).catch(() => '');
      bien(/2 días/.test(alq) && /3\.000|3,000/.test(alq), 'Web: alquiler gratis con dinero del juego a la vista (' + alq.trim() + ')');
      bien(/Tienes 1 de 3/.test(r.txt), 'Web: dice cuántos equipos de obra tienes');
      await fotoSel(o.page, '#tv-crecer', 'tienda');
      await o.page.click('#tv-crecer [data-prod="fondo_crecimiento"] [data-act="comprar"]');
      await o.page.waitForTimeout(500);
      bien(o.srv.ordenes.includes('fondo_crecimiento'), 'Web: Comprar el fondo → POST /api/orden {producto: fondo_crecimiento}');
      bien(!(await o.page.$('[data-imp="inicio"]')) && !(await o.page.evaluate(() => window.Hub && window.Hub.buscar('[data-imp="inicio"]'))), 'Web: sin nada por reclamar no hay tarjeta en Inicio');
      await cerrar(o, 'Web');
    }

    /* ---------- 2) Fondo comprado y tarjeta semanal activa ---------- */
    {
      const o = await abrir(browser, { imp: { nivel: 9, fondo: true, tarjeta: true, permanente: true, obreros: 3 } });
      await o.page.waitForTimeout(900);
      await o.page.click('nav button[data-tab="inicio"]');
      await require('./hub_ayuda').verEnInicio(o.page, '[data-imp="inicio"]', 5000);   // en la sede de Inicio (js/hub.js)
      const ini = await o.page.$eval('[data-imp="inicio"]', (el) => el.innerText).catch(() => '');
      bien(/15/.test(ini) && /2/.test(ini), 'Comprado: Inicio muestra la tarjeta semanal y los 2 premios del fondo para reclamar');
      await fotoSel(o.page, '[data-imp="inicio"]', 'inicio');
      await irTienda(o.page);
      await revisar(o, 'Comprado', '#tv-crecer');
      const listos = await o.page.$$eval('#tv-crecer .imp-hito.listo', (l) => l.map((x) => x.dataset.hito));
      bien(listos.join(',') === '5,8', 'Comprado: hitos 5 y 8 listos para reclamar');
      const ya = await o.page.$$eval('#tv-crecer [data-act="comprar"][disabled]', (l) => l.map((x) => x.dataset.k));
      bien(ya.includes('fondo_crecimiento') && ya.includes('equipo_obra_2'), 'Comprado: fondo y equipo dicen "Ya lo tienes" (una sola vez)');
      const ts = await o.page.$eval('#tv-crecer [data-prod="tarjeta_semanal"] [data-act="comprar"]', (b) => b.textContent).catch(() => '');
      bien(/7/.test(ts), 'Comprado: la tarjeta semanal se puede volver a comprar (suma 7 días)');
      await fotoSel(o.page, '#tv-crecer', 'comprado');
      await o.page.click('#tv-crecer [data-acc="fondo_todo"]');
      await o.page.waitForTimeout(600);
      const pf = o.srv.posts.find((p) => p.ruta === '/api/impulsos/fondo');
      bien(pf && pf.cabecera === '1' && !pf.body.nivel, 'Comprado: Reclamar todo → POST /api/impulsos/fondo (con X-Envivo)');
      const toast = await o.page.evaluate(() => (document.querySelector('.toast, #toast') || {}).innerText || '');
      bien(/1\.200|1,200/.test(toast), 'Comprado: aviso con los créditos recibidos (' + toast.trim() + ')');
      const listos2 = await o.page.$$eval('#tv-crecer .imp-hito.ok', (l) => l.map((x) => x.dataset.hito));
      bien(listos2.join(',') === '5,8', 'Comprado: después quedan como reclamados');
      await o.page.click('#tv-crecer [data-acc="tarjeta"]');
      await o.page.waitForTimeout(600);
      bien(o.srv.posts.some((p) => p.ruta === '/api/impulsos/tarjeta'), 'Comprado: Reclamar hoy → POST /api/impulsos/tarjeta');
      bien(!!(await o.page.$('#tv-crecer [data-prod="tarjeta_semanal"] button[disabled]:not([data-act])')), 'Comprado: después dice "Ya reclamaste hoy"');
      await o.page.click('nav button[data-tab="inicio"]');
      await o.page.waitForTimeout(300);
      bien(!(await o.page.$('[data-imp="inicio"]')), 'Comprado: ya sin nada por reclamar, la tarjeta de Inicio se va');
      await cerrar(o, 'Comprado');
    }

    /* ---------- 3) Sede oficial con la cola llena ---------- */
    {
      const o = await abrir(browser, { imp: { nivel: 3 }, sede: { ocupada: true } });
      await o.page.waitForTimeout(800);
      await o.page.click('nav button[data-tab="inicio"]');
      await require('./hub_ayuda').verEnInicio(o.page, '.sd-card.sd-of', 8000);   // en la sede de Inicio (js/hub.js)
      await o.page.evaluate(() => { window.__game.state.money = 50000; });
      await o.page.click('.sd-card.sd-of');
      await o.page.waitForSelector('#modal .sd-modal.sd-of', { timeout: 5000 }).catch(() => {});
      await o.page.waitForTimeout(400);
      const cola = await o.page.$eval('#modal [data-imp="cola"]', (el) => el.innerText).catch(() => '');
      bien(/¿Segundo equipo de obra\?/.test(cola), 'Sede: con el único equipo ocupado sale "¿Segundo equipo de obra?" junto a la cola');
      const clase = await o.page.$eval('#modal [data-imp="cola"] button', (b) => b.className).catch(() => '');
      bien(!/\bmain\b/.test(clase), 'Sede: el botón es discreto (no es el botón principal)');
      await fotoSel(o.page, '#modal', 'sede_cola');
      await o.page.click('#modal [data-imp="cola"] button');
      await o.page.waitForSelector('#modal .imp-modal', { timeout: 4000 }).catch(() => {});
      const modal = await o.page.$eval('#modal .imp-modal', (el) => el.innerText).catch(() => '');
      bien(/Equipo de obra extra/.test(modal) && !!(await o.page.$('#modal .imp-modal [data-act="comprar"][data-k="equipo_obra_2"]')) && !!(await o.page.$('#modal .imp-modal [data-acc="alquilar"]')),
        'Sede: la ventana ofrece comprarlo para siempre o alquilarlo gratis');
      await revisar(o, 'Sede (ventana)', '#modal');
      await fotoSel(o.page, '#modal', 'equipo');
      const antes = await o.page.evaluate(() => window.__game.state.money);
      await o.page.click('#modal [data-acc="alquilar"]');
      await o.page.waitForSelector('#modal [data-act="confirm-yes"]', { timeout: 4000 }).catch(() => {});
      const q = await o.page.$eval('#modal', (el) => el.innerText).catch(() => '');
      bien(/3\.000|3,000/.test(q), 'Sede: confirma el precio antes de cobrar');
      await o.page.click('#modal [data-act="confirm-yes"]');
      await o.page.waitForTimeout(800);
      const pa = o.srv.posts.find((p) => p.ruta === '/api/impulsos/alquilar');
      bien(pa && pa.body && pa.body.confirmar_precio === 3000, 'Sede: POST /api/impulsos/alquilar {confirmar_precio: 3000}');
      const despues = await o.page.evaluate(() => window.__game.state.money);
      bien(antes - despues === 3000, `Sede: descuenta el dinero del juego (${antes} → ${despues})`);
      await o.page.click('.sd-card.sd-of');
      await o.page.waitForSelector('#modal .sd-modal.sd-of', { timeout: 5000 }).catch(() => {});
      await o.page.waitForTimeout(400);
      bien(!(await o.page.$('#modal [data-imp="cola"]')), 'Sede: con el equipo extra trabajando (cola libre) el botón ya no sale');
      await cerrar(o, 'Sede');
    }

    /* ---------- 4) App de Google Play ---------- */
    {
      const o = await abrir(browser, { imp: { nivel: 3 }, play: PLAY, query: '?origen=android' });
      await o.page.waitForTimeout(800);
      await irTienda(o.page);
      const r = await revisar(o, 'App', '#tv-crecer');
      const precios = await o.page.$$eval('#tv-crecer .price', (l) => l.map((x) => x.dataset.precio + '=' + x.textContent.trim()));
      bien(precios.length === 2 && precios.every((p) => /23[.,]99|2[.,]49/.test(p)), 'App: solo precios de Google Play (' + precios.join(' / ') + ')');
      bien(!(await o.page.$('#tv-crecer [data-act="comprar"][data-k="equipo_obra_2"]')), 'App: equipo_obra_2 sin precio de Play → sin botón de compra');
      bien(!!(await o.page.$('#tv-crecer [data-acc="alquilar"]')), 'App: el alquiler gratis sigue');
      bien(!/plux/i.test(r.txt || ''), 'App: nada de "Plux"');
      await o.page.click('#tv-crecer [data-prod="tarjeta_semanal"] [data-act="comprar"]');
      await o.page.waitForTimeout(400);
      bien((await o.page.evaluate(() => window.__gp.pagos)).includes('tarjeta_semanal'), 'App: Comprar → Google Play con el sku tarjeta_semanal');
      await fotoSel(o.page, '#tv-crecer', 'app');
      await cerrar(o, 'App');
    }

    /* ---------- 5) En inglés ---------- */
    {
      const o = await abrir(browser, { imp: { nivel: 9, fondo: true }, idioma: 'en', locale: 'en-US' });
      await irTienda(o.page);
      const r = await revisar(o, 'EN', '#tv-crecer');
      bien(/Grow faster/i.test(await o.page.$eval('#tv-crecer .sectitle', (el) => el.innerText).catch(() => '')), 'EN: título "Grow faster"');
      bien(/Growth Fund/.test(r.txt) && /Weekly Card/.test(r.txt) && /Extra build crew/.test(r.txt) && !/Reclamar|Equipo de obra/.test(r.txt), 'EN: tarjetas traducidas (sin español)');
      await fotoSel(o.page, '#tv-crecer', 'en');
      await cerrar(o, 'EN');
    }

    /* ---------- 6) Sin el módulo y servidor sin /api/impulsos ---------- */
    {
      const o = await abrir(browser, { sinModulos: ['js/impulsos.js'] });
      await irTienda(o.page);
      bien(!(await o.page.$('#tv-crecer')) && !!(await o.page.$('#tv-creditos')), 'Sin js/impulsos.js: la tienda funciona igual, sin la sección');
      await cerrar(o, 'Sin módulo');
      const o2 = await abrir(browser, { sinServidor: true });
      await irTienda(o2.page);
      await o2.page.waitForTimeout(500);
      bien(!(await o2.page.$('#tv-crecer')), 'Servidor sin /api/impulsos (404): la sección no sale');
      await cerrar(o2, 'Sin servidor');
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} correctas · ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
