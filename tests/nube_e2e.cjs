/* Partida en la nube con DOS navegadores (dos contextos de Playwright) en la MISMA cuenta, contra el servidor real.
   La arranca tests/nube_e2e.sh. Reproduce lo que reportó el dueño:
   1) La computadora (A) tiene el juego abierto; en el celular (B) se entra a la cuenta, se juega y se guarda.
      A nunca había bajado ese avance y, peor, al ocultar la pestaña lo pisaba. Ahora: A intenta guardar → el servidor
      no lo deja; A vuelve a tener el foco → "Tu partida se abrió en otro dispositivo" → "Usar la partida más nueva"
      → A abre otra vez con el avance del celular, sin haber pisado nada. Luego B (ya vieja) ve el mismo aviso.
   2) Sin internet: B juega sin red (sigue funcionando y guarda en el celular), mientras tanto A avanza y guarda.
      Al volver la red, B NO pisa la nube: pregunta "¿Qué partida quieres usar?" con día/dinero/eventos de cada una.
      Si elige la suya, se sube encima (y A queda avisada); la de A no se pierde sin preguntar.
   3) Dos pestañas en el MISMO navegador: la vieja se entera (evento storage) y tampoco pisa. */
'use strict';
const { chromium } = require('playwright');
const base = process.argv[2];
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
const email = `nube${Date.now()}@prueba.ec`, clave = 'clave-segura-123';
const errores = [];

