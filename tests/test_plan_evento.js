/* Prueba del módulo js/plan_evento.js (plan de personal, plan de cámaras, contrato internacional, chips de riesgo).
   Abre una página en blanco con los estilos de index.html + js/art.js + js/plan_evento.js,
   dibuja cada tipo de lugar con planes de ejemplo (completo, con poca gente, posiciones vacías)
   en 390x844 y 360px, y revisa: sin errores, sin desplazamiento horizontal, número de elementos SVG.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_plan_evento.js
   Guarda capturas en tests/capturas/plan_*.png */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outDir = path.join(__dirname, 'capturas');
fs.mkdirSync(outDir, { recursive: true });

// Estilos de index.html (las variables de color y la base)
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const style = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const datos = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'eventos_y_personal.json'), 'utf8'));

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- Planes de ejemplo ---------- */
const NOMBRES = ['Kevin Guamán', 'Andrea Pazmiño', 'Luis Toapanta', 'María José Lema', 'Bryan Cedeño', 'Gaby Ortiz', 'Carlos Quishpe', 'Daniela Salazar',
  'Jonathan Zambrano', 'Paola Villacís', 'Stalin Morales', 'Mishell Andrade', 'Fernando Tenorio', 'Karla Chiluisa', 'Diego Lema', 'Tania Ortiz'];
const SUELDO = { director: 110, productor: 90, camarografo: 60, operador_ptz: 70, cablero: 40, sonidista: 70, microfonista: 50, operador_repeticion: 90,
  operador_graficos: 60, shader: 110, tecnico_transmision: 80, piloto_dron: 90, coordinador_piso: 60, runner: 35 };
const ROLE_AV = { director: 'dir', camarografo: 'cam', sonidista: 'audio', tecnico_transmision: 'stream', cablero: 'cablero', microfonista: 'boom',
  operador_repeticion: 'replay', operador_graficos: 'graficos', shader: 'shader', piloto_dron: 'dron', productor: 'productor', operador_ptz: 'cam', coordinador_piso: 'productor', runner: 'cablero' };
const SI_FALTA = Object.fromEntries(datos.roles.map((r) => [r.key, r.si_falta]));

// modo: 'full' | 'under' (algunos roles en falta/justo) | 'empty' (casi nadie)
function crew(evKey, modo) {
  const ev = datos.eventos.find((e) => e.key === evKey);
  let n = 0, wages = 0, ideal = 0;
  const roles = {};
  const keys = Object.keys(ev.personal).filter((k) => ev.personal[k].ideal > 0 || ev.personal[k].min > 0);
  keys.forEach((k, i) => {
    const { min, ideal: id } = ev.personal[k];
    let a = id;
    if (modo === 'under') a = i % 3 === 0 ? Math.max(0, min - 1) : i % 3 === 1 ? min : id;
    if (modo === 'under' && (k === 'cablero' || k === 'operador_graficos')) a = 0;
    if (modo === 'empty') a = k === 'camarografo' ? Math.max(1, min - 1) : k === 'director' ? 1 : 0;
    a = Math.max(0, Math.min(a, id + (modo === 'full' && k === 'camarografo' ? 0 : 0)));
    const personas = Array.from({ length: a }, () => ({ name: NOMBRES[n++ % NOMBRES.length], role: ROLE_AV[k] || k }));
    const estado = a < min ? 'falta' : a < id ? 'justo' : 'completo';
    wages += a * SUELDO[k]; ideal += id * SUELDO[k];
    roles[k] = { min, ideal: id, asignados: a, personas, estado, riesgo: estado === 'falta' ? 0.35 : estado === 'justo' ? 0.15 : 0.05, si_falta: SI_FALTA[k] };
  });
  return { roles, wages, idealWages: ideal, savings: ideal - wages };
}

const CAMS = ['Zony HDC-3500 + Fujinox 86x', 'Zony PXW-Z280', 'Kanon XF605', 'Panasonika AG-CX350', 'Blackmagia URSA Broadcast G2', 'Panasonika AW-UE160 (PTZ)',
  'Zony FX6 en gimbal', 'Handycam Zony AX43', 'DJ-Air 3 (dron)', 'Kanon XA65', 'GoPro-ish Hero 12', 'Zony HDC-P50'];
