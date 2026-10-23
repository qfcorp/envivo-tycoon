/* Prueba de la franja animada del evento en vivo (js/escena.js) dentro del juego real, en un celular simulado (390x844).
   No toca los archivos compartidos: sirve index.html y js/ui.js CON las líneas de server/INTEGRAR_ESCENA.md aplicadas
   en memoria (si una línea ya no calza con el archivo, la prueba falla y lo dice).
   Casos: textos de los 10 idiomas; jugar un evento tocando los botones (la franja sale arriba con el imprevisto, el reloj
   corre, la cámara se pone roja, después de elegir hay pulso verde/rojo); una escena por cada tipo de evento (también
   recargando en pleno evento); Escena.reaccion(); movimiento reducido (todo quieto); sin errores de JS.
   Uso:  node tests/test_escena.js   (capturas en tests/capturas/escena_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
const URL0 = BASE + '/index.html?fecha=2026-11-10';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Integración (las mismas líneas que server/INTEGRAR_ESCENA.md) ---------- */
function reemplazar(txt, ancla, nuevo, que) {
  if (txt.includes(nuevo)) return txt;   // ya integrada en el archivo real: se prueba tal cual
  if (!txt.includes(ancla)) throw new Error('No se encontró la línea de integración en ' + que + ': ' + ancla.slice(0, 90));
  return txt.replace(ancla, () => nuevo);
}
const ANCLA_HTML = '<script defer src="js/guia.js"></script>';
const LINEA_HTML = '<script defer src="js/escena.js"></script>';
const ANCLA_UI1 = '  function incKey() {';
const LINEAS_UI1 = `  // Franja animada de arriba (js/escena.js, opcional): el lugar, el público, los camarógrafos y el monitor de programa
  const escena = (c, e) => { try { return window.Escena ? window.Escena.html(c, e) : ''; } catch (err) { return ''; } };
  function incKey() {`;
const ANCLA_UI2 = '    openModal(`\n      ${liveScene(c.type, key)}';
const LINEAS_UI2 = "    openModal(`\n      ${escena(c, { fase: bueno ? 'momento' : 'imprevisto', clave: key, nombre: eventName(c.type) })}\n      ${liveScene(c.type, key)}";
const ANCLA_UI3 = "      ${liveScene(c.type, r.q > 4 ? 'epico'";
const LINEAS_UI3 = "      ${escena(c, { fase: r.q > 0 ? 'bien' : r.q < 0 ? 'mal' : '', clave: key, nombre: eventName(c.type) })}\n      ${liveScene(c.type, r.q > 4 ? 'epico'";
const pagina = reemplazar(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), ANCLA_HTML, ANCLA_HTML + '\n' + LINEA_HTML, 'index.html');
let uiJs = fs.readFileSync(path.join(RAIZ, 'js/ui.js'), 'utf8');
uiJs = reemplazar(uiJs, ANCLA_UI1, LINEAS_UI1, 'js/ui.js (ayudante)');
uiJs = reemplazar(uiJs, ANCLA_UI2, LINEAS_UI2, 'js/ui.js (showIncident)');
uiJs = reemplazar(uiJs, ANCLA_UI3, LINEAS_UI3, 'js/ui.js (choose)');

