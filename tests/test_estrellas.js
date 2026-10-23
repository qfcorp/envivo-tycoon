/* Prueba de la pantalla "Personal estrella" (js/estrellas.js) en celulares simulados (390x844 y 360x780) con Playwright.
   El servidor es FALSO (fetch interceptado, forma de server/INTEGRAR_ESTRELLAS.md): GET /api/estrellas,
   POST /api/estrellas/contratar, /api/estrellas/asignar, /api/pase_copa/comprar.
   Recorrido: agencia, contratar con créditos y con fichas, asignar a un equipo, errores con código, Pase de Copa
   (créditos, dinero por ctx.comprar, fuera de fase, activo), sin sesión, error del servidor, tarjeta de Inicio,
   otros idiomas (en, zh-CN, de, ru) y celular chico. Sin desborde horizontal ni errores de JavaScript.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_estrellas.js     (capturas en tests/capturas/estrellas_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://estrellas.prueba';
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const html = leer('index.html');
const estilos = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- textos completos en los 9 idiomas ---------- */
global.window = global;
const E = require(path.join(RAIZ, 'js', 'estrellas.js'));
const faltan = Object.entries(E.TRAD).map(([l, d]) => [l, Object.keys(E.ES).filter((k) => !(k in d))]).filter(([, f]) => f.length);
ok(Object.keys(E.TRAD).sort().join() === 'de,en,fr,id,it,pt-BR,ru,tr,zh-CN', '9 idiomas además del español: ' + Object.keys(E.TRAD).join(', '));
ok(!faltan.length, 'Cada idioma tiene todos los textos' + (faltan.length ? ' (faltan: ' + JSON.stringify(faltan) + ')' : ''));
delete global.window;

/* ---------- servidor falso ---------- */
const CAT = [
  ['varela', "Ricardo 'El Maestro' Varela", 'director', 'Buenos Aires', 60, 15, 9], ['solberg', "Ingrid 'La Batuta' Solberg", 'director', 'Oslo', 60, 15, 9],
  ['lupe', 'Lupe Zoom', 'camarografo', 'Guadalajara', 30, 8, 3], ['tano', "Gaetano 'Tano' Steady", 'camarografo', 'Nápoles', 30, 8, 3],
  ['camara_lenta', "Néstor 'Cámara Lenta' Ruiz", 'operador_repeticion', 'Montevideo', 30, 8, 2], ['rewind', "Kenji 'Rewind' Ota", 'operador_repeticion', 'Osaka', 30, 8, 2],
  ['decibel', "Marisol 'Decibel' Andrade", 'sonidista', 'Cuenca', 45, 12, 6], ['oido_de_oro', "Otto 'Oído de Oro' Brenner", 'sonidista', 'Viena', 45, 12, 6],
  ['cero_ping', "Valentina 'Cero Ping' Rojas", 'tecnico_transmision', 'Santiago', 45, 12, 6], ['satelite', "Duma 'Satélite' Okafor", 'tecnico_transmision', 'Lagos', 45, 12, 6],
];
function estado(s) {
  const asig = { copa: s.asig.copa.filter((k) => s.rest[k] > 0), duelo: s.asig.duelo.filter((k) => s.rest[k] > 0) };
  const ex = s.pase ? 5 : 0;
  return {
    ok: true,
    catalogo: CAT.map(([clave, nombre, rol, ciudad, cr, fi, pts]) => ({ clave, nombre, rol, ciudad, habilidad: 5, nivel: 'internacional',
      precios: [[1, 1], [3, 2.7], [5, 4.25]].map(([p, f]) => ({ partidos: p, creditos: Math.round(cr * f) })), fichas: fi, puntos_equipo: pts, bono: Math.max(0, 6 - pts),
      restantes: s.rest[clave] || 0, vence: s.rest[clave] ? '2026-11-27T12:00:00-05:00' : null, asignada: { copa: asig.copa.includes(clave), duelo: asig.duelo.includes(clave) } })),
    contratos: [], asignadas: asig, fichas: s.fichas, fichas_hoy: 5, fichas_dia: 12, creditos: s.creditos, bono: { copa: 0, duelo: 0 },
    pase_copa: { semana: '2026-W44', fase: s.fase, activo: s.pase, extra: 5, precio_creditos: 300, precio_usd: 2.99, producto: 'pase_copa',
      puede_comprar: !s.pase && s.fase === 'preparacion', intentos_base: 10, intentos_max: 10 + ex + s.vip, vip_extra: s.vip, tope: 18 },
    copa: { semana: '2026-W44', fase: s.fase, activa: s.fase !== 'cerrada' },
    reglas: { max_por_equipo: 1, habilidad: 5, nivel: 'internacional', bono_max: 6, vence_dias: 30, paquetes: [1, 3, 5] },
  };
}
const nuevoSrv = () => ({ creditos: 500, fichas: 10, rest: { varela: 3 }, asig: { copa: ['varela'], duelo: ['varela'] }, pase: false, vip: 0, fase: 'preparacion', modo: 'ok', pedidos: [], fallar: null });

