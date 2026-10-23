/* Errores del juego de punta a punta (js/errores.js -> POST /api/error -> Centro de Control > Errores), con el servidor
   PHP de verdad ("php -S" + server/tests/router_control.php) y una base SQLite TEMPORAL. Playwright + Chromium, celular 390x844.
   1. Con window.__ENVIVO_ERRORES = true el juego (?origen=android) lanza un error, una promesa sin atender y un
      ReportarError(e, contexto): llegan los 3 con plataforma android, la dirección sin datos personales, la versión del
      service worker, el idioma, los últimos toques y sin repetidos (el mismo error 2 veces = 1). Máximo 10 por sesión.
   2. Sin la bandera (navigator.webdriver, como en las demás pruebas) no se manda nada.
   3. Panel: entrar, ver la pestaña Errores (lista y detalle) sin desborde horizontal, marcar resuelto. Capturas en
      tests/capturas/errores_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_errores.js */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CAPT = path.join(__dirname, 'capturas');
fs.mkdirSync(CAPT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_test_errores_'));
let ok = 0, fallas = 0;
const check = (n, esperado, real) => {
  const a = JSON.stringify(esperado), b = JSON.stringify(real);
  if (a === b) { ok++; console.log('  OK    ' + n); } else { fallas++; console.log('  FALLA ' + n + ' — esperado ' + a + ', salió ' + b); }
};
const si = (n, c) => check(n, true, !!c);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const puerto = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

function sql(db, q) {
  const out = execFileSync('php', ['-r', '$p = new PDO("sqlite:" . $argv[1]); $p->exec("PRAGMA busy_timeout = 5000"); echo json_encode($p->query($argv[2])->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);', db, q]);
  return JSON.parse(String(out));
}

(async () => {
  const P = Number(process.env.P_APP) || await puerto();
  const BASE = 'http://127.0.0.1:' + P;
  const DB = path.join(TMP, 'envivo.sqlite');
  const USUARIO = 'jefe_errores', CLAVE = 'Err-' + Math.random().toString(36).slice(2, 10);
  const hash = String(execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_BCRYPT);', CLAVE]));
  fs.writeFileSync(path.join(TMP, 'config.env'), `; SOLO PRUEBAS\nENVIVO_DB=${DB}\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\nENVIVO_ADMIN_USUARIO=${USUARIO}\nENVIVO_ADMIN_CLAVE_HASH=${hash}\nERRORES_ALERTA=2\n`);
  const env = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP, 'config.env'), PHP_CLI_SERVER_WORKERS: '3', TZ: 'America/Guayaquil' });
  execFileSync('php', [path.join(RAIZ, 'server/bin/migrar.php')], { env });
  const srv = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' + path.join(TMP, 'php.log'), '-S', '127.0.0.1:' + P, '-t', RAIZ, path.join(RAIZ, 'server/tests/router_control.php')],
    { cwd: RAIZ, env, stdio: 'ignore' });
  const VERSION_SW = (/const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8')) || [])[1];
  let nav;
  try {
    for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/estado'); if (r.ok) break; } catch (e) { /* aún no */ } await esperar(100); }
    nav = await chromium.launch();
    const opc = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-EC' };
    const bloquearFuentes = (c) => c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

    console.log('\n== 1. El juego manda sus errores (con window.__ENVIVO_ERRORES = true)');
    const ctx = await nav.newContext(opc);
    await bloquearFuentes(ctx);
    await ctx.addInitScript(() => { window.__ENVIVO_ERRORES = true; });
    const pg = await ctx.newPage();
    const beacons = [];
    pg.on('request', (r) => { if (r.url().endsWith('/api/error')) beacons.push({ metodo: r.method(), cuerpo: r.postData() || '', cab: r.headers() }); });
    // Primera visita: el service worker se instala y guarda la caché "envivo-vNN-shell"; la segunda ya la tiene
    await pg.goto(BASE + '/index.html?origen=android&fecha=2026-11-10&correo=ana@prueba.example', { waitUntil: 'load' });
    await pg.evaluate(async () => { try { await navigator.serviceWorker.ready; } catch (e) { /* nada */ } });
    for (let i = 0; i < 50; i++) { if (await pg.evaluate(async () => (await caches.keys()).some((k) => /-shell$/.test(k)))) break; await esperar(200); }
    await pg.reload({ waitUntil: 'load' });
    si('errores.js cargó y está activo (EnVivoErrores.estado().activo)', await pg.evaluate(() => window.EnVivoErrores && window.EnVivoErrores.estado().activo));
    await pg.screenshot({ path: path.join(CAPT, 'errores_juego_inicio.png') });
    await pg.locator('button[data-tab="clientes"]').first().click({ timeout: 5000 });   // un toque (para "últimos pasos")
    await esperar(300);
    // Un error de verdad (sin atrapar), una promesa sin atender y uno reportado a mano; el mismo error otra vez no se repite
    // El error sale de un archivo del sitio (/js/prueba_falla.js, servido por la prueba), como uno del juego
    await ctx.route(BASE + '/js/prueba_falla.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: '// prueba\nwindow.pruebaLanzar = function () {\n  setTimeout(function pruebaFalla() { null.propiedad_de_prueba; }, 0);\n};\n' }));
    await pg.evaluate(() => new Promise((res) => { const s = document.createElement('script'); s.src = '/js/prueba_falla.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); }));
    await pg.evaluate(() => {
      window.pruebaLanzar(); window.pruebaLanzar();
      Promise.reject(new Error('Promesa de prueba 42 rechazada'));
      window.ReportarError(new Error('Fallo manual de prueba para ana@prueba.example'), 'prueba.contexto');
    });
    await esperar(3500);
    const filas = sql(DB, 'SELECT c.*, g.total FROM errores_cliente c JOIN errores_grupos g ON g.id = c.grupo_id ORDER BY c.id');
    check('Llegan 3 errores (el repetido no se manda dos veces)', 3, filas.length);
    const porTipo = Object.fromEntries(filas.map((f) => [f.tipo, f]));
    check('Tipos: error, promesa y manual', ['error', 'manual', 'promesa'], Object.keys(porTipo).sort());
    const err = porTipo.error || {}, pro = porTipo.promesa || {}, man = porTipo.manual || {};
    check('El error de verdad: TypeError en /js/prueba_falla.js línea 3 (y la función en la pila, sin el dominio)', [true, '/js/prueba_falla.js', 3, true, false],
      [/^TypeError: /.test(err.mensaje), err.archivo, err.linea, /pruebaFalla \(\/js\/prueba_falla\.js:3:\d+\)/.test(err.pila || ''), (err.pila || '').includes('127.0.0.1')]);
    si('La promesa sin atender: su mensaje', /Promesa de prueba 42 rechazada/.test(pro.mensaje || ''));
    check('El manual: contexto y correo quitado', ['prueba.contexto', 'Error: Fallo manual de prueba para [correo]'], [man.contexto, man.mensaje]);
    check('Plataforma android y dirección sin datos personales (solo ?origen=android)', [['android'], ['/index.html?origen=android']], [[...new Set(filas.map((f) => f.plataforma))], [...new Set(filas.map((f) => f.url))]]);
    check('Versión = la caché del service worker (' + VERSION_SW + ')', [VERSION_SW], [...new Set(filas.map((f) => f.version))]);
    check('Idioma del juego', ['es'], [...new Set(filas.map((f) => f.idioma))]);
    check('Últimos pasos: el toque a la pestaña Clientes (sin textos)', ['button[act=tab][tab=clientes]'], [...new Set(filas.map((f) => f.ultimo_paso))]);
    si('Navegador corto y memoria / conexión si el navegador las da', /^Chrome \d+/.test(err.navegador || '') && typeof err.memoria === 'string');
    check('Ninguna fila con el correo de la dirección', false, JSON.stringify(filas).includes('ana@'));
    const b = beacons[0] || { cab: {} };
    check('Se mandó por sendBeacon (POST text/plain, sin X-Envivo) en UN lote', ['POST', true, undefined, 1], [b.metodo, /^text\/plain/.test(b.cab['content-type'] || ''), b.cab['x-envivo'], beacons.length]);

    // Máximo 10 por sesión
    await pg.evaluate(() => { for (let i = 0; i < 15; i++) window.ReportarError(new Error('Muchos ' + i + ' x' + 'abcdefghijklmnop'[i]), 'tope'); });
    await esperar(3000);
    check('Máximo 10 por sesión (3 + 7 más)', 10, sql(DB, 'SELECT COUNT(*) AS n FROM errores_cliente')[0].n);
    check('EnVivoErrores.estado(): 10 contados, 0 pendientes', [10, 0], await pg.evaluate(() => [window.EnVivoErrores.estado().contados, window.EnVivoErrores.estado().pendientes]));
    const sinErrores = await pg.evaluate(() => { try { window.ReportarError(undefined); window.ReportarError({ raro: true }); window.ReportarError('texto'); return true; } catch (e) { return false; } });
    si('ReportarError nunca lanza (undefined, objeto, texto, pasado el tope)', sinErrores);
    await ctx.close();

    console.log('\n== 2. En pruebas automáticas (navigator.webdriver) sin la bandera: no manda nada');
    const ctx2 = await nav.newContext(Object.assign({}, opc, { serviceWorkers: 'block' }));
    await bloquearFuentes(ctx2);
    const pg2 = await ctx2.newPage();
    let pedidos = 0;
    pg2.on('request', (r) => { if (r.url().endsWith('/api/error')) pedidos++; });
    await pg2.goto(BASE + '/index.html?fecha=2026-11-10', { waitUntil: 'load' });
    await pg2.evaluate(() => { setTimeout(() => { throw new Error('No se debe mandar'); }, 0); window.ReportarError(new Error('Tampoco')); });
    await esperar(2800);
    check('Apagado: 0 pedidos a /api/error y la base igual', [0, false, 10], [pedidos, await pg2.evaluate(() => window.EnVivoErrores.estado().activo), sql(DB, 'SELECT COUNT(*) AS n FROM errores_cliente')[0].n]);
    await pg2.screenshot({ path: path.join(CAPT, 'errores_juego.png') });
    await ctx2.close();

    console.log('\n== 3. Centro de Control > Errores');
    const ctx3 = await nav.newContext(opc);
    const p = await ctx3.newPage();
    const errPanel = [];
    p.on('pageerror', (e) => errPanel.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errPanel.push(m.text()); });
    p.on('dialog', (d) => d.accept());
    const desborde = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await p.goto(BASE + '/control/');
    await p.fill('input[name="usuario"]', USUARIO);
    await p.fill('input[name="clave"]', CLAVE);
    await Promise.all([p.waitForNavigation(), p.click('#form-entrar button[type="submit"]')]);
    await p.goto(BASE + '/control/?t=errores');
    check('Lista: 10 grupos y la pestaña activa', [10, 'errores'], [await p.locator('#tabla-errores tbody tr').count(), await p.evaluate(() => document.body.dataset.pestana)]);
    check('Sin desborde horizontal (lista)', 0, await desborde());
    await p.screenshot({ path: path.join(CAPT, 'errores_lista.png'), fullPage: true });
    await p.locator('#tabla-errores tbody tr a').filter({ hasText: 'TypeError' }).first().click();
    await p.waitForSelector('#pila-error');
    si('Detalle: pila con pruebaFalla, versión y App Android', /pruebaFalla/.test(await p.textContent('#pila-error')) && (await p.textContent('#tabla-err-versiones')).includes(VERSION_SW) && (await p.textContent('#tabla-err-plataformas')).includes('App Android'));
    check('Sin desborde horizontal (detalle)', 0, await desborde());
    await p.screenshot({ path: path.join(CAPT, 'errores_detalle.png'), fullPage: true });
    await p.fill('input[name="nota"]', 'arreglado en la prueba');
    await Promise.all([p.waitForNavigation(), p.click('#btn-resolver')]);
    check('Marcar resuelto (con el diálogo de confirmación): aviso ok y chip resuelto', [true, true], [/marcado como resuelto/.test(await p.textContent('#aviso')), (await p.textContent('h1')).includes('resuelto')]);
    check('…y en la base, con la auditoría', [1, 1], [sql(DB, 'SELECT COUNT(*) AS n FROM errores_grupos WHERE resuelto IS NOT NULL')[0].n, sql(DB, "SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'errores_resolver'")[0].n]);
    await p.screenshot({ path: path.join(CAPT, 'errores_resuelto.png'), fullPage: true });
    // Resumen con el aviso (ERRORES_ALERTA=2 en esta prueba: un error nuevo que pasó 2 veces)
    execFileSync('php', ['-r', '$p = new PDO("sqlite:" . $argv[1]); $p->exec("UPDATE errores_grupos SET total = 3 WHERE mensaje LIKE \'%Promesa de prueba%\'");', DB]);
    await p.goto(BASE + '/control/?t=resumen');
    si('Resumen: línea de aviso del error nuevo', (await p.locator('#alerta-errores').count()) === 1 && /Promesa de prueba/.test(await p.textContent('#alerta-errores')));
    await p.locator('#alerta-errores').screenshot({ path: path.join(CAPT, 'errores_resumen_aviso.png') });
    check('Panel sin errores de JavaScript', [], errPanel);
    // Escritorio
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(BASE + '/control/?t=errores&resueltos=1&p=7d');
    await p.screenshot({ path: path.join(CAPT, 'errores_lista_escritorio.png'), fullPage: true });
    await ctx3.close();
    const log = fs.existsSync(path.join(TMP, 'php.log')) ? fs.readFileSync(path.join(TMP, 'php.log'), 'utf8') : '';
    check('Sin errores de PHP', '', log.split('\n').filter((l) => /PHP (Fatal|Warning|Notice|Deprecated)|EN VIVO (api|control)/.test(l)).join('\n'));
  } catch (e) {
    fallas++;
    console.log('  FALLA excepción: ' + (e && e.stack || e));
  } finally {
    if (nav) await nav.close();
    srv.kill();
    if (process.env.GUARDAR_TMP !== '1') fs.rmSync(TMP, { recursive: true, force: true }); else console.log('Archivos en ' + TMP);
  }
  console.log('\nErrores (navegador): ' + ok + ' correctas, ' + fallas + ' fallas');
  process.exit(fallas ? 1 : 0);
})();