/* ---------- Textos y tipos (sin navegador) ---------- */
(function () {
  const g = { Game: { EVENT_TYPES: { tmp_procesion: { especial: true, escena: 'misa' } } } };   // un tipo de temporada (js/temporadas.js)
  new Function('window', 'globalThis', fs.readFileSync(path.join(RAIZ, 'js/escena.js'), 'utf8'))(g, g);   // eslint-disable-line no-new-func
  const E = g.Escena;
  const TX = E.TEXTOS;
  const claves = Object.keys(TX.es);
  ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'].forEach((c) => {
    const d = TX[c] || {};
    const faltan = claves.filter((k) => !d[k]);
    const sobran = Object.keys(d).filter((k) => !TX.es[k]);
    const largos = claves.filter((k) => d[k] && (c === 'zh-CN' ? d[k].length > 8 : d[k].length > 18));
    bien(!faltan.length && !sobran.length && !largos.length, `Textos ${c}: completos y cortos` + (faltan.length ? ' faltan ' + faltan : '') + (sobran.length ? ' sobran ' + sobran : '') + (largos.length ? ' largos ' + largos : ''));
  });
  const src = fs.readFileSync(path.join(RAIZ, 'js/escena.js'), 'utf8');
  bien(!/MegaVisi|Netflix|YouTube|Twitch|Sony|Canon|FIFA|CONMEBOL|LigaPro|Copa Libertadores|Barcelona SC|Emelec|Nike|Adidas|Toyota|Chevrolet/i.test(src.replace(/ligapro/g, '')), 'Sin marcas ni ligas reales en js/escena.js');
  const esperado = { misa: 'misa', funeral: 'funeral', boda: 'boda', prensa: 'prensa', irl: 'irl', barrial: 'barrial', graduacion: 'graduacion', lucha_libre: 'lucha',
    lanzamiento: 'lanzamiento', boxeo: 'boxeo', lanzamiento_autos: 'autos', concierto: 'concierto', ligapro: 'ligapro', final: 'final',
    internacional_unilateral: 'internacional', internacional_host: 'final', tmp_procesion: 'misa', algo_raro: 'prensa' };
  const mal = Object.keys(esperado).filter((t) => E.tipo(t) !== esperado[t]);
  bien(!mal.length, 'Cada tipo de evento tiene su escena' + (mal.length ? ' — mal: ' + mal.map((t) => t + '→' + E.tipo(t)).join(', ') : ''));
  bien(E.html({}, {}) === '' || typeof E.html({}, {}) === 'string', 'Escena.html sin navegador no rompe');
})();

