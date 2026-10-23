/* Capturas del juego real para la tienda (360x640 a 3x = 1080x1920).
   Arma una partida avanzada con las reglas del juego (js/logic.js + js/premium.js),
   la carga en el navegador y toma 6 pantallas en crudo en assets/promo/src/raw/.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/capturar.js
   Opcional: GAME_ROOT=<carpeta del juego> (por defecto la raíz del repo),
             GAME_LANG=en (guarda 'envivo_lang' para cuando el juego tenga traducciones),
             RAW_DIR=<carpeta de salida> (por defecto assets/promo/src/raw). */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(process.env.GAME_ROOT || path.join(__dirname, '..', '..', '..'));
const OUT = path.resolve(process.env.RAW_DIR || path.join(__dirname, 'raw'));
const LANG = process.env.GAME_LANG || '';
fs.mkdirSync(OUT, { recursive: true });

const G = require(path.join(ROOT, 'js/logic.js'));
require(path.join(ROOT, 'js/premium.js')); // agrega los equipos exclusivos al catálogo

/* ---------- Partida avanzada: capítulo 4 (La rival) ---------- */
function partidaAvanzada() {
  const s = G.newGame(4242);
  s.chapter = 3; s.chapterSeen = 3;
  s.day = 46; s.money = 18000; s.rep = 48;
  s.stats = { events: 31, fiveStars: 9, earned: 61240, best: { misa: 5, boda: 5, prensa: 4, barrial: 5, graduacion: 4, lanzamiento: 5, concierto: 4 },
    good: { lanzamiento: 3, concierto: 2, barrial: 4 }, duels: { won: 2, lost: 1 } };
  s.chapterStats = { good: { concierto: 1 }, duels: 2 };
  s.lastWorkDay = 46;
  // Personal
  const owner = s.staff[0];
  owner.skill = 4; owner.events = 31;
  const gente = [
    ['Andrea Pazmiño', 'cam', 4, 85, 92], ['Kevin Toapanta', 'cam', 3, 70, 88], ['Daniela Cedeño', 'dir', 5, 110, 95],
    ['Luis Quishpe', 'audio', 4, 90, 81], ['Mishell Salazar', 'stream', 4, 88, 90], ['Diego Andrade', 'cam', 3, 68, 76],
  ];
  gente.forEach(([name, role, skill, wage, morale], i) => s.staff.push({ id: ++s.idc, name, role, skill, wage, morale, events: 12 + i * 3, xp: 1 }));
  s.staff.push({ id: ++s.idc, name: 'Majo Cifuentes', role: 'cam', skill: 5, wage: 115, morale: 100, events: 9, premium: true });
  // Equipos
  s.equip = [];
  const eq = (type, condition, extra) => s.equip.push(Object.assign({ id: ++s.idc, type, condition }, extra || {}));
  eq('dron4k', 100, { serie: 7 }); eq('grua', 96, { serie: 21 }); eq('unidad_movil', 98, { serie: 3 }); eq('generador', 100, { serie: 12 });
  eq('cam_cine', 94); eq('cam_pro', 88); eq('cam_pro', 81); eq('cam_basic', 64, { nick: 'Cámara de Don Ramiro' });
  eq('switch_pro', 92); eq('switch_basic', 77); eq('audio_pro', 90); eq('mics', 84); eq('encoder', 89);
  eq('router4g', 93); eq('ups', 100); eq('raincover', 72);
  s.stock = { cable: 4, battery: 3 };
  // Ofertas: dos disputadas con MegaVisión
  s.contracts = [];
  const of = (type, client, extra) => s.contracts.push(Object.assign({ id: ++s.idc, type, client, cams: 3, audio: true, stream: true, outdoor: false,
    diff: G.EVENT_TYPES[type].diff, pay: 2000, daysLeft: 3, rival: false, story: false }, extra));
  of('concierto', 'Festival Sur Sonoro', { cams: 4, outdoor: true, diff: 5, pay: 4380, rival: true, rivalQuality: 71, daysLeft: 2 });
  of('lanzamiento', 'Celulares Nébula', { cams: 3, diff: 4, pay: 2640, rival: true, rivalQuality: 66, daysLeft: 3 });
  of('graduacion', 'Colegio San Gabriel', { cams: 2, diff: 2, pay: 1180, stream: false, daysLeft: 4 });
  s.candidates = [];
  G.refreshCandidates(s);
  s.log = [];
  const L = (d, t) => s.log.push({ day: d, text: t });
  L(46, '⚔️ ¡Duelo ganado contra MegaVisión! Tu calidad 83 contra 71 de ellos (+3 de fama extra).');
  L(46, '⭐⭐⭐⭐⭐ Concierto para Coliseo Rumiñahui: cobraste $3.920, sueldos $640, fama +4.');
  L(45, 'Germán Vélez: "Disfruta mientras puedas. El estadio es mío."');
  L(44, '📈 Daniela Cedeño subió a habilidad 5 y ahora cobra $110.');
  L(43, '⭐⭐⭐⭐ Lanzamiento de marca para Bebidas Volcán: cobraste $2.310, sueldos $480, fama +3.');
  L(41, '🎁 Llegó a tu bodega: Unidad móvil de transmisión #0003.');
  return s;
}

