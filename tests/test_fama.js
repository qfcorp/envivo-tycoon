/* Prueba de lo que reportó el dueño (celular, con cuenta y partida en la nube), en el juego real a 390x844:
     A. "Al terminar el evento indica 10, pero al cerrar la pantalla se reinicia a 3 o 0."
     B. "Tras reparar los equipos después de un evento, el porcentaje no se actualiza y se mantiene como dañado."
   Causa: la pestaña confundía SU PROPIO guardado en la nube con el de "otro dispositivo" cuando revisaba la nube mientras
   ese guardado subía (al volver a la app, cada minuto) o cuando la respuesta del guardado no llegaba (red lenta del celular).
   Dejaba de guardar ("Tu partida se abrió en otro dispositivo", tapado por el resultado) y "Usar la partida más nueva"
   abría una versión vieja: la fama y las reparaciones del último evento volvían atrás.
   Casos (servidor real: php -S + server/tests/router.php, base temporal):
     1. Sin cuenta: el resultado dice "Fama +N → ahora X"; arriba ya dice X; al cerrar, en Inicio y al recargar sigue X.
        Reparar desde el resultado, "Reparar todo", la Bodega y la flota: el % se actualiza al instante en el resultado,
        la Bodega, la preparación, la franja de Inicio, el número de Bodega y el dinero de arriba.
     2. Con cuenta, guardado lento + volver a la app mientras sube (con el resultado abierto): sin aviso de otro
        dispositivo; reparar en el resultado; la fama y el 100% quedan aquí, en la nube y al recargar.
     3. Con cuenta, la respuesta de un guardado se pierde (el servidor sí lo guardó): el siguiente guardado y la
        revisión siguen sobre esa versión, sin aviso; la nube queda igual que el celular.
     4. Otro dispositivo de verdad toma la partida: sigue el aviso; si aquí hubo avance después, "Usar la partida más
        nueva" pregunta cuál usar (no la pisa sin preguntar) y quedarse con la de aquí conserva la fama.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_fama.js */
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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Servidor real (temporal) ---------- */
const puertoLibre = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function arrancarServidor() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo-fama-'));
  fs.mkdirSync(path.join(tmp, 'datos'));
  const p = await puertoLibre();
  fs.writeFileSync(path.join(tmp, 'config.env'), `; SOLO PRUEBAS (tests/test_fama.js)\nENVIVO_DB=${tmp}/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:${p}\nENVIVO_ZONA=America/Guayaquil\nPLUX_AMBIENTE=sandbox\n`);
  const log = fs.openSync(path.join(tmp, 'php.log'), 'a');
  const php = spawn('php', ['-d', 'log_errors=1', '-d', 'error_log=' + path.join(tmp, 'php_errores.log'), '-S', '127.0.0.1:' + p, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')],
    { env: Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(tmp, 'config.env'), PHP_CLI_SERVER_WORKERS: '4', TZ: 'America/Guayaquil', no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost' }), stdio: ['ignore', log, log] });
  const base = 'http://127.0.0.1:' + p;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/api/estado'); if (r.status) break; } catch (e) { /* aún no */ }
    await dormir(100);
  }
  const errPhp = () => { try { return [path.join(tmp, 'php.log'), path.join(tmp, 'php_errores.log')].filter(fs.existsSync).map((f) => fs.readFileSync(f, 'utf8')).join('\n').split('\n').filter((l) => /PHP (Warning|Fatal|Notice|Deprecated)|EN VIVO api/.test(l)); } catch (e) { return []; } };
  return { base, cerrar: () => { try { php.kill(); } catch (e) { /* nada */ } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* nada */ } }, errPhp };
}

/* ---------- Partida armada con la lógica real (Node) ---------- */
function armarPartida(o) {
  globalThis.window = globalThis;
  require(path.join(RAIZ, 'js/datos.js'));
  const G = require(path.join(RAIZ, 'js/logic.js')) || globalThis.Game;
  const s = G.newGame(o.seed || 11);
  s.stats.events = 6; s.chapter = 1; s.chapterSeen = 1; s.day = 8; s.lastWorkDay = 8;
  s.money = 50000;
  G.buy(s, 'cam_basic');
  G.buy(s, 'veh_sedan_usado');
  s.equip[0].condition = 30;                       // cámara "de Don Ramiro" gastada
  s.equip[1].condition = 35;                       // segunda cámara gastada (así hay "Reparar todo")
  const veh = s.equip.find((e) => e.type === 'veh_sedan_usado');
  if (veh) veh.condition = 30;
  s.money = o.money || 3000;
  s.rep = o.rep;
  const c = s.contracts[0];
  Object.assign(c, { outdoor: false, cams: 2, audio: false, stream: false, rival: false, diff: 1, daysLeft: 5 });
  s.contracts = [c];
  s.avisos = []; s.capCompletados = [];
  return { G, s, cid: c.id, cams: [s.equip[0].id, s.equip[1].id], vehId: veh ? veh.id : null };
}

