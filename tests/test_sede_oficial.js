/* Prueba del modo "oficial" de js/sede.js (sede en el servidor, server/src/SedeOficial.php) en un celular de 390x844,
   con fetch SIMULADO (un servidor de mentira en la página que responde /api/sede…):
   - con cuenta: la tarjeta de Inicio y la ventana leen y escriben por /api/sede; la sede local se manda una vez (migrar)
     y queda guardada en s.sedeLocal; s.sede es la copia oficial (los bonos del juego salen del nivel oficial);
   - acelerar muestra el costo antes de cobrar y manda confirmar_costo; ayudar a la asociación; entrega diaria;
   - sin cuenta otra vez: vuelve la sede local, como siempre;
   - sin errores de JavaScript ni desplazamiento horizontal. Capturas: tests/capturas/sede_oficial_*.png
   Uso:  node tests/test_sede_oficial.js */
'use strict';
// Fecha fija fuera de las temporadas (en Halloween, Navidad… al abrir sale el resumen del día y llegan contratos especiales)
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const path = require('path'), fs = require('fs'), os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

/* Servidor de mentira (corre DENTRO de la página, antes que los scripts del juego) */
function servidorFalso() {
  const H = 3600;
  const pedidos = [];
  window.__sedeFalsa = { pedidos };
  let st = null;
  function armar() {
    const S = window.Sede, ahora = Math.floor(Date.now() / 1000);
    const mejoras = {};
    for (let L = 2; L <= 6; L++) S.edificiosDe(L).forEach((ed) => { mejoras[L + '.' + ed] = 1; });
    const eds = S.edificiosDe(7);
    mejoras['7.' + eds[0]] = 1;
    st = { nivel: 6, mejoras, materiales: { cables: 40, placas: 22, paneles: 35, credenciales: 18, planos: 30, chips: 3 }, acel: 120, creditos: 300, cofre: true,
      migrable: true, obras: [
        { id: 41, tipo: 'mejora', ed: eds[1], nivel: 7, inicio: ahora - H, duracion: 8 * H, fin: ahora + 7 * H + 1800, ayudas: 3, ayudas_max: 10 },
        { id: 42, tipo: 'mejora', ed: eds[2], nivel: 7, inicio: ahora - 600, duracion: 8 * H, fin: ahora + 1500, ayudas: 0, ayudas_max: 10 },
      ],
      ayudas: [
        { obra_id: 77, jugador_id: 5, nombre: 'Productora Cotopaxi con un nombre muy largo para ver el corte', tipo: 'mejora', ed: 'control', nivel: 9, restante: 5 * H + 120, ayudas: 4, ayudas_max: 10, segundos_ayuda: 300 },
        { obra_id: 78, jugador_id: 6, nombre: 'Majo TV', tipo: 'nivel', ed: 'sede', nivel: 12, restante: 30 * H, ayudas: 9, ayudas_max: 10, segundos_ayuda: 1080 },
      ], hoy: { ayudas: 2, max: 30, premios: 2, premios_max: 10 } };
  }
  const costo = (r) => (r <= 0 ? 0 : Math.max(5, Math.ceil(r / 360)));
  function vista() {
    const S = window.Sede, ahora = Math.floor(Date.now() / 1000), L = st.nivel + 1;
    const obras = st.obras.map((o) => Object.assign({}, o, { restante: Math.max(0, o.fin - ahora), costo_creditos: costo(o.fin - ahora), segundos_ayuda: 300 }));
    const falta = (mat) => { const f = {}; Object.keys(mat).forEach((m) => { if ((st.materiales[m] || 0) < mat[m]) f[m] = mat[m] - (st.materiales[m] || 0); }); return f; };
    const mej = S.edificiosDe(L).map((ed) => {
      const c = S.costo(L, ed); const o = st.obras.find((x) => x.ed === ed && x.nivel === L);
      return { ed, mat: c.mat, dias: c.dias, segundos: c.dias * 3 * H, hecha: !!st.mejoras[L + '.' + ed], obra_id: o ? o.id : null, falta: falta(c.mat),
        nivel_ed: Object.keys(st.mejoras).filter((k) => k.split('.')[1] === ed).length };
    });
    const cs = S.costo(L, 'sede');
    return { ok: true, ahora, dia: '2026-10-23', creditos: st.creditos, reglas: { seg_por_credito: 360, costo_min: 5, ayudas_max: 10, ayuda_pct: 0.01, ayuda_min_seg: 300 },
      sede: { nivel: st.nivel, max: false, materiales: Object.assign({}, st.materiales), aceleradores_min: st.acel, mejoras: Object.assign({}, st.mejoras), obreros: 2,
        etapa: { objetivo: L, mejoras: mej, hechas: mej.filter((m) => m.hecha).length,
          sede: { mat: cs.mat, dias: cs.dias, segundos: cs.dias * 3 * H, obra_id: null, falta: falta(cs.mat), req: [{ k: 'req_fama', p: { n: 18 }, ok: true }], listo: false } },
        obras, cofre: { disponible: st.cofre, proximo: ahora + 9 * H }, bono_competencia: 2, migracion: { posible: st.migrable, nivel_max: 8 } } };
  }
  const resp = (code, j) => Promise.resolve(new Response(JSON.stringify(j), { status: code, headers: { 'Content-Type': 'application/json' } }));
  const original = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, op) {
    const u = String(url), m = /\/api\/sede(\/[a-z]+)?$/.exec(u.split('?')[0]);
    // Las otras rutas del servidor (Copa, servidores…) no son de esta prueba: 404 como un servidor sin ese módulo
    if (!m) return /\/api\//.test(u) ? resp(404, { ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }) : (original ? original(url, op) : Promise.reject(new TypeError('sin red')));
    if (!st) armar();
    const ruta = m[1] || '', metodo = (op && op.method) || 'GET', body = op && op.body ? JSON.parse(op.body) : null;
    pedidos.push({ ruta, metodo, body, cabecera: op && op.headers && op.headers['X-Envivo'] });
    const ahora = Math.floor(Date.now() / 1000);
    if (metodo === 'POST' && !(op.headers && op.headers['X-Envivo'] === '1')) return resp(403, { ok: false, error: 'Petición no permitida.', codigo: 'cabecera_requerida' });
    if (ruta === '' && metodo === 'GET') return resp(200, vista());
    if (ruta === '/ayudas') return resp(200, { ok: true, asociacion: 3, hoy: st.hoy, obras: st.ayudas });
    if (ruta === '/migrar') {
      if (!st.migrable) return resp(409, { ok: false, error: 'Ya.', codigo: 'ya_migrado' });
      st.migrable = false;
      return resp(200, Object.assign({ aceptado: { nivel: Math.min(8, body.local.nivel) }, tope: 8, recortado: false }, vista()));
    }
    if (ruta === '/cofre') { if (!st.cofre) return resp(409, { ok: false, error: 'Ya reclamaste la entrega de hoy.', codigo: 'cofre_ya' }); st.cofre = false; st.materiales.planos += 4; st.materiales.cables += 3; return resp(200, Object.assign({ bolsa: { cables: 3, planos: 4 } }, vista())); }
    if (ruta === '/acelerar') {
      const o = st.obras.find((x) => x.id === body.obra_id);
      if (!o) return resp(404, { ok: false, error: 'Esa obra no existe.', codigo: 'obra_no_existe' });
      if (body.usar === 'aceleradores') { const u = Math.min(st.acel, Math.ceil((o.fin - ahora) / 60)); st.acel -= u; o.fin -= u * 60; if (o.fin <= ahora) { st.obras = st.obras.filter((x) => x !== o); st.mejoras[o.nivel + '.' + o.ed] = 1; } return resp(200, Object.assign({ costo: 0, minutos: u }, vista())); }
      const c = costo(o.fin - ahora);
      if (typeof body.confirmar_costo !== 'number') return resp(400, { ok: false, error: 'Confirma el costo para acelerar.', codigo: 'confirmar_costo', costo: c });
      if (body.confirmar_costo < c) return resp(409, { ok: false, error: 'El costo cambió.', codigo: 'costo_cambio', costo: c });
      st.creditos -= c; st.obras = st.obras.filter((x) => x !== o); st.mejoras[o.nivel + '.' + o.ed] = 1;
      return resp(200, Object.assign({ costo: c, minutos: 0 }, vista()));
    }
    if (ruta === '/ayudar') {
      st.ayudas = st.ayudas.filter((x) => x.obra_id !== body.obra_id); st.hoy.ayudas++; st.hoy.premios++; st.materiales.cables++;
      return resp(200, { ok: true, segundos: 300, premio: { cables: 1 }, lista: { ok: true, asociacion: 3, hoy: st.hoy, obras: st.ayudas } });
    }
    if (ruta === '/mejorar') return resp(409, { ok: false, error: 'Te faltan materiales.', codigo: 'faltan_materiales', falta: { placas: 3 } });
    return resp(404, { ok: false, error: 'No encontrado.', codigo: 'no_encontrado' });
  };
}

