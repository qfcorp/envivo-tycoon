/* Prueba de la Tienda v2 (js/ui.js, server/MONETIZACION.md) dentro del juego real en un celular de 360x780 con Playwright.
   El servidor se imita aquí (/api/estado con los productos nuevos, /api/vip, /api/pase, /api/estrellas, /api/orden y
   /api/google/verificar). Casos:
     web      – con cuenta y Pago Plux: secciones Para empezar, Pase, VIP (nivel, avance y oferta), Copa y Duelos, Packs de
                obra, Créditos y Exclusivos; cada botón de compra tiene su precio real al lado; Comprar → POST /api/orden.
     app      – dentro de la app de Google Play (?origen=android, Play Billing falso): solo precios de Google Play, ningún
                producto sin precio de Play, nada de "Plux"; Comprar → PaymentRequest con el sku.
     sin_cuenta – sin sesión: invita a crear la cuenta, sin secciones de módulos.
     sin_modulos – js/vip.js, js/pase.js y js/estrellas.js no cargan: la tienda funciona igual.
   En todos: sin errores de JS, sin desborde horizontal, sin textos de premios al azar, sin claves sin traducir.
   También: el atajo a una sección, el hub "En línea" con Estrellas (si el módulo la pinta) y la versión en inglés.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_tienda_v2.js   (capturas en tests/capturas/tienda_v2_*.png) */
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
const MODULOS = ['js/vip.js', 'js/pase.js', 'js/estrellas.js'];
const presentes = MODULOS.filter((f) => fs.existsSync(path.join(RAIZ, f)) && pagina.includes(`src="${f}"`));

