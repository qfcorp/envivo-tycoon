/* Prueba en un celular simulado (390x844) del Duelo de Productoras y del Desafío Técnico del Día (js/duelos.js, js/desafio.js).
   - La página carga las reglas de verdad (js/datos.js si existe, js/logic.js, js/art.js, js/premium.js) y el motor del validador
     (server/validador/intento.js) con los estilos de index.html.
   - window.fetch está FALSO: responde desde Node (page.exposeFunction). Para que la prueba sea de verdad, Node arma los intentos
     con las mismas funciones del servidor (php: Duelos::armarIntento, Desafio::armar), juega el fantasma con
     server/eventos/motor.js y REPITE cada jugada del navegador en server/validador/validador.js: tiene que coincidir.
   - Revisa: sin errores de consola, sin desplazamiento horizontal, textos con I18N, entregas de fama.
   - Capturas: tests/capturas/duelos.png, duelos_equipo.png, duelos_vivo.png, duelos_resultado.png,
               desafio.png, desafio_vivo.png, desafio_resultado.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_duelos_desafio.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const V = require(path.join(RAIZ, 'server/validador/validador.js'));
const M = require(path.join(RAIZ, 'server/eventos/motor.js'));
const out = path.join(__dirname, 'capturas');
fs.mkdirSync(out, { recursive: true });

let fallas = 0, bien = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (c) bien++; else fallas++; };

/* ---------- Funciones puras del servidor (PHP) para armar los intentos igual que en producción ---------- */
function php(codigo, entrada) {
  const r = execFileSync('php', ['-r', `require ${JSON.stringify(path.join(RAIZ, 'server/src/arranque.php'))}; $in = json_decode(stream_get_contents(STDIN), true); ${codigo}`],
    { input: JSON.stringify(entrada || {}), env: Object.assign({}, process.env, { ENVIVO_CONFIG: '/nonexistent' }) });
  return JSON.parse(String(r));
}
const HOY = php("echo json_encode(date('Y-m-d'));");
const SERV = php(`$m = EnVivo\\Desafio::modificadorDe($in['dia']); $c = $m['contrato']; $cl = EnVivo\\Desafio::CLIENTES[$c['type']]; $c['client'] = $cl[crc32('desafio|' . $in['dia']) % count($cl)]; $c['rival'] = false;
  echo json_encode(['tablero' => EnVivo\\Duelos::tablero(1), 'mod' => $m, 'maleta' => EnVivo\\Desafio::maleta($m), 'contrato' => $c, 'contexto' => EnVivo\\Duelos::CONTEXTO,
    'premios_e' => EnVivo\\Desafio::PREMIO_ESTRELLAS, 'premios_p' => EnVivo\\Desafio::PREMIO_PUESTO,
    'kit' => array_map(fn($k) => [$k[0], $k[1], EnVivo\\Duelos::EQUIPOS[$k[0]][2]], EnVivo\\Duelos::KIT)]);`, { dia: HOY });
const armarDuelo = (equipo, contrato, seed, vip) => php("echo json_encode(EnVivo\\Duelos::armarIntento($in['e'], $in['c'], $in['s'], $in['v'], null));", { e: equipo, c: contrato, s: seed, v: vip });
const armarDesafio = (sel) => php("echo json_encode(EnVivo\\Desafio::armar(['dia' => $in['dia'], 'contrato_json' => json_encode($in['c'])], $in['sel']));", { dia: HOY, c: SERV.contrato, sel });

/* ---------- El servidor falso ---------- */
const rivalEquipo = { personal: [{ rol: 'camarografo', habilidad: 3, nivel: 'senior', dueno: true }, { rol: 'camarografo', habilidad: 2, nivel: 'semi_senior', dueno: false },
  { rol: 'director', habilidad: 3, nivel: 'senior', dueno: false }, { rol: 'sonidista', habilidad: 2, nivel: 'junior', dueno: false },
  { rol: 'tecnico_transmision', habilidad: 2, nivel: 'junior', dueno: false }, { rol: 'productor', habilidad: 2, nivel: 'junior', dueno: false }],
  inventario: [{ id: 91, item: 'grua', serie: 12 }] };