(async () => {
  const raiz = path.resolve(__dirname, '..');
  let html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  if (!/js\/sede\.js/.test(html)) html = html.replace('<script src="js/ui.js"></script>', '<script src="js/sede.js"></script>\n<script src="js/ui.js"></script>');
  html = html.replace(/<head>/i, `<head><base href="file://${raiz}/">`);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sedeof-')), 'index.html');
  fs.writeFileSync(tmp, html);
  const out = path.join(__dirname, 'capturas'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(FECHA_FIJA);
  const page = await ctx.newPage();
  const errs = [];
  let n = 0;
  const ok = (c, m) => { n++; if (!c) errs.push(m); };
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_|net::|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(servidorFalso);
  await page.goto('file://' + tmp, { waitUntil: 'domcontentloaded' });
  const shot = async (nombre) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(out, 'sede_oficial_' + nombre + '.png') }); };
  const noHScroll = async (tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(ov <= 1, `${tag}: desplazamiento horizontal (${ov}px)`);
    const modal = await page.evaluate(() => { const m = document.getElementById('modal'); return m ? m.scrollWidth - m.clientWidth : 0; });
    ok(modal <= 1, `${tag}: la ventana se sale por los costados (${modal}px)`);
  };
  const pedidos = () => page.evaluate(() => window.__sedeFalsa.pedidos.slice());
  await page.waitForSelector('#overlay.on');
  await page.locator('[data-act="close"]').first().click();
  await page.waitForSelector('.sd-card');
  ok(!(await page.locator('.sd-card.sd-of').count()), 'sin cuenta la tarjeta no debería ser la oficial');
  // En español (el navegador de prueba puede venir en inglés)
  if (await page.evaluate(() => !!(window.I18N && window.I18N.setIdioma))) {
    await page.evaluate(() => window.I18N.setIdioma('es'));
    await page.waitForFunction(() => window.I18N.idioma === 'es', null, { timeout: 5000 }).catch(() => errs.push('no cambió a español'));
  }

  // Partida local con progreso (nivel 3) y después "entra a su cuenta"
  await page.evaluate(() => {
    const s = window.__game.state, S = window.Sede;
    s.sede.nivel = 3; for (let L = 2; L <= 3; L++) S.edificiosDe(L).forEach((ed) => { s.sede.mejoras[L + '.' + ed] = 1; });
    s.sede.materiales.cables = 25;
    window.Api.disponible = true;
    window.Api.estado = Object.assign({}, window.Api.estado || {}, { logueado: true, jugador: { id: 7, email: 'a@b.c', nombre: 'Prueba' }, tienda: { productos: [], premium: [] } });
  });
  await page.locator('nav button[data-tab="inicio"]').click();
  await page.waitForSelector('.sd-card.sd-of .sd-lv', { timeout: 8000 });
  await page.waitForFunction(() => window.__sedeFalsa.pedidos.some((p) => p.ruta === '/migrar'), null, { timeout: 5000 }).catch(() => errs.push('no mandó la sede local (migrar)'));
  await page.waitForTimeout(300);
  let ps = await pedidos();
  const mig = ps.find((p) => p.ruta === '/migrar');
  ok(mig && mig.body.local.nivel === 3 && mig.body.local.materiales.cables === 25 && mig.cabecera === '1', 'migrar no mandó la sede local con X-Envivo');
  ok(ps.filter((p) => p.ruta === '/migrar').length === 1, 'migrar se mandó más de una vez');
  const est = await page.evaluate(() => { const s = window.__game.state; return { nivel: s.sede.nivel, oficial: !!s.sede.oficial, local: s.sedeLocal && s.sedeLocal.nivel, obras: s.sede.obras.length, bono: window.Sede.bonos(s).tope }; });
  ok(est.oficial && est.nivel === 6 && est.local === 3 && est.obras === 0, 'la copia oficial no quedó en s.sede (o la local no quedó en s.sedeLocal): ' + JSON.stringify(est));
  ok(est.bono === 3, 'los bonos del juego no salen del nivel oficial (tope esperado 3 al nivel 6): ' + est.bono);
  const card = await page.locator('.sd-card.sd-of').innerText();
  ok(/Nivel 6/.test(card) && /Oficial/.test(card) && /7 h 30 min/.test(card) && /25 min/.test(card), 'la tarjeta oficial no muestra nivel y tiempos reales: ' + card.replace(/\s+/g, ' '));
  await page.locator('.sd-card.sd-of').scrollIntoViewIfNeeded();
  await shot('01_tarjeta'); await noHScroll('tarjeta oficial');

  // Ventana: obras con tiempo real, costo de acelerar a la vista, ayudas de la asociación
  await page.locator('.sd-card.sd-of .sd-head').click();
  await page.waitForSelector('#modal .sd-modal.sd-of');
  await page.waitForSelector('#modal [data-acc="ayudar"]', { timeout: 5000 }).catch(() => errs.push('no cargó la lista de ayudas'));
  const costoVisto = Number(await page.locator('#modal [data-acc="acelerar"][data-obra="41"]').getAttribute('data-costo'));
  ok(costoVisto >= 75 && costoVisto <= 76, 'costo de acelerar 7,5 h debería ser 75 créditos: ' + costoVisto);
  ok(/75 créditos|76 créditos/.test(await page.locator('#modal [data-acc="acelerar"][data-obra="41"]').innerText()), 'el botón no muestra el costo');
  ok(/Cuenta en la Copa y los Duelos: \+2/.test(await page.locator('#modal .sd-of-info').innerText()), 'falta el bono de competencia');
  ok(await page.locator('#modal [data-acc="acel_min"]').count() === 2, 'faltan los botones de usar aceleradores');
  await shot('02_modal'); await noHScroll('ventana oficial');

  // Acelerar: primero el costo, después se cobra con confirmar_costo
  await page.locator('#modal [data-acc="acelerar"][data-obra="41"]').click();
  await page.waitForSelector('#modal [data-act="confirm-yes"]');
  const pregunta = await page.locator('#modal').innerText();
  ok(pregunta.includes(String(costoVisto) + ' créditos') && pregunta.includes('300'), 'la confirmación no muestra el costo y el saldo: ' + pregunta.replace(/\s+/g, ' '));
  ps = await pedidos();
  ok(!ps.some((p) => p.ruta === '/acelerar'), 'cobró antes de confirmar');
  await shot('03_confirmar'); await noHScroll('confirmar');
  await page.locator('#modal [data-act="confirm-yes"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#modal .sd-modal.sd-of .sd-of-obra').length === 1, null, { timeout: 5000 }).catch(() => errs.push('la obra acelerada no desapareció'));
  ps = await pedidos();
  const ac = ps.find((p) => p.ruta === '/acelerar');
  ok(ac && ac.body.obra_id === 41 && ac.body.confirmar_costo === costoVisto, 'acelerar no mandó confirmar_costo: ' + JSON.stringify(ac && ac.body));
  ok(await page.evaluate(() => !!window.__game.state.sede.mejoras['7.' + window.Sede.edificiosDe(7)[1]]), 'la mejora acelerada no quedó en la copia local');
  await shot('04_acelerado');

  // Ayudar a la asociación
  await page.locator('#modal [data-acc="ayudar"][data-obra="77"]').scrollIntoViewIfNeeded();
  await shot('05_ayudas'); await noHScroll('ayudas');
  await page.locator('#modal [data-acc="ayudar"][data-obra="77"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal [data-acc="ayudar"][data-obra="77"]'), null, { timeout: 5000 }).catch(() => errs.push('la obra ayudada sigue en la lista'));
  ps = await pedidos();
  const ay = ps.find((p) => p.ruta === '/ayudar');
  ok(ay && ay.body.jugador_id === 5 && ay.body.obra_id === 77, 'ayudar no mandó jugador_id y obra_id');
  ok(/Hoy: 3\/30/.test(await page.locator('#modal').innerText()), 'no se actualizó el contador de ayudas');
  await page.locator('#modal [data-acc="ayudar"]').first().scrollIntoViewIfNeeded();
  await shot('06_ayudado');
  // Mejorar sin materiales: el error del servidor sale en el idioma del juego (sin romper nada)
  const mb = page.locator('#modal [data-acc="mejorar"]').first();
  if (await mb.count()) { await mb.scrollIntoViewIfNeeded(); await mb.click(); await page.waitForTimeout(400); }
  await page.locator('#modal [data-act="close"]').first().click();

  // Entrega del día por el servidor
  await page.locator('.sd-card.sd-of [data-acc="cofre"]').click();
  await page.waitForFunction(() => !document.querySelector('.sd-card.sd-of [data-acc="cofre"]'), null, { timeout: 5000 }).catch(() => errs.push('el botón de la entrega sigue activo'));
  ok(await page.evaluate(() => window.__game.state.sede.materiales.planos) === 34, 'la entrega del servidor no llegó a la copia');
  ok(/vuelve en 9 h/.test(await page.locator('.sd-card.sd-of').innerText()), 'no dice cuándo vuelve la entrega');
  await page.locator('.sd-card.sd-of').scrollIntoViewIfNeeded();
  await shot('07_tarjeta_entrega'); await noHScroll('entrega');

  // En inglés
  if (await page.evaluate(() => !!(window.I18N && window.I18N.setIdioma))) {
    await page.evaluate(() => window.I18N.setIdioma('en'));
    await page.waitForFunction(() => window.I18N.idioma === 'en', null, { timeout: 5000 }).catch(() => errs.push('no cambió a inglés'));
    await page.locator('nav button[data-tab="inicio"]').click();
    await page.locator('.sd-card.sd-of .sd-head').click();
    await page.waitForSelector('#modal .sd-modal.sd-of');
    ok(/Official/.test(await page.locator('#modal').innerText()), 'la ventana no está en inglés');
    await shot('08_modal_en'); await noHScroll('inglés');
    await page.locator('#modal [data-act="close"]').first().click();
    await page.evaluate(() => window.I18N.setIdioma('es'));
  }

  // Sin cuenta otra vez: vuelve la sede local (nivel 3), como siempre
  await page.evaluate(() => { window.Api.estado = Object.assign({}, window.Api.estado, { logueado: false, jugador: null }); });
  await page.locator('nav button[data-tab="inicio"]').click();
  await page.waitForSelector('.sd-card:not(.sd-of)');
  const loc = await page.evaluate(() => { const s = window.__game.state; return { nivel: s.sede.nivel, oficial: !!s.sede.oficial, guardada: !!s.sedeLocal, cables: s.sede.materiales.cables }; });
  ok(loc.nivel === 3 && !loc.oficial && !loc.guardada && loc.cables === 25, 'no volvió la sede local: ' + JSON.stringify(loc));
  await page.locator('.sd-card').scrollIntoViewIfNeeded();
  await shot('09_local_otra_vez'); await noHScroll('local');

  // Respuesta sin la forma esperada ({ok:true}) y después errores 500: pocos pedidos en 30 s aunque se repinte mucho
  for (const caso of [{ nombre: 'ok_vacio', code: 200, cuerpo: { ok: true } }, { nombre: 'error_500', code: 500, cuerpo: { ok: false, error: 'x', codigo: 'error_servidor' } }]) {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx2.addInitScript(FECHA_FIJA);
    const p2 = await ctx2.newPage();
    await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    p2.on('pageerror', (e) => errs.push(caso.nombre + ' pageerror: ' + e.message));
    await p2.addInitScript((c) => {
      window.__cuenta = 0;
      const orig = window.fetch ? window.fetch.bind(window) : null;
      window.fetch = (url, op) => {
        const u = String(url);
        if (/\/api\/sede/.test(u)) { window.__cuenta++; return Promise.resolve(new Response(JSON.stringify(c.cuerpo), { status: c.code, headers: { 'Content-Type': 'application/json' } })); }
        if (/\/api\//.test(u)) return Promise.resolve(new Response('{"ok":false,"codigo":"no_encontrado"}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
        return orig ? orig(url, op) : Promise.reject(new TypeError('sin red'));
      };
    }, caso);
    await p2.goto('file://' + tmp, { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('#overlay.on');
    await p2.locator('[data-act="close"]').first().click();
    await p2.evaluate(() => {
      window.Api.disponible = true;
      window.Api.estado = Object.assign({}, window.Api.estado || {}, { logueado: true, jugador: { id: 9 }, tienda: { productos: [], premium: [] } });
    });
    const t0 = Date.now();
    let vueltas = 0;
    while (Date.now() - t0 < 30000) {   // 30 s repintando (cambiar de pestaña) y abriendo la ventana de la sede
      await p2.locator('nav button[data-tab="' + (vueltas % 2 ? 'inicio' : 'personal') + '"]').click();
      if (vueltas % 10 === 5 && await p2.locator('.sd-card').count()) { await p2.locator('.sd-card .sd-head').first().click().catch(() => {}); await p2.locator('#modal [data-act="close"]').first().click().catch(() => {}); }
      vueltas++;
      await p2.waitForTimeout(250);
    }
    const cuenta = await p2.evaluate(() => window.__cuenta);
    ok(cuenta >= 1 && cuenta <= 5, `${caso.nombre}: ${cuenta} pedidos a /api/sede en 30 s (${vueltas} repintados); máximo 5`);
    console.log(`  ${caso.nombre}: ${cuenta} pedidos a /api/sede en 30 s con ${vueltas} repintados`);
    await ctx2.close();
  }

  await browser.close();
  if (errs.length) { console.error('❌ Sede oficial (navegador):\n' + errs.join('\n')); process.exit(1); }
  console.log(`✅ Sede oficial OK: ${n} revisiones, sin errores (capturas en tests/capturas/sede_oficial_*.png)`);
})().catch((e) => { console.error('❌ Sede oficial (navegador):', e); process.exit(1); });
