/* Prueba de js/gran_produccion.js (Gran Producción de Asociación) en el juego real, celular 390x844.
   El servidor se imita aquí (/api/estado con sesión y asociación, /api/gran, /api/gran/resumen, /api/gran/aportar).
   - Inicio: franja de la producción en curso con progreso, tiempo y "Aportar (N listos)" que abre la pantalla.
   - Pantalla: mega evento, reloj, barra con los niveles, los 3 frentes, mi aporte (botones con turnos), aportes por miembro,
     tabla del servidor y premios fijos. "Enviar cuadrilla" = POST /api/gran/aportar {frente: personal} con X-Envivo.
   - Chat → pestaña Asociación: franja "🎬 Gran Producción · N %" que abre la pantalla.
   - Socio nuevo (< 24 h): aviso sin botones. Fase "pronto": próxima con cuenta regresiva y premios; sin franja en Inicio.
   - Aviso push "/?ir=gran": abre la pantalla sola. Sin errores de JS ni desborde horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_gran_produccion.js   (capturas en tests/capturas/gran_produccion_*.png) */
'use strict';
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

/* ---------- Servidor de mentira ---------- */
const H = 3600;
const PREMIOS = [
  { id: 'participacion', pct: 1, premios: [{ tipo: 'dinero', item: '-', cantidad: 1500 }, { tipo: 'consumible', item: 'cable', cantidad: 1 }] },
  { id: 'bronce', pct: 30, premios: [{ tipo: 'dinero', item: '-', cantidad: 3000 }, { tipo: 'consumible', item: 'cable', cantidad: 2 }] },
  { id: 'plata', pct: 60, premios: [{ tipo: 'dinero', item: '-', cantidad: 6000 }, { tipo: 'consumible', item: 'cable', cantidad: 3 }, { tipo: 'consumible', item: 'battery', cantidad: 2 }, { tipo: 'creditos', item: '-', cantidad: 10 }] },
  { id: 'oro', pct: 100, premios: [{ tipo: 'dinero', item: '-', cantidad: 10000 }, { tipo: 'consumible', item: 'cable', cantidad: 4 }, { tipo: 'consumible', item: 'battery', cantidad: 3 }, { tipo: 'creditos', item: '-', cantidad: 25 }] },
  { id: 'leyenda', pct: 150, premios: [{ tipo: 'dinero', item: '-', cantidad: 15000 }, { tipo: 'creditos', item: '-', cantidad: 40 }, { tipo: 'reparar_todo', item: '-', cantidad: 1 }] },
];
const REGLAS = { frentes: [{ id: 'personal', max: 8, meta: 4, cada_seg: 14400 }, { id: 'equipos', max: 8, meta: 4, cada_seg: 14400 }, { id: 'transmision', max: 12, meta: 6, cada_seg: null }],
  niveles: PREMIOS, puestos: [1, 2, 3].map((n) => ({ puesto: n, premios: [{ tipo: 'creditos', item: '-', cantidad: 25 - 5 * n }] })), antiguedad_seg: 86400, tope_progreso: 200 };
const S = { fase: 'en_curso', espera: 0, yo: { personal: 3, equipos: 2, transmision: 5 }, disp: { personal: 2, equipos: 1 }, tot: { personal: 8, equipos: 5, transmision: 14 } };
const PROD = { id: '2026-11-13', tema: 'concierto_estadio', icono: '🎤', nombre: 'Concierto de 3 noches en el Estadio del Sol', estado: 'en_curso', inicio: '2026-11-13T18:00:00-05:00',
  fin: '2026-11-15T18:00:00-05:00', horas: 48, empieza_seg: 0, quedan_seg: 20 * H + 1800 };
