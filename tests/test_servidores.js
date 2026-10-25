/* Prueba de "Tu servidor" (js/servidores.js) dentro del juego real (index.html + js/ui.js) en un celular simulado
   (390x844) con Playwright. El servidor se imita aquí: /api/estado, /api/servidor/opciones y /api/servidor/trasladar
   (se revisa que lleven X-Envivo: 1). Casos: servidor sano, poca actividad con sugerencia y ventana de mudanza,
   no se puede mudar (con motivo), mudanza que falla y luego sale bien, aviso de fusión una sola vez (también al
   recargar), sin sesión no hay tarjeta, textos en inglés y diccionarios completos. Revisa que no haya errores de JS
   ni desborde horizontal.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_servidores.js   (capturas en tests/capturas/servidores_*.png) */
'use strict';
// Fecha fija fuera de las temporadas (en Halloween, Navidad… al abrir sale el resumen del día y llegan contratos especiales)
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';

let fallas = 0, bien_ = 0;
function bien(c, msg) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

/* ---------- Diccionarios: todas las traducciones con las mismas claves y marcadores que el español ---------- */
(function () {
  global.window = undefined;
  const g = {};
  const code = fs.readFileSync(path.join(RAIZ, 'js/servidores.js'), 'utf8');
  new Function('window', 'globalThis', code)(g, g);   // eslint-disable-line no-new-func
  const S = g.Servidores;
  const marcas = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join(',');
  const claves = Object.keys(S.ES);
  const idiomas = ['en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
  idiomas.forEach((c) => {
    const d = S.TRAD[c] || {};
    const faltan = claves.filter((k) => d[k] === undefined);
    const malas = claves.filter((k) => d[k] !== undefined && marcas(d[k]) !== marcas(S.ES[k]));
    const sobran = Object.keys(d).filter((k) => S.ES[k] === undefined);
    bien(!faltan.length && !malas.length && !sobran.length, `Traducción ${c}: completa y con los mismos {marcadores}` + (faltan.length ? ' faltan ' + faltan : '') + (malas.length ? ' marcadores ' + malas : '') + (sobran.length ? ' sobran ' + sobran : ''));
  });
  bien(g.EnVivoInicio && g.EnVivoInicio.some((m) => m.id === 'servidores' && m.orden === 5), 'Se registra en EnVivoInicio con orden 5');
  bien(S.tarjeta({ render() {} }) === '', 'Sin Api/sesión la tarjeta queda vacía');
})();

/* ---------- Datos de prueba ---------- */
const SV1 = { id: 1, nombre: 'Servidor 1 · Quito' }, SV2 = { id: 2, nombre: 'Servidor 2 · Guayaquil' }, SV3 = { id: 3, nombre: 'Servidor 3 · Cuenca' };
const UNI = { id: 1, nombre: 'Universo Andino' };
const op = (actual, estado, activos, extra) => Object.assign({ ok: true, actual: Object.assign({}, actual, { estado, activos_7: activos }), universo: UNI,
  sugerido: null, puede: false, motivo: null, proximo_traslado: null }, extra || {});
const CASOS = {
  sano: { servidor: SV2, opciones: op(SV2, 'sano', 184) },
  bajo: { servidor: SV2, opciones: op(SV2, 'bajo', 14, { sugerido: { id: 1, nombre: SV1.nombre, activos_7: 312 }, puede: true }) },
  no_puede: { servidor: SV3, opciones: op(SV3, 'abandono', 3, { sugerido: { id: 1, nombre: SV1.nombre, activos_7: 312 }, puede: false,
    motivo: 'Eres presidente de una asociación con miembros: pasa la presidencia o quédate solo antes de mudarte.', proximo_traslado: '2026-11-14' }) },
  traslado: { servidor: SV2, opciones: op(SV2, 'bajo', 9, { sugerido: { id: 1, nombre: SV1.nombre, activos_7: 312 }, puede: true }), fallarPrimero: true },
  fusion: { servidor: SV1, opciones: op(SV1, 'sano', 330), aviso: { de: SV3.nombre, a: SV1.nombre, fecha: '2026-10-20' } },
  sin_sesion: { logueado: false, servidor: null, opciones: null },
};

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const pagina = html.includes('js/servidores.js') ? html
  : html.replace('<script defer src="js/liga.js"></script>', '<script defer src="js/liga.js"></script>\n<script defer src="js/servidores.js"></script>');
if (!pagina.includes('js/servidores.js')) throw new Error('No se pudo poner js/servidores.js en index.html');

async function abrir(browser, caso, url, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { caso, estadoPedidos: 0, opcionesPedidas: 0, traslados: [], sinCabecera: [] };
  const estado = () => {
    const e = { ok: true, tienda: { productos: [] }, logueado: caso.logueado !== false, entregas: [], inventario: [], creditos: 120 };
    if (e.logueado) { e.jugador = { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }; e.servidor = caso.servidor; }
    if (caso.aviso) e.aviso_fusion = caso.aviso;
    return e;
  };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname.startsWith('/api/servidor/') && req.headers()['x-envivo'] !== '1') srv.sinCabecera.push(u.pathname);
      if (u.pathname === '/api/estado') { srv.estadoPedidos++; return json(200, estado()); }
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/servidor/opciones') {
        srv.opcionesPedidas++;
        if (!caso.opciones) return json(401, { ok: false, error: 'Inicia sesión.', codigo: 'sin_sesion' });
        return json(200, caso.opciones);
      }
      if (u.pathname === '/api/servidor/trasladar') {
        let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = null; }
        srv.traslados.push(body);
        if (req.method() !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
        if (caso.fallarPrimero && srv.traslados.length === 1) return json(503, { ok: false, error: 'El servidor está ocupado, intenta en un momento.', codigo: 'ocupado_prueba' });
        const dest = [SV1, SV2, SV3].find((x) => x.id === (body && body.destino));
        if (!dest) return json(400, { ok: false, error: 'Destino inválido', codigo: 'destino' });
        caso.servidor = dest;
        caso.opciones = op(dest, 'sano', 313, { puede: false, motivo: 'Ya te mudaste hace poco.', proximo_traslado: '2026-11-22' });
        return json(200, { ok: true, servidor: dest });
      }
      return json(200, { ok: true });
    }
    const f = path.join(RAIZ, decodeURIComponent(u.pathname));
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f);
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[ext] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  if (init) await page.addInitScript(init);
  await page.goto(url || BASE + '/', { waitUntil: 'domcontentloaded' });
  // Cerrar la bienvenida (si sale) para quedar en Inicio
  try {
    await page.waitForSelector('#overlay.on [data-act="close"]', { timeout: 4000 });
    if (!(await page.$('#overlay.on [data-srv="aviso-fusion"]'))) await page.click('#overlay.on [data-act="close"]');
  } catch (e) { /* sin bienvenida */ }
  return { ctx, page, errores, srv };
}

