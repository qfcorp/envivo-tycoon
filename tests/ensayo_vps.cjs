/* Parte de navegador del ensayo del VPS (la arranca tests/ensayo_vps.sh). Chromium en un celular 390x844 contra
   https://juego.tukanec.com (que el ensayo apunta a 127.0.0.1), como lo haría el dueño:
   modo "antes-demo":  jugador nuevo: tutorial (3 eventos), crear cuenta, 700 créditos con Plux (tarjeta aprobada),
                       canje del Dron 4K, paquete de inicio con 3DS, pestaña En línea (liga, copa, tarjeta del servidor),
                       chat, mercado y soporte; luego el Centro de Control con usuario, clave y código de 6 dígitos
                       (la venta en Compras y el caso de soporte).
   modo "con-demo":    con las productoras de muestra: jugador nuevo con cuenta mira el chat y la Copa (imprime
                       CHAT_VIVO y COPA_VIVA si se ven con vida).
   Uso: node tests/ensayo_vps.cjs BASE USUARIO CLAVE SECRETO_TOTP CARPETA_CAPTURAS MODO */
'use strict';
const { chromium } = require('playwright');
const crypto = require('crypto');
const [base, usuario, clave, secreto, carpeta, modo = 'antes-demo'] = process.argv.slice(2);
const host = new URL(base).hostname;
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; return c; };
const email = `ensayo${Date.now()}@prueba.ec`;

function totp(s) {
  const alf = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) bits += alf.indexOf(ch).toString(2).padStart(5, '0');
  const k = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac('sha1', k).update(c).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
async function paso(nombre, fn) {
  try { await fn(); } catch (e) { ok(false, `${nombre}: ${String(e.message || e).split('\n')[0]}`); }
}
async function cerrar(p) {
  for (let i = 0; i < 6; i++) {
    const b = p.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"], #overlay.on [data-act="close-dia"]');
    if (!(await b.count())) return;
    await b.first().click().catch(() => {});
    await p.waitForTimeout(200);
  }
}
async function pagar(p, tarjeta) {
  await p.waitForSelector('#plux-numero');
  await p.fill('#plux-numero', tarjeta);
  await p.selectOption('#plux-mes', '04');
  await p.selectOption('#plux-anio', '2029');
  await p.fill('#plux-cvv', '123');
  await p.fill('#plux-nombres', 'Dimitry');
  await p.fill('#plux-apellidos', 'Ensayo');
  await p.fill('#plux-cedula', '1710034065');
  await p.fill('#plux-telefono', '0987654321');
  const em = p.locator('#plux-email');
  if (await em.count() && !(await em.inputValue())) await em.fill(email);
  await p.check('#plux-terminos');
  await Promise.all([p.waitForURL((u) => u.hostname === host && (u.search.includes('compra=') || u.pathname === '/'), { timeout: 30000 }), p.click('#plux-pagar')]);
}
const creditos = (p) => p.evaluate(() => (window.Api && window.Api.estado ? window.Api.estado.creditos : -1));
const foto = (p, n, full = false) => p.screenshot({ path: `${carpeta}/ensayo_${n}.png`, fullPage: full });
const tab = async (p, t) => { await cerrar(p); await p.click(`nav button[data-tab="${t}"]`); await p.waitForTimeout(500); };

async function jugarEvento(p) {
  await p.click('[data-act="prep"]');
  await p.waitForSelector('[data-act="go-live"]');
  await p.click('[data-act="go-live"]');
  for (let k = 0; k < 8; k++) {
    const choice = p.locator('[data-act="choose"]:not([disabled])');
    if (!(await choice.count())) break;
    await choice.first().click();
    await p.locator('[data-act="next-inc"], [data-act="finish"]').first().click();
  }
  await p.waitForSelector('[data-act="after-result"]', { timeout: 15000 });
  await p.click('[data-act="after-result"]');
  await cerrar(p);
}
async function crearCuenta(p, nombre) {
  await tab(p, 'tienda');
  await p.click('[data-act="cuenta"][data-modo="registro"]');
  await p.fill('#cu-nombre', nombre);
  await p.fill('#cu-email', email);
  await p.fill('#cu-clave', 'clave-segura-123');
  await p.click('#cu-btn');
  await p.waitForFunction(() => window.Api.logueado(), null, { timeout: 15000 });
  await cerrar(p);
}