function cams(evKey, modo, PE) {
  const pos = PE.posiciones(evKey);
  return {
    positions: pos.map((p, i) => {
      let aj = [0.95, 0.85, 0.7, 0.9, 0.55, 0.3, 1, 0.82, 0.6, 0.45][i % 10];
      let asg = CAMS[i % CAMS.length];
      if (modo === 'empty' && i >= Math.ceil(pos.length / 2)) asg = null;
      if (modo === 'under' && i % 4 === 3) asg = null;
      if (modo === 'full') aj = Math.max(aj, 0.8);
      return Object.assign({}, p, { asignado: asg, ajuste: asg ? aj : null });
    }),
  };
}

const INTL = {
  id: 77, type: 'internacional_unilateral', client: 'Canal Deportes Plus (Argentina)', pay: 9800,
  internacional: {
    pais: 'Argentina (cliente) · Quito', mult: 2.5, travelDays: 0, travelCost: 650, repRisk: 12,
    requisitos: [
      { texto: 'Acreditación del torneo para cada persona', ok: true },
      { texto: '2-3 cámaras broadcast de hombro con lente 4K', ok: true },
      { texto: 'Diademas de comentarista', ok: false, detalle: 'Cómpralas en Bodega' },
      { texto: 'Enlace propio: bonding de 8 módems o satélite', ok: false },
      { texto: 'Al menos 1 productor y 1 camarógrafo de nivel Internacional', ok: true },
      'Factura al exterior y pago en 30 días',
    ],
  },
};
const INTL2 = { id: 78, type: 'concierto', client: 'Gira "Luz del Sur" 2026', pay: 14500, internacional: { pais: 'Colombia (Bogotá)', mult: 4, travelDays: 2, travelCost: 2300,
  nombre: 'Evento en país vecino con equipo propio', requisitos: [{ texto: 'Permiso aduanero de exportación temporal', ok: true }, { texto: 'Personal con pasaporte', ok: true },
    { texto: 'Nivel Internacional en jefaturas', ok: true }, { texto: 'Flete y seguro del equipo', ok: true }] } };

/* Escenarios: [archivo, tipo de evento, modo crew, modo cámaras, contrato internacional?] */
const CASOS = [
  ['ligapro', 'ligapro', 'full', 'full'],
  ['ligapro_poca_gente', 'ligapro', 'under', 'under'],
  ['final', 'final', 'under', 'full'],
  ['barrial', 'barrial', 'empty', 'empty'],
  ['boxeo', 'boxeo', 'under', 'under'],
  ['lucha_libre', 'lucha_libre', 'full', 'full'],
  ['concierto', 'concierto', 'under', 'under'],
  ['misa', 'misa', 'full', 'full'],
  ['funeral', 'funeral', 'empty', 'empty'],
  ['boda', 'boda', 'under', 'under'],
  ['graduacion', 'graduacion', 'full', 'under'],
  ['prensa', 'prensa', 'full', 'full'],
  ['lanzamiento', 'lanzamiento', 'under', 'full'],
  ['autos', 'lanzamiento_autos', 'under', 'under'],
  ['irl', 'irl', 'empty', 'under'],
  ['internacional', 'internacional_unilateral', 'full', 'full', INTL],
  ['host', 'internacional_host', 'under', 'under'],
];

