/* Pruebas de los Logros y el Libro de combos (js/logros.js).
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_logros.js            (lógica + navegador)
         node tests/test_logros.js --sin-navegador                                   (solo la lógica)
   En el navegador (Chromium, celular 390x844 y 360x780): migración de una partida vieja con un solo aviso, fila de Inicio,
   ventana con pestañas, reclamar, libro de combos, toast "¡Logro desbloqueado!" que espera a que se cierre la ventana
   del evento, sin desbordes y sin errores de JS. Capturas en tests/capturas/logros_*.png */
'use strict';
const path = require('path');
const fs = require('fs');
const RAIZ = path.resolve(__dirname, '..');

// Sin azar ni reloj en la lógica de los logros (la partida usa su semilla)
const rndReal = Math.random, nowReal = Date.now;
const G = require(path.join(RAIZ, 'js', 'logic.js'));
global.Game = G;
const Sede = require(path.join(RAIZ, 'js', 'sede.js'));
const Lg = require(path.join(RAIZ, 'js', 'logros.js'));

let errors = 0;
const check = (c, m) => { if (!c) { errors++; console.error('  ✘ ' + m); } };
const okv = (c, m) => { check(c, m); if (c) console.log('  ✔ ' + m); };

/* ---------- Textos: 10 idiomas, mismas claves y mismos marcadores ---------- */
console.log('Textos');
(function () {
  const IDI = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
  const es = Lg.TRAD.es, par = (v) => JSON.stringify((String(v).match(/\{\w+\}/g) || []).sort());
  okv(Object.keys(Lg.TRAD).length === 10 && IDI.every((c) => Lg.TRAD[c]), '10 idiomas');
  IDI.forEach((c) => {
    const d = Lg.TRAD[c];
    Object.keys(es).forEach((k) => {
      check(typeof d[k] === 'string' && d[k].length > 0, `${c}: falta ${k}`);
      if (typeof d[k] === 'string') check(par(d[k]) === par(es[k]), `${c}.${k}: marcadores distintos`);
    });
    check(Object.keys(d).length === Object.keys(es).length, `${c}: claves de más`);
    check(Lg.PL_TIT[c], `${c}: falta el título de la fila de Inicio`);
  });
  Lg.LOGROS.forEach((d) => { check(es['n_' + d.id], 'sin nombre: ' + d.id); check(es[d.d], 'sin descripción: ' + d.id); });
  Object.keys(Lg.EQUIPO).forEach((k) => check(es['e_' + k], 'sin nombre de equipo: ' + k));
  okv(G.tx('logros.res', { nombre: { k: 'logros.n_ev_10' } }) === '¡Logro desbloqueado! Primeras transmisiones', 'los textos están en Game.TEXTOS (para el resultado y el registro)');
  okv(Lg.LOGROS.length >= 38 && Lg.LOGROS.length <= 48, `${Lg.LOGROS.length} logros (~40)`);
  const tiers = {}; Lg.LOGROS.forEach((d) => { tiers[d.tier] = (tiers[d.tier] || 0) + 1; });
  okv(tiers.bronce > 0 && tiers.plata > 0 && tiers.oro > 0, `niveles: ${JSON.stringify(tiers)}`);
  okv(new Set(Lg.LOGROS.map((d) => d.id)).size === Lg.LOGROS.length, 'ids únicos');
  // Los equipos clave existen en el catálogo (al menos un subtipo de cada uno)
  const subs = new Set(); Object.values(G.CATALOG).forEach((it) => { subs.add(it.subtipo); subs.add(it.cat + ':' + it.subtipo); });
  Object.keys(Lg.EQUIPO).forEach((k) => check(Lg.EQUIPO[k].sub.some((x) => subs.has(x)), 'equipo clave sin equipos en el catálogo: ' + k));
  Lg.LIBRO.forEach((f) => check(G.EVENT_TYPES[f.tipo], 'tipo de evento que no existe en el libro: ' + f.tipo));
  okv(Lg.COMBOS.length >= 20, `${Lg.COMBOS.length} combos en ${Lg.LIBRO.length} filas`);
  // Premios: nunca créditos
  Lg.LOGROS.forEach((d) => { const p = Lg.premioDe(d.id); check(p && !p.creditos && (p.dinero > 0), 'premio raro: ' + d.id); });
})();

