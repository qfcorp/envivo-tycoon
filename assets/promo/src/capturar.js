/* Capturas del juego real para Google Play (360x640 a 3x = 1080x1920, 9:16) en los 10 idiomas del juego.
   Arma una partida avanzada con las reglas del juego (js/logic.js + extensiones), la abre en Chromium
   desde un origen http simulado y toma 8 pantallas por idioma en assets/promo/src/raw/<idioma>/ (no se guardan en git).
   Después: componer.js arma las capturas finales (marco de teléfono + título por idioma) en assets/promo/screens_<idioma>/.

   Uso:  NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/capturar.js
   Opcional: GAME_LANGS=es,en   (por defecto los 10 idiomas)
             GAME_ROOT=<carpeta del juego> (por defecto la raíz del repo)
             RAW_DIR=<carpeta de salida> (por defecto assets/promo/src/raw)

   Plan de capturas (raw/<idioma>/):
     01_inicio      Inicio: la sede con el letrero "Tukán Producciones" (filas plegadas)      · zoom: dibujo de la sede
     02_clientes    Ofertas de clientes (disputada con MegaVisión e internacional)            · zoom: la oferta disputada
     03_preparar    Preparar el evento: plano de cámaras                                       · zoom: tarjeta "Llévame" (03_preparar_b)
     04_en_vivo     En vivo: franja animada + imprevisto con sus decisiones                    · zoom: la franja
     05_resultado   Resultado: 5 estrellas, ganancia y duelo                                  · zoom: compartir (05_resultado_b)
     06_bodega      Bodega: lentes con la Edición Exclusiva                                    · zoom: la tarjeta exclusiva
     07_copa        En línea: Copa de Servidores en plena batalla (servidor simulado)          · zoom: la tabla
     08_decoracion  Decorar el local (sofá, neón, trofeos...) y nivel de sede                  · zoom: el dibujo del local

   Revisa el texto de cada pantalla (también el de los SVG) y falla si aparece una marca real (LigaPro, Sony, Canon...). */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(process.env.GAME_ROOT || path.join(__dirname, '..', '..', '..'));