let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Datos del servidor de prueba ---------- */
const prod = (id, nombre, detalle, precio, creditos, tipo, extra) => Object.assign({ id, nombre, detalle, precio, creditos, una_vez: false, tipo, precio_base: precio, creditos_base: creditos, oferta: null }, extra || {});
const PRODUCTOS = [
  prod('creditos_250', '250 créditos', 'Paquete de 250 créditos', 1.99, 250, 'creditos'),
  prod('creditos_700', '700 créditos', '700 créditos (+40 % extra)', 4.99, 700, 'creditos', { oferta: { bono_pct: 20, fin: '2026-10-30T23:00:00Z', creditos_extra: 140 } }),
  prod('creditos_1500', '1.500 créditos', '1.500 créditos (+50 % extra)', 9.99, 1500, 'creditos'),
  prod('creditos_3200', '3.200 créditos', '3.200 créditos (+60 % extra)', 19.99, 3200, 'creditos'),
  prod('bienvenida', 'Oferta de bienvenida', 'Una sola vez: 150 créditos, un camarógrafo senior de refuerzo por 3 eventos y 3 cables', 0.99, 150, 'bienvenida', { una_vez: true }),
  prod('inicio', 'Paquete de inicio', 'Una sola vez: cámara profesional, 5 cables, 3 baterías, técnico de streaming nivel 3 y 200 créditos', 2.99, 200, 'inicio', { una_vez: true }),
  prod('tarjeta_mensual', 'Tarjeta mensual', '30 días: reclama 20 créditos cada día (600 en total). No se renueva sola; si compras otra se suman 30 días', 4.99, 0, 'tarjeta'),
  prod('vip30', 'Pase VIP 30 días', 'No se renueva solo: bono diario de $150 + 10 créditos, reparaciones 30 % más baratas, 1 oferta extra al día, distintivo VIP', 9.99, 0, 'vip'),
  prod('pack_obra_s', 'Pack de obra S', 'Sede oficial: 10 h de aceleradores de obra + 12 cables, 12 placas, 12 paneles LED, 12 credenciales, 12 planos y 1 chip 4K. Contenido fijo.', 1.99, 0, 'pack_obra'),
  prod('pack_obra_m', 'Pack de obra M', 'Sede oficial: 30 h de aceleradores de obra + 32 cables, 32 placas, 32 paneles LED, 32 credenciales, 32 planos y 3 chips 4K. Contenido fijo.', 4.99, 0, 'pack_obra'),
  prod('pack_obra_l', 'Pack de obra L', 'Sede oficial: 80 h de aceleradores de obra + 70 cables, 70 placas, 70 paneles LED, 70 credenciales, 70 planos y 8 chips 4K. Contenido fijo.', 9.99, 0, 'pack_obra'),
  prod('pase_premium', 'Pase de Temporada Premium', 'Esta temporada: premio premium en los 40 niveles', 4.99, 0, 'pase'),
  prod('pase_premium_plus', 'Pase de Temporada Premium Plus', 'Todo el Pase Premium de esta temporada y 10 niveles ya desbloqueados', 9.99, 0, 'pase'),
  prod('pase_copa', 'Pase de Copa', '+5 eventos de preparación por día durante la Copa de Servidores de esta semana', 2.99, 0, 'pase_copa'),
];
const PREMIUM = [{ id: 'dron4k', nombre: 'Dron 4K', detalle: 'Tomas aéreas', creditos: 450, vip: false, tipo: 'equipo', entrega: { tipo: 'item', item: 'dron4k' } }];
const VIP = {
  ok: true, nivel: 4, insignia: 'jade',
  progreso: { puntos: 640, siguiente: 5, siguiente_puntos: 1000, faltan: 360, pct: 64 },
  intentos_extra: 1, slots_obra: 1,
  niveles: Array.from({ length: 10 }, (_, i) => ({ nivel: i + 1, puntos: [10, 100, 250, 500, 1000, 2000, 4000, 7000, 12000, 20000][i], insignia: 'x', intentos_extra: i >= 2 ? 1 : 0, intento_nuevo: i === 2, slots_obra: i >= 4 ? 2 : 1, slot_nuevo: i === 4, mensual: [{ tipo: 'dinero', cantidad: 300 }] })),
  mensual: { disponible: false, reclamado: true, contenido: [{ tipo: 'dinero', cantidad: 300 }], proximo: '2026-11-01' },
  regalos: [],
  ofertas: [{ id: 3, producto: 'oferta_vip_2', nombre: 'Oferta escalonada 2', detalle: '900 créditos + 3 baterías', precio: 4.99, creditos: 900, entregas: [{ tipo: 'consumible', item: 'battery', cantidad: 3 }], quedan: 2, vence: '2026-10-31T23:00:00Z' }],
  ajustes: { anonimo: false, ocultar_mecenas: false },
};
const PASE = {
  ok: true, ahora: 1792800000, temporada: { numero: 1, tema: 'calaveras', icono: '💀', nombre: 'Temporada 1 · Noche de Calaveras', nombre_tema: 'Noche de Calaveras', inicio: '2026-10-19', fin: '2026-11-16', quedan_seg: 2000000 },
  nivel: 6, niveles: 40, xp: 2400, xp_nivel: 120, xp_por_nivel: 400, premium: false, plus: false,
  pistas: { gratis: [], premium: [] }, por_reclamar: { gratis: 0, premium: 0, total: 0, premium_esperando: 3 }, creditos_dados: 0, creditos_tope: 420,
  saltos: { usados: 0, max: 10, precio: 150, max_ahora: 10 }, xp_hoy: 120, xp_tope_dia: 700, xp_fuentes: {},
  misiones: { diarias: [], diarias_fin: '2026-10-24T05:00:00Z', semanales: [], semanales_fin: '2026-10-26T05:00:00Z' },
  productos: { pase_premium: { id: 'pase_premium', precio: 4.99, activo: true, plus: false, niveles: 0 }, pase_premium_plus: { id: 'pase_premium_plus', precio: 9.99, activo: true, plus: true, niveles: 10 } },
  gracia_dias: 3, anterior: null,
};
const ESTRELLAS = {
  ok: true, catalogo: [], contratos: [], asignadas: { copa: [], duelo: [] }, fichas: 4, fichas_hoy: 2, fichas_dia: 12, creditos: 1340, bono: { copa: 0, duelo: 0 },
  pase_copa: { semana: '2026-W43', fase: 'preparacion', activo: false, extra: 5, precio_creditos: 300, precio_usd: 2.99, producto: 'pase_copa', puede_comprar: true, intentos_base: 10, intentos_max: 15, vip_extra: 0, tope: 18 },
  copa: { semana: '2026-W43', fase: 'preparacion', activa: true }, reglas: { max_por_equipo: 1 },
};
// Google Play: precios en otra moneda (así se ve que salen de Play y no del servidor). oferta_vip_2 y pack_obra_l NO están en Play.
const PLAY = { creditos_250: '2.49', creditos_700: '5.99', creditos_1500: '11.99', creditos_3200: '23.99', inicio: '3.49', bienvenida: '1.29', vip30: '11.99',
  tarjeta_mensual: '5.99', pack_obra_s: '2.49', pack_obra_m: '5.99', pase_premium: '5.99', pase_premium_plus: '11.99', pase_copa: '3.49' };

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
  const srv = { ordenes: [], pedidas: {} };
  const estado = () => {
    const e = { ok: true, tienda: { productos: caso.productos || PRODUCTOS, premium: PREMIUM }, logueado: caso.logueado !== false, entregas: [], inventario: [],
      plux: { disponible: true, ambiente: 'produccion' }, inicio_comprado: !!caso.inicioComprado };
    if (e.logueado) Object.assign(e, { jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: 1340, vip_activo: false, vip_nivel: 4, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' } });
    return e;
  };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      srv.pedidas[u.pathname] = (srv.pedidas[u.pathname] || 0) + 1;
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/vip') return json(200, VIP);
      if (u.pathname === '/api/mecenas') return json(200, { ok: true, lista_semana: [], lista_siempre: [], yo: {}, oculto: false });
      if (u.pathname === '/api/pase') return json(200, PASE);
      if (u.pathname === '/api/estrellas') return json(200, ESTRELLAS);
      if (u.pathname === '/api/orden') {
        let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) { b = null; }
        srv.ordenes.push(b && b.producto);
        return json(200, { ok: true, url: BASE + '/pago-prueba.html' });
      }
      // El resto de módulos (sede, copa, servidores...): "no existe" en este servidor de prueba
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
  if (caso.idioma) await page.addInitScript((c) => { try { localStorage.setItem('envivo_lang', c); } catch (e) { /* nada */ } }, caso.idioma);
  await page.goto(BASE + '/' + (caso.query || ''), { waitUntil: 'domcontentloaded' });
  // Bienvenida (intro del capítulo) y, en fechas de temporada (Halloween, Navidad…), el resumen del día
  try { await page.waitForSelector('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"]', { timeout: 4000 }); } catch (e) { /* sin bienvenida */ }
  for (let k = 0; k < 5; k++) {
    const b = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
    if (!(await b.count())) break;
    await b.first().click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 8000 });
  return { ctx, page, errores, srv };
}

