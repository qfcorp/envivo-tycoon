/* Prueba de la app de iPhone (js/ios.js, regla de Apple 3.1.1) dentro del juego real en un celular de 360x780 con Playwright.
   El servidor se imita aquí (mismo montaje que tests/test_tienda_v2.js). Casos:
     ios_ua     – User-Agent con «TukanIOS»: <html class="tukan-ios">; en la Tienda (todas sus sub-pestañas), el VIP y el Pase no hay
                  ningún precio en dólares, botón de comprar o suscribirse, Pago Plux, PayPal ni Google Play, ni «dónde pagar»;
                  lo que se canjea con créditos (Exclusivos) sí sigue; nunca se pide /api/orden.
     ios_origen – sin User-Agent, abriendo con ?origen=ios: igual, y queda guardado (localStorage) al volver a abrir sin el parámetro.
     ios_sin_servidor – iPhone sin conexión con el servidor: el aviso no dice «compra en juego.tukanec.com».
     web        – sin TukanIOS todo sigue igual: precios, botones de comprar y Pago Plux; sin la clase tukan-ios.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_iphone.js   (capturas en tests/capturas/iphone_*.png) */
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
  prod('vip30', 'Pase VIP 30 días', 'No se renueva solo. Según tu nivel VIP: 4 o 5 eventos por día, reparaciones 30 a 50 % más baratas, obras de la sede 10 a 30 % más rápidas, bono diario (dinero, créditos, cables y baterías), 1 oferta extra al día y distintivo VIP. Lo que compras con créditos funciona siempre, con o sin el Pase', 9.99, 0, 'vip'),
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
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: caso.locale || 'es-EC' }, caso.ua ? { userAgent: caso.ua } : {}));
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
      if (caso.sinServidor) return route.abort();
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
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  return { ctx, page, errores, srv };
}

