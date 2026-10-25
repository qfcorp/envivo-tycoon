/* Prueba de js/ayuda_asoc.js (Ayudas de un toque, Investigación y Tienda de la asociación) en el juego real, celular 390x844.
   El servidor se imita aquí (/api/estado con sesión y asociación, /api/asoc/*, /api/sede para la ventana de la sede).
   - Globo 🤝 con el número de pedidos: UN toque = POST /api/asoc/ayuda/todos (con X-Envivo) y se esconde.
   - Chat → pestaña Asociación: barra Ayudas (N) / Investigación / Tienda que abre el panel.
   - Ayudas: lista de pedidos, "Ayudar a todos", "Pedir ayuda" en tus obras. Sede oficial: botón "Pedir ayuda" en cada obra.
   - Investigación: donar dinero del juego (lo descuenta la partida DESPUÉS de que el servidor acepta) y materiales.
   - Tienda: comprar con fichas pide un segundo toque. Socio nuevo (< 24 h): todo bloqueado con aviso.
   - Inglés; extensión de logic.js (multPago); sin errores de JS ni desborde horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_ayuda_asoc.js   (capturas en tests/capturas/ayuda_asoc_*.png) */
'use strict';
// Fecha fija fuera de las temporadas (en Halloween, Navidad… al abrir sale el resumen del día y llegan contratos especiales)
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Servidor de mentira (en Node) ---------- */
const H = 3600;
const S = {
  pedidos: [], fichas: 46, puntos: 1240, espera: 0, money: null,
  hoy: { ayudas: 4, ayudas_max: 30, fichas_ayuda: 4, fichas_ayuda_max: 20, donaciones: 1, donaciones_max: 15, donaciones_dinero: 0, donaciones_dinero_max: 5, fichas_donar: 2, fichas_donar_max: 30 },
  pendientes: [
    { obra_id: 77, jugador_id: 5, nombre: 'Productora Cotopaxi con un nombre muy largo para ver el corte', tipo: 'mejora', ed: 'control', nivel: 9, restante: 5 * H + 120, ayudas: 4, ayudas_max: 12, segundos_ayuda: 300 },
    { obra_id: 78, jugador_id: 6, nombre: 'Majo TV', tipo: 'nivel', ed: 'sede', nivel: 12, restante: 30 * H, ayudas: 9, ayudas_max: 12, segundos_ayuda: 1080 },
    { obra_id: 79, jugador_id: 8, nombre: 'Radio Pichincha', tipo: 'mejora', ed: 'movil', nivel: 7, restante: 50 * 60, ayudas: 1, ayudas_max: 12, segundos_ayuda: 300 },
  ],
  mis: [
    { obra_id: 501, tipo: 'mejora', ed: 'estudio', nivel: 13, restante: 26 * H, ayudas: 2, ayudas_max: 12, pedida: false },
    { obra_id: 502, tipo: 'mejora', ed: 'bodega', nivel: 13, restante: 3 * H, ayudas: 0, ayudas_max: 12, pedida: false },
  ],
  inv: { paga_eventos: { nivel: 2, progreso: 610 }, reparacion: { nivel: 0, progreso: 120 }, refuerzos: { nivel: 1, progreso: 795 } },
  tienda: { caja_materiales: 0, chip: 1, acel_15: 0, acel_60: 0, insignia_solidaria: 0 },
  mat: { cables: 34, placas: 8, paneles: 22, credenciales: 15, planos: 9, chips: 2 },
};
const TECH = { paga_eventos: { max: 5, efecto: 2, costos: [400, 900, 1600, 2600, 4000] }, reparacion: { max: 3, efecto: 5, costos: [500, 1300, 2600] }, refuerzos: { max: 5, efecto: 1, costos: [300, 800, 1500, 2500, 4000] } };
const TIENDA = { caja_materiales: [30, 3], chip: [45, 1], acel_15: [15, 4], acel_60: [50, 2], insignia_solidaria: [250, 0] };
const DONAR = { dinero: { monto: 2000, puntos: 10, fichas: 2, dia: 5 }, material: { cantidad: 10, puntos: 10, fichas: 2 }, chips: { cantidad: 1, puntos: 15, fichas: 3 } };
function vista() {
  const nivel = S.puntos >= 1800 ? 3 : S.puntos >= 600 ? 2 : 1;
  const tope = 10 + nivel - 1 + S.inv.refuerzos.nivel;
  return { ok: true, ahora: Math.floor(Date.now() / 1000), dia: '2026-10-23', fichas: S.fichas, hoy: S.hoy,
    tienda: Object.keys(TIENDA).map((k) => { const una = k === 'insignia_solidaria'; const tp = una ? 1 : TIENDA[k][1]; return { id: k, fichas: TIENDA[k][0], da: {}, una_vez: una, tope: tp, usadas: S.tienda[k], agotado: S.tienda[k] >= tp }; }),
    insignias: S.tienda.insignia_solidaria ? ['solidaria'] : [], reglas: { donar: DONAR, antiguedad_seg: 86400 }, bonos: { paga_eventos_pct: S.inv.paga_eventos.nivel * 2, reparacion_pct: S.inv.reparacion.nivel * 5, ayudas_extra: tope - 10 },
    materiales: S.mat, mis_obras: S.mis, pendientes: S.pendientes,
    asociacion: { id: 3, nombre: 'Productores Unidos del Ecuador', siglas: 'PUE', color: '#ff3b3b', cargo: 'presidente', nivel, nivel_max: 6, puntos: S.puntos, siguiente: [0, 600, 1800, 4000][nivel], tope_ayudas: tope, espera: S.espera,
      investigacion: Object.keys(TECH).map((k) => ({ id: k, nivel: S.inv[k].nivel, max: TECH[k].max, efecto: TECH[k].efecto, total: S.inv[k].nivel * TECH[k].efecto, progreso: S.inv[k].progreso, costo: TECH[k].costos[S.inv[k].nivel] ?? null, costos: TECH[k].costos })) } };
}
function sede() {
  const ahora = Math.floor(Date.now() / 1000);
  return { ok: true, ahora, dia: '2026-10-23', creditos: 40, reglas: { seg_por_credito: 360, costo_min: 5, ayudas_max: 12, ayuda_pct: 0.01, ayuda_min_seg: 300 },
    sede: { nivel: 30, max: true, materiales: S.mat, aceleradores_min: 0, mejoras: {}, obreros: 2, etapa: null, bono_competencia: 6, migracion: { posible: false, nivel_max: 1 },
      cofre: { disponible: false, proximo: ahora + 9 * H },
      obras: [{ id: 501, tipo: 'mejora', ed: 'estudio', nivel: 13, inicio: ahora - H, duracion: 27 * H, fin: ahora + 26 * H, restante: 26 * H, ayudas: 2, ayudas_max: 12, costo_creditos: 260, segundos_ayuda: 972 },
        { id: 502, tipo: 'mejora', ed: 'bodega', nivel: 13, inicio: ahora - H, duracion: 4 * H, fin: ahora + 3 * H, restante: 3 * H, ayudas: 0, ayudas_max: 12, costo_creditos: 30, segundos_ayuda: 300 }] } };
}
function asoc(ruta, metodo, body, cab) {
  if (metodo === 'POST' && cab !== '1') return [403, { ok: false, error: 'Petición no permitida.', codigo: 'cabecera_requerida' }];
  if (ruta === '/api/asoc/ayuda' && metodo === 'GET') return [200, vista()];
  if (ruta === '/api/asoc/ayuda/resumen') return [200, { ok: true, asociacion: 3, pendientes: S.espera > 0 ? 0 : S.pendientes.length, fichas: S.fichas, espera: S.espera, bonos: vista().bonos }];
  if (S.espera > 0 && /todos|donar/.test(ruta)) return [409, { ok: false, error: 'Llevas menos de 24 horas en tu asociación.', codigo: 'miembro_nuevo', espera: S.espera }];
  if (ruta === '/api/asoc/ayuda/todos') {
    const n = S.pendientes.length;
    if (!n) return [409, { ok: false, error: 'No hay pedidos de ayuda ahora.', codigo: 'sin_pedidos' }];
    S.pendientes = []; S.fichas += n; S.hoy.ayudas += n; S.hoy.fichas_ayuda += n;
    return [200, Object.assign({ ayudadas: n, segundos: 1680, premio: { cables: 2, planos: 1 }, fichas_ganadas: n, tope_dia: false }, vista())];
  }
  if (ruta === '/api/asoc/ayuda/pedir') {
    const l = body.obra_id ? S.mis.filter((o) => o.obra_id === body.obra_id) : S.mis.filter((o) => !o.pedida);
    if (!l.length) return [409, { ok: false, error: 'Esa obra no existe.', codigo: 'obra_no_existe' }];
    l.forEach((o) => { o.pedida = true; });
    return [200, Object.assign({ pedidas: l.length }, vista())];
  }
  if (ruta === '/api/asoc/investigacion/donar') {
    const D = body.tipo === 'dinero' ? DONAR.dinero : body.material === 'chips' ? DONAR.chips : DONAR.material;
    if (body.tipo === 'dinero' && body.pagado_en_juego !== true) return [402, { ok: false, error: 'Donar cuesta $2.000 del juego.', codigo: 'sin_pago' }];
    if (body.tipo === 'material') S.mat[body.material] -= D.cantidad; else S.hoy.donaciones_dinero++;
    const t = S.inv[body.tech]; t.progreso += D.puntos; let subio = false;
    if (t.progreso >= TECH[body.tech].costos[t.nivel]) { t.progreso -= TECH[body.tech].costos[t.nivel]; t.nivel++; subio = true; }
    S.puntos += D.puntos; S.fichas += D.fichas; S.hoy.donaciones++; S.hoy.fichas_donar += D.fichas;
    return [200, Object.assign({ donacion: { tech: body.tech, tipo: body.tipo, material: body.material || null, cantidad: D.cantidad || D.monto, puntos: D.puntos, fichas: D.fichas, subio, nivel_tech: t.nivel, nivel_asoc: 2, subio_asoc: false } }, vista())];
  }
  if (ruta === '/api/asoc/tienda/comprar') {
    const c = TIENDA[body.item];
    if (S.fichas < c[0]) return [409, { ok: false, error: 'No tienes fichas suficientes.', codigo: 'sin_fichas' }];
    S.fichas -= c[0]; S.tienda[body.item]++;
    return [200, Object.assign({ compra: { item: body.item, fichas: c[0], da: {} } }, vista())];
  }
  return [404, { ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }];
}

