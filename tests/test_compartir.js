/* Prueba de js/compartir.js (calificar, compartir por WhatsApp / imagen, novedades) dentro del juego real, en un celular
   simulado (390x844) con Playwright. No toca los archivos compartidos: sirve index.html y js/ui.js CON las líneas de
   server/INTEGRAR_COMPARTIR.md aplicadas en memoria (si una línea ya no calza con el archivo, la prueba falla y lo dice).
   Uso:  node tests/test_compartir.js   (capturas en tests/capturas/compartir_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { verEnInicio } = require('./hub_ayuda');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
const URL0 = BASE + '/index.html?fecha=2026-11-10';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Integración (las mismas líneas que server/INTEGRAR_COMPARTIR.md) ---------- */
function reemplazar(txt, ancla, nuevo, que) {
  if (txt.includes(nuevo)) return txt;   // ya integrada en el archivo real: se prueba tal cual
  const clave = nuevo.split('\n').find((l) => /Compartir/.test(l));
  if (clave && txt.includes(clave.trim())) return txt;   // integrada junto a otras líneas (p. ej. el botón de Discord)
  if (!txt.includes(ancla)) throw new Error('No se encontró la línea de integración en ' + que + ': ' + ancla.slice(0, 80));
  return txt.replace(ancla, () => nuevo);
}
const H1 = '<script defer src="js/googleplay.js"></script>';
const pagina = reemplazar(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), H1, H1 + '\n<script defer src="js/compartir.js"></script>', 'index.html');
let uiJs = fs.readFileSync(path.join(RAIZ, 'js/ui.js'), 'utf8');
const U3a = "      <p class=\"small muted\">${T('res.desgaste')}</p>\n      <button class=\"btn main\" data-act=\"after-result\">";
const U3b = "      <p class=\"small muted\">${T('res.desgaste')}</p>\n      ${window.Compartir ? window.Compartir.resultado(r, fresh, ctxInicio()) : ''}\n      <button class=\"btn main\" data-act=\"after-result\">";
const U4a = "        else { lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); }\n        break;";
const U4b = "        else { lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); }\n        if (window.Compartir) window.Compartir.trasResultado(ctxInicio());   // calificar tras un 5⭐ (espera a que la pantalla esté libre)\n        break;";
const U5a = '      ${soporteBtn()}\n      <button class="btn" data-act="new-game" style="margin-bottom:20px">';
const U5b = "      ${soporteBtn()}\n      ${window.Compartir ? window.Compartir.inicio(ctxInicio()) : ''}\n      <button class=\"btn\" data-act=\"new-game\" style=\"margin-bottom:20px\">";
const U6a = "m: M(-bankruptAt()) })}</div>`;";
const U6b = "m: M(-bankruptAt()) })}${window.Compartir ? window.Compartir.ayuda() : ''}</div>`;";
uiJs = reemplazar(uiJs, U3a, U3b, 'js/ui.js (showResult)');
uiJs = reemplazar(uiJs, U4a, U4b, 'js/ui.js (after-result)');
uiJs = reemplazar(uiJs, U5a, U5b, 'js/ui.js (renderInicio)');
uiJs = reemplazar(uiJs, U6a, U6b, 'js/ui.js (ayuda de la Historia)');
// El documento de integración trae exactamente estas líneas
(function () {
  const md = fs.readFileSync(path.join(RAIZ, 'server/INTEGRAR_COMPARTIR.md'), 'utf8');
  const lineas = [U3b, U4b, U5b, U6b].map((x) => x.split('\n').find((l) => /Compartir/.test(l)).trim());
  bien(lineas.every((l) => md.includes(l)) && md.includes('<script defer src="js/compartir.js"></script>'), 'INTEGRAR_COMPARTIR.md trae las mismas líneas que prueba esta prueba');
})();

