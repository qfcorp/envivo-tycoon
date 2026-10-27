/* Prueba de "mejorar la sede con 💎" (pedido de Dimitry, oct. 2026) en un celular de 390x844, con fetch SIMULADO:
   - sin cuenta (con servidor): la sede local muestra los botones de 💎 con candado "con cuenta"; tocarlo explica por qué y
     ofrece crear la cuenta o entrar (los botones de siempre de js/ui.js);
   - con cuenta (sede oficial): "Completar materiales con 💎 (N)" con N = lo que falta × precio (3 por material, 30 por chip),
     "Mejorar ya con 💎 (M)" y "Terminar ya con 💎 (n)" en las obras; siempre se confirma el total ANTES de cobrar y se manda
     {diamantes, confirmar_costo}; sin saldo los botones quedan apagados con "Te faltan X 💎";
   - sin errores de JavaScript ni desplazamiento horizontal. Capturas: tests/capturas/sede_diamantes_*.png
   Uso:  node tests/test_sede_diamantes.js */
'use strict';
const FECHA_FIJA = () => { window.__ENVIVO_FECHA = '2026-06-10'; };
const path = require('path'), fs = require('fs'), os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

/* Servidor de mentira (corre DENTRO de la página, antes que los scripts del juego) */
function servidorFalso() {
  const H = 3600;
  const pedidos = [];
  window.__dmFalso = { pedidos };
  let st = null;
  const costo = (r) => (r <= 0 ? 0 : Math.max(5, Math.ceil(r / 360)));
  function armar() {
    const S = window.Sede, ahora = Math.floor(Date.now() / 1000);
    const mejoras = {};
    for (let L = 2; L <= 6; L++) S.edificiosDe(L).forEach((ed) => { mejoras[L + '.' + ed] = 1; });
    const eds = S.edificiosDe(7);
    st = { nivel: 6, mejoras, materiales: { cables: 4, placas: 3, paneles: 2, credenciales: 5, planos: 1, chips: 0 }, creditos: 900,
      obras: [{ id: 51, tipo: 'mejora', ed: eds[3], nivel: 7, inicio: ahora - H, duracion: 8 * H, fin: ahora + 2 * H, ayudas: 0, ayudas_max: 10 }], sig: 60 };
  }
  window.__dmFalso.estado = () => st;
  function vista() {
    const S = window.Sede, ahora = Math.floor(Date.now() / 1000), L = st.nivel + 1;
    const obras = st.obras.map((o) => Object.assign({}, o, { restante: Math.max(0, o.fin - ahora), costo_creditos: costo(o.fin - ahora), segundos_ayuda: 300 }));
    const falta = (mat) => { const f = {}; Object.keys(mat).forEach((m) => { if ((st.materiales[m] || 0) < mat[m]) f[m] = mat[m] - (st.materiales[m] || 0); }); return f; };
    const conPrecio = (o) => { const so = o.segundos; return Object.assign(o, { segundos_obra: so, creditos_materiales: S.precioDm(o.falta), creditos_ya: S.precioDm(o.falta) + costo(so) }); };
    const mej = S.edificiosDe(L).map((ed) => {
      const c = S.costo(L, ed); const o = st.obras.find((x) => x.ed === ed && x.nivel === L);
      return conPrecio({ ed, mat: c.mat, dias: c.dias, segundos: c.dias * 3 * H, hecha: !!st.mejoras[L + '.' + ed], obra_id: o ? o.id : null, falta: falta(c.mat),
        nivel_ed: Object.keys(st.mejoras).filter((k) => k.split('.')[1] === ed).length });
    });
    const cs = S.costo(L, 'sede');
    const nh = mej.filter((m) => m.hecha).length;
    return { ok: true, ahora, dia: '2026-10-23', creditos: st.creditos, reglas: { seg_por_credito: 360, costo_min: 5, ayudas_max: 10, ayuda_pct: 0.01, ayuda_min_seg: 300, credito_material: 3, credito_chip: 30 },
      sede: { nivel: st.nivel, max: false, materiales: Object.assign({}, st.materiales), aceleradores_min: 0, mejoras: Object.assign({}, st.mejoras), obreros: 2,
        etapa: { objetivo: L, mejoras: mej, hechas: nh,
          sede: conPrecio({ mat: cs.mat, dias: cs.dias, segundos: cs.dias * 3 * H, obra_id: null, falta: falta(cs.mat), req: [{ k: 'req_fama', p: { n: 18 }, ok: true }], listo: nh === mej.length }) },
        obras, cofre: { disponible: false, proximo: ahora + 9 * H }, bono_competencia: 2, migracion: { posible: false, nivel_max: 8 } } };
  }
  const resp = (code, j) => Promise.resolve(new Response(JSON.stringify(j), { status: code, headers: { 'Content-Type': 'application/json' } }));
  const original = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, op) {
    const u = String(url), m = /\/api\/sede(\/[a-z]+)?$/.exec(u.split('?')[0]);
    if (!m) return /\/api\//.test(u) ? resp(404, { ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }) : (original ? original(url, op) : Promise.reject(new TypeError('sin red')));
    if (!st) armar();
    const ruta = m[1] || '', metodo = (op && op.method) || 'GET', body = op && op.body ? JSON.parse(op.body) : null;
    pedidos.push({ ruta, metodo, body });
    const ahora = Math.floor(Date.now() / 1000), S = window.Sede, L = st.nivel + 1;
    if (ruta === '' && metodo === 'GET') return resp(200, vista());
    if (ruta === '/ayudas') return resp(200, { ok: true, asociacion: null, hoy: { ayudas: 0, max: 30, premios: 0, premios_max: 10 }, obras: [] });
    if (ruta === '/mejorar' || ruta === '/subir') {
      const ed = ruta === '/subir' ? 'sede' : body.clave;
      const v = vista(), it = ed === 'sede' ? v.sede.etapa.sede : v.sede.etapa.mejoras.find((x) => x.ed === ed);
      if (!it) return resp(400, { ok: false, error: 'Ese edificio no tiene mejora en este nivel.', codigo: 'edificio_invalido' });
      if (it.hecha || it.obra_id) return resp(409, { ok: false, error: 'Esa mejora ya está en obra.', codigo: 'en_obra' });
      if (!body.diamantes) return resp(409, { ok: false, error: 'Te faltan materiales.', codigo: 'faltan_materiales', falta: it.falta });
      const c = body.diamantes === 'ya' ? it.creditos_ya : it.creditos_materiales;
      if (typeof body.confirmar_costo !== 'number') return resp(400, { ok: false, error: 'Confirma el costo en créditos.', codigo: 'confirmar_costo', costo: c });
      if (body.confirmar_costo < c) return resp(409, { ok: false, error: 'El costo cambió.', codigo: 'costo_cambio', costo: c });
      if (st.creditos < c) return resp(402, { ok: false, error: 'No tienes créditos suficientes.', codigo: 'sin_creditos', costo: c });
      st.creditos -= c;
      Object.keys(it.mat).forEach((k) => { st.materiales[k] = Math.max(0, (st.materiales[k] || 0) - it.mat[k]); });
      if (body.diamantes === 'ya') { if (ed === 'sede') st.nivel = L; else st.mejoras[L + '.' + ed] = 1; }
      else st.obras.push({ id: st.sig++, tipo: ed === 'sede' ? 'nivel' : 'mejora', ed, nivel: L, inicio: ahora, duracion: it.segundos, fin: ahora + it.segundos, ayudas: 0, ayudas_max: 10 });
      return resp(200, Object.assign({ costo: c }, vista()));
    }
    if (ruta === '/acelerar') {
      const o = st.obras.find((x) => x.id === body.obra_id);
      if (!o) return resp(404, { ok: false, error: 'Esa obra no existe.', codigo: 'obra_no_existe' });
      const c = costo(o.fin - ahora);
      if (typeof body.confirmar_costo !== 'number') return resp(400, { ok: false, error: 'Confirma.', codigo: 'confirmar_costo', costo: c });
      st.creditos -= c; st.obras = st.obras.filter((x) => x !== o); st.mejoras[o.nivel + '.' + o.ed] = 1;
      return resp(200, Object.assign({ costo: c, minutos: 0 }, vista()));
    }
    return resp(404, { ok: false, error: 'No encontrado.', codigo: 'no_encontrado' });
  };
}