const OUT = path.resolve(process.env.RAW_DIR || path.join(__dirname, 'raw'));
const TODOS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
const LANGS = (process.env.GAME_LANGS || TODOS.join(',')).split(',').map((x) => x.trim()).filter(Boolean);
const LOCALE = { es: 'es-EC', en: 'en-US', 'pt-BR': 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', 'zh-CN': 'zh-CN' };
const FECHA = '2026-11-10'; // día sin temporada especial (js/temporadas.js): pantallas iguales siempre
const W = 360, H = 640, K = 3;

/* Marcas reales que no pueden salir en las capturas (se buscan con mayúsculas y como palabra entera).
   WhatsApp y Google Play no están: son los botones de compartir/calificar del propio juego, no marcas de mentira. */
const MARCAS = ['LigaPro', 'Liga Pro', 'Sony', 'Canon', 'Nikon', 'Panasonic', 'Blackmagic', 'ATEM', 'vMix', 'GoPro', 'DJI', 'Uber', 'Cabify', 'inDrive', 'Didi',
  'Shure', 'Sennheiser', 'Teradek', 'LiveU', 'Fujinon', 'Pelican', 'Cummins', 'Vizrt', 'EVS', 'Ross Video', 'Carbonite', 'Clear-Com', 'ClearCom', 'Hollyland',
  'Netgear', 'Mercedes', 'Sprinter', 'Ford', 'Toyota', 'Chevrolet', 'Samsung', 'iPhone', 'Apple', 'Netflix', 'ESPN', 'FIFA', 'CONMEBOL', 'Copa Libertadores',
  'Coca-Cola', 'Pepsi', 'Nike', 'Adidas', 'Red Bull', 'Twitch', 'YouTube', 'TikTok', 'Instagram', 'Facebook', 'Rode', 'Yamaha', 'Behringer', 'Midas'];
const RX_MARCAS = new RegExp('(^|[^\\p{L}\\p{N}])(' + MARCAS.join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'u');

const G = require(path.join(ROOT, 'js/logic.js'));
require(path.join(ROOT, 'js/premium.js'));      // equipos exclusivos
require(path.join(ROOT, 'js/decoracion.js'));   // s.decor
require(path.join(ROOT, 'js/sede.js'));         // s.sede

/* ---------- Partida avanzada (capítulo 4 · La rival) ---------- */
function partidaAvanzada() {
  const s = G.demoGame('cap4');
  if (!s) throw new Error('No se pudo armar la partida de demostración');
  delete s.demo;
  s.chapterSeen = s.chapter;          // sin la presentación del capítulo
  s.productora = 'Tukán Producciones';
  s.money = 24850; s.rep = 52;
  s.avisos = []; s.capCompletados = []; s.lastResult = null;
  const add = (role, tier, skill, name) => s.staff.push({ id: ++s.idc, name, role, tier, skill, wage: G.baseWage(role, tier, skill), morale: 94,
    events: 24, eventos_nacionales: 24, eventos_internacionales: 0, xp: 6 });
  add('camarografo', 'senior', 5, 'Andrea Pazmiño'); add('cablero', 'semi_senior', 3, 'Kevin Toapanta'); add('coordinador_piso', 'senior', 4, 'Mishell Salazar');
  add('operador_ptz', 'semi_senior', 3, 'Luis Quishpe'); add('piloto_dron', 'senior', 4, 'Diego Andrade'); add('operador_graficos', 'semi_senior', 4, 'Paola Endara');
  const eq = (type, x) => s.equip.push(Object.assign({ id: ++s.idc, type, condition: 97 }, x || {}));
  eq('grua', { serie: 21 }); eq('dron4k', { serie: 7 }); eq('generador', { serie: 12 }); eq('ex_lente_box', { serie: 4 });
  eq('veh_van_pasajeros_usada');      // la van de la flota (lleva el nombre de la productora)
  s.equip.forEach((e) => { e.condition = Math.max(e.condition, 92); });   // sin avisos de reparación
  // Decoración del local (centro de producción: hasta 9 lugares)
  s.decor = { items: ['recepcion', 'sofa', 'neon', 'tv', 'trofeos', 'cuadros', 'planta', 'flores', 'cafetera']
    .map((k) => (k === 'flores' ? { k, dia: s.day, hasta: s.day + 6 } : { k, dia: s.day - 5 })), gastado: 1890, proxVisita: s.day + 2, visitas: 3 };
  s.sede.nivel = 7;
  s.stats.fiveStars = Math.max(s.stats.fiveStars || 0, 11);
  return s;
}
const BASE = partidaAvanzada();
const contratoDe = (s, type) => s.contracts.find((c) => c.type === type && !c.internacional);

/* En vivo: concierto al aire libre, primer imprevisto de 3 (lluvia) */
function enVivo(base) {
  const s = JSON.parse(JSON.stringify(base));
  const c = contratoDe(s, 'concierto');
  const lo = G.suggestLoadout(s, c.id);
  const r = G.startEvent(s, c.id, lo.staffIds, lo.equipIds);
  if (!r.ok) throw new Error(r.msg);
  s.currentEvent.incidents = [{ key: 'lluvia', x: {}, done: false, result: null }, { key: 'epico', x: {}, done: false, result: null }, { key: 'internet', x: {}, done: false, result: null }];
  s.currentEvent.step = 0;
  return s;
}
/* Resultado: graduación disputada con MegaVisión, 5 estrellas y duelo ganado */
function paraResultado(base) {
  const s = JSON.parse(JSON.stringify(base));
  // Lanzamiento de marca disputado con MegaVisión (paga bien: el resultado sale en positivo)
  const c = contratoDe(s, 'lanzamiento');
  s.contracts.forEach((x) => { if (x !== c) x.rival = false; });
  Object.assign(c, { rival: true, rivalQuality: 74 });
  const lo = G.suggestLoadout(s, c.id);
  const r = G.startEvent(s, c.id, lo.staffIds, lo.equipIds);
  if (!r.ok) throw new Error(r.msg);
  s.currentEvent.base = 90;
  s.currentEvent.incidents = [{ key: 'epico', x: {}, done: false, result: null }];
  s.currentEvent.step = 0;
  return s;
}

/* ---------- Servidor simulado (solo para la Copa de Servidores) ---------- */
const AHORA = Date.parse('2026-10-24T20:10:00Z');           // sábado 15:10 en Ecuador: batalla en curso
const LUNES = Date.parse('2026-10-19T00:00:00-05:00');
const HR = 3600e3, DIA = 24 * HR;
const iso = (ms) => new Date(ms).toISOString();
function copaFalsa() {
  const SRV = [[1, 'S1 · Quito'], [2, 'S2 · Guayaquil'], [3, 'S3 · Cuenca'], [4, 'S4 · Loja']];
  const partidos = (n, base) => Array.from({ length: n }, (_, i) => {
    const a = [88, 71, 64, 90, 77][i] + base, b = [80, 79, 61, 85, 81][i] - base;
    return { n: i + 1, tipo: ['final', 'concierto', 'final', 'boxeo', 'final'][i], calidad_a: a, calidad_b: b, ganador: a > b ? 'a' : b > a ? 'b' : 'empate' };
  });
  const tabla = { 1: [6, 2, 0, 0, 1, 5240], 2: [3, 1, 0, 1, 2, 5120], 3: [1, 0, 1, 1, 3, 3980], 4: [1, 0, 1, 1, 4, 2410] };
  return {
    ok: true,
    copa: { id: 7, nombre: 'Copa Planeta de Balompié', torneo_key: 'planeta', fase: 'batalla', inicio: iso(LUNES), fin: iso(LUNES + 7 * DIA - 1000), ahora: iso(AHORA) },
    universo: { id: 1, nombre: 'Andes' },
    servidores: SRV.map(([id, nombre]) => ({ id, nombre, puntos_prep: tabla[id][5], puntos_tabla: tabla[id][0], g: tabla[id][1], e: tabla[id][2], p: tabla[id][3], posicion: tabla[id][4], yo: id === 1 })),
    cruces: [
      { id: 21, ronda: 1, a: 1, b: 2, hora: iso(LUNES + 5 * DIA + 10 * HR), estado: 'jugado', puntos_a: 15, puntos_b: 13, partidos: partidos(5, 3) },
      { id: 22, ronda: 2, a: 1, b: 3, hora: iso(LUNES + 5 * DIA + 14 * HR), estado: 'en_vivo', puntos_a: 2, puntos_b: 1, partidos: partidos(3, 2) },
      { id: 23, ronda: 3, a: 4, b: 1, hora: iso(LUNES + 5 * DIA + 18 * HR), estado: 'pendiente', puntos_a: null, puntos_b: null, partidos: [] },
    ],
    yo: { aporte: 640, posicion_en_servidor: 3, equipo_registrado: true, intento_abierto: null },
    top_aportantes: [{ alias: 'Lente Austral', siglas: 'ADA', puntos: 910 }, { alias: 'Señal Volcán', siglas: 'ADA', puntos: 720 },
      { alias: 'Tukán Producciones', siglas: 'ADA', puntos: 640, yo: true }, { alias: 'Faro Visual', siglas: 'RLV', puntos: 455 }, { alias: 'Tarima Norte', siglas: 'ADA', puntos: 310 }],
    historial: [{ semana: '2026-W42', nombre: 'La Pelea del Siglo', torneo_key: 'pelea', campeon: 'S2 · Guayaquil' }, { semana: '2026-W41', nombre: 'Gran Premio Fórmula Veloz', torneo_key: 'formula', campeon: 'S1 · Quito' }],
  };
}
const ESTADO = {
  ok: true, logueado: true, jugador: { id: 7, email: 'productora@ejemplo.com', nombre: 'Tukán Producciones' }, creditos: 320,
  vip_hasta: null, vip_activo: false, vip_bono_hoy: false, inicio_comprado: true, entregas: [], inventario: [],
  tienda: { productos: [], premium: [] }, plux: { disponible: false, ambiente: 'sandbox' },
  servidor: { id: 1, nombre: 'S1 · Quito' }, universo: { id: 1, nombre: 'Andes' },
  asociacion: { id: 4, nombre: 'Alianza de los Andes', siglas: 'ADA', color: '#ffb020', cargo: 'presidente' },
};

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };
const ORIGEN = 'http://envivo.test';