async function irTienda(page) {
  await page.click('nav button[data-tab="tienda"]');
  await page.waitForSelector('#tab-tienda .tv-trust', { timeout: 8000 });
  await page.waitForTimeout(700);   // datos del VIP / Google Play que llegan después
}
async function revisar(o, nombre) {
  const r = await o.page.evaluate(() => {
    const t = document.getElementById('tab-tienda');
    const ancho = window.innerWidth;
    const fuera = [...t.querySelectorAll('*')].filter((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || el.closest('.catrow')) return false;   // la fila de atajos se desliza a propósito
      return b.right > ancho + 0.5 || b.left < -0.5;
    }).map((el) => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName);
    const txt = t.innerText;
    // Cada botón de compra tiene su precio al lado (en su tarjeta) o en el mismo botón
    const sinPrecio = [...t.querySelectorAll('[data-act="comprar"]')].filter((b) => {
      const card = b.closest('.card');
      const p = card && card.querySelector('.price');
      return !(p && p.textContent.trim()) && !/\d/.test(b.textContent);
    }).map((b) => b.dataset.k);
    return { scroll: document.documentElement.scrollWidth - ancho, fuera: fuera.slice(0, 6), txt, sinPrecio,
      claves: (txt.match(/\b(tienda|online)\.[a-z_.]+\b/g) || []), marcas: (txt.match(/\{\w+\}/g) || []) };
  });
  bien(r.scroll <= 0 && !r.fuera.length, `${nombre}: sin desborde horizontal a 360px` + (r.scroll > 0 ? ` (scroll ${r.scroll}px)` : '') + (r.fuera.length ? ' fuera: ' + r.fuera.join(', ') : ''));
  bien(!r.sinPrecio.length, `${nombre}: cada botón de compra muestra su precio real` + (r.sinPrecio.length ? ' → sin precio: ' + r.sinPrecio.join(', ') : ''));
  bien(!/aleatori|al azar|probabilidad|suerte|random|chance/i.test(r.txt), `${nombre}: ningún texto de premios al azar`);
  bien(!r.claves.length && !r.marcas.length, `${nombre}: sin claves sin traducir ni {marcadores}` + (r.claves.length ? ' ' + r.claves.join(',') : '') + (r.marcas.length ? ' ' + r.marcas.join(',') : ''));
  return r;
}
async function foto(page, nombre) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'tienda_v2_' + nombre + '.png'), fullPage: true });
}
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  await o.ctx.close();
}

