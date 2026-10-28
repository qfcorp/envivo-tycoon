/* Prueba del personal internacional (reporte del dueño, oct. 2026: "¿Cómo consigo personal internacional? Ya tengo
   contratados y no salen en ningún lado. Estoy estancado, ni con diamantes puedo." — fama 33, capítulo 4).
   Los contratos internacionales piden un realizador (y más personas) con experiencia internacional; con fama 33 no llega
   nadie así y tu personal solo la ganaba haciendo internacionales: callejón sin salida. Ahora:
     dinero   – partida de fama 33 con una oferta internacional: en Clientes y en la preparación el requisito que falta
                sale con los botones del camino ("Capacita a Kevin ($…)", "Buscar director internacional", "o con 💎");
                capacitar al director y a ti lo deja válido y se puede salir al aire.
     buscar   – con solo un director Junior (no puede hacer el curso): "Buscar director internacional" trae un candidato
                con experiencia internacional (sin 45 de fama), se contrata desde la misma tarjeta y el requisito queda ok.
                En Personal, la vacante internacional del puesto elegido también lo trae.
     diamantes – el curso con 💎 (POST /api/gastar "curso_intl:director:<id>") y un camarógrafo con experiencia
                internacional con 💎 ("personal_intl:camarografo"): el servidor (imitado aquí, como en test_vip_combos.js)
                descuenta los créditos y la entrega llega a la partida; la preparación sigue abierta y puede salir al aire.
   Celular 390x844, fecha fija (window.__ENVIVO_FECHA = '2026-06-10'). Capturas: tests/capturas/intl_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_personal_intl.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo-intl.test';
const SAVE = 'envivo_tycoon_save_v1';
const GL = require(path.join(RAIZ, 'js/logic.js'));
const IC = GL.INTL_CREDITOS;

let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };

(async () => {
  const browser = await chromium.launch();
  const errores = [];

  async function abrir(op) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
    const srv = { creditos: op.creditos === undefined ? 500 : op.creditos, gastos: [], entregas: [] };
    const estado = () => ({ ok: true, logueado: true, jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: srv.creditos,
      vip_activo: false, vip_hasta: null, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' },
      tienda: { productos: [], premium: [] }, entregas: srv.entregas, inventario: [], plux: { disponible: true, ambiente: 'produccion' } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route(BASE + '/**', async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
      if (u.pathname === '/vacia.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>vacía</title>' });
      if (u.pathname.startsWith('/api/')) {
        if (u.pathname === '/api/estado') return json(200, estado());
        if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
        if (u.pathname === '/api/gastar') {
          let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) { b = null; }
          // Igual que Monedero::gastarIntl
          const m = b && typeof b.item === 'string' ? /^(curso_intl):([a-z_]+):(\d+)$|^(personal_intl):([a-z_]+)$/.exec(b.item) : null;
          if (!m) return json(404, { ok: false, error: 'Ese artículo no existe en la tienda.' });
          const curso = !!m[1];
          const rol = curso ? m[2] : m[5];
          if (!GL.ROLES[rol]) return json(404, { ok: false, error: 'Ese rol no existe.' });
          const precio = curso ? IC.curso : IC.personal;
          if (srv.creditos < precio) return json(402, { ok: false, error: 'No tienes créditos suficientes.' });
          srv.creditos -= precio;
          srv.gastos.push(b.item);
          const en = curso ? { id: 900 + srv.gastos.length, tipo: 'curso_intl', item: rol, cantidad: Number(m[3]), origen: 'intl:' + b.item }
            : { id: 900 + srv.gastos.length, tipo: 'personal_intl', item: rol, cantidad: IC.habilidad, origen: 'intl:' + b.item };
          srv.entregas.push(en);
          return json(200, { ok: true, creditos: srv.creditos, entrega: en });
        }
        return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
      }
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const f = path.join(RAIZ, rel);
      if (!f.startsWith(RAIZ + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
    await page.addInitScript(() => { window.__ENVIVO_FECHA = '2026-06-10'; try { localStorage.setItem('envivo_guia_v1', '"hecha"'); } catch (e) { /* nada */ } });
    await page.goto(BASE + '/vacia.html');
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.state);
    const st = await page.evaluate((o) => {
      const Gm = window.Game, s = Gm.newGame(11);
      s.chapter = 3; s.chapterSeen = 3; s.rep = 33; s.money = o.money || 20000; s.stats.events = 30; s.day = 60;
      s.equip = s.equip.filter((e) => e.starter);
      ['cam_pro', 'cam_pro', 'switch_pro', 'audio_basic', 'encoder', 'encoder'].forEach((t) => { s.idc++; s.equip.push({ id: s.idc, type: t, condition: 100 }); });
      const gente = o.gente || [['Kevin Andrade', 'director', 'semi_senior', 3], ['Andrea Lema', 'camarografo', 'junior', 2], ['Luis Ortiz', 'sonidista', 'semi_senior', 3], ['Paola Cedeño', 'tecnico_transmision', 'semi_senior', 3]];
      gente.forEach(([name, role, tier, skill]) => { s.idc++; s.staff.push({ id: s.idc, name, role, tier, skill, wage: 60, morale: 100, events: 20, eventos_nacionales: 20, eventos_internacionales: 0 }); });
      s.contracts = [];
      s.candidates = [];
      const c = Gm.addIntlContract(s, 'regional');
      c.daysLeft = 5;
      return Gm.serialize(s);
    }, op);
    await page.goto(BASE + '/vacia.html');
    await page.evaluate(([k, x]) => localStorage.setItem(k, x), [SAVE, st]);
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state && window.__game.state.rep === 33 && window.Api && window.Api.estado && window.Api.estado.logueado, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await cerrar(page);
    return { ctx, page, srv };
  }
  async function cerrar(page) {
    for (let k = 0; k < 6; k++) {
      const b = page.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"]');
      if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(100); } else break;
    }
  }
  const intlId = (page) => page.evaluate(() => window.__game.state.contracts.find((x) => x.internacional).id);
  const persona = (page, nombre) => page.evaluate((n) => window.__game.state.staff.find((p) => p.name === n || (n === 'owner' && p.owner)), nombre);
  async function preparar(page) {
    await cerrar(page);
    await page.click('nav button[data-tab="clientes"]');
    await page.click(`#tab-clientes [data-act="prep"][data-id="${await intlId(page)}"]`);
    await page.waitForSelector('#modal [data-act="go-live"]');
    await page.waitForTimeout(150);
  }
  const reqOk = (page, key, todos) => page.evaluate(([k, t]) => {
    const G = window.Game, S = window.__game.state, c = S.contracts.find((x) => x.internacional);
    return G.requisitosInternacional(S, c, S.staff.map((p) => p.id), S.equip.map((e) => e.id)).find((r) => r.key === k).ok;
  }, [key, todos]);
  const foto = async (page, nombre, sel) => {
    if (sel) await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center' }); }, sel);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, nombre) });
  };
  const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);
  const goLiveOn = (page) => page.evaluate(() => { const b = document.querySelector('#modal [data-act="go-live"]'); return !!b && !b.disabled; });

  try {
    /* ===== dinero: capacitar al director y a ti ===== */
    {
      const { ctx, page } = await abrir({});
      await page.click('nav button[data-tab="clientes"]');
      await page.waitForTimeout(150);
      const card = page.locator('#tab-clientes .intl-ayuda');
      bien(await card.count() === 1, 'Clientes: la oferta internacional trae la tarjeta "Así lo consigues"');
      const kevin = await persona(page, 'Kevin Andrade');
      const dirTxt = await page.locator('#tab-clientes [data-intl-falta="dir_intl"]').innerText();
      const costoK = GL.cursoIntlCosto(kevin);
      bien(/Capacita a Kevin/.test(dirTxt) && dirTxt.includes(String(costoK).replace(/\B(?=(\d{3})+(?!\d))/g, '.')) && /Buscar .*director con experiencia internacional/.test(dirTxt) && /💎/.test(dirTxt),
        `Realizador: "Capacita a Kevin ($${costoK})", "Buscar director internacional" y la opción con 💎 → ${dirTxt.replace(/\s+/g, ' ').slice(0, 200)}`);
      const eqTxt = await page.locator('#tab-clientes [data-intl-falta="equipo_intl"]').innerText();
      bien(/Andrea Lema es Junior/.test(eqTxt) && /Capacita a/.test(eqTxt), 'Equipo: ofrece capacitar a un Semi-senior y avisa que Andrea (Junior) no puede → ' + eqTxt.replace(/\s+/g, ' ').slice(0, 160));
      await foto(page, 'intl_01_clientes.png', '#tab-clientes .intl-ayuda');
      bien(await sinDesborde(page), 'Clientes: sin desborde horizontal');
      await preparar(page);
      bien(await page.locator('#modal .intl-ayuda [data-act="intl-curso"]').count() >= 2 && !(await goLiveOn(page)), 'Preparación: los botones del camino están y "Al aire" está bloqueado');
      await foto(page, 'intl_02_prep.png', '#modal .intl-ayuda');
      const m0 = await page.evaluate(() => window.__game.state.money);
      await page.click(`#modal .intl-ayuda [data-act="intl-curso"][data-id="${kevin.id}"]`);
      await page.waitForTimeout(250);
      const k2 = await persona(page, 'Kevin Andrade');
      bien(k2.eventos_internacionales === 1 && k2.tier === 'semi_senior' && await page.evaluate(() => window.__game.state.money) === m0 - costoK,
        `Capacitar a Kevin: queda con experiencia internacional (1, sigue Semi-senior) y cuesta $${costoK}`);
      bien(await reqOk(page, 'dir_intl') && await page.locator('#modal [data-intl-falta="dir_intl"]').count() === 0, 'El requisito del realizador queda en verde y su ayuda desaparece');
      bien(await page.locator('#modal [data-act="go-live"]').count() === 1, 'La preparación sigue abierta');
      const btn = page.locator('#modal [data-intl-falta="equipo_intl"] [data-act="intl-curso"]').first();
      await btn.click();
      await page.waitForTimeout(250);
      bien(await reqOk(page, 'equipo_intl'), 'Capacitar a alguien más: el requisito del equipo queda en verde');
      bien(await page.locator('#modal .intl-ayuda').count() === 0 && await goLiveOn(page), '"Al aire" se habilita');
      await foto(page, 'intl_03_prep_listo.png', '#modal .pe-intl');
      await page.click('#modal [data-act="go-live"]');
      await page.waitForTimeout(400);
      bien(await page.evaluate(() => !!window.__game.state.currentEvent || window.__game.state.stats.events > 30), 'El contrato internacional arranca');
      // Personal: Kevin ya no ofrece el curso y dice que lo hizo
      await cerrar(page);
      await ctx.close();
    }

    /* ===== buscar: director Junior, se busca uno internacional ===== */
    {
      const { ctx, page } = await abrir({ gente: [['Bryan Toapanta', 'director', 'junior', 2], ['Gaby Quishpe', 'camarografo', 'semi_senior', 3], ['Luis Ortiz', 'sonidista', 'semi_senior', 3]] });
      await page.click('nav button[data-tab="clientes"]');
      await page.waitForTimeout(150);
      const dirTxt = await page.locator('#tab-clientes [data-intl-falta="dir_intl"]').innerText();
      bien(/Bryan Toapanta es Junior/.test(dirTxt) && !/Capacita a Bryan/.test(dirTxt) && /Buscar .*director con experiencia internacional/.test(dirTxt), 'Director Junior: no ofrece su curso, sí "Buscar director internacional"');
      const m0 = await page.evaluate(() => window.__game.state.money);
      await page.click('#tab-clientes [data-intl-falta="dir_intl"] [data-act="intl-buscar"]');
      await page.waitForTimeout(250);
      const cand = await page.evaluate(() => window.__game.state.candidates[0]);
      bien(cand && cand.role === 'director' && cand.eventos_internacionales > 0 && cand.tier !== 'junior' && await page.evaluate(() => window.__game.state.money) === m0 - GL.BALANCE.intlPersonal.buscar,
        `La búsqueda ($${GL.BALANCE.intlPersonal.buscar}) trae un director con experiencia internacional con fama 33 (${cand && cand.tier}, ${cand && cand.eventos_internacionales} intl.)`);
      const hb = page.locator(`#tab-clientes [data-act="intl-hire"][data-id="${cand.id}"]`);
      bien(await hb.count() === 1, 'La tarjeta ofrece "Contratar a ' + cand.name + '" ahí mismo');
      await foto(page, 'intl_04_buscar.png', '#tab-clientes .intl-ayuda');
      await hb.click();
      await page.waitForTimeout(250);
      bien(await page.evaluate((id) => window.__game.state.staff.some((p) => p.id === id), cand.id) && await reqOk(page, 'dir_intl'), 'Contratado: el requisito del realizador queda en verde');
      // Personal: vacante internacional para el puesto elegido
      await page.click('nav button[data-tab="personal"]');
      await page.click('#tab-personal .subnav [data-k="contratar"]');   // navegación v2: buscar personal va en "Contratar"
      await page.waitForTimeout(150);
      await page.selectOption('#rolBuscar', 'camarografo');
      await page.click('#tab-personal [data-act="intl-buscar"]');
      await page.waitForTimeout(250);
      const c2 = await page.evaluate(() => window.__game.state.candidates[0]);
      bien(c2.role === 'camarografo' && c2.eventos_internacionales > 0, 'Personal → "Buscar con experiencia internacional" trae un camarógrafo con experiencia internacional');
      const cardTxt = await page.locator('#tab-personal .cand').first().innerText();
      bien(/internacional/i.test(cardTxt), 'La tarjeta del candidato muestra sus eventos internacionales');
      const gaby = await persona(page, 'Gaby Quishpe');
      await page.click('#tab-personal .subnav [data-k="capacitar"]');   // navegación v2: la capacitación va en "Capacitar"
      bien(await page.locator(`#tab-personal [data-act="intl-curso"][data-id="${gaby.id}"]`).count() === 1, 'Personal: la Semi-senior Gaby tiene su botón "Capacitación internacional"');
      await page.click('#tab-personal .subnav [data-k="contratar"]');
      await foto(page, 'intl_05_personal.png', '#tab-personal .buscar');
      bien(await sinDesborde(page), 'Personal: sin desborde horizontal');
      await ctx.close();
    }

    /* ===== diamantes: curso y persona con 💎 por el servidor ===== */
    {
      const { ctx, page, srv } = await abrir({ money: 300 });
      await preparar(page);
      const kevin = await persona(page, 'Kevin Andrade');
      const bc = page.locator(`#modal [data-intl-falta="dir_intl"] [data-act="intl-curso-cred"][data-id="${kevin.id}"]`);
      bien(await bc.count() === 1 && await page.locator(`#modal [data-act="intl-curso"][data-id="${kevin.id}"]`).isDisabled(), `Sin dinero ($300): el curso con dinero está gris pero el de ${IC.curso} 💎 se puede`);
      await bc.click();
      await page.waitForFunction(() => window.__game.state.staff.some((p) => p.name === 'Kevin Andrade' && p.eventos_internacionales > 0), null, { timeout: 5000 });
      bien(srv.gastos[0] === `curso_intl:director:${kevin.id}` && srv.creditos === 500 - IC.curso, `POST /api/gastar curso_intl:director:${kevin.id} y el servidor descontó ${IC.curso} 💎`);
      bien(await page.locator('#modal [data-act="go-live"]').count() === 1 && await reqOk(page, 'dir_intl'), 'La preparación sigue abierta y el realizador queda en verde');
      const bp = page.locator('#modal [data-intl-falta="equipo_intl"] [data-act="intl-personal-cred"]');
      bien(await bp.count() === 1, 'Equipo: "Camarógrafo con experiencia internacional ya: ' + IC.personal + ' 💎"');
      const n0 = await page.evaluate(() => window.__game.state.staff.length);
      await bp.click();
      await page.waitForFunction((n) => window.__game.state.staff.length === n + 1, n0, { timeout: 5000 });
      const nuevo = await page.evaluate(() => window.__game.state.staff[window.__game.state.staff.length - 1]);
      bien(srv.gastos[1] === 'personal_intl:camarografo' && srv.creditos === 500 - IC.curso - IC.personal && nuevo.eventos_internacionales === 1 && nuevo.tier === 'semi_senior' && nuevo.skill === IC.habilidad,
        `personal_intl:camarografo: llega ${nuevo.name} (Semi-senior, habilidad ${nuevo.skill}, con experiencia internacional)`);
      bien(await page.evaluate((id) => !!document.querySelector(`#modal input[data-act="tog-staff"][data-id="${id}"]:checked`), nuevo.id), 'La persona nueva queda marcada en la preparación');
      bien(await reqOk(page, 'equipo_intl') && await page.locator('#modal .intl-ayuda').count() === 0, 'Todos los requisitos de personal en verde');
      await foto(page, 'intl_06_diamantes.png', '#modal .pe-intl');
      // Vuelve a cargar: las entregas no se aplican dos veces
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.estado && window.Api.estado.logueado, null, { timeout: 15000 });
      await page.waitForTimeout(400);
      bien(await page.evaluate((n) => window.__game.state.staff.length === n + 1, n0), 'Al recargar no llega otra persona (cada entrega una sola vez)');
      await ctx.close();
    }
  } catch (e) {
    fallas++; console.error('❌ Error en la prueba:', e.stack || e.message);
  }
  bien(!errores.length, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${aciertos} bien, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})();
