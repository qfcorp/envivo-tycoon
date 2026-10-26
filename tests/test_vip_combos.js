/* Prueba de los equipos comprados con créditos (Edición Exclusiva y VIP) en la preparación y de los "combos" de lo que
   un equipo necesita para funcionar (reporte del dueño: "No aparece un artículo VIP, cámara con lente grande que compré
   con diamantes" y "lo que compro y que necesita más cosas debería llevarme a comprarlas o hacer un combo").
   El servidor se imita aquí (como tests/test_exclusivos.js): /api/estado con la tienda premium de server/src/Catalogo.php
   (leída con php), el inventario del servidor y vip_activo; /api/gastar descuenta créditos y agrega el equipo al
   inventario con número de serie (el juego nunca cambia los créditos por su cuenta). Celular de 390x844.
   Casos:
     vip_activo – canjear la Zony HDK-3600 VIP con créditos: llega a la bodega, sale en la preparación y el plan de cámaras
                  la pone en la posición principal en boxeo, concierto y final (es la mejor).
     sin_pase   – la misma cámara sin el Pase VIP activo: la preparación la muestra en "no se pueden usar" con el motivo
                  exacto (Pase VIP, no el nivel) y un botón al Pase VIP; marcarla a mano no cambia el plan (no engaña).
     exclusivo  – lente box Exclusivo canjeado con créditos + cámara de sistema: el plan usa la cámara con el lente box.
     combo      – comprar una cámara que necesita lente ofrece el combo con dinero del juego; canjear el lente box con
                  créditos ofrece lo que falta (cámara, adaptador, soporte con 💎 o dinero) y lo compra; en la
                  preparación, una cámara sin lente sale con "Comprar lo que falta" y al tocarlo queda en el plan.
   Capturas: tests/capturas/vip_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_vip_combos.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo-vip.test';
const SAVE = 'envivo_tycoon_save_v1';

let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

const PREMIUM = JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(path.join(RAIZ, 'server/src/Catalogo.php'))};
  $m = [];
  foreach (\\EnVivo\\Catalogo::PREMIUM as $id => $x) {
    $tipo = $x['tipo'] ?? ($x['entrega']['tipo'] === 'item' ? (!empty($x['vip']) ? 'vip' : 'equipo') : 'consumo');
    $m[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'creditos' => $x['creditos'], 'vip' => !empty($x['vip']), 'tipo' => $tipo, 'entrega' => $x['entrega']];
  }
  echo json_encode($m);`], { encoding: 'utf8' }));

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };

(async () => {
  const browser = await chromium.launch();
  const errores = [];

  /* Abre el juego con una partida armada (equipos, personal, ofertas) y el servidor imitado */
  async function abrir(op) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
    const srv = { creditos: op.creditos === undefined ? 2618 : op.creditos, inventario: (op.inventario || []).map((item, i) => ({ id: 500 + i, item, serie: i + 1, origen: 'canje', estado: 'bodega', nombre: item })), gastos: [], vip: !!op.vip };
    const estado = () => ({ ok: true, logueado: true, jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: srv.creditos,
      vip_activo: srv.vip, vip_hasta: srv.vip ? '2026-12-31T00:00:00Z' : null, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' },
      tienda: { productos: [], premium: PREMIUM }, entregas: [], inventario: srv.inventario, plux: { disponible: true, ambiente: 'produccion' } });
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
          const p = PREMIUM.find((x) => b && x.id === b.item);
          if (!p) return json(404, { ok: false, error: 'Ese producto no existe.' });
          if (p.vip && !srv.vip) return json(403, { ok: false, error: 'Los equipos VIP se canjean solo con el Pase VIP activo.' });
          if (srv.creditos < p.creditos) return json(402, { ok: false, error: 'No te alcanzan los créditos.' });
          srv.creditos -= p.creditos;
          srv.gastos.push(p.id);
          const it = { id: 600 + srv.gastos.length, item: p.entrega.item, serie: srv.gastos.length, origen: 'canje', estado: 'bodega', nombre: p.nombre };
          srv.inventario.push(it);
          return json(200, { ok: true, creditos: srv.creditos, item: it });
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
      const Gm = window.Game, s = Gm.newGame(7);
      s.chapter = 3; s.chapterSeen = 3; s.rep = o.rep || 33; s.money = o.money === undefined ? 90000 : o.money; s.stats.events = 12; s.day = 36;
      s.equip = s.equip.filter((e) => e.starter);
      (o.equipos || []).forEach((t) => { s.idc = (s.idc || 0) + 1; s.equip.push({ id: s.idc, type: t, condition: 100 }); });
      (o.roles || []).forEach((r, i) => { s.idc = (s.idc || 0) + 1; s.staff.push({ id: s.idc, name: 'Persona ' + (i + 1), role: r, tier: 'senior', skill: 4, wage: 60, morale: 100, events: 3 }); });
      s.contracts = [];
      (o.eventos || ['boxeo']).forEach((k) => { const c = Gm.addContract(s, k); if (c) { c.daysLeft = 5; c.cams = Math.max(c.cams || 1, o.cams || 4); } });
      return Gm.serialize(s);
    }, op);
    await page.goto(BASE + '/vacia.html');
    await page.evaluate(([k, x]) => localStorage.setItem(k, x), [SAVE, st]);
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction((r) => window.__game && window.__game.state && window.__game.state.rep === r && window.Api && window.Api.estado && window.Api.estado.logueado, op.rep || 33, { timeout: 15000 });
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
  // Abre la preparación de la oferta de ese tipo
  async function preparar(page, tipo) {
    await cerrar(page);
    await page.click('nav button[data-tab="clientes"]');
    const id = await page.evaluate((t) => { const c = window.__game.state.contracts.find((x) => x.type === t); return c ? c.id : null; }, tipo);
    await page.click(`[data-act="prep"][data-id="${id}"]`);
    await page.waitForSelector('#modal [data-act="go-live"]');
    await page.waitForTimeout(150);
    return id;
  }
  const leer = (page) => page.evaluate(() => ({
    plan: [...document.querySelectorAll('#modal .pe-clr')].map((r) => r.innerText.replace(/\s+/g, ' ')),
    marcadas: [...document.querySelectorAll('#modal input[data-act="tog-equip"]')].filter((x) => x.checked).map((x) => +x.dataset.id),
    bloq: ((document.querySelector('#modal .bloq') || {}).innerText || '').replace(/\s+/g, ' '),
    lista: [...document.querySelectorAll('#modal label.pick')].map((l) => l.innerText.replace(/\s+/g, ' ')),
  }));
  const foto = async (page, nombre, sel) => {
    if (sel) await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center' }); }, sel);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, nombre) });
  };
  const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);
  const ROLES = ['camarografo', 'camarografo', 'camarografo', 'shader', 'director', 'sonidista', 'tecnico_transmision'];
  const BASICO = ['cam_blackmagia_estudio_4k_g3', 'lente_kit_mft', 'cam_zony_hxr_mk2500', 'cam_pro', 'switch_pro', 'audio_basic', 'encoder'];

  try {
    /* ===== vip_activo: canjear la cámara VIP con créditos y verla en el plan ===== */
    {
      const { ctx, page, srv } = await abrir({ vip: true, equipos: BASICO, roles: ROLES, eventos: ['boxeo', 'concierto', 'final'] });
      await page.click('nav button[data-tab="bodega"]');
      await page.click('#tab-bodega [data-act="cat"][data-k="cam"]');
      await page.waitForTimeout(150);
      const btn = page.locator('#tab-bodega [data-ex="vip_cam8k"] [data-act="ex-canjear"]');
      bien(await btn.count() === 1 && !(await btn.isDisabled()), 'Bodega → Cámaras: la Zony HDK-3600 VIP se canjea con créditos (Pase VIP activo)');
      await btn.click();
      await page.waitForSelector('#overlay.on');
      await foto(page, 'vip_01_canje_vip.png');
      await page.click('#overlay.on [data-act="confirm-yes"], #overlay.on [data-act="combo-canjear"]');
      await page.waitForFunction(() => window.__game.state.equip.some((e) => e.type === 'vip_cam8k' && e.srvId !== undefined), null, { timeout: 8000 });
      bien(srv.gastos.includes('vip_cam8k') && srv.creditos === 2618 - 800, 'Los créditos los descontó el servidor (/api/gastar) y la cámara llegó del inventario del servidor');
      await cerrar(page);
      for (const tipo of ['boxeo', 'concierto', 'final']) {
        await preparar(page, tipo);
        const r = await leer(page);
        const vipId = await page.evaluate(() => window.__game.state.equip.find((e) => e.type === 'vip_cam8k').id);
        bien(r.lista.some((l) => /HDK-3600/.test(l)), `${tipo}: la cámara VIP sale en la lista de equipos`);
        bien(r.marcadas.includes(vipId), `${tipo}: "Elegir lo mejor" la deja marcada`);
        bien(/HDK-3600/.test(r.plan[0] || ''), `${tipo}: el plan de cámaras la pone en la posición principal → ${(r.plan[0] || '').slice(0, 90)}`);
        if (tipo === 'boxeo') { await foto(page, 'vip_02_plan_boxeo.png', '#modal .pe-cl'); }
        await cerrar(page);
      }
      bien(await sinDesborde(page), 'vip_activo: sin desborde horizontal');
      await ctx.close();
    }

    /* ===== sin_pase: la cámara VIP sin el Pase VIP activo ===== */
    {
      const { ctx, page } = await abrir({ vip: false, inventario: ['vip_cam8k'], equipos: BASICO, roles: ROLES, eventos: ['boxeo'] });
      await page.waitForFunction(() => window.__game.state.equip.some((e) => e.type === 'vip_cam8k'));
      await preparar(page, 'boxeo');
      let r = await leer(page);
      bien(/HDK-3600/.test(r.bloq) && /Pase VIP/.test(r.bloq), 'Sin Pase VIP: la cámara VIP sale en "no se pueden usar" con el motivo (Pase VIP) → ' + r.bloq.slice(0, 160));
      const ir = page.locator('#modal .bloq [data-act="ir-pase-vip"]');
      bien(await ir.count() > 0, '…con un botón para activar el Pase VIP');
      await foto(page, 'vip_03_sin_pase.png', '#modal .bloq');
      const vipId = await page.evaluate(() => window.__game.state.equip.find((e) => e.type === 'vip_cam8k').id);
      const antes = r.plan.join('|');
      await page.locator(`#modal label.pick:has(input[data-act="tog-equip"][data-id="${vipId}"])`).click({ position: { x: 12, y: 12 } });
      await page.waitForTimeout(150);
      r = await leer(page);
      bien(!r.plan.some((p) => /HDK-3600/.test(p)) && r.plan.join('|') === antes, 'Marcarla a mano no la pone en el plan (al aire tampoco se usaría)');
      await ir.first().click();
      await page.waitForTimeout(300);
      const enVip = await page.evaluate(() => !document.querySelector('#overlay.on') && !!document.getElementById('tv-vip'));
      bien(enVip, 'El botón lleva a la Tienda, sección VIP (Pase VIP)');
      await ctx.close();
    }

    /* ===== exclusivo: lente box Exclusivo (créditos) + cámara de sistema ===== */
    {
      const { ctx, page } = await abrir({ vip: false, rep: 50, inventario: ['ex_lente_box', 'ex_soporte'], equipos: BASICO.concat(['cam_zony_hdk_3200', 'adaptador_lente_box', 'fib_cable_smpte_100m']), roles: ROLES, eventos: ['final'] });
      await page.waitForFunction(() => window.__game.state.equip.filter((e) => e.srvId !== undefined).length === 2);
      await preparar(page, 'final');
      const r = await leer(page);
      const ids = await page.evaluate(() => window.__game.state.equip.filter((e) => e.srvId !== undefined).map((e) => e.id));
      bien(ids.every((id) => r.marcadas.includes(id)), 'El lente box y el soporte Exclusivos (créditos) vienen marcados');
      const pl = await page.evaluate((ids) => { const s = window.__game.state; const c = s.contracts.find((x) => x.type === 'final');
        const p = window.Game.cameraPlan(s, c, ids).positions[0]; return { cam: p.asignado, lente: p.lente, box: p.box }; }, r.marcadas);
      bien(/HDK-3200/.test(r.plan[0] || '') && pl.lente === 'ex_lente_box' && pl.box, 'La cámara de sistema va en la principal con el lente box Exclusivo → ' + JSON.stringify(pl));
      await foto(page, 'vip_04_exclusivo_final.png', '#modal .pe-cl');
      await ctx.close();
    }

    /* ===== combo: comprar lo que falta ===== */
    {
      const { ctx, page, srv } = await abrir({ vip: false, rep: 50, money: 90000, equipos: ['cam_pro', 'cam_zony_hxr_mk2500', 'switch_pro', 'audio_basic'], roles: ROLES, eventos: ['final', 'boxeo'] });
      // Dinero del juego: cámara que necesita lente
      await page.click('nav button[data-tab="bodega"]');
      await page.click('#tab-bodega [data-act="cat"][data-k="cam"]');
      await page.waitForTimeout(150);
      const b = page.locator('#tab-bodega [data-act="buy"][data-k="cam_blackmagia_urso_broadcast_g3"]').first();
      await b.scrollIntoViewIfNeeded();
      await b.click();
      await page.waitForSelector('#overlay.on [data-act="buy-kit"]');
      const txt = await page.locator('#modal').innerText();
      bien(/lente/i.test(txt) && /Comprar todo|\+/.test(txt), 'Comprar la URSO (lente B4) ofrece el combo cámara + lente');
      await foto(page, 'vip_05_combo_dinero.png');
      const m0 = await page.evaluate(() => window.__game.state.money);
      await page.click('#overlay.on [data-act="buy-kit"]');
      await cerrar(page);
      const st = await page.evaluate(() => ({ m: window.__game.state.money, t: window.__game.state.equip.map((e) => e.type) }));
      bien(st.t.includes('cam_blackmagia_urso_broadcast_g3') && st.t.some((t) => /^lente_/.test(t)) && st.m < m0, 'Compró la cámara y su lente con dinero del juego');
      // Créditos: el lente box Exclusivo necesita cámara de sistema, adaptador y soporte
      await page.click('nav button[data-tab="bodega"]');
      await page.click('#tab-bodega [data-act="cat"][data-k="lens"]');
      await page.waitForTimeout(150);
      await page.click('#tab-bodega [data-ex="ex_lente_box"] [data-act="ex-canjear"]');
      await page.waitForSelector('#overlay.on');
      const t2 = await page.locator('#modal').innerText();
      bien(/adaptador/i.test(t2) && /soporte|cabezal|Vinter/i.test(t2) && /sistema|HDK/i.test(t2), 'Canjear el lente box Exclusivo avisa que le falta la cámara de sistema, el adaptador y el soporte');
      bien(await page.locator('#overlay.on [data-act="combo-canjear"]').count() > 0, '…y ofrece canjearlo junto con lo que se consigue con créditos');
      await foto(page, 'vip_06_combo_creditos.png');
      const c0 = srv.creditos;
      await page.click('#overlay.on [data-act="combo-canjear"]');
      await page.waitForFunction(() => window.__game.state.equip.some((e) => e.type === 'ex_lente_box'), null, { timeout: 8000 });
      await page.waitForTimeout(400);
      bien(srv.gastos.includes('ex_lente_box') && srv.gastos.includes('ex_soporte') && srv.creditos === c0 - srv.gastos.reduce((a, g) => a + PREMIUM.find((x) => x.id === g).creditos, 0), `Canjeó el lente box y el soporte con créditos en el servidor (${srv.gastos.join(', ')})`);
      // Lo que falta con dinero del juego (cámara de sistema y adaptador)
      const falta = page.locator('#overlay.on [data-act="buy-kit"]');
      bien(await falta.count() > 0, 'Después del canje ofrece comprar con dinero lo que todavía falta');
      await foto(page, 'vip_07_falta_dinero.png');
      if (await falta.count()) await falta.first().click();
      await cerrar(page);
      const t3 = await page.evaluate(() => window.__game.state.equip.map((e) => window.Game.CATALOG[e.type].subtipo));
      bien(t3.includes('adaptador_lente_box') && t3.some((x) => x === 'sistema' || x === 'sistema_4k'), 'Compró la cámara de sistema y el adaptador: el lente box ya funciona');
      // En la preparación: cámara sin lente → "Comprar lo que falta"
      await page.evaluate(() => { const s = window.__game.state; s.idc++; s.equip.push({ id: s.idc, type: 'cam_zony_fz6_cine', condition: 100 }); });
      await preparar(page, 'boxeo');
      let r = await leer(page);
      bien(/FZ6/.test(r.bloq) && /lente/i.test(r.bloq), 'Preparación: la Zony FZ6 sin lente sale en "no se pueden usar" con lo que le falta → ' + r.bloq.slice(0, 140));
      const bf = page.locator('#modal .bloq .bq', { hasText: 'FZ6' }).locator('[data-act="buy-falta"]');
      bien(await bf.count() > 0, '…con el botón "Comprar lo que falta"');
      await foto(page, 'vip_08_prep_falta.png', '#modal .bloq');
      await bf.first().click();
      await page.waitForTimeout(300);
      if (await page.locator('#overlay.on [data-act="buy-kit"]').count() && !(await page.locator('#modal [data-act="go-live"]').count())) await page.click('#overlay.on [data-act="buy-kit"]');
      await page.waitForSelector('#modal [data-act="go-live"]');
      r = await leer(page);
      const fz = await page.evaluate(() => window.__game.state.equip.find((e) => e.type === 'cam_zony_fz6_cine').id);
      bien(!/FZ6/.test(r.bloq) && r.marcadas.includes(fz), 'Tocado: compró el lente, la FZ6 queda marcada y ya no está bloqueada');
      await foto(page, 'vip_09_prep_resuelto.png', '#modal .pe-cl');
      bien(await sinDesborde(page), 'combo: sin desborde horizontal');
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