(async () => {
  const browser = await chromium.launch();
  const errores = [];
  for (const width of [390, 360]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(`[${width}] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_/.test(m.text())) errores.push(`[${width}] console: ${m.text()}`); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}
      <style>body{padding:12px 0 24px}.wrap{display:grid;gap:12px}</style></head><body><main class="gut wrap" id="app"></main></body></html>`);
    await page.addScriptTag({ path: path.join(root, 'js', 'art.js') });
    await page.addScriptTag({ path: path.join(root, 'js', 'plan_evento.js') });
    ok(await page.evaluate(() => !!(window.PlanEvento && document.getElementById('plan-evento-css'))), `[${width}] PlanEvento cargado y estilos inyectados`);

    // Pasamos los generadores a la página
    await page.exposeFunction('noop', () => 0);
    for (const [file, ev, mCrew, mCam, intl] of CASOS) {
      const PEnode = { posiciones: (t) => [] };
      const pos = await page.evaluate((t) => window.PlanEvento.posiciones(t), ev);
      PEnode.posiciones = () => pos;
      const crewPlan = crew(ev, mCrew);
      const camPlan = cams(ev, mCam, PEnode);
      const res = await page.evaluate(({ crewPlan, camPlan, ev, intl }) => {
        const PE = window.PlanEvento;
        const app = document.getElementById('app');
        app.innerHTML = (intl ? PE.internacional(intl) : '') + PE.camaras(camPlan, ev) + PE.personal(crewPlan) + PE.resumenRiesgo(crewPlan, { camaras: camPlan, tipo: ev });
        const svg = app.querySelector('.pe-dia');
        const r = svg ? svg.getBoundingClientRect() : { width: 0 };
        return {
          svgEls: svg ? svg.querySelectorAll('*').length : 0,
          filtros: svg ? svg.querySelectorAll('filter').length : 0,
          marcadores: svg ? svg.querySelectorAll('.pe-cam').length : 0,
          posiciones: camPlan.positions.length,
          filas: app.querySelectorAll('.pe-row').length,
          chips: app.querySelectorAll('.pe-rc').length,
          intl: app.querySelectorAll('.pe-intl').length,
          ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          svgW: r.width, appW: app.clientWidth,
          // Cada marcador dentro del viewBox
          fuera: svg ? [...svg.querySelectorAll('.pe-dot')].filter((d) => { const b = d.getBoundingClientRect(); return b.left < r.left - 0.5 || b.top < r.top - 0.5 || b.right > r.right + 0.5 || b.bottom > r.bottom + 0.5; }).length : -1,
          // Textos de la tabla que se cortan a lo ancho (desbordan su celda)
          desborde: [...app.querySelectorAll('.pe-row, .pe-clr, .pe-ft, .pe-rc, .pe-chip')].filter((e) => e.scrollWidth > e.clientWidth + 1).length,
        };
      }, { crewPlan, camPlan, ev, intl: intl || null });
      const tag = `[${width}] ${file}`;
      ok(res.svgEls > 0 && res.svgEls < 300, `${tag}: plano con ${res.svgEls} elementos SVG (< 300)`);
      ok(res.filtros === 0, `${tag}: sin filtros SVG`);
      ok(res.marcadores === res.posiciones, `${tag}: ${res.marcadores} marcadores para ${res.posiciones} posiciones`);
      ok(res.fuera === 0, `${tag}: todos los marcadores dentro del plano`);
      ok(res.ovf <= 0 && res.svgW <= res.appW + 0.5, `${tag}: sin desplazamiento horizontal (sobra ${res.ovf}px, svg ${Math.round(res.svgW)}/${res.appW})`);
      ok(res.desborde === 0, `${tag}: ningún texto se sale de su fila`);
      ok(res.filas > 0 && res.chips > 0, `${tag}: ${res.filas} roles y ${res.chips} chips de riesgo`);
      if (intl) ok(res.intl === 1, `${tag}: tarjeta internacional`);
      await page.screenshot({ path: path.join(outDir, `plan_${file}${width === 360 ? '_360' : ''}.png`), fullPage: true });
    }

    // Tocar una cámara muestra qué cámara va
    await page.evaluate(({ c }) => { document.getElementById('app').innerHTML = window.PlanEvento.camaras(c, 'ligapro'); }, { c: cams('ligapro', 'under', { posiciones: () => [] }) });
    const tocar = await page.evaluate(() => {
      const PE = window.PlanEvento;
      const plan = { positions: PE.posiciones('ligapro').map((p, i) => Object.assign(p, { asignado: i === 1 ? 'Zony HDC-3500 + Fujinox 86x' : null, ajuste: i === 1 ? 0.9 : null })) };
      document.getElementById('app').innerHTML = PE.camaras(plan, 'ligapro');
      return true;
    });
    await page.locator('.pe-cam[data-pe-cam="2"]').dispatchEvent('click');
    const det = await page.locator('.pe-det').textContent();
    ok(tocar && /Zony HDC-3500/.test(det) && /Cámara 2/.test(det), `[${width}] tocar la cámara 2 muestra la cámara asignada ("${det.slice(0, 60)}…")`);
    const sel = await page.locator('.pe-sel').count();
    ok(sel === 2, `[${width}] se resalta en el plano y en la lista (${sel})`);
    const title = await page.locator('.pe-cam[data-pe-cam="2"] title').textContent();
    ok(/Zony HDC-3500/.test(title), `[${width}] el título (hover) dice la cámara asignada`);
    if (width === 390) await page.screenshot({ path: path.join(outDir, 'plan_tocar.png'), fullPage: true });

    // Tolerancia: datos que faltan o raros no rompen
    const tol = await page.evaluate(() => {
      const PE = window.PlanEvento;
      const out = [PE.personal(null), PE.personal({}), PE.personal({ roles: [{ key: 'cablero' }] }), PE.camaras(null, 'boxeo'), PE.camaras({ positions: [] }, 'xx_desconocido'),
        PE.camaras({ positions: [{ key: 'rara', nombre: 'Posición inventada', asignado: 5, ajuste: 70 }] }, 'concierto'),
        PE.internacional(null), PE.internacional({ type: 'boda' }), PE.internacional({ internacional: true, pay: 1000 }), PE.resumenRiesgo(null), PE.resumenRiesgo({ roles: {} }),
        PE.personal({ roles: { cam: { min: 2, ideal: 3, asignados: 1 }, dir: { min: 1, ideal: 1, asignados: 1 } }, wages: 200, savings: 150 })];
      return { tipos: out.map((x) => typeof x), boxeo: (out[3].match(/pe-cam /g) || []).length, intlBoda: out[7], intlMin: out[8].length > 0,
        alias: /Camarógrafo/.test(out[11]) && /Ahorras \$150/.test(out[11]) && /pe-e-falta/.test(out[11]), rara: /pe-k-bad|pe-k-mid/.test(out[5]) };
    });
    ok(tol.tipos.every((t) => t === 'string'), `[${width}] datos faltantes: siempre devuelve texto`);
    ok(tol.boxeo === 6, `[${width}] sin plan usa las posiciones del evento (boxeo: ${tol.boxeo})`);
    ok(tol.intlBoda === '' && tol.intlMin, `[${width}] tarjeta internacional solo para contratos internacionales`);
    ok(tol.alias, `[${width}] acepta claves cortas (cam, dir), suma ahorro y semáforo`);
    ok(tol.rara, `[${width}] ajuste en porcentaje (70) se entiende como 0,7`);

    // I18N: si existe, se usa
    const i18n = await page.evaluate(() => {
      const T = (k) => (k === 'pe.personal' ? 'Crew' : k); T.has = (k) => k === 'pe.personal';
      window.I18N = { T };
      const h = window.PlanEvento.personal({ roles: { director: { min: 1, ideal: 1, asignados: 1 } } });
      delete window.I18N;
      return /Crew/.test(h) && /Realizador/.test(h);
    });
    ok(i18n, `[${width}] usa I18N.T cuando existe y el español para lo demás`);
    await ctx.close();
  }

  // Resumen y tarjeta internacional a 390 en una sola captura
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}<style>body{padding:12px 0}.wrap{display:grid;gap:12px}</style></head><body><main class="gut wrap" id="app"></main></body></html>`);
  await page.addScriptTag({ path: path.join(root, 'js', 'art.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'plan_evento.js') });
  await page.evaluate(({ a, b, c1, c2 }) => {
    const PE = window.PlanEvento;
    document.getElementById('app').innerHTML = PE.internacional(a) + PE.internacional(b) + '<div class="card"><h3>Resultado</h3>' + PE.resumenRiesgo(c1) + PE.resumenRiesgo(c2) + '</div>';
  }, { a: INTL, b: INTL2, c1: crew('ligapro', 'under'), c2: crew('misa', 'full') });
  await page.screenshot({ path: path.join(outDir, 'plan_tarjetas.png'), fullPage: true });
  await ctx.close();
  await browser.close();

  errores.forEach((e) => console.log('  ✘ ' + e));
  if (errores.length) fallas += errores.length;
  console.log(fallas ? `\n❌ ${fallas} falla(s)` : '\n✅ Plan del evento OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
