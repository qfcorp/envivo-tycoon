/* Prueba del Premio diario (js/diario.js) dentro del juego real, en celulares simulados (390x844 y 360x780) y escritorio.
   No toca los archivos compartidos: sirve js/ui.js y js/lang/es.js / en.js CON las líneas de server/INTEGRAR_DIARIO.md §3
   aplicadas en memoria (PL_INFO y el título de la fila). El servidor se imita (/api/estado, /api/diario).
   Casos: textos de los 10 idiomas; misma tabla que el servidor (php); reglas del calendario (pausa, ciclo, reloj atrás);
   invitado: sin aviso durante la guía, aviso una vez por día después de la guía, reclamar (dinero, repuestos, materiales
   de sede, registro), no vuelve a salir al recargar, día siguiente, faltar días = pausa, "Más tarde", reclamar desde la
   tarjeta, día 7, reloj atrás; cuándo NO sale el aviso (otra ventana, otra pestaña, evento en vivo, guía, prueba automática);
   con cuenta (servidor falso): créditos, entregas aplicadas, VIP 3 doble, 409; servidor sin la ruta (404) = invitado;
   inglés; sin desborde horizontal y sin errores de JS.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_diario.js     (capturas en tests/capturas/diario_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://diario.test';

let fallas = 0, buenas = 0;
function bien(c, msg) { if (c) { buenas++; console.log('  ✔ ' + msg); } else { fallas++; console.log('  ✘ ' + msg); } }

/* ---------- Integración en memoria (server/INTEGRAR_DIARIO.md §3) ---------- */
function reemplazar(txt, ancla, nuevo, que) {
  if (txt.includes(nuevo.trim())) return txt;
  if (!txt.includes(ancla)) throw new Error('No se encontró el lugar de integración en ' + que + ': ' + ancla.slice(0, 80));
  return txt.replace(ancla, () => nuevo);
}
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
// Inicio ya no tiene filas (PL_INFO): la tarjeta vive en la pizarra de Misiones de la sede (js/hub.js, MAPA diario → misiones)
const uiJs = leer('js/ui.js');
const { verEnInicio } = require('./hub_ayuda');
const conClave = (f, linea) => { const s = leer(f); if (s.includes("inicio.pl.diario")) return s; const a = /(['"]inicio\.pl\.pase['"]\s*:\s*['"][^'"]*['"],)/.exec(s); if (!a) throw new Error('sin inicio.pl.pase en ' + f); return s.replace(a[1], a[1] + ' ' + linea); };
const esJs = conClave('js/lang/es.js', "'inicio.pl.diario': 'Premio diario',");
const enJs = conClave('js/lang/en.js', '"inicio.pl.diario": "Daily reward",');
bien(leer('index.html').includes('<script defer src="js/diario.js"></script>'), 'index.html carga js/diario.js (con defer)');
bien(leer('sw.js').includes("'./js/diario.js'"), 'sw.js guarda js/diario.js');

/* ---------- 1. Textos ---------- */
console.log('Textos');
const D = require(path.join(RAIZ, 'js', 'diario.js'));
const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
const claves = Object.keys(D.TRAD.es);
IDIOMAS.forEach((c) => {
  const d = D.TRAD[c] || {};
  const faltan = claves.filter((k) => !d[k]);
  const sobran = Object.keys(d).filter((k) => !(k in D.TRAD.es));
  const marc = claves.filter((k) => d[k] && JSON.stringify((D.TRAD.es[k].match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((String(d[k]).match(/\{\w+\}/g) || []).sort()));
  bien(!faltan.length && !sobran.length && !marc.length, `${c}: ${claves.length} claves` + (faltan.length ? ' faltan ' + faltan : '') + (sobran.length ? ' sobran ' + sobran : '') + (marc.length ? ' marcadores ' + marc : ''));
});
bien(Object.keys(D.TRAD).length === 10, 'Español + 9 idiomas');
bien(!/Netflix|YouTube|Twitch|Sony|Canon|Kingshot|Whiteout/i.test(JSON.stringify(D.TRAD)), 'Sin marcas reales');
bien(claves.every((k) => k === 'pausa' || D.TRAD.es[k].split(/\s+/).length <= 8), 'Textos cortos (máx. 8 palabras salvo la nota de pausa)');

/* ---------- 2. Misma tabla que el servidor ---------- */
console.log('Tabla de premios');
let php = null;
try { php = JSON.parse(execFileSync('php', ['-r', 'require $argv[1]; echo json_encode(EnVivo\\Diario::PREMIOS);', path.join(RAIZ, 'server/src/Diario.php')], { encoding: 'utf8' })); } catch (e) { php = null; }
const norm = (p) => ({ dinero: p.dinero, consumibles: Array.isArray(p.consumibles) ? {} : p.consumibles, materiales: Array.isArray(p.materiales) ? {} : p.materiales, creditos: p.creditos, grande: !!p.grande });
bien(!!php && JSON.stringify(Object.values(php).map(norm)) === JSON.stringify(D.PREMIOS.map(norm)), 'PREMIOS de js/diario.js = Diario::PREMIOS (server/src/Diario.php)');
bien(D.PREMIOS[1].grande && D.PREMIOS[6].grande && D.PREMIOS.filter((p) => p.grande).length === 2, 'Días grandes: 2 y 7');
bien(D.PREMIOS[6].dinero === 1000 && D.PREMIOS.reduce((a, p) => a + p.dinero, 0) === 3600, 'Dinero modesto: día 7 $1.000, semana $3.600 (se empieza con $1.500)');

/* ---------- 3. Reglas del calendario (invitado) ---------- */
console.log('Reglas');
{
  let st = {};
  let e = D.estadoDe(st, '2026-11-10', 0);
  bien(e.dia === 1 && !e.reclamado_hoy && e.premios[0].estado === 'hoy', 'Nuevo: Día 1, hoy brilla el 1');
  let r = D.reclamarLocal(st, '2026-11-10'); st = r.st;
  bien(r.paso === 1 && D.reclamarLocal(st, '2026-11-10') === null, 'Un reclamo por día');
  e = D.estadoDe(st, '2026-11-10', 0);
  bien(e.reclamado_hoy && e.premios[0].estado === 'reclamado' && e.premios[1].estado === 'siguiente', 'Después: el 1 listo, el 2 es el siguiente');
  r = D.reclamarLocal(st, '2026-11-11'); st = r.st;
  bien(r.paso === 2 && st.racha === 2, 'Día siguiente: Día 2, racha 2');
  e = D.estadoDe(st, '2026-11-15', 0);
  bien(e.dia === 3 && !e.reclamado_hoy, 'Faltó 3 días: sigue en el Día 3 (pausa)');
  r = D.reclamarLocal(st, '2026-11-15'); st = r.st;
  bien(st.racha === 1 && st.paso === 3, '…la racha vuelve a 1, el avance no');
  bien(D.reclamarLocal(st, '2026-11-14') === null && D.estadoDe(st, '2026-11-14', 0).reclamado_hoy, 'Reloj del celular hacia atrás: no se cobra otra vez');
  ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'].forEach((d) => { r = D.reclamarLocal(st, d); st = r.st; });
  e = D.estadoDe(st, '2026-11-19', 0);
  bien(r.paso === 7 && e.dia === 7 && e.premios.every((p) => p.estado === 'reclamado') && e.ciclo === 1, 'Día 7: ciclo completo a la vista hasta mañana');
  e = D.estadoDe(st, '2026-11-20', 0);
  bien(e.dia === 1 && e.ciclo === 2 && e.premios[0].estado === 'hoy', 'Al otro día: ciclo 2, Día 1');
  bien(D.premioDe(7, 3).dinero === 2000 && D.premioDe(7, 2).dinero === 1000 && D.premioDe(7, 3).creditos === 20, 'VIP 3: dinero doble (créditos iguales)');
  bien(Object.keys(D.premioDe(7, 0, { sinMateriales: true }).materiales).length === 0, 'Sin sede: sin materiales');
  bien(D.estadoDe({ paso: 99, ultimo: 'basura' }, '2026-11-10', 0).dia === 1, 'Datos rotos en el celular: empieza en el Día 1');
}

/* ---------- 4. Navegador ---------- */
const errores = [];
async function partidaDe(browser, cambios) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.setContent('<html></html>');
  await p.addScriptTag({ path: path.join(RAIZ, 'js/datos.js') });
  await p.addScriptTag({ path: path.join(RAIZ, 'js/logic.js') });
  const s = await p.evaluate((c) => { const s = window.Game.newGame(7); Object.assign(s, c.top || {}); Object.assign(s.stats, c.stats || {}); return window.Game.serialize(s); }, cambios || {});
  await ctx.close();
  return s;
}
const HOY_SRV = '2026-11-10';
function servidorFalso(o) {
  const s = { st: {}, vip: o.vip || 0, entregas: [], creditos: 50, id: 100, posts: 0, sinRuta: !!o.sinRuta };
  s.estado = () => { const e = D.estadoDe(s.st, HOY_SRV, s.vip); delete e.local; e.quedan_seg = 5 * 3600 + 120; e.proximo = '2026-11-11T00:00:00-05:00'; return e; };
  return s;
}
async function abrir(browser, o) {
  o = o || {};
  const vp = o.vp || { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: vp.width < 600, hasTouch: vp.width < 600, serviceWorkers: 'block', locale: 'es-EC' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|status of 4\d\d/.test(m.text())) errores.push('console: ' + m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const srv = o.srv || null;
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    const m = route.request().method();
    const json = (st, b) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname === '/js/ui.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: uiJs });
    if (u.pathname === '/js/lang/es.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: esJs });
    if (u.pathname === '/js/lang/en.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: enJs });
    if (u.pathname.startsWith('/api/')) {
      if (!srv) return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
      if (u.pathname === '/api/estado') return json(200, { ok: true, tienda: { productos: [], premium: [] }, logueado: true, jugador: { id: 7, nombre: 'QF', email: 'qf@envivo.test' },
        creditos: srv.creditos, vip_activo: false, vip_nivel: srv.vip, entregas: srv.entregas.slice(), inventario: [], servidor: { id: 1, nombre: 'Servidor 1' }, plux: { disponible: false } });
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/diario' && !srv.sinRuta) return m === 'GET' ? json(200, srv.estado()) : json(405, { ok: false, error: 'Usa GET.' });
      if (u.pathname === '/api/diario/reclamar' && !srv.sinRuta) {
        srv.posts++;
        if (m !== 'POST' || route.request().headers()['x-envivo'] !== '1') return json(403, { ok: false, error: 'Petición no permitida.', codigo: 'cabecera_requerida' });
        const r = D.reclamarLocal(srv.st, HOY_SRV);
        if (!r) return json(409, { ok: false, error: 'Ya reclamaste el premio de hoy. Vuelve mañana.', codigo: 'ya_reclamado' });
        srv.st = r.st;
        const p = D.premioDe(r.paso, srv.vip);
        const nuevas = [];
        const ent = (tipo, item, cantidad) => { const e = { id: ++srv.id, tipo, item, cantidad, origen: 'diario:' + HOY_SRV, creado: '2026-11-10T10:00:00-05:00' }; srv.entregas.push(e); nuevas.push(e); };
        ent('dinero', '-', p.dinero);
        Object.keys(p.consumibles).forEach((k) => ent('consumible', k, p.consumibles[k]));
        Object.keys(p.materiales).forEach((k) => ent('materiales', k, p.materiales[k]));
        srv.creditos += p.creditos;
        return json(200, { ok: true, reclamado: p, entregas: nuevas, creditos: srv.creditos, diario: srv.estado() });
      }
      return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    }
    const f = path.join(RAIZ, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.addInitScript((c) => {
    try {
      if (!localStorage.getItem('__prueba_init')) {
        localStorage.setItem('__prueba_init', '1');
        if (c.guia) localStorage.setItem('envivo_guia_v1', '1');
        localStorage.setItem('envivo_aviso_cuenta', '99');   // sin el aviso de "crea tu cuenta" (es otra prueba)
        localStorage.setItem('envivo_lang', c.idioma || 'es');
        if (c.partida) localStorage.setItem('envivo_tycoon_save_v1', c.partida);
        if (c.diario) localStorage.setItem('envivo_diario_v1', JSON.stringify(c.diario));
        if (c.fecha) localStorage.setItem('__prueba_fecha', c.fecha);
      }
      const f = localStorage.getItem('__prueba_fecha');
      if (f) window.__ENVIVO_FECHA = f;
      window.__ENVIVO_DIARIO_AVISO = localStorage.getItem('__prueba_sin_aviso') ? false : true;
    } catch (e) { /* nada */ }
  }, { guia: o.guia !== false, idioma: o.idioma, partida: o.partida || null, diario: o.diario || null, fecha: o.fecha || '2026-11-10' });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Api && window.Api.disponible !== null && window.__game && window.Diario, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}
const S = (page) => page.evaluate(() => { const s = window.__game.state; return { money: s.money, cable: s.stock.cable || 0, battery: s.stock.battery || 0, mats: s.sede && s.sede.materiales ? Object.assign({}, s.sede.materiales) : null, log: s.log.slice(0, 3).map((x) => x.text) }; });
const hayAviso = (page) => page.evaluate(() => document.getElementById('overlay').classList.contains('on') && !!document.querySelector('#modal [data-diario="aviso"]'));
const esperarAviso = (page, ms) => page.waitForFunction(() => document.getElementById('overlay').classList.contains('on') && !!document.querySelector('#modal [data-diario="aviso"]'), null, { timeout: ms || 10000 }).then(() => true).catch(() => false);
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const modalTxt = (page) => page.evaluate(() => (document.getElementById('overlay').classList.contains('on') ? document.getElementById('modal').innerText : ''));
const tarjetaTxt = async (page) => { await verEnInicio(page, '[data-diario="tarjeta"]', 3000); return page.evaluate(() => { const c = document.querySelector('[data-diario="tarjeta"]'); return c ? c.innerText : ''; }); };
async function cerrarOtras(page) {
  for (let i = 0; i < 5; i++) {
    const otra = await page.evaluate(() => document.getElementById('overlay').classList.contains('on') && !document.querySelector('#modal [data-diario]'));
    if (!otra) return;
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
async function fecha(page, f) { await page.evaluate((x) => localStorage.setItem('__prueba_fecha', x), f); }
async function verTarjeta(page, archivo) {
  await verEnInicio(page, '[data-diario="tarjeta"]', 3000);
  const el = await page.$('#hubSheet [data-diario="tarjeta"]');
  if (!el) return false;
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await el.screenshot({ path: path.join(OUT, archivo) });
  return true;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const partida = await partidaDe(browser, { top: { day: 6 }, stats: { events: 4 } });

    /* ---------- A. Partida nueva, guía sin ver: no hay aviso ---------- */
    console.log('A. Durante la guía');
    {
      const { ctx, page } = await abrir(browser, { guia: false });
      await cerrarOtras(page);
      bien(!(await esperarAviso(page, 7000)), 'A: partida nueva sin la guía vista: no sale el aviso');
      const t = await tarjetaTxt(page);
      bien(/Día 1 de 7/.test(t) && /Reclamar/.test(t), 'A: la tarjeta de Inicio igual está (Día 1 de 7, Reclamar)');
      const fila = await page.evaluate(() => ({ lugar: (document.getElementById('hubSheet') || {}).dataset.lugar, aviso: (document.querySelector('.hs[data-hub="misiones"] .hs-b') || {}).textContent }));
      bien(fila.lugar === 'misiones' && fila.aviso === '!', 'A: en Inicio está en la pizarra de Misiones, que avisa "!" (' + JSON.stringify(fila) + ')');
      const orden = await page.evaluate(() => [...document.querySelectorAll('#hubSheet .hub-sh-cuerpo > .card')].map((x) => x.dataset.diario ? 'diario' : x.className));
      bien(orden[0] === 'diario', 'A: el premio diario sale primero en la hoja (' + orden.slice(0, 3).join(', ') + ')');
      await ctx.close();
    }

    /* ---------- B. Invitado después de la guía ---------- */
    console.log('B. Invitado');
    {
      const { ctx, page } = await abrir(browser, { partida });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'B: sale el aviso del día solo, después de la guía');
      const casillas = await page.evaluate(() => [...document.querySelectorAll('#modal .dr-t')].map((x) => x.className));
      bien(casillas.length === 7, 'B: 7 casillas');
      bien(/\bhoy\b/.test(casillas[0]) && casillas.filter((c) => /\bhoy\b/.test(c)).length === 1, 'B: brilla solo la de hoy (día 1)');
      bien(/grande/.test(casillas[1]) && /grande/.test(casillas[6]) && /d7/.test(casillas[6]), 'B: día 2 y día 7 resaltados (el 7 más grande)');
      const mt = await modalTxt(page);
      bien(/Día 1 de 7/.test(mt) && /Hoy recibes/.test(mt) && /\$300/.test(mt), 'B: dice "Día 1 de 7" y lo que recibe hoy');
      bien(!/créditos/i.test(mt.replace(/Con cuenta: \+\d+ créditos/g, '')), 'B: al invitado no se le prometen créditos');
      bien(!(await desborde(page)), 'B: sin desborde horizontal (390)');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'diario_aviso.png') });
      const antes = await S(page);
      await page.click('#modal [data-acc="reclamar"]');
      await page.waitForSelector('#modal [data-diario="listo"]', { timeout: 3000 });
      const desp = await S(page);
      bien(desp.money === antes.money + 300, `B: reclamar día 1 suma $300 (${antes.money} → ${desp.money})`);
      bien(/Premio diario \(día 1\)/.test(desp.log[0] || ''), 'B: queda en el registro');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, 'diario_listo.png') });
      await page.click('#modal [data-act="close"]');
      await page.waitForTimeout(300);
      const t = await tarjetaTxt(page);
      bien(/Listo por hoy/.test(t) && /Vuelve mañana/.test(t) && /Mañana:/.test(t), 'B: la tarjeta queda "Listo por hoy" con lo de mañana');
      bien(await page.evaluate(() => { const b = document.querySelector('[data-diario="tarjeta"] .dr-btn'); return !!b && b.disabled; }), 'B: el botón queda apagado');
      bien(await verTarjeta(page, 'diario_tarjeta_listo.png'), 'B: captura de la tarjeta');
      const save = await page.evaluate(() => localStorage.getItem('envivo_tycoon_save_v1'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.Diario, null, { timeout: 8000 });
      await cerrarOtras(page);
      bien(!(await esperarAviso(page, 7000)), 'B: al recargar el mismo día no vuelve a salir');
      bien((await S(page)).money === desp.money && !!save, 'B: el dinero quedó guardado');
      // Día siguiente: día 2 (grande) con repuestos y materiales
      await fecha(page, '2026-11-11');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.Diario, null, { timeout: 8000 });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'B: al día siguiente sale otra vez');
      bien(/Día 2 de 7/.test(await modalTxt(page)) && /Con cuenta: \+5 créditos/.test(await modalTxt(page)), 'B: Día 2 de 7 (y avisa que con cuenta trae créditos)');
      const a2 = await S(page);
      await page.click('#modal [data-acc="reclamar"]');
      await page.waitForSelector('#modal [data-diario="listo"]', { timeout: 3000 });
      const d2 = await S(page);
      bien(d2.money === a2.money + 600 && d2.cable === a2.cable + 2, 'B: día 2: +$600 y +2 cables de repuesto');
      bien(!!d2.mats && d2.mats.cables === ((a2.mats && a2.mats.cables) || 0) + 4, 'B: día 2: +4 cables y conectores en la sede');
      await page.click('#modal [data-act="close"]');
      // Faltan 3 días: pausa, sigue en el 3. "Más tarde" y luego desde la tarjeta
      await fecha(page, '2026-11-15');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.Diario, null, { timeout: 8000 });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'B: después de faltar días sale el aviso');
      bien(/Día 3 de 7/.test(await modalTxt(page)) && /no pierdes nada/.test(await modalTxt(page)), 'B: faltar 3 días = pausa: sigue en el Día 3 de 7');
      const masTarde = await page.$('#modal .dr-pop > button.btn[data-act="close"]');
      await masTarde.click();
      await page.waitForTimeout(300);
      bien(!(await hayAviso(page)), 'B: "Más tarde" lo cierra');
      bien(!(await esperarAviso(page, 6000)), 'B: y no vuelve a insistir ese día');
      const a3 = await S(page);
      await verEnInicio(page, '[data-diario="tarjeta"] [data-acc="reclamar"]', 4000);
      await page.click('[data-diario="tarjeta"] [data-acc="reclamar"]');
      await page.waitForTimeout(400);
      const d3 = await S(page);
      bien(d3.money === a3.money + 350 && d3.battery === a3.battery + 1, 'B: reclamar desde la tarjeta: +$350 y +1 batería');
      bien(await page.evaluate(() => getComputedStyle(document.getElementById('toast')).display !== 'none' && /día 3/.test(document.getElementById('toast').textContent)), 'B: aviso corto (toast) con lo recibido');
      // Reloj del celular hacia atrás: nada nuevo
      await fecha(page, '2026-11-13');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.Diario, null, { timeout: 8000 });
      await cerrarOtras(page);
      bien(/Listo por hoy/.test(await tarjetaTxt(page)) && !(await esperarAviso(page, 6000)), 'B: reloj hacia atrás: queda como ya reclamado');
      await ctx.close();
    }

    /* ---------- C. Día 7 (invitado, sin créditos) ---------- */
    console.log('C. Día 7');
    {
      const { ctx, page } = await abrir(browser, { partida, fecha: '2026-11-20', diario: { paso: 6, ciclo: 1, total: 6, racha: 6, ultimo: '2026-11-19' } });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'C: sale el aviso del día 7');
      bien(/Día 7 de 7/.test(await modalTxt(page)) && /\$1\.000/.test(await modalTxt(page)) && /Con cuenta: \+20 créditos/.test(await modalTxt(page)), 'C: Día 7 de 7: $1.000 + materiales (créditos solo con cuenta)');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'diario_dia7.png') });
      const a = await S(page);
      await page.click('#modal [data-acc="reclamar"]');
      await page.waitForSelector('#modal [data-diario="listo"]', { timeout: 3000 });
      const d = await S(page);
      bien(d.money === a.money + 1000 && d.cable === a.cable + 2 && d.battery === a.battery + 2, 'C: +$1.000, +2 cables, +2 baterías');
      bien(d.mats && d.mats.placas === ((a.mats && a.mats.placas) || 0) + 4 && d.mats.chips === ((a.mats && a.mats.chips) || 0) + 2, 'C: materiales de la sede (placas, chips...)');
      await page.click('#modal [data-act="close"]');
      await page.waitForTimeout(300);
      bien(await page.evaluate(() => [...document.querySelectorAll('[data-diario="tarjeta"] .dr-t')].every((x) => x.classList.contains('reclamado'))), 'C: las 7 casillas listas');
      bien(/Mañana: \$300/.test(await tarjetaTxt(page)), 'C: mañana empieza otra semana (Día 1, $300)');
      await ctx.close();
    }

    /* ---------- D. Cuándo NO sale el aviso ---------- */
    console.log('D. Cuándo no molesta');
    {
      const { ctx, page } = await abrir(browser, { partida, fecha: '2026-12-01' });
      await page.evaluate(() => localStorage.setItem('__prueba_sin_aviso', '1'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.Diario, null, { timeout: 8000 });
      await cerrarOtras(page);
      bien(!(await esperarAviso(page, 6000)), 'D: en pruebas automáticas (sin __ENVIVO_DIARIO_AVISO) no sale');
      // (el aviso de hoy ya se mostró: así puedeAvisar se revisa sin que la ventana salga de verdad)
      await page.evaluate(() => { localStorage.setItem('envivo_diario_v1', JSON.stringify({ aviso: '2026-12-01' })); window.__ENVIVO_DIARIO_AVISO = true; });
      await page.waitForTimeout(3200);
      const pa = () => page.evaluate(() => window.Diario.puedeAvisar({ S: () => window.__game.state, Api: window.Api }));
      bien(await pa(), 'D: con todo tranquilo, sí puede salir');
      await page.click('nav button[data-tab="clientes"]'); await page.waitForTimeout(200);
      bien(!(await pa()), 'D: en otra pestaña (Clientes) no sale');
      await page.click('nav button[data-tab="inicio"]'); await page.waitForTimeout(200);
      await page.evaluate(() => { window.__game.state.currentEvent = { prueba: true }; });
      bien(!(await pa()), 'D: con un evento en vivo no sale');
      await page.evaluate(() => { window.__game.state.currentEvent = null; window.__guiaReal = window.Guia; window.Guia = { activa: () => true, KEY: 'envivo_guia_v1' }; });
      bien(!(await pa()), 'D: con la guía activa no sale');
      await page.evaluate(() => { window.Guia = window.__guiaReal; window.__ENVIVO_DIARIO_AVISO = false; });
      bien(!(await pa()), 'D: navegador de pruebas sin permiso: no sale');
      await page.evaluate(() => { window.__ENVIVO_DIARIO_AVISO = true; });
      bien(await pa(), 'D: todo de vuelta: puede salir');
      await page.evaluate(() => { document.getElementById('overlay').classList.add('on'); });
      bien(!(await pa()), 'D: con otra ventana abierta (#overlay) no sale');
      await page.evaluate(() => { document.getElementById('overlay').classList.remove('on'); });
      bien(!(await pa()), 'D: recién cerrada otra ventana, espera unos segundos');
      await page.waitForTimeout(3200);
      bien(await pa(), 'D: …y después sí');
      await ctx.close();
    }

    /* ---------- E. Con cuenta (servidor falso) ---------- */
    console.log('E. Con cuenta');
    {
      const srv = servidorFalso({ vip: 3 });
      const { ctx, page } = await abrir(browser, { partida, srv, fecha: '2026-11-09' });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'E: con cuenta también sale el aviso');
      const mt = await modalTxt(page);
      bien(/Día 1 de 7/.test(mt) && /\$600/.test(mt) && /VIP 3: dinero doble/.test(mt), 'E: VIP 3: el calendario del servidor ya trae el dinero doble ($600 el día 1)');
      bien(await page.evaluate(() => document.querySelectorAll('#modal .dr-t .gem').length === 2), 'E: los días con créditos muestran el ícono (día 2 y 7)');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'diario_cuenta.png') });
      const a = await S(page);
      await page.click('#modal [data-acc="reclamar"]');
      await page.waitForSelector('#modal [data-diario="listo"]', { timeout: 4000 });
      await page.waitForFunction((m) => window.__game.state.money !== m, a.money, { timeout: 5000 }).catch(() => {});
      const d = await S(page);
      bien(srv.posts === 1 && d.money === a.money + 600, `E: el servidor valida y la entrega llega a la partida (+$600: ${a.money} → ${d.money})`);
      await page.click('#modal [data-act="close"]');
      await page.waitForTimeout(400);
      bien(/Listo por hoy/.test(await tarjetaTxt(page)), 'E: la tarjeta sigue lo del servidor (Listo por hoy)');
      // El servidor manda: aunque cambie la fecha del celular, sigue "listo"
      await fecha(page, '2026-11-12');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.Diario && window.Api.disponible !== null, null, { timeout: 8000 });
      await page.waitForTimeout(800);
      await cerrarOtras(page);
      bien(/Listo por hoy/.test(await tarjetaTxt(page)) && !(await esperarAviso(page, 5000)), 'E: cambiar la fecha del celular no da otro premio (manda el servidor)');
      // Día 2 en el servidor: 5 créditos
      srv.st.ultimo = '2026-11-09';
      await page.evaluate(() => { window.Diario.servidor.cargadoEn = 0; });
      await page.evaluate(() => window.Diario.olvidar());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.Diario && window.Api.disponible !== null, null, { timeout: 8000 });
      await cerrarOtras(page);
      await page.waitForFunction(() => /Día 2 de 7/.test((document.querySelector('[data-diario="tarjeta"]') || {}).innerText || ''), null, { timeout: 5000 }).catch(() => {});
      const gem0 = await page.textContent('#hGem').catch(() => '');
      bien(await esperarAviso(page, 8000) && /Día 2 de 7/.test(await modalTxt(page)) && /5 créditos/.test(await modalTxt(page)), 'E: al otro día del servidor: Día 2 con 5 créditos');
      await page.click('#modal [data-acc="reclamar"]');
      await page.waitForSelector('#modal [data-diario="listo"]', { timeout: 4000 });
      bien(/5 créditos/.test(await modalTxt(page)), 'E: la ventana final muestra los créditos');
      await page.click('#modal [data-act="close"]');
      await page.waitForFunction(() => /Listo por hoy/.test((document.querySelector('[data-diario="tarjeta"]') || {}).innerText || ''), null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      const gem1 = await page.textContent('#hGem').catch(() => '');
      bien(srv.creditos === 55 && /55/.test(gem1) && gem0 !== gem1, `E: día 2: +5 créditos al monedero (${gem0} → ${gem1})`);
      // 409: el servidor dice que ya se reclamó (otro celular)
      await page.evaluate(() => { const d = window.Diario.servidor.datos; d.reclamado_hoy = false; d.dia = 3; d.premios[2].estado = 'hoy'; });
      await page.evaluate(() => window.__game && document.querySelector('nav button[data-tab="inicio"]').click());
      await page.waitForTimeout(300);
      await verEnInicio(page, '[data-diario="tarjeta"] [data-acc="reclamar"]', 4000);
      await page.click('[data-diario="tarjeta"] [data-acc="reclamar"]');
      await page.waitForTimeout(800);
      bien(srv.posts === 3 && /ya reclamaste/i.test(await page.textContent('#toast')) && /Listo por hoy/.test(await tarjetaTxt(page)), 'E: 409 ya_reclamado: mensaje amable y vuelve a lo del servidor');
      await ctx.close();
    }

    /* ---------- F. Cuenta pero el servidor no tiene la ruta (404): como invitado ---------- */
    console.log('F. Servidor sin el módulo');
    {
      const srv = servidorFalso({ sinRuta: true });
      const { ctx, page } = await abrir(browser, { partida, srv, fecha: '2026-11-10' });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'F: sin /api/diario sale igual (modo invitado)');
      const a = await S(page);
      await page.click('#modal [data-acc="reclamar"]');
      await page.waitForSelector('#modal [data-diario="listo"]', { timeout: 3000 });
      const d = await S(page);
      bien(d.money === a.money + 300 && srv.creditos === 50, 'F: +$300 en la partida y ningún crédito');
      await ctx.close();
    }

    /* ---------- G. Inglés, 360 px y escritorio ---------- */
    console.log('G. Idioma y pantallas');
    {
      const { ctx, page } = await abrir(browser, { partida, idioma: 'en', fecha: '2026-11-11', diario: { paso: 1, ciclo: 1, total: 1, racha: 1, ultimo: '2026-11-10' } });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'G: aviso en inglés');
      const mt = await modalTxt(page);
      bien(/Daily reward/.test(mt) && /Day 2 of 7/.test(mt) && /Claim/.test(mt) && !/Reclamar|Premio diario/.test(mt), 'G: textos en inglés (Daily reward, Day 2 of 7, Claim)');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'diario_en.png') });
      await ctx.close();
    }
    {
      const { ctx, page } = await abrir(browser, { partida, vp: { width: 360, height: 780 } });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'G: 360 px: sale el aviso');
      bien(!(await desborde(page)), 'G: 360 px: sin desborde horizontal');
      const ancho = await page.evaluate(() => { const g = document.querySelector('#modal .dr-grid'); const m = document.getElementById('modal'); return g && m ? g.getBoundingClientRect().right <= m.getBoundingClientRect().right + 0.5 : false; });
      bien(ancho, 'G: 360 px: las 7 casillas caben en la ventana');
      await page.screenshot({ path: path.join(OUT, 'diario_360.png') });
      await page.click('#modal .dr-pop > button.btn[data-act="close"]');
      await page.waitForTimeout(300);
      bien(await verTarjeta(page, 'diario_tarjeta_360.png'), 'G: 360 px: captura de la tarjeta');
      await ctx.close();
    }
    {
      const { ctx, page } = await abrir(browser, { partida, vp: { width: 1280, height: 800 } });
      await cerrarOtras(page);
      bien(await esperarAviso(page), 'G: escritorio: sale el aviso');
      bien(!(await desborde(page)), 'G: escritorio: sin desborde');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'diario_escritorio.png') });
      await ctx.close();
    }
  } catch (e) {
    fallas++;
    console.log('  ✘ La prueba se cayó: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  bien(errores.length === 0, 'Sin errores de JS' + (errores.length ? ': ' + errores.slice(0, 5).join(' | ') : ''));
  console.log(`\nPremio diario: ${buenas} bien · ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
