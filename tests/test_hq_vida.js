/* Prueba de la "vida" de la sede en Inicio (Art.hq en js/art.js): gente que entra y sale, un carro o una moto que
   pasa, la luz de EN VIVO, ondas de la antena (estudio y centro), nubes y pájaros de día, estrellas, estrella fugaz y
   el poste que parpadea de noche, vapor del café si hay cafetera (decoración).
   Juego real en Chromium (celular 390x844), garaje → oficina → estudio → centro, de día y de noche. Revisa:
     - sin errores de JS; la sede dibuja su capa de vida (.hq-vida) y no rompe la decoración ni el letrero con el nombre;
     - la gente que camina depende de cuántas personas tienes (1 → 1, 2-3 → 2, 4 o más → 3);
     - hay animaciones CSS corriendo dentro de la sede (y las del día no salen de noche y al revés);
     - con "reducir movimiento" no corre ninguna animación dentro de la sede;
     - lo agregado pesa poco (< 6 KB por sede).
   Capturas en dos momentos de la animación: tests/capturas/hq_vida_<etapa>_<dia|noche>_<a|b>.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_hq_vida.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const G = require('../js/logic.js');
const D = require('../js/decoracion.js');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

const ETAPAS = ['garaje', 'oficina', 'estudio', 'centro'];
const TAM = [0, 15, 23, 31];                 // tamaño (personas + equipos) de cada local (BALANCE.daily.rent)
const GENTE = [1, 3, 5, 8];                  // personas en cada caso
const caminantes = (n) => (n <= 1 ? 1 : n <= 3 ? 2 : 3);

// Partida guardada con la lógica real: N personas, equipos hasta llegar al local, día o noche, decoración
function partida(etapa, noche) {
  const s = G.newGame(7);
  s.chapter = Math.min(4, etapa + 1); s.day = 20 + (noche ? 0 : 1); s.money = 20000; s.rep = 40;
  s.stats.events = 30; s.stats.fiveStars = 10;
  s.productora = etapa % 2 ? 'Tukán Producciones' : '';
  for (let i = 1; i < GENTE[etapa]; i++) s.staff.push({ id: 100 + i, name: 'Persona ' + i, role: ['camarografo', 'asistente', 'tecnico'][i % 3], tier: 'junior', skill: 2, wage: 15, morale: 90, events: 1 });
  const cams = ['cam_basic', 'cam_pro', 'cam_cine'];
  for (let i = 0; i < Math.min(etapa + 1, 3); i++) s.equip.push({ id: 900 + i, type: cams[i], condition: 90 });
  let k = 0;
  while (s.staff.length + s.equip.length < TAM[etapa] + 1) s.equip.push({ id: 1000 + k++, type: 'mics', condition: 90 });
  // Decoración: cafetera en todos los locales (vapor), flores y sofá; en el estudio y el centro también el neón
  ['cafetera', 'flores', 'sofa'].concat(etapa >= 2 ? ['neon'] : []).forEach((x) => D.comprar(s, x));
  return { save: G.serialize(s), venue: G.venue(s) };
}

async function abrir(browser, save, reducir) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: reducir ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|fonts\.g|ERR_/.test(m.text())) errores.push(m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(RAIZ, 'index.html')) });
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/estado') return json(200, { ok: true, tienda: { productos: [], premium: [] }, logueado: false, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' } });
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      return json(404, { ok: false });
    }
    const f = path.join(RAIZ, decodeURIComponent(u.pathname).replace(/^\//, ''));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript((sv) => {
    try {
      localStorage.setItem('envivo_lang', 'es'); localStorage.setItem('envivo_tycoon_save_v1', sv);
      localStorage.setItem('envivo_aviso_cuenta', '3'); localStorage.setItem('envivo_guia_v1', '"hecha"');
    } catch (e) { /* nada */ }
  }, save);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hqcard svg.hq', { timeout: 8000 });
  await page.waitForTimeout(600);
  for (let i = 0; i < 6; i++) { const x = await page.$('#overlay.on [data-act^="close"]'); if (!x) break; await x.click(); await page.waitForTimeout(200); }
  await page.evaluate(() => window.scrollTo(0, 0));
  return { ctx, page, errores };
}

