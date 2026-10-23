/* Prueba de la pantalla de la Liga Semanal (js/liga.js) en un celular simulado (390x844) con Playwright.
   El servidor se imita: cada petición a /api/liga... se responde aquí con datos de prueba (y se revisa que
   lleve X-Envivo: 1). Revisa: sin errores, sin desborde horizontal en las 3 pestañas, tablero de 12, cuenta
   regresiva, tomar / jugar / enviar / canjear, progresoLocal y textos con I18N.
   Uso:  node tests/test_liga.js   (capturas en tests/capturas/liga*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';

/* ---------- Datos de prueba (con nombres largos para buscar desbordes) ---------- */
const LIGAS = [
  { indice: 0, id: 'barrial', nombre: 'Liga Barrial', color: '#c58b5a' }, { indice: 1, id: 'provincial', nombre: 'Liga Provincial', color: '#b8c2d6' },
  { indice: 2, id: 'nacional', nombre: 'Liga Nacional', color: '#ffb020' }, { indice: 3, id: 'internacional', nombre: 'Liga Internacional', color: '#4da3ff' },
  { indice: 4, id: 'mundial', nombre: 'Liga Mundial', color: '#ff3b3b' },
];
const T = (id, titulo, icono, meta, puntos, horas, criterio, extra) => Object.assign({ id, n: id - 100, estado: 'disponible', plantilla: 'x', titulo, icono, meta, avance: 0, puntos, horas,
  criterio, tipos: ['boda'], jugador: null, mia: false, tomada_en: null, vence: null, vence_seg: null }, extra || {});
