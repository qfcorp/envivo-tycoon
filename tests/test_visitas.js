/* Prueba de las visitas a otras productoras (js/visitas.js):
   - Lógica (Node): la partida "de mentira" de la vitrina dibuja la MISMA etapa que mandó el servidor (garaje, oficina,
     estudio, centro) con Art.hq de verdad, con su letrero, su decoración (Decoracion.capa) y sin tocar la partida del
     jugador; botón "Visitar" solo con sesión y nunca para uno mismo; textos en 10 idiomas con los mismos {marcadores}.
   - Navegador (Chromium, celular 390x844, servidor simulado con page.route): tarjeta de Inicio con productoras para
     visitar, pantalla de visita (sede, trofeos, números, mejores eventos, flota), aplauso (1 por día, el $50 llega como
     entrega y se suma a la partida), mi vitrina con el interruptor de privacidad, productora cerrada, sin desborde.
   Capturas: tests/capturas/visitas_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_visitas.js            (todo)
         node tests/test_visitas.js --sin-navegador                                    (solo lógica) */
'use strict';
const path = require('path');
const fs = require('fs');
const G = require('../js/logic.js');
globalThis.Game = G;
const D = require('../js/decoracion.js');
globalThis.Decoracion = D;
require('../js/art.js');
const Art = globalThis.Art;
const V = require('../js/visitas.js');

const RAIZ = path.resolve(__dirname, '..');
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Vitrina de ejemplo (como la arma server/src/Visitas.php) ---------- */
const vitrina = (o) => Object.assign({
  jugador_id: 42, alias: 'MegaCanal', productora: 'MegaCanal Studios', fama_publica: 33, sin_partida: false, dia: 41, fama: 34, capitulo: 4, historia_completa: false,
  etapa: 2, personal: 9, equipos: 18, destacados: [{ nombre: 'Ana Ríos', rol: 'director', nivel: 'senior', habilidad: 4, eventos: 30 }],
  equipo_hq: ['cam_pro', 'cam_pro', 'unidad_movil', 'tipo_que_no_existe'], flota: [{ tipo: 'veh_sedan_usado', n: 2 }, { tipo: 'veh_furgon_carga', n: 1 }],
  decor: { items: [{ k: 'sofa', dia: 30 }, { k: 'neon', dia: 31 }, { k: 'flores', dia: 40, hasta: 45 }] }, cosmeticos: ['banderines'],
  mejores: [{ tipo: 'concierto', estrellas: 5, veces: 7 }, { tipo: 'boda', estrellas: 5, veces: 2 }, { tipo: 'misa', estrellas: 4, veces: 1 }],
  stats: { eventos: 55, cinco_estrellas: 12, internacionales: 2, duelos_ganados: 3 }, logros: null,
  asociacion: { nombre: 'Los del Cable', siglas: 'LDC', color: '#5ad1ff' }, sede_nivel: 7,
  trofeos: [{ tipo: 'copa', clave: 'campeon', nombre: 'Copa de Oro', semana: '2026-W42' }, { tipo: 'duelo', puesto: 2, temporada: '2026-09' }, { tipo: 'temporada', key: 'navidad', anio: 2025 }],
  estrellas: [{ clave: 'lupe', nombre: 'Lupe Zoom', rol: 'camarografo' }],
}, o || {});

