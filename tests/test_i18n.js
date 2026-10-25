/* Prueba de los idiomas del juego (js/i18n.js + js/lang/*.js).
   1) Diccionarios: cada clave del español existe en todos los idiomas, sin textos vacíos, con los mismos
      {marcadores} y solo categorías de plural que el idioma tiene.
   2) En un celular simulado (390x844 y 360x780), para cada idioma: elige el idioma con el botón de la cabecera,
      recorre todas las pestañas, abre "Preparar evento" y un imprevisto en vivo, y revisa: sin errores de JS,
      sin desplazamiento horizontal, sin claves sin traducir a la vista (p. ej. "nav.inicio") ni {marcadores}
      sueltos, y <html lang> correcto. Guarda tests/capturas/i18n_<código>.png (Inicio, 390x844).
   3) Los textos de la lógica pasan por TL(): con una sección `logica` de prueba, los nombres de eventos,
      el imprevisto y sus opciones salen "traducidos".
   Los idiomas distintos del español se cargan de forma perezosa: tras elegir uno se espera I18N.listo.
   Español primero (PLAN.md): mientras se desarrolla, los textos nuevos se agregan SOLO en js/lang/es.js. Una clave que
   está en español y falta en otro idioma es un AVISO ("pendiente de traducir: N claves, ej. …") y NO hace fallar la
   prueba (en pantalla sale en español: nunca la clave). Sigue siendo falla: textos vacíos, {marcadores} distintos,
   plurales que el idioma no tiene, claves sobrantes (que no están en español) y claves crudas a la vista.
   TRADUCCION_ESTRICTA=1 vuelve falla lo pendiente (fase final de traducción). Lista completa: node tools/pendientes_traduccion.js
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_i18n.js
         TRADUCCION_ESTRICTA=1 NODE_PATH=/opt/npm-tools/node_modules node tests/test_i18n.js */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
let fallas = 0, avisos = 0;
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✘ ' + m); } return c; };
const aviso = (m) => { avisos++; console.log('  ⚠ ' + m); };
// Claves en español que faltan en otro idioma: aviso (o falla con TRADUCCION_ESTRICTA=1)
const ESTRICTA = process.env.TRADUCCION_ESTRICTA === '1';
const pendientes = {};
const pendiente = (code, k) => { (pendientes[code] = pendientes[code] || []).push(k); if (ESTRICTA) ok(false, `${code}: "${k}" falta (pendiente de traducir; TRADUCCION_ESTRICTA=1)`); };
function avisarPendientes() {
  const n = Object.values(pendientes).reduce((a, l) => a + l.length, 0);
  if (!n) return;
  const ej = Object.entries(pendientes).flatMap(([c, l]) => l.slice(0, 2).map((k) => `${c}:${k}`)).slice(0, 4);
  const msg = `pendiente de traducir: ${n} claves, ej. ${ej.join(', ')} (${Object.entries(pendientes).map(([c, l]) => c + ' ' + l.length).join(', ')}) · lista: node tools/pendientes_traduccion.js`;
  if (ESTRICTA) console.log('  ✘ ' + msg); else aviso(msg);
}

