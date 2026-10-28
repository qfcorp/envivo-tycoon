/* Prueba de la navegación v2 (js/ui.js): sub-pestañas fijas arriba en cada pestaña en vez de listas largas, filtros,
   búsqueda en la tienda de equipos, enlaces de otros módulos que llegan a la sección correcta y la preparación por
   pasos (Personal → Equipos → Cámaras → Resumen) con la barra fija de abajo ("¡Salir al aire!").
   Celular simulado de 390x844 y 360x780, fecha fija (window.__ENVIVO_FECHA = '2026-06-10'), con cuenta (servidor imitado).
     1. Cada pestaña: sus sub-pestañas cambian la sección que se ve; la barra de arriba queda visible al bajar (sticky).
     2. Filtros y orden: Clientes (orden), Personal (puesto), Bodega (Por reparar, búsqueda, categorías), sin errores.
     3. La última sub-pestaña se recuerda al recargar.
     4. Enlaces: ir-danos → Bodega · Mis equipos con "Por reparar"; ir-bodega (Ver X en la Bodega) → Tienda con la tarjeta
        resaltada; ir-personal → Contratar; ir-pase-vip → Tienda · VIP; atajo tienda-ir; créditos de arriba → Créditos;
        la sede (hub de Inicio) → Bodega; js/movilizacion.js (EnVivoIr) → Tienda · Vehículos.
     5. Preparación: los 4 pasos se recorren con "Siguiente", la barra de arriba y la de abajo se ven en todos y
        "¡Salir al aire!" lleva al evento en vivo.
   En todo: sin errores de JS, sin desplazamiento horizontal, botones de al menos 44 px de alto.
   Capturas: tests/capturas/nav2_*.png (390x844).
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_navegacion_v2.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo-nav.test';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Partida a mitad de juego, armada con la lógica real ---------- */
function armarPartida() {
  globalThis.window = globalThis;
  require(path.join(RAIZ, 'js/datos.js'));
  const G = require(path.join(RAIZ, 'js/logic.js')) || globalThis.Game;
  const s = G.newGame(7);
  Object.assign(s, { day: 14, chapter: 2, chapterSeen: 2, money: 60000, rep: 45 });
  s.stats.events = 14;
  ['cam_basic', 'cam_basic', 'cam_pro', 'audio_basic', 'switch_basic', 'mics', 'encoder', 'router4g', 'raincover', 'ups'].forEach((k) => { if (G.CATALOG[k]) G.buy(s, k); });
  for (let i = 0; i < 4 && s.candidates.length; i++) G.hire(s, s.candidates[0].id);
  for (let i = 0; i < 2; i++) G.searchStaff(s);
  s.equip[0].condition = 22;   // una cámara para reparar
  s.equip[2].condition = 35;
  s.stock.cable = 2; s.stock.battery = 1;
  s.money = 60000;
  s.contracts.forEach((c, i) => { c.daysLeft = 6 - i; });
  return { G, s };
}

