/* Prueba de las compras del App Store en la app de iPhone (js/appstore.js, js/ios.js y su uso en js/ui.js).
   Parte A — módulo solo (node + vm, sin navegador): un puente nativo FALSO (window.webkit.messageHandlers.tukanAppStore con
     postMessage que devuelve una Promise) y un fetch falso. Revisa: ids envivo.<id> ↔ <id>, precios, comprar → servidor →
     terminar, cancelado / pendiente / error del App Store, servidor caído (NO se termina), respuesta definitiva (sí se
     termina), sin sesión, compra en curso, pendientes al abrir, restaurar (sin terminar), evento 'tukanAppStore' y que sin
     puente o fuera del iPhone no haga NADA.
   Parte B — el juego real en un celular 360x780 con Playwright (servidor imitado como en tests/test_iphone.js):
     ios_tienda   – iPhone (User-Agent TukanIOS) CON puente: precios del App Store, botones de comprar, «Restaurar compras»,
                    ningún Plux / PayPal / Google Play; comprar → /api/apple/verificar con apple_cuenta → terminar;
                    pendientes al abrir; restaurar; el VIP y el Pase con sus precios; nunca /api/orden ni /api/google/verificar.
     ios_sin      – iPhone SIN puente (app vieja): nada de dinero real (como siempre) y sin «Restaurar compras».
     web_puente   – un navegador normal con un puente (sin TukanIOS): sigue siendo la web (Plux), sin App Store.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_appstore.js   (capturas en tests/capturas/appstore_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* =================== Parte A: el módulo solo =================== */
function cargarModulo(o) {
  o = o || {};
  const msgs = [];
  const pedidos = [];
  const oyentes = {};
  const puente = o.sinPuente ? null : {
    postMessage(m) {
      msgs.push(JSON.parse(JSON.stringify(m)));
      const r = (o.respuestas || {})[m.accion];
      return Promise.resolve(typeof r === 'function' ? r(m) : r === undefined ? { ok: true } : r);
    },
  };
  const win = {
    navigator: { userAgent: o.ua === undefined ? 'Mozilla/5.0 (iPhone) Mobile/15E148 TukanIOS/1.1.0' : o.ua },
    location: { search: '' },
    localStorage: (() => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; })(),
    document: { documentElement: { classList: { add() {} } } },
    addEventListener(t, f) { (oyentes[t] = oyentes[t] || []).push(f); },
    dispatchEvent(ev) { (oyentes[ev.type] || []).forEach((f) => f(ev)); },
    Api: { logueado: () => o.logueado !== false, estado: { apple_cuenta: '11111111-2222-5333-8444-555555555555' } },
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      pedidos.push({ url, body, cab: init.headers });
      const r = typeof o.servidor === 'function' ? o.servidor(body) : { status: 200, j: { ok: true, nueva: true } };
      if (r === 'red') throw new TypeError('Failed to fetch');
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.j };
    },
    setTimeout, clearTimeout, AbortController, JSON, Promise, Object, Array, Number, String,
  };
  if (puente) win.webkit = { messageHandlers: { tukanAppStore: puente } };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/ios.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/appstore.js'), 'utf8'), win);
  return { win, AS: win.AppStore, msgs, pedidos, evento: (detail) => win.dispatchEvent({ type: 'tukanAppStore', detail }) };
}

