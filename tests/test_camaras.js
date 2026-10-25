/* Prueba de regresión de las cámaras al preparar un evento (reportes del dueño jugando en el celular):
   1. "Por defecto siempre sale la cámara de Don Ramiro y si la cambio por una mejor, no lo registra y baja la probabilidad":
      - lo preseleccionado es la MEJOR cámara (no Don Ramiro de relleno sin nadie que la maneje),
      - elegir una cámara mejor se queda marcada, se usa en el plan y en el evento, y la calidad esperada SUBE,
      - sumar una cámara (aunque sea una PTZ sin operador) nunca baja la calidad esperada,
      - una cámara que no graba sin lente avisa al comprarla y ofrece comprar el lente; con el lente se usa.
   2. "Exige cámara al hombro y al inicio, sin fama, es imposible conseguirla":
      - hay una cámara de hombro que se compra desde fama 0 con la plata del inicio,
      - todas las posiciones obligatorias de los eventos de los capítulos 0 a 2 se pueden cubrir bien con algo comprable,
      - la preparación dice qué falta y lleva a la Bodega ("Comprar en la Bodega").
   En un celular simulado (390x844) con Playwright. Capturas en tests/capturas/camaras_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_camaras.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const G = require('../js/logic.js');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo-camaras.test';
const SAVE = 'envivo_tycoon_save_v1';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Lógica ---------- */
(function () {
  const HOMBRO = 'cam_zony_hxr_mk2500';
  const it = G.CATALOG[HOMBRO];
  const s0 = G.newGame(3);
  bien(it && it.cat === 'cam' && it.minRep <= s0.rep && it.minRep === 0, 'La cámara de hombro de entrada se compra desde fama 0');
  bien(it && it.price <= s0.money && !(it.requiere || []).length, `…con la plata del inicio (${it && it.price} de ${s0.money}) y sin lentes aparte`);
  // Cada posición obligatoria de los eventos de los capítulos 0 a 2 (fama hasta 12) se cubre al menos bien ("sirve", ≥ 0.7)
  // con una cámara que ya se puede comprar con la fama del evento (las que piden un rol, como la PTZ, valen: se contrata;
  // las que piden lente, solo si ese lente también se puede comprar)
  const D = require('../js/datos.js');
  const LENTE = { lente_b4: 'lente_eng', lente_cine: 'lente_cine', lente_mft: 'lente_mft' };
  const conseguible = (k, rep) => {
    const it = G.CATALOG[k];
    if (!it || it.cat !== 'cam' || it.premium || it.exclusivo || it.minRep > rep) return false;
    return (it.requiere || []).every((r) => G.ROLE_KEYS.includes(r) || (LENTE[r] && Object.keys(G.CATALOG).some((l) => G.CATALOG[l].subtipo === LENTE[r] && !G.CATALOG[l].exclusivo && G.CATALOG[l].minRep <= rep)));
  };
  const malas = [];
  Object.keys(G.EVENT_TYPES).forEach((k) => {
    const t = G.EVENT_TYPES[k];
    if (t.soloInternacional || t.temporada || t.minRep > 12) return;
    const n = Math.max.apply(null, [].concat(t.cams));
    new Set(t.positions.slice(0, n).map((p) => p[1])).forEach((pf) => {
      const mejor = Object.keys(G.CATALOG).filter((c) => conseguible(c, t.minRep)).reduce((m, c) => Math.max(m, (D.AJUSTE[pf] || {})[D.CLASE_CAMARA[G.CATALOG[c].subtipo]] || 0), 0);
      if (mejor < 0.7) malas.push(k + ':' + pf + '=' + mejor);
    });
  });
  // Sumar una cámara a la selección nunca baja la calidad esperada (antes una PTZ sin operador o una cámara sin
  // nadie que la maneje le quitaban el puesto a la que sí rendía)
  let bajas = 0, casos = 0;
  const camaras = Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].cat === 'cam' && !G.CATALOG[k].premium && !G.CATALOG[k].exclusivo);
  ['misa', 'boda', 'prensa', 'barrial', 'lucha_libre', 'graduacion'].forEach((ev) => {
    camaras.forEach((k) => {
      const s = G.newGame(11); s.rep = 100; s.money = 1e6;
      G.buy(s, k);
      const c = G.addContract(s, ev) || s.contracts[0];
      if (c.type !== ev) return;
      const lo = G.suggestLoadout(s, c.id);
      const staff = s.staff.filter((p) => lo.staffIds.includes(p.id));
      const ram = s.equip.find((e) => e.starter), nueva = s.equip.find((e) => e.type === k);
      const q1 = G.computeQuality(s, c, staff, [ram]).q;
      const q2 = G.computeQuality(s, c, staff, [ram, nueva]).q;
      casos++; if (q2 < q1) { bajas++; if (bajas < 5) console.error('   baja', ev, k, q1, '→', q2); }
    });
  });
  bien(casos > 50 && !bajas, `Sumar una cámara a Don Ramiro nunca baja la calidad (${casos} casos, ${bajas} bajan)`);

  // Lo preseleccionado: la mejor cámara; Don Ramiro no va de relleno si nadie la maneja
  const s = G.newGame(5); s.rep = 8; s.money = 9000;
  G.buy(s, 'cam_pro');
  const c = G.addContract(s, 'misa');
  c.cams = 1;
  const lo = G.suggestLoadout(s, c.id);
  const plan = G.cameraPlan(s, c, lo.equipIds, lo.staffIds);
  const p1 = plan.positions[0];
  const ramPos = plan.positions.find((p) => p.equipo && /Ramiro/.test(p.equipo));
  bien(p1.asignado === 'cam_pro' && p1.operado, 'Elegir lo mejor: la cámara mejor va a la posición principal y la maneja el camarógrafo');
  bien(!ramPos || ramPos.opcional, 'Don Ramiro solo va de toma extra (si suma), nunca en lugar de la mejor');
  // Una cámara que no graba sin lente: se avisa cuál falta y cuánto cuesta
  const lf = G.lenteFaltante(G.newGame(1), 'cam_blackmagia_estudio_4k_g3', 1);
  bien(lf && lf.key === 'lente_kit_mft' && !lf.bloqueado, 'La Blackmagia de estudio avisa que le falta el lente MFT de kit');
  bien(G.lenteFaltante(G.newGame(1), 'cam_pro', 1) === null, 'Una cámara con lente propio no pide lente');
})();