/* ---------- Servidor imitado (con cuenta) ---------- */
const prod = (id, nombre, detalle, precio, creditos, tipo, extra) => Object.assign({ id, nombre, detalle, precio, creditos, una_vez: false, tipo, precio_base: precio, creditos_base: creditos, oferta: null }, extra || {});
const PRODUCTOS = [
  prod('creditos_250', '250 créditos', 'Paquete de 250 créditos', 1.99, 250, 'creditos'),
  prod('creditos_700', '700 créditos', '700 créditos (+40 % extra)', 4.99, 700, 'creditos'),
  prod('creditos_1500', '1.500 créditos', '1.500 créditos (+50 % extra)', 9.99, 1500, 'creditos'),
  prod('creditos_3200', '3.200 créditos', '3.200 créditos (+60 % extra)', 19.99, 3200, 'creditos'),
  prod('bienvenida', 'Oferta de bienvenida', 'Una sola vez: 150 créditos, un camarógrafo senior de refuerzo por 3 eventos y 3 cables', 0.99, 150, 'bienvenida', { una_vez: true }),
  prod('inicio', 'Paquete de inicio', 'Una sola vez: cámara profesional, 5 cables, 3 baterías, técnico de streaming nivel 3 y 200 créditos', 2.99, 200, 'inicio', { una_vez: true }),
  prod('vip30', 'Pase VIP 30 días', 'No se renueva solo. 4 o 5 eventos por día, reparaciones más baratas y bono diario.', 9.99, 0, 'vip'),
  prod('pack_obra_s', 'Pack de obra S', 'Sede oficial: 10 h de aceleradores de obra + materiales. Contenido fijo.', 1.99, 0, 'pack_obra'),
  prod('pase_premium', 'Pase de Temporada Premium', 'Esta temporada: premio premium en los 40 niveles', 4.99, 0, 'pase'),
  prod('pase_copa', 'Pase de Copa', '+5 eventos de preparación por día durante la Copa de Servidores de esta semana', 2.99, 0, 'pase_copa'),
];
const PREMIUM = [{ id: 'dron4k', nombre: 'Dron 4K', detalle: 'Tomas aéreas', creditos: 450, vip: false, tipo: 'equipo', entrega: { tipo: 'item', item: 'dron4k' } }];
const estado = () => ({ ok: true, tienda: { productos: PRODUCTOS, premium: PREMIUM }, logueado: true, entregas: [], inventario: [],
  plux: { disponible: true, ambiente: 'produccion' }, jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: 1340,
  vip_activo: false, vip_nivel: 2, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' },
  duelos: { restantes: 3, defensas_nuevas: 2, liga: 'Bronce' }, desafio: { jugado_hoy: false, restantes: 1, nombre: 'Final bajo la lluvia' } });

