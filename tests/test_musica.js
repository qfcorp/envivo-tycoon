/* Prueba de js/musica.js.
   1) En Node (sin AudioContext): todo existe y nada lanza errores.
   2) En Chromium (Playwright): iniciar con un clic, recorrer todos los temas, stinger,
      victoria (vuelve al tema anterior), silenciar/activar, sin errores de página.
   3) Render de ~8 s de cada tema con OfflineAudioContext: pico <= 0.9 y RMS > 0.005.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_musica.js */
'use strict';
const path = require('path');
const assert = require('assert');

const MUSICA_PATH = path.resolve(__dirname, '..', 'js', 'musica.js');
const SOUND_PATH = path.resolve(__dirname, '..', 'js', 'sound.js');
const TEMAS = ['menu', 'preparacion', 'en_vivo', 'concierto', 'tension', 'victoria', 'funeral'];

let failures = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { failures++; console.log('  FALLA  ' + m); };

// ---------- 1) Node ----------
console.log('1) Node (sin AudioContext)');
try {
  const M = require(MUSICA_PATH);
  for (const fn of ['iniciar', 'tema', 'stinger', 'parar', 'setVolumen', 'getVolumen', 'setMuted', 'isMuted', 'temaActual', '_render']) {
    assert.strictEqual(typeof M[fn], 'function', fn + ' no es función');
  }
  ok('las funciones existen');
  for (const t of TEMAS) assert.ok(M.temas.indexOf(t) >= 0, 'falta el tema ' + t);
  ok('los ' + TEMAS.length + ' temas están en Musica.temas');
  assert.strictEqual(M.isMuted(), false, 'por defecto no debe estar silenciada');
  assert.strictEqual(M.getVolumen(), 0.18, 'volumen por defecto 0.18');
  M.iniciar(); M.iniciar();
  for (const t of TEMAS) M.tema(t);
  M.tema('no-existe'); M.tema(); M.tema(null); M.tema({});
  M.stinger(); M.parar(); M.parar();
  M.setVolumen(0.5); M.setVolumen(-3); M.setVolumen(9); M.setVolumen('x'); M.setVolumen();
  assert.strictEqual(M.getVolumen(), 1, 'setVolumen debe limitar a 0..1');
  M.setVolumen(0.18);
  M.setMuted(true); assert.strictEqual(M.isMuted(), true);
  M.setMuted(false); assert.strictEqual(M.isMuted(), false);
  assert.strictEqual(M._render(null, 'menu', 8), 0);
  assert.strictEqual(M._render({}, 'menu', 8), 0);
  ok('todas las llamadas son no-op sin lanzar errores');
} catch (e) {
  bad('Node: ' + e.message);
}