async function abrir(ctx, nombre) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(nombre + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|Failed to fetch/.test(m.text())) errores.push(nombre + ': ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return p;
}
async function cerrarVentanas(p) {
  for (let i = 0; i < 5; i++) {
    const b = p.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"], #overlay.on [data-act="confirm-yes"]');
    if (!(await b.count())) return;
    await b.first().click().catch(() => {});
    await p.waitForTimeout(150);
  }
}
const listo = (p) => p.waitForFunction(() => window.__nube && window.Api && window.Api.logueado() && window.__nube.lista != null, null, { timeout: 20000 });
const dia = (p) => p.evaluate(() => window.__game.state.day);
const resumen = (p) => p.evaluate(() => { const s = window.__game.state; return { dia: s.day, dinero: s.money, eventos: s.stats.events }; });
// Pasar días con el botón de verdad del juego (data-act="next-day": G.nextDay + save() + render)
async function jugar(p, n) {
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'next-day'; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); });
    await p.waitForTimeout(100);
    await cerrarVentanas(p);
  }
}
const subir = (p) => p.evaluate(() => window.__nube.subir());
// Lo que hay de verdad en el servidor (leído desde la página, con su sesión)
const enNube = (p) => p.evaluate(async () => { const r = await window.Api.partida(); return { rev: r.rev, dia: r.datos ? JSON.parse(r.datos).day : null, activo: r.activo && r.activo.dispositivo }; });
const avisoOtro = (p) => p.locator('#overlay.on #modal [data-nube-otro]');
const foco = (p) => p.evaluate(() => window.dispatchEvent(new Event('focus')));
async function ocultarYMostrar(p) {   // como cambiar de pestaña o apagar la pantalla y volver
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
async function usarLaMasNueva(p) {
  await Promise.all([p.waitForNavigation({ timeout: 20000 }), avisoOtro(p).locator('[data-act="partida"]').click()]);
  await p.waitForFunction(() => window.__nube && window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  await listo(p);
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-EC' });   // la computadora
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'es-EC' });   // el celular
  const A = await abrir(ctxA, 'computadora');
  const B = await abrir(ctxB, 'celular');

  console.log('1) Computadora con la pestaña abierta; se avanza en el celular');
  await A.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  await A.evaluate(async ([e, c]) => { await window.Api.registro(e, 'Productora Nube', c, { acepta_terminos: true, edad_16: true }); }, [email, clave]);
  await A.reload({ waitUntil: 'domcontentloaded' });
  await listo(A); await cerrarVentanas(A);
  await jugar(A, 1); await subir(A);
  const diaA0 = await dia(A);
  let n = await enNube(A);
  ok(n.dia === diaA0 && n.activo === (await A.evaluate(() => window.__nube.dispositivo)), `La computadora guardó su partida (día ${diaA0}, rev ${n.rev}) y es la activa`);

  await B.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await B.waitForFunction(() => window.Api && window.Api.disponible !== null, null, { timeout: 15000 });
  await B.evaluate(async ([e, c]) => { await window.Api.entrar(e, c); }, [email, clave]);
  await B.reload({ waitUntil: 'domcontentloaded' });
  await listo(B); await cerrarVentanas(B);
  ok((await dia(B)) === diaA0, `El celular abrió el juego con la partida de la computadora (día ${await dia(B)})`);
  await jugar(B, 3); await subir(B);
  const avanceB = await resumen(B);
  n = await enNube(B);
  ok(n.dia === avanceB.dia && n.dia === diaA0 + 3, `El celular avanzó y guardó (día ${n.dia}, rev ${n.rev})`);
  const revB = n.rev;

  // La pestaña vieja de la computadora intenta guardar (como hacía al ocultarla): no pisa nada
  ok((await dia(A)) === diaA0, 'La computadora todavía muestra la partida vieja (aún no volvió a la pestaña)');
  await subir(A);
  await ocultarYMostrar(A);
  n = await enNube(B);
  ok(n.dia === avanceB.dia && n.rev === revB, `La pestaña vieja intentó guardar y ocultarse: la nube sigue con el avance del celular (día ${n.dia}, rev ${n.rev})`);
  await foco(A);
  await avisoOtro(A).waitFor({ timeout: 10000 }).catch(() => {});
  ok(await avisoOtro(A).isVisible(), 'Al volver a la computadora: ventana "Tu partida se abrió en otro dispositivo"');
  ok((await avisoOtro(A).innerText()).includes('Tu partida se abrió en otro dispositivo') && (await avisoOtro(A).innerText()).includes('Usar la partida más nueva'), '…con el botón "Usar la partida más nueva"');
  ok(await A.evaluate(() => window.__nube.bloqueo === true), '…y la computadora ya no guarda nada');
  await A.screenshot({ path: 'tests/capturas/nube_01_otro_dispositivo.png' });
  await subir(A);
  ok((await enNube(B)).rev === revB, 'Con el aviso abierto, un guardado más de la computadora tampoco llega a la nube');

  await usarLaMasNueva(A);
  const tA = await A.locator('#toast').innerText().catch(() => '');
  const rA = await resumen(A);
  ok(rA.dia === avanceB.dia && rA.dinero === avanceB.dinero && rA.eventos === avanceB.eventos, `La computadora abrió otra vez con el avance del celular (día ${rA.dia}, dinero ${rA.dinero})`);
  ok(/partida más nueva/.test(tA), `…y avisa "${tA}"`);
  n = await enNube(A);
  ok(n.activo === (await A.evaluate(() => window.__nube.dispositivo)) && n.dia === avanceB.dia, 'La computadora es ahora la activa y la nube conserva el avance');
  await cerrarVentanas(A);

  await foco(B);
  await avisoOtro(B).waitFor({ timeout: 10000 }).catch(() => {});
  ok(await avisoOtro(B).isVisible(), 'Ahora el celular (vieja) ve "Tu partida se abrió en otro dispositivo"');
  await B.screenshot({ path: 'tests/capturas/nube_02_celular_aviso.png' });
  const ancho = await B.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ancho <= 1, 'El aviso cabe en el celular (sin desplazamiento horizontal)');

  console.log('2) Sin internet en el celular mientras la computadora sigue');
  await usarLaMasNueva(B);
  await cerrarVentanas(B);
  ok((await dia(B)) === avanceB.dia, 'El celular vuelve a tomar la partida (la misma, día ' + (await dia(B)) + ')');
  await ctxB.setOffline(true);
  await jugar(B, 2);
  await subir(B);
  const offB = await resumen(B);
  ok(offB.dia === avanceB.dia + 2, `Sin internet se sigue jugando (día ${offB.dia})`);
  ok(await B.evaluate(() => JSON.parse(localStorage.getItem('envivo_tycoon_save_v1')).day) === offB.dia, '…y se guarda en el celular');
  // Mientras tanto la computadora vuelve, toma la partida y avanza 1 día
  await foco(A);
  await avisoOtro(A).waitFor({ timeout: 10000 }).catch(() => {});
  ok(await avisoOtro(A).isVisible(), 'La computadora ve que el celular la había tomado');
  await usarLaMasNueva(A); await cerrarVentanas(A);
  await jugar(A, 1); await subir(A);
  const masA = await resumen(A);
  n = await enNube(A);
  ok(n.dia === avanceB.dia + 1, `La computadora avanzó y guardó (día ${n.dia}, rev ${n.rev})`);
  const revA = n.rev;
  // Vuelve la red al celular: las dos avanzaron → pregunta, no pisa
  await ctxB.setOffline(false);
  await B.evaluate(() => window.dispatchEvent(new Event('online')));
  const elegir = B.locator('#overlay.on #modal [data-act="partida"][data-k="local"]');
  await elegir.waitFor({ timeout: 10000 }).catch(() => {});
  const txt = await B.locator('#modal').innerText().catch(() => '');
  ok(await elegir.isVisible() && txt.includes('¿Qué partida quieres usar?'), 'Al volver la red: "¿Qué partida quieres usar?"');
  ok(txt.includes('Día ' + offB.dia) && txt.includes('Día ' + masA.dia), `…con el día de cada una (celular ${offB.dia}, nube ${masA.dia})`);
  ok((await enNube(A)).rev === revA, '…y mientras pregunta, la nube sigue con lo de la computadora');
  await B.screenshot({ path: 'tests/capturas/nube_03_elegir.png' });
  await elegir.click();
  await B.waitForFunction((r) => true, revA);
  await B.waitForTimeout(800);
  n = await enNube(B);
  ok(n.dia === offB.dia && n.rev === revA + 1 && n.activo === (await B.evaluate(() => window.__nube.dispositivo)), `Eligió la del celular: se subió encima de la versión que vio (día ${n.dia}, rev ${n.rev}) y el celular es el activo`);
  await foco(A);
  await avisoOtro(A).waitFor({ timeout: 10000 }).catch(() => {});
  ok(await avisoOtro(A).isVisible(), 'La computadora queda avisada (no pisa lo que se eligió)');
  ok((await enNube(B)).dia === offB.dia, 'La nube conserva la partida elegida');

  console.log('3) Dos pestañas en el mismo navegador');
  await usarLaMasNueva(A); await cerrarVentanas(A);
  const A2 = await abrir(ctxA, 'computadora pestaña 2');
  await A2.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await listo(A2); await cerrarVentanas(A2);
  await jugar(A2, 1); await subir(A2);
  const d2 = await dia(A2);
  await A.waitForTimeout(500);
  await subir(A);
  ok((await enNube(A2)).dia === d2, `La pestaña nueva guardó (día ${d2}) y la vieja no la pisó`);
  await foco(A);
  await avisoOtro(A).waitFor({ timeout: 10000 }).catch(() => {});
  ok(await avisoOtro(A).isVisible(), 'La pestaña vieja muestra el aviso');

  ok(errores.length === 0, 'Sin errores en las páginas' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();
  if (fallas) { console.error(`\n❌ ${fallas} fallas`); process.exit(1); }
  console.log('\n✅ Partida en la nube con dos dispositivos OK');
})().catch((e) => { console.error('❌', e); process.exit(1); });
