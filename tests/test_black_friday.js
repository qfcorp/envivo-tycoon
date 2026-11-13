/* Prueba de la franja de Black Friday (js/black_friday.js + ui.js bannersInicio, server/src/BlackFriday.php) con el
   SERVIDOR REAL (php -S + server/tests/router.php, base temporal) en un celular de 390x844, con la fecha del juego fija
   (window.__ENVIVO_FECHA). Revisa: textos en js/lang/es.js, sin cuenta "Crea tu cuenta gratis para reclamar" y
   "Quedan 100 de 100", con cuenta "Reclamar" → VIP activo (insignia VIP, /api/estado) y "Ya tienes tu VIP gratis",
   el contador baja para los demás, la palabra BLACKFRIDAY en "Canjear código" del buzón, agotada ("Se agotaron…"),
   apagada o terminada (no se ve), sin desplazamiento horizontal y sin errores de JavaScript.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_black_friday.js     (capturas en tests/capturas/black_friday_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CAP = path.join(__dirname, 'capturas');
fs.mkdirSync(CAP, { recursive: true });
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- Textos ---------- */
console.log('Textos');
global.window = global;
require(path.join(RAIZ, 'js/lang/es.js'));
const ES = global.I18N_LANG.es;
const CLAVES = ['bf.tag', 'bf.titulo', 'bf.quedan', 'bf.sin_cupo', 'bf.reclamar', 'bf.reclamando', 'bf.crear_cuenta', 'bf.ya_tengo', 'bf.reclamado', 'bf.activo_hasta', 'bf.agotada', 'bf.detalle', 'bf.listo'];
ok(CLAVES.every((k) => ES[k]), 'js/lang/es.js tiene las ' + CLAVES.length + ' claves bf.*');
const fuente = fs.readFileSync(path.join(RAIZ, 'js/black_friday.js'), 'utf8');
ok(!/[áéíóúñ¡¿]/i.test(fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'js/black_friday.js no trae textos en español fuera de los comentarios (van en es.js)');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
ok(idx.includes('src="js/black_friday.js"') && sw.includes("'./js/black_friday.js'"), 'Cargado en index.html y guardado por sw.js');

/* ---------- Servidor real con base temporal ---------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_bf_js_'));
fs.mkdirSync(path.join(TMP, 'datos'));
const puerto = 20000 + Math.floor(Math.random() * 20000);
const BASE = 'http://127.0.0.1:' + puerto;
fs.writeFileSync(path.join(TMP, 'config.env'), `ENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\n`);
const ENV = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP, 'config.env'), no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost', PHP_CLI_SERVER_WORKERS: '4' });
execFileSync('php', [path.join(RAIZ, 'server/bin/migrar.php')], { env: ENV });
const srv = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' + path.join(TMP, 'php.log'), '-S', '127.0.0.1:' + puerto, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')], { env: ENV, stdio: 'ignore' });
const php = (codigo) => execFileSync('php', ['-r', `$_SERVER['REMOTE_ADDR'] = '127.0.0.1'; require ${JSON.stringify(path.join(RAIZ, 'server/src/arranque.php'))}; use EnVivo\\{Ajustes, BlackFriday, Db}; ${codigo}`], { env: ENV }).toString();
const fin = (c) => { try { srv.kill(); } catch (e) { /* nada */ } try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* nada */ } process.exit(c); };
// Ventana de la promo alrededor de AHORA (el dueño la cambia en el Centro de Control) y 10 cuentas por conexión (todo viene de 127.0.0.1)
php(`Ajustes::set('bf_desde', (string) (time() - 3600)); Ajustes::set('bf_hasta', (string) (time() + 86400)); Ajustes::set('bf_ip_max', '10');`);

async function esperarServidor() {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/estado'); if (r.ok) return true; } catch (e) { /* todavía no */ } await new Promise((r) => setTimeout(r, 100)); }
  return false;
}
async function cerrarVentanas(p) {
  for (let i = 0; i < 5; i++) {
    const b = p.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"]');
    if (!(await b.count())) return;
    await b.first().click();
    await p.waitForTimeout(150);
  }
}
const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function nuevoContexto(browser) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, MOVIL));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(() => {
    window.__ENVIVO_FECHA = '2026-11-28';   // fecha del juego fija (temporadas): Black Friday
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_lang', 'es');
    } catch (e) { /* nada */ }
  });
  return ctx;
}
let nCuenta = 0;
async function registrar(ctx) {
  nCuenta++;
  const r = await ctx.request.post(BASE + '/api/registro', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' },
    data: { email: `bf${nCuenta}.${Date.now()}@prueba.example`, nombre: 'Productora BF ' + nCuenta, clave: 'ClaveBuena123', acepta_terminos: true, edad_16: true } });
  return (await r.json()).jugador.id;
}
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tarjeta = (p) => p.evaluate(() => { const c = document.querySelector('#tab-inicio [data-bf="card"]'); return c ? c.innerText.replace(/\s+/g, ' ').trim() : null; });