async function intentoLiga(p, ok, foto) {
  await tab(p, 'online');
  await p.click('[data-act="online"][data-k="liga"]');
  await p.waitForSelector('[data-liga]', { timeout: 10000 });
  await p.waitForTimeout(800);
  if (await p.locator('[data-liga="asociaciones"]').count()) {
    await p.click('[data-liga="asociaciones"]');
    await p.waitForSelector('[data-chat="unirse"]', { timeout: 10000 });
    await foto(p, '24_demo_asociaciones');
    await p.locator('[data-chat="unirse"]').first().click();
    await p.waitForTimeout(2000);
    await p.locator('[data-chat="cerrar"]:visible').first().click().catch(() => {});
    await tab(p, 'online');
    await p.click('[data-act="online"][data-k="liga"]');
    await p.waitForSelector('[data-liga]', { timeout: 10000 });
    await p.waitForTimeout(1200);
  }
  await foto(p, '25_demo_liga');
  const tomar = p.locator('[data-liga="tomar"]:not([disabled])');
  if (await tomar.count()) { await tomar.first().click(); await p.waitForTimeout(1200); await cerrar(p); }
  const jugar = p.locator('[data-liga="jugar"]:not([disabled])');
  if (!(await jugar.count())) {
    const t = await p.evaluate(() => (document.getElementById('online-cont') || document.body).innerText);
    return ok(false, 'Liga: no hay botón Jugar habilitado: ' + t.replace(/\s+/g, ' ').slice(0, 200));
  }
  await jugar.first().click();
  await p.waitForTimeout(1000);
  await foto(p, '26_demo_liga_jugando');
  if (await p.locator('[data-act="go-live"]').count()) await p.click('[data-act="go-live"]');
  for (let k = 0; k < 8; k++) {
    const ch = p.locator('[data-act="choose"]:not([disabled])');
    if (!(await ch.count())) break;
    await ch.first().click();
    await p.locator('[data-act="next-inc"], [data-act="finish"]').first().click();
  }
  await p.waitForTimeout(800);
  await foto(p, '27_demo_liga_resultado');
  for (const sel of ['[data-act="vi-enviar"]', '[data-act="after-result"]', '[data-act="vi-salir"]', '[data-liga="enviar"]']) {
    const b = p.locator(sel + ':not([disabled])');
    if (await b.count()) { await b.first().click(); await p.waitForTimeout(2000); }
  }
  await cerrar(p);
  await tab(p, 'online');
  await p.click('[data-act="online"][data-k="liga"]').catch(() => {});
  await p.waitForTimeout(1500);
  await foto(p, '28_demo_liga_despues');
  const t = await p.evaluate(() => (document.getElementById('online-cont') || document.body).innerText);
  console.log('      liga: ' + t.replace(/\s+/g, ' ').slice(0, 240));
  return ok(/punto|pts|resultado|revisa/i.test(t), 'Liga: intento jugado y enviado');
}

