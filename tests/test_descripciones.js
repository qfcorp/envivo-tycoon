/* Prueba de "para qué sirve" cada equipo (item.<clave>.uso en js/datos.js → Game.CATALOG[k].uso).
   1) Datos (Node): cada equipo de Game.CATALOG (también los exclusivos y VIP de js/premium.js) tiene una frase en
      español, no vacía, de 90 caracteres o menos, distinta del nombre y sin marcas reales; los repuestos también
      tienen su frase corta. Las claves .uso solo existen para equipos que existen.
   2) Navegador 390x844: en la Bodega, cada tarjeta de la tienda (todas las categorías) y cada equipo propio muestra
      su frase visible; el "?" abre la hoja "¿Para qué sirve?" con la frase y el detalle técnico, y se cierra.
      En "Preparar evento" cada equipo muestra su frase corta y el "?" no marca ni desmarca el equipo.
      Sin desplazamiento horizontal. En alemán (sin traducir todavía) se ve el español, nunca la clave.
      Capturas: tests/capturas/desc_bodega.png, desc_tienda.png, desc_info.png, desc_prep.png.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_descripciones.js */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✘ ' + m); } return c; };
const MAX = 90;
// Marcas reales (las mismas de server/tests/correr.sh y algunas más): nunca en la frase de uso
const MARCAS = /\b(sony|canon|dji|blackmagic|atem|vmix|panasonic|cummins|mercedes|sprinter|ross video|carbonite|fujinon|gopro|manfrotto|vinten|steadicam|grass valley|jvc|marshall|teradek|liveu|shure|sennheiser|yamaha|behringer|midas|tricaster|newtek|netgear|apc smart|honda|osmo|phantom|evs|vizrt|calrec|clear-com|hollyland|rode|pelican)\b/i;

/* ---------- 1) Datos ---------- */
console.log('1) Datos');
const D = require('../js/datos.js');
const G = require('../js/logic.js');
globalThis.Game = G;
require('../js/premium.js');
const T = D.TEXTOS;
const claves = Object.keys(G.CATALOG);
ok(claves.length >= 110, `hay ${claves.length} equipos en Game.CATALOG (con exclusivos y VIP)`);
const largo = (t) => [...String(t)].length;
for (const k of claves) {
  const it = G.CATALOG[k];
  const u = it.uso;
  if (!ok(typeof u === 'string' && u.trim() !== '', `${k}: falta la frase "para qué sirve" (item.${k}.uso en js/datos.js)`)) continue;
  ok(T['item.' + k + '.uso'] === u, `${k}: Game.CATALOG.uso sale de TEXTOS (item.${k}.uso)`);
  ok(largo(u) <= MAX, `${k}: la frase tiene ${largo(u)} caracteres (máximo ${MAX}): ${u}`);
  ok(u !== it.name && u !== it.desc, `${k}: la frase no repite el nombre ni el detalle técnico`);
  ok(!MARCAS.test(u), `${k}: la frase menciona una marca real: ${u}`);
  ok(!/\{\w+\}/.test(u), `${k}: la frase no lleva {marcadores}`);
}
for (const k of Object.keys(T).filter((x) => /^item\..+\.uso$/.test(x))) ok(k.slice(5, -4) in G.CATALOG, `${k}: no hay equipo con esa clave`);
for (const k of Object.keys(G.CONSUMABLES)) {
  const it = G.CONSUMABLES[k];
  ok(typeof it.desc === 'string' && it.desc.trim() && largo(it.desc) <= MAX, `repuesto ${k}: frase corta (${largo(it.desc || '')} caracteres)`);
}
const ls = claves.map((k) => largo(G.CATALOG[k].uso || ''));
console.log(`  ${claves.length} equipos · frase de ${Math.min(...ls)} a ${Math.max(...ls)} caracteres (promedio ${Math.round(ls.reduce((a, b) => a + b, 0) / ls.length)})`);

