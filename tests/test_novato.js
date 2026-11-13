/* Prueba de "Tus primeros 7 días" (js/novato.js + el acceso de js/hub.js, server/src/RutaNovato.php) con el SERVIDOR REAL
   (php -S + server/tests/router.php, base temporal) en un celular de 390x844. Revisa:
   - textos nov.* en js/lang/es.js, sin textos en español dentro de js/novato.js, cargado en index.html y sw.js, y la MISMA tabla
     de premios que el servidor (RutaNovato::PREMIOS / FINAL);
   - sin cuenta: el acceso en Inicio desde el primer minuto con el premio grande (camarógrafo internacional) y la oferta de
     novato; la hoja propia (título "Tus primeros 7 días"), las tareas del día 1, los días bloqueados, las tareas en línea con
     su alternativa, reclamar el día 1 (dinero y cables en la partida), el reloj adelantado (día 7: los 7 días y el premio
     grande se suma a la partida), la analítica (novato_dia en /api/eventos) y que desaparece al terminar;
   - no sale durante la guía del primer evento ni en una partida vieja;
   - con cuenta: reclamar el día 1 guarda el reclamo en el servidor, botón "Comprar por $0,99" de la oferta;
   - sin desplazamiento horizontal y sin errores de JavaScript.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_novato.js     (capturas en tests/capturas/novato_*.png) */
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