function estadoBase() {
  return {
    ok: true, semana: { id: '2026-10-26', inicio: '2026-10-26T00:00:00-05:00', fin: '2026-11-01T23:59:59-05:00', quedan_seg: 3 * 86400 + 13 * 3600 + 25 * 60 },
    ligas: LIGAS, fichas: 135, validacion: 'firma', max_tareas: 9,
    liga: LIGAS[1],
    asociacion: { id: 4, nombre: 'Productores Unidos del Valle de los Chillos', siglas: 'PUV', color: '#ff3b3b', puntos: 3820, tareas_completadas: 14, mi_cargo: 'presidente', puede_descartar: true },
    banderas: [{ n: 1, puntos: 1400, fichas: 18, alcanzada: true }, { n: 2, puntos: 4200, fichas: 30, alcanzada: false }, { n: 3, puntos: 8400, fichas: 42, alcanzada: false }, { n: 4, puntos: 14000, fichas: 60, alcanzada: false }],
    tablero: [
      T(101, 'Cubre 3 bodas', 'boda', 3, 180, 30, { evento: ['boda'], min_estrellas: 2 }, { estado: 'tomada', mia: true, avance: 1, jugador: { id: 7, nombre: 'QF Producciones' }, vence_seg: 20 * 3600 + 300 }),
      T(102, 'Gana 2 duelos contra MegaVisión', 'rival', 2, 290, 24, { duelo: 'won' }, { tipos: ['barrial', 'graduacion', 'lanzamiento'] }),
      T(103, 'Transmite 4 eventos sin cortes', 'stream', 4, 290, 36, { stream: true, sin_cortes: true }, { estado: 'tomada', avance: 2, jugador: { id: 9, nombre: 'Andrea Chiluisa Producciones Audiovisuales' } }),
      T(104, 'Contrata a un Senior y llévalo a 2 eventos', 'people', 2, 180, 24, { senior: true }),
      { id: 105, n: 14, estado: 'espera', aparece_en: '2026-10-29T10:10:00-05:00', aparece_seg: 512 },
      T(106, 'Lanza 1 marca con 4⭐', 'lanzamiento', 1, 160, 18, { evento: ['lanzamiento'], min_estrellas: 4 }),
      T(107, 'Consigue 5⭐ en un evento', 'star', 1, 170, 18, { min_estrellas: 5 }, { titulo: 'Consigue 5⭐ en un evento' }),
      T(108, 'Cubre 3 eventos al aire libre', 'outdoor', 3, 190, 30, { outdoor: true, min_estrellas: 2 }, { estado: 'tomada', avance: 0, jugador: { id: 11, nombre: 'Bryan' } }),
      T(109, 'Graba 2 graduaciones con 3⭐ o más', 'graduacion', 2, 170, 24, { evento: ['graduacion'], min_estrellas: 3 }),
      T(110, 'Transmite 3 partidos de liga barrial', 'barrial', 3, 230, 30, { evento: ['barrial'], stream: true }),
      T(111, 'Cubre 2 eventos de dificultad 3 o más', 'trend', 2, 240, 24, { min_diff: 3 }, { estado: 'tomada', avance: 1, jugador: { id: 12, nombre: 'Mishell Toapanta' } }),
      T(112, 'Transmite 4 misas en vivo', 'misa', 4, 180, 36, { evento: ['misa'], stream: true }),
    ],
    mi_tarea: null,
    mis_tareas: { usadas: 4, max: 9, completadas: 3, puntos: 610 },
    hechas: [
      { id: 90, titulo: 'Cubre 3 ruedas de prensa', icono: 'prensa', puntos: 160, jugador: { id: 7, nombre: 'QF Producciones' }, completada_en: '2026-10-28T09:00:00-05:00' },
      { id: 91, titulo: 'Transmite 3 partidos de liga barrial con transmisión en vivo para toda la provincia', icono: 'barrial', puntos: 240, jugador: { id: 9, nombre: 'Andrea Chiluisa Producciones Audiovisuales' }, completada_en: '2026-10-27T18:00:00-05:00' },
    ],
    grupo: { id: 3, numero: 3, liga: LIGAS[1], ranking: [
      { posicion: 1, asociacion_id: 8, nombre: 'Los Reyes del Streaming de Guayaquil', siglas: 'RSG', color: '#4da3ff', servidor: 'Servidor 1 · Quito', liga: 1, puntos: 5120, tareas: 20, banderas: 2, mia: false, zona: 'sube' },
      { posicion: 2, asociacion_id: 4, nombre: 'Productores Unidos del Valle de los Chillos', siglas: 'PUV', color: '#ff3b3b', servidor: 'Servidor 1 · Quito', liga: 1, puntos: 3820, tareas: 14, banderas: 1, mia: true, zona: 'sube' },
      { posicion: 3, asociacion_id: 12, nombre: 'Cámara Uno', siglas: 'CU1', color: '#2ecc71', servidor: 'Servidor 2 · Guayaquil', liga: 1, puntos: 2900, tareas: 11, banderas: 1, mia: false, zona: null },
      { posicion: 4, asociacion_id: 15, nombre: 'Transmisiones Andinas', siglas: 'TAN', color: '#ffb020', servidor: 'Servidor 1 · Quito', liga: 1, puntos: 1870, tareas: 8, banderas: 1, mia: false, zona: null },
      { posicion: 5, asociacion_id: 21, nombre: 'Señal Austral', siglas: 'SAU', color: '#b07cff', servidor: 'Servidor 3 · Cuenca', liga: 1, puntos: 1200, tareas: 5, banderas: 0, mia: false, zona: null },
      { posicion: 6, asociacion_id: 23, nombre: 'Eventos Pichincha', siglas: 'EVP', color: '#ff7a59', servidor: 'Servidor 1 · Quito', liga: 1, puntos: 860, tareas: 4, banderas: 0, mia: false, zona: null },
      { posicion: 7, asociacion_id: 30, nombre: 'Multicámara Manabí Producciones', siglas: 'MMP', color: '#00c2c7', servidor: 'Servidor 4 · Manta', liga: 1, puntos: 240, tareas: 1, banderas: 0, mia: false, zona: 'baja' },
      { posicion: 8, asociacion_id: 31, nombre: 'Sin Señal', siglas: 'SSE', color: '#8b95a8', servidor: 'Servidor 1 · Quito', liga: 1, puntos: 0, tareas: 0, banderas: 0, mia: false, zona: 'baja' },
    ] },
    ultima_semana: { semana: '2026-10-19', posicion: 1, resultado: 'sube', puntos: 6240, fichas_ganadas: 185, liga_nueva: LIGAS[1] },
  };
}
const DATOS = estadoBase();
DATOS.mi_tarea = Object.assign({}, DATOS.tablero[0], { intento_abierto: null });
const SIN_TAREA = estadoBase();
SIN_TAREA.tablero[0] = T(101, 'Cubre 3 bodas', 'boda', 3, 180, 30, { evento: ['boda'], min_estrellas: 2 });

