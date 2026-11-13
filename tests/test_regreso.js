/* Prueba del regreso del jugador (js/regreso.js, el gancho xpEvento de js/logic.js y server/src/Regreso.php).
   1) Node: textos en js/lang/es.js, cargado en index.html y sw.js, la ventaja es determinista (solo mira s.regreso):
      contratos nuevos +25 %, doble experiencia, la calidad y las estrellas NO cambian; sin ventaja (o vencida) todo igual;
      guardar/cargar la conserva; los intentos en línea nunca la aplican y el validador del servidor da lo mismo (coincide).
   2) Navegador (Playwright, 390x844) con el SERVIDOR REAL (php -S + server/tests/router.php, base temporal): una cuenta
      que vuelve tras 10 días ve «¡Volviste!» con el regalo, lo recibe (créditos del servidor, entregas aplicadas), queda la
      ventaja en la partida, sale la oferta de regreso ($0,99, botón de compra de siempre) y la franja de Inicio; otra vez no
      hay regalo; sin desplazamiento horizontal y sin errores. Capturas: tests/capturas/regreso_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_regreso.js     (SIN_NAVEGADOR=1 para saltar la parte 2) */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const CAP = path.join(__dirname, 'capturas');
fs.mkdirSync(CAP, { recursive: true });
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; return c; };

/* ---------- 1) Node ---------- */
console.log('Textos y archivos');
global.window = global;
require(path.join(RAIZ, 'js/lang/es.js'));
const ES = global.I18N_LANG.es;
delete global.window;
const CLAVES = ['rg.titulo', 'rg.fuera', 'rg.nivel', 'rg.creditos', 'rg.dinero', 'rg.cable', 'rg.battery', 'rg.reparar', 'rg.crece', 'rg.ventaja_t', 'rg.ventaja_txt',
  'rg.recibir', 'rg.recibiendo', 'rg.listo', 'rg.oferta_t', 'rg.oferta_vence', 'rg.comprar', 'rg.ahora_no', 'rg.seguir', 'rg.banner_t', 'rg.banner_txt', 'rg.quedan_dh', 'rg.quedan_h',
  'rg.ver_oferta', 'rg.pendiente_t', 'rg.ver_regalo'];
ok(CLAVES.every((k) => ES[k]), 'js/lang/es.js tiene las ' + CLAVES.length + ' claves rg.*');
const fuente = fs.readFileSync(path.join(RAIZ, 'js/regreso.js'), 'utf8');
const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(!/[áéíóúñ¡¿]/i.test(sinComentarios), 'js/regreso.js no trae textos en español fuera de los comentarios (van en es.js)');
const ext = sinComentarios.slice(sinComentarios.indexOf('const EXT'), sinComentarios.indexOf('function ponerVentaja'));
ok(ext.length > 50 && !/Math\.random|Date\.now|new Date/.test(ext) && !/Math\.random/.test(sinComentarios), 'la extensión no usa el reloj ni el azar (solo mira s.regreso)');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
ok(idx.includes('src="js/regreso.js"') && sw.includes("'./js/regreso.js'"), 'Cargado en index.html y guardado por sw.js');

