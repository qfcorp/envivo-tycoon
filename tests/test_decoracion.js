/* Prueba de la decoración del local (js/decoracion.js): catálogo, lugares por local, imagen y su tope, flores que
   se marchitan, mantenimiento por día, ofertas mejor pagadas, visitas de clientes, intentos en línea sin extensión,
   migración de partidas viejas/rotas, determinismo, dibujo y textos en 10 idiomas.
   Uso:  node tests/test_decoracion.js            (lógica)
         node tests/test_decoracion.js --navegador (además, el juego en Chromium 390x844: capturas tests/capturas/decor_*.png) */
'use strict';
const G = require('../js/logic.js');
// Determinismo: la lógica de la decoración no puede usar azar del sistema ni el reloj
const rndReal = Math.random;
Math.random = () => { throw new Error('Math.random en la lógica'); };
const D = require('../js/decoracion.js');

let errors = 0;
function check(cond, msg) { if (!cond) { errors++; if (errors < 60) console.error('❌', msg); } }
const pasar = (s, n) => { for (let i = 0; i < n; i++) G.nextDay(s); };
const nuevo = (seed, money) => { const s = G.newGame(seed); if (money != null) s.money = money; return s; };
// Local más grande: el tamaño (personas + equipos) decide garaje / oficina / estudio / centro
const agrandar = (s, n) => { for (let k = 0; k < n; k++) s.equip.push({ id: 5000 + k, type: 'mics', condition: 90 }); };

check(G.extensiones.some((e) => e.id === 'decoracion'), 'decoracion.js no se registró como extensión');

/* ---------- Catálogo y precios ---------- */
(function () {
  check(D.CATALOGO.length >= 10, 'el catálogo debería tener al menos 10 cosas');
  D.CATALOGO.forEach((d) => {
    check(d.precio > 0 && d.precio <= 1000, `${d.k}: precio fuera de rango (${d.precio})`);
    check(d.pts > 0 && d.pts <= 15, `${d.k}: puntos fuera de rango`);
    check(d.min >= 0 && d.min <= 3, `${d.k}: local mínimo inválido`);
    check(!d.gasto || d.gasto <= 5, `${d.k}: mantenimiento muy caro`);
  });
  check(D.DEF.flores.dias === 5, 'las flores deberían durar 5 días');
  check(D.AJUSTE.lugares.join() === '3,5,7,9', 'lugares por local: 3, 5, 7, 9');
  // Lo mejor que cabe en el centro de producción llega cerca de 100 y nunca pasa del tope de pago
  const s = nuevo(1, 1e6); agrandar(s, 40);
  check(D.nivelLocal(s) === 3, 'con 40 equipos debería ser el centro de producción');
  s.stats.events = 60; s.stats.fiveStars = 40; s.storyDone = true;
  ['recepcion', 'sofa', 'tv', 'neon', 'trofeos', 'cuadros', 'flores', 'aire', 'cafetera'].forEach((k) => check(D.comprar(s, k).ok, 'centro: no pudo comprar ' + k));
  const im = D.imagen(s);
  check(im.puntos >= 85 && im.puntos <= 100, `centro lleno: imagen ${im.puntos} (esperado 85-100)`);
  check(im.pct === D.AJUSTE.pctMax && im.pct <= 8, `centro lleno: +${im.pct}% (tope 8)`);
  check(!D.comprar(s, 'planta').ok, 'el centro no debería tener un décimo lugar');
  for (let p = 0; p <= 200; p += 5) check(D.pctDe(p) >= 0 && D.pctDe(p) <= 8, 'pctDe se sale del rango');
  check(D.pctDe(35) === 4 && D.pctDe(0) === 0 && D.pctDe(9) === 1 && D.pctDe(4) === 0, 'pctDe: 35 → 4 %, 9 → 1 %, 4 → 0 %');
})();

