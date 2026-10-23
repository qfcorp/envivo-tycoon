/* Prueba de js/sound.js.
   1) En Node (sin AudioContext): todo existe y nada lanza errores.
   2) En Chromium (Playwright): desbloqueo con un clic, todos los sonidos y el ambiente
      sin errores de página; además se renderizan los efectos con OfflineAudioContext
      para medir el pico (debe ser <= 1.0, sin saturación).
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_sound.js */
'use strict';
const path = require('path');
const assert = require('assert');

const SOUND_PATH = path.resolve(__dirname, '..', 'js', 'sound.js');
const EXPECTED = ['tap', 'buy', 'hire', 'error', 'live', 'incident', 'good', 'bad', 'stars', 'chapter', 'day',
  'cable', 'internet', 'luz', 'lluvia', 'tarde', 'acople', 'bateria', 'logo', 'falla', 'epico', 'vip'];

let failures = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { failures++; console.log('  FALLA  ' + m); };

// ---------- 1) Node ----------
console.log('1) Node (sin AudioContext)');
try {
  const Sound = require(SOUND_PATH);
  for (const fn of ['unlock', 'play', 'ambience', 'setMuted', 'isMuted']) {
    assert.strictEqual(typeof Sound[fn], 'function', fn + ' no es función');
  }
  ok('las 5 funciones existen');
  for (const n of EXPECTED) assert.ok(Sound.names.indexOf(n) >= 0, 'falta el sonido ' + n);
  ok('los ' + EXPECTED.length + ' nombres están en Sound.names');
  assert.strictEqual(Sound.isMuted(), false, 'por defecto no debe estar silenciado');
  Sound.unlock(); Sound.unlock();
  for (const n of EXPECTED) Sound.play(n);
  for (let s = 0; s <= 6; s++) Sound.play('stars', s);
  Sound.play('no-existe'); Sound.play(); Sound.play(null, {});
  Sound.ambience('crowd'); Sound.ambience('room'); Sound.ambience('raro'); Sound.ambience(null); Sound.ambience();
  Sound.setMuted(true); assert.strictEqual(Sound.isMuted(), true);
  Sound.setMuted(false); assert.strictEqual(Sound.isMuted(), false);
  ok('play/ambience/setMuted no lanzan errores');
} catch (e) {
  bad('Node: ' + e.message);
}

// ---------- 2) Navegador ----------
(async () => {
  console.log('2) Chromium (Playwright)');
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { bad('no se pudo cargar playwright: ' + e.message); return finish(); }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.setContent('<!doctype html><html><body><button id="b" style="width:200px;height:80px">Tocar</button></body></html>');
    await page.addScriptTag({ path: SOUND_PATH });
    await page.evaluate(() => { document.getElementById('b').addEventListener('click', () => window.Sound.unlock()); });
    await page.click('#b');

    const state = await page.evaluate(async (names) => {
      const S = window.Sound;
      for (const n of names) S.play(n);
      for (let s = 1; s <= 5; s++) S.play('stars', s);
      S.ambience('crowd');
      await new Promise((r) => setTimeout(r, 700));
      S.ambience('room');
      await new Promise((r) => setTimeout(r, 300));
      S.setMuted(true);
      S.play('tap');
      S.setMuted(false);
      S.ambience(null);
      await new Promise((r) => setTimeout(r, 800));
      return { muted: S.isMuted(), stored: (function () { try { return localStorage.getItem('envivo_muted'); } catch (e) { return 'err'; } })() };
    }, EXPECTED);
    if (state.muted === false) ok('setMuted ida y vuelta funciona (localStorage=' + state.stored + ')');
    else bad('isMuted debería ser false');

    // Medición de picos con OfflineAudioContext
    const peaks = await page.evaluate(async (names) => {
      const S = window.Sound;
      const jobs = names.map((n) => [n, undefined]).concat([1, 2, 3, 4, 5].map((k) => ['stars', k]));
      const out = [];
      for (const [n, arg] of jobs) {
        const sr = 22050;
        const c = new OfflineAudioContext(1, Math.ceil(sr * 4), sr);
        const end = S._render(c, n, arg);
        const buf = await c.startRendering();
        const d = buf.getChannelData(0);
        let pk = 0, sq = 0;
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; sq += d[i] * d[i]; }
        out.push({ name: arg ? n + '(' + arg + ')' : n, peak: +pk.toFixed(3), dur: +end.toFixed(2), nan: Number.isNaN(pk) });
      }
      return out;
    }, EXPECTED);
    console.log('     pico (0..1) y duración (s):');
    for (const p of peaks) console.log('       ' + p.name.padEnd(10) + ' pico ' + p.peak.toFixed(3) + '  dur ' + p.dur.toFixed(2));
    const over = peaks.filter((p) => p.nan || p.peak > 1.0);
    const silent = peaks.filter((p) => p.peak < 0.01);
    if (over.length) bad('saturan: ' + over.map((p) => p.name).join(', ')); else ok('ningún sonido supera 1.0');
    if (silent.length) bad('sin sonido: ' + silent.map((p) => p.name).join(', ')); else ok('todos producen sonido');
    const ac = peaks.find((p) => p.name === 'acople');
    if (ac && ac.dur <= 0.8) ok('acople es corto (' + ac.dur + ' s)'); else bad('acople demasiado largo');
    const ll = peaks.find((p) => p.name === 'lluvia');
    if (ll && ll.dur >= 2 && ll.dur <= 3.2) ok('lluvia dura ' + ll.dur + ' s'); else bad('lluvia fuera de 2-3 s');

    if (errors.length) bad('errores de página:\n    ' + errors.join('\n    ')); else ok('sin errores de página');
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