console.log('Ventaja en la lógica (determinista)');
const G = require('../js/logic.js');
const R = require('../js/regreso.js');
const Intento = require('../server/validador/intento.js');
ok(G.extensiones.some((e) => e.id === 'regreso'), 'regreso.js se registra como extensión de logic.js');
const VENT = { id: 1, hasta_ms: 2000000000000, pago_pct: 25, xp_mult: 2 };
function conVentaja(s, ahora) { R.ponerVentaja(s, VENT); s.regreso.ahora = ahora; return s; }
const copia = (s) => G.deserialize(G.serialize(s));
function jugar(s, cid) {
  const lo = G.suggestLoadout(s, cid);
  const r0 = G.startEvent(s, cid, lo.staffIds, lo.equipIds);
  if (!r0.ok) return null;
  let inc, n = 0;
  while ((inc = G.currentIncident(s)) && n++ < 12) G.resolveIncident(s, G.elegirOpcion ? G.elegirOpcion(s) : 0);
  return G.finishEvent(s).result;
}
{
  const base = G.newGame(77); base.money = 20000;
  const a = copia(base), b = conVentaja(copia(base), 1900000000000), v = conVentaja(copia(base), 2100000000000);
  ok(R.activa(b) && !R.activa(a) && !R.activa(v), 'activa solo con s.regreso.ahora < s.regreso.hasta (vencida = no)');
  const ca = G.addContract(a, 'boda'), cb = G.addContract(b, 'boda'), cv = G.addContract(v, 'boda');
  ok(Math.abs(cb.pay - Math.round(ca.pay * 1.25 / 10) * 10) <= 10 && cb.regreso === 25 && !ca.regreso, `contrato nuevo con ventaja paga +25 % (${ca.pay} → ${cb.pay}) y queda marcado`);
  ok(cv.pay === ca.pay && !cv.regreso, 'ventaja vencida: el contrato paga lo normal');
  // Mismo evento en las dos partidas (mismas tiradas): misma calidad, doble experiencia
  const c0 = base.contracts.find((c) => !c.rival) || base.contracts[0];
  const xpA = copia(base), xpB = conVentaja(copia(base), 1900000000000);
  const ra = jugar(xpA, c0.id), rb = jugar(xpB, c0.id);
  ok(ra && rb && ra.quality === rb.quality && ra.stars === rb.stars, `la ventaja no cambia la calidad ni las estrellas (${ra && ra.quality} = ${rb && rb.quality})`);
  const xs = (s) => s.staff.map((p) => (p.skill * 100) + (p.xp || 0));
  const fue = (s, r) => s.staff.filter((p) => p.events > 0);
  const subA = fue(xpA, ra).reduce((t, p) => t + (p.xp || 0) + p.skill * 1000, 0), subB = fue(xpB, rb).reduce((t, p) => t + (p.xp || 0) + p.skill * 1000, 0);
  ok(fue(xpB, rb).length > 0 && subB > subA, 'doble experiencia: el personal que fue gana más experiencia con la ventaja');
  const unoA = fue(xpA, ra).find((p) => p.skill < 5), unoB = unoA && xpB.staff.find((p) => p.id === unoA.id);
  ok(unoA && unoB && ((unoB.skill > unoA.skill) || (unoB.xp === 2 * unoA.xp)), `un mismo empleado: xp ${unoA && unoA.xp} → ${unoB && unoB.xp} (o subió de nivel)`);
  ok(JSON.stringify(xs(copia(xpA))) === JSON.stringify(xs(xpA)), 'guardar/cargar no cambia el personal');
  const g = copia(xpB);
  ok(g.regreso && g.regreso.hasta === VENT.hasta_ms && R.activa(g), 'guardar/cargar conserva la ventaja');
  // Determinismo: dos corridas iguales dan lo mismo
  const d1 = conVentaja(copia(base), 1900000000000), d2 = conVentaja(copia(base), 1900000000000);
  for (let i = 0; i < 6; i++) { G.nextDay(d1); G.nextDay(d2); }
  ok(G.serialize(d1) === G.serialize(d2), 'determinista: 6 días con la ventaja dan exactamente lo mismo');
}

console.log('Intentos en línea y validador del servidor');
{
  const intento = { seed: 5151, vip: false,
    equipo: { staff: [{ role: 'camarografo', tier: 'semi_senior', skill: 3, wage: 30, morale: 80 }, { role: 'director', tier: 'junior', skill: 2, wage: 30, morale: 80 }, { role: 'tecnico_transmision', tier: 'junior', skill: 2, wage: 25, morale: 80 }],
      equip: [{ type: 'cam_basic', condition: 90 }, { type: 'cam_basic', condition: 90 }] },
    contrato: { type: 'boda', client: 'Familia Prueba', cams: 2, audio: true, stream: true, outdoor: false, diff: 2, pay: 700 },
    contexto: { fama: 30, dinero: 1000 } };
  const elegir = (inc) => inc.choices.length - 1;
  const con = Intento.jugar(G, intento, elegir);
  const i = G.extensiones.findIndex((e) => e.id === 'regreso');
  const quitada = G.extensiones.splice(i, 1)[0];
  const sin = Intento.jugar(G, intento, elegir);
  G.registrarExtension(quitada);
  ok(JSON.stringify(con.resultado) === JSON.stringify(sin.resultado), 'el intento da lo mismo con o sin regreso.js cargado');
  const { s } = Intento.crearEstado(G, intento);
  conVentaja(s, 1900000000000);
  ok(!G.extActivas(s) && G.maxStaff(s) === G.BALANCE.maxStaff, 'aunque el estado del intento traiga s.regreso, las extensiones no corren');
  let V = null;
  try { V = require('../server/validador/validador.js'); } catch (e) { V = null; }
  if (V && typeof V.validate === 'function') {
    const res = V.validate(Object.assign({}, intento, { decisiones: con.decisiones, cliente_resultado: { quality: con.resultado.quality, stars: con.resultado.stars } }));
    ok(res && res.valido === true && res.coincide === true, `el validador del servidor acepta el intento jugado con la ventaja cargada (coincide: ${res && res.coincide})`);
  } else ok(false, 'no se pudo cargar server/validador/validador.js');
}

