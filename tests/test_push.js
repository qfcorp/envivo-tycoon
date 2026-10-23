/* Prueba de navegador de las notificaciones push (js/push.js + sw.js + server/src/Push*.php) con Playwright.
   - Levanta el servidor DE VERDAD (php -S + server/tests/router.php, base y config temporales, llaves VAPID hechas con
     server/bin/push_claves.php) y un servicio de push FALSO en node que guarda lo que le llega.
   - En el navegador, Notification y PushManager son falsos (Chromium sin servicio de push), pero las llaves del aparato
     son de verdad (WebCrypto P-256): el servidor cifra con ellas y la página DESCIFRA con WebCrypto (HKDF + AES-GCM),
     una implementación independiente de la de PHP.
   - Revisa: nunca pregunta al abrir; pregunta (con aviso propio) al crear la cuenta y tras el primer evento de 5 estrellas;
     "Ahora no" no vuelve a preguntar; "Sí" pide el permiso y suscribe; botón "Notificaciones" junto a "Salir"; ajustes por
     categoría (ofertas apagado); permiso bloqueado; salir da de baja el aparato; textos en 10 idiomas; 390x844 sin desborde.
   Capturas: tests/capturas/push_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_push.js */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CAPT = path.join(__dirname, 'capturas');
fs.mkdirSync(CAPT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_push_nav_'));
let ok = 0, fallas = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('  OK    ' + n); } else { fallas++; console.log('  FALLA ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const libre = () => new Promise((r) => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

// ---- Servicio de push falso (como FCM): server/tests/push_falso.php en su propio proceso (el envío de PHP corre con
// execFileSync, que deja quieto a node) — guarda cuerpo y cabeceras en TMP/falso y responde 201 en /ok/... ----
const DIR_FALSO = path.join(TMP, 'falso');
fs.mkdirSync(DIR_FALSO);
const recibidos = () => fs.readdirSync(DIR_FALSO).sort().filter((f) => JSON.parse(fs.readFileSync(path.join(DIR_FALSO, f), 'utf8')).ruta.startsWith('/ok/')).map((f) => { const j = JSON.parse(fs.readFileSync(path.join(DIR_FALSO, f), 'utf8')); return { ruta: j.ruta, cab: j.cabeceras, cuerpo: j.cuerpo }; });

// ---- Lo que se inyecta en la página antes que todo: Notification y PushManager falsos (llaves reales con WebCrypto) ----
function simular(cfg) {
  const st = window.__push = { permiso: cfg.permiso || 'default', respuesta: cfg.respuesta || 'granted', pedidos: 0, sub: null, priv: null, n: 0 };
  function FakeNotification() {}
  Object.defineProperty(FakeNotification, 'permission', { get: () => st.permiso });
  FakeNotification.requestPermission = async () => { st.pedidos++; st.permiso = st.respuesta; return st.permiso; };
  window.Notification = FakeNotification;
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const pm = {
    async getSubscription() { return st.sub; },
    async subscribe(op) {
      if (!op || op.userVisibleOnly !== true || !op.applicationServerKey) throw new Error('subscribe sin userVisibleOnly/applicationServerKey');
      const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const pub = await crypto.subtle.exportKey('raw', par.publicKey);
      const auth = crypto.getRandomValues(new Uint8Array(16));
      st.priv = par.privateKey; st.pub = new Uint8Array(pub); st.auth = auth;
      const endpoint = cfg.endpoint + '/ok/navegador-' + (++st.n);
      const key = new Uint8Array(op.applicationServerKey).buffer;
      st.sub = { endpoint, options: { applicationServerKey: key, userVisibleOnly: true },
        toJSON() { return { endpoint, expirationTime: null, keys: { p256dh: b64u(pub), auth: b64u(auth) } }; },
        async unsubscribe() { st.sub = null; return true; } };
      return st.sub;
    },
  };
  const reg = { pushManager: pm, scope: location.origin + '/' };
  Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { get: () => Promise.resolve(reg) });
  // Descifrado RFC 8291 independiente (WebCrypto: ECDH + HKDF + AES-GCM)
  window.__descifrar = async (b64) => {
    const body = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
    const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, st.priv, 256);
    const enc = (s) => new TextEncoder().encode(s);
    const junta = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach((x) => { o.set(x, i); i += x.length; }); return o; };
    const hkdf = async (sal, ikm, info, bits) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info },
      await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bits));
    const ikm = await hkdf(st.auth, new Uint8Array(ecdh), junta(enc('WebPush: info\0'), st.pub, asPub), 256);
    const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 128);
    const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 96);
    const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    let p = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct));
    let fin = p.length; while (fin > 0 && p[fin - 1] === 0) fin--;
    if (p[fin - 1] !== 2) throw new Error('sin delimitador 0x02');
    return new TextDecoder().decode(p.slice(0, fin - 1));
  };
}