/* ---------- Comprar: dinero, lugares, local mínimo, máximo, quitar ---------- */
(function () {
  const s = nuevo(2, 1500);
  check(D.nivelLocal(s) === 0 && D.lugares(s) === 3, 'una partida nueva empieza en el garaje con 3 lugares');
  check(!D.comprar(s, 'tv').ok, 'la TV no debería entrar en el garaje');
  check(!D.comprar(s, 'nada').ok, 'comprar algo que no existe debería fallar');
  const m0 = s.money;
  check(D.comprar(s, 'flores').ok && s.money === m0 - 30, 'flores: cobra $30');
  check(D.comprar(s, 'planta').ok && D.comprar(s, 'planta').ok, 'se pueden tener 2 plantas');
  check(!D.comprar(s, 'sofa').ok, 'el garaje lleno (3/3) no acepta más');
  const r = D.quitar(s, 1);
  check(r.ok && s.decor.items.length === 2 && s.money === m0 - 30 - 50 + 5, `quitar una planta devuelve el 30 % redondeado ($5): ${s.money}`);
  check(!D.comprar(s, 'planta').ok === false, 'después de quitar hay lugar otra vez');
  check(!D.comprar(s, 'planta').ok, 'máximo 2 plantas');
  const pobre = nuevo(3, 100);
  const rr = D.comprar(pobre, 'sofa');
  check(!rr.ok && pobre.money === 100 && /280/.test(rr.msg), 'sin dinero no compra y dice el precio');
  // Quitar flores no devuelve nada
  const f = nuevo(4, 500); D.comprar(f, 'flores'); const mf = f.money; D.quitar(f, 0);
  check(f.money === mf && f.decor.items.length === 0, 'quitar flores no devuelve dinero');
})();

/* ---------- Flores: frescas 5 días, después restan hasta cambiarlas ---------- */
(function () {
  const s = nuevo(5, 5000);
  D.comprar(s, 'flores'); D.comprar(s, 'sofa');
  const fresca = D.imagen(s).puntos;
  check(fresca === 9 + 12, `flores frescas + sofá = 21 (${fresca})`);
  pasar(s, 4);
  check(D.imagen(s).puntos === fresca && D.lista(s)[0].fresca && D.lista(s)[0].quedan === 1, 'al 4.º día siguen frescas (queda 1)');
  check(!s.log.some((l) => l.k === 'decor.log_marchitas'), 'no avisa antes de tiempo');
  pasar(s, 1);
  const L = D.lista(s)[0];
  check(!L.fresca && L.pts === D.AJUSTE.marchitas, 'al 5.º día se marchitan y restan');
  check(D.imagen(s).puntos === 12 + D.AJUSTE.marchitas && D.imagen(s).marchitas === 1, 'imagen con flores marchitas');
  check(s.log.filter((l) => l.k === 'decor.log_marchitas').length === 1, 'avisa una vez que se marchitaron');
  pasar(s, 3);
  check(s.log.filter((l) => l.k === 'decor.log_marchitas').length === 1, 'no repite el aviso cada día');
  const m = s.money;
  const r = D.cambiarFlores(s);
  check(r.ok && s.money === m - 30 && D.lista(s)[0].fresca && D.lista(s)[0].quedan === 5, 'cambiar flores: $30 y frescas 5 días otra vez');
  check(D.imagen(s).puntos === fresca, 'con flores nuevas vuelve la imagen');
  pasar(s, 5);
  check(s.log.filter((l) => l.k === 'decor.log_marchitas').length === 2, 'avisa otra vez cuando se marchitan las nuevas');
  const sin = nuevo(6, 50); D.comprar(sin, 'flores'); pasar(sin, 6); sin.money = 10;
  check(!D.cambiarFlores(sin).ok, 'sin dinero no cambia las flores');
})();

/* ---------- Mantenimiento por día (si logic.js no lo suma, se descuenta al empezar el día) ---------- */
(function () {
  const a = nuevo(7, 1500), b = nuevo(7, 1500);
  D.comprar(a, 'cafetera'); D.comprar(a, 'agua'); // 12 puntos: +1 % y sin visitas
  const g = D.gastoDiario(a);
  check(g === 3, `cafetera + agua = $3 por día (${g})`);
  check(D.EXT.gastoFijo(a) === 3, 'gancho gastoFijo');
  pasar(a, 6); pasar(b, 6);
  const enLogica = typeof G.extSuma === 'function';
  check(a.money === b.money - 180 - 6 * 3, `6 días: compra $180 + mantenimiento $18 (diferencia ${b.money - a.money})`);
  if (!enLogica) check(a.decor.gastado === 18, 'lleva la cuenta de lo gastado en mantenimiento');
  else check(G.dailyCost(a) === G.dailyCost(b) + 3, 'logic.js suma el mantenimiento a los gastos del día');
})();