/* ---------- Navegador ---------- */
async function abrir(browser, base, caso) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-EC' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|Failed to fetch|ERR_/.test(m.text())) errores.push(m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Control de los guardados en la nube: normal, lento (el servidor guarda y la respuesta tarda) o perdido (no llega)
  const red = { modo: 'normal', ms: 2500, subidas: 0 };
  await page.route('**/api/partida', async (route) => {
    if (route.request().method() !== 'POST' || red.modo === 'normal') return route.continue();
    const modo = red.modo;
    const resp = await route.fetch();
    red.subidas++;
    if (modo === 'perder') { red.modo = 'normal'; return route.abort('connectionreset'); }
    await dormir(red.ms);
    return route.fulfill({ response: resp });
  });
  await page.addInitScript((c) => {
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', 'es');
      if (c.partida) localStorage.setItem('envivo_tycoon_save_v1', c.partida);
    } catch (e) { /* nada */ }
  }, { partida: caso.partida || null });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  if (caso.cuenta) {
    await page.evaluate(async (c) => {
      if (c.nueva) await window.Api.registro(c.email, 'Productora Fama', c.clave, { acepta_terminos: true, edad_16: true });
      else await window.Api.entrar(c.email, c.clave);
    }, caso.cuenta);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await nubeLista(page);
  }
  await page.waitForTimeout(400);
  return { ctx, page, errores, red };
}
const nubeLista = (page) => page.waitForFunction(() => window.__nube && window.Api && window.Api.logueado() && window.__nube.lista != null, null, { timeout: 20000 });
const overlayOn = (page) => page.evaluate(() => document.getElementById('overlay').classList.contains('on'));
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const avisoOtro = (page) => page.$('#overlay.on #modal [data-nube-otro]');
const elegirNube = (page) => page.$('#overlay.on #modal [data-act="partida"][data-k="local"]');
async function cerrarVentanas(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await overlayOn(page))) return;
    if ((await avisoOtro(page)) || (await elegirNube(page))) return;   // los avisos de la nube no se cierran solos
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="after-result"], #overlay.on [data-act="close"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
const estado = (page) => page.evaluate(() => { const s = window.__game.state; return { rep: s.rep, dinero: s.money, dia: s.day, eventos: s.stats.events, hdr: document.getElementById('hRep').textContent.trim(), hDinero: document.getElementById('hMoney').textContent.trim() }; });
const condDe = (page, id) => page.evaluate((x) => window.__game.state.equip.find((e) => e.id === x).condition, id);
const enNube = (page) => page.evaluate(async () => { const r = await window.Api.partida(); const d = r.datos ? JSON.parse(r.datos) : null; return { rev: r.rev, guardo: r.guardo, activo: r.activo && r.activo.dispositivo, rep: d && d.rep, dia: d && d.day, dinero: d && d.money, equip: d ? d.equip.map((e) => ({ id: e.id, c: e.condition })) : [] }; });
const nubeInfo = (page) => page.evaluate(() => ({ info: window.__nube.info, bloqueo: window.__nube.bloqueo, disp: window.__nube.dispositivo }));

