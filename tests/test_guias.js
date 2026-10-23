/* Prueba de las guías cortas de cada sección (js/guias.js) dentro del juego real, en un celular simulado (390x844).
   Sirve index.html CON la línea de server/INTEGRAR_GUIAS.md aplicada en memoria (si ya está en el archivo, se prueba tal cual).
   Casos: Bodega (reparar, categorías, Edición Exclusiva), tocar fuera no hace nada, se rehace al repintar, no vuelve a
   salir · Personal · En línea (4 modos) · Tienda sin servidor y con servidor (créditos, cuenta, exclusivos) · Sede
   (fila de Inicio → ventana de mejoras) · Preparar evento (semáforo del personal desde el 2.º evento) y Flota ("Llévame")
   · nunca encima de otra ventana · nunca junto con la guía del primer evento · "Saltar guía" · "Ver guías otra vez" ·
   sin forzar en pruebas automáticas no sale · inglés · movimiento reducido · textos de los 10 idiomas cortos.
   Uso:  node tests/test_guias.js   (capturas en tests/capturas/guias_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
const URL0 = BASE + '/index.html?fecha=2026-11-10';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Integración (la línea de server/INTEGRAR_GUIAS.md) ---------- */
const ANCLA_HTML = '<script defer src="js/guia.js"></script>';
const LINEA_HTML = '<script defer src="js/guias.js"></script>';
let pagina = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
if (!pagina.includes(LINEA_HTML)) {
  if (!pagina.includes(ANCLA_HTML)) throw new Error('No se encontró la línea de integración en index.html: ' + ANCLA_HTML);
  pagina = pagina.replace(ANCLA_HTML, ANCLA_HTML + '\n' + LINEA_HTML);
}

/* ---------- Textos ---------- */
(function () {
  const g = {};
  new Function('window', 'globalThis', fs.readFileSync(path.join(RAIZ, 'js/guias.js'), 'utf8'))(g, g);   // eslint-disable-line no-new-func
  const TX = g.Guias.TEXTOS;
  const claves = Object.keys(TX.es);
  const usadas = [].concat(...Object.values(g.Guias.PASOS));
  bien(usadas.every((k) => TX.es[k]), 'Cada paso tiene su texto');
  ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'].forEach((c) => {
    const d = TX[c] || {};
    const faltan = claves.filter((k) => !d[k]);
    const sobran = Object.keys(d).filter((k) => !TX.es[k]);
    const largos = claves.filter((k) => d[k] && (c === 'zh-CN' ? d[k].length > 16 : d[k].split(/\s+/).length > 8));
    bien(!faltan.length && !sobran.length && !largos.length, `Textos ${c}: completos y cortos (máx. 8 palabras)` + (faltan.length ? ' faltan ' + faltan : '') + (sobran.length ? ' sobran ' + sobran : '') + (largos.length ? ' largos ' + largos : ''));
  });
  bien(!/MegaVisi|Netflix|YouTube|Twitch|Sony|Canon|Uber/i.test(JSON.stringify(TX)), 'Sin marcas reales en los textos');
  const recorridos = Object.keys(g.Guias.PASOS);
  bien(recorridos.length === 7 && recorridos.every((id) => g.Guias.PASOS[id].length >= 2 && g.Guias.PASOS[id].length <= 4), 'Siete recorridos de 2 a 4 toques: ' + recorridos.map((id) => id + ' ' + g.Guias.PASOS[id].length).join(', '));
})();

/* ---------- Servidor de mentira (solo para la Tienda con servidor) ---------- */
const prod = (id, nombre, detalle, precio, creditos, tipo) => ({ id, nombre, detalle, precio, creditos, una_vez: false, tipo, precio_base: precio, creditos_base: creditos, oferta: null });
const ESTADO_API = { ok: true, logueado: false, entregas: [], inventario: [], plux: { disponible: true, ambiente: 'produccion' },
  tienda: { productos: [prod('creditos_250', '250 créditos', 'Paquete de 250 créditos', 1.99, 250, 'creditos'), prod('creditos_700', '700 créditos', '700 créditos', 4.99, 700, 'creditos')],
    premium: [{ id: 'dron4k', nombre: 'Dron 4K', detalle: 'Tomas aéreas', creditos: 450, vip: false, tipo: 'equipo', entrega: { tipo: 'item', item: 'dron4k' } }] } };

