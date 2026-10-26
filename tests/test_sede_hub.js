/* Prueba de la productora por dentro (js/hub.js): el centro de Inicio. Juego real en Chromium, celular 390x844 y 360x780.
   Revisa:
     - cada lugar de la sede abre su pantalla (pestaña u hoja de abajo con las tarjetas de sus módulos);
     - avisos: ofertas en Clientes, equipos por reparar en Bodega, "!" en Misiones con el premio diario (y se va al reclamar);
     - los lugares sin abrir dicen por qué (sala de control antes del Estudio, antena antes del capítulo 1, buzón sin cuenta);
     - la escena cambia del garaje al centro de producción (etapa, sala de control, letrero, vehículo);
     - un módulo sin lugar va a "Más" y uno con { hub } va a su lugar;
     - botones de 44 px o más con su etiqueta visible, sin desborde horizontal, sin errores de JS, "reducir movimiento";
     - el botón para pasar el día sigue en Inicio.
   Capturas: tests/capturas/hub_<etapa>.png, hub_avisos.png, hub_hoja.png, hub_360.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_sede_hub.js */
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
const TAM = [0, 15, 23, 31];
const GENTE = [1, 3, 5, 8];
// Partida en cada local (con la lógica real); etapa 0 = partida nueva del tutorial
function partida(etapa, o) {
  o = o || {};
  const s = G.newGame(11);
  if (etapa > 0) {
    s.chapter = Math.min(4, etapa + 1); s.day = 21; s.money = 20000; s.rep = 40 + etapa * 10;
    s.stats.events = 30; s.stats.fiveStars = 10;
    s.productora = 'Tukán Producciones';
    for (let i = 1; i < GENTE[etapa]; i++) s.staff.push({ id: 100 + i, name: 'Persona ' + i, role: ['camarografo', 'asistente', 'tecnico'][i % 3], tier: 'junior', skill: 2, wage: 15, morale: 90, events: 1 });
    ['cam_basic', 'cam_pro', 'cam_cine'].slice(0, Math.min(etapa + 1, 3)).forEach((c, i) => s.equip.push({ id: 900 + i, type: c, condition: 90 }));
    if (etapa >= 2) s.equip.push({ id: 1500, type: etapa === 3 ? 'veh_sprinto_ob_usada' : 'veh_camioneta_carga', condition: 90 });
    let k = 0;
    while (s.staff.length + s.equip.length < TAM[etapa] + 1) s.equip.push({ id: 1000 + k++, type: 'mics', condition: 90 });
    ['cafetera', 'flores', 'sofa'].concat(etapa >= 2 ? ['neon', 'tv'] : []).forEach((x) => D.comprar(s, x));
  }
  if (o.danado) s.equip[0].condition = 15;
  if (o.sinOfertas) s.contracts = [];
  return { save: G.serialize(s), venue: G.venue(s) };
}