const estadoSrv = { equipo: null, cupos: { gratis: 5, usados: 1, extra: 0, extra_max: 5, precio_extra: 20, restantes: 4, vip: false }, duelo: null, desafio: null,
  posts: [], validaciones: [], historial: [] };
function resumenDuelos() {
  const rival = (id, nombre, rating, liga, poder, siglas) => ({ id, nombre, fama: 40, vip: id === 21, siglas, color: '#ff3b3b', rating, liga, poder, retos_hoy: id === 23 ? 3 : 0,
    equipo: { camaras: ['Cámara en grúa telescópica', 'Cámara profesional'], personas: 6 } });
  return {
    ok: true, temporada: { id: HOY.slice(0, 7), nombre: 'Temporada Octubre 2026', termina: HOY + 'T23:59:59-05:00' },
    rating: { rating: 1084, liga: 'Bronce', mejor: 1100, ganados: 7, perdidos: 4, empates: 0, defensas_ganadas: 3, defensas_perdidas: 2, racha: 2, puesto: 4 },
    cupos: estadoSrv.cupos, equipo: estadoSrv.equipo,
    kit: SERV.kit.map(([item, cantidad, nombre]) => ({ item, cantidad, nombre, estado: 85 })),
    inventario_elegible: [{ id: 77, item: 'dron4k', serie: 7, nombre: 'Dron 4K', vip: false }, { id: 78, item: 'vip_cam8k', serie: 1, nombre: 'Cámara de cine 8K Edición VIP', vip: true }],
    tope_habilidad: 4, contratos: SERV.tablero,
    rivales: [rival(21, 'TeleAndes Producciones', 1102, 'Plata', 214, 'QFP'), rival(22, 'Señal Norte', 1060, 'Bronce', 188, null), rival(23, 'Estudio Pichincha Live', 1015, 'Bronce', 160, 'EPL')],
    abierto: null, historial: estadoSrv.historial, defensas_nuevas: 1,
    ranking: [{ puesto: 1, nombre: 'MegaCanal 7', rating: 1240, liga: 'Plata' }, { puesto: 2, nombre: 'TeleAndes Producciones', rating: 1102, liga: 'Plata' },
      { puesto: 3, nombre: 'Señal Norte', rating: 1090, liga: 'Bronce' }, { puesto: 4, nombre: 'Productora Alfa', rating: 1084, liga: 'Bronce', yo: true }],
    reglas: { minutos: 20, max_par_dia: 3, fama_tope_dia: 10, politica: 'prudente' },
  };
}
function resumenDesafio() {
  const m = SERV.mod;
  return {
    ok: true, dia: HOY, modificador: { clave: m.clave, nombre: m.nombre, detalle: m.detalle, icono: m.icono, dia_semana: m.dia_semana, requeridos: m.requeridos },
    contrato: SERV.contrato, contexto: { fama: m.fama }, maleta: SERV.maleta,
    intentos: { usados: estadoSrv.desafio ? 1 : 0, max: 1, restantes: estadoSrv.desafio ? 0 : 1 }, abierto: null,
    mi_mejor: null, ranking: [{ puesto: 1, jugador_id: 30, nombre: 'Señal Norte', calidad: 71, estrellas: 4 }, { puesto: 2, jugador_id: 31, nombre: 'TeleAndes Producciones', calidad: 64, estrellas: 3 }],
    participantes: 2, premios: { por_estrellas: SERV.premios_e, por_puesto: SERV.premios_p, minimo_participantes: 3 }, pases_prensa: 3,
    cierra: HOY + 'T23:59:59-05:00', ayer: { puesto: 2, dinero: 2000, pases: 4, baterias: 2 },
    semana: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, dia: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][n - 1], clave: '', nombre: '',
      icono: ['rain', 'cam_basic', 'wifi_off', 'megaphone', 'bolt', 'final', 'sparkle'][n - 1], hoy: n === m.n })), minutos: 30,
  };
}
function api(method, ruta, body) {
  const p = ruta.split('?')[0];
  if (method === 'POST') estadoSrv.posts.push({ ruta: p, body });
  if (p === '/api/duelos' && method === 'GET') return [200, resumenDuelos()];
  if (p === '/api/duelos/equipo' && method === 'POST') {
    estadoSrv.equipo = { personal: body.personal, inventario: (body.inventario || []).map((id) => ({ id, item: id === 77 ? 'dron4k' : 'vip_cam8k', serie: 7 })),
      resumen: { camaras: ['Dron 4K', 'Cámara profesional'], personas: body.personal.length }, poder: 230, actualizado: HOY };
    return [200, { ok: true, equipo: estadoSrv.equipo }];
  }
  if (p === '/api/duelos/retar' && method === 'POST') {
    const ct = SERV.tablero.find((x) => x.nivel === body.nivel).contrato;
    const seed = 1 + Math.floor(Math.random() * 2147483000);
    const yo = armarDuelo(estadoSrv.equipo, ct, seed, false), el = armarDuelo(rivalEquipo, ct, seed, true);
    const f = M.fantasma(el, 'prudente', true);
    if (!f.ok) return [503, { ok: false, error: 'fantasma: ' + f.motivo }];
    yo.contrato = f.contrato;
    estadoSrv.duelo = { id: 501, intento: Object.assign({}, yo, { duelo_id: 501 }), fantasma: f, rival_id: body.rival_id };
    estadoSrv.cupos.usados++; estadoSrv.cupos.restantes--;
    return [200, { ok: true, duelo: { id: 501, estado: 'abierto' }, intento: estadoSrv.duelo.intento, cupos: estadoSrv.cupos, rival: { id: body.rival_id } }];
  }
  if (p === '/api/duelos/jugar' && method === 'POST') {
    const d = estadoSrv.duelo;
    const r = V.validate(Object.assign({}, d.intento, { decisiones: body.decisiones, cliente_resultado: body.resultado }));
    estadoSrv.validaciones.push({ tipo: 'duelo', r });
    const cq = r.calidad, fq = d.fantasma.calidad;
    const gane = cq > fq, empate = cq === fq;
    const duelo = { id: 501, rol: 'retador', estado: 'cerrado', nivel: 'dificil', rival: { id: d.rival_id, nombre: 'TeleAndes Producciones' },
      contrato: d.intento.contrato, ganador: gane ? 'retador' : empate ? 'empate' : 'defensor', gane: empate ? null : gane, empate,
      calidad_mia: cq, calidad_rival: fq, estrellas_mia: r.estrellas, estrellas_rival: d.fantasma.estrellas, cambio: gane ? 17 : empate ? 1 : -15, fama: gane ? 3 : 0, motivo: null };
    estadoSrv.historial.unshift(duelo);
    return [200, { ok: true, duelo, detalle: { retador: r.detalle.incidentes, defensor: d.fantasma.incidentes }, rating: { rating: 1084 + duelo.cambio, liga: 'Bronce' }, cupos: estadoSrv.cupos }];
  }
  if (p === '/api/duelos/extra' && method === 'POST') { estadoSrv.cupos.extra++; estadoSrv.cupos.restantes++; return [200, { ok: true, creditos: 230, cupos: estadoSrv.cupos }]; }
  if (p === '/api/desafio' && method === 'GET') return [200, resumenDesafio()];
  if (p === '/api/desafio/empezar' && method === 'POST') {
    const a = armarDesafio(body);
    const s = M.semilla(a.intento, 123456789, a.requeridos, 4000);
    estadoSrv.desafio = { intento: Object.assign({ seed: s.seed }, a.intento, { intento_id: 801 }), semilla: s };
    return [200, { ok: true, intento: estadoSrv.desafio.intento, intento_id: 801, vence: HOY, intentos: { usados: 1, max: 1, restantes: 0 } }];
  }
  if (p === '/api/desafio/terminar' && method === 'POST') {
    const d = estadoSrv.desafio;
    const r = V.validate(Object.assign({}, d.intento, { decisiones: body.decisiones, cliente_resultado: body.resultado }));
    estadoSrv.validaciones.push({ tipo: 'desafio', r });
    const pr = SERV.premios_e[r.estrellas] || [1, 0, 150, 0];
    const rk = [{ nombre: 'Productora Alfa', calidad: r.calidad, estrellas: r.estrellas }, { nombre: 'Señal Norte', calidad: 71, estrellas: 4 }, { nombre: 'TeleAndes Producciones', calidad: 64, estrellas: 3 }]
      .sort((a, b) => b.calidad - a.calidad).map((x, i) => Object.assign({ puesto: i + 1 }, x));
    return [200, { ok: true, resultado: { estado: r.valido ? 'valido' : 'invalido', calidad: r.calidad, estrellas: r.estrellas, incidentes: r.detalle.incidentes },
      premio: { estrellas: r.estrellas, cables: pr[0], baterias: pr[1], dinero: pr[2], pases: pr[3], nuevo: true }, puesto: rk.find((x) => x.nombre === 'Productora Alfa').puesto,
      ranking: rk, pases_prensa: 3 + pr[3] }];
  }
  return [404, { ok: false, error: 'No encontrado: ' + method + ' ' + p }];
}