async function parteA() {
  console.log('\n— Parte A: js/appstore.js con un puente falso —');
  {
    const m = cargarModulo({ respuestas: { productos: { ok: true, productos: [{ id: 'envivo.creditos_250', titulo: '250 créditos', descripcion: 'x', precio: 'US$2.49', moneda: 'USD', valor: 2.49 }, { id: 'envivo.sin_precio' }] } } });
    bien(m.win.TukanIOS.conTienda() && !m.win.TukanIOS.sinTienda() && m.AS.enApp() && await m.AS.disponible(), 'iPhone con puente: TukanIOS.conTienda(), AppStore.enApp() y disponible()');
    const l = await m.AS.productos(['creditos_250', 'inicio']);
    bien(m.msgs[0].accion === 'productos' && JSON.stringify(m.msgs[0].ids) === '["envivo.creditos_250","envivo.inicio"]', 'productos(): pide al puente los ids con «envivo.»');
    bien(l.length === 1 && l[0].id === 'creditos_250' && l[0].precio === 'US$2.49' && l[0].valor === 2.49, 'productos(): devuelve los ids del catálogo con el precio del App Store (y salta los que no traen precio)');
  }
  {
    const m = cargarModulo({ respuestas: { comprar: { ok: true, estado: 'comprado', jws: 'a.b.c', transaccion: '2000000000000001', producto: 'envivo.creditos_250' } } });
    const r = await m.AS.comprar('creditos_250');
    const c = m.msgs.find((x) => x.accion === 'comprar');
    bien(c && c.id === 'envivo.creditos_250' && c.cuenta === '11111111-2222-5333-8444-555555555555', 'comprar(): puente «comprar» con envivo.<id> y la cuenta (apple_cuenta del estado)');
    const p = m.pedidos[0];
    bien(p && p.url === '/api/apple/verificar' && p.body.producto === 'creditos_250' && p.body.jws === 'a.b.c' && p.cab['X-Envivo'] === '1' && p.cab['X-EnVivo-Canal'] === 'ios', 'comprar(): POST /api/apple/verificar {producto, jws} con X-Envivo y X-EnVivo-Canal: ios');
    const t = m.msgs.find((x) => x.accion === 'terminar');
    bien(r.ok && r.estado === 'entregado' && t && t.transaccion === '2000000000000001' && m.msgs.indexOf(t) > m.msgs.indexOf(c), 'comprar(): el servidor entregó → «terminar» DESPUÉS, con la transacción; resultado ok / entregado');
    const r2 = await (cargarModulo({ respuestas: { comprar: { ok: true, jws: 'a.b.c', transaccion: '9', producto: 'envivo.inicio' } }, servidor: () => ({ status: 200, j: { ok: true, nueva: false } }) })).AS.comprar('inicio');
    bien(r2.ok && r2.estado === 'ya_entregado', 'comprar(): ya estaba entregada → ok / ya_entregado');
  }
  for (const [estado, esperado] of [['cancelado', 'cancelado'], ['pendiente', 'pendiente'], ['error', 'error']]) {
    const m = cargarModulo({ respuestas: { comprar: { ok: false, estado, mensaje: 'x' } } });
    const r = await m.AS.comprar('creditos_250');
    bien(!r.ok && r.estado === esperado && !m.pedidos.length && !m.msgs.some((x) => x.accion === 'terminar'), `App Store «${estado}» → ${esperado}, sin llamar al servidor ni terminar`);
  }
  {
    const m = cargarModulo({ respuestas: { comprar: { ok: true, jws: 'a.b.c', transaccion: '7', producto: 'envivo.creditos_250' } }, servidor: () => ({ status: 502, j: { ok: false, codigo: 'error_servidor', error: 'x' } }) });
    const r = await m.AS.comprar('creditos_250');
    bien(!r.ok && r.reintentar && !m.msgs.some((x) => x.accion === 'terminar'), 'Servidor caído (502): NO se termina (Apple la vuelve a dar en «pendientes»)');
    const m2 = cargarModulo({ respuestas: { comprar: { ok: true, jws: 'a.b.c', transaccion: '7', producto: 'envivo.creditos_250' } }, servidor: () => 'red' });
    const r2 = await m2.AS.comprar('creditos_250');
    bien(!r2.ok && r2.codigo === 'sin_conexion' && !m2.msgs.some((x) => x.accion === 'terminar'), 'Sin internet: NO se termina');
    const m3 = cargarModulo({ respuestas: { comprar: { ok: true, jws: 'a.b.c', transaccion: '8', producto: 'envivo.creditos_250' } }, servidor: () => ({ status: 409, j: { ok: false, codigo: 'apple_otra_cuenta', error: 'otra cuenta' } }) });
    const r3 = await m3.AS.comprar('creditos_250');
    bien(!r3.ok && r3.codigo === 'apple_otra_cuenta' && m3.msgs.some((x) => x.accion === 'terminar' && x.transaccion === '8'), 'Respuesta definitiva (409 apple_otra_cuenta): se termina (no se repetiría siempre)');
    const m4 = cargarModulo({ respuestas: { comprar: { ok: true, jws: 'a.b.c', transaccion: '9', producto: 'envivo.creditos_250' } }, servidor: () => ({ status: 402, j: { ok: false, codigo: 'apple_invalida', error: 'x' } }) });
    await m4.AS.comprar('creditos_250');
    bien(!m4.msgs.some((x) => x.accion === 'terminar'), 'Firma no aceptada por el servidor (402 apple_invalida): NO se termina (se reintenta)');
  }
  {
    const m = cargarModulo({ logueado: false });
    const r = await m.AS.comprar('creditos_250');
    bien(r.estado === 'sesion_requerida' && !m.msgs.length, 'Sin sesión: sesion_requerida, sin abrir el App Store');
    let soltar;
    const m2 = cargarModulo({ respuestas: { comprar: () => new Promise((ok) => { soltar = ok; }) } });
    const p1 = m2.AS.comprar('creditos_250');
    const r2 = await m2.AS.comprar('creditos_700');
    bien(r2.estado === 'ocupado', 'Dos compras a la vez: la segunda → ocupado');
    soltar({ ok: false, estado: 'cancelado' }); await p1;
  }
  {
    const lista = [{ jws: 'j1', transaccion: '101', producto: 'envivo.creditos_250' }, { jws: 'j2', transaccion: '102', producto: 'envivo.inicio' }];
    const m = cargarModulo({ respuestas: { pendientes: { ok: true, transacciones: lista } }, servidor: (b) => ({ status: 200, j: { ok: true, nueva: b.jws === 'j1' } }) });
    const r = await m.AS.restaurar();
    bien(r.revisadas === 2 && JSON.stringify(r.entregadas) === '["creditos_250"]' && m.pedidos.map((p) => p.body.producto).join() === 'creditos_250,inicio', 'restaurar(): «pendientes» → servidor con los ids del catálogo; entregadas solo las nuevas');
    bien(m.msgs.filter((x) => x.accion === 'terminar').map((x) => x.transaccion).join() === '101,102', 'restaurar(): termina cada pendiente que el servidor confirmó');
    const m2 = cargarModulo({ respuestas: { restaurar: { ok: true, transacciones: lista } }, servidor: () => ({ status: 200, j: { ok: true, nueva: false } }) });
    const r2 = await m2.AS.restaurarCompras();
    bien(r2.revisadas === 2 && !r2.entregadas.length && m2.msgs.some((x) => x.accion === 'restaurar') && !m2.msgs.some((x) => x.accion === 'terminar'), 'restaurarCompras(): puente «restaurar», el servidor no entrega dos veces, sin «terminar»');
    const m3 = cargarModulo({ respuestas: { restaurar: { ok: true, transacciones: [] } } });
    const r3 = await m3.AS.restaurarCompras();
    bien(r3.revisadas === 0 && !r3.omitido, 'restaurarCompras() sin compras: nada que restaurar');
  }
  {
    const m = cargarModulo();
    const vistos = [];
    m.AS.escuchar((info) => vistos.push(info));
    m.evento({ tipo: 'transaccion', jws: 'jx', transaccion: '303', producto: 'envivo.pase_premium' });
    await espera(30);
    bien(m.pedidos.length === 1 && m.pedidos[0].body.producto === 'pase_premium' && m.msgs.some((x) => x.accion === 'terminar' && x.transaccion === '303') && vistos.length === 1 && vistos[0].entregadas[0] === 'pase_premium',
      'Evento «tukanAppStore» (aprobada más tarde): servidor → terminar → avisa a ui.js');
  }
  {
    const m = cargarModulo({ sinPuente: true });
    const r = await m.AS.comprar('creditos_250');
    bien(!m.AS.enApp() && m.win.TukanIOS.sinTienda() && r.estado === 'no_disponible' && !(await m.AS.productos(['creditos_250'])).length && (await m.AS.restaurar()).omitido === 'no_disponible', 'iPhone SIN puente (app vieja): enApp() false, sinTienda(), nada se compra ni se pide');
    const w = cargarModulo({ ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' });
    bien(!w.AS.enApp() && !w.win.TukanIOS.conTienda() && (await w.AS.comprar('creditos_250')).estado === 'no_disponible', 'Con un puente pero fuera del iPhone (sin TukanIOS): el App Store queda apagado');
  }
}

/* =================== Parte B: el juego real =================== */
const BASE = 'http://envivo.test';
const pagina = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TukanIOS/1.1.0';
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const prod = (id, nombre, precio, creditos, tipo, extra) => Object.assign({ id, nombre, detalle: nombre, precio, creditos, una_vez: false, tipo, precio_base: precio, creditos_base: creditos, oferta: null }, extra || {});
const PRODUCTOS = [
  prod('creditos_250', '250 créditos', 1.99, 250, 'creditos'), prod('creditos_700', '700 créditos', 4.99, 700, 'creditos'),
  prod('creditos_1500', '1.500 créditos', 9.99, 1500, 'creditos'), prod('creditos_3200', '3.200 créditos', 19.99, 3200, 'creditos'),
  prod('bienvenida', 'Oferta de bienvenida', 0.99, 150, 'bienvenida', { una_vez: true }), prod('inicio', 'Paquete de inicio', 2.99, 200, 'inicio', { una_vez: true }),
  prod('tarjeta_mensual', 'Tarjeta mensual', 4.99, 0, 'tarjeta'), prod('vip30', 'Pase VIP 30 días', 9.99, 0, 'vip'),
  prod('pack_obra_s', 'Pack de obra S', 1.99, 0, 'pack_obra'),
];
const VIP = {
  ok: true, nivel: 4, insignia: 'jade', progreso: { puntos: 640, siguiente: 5, siguiente_puntos: 1000, faltan: 360, pct: 64 }, intentos_extra: 1, slots_obra: 1,
  niveles: Array.from({ length: 10 }, (_, i) => ({ nivel: i + 1, puntos: [10, 100, 250, 500, 1000, 2000, 4000, 7000, 12000, 20000][i], insignia: 'x', intentos_extra: 0, slots_obra: 1, mensual: [] })),
  mensual: { disponible: false, reclamado: true, contenido: [], proximo: '2026-11-01' }, regalos: [],
  ofertas: [{ id: 3, producto: 'oferta_vip_m', nombre: 'Oferta VIP: Productora en ascenso', detalle: '900 créditos', precio: 4.99, creditos: 900, entregas: [], quedan: 2, vence: '2026-10-31T23:00:00Z' }],
  ajustes: { anonimo: false, ocultar_mecenas: false },
};
const PASE = {
  ok: true, ahora: 1792800000, temporada: { numero: 1, tema: 'calaveras', icono: '💀', nombre: 'Temporada 1', nombre_tema: 'Noche', inicio: '2026-10-19', fin: '2026-11-16', quedan_seg: 2000000 },
  nivel: 6, niveles: 40, xp: 2400, xp_nivel: 120, xp_por_nivel: 400, premium: false, plus: false, pistas: { gratis: [], premium: [] }, por_reclamar: { gratis: 0, premium: 0, total: 0, premium_esperando: 3 },
  creditos_dados: 0, creditos_tope: 420, saltos: { usados: 0, max: 10, precio: 150, max_ahora: 10 }, xp_hoy: 120, xp_tope_dia: 700, xp_fuentes: {},
  misiones: { diarias: [], diarias_fin: '2026-10-24T05:00:00Z', semanales: [], semanales_fin: '2026-10-26T05:00:00Z' },
  productos: { pase_premium: { id: 'pase_premium', precio: 4.99, activo: true, plus: false, niveles: 0 }, pase_premium_plus: { id: 'pase_premium_plus', precio: 9.99, activo: true, plus: true, niveles: 10 } },
  gracia_dias: 3, anterior: null,
};
// Precios del App Store (distintos a los del servidor: así se ve de dónde salen). pack_obra_s NO está en el App Store.
const APPLE = { 'envivo.creditos_250': 'US$2.49', 'envivo.creditos_700': 'US$5.99', 'envivo.creditos_1500': 'US$11.99', 'envivo.creditos_3200': 'US$23.99', 'envivo.bienvenida': 'US$1.29',
  'envivo.inicio': 'US$3.49', 'envivo.tarjeta_mensual': 'US$5.99', 'envivo.vip30': 'US$11.99', 'envivo.pase_premium': 'US$5.99', 'envivo.pase_premium_plus': 'US$11.99', 'envivo.oferta_vip_m': 'US$5.99' };
const CUENTA = '6b0c3a1e-0f4e-5d2a-9c7b-1a2b3c4d5e6f';

/* Puente nativo falso (se inyecta antes de cargar la página, como lo hace WKWebView). */
function puenteFalso(cfg) {
  const st = window.__as = { msgs: [], cfg };
  window.webkit = { messageHandlers: { tukanAppStore: { postMessage(m) {
    st.msgs.push(JSON.parse(JSON.stringify(m)));
    if (m.accion === 'productos') return Promise.resolve({ ok: true, productos: m.ids.filter((id) => cfg.precios[id]).map((id) => ({ id, titulo: id, descripcion: '', precio: cfg.precios[id], moneda: 'USD', valor: parseFloat(cfg.precios[id].replace(/[^\d.]/g, '')) })) });
    if (m.accion === 'comprar') return Promise.resolve(cfg.comprar === 'cancelado' ? { ok: false, estado: 'cancelado' } : { ok: true, estado: 'comprado', jws: 'jws.de.' + m.id, transaccion: '30000000000000' + st.msgs.length, producto: m.id });
    if (m.accion === 'pendientes') return Promise.resolve({ ok: true, transacciones: cfg.pendientes || [] });
    if (m.accion === 'restaurar') return Promise.resolve({ ok: true, transacciones: cfg.restaurar || [] });
    return Promise.resolve({ ok: true });
  } } } };
}

async function abrir(browser, caso) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' }, caso.ua ? { userAgent: caso.ua } : {}));
  await ctx.addInitScript(FECHA_FIJA);
  if (caso.puente) await ctx.addInitScript(puenteFalso, caso.puente);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { pedidas: {}, apple: [], respuesta: caso.respuesta || 'ok', creditos: 1340 };
  const estado = () => ({ ok: true, tienda: { productos: PRODUCTOS, premium: [{ id: 'dron4k', nombre: 'Dron 4K', detalle: 'x', creditos: 450, vip: false, tipo: 'equipo', entrega: { tipo: 'item', item: 'dron4k' } }] },
    logueado: true, entregas: [], inventario: [], plux: { disponible: true, ambiente: 'produccion' }, paypal: { disponible: true, ambiente: 'produccion', minimo: 4.99 }, inicio_comprado: false,
    jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: srv.creditos, vip_activo: false, vip_nivel: 4, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' }, apple_cuenta: CUENTA });
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
      if (u.pathname === '/api/apple/verificar') {
        let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) { b = null; }
        srv.apple.push({ body: b, canal: req.headers()['x-envivo-canal'] || '' });
        if (srv.respuesta === 'caido') return json(502, { ok: false, error: 'x', codigo: 'error_servidor' });
        srv.creditos += 250;
        return json(200, Object.assign(estado(), { ok: true, nueva: !/restaurado/.test(b && b.jws || ''), estado_compra: 'entregado', compra: { id: 1, producto: b && b.producto, estado: 'pagado', canal: 'apple' } }));
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
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"]', { timeout: 4000 }); } catch (e) { /* sin bienvenida */ }
  for (let k = 0; k < 5; k++) {
    const b = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
    if (!(await b.count())) break;
    await b.first().click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { ctx, page, errores, srv };
}
async function irTienda(page) {
  await page.click('nav button[data-tab="tienda"]');
  await page.waitForSelector('#tab-tienda .tv-trust', { timeout: 8000 });
  await page.waitForTimeout(700);
}
async function subT(page, k) { const b = page.locator(`#tab-tienda .subnav [data-act="sub"][data-k="${k}"]`); if (await b.count()) { await b.click(); await page.waitForTimeout(350); } }
const textoTienda = (page) => page.$eval('#tab-tienda', (el) => el.innerText).catch(() => '');
const msgs = (page) => page.evaluate(() => (window.__as ? window.__as.msgs : []));
const PAGOS = /Plux|PayPal|Google Play|juego\.tukanec\.com|tarjeta de crédito|Pagar con/i;
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  await o.ctx.close();
}

async function parteB() {
  console.log('\n— Parte B: el juego en un iPhone simulado —');
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    /* ---------- 1) iPhone CON el App Store ---------- */
    {
      const pend = [{ jws: 'jws.pendiente', transaccion: '400000000000001', producto: 'envivo.creditos_700' }];
      const o = await abrir(browser, { ua: UA_IOS, puente: { precios: APPLE, pendientes: pend, restaurar: [{ jws: 'jws.restaurado', transaccion: '500000000000001', producto: 'envivo.inicio' }] } });
      bien(await o.page.evaluate(() => document.documentElement.classList.contains('tukan-ios-tienda') && window.TukanIOS.conTienda() && window.AppStore.enApp() && !window.GooglePlay.enApp()),
        'iPhone con puente: clase tukan-ios-tienda, TukanIOS.conTienda(), AppStore.enApp(); nunca Google Play');
      await o.page.waitForTimeout(500);
      const m0 = await msgs(o.page);
      const pp = m0.find((x) => x.accion === 'productos');
      bien(pp && pp.ids.every((id) => /^envivo\.[a-z0-9_]+$/.test(id)) && pp.ids.includes('envivo.creditos_250') && pp.ids.includes('envivo.pase_premium'), 'Al abrir: pide al App Store los precios con ids envivo.<id> (también los productos con pantalla propia)');
      bien(m0.some((x) => x.accion === 'pendientes') && o.srv.apple.some((a) => a.body.jws === 'jws.pendiente' && a.body.producto === 'creditos_700') && m0.some((x) => x.accion === 'terminar' && x.transaccion === '400000000000001'),
        'Al abrir: compra pendiente (pagada sin entregar) → /api/apple/verificar → terminar');
      await irTienda(o.page);
      await subT(o.page, 'creditos');
      let t = await textoTienda(o.page);
      bien(/US\$2\.49/.test(t) && /US\$23\.99/.test(t) && !/\$\s?1[.,]99|\$\s?19[.,]99/.test(t), 'Tienda: precios del App Store (US$2.49…), no los del servidor ($1.99…)');
      bien(!PAGOS.test(t), 'Tienda: sin Pago Plux, PayPal, Google Play ni enlaces de pago' + (PAGOS.test(t) ? ' → ' + t.match(PAGOS)[0] : ''));
      bien(/App Store/.test(t) && (await o.page.locator('#tab-tienda [data-act="as-restaurar"]').count()) === 1, 'Tienda: «Pagos procesados por el App Store» y botón «Restaurar compras»');
      const nCompras = await o.page.locator('#tab-tienda [data-act="comprar"]').count();
      bien(nCompras >= 4, `Tienda: botones de comprar (${nCompras})`);
      await o.page.screenshot({ path: path.join(OUT, 'appstore_tienda.png'), fullPage: true });
      // Comprar
      const antes = o.srv.apple.length;
      await o.page.click('[data-prod="creditos_250"] [data-act="comprar"]');
      await o.page.waitForTimeout(900);
      const m1 = await msgs(o.page);
      const c = m1.filter((x) => x.accion === 'comprar').pop();
      const v = o.srv.apple[antes];
      bien(c && c.id === 'envivo.creditos_250' && c.cuenta === CUENTA, 'Comprar: puente «comprar» con envivo.creditos_250 y apple_cuenta');
      bien(v && v.body.producto === 'creditos_250' && v.body.jws === 'jws.de.envivo.creditos_250' && v.canal === 'ios', 'Comprar: POST /api/apple/verificar {producto, jws} (X-EnVivo-Canal: ios)');
      bien(c && m1.some((x) => x.accion === 'terminar' && m1.indexOf(x) > m1.indexOf(c)), 'Comprar: después del servidor, «terminar»');
      const toast = await o.page.$eval('#toast', (el) => el.innerText).catch(() => '');
      bien(/Apple/.test(toast) || /cuenta/.test(toast), 'Comprar: aviso de compra lista' + (toast ? ' («' + toast.trim().slice(0, 60) + '»)' : ''));
      // Restaurar compras
      await o.page.click('#tab-tienda [data-act="as-restaurar"]');
      await o.page.waitForTimeout(900);
      const m2 = await msgs(o.page);
      bien(m2.some((x) => x.accion === 'restaurar') && o.srv.apple.some((a) => a.body.jws === 'jws.restaurado' && a.body.producto === 'inicio') && !m2.some((x) => x.accion === 'terminar' && x.transaccion === '500000000000001'),
        'Restaurar compras: puente «restaurar» → servidor (idempotente), sin «terminar»');
      const toast2 = await o.page.$eval('#toast', (el) => el.innerText).catch(() => '');
      bien(/restaurar|todo ya está/i.test(toast2), 'Restaurar compras (ya estaba en la cuenta): «No hay compras para restaurar»' + (toast2 ? ' («' + toast2.trim().slice(0, 60) + '»)' : ''));
      // Compra aprobada más tarde (evento de la app)
      const antes3 = o.srv.apple.length;
      await o.page.evaluate(() => window.dispatchEvent(new CustomEvent('tukanAppStore', { detail: { tipo: 'transaccion', jws: 'jws.tarde', transaccion: '600000000000001', producto: 'envivo.creditos_1500' } })));
      await o.page.waitForTimeout(800);
      bien(o.srv.apple.length === antes3 + 1 && o.srv.apple[antes3].body.producto === 'creditos_1500' && (await msgs(o.page)).some((x) => x.accion === 'terminar' && x.transaccion === '600000000000001'),
        'Evento «tukanAppStore» (aprobada más tarde): servidor → terminar');
      // VIP y Pase con precios del App Store
      await subT(o.page, 'vip');
      const bv = await o.page.$('#tv-vip .tv-vipcard .btn');
      if (bv) {
        await bv.click();
        await o.page.waitForSelector('#overlay.on [data-vip="modal"]', { timeout: 5000 }).catch(() => null);
        await o.page.waitForTimeout(700);
        const mv = await o.page.$eval('#overlay.on', (el) => ({ t: el.innerText, c: el.querySelectorAll('[data-act="comprar"]').length })).catch(() => ({ t: '', c: 0 }));
        bien(mv.c > 0 && /US\$5\.99/.test(mv.t) && !PAGOS.test(mv.t), 'VIP: la oferta se vende con el precio del App Store');
        await o.page.click('#overlay.on [data-act="close"]').catch(() => {});
      }
      await subT(o.page, 'pase');
      const ab = await o.page.$('#tv-pase [data-ext="pase"][data-acc="abrir"]');
      if (ab) {
        await ab.click();
        await o.page.waitForSelector('#pase-ov', { timeout: 6000 }).catch(() => null);
        await o.page.waitForTimeout(700);
        const p = await o.page.$eval('#pase-ov', (el) => ({ t: el.innerText, c: el.querySelectorAll('[data-pase-comprar]').length })).catch(() => ({ t: '', c: 0 }));
        bien(p.c === 2 && /US\$5\.99/.test(p.t) && /US\$11\.99/.test(p.t), 'Pase: Premium y Plus con los precios del App Store');
        await o.page.evaluate(() => { try { window.Pase.cerrar(); } catch (e) { /* nada */ } });
      }
      bien(!o.srv.pedidas['/api/orden'] && !o.srv.pedidas['/api/google/verificar'] && !o.srv.pedidas['/api/paypal/crear'] && !o.srv.pedidas['/api/tukanpagos/crear'], 'iPhone con App Store: nunca /api/orden, /api/google/verificar, PayPal ni Tukán Pagos');
      await cerrar(o, 'iPhone con App Store');
    }

    /* ---------- 2) Servidor caído al comprar: no se termina; compra cancelada: no se verifica ---------- */
    {
      const o = await abrir(browser, { ua: UA_IOS, puente: { precios: APPLE }, respuesta: 'caido' });
      await irTienda(o.page); await subT(o.page, 'creditos');
      await o.page.click('[data-prod="creditos_250"] [data-act="comprar"]');
      await o.page.waitForTimeout(900);
      bien(o.srv.apple.length === 1 && !(await msgs(o.page)).some((x) => x.accion === 'terminar'), 'Servidor caído: se intentó verificar y NO se terminó (queda en «pendientes»)');
      await cerrar(o, 'Servidor caído');
      const o2 = await abrir(browser, { ua: UA_IOS, puente: { precios: APPLE, comprar: 'cancelado' } });
      await irTienda(o2.page); await subT(o2.page, 'creditos');
      await o2.page.click('[data-prod="creditos_250"] [data-act="comprar"]');
      await o2.page.waitForTimeout(600);
      bien(!o2.srv.apple.length, 'Compra cancelada en el App Store: no se llama al servidor');
      await cerrar(o2, 'Cancelada');
    }

    /* ---------- 3) iPhone SIN puente (app vieja): nada de dinero real ---------- */
    {
      const o = await abrir(browser, { ua: UA_IOS });
      bien(await o.page.evaluate(() => window.TukanIOS.sinTienda() && !window.AppStore.enApp() && !document.documentElement.classList.contains('tukan-ios-tienda')), 'iPhone sin puente: TukanIOS.sinTienda(), sin App Store');
      await irTienda(o.page);
      const txt = [];
      for (const k of ['ofertas', 'creditos', 'vip', 'pase']) { await subT(o.page, k); txt.push(await textoTienda(o.page)); }
      const todo = txt.join('\n');
      bien(!/\$\s?\d|US\$|USD/.test(todo) && !PAGOS.test(todo) && !(await o.page.locator('#tab-tienda [data-act="comprar"], #tab-tienda [data-act="as-restaurar"]').count()),
        'iPhone sin puente: ningún precio en dinero real, botón de comprar ni «Restaurar compras»');
      bien(!o.srv.pedidas['/api/apple/verificar'] && !o.srv.pedidas['/api/orden'], 'iPhone sin puente: nunca se pide /api/apple/verificar ni /api/orden');
      await cerrar(o, 'iPhone sin puente');
    }

    /* ---------- 4) Navegador normal con un «puente» (sin TukanIOS): sigue siendo la web ---------- */
    {
      const o = await abrir(browser, { puente: { precios: APPLE } });
      bien(await o.page.evaluate(() => !window.TukanIOS.activo() && !window.AppStore.enApp()), 'Web con puente pero sin TukanIOS: el App Store queda apagado');
      await irTienda(o.page); await subT(o.page, 'creditos');
      const t = await textoTienda(o.page);
      bien(/\$\s?1[.,]99/.test(t) && /Pago Plux/.test(t) && !/US\$2\.49/.test(t) && !(await o.page.locator('#tab-tienda [data-act="as-restaurar"]').count()), 'Web: precios del servidor y Pago Plux, sin App Store ni «Restaurar compras»');
      bien(!(await msgs(o.page)).length, 'Web: nunca se le habla al puente');
      await cerrar(o, 'Web con puente');
    }
  } catch (e) {
    fallas++;
    console.error('❌ Error en la prueba:', e);
  } finally {
    await browser.close();
  }
}

(async () => {
  try { await parteA(); } catch (e) { fallas++; console.error('❌ Error en la parte A:', e); }
  await parteB();
  console.log(`\nApp Store (iPhone): ${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