/* ---------- Navegador ---------- */
const errores = [];
async function abrir(browser, op) {
  op = op || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'es-EC', reducedMotion: op.reduce ? 'reduce' : 'no-preference' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname === '/api/estado' && op.api) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ESTADO_API) });
    if (u.pathname.startsWith('/api')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const f = path.join(RAIZ, decodeURIComponent(u.pathname));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f);
      const tipo = { '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  // Por defecto: guía del primer evento ya vista y las filas de Inicio como las ve un jugador (cerradas)
  const ls = Object.assign({ envivo_guia_v1: '1', envivo_inicio_abiertos: '{}' }, op.ls || {});
  await ctx.addInitScript((o) => {
    if (o.forzar) window.__ENVIVO_GUIAS = true;
    if (o.guia) window.__ENVIVO_GUIA = true;
    if (!sessionStorage.getItem('pre')) {
      sessionStorage.setItem('pre', '1');
      Object.keys(o.ls).forEach((k) => { if (o.ls[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, o.ls[k]); });
    }
  }, { forzar: op.forzar !== false, guia: !!op.guia, ls });
  const page = await ctx.newPage();
  const tag = op.tag || 'guias';
  page.on('pageerror', (e) => errores.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  await page.waitForLoadState('load');
  if (op.cerrarIntro !== false) {
    // La intro del capítulo de una partida nueva
    await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.querySelector('#overlay.on [data-act="close"]'); if (b) b.click(); });
    await page.waitForTimeout(150);
  }
  return { ctx, page };
}
const est = (page) => page.evaluate(() => (window.Guias ? window.Guias.estado() : { activa: false }));
async function esperar(page, cond, ms) {
  await page.waitForFunction((c) => { const g = window.Guias && window.Guias.estado(); return g && new Function('g', 'return ' + c)(g); }, cond, { timeout: ms || 5000 }).catch(() => {});   // eslint-disable-line no-new-func
  // Que termine el desplazamiento suave: la punta del dedo quieta en dos lecturas seguidas
  let antes = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const g = await est(page);
    const k = JSON.stringify([g.paso, g.x, g.y, await page.evaluate(() => scrollY + ':' + ((document.getElementById('modal') || {}).scrollTop || 0))]);
    if (k === antes) return g;
    antes = k;
  }
  return est(page);
}
const tab = async (page, t) => { await page.evaluate((x) => document.querySelector(`nav button[data-tab="${x}"]`).click(), t); };
// La mano señala el elemento esperado: la punta cae adentro, el anillo lo rodea, la burbuja se ve entera
async function revisar(page, st, sel) {
  return page.evaluate(({ st, sel }) => {
    const r = { ok: true, por: [] };
    const no = (m) => { r.ok = false; r.por.push(m); };
    const vis = (n) => n && n.getClientRects().length && n.getBoundingClientRect().width > 2;
    const t = [...document.querySelectorAll(sel)].find((n) => { if (!vis(n)) return false; const b = n.getBoundingClientRect(); return st.x >= b.left && st.x <= b.right && st.y >= b.top && st.y <= b.bottom; });
    if (!t) no('la punta del dedo no está sobre ' + sel);
    const g = document.getElementById('guias');
    if (!g) { no('sin #guias'); return r; }
    const enPunta = document.elementFromPoint(st.x, st.y);
    if (st.tocar) { if (!enPunta || !enPunta.closest(sel)) no('el toque no llega al botón del juego'); }
    else if (!enPunta || !enPunta.classList.contains('g-hit')) no('en la punta no está el toque de la guía sino ' + (enPunta ? enPunta.outerHTML.slice(0, 80) : 'nada'));
    const ring = g.querySelector('.g-ring').getBoundingClientRect();
    if (t) { const b = t.getBoundingClientRect(); const vb = { l: Math.max(0, b.left), t: Math.max(0, b.top), r: Math.min(innerWidth, b.right), b: Math.min(innerHeight, b.bottom) };
      if (!(ring.left <= vb.l + 1 && ring.top <= vb.t + 1 && ring.right >= vb.r - 1 && ring.bottom >= vb.b - 1)) no('el anillo no rodea el elemento'); }
    const bub = g.querySelector('.g-bub');
    const bb = bub.getBoundingClientRect();
    if (bub.hidden || !bub.textContent.trim()) no('sin burbuja');
    if (bb.left < 0 || bb.right > innerWidth || bb.top < 0 || bb.bottom > innerHeight) no('la burbuja se sale de la pantalla');
    const hd = g.querySelector('.g-hand').getBoundingClientRect();
    if (bb.left < st.x && bb.right > st.x && bb.top < st.y && bb.bottom > st.y) no('la burbuja tapa la punta del dedo');
    if (hd.width < 50) no('la mano es muy chica');
    const sk = g.querySelector('.g-skip'); const sb = sk.getBoundingClientRect();
    if (sk.hidden || sb.width < 40 || sb.top < 0) no('"Saltar guía" no se ve');
    if (document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) no('desplazamiento horizontal');
    r.texto = g.querySelector('.g-tx').textContent.trim();
    r.n = g.querySelector('.g-n').textContent.trim();
    return r;
  }, { st, sel });
}
// Sigue un recorrido tocando donde apunta la mano. pasos: [[clave, selector], ...] (los que deben salir, en orden)
async function recorrer(page, id, pasos, op) {
  op = op || {};
  const vistos = [];
  let st = await esperar(page, `g.activa && g.id === '${id}' && g.visible`, op.ms || 5000);
  bien(st.activa && st.id === id, `Recorrido "${id}" arranca` + (st.activa ? '' : ' (no arrancó: ' + JSON.stringify(st) + ')'));
  if (!st.activa || st.id !== id) return vistos;
  for (let i = 0; i < 6 && st.activa && st.id === id; i++) {
    const esp = pasos[vistos.length];
    if (!esp) { bien(false, `"${id}": paso de más ${st.paso}`); break; }
    const rv = await revisar(page, st, esp[1]);
    bien(st.paso === esp[0] && rv.ok, `"${id}" paso ${rv.n || vistos.length + 1} "${st.paso}": señala ${esp[1]} ("${rv.texto}")` + (st.paso === esp[0] ? '' : ' — se esperaba ' + esp[0]) + (rv.ok ? '' : ' — ' + rv.por.join('; ')));
    vistos.push(st.paso);
    await page.screenshot({ path: path.join(OUT, `guias_${id}_${vistos.length}_${st.paso}.png`) });
    if (op.antes) await op.antes(st, vistos.length);
    st = await est(page);
    const antes = st.paso;
    await page.touchscreen.tap(st.x, st.y);
    st = await esperar(page, `!g.activa || g.paso !== '${antes}' && g.visible`, 5000);
  }
  bien(!st.activa || st.id !== id, `"${id}" termina al tocar el último paso (${vistos.join(' → ')})`);
  bien(vistos.join() === pasos.map((p) => p[0]).join(), `"${id}" pasó por ${pasos.map((p) => p[0]).join(' → ')}`);
  bien((await page.evaluate((k) => localStorage.getItem(k), 'envivo_guias_v1_' + id)) === '1', `"${id}" queda guardado como visto`);
  return vistos;
}