/* ---------- 1) Diccionarios ---------- */
console.log('1) Diccionarios');
globalThis.I18N_LANG = {};
const I18N = require('../js/i18n.js');
const codes = I18N.idiomas.map((l) => l.code);
for (const c of codes) {
  const f = path.join(ROOT, 'js', 'lang', c + '.js');
  if (ok(fs.existsSync(f), `falta js/lang/${c}.js`)) require(f);
}
const D = globalThis.I18N_LANG;
const es = D.es;
const claves = Object.keys(es).filter((k) => k !== 'logica');
const marc = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join(',');
const variantes = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v) : []);
ok(codes.length >= 10, `hay ${codes.length} idiomas (se piden al menos 10)`);
ok(new Set(I18N.idiomas.map((l) => l.nombre)).size === codes.length, 'cada idioma tiene su nombre propio');
for (const c of codes) {
  const d = D[c];
  if (!ok(d && typeof d === 'object', `${c}: el archivo no registra I18N_LANG['${c}']`)) continue;
  ok(d.logica && typeof d.logica === 'object', `${c}: falta la sección logica`);
  const cats = new Intl.PluralRules(I18N.idiomas.find((l) => l.code === c).locale).resolvedOptions().pluralCategories;
  let malos = 0;
  for (const k of claves) {
    const v = d[k];
    if (v === undefined) { pendiente(c, k); malos++; continue; }   // sin traducir todavía: en pantalla sale el español
    const vs = variantes(v);
    if (!ok(vs.length && vs.every((x) => typeof x === 'string' && x.trim()), `${c}: "${k}" está vacío`)) { malos++; continue; }
    const base = typeof es[k] === 'string' ? es[k] : es[k].other;
    for (const x of vs) if (!ok(marc(x) === marc(base), `${c}: "${k}" marcadores ${marc(x) || '-'} ≠ ${marc(base) || '-'}`)) malos++;
    if (v && typeof v === 'object') {
      ok(typeof v.other === 'string', `${c}: "${k}" es plural y le falta "other"`);
      for (const cat of Object.keys(v)) ok(cats.includes(cat), `${c}: "${k}" usa el plural "${cat}" que ${c} no tiene`);
    }
  }
  for (const k of Object.keys(d)) ok(k === 'logica' || k in es, `${c}: clave sobrante "${k}"`);
  console.log(`  ${c}: ${claves.length - malos}/${claves.length} claves${pendientes[c] ? ` (${pendientes[c].length} pendientes de traducir)` : ''}`);
}
avisarPendientes();
// Motor: interpolación, plurales y respaldo
I18N.setIdioma('ru');
ok(I18N.T('req.camaras', { n: 1 }) === '1 камера' && I18N.T('req.camaras', { n: 3 }) === '3 камеры' && I18N.T('req.camaras', { n: 5 }) === '5 камер', 'plurales del ruso (1/3/5)');
I18N.setIdioma('en');
ok(I18N.T('inicio.eventos', { n: 1 }) === '1 event' && I18N.T('inicio.eventos', { n: 2 }) === '2 events', 'plurales del inglés');
ok(I18N.T('clave.que.no.existe') === 'clave.que.no.existe' && !I18N.T.has('clave.que.no.existe'), 'una clave inexistente devuelve la clave');
// Español primero: una clave que solo está en español sale en español (con {parámetros} y plurales), nunca la clave
es['prueba.solo_es'] = 'Solo en español {nombre}';
es['prueba.solo_es_n'] = { one: '{n} cosa', other: '{n} cosas' };
ok(I18N.T('prueba.solo_es', { nombre: 'Ana' }) === 'Solo en español Ana' && I18N.T.has('prueba.solo_es'), 'en: una clave que solo está en español sale en español');
ok(I18N.T('prueba.solo_es_n', { n: 1 }) === '1 cosa' && I18N.T('prueba.solo_es_n', { n: 3 }) === '3 cosas', 'en: plural que solo está en español sale en español');
D.en['prueba.vacia'] = '';
es['prueba.vacia'] = 'Respaldo';
ok(I18N.T('prueba.vacia') === 'Respaldo', 'en: un texto vacío usa el español');
delete es['prueba.solo_es']; delete es['prueba.solo_es_n']; delete es['prueba.vacia']; delete D.en['prueba.vacia'];
ok(I18N.TL('Texto sin traducir de la lógica') === 'Texto sin traducir de la lógica', 'TL devuelve el español si no hay traducción');
D.en.logica['Dron 4K'] = 'Drone 4K';
ok(I18N.TL('Dron 4K #0007') === 'Drone 4K #0007', 'TL traduce el nombre y deja el número de serie');
delete D.en.logica['Dron 4K'];
ok(I18N.money(1500) === '$1,500', `dinero en inglés: ${I18N.money(1500)}`);
I18N.setIdioma('es');
ok(I18N.money(1500) === '$1.500' && I18N.money(4.99, { dec: 2 }) === '$4,99', `dinero en español igual que antes: ${I18N.money(1500)} / ${I18N.money(4.99, { dec: 2 })}`);
ok(I18N.T('inicio.cinco_estrellas', { n: 2 }) === '2 de 5 estrellas', 'interpolación en español');
ok(I18N.mejor('pt-PT') === 'pt-BR' && I18N.mejor('zh-TW') === 'zh-CN' && I18N.mejor('de-AT') === 'de' && I18N.mejor('xx') === null, 'elige el idioma más parecido del navegador');

