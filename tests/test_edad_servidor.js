/* Prueba de la edad del servidor (js/edad_servidor.js) dentro del juego real (index.html + js/ui.js + js/servidores.js +
   js/copas.js) en un celular simulado (390x844) con Playwright. El servidor se imita aquí: /api/estado (con
   edad_servidor), /api/servidor/opciones, /api/servidor/calendario y /api/copa (con tema).
   Casos: servidor nuevo (día 2): botón "Calendario del servidor" en la tarjeta "Tu servidor", ventana del calendario con
   cuenta regresiva, candados en "En línea" (duelos, festival, copa) que explican en vez de entrar, EnVivoAbrirOnline con
   candado; servidor veterano sin candados; tarjeta "Hoy en la preparación" + semana temática dentro de la Copa; textos
   en inglés y diccionarios completos. Revisa que no haya errores de JS ni desborde horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_edad_servidor.js   (capturas en tests/capturas/edad_*.png) */
'use strict';
// Fecha fija fuera de las temporadas (en Halloween, Navidad… al abrir sale el resumen del día y llegan contratos especiales)
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Diccionarios: todas las traducciones con las mismas claves y marcadores que el español ---------- */
(function () {
  const g = {};
  const code = fs.readFileSync(path.join(RAIZ, 'js/edad_servidor.js'), 'utf8');
  new Function('window', 'globalThis', 'module', code)(g, g, undefined);   // eslint-disable-line no-new-func
  const E = g.EdadServidor;
  const marcas = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join(',');
  const claves = Object.keys(E.ES);
  ['en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'].forEach((c) => {
    const d = E.TRAD[c] || {};
    const faltan = claves.filter((k) => d[k] === undefined);
    const malas = claves.filter((k) => d[k] !== undefined && marcas(d[k]) !== marcas(E.ES[k]));
    const sobran = Object.keys(d).filter((k) => E.ES[k] === undefined);
    bien(!faltan.length && !malas.length && !sobran.length, `Traducción ${c}: completa y con los mismos {marcadores}` + (faltan.length ? ' faltan ' + faltan : '') + (malas.length ? ' marcadores ' + malas : '') + (sobran.length ? ' sobran ' + sobran : ''));
  });
  bien(g.EnVivoInicio && g.EnVivoInicio.some((m) => m.id === 'edad_servidor'), 'Se registra en EnVivoInicio (id edad_servidor)');
  bien(E.boton() === '' && E.bloqueo('copa') === null && E.tarjetaTema({}) === '', 'Sin Api/sesión: sin botón, sin candados, sin tarjeta de tema');
  bien(E.textoBloqueo({ dia: 7, faltan_dias: 3 }) === 'Se abre el día 7 del servidor (en 3 días).' && E.textoBloqueo({ dia: 3, faltan_dias: 1 }) === 'Se abre el día 3 del servidor (mañana).',
    'Texto amable: "Se abre el día 7 del servidor (en 3 días)." / "(mañana)"');
})();