// Juega el contrato por la pantalla (preparación → al aire → imprevistos → terminar) y deja el resultado abierto
async function jugarEvento(page, cid, equipIds) {
  await cerrarVentanas(page);
  await page.click('nav button[data-tab="clientes"]');
  await page.click(`[data-act="prep"][data-id="${cid}"]`);
  await page.waitForSelector('#modal #prepPie');
  for (const id of equipIds) {
    if (!(await page.isChecked(`#eq-${id}`))) { await page.click(`label:has(#eq-${id}) .grow b`); await page.waitForTimeout(120); }
  }
  await page.click('#modal [data-act="go-live"]');
  for (let i = 0; i < 25; i++) {
    await page.waitForSelector('#modal [data-act="choose"]:not([disabled]), #modal [data-act="finish"], #modal [data-act="next-inc"]', { timeout: 15000 });
    if (await page.$('#modal [data-act="finish"]')) break;
    const nx = await page.$('#modal [data-act="next-inc"]');
    if (nx) { await nx.click(); continue; }
    await page.click('#modal [data-act="choose"]:not([disabled])');   // la primera opción disponible
    await page.waitForTimeout(120);
  }
  await page.click('#modal [data-act="finish"]');
  await page.waitForSelector('#modal [data-act="after-result"]', { timeout: 8000 });
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const fila = document.querySelector('#resFama td:last-child');
    const txt = fila ? fila.innerText.replace(/\s+/g, ' ').trim() : '';
    const m = /^([+-]\d+) → ahora (\d+)$/.exec(txt);
    const r = window.__game.state.lastResult || {};
    return { txt, delta: m ? Number(m[1]) : null, ahora: m ? Number(m[2]) : null, repDelta: r.repDelta, famaAntes: r.famaAntes, fama: r.fama, hdr: document.getElementById('hRep').textContent.trim() };
  });
}
async function bodega(page, id) {
  await page.click('nav button[data-tab="bodega"]'); await page.waitForTimeout(200);
  return page.evaluate((x) => {
    const b = document.querySelector(`#tab-bodega [data-act="repair"][data-id="${x}"]`);
    const card = b && b.closest('.gear');
    if (!card) return null;
    const i = card.querySelector('.bar i');
    return { pct: card.querySelector('.cond b').textContent.trim(), w: i ? i.style.width : '', worn: card.classList.contains('worn'), btn: b.textContent.trim(), dis: b.disabled };
  }, id);
}
async function preparacion(page, cid, id) {
  await page.click('nav button[data-tab="clientes"]'); await page.waitForTimeout(150);
  const b = await page.$(`[data-act="prep"][data-id="${cid}"]`);
  if (!b) return null;
  await b.click();
  await page.waitForSelector('#modal #prepPie');
  const r = await page.evaluate((x) => {
    const l = document.querySelector(`#modal label:has(#eq-${x})`);
    if (!l) return null;
    const i = l.querySelector('.bar i');
    return { pct: l.querySelector('.num.small').textContent.trim(), w: i ? i.style.width : '', aviso: !!l.querySelector('.dn-prep') };
  }, id);
  await page.click('#modal [data-act="close"]'); await page.waitForTimeout(150);
  return r;
}
async function inicio(page) {
  await page.click('nav button[data-tab="inicio"]'); await page.waitForTimeout(200);
  return page.evaluate(() => ({ strip: document.querySelector('.dnstrip') ? document.querySelector('.dnstrip').innerText.replace(/\s+/g, ' ') : '', badge: document.getElementById('badgeB').textContent }));
}
const soloDig = (t) => String(t).replace(/\D/g, '');
// La franja de Inicio y el número de Bodega cuentan n equipos (0: no hay franja)
const franjaDice = (ini, n) => (n ? new RegExp('^' + n + ' equipos? necesita').test(ini.strip) && ini.badge === String(n) : !ini.strip && ini.badge === '');