// ---------- 2) y 3) Navegador ----------
(async () => {
  console.log('2) Chromium (Playwright)');
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { bad('no se pudo cargar playwright: ' + e.message); return finish(); }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const bctx = await browser.newContext();
    await bctx.route('http://envivo.test/**', (r) => r.fulfill({ contentType: 'text/html',
      body: '<!doctype html><html><body><button id="b" style="width:200px;height:80px">Tocar</button></body></html>' }));
    const page = await bctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    // origen http (simulado con route) para que localStorage funcione
    await page.goto('http://envivo.test/');
    await page.addScriptTag({ path: SOUND_PATH });
    await page.addScriptTag({ path: MUSICA_PATH });
    await page.evaluate(() => { document.getElementById('b').addEventListener('click', () => { window.Sound.unlock(); window.Musica.iniciar(); }); });
    await page.click('#b');

    const st = await page.evaluate(async (temas) => {
      const M = window.Musica;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const log = { inicial: M.temaActual() };
      await wait(600);
      for (const t of temas) {
        if (t === 'victoria') continue;
        M.tema(t); M.iniciar();
        await wait(450);
      }
      M.tema('en_vivo');
      await wait(300);
      M.stinger(); M.stinger();
      await wait(400);
      M.tema('victoria');
      log.durante = M.temaActual();
      await wait(9000); // 4 compases a 120 bpm = 8 s
      log.despues = M.temaActual();
      M.setMuted(true);
      log.muted = M.isMuted();
      M.tema('funeral');
      await wait(200);
      M.setMuted(false);
      log.unmuted = M.isMuted();
      log.stored = (function () { try { return localStorage.getItem('envivo_musica_muted'); } catch (e) { return 'err'; } })();
      log.tras = M.temaActual();
      await wait(500);
      M.setVolumen(0.3); M.setVolumen(0.18);
      M.parar();
      await wait(1800);
      log.parado = M.temaActual();
      M.iniciar(); // tras parar() no arranca sola
      log.parado2 = M.temaActual();
      return log;
    }, TEMAS);
    if (st.inicial === 'menu') ok('iniciar() arranca el tema menu'); else bad('tema inicial ' + st.inicial);
    if (st.durante === 'victoria' && st.despues === 'en_vivo') ok('victoria vuelve al tema anterior (en_vivo)');
    else bad('victoria: durante=' + st.durante + ' después=' + st.despues);
    if (st.muted === true && st.unmuted === false && st.stored === '0') ok('setMuted ida y vuelta (localStorage=' + st.stored + ')');
    else bad('mute: ' + JSON.stringify(st));
    if (st.tras === 'funeral') ok('tema pedido en silencio se conserva al activar'); else bad('tras activar: ' + st.tras);
    if (st.parado === null && st.parado2 === null) ok('parar() detiene y iniciar() no la reanuda'); else bad('parar: ' + st.parado + '/' + st.parado2);

    // Música sigue a Sound silenciado si nunca se tocó su propio botón
    const page2 = await bctx.newPage();
    page2.on('pageerror', (e) => errors.push('pageerror2: ' + e.message));
    await page2.goto('http://envivo.test/');
    await page2.evaluate(() => { try { localStorage.removeItem('envivo_musica_muted'); localStorage.setItem('envivo_muted', '1'); } catch (e) {} });
    await page2.addScriptTag({ path: SOUND_PATH });
    await page2.addScriptTag({ path: MUSICA_PATH });
    const seg = await page2.evaluate(() => {
      const a = window.Musica.isMuted();
      window.Musica.setMuted(false);
      const b = window.Musica.isMuted();
      try { localStorage.removeItem('envivo_muted'); localStorage.removeItem('envivo_musica_muted'); } catch (e) {}
      return [a, b];
    });
    if (seg[0] === true && seg[1] === false) ok('sigue a Sound.isMuted() salvo que se active explícitamente');
    else bad('seguir a Sound: ' + seg);
    await page2.close();

    if (errors.length) bad('errores de página:\n    ' + errors.join('\n    ')); else ok('sin errores de página');

    // ---------- 3) Render offline ----------
    console.log('3) OfflineAudioContext (8 s por tema, volumen 0.18)');
    const stats = await page.evaluate(async (temas) => {
      const M = window.Musica;
      const out = [];
      for (const t of temas.concat(['stinger'])) {
        const sr = 22050, secs = 8;
        const c = new OfflineAudioContext(1, Math.ceil(sr * (secs + 3)), sr);
        const t0 = performance.now();
        const end = M._render(c, t, secs);
        const buf = await c.startRendering();
        const ms = performance.now() - t0;
        const d = buf.getChannelData(0);
        let pk = 0, sq = 0, nan = false;
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a !== a) nan = true; if (a > pk) pk = a; sq += d[i] * d[i]; }
        // RMS sobre la parte con sonido programado
        const n = Math.min(d.length, Math.ceil(sr * Math.max(0.5, Math.min(end, secs))));
        let sq2 = 0; for (let i = 0; i < n; i++) sq2 += d[i] * d[i];
        out.push({ tema: t, peak: pk, rms: Math.sqrt(sq2 / n), end, ms, nan });
      }
      return out;
    }, TEMAS);
    for (const s of stats) {
      console.log('       ' + s.tema.padEnd(12) + ' pico ' + s.peak.toFixed(3) + '  RMS ' + s.rms.toFixed(4) +
        '  fin ' + s.end.toFixed(2) + ' s  render ' + Math.round(s.ms) + ' ms');
    }
    const over = stats.filter((s) => s.nan || s.peak > 0.9);
    const quiet = stats.filter((s) => !(s.rms > 0.005));
    if (over.length) bad('pico > 0.9: ' + over.map((s) => s.tema).join(', ')); else ok('ningún tema supera 0.9 de pico');
    if (quiet.length) bad('RMS muy bajo: ' + quiet.map((s) => s.tema).join(', ')); else ok('todos los temas son audibles (RMS > 0.005)');
    const vic = stats.find((s) => s.tema === 'victoria');
    if (vic && vic.end > 7 && vic.end < 11) ok('victoria dura ' + vic.end.toFixed(2) + ' s (4 compases + cola)'); else bad('victoria duración ' + (vic && vic.end));
  } catch (e) {
    bad('navegador: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  finish();
})();

function finish() {
  if (failures) { console.log('\nRESULTADO: ' + failures + ' falla(s)'); process.exit(1); }
  console.log('\nRESULTADO: todo OK');
}
