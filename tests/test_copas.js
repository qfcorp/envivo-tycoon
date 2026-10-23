/* Prueba de la pantalla de la Copa de Servidores (js/copas.js) en celulares simulados (390x844 y 360x780) con Playwright.
   El servidor es FALSO (fetch interceptado): GET /api/copa, POST /api/copa/equipo, /intento/iniciar, /intento/enviar.
   El evento se juega DE VERDAD con server/validador/intento.js + js/logic.js (lo mismo que repite el servidor).
   Fases: preparación, batalla, cerrada; y también sin sesión, sin copa, errores del servidor (con código) y la tarjeta de Inicio.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_copas.js     (capturas en tests/capturas/copa_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://copa.prueba';
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
let deGit = null;
try { require(path.join(RAIZ, 'js', 'logic.js')); } catch (e) {
  const git = (f) => { try { return require('child_process').execSync(`git -C "${RAIZ}" show HEAD:${f}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (x) { return null; } };
  deGit = { 'js/logic.js': git('js/logic.js'), 'js/premium.js': git('js/premium.js') };
  console.log('AVISO: js/logic.js no carga ahora mismo; se usa la versión de git (HEAD).');
}
const leerJs = (f) => (deGit && deGit[f]) || leer(f);
const html = leer('index.html');
const estilos = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- datos del servidor falso (forma de COPAS.md §2) ---------- */
const iso = (ms) => new Date(ms).toISOString();
const LUNES = Date.parse('2026-10-19T00:00:00-05:00');
const H = 3600e3, D = 24 * H;
const SERVIDORES = [[1, 'Servidor 1 · Quito'], [2, 'Servidor 2 · Guayaquil'], [3, 'Servidor 3 · Cuenca']];
const contrato = (n) => ({ type: 'ligapro', client: 'Copa Planeta de Balompié · partido ' + n, cams: 4, diff: 3, audio: true, stream: true, outdoor: true, pay: 2500, rival: false });
const partidos = (n, base) => Array.from({ length: n }, (_, i) => {
  const a = [88, 71, 64, 90, 77][i] + base, b = [80, 79, 64, 85, 81][i] - base;
  return { n: i + 1, tipo: ['ligapro', 'final', 'ligapro', 'ligapro', 'final'][i], calidad_a: a, calidad_b: b, ganador: a > b ? 'a' : b > a ? 'b' : 'empate' };
});