(async () => {
  const browser = await chromium.launch();

  /* ===== 1. Bodega: tocar fuera, repintar, terminar, no vuelve ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'bodega' });
    await page.waitForTimeout(900);
    bien(!(await est(page)).activa, 'En Inicio (filas cerradas) no sale ninguna guía');
    await tab(page, 'bodega');
    await recorrer(page, 'bodega', [['b_reparar', '#tab-bodega [data-act="repair"]'], ['b_categorias', '#tab-bodega .catrow'], ['b_exclusiva', '#tab-bodega .card.exq']], {
      antes: async (st, n) => {
        if (n === 1) {
          // Tocar fuera (la pestaña Inicio de abajo) no hace nada
          const b = await page.locator('nav button[data-tab="inicio"]').boundingBox();
          await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
          await page.waitForTimeout(300);
          const s = await page.evaluate(() => ({ tab: document.querySelector('main section.on').id, g: window.Guias.estado().paso }));
          bien(s.tab === 'tab-bodega' && s.g === 'b_reparar', 'Tocar fuera de lo señalado no hace nada (sigue en Bodega, mismo paso)');
        }
        if (n === 2) {
          // La Bodega se vuelve a pintar (otra categoría): la guía sigue en el mismo paso y vuelve a señalar
          await page.evaluate(() => { const c = document.querySelector('#tab-bodega [data-act="cat"]:not(.on)'); if (c) c.click(); });
          await page.waitForTimeout(300);
          const s = await esperar(page, 'g.visible', 3000);
          const rv = await revisar(page, s, '#tab-bodega .catrow');
          bien(s.paso === 'b_categorias' && rv.ok, 'Al repintar la Bodega la guía sigue señalando las categorías' + (rv.ok ? '' : ' — ' + rv.por.join('; ') + ' ' + JSON.stringify(s) + JSON.stringify(await page.evaluate(() => { const r = document.querySelector('#tab-bodega .catrow').getBoundingClientRect(); return [scrollY, r.top, r.bottom, r.left, r.right]; }))));
        }
      },
    });
    await tab(page, 'inicio'); await page.waitForTimeout(300); await tab(page, 'bodega');
    await page.waitForTimeout(1200);
    bien(!(await est(page)).activa, 'Bodega otra vez: la guía no vuelve a salir');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state);
    await page.evaluate(() => { const b = document.querySelector('#overlay.on [data-act="close"]'); if (b) b.click(); });
    await tab(page, 'bodega');
    await page.waitForTimeout(1200);
    bien(!(await est(page)).activa, 'Al recargar tampoco vuelve a salir');
    await ctx.close();
  }

  /* ===== 2. Personal, En línea y Tienda sin servidor ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'secciones' });
    await tab(page, 'personal');
    await recorrer(page, 'personal', [['p_buscar', '#tab-personal [data-act="search-staff"]'], ['p_contratar', '#tab-personal [data-act="hire"]']]);
    await tab(page, 'online');
    await recorrer(page, 'online', [['o_liga', '.onl-tile[data-k="liga"]'], ['o_duelos', '.onl-tile[data-k="duelos"]'], ['o_desafio', '.onl-tile[data-k="desafio"]'], ['o_copa', '.onl-tile[data-k="copa"]']]);
    await tab(page, 'tienda');
    // Sin servidor no hay botón de crear cuenta: ese paso se salta
    await recorrer(page, 'tienda', [['t_creditos', '#tab-tienda .card.r-exclusivo'], ['t_exclusivos', '#tab-tienda .ggrid > .card']]);
    await ctx.close();
  }

  /* ===== 3. Tienda con servidor (sin cuenta): créditos, crear cuenta, exclusivos ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'tienda-api', api: true });
    await page.waitForFunction(() => window.Api && window.Api.disponible === true, null, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => { const b = document.querySelector('#overlay.on [data-act="close"]'); if (b) b.click(); });
    await tab(page, 'tienda');
    await recorrer(page, 'tienda', [['t_creditos', '#tv-creditos .tv-cgrid'], ['t_cuenta', '#tab-tienda [data-act="cuenta"][data-modo="registro"]'], ['t_exclusivos', '#tv-exclusivos .ggrid > .card']]);
    bien(!(await page.$('#overlay.on')), 'Tocar los pasos informativos no abre nada del juego (no se abrió la ventana de cuenta)');
    await ctx.close();
  }

  /* ===== 4. Sede: fila de Inicio → ventana de mejoras ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'sede' });
    await page.evaluate(() => { const b = document.querySelector('.pl[data-pl="sede"] .pl-cab'); b.scrollIntoView({ block: 'center' }); b.click(); });
    await recorrer(page, 'sede', [['s_abrir', '.pl[data-pl="sede"] .sd-card'], ['s_mejora', '#modal .sd-modal .sd-item'], ['s_mats', '#modal .sd-modal .sd-mats'], ['s_obra', '#modal .sd-modal .sd-obra']]);
    bien(!!(await page.$('#overlay.on .sd-modal')), 'Al terminar queda abierta la ventana de la sede (el primer toque la abrió de verdad)');
    await ctx.close();
  }

  /* ===== 5. Preparar evento: nada en el primero; semáforo y "Llévame" desde el segundo ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'prep' });
    await tab(page, 'clientes');
    await page.evaluate(() => document.querySelector('#tab-clientes [data-act="prep"]').click());
    await page.waitForTimeout(1300);
    bien(!(await est(page)).activa, 'Primer evento (lo lleva la guía del primer evento): al preparar no sale esta guía');
    await page.evaluate(() => document.querySelector('#overlay.on [data-act="close"]').click());
    await page.evaluate(() => { window.__game.state.stats.events = 1; });
    await page.evaluate(() => document.querySelector('#tab-clientes [data-act="prep"]').click());
    await recorrer(page, 'prep', [['e_personal', '#modal .pe-crew .pe-box'], ['e_semaforo', '#modal .pe-crew .pe-row'], ['e_marcar', '#modal label.pick']]);
    const hayApp = await page.evaluate(() => !!document.querySelector('#overlay.on .mov-app'));
    if (hayApp) await recorrer(page, 'flota', [['f_mov', '#modal #movSec .mov-hd'], ['f_app', '#modal .mov-app']]);
    else bien(false, 'La preparación muestra la tarjeta "Llévame" (sin vehículo propio)');
    const s = await page.evaluate(() => ({ ov: !!document.querySelector('#overlay.on [data-act="go-live"]'), ev: !!window.__game.state.currentEvent }));
    bien(s.ov && !s.ev, 'Después de las guías se sigue preparando el evento normal');
    await ctx.close();
  }

  /* ===== 6. Nunca encima de otra ventana; nunca junto con la guía del primer evento ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'ventana' });
    await page.evaluate(() => document.querySelector('#tab-inicio [data-act="idioma"]').click());
    await page.waitForSelector('#overlay.on');
    await tab(page, 'bodega');
    await page.waitForTimeout(1300);
    bien(!(await est(page)).activa && !(await page.$('#guias')), 'Con otra ventana abierta (idioma) no sale la guía de la Bodega');
    await page.evaluate(() => { const b = document.querySelector('#overlay.on [data-act="close"]'); if (b) b.click(); else document.getElementById('overlay').classList.remove('on'); });
    const st = await esperar(page, "g.activa && g.id === 'bodega' && g.visible");
    bien(st.activa && st.id === 'bodega', 'Al cerrar la ventana, sale la guía de la Bodega');
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir(browser, { tag: 'con-guia', guia: true, cerrarIntro: false, ls: { envivo_guia_v1: null, envivo_inicio_abiertos: null } });
    await page.waitForFunction(() => window.Guia && window.Guia.estado().visible, null, { timeout: 6000 }).catch(() => {});
    const g = await page.evaluate(() => window.Guia.estado());
    await page.touchscreen.tap(g.x, g.y);   // intro del capítulo → la guía señala Clientes; la fila Sede está abierta
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => ({ g: window.Guia.estado().paso, gs: window.Guias.estado().activa, sede: !!document.querySelector('.pl[data-pl="sede"].abierta .sd-card') }));
    bien(s.g === 'clientes' && s.sede && !s.gs, 'Mientras corre la guía del primer evento no sale ninguna otra (' + JSON.stringify(s) + ')');
    await page.locator('#guia .g-skip').tap();
    const st = await esperar(page, "g.activa && g.id === 'sede'");
    bien(st.activa && st.id === 'sede', 'Al cerrar la guía del primer evento ya puede salir la de la Sede');
    await ctx.close();
  }

  /* ===== 7. Saltar guía y "Ver guías otra vez" ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'saltar' });
    await tab(page, 'bodega');
    await esperar(page, 'g.activa && g.visible');
    await page.screenshot({ path: path.join(OUT, 'guias_saltar.png') });
    await page.locator('#guias .g-skip').tap();
    await page.waitForTimeout(250);
    bien(!(await page.$('#guias')) && !(await est(page)).activa, '"Saltar guía" la cierra');
    bien((await page.evaluate(() => localStorage.getItem('envivo_guias_v1_bodega'))) === '1', '"Saltar guía" queda guardado');
    await tab(page, 'inicio');
    await page.evaluate(() => { const b = document.querySelector('.pl[data-pl="ayuda"] .pl-cab'); b.click(); });
    await page.waitForSelector('[data-guias="reset"]', { timeout: 3000 }).catch(() => {});
    const b = page.locator('[data-guias="reset"]');
    bien(await b.count() === 1 && /Ver guías otra vez/.test(await b.textContent()), 'Inicio → Ayuda tiene "Ver guías otra vez"');
    await b.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, 'guias_ver_otra_vez.png') });
    await b.tap();
    await page.waitForTimeout(200);
    bien(/Listo/.test(await b.textContent()) && !(await page.evaluate(() => localStorage.getItem('envivo_guias_v1_bodega'))), '"Ver guías otra vez" borra las marcas y avisa');
    await tab(page, 'bodega');
    const st = await esperar(page, "g.activa && g.id === 'bodega'");
    bien(st.activa && st.paso === 'b_reparar', 'Después de "Ver guías otra vez", la guía de la Bodega sale de nuevo');
    await ctx.close();
  }

  /* ===== 8. Pruebas automáticas sin forzar ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'sinforzar', forzar: false, ls: { envivo_inicio_abiertos: null } });
    await tab(page, 'bodega');
    await page.waitForTimeout(1200);
    const s = await page.evaluate(() => ({ g: !!document.getElementById('guias'), k: Object.keys(localStorage).filter((k) => /^envivo_guias/.test(k)).length, b: !!document.querySelector('[data-guias]') }));
    bien(!s.g && !s.k && !s.b, 'navigator.webdriver sin forzar: no sale ni se marca nada (las otras pruebas siguen igual)');
    await ctx.close();
  }

  /* ===== 9. Inglés y movimiento reducido ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'en', ls: { envivo_lang: 'en' } });
    await page.waitForFunction(() => window.I18N && window.I18N.idioma === 'en', null, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => { const b = document.querySelector('#overlay.on [data-act="close"]'); if (b) b.click(); });
    await tab(page, 'online');
    await esperar(page, 'g.activa && g.visible');
    const t = await page.evaluate(() => ({ b: document.querySelector('#guias .g-tx').textContent, s: document.querySelector('#guias .g-skip').textContent }));
    await page.screenshot({ path: path.join(OUT, 'guias_en_online.png') });
    bien(t.b === 'League: jobs with your association weekly' && /Skip guide/.test(t.s), 'Inglés: "' + t.b + '" / "' + t.s + '"');
    await ctx.close();
  }
  {
    const { ctx, page } = await abrir(browser, { tag: 'reduce', reduce: true });
    await tab(page, 'personal');
    await esperar(page, 'g.activa && g.visible');
    const a = await page.evaluate(() => ({
      ring: getComputedStyle(document.querySelector('#guias .g-ring'), '::after').animationName,
      mano: getComputedStyle(document.querySelector('#guias .g-hand svg')).animationName,
    }));
    bien(a.ring === 'none' && a.mano === 'none', 'Movimiento reducido: sin pulso ni toque animado (' + JSON.stringify(a) + ')');
    await ctx.close();
  }

  await browser.close();
  if (errores.length) { fallas++; console.error('❌ Errores de JS:\n' + errores.join('\n')); }
  console.log(`\n${bien_} bien, ${fallas} fallas`);
  if (fallas) process.exit(1);
  console.log('✅ Guías de cada sección OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