function progreso() { const m = { personal: 12, equipos: 12, transmision: 18 }; let s = 0; for (const k in m) s += Math.min(S.tot[k], 2 * m[k]); return Math.floor(100 * s / 42); }
function vista() {
  const base = { ok: true, ahora: new Date().toISOString(), fase: S.fase, reglas: REGLAS, en_asociacion: true, proxima: null, asociacion: null, yo: null, miembros: [], tabla: [],
    ultima: { id: '2026-11-06', tema: 'maraton_nubes', icono: '🏃', nombre: 'Maratón Ciudad de las Nubes', estado: 'cerrada', horas: 48, empieza_seg: 0, quedan_seg: 0,
      asociacion: { progreso: 112, nivel: 'oro', puesto: 2 }, premio: { nivel: 'oro', puesto: 2, premios: PREMIOS[3].premios } } };
  if (S.fase === 'pronto') return Object.assign(base, { produccion: null, proxima: Object.assign({}, PROD, { id: '2026-11-20', tema: 'festival_playa', icono: '🌊', estado: 'pronto', empieza_seg: 3 * 86400 + 5 * H }) });
  const pct = progreso();
  return Object.assign(base, { produccion: PROD,
    asociacion: { id: 3, nombre: 'Productores Unidos del Ecuador', siglas: 'PUE', color: '#ff3b3b', activos: 3, metas: { personal: 12, equipos: 12, transmision: 18 }, totales: Object.assign({}, S.tot),
      progreso: pct, nivel: pct >= 60 ? 'plata' : pct >= 30 ? 'bronce' : 'participacion', siguiente: pct >= 60 ? { id: 'oro', pct: 100 } : { id: 'plata', pct: 60 }, puesto: 1 },
    yo: { espera: S.espera, otra_asociacion: false, aportes: Object.assign({}, S.yo), max: { personal: 8, equipos: 8, transmision: 12 }, disponibles: Object.assign({}, S.disp),
      proximo_seg: { personal: S.disp.personal ? null : 3 * H + 600, equipos: S.disp.equipos ? null : 2 * H }, aporto: true },
    miembros: [{ jugador_id: 7, nombre: 'QF', cargo: 'presidente', personal: S.yo.personal, equipos: S.yo.equipos, transmision: S.yo.transmision, total: S.yo.personal + S.yo.equipos + S.yo.transmision, yo: true },
      { jugador_id: 9, nombre: 'Productora Cotopaxi con un nombre muy largo para ver el corte', cargo: 'socio', personal: 5, equipos: 3, transmision: 9, total: 17, yo: false },
      { jugador_id: 11, nombre: 'Majo TV', cargo: 'socio', personal: 0, equipos: 0, transmision: 0, total: 0, yo: false }],
    tabla: [{ posicion: 1, asociacion_id: 3, nombre: 'Productores Unidos del Ecuador', siglas: 'PUE', color: '#ff3b3b', progreso: pct, nivel: 'plata', activos: 3, mia: true },
      { posicion: 2, asociacion_id: 8, nombre: 'Señal Andina', siglas: 'SAN', color: '#00aaff', progreso: 41, nivel: 'bronce', activos: 12, mia: false }] });
}
function gran(ruta, metodo, body, cab) {
  if (metodo === 'POST' && cab !== '1') return [403, { ok: false, error: 'Petición no permitida.', codigo: 'cabecera_requerida' }];
  if (ruta === '/api/gran' && metodo === 'GET') return [200, vista()];
  if (ruta === '/api/gran/resumen') { const v = vista(); return [200, { ok: true, fase: v.fase, produccion: v.produccion, en_asociacion: true, progreso: v.asociacion ? v.asociacion.progreso : null, disponibles: S.espera ? 0 : S.disp.personal + S.disp.equipos, espera: S.espera }]; }
  if (ruta === '/api/gran/aportar') {
    if (S.espera > 0) return [409, { ok: false, error: 'Llevas menos de 24 horas en tu asociación.', codigo: 'gp_miembro_nuevo', espera: S.espera }];
    const f = body.frente, n = S.disp[f] || 0;
    if (!n) return [409, { ok: false, error: 'Tu próximo turno llega en 3 h.', codigo: 'gp_espera', espera: 3 * H }];
    S.disp[f] = 0; S.yo[f] += n; S.tot[f] += n;
    return [200, Object.assign({ aporte: { frente: f, cantidad: n } }, vista())];
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
    const errores = [];
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
        if (u.pathname === '/api/asoc/ayuda/resumen') return json(200, { ok: true, asociacion: 3, pendientes: 0, fichas: 0, espera: 0, bonos: { paga_eventos_pct: 0, reparacion_pct: 0, ayudas_extra: 0 } });
        if (u.pathname.startsWith('/api/gran')) {
          let body = {}; try { body = req.postData() ? JSON.parse(req.postData()) : {}; } catch (e) { body = {}; }
          pedidos.push({ ruta: u.pathname, metodo: req.method(), body, cab: req.headers()['x-envivo'] });
          const [st, d] = gran(u.pathname, req.method(), body, req.headers()['x-envivo']);
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
    await ctx.addInitScript((sv) => {
      try {
        if (localStorage.getItem('__prueba_init')) return;
        localStorage.setItem('__prueba_init', '1');
        localStorage.setItem('envivo_guia_v1', '"hecha"');
        localStorage.setItem('envivo_lang', 'es');
        localStorage.setItem('envivo_tycoon_save_v1', sv);
      } catch (e) { /* nada */ }
    }, save);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errores.push(m.text()); });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Api && window.Api.estado && window.Api.estado.logueado, null, { timeout: 8000 });
    const cerrarModales = async () => { for (let i = 0; i < 4; i++) { const b = await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"]'); if (!b) break; await b.click(); await page.waitForTimeout(250); } };
    await cerrarModales();
    const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, 'gran_produccion_' + n + '.png') }); };
    const desborde = async (tag) => { const o = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, (() => { const p = document.querySelector('#gp-panel:not([hidden]) .gp-cuerpo'); return p ? p.scrollWidth - p.clientWidth : 0; })())); bien(o <= 1, tag + ': sin desborde horizontal (' + o + 'px)'); };
    const toast = () => page.evaluate(() => { const t = document.getElementById('toast') || document.querySelector('.toast'); return t ? t.innerText : ''; });

    /* 1. Franja en Inicio */
    await page.waitForSelector('.gp-card [data-gp="abrir"]', { timeout: 8000 }).catch(() => {});
    const card = await page.locator('.gp-card').innerText().catch(() => '');
    bien(/Gran Producción: Concierto de 3 noches/.test(card) && /Progreso 64 %/.test(card) && /Faltan 20 h/.test(card), '1: franja de Inicio con mega evento, progreso y tiempo: ' + card.replace(/\s+/g, ' '));
    bien(/Aportar \(3 listos\)/.test(card), '1: botón "Aportar (3 listos)"');
    await shot('01_inicio'); await desborde('inicio');

    /* 2. Pantalla */
    await page.locator('.gp-card [data-gp="abrir"]').click();
    await page.waitForSelector('#gp-panel:not([hidden]) [data-gp="aportar"]', { timeout: 5000 }).catch(() => {});
    const pan = await page.locator('#gp-panel').innerText().catch(() => '');
    bien(/Concierto de 3 noches en el Estadio del Sol/.test(pan) && /Faltan 20 h/.test(pan) && /64 %/.test(pan), '2: pantalla con mega evento, reloj y progreso');
    bien(/Nivel Plata/.test(pan) && /siguiente: Oro con 100 %/.test(pan), '2: nivel actual y siguiente');
    bien(/8\/12/.test(pan) && /5\/12/.test(pan) && /14\/18/.test(pan), '2: los 3 frentes con lo aportado y la meta');
    bien(/Enviar cuadrilla \(×2\)/.test(pan) && /Prestar equipos/.test(pan), '2: botones con los turnos listos');
    bien(/Productora Cotopaxi/.test(pan) && /Majo TV/.test(pan) && /tú/.test(pan), '2: aportes por miembro (yo marcado)');
    bien(/Tabla del servidor/i.test(pan) && /Señal Andina/.test(pan), '2: tabla del servidor');
    bien(/Leyenda · 150 %/.test(pan) && /\$15[.,]000 del juego/.test(pan) && /reparar todo tu equipo/.test(pan), '2: premios fijos y visibles');
    bien(/No gastas nada/.test(pan) && /Meta hecha para 3 miembros activos/.test(pan), '2: explica que no gasta nada y la meta por activos');
    bien(/Última: Maratón Ciudad de las Nubes/.test(pan) === false, '2: en curso no muestra "Última" arriba');
    await shot('02_pantalla'); await desborde('pantalla');
    await page.evaluate(() => { const c = document.querySelector('#gp-panel .gp-cuerpo'); c.scrollTop = c.scrollHeight; });
    await shot('03_pantalla_abajo');

    /* 3. Aportar */
    await page.evaluate(() => { const c = document.querySelector('#gp-panel .gp-cuerpo'); c.scrollTop = 0; });
    await page.locator('[data-gp="aportar"][data-frente="personal"]').click();
    await page.waitForFunction(() => { const b = document.querySelector('[data-gp="aportar"][data-frente="personal"]'); return b && b.disabled; }, null, { timeout: 5000 }).catch(() => {});
    const ap = pedidos.find((p) => p.ruta === '/api/gran/aportar');
    bien(!!ap && ap.metodo === 'POST' && ap.cab === '1' && ap.body.frente === 'personal', '3: POST /api/gran/aportar {frente: personal} con X-Envivo');
    const t3 = await toast();
    bien(/Cuadrilla enviada/.test(t3) && /\+2 de personal/.test(t3), '3: aviso "¡Cuadrilla enviada! +2": ' + t3.replace(/\s+/g, ' '));
    const btn = await page.locator('[data-gp="aportar"][data-frente="personal"]').innerText();
    bien(/próximo en 3 h/.test(btn) && /5\/8/.test(btn), '3: sin turnos: "próximo en 3 h" y 5/8: ' + btn.replace(/\s+/g, ' '));
    bien(/10\/12/.test(await page.locator('#gp-panel').innerText()), '3: el frente de personal sube a 10/12');
    await shot('04_aportado');
    await page.locator('[data-gp="cerrar"]').click();

    /* 4. Chat → Asociación: franja */
    await page.locator('#chat-btn').click();
    await page.locator('[data-chat-tab="asociacion"]').click();
    await page.waitForSelector('#gp-franja:not([hidden])', { timeout: 5000 }).catch(() => {});
    const fr = await page.locator('#gp-franja').innerText().catch(() => '');
    bien(/Gran Producción · 69 %/.test(fr) && /Faltan/.test(fr), '4: franja en la pestaña Asociación del chat: ' + fr.replace(/\s+/g, ' '));
    await shot('05_chat'); await desborde('chat');
    await page.locator('[data-chat-tab="servidor"]').click();
    bien(await page.evaluate(() => document.getElementById('gp-franja').hidden), '4: en la pestaña Servidor la franja no se ve');
    await page.locator('[data-chat-tab="asociacion"]').click();
    await page.locator('#gp-franja').click();
    await page.waitForSelector('#gp-panel:not([hidden])', { timeout: 5000 }).catch(() => {});
    bien(await page.locator('#gp-panel:not([hidden])').count() === 1, '4: la franja abre la pantalla');
    await page.locator('[data-gp="cerrar"]').click();
    await page.locator('[data-chat="cerrar"]').click().catch(() => {});

    /* 5. Socio nuevo */
    S.espera = 5 * H;
    await page.evaluate(() => window.GranProduccion.abrir());
    await page.waitForFunction(() => /Llevas poco tiempo/.test(document.getElementById('gp-panel').innerText), null, { timeout: 5000 }).catch(() => {});
    const p5 = await page.locator('#gp-panel').innerText();
    bien(/Llevas poco tiempo en la asociación: podrás aportar en 5 h/.test(p5) && await page.locator('[data-gp="aportar"]').count() === 0, '5: socio nuevo: aviso con el tiempo y sin botones');
    await shot('06_nuevo');
    await page.locator('[data-gp="cerrar"]').click();
    S.espera = 0;

    /* 6. Fase pronto */
    S.fase = 'pronto';
    await page.evaluate(() => window.GranProduccion.refrescar());
    await page.evaluate(() => window.GranProduccion.abrir());
    await page.waitForFunction(() => /Próxima Gran Producción/.test(document.getElementById('gp-panel').innerText), null, { timeout: 5000 }).catch(() => {});
    const p6 = await page.locator('#gp-panel').innerText();
    bien(/Festival Olas y Luces/.test(p6) && /Empieza en 3 d 5 h/.test(p6) && /Cómo se aporta/i.test(p6) && /Premios/i.test(p6), '6: próxima con cuenta regresiva, cómo se aporta y premios');
    bien(/Última: Maratón Ciudad de las Nubes/.test(p6) && /112 % · nivel Oro · puesto 2/.test(p6) && /Tu premio:/.test(p6), '6: resultado de la última con mi premio');
    await shot('07_pronto'); await desborde('pronto');
    await page.locator('[data-gp="cerrar"]').click();
    await page.evaluate(() => { const b = document.querySelector('[data-tab="inicio"], [data-t="inicio"]'); if (b) b.click(); });
    await page.waitForTimeout(600);
    bien(await page.locator('.gp-card').count() === 0, '6: sin producción en curso no hay franja en Inicio');
    S.fase = 'en_curso';

    /* 7. Aviso push /?ir=gran */
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => errores.push(String(e)));
    await p2.goto(BASE + '/?ir=gran', { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('#gp-panel:not([hidden]) [data-gp="aportar"]', { timeout: 10000 }).catch(() => {});
    bien(await p2.locator('#gp-panel:not([hidden])').count() === 1, '7: /?ir=gran (aviso push) abre la pantalla sola');
    await p2.close();

    bien(errores.length === 0, 'sin errores de JS' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  } catch (e) {
    fallas++; console.error('❌ excepción:', e);
  } finally {
    await browser.close();
  }
  console.log(`\nGran Producción (navegador): ${aciertos} correctas · ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
