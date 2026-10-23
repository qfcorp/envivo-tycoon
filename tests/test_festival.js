/* Prueba de la pantalla del Mega Festival (js/festival.js) en un celular simulado (390x844) con Playwright.
   El servidor es FALSO (fetch interceptado): /api/festival, /intento/iniciar, /intento/enviar y /pases/comprar.
   El turno se juega DE VERDAD con server/validador/intento.js + js/logic.js (lo mismo que repite el servidor).
   Uso:  node tests/test_festival.js      (guarda tests/capturas/festival.png y festival_cerrado.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://festival.prueba';
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
// Si js/logic.js no carga ahora (otra persona lo está cambiando a medias), se usa la última versión de git para logic/premium.
let deGit = null;
try { require(path.join(RAIZ, 'js', 'logic.js')); } catch (e) {
  const git = (f) => { try { return require('child_process').execSync(`git -C "${RAIZ}" show HEAD:${f}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (x) { return null; } };
  deGit = { 'js/logic.js': git('js/logic.js'), 'js/premium.js': git('js/premium.js') };
  console.log('AVISO: js/logic.js no carga ahora mismo (' + e.message.split('\n')[0] + '); se usa js/logic.js y js/premium.js de git (HEAD).');
}
const leerJs = (f) => (deGit && deGit[f]) || leer(f);
const html = leer('index.html');
const estilos = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- datos del servidor falso (misma forma que Festival::resumen) ---------- */
const AHORA = Date.parse('2026-10-23T15:20:00-05:00');
const iso = (ms) => new Date(ms).toISOString();
const NOMBRES = ['Escenario Principal', 'Tarima Rock', 'Carpa Electrónica', 'Escenario del Patrocinador', 'Zona de Prensa', 'Escenario Acústico'];
const TIPOS = ['concierto', 'concierto', 'concierto', 'lanzamiento', 'prensa', 'concierto'];
const ICONOS = ['concierto', 'sound', 'bolt', 'lanzamiento', 'mics', 'mics'];
const METAS = [390, 300, 300, 270, 210, 330];
const ACUM = [390, 214, 0, 270, 96, 41];
function estadoAbierto() {
  const esc = NOMBRES.map((nombre, i) => ({
    n: i + 1, nombre, tipo: TIPOS[i], icono: ICONOS[i], semilla: 1000 + i,
    contrato: { type: TIPOS[i], client: 'Mega Festival QFP · ' + nombre, cams: [4, 4, 4, 3, 2, 2][i], diff: [4, 4, 3, 3, 2, 3][i], audio: true, stream: true, outdoor: true, pay: 2500, rival: false, festival: true, escenario: i + 1 },
    meta: METAS[i], acumulado: ACUM[i], porcentaje: Math.floor((100 * ACUM[i]) / METAS[i]), completado: ACUM[i] >= METAS[i],
    completado_en: ACUM[i] >= METAS[i] ? iso(AHORA - 3600e3) : null, completado_por: ACUM[i] >= METAS[i] ? ['Beto Live', 0, 0, 'Caro Stream'][i] || null : null,
    cubierto_por: ACUM[i] ? [{ jugador_id: 2, nombre: 'Beto Live', aporte: Math.ceil(ACUM[i] * 0.6), puntos: Math.ceil(ACUM[i] * 0.6), intentos: 2, mejor: 88, yo: false },
      { jugador_id: 1, nombre: 'Ana Producciones', aporte: Math.floor(ACUM[i] * 0.4), puntos: Math.floor(ACUM[i] * 0.4), intentos: 1, mejor: 77, yo: true }] : [],
  }));
  const total = ACUM.reduce((a, b) => a + b, 0), meta = METAS.reduce((a, b) => a + b, 0);
  const pct = Math.floor((100 * total) / meta);
  return {
    ok: true, ahora: iso(AHORA),
    ciclo: { n: 11, abierto: true, abre: iso(AHORA - 3.33 * 3600e3), cierra: iso(AHORA + 20.67 * 3600e3), siguiente: iso(AHORA + 44.67 * 3600e3), duracion_h: 24, cada_h: 48 },
    asociacion: { id: 4, nombre: 'Quito Festival Pro', siglas: 'QFP', color: '#ff3b3b', cargo: 'presidente', liga: { n: 1, nombre: 'Plata' } },
    festival: {
      id: 31, ciclo: 11, nombre: 'Mega Festival QFP', estado: 'abierto', liga: { n: 1, nombre: 'Plata' }, miembros: 9, abre: iso(AHORA - 3.33 * 3600e3), cierra: iso(AHORA + 20.67 * 3600e3),
      meta_total: meta, calidad_total: total, porcentaje: pct,
      incidente: { clave: 'tormenta', nombre: 'Tormenta sobre el predio', detalle: 'Todos los escenarios quedan a la intemperie: puede llover en cualquiera.', icono: 'rain', hasta: iso(AHORA + 2.67 * 3600e3) },
      incidentes: [['calma', 'Todo en orden', 'check'], ['tormenta', 'Tormenta sobre el predio', 'rain'], ['tension', 'Baja de tensión en todo el predio', 'bolt'], ['publico', 'Público desbordado', 'people']]
        .map(([clave, nombre, icono], b) => ({ bloque: b, clave, nombre, detalle: nombre, icono, desde: iso(AHORA - 3.33 * 3600e3 + b * 6 * 3600e3), hasta: iso(AHORA - 3.33 * 3600e3 + (b + 1) * 6 * 3600e3), activo: b === 0, pasado: false })),
      escenarios: esc,
      hitos: [25, 50, 75, 100].map((p) => ({ pct: p, alcanzado: pct >= p, alcanzado_en: pct >= p ? iso(AHORA - 1800e3) : null, alcanzado_por: pct >= p ? 'Beto Live' : null,
        premio: { fichas: { 25: 10, 50: 15, 75: 25, 100: 50 }[p], entregas: p === 50 ? [{ tipo: 'consumible', item: 'battery', cantidad: 2 }] : [{ tipo: 'dinero', item: '-', cantidad: { 25: 500, 75: 1500, 100: 2500 }[p] }] } })),
      ranking: [{ puesto: 1, jugador_id: 2, nombre: 'Beto Live', puntos: 610, aporte: 610, intentos: 7, mejor: 91, yo: false },
        { puesto: 2, jugador_id: 1, nombre: 'Ana Producciones', puntos: 402, aporte: 402, intentos: 5, mejor: 84, yo: true },
        { puesto: 3, jugador_id: 3, nombre: 'Caro Stream', puntos: 299, aporte: 299, intentos: 4, mejor: 80, yo: false }],
    },
    yo: { pases: 3, pases_tope: 10, fichas: 45, creditos: 120, vip: false, hoy: { diario: true, vip: false, misiones: 1, misiones_max: 2 },
      compra: { precio: 30, max_dia: 3, comprados_hoy: 0, puede: true }, puntos: 402, intentos: 5, puesto: 2, puede_jugar: true, motivo: null, codigo: null,
      intento_abierto: null, topes: { habilidad_max: 5, personas_max: 8, equipos_max: 12, fama: 52 } },
    premios: { aporte: [{ min: 50, nombre: 'Colaborador', fichas: 10, entregas: [{ tipo: 'dinero', item: '-', cantidad: 380 }] },
      { min: 150, nombre: 'Jefe de escenario', fichas: 25, entregas: [{ tipo: 'dinero', item: '-', cantidad: 750 }, { tipo: 'consumible', item: 'cable', cantidad: 2 }] },
      { min: 300, nombre: 'Productor estrella', fichas: 45, entregas: [{ tipo: 'dinero', item: '-', cantidad: 1250 }, { tipo: 'reparar_todo', item: '-', cantidad: 1 }] }], puesto: { 1: 30, 2: 15, 3: 15 }, cerrar_escenario: 5 },
    anterior: null,
  };
}
function estadoCerrado() {
  const e = estadoAbierto();
  e.ciclo = { n: 11, abierto: false, abre: iso(AHORA - 30 * 3600e3), cierra: iso(AHORA - 6 * 3600e3), siguiente: iso(AHORA + 18 * 3600e3), duracion_h: 24, cada_h: 48 };
  e.festival = null;
  e.yo.puede_jugar = false; e.yo.codigo = 'cerrado'; e.yo.motivo = 'El Mega Festival está cerrado.';
  e.anterior = { id: 30, ciclo: 10, nombre: 'Mega Festival QFP', porcentaje: 81, liga: { n: 1, nombre: 'Plata' }, cerrado: iso(AHORA - 5.6 * 3600e3),
    mis_premios: [{ tipo: 'aporte', clave: '2', fichas: 45, entregas: [{ id: 91, tipo: 'dinero', item: '-', cantidad: 1250 }, { id: 92, tipo: 'reparar_todo', item: '-', cantidad: 1 }] },
      { tipo: 'puesto', clave: '2', fichas: 15, entregas: [] }, { tipo: 'hito', clave: '25', fichas: 10, entregas: [{ id: 93, tipo: 'dinero', item: '-', cantidad: 500 }] },
      { tipo: 'hito', clave: '50', fichas: 15, entregas: [{ id: 94, tipo: 'consumible', item: 'battery', cantidad: 2 }] }, { tipo: 'hito', clave: '75', fichas: 25, entregas: [{ id: 95, tipo: 'dinero', item: '-', cantidad: 1500 }] }] };
  return e;
}

