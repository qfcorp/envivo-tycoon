/* Prueba del plan de cámaras a mano (pedido del dueño, 28-oct): "tú como dueño deberías ver qué cámaras y en qué parte las
   pones; podría ser mucho mejor o peor de acuerdo a dónde se ponga y qué equipo se use".
   En un celular simulado (390x844, fecha fija 2026-06-10) con Playwright:
     1. Preparar una velada de boxeo: el plan sale en Automático; tocar una cámara la elige (luz roja) y muestra en cada
        posición cuánto cambia la calidad; tocar una posición la pone ahí ("Tu plan"), cambia de lugar con la que estaba,
        se quita; el rango de calidad de abajo cambia en vivo.
     2. Un plan pensado (tu mejor camarógrafo en la cerrada, las dos esquinas al hombro) rinde más que el automático;
        uno malo (la cámara de hombro en la principal, la del ring en la robótica) rinde menos.
     3. Al aire con tu plan: el evento guarda la colocación y la calidad base es la de tu plan; el resultado lo muestra.
     4. Primer evento (tutorial): el plano solo se mira, con el aviso de que después se pueden mover las cámaras.
     5. Intento en línea con colocación: el juego lo juega (EnVivoVivo) y el validador del servidor lo repite igual;
        una colocación imposible se rechaza.
     6. Con mouse: arrastrar una cámara hasta una posición también la coloca.
   Sin desplazamiento horizontal ni errores de JavaScript. Capturas en tests/capturas/camlib_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_camaras_libres.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const V = require('../server/validador/validador.js');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo-camlibres.test';
const SAVE = 'envivo_tycoon_save_v1';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

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
  const URL0 = BASE + '/index.html';

  // Una productora con equipo de ring: cámara de sistema, dos de hombro, una de cine y una robótica; camarógrafos de
  // distinto nivel (la mejor, Ana, nivel 5). Una velada de boxeo de 4 cámaras. eventos = 0 → primer evento (tutorial).
  async function abrir(op) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !op.mouse, hasTouch: !op.mouse, serviceWorkers: 'block', locale: 'es-EC' });
    await ctx.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
    await servir(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(URL0, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.state);
    const st = await page.evaluate((o) => {
      const G = window.Game, s = G.newGame(7);
      s.chapter = 3; s.chapterSeen = 3; s.rep = 40; s.money = 90000; s.stats.events = o.eventos;
      s.equip = s.equip.filter((e) => !e.starter);
      const id = () => { s.idc = (s.idc || 0) + 1; return s.idc; };
      const eq = (type, nick) => { const e = { id: id(), type, condition: 95 }; if (nick) e.nick = nick; s.equip.push(e); return e.id; };
      eq('cam_blackmagia_urso_broadcast_g3'); eq('lente_kanon_kx21x8_2');
      eq('cam_zony_hxr_mk2500'); eq('cam_zony_hxr_mk2500');
      eq('cam_cine'); eq('cam_panasonika_aw_uv22');
      ['sw_vmax_pro_pc', 'audio_pro', 'mics', 'encoder', 'router4g', 'ups', 'sop_manfrotti_504x', 'sop_manfrotti_504x'].forEach((k) => { if (G.CATALOG[k]) eq(k); });
      const p = (name, role, skill, tier) => s.staff.push({ id: id(), name, role, skill, tier, wage: 60, morale: 90, events: 10, eventos_nacionales: 10, eventos_internacionales: 0 });
      p('Ana Lema', 'camarografo', 5, 'senior'); p('Kevin Toapanta', 'camarografo', 2, 'junior'); p('Luis Pazmiño', 'camarografo', 2, 'junior');
      p('Carla Ortiz', 'director', 4, 'senior'); p('Diego Salazar', 'sonidista', 3, 'semi_senior'); p('Mishell Cedeño', 'tecnico_transmision', 3, 'semi_senior');
      p('Bryan Guamán', 'cablero', 2, 'junior'); p('Paola Villacís', 'operador_repeticion', 3, 'semi_senior'); p('Stalin Morales', 'operador_graficos', 3, 'semi_senior');
      s.contracts = [];
      const c = G.addContract(s, 'boxeo');
      c.cams = 4; c.daysLeft = 5; c.rival = false; c.story = false; c.outdoor = false;
      return G.serialize(s);
    }, op);
    await page.goto(BASE + '/vacia.html');
    await page.evaluate(([k, x]) => localStorage.setItem(k, x), [SAVE, st]);
    await page.goto(URL0, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state && window.__game.state.rep === 40);
    await page.waitForTimeout(300);
    for (let k = 0; k < 6; k++) {
      const b = page.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on [data-act="after-result"]');
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(80); } else break;
    }
    await page.click('nav button[data-tab="clientes"]');
    const cid = await page.evaluate(() => window.__game.state.contracts[0].id);
    await page.click(`[data-act="prep"][data-id="${cid}"]`);
    await page.waitForSelector('[data-act="go-live"]');
    await page.waitForTimeout(200);
    return { ctx, page, cid };
  }
  // Lo que se ve: rango de calidad de abajo, modo, diferencia contra el automático y el plan
  const leer = (page) => page.evaluate(() => {
    const txt = (document.querySelector('#prepPie') || {}).innerText || '';
    const m = txt.match(/(\d+)\s*[–-]\s*(\d+)/);
    const modo = document.querySelector('#prepCalc .pe-seg [aria-pressed="true"]');
    return {
      min: m ? +m[1] : -1, max: m ? +m[2] : -1,
      modo: modo ? modo.dataset.k : null,
      delta: ((document.querySelector('#prepCalc .pe-dq') || {}).innerText || '').trim(),
      chips: [...document.querySelectorAll('#prepCalc .pe-cc')].map((b) => ({ id: +b.dataset.id, on: b.getAttribute('aria-pressed') === 'true', txt: b.innerText.replace(/\s+/g, ' ') })),
      filas: [...document.querySelectorAll('#prepCalc button.pe-clr')].map((b) => ({ k: b.dataset.k, txt: b.innerText.replace(/\s+/g, ' ') })),
      badges: document.querySelectorAll('#prepCalc .pe-pv').length,
      combos: [...document.querySelectorAll('#prepCalc .pe-cb span')].map((x) => x.innerText.replace(/\s+/g, ' ')),
      det: ((document.querySelector('#prepCalc .pe-dt') || {}).innerText || '').replace(/\s+/g, ' '),
      tip: ((document.querySelector('#prepCalc .pe-tip') || {}).innerText || '').trim(),
      scroll: document.documentElement.scrollWidth > window.innerWidth + 1 || (document.querySelector('#modal') && document.querySelector('#modal').scrollWidth > document.querySelector('#modal').clientWidth + 1),
    };
  });
  // El plan de cámaras que está en la preparación, calculado con la lógica (para comparar con la pantalla)
  const plano = (page) => page.evaluate(() => window.__game.prepPlan ? window.__game.prepPlan() : null);
  const verPlano = async (page) => { await page.evaluate(() => { const el = document.querySelector('#prepCalc .pe-cams'); if (el) el.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(120); };
  const tocarCam = (page, id) => page.locator(`#prepCalc .pe-cc[data-id="${id}"]`).click();
  const tocarPos = (page, k) => page.locator(`#prepCalc button.pe-clr[data-k="${k}"]`).click();
  // Deja abierto el detalle de una posición (tocarla de nuevo lo cierra)
  const abrirDetalle = async (page, k) => {
    for (let n = 0; n < 2; n++) {
      if (await page.locator(`#prepCalc button.pe-clr.pe-on[data-k="${k}"]`).count()) return;
      await tocarPos(page, k);
    }
  };
  const idDe = (page, type, n) => page.evaluate(([t, i]) => window.__game.state.equip.filter((e) => e.type === t)[i || 0].id, [type, n]);

  try {
    /* ===== 1. Mover, cambiar y quitar cámaras; la estimación cambia en vivo ===== */
    {
      const { ctx, page } = await abrir({ eventos: 5 });
      await verPlano(page);
      let r = await leer(page);
      bien(r.modo === 'auto' && r.chips.length >= 4, `Al abrir la preparación el plan sale en Automático con la bandeja de cámaras (${r.chips.length} cámaras)`);
      bien(!r.scroll, 'Sin desplazamiento horizontal (390 px)');
      const auto = r;
      // Los toques son grandes: cámaras y filas de 44 px o más, y los puntos del plano con un área de toque amplia
      const tam = await page.evaluate(() => ({
        cc: Math.min(...[...document.querySelectorAll('#prepCalc .pe-cc')].map((b) => b.getBoundingClientRect().height)),
        fila: Math.min(...[...document.querySelectorAll('#prepCalc button.pe-clr')].map((b) => b.getBoundingClientRect().height)),
        hit: Math.min(...[...document.querySelectorAll('#prepCalc .pe-hit')].map((c) => c.getBoundingClientRect().width)),
        seg: Math.min(...[...document.querySelectorAll('#prepCalc .pe-seg button')].map((b) => b.getBoundingClientRect().height)),
      }));
      bien(tam.cc >= 44 && tam.fila >= 44 && tam.hit >= 28 && tam.seg >= 40, `Toques grandes: cámara ${Math.round(tam.cc)} px, fila ${Math.round(tam.fila)} px, punto del plano ${Math.round(tam.hit)} px, modo ${Math.round(tam.seg)} px`);
      await page.screenshot({ path: path.join(OUT, 'camlib_01_automatico.png') });

      // Elegir la cámara de cine: queda con luz roja y cada posición dice cuánto cambia la calidad
      const cine = await idDe(page, 'cam_cine');
      await tocarCam(page, cine);
      r = await leer(page);
      bien(r.chips.find((c) => c.id === cine).on && r.badges >= 4, `Tocar una cámara la elige y muestra el cambio de calidad en ${r.badges} posiciones`);
      bien(/Ahora toca dónde va/.test(r.tip), 'El aviso dice qué hacer ahora');
      await page.screenshot({ path: path.join(OUT, 'camlib_02_camara_elegida.png') });
      // Ponerla en la principal (había otra: cambian de lugar)
      const antes = await plano(page);
      const enPrincipal = antes.positions.find((p) => p.key === 'principal').equipId;
      const dondeCine = (antes.positions.find((p) => p.equipId === cine) || {}).key || null;
      await tocarPos(page, 'principal');
      r = await leer(page);
      let ahora = await plano(page);
      bien(r.modo === 'manual' && ahora.positions.find((p) => p.key === 'principal').equipId === cine, 'Tocar la posición pone ahí la cámara elegida y el plan pasa a "Tu plan"');
      bien(dondeCine ? ahora.positions.find((p) => p.key === dondeCine).equipId === enPrincipal : !ahora.positions.some((p) => p.equipId === enPrincipal),
        'La que estaba en la principal cambia de lugar con ella (o queda sin posición)');
      bien(r.delta && /automático/.test(r.delta) && r.det.length > 0, `Se ve la diferencia contra el automático ("${r.delta}") y el detalle de la posición`);
      bien(r.min !== auto.min || r.max !== auto.max || /igual/.test(r.delta), `La calidad estimada cambia en vivo (${auto.min}–${auto.max} → ${r.min}–${r.max})`);
      await page.screenshot({ path: path.join(OUT, 'camlib_03_movida.png') });
      // Quitar una cámara: la posición queda vacía y la estimación baja
      const conTodas = r;
      await page.locator('#prepCalc .pe-qt').click();
      r = await leer(page);
      ahora = await plano(page);
      bien(!ahora.positions.find((p) => p.key === 'principal').equipId && r.chips.find((c) => c.id === cine).txt.includes('Sin posición'),
        'Quitar la cámara deja la posición vacía y la cámara vuelve a la bandeja');
      bien(r.max < conTodas.max || r.min < conTodas.min, `Sin cámara en la principal la calidad estimada baja (${conTodas.min}–${conTodas.max} → ${r.min}–${r.max})`);
      bien(r.combos.some((x) => /Sin plano general/.test(x)), 'Sin cámara en la principal sale la falla "Sin plano general"');
      // Volver al automático
      await page.locator('#prepCalc .pe-seg [data-k="auto"]').click();
      r = await leer(page);
      bien(r.modo === 'auto' && r.min === auto.min && r.max === auto.max, 'El botón Automático vuelve al plan de siempre');
      await ctx.close();
    }

    /* ===== 2. Un plan pensado rinde más que el automático; uno malo, menos ===== */
    {
      const { ctx, page } = await abrir({ eventos: 5 });
      await verPlano(page);
      const auto = await leer(page);
      const qAuto = (await plano(page)).q;
      // Pensado: la de sistema con lente largo en la principal, las dos de hombro en las esquinas, la de cine en la
      // cerrada con Ana (la mejor) y la robótica en el contraplano
      const ursa = await idDe(page, 'cam_blackmagia_urso_broadcast_g3');
      const h1 = await idDe(page, 'cam_zony_hxr_mk2500', 0), h2 = await idDe(page, 'cam_zony_hxr_mk2500', 1);
      const cine = await idDe(page, 'cam_cine');
      await page.locator('#prepCalc .pe-seg [data-k="manual"]').click();
      for (const [id, k] of [[ursa, 'principal'], [h1, 'esquina1'], [h2, 'esquina2'], [cine, 'cerrada']]) { await tocarCam(page, id); await tocarPos(page, k); }
      // Ana a la cerrada (la posición clave del boxeo)
      const ana = await page.evaluate(() => window.__game.state.staff.find((p) => p.name === 'Ana Lema').id);
      await abrirDetalle(page, 'cerrada');
      await page.locator(`#prepCalc .pe-op[data-k="cerrada"][data-id="${ana}"]`).click();
      const bueno = await leer(page);
      const pb = await plano(page);
      bien(pb.q > qAuto, `Un plan pensado rinde más que el automático (calidad base ${qAuto} → ${pb.q}; "${bueno.delta}")`);
      bien(bueno.combos.some((x) => /Combo: dos cámaras al hombro/.test(x)) && bueno.combos.some((x) => /mejor camarógrafo/.test(x)),
        `Salen los combos: ${bueno.combos.join(' | ')}`);
      bien(bueno.max >= auto.max && bueno.min >= auto.min, `La calidad estimada sube (${auto.min}–${auto.max} → ${bueno.min}–${bueno.max})`);
      await abrirDetalle(page, 'esquina1');
      const rz = await leer(page);
      bien(/Combo: dos cámaras al hombro/.test(rz.det) && /\+/.test(rz.det), `El detalle de la posición explica por qué rinde así: "${rz.det.slice(0, 140)}…"`);
      await page.locator('#prepCalc .pe-dt').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, 'camlib_04_plan_pensado.png') });
      await verPlano(page);
      await page.screenshot({ path: path.join(OUT, 'camlib_05_plan_pensado_mapa.png') });
      // Malo: la de hombro en la principal, la de sistema en una esquina, la robótica en la otra esquina (reacciones)
      const ptz = await idDe(page, 'cam_panasonika_aw_uv22');
      // La robótica no venía marcada (no hay operador de robóticas): se marca en "¿Qué equipos llevas?"
      await page.locator(`#modal label.pick:has(input[data-act="tog-equip"][data-id="${ptz}"])`).click({ position: { x: 12, y: 12 } });
      await page.waitForTimeout(80);
      await verPlano(page);
      for (const [id, k] of [[h1, 'principal'], [ursa, 'esquina1'], [ptz, 'esquina2'], [h2, 'cerrada']]) { await tocarCam(page, id); await tocarPos(page, k); }
      const malo = await leer(page);
      const pm = await plano(page);
      bien(pm.q < qAuto, `Un plan malo rinde menos que el automático (calidad base ${qAuto} → ${pm.q}; "${malo.delta}")`);
      bien(malo.combos.some((x) => /Robótica: no sigue las reacciones/.test(x)), `Sale la falla de la robótica en una esquina: ${malo.combos.join(' | ')}`);
      bien(malo.max <= auto.max && malo.min < auto.min, `La calidad estimada baja (${auto.min}–${auto.max} → ${malo.min}–${malo.max})`);
      await page.screenshot({ path: path.join(OUT, 'camlib_06_plan_malo.png') });
      bien(!(await leer(page)).scroll, 'Sin desplazamiento horizontal con el detalle abierto');

      /* ===== 3. Al aire con el plan pensado: el evento usa la colocación ===== */
      for (const [id, k] of [[ursa, 'principal'], [h1, 'esquina1'], [h2, 'esquina2'], [cine, 'cerrada']]) { await tocarCam(page, id); await tocarPos(page, k); }
      // La robótica vuelve a la bodega (sin operador de robóticas no suma)
      await page.locator(`#modal label.pick:has(input[data-act="tog-equip"][data-id="${ptz}"])`).click({ position: { x: 12, y: 12 } });
      await page.waitForTimeout(80);
      await abrirDetalle(page, 'cerrada');
      await page.locator(`#prepCalc .pe-op[data-k="cerrada"][data-id="${ana}"]`).click();
      const antesAire = await plano(page);
      await page.click('[data-act="go-live"]');
      await page.waitForFunction(() => window.__game.state.currentEvent);
      const ev = await page.evaluate(() => {
        const e = window.__game.state.currentEvent;
        const luck = (e.parts.find((p) => p[2] === 'parte.suerte') || [0, 0])[1];
        return { col: e.colocacion, manual: e.cameraPlan.manual, base: e.base, luck, cerrada: e.cameraPlan.positions.find((p) => p.key === 'cerrada'), combos: e.cameraPlan.combos };
      });
      bien(Array.isArray(ev.col) && ev.manual && ev.cerrada.equipId === cine && ev.cerrada.operador && ev.cerrada.operador.id === ana,
        'Al aire: el evento guarda tu colocación (la de cine en la cerrada, con Ana)');
      bien(ev.base === Math.max(0, Math.min(100, antesAire.q + ev.luck)), `La calidad base del evento es la de tu plan (${antesAire.q} + suerte ${ev.luck} = ${ev.base})`);
      // Jugar el evento hasta el resultado
      for (let k = 0; k < 12; k++) {
        if (await page.locator('#overlay.on [data-act="after-result"]').count()) break;
        const ch = page.locator('#overlay.on [data-act="choose"]:not([disabled])');
        const nx = page.locator('#overlay.on [data-act="next-inc"], #overlay.on [data-act="finish"]');
        if (await nx.count()) await nx.first().click();
        else if (await ch.count()) await ch.first().click();
        await page.waitForTimeout(250);
      }
      await page.waitForSelector('#overlay.on [data-act="after-result"]', { timeout: 8000 });
      const res = await page.evaluate(() => ({ r: window.__game.state.lastResult, chips: [...document.querySelectorAll('#overlay.on .pe-rc')].map((x) => x.innerText) }));
      bien(res.r && res.r.cameraPlan && res.r.cameraPlan.manual && res.r.cameraPlan.combos.some((x) => x.pts > 0), 'El resultado trae tu plan de cámaras con sus combos');
      bien(res.chips.some((t) => /El cliente notó las tomas/.test(t)), `El resultado dice lo que el cliente notó: ${res.chips.join(' | ')}`);
      await page.evaluate(() => { const el = document.querySelector('#overlay.on .pe-risk'); if (el) el.scrollIntoView({ block: 'center' }); });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, 'camlib_07_resultado.png') });
      await ctx.close();
    }

    /* ===== 4. Primer evento (tutorial): el plano solo se mira ===== */
    {
      const { ctx, page } = await abrir({ eventos: 0 });
      await verPlano(page);
      const r = await leer(page);
      bien(r.chips.length === 0 && !r.modo && /próximo evento podrás mover las cámaras/.test(r.tip), 'En el primer evento el plan es automático y avisa que después se pueden mover las cámaras');
      bien(await page.locator('[data-act="go-live"]').isEnabled(), 'En el primer evento se puede salir al aire como siempre');
      await page.screenshot({ path: path.join(OUT, 'camlib_08_tutorial.png') });
      await ctx.close();
    }

    /* ===== 6. Con mouse: arrastrar una cámara a una posición ===== */
    {
      const { ctx, page } = await abrir({ eventos: 5, mouse: true });
      await verPlano(page);
      const cine = await idDe(page, 'cam_cine');
      const de = await page.locator(`#prepCalc .pe-cc[data-id="${cine}"]`).boundingBox();
      const a = await page.locator('#prepCalc g[data-pe-act="pos"][data-k="contraplano"] .pe-hit').boundingBox();
      await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
      await page.mouse.down();
      await page.mouse.move(de.x + 40, de.y - 20, { steps: 4 });
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const p = await plano(page);
      bien(p.positions.find((x) => x.key === 'contraplano').equipId === cine && (await leer(page)).modo === 'manual', 'Arrastrar la cámara con el mouse hasta una posición la coloca ahí');
      await ctx.close();
    }

    /* ===== 5. Intento en línea con colocación: el servidor lo repite igual ===== */
    {
      const { ctx, page } = await abrir({ eventos: 5 });
      const intento = {
        seed: 424242,
        contrato: { type: 'boxeo', client: 'Veladas del Pacífico', cams: 4, diff: 3, audio: true, stream: true, outdoor: false, pay: 1500 },
        equipo: {
          staff: [{ name: 'Tú (dueño)', role: 'camarografo', skill: 3, owner: true }, { name: 'Ana', role: 'camarografo', skill: 5, tier: 'senior' },
            { name: 'Kevin', role: 'camarografo', skill: 2 }, { name: 'Carla', role: 'director', skill: 4 }, { name: 'Paola', role: 'operador_repeticion', skill: 3 },
            { name: 'Diego', role: 'sonidista', skill: 3 }, { name: 'Mishell', role: 'tecnico_transmision', skill: 3 }],
          equip: [{ type: 'cam_blackmagia_urso_broadcast_g3', condition: 90 }, { type: 'lente_kanon_kx21x8_2', condition: 90 }, { type: 'cam_zony_hxr_mk2500', condition: 90 },
            { type: 'cam_zony_hxr_mk2500', condition: 90 }, { type: 'cam_cine', condition: 90 }, { type: 'sw_vmax_pro_pc', condition: 90 }, { type: 'audio_pro', condition: 90 }, { type: 'encoder', condition: 90 }],
        },
        contexto: { fama: 30, dinero: 1000 },
        // Índices: 0 = la de sistema, 2 y 3 = las de hombro, 4 = la de cine (con Ana, índice 1 del personal)
        colocacion: [{ p: 'principal', e: 0 }, { p: 'esquina1', e: 2 }, { p: 'esquina2', e: 3 }, { p: 'cerrada', e: 4, o: 1 }],
      };
      const jugado = await page.evaluate(async (it) => {
        const Vv = window.EnVivoVivo;
        await Vv.asegurar();
        const v = Vv.crear(window.Game, it);
        const plan = v.s.currentEvent.cameraPlan;
        for (let n = 0; n < 20; n++) { const inc = Vv.incidente(v); if (!inc) break; Vv.elegir(v, inc.choices.find((c) => c.ok).i); }
        const out = Vv.terminar(v);
        return Object.assign(out, { manual: plan.manual, combos: plan.combos.map((x) => x.k), cerrada: plan.positions.find((p) => p.key === 'cerrada').operador });
      }, intento);
      bien(jugado.manual && jugado.cerrada && jugado.cerrada.name === 'Ana' && Array.isArray(jugado.colocacion), `El juego juega el intento con la colocación (combos: ${jugado.combos.join(', ')})`);
      const v = V.validate(Object.assign({}, intento, { decisiones: jugado.decisiones, cliente_resultado: jugado.resultado }));
      bien(v.valido === true && v.coincide === true && v.calidad === jugado.resultado.quality, `El validador del servidor repite el intento con la colocación: ${v.calidad} (${v.estrellas}⭐) = ${jugado.resultado.quality}`);
      const sinCol = Object.assign({}, intento, { decisiones: jugado.decisiones, cliente_resultado: jugado.resultado });
      delete sinCol.colocacion;
      const vs = V.validate(sinCol);
      bien(vs.calidad !== jugado.resultado.quality ? !vs.valido : true, 'Mandar el resultado del plan a mano sin la colocación no pasa (si el resultado cambia)');
      const malo = V.validate(Object.assign({}, intento, { decisiones: jugado.decisiones, colocacion: [{ p: 'principal', e: 5 }] }));
      bien(!malo.valido && malo.detalle.motivo === 'colocacion_invalida', `Una colocación con un switcher en la principal se rechaza (${malo.detalle.mensaje})`);
      const otro = V.validate(Object.assign({}, intento, { decisiones: jugado.decisiones, colocacion: [{ p: 'principal', e: 0 }, { p: 'cerrada', e: 0 }] }));
      bien(!otro.valido && otro.detalle.motivo === 'colocacion_invalida', 'Una cámara en dos posiciones a la vez se rechaza');
      const fuera = V.validate(Object.assign({}, intento, { decisiones: jugado.decisiones, colocacion: [{ p: 'principal', e: 12 }] }));
      bien(!fuera.valido && fuera.detalle.motivo === 'colocacion_invalida', 'Una cámara que el jugador no registró se rechaza');
      await ctx.close();
    }
  } catch (e) {
    fallas++;
    console.error('❌ Excepción:', e && e.stack || e);
  }
  bien(!errores.length, 'Sin errores de JavaScript en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${bien_} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