/* ---------- Datos de prueba ---------- */
const D = 86400e3;
const medianoche = (dias) => { const d = new Date(Date.now() + dias * D); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5, 0, 0)).toISOString(); };   // 00:00 de Ecuador (UTC−5)
function linea(dia, veterano) {
  const L = [['apertura', 1, 'home', null], ['duelos', 3, 'rival', 'duelos'], ['festival', 5, 'festival', 'festival'], ['copa', 7, 'crown', 'copa']];
  return L.map(([clave, d, icono, modo]) => {
    const abierto = veterano || dia >= d;
    return { clave, dia: d, nombre: clave, detalle: '', icono, modo, abierto, abre: medianoche(d - dia), faltan_dias: abierto ? 0 : d - dia, mensaje: null };
  });
}
const SV = { id: 5, nombre: 'Servidor 5 · Manta' };
function edad(dia, veterano) {
  const des = linea(dia, veterano);
  return { dia, edad_dias: dia - 1, veterano, ahora: new Date().toISOString(), desbloqueos: des, proximos: des.filter((x) => !x.abierto) };
}
const SEMANA = (hoy) => ['construccion', 'personal', 'equipos', 'en_linea', 'total'].map((clave, i) => ({ n: i + 1, clave, nombre: clave, cuenta: '', fecha: '2026-11-0' + (2 + i), hoy: i + 1 === hoy, pasado: i + 1 < hoy }));
function copa(hoy) {
  const ahora = Date.now();
  return {
    ok: true,
    copa: { id: 9, nombre: 'Copa Planeta de Balompié', torneo_key: 'copa_planeta_balompie', fase: 'preparacion', inicio: new Date(ahora - 2 * D).toISOString(), fin: new Date(ahora + 5 * D).toISOString(),
      ahora: new Date(ahora).toISOString(), semana: '2026-W45', batalla: new Date(ahora + 3 * D).toISOString(), cierre: new Date(ahora + 3 * D + 20 * 3600e3).toISOString() },
    universo: { id: 1, nombre: 'Universo Andino' },
    servidores: [{ id: 1, nombre: 'Servidor 1 · Quito', puntos_prep: 4210, puntos_tabla: 0, g: 0, e: 0, p: 0, posicion: 1, yo: true, bono: 9, activos: 30 },
      { id: 2, nombre: 'Servidor 2 · Guayaquil', puntos_prep: 3120, puntos_tabla: 0, g: 0, e: 0, p: 0, posicion: 2, yo: false, bono: 7, activos: 25 }],
    cruces: [{ id: 1, ronda: 1, a: 1, b: 2, a_nombre: 'Servidor 1 · Quito', b_nombre: 'Servidor 2 · Guayaquil', hora: new Date(ahora + 3 * D + 10 * 3600e3).toISOString(), estado: 'pendiente', puntos_a: null, puntos_b: null, partidos: [] }],
    yo: { servidor_id: 1, aporte: 340, posicion_en_servidor: 3, equipo_registrado: true, intento_abierto: null, intentos_hoy: 2, intentos_max: 10, trofeos: [], premios: [] },
    top_aportantes: [{ alias: 'Beto Live', siglas: 'QFP', puntos: 820 }], historial: [],
    tema: { hoy: hoy ? { n: hoy, clave: SEMANA(hoy)[hoy - 1].clave, nombre: '', cuenta: '', intentos: 1, personal: 0, equipos: 0, obras: hoy === 1 ? 2 : hoy === 5 ? 1 : 0, max: 1.5 } : null,
      semana: SEMANA(hoy || 6), obras: { puntos: 110, cuantas: 2, max: 6, puntos_mejora: 15, puntos_nivel: 40 } },
  };
}
const CASOS = {
  nuevo: { servidor: SV, edad: edad(2, false) },
  veterano: { servidor: { id: 1, nombre: 'Servidor 1 · Quito' }, edad: edad(40, true), copa: copa(1) },
  martes: { servidor: { id: 1, nombre: 'Servidor 1 · Quito' }, edad: edad(40, true), copa: copa(2) },
};

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const pagina = html.includes('js/edad_servidor.js') ? html
  : html.replace('<script defer src="js/servidores.js"></script>', '<script defer src="js/servidores.js"></script>\n<script defer src="js/edad_servidor.js"></script>');
if (!pagina.includes('js/edad_servidor.js')) throw new Error('No se pudo poner js/edad_servidor.js en index.html');