/* ---------- Bot sencillo: toma la mejor oferta con la carga sugerida ---------- */
function jugarEvento(s) {
  for (const c of s.contracts.slice()) {
    if (c.internacional) continue;
    const lo = G.suggestLoadout(s, c.id);
    const r = G.startEvent(s, c.id, lo.staffIds, lo.equipIds);
    if (!r.ok) continue;
    let inc, g = 0;
    while ((inc = G.currentIncident(s)) && g++ < 12) G.resolveIncident(s, inc.choices.find((x) => x.ok).i);
    return G.finishEvent(s);
  }
  G.nextDay(s);
  return null;
}
function partida(seed, n) {
  const s = G.newGame(seed);
  const res = [];
  for (let i = 0; i < n * 3 && s.stats.events < n && !s.gameOver; i++) {
    if (s.stock.cable < 2 && s.money > 300) G.buyConsumable(s, 'cable', 1);
    const r = jugarEvento(s);
    if (r && r.ok) res.push(r.result);
  }
  return { s, res };
}

console.log('Partida nueva y eventos');
Math.random = () => { throw new Error('Math.random usado'); };
Date.now = () => { throw new Error('Date.now usado'); };
(function () {
  const s = G.newGame(11);
  okv(s.logros && s.logros.v === 1, 'newGame crea s.logros');
  okv(Object.keys(s.logros.hechos).length === 0 && s.logros.resumen === 0 && s.logros.porMostrar.length === 0, 'partida nueva: nada logrado ni avisos');
  const a = partida(21, 14), b = partida(21, 14);
  okv(a.s.stats.events >= 10, `el bot cubrió ${a.s.stats.events} eventos`);
  okv(JSON.stringify(a.s.logros) === JSON.stringify(b.s.logros), 'determinista: misma semilla, mismos logros');
  okv(!!a.s.logros.hechos.ev_10, 'logro "10 eventos" desbloqueado');
  okv(a.s.logros.porMostrar.includes('ev_10'), 'queda en la cola para el toast');
  okv(a.s.logros.resumen === 0, 'sin aviso de partida vieja');
  const conLinea = a.res.find((r) => (r.extras || []).some((x) => x.k === 'logros.res' && x.p && x.p.nombre && x.p.nombre.k === 'logros.n_ev_10'));
  okv(!!conLinea, 'el resultado del evento 10 tiene la línea "¡Logro desbloqueado!"');
  okv(Object.keys(a.s.logros.libro).length > 0 && Object.values(a.s.logros.libro).every((x) => x.e >= 1 && x.e <= 5), 'el libro anota el mejor resultado de cada tipo');
  const algun = Object.values(a.s.logros.libro).find((x) => !x.viejo);
  okv(algun && algun.personas >= 1 && algun.total >= 1 && typeof algun.cam === 'string', 'con qué personal y cámaras: ' + JSON.stringify(algun));
  // Serializar y volver: igual (y sin avisos nuevos de partida vieja)
  const c = G.deserialize(G.serialize(a.s));
  okv(JSON.stringify(c.logros) === JSON.stringify(a.s.logros), 'guardar y cargar no cambia s.logros');
  // Racha: un evento con un imprevisto que resta la corta
  const L = a.s.logros;
  okv(L.c.rachaMax >= L.c.racha, 'racha máxima ≥ racha actual');
})();