function base(fase) {
  const ahora = fase === 'preparacion' ? LUNES + 3 * D + 15 * H : fase === 'batalla' ? LUNES + 5 * D + 15 * H + 10 * 60e3 : LUNES + 5 * D + 21 * H;
  const prep = { 1: 4210, 2: 5120, 3: 1980 };
  const s = SERVIDORES.map(([id, nombre]) => ({ id, nombre, puntos_prep: prep[id], puntos_tabla: 0, g: 0, e: 0, p: 0, posicion: 0, yo: id === 1 }));
  const d = {
    ok: true,
    copa: { id: 7, nombre: 'Copa Planeta de Balompié', torneo_key: 'planeta', fase, inicio: iso(LUNES), fin: iso(LUNES + 7 * D - 1000), ahora: iso(ahora) },
    universo: { id: 1, nombre: 'Universo Andino' },
    servidores: s,
    cruces: [
      { id: 21, ronda: 1, a: 1, b: 2, hora: iso(LUNES + 5 * D + 10 * H), estado: 'pendiente', puntos_a: null, puntos_b: null, partidos: [] },
      { id: 22, ronda: 2, a: 2, b: 3, hora: iso(LUNES + 5 * D + 14 * H), estado: 'pendiente', puntos_a: null, puntos_b: null, partidos: [] },
      { id: 23, ronda: 3, a: 3, b: 1, hora: iso(LUNES + 5 * D + 18 * H), estado: 'pendiente', puntos_a: null, puntos_b: null, partidos: [] },
    ],
    yo: { aporte: 340, posicion_en_servidor: 4, equipo_registrado: false, intento_abierto: null },
    top_aportantes: [{ alias: 'Beto Live', siglas: 'QFP', puntos: 820 }, { alias: 'Caro Stream', siglas: 'LUZ', puntos: 610 }, { alias: 'Mega Producciones del Pichincha Internacional', siglas: 'MPI', puntos: 455 },
      { alias: 'Ana Producciones', siglas: 'QFP', puntos: 340, yo: true }, { alias: 'Don Ramiro', siglas: '', puntos: 120 }],
    historial: [{ semana: '2026-W42', nombre: 'La Pelea del Siglo', torneo_key: 'pelea', campeon: 'Servidor 2 · Guayaquil' }, { semana: '2026-W41', nombre: 'Gran Premio Fórmula Veloz', torneo_key: 'formula', campeon: 'Servidor 1 · Quito' }],
  };
  if (fase === 'preparacion') { [[2, 1], [1, 2], [3, 3]].forEach(([id, p]) => { d.servidores.find((x) => x.id === id).posicion = p; }); }
  if (fase === 'batalla') {
    d.cruces[0] = Object.assign(d.cruces[0], { estado: 'jugado', partidos: partidos(5, 2) });
    const pa = d.cruces[0].partidos.filter((p) => p.ganador === 'a').length, pb = d.cruces[0].partidos.filter((p) => p.ganador === 'b').length;
    d.cruces[0].puntos_a = pa + 12; d.cruces[0].puntos_b = pb + 15;
    d.cruces[1] = Object.assign(d.cruces[1], { estado: 'en_vivo', partidos: partidos(3, -4), puntos_a: 2, puntos_b: 1 });
    const t = { 1: [3, 1, 0, 0], 2: [0, 0, 0, 1], 3: [0, 0, 0, 0] };
    d.servidores.forEach((x) => { x.puntos_tabla = t[x.id][0]; x.g = t[x.id][1]; x.p = t[x.id][3]; });
    [[1, 1], [2, 2], [3, 3]].forEach(([id, p]) => { d.servidores.find((x) => x.id === id).posicion = p; });
  }
  if (fase === 'cerrada') {
    d.cruces = d.cruces.map((c, i) => Object.assign(c, { estado: 'jugado', partidos: partidos(5, [2, -6, 1][i]), puntos_a: [17, 13, 16][i], puntos_b: [16, 18, 14][i] }));
    const t = { 1: [4, 1, 1, 0, 1], 2: [3, 1, 0, 1, 2], 3: [3, 1, 0, 1, 3] };
    d.servidores.forEach((x) => { const v = t[x.id]; x.puntos_tabla = v[0]; x.g = v[1]; x.e = v[2]; x.p = v[3]; x.posicion = v[4]; });
    d.premios = [{ nombre: 'Servidor campeón', entregas: [{ tipo: 'dinero', cantidad: 2500 }, { tipo: 'fama', cantidad: 3 }, { tipo: 'trofeo', clave: 'copa_planeta', nombre: 'Copa Planeta' }, { tipo: 'materiales', materiales: { ladrillo: 20, cable: 5 } }] },
      { nombre: 'Top 10 del campeón', entregas: [{ tipo: 'dinero', cantidad: 1500 }, { tipo: 'reparar_todo' }] },
      { nombre: 'Participación', detalle: 'Desde 50 pts de aporte: $400' }];
  }
  return d;
}

const ESCENAS = ['preparacion', 'batalla', 'cerrada', 'sin_copa', 'sin_sesion', 'error'];