/* ---------- Textos ---------- */
const CODIGOS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
let CP = null;
(function () {
  const g = {};
  new Function('window', 'globalThis', fs.readFileSync(path.join(RAIZ, 'js/compartir.js'), 'utf8'))(g, g);   // eslint-disable-line no-new-func
  CP = g.Compartir;
  const TX = CP.TEXTOS;
  const claves = Object.keys(TX.es);
  CODIGOS.forEach((c) => {
    const d = TX[c] || {};
    const faltan = claves.filter((k) => !d[k]);
    const sobran = Object.keys(d).filter((k) => !TX.es[k]);
    const params = claves.filter((k) => d[k] && (TX.es[k].match(/\{\w+\}/g) || []).sort().join() !== (d[k].match(/\{\w+\}/g) || []).sort().join());
    bien(!faltan.length && !sobran.length && !params.length, `Textos ${c}: completos y con los mismos {parámetros}` + (faltan.length ? ' faltan ' + faltan : '') + (sobran.length ? ' sobran ' + sobran : '') + (params.length ? ' params ' + params : ''));
  });
  const ult = CP.NOVEDADES[0];
  bien(ult && ult.items.length >= 5 && ult.items.length <= 10, `Novedades: la última trae ${ult ? ult.items.length : 0} cosas (entre 5 y 10)`);
  const faltanNov = [];
  ult.items.forEach((it, i) => CODIGOS.forEach((c) => { if (!it.t[c]) faltanNov.push(i + ':' + c); }));
  bien(!faltanNov.length, 'Novedades: la última está en los 10 idiomas' + (faltanNov.length ? ' faltan ' + faltanNov : ''));
  const largas = [];
  ult.items.forEach((it) => CODIGOS.forEach((c) => { const s = it.t[c] || ''; if (c === 'zh-CN' ? s.length > 30 : s.split(/\s+/).length > 13) largas.push(c + ': ' + s); }));
  bien(!largas.length, 'Novedades: cada línea es corta (máx. 13 palabras)' + (largas.length ? ' largas ' + largas.join(' | ') : ''));
  const ids = CP.NOVEDADES.map((n) => n.id);
  bien(new Set(ids).size === ids.length, 'Novedades: ids únicos');
  // Política de Google Play: nada de "¿te gusta?" ni de premios por reseñar en la ventana de calificar
  const cal = CODIGOS.map((c) => [TX[c].cal_t, TX[c].cal_x, TX[c].cal_play, TX[c].cal_sug].join(' ')).join(' ');
  bien(!/gust|like|enjoy|gost|aime|gefällt|piace|нрав|beğen|suka|喜欢|5 ?⭐|five stars|5 estrellas|premio|reward|gratis|free/i.test(cal), 'Calificar: sin preguntar si le gusta, sin pedir 5 estrellas ni dar premios');
  bien(CP.PLAY_URL === 'https://play.google.com/store/apps/details?id=com.tukanec.envivo', 'Enlace de la tienda correcto');
})();