console.log('Combos');
(function () {
  // Boxeo + PTZ con 5 estrellas (resultado armado a mano, el gancho mira el equipo del evento)
  const s = G.newGame(5);
  s.equip.push({ id: 900, type: 'cam_panasonika_aw_uv22', condition: 100 });
  s.currentEvent = { equipIds: [900, s.equip[0].id], staffIds: [s.staff[0].id], incidents: [{ key: 'x', result: { q: 3 } }] };
  const c = { type: 'boxeo' };
  const result = { stars: 4, quality: 82, cameraPlan: { cubiertas: 2, total: 2, positions: [{ asignado: 'cam_panasonika_aw_uv22', q: 2 }] }, extras: [] };
  Lg.alTerminarEvento(s, result, c);
  okv(!!s.logros.combos['boxeo.ptz'], 'boxeo + PTZ con 4 estrellas se anota');
  okv(!s.logros.combos['boxeo.lenta'], 'boxeo + súper lenta no (no la llevaste)');
  okv(result.extras.some((x) => x.k === 'logros.res_combo'), 'línea del combo en el resultado');
  okv(G.tx(result.extras[0].k, result.extras[0].p) === 'Combo nuevo en el libro: Boxeo + cámara PTZ' || /Combo nuevo en el libro: .+ \+ cámara PTZ/.test(G.tx(result.extras[0].k, result.extras[0].p)), 'texto del combo: ' + G.tx(result.extras[0].k, result.extras[0].p));
  okv(s.logros.porMostrar.includes('c:boxeo.ptz'), 'el combo queda en la cola del toast');
  okv(s.logros.libro.boxeo.e === 4 && s.logros.libro.boxeo.cam === 'cam_panasonika_aw_uv22', 'libro: boxeo 4★ con la PTZ');
  // Con 3 estrellas no cuenta
  const s2 = G.newGame(5);
  s2.equip.push({ id: 900, type: 'cam_panasonika_aw_uv22', condition: 100 });
  s2.currentEvent = { equipIds: [900], staffIds: [], incidents: [] };
  Lg.alTerminarEvento(s2, { stars: 3, quality: 60, cameraPlan: { positions: [] } }, { type: 'boxeo' });
  okv(!s2.logros.combos['boxeo.ptz'], 'con 3 estrellas no se anota el combo');
  // Grúa alquilada (sale del plan de cámaras aunque ya se devolvió) y unidad móvil de la flota por la movilización
  const s3 = G.newGame(5);
  s3.currentEvent = { equipIds: [], staffIds: [], incidents: [{ key: 'x', result: { q: -4 } }] };
  Lg.alTerminarEvento(s3, { stars: 5, quality: 95, cameraPlan: { positions: [{ asignado: 'srv_grua_telescopica', q: 4 }] } }, { type: 'concierto' });
  okv(!!s3.logros.combos['concierto.grua'], 'concierto + grúa alquilada');
  okv(s3.logros.c.racha === 0, 'un imprevisto que resta corta la racha');
  const ob = Object.keys(G.CATALOG).find((k) => G.CATALOG[k].subtipo === 'ob_chica');
  s3.currentEvent = { equipIds: [], staffIds: [], incidents: [] };
  Lg.alTerminarEvento(s3, { stars: 5, quality: 95, cameraPlan: { positions: [] }, transporte: { vehiculos: [{ id: 1, type: ob }] } }, { type: 'final' });
  okv(!!s3.logros.combos['final.movil'], 'final + unidad móvil (por la flota)');
  okv(s3.logros.c.racha === 1, 'evento limpio suma a la racha');
  // Fila completa: 5★ + todos sus combos → premio de fila
  const s4 = G.newGame(5);
  Lg.migrar(s4);
  s4.logros.libro.funeral = { e: 5, q: 92, dia: 3 };
  okv(!Lg.filaCompleta(s4, 'funeral'), 'sin su combo la fila no está completa');
  s4.logros.combos['funeral.fluido'] = { dia: 3, e: 5 };
  okv(Lg.filaCompleta(s4, 'funeral'), 'fila del funeral completa');
  const m0 = s4.money;
  const r = Lg.reclamarFila(s4, 'funeral');
  okv(r.ok && s4.money >= m0 + 600, 'premio de la fila: ' + r.msg);
  okv(!Lg.reclamarFila(s4, 'funeral').ok, 'la fila no se cobra dos veces');
})();

