/* Prueba del nivel VIP 1–10 (js/vip.js) dentro del juego real (index.html + js/ui.js) en un celular simulado (390x844)
   con Playwright. El servidor se imita aquí: /api/estado (vip_nivel, regalos_pendientes), /api/vip, /api/vip/regalo/reclamar,
   /api/vip/mensual, /api/mecenas y /api/vip/ajustes (se revisa que los POST lleven X-Envivo: 1).
   Casos: tarjeta de Inicio con nivel y cofres, abrir un cofre (animación, entregas aplicadas a la partida), ventana con
   avance, regalo del mes, oferta, tabla de niveles y Mecenas (semana/siempre y preferencias), sin nivel, sin sesión,
   inglés y diccionarios completos. Revisa que no haya errores de JS ni desborde horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_vip.js   (capturas en tests/capturas/vip_*.png) */
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

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Diccionarios ---------- */
(function () {
  const g = {};
  const code = fs.readFileSync(path.join(RAIZ, 'js/vip.js'), 'utf8');
  new Function('window', 'globalThis', code)(g, g);   // eslint-disable-line no-new-func
  const V = g.Vip;
  const marcas = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join(',');
  const claves = Object.keys(V.ES);
  ['en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'].forEach((c) => {
    const d = V.TRAD[c] || {};
    const faltan = claves.filter((k) => d[k] === undefined);
    const malas = claves.filter((k) => d[k] !== undefined && marcas(d[k]) !== marcas(V.ES[k]));
    const sobran = Object.keys(d).filter((k) => V.ES[k] === undefined);
    bien(!faltan.length && !malas.length && !sobran.length, `Traducción ${c}: completa y con los mismos {marcadores}` + (faltan.length ? ' faltan ' + faltan : '') + (malas.length ? ' marcadores ' + malas : '') + (sobran.length ? ' sobran ' + sobran : ''));
  });
  bien(g.EnVivoInicio && g.EnVivoInicio.some((m) => m.id === 'vip' && m.orden === 3), 'Se registra en EnVivoInicio con orden 3');
  bien(V.tarjeta({ render() {} }) === '', 'Sin Api/sesión la tarjeta queda vacía');
  bien(V.insignia(0) === '' && /vip-ins/.test(V.insignia(7)) && /brillo/.test(V.insignia(7)) && />7</.test(V.insignia(7)), 'insignia(n) para el chat: vacía sin nivel; con brillo desde VIP 7');
  bien(/^#[0-9a-f]{6}$/.test(V.color(4)) && V.color(4) !== V.color(5), 'color(n): un color de marco por nivel');
  bien(/[Tt]e faltan|Ábrelo|Puedes/.test(Object.values(V.ES).join(' ')) && !/\b(usted|Usted)\b/.test(Object.values(V.ES).join(' ')), 'Español en tú (nada de "usted")');
})();

/* ---------- Datos de prueba (como los manda el servidor) ---------- */
const MENSUAL = (n) => [{ tipo: 'dinero', item: '-', cantidad: 500 + 300 * (n - 1) }, { tipo: 'consumible', item: 'cable', cantidad: 1 + n }, ...(n >= 2 ? [{ tipo: 'consumible', item: 'battery', cantidad: n }] : []), ...(n >= 5 ? [{ tipo: 'reparar_todo', item: '-', cantidad: 1 }] : [])];
const COLORES = ['#c58a4e', '#c9d1dc', '#f2c14e', '#3fd0a4', '#4da3ff', '#a77bff', '#ff5c8a', '#ff8a3d', '#7cf0ff', '#ffd84d'];
const PUNTOS = [10, 50, 150, 300, 500, 1000, 2000, 3500, 6000, 10000];
const NIVELES = PUNTOS.map((p, i) => ({ nivel: i + 1, puntos: p, insignia: '', color: COLORES[i], brillo: i >= 6, titulo: '', intentos_extra: [3, 6, 9].filter((x) => i + 1 >= x).length,
  intento_nuevo: [3, 6, 9].includes(i + 1), slots_obra: i + 1 >= 4 ? 2 : 1, slot_nuevo: i + 1 === 4, mensual: MENSUAL(i + 1) }));
const COFRE = [{ tipo: 'dinero', item: '-', cantidad: 900 }, { tipo: 'consumible', item: 'cable', cantidad: 2 }, { tipo: 'consumible', item: 'battery', cantidad: 2 }];
const en = (dias) => new Date(Date.now() + dias * 86400000).toISOString();
function vip(nivel, extra) {
  return Object.assign({ ok: true, nivel, insignia: nivel ? { nivel, color: COLORES[nivel - 1] } : null,
    progreso: nivel >= 10 ? { puntos: 12000, siguiente: null, faltan: 0, pct: 100 } : { puntos: 219, siguiente: nivel + 1, siguiente_puntos: PUNTOS[nivel], faltan: PUNTOS[nivel] - 219, pct: 46 },
    intentos_extra: [3, 6, 9].filter((x) => nivel >= x).length, slots_obra: nivel >= 4 ? 2 : 1, niveles: NIVELES,
    mensual: { mes: '2026-10', disponible: nivel > 0, reclamado: false, contenido: MENSUAL(Math.max(1, nivel)), nivel, proximo: '2026-11-01T00:00:00-05:00' },
    regalos: [], regalos_tope_dia: 5, ofertas: [], ajustes: { anonimo: false, ocultar_mecenas: false }, pase_vip_activo: false }, extra || {});
}
const REGALOS = [
  { id: 41, de: 'Ballena Andina', anonimo: false, nivel: 3, contenido: COFRE, creado: en(-1), vence: en(6), mio: false },
  { id: 42, de: null, anonimo: true, nivel: 2, contenido: COFRE.slice(0, 2), creado: en(-1), vence: en(6), mio: false },
  { id: 43, de: 'Productora Con Un Nombre Bastante Largo De Verdad', anonimo: false, nivel: 1, contenido: COFRE.slice(0, 2), creado: en(0), vence: en(7), mio: false },
];
const OFERTA = { id: 9, clave: 'nivel_s', hito: 'vip:3', producto: 'oferta_vip_s', nombre: 'Oferta VIP: Primer impulso', detalle: '', precio: 1.99, creditos: 300,
  entregas: [{ tipo: 'dinero', item: '-', cantidad: 2000 }, { tipo: 'consumible', item: 'cable', cantidad: 5 }], tope: 1, compradas: 0, quedan: 1, vence: en(3) };
const MECENAS = {
  ok: true, servidor: { id: 1, nombre: 'Servidor 1 · Quito' }, oculto: false, semana: { inicio: en(-3), fin: en(4) },
  lista_semana: [{ posicion: 1, nombre: 'Ballena Andina', nivel: 10, insignia: {}, yo: false }, { posicion: 2, nombre: 'QF Producciones', nivel: 3, insignia: {}, yo: true },
    { posicion: 3, nombre: 'Señal Austral', nivel: 1, insignia: {}, yo: false }],
  lista_siempre: [{ posicion: 1, nombre: 'Ballena Andina', nivel: 10, insignia: {}, yo: false }, { posicion: 2, nombre: 'Volcán TV', nivel: 7, insignia: {}, yo: false },
    { posicion: 3, nombre: 'Señal Austral', nivel: 1, insignia: {}, yo: false }, { posicion: 4, nombre: 'QF Producciones', nivel: 3, insignia: {}, yo: true }],
  yo: { semana: 2, siempre: 4 },
};

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const pagina = html.includes('js/vip.js') ? html : html.replace('<script defer src="js/servidores.js"></script>', '<script defer src="js/servidores.js"></script>\n<script defer src="js/vip.js"></script>');
if (!pagina.includes('js/vip.js')) throw new Error('No se pudo poner js/vip.js en index.html');

async function abrir(browser, caso, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { caso, vipPedidos: 0, reclamos: [], mensuales: 0, ajustes: [], mecenas: 0, sinCabecera: [], entregaId: 500 };
  const estado = () => {
    const e = { ok: true, tienda: { productos: [], premium: [] }, logueado: caso.logueado !== false, entregas: [], inventario: [], creditos: 120, plux: { disponible: true, ambiente: 'produccion' } };
    if (e.logueado) {
      e.jugador = { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }; e.servidor = { id: 1, nombre: 'Servidor 1 · Quito' };
      e.vip_nivel = caso.vip ? caso.vip.nivel : 0; e.regalos_pendientes = caso.vip ? caso.vip.regalos.length : 0;
    }
    return e;
  };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = null; }
      if (req.method() === 'POST' && /^\/api\/(vip|mecenas)/.test(u.pathname) && req.headers()['x-envivo'] !== '1') srv.sinCabecera.push(u.pathname);
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/vip') { srv.vipPedidos++; return caso.vip ? json(200, caso.vip) : json(401, { ok: false, error: 'Inicia sesión.', codigo: 'sesion_requerida' }); }
      if (u.pathname === '/api/vip/regalo/reclamar') {
        srv.reclamos.push(body);
        const g = caso.vip.regalos.find((x) => x.id === (body && body.id));
        if (!g) return json(409, { ok: false, error: 'Ya abriste ese regalo.', codigo: 'ya_reclamado' });
        caso.vip.regalos = caso.vip.regalos.filter((x) => x !== g);
        const entregas = g.contenido.map((e) => Object.assign({ id: ++srv.entregaId, origen: 'regalo:' + g.id, creado: en(0) }, e));
        return json(200, { ok: true, regalo: g, entregas, pendientes: caso.vip.regalos.length });
      }
      if (u.pathname === '/api/vip/mensual') {
        srv.mensuales++;
        if (!caso.vip.mensual.disponible) return json(409, { ok: false, error: 'Ya reclamaste tu regalo VIP de este mes. Vuelve el próximo mes.', codigo: 'ya_reclamado' });
        caso.vip.mensual = Object.assign({}, caso.vip.mensual, { disponible: false, reclamado: true });
        return json(200, { ok: true, entregas: caso.vip.mensual.contenido.map((e) => Object.assign({ id: ++srv.entregaId, origen: 'vip_mensual:2026-10', creado: en(0) }, e)), mensual: caso.vip.mensual });
      }
      if (u.pathname === '/api/mecenas') { srv.mecenas++; return json(200, caso.mecenas || MECENAS); }
      if (u.pathname === '/api/vip/ajustes') {
        srv.ajustes.push(body);
        caso.vip.ajustes = Object.assign({}, caso.vip.ajustes, body);
        if (caso.mecenas && 'ocultar_mecenas' in body) caso.mecenas.oculto = body.ocultar_mecenas;
        return json(200, { ok: true, ajustes: caso.vip.ajustes });
      }
      return json(404, { ok: false, error: "No encontrado.", codigo: "no_encontrado" });   // como el servidor: rutas de otros módulos que aquí no están
    }
    const f = path.join(RAIZ, decodeURIComponent(u.pathname));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f);
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[ext] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(url || BASE + '/', { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('#overlay.on [data-act="close"]', { timeout: 4000 }); await page.click('#overlay.on [data-act="close"]'); } catch (e) { /* sin bienvenida */ }
  return { ctx, page, errores, srv };
}