/* ---------- 2) En el navegador ---------- */
(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright no está instalado: se salta la parte del navegador'); return fin(); }
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const url = 'file://' + path.join(ROOT, 'index.html');
  const TABS = ['inicio', 'clientes', 'personal', 'bodega', 'tienda', 'online'];
  // Ventanas del arranque: intro del capítulo y, en fechas de temporada (Halloween, Navidad…), el resumen del día
  const cerrarInicio = async (page) => {
    for (let k = 0; k < 5; k++) {
      const b = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
      if (!(await b.count())) break;
      await b.first().click();
      await page.waitForTimeout(120);
    }
  };

  // Revisa la pantalla visible: claves crudas, marcadores sueltos y desplazamiento horizontal
  const revisar = (page, tag) => page.evaluate((tag) => {
    const out = [];
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const KEY = /^[a-z]+\.[a-z_.]+$/;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const t = n.nodeValue.trim();
      if (!t || !n.parentElement || !vis(n.parentElement) || n.parentElement.closest('svg,script,style')) continue;
      if (KEY.test(t) && !/\.(com|ec|net|org|app)$/.test(t)) out.push(`${tag}: clave sin traducir "${t}"`);
      if (/\{[a-z]+\}/.test(t)) out.push(`${tag}: marcador suelto en "${t.slice(0, 80)}"`);
    }
    document.querySelectorAll('[aria-label],[placeholder]').forEach((el) => {
      if (el.closest('svg')) return;
      for (const a of ['aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v && (KEY.test(v) || /\{[a-z]+\}/.test(v))) out.push(`${tag}: ${a} sin traducir "${v}"`); }
    });
    const ov = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (ov > 1) out.push(`${tag}: desplazamiento horizontal de ${ov}px`);
    const m = document.getElementById('modal');
    if (m && document.getElementById('overlay').classList.contains('on') && m.scrollWidth - m.clientWidth > 1) out.push(`${tag}: la ventana se desborda a lo ancho (${m.scrollWidth - m.clientWidth}px)`);
    // Avisos (no fallan): textos de la barra de abajo cortados con "…"
    const cortados = [...document.querySelectorAll('nav button')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim());
    return { errs: out, cortados };
  }, tag);

  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 780 }]) {
    console.log(`2) Navegador ${vp.width}x${vp.height}`);
    for (const code of codes) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vp.width === 390 ? 2 : 1, isMobile: true, hasTouch: true, locale: 'es-EC' });
      const page = await ctx.newPage();
      const errores = [];
      page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#overlay.on');
      const tag = `${code} ${vp.width}px`;
      const fallos = [];
      const cortes = new Set();
      const mirar = async (donde) => { const r = await revisar(page, `${tag} ${donde}`); fallos.push(...r.errs); r.cortados.forEach((t) => cortes.add(t)); };
      // La intro del capítulo (y el resumen del día si empieza una temporada), en español; luego se cambia el idioma
      await cerrarInicio(page);
      await page.click('#langBtn');
      await page.waitForSelector('#overlay.on [data-act="set-idioma"]');
      await page.click(`#overlay.on [data-act="set-idioma"][data-k="${code}"]`);
      // Los idiomas se cargan bajo pedido (solo el español viene con la página)
      await page.waitForFunction((c) => window.I18N.idioma === c, code, { timeout: 10000 }).catch(() => {});
      // El idioma puede llegar por carga perezosa (js/lang/<código>.js y js/lang/juego/<código>.js)
      await page.waitForFunction((c) => window.I18N.idioma === c, code, { timeout: 8000 }).catch(() => {});
      await page.evaluate(() => window.I18N.listo);
      const lang = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, cur: window.I18N.idioma, saved: localStorage.getItem('envivo_lang') }));
      ok(lang.lang === code && lang.cur === code && lang.saved === code, `${tag}: <html lang>=${lang.lang}, idioma=${lang.cur}, guardado=${lang.saved}`);
      const navTxt = await page.locator('nav button[data-tab="inicio"] em').textContent();
      ok(navTxt === D[code]['nav.inicio'], `${tag}: la barra de abajo cambió de idioma ("${navTxt}")`);
      await page.waitForTimeout(50);
      await mirar('inicio');
      await page.evaluate(() => { document.getElementById('toast').style.display = 'none'; });
      if (vp.width === 390) await page.screenshot({ path: path.join(outDir, `i18n_${code}.png`) });
      if (vp.width === 360 && ['de', 'ru'].includes(code)) await page.screenshot({ path: path.join(outDir, `i18n_${code}_360.png`) });
      for (const t of TABS.slice(1)) { await page.click(`nav button[data-tab="${t}"]`); await mirar(t); }
      // El registro completo se abre desde Inicio (su lugar en la barra lo tiene "En línea")
      await page.click('nav button[data-tab="inicio"]');
      await page.click('[data-act="tab"][data-tab="registro"]');
      await mirar('registro');
      // Preparar evento e imprevisto en vivo
      await page.click('nav button[data-tab="clientes"]');
      if (!(await page.locator('[data-act="prep"]').count())) await page.click('[data-act="mkt"][data-k="visitar"]');
      await page.locator('[data-act="prep"]').first().click();
      await page.waitForSelector('[data-act="go-live"]');
      await mirar('preparar');
      if (vp.width === 390 && ['de', 'ru', 'zh-CN'].includes(code)) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(outDir, `i18n_${code}_preparar.png`) }); }
      await page.click('[data-act="go-live"]');
      await page.waitForSelector('[data-act="choose"]');
      await mirar('en vivo');
      if (vp.width === 390 && ['de', 'ru', 'zh-CN'].includes(code)) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(outDir, `i18n_${code}_vivo.png`) }); }
      // Cambiar el idioma con la ventana del evento abierta no debe romper nada; al recargar, sigue el idioma elegido
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.I18N.listo);
      await page.waitForSelector('[data-act="choose"]');
      ok(await page.evaluate(() => window.I18N.idioma) === code, `${tag}: al recargar se mantiene el idioma`);
      await mirar('en vivo (recargado)');
      fallos.forEach((f) => ok(false, f));
      errores.forEach((e) => ok(false, `${tag}: ${e}`));
      if (cortes.size) aviso(`${tag}: textos de la barra cortados: ${[...cortes].join(', ')}`);
      console.log(`  ${fallos.length || errores.length ? '✘' : '✔'} ${tag}`);
      await ctx.close();
    }
  }

  /* ---------- 3) Los textos de la lógica pasan por TL() ---------- */
  console.log('3) Textos de la lógica por TL()');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    // Fecha fija fuera de temporada: en Halloween/Navidad el título de Inicio es el de la temporada, no el del capítulo
    await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-15'; try { localStorage.setItem('envivo_lang', 'en'); } catch (e) { /* nada */ } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.I18N.listo);
    await page.waitForSelector('#overlay.on');
    await page.waitForFunction(() => window.I18N_LANG && window.I18N_LANG.en, null, { timeout: 10000 });
    const capT = await page.locator('#overlay.on h2').first().textContent();
    await cerrarInicio(page);
    // Traducción de prueba: todos los nombres de eventos, clientes y equipos, más el capítulo actual
    await page.evaluate(() => {
      const G = window.Game, L = window.I18N_LANG.en.logica, mark = (s) => { if (s) L[s] = '«TL» ' + s; };
      Object.values(G.EVENT_TYPES).forEach((t) => { mark(t.name); (t.clients || []).forEach(mark); });
      Object.values(G.CATALOG).forEach((it) => { mark(it.name); mark(it.desc); });
      Object.values(G.CONSUMABLES).forEach((it) => { mark(it.name); mark(it.desc); });
      const ch = G.CHAPTERS[window.__game.state.chapter]; mark(ch.title); mark(ch.intro); mark(ch.goal);
      // El registro se vuelve a armar con su clave (G.tx, ya en inglés con js/lang/juego/en.js) y luego pasa por TL
      window.__game.state.log.forEach((l) => { mark(l.text); if (l.k) { try { mark(G.tx(l.k, l.p || undefined)); } catch (e) { /* nada */ } } });
      window.__game.state.equip.forEach((e) => mark(e.nick));
    });
    await page.evaluate(() => window.I18N.setIdioma('es'));
    await page.evaluate(() => { window.I18N.setIdioma('en'); return window.I18N.listo; });
    ok(capT && !capT.startsWith('«TL»'), 'sin traducción de la lógica, el capítulo se muestra tal cual');
    const h2 = await page.locator('#tab-inicio h2').first().textContent();
    ok(h2.startsWith('«TL»'), `título del capítulo pasa por TL (“${h2}”)`);
    const logs = await page.locator('#tab-inicio .log p').allTextContents();
    ok(logs.length && logs.every((t) => t.includes('«TL»')), 'el registro pasa por TL');
    await page.click('nav button[data-tab="clientes"]');
    const nombres = await page.locator('#tab-clientes .card h3').allTextContents();
    ok(nombres.length > 0 && nombres.every((t) => t.startsWith('«TL»')), `nombres de eventos pasan por TL (${nombres.length})`);
    await page.click('nav button[data-tab="bodega"]');
    const eq = await page.locator('#tab-bodega .gear .nm').allTextContents();
    ok(eq.length > 0 && eq.every((t) => t.startsWith('«TL»')), `nombres de equipos pasan por TL (${eq.length})`);
    await page.click('nav button[data-tab="clientes"]');
    await page.locator('[data-act="prep"]').first().click();
    await page.waitForSelector('[data-act="go-live"]');
    // El azar del juego tiene semilla: en una copia del estado se ve qué imprevisto saldrá y se le pone traducción de prueba
    await page.evaluate(() => {
      const G = window.Game, S = window.__game.state, L = window.I18N_LANG.en.logica;
      const cid = Number(document.querySelector('[data-act="prep"]').dataset.id);
      const S2 = G.deserialize(G.serialize(S));
      const sug = G.suggestLoadout(S2, cid);
      G.startEvent(S2, cid, sug.staffIds, sug.equipIds);
      const inc = G.currentIncident(S2);
      L[inc.text] = '«TL» incidente';
      inc.choices.forEach((c) => { L[c.label] = '«TL» ' + c.label; if (c.why) L[c.why] = '«TL» ' + c.why; });
    });
    await page.click('[data-act="go-live"]');
    await page.waitForSelector('[data-act="choose"]');
    const incTxt = await page.locator('#modal .incident').textContent();
    const labels = await page.locator('#modal [data-act="choose"]').allTextContents();
    ok(incTxt.trim() === '«TL» incidente', `el imprevisto pasa por TL (“${incTxt.trim().slice(0, 60)}”)`);
    ok(labels.length > 0 && labels.every((l) => l.trim().startsWith('«TL»')), 'las opciones del imprevisto pasan por TL');
    ok(errores.length === 0, 'sin errores de JS en la prueba de TL' + (errores.length ? ': ' + errores.join(' | ') : ''));
    await ctx.close();
  }
  await browser.close();
  fin();
})().catch((e) => { console.error('❌', e); process.exit(1); });

function fin() {
  if (Object.keys(pendientes).length && !ESTRICTA) console.log(`\n⚠ ${Object.values(pendientes).reduce((a, l) => a + l.length, 0)} claves pendientes de traducir (aviso: no es falla; TRADUCCION_ESTRICTA=1 para exigirlas)`);
  if (fallas) { console.error(`\n❌ ${fallas} fallas${avisos ? `, ${avisos} avisos` : ''}`); process.exit(1); }
  console.log(`\n✅ Idiomas OK (${Object.keys(globalThis.I18N_LANG).length} idiomas, ${Object.keys(globalThis.I18N_LANG.es).length - 1} claves)${avisos ? ` · ${avisos} avisos` : ''}`);
}
