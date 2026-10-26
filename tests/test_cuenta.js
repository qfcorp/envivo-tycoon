/* Prueba de js/cuenta.js en el juego real (celular 390x844), con el servidor imitado:
     1. Registro: casillas "Acepto los Términos y la Política de privacidad" (enlaces) y "Tengo 16 años o más";
        sin marcarlas no se manda nada; marcadas, POST /api/registro lleva acepta_terminos y edad_16.
     2. Borrar mi cuenta (Tienda → Tu cuenta): explica qué se pierde, enlace a /borrar-cuenta.html, pide clave y BORRAR,
        clave mala -> error; bien -> sin sesión, aviso, y la partida de este dispositivo sigue.
     3. Cuenta vieja sin aceptar: antes de un modo en línea, el mercado y el chat sale UNA ventana; "Ahora no" no abre nada;
        aceptar -> POST /api/cuenta/terminos y abre lo que se tocó; después ya no se pide. Chat con 403 terminos_pendientes -> ventana.
     4. Inglés: textos traducidos.
   En todos: sin errores de JS y sin desborde horizontal. Capturas en tests/capturas/cuenta_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_cuenta.js */
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
const SAVE = 'envivo_tycoon_save_v1';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

async function abrir(browser, caso) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
  const srv = { logueado: !!caso.logueado, aceptados: caso.aceptados !== false, pedidos: [], claveBuena: 'ClaveBuena1', chat403: !!caso.chat403 };
  const estado = () => {
    const e = { ok: true, tienda: { productos: [], premium: [] }, logueado: srv.logueado, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' }, mercado: {} };
    if (srv.logueado) Object.assign(e, { jugador: { id: 7, nombre: 'QF', email: 'qf@envivo.test' }, creditos: 1234, vip_activo: false, servidor: { id: 1, nombre: 'Servidor 1' },
      terminos: { version: '2026-10', aceptados: srv.aceptados, aceptado_en: null, edad_minima: 16 } });
    return e;
  };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(RAIZ, 'index.html')) });
    if (u.pathname.startsWith('/api/')) {
      let body = null; try { body = req.postDataJSON(); } catch (e) { body = null; }
      if (req.method() === 'POST') srv.pedidos.push({ ruta: u.pathname, body });
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/registro') {
        if (!body || body.acepta_terminos !== true) return json(400, { ok: false, error: 'Para crear tu cuenta debes aceptar los Términos y la Política de privacidad.', codigo: 'terminos_requeridos' });
        if (body.edad_16 !== true) return json(400, { ok: false, error: 'Debes tener 16 años o más para tener una cuenta.', codigo: 'edad_requerida', edad: 16 });
        srv.logueado = true; srv.aceptados = true; return json(200, estado());
      }
      if (u.pathname === '/api/cuenta/borrar') {
        if (body.confirmar !== 'BORRAR') return json(400, { ok: false, error: 'Para borrar tu cuenta escribe BORRAR en mayúsculas.', codigo: 'confirmacion_requerida' });
        if (body.clave !== srv.claveBuena) return json(401, { ok: false, error: 'La clave no es correcta.', codigo: 'clave_incorrecta' });
        srv.logueado = false; return json(200, { ok: true, borrada: true });
      }
      if (u.pathname === '/api/cuenta/terminos') {
        if (req.method() === 'GET') return json(200, { ok: true, terminos: estado().terminos });
        if (!body || body.acepta_terminos !== true || body.edad_16 !== true) return json(400, { ok: false, error: 'Falta', codigo: 'terminos_requeridos' });
        srv.aceptados = true; return json(200, { ok: true, terminos: estado().terminos });
      }
      if (u.pathname === '/api/salir') { srv.logueado = false; return json(200, { ok: true }); }
      if (u.pathname === '/api/chat') {
        if (req.method() === 'POST') {
          if (!srv.aceptados || srv.chat403) return json(403, { ok: false, error: 'Antes de usar el chat acepta los Términos y la Política de privacidad (te lo pedimos una sola vez).', codigo: 'terminos_pendientes' });
          return json(200, { ok: true, mensaje: { id: 1, texto: body.texto, jugador_id: 7 } });
        }
        return json(200, { ok: true, mensajes: [] });
      }
      return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    }
    const f = path.join(RAIZ, decodeURIComponent(u.pathname).replace(/^\//, ''));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.html': 'text/html; charset=utf-8' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript((c) => {
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', c.idioma);
      if (c.partida) localStorage.setItem('envivo_tycoon_save_v1', c.partida);
    } catch (e) { /* nada */ }
  }, { idioma: caso.idioma || 'es', partida: caso.partida || null });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null && window.Api.estado && window.Cuenta, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  await cerrarVentanas(page);
  return { ctx, page, errores, srv };
}
async function cerrarVentanas(page) {
  for (let i = 0; i < 5; i++) {
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"], #overlay.on [data-act="partida"][data-k="local"], #overlay.on [data-act="partida"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const modalTxt = (page) => page.evaluate(() => (document.getElementById('overlay').classList.contains('on') ? document.getElementById('modal').innerText : ''));
const aTienda = async (page) => { await page.click('nav button[data-tab="tienda"]'); await page.waitForTimeout(300); };

async function partida(browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(FECHA_FIJA);
  const p = await ctx.newPage();
  await p.setContent('<html></html>');
  await p.addScriptTag({ path: path.join(RAIZ, 'js/datos.js') });
  await p.addScriptTag({ path: path.join(RAIZ, 'js/logic.js') });
  const s = await p.evaluate(() => { const s = window.Game.newGame(7); Object.assign(s, { day: 9, money: 31337, tutorialDone: true, chapter: 2 }); s.stats.events = 8; return window.Game.serialize(s); });
  await ctx.close();
  return s;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const SAVE_P = await partida(browser);
  try {
    /* ---------- 1. Registro con términos y edad ---------- */
    {
      const { ctx, page, errores, srv } = await abrir(browser, { partida: SAVE_P });
      await aTienda(page);
      await page.click('#tab-tienda [data-act="cuenta"][data-modo="registro"]');
      await page.waitForSelector('#formCuenta[data-modo="registro"]');
      bien(!!(await page.$('#cu-terminos')) && !!(await page.$('#cu-edad')), '1: el registro tiene las dos casillas');
      const links = await page.$$eval('#formCuenta .cu-check a', (as) => as.map((a) => [a.getAttribute('href'), a.target]));
      bien(JSON.stringify(links) === JSON.stringify([['/terminos.html', '_blank'], ['/privacidad.html', '_blank']]), '1: enlaces a /terminos.html y /privacidad.html (en otra pestaña): ' + JSON.stringify(links));
      const txt = await page.textContent('#formCuenta');
      bien(/Acepto los Términos y la Política de privacidad/.test(txt) && /Tengo 16 años o más/.test(txt), '1: textos "Acepto los Términos y la Política de privacidad" y "Tengo 16 años o más"');
      await page.fill('#cu-nombre', 'Productora QF'); await page.fill('#cu-email', 'qf@envivo.test'); await page.fill('#cu-clave', 'ClaveBuena1');
      await page.screenshot({ path: path.join(OUT, 'cuenta_registro.png') });
      await page.click('#cu-btn'); await page.waitForTimeout(250);
      bien(/Acepto los Términos/.test(await page.textContent('#cu-error')), '1: sin marcar -> aviso de términos');
      bien(!srv.pedidos.some((p) => p.ruta === '/api/registro'), '1: sin marcar no se manda el registro');
      await page.check('#cu-terminos'); await page.click('#cu-btn'); await page.waitForTimeout(250);
      bien(/16 años/.test(await page.textContent('#cu-error')), '1: sin la edad -> aviso de 16 años');
      await page.screenshot({ path: path.join(OUT, 'cuenta_registro_error.png') });
      await page.check('#cu-edad'); await page.click('#cu-btn');
      await page.waitForFunction(() => window.Api.logueado(), null, { timeout: 5000 }).catch(() => {});
      const reg = srv.pedidos.find((p) => p.ruta === '/api/registro');
      bien(reg && reg.body.acepta_terminos === true && reg.body.edad_16 === true && reg.body.email === 'qf@envivo.test', '1: POST /api/registro lleva acepta_terminos y edad_16');
      bien(await page.evaluate(() => window.Api.logueado()), '1: queda con la cuenta abierta');
      bien(!(await desborde(page)), '1: sin desborde horizontal');
      bien(errores.length === 0, '1: sin errores de JS ' + errores.join(' | '));
      await ctx.close();
    }

    /* ---------- 2. Borrar mi cuenta ---------- */
    {
      const { ctx, page, errores, srv } = await abrir(browser, { logueado: true, partida: SAVE_P });
      await aTienda(page);
      bien(!!(await page.$('#tab-tienda [data-act="cuenta-borrar"]')), '2: "Borrar mi cuenta" en la tarjeta de la cuenta');
      bien((await page.getAttribute('#tab-tienda a.cu-web', 'href')) === '/borrar-cuenta.html', '2: enlace a /borrar-cuenta.html');
      await page.locator('#tab-tienda [data-act="cuenta-borrar"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, 'cuenta_tienda.png') });
      await page.click('#tab-tienda [data-act="cuenta-borrar"]');
      await page.waitForSelector('#formBorrarCuenta');
      await page.waitForTimeout(400);   // la ventana sube con animación
      const t = await modalTxt(page);
      bien(/no se puede deshacer/.test(t) && /partida guardada en la nube/.test(t) && /1[.,\s]?234/.test(t) && /No hay devolución/.test(t), '2: explica qué se borra (nube, créditos 1234, compras sin devolución)');
      bien(/sigue|se queda/.test(t) && /sin cuenta/.test(t), '2: dice que la partida del dispositivo se queda');
      bien(await page.$eval('#cuB-btn', (b) => b.disabled), '2: el botón empieza apagado');
      await page.fill('#cuB-clave', 'otra'); await page.fill('#cuB-palabra', 'borra');
      bien(await page.$eval('#cuB-btn', (b) => b.disabled), '2: con "borra" sigue apagado');
      await page.fill('#cuB-palabra', 'borrar');
      bien(!(await page.$eval('#cuB-btn', (b) => b.disabled)), '2: con la clave y "borrar" se enciende');
      await page.screenshot({ path: path.join(OUT, 'cuenta_borrar.png') });
      await page.click('#cuB-btn'); await page.waitForTimeout(400);
      bien(/La clave no es correcta/.test(await page.textContent('#cuB-error')), '2: clave mala -> "La clave no es correcta."');
      bien(await page.evaluate(() => window.Api.logueado()), '2: con la clave mala sigue con sesión');
      await page.screenshot({ path: path.join(OUT, 'cuenta_borrar_error.png') });
      await page.fill('#cuB-clave', 'ClaveBuena1'); await page.click('#cuB-btn');
      await page.waitForFunction(() => !window.Api.logueado(), null, { timeout: 5000 }).catch(() => {});
      const b = srv.pedidos.filter((p) => p.ruta === '/api/cuenta/borrar').pop();
      bien(b && b.body.confirmar === 'BORRAR' && b.body.clave === 'ClaveBuena1', '2: POST /api/cuenta/borrar {clave, confirmar: "BORRAR"}');
      bien(!(await page.evaluate(() => window.Api.logueado())), '2: después de borrar, sin sesión');
      bien(!(await page.evaluate(() => document.getElementById('overlay').classList.contains('on'))), '2: la ventana se cerró');
      bien(/Tu cuenta fue borrada/.test(await page.textContent('#toast')), '2: aviso "Tu cuenta fue borrada…"');
      const local = await page.evaluate((k) => { try { const s = JSON.parse(localStorage.getItem(k)); return [s.day, s.money]; } catch (e) { return null; } }, SAVE);
      bien(local && local[0] === 9 && local[1] === 31337, '2: la partida de este dispositivo sigue (día 9, $31337): ' + JSON.stringify(local));
      bien(!!(await page.$('#tab-tienda [data-act="cuenta"][data-modo="registro"]')), '2: la Tienda vuelve a ofrecer crear cuenta');
      bien(!(await page.$('#chat-btn:not([hidden])')), '2: el botón del chat se escondió');
      bien(!(await desborde(page)), '2: sin desborde horizontal');
      bien(errores.length === 0, '2: sin errores de JS ' + errores.join(' | '));
      await ctx.close();
    }

    /* ---------- 3. Cuenta vieja: aceptar una vez antes de en línea, mercado y chat ---------- */
    {
      const { ctx, page, errores, srv } = await abrir(browser, { logueado: true, aceptados: false, partida: SAVE_P });
      bien(await page.evaluate(() => window.Cuenta.pendiente()), '3: Cuenta.pendiente() con terminos.aceptados = false');
      await page.click('nav button[data-tab="online"]'); await page.waitForTimeout(300);
      bien(!(await page.evaluate(() => document.getElementById('overlay').classList.contains('on'))), '3: el menú En línea se ve sin pedir nada');
      await page.click('#tab-online [data-act="online"][data-k="liga"]'); await page.waitForTimeout(300);
      let t = await modalTxt(page);
      bien(/Antes de seguir/.test(t) && /una sola vez/.test(t), '3: tocar Liga -> ventana "Antes de seguir"');
      bien(!(await page.$('#tab-online .onl-top')), '3: la Liga no se abrió todavía');
      await page.screenshot({ path: path.join(OUT, 'cuenta_aceptar.png') });
      await page.click('#overlay.on button.btn:not(.main)[data-act="close"]'); await page.waitForTimeout(300);
      bien(!(await page.evaluate(() => document.getElementById('overlay').classList.contains('on'))) && !(await page.$('#tab-online .onl-top')), '3: "Ahora no" cierra y no abre la Liga');
      await page.click('#tab-online [data-act="online"][data-k="liga"]'); await page.waitForTimeout(300);
      await page.click('#cuA-btn'); await page.waitForTimeout(200);
      bien(/Acepto los Términos/.test(await page.textContent('#cuA-error')), '3: aceptar sin marcar -> aviso');
      await page.check('#cuA-terminos'); await page.check('#cuA-edad'); await page.click('#cuA-btn');
      await page.waitForSelector('#tab-online .onl-top', { timeout: 4000 }).catch(() => {});
      const ac = srv.pedidos.filter((p) => p.ruta === '/api/cuenta/terminos');
      bien(ac.length === 1 && ac[0].body.acepta_terminos === true && ac[0].body.edad_16 === true, '3: POST /api/cuenta/terminos una vez con las dos casillas');
      bien(!!(await page.$('#tab-online .onl-top')), '3: después de aceptar se abre la Liga');
      await page.click('#tab-online [data-act="online"][data-k="hub"]'); await page.waitForTimeout(250);
      await page.click('#tab-online [data-act="online"][data-k="duelos"]'); await page.waitForTimeout(300);
      bien(!/Antes de seguir/.test(await modalTxt(page)) && !!(await page.$('#tab-online .onl-top')), '3: ya no se pide otra vez (Duelos abre directo)');
      bien(errores.length === 0, '3: sin errores de JS ' + errores.join(' | '));
      await ctx.close();
    }
    {
      // Mercado y chat (otra cuenta vieja)
      const { ctx, page, errores, srv } = await abrir(browser, { logueado: true, aceptados: false, partida: SAVE_P });
      await aTienda(page);
      const merc = await page.$('#tab-tienda [data-act="vista-tienda"][data-k="mercado"]');
      if (merc) {
        await merc.click(); await page.waitForTimeout(300);
        bien(/Antes de seguir/.test(await modalTxt(page)), '3b: tocar Mercado -> ventana de aceptar');
        await page.click('#overlay.on button.btn:not(.main)[data-act="close"]'); await page.waitForTimeout(250);
        bien(!(await page.$('#merc-cont')), '3b: "Ahora no" no abre el mercado');
      } else bien(false, '3b: no se encontró el botón Mercado en la Tienda');
      await page.waitForSelector('#chat-btn:not([hidden])', { timeout: 4000 }).catch(() => {});
      await page.click('#chat-btn'); await page.waitForTimeout(300);
      bien(/Antes de seguir/.test(await modalTxt(page)), '3b: tocar el chat -> ventana de aceptar');
      bien(await page.evaluate(() => document.getElementById('chat-panel').hidden), '3b: el chat no se abrió todavía');
      await page.check('#cuA-terminos'); await page.check('#cuA-edad'); await page.click('#cuA-btn');
      await page.waitForFunction(() => !document.getElementById('chat-panel').hidden, null, { timeout: 4000 }).catch(() => {});
      bien(!(await page.evaluate(() => document.getElementById('chat-panel').hidden)), '3b: después de aceptar se abre el chat');
      await page.screenshot({ path: path.join(OUT, 'cuenta_chat.png') });
      // El servidor igual dice terminos_pendientes (por ejemplo, la versión cambió): se pide aceptar ahí mismo
      srv.chat403 = true;
      await page.fill('#chat-texto', 'hola'); await page.click('#chat-form button[type="submit"]'); await page.waitForTimeout(500);
      bien(/Antes de seguir/.test(await modalTxt(page)), '3b: chat con 403 terminos_pendientes -> ventana de aceptar');
      bien(await page.evaluate(() => document.getElementById('chat-panel').hidden), '3b: …el chat se cierra para que se vea la ventana');
      await page.screenshot({ path: path.join(OUT, 'cuenta_chat_403.png') });
      srv.chat403 = false;
      await page.check('#cuA-terminos'); await page.check('#cuA-edad'); await page.click('#cuA-btn');
      await page.waitForFunction(() => !document.getElementById('chat-panel').hidden, null, { timeout: 4000 }).catch(() => {});
      bien(!(await page.evaluate(() => document.getElementById('chat-panel').hidden)), '3b: …al aceptar vuelve el chat');
      bien(!(await desborde(page)), '3b: sin desborde horizontal');
      bien(errores.length === 0, '3b: sin errores de JS ' + errores.join(' | '));
      await ctx.close();
    }

    /* ---------- 4. Inglés ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, { idioma: 'en', partida: SAVE_P });
      await aTienda(page);
      await page.click('#tab-tienda [data-act="cuenta"][data-modo="registro"]');
      await page.waitForSelector('#cu-terminos');
      const txt = await page.textContent('#formCuenta');
      bien(/I accept the Terms and the Privacy Policy/.test(txt) && /I am 16 or older/.test(txt), '4: inglés en el registro');
      await page.screenshot({ path: path.join(OUT, 'cuenta_registro_en.png') });
      await ctx.close();
      const b = await abrir(browser, { idioma: 'en', logueado: true, partida: SAVE_P });
      await aTienda(b.page);
      await b.page.click('#tab-tienda [data-act="cuenta-borrar"]');
      await b.page.waitForSelector('#formBorrarCuenta');
      const t = await modalTxt(b.page);
      bien(/cannot be undone/.test(t) && /Type DELETE to confirm/.test(t), '4: inglés al borrar (DELETE)');
      await b.page.fill('#cuB-clave', 'x'); await b.page.fill('#cuB-palabra', 'delete');
      bien(!(await b.page.$eval('#cuB-btn', (x) => x.disabled)), '4: "delete" sirve en inglés');
      await b.page.fill('#cuB-palabra', 'BORRAR');
      bien(!(await b.page.$eval('#cuB-btn', (x) => x.disabled)), '4: "BORRAR" sirve en cualquier idioma');
      bien(errores.length === 0 && b.errores.length === 0, '4: sin errores de JS ' + errores.concat(b.errores).join(' | '));
      await b.ctx.close();
    }
    /* ---------- 5. Los 10 idiomas tienen todas las claves ---------- */
    {
      const { ctx, page } = await abrir(browser, {});
      const src = fs.readFileSync(path.join(RAIZ, 'js/cuenta.js'), 'utf8');
      const ids = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
      const bloques = ids.map((l) => { const m = src.indexOf(`${/-/.test(l) ? `'${l}'` : l}: {`); return m; });
      bien(bloques.every((x) => x > 0), '5: hay diccionario para los 10 idiomas');
      const D = await page.evaluate(() => {
        const out = {};
        const ids = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
        const claves = ['acepto', 'edad', 'falta_terminos', 'falta_edad', 'borrar', 'borrar_web', 'b_intro', 'b_1', 'b_2', 'b_3', 'b_4', 'b_queda', 'b_local', 'b_clave', 'b_escribe', 'palabra', 'b_si', 'cancelar', 'b_falta_clave', 'b_falta_palabra', 'b_olvido', 'borrada', 'a_t', 'a_det', 'a_si', 'a_no', 'a_ok', 'e_clave', 'e_limite', 'e_red', 'terminos', 'privacidad'];
        const es = {};
        claves.forEach((k) => { es[k] = window.Cuenta.T(k, null, 'es'); });
        ids.forEach((l) => { out[l] = claves.filter((k) => l !== 'es' && window.Cuenta.T(k, null, l) === es[k] && !(l === 'pt-BR' && k === 'cancelar')); });
        return out;
      });
      const sinTraducir = Object.entries(D).filter(([, v]) => v.length).map(([l, v]) => l + ':' + v.join(','));
      bien(sinTraducir.length === 0, '5: ninguna clave se queda en español en otro idioma ' + sinTraducir.join(' '));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