console.log('Reclamar');
(function () {
  const s = G.newGame(3);
  s.stats.events = 10;
  G.nextDay(s); // alNuevoDia revisa
  okv(!!s.logros.hechos.ev_10, 'alNuevoDia desbloquea por estadísticas');
  const m0 = s.money, c0 = s.stock.cable;
  const r = Lg.reclamar(s, 'ev_10');
  okv(r.ok && s.money === m0 + 250 && s.stock.cable === c0 + 2, 'bronce: $250 + 2 cables de repuesto · ' + r.msg);
  okv(!Lg.reclamar(s, 'ev_10').ok, 'no se reclama dos veces');
  okv(!Lg.reclamar(s, 'ev_200').ok && Lg.reclamar(s, 'ev_200').msg === 'Todavía no lo consigues', 'no se reclama lo bloqueado');
  okv(!Lg.reclamar(s, 'nada').ok, 'id inexistente');
  // Materiales a la sede local
  Sede.migrar(s);
  s.stats.events = 50; Lg.revisar(s, false);
  const p0 = s.sede.materiales.placas;
  const pp = Lg.premioDe('ev_50');
  const mat = Object.keys(pp.mat)[0];
  const antes = s.sede.materiales[mat];
  okv(Lg.reclamar(s, 'ev_50').ok && s.sede.materiales[mat] === antes + pp.mat[mat], `plata: materiales a la sede (${mat} +${pp.mat[mat]})`);
  // Sede oficial: los materiales se pagan en dinero
  s.sede.oficial = { ahora: 1 };
  s.stats.events = 200; Lg.revisar(s, false);
  const m1 = s.money;
  const po = Lg.premioDe('ev_200');
  const conv = Object.keys(po.mat).reduce((a, k) => a + po.mat[k] * Lg.AJUSTE.matDinero[k], 0);
  okv(Lg.reclamar(s, 'ev_200').ok && s.money === m1 + po.dinero + conv, `oro con sede oficial: ${G.money(po.dinero)} + ${G.money(conv)} por materiales`);
  delete s.sede.oficial;
  void p0;
  // Reclamar todo
  s.stats.fiveStars = 12; s.stats.earned = 120000; Lg.revisar(s, false);
  const pend = Lg.porReclamar(s).logros.length;
  const rt = Lg.reclamarTodo(s);
  okv(pend >= 4 && rt.ok && rt.n === pend && Lg.porReclamar(s).logros.length === 0, `reclamar todo: ${rt.n} premios`);
  okv(!Lg.reclamarTodo(s).ok, 'sin nada por reclamar');
  okv(s.log.some((l) => /Premio de logro/.test(l.text)), 'queda en el registro');
})();

console.log('Partida vieja (migración silenciosa)');
(function () {
  const s = G.newGame(8);
  Object.assign(s.stats, { events: 64, fiveStars: 12, earned: 152000, intl: 1, best: { misa: 5, funeral: 5, boda: 4 } });
  s.chapter = 4;
  for (let i = 0; i < 3; i++) s.staff.push({ id: 700 + i, name: 'P' + i, role: 'camarografo', tier: i ? 'semi_senior' : 'senior', skill: 3, wage: 40, morale: 80, events: 0 });
  delete s.logros;
  const t = G.deserialize(G.serialize(s));
  const L = t.logros;
  const esperados = ['ev_10', 'ev_50', 'cinco_1', 'cinco_10', 'dom_iglesia', 'staff_3', 'senior_1', 'cap_2', 'cap_4', 'gana_10k', 'gana_100k', 'intl_1'];
  okv(esperados.every((k) => L.hechos[k]), 'calcula lo ya logrado: ' + Object.keys(L.hechos).join(','));
  okv(!L.hechos.ev_200 && !L.hechos.historia, 'no da lo que falta');
  okv(L.porMostrar.length === 0, 'sin toasts por cada logro');
  okv(L.resumen === Object.keys(L.hechos).length, `un solo aviso: "Tienes ${L.resumen} logros para reclamar"`);
  okv(L.libro.misa && L.libro.misa.e === 5 && L.libro.misa.viejo, 'el libro toma los mejores resultados de antes');
  const a = Lg.tomarAvisos(t);
  okv(a.resumen > 0 && t.logros.resumen === 0, 'la pantalla toma el aviso y se borra');
  // Volver a cargar no repite el aviso
  const u = G.deserialize(G.serialize(t));
  okv(u.logros.resumen === 0 && u.logros.porMostrar.length === 0, 'al volver a cargar no hay avisos de nuevo');
  // Lazy: una partida sin s.logros que no pasó por migrar (el módulo cargó después) se migra al primer uso
  const v = G.newGame(8); Object.assign(v.stats, { events: 12 }); delete v.logros;
  okv(Lg.resumen(v).hechos === 1 && v.logros.resumen === 1 && !v.logros.porMostrar.length, 'migración al primer uso (módulo con defer)');
})();

