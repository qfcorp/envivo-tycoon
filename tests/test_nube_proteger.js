/* Lo que le pasó al dueño (28-oct): la computadora iba en el día 72 (fama ~100) y siempre guardaba en la nube. El
   celular tenía el juego viejo v45 en la caché con su partida del día 28; esa partida terminó encima de la nube y, al abrir
   la computadora, el juego bajó solo la del día 28 (aquí no había nada sin subir). Decisión del dueño: nunca se puede
   quedar una partida con menos avance y el jugador no elige (como Kingshot): pantalla "Sincronizando tu partida…" y se
   queda siempre la de más avance (eventos, día, capítulo; empate → la de la nube).
   Casos (servidor real php -S + server/tests/router.php, base temporal; cada contexto = un aparato):
     1. Celular viejo (día 28) con sesión y la nube en el día 72: pantalla de carga, carga el día 72 sin preguntar, avisa,
        y la del día 28 queda como copia (envivo_tycoon_save_respaldo); nunca sube la del día 28.
     2. Un juego viejo pisa la nube con la del día 28 y la computadora (día 72 aquí) abre el juego: sube la del día 72
        sola (sin ventana), avisa, y la del día 28 queda como copia.
     3. La computadora tiene el juego abierto y el celular lo abre: el celular se queda con la partida; la computadora ve
        "Tu partida se abrió en otro aparato" → "Recargar" carga la de la nube (aquí no sube nada).
     4. El servidor rechaza un guardado con menos avance (409 partida_retroceso): se carga la de la nube.
     5. La partida de aquí baja de avance (otra partida): no se sube; se carga la de la nube.
     6. Sin servidor al abrir: "Reintentar" / "Jugar sin conexión"; se juega con "Sin conexión · se sincronizará" y al
        volver la red se sube lo jugado sin internet (tenía más avance). Si tarda más de 8 s salen los mismos botones.
     7. 426 cliente_viejo: no guarda nada, pantalla "Actualizando el juego…" y abre otra vez; la segunda vez seguida no
        recarga en bucle. La versión de js/api.js es la de sw.js y va en cada llamada.
     8. Partida nueva con cuenta: no se puede (se explica). Después de quebrar, la partida nueva se sube con `nueva`.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_nube_proteger.js */
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo-prot-'));
  fs.mkdirSync(path.join(tmp, 'datos'));
  const p = await puertoLibre();
  fs.writeFileSync(path.join(tmp, 'config.env'), `; SOLO PRUEBAS (tests/test_nube_proteger.js)\nENVIVO_DB=${tmp}/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:${p}\nENVIVO_ZONA=America/Guayaquil\nPLUX_AMBIENTE=sandbox\n`);
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

/* ---------- Partidas armadas con la lógica real (Node) ---------- */
globalThis.window = globalThis;
require(path.join(RAIZ, 'js/datos.js'));
const G = require(path.join(RAIZ, 'js/logic.js')) || globalThis.Game;
function partida(o) {
  const s = G.newGame(o.seed || 7);
  s.storyDone = true; s.chapter = o.chapter; s.chapterSeen = o.chapter;
  s.day = o.day; s.lastWorkDay = o.day; s.rep = o.rep; s.money = o.money; s.stats.events = o.events;
  s.avisos = []; s.capCompletados = [];
  return G.serialize(s);
}
// Lo del dueño: en la computadora día 72, fama 100 y unos $100.000; la del celular: día 28, fama 9, $416.987
const PC = { day: 72, rep: 100, money: 100000, events: 60, chapter: 3 };
const OTRA = { day: 28, rep: 9, money: 416987, events: 20, chapter: 1, seed: 3 };