/* ---------- Navegador ---------- */
const errores = [];
async function abrir(browser, op) {
  op = op || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'es-EC', reducedMotion: op.reduce ? 'reduce' : 'no-preference' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname === '/js/ui.js') return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: uiJs });
    if (u.pathname.startsWith('/api')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const f = path.join(RAIZ, decodeURIComponent(u.pathname));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f);
      const tipo = { '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  const tag = op.tag || 'escena';
  page.on('pageerror', (e) => errores.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(URL0, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  await page.waitForLoadState('load');
  return { ctx, page };
}
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `escena_${n}.png`) });
// Franja: dónde está, qué muestra y cuántas animaciones corren
const franja = (page) => page.evaluate(() => {
  const m = document.querySelector('#overlay.on #modal');
  const e = m && m.querySelector('.esc');
  if (!e) return null;
  const r = e.getBoundingClientRect(), mr = m.getBoundingClientRect();
  const mon = e.querySelector('.esc-mon').getBoundingClientRect();
  const badge = e.querySelector('.esc-badge');
  const anims = document.getAnimations().filter((a) => a.effect && a.effect.target && e.contains(a.effect.target) && a.playState === 'running');
  return {
    escena: e.dataset.escena, fase: e.dataset.fase, primero: m.firstElementChild === e, clases: e.className,
    alto: Math.round(r.height), ancho: Math.round(r.width), dentro: r.left >= mr.left - 1 && r.right <= mr.right + 1 && r.right <= innerWidth,
    monAncho: Math.round(mon.width), reloj: (e.querySelector('.esc-reloj') || {}).textContent || '',
    badge: badge ? badge.textContent.trim() : '', badgeOp: badge ? Number(getComputedStyle(badge).opacity) : 0,
    badgeDentro: badge ? (() => { const b = badge.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right; })() : true,
    cam2Roja: (() => { const c = e.querySelector('.esc-cam2 .esc-cbody'); return c ? getComputedStyle(c).fill : ''; })(),
    alerta: (() => { const a = e.querySelector('.esc-cam2 .esc-alerta'); return a ? Number(getComputedStyle(a).opacity) : 0; })(),
    bug: (e.querySelector('.esc-bug') || {}).textContent || '', intl: !!e.querySelector('.esc-intl'),
    usos: e.querySelectorAll('use').length, anims: anims.length,
    hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
// Pone en la partida un evento del tipo pedido (con todo el personal y los equipos) y recarga en pleno evento
async function eventoDeTipo(page, ty, extra) {
  const ok = await page.evaluate(({ ty, extra }) => {
    const G = window.Game, S = window.__game.state;
    S.currentEvent = null;
    const def = G.EVENT_TYPES[ty];
    if (!def) return 'no existe el tipo ' + ty;
    const id = 90000 + Math.floor(Math.random() * 9000);
    S.contracts.push({ id, type: ty, client: 'Cliente de prueba', cams: 1, audio: !!def.audio, stream: true, outdoor: false, diff: def.diff || 1, pay: 500,
      daysLeft: 3, rival: false, story: false });
    const r = G.startEvent(S, id, S.staff.map((p) => p.id), S.equip.map((e) => e.id));
    if (!r.ok) return r.msg;
    Object.assign(S.currentEvent.contract, extra || {});
    localStorage.setItem('envivo_tycoon_save_v1', G.serialize(S));
    localStorage.removeItem('envivo_resultado_pendiente');
    return true;
  }, { ty, extra: extra || null });
  if (ok !== true) return ok;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  await page.waitForSelector('#overlay.on #modal .esc', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(700);
  return true;
}

(async () => {
  const browser = await chromium.launch();

  /* ===== 1. Partida nueva: jugar el primer evento tocando los botones ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'flujo' });
    await page.waitForSelector('#overlay.on');
    await page.locator('#overlay.on [data-act="close"]').first().click();
    await page.locator('nav button[data-tab="clientes"]').click();
    await page.locator('[data-act="prep"]').first().click();
    await page.waitForSelector('[data-act="go-live"]');
    if (await page.locator('[data-act="go-live"][disabled]').count()) await page.locator('[data-act="auto"]').first().click();
    await page.locator('[data-act="go-live"]').first().click();
    await page.waitForSelector('#overlay.on [data-act="choose"]');
    await page.waitForTimeout(900);
    const f = await franja(page);
    bien(f && f.primero, 'La franja sale arriba de la ventana del evento en vivo' + (f ? ` (${f.escena}, ${f.ancho}x${f.alto})` : ' — no está'));
    if (f) {
      bien(f.fase === 'imprevisto' || f.fase === 'momento', `Con el imprevisto la franja avisa (fase ${f.fase}, "${f.badge}")`);
      bien(f.badge && f.badgeOp > 0.3 && f.badgeDentro, 'El aviso se ve entero dentro de la franja');
      if (f.fase === 'imprevisto') bien(/255, 59, 59|212, 42, 48|rgb\(212/.test(f.cam2Roja) || f.alerta > 0.2, `La cámara 2 se pone roja (${f.cam2Roja}, alerta ${f.alerta})`);
      bien(f.alto >= 70 && f.alto <= 90 && f.dentro && f.monAncho >= 110, `Tamaño cómodo en 390 px: ${f.ancho}x${f.alto}, monitor ${f.monAncho}px de ancho`);
      bien(/EN VIVO/.test(f.bug), 'El monitor muestra el "EN VIVO"');
      bien(f.usos === 2, 'El monitor muestra el mismo lugar (2 planos: abierto y cerrado)');
      bien(f.anims >= 25 && f.anims <= 160, `Se mueve: ${f.anims} animaciones (solo transform y opacity)`);
      bien(f.hscroll <= 1, 'Sin desplazamiento horizontal');
    }
    await shot(page, '01_imprevisto');
    // El reloj corre
    const r1 = f ? f.reloj : '';
    await page.waitForTimeout(2100);
    const r2 = await page.evaluate(() => (document.querySelector('.esc-reloj') || {}).textContent);
    bien(/^\d\d:\d\d:\d\d$/.test(r2) && r2 !== r1, `El reloj del programa corre (${r1} → ${r2})`);
    // Los cortes de cámara: a los 4,5 s el monitor pasa a CAM 2 y cambia el tally
    await page.waitForTimeout(2700);
    const corte = await page.evaluate(() => ({ c2: Number(getComputedStyle(document.querySelector('.esc-c2')).opacity), t2: Number(getComputedStyle(document.querySelector('.esc-cam2 .esc-tally')).opacity) }));
    await shot(page, '02_corte_cam2');
    bien(corte.c2 > 0.5 && corte.t2 > 0.5, `Corte a la cámara 2: el monitor y la luz de tally cambian (${JSON.stringify(corte)})`);
    // Elegir una solución → pulso
    await page.locator('#overlay.on [data-act="choose"]:not([disabled])').first().click();
    await page.waitForSelector('#overlay.on [data-act="next-inc"], #overlay.on [data-act="finish"]');
    await page.waitForTimeout(350);
    const g = await franja(page);
    const q = await page.evaluate(() => { const d = document.querySelector('#overlay.on .delta'); return d ? Number(d.textContent.replace(/[^\d-]/g, '')) : 0; });
    bien(g && g.primero, 'Después de elegir sigue la franja arriba');
    if (g) bien((q > 0 && g.fase === 'bien') || (q < 0 && g.fase === 'mal') || (q === 0 && g.fase === 'neutro'), `Después de elegir: ${q > 0 ? 'pulso verde' : q < 0 ? 'pulso rojo' : 'sin pulso'} (calidad ${q}, fase ${g.fase}, "${g.badge}")`);
    await shot(page, '03_despues_de_elegir');
    // Escena.reaccion repite una reacción en la franja puesta
    const re = await page.evaluate(() => { const ok1 = window.Escena.reaccion(document.getElementById('modal'), 'mal'); const e = document.querySelector('.esc'); return { ok1, fase: e.dataset.fase, cls: e.classList.contains('esc-r-mal'), badge: (e.querySelector('.esc-badge') || {}).textContent }; });
    bien(re.ok1 && re.fase === 'mal' && re.cls && re.badge === 'Salió mal', 'Escena.reaccion(el, "mal") pone el pulso rojo y su aviso');
    await page.waitForTimeout(250);
    await shot(page, '04_reaccion_mal');
    const re2 = await page.evaluate(() => { window.Escena.reaccion(document.querySelector('.esc'), 'bien'); const e = document.querySelector('.esc'); return { fase: e.dataset.fase, n: e.querySelectorAll('.esc-badge').length }; });
    bien(re2.fase === 'bien' && re2.n === 1, 'Escena.reaccion(el, "bien") cambia el pulso sin duplicar el aviso');
    await page.waitForTimeout(250);
    await shot(page, '05_reaccion_bien');
    await ctx.close();
  }

  /* ===== 2. Una escena por tipo de evento (recargando en pleno evento → y después de elegir) ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'tipos' });
    const TIPOS = [['misa', 'misa'], ['funeral', 'funeral'], ['boda', 'boda'], ['graduacion', 'graduacion'], ['barrial', 'barrial'], ['ligapro', 'ligapro'],
      ['final', 'final'], ['boxeo', 'boxeo'], ['lucha_libre', 'lucha'], ['concierto', 'concierto'], ['prensa', 'prensa'], ['lanzamiento', 'lanzamiento'],
      ['lanzamiento_autos', 'autos'], ['irl', 'irl'], ['internacional_unilateral', 'internacional'], ['internacional_host', 'final']];
    const vistas = new Set();
    for (const [ty, kind] of TIPOS) {
      const extra = /^internacional/.test(ty) ? { internacional: true, pais: 'Chile' } : null;
      const ok = await eventoDeTipo(page, ty, extra);
      if (ok !== true) { bien(false, `${ty}: no se pudo empezar el evento (${ok})`); continue; }
      const f = await franja(page);
      bien(f && f.escena === kind && f.primero && f.anims >= 20, `${ty}: escena "${kind}" arriba al recargar en pleno evento` + (f ? ` (${f.escena}, ${f.anims} animaciones${f.intl ? ', internacional' : ''})` : ' — no está'));
      if (extra) bien(f && f.intl, `${ty}: el monitor marca que es internacional`);
      if (f) vistas.add(f.escena);
      await shot(page, 'tipo_' + ty);
      const ch = page.locator('#overlay.on [data-act="choose"]:not([disabled])');
      if (await ch.count()) {
        await ch.first().click();
        await page.waitForSelector('#overlay.on [data-act="next-inc"], #overlay.on [data-act="finish"]');
        const g = await franja(page);
        bien(g && g.escena === kind && g.primero, `${ty}: después de elegir sigue la misma escena (fase ${g && g.fase})`);
      }
    }
    bien(vistas.size >= 14, `Escenas distintas vistas: ${vistas.size} (${[...vistas].join(', ')})`);
    // Imprevistos con efecto en el monitor: sin luz (pantalla negra) y sin señal (ruido); lluvia
    const efectos = await page.evaluate(() => {
      const h = (k) => { const d = document.createElement('div'); d.innerHTML = window.Escena.html({ type: 'concierto', id: 1 }, { fase: 'imprevisto', clave: k }); document.getElementById('modal').prepend(d); const e = d.firstElementChild; const r = { negro: e.classList.contains('esc-mon-negro'), ruido: e.classList.contains('esc-mon-ruido'), lluvia: !!e.querySelector('.esc-lluvia'), icono: !!e.querySelector('.esc-badge .ico') }; d.remove(); return r; };
      return { luz: h('luz'), internet: h('internet'), lluvia: h('lluvia') };
    });
    bien(efectos.luz.negro && efectos.internet.ruido && efectos.lluvia.lluvia && efectos.luz.icono, 'Sin luz → monitor negro; sin internet → ruido; lluvia → gotas; con ícono del imprevisto');
    // Captura con "sin luz" puesto en la ventana real
    await page.evaluate(() => { const m = document.getElementById('modal'); const e = m.querySelector('.esc'); const c = (window.__game.state.currentEvent || {}).contract || { type: 'boda', id: 7 }; if (e) e.outerHTML = window.Escena.html(c, { fase: 'imprevisto', clave: 'luz' }); });
    await page.waitForTimeout(500);
    await shot(page, '06_sin_luz');
    await ctx.close();
  }

  /* ===== 3. Movimiento reducido: todo quieto ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'reducido', reduce: true });
    const ok = await eventoDeTipo(page, 'concierto');
    const f = await franja(page);
    bien(ok === true && f && f.escena === 'concierto', 'Con movimiento reducido la franja sale igual');
    if (f) {
      bien(f.anims === 0, `Con movimiento reducido no hay animaciones (${f.anims})`);
      bien(f.badge && f.badgeOp > 0.9, 'Con movimiento reducido el aviso se ve fijo');
      const r1 = f.reloj;
      await page.waitForTimeout(1500);
      const r2 = await page.evaluate(() => document.querySelector('.esc-reloj').textContent);
      bien(r1 === r2, `Con movimiento reducido el reloj queda fijo (${r1})`);
    }
    await shot(page, '07_reducido');
    await ctx.close();
  }

  /* ===== 4. Otro idioma ===== */
  {
    const { ctx, page } = await abrir(browser, { tag: 'idioma' });
    const r = await page.evaluate(async () => {
      if (!window.I18N || !window.I18N.setIdioma) return null;
      window.I18N.setIdioma('en');
      await window.I18N.listo;
      return window.I18N.idioma;
    });
    if (r === 'en') {
      await eventoDeTipo(page, 'ligapro');
      const f = await franja(page);
      bien(f && /LIVE/.test(f.bug) && (f.badge === 'Trouble!' || f.badge === 'Big moment!'), `En inglés: "${f && f.bug}" y "${f && f.badge}"`);
      await shot(page, '08_ingles');
    } else console.log('   (no se pudo cambiar el idioma desde la prueba: se revisan solo los textos)');
    await ctx.close();
  }

  await browser.close();
  bien(!errores.length, 'Sin errores de JS' + (errores.length ? ':\n   ' + errores.join('\n   ') : ''));
  console.log(`\n${bien_} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
