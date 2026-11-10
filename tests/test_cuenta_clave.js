/* "Cerrar sesión" y "Cambiar contraseña" donde el jugador busca su cuenta (reporte del dueño, nov. 2026: no encontraba
   cómo cerrar sesión y no había forma de cambiar la contraseña con la sesión abierta).
   Servidor real (php -S + server/tests/router.php, base temporal), celular 390x844, fecha fija 2026-06-10:
     1. Con sesión: tarjeta "Tu cuenta" en Inicio → Tu sede y en ⋯ Más, con "Cambiar contraseña" y "Cerrar sesión";
        en la Tienda → Tu cuenta sigue "Cerrar sesión" (la tarjeta lleva ahí con "Más opciones de la cuenta").
     2. Cambiar contraseña (ventana): validación (falta la actual, corta, no coinciden, igual), mostrar / ocultar,
        actual equivocada → error del servidor y la sesión sigue.
     3. Cambio bueno: aviso, la sesión de este celular sigue, la del otro aparato se cierra, la clave vieja ya no entra
        y la nueva sí.
     4. Cerrar sesión desde Tu sede: sin sesión, aviso, la partida de este celular sigue igual y NO se sube nada a la nube
        (nube-proteger); la tarjeta desaparece y en ⋯ Más sale "Entrar a tu cuenta".
   En todos: sin errores de JS, sin errores de PHP y sin desborde horizontal. Capturas en tests/capturas/cuenta_clave_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_cuenta_clave.js */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { abrirLugar } = require('./hub_ayuda');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Servidor real (temporal) ---------- */
const puertoLibre = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function arrancarServidor() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo-clave-'));
  fs.mkdirSync(path.join(tmp, 'datos'));
  const p = await puertoLibre();
  fs.writeFileSync(path.join(tmp, 'config.env'), `; SOLO PRUEBAS (tests/test_cuenta_clave.js)\nENVIVO_DB=${tmp}/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:${p}\nENVIVO_ZONA=America/Guayaquil\nPLUX_AMBIENTE=sandbox\nCORREO_REGISTRO=${tmp}/correos.log\n`);
  const log = fs.openSync(path.join(tmp, 'php.log'), 'a');
  const php = spawn('php', ['-d', 'log_errors=1', '-d', 'error_log=' + path.join(tmp, 'php_errores.log'), '-S', '127.0.0.1:' + p, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')],
    { env: Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(tmp, 'config.env'), PHP_CLI_SERVER_WORKERS: '4', TZ: 'America/Guayaquil', no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost' }), stdio: ['ignore', log, log] });
  const base = 'http://127.0.0.1:' + p;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/api/estado'); if (r.status) break; } catch (e) { /* aún no */ }
    await dormir(100);
  }
  const errPhp = () => { try { return [path.join(tmp, 'php.log'), path.join(tmp, 'php_errores.log')].filter(fs.existsSync).map((f) => fs.readFileSync(f, 'utf8')).join('\n').split('\n').filter((l) => /PHP (Warning|Fatal|Notice|Deprecated)|EN VIVO api/.test(l)); } catch (e) { return []; } };
  const correos = () => { try { return fs.readFileSync(path.join(tmp, 'correos.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
  return { base, cerrar: () => { try { php.kill(); } catch (e) { /* nada */ } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* nada */ } }, errPhp, correos };
}

/* ---------- Partida armada con la lógica real ---------- */
globalThis.window = globalThis;
require(path.join(RAIZ, 'js/datos.js'));
const G = require(path.join(RAIZ, 'js/logic.js')) || globalThis.Game;
function partida() {
  const s = G.newGame(7);
  s.storyDone = true; s.chapter = 3; s.chapterSeen = 3; s.tutorialDone = true;
  s.day = 40; s.lastWorkDay = 40; s.rep = 50; s.money = 54321; s.stats.events = 30;
  s.avisos = []; s.capCompletados = [];
  return G.serialize(s);
}

const CEL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-EC' };
async function contexto(browser, o) {
  const ctx = await browser.newContext(CEL);
  await ctx.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (o && o.galletas) await ctx.addCookies(o.galletas);
  await ctx.addInitScript((c) => {
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', 'es');
      if (c.partida) localStorage.setItem('envivo_tycoon_save_v1', c.partida);
    } catch (e) { /* nada */ }
  }, { partida: (o && o.partida) || null });
  return ctx;
}
async function abrirPagina(ctx, base) {
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|Failed to fetch|ERR_|\[nube\]/.test(m.text())) errores.push(m.text()); });
  const subidas = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/partida$/.test(r.url())) subidas.push(Date.now()); });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null && window.Cuenta, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  return { page, errores, subidas };
}
async function cerrarVentanas(page) {
  for (let i = 0; i < 5; i++) {
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"], #overlay.on [data-act="partida"][data-k="local"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
const nubeLista = (page) => page.waitForFunction(() => window.__nube && window.Api && window.Api.logueado() && window.__nube.lista != null, null, { timeout: 20000 });
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toastTxt = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return t && t.style.display !== 'none' ? t.textContent : ''; });
const visible = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
const logueado = (page) => page.evaluate(() => !!(window.Api && window.Api.logueado()));
async function entrarApi(base, email, clave) {
  const r = await fetch(base + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: JSON.stringify({ email, clave }) });
  return r.status;
}