(async () => {
  console.log('Módulos cargados en index.html: ' + (presentes.length ? presentes.join(', ') : 'ninguno'));
  const browser = await chromium.launch();
  try {
    /* ---------- 1) Web con cuenta ---------- */
    {
      const o = await abrir(browser, { nombre: 'web' });
      await irTienda(o.page);
      const r = await revisar(o, 'Web');
      const secs = await o.page.$$eval('#tab-tienda .tv-sec', (l) => l.map((x) => x.id));
      for (const s of ['tv-empezar', 'tv-obra', 'tv-creditos', 'tv-exclusivos']) bien(secs.includes(s), `Web: sección ${s}`);
      if (presentes.includes('js/pase.js')) bien(secs.includes('tv-pase'), 'Web: sección Pase de Temporada (js/pase.js)');
      if (presentes.includes('js/vip.js')) {
        bien(secs.includes('tv-vip'), 'Web: sección VIP');
        const v = await o.page.$eval('#tv-vip .tv-vipcard', (el) => ({ n: el.dataset.vipNivel, bar: (el.querySelector('.tv-bar i') || {}).style ? el.querySelector('.tv-bar i').style.width : '', t: el.innerText })).catch(() => null);
        bien(v && v.n === '4' && v.bar === '64%', 'Web: VIP muestra tu nivel (4) y el avance (64 %)' + (v ? ` [${v.n}, ${v.bar}]` : ''));
        bien(/360/.test(v ? v.t : ''), 'Web: VIP dice cuántos puntos faltan');
        const of = await o.page.$eval('#tv-vip [data-prod="oferta_vip_2"]', (el) => el.innerText).catch(() => '');
        bien(/900/.test(of) && /\$4,99/.test(of) && /2/.test(of), 'Web: oferta VIP con contenido, precio y compras que quedan');
      }
      if (presentes.includes('js/estrellas.js')) {
        bien(secs.includes('tv-copa'), 'Web: sección Copa y Duelos (personal estrella y Pase de Copa)');
        const c = await o.page.$eval('#tv-copa', (el) => el.innerText).catch(() => '');
        bien(/\$2,99/.test(c) && /300/.test(c), 'Web: Pase de Copa con su precio en dinero y en créditos');
      }
      // Packs de obra: contenido fijo completo
      const s = await o.page.$eval('#tv-obra [data-prod="pack_obra_s"]', (el) => el.innerText).catch(() => '');
      bien(/10 h/.test(s) && /12\s*Cables/.test(s) && /1\s*Chips/.test(s) && /\$1,99/.test(s), 'Web: Pack de obra S muestra 10 h, materiales exactos y $1,99');
      bien(!/Plux/.test(r.txt) || /Pago Plux/.test(r.txt), 'Web: el pago con tarjeta se explica (Pago Plux)');
      const c7 = await o.page.$eval('[data-prod="creditos_700"]', (el) => el.innerText).catch(() => '');
      bien(/\+20/.test(c7) && /30/.test(c7), 'Web: la oferta por tiempo dice el % y la fecha real en que termina');
      bien(!/\d{1,2}:\d{2}:\d{2}/.test(r.txt), 'Web: sin cuentas regresivas');
      await foto(o.page, 'web');
      // Atajo a una sección
      await o.page.evaluate(() => window.scrollTo(0, 0));
      await o.page.click('.tv-nav [data-k="tv-creditos"]');
      await o.page.waitForTimeout(900);
      const y = await o.page.$eval('#tv-creditos', (el) => el.getBoundingClientRect().top);
      bien(y >= 0 && y < 300, `Web: el atajo "Créditos" lleva a su sección (top ${Math.round(y)}px)`);
      await o.page.screenshot({ path: path.join(OUT, 'tienda_v2_web_creditos.png') });
      // Abrir el VIP y el pase desde la tienda
      if (presentes.includes('js/vip.js')) {
        await o.page.click('#tv-vip .tv-vipcard .btn');
        await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 5000 }).catch(() => null);
        bien(!!(await o.page.$('#overlay.on [data-vip="modal"]')), 'Web: "Ventajas" abre la ventana del VIP');
        await o.page.waitForSelector('#overlay.on [data-vip="oferta"]', { timeout: 4000 }).catch(() => null);
        const ob = await o.page.$eval('#overlay.on [data-vip="oferta"] [data-act="comprar"]', (el) => el.textContent).catch(() => '');
        bien(/\$4,99/.test(ob), 'Web: la ventana VIP vende la oferta con su precio real (' + ob.trim() + ')');
        await o.page.click('#overlay.on [data-act="close"]');
      }
      if (presentes.includes('js/pase.js')) {
        await o.page.click('#tv-pase [data-ext="pase"][data-acc="abrir"]');
        await o.page.waitForSelector('#pase-ov', { timeout: 5000 }).catch(() => null);
        bien(!!(await o.page.$('#pase-ov')), 'Web: la ficha del pase abre su pantalla');
        await o.page.screenshot({ path: path.join(OUT, 'tienda_v2_web_pase.png') });
        await o.page.evaluate(() => { try { window.Pase.cerrar(); } catch (e) { /* nada */ } });
      }
      // Comprar un pack de obra: pide la orden y va al pago
      await o.page.click('[data-prod="pack_obra_m"] [data-act="comprar"]');
      await o.page.waitForURL(/pago-prueba/, { timeout: 8000 }).catch(() => null);
      bien(o.srv.ordenes.includes('pack_obra_m'), 'Web: Comprar el Pack de obra M pide POST /api/orden {producto: pack_obra_m} y abre el pago');
      await cerrar(o, 'Web');
    }

    /* ---------- 2) En la app de Google Play ---------- */
    {
      const o = await abrir(browser, { nombre: 'app', query: '?origen=android', play: PLAY });
      await o.page.waitForFunction(() => document.querySelector('nav button[data-tab="tienda"]'));
      await irTienda(o.page);
      await o.page.waitForFunction(() => document.querySelector('#tab-tienda [data-prod="creditos_250"] .price'), null, { timeout: 8000 }).catch(() => null);
      const r = await revisar(o, 'App');
      bien(!/plux/i.test(r.txt), 'App: no aparece Pago Plux');
      const dolares = (r.txt.match(/[^\n]{0,30}\$\s?\d+[.,]\d\d[^\n]{0,10}/g) || []);
      bien(!dolares.length, 'App: ningún precio en dólares del servidor (solo los de Google Play)' + (dolares.length ? ' → ' + dolares.join(' | ') : ''));
      const precios = await o.page.$$eval('#tab-tienda .price[data-precio]', (l) => l.map((x) => [x.dataset.precio, x.textContent.trim()]));
      bien(precios.length >= 8 && precios.every(([, t]) => /€|EUR/.test(t)), `App: ${precios.length} precios, todos de Google Play (EUR)`);
      bien(!precios.some(([id]) => id === 'pack_obra_l' || id === 'oferta_vip_2'), 'App: lo que Google Play no tiene (Pack L, oferta VIP) no se vende');
      bien(!(await o.page.$('#tab-tienda [data-prod="pack_obra_l"]')), 'App: el Pack de obra L no aparece');
      await foto(o.page, 'app');
      await o.page.click('[data-prod="creditos_700"] [data-act="comprar"]');
      await o.page.waitForTimeout(500);
      const pagos = await o.page.evaluate(() => window.__gp.pagos);
      bien(pagos.includes('creditos_700'), 'App: Comprar abre el pago de Google Play con el sku creditos_700');
      bien(!o.srv.ordenes.length, 'App: nunca pide /api/orden (Plux)');
      if (presentes.includes('js/estrellas.js')) {
        bien(!!(await o.page.$('#tv-copa [data-act="comprar"][data-k="pase_copa"]')), 'App: el Pase de Copa se compra desde la Tienda con el precio de Google Play');
        await o.page.click('#tv-copa [data-act="tienda-estrellas"]');
        await o.page.waitForTimeout(900);
        const t = await o.page.$eval('#online-cont', (el) => el.innerText).catch(() => '');
        bien(t.length > 0 && !/\$\s?\d+[.,]\d\d|US\$/.test(t), 'App: la pantalla de Estrellas no muestra precios en dólares del servidor');
        const bd = await o.page.$eval('#online-cont [data-est="pase_dinero"]', (el) => el.textContent).catch(() => '');
        bien(/3[.,]49/.test(bd) && /€|EUR/.test(bd), 'App: Estrellas tiene su botón de compra del Pase de Copa con el precio de Google Play (' + bd.trim() + ')');
      }
      // Pase y VIP: sus pantallas también muestran solo precios de Google Play (y nada que Play no venda)
      if (presentes.includes('js/pase.js')) {
        await o.page.click('nav button[data-tab="tienda"]');
        await o.page.waitForSelector('#tv-pase [data-ext="pase"][data-acc="abrir"]', { timeout: 5000 });
        await o.page.click('#tv-pase [data-ext="pase"][data-acc="abrir"]');
        await o.page.waitForSelector('#pase-ov [data-pase-comprar]', { timeout: 6000 }).catch(() => null);
        const bs = await o.page.$$eval('#pase-ov [data-pase-comprar]', (l) => l.map((b) => b.textContent));
        bien(bs.length === 2 && bs.every((x) => /€|EUR/.test(x) && !/\$/.test(x)), 'App: el pase muestra sus 2 botones con precio de Google Play (' + bs.map((x) => x.trim().slice(0, 30)).join(' | ') + ')');
        await o.page.evaluate(() => { try { window.Pase.cerrar(); } catch (e) { /* nada */ } });
      }
      if (presentes.includes('js/vip.js')) {
        await o.page.click('#tv-vip .tv-vipcard .btn');
        await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 5000 }).catch(() => null);
        const m = await o.page.$eval('#overlay.on [data-vip="modal"]', (el) => el.innerText).catch(() => '');
        bien(m && !/\$\s?\d+[.,]\d\d/.test(m) && !(await o.page.$('#overlay.on [data-vip="oferta"]')), 'App: la ventana VIP no vende la oferta que Google Play no tiene ni muestra dólares');
        await o.page.click('#overlay.on [data-act="close"]');
      }
      await cerrar(o, 'App');
    }

    /* ---------- 3) Sin cuenta ---------- */
    {
      const o = await abrir(browser, { nombre: 'sin_cuenta', logueado: false });
      await irTienda(o.page);
      await revisar(o, 'Sin cuenta');
      bien(!!(await o.page.$('#tab-tienda [data-act="cuenta"][data-modo="registro"]')), 'Sin cuenta: invita a crear la cuenta');
      bien(!(await o.page.$('#tv-vip .tv-vipcard')) && !(await o.page.$('#tv-copa')), 'Sin cuenta: sin nivel VIP ni estrellas (necesitan sesión)');
      await foto(o.page, 'sin_cuenta');
      await o.page.click('[data-prod="creditos_250"] [data-act="comprar"]');
      await o.page.waitForSelector('#overlay.on #formCuenta', { timeout: 4000 }).catch(() => null);
      bien(!!(await o.page.$('#overlay.on #formCuenta')), 'Sin cuenta: Comprar pide crear la cuenta primero');
      await cerrar(o, 'Sin cuenta');
    }

    /* ---------- 4) Sin los módulos (vip/pase/estrellas no cargan) ---------- */
    {
      const o = await abrir(browser, { nombre: 'sin_modulos', sinModulos: MODULOS, productos: PRODUCTOS.filter((p) => !/^pase|^pack_obra/.test(p.id)) });
      await irTienda(o.page);
      await revisar(o, 'Sin módulos');
      const secs = await o.page.$$eval('#tab-tienda .tv-sec', (l) => l.map((x) => x.id));
      bien(!secs.includes('tv-pase') && !secs.includes('tv-copa') && !secs.includes('tv-obra'), 'Sin módulos: no salen Pase, Copa ni Obra (' + secs.join(', ') + ')');
      bien(secs.includes('tv-creditos') && secs.includes('tv-vip'), 'Sin módulos: créditos y Pase VIP 30 días siguen a la venta');
      await o.page.click('nav button[data-tab="online"]');
      await o.page.waitForSelector('#tab-online .onl-grid');
      bien(!(await o.page.$('#tab-online [data-act="online"][data-k="estrellas"]')), 'Sin módulos: En línea no muestra Estrellas');
      await foto(o.page, 'sin_modulos');
      await cerrar(o, 'Sin módulos');
    }

    /* ---------- 5) En línea: Estrellas en el hub ---------- */
    if (presentes.includes('js/estrellas.js')) {
      const o = await abrir(browser, { nombre: 'online' });
      await o.page.click('nav button[data-tab="online"]');
      await o.page.waitForSelector('#tab-online .onl-grid');
      const hay = await o.page.evaluate(() => !!(window.Estrellas && typeof window.Estrellas.render === 'function'));
      const tile = await o.page.$('#tab-online [data-act="online"][data-k="estrellas"]');
      bien(hay ? !!tile : !tile, 'En línea: la ficha Estrellas sale solo si el módulo tiene render()');
      if (tile) {
        await tile.click();
        await o.page.waitForTimeout(800);
        bien(!!(await o.page.$('#tab-online #online-cont')) && (await o.page.$eval('#online-cont', (el) => el.innerText.trim().length)) > 0, 'En línea: Estrellas se pinta en su pestaña');
        await o.page.screenshot({ path: path.join(OUT, 'tienda_v2_online_estrellas.png') });
        // Desde la tienda, "Ver estrellas" abre lo mismo
        await o.page.click('nav button[data-tab="tienda"]');
        await o.page.waitForSelector('#tv-copa [data-act="tienda-estrellas"]', { timeout: 5000 });
        await o.page.click('#tv-copa [data-act="tienda-estrellas"]');
        await o.page.waitForTimeout(500);
        bien(await o.page.evaluate(() => document.getElementById('tab-online').classList.contains('on') && !!document.getElementById('online-cont')), 'Tienda: "Ver estrellas" abre Estrellas en En línea');
      }
      await cerrar(o, 'En línea');
    }

    /* ---------- 6) En inglés ---------- */
    {
      const o = await abrir(browser, { nombre: 'en', idioma: 'en', locale: 'en-US' });
      await o.page.waitForFunction(() => window.I18N && window.I18N.idioma === 'en', null, { timeout: 8000 }).catch(() => null);
      await irTienda(o.page);
      const r = await revisar(o, 'Inglés');
      bien(/No loot boxes/.test(r.txt) && /Build pack/.test(r.txt), 'Inglés: textos de la tienda traducidos');
      await foto(o.page, 'en');
      await cerrar(o, 'Inglés');
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