async function desborde(page) {
  return page.evaluate(() => {
    const ancho = window.innerWidth;
    const fuera = [...document.querySelectorAll('[data-srv], [data-srv] *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > ancho + 0.5 || r.left < -0.5);
    }).map((el) => el.className || el.tagName);
    return { scroll: document.documentElement.scrollWidth - ancho, fuera: fuera.slice(0, 5) };
  });
}
async function sinDesborde(page, donde) {
  const d = await desborde(page);
  bien(d.scroll <= 0 && !d.fuera.length, `${donde}: sin desborde horizontal` + (d.scroll > 0 ? ` (scroll ${d.scroll}px)` : '') + (d.fuera.length ? ' fuera: ' + d.fuera.join(', ') : ''));
}
const texto = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ')).catch(() => '');
async function foto(page, nombre, sel) {
  const file = path.join(OUT, 'servidores_' + nombre + '.png');
  if (sel) {
    // la tarjeta en contexto: desde un poco antes de la tarjeta, una pantalla de alto
    await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
  } else await page.waitForTimeout(600);   // ventana: esperar a que termine de aparecer
  await page.screenshot({ path: file });
}
async function cerrar(o, nombre) {
  bien(!o.errores.length, `${nombre}: sin errores de JS` + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
  bien(!o.srv.sinCabecera.length, `${nombre}: las peticiones a /api/servidor llevan X-Envivo: 1`);
  await o.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---- 1. Servidor sano ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.sano)));
      await o.page.waitForSelector('[data-srv="tarjeta"] [data-salud]', { timeout: 8000 }).catch(() => {});
      const t = await texto(o.page, '[data-srv="tarjeta"]');
      bien(/Tu servidor/i.test(t) && t.includes('Servidor 2 · Guayaquil') && t.includes('Universo Andino'), 'Sano: muestra "Tu servidor: Servidor 2 · Guayaquil · Universo Andino"');
      bien(await o.page.$eval('[data-srv="tarjeta"] [data-salud]', (el) => el.dataset.salud + '|' + el.textContent.trim()).catch(() => '') === 'sano|Sano', 'Sano: insignia "Sano"');
      bien(!(await o.page.$('[data-ext="servidores"][data-acc="mudar"]')), 'Sano: no sugiere mudarse');
      bien(await o.page.evaluate(() => { const c = [...document.querySelectorAll('#app .card, main .card, .card')]; const i = c.findIndex((x) => x.dataset.srv === 'tarjeta'); return i >= 0; }), 'Sano: la tarjeta está en Inicio');
      const pedidas = o.srv.opcionesPedidas;
      await o.page.click('nav button[data-tab="bodega"]'); await o.page.click('nav button[data-tab="inicio"]');
      await o.page.waitForTimeout(300);
      bien(o.srv.opcionesPedidas === pedidas && pedidas === 1, `Sano: volver a Inicio no repite la consulta (pedidas: ${o.srv.opcionesPedidas})`);
      await sinDesborde(o.page, 'Sano');
      await foto(o.page, 'sano', '[data-srv="tarjeta"]');
      await cerrar(o, 'Sano');
    }

    /* ---- 2. Poca actividad con sugerencia + ventana de mudanza ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.bajo)));
      await o.page.waitForSelector('[data-ext="servidores"][data-acc="mudar"]', { timeout: 8000 }).catch(() => {});
      bien(await o.page.$eval('[data-salud]', (el) => el.dataset.salud + '|' + el.textContent.trim()).catch(() => '') === 'bajo|Poca actividad', 'Bajo: insignia "Poca actividad"');
      const b = await texto(o.page, '[data-ext="servidores"][data-acc="mudar"]');
      bien(b.includes('Mudarte gratis a Servidor 1 · Quito (más activo)'), 'Bajo: botón "Mudarte gratis a Servidor 1 · Quito (más activo)"');
      bien((await texto(o.page, '[data-srv="tarjeta"]')).includes('312'), 'Bajo: muestra las productoras activas del sugerido');
      await sinDesborde(o.page, 'Bajo (tarjeta)');
      await foto(o.page, 'bajo', '[data-srv="tarjeta"]');
      await o.page.click('[data-ext="servidores"][data-acc="mudar"]');
      await o.page.waitForSelector('#overlay.on [data-srv="modal-mudanza"]', { timeout: 3000 }).catch(() => {});
      const m = await texto(o.page, '[data-srv="modal-mudanza"]');
      bien(/Mudarte a Servidor 1 · Quito/.test(m), 'Ventana: título con el destino');
      bien(['Tu productora', 'Todos tus equipos', 'Tus créditos', 'Tu VIP'].every((x) => m.includes(x)), 'Ventana: explica que se mudan producción, equipos, créditos y VIP');
      bien(/Dejas tu asociación/.test(m) && /unirte a una/.test(m), 'Ventana: explica que dejas tu asociación y puedes unirte a una allá');
      await sinDesborde(o.page, 'Ventana de mudanza');
      await foto(o.page, 'modal');
      await o.page.click('#overlay.on [data-srv="modal-mudanza"] .btn:not(.main):not(.sm)');
      await o.page.waitForTimeout(200);
      bien(!(await o.page.$('#overlay.on')) && !o.srv.traslados.length, 'Ventana: "Ahora no" cierra sin mudar');
      await cerrar(o, 'Bajo');
    }

    /* ---- 3. No se puede mudar (con motivo) ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.no_puede)));
      await o.page.waitForSelector('[data-srv="no-puede"]', { timeout: 8000 }).catch(() => {});
      bien(await o.page.$eval('[data-salud]', (el) => el.dataset.salud + '|' + el.textContent.trim()).catch(() => '') === 'abandono|En abandono', 'No puede: insignia "En abandono"');
      const t = await texto(o.page, '[data-srv="no-puede"]');
      bien(/no puedes mudarte/i.test(t) && t.includes('Eres presidente de una asociación con miembros'), 'No puede: muestra el motivo');
      bien(/14 de noviembre/.test(t), 'No puede: muestra la fecha del próximo traslado');
      bien(!(await o.page.$('[data-ext="servidores"][data-acc="mudar"]')), 'No puede: sin botón de mudanza');
      bien((await texto(o.page, '[data-srv="tarjeta"]')).includes('Servidor 3 · Cuenca'), 'No puede: muestra su servidor');
      await sinDesborde(o.page, 'No puede');
      await foto(o.page, 'no_puede', '[data-srv="tarjeta"]');
      await cerrar(o, 'No puede');
    }

    /* ---- 4. Mudanza: primero falla (se ve el error), después sale bien y se refresca ---- */
    {
      const caso = JSON.parse(JSON.stringify(CASOS.traslado));
      const o = await abrir(browser, caso);
      await o.page.waitForSelector('[data-ext="servidores"][data-acc="mudar"]', { timeout: 8000 });
      await o.page.click('[data-ext="servidores"][data-acc="mudar"]');
      await o.page.click('#overlay.on [data-acc="confirmar"]');
      await o.page.waitForSelector('#overlay.on [data-srv="error"]', { timeout: 4000 }).catch(() => {});
      bien((await texto(o.page, '[data-srv="error"]')).includes('ocupado'), 'Traslado: si falla, la ventana muestra el error y deja reintentar');
      const estadosAntes = o.srv.estadoPedidos;
      await o.page.click('#overlay.on [data-acc="confirmar"]');
      await o.page.waitForFunction(() => { const t = document.getElementById('toast'); return t && /Ya estás en/.test(t.textContent || ''); }, null, { timeout: 5000 }).catch(() => {});
      bien(o.srv.traslados.length === 2 && o.srv.traslados[1] && o.srv.traslados[1].destino === 1, 'Traslado: POST /api/servidor/trasladar {destino: 1}');
      bien((await texto(o.page, '#toast')).includes('¡Listo! Ya estás en Servidor 1 · Quito.'), 'Traslado: aviso "¡Listo! Ya estás en Servidor 1 · Quito."');
      bien(!(await o.page.$('#overlay.on')), 'Traslado: se cierra la ventana');
      await o.page.waitForFunction(() => { const c = document.querySelector('[data-srv="tarjeta"]'); return c && /Servidor 1 · Quito/.test(c.textContent); }, null, { timeout: 5000 }).catch(() => {});
      const t = await texto(o.page, '[data-srv="tarjeta"]');
      bien(t.includes('Servidor 1 · Quito') && !t.includes('Guayaquil'), 'Traslado: la tarjeta muestra el nuevo servidor');
      bien(await o.page.$eval('[data-salud]', (el) => el.dataset.salud).catch(() => '') === 'sano' && !(await o.page.$('[data-acc="mudar"]')), 'Traslado: el nuevo servidor sale sano y sin sugerencia');
      bien(o.srv.estadoPedidos > estadosAntes, 'Traslado: vuelve a pedir /api/estado');
      await sinDesborde(o.page, 'Después del traslado');
      await foto(o.page, 'traslado', '[data-srv="tarjeta"]');
      await cerrar(o, 'Traslado');
    }

    /* ---- 5. Aviso de fusión: una sola vez ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.fusion)));
      await o.page.waitForSelector('#overlay.on [data-srv="aviso-fusion"]', { timeout: 8000 }).catch(() => {});
      const m = await texto(o.page, '[data-srv="aviso-fusion"]');
      bien(/Tu servidor se unió con Servidor 1 · Quito/.test(m), 'Fusión: "Tu servidor se unió con Servidor 1 · Quito"');
      bien(/Tu productora y todo lo tuyo están a salvo/.test(m) && m.includes('Servidor 3 · Cuenca') && /20 de octubre/.test(m), 'Fusión: explica que todo está a salvo, de dónde y cuándo');
      await sinDesborde(o.page, 'Aviso de fusión');
      await foto(o.page, 'fusion');
      await o.page.click('#overlay.on [data-srv="aviso-fusion"] .btn.main');
      await o.page.waitForTimeout(200);
      bien(!(await o.page.$('#overlay.on')), 'Fusión: "¡Vamos!" cierra el aviso');
      await o.page.click('nav button[data-tab="bodega"]'); await o.page.click('nav button[data-tab="inicio"]');
      await o.page.waitForTimeout(900);
      bien(!(await o.page.$('#overlay.on [data-srv="aviso-fusion"]')), 'Fusión: al volver a Inicio no se repite');
      const visto = await o.page.evaluate(() => { try { return localStorage.getItem('envivo_avisos_fusion_vistos'); } catch (e) { return null; } });
      bien(visto && visto.includes('Servidor 3 · Cuenca|Servidor 1 · Quito|2026-10-20'), 'Fusión: queda guardado en localStorage');
      await o.page.reload({ waitUntil: 'domcontentloaded' });
      await o.page.waitForSelector('[data-srv="tarjeta"]', { timeout: 8000 }).catch(() => {});
      await o.page.waitForTimeout(1500);
      bien(!(await o.page.$('#overlay.on [data-srv="aviso-fusion"]')), 'Fusión: al recargar el juego no sale otra vez');
      await cerrar(o, 'Fusión');
    }

    /* ---- 5b. Aviso de fusión con localStorage roto: sale una vez y no rompe nada ---- */
    {
      const caso = JSON.parse(JSON.stringify(CASOS.fusion));
      const o = await abrir(browser, caso, null, () => {
        const gi = Storage.prototype.getItem, si = Storage.prototype.setItem;
        Storage.prototype.getItem = function (k) { if (k === 'envivo_avisos_fusion_vistos') throw new Error('bloqueado'); return gi.call(this, k); };
        Storage.prototype.setItem = function (k, v) { if (k === 'envivo_avisos_fusion_vistos') throw new Error('bloqueado'); return si.call(this, k, v); };
      });
      await o.page.waitForSelector('#overlay.on [data-srv="aviso-fusion"]', { timeout: 8000 }).catch(() => {});
      bien(!!(await o.page.$('#overlay.on [data-srv="aviso-fusion"]')), 'Sin localStorage: el aviso sale');
      await o.page.click('#overlay.on [data-srv="aviso-fusion"] .btn.main');
      await o.page.click('nav button[data-tab="bodega"]'); await o.page.click('nav button[data-tab="inicio"]');
      await o.page.waitForTimeout(900);
      bien(!(await o.page.$('#overlay.on [data-srv="aviso-fusion"]')), 'Sin localStorage: no se repite en la misma sesión');
      await cerrar(o, 'Sin localStorage');
    }

    /* ---- 6. Sin sesión: no hay tarjeta ni consulta ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.sin_sesion)));
      await o.page.waitForTimeout(1200);
      bien(!(await o.page.$('[data-srv="tarjeta"]')) && o.srv.opcionesPedidas === 0, 'Sin sesión: no se muestra la tarjeta ni se consulta el servidor');
      await cerrar(o, 'Sin sesión');
    }

    /* ---- 7. Inglés ---- */
    {
      const o = await abrir(browser, JSON.parse(JSON.stringify(CASOS.bajo)), BASE + '/?lang=en');
      await o.page.waitForFunction(() => { const c = document.querySelector('[data-srv="tarjeta"]'); return c && /Your server/.test(c.textContent) && c.querySelector('[data-acc="mudar"]'); }, null, { timeout: 8000 }).catch(() => {});
      const t = await texto(o.page, '[data-srv="tarjeta"]');
      bien(/Your server/.test(t) && /Low activity/.test(t) && /Move for free to Servidor 1 · Quito \(more active\)/.test(t), 'Inglés: tarjeta traducida');
      await sinDesborde(o.page, 'Inglés');
      await foto(o.page, 'en', '[data-srv="tarjeta"]');
      await cerrar(o, 'Inglés');
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${bien_} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