/* ---------- Ofertas mejor pagadas (no las internacionales) ---------- */
(function () {
  const base = nuevo(8, 1e5);
  const con = G.deserialize(G.serialize(base));
  ['sofa', 'neon', 'flores'].forEach((k) => D.comprar(con, k)); // 31 → +3 %
  con.money = base.money;
  check(D.imagen(con).pct === 3, 'garaje con sofá, neón y flores: +3 %');
  let n = 0;
  for (let i = 0; i < 30; i++) {
    base.contracts = []; con.contracts = [];
    const c1 = G.addContract(base, 'boda'), c2 = G.addContract(con, 'boda');
    check(c1.client === c2.client, 'la decoración no cambia el azar de las ofertas');
    check(Math.abs(c2.pay - Math.round(c1.pay * 1.03 / 10) * 10) <= 10, `pago con +3 %: ${c1.pay} → ${c2.pay}`);
    if (c2.pay > c1.pay) n++;
  }
  check(n >= 20, 'la mayoría de las ofertas deberían pagar más');
  check(D.EXT.multPago(con, { internacional: true }) === 1, 'las ofertas internacionales no cambian');
  check(D.EXT.multPago(nuevo(9), {}) === 1, 'sin decoración: sin cambio');
})();

/* ---------- Visitas de clientes ---------- */
(function () {
  const s = nuevo(10, 1e5); agrandar(s, 15);
  s.stats.events = 5;
  ['sofa', 'neon', 'flores', 'cafetera'].forEach((k) => D.comprar(s, k)); // 39 → cada 6 días
  check(D.imagen(s).cada === 6, `imagen ${D.imagen(s).puntos}: un cliente cada 6 días`);
  // La cuenta empieza al día siguiente de llegar a imagen 30 (día 2): visitas los días 8 y 14
  const dias = [];
  for (let i = 0; i < 14; i++) {
    const v0 = s.decor.visitas;
    G.nextDay(s);
    if (s.decor.visitas > v0) { dias.push(s.day); check(s.contracts.some((c) => c.visita && c.daysLeft > 0), 'la visita deja una oferta'); }
    s.contracts = s.contracts.filter((c) => c.visita);
    if (D.lista(s)[2].quedan <= 1) D.cambiarFlores(s);
  }
  check(dias.join() === '8,14', `imagen 39: visitas los días 8 y 14 (${dias.join()})`);
  check(s.log.some((l) => l.k === 'decor.log_visita'), 'la visita deja un aviso');
  // Si las flores se marchitan, la imagen baja de 30 y la cuenta de visitas vuelve a empezar
  const m = nuevo(21, 1e5); agrandar(m, 15); m.stats.events = 5; ['sofa', 'neon', 'flores', 'cafetera'].forEach((k) => D.comprar(m, k));
  pasar(m, 6);
  check(m.decor.proxVisita === 0 && D.imagen(m).cada === 0, 'flores marchitas: sin visitas hasta cambiarlas');
  const bajo = nuevo(11, 1e5); bajo.stats.events = 5; D.comprar(bajo, 'sofa');
  pasar(bajo, 15);
  check(bajo.decor.visitas === 0 && D.imagen(bajo).cada === 0, 'con imagen baja no hay visitas');
  const tut = nuevo(12, 1e5); agrandar(tut, 15); ['sofa', 'neon', 'flores', 'cafetera', 'alfombra'].forEach((k) => D.comprar(tut, k));
  pasar(tut, 8);
  check(tut.decor.visitas === 0, 'en el tutorial (menos de 3 eventos) no hay visitas');
  check(D.cadaVisita(60) === 4 && D.cadaVisita(59) === 6 && D.cadaVisita(29) === 0, 'cada cuántos días: 60 → 4, 30 → 6');
})();

