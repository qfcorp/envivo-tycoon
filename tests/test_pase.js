/* Prueba de la pantalla del Pase de Temporada (js/pase.js) en celulares simulados (390x844 y 360x780) con Playwright.
   El servidor es FALSO (fetch interceptado, con la forma de server/INTEGRAR_PASE.md): GET /api/pase,
   POST /api/pase/reclamar, /reclamar_todo, /saltar. La compra del premium es el callback ctx.onComprar (lo conecta el integrador).
   Revisa: tarjeta de Inicio, pantalla completa con las dos pistas que se deslizan de lado SOLO dentro de su tarjeta (la página
   nunca se desborda), reclamar, reclamar todo, comprar (callback), premium tarde, saltos (con confirmación y error con código),
   temporada anterior en gracia, cerrar con Escape, sin sesión, idiomas (los 10 completos) y que no haya errores de JS.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_pase.js     (capturas en tests/capturas/pase_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://pase.prueba';
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const html = leer('index.html');
const estilos = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- Textos: los 10 idiomas con todas las claves ---------- */
console.log('Textos');
const Pase = require(path.join(RAIZ, 'js', 'pase.js'));
const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
const claves = Object.keys(Pase.TRAD.es);
IDIOMAS.forEach((c) => {
  const d = Pase.TRAD[c] || {};
  const faltan = claves.filter((k) => !(k in d));
  const sobran = Object.keys(d).filter((k) => !(k in Pase.TRAD.es));
  const marc = claves.filter((k) => k in d && JSON.stringify((String(Pase.TRAD.es[k]).match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((String(d[k]).match(/\{\w+\}/g) || []).sort()));
  ok(!faltan.length && !sobran.length && !marc.length, `${c}: ${claves.length} claves${faltan.length ? ', faltan ' + faltan.join(',') : ''}${sobran.length ? ', sobran ' + sobran.join(',') : ''}${marc.length ? ', marcadores distintos en ' + marc.join(',') : ''}`);
});
ok(Object.keys(Pase.TRAD).length === 10, 'Español + 9 idiomas en TRAD');

/* ---------- Servidor falso ---------- */
// Misma tabla que Pase::RECOMPENSAS (server/src/Pase.php)
const R = {
  1: [['dinero', '-', 300], ['materiales', 'cables', 12]], 2: [null, ['acelerador', 'obra', 120]], 3: [['materiales', 'cables', 6], ['materiales', 'placas', 8]],
  4: [null, ['dinero', '-', 800]], 5: [['consumible', 'cable', 3], ['creditos', '-', 40]], 6: [null, ['materiales', 'paneles', 8]],
  7: [['materiales', 'placas', 5], ['acelerador', 'obra', 180]], 8: [null, ['materiales', 'credenciales', 8]], 9: [['dinero', '-', 500], ['consumible', 'battery', 5]],
  10: [null, ['cosmetico', 'marco', 1]], 11: [['materiales', 'paneles', 5], ['materiales', 'planos', 8]], 12: [null, ['creditos', '-', 50]],
  13: [['consumible', 'battery', 3], ['acelerador', 'obra', 480]], 14: [null, ['materiales', 'chips', 3]], 15: [['materiales', 'credenciales', 5], ['dinero', '-', 1500]],
  16: [null, ['materiales', 'placas', 12]], 17: [['dinero', '-', 800], ['consumible', 'cable', 8]], 18: [null, ['creditos', '-', 50]],
  19: [['materiales', 'planos', 5], ['materiales', 'paneles', 12]], 20: [null, ['cosmetico', 'deco', 1]], 21: [['consumible', 'cable', 5], ['materiales', 'credenciales', 12]],
  22: [null, ['acelerador', 'obra', 240]], 23: [['materiales', 'placas', 8], ['dinero', '-', 2000]], 24: [null, ['materiales', 'planos', 12]],
  25: [['dinero', '-', 1200], ['creditos', '-', 60]], 26: [null, ['materiales', 'chips', 4]], 27: [['materiales', 'paneles', 8], ['reparar_todo', '-', 1]],
  28: [null, ['acelerador', 'obra', 960]], 29: [['consumible', 'battery', 5], ['materiales', 'cables', 20]], 30: [null, ['creditos', '-', 60]],
  31: [['materiales', 'credenciales', 8], ['materiales', 'placas', 15]], 32: [null, ['acelerador', 'obra', 300]], 33: [['dinero', '-', 1500], ['materiales', 'paneles', 15]],
  34: [null, ['creditos', '-', 70]], 35: [['materiales', 'chips', 2], ['estrella', 'comodin', 5]], 36: [null, ['materiales', 'credenciales', 15]],
  37: [['materiales', 'planos', 8], ['acelerador', 'obra', 1440]], 38: [null, ['creditos', '-', 90]], 39: [['dinero', '-', 2000], ['materiales', 'chips', 6]],
  40: [['cosmetico', 'insignia', 1], ['cosmetico', 'titulo', 1]],
};
const AHORA = Date.parse('2026-10-28T10:00:00-05:00');
const FIN = Date.parse('2026-11-16T00:00:00-05:00');
const iso = (ms) => new Date(ms).toISOString();
function rec(n, pista, temp) {
  const r = R[n][pista === 'premium' ? 1 : 0];
  if (!r) return null;
  if (r[0] === 'cosmetico') return { tipo: 'cosmetico', item: 'pase_' + r[1] + '_t' + temp, cantidad: 1, clase: r[1], nombre: 'Cosmético ' + r[1] };
  return { tipo: r[0], item: r[1], cantidad: r[2], nombre: r[2] + ' × ' + r[1] };
}
function resumen(s, temp, abierta) {
  const pistas = { gratis: [], premium: [] }, por = { gratis: 0, premium: 0, premium_esperando: 0 };
  ['gratis', 'premium'].forEach((p) => {
    for (let n = 1; n <= 40; n++) {
      const r = rec(n, p, temp.numero);
      if (!r) continue;
      const k = temp.numero + ':' + p + ':' + n;
      const estado = s.reclamados.has(k) ? 'reclamado' : n > s.nivel ? 'bloqueado' : p === 'premium' && !s.premium ? 'requiere_premium' : abierta ? 'disponible' : 'vencido';
      if (estado === 'disponible') por[p]++;
      if (estado === 'requiere_premium') por.premium_esperando++;
      pistas[p].push({ nivel: n, recompensa: r, estado });
    }
  });
  por.total = por.gratis + por.premium;
  return { temporada: temp, nivel: s.nivel, niveles: 40, xp: s.nivel * 400 + s.xpNivel, xp_nivel: s.nivel >= 40 ? 400 : s.xpNivel, xp_por_nivel: 400,
    premium: s.premium, plus: s.plus, pistas, por_reclamar: por, creditos_dados: s.creditos };
}
const T1 = { numero: 1, tema: 'halloween', icono: '🎃', nombre: 'Temporada 1 · Noche de Calaveras', nombre_tema: 'Noche de Calaveras', inicio: iso(Date.parse('2026-10-19T00:00:00-05:00')), fin: iso(FIN), quedan_seg: Math.round((FIN - AHORA) / 1000) };
const T0 = { numero: 0, tema: 'conciertos', icono: '🎸', nombre: 'Temporada 0 · Gira de conciertos', nombre_tema: 'Gira de conciertos', inicio: iso(AHORA - 30 * 864e5), fin: iso(AHORA - 864e5), quedan_seg: 0 };
function estado(s) {
  const d = Object.assign({ ok: true, ahora: iso(AHORA), creditos_tope: 420, gracia_dias: 3,
    productos: { pase_premium: { id: 'pase_premium', precio: 4.99, activo: true, plus: false, niveles: 0 }, pase_premium_plus: { id: 'pase_premium_plus', precio: 9.99, activo: true, plus: true, niveles: 10 } } },
  resumen(s, T1, true));
  d.saltos = { usados: s.saltos, max: 10, precio: 150, max_ahora: Math.max(0, Math.min(10 - s.saltos, 40 - s.nivel)) };
  d.xp_hoy = 230; d.xp_tope_dia = 700; d.xp_fuentes = { liga: 40, festival: 30, copa: 40, duelo: 40, desafio: 60, obra_ayuda: 25, copa_equipo: 50 };
  d.misiones = {
    diarias: [{ id: 'd_eventos', texto: 'Juega 3 eventos en línea', n: 3, avance: 3, xp: 150, hecha: true }, { id: 'd_obras', texto: 'Ayuda en 2 obras de tu asociación', n: 2, avance: 1, xp: 120, hecha: false },
      { id: 'd_festival', texto: 'Juega 2 turnos del festival', n: 2, avance: 0, xp: 120, hecha: false }],
    diarias_fin: iso(Date.parse('2026-10-29T00:00:00-05:00')),
    semanales: [{ id: 's_eventos', texto: 'Juega 15 eventos en línea', n: 15, avance: 9, xp: 600, hecha: false }, { id: 's_copa_equipo', texto: 'Registra tu equipo de copa', n: 1, avance: 0, xp: 300, hecha: false },
      { id: 's_desafio', texto: 'Juega el Desafío del Día en 4 días distintos', n: 4, avance: 2, xp: 400, hecha: false }],
    semanales_fin: iso(Date.parse('2026-11-02T00:00:00-05:00')),
  };
  d.anterior = null;
  if (s.anterior) {
    const a = resumen({ nivel: 4, xpNivel: 0, premium: false, plus: false, creditos: 0, reclamados: s.reclamadosAnt }, T0, true);
    if (a.por_reclamar.total) d.anterior = Object.assign(a, { gracia_hasta: iso(AHORA + 2 * 864e5 + 5 * 3600e3) });
  }
  return d;
}
function nuevoServidor() {
  return { nivel: 7, xpNivel: 250, premium: false, plus: false, saltos: 0, creditos: 0, reclamados: new Set(['1:gratis:1']), reclamadosAnt: new Set(), anterior: false, sesion: true };
}

async function pagina(browser, vp, ajustar) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|status of (402|403|409|410|503)/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const srv = { s: nuevoServidor(), pedidos: [], fallar: null };
  if (ajustar) ajustar(srv.s);
  await page.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    const m = r.request().method();
    const json = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilos}</head>
      <body><main class="gut" style="padding-top:12px"><div id="ini"></div><div id="tienda"></div><p class="small muted">Inicio del juego (simulado)</p></main><div class="toast" id="toast"></div>
      <script src="/js/pase.js"></script></body></html>` });
    if (u.pathname === '/js/pase.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: leer('js/pase.js') });
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : undefined;
    srv.pedidos.push({ m, ruta: u.pathname, body, cab: r.request().headers() });
    if (srv.fallar && srv.fallar.ruta === u.pathname) { const f = srv.fallar; srv.fallar = null; return json({ ok: false, error: f.error, codigo: f.codigo }, f.status); }
    const s = srv.s;
    if (!s.sesion) return json({ ok: false, error: 'Entra a tu cuenta para continuar.', codigo: 'sesion_requerida' }, 401);
    if (u.pathname === '/api/pase' && m === 'GET') return json(estado(s));
    if (u.pathname === '/api/pase/reclamar' && m === 'POST') {
      const temp = body.temporada === 0 ? 0 : 1;
      const k = temp + ':' + body.pista + ':' + body.nivel;
      if (s.reclamados.has(k)) return json({ ok: false, error: 'Ya reclamaste ese premio.', codigo: 'ya_reclamado' }, 409);
      if (body.nivel > s.nivel) return json({ ok: false, error: 'Todavía no llegas.', codigo: 'nivel_bloqueado' }, 409);
      if (body.pista === 'premium' && !s.premium) return json({ ok: false, error: 'Ese premio es del Pase Premium.', codigo: 'premium_requerido' }, 403);
      s.reclamados.add(k);
      const r2 = rec(body.nivel, body.pista, 1);
      return json({ ok: true, reclamado: { temporada: 1, nivel: body.nivel, pista: body.pista, recompensa: r2, creditos: r2.tipo === 'creditos' ? r2.cantidad : 0 }, entregas: [{ id: 900 + body.nivel, tipo: r2.tipo, item: r2.item, cantidad: r2.cantidad }], creditos: 500, pase: estado(s) });
    }
    if (u.pathname === '/api/pase/reclamar_todo' && m === 'POST') {
      const lista = [];
      ['gratis', 'premium'].forEach((p) => { if (p === 'premium' && !s.premium) return; for (let n = 1; n <= s.nivel; n++) { const r2 = rec(n, p, 1); if (r2 && !s.reclamados.has('1:' + p + ':' + n)) { s.reclamados.add('1:' + p + ':' + n); lista.push({ temporada: 1, nivel: n, pista: p, recompensa: r2, creditos: 0 }); } } });
      if (s.anterior) for (let n = 1; n <= 4; n++) { const r2 = rec(n, 'gratis', 0); if (r2 && !s.reclamadosAnt.has('0:gratis:' + n)) { s.reclamadosAnt.add('0:gratis:' + n); lista.push({ temporada: 0, nivel: n, pista: 'gratis', recompensa: r2, creditos: 0 }); } }
      return json({ ok: true, reclamados: lista, entregas: [], creditos: 500, pase: estado(s) });
    }
    if (u.pathname === '/api/pase/saltar' && m === 'POST') {
      if (s.saltos + body.niveles > 10) return json({ ok: false, error: 'Ya usaste los saltos.', codigo: 'saltos_tope', quedan: 10 - s.saltos }, 409);
      s.saltos += body.niveles; s.nivel = Math.min(40, s.nivel + body.niveles);
      return json({ ok: true, creditos: 1000 - 150 * body.niveles, pase: estado(s) });
    }
    return json({ ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }, 404);
  });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__toasts = []; window.__compras = []; window.__reclamos = 0; window.__renders = 0; window.__sesion = true;
    window.Api = { disponible: true, logueado: () => window.__sesion, estado: { creditos: 1000 } };
    const ini = document.getElementById('ini');
    const mod = () => (window.EnVivoInicio || []).find((x) => x.id === 'pase');
    window.__ctx = {
      M: (n) => '$' + Number(n).toLocaleString('es-EC'),
      toast: (t) => { window.__toasts.push(t); const el = document.getElementById('toast'); el.textContent = t; el.style.display = 'block'; },
      render: () => { window.__renders++; ini.innerHTML = mod().tarjeta(window.__ctx); },
      onComprar: (id) => { window.__compras.push(id); },
      alReclamar: () => { window.__reclamos++; },
      snd: { play: () => {} },
    };
    // Lo mismo que hace ui.js con los botones data-ext / data-acc
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-ext][data-acc]'); if (b) { const m = (window.EnVivoInicio || []).find((x) => x.id === b.dataset.ext); if (m) m.clic(window.__ctx, b.dataset.acc, b); } });
    window.__ctx.render();
  });
  return { page, ctx, srv, errores };
}

async function sinDesborde(page, tag) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const doc = document.documentElement.scrollWidth - w;
    const fuera = [...document.querySelectorAll('body *')].filter((n) => !n.ownerSVGElement && !n.closest('.pase-scroll') && !n.closest('script,style'))
      .filter((n) => { const b = n.getBoundingClientRect(); return b.width && (b.right > w + 1 || b.left < -1); })
      .map((n) => n.tagName + '.' + String(n.className) + ' «' + (n.textContent || '').slice(0, 30) + '»').slice(0, 3);
    return { doc, fuera, sx: window.scrollX };
  });
  ok(r.doc <= 1 && !r.fuera.length && r.sx === 0, `${tag}: la página no se desborda de lado (${r.doc}px${r.fuera.length ? ', se sale: ' + r.fuera.join(' | ') : ''})`);
}

(async () => {
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const cap = (n) => path.join(outDir, 'pase_' + n + '.png');
  const browser = await chromium.launch();

  /* ================= 390 x 844 ================= */
  console.log('Celular 390x844');
  const { page, srv, errores } = await pagina(browser, { width: 390, height: 844 });

  console.log('Tarjeta de Inicio');
  await page.waitForSelector('[data-pase="tarjeta"] h2');
  const g = srv.pedidos.find((p) => p.ruta === '/api/pase');
  ok(!!g && g.m === 'GET' && g.cab['x-envivo'] === '1', 'GET /api/pase con la cabecera X-Envivo');
  const tj = await page.locator('[data-pase="tarjeta"]').textContent();
  ok(/Temporada 1 · Noche de Calaveras/.test(tj), 'Nombre de la temporada con su tema');
  ok(/Nivel 7\/40/.test(tj) && /250\/400 XP/.test(tj), 'Nivel y XP del nivel');
  ok(/3 premios por reclamar/.test(tj), '"3 premios por reclamar" (gratis 3, 5 y 7)');
  ok(/Termina en 18 d/.test(tj), 'Cuenta regresiva de la temporada (' + (tj.match(/Termina en [^\n]+?(?=\s{2}|$)/) || [''])[0].trim() + ')');
  const w = await page.evaluate(() => document.querySelector('[data-pase="tarjeta"] .pase-bar i').style.width);
  ok(w === '63%', 'Barra de XP al 63 % (' + w + ')');
  await sinDesborde(page, 'Inicio');
  await page.screenshot({ path: cap('inicio') });
  const renders = await page.evaluate(() => window.__renders);
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__renders) === renders, 'La tarjeta no se vuelve a pedir en bucle');

  console.log('Pantalla completa');
  await page.click('[data-pase="tarjeta"] [data-acc="abrir"]');
  await page.waitForSelector('#pase-ov [data-pase="premios"]');
  ok(await page.locator('#pase-ov .pase-col').count() === 40, '40 niveles en columnas');
  ok(await page.locator('#pase-ov .pase-celda.g').count() === 21 && await page.locator('#pase-ov .pase-celda.p').count() === 40, 'Pista gratis con 21 premios y premium con 40');
  ok(await page.locator('#pase-ov .pase-celda.g.disponible').count() === 3 && await page.locator('#pase-ov .pase-celda.g.reclamado').count() === 1, 'Gratis: 3 por reclamar y 1 ya reclamado');
  ok(await page.locator('#pase-ov .pase-celda.p.requiere_premium').count() === 7, 'Premium: 7 esperan el pase (niveles 1–7)');
  ok(await page.locator('#pase-ov .pase-col.actual').getAttribute('data-col') === '8', 'Columna del próximo nivel (8) resaltada');
  const sc = await page.evaluate(() => { const s = document.querySelector('.pase-scroll'); return { sw: s.scrollWidth, cw: s.clientWidth, sl: s.scrollLeft, ox: getComputedStyle(s).overflowX }; });
  ok(sc.sw > sc.cw * 3 && sc.ox === 'auto', `Las pistas se deslizan de lado dentro de su tarjeta (${sc.sw}px en ${sc.cw}px)`);
  ok(sc.sl > 0, 'Al abrir se ve el nivel actual (scrollLeft ' + sc.sl + ')');
  ok(await page.evaluate(() => document.documentElement.style.overflow) === 'hidden', 'La página de atrás no se mueve mientras está abierto');
  const txt = await page.locator('#pase-ov').textContent();
  ok(/Pase Premium · \$4,99/.test(txt) && /Premium Plus · \$9,99/.test(txt) && /\+10 niveles/.test(txt), 'Botones de compra con precio ($4,99 y $9,99 con +10 niveles)');
  ok(/hasta 420 créditos/.test(txt) && /sin cajas sorpresa/.test(txt), 'Contenido fijo y visible, tope de créditos');
  ok(/Reclamar todo \(3\)/.test(txt), 'Botón "Reclamar todo (3)"');
  await sinDesborde(page, 'pantalla del pase');
  await page.screenshot({ path: cap('modal') });

  console.log('Deslizar las pistas');
  await page.evaluate(() => { document.querySelector('.pase-scroll').scrollLeft = 99999; });
  await page.waitForTimeout(100);
  const fin = await page.evaluate(() => { const s = document.querySelector('.pase-scroll'); return { sl: s.scrollLeft, max: s.scrollWidth - s.clientWidth, x: window.scrollX }; });
  ok(fin.sl === fin.max && fin.x === 0, 'Al final de las pistas (nivel 40) sin mover la página');
  ok(await page.evaluate(() => { const l = document.querySelector('.pase-lbl').getBoundingClientRect(); const s = document.querySelector('.pase-scroll').getBoundingClientRect(); return Math.abs(l.left - s.left) < 2; }), 'Las etiquetas Gratis / Premium quedan fijas a la izquierda');
  await sinDesborde(page, 'pistas al final');
  await page.screenshot({ path: cap('nivel40') });
  await page.click('.pase-celda.p[data-nivel="40"]');
  ok(/Nv 40 · Premium:/.test(await page.locator('[data-pase="detalle"]').textContent()) && /Título de chat|Cosmético/.test(await page.locator('[data-pase="detalle"]').textContent()), 'Tocar un premio bloqueado muestra qué es (sin pedir nada)');
  ok(!srv.pedidos.some((p) => p.ruta === '/api/pase/reclamar'), '…y no llama al servidor');
  await page.evaluate(() => { document.querySelector('.pase-scroll').scrollLeft = 0; });

  console.log('Reclamar');
  await page.click('.pase-celda.g.disponible[data-nivel="3"]');
  await page.waitForFunction(() => window.__toasts.length > 0);
  const p1 = srv.pedidos.find((p) => p.ruta === '/api/pase/reclamar');
  ok(!!p1 && p1.m === 'POST' && p1.body.nivel === 3 && p1.body.pista === 'gratis' && p1.body.temporada === 1 && p1.cab['x-envivo'] === '1', 'POST /api/pase/reclamar {nivel: 3, pista: gratis, temporada: 1} con X-Envivo');
  ok(/^¡Listo! /.test(await page.evaluate(() => window.__toasts[0])), 'Mensaje con el premio (' + await page.evaluate(() => window.__toasts[0]) + ')');
  ok(await page.evaluate(() => window.__reclamos) === 1, 'Llama a ctx.alReclamar (aplicar entregas)');
  ok(await page.locator('.pase-celda.g[data-nivel="3"]').getAttribute('class').then((c) => /reclamado/.test(c)), 'La celda queda reclamada');
  srv.fallar = { ruta: '/api/pase/reclamar', status: 409, codigo: 'ya_reclamado', error: 'Ya reclamaste ese premio (servidor).' };
  await page.click('.pase-celda.g.disponible[data-nivel="5"]');
  await page.waitForFunction(() => window.__toasts.length > 1);
  ok(await page.evaluate(() => window.__toasts[1]) === 'Ya reclamaste ese premio.', 'Error con codigo -> texto propio del idioma');
  await page.click('[data-pase-acc="todo"]');
  await page.waitForFunction(() => window.__toasts.length > 2);
  ok(srv.pedidos.some((p) => p.ruta === '/api/pase/reclamar_todo' && p.m === 'POST'), 'POST /api/pase/reclamar_todo');
  ok(/Reclamaste 2 premios/.test(await page.evaluate(() => window.__toasts[2])), '"¡Reclamaste 2 premios!"');
  ok(await page.locator('[data-pase-acc="todo"]').count() === 0 && await page.locator('.pase-celda.disponible').count() === 0, 'Ya no queda nada por reclamar');

  console.log('Comprar el premium (callback del integrador) y premium tarde');
  await page.click('[data-pase-comprar="pase_premium"]');
  ok(JSON.stringify(await page.evaluate(() => window.__compras)) === '["pase_premium"]', 'El botón llama a ctx.onComprar("pase_premium")');
  await page.click('[data-pase-comprar="pase_premium_plus"]');
  ok((await page.evaluate(() => window.__compras))[1] === 'pase_premium_plus', '…y el plus a ctx.onComprar("pase_premium_plus")');
  srv.s.premium = true;
  await page.evaluate(() => window.Pase.recargar());
  await page.waitForSelector('.pase-celda.p.disponible');
  ok(await page.locator('.pase-celda.p.disponible').count() === 7, 'Compró tarde: los 7 premios premium de los niveles que ya tiene quedan para reclamar');
  ok(await page.locator('[data-pase-comprar]').count() === 0 && /Premium activo/.test(await page.locator('[data-pase="resumen"]').textContent()), 'Sin botones de compra y con "Premium activo"');
  ok(/Créditos de vuelta: 0\/420/.test(await page.locator('[data-pase="resumen"]').textContent()), 'Créditos de vuelta 0/420');
  await sinDesborde(page, 'premium');
  await page.screenshot({ path: cap('premium') });
  ok(/7 premios por reclamar/.test(await page.locator('[data-pase="tarjeta"]').textContent()), 'La tarjeta de Inicio también se actualiza');

  console.log('Misiones');
  const mis = page.locator('[data-pase="misiones"]');
  await mis.scrollIntoViewIfNeeded();
  ok(await page.locator('[data-mision]').count() === 6, '3 diarias y 3 semanales');
  ok(/Juega 3 eventos en línea/.test(await mis.textContent()) && /Registra tu equipo de copa/.test(await mis.textContent()) && /Ayuda en 2 obras de tu asociación/.test(await mis.textContent()), 'Textos de misiones');
  ok(await page.locator('[data-mision="d_eventos"].hecha').count() === 1 && /9\/15/.test(await page.locator('[data-mision="s_eventos"]').textContent()), 'Hecha y en progreso (9/15)');
  ok(/Hoy llevas 230 de 700 XP/.test(await mis.textContent()), 'Cómo se gana XP y el tope del día');
  ok(/Nuevas en 1[34] h/.test(await mis.textContent()), 'Cuándo se renuevan las diarias');
  await sinDesborde(page, 'misiones');
  await page.screenshot({ path: cap('misiones') });

  console.log('Saltar niveles');
  await page.locator('[data-pase="saltar"]').scrollIntoViewIfNeeded();
  ok(/150 créditos por nivel/.test(await page.locator('[data-pase="saltar"]').textContent()) && /10 de 10 saltos/.test(await page.locator('[data-pase="saltar"]').textContent()), 'Precio por nivel y saltos que quedan');
  await page.click('[data-pase-acc="mas"]'); await page.click('[data-pase-acc="mas"]');
  ok(/Saltar 3 · 450 créditos/.test(await page.locator('[data-pase-acc="saltar"]').textContent()), 'Con + y −: "Saltar 3 · 450 créditos"');
  await page.click('[data-pase-acc="saltar"]');
  ok(/¿Saltar 3 nivel\(es\) por 450 créditos\?/.test(await page.locator('[data-pase="saltar"]').textContent()) && !srv.pedidos.some((p) => p.ruta === '/api/pase/saltar'), 'Pide confirmación antes de gastar');
  await page.screenshot({ path: cap('saltar') });
  await page.click('[data-pase-acc="saltar-si"]');
  await page.waitForFunction(() => window.__toasts.some((x) => /nivel 10/.test(x)));
  const ps = srv.pedidos.find((p) => p.ruta === '/api/pase/saltar');
  ok(!!ps && ps.body.niveles === 3, 'POST /api/pase/saltar {niveles: 3}');
  ok(/Nivel 10\/40/.test(await page.locator('[data-pase="resumen"]').textContent()), 'Sube al nivel 10');
  srv.fallar = { ruta: '/api/pase/saltar', status: 409, codigo: 'saltos_tope', error: 'Ya usaste los saltos de nivel.' };
  await page.click('[data-pase-acc="saltar"]'); await page.click('[data-pase-acc="saltar-si"]');
  await page.waitForFunction(() => window.__toasts.some((x) => /No te quedan|Ya no te quedan/.test(x)));
  ok(true, 'Error saltos_tope -> "Ya no te quedan saltos esta temporada."');

  console.log('Temporada anterior en los días de gracia');
  srv.s.anterior = true;
  await page.evaluate(() => window.Pase.recargar());
  await page.waitForSelector('[data-pase="anterior"]');
  ok(/Temporada 0 · Gira de conciertos: te quedan 2 d 5 h para reclamar 2 premio\(s\)/.test(await page.locator('[data-pase="anterior"]').textContent()), 'Aviso de la anterior con el tiempo de gracia (' + (await page.locator('[data-pase="anterior"]').textContent()).trim() + ')');
  ok(/Reclamar todo \(\d+\)/.test(await page.locator('[data-pase-acc="todo"]').textContent()), 'Reclamar todo incluye la anterior');
  await page.locator('#pase-ov .pase-cuerpo').evaluate((e) => { e.scrollTop = 0; });
  await page.screenshot({ path: cap('anterior') });
  await page.click('[data-pase-acc="todo"]');
  await page.waitForFunction(() => !document.querySelector('[data-pase="anterior"]'));
  ok(true, 'Después de reclamar, el aviso de la anterior se va');

  console.log('Cerrar');
  await page.keyboard.press('Escape');
  ok(await page.locator('#pase-ov').count() === 0 && await page.evaluate(() => document.documentElement.style.overflow) === '', 'Escape cierra y la página vuelve a moverse');
  await page.click('[data-pase="tarjeta"] [data-acc="abrir"]');
  await page.waitForSelector('#pase-ov [data-pase="premios"]');
  await page.click('[data-pase-acc="cerrar"]');
  ok(await page.locator('#pase-ov').count() === 0, 'El botón ✕ cierra');

  console.log('Ficha de la Tienda');
  await page.evaluate(() => { document.getElementById('tienda').innerHTML = window.Pase.fichaTienda(window.__ctx); });
  ok(/hasta 420 créditos de vuelta/.test(await page.locator('[data-pase="ficha"]').textContent()), 'Ficha con el resumen del pase');
  await page.click('[data-pase="ficha"] [data-acc="abrir"]');
  await page.waitForSelector('#pase-ov');
  ok(true, 'La ficha abre el pase');
  await page.keyboard.press('Escape');

  console.log('Error del servidor y sin sesión');
  await page.waitForFunction(() => !window.Pase._st.cargando);   // que no haya una carga en curso de la tarjeta
  srv.fallar = { ruta: '/api/pase', status: 503, codigo: 'mantenimiento', error: 'El servidor está en mantenimiento.' };
  await page.evaluate(() => { window.Pase._st.datos = null; window.Pase._st.cargadoEn = 0; window.Pase.abrir(window.__ctx); });
  await page.waitForSelector('[data-pase="error"]');
  ok(/mantenimiento/.test(await page.locator('[data-pase="error"]').textContent()), 'Error del servidor con su texto y botón de reintentar');
  await page.click('[data-pase-acc="reintentar"]');
  await page.waitForSelector('#pase-ov [data-pase="premios"]');
  ok(true, 'Reintentar abre el pase');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__sesion = false; window.__ctx.render(); });
  ok((await page.locator('#ini').innerHTML()).trim() === '', 'Sin sesión no hay tarjeta');
  await page.evaluate(() => { window.__sesion = true; });

  console.log('Idiomas');
  await page.evaluate(() => { window.I18N = { idioma: 'en', idiomas: [{ code: 'en', locale: 'en-US' }] }; window.__ctx.render(); window.Pase.abrir(window.__ctx); });
  await page.waitForSelector('#pase-ov [data-pase="premios"]');
  const en = await page.locator('#pase-ov').textContent();
  ok(/Season 1 · Night of Skulls/.test(en) && /Tier 10\/40/.test(en) && /Daily/.test(en) && /Play 3 online events/.test(en), 'Inglés: temporada, nivel y misiones');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.I18N = { idioma: 'zh-CN', idiomas: [{ code: 'zh-CN', locale: 'zh-CN' }] }; window.__ctx.render(); window.Pase.abrir(window.__ctx); });
  await page.waitForSelector('#pase-ov [data-pase="premios"]');
  ok(/第 1 赛季 · 骷髅之夜/.test(await page.locator('#pase-ov').textContent()), 'Chino: nombre de la temporada');
  await sinDesborde(page, 'chino');
  await page.screenshot({ path: cap('zh') });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.I18N = undefined; });
  ok(!errores.length, 'Sin errores de JS (390x844)' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));

  /* ================= 360 x 780 ================= */
  console.log('Celular 360x780');
  const p2 = await pagina(browser, { width: 360, height: 780 }, (s) => { s.nivel = 23; s.xpNivel = 380; s.premium = true; s.plus = true; });
  await p2.page.waitForSelector('[data-pase="tarjeta"] h2');
  ok(/Premium Plus activo/.test(await p2.page.locator('[data-pase="tarjeta"]').textContent()), 'Tarjeta con "Premium Plus activo"');
  await sinDesborde(p2.page, 'Inicio 360');
  await p2.page.screenshot({ path: cap('360_inicio') });
  await p2.page.click('[data-pase="tarjeta"] [data-acc="abrir"]');
  await p2.page.waitForSelector('#pase-ov [data-pase="premios"]');
  await sinDesborde(p2.page, 'pantalla 360');
  ok(await p2.page.evaluate(() => { const c = document.querySelector('.pase-col.actual').getBoundingClientRect(); const s = document.querySelector('.pase-scroll').getBoundingClientRect(); return c.left >= s.left && c.right <= s.right; }), 'El nivel actual (24) se ve al abrir');
  await p2.page.screenshot({ path: cap('360') });
  await p2.page.locator('[data-pase="saltar"]').scrollIntoViewIfNeeded();
  await sinDesborde(p2.page, 'saltos 360');
  await p2.page.screenshot({ path: cap('360_abajo') });
  ok(!p2.errores.length, 'Sin errores de JS (360x780)' + (p2.errores.length ? ': ' + p2.errores.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