// Animaciones CSS que corren dentro de la sede de Inicio
const animaciones = (page) => page.evaluate(() => {
  const svg = document.querySelector('.hqcard svg.hq');
  return document.getAnimations().filter((a) => a.effect && a.effect.target && svg.contains(a.effect.target))
    .map((a) => ({ n: a.animationName || '', c: String(a.effect.target.getAttribute('class') || ''), p: a.effect.target.closest('[class*="hqv-"]') ? String(a.effect.target.closest('[class*="hqv-"]').getAttribute('class')) : '' }));
});
// Lleva todas las animaciones de la sede al mismo instante (ms) para que la captura salga igual siempre
const congelar = (page, ms) => page.evaluate((t) => {
  const svg = document.querySelector('.hqcard svg.hq');
  document.getAnimations().forEach((a) => { if (a.effect && a.effect.target && svg.contains(a.effect.target)) { a.pause(); a.currentTime = t; } });
}, ms);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    for (let etapa = 0; etapa < 4; etapa++) {
      for (const noche of [false, true]) {
        const tag = `${ETAPAS[etapa]} ${noche ? 'noche' : 'día'}`;
        const { save, venue } = partida(etapa, noche);
        bien(venue.nivel === etapa, `${tag}: la partida está en el local ${ETAPAS[etapa]} (nivel ${venue.nivel})`);
        const { ctx, page, errores } = await abrir(browser, save, false);
        const info = await page.evaluate(() => {
          const svg = document.querySelector('.hqcard svg.hq'), v = svg.querySelector('.hq-vida');
          const s = window.__game && window.__game.state;
          return {
            vida: !!v, caminantes: svg.querySelectorAll('.hqv-gente > g').length,
            decor: !!svg.querySelector('.decor-capa .dc-vitrina'), letrero: [...svg.querySelectorAll('text')].map((t) => t.textContent).join('|'),
            vapor: !!svg.querySelector('.hqv-vapor'), autos: svg.querySelectorAll('.hqv-auto').length,
            ondas: !!svg.querySelector('.hqv-ondas'), tally: !!svg.querySelector('.hqv-tally, .hqv-halo'),
            nubes: !!svg.querySelector('.hqv-nube'), estrellas: svg.querySelectorAll('.hqv-est').length, poste: !!svg.querySelector('.hqv-poste'),
            peso: svg.querySelectorAll('[class*="hqv-"]').length ? [...svg.querySelectorAll('.hq-vida, .hqv-poste, .hqv-nube')].reduce((n, e) => n + e.outerHTML.length, 0) : 0,
            staff: s ? s.staff.length : 0, prod: s ? s.productora : '',
          };
        });
        bien(info.vida, `${tag}: la sede tiene su capa de vida`);
        bien(info.caminantes === caminantes(info.staff), `${tag}: ${info.caminantes} caminando con ${info.staff} personas (esperado ${caminantes(info.staff)})`);
        bien(info.decor, `${tag}: la decoración sigue sobre la sede`);
        bien(!info.prod || info.letrero.includes(info.prod.toUpperCase()), `${tag}: el letrero sigue con el nombre de la productora`);
        bien(info.vapor, `${tag}: sale vapor del café (hay cafetera)`);
        bien(info.autos >= 1 && info.tally, `${tag}: pasa un carro/moto y titila la luz de EN VIVO`);
        bien(info.ondas === (etapa >= 2), `${tag}: ondas de la antena ${etapa >= 2 ? 'sí' : 'no'} (estudio y centro)`);
        bien(noche ? info.estrellas >= 4 && info.poste && !info.nubes : info.nubes && info.estrellas === 0, `${tag}: ${noche ? 'estrellas y poste' : 'nubes'} según la hora`);
        bien(info.peso > 0 && info.peso < 6144, `${tag}: lo agregado pesa ${info.peso} B (< 6 KB)`);
        const an = await animaciones(page);
        const vivas = an.filter((a) => /hqv-/.test(a.c + ' ' + a.p));
        bien(vivas.length >= 8, `${tag}: ${vivas.length} animaciones de vida corriendo (${an.length} en total en la sede)`);
        // Capturas en dos momentos (animaciones congeladas en el mismo instante: salen iguales cada vez)
        const nom = `hq_vida_${ETAPAS[etapa]}_${noche ? 'noche' : 'dia'}`;
        for (const [m, ms] of [['a', 2500], ['b', 9000]]) {
          await congelar(page, ms);
          await page.locator('.hqcard svg.hq').screenshot({ path: path.join(OUT, `${nom}_${m}.png`) });
        }
        if (etapa === 3 && !noche) await page.screenshot({ path: path.join(OUT, 'hq_vida_inicio.png') });
        bien(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: sin desborde horizontal`);
        bien(errores.length === 0, `${tag}: sin errores de JS` + (errores.length ? ': ' + errores.join(' | ') : ''));
        await ctx.close();

        // Reducir movimiento: nada se mueve dentro de la sede (pero sigue dibujada)
        if (noche || etapa === 3) {
          const r = await abrir(browser, save, true);
          const an2 = await animaciones(r.page);
          bien(an2.length === 0, `${tag}: con "reducir movimiento" no corre ninguna animación en la sede (${an2.length}${an2.length ? ': ' + an2.slice(0, 5).map((a) => a.n + '/' + a.c).join(', ') : ''})`);
          bien(await r.page.evaluate(() => !!document.querySelector('.hqcard svg.hq .hq-vida')), `${tag}: con "reducir movimiento" la sede se sigue dibujando`);
          if (etapa === 3 && noche) await r.page.locator('.hqcard svg.hq').screenshot({ path: path.join(OUT, 'hq_vida_reducido.png') });
          bien(r.errores.length === 0, `${tag} (reducir movimiento): sin errores de JS` + (r.errores.length ? ': ' + r.errores.join(' | ') : ''));
          await r.ctx.close();
        }
      }
    }
    // Sin documento (Node): Art.hq sigue devolviendo un SVG con la vida y su <style>
    {
      globalThis.Game = G; require('../js/art.js');
      const Art = globalThis.Art;
      const s = G.deserialize(partida(1, true).save);
      const svg = Art.hq(s);
      bien(/^<svg class="hq"/.test(svg.trim()) && /hq-vida/.test(svg) && /<style>/.test(svg), 'Node: Art.hq dibuja la vida y trae sus estilos dentro del SVG');
    }
  } catch (e) {
    fallas++; console.error('❌ error en la prueba:', e);
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})();