/* ---------- La página ---------- */
function paginaHtml() {
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const estilos = (idx.match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
  const js = ['js/datos.js', 'js/logic.js', 'js/art.js', 'js/premium.js'].filter((f) => fs.existsSync(path.join(RAIZ, f)));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${estilos}
    <style>#ask{position:fixed;inset:0;background:#000a;display:none;align-items:flex-end;z-index:40}#ask.on{display:flex}#ask .modal{background:var(--panel);width:100%;padding:18px 16px;border-radius:18px 18px 0 0}</style></head>
    <body><header class="gut"><div class="brand">EN VIVO <b style="color:var(--red)">Tycoon</b></div></header><main class="gut"><div id="cont"></div></main>
    <div id="ask"><div class="modal"><p id="ask-txt"></p><button class="btn main" id="ask-si"></button><button class="btn" id="ask-no">No</button></div></div><div id="toasts" hidden></div>
    ${js.map((f) => `<script src="/${f}"></script>`).join('')}<script src="/js/intento.js"></script><script src="/js/duelos.js"></script><script src="/js/desafio.js"></script></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-EC' });
  const page = await ctxB.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const BASE = 'http://juego.prueba';
  await page.route(BASE + '/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: paginaHtml() });
    // js/intento.js = el mismo archivo del validador (en el servidor se sirve como copia o enlace; ver INTEGRAR_DUELOS_DESAFIO.md)
    const f = u.pathname === '/js/intento.js' ? path.join(RAIZ, 'server/validador/intento.js') : path.join(RAIZ, u.pathname);
    if (/^\/js\/[\w.-]+\.js$/.test(u.pathname) && fs.existsSync(f)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) });
    if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"la red real no se usa: fetch debe estar falso"}' });
    return r.fulfill({ status: 404, body: '' });
  });
  await page.exposeFunction('__api', (method, ruta, body) => { try { return api(method, ruta, body ? JSON.parse(body) : null); } catch (e) { return [500, { ok: false, error: String(e.message) }]; } });
  // fetch FALSO: todo /api/ va a Node
  await page.addInitScript(() => {
    const real = window.fetch;
    window.__llamadas = [];
    window.fetch = async (url, o) => {
      const u = String(url);
      if (!u.startsWith('/api/')) return real(url, o);
      window.__llamadas.push({ url: u, method: (o && o.method) || 'GET', cab: o && o.headers });
      const [status, j] = await window.__api((o && o.method) || 'GET', u, o && o.body ? o.body : null);
      return new Response(JSON.stringify(j), { status, headers: { 'Content-Type': 'application/json' } });
    };
  });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.S = { day: 10, rep: 30, money: 4000, log: [], premium: { aplicadas: [] }, equip: [], stock: { cable: 1, battery: 1 },
      staff: [{ id: 1, name: 'Tú (dueño)', role: 'camarografo', skill: 2, tier: 'junior', owner: true }, { id: 2, name: 'Kevin Guamán', role: 'camarografo', skill: 3, tier: 'senior' },
        { id: 3, name: 'Andrea Pazmiño', role: 'director', skill: 2, tier: 'semi_senior' }, { id: 4, name: 'Paola Zambrano', role: 'sonidista', skill: 2, tier: 'junior' },
        { id: 5, name: 'Karla Salazar', role: 'tecnico_transmision', skill: 3, tier: 'senior' }, { id: 6, name: 'Fernando Quishpe', role: 'productor', skill: 2, tier: 'junior' },
        { id: 7, name: 'Mishell Andrade', role: 'camarografo', skill: 3, tier: 'semi_senior' }, { id: 8, name: 'Tania Villacís', role: 'cablero', skill: 2, tier: 'junior' },
        { id: 9, name: 'Jonathan Cevallos', role: 'coordinador_piso', skill: 2, tier: 'junior' }] };
    window.__toasts = [];
    window.CTX = { G: window.Game, A: window.Art, estado: () => window.S, toast: (t) => window.__toasts.push(String(t)), snd: { play() {} },
      openModal() {}, closeModal() {}, sincronizar: () => { window.__sincronizado = (window.__sincronizado || 0) + 1; },
      ask: (html, si, cb) => { document.getElementById('ask-txt').innerHTML = html; const b = document.getElementById('ask-si'); b.textContent = si; document.getElementById('ask').classList.add('on');
        b.onclick = () => { document.getElementById('ask').classList.remove('on'); cb(); }; document.getElementById('ask-no').onclick = () => document.getElementById('ask').classList.remove('on'); } };
  });
  const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
  const desborde = async (tag) => { const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(d <= 1, `${tag}: sin desplazamiento horizontal (${d}px)`); };
  const jugarEnVivo = async (pref, nombreCaptura) => {
    for (let k = 0; k < 12; k++) {
      const op = page.locator(`button[data-${pref}="op"]:not([disabled])`);
      if (await op.count()) {
        if (k === 0 && nombreCaptura) { await page.evaluate(() => window.scrollTo(0, 0)); await shot(nombreCaptura); await desborde(nombreCaptura); }
        await op.first().click();   // la primera opción disponible (como un productor prudente)
        await page.locator(`button[data-${pref}="sig"]`).click();
        continue;
      }
      const fin = page.locator(`button[data-${pref}="fin-vivo"]`);
      if (await fin.count()) { await fin.click(); }
      break;
    }
  };

  console.log('\n== Duelo de Productoras');
  ok(await page.evaluate(() => !!(window.Duelos && window.Desafio && window.EnVivoVivo && window.Intento && window.Game)), 'Cargan Duelos, Desafio, el motor en vivo, Intento y la lógica');
  await page.evaluate(() => window.Duelos.render(document.getElementById('cont'), window.CTX));
  await page.waitForSelector('.dl-hero');
  ok(await page.locator('.dl-nivel').count() === 3, 'Tablero con 3 contratos (fácil, medio, difícil)');
  ok(await page.locator('.dl-rival').count() === 3, '3 rivales del servidor');
  ok(await page.locator('button[data-dl="retar"]:not([disabled])').count() === 0, 'Sin equipo registrado no se puede retar');
  ok((await page.locator('.dl-hero .dl-r').innerText()).replace(/\D/g, '') === '1084', 'Muestra el puntaje (1084) y la liga');
  ok(await page.locator('.dl-cupos i.on').count() === 4, 'Barra de duelos de hoy: 4 restantes');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('duelos'); await desborde('duelos (inicio)');

  await page.click('button[data-dl="equipo"]');
  await page.waitForSelector('#dl-personal');
  ok(await page.locator('#dl-personal input').count() === 9, 'Editor de equipo: tu personal de la partida (9)');
  ok(await page.locator('#dl-personal input[disabled]').count() === 1, '…el dueño va siempre');
  await page.locator('#dl-inv input[data-id="78"]').uncheck();
  await shot('duelos_equipo'); await desborde('duelos (equipo)');
  await page.click('button[data-dl="guardar-equipo"]');
  await page.waitForSelector('.dl-hero');
  const postEq = estadoSrv.posts.find((x) => x.ruta === '/api/duelos/equipo');
  ok(!!postEq && postEq.body.personal.length === 9 && postEq.body.personal.filter((p) => p.dueno).length === 1, 'Guarda el equipo: 9 personas, un dueño');
  ok(!!postEq && postEq.body.personal.every((p) => ['camarografo', 'director', 'sonidista', 'tecnico_transmision', 'productor', 'cablero', 'coordinador_piso'].includes(p.rol) && p.nivel), '…con los roles y niveles nuevos');
  ok(!!postEq && JSON.stringify(postEq.body.inventario) === '[77]', '…y solo el dron (la cámara VIP se desmarcó)');
  ok(await page.evaluate(() => window.__llamadas.filter((l) => l.method === 'POST').every((l) => l.cab && l.cab['X-Envivo'] === '1')), 'Todos los POST llevan X-Envivo: 1');

  await page.click('button[data-dl="nivel"][data-k="dificil"]');
  ok(await page.locator('button[data-dl="nivel"][data-k="dificil"].on').count() === 1, 'Elige el contrato difícil');
  ok(await page.locator('.dl-rival').nth(2).locator('button[data-dl="retar"][disabled]').count() === 1, 'El rival que ya retaste 3 veces hoy no se puede retar');
  await page.click('button[data-dl="nivel"][data-k="medio"]');
  await page.locator('button[data-dl="retar"]:not([disabled])').first().click();
  await page.waitForSelector('#ask.on');
  ok(/TeleAndes/.test(await page.locator('#ask-txt').innerText()), 'Pregunta antes de gastar un duelo');
  await page.click('#ask-si');
  await page.waitForSelector('.dl-vivo .scene');
  ok(await page.locator('.dl-vivo svg.scene').count() === 1, 'Duelo en vivo con la escena del evento (Art.scene)');
  await jugarEnVivo('dl', 'duelos_vivo');
  await page.waitForSelector('.dl-banner');
  const vD = estadoSrv.validaciones.find((x) => x.tipo === 'duelo');
  ok(!!vD && vD.r.valido === true && vD.r.coincide === true, `El validador repite la jugada del navegador y coincide (calidad ${vD && vD.r.calidad})`);
  const dIncR = (vD && vD.r.detalle.incidentes || []).map((x) => x.clave), dIncF = estadoSrv.duelo.fantasma.incidentes.map((x) => x.clave);
  console.log(`     imprevistos tú [${dIncR.join(', ')}] · fantasma [${dIncF.join(', ')}] (iguales si js/logic.js usa contrato.imprevistos)`);
  ok(/\d/.test(await page.locator('.dl-vs .q').first().innerText()), 'Resultado: calidad de los dos lados');
  ok(await page.evaluate(() => (window.__sincronizado || 0) >= 1), 'Después del duelo sincroniza la partida (entregas)');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('duelos_resultado'); await desborde('duelos (resultado)');

  const fama = await page.evaluate(() => {
    const s = window.S, r0 = s.rep;
    const h1 = window.Premium.aplicarEntregas(s, [{ id: 9001, tipo: 'fama', item: '-', cantidad: 3 }, { id: 9002, tipo: 'dinero', item: '-', cantidad: 100 }]);
    const r1 = s.rep, m1 = s.money;
    window.Premium.aplicarEntregas(s, [{ id: 9001, tipo: 'fama', item: '-', cantidad: 3 }]);
    return { r0, r1, r2: s.rep, m1, h1 };
  });
  ok(fama.r1 === fama.r0 + 3 && fama.r2 === fama.r1, 'Entrega de fama (premio de duelo): +3 una sola vez');
  ok(fama.m1 === 4100 && fama.h1.length === 2, '…y las demás entregas siguen funcionando');

  await page.evaluate(() => { window.I18N = { idioma: 'en', T: Object.assign((k) => ({ 'duelo.retar': 'Challenge', 'desafio.empezar': 'Start the challenge' }[k] || k), { has: (k) => k === 'duelo.retar' || k === 'desafio.empezar' }) }; });
  await page.click('button[data-dl="lobby"]');
  await page.waitForSelector('.dl-hero');
  ok(/Challenge/.test(await page.locator('button[data-dl="retar"]').first().innerText()), 'Textos: usa I18N.T cuando tiene la clave (duelo.retar → Challenge)');
  ok(/Duelos de hoy/.test(await page.locator('.dl-hero').innerText()), '…y el español cuando no la tiene');

  console.log('\n== Desafío Técnico del Día');
  await page.evaluate(() => { window.scrollTo(0, 0); window.Desafio.render(document.getElementById('cont'), window.CTX); });
  await page.waitForSelector('.df-hero');
  ok((await page.locator('.df-hero h2').innerText()).length > 3, `Modificador de hoy: ${await page.locator('.df-hero h2').innerText()}`);
  ok(await page.locator('.df-dia').count() === 7 && await page.locator('.df-dia.hoy').count() === 1, 'Semana con los 7 modificadores y hoy marcado');
  ok(/Start the challenge/.test(await page.locator('button[data-df="empezar"]').innerText()), 'Botón traducido con I18N');
  await page.evaluate(() => { window.I18N = undefined; });
  const pres = () => page.locator('#df-usado').innerText();
  const antes = await pres();
  const casillas = page.locator('input[data-df]:not([disabled])');
  for (let i = 0; i < await casillas.count(); i++) await casillas.nth(i).check();
  ok(await page.locator('button[data-df="empezar"][disabled]').count() === 1 && /neg/.test(await page.locator('#df-usado').getAttribute('class')), `Llevar todo se pasa del presupuesto y bloquea el botón (${await pres()})`);
  for (let i = 0; i < await casillas.count(); i++) await casillas.nth(i).uncheck();
  ok(await page.locator('button[data-df="empezar"][disabled]').count() === 1, 'Sin cámara tampoco se puede empezar');
  // Un buen equipo que entra en el presupuesto más chico (24) y con una sola cámara (martes)
  for (const id of ['p1', 'p5', 'p7', 'p9', 'p11', 'p12']) await page.locator(`input[data-df="p"][data-id="${id}"]`).check();
  for (const id of ['e2', 'e9', 'e11', 'e13', 'e15']) await page.locator(`input[data-df="e"][data-id="${id}"]`).check();
  ok(antes !== await pres() && await page.locator('button[data-df="empezar"]:not([disabled])').count() === 1, `Presupuesto: ${antes} → ${await pres()}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('desafio'); await desborde('desafío (inicio)');
  await page.click('button[data-df="empezar"]');
  await page.waitForSelector('#ask.on');
  await page.click('#ask-si');
  await page.waitForSelector('.dl-vivo .scene');
  const postDf = estadoSrv.posts.find((x) => x.ruta === '/api/desafio/empezar');
  ok(!!postDf && postDf.body.personal.includes('p1') && postDf.body.equipos.includes('e2'), 'Manda la elección de la maleta');
  ok(!SERV.mod.requeridos.length || SERV.mod.requeridos.every((k) => estadoSrv.desafio.semilla.incidentes.includes(k)), `El evento trae lo que pide el día (${SERV.mod.requeridos.join(', ') || 'sin imprevisto fijo'})`);
  await jugarEnVivo('df', 'desafio_vivo');
  await page.waitForSelector('.df-q, .neg');
  const vF = estadoSrv.validaciones.find((x) => x.tipo === 'desafio');
  ok(!!vF && vF.r.valido === true && vF.r.coincide === true, `El validador repite el desafío del navegador y coincide (calidad ${vF && vF.r.calidad})`);
  ok(!!vF && SERV.mod.requeridos.every((k) => vF.r.detalle.incidentes.some((x) => x.clave === k)), '…y el jugador sí enfrentó los imprevistos del día');
  ok(/Recibiste/.test(await page.locator('#cont').innerText()), 'Resultado con el premio');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('desafio_resultado'); await desborde('desafío (resultado)');

  ok(errores.length === 0, 'Sin errores en la consola' + (errores.length ? ': ' + errores.slice(0, 5).join(' | ') : ''));
  ok(await page.evaluate(() => window.__llamadas.every((l) => l.url.startsWith('/api/duelos') || l.url.startsWith('/api/desafio'))), 'Solo llama a /api/duelos y /api/desafio');
  await browser.close();
  console.log(`\n${fallas ? 'FALLAS: ' + fallas : 'TODO OK'} (${bien} bien)`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
