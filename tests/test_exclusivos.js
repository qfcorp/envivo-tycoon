/* Prueba de la Edición Exclusiva en la Bodega (js/ui.js → Tienda de equipos) en un celular de 390x844 con Playwright.
   El servidor se imita aquí: /api/estado con la lista de exclusivos de server/src/Catalogo.php (PREMIUM, leída con php)
   y /api/gastar (descuenta créditos y agrega el equipo al inventario con número de serie). Casos:
     con_cuenta – cada categoría (menos alquiler) muestra arriba su exclusivo dorado con botón de créditos; los de Edición
                  Exclusiva además tienen el camino gratis (dinero del juego). Canjear el EVX XT-VIA Oro: confirma,
                  POST /api/gastar, llega a la bodega con número de serie y no se vende al desarmadero. Tienda → Exclusivos
                  los muestra todos con el marco dorado.
     poca_fama  – con 30 de fama: créditos bloqueados hasta 45 y el camino gratis hasta 75 (repeticiones).
     sin_cuenta – el botón de créditos pide crear la cuenta (abrirCuenta) con su nota.
   En todos: sin errores de JS, sin desborde horizontal, sin claves sin traducir. Capturas: tests/capturas/exclusivos_*.png
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_exclusivos.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://envivo.test';
const pagina = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

// La lista de exclusivos sale del servidor de verdad (Catalogo::PREMIUM), con el formato de Catalogo::tienda()
const PREMIUM = JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(path.join(RAIZ, 'server/src/Catalogo.php'))};
  $m = [];
  foreach (\\EnVivo\\Catalogo::PREMIUM as $id => $x) {
    $tipo = $x['tipo'] ?? ($x['entrega']['tipo'] === 'item' ? (!empty($x['vip']) ? 'vip' : 'equipo') : 'consumo');
    $m[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'creditos' => $x['creditos'], 'vip' => !empty($x['vip']), 'tipo' => $tipo, 'entrega' => $x['entrega']];
  }
  echo json_encode($m);`], { encoding: 'utf8' }));
const EQUIPOS = PREMIUM.filter((p) => p.entrega.tipo === 'item');

async function abrir(browser, caso) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-EC' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const srv = { creditos: 5000, inventario: [], gastos: [] };
  const estado = () => {
    const e = { ok: true, tienda: { productos: [], premium: PREMIUM }, logueado: caso.logueado !== false, entregas: [], inventario: srv.inventario,
      plux: { disponible: true, ambiente: 'produccion' } };
    if (e.logueado) Object.assign(e, { jugador: { id: 7, nombre: 'QF Producciones', email: 'qf@envivo.test' }, creditos: srv.creditos, vip_activo: false, regalos_pendientes: 0, servidor: { id: 1, nombre: 'Servidor 1' } });
    return e;
  };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(BASE + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (st, d) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pagina });
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/estado') return json(200, estado());
      if (u.pathname === '/api/partida') return json(200, { ok: true, datos: null });
      if (u.pathname === '/api/chat') return json(200, { ok: true, mensajes: [] });
      if (u.pathname === '/api/gastar') {
        let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) { b = null; }
        const p = PREMIUM.find((x) => b && x.id === b.item);
        if (!p) return json(404, { ok: false, error: 'Ese producto no existe.' });
        if (srv.creditos < p.creditos) return json(402, { ok: false, error: 'No te alcanzan los créditos.' });
        srv.creditos -= p.creditos;
        srv.gastos.push(p.id);
        const it = { id: 100 + srv.inventario.length, item: p.entrega.item, serie: srv.inventario.filter((x) => x.item === p.entrega.item).length + 1, origen: 'canje', estado: 'bodega', nombre: p.nombre };
        srv.inventario.push(it);
        return json(200, { ok: true, creditos: srv.creditos, item: it });
      }
      return json(404, { ok: false, error: 'No existe', codigo: 'no_existe' });
    }
    const rel = decodeURIComponent(u.pathname).replace(/^\//, '');
    const f = path.join(RAIZ, rel);
    if (f.startsWith(RAIZ) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const tipo = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(f) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { try { localStorage.setItem('envivo_guia_v1', '"hecha"'); } catch (e) { /* nada */ } });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state && window.Api && window.Api.disponible !== null, null, { timeout: 10000 });
  for (let k = 0; k < 4; k++) {
    const b = page.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"]');
    if (await b.count()) await b.first().click().catch(() => {}); else break;
    await page.waitForTimeout(150);
  }
  await page.evaluate((rep) => { const s = window.__game.state; s.rep = rep; s.money = 999999; }, caso.rep === undefined ? 99 : caso.rep);
  await page.click('nav button[data-tab="bodega"]');
  await page.waitForSelector('#tab-bodega .catrow');
  return { ctx, page, errores, srv };
}