async function abrir(browser, vp, partida, extra) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vp.width === 390 ? 2 : 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
  await ctx.addInitScript((c) => {
    try {
      if (sessionStorage.getItem('__nav_init')) return;
      sessionStorage.setItem('__nav_init', '1');
      if (localStorage.getItem('envivo_tycoon_save_v1')) return;
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      ['bodega', 'personal', 'prep', 'flota', 'sede', 'tienda', 'online'].forEach((k) => localStorage.setItem('envivo_guias_v1_' + k, '1'));
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', 'es');
      localStorage.setItem('envivo_tycoon_save_v1', c.partida);
      if (c.sub) localStorage.setItem('envivo_subtab', JSON.stringify(c.sub));
    } catch (e) { /* nada */ }
  }, { partida, sub: (extra && extra.sub) || null });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push('console: ' + m.text()); });
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
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await cerrarVentanas(page);
  return { ctx, page, errores };
}
const overlayOn = (page) => page.evaluate(() => document.getElementById('overlay').classList.contains('on'));
async function cerrarVentanas(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await overlayOn(page))) return;
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="after-result"], #overlay.on [data-act="close"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function sinScroll(page, tag) { const h = await hScroll(page); bien(h <= 1, `${tag}: sin desplazamiento horizontal` + (h > 1 ? ` (${h}px)` : '')); }
async function irTab(page, t) { await page.click(`nav button[data-tab="${t}"]`); await page.waitForTimeout(200); }
async function irSub(page, t, k) { await page.click(`#tab-${t} .subnav [data-k="${k}"]`); await page.waitForTimeout(200); }
const subActual = (page, t) => page.evaluate((x) => { const p = document.querySelector('#tab-' + x + ' .subpanel'); return p ? p.dataset.sub : null; }, t);
// Barra de arriba fija: al bajar, sigue a la vista justo debajo de la cabecera
async function fija(page, t, sel) {
  const r = await page.evaluate(({ t, sel }) => {
    window.scrollTo(0, 0);
    const n = document.querySelector('#tab-' + t + ' ' + sel);
    if (!n) return { ok: false, motivo: 'no está' };
    window.scrollTo(0, 2000);
    const b = n.getBoundingClientRect(), h = document.querySelector('header').getBoundingClientRect();
    const out = { ok: b.top >= h.bottom - 16 && b.top <= h.bottom + 12 && b.height > 30, top: Math.round(b.top), hdr: Math.round(h.bottom), y: window.scrollY };
    window.scrollTo(0, 0);
    return out;
  }, { t, sel });
  bien(r.ok || r.y < 30, `${t}: la barra de arriba queda fija al bajar` + (r.ok ? '' : ` (${JSON.stringify(r)})`));
}
// Botones de la barra con al menos 44 px de alto
async function dedos(page, sel, tag) {
  const chicos = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 43.5).map((b) => (b.dataset.k || b.textContent.trim().slice(0, 12)) + ':' + Math.round(b.getBoundingClientRect().height)), sel);
  bien(!chicos.length, `${tag}: toques de 44 px o más` + (chicos.length ? ' → ' + chicos.join(', ') : ''));
}
const foto = async (page, nombre, ok) => { if (ok) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(120); await page.screenshot({ path: path.join(OUT, 'nav2_' + nombre + '.png') }); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const P = armarPartida();
  const partida = P.G.serialize(P.s);
  try {
    for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 780 }]) {
      const tag = vp.width + 'px';
      const shots = vp.width === 390;
      const o = await abrir(browser, vp, partida);
      const { page } = o;

      /* ---------- Clientes ---------- */
      await irTab(page, 'clientes');
      bien(await page.locator('#tab-clientes .subbar [data-act="mkt"]').count() === 3, `${tag} Clientes: los 3 botones para buscar clientes arriba`);
      await fija(page, 'clientes', '.subbar');
      await dedos(page, '#tab-clientes .subbar .mk-t, #tab-clientes [data-act="prep"], #tab-clientes .fchips .catchip', `${tag} Clientes`);
      const nOf = await page.locator('#tab-clientes [data-act="prep"]').count();
      if (nOf > 1) {
        await page.click('#tab-clientes [data-act="filtro"][data-f="clientesOrden"][data-k="vence"]');
        await page.waitForTimeout(150);
        const ord = await page.evaluate(() => { const S = window.__game.state; return [...document.querySelectorAll('#tab-clientes [data-act="prep"]')].map((b) => S.contracts.find((c) => c.id === Number(b.dataset.id)).daysLeft); });
        bien(ord.every((v, i) => !i || ord[i - 1] <= v), `${tag} Clientes: "Vence antes" ordena por días (${ord.join(',')})`);
        await page.click('#tab-clientes [data-act="filtro"][data-f="clientesOrden"][data-k="pago"]');
        await page.waitForTimeout(150);
        const pagos = await page.evaluate(() => { const S = window.__game.state; return [...document.querySelectorAll('#tab-clientes [data-act="prep"]')].map((b) => S.contracts.find((c) => c.id === Number(b.dataset.id)).pay); });
        bien(pagos.every((v, i) => !i || pagos[i - 1] >= v), `${tag} Clientes: "Mejor pago" primero el que más paga`);
      }
      await sinScroll(page, `${tag} Clientes`); await foto(page, 'clientes', shots);

      /* ---------- Personal ---------- */
      await irTab(page, 'personal');
      bien(await subActual(page, 'personal') === 'equipo', `${tag} Personal: abre en "Mi equipo"`);
      await fija(page, 'personal', '.subnav-w');
      await dedos(page, '#tab-personal .subnav .sn-k', `${tag} Personal sub-pestañas`);
      const cols = await page.evaluate(() => { const g = document.querySelector('#tab-personal .sgrid'); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0; });
      bien(cols === 2, `${tag} Personal: tarjetas en 2 columnas (${cols})`);
      await sinScroll(page, `${tag} Personal · Mi equipo`); await foto(page, 'personal_equipo', shots);
      // Filtro por puesto
      const fRol = page.locator('#tab-personal [data-act="filtro"][data-f="stFiltro"]:not([data-k="todo"])').first();
      if (await fRol.count()) {
        const k = await fRol.getAttribute('data-k');
        await fRol.click(); await page.waitForTimeout(150);
        const roles = await page.evaluate((r) => { const S = window.__game.state, G = window.Game; return [...document.querySelectorAll('#tab-personal .sc2 h3')].length + ':' + S.staff.filter((p) => (G.normRole ? G.normRole(p.role) : p.role) === r).length; }, k);
        const [vis, tot] = roles.split(':').map(Number);
        bien(vis === tot && vis > 0, `${tag} Personal: el filtro por puesto muestra solo ese puesto (${vis}/${tot})`);
        await page.click('#tab-personal [data-act="filtro"][data-f="stFiltro"][data-k="todo"]'); await page.waitForTimeout(120);
      }
      await irSub(page, 'personal', 'contratar');
      bien(await subActual(page, 'personal') === 'contratar' && await page.locator('#tab-personal [data-act="search-staff"]').isVisible(), `${tag} Personal: "Contratar" con la búsqueda de personal`);
      const antes = await page.evaluate(() => window.__game.state.staff.length);
      const hireB = page.locator('#tab-personal [data-act="hire"]:not([disabled])').first();
      if (await hireB.count()) {
        await hireB.click(); await page.waitForTimeout(250); await cerrarVentanas(page);
        bien(await page.evaluate(() => window.__game.state.staff.length) === antes + 1, `${tag} Personal: "Contratar" sigue funcionando`);
      }
      await sinScroll(page, `${tag} Personal · Contratar`); await foto(page, 'personal_contratar', shots);
      if (await page.locator('#tab-personal .subnav [data-k="capacitar"]').count()) {
        await irSub(page, 'personal', 'capacitar');
        bien(await subActual(page, 'personal') === 'capacitar', `${tag} Personal: "Capacitar" se abre`);
        await sinScroll(page, `${tag} Personal · Capacitar`); await foto(page, 'personal_capacitar', shots);
      }

      /* ---------- Bodega ---------- */
      await irTab(page, 'bodega');
      bien(await subActual(page, 'bodega') === 'equipos', `${tag} Bodega: abre en "Mis equipos"`);
      await fija(page, 'bodega', '.subnav-w');
      await dedos(page, '#tab-bodega .subnav .sn-k, #tab-bodega .fchips .catchip', `${tag} Bodega`);
      await dedos(page, '#tab-bodega .subnav .sn-k', `${tag} Bodega sub-pestañas`);
      await sinScroll(page, `${tag} Bodega · Mis equipos`); await foto(page, 'bodega_equipos', shots);
      await page.click('#tab-bodega [data-act="filtro"][data-f="eqFiltro"][data-k="reparar"]'); await page.waitForTimeout(150);
      const rep = await page.evaluate(() => [...document.querySelectorAll('#tab-bodega .ggrid .gear')].map((c) => { const b = c.querySelector('[data-act="repair"]'); return !!b && !b.disabled; }));
      bien(rep.length >= 2 && rep.every(Boolean), `${tag} Bodega: "Por reparar" muestra solo lo que tiene desgaste (${rep.length})`);
      await page.click('#tab-bodega [data-act="filtro"][data-f="eqFiltro"][data-k="todo"]'); await page.waitForTimeout(120);
      await irSub(page, 'bodega', 'tienda');
      bien(await page.locator('#tab-bodega #shopBusca').isVisible() && await page.locator('#tab-bodega .catrow [data-act="cat"]').count() > 3, `${tag} Bodega: "Tienda" con búsqueda y categorías`);
      await page.click('#tab-bodega [data-act="cat"][data-k="audio"]'); await page.waitForTimeout(150);
      const audio = await page.evaluate(() => [...document.querySelectorAll('#shopGrid [data-act="buy"]')].every((b) => (window.Game.CATALOG[b.dataset.k] || {}).cat === 'audio'));
      bien(audio, `${tag} Bodega: la categoría "Audio" muestra solo audio`);
      await page.selectOption('#shopOrden', 'precio'); await page.waitForTimeout(150);
      const precios = await page.evaluate(() => [...document.querySelectorAll('#shopGrid .shopc:not(.locked):not(.exq) [data-act="buy"]')].map((b) => window.Game.CATALOG[b.dataset.k].price));
      bien(precios.every((v, i) => !i || precios[i - 1] <= v), `${tag} Bodega: "Más barato" ordena por precio`);
      await page.selectOption('#shopOrden', 'rec'); await page.waitForTimeout(120);
      await page.fill('#shopBusca', 'dron'); await page.waitForTimeout(200);
      const busca = await page.evaluate(() => [...document.querySelectorAll('#shopGrid [data-act="buy"]')].map((b) => /dron/i.test(b.closest('.card').innerText)));
      bien(busca.length > 0 && busca.every(Boolean), `${tag} Bodega: buscar "dron" encuentra solo drones (${busca.length})`);
      bien(await page.evaluate(() => document.activeElement && document.activeElement.id === 'shopBusca'), `${tag} Bodega: el teclado no se cierra al escribir`);
      await sinScroll(page, `${tag} Bodega · búsqueda`); await foto(page, 'bodega_busqueda', shots);
      await page.click('#shopGrid [data-act="shop-borrar"]'); await page.waitForTimeout(150);
      bien(await page.inputValue('#shopBusca') === '' && await page.locator('#tab-bodega .catrow [data-act="cat"].on').count() === 1, `${tag} Bodega: "Borrar búsqueda" vuelve a la categoría`);
      await page.click('#tab-bodega [data-act="cat"][data-k="cam"]'); await page.waitForTimeout(150);
      await sinScroll(page, `${tag} Bodega · Tienda`); await foto(page, 'bodega_tienda', shots);
      await irSub(page, 'bodega', 'repuestos');
      const st0 = await page.evaluate(() => window.__game.state.stock.cable || 0);
      await page.click('#tab-bodega [data-act="buy-cons"][data-k="cable"]'); await page.waitForTimeout(200);
      bien(await page.evaluate(() => window.__game.state.stock.cable || 0) === st0 + 1, `${tag} Bodega: "Repuestos" compra un cable`);
      await sinScroll(page, `${tag} Bodega · Repuestos`); await foto(page, 'bodega_repuestos', shots);

      /* ---------- Tienda ---------- */
      await irTab(page, 'tienda');
      await page.waitForSelector('#tab-tienda .subnav', { timeout: 8000 });
      await page.waitForTimeout(500);
      const subsT = await page.evaluate(() => [...document.querySelectorAll('#tab-tienda .subnav .sn-k')].map((b) => b.dataset.k));
      bien(['ofertas', 'creditos', 'vip', 'pase', 'mercado'].every((k) => subsT.includes(k)), `${tag} Tienda: sub-pestañas Ofertas, Créditos, VIP, Pase y Mercado (${subsT.join(',')})`);
      await fija(page, 'tienda', '.subnav-w');
      await dedos(page, '#tab-tienda .subnav .sn-k', `${tag} Tienda sub-pestañas`);
      for (const k of subsT) {
        await irSub(page, 'tienda', k);
        await page.waitForTimeout(k === 'mercado' || k === 'vip' || k === 'pase' ? 600 : 150);
        bien(await subActual(page, 'tienda') === k, `${tag} Tienda: "${k}" se abre`);
        if (k === 'creditos') bien(await page.locator('#tab-tienda .wallet').isVisible() && await page.locator('#tab-tienda #tv-creditos').count() === 1, `${tag} Tienda: "Créditos" tiene tu saldo y los paquetes`);
        if (k === 'ofertas') bien(await page.locator('#tab-tienda #tv-empezar').count() === 1 && !(await page.locator('#tab-tienda #tv-creditos').count()), `${tag} Tienda: "Ofertas" sin la lista de créditos`);
        await sinScroll(page, `${tag} Tienda · ${k}`); await foto(page, 'tienda_' + k + (shots ? '' : '_360'), shots || k === 'ofertas');
      }
      await irSub(page, 'tienda', 'ofertas');

      /* ---------- En línea ---------- */
      await irTab(page, 'online');
      await page.waitForSelector('#tab-online .onl-tile', { timeout: 6000 });
      bien(await page.locator('#tab-online .onl-tile .badge').count() >= 1, `${tag} En línea: los modos muestran avisos (duelos nuevos, desafío de hoy)`);
      await sinScroll(page, `${tag} En línea`); await foto(page, 'online', shots);
      await page.click('#tab-online .onl-tile[data-k="duelos"]'); await page.waitForTimeout(500);
      bien(await page.locator('#tab-online .onl-modos .catchip.on[data-k="duelos"]').count() === 1, `${tag} En línea: dentro de un modo, la barra de modos marca "Duelos"`);
      await fija(page, 'online', '.onl-bar');
      await page.click('#tab-online .onl-modos [data-k="liga"]'); await page.waitForTimeout(500);
      bien(await page.locator('#tab-online .onl-modos .catchip.on[data-k="liga"]').count() === 1, `${tag} En línea: de un modo se salta a otro sin volver`);
      await sinScroll(page, `${tag} En línea · modo`); await foto(page, 'online_modo', shots);
      await page.click('#tab-online .onl-volver[data-k="hub"]'); await page.waitForTimeout(250);
      bien(await page.locator('#tab-online .onl-tile').count() > 3, `${tag} En línea: "Modos" vuelve a la grilla`);

      /* ---------- Recordar la última sub-pestaña ---------- */
      await irTab(page, 'bodega'); await irSub(page, 'bodega', 'repuestos');
      await irTab(page, 'personal'); await irSub(page, 'personal', 'contratar');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null, null, { timeout: 10000 });
      await page.waitForTimeout(300); await cerrarVentanas(page);
      await irTab(page, 'bodega');
      bien(await subActual(page, 'bodega') === 'repuestos', `${tag} Bodega: al recargar recuerda "Repuestos"`);
      await irTab(page, 'personal');
      bien(await subActual(page, 'personal') === 'contratar', `${tag} Personal: al recargar recuerda "Contratar"`);

      /* ---------- Enlaces de otros módulos ---------- */
      const tocar = (attrs) => page.evaluate((a) => { const b = document.createElement('button'); Object.keys(a).forEach((k) => b.setAttribute(k, a[k])); document.querySelector('main').appendChild(b); b.click(); b.remove(); }, attrs);
      await irTab(page, 'inicio'); await page.waitForTimeout(300);
      const strip = page.locator('#tab-inicio [data-act="ir-danos"]').first();
      if (await strip.count() && await strip.isVisible()) await strip.click(); else await tocar({ 'data-act': 'ir-danos' });
      await page.waitForTimeout(250);
      bien(await page.evaluate(() => document.querySelector('main section.on').id) === 'tab-bodega' && await subActual(page, 'bodega') === 'equipos'
        && await page.locator('#tab-bodega [data-f="eqFiltro"][data-k="reparar"].on').count() === 1, `${tag} Enlace ir-danos → Bodega · Mis equipos · Por reparar`);
      await irTab(page, 'personal'); await irSub(page, 'personal', 'equipo');
      await tocar({ 'data-act': 'ir-bodega', 'data-k': 'audio', 'data-item': 'audio_pro' });
      await page.waitForTimeout(250);
      bien(await subActual(page, 'bodega') === 'tienda' && await page.locator('#tab-bodega [data-act="cat"][data-k="audio"].on').count() === 1
        && await page.locator('#tab-bodega .combo-ir [data-act="buy"][data-k="audio_pro"]').count() === 1, `${tag} Enlace "Ver en la Bodega" → Tienda · Audio con la tarjeta resaltada`);
      const vis = await page.evaluate(() => { const c = document.querySelector('#tab-bodega .combo-ir'); if (!c) return false; const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; });
      bien(vis, `${tag} Enlace "Ver en la Bodega": la tarjeta queda a la vista`);
      await irSub(page, 'bodega', 'equipos');
      await tocar({ 'data-act': 'ir-personal', 'data-k': 'sonidista' });
      await page.waitForTimeout(250);
      bien(await subActual(page, 'personal') === 'contratar' && await page.inputValue('#rolBuscar') === 'sonidista', `${tag} Enlace ir-personal → Personal · Contratar con el puesto elegido`);
      await tocar({ 'data-act': 'ir-pase-vip' }); await page.waitForTimeout(400);
      bien(await page.evaluate(() => document.querySelector('main section.on').id) === 'tab-tienda' && await subActual(page, 'tienda') === 'vip', `${tag} Enlace ir-pase-vip → Tienda · VIP`);
      await tocar({ 'data-act': 'tienda-ir', 'data-k': 'tv-creditos' }); await page.waitForTimeout(300);
      bien(await subActual(page, 'tienda') === 'creditos' && await page.locator('#tv-creditos').count() === 1, `${tag} Atajo tienda-ir → Tienda · Créditos`);
      await irSub(page, 'tienda', 'ofertas');
      await irTab(page, 'inicio');
      if (await page.locator('#cGem:not([hidden])').count()) {
        await page.click('#cGem'); await page.waitForTimeout(300);
        bien(await subActual(page, 'tienda') === 'creditos', `${tag} Créditos de arriba → Tienda · Créditos`);
      }
      await irTab(page, 'inicio'); await page.waitForTimeout(300);
      const hs = page.locator('#tab-inicio [data-hub="bodega"][data-act="tab"]').first();
      if (await hs.count()) {
        await hs.click(); await page.waitForTimeout(250);
        bien(await page.evaluate(() => document.querySelector('main section.on').id) === 'tab-bodega', `${tag} Sede (hub) → Bodega`);
      }
      await page.evaluate(() => window.EnVivoIr('bodega', 'tienda', { cat: 'vehicle' })); await page.waitForTimeout(200);
      bien(await subActual(page, 'bodega') === 'tienda' && await page.locator('#tab-bodega [data-act="cat"][data-k="vehicle"].on').count() === 1, `${tag} EnVivoIr (vehículos de js/movilizacion.js) → Tienda · Vehículos`);

      /* ---------- Preparación por pasos ---------- */
      await irTab(page, 'clientes');
      await page.click('#tab-clientes [data-act="prep"]');
      await page.waitForSelector('#modal #prepPie');
      const pasos = ['personal', 'equipos', 'camaras', 'resumen'];
      for (let i = 0; i < pasos.length; i++) {
        const k = pasos[i];
        const r = await page.evaluate((k) => {
          const m = document.getElementById('modal');
          const vis = [...m.querySelectorAll('.prep-paso')].filter((x) => !x.hidden).map((x) => x.dataset.paso);
          const mr = m.getBoundingClientRect();
          const enVista = (sel) => { const n = m.querySelector(sel); if (!n) return false; const r = n.getBoundingClientRect(); return r.top >= mr.top - 1 && r.bottom <= mr.bottom + 1 && r.height > 20; };
          m.scrollTop = m.scrollHeight;   // abajo del todo: las dos barras siguen a la vista
          const abajo = enVista('.prep-top') && enVista('#prepPie');
          m.scrollTop = 0;
          return { vis, top: enVista('.prep-top'), pie: enVista('#prepPie'), abajo, aire: !!m.querySelector('#prepPie [data-act="go-live"]'),
            on: (m.querySelector('.pp-k.on') || {}).dataset ? m.querySelector('.pp-k.on').dataset.k : '', cajas: m.querySelectorAll('input[data-act="tog-staff"]').length + m.querySelectorAll('input[data-act="tog-equip"]').length };
        }, k);
        bien(r.vis.length === 1 && r.vis[0] === k && r.on === k, `${tag} Preparación: se ve solo el paso "${k}" (${r.vis.join(',')})`);
        bien(r.top && r.pie && r.abajo && r.aire, `${tag} Preparación · ${k}: los pasos arriba y la barra con "¡Salir al aire!" abajo quedan a la vista`);
        bien(r.cajas > 0, `${tag} Preparación · ${k}: las casillas de personal y equipos siguen en la ventana`);
        if (k === 'personal') bien(await page.locator('#modal .prep-paso[data-paso="personal"] label.pick input[data-act="tog-staff"]').count() > 0, `${tag} Preparación: el paso Personal tiene a tu equipo`);
        if (k === 'equipos') {
          const fc = page.locator('#modal [data-act="prep-cat"]:not([data-k="todo"])').first();
          if (await fc.count()) {
            const ck = await fc.getAttribute('data-k');
            await fc.click(); await page.waitForTimeout(120);
            const okCat = await page.evaluate((ck) => [...document.querySelectorAll('#modal .prep-paso[data-paso="equipos"] label.pick')].filter((l) => !l.hidden).every((l) => l.dataset.cat === ck), ck);
            bien(okCat, `${tag} Preparación · Equipos: el filtro por categoría deja solo "${ck}"`);
            await page.click('#modal [data-act="prep-cat"][data-k="todo"]'); await page.waitForTimeout(120);
          }
        }
        if (k === 'camaras') bien(await page.locator('#modal .prep-paso[data-paso="camaras"] .pe-cams').count() === 1, `${tag} Preparación · Cámaras: el plano de cámaras está en su paso`);
        if (k === 'resumen') bien(await page.locator('#modal #prepTabla tr').count() > 0, `${tag} Preparación · Resumen: la tabla de cómo se calcula la calidad`);
        await sinScroll(page, `${tag} Preparación · ${k}`);
        await dedos(page, '#modal .pp-k, #modal #prepPie .btn', `${tag} Preparación · ${k}`);
        await foto(page, 'prep_' + k + (shots ? '' : '_360'), shots || k === 'personal');
        if (i < pasos.length - 1) { await page.click('#modal #prepPie [data-act="prep-paso"]'); await page.waitForTimeout(200); }
      }
      bien(!(await page.locator('#modal #prepPie [data-act="prep-paso"]').count()), `${tag} Preparación · Resumen: sin "Siguiente" (último paso)`);
      // Volver a un paso desde arriba y marcar algo: el cálculo se actualiza sin perder el paso
      await page.click('#modal .pp-k[data-k="equipos"]'); await page.waitForTimeout(150);
      const lbl = page.locator('#modal .prep-paso[data-paso="equipos"] label.pick').first();
      await lbl.locator('.grow b').click(); await page.waitForTimeout(150);
      await lbl.locator('.grow b').click(); await page.waitForTimeout(150);
      bien(await page.evaluate(() => [...document.querySelectorAll('#modal .prep-paso')].filter((x) => !x.hidden).map((x) => x.dataset.paso).join()) === 'equipos', `${tag} Preparación: al marcar una casilla sigue en el mismo paso`);
      await page.click('#modal #prepPie [data-act="go-live"]');
      await page.waitForSelector('#overlay.on [data-act="choose"], #overlay.on .live', { timeout: 8000 }).catch(() => {});
      bien(await page.evaluate(() => !!(window.__game.state.currentEvent)), `${tag} Preparación: "¡Salir al aire!" empieza el evento en vivo`);

      bien(!o.errores.length, `${tag}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 4).join(' | ') : ''));
      await o.ctx.close();
    }
  } catch (e) {
    fallas++; console.error('❌ La prueba se cayó:', e && e.stack ? e.stack : e);
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
