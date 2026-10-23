// SOLO PRUEBAS: el Centro de Control en un navegador de verdad (Chromium con Playwright) en un celular 390x844.
// Entra con el formulario, recorre cada pestaña (y la ficha de un jugador, el detalle de una compra y un caso de soporte),
// y revisa: sin desplazamiento horizontal, sin errores de consola ni de la página (incluida la CSP), y guarda capturas.
// Uso: NODE_PATH=/opt/npm-tools/node_modules node navegador_control.cjs BASE USUARIO CLAVE CARPETA_CAPTURAS [JUGADOR] [COMPRA] [CASO]
//      -> imprime una línea JSON { ok, paginas: { nombre: { desborde, http } }, errores: [...] }
const { chromium } = require('playwright');

(async () => {
  const [base, usuario, clave, carpeta, jugador = '1', compra = '1', caso = '1'] = process.argv.slice(2);
  const r = { ok: false, paginas: {}, errores: [], pasos: {} };
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-EC', deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => r.errores.push('pagina: ' + e));
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') r.errores.push('consola (' + p.url() + '): ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    const desborde = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // Entrada
    let res = await p.goto(base + '/control/');
    r.paginas.entrada = { http: res.status(), desborde: await desborde() };
    await p.screenshot({ path: carpeta + '/control_entrada.png' });
    await p.fill('input[name="usuario"]', usuario);
    await p.fill('input[name="clave"]', clave);
    await Promise.all([p.waitForNavigation(), p.click('#form-entrar button[type="submit"]')]);
    r.pasos.entro = (await p.locator('nav.pestanas').count()) === 1;

    const paginas = [
      ['resumen', '/control/?t=resumen'], ['jugadores', '/control/?t=jugadores'], ['ficha', '/control/?t=jugadores&id=' + jugador],
      ['compras', '/control/?t=compras&estado=todas'], ['compra', '/control/?t=compras&id=' + compra], ['productos', '/control/?t=productos'],
      ['mercado', '/control/?t=mercado&estado=todas'], ['chat', '/control/?t=chat'], ['soporte', '/control/?t=soporte&estado=todos'],
      ['caso', '/control/?t=soporte&caso=' + caso], ['ajustes', '/control/?t=ajustes'],
    ];
    for (const [nombre, ruta] of paginas) {
      res = await p.goto(base + ruta);
      // abrir los <details> (productos, tablas) para medir el peor caso
      await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
      r.paginas[nombre] = { http: res.status(), desborde: await desborde() };
      if (['resumen', 'ficha', 'compras', 'chat', 'productos', 'caso'].includes(nombre)) {
        await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = false; }));
        await p.screenshot({ path: carpeta + '/control_' + nombre + '.png', fullPage: nombre !== 'productos' });
      }
    }

    // Tocar una barra del gráfico muestra el detalle
    await p.goto(base + '/control/?t=resumen');
    const zona = p.locator('#graf-creditos rect.zona').last();
    await zona.scrollIntoViewIfNeeded();
    await zona.tap();
    r.pasos.tip = (await p.locator('#tip').isVisible()) && /Emitidos|Quemados/.test(await p.textContent('#tip'));

    // Una acción con el teclado del celular: dar 5 créditos (pide confirmación; el diálogo se acepta)
    await p.goto(base + '/control/?t=jugadores&id=' + jugador);
    await p.fill('form input[name="cambio"]', '5');
    await p.fill('form input[name="motivo"]', 'Prueba del navegador');
    await Promise.all([p.waitForNavigation(), p.click('form:has(input[name="cambio"]) button[type="submit"]')]);
    r.pasos.accion_ok = (await p.locator('#aviso.aviso-ok').count()) === 1;
    r.paginas.tras_accion = { http: 200, desborde: await desborde() };

    // Salir
    await Promise.all([p.waitForNavigation(), p.click('.barra-der button')]);
    r.pasos.salio = (await p.locator('#form-entrar').count()) === 1;
    await ctx.close();
    const todas = Object.values(r.paginas);
    r.ok = r.pasos.entro && r.pasos.tip && r.pasos.accion_ok && r.pasos.salio && todas.every((x) => x.http === 200 && x.desborde === 0) && r.errores.length === 0;
  } catch (e) {
    r.errores.push(String(e));
  }
  await nav.close();
  console.log(JSON.stringify(r));
})();
