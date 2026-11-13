/* Arreglos de la auditoría del cliente (13 nov 2026), en el juego real (celular 390x844) y en la lógica:
     A. Lógica: migración tolerante (un campo raro no tira la partida), protección de principiante (sin pérdida de fama en
        los primeros 10 eventos ni por olvido), 1★ resta poco, piso de fama, estimación de ofertas (G.estimarOferta) y
        oferta recomendada.
     1. CRÍTICO: partida guardada que no se puede abrir → pantalla "No pudimos abrir tu partida" (Reintentar / Empezar
        partida nueva), la partida queda guardada aparte (envivo_tycoon_save_roto) y NO se guarda nada hasta elegir.
        "Reintentar" no la pisa; "Empezar partida nueva" recién ahí guarda.
     2. Partida con un campo roto (candidatos, evento en curso) se abre igual con su avance.
     3. Clientes: estrellas esperadas en cada oferta, una "Recomendado", las que no puedes hacer bien al final con
        "Te falta: …", y el aviso de la protección de principiante.
     4. Bodega: "Reparar todo" sin plata para todo → "Reparar N de M ($X)" (no desactivado) y repara lo más gastado primero.
        Al abrir la Bodega con equipos en riesgo, abre en "Mis equipos".
     5. Después de un evento con equipo bajo el 25%: aviso con un botón para repararlo; el resultado muestra UNA ganancia
        grande (el detalle va plegado en "De dónde sale la ganancia").
     6. Día 1 sin eventos: "Cerrar el día" chico y pide confirmación.
     7. Guardar falla (sin espacio): un solo aviso.
     8. Service worker: solo español en la precarga, actualización con cache 'no-cache', versión igual a js/api.js, y el
        aviso "Hay una versión nueva — Actualizar".
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_arreglos_cliente.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }
async function captura(page, nombre) {
  for (let i = 0; i < 3; i++) { try { await page.screenshot({ path: path.join(OUT, nombre) }); return; } catch (e) { await page.waitForTimeout(300); } }
}

globalThis.window = globalThis;
require(path.join(RAIZ, 'js/datos.js'));
const G = require(path.join(RAIZ, 'js/logic.js')) || globalThis.Game;

/* ---------- A. Lógica ---------- */
function pruebasLogica() {
  // Migración tolerante
  const s0 = G.newGame(11); s0.day = 9; s0.money = 4321; s0.stats.events = 7;
  const raw = JSON.parse(G.serialize(s0));
  raw.candidates = 'esto no es una lista'; raw.log = 5; raw.hoy = 'x';
  raw.currentEvent = { contract: null, incidents: 3, staffIds: [], equipIds: [] };
  const m = G.deserialize(JSON.stringify(raw));
  bien(!!m && m.day === 9 && m.money === 4321 && m.stats.events === 7, 'A: una partida con campos rotos se abre con su avance (día 9, $4.321, 7 eventos)');
  bien(m && m.currentEvent === null && Array.isArray(m.candidates) && Array.isArray(m.log), 'A: el evento en curso que no se pudo arreglar se descarta; listas rotas quedan vacías');
  bien(G.deserialize('{"v":99,"staff":[]}') === null && G.deserialize('no es json') === null, 'A: una partida de un juego más nuevo o que no es JSON → null (la pantalla pregunta)');
  bien(!!G.deserialize(G.serialize(G.newGame(3))), 'A: una partida normal sigue cargando');

  // Fama: protección de principiante, 1★ suave, piso
  const jugar = (s, forzarQ) => {
    const c = s.contracts.find((x) => !x.internacional && !x.rival) || G.addContract(s, 'misa', 1);
    const lo = G.suggestLoadout(s, c.id);
    G.startEvent(s, c.id, lo.staffIds, lo.equipIds);
    let inc; while ((inc = G.currentIncident(s))) G.resolveIncident(s, inc.choices.find((x) => x.ok).i);
    s.currentEvent.base = forzarQ; s.currentEvent.deltas = [];
    return G.finishEvent(s).result;
  };
  const a = G.newGame(21); a.rep = 12; a.stats.events = 2;
  const r1 = jugar(a, 10);
  bien(r1.stars === 1 && r1.repDelta === 0 && r1.protegido === true && a.rep === 12, `A: 1★ en los primeros 10 eventos no baja la fama (cambio ${r1.repDelta}, protegido ${r1.protegido})`);
  const b = G.newGame(22); b.rep = 30; b.stats.events = 20;
  const r2 = jugar(b, 10);
  bien(r2.stars === 1 && r2.repDelta === -1 && !r2.protegido, `A: después, 1★ en un evento chico resta solo 1 (antes 3): ${r2.repDelta}`);
  const c = G.newGame(23); c.rep = 5; c.stats.events = 20;
  const r3 = jugar(c, 10);
  bien(r3.repDelta === 0 && c.rep === 5, `A: la fama no baja de la de inicio (5) por un evento flojo (queda ${c.rep})`);
  const d = G.newGame(24); d.rep = 30; d.stats.events = 20;
  const r4 = jugar(d, 60);
  bien(r4.stars === 3 && r4.repDelta >= 1, `A: 3★ sigue sumando fama (+${r4.repDelta})`);
  bien(G.BALANCE.starsRep[1] > -2 && G.BALANCE.starsRep[2] === -0.5, 'A: BALANCE.starsRep: 1★ suave, 2★ igual que antes');
  // Olvido: en los primeros 10 eventos no se pierde fama por no trabajar
  const e = G.newGame(25); e.rep = 9; e.stats.events = 4; e.contracts = [];
  for (let i = 0; i < 7; i++) G.nextDay(e);
  bien(e.rep === 9, `A: sin trabajar varios días con menos de 10 eventos la fama no baja (queda ${e.rep})`);

  // Estimación de ofertas y recomendada
  const f = G.newGame(26);
  const ests = f.contracts.map((x) => G.estimarOferta(f, x));
  bien(ests.every((x) => x && x.stars >= 1 && x.stars <= 5 && typeof x.net === 'number' && Array.isArray(x.falta) && typeof x.puede === 'boolean'), 'A: estimarOferta da estrellas, ganancia, lo que falta y si se puede');
  const dif = G.addContract(f, 'barrial', 2);
  if (dif) { const ed = G.estimarOferta(f, dif); bien(ed.falta.length > 0, `A: un evento de 2 cámaras con la cámara de inicio dice qué falta (${ed.falta.join(', ')})`); }
  const rid = G.ofertaRecomendada(f);
  bien(rid === null || f.contracts.some((x) => x.id === rid && G.estimarOferta(f, x).puede), 'A: la recomendada (si hay) es una que se puede hacer');
}