(async () => {
  console.log('== Textos de js/push.js (10 idiomas, mismas claves)');
  const sb = { window: {}, document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], body: {} }, navigator: {}, MutationObserver: function () { this.observe = () => {}; }, setTimeout, console };
  sb.window = sb; sb.globalThis = sb;
  try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/push.js'), 'utf8'), sb); } catch (e) { /* sin DOM: solo se leen los textos */ }
  const TX = sb.Push && sb.Push.textos;
  const idiomas = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
  check('Los 10 idiomas están', !!TX && idiomas.every((i) => TX[i]), TX && Object.keys(TX));
  const claves = TX ? Object.keys(TX.es).sort().join() : '';
  check('Todos con las mismas claves que el español', !!TX && idiomas.every((i) => Object.keys(TX[i]).sort().join() === claves), TX && idiomas.filter((i) => Object.keys(TX[i]).sort().join() !== claves));
  check('Marcador {n} en pre_nota y nota de cada idioma', !!TX && idiomas.every((i) => TX[i].pre_nota.includes('{n}') && TX[i].nota.includes('{n}')));

  const P_FALSO = await libre();
  const falso = spawn('php', ['-S', '127.0.0.1:' + P_FALSO, path.join(ROOT, 'server/tests/push_falso.php')], { env: { ...process.env, PUSH_FALSO_DIR: DIR_FALSO }, stdio: 'ignore' });
  const P_APP = await libre();
  const conf = path.join(TMP, 'config.env');
  fs.mkdirSync(path.join(TMP, 'datos'));
  fs.writeFileSync(conf, `; SOLO PRUEBAS\nENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:${P_APP}\nENVIVO_ZONA=America/Guayaquil\nPUSH_HOSTS_EXTRA=127.0.0.1:${P_FALSO}\n`);
  execFileSync('php', [path.join(ROOT, 'server/bin/push_claves.php'), '--escribir'], { env: { ...process.env, ENVIVO_CONFIG: conf } });
  const php = spawn('php', ['-S', '127.0.0.1:' + P_APP, '-t', ROOT, path.join(ROOT, 'server/tests/router.php')], { env: { ...process.env, ENVIVO_CONFIG: conf, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
  const base = 'http://127.0.0.1:' + P_APP;
  for (const u of [base + '/api/estado', 'http://127.0.0.1:' + P_FALSO + '/']) {
    for (let i = 0; i < 60; i++) { try { await new Promise((r, n) => http.get(u, (res) => { res.resume(); r(); }).on('error', n)); break; } catch (e) { await esperar(150); } }
  }
  const sql = (q) => execFileSync('php', ['-r', `$p=new PDO('sqlite:${TMP}/datos/envivo.sqlite');echo json_encode($p->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_ASSOC));`]).toString();
  const enviarDesdePhp = (email, titulo, cuerpo) => execFileSync('php', ['-r', `require '${ROOT}/server/src/arranque.php'; use EnVivo\\{Db,Push}; Db::pdo();
    $j=(int)Db::valor('SELECT id FROM jugadores WHERE email=?',['${email}']); $id=Push::encolar($j,'buzon','${titulo}','${cuerpo}','/?ir=soporte',['forzar'=>true]);
    echo Push::procesarUno(Db::fila('SELECT * FROM push_cola WHERE id=?',[$id]));`], { env: { ...process.env, ENVIVO_CONFIG: conf } }).toString();

  const nav = await chromium.launch();
  const errores = [];
  const nuevaPagina = async (cfg, locale) => {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: locale || 'es-EC', serviceWorkers: 'block' });
    await ctx.addInitScript(simular, Object.assign({ endpoint: 'http://127.0.0.1:' + P_FALSO }, cfg || {}));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errores.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|service ?worker/i.test(m.text())) errores.push(m.text()); });
    await p.goto(base + '/', { waitUntil: 'load' });
    await p.waitForFunction(() => window.Push && window.Api && window.Game, null, { timeout: 15000 });
    return { ctx, p };
  };
  const cerrarModales = (p) => p.evaluate(() => { const o = document.getElementById('overlay'); if (o) o.classList.remove('on'); });
  const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const hay = (p, sel) => p.evaluate((s) => !!document.querySelector(s), sel);

  try {
    console.log('\n== Nunca pregunta al abrir el juego');
    let { ctx, p } = await nuevaPagina();
    await esperar(3500);
    check('Primera vez que abre (sin cuenta): sin aviso previo', !(await hay(p, '#push-previo')));
    check('Ni pidió el permiso del navegador', (await p.evaluate(() => window.__push.pedidos)) === 0);

    console.log('\n== Al crear la cuenta: aviso previo propio');
    await p.evaluate(() => window.Api.registro('nav1@prueba.example', 'Nadia Push', 'ClaveSegura123', { acepta_terminos: true, edad_16: true }));
    await cerrarModales(p);
    await p.waitForSelector('#push-previo', { timeout: 15000 }).catch(() => null);
    check('Aparece el aviso previo después de crear la cuenta', await hay(p, '#push-previo'));
    check('…con el título de cuenta y las categorías de ejemplo', await p.evaluate(() => /Cuenta lista/.test(document.querySelector('#push-previo-t').textContent) && document.querySelectorAll('#push-previo .push-lista li').length === 3));
    check('…y todavía NO pidió el permiso del navegador', (await p.evaluate(() => window.__push.pedidos)) === 0);
    check('Sin desborde horizontal a 390 px', (await desborde(p)) <= 0);
    await esperar(450); await p.screenshot({ path: path.join(CAPT, 'push_previo_cuenta.png') });
    await p.click('#push-previo [data-push="si"]');
    await p.waitForFunction(() => /Listo/.test((document.querySelector('#push-previo-msg') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => null);
    check('"Sí, avísame": pide el permiso una vez y suscribe', await p.evaluate(() => window.__push.pedidos === 1 && !!window.__push.sub));
    let filas = JSON.parse(sql("SELECT s.idioma, s.dispositivo, s.categorias_json FROM push_suscripciones s JOIN jugadores j ON j.id = s.jugador_id WHERE j.email = 'nav1@prueba.example'"));
    check('El servidor guardó la suscripción de este aparato (idioma es, id de aparato, ofertas apagado)', filas.length === 1 && filas[0].idioma === 'es' && /^[a-f0-9]{32}$/.test(filas[0].dispositivo) && JSON.parse(filas[0].categorias_json).ofertas === false, filas);
    await esperar(450); await p.screenshot({ path: path.join(CAPT, 'push_previo_listo.png') });

    console.log('\n== De punta a punta: PHP cifra, el navegador descifra con WebCrypto');
    const res = enviarDesdePhp('nav1@prueba.example', 'Hola Nadia', 'Soporte te respondió');
    check('PHP envió al servicio falso', res === 'enviados' && recibidos().length === 1, [res, sql('SELECT http FROM push_envios')]);
    const rec = recibidos().pop() || {};
    check('Cabeceras: aes128gcm, TTL, VAPID con la llave pública del servidor', rec.cab && rec.cab['content-encoding'] === 'aes128gcm' && rec.cab.ttl === '86400' && /^vapid t=.+, k=[\w-]{87}$/.test(rec.cab.authorization || ''));
    const plano = await p.evaluate((b) => window.__descifrar(b), rec.cuerpo || '').catch((e) => 'ERROR ' + e);
    let msg = null; try { msg = JSON.parse(plano); } catch (e) { /* nada */ }
    check('WebCrypto descifra lo que mandó PHP (RFC 8291)', !!msg && msg.t === 'Hola Nadia' && msg.b === 'Soporte te respondió' && msg.u === '/?ir=soporte' && msg.tag === 'buzon', plano);

    console.log('\n== Ajustes: botón junto a "Salir" y categorías');
    await cerrarModales(p);
    await p.evaluate(() => { const b = document.querySelector('nav [data-tab="tienda"], [data-tab="tienda"]'); if (b) b.click(); });
    await p.waitForSelector('[data-push-ajustes]', { timeout: 10000 }).catch(() => null);
    check('Aparece el botón "Notificaciones" en la tarjeta de la cuenta, antes de "Salir"', await p.evaluate(() => { const b = document.querySelector('[data-push-ajustes]'); return !!b && b.nextElementSibling && b.nextElementSibling.getAttribute('data-act') === 'salir'; }));
    await p.evaluate(() => document.querySelector('[data-push-ajustes]').scrollIntoView({ block: 'center' }));
    await esperar(450); await p.screenshot({ path: path.join(CAPT, 'push_boton_cuenta.png') });
    await p.click('[data-push-ajustes]');
    await p.waitForSelector('#push-ajustes input[data-cat]', { timeout: 10000 });
    const estadoSw = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#push-ajustes input[data-cat]')].map((i) => [i.dataset.cat, i.checked])));
    check('6 interruptores; todos encendidos salvo ofertas', JSON.stringify(estadoSw) === JSON.stringify({ obra: true, copa: true, premio: true, buzon: true, duelo: true, ofertas: false }), estadoSw);
    check('Dice "Activas en este aparato"', await p.evaluate(() => document.querySelector('#push-estado').classList.contains('on')));
    check('Sin desborde horizontal en ajustes', (await desborde(p)) <= 0);
    await esperar(450); await p.screenshot({ path: path.join(CAPT, 'push_ajustes.png') });
    await p.click('#push-ajustes input[data-cat="ofertas"]', { force: true });
    await p.waitForFunction(() => /Guardado/.test(document.querySelector('#push-ajustes-msg').textContent), null, { timeout: 8000 }).catch(() => null);
    await p.click('#push-ajustes input[data-cat="copa"]', { force: true });
    await esperar(600);
    filas = JSON.parse(sql("SELECT s.categorias_json FROM push_suscripciones s JOIN jugadores j ON j.id = s.jugador_id WHERE j.email = 'nav1@prueba.example'"));
    const cats = filas[0] ? JSON.parse(filas[0].categorias_json) : {};
    check('Cambiar interruptores se guarda en el servidor (ofertas sí, copa no)', cats.ofertas === true && cats.copa === false, cats);
    await p.click('#push-ajustes [data-push="apagar"]');
    await p.waitForSelector('#push-ajustes [data-push="activar"]', { timeout: 8000 }).catch(() => null);
    check('"Desactivar en este aparato": baja en el servidor y en el navegador', JSON.parse(sql("SELECT COUNT(*) AS n FROM push_suscripciones s JOIN jugadores j ON j.id = s.jugador_id WHERE j.email = 'nav1@prueba.example'"))[0].n === 0 && (await p.evaluate(() => window.__push.sub === null)));
    await p.click('#push-ajustes [data-push="activar"]');
    await p.waitForSelector('#push-ajustes [data-push="apagar"]', { timeout: 8000 }).catch(() => null);
    check('"Activar notificaciones" desde ajustes vuelve a suscribir (sin volver a pedir el permiso)', await p.evaluate(() => !!window.__push.sub && window.__push.pedidos === 1));
    await p.click('#push-ajustes [data-push="cerrar"]');
    await p.evaluate(() => window.Api.salir());
    await esperar(400);
    check('Salir de la cuenta da de baja este aparato', JSON.parse(sql("SELECT COUNT(*) AS n FROM push_suscripciones s JOIN jugadores j ON j.id = s.jugador_id WHERE j.email = 'nav1@prueba.example'"))[0].n === 0);
    await ctx.close();

    console.log('\n== Primer evento de 5 estrellas');
    ({ ctx, p } = await nuevaPagina());
    await p.evaluate(async () => { await fetch('/api/registro', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: JSON.stringify({ email: 'nav2@prueba.example', nombre: 'Beto Estrellas', clave: 'ClaveSegura123', acepta_terminos: true, edad_16: true }) }); await window.Api.refrescar(); });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.Push && window.Api && window.Api.estado && window.Api.estado.logueado, null, { timeout: 15000 });
    await esperar(3000);
    check('Con cuenta, al volver a abrir: tampoco pregunta', !(await hay(p, '#push-previo')));
    check('Game.finishEvent quedó enganchado', await p.evaluate(() => window.Game.finishEvent.__push === true));
    // Un evento de verdad con la lógica del juego, pero forzando la calidad para que salgan 3 y luego 5 estrellas
    const evento = (calidad) => p.evaluate((q) => {
      const G = window.Game;
      const s = G.newGame();
      const c = s.contracts[0];
      const r = G.startEvent(s, c.id, s.staff.map((x) => x.id), s.equip.map((x) => x.id));
      if (!s.currentEvent) return 'no empezó: ' + JSON.stringify(r);
      for (let i = 0; i < 10 && G.currentIncident(s); i++) G.resolveIncident(s, 0);
      const ev = s.currentEvent;
      ev.step = ev.incidents.length; ev.deltas = []; ev.base = q;   // calidad final exacta
      const f = G.finishEvent(s) || {}; return (f.result || {}).stars;
    }, calidad);
    const r3 = await evento(56);
    await esperar(2500);
    check('Evento de 3 estrellas: no pregunta', !(await hay(p, '#push-previo')), r3);
    const r5 = await evento(100);
    await cerrarModales(p);
    await p.waitForSelector('#push-previo', { timeout: 15000 }).catch(() => null);
    check('La lógica del juego dio 3 y 5 estrellas', r3 === 3 && r5 === 5, [r3, r5]);
    check('Primer evento de 5 estrellas (Game.finishEvent real): aparece el aviso previo', await hay(p, '#push-previo'), r5);
    check('…con el título de 5 estrellas', await p.evaluate(() => /5 estrellas/.test((document.querySelector('#push-previo-t') || {}).textContent || '')));
    await esperar(450); await p.screenshot({ path: path.join(CAPT, 'push_previo_estrellas.png') });
    await p.click('#push-previo [data-push="no"]');
    check('"Ahora no": se cierra sin pedir el permiso', !(await hay(p, '#push-previo')) && (await p.evaluate(() => window.__push.pedidos)) === 0);
    await p.evaluate(() => window.Push.momentoExito('estrellas'));
    await esperar(2500);
    check('Otro momento de éxito enseguida: no vuelve a preguntar (7 días)', !(await hay(p, '#push-previo')));
    await p.evaluate(() => { const k = JSON.parse(localStorage.getItem('envivo_push_preguntado')); k.t -= 8 * 864e5; localStorage.setItem('envivo_push_preguntado', JSON.stringify(k)); });
    await p.evaluate(() => window.Push.momentoExito('estrellas'));
    await p.waitForSelector('#push-previo', { timeout: 10000 }).catch(() => null);
    check('8 días después: puede volver a preguntar', await hay(p, '#push-previo'));
    await p.click('#push-previo [data-push="no"]');
    await p.evaluate(() => { localStorage.setItem('envivo_push_preguntado', JSON.stringify({ n: 3, t: 0 })); window.Push.momentoExito('estrellas'); });
    await esperar(2500);
    check('Después de 3 "Ahora no": nunca más', !(await hay(p, '#push-previo')));
    await ctx.close();

    console.log('\n== Permiso bloqueado y otro idioma');
    ({ ctx, p } = await nuevaPagina({ permiso: 'denied' }, 'en-US'));
    await p.evaluate(async () => { await fetch('/api/registro', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: JSON.stringify({ email: 'nav3@prueba.example', nombre: 'Carl Blocked', clave: 'ClaveSegura123', acepta_terminos: true, edad_16: true }) }); await window.Api.refrescar(); });
    await p.evaluate(async () => { if (window.I18N && window.I18N.setIdioma) { window.I18N.setIdioma('en'); if (window.I18N.listo) await window.I18N.listo; } });
    await p.evaluate(() => window.Push.momentoExito('estrellas'));
    await esperar(2500);
    check('Con el permiso bloqueado no se muestra el aviso previo', !(await hay(p, '#push-previo')));
    await p.evaluate(() => window.Push.abrirAjustes());
    await p.waitForSelector('#push-ajustes', { timeout: 8000 });
    check('Ajustes en inglés explican cómo desbloquear y el botón de activar está desactivado', await p.evaluate(() => /Notifications are blocked/.test(document.querySelector('#push-ajustes').textContent) && document.querySelector('#push-ajustes [data-push="activar"]').disabled));
    await esperar(450); await p.screenshot({ path: path.join(CAPT, 'push_ajustes_bloqueado_en.png') });
    await ctx.close();

    check('Sin errores de JavaScript en la página', errores.length === 0, errores.slice(0, 5));
  } catch (e) {
    fallas++;
    console.log('  FALLA excepción: ' + (e && e.stack || e));
  } finally {
    await nav.close();
    php.kill();
    falso.kill();
    if (process.env.GUARDAR_TMP !== '1') fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\nResumen test_push.js: ${ok} correctas, ${fallas} fallas (capturas en tests/capturas/push_*.png)`);
  process.exit(fallas ? 1 : 0);
})();