async function abrir(browser, caso, locale) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: locale || 'es-EC' });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { caso, calendario: 0, sinCabecera: [] };
  const estado = () => ({ ok: true, tienda: { productos: [] }, logueado: true, entregas: [], inventario: [], creditos: 120,
    jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' },
    servidor: caso.servidor,
    universo: { id: 1, nombre: 'Universo Andino' }, edad_servidor: caso.edad });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/servidor/calendario' && req.headers()['x-envivo'] !== '1') srv.sinCabecera.push(u.pathname);
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/servidor/opciones') return json(200, { ok: true, actual: Object.assign({}, caso.servidor, { estado: 'sano', activos_7: 64 }), sugerido: null, puede: false, motivo: null, proximo_traslado: null });
      if (u.pathname === '/api/servidor/calendario') {
        srv.calendario++;
        return json(200, { ok: true, servidor: Object.assign({}, caso.servidor, { dia: caso.edad.dia, edad_dias: caso.edad.edad_dias, veterano: caso.edad.veterano }), ahora: new Date().toISOString(),
          desbloqueos: caso.edad.desbloqueos, proximos: caso.edad.proximos, copa_semana: SEMANA(3),
          recurrentes: [{ clave: 'liga', cada: 'semana' }, { clave: 'desafio', cada: 'dia' }, { clave: 'festival', cada: '2_dias' }, { clave: 'copa', cada: 'semana' }] });
      }
      if (u.pathname === '/api/copa' && caso.copa) return json(200, caso.copa);
      return json(200, { ok: true });
    }
    const f = path.join(RAIZ, decodeURIComponent(u.pathname));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f);
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[ext] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('#overlay.on [data-act="close"]', { timeout: 4000 }); await page.click('#overlay.on [data-act="close"]'); } catch (e) { /* sin bienvenida */ }
  await page.waitForTimeout(300);
  return { ctx, page, errores, srv };
}