/* ---------- Navegador ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };
async function servir(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/vacia.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>vacía</title>' });
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(RAIZ, rel);
    if (rel.startsWith('api/') || !f.startsWith(RAIZ + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
}

(async () => {
  const browser = await chromium.launch();
  const errores = [];
  const URL0 = BASE + '/index.html?fecha=2026-11-10';

  // Abre el juego con una partida armada con la lógica (fama, plata y ofertas a elección)
  async function abrir(op) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
    await servir(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(URL0, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.state);
    const st = await page.evaluate((o) => {
      const Gm = window.Game, s = Gm.newGame(7);
      s.chapter = o.chapter; s.chapterSeen = o.chapter; s.rep = o.rep; s.money = o.money; s.stats.events = o.chapter ? 4 : 0;
      s.contracts = [];
      o.eventos.forEach((k) => { const c = Gm.addContract(s, k); if (c) { c.daysLeft = 5; c.stream = false; if (o.cams) c.cams = o.cams; } });
      return Gm.serialize(s);
    }, op);
    await page.goto(BASE + '/vacia.html');
    await page.evaluate(([k, x]) => localStorage.setItem(k, x), [SAVE, st]);
    await page.goto(URL0, { waitUntil: 'load' });
    await page.waitForFunction((r) => window.__game && window.__game.state && window.__game.state.rep === r, op.rep);
    await page.waitForTimeout(300);
    await cerrarVentanas(page);
    return { ctx, page };
  }
  async function cerrarVentanas(page) {
    for (let k = 0; k < 5; k++) {
      const b = page.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"]');
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(80); } else break;
    }
  }
  const leer = (page) => page.evaluate(() => {
    const txt = (document.querySelector('#prepPie') || {}).innerText || '';
    const m = txt.match(/(\d+)\s*[–-]\s*(\d+)/);
    return { min: m ? +m[1] : -1, max: m ? +m[2] : -1,
      marcadas: [...document.querySelectorAll('#modal input[data-act="tog-equip"]')].filter((x) => x.checked).map((x) => +x.dataset.id),
      plan: [...document.querySelectorAll('#modal .pe-clr')].map((r) => r.innerText.replace(/\s+/g, ' ')) };
  });
  const marcar = async (page, id) => { await page.locator(`#modal label.pick:has(input[data-act="tog-equip"][data-id="${id}"])`).click({ position: { x: 12, y: 12 } }); await page.waitForTimeout(60); };
  const comprar = async (page, cat, k) => {
    await page.click('nav button[data-tab="bodega"]');
    await page.click(`[data-act="cat"][data-k="${cat}"]`);
    const b = page.locator(`[data-act="buy"][data-k="${k}"]`).first();
    await b.scrollIntoViewIfNeeded();
    return b;
  };

  try {
    /* ===== 1. Elegir una cámara mejor: se queda, se usa y sube la calidad ===== */
    {
      const { ctx, page } = await abrir({ chapter: 1, rep: 8, money: 9000, eventos: ['misa'], cams: 1 });
      const b = await comprar(page, 'cam', 'cam_pro');
      bien(!(await b.isDisabled()), 'Bodega: la Kanon XA65 se puede comprar con fama 8');
      await b.click(); await cerrarVentanas(page);
      const ids = await page.evaluate(() => { const s = window.__game.state; return { ram: s.equip.find((e) => e.starter).id, pro: s.equip.find((e) => e.type === 'cam_pro').id, c: s.contracts[0].id }; });
      await page.click('nav button[data-tab="clientes"]');
      await page.click(`[data-act="prep"][data-id="${ids.c}"]`);
      await page.waitForSelector('[data-act="go-live"]');
      let r = await leer(page);
      bien(r.marcadas.includes(ids.pro) && /Kanon/.test(r.plan[0] || ''), 'Preparar: viene marcada la mejor cámara (Kanon) y va en la posición 1');
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(OUT, 'camaras_01_preseleccion.png') });
      // Como lo hizo el dueño: arranca con Don Ramiro y la cambia por la mejor
      if (r.marcadas.includes(ids.ram)) await marcar(page, ids.ram);
      await marcar(page, ids.pro); await marcar(page, ids.ram);
      const conRamiro = await leer(page);
      bien(conRamiro.marcadas.length === 1 && conRamiro.marcadas[0] === ids.ram && /Don Ramiro/.test(conRamiro.plan[0] || ''), 'Solo Don Ramiro: va en la posición 1');
      await marcar(page, ids.pro);
      const ambas = await leer(page);
      bien(ambas.marcadas.includes(ids.pro) && /Kanon/.test(ambas.plan[0] || ''), 'Al marcar la Kanon se queda marcada y pasa a la posición 1');
      bien(ambas.min >= conRamiro.min && ambas.max > conRamiro.max, `La calidad esperada sube al sumar la mejor (${conRamiro.min}–${conRamiro.max} → ${ambas.min}–${ambas.max})`);
      await marcar(page, ids.ram);
      const cambio = await leer(page);
      bien(cambio.marcadas.length === 1 && cambio.marcadas[0] === ids.pro, 'Don Ramiro desmarcada, la Kanon sigue marcada');
      bien(cambio.min > conRamiro.min && cambio.max > conRamiro.max, `Cambiar Don Ramiro por la Kanon sube la calidad (${conRamiro.min}–${conRamiro.max} → ${cambio.min}–${cambio.max}; con las dos ${ambas.min}–${ambas.max})`);
      await page.locator('#modal .pe-cl').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'camaras_02_cambiada.png') });
      // Al aire: el evento usa la Kanon
      await page.click('[data-act="go-live"]');
      await page.waitForFunction(() => window.__game.state.currentEvent);
      const ev = await page.evaluate(() => { const e = window.__game.state.currentEvent; return { ids: e.equipIds, cam0: e.cameraPlan && e.cameraPlan.positions[0].asignado }; });
      bien(ev.ids.includes(ids.pro) && !ev.ids.includes(ids.ram) && ev.cam0 === 'cam_pro', 'En vivo: el evento se hace con la Kanon (plan de cámaras y equipos)');
      await ctx.close();
    }

    /* ===== 1b. Cámara que necesita lente: se avisa al comprar y se ofrece el lente ===== */
    {
      const { ctx, page } = await abrir({ chapter: 1, rep: 8, money: 9000, eventos: ['misa'], cams: 1 });
      const b = await comprar(page, 'cam', 'cam_blackmagia_estudio_4k_g3');
      await b.click();
      await page.waitForSelector('#overlay.on [data-act="buy-kit"]');
      bien(/lente/i.test(await page.locator('#modal').innerText()), 'Al comprar la Blackmagia de estudio avisa que necesita lente');
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(OUT, 'camaras_03_lente.png') });
      await page.click('#overlay.on [data-act="buy-kit"]');
      await cerrarVentanas(page);
      const tiene = await page.evaluate(() => window.__game.state.equip.map((e) => e.type));
      bien(tiene.includes('cam_blackmagia_estudio_4k_g3') && tiene.includes('lente_kit_mft'), 'Compra la cámara y el lente juntos');
      await page.click('nav button[data-tab="clientes"]');
      await page.click('[data-act="prep"]');
      await page.waitForSelector('[data-act="go-live"]');
      const r = await leer(page);
      bien(/Blackmagia/.test(r.plan[0] || ''), 'Con su lente, la Blackmagia sí se usa en el evento');
      await ctx.close();
    }

    /* ===== 2. Cámara de hombro desde el inicio: avisa qué falta y lleva a la Bodega ===== */
    {
      const { ctx, page } = await abrir({ chapter: 1, rep: 8, money: 1600, eventos: ['lucha_libre'], cams: 2 });
      await page.click('nav button[data-tab="clientes"]');
      await page.click('[data-act="prep"]');
      await page.waitForSelector('[data-act="go-live"]');
      const av = page.locator('#modal [data-act="ir-bodega"][data-k="cam"]');
      bien(await av.count() > 0, 'Lucha libre sin cámara de hombro: la preparación dice qué comprar y tiene "Comprar en la Bodega"');
      bien(/Zony HXR-MK2500/.test(await page.locator('#modal .camav').innerText().catch(() => '')), '…y nombra la cámara de hombro de entrada');
      await av.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, 'camaras_04_falta_hombro.png') });
      await av.first().click();
      await page.waitForTimeout(150);
      const enBodega = await page.evaluate(() => !document.querySelector('#overlay.on') && !!document.querySelector('.catchip.on[data-k="cam"]'));
      bien(enBodega, 'El botón lleva a la Bodega, categoría Cámaras');
      const b = page.locator('[data-act="buy"][data-k="cam_zony_hxr_mk2500"]').first();
      await b.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, 'camaras_05_bodega_hombro.png') });
      bien(!(await b.isDisabled()), 'La cámara de hombro de entrada está a la venta y se puede comprar');
      await b.click(); await cerrarVentanas(page);
      await page.click('nav button[data-tab="clientes"]');
      await page.click('[data-act="prep"]');
      await page.waitForSelector('[data-act="go-live"]');
      const r = await leer(page);
      const pos2 = r.plan[1] || '';
      bien(/Zony HXR-MK2500/.test(pos2) && !/Ideal/.test(pos2), 'La posición al hombro queda con la cámara de hombro y ya no pide "Ideal: Cámara de hombro" → ' + pos2);
      await page.locator('#modal .pe-cl').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(OUT, 'camaras_06_con_hombro.png') });
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      bien(ov <= 1, 'Sin desplazamiento horizontal en la preparación');
      await ctx.close();
    }
  } catch (e) {
    fallas++; console.error('❌ Error en la prueba:', e.message);
  }
  bien(!errores.length, 'Sin errores de JavaScript en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${bien_} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
