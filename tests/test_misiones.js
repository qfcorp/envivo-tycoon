/* Prueba de las Misiones del día y de la semana (js/misiones.js + server/src/Misiones.php).
   1. Textos: los 10 idiomas con todas las claves y los mismos {marcadores}.
   2. Misma tabla y misma elección por fecha que el servidor (php lee server/src/Misiones.php).
   3. Lógica con el juego de verdad en Node (js/logic.js + js/sede.js): eventos, estrellas, dinero ganado, contratar,
      reparar, repuesto, equipo, publicidad, sede (entrega y mejoras), intentos en línea que NO cuentan, cambio de día,
      reclamar sin cuenta (dinero, repuestos, materiales a la sede local, sin créditos) y cofres.
   4. Navegador (390x844, 360x780 y escritorio): el juego entero sin servidor (fila de Inicio "misiones", "Nuevo",
      reclamar con el botón, cofres, inglés) y una página con servidor FALSO y cuenta (POST /api/misiones/reclamar,
      créditos, XP del pase, entregas → alReclamar, lo reclamado en otro celular, errores).
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_misiones.js     (capturas en tests/capturas/misiones_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v);
const igual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/* ---------- 1. Textos ---------- */
console.log('Textos');
globalThis.__ENVIVO_FECHA = '2026-10-23';
globalThis.Game = require(path.join(RAIZ, 'js', 'logic.js'));
const G = globalThis.Game;
const Sede = require(path.join(RAIZ, 'js', 'sede.js'));
const Mi = require(path.join(RAIZ, 'js', 'misiones.js'));
const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
const claves = Object.keys(Mi.TRAD.es);
IDIOMAS.forEach((c) => {
  const d = Mi.TRAD[c] || {};
  const faltan = claves.filter((k) => !(k in d));
  const sobran = Object.keys(d).filter((k) => !(k in Mi.TRAD.es));
  const marc = claves.filter((k) => k in d && JSON.stringify((String(Mi.TRAD.es[k]).match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((String(d[k]).match(/\{\w+\}/g) || []).sort()));
  ok(!faltan.length && !sobran.length && !marc.length && Mi.TITULO_PL[c], `${c}: ${claves.length} claves${faltan.length ? ', faltan ' + faltan.join(',') : ''}${sobran.length ? ', sobran ' + sobran.join(',') : ''}${marc.length ? ', marcadores distintos en ' + marc.join(',') : ''}`);
});
ok(Object.keys(Mi.TRAD).length === 10, 'Español + 9 idiomas');
const sinTexto = Object.keys(Mi.DIA).concat(Object.keys(Mi.SEMANA)).filter((id) => !Mi.TRAD.es['m.' + id]);
ok(!sinTexto.length, 'Cada misión tiene su texto' + (sinTexto.length ? ' (faltan ' + sinTexto.join(',') + ')' : ''));

/* ---------- 2. Igual que el servidor ---------- */
console.log('Misma tabla y elección que server/src/Misiones.php');
let php = null;
try {
  php = JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(path.join(RAIZ, 'server/src/Misiones.php'))};
    use EnVivo\\Misiones; $o = [];
    for ($k = 0; $k < 120; $k++) { $f = gmdate('Y-m-d', gmmktime(12, 0, 0, 10, 1, 2026) + 86400 * $k); $o[$f] = [Misiones::elegir('d', $f), Misiones::elegir('d', $f, false), Misiones::elegir('s', Misiones::lunes($f)), Misiones::lunes($f)]; }
    echo json_encode(['picks' => $o, 'dia' => Misiones::MISIONES_DIA, 'semana' => Misiones::MISIONES_SEMANA, 'cofres' => Misiones::COFRES, 'xp' => Misiones::XP_PASE, 'por' => Misiones::POR_PERIODO, 'pts' => Misiones::PUNTOS_MISION, 'fnv' => Misiones::fnv('2026-10-23:cinco')]);`], { encoding: 'utf8' }));
} catch (e) { ok(false, 'php no corrió: ' + e.message); }
if (php) {
  ok(igual(php.dia, Mi.DIA), 'Misiones del día: misma tabla (metas y premios)');
  ok(igual(php.semana, Mi.SEMANA), 'Misiones de la semana: misma tabla');
  ok(igual(php.cofres, Mi.COFRES), 'Cofres de actividad: mismo contenido');
  ok(igual(php.xp, Mi.XP_PASE) && php.pts === Mi.PUNTOS, 'Misma XP del pase y puntos por misión');
  ok(Object.keys(php.dia).join() === Object.keys(Mi.DIA).join() && Object.keys(php.semana).join() === Object.keys(Mi.SEMANA).join(), 'Mismo orden (la primera es la fija)');
  ok(php.fnv === Mi.fnv('2026-10-23:cinco'), 'Mismo hash FNV-1a');
  const malas = Object.keys(php.picks).filter((f) => { const [d, dOff, s, l] = php.picks[f]; return !igual(d, Mi.elegir('d', f, true)) || !igual(dOff, Mi.elegir('d', f, false)) || !igual(s, Mi.elegir('s', Mi.lunes(f), true)) || l !== Mi.lunes(f); });
  ok(!malas.length, `Mismas misiones en 120 días (día con y sin cuenta, semana, lunes)${malas.length ? ': distintas en ' + malas.slice(0, 3).join(',') : ''}`);
}

/* ---------- 3. Lógica con el juego de verdad ---------- */
console.log('Lógica (js/logic.js + js/sede.js en Node)');
ok(G.extensiones.some((e) => e.id === 'misiones'), 'Registrada como extensión de logic.js');
let s = G.newGame();
s.seed = 12345;
const toasts = [];
Mi._st.ctx = { S: () => s, save: () => {}, toast: (m) => toasts.push(m), render: () => {}, M: (n) => '$' + n };
let m = Mi.asegurar(s);
ok(m.d.p === '2026-10-23' && m.w.p === '2026-10-19', 'Periodo de hoy (fecha del celular) y lunes de la semana');
ok(igual(m.d.ids, Mi.elegir('d', '2026-10-23', false)) && m.d.ids.indexOf('en_linea') < 0, 'Sin cuenta: 5 del día sin "en línea"');
ok(m.d.ids[0] === 'eventos' && m.w.ids[0] === 'eventos_s', 'La primera es fija (Haz 3 / 15 eventos)');
function jugarEvento(st) {
  if (!st.contracts.length) G.marketing(st, 'visitar');
  const c = st.contracts[0];
  const sg = G.suggestLoadout(st, c.id);
  const r = G.startEvent(st, c.id, sg.staffIds, sg.equipIds);
  if (!r || !r.ok) return null;
  for (let g = 0; g < 30 && G.currentIncident(st); g++) { let k = 0; while (k < 4 && !(G.resolveIncident(st, k) || {}).ok) k++; if (k >= 4) break; }
  const f = G.finishEvent(st);
  return f && f.ok ? f.result : null;
}
const res = [];
for (let i = 0; i < 3; i++) { const r = jugarEvento(s); if (r) res.push(r); }
m = Mi.asegurar(s);
const ganado = res.reduce((a, r) => a + Math.max(0, r.net), 0);
ok(res.length === 3 && m.d.c.evento === 3 && m.w.c.evento === 3, `3 eventos de verdad → contador 3 (día y semana) [${res.map((r) => r.stars + '★').join(' ')}]`);
ok((m.d.c.estrellas4 || 0) === res.filter((r) => r.stars >= 4).length && (m.d.c.estrellas5 || 0) === res.filter((r) => r.stars >= 5).length, '4★ y 5★ contados según el resultado');
ok((m.d.c.ganar || 0) === ganado, `Dinero neto ganado: ${ganado}`);
ok(Mi.avance(m, 'd', 'eventos') === 3 && Mi.porReclamar(m).some((x) => x[1] === 'eventos'), '"Haz 3 eventos" cumplida y por reclamar');
// Acciones del juego (envueltas)
s.money += 20000;
const antes = Object.assign({}, m.d.c);
G.buyConsumable(s, 'cable', 1);
G.marketing(s, 'anuncio');
const cand = (s.candidates || [])[0];
if (cand) G.hire(s, cand.id);
const eq = s.equip[0]; eq.condition = 40; G.repair(s, eq.id);
const tipoEq = Object.keys(G.CATALOG).find((k) => G.CATALOG[k].price <= 1000 && !(G.CATALOG[k].minRep > s.rep) && !G.CATALOG[k].premium);
const rb = G.buy(s, tipoEq);
ok(m.d.c.repuesto === (antes.repuesto || 0) + 1, 'Comprar un repuesto cuenta');
ok(m.d.c.publicidad === (antes.publicidad || 0) + 1, 'Publicidad cuenta');
ok(!cand || m.d.c.contratar === (antes.contratar || 0) + 1, 'Contratar cuenta' + (cand ? '' : ' (sin candidatos)'));
ok(m.d.c.reparar === (antes.reparar || 0) + 1, 'Reparar cuenta');
ok(!rb.ok || m.d.c.equipo === (antes.equipo || 0) + 1, 'Comprar un equipo cuenta (' + tipoEq + ')');
const r0 = G.repair(s, eq.id);
ok(!r0.ok && m.d.c.reparar === (antes.reparar || 0) + 1, 'Una acción que falla (ya reparado) no cuenta');
s.money = -1e9; G.buyConsumable(s, 'cable', 1); s.money = 20000;
ok(m.d.c.repuesto === (antes.repuesto || 0) + 1, 'Sin dinero: la compra falla y no cuenta');
// Intento en línea (estado aparte): no cuenta nada
const it = G.newGame(); it.intento = true; it.money = 99999;
G.buyConsumable(it, 'cable', 1);
ok(!it.misiones, 'Un estado de intento en línea (s.intento) no cuenta ni se marca');
ok(Mi.marcar('en_linea', 1, it) === false, 'marcar() tampoco cuenta en un intento');
// Sede local: entrega del día y mejoras terminadas
Mi.observar(s);
const ent0 = m.d.c.entrega || 0;
const rc = Sede.reclamarCofre(s);
Mi.observar(s);
ok(rc.ok && m.d.c.entrega === ent0 + 1, 'Reclamar la entrega del día de la sede cuenta');
Mi.observar(s);
ok(m.d.c.entrega === ent0 + 1, 'Mirar otra vez no cuenta doble');
s.sede.mejoras['2.control'] = 1; s.sede.mejoras['2.bodega'] = 1;
Mi.observar(s);
ok(m.w.c.obra === 2, 'Dos mejoras terminadas → 2 obras de la semana');
s.sede.oficial = { cuenta: '1' }; s.sede.mejoras['2.estudio'] = 1;
Mi.observar(s);
ok(m.w.c.obra === 2, 'Pasar a la sede oficial no cuenta (solo cambia la base)');
delete s.sede.oficial; delete s.sede.mejoras['2.estudio'];
Mi.observar(s);
// Reclamar sin cuenta
const dinero0 = s.money, cable0 = s.stock.cable || 0;
(async () => {
  let r = await Mi.reclamar('d', 'eventos');
  ok(r.ok && s.money === dinero0 + 250 && m.d.r.eventos === 1, 'Reclamar "Haz 3 eventos": +$250 en la partida');
  r = await Mi.reclamar('d', 'eventos');
  ok(!r.ok && r.motivo === 'ya' && s.money === dinero0 + 250, 'Otra vez: no da nada');
  const noLista = m.d.ids.find((id) => !Mi.porReclamar(m).some((x) => x[1] === id) && !m.d.r[id]);
  r = noLista ? await Mi.reclamar('d', noLista) : { ok: false, motivo: 'no_listo' };
  ok(!r.ok && r.motivo === 'no_listo', 'Una misión sin terminar no se reclama');
  ok(Mi.puntos(m) === 20, 'Actividad: 20 puntos con una misión reclamada');
  r = await Mi.reclamar('d', 'cofre20');
  ok(r.ok && s.money === dinero0 + 250 + 150 && s.stock.cable === cable0 + 1, 'Cofre 20: +$150 y 1 cable');
  r = await Mi.reclamar('d', 'cofre40');
  ok(!r.ok && r.motivo === 'no_listo', 'Cofre 40 cerrado con 20 puntos');
  // Completa todas las del día (a mano) y reclama todo
  m.d.ids.forEach((id) => { const d = Mi.DIA[id]; m.d.c[d.k] = Math.max(m.d.c[d.k] || 0, d.n); });
  m.w.ids.forEach((id) => { const d = Mi.SEMANA[id]; m.w.c[d.k] = Math.max(m.w.c[d.k] || 0, d.n); });
  const cables0 = s.sede.materiales.cables;
  const dinero1 = s.money;
  const esperado = m.d.ids.filter((id) => !m.d.r[id]).reduce((a, id) => a + Mi.DIA[id].premio.dinero, 0) + m.w.ids.reduce((a, id) => a + Mi.SEMANA[id].premio.dinero, 0) + 250 + 350 + 500 + 800;
  const matSemana = m.w.ids.reduce((a, id) => a + ((Mi.SEMANA[id].premio.mat || {}).cables || 0), 0);
  const n = await Mi.reclamarTodo();
  ok(n === 4 + 5 + 4, `Reclamar todo: 4 del día + 5 semanales + 4 cofres (${n})`);
  ok(s.money === dinero1 + esperado, `Dinero exacto de la tabla (+${esperado})`);
  ok(Mi.puntos(m) === 100 && Mi.HITOS.every((h) => m.d.r['cofre' + h]), 'Actividad 100 y los 5 cofres abiertos');
  ok(s.sede.materiales.cables === cables0 + 6 + matSemana, 'Sin cuenta: los materiales van a la sede local (cofre 60 + semanales)');
  ok(Mi.porReclamar(m).length === 0, 'Nada más por reclamar');
  ok(toasts.some((x) => /Reclamaste 13 premios/.test(x)), 'Aviso "¡Reclamaste 13 premios!"');
  // Día nuevo: todo nuevo; la semana sigue
  globalThis.__ENVIVO_FECHA = '2026-10-24';
  m = Mi.asegurar(s);
  ok(m.d.p === '2026-10-24' && !Object.keys(m.d.c).length && !Object.keys(m.d.r).length, 'Día nuevo: misiones del día nuevas y en cero');
  ok(m.w.p === '2026-10-19' && m.w.r.eventos_s === 1, 'La semana sigue igual (mismo lunes)');
  globalThis.__ENVIVO_FECHA = '2026-10-26';
  m = Mi.asegurar(s);
  ok(m.w.p === '2026-10-26' && !Object.keys(m.w.r).length, 'Lunes: misiones de la semana nuevas');
  // Guardar y cargar
  const s2 = G.deserialize(G.serialize(s));
  ok(s2 && igual(s2.misiones, s.misiones), 'Se guarda con la partida (serialize/deserialize)');
  // Partida vieja sin s.misiones
  const viejo = G.newGame(); delete viejo.misiones;
  ok(!!Mi.asegurar(viejo).d, 'Partida vieja: se crea sola');
  globalThis.__ENVIVO_FECHA = '2026-10-23';
  await navegador();
})().catch((e) => { ok(false, 'error: ' + (e && e.stack || e)); terminar(); });

/* ---------- 4. Navegador ---------- */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const { verEnInicio } = require('./hub_ayuda');   // las tarjetas de Inicio viven en la sede (js/hub.js)
const BASE = 'http://misiones.prueba';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function servir(c) {
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await c.route(BASE + '/**', (route) => {
    const u = new URL(route.request().url());
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(RAIZ, rel);
    if (rel.startsWith('api/') || !f.startsWith(RAIZ + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
}
async function sinDesborde(page, tag) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('[data-mis="tarjeta"] *')].filter((n) => { const b = n.getBoundingClientRect(); return b.width && (b.right > w + 1 || b.left < -1); })
      .map((n) => n.tagName + '.' + String(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className) + ' «' + (n.textContent || '').slice(0, 30) + '»').slice(0, 3);
    return { doc: document.documentElement.scrollWidth - w, fuera };
  });
  ok(r.doc <= 1 && !r.fuera.length, `${tag}: nada se sale de lado (${r.doc}px${r.fuera.length ? ', se sale: ' + r.fuera.join(' | ') : ''})`);
}
async function navegador() {
  if (!chromium) { ok(false, 'Falta playwright (NODE_PATH=/opt/npm-tools/node_modules)'); return terminar(); }
  const out = path.join(__dirname, 'capturas');
  fs.mkdirSync(out, { recursive: true });
  const cap = (n) => path.join(out, 'misiones_' + n + '.png');
  const browser = await chromium.launch();
  try {
    await juegoSinCuenta(browser, cap);
    await conCuenta(browser, cap);
  } finally { await browser.close(); }
  terminar();
}

async function juegoSinCuenta(browser, cap) {
  console.log('Navegador: el juego entero, sin servidor (390x844)');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
  await servir(ctx);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (x) => { if (x.type() === 'error' && !/fonts\.g|ERR_/.test(x.text())) errores.push('console: ' + x.text()); });
  await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-10-23'; });
  await page.goto(BASE + '/index.html?fecha=2026-11-10', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#overlay.on');
  await page.locator('[data-act="close"]').first().click();
  // En Inicio la tarjeta vive en la pizarra de Misiones de la sede (js/hub.js), después del premio diario (orden 2 → 3)
  ok(await verEnInicio(page, '[data-mis="tarjeta"]', 10000), 'La pizarra de Misiones de la sede trae la tarjeta');
  const orden = await page.evaluate(() => [...document.querySelectorAll('#hubSheet .hub-sh-cuerpo > *')].map((e) => (e.dataset.mis ? 'misiones' : e.dataset.diario ? 'diario' : e.className)));
  ok(orden.indexOf('misiones') >= 0 && (orden.indexOf('diario') < 0 || orden.indexOf('diario') < orden.indexOf('misiones')), 'Hoja de Misiones: premio diario y luego misiones (' + orden.join(' > ') + ')');
  const tx = await page.locator('[data-mis="tarjeta"]').textContent();
  ok(/Misiones del día/.test(tx) && /Misiones de la semana/.test(tx) && /Actividad/.test(tx), 'Título, actividad y semanales');
  ok(await page.locator('[data-mis="dia"] .mis-fila').count() === 5 && await page.locator('[data-mis="semana"] .mis-fila').count() === 5, '5 del día y 5 de la semana');
  ok(/Haz 3 eventos/.test(tx) && /Con tu cuenta, los cofres/.test(tx), '"Haz 3 eventos" y el aviso de créditos con cuenta');
  ok(await page.locator('.mis-cofre').count() === 5, '5 cofres de actividad');
  ok(await page.evaluate(() => window.__game.state.misiones.d.p) === '2026-10-23', 'Sigue el día del celular (no el día del juego)');
  // Comprar un repuesto con el botón de la Bodega (envoltorio de Game.buyConsumable)
  const rep0 = await page.evaluate(() => window.__game.state.misiones.d.c.repuesto || 0);
  await page.evaluate(() => { window.__game.state.money += 5000; });
  await page.locator('nav button[data-tab="bodega"]').click();
  await page.locator('#tab-bodega .subnav [data-k="repuestos"]').click();   // navegación v2: sub-pestaña "Repuestos"
  await page.locator('[data-act="buy-cons"]').first().click();
  ok(await page.evaluate(() => window.__game.state.misiones.d.c.repuesto || 0) === rep0 + 1, 'Botón "+1" de la Bodega cuenta para "Compra un repuesto"');
  await page.locator('nav button[data-tab="inicio"]').click();
  await verEnInicio(page, '[data-mis="tarjeta"]');
  await page.locator('[data-mis="tarjeta"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: cap('inicio') });
  await sinDesborde(page, 'Inicio 390');
  // Cofre cerrado: tocarlo muestra lo que trae
  await page.locator('.mis-cofre[data-k="60"]').click();
  const det = await page.locator('[data-mis="detalle"]').textContent();
  ok(/Cofre de 60 puntos/.test(det) && /6 × cables/.test(det) && /3 créditos con cuenta/.test(det) && /Te faltan 60 puntos/.test(det), 'Cofre 60 cerrado: contenido fijo a la vista (' + det.trim().replace(/\s+/g, ' ') + ')');
  await page.locator('[data-mis="actividad"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: cap('cofre') });
  // Aviso "!" en la pizarra de Misiones de la sede cuando hay algo para reclamar
  await page.evaluate(() => { window.Misiones.marcar('evento', 3); });
  await page.locator('nav button[data-tab="bodega"]').click();
  await page.locator('nav button[data-tab="inicio"]').click();
  const av = await page.evaluate(() => { const b = document.querySelector('.hs[data-hub="misiones"]'); return { t: (b.querySelector('.hs-b') || {}).textContent, aria: b.getAttribute('aria-label') }; });
  ok(av.t === '!' && /reclamar/.test(av.aria), `"!" en la pizarra de Misiones cuando una misión se puede reclamar (${JSON.stringify(av)})`);
  await page.screenshot({ path: cap('nuevo') });
  await verEnInicio(page, '[data-mision="d:eventos"] [data-acc="reclamar"]');
  ok(await page.locator('#hubSheet [data-mision="d:eventos"] [data-acc="reclamar"]').count() === 1, 'Al tocar la pizarra se ve el botón para reclamar');
  // Reclamar con el botón
  const din0 = await page.evaluate(() => window.__game.state.money);
  await page.locator('[data-mision="d:eventos"] [data-acc="reclamar"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: cap('reclamar') });
  await page.locator('[data-mision="d:eventos"] [data-acc="reclamar"]').click();
  await page.waitForFunction(() => window.__game.state.misiones.d.r.eventos === 1);
  const din1 = await page.evaluate(() => window.__game.state.money);
  ok(din1 === din0 + 250, `Reclamar "Haz 3 eventos": +$250 (${din0} → ${din1})`);
  ok(/¡Listo!/.test(await page.locator('#toast').textContent()), 'Aviso "¡Listo! $250"');
  ok(await page.locator('[data-mision="d:eventos"] .mis-ok').count() === 1, 'La fila queda "✓ Listo"');
  const guardado = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('envivo_save_v1') || localStorage.getItem(Object.keys(localStorage).find((k) => /save/.test(k)) || '') || 'null'); } catch (e) { return null; } });
  ok(!!(guardado && guardado.misiones && guardado.misiones.d.r.eventos === 1), 'Se guardó en la partida (localStorage)');
  // Cofre 20 abierto: un toque lo reclama
  const cab0 = await page.evaluate(() => window.__game.state.stock.cable);
  await page.locator('.mis-cofre[data-k="20"]').click();
  await page.waitForFunction(() => window.__game.state.misiones.d.r.cofre20 === 1);
  ok(await page.evaluate(() => window.__game.state.stock.cable) === cab0 + 1, 'Cofre 20: un toque y +1 cable');
  // Reclamar todo
  await page.evaluate(() => { const s = window.__game.state, M = window.Misiones; const m = s.misiones; m.d.ids.forEach((id) => { const d = M.DIA[id]; m.d.c[d.k] = Math.max(m.d.c[d.k] || 0, d.n); }); m.w.ids.slice(0, 2).forEach((id) => { const d = M.SEMANA[id]; m.w.c[d.k] = Math.max(m.w.c[d.k] || 0, d.n); }); });
  await page.locator('nav button[data-tab="bodega"]').click();
  await page.locator('nav button[data-tab="inicio"]').click();
  await verEnInicio(page, '[data-mis="tarjeta"]');
  await page.locator('[data-mis="tarjeta"]').scrollIntoViewIfNeeded();
  ok(/Reclamar todo \(10\)/.test(await page.locator('[data-acc="todo"]').textContent()), '"Reclamar todo (10)": 4 del día + 2 semanales + 4 cofres');
  await page.screenshot({ path: cap('todo') });
  await page.locator('[data-acc="todo"]').click();
  await page.waitForFunction(() => window.Misiones.puntos(window.__game.state.misiones) === 100 && window.__game.state.misiones.d.r.cofre100 === 1);
  ok(await page.locator('[data-acc="todo"]').count() === 0, 'Todo reclamado: el botón se va');
  await page.locator('[data-mis="tarjeta"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: cap('completo') });
  await sinDesborde(page, 'Completo 390');
  // Inglés
  if (await page.evaluate(() => !!(window.I18N && window.I18N.setIdioma))) {
    await page.evaluate(() => window.I18N.setIdioma('en'));
    await page.waitForFunction(() => window.I18N.idioma === 'en', null, { timeout: 5000 }).catch(() => {});
    await page.locator('nav button[data-tab="inicio"]').click();
    await verEnInicio(page, '[data-mis="tarjeta"]');
    const en = await page.locator('[data-mis="tarjeta"]').textContent();
    ok(/Daily missions/.test(en) && /Weekly missions/.test(en), 'En inglés: "Daily missions" / "Weekly missions"');
    await page.locator('[data-mis="tarjeta"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: cap('en') });
    await page.evaluate(() => window.I18N.setIdioma('es'));
  }
  // 360 de ancho y escritorio
  await page.setViewportSize({ width: 360, height: 780 });
  await page.locator('nav button[data-tab="inicio"]').click();
  await verEnInicio(page, '[data-mis="tarjeta"]');
  await page.locator('[data-mis="tarjeta"]').scrollIntoViewIfNeeded();
  await sinDesborde(page, '360');
  await page.screenshot({ path: cap('360') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-mis="tarjeta"]').scrollIntoViewIfNeeded();
  await sinDesborde(page, 'Escritorio');
  await page.screenshot({ path: cap('escritorio') });
  ok(!errores.length, 'Sin errores de JS' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

async function conCuenta(browser, cap) {
  console.log('Navegador: con cuenta y servidor FALSO');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const estilos = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (x) => { if (x.type() === 'error' && !/fonts\.g|ERR_|status of (409|503)/.test(x.text())) errores.push('console: ' + x.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const srv = { pedidos: [], reclamados: { 'd:2026-10-23': ['cofre20'] }, fallar: null, creditos: 100 };
  await page.route('http://cuenta.prueba/**', async (r) => {
    const u = new URL(r.request().url());
    const json = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilos}</head>
      <body><main class="gut" style="padding-top:12px"><div id="ini"></div></main><div class="toast" id="toast"></div><script src="/js/misiones.js"></script></body></html>` });
    if (u.pathname === '/js/misiones.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(RAIZ, 'js/misiones.js'), 'utf8') });
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : undefined;
    srv.pedidos.push({ m: r.request().method(), ruta: u.pathname, body, cab: r.request().headers() });
    if (srv.fallar) { const f = srv.fallar; srv.fallar = null; if (f === 'red') return r.abort('failed'); return json({ ok: false, error: f.error, codigo: f.codigo }, f.status); }
    if (u.pathname === '/api/misiones' && r.request().method() === 'GET') return json({ ok: true, hoy: '2026-10-23', lunes: '2026-10-19', reclamados: srv.reclamados, dia: [], semana: [], creditos_hoy: 0, creditos_tope: 10, xp_pase: true });
    if (u.pathname === '/api/misiones/reclamar') {
      const ya = (srv.reclamados[body.periodo] || []).indexOf(body.clave) >= 0;
      if (ya) return json({ ok: false, error: 'Ya reclamaste ese premio.', codigo: 'ya_reclamado' }, 409);
      (srv.reclamados[body.periodo] = srv.reclamados[body.periodo] || []).push(body.clave);
      const cofre = /^cofre(\d+)$/.exec(body.clave);
      const c = cofre && body.clave === 'cofre60' ? 3 : 0;
      srv.creditos += c;
      const mat = body.periodo[0] === 's' || body.clave === 'cofre60';
      return json({ ok: true, periodo: body.periodo, clave: body.clave, premio: {}, creditos_dados: c, entregas: mat ? [{ id: 700 + srv.pedidos.length, tipo: 'materiales', item: 'cables', cantidad: 6 }] : [],
        xp_pase: cofre ? 0 : body.periodo[0] === 's' ? 40 : 15, tope_alcanzado: false, creditos: srv.creditos, creditos_hoy: c, creditos_tope: 10 });
    }
    return json({ ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }, 404);
  });
  await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-10-23'; });
  await page.goto('http://cuenta.prueba/', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__toasts = []; window.__reclamos = 0;
    window.Api = { disponible: true, logueado: () => true, estado: { creditos: 100, logueado: true, jugador: { id: 7 } } };
    window.__s = { day: 4, money: 1000, stock: { cable: 0, battery: 0 }, sede: { nivel: 3, mejoras: {}, materiales: { cables: 0, placas: 0, paneles: 0, credenciales: 0, planos: 0, chips: 0 }, obras: [], oficial: { cuenta: '7' } } };
    const ini = document.getElementById('ini');
    const mod = () => window.EnVivoInicio.find((x) => x.id === 'misiones');
    window.__ctx = { S: () => window.__s, save: () => {}, M: (n) => '$' + Number(n).toLocaleString('es-EC'),
      toast: (t) => { window.__toasts.push(t); const el = document.getElementById('toast'); el.textContent = t; el.style.display = 'block'; },
      render: () => { ini.innerHTML = mod().tarjeta(window.__ctx); }, alReclamar: () => { window.__reclamos++; }, snd: { play: () => {} } };
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-ext][data-acc]'); if (b) { const m = window.EnVivoInicio.find((x) => x.id === b.dataset.ext); if (m) m.clic(window.__ctx, b.dataset.acc, b); } });
    window.__ctx.render();
  });
  await page.waitForFunction(() => document.querySelector('.mis-cofre[data-k="20"].hecho'));
  const g = srv.pedidos.find((p) => p.ruta === '/api/misiones' && p.m === 'GET');
  ok(!!g, 'Con cuenta: pide GET /api/misiones');
  ok(true, 'Lo reclamado en otro celular (cofre 20) queda marcado ✓');
  const ids = await page.evaluate(() => window.__s.misiones.d.ids);
  ok(igual(ids, Mi.elegir('d', '2026-10-23', true)), 'Con cuenta: las misiones del servidor (pueden traer "en línea")');
  const tx = await page.locator('[data-mis="tarjeta"]').textContent();
  ok(/\+15 XP del pase/.test(tx) && /\+40 XP del pase/.test(tx) && !/Con tu cuenta/.test(tx), 'Muestra la XP del pase (15 del día, 40 semanal) y no el aviso de cuenta');
  await page.evaluate(() => { const m = window.__s.misiones; m.d.c.evento = 3; m.w.c.evento = 15; window.__ctx.render(); });
  await page.screenshot({ path: cap('cuenta') });
  await page.locator('[data-mision="d:eventos"] [data-acc="reclamar"]').click();
  await page.waitForFunction(() => window.__s.misiones.d.r.eventos === 1);
  const p1 = srv.pedidos.filter((p) => p.ruta === '/api/misiones/reclamar').pop();
  ok(p1 && p1.m === 'POST' && p1.body.periodo === 'd:2026-10-23' && p1.body.clave === 'eventos' && p1.cab['x-envivo'] === '1', 'POST /api/misiones/reclamar {periodo: "d:2026-10-23", clave: "eventos"} con X-Envivo');
  ok(await page.evaluate(() => window.__s.money) === 1250, 'Dinero del juego sumado en la partida (+$250)');
  ok(/\+15 XP del pase/.test(await page.evaluate(() => window.__toasts.slice(-1)[0])), 'Aviso con la XP del pase');
  ok(await page.evaluate(() => window.__reclamos) === 0, 'Sin entregas no hace falta refrescar');
  await page.locator('[data-mision="s:eventos_s"] [data-acc="reclamar"]').click();
  await page.waitForFunction(() => window.__s.misiones.w.r.eventos_s === 1);
  ok(await page.evaluate(() => window.__reclamos) === 1, 'Semanal con materiales: llegan como entregas → ctx.alReclamar()');
  ok(await page.evaluate(() => window.__s.sede.materiales.cables) === 0, 'Con cuenta los materiales NO se suman a mano (los suma la sede oficial)');
  // Cofre 60 con créditos
  await page.evaluate(() => { const m = window.__s.misiones; m.d.r.estrellas4 = 1; m.d.r[m.d.ids[1]] = 1; m.d.r[m.d.ids[2]] = 1; window.__ctx.render(); });
  await page.locator('.mis-cofre[data-k="40"]').click();
  await page.waitForFunction(() => window.__s.misiones.d.r.cofre40 === 1);
  await page.locator('.mis-cofre[data-k="60"]').click();
  await page.waitForFunction(() => window.__s.misiones.d.r.cofre60 === 1);
  ok(await page.evaluate(() => window.Api.estado.creditos) === 103, 'Cofre 60: créditos del servidor al saldo (100 → 103)');
  ok(/3 créditos/.test(await page.evaluate(() => window.__toasts.slice(-1)[0])), 'Aviso con "3 créditos"');
  // Ya reclamado en el servidor (otro celular, sin GET todavía)
  srv.reclamados['d:2026-10-23'].push(await page.evaluate(() => window.__s.misiones.d.ids[3]));
  await page.evaluate(() => { const m = window.__s.misiones; const d = window.Misiones.DIA[m.d.ids[3]]; m.d.c[d.k] = d.n; window.__ctx.render(); });
  await page.locator(`[data-mision="d:${await page.evaluate(() => window.__s.misiones.d.ids[3])}"] [data-acc="reclamar"]`).click();
  await page.waitForFunction(() => window.__s.misiones.d.r[window.__s.misiones.d.ids[3]] === 1);
  ok(/ya lo reclamaste/.test(await page.evaluate(() => window.__toasts.slice(-1)[0])), '409 ya_reclamado: se marca ✓ sin dar nada otra vez');
  // Sin conexión: no se marca
  await page.evaluate(() => { const m = window.__s.misiones; const d = window.Misiones.DIA[m.d.ids[4]]; m.d.c[d.k] = d.n; window.__ctx.render(); });
  srv.fallar = 'red';
  const id4 = await page.evaluate(() => window.__s.misiones.d.ids[4]);
  await page.locator(`[data-mision="d:${id4}"] [data-acc="reclamar"]`).click();
  await page.waitForFunction(() => /Sin conexión/.test(window.__toasts.slice(-1)[0] || ''));
  ok(await page.evaluate((id) => !window.__s.misiones.d.r[id], id4), 'Sin conexión: no se marca (se puede intentar de nuevo)');
  srv.fallar = { status: 409, codigo: 'misiones_vencidas', error: 'Esas misiones ya vencieron. Mira las de hoy.' };
  await page.locator(`[data-mision="d:${id4}"] [data-acc="reclamar"]`).click();
  await page.waitForFunction(() => /vencieron/.test(window.__toasts.slice(-1)[0] || ''));
  ok(true, 'Error con código: texto traducido del módulo');
  await page.locator(`[data-mision="d:${id4}"] [data-acc="reclamar"]`).click();
  await page.waitForFunction((id) => window.__s.misiones.d.r[id] === 1, id4);
  ok(true, 'Reintento: ahora sí');
  await page.screenshot({ path: cap('cuenta_reclamado') });
  await sinDesborde(page, 'Con cuenta');
  ok(!errores.length, 'Sin errores de JS' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

function terminar() {
  console.log(fallas ? `\n✘ ${fallas} fallas` : '\n✔ Misiones OK (capturas en tests/capturas/misiones_*.png)');
  process.exit(fallas ? 1 : 0);
}