console.log('Intentos en línea');
(function () {
  const s = G.newGame(4);
  const antes = JSON.stringify(s.logros);
  s.intento = true; s.stats.events = 30;
  G.nextDay(s);
  okv(JSON.stringify(s.logros) === antes, 'un intento en línea no toca los logros');
})();

console.log('Insignias y pantalla (sin navegador)');
(function () {
  const svg = Lg.insignia('cinco_50', 'listo', 56);
  okv(/^<svg[\s\S]*<\/svg>$/.test(svg.trim()) && /linearGradient/.test(svg), 'insignia SVG con degradado');
  okv(/lo-ins e-bloq/.test(Lg.insignia('ev_10', 'bloq')) && !/linearGradient/.test(Lg.insignia('ev_10', 'bloq')), 'bloqueada: silueta gris');
  const s = G.newGame(4);
  const ctx = { S: () => s, M: G.money, T: (k) => k };
  const h = Lg.tarjeta(ctx);
  okv(/<h3>0\/44 · 0 combos<\/h3>/.test(h), 'tarjeta: "0/44 · 0 combos"');
  const m = Lg.modalHtml(ctx);
  okv(/data-t="combos"/.test(m) && /data-logro="ev_10"/.test(m), 'ventana con pestañas y lista');
})();

Math.random = rndReal; Date.now = nowReal;
if (errors) { console.error(`\n❌ ${errors} errores en la lógica de los logros`); process.exit(1); }
console.log('✅ Logros (lógica) OK');

/* =========================================================
   Navegador
   ========================================================= */
