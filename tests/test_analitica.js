/* Prueba de la analítica propia del juego (js/analitica.js + los ganchos de js/ui.js, server/INTEGRAR_ANALITICA.md)
   en un celular simulado (390x844) con Playwright. El servidor es de mentira: /api/eventos se responde aquí y se
   guardan los lotes para revisarlos.
   Casos: app_abierta con instalación al azar, lote con X-Envivo; jugar el primer evento con la guía (tutorial_paso de
   cada paso, evento_iniciado/terminado con tipo y estrellas); tienda_abierta y modo_online_abierto; sesion_fin por
   sendBeacon (texto plano, sin X-Envivo) al esconder la página; sin internet la cola queda guardada y se manda al
   volver (sin duplicar); los pasos de la guía no se repiten al recargar; lotes de 50 como máximo; compra_iniciada →
   compra_aprobada (también al volver del pago con ?compra=ok); la opción "no enviar" y el servidor que dice "apagada";
   en pruebas automáticas sin window.__ENVIVO_ANALITICA no manda nada.
   Uso:  node tests/test_analitica.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://envivo-analitica.test';
const URL0 = BASE + '/index.html?fecha=2026-11-10';
let fallas = 0, bien_ = 0;
function bien(c, msg, extra) { if (c) { bien_++; console.log('✅', msg); } else { fallas++; console.error('❌', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); } }

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const errores = [];

async function abrir(browser, op) {
  op = op || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
  const srv = { lotes: [], modo: op.modo || 'ok' };   // ok | caido | apagada
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.pathname === '/api/eventos') {
      if (srv.modo === 'caido') return route.abort('failed');
      let cuerpo = null;
      try { cuerpo = JSON.parse(req.postData() || 'null'); } catch (e) { cuerpo = null; }
      const h = req.headers();
      srv.lotes.push({ cuerpo, xenvivo: h['x-envivo'] || null, tipo: h['content-type'] || '' });
      if (srv.modo === 'apagada') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, aceptados: 0, rechazados: 0, apagada: true }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, aceptados: cuerpo && cuerpo.e ? cuerpo.e.length : 0, rechazados: 0 }) });
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(RAIZ, rel);
    if (!f.startsWith(RAIZ + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await ctx.addInitScript((o) => { if (o.activar) window.__ENVIVO_ANALITICA = true; if (o.guia) window.__ENVIVO_GUIA = true; }, { activar: op.activar !== false, guia: !!op.guia });
  const page = await ctx.newPage();
  const tag = op.tag || 'analitica';
  page.on('pageerror', (e) => errores.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(op.url || URL0, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  await page.waitForLoadState('load');
  return { ctx, page, srv };
}
const eventos = (srv) => srv.lotes.flatMap((l) => (l.cuerpo && Array.isArray(l.cuerpo.e) ? l.cuerpo.e : []));
const nombres = (srv) => eventos(srv).map((e) => e.n);
const enviar = (page) => page.evaluate(() => window.Analitica.enviar());
async function vaciar(page, srv) {
  for (let i = 0; i < 6; i++) {
    const n = await page.evaluate(() => window.Analitica._cola().length);
    if (!n) return;
    await enviar(page);
    await page.waitForTimeout(150);
  }
}
async function cerrar(page) {
  for (let i = 0; i < 8; i++) {
    const hay = await page.evaluate(() => { const b = document.querySelector('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"], #overlay.on [data-act="after-result"], #overlay.on [data-act="close-dia"]'); if (b) b.click(); return !!b; });
    if (!hay) return;
    await page.waitForTimeout(250);
  }
}
// Juega el primer evento tocando el botón que haga falta (como la guía)
async function jugarPrimerEvento(page) {
  const sel = ['#overlay.on [data-act="after-result"]', '#overlay.on [data-act="finish"]', '#overlay.on [data-act="next-inc"]', '#overlay.on [data-act="choose"]:not([disabled])',
    '#overlay.on [data-act="go-live"]:not([disabled])', '#overlay.on [data-act="auto"]', '#overlay.on .btn.main[data-act="close"]', '#overlay.on [data-act="close-story"]', '#overlay.on [data-act="close-dia"]',
    '#tab-clientes [data-act="prep"]', 'nav button[data-tab="clientes"]'];
  for (let i = 0; i < 60; i++) {
    const hecho = await page.evaluate(() => { const s = window.__game.state; return s.stats.events >= 1 && !document.querySelector('#overlay.on'); });
    if (hecho) return true;
    let toco = false;
    for (const s of sel) {
      const l = page.locator(s).first();
      if (await l.count() && await l.isVisible()) {
        if (s.includes('go-live')) { const ok = await l.isEnabled(); if (!ok) continue; }
        await l.click({ timeout: 3000 }).catch(() => {});
        toco = true; break;
      }
    }
    await page.waitForTimeout(toco ? 900 : 300);   // la guía mira cada 700 ms
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. Abrir el juego y el primer evento con la guía ---------- */
  {
    const { ctx, page, srv } = await abrir(browser, { guia: true, tag: 'guia' });
    bien(await page.evaluate(() => !!window.Analitica && window.Analitica.activo()), 'Analitica cargada y activa con window.__ENVIVO_ANALITICA = true');
    const inst = await page.evaluate(() => localStorage.getItem('envivo_instalacion'));
    bien(/^[a-f0-9]{32}$/.test(inst || ''), 'Instalación: 32 letras hex al azar en localStorage', inst);
    await enviar(page); await page.waitForTimeout(200);
    const l0 = srv.lotes[0];
    bien(l0 && l0.xenvivo === '1' && /application\/json/.test(l0.tipo), 'Lote normal por fetch con X-Envivo: 1 y JSON', l0 && { x: l0.xenvivo, t: l0.tipo });
    bien(l0 && l0.cuerpo.i === inst && /^[a-f0-9]{16,32}$/.test(l0.cuerpo.s) && l0.cuerpo.p === 'web' && l0.cuerpo.l === 'es', 'Sobre: instalación, sesión, plataforma web e idioma', l0 && l0.cuerpo);
    const ab = eventos(srv).find((e) => e.n === 'app_abierta');
    bien(ab && ab.d && ab.d.origen === 'web' && ab.d.idioma === 'es' && ab.d.primera === true && /^[a-f0-9]{12}$/.test(ab.k) && typeof ab.t === 'number', 'app_abierta {origen, idioma, primera} con clave y hora', ab);
    bien(!JSON.stringify(srv.lotes).includes('jugador_id'), 'El juego no manda jugador_id (lo pone el servidor con la sesión)');
    const jugado = await jugarPrimerEvento(page);
    bien(jugado, 'Primer evento jugado siguiendo la guía');
    await page.waitForTimeout(1500);
    await vaciar(page, srv);
    const pasos = eventos(srv).filter((e) => e.n === 'tutorial_paso').map((e) => e.d.paso);
    bien(['intro', 'clientes', 'evento', 'auto', 'aire', 'elegir', 'terminar', 'resultado'].every((p) => pasos.includes(p)), 'tutorial_paso de cada paso de la guía', pasos);
    bien(new Set(pasos).size === pasos.length, 'Cada paso una sola vez', pasos);
    const ini = eventos(srv).find((e) => e.n === 'evento_iniciado');
    const ter = eventos(srv).find((e) => e.n === 'evento_terminado');
    bien(ini && typeof ini.d.tipo === 'string' && ini.d.tipo.length > 0 && ini.d.capitulo === 0, 'evento_iniciado {tipo, capítulo}', ini);
    bien(ter && ter.d.tipo === ini.d.tipo && ter.d.estrellas >= 1 && ter.d.estrellas <= 5, 'evento_terminado {tipo, estrellas}', ter);
    // Tienda y En línea
    await cerrar(page);
    await page.evaluate(() => { const g = window.Guia; if (g && g.terminar) g.terminar(); });
    await page.locator('nav button[data-tab="tienda"]').click();
    await page.waitForTimeout(200);
    await page.locator('nav button[data-tab="tienda"]').click();   // otra vez en la misma pestaña: no cuenta
    await page.locator('nav button[data-tab="online"]').click();
    await page.waitForTimeout(200);
    await page.evaluate(() => window.EnVivoAbrirOnline && window.EnVivoAbrirOnline('liga'));
    await page.waitForTimeout(200);
    await vaciar(page, srv);
    const ns = nombres(srv);
    bien(ns.filter((n) => n === 'tienda_abierta').length === 1, 'tienda_abierta una vez por entrada a la tienda', ns.filter((n) => n === 'tienda_abierta').length);
    const on = eventos(srv).filter((e) => e.n === 'modo_online_abierto').map((e) => e.d.modo);
    bien(on.includes('hub') && on.includes('liga'), 'modo_online_abierto con el modo (hub, liga)', on);
    // Esconder la página: sesion_fin por sendBeacon
    await page.waitForTimeout(1200);
    const antes = srv.lotes.length;
    await page.evaluate(() => window.Analitica._esconder());
    await page.waitForTimeout(400);
    const beacon = srv.lotes.slice(antes).find((l) => l.cuerpo && l.cuerpo.e.some((e) => e.n === 'sesion_fin'));
    bien(beacon && beacon.xenvivo === null && /text\/plain/.test(beacon.tipo), 'Al esconder: sesion_fin por sendBeacon (texto plano, sin X-Envivo)', beacon && { x: beacon.xenvivo, t: beacon.tipo });
    const sf = beacon && beacon.cuerpo.e.find((e) => e.n === 'sesion_fin');
    bien(sf && sf.d.duracion_s >= 2 && sf.d.duracion_s < 600, 'sesion_fin {duracion_s} con el tiempo visible', sf);
    await page.evaluate(() => window.Analitica._mostrar());
    const ses0 = beacon && beacon.cuerpo.s;
    bien(await page.evaluate(() => window.Analitica._sesion()) === ses0, 'Volver antes de 30 min sigue la misma sesión');
    // Compra: el producto pasa de compra_iniciada a compra_aprobada
    await page.evaluate(() => { window.Analitica.evento('compra_iniciada', { producto: 'creditos_500', canal: 'web_plux' }); });
    // Recargar: la cola se guarda y los pasos de la guía no se repiten
    const k = srv.lotes.length;
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.Analitica, null, { timeout: 10000 });
    await page.evaluate(() => window.Analitica.evento('tutorial_paso', { paso: 'intro' }));
    await vaciar(page, srv);
    const tras = srv.lotes.slice(k).flatMap((l) => l.cuerpo.e);
    bien(eventos(srv).some((e) => e.n === 'compra_iniciada' && e.d.producto === 'creditos_500'), 'Lo que estaba en la cola sale al recargar (sendBeacon al cerrar la página)');
    bien(!tras.some((e) => e.n === 'tutorial_paso'), 'Un paso de la guía ya mandado no se repite (otra sesión)');
    bien(srv.lotes.slice(k).every((l) => l.cuerpo.i === inst), 'La instalación es la misma al recargar');
    bien(tras.some((e) => e.n === 'app_abierta' && !e.d.primera), 'app_abierta al recargar (sin "primera")');
    await page.goto(BASE + '/index.html?fecha=2026-11-10&compra=ok', { waitUntil: 'load' });
    await page.waitForFunction(() => window.Analitica, null, { timeout: 10000 });
    await page.waitForTimeout(800);
    await vaciar(page, srv);
    const ap = eventos(srv).find((e) => e.n === 'compra_aprobada');
    bien(ap && ap.d.canal === 'web_plux' && ap.d.producto === 'creditos_500', 'Volver del pago (?compra=ok): compra_aprobada con el producto que se empezó a comprar', ap);
    // Lo mandado por sendBeacon se vuelve a mandar al abrir otra vez (no se sabe si llegó): con la MISMA clave,
    // así el servidor no lo cuenta dos veces (índice único instalación + clave)
    const porClave = {};
    eventos(srv).forEach((e) => { (porClave[e.k] = porClave[e.k] || []).push(JSON.stringify(e)); });
    bien(Object.values(porClave).every((l) => new Set(l).size === 1), 'Un evento repetido lleva la misma clave y los mismos datos (el servidor lo ignora)');
    bien(Object.values(porClave).every((l) => l.length <= 2), 'Ningún evento se manda más de dos veces (fetch + reenvío de un beacon)');
    await ctx.close();
  }

  /* ---------- 2. Sin internet, lotes de 50, opción "no enviar" ---------- */
  {
    const { ctx, page, srv } = await abrir(browser, { modo: 'caido', tag: 'caido' });
    await page.evaluate(() => { for (let i = 0; i < 70; i++) window.Analitica.evento('m_prueba', { i, texto: 'x'.repeat(200), obj: { a: 1 } }); });
    await page.waitForTimeout(500);
    const cola = await page.evaluate(() => window.Analitica._cola());
    bien(cola.length === 71 && cola[1].d.texto.length === 80 && cola[1].d.obj === undefined, 'Sin internet: todo queda en la cola (textos de 80, sin objetos)', cola.length);
    bien(await page.evaluate(() => JSON.parse(localStorage.getItem('envivo_analitica_cola') || '[]').length) === 71, '…y guardado en localStorage');
    bien(await page.evaluate(() => window.Analitica.evento('nombre raro!')) === false, 'Nombre no permitido: no entra a la cola');
    srv.modo = 'ok';
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.Analitica, null, { timeout: 10000 });
    await vaciar(page, srv);
    bien(srv.lotes.length >= 2 && srv.lotes.every((l) => l.cuerpo.e.length <= 50), 'Al volver el internet se manda en lotes de 50 como máximo', srv.lotes.map((l) => l.cuerpo.e.length));
    bien(new Set(eventos(srv).filter((e) => e.n === 'm_prueba').map((e) => e.k)).size === 70, 'Llegaron los 70 eventos guardados aunque el beacon de antes se perdió (sin internet)');
    await page.evaluate(() => window.Analitica.desactivar());
    const n0 = srv.lotes.length;
    const r = await page.evaluate(() => [window.Analitica.evento('tienda_abierta'), window.Analitica.activo(), localStorage.getItem('envivo_analitica_no')]);
    await page.evaluate(() => window.Analitica._esconder());
    await page.waitForTimeout(300);
    bien(r[0] === false && r[1] === false && r[2] === '1' && srv.lotes.length === n0, 'Opción "no enviar estadísticas": nada entra ni sale', r);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    bien(srv.lotes.length === n0 && await page.evaluate(() => window.Analitica.activo()) === false, 'La opción se recuerda al recargar');
    await page.evaluate(() => window.Analitica.activar());
    await page.evaluate(() => window.Analitica.evento('tienda_abierta'));
    await vaciar(page, srv);
    bien(nombres(srv).includes('tienda_abierta'), 'activar() vuelve a mandar');
    await ctx.close();
  }

  /* ---------- 3. Servidor con la analítica apagada ---------- */
  {
    const { ctx, page, srv } = await abrir(browser, { modo: 'apagada', tag: 'apagada' });
    await page.evaluate(() => window.Analitica.evento('tienda_abierta'));
    await enviar(page); await page.waitForTimeout(300);
    bien(srv.lotes.length === 1 && await page.evaluate(() => window.Analitica._cola().length) === 0, 'Servidor "apagada": la cola se vacía');
    await ctx.close();
  }

  /* ---------- 4. Pruebas automáticas normales: no manda nada ---------- */
  {
    const { ctx, page, srv } = await abrir(browser, { activar: false, tag: 'webdriver' });
    await cerrar(page);
    await page.locator('nav button[data-tab="tienda"]').click();
    await page.waitForTimeout(4500);   // más que el primer envío (4 s)
    const r = await page.evaluate(() => [window.Analitica.activo(), localStorage.getItem('envivo_instalacion'), (window.__anCola || []).length]);
    bien(r[0] === false && r[1] === null && srv.lotes.length === 0, 'Con navigator.webdriver y sin __ENVIVO_ANALITICA: inactiva, sin instalación y sin peticiones', r);
    await ctx.close();
  }

  await browser.close();
  bien(errores.length === 0, 'Sin errores en la página ni en la consola', errores.slice(0, 5));
  console.log(`\n${bien_} correctas, ${fallas} fallas`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