/* ---------- Navegador ---------- */
async function abrir(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(RAIZ, 'index.html')) });
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/estado') return json(200, { ok: true, tienda: { productos: [], premium: [] }, logueado: false, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' } });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    }
    const f = path.join(RAIZ, decodeURIComponent(u.pathname).replace(/^\//, ''));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
  await page.addInitScript((c) => {
    try {
      if (c.sinGuardar) {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (k === 'envivo_tycoon_save_v1' && window.__sinEspacio) throw new DOMException('lleno', 'QuotaExceededError'); return orig.call(this, k, v); };
      }
      window.__toasts = [];
      const mirar = () => { const t = document.getElementById('toast'); if (!t) { setTimeout(mirar, 50); return; } new MutationObserver(() => { if (t.style.display !== 'none' && t.textContent) window.__toasts.push(t.textContent); }).observe(t, { attributes: true, childList: true, characterData: true, subtree: true }); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mirar); else mirar();
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_aviso_cuenta', '9');
      localStorage.setItem('envivo_lang', 'es');
      if (c.partida) localStorage.setItem('envivo_tycoon_save_v1', c.partida);
    } catch (e) { /* nada */ }
  }, { partida: o.partida || null, sinGuardar: !!o.sinGuardar });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  if (o.esperarJuego !== false) {
    await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null, null, { timeout: 20000 });
    await page.waitForTimeout(300);
  }
  return { ctx, page, errores };
}
const overlayOn = (page) => page.evaluate(() => document.getElementById('overlay').classList.contains('on'));
async function cerrarVentanas(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await overlayOn(page))) return;
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="after-result"], #overlay.on [data-act="rep-aviso-no"], #overlay.on [data-act="close"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const clic = (page, act, extra) => page.evaluate(({ a, x }) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, x || {}); b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); }, { a: act, x: extra || null });
function partidaBase(cambios) {
  const s = G.newGame(cambios.seed || 7);
  s.chapter = 1; s.chapterSeen = 1; s.avisos = []; s.capCompletados = [];
  Object.assign(s, cambios.s || {});
  if (cambios.fn) cambios.fn(s);
  return s;
}