/* ---------- 2) Navegador ---------- */
if (process.env.SIN_NAVEGADOR === '1') { console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo bien'); process.exit(fallas ? 1 : 0); }
const { chromium } = require('playwright');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_rg_js_'));
fs.mkdirSync(path.join(TMP, 'datos'));
const puerto = 20000 + Math.floor(Math.random() * 20000);
const BASE = 'http://127.0.0.1:' + puerto;
fs.writeFileSync(path.join(TMP, 'config.env'), `ENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\nCORREO_REGISTRO=${TMP}/correos.log\n`);
const ENV = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP, 'config.env'), no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost', PHP_CLI_SERVER_WORKERS: '4' });
execFileSync('php', [path.join(RAIZ, 'server/bin/migrar.php')], { env: ENV });
const srv = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' + path.join(TMP, 'php.log'), '-S', '127.0.0.1:' + puerto, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')], { env: ENV, stdio: 'ignore' });
const php = (codigo) => execFileSync('php', ['-r', `$_SERVER['REMOTE_ADDR'] = '127.0.0.1'; require ${JSON.stringify(path.join(RAIZ, 'server/src/arranque.php'))}; use EnVivo\\{Db, Regreso}; ${codigo}`], { env: ENV }).toString();
const fin = (c) => { try { srv.kill(); } catch (e) { /* nada */ } try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* nada */ } process.exit(c); };