async function categoria(page, cat) {
  await page.click(`#tab-bodega [data-act="cat"][data-k="${cat}"]`);
  await page.waitForTimeout(120);
}
// Lo que se ve arriba de la tienda de una categoría
const primeras = (page) => page.evaluate(() => {
  const grids = document.querySelectorAll('#tab-bodega .ggrid');
  const g = grids[grids.length - 1];
  return [...g.children].map((c) => ({ ex: c.classList.contains('exq'), key: c.dataset.ex || null, oro: c.classList.contains('r-exclusivo') || c.classList.contains('r-vip'),
    cred: (c.querySelector('[data-act="ex-canjear"]') || {}).textContent || null, credOff: !!(c.querySelector('[data-act="ex-canjear"]') || {}).disabled,
    libre: (c.querySelector('.ex-free') || {}).textContent || null, libreOff: !!(c.querySelector('.ex-free') || {}).disabled,
    medalla: !!c.querySelector('.itemart .ex-medalla') }));
});
async function revisarPantalla(o, nombre) {
  const r = await o.page.evaluate(() => {
    const t = document.getElementById('tab-bodega');
    const ancho = window.innerWidth;
    const fuera = [...t.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && !el.closest('.catrow') && (b.right > ancho + 0.5 || b.left < -0.5); });
    const txt = t.innerText;
    return { scroll: document.documentElement.scrollWidth - ancho, fuera: fuera.length, claves: txt.match(/\bbodega\.[a-z_]+\b/g) || [], marcas: txt.match(/\{\w+\}/g) || [] };
  });
  bien(r.scroll <= 0 && !r.fuera, `${nombre}: sin desborde horizontal a 390px`);
  bien(!r.claves.length && !r.marcas.length, `${nombre}: sin claves sin traducir` + (r.claves.length ? ' ' + r.claves.join(',') : ''));
}
async function foto(page, nombre, sel) {
  await page.evaluate((sel) => { const el = sel && document.querySelector(sel); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -64); } }, sel || null);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'exclusivos_' + nombre + '.png') });
}

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------- 1) Con cuenta: cada categoría con su exclusivo y canje con créditos ---------- */
    {
      const o = await abrir(browser, { nombre: 'con_cuenta' });
      const cats = await o.page.$$eval('#tab-bodega [data-act="cat"]', (l) => l.map((b) => b.dataset.k));
      const catDe = await o.page.evaluate(() => Object.fromEntries(Object.keys(window.Game.CATALOG).map((k) => [k, window.Game.CATALOG[k].cat])));
      const malas = [];
      for (const cat of cats) {
        await categoria(o.page, cat);
        const l = await primeras(o.page);
        const esperados = EQUIPOS.filter((p) => catDe[p.entrega.item] === cat);
        if (cat === 'service') { if (l.some((x) => x.ex)) malas.push('service con exclusivo'); continue; }
        if (!esperados.length) { malas.push(cat + ': sin equipo con créditos en el servidor'); continue; }
        const top = l.slice(0, esperados.length);
        if (!top.every((x) => x.ex && x.oro && x.cred && /\d/.test(x.cred))) malas.push(cat + ': arriba no están sus exclusivos con botón de créditos');
        for (const p of esperados) {
          const c = l.find((x) => x.key === p.entrega.item);
          if (!c || !c.cred || c.cred.replace(/\D/g, '') !== String(p.creditos)) malas.push(`${cat}: ${p.id} sin su costo (${p.creditos})`);
          if (c && /^ex_/.test(p.id) && (!c.libre || !c.medalla)) malas.push(`${cat}: ${p.id} sin camino gratis o sin medallón dorado`);
        }
        if (l.slice(esperados.length).some((x) => x.ex)) malas.push(cat + ': un exclusivo quedó abajo');
      }
      bien(!malas.length, `Bodega: ${cats.length - 1} categorías con su exclusivo dorado arriba y botón de créditos (alquiler no lleva)` + (malas.length ? ' → ' + malas.join(' | ') : ''));
      const nuevos = EQUIPOS.filter((p) => /^ex_/.test(p.id)).length;
      bien(nuevos === 14, `Servidor: 14 de Edición Exclusiva (${nuevos})`);
      await revisarPantalla(o, 'Bodega');
      // Capturas de varias categorías (la tarjeta dorada arriba)
      for (const [cat, nom] of [['replay', 'repeticiones'], ['audio', 'audio'], ['lens', 'lentes'], ['cam', 'camaras'], ['case', 'maletas']]) {
        await categoria(o.page, cat);
        await foto(o.page, nom, '#tab-bodega .exq');
      }
      // Canjear el EVX XT-VIA Oro con créditos
      await categoria(o.page, 'replay');
      await o.page.click('#tab-bodega .exq[data-ex="ex_repeticion"] [data-act="ex-canjear"]');
      await o.page.waitForSelector('#overlay.on [data-act="confirm-yes"]', { timeout: 4000 });
      const q = await o.page.$eval('#overlay.on', (el) => el.innerText);
      bien(/950/.test(q) && /EVX XT-VIA Oro/.test(q), 'Canjear: pide confirmar con el nombre y los 950 créditos');
      await foto(o.page, 'confirmar');
      await o.page.click('#overlay.on [data-act="confirm-yes"]');
      await o.page.waitForFunction(() => window.__game.state.equip.some((e) => e.type === 'ex_repeticion' && e.srvId !== undefined), null, { timeout: 6000 }).catch(() => null);
      bien(o.srv.gastos.includes('ex_repeticion') && o.srv.creditos === 5000 - 950, 'Canjear: POST /api/gastar {item: ex_repeticion} y se descuentan 950 créditos');
      const eq = await o.page.evaluate(() => window.__game.state.equip.find((e) => e.type === 'ex_repeticion'));
      bien(!!eq && eq.srvId === 100 && eq.serie === 1, 'Canjear: el equipo llega a la bodega con su número de serie');
      await o.page.click('nav button[data-tab="inicio"]'); await o.page.click('nav button[data-tab="bodega"]');
      await o.page.waitForSelector('#tab-bodega .exq-mia');
      const mia = await o.page.$eval('#tab-bodega .ggrid .exq-mia', (c) => ({ t: c.innerText, venta: [...c.querySelectorAll('button')].map((b) => [b.textContent.trim(), b.disabled]) }));
      bien(/EVX XT-VIA Oro/.test(mia.t) && /#0001/.test(mia.t) && mia.venta.some(([t, d]) => /mercado/i.test(t) && d), 'Tus equipos: marco dorado, serie #0001 y "Se revende en el mercado" (no al desarmadero)');
      await foto(o.page, 'mi_bodega', '#tab-bodega .exq-mia');
      const hc = await o.page.$eval('#hGem', (el) => el.textContent.replace(/\D/g, '')).catch(() => '');
      bien(hc === String(5000 - 950), `Cabecera: créditos actualizados (${hc})`);
      // Camino gratis: con dinero del juego (fama 99)
      await categoria(o.page, 'audio');
      await o.page.click('#tab-bodega .exq[data-ex="ex_audio"] .ex-free');
      await o.page.waitForTimeout(200);
      const aud = await o.page.evaluate(() => window.__game.state.equip.filter((e) => e.type === 'ex_audio').map((e) => e.srvId === undefined));
      bien(aud.length === 1 && aud[0], 'Gratis: el Kalrek Brío 48 Oro se compra con dinero del juego (sin créditos)');
      // Tienda → Exclusivos: todos, con marco dorado
      await o.page.click('nav button[data-tab="tienda"]');
      await o.page.waitForSelector('#tv-exclusivos', { timeout: 8000 });
      const ex = await o.page.$$eval('#tv-exclusivos [data-ex]', (l) => l.map((c) => c.dataset.ex));
      bien(ex.length === 14, `Tienda → Exclusivos: las 14 de Edición Exclusiva con marco dorado (${ex.length})`);
      await foto(o.page, 'tienda', '#tv-exclusivos [data-ex]');
      bien(!o.errores.length, 'Con cuenta: sin errores de JS' + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
      await o.ctx.close();
    }

    /* ---------- 2) Poca fama ---------- */
    {
      const o = await abrir(browser, { nombre: 'poca_fama', rep: 30 });
      await categoria(o.page, 'replay');
      const c = (await primeras(o.page)).find((x) => x.key === 'ex_repeticion');
      bien(c && c.credOff && /45/.test(c.cred) && c.libreOff && /75/.test(c.libre), 'Fama 30: créditos desde 45 y gratis desde 75 (bloqueados con su fama)' + (c ? ` [${c.cred} | ${c.libre}]` : ''));
      const m = (await primeras(o.page)).find((x) => x.key === 'ex_maletas');
      await categoria(o.page, 'case');
      const mal = (await primeras(o.page)).find((x) => x.key === 'ex_maletas');
      bien(!m && mal && !mal.credOff && !mal.libreOff, 'Fama 30: las maletas (fama 0 con créditos, 14 gratis) sí se pueden');
      await foto(o.page, 'poca_fama', '#tab-bodega .exq');
      bien(!o.errores.length, 'Poca fama: sin errores de JS' + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
      await o.ctx.close();
    }

    /* ---------- 3) Sin cuenta ---------- */
    {
      const o = await abrir(browser, { nombre: 'sin_cuenta', logueado: false });
      await categoria(o.page, 'graphics');
      const c = (await primeras(o.page)).find((x) => x.key === 'ex_graficos');
      bien(c && !c.credOff && /850/.test(c.cred), 'Sin cuenta: el exclusivo muestra su costo en créditos (850)');
      await o.page.click('#tab-bodega .exq[data-ex="ex_graficos"] [data-act="ex-canjear"]');
      await o.page.waitForSelector('#overlay.on #formCuenta', { timeout: 4000 }).catch(() => null);
      const t = await o.page.$eval('#overlay.on', (el) => el.innerText).catch(() => '');
      bien(!!(await o.page.$('#overlay.on #formCuenta[data-modo="registro"]')) && /exclusivos/.test(t), 'Sin cuenta: el botón de créditos pide crear la cuenta');
      await foto(o.page, 'sin_cuenta');
      bien(!o.errores.length, 'Sin cuenta: sin errores de JS' + (o.errores.length ? ' → ' + o.errores.slice(0, 3).join(' | ') : ''));
      await o.ctx.close();
    }
  } catch (e) {
    fallas++;
    console.error('❌ La prueba se detuvo:', e);
  } finally {
    await browser.close();
  }
  console.log(`\n${aciertos} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})();