(async () => {
  const srv = await arrancarServidor();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    /* ---------- 1. Sin cuenta: fama del resultado y % de los equipos en todas las pantallas ---------- */
    {
      const P = armarPartida({ rep: 13, money: 3000 });
      const { ctx, page, errores } = await abrir(browser, srv.base, { partida: P.G.serialize(P.s) });
      const r = await jugarEvento(page, P.cid, P.cams);
      bien(r.delta !== null && r.ahora !== null, `1: el resultado dice "Fama ${r.txt}" (cambio → ahora)`);
      bien(r.delta === r.repDelta && r.ahora === Math.floor(r.fama), `1: "${r.txt}" es lo que calculó la lógica (cambio ${r.repDelta}, queda ${r.fama})`);
      bien(r.famaAntes === 13, '1: la lógica anota la fama de antes (13)');
      bien(r.hdr === String(r.ahora), `1: arriba ya dice la fama del resultado (${r.hdr})`);
      await page.locator('#resFama').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, 'fama_resultado.png') });
      // Reparar una desde el resultado
      const [c1, c2] = P.cams;
      const d0 = await estado(page);
      const rc1 = await page.evaluate((x) => window.Game.repairCost(window.__game.state.equip.find((e) => e.id === x)), c1);
      await page.click(`#resDanos [data-act="repair-res"][data-id="${c1}"]`); await page.waitForTimeout(250);
      const d1 = await estado(page);
      bien((await condDe(page, c1)) === 100 && d1.dinero === d0.dinero - rc1, `1: "Reparar" en el resultado deja la cámara al 100% y cobra ${rc1}`);
      const filaRes = await page.evaluate((x) => { const f = [...document.querySelectorAll('#resDanos .dn-it.ok')].find((n) => n.querySelector('.dn-nm')); return f ? { t: f.querySelector('.dn-cond').innerText, w: f.querySelector('.dn-bar i').style.width } : null; }, c1);
      bien(filaRes && /→ 100%/.test(filaRes.t) && filaRes.w === '100%', `1: el resultado muestra "→ 100%" y la barra llena (${JSON.stringify(filaRes)})`);
      bien(soloDig(d1.hDinero) === soloDig(d1.dinero), '1: el dinero de arriba se actualiza al reparar');
      bien(d1.hdr === String(r.ahora), '1: la fama de arriba sigue igual al reparar');
      await page.click('#modal [data-act="after-result"]'); await page.waitForTimeout(300);
      await cerrarVentanas(page);
      const d2 = await estado(page);
      bien(d2.hdr === String(r.ahora) && Math.floor(d2.rep) === r.ahora, `1: al cerrar el resultado la fama sigue en ${r.ahora} (arriba ${d2.hdr}, partida ${d2.rep})`);
      // Bodega, preparación e Inicio con la cámara reparada y la otra gastada
      let bg = await bodega(page, c1);
      bien(bg && bg.pct === '100%' && bg.w === '100%' && !bg.worn && bg.dis, `1: Bodega: la cámara reparada dice 100% con la barra llena (${JSON.stringify(bg)})`);
      const contrato2 = await page.evaluate(() => (window.__game.state.contracts[0] || {}).id);
      if (contrato2) {
        const pr = await preparacion(page, contrato2, c1);
        bien(pr && pr.pct === '100%' && pr.w === '100%' && !pr.aviso, `1: Preparación: la cámara reparada dice 100% sin aviso (${JSON.stringify(pr)})`);
      } else bien(true, '1: (sin contrato nuevo para ver la preparación)');
      // "Reparar todo" desde la Bodega no existe: se repara la otra en la Bodega
      const ini0 = await inicio(page);
      const c2cond = await condDe(page, c2);
      const n0 = (c2cond < 40 ? 1 : 0) + (P.vehId && (await condDe(page, P.vehId)) < 40 ? 1 : 0);   // la otra cámara y el vehículo
      bien(franjaDice(ini0, n0), `1: Inicio: la franja ya no cuenta la cámara reparada (${ini0.strip || 'sin franja'}, Bodega ${ini0.badge || '0'})`);
      bg = await bodega(page, c2);
      await page.click(`#tab-bodega [data-act="repair"][data-id="${c2}"]`); await page.waitForTimeout(250);
      bg = await page.evaluate((x) => { const b = document.querySelector(`#tab-bodega [data-act="repair"][data-id="${x}"]`); const c = b.closest('.gear'); return { pct: c.querySelector('.cond b').textContent.trim(), w: c.querySelector('.bar i').style.width, worn: c.classList.contains('worn') }; }, c2);
      bien(bg.pct === '100%' && bg.w === '100%' && !bg.worn, `1: Bodega: reparar ahí actualiza la tarjeta al instante (${JSON.stringify(bg)})`);
      const ini1 = await inicio(page);
      bien(franjaDice(ini1, n0 - (c2cond < 40 ? 1 : 0)), `1: Inicio: la franja se actualiza al reparar en la Bodega (${ini1.strip || 'sin franja'})`);
      if (contrato2) {
        const pr = await preparacion(page, contrato2, c2);
        bien(pr && pr.pct === '100%' && pr.w === '100%' && !pr.aviso, `1: Preparación: la cámara reparada en la Bodega dice 100% (${JSON.stringify(pr)})`);
      }
      // Flota (vehículo) desde Inicio
      if (P.vehId) {
        await page.click('nav button[data-tab="inicio"]'); await page.waitForTimeout(200);
        const bv = await page.$(`[data-ext="flota"][data-acc="reparar"][data-id="${P.vehId}"]`);
        if (bv) {
          await bv.click(); await page.waitForTimeout(250);
          const fv = await page.evaluate(() => { const c = document.querySelector('.mov-flota'); return c ? { t: c.innerText.replace(/\s+/g, ' '), w: (c.querySelector('.bar i') || {}).style.width } : null; });
          bien((await condDe(page, P.vehId)) === 100 && fv && /100\s?%/.test(fv.t) && fv.w === '100%', `1: Flota: reparar el vehículo actualiza la tarjeta al 100% (${fv && fv.w})`);
          const ini2 = await inicio(page);
          bien(!ini2.strip && ini2.badge === '', '1: Inicio: con todo reparado, sin franja ni número en Bodega');
          const bgv = await bodega(page, P.vehId);
          bien(bgv && bgv.pct === '100%', '1: Bodega: el vehículo también dice 100%');
        } else bien((await condDe(page, P.vehId)) >= 50, '1: (el vehículo no necesitaba reparación)');
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.__game.state);
      await page.waitForTimeout(400);
      const d3 = await estado(page);
      bien(d3.hdr === String(r.ahora) && (await condDe(page, c1)) === 100 && (await condDe(page, c2)) === 100, `1: al recargar: fama ${d3.hdr} y las cámaras al 100%`);
      bien(!(await desborde(page)), '1: sin desborde horizontal');
      bien(errores.length === 0, '1: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
    /* ---------- 1b. "Reparar todo" en el resultado ---------- */
    {
      const P = armarPartida({ rep: 0, money: 3000, seed: 12 });
      const { ctx, page, errores } = await abrir(browser, srv.base, { partida: P.G.serialize(P.s) });
      const r = await jugarEvento(page, P.cid, P.cams);
      bien(r.ahora !== null && r.hdr === String(r.ahora), `1b: con fama 0: "Fama ${r.txt}" y arriba ${r.hdr}`);
      const todo = await page.$('#resDanos [data-act="repair-all-res"]:not([disabled])');
      bien(!!todo, '1b: el resultado tiene "Reparar todo"');
      if (todo) { await todo.click(); await page.waitForTimeout(250); }
      const filas = await page.$$eval('#resDanos .dn-it', (xs) => xs.map((x) => ({ ok: x.classList.contains('ok'), t: x.querySelector('.dn-cond').innerText, w: x.querySelector('.dn-bar i').style.width })));
      bien(filas.length >= 2 && filas.every((f) => f.ok && /→ 100%/.test(f.t) && f.w === '100%'), `1b: "Reparar todo": todas las filas dicen → 100% (${JSON.stringify(filas)})`);
      await page.click('#modal [data-act="after-result"]'); await page.waitForTimeout(300);
      await cerrarVentanas(page);
      const d = await estado(page);
      bien(d.hdr === String(r.ahora), `1b: al cerrar sigue la fama del resultado (${d.hdr})`);
      for (const id of P.cams) { const bg = await bodega(page, id); bien(bg && bg.pct === '100%' && bg.w === '100%', `1b: Bodega: equipo ${id} al 100%`); }
      const ini = await inicio(page);
      bien(franjaDice(ini, P.vehId && (await condDe(page, P.vehId)) < 40 ? 1 : 0), `1b: Inicio: la franja ya no cuenta las cámaras (${ini.strip || 'sin franja'})`);
      bien(errores.length === 0, '1b: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 2. Con cuenta: guardado lento y volver a la app mientras sube ---------- */
    const cuenta = { email: `fama${Date.now()}@prueba.ec`, clave: 'clave-segura-123' };
    {
      const P = armarPartida({ rep: 13, money: 3000 });
      const { ctx, page, errores, red } = await abrir(browser, srv.base, { partida: P.G.serialize(P.s), cuenta: Object.assign({ nueva: true }, cuenta) });
      await cerrarVentanas(page);
      await page.evaluate(() => window.__nube.subir());
      const n0 = await enNube(page);
      bien(n0.dia === 8 && n0.rep === 13, `2: la partida del celular está en la nube (día ${n0.dia}, fama ${n0.rep}, rev ${n0.rev})`);
      const r = await jugarEvento(page, P.cid, P.cams);
      bien(r.ahora !== null, `2: el resultado dice "Fama ${r.txt}"`);
      // Se guarda (lento, como con datos móviles) y el jugador sale y vuelve a la app mientras sube
      red.modo = 'lento'; red.ms = 2500;
      const subida = page.evaluate(() => window.__nube.subir());
      await page.waitForTimeout(600);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(200);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
      await subida;
      await page.waitForTimeout(3500);
      red.modo = 'normal';
      let ni = await nubeInfo(page);
      bien(!ni.bloqueo && !(await avisoOtro(page)), '2: volver a la app mientras sube NO dice "Tu partida se abrió en otro dispositivo"');
      bien(!!(await page.$('#modal [data-act="after-result"]')), '2: el resultado sigue abierto');
      // Reparar en el resultado y cerrar
      const todo = await page.$('#resDanos [data-act="repair-all-res"]:not([disabled])');
      if (todo) await todo.click(); else for (const id of P.cams) { const b = await page.$(`#resDanos [data-act="repair-res"][data-id="${id}"]:not([disabled])`); if (b) await b.click(); }
      await page.waitForTimeout(250);
      bien((await condDe(page, P.cams[0])) === 100 && (await condDe(page, P.cams[1])) === 100, '2: reparadas desde el resultado (100%)');
      // Otra revisión de la nube (cada minuto) justo mientras sube el guardado de la reparación
      red.modo = 'lento'; red.ms = 2000;
      const subida2 = page.evaluate(() => window.__nube.subir());
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__nube.revisar('reloj'));
      await subida2;
      red.modo = 'normal';
      await page.click('#modal [data-act="after-result"]'); await page.waitForTimeout(300);
      await cerrarVentanas(page);
      const d = await estado(page);
      ni = await nubeInfo(page);
      bien(!ni.bloqueo && !(await avisoOtro(page)), '2: tampoco con la revisión de cada minuto');
      bien(d.hdr === String(r.ahora) && Math.floor(d.rep) === r.ahora, `2: al cerrar el resultado la fama sigue en ${r.ahora} (arriba ${d.hdr})`);
      const bg = await bodega(page, P.cams[0]);
      bien(bg && bg.pct === '100%', '2: Bodega: 100% después de reparar');
      await page.evaluate(() => window.__nube.subir());
      const n1 = await enNube(page);
      bien(n1.rep === d.rep && n1.dia === d.dia && n1.dinero === d.dinero, `2: la nube tiene la fama del resultado (${n1.rep}) y el mismo día y dinero`);
      bien(P.cams.every((id) => (n1.equip.find((e) => e.id === id) || {}).c === 100), '2: la nube tiene las cámaras reparadas (100%)');
      bien(n1.guardo === ni.disp && n1.activo === ni.disp, '2: el celular sigue siendo el dispositivo activo');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await nubeLista(page); await page.waitForTimeout(600);
      const d2 = await estado(page);
      bien(d2.hdr === String(r.ahora) && (await condDe(page, P.cams[0])) === 100 && !(await avisoOtro(page)), `2: al abrir otra vez: fama ${d2.hdr}, cámaras al 100% y sin avisos`);
      await page.screenshot({ path: path.join(OUT, 'fama_nube_inicio.png') });
      bien(!(await desborde(page)), '2: sin desborde horizontal');
      bien(errores.length === 0, '2: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 3. Con cuenta: la respuesta de un guardado se pierde ---------- */
    {
      const { ctx, page, errores, red } = await abrir(browser, srv.base, { cuenta });
      await cerrarVentanas(page);
      const n0 = await enNube(page);
      const ni0 = await nubeInfo(page);
      bien(ni0.info && ni0.info.rev === n0.rev && n0.activo === ni0.disp, `3: otra vez en el celular: toma la partida (rev ${n0.rev})`);
      // Pasa un día; el guardado llega al servidor pero la respuesta no (se corta la red)
      await page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'next-day'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
      await cerrarVentanas(page);
      red.modo = 'perder';
      await page.evaluate(() => window.__nube.subir());
      await page.waitForTimeout(300);
      const n1 = await enNube(page);
      const ni1 = await nubeInfo(page);
      bien(red.subidas >= 1 && n1.rev === n0.rev + 1 && ni1.info.rev === n0.rev, `3: el servidor guardó (rev ${n1.rev}) pero el celular no se enteró (sigue en rev ${ni1.info.rev})`);
      // Revisión de la nube (al volver a la app): es su propio guardado
      await page.evaluate(() => window.__nube.revisar('foco'));
      await page.waitForTimeout(500);
      let ni = await nubeInfo(page);
      bien(!ni.bloqueo && !(await avisoOtro(page)), '3: al revisar, reconoce su propio guardado (sin aviso de otro dispositivo)');
      // Otra vez: se pierde la respuesta y el siguiente guardado manda la versión vieja
      await page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'next-day'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
      await cerrarVentanas(page);
      red.modo = 'perder';
      await page.evaluate(() => window.__nube.subir());
      await page.waitForTimeout(200);
      await page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'next-day'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
      await cerrarVentanas(page);
      await page.evaluate(() => window.__nube.subir());
      await page.waitForTimeout(400);
      ni = await nubeInfo(page);
      const d = await estado(page);
      const n2 = await enNube(page);
      bien(!ni.bloqueo && !(await avisoOtro(page)), '3: el guardado siguiente (con la versión vieja) tampoco da aviso');
      bien(n2.dia === d.dia && n2.dinero === d.dinero && n2.rep === d.rep && ni.info.rev === n2.rev, `3: la nube quedó igual que el celular (día ${n2.dia}, rev ${n2.rev})`);
      bien(errores.length === 0, '3: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 4. Otro dispositivo de verdad ---------- */
    {
      const { ctx: cA, page: A, errores: eA } = await abrir(browser, srv.base, { cuenta });
      await cerrarVentanas(A);
      const { ctx: cB, page: B, errores: eB } = await abrir(browser, srv.base, { cuenta });   // la computadora toma la partida
      await cerrarVentanas(B);
      const nb = await nubeInfo(B);
      bien((await enNube(B)).activo === nb.disp, '4: la computadora tomó la partida');
      await A.evaluate(() => window.dispatchEvent(new Event('focus')));
      await A.waitForSelector('#overlay.on #modal [data-nube-otro]', { timeout: 8000 }).catch(() => {});
      bien(!!(await avisoOtro(A)), '4: el celular ve "Tu partida se abrió en otro dispositivo"');
      // Algo tapa el aviso y en el celular se avanza (no se guarda: la otra la tiene)
      const d0 = await estado(A);
      await A.evaluate(() => { document.getElementById('overlay').classList.remove('on'); document.getElementById('modal').innerHTML = ''; const b = document.createElement('button'); b.dataset.act = 'next-day'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
      await A.waitForTimeout(300);
      const d1 = await estado(A);
      bien(d1.dia === d0.dia + 1 && !!(await avisoOtro(A)), '4: avanzó un día en el celular y el aviso vuelve');
      await A.click('#overlay.on #modal [data-nube-otro] [data-act="partida"]');
      await A.waitForSelector('#overlay.on #modal [data-act="partida"][data-k="local"]', { timeout: 8000 }).catch(() => {});
      const txt = await A.locator('#modal').innerText().catch(() => '');
      bien(!!(await elegirNube(A)) && /¿Qué partida quieres usar\?/.test(txt), '4: "Usar la partida más nueva" con avance aquí: pregunta cuál usar (no la pisa)');
      bien(txt.includes('Día ' + d1.dia), `4: …con el día de la de aquí (${d1.dia})`);
      await A.screenshot({ path: path.join(OUT, 'fama_elegir.png') });
      await A.click('#overlay.on #modal [data-act="partida"][data-k="local"]');
      await A.waitForTimeout(900);
      const n = await enNube(A);
      const na = await nubeInfo(A);
      bien(n.dia === d1.dia && n.rep === d1.rep && n.activo === na.disp && !na.bloqueo, `4: eligió la de aquí: la nube tiene su día ${n.dia} y su fama ${n.rep}`);
      await B.evaluate(() => window.dispatchEvent(new Event('focus')));
      await B.waitForSelector('#overlay.on #modal [data-nube-otro]', { timeout: 8000 }).catch(() => {});
      bien(!!(await avisoOtro(B)), '4: ahora la computadora ve el aviso (no pisa lo elegido)');
      bien(!(await desborde(A)), '4: sin desborde horizontal');
      bien(eA.length === 0 && eB.length === 0, '4: sin errores de JS' + (eA.length || eB.length ? ': ' + eA.concat(eB).join(' | ') : ''));
      await cA.close(); await cB.close();
    }
    const php = srv.errPhp();
    bien(php.length === 0, 'Sin errores de PHP' + (php.length ? ': ' + php.slice(0, 3).join(' | ') : ''));
  } catch (e) {
    fallas++; console.error('❌ excepción:', e);
  } finally {
    await browser.close();
    srv.cerrar();
  }
  console.log(`\nFama y reparaciones: ${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