async function abrir(browser, save, op) {
  op = op || {};
  const ctx = await browser.newContext({ viewport: { width: op.w || 390, height: op.h || 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'es-EC', reducedMotion: op.reducir ? 'reduce' : 'no-preference' });
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
  await page.addInitScript((a) => {
    window.__ENVIVO_FECHA = a.fecha || '2026-06-10';   // fecha fija: sin temporadas especiales (salvo que la prueba pida una)
    try {
      localStorage.setItem('envivo_lang', 'es'); localStorage.setItem('envivo_tycoon_save_v1', a.save);
      localStorage.setItem('envivo_aviso_cuenta', '3'); localStorage.setItem('envivo_guia_v1', '"hecha"');
    } catch (e) { /* nada */ }
    if (a.modulos) {
      window.EnVivoInicio = window.EnVivoInicio || [];
      window.EnVivoInicio.push({ id: 'prueba_suelta', orden: 99, tarjeta: () => '<div class="card" id="prueba-suelta"><h3>Módulo sin lugar</h3></div>' });
      window.EnVivoInicio.push({ id: 'prueba_sala', orden: 98, hub: 'sala', tarjeta: () => '<div class="card" id="prueba-sala"><h3>Módulo de la sala</h3></div>' });
    }
  }, { save, modulos: !!op.modulos, fecha: op.fecha || null });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hubcard svg.hub-svg', { timeout: 8000 });
  await page.waitForTimeout(700);
  for (let i = 0; i < 6; i++) { const x = await page.$('#overlay.on [data-act^="close"]'); if (!x) break; await x.click(); await page.waitForTimeout(150); }
  // Un pintado más, ya con todos los módulos (los diferidos llegan después del primero)
  await page.click('nav button[data-tab="inicio"]');
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 0));
  return { ctx, page, errores };
}
// Animaciones quietas en el mismo instante y sin el aviso de arriba (las capturas salen iguales cada vez)
const congelar = (page) => page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = 2500; } catch (e) { /* nada */ } }); });
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tabActiva = (page) => page.evaluate(() => { const s = document.querySelector('main section.on'); return s ? s.id.replace('tab-', '') : ''; });
const hojaAbierta = (page) => page.evaluate(() => { const h = document.getElementById('hubSheet'); return h && h.classList.contains('on') ? { lugar: h.dataset.lugar, html: h.querySelector('.hub-sh-cuerpo').innerHTML, tit: h.querySelector('.hub-sh-t').textContent.trim() } : null; });
const toastTxt = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return t && t.style.display !== 'none' ? t.textContent : ''; });
const volverInicio = async (page) => { await page.evaluate(() => { if (window.Hub) window.Hub.cerrar(); }); await page.click('nav button[data-tab="inicio"]'); await page.waitForTimeout(150); await page.evaluate(() => window.scrollTo(0, 0)); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    /* ---------- 1. Garaje (partida nueva, 390x844): todos los lugares ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, partida(0).save, { modulos: true });
      const info = await page.evaluate(() => {
        const svg = document.querySelector('.hubcard svg.hub-svg');
        const r = (el) => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x, y: b.y }; };
        return {
          etapa: svg.dataset.etapa, label: svg.getAttribute('aria-label'),
          lugares: [...document.querySelectorAll('.hub .hs')].map((b) => ({ k: b.dataset.hub, lock: b.classList.contains('lock'), act: b.dataset.act || '', box: r(b), pill: r(b.querySelector('.hs-pill')), txt: b.querySelector('.hs-pill').textContent.trim(), badge: b.querySelector('.hs-b') ? b.querySelector('.hs-b').textContent : null, aria: b.getAttribute('aria-label') })),
          mas: r(document.querySelector('.hub-mas')),
          viejas: document.querySelectorAll('#tab-inicio .pl, #tab-inicio .pl-nuevo').length,
          dia: !!document.querySelector('#tab-inicio [data-act="next-day"]'),
          ahora: (document.querySelector('#tab-inicio .hub-ahora') || {}).textContent || '',
          cap: (document.querySelector('#tab-inicio .hub-cap') || {}).textContent || '',
          ofertas: window.__game ? window.__game.state.contracts.length : document.querySelectorAll('#badgeC').length,
          vw: window.innerWidth,
        };
      });
      bien(info.etapa === '0' && /Garaje/i.test(info.label), `garaje: la escena es del garaje (${info.label})`);
      const ks = info.lugares.map((l) => l.k).sort().join(',');
      bien(ks === 'antena,bodega,buzon,clientes,control,flota,historia,logros,misiones,personal,sala,sede', 'garaje: los 12 lugares están en la escena: ' + ks);
      bien(info.viejas === 0, 'garaje: ya no hay filas plegables ni etiquetas "Nuevo" en Inicio');
      bien(info.dia, 'garaje: el botón para pasar el día sigue en Inicio');
      bien(/primer evento/i.test(info.ahora), `garaje: "qué hacer ahora" lleva al primer evento ("${info.ahora.trim()}")`);
      bien(/Capítulo 1/.test(info.cap), 'garaje: se ve el capítulo actual debajo de la escena');
      const chicos = info.lugares.filter((l) => l.box.w < 44 || l.box.h < 44);
      bien(!chicos.length && info.mas.w >= 44 && info.mas.h >= 44, 'garaje: todos los botones miden 44 px o más' + (chicos.length ? ' (chicos: ' + chicos.map((l) => l.k).join(',') + ')' : ''));
      const fuera = info.lugares.filter((l) => l.pill.x < 0 || l.pill.x + l.pill.w > info.vw + 1 || l.pill.w < 30);
      bien(!fuera.length, 'garaje: cada etiqueta (ícono + nombre) se ve completa dentro de la pantalla' + (fuera.length ? ' (' + fuera.map((l) => l.k).join(',') + ')' : ''));
      const cl = info.lugares.find((l) => l.k === 'clientes');
      bien(cl && cl.badge === String(info.ofertas) && info.ofertas > 0, `garaje: Clientes muestra ${cl && cl.badge} ofertas`);
      const mi = info.lugares.find((l) => l.k === 'misiones');
      bien(mi && mi.badge === '!', 'garaje: Misiones avisa "!" (premio diario por reclamar)');
      const locks = info.lugares.filter((l) => l.lock).map((l) => l.k).sort().join(',');
      bien(locks === 'antena,buzon,control', 'garaje: sin abrir todavía la antena, el buzón (sin cuenta) y la sala de control: ' + locks);
      bien(info.lugares.find((l) => l.k === 'control').txt === 'En obra', 'garaje: la sala de control dice "En obra"');
      await congelar(page);
      await page.screenshot({ path: path.join(OUT, 'hub_garaje.png') });

      // Lugares bloqueados: dicen por qué y no abren nada
      for (const [k, re] of [['control', /Estudio propio/], ['antena', /capítulo 1/], ['buzon', /cuenta/]]) {
        await page.click(`.hs[data-hub="${k}"]`);
        await page.waitForTimeout(120);
        const t = await toastTxt(page);
        bien(re.test(t) && !(await hojaAbierta(page)) && (await tabActiva(page)) === 'inicio', `garaje: "${k}" bloqueado explica por qué ("${t}")`);
      }
      // Lugares que llevan a una pestaña
      for (const [k, tb] of [['clientes', 'clientes'], ['personal', 'personal'], ['bodega', 'bodega']]) {
        await volverInicio(page);
        await page.click(`.hs[data-hub="${k}"]`);
        await page.waitForTimeout(150);
        bien((await tabActiva(page)) === tb, `garaje: "${k}" abre la pestaña ${tb}`);
      }
      // Lugares con hoja: cada uno con sus tarjetas
      const HOJAS = { logros: /data-ext="logros"/, historia: /Capítulo 1|story-tag/, misiones: /data-ext="diario"[\s\S]*|data-ext="misiones"/, sala: /data-ext="decoracion"/, flota: /data-ext="flota"/, sede: /data-ext="sede"|prod-nom/ };
      for (const k of Object.keys(HOJAS)) {
        await volverInicio(page);
        await page.click(`.hs[data-hub="${k}"]`);
        await page.waitForTimeout(200);
        const h = await hojaAbierta(page);
        bien(h && h.lugar === k && HOJAS[k].test(h.html), `garaje: "${k}" abre su hoja (${h ? h.tit : 'nada'})`);
      }
      // La sala tiene la decoración y el módulo que pidió ese lugar; el módulo sin lugar va a "Más"
      await volverInicio(page);
      await page.click('.hs[data-hub="sala"]'); await page.waitForTimeout(150);
      const sala = await hojaAbierta(page);
      bien(sala && /prueba-sala/.test(sala.html) && !/prueba-suelta/.test(sala.html), 'un módulo con { hub: "sala" } sale en la Sala');
      await volverInicio(page);
      await page.click('.hub-mas'); await page.waitForTimeout(150);
      const mas = await hojaAbierta(page);
      bien(mas && mas.lugar === 'mas' && /prueba-suelta/.test(mas.html) && /data-act="new-game"/.test(mas.html) && /data-act="idioma"/.test(mas.html), 'un módulo sin lugar sale en "Más" (con idioma y partida nueva)');
      // Cerrar la hoja: con la X y tocando afuera
      await page.click('#hubSheet [data-hub-cerrar]'); await page.waitForTimeout(100);
      bien(!(await hojaAbierta(page)), 'la hoja se cierra con la X');
      await page.click('.hs[data-hub="logros"]'); await page.waitForTimeout(150);
      await page.mouse.click(10, 140); await page.waitForTimeout(100);
      bien(!(await hojaAbierta(page)), 'la hoja se cierra tocando afuera');

      // Premio diario: el "!" de Misiones se va al reclamar (la hoja se repinta sola)
      await volverInicio(page);
      await page.click('.hs[data-hub="misiones"]'); await page.waitForTimeout(200);
      await congelar(page);
      await page.screenshot({ path: path.join(OUT, 'hub_hoja.png') });
      const rec = await page.$('#hubSheet [data-ext="diario"][data-acc="reclamar"]');
      bien(!!rec, 'la hoja de Misiones trae el botón para reclamar el premio diario');
      if (rec) { await rec.click(); await page.waitForTimeout(400); }
      for (let i = 0; i < 4; i++) { const x = await page.$('#overlay.on [data-act^="close"], #overlay.on .btn.main'); if (!x) break; await x.click(); await page.waitForTimeout(150); }
      const h2 = await hojaAbierta(page);
      bien(!h2 || !/data-acc="reclamar"[^>]*>[^<]*Reclamar/.test(h2.html), 'la hoja de Misiones se repinta después de reclamar');
      await volverInicio(page);
      const badge = await page.evaluate(() => { const b = document.querySelector('.hs[data-hub="misiones"] .hs-b'); return b ? b.textContent : ''; });
      bien(badge !== '!', `después de reclamar, Misiones ya no avisa "!" (${badge || 'sin aviso'})`);
      bien(await sinDesborde(page), 'garaje: sin desborde horizontal');
      bien(errores.length === 0, 'garaje: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 2. Cada local: la escena cambia (390x844) ---------- */
    const firmas = [];
    for (let e = 1; e < 4; e++) {
      const { save, venue } = partida(e, { danado: e === 2 });
      bien(venue.nivel === e, `${ETAPAS[e]}: la partida está en el local ${ETAPAS[e]}`);
      const { ctx, page, errores } = await abrir(browser, save, {});
      const info = await page.evaluate(() => {
        const svg = document.querySelector('.hubcard svg.hub-svg');
        const lug = (k) => document.querySelector(`.hs[data-hub="${k}"]`);
        return {
          etapa: svg.dataset.etapa, texto: [...svg.querySelectorAll('text')].map((t) => t.textContent).join('|'),
          control: lug('control').classList.contains('lock'), antena: lug('antena').classList.contains('lock'),
          bodega: lug('bodega').querySelector('.hs-b') ? lug('bodega').querySelector('.hs-b').textContent : '',
          vehiculo: !!svg.querySelector('[data-cuarto="flota"] svg, [data-cuarto="flota"] [fill="url(#am-wht)"]'),
          vida: !!svg.querySelector('.hq-vida'), decor: !!svg.querySelector('.decor-capa .dc-vitrina'),
          ondas: !!svg.querySelector('.hqv-ondas'), monitores: svg.querySelectorAll('[data-cuarto="control"] rect').length,
          ahora: (document.querySelector('#tab-inicio .hub-ahora, #tab-inicio .dnstrip') || {}).textContent || '',
          peso: svg.outerHTML.length,
        };
      });
      firmas.push(info);
      bien(info.etapa === String(e), `${ETAPAS[e]}: la escena dibuja el local ${e}`);
      bien(info.control === (e < 2), `${ETAPAS[e]}: la sala de control ${e < 2 ? 'sigue en obra' : 'ya está abierta'}`);
      bien(!info.antena, `${ETAPAS[e]}: la antena ya está abierta (capítulo ${e + 1})`);
      bien(info.texto.includes('TUKÁN PRODUCCIONES'), `${ETAPAS[e]}: el letrero lleva el nombre de la productora`);
      bien(info.vida && info.decor, `${ETAPAS[e]}: la vida de la sede y la decoración siguen en la escena`);
      bien(info.ondas === (e >= 2), `${ETAPAS[e]}: ondas en la antena ${e >= 2 ? 'sí' : 'no'}`);
      bien(info.vehiculo === (e >= 2), `${ETAPAS[e]}: ${e >= 2 ? 'el vehículo está en el garaje' : 'garaje sin vehículo'}`);
      bien(info.peso < 90000, `${ETAPAS[e]}: la escena pesa ${Math.round(info.peso / 1024)} KB`);
      if (e === 2) {
        bien(info.bodega === '1', `${ETAPAS[e]}: Bodega avisa 1 equipo por reparar (${info.bodega})`);
        bien(/reparaci/i.test(info.ahora), `${ETAPAS[e]}: "qué hacer ahora" avisa de la reparación`);
        await page.click('.hs[data-hub="control"]'); await page.waitForTimeout(150);
        bien((await tabActiva(page)) === 'registro', `${ETAPAS[e]}: la sala de control abre el registro`);
        await volverInicio(page);
        await page.click('.hs[data-hub="antena"]'); await page.waitForTimeout(150);
        const h = await hojaAbierta(page);
        bien(h && h.lugar === 'antena' && /data-tab="online"/.test(h.html), `${ETAPAS[e]}: la antena abre En línea (hoja con el botón)`);
        await page.click('#hubSheet [data-tab="online"]'); await page.waitForTimeout(250);
        bien((await tabActiva(page)) === 'online' && !(await hojaAbierta(page)), `${ETAPAS[e]}: el botón lleva a la pestaña En línea y la hoja se cierra`);
        await volverInicio(page);
      }
      await congelar(page);
      await page.screenshot({ path: path.join(OUT, `hub_${ETAPAS[e]}.png`) });
      if (e === 2) await page.screenshot({ path: path.join(OUT, 'hub_avisos.png') });
      bien(await sinDesborde(page), `${ETAPAS[e]}: sin desborde horizontal`);
      bien(errores.length === 0, `${ETAPAS[e]}: sin errores de JS` + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
    bien(firmas[0].texto !== firmas[2].texto || firmas[0].monitores !== firmas[2].monitores, 'la escena del centro no es la misma que la de la oficina');

    /* ---------- 2b. Evento especial (Navidad): "qué hacer ahora" lo avisa y lleva a la pizarra ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, partida(1).save, { fecha: '2026-12-20' });
      const ah = await page.evaluate(() => { const b = document.querySelector('#tab-inicio .hub-ahora'); return b ? { t: b.textContent.trim(), k: b.dataset.hub || '' } : null; });
      bien(ah && /especial/i.test(ah.t) && ah.k === 'misiones', `temporada: "qué hacer ahora" avisa del evento especial (${ah && ah.t})`);
      await page.click('#tab-inicio .hub-ahora'); await page.waitForTimeout(200);
      const h = await hojaAbierta(page);
      bien(h && h.lugar === 'misiones' && /data-acc="oferta"/.test(h.html), 'temporada: abre la pizarra con la oferta especial');
      bien(errores.length === 0, 'temporada: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 3. Celular chico 360x780 y "reducir movimiento" ---------- */
    {
      const { ctx, page, errores } = await abrir(browser, partida(3).save, { w: 360, h: 780, reducir: true });
      const info = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect();
        const bs = [...document.querySelectorAll('.hub .hs, .hub-mas')];
        const hub = document.querySelector('.hub');
        const corriendo = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && hub.contains(a.effect.target)).length;
        const dia = document.querySelector('#tab-inicio [data-act="next-day"]');
        return { chicos: bs.filter((b) => r(b).width < 44 || r(b).height < 44).map((b) => b.dataset.hub || 'mas'), corriendo, dia: !!dia,
          pills: bs.filter((b) => b.querySelector('.hs-pill')).every((b) => { const p = r(b.querySelector('.hs-pill')); return p.left >= 0 && p.right <= window.innerWidth + 1; }) };
      });
      bien(!info.chicos.length, '360x780: todos los botones miden 44 px o más' + (info.chicos.length ? ' (' + info.chicos + ')' : ''));
      bien(info.pills, '360x780: las etiquetas caben en la pantalla');
      bien(info.corriendo === 0, `360x780 con "reducir movimiento": nada se mueve en la sede (${info.corriendo})`);
      bien(info.dia, '360x780: el botón para pasar el día sigue en Inicio');
      for (const k of ['clientes', 'logros']) {
        await volverInicio(page);
        await page.click(k === 'logros' ? `.hs[data-hub="${k}"]` : `.hs[data-hub="${k}"]`); await page.waitForTimeout(150);
        bien(k === 'clientes' ? (await tabActiva(page)) === 'clientes' : !!(await hojaAbierta(page)), `360x780: "${k}" abre su pantalla`);
      }
      await volverInicio(page);
      await congelar(page);
      await page.screenshot({ path: path.join(OUT, 'hub_360.png') });
      bien(await sinDesborde(page), '360x780: sin desborde horizontal');
      bien(errores.length === 0, '360x780: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }
  } catch (err) {
    fallas++;
    console.error('❌ La prueba se cayó:', err);
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})();