/* ---------- Navegador ---------- */
const errores = [];
async function abrir(browser, op) {
  op = op || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: op.locale || 'es-EC' });
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
  await ctx.addInitScript((o) => {
    if (o.forzar) window.__ENVIVO_COMPARTIR = true;
    if (o.demo) window.__ENVIVO_DEMO = o.demo;
    window.__compartirNoNavegar = true;
    window.__abiertos = [];
    window.open = (u) => { window.__abiertos.push(u); return { closed: false }; };
    if (o.share) {
      window.__compartidos = [];
      navigator.share = async (d) => {
        const r = { text: d.text || '', url: d.url || '', files: [] };
        for (const f of d.files || []) {
          const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
          r.files.push({ name: f.name, type: f.type, size: f.size, b64 });
        }
        window.__compartidos.push(r);
      };
      navigator.canShare = (d) => !!d;
    }
    if (!sessionStorage.getItem('pre')) {
      sessionStorage.setItem('pre', '1');
      Object.keys(o.ls || {}).forEach((k) => localStorage.setItem(k, o.ls[k]));
    }
  }, { forzar: op.forzar !== false, demo: op.demo || null, ls: op.ls || {}, share: !!op.share });
  const page = await ctx.newPage();
  const tag = op.tag || 'compartir';
  page.on('pageerror', (e) => errores.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(BASE + '/index.html' + (op.query || '?fecha=2026-11-10'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Compartir, null, { timeout: 15000 });
  await page.waitForLoadState('load');
  return { ctx, page };
}
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `compartir_${n}.png`) });
const hayModal = (page, sel) => page.evaluate((s) => !!document.querySelector('#overlay.on ' + s), sel);
async function cerrarVentanas(page, max) {
  // Cierra lo que salga solo (intro del capítulo, resumen del día, historia...) como lo haría una persona; no las nuestras
  for (let k = 0; k < (max || 5); k++) {
    const v = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on .btn.main[data-act="close"], #overlay.on [data-act="demo-no"]');
    if (await page.locator('#overlay.on .cmp-nov, #overlay.on .cmp-cal').count()) return;
    if (await v.count()) { await v.first().click(); await page.waitForTimeout(150); } else return;
  }
}
// Juega un evento de la carrera hasta el resultado (el último paso queda en 5⭐ si se pidió)
async function jugarEvento(page, cinco) {
  if (cinco) {
    await page.evaluate(() => {
      if (window.__f0) return;
      window.__f0 = window.Game.finishEvent;
      window.Game.finishEvent = function () { const f = window.__f0.apply(this, arguments); if (f && f.result) { f.result.stars = 5; f.result.quality = Math.max(90, f.result.quality); } return f; };
    });
  }
  for (let intento = 0; intento < 6; intento++) {
    await cerrarVentanas(page);
    await page.click('nav button[data-tab="clientes"]');
    const n = await page.locator('#tab-clientes [data-act="prep"]').count();
    if (n) break;
    const vis = page.locator('[data-act="mkt"][data-k="visitar"]');
    if (await vis.count()) await vis.first().click(); else await page.click('[data-act="next-day"]').catch(() => {});
  }
  await page.locator('#tab-clientes [data-act="prep"]').first().click();
  await page.waitForSelector('#overlay.on [data-act="go-live"]');
  if (await page.locator('#overlay.on [data-act="go-live"][disabled]').count()) {
    const au = page.locator('#overlay.on [data-act="auto"]');
    if (await au.count()) await au.first().click();
  }
  await page.click('#overlay.on [data-act="go-live"]');
  for (let k = 0; k < 10; k++) {
    await page.waitForSelector('#overlay.on [data-act="choose"], #overlay.on [data-act="next-inc"], #overlay.on [data-act="finish"], #overlay.on [data-act="after-result"]', { timeout: 15000 });
    if (await page.locator('#overlay.on [data-act="after-result"]').count()) break;
    const ch = page.locator('#overlay.on [data-act="choose"]:not([disabled])');
    if (await ch.count()) { await ch.first().click(); continue; }
    await page.locator('#overlay.on [data-act="next-inc"], #overlay.on [data-act="finish"]').first().click();
  }
  await page.waitForSelector('#overlay.on [data-act="after-result"]');
}
const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);