async function esperarServidor() {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/estado'); if (r.ok) return true; } catch (e) { /* todavía no */ } await new Promise((r) => setTimeout(r, 100)); }
  return false;
}
async function cerrarOtras(p) {
  // Cierra las ventanas de inicio que no son «¡Volviste!»
  for (let i = 0; i < 6; i++) {
    const otra = await p.evaluate(() => { const o = document.getElementById('overlay'); return !!(o && o.classList.contains('on') && !o.querySelector('[data-rg="modal"]')); });
    if (!otra) return;
    const b = p.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"]');
    if (!(await b.count())) return;
    await b.first().click();
    await p.waitForTimeout(200);
  }
}
const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  if (!(await esperarServidor())) { console.error('No arrancó el servidor'); fin(1); }
  const browser = await chromium.launch();
  const errores = [];
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block', timezoneId: 'America/Bogota' }, MOVIL));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(() => {
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_lang', 'es');
    } catch (e) { /* nada */ }
  });
  const r = await ctx.request.post(BASE + '/api/registro', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' },
    data: { email: `vuelve.${Date.now()}@correo-prueba.com`, nombre: 'Productora Vuelve', clave: 'ClaveBuena123', acepta_terminos: true, edad_16: true } });
  const J = (await r.json()).jugador.id;
  // Estuvo fuera 10 días (la tarea del servidor abrió la ausencia)
  php(`Db::q('INSERT INTO regreso_ausencias (jugador_id, desde, detectado) VALUES (?, ?, ?)', [${J}, time() - 10 * 86400, time() - 3 * 86400]);`);

  console.log('Navegador: vuelve tras 10 días (390x844)');
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Api && window.Api.disponible === true && window.Api.logueado(), null, { timeout: 15000 });
  for (let i = 0; i < 30; i++) {
    await cerrarOtras(p);
    if (await p.$('#overlay.on [data-rg="modal"]')) break;
    await p.waitForTimeout(250);
  }
  const txt = await p.evaluate(() => { const m = document.querySelector('#overlay.on [data-rg="modal"]'); return m ? m.innerText.replace(/\s+/g, ' ') : ''; });
  ok(txt.includes('¡Volviste!') && txt.includes('Estuviste fuera 10 días') && txt.includes('100 créditos'), '«¡Volviste!» con los días fuera y el regalo — ' + txt.slice(0, 160));
  ok(txt.includes('3 días de ventaja') && txt.includes('+25 %') && txt.includes('doble de experiencia'), 'Explica los 3 días de ventaja');
  ok(await sinDesborde(p), 'Sin desplazamiento horizontal');
  await p.screenshot({ path: path.join(CAP, 'regreso_volviste_390.png') });
  const zona = php(`echo Db::valor('SELECT zona FROM regreso_jugador WHERE jugador_id = ?', [${J}]);`);
  ok(zona === 'America/Bogota', 'El juego mandó la zona horaria del aparato (' + zona + ')');
  const antes = await p.evaluate(() => window.Api.estado && window.Api.estado.jugador ? window.Api.estado.jugador.creditos : null);
  await p.click('#overlay.on [data-rg="reclamar"]');
  await p.waitForSelector('#overlay.on [data-rg="seguir"]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(600);
  const despues = php(`echo (int) Db::valor('SELECT creditos FROM jugadores WHERE id = ?', [${J}]);`);
  ok(Number(despues) === (Number(antes) || 0) + 100, `El servidor dio 100 créditos (${antes} → ${despues})`);
  const partida = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('envivo_tycoon_save_v1')); } catch (e) { return null; } });
  ok(partida && partida.regreso && partida.regreso.hasta > Date.now() + 2.9 * 86400000 && partida.regreso.pago === 25 && partida.regreso.xp === 2, 'La ventaja quedó guardada en la partida (3 días, +25 %, doble experiencia)');
  const of = await p.evaluate(() => { const b = document.querySelector('#overlay.on [data-rg="comprar"]'); return b ? { k: b.dataset.k, act: b.dataset.act, t: b.textContent } : null; });
  ok(of && of.k === 'regreso_s' && of.act === 'comprar' && /0[.,]99/.test(of.t), 'Oferta de regreso de una sola vez: $0,99 con el botón de compra de siempre — ' + JSON.stringify(of));
  await p.screenshot({ path: path.join(CAP, 'regreso_oferta_390.png') });
  await p.click('#overlay.on [data-rg="seguir"]');
  await p.waitForTimeout(400);
  await p.waitForSelector('#tab-inicio [data-rg="banner"]', { timeout: 5000 }).catch(() => {});
  const ban = await p.evaluate(() => { const b = document.querySelector('#tab-inicio [data-rg="banner"]'); return b ? b.innerText.replace(/\s+/g, ' ') : ''; });
  ok(/Ventaja de regreso/.test(ban) && /quedan 2 d|quedan 3 d/.test(ban) && /\+25 %/.test(ban), 'Franja de Inicio con la ventaja y cuánto queda — ' + ban);
  ok(await p.$('#tab-inicio [data-rg="ver-oferta"]') !== null, 'La franja ofrece ver la oferta de regreso');
  ok(await sinDesborde(p), 'Sin desplazamiento horizontal en Inicio');
  await p.screenshot({ path: path.join(CAP, 'regreso_inicio_390.png') });
  // Otra vez: el servidor ya no tiene regalo para esta ausencia
  const otra = await p.evaluate(async () => { const r = await fetch('/api/regreso/reclamar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: JSON.stringify({ id: 1 }) }); return [r.status, (await r.json()).codigo]; });
  ok(otra[0] === 409 && otra[1] === 'regreso_ya_reclamado', 'Pedir el regalo otra vez → 409 regreso_ya_reclamado');
  ok(errores.length === 0, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo bien');
  fin(fallas ? 1 : 0);
})().catch((e) => { console.error(e); fin(1); });