async function pagina(browser, vp, lang) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|status of (401|402|409|503)/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const srv = nuevoSrv();
  await page.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    const m = r.request().method();
    const json = (o, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilos}</head>
      <body><main class="gut" style="padding-top:12px"><div id="ini"></div><div id="est"></div></main>
      <script>window.I18N = { idioma: ${JSON.stringify(lang || 'es')} };</script><script src="/js/datos.js"></script><script src="/js/logic.js"></script><script src="/js/art.js"></script><script src="/js/estrellas.js"></script></body></html>` });
    if (/^\/js\/[a-z]+\.js$/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: leer(u.pathname.slice(1)) });
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : undefined;
    srv.pedidos.push({ m, ruta: u.pathname, body, cab: r.request().headers() });
    if (srv.fallar && srv.fallar.ruta === u.pathname) { const f = srv.fallar; srv.fallar = null; return json({ ok: false, error: f.error, codigo: f.codigo }, f.status); }
    if (srv.modo === 'error') return json({ ok: false, error: 'El servidor está en mantenimiento.', codigo: 'mantenimiento' }, 503);
    if (u.pathname === '/api/estrellas' && m === 'GET') return json(estado(srv));
    if (u.pathname === '/api/estrellas/contratar' && m === 'POST') {
      const c = CAT.find((x) => x[0] === body.clave);
      if (body.modo === 'fichas') srv.fichas -= c[5]; else srv.creditos -= Math.round(c[4] * { 1: 1, 3: 2.7, 5: 4.25 }[body.partidos]);
      srv.rest[body.clave] = (srv.rest[body.clave] || 0) + body.partidos;
      return json({ ok: true, repetida: false, contrato: { clave: body.clave, partidos: body.partidos, restantes: body.partidos }, estrellas: estado(srv) });
    }
    if (u.pathname === '/api/estrellas/asignar' && m === 'POST') {
      if (body.quitar) srv.asig[body.equipo] = srv.asig[body.equipo].filter((k) => k !== body.clave); else srv.asig[body.equipo] = [body.clave];
      return json({ ok: true, estrellas: estado(srv) });
    }
    if (u.pathname === '/api/pase_copa/comprar' && m === 'POST') { srv.pase = true; srv.creditos -= 300; const e = estado(srv); return json({ ok: true, creditos: srv.creditos, pase_copa: e.pase_copa, estrellas: e }); }
    return json({ ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }, 404);
  });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__toasts = []; window.__compras = []; window.__sesion = true;
    window.Api = { disponible: true, logueado: () => window.__sesion };
    window.__ctx = { Api: window.Api, A: window.Art, toast: (t) => window.__toasts.push(t), ask: (h, b, fn) => { window.__preguntas = (window.__preguntas || []).concat([h]); fn(); }, comprar: (p) => window.__compras.push(p) };
  });
  return { page, ctx, srv, errores };
}

const abrir = (page) => page.evaluate(() => window.Estrellas.render(document.getElementById('est'), window.__ctx));
async function noHScroll(page, tag) {
  const ov = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const w = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('.pe *, .pe-ini *')].filter((n) => !(n.ownerSVGElement)).filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.right > w + 1 || r.left < -1); })
      .map((n) => n.tagName + '.' + String((n.className && n.className.baseVal !== undefined) ? n.className.baseVal : n.className) + ' «' + (n.textContent || '').slice(0, 30) + '»').slice(0, 3);
    // Textos cortados por desborde dentro de su caja (scrollWidth > clientWidth sin ellipsis)
    const cortados = [...document.querySelectorAll('.pe h4, .pe p, .pe .btn, .pe-filtros button')].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).textOverflow !== 'ellipsis')
      .map((n) => n.tagName + ' «' + (n.textContent || '').slice(0, 30) + '»').slice(0, 3);
    return { doc, fuera, cortados };
  });
  ok(ov.doc <= 1 && !ov.fuera.length && !ov.cortados.length, `${tag}: sin desborde (${ov.doc}px${ov.fuera.length ? ', se sale: ' + ov.fuera.join(' | ') : ''}${ov.cortados.length ? ', cortado: ' + ov.cortados.join(' | ') : ''})`);
}

(async () => {
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const cap = (n) => path.join(outDir, 'estrellas_' + n + '.png');
  const browser = await chromium.launch();

  console.log('Celular 390x844 (español)');
  const { page, srv, errores } = await pagina(browser, { width: 390, height: 844 });
  await abrir(page);
  await page.waitForSelector('[data-est-estado="listo"]');
  const g = srv.pedidos.find((p) => p.ruta === '/api/estrellas');
  ok(!!g && g.m === 'GET' && g.cab['x-envivo'] === '1', 'GET /api/estrellas con X-Envivo');
  ok(/Personal estrella/.test(await page.locator('[data-est-zona="cabecera"]').textContent()), 'Título "Personal estrella"');
  ok((await page.locator('[data-est-creditos]').textContent()) === '500' && (await page.locator('[data-est-fichas]').textContent()) === '10', 'Créditos y fichas del servidor');
  ok(await page.locator('[data-estrella]').count() === 10, 'La agencia muestra las 10 estrellas');
  ok(await page.locator('[data-estrella="varela"] svg.avatar').count() === 1 && await page.locator('[data-estrella] svg.avatar[aria-label]').count() === 10, 'Retratos SVG (Art.avatar) con el nombre como etiqueta');
  ok(/Ricardo Varela/.test(await page.locator('[data-slot="copa"]').textContent()) && /3 partidos/.test(await page.locator('[data-slot="copa"]').textContent()), 'Equipo de copa: Varela, 3 partidos');
  ok(await page.locator('[data-estrella]').first().getAttribute('data-estrella') === 'varela', 'Las estrellas que tengo salen primero');
  ok(/Director · Buenos Aires/.test(await page.locator('[data-estrella="varela"] .pe-rol').textContent()) && /Internacional · habilidad 5/.test(await page.locator('[data-estrella="varela"]').textContent()), 'Rol, ciudad y nivel');
  ok(/En el equipo \+3 · bono \+3/.test(await page.locator('[data-estrella="lupe"]').textContent()), 'Ventaja transparente (en el equipo y bono)');
  ok(await page.locator('[data-estrella="varela"] [data-equipo="copa"][aria-pressed="true"]').count() === 1 && await page.locator('[data-estrella="lupe"] [data-equipo="copa"]').isDisabled(), 'Asignar: activo para la que tiene partidos, apagado sin partidos');
  ok(/\+5/.test(await page.locator('[data-est-zona="pase"]').textContent()) && await page.locator('[data-est="pase"]').count() === 1 && /\$2[.,]99/.test(await page.locator('[data-est="pase_dinero"]').textContent()), 'Pase de Copa: +5, 300 créditos y $2.99 (con ctx.comprar)');
  await noHScroll(page, 'agencia');
  await page.screenshot({ path: cap('agencia'), fullPage: true });
  await page.screenshot({ path: cap('arriba') });

  console.log('Filtrar por rol');
  await page.click('[data-est="filtro"][data-rol="sonidista"]');
  ok(await page.locator('[data-estrella]').count() === 2 && await page.locator('[data-estrella][data-rol="sonidista"]').count() === 2, 'Filtro "Ingeniero de audio": 2 estrellas');
  await page.click('[data-est="filtro"][data-rol="todos"]');

  console.log('Contratar con créditos');
  await page.click('[data-est="abrir"][data-clave="lupe"]');
  await page.waitForSelector('[data-panel="lupe"]');
  ok(await page.locator('[data-panel="lupe"] [data-modo="credito"]').count() === 3, 'Paquetes de 1, 3 y 5 partidos');
  await page.locator('[data-estrella="lupe"]').scrollIntoViewIfNeeded();
  await noHScroll(page, 'panel de contratar');
  await page.screenshot({ path: cap('contratar') });
  await page.click('[data-panel="lupe"] [data-modo="credito"][data-partidos="3"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /Lupe Zoom se une/.test(t)));
  const ct = srv.pedidos.find((p) => p.ruta === '/api/estrellas/contratar');
  ok(!!ct && ct.cab['x-envivo'] === '1' && ct.body.clave === 'lupe' && ct.body.modo === 'credito' && ct.body.partidos === 3 && /^[A-Za-z0-9_-]{8,64}$/.test(ct.body.peticion), 'POST contratar {clave, modo, partidos, peticion}');
  ok(/81/.test((await page.evaluate(() => window.__preguntas || [])).join(' ')), 'Pide confirmar con el precio (81 créditos)');
  ok((await page.locator('[data-estrella="lupe"] [data-restantes]').getAttribute('data-restantes')) === '3' && (await page.locator('[data-est-creditos]').textContent()) === '419', 'Lupe con 3 partidos y créditos actualizados');

  console.log('Contratar con fichas');
  await page.click('[data-est="abrir"][data-clave="tano"]');
  await page.click('[data-panel="tano"] [data-modo="fichas"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /Tano/.test(t)));
  const cf = srv.pedidos.filter((p) => p.ruta === '/api/estrellas/contratar').pop();
  ok(cf.body.modo === 'fichas' && cf.body.partidos === 1 && (await page.locator('[data-est-fichas]').textContent()) === '2', 'Fichas: 1 partido, gasta 8 fichas');
  await page.click('[data-est="abrir"][data-clave="decibel"]');
  ok(await page.locator('[data-panel="decibel"] [data-modo="fichas"]').isDisabled() && /Te faltan 10 fichas/.test(await page.locator('[data-panel="decibel"]').textContent()), 'Sin fichas suficientes: botón apagado y "te faltan"');
  await page.click('[data-est="abrir"][data-clave="decibel"]');

  console.log('Asignar a un equipo');
  await page.click('[data-estrella="lupe"] [data-est="asignar"][data-equipo="duelo"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /Lupe Zoom va en tu equipo de Duelos/.test(t)));
  const as = srv.pedidos.find((p) => p.ruta === '/api/estrellas/asignar');
  ok(JSON.stringify(as.body) === '{"clave":"lupe","equipo":"duelo"}', 'POST asignar {clave, equipo}');
  ok(/Lupe Zoom/.test(await page.locator('[data-slot="duelo"]').textContent()) && /Varela/.test(await page.locator('[data-slot="copa"]').textContent()), 'Duelos: Lupe; Copa sigue con Varela (1 por equipo)');
  await page.click('[data-estrella="lupe"] [data-est="asignar"][data-equipo="duelo"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /salió/.test(t)));
  ok(srv.pedidos.filter((p) => p.ruta === '/api/estrellas/asignar').pop().body.quitar === true && /Sin estrella/.test(await page.locator('[data-slot="duelo"]').textContent()), 'Tocar otra vez la quita del equipo');

  console.log('Error con código');
  srv.fallar = { ruta: '/api/estrellas/contratar', status: 402, codigo: 'sin_creditos', error: 'No tienes créditos suficientes.' };
  await page.click('[data-est="abrir"][data-clave="varela"]');
  await page.click('[data-panel="varela"] [data-modo="credito"][data-partidos="1"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /No te alcanzan los créditos/.test(t)));
  ok(true, 'Código sin_creditos → aviso traducido');

  console.log('Pase de Copa');
  await page.click('[data-est="pase_dinero"]');
  ok(JSON.stringify(await page.evaluate(() => window.__compras)) === '["pase_copa"]', '$2.99 abre la tienda con el producto pase_copa');
  await page.click('[data-est="pase"]');
  await page.waitForSelector('[data-pase="activo"]');
  const pp = srv.pedidos.find((p) => p.ruta === '/api/pase_copa/comprar');
  ok(JSON.stringify(pp.body) === '{"modo":"credito"}', 'POST /api/pase_copa/comprar {modo:"credito"}');
  ok(/hasta 15 eventos/.test(await page.locator('[data-est-zona="pase"]').textContent()) && await page.locator('[data-est="pase"]').count() === 0, 'Pase activo: hasta 15 eventos hoy');
  await page.locator('[data-est-zona="pase"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: cap('pase_activo') });

  console.log('Fuera de la preparación, sin sesión, error del servidor');
  Object.assign(srv, { pase: false, fase: 'batalla' });
  await abrir(page); await page.waitForSelector('[data-pase="fuera"]');
  ok(/de lunes a viernes/.test(await page.locator('[data-pase="fuera"]').textContent()), 'Batalla: el pase no se vende (texto claro)');
  await page.evaluate(() => { window.__sesion = false; });
  await abrir(page); await page.waitForSelector('[data-est-estado="sin_sesion"]');
  ok(/Entra con tu cuenta/.test(await page.locator('.pe').textContent()), 'Sin sesión: pide entrar');
  await noHScroll(page, 'sin sesión');
  await page.screenshot({ path: cap('sin_sesion') });
  await page.evaluate(() => { window.__sesion = true; });
  srv.modo = 'error';
  await page.evaluate(() => window.Estrellas.invalidar());
  await abrir(page); await page.waitForSelector('[data-est-estado="error"]');
  ok(/mantenimiento/.test(await page.locator('.pe').textContent()) && /mantenimiento/.test(await page.locator('.pe').textContent()) && await page.locator('[data-est="recargar"]').count() === 1, 'Error del servidor: mensaje, código y reintentar');
  srv.modo = 'ok';
  await page.click('[data-est="recargar"]'); await page.waitForSelector('[data-est-estado="listo"]');
  ok(true, 'Reintentar vuelve a cargar');

  console.log('Tarjeta de Inicio (orden 35, con copa activa)');
  const ini = await page.evaluate(() => { const m = window.EnVivoInicio.find((x) => x.id === 'estrellas'); document.getElementById('ini').innerHTML = m.tarjeta({}); return { orden: m.orden, html: document.getElementById('ini').innerHTML }; });
  ok(ini.orden === 35 && /Personal estrella/.test(ini.html) && /Varela/.test(ini.html), 'Tarjeta: título y estrella de mi equipo de copa');
  srv.fase = 'cerrada';
  await page.evaluate(() => window.Estrellas.recargar());
  ok(await page.evaluate(() => window.EnVivoInicio.find((x) => x.id === 'estrellas').tarjeta({})) === '', 'Sin copa activa: no sale');
  srv.fase = 'preparacion';
  await page.evaluate(() => window.Estrellas.recargar());
  await page.evaluate(() => { document.getElementById('ini').innerHTML = window.EnVivoInicio.find((x) => x.id === 'estrellas').tarjeta({}); window.scrollTo(0, 0); });
  await noHScroll(page, 'inicio');
  await page.screenshot({ path: cap('inicio') });
  ok(!errores.length, 'Sin errores de JavaScript (390)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await page.context().close();

  for (const [lang, vp, frase] of [['en', { width: 390, height: 844 }, /Star crew/], ['zh-CN', { width: 390, height: 844 }, /明星团队/], ['de', { width: 360, height: 780 }, /Star-Crew/], ['ru', { width: 360, height: 780 }, /Звёздная команда/], ['es', { width: 360, height: 780 }, /Personal estrella/]]) {
    console.log(`Idioma ${lang} en ${vp.width}x${vp.height}`);
    const p = await pagina(browser, vp, lang);
    await abrir(p.page);
    await p.page.waitForSelector('[data-est-estado="listo"]');
    ok(frase.test(await p.page.locator('.pe').textContent()), `${lang}: textos traducidos`);
    await p.page.click('[data-est="abrir"][data-clave="cero_ping"]');
    await noHScroll(p.page, `${lang} ${vp.width}`);
    await p.page.screenshot({ path: cap(lang === 'es' ? '360' : lang.toLowerCase()), fullPage: true });
    ok(!p.errores.length, `${lang}: sin errores de JavaScript` + (p.errores.length ? ': ' + p.errores.join(' | ') : ''));
    await p.ctx.close();
  }

  await browser.close();
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien.');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