async function desborde(page) {
  return page.evaluate(() => {
    const ancho = window.innerWidth;
    const fuera = [...document.querySelectorAll('[data-vip], [data-vip] *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (el.closest('.vip-cofre-zona')) return false;   // la luz del cofre crece adentro de una zona con overflow:hidden
      return r.width > 0 && (r.right > ancho + 0.5 || r.left < -0.5);
    }).map((el) => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName);
    return { scroll: document.documentElement.scrollWidth - ancho, fuera: fuera.slice(0, 5) };
  });
}
async function sinDesborde(page, donde) {
  const d = await desborde(page);
  bien(d.scroll <= 0 && !d.fuera.length, `${donde}: sin desborde horizontal` + (d.scroll > 0 ? ` (scroll ${d.scroll}px)` : '') + (d.fuera.length ? ' fuera: ' + d.fuera.join(', ') : ''));
}
const texto = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ')).catch(() => '');
async function foto(page, nombre, sel) {
  if (sel) { await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); } else await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'vip_' + nombre + '.png') });
}
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  bien(!o.srv.sinCabecera.length, `${nombre}: los POST a /api/vip* llevan X-Envivo: 1`);
  await o.ctx.close();
}
const partida = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('envivo_tycoon_save_v1') || 'null'); } catch (e) { return null; } });

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---- 1. Tarjeta de Inicio: VIP 3 con cofres y regalo del mes ---- */
    {
      const caso = { vip: vip(3, { regalos: JSON.parse(JSON.stringify(REGALOS)), ofertas: [OFERTA] }) };
      const o = await abrir(browser, caso);
      await require('./hub_ayuda').verEnInicio(o.page, '[data-vip="tarjeta"] [data-vip="regalo"]', 8000);   // en la sede de Inicio (js/hub.js)
      const t = await texto(o.page, '[data-vip="tarjeta"]');
      bien(/Tu nivel VIP/.test(t) && /VIP 3 · Oro/.test(t) && /Productor asociado/.test(t), 'Tarjeta: "Tu nivel VIP · VIP 3 · Oro · Productor asociado"');
      bien(/219 \/ 300 puntos/.test(t) && /Te faltan 81 puntos para VIP 4/.test(t), 'Tarjeta: avance "219 / 300 puntos · Te faltan 81 puntos para VIP 4"');
      bien(await o.page.$$eval('[data-vip="tarjeta"] [data-vip="regalo"]', (x) => x.length) === 2 && /\+1 regalos más/.test(t), 'Tarjeta: 2 cofres a la vista y "+1 regalos más"');
      bien(/Regalo de Ballena Andina/.test(t) && /Regalo de una productora anónima/.test(t), 'Tarjeta: "Regalo de <alias>" y el anónimo');
      bien(/Tu regalo VIP del mes está listo/.test(t) && /Oferta para ti: Oferta VIP: Primer impulso/.test(t), 'Tarjeta: regalo del mes listo y oferta desbloqueada');
      bien(await o.page.$eval('[data-vip="tarjeta"]', (el) => getComputedStyle(el).getPropertyValue('--vc').trim()) === '#f2c14e', 'Tarjeta: color del marco del nivel (oro)');
      bien(o.srv.vipPedidos === 1, `Tarjeta: pide /api/vip una vez (${o.srv.vipPedidos})`);
      await o.page.click('nav button[data-tab="bodega"]'); await o.page.click('nav button[data-tab="inicio"]');
      await o.page.waitForTimeout(300);
      bien(o.srv.vipPedidos === 1, 'Tarjeta: volver a Inicio no repite la consulta');
      await require('./hub_ayuda').verEnInicio(o.page, '[data-vip="tarjeta"]', 3000);
      await sinDesborde(o.page, 'Tarjeta');
      await foto(o.page, 'inicio', '[data-vip="tarjeta"]');

      /* ---- 2. Abrir un cofre desde la tarjeta ---- */
      const antes = await partida(o.page);
      const dineroAntes = antes ? antes.money : null;
      await o.page.click('[data-vip="tarjeta"] [data-acc="reclamar"][data-id="41"]');
      await o.page.waitForSelector('#overlay.on [data-vip="cofre"]', { timeout: 5000 }).catch(() => {});
      bien(o.srv.reclamos.length === 1 && o.srv.reclamos[0].id === 41, 'Cofre: POST /api/vip/regalo/reclamar {id: 41}');
      await o.page.waitForTimeout(1700);   // tapa, luz y contenido
      const c = await texto(o.page, '[data-vip="cofre"]');
      bien(/¡Abriste el regalo!/.test(c) && /Regalo de Ballena Andina/.test(c), 'Cofre: "¡Abriste el regalo!" de Ballena Andina');
      bien(/\$\s?900 para tu productora/.test(c) && /2 × cable/.test(c) && /2 × batería/.test(c), 'Cofre: muestra lo que trae ($900, 2 cables, 2 baterías)');
      const anim = await o.page.$eval('[data-vip="cofre"] .tapa', (el) => { const s = getComputedStyle(el); return s.animationName + '|' + s.transform; });
      bien(/vipTapa/.test(anim) && anim.split('|')[1] !== 'none', 'Cofre: la tapa se abre con la animación CSS (vipTapa)');
      const vis = await o.page.$$eval('[data-vip="cofre"] .vip-cofre-items li', (x) => x.map((li) => getComputedStyle(li).opacity));
      bien(vis.length === 3 && vis.every((v) => Number(v) > 0.9), 'Cofre: el contenido aparece después de abrir');
      await sinDesborde(o.page, 'Cofre');
      await foto(o.page, 'cofre');
      const despues = await partida(o.page);
      bien(despues && despues.premium && [501, 502, 503].every((id) => despues.premium.aplicadas.includes(id)), 'Cofre: las entregas quedan aplicadas en la partida (una sola vez)');
      bien(dineroAntes === null || (despues && despues.money === dineroAntes + 900), `Cofre: el dinero del juego sube $900 (${dineroAntes} → ${despues && despues.money})`);
      await o.page.click('#overlay.on [data-acc="volver"]');
      await o.page.waitForTimeout(250);
      bien(!(await o.page.$('#overlay.on')), 'Cofre: "¡Genial!" cierra (se abrió desde la tarjeta)');
      bien(await o.page.$$eval('[data-vip="tarjeta"] [data-vip="regalo"][data-id]', (x) => x.map((e) => e.dataset.id).join(',')) === '42,43', 'Tarjeta: el cofre abierto ya no sale; quedan 42 y 43');

      /* ---- 3. Ventana: avance, cofres, mes, oferta y tabla ---- */
      await o.page.click('[data-vip="tarjeta"] [data-acc="abrir"]');
      await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 3000 });
      const m = await texto(o.page, '[data-vip="modal"]');
      bien(/Nivel VIP/.test(m) && /VIP 3 · Oro/.test(m) && /\$1 en la tienda = 10 puntos VIP/.test(m), 'Ventana: nivel y cómo se ganan los puntos');
      bien(/El Pase VIP de 30 días es aparte/.test(m), 'Ventana: aclara que el Pase VIP de 30 días es otra cosa');
      bien(await o.page.$$eval('#overlay [data-vip="nivel"]', (x) => x.length) === 10 && await o.page.$eval('#overlay [data-vip="nivel"].yo', (el) => el.dataset.n).catch(() => '') === '3', 'Ventana: tabla de 10 niveles con el tuyo marcado');
      const n3 = await texto(o.page, '#overlay [data-vip="nivel"][data-n="3"]'), n4 = await texto(o.page, '#overlay [data-vip="nivel"][data-n="4"]');
      bien(/Insignia Oro en el chat/.test(n3) && /Marco de color/.test(n3) && /Título: Productor asociado/.test(n3) && /\+1 intento diario de preparación/.test(n3), 'Tabla VIP 3: insignia, marco, título y +1 intento');
      bien(/2\.º espacio de obra en la Sede/.test(n4) && !/\+1 intento/.test(n4), 'Tabla VIP 4: 2.º espacio de obra');
      bien(/\+1 intento/.test(await texto(o.page, '#overlay [data-vip="nivel"][data-n="6"]')) && /\+1 intento/.test(await texto(o.page, '#overlay [data-vip="nivel"][data-n="9"]')), 'Tabla: +1 intento también en VIP 6 y 9');
      const of = await texto(o.page, '#overlay [data-vip="oferta"]');
      bien(/Primer impulso/.test(of) && /300 créditos/.test(of) && /Comprar \$1,99/.test(of) && /Te quedan 1/.test(of), 'Oferta: contenido a la vista, precio, cuántas quedan');
      bien(await o.page.$eval('#overlay [data-vip="oferta"] [data-act="comprar"]', (el) => el.dataset.k).catch(() => '') === 'oferta_vip_s', 'Oferta: el botón usa la compra de la tienda (data-act="comprar" data-k="oferta_vip_s")');
      await sinDesborde(o.page, 'Ventana VIP');
      await foto(o.page, 'modal');
      await o.page.$eval('#overlay [data-vip="nivel"][data-n="3"]', (el) => el.scrollIntoView({ block: 'start' }));
      await o.page.waitForTimeout(200);
      await o.page.screenshot({ path: path.join(OUT, 'vip_tabla.png') });
      // regalo del mes desde la ventana
      await o.page.$eval('#overlay [data-vip="mensual"]', (el) => el.scrollIntoView({ block: 'center' }));
      await o.page.click('#overlay [data-vip="mensual"] [data-acc="mensual"]');
      await o.page.waitForSelector('#overlay.on [data-vip="cofre"]', { timeout: 4000 }).catch(() => {});
      bien(o.srv.mensuales === 1 && /¡Tu regalo del mes!/.test(await texto(o.page, '[data-vip="cofre"]')), 'Mes: POST /api/vip/mensual y cofre "¡Tu regalo del mes!"');
      await o.page.waitForTimeout(400);
      await o.page.click('#overlay.on [data-acc="volver"]');
      await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 3000 }).catch(() => {});
      bien(/Ya reclamaste el de este mes\. El próximo llega el 1 de noviembre\./.test(await texto(o.page, '#overlay [data-vip="mensual"]')), 'Mes: "¡Genial!" vuelve a la ventana y dice cuándo llega el próximo');
      // cofre desde la ventana
      await o.page.click('#overlay [data-vip="regalo"][data-id="42"] [data-acc="reclamar"]');
      await o.page.waitForSelector('#overlay.on [data-vip="cofre"]', { timeout: 4000 }).catch(() => {});
      bien(/Regalo de una productora anónima/.test(await texto(o.page, '[data-vip="cofre"]')), 'Cofre anónimo desde la ventana');
      await o.page.click('#overlay.on [data-acc="volver"]');
      await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 3000 }).catch(() => {});

      /* ---- 4. Mecenas ---- */
      await o.page.click('#overlay [data-acc="vista"][data-k="mecenas"]');
      await o.page.waitForSelector('#overlay [data-vip="mecenas"]', { timeout: 4000 }).catch(() => {});
      const me = await texto(o.page, '#overlay [data-vip="modal"]');
      bien(/Solo se ven nombres, nunca montos/.test(me) && /Ballena Andina/.test(me) && /QF Producciones · Tú/.test(me) && /Tu puesto: 2/.test(me), 'Mecenas: semana con nombres, tú marcado y tu puesto');
      bien(!/\$\s?\d/.test(await texto(o.page, '#overlay [data-vip="mecenas"]')), 'Mecenas: ningún monto en la lista');
      bien(await o.page.$$eval('#overlay [data-vip="mecenas"] .vip-ins', (x) => x.length) === 3, 'Mecenas: cada productora con su insignia VIP');
      await sinDesborde(o.page, 'Mecenas');
      await foto(o.page, 'mecenas');
      await o.page.click('#overlay [data-acc="mec"][data-k="siempre"]');
      await o.page.waitForTimeout(150);
      bien(/Volcán TV/.test(await texto(o.page, '#overlay [data-vip="mecenas"]')) && /Tu puesto: 4/.test(await texto(o.page, '#overlay [data-vip="modal"]')), 'Mecenas: "Siempre" cambia la lista y tu puesto');
      bien(await o.page.$eval('#overlay [data-k="ocultar_mecenas"]', (el) => el.getAttribute('aria-pressed')) === 'true', 'Preferencias: "Salir en el ranking" encendido');
      await o.page.click('#overlay [data-k="ocultar_mecenas"]');
      await o.page.waitForFunction(() => { const b = document.querySelector('#overlay [data-k="ocultar_mecenas"]'); return b && b.getAttribute('aria-pressed') === 'false'; }, null, { timeout: 3000 }).catch(() => {});
      bien(o.srv.ajustes.length === 1 && o.srv.ajustes[0].ocultar_mecenas === true, 'Preferencias: POST /api/vip/ajustes {ocultar_mecenas: true}');
      await o.page.click('#overlay [data-k="anonimo"]');
      await o.page.waitForFunction(() => { const b = document.querySelector('#overlay [data-k="anonimo"]'); return b && b.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 3000 }).catch(() => {});
      bien(o.srv.ajustes.length === 2 && o.srv.ajustes[1].anonimo === true, 'Preferencias: POST /api/vip/ajustes {anonimo: true}');
      await o.page.$eval('#overlay [data-k="anonimo"]', (el) => el.scrollIntoView({ block: 'center' }));
      await sinDesborde(o.page, 'Preferencias');
      await foto(o.page, 'preferencias');
      await cerrar(o, 'VIP 3');
    }

    /* ---- 5. Sin nivel (nunca compró) pero con un cofre de su asociación ---- */
    {
      const caso = { vip: vip(0, { regalos: [JSON.parse(JSON.stringify(REGALOS[0]))] }) };
      const o = await abrir(browser, caso);
      await require('./hub_ayuda').verEnInicio(o.page, '[data-vip="tarjeta"] [data-vip="regalo"]', 8000);   // en la sede de Inicio (js/hub.js)
      const t = await texto(o.page, '[data-vip="tarjeta"]');
      bien(/Aún sin nivel VIP/.test(t) && /Cualquier compra en la tienda te da VIP 1 para siempre/.test(t) && /Regalo de Ballena Andina/.test(t), 'Sin nivel: invita a VIP 1 y muestra el cofre gratis');
      bien(!/regalo VIP del mes/.test(t), 'Sin nivel: sin regalo del mes');
      await sinDesborde(o.page, 'Sin nivel');
      await foto(o.page, 'sin_nivel', '[data-vip="tarjeta"]');
      await o.page.click('[data-vip="tarjeta"] [data-acc="abrir"]');
      await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 3000 });
      bien(/Desde VIP 1 recibes un regalo gratis cada mes/.test(await texto(o.page, '#overlay [data-vip="mensual"]')) && !(await o.page.$('#overlay [data-vip="nivel"].yo')), 'Sin nivel: la ventana explica el regalo mensual y no marca nivel');
      await cerrar(o, 'Sin nivel');
    }

    /* ---- 6. VIP 10 (ballena): nivel máximo ---- */
    {
      const caso = { vip: vip(10) };
      const o = await abrir(browser, caso);
      await require('./hub_ayuda').verEnInicio(o.page, '[data-vip="tarjeta"]', 8000);   // en "Más" de la sede (js/hub.js)
      await o.page.waitForFunction(() => { const c = document.querySelector('[data-vip="tarjeta"]'); return c && /Leyenda/.test(c.textContent); }, null, { timeout: 8000 }).catch(() => {});
      const t = await texto(o.page, '[data-vip="tarjeta"]');
      bien(/VIP 10 · Leyenda/.test(t) && /Mecenas legendario/.test(t) && /¡Llegaste al nivel máximo!/.test(t), 'VIP 10: "Leyenda · Mecenas legendario · ¡Llegaste al nivel máximo!"');
      await sinDesborde(o.page, 'VIP 10');
      await foto(o.page, 'vip10', '[data-vip="tarjeta"]');
      await cerrar(o, 'VIP 10');
    }

    /* ---- 7. Sin sesión: no hay tarjeta ni consulta ---- */
    {
      const o = await abrir(browser, { logueado: false });
      await o.page.waitForTimeout(1200);
      bien(!(await o.page.$('[data-vip="tarjeta"]')) && !(await o.page.evaluate(() => window.Hub && window.Hub.buscar('[data-vip="tarjeta"]'))) && o.srv.vipPedidos === 0, 'Sin sesión: no se muestra la tarjeta ni se consulta');
      await cerrar(o, 'Sin sesión');
    }

    /* ---- 8. Inglés ---- */
    {
      const caso = { vip: vip(4, { regalos: [JSON.parse(JSON.stringify(REGALOS[1]))] }) };
      const o = await abrir(browser, caso, BASE + '/?lang=en');
      await require('./hub_ayuda').verEnInicio(o.page, '[data-vip="tarjeta"]', 8000);   // en "Más" de la sede (js/hub.js)
      await o.page.waitForFunction(() => { const c = document.querySelector('[data-vip="tarjeta"]'); return c && /Your VIP level/.test(c.textContent) && c.querySelector('[data-vip="regalo"]'); }, null, { timeout: 8000 }).catch(() => {});
      const t = await texto(o.page, '[data-vip="tarjeta"]');
      bien(/VIP 4 · Jade/.test(t) && /Executive Producer/.test(t) && /Gift from an anonymous company/.test(t) && /Open/.test(t), 'Inglés: tarjeta traducida');
      await sinDesborde(o.page, 'Inglés');
      await foto(o.page, 'en', '[data-vip="tarjeta"]');
      await cerrar(o, 'Inglés');
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${bien_} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