/* Evento en vivo: partido bajo la lluvia (imprevisto 1 de 3) */
function enVivoLluvia(base) {
  const s = JSON.parse(JSON.stringify(base));
  const id = ++s.idc;
  s.contracts.unshift({ id, type: 'ligapro', client: 'Club Atlético del Valle', cams: 4, audio: true, stream: true, outdoor: true, diff: 4, pay: 4100, daysLeft: 2, rival: false, story: true });
  const staffIds = s.staff.map((p) => p.id);
  const gear = s.equip.filter((e) => ['cam_cine', 'cam_pro', 'grua', 'dron4k', 'unidad_movil', 'audio_pro', 'mics', 'encoder', 'router4g', 'raincover', 'generador'].includes(e.type)).map((e) => e.id);
  const r = G.startEvent(s, id, staffIds, gear);
  if (!r.ok) throw new Error(r.msg);
  s.currentEvent.incidents = [{ key: 'lluvia', x: {}, done: false, result: null }, { key: 'epico', x: {}, done: false, result: null }, { key: 'internet', x: {}, done: false, result: null }];
  s.currentEvent.step = 0;
  return s;
}

/* Resultado: concierto disputado, 5 estrellas y duelo ganado */
function paraResultado(base) {
  const s = JSON.parse(JSON.stringify(base));
  const c = s.contracts.find((x) => x.type === 'concierto');
  const staffIds = s.staff.map((p) => p.id);
  const gear = s.equip.filter((e) => ['cam_cine', 'cam_pro', 'grua', 'unidad_movil', 'audio_pro', 'mics', 'encoder', 'router4g', 'generador'].includes(e.type)).map((e) => e.id);
  const r = G.startEvent(s, c.id, staffIds, gear);
  if (!r.ok) throw new Error(r.msg);
  s.currentEvent.base = 84;
  s.currentEvent.incidents = [{ key: 'epico', x: {}, done: false, result: null }];
  s.currentEvent.step = 0;
  return s;
}

const SAVE_KEY = 'envivo_tycoon_save_v1';
const BASE = partidaAvanzada();