(async () => {
  const nav = await chromium.launch({ args: [`--host-resolver-rules=MAP ${host} 127.0.0.1`, '--ignore-certificate-errors'] });
  const opciones = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'es-EC', ignoreHTTPSErrors: true };
  const ctx = await nav.newContext(opciones);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('pagina: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push('consola: ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const desborde = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Api && window.Api.disponible !== null && window.__game, null, { timeout: 20000 });
  ok(await p.evaluate(() => window.Api.disponible === true), 'El juego encontró el servidor (https)');

  if (modo === 'con-demo') {
    await cerrar(p);
    await paso('cuenta', () => crearCuenta(p, 'Mirando la Demo'));
    await paso('chat con demo', async () => {
      await p.click('#chat-btn');
      await p.waitForTimeout(1500);
      const n = await p.locator('#chat-lista > *').count();
      await foto(p, '20_demo_chat');
      if (ok(n >= 3, `Chat con mensajes de las productoras de muestra (${n})`)) console.log('CHAT_VIVO');
      await p.locator('[data-chat="cerrar"]').first().click().catch(() => {});
    });
    await paso('copa con demo', async () => {
      await tab(p, 'online');
      await p.click('[data-act="online"][data-k="copa"]');
      await p.waitForSelector('[data-copa]', { timeout: 10000 });
      await p.waitForTimeout(1500);
      await foto(p, '21_demo_copa');
      const marc = await p.evaluate(() => (document.getElementById('online-cont') || document.body).innerText);
      console.log('      marcador: ' + marc.replace(/\s+/g, ' ').slice(0, 200));
      const pts = (marc.match(/\d[\d.,]*/g) || []).filter((x) => parseInt(x.replace(/\D/g, ''), 10) > 0).length;
      if (ok(/Quito/.test(marc) && /Guayaquil/.test(marc) && pts >= 2, 'La Copa muestra los servidores con puntos')) console.log('COPA_VIVA');
      await foto(p, '22_demo_copa_completa', true);
    });
    await paso('liga con demo', () => intentoLiga(p, ok, foto));
    await paso('mercado con demo', async () => {
      await tab(p, 'tienda');
      await p.click('[data-act="vista-tienda"][data-k="mercado"]');
      await p.waitForTimeout(1500);
      const n = await p.locator('#merc-cont [data-merc="comprar"]').count();
      ok(n >= 3, `Mercado con equipos a la venta (${n})`);
      await foto(p, '23_demo_mercado');
    });
    ok(errores.length === 0, 'Sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));
    await nav.close();
    process.exit(fallas ? 1 : 0);
  }

  // 1) Tutorial: 3 eventos
  await foto(p, '01_intro');
  await cerrar(p);
  await paso('tutorial', async () => {
    let jugados = 0;
    for (let r = 0; r < 10 && jugados < 3; r++) {
      await tab(p, 'clientes');
      if (!(await p.locator('[data-act="prep"]').count())) {
        await p.click('[data-act="mkt"][data-k="visitar"]').catch(() => {});
        await cerrar(p);
        continue;
      }
      await jugarEvento(p);
      jugados++;
      if (jugados === 1) await foto(p, '02_tras_primer_evento');
    }
    ok(jugados === 3, `Tutorial: jugó ${jugados} eventos`);
    ok((await p.evaluate(() => window.__game.state.stats.events)) >= 3, 'El juego cuenta 3 eventos');
  });

  // 2) Cuenta, 700 créditos, canje, 3DS
  await paso('cuenta', async () => { await crearCuenta(p, 'Productora Ensayo'); ok(true, 'Cuenta creada desde la Tienda'); await foto(p, '03_cuenta'); });
  await paso('compra 700', async () => {
    await tab(p, 'tienda');
    const aviso = await p.evaluate(() => /prueba|sandbox/i.test(document.body.innerText));
    ok(aviso, 'La tienda avisa que está en modo de pruebas');
    await Promise.all([p.waitForURL(/pago\.php/, { timeout: 15000 }), p.click('[data-act="comprar"][data-k="creditos_700"]')]);
    await foto(p, '04_pago');
    ok((await desborde()) <= 1, 'Página de pago sin desplazamiento horizontal');
    await pagar(p, '4540639936908783');
    await p.waitForFunction(() => window.Api && window.Api.estado && window.Api.estado.logueado, null, { timeout: 15000 });
    await p.waitForTimeout(1000);
    ok((await creditos(p)) === 700, `Volvió al juego con 700 créditos (tiene ${await creditos(p)})`);
    await foto(p, '05_creditos');
  });
  await paso('canje', async () => {
    await tab(p, 'tienda');
    await p.click('[data-act="canjear"][data-k="dron4k"]');
    await p.click('[data-act="confirm-yes"]');
    await p.waitForFunction(() => window.__game.state.equip.some((e) => e.type === 'dron4k'), null, { timeout: 15000 });
    ok((await creditos(p)) === 250, 'Canjeó el Dron 4K: quedan 250 créditos');
  });
  await paso('3DS', async () => {
    await tab(p, 'tienda');
    await Promise.all([p.waitForURL(/pago\.php/, { timeout: 15000 }), p.click('[data-act="comprar"][data-k="inicio"]')]);
    await pagar(p, '5555555555554444');
    await p.waitForFunction(() => window.Api && window.Api.estado && window.Api.estado.inicio_comprado, null, { timeout: 20000 });
    await p.waitForTimeout(800);
    ok((await creditos(p)) === 450, `Paquete de inicio con 3DS: 450 créditos (tiene ${await creditos(p)})`);
    await cerrar(p);
  });

  // 3) Inicio: tarjeta del servidor
  await paso('tarjeta del servidor', async () => {
    await tab(p, 'inicio');
    await p.waitForSelector('[data-srv="tarjeta"]', { timeout: 10000 });
    await p.waitForFunction(() => !/Cargando/i.test((document.querySelector('[data-srv="tarjeta"]') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    const t = await p.locator('[data-srv="tarjeta"]').first().innerText();
    console.log('      tarjeta: ' + t.replace(/\s+/g, ' ').slice(0, 160));
    ok(/Quito|Servidor|servidor/.test(t), 'Inicio muestra la tarjeta de tu servidor');
    await p.locator('[data-srv="tarjeta"]').first().scrollIntoViewIfNeeded();
    await foto(p, '06_inicio_servidor');
  });

  // 4) En línea: liga, festival, duelos, desafío, copa
  await paso('en linea', async () => {
    await tab(p, 'online');
    await p.waitForTimeout(1500);
    const txt = await p.evaluate(() => document.querySelector('main, #app, body').innerText);
    for (const [k, re] of [['Liga', /Liga/], ['Festival', /Festival/], ['Duelos', /Duelo/], ['Desafío', /Desaf/], ['Copa', /Copa/]]) ok(re.test(txt), `En línea muestra ${k}`);
    ok((await desborde()) <= 1, 'En línea sin desplazamiento horizontal');
    await foto(p, '07_en_linea');
    await foto(p, '08_en_linea_completa', true);
  });
  await paso('copa', async () => {
    await p.click('[data-act="online"][data-k="copa"]');
    await p.waitForSelector('[data-copa]', { timeout: 10000 });
    await p.waitForTimeout(1200);
    await foto(p, '09_copa');
    await foto(p, '10_copa_completa', true);
    const t = await p.evaluate(() => (document.getElementById('online-cont') || document.body).innerText);
    console.log('      copa: ' + t.replace(/\s+/g, ' ').slice(0, 200));
    ok(/copa/i.test(t), 'Pantalla de la Copa de Servidores abre');
    ok((await desborde()) <= 1, 'Copa sin desplazamiento horizontal');
  });
  await paso('liga', async () => {
    await tab(p, 'online');
    await p.click('[data-act="online"][data-k="liga"]');
    await p.waitForSelector('[data-liga]', { timeout: 10000 });
    await p.waitForTimeout(800);
    await foto(p, '11_liga');
    const t = await p.evaluate(() => (document.getElementById('online-cont') || document.body).innerText);
    // Sin productoras de muestra no hay asociaciones a las que unirse, y crear una cuesta $5.000 del juego:
    // el intento de liga se juega en el modo con-demo (uniéndose a una asociación de muestra)
    // (desde de5b3ff la Liga sin asociación muestra la lista con "Unirme" y la tarjeta "Crear"; antes un botón "Buscar asociación")
    ok(/asociaci/i.test(t) && (await p.locator('[data-liga="crear"], [data-liga="unirme"], [data-liga="asociaciones"]').count()) >= 1, 'Liga: pide unirse a una asociación (Unirme / Crear)');
  });
  // 5) Chat
  await paso('chat', async () => {
    await cerrar(p);
    await p.locator('#chat-panel [data-chat="cerrar"]:visible').first().click().catch(() => {});
    await p.waitForSelector('#chat-btn:not([hidden])', { timeout: 10000 });
    await p.click('#chat-btn');
    await p.waitForSelector('#chat-texto', { timeout: 10000 });
    await p.fill('#chat-texto', 'Hola desde el ensayo del VPS');
    await p.press('#chat-texto', 'Enter');
    await p.waitForFunction(() => /ensayo del VPS/.test((document.getElementById('chat-lista') || {}).innerText || ''), null, { timeout: 10000 });
    ok(true, 'Mensaje enviado y visible en el chat');
    await foto(p, '14_chat');
    await p.locator('[data-chat="cerrar"]').first().click().catch(() => {});
  });

  // 6) Mercado: publicar el Dron 4K
  await paso('mercado', async () => {
    await tab(p, 'tienda');
    await p.click('[data-act="vista-tienda"][data-k="mercado"]');
    await p.waitForSelector('#merc-cont', { timeout: 10000 });
    await p.waitForTimeout(1200);
    await foto(p, '15_mercado');
    const pub = p.locator('#merc-cont [data-merc="publicar"]');
    if (await pub.count()) {
      await pub.first().click();
      await p.waitForSelector('#merc-precio', { timeout: 8000 });
      await p.fill('#merc-precio', '300');
      await p.click('[data-merc="confirmar-publicar"]');
      await p.waitForTimeout(1500);
      await cerrar(p);
      await foto(p, '16_mercado_publicado');
      ok((await p.locator('#merc-cont [data-merc="retirar"]').count()) >= 1, 'Publicó un equipo en el mercado (puede retirarlo)');
    } else ok(false, 'No aparece el botón Publicar en el mercado');
  });

  // 7) Soporte
  await paso('soporte', async () => {
    await tab(p, 'tienda');
    await p.locator('[data-act="vista-tienda"]').first().click().catch(() => {});
    await p.locator('[data-act="soporte"]').first().click();
    await p.waitForTimeout(800);
    await foto(p, '17_soporte');
    const nuevo = p.locator('[data-sop="nuevo"]');
    if (await nuevo.count()) { await nuevo.first().click(); await p.waitForTimeout(500); }
    await p.waitForSelector('#sop-form', { timeout: 8000 });
    const opts = await p.locator('#sop-cat option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
    if (opts.length) await p.selectOption('#sop-cat', opts.includes('pago') ? 'pago' : opts[0]);
    if (await p.locator('#sop-asunto').count()) await p.fill('#sop-asunto', 'Prueba del ensayo');
    await p.fill('#sop-msg', 'Hola, esto es una prueba del ensayo del VPS. No hace falta responder.');
    await foto(p, '18_soporte_form');
    await p.locator('#sop-form button[type="submit"], #sop-form [type="submit"]').first().click();
    await p.waitForTimeout(1500);
    await foto(p, '19_soporte_enviado');
    const r = await p.evaluate(() => fetch('/api/soporte/casos', { credentials: 'same-origin' }).then((x) => x.text()).catch(() => ''));
    ok(/ensayo/i.test(r) || /Prueba del ensayo/.test(await p.evaluate(() => document.body.innerText)), 'El caso de soporte quedó creado');
  });
  ok(errores.length === 0, 'Jugador sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : ''));

  // 8) Centro de Control con 2FA
  const c2 = await nav.newContext(opciones);
  const q = await c2.newPage();
  const errC = [];
  q.on('pageerror', (e) => errC.push('pagina: ' + e.message));
  q.on('console', (m) => { if (m.type() === 'error') errC.push('consola: ' + m.text()); });
  await paso('control', async () => {
    const r = await q.goto(base + '/control/');
    ok(r.status() === 200, '/control/ abre');
    ok((await q.locator('input[name="codigo"]').count()) === 1, 'La entrada pide el código de 6 dígitos');
    await q.screenshot({ path: `${carpeta}/ensayo_30_control_entrada.png` });
    await q.fill('input[name="usuario"]', usuario);
    await q.fill('input[name="clave"]', clave);
    await q.fill('input[name="codigo"]', totp(secreto));
    await Promise.all([q.waitForNavigation(), q.click('#form-entrar button[type="submit"]')]);
    ok((await q.locator('nav.pestanas').count()) === 1, 'Entró al Centro de Control con usuario, clave y código');
    await q.screenshot({ path: `${carpeta}/ensayo_31_control_resumen.png`, fullPage: true });
    await q.goto(base + '/control/?t=compras&estado=todas');
    const t = await q.evaluate(() => document.body.innerText);
    ok(/creditos_700|700 créditos|700/.test(t) && /Productora Ensayo|ensayo/i.test(t), 'Compras muestra la venta de 700 créditos');
    await q.screenshot({ path: `${carpeta}/ensayo_32_control_compras.png`, fullPage: true });
    await q.goto(base + '/control/?t=soporte&estado=todos');
    ok(/Prueba del ensayo|ensayo del VPS/.test(await q.evaluate(() => document.body.innerText)), 'Soporte muestra el caso del jugador');
    await q.screenshot({ path: `${carpeta}/ensayo_33_control_soporte.png`, fullPage: true });
    ok((await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'Panel sin desplazamiento horizontal');
  });
  ok(errC.length === 0, 'Panel sin errores' + (errC.length ? ': ' + errC.join(' | ') : ''));
  await nav.close();
  if (fallas) { console.error(`\n❌ ${fallas} fallas`); process.exit(1); }
  console.log('\n✅ Recorrido de navegador OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