if (!process.argv.includes('--sin-navegador')) (async () => {
  const { chromium } = require('playwright');
  const BASE = 'http://logros.prueba';
  const out = path.join(__dirname, 'capturas'); fs.mkdirSync(out, { recursive: true });
  let html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  if (!/js\/logros\.js/.test(html)) html = html.replace('<script defer src="js/intento.js"></script>', '<script defer src="js/logros.js"></script>\n<script defer src="js/intento.js"></script>');
  // ui.js tal cual: la tarjeta de Logros vive en la vitrina de la sede de Inicio (js/hub.js)
  const ui = fs.readFileSync(path.join(RAIZ, 'js/ui.js'), 'utf8');
  const { verEnInicio } = require('./hub_ayuda');
  // Partida vieja (sin s.logros): capítulo 4, 64 eventos, 12 de 5 estrellas
  const vieja = (() => {
    const s = G.newGame(8); s.chapter = 3; s.day = 70; s.money = 9000; s.rep = 32; s.productora = 'Tukán Producciones';
    Object.assign(s.stats, { events: 64, fiveStars: 12, earned: 152000, best: { misa: 5, funeral: 5, boda: 4, prensa: 3 }, good: { misa: 3, funeral: 2, boda: 2 } });
    for (let i = 0; i < 3; i++) s.staff.push({ id: 700 + i, name: 'Persona ' + i, role: 'camarografo', tier: 'semi_senior', skill: 3, wage: 40, morale: 80, events: 4, eventos_nacionales: 4, eventos_internacionales: 0 });
    s.storyNext = 0;
    delete s.logros;
    return G.serialize(s);
  })();
  const browser = await chromium.launch();
  const errs = [];
  async function abrir(vp, save) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route(BASE + '/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      if (u.pathname === '/js/ui.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: ui });
      if (u.pathname === '/api/estado') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tienda: { productos: [], premium: [] }, logueado: false, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' } }) });
      if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const f = path.join(RAIZ, u.pathname.slice(1));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream', body: fs.readFileSync(f) });
      return r.fulfill({ status: 404, body: '' });
    });
    await page.addInitScript((s) => {
      if (sessionStorage.getItem('logros_prueba')) return;
      sessionStorage.setItem('logros_prueba', '1');
      localStorage.setItem('envivo_lang', 'es'); localStorage.setItem('envivo_tycoon_save_v1', s);
      localStorage.setItem('envivo_aviso_cuenta', '3'); localStorage.setItem('envivo_guia_v1', '"1"');
    }, save);
    return { ctx, page };
  }
  const cerrarVentanas = async (page) => { for (let i = 0; i < 6; i++) { const x = await page.$('#overlay.on [data-act^="close"], #overlay.on [data-act="after-result"]'); if (!x) break; await x.click(); await page.waitForTimeout(250); } };
  const noHScroll = async (page, tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 1) errs.push(`${tag}: desplazamiento horizontal (${ov}px)`);
    const modal = await page.evaluate(() => { const m = document.getElementById('modal'); return m ? m.scrollWidth - m.clientWidth : 0; });
    if (modal > 1) errs.push(`${tag}: la ventana se sale por los costados (${modal}px)`);
  };
  const shot = async (page, n, el) => { await page.waitForTimeout(300); if (el) await page.locator(el).first().screenshot({ path: path.join(out, 'logros_' + n + '.png') }); else await page.screenshot({ path: path.join(out, 'logros_' + n + '.png') }); };
  const toastTxt = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return t && t.style.display !== 'none' ? t.textContent : ''; });
  try {
    const { ctx, page } = await abrir({ width: 390, height: 844 }, vieja);
    await page.goto(BASE + '/?fecha=2026-10-10');
    await page.waitForTimeout(1800);
    await cerrarVentanas(page);
    // Un solo aviso de la partida vieja
    let vistos = [];
    for (let i = 0; i < 12; i++) { const t = await toastTxt(page); if (t && !vistos.includes(t)) vistos.push(t); await page.waitForTimeout(250); }
    const resumenToast = vistos.find((t) => /Tienes \d+ logros para reclamar/.test(t));
    if (!resumenToast) errs.push('no salió el aviso "Tienes N logros para reclamar": ' + JSON.stringify(vistos));
    else console.log('  ✔ aviso único: ' + resumenToast);
    if (vistos.some((t) => /Logro desbloqueado/.test(t))) errs.push('la partida vieja mostró toasts de cada logro');
    const st = await page.evaluate(() => { const s = window.__game.state; return { hechos: Object.keys(s.logros.hechos).length, resumen: s.logros.resumen, cola: s.logros.porMostrar.length }; });
    if (!(st.hechos >= 8 && st.resumen === 0 && st.cola === 0)) errs.push('estado después de la migración: ' + JSON.stringify(st));
    // Vitrina de Logros en la sede de Inicio: avisa "!" y su hoja trae la tarjeta
    const aviso = await page.evaluate(() => { const b = document.querySelector('.hs[data-hub="logros"] .hs-b'); return b ? b.textContent : ''; });
    if (aviso !== '!') errs.push('la vitrina de Logros no avisa "!" con logros por reclamar: ' + aviso);
    if (!(await verEnInicio(page, '.lo-card'))) errs.push('no aparece la tarjeta de Logros en la sede de Inicio');
    else {
      const cab = ((await page.textContent('#hubSheet .hub-sh-t')) + ' ' + (await page.textContent('#hubSheet .lo-card'))).replace(/\s+/g, ' ');
      if (!/Logros y combos/.test(cab) || !new RegExp(st.hechos + '/44 · 0 combos').test(cab)) errs.push('hoja de Logros: ' + cab);
      else console.log('  ✔ hoja de Logros en Inicio: ' + cab.trim().slice(0, 60));
    }
    await page.locator('.lo-card').scrollIntoViewIfNeeded();
    await shot(page, '01_tarjeta', '#hubSheet .hub-sh'); await noHScroll(page, 'tarjeta');
    // Ventana: lista de logros
    await page.locator('.lo-card [data-acc="abrir"].btn').click();
    await page.waitForSelector('#modal .lo-modal');
    await shot(page, '02_logros'); await noHScroll(page, 'logros');
    const nListos = await page.locator('#modal .lo-it.e-listo').count();
    if (nListos !== st.hechos) errs.push(`logros por reclamar en la lista: ${nListos} (esperado ${st.hechos})`);
    const m0 = await page.evaluate(() => window.__game.state.money);
    await page.locator('#modal .lo-it[data-logro="ev_10"] [data-acc="reclamar"]').click();
    await page.waitForTimeout(200);
    const m1 = await page.evaluate(() => window.__game.state.money);
    if (m1 !== m0 + 250) errs.push(`reclamar ev_10: dinero ${m0} → ${m1}`);
    if (!(await page.locator('#modal .lo-it.e-ok[data-logro="ev_10"]').count())) errs.push('ev_10 no quedó como reclamado');
    if (!/Reclamaste/.test(await toastTxt(page))) errs.push('sin mensaje al reclamar');
    await shot(page, '03_reclamado');
    // Pestaña de combos
    await page.locator('#modal [data-acc="tab"][data-t="combos"]').click();
    await page.waitForSelector('#modal .lo-fila');
    const filas = await page.locator('#modal .lo-fila').count();
    if (filas !== 16) errs.push('filas del libro: ' + filas);
    if (!(await page.locator('#modal .lo-cell.no').count())) errs.push('sin siluetas de combos por descubrir');
    await shot(page, '04_combos'); await noHScroll(page, 'combos');
    // Reclamar todo
    await page.locator('#modal [data-acc="tab"][data-t="logros"]').click();
    await page.locator('#modal .lo-modal > [data-acc="todo"]').click();
    await page.waitForTimeout(200);
    const pend = await page.evaluate(() => window.Logros.porReclamar(window.__game.state).logros.length);
    if (pend) errs.push('quedaron logros por reclamar después de "Reclamar todo": ' + pend);
    await page.locator('#modal [data-act="close"]').first().click();
    await page.waitForTimeout(200);
    // Toast después del resultado, nunca durante el evento: se juega un evento real
    await page.evaluate(() => { const s = window.__game.state; s.stats.events = 199; });
    const empezo = await page.evaluate(() => {
      const G = window.Game, s = window.__game.state;
      const c = s.contracts.find((x) => !x.internacional) || G.addContract(s, 'misa');
      const lo = G.suggestLoadout(s, c.id);
      const ok = G.startEvent(s, c.id, lo.staffIds, lo.equipIds).ok;
      localStorage.setItem('envivo_tycoon_save_v1', G.serialize(s));
      return ok;
    });
    if (!empezo) errs.push('no se pudo empezar el evento de prueba');
    await page.reload(); await page.waitForTimeout(1500);   // el juego abre el evento en curso
    if (!(await page.locator('#overlay.on').count())) errs.push('no se abrió la pantalla del evento');
    // Resolver imprevistos con la pantalla
    for (let i = 0; i < 10; i++) {
      const b = await page.$('#overlay.on [data-act="choose"]:not([disabled])');
      if (b) { await b.click(); await page.waitForTimeout(350); continue; }
      const n = await page.$('#overlay.on [data-act="next-inc"], #overlay.on [data-act="finish"]');
      if (n) { await n.click(); await page.waitForTimeout(500); continue; }
      break;
    }
    // Si la pantalla del evento usa otros botones, se termina con la lógica (lo que importa es el toast)
    const enCurso = await page.evaluate(() => !!window.__game.state.currentEvent);
    if (enCurso) {
      const t1 = await toastTxt(page);
      if (/Logro desbloqueado/.test(t1)) errs.push('toast de logro durante el evento en vivo');
      await page.evaluate(() => { const G = window.Game, s = window.__game.state; let inc; while ((inc = G.currentIncident(s))) G.resolveIncident(s, inc.choices.find((x) => x.ok).i); });
      const fin = await page.$('#overlay.on [data-act="finish"]');
      if (fin) { await fin.click(); await page.waitForTimeout(600); }
      else { await page.evaluate(() => { window.Game.finishEvent(window.__game.state); }); }
    }
    await page.waitForTimeout(600);
    const resultado = await page.locator('#overlay.on').count();
    const extraRes = await page.locator('#overlay.on .paylater.ext').allTextContents();
    if (resultado && !extraRes.some((x) => /Logro desbloqueado/.test(x))) errs.push('el resultado no muestra la línea del logro: ' + JSON.stringify(extraRes));
    if (resultado) await shot(page, '05_resultado');
    for (let i = 0; i < 6; i++) { const t = await toastTxt(page); if (/Logro desbloqueado/.test(t) && (await page.locator('#overlay.on').count())) { errs.push('toast con la ventana del resultado abierta'); break; } await page.waitForTimeout(150); }
    await cerrarVentanas(page);
    let tl = '';
    for (let i = 0; i < 12 && !/Logro desbloqueado/.test(tl); i++) { await page.waitForTimeout(250); tl = await toastTxt(page); }
    if (!/¡Logro desbloqueado! Maratón en vivo|logros desbloqueados/.test(tl)) errs.push('toast después del resultado: ' + JSON.stringify(tl));
    else console.log('  ✔ toast después del resultado: ' + tl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '06_toast');
    // Inglés
    await page.evaluate(async () => { await window.I18N.setIdioma('en'); });
    await page.waitForTimeout(600);
    await verEnInicio(page, '.lo-card [data-acc="abrir"].btn');
    await page.locator('.lo-card [data-acc="abrir"].btn').click();
    await page.waitForSelector('#modal .lo-modal');
    const titulo = await page.locator('#modal .lo-modal h2').textContent();
    if (!/Achievements/.test(titulo)) errs.push('título en inglés: ' + titulo);
    await shot(page, '07_ingles');
    await ctx.close();
    // Celular chico (360x780) con combos descubiertos
    const conCombos = (() => {
      const s = G.deserialize(vieja);
      s.logros.combos['misa.ptz'] = { dia: 30, e: 5 }; s.logros.combos['boxeo.ptz'] = { dia: 40, e: 4 }; s.logros.combos['funeral.fluido'] = { dia: 41, e: 5 };
      s.logros.libro.boxeo = { e: 4, q: 81, dia: 40, cams: 3, total: 3, personas: 6, cam: 'cam_panasonika_aw_uv22' };
      s.logros.resumen = 0; s.logros.porMostrar = [];
      return G.serialize(s);
    })();
    const p2 = await abrir({ width: 360, height: 780 }, conCombos);
    await p2.page.goto(BASE + '/?fecha=2026-10-10');
    await p2.page.waitForTimeout(1600);
    await cerrarVentanas(p2.page);
    await verEnInicio(p2.page, '.lo-card [data-acc="abrir"].btn');
    await p2.page.locator('.lo-card [data-acc="abrir"].btn').click();
    await p2.page.locator('#modal [data-acc="tab"][data-t="combos"]').click();
    await p2.page.waitForSelector('#modal .lo-fila');
    if ((await p2.page.locator('#modal .lo-cell.si').count()) !== 3) errs.push('combos descubiertos en la pantalla: ' + (await p2.page.locator('#modal .lo-cell.si').count()));
    if (!(await p2.page.locator('#modal .lo-fila.comp [data-acc="fila"]').count())) errs.push('la fila del funeral completa no se puede reclamar');
    await shot(p2.page, '08_combos_360'); await noHScroll(p2.page, 'combos 360');
    await p2.page.locator('#modal .lo-fila.comp [data-acc="fila"]').first().click();
    await p2.page.waitForTimeout(200);
    if (!(await p2.page.locator('#modal .lo-fila[data-fila="funeral"] .lo-ok-chk').count())) errs.push('la fila no quedó cobrada');
    await p2.page.locator('#modal [data-acc="tab"][data-t="logros"]').click();
    await shot(p2.page, '09_logros_360'); await noHScroll(p2.page, 'logros 360');
    await p2.ctx.close();
  } catch (e) { errs.push('excepción: ' + (e && e.stack || e)); }
  await browser.close();
  if (errs.length) { console.error('❌ Navegador:\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log('✅ Logros en el navegador OK (capturas en tests/capturas/logros_*.png)');
})();
