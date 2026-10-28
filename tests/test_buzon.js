/* Prueba del buzón y los códigos de regalo (js/buzon.js, js/canjear.js, server/public/canjear.html y la pestaña del
   Centro de Control) con el SERVIDOR REAL (php -S + server/tests/router.php, base temporal) en un celular de 390x844
   y en escritorio. Revisa: textos en 10 idiomas, sobre del encabezado con número (cabe a 390 px y con la barra fija),
   aviso en Inicio, ventana del buzón, leer, reclamar (créditos arriba, dinero y equipo en la partida), canjear código
   (equivocado y bueno) desde el buzón y desde Tienda → Cuenta, idioma inglés, /canjear.html (entrar y canjear) y el
   Centro de Control (vista previa de una difusión). Sin errores de JavaScript.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_buzon.js     (capturas en tests/capturas/buzon_*.png) */
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

/* ---------- Textos: 10 idiomas con todas las claves y los mismos marcadores ---------- */
console.log('Textos');
const Buzon = require(path.join(RAIZ, 'js', 'buzon.js'));
const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
const claves = Object.keys(Buzon.TEXTOS.es);
IDIOMAS.forEach((c) => {
  const d = Buzon.TEXTOS[c] || {};
  const faltan = claves.filter((k) => !(k in d));
  const sobran = Object.keys(d).filter((k) => !(k in Buzon.TEXTOS.es));
  const marc = claves.filter((k) => k in d && JSON.stringify((String(Buzon.TEXTOS.es[k]).match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((String(d[k]).match(/\{\w+\}/g) || []).sort()));
  ok(!faltan.length && !sobran.length && !marc.length, `${c}: ${claves.length} claves${faltan.length ? ', faltan ' + faltan.join(',') : ''}${sobran.length ? ', sobran ' + sobran.join(',') : ''}${marc.length ? ', marcadores distintos en ' + marc.join(',') : ''}`);
});
ok(Object.keys(Buzon.TEXTOS).length === 10, 'Español + 9 idiomas');
// Los códigos de error del servidor (docs/traducciones/errores_nuevos/buzon.json) tienen texto en el juego
const errs = JSON.parse(fs.readFileSync(path.join(RAIZ, 'docs/traducciones/errores_nuevos/buzon.json'), 'utf8'));
ok(IDIOMAS.every((c) => errs[c] && Object.keys(errs.es).every((k) => typeof errs[c][k] === 'string' && errs[c][k])), 'errores_nuevos/buzon.json: los 10 idiomas con todos los códigos');

/* ---------- Servidor real con base temporal ---------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_buzon_js_'));
fs.mkdirSync(path.join(TMP, 'datos'));
const puerto = 20000 + Math.floor(Math.random() * 20000);
const BASE = 'http://127.0.0.1:' + puerto;
const ADMIN = 'jefe_js', CLAVE_ADMIN = 'Clave-Panel-' + process.pid;
const hash = execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_BCRYPT);', CLAVE_ADMIN]).toString();
fs.writeFileSync(path.join(TMP, 'config.env'), `ENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\nENVIVO_ADMIN_USUARIO=${ADMIN}\nENVIVO_ADMIN_CLAVE_HASH=${hash}\n`);
const ENV = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP, 'config.env'), no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost', PHP_CLI_SERVER_WORKERS: '4' });
execFileSync('php', [path.join(RAIZ, 'server/bin/migrar.php')], { env: ENV });
const srv = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' + path.join(TMP, 'php.log'), '-S', '127.0.0.1:' + puerto, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')], { env: ENV, stdio: 'ignore' });
const php = (codigo) => execFileSync('php', ['-r', `$_SERVER['REMOTE_ADDR'] = '127.0.0.1'; require ${JSON.stringify(path.join(RAIZ, 'server/src/arranque.php'))}; ${codigo}`], { env: ENV }).toString();
const fin = (c) => { try { srv.kill(); } catch (e) { /* nada */ } try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* nada */ } process.exit(c); };

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
async function nuevoContexto(browser, opc, idioma) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, opc));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((c) => {
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_lang', c);
    } catch (e) { /* nada */ }
  }, idioma || 'es');
  return ctx;
}
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  if (!(await esperarServidor())) { console.error('No arrancó el servidor'); fin(1); }
  const browser = await chromium.launch();
  const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const errores = [];
  const vigilar = (p) => {
    p.on('pageerror', (e) => errores.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  };

  console.log('Juego en un celular (390x844)');
  const ctx = await nuevoContexto(browser, MOVIL);
  const email = 'buzon' + Date.now() + '@prueba.example';
  const reg = await ctx.request.post(BASE + '/api/registro', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' }, data: { email, nombre: 'Productora Buzón', clave: 'ClaveBuena123', acepta_terminos: true, edad_16: true } });
  const J = (await reg.json()).jugador.id;
  ok(reg.ok() && J > 0, 'Cuenta creada (la galleta queda en el navegador)');
  php(`\\EnVivo\\Buzon::enviar(${J}, 'Perdón por la caída del servidor', "Ayer el servidor se cayó 20 minutos.\\nGracias por tu paciencia: aquí va una compensación.", [['tipo' => 'creditos', 'cantidad' => 40], ['tipo' => 'dinero', 'cantidad' => 3000], ['tipo' => 'item', 'item' => 'cam_pro']], ['tipo' => 'compensacion']);
       \\EnVivo\\Buzon::enviar(${J}, 'Bienvenida a la Temporada 1', 'Este fin de semana la Liga da el doble de fama. ¡Suerte!', [], ['tipo' => 'evento']);
       \\EnVivo\\Buzon::crearCodigo(['codigo' => 'PRUEBA2026', 'titulo' => 'Regalo de Dimitry TV', 'adjuntos' => [['tipo' => 'creditos', 'cantidad' => 25], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]], 'etiqueta' => 'dimitry_tv'], 'prueba');
       \\EnVivo\\Buzon::crearCodigo(['codigo' => 'TIENDA2026', 'titulo' => 'Regalo de la tienda', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 500]]], 'prueba');`);
  const p = await ctx.newPage();
  vigilar(p);
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Api && window.Api.disponible === true && window.Api.logueado(), null, { timeout: 15000 });
  await cerrarVentanas(p);
  await p.waitForFunction(() => { const b = document.getElementById('buzonBtn'); return b && !b.hidden && document.getElementById('buzonBadge').textContent === '2'; }, null, { timeout: 8000 }).catch(() => {});
  ok(await p.evaluate(() => { const b = document.getElementById('buzonBtn'); return !!b && !b.hidden; }), 'Sobre en el encabezado (con cuenta)');
  ok((await p.textContent('#buzonBadge')) === '2', 'Número en el sobre: 2 mensajes nuevos');
  const caja = await p.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    return { buzon: r('buzonBtn'), mute: r('muteBtn'), lang: r('langBtn'), musica: r('musicBtn'), brandH: document.querySelector('header .brand').getBoundingClientRect().height, w: innerWidth };
  });
  const btns = [caja.buzon, caja.mute, caja.musica, caja.lang].filter(Boolean);
  ok(btns.every((b) => b.r <= caja.w - 8 + 0.5 && b.l >= 0), 'Botones del encabezado dentro de la pantalla (390 px)');
  ok(btns.every((b, i) => i === 0 || b.l >= btns[i - 1].r - 0.5), 'Sin encimarse: sobre, sonido, música, idioma en una fila');
  ok(caja.brandH <= 40, 'El encabezado sigue en UNA línea (' + Math.round(caja.brandH) + ' px)');
  ok(await sinDesborde(p), 'Sin desplazamiento horizontal');
  await p.screenshot({ path: path.join(CAP, 'buzon_encabezado_390.png'), clip: { x: 0, y: 0, width: 390, height: 140 } });
  // Con la insignia VIP también cabe en una línea
  const vipAlto = await p.evaluate(() => { const v = document.getElementById('vipBadge'); v.hidden = false; const h = document.querySelector('header .brand').getBoundingClientRect().height; const r = document.getElementById('langBtn').getBoundingClientRect().right; v.hidden = true; return { h, r }; });
  ok(vipAlto.h <= 40 && vipAlto.r <= 390, 'Con la insignia VIP: sigue en una línea (' + Math.round(vipAlto.h) + ' px)');
  // Aviso en Inicio
  // (en la sede de Inicio, js/hub.js: el buzón de la vereda avisa "!" y su hoja trae el regalo)
  await p.waitForFunction(() => { const b = document.querySelector('.hs[data-hub="buzon"]'); return b && !b.classList.contains('lock') && b.querySelector('.hs-b'); }, null, { timeout: 6000 }).catch(() => {});
  ok(await p.evaluate(() => { const b = document.querySelector('.hs[data-hub="buzon"] .hs-b'); return !!b && b.textContent === '!'; }), 'Aviso en Inicio: el buzón de la sede avisa "!"');
  await require('./hub_ayuda').verEnInicio(p, '[data-buzon-inicio]', 6000);
  ok(await p.locator('[data-buzon-inicio]').count() === 1, 'Aviso en Inicio: "Tienes 1 regalo por reclamar"');
  ok(/Buzón/.test(await p.textContent('#hubSheet .hub-sh-t').catch(() => '')) && /Perdón por la caída/.test(await p.textContent('[data-buzon-inicio]').catch(() => '')), '…con el título "Buzón" y el regalo');
  await p.screenshot({ path: path.join(CAP, 'buzon_inicio_390.png') });
  await p.evaluate(() => window.Hub && window.Hub.cerrar());
  // La barra fija: al bajar, el sobre sigue a la vista
  await p.evaluate(() => window.scrollTo(0, 900));
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const b = document.getElementById('buzonBtn').getBoundingClientRect(); return b.top >= 0 && b.bottom <= 80; }), 'Al bajar, el sobre sigue arriba (encabezado fijo)');
  await p.evaluate(() => window.scrollTo(0, 0));

  // Abrir el buzón
  await p.click('#buzonBtn');
  await p.waitForSelector('#modal [data-buzon="lista"] .bz-item', { timeout: 6000 });
  ok(await p.locator('#modal .bz-item').count() === 2, 'Ventana del buzón con los 2 mensajes');
  ok(await p.locator('#modal .bz-item .bz-tag').count() === 1, 'El de la compensación tiene la marca de regalo');
  ok(await p.locator('#bz-codigo').count() === 1, 'Campo "Canjear código" en el buzón');
  ok(await sinDesborde(p), 'Ventana sin desplazamiento horizontal');
  await p.screenshot({ path: path.join(CAP, 'buzon_lista_390.png') });
  // Leer el aviso (sin regalo)
  await p.click('#modal .bz-item:not(.regalo)');
  await p.waitForSelector('#modal [data-buzon="mensaje"]');
  ok(/doble de fama/.test(await p.textContent('#modal')), 'Mensaje abierto con su texto');
  await p.waitForFunction(() => document.getElementById('buzonBadge').textContent === '1', null, { timeout: 4000 }).catch(() => {});
  ok((await p.textContent('#buzonBadge')) === '1', 'Al leerlo, el sobre baja a 1');
  await p.click('#modal [data-acc="volver"]');
  // Reclamar la compensación
  const antes = await p.evaluate(() => ({ dinero: window.__game.state.money, creditos: window.Api.estado.creditos, cams: window.__game.state.equip.filter((e) => e.type === 'cam_pro').length }));
  await p.click('#modal .bz-item.regalo');
  await p.waitForSelector('#modal [data-acc="reclamar"]');
  ok(/40 créditos/.test(await p.textContent('#modal .bz-adj')) && /3\.000|3,000/.test(await p.textContent('#modal .bz-adj')), 'Premios a la vista: 40 créditos, $3.000 y la cámara');
  ok(/Vence en 30 d/.test(await p.textContent('#modal')), 'Muestra cuándo vence');
  await p.screenshot({ path: path.join(CAP, 'buzon_mensaje_390.png') });
  await p.click('#modal [data-acc="reclamar"]');
  await p.waitForFunction((a) => window.Api.estado.creditos === a.creditos + 40 && window.__game.state.money >= a.dinero + 3000, antes, { timeout: 8000 }).catch(() => {});
  const despues = await p.evaluate(() => ({ dinero: window.__game.state.money, creditos: window.Api.estado.creditos, cams: window.__game.state.equip.filter((e) => e.type === 'cam_pro').length, chip: document.getElementById('hGem').textContent }));
  ok(despues.creditos === antes.creditos + 40, 'Reclamar: +40 créditos (' + antes.creditos + ' → ' + despues.creditos + ')');
  ok(despues.chip.replace(/\D/g, '') === String(despues.creditos), 'El chip de créditos de arriba se actualizó');
  ok(despues.dinero >= antes.dinero + 3000, 'El dinero del juego subió $3.000');
  ok(despues.cams === antes.cams + 1, 'La cámara llegó a la bodega');
  await p.waitForSelector('#modal [data-buzon="mensaje"]:not(:has([data-acc="reclamar"]))', { timeout: 4000 }).catch(() => {});
  ok(/Reclamado/.test(await p.textContent('#modal')), 'El mensaje queda "Reclamado"');
  ok((await p.textContent('#buzonBadge')) === '', 'El sobre queda sin número');
  await p.screenshot({ path: path.join(CAP, 'buzon_reclamado_390.png') });
  // Canjear: equivocado y bueno
  await p.click('#modal [data-acc="volver"]');
  await p.fill('#bz-codigo', 'NOEXISTE99');
  await p.click('#bz-canjear-btn');
  await p.waitForFunction(() => document.getElementById('bz-error') && document.getElementById('bz-error').textContent.length > 5, null, { timeout: 4000 }).catch(() => {});
  ok(/no existe/.test(await p.textContent('#bz-error').catch(() => '')), 'Código equivocado: "Ese código no existe…"');
  await p.screenshot({ path: path.join(CAP, 'buzon_codigo_error_390.png') });
  await p.fill('#bz-codigo', 'prueba-2026');
  await p.press('#bz-codigo', 'Enter');
  await p.waitForSelector('#modal [data-buzon="mensaje"] [data-acc="reclamar"]', { timeout: 6000 }).catch(() => {});
  ok(/Regalo de Dimitry TV/.test(await p.textContent('#modal')), 'Código bueno (con Enter, minúsculas y guion): abre el regalo en el buzón');
  await p.screenshot({ path: path.join(CAP, 'buzon_codigo_ok_390.png') });
  await p.click('#modal [data-acc="reclamar"]');
  await p.waitForFunction((c) => window.Api.estado.creditos === c + 25, despues.creditos, { timeout: 8000 }).catch(() => {});
  ok(await p.evaluate((c) => window.Api.estado.creditos === c + 25, despues.creditos), 'Reclamado: +25 créditos del código');
  await cerrarVentanas(p);
  // Tienda → Cuenta → Canjear código
  await p.click('nav button[data-tab="tienda"]');
  await p.click('#tab-tienda .subnav [data-k="creditos"]');   // navegación v2: la cuenta va en "Créditos"
  await p.waitForSelector('#tab-tienda [data-ext="buzon"][data-acc="canjear"]', { timeout: 6000 }).catch(() => {});
  ok(await p.locator('#tab-tienda [data-ext="buzon"][data-acc="canjear"]').count() === 1, 'Tienda → Cuenta: botón "Canjear código"');
  await p.locator('#tab-tienda [data-ext="buzon"][data-acc="canjear"]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(CAP, 'buzon_tienda_cuenta_390.png') });
  await p.click('#tab-tienda [data-ext="buzon"][data-acc="canjear"]');
  await p.waitForSelector('#modal [data-buzon="canjear"] #bz-codigo');
  ok(true, 'Abre la ventana de canjear');
  await p.fill('#bz-codigo', 'TIENDA2026');
  await p.click('#bz-canjear-btn');
  await p.waitForSelector('#modal [data-buzon="mensaje"]', { timeout: 6000 }).catch(() => {});
  ok(/Regalo de la tienda/.test(await p.textContent('#modal')), 'Canjeado desde la Tienda: el regalo está en el buzón');
  await p.screenshot({ path: path.join(CAP, 'buzon_canjear_tienda_390.png') });
  await cerrarVentanas(p);
  // Otro idioma
  await p.evaluate(() => window.I18N && window.I18N.setIdioma && window.I18N.setIdioma('en'));
  await p.waitForTimeout(400);
  await p.click('#buzonBtn');
  await p.waitForSelector('#modal [data-buzon="lista"]');
  ok(/Mailbox/.test(await p.textContent('#modal .bz-head')) && /Redeem code/.test(await p.textContent('#modal')), 'En inglés: "Mailbox" y "Redeem code"');
  ok((await p.getAttribute('#buzonBtn', 'aria-label')).startsWith('Mailbox') || (await p.getAttribute('#buzonBtn', 'aria-label')) === 'Open mailbox', 'Etiqueta del sobre en inglés');
  await p.screenshot({ path: path.join(CAP, 'buzon_lista_en_390.png') });
  await cerrarVentanas(p);
  await p.evaluate(() => window.I18N && window.I18N.setIdioma && window.I18N.setIdioma('es'));

  // 360 px (celular chico) y escritorio
  for (const [w, h, n] of [[360, 740, '360'], [1280, 800, 'escritorio']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(250);
    const c2 = await p.evaluate(() => {
      const ids = ['buzonBtn', 'muteBtn', 'musicBtn', 'langBtn'].map((i) => document.getElementById(i)).filter((e) => e && !e.hidden).map((e) => e.getBoundingClientRect());
      const main = document.querySelector('main').getBoundingClientRect();
      return { dentro: ids.every((b) => b.right <= innerWidth + 0.5 && b.left >= 0), fila: ids.every((b, i) => i === 0 || b.left >= ids[i - 1].right - 0.5), alto: document.querySelector('header .brand').getBoundingClientRect().height };
    });
    ok(c2.dentro && c2.fila && c2.alto <= 40 && await sinDesborde(p), `Encabezado bien a ${n} (dentro, en fila, una línea, sin desborde) ${JSON.stringify(c2)}`);
    await p.screenshot({ path: path.join(CAP, `buzon_encabezado_${n}.png`), clip: { x: 0, y: 0, width: w, height: 140 } });
  }
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.click('#buzonBtn');
  await p.waitForSelector('#modal [data-buzon="lista"] .bz-item');
  await p.screenshot({ path: path.join(CAP, 'buzon_lista_escritorio.png') });
  await cerrarVentanas(p);

  // Sin cuenta: no hay sobre
  const ctx0 = await nuevoContexto(browser, MOVIL);
  const p0 = await ctx0.newPage();
  vigilar(p0);
  await p0.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p0.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  await p0.waitForTimeout(500);
  ok(await p0.evaluate(() => { const b = document.getElementById('buzonBtn'); return !!b && b.hidden; }), 'Sin cuenta: el sobre no se ve');
  ok(await p0.evaluate(() => { const v = ['langBtn', 'musicBtn', 'muteBtn'].map((i) => document.getElementById(i)).find((e) => e && !e.hidden).getBoundingClientRect(); return v.right > innerWidth - 30; }), 'Sin cuenta: los botones siguen a la derecha');
  await p0.screenshot({ path: path.join(CAP, 'buzon_encabezado_sin_cuenta_390.png'), clip: { x: 0, y: 0, width: 390, height: 140 } });
  await ctx0.close();

  console.log('Página /canjear.html');
  php(`\\EnVivo\\Buzon::crearCodigo(['codigo' => 'WEB2026', 'titulo' => 'Regalo de la web', 'adjuntos' => [['tipo' => 'creditos', 'cantidad' => 10], ['tipo' => 'dinero', 'cantidad' => 1500]]], 'prueba');`);
  const ctxW = await nuevoContexto(browser, MOVIL);
  const w = await ctxW.newPage();
  vigilar(w);
  await w.goto(BASE + '/canjear.html?codigo=web2026', { waitUntil: 'domcontentloaded' });
  await w.waitForSelector('#cj-entrar:not([hidden])', { timeout: 6000 });
  ok(true, 'Sin sesión: pide entrar con la cuenta del juego');
  await w.screenshot({ path: path.join(CAP, 'buzon_web_entrar_390.png'), fullPage: true });
  await w.fill('#cj-email', email);
  await w.fill('#cj-clave', 'mala-clave');
  await w.click('#cj-btn-entrar');
  await w.waitForFunction(() => document.getElementById('cj-error').textContent.length > 3, null, { timeout: 5000 }).catch(() => {});
  ok(/incorrectos/.test(await w.textContent('#cj-error')), 'Clave equivocada: "Correo o clave incorrectos"');
  await w.fill('#cj-clave', 'ClaveBuena123');
  await w.click('#cj-btn-entrar');
  await w.waitForSelector('#cj-canjear:not([hidden])', { timeout: 6000 });
  ok((await w.inputValue('#cj-codigo')).toLowerCase() === 'web2026', 'El código del enlace ya está escrito (?codigo=)');
  ok(/Productora Buzón/.test(await w.textContent('#cj-quien')), 'Muestra con qué cuenta entró');
  await w.screenshot({ path: path.join(CAP, 'buzon_web_codigo_390.png'), fullPage: true });
  await w.click('#cj-btn-canjear');
  await w.waitForSelector('#cj-listo:not([hidden])', { timeout: 6000 });
  ok(/10 créditos/.test(await w.textContent('#cj-premios')), '¡Listo! con la lista de premios');
  ok(await sinDesborde(w), 'Página web sin desplazamiento horizontal');
  await w.screenshot({ path: path.join(CAP, 'buzon_web_listo_390.png'), fullPage: true });
  await w.click('#cj-otro');
  await w.fill('#cj-codigo', 'WEB2026');
  await w.click('#cj-btn-canjear');
  await w.waitForFunction(() => document.getElementById('cj-error').textContent.length > 3, null, { timeout: 5000 }).catch(() => {});
  ok(/Ya canjeaste/.test(await w.textContent('#cj-error')), 'Otra vez: "Ya canjeaste este código"');
  await w.selectOption('#cj-idioma', 'en');
  ok(/Redeem a gift code/.test(await w.textContent('#cj-titulo')), 'Cambia de idioma (inglés)');
  await ctxW.close();
  // El juego ve el regalo de la web
  await p.evaluate(() => window.Buzon.cargar());
  ok(await p.evaluate(() => window.Buzon.estado().mensajes.some((m) => m.titulo === 'Regalo de la web' && m.reclamable)), 'El regalo canjeado en la web aparece en el buzón del juego');

  console.log('Centro de Control');
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const c = await ctxC.newPage();
  vigilar(c);
  await c.goto(BASE + '/control/');
  await c.fill('input[name="usuario"]', ADMIN);
  await c.fill('input[name="clave"]', CLAVE_ADMIN);
  await Promise.all([c.waitForNavigation(), c.click('#form-entrar button[type="submit"]')]);
  await c.goto(BASE + '/control/?t=buzon');
  ok(await c.locator('#form-difusion').count() === 1, 'Pestaña "Buzón y códigos"');
  await c.fill('#form-difusion input[name="titulo"]', 'Fin de semana de doble fama');
  await c.fill('#form-difusion textarea[name="cuerpo"]', 'Sábado y domingo la Liga da el doble de fama.\n¡A transmitir!');
  await c.selectOption('#form-difusion select[name="adj_tipo[]"] >> nth=0', 'dinero');
  await c.fill('#form-difusion input[name="adj_cant[]"] >> nth=0', '2000');
  await Promise.all([c.waitForNavigation(), c.click('#form-difusion button[type="submit"]')]);
  ok(await c.locator('#panel-previa').count() === 1 && /1/.test(await c.textContent('#previa-destinatarios')), 'Vista previa con el mensaje y cuántos lo reciben');
  ok(await sinDesborde(c), 'Panel a 390 px sin desplazamiento horizontal de la página');
  await c.screenshot({ path: path.join(CAP, 'buzon_control_previa_390.png'), fullPage: false });
  c.once('dialog', (d) => d.accept());
  await c.check('#panel-previa input[name="confirmar"]');
  await Promise.all([c.waitForNavigation(), c.click('#panel-previa button[type="submit"]')]);
  ok(/Enviado/.test(await c.textContent('#aviso')), 'Confirmar en el diálogo: enviado');
  await c.setViewportSize({ width: 1280, height: 900 });
  await c.screenshot({ path: path.join(CAP, 'buzon_control_escritorio.png'), fullPage: true });
  await ctxC.close();
  await p.evaluate(() => window.Buzon.cargar());
  ok(await p.evaluate(() => window.Buzon.estado().mensajes.some((m) => m.titulo === 'Fin de semana de doble fama')), 'El jugador recibe la difusión del panel');

  ok(errores.length === 0, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  const log = fs.existsSync(path.join(TMP, 'php.log')) ? fs.readFileSync(path.join(TMP, 'php.log'), 'utf8') : '';
  ok(!/Fatal|Warning|Notice|Deprecated/.test(log), 'Sin errores de PHP' + (log ? ': ' + log.slice(0, 300) : ''));
  await browser.close();
  console.log(fallas ? `\n❌ ${fallas} falla(s)` : '\n✅ Buzón: todo bien');
  fin(fallas ? 1 : 0);
})().catch((e) => { console.error(e); fin(1); });