/* ---------- Textos y tabla ---------- */
console.log('Textos y tabla de premios');
global.window = global;
require(path.join(RAIZ, 'js/lang/es.js'));
const ES = global.I18N_LANG.es;
const fuente = fs.readFileSync(path.join(RAIZ, 'js/novato.js'), 'utf8');
const usadas = new Set([...fuente.matchAll(/T\('(nov\.[a-z_.]+)'(?!\s*\+)/g)].map((m) => m[1]));
const N = require(path.join(RAIZ, 'js/novato.js'));
Object.keys(N.TAREAS).forEach((d) => N.TAREAS[d].forEach((t) => [t, t.alt].filter(Boolean).forEach((x) => usadas.add(x.k === 'rol' ? 'nov.k.rol.' + x.r : 'nov.k.' + x.k))));
['nov.c.cable', 'nov.c.battery'].forEach((k) => usadas.add(k));
const faltan = [...usadas].filter((k) => !ES[k]);
ok(faltan.length === 0 && usadas.size > 40, `js/lang/es.js tiene las ${usadas.size} claves nov.* que usa el módulo` + (faltan.length ? ' — faltan: ' + faltan.join(', ') : ''));
ok(!!ES['inicio.pl.novato'], 'Título de la hoja (inicio.pl.novato)');
ok(!/[áéíóúñ¡¿]/i.test(fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'js/novato.js no trae textos en español fuera de los comentarios (van en es.js)');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
ok(idx.includes('src="js/novato.js"') && sw.includes("'./js/novato.js'"), 'Cargado en index.html y guardado por sw.js');
const srvTabla = JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(path.join(RAIZ, 'server/src/RutaNovato.php'))}; echo json_encode(['p' => EnVivo\\RutaNovato::PREMIOS, 'f' => EnVivo\\RutaNovato::FINAL, 'd' => EnVivo\\RutaNovato::DIAS, 'v' => EnVivo\\RutaNovato::VENTANA, 'o' => EnVivo\\RutaNovato::OFERTA_HORAS]);`]).toString());
ok(JSON.stringify(srvTabla.p) === JSON.stringify(N.PREMIOS) && JSON.stringify(srvTabla.f) === JSON.stringify(N.FINAL), 'Premios de los días y premio grande: la MISMA tabla en js/novato.js y RutaNovato.php');
ok(srvTabla.d === N.DIAS && srvTabla.v === N.VENTANA && srvTabla.o === N.OFERTA_HORAS, '7 días, ventana de 14 y oferta de 72 horas en los dos lados');
ok(Object.keys(N.TAREAS).every((d) => N.TAREAS[d].length >= 5 && N.TAREAS[d].length <= 7), 'Cada día tiene de 5 a 7 tareas');
ok(Object.keys(N.TAREAS).every((d) => N.TAREAS[d].every((t) => !t.on || t.alt)), 'Toda tarea en línea tiene su alternativa sin red');
delete global.Novato; delete global.EnVivoInicio;

/* ---------- Servidor real con base temporal ---------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_nov_js_'));
fs.mkdirSync(path.join(TMP, 'datos'));
const puerto = 20000 + Math.floor(Math.random() * 20000);
const BASE = 'http://127.0.0.1:' + puerto;
fs.writeFileSync(path.join(TMP, 'config.env'), `ENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\n`);
const ENV = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP, 'config.env'), no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost', PHP_CLI_SERVER_WORKERS: '4' });
execFileSync('php', [path.join(RAIZ, 'server/bin/migrar.php')], { env: ENV });
const srv = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' + path.join(TMP, 'php.log'), '-S', '127.0.0.1:' + puerto, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')], { env: ENV, stdio: 'ignore' });
const php = (codigo) => execFileSync('php', ['-r', `$_SERVER['REMOTE_ADDR'] = '127.0.0.1'; require ${JSON.stringify(path.join(RAIZ, 'server/src/arranque.php'))}; use EnVivo\\{Ajustes, Db}; ${codigo}`], { env: ENV }).toString();
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
const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function nuevoContexto(browser) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, MOVIL));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(() => {
    window.__ENVIVO_ANALITICA = true;
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '3');   // sin la ventana "Crea tu cuenta" a mitad de la prueba
      localStorage.setItem('envivo_lang', 'es');
    } catch (e) { /* nada */ }
  });
  return ctx;
}
let nCuenta = 0;
async function registrar(ctx) {
  nCuenta++;
  const r = await ctx.request.post(BASE + '/api/registro', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' },
    data: { email: `nov${nCuenta}.${Date.now()}@prueba.example`, nombre: 'Productora Novata ' + nCuenta, clave: 'ClaveBuena123', acepta_terminos: true, edad_16: true } });
  return (await r.json()).jugador.id;
}
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const texto = (p, sel) => p.evaluate((s) => { const c = document.querySelector(s); return c ? c.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const repintar = (p) => p.evaluate(() => { window.EnVivoRepintar(); });
// Completa las tareas del día d en la partida (lo que miran las tareas) y pinta otra vez
const completarDia = (p, d) => p.evaluate((dia) => {
  const s = window.__game.state, o = s.novato;
  const G = window.Game;
  window.Novato.TAREAS[dia].forEach((t0) => {
    const t = t0.alt && !(window.Api.logueado && window.Api.logueado()) ? t0.alt : t0;
    switch (t.k) {
      case 'eventos': s.stats.events = Math.max(s.stats.events, t.n); break;
      case 'cinco': s.stats.fiveStars = Math.max(s.stats.fiveStars, t.n); break;
      case 'ganar': s.stats.earned = Math.max(s.stats.earned, t.n); break;
      case 'capitulo': s.chapter = Math.max(s.chapter, t.n); break;
      case 'nombre': s.productora = 'Novata TV'; break;
      case 'personal': while (s.staff.length < t.n) s.staff.push({ id: ++s.idc, name: 'Relleno ' + s.idc, role: 'cablero', tier: 'junior', skill: 1, wage: 20, morale: 100, events: 0, eventos_nacionales: 0, eventos_internacionales: 0 }); break;
      case 'rol': if (!s.staff.some((x) => !x.owner && G.normRole(x.role) === t.r)) s.staff.push({ id: ++s.idc, name: 'Rol ' + s.idc, role: t.r, tier: 'junior', skill: 1, wage: 20, morale: 100, events: 0, eventos_nacionales: 0, eventos_internacionales: 0 }); break;
      case 'activo': o.c.activo = Math.max(o.c.activo || 0, t.n); break;
      default: o.c[t.k] = Math.max(o.c[t.k] || 0, t.n || 1);
    }
  });
  window.EnVivoRepintar();
}, d);

(async () => {
  if (!(await esperarServidor())) { console.error('No arrancó el servidor'); fin(1); }
  const browser = await chromium.launch();
  const errores = [];
  const vigilar = (p) => {
    p.on('pageerror', (e) => errores.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  };
  const abrir = async (ctx, conCuenta) => {
    const p = await ctx.newPage();
    vigilar(p);
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction((c) => window.Api && window.Api.disponible === true && (!c || window.Api.logueado()) && window.Novato && window.__game && window.__game.state, conCuenta, { timeout: 15000 });
    await cerrarVentanas(p);
    await repintar(p);
    return p;
  };

  console.log('Sin cuenta: desde el primer minuto');
  const c0 = await nuevoContexto(browser);
  const p0 = await abrir(c0, false);
  await p0.waitForSelector('#tab-inicio [data-nov="acceso"]', { timeout: 10000 }).catch(() => {});
  let txt = await texto(p0, '#tab-inicio [data-nov="acceso"]');
  ok(!!txt, 'Partida nueva: acceso "Tus primeros 7 días" en Inicio');
  ok(txt && /Día 1 de 7/i.test(txt) && /Camarógrafo internacional/.test(txt), 'Dice "Día 1 de 7" y el premio grande (camarógrafo internacional) — ' + txt);
  ok(txt && /Oferta de novato/.test(txt), 'Muestra la oferta de novato con su tiempo');
  ok(await p0.evaluate(() => { const a = document.querySelector('#tab-inicio [data-nov="acceso"]'), h = document.querySelector('#tab-inicio .hubcard'); return !!a && !!h && a.getBoundingClientRect().top > h.getBoundingClientRect().top; }), 'Va debajo de la productora (en el hub)');
  ok(await p0.evaluate(() => typeof window.__game.state.novato.inicio === 'number' && !window.__game.state.novato.no), 'La partida guarda s.novato con la hora de inicio');
  ok(await sinDesborde(p0), 'Sin desplazamiento horizontal');
  await p0.screenshot({ path: path.join(CAP, 'novato_acceso_390.png') });
  await p0.click('#tab-inicio [data-nov="acceso"]');
  await p0.waitForSelector('#hubSheet [data-nov="tarjeta"]', { timeout: 5000 }).catch(() => {});
  ok(await p0.evaluate(() => { const t = document.querySelector('#hubSheet .hub-sh-t'); return !!t && /Tus primeros 7 días/.test(t.textContent); }), 'Abre su propia hoja con el título "Tus primeros 7 días"');
  txt = await texto(p0, '#hubSheet [data-nov="tarjeta"]');
  ok(txt && /Cubre 3 eventos en total/.test(txt) && /Contrata un sonidista/.test(txt), 'Tareas del día 1 ("Cubre 3 eventos en total", "Contrata un sonidista"…)');
  ok(txt && /Premio del día:/.test(txt) && /2 cables/.test(txt), 'Premio del día a la vista (dinero y 2 cables)');
  ok(txt && /Premio grande al completar los 7 días/.test(txt) && /0 de 7 días reclamados/.test(txt), 'Premio grande visible desde el primer minuto con su avance');
  ok(await p0.evaluate(() => document.querySelectorAll('#hubSheet .nov-dias button.bloq').length === 6), 'Días 2 a 7 bloqueados (uno por día real)');
  ok(!!(await p0.$('#hubSheet [data-nov="faltan"][disabled]')), 'Sin las tareas hechas: botón "Te faltan N tareas" desactivado');
  ok(!!(await p0.$('#hubSheet [data-nov="of_cuenta"]')), 'Oferta sin cuenta: "Crea tu cuenta gratis para aprovecharla"');
  await p0.screenshot({ path: path.join(CAP, 'novato_hoja_390.png') });
  await p0.click('#hubSheet .nov-dias button[data-k="2"]');
  await p0.waitForTimeout(150);
  txt = await texto(p0, '#hubSheet [data-nov="tarjeta"]');
  ok(txt && /se abre mañana/.test(txt) && /Crea tu cuenta gratis/.test(txt) && /o también: Saca 5★ en 1 evento/.test(txt), 'Día 2 (bloqueado): se ven sus tareas; la de la cuenta con su alternativa — ' + (txt || '').slice(0, 200));
  await p0.click('#hubSheet .nov-dias button[data-k="1"]');
  const dinero0 = await p0.evaluate(() => window.__game.state.money);
  const cables0 = await p0.evaluate(() => window.__game.state.stock.cable || 0);
  await completarDia(p0, 1);
  await p0.waitForSelector('#hubSheet [data-nov="reclamar"]', { timeout: 5000 }).catch(() => {});
  ok(!!(await p0.$('#hubSheet [data-nov="reclamar"]')), 'Con las 5 tareas hechas: botón "Reclamar el premio del día 1"');
  ok(await p0.evaluate(() => !!document.querySelector('#tab-inicio [data-nov="acceso"] .hs-b')), 'El acceso marca "!" (hay premio para reclamar)');
  await p0.click('#hubSheet [data-nov="reclamar"]');
  await p0.waitForSelector('#hubSheet [data-nov="reclamado"]', { timeout: 5000 }).catch(() => {});
  ok(await p0.evaluate((d) => window.__game.state.money === d + 400, dinero0), 'Día 1 reclamado: +$400 en la partida');
  ok(await p0.evaluate((c) => window.__game.state.stock.cable === c + 2, cables0), 'y +2 cables');
  ok(!!(await p0.$('#hubSheet [data-nov="reclamado"]')), 'Dice "Premio del día 1 reclamado"');
  ok(!!(await p0.$('nav')), 'El juego sigue normal');

  console.log('Sin cuenta: una semana después');
  await p0.evaluate(() => { window.__ENVIVO_AHORA = window.__game.state.novato.inicio + 6 * 86400000 + 3600000; window.EnVivoRepintar(); });
  txt = await texto(p0, '#tab-inicio [data-nov="acceso"]');
  ok(txt && /Día 7 de 7/i.test(txt), 'Con el reloj 6 días adelante: día 7 — ' + txt);
  for (let d = 2; d <= 7; d++) {
    await completarDia(p0, d);
    await cerrarVentanas(p0);
    await p0.click(`#hubSheet .nov-dias button[data-k="${d}"]`).catch(() => {});
    await p0.waitForSelector('#hubSheet [data-nov="reclamar"]', { timeout: 3000 }).catch(() => {});
    await cerrarVentanas(p0);
    if (await p0.$('#hubSheet [data-nov="reclamar"]')) { await p0.click('#hubSheet [data-nov="reclamar"]'); await p0.waitForSelector('#hubSheet [data-nov="reclamado"]', { timeout: 3000 }).catch(() => {}); }
  }
  ok(await p0.evaluate(() => Object.keys(window.__game.state.novato.r).length === 7), 'Los 7 días reclamados (los anteriores también se pueden después)');
  await p0.waitForSelector('#hubSheet [data-nov="final"]', { timeout: 3000 }).catch(() => {});
  ok(!!(await p0.$('#hubSheet [data-nov="final"]')), 'Botón "Reclamar el premio grande"');
  await p0.screenshot({ path: path.join(CAP, 'novato_final_390.png') });
  const staff0 = await p0.evaluate(() => window.__game.state.staff.length);
  await p0.click('#hubSheet [data-nov="final"]');
  await p0.waitForSelector('#hubSheet [data-nov="final_hecho"]', { timeout: 5000 }).catch(() => {});
  ok(await p0.evaluate((n) => { const s = window.__game.state; const c = s.staff[s.staff.length - 1]; return s.staff.length === n + 1 && c.role === 'camarografo' && c.skill === 4 && c.eventos_internacionales === 1 && c.tier === 'semi_senior'; }, staff0),
    'Premio grande sin cuenta: se une un camarógrafo internacional (habilidad 4, Semi-senior, experiencia internacional)');
  ok(!!(await p0.$('#hubSheet [data-nov="final_hecho"]')), 'Dice "¡Completaste tus primeros 7 días!"');
  await p0.evaluate(() => window.Analitica && window.Analitica.enviar && window.Analitica.enviar());
  await p0.waitForTimeout(800);
  const ev = JSON.parse(php(`echo json_encode(array_column(Db::todas("SELECT json_extract(datos, '$.accion') AS a FROM eventos WHERE nombre = 'novato_dia'"), 'a'));`) || '[]');
  ok(ev.includes('inicio') && ev.includes('completo') && ev.includes('reclamado') && ev.includes('final'), 'Analítica: llegan novato_dia inicio, completo, reclamado y final a /api/eventos — ' + JSON.stringify([...new Set(ev)]));
  await p0.evaluate(() => { window.Hub.cerrar(); window.__ENVIVO_AHORA = window.__game.state.novato.inicio + 8 * 86400000; window.EnVivoRepintar(); });
  ok(!(await p0.$('#tab-inicio [data-nov="acceso"]')), 'Al día siguiente de completarla, el acceso desaparece');
  await p0.evaluate(() => { const s = window.__game.state; delete s.novato.fin; s.novato.r = {}; window.__ENVIVO_AHORA = s.novato.inicio + 14 * 86400000; window.EnVivoRepintar(); });
  ok(!(await p0.$('#tab-inicio [data-nov="acceso"]')), 'Pasados los 14 días, el acceso desaparece aunque no la termine');
  await c0.close();

  console.log('Guía del primer evento y partida vieja');
  const c1 = await nuevoContexto(browser);
  const p1 = await abrir(c1, false);
  await p1.waitForSelector('#tab-inicio [data-nov="acceso"]', { timeout: 10000 }).catch(() => {});
  await p1.evaluate(() => { window.__guiaActivaPrueba = window.Guia.activa; window.Guia.activa = () => true; window.EnVivoRepintar(); });
  ok(!(await p1.$('#tab-inicio [data-nov="acceso"]')), 'Mientras corre la guía del primer evento no se ve (no le quita el foco)');
  await p1.evaluate(() => { window.Guia.activa = window.__guiaActivaPrueba; window.EnVivoRepintar(); });
  ok(!!(await p1.$('#tab-inicio [data-nov="acceso"]')), 'Al terminar la guía vuelve a verse');
  ok(await p1.evaluate(() => { const s = { day: 25, stats: { events: 60, fiveStars: 10 }, chapter: 3, staff: [], equip: [] }; return window.Novato.asegurar(s) === null && s.novato.no === 1; }), 'Una partida vieja (día 25, 60 eventos) no tiene ruta y queda marcada');
  ok(await p1.evaluate(() => { const s = window.__game.state; const o = s.novato; s.novato = { v: 1, no: 1 }; window.EnVivoRepintar(); const nada = !document.querySelector('#tab-inicio [data-nov="acceso"]'); s.novato = o; window.EnVivoRepintar(); return nada; }), 'Partida marcada sin ruta: no hay acceso');
  await c1.close();

  console.log('Con cuenta');
  const c2 = await nuevoContexto(browser);
  const J = await registrar(c2);
  const p2 = await abrir(c2, true);
  await p2.waitForFunction(() => window.Novato._st.srv && window.Novato._st.srv.ok, null, { timeout: 10000 }).catch(() => {});
  ok(await p2.evaluate(() => !!(window.Novato._st.srv && window.Novato._st.srv.elegible)), 'GET /api/novato: cuenta nueva, elegible');
  await repintar(p2);
  await p2.waitForSelector('#tab-inicio [data-nov="acceso"]', { timeout: 10000 }).catch(() => {});
  ok(!!(await p2.$('#tab-inicio [data-nov="acceso"]')), 'Con cuenta nueva: acceso en Inicio');
  await p2.click('#tab-inicio [data-nov="acceso"]');
  await p2.waitForSelector('#hubSheet [data-nov="tarjeta"]', { timeout: 5000 }).catch(() => {});
  txt = await texto(p2, '#hubSheet [data-nov="oferta"]');
  ok(!!(await p2.$('#hubSheet [data-nov="of_comprar"]')) && txt && /Comprar por \$0,99/.test(txt) && /200 créditos/.test(txt), 'Oferta de novato: "Comprar por $0,99" con su contenido — ' + txt);
  ok(txt && /Termina en/.test(txt) && /Una sola vez por cuenta/.test(txt), 'Con su tiempo (72 horas) y "Una sola vez por cuenta"');
  await p2.click('#hubSheet .nov-dias button[data-k="3"]');
  await p2.waitForTimeout(150);
  txt = await texto(p2, '#hubSheet [data-nov="tarjeta"]');
  ok(txt && /Entra a una asociación/.test(txt) && /o también: Contrata un cablero/.test(txt), 'Con cuenta: la tarea en línea se muestra con su alternativa');
  ok(txt && /10 créditos/.test(txt) && !/con cuenta/.test(txt.split('Premio del día:')[1] || ''), 'Premio del día 3 con créditos (con cuenta)');
  await p2.click('#hubSheet .nov-dias button[data-k="1"]');
  await completarDia(p2, 1);
  await p2.waitForSelector('#hubSheet [data-nov="reclamar"]', { timeout: 5000 }).catch(() => {});
  await p2.click('#hubSheet [data-nov="reclamar"]');
  await p2.waitForSelector('#hubSheet [data-nov="reclamado"]', { timeout: 8000 }).catch(() => {});
  ok(php(`echo (int) Db::valor("SELECT COUNT(*) FROM novato_reclamos WHERE jugador_id = ${J} AND clave = 'd1'");`) === '1', 'Reclamar el día 1 con cuenta queda guardado en el servidor');
  ok(!!(await p2.$('#hubSheet [data-nov="reclamado"]')), 'Y en la hoja: "Premio del día 1 reclamado"');
  ok(await sinDesborde(p2), 'Sin desplazamiento horizontal');
  await p2.screenshot({ path: path.join(CAP, 'novato_cuenta_390.png') });
  await c2.close();

  console.log('Cuenta vieja');
  const c3 = await nuevoContexto(browser);
  const J3 = await registrar(c3);
  php(`Db::q('UPDATE jugadores SET creado = ? WHERE id = ${J3}', [time() - 40 * 86400]);`);
  const p3 = await abrir(c3, true);
  await p3.waitForFunction(() => window.Novato._st.srv && window.Novato._st.srv.ok, null, { timeout: 10000 }).catch(() => {});
  await repintar(p3);
  ok(!(await p3.$('#tab-inicio [data-nov="acceso"]')), 'Cuenta de hace 40 días: sin ruta aunque la partida sea nueva');
  await c3.close();

  ok(errores.length === 0, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  const log = (() => { try { return fs.readFileSync(path.join(TMP, 'php.log'), 'utf8'); } catch (e) { return ''; } })();
  ok(!/fatal|warning|deprecated|notice/i.test(log), 'Sin errores de PHP' + (log ? ': ' + log.slice(0, 300) : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  fin(fallas ? 1 : 0);
})().catch((e) => { console.error(e); fin(1); });
