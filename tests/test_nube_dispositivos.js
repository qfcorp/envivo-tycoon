/* Prueba de lo que reportó el dueño: "Acabo de ingresar del celular y me salen cosas diferentes de las que tengo en la
   computadora en temas de fama y todo, y no me dio ninguna advertencia."
   Juega en la computadora (con cuenta) y abre el juego en el celular. Dos navegadores (contextos) contra el servidor real
   (php -S + server/tests/router.php, base temporal). Cada contexto tiene SU almacenamiento y SUS galletas, como dos
   aparatos (o como la app instalada y la pestaña de Chrome del mismo celular, que tampoco los comparten).
   Casos:
     0. La computadora juega con cuenta y guarda en la nube (fama 260, día 31). Indicador "Partida en la nube".
     A. Celular SIN sesión con una partida vieja de invitado (fama 20, día 5): franja "¿Ya tienes cuenta?" e indicador
        "Solo en este celular (sin cuenta)". Al entrar: sin preguntar, se queda la de más avance (la de la nube, fama
        260) y se avisa; la vieja nunca se sube. La computadora ve "Tu partida se abrió en otro aparato" al volver a ella.
     B. Celular CON sesión y la partida guardada aquí de una versión vieja de la nube: al abrir baja la más nueva sola
        (con aviso), nunca sube la vieja; un guardado con la versión vieja → 409 (el servidor no la acepta).
     C. Instalación nueva (sin partida en el celular) con sesión: baja la de la nube.
     D. Sesión vencida o la app instalada sin la sesión de Chrome (partida de esta cuenta, pero sin galleta): franja
        "Tu sesión se cerró en este dispositivo"; al entrar, aquí se jugaron más eventos: se sube la de aquí, sin preguntar.
     E. El servidor no respondió al abrir (celular lento): el indicador lo dice y, al volver a la app, se conecta y baja
        la partida más nueva (antes se quedaba jugando la copia vieja en silencio hasta recargar).
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_nube_dispositivos.js */
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo-disp-'));
  fs.mkdirSync(path.join(tmp, 'datos'));
  const p = await puertoLibre();
  fs.writeFileSync(path.join(tmp, 'config.env'), `; SOLO PRUEBAS (tests/test_nube_dispositivos.js)\nENVIVO_DB=${tmp}/datos/envivo.sqlite\nENVIVO_URL=http://127.0.0.1:${p}\nENVIVO_ZONA=America/Guayaquil\nPLUX_AMBIENTE=sandbox\n`);
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
const PC = { day: 30, rep: 250, money: 80000, events: 40, chapter: 3 };
const VIEJA = { day: 5, rep: 20, money: 4000, events: 3, chapter: 1, seed: 3 };

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