async function pagina(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|status of (401|409|503)/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const srv = { modo: 'preparacion', estado: base('preparacion'), pedidos: [], fallar: null, equipo: null };
  srv.poner = (m) => { srv.modo = m; srv.estado = m === 'sin_copa' ? Object.assign(base('preparacion'), { copa: null, servidores: [], cruces: [], top_aportantes: [] }) : base(ESCENAS.includes(m) && m !== 'error' && m !== 'sin_sesion' ? m : 'preparacion'); };
  const SEMILLA = 1984263517;
  await page.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    const m = r.request().method();
    const json = (o, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilos}</head>
      <body><main class="gut" style="padding-top:12px"><div id="ini"></div><div id="copa"></div></main>
      ${fs.existsSync(path.join(RAIZ, 'js', 'datos.js')) ? '<script src="/js/datos.js"></script>' : ''}<script src="/js/logic.js"></script><script src="/js/art.js"></script><script src="/js/premium.js"></script><script src="/server/validador/intento.js"></script><script src="/js/copas.js"></script></body></html>` });
    if (/^\/(js\/[a-z]+\.js|server\/validador\/intento\.js)$/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: leerJs(u.pathname.slice(1)) });
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : undefined;
    srv.pedidos.push({ m, ruta: u.pathname, body, cab: r.request().headers() });
    if (srv.fallar && srv.fallar.ruta === u.pathname) { const f = srv.fallar; srv.fallar = null; return json({ ok: false, error: f.error, codigo: f.codigo }, f.status); }
    if (srv.modo === 'error') return json({ ok: false, error: 'El servidor está en mantenimiento.', codigo: 'mantenimiento' }, 503);
    if (u.pathname === '/api/copa' && m === 'GET') return json(srv.estado);
    if (u.pathname === '/api/copa/equipo' && m === 'POST') {
      srv.equipo = body; srv.estado.yo.equipo_registrado = true;
      return json({ ok: true, equipo: { personas: body.staff.length, equipos: body.equip.length, poder: 312 }, copa: srv.estado });
    }
    if (u.pathname === '/api/copa/intento/iniciar' && m === 'POST') {
      const eq = srv.equipo || { staff: [{ role: 'cam', skill: 2, owner: true }], equip: [{ type: 'cam_basic' }] };
      const intento = { id: 501, seed: SEMILLA, contrato: contrato(1), equipo: { staff: eq.staff.map((p) => Object.assign({}, p, { morale: 80 })), equip: eq.equip.map((x) => ({ type: x.type, condition: 90 })) },
        contexto: { fama: 40, dinero: 1000, stock: { cable: 1, battery: 1 } }, vip: false, firma: 'abc123', vence: iso(Date.parse(srv.estado.copa.ahora) + 1800e3) };
      srv.estado.yo.intento_abierto = { id: 501 };
      return json(Object.assign({ ok: true }, intento));
    }
    if (u.pathname === '/api/copa/intento/enviar' && m === 'POST') {
      const cal = body.resultado.calidad;
      const puntos = cal * 2;
      srv.estado.yo.aporte += puntos; srv.estado.yo.intento_abierto = null; srv.estado.yo.posicion_en_servidor = 3;
      srv.estado.servidores[0].puntos_prep += puntos;
      return json({ ok: true, resultado: { calidad: cal, estrellas: body.resultado.estrellas, valido: true, puntos }, copa: srv.estado });
    }
    return json({ ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }, 404);
  });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => {
    const s = Game.newGame(7);
    s.rep = 52;
    s.staff = [{ id: 1, name: 'Ana', role: 'cam', skill: 4, owner: true, morale: 90 }, { id: 2, name: 'Luis', role: 'cam', skill: 3 }, { id: 3, name: 'Majo', role: 'dir', skill: 4 },
      { id: 4, name: 'Pepe', role: 'audio', skill: 3 }, { id: 5, name: 'Rita', role: 'stream', skill: 3 }, { id: 6, name: 'Gus', role: 'cam', skill: 2 }];
    s.equip = [{ id: 10, type: 'cam_pro', condition: 90 }, { id: 11, type: 'cam_pro', condition: 70 }, { id: 12, type: 'cam_cine', condition: 95 }, { id: 13, type: 'cam_basic', condition: 20 },
      { id: 14, type: 'switch_basic', condition: 80 }, { id: 15, type: 'switch_pro', condition: 80 }, { id: 16, type: 'audio_basic', condition: 80 }, { id: 17, type: 'mics', condition: 80 },
      { id: 18, type: 'router4g', condition: 80 }, { id: 19, type: 'raincover', condition: 80 }, { id: 20, type: 'dron4k', condition: 100 }];
    window.__toasts = []; window.__jugadas = []; window.__sesion = true;
    window.Api = { disponible: true, logueado: () => window.__sesion };
    window.__ctx = {
      Api: window.Api, A: window.Art, estado: () => s, guardar: () => {}, toast: (t) => window.__toasts.push(t), ask: (h, b, fn) => fn(),
      jugarIntento: async (intento) => {
        const r = Intento.jugar(Game, intento, (inc) => Math.max(0, inc.choices.findIndex((c) => c.ok)));
        window.__jugadas.push({ intento, decisiones: r.decisiones, resultado: r.resultado });
        return { decisiones: r.decisiones, resultado: r.resultado };
      },
    };
  });
  return { page, ctx, srv, errores };
}

const abrir = (page) => page.evaluate(() => window.Copas.render(document.getElementById('copa'), window.__ctx));
async function noHScroll(page, tag) {
  const ov = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const w = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('.cp *, .cp-ini *')].filter((n) => !(n.ownerSVGElement)).filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.right > w + 1 || r.left < -1); })
      .map((n) => n.tagName + '.' + String((n.className && n.className.baseVal !== undefined) ? n.className.baseVal : n.className) + ' «' + (n.textContent || '').slice(0, 30) + '»').slice(0, 3);
    return { doc, fuera };
  });
  ok(ov.doc <= 1 && !ov.fuera.length, `${tag}: sin desplazamiento horizontal (${ov.doc}px${ov.fuera.length ? ', se sale: ' + ov.fuera.join(' | ') : ''})`);
}

(async () => {
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const cap = (n) => path.join(outDir, 'copa_' + n + '.png');
  const browser = await chromium.launch();

  /* ================= 390 x 844: todo el recorrido ================= */
  console.log('Celular 390x844');
  const { page, srv, errores } = await pagina(browser, { width: 390, height: 844 });

  console.log('Preparación');
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="preparacion"]');
  const g = srv.pedidos.find((p) => p.ruta === '/api/copa');
  ok(!!g && g.m === 'GET' && g.cab['x-envivo'] === '1', 'GET /api/copa con la cabecera X-Envivo');
  const cab = await page.locator('[data-copa="cabecera"]').textContent();
  ok(/Copa Planeta de Balompié/.test(cab) && /Universo Andino/.test(cab), 'Nombre del torneo (parodia) y universo');
  ok(/Preparación/.test(cab) && /La batalla empieza en/.test(cab), 'Fase y qué cuenta el reloj');
  const c1 = await page.locator('[data-copa="cabecera"] [data-copa-cuenta]').textContent();
  ok(/^1d (09:00:00|08:59:\d\d)$/.test(c1), 'Cuenta regresiva hasta el sábado 00:00 (' + c1 + ')');
  await page.waitForTimeout(2300);
  ok((await page.locator('[data-copa="cabecera"] [data-copa-cuenta]').textContent()) !== c1, 'La cuenta regresiva avanza');
  ok(/Tu servidor va 2°/.test(cab), '"Tu servidor va 2°"');
  ok(await page.locator('.cp-tabla tbody tr').count() === 3, 'Marcador con los 3 servidores');
  ok(await page.locator('.cp-tabla tr.yo').count() === 1 && /Quito/.test(await page.locator('.cp-tabla tr.yo').textContent()), 'Mi servidor resaltado en la tabla');
  ok(/TU SERVIDOR/.test(await page.locator('.cp-vs').textContent()) && /Guayaquil/.test(await page.locator('.cp-vs').textContent()), 'TU SERVIDOR contra el rival que va primero');
  ok(await page.locator('.cp-prep .fila').count() === 3, 'Barra de preparación por servidor');
  ok(/bono \+15/.test(await page.locator('[data-prep="2"]').textContent()) && /bono \+12,3/.test(await page.locator('[data-prep="1"]').textContent()), 'Bono normalizado (15 al máximo, 12,3 a Quito)');
  ok((await page.locator('[data-copa-aporte]').textContent()) === '340' && /Vas 4° en tu servidor/.test(await page.locator('[data-copa="yo"]').textContent()), 'Mi aporte y posición en mi servidor');
  ok(await page.locator('[data-cruce]').count() === 3 && await page.locator('[data-cruce][data-estado="pendiente"]').count() === 3, 'Los 3 cruces del sábado, por jugarse');
  ok(/Ana Producciones \(Tú\)/.test(await page.locator('[data-copa="top"]').textContent()), 'Top aportantes con "Tú"');
  ok(/Servidor 2 · Guayaquil/.test(await page.locator('[data-copa="historial"]').textContent()), 'Campeones de semanas pasadas');
  ok(await page.locator('[data-copa="premios"] .cp-prem > div').count() === 3, 'Lista de premios');
  ok(await page.locator('[data-copa="sumar"]').isEnabled() && await page.locator('[data-copa="registrar"]').isEnabled(), 'Botones de registrar y sumar activos');
  await noHScroll(page, 'preparación');
  await page.screenshot({ path: cap('preparacion'), fullPage: true });
  await page.screenshot({ path: cap('preparacion_arriba') });

  console.log('Registrar equipo de copa');
  await page.click('[data-copa="registrar"]');
  await page.waitForSelector('[data-copa-equipo="si"]');
  const reg = srv.pedidos.find((p) => p.ruta === '/api/copa/equipo');
  ok(!!reg && reg.m === 'POST' && reg.cab['x-envivo'] === '1', 'POST /api/copa/equipo con X-Envivo');
  ok(Object.keys(reg.body).sort().join() === 'equip,staff', 'Cuerpo exacto: {staff, equip}');
  ok(reg.body.staff.length === 6 && reg.body.staff.filter((p) => p.owner).length === 1 && reg.body.staff.every((p) => p.role && p.skill >= 1 && p.skill <= 5), 'Manda su personal (6, un dueño, rol y habilidad)');
  ok(!reg.body.equip.some((e) => e.type === 'cam_basic') && !reg.body.equip.some((e) => e.type === 'dron4k'), 'No manda equipo roto ni exclusivos que no están en el servidor');
  ok(reg.body.equip.filter((e) => /^switch/.test(e.type)).map((e) => e.type).join() === 'switch_pro', 'Un solo switcher: el mejor');
  ok(reg.body.equip.every((e) => Object.keys(e).join() === 'type'), 'Cada equipo va solo con {type}');
  ok(/Tu equipo de copa quedó registrado \(6 personas/.test((await page.evaluate(() => window.__toasts)).join(' ')), 'Aviso de equipo registrado');

  console.log('Sumar puntos (evento jugado de verdad con intento.js)');
  await page.click('[data-copa="sumar"]');
  await page.waitForSelector('[data-copa="ultimo"]');
  const ini = srv.pedidos.find((p) => p.ruta === '/api/copa/intento/iniciar');
  const env = srv.pedidos.find((p) => p.ruta === '/api/copa/intento/enviar');
  ok(!!ini && ini.m === 'POST' && JSON.stringify(ini.body) === '{}', 'iniciar con cuerpo {} exacto');
  const jug = await page.evaluate(() => window.__jugadas);
  ok(jug.length === 1 && jug[0].intento.seed === 1984263517 && jug[0].intento.id === 501 && jug[0].intento.contrato.type === 'ligapro', 'ctx.jugarIntento(intento) recibe la semilla y el contrato del servidor');
  ok(!!env && Object.keys(env.body).sort().join() === 'decisiones,intento_id,resultado', 'enviar: solo {intento_id, decisiones, resultado}');
  ok(env.body.intento_id === 501 && JSON.stringify(env.body.decisiones) === JSON.stringify(jug[0].decisiones), '…con el intento y las decisiones del juego');
  ok(Object.keys(env.body.resultado).sort().join() === 'calidad,estrellas' && env.body.resultado.calidad === jug[0].resultado.quality && env.body.resultado.estrellas === jug[0].resultado.stars, '…y el resultado {calidad, estrellas} que dijo el juego');
  const sumado = 340 + jug[0].resultado.quality * 2;
  ok((await page.locator('[data-copa-aporte]').textContent()) === sumado.toLocaleString('es-EC'), 'Mi aporte sube con los puntos del servidor (' + sumado + ')');
  ok(/para tu servidor/.test(await page.locator('[data-copa="ultimo"]').textContent()), 'Tarjeta con el resultado');
  await noHScroll(page, 'después de sumar');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: cap('resultado') });

  console.log('Error del servidor al sumar (código)');
  srv.fallar = { ruta: '/api/copa/intento/iniciar', status: 409, codigo: 'fase', error: 'Fuera de fase.' };
  const antes = srv.pedidos.filter((p) => p.ruta === '/api/copa/intento/enviar').length;
  await page.click('[data-copa="sumar"]');
  await page.waitForFunction(() => window.__toasts.some((t) => /esta fase de la copa/.test(t)));
  ok(true, 'Código "fase" → aviso en español claro');
  ok(srv.pedidos.filter((p) => p.ruta === '/api/copa/intento/enviar').length === antes, 'No envía nada si no pudo iniciar');

  console.log('Batalla (sábado)');
  srv.poner('batalla'); srv.estado.yo.equipo_registrado = true;
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="batalla"]');
  const cabB = await page.locator('[data-copa="cabecera"]').textContent();
  ok(/EN VIVO/.test(cabB) && /La batalla termina en/.test(cabB) && /¡Tu servidor va primero!/.test(cabB), 'Fase batalla EN VIVO y "va primero"');
  ok(await page.locator('[data-cruce="21"] [data-partido]').count() === 5, 'Cruce 1: los 5 partidos con calidades');
  ok(await page.locator('[data-cruce="21"] .q.win').count() === 5 - (await page.locator('[data-cruce="21"] [data-ganador="x"]').count()), 'Cada partido marca al ganador');
  ok(/Gana Guayaquil/.test(await page.locator('[data-cruce="21"]').textContent()), 'Cruce terminado con su ganador (bono de preparación incluido)');
  ok(await page.locator('[data-cruce="22"][data-estado="vivo"] .cp-live').count() === 1 && await page.locator('[data-cruce="22"] [data-partido]').count() === 3 && await page.locator('[data-cruce="22"] .cp-pt.espera').count() === 2, 'Cruce en vivo: 3 jugados y 2 por jugarse');
  ok(/Sábado 18:00/.test(await page.locator('[data-cruce="23"]').textContent()) && /Por jugarse/.test(await page.locator('[data-cruce="23"]').textContent()), 'Cruce pendiente con su hora');
  ok(/Próximo cruce en/.test(await page.locator('.cp').textContent()), 'Cuenta para el próximo cruce');
  ok(await page.locator('[data-copa="sumar"]').isDisabled() && /de lunes a viernes/.test(await page.locator('[data-copa="yo"]').textContent()), 'En batalla no se suman puntos');
  await noHScroll(page, 'batalla');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: cap('batalla'), fullPage: true });
  await page.locator('[data-cruce="21"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: cap('batalla_cruces') });

  console.log('Cerrada');
  srv.poner('cerrada');
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="cerrada"]');
  ok(/¡Tu servidor es campeón!/.test(await page.locator('[data-copa="campeon"]').textContent()), 'Campeón anunciado');
  ok(/Nueva copa en/.test(await page.locator('[data-copa="cabecera"]').textContent()), 'Cuenta hasta la nueva copa');
  ok(await page.locator('[data-cruce][data-estado="jugado"]').count() === 3, 'Los 3 cruces terminados');
  const prem = await page.locator('[data-copa="premios"]').textContent();
  ok(/\$2\.500/.test(prem) && /\+3 fama/.test(prem) && /Trofeo: Copa Planeta/.test(prem) && /20 × ladrillo/.test(prem), 'Premios del servidor (dinero, fama, trofeo, materiales)');
  await noHScroll(page, 'cerrada');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: cap('cerrada'), fullPage: true });

  console.log('Sin copa, sin sesión y errores');
  srv.poner('sin_copa');
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="sin_copa"]');
  ok(/Todavía no hay copa/.test(await page.locator('.cp').textContent()), 'Sin copa: explica cuándo arranca');
  await noHScroll(page, 'sin copa');
  await page.screenshot({ path: cap('sin_copa'), fullPage: true });
  const nAntes = srv.pedidos.length;
  await page.evaluate(() => { window.__sesion = false; });
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="sin_sesion"]');
  ok(srv.pedidos.length === nAntes, 'Sin sesión: no pide nada al servidor');
  ok(/Entra con tu cuenta/.test(await page.locator('.cp').textContent()), 'Sin sesión: invita a entrar');
  await noHScroll(page, 'sin sesión');
  await page.screenshot({ path: cap('sin_sesion'), fullPage: true });
  await page.evaluate(() => { window.__sesion = true; });
  srv.poner('error');
  await page.evaluate(() => window.Copas.invalidar());
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="error"]');
  ok(/mantenimiento/.test(await page.locator('.cp').textContent()) && /Código: mantenimiento/.test(await page.locator('[data-copa-codigo]').textContent()), 'Error del servidor con su código');
  await noHScroll(page, 'error');
  await page.screenshot({ path: cap('error') });
  srv.poner('preparacion');
  await page.click('[data-copa="recargar"]');
  await page.waitForSelector('[data-copa-estado="preparacion"]');
  ok(true, '"Intentar de nuevo" vuelve a cargar');
  srv.fallar = { ruta: '/api/copa', status: 401, codigo: '', error: 'Sin sesión.' };
  await page.evaluate(() => window.Copas.invalidar());
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="sin_sesion"]');
  ok(/Tu sesión se cerró/.test(await page.locator('.cp').textContent()), 'HTTP 401 → sesión cerrada');

  console.log('Tarjeta de Inicio (EnVivoInicio, orden 30)');
  srv.poner('preparacion');
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="preparacion"]');
  const ini1 = await page.evaluate(() => {
    const m = (window.EnVivoInicio || []).find((x) => x.id === 'copa');
    window.__abierto = null; window.EnVivoAbrirOnline = (k) => { window.__abierto = k; };
    const h = m.tarjeta({ render: () => {} });
    document.getElementById('ini').innerHTML = h;
    m.clic({}, 'abrir', null);
    return { orden: m.orden, h, abierto: window.__abierto };
  });
  ok(ini1.orden === 30, 'Módulo de Inicio con orden 30');
  ok(/Tu servidor va 2° en la preparación/.test(ini1.h) && /data-copa-cuenta/.test(ini1.h) && /data-ext="copa" data-acc="abrir"/.test(ini1.h), 'Tarjeta: cuenta regresiva, "tu servidor va 2°" y botón');
  ok(ini1.abierto === 'copa', 'El botón abre la pantalla de la copa');
  await page.evaluate(() => window.scrollTo(0, 0));
  await noHScroll(page, 'tarjeta de Inicio');
  await page.locator('.cp-ini').screenshot({ path: cap('inicio') });
  srv.poner('cerrada');
  await page.evaluate(() => window.Copas.recargar());
  ok(await page.evaluate(() => window.EnVivoInicio.find((x) => x.id === 'copa').tarjeta({}) === ''), 'Sin tarjeta en Inicio cuando la copa está cerrada');
  await page.evaluate(() => { window.__sesion = false; });
  ok(await page.evaluate(() => window.EnVivoInicio.find((x) => x.id === 'copa').tarjeta({}) === ''), 'Sin tarjeta en Inicio sin sesión');
  await page.evaluate(() => { window.__sesion = true; document.getElementById('ini').innerHTML = ''; });

  console.log('Idiomas (TRAD dentro de copas.js)');
  srv.poner('batalla');
  await page.evaluate(() => { window.I18N = { idioma: 'en', locale: 'en-US' }; });
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="batalla"]');
  const en = await page.locator('.cp').textContent();
  ok(/Server Cup/.test(en) && /YOUR SERVER/.test(en) && /Planet Footy Cup/.test(en) && /Saturday match-ups/.test(en) && !/Cruces del sábado/.test(en), 'Inglés: textos y nombre del torneo traducidos');
  await page.evaluate(() => { window.I18N = { idioma: 'zh-CN', locale: 'zh-CN' }; });
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="batalla"]');
  ok(/服务器杯/.test(await page.locator('.cp').textContent()), 'Chino simplificado');
  await noHScroll(page, 'zh-CN');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: cap('zh') });
  for (const code of ['pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id']) {
    await page.evaluate((c) => { window.I18N = { idioma: c, locale: c }; }, code);
    await abrir(page);
    await page.waitForSelector('[data-copa-estado="batalla"]');
    const t = await page.locator('[data-copa="marcador"]').textContent();
    const esperado = await page.evaluate((c) => window.Copas.TRAD[c].tu_servidor, code);
    ok(t.includes(esperado), code + ': "' + esperado + '"');
    await noHScroll(page, code);
  }
  await page.evaluate(() => { window.I18N = { idioma: 'xx' }; });
  await abrir(page);
  await page.waitForSelector('[data-copa-estado="batalla"]');
  ok(/TU SERVIDOR/.test(await page.locator('.cp').textContent()), 'Idioma sin traducción → español');
  await page.evaluate(() => { delete window.I18N; window.Copas.detener(); });
  ok(errores.length === 0, 'Sin errores de JS (390)' + (errores.length ? ': ' + errores.join(' | ') : ''));

  /* ================= 360 x 780: todas las fases ================= */
  console.log('Celular 360x780');
  const p2 = await pagina(browser, { width: 360, height: 780 });
  for (const fase of ESCENAS) {
    p2.srv.poner(fase);
    await p2.page.evaluate((f) => { window.__sesion = f !== 'sin_sesion'; window.Copas.invalidar(); }, fase);
    await abrir(p2.page);
    await p2.page.waitForSelector(`[data-copa-estado="${fase}"]`);
    await noHScroll(p2.page, '360 ' + fase);
    if (['preparacion', 'batalla', 'cerrada'].includes(fase)) await p2.page.screenshot({ path: cap('360_' + fase), fullPage: true });
  }
  p2.srv.poner('preparacion');
  await p2.page.evaluate(() => { window.__sesion = true; });
  await abrir(p2.page);
  await p2.page.waitForSelector('[data-copa-estado="preparacion"]');
  await p2.page.click('[data-copa="registrar"]');
  await p2.page.waitForSelector('[data-copa-equipo="si"]');
  await p2.page.click('[data-copa="sumar"]');
  await p2.page.waitForSelector('[data-copa="ultimo"]');
  const env2 = p2.srv.pedidos.filter((p) => p.ruta === '/api/copa/intento/enviar');
  ok(env2.length === 1 && Object.keys(env2[0].body).sort().join() === 'decisiones,intento_id,resultado', '360: un intento completo con los campos exactos');
  await noHScroll(p2.page, '360 después de sumar');
  await p2.page.evaluate(() => window.Copas.detener());
  ok(p2.errores.length === 0, 'Sin errores de JS (360)' + (p2.errores.length ? ': ' + p2.errores.join(' | ') : ''));

  await browser.close();
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