/* ---------- Navegador ---------- */
const CEL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-EC' };
const COMPU = { viewport: { width: 1280, height: 860 }, locale: 'es-EC' };
async function contexto(browser, tipo, o) {
  const ctx = await browser.newContext(tipo === 'cel' ? CEL : COMPU);
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
      if (c.nube) localStorage.setItem('envivo_nube', JSON.stringify(c.nube));
      if (c.cuando) localStorage.setItem('envivo_guardado_en', JSON.stringify(c.cuando));
    } catch (e) { /* nada */ }
  }, { partida: (o && o.partida) || null, nube: (o && o.nube) || null, cuando: (o && o.cuando) || null });
  return ctx;
}
async function abrirPagina(ctx, base, o) {
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|Failed to fetch|ERR_|\[nube\]/.test(m.text())) errores.push(m.text()); });
  const subidas = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/partida$/.test(r.url())) { try { subidas.push(JSON.parse(r.postData() || '{}')); } catch (e) { subidas.push({}); } } });
  if (o && o.estadoFalla) {   // las primeras N llamadas a /api/estado no llegan (red lenta del celular al abrir)
    let n = o.estadoFalla;
    await page.route('**/api/estado', (route) => { if (n > 0) { n--; return route.abort('timedout'); } return route.continue(); });
  }
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  return { page, errores, subidas };
}
const nubeLista = (page) => page.waitForFunction(() => window.__nube && window.Api && window.Api.logueado() && window.__nube.lista != null, null, { timeout: 20000 });
const estado = (page) => page.evaluate(() => { const s = window.__game.state; return { rep: Math.floor(s.rep), dinero: s.money, dia: s.day, eventos: s.stats.events, hdr: document.getElementById('hRep').textContent.trim() }; });
const enNube = (page) => page.evaluate(async () => { const r = await window.Api.partida(); const d = r.datos ? JSON.parse(r.datos) : null; return { rev: r.rev, activo: r.activo && r.activo.dispositivo, rep: d && Math.floor(d.rep), dia: d && d.day }; });
const nubeInfo = (page) => page.evaluate(() => ({ info: window.__nube.info, bloqueo: window.__nube.bloqueo, disp: window.__nube.dispositivo, lista: window.__nube.lista }));
const indicador = (page) => page.evaluate(() => { const e = document.getElementById('nubeInd'); return e && !e.hidden && e.offsetParent !== null ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
const franja = (page) => page.evaluate(() => { const e = document.getElementById('nubeBar'); return e && !e.hidden && e.offsetParent !== null ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
const avisoOtro = (page) => page.$('#overlay.on #modal [data-nube-otro]');
const eleccion = (page) => page.$('#overlay.on #modal [data-act="partida"][data-k="local"]');
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toastTxt = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return t && t.style.display !== 'none' ? t.textContent : ''; });
// Avanza la partida en la pantalla (como si jugara) y la guarda en la nube
async function avanzar(page, cambios) {
  await page.evaluate((c) => { Object.assign(window.__game.state, c); if (window.__game.guardar) window.__game.guardar(); }, cambios);
  await page.evaluate(() => window.__nube.subir());
}
// Entrar a la cuenta por la ventana del juego (como el jugador)
async function entrarUI(page, cuenta) {
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'cuenta'; b.dataset.modo = 'entrar'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
  await page.waitForSelector('#formCuenta #cu-email');
  await page.fill('#cu-email', cuenta.email);
  await page.fill('#cu-clave', cuenta.clave);
  await page.click('#cu-btn');
}

const carga = (page) => page.evaluate(() => { const e = document.getElementById('nubeCarga'); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });
const hayEleccion = (page) => page.evaluate(() => !!document.querySelector('#overlay.on #modal [data-act="partida"][data-k="local"], #overlay.on #modal [data-nube-confirmar]'));
const copias = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('envivo_tycoon_save_respaldo') || '[]').map((x) => x.p); } catch (e) { return null; } });
const diaEs = (page, d, ms) => page.waitForFunction((x) => window.__game && window.__game.state && window.__game.state.day === x, d, { timeout: ms || 15000 }).then(() => true, () => false);
const diasSubidos = (subidas) => subidas.map((x) => { try { return JSON.parse(x.datos).day; } catch (e) { return null; } });
// Lo que hacía el juego viejo (v45: elegir "En este celular") con la partida del día 28: subirla con `tomar`
async function juegoViejoPisa(page, datos) {
  return page.evaluate(async (d) => {
    const m = await window.Api.partidaMeta('dviejo00000001');
    try { const r = await window.Api.subirPartida(d, { base: m.rev, dispositivo: 'dviejo00000001', tomar: true }); return { rev: r.rev }; }
    catch (e) { return { codigo: e.codigo || String(e.message) }; }
  }, datos);
}
// Abre el juego con /api/estado demorado (para ver la pantalla de carga)
async function abrirLento(ctx, base, ms, patron) {
  const page = await ctx.newPage();
  const errores = [], subidas = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|Failed to fetch|ERR_|\[nube\]/.test(m.text())) errores.push(m.text()); });
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/partida$/.test(r.url())) { try { subidas.push(JSON.parse(r.postData() || '{}')); } catch (e) { subidas.push({}); } } });
  let una = true;
  await page.route(patron || '**/api/estado', async (route) => { if (una) { una = false; await dormir(ms); } return route.continue(); });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  return { page, errores, subidas };
}