const TIENDA = {
  ok: true, fichas: 135, liga: LIGAS[1], cosmeticos: ['marco_liga'], historial: [],
  articulos: [
    ['cables', '3 cables de repuesto', 'Para cuando se rompe un cable en vivo', 'cable', 25, 'consumible', 3, 1, null],
    ['baterias', '3 baterías extra', 'Ninguna cámara se queda sin carga', 'battery', 30, 'consumible', 3, 3, 'Límite de la semana'],
    ['caja_liga', 'Premio de la liga: $600', 'Dinero del juego para tu productora', 'money', 45, 'dinero', 3, 0, null],
    ['caja_grande', 'Bolsa de campeón: $2.500', 'Dinero del juego (desde la Liga Nacional)', 'money', 160, 'dinero', 1, 0, 'Desde la Liga Nacional'],
    ['reparar', 'Taller de la liga', 'Todos tus equipos al 100 %', 'wrench', 70, 'reparar_todo', 2, 0, null],
    ['ref_camarografo', 'Camarógrafo senior de refuerzo', 'Te acompaña en tus próximos 2 eventos', 'role_cam', 110, 'refuerzo', 1, 0, null],
    ['seguro', 'Seguro de evento', 'Si sacas 2⭐ o menos en tu próximo evento, te devuelven la mitad', 'lock', 80, 'refuerzo', 2, 0, null],
    ['marco_liga', 'Marco "Liga Semanal"', 'Marco de perfil para tu productora', 'sparkle', 150, 'cosmetico', null, 0, 'Ya lo tienes'],
    ['banderin', 'Banderín dorado', 'Aparece junto a tu nombre en el chat', 'crown', 220, 'cosmetico', null, 0, null],
    ['trofeo_mundial', 'Trofeo de la Liga Mundial', 'Para la vitrina de tu sede (solo en la Liga Mundial)', 'final', 600, 'cosmetico', null, 0, 'Desde la Liga Mundial'],
  ].map(([id, nombre, detalle, icono, fichas, tipo, max, comp, motivo]) => ({ id, nombre, detalle, icono, fichas, tipo, max_semana: max, compradas_semana: comp, disponible: !motivo, alcanza: 135 >= fichas, motivo })),
};
const SIN_ASOC = { ok: true, semana: DATOS.semana, ligas: LIGAS, fichas: 0, validacion: 'firma', max_tareas: 9, sin_asociacion: true, asociacion: null };
// Jugador nuevo: /api/liga trae las asociaciones del servidor (ya sin las llenas) y lo que cuesta crear una
const ASO = (id, nombre, siglas, color, miembros, puntos, tareas, ingreso, extra) => Object.assign({ id, nombre, siglas, color, ingreso: ingreso || 'abierto', miembros, max_miembros: 20,
  liga: LIGAS[0], puntos_semana: puntos, tareas_semana: tareas, solicitud_enviada: false }, extra || {});
const LISTA = [
  ASO(31, 'Sin Señal', 'SSE', '#8b95a8', 1, 0, 0),
  ASO(8, 'Los Reyes del Streaming de Guayaquil y Samborondón', 'RSG', '#4da3ff', 14, 5120, 20, 'solicitud', { liga: LIGAS[1] }),
  ASO(12, 'Cámara Uno', 'CU1', '#2ecc71', 6, 2900, 11),
  ASO(15, 'Transmisiones Andinas', 'TAN', '#ffb020', 9, 2900, 13),
  ASO(21, 'Señal Austral', 'SAU', '#b07cff', 3, 0, 0),
  ASO(23, 'Eventos Pichincha', 'EVP', '#ff7a59', 4, 860, 4),
  ASO(30, 'Multicámara Manabí Producciones', 'MMP', '#00c2c7', 20, 3000, 12),   // llena: no se muestra
  ASO(40, 'Producciones del Pacífico', 'PDP', '#ff3b3b', 2, 120, 1),
];
const NUEVO_VACIO = Object.assign({}, SIN_ASOC, { liga: LIGAS[0], asociaciones: [], crear: { costo: 5000, gratis: false } });
const NUEVO_LISTA = Object.assign({}, SIN_ASOC, { liga: LIGAS[0], asociaciones: LISTA, crear: { costo: 5000, gratis: false } });

