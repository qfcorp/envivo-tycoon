/* Prueba de los PREMIOS POR CONSTANCIA de las misiones (para los F2P): js/misiones.js + server/src/Misiones.php.
   1. Misma tabla que el servidor (cofre de la semana, premio de la semana que rota, ruta del mes, exclusivo del mes).
   2. Lógica en Node sin cuenta: días activos (cofre de 60), cofre de la semana con 5 de 7 días, ruta del mes 7/14/21,
      dinero y materiales a la partida, nada de créditos ni exclusivo sin cuenta.
   3. Navegador 390x844 con la fecha fija window.__ENVIVO_FECHA = '2026-06-10':
      - el juego entero sin servidor: la pizarra de Misiones de la sede (js/hub.js) muestra el bloque con barras de avance,
        el "!" de la pizarra cuando hay un premio por constancia para abrir, abrirlo con el botón, nada se sale de lado;
      - una página con servidor FALSO y cuenta: días activos de otro celular, POST periodo "s:2026-06-08" clave
        "constancia" y "m:2026-06" clave "mes7", premio de la semana en el aviso, alReclamar para el VIP / inventario.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_misiones_f2p.js   (capturas en tests/capturas/misiones_f2p_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v);
const igual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const FECHA = '2026-06-10';   // miércoles; lunes 2026-06-08

globalThis.__ENVIVO_FECHA = FECHA;
const Mi = require(path.join(RAIZ, 'js', 'misiones.js'));

/* ---------- 1. Igual que el servidor ---------- */
console.log('Misma tabla que server/src/Misiones.php');
let php = null;
try {
  php = JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(path.join(RAIZ, 'server/src/Misiones.php'))};
    use EnVivo\\Misiones; $s = []; $m = [];
    for ($k = 0; $k < 40; $k++) { $l = gmdate('Y-m-d', gmmktime(12, 0, 0, 1, 5, 2026) + 7 * 86400 * $k); $s[$l] = Misiones::premioSemana($l); }
    for ($k = 0; $k < 30; $k++) { $f = sprintf('%04d-%02d', 2026 + intdiv($k, 12), $k % 12 + 1); $m[$f] = Misiones::exclusivoMes($f); }
    echo json_encode(['constancia' => Misiones::CONSTANCIA, 'ps' => Misiones::PREMIOS_SEMANA, 'mes' => Misiones::MES, 'ex' => Misiones::EXCLUSIVOS_MES,
      'activo' => Misiones::DIA_ACTIVO, 'tope' => Misiones::CREDITOS_SEMANA, 'semanas' => $s, 'meses' => $m]);`], { encoding: 'utf8' }));
} catch (e) { ok(false, 'php no corrió: ' + e.message); }
if (php) {
  ok(igual(php.constancia, Mi.CONSTANCIA), 'Cofre de la semana: misma meta y premio');
  ok(igual(php.ps, Mi.PREMIOS_SEMANA) && Object.keys(php.ps).join() === Object.keys(Mi.PREMIOS_SEMANA).join(), 'Premio de la semana: mismos premios y mismo orden');
  ok(igual(php.mes, Mi.MES), 'Ruta del mes: mismos hitos y premios');
  ok(igual(php.ex, Mi.EXCLUSIVOS_MES) && php.activo === Mi.DIA_ACTIVO && php.tope === Mi.CREDITOS_SEMANA, 'Mismos exclusivos, día activo (cofre60) y tope semanal');
  const malS = Object.keys(php.semanas).filter((l) => php.semanas[l] !== Mi.premioSemana(l));
  ok(!malS.length, 'Mismo premio de la semana en 40 semanas' + (malS.length ? ' (distinto en ' + malS.slice(0, 3).join(',') + ')' : ''));
  const malM = Object.keys(php.meses).filter((f) => php.meses[f] !== Mi.exclusivoMes(f));
  ok(!malM.length, 'Mismo exclusivo del mes en 30 meses');
}
ok(Mi.CONSTANCIA.premio.creditos * 4.3 + Mi.MES[7].creditos + Mi.MES[14].creditos < 250, 'Créditos extra por constancia en un mes: menos que el paquete más barato (250)');
ok(Object.keys(Mi.TX).filter((k) => /^f\.|^ex\./.test(k)).every((k) => typeof Mi.TX[k] === 'string' && Mi.TX[k].length) && Mi.EXCLUSIVOS_MES.every((x) => Mi.TX['ex.' + x]), 'Textos en español para todo (y el nombre de cada exclusivo)');

/* ---------- 2. Lógica sin cuenta ---------- */
(async () => {
  console.log('Lógica sin cuenta (Node)');
  const toasts = [];
  const s = { day: 9, money: 1000, stock: { cable: 0, battery: 0 }, sede: { nivel: 2, mejoras: {}, materiales: { cables: 0, placas: 0, paneles: 0, credenciales: 0, planos: 0, chips: 0 } } };
  const ctx = { S: () => s, save: () => {}, toast: (x) => toasts.push(x), render: () => {}, M: (n) => '$' + n };
  Mi.tarjeta(ctx);
  let m = Mi.asegurar(s);
  ok(m.h && typeof m.h === 'object' && m.mes && m.mes.p === '2026-06', 'Partida: s.misiones.h (días activos) y la ruta del mes de junio');
  ok(Mi.premioSemana(m.w.p) === 'estrella' && Mi.exclusivoMes('2026-06') === 'ex_wireless', 'Semana del 8 de junio: personal estrella; junio: video inalámbrico Oro');
  // Abrir el cofre 60 de hoy marca el día activo
  m.d.r = {}; ['a', 'b', 'c'].forEach((k, i) => { m.d.r[m.d.ids[i]] = 1; });
  let r = await Mi.reclamar('d', 'cofre60');
  ok(r.ok && m.h[FECHA] === 1 && Mi.activosSemana(m) === 1, 'Abrir el cofre de 60 marca hoy como día activo (1 de 5)');
  r = await Mi.reclamar('s', 'constancia');
  ok(!r.ok && r.motivo === 'no_listo' && /Todavía te faltan días/.test(toasts.slice(-1)[0]), 'Con 1 día el cofre de la semana no abre');
  ['2026-06-08', '2026-06-09', '2026-06-11'].forEach((f) => { m.h[f] = 1; });
  m.h['2026-06-07'] = 1;   // domingo de la semana anterior: no cuenta en esta
  ok(Mi.activosSemana(m) === 4, 'Solo cuentan los días de esta semana (4)');
  m.h['2026-06-12'] = 1;
  const din0 = s.money, cab0 = s.sede.materiales.cables;
  r = await Mi.reclamar('s', 'constancia');
  ok(r.ok && s.money === din0 + 2000 && s.sede.materiales.cables === cab0 + 10 && s.sede.materiales.chips === 1, 'Cofre de la semana sin cuenta: $2.000 y materiales a la sede local');
  ok(!/créditos/.test(r.txt) && !(s.creditos > 0), 'Sin cuenta no hay créditos');
  ok(/Cofre de la semana/.test(toasts.slice(-1)[0]), 'Aviso "¡Cofre de la semana!"');
  r = await Mi.reclamar('s', 'constancia');
  ok(!r.ok && r.motivo === 'ya', 'Una vez por semana');
  // Ruta del mes
  for (let d = 1; d <= 21; d++) m.h['2026-06-' + String(d).padStart(2, '0')] = 1;
  ok(Mi.activosMes(m) === 21, '21 días activos en junio');
  const d1 = s.money;
  for (const h of [7, 14, 21]) { r = await Mi.reclamar('m', 'mes' + h); if (!r.ok) ok(false, 'mes' + h + ': ' + r.motivo); }
  ok(s.money === d1 + 1500 + 2500 + 3000 && s.sede.materiales.planos === 8 && s.sede.materiales.paneles === 10 + 12, 'Ruta del mes sin cuenta: dinero y materiales de los 3 hitos');
  ok(m.mes.r.mes7 && m.mes.r.mes14 && m.mes.r.mes21, 'Los 3 hitos quedan marcados');
  // Cambio de semana y de mes
  globalThis.__ENVIVO_FECHA = '2026-07-01';
  m = Mi.asegurar(s);
  ok(m.mes.p === '2026-07' && !Object.keys(m.mes.r).length && Mi.activosMes(m) === 0, 'Mes nuevo: ruta en cero (los días de junio no cuentan)');
  ok(m.w.p === '2026-06-29' && !m.w.r.constancia, 'Semana nueva: el cofre de la semana vuelve a empezar');
  globalThis.__ENVIVO_FECHA = '2026-09-15';
  m = Mi.asegurar(s);
  ok(!Object.keys(m.h).some((f) => f < '2026-07-15'), 'Los días activos viejos (más de 62 días) se borran');
  globalThis.__ENVIVO_FECHA = FECHA;
  const viejo = { misiones: { v: 1, d: null, w: null, b: {} } };
  ok(!!Mi.asegurar(viejo).mes && typeof viejo.misiones.h === 'object', 'Partida guardada antes de esto: se completa sola');
  await navegador();
})().catch((e) => { ok(false, 'error: ' + (e && e.stack || e)); terminar(); });

/* ---------- 3. Navegador ---------- */
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const { verEnInicio } = require('./hub_ayuda');
const BASE = 'http://misionesf2p.prueba';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function servir(c) {
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await c.route(BASE + '/**', (route) => {
    const u = new URL(route.request().url());
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(RAIZ, rel);
    if (rel.startsWith('api/') || !f.startsWith(RAIZ + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
}
async function sinDesborde(page, tag) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('[data-mis="f2p"] *')].filter((n) => { const b = n.getBoundingClientRect(); return b.width && (b.right > w + 1 || b.left < -1); })
      .map((n) => n.tagName + '.' + String(n.className) + ' «' + (n.textContent || '').slice(0, 30) + '»').slice(0, 3);
    return { doc: document.documentElement.scrollWidth - w, fuera };
  });
  ok(r.doc <= 1 && !r.fuera.length, `${tag}: nada se sale de lado (${r.doc}px${r.fuera.length ? ', se sale: ' + r.fuera.join(' | ') : ''})`);
}
async function navegador() {
  if (!chromium) { ok(false, 'Falta playwright (NODE_PATH=/opt/npm-tools/node_modules)'); return terminar(); }
  const out = path.join(__dirname, 'capturas');
  fs.mkdirSync(out, { recursive: true });
  const cap = (n) => path.join(out, 'misiones_f2p_' + n + '.png');
  const browser = await chromium.launch();
  try {
    await juegoSinCuenta(browser, cap);
    await conCuenta(browser, cap);
  } finally { await browser.close(); }
  terminar();
}

async function juegoSinCuenta(browser, cap) {
  console.log('Navegador: el juego entero sin servidor (390x844, fecha 2026-06-10)');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
  await servir(ctx);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (x) => { if (x.type() === 'error' && !/fonts\.g|ERR_/.test(x.text())) errores.push('console: ' + x.text()); });
  await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#overlay.on');
  await page.locator('[data-act="close"]').first().click();
  ok(await verEnInicio(page, '[data-mis="f2p"]', 10000), 'La pizarra de Misiones de la sede trae "Premios por constancia"');
  const tx = (await page.locator('[data-mis="f2p"]').textContent()).replace(/\s+/g, ' ');
  ok(/Premios por constancia/.test(tx) && /Cofre de la semana/.test(tx) && /Ruta de junio/.test(tx), 'Título, cofre de la semana y "Ruta de junio"');
  ok(/0\/5 días/.test(tx) && /0\/21 días/.test(tx) && /Faltan 5 días/.test(tx), 'Barras en cero: 0/5 días y 0/21 días');
  ok(/Personal estrella de la semana \(2 partidos\)/.test(tx) && /Video inalámbrico Oro/.test(tx) && /con cuenta/.test(tx), 'Muestra el premio de la semana y el exclusivo del mes (con candado: con cuenta)');
  ok(/25 créditos con cuenta/.test(tx) && /Un día cuenta cuando abres el cofre de 60/.test(tx), 'Créditos con candado y la regla del día activo');
  ok(await page.locator('[data-mis="mes"] .mis-hito').count() === 3, '3 hitos del mes (7, 14 y 21 días)');
  await page.locator('[data-mis="f2p"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: cap('inicio') });
  await sinDesborde(page, 'Sin cuenta 390');
  // 5 días activos esta semana y 7 en el mes -> botones "Abrir" y el "!" de la pizarra
  await page.evaluate(() => {
    const m = window.Misiones.asegurar(window.__game.state);
    ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11'].forEach((f) => { m.h[f] = 1; });
  });
  await page.locator('nav button[data-tab="bodega"]').click();
  await page.locator('nav button[data-tab="inicio"]').click();
  await verEnInicio(page, '[data-mis="f2p"]');
  ok(await page.locator('[data-mis="f2p"] .btn.green').count() === 0, 'Con 4 días activos todavía no hay nada para abrir');
  await page.locator('nav button[data-tab="bodega"]').click();
  await page.locator('nav button[data-tab="inicio"]').click();
  await page.evaluate(() => { const m = window.Misiones.asegurar(window.__game.state); ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-12'].forEach((f) => { m.h[f] = 1; }); });
  await page.locator('nav button[data-tab="bodega"]').click();
  await page.locator('nav button[data-tab="inicio"]').click();
  const pide2 = await page.evaluate(() => { const b = document.querySelector('.hs[data-hub="misiones"]'); return (b.querySelector('.hs-b') || {}).textContent; });
  await verEnInicio(page, '[data-mis="f2p"]');
  ok(pide2 === '!' && await page.locator('[data-mis="f2p"] .btn.green').count() === 2, 'Con 5 días (y 8 en el mes): 2 botones "Abrir" y la pizarra de Misiones avisa "!"');
  const t2 = (await page.locator('[data-mis="f2p"]').textContent()).replace(/\s+/g, ' ');
  ok(/5\/5 días/.test(t2) && /8\/21 días/.test(t2), 'Barras: 5/5 días y 8/21 días');
  const din0 = await page.evaluate(() => window.__game.state.money);
  await page.locator('[data-mis="constancia"] [data-acc="constancia"]').click();
  await page.waitForFunction(() => window.__game.state.misiones.w.r.constancia === 1);
  ok(await page.evaluate(() => window.__game.state.money) === din0 + 2000, 'Botón "Abrir": +$2.000 en la partida');
  await page.locator('[data-mis="mes"] [data-acc="mes"][data-k="mes7"]').click();
  await page.waitForFunction(() => window.__game.state.misiones.mes.r.mes7 === 1);
  ok(await page.evaluate(() => window.__game.state.money) === din0 + 3500, 'Hito de 7 días: +$1.500');
  const t3 = (await page.locator('[data-mis="f2p"]').textContent()).replace(/\s+/g, ' ');
  ok((t3.match(/✓ Abierto/g) || []).length === 2 && /Faltan 6 días/.test(t3), 'Quedan "✓ Abierto" y "Faltan 6 días" para el de 14');
  await page.locator('[data-mis="f2p"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: cap('abierto') });
  await sinDesborde(page, 'Abierto 390');
  await page.setViewportSize({ width: 360, height: 780 });
  await verEnInicio(page, '[data-mis="f2p"]');
  await sinDesborde(page, '360');
  ok(!errores.length, 'Sin errores de JS' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

async function conCuenta(browser, cap) {
  console.log('Navegador: con cuenta y servidor FALSO (390x844)');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const estilos = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (x) => { if (x.type() === 'error' && !/fonts\.g|ERR_|status of (409|503)/.test(x.text())) errores.push('console: ' + x.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const dias = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11'];
  const srv = { pedidos: [], reclamados: { 'd:2026-06-10': ['cofre60'] }, creditos: 100, dias: dias.slice(0, 7) };
  await page.route('http://cuentaf2p.prueba/**', async (r) => {
    const u = new URL(r.request().url());
    const json = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilos}</head>
      <body><main class="gut" style="padding-top:12px"><div id="ini"></div></main><div class="toast" id="toast"></div><script src="/js/misiones.js"></script></body></html>` });
    if (u.pathname === '/js/misiones.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(RAIZ, 'js/misiones.js'), 'utf8') });
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : undefined;
    srv.pedidos.push({ m: r.request().method(), ruta: u.pathname, body });
    if (u.pathname === '/api/misiones' && r.request().method() === 'GET') {
      return json({ ok: true, hoy: '2026-06-10', lunes: '2026-06-08', reclamados: srv.reclamados, dia: [], semana: [], creditos_hoy: 3, creditos_tope: 10, xp_pase: true,
        creditos_semana: 9, creditos_semana_tope: 120, constancia: { dias: srv.dias, semana: { lunes: '2026-06-08', activos: 3, meta: 5, premio: 'estrella' }, mes: { mes: '2026-06', activos: 7, exclusivo: 'ex_wireless' } } });
    }
    if (u.pathname === '/api/misiones/reclamar') {
      if (body.clave === 'constancia' && srv.dias.filter((f) => f >= '2026-06-08').length < 5) return json({ ok: false, error: 'Todavía no completas los días que pide ese premio (3 de 5).', codigo: 'no_disponible' }, 409);
      (srv.reclamados[body.periodo] = srv.reclamados[body.periodo] || []).push(body.clave);
      const c = body.clave === 'constancia' ? 25 : body.clave === 'mes7' ? 20 : 0;
      srv.creditos += c;
      return json({ ok: true, periodo: body.periodo, clave: body.clave, premio: {}, creditos_dados: c, entregas: [{ id: 900 + srv.pedidos.length, tipo: 'materiales', item: 'cables', cantidad: 10 }], equipos: [],
        extra: body.clave === 'constancia' ? { tipo: 'estrella', dado: true, partidos: 2 } : null, xp_pase: 0, tope_alcanzado: false, creditos: srv.creditos, creditos_hoy: 3, creditos_tope: 10, creditos_semana: 9 + c, creditos_semana_tope: 120 });
    }
    return json({ ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }, 404);
  });
  await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; });
  await page.goto('http://cuentaf2p.prueba/', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__toasts = []; window.__reclamos = 0;
    window.Api = { disponible: true, logueado: () => true, estado: { creditos: 100, logueado: true, jugador: { id: 7 } } };
    window.__s = { day: 4, money: 1000, stock: { cable: 0, battery: 0 }, sede: { nivel: 3, mejoras: {}, materiales: { cables: 0, placas: 0, paneles: 0, credenciales: 0, planos: 0, chips: 0 }, obras: [], oficial: { cuenta: '7' } } };
    const ini = document.getElementById('ini');
    const mod = () => window.EnVivoInicio.find((x) => x.id === 'misiones');
    window.__ctx = { S: () => window.__s, save: () => {}, M: (n) => '$' + Number(n).toLocaleString('es-EC'),
      toast: (t) => { window.__toasts.push(t); const el = document.getElementById('toast'); el.textContent = t; el.style.display = 'block'; },
      render: () => { ini.innerHTML = mod().tarjeta(window.__ctx); }, alReclamar: () => { window.__reclamos++; }, snd: { play: () => {} } };
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-ext][data-acc]'); if (b) { const m = window.EnVivoInicio.find((x) => x.id === b.dataset.ext); if (m) m.clic(window.__ctx, b.dataset.acc, b); } });
    window.__ctx.render();
  });
  await page.waitForFunction(() => window.__s.misiones && window.__s.misiones.h['2026-06-01'] === 1);
  ok(true, 'Con cuenta: los días activos del servidor (otro celular) llegan a la partida');
  const tx = (await page.locator('[data-mis="f2p"]').textContent()).replace(/\s+/g, ' ');
  ok(/3\/5 días/.test(tx) && /7\/21 días/.test(tx) && /25 créditos/.test(tx) && !/con cuenta/.test(tx), 'Con cuenta: 3/5 y 7/21 días, créditos sin candado');
  ok(/⭐ Premio de la semana: Personal estrella/.test(tx) && /Equipo exclusivo del mes: Video inalámbrico Oro/.test(tx), 'Premio de la semana y exclusivo del mes, sin candado');
  // Hito de 7 días
  await page.locator('[data-acc="mes"][data-k="mes7"]').click();
  await page.waitForFunction(() => window.__s.misiones.mes.r.mes7 === 1);
  const p1 = srv.pedidos.filter((p) => p.ruta === '/api/misiones/reclamar').pop();
  ok(p1 && p1.body.periodo === 'm:2026-06' && p1.body.clave === 'mes7', 'POST {periodo: "m:2026-06", clave: "mes7"}');
  ok(await page.evaluate(() => window.Api.estado.creditos) === 120 && /20 créditos/.test(await page.evaluate(() => window.__toasts.slice(-1)[0])), 'Hito de 7 días: +20 créditos al saldo y en el aviso');
  ok(await page.evaluate(() => window.__s.money) === 2500, 'Y el dinero del juego en la partida (+$1.500)');
  // Cofre de la semana: el celular cree que hay 5, el servidor dice 3 -> no_disponible y se vuelve a pedir el estado
  await page.evaluate(() => { const m = window.__s.misiones; m.h['2026-06-12'] = 1; m.h['2026-06-13'] = 1; window.__ctx.render(); });
  await page.locator('[data-acc="constancia"]').click();
  await page.waitForFunction(() => /Todavía te faltan días/.test(window.__toasts.slice(-1)[0] || ''));
  ok(await page.evaluate(() => !window.__s.misiones.w.r.constancia), 'Servidor: faltan días (409 no_disponible) → no se marca');
  srv.dias = dias;   // ahora sí: 4 días de la semana + hoy
  srv.dias.push('2026-06-12');
  await page.locator('[data-acc="constancia"]').click();
  await page.waitForFunction(() => window.__s.misiones.w.r.constancia === 1);
  const p2 = srv.pedidos.filter((p) => p.ruta === '/api/misiones/reclamar').pop();
  ok(p2 && p2.body.periodo === 's:2026-06-08' && p2.body.clave === 'constancia', 'POST {periodo: "s:2026-06-08", clave: "constancia"}');
  const av = await page.evaluate(() => window.__toasts.slice(-1)[0]);
  ok(/Cofre de la semana/.test(av) && /25 créditos/.test(av) && /Personal estrella de la semana/.test(av), 'Aviso con créditos y el premio de la semana (' + av + ')');
  ok(await page.evaluate(() => window.__reclamos) >= 2, 'Entregas / premio especial → ctx.alReclamar()');
  ok(await page.evaluate(() => window.__s.sede.materiales.cables) === 0, 'Con cuenta los materiales NO se suman a mano');
  await page.locator('[data-mis="f2p"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: cap('cuenta') });
  await sinDesborde(page, 'Con cuenta 390');
  ok(!errores.length, 'Sin errores de JS' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

function terminar() {
  console.log(fallas ? `\n✘ ${fallas} fallas` : '\n✔ Premios por constancia OK (capturas en tests/capturas/misiones_f2p_*.png)');
  process.exit(fallas ? 1 : 0);
}