async function sinDesborde(page, donde) {
  const d = await page.evaluate(() => {
    const ancho = window.innerWidth;
    const fuera = [...document.querySelectorAll('[data-eds], [data-eds] *, .eds-tema, .eds-tema *, .onl-tile, .onl-tile *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > ancho + 0.5 || r.left < -0.5);
    }).map((el) => el.className && el.className.baseVal !== undefined ? el.tagName : el.className || el.tagName);
    return { scroll: document.documentElement.scrollWidth - ancho, fuera: fuera.slice(0, 5) };
  });
  bien(d.scroll <= 0 && !d.fuera.length, `${donde}: sin desborde horizontal` + (d.scroll > 0 ? ` (scroll ${d.scroll}px)` : '') + (d.fuera.length ? ' fuera: ' + d.fuera.join(', ') : ''));
}
const texto = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ')).catch(() => '');
async function foto(page, nombre, sel) {
  if (sel) { await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center' })).catch(() => {}); await page.waitForTimeout(150); } else await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'edad_' + nombre + '.png') });
}
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  bien(!o.srv.sinCabecera.length, `${nombre}: las peticiones llevan X-Envivo: 1`);
  await o.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---- 1. Servidor nuevo (día 2) ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.nuevo)));
      await require('./hub_ayuda').verEnInicio(o.page, '[data-srv="tarjeta"] [data-eds="boton"]', 8000);   // "Tu servidor": en la antena de la sede (js/hub.js)
      const b = await texto(o.page, '[data-eds="boton"]');
      bien(b.includes('Calendario del servidor') && b.includes('Día 2') && b.includes('Lo próximo: Duelo de Productoras · mañana'), 'Nuevo: botón en "Tu servidor" con "Día 2" y "Lo próximo: Duelo de Productoras · mañana" → ' + b);
      await sinDesborde(o.page, 'Nuevo (tarjeta)');
      await foto(o.page, 'tarjeta', '[data-srv="tarjeta"]');
      await o.page.click('[data-eds="boton"]');
      await o.page.waitForSelector('#overlay.on [data-eds="calendario"] [data-eds="semana"]', { timeout: 5000 }).catch(() => {});
      const m = await texto(o.page, '[data-eds="calendario"]');
      bien(/Calendario del servidor/.test(m) && m.includes('Servidor 5 · Manta'), 'Calendario: título y servidor');
      const filas = await o.page.$$eval('[data-eds="linea"] li', (l) => l.map((x) => x.dataset.edsD + ':' + x.dataset.abierto));
      bien(JSON.stringify(filas) === JSON.stringify(['apertura:1', 'duelos:0', 'festival:0', 'copa:0']), 'Calendario: línea de tiempo apertura (abierta), duelos, festival, copa (cerrados) → ' + filas.join(','));
      bien(m.includes('Se abre el día 3 del servidor (mañana).') && m.includes('Se abre el día 7 del servidor (en 5 días).'), 'Calendario: "Se abre el día 3 del servidor (mañana)." y "…día 7… (en 5 días)."');
      const c1 = await texto(o.page, '[data-eds-cuenta]');
      await o.page.waitForTimeout(1300);
      const c2 = await texto(o.page, '[data-eds-cuenta]');
      bien(/\d\d:\d\d:\d\d/.test(c1) && c1 !== c2, `Calendario: cuenta regresiva que avanza (${c1} → ${c2})`);
      bien((await o.page.$$('[data-eds="semana"] .d')).length === 5 && !!(await o.page.$('[data-eds="semana"] .d[data-hoy][data-tema="equipos"]')), 'Calendario: semana temática de la Copa (5 días, hoy = Día de equipos)');
      bien(m.includes('Mega Festival: cada 2 días.'), 'Calendario: eventos que se repiten');
      bien(o.srv.calendario >= 1, 'Calendario: pide /api/servidor/calendario');
      await sinDesborde(o.page, 'Calendario');
      await foto(o.page, 'calendario');
      await o.page.click('#overlay.on [data-eds="calendario"] [data-act="close"]');
      await o.page.waitForTimeout(200);
      // En línea: candados
      await o.page.click('nav button[data-tab="online"]');
      await o.page.waitForSelector('.onl-tile.eds-lock', { timeout: 5000 }).catch(() => {});
      const cand = await o.page.$$eval('.onl-tile[data-k]', (l) => l.map((t) => t.dataset.k + ':' + (t.classList.contains('eds-lock') ? 'L' : '-')));
      bien(['duelos:L', 'festival:L', 'copa:L', 'liga:-', 'desafio:-'].every((x) => cand.includes(x)), 'En línea: candado en duelos, festival y copa; liga y desafío abiertos → ' + cand.join(','));
      bien((await texto(o.page, '.onl-tile[data-k="copa"] .eds-cand')).includes('Día 7 · en 5 días'), 'En línea: la ficha de la copa dice "Día 7 · en 5 días"');
      await sinDesborde(o.page, 'En línea con candados');
      await foto(o.page, 'en_linea', '.onl-tile[data-k="copa"]');
      await o.page.click('.onl-tile[data-k="copa"]');
      await o.page.waitForSelector('#overlay.on [data-eds="bloqueo"]', { timeout: 3000 }).catch(() => {});
      const bl = await texto(o.page, '[data-eds="bloqueo"]');
      bien(bl.includes('Copa de Servidores todavía no se abre') && bl.includes('Se abre el día 7 del servidor (en 5 días).'), 'Tocar la copa cerrada: explica "Se abre el día 7 del servidor (en 5 días)."');
      bien(!(await o.page.$('#online-cont')), '…y no entra al modo');
      await sinDesborde(o.page, 'Ventana de candado');
      await foto(o.page, 'candado');
      await o.page.click('#overlay.on [data-eds="bloqueo"] [data-ext="edad_servidor"]');
      await o.page.waitForSelector('#overlay.on [data-eds="calendario"]', { timeout: 3000 }).catch(() => {});
      bien(!!(await o.page.$('#overlay.on [data-eds="calendario"]')), '"Ver calendario" desde el candado abre el calendario');
      await o.page.click('#overlay.on [data-eds="calendario"] [data-act="close"]');
      await o.page.waitForTimeout(150);
      await o.page.evaluate(() => window.EnVivoAbrirOnline('festival'));
      await o.page.waitForSelector('#overlay.on [data-eds="bloqueo"][data-modo="festival"]', { timeout: 3000 }).catch(() => {});
      bien(!!(await o.page.$('#overlay.on [data-eds="bloqueo"][data-modo="festival"]')) && !(await o.page.$('#online-cont')), 'EnVivoAbrirOnline("festival") también respeta el candado');
      await o.page.click('#overlay.on [data-eds="bloqueo"] [data-act="close"]');
      await o.page.waitForTimeout(150);
      // (la Liga real no tiene datos en este servidor falso: sus errores no son de este módulo)
      const antes = o.errores.length;
      await o.page.click('.onl-tile[data-k="liga"]');
      await o.page.waitForTimeout(300);
      bien(!!(await o.page.$('#online-cont')) && !(await o.page.$('#overlay.on [data-eds="bloqueo"]')), 'Un modo abierto (liga) entra normal');
      o.errores.length = antes;
      await cerrar(o, 'Nuevo');
    }

    /* ---- 2. Veterano: sin candados; la Copa muestra el tema del día ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.veterano)));
      await require('./hub_ayuda').verEnInicio(o.page, '[data-eds="boton"]', 8000);
      bien((await texto(o.page, '[data-eds="boton"]')).includes('Ya está todo abierto en tu servidor.'), 'Veterano: el botón dice "Ya está todo abierto"');
      await o.page.click('nav button[data-tab="online"]');
      await o.page.waitForTimeout(400);
      bien(!(await o.page.$('.onl-tile.eds-lock')), 'Veterano: ninguna ficha con candado');
      await o.page.click('.onl-tile[data-k="copa"]');
      await o.page.waitForSelector('[data-copa="tema"]', { timeout: 8000 }).catch(() => {});
      const t = await texto(o.page, '[data-copa="tema"]');
      bien(t.includes('Hoy en la preparación') && t.includes('Día de construcción') && t.includes('obras de tu sede oficial'), 'Copa (lunes): "Hoy en la preparación · Día de construcción" y qué cuenta');
      bien(t.includes('Obras de hoy: 2 de 6 · +110 pts') && t.includes('Mejora +30 · Nivel +80'), 'Copa (lunes): obras de hoy y puntos dobles por obra');
      bien((await o.page.$$('[data-copa="tema"] [data-eds="semana"] .d')).length === 5 && !!(await o.page.$('[data-copa="tema"] .d[data-hoy][data-tema="construccion"]')), 'Copa: semana temática con el lunes marcado');
      await sinDesborde(o.page, 'Copa con tema');
      await foto(o.page, 'copa_lunes', '[data-copa="tema"]');
      await cerrar(o, 'Veterano');
    }

    /* ---- 3. Martes en inglés ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.martes)), 'en-US');
      await o.page.waitForFunction(() => window.I18N && window.I18N.idioma === 'en', null, { timeout: 8000 }).catch(() => {});
      await o.page.click('nav button[data-tab="online"]');
      await o.page.waitForTimeout(300);
      await o.page.click('.onl-tile[data-k="copa"]');
      await o.page.waitForSelector('[data-copa="tema"]', { timeout: 8000 }).catch(() => {});
      const t = await texto(o.page, '[data-copa="tema"]');
      bien(t.includes('Today in the prep') && t.includes('Crew day') && t.includes('×1.5') && !t.includes('Obras'), 'Copa (martes, inglés): "Crew day · ×1.5", sin obras → ' + t.slice(0, 90));
      await sinDesborde(o.page, 'Copa en inglés');
      await foto(o.page, 'copa_martes_en', '[data-copa="tema"]');
      await cerrar(o, 'Martes (en)');
    }
  } finally {
    await browser.close();
  }
  console.log(`\nEdad del servidor (pantalla): ${bien_} bien · ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