async function partida(browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(FECHA_FIJA);
  const p = await ctx.newPage();
  await p.setContent('<html></html>');
  await p.addScriptTag({ path: path.join(RAIZ, 'js/datos.js') });
  await p.addScriptTag({ path: path.join(RAIZ, 'js/logic.js') });
  const s = await p.evaluate(() => { const s = window.Game.newGame(7); Object.assign(s, { day: 24, money: 60000 }); Object.assign(s.stats, { events: 30 }); return window.Game.serialize(s); });
  await ctx.close();
  return s;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const pedidos = [];
  try {
    const save = await partida(browser);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(FECHA_FIJA);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route(BASE + '/**', async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
      if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(RAIZ, 'index.html')) });
      if (u.pathname.startsWith('/api/')) {
        if (u.pathname === '/api/estado') return json(200, { ok: true, tienda: { productos: [], premium: [] }, logueado: true, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' },
          jugador: { id: 7, nombre: 'QF', email: 'qf@envivo.test' }, creditos: 40, vip_activo: false, servidor: { id: 1, nombre: 'Servidor 1' },
          asociacion: { id: 3, nombre: 'Productores Unidos del Ecuador', siglas: 'PUE', color: '#ff3b3b', cargo: 'presidente' } });
        if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
        if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
        if (u.pathname === '/api/sede' && req.method() === 'GET') return json(200, sede());
        if (u.pathname.startsWith('/api/asoc/')) {
          let body = {}; try { body = req.postData() ? JSON.parse(req.postData()) : {}; } catch (e) { body = {}; }
          pedidos.push({ ruta: u.pathname, metodo: req.method(), body, cab: req.headers()['x-envivo'] });
          const [st, d] = asoc(u.pathname, req.method(), body, req.headers()['x-envivo']);
          return json(st, d);
        }
        return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
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
        if (localStorage.getItem('__prueba_init')) return;
        localStorage.setItem('__prueba_init', '1');
        localStorage.setItem('envivo_guia_v1', '"hecha"');
        localStorage.setItem('envivo_lang', 'es');
        localStorage.setItem('envivo_tycoon_save_v1', sv);
      } catch (e) { /* nada */ }
    }, save);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Api && window.Api.estado && window.Api.estado.logueado, null, { timeout: 8000 });
    for (let i = 0; i < 4; i++) { const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"]'); if (!b) break; await b.click(); await page.waitForTimeout(250); }
    const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, 'ayuda_asoc_' + n + '.png') }); };
    const desborde = async (tag) => { const o = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, (() => { const p = document.querySelector('#aa-panel:not([hidden]) .aa-cuerpo'); return p ? p.scrollWidth - p.clientWidth : 0; })())); bien(o <= 1, tag + ': sin desborde horizontal (' + o + 'px)'); };
    const toast = () => page.evaluate(() => { const t = document.getElementById('toast') || document.querySelector('.toast'); return t ? t.innerText : ''; });

    /* 1. Globo con el número y un toque = ayudar a todos */
    await page.waitForSelector('#aa-btn:not([hidden])', { timeout: 8000 }).catch(() => {});
    bien(await page.locator('#aa-btn:not([hidden])').count() === 1, '1: aparece el globo 🤝 (hay pedidos en la asociación)');
    bien((await page.locator('#aa-btn b').innerText().catch(() => '')) === '3', '1: el globo muestra 3 pedidos');
    bien(await page.evaluate(() => window.AyudaAsoc.multPago()) === 1.04, '1: extensión de pago: Contratos dorados nivel 2 = ×1,04');
    await shot('01_globo'); await desborde('globo');
    await page.locator('#aa-btn').click();
    await page.waitForFunction(() => document.getElementById('aa-btn').hidden, null, { timeout: 5000 }).catch(() => {});
    const todos = pedidos.find((p) => p.ruta === '/api/asoc/ayuda/todos');
    bien(!!todos && todos.metodo === 'POST' && todos.cab === '1', '1: un toque manda POST /api/asoc/ayuda/todos con X-Envivo');
    bien(await page.evaluate(() => document.getElementById('aa-btn').hidden), '1: sin pedidos, el globo se esconde');
    const t1 = await toast();
    bien(/Ayudaste en 3 obras/.test(t1) && /\+3 fichas/.test(t1), '1: aviso "Ayudaste en 3 obras … +3 fichas": ' + t1.replace(/\s+/g, ' '));
    await shot('02_ayudado');

    /* 2. Chat → Asociación: barra Ayudas / Investigación / Tienda */
    S.pendientes = [
      { obra_id: 90, jugador_id: 11, nombre: 'Canal 5 Ibarra', tipo: 'mejora', ed: 'comercial', nivel: 10, restante: 4 * H, ayudas: 3, ayudas_max: 12, segundos_ayuda: 300 },
      { obra_id: 91, jugador_id: 12, nombre: 'Majo TV', tipo: 'nivel', ed: 'sede', nivel: 12, restante: 29 * H, ayudas: 10, ayudas_max: 12, segundos_ayuda: 1080 },
    ];
    await page.evaluate(() => window.AyudaAsoc.refrescar());
    await page.waitForSelector('#aa-btn:not([hidden])', { timeout: 5000 }).catch(() => {});
    await page.locator('#chat-btn').click();
    await page.locator('[data-chat-tab="asociacion"]').click();
    await page.waitForSelector('#chat-asoc-barra:not([hidden]) [data-aa-tab="ayudas"]', { timeout: 5000 }).catch(() => {});
    const barra = await page.locator('#chat-asoc-barra').innerText().catch(() => '');
    bien(/Ayudas \(2\)/.test(barra) && /Investigación/.test(barra) && /Tienda/.test(barra), '2: barra de la asociación en el chat: ' + barra.replace(/\s+/g, ' '));
    await shot('03_chat_barra'); await desborde('chat');

    /* 3. Panel: Ayudas */
    await page.locator('#chat-asoc-barra [data-aa-tab="ayudas"]').click();
    await page.waitForSelector('#aa-panel:not([hidden]) [data-aa="todos"]', { timeout: 5000 }).catch(() => {});
    const pan = await page.locator('#aa-panel').innerText().catch(() => '');
    bien(/Ayudar a todos \(2\)/.test(pan) && /Canal 5 Ibarra/.test(pan) && /tus obras/i.test(pan) && /Hasta 12 ayudas por obra/.test(pan), '3: panel Ayudas con pedidos, tope y tus obras');
    bien(/PUE/.test(pan) && /Nivel 2\/6/.test(pan) && /46|49/.test(await page.locator('.aa-fichas').innerText()), '3: cabecera con siglas, nivel y fichas');
    await shot('04_ayudas'); await desborde('ayudas');
    await page.locator('#aa-panel [data-aa="pedir"][data-obra="501"]').click();
    await page.waitForFunction(() => !document.querySelector('#aa-panel [data-aa="pedir"][data-obra="501"]'), null, { timeout: 5000 }).catch(() => {});
    const pd = pedidos.find((p) => p.ruta === '/api/asoc/ayuda/pedir');
    bien(!!pd && pd.body.obra_id === 501, '3: "Pedir ayuda" manda obra_id 501');
    bien(/Ayuda pedida/.test(await page.locator('#aa-panel').innerText()), '3: la obra queda como "Ayuda pedida"');
    await page.locator('#aa-panel [data-aa="todos"]').click();
    await page.waitForFunction(() => /Ayudar a todos \(0\)/.test(document.getElementById('aa-panel').innerText), null, { timeout: 5000 }).catch(() => {});
    bien(pedidos.filter((p) => p.ruta === '/api/asoc/ayuda/todos').length === 2 && await page.locator('#aa-panel [data-aa="todos"][disabled]').count() === 1, '3: "Ayudar a todos" desde el panel y queda en (0) deshabilitado');
    await shot('05_ayudas_hecho');

    /* 4. Investigación: donar dinero del juego y materiales */
    await page.locator('#aa-panel [data-aa-tab="investigacion"]').click();
    await page.waitForSelector('#aa-panel [data-aa="donar"]', { timeout: 5000 }).catch(() => {});
    const inv = await page.locator('#aa-panel').innerText();
    bien(/Contratos dorados/.test(inv) && /Taller compartido/.test(inv) && /Refuerzos/.test(inv) && /610\/1\.600/.test(inv), '4: tres investigaciones con progreso');
    await shot('06_investigacion'); await desborde('investigación');
    const dinero0 = await page.evaluate(() => window.__game.state.money);
    await page.locator('#aa-panel [data-aa="donar"][data-tech="paga_eventos"][data-tipo="dinero"]').click();
    await page.waitForFunction(() => /620\/1\.600/.test(document.getElementById('aa-panel').innerText), null, { timeout: 5000 }).catch(() => {});
    const dn = pedidos.find((p) => p.ruta === '/api/asoc/investigacion/donar');
    bien(!!dn && dn.body.tipo === 'dinero' && dn.body.pagado_en_juego === true && dn.body.tech === 'paga_eventos', '4: donar dinero manda pagado_en_juego: true');
    bien(dinero0 - await page.evaluate(() => window.__game.state.money) === 2000, '4: la partida descuenta $2.000 después de que el servidor acepta');
    await page.locator('#aa-panel [data-aa="donar"][data-tech="refuerzos"][data-mat="cables"]').click();
    await page.waitForFunction(() => /subió al nivel 2/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {});
    const dm = pedidos.filter((p) => p.ruta === '/api/asoc/investigacion/donar')[1];
    bien(!!dm && dm.body.tipo === 'material' && dm.body.material === 'cables' && dm.body.pagado_en_juego === false, '4: donar 10 cables (sin pagado_en_juego)');
    bien(/subió al nivel 2/.test(await toast()), '4: aviso de nivel subido (Refuerzos 2)');
    bien(await page.locator('#aa-panel [data-aa="donar"][data-mat="placas"][disabled]').count() === 3, '4: con 8 placas no se puede donar 10 (botón apagado)');
    await shot('07_donado');

    /* 5. Tienda: segundo toque para confirmar */
    await page.locator('#aa-panel [data-aa-tab="tienda"]').click();
    await page.waitForSelector('#aa-panel [data-aa="comprar"]', { timeout: 5000 }).catch(() => {});
    const ti = await page.locator('#aa-panel').innerText();
    bien(/Caja de materiales/.test(ti) && /Insignia «Solidaria»/.test(ti) && /Agotado por hoy/.test(ti) && /Sin dinero real/.test(ti), '5: tienda con artículos fijos, agotado y "sin dinero real"');
    await shot('08_tienda'); await desborde('tienda');
    const f0 = S.fichas;
    await page.locator('#aa-panel [data-aa="comprar"][data-item="acel_15"]').click();
    bien(!pedidos.some((p) => p.ruta === '/api/asoc/tienda/comprar') && /Seguro/.test(await page.locator('#aa-panel [data-item="acel_15"]').innerText()), '5: primer toque solo pide confirmar');
    await page.locator('#aa-panel [data-aa="comprar"][data-item="acel_15"]').click();
    await page.waitForFunction((f) => document.querySelector('.aa-fichas') && document.querySelector('.aa-fichas').innerText.includes(String(f - 15)), f0, { timeout: 5000 }).catch(() => {});
    bien(pedidos.filter((p) => p.ruta === '/api/asoc/tienda/comprar').length === 1 && S.fichas === f0 - 15, '5: segundo toque compra (−15 fichas)');
    bien(await page.locator('#aa-panel [data-item="insignia_solidaria"][disabled]').count() === 1, '5: la insignia (250) queda apagada sin fichas suficientes');
    await shot('09_comprado');

    /* 6. Socio nuevo: bloqueado con aviso */
    S.espera = 5 * H + 20 * 60;
    S.pendientes = [{ obra_id: 95, jugador_id: 13, nombre: 'Tele Sur', tipo: 'mejora', ed: 'control', nivel: 8, restante: 2 * H, ayudas: 0, ayudas_max: 12, segundos_ayuda: 300 }];
    await page.locator('#aa-panel [data-aa-tab="ayudas"]').click();
    await page.evaluate(() => window.AyudaAsoc.refrescar());
    await page.waitForFunction(() => /podrás ayudar y donar en 5 h 20 min/.test(document.getElementById('aa-panel').innerText), null, { timeout: 5000 }).catch(() => {});
    bien(/podrás ayudar y donar en 5 h 20 min/.test(await page.locator('#aa-panel').innerText()), '6: aviso de 24 h con el tiempo que falta');
    bien(await page.locator('#aa-panel [data-aa="todos"][disabled]').count() === 1, '6: "Ayudar a todos" apagado para el socio nuevo');
    await shot('10_socio_nuevo');
    S.espera = 0;

    /* 7. Inglés */
    await page.evaluate(() => window.I18N.setIdioma('en'));
    await page.waitForFunction(() => window.I18N.idioma === 'en', null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => window.AyudaAsoc.refrescar());
    await page.waitForFunction(() => /Help everyone/.test(document.getElementById('aa-panel').innerText), null, { timeout: 5000 }).catch(() => {});
    const en = await page.locator('#aa-panel').innerText();
    bien(/Help everyone \(1\)/.test(en) && /your builds/i.test(en) && /Research/.test(en) && !/tab_|err\.|ed\./.test(en), '7: panel en inglés sin claves sueltas');
    await shot('11_ingles');
    await page.evaluate(() => window.I18N.setIdioma('es'));
    await page.waitForFunction(() => window.I18N.idioma === 'es', null, { timeout: 5000 }).catch(() => {});
    await page.locator('#aa-panel [data-aa="cerrar"]').click();
    bien(await page.evaluate(() => document.getElementById('aa-panel').hidden), '7: el panel se cierra');
    await page.locator('#chat-panel [data-chat="cerrar"]').click().catch(() => {});

    /* 8. Sede oficial: botón "Pedir ayuda" en la obra */
    await page.locator('nav button[data-tab="inicio"]').click().catch(() => {});
    await page.waitForSelector('.sd-card.sd-of', { timeout: 8000 }).catch(() => {});
    const card = page.locator('.sd-card.sd-of .sd-head').first();
    if (await card.count()) {
      await card.click();
      await page.waitForSelector('#modal .sd-of-obra', { timeout: 5000 }).catch(() => {});
      const bp = page.locator('#modal [data-aa="pedir"][data-obra="502"]');
      bien(await bp.count() === 1, '8: la obra de la sede oficial trae "Pedir ayuda"');
      bien(await page.locator('#modal .sd-of-obra button[disabled]', { hasText: 'Ayuda pedida' }).count() === 1, '8: la obra que ya pidió (501) dice "Ayuda pedida"');
      await shot('12_sede_pedir'); await desborde('sede');
      if (await bp.count()) {
        await bp.click();
        await page.waitForFunction(() => { const b = document.querySelector('#modal [data-obra="502"][data-aa="pedir"]'); return b && b.disabled; }, null, { timeout: 5000 }).catch(() => {});
        const pp = pedidos.filter((p) => p.ruta === '/api/asoc/ayuda/pedir');
        bien(pp.length === 2 && pp[1].body.obra_id === 502 && await page.locator('#modal .sd-of-obra button[disabled]', { hasText: 'Ayuda pedida' }).count() === 2, '8: tocarlo pide ayuda (obra 502) y queda "Ayuda pedida"');
        await shot('13_sede_pedida');
      }
    } else bien(false, '8: no apareció la tarjeta de la sede oficial');

    bien(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${fallas ? '❌' : '✅'} Ayudas de asociación: ${aciertos} bien, ${fallas} fallas (capturas en tests/capturas/ayuda_asoc_*.png)`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