/* ---------- Servidor simulado (solo para la pantalla de comunidad) ---------- */
const ahora = Date.parse('2026-10-24T01:42:00Z'); // 20:42 en Ecuador
const hace = (min) => new Date(ahora - min * 60000).toISOString();
const ESTADO = {
  ok: true, logueado: true, jugador: { id: 7, email: 'productora@ejemplo.com', nombre: 'Productora Cóndor' }, creditos: 320,
  vip_hasta: null, vip_activo: false, vip_bono_hoy: false, inicio_comprado: true, entregas: [], inventario: [],
  tienda: { productos: [], premium: [] }, plux: { disponible: false, ambiente: 'sandbox' },
  servidor: { id: 1, nombre: 'Servidor 1 · Quito' },
  asociacion: { id: 4, nombre: 'Alianza de los Andes', siglas: 'ADA', color: '#ffb020', cargo: 'presidente' },
};
const MSGS = {
  asociacion: [
    { id: 101, jugador_id: 12, alias: 'Tarima Norte', siglas: 'ADA', texto: '¡Buenas, socios! El Mega Festival abre el sábado a las 20:00.', creado: hace(52) },
    { id: 102, jugador_id: 15, alias: 'Lente Austral', siglas: 'ADA', vip: true, texto: 'Llevo dron y grúa. ¿Quién pone la unidad móvil?', creado: hace(47) },
    { id: 103, jugador_id: 7, alias: 'Productora Cóndor', siglas: 'ADA', texto: 'Yo pongo la unidad móvil y dos cámaras 4K.', creado: hace(45) },
    { id: 104, jugador_id: 21, alias: 'Señal Volcán', siglas: 'ADA', texto: 'Necesito un sonidista para el concierto de mañana 🎧', creado: hace(31) },
    { id: 105, jugador_id: 12, alias: 'Tarima Norte', siglas: 'ADA', texto: 'Te presto a Luis, tiene 4 estrellas en audio.', creado: hace(29) },
    { id: 106, jugador_id: 30, alias: 'Faro Visual', siglas: 'ADA', texto: 'Vamos 2.º en la Liga Semanal. ¡A meterle!', creado: hace(14) },
    { id: 107, jugador_id: 7, alias: 'Productora Cóndor', siglas: 'ADA', texto: '¡Buen trabajo, equipo!', creado: hace(9) },
    { id: 108, jugador_id: 15, alias: 'Lente Austral', siglas: 'ADA', vip: true, texto: '¡Esta semana le ganamos a MegaVisión! 🔴', creado: hace(3) },
  ],
  servidor: [
    { id: 201, jugador_id: 40, alias: 'Ruta Live', siglas: 'RLV', texto: '¡Hola, productoras!', creado: hace(20) },
  ],
};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'es-EC', timezoneId: 'America/Guayaquil' });
  const shots = [];

  async function abrir(state, opts) {
    opts = opts || {};
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(ahora));
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.addInitScript(([k, v, lang]) => { try { localStorage.setItem(k, v); localStorage.setItem('envivo_muted', '0'); if (lang) localStorage.setItem('envivo_lang', lang); } catch (e) { /* nada */ } }, [SAVE_KEY, JSON.stringify(state), LANG]);
    if (opts.server) {
      // Servido desde un origen http simulado: archivos del juego + API de mentira
      await page.route('http://envivo.test/**', async (route) => {
        const u = new URL(route.request().url());
        if (u.pathname.startsWith('/api/')) {
          let body = { ok: true };
          if (u.pathname === '/api/estado') body = ESTADO;
          else if (u.pathname === '/api/chat') body = { ok: true, mensajes: MSGS[u.searchParams.get('canal')] || [] };
          else if (u.pathname === '/api/partida') body = { ok: true, datos: null };
          else if (u.pathname === '/api/asociaciones') body = { ok: true, asociaciones: [] };
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
        const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
        if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
        const ext = path.extname(f);
        const ct = { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' }[ext] || 'application/octet-stream';
        return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
      });
      await page.goto('http://envivo.test/index.html', { waitUntil: 'load' });
    } else {
      await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    return page;
  }
  const tab = async (page, t) => { await page.click(`nav button[data-tab="${t}"]`); await page.waitForTimeout(250); };
  const rects = {};
  // Guarda la captura y el recuadro (en píxeles de la captura) de un elemento destacado
  const shot = async (page, name, js) => {
    const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); shots.push(f);
    if (js) {
      const r = await page.evaluate(`(() => { const el = ${js}; if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
      if (r) rects[name] = { x: Math.round(r.x * 3), y: Math.round(r.y * 3), w: Math.round(r.w * 3), h: Math.round(r.h * 3) };
    }
  };

  // 1) Imprevisto en vivo: lluvia en el estadio
  {
    const page = await abrir(enVivoLluvia(BASE));
    await page.waitForSelector('#overlay.on [data-act="choose"]');
    await page.waitForTimeout(500);
    await shot(page, '01_en_vivo', `document.querySelector('#overlay svg.scene')`);
    await page.close();
  }
  // 2) Personal con avatares
  {
    const page = await abrir(BASE);
    await tab(page, 'personal');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '02_personal', `document.querySelectorAll('#tab-personal .card')[1]`);
    await page.close();
  }
  // 3) Resultado: 5 estrellas y duelo ganado contra MegaVisión
  {
    const page = await abrir(paraResultado(BASE));
    await page.waitForSelector('#overlay.on [data-act="choose"]');
    await page.click('[data-act="choose"][data-i="0"]');
    await page.click('[data-act="finish"]');
    await page.waitForSelector('[data-act="after-result"]');
    await page.waitForTimeout(400);
    // Mostrar la parte de la tabla y el duelo dentro de la ventana
    await page.evaluate(() => { const m = document.getElementById('modal'); const d = m.querySelector('.duel'); if (d) m.scrollTop = Math.max(0, d.offsetTop - 360); });
    await page.waitForTimeout(200);
    await shot(page, '03_resultado', `document.querySelector('#modal .duel')`);
    await page.close();
  }
  // 4) Bodega con equipos exclusivos
  {
    const page = await abrir(BASE);
    await tab(page, 'bodega');
    await page.evaluate(() => { const t = [...document.querySelectorAll('#tab-bodega .sectitle')].find((x) => /Tus equipos/.test(x.textContent)); window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 10); });
    await page.waitForTimeout(250);
    await shot(page, '04_bodega', `document.querySelector('#tab-bodega .ggrid .gear')`);
    await page.close();
  }
  // 5) Inicio: centro de producción con unidad móvil
  {
    // Capítulo 5 (Al estadio): la sede ya es un centro de producción
    const st = JSON.parse(JSON.stringify(BASE)); st.chapter = 4; st.chapterSeen = 4; st.rep = 52;
    const page = await abrir(st);
    await shot(page, '05_inicio', `document.querySelector('#tab-inicio svg.hq')`);
    await page.close();
  }
  // 6) Comunidad: chat de la asociación (servidor simulado)
  {
    const page = await abrir(BASE, { server: true });
    await page.waitForSelector('#chat-btn:not([hidden])', { timeout: 8000 });
    await page.click('#chat-btn');
    await page.click('[data-chat-tab="asociacion"]');
    await page.waitForTimeout(900);
    await shot(page, '06_comunidad', `[...document.querySelectorAll('.chat-msg')].pop()`);
    await page.close();
  }
  // Extra: tienda (vitrina de exclusivos sin servidor)
  {
    const page = await abrir(BASE);
    await tab(page, 'tienda');
    await shot(page, '07_tienda');
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'rects.json'), JSON.stringify(rects, null, 2));
  console.log(shots.join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