(async () => {
  const browser = await chromium.launch();
  const NOV_ID = CP.NOVEDADES[0].id;
  try {
    /* 1) Partida nueva: no salen novedades (las marca vistas); Inicio con WhatsApp */
    {
      const { ctx, page } = await abrir(browser, { tag: 'nueva' });
      await page.waitForTimeout(3200);
      bien(!(await hayModal(page, '.cmp-nov')), 'Partida nueva: no salen las novedades solas');
      bien(await page.evaluate((id) => JSON.parse(localStorage.getItem('envivo_novedades_visto')) === id, NOV_ID), 'Partida nueva: quedan marcadas como vistas');
      await cerrarVentanas(page);
      await verEnInicio(page, '.cmp-ini [data-acc="wa-ini"]');   // en la hoja "Más" de la sede (js/hub.js)
      const wa = page.locator('#tab-inicio .cmp-ini [data-acc="wa-ini"]');
      bien(await wa.count() === 1, 'Inicio: botón "Compartir por WhatsApp"');
      bien(!(await page.locator('#tab-inicio .cmp-ini [data-acc="img-ini"]').count()), 'Inicio: sin Web Share no sale "Compartir imagen"');
      await wa.scrollIntoViewIfNeeded();
      await shot(page, '01_inicio');
      await wa.click();
      const u = await page.evaluate(() => window.__compartirUltimo);
      const txt = u && u.url ? decodeURIComponent(u.url.split('?text=')[1] || '') : '';
      bien(u && /^https:\/\/wa\.me\/\?text=/.test(u.url) && txt.includes('https://juego.tukanec.com/') && !txt.includes('?ref=') && !/productora\s+mi productora/i.test(txt) && !/\s[,.:!?]/.test(txt), 'WhatsApp desde Inicio: wa.me con mensaje y enlace al juego (sin cuenta: sin ?ref) → ' + txt.slice(0, 90));
      bien(await page.evaluate(() => window.__abiertos.length === 1), 'Web: se abre en otra pestaña (el juego no se va)');
      // Con cuenta: ?ref=<código>
      await page.evaluate(() => { window.Api.estado = Object.assign({}, window.Api.estado || {}, { logueado: true, jugador: { id: 12345, nombre: 'X' } }); });
      bien(await page.evaluate(() => window.Compartir.enlace()) === 'https://juego.tukanec.com/?ref=p9ix', 'Con cuenta: enlace con ?ref=p + id en base 36');
      await page.evaluate(() => { window.Api.estado.ref_codigo = 'ABC-12'; });
      bien(await page.evaluate(() => window.Compartir.enlace()) === 'https://juego.tukanec.com/?ref=ABC-12', 'Si el servidor manda ref_codigo, se usa ese');
      // Fila Ayuda → Novedades (a mano siempre se puede)
      await verEnInicio(page, '[data-acc="nov"]');   // ayuda: en la oficina de la Historia
      const nb = page.locator('#tab-inicio #hubSheet[data-lugar="historia"] [data-acc="nov"]');
      bien(await nb.count() === 1, 'Inicio → Ayuda: botón "Novedades"');
      await nb.scrollIntoViewIfNeeded(); await nb.click();
      bien(await hayModal(page, '.cmp-nov li'), 'Novedades desde Ayuda: se abre la ventana');
      bien(await sinScrollH(page), 'Sin desplazamiento horizontal');
      await page.click('#overlay.on .cmp-nov .btn.main[data-act="close"]');
      bien(!(await hayModal(page, '.cmp-nov')), 'Novedades: "¡Genial!" cierra');
      await ctx.close();
    }

    /* 2) Partida avanzada (demo cap. 4): las novedades salen solas UNA vez y nunca encima de otra ventana */
    {
      const { ctx, page } = await abrir(browser, { tag: 'veterano', demo: 'cap4', share: true });
      await page.waitForTimeout(400);
      const otra = await page.evaluate(() => document.getElementById('overlay').classList.contains('on') && !document.querySelector('.cmp-nov'));
      await page.waitForTimeout(2600);
      if (otra) bien(!(await hayModal(page, '.cmp-nov')) || !(await page.evaluate(() => !!document.querySelector('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"]'))), 'Novedades: no salen encima de otra ventana abierta');
      await cerrarVentanas(page);
      await page.waitForSelector('#overlay.on .cmp-nov', { timeout: 8000 }).catch(() => {});
      bien(await hayModal(page, '.cmp-nov'), 'Partida avanzada: "Lo nuevo en EN VIVO" sale sola al quedar la pantalla libre');
      const n = await page.locator('#overlay.on .cmp-nov li').count();
      bien(n === CP.NOVEDADES[0].items.length, `Novedades: ${n} líneas`);
      await shot(page, '02_novedades');
      await page.click('#overlay.on .cmp-nov .btn.main[data-act="close"]');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game && window.__game.state && window.Compartir);
      await page.waitForTimeout(3000);
      bien(!(await hayModal(page, '.cmp-nov')), 'Novedades: al recargar no vuelven a salir');

      // Evento de 5⭐ (con 3 eventos o más): bloque de compartir y luego la calificación
      await page.evaluate(() => { localStorage.removeItem('envivo_calificar_v1'); });
      const ev0 = await page.evaluate(() => window.__game.state.stats.events);
      bien(ev0 >= 3, `Demo cap. 4 con ${ev0} eventos (≥3)`);
      await page.evaluate(() => { window.__game.state.productora = 'Andes Live'; });
      await jugarEvento(page, true);
      bien(await hayModal(page, '.cmp-res [data-acc="wa-res"]'), 'Resultado 5⭐: bloque "Presume tu transmisión" con WhatsApp');
      bien(await hayModal(page, '.cmp-res [data-acc="img-res"]'), 'Resultado: con Web Share sale "Compartir imagen"');
      await page.locator('#overlay.on .cmp-res').scrollIntoViewIfNeeded();
      await shot(page, '03_resultado');
      await page.click('#overlay.on [data-acc="wa-res"]');
      const u = await page.evaluate(() => window.__compartirUltimo);
      const txt = decodeURIComponent((u.url.split('?text=')[1]) || '');
      bien(/5⭐/.test(txt) && /EN VIVO Tycoon/.test(txt) && txt.includes('«Andes Live»'), 'WhatsApp del resultado: menciona el evento con 5⭐ → ' + txt.slice(0, 100));
      await page.click('#overlay.on [data-acc="img-res"]');
      await page.waitForFunction(() => window.__compartidos && window.__compartidos.length, null, { timeout: 8000 }).catch(() => {});
      const sh = await page.evaluate(() => (window.__compartidos || [])[0] || null);
      const png = sh && sh.files[0];
      bien(png && png.type === 'image/png' && png.size > 40000, `Web Share: imagen PNG (${png ? Math.round(png.size / 1024) : 0} KB) con texto y enlace`);
      bien(sh && /juego\.tukanec\.com/.test(sh.text), 'Web Share: el texto lleva el enlace');
      if (png) {
        fs.writeFileSync(path.join(OUT, 'compartir_04_imagen_evento.png'), Buffer.from(png.b64, 'base64'));
        const dim = await page.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); return [i.width, i.height]; }, png.b64);
        bien(dim[0] === 1080 && dim[1] === 1350, 'Imagen 1080x1350');
        // La sede se dibujó (zona de la sede con colores variados, no un rectángulo liso)
        const variada = await page.evaluate(async (b64) => {
          const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
          const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
          const d = x.getImageData(80, 180, 920, 520).data; const set = new Set();
          for (let k = 0; k < d.length; k += 4 * 97) set.add((d[k] >> 4) + ',' + (d[k + 1] >> 4) + ',' + (d[k + 2] >> 4));
          return set.size;
        }, png.b64);
        bien(variada > 25, `Imagen: la sede está dibujada (${variada} colores en la zona)`);
      }
      await page.click('#overlay.on [data-act="after-result"]');
      await cerrarVentanas(page);
      await page.waitForSelector('#overlay.on .cmp-cal', { timeout: 8000 }).catch(() => {});
      bien(await hayModal(page, '.cmp-cal'), 'Después del 5⭐: sale la ventana para opinar');
      const ops = await page.evaluate(() => [...document.querySelectorAll('#overlay.on .cmp-cal-op .btn')].map((b) => ({ c: b.className, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), a: b.dataset.acc })));
      bien(ops.length === 2 && ops[0].c === ops[1].c && ops[0].w === ops[1].w && ops[0].h === ops[1].h, 'Calificar: "Opinar en Google Play" y "Enviar una sugerencia" iguales (sin filtrar por opinión) ' + JSON.stringify(ops));
      bien(!/gust/i.test(await page.locator('#overlay.on .cmp-cal').innerText()), 'Calificar: no pregunta "¿te gusta?"');
      await shot(page, '05_calificar');
      await page.click('#overlay.on [data-acc="cal-play"]');
      const u2 = await page.evaluate(() => window.__compartirUltimo);
      bien(u2.url === CP.PLAY_URL && !u2.intent, 'Web: "Opinar" abre la página de Google Play');
      bien(await page.evaluate(() => JSON.parse(localStorage.getItem('envivo_calificar_v1')).hecho === true), 'Después de opinar no se vuelve a pedir');
      // Otro 5⭐: ya no sale
      await jugarEvento(page, true);
      await page.click('#overlay.on [data-act="after-result"]');
      await cerrarVentanas(page);
      await page.waitForTimeout(2200);
      bien(!(await hayModal(page, '.cmp-cal')), 'Otro 5⭐ después de opinar: no sale');
      bien(await sinScrollH(page), 'Sin desplazamiento horizontal');
      // Imagen de Inicio
      await page.click('nav button[data-tab="inicio"]');
      await page.evaluate(() => { window.__compartidos = []; });
      await verEnInicio(page, '[data-acc="img-ini"]');
      await page.locator('#tab-inicio [data-acc="img-ini"]').click();
      await page.waitForFunction(() => window.__compartidos.length, null, { timeout: 8000 }).catch(() => {});
      const s2 = await page.evaluate(() => window.__compartidos[0] || null);
      if (s2 && s2.files[0]) fs.writeFileSync(path.join(OUT, 'compartir_06_imagen_inicio.png'), Buffer.from(s2.files[0].b64, 'base64'));
      bien(s2 && s2.files[0] && s2.files[0].size > 40000, 'Imagen de Inicio (productora, día y fama)');
      await ctx.close();
    }

    /* 3) Reglas de calificar: 30 días, 3 veces, guía, pocos eventos */
    {
      const { ctx, page } = await abrir(browser, { tag: 'reglas', demo: 'cap4' });
      await cerrarVentanas(page);
      const r = await page.evaluate(() => {
        const C = window.Compartir, now = Date.now(), D = 86400000, set = (v) => localStorage.setItem('envivo_calificar_v1', JSON.stringify(v));
        const out = {};
        set({ veces: 1, ultimo: now - 10 * D }); out.d10 = C.puedeCalificar();
        set({ veces: 1, ultimo: now - 31 * D }); out.d31 = C.puedeCalificar();
        set({ veces: 3, ultimo: now - 90 * D }); out.v3 = C.puedeCalificar();
        localStorage.removeItem('envivo_calificar_v1'); out.nunca = C.puedeCalificar();
        const g0 = window.Guia; window.Guia = { activa: () => true }; out.guia = C.puedeCalificar(); window.Guia = g0;
        const S = window.__game.state, e0 = S.stats.events; S.stats.events = 1; out.pocos = C.puedeCalificar(); S.stats.events = e0;
        S.intento = { x: 1 }; out.online = C.puedeCalificar(); delete S.intento;
        return out;
      });
      bien(r.nunca && !r.d10 && r.d31 && !r.v3 && !r.guia && !r.pocos && !r.online, 'Reglas: cada 30 días, máximo 3, nunca con la guía, con pocos eventos ni en línea ' + JSON.stringify(r));
      // 4⭐: comparte pero no pide calificar; 5⭐ con la ventana de otra cosa: espera
      await page.evaluate(() => { window.__f0 = window.Game.finishEvent; window.Game.finishEvent = function () { const f = window.__f0.apply(this, arguments); if (f && f.result) f.result.stars = 4; return f; }; });
      await jugarEvento(page, false);
      bien(await hayModal(page, '.cmp-res'), 'Resultado 4⭐: también se puede compartir');
      await page.click('#overlay.on [data-act="after-result"]');
      await cerrarVentanas(page);
      await page.waitForTimeout(2000);
      bien(!(await hayModal(page, '.cmp-cal')), 'Resultado 4⭐: no pide calificar');
      await ctx.close();
    }

    /* 4) En la app de Android: intent con respaldo web */
    {
      const { ctx, page } = await abrir(browser, { tag: 'app', query: '?fecha=2026-11-10&origen=android' });
      await cerrarVentanas(page);
      await verEnInicio(page, '[data-acc="wa-ini"]');
      await page.locator('#tab-inicio [data-acc="wa-ini"]').click();
      const u = await page.evaluate(() => window.__compartirUltimo);
      bien(u.intent && /^intent:\/\/send\?text=.*scheme=whatsapp;package=com\.whatsapp;S\.browser_fallback_url=https%3A%2F%2Fwa\.me/.test(u.intent), 'App: WhatsApp por intent con wa.me de respaldo');
      await page.evaluate(() => window.Compartir.clic(null, 'cal-play'));
      const u2 = await page.evaluate(() => window.__compartirUltimo);
      bien(/^intent:\/\/details\?id=com\.tukanec\.envivo#Intent;scheme=market;package=com\.android\.vending;S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com/.test(u2.intent || ''), 'App: "Opinar" abre la app de Google Play');
      // Sugerencia sin servidor: aviso y no se rompe
      await page.evaluate(() => window.Compartir.clic(null, 'cal-sug'));
      await page.waitForTimeout(200);
      bien(true, 'Sugerencia sin servidor: no se rompe');
      await ctx.close();
    }

    /* 5) Pruebas automáticas sin forzar: no sale nada solo */
    {
      const { ctx, page } = await abrir(browser, { tag: 'sinforzar', demo: 'cap4', forzar: false });
      await cerrarVentanas(page);
      await page.waitForTimeout(3000);
      bien(!(await hayModal(page, '.cmp-nov')), 'Sin forzar (navigator.webdriver): las novedades no salen solas');
      await jugarEvento(page, true);
      await page.click('#overlay.on [data-act="after-result"]');
      await cerrarVentanas(page);
      await page.waitForTimeout(2000);
      bien(!(await hayModal(page, '.cmp-cal')), 'Sin forzar: tampoco la calificación');
      await ctx.close();
    }

    /* 6) Inglés */
    {
      const { ctx, page } = await abrir(browser, { tag: 'en', locale: 'en-US', query: '?fecha=2026-11-10&lang=en' });
      await page.waitForFunction(() => window.I18N && window.I18N.idioma === 'en', null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      await cerrarVentanas(page);
      await page.click('nav button[data-tab="inicio"]');
      await verEnInicio(page, '[data-acc="wa-ini"]');
      const t = await page.locator('#tab-inicio [data-acc="wa-ini"]').innerText();
      bien(/Share on WhatsApp/.test(t), 'Inglés: "Share on WhatsApp"');
      await verEnInicio(page, '[data-acc="nov"]');
      await page.locator('#tab-inicio [data-acc="nov"]').click();
      bien(/What's new in EN VIVO/.test(await page.locator('#overlay.on .cmp-nov').innerText()), "Inglés: \"What's new in EN VIVO\"");
      await shot(page, '07_novedades_en');
      await ctx.close();
    }
  } catch (e) {
    fallas++; console.error('❌ La prueba se cayó:', e);
  }
  await browser.close();
  bien(!errores.length, 'Sin errores en la consola' + (errores.length ? ': ' + errores.slice(0, 5).join(' | ') : ''));
  console.log(`\n${bien_} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})();