/* ---------- Lógica ---------- */
(function () {
  for (let e = 0; e <= 3; e++) {
    for (const hq of [[], ['cam_pro', 'cam_pro', 'cam_pro', 'cam_pro', 'cam_pro', 'cam_pro', 'unidad_movil', 'dron4k', 'grua', 'generador', 'vip_satelital']]) {
      const s = V.estadoVisita(vitrina({ etapa: e, equipo_hq: hq, personal: 30 }));
      bien(G.venue(s).nivel === e, `etapa ${e} con ${hq.length} equipos dibujados → local ${G.venue(s).nivel}`);
    }
  }
  const s = V.estadoVisita(vitrina());
  bien(s.equip.every((x) => G.CATALOG[x.type]), 'solo equipos que el juego conoce (sin "tipo_que_no_existe")');
  bien(s.visita === true && s.money === undefined, 'la partida de visita no trae dinero');
  const svg = Art.hq(s);
  bien(/<svg class="hq"/.test(svg), 'Art.hq dibuja su sede');
  bien(svg.includes('MEGACANAL STUDIOS'), 'el letrero lleva el nombre de SU productora');
  bien(svg.includes('decor-capa'), 'su decoración se ve (Decoracion.capa)');
  bien(svg.includes('hq-banderines'), 'sus premios de temporada se ven (banderines)');
  bien(!/class="hq"[^>]*aria-label="Garaje"/.test(svg), 'no sale como garaje (etapa 2 = estudio)');
  bien(V.dibujoSede(vitrina({ etapa: 0, decor: { items: [] }, productora: '' })).includes('MEGACANAL'), 'sin nombre de productora: el letrero usa el alias');
  // Partida rota: no se cae
  bien(/<svg/.test(Art.hq(V.estadoVisita({}))) && /<svg/.test(Art.hq(V.estadoVisita(null))), 'vitrina vacía o nula: igual dibuja');
  // Sin sesión no hay botón
  bien(V.boton(5) === '', 'sin sesión: Visitas.boton no dibuja nada');
  globalThis.Api = { disponible: true, logueado: () => true, estado: { logueado: true, jugador: { id: 7 } } };
  bien(/data-visitar="5"/.test(V.boton(5)), 'con sesión: botón Visitar con el id');
  bien(V.boton(7) === '' && V.boton(0) === '' && V.boton('x') === '', 'nunca para uno mismo ni con id inválido');
  delete globalThis.Api;
  // Textos: 10 idiomas, mismas claves y mismos {marcadores}
  const ks = Object.keys(V.ES);
  const marc = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join();
  bien(Object.keys(V.TRAD).sort().join() === ['de', 'en', 'fr', 'id', 'it', 'pt-BR', 'ru', 'tr', 'zh-CN'].sort().join(), '9 traducciones + español');
  Object.entries(V.TRAD).forEach(([c, d]) => {
    const faltan = ks.filter((k) => !(k in d)), sobran = Object.keys(d).filter((k) => !(k in V.ES));
    const mal = ks.filter((k) => k in d && marc(d[k]) !== marc(V.ES[k]));
    bien(!faltan.length && !sobran.length && !mal.length, `${c}: textos completos${faltan.length ? ' faltan ' + faltan : ''}${sobran.length ? ' sobran ' + sobran : ''}${mal.length ? ' marcadores ' + mal : ''}`);
  });
  // Códigos de error nuevos: en docs/traducciones/errores_nuevos/visitas.json, 10 idiomas
  const ej = JSON.parse(fs.readFileSync(path.join(RAIZ, 'docs/traducciones/errores_nuevos/visitas.json'), 'utf8'));
  const cods = Object.keys(ej._codigos || {});
  bien(cods.length >= 4, 'errores_nuevos/visitas.json trae los códigos');
  ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'].forEach((c) => bien(cods.every((k) => typeof (ej[c] || {})[k] === 'string' && ej[c][k]), `errores ${c}: todos los códigos`));
  // El servidor manda esos códigos
  const php = fs.readFileSync(path.join(RAIZ, 'server/src/Visitas.php'), 'utf8') + fs.readFileSync(path.join(RAIZ, 'server/src/VisitasApi.php'), 'utf8');
  bien(cods.every((k) => php.includes("'" + k + "'")), 'cada código del JSON sale de Visitas.php / VisitasApi.php');
})();