(async () => {
  const raiz = path.resolve(__dirname, '..');
  let html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  if (!/js\/sede\.js/.test(html)) html = html.replace('<script src="js/ui.js"></script>', '<script src="js/sede.js"></script>\n<script src="js/ui.js"></script>');
  html = html.replace(/<head>/i, `<head><base href="file://${raiz}/">`);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sededm-')), 'index.html');
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
  const shot = async (nombre) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(out, 'sede_diamantes_' + nombre + '.png') }); };
  const noHScroll = async (tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(ov <= 1, `${tag}: desplazamiento horizontal (${ov}px)`);
    const modal = await page.evaluate(() => { const m = document.getElementById('modal'); return m ? m.scrollWidth - m.clientWidth : 0; });
    ok(modal <= 1, `${tag}: la ventana se sale por los costados (${modal}px)`);
  };
  const pedidos = () => page.evaluate(() => window.__dmFalso.pedidos.slice());
  const hub = require('./hub_ayuda');
  await page.waitForSelector('#overlay.on');
  await page.locator('[data-act="close"]').first().click();
  if (await page.evaluate(() => !!(window.I18N && window.I18N.setIdioma))) {
    await page.evaluate(() => window.I18N.setIdioma('es'));
    await page.waitForFunction(() => window.I18N.idioma === 'es', null, { timeout: 5000 }).catch(() => errs.push('no cambió a español'));
  }
  ok(await page.evaluate(() => window.Sede.precioDm({ cables: 2, placas: 1, chips: 1 })) === 39, 'precioDm: 3 por material y 30 por chip');

  // ---------- Sin cuenta, con servidor: candado "con cuenta" en la sede local ----------
  await page.evaluate(() => { window.Api.disponible = true; window.Api.estado = Object.assign({}, window.Api.estado || {}, { logueado: false, jugador: null }); });
  if (!(await hub.verEnInicio(page, '.sd-card', 30000))) throw new Error('no apareció la tarjeta de la sede en Inicio (Tu sede)');
  ok(!(await page.locator('.sd-card.sd-of').count()), 'sin cuenta la tarjeta no debería ser la oficial');
  await page.locator('.sd-card .sd-head').first().click();
  await page.waitForSelector('#modal .sd-modal');
  const locks = page.locator('#modal [data-acc="dm_cuenta"]');
  const nLocks = await locks.count();
  const local = await page.evaluate(() => { const e = window.Sede.etapa(window.__game.state); return e.mejoras.filter((m) => !m.hecha && !m.obra && Object.keys(m.falta).length).map((m) => window.Sede.precioDm(m.falta)); });
  ok(nLocks === local.length && nLocks > 0, `sin cuenta: ${nLocks} botones con candado (esperados ${local.length})`);
  const tLock = await locks.first().innerText();
  ok(/🔒/.test(tLock) && /Completar materiales con 💎 \(\d+\)/.test(tLock) && /con cuenta/.test(tLock) && tLock.includes('(' + local[0] + ')'), 'el candado no dice "Completar materiales con 💎 (N) · con cuenta": ' + tLock);
  await locks.first().scrollIntoViewIfNeeded();
  await shot('01_local_candado'); await noHScroll('local con candado');
  await locks.first().click();
  await page.waitForSelector('#modal [data-act="cuenta"][data-modo="registro"]', { timeout: 5000 }).catch(() => errs.push('el candado no ofrece crear la cuenta'));
  ok(/se usan con cuenta/.test(await page.locator('#modal').innerText()), 'falta la explicación de por qué los 💎 piden cuenta');
  ok(!(await pedidos()).some((p) => p.metodo === 'POST'), 'sin cuenta no debería pedir nada al servidor');
  await shot('02_local_cuenta'); await noHScroll('pedir cuenta');
  await page.locator('#modal [data-act="cuenta"][data-modo="registro"]').click();
  await page.waitForSelector('#formCuenta', { timeout: 5000 }).catch(() => errs.push('no se abrió el formulario de la cuenta'));
  await page.locator('#modal [data-act="close"]').first().click();
  // Una obra local en curso: "Terminar ya con 💎" también con candado
  await page.evaluate(() => {
    const s = window.__game.state, S = window.Sede;
    Object.assign(s.sede.materiales, { cables: 99, placas: 99, paneles: 99, credenciales: 99, planos: 99 }); s.money = Math.max(s.money, 50000);
    S.mejorar(s, S.edificiosDe(2)[0]);
  });
  await page.locator('nav button[data-tab="inicio"]').click();
  await hub.verEnInicio(page, '.sd-card', 8000);
  await page.locator('.sd-card .sd-head').first().click();
  await page.waitForSelector('#modal .sd-modal');
  ok(/Terminar ya con 💎 · con cuenta/.test(await page.locator('#modal').innerText()), 'la obra local no muestra "Terminar ya con 💎" con candado');
  await page.locator('#modal [data-act="close"]').first().click();

  // ---------- Con cuenta: sede oficial ----------
  await page.evaluate(() => {
    window.Api.estado = Object.assign({}, window.Api.estado || {}, { logueado: true, jugador: { id: 7, email: 'a@b.c', nombre: 'Prueba' }, tienda: { productos: [], premium: [] } });
  });
  await page.locator('nav button[data-tab="inicio"]').click();
  if (!(await hub.verEnInicio(page, '.sd-card.sd-of .sd-lv', 10000))) throw new Error('no apareció la sede oficial en Inicio (Tu sede)');
  await page.locator('.sd-card.sd-of .sd-head').click();
  await page.waitForSelector('#modal .sd-modal.sd-of');
  const v0 = await page.evaluate(() => window.Sede.oficial.estado);
  const eds = v0.sede.etapa.mejoras.map((m) => m.ed);
  const m0 = v0.sede.etapa.mejoras[0], m1 = v0.sede.etapa.mejoras[1];
  const bMat = page.locator(`#modal [data-acc="dm_mat"][data-ed="${eds[0]}"]`);
  ok(await bMat.count() === 1, 'falta "Completar materiales con 💎" en la primera mejora');
  ok((await bMat.innerText()).includes(`Completar materiales con 💎 (${m0.creditos_materiales})`), 'el botón no muestra el precio de lo que falta: ' + (await bMat.innerText()));
  ok(m0.creditos_materiales === Object.keys(m0.falta).reduce((a, k) => a + m0.falta[k] * (k === 'chips' ? 30 : 3), 0), 'precio de materiales mal calculado');
  ok((await page.locator(`#modal [data-acc="dm_ya"][data-ed="${eds[0]}"]`).innerText()).includes(`Mejorar ya con 💎 (${m0.creditos_ya})`), 'falta "Mejorar ya con 💎 (M)"');
  ok(/Terminar ya con 💎 \(\d+\)/.test(await page.locator('#modal [data-acc="acelerar"][data-obra="51"]').innerText()), 'la obra en curso no dice "Terminar ya con 💎 (n)"');
  ok(!(await page.locator('#modal [data-acc="dm_mat"][data-ed="sede"]').count()), 'la sede principal no debería ofrecer 💎 sin las mejoras hechas');
  await bMat.scrollIntoViewIfNeeded();
  await shot('03_oficial'); await noHScroll('oficial');

  // Completar materiales: primero el total, después se cobra
  await bMat.click();
  await page.waitForSelector('#modal [data-act="confirm-yes"]');
  const q1 = await page.locator('#modal').innerText();
  ok(q1.includes(m0.creditos_materiales + ' 💎') && q1.includes('900') && /Te falta:/.test(q1), 'la confirmación no muestra lo que falta, el costo y el saldo: ' + q1.replace(/\s+/g, ' '));
  ok(!(await pedidos()).some((p) => p.metodo === 'POST'), 'cobró antes de confirmar');
  await shot('04_confirmar_materiales'); await noHScroll('confirmar materiales');
  await page.locator('#modal [data-act="confirm-yes"]').click();
  await page.waitForFunction((ed) => !document.querySelector(`#modal [data-acc="dm_mat"][data-ed="${ed}"]`) && document.querySelectorAll('#modal .sd-of-obra').length === 2, eds[0], { timeout: 5000 }).catch(() => errs.push('no empezó la obra comprada con 💎'));
  let ps = await pedidos();
  const pm = ps.find((p) => p.ruta === '/mejorar');
  ok(pm && pm.body.clave === eds[0] && pm.body.diamantes === 'materiales' && pm.body.confirmar_costo === m0.creditos_materiales, 'mejorar no mandó {clave, diamantes, confirmar_costo}: ' + JSON.stringify(pm && pm.body));

  // Mejorar ya: lo que falta + terminar ya, con el total a la vista
  const bYa = page.locator(`#modal [data-acc="dm_ya"][data-ed="${eds[1]}"]`);
  await bYa.scrollIntoViewIfNeeded();
  await bYa.click();
  await page.waitForSelector('#modal [data-act="confirm-yes"]');
  const q2 = await page.locator('#modal').innerText();
  ok(q2.includes('Total: ' + m1.creditos_ya + ' 💎') && q2.includes(m1.creditos_materiales + ' 💎'), 'la confirmación de "Mejorar ya" no muestra el desglose y el total: ' + q2.replace(/\s+/g, ' '));
  await shot('05_confirmar_ya'); await noHScroll('confirmar ya');
  await page.locator('#modal [data-act="confirm-yes"]').click();
  await page.waitForFunction(() => { const e = window.Sede.oficial.estado; return e && e.sede.etapa.mejoras[1].hecha; }, null, { timeout: 5000 }).catch(() => errs.push('"Mejorar ya" no dejó la mejora lista'));
  ps = await pedidos();
  const py = ps.filter((p) => p.ruta === '/mejorar').pop();
  ok(py && py.body.clave === eds[1] && py.body.diamantes === 'ya' && py.body.confirmar_costo === m1.creditos_ya, 'mejorar ya no mandó diamantes "ya" con el total: ' + JSON.stringify(py && py.body));
  ok(await page.evaluate((ed) => !!window.__game.state.sede.mejoras['7.' + ed], eds[1]), 'la mejora no quedó en la copia local');
  await page.waitForTimeout(400);
  await shot('06_mejorado');

  // Sin saldo: botones apagados y "Te faltan X 💎"
  await page.evaluate(() => { window.__dmFalso.estado().creditos = 4; });
  await page.locator('#modal [data-act="close"]').first().click();
  await page.evaluate(() => window.Sede.oficial.cargar({ render() {}, openModal() {} }, true));
  await page.locator('nav button[data-tab="inicio"]').click();
  await hub.verEnInicio(page, '.sd-card.sd-of .sd-lv', 8000);
  await page.locator('.sd-card.sd-of .sd-head').click();
  await page.waitForSelector('#modal .sd-modal.sd-of');
  const libres = page.locator('#modal [data-acc="dm_ya"]');
  ok(await libres.count() >= 1 && await libres.first().isDisabled(), 'sin saldo "Mejorar ya" debería estar apagado');
  ok(/Te faltan \d+ 💎/.test(await page.locator('#modal').innerText()), 'sin saldo no dice cuántos 💎 faltan');
  await libres.first().scrollIntoViewIfNeeded();
  await shot('07_sin_saldo'); await noHScroll('sin saldo');
  await page.locator('#modal [data-act="close"]').first().click();

  await browser.close();
  if (errs.length) { console.error('❌ Sede con 💎 (navegador):\n' + errs.join('\n')); process.exit(1); }
  console.log(`✅ Sede con 💎 OK: ${n} revisiones, sin errores (capturas en tests/capturas/sede_diamantes_*.png)`);
})().catch((e) => { console.error('❌ Sede con 💎 (navegador):', e); process.exit(1); });