(async () => {
  const errores = [];
  const falla = (m) => errores.push(m);
  const ok = [];
  const bien = (cond, m) => { if (cond) ok.push(m); else falla(m); };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => falla('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') falla('console: ' + m.text()); });

  // Página de prueba: los estilos del juego (index.html) + art.js + liga.js
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const estilo = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilo}</head>
    <body><main class="gut"><section class="on"><div class="sectitle">Liga Semanal</div><div id="liga"></div></section></main>
    <script src="/js/art.js"></script><script src="/js/liga.js"></script></body></html>`;

  const pedidos = [];
  let modo = 'con_tarea';
  await page.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.pathname === '/liga.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/js/')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(RAIZ, u.pathname)) });
    if (u.pathname.startsWith('/api/asociaciones')) {
      const h = req.headers();
      const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
      pedidos.push({ metodo: req.method(), ruta: u.pathname, xenvivo: h['x-envivo'], cuerpo });
      const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
      if (req.method() === 'POST' && h['x-envivo'] !== '1') return json(403, { ok: false, error: 'Petición no permitida.' });
      if (u.pathname === '/api/asociaciones') return json(200, { ok: true, asociaciones: LISTA.slice(0, 3).map((a) => ({ id: a.id, nombre: a.nombre, siglas: a.siglas, color: a.color, ingreso: a.ingreso, miembros: a.miembros, max_miembros: 20, fama: 100 - a.id })),
        mi_asociacion: null, solicitudes: [], puede_crear: { puede: true, gratis: false, motivo: '' }, costo_crear: 5000 });
      if (u.pathname === '/api/asociaciones/unirse') {
        const a = LISTA.find((x) => x.id === cuerpo.id);
        if (a.ingreso === 'solicitud') return json(200, { ok: true, estado: 'solicitud' });
        modo = 'con_tarea';
        return json(200, { ok: true, estado: 'miembro', asociacion: { id: a.id, nombre: a.nombre, siglas: a.siglas, color: a.color, cargo: 'socio' } });
      }
      return json(404, { ok: false, error: 'No encontrado.' });
    }
    if (u.pathname.startsWith('/api/liga')) {
      const h = req.headers();
      const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
      pedidos.push({ metodo: req.method(), ruta: u.pathname, xenvivo: h['x-envivo'], cuerpo });
      const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
      if (req.method() === 'POST' && h['x-envivo'] !== '1') return json(403, { ok: false, error: 'Petición no permitida.' });
      if (u.pathname === '/api/liga') return json(200, modo === 'sin_asociacion' ? SIN_ASOC : modo === 'nuevo_vacio' ? NUEVO_VACIO : modo === 'nuevo_lista' ? NUEVO_LISTA : modo === 'sin_tarea' ? SIN_TAREA : DATOS);
      if (u.pathname === '/api/liga/tomar') { modo = 'con_tarea'; return json(200, { ok: true, liga: DATOS }); }
      if (u.pathname === '/api/liga/intento') return json(200, { ok: true, intento: { id: 501, tarea_id: 101, seed: 123456, contrato: { type: 'boda', cams: 2, stream: false, outdoor: true, diff: 1, rival: false }, equipo: cuerpo.equipo, contexto: { fama: 20 }, vip: false, firma: 'f'.repeat(64), vence: '2026-10-29T13:00:00-05:00', modo: 'firma' } });
      if (u.pathname === '/api/liga/completar') {
        const d = estadoBase(); d.tablero[0].avance = 2; d.mi_tarea = Object.assign({}, d.tablero[0], { intento_abierto: null });
        return json(200, { ok: true, intento: { id: cuerpo.intento_id, estado: 'firmado', cuenta: true }, tarea_completada: false, puntos: 0, liga: d });
      }
      if (u.pathname === '/api/liga/tienda' && req.method() === 'GET') return json(200, TIENDA);
      if (u.pathname === '/api/liga/tienda') return json(200, { ok: true, fichas: 110, entrega: { id: 77, tipo: 'consumible', item: 'cable', cantidad: 3 }, cosmetico: null, tienda: Object.assign({}, TIENDA, { fichas: 110 }) });
      return json(404, { ok: false, error: 'No encontrado.' });
    }
    return route.fulfill({ status: 404, body: '' });
  });

  await page.goto(BASE + '/liga.html');
  await page.evaluate(() => {
    window.__toasts = [];
    window.S = { staff: [{ id: 1, name: 'Tú (dueño)', role: 'cam', skill: 3, morale: 100, owner: true }, { id: 2, name: 'Kevin', role: 'dir', skill: 4, morale: 77 }],
      equip: [{ id: 3, type: 'cam_pro', condition: 88 }, { id: 4, type: 'switch_basic', condition: 0 }, { id: 5, type: 'audio_basic', condition: 61.6 }],
      liga: { pendientes: [{ intento_id: 400, tarea_id: 101, firma: 'x', contrato: { type: 'boda' }, equipo: {}, decisiones: [1], resultado: { calidad: 75, estrellas: 4, incidentes: [{ clave: 'lluvia', q: -2 }] } }], registro: [] } };
    window.CTX = { A: window.Art, estado: () => window.S, guardar() { window.__guardado = (window.__guardado || 0) + 1; }, toast: (m) => window.__toasts.push(m), ask: (h, b, fn) => fn(),
      jugarIntento: async (it) => { window.__jugado = it; return { decisiones: [0], resultado: { quality: 90, stars: 5, incidentes: [{ clave: 'epico', q: 3 }] } }; } };
    window.Liga.render(document.getElementById('liga'), window.CTX);
  });
  await page.waitForSelector('.lg-t');

  const sinDesborde = async (tag) => {
    const r = await page.evaluate(() => {
      const ancho = document.documentElement.clientWidth;
      const fuera = [...document.querySelectorAll('#liga *')].filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && (b.right > ancho + 0.5 || b.left < -0.5); })
        .slice(0, 5).map((n) => n.className && n.className.baseVal === undefined ? n.className : n.tagName);
      return { scroll: document.documentElement.scrollWidth - ancho, fuera };
    });
    bien(r.scroll <= 0 && r.fuera.length === 0, `${tag}: sin desborde horizontal (scroll ${r.scroll}px, fuera: ${JSON.stringify(r.fuera)})`);
  };

  // ---- Encargos
  bien(await page.locator('.lg-t').count() === 12, 'Tablero con 12 casillas');
  bien(await page.locator('.lg-t.espera').count() === 1, 'Una casilla en espera con su reloj');
  bien(/Nuevo encargo en 0?8:\d\d/.test(await page.locator('.lg-t.espera').innerText()), 'Cuenta del encargo nuevo (08:xx)');
  bien(/Termina en 3 d 13 h/.test(await page.locator('.lg-reloj').innerText()), 'Cuenta regresiva de la semana');
  bien(await page.locator('.lg-t.mia').count() === 1, 'Mi encargo marcado en el tablero');
  bien(/Lo hace Andrea/.test(await page.locator('.lg-t[data-tarea="103"]').innerText()), 'Quién hace cada encargo');
  bien(await page.locator('[data-liga="tomar"]:not([disabled])').count() === 0, 'Con un encargo tomado no deja tomar otro');
  bien(await page.locator('[data-liga="descartar"]').count() === 7, 'El presidente ve "Descartar" en los 7 libres');
  bien(/2\/3/.test(await page.locator('.lg-mia').innerText()) && /\+1 por enviar/.test(await page.locator('.lg-mia').innerText()), 'Mi encargo: 1 del servidor + 1 por enviar = 2/3');
  bien(await page.locator('.lg-mia .lg-barra i.pend').count() === 1, 'Barra con la parte por enviar rayada');
  bien(await page.locator('.lg-flag.on').count() === 1 && await page.locator('.lg-flag').count() === 4, 'Barra de puntos con 4 banderas (1 alcanzada)');
  bien(/3\.820/.test(await page.locator('.lg-score').innerText()), 'Puntaje de la asociación');
  await sinDesborde('Encargos');
  await page.screenshot({ path: path.join(OUT, 'liga.png'), fullPage: true });

  // progresoLocal y cumple (las mismas reglas que el servidor)
  const pl = await page.evaluate(() => {
    const t = { id: 101, meta: 3, avance: 1, criterio: { evento: ['boda'], min_estrellas: 2 } };
    const s = { liga: { pendientes: [
      { tarea_id: 101, contrato: { type: 'boda' }, resultado: { estrellas: 4 } },
      { tarea_id: 101, contrato: { type: 'boda' }, resultado: { estrellas: 1 } },
      { tarea_id: 999, contrato: { type: 'boda' }, resultado: { estrellas: 5 } }] } };
    return {
      p: Liga.progresoLocal(s, t), vacio: Liga.progresoLocal({}, t), lleno: Liga.progresoLocal({ liga: { pendientes: [1, 2, 3].map(() => ({ tarea_id: 101, contrato: { type: 'boda' }, resultado: { stars: 5 } })) } }, t),
      corte: Liga.cumple({ stream: true, sin_cortes: true }, { stream: true }, { estrellas: 3, incidentes: [{ clave: 'internet', q: -3 }] }, {}),
      duelo: Liga.cumple({ duelo: 'won' }, { rival: true }, { estrellas: 3, duel: 'won' }, {}),
      senior: [Liga.cumple({ senior: true }, {}, { estrellas: 3 }, { staff: [{ skill: 2 }] }), Liga.cumple({ senior: true }, {}, { estrellas: 3 }, { staff: [{ skill: 2, tier: 'senior' }] })],
      equipo: Liga.equipoDe(window.S),
    };
  });
  bien(pl.p.hecho === 2 && pl.p.pendientes === 1 && pl.p.por_enviar === 2 && pl.p.servidor === 1 && !pl.p.listo, 'progresoLocal: servidor 1 + 1 pendiente que cumple (el de 1⭐ no cuenta)');
  bien(pl.vacio.hecho === 1 && pl.vacio.pct === 33, 'progresoLocal sin datos locales = lo del servidor');
  bien(pl.lleno.hecho === 3 && pl.lleno.listo, 'progresoLocal nunca pasa de la meta y marca listo');
  bien(pl.corte === false && pl.duelo === true && pl.senior[0] === false && pl.senior[1] === true, 'cumple: sin cortes, duelo y senior');
  bien(pl.equipo.staff.length === 2 && pl.equipo.staff[0].owner === true && pl.equipo.equip.length === 2 && pl.equipo.equip[1].condition === 62, 'equipoDe: todo el personal, equipos que funcionan, números enteros');

  // Enviar el resultado pendiente
  pedidos.length = 0;
  await page.click('[data-liga="enviar"]');
  await page.waitForFunction(() => !document.querySelector('[data-liga="enviar"]'));
  const env = pedidos.find((p) => p.ruta === '/api/liga/completar');
  bien(env && env.metodo === 'POST' && env.xenvivo === '1' && env.cuerpo.intento_id === 400 && env.cuerpo.firma === 'x' && env.cuerpo.decisiones[0] === 1, 'Enviar: POST /api/liga/completar con X-Envivo, firma y decisiones');
  bien(await page.evaluate(() => window.S.liga.pendientes.length === 0 && window.__guardado > 0), 'Al enviarse sale de los pendientes y se guarda la partida');
  // Jugar el encargo
  pedidos.length = 0;
  await page.evaluate(() => { window.__toasts = []; });
  await page.click('[data-liga="jugar"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /Cuenta para el encargo/.test(t)));
  const pi = pedidos.find((p) => p.ruta === '/api/liga/intento'), pc = pedidos.find((p) => p.ruta === '/api/liga/completar');
  bien(pi && pi.xenvivo === '1' && pi.cuerpo.equipo.staff.length === 2, 'Jugar: pide el intento con el equipo registrado');
  bien(await page.evaluate(() => window.__jugado && window.__jugado.seed === 123456), 'Jugar: ctx.jugarIntento recibe la semilla del servidor');
  bien(pc && pc.cuerpo.intento_id === 501 && pc.cuerpo.firma === 'f'.repeat(64) && pc.cuerpo.resultado.calidad === 90 && pc.cuerpo.resultado.estrellas === 5, 'Jugar: manda decisiones + resultado (quality/stars -> calidad/estrellas)');
  bien(await page.evaluate(() => window.S.liga.registro.length === 1 && window.S.liga.registro[0].cuenta === true), 'Jugar: queda en el registro local con "cuenta"');

  // Tomar (sin encargo)
  modo = 'sin_tarea';
  await page.evaluate(() => Liga.recargar());
  await page.waitForFunction(() => document.querySelectorAll('[data-liga="tomar"]:not([disabled])').length === 8);
  bien(/No tienes encargo/.test(await page.locator('.lg .card').nth(1).innerText()), 'Sin encargo: mensaje para tomar uno');
  pedidos.length = 0;
  await page.evaluate(() => { window.__toasts = []; });
  await page.click('[data-liga="tomar"][data-id="102"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /Encargo tomado/.test(t)));
  const pt = pedidos.find((p) => p.ruta === '/api/liga/tomar');
  bien(pt && pt.metodo === 'POST' && pt.xenvivo === '1' && pt.cuerpo.tarea_id === 102, 'Tomar: POST /api/liga/tomar {tarea_id} con X-Envivo');

  // ---- Grupo
  await page.click('[data-liga="vista"][data-v="grupo"]');
  await page.waitForSelector('.lg-rank');
  bien(await page.locator('.lg-rank tr').count() === 8, 'Ranking del grupo con 8 asociaciones');
  bien(await page.locator('.lg-rank tr.mia').count() === 1 && await page.locator('.lg-rank tr.sube').count() === 2 && await page.locator('.lg-rank tr.baja').count() === 2, 'Ranking: la mía resaltada, 2 suben y 2 bajan');
  bien(/puesto 1/.test(await page.locator('[data-vista="grupo"] .card').first().innerText()), 'Resumen de la semana pasada');
  bien(await page.locator('.lg-escalera span.on').count() === 1, 'Escalera de las 5 ligas con la actual marcada');
  await sinDesborde('Grupo');
  await page.screenshot({ path: path.join(OUT, 'liga_grupo.png'), fullPage: true });

  // ---- Tienda
  await page.click('[data-liga="vista"][data-v="tienda"]');
  await page.waitForSelector('.lg-art');
  bien(await page.locator('.lg-art').count() === TIENDA.articulos.length, 'Tienda con todos los artículos');
  bien(await page.locator('.lg-art [data-liga="canjear"]:not([disabled])').count() === TIENDA.articulos.filter((a) => a.disponible && a.alcanza).length, 'Solo se pueden canjear los disponibles que alcanzan');
  bien(/Lo tienes/.test(await page.locator('.lg-art', { hasText: 'Marco' }).innerText()), 'Cosmético que ya tiene: "Lo tienes"');
  bien(/Te faltan 85 fichas/.test(await page.locator('.lg-art', { hasText: 'Banderín' }).innerText()), 'Cuántas fichas faltan');
  await sinDesborde('Tienda');
  await page.screenshot({ path: path.join(OUT, 'liga_tienda.png'), fullPage: true });
  pedidos.length = 0;
  await page.evaluate(() => { window.__toasts = []; });
  await page.click('[data-liga="canjear"][data-id="cables"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /llegó a tu productora/.test(t)));
  const pk = pedidos.find((p) => p.ruta === '/api/liga/tienda' && p.metodo === 'POST');
  bien(pk && pk.xenvivo === '1' && pk.cuerpo.articulo === 'cables', 'Canjear: POST /api/liga/tienda {articulo}');
  bien((await page.locator('#liga-fichas').innerText()).trim() === '110', 'El saldo de fichas se actualiza');

  await page.click('[data-liga="vista"][data-v="encargos"]');   // la pantalla nueva, sin la tienda abierta debajo
  // ---- Sin asociación (servidor viejo: /api/liga no trae la lista -> GET /api/asociaciones)
  modo = 'sin_asociacion';
  pedidos.length = 0;
  await page.evaluate(() => { window.S.money = 1800; Liga.invalidar(); Liga.render(document.getElementById('liga'), Object.assign({}, window.CTX, { abrirAsociaciones: () => { window.__asoc = (window.__asoc || 0) + 1; } })); });
  await page.waitForSelector('[data-liga-lista="llena"]');
  bien(pedidos.some((p) => p.ruta === '/api/asociaciones' && p.metodo === 'GET'), 'Servidor viejo: la lista sale de GET /api/asociaciones');
  bien(await page.locator('.lg-a').count() === 3 && await page.locator('.lg-a').first().getAttribute('data-asoc') === '12' && await page.locator('.lg-a').last().getAttribute('data-asoc') === '8', 'Servidor viejo: entrada libre primero (más miembros), la de solicitud al final');

  // ---- Jugador nuevo: no hay ninguna asociación
  modo = 'nuevo_vacio';
  await page.evaluate(() => {
    window.__modo = null; window.__asoc = 0;
    window.EnVivoAbrirOnline = (k) => { window.__modo = k; };
    Liga.invalidar(); Liga.render(document.getElementById('liga'), Object.assign({}, window.CTX, { abrirAsociaciones: () => { window.__asoc = (window.__asoc || 0) + 1; } }));
  });
  await page.waitForSelector('[data-liga-lista="vacia"]');
  const vacia = await page.locator('[data-liga-lista="vacia"]').innerText();
  bien(/Todavía no hay asociaciones/.test(vacia) && /no necesitan asociación/.test(vacia), 'Sin asociaciones: mensaje amable');
  bien(/Juega la liga en equipo/.test(await page.locator('.lg-intro').first().innerText()), 'Explicación corta arriba');
  const modos = await page.locator('[data-liga="modo"]').evaluateAll((bs) => bs.map((b) => b.dataset.k));
  bien(JSON.stringify(modos) === '["duelos","desafio","copa"]', 'Sin asociaciones: botones a Duelos, Desafío y Copa (no piden asociación)');
  await page.click('[data-liga="modo"][data-k="desafio"]');
  bien(await page.evaluate(() => window.__modo === 'desafio'), 'El botón lleva al Desafío del Día (EnVivoAbrirOnline)');
  bien(await page.locator('[data-liga="crear"]').isDisabled(), 'Sin dinero: "Crear" desactivado');
  const crearTxt = await page.locator('.lg-crear').innerText();
  bien(/\$5\.000/.test(crearTxt) && /Tienes \$1\.800 de \$5\.000/.test(crearTxt) && /Te faltan \$3\.200/.test(crearTxt), 'Crear: costo, lo que tiene y cuánto le falta');
  bien(await page.locator('.lg-crear .lg-barra i').evaluate((i) => i.style.width) === '36%', 'Barra de dinero al 36 %');
  await sinDesborde('Nuevo sin asociaciones');
  await page.screenshot({ path: path.join(OUT, 'liga_nuevo_vacio.png'), fullPage: true });

  // ---- Jugador nuevo: hay asociaciones (la más activa primero, unirse en un toque)
  modo = 'nuevo_lista';
  await page.evaluate(() => { Liga.invalidar(); Liga.render(document.getElementById('liga'), Object.assign({}, window.CTX, { abrirAsociaciones: () => { window.__asoc = (window.__asoc || 0) + 1; }, alCanjear: () => { window.__refresco = (window.__refresco || 0) + 1; } })); });
  await page.waitForSelector('[data-liga-lista="llena"]');
  const orden = await page.locator('.lg-a').evaluateAll((xs) => xs.map((x) => Number(x.dataset.asoc)));
  bien(JSON.stringify(orden) === '[15,12,23,40,21]', 'Lista: 5 a la vista, las más activas primero, sin la llena (' + orden + ')');
  bien(/Más activa/i.test(await page.locator('.lg-a').first().innerText()) && /2\.900 pts esta semana/.test(await page.locator('.lg-a').first().innerText()), 'La primera marcada "Más activa" con sus puntos');
  bien(/Buscar asociación \(7\)/i.test(await page.locator('.sectitle', { hasText: 'Buscar' }).innerText()), 'Título con cuántas hay');
  await page.screenshot({ path: path.join(OUT, 'liga_nuevo_lista.png'), fullPage: false });
  await page.click('[data-liga="ver_mas"]');
  bien(await page.locator('.lg-a').count() === 7 && await page.locator('.lg-a').last().getAttribute('data-asoc') === '8', '"Ver más": todas, la de solicitud al final');
  bien(/Pedir entrar/.test(await page.locator('.lg-a[data-asoc="8"]').innerText()), 'La de solicitud dice "Pedir entrar"');
  bien(await page.locator('[data-liga="modo"]').count() === 3, 'Con lista: abajo los modos que no piden asociación');
  await sinDesborde('Nuevo con lista');
  await page.screenshot({ path: path.join(OUT, 'liga_nuevo_lista_completa.png'), fullPage: true });
  await page.locator('.lg-crear').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'liga_nuevo_sin_dinero.png'), fullPage: false });

  // Pedir entrar (con solicitud): queda "Pedida"
  pedidos.length = 0;
  await page.evaluate(() => { window.__toasts = []; });
  await page.click('.lg-a[data-asoc="8"] [data-liga="unirme"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /Solicitud enviada/.test(t)));
  bien(await page.locator('.lg-a[data-asoc="8"] button').isDisabled() && /Pedida/.test(await page.locator('.lg-a[data-asoc="8"]').innerText()), 'Con solicitud: el botón queda "Pedida"');

  // Unirme en un toque -> entra y se abre su liga
  pedidos.length = 0;
  await page.evaluate(() => { window.__toasts = []; });
  await page.click('.lg-a[data-asoc="15"] [data-liga="unirme"]');
  await page.waitForSelector('.lg-t');
  const pu = pedidos.find((p) => p.ruta === '/api/asociaciones/unirse');
  bien(pu && pu.metodo === 'POST' && pu.xenvivo === '1' && pu.cuerpo.id === 15, 'Unirme: POST /api/asociaciones/unirse {id} con X-Envivo');
  bien(await page.evaluate(() => window.__toasts.some((t) => /Ya eres parte de Transmisiones Andinas/.test(t))), 'Unirme: aviso de bienvenida');
  bien(await page.evaluate(() => window.__refresco === 1), 'Unirme: el juego refresca su estado (ctx.alCanjear)');
  bien(await page.locator('.lg-tabs').count() === 1, 'Unirme: aparece la liga de la asociación');

  // ---- Con dinero suficiente: "Crear" abre el formulario del chat
  modo = 'nuevo_vacio';
  await page.evaluate(() => {
    window.S.money = 7200; window.__crear = 0;
    const p = document.createElement('div'); p.id = 'chat-panel'; p.hidden = true; document.body.appendChild(p);
    window.CTX_CREAR = Object.assign({}, window.CTX, { abrirAsociaciones: () => { window.__asoc = (window.__asoc || 0) + 1;
      setTimeout(() => { p.innerHTML = '<button data-chat="crear">x</button>'; p.querySelector('button').onclick = () => { window.__crear++; }; }, 120); } });
    Liga.invalidar(); Liga.render(document.getElementById('liga'), window.CTX_CREAR);
  });
  await page.waitForSelector('[data-liga-lista="vacia"]');
  bien(!(await page.locator('[data-liga="crear"]').isDisabled()) && /Crear asociación/.test(await page.locator('[data-liga="crear"]').innerText()), 'Con $7.200: "Crear asociación" activo');
  await page.screenshot({ path: path.join(OUT, 'liga_nuevo_crear.png'), fullPage: true });
  await page.evaluate(() => { window.__asoc = 0; });
  await page.click('[data-liga="crear"]');
  await page.waitForFunction(() => window.__crear === 1, null, { timeout: 4000 });
  bien(await page.evaluate(() => window.__asoc === 1 && window.__crear === 1), 'Crear: abre el chat y va directo al formulario');

  // ---- Textos en otro idioma (las claves nuevas vienen de liga.js)
  await page.evaluate(() => {
    const t = () => ''; t.has = () => false;
    window.I18N = { T: t, idioma: 'en' };
    Liga.invalidar(); Liga.render(document.getElementById('liga'), window.CTX_CREAR);
  });
  await page.waitForSelector('[data-liga-lista="vacia"]');
  bien(/No associations here yet/.test(await page.locator('[data-liga-lista="vacia"]').innerText()) && /Create association/.test(await page.locator('[data-liga="crear"]').innerText()), 'Pantalla nueva traducida (inglés)');
  await page.evaluate(() => { delete window.I18N; });

  // ---- I18N
  modo = 'con_tarea';
  await page.evaluate(() => {
    const t = (k) => ({ 'liga.tab.encargos': 'Tasks', 'liga.tab.grupo': 'Group' }[k]);
    t.has = (k) => k === 'liga.tab.encargos' || k === 'liga.tab.grupo';
    window.I18N = { T: t, idioma: 'en' };
    Liga.invalidar(); Liga.render(document.getElementById('liga'), window.CTX);
  });
  await page.waitForSelector('.lg-tabs');
  const tabs = await page.locator('.lg-tabs button').allInnerTexts();
  bien(tabs[0] === 'Tasks' && tabs[1] === 'Group' && tabs[2] === 'Tienda', 'Textos con I18N.T (y español si falta la clave)');

  await browser.close();
  console.log(ok.map((m) => '  OK    ' + m).join('\n'));
  if (errores.length) { console.log(errores.map((m) => '  FALLA ' + m).join('\n')); }
  console.log(`\nLiga (pantalla): ${ok.length} correctas · ${errores.length} fallas · capturas en tests/capturas/liga*.png`);
  process.exit(errores.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