/* ---------- Local más chico: lo que no cabe queda guardado ---------- */
(function () {
  const s = nuevo(13, 1e5); agrandar(s, 23);
  check(D.nivelLocal(s) === 2, 'con 23 equipos + 1 persona: estudio');
  ['sofa', 'recepcion', 'tv', 'neon', 'flores', 'cafetera', 'planta'].forEach((k) => check(D.comprar(s, k).ok, 'estudio: compra ' + k));
  const antes = D.imagen(s);
  s.equip = s.equip.slice(0, 2); // vendió casi todo: vuelve al garaje
  const im = D.imagen(s);
  check(D.nivelLocal(s) === 0 && im.usados === 3 && im.guardados === 4, `garaje: 3 puestos y 4 guardados (${im.usados}/${im.guardados})`);
  check(im.puntos < antes.puntos && im.gasto <= antes.gasto, 'lo guardado no suma imagen ni gasta');
  check(D.lista(s).find((x) => x.it.k === 'recepcion').motivo === 'local', 'la recepción queda guardada por el local');
  check(!D.comprar(s, 'alfombra').ok, 'con cosas guardadas de más no se puede comprar');
})();

/* ---------- Intentos en línea: sin extensión ---------- */
(function () {
  const s = nuevo(14, 1e5);
  ['cafetera', 'agua', 'neon'].forEach((k) => D.comprar(s, k));
  s.intento = true;
  const m = s.money;
  G.nextDay(s);
  check(s.money === m - G.dailyCost(s) || s.decor.gastado === 0, 'en un intento en línea no se cobra mantenimiento');
  check(s.decor.gastado === 0, 'intento: no gasta');
  s.contracts = [];
  const c1 = G.addContract(s, 'boda');
  delete s.intento;
  const s2 = G.deserialize(G.serialize(s)); s2.contracts = []; s2.intento = true;
  check(c1 && G.extActivas(s) === true && G.extActivas(s2) === false, 'extActivas respeta s.intento');
})();

/* ---------- Migración: partidas viejas y datos rotos ---------- */
(function () {
  const v = nuevo(15); delete v.decor;
  const c = G.deserialize(G.serialize(v));
  check(c.decor && Array.isArray(c.decor.items) && c.decor.items.length === 0, 'una partida vieja recibe s.decor vacío');
  const r = nuevo(16);
  r.decor = { items: [{ k: 'planta' }, { k: 'planta' }, { k: 'planta' }, { k: 'xx' }, null, 5, { k: 'flores', dia: 3 }, { k: 'sofa', dia: 'x' }], gastado: -5, proxVisita: 'a', visitas: NaN };
  D.migrar(r);
  check(r.decor.items.length === 4 && r.decor.items.filter((x) => x.k === 'planta').length === 2, 'migrar limpia cosas inválidas y repetidas');
  check(r.decor.items.find((x) => x.k === 'flores').hasta === 8, 'migrar arma la fecha de las flores');
  check(r.decor.gastado === 0 && r.decor.proxVisita === 0 && r.decor.visitas === 0, 'migrar limpia números rotos');
  const arr = nuevo(17); arr.decor = [1, 2]; D.migrar(arr);
  check(Array.isArray(arr.decor.items) && arr.decor.items.length === 0, 'migrar arregla s.decor con forma rara');
  // Guardar y cargar conserva todo
  const g = nuevo(18, 5000); ['flores', 'sofa'].forEach((k) => D.comprar(g, k)); pasar(g, 2);
  const g2 = G.deserialize(G.serialize(g));
  check(JSON.stringify(g2.decor) === JSON.stringify(g.decor) && D.imagen(g2).puntos === D.imagen(g).puntos, 'guardar/cargar conserva la decoración');
})();

/* ---------- Determinismo: misma semilla y mismas compras → misma partida ---------- */
(function () {
  const jugar = () => {
    const s = nuevo(19, 20000); agrandar(s, 16); s.stats.events = 4;
    const plan = { 1: 'flores', 2: 'sofa', 3: 'neon', 5: 'cafetera', 9: 'tv' };
    for (let d = 1; d <= 30; d++) {
      if (plan[d]) D.comprar(s, plan[d]);
      if (d % 7 === 0) D.cambiarFlores(s);
      G.nextDay(s);
    }
    return G.serialize(s);
  };
  const a = jugar(), b = jugar();
  check(a === b, 'la misma partida dos veces da lo mismo');
  check(/"visitas":[1-9]/.test(a), 'la partida de prueba debería tener visitas');
})();