(async () => {
  const srv = await arrancarServidor();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const cuenta = { email: `clave${Date.now()}@prueba.ec`, clave: 'ClaveVieja-123', nueva: 'ClaveNueva-456' };
  const SAVE = partida();
  try {
    const ctx = await contexto(browser, { partida: SAVE });
    const { page, errores, subidas } = await abrirPagina(ctx, srv.base);
    await page.evaluate(async (c) => { await window.Api.registro(c.email, 'Productora QF', c.clave, { acepta_terminos: true, edad_16: true }); }, cuenta);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await nubeLista(page); await page.waitForTimeout(800);
    await cerrarVentanas(page);
    // Otro aparato con la misma cuenta (entra con la clave): su sesión debe cerrarse al cambiar la contraseña
    const ctx2 = await contexto(browser, {});
    const { page: otro } = await abrirPagina(ctx2, srv.base);
    await otro.evaluate(async (c) => { await window.Api.entrar(c.email, c.clave); }, cuenta);
    bien(await logueado(otro), '0: el otro aparato entró con la clave vieja');

    /* ---------- 1. Dónde están los botones ---------- */
    await abrirLugar(page, 'sede');
    await page.waitForSelector('#hubSheet .cu-tarjeta', { timeout: 4000 }).catch(() => null);
    bien(await visible(page, '#hubSheet .cu-tarjeta [data-act="cuenta-clave"]') && await visible(page, '#hubSheet .cu-tarjeta [data-act="salir"]'),
      '1: Inicio → Tu sede: tarjeta "Tu cuenta" con "Cambiar contraseña" y "Cerrar sesión" a la vista');
    const tTarjeta = await page.textContent('#hubSheet .cu-tarjeta').catch(() => '');
    bien(/Tu cuenta/.test(tTarjeta) && tTarjeta.includes(cuenta.email) && /Cambiar contraseña/.test(tTarjeta) && /Cerrar sesión/.test(tTarjeta), '1: la tarjeta dice "Tu cuenta", el correo y los dos botones');
    await page.screenshot({ path: path.join(OUT, 'cuenta_clave_sede.png') });
    bien(!(await desborde(page)), '1: sin desborde en Tu sede');
    await abrirLugar(page, 'mas');
    await page.waitForTimeout(150);
    bien(await visible(page, '#hubSheet .cu-tarjeta [data-act="cuenta-clave"]') && await visible(page, '#hubSheet .cu-tarjeta [data-act="salir"]'), '1: ⋯ Más: la misma tarjeta "Tu cuenta" (primera opción)');
    const primero = await page.evaluate(() => { const c = document.querySelector('#hubSheet .hub-sh-cuerpo'); return c && c.firstElementChild ? c.firstElementChild.className : ''; });
    bien(/cu-tarjeta/.test(primero), '1: en ⋯ Más la cuenta va arriba de todo (' + primero + ')');
    await page.screenshot({ path: path.join(OUT, 'cuenta_clave_mas.png') });
    await page.evaluate(() => window.Hub && window.Hub.cerrar());
    await page.click('nav button[data-tab="tienda"]'); await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.querySelector('#tab-tienda .sn-k[data-k="creditos"]'); if (b) b.click(); });
    await page.waitForTimeout(300);
    bien(!!(await page.$('#tab-tienda [data-act="salir"]')), '1: Tienda → Tu cuenta: sigue "Cerrar sesión"');
    await page.click('nav button[data-tab="inicio"]'); await page.waitForTimeout(200);

    /* ---------- 2. Ventana "Cambiar contraseña": validación y clave actual equivocada ---------- */
    await abrirLugar(page, 'sede');
    await page.click('#hubSheet .cu-tarjeta [data-act="cuenta-clave"]');
    await page.waitForSelector('#overlay.on #formClaveCuenta', { timeout: 4000 });
    bien(!!(await page.$('#cuC-actual')) && !!(await page.$('#cuC-nueva')) && !!(await page.$('#cuC-repite')) && !!(await page.$('#cuC-ver')), '2: la ventana pide actual, nueva, repetir y tiene "Mostrar contraseñas"');
    const pedidos = [];
    page.on('request', (r) => { if (/\/api\/cuenta\/clave$/.test(r.url())) pedidos.push(r.postDataJSON()); });
    const err = () => page.textContent('#cuC-error');
    await page.click('#cuC-btn'); await page.waitForTimeout(150);
    bien(/contraseña actual/.test(await err()), '2: sin la actual -> "Escribe tu contraseña actual."');
    await page.fill('#cuC-actual', cuenta.clave); await page.fill('#cuC-nueva', 'corta'); await page.fill('#cuC-repite', 'corta');
    await page.click('#cuC-btn'); await page.waitForTimeout(150);
    bien(/al menos 8/.test(await err()), '2: nueva corta -> "al menos 8 caracteres"');
    await page.fill('#cuC-nueva', cuenta.nueva); await page.fill('#cuC-repite', cuenta.nueva + 'x');
    await page.click('#cuC-btn'); await page.waitForTimeout(150);
    bien(/no coinciden/.test(await err()), '2: no coinciden -> aviso');
    await page.fill('#cuC-nueva', cuenta.clave); await page.fill('#cuC-repite', cuenta.clave);
    await page.click('#cuC-btn'); await page.waitForTimeout(150);
    bien(/distinta de la actual/.test(await err()), '2: igual a la actual -> aviso');
    bien(pedidos.length === 0, '2: con errores del formulario no se manda nada al servidor');
    bien((await page.getAttribute('#cuC-nueva', 'type')) === 'password', '2: las contraseñas empiezan ocultas');
    await page.click('#cuC-ver'); await page.waitForTimeout(80);
    const tipos = await page.$$eval('#formClaveCuenta input[id^="cuC-"]:not([type="checkbox"])', (xs) => xs.map((x) => x.type));
    bien(tipos.length === 3 && tipos.every((t) => t === 'text'), '2: "Mostrar contraseñas" las muestra (' + tipos.join(',') + ')');
    await page.click('#cuC-ver'); await page.waitForTimeout(80);
    bien((await page.getAttribute('#cuC-actual', 'type')) === 'password', '2: y las vuelve a ocultar');
    await page.fill('#cuC-actual', 'equivocada-1'); await page.fill('#cuC-nueva', cuenta.nueva); await page.fill('#cuC-repite', cuenta.nueva);
    await page.click('#cuC-btn');
    await page.waitForFunction(() => /no es correcta/.test((document.getElementById('cuC-error') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => null);
    bien(/La contraseña actual no es correcta/.test(await err()), '2: actual equivocada -> "La contraseña actual no es correcta." (' + (await err()) + ')');
    bien(pedidos.length === 1 && pedidos[0].actual === 'equivocada-1' && pedidos[0].nueva === cuenta.nueva, '2: se mandó POST /api/cuenta/clave {actual, nueva}');
    bien(await logueado(page) && !(await page.isDisabled('#cuC-btn')), '2: la sesión sigue y se puede intentar otra vez');
    await page.screenshot({ path: path.join(OUT, 'cuenta_clave_ventana.png') });
    bien(!(await desborde(page)), '2: sin desborde en la ventana');

    /* ---------- 3. Cambio bueno ---------- */
    await page.fill('#cuC-actual', cuenta.clave);
    await page.click('#cuC-btn');
    await page.waitForFunction(() => !document.getElementById('overlay').classList.contains('on'), null, { timeout: 6000 }).catch(() => null);
    const t3 = await toastTxt(page);
    bien(/contraseña cambió/.test(t3), '3: la ventana se cierra y avisa: "' + t3 + '"');
    await page.evaluate(() => window.Api.refrescar());
    bien(await logueado(page), '3: en este celular la sesión sigue abierta');
    await otro.evaluate(() => window.Api.refrescar().catch(() => null));
    bien(!(await logueado(otro)), '3: en el otro aparato la sesión se cerró');
    bien((await entrarApi(srv.base, cuenta.email, cuenta.clave)) === 401, '3: la clave vieja ya no entra (401)');
    bien((await entrarApi(srv.base, cuenta.email, cuenta.nueva)) === 200, '3: la clave nueva sí entra');
    const cor = srv.correos();
    bien(cor.some((c) => c.para === cuenta.email && /contraseña de EN VIVO Tycoon cambió/.test(c.asunto)), '3: llegó el correo "Tu contraseña de EN VIVO Tycoon cambió"');

    /* ---------- 4. Cerrar sesión desde Tu sede ---------- */
    await page.waitForTimeout(500);
    const antes = await page.evaluate(() => ({ dia: window.__game.state.day, dinero: window.__game.state.money, eventos: window.__game.state.stats.events }));
    const nSub = subidas.length;
    // Algo sin subir (como si acabara de jugar): al cerrar sesión no debe subirse
    await page.evaluate(() => { window.__game.state.money += 777; if (window.__game.guardar) window.__game.guardar(); });
    await abrirLugar(page, 'sede');
    await page.click('#hubSheet .cu-tarjeta [data-act="salir"]');
    await page.waitForFunction(() => window.Api && !window.Api.logueado(), null, { timeout: 6000 }).catch(() => null);
    bien(!(await logueado(page)), '4: "Cerrar sesión" en Tu sede cierra la sesión');
    const t4 = await toastTxt(page);
    bien(/Cerraste sesión/.test(t4), '4: avisa "' + t4 + '"');
    await page.waitForTimeout(5500);   // más que el guardado diferido de la nube (4 s)
    bien(subidas.length === nSub, `4: no se subió nada a la nube al cerrar sesión (subidas antes ${nSub}, después ${subidas.length})`);
    const desp = await page.evaluate(() => ({ dia: window.__game.state.day, dinero: window.__game.state.money, eventos: window.__game.state.stats.events }));
    bien(desp.dia === antes.dia && desp.eventos === antes.eventos && desp.dinero === antes.dinero + 777, `4: la partida de este celular sigue igual (día ${desp.dia}, $${desp.dinero}, ${desp.eventos} eventos)`);
    const guardada = await page.evaluate(() => { try { const s = window.Game.deserialize(localStorage.getItem('envivo_tycoon_save_v1')); return s && s.money; } catch (e) { return null; } });
    bien(guardada === antes.dinero + 777, '4: y sigue guardada en este celular');
    const enNube = await (async () => {
      const ctx3 = await contexto(browser, {});
      const { page: p3 } = await abrirPagina(ctx3, srv.base);
      const r = await p3.evaluate(async (c) => { await window.Api.entrar(c.email, c.nueva); const x = await window.Api.partida(); return x.datos ? JSON.parse(x.datos).money : null; }, cuenta);
      await ctx3.close();
      return r;
    })();
    bien(enNube !== antes.dinero + 777, `4: la nube no tiene lo jugado después de tocar "Cerrar sesión" (nube: $${enNube})`);
    await abrirLugar(page, 'sede'); await page.waitForTimeout(150);
    bien(!(await page.$('#hubSheet .cu-tarjeta')), '4: sin sesión ya no está la tarjeta "Tu cuenta"');
    await abrirLugar(page, 'mas'); await page.waitForTimeout(150);
    bien(await visible(page, '#hubSheet [data-act="cuenta"][data-modo="entrar"]'), '4: en ⋯ Más sale "Entrar a tu cuenta"');
    await page.screenshot({ path: path.join(OUT, 'cuenta_clave_salio.png') });
    bien(!(await desborde(page)), '4: sin desborde');

    bien(errores.length === 0, 'Sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
    const ep = srv.errPhp();
    bien(ep.length === 0, 'Sin errores de PHP' + (ep.length ? ': ' + ep.slice(0, 3).join(' | ') : ''));
    await ctx2.close(); await ctx.close();
  } catch (e) {
    fallas++; console.error('❌ Error en la prueba:', e);
  } finally {
    await browser.close();
    srv.cerrar();
  }
  console.log(`\n${aciertos} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})();
