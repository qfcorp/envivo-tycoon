/* Prueba de punta a punta de la TIENDA desde el juego (con el servidor real y un Plux FALSO).
   La arranca tests/tienda_e2e.sh. Simula a un jugador en un celular:
   1) crea su cuenta desde la pestaña Tienda, 2) compra 700 créditos con tarjeta (aprobada),
   3) canjea un Dron 4K, 4) compra el paquete de inicio con validación 3DS del banco,
   5) abre el juego en OTRO celular, entra a su cuenta y recupera la partida de la nube. */
'use strict';
const { chromium } = require('playwright');
const base = process.argv[2];
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const email = `jugador${Date.now()}@prueba.ec`;

async function cerrarVentanas(p) {
  for (let i = 0; i < 4; i++) {
    const b = p.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"]');
    if (!(await b.count())) return;
    await b.first().click();
    await p.waitForTimeout(150);
  }
}
async function pagar(p, tarjeta) {
  await p.waitForSelector('#plux-numero');
  await p.fill('#plux-numero', tarjeta);
  await p.selectOption('#plux-mes', '04');
  await p.selectOption('#plux-anio', '2029');
  await p.fill('#plux-cvv', '123');
  await p.fill('#plux-nombres', 'Jugadora');
  await p.fill('#plux-apellidos', 'De Prueba');
  await p.fill('#plux-cedula', '1710034065');
  await p.fill('#plux-telefono', '0987654321');
  const em = p.locator('#plux-email');
  if (await em.count() && !(await em.inputValue())) await em.fill(email);
  await p.check('#plux-terminos');
  await Promise.all([p.waitForURL((u) => u.search.includes('compra=ok') || u.pathname === '/', { timeout: 30000 }), p.click('#plux-pagar')]);
}
const creditos = (p) => p.evaluate(() => (window.Api && window.Api.estado ? window.Api.estado.creditos : -1));
const bodega = (p) => p.evaluate(() => window.__game.state.equip.map((e) => e.type));

(async () => {
  const browser = await chromium.launch();
  const opciones = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const ctx = await browser.newContext(opciones);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  ok(await p.evaluate(() => window.Api.disponible === true), 'El juego encontró el servidor de la tienda');
  await cerrarVentanas(p);

  // 1) Crear cuenta
  await p.click('nav button[data-tab="tienda"]');
  await p.click('[data-act="cuenta"][data-modo="registro"]');
  await p.fill('#cu-nombre', 'Productora de Prueba');
  await p.fill('#cu-email', email);
  await p.fill('#cu-clave', 'clave-segura-123');
  await p.click('#cu-btn');
  await p.waitForFunction(() => window.Api.logueado(), null, { timeout: 15000 });
  ok(true, 'Cuenta creada desde el juego');
  await cerrarVentanas(p);
  // Jugar un poco para que la partida tenga avance (día 2)
  await p.evaluate(() => { window.Game.nextDay(window.__game.state); });
  await p.click('nav button[data-tab="tienda"]');
  await p.screenshot({ path: 'tests/capturas/tienda_01_cuenta.png' });

  // 2) Comprar 700 créditos (tarjeta aprobada)
  await Promise.all([p.waitForURL(/pago\.php/, { timeout: 15000 }), p.click('[data-act="comprar"][data-k="creditos_700"]')]);
  ok(true, 'El botón Comprar abrió la página de pago');
  await p.screenshot({ path: 'tests/capturas/tienda_02_pago.png' });
  await pagar(p, '4540639936908783');
  await p.waitForFunction(() => window.Api && window.Api.estado && window.Api.estado.logueado, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  ok((await creditos(p)) === 700, `Volvió al juego con 700 créditos (tiene ${await creditos(p)})`);
  await cerrarVentanas(p);
  await p.screenshot({ path: 'tests/capturas/tienda_03_creditos.png' });

  // 3) Canjear Dron 4K (450 créditos)
  await p.click('nav button[data-tab="tienda"]');
  await p.click('[data-act="canjear"][data-k="dron4k"]');
  await p.click('[data-act="confirm-yes"]');
  await p.waitForFunction(() => window.__game.state.equip.some((e) => e.type === 'dron4k'), null, { timeout: 15000 });
  ok((await creditos(p)) === 250, 'Canjeó el Dron 4K: quedan 250 créditos');
  ok((await bodega(p)).includes('dron4k'), 'El Dron 4K está en la bodega');

  // 4) Paquete de inicio con 3DS
  await cerrarVentanas(p);
  await p.click('nav button[data-tab="tienda"]');
  await Promise.all([p.waitForURL(/pago\.php/, { timeout: 15000 }), p.click('[data-act="comprar"][data-k="inicio"]')]);
  await pagar(p, '5555555555554444');
  await p.waitForFunction(() => window.Api && window.Api.estado && window.Api.estado.inicio_comprado, null, { timeout: 20000 });
  await p.waitForTimeout(800);
  const s1 = await p.evaluate(() => ({ eq: window.__game.state.equip.map((e) => e.type), staff: window.__game.state.staff.length, cable: window.__game.state.stock.cable, cr: window.Api.estado.creditos, dia: window.__game.state.day }));
  ok(s1.eq.includes('cam_pro') && s1.staff >= 2 && s1.cable >= 5, 'Paquete de inicio (con 3DS) entregó cámara, técnico y repuestos');
  ok(s1.cr === 450, `Paquete de inicio sumó 200 créditos (tiene ${s1.cr})`);
  await cerrarVentanas(p);
  await p.click('nav button[data-tab="tienda"]');
  ok(await p.locator('[data-act="comprar"][data-k="inicio"][disabled]').count() === 1, 'El paquete de inicio ya no se puede volver a comprar');
  await p.screenshot({ path: 'tests/capturas/tienda_04_inicio.png' });
  // Guardar en la nube ya
  await p.evaluate(async () => { await window.Api.subirPartida(window.Game.serialize(window.__game.state)); });

  // 5) Otro celular: entra y recupera la partida
  const ctx2 = await browser.newContext(opciones);
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errores.push('celular 2: ' + e.message));
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p2.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  await cerrarVentanas(p2);
  await p2.click('nav button[data-tab="tienda"]');
  await p2.click('[data-act="cuenta"][data-modo="entrar"]');
  await p2.fill('#cu-email', email);
  await p2.fill('#cu-clave', 'clave-segura-123');
  await p2.click('#cu-btn');
  await p2.waitForFunction(() => window.__game.state.equip.some((e) => e.type === 'dron4k'), null, { timeout: 15000 });
  const s2 = await p2.evaluate(() => ({ dia: window.__game.state.day, cr: window.Api.estado.creditos, dron: window.__game.state.equip.filter((e) => e.type === 'dron4k').length }));
  ok(s2.dia === s1.dia && s2.cr === 450, 'En el otro celular recuperó la partida de la nube y sus créditos');
  ok(s2.dron === 1, 'El dron no se duplicó al recuperar la partida');

  const ancho = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ancho <= 1, 'Sin desplazamiento horizontal en la tienda');
  ok(errores.length === 0, 'Sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();
  if (fallas) { console.error(`\n❌ ${fallas} fallas`); process.exit(1); }
  console.log('\n✅ Tienda de punta a punta OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