/* ---------- Navegador ---------- */
if (process.argv.includes('--sin-navegador')) { fin(); } else (async () => {
  const { chromium } = require('playwright');
  const BASE = 'http://envivo.test';
  const OUT = path.join(__dirname, 'capturas'); fs.mkdirSync(OUT, { recursive: true });
  let html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  if (!/js\/visitas\.js/.test(html)) html = html.replace('<script defer src="js/copas.js"></script>', '<script defer src="js/copas.js"></script>\n<script defer src="js/visitas.js"></script>');
  // ui.js: la línea de PL_INFO de server/INTEGRAR_VISITAS.md (si todavía no está)
  let ui = fs.readFileSync(path.join(RAIZ, 'js/ui.js'), 'utf8');
  const doc = fs.readFileSync(path.join(RAIZ, 'server/INTEGRAR_VISITAS.md'), 'utf8');
  const lineaPl = "    visitas: ['home', 'inicio.pl.visitas'],";
  bien(doc.includes(lineaPl), 'INTEGRAR_VISITAS.md trae la línea de PL_INFO');
  if (!/visitas: \['home'/.test(ui)) ui = ui.replace("    flota: ['unidad_movil', 'inicio.pl.flota'],\n", "    flota: ['unidad_movil', 'inicio.pl.flota'],\n" + lineaPl + '\n');
  bien(/visitas: \['home', 'inicio.pl.visitas'\]/.test(ui), 'ui.js tiene el lugar de la línea de PL_INFO');
  const save = (() => { const s = G.newGame(11); s.chapter = 1; s.day = 9; s.money = 1000; s.productora = 'Tukán Producciones'; return G.serialize(s); })();

  const srv = { aplausos: { total: 3, hoy: 1, ya_hoy: false }, permitir: true, entregas: [], posts: [] };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    const json = (st, d) => r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (u.pathname === '/js/ui.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: ui });
    if (u.pathname === '/api/estado') return json(200, { ok: true, tienda: { productos: [], premium: [] }, logueado: true, jugador: { id: 7, nombre: 'QF', email: 'qf@envivo.test' }, creditos: 100, vip_activo: false,
      entregas: srv.entregas, inventario: [], plux: { disponible: false, ambiente: 'sandbox' }, servidor: { id: 1, nombre: 'Servidor 1' } });
    if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
    if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
    if (u.pathname === '/api/visitas/sugeridas') return json(200, { ok: true, permitir: srv.permitir, mis_aplausos: { total: 5, hoy: 2 },
      productoras: [{ jugador_id: 42, alias: 'MegaCanal', fama: 33, siglas: 'LDC', aplausos: srv.aplausos.total }, { jugador_id: 43, alias: 'Cerrada TV', fama: 3, siglas: null, aplausos: 0 }] });
    if (u.pathname === '/api/visitas/vitrina') {
      const id = Number(u.searchParams.get('jugador_id'));
      if (id === 43) return json(403, { ok: false, error: 'Esta productora no recibe visitas por ahora.', codigo: 'visitas_cerradas' });
      if (id === 7) return json(200, { ok: true, propio: true, vitrina: vitrina({ jugador_id: 7, alias: 'QF', productora: 'Tukán Producciones', etapa: 0, decor: { items: [] }, trofeos: [], estrellas: [], asociacion: null, flota: [] }), aplausos: { total: 5, hoy: 2, ya_hoy: false }, puede_aplaudir: false, premio: { dinero: 50, tope_dia: 10 } });
      return json(200, { ok: true, propio: false, vitrina: vitrina(), aplausos: srv.aplausos, puede_aplaudir: !srv.aplausos.ya_hoy, premio: { dinero: 50, tope_dia: 10 } });
    }
    if (u.pathname === '/api/visitas/aplaudir') {
      const b = JSON.parse(r.request().postData() || '{}'); srv.posts.push(['aplaudir', b, r.request().headers()['x-envivo']]);
      if (srv.aplausos.ya_hoy) return json(409, { ok: false, error: 'Ya…', codigo: 'aplauso_ya' });
      srv.aplausos = { total: srv.aplausos.total + 1, hoy: srv.aplausos.hoy + 1, ya_hoy: true };
      const e = { id: 501, tipo: 'dinero', item: '-', cantidad: 50, origen: 'aplauso_dado', creado: new Date().toISOString() };
      srv.entregas = [e];
      return json(200, { ok: true, aplausos: srv.aplausos, puede_aplaudir: false, premio: { dinero: 50, tope_alcanzado: false, para_visitado: 50 }, entregas: [e] });
    }
    if (u.pathname === '/api/visitas/ajustes') {
      if (r.request().method() === 'POST') { const b = JSON.parse(r.request().postData() || '{}'); srv.posts.push(['ajustes', b]); srv.permitir = !!b.permitir; }
      return json(200, { ok: true, permitir: srv.permitir, aplausos: { total: 5, hoy: 2, ya_hoy: false } });
    }
    if (u.pathname.startsWith('/api/')) return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    const f = path.join(RAIZ, decodeURIComponent(u.pathname).replace(/^\//, ''));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream', body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript((s) => {
    if (localStorage.getItem('__prueba_init')) return;
    localStorage.setItem('__prueba_init', '1');
    localStorage.setItem('envivo_lang', 'es'); localStorage.setItem('envivo_tycoon_save_v1', s);
    localStorage.setItem('envivo_aviso_cuenta', '3'); localStorage.setItem('envivo_guia_v1', '"hecha"');
  }, save);
  await page.goto(BASE + '/?fecha=2026-10-10');
  await page.waitForTimeout(2200);
  for (let i = 0; i < 6; i++) { const x = await page.$('#overlay.on [data-act^="close"]'); if (!x) break; await x.click(); await page.waitForTimeout(250); }
  const shot = async (n, el) => { await page.waitForTimeout(300); const p = path.join(OUT, 'visitas_' + n + '.png'); if (el) await page.locator(el).first().screenshot({ path: p }); else await page.screenshot({ path: p }); };
  const sinDesborde = async (tag) => {
    const ov = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth,
      (() => { const c = document.getElementById('vis-cuerpo'); return c ? c.scrollWidth - c.clientWidth : 0; })()));
    bien(ov <= 1, `${tag}: sin desplazamiento horizontal (${ov}px)`);
  };

  // 1. Inicio: tarjeta con productoras para visitar (se carga sola y vuelve a pintar)
  await page.waitForSelector('[data-visitas-inicio]', { timeout: 8000 }).catch(() => {});
  const card = page.locator('[data-visitas-inicio]');
  bien(await card.count() === 1, 'Inicio: tarjeta "Visita otras productoras"');
  if (await card.count()) {
    const cab = page.locator('.pl[data-pl="visitas"] .pl-cab');
    bien(/Visita otras productoras/.test(await cab.textContent()), 'Inicio: la fila plegable tiene su título (PL_INFO + inicio.pl.visitas)');
    if (!(await card.isVisible())) await cab.click();
    await card.scrollIntoViewIfNeeded();
    bien(await card.locator('[data-visitar="42"]').count() === 1 && /MegaCanal/.test(await card.textContent()), 'Inicio: MegaCanal con botón Visitar');
    bien(/5 aplausos \(2 hoy\)/.test(await card.textContent()), 'Inicio: mis aplausos');
    await shot('01_inicio', '[data-visitas-inicio]');
    await sinDesborde('Inicio');
    // 2. Visitar
    await card.locator('[data-visitar="42"]').click();
  }
  await page.waitForSelector('#vis-panel:not([hidden]) .vis-hq svg', { timeout: 6000 }).catch(() => {});
  bien(await page.isVisible('#vis-panel'), 'Visitar abre la pantalla de visita');
  const hq = await page.locator('#vis-panel .vis-hq').innerHTML().catch(() => '');
  bien(hq.includes('MEGACANAL STUDIOS'), 'su sede con SU letrero');
  bien(hq.includes('decor-capa') && hq.includes('dc-vitrina'), 'su decoración en la vitrina del local');
  bien(/Estudio/i.test(await page.locator('#vis-panel .vis-hq svg').getAttribute('aria-label') || ''), 'etapa 2 → estudio');
  bien(/De visita en MegaCanal Studios/.test(await page.textContent('#vis-titulo')), 'título "De visita en …"');
  const txt = await page.textContent('#vis-cuerpo');
  bien(/\[LDC\] Los del Cable/.test(txt) && /Sede oficial nivel 7/.test(txt) && /Fama 33/.test(txt), 'asociación, sede oficial y fama');
  bien(await page.locator('#vis-panel .vis-tr').count() === 3 && /Campeón/.test(txt) && /Duelos: puesto 2/.test(txt), 'vitrina de trofeos: copa, duelo, temporada');
  bien(/Concierto/i.test(txt) && /7× con 4-5/.test(txt), 'mejores eventos');
  bien(/Lupe Zoom/.test(txt) && /Ana Ríos/.test(txt), 'personal destacado y estrella');
  bien(/× 2/.test(txt), 'flota');
  bien(!/qf@envivo|email|créditos/i.test(txt), 'no muestra nada privado');
  bien(await page.locator('#vis-panel [data-vis="mensaje"]').count() === 0, 'sin chat privado no hay "Enviar mensaje"');
  await shot('02_visita');
  await page.locator('#vis-cuerpo').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await shot('03_visita_abajo');
  await sinDesborde('Visita');
  // 3. Aplauso: cuenta, botón apagado y $50 que llega como entrega a la partida
  const m0 = await page.evaluate(() => window.__game.state.money);
  await page.locator('#vis-cuerpo').evaluate((e) => { e.scrollTop = 0; });
  await page.click('#vis-panel [data-vis="aplaudir"]');
  await page.waitForTimeout(900);
  bien(srv.posts.some((p) => p[0] === 'aplaudir' && p[1].jugador_id === 42 && p[2] === '1'), 'POST /api/visitas/aplaudir {jugador_id: 42} con X-Envivo');
  bien(/4 aplausos/.test(await page.textContent('#vis-panel [data-vis-total]')), 'la cuenta sube a 4');
  bien(await page.locator('#vis-panel [data-vis="aplaudir"][disabled]').count() === 1 && /Ya aplaudiste hoy/.test(await page.textContent('#vis-panel [data-vis="aplaudir"]')), 'el botón queda apagado ("Ya aplaudiste hoy")');
  await shot('04_aplauso');
  await page.waitForTimeout(800);
  const m1 = await page.evaluate(() => window.__game.state.money);
  bien(m1 === m0 + 50, `el premio de $50 llega a la partida (${m0} → ${m1})`);
  // Volver a entrar: sigue apagado
  await page.click('#vis-panel [data-vis="cerrar"]');
  bien(!(await page.isVisible('#vis-panel')), 'Volver cierra la visita');
  await page.evaluate(() => window.Visitas.abrir(42));
  await page.waitForSelector('#vis-panel:not([hidden]) [data-vis="aplaudir"]');
  bien(await page.locator('#vis-panel [data-vis="aplaudir"][disabled]').count() === 1, 'otra visita el mismo día: sin segundo aplauso');
  // 4. Productora cerrada
  await page.evaluate(() => window.Visitas.abrir(43));
  await page.waitForTimeout(600);
  bien(/no recibe visitas/.test(await page.textContent('#vis-cuerpo')), 'productora cerrada: aviso claro');
  bien(await page.locator('#vis-panel [data-vis="reintentar"]').count() === 0, '…sin botón de reintentar');
  await shot('05_cerrada');
  await page.click('#vis-panel [data-vis="cerrar"]');
  // 5. Mi vitrina con privacidad
  await page.locator('[data-visitas-inicio] [data-acc="mia"]').click();
  await page.waitForSelector('#vis-panel:not([hidden]) [data-vis="privacidad"]', { timeout: 5000 }).catch(() => {});
  bien(/Ver mi vitrina/.test(await page.textContent('#vis-titulo')), 'Mi vitrina');
  bien(await page.locator('#vis-panel [data-vis="aplaudir"]').count() === 0, 'en mi vitrina no hay aplauso');
  bien(await page.locator('#vis-panel [data-vis="privacidad"]').isChecked(), 'privacidad: visitas permitidas por defecto');
  bien((await page.locator('#vis-panel .vis-hq').innerHTML()).includes('TUKÁN PRODUCCIONES'), 'mi sede con mi letrero');
  await page.locator('#vis-panel [data-vis="privacidad"]').click();
  await page.waitForTimeout(500);
  bien(srv.posts.some((p) => p[0] === 'ajustes' && p[1].permitir === false) && srv.permitir === false, 'apagar visitas → POST /api/visitas/ajustes {permitir:false}');
  await shot('06_mi_vitrina');
  await sinDesborde('Mi vitrina');
  await page.click('#vis-panel [data-vis="cerrar"]');
  // 6. Interruptor para la tarjeta de la cuenta (Visitas.ajusteCuenta)
  const aj = await page.evaluate(() => window.Visitas.ajusteCuenta());
  bien(/data-vis="privacidad"/.test(aj), 'Visitas.ajusteCuenta() da el interruptor para la cuenta');
  // 7. En inglés
  await page.evaluate(() => window.I18N.setIdioma('en'));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.Visitas.abrir(42));
  await page.waitForSelector('#vis-panel:not([hidden]) .vis-hq svg');
  bien(/Visiting MegaCanal Studios/.test(await page.textContent('#vis-titulo')) && /Trophy shelf/.test(await page.textContent('#vis-cuerpo')), 'en inglés');
  await shot('07_ingles');
  bien(errs.length === 0, 'sin errores de JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  fin();
})().catch((e) => { console.error(e); fallas++; fin(); });

function fin() {
  console.log(`\nVisitas (cliente): ${aciertos} correctas · ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
}