/* ---------- Dibujo ---------- */
(function () {
  const s = nuevo(20, 1e5);
  check(D.capa(s, 0) === '', 'sin decoración no hay capa');
  ['flores', 'sofa', 'neon'].forEach((k) => D.comprar(s, k));
  s.productora = 'Tukán <Prod> & "Co"';
  const capa = D.capa(s, 'sede.garaje');
  check(/class="decor-capa"/.test(capa) && /dc-vitrina/.test(capa), 'la capa trae la vitrina');
  check(capa.includes('TUKÁN &lt;PROD&gt; &amp; &quot;CO&quot;') && !capa.includes('<Prod>'), 'el nombre del letrero va escapado');
  const abre = (capa.match(/<g\b/g) || []).length, cierra = (capa.match(/<\/g>/g) || []).length;
  check(abre === cierra, `la capa tiene <g> balanceados (${abre}/${cierra})`);
  [0, 1, 2, 3].forEach((n) => check(D.capa(s, n).length > 100, 'capa para el local ' + n));
  const int = D.interior(s);
  check(/^<svg[\s\S]*<\/svg>$/.test(int.trim()) && int.includes('TUKÁN'), 'la sala de espera es un <svg> con el letrero');
  D.CATALOGO.forEach((d) => check(/<svg class="dc-mini"/.test(D.miniatura(d.k, s)), 'miniatura de ' + d.k));
  delete s.productora;
  check(D.capa(s, 0).includes('MI PRODUCTORA') || D.interior(s).includes('MI PRODUCTORA'), 'sin nombre: MI PRODUCTORA');
  check(D.nombreProductora(s, { nombreProductora: () => 'Eventos Andes' }) === 'EVENTOS ANDES', 'usa ctx.nombreProductora');
  const html = D.tarjeta({ S: () => s, M: G.money, I: () => '' });
  check(/data-ext="decoracion" data-acc="abrir"/.test(html) && /<h3>Imagen del local \d+\/100 · ofertas \+\d+%<\/h3>/.test(html), 'tarjeta de Inicio con título y botón');
})();

/* ---------- Textos: 10 idiomas con las mismas claves y los mismos {parámetros} ---------- */
(function () {
  const codes = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
  const es = D.TRAD.es, par = (v) => (String(v).match(/\{\w+\}/g) || []).sort().join();
  codes.forEach((c) => {
    const d = D.TRAD[c];
    check(!!d, 'falta el idioma ' + c);
    if (!d) return;
    Object.keys(es).forEach((k) => {
      check(typeof d[k] === 'string' && d[k].length > 0, `${c}: falta ${k}`);
      if (typeof d[k] === 'string') check(par(d[k]) === par(es[k]), `${c}.${k}: parámetros distintos`);
    });
    check(Object.keys(d).length === Object.keys(es).length, `${c}: claves de más`);
  });
  check(G.tx('decor.log_marchitas') === es.log_marchitas, 'los avisos están en los textos del juego');
})();

Math.random = rndReal;
if (errors) { console.error(`\n❌ ${errors} errores encontrados`); process.exit(1); }
console.log('✅ Decoración OK: sin errores');

/* =========================================================
   En el navegador (Chromium, celular 390x844): node tests/test_decoracion.js --navegador
   Sirve el juego con page.route y agrega js/decoracion.js (si index.html todavía no lo tiene) antes de js/ui.js.
   Si art.js todavía no dibuja la capa, la prueba agrega en memoria la misma línea de INTEGRAR_DECORACION.md.
   ========================================================= */
