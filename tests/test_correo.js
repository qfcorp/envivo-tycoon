/* Prueba de "¿Olvidaste tu contraseña?" de punta a punta con el servidor de verdad (php -S + server/tests/router.php,
   base y configuración TEMPORALES, sin SMTP: los correos quedan en un archivo) en un celular 390x844:
     1. Juego: Entrar → "¿Olvidaste tu contraseña?" (con el correo ya escrito) → enviar → aviso (igual exista o no).
     2. El correo (archivo) trae el enlace → /recuperar.html muestra la cuenta tapada → claves distintas = aviso →
        clave nueva → "¡Listo!" → "Ir al juego" ya con la sesión abierta.
     3. Otro "celular" que tenía la sesión abierta queda fuera; la clave vieja no entra y la nueva sí.
     4. El mismo enlace otra vez → "Este enlace ya no sirve"; sin enlace → formulario para pedirlo.
     5. Inglés: el botón y la ventana del juego, y la página, en inglés.
   En todos: sin errores de JS y sin desborde horizontal. Capturas en tests/capturas/correo_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_correo.js */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }
const libre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

(async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_correo_js_'));
  fs.mkdirSync(path.join(TMP, 'datos'));
  const P = await libre();
  const BASE = `http://127.0.0.1:${P}`;
  const LOG = path.join(TMP, 'correos.log');
  fs.writeFileSync(path.join(TMP, 'config.env'), `; SOLO PRUEBAS\nENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\nSOPORTE_CORREO=soporte@prueba.example\nCORREO_REGISTRO=${LOG}\n`);
  const srv = spawn('php', ['-d', `error_log=${TMP}/php_errores.log`, '-d', 'log_errors=1', '-d', 'display_errors=0', '-S', `127.0.0.1:${P}`, '-t', RAIZ, 'server/tests/router.php'],
    { cwd: RAIZ, env: { ...process.env, ENVIVO_CONFIG: path.join(TMP, 'config.env'), PHP_CLI_SERVER_WORKERS: '3' }, stdio: 'ignore' });
  let browser = null;
  const terminar = (codigo) => { try { srv.kill(); } catch (e) { /* nada */ } if (browser) browser.close().catch(() => {}); if (!process.env.GUARDAR_TMP) fs.rmSync(TMP, { recursive: true, force: true }); process.exit(codigo); };
  try {
    let arriba = false;
    for (let i = 0; i < 80 && !arriba; i++) { try { arriba = (await fetch(BASE + '/api/estado')).ok; } catch (e) { await dormir(100); } }
    if (!arriba) { console.error('❌ el servidor de prueba no arrancó'); terminar(1); }
    const api = async (ruta, cuerpo, galleta) => {
      const r = await fetch(BASE + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', ...(galleta ? { Cookie: galleta } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      return { status: r.status, j: await r.json().catch(() => null), galleta: (r.headers.get('set-cookie') || '').split(';')[0] };
    };
    const reg = await api('/api/registro', { email: 'dimi@prueba.example', nombre: 'Dimi', clave: 'ClaveVieja1' });
    bien(reg.status === 200 && /^envivo_s=/.test(reg.galleta), 'Cuenta de prueba creada (y su sesión en "otro celular")');
    const otroCelular = reg.galleta;

    browser = await chromium.launch();
    async function abrirJuego(idioma) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const page = await ctx.newPage();
      const errores = [];
      page.on('pageerror', (e) => errores.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
      await page.addInitScript((i) => {
        try {
          if (localStorage.getItem('__prueba_init')) return;
          localStorage.setItem('__prueba_init', '1');
          localStorage.setItem('envivo_guia_v1', '"hecha"');
          localStorage.setItem('envivo_lang', i);
        } catch (e) { /* nada */ }
      }, idioma || 'es');
      return { ctx, page, errores };
    }
    const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    async function cerrarVentanas(page) {
      for (let i = 0; i < 6; i++) {
        const on = await page.evaluate(() => document.getElementById('overlay') && document.getElementById('overlay').classList.contains('on'));
        if (!on) return;
        const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"], #overlay.on button.main');
        if (!b) return;
        await b.click(); await page.waitForTimeout(250);
      }
    }
    async function abrirEntrar(page) {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.Api && window.Api.disponible === true && window.Recuperar, null, { timeout: 10000 });
      await page.waitForTimeout(400);
      await cerrarVentanas(page);
      await page.click('nav button[data-tab="tienda"]');
      await page.waitForTimeout(200);
      await page.click('[data-act="cuenta"][data-modo="entrar"]');
      await page.waitForSelector('#formCuenta');
    }

    // ---------------------------------------------------------------- 1. Pedir el enlace desde el juego
    const A = await abrirJuego('es');
    await abrirEntrar(A.page);
    const boton = await A.page.$('#overlay.on [data-recuperar]');
    bien(!!boton && (await boton.innerText()).trim() === '¿Olvidaste tu contraseña?', 'Entrar: botón "¿Olvidaste tu contraseña?" (ya no solo el texto de escribir a soporte)');
    await A.page.fill('#cu-email', 'dimi@prueba.example');
    await A.page.waitForTimeout(500);   // que termine la animación de la ventana
    await A.page.screenshot({ path: path.join(OUT, 'correo_entrar.png') });
    await boton.click();
    await A.page.waitForSelector('#formRecuperar');
    bien(await A.page.inputValue('#rc-email') === 'dimi@prueba.example', 'La ventana cambia a "Recuperar contraseña" con el correo ya escrito');
    await A.page.fill('#rc-email', 'mal@');
    await A.page.click('#rc-btn');
    bien((await A.page.innerText('#rc-error')).includes('correo válido'), 'Correo mal escrito: aviso sin llamar al servidor');
    await A.page.fill('#rc-email', 'dimi@prueba.example');
    await A.page.screenshot({ path: path.join(OUT, 'correo_recuperar.png') });
    await A.page.click('#rc-btn');
    await A.page.waitForSelector('#rc-ok:not([hidden])', { timeout: 8000 });
    const aviso = await A.page.innerText('#rc-ok');
    bien(/spam/.test(aviso) && /30 minutos/.test(aviso), 'Aviso: "si ese correo tiene una cuenta…", revisar spam, 30 minutos');
    bien(await A.page.isHidden('#formRecuperar'), 'El formulario se esconde después de enviar (no se manda dos veces por error)');
    await A.page.screenshot({ path: path.join(OUT, 'correo_enviado.png') });
    bien(!(await desborde(A.page)), 'Ventana sin desborde horizontal a 390 px');
    // "Volver a entrar" vuelve al formulario de Entrar
    await A.page.click('#overlay.on [data-act="cuenta"][data-modo="entrar"]');
    bien(!!(await A.page.$('#formCuenta')), '"Volver a entrar" vuelve al formulario de Entrar');

    // ---------------------------------------------------------------- 2. El enlace del correo y la página
    let correos = [];
    for (let i = 0; i < 40 && !correos.length; i++) { correos = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; if (!correos.length) await dormir(100); }
    const enlace = ((correos[0] && correos[0].texto) || '').match(new RegExp(BASE.replace(/[.]/g, '\\.') + '/recuperar\\.html#t=[a-f0-9]{64}'));
    bien(correos.length === 1 && correos[0].para === 'dimi@prueba.example' && !!enlace, 'Llegó UN correo a dimi con el enlace /recuperar.html#t=…');
    // Vista del correo (HTML tal cual) para la captura
    const V = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const vp = await V.newPage();
    await vp.setContent(correos[0].html);
    await vp.screenshot({ path: path.join(OUT, 'correo_email.png') });
    bien(await vp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'El correo (HTML) se ve bien en un celular, sin desborde');
    await V.close();

    const page = A.page;
    await page.goto(enlace[0], { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#v-nueva:not([hidden])', { timeout: 8000 });
    bien((await page.innerText('#n-email')) === 'd•••@prueba.example', 'La página muestra la cuenta tapada (d•••@prueba.example)');
    bien(!/#t=/.test(page.url()), 'El código del enlace se quita de la barra de direcciones');
    await page.screenshot({ path: path.join(OUT, 'correo_pagina_nueva.png') });
    await page.fill('#n-clave', 'ClaveNueva123'); await page.fill('#n-clave2', 'ClaveNueva124');
    await page.click('#n-btn');
    bien((await page.innerText('#n-aviso')).includes('no son iguales'), 'Claves distintas: aviso');
    await page.fill('#n-clave', 'corta'); await page.fill('#n-clave2', 'corta');
    await page.click('#n-btn');
    bien((await page.innerText('#n-aviso')).includes('al menos 8'), 'Clave corta: aviso');
    await page.check('#n-ver');
    bien(await page.getAttribute('#n-clave', 'type') === 'text', '"Mostrar contraseña" funciona');
    await page.fill('#n-clave', 'ClaveNueva123'); await page.fill('#n-clave2', 'ClaveNueva123');
    await page.screenshot({ path: path.join(OUT, 'correo_pagina_error.png') });
    await page.click('#n-btn');
    await page.waitForSelector('#v-listo:not([hidden])', { timeout: 8000 });
    bien(!(await desborde(page)), 'Página sin desborde horizontal a 390 px');
    await page.screenshot({ path: path.join(OUT, 'correo_pagina_listo.png') });
    await page.click('#ir-juego');
    await page.waitForFunction(() => window.Api && window.Api.estado, null, { timeout: 10000 });
    bien(await page.evaluate(() => !!(window.Api.estado && window.Api.estado.logueado)), '"Ir al juego": ya entra con la sesión abierta');

    // ---------------------------------------------------------------- 3. Otras sesiones y claves
    const est = await api('/api/estado', null, otroCelular);
    bien(est.j && est.j.logueado === false, 'El "otro celular" quedó fuera (todas las demás sesiones se cerraron)');
    bien((await api('/api/entrar', { email: 'dimi@prueba.example', clave: 'ClaveVieja1' })).status === 401, 'La clave vieja ya no entra');
    bien((await api('/api/entrar', { email: 'dimi@prueba.example', clave: 'ClaveNueva123' })).status === 200, 'La clave nueva sí entra');
    correos = fs.readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    bien(correos.length === 2 && /cambió/.test(correos[1].asunto), 'Llegó el aviso "Tu contraseña de EN VIVO Tycoon cambió"');

    // ---------------------------------------------------------------- 4. Enlace usado y página sin enlace
    await page.goto(enlace[0], { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#v-invalido:not([hidden])', { timeout: 8000 });
    bien(true, 'El mismo enlace otra vez: "Este enlace ya no sirve"');
    await page.screenshot({ path: path.join(OUT, 'correo_pagina_invalido.png') });
    await page.click('#i-pedir');
    bien(await page.isVisible('#f-pedir'), '"Pedir un enlace nuevo" muestra el formulario');
    await page.goto(BASE + '/recuperar.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#v-pedir:not([hidden])');
    await page.fill('#p-email', 'nadie@prueba.example');
    await page.click('#p-btn');
    await page.waitForSelector('#p-aviso.aviso-ok', { timeout: 8000 });
    bien(/spam/.test(await page.innerText('#p-aviso')), 'Sin enlace: la página sirve para pedirlo (misma respuesta para un correo sin cuenta)');
    await page.screenshot({ path: path.join(OUT, 'correo_pagina_pedir.png') });
    bien(A.errores.length === 0, 'Sin errores de JavaScript (juego y página)' + (A.errores.length ? ': ' + A.errores.join(' | ') : ''));
    await A.ctx.close();

    // ---------------------------------------------------------------- 5. Inglés
    const B = await abrirJuego('en');
    await abrirEntrar(B.page);
    const bEn = await B.page.$('#overlay.on [data-recuperar]');
    bien(!!bEn && (await bEn.innerText()).trim() === 'Forgot your password?', 'Inglés: "Forgot your password?"');
    await bEn.click();
    await B.page.waitForSelector('#formRecuperar');
    const tEn = await B.page.innerText('#modal');
    bien(/Reset password/.test(tEn) && /Send me the link/.test(tEn) && !/Recuperar|Enviarme/.test(tEn), 'Inglés: la ventana sale en inglés');
    await B.page.screenshot({ path: path.join(OUT, 'correo_recuperar_en.png') });
    await B.page.goto(BASE + '/recuperar.html', { waitUntil: 'domcontentloaded' });
    await B.page.waitForSelector('#v-pedir:not([hidden])');
    bien(/Send me the link/.test(await B.page.innerText('body')) && (await B.page.getAttribute('html', 'lang')) === 'en', 'Inglés: la página toma el idioma elegido en el juego');
    bien(B.errores.length === 0, 'Sin errores de JavaScript en inglés' + (B.errores.length ? ': ' + B.errores.join(' | ') : ''));
    await B.ctx.close();

    const err = fs.existsSync(path.join(TMP, 'php_errores.log')) ? fs.readFileSync(path.join(TMP, 'php_errores.log'), 'utf8') : '';
    bien(!/fatal|warning|deprecated|notice/i.test(err), 'Sin errores ni avisos de PHP' + (err ? ': ' + err.slice(0, 500) : ''));
  } catch (e) {
    fallas++; console.error('❌ La prueba se cayó:', e && e.stack || e);
  }
  console.log(`\nResumen test_correo.js — correctas: ${aciertos} · fallas: ${fallas}`);
  terminar(fallas ? 1 : 0);
})();