async function irTienda(page) {
  await page.click('nav button[data-tab="tienda"]');
  await page.waitForSelector('#tab-tienda .tv-trust', { timeout: 8000 });
  await page.waitForTimeout(700);   // datos del VIP / Google Play que llegan después
}
// Navegación v2: la tienda va por sub-pestañas (Ofertas, Créditos, VIP, Pase); cada sección vive en una
const GRUPO = { 'tv-empezar': 'ofertas', 'tv-obra': 'ofertas', 'tv-crecer': 'ofertas', 'tv-creditos': 'creditos', 'tv-exclusivos': 'creditos', 'tv-vip': 'vip', 'tv-pase': 'pase', 'tv-copa': 'pase' };
async function subT(page, k) { const b = page.locator(`#tab-tienda .subnav [data-act="sub"][data-k="${k}"]`); if (await b.count()) { await b.click(); await page.waitForTimeout(350); } }
const irSec = (page, id) => subT(page, GRUPO[id] || 'ofertas');
const subsT = (page) => page.$$eval('#tab-tienda .subnav [data-act="sub"]', (l) => l.map((b) => b.dataset.k));
// Junta lo que da fn(k) en cada sub-pestaña
async function enTodas(page, fn) { const out = []; const ks = await subsT(page); for (const k of ks.length ? ks : [null]) { if (k) await subT(page, k); out.push(...(await fn(k))); } return out; }
const seccionesT = (page) => enTodas(page, () => page.$$eval('#tab-tienda .tv-sec', (l) => l.map((x) => x.id)));
async function revisarTodas(o, nombre) { const rs = await enTodas(o.page, async (k) => [await revisar(o, nombre + (k ? ' · ' + k : ''))]); return { txt: rs.map((x) => x.txt).join('\n') }; }
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

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TukanIOS/1.0.0';
const DINERO = /\$\s?\d|US\$|USD|€|\bEUR\b/;
// En las ventanas del VIP y del Pase hay dinero DEL JUEGO («$300 para tu productora», sin centavos): eso sí puede salir
const DINERO_REAL = /\$\s?\d+[.,]\d\d(?!\d)|US\$|\bUSD\b|€|\bEUR\b|\$1 en la tienda/;
const PAGOS = /Plux|PayPal|Google Play|juego\.tukanec\.com|tarjeta de crédito|Pagar con/i;
async function foto(page, nombre) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'iphone_' + nombre + '.png'), fullPage: true });
}
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  await o.ctx.close();
}
// Revisa la Tienda entera (todas las sub-pestañas) en el iPhone
async function tiendaSinDinero(o, nombre) {
  await irTienda(o.page);
  await o.page.waitForTimeout(800);
  const datos = await enTodas(o.page, async (k) => [await o.page.evaluate(() => {
    const t = document.getElementById('tab-tienda');
    return { txt: t.innerText, comprar: t.querySelectorAll('[data-act="comprar"], [data-pase-comprar], [data-est="pase_dinero"]').length,
      precios: t.querySelectorAll('.price').length, canjear: t.querySelectorAll('[data-act="canjear"]').length };
  })]);
  const txt = datos.map((d) => d.txt).join('\n');
  const dinero = (txt.match(new RegExp('[^\n]{0,30}(' + DINERO.source + ')[^\n]{0,20}', 'g')) || []);
  bien(!dinero.length, `${nombre}: la Tienda no muestra ningún precio en dinero real` + (dinero.length ? ' → ' + dinero.slice(0, 4).join(' | ') : ''));
  bien(datos.every((d) => !d.comprar && !d.precios), `${nombre}: ningún botón de comprar/suscribirse ni precio (.price)` + ` [${datos.map((d) => d.comprar + '/' + d.precios).join(' ')}]`);
  const pagos = txt.match(PAGOS);
  bien(!pagos, `${nombre}: sin Pago Plux, PayPal, Google Play ni «dónde pagar»` + (pagos ? ' → ' + pagos[0] : ''));
  bien(!/antes de comprar|para comprar créditos/i.test(txt), `${nombre}: sin avisos de compra con dinero real`);
  bien(datos.some((d) => d.canjear > 0), `${nombre}: lo que se canjea con créditos (Exclusivos) sí sigue`);
  return txt;
}

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------- 1) iPhone por User-Agent ---------- */
    {
      const o = await abrir(browser, { nombre: 'ios_ua', ua: UA_IOS });
      bien(await o.page.evaluate(() => document.documentElement.classList.contains('tukan-ios') && window.TukanIOS.activo()), 'iPhone (User-Agent): <html class="tukan-ios"> y TukanIOS.activo()');
      bien(await o.page.evaluate(() => !window.GooglePlay || !window.GooglePlay.enApp()), 'iPhone: nunca se toma como la app de Google Play');
      await tiendaSinDinero(o, 'iPhone (User-Agent)');
      await foto(o.page, 'tienda');
      if (presentes.includes('js/vip.js')) {
        await irSec(o.page, 'tv-vip');
        const card = await o.page.$eval('#tv-vip', (el) => el.innerText).catch(() => '');
        bien(card && !DINERO.test(card) && !/\$1/.test(card), 'iPhone: la tarjeta VIP no dice «$1 en la tienda = 10 puntos»');
        const b = await o.page.$('#tv-vip .tv-vipcard .btn');
        if (b) {
          await b.click();
          await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 5000 }).catch(() => null);
          await o.page.waitForTimeout(600);
          const m = await o.page.$eval('#overlay.on', (el) => ({ t: el.innerText, c: el.querySelectorAll('[data-act="comprar"]').length, of: el.querySelectorAll('[data-vip="oferta"]').length })).catch(() => ({ t: '', c: -1, of: -1 }));
          bien(m.t && !DINERO_REAL.test(m.t) && !PAGOS.test(m.t) && !m.c && !m.of, 'iPhone: la ventana VIP sin precios en dinero real, ofertas ni botones de comprar' + (DINERO_REAL.test(m.t) ? ' → ' + (m.t.match(DINERO_REAL) || [''])[0] : ''));
          await o.page.click('#overlay.on [data-act="close"]').catch(() => {});
        }
      }
      if (presentes.includes('js/pase.js')) {
        await irSec(o.page, 'tv-pase');
        const ab = await o.page.$('#tv-pase [data-ext="pase"][data-acc="abrir"]');
        if (ab) {
          await ab.click();
          await o.page.waitForSelector('#pase-ov', { timeout: 6000 }).catch(() => null);
          await o.page.waitForTimeout(600);
          const p = await o.page.$eval('#pase-ov', (el) => ({ t: el.innerText, c: el.querySelectorAll('[data-pase-comprar]').length })).catch(() => ({ t: '', c: -1 }));
          bien(p.t && !p.c && !DINERO_REAL.test(p.t), 'iPhone: la pantalla del Pase sin botones de comprar el premium ni precios');
          await o.page.evaluate(() => { try { window.Pase.cerrar(); } catch (e) { /* nada */ } });
        }
      }
      if (presentes.includes('js/estrellas.js')) {
        await o.page.click('nav button[data-tab="tienda"]');
        await irSec(o.page, 'tv-copa');
        const c = await o.page.$eval('#tv-copa', (el) => el.innerText).catch(() => '');
        bien(c && /300/.test(c) && !DINERO.test(c), 'iPhone: el Pase de Copa se ve solo con su precio en créditos');
      }
      bien(!o.srv.ordenes.length, 'iPhone: nunca se pidió /api/orden');
      await cerrar(o, 'iPhone (User-Agent)');
    }

    /* ---------- 2) iPhone por ?origen=ios (y queda guardado) ---------- */
    {
      const o = await abrir(browser, { nombre: 'ios_origen', query: '?origen=ios' });
      bien(await o.page.evaluate(() => document.documentElement.classList.contains('tukan-ios') && localStorage.getItem('envivo_canal') === 'ios'), '?origen=ios: clase tukan-ios y queda guardado en localStorage');
      await tiendaSinDinero(o, '?origen=ios');
      await o.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await o.page.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
      bien(await o.page.evaluate(() => document.documentElement.classList.contains('tukan-ios')), '?origen=ios: al volver a abrir sin el parámetro sigue en modo iPhone');
      await o.page.goto(BASE + '/?origen=web', { waitUntil: 'domcontentloaded' });
      bien(await o.page.evaluate(() => !document.documentElement.classList.contains('tukan-ios') && localStorage.getItem('envivo_canal') === null), '?origen=web lo quita');
      await cerrar(o, '?origen=ios');
    }

    /* ---------- 3) iPhone sin servidor ---------- */
    {
      const o = await abrir(browser, { nombre: 'ios_sin_servidor', ua: UA_IOS, sinServidor: true });
      await o.page.click('nav button[data-tab="tienda"]');
      await o.page.waitForTimeout(600);
      const t = await o.page.$eval('#tab-tienda', (el) => el.innerText).catch(() => '');
      bien(t && !/juego\.tukanec\.com/.test(t) && !/comprar/i.test(t), 'iPhone sin conexión: el aviso no dice dónde comprar');
      await cerrar(o, 'iPhone sin servidor');
    }

    /* ---------- 4) Web (sin TukanIOS): todo igual ---------- */
    {
      const o = await abrir(browser, { nombre: 'web' });
      bien(await o.page.evaluate(() => !document.documentElement.classList.contains('tukan-ios') && !window.TukanIOS.activo()), 'Web: sin la clase tukan-ios');
      await irTienda(o.page);
      await irSec(o.page, 'tv-creditos');
      const c = await o.page.$eval('#tab-tienda', (el) => ({ t: el.innerText, b: el.querySelectorAll('[data-act="comprar"]').length })).catch(() => ({ t: '', b: 0 }));
      bien(c.b > 0 && /\$\s?\d/.test(c.t), 'Web: la Tienda sigue con precios y botones de comprar');
      bien(/Pago Plux/.test(c.t), 'Web: sigue explicando el pago con tarjeta (Pago Plux)');
      await o.page.click('[data-prod="creditos_250"] [data-act="comprar"]');
      await o.page.waitForURL(/pago-prueba/, { timeout: 8000 }).catch(() => null);
      bien(o.srv.ordenes.includes('creditos_250'), 'Web: Comprar sigue pidiendo POST /api/orden');
      await cerrar(o, 'Web');
    }
  } catch (e) {
    fallas++;
    console.error('❌ Error en la prueba:', e);
  } finally {
    await browser.close();
  }
  console.log(`\nApp de iPhone: ${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