(async () => {
  const srv = await arrancarServidor();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const cuenta = { email: `disp${Date.now()}@prueba.ec`, clave: 'clave-segura-123' };
  let galletas = null;
  try {
    /* ---------- 0. La computadora juega con cuenta ---------- */
    const cPC = await contexto(browser, 'pc', { partida: partida(PC) });
    let { page: pc, errores: ePC } = await abrirPagina(cPC, srv.base);
    await pc.evaluate(async (c) => { await window.Api.registro(c.email, 'Productora QF', c.clave, { acepta_terminos: true, edad_16: true }); }, cuenta);
    await pc.reload({ waitUntil: 'domcontentloaded' });
    await nubeLista(pc); await pc.waitForTimeout(800);
    await avanzar(pc, { day: 31, rep: 260, money: 82000 });
    let n = await enNube(pc);
    bien(n.rep === 260 && n.dia === 31, `0: la computadora guardó en la nube (fama ${n.rep}, día ${n.dia}, rev ${n.rev})`);
    const indPC = await indicador(pc);
    bien(/Partida en la nube/.test(indPC) && /guardada/.test(indPC), `0: indicador en la computadora: "${indPC}"`);
    galletas = (await cPC.cookies()).filter((g) => g.name === 'envivo_s');
    bien(galletas.length === 1, '0: la computadora tiene la galleta de sesión');
    const cuentaId = await pc.evaluate(() => window.Api.estado.jugador.id);

    /* ---------- A. Celular sin sesión con una partida vieja de invitado ---------- */
    {
      const cA = await contexto(browser, 'cel', { partida: partida(VIEJA), cuando: { t: Date.now() - 3 * 86400000, k: [VIEJA.day, VIEJA.money, VIEJA.events].join('|') } });
      const { page: A, errores: eA, subidas } = await abrirPagina(cA, srv.base);
      const d0 = await estado(A);
      bien(d0.rep === 20 && d0.dia === 5, `A: el celular abre su partida de invitado (fama ${d0.rep}, día ${d0.dia}) — lo que vio el dueño`);
      const fr = await franja(A);
      bien(/¿Ya tienes cuenta\?/.test(fr) && /trae[r]? tu partida de la nube/i.test(fr), `A: franja visible al abrir: "${fr}"`);
      bien(!!(await A.$('#nubeBar [data-act="cuenta"][data-modo="entrar"]')), 'A: la franja tiene el botón Entrar');
      const ind = await indicador(A);
      bien(/Solo en este celular \(sin cuenta\)/.test(ind), `A: indicador: "${ind}"`);
      await A.screenshot({ path: path.join(OUT, 'disp_a_sin_sesion.png') });
      bien(!(await desborde(A)), 'A: sin desborde horizontal');
      await entrarUI(A, cuenta);
      await A.waitForFunction(() => window.__game.state.day === 31, null, { timeout: 10000 }).catch(() => {});
      await A.waitForTimeout(800);
      bien(!(await eleccion(A)), 'A: al entrar no pregunta: se queda la de más avance');
      const d1 = await estado(A);
      bien(d1.rep === 260 && d1.dia === 31 && d1.hdr === '260', `A: cargó la de la nube: fama ${d1.rep}, día ${d1.dia}`);
      const tA = await toastTxt(A);
      bien(/más avance/.test(tA), `A: avisa: "${tA}"`);
      n = await enNube(A);
      bien(n.rep === 260 && subidas.every((x) => { try { return JSON.parse(x.datos).day !== 5; } catch (e) { return true; } }), `A: la nube sigue con la de la computadora (fama ${n.rep}); la vieja nunca se subió`);
      const indA = await indicador(A);
      bien(/Partida en la nube/.test(indA), `A: indicador ahora: "${indA}"`);
      bien(!(await franja(A)), 'A: ya no sale la franja');
      /* 4. La computadora ve el aviso en su próxima revisión */
      await pc.evaluate(() => window.dispatchEvent(new Event('focus')));
      await pc.waitForSelector('#overlay.on #modal [data-nube-otro]', { timeout: 8000 }).catch(() => {});
      bien(!!(await avisoOtro(pc)), 'A/4: la computadora ve "Tu partida se abrió en otro dispositivo"');
      const indPC2 = await indicador(pc);
      bien(/otro dispositivo/.test(indPC2), `A/4: indicador en la computadora: "${indPC2}"`);
      bien(eA.length === 0, 'A: sin errores de JS' + (eA.length ? ': ' + eA.join(' | ') : ''));
      // El celular sigue (fama 270) y la computadora vuelve con "Usar la partida más nueva"
      await avanzar(A, { day: 32, rep: 270 });
      await A.close();
      await pc.click('#overlay.on #modal [data-nube-otro] [data-act="partida"]');
      await pc.waitForLoadState('domcontentloaded'); await pc.waitForTimeout(500);
      await nubeLista(pc); await pc.waitForTimeout(800);
      const dp = await estado(pc);
      bien(dp.rep === 270 && dp.dia === 32, `A/4: la computadora bajó la del celular (fama ${dp.rep}, día ${dp.dia})`);
      // La computadora sigue jugando: fama 300, día 35
      await avanzar(pc, { day: 35, rep: 300, money: 90000 });
      n = await enNube(pc);
      bien(n.rep === 300 && n.dia === 35, `A/4: la computadora siguió (nube: fama ${n.rep}, día ${n.dia}, rev ${n.rev})`);

      /* ---------- B. El mismo celular otra vez: con sesión y su partida de una versión vieja ---------- */
      const { page: B, errores: eB, subidas: subB } = await abrirPagina(cA, srv.base);
      await nubeLista(B); await B.waitForTimeout(1200);
      const dB = await estado(B);
      bien(dB.rep === 300 && dB.dia === 35, `B: al abrir bajó la más nueva de la nube (fama ${dB.rep}, día ${dB.dia})`);
      bien(subB.every((x) => x.base === undefined || x.base >= n.rev), `B: nunca subió la vieja (${subB.length} guardado(s), bases ${subB.map((x) => x.base).join(',') || '-'})`);
      const tB = await toastTxt(B);
      bien(/más avance|partida más nueva/.test(tB), `B: avisa que cargó la de la nube: "${tB}"`);
      n = await enNube(B);
      bien(n.rep === 300 && n.activo === (await nubeInfo(B)).disp, 'B: la nube sigue con fama 300 y el celular la tomó');
      const viejo = await B.evaluate(async (s) => { try { await window.Api.subirPartida(s, { base: 1, dispositivo: window.__nube.dispositivo }); return 200; } catch (e) { return e.status + ' ' + e.codigo; } }, partida(VIEJA));
      bien(viejo === '409 partida_desactualizada' || viejo === '409 partida_retroceso', `B: un guardado con versión vieja → ${viejo}`);
      bien(eB.length === 0, 'B: sin errores de JS' + (eB.length ? ': ' + eB.join(' | ') : ''));
      await B.close(); await cA.close();
    }

    /* ---------- C. Instalación nueva con sesión ---------- */
    {
      const cC = await contexto(browser, 'cel', { galletas });
      const { page: C, errores: eC } = await abrirPagina(cC, srv.base);
      await nubeLista(C); await C.waitForTimeout(1200);
      const d = await estado(C);
      bien(d.rep === 300 && d.dia === 35, `C: instalación nueva: bajó la de la nube (fama ${d.rep}, día ${d.dia})`);
      const ind = await indicador(C);
      bien(/Partida en la nube/.test(ind), `C: indicador: "${ind}"`);
      bien(!(await eleccion(C)), 'C: sin preguntar (aquí no había nada)');
      bien(eC.length === 0, 'C: sin errores de JS' + (eC.length ? ': ' + eC.join(' | ') : ''));
      await cC.close();
    }

    /* ---------- D. Sesión vencida / app instalada sin la sesión de Chrome ---------- */
    n = await enNube(pc);
    {
      // La partida de esta cuenta guardada aquí (versión vieja) y después se siguió jugando sin sesión
      const cD = await contexto(browser, 'cel', { partida: partida({ day: 34, rep: 285, money: 86000, events: 45, chapter: 3 }), nube: { cuenta: cuentaId, rev: 1, clave: [33, 85000, 44].join('|') }, cuando: { t: Date.now() - 20 * 60000, k: [34, 86000, 45].join('|') } });
      const { page: D, errores: eD, subidas } = await abrirPagina(cD, srv.base);
      const fr = await franja(D);
      bien(/sesión se cerró/.test(fr), `D: franja de sesión cerrada: "${fr}"`);
      const ind = await indicador(D);
      bien(/Solo en este celular/.test(ind), `D: indicador: "${ind}"`);
      await D.screenshot({ path: path.join(OUT, 'disp_d_sesion_cerrada.png') });
      await entrarUI(D, cuenta);
      await nubeLista(D).catch(() => {}); await D.waitForTimeout(1500);
      bien(!(await eleccion(D)), 'D: no pregunta');
      const d = await estado(D);
      const nD = await enNube(D);
      bien(d.rep === 285 && d.dia === 34 && nD.rep === 285 && nD.dia === 34, `D: aquí había más eventos (45 contra 40): se subió la de aquí (nube fama ${nD.rep}, día ${nD.dia})`);
      bien(eD.length === 0, 'D: sin errores de JS' + (eD.length ? ': ' + eD.join(' | ') : ''));
      await cD.close();
    }

    /* ---------- E. El servidor no respondió al abrir ---------- */
    {
      const cE = await contexto(browser, 'cel', { galletas, partida: partida({ day: 33, rep: 280, money: 85000, events: 44, chapter: 3 }), nube: { cuenta: cuentaId, rev: 1, clave: [33, 85000, 44].join('|') } });
      const { page: E, errores: eE, subidas } = await abrirPagina(cE, srv.base, { estadoFalla: 1 });
      const ind = await indicador(E);
      bien(/Sin conexión/.test(ind), `E: sin respuesta del servidor: el indicador lo dice ("${ind}")`);
      await E.evaluate(() => window.dispatchEvent(new Event('focus')));
      await nubeLista(E).catch(() => {}); await E.waitForTimeout(1500);
      const d = await estado(E);
      bien(d.rep === 285 && d.dia === 34, `E: al volver a la app se conectó y bajó la de más avance (fama ${d.rep}, día ${d.dia})`);
      bien(subidas.every((x) => x.base === undefined || x.base >= n.rev), 'E: nunca subió la vieja');
      bien(eE.length === 0, 'E: sin errores de JS' + (eE.length ? ': ' + eE.join(' | ') : ''));
      await cE.close();
    }
    bien(ePC.length === 0, 'Computadora: sin errores de JS' + (ePC.length ? ': ' + ePC.join(' | ') : ''));
    await cPC.close();
    const php = srv.errPhp();
    bien(php.length === 0, 'Sin errores de PHP' + (php.length ? ': ' + php.slice(0, 3).join(' | ') : ''));
  } catch (e) {
    fallas++; console.error('❌ excepción:', e);
  } finally {
    await browser.close();
    srv.cerrar();
  }
  console.log(`\nPartida en varios dispositivos: ${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