(async () => {
  const srv = await arrancarServidor();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const cuenta = { email: `prot${Date.now()}@prueba.ec`, clave: 'clave-segura-123' };
  const errores = [];
  try {
    /* ---------- 0. La computadora juega con cuenta: día 72 ---------- */
    const cPC = await contexto(browser, 'pc', { partida: partida(PC) });
    let { page: pc, errores: e0 } = await abrirPagina(cPC, srv.base);
    errores.push(e0);
    await pc.evaluate(async (c) => { await window.Api.registro(c.email, 'Productora QF', c.clave, { acepta_terminos: true, edad_16: true }); }, cuenta);
    await pc.reload({ waitUntil: 'domcontentloaded' });
    await nubeLista(pc); await pc.waitForTimeout(800);
    await avanzar(pc, { money: 101000 });
    let n = await enNube(pc);
    bien(n.dia === 72 && n.rep === 100, `0: la computadora guardó en la nube (día ${n.dia}, fama ${n.rep}, rev ${n.rev})`);
    const cuentaId = await pc.evaluate(() => window.Api.estado.jugador.id);
    const galletas = (await cPC.cookies()).filter((g) => g.name === 'envivo_s');

    /* ---------- 1. El celular viejo (día 28) abre con sesión: carga el día 72 sin preguntar ---------- */
    const cCel = await contexto(browser, 'cel', { galletas, partida: partida(OTRA), nube: { cuenta: cuentaId, rev: 1, clave: [OTRA.day, OTRA.money, OTRA.events].join('|') } });
    {
      const { page: A, errores: eA, subidas } = await abrirLento(cCel, srv.base, 1500);
      errores.push(eA);
      await A.waitForTimeout(400);
      const c = await carga(A);
      bien(/Sincronizando tu partida/.test(c), `1: al abrir con cuenta sale la pantalla de carga: "${c}"`);
      await A.screenshot({ path: path.join(OUT, 'proteger_1_carga.png') });
      bien(!(await desborde(A)), '1: sin desborde horizontal en la pantalla de carga');
      const ok = await diaEs(A, 72);
      await A.waitForLoadState('domcontentloaded'); await A.waitForTimeout(800);
      const d = await estado(A);
      bien(ok && d.dia === 72 && d.rep === 100, `1: cargó la de la nube sin preguntar (día ${d.dia}, fama ${d.rep})`);
      bien(!(await hayEleccion(A)), '1: no hay ninguna ventana para elegir');
      bien(!(await carga(A)), '1: la pantalla de carga se fue');
      const t = await toastTxt(A);
      bien(/más avance/.test(t), `1: avisa qué pasó: "${t}"`);
      const cs = await copias(A);
      bien(!!(cs && cs.some((p) => p.d === 28 && p.e === 20)), `1: la del día 28 quedó como copia en el celular (${JSON.stringify(cs)})`);
      bien(diasSubidos(subidas).every((x) => x !== 28), `1: nunca subió la del día 28 (subidas: ${diasSubidos(subidas).join(',') || '-'})`);
      n = await enNube(A);
      bien(n.dia === 72, `1: la nube sigue en el día ${n.dia}`);
      await A.close();
    }

    /* ---------- 2. Un juego viejo pisa la nube con el día 28; la computadora (día 72) abre: sube la suya sola ---------- */
    const pisa = await juegoViejoPisa(pc, partida(OTRA));
    if (pisa.codigo) {
      // Servidor con la regla de avance (rama partidas-historial): ya ni siquiera acepta la del día 28
      bien(pisa.codigo === 'partida_retroceso', `2: el servidor rechaza subir la del día 28 encima de la del día 72 (${pisa.codigo})`);
      n = await enNube(pc);
      bien(n.dia === 72, `2: la nube sigue en el día ${n.dia}`);
    } else {
      n = await enNube(pc);
      bien(n.dia === 28, `2: el juego viejo dejó la nube en el día ${n.dia} (lo que le pasó al dueño)`);
      await pc.close();
      const r = await abrirPagina(cPC, srv.base); pc = r.page; errores.push(r.errores);
      await nubeLista(pc); await pc.waitForTimeout(1500);
      const d = await estado(pc);
      n = await enNube(pc);
      bien(d.dia === 72 && n.dia === 72 && n.rep === 100, `2: la computadora subió la suya (aquí día ${d.dia}, nube día ${n.dia}, fama ${n.rep})`);
      bien(!(await hayEleccion(pc)), '2: sin ventana para elegir');
      const t = await toastTxt(pc);
      bien(/más avance/.test(t) && /guardada en tu cuenta/.test(t), `2: avisa: "${t}"`);
      const cs = await copias(pc);
      bien(!!(cs && cs.some((p) => p.d === 28)), '2: la del día 28 que estaba en la nube quedó como copia');
    }

    /* ---------- 3. El celular abre el juego mientras la computadora lo tiene abierto ---------- */
    {
      const { page: B, errores: eB } = await abrirPagina(cCel, srv.base);
      errores.push(eB);
      await nubeLista(B); await B.waitForTimeout(800);
      await avanzar(B, { day: 73, money: 102000 });
      n = await enNube(B);
      bien(n.dia === 73 && n.activo === (await nubeInfo(B)).disp, `3: el celular se quedó con la partida y siguió (día ${n.dia})`);
      const subPC = [];
      pc.on('request', (q) => { if (q.method() === 'POST' && /\/api\/partida$/.test(q.url())) { try { subPC.push(JSON.parse(JSON.parse(q.postData()).datos).day); } catch (e) { subPC.push(null); } } });
      await pc.evaluate(() => window.dispatchEvent(new Event('focus')));
      await pc.waitForSelector('#overlay.on #modal [data-nube-otro]', { timeout: 8000 }).catch(() => {});
      const txt = await pc.locator('#modal').innerText().catch(() => '');
      bien(/Tu partida se abrió en otro aparato/.test(txt) && /Recargar/.test(txt), '3: la computadora ve "Tu partida se abrió en otro aparato" con "Recargar"');
      await pc.evaluate(() => { const s = window.__game.state; s.money += 5; window.__game.guardar(); });
      await pc.waitForTimeout(300);
      await pc.click('#overlay.on #modal [data-nube-otro] [data-act="partida"]');
      await pc.waitForLoadState('domcontentloaded'); await pc.waitForTimeout(500);
      await nubeLista(pc); await pc.waitForTimeout(1000);
      const d = await estado(pc);
      bien(d.dia === 73, `3: "Recargar" cargó la de la nube (día ${d.dia})`);
      bien(subPC.every((x) => x === 73), `3: la computadora nunca subió la suya (día 72); después de recargar solo la del día 73 (${subPC.join(',') || '-'})`);
      await B.close();
    }

    /* ---------- 4. 409 partida_retroceso: se carga la de la nube ---------- */
    {
      await pc.route('**/api/partida', (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, codigo: 'partida_retroceso', error: 'La partida de la nube tiene más avance.' }) });
      });
      await pc.evaluate(() => { const s = window.__game.state; s.day = 74; s.stats.events += 1; window.__game.guardar(); });
      await pc.evaluate(() => window.__nube.subir());
      const ok = await diaEs(pc, 73, 8000);
      await pc.unroute('**/api/partida');
      bien(ok, '4: con partida_retroceso se cargó la de la nube (día 73)');
      const cs = await copias(pc);
      bien(!!(cs && cs.some((p) => p.d === 74)), '4: la de aquí (día 74) quedó como copia');
      await pc.waitForLoadState('domcontentloaded'); await nubeLista(pc).catch(() => {}); await pc.waitForTimeout(800);
    }

    /* ---------- 5. La de aquí baja de avance (otra partida): no se sube, se carga la de la nube ---------- */
    {
      const subidas = [];
      const oir = (q) => { if (q.method() === 'POST' && /\/api\/partida$/.test(q.url())) { try { subidas.push(JSON.parse(q.postData() || '{}')); } catch (e) { /* nada */ } } };
      pc.on('request', oir);
      await pc.evaluate(() => { const s = window.__game.state; s.day = 6; s.stats.events = 3; window.__game.guardar(); });
      await pc.evaluate(() => window.__nube.subir());
      const ok = await diaEs(pc, 73, 8000);
      pc.off('request', oir);
      bien(ok && diasSubidos(subidas).every((x) => x !== 6), `5: no subió la del día 6 y volvió a la de la nube (subidas: ${diasSubidos(subidas).join(',') || '-'})`);
      n = await enNube(pc);
      bien(n.dia === 73, `5: la nube sigue en el día ${n.dia}`);
      await pc.waitForLoadState('domcontentloaded'); await nubeLista(pc).catch(() => {}); await pc.waitForTimeout(800);
    }

    /* ---------- 6. Sin servidor al abrir / carga lenta ---------- */
    {
      await pc.close();
      const page = await cPC.newPage();
      const eS = []; page.on('pageerror', (e) => eS.push(String(e))); errores.push(eS);
      let caido = true;
      await page.route('**/api/estado', (route) => (caido ? route.abort('connectionrefused') : route.continue()));
      await page.goto(srv.base + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#nubeCarga [data-act="carga-local"]', { timeout: 10000 }).catch(() => {});
      const c = await carga(page);
      bien(/Sincronizando tu partida/.test(c) && /Reintentar/.test(c) && /Jugar sin conexión/.test(c), `6: sin servidor: "${c}"`);
      await page.screenshot({ path: path.join(OUT, 'proteger_6_sin_red.png') });
      await page.click('#nubeCarga [data-act="carga-local"]');
      await page.waitForTimeout(300);
      bien(!(await carga(page)), '6: "Jugar sin conexión" deja jugar');
      const ind = await indicador(page);
      bien(/Sin conexión · se sincronizará/.test(ind), `6: indicador: "${ind}"`);
      // Se juega sin internet (un evento más) y vuelve la red: la de aquí tiene más avance → se sube
      await page.evaluate(() => { const s = window.__game.state; s.day = 74; s.stats.events += 1; window.__game.guardar(); });
      caido = false;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await nubeLista(page).catch(() => {}); await page.waitForTimeout(1500);
      n = await enNube(page);
      bien(n.dia === 74, `6: al volver la red subió lo jugado sin internet (nube día ${n.dia})`);
      await page.close();
      // Carga lenta (la nube tarda más de 8 s en responder): salen los botones; cuando llega, entra solo
      const r = await abrirLento(cPC, srv.base, 9500, '**/api/partida/meta*'); pc = r.page; errores.push(r.errores);
      await pc.waitForTimeout(8600);
      const c2 = await carga(pc);
      bien(/tardando/.test(c2) && /Reintentar/.test(c2) && /Jugar sin conexión/.test(c2), `6: a los 8 s: "${c2}"`);
      await nubeLista(pc).catch(() => {}); await pc.waitForTimeout(800);
      bien(!(await carga(pc)), '6: cuando responde el servidor, la pantalla se va sola');
    }

    /* ---------- 7. 426 cliente_viejo ---------- */
    {
      const api = fs.readFileSync(path.join(RAIZ, 'js/api.js'), 'utf8'), sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
      const vApi = (/'X-EnVivo-Version': '(envivo-v\d+)'/.exec(api) || [])[1], vSw = (/VERSION = '(envivo-v\d+)'/.exec(sw) || [])[1];
      bien(vApi && vApi === vSw, `7: la versión del juego en js/api.js (${vApi}) es la de sw.js (${vSw})`);
      const cabeceras = [];
      await pc.route('**/api/partida', (route) => {
        const q = route.request();
        if (q.method() !== 'POST') return route.continue();
        cabeceras.push(q.headers()['x-envivo-version'] || '');
        return route.fulfill({ status: 426, contentType: 'application/json', body: JSON.stringify({ ok: false, codigo: 'cliente_viejo', error: 'Actualiza el juego.' }) });
      });
      const nube0 = await enNube(pc);
      const recargo = pc.waitForEvent('load', { timeout: 10000 }).then(() => true, () => false);
      await pc.evaluate(() => { const s = window.__game.state; s.day = 75; s.stats.events += 1; window.__game.guardar(); });
      await pc.evaluate(() => window.__nube.subir());
      const c = await carga(pc).catch(() => '');
      bien(/Actualizando el juego/.test(c), `7: pantalla "${c}"`);
      const guardo = await pc.evaluate(() => { const antes = localStorage.getItem('envivo_tycoon_save_v1'); const s = window.__game.state; s.money += 1; window.__game.guardar(); return localStorage.getItem('envivo_tycoon_save_v1') !== antes; }).catch(() => false);
      bien(!guardo, '7: después del 426 no guarda nada');
      bien(await recargo, '7: abre el juego otra vez (para cargar la versión nueva)');
      bien(cabeceras.length >= 1 && cabeceras.every((x) => x === vApi), `7: cada guardado manda X-EnVivo-Version (${cabeceras.join(',')})`);
      await pc.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
      await pc.waitForTimeout(2000);
      n = await enNube(pc);
      bien(n.rev === nube0.rev, `7: la nube no cambió (rev ${n.rev})`);
      // El servidor sigue diciendo lo mismo enseguida: sin recargar en bucle
      await pc.evaluate(() => { const s = window.__game.state; s.day = 76; s.stats.events += 1; window.__game.guardar(); });
      await pc.evaluate(() => window.__nube.subir()).catch(() => {});
      await pc.waitForSelector('#nubeCarga [data-act="recargar-juego"]', { timeout: 8000 }).catch(() => {});
      const c2 = await carga(pc);
      bien(/Hay que actualizar el juego/.test(c2) && /Abrir otra vez/.test(c2), `7: la segunda vez seguida no recarga en bucle: "${c2}"`);
      await pc.unroute('**/api/partida');
      await pc.close();
      const r = await abrirPagina(cPC, srv.base); pc = r.page; errores.push(r.errores);
      await nubeLista(pc); await pc.waitForTimeout(1000);
    }

    /* ---------- 8. Partida nueva con cuenta / después de quebrar ---------- */
    {
      await pc.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'new-game'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
      await pc.waitForTimeout(300);
      const t = (await pc.locator('#modal').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const d0 = await estado(pc);
      bien(/no se puede empezar otra/.test(t) && d0.dia > 1, `8: con cuenta, "Empezar partida nueva" lo explica y no reemplaza nada (día ${d0.dia})`);
      await pc.evaluate(() => { const b = document.querySelector('#modal [data-act="close"]'); if (b) b.click(); });
      const subidas = [];
      pc.on('request', (q) => { if (q.method() === 'POST' && /\/api\/partida$/.test(q.url())) { try { subidas.push(JSON.parse(q.postData() || '{}')); } catch (e) { /* nada */ } } });
      await pc.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'restart'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
      await pc.waitForTimeout(300);
      await pc.evaluate(() => window.__nube.subir());
      await pc.waitForTimeout(800);
      const nueva = subidas.find((x) => { try { return JSON.parse(x.datos).day === 1; } catch (e) { return false; } });
      bien(!!(nueva && nueva.nueva === true), `8: después de quebrar, la partida nueva se sube con "nueva" (${nueva ? JSON.stringify({ nueva: nueva.nueva, tomar: nueva.tomar }) : 'no subió'})`);
      await cCel.close();
    }
    const todos = [].concat(...errores);
    bien(todos.length === 0, 'Sin errores de JS' + (todos.length ? ': ' + todos.join(' | ') : ''));
    await cPC.close();
    const php = srv.errPhp().filter((l) => !/juego viejo/.test(l));
    bien(php.length === 0, 'Sin errores de PHP' + (php.length ? ': ' + php.slice(0, 3).join(' | ') : ''));
  } catch (e) {
    fallas++; console.error('❌ excepción:', e);
  } finally {
    await browser.close();
    srv.cerrar();
  }
  console.log(`\nSiempre la partida de más avance: ${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