async function main() {
  const browser = await chromium.launch();
  const marcasHalladas = [];
  for (const lang of LANGS) {
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });
    const rects = {};
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: K, isMobile: true, hasTouch: true,
      reducedMotion: 'reduce', serviceWorkers: 'block', locale: LOCALE[lang] || lang, timezoneId: 'America/Guayaquil' });

    async function abrir(state, opts) {
      opts = opts || {};
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error(`[${lang}] pageerror:`, e.message));
      await page.route(ORIGEN + '/**', (route) => {
        const u = new URL(route.request().url());
        if (u.pathname.startsWith('/api/')) {
          if (!opts.server) return route.abort('failed');          // sin servidor: el juego sigue solo
          let body = { ok: true };
          if (u.pathname === '/api/estado') body = ESTADO;
          else if (u.pathname === '/api/copa') body = copaFalsa();
          else if (u.pathname === '/api/partida' || u.pathname === '/api/partida/meta') body = { ok: true, datos: null, existe: false };
          else if (u.pathname === '/api/chat') body = { ok: true, mensajes: [] };
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
        const f = path.join(ROOT, rel);
        if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.abort('failed');
        return route.fulfill({ status: 200, contentType: TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
      });
      if (opts.server) await page.clock.setFixedTime(new Date(AHORA));
      await page.addInitScript(([save, lang]) => {
        try {
          // Solo la primera vez en esta pestaña (si el juego recarga, no se pisa lo que guardó)
          if (sessionStorage.getItem('promo_sembrado')) return;
          sessionStorage.setItem('promo_sembrado', '1');
          localStorage.clear();
          localStorage.setItem('envivo_tycoon_save_v1', save);
          localStorage.setItem('envivo_lang', lang);
          localStorage.setItem('envivo_guia_v1', '1');          // sin la guía "toca aquí"
          localStorage.setItem('envivo_aviso_cuenta', '9');     // sin el aviso de crear cuenta
          localStorage.setItem('envivo_inicio_abiertos', '{}'); // Inicio con las filas plegadas
          localStorage.setItem('envivo_muted', '0'); localStorage.setItem('envivo_musica_muted', '0');
        } catch (e) { /* nada */ }
      }, [G.serialize(state), lang]);
      await page.goto(`${ORIGEN}/index.html?fecha=${opts.fecha || ''}&lang=${encodeURIComponent(lang)}`.replace('fecha=&', `fecha=${FECHA}&`), { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.state && document.querySelector('#tab-inicio') && document.querySelector('#tab-inicio').children.length, null, { timeout: 15000 });
      await page.evaluate(() => (window.I18N && window.I18N.listo) || null);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
      const idioma = await page.evaluate(() => (window.I18N ? window.I18N.idioma : 'es'));
      if (idioma !== lang) throw new Error(`[${lang}] el juego quedó en "${idioma}"`);
      return page;
    }
    // Cierra cualquier ventana que el juego haya abierto sola (resumen del día, novedades, nube...)
    const limpiar = async (page) => {
      for (let k = 0; k < 4; k++) {
        const on = await page.evaluate(() => document.getElementById('overlay').classList.contains('on'));
        if (!on) break;
        const b = page.locator('#overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"], #overlay.on [data-act="close"]');
        if (await b.count()) await b.first().click(); else await page.evaluate(() => document.getElementById('overlay').classList.remove('on'));
        await page.waitForTimeout(250);
      }
      await page.evaluate(() => { document.querySelectorAll('.toast, #toast, .cmp-pop, .guia-capa').forEach((e) => { e.style.display = 'none'; }); });
    };
    const tab = async (page, t) => { await page.click(`nav button[data-tab="${t}"]`); await page.waitForTimeout(350); await limpiar(page); };
    // Desplaza la página (o la ventana del modal) para que el elemento quede a `y` px del borde de arriba
    const llevar = async (page, sel, y, enModal) => {
      await page.evaluate(([sel, y, enModal]) => {
        const el = typeof sel === 'string' ? document.querySelector(sel) : null;
        if (!el) throw new Error('no está: ' + sel);
        if (enModal) { const m = document.getElementById('modal'); m.scrollTop += el.getBoundingClientRect().top - y; }
        else window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - y);
      }, [sel, y, !!enModal]);
      await page.waitForTimeout(250);
    };
    // o: { src: captura principal a la que pertenece este recuadro, pos: 'bottom', maxH: alto máximo en px CSS, hasta: selectores de adentro donde termina }
    const shot = async (page, name, sel, o) => {
      o = o || {};
      // Con una ventana abierta, la pestaña de atrás no se asoma entre la cabecera y la ventana
      await page.evaluate(() => { const on = document.getElementById('overlay').classList.contains('on');
        document.querySelectorAll('main > section').forEach((x) => { x.style.visibility = on ? 'hidden' : ''; }); });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.join(dir, name + '.png') });
      // Marcas reales: todo el texto visible de la página (HTML y SVG)
      const texto = await page.evaluate(() => {
        const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (p && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) out.push(n.nodeValue); }
        return out.join(' ').replace(/\s+/g, ' ');
      });
      const m = RX_MARCAS.exec(texto);
      if (m) { const i = m.index; marcasHalladas.push(`${lang}/${name}: "${m[2]}" en «…${texto.slice(Math.max(0, i - 40), i + 50)}…»`); }
      if (sel) {
        const r = await page.evaluate(([sel, maxH, hasta]) => {
          const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect();
          let h = b.height;
          // hasta: el recuadro termina donde terminan estos elementos de adentro
          if (hasta) { const bs = [...el.querySelectorAll(hasta)].map((d) => d.getBoundingClientRect().bottom - b.top); if (bs.length) h = Math.min(h, Math.max(...bs) + 10); }
          // Recorte en maxH sin partir nada: hasta el final del último bloque que entra completo
          if (maxH && h > maxH) {
            // Línea de corte que no parta ningún renglón (elementos de menos de 44 px de alto)
            const cajas = [...el.querySelectorAll('*')].map((d) => d.getBoundingClientRect()).filter((q) => q.height > 0 && q.height < 44)
              .map((q) => [q.top - b.top, q.bottom - b.top]);
            let cut = maxH;
            for (let k = 0; k < 30; k++) {
              const cruza = cajas.filter(([t, bo]) => t < cut - 1 && bo > cut + 1);
              if (!cruza.length) break;
              cut = Math.min(...cruza.map(([t]) => t)) - 3;
            }
            h = Math.max(40, cut + 4);
          }
          return { x: b.left, y: b.top, w: b.width, h };
        }, [sel, o.maxH || 0, o.hasta || '']);
        if (!r) throw new Error(`[${lang}] ${name}: no está ${sel}`);
        const x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(W, r.x + r.w) - x, h = Math.min(H, r.y + r.h) - y;
        rects[o.src || name] = Object.assign({ x: Math.round(x * K), y: Math.round(y * K), w: Math.round(w * K), h: Math.round(h * K) },
          o.src ? { src: name } : {}, o.pos ? { pos: o.pos } : {});
      }
    };

    // 1) Inicio: la sede con el letrero de la productora
    {
      const page = await abrir(BASE);
      await limpiar(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, '01_inicio', '#tab-inicio .hqcard svg');
      await page.close();
    }
    // 2) Clientes: ofertas (la disputada con MegaVisión y la internacional)
    {
      const page = await abrir(BASE);
      await limpiar(page);
      await tab(page, 'clientes');
      await page.evaluate(() => { const c = [...document.querySelectorAll('#tab-clientes .card')].filter((x) => x.querySelector('[data-act="prep"]')); window.__ofertas = c; });
      await page.evaluate(() => { const cards = window.__ofertas; const i = Math.max(0, cards.length - 3); window.scrollTo(0, cards[i].getBoundingClientRect().top + window.scrollY - 116); });
      await page.waitForTimeout(250);
      // Zoom: la etiqueta "Disputado" y la barra con la calidad que promete MegaVisión (no toda la tarjeta)
      const sel = await page.evaluate(() => {
        const d = window.__ofertas.find((x) => /MegaVisi/.test(x.textContent)); if (!d) return null;
        const bar = [...d.querySelectorAll('*')].filter((e) => /MegaVisi/.test(e.textContent) && e.querySelector('.bar, i')).pop() || d;
        const cab = d.firstElementChild;
        const top = Math.min(cab.getBoundingClientRect().top, bar.getBoundingClientRect().top), bot = bar.getBoundingClientRect().bottom;
        const m = document.createElement('div'); m.setAttribute('data-promo', 'rival');
        const b = d.getBoundingClientRect();
        Object.assign(m.style, { position: 'fixed', left: b.left + 'px', width: b.width + 'px', top: (top - 8) + 'px', height: (bot - top + 16) + 'px', pointerEvents: 'none' });
        document.body.appendChild(m); return '[data-promo="rival"]';
      });
      await shot(page, '02_clientes', sel);
      await page.close();
    }
    // 3) Preparar el evento: plano de cámaras + la tarjeta de Llévame
    {
      const page = await abrir(BASE);
      await limpiar(page);
      await tab(page, 'clientes');
      const id = contratoDe(BASE, 'concierto').id;
      await page.click(`[data-act="prep"][data-id="${id}"]`);
      await page.waitForSelector('#overlay.on [data-act="go-live"]');
      await page.waitForTimeout(500);
      // El plano: el primer SVG grande de la preparación
      await page.evaluate(() => { const svg = [...document.querySelectorAll('#modal svg')].find((s) => s.getBoundingClientRect().width > 250); svg.setAttribute('data-promo', 'plano'); });
      // La sección del plan (título "Plan de cámaras") justo debajo del borde de la ventana
      await page.evaluate(() => { const m = document.getElementById('modal'); const p = m.querySelector('.planev') || m.querySelector('[data-promo="plano"]');
        m.scrollTop += p.getBoundingClientRect().top - m.getBoundingClientRect().top - 14; });
      await page.waitForTimeout(250);
      await shot(page, '03_preparar');
      await llevar(page, '#modal .mov-app', 230, true);
      await shot(page, '03_preparar_b', '#modal .mov-app', { src: '03_preparar', pos: 'bottom', maxH: 170 });
      await page.close();
    }
    // 4) En vivo: franja animada e imprevisto (lluvia en el concierto)
    {
      const page = await abrir(enVivo(BASE));
      await page.waitForSelector('#overlay.on [data-act="choose"]');
      await page.waitForTimeout(1200);
      await page.evaluate(() => { const m = document.getElementById('modal'); const all = m.querySelectorAll('[data-act="choose"]'); const last = all[all.length - 1];
        const over = last.getBoundingClientRect().bottom + 14 - window.innerHeight;
        const libre = m.firstElementChild.getBoundingClientRect().top - m.getBoundingClientRect().top - 4;   // sin tapar la franja de arriba
        if (over > 0) m.scrollTop += Math.min(over, Math.max(0, libre)); });
      await page.waitForTimeout(250);
      await page.evaluate(() => { const f = document.getElementById('modal').firstElementChild; f.setAttribute('data-promo', 'franja'); });
      await shot(page, '04_en_vivo', '[data-promo="franja"]');
      await page.close();
    }
    // 5) Resultado: 5 estrellas, duelo ganado y compartir
    {
      const page = await abrir(paraResultado(BASE));
      await page.waitForSelector('#overlay.on [data-act="choose"]');
      await page.click('[data-act="choose"][data-i="0"]');
      await page.waitForSelector('[data-act="finish"], [data-act="next-inc"]');
      await page.click('[data-act="finish"]');
      await page.waitForSelector('[data-act="after-result"]');
      await page.waitForTimeout(1600);   // la ganancia sube contando
      await page.evaluate(() => { document.querySelectorAll('.confetti, .confeti, [class*="confet"]').forEach((e) => e.remove()); });
      await shot(page, '05_resultado');
      if (await page.locator('#modal .cmp-res').count()) {
        await llevar(page, '#modal .cmp-res', 300, true);
        await shot(page, '05_resultado_b', '#modal .cmp-res', { src: '05_resultado', pos: 'bottom' });
      }
      await page.close();
    }
    // 6) Bodega: lentes, con la Edición Exclusiva
    {
      const page = await abrir(BASE);
      await limpiar(page);
      await tab(page, 'bodega');
      await page.click('[data-act="cat"][data-k="lens"]');
      await page.waitForTimeout(400);
      await page.evaluate(() => { const c = document.querySelector('#tab-bodega .catchip.on') || document.querySelector('#tab-bodega .catchip'); if (c) c.scrollIntoView({ block: 'nearest', inline: 'center' }); });
      await llevar(page, '#tab-bodega .exq', 205);
      await shot(page, '06_bodega', '#tab-bodega .exq', { hasta: '.exq-body .art, .qrow' });
      await page.close();
    }
    // 7) En línea: Copa de Servidores (servidor simulado, batalla del sábado)
    {
      const page = await abrir(BASE, { server: true });
      await page.waitForFunction(() => window.Api && window.Api.disponible === true && window.Api.logueado && window.Api.logueado(), null, { timeout: 10000 });
      await page.waitForTimeout(600);
      await limpiar(page);
      await page.evaluate(() => window.EnVivoAbrirOnline('copa'));
      await page.waitForTimeout(1500);
      await limpiar(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => { const b = document.getElementById('chat-btn'); if (b) b.style.display = 'none'; });
      const sel = await page.evaluate(() => { const v = document.querySelector('#online-cont .cp-vs'); if (!v) return null; const c = v.closest('.card') || v.parentElement; c.setAttribute('data-promo', 'marcador'); return '[data-promo="marcador"]'; });
      await shot(page, '07_copa', sel);
      await page.close();
    }
    // 8) Decoración del local y sede
    {
      const page = await abrir(BASE);
      await limpiar(page);
      await page.click('.pl[data-pl="decoracion"] .pl-cab');
      await page.waitForTimeout(300);
      await page.click('.pl[data-pl="decoracion"] button[data-ext="decoracion"][data-acc="abrir"]');
      await page.waitForSelector('#overlay.on');
      await page.waitForTimeout(500);
      await page.evaluate(() => { document.getElementById('modal').scrollTop = 0; const p = [...document.querySelectorAll('#modal svg')].find((s) => s.getBoundingClientRect().width > 250); if (p) p.setAttribute('data-promo', 'local'); });
      await shot(page, '08_decoracion', '[data-promo="local"]');
      await page.close();
    }
    await ctx.close();
    fs.writeFileSync(path.join(dir, 'rects.json'), JSON.stringify(rects, null, 2));
    console.log(`ok ${lang}: ${fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length} capturas`);
  }
  await browser.close();
  if (marcasHalladas.length) {
    console.error('❌ Marcas reales en las capturas:\n' + marcasHalladas.join('\n'));
    process.exit(2);
  }
  console.log('Sin marcas reales en ' + LANGS.length + ' idiomas.');
}
main().catch((e) => { console.error(e); process.exit(1); });
