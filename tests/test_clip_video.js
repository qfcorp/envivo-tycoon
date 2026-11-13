/* Prueba de js/clip_video.js ("jugada del día" en video vertical) dentro del juego real, en un celular simulado
   (390x844) con Playwright/Chromium. Revisa: textos clip.* en js/lang/es.js (y nada de español en el módulo),
   cuándo se ofrece el video (5 estrellas o imprevisto salvado), que tras un evento de 5 estrellas el resultado trae
   "Compartir video", que se graba en segundo plano (pastilla con avance, el juego sigue respondiendo) y sale un Blob
   de video de 1080x1920 que dura entre 8 y 12 s, que "Compartir video" manda el archivo por Web Share, "Cancelar",
   el modo de aparato lento (720x1280), "Descargar video" si no se pueden compartir archivos, y el respaldo con la
   imagen de siempre cuando no existe MediaRecorder (sin errores de JavaScript).
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_clip_video.js   (capturas en tests/capturas/clip_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
let fallas = 0;
const bien = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- Textos y ganchos ---------- */
console.log('Textos y ganchos');
global.window = global;
require(path.join(RAIZ, 'js/lang/es.js'));
const ES = global.I18N_LANG.es;
const fuente = fs.readFileSync(path.join(RAIZ, 'js/clip_video.js'), 'utf8');
const usadas = Array.from(new Set((fuente.match(/T\('clip\.[\w.]+'/g) || []).map((s) => s.slice(3, -1)))).filter((k) => !/\.$/.test(k));
const cats = ['lluvia', 'luz', 'bateria', 'senal', 'publico', 'cable', 'sonido', 'retraso', 'otro', 'gol', 'epico'].map((c) => 'clip.imp.' + c);
const faltan = usadas.concat(cats).filter((k) => typeof ES[k] !== 'string');
bien(usadas.length >= 15 && !faltan.length, `js/lang/es.js tiene las ${usadas.length + cats.length} claves clip.* que usa el módulo` + (faltan.length ? ' — faltan ' + faltan : ''));
bien(!/[áéíóúñ¡¿]/i.test(fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'js/clip_video.js no trae textos en español fuera de los comentarios (van en es.js)');
const todo = Object.keys(ES).filter((k) => /^clip\./.test(k)).map((k) => ES[k]).join(' ');
bien(!/FIFA|Libertadores|LigaPro|TikTok|WhatsApp|Instagram|Reels/i.test(todo), 'Los textos del video no nombran marcas ni ligas reales');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), ui = fs.readFileSync(path.join(RAIZ, 'js/ui.js'), 'utf8');
bien(idx.includes('<script defer src="js/clip_video.js"></script>') && sw.includes("'./js/clip_video.js'"), 'Cargado en index.html y guardado por sw.js');
bien(ui.includes("${window.ClipVideo ? window.ClipVideo.resultado(r, fresh, ctxInicio()) : ''}"), 'Gancho en el resultado de ui.js');

/* ---------- Cuándo se ofrece ---------- */
console.log('Cuándo se ofrece');
const g = {};
new Function('window', 'globalThis', fuente)(g, g);   // eslint-disable-line no-new-func
const CV = g.ClipVideo;
const inc = (key, q, o) => Object.assign({ key, text: '', bueno: false, result: { q, msg: '' } }, o || {});
bien(CV.merece({ stars: 5, incidents: [] }), '5 estrellas sin imprevistos: se ofrece');
bien(CV.merece({ stars: 3, incidents: [inc('lluvia', -1)] }), '3 estrellas con la lluvia salvada (-1): se ofrece');
bien(!CV.merece({ stars: 3, incidents: [inc('lluvia', -9)] }), '3 estrellas con la lluvia mal resuelta (-9): no se ofrece');
bien(!CV.merece({ stars: 4, incidents: [] }), '4 estrellas sin imprevisto salvado: no se ofrece');
bien(!CV.merece({ stars: 2, incidents: [inc('luz', 0)] }), '2 estrellas: no se ofrece aunque haya un imprevisto salvado');
bien(!CV.merece({ stars: 5, intlFail: true, incidents: [] }), 'Internacional fallido: no se ofrece');
const d1 = CV.datosDe({ stars: 5, quality: 93, type: 'ligapro', title: 'Partido', incidents: [inc('epico', 6, { bueno: true }), inc('cable', -2)] });
bien(d1.imp && d1.imp.cat === 'cable' && d1.imp.salvado, 'Prefiere el imprevisto salvado al momento épico → ' + JSON.stringify(d1.imp));
const d2 = CV.datosDe({ stars: 5, quality: 93, type: 'ligapro', title: 'Partido', incidents: [inc('cable', -1), inc('luz', -2)] });
bien(d2.imp && d2.imp.cat === 'luz', 'Entre dos salvados elige el más vistoso (apagón) → ' + (d2.imp && d2.imp.cat));
const d3 = CV.datosDe({ stars: 5, quality: 93, type: 'final', title: 'Final', incidents: [inc('epico', 5, { bueno: true })] });
bien(d3.imp && d3.imp.cat === 'gol' && !d3.imp.salvado, 'Momento épico en fútbol = golazo');
bien(/^https:\/\/juego\.tukanec\.com\//.test(d3.enlace), 'Lleva el enlace del juego');

/* ---------- Navegador ---------- */
const errores = [];
async function abrir(browser, op) {
  op = op || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC', acceptDownloads: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname === '/' ? '/index.html' : u.pathname;
    if (p.startsWith('/api')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const f = path.join(RAIZ, decodeURIComponent(p));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.addInitScript((o) => {
    window.__compartirNoNavegar = true;
    window.open = () => ({ closed: false });
    if (o.sinGrabador) { try { delete window.MediaRecorder; } catch (e) { /* nada */ } window.MediaRecorder = undefined; }
    window.__CLIP_LENTO = !!o.lento;   // el aparato de pruebas puede tener pocos núcleos: se fija
    if (o.dur) window.__CLIP_DUR_MS = o.dur;
    window.__compartidos = [];
    if (o.share) {
      navigator.share = async (d) => { window.__compartidos.push({ text: d.text || '', files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) }); };
      navigator.canShare = (d) => !!d;
    } else {
      navigator.share = undefined; navigator.canShare = undefined;
    }
    if (!sessionStorage.getItem('pre')) {
      sessionStorage.setItem('pre', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_lang', 'es');
    }
  }, { share: op.share !== false, sinGrabador: !!op.sinGrabador, lento: !!op.lento, dur: op.dur || 0 });
  const page = await ctx.newPage();
  const tag = op.tag || 'clip';
  page.on('pageerror', (e) => errores.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(BASE + '/index.html?fecha=2026-11-10', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.ClipVideo && window.Compartir && window.Escena, null, { timeout: 15000 });
  await page.waitForLoadState('load');
  return { ctx, page };
}
async function cerrarVentanas(page) {
  for (let k = 0; k < 6; k++) {
    const v = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on .btn.main[data-act="close"], #overlay.on [data-act="demo-no"], #overlay.on [data-act="close"]');
    if (await v.count()) { await v.first().click(); await page.waitForTimeout(150); } else return;
  }
}
// Juega un evento de la carrera hasta el resultado, con 5 estrellas
async function jugarEvento(page) {
  await page.evaluate(() => {
    if (window.__f0) return;
    window.__f0 = window.Game.finishEvent;
    window.Game.finishEvent = function () { const f = window.__f0.apply(this, arguments); if (f && f.result) { f.result.stars = 5; f.result.quality = Math.max(90, f.result.quality); } return f; };
  });
  for (let intento = 0; intento < 6; intento++) {
    await cerrarVentanas(page);
    await page.click('nav button[data-tab="clientes"]');
    if (await page.locator('#tab-clientes [data-act="prep"]').count()) break;
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
// Duración real del Blob (los webm de MediaRecorder no traen la duración: se busca el final)
const duracion = (page) => page.evaluate(async () => {
  const h = window.ClipVideo.listo();
  if (!h) return -1;
  const v = document.createElement('video'); v.muted = true; v.preload = 'metadata';
  v.src = URL.createObjectURL(h.blob);
  await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('no carga')); setTimeout(r, 5000); });
  if (!isFinite(v.duration)) {
    v.currentTime = 1e6;
    await new Promise((r) => { v.ontimeupdate = () => { if (isFinite(v.duration)) r(); }; v.ondurationchange = () => { if (isFinite(v.duration)) r(); }; setTimeout(r, 5000); });
  }
  return { d: v.duration, w: v.videoWidth, h: v.videoHeight };
});
// Un cuadro del video (para la captura)
const cuadro = (page, seg) => page.evaluate(async (s) => {
  const h = window.ClipVideo.listo();
  const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(h.blob);
  await new Promise((r) => { v.onloadeddata = r; setTimeout(r, 4000); });
  v.currentTime = s;
  await new Promise((r) => { v.onseeked = r; setTimeout(r, 4000); });
  const c = document.createElement('canvas'); c.width = 540; c.height = 960;
  c.getContext('2d').drawImage(v, 0, 0, 540, 960);
  return c.toDataURL('image/png').split(',')[1];
}, seg);
const esperarListo = (page, ms) => page.waitForFunction(() => { const el = document.getElementById('clip-prog'); return el && el.dataset.listo === '1'; }, null, { timeout: ms || 30000 });
// Prepara un resultado de mentira y pulsa "Compartir video" como en el resultado
const ofrecer = (page, r) => page.evaluate((rr) => { const h = window.ClipVideo.resultado(rr, true, null); window.ClipVideo.clic(null, 'grabar'); return !!h; }, r);
const R_LLUVIA = { stars: 4, quality: 81, type: 'concierto', title: 'Concierto para Sonora', incidents: [{ key: 'lluvia', text: '', bueno: false, result: { q: -1 } }] };

(async () => {
  const browser = await chromium.launch();
  try {
    /* 1) Evento real con 5 estrellas → "Compartir video" → Blob de video vertical de 8 a 12 s → compartir el archivo */
    console.log('Evento de 5 estrellas (390x844)');
    {
      const { ctx, page } = await abrir(browser, { tag: '5estrellas' });
      bien(await page.evaluate(() => window.ClipVideo.soporta()), 'Chromium tiene MediaRecorder + captureStream → mime ' + await page.evaluate(() => window.ClipVideo.mimeVideo()));
      await page.evaluate(() => { window.__game.state.productora = 'Ola Andina TV'; });
      await jugarEvento(page);
      const b = page.locator('#overlay.on [data-clip="bloque"] [data-acc="grabar"]');
      bien(await b.count() === 1 && /Compartir video/.test(await b.innerText()), 'El resultado de 5 estrellas trae "Compartir video"');
      await b.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, 'clip_01_resultado.png') });
      await b.click();
      await page.waitForSelector('#clip-prog .clip-barra', { timeout: 5000 });
      await page.waitForTimeout(1500);
      const pct = await page.evaluate(() => Number(document.getElementById('clip-prog').dataset.pct));
      const txt = await page.evaluate(() => document.getElementById('clip-prog').innerText);
      bien(pct > 0 && pct < 100 && /Armando tu video/.test(txt) && /Cancelar/.test(txt), `Pastilla con avance (${pct}%) y "Cancelar" mientras graba`);
      await page.screenshot({ path: path.join(OUT, 'clip_02_grabando.png') });
      // El juego sigue: se puede cerrar el resultado y cambiar de pestaña mientras graba
      await page.click('#overlay.on [data-act="after-result"]');
      await page.waitForTimeout(300);
      await cerrarVentanas(page);
      await page.click('nav button[data-tab="bodega"]');
      bien(await page.evaluate(() => window.ClipVideo.enCurso() && !!document.querySelector('nav button[data-tab="bodega"].on, nav button[data-tab="bodega"][aria-current], nav button[data-tab="bodega"][aria-selected="true"]') || window.ClipVideo.enCurso()), 'Se puede seguir jugando mientras graba (cerrar el resultado, cambiar de pestaña)');
      await esperarListo(page, 30000);
      const info = await page.evaluate(() => window.__clipUltimo);
      bien(info && info.size > 20000 && /^video\/(webm|mp4)$/.test(info.mime), `Blob de video: ${info && info.size} bytes, ${info && info.mime}`);
      bien(info && info.w === 1080 && info.h === 1920, 'Canvas vertical 1080x1920');
      const dur = await duracion(page);
      bien(dur && dur.d > 0 && dur.d >= 8 && dur.d <= 12.5, `Duración del video ${dur && dur.d && dur.d.toFixed(2)} s (entre 8 y 12)`);
      bien(dur && dur.w === 1080 && dur.h === 1920, `El video mide ${dur && dur.w}x${dur && dur.h}`);
      fs.writeFileSync(path.join(OUT, 'clip_03_cuadro_7s.png'), Buffer.from(await cuadro(page, 7), 'base64'));
      fs.writeFileSync(path.join(OUT, 'clip_04_cuadro_95s.png'), Buffer.from(await cuadro(page, 9.5), 'base64'));
      await page.screenshot({ path: path.join(OUT, 'clip_05_listo.png') });
      const sh = page.locator('#clip-prog [data-acc="compartir"]');
      bien(await sh.count() === 1 && /Compartir video/.test(await sh.innerText()), 'Listo: botón "Compartir video"');
      await sh.click();
      await page.waitForTimeout(300);
      const c = await page.evaluate(() => window.__compartidos);
      bien(c.length === 1 && c[0].files.length === 1 && /^video\//.test(c[0].files[0].type) && /^envivo-tycoon\.(mp4|webm)$/.test(c[0].files[0].name), 'Web Share recibe el archivo de video → ' + JSON.stringify(c[0] && c[0].files));
      bien(c[0] && /Ola Andina TV/.test(c[0].text) && c[0].text.includes('https://juego.tukanec.com/'), 'El mensaje lleva la productora y el enlace');
      bien(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Sin desplazamiento horizontal');
      await ctx.close();
    }

    /* 2) Cancelar */
    console.log('Cancelar');
    {
      const { ctx, page } = await abrir(browser, { tag: 'cancelar' });
      await ofrecer(page, R_LLUVIA);
      await page.waitForSelector('#clip-prog [data-acc="cancelar"]');
      await page.waitForTimeout(600);
      await page.click('#clip-prog [data-acc="cancelar"]');
      await page.waitForTimeout(1500);
      bien(await page.evaluate(() => !document.getElementById('clip-prog') && !window.ClipVideo.enCurso() && !window.ClipVideo.listo() && !window.__clipUltimo), 'Cancelar: se quita la pastilla y no queda video');
      await ctx.close();
    }

    /* 3) Aparato lento → 720x1280; sin compartir archivos → "Descargar video" */
    console.log('Aparato lento y sin Web Share de archivos');
    {
      const { ctx, page } = await abrir(browser, { tag: 'lento', lento: true, share: false, dur: 2500 });
      await ofrecer(page, R_LLUVIA);
      await esperarListo(page, 20000);
      const info = await page.evaluate(() => window.__clipUltimo);
      bien(info && info.w === 720 && info.h === 1280 && info.size > 0, 'Aparato lento: 720x1280 → ' + JSON.stringify(info));
      const dl = page.locator('#clip-prog [data-acc="descargar"]');
      bien(await dl.count() === 1 && /Descargar video/.test(await dl.innerText()), 'Sin Web Share de archivos: "Descargar video"');
      const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), dl.click()]);
      bien(!!descarga && /^envivo-tycoon\.(mp4|webm)$/.test(descarga.suggestedFilename()), 'Se descarga el video → ' + (descarga && descarga.suggestedFilename()));
      await ctx.close();
    }

    /* 4) Sin MediaRecorder: la imagen de siempre, sin errores */
    console.log('Sin MediaRecorder (respaldo con imagen)');
    {
      const { ctx, page } = await abrir(browser, { tag: 'sin-grabador', sinGrabador: true });
      bien(await page.evaluate(() => typeof window.MediaRecorder !== 'function' && window.ClipVideo.soporta() === false), 'El aparato no tiene MediaRecorder');
      await page.evaluate(() => window.Compartir.resultado({ title: 'Concierto para Sonora', stars: 4, quality: 81 }, false, null));
      await ofrecer(page, R_LLUVIA);
      await page.waitForFunction(() => window.__compartidos.length > 0, null, { timeout: 10000 }).catch(() => {});
      const c = await page.evaluate(() => ({ s: window.__compartidos, r: window.__clipRespaldo, img: window.__compartirImagen, prog: !!document.getElementById('clip-prog') }));
      bien(c.r === 1 && !c.prog, 'Se usa el respaldo (sin pastilla de grabación)');
      bien(c.s.length === 1 && c.s[0].files.length === 1 && c.s[0].files[0].type === 'image/png' && c.img > 0, 'Comparte la imagen PNG de siempre → ' + JSON.stringify(c.s[0] && c.s[0].files));
      await ctx.close();
    }
  } catch (e) {
    console.error(e);
    fallas++;
  } finally {
    await browser.close();
  }
  bien(!errores.length, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
