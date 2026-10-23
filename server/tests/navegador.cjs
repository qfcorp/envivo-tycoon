// SOLO PRUEBAS: la página de pago en un navegador de verdad (Chromium con Playwright) contra el Plux FALSO.
//  Celular 390x844: registrarse por la API, crear la orden, abrir pago.php, llenar la tarjeta aprobada con el JavaScript real
//  (CryptoJS + JSEncrypt), pagar y llegar a /?compra=ok. Además: tarjeta rechazada (mensaje), casilla de términos obligatoria
//  y 3DS (banco -> /api/plux/3ds con la galleta de sesión). Revisa: sin errores de consola y sin desplazamiento horizontal.
// Uso: NODE_PATH=/opt/npm-tools/node_modules node server/tests/navegador.cjs BASE  -> imprime una línea JSON {ok, pasos, errores}
const { chromium } = require('playwright');

(async () => {
  const [base] = process.argv.slice(2);
  const r = { ok: false, pasos: {}, errores: [] };
  const nav = await chromium.launch();
  // Solo se cuentan errores de las páginas del servidor (pago, legales). La portada del juego ("/") la prueba su propio
  // equipo: al volver del banco (3DS) se llega a /?compra=ok por redirecciones del servidor y ahí carga el juego real.
  const esJuego = (u) => { try { const x = new URL(u); return x.pathname === '/' || x.pathname.startsWith('/js/') || x.pathname.startsWith('/icons/'); } catch (e) { return false; } };
  const vigilar = (p, n) => {
    p.on('pageerror', e => { if (!esJuego(p.url())) r.errores.push(n + ': ' + e); });
    p.on('console', m => { if (m.type() === 'error' && !esJuego(p.url())) r.errores.push(n + ' consola: ' + m.text() + ' @ ' + ((m.location() || {}).url || '')); });
    p.on('response', x => { if (x.status() >= 400 && !esJuego(p.url()) && !esJuego(x.url()) && !/\/api\/plux\/pago/.test(x.url())) r.errores.push(n + ' HTTP ' + x.status() + ' ' + x.url()); });
    return p;
  };
  const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const api = async (ctx, ruta, datos) => {
    const res = await ctx.request.post(base + ruta, { data: datos, headers: { 'X-Envivo': '1' } });
    return res.json();
  };
  const llenar = async (p, num) => {
    await p.fill('#plux-numero', num);
    await p.selectOption('#plux-mes', '04');
    await p.selectOption('#plux-anio', '2029');
    await p.fill('#plux-cvv', '123');
    await p.fill('#plux-nombres', 'Nadia');
    await p.fill('#plux-apellidos', 'Navegador');
    await p.fill('#plux-cedula', '1710034065');
    await p.fill('#plux-telefono', '0987654321');
  };
  try {
    // serviceWorkers: 'block' -> esta prueba es de la página de pago; el modo sin internet del juego lo prueba su propio equipo
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-EC', serviceWorkers: 'block' });
    // El juego (index.html) no es parte de esta prueba (lo prueba su propio equipo): la portada "/" se cambia por una
    // página mínima solo para confirmar que llegamos a /?compra=ok.
    await ctx.route(new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\?.*)?$'), x => x.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>juego</title><p>juego</p>' }));
    const email = 'nav' + Date.now() + '@prueba.example';
    const reg = await api(ctx, '/api/registro', { email, nombre: 'Nadia Navegador', clave: 'ClaveNavegador1' });
    r.pasos.registro = reg.logueado === true;
    const p = vigilar(await ctx.newPage(), 'pago');

    // 1. Tarjeta rechazada: mensaje claro y se puede reintentar
    let o = await api(ctx, '/api/orden', { producto: 'creditos_700' });
    await p.goto(base + o.url);
    r.pasos.desborde_390 = await desborde(p);
    r.pasos.valor_fijo = (await p.textContent('#valor-fijo')).trim();
    r.pasos.ancho_boton_ok = await p.evaluate(() => { const b = document.getElementById('plux-pagar').getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; });
    await llenar(p, '4111111111111111');
    await p.click('#plux-pagar');
    r.pasos.terminos_obligatorio = (await p.textContent('#plux-mensaje')).includes('aceptar los términos');
    await p.check('#plux-terminos');
    await p.click('#plux-pagar');
    await p.waitForSelector('#plux-mensaje.aviso-error:has-text("no aprobó")', { timeout: 15000 });
    r.pasos.rechazada_mensaje = true;
    r.pasos.cvv_borrado = (await p.inputValue('#plux-cvv')) === '';

    // 2. Tarjeta aprobada en la misma compra -> /?compra=ok
    await p.fill('#plux-numero', '4540639936908783');
    await p.fill('#plux-cvv', '123');
    await Promise.all([p.waitForURL(u => u.pathname === '/' && u.search === '?compra=ok', { timeout: 20000 }), p.click('#plux-pagar')]);
    r.pasos.aprobada_compra_ok = new URL(p.url()).search === '?compra=ok';
    let est = await (await ctx.request.get(base + '/api/estado')).json();
    r.pasos.creditos_tras_aprobada = est.creditos;

    // 3. 3DS: el navegador va al "banco" y vuelve a /api/plux/3ds (sin parámetros propios) con la galleta de sesión
    o = await api(ctx, '/api/orden', { producto: 'vip30' });
    await p.goto(base + o.url);
    await llenar(p, '5555555555554444');
    await p.check('#plux-terminos');
    await Promise.all([p.waitForURL(u => u.search === '?compra=ok', { timeout: 20000 }), p.click('#plux-pagar')]);
    est = await (await ctx.request.get(base + '/api/estado')).json();
    r.pasos.tres_ds_vip = est.vip_activo === true;

    // 4. Páginas legales: se ven bien en el celular
    for (const pag of ['/terminos.html', '/privacidad.html']) {
      await p.goto(base + pag);
      r.pasos['desborde_' + pag.slice(1, -5)] = await desborde(p);
    }
    await ctx.close();
    const s = r.pasos;
    r.ok = s.registro && s.desborde_390 === 0 && s.valor_fijo === '$4,99' && s.ancho_boton_ok && s.terminos_obligatorio && s.rechazada_mensaje && s.cvv_borrado
      && s.aprobada_compra_ok && s.creditos_tras_aprobada === 700 && s.tres_ds_vip && s.desborde_terminos === 0 && s.desborde_privacidad === 0 && r.errores.length === 0;
  } catch (e) {
    r.errores.push(String(e));
  }
  await nav.close();
  console.log(JSON.stringify(r));
})();