(async () => {
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  // ---------- servidor falso ----------
  let modo = 'abierto';
  let estado = estadoAbierto();
  const pedidos = [];
  const SEMILLA = 1984263517;
  await page.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    const m = r.request().method();
    const json = (o, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilos}</head>
      <body><main class="gut" style="padding-top:12px"><div id="fest"></div></main>
      <script src="/js/logic.js"></script><script src="/js/art.js"></script><script src="/js/premium.js"></script><script src="/server/validador/intento.js"></script><script src="/js/festival.js"></script></body></html>` });
    if (/^\/(js\/[a-z]+\.js|server\/validador\/intento\.js)$/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: leerJs(u.pathname.slice(1)) });
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : null;
    pedidos.push({ m, ruta: u.pathname, body, cab: r.request().headers() });
    if (u.pathname === '/api/festival' && m === 'GET') return json(modo === 'abierto' ? estado : modo === 'cerrado' ? estadoCerrado() : Object.assign(estadoCerrado(), { asociacion: null, anterior: null }));
    if (u.pathname === '/api/festival/pases/comprar') {
      estado.yo.pases += 1; estado.yo.compra.comprados_hoy += 1; estado.yo.creditos -= 30;
      return json({ ok: true, compra: { creditos: estado.yo.creditos, comprados: 1, pases: estado.yo.pases }, estado });
    }
    if (u.pathname === '/api/festival/intento/iniciar') {
      const e = estado.festival.escenarios[body.escenario - 1];
      estado.yo.pases -= 1;
      const intento = { id: 77, escenario: body.escenario, estado: 'jugando', seed: SEMILLA, contrato: e.contrato, equipo: { staff: body.equipo.staff.map((p) => Object.assign({}, p, { morale: 80 })), equip: body.equipo.equip.map((x) => ({ type: x.type, condition: 90 })) },
        contexto: { fama: 35, dinero: 1000, stock: { cable: 1, battery: 1 } }, vip: false, incidente: 'tormenta', creado: iso(AHORA), expira: iso(AHORA + 1800e3) };
      estado.yo.intento_abierto = intento;
      return json({ ok: true, reanudado: false, intento, pases: estado.yo.pases });
    }
    if (u.pathname === '/api/festival/intento/enviar') {
      const n = estado.yo.intento_abierto.escenario;
      const e = estado.festival.escenarios[n - 1];
      const calidad = body.resultado ? body.resultado.quality : 70;
      const aporte = Math.min(calidad, e.meta - e.acumulado);
      e.acumulado += aporte; e.porcentaje = Math.floor((100 * e.acumulado) / e.meta);
      e.cubierto_por.unshift({ jugador_id: 1, nombre: 'Ana Producciones', aporte, puntos: calidad, intentos: 1, mejor: calidad, yo: true });
      estado.yo.intento_abierto = null;
      return json({ ok: true, resultado: { id: 77, escenario: n, estado: 'validado', calidad, estrellas: body.resultado ? body.resultado.stars : 3, aporte, valido: true, coincide: true, motivo: null }, estado });
    }
    return json({ ok: false, error: 'No encontrado.' }, 404);
  });

  await page.goto(BASE + '/', { waitUntil: 'load' });
  // Partida del jugador (para elegir el mejor personal y equipos) y el "juego" que juega el turno
  await page.evaluate(() => {
    const s = Game.newGame(7);
    s.rep = 52;
    s.staff = [{ id: 1, name: 'Ana', role: 'cam', skill: 4, owner: true, morale: 90 }, { id: 2, name: 'Luis', role: 'cam', skill: 3 }, { id: 3, name: 'Majo', role: 'dir', skill: 4 },
      { id: 4, name: 'Pepe', role: 'audio', skill: 3 }, { id: 5, name: 'Rita', role: 'stream', skill: 3 }, { id: 6, name: 'Gus', role: 'cam', skill: 2 }];
    s.equip = [{ id: 10, type: 'cam_pro', condition: 90 }, { id: 11, type: 'cam_pro', condition: 70 }, { id: 12, type: 'cam_cine', condition: 95 }, { id: 13, type: 'cam_basic', condition: 20 },
      { id: 14, type: 'switch_basic', condition: 80 }, { id: 15, type: 'switch_pro', condition: 80 }, { id: 16, type: 'audio_basic', condition: 80 }, { id: 17, type: 'mics', condition: 80 },
      { id: 18, type: 'router4g', condition: 80 }, { id: 19, type: 'raincover', condition: 80 }, { id: 20, type: 'dron4k', condition: 100 }];
    window.__toasts = []; window.__jugadas = [];
    window.__ctx = {
      A: window.Art, estado: () => s, toast: (t) => window.__toasts.push(t),
      jugarIntento: async (seed, contrato, intento) => {
        const r = Intento.jugar(Game, intento, (inc) => Math.max(0, inc.choices.findIndex((c) => c.ok)));
        window.__jugadas.push({ seed, contrato, decisiones: r.decisiones, resultado: r.resultado });
        return { decisiones: r.decisiones, resultado: r.resultado };
      },
    };
    return window.Festival.render(document.getElementById('fest'), window.__ctx);
  });
  await page.waitForSelector('.fest-esc');
  const noHScroll = async (tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(ov <= 1, `${tag}: sin desplazamiento horizontal (${ov}px)`);
  };

  console.log('Festival abierto');
  ok(await page.locator('.fest-esc').count() === 6, '6 tarjetas de escenario');
  ok(await page.locator('.fest-mapa [data-fest-ir]').count() === 6, '6 escenarios en el mapa del festival');
  ok(await page.locator('.fest-esc svg.scene').count() === 6, 'Cada escenario con su escena (Art.scene)');
  const g = pedidos.find((p) => p.ruta === '/api/festival');
  ok(!!g && g.m === 'GET' && g.cab['x-envivo'] === '1', 'GET /api/festival con la cabecera X-Envivo');
  const c1 = await page.locator('[data-fest-cuenta]').textContent();
  ok(/^\d\d:\d\d:\d\d$/.test(c1), 'Cuenta regresiva hh:mm:ss (' + c1 + ')');
  await page.waitForTimeout(1300);
  ok((await page.locator('[data-fest-cuenta]').textContent()) !== c1, 'La cuenta regresiva avanza');
  ok(/Tormenta sobre el predio/.test(await page.locator('.fest-top').textContent()), 'Imprevisto del festival visible (le pega a todos)');
  ok((await page.locator('#fest-esc-1 button').textContent()).includes('Cubierto') && await page.locator('#fest-esc-1 button').isDisabled(), 'Escenario completo: botón "Cubierto" desactivado');
  ok(/Lo cerró Beto Live/.test(await page.locator('#fest-esc-1').textContent()), 'Dice quién cerró el escenario');
  ok(/Beto Live/.test(await page.locator('#fest-esc-2 .fest-quienes').textContent()) && await page.locator('#fest-esc-2 .fest-quien.yo').count() === 1, 'Quién cubrió qué (y "Tú" resaltado)');
  ok(await page.locator('.fest-hito.ok').count() === 2, 'Hitos: 25 % y 50 % logrados');
  ok((await page.locator('[data-fest-pases]').textContent()) === '3' && await page.locator('.fest-ticket.on').count() === 3, 'Mis pases: 3');
  ok(/Ana Producciones \(Tú\)/.test(await page.locator('[data-fest="ranking"]').textContent()), 'Ranking de aporte personal con "Tú"');
  await noHScroll('festival');
  await page.screenshot({ path: path.join(outDir, 'festival.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'festival_arriba.png') });

  console.log('Comprar un pase');
  await page.click('[data-fest="comprar"]');
  await page.waitForFunction(() => document.querySelector('[data-fest-pases]').textContent === '4');
  const comp = pedidos.find((p) => p.ruta === '/api/festival/pases/comprar');
  ok(!!comp && comp.m === 'POST' && comp.body.cantidad === 1, 'POST /api/festival/pases/comprar {cantidad: 1}');
  ok(/4 pases/.test((await page.evaluate(() => window.__toasts)).join(' ')), 'Aviso de compra');

  console.log('Cubrir el escenario 3 (turno jugado de verdad con intento.js)');
  await page.locator('#fest-esc-3').scrollIntoViewIfNeeded();
  await page.click('#fest-esc-3 [data-fest="cubrir"]');
  await page.waitForSelector('[data-fest="ultimo"]');
  const ini = pedidos.find((p) => p.ruta === '/api/festival/intento/iniciar');
  const env = pedidos.find((p) => p.ruta === '/api/festival/intento/enviar');
  ok(!!ini && ini.body.escenario === 3, 'iniciar {escenario: 3}');
  const eq = ini.body.equipo;
  ok(eq.staff.length === 6 && eq.staff.filter((p) => p.owner).length === 1, 'Manda su personal (6, un dueño)');
  ok(!eq.equip.some((e) => e.type === 'cam_basic') && !eq.equip.some((e) => e.type === 'dron4k'), 'No manda equipo roto (20 %) ni exclusivos que no están en el inventario del servidor');
  ok(eq.equip.filter((e) => e.type.startsWith('switch')).map((e) => e.type).join() === 'switch_pro', 'Un solo switcher: el mejor');
  const jug = await page.evaluate(() => window.__jugadas);
  ok(jug.length === 1 && jug[0].seed === SEMILLA && jug[0].contrato.escenario === 3, 'ctx.jugarIntento(seed, contrato) recibe la semilla y el contrato del servidor');
  ok(!!env && env.body.intento_id === 77 && JSON.stringify(env.body.decisiones) === JSON.stringify(jug[0].decisiones), 'enviar {intento_id, decisiones} con las decisiones del juego');
  ok(env.body.resultado && env.body.resultado.quality === jug[0].resultado.quality, '…y el resultado que dice el juego (el servidor lo compara)');
  ok(Object.keys(env.body).sort().join() === 'decisiones,intento_id,resultado', 'No manda nada más (ni semilla, ni equipo, ni calidad propia)');
  const q3 = await page.locator('#fest-esc-3 .fest-q b').textContent();
  ok(q3.startsWith(String(Math.min(300, jug[0].resultado.quality))), 'El escenario 3 muestra lo que sumó (' + q3 + ')');
  ok(/Carpa Electrónica: calidad/.test(await page.locator('[data-fest="ultimo"]').textContent()), 'Tarjeta con el resultado del turno');
  await noHScroll('después del turno');

  console.log('Textos con I18N');
  await page.evaluate(() => {
    window.I18N = { idioma: 'en', T: Object.assign((k) => ({ 'festival.cubrir': 'Cover stage', 'festival.pases': 'Press passes' }[k]), { has: (k) => k === 'festival.cubrir' || k === 'festival.pases' }) };
    return window.Festival.render(document.getElementById('fest'), window.__ctx);
  });
  await page.waitForSelector('.fest-esc');
  ok((await page.locator('#fest-esc-3 [data-fest="cubrir"]').textContent()).includes('Cover stage'), 'I18N.T traduce festival.cubrir');
  ok(/Press passes/.test(await page.locator('[data-fest="pases"]').textContent()) && /Tarima Rock/.test(await page.locator('#fest-esc-2').textContent()), '…y lo que no está traducido sigue en español');
  await page.evaluate(() => { delete window.I18N; });

  console.log('Festival cerrado (descanso) y sin asociación');
  modo = 'cerrado';
  await page.evaluate(() => window.Festival.render(document.getElementById('fest'), window.__ctx));
  await page.waitForSelector('.fest-top');
  const top = await page.locator('.fest-top').textContent();
  ok(/El próximo abre en/.test(top) && /Descanso/.test(top), 'Cerrado: cuenta para el próximo festival');
  ok(/Último festival/.test(await page.locator('.fest').textContent()) && /81%/.test(await page.locator('.fest').textContent()), 'Resultado del último festival con mis premios');
  ok(await page.locator('.fest-esc').count() === 0, 'Sin escenarios mientras está cerrado');
  await noHScroll('cerrado');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(outDir, 'festival_cerrado.png'), fullPage: true });
  modo = 'sin';
  await page.evaluate(() => window.Festival.render(document.getElementById('fest'), window.__ctx));
  await page.waitForFunction(() => /Únete a una asociación/.test(document.querySelector('.fest').textContent));
  ok(true, 'Sin asociación: explica que hay que unirse');
  await page.evaluate(() => window.Festival.detener());

  ok(errores.length === 0, 'Sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