if (process.argv.includes('--navegador')) (async () => {
  const path = require('path'), fs = require('fs');
  const { chromium } = require('playwright');
  const RAIZ = path.resolve(__dirname, '..'), BASE = 'http://envivo.test';
  const out = path.join(__dirname, 'capturas'); fs.mkdirSync(out, { recursive: true });
  let html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  if (!/js\/decoracion\.js/.test(html)) html = html.replace('<script src="js/ui.js"></script>', '<script src="js/decoracion.js"></script>\n<script src="js/ui.js"></script>');
  let art = fs.readFileSync(path.join(RAIZ, 'js/art.js'), 'utf8');
  const artIntegrado = /Decoracion/.test(art);
  if (!artIntegrado) art = art.replace('${building}${roof.join(\'\')}', '${building}${root.Decoracion && root.Decoracion.capa ? root.Decoracion.capa(st, stage) : \'\'}${roof.join(\'\')}');
  // Partida guardada: capítulo 1, día 11, en el garaje, con plata para decorar
  const save = (() => { const s = G.newGame(7); s.chapter = 1; s.day = 11; s.stats.events = 6; s.money = 2500; s.rep = 9; s.productora = 'Tukán Producciones'; return G.serialize(s); })();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (u.pathname === '/js/art.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: art });
    if (u.pathname === '/api/estado') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tienda: { productos: [], premium: [] }, logueado: false, entregas: [], inventario: [], plux: { disponible: false, ambiente: 'sandbox' } }) });
    if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const f = path.join(RAIZ, u.pathname.slice(1));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream', body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript((s) => {
    localStorage.setItem('envivo_lang', 'es'); localStorage.setItem('envivo_tycoon_save_v1', s);
    localStorage.setItem('envivo_aviso_cuenta', '3'); localStorage.setItem('envivo_guia_v1', '"1"');
  }, save);
  await page.goto(BASE + '/?fecha=2026-10-10');
  await page.waitForTimeout(2000);
  for (let i = 0; i < 6; i++) { const x = await page.$('#overlay.on [data-act^="close"]'); if (!x) break; await x.click(); await page.waitForTimeout(250); }
  const shot = async (n, el) => { await page.waitForTimeout(350); if (el) await page.locator(el).first().screenshot({ path: path.join(out, 'decor_' + n + '.png') }); else await page.screenshot({ path: path.join(out, 'decor_' + n + '.png') }); };
  const noHScroll = async (tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 1) errs.push(`${tag}: desplazamiento horizontal (${ov}px)`);
    const modal = await page.evaluate(() => { const m = document.getElementById('modal'); return m ? m.scrollWidth - m.clientWidth : 0; });
    if (modal > 1) errs.push(`${tag}: la ventana se sale por los costados (${modal}px)`);
  };
  const st = () => page.evaluate(() => { const s = window.__game.state; return { money: s.money, items: s.decor.items.map((x) => x.k), day: s.day, im: window.Decoracion.imagen(s) }; });
  // Abre la fila plegable de la decoración (si está cerrada)
  const abrirFila = async () => {
    const card = page.locator('.dc-card');
    if (!(await card.count())) { errs.push('no aparece la tarjeta de decoración'); return; }
    if (!(await card.first().isVisible())) { const cab = page.locator('.pl[data-pl="decoracion"] .pl-cab'); if (await cab.count()) await cab.click(); }
    await card.first().scrollIntoViewIfNeeded();
  };
  await abrirFila();
  await shot('01_tarjeta_vacia', '.dc-card'); await noHScroll('tarjeta');
  // Decorar: ventana con la tienda
  await page.locator('.dc-card [data-acc="abrir"].btn').click();
  await page.waitForSelector('#modal .dc-modal');
  await shot('02_tienda'); await noHScroll('tienda');
  if (await page.locator('#modal [data-item="tv"] .btn:not([disabled])').count()) errs.push('la TV no debería poder comprarse en el garaje');
  const m0 = (await st()).money;
  await page.locator('#modal [data-acc="comprar"][data-k="flores"]').click();
  await page.waitForTimeout(150);
  await page.locator('#modal [data-acc="comprar"][data-k="sofa"]').click();
  await page.waitForTimeout(150);
  let e = await st();
  if (e.items.join() !== 'flores,sofa') errs.push('no compró flores y sofá: ' + e.items.join());
  if (e.money !== m0 - 310) errs.push(`cobro incorrecto: ${m0} → ${e.money}`);
  if (!(await page.locator('#modal .dc-modal').count())) errs.push('la ventana se cerró después de comprar');
  if (e.im.puntos !== 21 || e.im.pct !== 2) errs.push(`imagen esperada 21 (+2 %): ${e.im.puntos} (+${e.im.pct} %)`);
  await shot('03_comprado'); await noHScroll('comprado');
  await page.evaluate(() => { const m = document.getElementById('modal'); m.scrollTop = 0; });
  await page.locator('#modal [data-act="close"]').first().click();
  // Tarjeta y capa sobre la sede
  await abrirFila();
  const txt = await page.locator('.dc-card h3').textContent();
  if (!/21\/100 · ofertas \+2%/.test(txt)) errs.push('título de la tarjeta: ' + txt);
  await shot('04_tarjeta', '.dc-card');
  await page.evaluate(() => window.scrollTo(0, 0));
  if (!(await page.locator('.hqcard svg.hq .decor-capa .dc-vitrina').count())) errs.push('no se ve la decoración sobre la sede');
  await shot('05_sede', '.hqcard');
  // Ofertas mejor pagadas: la misma oferta con y sin decoración
  const pago = await page.evaluate(() => {
    const G = window.Game, s = window.__game.state;
    const a = G.deserialize(G.serialize(s)), b = G.deserialize(G.serialize(s)); b.decor.items = [];
    a.contracts = []; b.contracts = [];
    return [G.addContract(a, 'boda').pay, G.addContract(b, 'boda').pay];
  });
  if (!(pago[0] > pago[1])) errs.push('la oferta con decoración no paga más: ' + pago.join(' vs '));
  // Pasan 5 días: las flores se marchitan
  for (let i = 0; i < 5; i++) { await page.evaluate(() => window.scrollTo(0, 0)); await page.locator('[data-act="next-day"]').first().click(); await page.waitForTimeout(250); for (let k = 0; k < 4; k++) { const x = await page.$('#overlay.on [data-act^="close"]'); if (!x) break; await x.click(); await page.waitForTimeout(200); } }
  e = await st();
  if (e.im.marchitas !== 1 || e.im.puntos !== 8) errs.push(`flores marchitas: imagen ${e.im.puntos} (esperado 8), marchitas ${e.im.marchitas}`);
  await abrirFila();
  if (!(await page.locator('.dc-card .tag.dc-mal').count())) errs.push('la tarjeta no marca las flores marchitas');
  if (!(await page.locator('.dc-card [data-acc="flores"]').count())) errs.push('falta el botón de cambiar flores');
  await shot('06_marchitas', '.dc-card');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('07_sede_marchitas', '.hqcard');
  await abrirFila();
  await page.locator('.dc-card [data-acc="flores"]').click();
  await page.waitForTimeout(250);
  e = await st();
  if (e.im.puntos !== 21) errs.push('después de cambiar las flores la imagen debería volver a 21: ' + e.im.puntos);
  // Un local grande (centro de producción) bien decorado, en inglés, de noche
  await page.evaluate(() => {
    const s = window.__game.state, D = window.Decoracion;
    for (let k = 0; k < 34; k++) s.equip.push({ id: 7000 + k, type: 'mics', condition: 90 });
    s.money = 50000; s.stats.fiveStars = 15; s.stats.events = 40; if (s.day % 2) s.day++;
    ['neon', 'tv', 'recepcion', 'trofeos', 'cuadros', 'aire', 'planta'].forEach((k) => D.comprar(s, k));
  });
  if (await page.evaluate(() => !!(window.I18N && window.I18N.setIdioma))) {
    await page.evaluate(() => window.I18N.setIdioma('en'));
    await page.waitForFunction(() => window.I18N.idioma === 'en', null, { timeout: 5000 }).catch(() => errs.push('no cambió a inglés'));
    await page.waitForTimeout(400);
  }
  await page.locator('nav button[data-tab="inicio"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('08_centro_noche_en', '.hqcard');
  await abrirFila();
  const txtEn = await page.locator('.dc-card h3').textContent();
  if (!/Venue image \d+\/100 · offers \+\d+%/.test(txtEn)) errs.push('título en inglés: ' + txtEn);
  await shot('09_tarjeta_centro_en', '.dc-card'); await noHScroll('centro');
  await page.locator('.dc-card [data-acc="abrir"].btn').click();
  await page.waitForSelector('#modal .dc-modal');
  await shot('10_ventana_centro_en'); await noHScroll('ventana centro');
  await page.evaluate(() => { const m = document.getElementById('modal'); m.scrollTop = m.scrollHeight; });
  await shot('11_tienda_abajo_en');
  // Quitar desde la ventana
  const n0 = (await st()).items.length;
  await page.locator('#modal [data-acc="quitar"]').first().click();
  await page.waitForTimeout(200);
  if ((await st()).items.length !== n0 - 1) errs.push('quitar no sacó la cosa');
  await browser.close();
  if (errs.length) { console.error('❌ Navegador:\n' + errs.join('\n')); process.exit(1); }
  console.log(`✅ Navegador OK (art.js ${artIntegrado ? 'ya integrado' : 'con la línea de INTEGRAR en memoria'}; capturas en tests/capturas/decor_*.png)`);
})().catch((e) => { console.error('❌ Navegador:', e); process.exit(1); });