/* ---------- 2) Navegador ---------- */
(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright no está instalado: se salta la parte del navegador'); return fin(); }
  console.log('2) Navegador 390x844');
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-EC' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.Game && window.Ayuda && window.__game);
  const cerrarVentanas = async () => {
    for (let k = 0; k < 6; k++) {
      const b = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on [data-act="close"], #overlay.on [data-act="demo-no"]');
      if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(120); } else break;
    }
  };
  await page.waitForTimeout(300);
  await cerrarVentanas();
  const hscroll = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const ocultarToast = () => page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });

  // Bodega: equipos propios
  await page.click('nav button[data-tab="bodega"]');
  await page.evaluate(() => document.querySelectorAll('#tab-bodega .gear').forEach((g) => { g.style.contentVisibility = 'visible'; }));
  const propios = await page.evaluate(() => [...document.querySelectorAll('#tab-bodega .ggrid')][0]
    ? [...document.querySelectorAll('#tab-bodega .ggrid')[0].querySelectorAll('.gear')].map((c) => {
      const u = c.querySelector('.ds.uso'); const b = c.querySelector('[data-ayuda-item]');
      return { k: b && b.getAttribute('data-ayuda-item'), uso: u ? u.textContent : null, alto: u ? u.getBoundingClientRect().height : 0 };
    }) : []);
  ok(propios.length > 0, `la Bodega muestra tus equipos (${propios.length})`);
  for (const p of propios) ok(p.k && p.uso && p.alto > 0 && p.uso === await page.evaluate((k) => window.I18N.TL(window.Game.CATALOG[k].uso), p.k), `equipo propio ${p.k}: se ve "para qué sirve" (${p.uso})`);
  await ocultarToast();
  await page.evaluate(() => document.getElementById('tusEquipos').scrollIntoView());
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, 'desc_bodega.png') });

  // Tienda: todas las categorías
  const cats = await page.$$eval('[data-act="cat"]', (xs) => xs.map((x) => x.dataset.k));
  ok(cats.length >= 10, `la tienda tiene ${cats.length} categorías`);
  const vistos = new Set();
  for (const c of cats) {
    await page.click(`[data-act="cat"][data-k="${c}"]`);
    const r = await page.evaluate(() => {
      const G = window.Game, TL = window.I18N.TL;
      const grids = document.querySelectorAll('#tab-bodega .ggrid');
      const shop = grids[grids.length - 1];
      // Las tarjetas fuera de pantalla no se dibujan (content-visibility:auto): para medirlas se dibujan todas
      shop.querySelectorAll('.gear').forEach((g) => { g.style.contentVisibility = 'visible'; });
      return [...shop.querySelectorAll('.gear')].map((card) => {
        const b = card.querySelector('[data-ayuda-item]');
        const k = card.dataset.item || card.dataset.ex || (b && b.getAttribute('data-ayuda-item'));
        const u = card.querySelector('.ds.uso');
        const rc = u ? u.getBoundingClientRect() : null;
        const cr = card.getBoundingClientRect();
        return { k, uso: u ? u.textContent : null, esperado: G.CATALOG[k] ? TL(G.CATALOG[k].uso) : '?', visible: !!(rc && rc.height > 10 && rc.width > 40), dentro: !!(rc && rc.right <= cr.right + 1 && rc.left >= cr.left - 1), info: !!card.querySelector('[data-ayuda-item]'), ancho: cr.width };
      });
    });
    for (const x of r) {
      vistos.add(x.k);
      ok(x.uso && x.uso === x.esperado && x.visible && x.dentro, `tienda ${c}/${x.k}: la tarjeta muestra "para qué sirve" (${x.uso})`);
      ok(x.info, `tienda ${c}/${x.k}: la tarjeta tiene el "?" con el detalle`);
    }
    ok((await hscroll()) <= 1, `tienda ${c}: sin desplazamiento horizontal`);
    if (c === 'cam') {
      await ocultarToast();
      await page.evaluate(() => { const c = document.querySelector('#tab-bodega [data-item]'); if (c) { c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -150); } });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, 'desc_tienda.png') });
    }
  }
  const enVenta = await page.evaluate(() => Object.keys(window.Game.CATALOG).filter((k) => !window.Game.CATALOG[k].premium || window.Game.CATALOG[k].exclusivo).length);
  ok(vistos.size >= enVenta, `se revisaron ${vistos.size} tarjetas de ${enVenta} equipos en venta`);

  // "?" en una tarjeta: abre la hoja con la frase y el detalle técnico
  await page.click('[data-act="cat"][data-k="cam"]');
  await page.locator('#tab-bodega [data-item="cam_gopra_heroe13"] [data-ayuda-item]').click();
  await page.waitForSelector('.ay-velo .ay-item');
  const hoja = await page.evaluate(() => { const h = document.querySelector('.ay-velo .ay-item'); return { t: h.textContent, ancho: h.scrollWidth - h.clientWidth }; });
  const it = await page.evaluate(() => ({ uso: window.Game.CATALOG.cam_gopra_heroe13.uso, desc: window.Game.CATALOG.cam_gopra_heroe13.desc, name: window.Game.CATALOG.cam_gopra_heroe13.name }));
  ok(hoja.t.includes('¿Para qué sirve?') && hoja.t.includes(it.uso) && hoja.t.includes(it.desc) && hoja.t.includes(it.name), 'el "?" abre "¿Para qué sirve?" con nombre, frase y detalle técnico');
  ok(hoja.ancho <= 1, 'la hoja del "?" no se desborda a lo ancho');
  await page.waitForTimeout(350);   // termina la animación de la hoja
  await page.screenshot({ path: path.join(outDir, 'desc_info.png') });
  await page.locator('.ay-velo .btn.main').click();
  ok(!(await page.$('.ay-velo')), 'la hoja se cierra con "Entendido"');

  // Preparar evento: frase corta en cada equipo; el "?" no marca ni desmarca
  await page.click('nav button[data-tab="clientes"]');
  if (!(await page.locator('[data-act="prep"]').count())) { await page.click('[data-act="mkt"][data-k="visitar"]'); await cerrarVentanas(); }
  await page.locator('[data-act="prep"]').first().click();
  await page.waitForSelector('[data-act="go-live"]');
  const prep = await page.evaluate(() => [...document.querySelectorAll('#modal label.pick input[data-act="tog-equip"]')].map((i) => {
    const l = i.closest('.pick'); const u = l.querySelector('.pkuso'); const b = l.querySelector('[data-ayuda-item]');
    return { id: i.dataset.id, k: b && b.getAttribute('data-ayuda-item'), uso: u ? u.textContent : null, alto: u ? u.getBoundingClientRect().height : 0, alto_fila: l.getBoundingClientRect().height };
  }));
  ok(prep.length > 0, `la preparación lista tus equipos (${prep.length})`);
  for (const p of prep) {
    ok(p.k && p.uso && p.alto > 0, `preparación ${p.k}: se ve "para qué sirve"`);
    ok(p.alto <= 32, `preparación ${p.k}: la frase ocupa como mucho 2 líneas (${Math.round(p.alto)}px)`);
  }
  ok((await page.evaluate(() => document.getElementById('modal').scrollWidth - document.getElementById('modal').clientWidth)) <= 1 && (await hscroll()) <= 1, 'preparación: sin desplazamiento horizontal');
  {
    const p = prep[0];
    const antes = await page.isChecked(`#eq-${p.id}`);
    await page.locator(`#modal label.pick:has(#eq-${p.id}) [data-ayuda-item]`).click();
    await page.waitForSelector('.ay-velo .ay-item');
    ok((await page.isChecked(`#eq-${p.id}`)) === antes, 'el "?" de la preparación no marca ni desmarca el equipo');
    await page.locator('.ay-velo .btn.main').click();
  }
  await ocultarToast();
  await page.evaluate(() => { const l = document.querySelector('#modal label.pick input[data-act="tog-equip"]'); if (l) l.closest('.pick').scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, 'desc_prep.png') });
  await page.locator('#modal [data-act="close"]').first().click();

  // En alemán (frases aún sin traducir): se ve el español, nunca "item.x.uso"
  await page.evaluate(() => { window.I18N.setIdioma('de'); return window.I18N.listo; });
  await page.waitForFunction(() => window.I18N.idioma === 'de', null, { timeout: 10000 }).catch(() => {});
  await cerrarVentanas();
  await page.click('nav button[data-tab="bodega"]');
  await page.click('[data-act="cat"][data-k="cam"]');
  const de = await page.evaluate(() => [...document.querySelectorAll('#tab-bodega .ds.uso')].map((x) => x.textContent));
  const esp = await page.evaluate(() => window.Game.TEXTOS['item.cam_basic.uso']);
  ok(de.length > 0 && de.every((t) => t && !/^item\./.test(t)), `de: las frases se ven (${de.length}) y ninguna es una clave`);
  ok(de.includes(esp) || await page.evaluate(() => !!(window.I18N_JUEGO && window.I18N_JUEGO.de && window.I18N_JUEGO.de['item.cam_basic.uso'])), 'de: sin traducción, se ve la frase en español');
  const btnLbl = await page.evaluate(() => { const b = document.querySelector('#tab-bodega [data-ayuda-item]'); return b && b.getAttribute('aria-label'); });
  ok(btnLbl && !/equipo\.ver/.test(btnLbl), `de: el "?" tiene etiqueta legible (${btnLbl})`);

  ok(!errores.length, 'sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();
  fin();
})().catch((e) => { console.error('❌', e); process.exit(1); });

function fin() {
  if (fallas) { console.error(`\n❌ ${fallas} fallas`); process.exit(1); }
  console.log('\n✅ Descripciones de equipos OK');
}