(async () => {
  if (!(await esperarServidor())) { console.error('No arrancó el servidor'); fin(1); }
  const browser = await chromium.launch();
  const errores = [];
  const vigilar = (p) => {
    p.on('pageerror', (e) => errores.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  };
  const abrir = async (ctx, conCuenta) => {
    const p = await ctx.newPage();
    vigilar(p);
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction((c) => window.Api && window.Api.disponible === true && (!c || window.Api.logueado()), conCuenta, { timeout: 15000 });
    await cerrarVentanas(p);
    return p;
  };

  console.log('Sin cuenta (390x844)');
  const c0 = await nuevoContexto(browser);
  const p0 = await abrir(c0, false);
  await p0.waitForSelector('#tab-inicio [data-bf="card"]', { timeout: 10000 }).catch(() => {});
  let txt = await tarjeta(p0);
  ok(!!txt, 'Franja de Black Friday arriba de Inicio');
  ok(txt && txt.includes('Black Friday: VIP 30 días GRATIS') && txt.includes('Quedan 100 de 100'), 'Dice "Black Friday: VIP 30 días GRATIS" y "Quedan 100 de 100" — ' + txt);
  ok(await p0.evaluate(() => { const c = document.querySelector('#tab-inicio [data-bf="card"]'), h = document.querySelector('#tab-inicio .hubcard'); return !!c && (!h || c.getBoundingClientRect().top < h.getBoundingClientRect().top); }), 'Va antes de la productora (arriba de todo)');
  ok(await p0.evaluate(() => { const b = document.querySelector('[data-bf="crear"]'); return !!b && b.dataset.act === 'cuenta' && b.dataset.modo === 'registro' && /Crea tu cuenta gratis para reclamar/.test(b.textContent); }), 'Botón "Crea tu cuenta gratis para reclamar" (abre el registro)');
  ok(!(await p0.$('[data-bf="reclamar"]')), 'Sin cuenta no hay botón "Reclamar"');
  ok(await sinDesborde(p0), 'Sin desplazamiento horizontal');
  await p0.screenshot({ path: path.join(CAP, 'black_friday_sin_cuenta_390.png') });
  await p0.click('[data-bf="crear"]');
  await p0.waitForTimeout(300);
  ok(await p0.evaluate(() => document.getElementById('overlay').classList.contains('on')), 'Tocar el botón abre la ventana de la cuenta');
  await c0.close();

  console.log('Con cuenta: reclamar');
  const c1 = await nuevoContexto(browser);
  const J1 = await registrar(c1);
  const p1 = await abrir(c1, true);
  await p1.waitForSelector('[data-bf="reclamar"]', { timeout: 10000 }).catch(() => {});
  ok(!!(await p1.$('[data-bf="reclamar"]')), 'Con cuenta: botón "Reclamar"');
  ok(await p1.evaluate(() => !window.Api.estado.vip_activo), 'Antes: sin VIP');
  await p1.screenshot({ path: path.join(CAP, 'black_friday_reclamar_390.png') });
  await p1.click('[data-bf="reclamar"]');
  await p1.waitForSelector('[data-bf="reclamado"]', { timeout: 10000 }).catch(() => {});
  txt = await tarjeta(p1);
  ok(txt && txt.includes('Ya tienes tu VIP gratis de Black Friday') && /activo hasta el/.test(txt), 'Después: "Ya tienes tu VIP gratis" con la fecha — ' + txt);
  ok(txt && txt.includes('Quedan 99 de 100'), 'El contador bajó a 99');
  await p1.waitForFunction(() => window.Api.estado && window.Api.estado.vip_activo === true, null, { timeout: 8000 }).catch(() => {});
  ok(await p1.evaluate(() => window.Api.estado.vip_activo === true), '/api/estado otra vez: VIP activo');
  ok(await p1.evaluate(() => { const v = document.getElementById('vipBadge'); return !!v && !v.hidden; }), 'Insignia VIP en el encabezado');
  ok(php(`echo (int) Db::valor('SELECT COUNT(*) FROM promo_reclamos WHERE jugador_id = ${J1}');`) === '1', 'En el servidor: 1 reclamo de esa cuenta');
  ok(/^[a-f0-9]{32}$/.test(php(`echo Db::valor('SELECT instalacion FROM promo_reclamos WHERE jugador_id = ${J1}');`)), 'Se guardó la instalación del aparato (contra el abuso)');
  ok(await sinDesborde(p1), 'Sin desplazamiento horizontal');
  await p1.screenshot({ path: path.join(CAP, 'black_friday_reclamado_390.png') });
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => window.Api && window.Api.logueado && window.Api.logueado(), null, { timeout: 15000 });
  await cerrarVentanas(p1);
  await p1.waitForSelector('[data-bf="reclamado"]', { timeout: 10000 }).catch(() => {});
  ok(!!(await p1.$('[data-bf="reclamado"]')) && !(await p1.$('[data-bf="reclamar"]')), 'Al volver a abrir: sigue "Ya tienes tu VIP gratis" (sin botón)');
  await c1.close();

  console.log('Con la palabra BLACKFRIDAY en "Canjear código"');
  const c2 = await nuevoContexto(browser);
  const J2 = await registrar(c2);
  const p2 = await abrir(c2, true);
  await p2.waitForSelector('[data-bf="reclamar"]', { timeout: 10000 }).catch(() => {});
  txt = await tarjeta(p2);
  ok(txt && txt.includes('Quedan 99 de 100'), 'Otra cuenta ve "Quedan 99 de 100"');
  await p2.waitForFunction(() => { const b = document.getElementById('buzonBtn'); return b && !b.hidden; }, null, { timeout: 8000 }).catch(() => {});
  await p2.click('#buzonBtn');
  await p2.waitForSelector('#bz-codigo', { timeout: 5000 }).catch(() => {});
  if (await p2.$('#bz-codigo')) {
    await p2.fill('#bz-codigo', 'black friday');
    await p2.click('#bz-canjear-btn');
    await p2.waitForFunction(() => window.Api.estado && window.Api.estado.vip_activo === true, null, { timeout: 8000 }).catch(() => {});
  }
  ok(php(`echo Db::valor('SELECT canal FROM promo_reclamos WHERE jugador_id = ${J2}');`) === 'codigo', 'La palabra en el buzón reclamó el VIP (canal codigo, mismo cupo)');
  ok(await p2.evaluate(() => window.Api.estado.vip_activo === true), 'VIP activo en el juego después del código');
  await cerrarVentanas(p2);
  await p2.evaluate(() => { window.BlackFriday.invalidar(); });
  await p2.click('nav button[data-tab="inicio"]');
  await p2.waitForSelector('[data-bf="reclamado"]', { timeout: 10000 }).catch(() => {});
  ok(!!(await p2.$('[data-bf="reclamado"]')), 'La franja pasa a "Ya tienes tu VIP gratis"');
  await c2.close();

  console.log('Agotada');
  php(`Ajustes::set('bf_cupo', '2');`);
  const c3 = await nuevoContexto(browser);
  await registrar(c3);
  const p3 = await abrir(c3, true);
  await p3.waitForSelector('[data-bf="agotada"]', { timeout: 10000 }).catch(() => {});
  txt = await tarjeta(p3);
  ok(txt && txt.includes('Se agotaron los 2 VIP gratis — gracias') && txt.includes('Quedan 0 de 2'), 'Agotada: "Se agotaron los … VIP gratis — gracias" — ' + txt);
  ok(!(await p3.$('[data-bf="reclamar"]')), 'Agotada: sin botón "Reclamar"');
  ok(await sinDesborde(p3), 'Sin desplazamiento horizontal');
  await p3.screenshot({ path: path.join(CAP, 'black_friday_agotada_390.png') });
  const r = await c3.request.post(BASE + '/api/promo/black_friday/reclamar', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' }, data: {} });
  ok(r.status() === 410 && (await r.json()).codigo === 'promo_agotada', 'El servidor tampoco deja: 410 promo_agotada');
  await c3.close();

  console.log('Terminada y apagada: no se ve');
  php(`Ajustes::set('bf_cupo', '100'); Ajustes::set('bf_hasta', (string) (time() - 60));`);
  const c4 = await nuevoContexto(browser);
  const p4 = await abrir(c4, false);
  await p4.waitForFunction(() => window.BlackFriday && window.BlackFriday.datos, null, { timeout: 10000 }).catch(() => {});
  ok(await p4.evaluate(() => window.BlackFriday.datos && window.BlackFriday.datos.fase === 'terminada'), 'Terminada: el servidor dice fase terminada');
  ok(!(await p4.$('[data-bf="card"]')), 'Terminada: sin franja en Inicio');
  await c4.close();
  php(`Ajustes::set('bf_hasta', (string) (time() + 86400)); Ajustes::set('bf_activa', '0');`);
  const c5 = await nuevoContexto(browser);
  const p5 = await abrir(c5, false);
  await p5.waitForFunction(() => window.BlackFriday && window.BlackFriday.datos, null, { timeout: 10000 }).catch(() => {});
  ok(await p5.evaluate(() => window.BlackFriday.datos && window.BlackFriday.datos.fase === 'apagada') && !(await p5.$('[data-bf="card"]')), 'Apagada desde el panel: sin franja');
  ok(await p5.evaluate(() => document.querySelectorAll('#tab-inicio .hubcard').length === 1), 'Inicio sigue normal (la productora)');
  await c5.close();

  ok(errores.length === 0, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  const log = (() => { try { return fs.readFileSync(path.join(TMP, 'php.log'), 'utf8'); } catch (e) { return ''; } })();
  ok(!/fatal|warning|deprecated|notice/i.test(log), 'Sin errores de PHP' + (log ? ': ' + log.slice(0, 300) : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  fin(fallas ? 1 : 0);
})().catch((e) => { console.error(e); fin(1); });