(async () => {
  pruebasLogica();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    /* ---------- 1. Partida que no se puede abrir ---------- */
    {
      const ROTA = '{"v":99,"staff":[],"day":40,"money":99999}';
      const { ctx, page, errores } = await abrir(browser, { partida: ROTA, esperarJuego: false });
      await page.waitForSelector('#nubeCarga [data-rota]', { timeout: 20000 }).catch(() => {});
      const txt = await page.evaluate(() => { const e = document.getElementById('nubeCarga'); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ') : ''; });
      bien(/No pudimos abrir tu partida/.test(txt) && /Reintentar/.test(txt) && /Empezar partida nueva/.test(txt), `1: sale "No pudimos abrir tu partida" con Reintentar y Empezar partida nueva ("${txt.slice(0, 120)}")`);
      bien(!/Recuperar desde la nube/.test(txt), '1: sin cuenta antes, no ofrece la nube');
      await captura(page, 'arreglos_rota.png');
      bien(!(await desborde(page)), '1: sin desborde horizontal');
      await page.waitForTimeout(1500);
      const ls = await page.evaluate(() => ({ save: localStorage.getItem('envivo_tycoon_save_v1'), roto: localStorage.getItem('envivo_tycoon_save_roto') }));
      bien(ls.save === ROTA, '1: la partida guardada NO se pisó (ni con una partida nueva)');
      let rotos = []; try { rotos = JSON.parse(ls.roto || '[]'); } catch (e) { rotos = []; }
      bien(rotos.length === 1 && rotos[0].datos === ROTA, '1: quedó una copia aparte (envivo_tycoon_save_roto)');
      bien((await page.evaluate(() => window.__respaldos.rotas().length)) === 1, '1: soporte la ve (window.__respaldos.rotas)');
      // Reintentar: se abre otra vez y la partida sigue sin tocarse (y la copia no se repite)
      await page.click('#nubeCarga [data-act="roto-reintentar"]');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('#nubeCarga [data-rota]', { timeout: 20000 }).catch(() => {});
      const ls2 = await page.evaluate(() => ({ save: localStorage.getItem('envivo_tycoon_save_v1'), n: JSON.parse(localStorage.getItem('envivo_tycoon_save_roto') || '[]').length }));
      bien(ls2.save === ROTA && ls2.n === 1, '1: "Reintentar" vuelve a probar sin pisar nada');
      // Empezar partida nueva: recién ahora se guarda
      await page.click('#nubeCarga [data-act="roto-nueva"]');
      await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 10000 });
      await page.waitForTimeout(400);
      const ls3 = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('envivo_tycoon_save_v1') || 'null'); const e = document.getElementById('nubeCarga'); return { dia: d && d.day, v: d && d.v, oculto: !e || e.hidden, roto: JSON.parse(localStorage.getItem('envivo_tycoon_save_roto') || '[]').length }; });
      bien(ls3.dia === 1 && ls3.v === G.SAVE_VERSION && ls3.oculto, `1: "Empezar partida nueva" arranca y guarda una partida nueva (día ${ls3.dia})`);
      bien(ls3.roto === 1, '1: la copia de la partida rota se queda');
      bien(errores.length === 0, '1: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 2. Partida con un campo roto: se abre igual ---------- */
    {
      const s = partidaBase({ s: { day: 14, money: 5555 }, fn: (x) => { x.stats.events = 12; } });
      const raw = JSON.parse(G.serialize(s)); raw.candidates = 'roto'; raw.currentEvent = { contract: null, incidents: 'x' };
      const { ctx, page, errores } = await abrir(browser, { partida: JSON.stringify(raw) });
      const st = await page.evaluate(() => { const s = window.__game.state; const e = document.getElementById('nubeCarga'); return { dia: s.day, dinero: s.money, ev: s.stats.events, pantalla: !!(e && !e.hidden) }; });
      bien(st.dia === 14 && st.dinero === 5555 && st.ev === 12 && !st.pantalla, `2: la partida con campos rotos se abrió con su avance (día ${st.dia}, $${st.dinero})`);
      bien(errores.length === 0, '2: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 3. Clientes: estrellas esperadas, Recomendado, lo que falta, protección ---------- */
    {
      const s = partidaBase({ s: { day: 2 }, fn: (x) => {
        x.stats.events = 3; x.money = 5000;
        G.buy(x, 'audio_basic');               // con consola: la misa y la boda salen con 2★ o más
        x.money = 1500;
        x.contracts = [];
        G.addContract(x, 'barrial', 2);      // 2 cámaras + switcher: con la cámara de inicio no se puede hacer bien
        G.addContract(x, 'misa', 1);
        G.addContract(x, 'boda', 1);
      } });
      const { ctx, page, errores } = await abrir(browser, { partida: G.serialize(s) });
      await cerrarVentanas(page);
      await page.click('nav button[data-tab="clientes"]');
      await page.waitForSelector('#tab-clientes .ofc');
      const info = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#tab-clientes .ofc')];
        return {
          n: cards.length,
          conEst: cards.filter((c) => c.querySelector('.of-est .of-stars')).length,
          rec: cards.filter((c) => c.querySelector('.of-rec')).length,
          recPrimera: !!(cards[0] && cards[0].querySelector('.of-rec')),
          no: cards.map((c) => c.classList.contains('of-no')),
          falta: cards.filter((c) => c.classList.contains('of-no')).map((c) => (c.querySelector('.of-falta') || {}).innerText || ''),
          tip: (document.getElementById('tipProt') || {}).innerText || '',
        };
      });
      bien(info.conEst === info.n && info.n === 3, `3: cada oferta muestra las estrellas esperadas (${info.conEst}/${info.n})`);
      bien(info.rec === 1 && info.recPrimera, `3: una sola "Recomendado" y va primera (${info.rec})`);
      const iNo = info.no.indexOf(true);
      bien(iNo > 0 && info.no.slice(iNo).every(Boolean), `3: las que no puedes hacer bien van al final y marcadas (${JSON.stringify(info.no)})`);
      bien(info.falta.length >= 1 && info.falta.every((t) => /Te falta:/.test(t) && /(switcher|cámaras)/.test(t)), `3: dicen qué falta ("${info.falta.join('" / "')}")`);
      bien(/Protección de principiante/.test(info.tip) && /7 eventos/.test(info.tip), `3: aviso de la protección de principiante ("${info.tip}")`);
      await captura(page, 'arreglos_clientes.png');
      bien(!(await desborde(page)), '3: sin desborde horizontal');
      bien(errores.length === 0, '3: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 4. Bodega: reparar lo que alcanza ---------- */
    {
      let ids = {};
      const s = partidaBase({ s: { day: 9 }, fn: (x) => {
        x.stats.events = 12; x.money = 99999;
        G.buy(x, 'cam_basic'); G.buy(x, 'audio_basic');
        x.equip[0].condition = 10; x.equip[1].condition = 30; x.equip[2].condition = 60;
        ids = { a: x.equip[0].id, b: x.equip[1].id, c: x.equip[2].id };
        x.money = Math.ceil(G.repairCost(x.equip[0]) + 1);   // alcanza solo para la más gastada
      } });
      const { ctx, page, errores } = await abrir(browser, { partida: G.serialize(s) });
      await cerrarVentanas(page);
      await page.evaluate(() => { try { const v = JSON.parse(localStorage.getItem('envivo_subtab') || '{}'); v.bodega = 'tienda'; localStorage.setItem('envivo_subtab', JSON.stringify(v)); } catch (e) { /* nada */ } });
      await page.click('nav button[data-tab="bodega"]');
      await page.waitForTimeout(300);
      const enEquipos = await page.evaluate(() => !!document.querySelector('#tab-bodega .sn-k.on[data-k="equipos"]'));
      bien(enEquipos, '4: con equipos en riesgo, la Bodega abre en "Mis equipos"');
      const btn = await page.$('[data-act="repair-all-bodega"]');
      const bt = btn ? (await btn.innerText()).replace(/\s+/g, ' ') : '';
      bien(!!btn && !(await btn.isDisabled()) && /Reparar 1 de 3/.test(bt), `4: "Reparar todo" no se desactiva: "${bt}"`);
      if (btn) await btn.click();
      await page.waitForTimeout(300);
      const cond = await page.evaluate((x) => { const S = window.__game.state; const f = (id) => S.equip.find((e) => e.id === id).condition; return { a: f(x.a), b: f(x.b), c: f(x.c) }; }, ids);
      bien(cond.a === 100 && cond.b === 30 && cond.c === 60, `4: reparó primero la más gastada (${JSON.stringify(cond)})`);
      bien(errores.length === 0, '4: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 5. Aviso de reparar después del evento + una sola ganancia en el resultado ---------- */
    {
      const s = partidaBase({ s: { day: 5 }, fn: (x) => { x.stats.events = 12; x.money = 3000; x.contracts = []; G.addContract(x, 'misa', 1); } });
      const { ctx, page, errores } = await abrir(browser, { partida: G.serialize(s) });
      await cerrarVentanas(page);
      const ok = await page.evaluate(() => {
        const S = window.__game.state, G = window.Game;
        const c = S.contracts[0], lo = G.suggestLoadout(S, c.id);
        const r = G.startEvent(S, c.id, lo.staffIds, lo.equipIds);
        if (!r.ok) return r.msg;
        let inc; while ((inc = G.currentIncident(S))) G.resolveIncident(S, inc.choices.find((x) => x.ok).i);
        S.equip.forEach((e) => { if (lo.equipIds.includes(e.id)) e.condition = 20; });
        window.__game.guardar();
        return true;
      });
      bien(ok === true, '5: evento armado (' + ok + ')');
      await clic(page, 'finish');
      await page.waitForSelector('#overlay.on [data-act="after-result"]', { timeout: 8000 });
      const res = await page.evaluate(() => {
        const m = document.getElementById('modal');
        const det = document.getElementById('resCuentas');
        const vis = m.innerText;
        return { grande: !!document.getElementById('resNet'), det: !!det, abierto: det ? det.open : null, conParteVisible: /con su parte de gastos/.test(vis), filasGanancia: (vis.match(/^Ganancia$/gm) || []).length };
      });
      bien(res.grande && res.det && res.abierto === false, '5: el resultado tiene la ganancia grande y el detalle plegado ("De dónde sale la ganancia")');
      bien(!res.conParteVisible, '5: no se ve un segundo número de ganancia ("con su parte de gastos") sin abrir el detalle');
      await captura(page, 'arreglos_resultado.png');
      await page.click('#overlay.on [data-act="after-result"]');
      await page.waitForTimeout(300);
      await cerrarVentanasMenos(page, 'rep-aviso');
      await page.waitForSelector('#overlay.on [data-rep-aviso]', { timeout: 8000 }).catch(() => {});
      const av = await page.evaluate(() => { const e = document.querySelector('#overlay.on [data-rep-aviso]'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; });
      bien(/Equipo casi roto/.test(av) && /Reparar/.test(av), `5: después del evento sale el aviso para reparar ("${av.slice(0, 120)}")`);
      await captura(page, 'arreglos_aviso_reparar.png');
      const b = await page.$('#overlay.on [data-act="rep-aviso-si"]');
      if (b) await b.click();
      await page.waitForTimeout(300);
      const conds = await page.evaluate(() => window.__game.state.equip.filter((e) => !(window.Game.CATALOG[e.type] || {}).alquiler).map((e) => e.condition));
      bien(conds.every((x) => x >= 25), `5: un toque lo reparó (${conds.join(', ')})`);
      bien(!(await page.$('#overlay.on [data-rep-aviso]')), '5: el aviso se cerró');
      bien(errores.length === 0, '5: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 6. Día 1 sin eventos: "Cerrar el día" chico y con confirmación ---------- */
    {
      const s = G.newGame(31); s.chapterSeen = 1; s.avisos = [];
      const { ctx, page, errores } = await abrir(browser, { partida: G.serialize(s) });
      await cerrarVentanas(page);
      const chico = await page.evaluate(() => { const b = document.querySelector('#tab-inicio [data-act="next-day"]'); return b ? b.classList.contains('dia-chico') : null; });
      bien(chico === true, '6: el día 1 sin eventos, "Cerrar el día" se ve más chico');
      await page.click('#tab-inicio [data-act="next-day"]');
      await page.waitForTimeout(250);
      const t = await page.evaluate(() => (document.querySelector('#overlay.on #modal') || {}).innerText || '');
      const dia0 = await page.evaluate(() => window.__game.state.day);
      bien(/todavía no hiciste ningún evento/.test(t) && dia0 === 1, '6: pide confirmación y el día no pasó todavía');
      await page.click('#overlay.on [data-act="confirm-yes"]');
      await page.waitForTimeout(400);
      bien((await page.evaluate(() => window.__game.state.day)) === 2, '6: al confirmar, pasa al día 2');
      bien(errores.length === 0, '6: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 7. No se puede guardar: un solo aviso ---------- */
    {
      const s = partidaBase({ s: { day: 3 }, fn: (x) => { x.stats.events = 2; } });
      const { ctx, page, errores } = await abrir(browser, { partida: G.serialize(s), sinGuardar: true });
      await cerrarVentanas(page);
      await page.evaluate(() => { window.__sinEspacio = true; const S = window.__game.state; S.money += 1; window.__game.guardar(); S.money += 1; window.__game.guardar(); window.__game.guardar(); });
      await page.waitForTimeout(300);
      const ts = await page.evaluate(() => window.__toasts.filter((x) => /no se puede guardar/.test(x)).length);
      bien(ts === 1, `7: un solo aviso "Tu avance no se puede guardar en este aparato" (${ts})`);
      bien(errores.length === 0, '7: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 8. Service worker ---------- */
    {
      const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), api = fs.readFileSync(path.join(RAIZ, 'js/api.js'), 'utf8');
      const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
      bien(/'\.\/js\/lang\/es\.js'/.test(shell) && !/lang\/en\.js|lang\/juego\//.test(shell), 'sw: la precarga solo trae el español (los otros idiomas, al elegirlos)');
      bien(/cache: 'no-cache'/.test(sw), "sw: la actualización en segundo plano pide con cache: 'no-cache'");
      const vSw = (/VERSION = '(envivo-v\d+)'/.exec(sw) || [])[1], vApi = (/'X-EnVivo-Version': '(envivo-v\d+)'/.exec(api) || [])[1];
      bien(/^envivo-v(\d+)$/.test(vSw) && +vSw.slice(8) >= 51 && vSw === vApi, `sw: versión ${vSw} igual a la de js/api.js (${vApi})`);
      const { ctx, page, errores } = await abrir(browser, { partida: G.serialize(partidaBase({ s: { day: 3 } })) });
      await cerrarVentanas(page);
      await page.evaluate(() => window.__swAviso && window.__swAviso());
      const t = await page.evaluate(() => { const e = document.getElementById('swNueva'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; });
      bien(/Hay una versión nueva/.test(t) && /Actualizar/.test(t), `sw: aviso "${t}"`);
      const box = await page.evaluate(() => { const b = document.querySelector('#swNueva [data-sw="actualizar"]').getBoundingClientRect(); return { h: b.height, r: b.right }; });
      bien(box.h >= 40 && box.r <= 390, `sw: botón Actualizar cómodo de tocar (${Math.round(box.h)} px) y dentro de la pantalla`);
      await captura(page, 'arreglos_sw.png');
      const recarga = page.waitForEvent('load', { timeout: 8000 }).then(() => true, () => false);
      await page.click('#swNueva [data-sw="actualizar"]');
      bien(await recarga, 'sw: "Actualizar" abre el juego otra vez');
      bien(errores.length === 0, 'sw: sin errores de JS' + (errores.length ? ': ' + errores.join(' | ') : ''));
      await ctx.close();
    }

    /* ---------- 9. Zonas de toque: "?" y casillas del personal ---------- */
    {
      const s = partidaBase({ s: { day: 4 }, fn: (x) => { x.stats.events = 5; } });
      const { ctx, page } = await abrir(browser, { partida: G.serialize(s) });
      await cerrarVentanas(page);
      await page.click('nav button[data-tab="clientes"]');
      await page.waitForSelector('#tab-clientes [data-act="prep"]');
      await page.click('#tab-clientes [data-act="prep"]');
      await page.waitForSelector('#modal input[data-act="tog-staff"]');
      const z = await page.evaluate(() => {
        const q = document.querySelector('.ay-q');
        const qa = q ? getComputedStyle(q, '::after') : null;
        const r = q ? q.getBoundingClientRect() : null;
        const ins = qa ? Math.abs(parseFloat(qa.top)) : 0;
        const pick = document.querySelector('#modal input[data-act="tog-staff"]').closest('label').getBoundingClientRect();
        return { q: r ? r.height + 2 * ins : 0, pick: pick.height };
      });
      bien(z.q >= 44, `9: el "?" tiene una zona de toque de ${Math.round(z.q)} px (≥ 44)`);
      bien(z.pick >= 44, `9: la casilla del personal se toca en toda la fila (${Math.round(z.pick)} px)`);
      await ctx.close();
    }
  } catch (e) {
    fallas++; console.error('❌ Excepción:', e);
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();

// Cierra ventanas que no sean el aviso de reparar (resumen del día, capítulo...)
async function cerrarVentanasMenos(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await overlayOn(page))) return;
    if (await page.$('#overlay.on [data-rep-aviso]')) return;
    const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close"]');
    if (!b) return;
    await b.click(); await page.waitForTimeout(250);
  }
}
